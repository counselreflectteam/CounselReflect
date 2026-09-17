"""
The four endpoint-backed classifier metrics must require a VERIFIED
Hugging Face key: they spend the server's HF endpoint budget, and a
presence-only check let any non-empty string through.
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from utils import hf_identity


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("COUNSELREFLECT_ACCESS_TOKEN", "")
    with hf_identity._cache_lock:
        hf_identity._cache.clear()
    return TestClient(app)


def _request(**overrides):
    return {
        "conversation": [
            {"speaker": "Therapist", "text": "Hello."},
            {"speaker": "Patient", "text": "Hi."},
        ],
        "metrics": ["talk_type"],
        "provider": "openai",
        "model": "gpt-4.1",
        "api_key": "test-key",
        **overrides,
    }


EVALUATE = "/predefined_metrics/evaluate"


def test_endpoint_metric_without_hf_key_is_rejected(client, monkeypatch):
    monkeypatch.delenv("COUNSELREFLECT_ALLOW_SERVER_KEYS", raising=False)
    response = client.post(EVALUATE, json=_request())
    assert response.status_code == 400
    assert "Hugging Face API key" in response.json()["detail"]


def test_endpoint_metric_with_unverifiable_key_is_rejected(client, monkeypatch):
    monkeypatch.setattr(hf_identity, "_whoami_ok", lambda key: False)
    response = client.post(EVALUATE, json=_request(huggingface_api_key="hf_fake"))
    assert response.status_code == 400
    assert "could not be verified" in response.json()["detail"]


def test_verified_key_passes_gate(client, monkeypatch):
    calls = []

    def fake_whoami(key):
        calls.append(key)
        return True

    monkeypatch.setattr(hf_identity, "_whoami_ok", fake_whoami)
    monkeypatch.delenv("TALK_TYPE_ENDPOINT_URL", raising=False)
    # Passes the identity gate, then fails later on the unconfigured endpoint
    # (a per-metric error, not a 400) — proving the gate itself let it through.
    response = client.post(EVALUATE, json=_request(huggingface_api_key="hf_good"))
    assert response.status_code == 200
    assert calls == ["hf_good"]

    # Second request hits the verification cache: no new whoami call.
    client.post(EVALUATE, json=_request(huggingface_api_key="hf_good"))
    assert calls == ["hf_good"]


def test_llm_only_metrics_skip_the_gate(client, monkeypatch):
    def boom(key):  # pragma: no cover - must not be called
        raise AssertionError("whoami should not be called for LLM-only metrics")

    monkeypatch.setattr(hf_identity, "_whoami_ok", boom)
    response = client.post(EVALUATE, json=_request(metrics=["empathy_er"]))
    # No HF requirement for non-endpoint metrics; request proceeds past the gate.
    assert response.status_code == 200

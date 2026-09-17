"""
Regression tests for the server-side key policy and access-gate hardening.

Covers:
- COUNSELREFLECT_ALLOW_SERVER_KEYS gating of /models/server-keys-status
- no server-key fallback for evaluation requests when the flag is off
- access-code rate limiting that never locks out a correct code
"""
import pytest
from fastapi.testclient import TestClient

import main
from main import app

EVALUATE_PATH = "/predefined_metrics/evaluate"
STATUS_PATH = "/models/server-keys-status"
VERIFY_PATH = "/access/verify"


@pytest.fixture
def client(monkeypatch):
    """Client with the access gate off and a clean limiter."""
    monkeypatch.setenv("COUNSELREFLECT_ACCESS_TOKEN", "")
    main._failed_attempts.clear()
    return TestClient(app)


@pytest.fixture
def gated_client(monkeypatch):
    """Client with the access gate armed and a clean limiter."""
    monkeypatch.setenv("COUNSELREFLECT_ACCESS_TOKEN", "correct-code-123")
    main._failed_attempts.clear()
    return TestClient(app)


class TestServerKeysStatus:
    def test_all_false_when_flag_off(self, client, monkeypatch):
        monkeypatch.delenv("COUNSELREFLECT_ALLOW_SERVER_KEYS", raising=False)
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("HF_TOKEN", "hf_test")

        assert client.get(STATUS_PATH).json() == {
            "openai": False, "gemini": False, "claude": False, "hf": False
        }

    def test_reports_keys_when_flag_on(self, client, monkeypatch):
        monkeypatch.setenv("COUNSELREFLECT_ALLOW_SERVER_KEYS", "true")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)

        data = client.get(STATUS_PATH).json()
        assert data["openai"] is True
        assert data["gemini"] is False


class TestNoServerKeyFallback:
    CONVERSATION = [
        {"speaker": "Therapist", "text": "Hello."},
        {"speaker": "Patient", "text": "Hi."},
    ]

    def test_evaluate_without_key_is_400_despite_server_key(self, client, monkeypatch):
        monkeypatch.delenv("COUNSELREFLECT_ALLOW_SERVER_KEYS", raising=False)
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

        response = client.post(EVALUATE_PATH, json={
            "conversation": self.CONVERSATION,
            "metrics": ["talk_type"],
            "provider": "openai",
            "model": "gpt-4.1",
        })
        assert response.status_code == 400
        assert "Provide your own key" in response.json()["detail"]


class TestAccessRateLimit:
    def test_wrong_codes_escalate_to_429_but_correct_code_always_passes(self, gated_client):
        for _ in range(10):
            assert gated_client.post(VERIFY_PATH, json={"access_token": "WRONG"}).status_code == 403
        assert gated_client.post(VERIFY_PATH, json={"access_token": "WRONG"}).status_code == 429

        # A correct code must never be locked out, even with a full bucket.
        assert gated_client.post(VERIFY_PATH, json={"access_token": "correct-code-123"}).status_code == 200

        # Success clears the caller's bucket.
        assert gated_client.post(VERIFY_PATH, json={"access_token": "WRONG"}).status_code == 403

    def test_correct_header_passes_with_full_bucket(self, gated_client):
        for _ in range(12):
            gated_client.post(VERIFY_PATH, json={"access_token": "WRONG"})
        response = gated_client.get("/", headers={"x-counselreflect-access": "correct-code-123"})
        assert response.status_code == 200

    def test_headerless_requests_do_not_fill_the_bucket(self, gated_client):
        for _ in range(15):
            assert gated_client.get("/").status_code == 403
        assert main._failed_attempts == {}

    def test_empty_verify_attempts_do_not_fill_the_bucket(self, gated_client):
        for _ in range(15):
            assert gated_client.post(VERIFY_PATH, json={"access_token": ""}).status_code == 403
        assert main._failed_attempts == {}

"""
Abuse-resistance regressions for the public API: input caps, body-size
limit, and the global evaluation concurrency gate.
"""
import threading

import pytest
from fastapi.testclient import TestClient

import main
from main import app
from schemas import MAX_CONVERSATION_TURNS, MAX_TURN_TEXT_CHARS
from utils import capacity

EVALUATE_PATH = "/predefined_metrics/evaluate"
STREAM_PATH = "/predefined_metrics/evaluate/stream"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("COUNSELREFLECT_ACCESS_TOKEN", "")
    return TestClient(app)


def _request(conversation):
    return {
        "conversation": conversation,
        "metrics": ["talk_type"],
        "provider": "openai",
        "model": "gpt-4.1",
        "api_key": "test-key",
    }


def _turns(n, text="hello"):
    return [
        {"speaker": "Therapist" if i % 2 == 0 else "Patient", "text": text}
        for i in range(n)
    ]


class TestInputCaps:
    def test_too_many_turns_rejected(self, client):
        response = client.post(EVALUATE_PATH, json=_request(_turns(MAX_CONVERSATION_TURNS + 1)))
        assert response.status_code == 422
        assert str(MAX_CONVERSATION_TURNS) in response.text

    def test_max_turns_accepted_by_validation(self, client):
        # Prove the validator passes at exactly the cap. The unknown metric
        # makes the route 400 right after validation, so no evaluator runs.
        payload = _request(_turns(MAX_CONVERSATION_TURNS))
        payload["metrics"] = ["not_a_real_metric"]
        response = client.post(EVALUATE_PATH, json=payload)
        assert response.status_code == 400
        assert "Invalid metrics" in response.json()["detail"]

    def test_oversized_turn_rejected(self, client):
        conversation = _turns(2)
        conversation[1]["text"] = "x" * (MAX_TURN_TEXT_CHARS + 1)
        response = client.post(EVALUATE_PATH, json=_request(conversation))
        assert response.status_code == 422
        assert str(MAX_TURN_TEXT_CHARS) in response.text


class TestBodySizeLimit:
    def test_oversized_body_rejected(self, client):
        payload = b'{"access_token": "' + b"x" * (main.MAX_REQUEST_BODY_BYTES + 1024) + b'"}'
        response = client.post(
            "/access/verify",
            content=payload,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 413

    def test_normal_body_passes(self, client):
        response = client.post("/access/verify", json={"access_token": ""})
        assert response.status_code == 200


class TestConcurrencyGate:
    def test_evaluate_returns_429_when_full(self, client, monkeypatch):
        gate = threading.BoundedSemaphore(1)
        monkeypatch.setattr(capacity, "_slots", gate)
        assert gate.acquire(blocking=False)
        try:
            response = client.post(EVALUATE_PATH, json=_request(_turns(2)))
            assert response.status_code == 429
            assert response.json()["detail"] == capacity.SERVER_BUSY_DETAIL
            assert response.headers.get("retry-after") == capacity.RETRY_AFTER_SECONDS
        finally:
            gate.release()

    def test_stream_returns_429_when_full(self, client, monkeypatch):
        # The stream path validates the request (including the HF identity
        # gate) BEFORE taking a slot, so give it a passing key.
        from utils import hf_identity
        monkeypatch.setattr(hf_identity, "_whoami_ok", lambda key: True)
        gate = threading.BoundedSemaphore(1)
        monkeypatch.setattr(capacity, "_slots", gate)
        assert gate.acquire(blocking=False)
        try:
            payload = _request(_turns(2))
            payload["huggingface_api_key"] = "hf_test-key"
            response = client.post(STREAM_PATH, json=payload)
            assert response.status_code == 429
        finally:
            gate.release()

    def test_slot_released_after_request(self, client, monkeypatch):
        gate = threading.BoundedSemaphore(1)
        monkeypatch.setattr(capacity, "_slots", gate)
        # Request runs (and fails on business logic), but must release the slot.
        client.post(EVALUATE_PATH, json=_request(_turns(2)))
        assert gate.acquire(blocking=False), "evaluation slot was not released"
        gate.release()


class TestRunSharedSlots:
    """Phases of one evaluation run (same run_id) must share one slot."""

    def test_same_run_shares_one_slot(self, monkeypatch):
        monkeypatch.setattr(capacity, "_slots", threading.BoundedSemaphore(1))
        monkeypatch.setattr(capacity, "_run_refcounts", {})

        capacity.acquire_evaluation_slot("run-aaaa-1111")
        # Second phase of the same run: no free slot left, but must not 429.
        capacity.acquire_evaluation_slot("run-aaaa-1111")

        # A different run is genuinely out of capacity.
        with pytest.raises(Exception) as exc:
            capacity.acquire_evaluation_slot("run-bbbb-2222")
        assert getattr(exc.value, "status_code", None) == 429

        # Releasing one phase keeps the run's slot; releasing the last frees it.
        capacity.release_evaluation_slot("run-aaaa-1111")
        with pytest.raises(Exception):
            capacity.acquire_evaluation_slot("run-bbbb-2222")
        capacity.release_evaluation_slot("run-aaaa-1111")
        capacity.acquire_evaluation_slot("run-bbbb-2222")
        capacity.release_evaluation_slot("run-bbbb-2222")
        assert capacity._run_refcounts == {}

    def test_endpoint_with_held_run_id_is_not_blocked(self, client, monkeypatch):
        monkeypatch.setattr(capacity, "_slots", threading.BoundedSemaphore(1))
        monkeypatch.setattr(capacity, "_run_refcounts", {})
        run_id = "run-cccc-3333"
        capacity.acquire_evaluation_slot(run_id)
        try:
            payload = _request(_turns(2))
            payload["run_id"] = run_id
            payload["metrics"] = ["not_a_real_metric"]
            response = client.post(EVALUATE_PATH, json=payload)
            # Passes the gate (shared slot) and fails on metric validation.
            assert response.status_code == 400
        finally:
            capacity.release_evaluation_slot(run_id)
        assert capacity._run_refcounts == {}

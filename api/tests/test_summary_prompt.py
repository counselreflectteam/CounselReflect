"""
Summary-prompt regressions: examples must come from metrics that actually
ran, the no-scores case must forbid score talk instead of demanding it,
the LLM call must carry max_tokens, and JSON parsing must tolerate prose
and fence variants around the object.
"""
import json

import pytest
from fastapi.testclient import TestClient

from main import app
from providers.registry import ProviderRegistry
from summary.routes import _extract_json_object

GENERATE = "/summary/generate"

CANNED = json.dumps({
    "overall_performance": "ok",
    "strengths": ["s"],
    "areas_for_improvement": ["a"],
    "key_insights": [],
})


class _StubProvider:
    def __init__(self):
        self.calls = []

    def chat_completion(self, messages, model, temperature, max_tokens=None, **kwargs):
        self.calls.append({"messages": messages, "max_tokens": max_tokens})
        return CANNED


@pytest.fixture
def stub(monkeypatch):
    monkeypatch.setenv("COUNSELREFLECT_ACCESS_TOKEN", "")
    provider = _StubProvider()
    monkeypatch.setattr(ProviderRegistry, "get_provider", classmethod(lambda cls, p, k: provider))
    return provider


@pytest.fixture
def client(stub):
    return TestClient(app)


def _payload(evaluation_results):
    return {
        "conversation": [
            {"speaker": "Therapist", "text": "How are you feeling?"},
            {"speaker": "Patient", "text": "Anxious about work."},
        ],
        "evaluation_results": evaluation_results,
        "provider": "openai",
        "model": "gpt-4o",
        "api_key": "test-key",
    }


class TestPromptVariants:
    def test_no_scores_forbids_score_talk(self, client, stub):
        response = client.post(GENERATE, json=_payload({"overallScores": {}, "utteranceScores": []}))
        assert response.status_code == 200
        prompt = stub.calls[0]["messages"][1]["content"]
        assert "NO SCORES AVAILABLE" in prompt
        assert "fact_score: 0.4/1" not in prompt
        assert "empathy: 4.2/5" not in prompt
        assert "never invent any" in prompt

    def test_examples_come_from_real_metrics(self, client, stub):
        results = {
            "overallScores": {
                "active_listening": {"type": "numerical", "value": 4.2, "max_value": 5},
            },
            "utteranceScores": [],
        }
        response = client.post(GENERATE, json=_payload(results))
        assert response.status_code == 200
        prompt = stub.calls[0]["messages"][1]["content"]
        assert "active_listening: 4.20/5" in prompt
        # The old hardcoded examples must never reappear for metrics that didn't run.
        assert "fact_score" not in prompt

    def test_max_tokens_is_set(self, client, stub):
        client.post(GENERATE, json=_payload({"overallScores": {}, "utteranceScores": []}))
        assert stub.calls[0]["max_tokens"] == 2048


class TestJsonExtraction:
    def test_plain_json(self):
        assert _extract_json_object('{"a": 1}') == {"a": 1}

    def test_standard_fence(self):
        assert _extract_json_object('```json\n{"a": 1}\n```') == {"a": 1}

    def test_uppercase_fence_with_prose(self):
        text = 'Here is the analysis:\n```JSON\n{"a": 1}\n```\nHope this helps!'
        assert _extract_json_object(text) == {"a": 1}

    def test_bare_object_with_prose(self):
        text = 'Sure! {"a": {"b": 2}} — let me know if you need more.'
        assert _extract_json_object(text) == {"a": {"b": 2}}

    def test_garbage_raises(self):
        with pytest.raises(json.JSONDecodeError):
            _extract_json_object("no json here at all")

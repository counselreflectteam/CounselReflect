"""
RECCON must refuse to run without emotion inference rather than silently
stamping every utterance "neutral" (wrong-but-plausible research data).
"""
import pytest

from evaluators import create_evaluator


def test_reccon_without_hf_key_raises_clear_error(monkeypatch):
    monkeypatch.setenv("RECCON_ENDPOINT_URL", "https://example.endpoints.huggingface.cloud")
    monkeypatch.delenv("COUNSELREFLECT_ALLOW_SERVER_KEYS", raising=False)

    with pytest.raises(ValueError, match="Hugging Face API key"):
        create_evaluator("reccon", model_config={
            "provider": "openai",
            "model": "gpt-4.1",
            "api_key": "test-key",
            "huggingface_api_key": None,
        })


def test_reccon_with_hf_key_constructs(monkeypatch):
    monkeypatch.setenv("RECCON_ENDPOINT_URL", "https://example.endpoints.huggingface.cloud")

    evaluator = create_evaluator("reccon", model_config={
        "provider": "openai",
        "model": "gpt-4.1",
        "api_key": "test-key",
        "huggingface_api_key": "hf_test-token",
    })
    assert evaluator is not None
    assert evaluator.emotion_evaluator is not None

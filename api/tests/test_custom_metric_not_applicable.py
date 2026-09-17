import pytest

from customizePipeline.metrics_service import score_conversation_with_profile
from customizePipeline.models import MetricDefinition, Profile, RefinedMetrics


def _profile(metric: MetricDefinition) -> Profile:
    return Profile(
        version="v1",
        refined_metrics=RefinedMetrics(version="v1", metrics=[metric]),
        user_preferences={},
        canonical_examples=[],
    )


def _mock_scores(monkeypatch, values):
    utterance_scores = {
        str(index): {
            "metrics": {
                "Test metric": {
                    "value": value,
                    "rationale": f"Reason for {value}",
                }
            }
        }
        for index, value in enumerate(values)
    }
    monkeypatch.setattr(
        "customizePipeline.metrics_service.chat_json",
        lambda *args, **kwargs: {
            "utterance_scores": utterance_scores,
            "overall_summary": "Summary",
        },
    )


def test_numerical_na_is_preserved_and_excluded_from_average(monkeypatch):
    _mock_scores(monkeypatch, ["N/A", 4])
    metric = MetricDefinition(
        name="Test metric",
        description="Test",
        scale="0-5 integer",
        guidance="Test",
        examples=[],
        target="therapist",
        allow_not_applicable=True,
    )

    result = score_conversation_with_profile(
        [
            {"role": "assistant", "content": "Not applicable"},
            {"role": "assistant", "content": "Applicable"},
        ],
        _profile(metric),
    )["results"]["Test metric"]

    assert result["per_utterance"][0]["metrics"]["Test metric"]["value"] == -1
    assert result["overall"]["value"] == 4


def test_categorical_na_is_preserved_and_excluded_from_mode(monkeypatch):
    _mock_scores(monkeypatch, ["not applicable", "Present"])
    metric = MetricDefinition(
        name="Test metric",
        description="Test",
        scale="enum{Absent|Present}",
        guidance="Test",
        examples=[],
        target="therapist",
        allow_not_applicable=True,
    )

    result = score_conversation_with_profile(
        [
            {"role": "assistant", "content": "Not applicable"},
            {"role": "assistant", "content": "Applicable"},
        ],
        _profile(metric),
    )["results"]["Test metric"]

    assert result["per_utterance"][0]["metrics"]["Test metric"]["label"] == "-1"
    assert result["overall"]["label"] == "Present"


def test_na_is_rejected_when_metric_does_not_allow_it(monkeypatch):
    _mock_scores(monkeypatch, ["N/A"])
    metric = MetricDefinition(
        name="Test metric",
        description="Test",
        scale="0-5 integer",
        guidance="Test",
        examples=[],
        target="therapist",
        allow_not_applicable=False,
    )

    with pytest.raises(ValueError, match="does not allow N/A"):
        score_conversation_with_profile(
            [{"role": "assistant", "content": "Applicable"}],
            _profile(metric),
        )

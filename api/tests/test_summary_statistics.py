from summary.routes import (
    _collect_utterance_metric_statistics,
    _format_applicable_metric_evidence,
    _format_metric_aggregate_scores,
)


def test_summary_statistics_exclude_not_applicable_values_and_labels():
    values, max_values, categories = _collect_utterance_metric_statistics([
        {
            "metrics": {
                "Empathy": {"type": "numerical", "value": -1, "max_value": 5},
                "Emotion": {"type": "categorical", "label": "N/A"},
            }
        },
        {
            "metrics": {
                "Empathy": {"type": "numerical", "value": 4, "max_value": 5},
                "Emotion": {"type": "categorical", "label": "joy"},
            }
        },
        {
            "metrics": {
                "Empathy": {"type": "numerical", "value": None, "max_value": 5},
                "Emotion": {"type": "categorical", "label": "-1"},
            }
        },
    ])

    assert values == {"Empathy": [4.0]}
    assert max_values == {"Empathy": 5.0}
    assert categories == {"Emotion": {"joy": 1}}


def test_summary_statistics_keep_zero_as_a_real_score():
    values, max_values, _ = _collect_utterance_metric_statistics([
        {
            "metrics": {
                "Safety": {"type": "numerical", "value": 0, "max_value": 1},
            }
        }
    ])

    assert values == {"Safety": [0.0]}
    assert max_values == {"Safety": 1.0}


def test_applicable_metric_evidence_never_includes_na_turns():
    evidence = _format_applicable_metric_evidence(
        [
            {"role": "therapist", "content": "Question"},
            {"role": "client", "content": "Answer"},
            {"role": "therapist", "content": "Reflection"},
        ],
        [
            {
                "metrics": {
                    "Empathy": {"type": "numerical", "value": -1, "max_value": 5},
                    "Emotion": {"type": "categorical", "label": "N/A"},
                }
            },
            {
                "metrics": {
                    "Emotion": {"type": "categorical", "label": "fear"},
                }
            },
            {
                "metrics": {
                    "Empathy": {"type": "numerical", "value": 4, "max_value": 5},
                },
                "reasoning": {"Empathy": "Accurately reflects the client's meaning."},
            },
        ],
        use_turn_numbers=True,
    )

    assert "Empathy | Turn 1" not in evidence
    assert "Emotion | Turn 1" not in evidence
    assert "Emotion | Turn 2 | fear" in evidence
    assert "Empathy | Turn 3 | 4/5" in evidence
    assert "Accurately reflects" in evidence


def test_applicable_metric_evidence_keeps_each_message_as_a_turn():
    evidence = _format_applicable_metric_evidence(
        [
            {"role": "therapist", "content": "First"},
            {"role": "therapist", "content": "Second"},
            {"role": "client", "content": "Reply"},
        ],
        [
            {"metrics": {"Metric": {"type": "numerical", "value": 2, "max_value": 5}}},
            {"metrics": {"Metric": {"type": "numerical", "value": 3, "max_value": 5}}},
            {"metrics": {}},
        ],
        use_turn_numbers=True,
    )

    assert "Metric | Turn 1 | 2/5" in evidence
    assert "Metric | Turn 2 | 3/5" in evidence


def test_metric_aggregates_prefer_applicable_turns_over_stale_overall_values():
    formatted = _format_metric_aggregate_scores(
        {
            "Empathy": {"type": "numerical", "value": 1.5, "max_value": 5},
            "Conversation safety": {"type": "numerical", "value": 0.8, "max_value": 1},
        },
        [
            {"metrics": {"Empathy": {"type": "numerical", "value": -1, "max_value": 5}}},
            {"metrics": {"Empathy": {"type": "numerical", "value": 4, "max_value": 5}}},
        ],
    )

    assert formatted == {
        "Empathy": "4.00/5",
        "Conversation safety": "0.8/1",
    }

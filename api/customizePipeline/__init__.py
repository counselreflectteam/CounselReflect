"""Core workflow module for LLM Therapist Tool.

This module provides the main API for metric refinement and conversation evaluation.
All public functions are re-exported here for backward compatibility.
"""

from .models import MetricDefinition, RefinedMetrics, Profile, Example

from .llm_client import MalformedJSONError

from .metrics_service import (
    refine_metrics_once,
    score_conversation,
    update_example_outputs,
    update_rubric_from_examples,
    rescore_examples,
    lock_profile,
    score_conversation_with_profile,
)

from .examples import select_examples


__all__ = [
    # Models
    "MetricDefinition",
    "RefinedMetrics",
    "Profile",
    "Example",
    # Errors
    "MalformedJSONError",
    # Services
    "refine_metrics_once",
    "score_conversation",
    "update_example_outputs",
    "update_rubric_from_examples",
    "rescore_examples",
    "lock_profile",
    "score_conversation_with_profile",
    # Examples
    "select_examples",
]

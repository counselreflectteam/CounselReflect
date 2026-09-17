"""
Helper functions for creating evaluation results in the standardized format.

Similar to web/utils/evaluation_helpers.py but for API evaluators.
"""
import logging
from typing import List, Optional
from schemas import (
    Utterance, EvaluationResult, UtteranceScore, SegmentScore,
    CategoricalScore, NumericalScore, MetricScore
)

logger = logging.getLogger(__name__)


def handle_openai_error(error: Exception, operation: str) -> dict:
    """Standardized error handling for OpenAI endpoints."""
    logger.error(f"Error {operation}: {str(error)}", exc_info=True)
    return {"error": str(error)}


def create_categorical_score(
    label: str,
    confidence: Optional[float] = None,
    highlighted_text: Optional[str] = None
) -> CategoricalScore:
    """
    Create a categorical score.
    
    Args:
        label: Category label (e.g., "High", "Change", "Positive")
        confidence: Optional confidence score 0-1
        highlighted_text: Optional text span to highlight
        
    Returns:
        CategoricalScore
    """
    return {
        "type": "categorical",
        "label": label,
        "confidence": confidence,
        "highlighted_text": highlighted_text
    }


def create_numerical_score(
    value: float,
    max_value: float,
    label: Optional[str] = None,
    highlighted_text: Optional[str] = None,
    direction: str = "higher_is_better"
) -> NumericalScore:
    """
    Create a numerical score.
    
    Args:
        value: The score value
        max_value: Maximum possible score
        label: Optional derived label (e.g., "High" if value > threshold)
        highlighted_text: Optional text span to highlight
        direction: 'higher_is_better' or 'lower_is_better'
        
    Returns:
        NumericalScore
    """
    return {
        "type": "numerical",
        "value": value,
        "max_value": max_value,
        "label": label,
        "direction": direction,
        "highlighted_text": highlighted_text
    }


def create_utterance_result(
    conversation: List[Utterance],
    scores_per_utterance: List[dict[str, MetricScore]],
    reasoning_per_utterance: Optional[List[dict[str, str]]] = None
) -> EvaluationResult:
    """
    Create an utterance-level evaluation result.
    
    Args:
        conversation: The full conversation
        scores_per_utterance: List of metric scores, one dict per utterance
        reasoning_per_utterance: Optional list of reasoning dicts, one per utterance.
                                  Each dict maps metric_name -> rationale string.
        
    Returns:
        EvaluationResult with granularity="utterance"
    """
    per_utterance: List[UtteranceScore] = []
    for i, scores in enumerate(scores_per_utterance):
        entry: UtteranceScore = {
            "index": i,
            "metrics": scores
        }
        if reasoning_per_utterance and i < len(reasoning_per_utterance) and reasoning_per_utterance[i]:
            entry["reasoning"] = reasoning_per_utterance[i]
        per_utterance.append(entry)
    
    return {
        "granularity": "utterance",
        "overall": None,
        "per_utterance": per_utterance,
        "per_segment": None
    }


def create_conversation_result(
    overall_scores: dict[str, MetricScore]
) -> EvaluationResult:
    """
    Create a conversation-level evaluation result.
    
    Args:
        overall_scores: Aggregate scores for the entire conversation
        
    Returns:
        EvaluationResult with granularity="conversation"
    """
    return {
        "granularity": "conversation",
        "overall": overall_scores,
        "per_utterance": None,
        "per_segment": None
    }


def create_segment_result(
    segments: List[tuple[List[int], dict[str, MetricScore]]]
) -> EvaluationResult:
    """
    Create a segment-level evaluation result.
    
    Args:
        segments: List of (utterance_indices, scores) tuples
        
    Returns:
        EvaluationResult with granularity="segment"
    """
    per_segment: List[SegmentScore] = []
    for utterance_indices, scores in segments:
        per_segment.append({
            "utterance_indices": utterance_indices,
            "metrics": scores
        })
    
    return {
        "granularity": "segment",
        "overall": None,
        "per_utterance": None,
        "per_segment": per_segment
    }


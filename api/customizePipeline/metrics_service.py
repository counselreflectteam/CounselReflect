"""Core metrics service - business logic for metric refinement and evaluation.

Orchestrates the workflow for refining metrics, scoring conversations,
and updating rubrics based on feedback.
"""
import json
from collections import Counter
from datetime import datetime
from typing import List, Dict, Any, Optional

from .definitions import load_definitions, extract_candidate_terms, lookup_definitions_for_terms

# Role mapping for target speaker
THERAPIST_ROLES = ("assistant", "therapist")
PATIENT_ROLES = ("user", "client", "patient", "seeker")


def _indices_for_target(conversation: List[Dict[str, str]], target: str) -> List[int]:
    """Return utterance indices to score for the given target speaker."""
    indices = []
    for idx, turn in enumerate(conversation):
        role = turn.get("role", "").lower()
        if target == "therapist" and role in THERAPIST_ROLES:
            indices.append(idx)
        elif target == "patient" and role in PATIENT_ROLES:
            indices.append(idx)
        elif target == "both":
            indices.append(idx)
    return indices
from .llm_client import chat_json
from .models import MetricDefinition, RefinedMetrics, Example, Profile
from .prompts import (
    REFINE_SYSTEM,
    REFINE_ITERATIVE_SYSTEM,
    SCORE_SYSTEM,
    SCORE_ALL_UTTERANCES_SYSTEM,
    UPDATE_OUTPUTS_SYSTEM,
    RUBRIC_UPDATE_FROM_EXAMPLES_SYSTEM,
)


def refine_metrics_once(
    raw_notes: str = None,
    provider: str = "openai",
    model: str = "gpt-4o",
    api_key: Optional[str] = None,
    feedback: str = "",
    current_refined_metrics: Optional[RefinedMetrics] = None
) -> RefinedMetrics:
    """Refine rough metric notes into structured metric definitions.
    
    Takes user's informal metric descriptions and converts them into
    standardized MetricDefinition objects using LLM refinement.
    
    CRITICAL: If current_refined_metrics is provided, uses iterative refinement
    mode that builds on the previous refinement, not the original raw_notes.
    
    Args:
        raw_notes: User's raw metric notes/descriptions (required if current_refined_metrics is None)
        provider: LLM provider identifier ('openai', 'gemini', 'claude', 'ollama')
        model: Model identifier to use
        api_key: API key for the provider
        feedback: Optional user feedback to guide refinement
        current_refined_metrics: Optional current refined metrics for iterative refinement
        
    Returns:
        RefinedMetrics object with structured metric definitions
    """
    if current_refined_metrics is not None:
        # Iterative refinement mode - use current refined metrics as base
        current_metrics_json = [
            {
                "name": m.name,
                "description": m.description,
                "scale": m.scale,
                "guidance": m.guidance,
                "examples": m.examples
            }
            for m in current_refined_metrics.metrics
        ]
        
        payload_str = (
            f"Current Refined Metrics (version {current_refined_metrics.version}):\n"
            f"{json.dumps({'version': current_refined_metrics.version, 'metrics': current_metrics_json}, indent=2)}\n\n"
            f"User Feedback:\n{feedback}\n\n"
            f"Original Notes (for context):\n{raw_notes or 'N/A'}"
        )
        
        res = chat_json(REFINE_ITERATIVE_SYSTEM, payload_str, provider, model, api_key)
        
        # Increment version with timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        # Extract base version number from current version (handle both "v1" and "v1 • Initial..." formats)
        current_version_str = current_refined_metrics.version.split('•')[0].strip()
        current_version_num = int(current_version_str.lstrip('v')) if current_version_str.startswith('v') else 1
        new_version = f"v{current_version_num + 1} • Refined • {timestamp}"
    else:
        # Initial refinement mode - start from raw_notes
        if raw_notes is None:
            raise ValueError("raw_notes is required when current_refined_metrics is not provided")
        
        defs_store = load_definitions()
        terms = extract_candidate_terms(raw_notes)
        matched_defs = lookup_definitions_for_terms(terms, defs_store)

        context_lines = [f"- {k}: {v}" for k, v in matched_defs.items()]
        context_str = "\n".join(context_lines)

        payload_str = (
            f"User Metric Notes:\n{raw_notes}\n\n"
            f"User Feedback:\n{feedback}\n\n"
            f"Definition Context:\n{context_str}"
        )

        res = chat_json(REFINE_SYSTEM, payload_str, provider, model, api_key)
        # Generate detailed version with timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        base_version = res.get("version", "v1")
        new_version = f"{base_version} • Initial Definition • {timestamp}"

    metrics = [
        MetricDefinition(
            name=m.get("name", "").strip(),
            description=m.get("description", "").strip(),
            scale=m.get("scale", "").strip(),
            guidance=m.get("guidance", "").strip(),
            examples=[str(x) for x in m.get("examples", [])][:4]
        )
        for m in res.get("metrics", [])
    ]

    refined = RefinedMetrics(
        version=new_version,
        metrics=metrics,
        notes=res.get("notes", "").strip()
    )

    return refined


def score_conversation(
        conv: List[Dict[str, str]],
        refined: RefinedMetrics,
        provider: str = "openai",
        model: str = "gpt-4o",
        api_key: Optional[str] = None,
        user_prefs: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Score a conversation using refined metrics.
    
    Args:
        conv: Conversation as list of turn dicts with "role" and "content"
        refined: Refined metric definitions to use for scoring
        provider: LLM provider identifier ('openai', 'gemini', 'claude', 'ollama')
        model: Model identifier to use
        api_key: API key for the provider
        user_prefs: Optional user preferences for evaluation
        
    Returns:
        Scoring results with summary and per-metric values/rationales
    """
    card = [
        {
            "name": m.name,
            "description": m.description,
            "scale": m.scale,
            "guidance": m.guidance
        }
        for m in refined.metrics
    ]

    payload = {
        "refined_metrics": {"version": refined.version, "metrics": card},
        "user_preferences": user_prefs or {},
        "conversation": conv
    }

    return chat_json(SCORE_SYSTEM, json.dumps(payload, ensure_ascii=False), provider, model, api_key)


def update_example_outputs(
    examples: List[Example],
    rubric: RefinedMetrics,
    feedback: str,
    provider: str = "openai",
    model: str = "gpt-4o",
    api_key: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Update example outputs based on user feedback.
    
    Args:
        examples: List of examples with current outputs
        rubric: Current refined metrics
        feedback: User feedback about the outputs
        provider: LLM provider identifier ('openai', 'gemini', 'claude', 'ollama')
        model: Model identifier to use
        api_key: API key for the provider
        
    Returns:
        List of updated outputs (same structure as before)
    """
    current_outputs = [
        ex.metrics_output for ex in examples if ex.metrics_output
    ]
    
    rubric_json = [
        {
            "name": m.name,
            "description": m.description,
            "scale": m.scale,
            "guidance": m.guidance
        }
        for m in rubric.metrics
    ]
    
    payload_str = (
        f"Current Refined Metrics:\n{json.dumps({'metrics': rubric_json}, indent=2)}\n\n"
        f"Current Example Outputs:\n{json.dumps(current_outputs, indent=2)}\n\n"
        f"User Feedback:\n{feedback}"
    )
    
    res = chat_json(UPDATE_OUTPUTS_SYSTEM, payload_str, provider, model, api_key)
    
    # Return updated outputs (should be list matching examples)
    if isinstance(res, list):
        return res
    elif isinstance(res, dict) and "outputs" in res:
        return res["outputs"]
    else:
        # Fallback: return single output wrapped in list
        return [res]


def update_rubric_from_examples(
    current_rubric: RefinedMetrics,
    example_outputs: List[Dict[str, Any]],
    feedback: str,
    provider: str = "openai",
    model: str = "gpt-4o",
    api_key: Optional[str] = None
) -> RefinedMetrics:
    """Update rubric based on example outputs and feedback.
    
    Uses current_rubric as base (not original input).
    
    Args:
        current_rubric: Current refined metrics (used as base)
        example_outputs: List of example scoring outputs
        feedback: User feedback about the rubric
        provider: LLM provider identifier ('openai', 'gemini', 'claude', 'ollama')
        model: Model identifier to use
        api_key: API key for the provider
        
    Returns:
        Updated RefinedMetrics with change log in notes
    """
    current_metrics_json = [
        {
            "name": m.name,
            "description": m.description,
            "scale": m.scale,
            "guidance": m.guidance,
            "examples": m.examples
        }
        for m in current_rubric.metrics
    ]
    
    payload_str = (
        f"Current Refined Metrics (version {current_rubric.version}):\n"
        f"{json.dumps({'version': current_rubric.version, 'metrics': current_metrics_json}, indent=2)}\n\n"
        f"Current Example Outputs:\n{json.dumps(example_outputs, indent=2)}\n\n"
        f"User Feedback:\n{feedback}"
    )
    
    res = chat_json(RUBRIC_UPDATE_FROM_EXAMPLES_SYSTEM, payload_str, provider, model, api_key)
    
    # Increment version
    current_version_num = int(current_rubric.version.lstrip('v')) if current_rubric.version.startswith('v') else 1
    new_version = f"v{current_version_num + 1}"
    
    metrics = [
        MetricDefinition(
            name=m.get("name", "").strip(),
            description=m.get("description", "").strip(),
            scale=m.get("scale", "").strip(),
            guidance=m.get("guidance", "").strip(),
            examples=[str(x) for x in m.get("examples", [])][:4]
        )
        for m in res.get("metrics", [])
    ]
    
    # Include change log in notes
    change_log = res.get("change_log", [])
    notes = current_rubric.notes or ""
    if change_log:
        notes = f"{notes}\n\nChanges:\n" + "\n".join(f"- {change}" for change in change_log)
    
    updated = RefinedMetrics(
        version=new_version,
        metrics=metrics,
        notes=notes.strip()
    )
    
    return updated


def rescore_examples(
    examples: List[Example],
    rubric: RefinedMetrics,
    provider: str = "openai",
    model: str = "gpt-4o",
    api_key: Optional[str] = None,
    user_prefs: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Rescore examples using updated rubric.
    
    Args:
        examples: List of examples to rescore
        rubric: Updated refined metrics
        provider: LLM provider identifier ('openai', 'gemini', 'claude', 'ollama')
        model: Model identifier to use
        api_key: API key for the provider
        user_prefs: Optional user preferences
        
    Returns:
        List of rescored outputs
    """
    outputs = []
    for ex in examples:
        output = score_conversation(
            ex.conversation,
            rubric,
            provider,
            model,
            api_key,
            user_prefs
        )
        outputs.append(output)
    
    return outputs


def lock_profile(
    refined_metrics: RefinedMetrics,
    user_preferences: Dict[str, Any],
    canonical_examples: List[Example],
    version: Optional[str] = None
) -> Profile:
    """Lock a profile with final rubric, preferences, and canonical examples.
    
    Args:
        refined_metrics: Final refined metrics (exactly N metrics, 1:1 to user's list)
        user_preferences: User preferences for evaluation
        canonical_examples: List of examples with final outputs
        version: Optional profile version (defaults to refined_metrics version)
        
    Returns:
        Locked Profile
    """
    profile_version = version or refined_metrics.version
    
    profile = Profile(
        version=profile_version,
        refined_metrics=refined_metrics,
        user_preferences=user_preferences,
        canonical_examples=canonical_examples
    )
    
    return profile


def score_conversation_with_profile(
    conversation: List[Dict[str, str]],
    profile: Profile,
    provider: str = "openai",
    model: str = "gpt-4o",
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """Score a new conversation using a locked profile.
    
    Sends the ENTIRE conversation to LLM once and gets scores for utterances
    based on each metric's target (therapist, patient, or both).
    
    Args:
        conversation: New conversation to score (as list of dicts with "role" and "content")
        profile: Locked profile with rubric and preferences
        provider: LLM provider identifier ('openai', 'gemini', 'claude', 'ollama')
        model: Model identifier to use
        api_key: API key for the provider
        
    Returns:
        Standardized evaluation response with:
        - results: Dict[metric_name, EvaluationResult]
        - status: 'success' | 'partial' | 'error'
        - timestamp: evaluation time
    """
    import time
    import logging
    logger = logging.getLogger(__name__)
    
    # Build metric metadata for scale interpretation
    metric_scales = {}
    metric_cards = []
    for m in profile.refined_metrics.metrics:
        metric_scales[m.name] = m.scale
        metric_cards.append({
            "name": m.name,
            "description": m.description,
            "scale": m.scale,
            "guidance": m.guidance
        })
    
    # Build per-metric utterance indices based on each metric's target
    metric_utterance_indices: Dict[str, List[int]] = {}
    all_indices = set()
    for m in profile.refined_metrics.metrics:
        target = getattr(m, "target", "therapist")
        indices = _indices_for_target(conversation, target)
        metric_utterance_indices[m.name] = indices
        all_indices.update(indices)
    
    total_to_score = len(all_indices)
    logger.info(f"Found {total_to_score} utterances to score across {len(metric_utterance_indices)} metrics")
    
    # If no utterances to score for any metric, return empty result
    if not all_indices:
        return {
            "results": {},
            "status": "success",
            "timestamp": int(time.time() * 1000),
            "message": "No utterances found to score for the selected metrics"
        }
    
    # Build payload for single GPT call
    payload = {
        "refined_metrics": {"version": profile.refined_metrics.version, "metrics": metric_cards},
        "user_preferences": profile.user_preferences or {},
        "conversation": conversation,
        "metric_utterance_indices": metric_utterance_indices
    }
    
    logger.info(f"Sending entire conversation to LLM for scoring {total_to_score} utterances")
    
    # Single LLM call to score ALL therapist utterances at once
    raw_result = chat_json(SCORE_ALL_UTTERANCES_SYSTEM, json.dumps(payload, ensure_ascii=False), provider, model, api_key)
    
    logger.info(f"LLM response keys: {list(raw_result.keys()) if isinstance(raw_result, dict) else 'not a dict'}")
    
    # Parse the batch response
    utterance_scores_from_gpt = raw_result.get("utterance_scores", {})
    overall_summary = raw_result.get("overall_summary", "")
    
    logger.info(f"LLM returned scores for {len(utterance_scores_from_gpt)} utterances")
    
    # Build results dict - one entry per metric
    results = {}
    
    # Process each metric
    for metric in profile.refined_metrics.metrics:
        metric_name = metric.name
        scale = metric.scale
        
        # Determine if numerical or categorical based on scale
        is_numerical = "-" in scale and any(c.isdigit() for c in scale)
        
        # Extract max_value for numerical metrics
        max_value = 10.0  # default
        if is_numerical:
            try:
                parts = scale.replace("integer", "").replace("float", "").strip().split("-")
                max_value = float(parts[-1]) if len(parts) > 1 else 10.0
            except (ValueError, IndexError):
                max_value = 10.0
        
        # Determine direction
        direction = "higher_is_better"
        if "lower is better" in scale.lower() or "lower score is better" in scale.lower():
            direction = "lower_is_better"

        
        # Build per_utterance scores for this metric
        per_utterance = []
        metric_sum = 0.0
        metric_count = 0
        categorical_labels = []  # For categorical: collect labels to compute mode (most frequent)

        for idx in range(len(conversation)):
            idx_str = str(idx)
            
            # Check if this utterance has a score for this metric
            if idx_str in utterance_scores_from_gpt:
                raw_metrics = utterance_scores_from_gpt[idx_str].get("metrics", {})
                
                if metric_name in raw_metrics:
                    metric_data = raw_metrics[metric_name]
                    value = metric_data.get("value")
                    rationale = metric_data.get("rationale", "")
                    
                    if is_numerical:
                        # Numerical metric
                        try:
                            num_value = float(value) if isinstance(value, (int, float)) else 0.0
                            
                            per_utterance.append({
                                "index": idx,
                                "metrics": {
                                    metric_name: {
                                        "type": "numerical",
                                        "value": num_value,
                                        "max_value": max_value,
                                        "label": None,
                                        "direction": direction,
                                        "highlighted_text": None
                                    }
                                },
                                "reasoning": {metric_name: rationale} if rationale else {}
                            })
                            
                            # Accumulate for overall (normalize to 0-10 scale)
                            normalized = (num_value / max_value) * 10 if max_value > 0 else 0
                            metric_sum += normalized
                            metric_count += 1
                        except (ValueError, TypeError):
                            # Fallback to categorical if conversion fails
                            per_utterance.append({
                                "index": idx,
                                "metrics": {
                                    metric_name: {
                                        "type": "categorical",
                                        "label": str(value),
                                        "confidence": None,
                                        "highlighted_text": None
                                    }
                                },
                                "reasoning": {metric_name: rationale} if rationale else {}
                            })
                    else:
                        # Categorical metric
                        label = str(value) if value else "Unknown"
                        
                        per_utterance.append({
                            "index": idx,
                            "metrics": {
                                metric_name: {
                                    "type": "categorical",
                                    "label": label,
                                    "confidence": None,
                                    "highlighted_text": None
                                }
                            },
                            "reasoning": {metric_name: rationale} if rationale else {}
                        })
                        
                        categorical_labels.append(label)
                        metric_count += 1
                else:
                    # This utterance doesn't have this metric
                    per_utterance.append({
                        "index": idx,
                        "metrics": {}
                    })
            else:
                # Utterance not scored for this metric (wrong target or no score)
                per_utterance.append({
                    "index": idx,
                    "metrics": {}
                })
        
        # Calculate overall score for this metric
        overall_score = None
        if metric_count > 0:
            if is_numerical:
                avg_normalized = metric_sum / metric_count  # 0-10 scale
                overall_value = (avg_normalized / 10) * max_value
                overall_score = {
                    "type": "numerical",
                    "value": round(overall_value, 2),
                    "max_value": max_value,
                    "label": None
                }
            else:
                # For categorical: use mode (most frequent label)
                mode_label = Counter(categorical_labels).most_common(1)[0][0] if categorical_labels else "Unknown"
                overall_score = {
                    "type": "categorical",
                    "value": 0,  # Not used for categorical
                    "max_value": 10.0,
                    "label": mode_label
                }
        
        # Add this metric to results
        results[metric_name] = {
            "granularity": "utterance",
            "overall": overall_score,
            "per_utterance": per_utterance,
            "per_segment": None,
            "summary": overall_summary if metric == profile.refined_metrics.metrics[0] else None  # Only add summary to first metric
        }
    
    scored_count = len([s for s in utterance_scores_from_gpt.values() if s.get("metrics")])
    logger.info(f"Successfully scored {scored_count} utterances")
    
    return {
        "results": results,
        "status": "success",
        "timestamp": int(time.time() * 1000),
        "message": None
    }

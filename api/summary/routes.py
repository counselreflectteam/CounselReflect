"""
Summary and Chatbot API routes.

Endpoints for generating evaluation summaries and chatbot interactions.
"""
import re
import json
from fastapi import APIRouter, HTTPException
import logging
import os
from typing import List, Dict, Any

from schemas import (
    SummaryRequest, SummaryResponse,
    ChatbotRequest, ChatbotResponse, ChatbotMessage
)
from providers.registry import ProviderRegistry
from utils.server_keys import server_key_fallback, missing_key_detail

# Setup logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# Default chat models for each provider
DEFAULT_CHAT_MODELS = {
    "openai": "gpt-4o",
    "gemini": "gemini-2.0-flash",
    "claude": "claude-sonnet-4-20250514",
    "ollama": "llama3"
}


def _collect_utterance_metric_statistics(
    utterance_scores: List[Dict[str, Any]],
) -> tuple[Dict[str, List[float]], Dict[str, float], Dict[str, Dict[str, int]]]:
    """Collect applicable per-turn values without treating N/A as a zero."""
    metric_values: Dict[str, List[float]] = {}
    metric_max_values: Dict[str, float] = {}
    category_counts: Dict[str, Dict[str, int]] = {}

    for utterance in utterance_scores:
        for metric_name, metric_data in utterance.get("metrics", {}).items():
            if not isinstance(metric_data, dict):
                continue

            if metric_data.get("type") == "numerical":
                value = metric_data.get("value")
                if (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or float(value) == -1
                ):
                    continue
                metric_values.setdefault(metric_name, []).append(float(value))
                if (
                    metric_name not in metric_max_values
                    and isinstance(metric_data.get("max_value"), (int, float))
                ):
                    metric_max_values[metric_name] = float(metric_data["max_value"])
            elif metric_data.get("type") == "categorical":
                label = str(metric_data.get("label") or "").strip()
                if not label or label.lower() in {"-1", "n/a", "na", "not applicable"}:
                    continue
                counts = category_counts.setdefault(metric_name, {})
                counts[label] = counts.get(label, 0) + 1

    return metric_values, metric_max_values, category_counts


def _format_metric_aggregate_scores(
    overall_scores: Dict[str, Any],
    utterance_scores: List[Dict[str, Any]],
) -> Dict[str, str]:
    """Return one exact, display-ready aggregate per evaluated metric."""
    values, max_values, category_counts = _collect_utterance_metric_statistics(
        utterance_scores
    )
    formatted: Dict[str, str] = {}

    for metric_name, metric_values in values.items():
        average = sum(metric_values) / len(metric_values)
        max_value = max_values.get(metric_name, 5)
        decimals = 1 if max_value <= 1 else 2
        max_display = int(max_value) if max_value == int(max_value) else max_value
        formatted[metric_name] = f"{average:.{decimals}f}/{max_display}"

    for metric_name, counts in category_counts.items():
        if counts:
            formatted[metric_name] = max(counts.items(), key=lambda item: item[1])[0]

    # Conversation-level metrics may have no per-turn values.
    for metric_name, score_data in overall_scores.items():
        if metric_name in formatted or not isinstance(score_data, dict):
            continue
        if score_data.get("type") == "numerical":
            value = score_data.get("value")
            max_value = score_data.get("max_value", 5)
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or float(value) == -1
                or not isinstance(max_value, (int, float))
            ):
                continue
            decimals = 1 if max_value <= 1 else 2
            max_display = int(max_value) if max_value == int(max_value) else max_value
            formatted[metric_name] = f"{float(value):.{decimals}f}/{max_display}"
        else:
            label = str(score_data.get("label") or "").strip()
            if label and label.lower() not in {"-1", "n/a", "na", "not applicable"}:
                formatted[metric_name] = label

    return formatted


def _conversation_reference_numbers(
    messages: List[Dict[str, Any]],
    use_turn_numbers: bool,
) -> List[int]:
    return list(range(1, len(messages) + 1))


def _format_applicable_metric_evidence(
    messages: List[Dict[str, Any]],
    utterance_scores: List[Dict[str, Any]],
    use_turn_numbers: bool,
    max_examples_per_metric: int = 4,
) -> str:
    """Create a bounded set of metric-to-turn anchors for summary grounding."""
    reference_label = "Turn" if use_turn_numbers else "Line"
    references = _conversation_reference_numbers(messages, use_turn_numbers)
    entries_by_metric: Dict[str, List[Dict[str, Any]]] = {}

    for index, utterance in enumerate(utterance_scores):
        reference = references[index] if index < len(references) else index + 1
        reasoning_by_metric = utterance.get("reasoning", {})
        for metric_name, metric_data in utterance.get("metrics", {}).items():
            if not isinstance(metric_data, dict):
                continue

            entry: Dict[str, Any] | None = None
            if metric_data.get("type") == "numerical":
                value = metric_data.get("value")
                if (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or float(value) == -1
                ):
                    continue
                max_value = metric_data.get("max_value", 5)
                entry = {
                    "reference": reference,
                    "value": float(value),
                    "display": f"{float(value):g}/{float(max_value):g}",
                    "kind": "numerical",
                }
            elif metric_data.get("type") == "categorical":
                label = str(metric_data.get("label") or "").strip()
                if not label or label.lower() in {"-1", "n/a", "na", "not applicable"}:
                    continue
                entry = {
                    "reference": reference,
                    "label": label,
                    "display": label,
                    "kind": "categorical",
                }

            if entry is None:
                continue
            reasoning = (
                reasoning_by_metric.get(metric_name)
                if isinstance(reasoning_by_metric, dict)
                else None
            )
            if reasoning:
                reasoning_text = (
                    reasoning
                    if isinstance(reasoning, str)
                    else json.dumps(reasoning, ensure_ascii=False)
                )
                entry["reasoning"] = " ".join(reasoning_text.split())[:300]
            entries_by_metric.setdefault(metric_name, []).append(entry)

    lines: List[str] = []
    for metric_name, entries in entries_by_metric.items():
        if entries[0]["kind"] == "numerical":
            ordered = sorted(entries, key=lambda item: item["value"])
            candidates = ordered[:2] + ordered[-2:]
        else:
            candidates = []
            seen_labels = set()
            for entry in entries:
                normalized_label = entry["label"].lower()
                if normalized_label in seen_labels:
                    continue
                seen_labels.add(normalized_label)
                candidates.append(entry)

        selected: List[Dict[str, Any]] = []
        seen_references = set()
        for entry in candidates:
            if entry["reference"] in seen_references:
                continue
            seen_references.add(entry["reference"])
            selected.append(entry)
            if len(selected) >= max_examples_per_metric:
                break

        for entry in selected:
            line = (
                f"- {metric_name} | {reference_label} {entry['reference']} "
                f"| {entry['display']}"
            )
            if entry.get("reasoning"):
                line += f" | evidence: {entry['reasoning']}"
            lines.append(line)

    return "\n".join(lines) or "- No applicable per-turn metric evidence was available."


def _extract_json_object(response: str) -> dict:
    """Parse the model's JSON reply, tolerating markdown fences or prose
    around the object (models often preface JSON with a sentence)."""
    text = response.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


def _format_conversation(messages: List[Dict], use_turn_numbers: bool) -> str:
    """Format conversation with one reference per submitted message."""
    if use_turn_numbers:
        return "\n".join(
            f"[Turn {i}] {msg.get('role', msg.get('speaker', 'unknown'))}: "
            f"{msg.get('content', msg.get('text', ''))}"
            for i, msg in enumerate(messages, start=1)
        )
    else:
        return "\n".join(
            f"[Line {i}] {msg.get('role', msg.get('speaker', 'unknown'))}: {msg.get('content', msg.get('text', ''))}"
            for i, msg in enumerate(messages, start=1)
        )


@router.post("/generate", response_model=SummaryResponse)
def generate_summary(request: SummaryRequest):
    """
    Generate a comprehensive summary of evaluation results.
    
    Uses LLM to analyze evaluation results and generate:
    - Overall performance summary
    - Strengths (positive observations)
    - Areas for improvement
    - Key insights
    """
    try:
        # Use default model if validation fails or model is invalid
        model_to_use = request.model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider,
            request.model
        )
        if not is_valid:
            # Fallback to default model for the provider
            model_to_use = DEFAULT_CHAT_MODELS.get(request.provider, "gpt-4o")
            logger.warning(f"Invalid model '{request.model}', falling back to '{model_to_use}'")

        # Get API key
        provider_env_keys = {
            "openai": "OPENAI_API_KEY",
            "gemini": "GEMINI_API_KEY",
            "claude": "ANTHROPIC_API_KEY",
            "ollama": None  # Ollama doesn't need API key
        }

        api_key = request.api_key
        if not api_key and request.provider in provider_env_keys:
            api_key = server_key_fallback(provider_env_keys[request.provider])

        if not api_key and request.provider != "ollama":
            raise HTTPException(
                status_code=400,
                detail=missing_key_detail(request.provider, provider_env_keys.get(request.provider))
            )

        # Get provider instance
        provider = ProviderRegistry.get_provider(request.provider, api_key)

        # Prepare conversation context (line numbers or turn numbers for extension)
        use_turn_numbers = getattr(request, 'use_turn_numbers', False)
        conversation_text = _format_conversation(request.conversation, use_turn_numbers)

        # Extract metric scores for summary
        overall_scores = request.evaluation_results.get('overallScores', {})
        utterance_scores = request.evaluation_results.get('utteranceScores', [])
        
        # Build summary of scores
        score_summary = {}
        for metric_name, score in overall_scores.items():
            if isinstance(score, dict):
                if score.get('type') == 'numerical':
                    score_summary[metric_name] = {
                        'value': score.get('value', 0),
                        'max_value': score.get('max_value', 5),
                        'percentage': (score.get('value', 0) / score.get('max_value', 5)) * 100
                    }
                else:
                    score_summary[metric_name] = {'label': score.get('label', 'N/A')}

        # Calculate averages only from turns where the metric applies. Literature
        # and custom evaluators encode N/A as -1; including it would silently
        # depress scores and make the generated summary contradict the evidence table.
        metric_averages, metric_max_values, category_counts = (
            _collect_utterance_metric_statistics(utterance_scores)
        )

        # Populate max_value from overall_scores for any metric not yet seen in utterances
        for metric_name, score in overall_scores.items():
            if isinstance(score, dict) and metric_max_values.get(metric_name) is None and score.get('max_value') is not None:
                metric_max_values[metric_name] = float(score['max_value'])

        # Build per-metric averages with correct scale (value/max)
        metric_avg_summary = {}
        metric_avg_formatted = {}
        for metric_name, values in metric_averages.items():
            if values:
                avg_value = sum(values) / len(values)
                max_val = metric_max_values.get(metric_name, 5)
                metric_avg_summary[metric_name] = round(avg_value, 2)
                decimals = 1 if max_val <= 1 else 2
                max_display = int(max_val) if max_val == int(max_val) else max_val
                metric_avg_formatted[metric_name] = f"{avg_value:.{decimals}f}/{max_display}"
                # Prefer the applicable per-turn aggregate over a backend overall
                # value that may have been calculated before N/A filtering.
                score_summary[metric_name] = {
                    "value": round(avg_value, 2),
                    "max_value": max_val,
                    "percentage": (avg_value / max_val) * 100 if max_val else 0,
                }

        # Include overallScores-only metrics (e.g. conversation-level) in formatted output
        for metric_name, score in overall_scores.items():
            if metric_name not in metric_avg_formatted and isinstance(score, dict) and score.get('type') == 'numerical':
                val = score.get('value', 0)
                max_val = score.get('max_value', 5)
                decimals = 1 if max_val <= 1 else 2
                max_display = int(max_val) if max_val == int(max_val) else max_val
                metric_avg_formatted[metric_name] = f"{val:.{decimals}f}/{max_display}"

        # Find most common category for each categorical metric
        most_common_categories = {}
        for metric_name, counts in category_counts.items():
            if counts:
                most_common = max(counts.items(), key=lambda x: x[1])
                most_common_categories[metric_name] = f"{most_common[0]} ({most_common[1]} times)"

        # Build score statistics for the prompt - use correct scale per metric
        score_stats = f"""
SCORE STATISTICS (each metric has its own scale - use the EXACT format when citing):
- Per-Metric Averages: {metric_avg_formatted}
- Most Common Categories: {most_common_categories}
- Detailed Scores: {score_summary}
"""

        # Create list of available metrics for reference
        available_metrics = list(metric_avg_summary.keys()) + list(most_common_categories.keys())
        metrics_list = ", ".join(available_metrics) if available_metrics else "none specified"
        applicable_metric_evidence = _format_applicable_metric_evidence(
            request.conversation,
            utterance_scores,
            use_turn_numbers,
        )

        # Reference wording: line numbers (website/CLI) or turn numbers (extension)
        ref_label = "turn" if use_turn_numbers else "line"
        ref_label_cap = "Turn" if use_turn_numbers else "Line"
        ref_label_caps = "TURN" if use_turn_numbers else "LINE"

        # Ground every score example in metrics that actually ran; with no
        # scores at all, forbid score talk instead of inviting fabrication.
        has_numeric = bool(metric_avg_formatted)
        has_categorical = bool(most_common_categories)
        if has_numeric:
            example_metric, example_value = next(iter(metric_avg_formatted.items()))
            cite_example = f"({example_metric}: {example_value})"
            scale_examples = ", ".join(
                f"{name}: {value}" for name, value in list(metric_avg_formatted.items())[:3]
            )
            scale_rules_block = f"""CRITICAL - METRIC SCALE RULES:
- Each metric has its own scale. Use the EXACT format from "Per-Metric Averages" when citing scores (e.g. {scale_examples}).
- NEVER change a denominator: cite each score exactly as formatted above."""
            score_bullet = "   - The ACTUAL score for one relevant metric, copied in the CORRECT format from Per-Metric Averages\n"
            overall_hint = " Reference actual per-metric scores from Per-Metric Averages when relevant."
            remember_line = (
                f"Remember: Only use REAL scores exactly as formatted in Per-Metric Averages "
                f"(e.g. {cite_example}). Always cite {ref_label_caps} NUMBERS when quoting."
            )
        elif has_categorical:
            example_metric, example_value = next(iter(most_common_categories.items()))
            cite_example = f"({example_metric}: {example_value.split(' (')[0]})"
            scale_rules_block = """CRITICAL - CATEGORY RULES:
- These metrics produce category labels, not numeric scores. Cite ONLY the categories shown in "Most Common Categories"; never invent numbers."""
            score_bullet = "   - The metric's most common category as shown in Most Common Categories\n"
            overall_hint = " Reference the most common categories when relevant."
            remember_line = (
                f"Remember: cite only REAL category labels (e.g. {cite_example}); never invent numeric scores. "
                f"Always cite {ref_label_caps} NUMBERS when quoting."
            )
        else:
            cite_example = ""
            scale_rules_block = """CRITICAL - NO SCORES AVAILABLE:
- No metric produced a score for this session. Do NOT mention any metric names, numbers, or scores anywhere.
- Base every point purely on the conversation text itself."""
            score_bullet = ""
            overall_hint = ""
            remember_line = (
                f"Remember: no scores exist for this session — never invent any. "
                f"Always cite {ref_label_caps} NUMBERS when quoting."
            )
        example_citation = f" {cite_example}" if cite_example else ""

        # Create prompt for summary generation
        prompt = f"""You are an expert therapist supervisor analyzing a therapy session evaluation.

CONVERSATION (with {ref_label} numbers for reference):
{conversation_text}

{score_stats}

AVAILABLE METRICS: {metrics_list}

APPLICABLE PER-{ref_label_caps} METRIC EVIDENCE (curated anchors):
{applicable_metric_evidence}

{scale_rules_block}

IMPORTANT RULES:
- ONLY cite scores or categories that appear in the statistics above. DO NOT invent or make up any.
- Cite a metric at a specific {ref_label} ONLY when that metric and {ref_label} appear together in APPLICABLE PER-{ref_label_caps} METRIC EVIDENCE.
- A missing metric/{ref_label} pair means the metric was not scored there or was N/A. Never use an aggregate score to characterize that {ref_label}.
- When quoting conversation, ALWAYS include the {ref_label} number reference like ({ref_label_cap} 5) or ({ref_label_cap}s 3-4).
- If a metric wasn't evaluated, don't mention it.

Provide analysis:

1. OVERALL PERFORMANCE: 2 sentences summarizing the assessment.{overall_hint}

2. STRENGTHS: List 2-3 strengths. Each should be 1-2 sentences that includes:
   - What was done well
{score_bullet}   - A quote from the conversation with {ref_label_caps} NUMBER
   Format: "Responded with warmth and specificity{example_citation} - at {ref_label_cap} 2, the therapist said '...' which reassured the client."

3. AREAS FOR IMPROVEMENT: List 2-3 areas. Each should be 1-2 sentences that includes:
   - What needs improvement
{score_bullet}   - A quote with {ref_label_caps} NUMBER showing the issue
   Format: "Could ask more open-ended questions{example_citation} - at {ref_label_cap} 10, responses stayed surface-level."

Format as JSON:
{{"overall_performance": "...", "strengths": ["..."], "areas_for_improvement": ["..."], "key_insights": []}}

{remember_line}"""

        # Call LLM
        messages = [
            {"role": "system", "content": "You are an expert therapist supervisor. Provide detailed, constructive feedback in JSON format only. Do not include any text outside the JSON."},
            {"role": "user", "content": prompt}
        ]

        response = provider.chat_completion(
            messages=messages,
            model=model_to_use,
            temperature=0.7,
            # Claude defaults to 1024 and Ollama to 500 output tokens, which
            # truncates longer summaries mid-JSON.
            max_tokens=2048
        )

        # Parse response (expecting JSON)
        try:
            summary_data = _extract_json_object(response)

            # Post-process: fix incorrect scale references (e.g. fact_score: 0.4/5 -> 0.4/1)
            def fix_scale_in_text(text: str) -> str:
                if not text:
                    return text
                # For 0-1 scale metrics: replace wrong denominators (/5, /10, etc.) with /1
                for metric_id, max_val in metric_max_values.items():
                    if max_val <= 1:
                        # Match "metric_name: 0.4/5" or "metric_name: 0.4/10" - replace with correct /1
                        pattern = rf"({re.escape(metric_id)}\s*:\s*[\d.]+)/(?!1\b)\d+"
                        text = re.sub(pattern, rf"\1/{int(max_val)}", text, flags=re.IGNORECASE)
                return text

            for key in ("overall_performance", "strengths", "areas_for_improvement", "key_insights"):
                val = summary_data.get(key)
                if isinstance(val, str):
                    summary_data[key] = fix_scale_in_text(val)
                elif isinstance(val, list):
                    summary_data[key] = [fix_scale_in_text(str(item)) if isinstance(item, str) else item for item in val]
        except json.JSONDecodeError:
            # If not JSON, try to parse as structured text
            logger.warning("LLM response not in JSON format, attempting to parse as text")
            summary_data = {
                "overall_performance": response[:300] if len(response) > 300 else response,
                "strengths": ["Analysis completed - please regenerate for detailed breakdown"],
                "areas_for_improvement": [],
                "key_insights": []
            }

        return SummaryResponse(
            overall_performance=summary_data.get("overall_performance", "Analysis completed"),
            strengths=summary_data.get("strengths", []),
            areas_for_improvement=summary_data.get("areas_for_improvement", []),
            key_insights=summary_data.get("key_insights", [])
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error generating summary: {str(e)}"
        )


@router.post("/chatbot", response_model=ChatbotResponse)
def chatbot(request: ChatbotRequest):
    """
    Chatbot endpoint for discussing evaluation results.
    
    Allows users to ask questions about the evaluation results using
    the selected LLM provider.
    """
    try:
        # Use default model if validation fails
        model_to_use = request.model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider,
            request.model
        )
        if not is_valid:
            model_to_use = DEFAULT_CHAT_MODELS.get(request.provider, "gpt-4o")
            logger.warning(f"Invalid model '{request.model}', falling back to '{model_to_use}'")

        # Get API key
        provider_env_keys = {
            "openai": "OPENAI_API_KEY",
            "gemini": "GEMINI_API_KEY",
            "claude": "ANTHROPIC_API_KEY",
            "ollama": None
        }

        api_key = request.api_key
        if not api_key and request.provider in provider_env_keys:
            api_key = server_key_fallback(provider_env_keys[request.provider])

        if not api_key and request.provider != "ollama":
            raise HTTPException(
                status_code=400,
                detail=missing_key_detail(request.provider, provider_env_keys.get(request.provider))
            )

        # Get provider instance
        provider = ProviderRegistry.get_provider(request.provider, api_key)

        # Prepare conversation context (line numbers or turn numbers for extension)
        use_turn_numbers = getattr(request, 'use_turn_numbers', False)
        conversation_text = _format_conversation(request.conversation, use_turn_numbers)

        # Prepare evaluation results summary
        overall_scores = request.evaluation_results.get('overallScores', {})
        utterance_scores = request.evaluation_results.get('utteranceScores', [])
        
        aggregate_scores = _format_metric_aggregate_scores(
            overall_scores,
            utterance_scores,
        )
        applicable_metric_evidence = _format_applicable_metric_evidence(
            request.conversation,
            utterance_scores,
            use_turn_numbers,
        )
        results_summary = f"""
EVALUATION RESULTS:
Exact Metric Aggregates: {json.dumps(aggregate_scores, ensure_ascii=False)}
Number of utterances evaluated: {len(utterance_scores)}
Applicable per-turn metric evidence:
{applicable_metric_evidence}
"""

        # Build role-specific instructions
        user_role = request.user_role or "general"
        
        if user_role == "therapist":
            role_instructions = """
You are speaking to the THERAPIST who conducted this session.
Focus your feedback on:
- How their techniques and interventions sounded in the conversation
- How the patient responded to their approaches (verbal cues, engagement, resistance)
- What therapeutic moments worked well and what could be refined
- Their communication style, tone, and therapeutic presence
Use "you" to address the therapist and "your patient" when referring to the patient."""
        elif user_role == "patient":
            role_instructions = """
You are speaking to the PATIENT from this therapy session.
Focus your feedback on:
- How the therapist performed overall in supporting you
- Whether you seemed to be heard and understood (based on the therapist's responses)
- What the therapist did well in the session
- Areas where the therapist could have been more helpful
Use "you" when referring to the patient's experience and "your therapist" when discussing the therapist."""
        else:
            role_instructions = """
Use a neutral review perspective. Refer to the speakers as "the therapist" and
"the client"; do not assume the person asking is either participant."""

        # Reference wording: line numbers (website/CLI) or turn numbers (extension)
        ref_label_cap = "Turn" if use_turn_numbers else "Line"
        ref_label_caps = "TURN" if use_turn_numbers else "LINE"

        # Build messages for LLM
        system_message = f"""You are an expert therapy supervisor helping someone understand their session evaluation results.

{role_instructions}

ORIGINAL CONVERSATION (with {ref_label_cap.lower()} numbers):
{conversation_text}

{results_summary}

IMPORTANT RULES:
- ONLY reference scores from Exact Metric Aggregates, using the exact X/Y format shown there.
- Never convert, normalize, multiply, add, or restate a metric on a different scale.
- Cite a metric at a specific {ref_label_cap.lower()} ONLY when that metric and {ref_label_cap.lower()} appear together in Applicable per-turn metric evidence.
- Missing metric/{ref_label_cap.lower()} pairs were not scored or were N/A; never attach an aggregate score to them.
- When quoting the conversation, ALWAYS include the {ref_label_cap.lower()} number (e.g., "at {ref_label_cap} 5" or "{ref_label_cap}s 7-8")
- If asked about a metric that wasn't evaluated, say it wasn't measured in this evaluation.
- If the user asks something completely unrelated to the therapy session, evaluation results, or current work, politely reply that you cannot assist with that topic.

When answering questions:
1. Quote directly from the conversation WITH {ref_label_caps} NUMBERS (e.g., "At {ref_label_cap} 12, you said '...'")
2. Only cite ACTUAL metric scores from the results - never invent scores
3. When discussing improvements, quote what was said and suggest alternative approaches
4. Be detailed and educational - explain WHY certain approaches work or don't work
5. Tailor your language and perspective to the user's role (therapist or patient)

Be thorough, specific, and always ground your feedback in concrete examples with {ref_label_cap.lower()} references."""

        messages = [{"role": "system", "content": system_message}]
        
        # Add conversation history
        for msg in request.messages:
            messages.append({
                "role": msg.role,
                "content": msg.content
            })

        # Call LLM
        response = provider.chat_completion(
            messages=messages,
            model=model_to_use,
            temperature=0.2
        )

        return ChatbotResponse(message=response.strip())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chatbot: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error in chatbot: {str(e)}"
        )

"""
Summary and Chatbot API routes.

Endpoints for generating evaluation summaries and chatbot interactions.
"""
import re
from fastapi import APIRouter, HTTPException
import logging
import os
from typing import List, Dict, Any

from schemas import (
    SummaryRequest, SummaryResponse,
    ChatbotRequest, ChatbotResponse, ChatbotMessage
)
from providers.registry import ProviderRegistry

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


def _format_conversation(messages: List[Dict], use_turn_numbers: bool) -> str:
    """Format conversation with line numbers or turn numbers (extension only)."""
    if use_turn_numbers:
        lines = []
        turn = 0
        prev_role = None
        for msg in messages:
            role = msg.get('role', msg.get('speaker', 'unknown'))
            content = msg.get('content', msg.get('text', ''))
            if role != prev_role:
                turn += 1
                prev_role = role
            lines.append(f"[Turn {turn}] {role}: {content}")
        return "\n".join(lines)
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
            env_key_name = provider_env_keys[request.provider]
            if env_key_name:
                api_key = os.getenv(env_key_name)

        if not api_key and request.provider != "ollama":
            raise HTTPException(
                status_code=400,
                detail=f"API key required for provider '{request.provider}'. Provide api_key or set {provider_env_keys.get(request.provider, 'API_KEY')} environment variable."
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

        # Calculate average scores per metric from utterance scores, and capture max_value per metric
        metric_averages = {}
        metric_max_values = {}
        category_counts = {}
        for utterance in utterance_scores:
            metrics = utterance.get('metrics', {})
            for metric_name, metric_data in metrics.items():
                if isinstance(metric_data, dict):
                    if metric_data.get('type') == 'numerical':
                        if metric_name not in metric_averages:
                            metric_averages[metric_name] = []
                        metric_averages[metric_name].append(metric_data.get('value', 0))
                        if metric_max_values.get(metric_name) is None and metric_data.get('max_value') is not None:
                            metric_max_values[metric_name] = float(metric_data['max_value'])
                    elif metric_data.get('type') == 'categorical' and metric_data.get('label'):
                        label = metric_data.get('label')
                        if metric_name not in category_counts:
                            category_counts[metric_name] = {}
                        category_counts[metric_name][label] = category_counts[metric_name].get(label, 0) + 1

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

        # Reference wording: line numbers (website/CLI) or turn numbers (extension)
        ref_label = "turn" if use_turn_numbers else "line"
        ref_label_cap = "Turn" if use_turn_numbers else "Line"
        ref_label_caps = "TURN" if use_turn_numbers else "LINE"

        # Create prompt for summary generation
        prompt = f"""You are an expert therapist supervisor analyzing a therapy session evaluation.

CONVERSATION (with {ref_label} numbers for reference):
{conversation_text}

{score_stats}

AVAILABLE METRICS: {metrics_list}

CRITICAL - METRIC SCALE RULES:
- Each metric has its own scale. Use the EXACT format from "Per-Metric Averages" when citing scores.
- Examples: fact_score uses 0-1 scale (e.g. 0.4/1), empathy/active_listening use 1-5 (e.g. 4.2/5).
- NEVER use /5 for metrics that are on a 0-1 scale. NEVER use /1 for metrics on a 1-5 scale.
- When citing a metric, use the format shown in Per-Metric Averages (e.g. "fact_score: 0.4/1" not "0.4/5").

IMPORTANT RULES:
- ONLY use scores from the metrics listed above. DO NOT invent or make up any scores.
- When quoting conversation, ALWAYS include the {ref_label} number reference like ({ref_label_cap} 5) or ({ref_label_cap}s 3-4).
- If a metric wasn't evaluated, don't mention a score for it.

Provide analysis:

1. OVERALL PERFORMANCE: 2 sentences summarizing the assessment. Reference actual per-metric scores from Per-Metric Averages when relevant.

2. STRENGTHS: List 2-3 strengths. Each should be 1-2 sentences that includes:
   - What was done well
   - The ACTUAL metric score in the CORRECT format from Per-Metric Averages (e.g. fact_score: 0.4/1, empathy: 4.2/5)
   - A quote from the conversation with {ref_label_caps} NUMBER
   Format: "Provided normalization of emotional reactions (fact_score: 0.4/1) - at {ref_label_cap} 2, therapist said '...' which helped reduce stigma."

3. AREAS FOR IMPROVEMENT: List 2-3 areas. Each should be 1-2 sentences that includes:
   - What needs improvement
   - The ACTUAL metric score in the CORRECT format from Per-Metric Averages
   - A quote with {ref_label_caps} NUMBER showing the issue
   Format: "Could enhance factual psychoeducation (fact_score: 0.4/1) - at {ref_label_cap} 10, explanations remained general."

Format as JSON:
{{"overall_performance": "summary with actual scores in correct scale", "strengths": ["strength with real score in correct X/Y format and {ref_label} reference", "..."], "areas_for_improvement": ["area with score in correct format and {ref_label} reference", "..."], "key_insights": []}}

Remember: Only use REAL scores. Use the EXACT scale from Per-Metric Averages (e.g. 0.4/1 for fact_score, 4.2/5 for 1-5 metrics). Always cite {ref_label_caps} NUMBERS when quoting."""

        # Call LLM
        messages = [
            {"role": "system", "content": "You are an expert therapist supervisor. Provide detailed, constructive feedback in JSON format only. Do not include any text outside the JSON."},
            {"role": "user", "content": prompt}
        ]

        response = provider.chat_completion(
            messages=messages,
            model=model_to_use,
            temperature=0.7
        )

        # Parse response (expecting JSON)
        import json
        try:
            # Try to extract JSON from response
            response_text = response.strip()
            # Remove markdown code blocks if present
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            summary_data = json.loads(response_text)

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
            env_key_name = provider_env_keys[request.provider]
            if env_key_name:
                api_key = os.getenv(env_key_name)

        if not api_key and request.provider != "ollama":
            raise HTTPException(
                status_code=400,
                detail=f"API key required for provider '{request.provider}'. Provide api_key or set {provider_env_keys.get(request.provider, 'API_KEY')} environment variable."
            )

        # Get provider instance
        provider = ProviderRegistry.get_provider(request.provider, api_key)

        # Prepare conversation context (line numbers or turn numbers for extension)
        use_turn_numbers = getattr(request, 'use_turn_numbers', False)
        conversation_text = _format_conversation(request.conversation, use_turn_numbers)

        # Prepare evaluation results summary
        overall_scores = request.evaluation_results.get('overallScores', {})
        utterance_scores = request.evaluation_results.get('utteranceScores', [])
        
        # Extract actual metric names and scores with correct scale per metric
        metric_scores_list = []
        for metric_name, score_data in overall_scores.items():
            if isinstance(score_data, dict):
                if score_data.get('type') == 'numerical':
                    val = score_data.get('value', 0)
                    max_val = score_data.get('max_value', 5)
                    decimals = 1 if max_val <= 1 else 2
                    metric_scores_list.append(f"{metric_name}: {val:.{decimals}f}/{int(max_val) if max_val == int(max_val) else max_val}")
                elif score_data.get('label'):
                    metric_scores_list.append(f"{metric_name}: {score_data.get('label')}")
        
        results_summary = f"""
EVALUATION RESULTS:
Evaluated Metrics: {', '.join(metric_scores_list) if metric_scores_list else 'See utterance scores'}
Number of utterances evaluated: {len(utterance_scores)}
Full scores: {overall_scores}
"""

        # Build role-specific instructions
        user_role = request.user_role or "therapist"  # Default to therapist if not specified
        
        if user_role == "therapist":
            role_instructions = """
You are speaking to the THERAPIST who conducted this session.
Focus your feedback on:
- How their techniques and interventions sounded in the conversation
- How the patient responded to their approaches (verbal cues, engagement, resistance)
- What therapeutic moments worked well and what could be refined
- Their communication style, tone, and therapeutic presence
Use "you" to address the therapist and "your patient" when referring to the patient."""
        else:  # patient
            role_instructions = """
You are speaking to the PATIENT from this therapy session.
Focus your feedback on:
- How the therapist performed overall in supporting you
- Whether you seemed to be heard and understood (based on the therapist's responses)
- What the therapist did well in the session
- Areas where the therapist could have been more helpful
Use "you" when referring to the patient's experience and "your therapist" when discussing the therapist."""

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
- ONLY reference scores that are actually in the evaluation results above. DO NOT make up or invent scores.
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
            temperature=0.7
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

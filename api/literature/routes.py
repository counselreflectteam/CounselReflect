"""
Literature API routes.

Endpoints for accessing literature-based therapeutic metrics with generated rubrics.
Refactored for better maintainability and readability.
"""
from fastapi import APIRouter, HTTPException
import logging
import json
from pathlib import Path
from typing import Dict, List, Tuple
from fastapi.responses import StreamingResponse

from schemas import (
    LiteratureMetric, LiteratureMetricsResponse,
    LiteratureEvaluationRequest, LiteratureEvaluationResponse
)
from utils import parse, ConversationParseError
from literature.evaluator import LiteratureEvaluator
from providers.registry import ProviderRegistry

# Setup logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


# ==================== Endpoints ====================

@router.get("/metrics")
def list_literature_metrics():
    """
    List all literature-based therapeutic metrics with generated rubrics.

    Returns metrics from the literature_rubrics.json file which contains
    definitions, importance, research references, and AI-generated evaluation rubrics.
    """
    metrics = load_rubrics_from_json()
    return LiteratureMetricsResponse(
        metrics=metrics, 
        total=len(metrics)
    )


@router.post("/evaluate", response_model=LiteratureEvaluationResponse)
def evaluate_with_literature(request: LiteratureEvaluationRequest):
    """
    Evaluate conversation using literature-based rubrics and LLM providers.

    Uses LLM models (OpenAI, Gemini, Claude, or Ollama) to score each therapist
    utterance against evaluation rubrics derived from research literature.
    Each metric's rubric provides detailed scoring criteria, examples, and guidelines.

    Supports multiple providers:
    - OpenAI: gpt-5.2-pro, gpt-5.2, gpt-5, gpt-4o, gpt-3.5-turbo
    - Gemini: gemini-3-pro, gemini-2.5-flash, gemini-2.5-pro
    - Claude: claude-sonnet-4-5, claude-haiku-4-5
    - Ollama: Local models

    Example request:
    {
        "conversation": [
            {"role": "therapist", "content": "How are you feeling today?"},
            {"role": "client", "content": "I feel overwhelmed."},
            {"role": "therapist", "content": "It sounds like things are really difficult."}
        ],
        "metric_names": ["Empathy", "Therapeutic Alliance"],
        "api_key": "your-api-key",
        "provider": "openai",
        "model": "gpt-4o"
    }
    """
    try:
        # Parse and validate
        parsed_conversation = parse(request.conversation)
        validate_provider_and_model(request.provider, request.model)

        evaluator = LiteratureEvaluator(
            api_key=request.api_key,
            provider=request.provider,
            model=request.model
        )
        
        available_metrics = list(evaluator.rubrics_cache.keys())
        validate_metrics(request.metric_names, available_metrics)
        
        results, successful_metrics, errors = evaluate_metrics(
            evaluator,
            parsed_conversation,
            request.metric_names
        )
        
        status, message = determine_response_status(
            len(successful_metrics),
            len(request.metric_names),
            errors
        )
        
        return LiteratureEvaluationResponse(
            results=results,
            status=status,
            message=message if errors or status != "success" else None,
            metrics_evaluated=len(successful_metrics),
            total_metrics=len(request.metric_names)
        )

    except ConversationParseError as e:
        logger.error(f"Conversation parse error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid conversation format: {str(e)}")
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/evaluate/stream")
def evaluate_literature_stream(request: LiteratureEvaluationRequest):
    """
    Stream evaluation results for literature metrics.
    
    This endpoint yields JSON objects line by line (NDJSON format).
    Each line contains a "type" field ("progress", "result", "error", "done").
    """
    try:
        # Parse conversation - Fail fast
        try:
            parsed_conversation = parse(request.conversation)
        except ConversationParseError as e:
            raise HTTPException(status_code=400, detail=f"Invalid conversation format: {str(e)}")

        validate_provider_and_model(request.provider, request.model)

        evaluator = LiteratureEvaluator(
            api_key=request.api_key,
            provider=request.provider,
            model=request.model
        )
        
        available_metrics = list(evaluator.rubrics_cache.keys())
        # Check all metrics once before starting stream? Or filter out invalid ones?
        # The prompt implies validation first.
        validate_metrics(request.metric_names, available_metrics)

        def event_generator():
            # Initial validation success message
            yield json.dumps({
                "type": "start", 
                "total_metrics": len(request.metric_names),
                "metrics_list": request.metric_names
            }) + "\n"

            successful_count = 0
            
            for metric_name in request.metric_names:
                try:
                    logger.info(f"Stream evaluating literature metric: {metric_name}")
                    result = evaluator.evaluate_conversation(parsed_conversation, metric_name)
                    
                    # Yield success
                    yield json.dumps({
                        "type": "progress",
                        "metric": metric_name,
                        "status": "success",
                        "result": dict(result)
                    }) + "\n"
                    successful_count += 1
                    
                except Exception as e:
                    logger.error(f"Stream error for literature metric {metric_name}: {str(e)}", exc_info=True)
                    yield json.dumps({
                        "type": "progress",
                        "metric": metric_name,
                        "status": "error",
                        "error": str(e)
                    }) + "\n"

            yield json.dumps({
                "type": "done",
                "successful_count": successful_count,
                "total_count": len(request.metric_names)
            }) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stream setup error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ==================== Helper Functions ====================

def load_rubrics_from_json() -> List[LiteratureMetric]:
    """
    Load literature rubrics from JSON file.
    Raises HTTPException if file not found or invalid.
    """
    json_path = Path(__file__).parent / "literature_rubrics.json"
    
    if not json_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Literature rubrics file not found at {json_path}"
        )
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return [LiteratureMetric(**item) for item in data]
    
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing literature rubrics JSON: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error parsing literature rubrics: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error reading literature metrics: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error reading literature metrics: {str(e)}"
        )


def validate_provider_and_model(provider: str, model: str) -> None:
    """
    Validate provider and model combination.
    Raises HTTPException if invalid.
    """
    # Use the registry's validate method which only checks the specific provider
    is_valid, error_message = ProviderRegistry.validate_provider_and_model(provider, model)
    
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail=error_message
        )


def validate_metrics(metric_names: List[str], available_metrics: List[str]) -> None:
    """
    Validate requested metrics exist.
    Raises HTTPException if any metric is invalid.
    """
    invalid_metrics = [m for m in metric_names if m not in available_metrics]
    if invalid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metrics: {invalid_metrics}. Available: {available_metrics}"
        )


def evaluate_metrics(
    evaluator: LiteratureEvaluator,
    conversation: list,
    metric_names: List[str]
) -> Tuple[Dict, List[str], List[str]]:
    """
    Evaluate metrics with partial failure support.
    
    Returns:
        (results_dict, successful_metrics, errors)
    """
    results = {}
    errors = []
    successful_metrics = []

    for metric_name in metric_names:
        try:
            result = evaluator.evaluate_conversation(conversation, metric_name)
            results[metric_name] = dict(result)
            successful_metrics.append(metric_name)

        except Exception as e:
            error_msg = f"Error evaluating '{metric_name}': {str(e)}"
            logger.error(error_msg, exc_info=True)
            errors.append(error_msg)

    return results, successful_metrics, errors


def determine_response_status(
    successful_count: int,
    total_count: int,
    errors: List[str]
) -> Tuple[str, str]:
    """
    Determine response status and message based on success rate.
    
    Returns:
        (status, message)
    """
    if successful_count == total_count:
        return "success", f"Successfully evaluated {successful_count} metric(s)"
    elif successful_count > 0:
        return "partial", f"Evaluated {successful_count}/{total_count} metric(s). Errors: {'; '.join(errors)}"
    else:
        return "error", f"Failed to evaluate any metrics. Errors: {'; '.join(errors)}"


"""
Evaluator API routes.

Endpoints for listing and executing evaluation metrics.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json
import logging
import os

from evaluators import (
    list_available_metrics,
    get_metric_metadata,
    get_metrics_by_category,
    create_evaluator
)

from schemas import (
    MetricInfo, MetricsResponse,
    EvaluationRequest, EvaluationResponse,
)

from utils import parse, ConversationParseError
from providers.registry import ProviderRegistry
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/metrics", response_model=MetricsResponse)
def list_metrics():
    """
    List all available evaluation metrics.
    
    Returns all registered evaluators with their metadata.
    """
    metrics = []
    for metric_name in list_available_metrics():
        metadata = get_metric_metadata(metric_name)
        if metadata:
            metrics.append(MetricInfo(
                name=metric_name,
                label=metadata.label,
                description=metadata.description,
                category=metadata.category or "Other",
                requires_hf=metadata.requires_hf,
                target=metadata.target,
                reference=metadata.reference
            ))

    return MetricsResponse(
        metrics=metrics,
        total=len(metrics),
        by_category=get_metrics_by_category()
    )


@router.post("/evaluate", response_model=EvaluationResponse)
def evaluate(request: EvaluationRequest):
    """
    Evaluate a conversation using specified metrics.
    
    Accepts a conversation and list of metrics, then runs the corresponding
    evaluators and returns results for each metric.
    
    Example request:
    {
        "conversation": [
            {"speaker": "Therapist", "text": "Hello"},
            {"speaker": "Patient", "text": "Hi"}
        ],
        "metrics": ["talk_type", "empathy_er"],
        "provider": "openai",
        "model": "gpt-4o",
        "api_key": "sk-...",
        "huggingface_api_key": "hf_..."
    }
    """
    try:
        # Parse conversation
        parsed_conversation = parse(request.conversation)
        print(f"Parsed conversation: {len(parsed_conversation)} utterances")
        logger.info(f"Parsed conversation with {len(parsed_conversation)} utterances; metrics requested: {request.metrics}")

        # Get available metrics
        available_metrics = list_available_metrics()

        # Validate requested metrics
        invalid_metrics = [m for m in request.metrics if m not in available_metrics]
        if invalid_metrics:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid metrics: {invalid_metrics}. Available metrics: {available_metrics}"
            )

        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider,
            request.model
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_message)

        # Prepare API keys for evaluators
        model_config = {
            "provider": request.provider,
            "model": request.model,
            "api_key": request.api_key,
            "huggingface_api_key": request.huggingface_api_key
        }

        # Run evaluators for each metric
        results = {}
        errors = []
        successful_metrics = []

        for metric_name in request.metrics:
            try:
                logger.info(f"Evaluating metric: {metric_name}")
                evaluator_kwargs = {"model_config": model_config}
                
                # Create evaluator
                evaluator = create_evaluator(metric_name, **evaluator_kwargs)
                result = evaluator.execute(parsed_conversation, **evaluator_kwargs)

                results[metric_name] = dict(result)
                successful_metrics.append(metric_name)
                logger.info(f"Successfully evaluated metric: {metric_name}")

            except Exception as e:
                error_msg = f"Error evaluating metric '{metric_name}': {str(e)}"
                logger.error(error_msg, exc_info=True)
                errors.append(error_msg)

        # Determine response status
        if len(successful_metrics) == len(request.metrics):
            status = "success"
            message = f"Successfully evaluated {len(successful_metrics)} metric(s)"
        elif len(successful_metrics) > 0:
            status = "partial"
            message = f"Evaluated {len(successful_metrics)}/{len(request.metrics)} metric(s). Errors: {'; '.join(errors)}"
        else:
            status = "error"
            message = f"Failed to evaluate any metrics. Errors: {'; '.join(errors)}"
        print("len of results: ", len(results))
        for metric_name, result in results.items():
            print(f"Metric: {metric_name}, len Result: {len(result)}")
        return EvaluationResponse(
            results=results,
            status=status,
            message=message if errors or status != "success" else None
        )

    except ConversationParseError as e:
        logger.error(f"Conversation parse error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid conversation format: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during evaluation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/evaluate/stream")
def evaluate_stream(request: EvaluationRequest):
    """
    Stream evaluation results as they become available.
    
    This endpoint yields JSON objects line by line (NDJSON format).
    Each line contains a "type" field ("progress", "result", "error", "done").
    """
    try:
        # Parse conversation
        try:
            parsed_conversation = parse(request.conversation)
        except ConversationParseError as e:
            raise HTTPException(status_code=400, detail=f"Invalid conversation format: {str(e)}")
            
        logger.info(f"Stream request: {len(parsed_conversation)} utterances; metrics: {request.metrics}")

        # Validate metrics
        available_metrics = list_available_metrics()
        invalid_metrics = [m for m in request.metrics if m not in available_metrics]
        if invalid_metrics:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid metrics: {invalid_metrics}. Available metrics: {available_metrics}"
            )

        # Validate provider
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider,
            request.model
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_message)

        # Prepare config
        model_config = {
            "provider": request.provider,
            "model": request.model,
            "api_key": request.api_key,
            "huggingface_api_key": request.huggingface_api_key
        }

        def event_generator():
            # Initial validation success message
            yield json.dumps({
                "type": "start", 
                "total_metrics": len(request.metrics),
                "metrics_list": request.metrics
            }) + "\n"

            successful_count = 0
            
            for metric_name in request.metrics:
                try:
                    logger.info(f"Stream evaluating: {metric_name}")
                    evaluator_kwargs = {"model_config": model_config}
                    
                    # Create and run evaluator
                    evaluator = create_evaluator(metric_name, **evaluator_kwargs)
                    result = evaluator.execute(parsed_conversation, **evaluator_kwargs)
                    
                    # Yield success
                    yield json.dumps({
                        "type": "progress",
                        "metric": metric_name,
                        "status": "success",
                        "result": dict(result)
                    }) + "\n"
                    successful_count += 1
                    
                except Exception as e:
                    logger.error(f"Stream error for {metric_name}: {str(e)}", exc_info=True)
                    yield json.dumps({
                        "type": "progress",
                        "metric": metric_name,
                        "status": "error",
                        "error": str(e)
                    }) + "\n"

            yield json.dumps({
                "type": "done",
                "successful_count": successful_count,
                "total_count": len(request.metrics)
            }) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stream setup error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

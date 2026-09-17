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
from utils.capacity import acquire_evaluation_slot, release_slot_after, with_evaluation_slot
from utils.hf_identity import ensure_verified_hf_key
from utils.server_keys import server_keys_allowed, server_key_fallback, missing_key_detail
from utils.streaming import NDJSON_RESPONSE_HEADERS, run_with_heartbeats
from utils.medscore import check_medrag_readiness
from utils.cancellation import (
    EvaluationCancelled,
    raise_if_cancelled,
    register_evaluation_run,
    release_evaluation_run,
)
from providers.registry import ProviderRegistry
logger = logging.getLogger(__name__)

router = APIRouter()

def _get_metric_availability(metric_name: str):
    """Return server-side availability for metrics with non-user-key dependencies."""
    if metric_name == "perspective":
        return (
            server_keys_allowed() and bool(os.getenv("PERSPECTIVE_API_KEY")),
            "Requires PERSPECTIVE_API_KEY on the backend and "
            "COUNSELREFLECT_ALLOW_SERVER_KEYS=true."
        )

    endpoint_env = {
        "talk_type": "TALK_TYPE_ENDPOINT_URL",
        "emotional_support_strategy": "EMOTIONAL_SUPPORT_STRATEGY_ENDPOINT_URL",
        "pair": "PAIR_ENDPOINT_URL",
        "reccon": "RECCON_ENDPOINT_URL",
    }.get(metric_name)
    if endpoint_env:
        return (
            bool(os.getenv(endpoint_env)),
            f"Requires {endpoint_env} (HF Inference Endpoint URL) on the backend."
        )

    if metric_name == "medscore":
        available, reason = check_medrag_readiness()
        return (
            available,
            (
                "MedRAG Textbooks corpus and MedCPT index are ready."
                if available
                else f"Unavailable because {reason}. Configure MEDRAG_CORPUS and build the index."
            )
        )

    return None, None


# These metrics run on the server's paid HF Inference Endpoints (the user's
# key is never billed for them). Requiring a VERIFIED key makes anonymous
# freeloading need a real, bannable HF account instead of any non-empty string.
ENDPOINT_BACKED_METRICS = {"talk_type", "pair", "emotional_support_strategy", "reccon"}


def _env_key_for_provider(provider: str) -> str | None:
    return {
        "openai": "OPENAI_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "claude": "ANTHROPIC_API_KEY",
    }.get(provider)


def _resolve_model_config(request: EvaluationRequest) -> dict:
    env_key = _env_key_for_provider(request.provider)
    provider_api_key = request.api_key or server_key_fallback(env_key)
    hf_api_key = (
        request.huggingface_api_key
        or server_key_fallback("HF_TOKEN")
        or server_key_fallback("HUGGINGFACE_API_KEY")
    )

    # Fail fast with a clear message when no key is available anywhere:
    # constructing an evaluator with api_key=None would surface only as a
    # cryptic per-metric provider-SDK error deep inside the run. (ollama is
    # local and keyless, hence the env_key guard.)
    if env_key and not provider_api_key:
        raise HTTPException(
            status_code=400,
            detail=missing_key_detail(request.provider, env_key)
        )

    return {
        "provider": request.provider,
        "model": request.model,
        "api_key": provider_api_key,
        "huggingface_api_key": hf_api_key
    }


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
            server_available, availability_note = _get_metric_availability(metric_name)
            metrics.append(MetricInfo(
                name=metric_name,
                label=metadata.label,
                description=metadata.description,
                category=metadata.category or "Other",
                requires_hf=metadata.requires_hf,
                target=metadata.target,
                reference=metadata.reference,
                output_description=metadata.output_description,
                output_labels=metadata.output_labels,
                server_available=server_available,
                availability_note=availability_note
            ))

    return MetricsResponse(
        metrics=metrics,
        total=len(metrics),
        by_category=get_metrics_by_category()
    )


@router.post("/evaluate", response_model=EvaluationResponse)
@with_evaluation_slot
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

        # Prepare API keys for evaluators. Prefer request-scoped keys, then
        # server-managed environment variables.
        model_config = _resolve_model_config(request)

        # Endpoint-backed metrics spend the server's HF endpoint budget:
        # require a verified Hugging Face account first.
        if ENDPOINT_BACKED_METRICS & set(request.metrics):
            ensure_verified_hf_key(model_config.get("huggingface_api_key"))

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

        # Prepare config. Prefer request-scoped keys, then server-managed
        # environment variables.
        model_config = _resolve_model_config(request)

        # Endpoint-backed metrics spend the server's HF endpoint budget:
        # require a verified Hugging Face account first.
        if ENDPOINT_BACKED_METRICS & set(request.metrics):
            ensure_verified_hf_key(model_config.get("huggingface_api_key"))

        def event_generator():
            cancellation_event = register_evaluation_run(request.run_id)
            stream_completed = False
            try:
                raise_if_cancelled(cancellation_event)
                yield json.dumps({
                    "type": "start",
                    "run_id": request.run_id,
                    "total_metrics": len(request.metrics),
                    "metrics_list": request.metrics
                }) + "\n"

                successful_count = 0

                for metric_name in request.metrics:
                    raise_if_cancelled(cancellation_event)
                    try:
                        logger.info(f"Stream evaluating: {metric_name}")
                        evaluator_kwargs = {
                            "model_config": model_config,
                            "cancellation_event": cancellation_event,
                        }

                        evaluator = create_evaluator(metric_name, **evaluator_kwargs)
                        result = yield from run_with_heartbeats(
                            lambda: evaluator.execute(parsed_conversation, **evaluator_kwargs),
                            metric_name,
                            cancellation_event,
                        )

                        raise_if_cancelled(cancellation_event)
                        yield json.dumps({
                            "type": "progress",
                            "metric": metric_name,
                            "status": "success",
                            "result": dict(result)
                        }) + "\n"
                        successful_count += 1

                    except EvaluationCancelled:
                        raise
                    except Exception as e:
                        logger.error(f"Stream error for {metric_name}: {str(e)}", exc_info=True)
                        yield json.dumps({
                            "type": "progress",
                            "metric": metric_name,
                            "status": "error",
                            "error": str(e)
                        }) + "\n"

                stream_completed = True
                yield json.dumps({
                    "type": "done",
                    "successful_count": successful_count,
                    "total_count": len(request.metrics)
                }) + "\n"
            except EvaluationCancelled:
                logger.info("Cancelled model-scored evaluation run %s", request.run_id)
                yield json.dumps({
                    "type": "cancelled",
                    "run_id": request.run_id,
                }) + "\n"
            finally:
                if not stream_completed and cancellation_event is not None:
                    cancellation_event.set()
                release_evaluation_run(request.run_id)

        acquire_evaluation_slot(request.run_id)
        return StreamingResponse(
            release_slot_after(event_generator(), request.run_id),
            media_type="application/x-ndjson",
            headers=NDJSON_RESPONSE_HEADERS,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stream setup error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

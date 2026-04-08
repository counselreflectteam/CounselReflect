"""
CustomizePipeline API routes.

Provider-agnostic endpoints for metric refinement, scoring, and profile management.
"""
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter
from customizePipeline import (
    refine_metrics_once, MetricDefinition, RefinedMetrics, score_conversation,
    Example, Profile, update_example_outputs, update_rubric_from_examples,
    rescore_examples, lock_profile, score_conversation_with_profile,
)
from fastapi.responses import StreamingResponse
from customizePipeline.examples import select_examples
from customizePipeline.example_store import (
    EXAMPLE_SOURCES,
    get_sources_grouped,
    fetch_examples_for_source,
    fetch_examples_multi,
)

from schemas import (
    RefineMetricsRequest, ScoreMetricRequest,
    RefineMetricsResponse, ScoreMetricResponse, MetricDefinitionResponse,
    ExampleRequest, UpdateExampleOutputsRequest, UpdateRubricFromExamplesRequest,
    RescoreExamplesRequest, LockProfileRequest, ScoreWithProfileRequest,
    ListExamplesResponse, SelectExamplesRequest, SelectExamplesResponse,
    ListSourcesResponse, ExampleSourceEntry, SelectFromSourcesRequest, SelectFromSourcesResponse,
    ExampleSelectionEntry,
)

from utils import handle_openai_error
from providers.registry import ProviderRegistry
from fastapi import HTTPException

# Setup logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


def _refined_metrics_from_rubric(rubric) -> RefinedMetrics:
    """Build RefinedMetrics from API rubric (RefineMetricsResponse)."""
    return RefinedMetrics(
        version=rubric.version,
        metrics=[
            MetricDefinition(
                name=m.name,
                description=m.description,
                scale=m.scale,
                guidance=m.guidance,
                examples=m.examples,
                target=getattr(m, "target", "therapist")
            )
            for m in rubric.metrics
        ],
        notes=rubric.notes
    )


def _examples_from_request(examples) -> list:
    """Build list of Example from API example payloads."""
    return [
        Example(
            conversation=ex.conversation,
            dimensions=ex.dimensions,
            metrics_output=getattr(ex, "metrics_output", None)
        )
        for ex in examples
    ]


def _profile_from_lock_request(profile) -> Profile:
    """Build Profile from LockProfileRequest."""
    refined = _refined_metrics_from_rubric(profile.rubric)
    canonical = _examples_from_request(profile.canonical_examples)
    return Profile(
        version=profile.version or refined.version,
        refined_metrics=refined,
        user_preferences=profile.user_preferences,
        canonical_examples=canonical
    )


def _fetch_all_examples() -> list:
    """Fetch all examples from all registered sources (for legacy endpoints)."""
    all_examples = []
    for entry in EXAMPLE_SOURCES:
        examples = fetch_examples_for_source(entry["source"], entry["topic"])
        all_examples.extend(examples)
    return all_examples


def get_api_key_and_validate(request_provider: str, request_api_key: Optional[str]) -> tuple[Optional[str], str]:
    """
    Get API key from request or environment and validate provider/model.
    
    Returns:
        Tuple of (api_key, provider_name)
    """
    # Provider environment variable mapping
    provider_env_keys = {
        "openai": "OPENAI_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "claude": "ANTHROPIC_API_KEY",
        "ollama": None  # Ollama doesn't need API key
    }
    
    # Get API key from request or environment
    api_key = request_api_key if request_api_key else None
    if not api_key and request_provider in provider_env_keys:
        env_key_name = provider_env_keys[request_provider]
        if env_key_name:
            api_key = os.getenv(env_key_name)
    
    # Validate API key requirement (except for ollama)
    if request_provider != "ollama" and not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"API key required for provider '{request_provider}' (provide in request or set {provider_env_keys.get(request_provider, 'API_KEY')} environment variable)"
        )
    
    return api_key, request_provider


@router.post("/refine_metrics", response_model=RefineMetricsResponse)
def refine_metrics_openai(request: RefineMetricsRequest) -> RefineMetricsResponse | dict:
    """
    Refine custom metrics using selected LLM provider (similar to web workflow).

    Supports iterative refinement: if current_refined_metrics is provided,
    uses it as base instead of starting from raw_notes.
    """
    try:
        # Validate provider and model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider, request.model
        )
        if not is_valid:
            return {"error": error_message}

        # Get API key and validate
        api_key, provider = get_api_key_and_validate(request.provider, request.api_key)

        # Convert current_refined_metrics to RefinedMetrics if provided
        current_refined = None
        if request.current_refined_metrics:
            current_refined = RefinedMetrics(
                version="v1",  # Will be incremented in refine_metrics_once
                metrics=[
                    MetricDefinition(name=m.name, description=m.description, scale=m.scale,
                                     guidance=m.guidance, examples=m.examples)
                    for m in request.current_refined_metrics
                ],
                notes=""
            )

        refined = refine_metrics_once(
            raw_notes=request.raw_notes or "",
            provider=request.provider,
            model=request.model,
            api_key=api_key,
            feedback=request.feedback,
            current_refined_metrics=current_refined
        )

        return RefineMetricsResponse(
            version=refined.version,
            metrics=[
                MetricDefinitionResponse(
                    name=m.name,
                    description=m.description,
                    scale=m.scale,
                    guidance=m.guidance,
                    examples=m.examples
                )
                for m in refined.metrics
            ],
            notes=refined.notes,
            raw_notes=request.raw_notes or ""
        )
    except Exception as e:
        return handle_openai_error(e, "refining metrics")


@router.post("/score_metric", response_model=ScoreMetricResponse)
def score_metric_openai(request: ScoreMetricRequest) -> ScoreMetricResponse | dict:
    """
    Score a single text using selected LLM provider judge for a specific metric.
    """
    try:
        # Validate provider and model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider, request.model
        )
        if not is_valid:
            return {"error": error_message}

        # Get API key and validate
        api_key, provider = get_api_key_and_validate(request.provider, request.api_key)

        # Create metric definition
        metric = MetricDefinition(
            name=request.metric_name,
            description=request.description,
            scale=request.scale,
            guidance=request.guidance,
            examples=[]
        )

        # Create refined metrics with single metric
        refined = RefinedMetrics(
            version="v1",
            metrics=[metric],
            notes=""
        )

        # Score the conversation (single turn)
        conversation = [{"role": "assistant", "content": request.text}]
        result = score_conversation(conversation, refined, request.provider, request.model, api_key)

        # Extract and return metric score
        metric_result = result.get("metrics", {}).get(request.metric_name, {})
        return ScoreMetricResponse(
            value=metric_result.get("value"),
            rationale=metric_result.get("rationale", ""),
            label=metric_result.get("label")
        )
    except Exception as e:
        return handle_openai_error(e, "scoring metric")


@router.post("/update_example_outputs")
def update_example_outputs_openai(request: UpdateExampleOutputsRequest) -> dict:
    """
    Update example outputs based on user feedback.
    """
    try:
        examples = _examples_from_request(request.examples)
        rubric = _refined_metrics_from_rubric(request.rubric)

        # Validate provider and model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider, request.model
        )
        if not is_valid:
            return {"error": error_message}

        # Get API key and validate
        api_key, provider = get_api_key_and_validate(request.provider, request.api_key)

        updated_outputs = update_example_outputs(
            examples,
            rubric,
            request.feedback,
            request.provider,
            request.model,
            api_key
        )

        return {"outputs": updated_outputs}
    except Exception as e:
        return handle_openai_error(e, "updating example outputs")


@router.post("/update_rubric_from_examples", response_model=RefineMetricsResponse)
def update_rubric_from_examples_openai(request: UpdateRubricFromExamplesRequest) -> RefineMetricsResponse | dict:
    """
    Update rubric based on example outputs and feedback.
    Uses current rubric as base (not original input).
    """
    try:
        current_rubric = _refined_metrics_from_rubric(request.rubric)

        # Validate provider and model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider, request.model
        )
        if not is_valid:
            return {"error": error_message}

        # Get API key and validate
        api_key, provider = get_api_key_and_validate(request.provider, request.api_key)

        updated = update_rubric_from_examples(
            current_rubric,
            request.example_outputs,
            request.feedback,
            request.provider,
            request.model,
            api_key
        )

        return RefineMetricsResponse(
            version=updated.version,
            metrics=[
                MetricDefinitionResponse(
                    name=m.name,
                    description=m.description,
                    scale=m.scale,
                    guidance=m.guidance,
                    examples=m.examples
                )
                for m in updated.metrics
            ],
            notes=updated.notes,
            raw_notes=""  # Not applicable for updates
        )
    except Exception as e:
        return handle_openai_error(e, "updating rubric from examples")


@router.post("/rescore_examples")
def rescore_examples_openai(request: RescoreExamplesRequest) -> dict:
    """
    Rescore examples using updated rubric.
    """
    try:
        examples = _examples_from_request(request.examples)
        rubric = _refined_metrics_from_rubric(request.rubric)

        # Validate provider and model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider, request.model
        )
        if not is_valid:
            return {"error": error_message}

        # Get API key and validate
        api_key, provider = get_api_key_and_validate(request.provider, request.api_key)

        rescored = rescore_examples(
            examples,
            rubric,
            request.provider,
            request.model,
            api_key,
            request.user_preferences
        )

        return {"outputs": rescored}
    except Exception as e:
        return handle_openai_error(e, "rescoring examples")


@router.post("/lock_profile")
def lock_profile_openai(request: LockProfileRequest) -> dict:
    """
    Lock a profile with final rubric, preferences, and canonical examples.
    """
    try:
        refined_metrics = _refined_metrics_from_rubric(request.rubric)
        canonical_examples = _examples_from_request(request.canonical_examples)

        profile = lock_profile(
            refined_metrics,
            request.user_preferences,
            canonical_examples,
            request.version
        )

        return {
            "version": profile.version,
            "refined_metrics": {
                "version": profile.refined_metrics.version,
                "metrics": [
                    {
                        "name": m.name,
                        "description": m.description,
                        "scale": m.scale,
                        "guidance": m.guidance,
                        "examples": m.examples
                    }
                    for m in profile.refined_metrics.metrics
                ],
                "notes": profile.refined_metrics.notes
            },
            "user_preferences": profile.user_preferences,
            "canonical_examples": [
                {
                    "conversation": ex.conversation,
                    "dimensions": ex.dimensions,
                    "metrics_output": ex.metrics_output
                }
                for ex in profile.canonical_examples
            ]
        }
    except Exception as e:
        return handle_openai_error(e, "locking profile")


@router.post("/score_with_profile")
def score_with_profile_openai(request: ScoreWithProfileRequest) -> dict:
    """
    Score a new conversation using a locked profile.
    Returns results compatible with create_utterance_result format.
    """
    try:
        profile = _profile_from_lock_request(request.profile)

        # Validate provider and model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider, request.model
        )
        if not is_valid:
            return {"error": error_message}

        # Get API key and validate
        api_key, provider = get_api_key_and_validate(request.provider, request.api_key)

        result = score_conversation_with_profile(
            request.conversation,
            profile,
            request.provider,
            request.model,
            api_key
        )

        return result
    except Exception as e:
        return handle_openai_error(e, "scoring with profile")


@router.post("/score_with_profile/stream")
def score_with_profile_stream(request: ScoreWithProfileRequest):
    """
    Stream evaluation for custom metrics using a locked profile.
    Yields NDJSON events.
    """
    try:
        # Validate provider and model
        is_valid, error_message = ProviderRegistry.validate_provider_and_model(
            request.provider, request.model
        )
        if not is_valid:
             raise HTTPException(status_code=400, detail=error_message)

        # Get API key
        api_key, provider = get_api_key_and_validate(request.provider, request.api_key)

        profile = _profile_from_lock_request(request.profile)
        canonical_examples = profile.canonical_examples
        target_metrics = request.profile.rubric.metrics

        def event_generator():
            yield json.dumps({
                "type": "start",
                "total_metrics": len(target_metrics),
                "metrics_list": [m.name for m in target_metrics]
            }) + "\n"

            successful_count = 0

            for metric_def in target_metrics:
                metric_name = metric_def.name
                try:
                    # Construct a temporary single-metric rubric
                    single_metric = MetricDefinition(
                        name=metric_def.name,
                        description=metric_def.description,
                        scale=metric_def.scale,
                        guidance=metric_def.guidance,
                        examples=metric_def.examples,
                        target=getattr(metric_def, "target", "therapist")
                    )
                    
                    single_rubric = RefinedMetrics(
                        version=request.profile.rubric.version,
                        metrics=[single_metric],
                        notes=request.profile.rubric.notes
                    )
                    
                    # Construct Profile with single metric
                    temp_profile = Profile(
                        version=profile.version or "temp",
                        refined_metrics=single_rubric,
                        user_preferences=profile.user_preferences,
                        canonical_examples=canonical_examples
                    )
                    
                    # Score using existing function (it returns dict with 'results', 'status', etc.)
                    # The 'results' dict will contain exactly one key: metric_name
                    score_output = score_conversation_with_profile(
                        request.conversation,
                        temp_profile,
                        request.provider,
                        request.model,
                        api_key
                    )
                    
                    # Extract result for this metric
                    if score_output.get("status") == "success" and metric_name in score_output.get("results", {}):
                        yield json.dumps({
                            "type": "progress",
                            "metric": metric_name,
                            "status": "success",
                            "result": score_output["results"][metric_name]
                        }) + "\n"
                        successful_count += 1
                    else:
                        # Logic error or empty result
                        yield json.dumps({
                            "type": "progress",
                            "metric": metric_name,
                            "status": "error", 
                            "error": score_output.get("message", "Unknown error or missing metric in result")
                        }) + "\n"
                        
                except Exception as e:
                    logger.error(f"Stream error for custom metric {metric_name}: {str(e)}", exc_info=True)
                    yield json.dumps({
                        "type": "progress",
                        "metric": metric_name,
                        "status": "error",
                        "error": str(e)
                    }) + "\n"
            
            yield json.dumps({
                "type": "done",
                "successful_count": successful_count,
            }) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Custom stream setup error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/list_sources", response_model=ListSourcesResponse)
def list_sources_openai() -> ListSourcesResponse | dict:
    """
    List available example sources and topics.

    Returns the registry of available datasets with their evaluation topics.
    """
    try:
        grouped = get_sources_grouped()

        return ListSourcesResponse(
            sources=[
                ExampleSourceEntry(source=entry["source"], topic=entry["topic"])
                for entry in EXAMPLE_SOURCES
            ],
            grouped=grouped,
            total_sources=len(grouped),
            total_topics=len(EXAMPLE_SOURCES)
        )
    except Exception as e:
        return handle_openai_error(e, "listing sources")


@router.post("/select_from_sources", response_model=SelectFromSourcesResponse)
def select_from_sources_openai(request: SelectFromSourcesRequest) -> SelectFromSourcesResponse | dict:
    """
    Select examples from specified sources and topics.

    User provides a list of {source, topic, count} selections.
    Supports deterministic selection via optional seed parameter.
    """
    import random

    try:
        # Build selection list
        selections = [
            {"source": sel.source, "topic": sel.topic, "count": sel.count}
            for sel in request.selections
        ]

        # Fetch examples
        all_examples = fetch_examples_multi(selections)

        # Apply deterministic shuffle if seed is provided
        if request.seed is not None:
            random.seed(request.seed)
            all_examples = list(all_examples)  # Ensure it's a list for shuffling
            random.shuffle(all_examples)
            logger.info(f"Applied seed={request.seed} for deterministic selection of {len(all_examples)} examples")

        # Build preview
        preview = {
            "total_selected": len(all_examples),
            "by_source": {},
            "by_topic": {},
            "seed": request.seed,  # Include seed in preview for traceability
        }

        for ex in all_examples:
            source = ex.dimensions.get("source", "unknown")
            topic = ex.dimensions.get("topic", "unknown")
            preview["by_source"][source] = preview["by_source"].get(source, 0) + 1
            preview["by_topic"][topic] = preview["by_topic"].get(topic, 0) + 1

        return SelectFromSourcesResponse(
            preview=preview,
            examples=[
                ExampleRequest(
                    conversation=ex.conversation,
                    dimensions=ex.dimensions,
                    metrics_output=ex.metrics_output
                )
                for ex in all_examples
            ]
        )
    except Exception as e:
        return handle_openai_error(e, "selecting from sources")


# Legacy endpoints (kept for backward compatibility)
@router.get("/list_examples", response_model=ListExamplesResponse)
def list_examples_openai() -> ListExamplesResponse | dict:
    """
    Legacy: List examples with old dimension format.
    Use /openai/list_sources for the new source/topic structure.
    """
    try:
        all_examples = _fetch_all_examples()

        # Build dimension breakdown
        breakdown: dict = {"source": {}, "topic": {}}
        for ex in all_examples:
            source = ex.dimensions.get("source", "unknown")
            topic = ex.dimensions.get("topic", "unknown")
            breakdown["source"][source] = breakdown["source"].get(source, 0) + 1
            breakdown["topic"][topic] = breakdown["topic"].get(topic, 0) + 1

        return ListExamplesResponse(
            total=len(all_examples),
            dimension_breakdown=breakdown,
            examples=[
                ExampleRequest(
                    conversation=ex.conversation,
                    dimensions=ex.dimensions,
                    metrics_output=ex.metrics_output
                )
                for ex in all_examples
            ]
        )
    except Exception as e:
        return handle_openai_error(e, "listing examples")


@router.post("/select_examples", response_model=SelectExamplesResponse)
def select_examples_openai(request: SelectExamplesRequest) -> SelectExamplesResponse | dict:
    """
    Legacy: Select examples by dimension filters.
    Use /openai/select_from_sources for the new source/topic structure.
    """
    try:
        all_examples = _fetch_all_examples()

        res = select_examples(
            all_examples,
            dimension_filters=request.dimension_filters,
            per_dimension_counts=request.per_dimension_counts,
            global_cap=request.global_cap,
            seed=request.seed,
            preview=request.preview
        )

        selected = res.get("examples", [])
        preview = res.get("preview", {})

        return SelectExamplesResponse(
            preview=preview,
            examples=[
                ExampleRequest(
                    conversation=ex.conversation,
                    dimensions=ex.dimensions,
                    metrics_output=ex.metrics_output
                )
                for ex in selected
            ]
        )
    except Exception as e:
        return handle_openai_error(e, "selecting examples")

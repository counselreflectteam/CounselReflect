"""
API types and schemas.

Type definitions for evaluators and API request/response models.
"""
from __future__ import annotations

from typing import TypedDict, List, Optional, Literal, Union, Dict, Any
from pydantic import BaseModel, Field


# ============================================================================
# Evaluator Types (matching web/custom_types.py)
# ============================================================================

class Utterance(TypedDict):
    """Single utterance in a conversation."""
    speaker: str
    text: str


# Score types (mutually exclusive)
class CategoricalScore(TypedDict):
    """Categorical evaluation: only label"""
    type: Literal["categorical"]
    label: str  # e.g., "High", "Change", "Positive"
    confidence: Optional[float]  # Optional: 0-1 confidence if available
    highlighted_text: Optional[str]  # Optional: extracted sentence for highlighting


class NumericalScore(TypedDict):
    """Numerical evaluation: score with max value"""
    type: Literal["numerical"]
    value: float  # e.g., 3.0, 0.85, 8.5
    max_value: float  # e.g., 5.0, 1.0, 10.0
    label: Optional[str]  # Optional: derived label like "High" if value > threshold
    direction: Optional[Literal["higher_is_better", "lower_is_better"]]  # Default: higher_is_better
    highlighted_text: Optional[str]  # Optional: extracted sentence for highlighting


# Union type for metric scores
MetricScore = Union[CategoricalScore, NumericalScore]


# Evaluation result structures
class UtteranceScore(TypedDict):
    """Per-utterance evaluation result"""
    index: int  # Index in original conversation
    metrics: dict[str, MetricScore]  # e.g., {"talk_type": {...}, "empathy_er": {...}}
    reasoning: Optional[dict[str, str]]  # e.g., {"Empathy": "The utterance demonstrates..."}


class SegmentScore(TypedDict):
    """Multi-utterance segment evaluation result"""
    utterance_indices: List[int]  # Which utterances this segment covers
    metrics: dict[str, MetricScore]  # Aggregate metrics for this segment


class EvaluationResult(TypedDict):
    """
    Unified evaluation result format.

    Based on granularity, only one of overall/per_utterance/per_segment will be populated:
    - granularity="utterance": per_utterance has data
    - granularity="segment": per_segment has data
    - granularity="conversation": overall has data
    """
    granularity: Literal["utterance", "segment", "conversation"]
    overall: Optional[dict[str, MetricScore]]  # Conversation-level scores
    per_utterance: Optional[List[UtteranceScore]]  # Per-utterance scores
    per_segment: Optional[List[SegmentScore]]  # Per-segment scores


# ============================================================================
# API Response Models (Pydantic models for FastAPI)
# ============================================================================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str


class MetricInfo(BaseModel):
    """Metric information."""
    name: str
    label: str
    description: str
    category: str
    requires_hf: bool = Field(default=False, alias='requiresHf')
    target: TargetSpeaker = Field(default="therapist", description="Which speaker's turns to analyze: 'therapist', 'patient', or 'both'")
    reference: Optional["MetricReference"] = Field(default=None, description="Citation/model card/source info")

    class Config:
        populate_by_name = True  # Allow both requires_hf and requiresHf
        by_alias = True  # Serialize using alias (requiresHf) in JSON output


class MetricsResponse(BaseModel):
    """Response for metrics listing."""
    metrics: List[MetricInfo]
    total: int
    by_category: Dict[str, List[str]]


class MetricReference(BaseModel):
    """Structured citation info for predefined metrics."""
    short_apa: Optional[str] = Field(default=None, alias='shortApa')
    title: Optional[str] = None
    citation: Optional[str] = None
    url: Optional[str] = None

    class Config:
        populate_by_name = True
        by_alias = True


# ============================================================================
# Evaluation Request/Response Models
# ============================================================================

class EvaluationRequest(BaseModel):
    """Request model for evaluation endpoint."""
    conversation: List[Dict[str, str]] = Field(
        ..., 
        description="Conversation history as a list of message dictionaries (e.g. [{'speaker': 'Therapist', 'text': '...'}])"
    )
    metrics: List[str] = Field(
        ..., 
        min_length=1, 
        description="List of metrics to evaluate (e.g., ['talk_type', 'empathy_er'])"
    )
    provider: str = Field(
        ..., 
        description="LLM provider to use (e.g., 'openai', 'gemini', 'claude', 'ollama')"
    )
    model: str = Field(
        ..., 
        description="Model identifier to use for evaluation (e.g., 'gpt-4o')"
    )
    api_key: str = Field(
        ..., 
        description="API key for LLM provider"
    )
    huggingface_api_key: str = Field(
        ..., 
        description="API key for HuggingFace"
    )



class EvaluationResponse(BaseModel):
    """Response model for evaluation endpoint."""
    results: Dict[str, Dict]  # metric_name -> EvaluationResult (as dict)
    status: str  # "success", "partial", "error"
    message: Optional[str] = None

    class Config:
        # Allow arbitrary types for EvaluationResult dict
        arbitrary_types_allowed = True


# ============================================================================
# Feedback Request/Response Models
# ============================================================================

class FeedbackSubmitRequest(BaseModel):
    """Request model for user feedback / feature requests."""
    title: str = Field(..., max_length=200, description="Short title for the request")
    message: Optional[str] = Field(default=None, max_length=5000, description="Detailed feedback text")
    details: Optional[str] = Field(default=None, max_length=5000, description="Alias for message")
    user_email: Optional[str] = Field(default=None, max_length=254, description="User contact email")
    category: str = Field(
        default="feedback",
        description="feedback, feature_request, propose_new_metrics, or other"
    )


class FeedbackSubmitResponse(BaseModel):
    """Response model for feedback submission endpoint."""
    status: str
    message: str


# ============================================================================
# OpenAI Workflow Request Models
# ============================================================================

class RefineMetricsRequest(BaseModel):
    """Request model for metrics refinement endpoint."""
    raw_notes: Optional[str] = Field(default=None, description="User's rough metric description (required for initial refinement)")
    api_key: Optional[str] = Field(default=None, description="API key for LLM provider (uses env var if not provided)")
    provider: str = Field(default="openai", description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(default="gpt-4o", description="Model identifier to use for refinement")
    feedback: Optional[str] = Field(default="", description="Optional feedback for iteration")
    current_refined_metrics: Optional[List[MetricDefinitionResponse]] = Field(default=None, description="Current refined metrics for iterative refinement")


class ScoreMetricRequest(BaseModel):
    """Request model for metric scoring endpoint."""
    text: str = Field(..., min_length=1, description="Text to score")
    metric_name: str = Field(..., min_length=1, description="Name of the metric to evaluate")
    api_key: Optional[str] = Field(default=None, description="API key for LLM provider (uses env var if not provided)")
    provider: str = Field(default="openai", description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(default="gpt-4o", description="Model identifier to use for scoring")
    scale: str = Field(default="0-10", description="Metric scale")
    description: Optional[str] = Field(default="", description="Metric description")
    guidance: Optional[str] = Field(default="", description="Optional guidance for scoring")


class MetricDefinitionResponse(BaseModel):
    """Metric definition in response."""
    name: str
    description: str
    scale: str
    guidance: str
    examples: List[str]
    target: TargetSpeaker = Field(default="both", description="Which speaker's turns to analyze: 'therapist', 'patient', or 'both'")


class RefineMetricsResponse(BaseModel):
    """Response model for metrics refinement endpoint."""
    version: str
    metrics: List[MetricDefinitionResponse]
    notes: str
    raw_notes: str


class ScoreMetricResponse(BaseModel):
    """Response model for metric scoring endpoint."""
    value: Optional[float] = None
    rationale: str
    label: Optional[str] = None


# ============================================================================
# Example and Profile Management Request/Response Models
# ============================================================================

class ExampleRequest(BaseModel):
    """Example conversation with dimensions."""
    conversation: List[Dict[str, str]] = Field(..., description="Conversation as list of dicts with 'role' and 'content'")
    dimensions: Dict[str, str] = Field(default_factory=dict, description="Dimension tags (topic, intent, risk_level, length, tone)")
    metrics_output: Optional[Dict[str, Any]] = Field(default=None, description="Optional scoring results")


class UpdateExampleOutputsRequest(BaseModel):
    """Request to update example outputs."""
    examples: List[ExampleRequest] = Field(..., description="List of examples with current outputs")
    rubric: RefineMetricsResponse = Field(..., description="Current refined metrics")
    feedback: str = Field(..., description="User feedback about outputs")
    api_key: Optional[str] = Field(default=None, description="API key for LLM provider")
    provider: str = Field(default="openai", description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(default="gpt-4o", description="Model identifier to use")


class UpdateRubricFromExamplesRequest(BaseModel):
    """Request to update rubric from examples."""
    rubric: RefineMetricsResponse = Field(..., description="Current refined metrics")
    example_outputs: List[Dict[str, Any]] = Field(..., description="List of example scoring outputs")
    feedback: str = Field(..., description="User feedback about rubric")
    api_key: Optional[str] = Field(default=None, description="API key for LLM provider")
    provider: str = Field(default="openai", description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(default="gpt-4o", description="Model identifier to use")


class RescoreExamplesRequest(BaseModel):
    """Request to rescore examples."""
    examples: List[ExampleRequest] = Field(..., description="List of examples to rescore")
    rubric: RefineMetricsResponse = Field(..., description="Updated refined metrics")
    api_key: Optional[str] = Field(default=None, description="API key for LLM provider")
    provider: str = Field(default="openai", description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(default="gpt-4o", description="Model identifier to use")
    user_preferences: Optional[Dict[str, Any]] = Field(default=None, description="Optional user preferences")


class LockProfileRequest(BaseModel):
    """Request to lock a profile."""
    rubric: RefineMetricsResponse = Field(..., description="Final refined metrics")
    user_preferences: Dict[str, Any] = Field(default_factory=dict, description="User preferences")
    canonical_examples: List[ExampleRequest] = Field(..., description="Canonical examples with final outputs")
    version: Optional[str] = Field(default=None, description="Optional profile version")


class ScoreWithProfileRequest(BaseModel):
    """Request to score conversation with locked profile."""
    conversation: List[Dict[str, str]] = Field(..., description="Conversation as list of dicts with 'role' and 'content'")
    profile: LockProfileRequest = Field(..., description="Locked profile")
    api_key: Optional[str] = Field(default=None, description="API key for LLM provider")
    provider: str = Field(default="openai", description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(default="gpt-4o", description="Model identifier to use")


# ============================================================================
# Example Source/Topic Registry
# ============================================================================

class ExampleSourceEntry(BaseModel):
    """Single source+topic entry in the registry."""
    source: str = Field(..., description="Dataset/database name (e.g., 'CounselBench')")
    topic: str = Field(..., description="Evaluation topic (e.g., 'toxic_eval')")


class ListSourcesResponse(BaseModel):
    """List available example sources and topics."""
    sources: List[ExampleSourceEntry] = Field(..., description="List of source+topic entries")
    grouped: Dict[str, List[str]] = Field(..., description="Sources grouped by source name -> topics")
    total_sources: int = Field(..., description="Count of unique sources")
    total_topics: int = Field(..., description="Total source+topic combinations")


class ExampleSelectionEntry(BaseModel):
    """Single selection entry for fetching examples."""
    source: str = Field(..., description="Dataset/database name")
    topic: str = Field(..., description="Evaluation topic")
    count: int = Field(default=5, description="Number of examples to fetch from this source+topic")


class SelectFromSourcesRequest(BaseModel):
    """Request to select examples from specified sources."""
    selections: List[ExampleSelectionEntry] = Field(..., description="List of source+topic+count selections")
    seed: Optional[int] = Field(default=None, description="Random seed for reproducible selection")


class SelectFromSourcesResponse(BaseModel):
    """Response with selected examples from sources."""
    preview: Dict[str, Any] = Field(..., description="Summary of selection")
    examples: List[ExampleRequest] = Field(..., description="Selected examples")


# ============================================================================
# Legacy Example listing/selection (for backward compatibility)
# ============================================================================

class ListExamplesResponse(BaseModel):
    """List available examples and dimension stats."""
    total: int
    dimension_breakdown: Dict[str, Dict[str, int]]
    examples: List[ExampleRequest]


class SelectExamplesRequest(BaseModel):
    """Request to select examples based on dimension filters and counts."""
    dimension_filters: Optional[Dict[str, str]] = Field(default=None, description="Filter examples by dimension values")
    per_dimension_counts: Optional[Dict[str, int]] = Field(default=None, description="Counts per dimension value")
    global_cap: Optional[int] = Field(default=None, description="Global cap on examples")
    seed: Optional[int] = Field(default=None, description="Random seed")
    preview: bool = Field(default=False, description="If true, return preview only")


class SelectExamplesResponse(BaseModel):
    """Selected examples and preview info."""
    preview: Dict[str, Any]
    examples: List[ExampleRequest]


# ============================================================================
# Target Speaker Type
# ============================================================================

# Type for specifying which conversation turns a metric should analyze
TargetSpeaker = Literal["therapist", "patient", "both"]


# ============================================================================
# Literature Metrics
# ============================================================================

class LiteratureMetric(BaseModel):
    """Single literature-based therapeutic metric with generated rubric."""
    metric_name: str = Field(..., description="Name of the therapeutic metric")
    definition: str = Field(..., description="Definition of the metric")
    why_this_matters: str = Field(..., description="Explanation of why this metric is important")
    references: List[str] = Field(..., description="List of reference URLs")
    need_highlight: bool = Field(default=False, description="Whether to extract and highlight original sentences for high scores")
    category: Optional[str] = Field(default="Other", description="Category/subcategory of the metric")
    target: TargetSpeaker = Field(default="therapist", description="Which speaker's turns to analyze: 'therapist', 'patient', or 'both'")
    level_1_description: Optional[str] = Field(default=None, description="Description of level 1")
    level_3_description: Optional[str] = Field(default=None, description="Description of level 3")
    level_5_description: Optional[str] = Field(default=None, description="Description of level 5")


class LiteratureMetricsResponse(BaseModel):
    """Response containing all literature-based metrics."""
    metrics: List[LiteratureMetric] = Field(..., description="List of all literature metrics")
    total: int = Field(..., description="Total number of metrics")


class LiteratureEvaluationRequest(BaseModel):
    """Request for literature-based evaluation using LLM and rubrics."""
    conversation: List[Dict[str, str]] = Field(..., description="Conversation messages with role and content")
    metric_names: List[str] = Field(..., min_length=1, description="Selected metric names to evaluate")
    api_key: str = Field(..., description="API key for LLM provider")
    provider: str = Field(..., description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(..., description="Model identifier to use for evaluation")


class LiteratureEvaluationResponse(BaseModel):
    """Response for literature-based evaluation."""
    results: Dict[str, Dict] = Field(..., description="Metric name -> EvaluationResult dict")
    status: str = Field(..., description="success/partial/error")
    message: Optional[str] = Field(None, description="Status message or error details")
    metrics_evaluated: int = Field(..., description="Number of metrics successfully evaluated")
    total_metrics: int = Field(..., description="Total metrics requested")


# ============================================================================
# LLM Provider Models
# ============================================================================

class ModelInfoSchema(BaseModel):
    """Information about an available LLM model."""
    id: str = Field(..., description="Model identifier (e.g., 'gpt-4o')")
    name: str = Field(..., description="Human-readable model name")
    provider: str = Field(..., description="Provider identifier")


class ModelsResponse(BaseModel):
    """Response listing all available models."""
    providers: Dict[str, List[ModelInfoSchema]] = Field(..., description="Models grouped by provider")
    total_models: int = Field(..., description="Total number of available models")


class ValidateKeyRequest(BaseModel):
    """Request to validate an API key."""
    provider: str = Field(..., description="Provider name: 'openai', 'gemini', 'claude', 'ollama'")
    api_key: str = Field(..., description="API key to validate")


class ValidateKeyResponse(BaseModel):
    """Response for API key validation."""
    valid: bool = Field(..., description="Whether the API key is valid")
    provider: str = Field(..., description="Provider that was validated")
    message: Optional[str] = Field(None, description="Status message or error details")


# ============================================================================
# Summary and Chatbot Models
# ============================================================================

class SummaryRequest(BaseModel):
    """Request for generating evaluation summary."""
    conversation: List[Dict[str, str]] = Field(..., description="Conversation messages")
    evaluation_results: Dict[str, Any] = Field(..., description="Evaluation results with scores")
    api_key: Optional[str] = Field(default=None, description="API key for LLM provider")
    provider: str = Field(default="openai", description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(default="gpt-4o", description="Model identifier to use")
    use_turn_numbers: bool = Field(default=False, description="Use turn numbers instead of line numbers (extension only)")


class SummaryResponse(BaseModel):
    """Response containing evaluation summary."""
    overall_performance: str = Field(..., description="Overall performance summary")
    strengths: List[str] = Field(..., description="List of strengths/positive observations")
    areas_for_improvement: List[str] = Field(..., description="List of areas needing improvement")
    key_insights: List[str] = Field(..., description="Key insights and actionable recommendations")


class ChatbotMessage(BaseModel):
    """Single message in chatbot conversation."""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ChatbotRequest(BaseModel):
    """Request for chatbot conversation."""
    conversation: List[Dict[str, str]] = Field(..., description="Original conversation being evaluated")
    evaluation_results: Dict[str, Any] = Field(..., description="Evaluation results")
    messages: List[ChatbotMessage] = Field(..., description="Chat history")
    api_key: Optional[str] = Field(default=None, description="API key for LLM provider")
    provider: str = Field(default="openai", description="LLM provider: 'openai', 'gemini', 'claude', 'ollama'")
    model: str = Field(default="gpt-4o", description="Model identifier to use")
    user_role: Optional[str] = Field(default=None, description="User's role: 'therapist' or 'patient'")
    use_turn_numbers: bool = Field(default=False, description="Use turn numbers instead of line numbers (extension only)")


class ChatbotResponse(BaseModel):
    """Response from chatbot."""
    message: str = Field(..., description="Assistant's response message")

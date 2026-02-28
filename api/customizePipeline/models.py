"""Data models for LLM Therapist Tool workflow.

Contains dataclasses representing metrics, profiles, and related structures.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Literal

# Type for specifying which conversation turns a metric should analyze
TargetSpeaker = Literal["therapist", "patient", "both"]


@dataclass
class MetricDefinition:
    """Definition of a single evaluation metric.
    
    Attributes:
        name: Metric name
        description: Detailed description of what the metric measures
        scale: Scale type (e.g., "0-5 integer", "0-1 float", "enum{...}")
        guidance: Instructions for how to evaluate this metric
        examples: List of example scenarios/values (max 4)
        target: Which speaker's turns to analyze ('therapist', 'patient', or 'both')
    """
    name: str
    description: str
    scale: str
    guidance: str
    examples: List[str]
    target: TargetSpeaker = field(default="both")


@dataclass
class RefinedMetrics:
    """Collection of refined metrics with version tracking.
    
    Attributes:
        version: Version identifier (e.g., "v1", "v2")
        metrics: List of metric definitions
        notes: Optional notes about this metric set
    """
    version: str
    metrics: List[MetricDefinition]
    notes: str = ""


@dataclass
class Example:
    """Example conversation with dimension tags and optional metric outputs.
    
    Attributes:
        conversation: Conversation as list of turn dicts with "role" and "content"
        dimensions: Dictionary of dimension tags (topic, intent, risk_level, length, tone)
        metrics_output: Optional scoring results for this example
    """
    conversation: List[Dict[str, str]]
    dimensions: Dict[str, str]
    metrics_output: Optional[Dict[str, Any]] = None


@dataclass
class Profile:
    """Complete evaluation profile with metrics and examples.
    
    Attributes:
        version: Profile version identifier
        refined_metrics: The metric definitions used (locked, exactly N metrics, 1:1 to user's list)
        user_preferences: User-specified preferences for evaluation
        canonical_examples: List of example conversations with their final metric outputs
    """
    version: str
    refined_metrics: RefinedMetrics
    user_preferences: Dict[str, Any]
    canonical_examples: List[Example]

"""
Evaluator Registry - Central registration for all API evaluators.

This module provides a registry pattern for managing evaluators.
Each metric name maps to exactly one evaluator class with optional metadata.
"""
from typing import Dict, Type, Optional, TypedDict
from dataclasses import dataclass
from evaluators.base import Evaluator


class MetricReference(TypedDict, total=False):
    """Reference metadata for UI display."""
    shortApa: str
    title: str
    citation: str
    url: str


@dataclass
class MetricInfo:
    """Metadata for a metric (used for API responses)."""
    key: str
    label: str
    description: str = ""
    category: str = ""  # Optional: group metrics by category
    requires_hf: bool = False  # Whether this metric requires HuggingFace API key
    target: str = "both"  # Who this metric evaluates: "therapist", "patient", or "both"
    reference: Optional[MetricReference] = None  # Citation/model card/source info for UI display


class EvaluatorRegistry:
    """Registry for managing evaluator classes and their metadata."""
    
    def __init__(self):
        self._registry: Dict[str, Type[Evaluator]] = {}
        self._metadata: Dict[str, MetricInfo] = {}
    
    def register(
        self, 
        metric_name: str, 
        evaluator_class: Type[Evaluator],
        label: Optional[str] = None,
        description: str = "",
        category: str = "",
        requires_hf: bool = False,
        target: str = "both",
        reference: Optional[MetricReference] = None
    ):
        """
        Register an evaluator class for a metric with optional metadata.
        
        Args:
            metric_name: The metric name (e.g., "talk_type", "empathy_er")
            evaluator_class: The evaluator class
            label: Human-readable label (defaults to formatted metric_name)
            description: Description of what this metric measures
            category: Optional category for grouping metrics
            requires_hf: Whether this metric requires HuggingFace API key
            target: Who this metric evaluates: "therapist", "patient", or "both"
            reference: Citation/model card/source info for UI display
        """
        if metric_name in self._registry:
            raise ValueError(f"Metric '{metric_name}' is already registered")
        
        self._registry[metric_name] = evaluator_class
        self._metadata[metric_name] = MetricInfo(
            key=metric_name,
            label=label or metric_name.replace('_', ' ').title(),
            description=description,
            category=category,
            requires_hf=requires_hf,
            target=target,
            reference=reference
        )
    
    def get(self, metric_name: str) -> Optional[Type[Evaluator]]:
        """
        Get the evaluator class for a metric.
        
        Args:
            metric_name: The metric name
            
        Returns:
            Evaluator class or None if not found
        """
        return self._registry.get(metric_name)
    
    def get_metadata(self, metric_name: str) -> Optional[MetricInfo]:
        """Get metadata for a metric."""
        return self._metadata.get(metric_name)
    
    def list_metrics(self) -> list[str]:
        """Get list of all registered metric names."""
        return list(self._registry.keys())
    
    def get_ui_labels(self) -> Dict[str, str]:
        """Get metric key -> label mapping."""
        return {k: v.label for k, v in self._metadata.items()}
    
    def get_metrics_by_category(self) -> Dict[str, list[str]]:
        """Get metrics grouped by category."""
        categories: Dict[str, list[str]] = {}
        for key, info in self._metadata.items():
            cat = info.category or "Other"
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(key)
        return categories
    
    def create_evaluator(self, metric_name: str, **kwargs) -> Optional[Evaluator]:
        """
        Create an evaluator instance for a metric.
        
        Args:
            metric_name: The metric name
            **kwargs: Arguments to pass to evaluator constructor
            
        Returns:
            Evaluator instance or None if metric not found
        """
        evaluator_class = self.get(metric_name)
        if evaluator_class:
            return evaluator_class(**kwargs)
        return None


# Global registry instance
_global_registry = EvaluatorRegistry()


def register_evaluator(
    metric_name: str,
    label: Optional[str] = None,
    description: str = "",
    category: str = "",
    requires_hf: bool = False,
    target: str = "both",
    reference: Optional[MetricReference] = None
):
    """
    Decorator to register an evaluator class with optional metadata.
    
    Args:
        metric_name: Unique metric identifier
        label: Human-readable label (optional)
        description: What this metric measures
        category: Category for grouping (e.g., "Empathy", "Communication")
        requires_hf: Whether this metric requires HuggingFace API key
        target: Who this metric evaluates: "therapist", "patient", or "both"
        reference: Citation/model card/source info for UI display
    
    Usage:
        @register_evaluator("example_metric", label="Example Metric", category="Test", target="therapist")
        class ExampleEvaluator(Evaluator):
            METRIC_NAME = "example_metric"
            ...
    """
    def decorator(evaluator_class: Type[Evaluator]):
        _global_registry.register(
            metric_name,
            evaluator_class,
            label,
            description,
            category,
            requires_hf,
            target,
            reference
        )
        return evaluator_class
    return decorator


def get_evaluator_class(metric_name: str) -> Optional[Type[Evaluator]]:
    """Get evaluator class for a metric."""
    return _global_registry.get(metric_name)


def create_evaluator(metric_name: str, **kwargs) -> Optional[Evaluator]:
    """Create evaluator instance for a metric."""
    return _global_registry.create_evaluator(metric_name, **kwargs)


def get_metric_metadata(metric_name: str) -> Optional[MetricInfo]:
    """Get metadata for a specific metric."""
    return _global_registry.get_metadata(metric_name)


def list_available_metrics() -> list[str]:
    """Get list of all available metrics."""
    return _global_registry.list_metrics()


def get_ui_labels() -> Dict[str, str]:
    """Get metric key -> label mapping."""
    return _global_registry.get_ui_labels()


def get_metrics_by_category() -> Dict[str, list[str]]:
    """Get metrics grouped by category."""
    return _global_registry.get_metrics_by_category()


def get_registry() -> EvaluatorRegistry:
    """Get the global registry instance."""
    return _global_registry

"""Example management with source/topic-based selection.

Simplified to work with the example_store registry pattern.
Users select source + topic, then fetch examples from those sources.
"""
import random
from typing import List, Dict, Any, Optional
from .models import Example


# Legacy function for backward compatibility (used by /list_examples, /select_examples routes)
def select_examples(
    examples: List[Example],
    dimension_filters: Optional[Dict[str, Any]] = None,
    per_dimension_counts: Optional[Dict[str, int]] = None,
    global_cap: Optional[int] = None,
    seed: Optional[int] = None,
    preview: bool = False
) -> Any:
    """
    Legacy selection function - now works with source/topic dimensions.
    
    Routes use list_sources and select_from_sources instead.
    """
    if seed is not None:
        random.seed(seed)
    
    # Apply dimension filters (source, topic)
    filtered = examples
    if dimension_filters:
        filtered = [
            ex for ex in examples
            if all(
                ex.dimensions.get(dim) == value
                for dim, value in dimension_filters.items()
            )
        ]
    
    # Apply global cap
    if global_cap and len(filtered) > global_cap:
        filtered = random.sample(filtered, global_cap)
    
    preview_info = {
        "total_selected": len(filtered),
        "by_source": {},
        "by_topic": {},
    }
    
    for ex in filtered:
        source = ex.dimensions.get("source", "unknown")
        topic = ex.dimensions.get("topic", "unknown")
        preview_info["by_source"][source] = preview_info["by_source"].get(source, 0) + 1
        preview_info["by_topic"][topic] = preview_info["by_topic"].get(topic, 0) + 1
    
    if preview:
        return {"preview": preview_info, "examples": []}
    
    return {"preview": preview_info, "examples": filtered}

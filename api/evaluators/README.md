# Evaluators Module

The evaluators module provides a flexible, extensible system for evaluating therapist-patient conversations using various metrics. Each evaluator computes exactly one metric and can operate at different granularities (conversation, utterance, or segment level).

## Architecture

The evaluators system uses a **registry pattern** to manage evaluator classes and their metadata. This allows for:
- Automatic discovery of available metrics
- Centralized registration and metadata management
- Easy addition of new evaluators without modifying core code

## Module Structure

```
evaluators/
├── __init__.py              # Module exports and auto-registration
├── base.py                  # Base Evaluator class
├── registry.py              # Registry system for managing evaluators
└── impl/                    # Concrete evaluator implementations
    ├── __init__.py
    ├── emotion_evaluator.py
    ├── emotional_support_strategy_evaluator.py
    ├── empathy_er_evaluator.py
    ├── empathy_ex_evaluator.py
    ├── empathy_ip_evaluator.py
    ├── fact_evaluator.py
    ├── medscore_evaluator.py
    ├── pair_evaluator.py
    ├── perspective_evaluator.py
    ├── reccon_evaluator.py
    ├── talk_type_evaluator.py
    └── toxicity_evaluator.py
```

## Available Evaluators

The `impl/` directory contains a variety of pre-built evaluators for different aspects of conversation analysis. Current implementations include:

- **Emotion Evaluator**: Detects the explicit emotion shown in utterances.
- **Emotional Support Strategy**: Classifies the type of emotional support mechanism used by the therapist.
- **Empathy Evaluators**: Suite of metrics for empathy, capturing Emotional Reactions (`empathy_er`), Explorations (`empathy_ex`), and Interpretations (`empathy_ip`).
- **Fact Evaluator**: Checks factuality and accuracy (often requires LLMs).
- **MedScore Evaluator**: Medical evaluation score.
- **PAIR Evaluator**: Evaluates the patient-therapist bond/alliance.
- **Perspective Evaluator**: Identifies point-of-view considerations.
- **RECCON Evaluator**: Recognizes emotion cause in conversations.
- **Talk Type Evaluator**: Categorizes if the utterance is Change/Neutral/Sustain talk.
- **Toxicity Evaluator**: Detects toxic language and tone.

## Core Components

### Base Evaluator (`base.py`)

All evaluators must inherit from the `Evaluator` abstract base class:

```python
from evaluators.base import Evaluator
from schemas import Utterance, EvaluationResult

class MyEvaluator(Evaluator):
    METRIC_NAME = "my_metric"
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        # Implementation here
        pass
```

**Key Requirements**:
- Must define `METRIC_NAME` class attribute
- Must implement `execute()` method
- Must return an `EvaluationResult` with appropriate granularity

### Registry System (`registry.py`)

The registry manages evaluator classes and their metadata:

- **Registration**: Decorator-based registration with metadata
- **Discovery**: List all available metrics
- **Creation**: Factory function to create evaluator instances
- **Metadata**: Labels, descriptions, and categories for UI display

### Evaluator Implementation (`impl/`)

Concrete evaluators are implemented in the `impl/` subdirectory. Each evaluator:
- Inherits from `Evaluator`
- Uses the `@register_evaluator` decorator
- Implements the `execute()` method
- Returns standardized `EvaluationResult` objects

## Creating a New Evaluator

### Step 1: Create the Evaluator Class

Create a new file in `evaluators/impl/` (e.g., `my_evaluator.py`):

```python
from typing import List
from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import (
    create_categorical_score,
    create_numerical_score,
    create_utterance_result,
    create_conversation_result,
    create_segment_result
)

@register_evaluator(
    "my_metric",
    label="My Metric",
    description="What this metric measures",
    category="Category Name"
)
class MyEvaluator(Evaluator):
    METRIC_NAME = "my_metric"
    
    def __init__(self, **kwargs):
        super().__init__()
        # Initialize any required resources (API clients, models, etc.)
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        # Your evaluation logic here
        # Return an EvaluationResult with appropriate granularity
        pass
```

### Step 2: Import in `__init__.py`

Add an import statement to `evaluators/__init__.py` to trigger registration:

```python
try:
    from evaluators.impl.my_evaluator import MyEvaluator
except ImportError:
    pass
```

The `try/except` block ensures the module can be imported even if dependencies are missing.

### Step 3: Implement Evaluation Logic

Choose the appropriate granularity for your metric:

#### Utterance-Level Evaluation

Returns scores for each individual utterance:

```python
def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
    scores_per_utterance = []
    
    for utt in conversation:
        # Evaluate this utterance
        score = self._evaluate_utterance(utt)
        scores_per_utterance.append({
            "my_metric": create_categorical_score(label=score)
        })
    
    return create_utterance_result(conversation, scores_per_utterance)
```

#### Conversation-Level Evaluation

Returns aggregate scores for the entire conversation:

```python
def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
    # Evaluate entire conversation
    overall_score = self._evaluate_conversation(conversation)
    
    return create_conversation_result({
        "my_metric": create_numerical_score(
            value=overall_score,
            max_value=10.0,
            label="High" if overall_score > 7.0 else "Low"
        )
    })
```

#### Segment-Level Evaluation

Returns scores for groups of utterances:

```python
def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
    segments = self._identify_segments(conversation)
    segment_scores = []
    
    for segment_indices in segments:
        segment_utterances = [conversation[i] for i in segment_indices]
        score = self._evaluate_segment(segment_utterances)
        segment_scores.append((
            segment_indices,
            {"my_metric": create_categorical_score(label=score)}
        ))
    
    return create_segment_result(segment_scores)
```

## Score Types

Evaluators can return two types of scores:

### Categorical Scores

For classification tasks (e.g., "High", "Medium", "Low"):

```python
create_categorical_score(
    label="High",
    confidence=0.95  # Optional
)
```

### Numerical Scores

For continuous metrics (e.g., 8.5 out of 10.0):

```python
create_numerical_score(
    value=8.5,
    max_value=10.0,
    label="High"  # Optional derived label
)
```

## Example: Talk Type Evaluator

The `TalkTypeEvaluator` provides a complete example:

- **Metric**: `talk_type`
- **Granularity**: Utterance-level
- **Score Type**: Categorical (Change/Neutral/Sustain)
- **Implementation**: Uses Replicate API to call a BERT model

Key features:
- Filters to only evaluate patient utterances
- Handles API key configuration
- Includes error handling and logging
- Returns per-utterance categorical scores

## Registry Functions

The registry provides several utility functions:

### `list_available_metrics() -> List[str]`
Returns a list of all registered metric names.

### `get_metric_metadata(metric_name: str) -> Optional[MetricInfo]`
Returns metadata (label, description, category) for a metric.

### `get_metrics_by_category() -> Dict[str, List[str]]`
Groups metrics by category for UI display.

### `create_evaluator(metric_name: str, **kwargs) -> Optional[Evaluator]`
Factory function to create an evaluator instance.

### `get_ui_labels() -> Dict[str, str]`
Returns a mapping of metric names to human-readable labels.

## Best Practices

1. **Error Handling**: Wrap API calls and model inference in try/except blocks
2. **Logging**: Use the logging module for debugging and monitoring
3. **Documentation**: Include docstrings explaining what the metric measures
4. **Type Hints**: Use proper type annotations for better IDE support
5. **Configuration**: Accept API keys and configuration via `__init__` and `execute()` kwargs
6. **Validation**: Validate inputs before processing
7. **Performance**: Consider caching or batching for expensive operations

## Testing Evaluators

Test your evaluator by:

1. Creating a test conversation
2. Instantiating the evaluator
3. Calling `execute()` with the conversation
4. Verifying the result structure and values

Example:
```python
from evaluators.impl.my_evaluator import MyEvaluator
from schemas import Utterance

conversation = [
    {"speaker": "Therapist", "text": "Hello"},
    {"speaker": "Patient", "text": "Hi"}
]

evaluator = MyEvaluator()
result = evaluator.execute(conversation)

assert result["granularity"] == "utterance"
assert len(result["per_utterance"]) == 2
```

## Dependencies

Evaluators may have additional dependencies beyond the base requirements:
- **Replicate**: For cloud-based ML model inference
- **Transformers**: For local model inference
- **NumPy/SciPy**: For numerical computations
- **Other domain-specific libraries**

Document any additional dependencies in the evaluator's docstring or module-level comments.

## Future Enhancements

Potential improvements to the evaluator system:
- Async/await support for I/O-bound evaluators
- Caching layer for expensive computations
- Batch processing for multiple conversations
- Evaluation result validation
- Performance metrics and profiling


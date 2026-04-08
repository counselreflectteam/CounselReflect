"""
Base evaluator class for API evaluators.

All evaluators should inherit from this class.
"""
from abc import ABC, abstractmethod
from typing import List
from schemas import Utterance, EvaluationResult


class Evaluator(ABC):
    """
    Base class for all API evaluators.
    Each evaluator should compute exactly one metric.
    """
    
    # Subclasses should define this
    METRIC_NAME: str = None
    
    def __init__(self):
        super().__init__()
        if self.METRIC_NAME is None:
            raise NotImplementedError(f"{self.__class__.__name__} must define METRIC_NAME")

    @abstractmethod
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate a conversation.
        
        Args:
            conversation: Full conversation as list of utterances.
                         Each utterance has keys: 'speaker', 'text'.
            **kwargs: Additional evaluator-specific parameters
                      (e.g., api_keys, inference_backend)
            
        Returns:
            EvaluationResult with one of three granularities:
            - "utterance": per_utterance contains scores for each utterance
            - "segment": per_segment contains scores for utterance groups
            - "conversation": overall contains aggregate scores for entire conversation
        """
        ...


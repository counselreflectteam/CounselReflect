"""
Emotion Evaluator

Classifies emotions using j-hartmann/emotion-english-roberta-large model
via Hugging Face Inference API using huggingface_hub InferenceClient.
"""
from typing import List, Dict, Any, Optional
import logging
import os
from huggingface_hub import InferenceClient

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_categorical_score, create_utterance_result

# Setup logger
logger = logging.getLogger(__name__)

@register_evaluator(
    "emotion",
    label="Emotion Classification",
    description="Classifies emotions using j-hartmann roberta-large emotion model",
    category="Emotion",
    requires_hf=True,
    target="both",
    reference={
        "shortApa": "Hartmann et al. (n.d.)",
        "title": "emotion-english-roberta-large model card",
        "citation": "Hartmann, J., et al. (n.d.). emotion-english-roberta-large [Model card]. Hugging Face.",
        "url": "https://huggingface.co/j-hartmann/emotion-english-roberta-large"
    }
)
class EmotionEvaluator(Evaluator):
    """Evaluator for emotion classification using HF Inference API."""
    
    METRIC_NAME = "emotion"
    
    # HF model name for emotion classification
    HF_MODEL_NAME = "j-hartmann/emotion-english-roberta-large"
    
    # Emotion labels
    EMOTION_LABELS = ["joy", "sadness", "anger", "fear", "surprise", "disgust", "neutral"]
    
    def __init__(self, **kwargs):
        """
        Initialize Emotion Evaluator.
        
        Args:
            **kwargs: Additional parameters, must contain model_config with huggingface_api_key
        """
        super().__init__()
        
        # Get HF API token
        model_config = kwargs.get("model_config", {})
        self.hf_token = model_config.get("huggingface_api_key")
        
        # Initialize Hugging Face InferenceClient
        self.hf_client = InferenceClient(
            provider="hf-inference",
            api_key=self.hf_token
        )
        
        logger.info(f"Initialized {self.METRIC_NAME} evaluator with HF Inference API")
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate emotions for each utterance in the conversation.
        
        Args:
            conversation: List of utterances with 'speaker' and 'text'
            **kwargs: Additional runtime parameters (ignored)
            
        Returns:
            EvaluationResult with per-utterance scores
        """
        scores_per_utterance = []
        
        for utt in conversation:
            emotions = self._predict_single(utt["text"])
            
            # Get top emotion
            top_emotion = max(emotions.items(), key=lambda x: x[1])
            
            # Return as categorical score with all emotions
            scores_per_utterance.append({
                "emotion": {
                    "type": "categorical",
                    "label": top_emotion[0],
                    "confidence": top_emotion[1],
                    "all_emotions": emotions  # Include all emotions for detailed view
                }
            })
        
        return create_utterance_result(conversation, scores_per_utterance)
    
    def _predict_single(self, text: str) -> Dict[str, float]:
        """
        Predict emotions for a single utterance using HF Inference API.
        
        Args:
            text: Utterance text
            
        Returns:
            Dictionary mapping emotion labels to scores
        """
        try:
            # Truncate text to model's max token limit (~512 tokens)
            MAX_TEXT_LENGTH = 1800  # Conservative estimate for ~450 tokens
            if len(text) > MAX_TEXT_LENGTH:
                text = text[:MAX_TEXT_LENGTH] + "..."
                logger.warning(f"Text truncated to {MAX_TEXT_LENGTH} chars for emotion model")
            
            # Use InferenceClient for text classification
            # Returns a list of dicts: [{"label": "joy", "score": 0.5}, ...]
            # The text is passed as the first positional argument, model as keyword
            output = self.hf_client.text_classification(
                text,
                model=self.HF_MODEL_NAME
            )
            
            # Parse output - InferenceClient returns list of dicts with "label" and "score"
            emotions = {}
            
            if isinstance(output, list):
                # Extract emotion scores from list of dicts
                for item in output:
                    if isinstance(item, dict):
                        label = item.get("label", "").lower()
                        score = item.get("score", 0.0)
                        if label:
                            emotions[label] = float(score)
            elif isinstance(output, dict):
                # Handle single dict result (unlikely but possible)
                for key, value in output.items():
                    if isinstance(value, (int, float)):
                        emotions[key.lower()] = float(value)
            
            # Ensure all expected emotions are present (fill missing with 0.0)
            for label in self.EMOTION_LABELS:
                if label not in emotions:
                    emotions[label] = 0.0
            
            return emotions
            
        except Exception as e:
            logger.error(f"Error calling HF Inference API: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to predict emotions: {str(e)}") from e

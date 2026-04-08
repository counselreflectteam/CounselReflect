"""
Emotional Support Strategy Classifier Evaluator

Classifies emotional support conversation strategies using a fine-tuned 
RoBERTa model via Hugging Face Inference Endpoint.

Training Data: ESConv (Emotional Support Conversation) dataset
Paper: "Towards Emotional Support Dialog Systems" (Liu et al., ACL 2021)

Labels (8 emotional support strategies):
1. Affirmation and Reassurance
2. Information
3. Others
4. Providing Suggestions
5. Question
6. Reflection of feelings
7. Restatement or Paraphrasing
8. Self-disclosure
"""
from typing import List, Dict, Any, Optional
import logging
import os
import requests

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_categorical_score, create_utterance_result

# Setup logger
logger = logging.getLogger(__name__)

@register_evaluator(
    "emotional_support_strategy",
    label="Emotional Support Strategy",
    description="Classifies emotional support strategies using ESConv-trained RoBERTa model",
    category="Support Strategy",
    requires_hf=True,
    target="therapist",
    reference={
        "shortApa": "Liu et al. (2021)",
        "title": "Towards Emotional Support Dialog Systems (ESConv)",
        "citation": "Liu, S., et al. (2021). Towards Emotional Support Dialog Systems. ACL-IJCNLP 2021.",
        "url": "https://aclanthology.org/2021.acl-long.269/"
    }
)
class EmotionalSupportStrategyEvaluator(Evaluator):
    """
    Evaluator for Emotional Support Strategy classification using HF Inference Endpoint.
    
    Based on the ESConv dataset, this model classifies text into 8 emotional 
    support strategies: Affirmation and Reassurance, Information, Others, 
    Providing Suggestions, Question, Reflection of feelings, 
    Restatement or Paraphrasing, and Self-disclosure.
    """
    
    METRIC_NAME = "emotional_support_strategy"
    
    STRATEGY_LABELS = [
        "Affirmation and Reassurance",
        "Information", 
        "Others",
        "Providing Suggestions",
        "Question",
        "Reflection of feelings",
        "Restatement or Paraphrasing",
        "Self-disclosure"
    ]
    
    HF_ENDPOINT_URL = "https://mhvytkyb4kxr6ue6.us-east-1.aws.endpoints.huggingface.cloud"
    
    def __init__(self, api_keys: Optional[Dict[str, str]] = None, **kwargs):
        """
        Initialize Emotional State Evaluator.
        
        Args:
            api_keys: Dictionary with API keys, should contain "hf" or "huggingface" key
            **kwargs: Additional parameters
        """
        super().__init__()
        
        # Get HF API token
        model_config = kwargs.get("model_config", {})
        self.hf_token = model_config.get("huggingface_api_key")
        
        logger.info(f"Initialized {self.METRIC_NAME} evaluator with HF Inference Endpoint")
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate emotional states for each utterance in the conversation.
        
        Args:
            conversation: List of utterances with 'speaker' and 'text'
            **kwargs: Additional runtime parameters (ignored)
            
        Returns:
            EvaluationResult with per-utterance scores
        """
        scores_per_utterance = []
        
        for utt in conversation:
            result = self._predict_single(utt["text"])
            
            # Return as categorical score
            scores_per_utterance.append({
                "emotional_support_strategy": {
                    "type": "categorical",
                    "label": result["label"],
                    "confidence": result["score"],
                }
            })
        
        return create_utterance_result(conversation, scores_per_utterance)
    
    def _predict_single(self, text: str) -> Dict[str, Any]:
        """
        Predict emotional state for a single utterance using HF Inference Endpoint.
        
        Args:
            text: Utterance text
            
        Returns:
            Dictionary with 'label' and 'score' keys
        """
        try:
            # Truncate text to avoid token limit issues
            MAX_TEXT_LENGTH = 1800
            if len(text) > MAX_TEXT_LENGTH:
                text = text[:MAX_TEXT_LENGTH] + "..."
                logger.warning(f"Text truncated to {MAX_TEXT_LENGTH} chars for emotional_support_strategy model")
            
            # Prepare request
            headers = {
                "Authorization": f"Bearer {self.hf_token}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "inputs": text,
                "parameters": {}
            }
            
            # Make request to HF Inference Endpoint
            response = requests.post(
                self.HF_ENDPOINT_URL,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            response.raise_for_status()
            
            # Parse response - expects [{"label": "...", "score": ...}]
            output = response.json()
            
            if isinstance(output, list) and len(output) > 0:
                # Get top prediction (first item)
                top_result = output[0]
                return {
                    "label": top_result.get("label", "unknown"),
                    "score": float(top_result.get("score", 0.0))
                }
            else:
                logger.warning(f"Unexpected response format from emotional_support_strategy endpoint: {output}")
                return {"label": "unknown", "score": 0.0}
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling HF Inference Endpoint: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to predict emotional state: {str(e)}") from e
        except Exception as e:
            logger.error(f"Error processing emotional_support_strategy prediction: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to predict emotional state: {str(e)}") from e

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
    description="Assigns an ESConv emotional-support strategy category to each turn",
    category="Support Strategy",
    requires_hf=True,
    target="therapist",
    output_description="One of eight ESConv support-strategy categories and the endpoint's classifier score.",
    output_labels=[
        "Affirmation and Reassurance",
        "Information",
        "Others",
        "Providing Suggestions",
        "Question",
        "Reflection of feelings",
        "Restatement or Paraphrasing",
        "Self-disclosure",
    ],
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
    
    # Order must match the deployed classifier's label indices (LABEL_0..LABEL_7).
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

    ENDPOINT_URL_ENV = "EMOTIONAL_SUPPORT_STRATEGY_ENDPOINT_URL"
    
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
        self.hf_token = os.getenv("HF_ENDPOINT_TOKEN") or model_config.get("huggingface_api_key")

        # Endpoint URL comes from the environment so deployments are never
        # tied to (or leak) a specific inference endpoint.
        self.endpoint_url = os.getenv(self.ENDPOINT_URL_ENV)
        if not self.endpoint_url:
            raise ValueError(
                f"{self.ENDPOINT_URL_ENV} is not configured. Set it to the "
                "HF Inference Endpoint URL serving this classifier."
            )
        
        logger.info(f"Initialized {self.METRIC_NAME} evaluator with HF Inference Endpoint")

    def _resolve_label(self, raw_label: str) -> str:
        """Map generic LABEL_<i> ids from the endpoint to strategy names."""
        if raw_label.startswith("LABEL_"):
            try:
                return self.STRATEGY_LABELS[int(raw_label.split("_", 1)[1])]
            except (ValueError, IndexError):
                return raw_label
        return raw_label

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
            headers = {"Content-Type": "application/json"}
            if self.hf_token:
                headers["Authorization"] = f"Bearer {self.hf_token}"
            
            payload = {
                "inputs": text,
                "parameters": {}
            }
            
            # Make request to HF Inference Endpoint
            response = requests.post(
                self.endpoint_url,
                headers=headers,
                json=payload,
                timeout=30
            )

            if response.status_code >= 400:
                try:
                    error_payload = response.json()
                    endpoint_message = str(error_payload.get("error", ""))
                except (ValueError, AttributeError):
                    endpoint_message = ""

                if "endpoint is paused" in endpoint_message.lower():
                    raise RuntimeError(
                        "The Hugging Face inference endpoint is paused. "
                        "A workspace administrator must restart it before this metric can run."
                    )

            response.raise_for_status()
            
            # Parse response - expects [{"label": "...", "score": ...}]
            output = response.json()
            
            if isinstance(output, list) and len(output) > 0:
                # Get top prediction (first item)
                top_result = output[0]
                return {
                    "label": self._resolve_label(top_result.get("label", "unknown")),
                    "score": float(top_result.get("score", 0.0))
                }
            else:
                logger.warning(
                    "Unexpected response format from emotional support endpoint (type=%s)",
                    type(output).__name__,
                )
                return {"label": "unknown", "score": 0.0}
            
        except RuntimeError:
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling HF Inference Endpoint: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to predict emotional state: {str(e)}") from e
        except Exception as e:
            logger.error(f"Error processing emotional_support_strategy prediction: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to predict emotional state: {str(e)}") from e

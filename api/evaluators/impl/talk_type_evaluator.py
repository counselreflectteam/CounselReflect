"""
Talk Type Evaluator

Classifies patient utterances into change talk, sustain talk, or neutral.
Uses Hugging Face Inference Endpoint with BERT model trained on motivational interviewing data.
"""
from typing import List, Dict, Any, Optional
import logging
import requests

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_categorical_score, create_utterance_result

# Setup logger
logger = logging.getLogger(__name__) 

@register_evaluator(
    "talk_type",
    label="Talk Type (Change/Neutral/Sustain)",
    description="Classifies patient utterances into change talk, sustain talk, or neutral",
    category="Talk Type",
    target="patient",
    requires_hf=True,
    reference={
        "shortApa": "Wu et al. (2022)",
        "title": "Anno-MI: A Dataset of Expert-Annotated Counselling Dialogues",
        "citation": "Wu, Z., Balloccu, S., Kumar, V., Helaoui, R., Reiter, E., Reforgiato Recupero, D., & Riboni, D. (2022). Anno-MI: A Dataset of Expert-Annotated Counselling Dialogues. In ICASSP 2022 - 2022 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP) (pp. 6177-6181). IEEE. https://doi.org/10.1109/ICASSP43922.2022.9746035",
        "url": "https://doi.org/10.1109/ICASSP43922.2022.9746035"
    }
)
class TalkTypeEvaluator(Evaluator):
    """Evaluator for Talk Type classification (Change/Neutral/Sustain)."""
    
    METRIC_NAME = "talk_type"
    HF_ENDPOINT_URL = "https://ptaewuxubm7bnv0k.us-east-1.aws.endpoints.huggingface.cloud"
    
    # Label mapping (capitalize first letter to match expected format)
    LABEL_MAP = {
        "change": "Change",
        "neutral": "Neutral",
        "sustain": "Sustain"
    }
    
    # Patient role identifiers
    PATIENT_ROLES = {"patient", "seeker", "client"}
    
    def __init__(self, **kwargs):
        """
        Initialize Talk Type Evaluator.
        
        Args:
            **kwargs: Additional parameters (model_config with huggingface_api_key)
        """
        super().__init__()
        
        # Get HF API token
        model_config = kwargs.get("model_config", {})
        self.hf_token = model_config.get("huggingface_api_key")
        
        logger.info(f"Initialized {self.METRIC_NAME} evaluator with HF Inference Endpoint")
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate talk type for each patient utterance in the conversation.
        
        Args:
            conversation: List of utterances with 'speaker' and 'text'
            **kwargs: Additional runtime parameters (ignored)
            
        Returns:
            EvaluationResult with per-utterance scores
        """
        scores_per_utterance = []
        
        for utt in conversation:
            # Only evaluate patient utterances
            if utt["speaker"].lower() in self.PATIENT_ROLES:
                prediction = self._predict_single(utt["text"])
                scores_per_utterance.append({
                    "talk_type": create_categorical_score(
                        label=prediction["label"],
                        confidence=prediction["confidence"]
                    )
                })
            else:
                # Not a patient utterance, skip
                scores_per_utterance.append({})
        
        return create_utterance_result(conversation, scores_per_utterance)
    
    def _predict_single(self, text: str) -> Dict[str, Any]:
        """
        Predict talk type for a single utterance using HF Inference Endpoint.
        
        Args:
            text: Patient utterance text
            
        Returns:
            Dictionary with 'label' and 'confidence'
        """
        try:
            headers = {
                "Authorization": f"Bearer {self.hf_token}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "inputs": text,
                "parameters": {}
            }
            
            response = requests.post(
                self.HF_ENDPOINT_URL,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            response.raise_for_status()
            output = response.json()
            
            # HF text classification typically returns [{"label": "...", "score": ...}]
            if isinstance(output, list) and len(output) > 0:
                top_result = output[0]
                top_label = top_result.get("label", "").lower()
                confidence = float(top_result.get("score", 0.0))
            else:
                # Fallback for dict format (e.g. {"top_label": "...", "predictions": [...]})
                top_label = output.get("top_label", "").lower()
                confidence = None
                for pred in output.get("predictions", []):
                    if pred.get("label", "").lower() == top_label:
                        confidence = pred.get("score", 0.0)
                        break
                if confidence is None:
                    confidence = 0.0
            
            label = self.LABEL_MAP.get(top_label, top_label.capitalize())
            
            return {
                "label": label,
                "confidence": confidence
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling HF Inference Endpoint: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to predict talk type: {str(e)}") from e
        except Exception as e:
            logger.error(f"Error processing talk type prediction: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to predict talk type: {str(e)}") from e

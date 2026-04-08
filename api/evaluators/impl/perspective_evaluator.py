"""
Perspective API Evaluator

Evaluates toxicity and related attributes using Google's Perspective API.
"""
from typing import List, Dict, Any, Optional, Set
import logging
import os
import requests

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_numerical_score, create_utterance_result

# Setup logger
logger = logging.getLogger(__name__)

@register_evaluator(
    "perspective",
    label="Toxicity (Perspective API)",
    description="Evaluates toxicity using Google's Perspective API (cloud-based, production-grade, 6 attributes: toxicity, severe_toxicity, identity_attack, insult, profanity, threat)",
    category="Toxicity",
    target="both",
    reference={
        "shortApa": "Google. (n.d.)",
        "title": "Perspective API (Comment Analyzer)",
        "citation": "Google. (n.d.). Perspective API: Comment Analyzer. Retrieved from Google Developers.",
        "url": "https://developers.perspectiveapi.com/"
    }
)
class PerspectiveEvaluator(Evaluator):
    """Evaluator for toxicity scoring using Perspective API."""
    
    METRIC_NAME = "perspective"
    PERSPECTIVE_API_URL = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze"
    
    # Attributes to request from Perspective API
    REQUESTED_ATTRIBUTES = {
        "TOXICITY": {},
        "SEVERE_TOXICITY": {},
        "IDENTITY_ATTACK": {},
        "INSULT": {},
        "PROFANITY": {},
        "THREAT": {}
    }

    @staticmethod
    def _extract_unsupported_attributes(error_payload: Dict[str, Any]) -> Set[str]:
        """
        Extract attributes rejected for the detected language.

        Perspective error format example:
        error.details[].errorType == "LANGUAGE_NOT_SUPPORTED_BY_ATTRIBUTE"
        error.details[].languageNotSupportedByAttributeError.attribute == "INSULT"
        """
        unsupported: Set[str] = set()
        details = error_payload.get("error", {}).get("details", [])
        if not isinstance(details, list):
            return unsupported

        for detail in details:
            if not isinstance(detail, dict):
                continue
            if detail.get("errorType") != "LANGUAGE_NOT_SUPPORTED_BY_ATTRIBUTE":
                continue
            attr = (
                detail.get("languageNotSupportedByAttributeError", {})
                .get("attribute")
            )
            if isinstance(attr, str) and attr:
                unsupported.add(attr)

        return unsupported
    
    def __init__(self, **kwargs):
        """
        Initialize Perspective Evaluator.
        
        Args:
            **kwargs: Additional parameters
        """
        super().__init__()
        
        # Get Perspective API key
        self.perspective_api_key = os.getenv("PERSPECTIVE_API_KEY")
        
        if not self.perspective_api_key:
            raise ValueError(
                "Perspective API key not found. Please set PERSPECTIVE_API_KEY in .env file or environment variable."
            )
        
        logger.info(f"Initialized {self.METRIC_NAME} evaluator with Perspective API")
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate toxicity for each utterance in the conversation.
        
        Args:
            conversation: List of utterances with 'speaker' and 'text'
            **kwargs: Additional runtime parameters (ignored)
            
        Returns:
            EvaluationResult with per-utterance scores
        """
        scores_per_utterance = []
        
        for utt in conversation:
            scores = self._analyze_single(utt["text"])
            scores_per_utterance.append({
                "perspective": scores
            })
        
        return create_utterance_result(conversation, scores_per_utterance)
    
    def _analyze_single(self, text: str) -> Dict[str, Any]:
        """
        Analyze a single text using Perspective API.
        
        Args:
            text: Text to analyze
            
        Returns:
            Dictionary with toxicity scores
        """
        try:
            url = f"{self.PERSPECTIVE_API_URL}?key={self.perspective_api_key}"

            # Retry with a reduced attribute set when Perspective rejects
            # specific attributes for the detected language.
            requested_attributes = dict(self.REQUESTED_ATTRIBUTES)
            removed_attributes: Set[str] = set()
            data: Dict[str, Any] = {}

            while True:
                payload = {
                    "comment": {"text": text},
                    "requestedAttributes": requested_attributes
                }

                response = requests.post(
                    url,
                    json=payload,
                    timeout=30
                )

                if response.status_code == 200:
                    data = response.json()
                    break

                if response.status_code == 400:
                    try:
                        error_payload = response.json()
                    except ValueError:
                        error_payload = {}

                    unsupported = self._extract_unsupported_attributes(error_payload)
                    removable = {a for a in unsupported if a in requested_attributes}

                    if removable:
                        removed_attributes.update(removable)
                        for attr in removable:
                            requested_attributes.pop(attr, None)

                        if requested_attributes:
                            logger.warning(
                                "[perspective] Retrying without unsupported attributes %s",
                                sorted(removable)
                            )
                            continue

                        # No compatible attributes remain for this language.
                        logger.warning(
                            "[perspective] No supported attributes remain for detected language. "
                            "Returning neutral toxicity score."
                        )
                        return {
                            "type": "numerical",
                            "value": 0.0,
                            "max_value": 1.0,
                            "label": self._get_toxicity_label(0.0),
                            "direction": "lower_is_better",
                            "all_attributes": {},
                            "metadata": {
                                "removed_unsupported_attributes": sorted(removed_attributes)
                            }
                        }

                raise RuntimeError(f"Perspective API returned status {response.status_code}: {response.text}")
            
            # Extract scores
            attribute_scores = data.get("attributeScores", {})
            
            scores = {}
            for attr_name in self.REQUESTED_ATTRIBUTES.keys():
                attr_data = attribute_scores.get(attr_name, {})
                summary_score = attr_data.get("summaryScore", {})
                value = summary_score.get("value", 0.0)
                scores[attr_name.lower()] = value
            
            # Return as numerical score with toxicity as primary value
            toxicity = scores.get("toxicity", 0.0)
            
            return {
                "type": "numerical",
                "value": toxicity,
                "max_value": 1.0,
                "label": self._get_toxicity_label(toxicity),
                "direction": "lower_is_better",
                "all_attributes": scores,  # Include all attributes for detailed view
                "metadata": {
                    "removed_unsupported_attributes": sorted(removed_attributes)
                }
            }
            
        except Exception as e:
            logger.error(f"Error calling Perspective API: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to analyze toxicity: {str(e)}") from e
    
    def _get_toxicity_label(self, value: float) -> str:
        """Get label for toxicity value."""
        if value >= 0.7:
            return "High"
        elif value >= 0.3:
            return "Medium"
        else:
            return "Low"

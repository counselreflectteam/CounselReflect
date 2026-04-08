"""
RECCON Evaluator

Extracts emotional trigger phrases using RECCON model via Hugging Face Inference Endpoint.
Falls back to EmotionEvaluator if emotion labels are missing.
"""
from typing import List, Dict, Any, Optional
import logging
import os
import requests

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_categorical_score, create_utterance_result
from evaluators.impl.emotion_evaluator import EmotionEvaluator

# Setup logger
logger = logging.getLogger(__name__)

@register_evaluator(
    "reccon",
    label="Emotional Triggers (RECCON)",
    description="Extracts causal text spans for emotions using RECCON",
    category="Emotion",
    requires_hf=True,
    target="therapist",
    reference={
        "shortApa": "Poria et al. (2021)",
        "title": "Recognizing Emotion Cause in Conversations (RECCON)",
        "citation": "Poria, S., et al. (2021). Recognizing Emotion Cause in Conversations. Findings of ACL-IJCNLP 2021.",
        "url": "https://aclanthology.org/2021.findings-acl.288/"
    }
)
class RecconEvaluator(Evaluator):
    """
    Evaluator for emotional trigger extraction using RECCON.
    
    This model takes (text, emotion) as input and returns the span of text
    that caused the emotion.
    
    If the input conversation does not have 'emotion' labels, this evaluator
    will first run the EmotionEvaluator to infer them.
    """
    
    METRIC_NAME = "reccon"
    
    # Hugging Face Inference Endpoint URL
    RECCON_ENDPOINT_URL = "https://q231x2nbcjhge1fz.us-east-1.aws.endpoints.huggingface.cloud"
    
    def __init__(self, **kwargs):
        """
        Initialize RECCON Evaluator.
        
        Args:
            **kwargs: Additional parameters.
        """
        super().__init__()
        
        # Get HF API token from model_config
        model_config = kwargs.get("model_config", {})
        self.hf_token = model_config.get("huggingface_api_key")
            
        # Fallback to internal emotion evaluator if needed
        self.emotion_evaluator = None
        if EmotionEvaluator:
            try:
                self.emotion_evaluator = EmotionEvaluator(**kwargs)
            except Exception as e:
                logger.warning(f"Could not initialize fallback EmotionEvaluator: {e}")

        logger.info(f"Initialized {self.METRIC_NAME} evaluator")

    def _aggregate_therapist_turns(
        self,
        conversation: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Aggregate consecutive therapist turns into response-units.

        Returns a list of dicts:
        {
            "text": aggregated_text,
            "emotion": emotion,
            "indices": [original turn indices]
        }
        """
        aggregated = []
        i = 0
        n = len(conversation)

        while i < n:
            utt = conversation[i]
            speaker = utt.get("speaker", "").lower()

            # Only aggregate therapist turns
            if speaker != "therapist":
                aggregated.append({
                    "text": utt.get("text", "").strip(),
                    "emotion": utt.get("emotion"),
                    "indices": [i],
                })
                i += 1
                continue

            # Start therapist block
            texts = []
            indices = []
            emotion = utt.get("emotion")

            while i < n and conversation[i].get("speaker", "").lower() == "therapist":
                text = conversation[i].get("text", "").strip()
                if text:
                    texts.append(text)
                    indices.append(i)
                i += 1

            aggregated.append({
                "text": " ".join(texts),
                "emotion": emotion,
                "indices": indices,
            })

        return aggregated

    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Extract emotional triggers for each utterance.
        
        Args:
            conversation: List of utterances.
            **kwargs: Additional parameters.
            
        Returns:
            EvaluationResult with per-utterance scores.
        """
        # 1. Check/Enrich with Emotions
        conversation_with_emotions = self._ensure_emotions(conversation)
        
        scores_per_utterance = []
        
        # 2. Aggregate therapist turns
        aggregated_units = self._aggregate_therapist_turns(conversation_with_emotions)

        batch_inputs = []
        unit_index_map = []  # maps batch index -> original indices
        skipped_info = {}

        for unit in aggregated_units:
            text = unit["text"]
            emotion = unit["emotion"]
            indices = unit["indices"]

            if text and emotion:
                batch_inputs.append({
                    "utterance": text,
                    "emotion": emotion
                })
                unit_index_map.append(indices)

        # 3. Call Endpoint
        if batch_inputs:
            try:
                results = self._predict_batch(batch_inputs)
                
                # Map results back to utterance indices
                result_map = {}

                for indices, res in zip(unit_index_map, results):
                    for idx in indices:
                        result_map[idx] = res

                for i in range(len(conversation)):
                    if i in skipped_info:
                        score = create_categorical_score(
                            label="Not Applicable",
                            confidence=1.0,
                            highlighted_text=None
                        )
                        score["metadata"] = {
                            "skipped": True,
                            "reason": skipped_info[i]
                        }
                        scores_per_utterance.append({
                            self.METRIC_NAME: score
                        })

                    elif i in result_map:
                        res = result_map[i]
                        triggers = res.get("triggers", [])
                        emotion = res.get("emotion", "neutral")

                        score = create_categorical_score(
                            label=emotion.capitalize(),
                            confidence=1.0,
                            highlighted_text=", ".join(triggers) if triggers else None
                        )
                        score["triggers"] = triggers
                        scores_per_utterance.append({
                            self.METRIC_NAME: score
                        })

                    else:
                        scores_per_utterance.append({})
       
            except Exception as e:
                logger.error(f"RECCON prediction failed: {e}")
                # Return empty scores on failure
                scores_per_utterance = [{} for _ in conversation]
        else:
            logger.warning("No valid utterances with emotions found for RECCON.")
            scores_per_utterance = [{} for _ in conversation]

        return create_utterance_result(conversation, scores_per_utterance)

    def _ensure_emotions(self, conversation: List[Utterance]) -> List[Dict[str, Any]]:
        """
        Ensure all utterances have an 'emotion' field.
        Runs EmotionEvaluator if missing.
        """
        # Check if emotions are already present in at least one utterance
        has_any_emotions = any("emotion" in utt or "label" in utt for utt in conversation)
        
        if has_any_emotions:
            # If some have it, we assume the caller provided them or they are intentional
            return conversation
            
        if not self.emotion_evaluator:
            logger.warning("Emotions missing and EmotionEvaluator not available. Defaulting to 'neutral'.")
            return [{"text": u["text"], "speaker": u["speaker"], "emotion": "neutral"} for u in conversation]
            
        logger.info("Detecting emotions for RECCON input...")
        try:
            # Run Emotion Classification
            result = self.emotion_evaluator.execute(conversation)
            
            # The structure of result is EvaluationResult (TypedDict)
            # We need to extract labels from per_utterance
            per_utt_scores = result.get("per_utterance", [])
            
            enriched_conversation = []
            for i, utt in enumerate(conversation):
                utt_copy = utt.copy()
                # Find the score for this utterance index
                score_found = False
                for score_entry in per_utt_scores:
                    if score_entry.get("index") == i:
                        metric_res = score_entry.get("metrics", {}).get("emotion", {})
                        utt_copy["emotion"] = metric_res.get("label", "neutral")
                        score_found = True
                        break
                
                if not score_found:
                    utt_copy["emotion"] = "neutral"
                    
                enriched_conversation.append(utt_copy)
                
            return enriched_conversation
            
        except Exception as e:
            logger.error(f"Failed to infer emotions: {e}")
            return [{"text": u["text"], "speaker": u["speaker"], "emotion": "neutral"} for u in conversation]

    def _predict_batch(self, inputs: List[Dict]) -> List[Dict]:
        """
        Call RECCON endpoint with batch inputs.
        
        Args:
            inputs: List of dicts with 'utterance' and 'emotion'.
            
        Returns:
            List of result dicts with 'triggers'.
        """
        headers = {
            "Content-Type": "application/json"
        }
        if self.hf_token:
            headers["Authorization"] = f"Bearer {self.hf_token}"

        response = requests.post(
            self.RECCON_ENDPOINT_URL,
            headers=headers,
            json={"inputs": inputs},
            timeout=60
        )
        
        if response.status_code != 200:
            logger.error(f"Endpoint returned error {response.status_code}: {response.text}")
            response.raise_for_status()
            
        return response.json()

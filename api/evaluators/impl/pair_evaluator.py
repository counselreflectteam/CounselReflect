"""
PAIR Reflection Scorer Evaluator

Scores the quality of counselor reflections in Motivational Interviewing using
PAIR (Prompt-Aware margIn Ranking) model via Hugging Face Inference Endpoint.

Paper: "PAIR: Prompt-Aware margIn Ranking for Counselor Reflection Scoring in Motivational Interviewing"
Authors: Do June Min, Verónica Pérez-Rosas, Kenneth Resnicow, Rada Mihalcea
Conference: EMNLP 2022
URL: https://aclanthology.org/2022.emnlp-main.11/
"""
from typing import List, Dict, Any, Optional
import logging
import os
import requests

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_categorical_score, create_numerical_score, create_utterance_result

# Setup logger
logger = logging.getLogger(__name__)

@register_evaluator(
    "pair",
    label="PAIR Reflection Scorer",
    description="Scores counselor reflection quality in Motivational Interviewing",
    category="Support Strategy",
    requires_hf=True,
    target="therapist",
    reference={
        "shortApa": "Min et al. (2022)",
        "title": "PAIR: Prompt-Aware margIn Ranking for Counselor Reflection Scoring in Motivational Interviewing",
        "citation": "Min, D. J., Pérez-Rosas, V., Resnicow, K., & Mihalcea, R. (2022). PAIR: Prompt-Aware margIn Ranking for Counselor Reflection Scoring in Motivational Interviewing. EMNLP 2022.",
        "url": "https://aclanthology.org/2022.emnlp-main.11/"
    }
)
class PAIREvaluator(Evaluator):
    """
    Evaluator for PAIR Reflection Scoring using HF Inference Endpoint.
    
    PAIR (Prompt-Aware margIn Ranking) is a cross-encoder that scores 
    the quality of counselor reflections. Reflections are a core verbal 
    counseling skill used to convey understanding and acknowledgment 
    of clients' experiences.
    """
    
    METRIC_NAME = "pair"
    
    # HF Inference Endpoint URL (Khriis/PAIR model)
    HF_ENDPOINT_URL = "https://wwkp7hnx5b4082lw.us-east-1.aws.endpoints.huggingface.cloud"
    
    def __init__(self, **kwargs):
        """
        Initialize PAIR Evaluator.
        
        Args:
           **kwargs: Additional parameters
        """
        super().__init__()
        
        # Get HF API token
        model_config = kwargs.get("model_config", {})
        self.hf_token = model_config.get("huggingface_api_key")
        
        logger.info(f"Initialized {self.METRIC_NAME} evaluator with HF Inference Endpoint")
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate response types for each utterance in the conversation.
        
        Args:
            conversation: List of utterances with 'speaker' and 'text'
            **kwargs: Additional runtime parameters (ignored)
            
        Returns:
            EvaluationResult with per-utterance scores
        """
        # Initialize with empty results
        scores_per_utterance = [{} for _ in conversation]
        therapist_aliases = ["therapist", "counselor", "doctor", "system", "model"]
        
        n = len(conversation)
        i = 0
        
        while i < n:
            utt = conversation[i]
            speaker = utt["speaker"].lower()
            is_therapist = any(alias in speaker for alias in therapist_aliases)
            
            # We only score Therapist turns that have a preceding Client turn
            if is_therapist and i > 0:
                prev_utt = conversation[i-1]
                prev_speaker = prev_utt["speaker"].lower()
                is_prev_therapist = any(alias in prev_speaker for alias in therapist_aliases)
                
                if not is_prev_therapist:
                    # Found start of a Therapist block. 
                    # Aggregate this and all subsequent consecutive therapist utterances.
                    block_indices = [i]
                    block_texts = [utt["text"]]
                    
                    j = i + 1
                    while j < n:
                        next_utt = conversation[j]
                        next_speaker = next_utt["speaker"].lower()
                        is_next_therapist = any(alias in next_speaker for alias in therapist_aliases)
                        
                        if is_next_therapist:
                            block_indices.append(j)
                            block_texts.append(next_utt["text"])
                            j += 1
                        else:
                            break
                    
                    # Construct full response and prompt
                    full_response = " ".join(block_texts)
                    prompt = prev_utt["text"]
                    
                    # Predict score for the aggregated response
                    logger.info(
                        "[PAIR] block_start=%s block_indices=%s prompt=%r full_response=%r",
                        i, block_indices, prompt[:120], full_response[:200]
                    )
                    raw_score = self._predict_pair(prompt, full_response)
                    logger.info(
                        "[PAIR] block_indices=%s raw_score=%s",
                        block_indices, raw_score
                    )
                    if raw_score is not None:
                        base_score = create_numerical_score(
                            value=raw_score,
                            max_value=1.0,
                            label="Reflection Quality"
                        )
                        
                        # Assign this score to ALL utterances in the block
                        for k, idx in enumerate(block_indices):
                            logger.info(
                                "[PAIR] assign idx=%s position=%s score=%s",
                                idx, ("start" if k == 0 else "continuation"), raw_score
                            )
                            score_copy = base_score.copy()
                            
                            # Add metadata if this was an aggregated block
                            if len(block_indices) > 1:
                                score_copy["metadata"] = {
                                    "aggregated": True,
                                    "position": "start" if k == 0 else "continuation",
                                    "total_parts": len(block_indices)
                                }
                            
                            scores_per_utterance[idx] = {"pair": score_copy}
                    
                    # Advance main loop to end of block
                    i = j
                    continue

            # Move to next utterance if not processed as a block start
            i += 1
        
        return create_utterance_result(conversation, scores_per_utterance)
    
    def _predict_pair(self, prompt: str, response: str) -> Optional[float]:
        """
        Predict reflection score for a pair (prompt, response) using HF Inference Endpoint.
        
        Args:
            prompt: Previous utterance (Client/Patient)
            response: Current utterance (Therapist)
            
        Returns:
            Float score (0.0 - 1.0) or None if error
        """
        try:
            # Prepare request
            headers = {
                "Authorization": f"Bearer {self.hf_token}",
                "Content-Type": "application/json"
            }
            
            # Payload matching handler.py expectations: {"inputs": {"prompt": "...", "response": "..."}}
            payload = {
                "inputs": {
                    "prompt": prompt,
                    "response": response
                },
                "parameters": {}
            }
            
            # Make request to HF Inference Endpoint
            resp = requests.post(
                self.HF_ENDPOINT_URL,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            resp.raise_for_status()
            
            # Parse response - expects [{"score": 0.8542}]
            output = resp.json()
            
            if isinstance(output, list) and len(output) > 0:
                # handler.py returns list of dicts with 'score'
                return float(output[0].get("score", 0.0))
            else:
                logger.warning(f"Unexpected response format from PAIR endpoint: {output}")
                return 0.0
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling HF Inference Endpoint: {str(e)}", exc_info=True)
            return None
        except Exception as e:
            logger.error(f"Error processing PAIR prediction: {str(e)}", exc_info=True)
            return None

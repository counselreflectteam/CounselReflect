"""
Toxicity Evaluator

Detects toxic, severe toxic, obscene, threat, insult, and identity hate in utterances.
Uses Detoxify library with pre-trained models.
"""
from typing import List, Dict, Any, Optional
import logging
import ssl

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_numerical_score, create_utterance_result

logger = logging.getLogger(__name__)
from detoxify import Detoxify


@register_evaluator(
    "toxicity",
    label="Toxicity (Detoxify ML)",
    description="Detects toxicity using Detoxify transformer model (local processing, 7 categories: toxicity, severe_toxicity, obscene, threat, insult, identity_attack, sexual_explicit)",
    category="Toxicity",
    target="both",
    reference={
        "shortApa": "Hanu & Unitary. (2020)",
        "title": "Detoxify: A Python package for toxicity prediction",
        "citation": "Hanu, L., & Unitary team. (2020). Detoxify: A Python package for toxicity prediction.",
        "url": "https://github.com/unitaryai/detoxify"
    }
)
class ToxicityEvaluator(Evaluator):
    """
    Evaluator for toxicity detection using Detoxify.
    
    Based on Jigsaw Unintended Bias in Toxicity Classification.
    Returns scores for each subcategory with 'toxicity_' prefix:
    - toxicity_toxicity: overall toxicity
    - toxicity_severe_toxicity: severe toxic content
    - toxicity_obscene: obscene language
    - toxicity_threat: threatening language
    - toxicity_insult: insulting language
    - toxicity_identity_attack: identity-based hate speech
    - toxicity_sexual_explicit: sexually explicit content (unbiased model only)
    """
    
    METRIC_NAME = "toxicity"
    
    # Available models
    MODELS = {
        "original": "original",       # Standard model
        "unbiased": "unbiased",       # Less biased model (recommended)
        "multilingual": "multilingual" # Supports multiple languages
    }
    
    def __init__(
        self, 
        model_type: str = "unbiased",
        device: str = "cpu",
        threshold: float = 0.5,
        **kwargs
    ):
        """
        Initialize Toxicity Evaluator.
        
        Args:
            model_type: Which Detoxify model to use ("original", "unbiased", "multilingual")
            device: Device to run model on ("cpu" or "cuda")
            threshold: Threshold for flagging content as toxic (0-1)
            **kwargs: Additional parameters (ignored)
        """
        super().__init__()
        
        self.model_type = model_type
        self.device = device
        self.threshold = threshold
        
        # Load model
        logger.info(f"Loading Detoxify model: {model_type} on {device}...")
        
        # Fix SSL certificate verification issue on macOS
        # Temporarily disable SSL verification for model download
        original_https_context = ssl._create_default_https_context
        ssl._create_default_https_context = ssl._create_unverified_context
        
        try:
            # Load model without specifying device to avoid meta tensor issue
            # Detoxify will load on CPU first, then we can move if needed
            self.model = Detoxify(model_type)
            
            # If a specific device was requested and it's not CPU, move the model
            if device != "cpu":
                try:
                    self.model.model.to(device)
                except Exception as e:
                    logger.warning(f"Could not move model to {device}, keeping on CPU: {e}")
                    self.device = "cpu"
        except Exception as e:
            logger.error(f"Failed to load Detoxify model: {e}")
            raise
        finally:
            # Restore original SSL context
            ssl._create_default_https_context = original_https_context
        
        logger.info(f"Initialized {self.METRIC_NAME} evaluator with {model_type} model on {self.device}")
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate toxicity for each utterance in the conversation.
        
        Args:
            conversation: List of utterances with 'speaker' and 'text'
            **kwargs: Optional parameters:
                - threshold: Override default threshold for this evaluation
                - batch_size: Process in batches (default: process all at once)
            
        Returns:
            EvaluationResult with per-utterance toxicity scores
        """
        threshold = kwargs.get('threshold', self.threshold)
        batch_size = kwargs.get('batch_size', None)
        
        scores_per_utterance = []
        
        # Extract all texts for batch prediction
        texts = [utt["text"] for utt in conversation]
        
        if batch_size:
            # Process in batches
            all_predictions = []
            for i in range(0, len(texts), batch_size):
                batch_texts = texts[i:i + batch_size]
                batch_results = self.model.predict(batch_texts)
                all_predictions.append(batch_results)
            
            # Merge batch results
            predictions = self._merge_batch_predictions(all_predictions)
        else:
            # Process all at once
            predictions = self.model.predict(texts)
        
        # Convert predictions to per-utterance scores
        for i, utt in enumerate(conversation):
            utterance_scores = self._extract_scores(predictions, i, threshold)
            # Directly append the scores dict (not nested under "toxicity")
            # This matches the pattern used by other evaluators
            scores_per_utterance.append(utterance_scores)
        
        return create_utterance_result(conversation, scores_per_utterance)
    
    def _extract_scores(
        self, 
        predictions: Dict[str, Any], 
        index: int,
        threshold: float
    ) -> Dict[str, Any]:
        """
        Extract toxicity scores for a single utterance.
        
        Args:
            predictions: Full predictions dict from Detoxify
            index: Index of the utterance
            threshold: Threshold for flagging
            
        Returns:
            Dictionary with individual toxicity scores (prefixed with 'toxicity_')
        """
        # Available metrics (depends on model)
        # Detoxify returns: toxicity, severe_toxicity, obscene, threat, insult, 
        # identity_attack, sexual_explicit (for unbiased model)
        available_metrics = list(predictions.keys())
        
        scores = {}
        max_score = 0.0
        max_category = None
        
        for metric in available_metrics:
            value = float(predictions[metric][index])
            # Add 'toxicity_' prefix to subcategory names
            prefixed_metric = f"toxicity_{metric}"
            scores[prefixed_metric] = create_numerical_score(
                value=value,
                max_value=1.0,
                label="High" if value >= threshold else "Low",
                direction="lower_is_better"
            )
            
            # Track highest score
            if value > max_score:
                max_score = value
                max_category = metric
        
        # Add overall assessment
        scores["is_toxic"] = {
            "type": "categorical",
            "label": "Toxic" if max_score >= threshold else "Safe",
            "confidence": max_score
        }
        
        if max_category and max_score >= threshold:
            scores["primary_category"] = {
                "type": "categorical",
                "label": max_category.replace('_', ' ').title(),
                "confidence": max_score
            }
        
        return scores
    
    def _merge_batch_predictions(self, batch_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Merge multiple batch prediction results into a single dictionary.
        
        Args:
            batch_results: List of prediction dictionaries
            
        Returns:
            Merged predictions dictionary
        """
        if not batch_results:
            return {}
        
        # Get all metric keys from first batch
        metrics = list(batch_results[0].keys())
        
        # Merge each metric's values
        merged = {}
        for metric in metrics:
            merged[metric] = []
            for batch in batch_results:
                if isinstance(batch[metric], list):
                    merged[metric].extend(batch[metric])
                else:
                    merged[metric].append(batch[metric])
        
        return merged
    
    def get_summary_statistics(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate summary statistics for toxicity across all utterances.
        
        Args:
            results: List of per-utterance results from execute()
            
        Returns:
            Dictionary with summary statistics
        """
        total_utterances = len(results)
        toxic_count = 0
        category_counts = {}
        avg_scores = {}
        
        for row in results:
            toxicity_scores = row.get("toxicity_scores", {})
            
            # Count toxic utterances
            is_toxic = toxicity_scores.get("is_toxic", {})
            if is_toxic.get("label") == "Toxic":
                toxic_count += 1
            
            # Count by category
            primary_cat = toxicity_scores.get("primary_category", {})
            if primary_cat:
                cat_label = primary_cat.get("label", "Unknown")
                category_counts[cat_label] = category_counts.get(cat_label, 0) + 1
            
            # Accumulate scores for averaging
            for key, score in toxicity_scores.items():
                if key not in ["is_toxic", "primary_category"] and score.get("type") == "numerical":
                    if key not in avg_scores:
                        avg_scores[key] = []
                    avg_scores[key].append(score["value"])
        
        # Calculate averages
        for key in avg_scores:
            avg_scores[key] = sum(avg_scores[key]) / len(avg_scores[key])
        
        return {
            "total_utterances": total_utterances,
            "toxic_utterances": toxic_count,
            "toxic_percentage": (toxic_count / total_utterances * 100) if total_utterances > 0 else 0,
            "category_breakdown": category_counts,
            "average_scores": avg_scores
        }

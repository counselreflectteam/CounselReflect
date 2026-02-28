"""
Empathy ER (Emotional Reaction) Evaluator
Measures the emotional reaction component of empathy in therapeutic responses.
"""
from typing import List
import torch
from transformers import AutoModel, AutoTokenizer

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_categorical_score, create_utterance_result


@register_evaluator(
    "empathy_er",
    label="Empathy ER (Emotional Reaction)",
    description="Measures emotional reaction component of empathy",
    category="Empathy",
    target="therapist",
    reference={
        "shortApa": "Sharma et al. (2020)",
        "title": "Towards Understanding and Predicting Empathy in Spoken Conversations",
        "citation": "Sharma, A., Lin, I. W., Miner, A. S., Atkins, D. C., Althoff, T. (2020). Towards Understanding and Predicting Empathy in Spoken Conversations. Proceedings of the 2020 Conference on Empirical Methods in Natural Language Processing (EMNLP).",
        "url": "https://aclanthology.org/2020.emnlp-main.425/"
    }
)
class EmpathyEREvaluator(Evaluator):
    """Evaluator for Empathy Emotional Reaction (ER)."""
    
    METRIC_NAME = "empathy_er"
    MODEL_NAME = "CounselReflect/empathy-mental-health-reddit-ER"
    LABELS = ["Low", "Medium", "High"]
    
    def __init__(self, **kwargs):
        super().__init__()
        self.tokenizer = None
        self.model = None
        self._model_loaded = False
    
    def _load_model(self):
        """Load the model and tokenizer (lazy loading)."""
        if self._model_loaded:
            return
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(self.MODEL_NAME)
            self.model = AutoModel.from_pretrained(
                self.MODEL_NAME, 
                trust_remote_code=True,
                torch_dtype=torch.float32
            )
            # Ensure model is on CPU (or move to appropriate device)
            self.model = self.model.to('cpu')
            self.model.eval()
            self._model_loaded = True
        except Exception as e:
            raise RuntimeError(f"Failed to load {self.MODEL_NAME}: {e}")
    
    def _predict_single(self, seeker_text: str, response_text: str) -> dict:
        """
        Predict empathy level for a single seeker-response pair.
        
        Args:
            seeker_text: The seeker's (patient's) utterance
            response_text: The response (therapist's) utterance
            
        Returns:
            Dict with label, confidence, and probabilities
        """
        # Lazy load model on first use
        self._load_model()
        
        # Tokenize
        encoded_sp = self.tokenizer(
            seeker_text,
            max_length=64,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        encoded_rp = self.tokenizer(
            response_text,
            max_length=64,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        # Ensure tensors are on the same device as model
        device = next(self.model.parameters()).device
        encoded_sp = {k: v.to(device) for k, v in encoded_sp.items()}
        encoded_rp = {k: v.to(device) for k, v in encoded_rp.items()}
        
        # Predict
        with torch.no_grad():
            outputs = self.model(
                input_ids_SP=encoded_sp['input_ids'],
                input_ids_RP=encoded_rp['input_ids'],
                attention_mask_SP=encoded_sp['attention_mask'],
                attention_mask_RP=encoded_rp['attention_mask']
            )
            logits_empathy = outputs[0]
            probs = torch.softmax(logits_empathy, dim=1)
        
        empathy_level = torch.argmax(logits_empathy, dim=1).item()
        confidence = probs[0][empathy_level].item()
        
        return {
            "label": self.LABELS[empathy_level],
            "confidence": confidence,
            "probabilities": {
                "Low": probs[0][0].item(),
                "Medium": probs[0][1].item(),
                "High": probs[0][2].item()
            }
        }
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate empathy ER for each therapist response in the conversation.
        
        Args:
            conversation: List of utterances with 'speaker' and 'text'
            
        Returns:
            EvaluationResult with per-utterance scores
        """
        scores_per_utterance = []
        
        # Find seeker-response pairs
        for i, utt in enumerate(conversation):
            # Only evaluate therapist responses
            if utt["speaker"].lower() in ["therapist", "counselor", "provider"]:
                # Find the most recent patient/seeker utterance
                seeker_text = ""
                for j in range(i - 1, -1, -1):
                    if conversation[j]["speaker"].lower() in ["patient", "seeker", "client"]:
                        seeker_text = conversation[j]["text"]
                        break
                
                # If we found a seeker utterance, evaluate
                if seeker_text:
                    prediction = self._predict_single(seeker_text, utt["text"])
                    scores_per_utterance.append({
                        "empathy_er": create_categorical_score(
                            label=prediction["label"],
                            confidence=prediction["confidence"]
                        )
                    })
                else:
                    # No seeker context, skip evaluation
                    scores_per_utterance.append({})
            else:
                # Not a therapist utterance, skip
                scores_per_utterance.append({})
        
        return create_utterance_result(conversation, scores_per_utterance)

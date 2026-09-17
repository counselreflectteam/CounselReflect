"""
Empathy IP (Interpretation) Evaluator

Measures the interpretation component of empathy in therapeutic responses.
"""
from typing import List

from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_categorical_score, create_utterance_result


@register_evaluator(
    "empathy_ip",
    label="Empathy IP (Interpretation)",
    description="Measures interpretation component of empathy",
    category="Empathy",
    target="therapist",
    output_description="One of the deployed model's three empathy levels for interpretations, plus class confidence.",
    output_labels=["Low", "Medium", "High"],
    reference={
        "shortApa": "Sharma et al. (2020)",
        "title": "A Computational Approach to Understanding Empathy Expressed in Text-Based Mental Health Support",
        "citation": "Sharma, A., Miner, A. S., Atkins, D. C., & Althoff, T. (2020). A Computational Approach to Understanding Empathy Expressed in Text-Based Mental Health Support. EMNLP 2020, 5263-5276.",
        "url": "https://aclanthology.org/2020.emnlp-main.425/",
        "modelName": "CounselReflect/empathy-mental-health-reddit-IP",
        "modelUrl": "https://huggingface.co/CounselReflect/empathy-mental-health-reddit-IP"
    }
)
class EmpathyIPEvaluator(Evaluator):
    """Evaluator for Empathy Interpretation (IP)."""
    
    METRIC_NAME = "empathy_ip"
    MODEL_NAME = "CounselReflect/empathy-mental-health-reddit-IP"
    # Pin the exact commit: trust_remote_code executes repo code, so an
    # unpinned revision would turn a repo compromise into RCE here.
    MODEL_REVISION = "13ea50bac763441abc6c32c910c53737c3dc11fe"
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
            import torch
            from transformers import AutoModel, AutoTokenizer

            self.tokenizer = AutoTokenizer.from_pretrained(self.MODEL_NAME, revision=self.MODEL_REVISION)
            self.model = AutoModel.from_pretrained(
                self.MODEL_NAME,
                revision=self.MODEL_REVISION,
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
        import torch
        
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
        Evaluate empathy IP for each therapist response in the conversation.
        
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
                        "empathy_ip": create_categorical_score(
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

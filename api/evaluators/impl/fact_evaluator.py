"""
Fact Score Evaluator (our FActScore-inspired implementation).

Evaluates factual accuracy of THERAPIST turns only. Client and Patient turns
are not evaluated and receive empty scores.

Pipeline (per therapist utterance): raw text is passed directly to FactScorer.
No pre-summarization. This is our own implementation aligned with the
FActScore methodology:
1. Decompose into atomic facts (sentence split + BM25 demo selection from demons.json)
2. Fetch Wikipedia for topic, chunk into 256-token RoBERTa passages
3. Per-fact BM25 retrieval (query = topic + fact, top-k=5)
4. Per-fact verification: "Answer the question about {topic}... Input: {atom} True or False? Output:"
5. Length penalty gamma=10; optional NPM gating
6. Score = supported_facts / total_facts (after penalty)
"""
from typing import List
import logging

from evaluators.base import Evaluator
from evaluators.lib.fact_score import FactScorer
from evaluators.registry import register_evaluator
from providers.registry import ProviderRegistry
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_numerical_score, create_categorical_score, create_utterance_result

logger = logging.getLogger(__name__)

@register_evaluator(
    "fact_score",
    label="Fact Score",
    description="Therapist turns only: our FActScore-inspired implementation (RoBERTa chunking, BM25 retrieval, per-fact True/False verification). Client/Patient turns are not evaluated.",
    category="Factuality",
    target="therapist",
    reference={
        "shortApa": "Min et al. (2023)",
        "title": "FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation",
        "citation": "Min, S., et al. (2023). FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation.",
        "url": "https://arxiv.org/abs/2305.14251"
    }
)
class FactEvaluator(Evaluator):
    
    METRIC_NAME = "fact_score"
    # Only these speaker roles are evaluated; Client, Patient, etc. get empty scores
    THERAPIST_ROLES = {"therapist", "helper", "counselor", "assistant"}
    # DocDB topic for retrieval (must match Wikipedia/DocDB title exactly)
    FACT_SCORE_TOPIC = "Psychotherapy"

    def __init__(self, **kwargs):
        super().__init__()
        
        # Get provider info from model_config
        model_config = kwargs.get("model_config", {})
        provider_name = model_config.get("provider", "openai")
        model = model_config.get("model", "gpt-4o")
        api_key = model_config.get("api_key")

        # Get provider instance
        self.provider = ProviderRegistry.get_provider(provider_name, api_key)
        self.model = model
        
        self._scorer = FactScorer(self.provider, self.model, verification_model=self.model)
        logger.info(f"Initialized {self.METRIC_NAME} evaluator with {provider_name}/{model}")



    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate factual accuracy per utterance to enable dashboard visualization.
        """

        scores_per_utterance = []
        n_therapist = sum(1 for u in conversation if u.get("speaker", "").lower() in self.THERAPIST_ROLES and (u.get("text") or "").strip())
        n_total = len(conversation)
        logger.info(
            f"[fact_score] Processing {n_total} utterances ({n_therapist} therapist turns), topic={self.FACT_SCORE_TOPIC}"
        )
        
        n_scored = 0
        n_na = 0
        n_client = 0
        n_short = 0
        
        for i, utt in enumerate(conversation):
            speaker = utt.get("speaker", "").lower()
            text = utt.get("text", "").strip()
            is_therapist = speaker in self.THERAPIST_ROLES and bool(text)
            
            # Therapy-only: Client, Patient, and other non-therapist turns get empty scores
            if not is_therapist:
                n_client += 1
                scores_per_utterance.append({})
                continue
            
            try:
                # Heuristic: Skip very short utterances (likely backchannels)
                if len(text.split()) < 4:
                    n_short += 1
                    n_na += 1
                    metric_score = create_categorical_score(
                        label="Not Applicable"
                    )
                    metric_score["reasoning"] = "Utterance too short."
                    
                    scores_per_utterance.append({
                        self.METRIC_NAME: metric_score
                    })
                    continue

                # 1. Score (pass raw text to allow proper atomic decomposition)
                result = self._scorer.score(text, [self.FACT_SCORE_TOPIC])
                
                # Check if facts were actually found/scored
                if result.get("num_facts", 0) == 0:
                    n_na += 1
                    metric_score = create_categorical_score(
                        label="Not Applicable"
                    )
                    metric_score["reasoning"] = "No verifiable factual claims identified."
                    
                    scores_per_utterance.append({
                        self.METRIC_NAME: metric_score
                    })
                    continue

                # 2. Result available
                score = result.get("score", 0.0)
                n_scored += 1

                # 3. Format for Dashboard
                metric_score = create_numerical_score(
                    value=score,
                    max_value=1.0,
                    label="High" if score > 0.8 else "Low"
                )
                metric_score["reasoning"] = result.get("issues", [])
                
                scores_per_utterance.append({
                    self.METRIC_NAME: metric_score
                })
                
            except Exception as e:
                logger.error(f"[fact_score] Error evaluating utterance {i}: {e}", exc_info=True)
                scores_per_utterance.append({})
        
        logger.info(
            f"[fact_score] Done. therapist_scored={n_scored} not_applicable={n_na} short_skipped={n_short} client_turns={n_client}"
        )
        logger.info(create_utterance_result(conversation, scores_per_utterance))
        return create_utterance_result(conversation, scores_per_utterance)

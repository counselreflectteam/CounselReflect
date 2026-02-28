import os
import sys

import torch
from transformers import AutoModel, AutoTokenizer, RobertaTokenizer

from evaluators.impl.empathy_er_evaluator import EmpathyEREvaluator
from evaluators.impl.empathy_ex_evaluator import EmpathyEXEvaluator
from evaluators.impl.empathy_ip_evaluator import EmpathyIPEvaluator
from evaluators.lib.fact_score.fact_score import AtomicFactScorer
from evaluators.lib.MedScore.medscore.medrag_utils import RetrievalSystem


def main():
    print("========= PREFETCHING MODELS AND DATASETS =========", flush=True)
    
    try:
        print("--> Prefetching Empathy models...", flush=True)
        empathy_models = [
            EmpathyEREvaluator.MODEL_NAME,
            EmpathyEXEvaluator.MODEL_NAME,
            EmpathyIPEvaluator.MODEL_NAME
        ]
        for m in empathy_models:
            print(f"Downloading {m}...", flush=True)
            AutoTokenizer.from_pretrained(m)
            AutoModel.from_pretrained(m, trust_remote_code=True, torch_dtype=torch.float32)
        print("--> Empathy models prefetch complete.", flush=True)
    except Exception as e:
        print(f"Warning: Error prefetching Empathy models: {e}", flush=True)

    try:
        print("--> Prefetching FActScore dependencies...", flush=True)
        
        # Initialize scorer to trigger DocDB db download
        scorer = AtomicFactScorer(provider=None, model="dummy")
        
        # Trigger RoBERTa download
        try:
            print("Downloading RoBERTa tokenizer...", flush=True)
            RobertaTokenizer.from_pretrained("roberta-large")
        except Exception as e:
            print(f"Warning: Could not prefetch RoBERTa: {e}", flush=True)
            
        print("--> FActScore prefetch complete.", flush=True)
    except Exception as e:
        print(f"Warning: Error prefetching FActScore: {e}", flush=True)
        
    try:
        print("--> Prefetching MedScore dependencies...", flush=True)
        
        # Single-threaded mode to prevent fast subprocess lockups
        os.environ["OMP_NUM_THREADS"] = "1"
        os.environ["MKL_NUM_THREADS"] = "1"
        
        # Initialize the same retriever config used in medscore_runner.py
        # This will trigger heavy cloning of textbooks corpus + medcpt checks
        retriever = RetrievalSystem(
            retriever_name="MedCPT", 
            corpus_name="Textbooks", 
            db_dir="./corpus"
        )
        print("--> MedScore prefetch complete.", flush=True)
    except Exception as e:
        print(f"Warning: Error prefetching MedScore: {e}", flush=True)

    print("========= PREFETCH COMPLETE ========================", flush=True)

if __name__ == "__main__":
    main()

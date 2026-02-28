#!/usr/bin/env python3
"""
Build MedRAG MedCPT embeddings for the Textbooks corpus.
Run once to create faiss.index so MedScore medrag verification works.

Usage (from LLM_Model_Therapist_Tool):
  export MEDRAG_CORPUS="/path/to/corpus"
  PYTHONPATH=api python models/medscore/build_medrag_embeddings.py
"""
import os
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_LLM_ROOT = _SCRIPT_DIR.parent.parent
_API_DIR = _LLM_ROOT / "api"
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")


def main():
    corpus_dir = os.environ.get("MEDRAG_CORPUS", str(_LLM_ROOT / "corpus"))
    corpus_dir = os.path.abspath(corpus_dir)
    chunk_dir = os.path.join(corpus_dir, "textbooks", "chunk")
    index_dir = os.path.join(corpus_dir, "textbooks", "index", "ncbi", "MedCPT-Article-Encoder")

    if not os.path.exists(chunk_dir):
        print(f"ERROR: Corpus not found at {chunk_dir}")
        print("Run: git clone https://huggingface.co/datasets/MedRAG/textbooks corpus/textbooks")
        sys.exit(1)

    print(f"Corpus: {corpus_dir}")
    from evaluators.lib.MedScore.medscore.medrag_utils import embed, construct_index

    print("[1/2] Computing embeddings (10-30 min for 125k chunks)...")
    h_dim = embed(chunk_dir=chunk_dir, index_dir=index_dir, model_name="ncbi/MedCPT-Article-Encoder")
    print(f"      Embedding dim: {h_dim}")

    print("[2/2] Building FAISS index...")
    construct_index(index_dir=index_dir, model_name="ncbi/MedCPT-Article-Encoder", h_dim=h_dim)

    print("Done! MedRAG embeddings ready at:", index_dir)


if __name__ == "__main__":
    main()

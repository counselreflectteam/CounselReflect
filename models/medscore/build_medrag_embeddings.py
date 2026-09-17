#!/usr/bin/env python3
"""
Build MedRAG MedCPT embeddings for the Textbooks corpus.
Run once to create faiss.index so MedScore medrag verification works.

Usage (from the repository root):
  export MEDRAG_CORPUS="/path/to/corpus"
  PYTHONPATH=api python models/medscore/build_medrag_embeddings.py
"""
import argparse
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the MedRAG Textbooks MedCPT index.")
    parser.add_argument(
        "--corpus-dir",
        default=os.environ.get("MEDRAG_CORPUS", str(_LLM_ROOT / "corpus")),
        help="MedRAG corpus root",
    )
    parser.add_argument("--force", action="store_true", help="Rebuild an existing complete index")
    args = parser.parse_args()

    corpus_dir = args.corpus_dir
    corpus_dir = os.path.abspath(corpus_dir)
    chunk_dir = os.path.join(corpus_dir, "textbooks", "chunk")
    index_dir = os.path.join(corpus_dir, "textbooks", "index", "ncbi", "MedCPT-Article-Encoder")

    if not os.path.exists(chunk_dir):
        print(f"Error: corpus not found at {chunk_dir}", file=sys.stderr)
        print("Clone https://huggingface.co/datasets/MedRAG/textbooks into the corpus root.", file=sys.stderr)
        return 2

    from utils.medscore import check_medrag_readiness
    ready, _ = check_medrag_readiness(corpus_dir)
    if ready and not args.force:
        print(f"MedRAG index is already ready at: {index_dir}")
        return 0

    print(f"Corpus: {corpus_dir}")
    try:
        from evaluators.lib.MedScore.medscore.medrag_utils import embed, construct_index

        print("[1/2] Computing embeddings (10-30 min for 125k chunks)...")
        h_dim = embed(chunk_dir=chunk_dir, index_dir=index_dir, model_name="ncbi/MedCPT-Article-Encoder")
        print(f"      Embedding dim: {h_dim}")

        print("[2/2] Building FAISS index...")
        construct_index(index_dir=index_dir, model_name="ncbi/MedCPT-Article-Encoder", h_dim=h_dim)
    except Exception as exc:
        print(f"Error: failed to build the MedRAG index: {exc}", file=sys.stderr)
        return 1

    ready, reason = check_medrag_readiness(corpus_dir)
    if not ready:
        print(f"Error: index build did not complete: {reason}", file=sys.stderr)
        return 1

    print("MedRAG embeddings ready at:", index_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

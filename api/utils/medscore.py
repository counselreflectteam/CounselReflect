"""Runtime readiness checks shared by the MedScore API and CLI."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Tuple


INDEX_RELATIVE_DIR = Path("textbooks/index/ncbi/MedCPT-Article-Encoder")


def configured_corpus_dir(default: str = "./corpus") -> Path:
    value = os.getenv("MEDRAG_CORPUS") or default
    return Path(value).expanduser().resolve()


def check_medrag_readiness(corpus_dir: Optional[os.PathLike[str] | str] = None) -> Tuple[bool, str]:
    """Check the exact corpus artifacts required by the MedScore retriever."""
    root = Path(corpus_dir).expanduser().resolve() if corpus_dir else configured_corpus_dir()
    chunk_dir = root / "textbooks" / "chunk"
    index_dir = root / INDEX_RELATIVE_DIR
    index_path = index_dir / "faiss.index"
    metadata_path = index_dir / "metadatas.jsonl"

    if not chunk_dir.is_dir() or not any(chunk_dir.glob("*.jsonl")):
        return False, "the MedRAG Textbooks corpus is not installed"
    if not index_path.is_file() or index_path.stat().st_size == 0:
        return False, "the MedCPT FAISS index has not been built"
    if not metadata_path.is_file() or metadata_path.stat().st_size == 0:
        return False, "the MedCPT index metadata is missing"
    return True, "ready"

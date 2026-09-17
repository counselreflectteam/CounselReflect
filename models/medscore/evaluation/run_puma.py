"""
PUMA dataset loader for MedScore Table 4 reproduction.

PUMA: 3,195 Yahoo! Answers health questions. Not bundled.
Request access from dataset organizers (e.g., m.schuiveling@umcutrecht.nl).
"""
import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional

DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "data"


def get_puma_path() -> Optional[Path]:
    """Get PUMA data path from env or default location."""
    env_path = os.environ.get("PUMA_DATA_PATH")
    if env_path:
        p = Path(env_path)
        return p if p.exists() else None
    default = DEFAULT_DATA_DIR / "puma.jsonl"
    return default if default.exists() else None


def load_puma(path: Optional[Path] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Load PUMA dataset."""
    path = path or get_puma_path()
    if not path:
        print(
            "PUMA dataset not found. Request access from dataset organizers.\n"
            f"Place at: $PUMA_DATA_PATH or {DEFAULT_DATA_DIR / 'puma.jsonl'}",
            file=sys.stderr,
        )
        sys.exit(1)
    with open(path) as f:
        rows = []
        for i, line in enumerate(f):
            if limit and i >= limit:
                break
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def to_medscore_dataset(rows: List[Dict[str, Any]], response_key: str = "response") -> List[Dict[str, Any]]:
    """Convert to MedScore input format."""
    return [
        {"id": r.get("id", str(i)), "response": str(r.get(response_key, r.get("answer", ""))).strip()}
        for i, r in enumerate(rows)
        if r.get(response_key) or r.get("answer")
    ]

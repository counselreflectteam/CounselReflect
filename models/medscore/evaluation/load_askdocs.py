"""
Load AskDocsAI dataset for MedScore Table 4 reproduction.

Format: {"id", "question", "doctor_response", "response"} per line.
Returns dataset in MedScore format: [{"id", "response", ...}]
"""
import json
import urllib.request
from pathlib import Path
from typing import List, Dict, Any, Optional

ASKDOCS_URL = "https://raw.githubusercontent.com/Heyuan9/MedScore/main/data/AskDocs.jsonl"
ASKDOCS_DEMO_URL = "https://raw.githubusercontent.com/Heyuan9/MedScore/main/data/AskDocs.demo.jsonl"
DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "data"


def _download(url: str, path: Path) -> bool:
    """Download URL to path. Returns True on success."""
    try:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={"User-Agent": "MedScore-Eval/1.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            path.write_bytes(resp.read())
        return True
    except Exception:
        return False


def ensure_askdocs(data_dir: Optional[Path] = None) -> Path:
    """Ensure AskDocs.jsonl exists, downloading if needed."""
    data_dir = data_dir or DEFAULT_DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / "AskDocs.jsonl"
    if not path.exists():
        print(f"Downloading AskDocs.jsonl from {ASKDOCS_URL}...")
        if _download(ASKDOCS_URL, path):
            print(f"Saved to {path}")
        else:
            demo_path = data_dir / "AskDocs.demo.jsonl"
            if _download(ASKDOCS_DEMO_URL, demo_path):
                demo_path.rename(path)
                print(f"Using demo (20 samples) saved to {path}")
            else:
                raise FileNotFoundError(
                    "Could not download AskDocs. Place AskDocs.jsonl manually at "
                    f"{path} or download from {ASKDOCS_URL}"
                )
    return path


def load_askdocs(
    path: Optional[Path] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Load AskDocsAI dataset."""
    path = path or ensure_askdocs()
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


def to_medscore_dataset(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert to MedScore input format: [{"id", "response"}, ...]."""
    return [
        {"id": r["id"], "response": r.get("response", "").strip()}
        for r in rows
        if r.get("response")
    ]

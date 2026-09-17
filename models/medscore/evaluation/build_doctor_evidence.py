"""
Build doctor evidence file for AskDocsAI "provided" verification.

Input: AskDocs.jsonl (id, question, doctor_response, response)
Output: AskDocs_doctor_evidence.json as {"id": "doctor_response_text", ...}
"""
import json
import sys
from pathlib import Path
from typing import Optional

_script_dir = Path(__file__).resolve().parent
if str(_script_dir) not in sys.path:
    sys.path.insert(0, str(_script_dir))
from load_askdocs import load_askdocs, ensure_askdocs, DEFAULT_DATA_DIR


def build_doctor_evidence(
    input_path: Optional[Path] = None,
    output_path: Optional[Path] = None,
) -> Path:
    """Build doctor evidence JSON from AskDocs.jsonl."""
    rows = load_askdocs(path=input_path)
    evidence = {
        r["id"]: r.get("doctor_response", "").strip()
        for r in rows
        if r.get("doctor_response")
    }
    output_path = output_path or (DEFAULT_DATA_DIR / "AskDocs_doctor_evidence.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(evidence, f, indent=2)
    print(f"Wrote {len(evidence)} doctor evidence entries to {output_path}")
    return output_path


if __name__ == "__main__":
    ensure_askdocs()
    build_doctor_evidence()

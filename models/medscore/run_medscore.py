#!/usr/bin/env python3
"""
Run MedScore evaluation (single conversation or from file).

Usage (from LLM_Model_Therapist_Tool):
  PYTHONPATH=api python models/medscore/run_medscore.py --api-key YOUR_KEY
  PYTHONPATH=api python models/medscore/run_medscore.py --text "CBT is evidence-based for anxiety."
  PYTHONPATH=api python models/medscore/run_medscore.py --input path/to/ChatGPT.jsonl --limit 5
  PYTHONPATH=api python models/medscore/run_medscore.py --api  # via running API server
"""
import argparse
import json
import os
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_LLM_ROOT = _SCRIPT_DIR.parent.parent
_API_DIR = _LLM_ROOT / "api"
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

_env = _API_DIR / ".env"
if _env.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env)
    except ImportError:
        pass

CORPUS = os.environ.get("MEDRAG_CORPUS", str(_LLM_ROOT / "corpus"))


def conversation_from_jsonl(path: str, limit: int = None) -> list:
    """Convert ChatGPT.jsonl (input/output) to conversation format."""
    out = []
    with open(path) as f:
        for i, line in enumerate(f):
            if limit and i >= limit:
                break
            row = json.loads(line)
            inp = row.get("input", "")
            out_text = row.get("output", "")
            out.append({"speaker": "Patient", "text": inp})
            out.append({"speaker": "Therapist", "text": out_text})
    return out


def run_via_api(conversation: list, api_key: str, hf_key: str, provider: str = "openai", model: str = "gpt-4o"):
    """Call the /predefined_metrics/evaluate endpoint."""
    import urllib.request
    url = "http://localhost:8000/predefined_metrics/evaluate"
    body = {
        "conversation": conversation,
        "metrics": ["medscore"],
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "huggingface_api_key": hf_key or "dummy",
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode())


def run_direct(conversation: list, api_key: str, provider: str = "openai", model: str = "gpt-4o"):
    """Run medscore_runner directly (no server)."""
    import subprocess
    runner = _API_DIR / "evaluators" / "lib" / "MedScore" / "medscore_runner.py"
    cmd = [sys.executable, str(runner), "--provider", provider, "--model", model, "--api-key", api_key, "--corpus-dir", CORPUS]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = proc.communicate(input=json.dumps(conversation), timeout=300)
    if proc.returncode != 0:
        print(stderr, file=sys.stderr)
        sys.exit(proc.returncode)
    for line in reversed(stdout.strip().split("\n")):
        line = line.strip()
        if line.startswith("[") and line.endswith("]"):
            return json.loads(line)
    raise RuntimeError("No JSON output from runner")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", action="store_true", help="Use API (server must be running)")
    ap.add_argument("--api-key", default=os.environ.get("OPENAI_API_KEY"))
    ap.add_argument("--hf-key", default="", help="HuggingFace API key for API mode")
    ap.add_argument("--provider", default="openai")
    ap.add_argument("--model", default="gpt-4o")
    ap.add_argument("--input", help="Path to ChatGPT.jsonl")
    ap.add_argument("--limit", type=int, default=1)
    ap.add_argument("--text", help="Single therapist response to evaluate")
    ap.add_argument("--conversation", help="Path to conversation JSON file")
    args = ap.parse_args()

    if not args.api_key:
        print("Error: --api-key or OPENAI_API_KEY required", file=sys.stderr)
        sys.exit(1)

    if args.input:
        conversation = conversation_from_jsonl(args.input, limit=args.limit)
        print(f"Loaded {args.limit} row(s) from {args.input}")
    elif args.text:
        conversation = [{"speaker": "Patient", "text": "[Context]"}, {"speaker": "Therapist", "text": args.text}]
    elif args.conversation:
        with open(args.conversation) as f:
            conversation = json.load(f)
    else:
        conversation = [
            {"speaker": "Patient", "text": "I'm worried about my tetanus vaccine. It expired in 2020 and I got a cut today."},
            {"speaker": "Therapist", "text": "Since you've had your primary tetanus shots as a child, you don't need immunoglobulin shots. Your doctor recommends getting a tetanus booster vaccine as soon as possible."},
        ]
        print("Using default test conversation")

    os.environ["MEDRAG_CORPUS"] = CORPUS

    if args.api:
        result = run_via_api(conversation, args.api_key, args.hf_key, args.provider, args.model)
    else:
        result = run_direct(conversation, args.api_key, args.provider, args.model)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

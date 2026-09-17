#!/usr/bin/env python3
"""
Run MedScore evaluation (single conversation or from file).

Usage (from the repository root):
  PYTHONPATH=api python models/medscore/run_medscore.py --api-key YOUR_KEY
  PYTHONPATH=api python models/medscore/run_medscore.py --text "CBT is evidence-based for anxiety."
  PYTHONPATH=api python models/medscore/run_medscore.py --input path/to/ChatGPT.jsonl --limit 5
  PYTHONPATH=api python models/medscore/run_medscore.py --api  # via running API server
"""
import argparse
import json
import os
import signal
import subprocess
import sys
import urllib.error
import urllib.request
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
PROVIDER_KEY_ENV = {
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "claude": "ANTHROPIC_API_KEY",
}


def conversation_from_jsonl(path: str, limit: int | None = None) -> list:
    """Convert ChatGPT.jsonl (input/output) to conversation format."""
    out = []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            if limit and i >= limit:
                break
            row = json.loads(line)
            inp = row.get("input", "")
            out_text = row.get("output", "")
            out.append({"speaker": "Patient", "text": inp})
            out.append({"speaker": "Therapist", "text": out_text})
    return out


def run_via_api(
    conversation: list,
    api_key: str | None,
    hf_key: str | None,
    provider: str = "openai",
    model: str = "gpt-4o",
    api_url: str = "http://localhost:8000",
    access_token: str | None = None,
    timeout: float = 300,
):
    """Call the /predefined_metrics/evaluate endpoint."""
    url = f"{api_url.rstrip('/')}/predefined_metrics/evaluate"
    body = {
        "conversation": conversation,
        "metrics": ["medscore"],
        "provider": provider,
        "model": model,
    }
    if api_key:
        body["api_key"] = api_key
    if hf_key:
        body["huggingface_api_key"] = hf_key

    headers = {"Content-Type": "application/json"}
    if access_token:
        headers["X-CounselReflect-Access"] = access_token

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = f"HTTP {exc.code}"
        try:
            payload = json.loads(exc.read().decode())
            detail = payload.get("detail") or payload.get("message") or detail
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
        raise RuntimeError(f"API request failed: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Cannot reach the analysis server at {api_url}") from exc


def run_direct(
    conversation: list,
    api_key: str | None,
    provider: str = "openai",
    model: str = "gpt-4o",
    corpus_dir: str = CORPUS,
    timeout: float = 300,
):
    """Run medscore_runner directly (no server)."""
    from utils.medscore import check_medrag_readiness

    ready, reason = check_medrag_readiness(corpus_dir)
    if not ready:
        raise RuntimeError(
            f"MedRAG is not ready: {reason}. "
            "Set --corpus-dir or MEDRAG_CORPUS and build the index."
        )

    runner = _API_DIR / "evaluators" / "lib" / "MedScore" / "medscore_runner.py"
    cmd = [
        sys.executable,
        str(runner),
        "--provider", provider,
        "--model", model,
        "--corpus-dir", corpus_dir,
    ]
    child_env = os.environ.copy()
    if api_key:
        child_env["COUNSELREFLECT_RUNNER_API_KEY"] = api_key
    popen_kwargs = {
        "stdin": subprocess.PIPE,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "text": True,
        "env": child_env,
    }
    if os.name == "posix":
        popen_kwargs["start_new_session"] = True
    proc = subprocess.Popen(cmd, **popen_kwargs)
    try:
        stdout, stderr = proc.communicate(input=json.dumps(conversation), timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        if os.name == "posix":
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        else:
            proc.kill()
        proc.communicate()
        raise RuntimeError(f"MedScore timed out after {timeout:.0f} seconds") from exc
    if proc.returncode != 0:
        safe_stderr = stderr.replace(api_key, "[redacted]") if api_key else stderr
        tail = safe_stderr.strip().splitlines()[-1:] or ["no runner details"]
        raise RuntimeError(f"MedScore runner failed: {tail[0]}")
    for line in reversed(stdout.strip().split("\n")):
        line = line.strip()
        if line.startswith("[") and line.endswith("]"):
            return json.loads(line)
    raise RuntimeError("No JSON output from runner")


def main() -> int:
    ap = argparse.ArgumentParser(description="Run a MedScore factuality evaluation.")
    ap.add_argument("--api", action="store_true", help="Use API (server must be running)")
    ap.add_argument("--api-url", default=os.environ.get("COUNSELREFLECT_API_URL", "http://localhost:8000"))
    ap.add_argument("--access-token", default=os.environ.get("COUNSELREFLECT_ACCESS_TOKEN"))
    ap.add_argument("--api-key", help="Provider API key (defaults to the provider's environment variable)")
    ap.add_argument("--hf-key", default="", help="HuggingFace API key for API mode")
    ap.add_argument("--provider", choices=["openai", "gemini", "claude", "ollama"], default="openai")
    ap.add_argument("--model", default="gpt-4o")
    ap.add_argument("--input", help="Path to ChatGPT.jsonl")
    ap.add_argument("--limit", type=int, default=1)
    ap.add_argument("--text", help="Single therapist response to evaluate")
    ap.add_argument("--conversation", help="Path to conversation JSON file")
    ap.add_argument("--corpus-dir", default=CORPUS, help="MedRAG corpus root (direct mode)")
    ap.add_argument("--timeout", type=float, default=300, help="Timeout in seconds")
    args = ap.parse_args()

    if args.limit < 1:
        ap.error("--limit must be at least 1")
    if args.timeout <= 0:
        ap.error("--timeout must be greater than 0")

    api_key = args.api_key
    env_key = PROVIDER_KEY_ENV.get(args.provider)
    if not api_key and env_key:
        api_key = os.environ.get(env_key)
    if not args.api and args.provider != "ollama" and not api_key:
        ap.error(f"--api-key or {env_key} is required in direct mode")

    try:
        if args.input:
            conversation = conversation_from_jsonl(args.input, limit=args.limit)
            print(f"Loaded {len(conversation) // 2} row(s) from {args.input}", file=sys.stderr)
        elif args.text:
            conversation = [{"speaker": "Patient", "text": "[Context]"}, {"speaker": "Therapist", "text": args.text}]
        elif args.conversation:
            with open(args.conversation, encoding="utf-8") as file:
                conversation = json.load(file)
        else:
            conversation = [
                {"speaker": "Patient", "text": "I'm worried about my tetanus vaccine. It expired in 2020 and I got a cut today."},
                {"speaker": "Therapist", "text": "Since you've had your primary tetanus shots as a child, you don't need immunoglobulin shots. Your doctor recommends getting a tetanus booster vaccine as soon as possible."},
            ]
            print("Using default test conversation", file=sys.stderr)

        if args.api:
            result = run_via_api(
                conversation,
                api_key,
                args.hf_key,
                args.provider,
                args.model,
                args.api_url,
                args.access_token,
                args.timeout,
            )
        else:
            result = run_direct(
                conversation,
                api_key,
                args.provider,
                args.model,
                args.corpus_dir,
                args.timeout,
            )
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

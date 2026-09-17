"""
MedScore Evaluator

Evaluates factual accuracy of medical/therapeutic responses using MedScore framework.
Uses claim decomposition with MedRAG (medical corpus) verification.

Pipeline (per therapist utterance):
1. Decompose response into atomic medical claims using 'medscore' prompt
2. Retrieve relevant medical passages from MedText corpus (Textbooks)
3. Verify each claim against retrieved evidence
4. Calculate score = supported_claims / total_claims
"""
from typing import List, Dict, Any
import logging
import os
import json
import time
from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from utils.cancellation import EvaluationCancelled, raise_if_cancelled
from utils.medscore import check_medrag_readiness
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_utterance_result

logger = logging.getLogger(__name__)


@register_evaluator(
    "medscore",
    label="MedScore",
    description="Medical factuality score using claim decomposition and MedRAG corpus verification (Textbooks). Evaluates chatbot turns only. Claim-by-claim verification makes this one of the slower metrics.",
    category="Factuality",
    target="therapist",
    output_description="Factuality from 0 to 1: the mean binary verification score across extracted claims.",
    reference={
        "shortApa": "Huang et al. (2026)",
        "title": "MedScore: Generalizable Factuality Evaluation of Open-ended Long-form Medical Answers by Domain-adapted Claim Decomposition and Verification",
        "citation": "Huang, H., DeLucia, A., Tiyyala, V. M., & Dredze, M. (2026). MedScore: Generalizable Factuality Evaluation of Open-ended Long-form Medical Answers by Domain-adapted Claim Decomposition and Verification. Findings of ACL 2026.",
        "url": "https://aclanthology.org/2026.findings-acl.693/"
    }
)
class MedScoreEvaluator(Evaluator):
    """
    Adapter for MedScore package to work with the evaluator API.
    
    This evaluator wraps the MedScore pipeline and adapts it to work with our
    conversation-based evaluation framework. It decomposes medical claims and
    verifies them against medical literature.
    """
    
    METRIC_NAME = "medscore"
    THERAPIST_ROLES = {"therapist", "helper", "counselor", "assistant"}
    
    def __init__(self, **kwargs):
        super().__init__()
        
        # Store config for later use in execute()
        model_config = kwargs.get("model_config", {})
        self.provider_name = model_config.get("provider", "openai")
        self.model = model_config.get("model", "gpt-4o")
        self.api_key = model_config.get("api_key")
        
        # Get corpus directory from environment or use default
        self.corpus_dir = os.environ.get("MEDRAG_CORPUS", "./corpus")
        
        logger.info(f"Initialized {self.METRIC_NAME} evaluator config: {self.provider_name}/{self.model}")

    @staticmethod
    def _normalize_runner_scores(
        raw_scores: List[Any],
        conversation_length: int
    ) -> List[Dict[str, Any]]:
        """
        Normalize runner output into the shape expected by create_utterance_result():
        [{metric_name: MetricScore}, ...]

        Runner may return either:
        - [{"index": i, "metrics": {...}}, ...]
        - [{...metrics...}, ...]
        """
        normalized: List[Dict[str, Any]] = [{} for _ in range(conversation_length)]

        if not isinstance(raw_scores, list):
            raise ValueError("Runner output is not a list")

        for i, item in enumerate(raw_scores):
            if not isinstance(item, dict):
                continue

            if "metrics" in item and isinstance(item["metrics"], dict):
                idx = item.get("index", i)
                if isinstance(idx, int) and 0 <= idx < conversation_length:
                    normalized[idx] = item["metrics"]
                continue

            if i < conversation_length:
                normalized[i] = item

        return normalized
    
    def execute(self, conversation: List[Utterance], **kwargs) -> EvaluationResult:
        """
        Evaluate using a separate process.

        The runner isolates FAISS/PyTorch state from the API process. Its
        timeout is bounded and the request-scoped API key is passed through a
        child-only environment variable rather than process arguments.
        """
        import subprocess
        import sys
        import signal

        cancellation_event = kwargs.get("cancellation_event")
        raise_if_cancelled(cancellation_event)
        
        # Prepare input
        input_data = [dict(u) for u in conversation]
        input_json = json.dumps(input_data)

        ready, reason = check_medrag_readiness(self.corpus_dir)
        if not ready:
            raise RuntimeError(
                f"MedScore is unavailable because {reason}. "
                "Configure MEDRAG_CORPUS and run the MedRAG index builder."
            )
        
        # Determine runner path using absolute path of current file
        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../lib/MedScore/medscore_runner.py")
        )
        
        if not os.path.exists(runner_path):
            logger.error(f"Runner script not found at: {runner_path}")
            raise RuntimeError(f"MedScore runner script not found: {runner_path}")

        # Prepare command
        cmd = [
            sys.executable,
            runner_path,
            "--provider", self.provider_name,
            "--model", self.model,
            "--corpus-dir", self.corpus_dir
        ]

        child_env = os.environ.copy()
        if self.api_key:
            child_env["COUNSELREFLECT_RUNNER_API_KEY"] = self.api_key

        try:
            timeout_seconds = float(os.getenv("MEDSCORE_TIMEOUT_SECONDS", "300"))
        except ValueError:
            timeout_seconds = 300.0
        timeout_seconds = min(max(timeout_seconds, 1.0), 3600.0)
            
        logger.info(f"[{self.METRIC_NAME}] Starting MedScore subprocess: {runner_path}")
        
        try:
            popen_kwargs = {
                "stdin": subprocess.PIPE,
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
                "text": True,
                "env": child_env,
            }
            if os.name == "posix":
                popen_kwargs["start_new_session"] = True

            process = subprocess.Popen(
                cmd,
                **popen_kwargs,
            )

            def kill_and_drain():
                if process.poll() is None:
                    if os.name == "posix":
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    else:
                        process.kill()
                return process.communicate()

            try:
                deadline = time.monotonic() + timeout_seconds
                first_communicate = True
                while True:
                    if cancellation_event is not None and cancellation_event.is_set():
                        kill_and_drain()
                        logger.info("[%s] Subprocess cancelled by user", self.METRIC_NAME)
                        raise EvaluationCancelled("Evaluation cancelled by the user.")

                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise subprocess.TimeoutExpired(cmd, timeout_seconds)

                    try:
                        stdout_data, stderr_data = process.communicate(
                            input=input_json if first_communicate else None,
                            timeout=min(0.25, remaining),
                        )
                        break
                    except subprocess.TimeoutExpired:
                        first_communicate = False

                raise_if_cancelled(cancellation_event)
            except subprocess.TimeoutExpired:
                kill_and_drain()
                logger.error(
                    "[%s] Subprocess timed out after %.0f seconds",
                    self.METRIC_NAME,
                    timeout_seconds,
                )
                raise RuntimeError(
                    f"MedScore timed out after {timeout_seconds:.0f} seconds. "
                    "Retry once, then check the MedRAG index and provider service."
                )
            
            if process.returncode != 0:
                safe_stderr = stderr_data
                if self.api_key:
                    safe_stderr = safe_stderr.replace(self.api_key, "[redacted]")
                logger.error(
                    "[%s] Runner failed with exit code %s. stderr tail: %s",
                    self.METRIC_NAME,
                    process.returncode,
                    safe_stderr[-2000:],
                )
                raise RuntimeError(
                    "MedScore could not complete. Check the configured corpus, "
                    "provider credentials, and server logs, then retry."
                )
            
            # Parse output
            try:
                output_json = stdout_data.strip()
                # Find the last valid JSON line
                lines = output_json.split('\n')
                json_line = ""
                for line in reversed(lines):
                    if line.strip().startswith("[") and line.strip().endswith("]"):
                        json_line = line.strip()
                        break
                
                if not json_line:
                    raise json.JSONDecodeError("No JSON list found", output_json, 0)
                    
                raw_scores = json.loads(json_line)
                scores_per_utterance = self._normalize_runner_scores(raw_scores, len(conversation))
                logger.info(f"[{self.METRIC_NAME}] Successfully parsed results")
                return create_utterance_result(conversation, scores_per_utterance)
                
            except json.JSONDecodeError as e:
                logger.error(f"[{self.METRIC_NAME}] Failed to parse output: {e}")
                raise RuntimeError(
                    "MedScore returned an invalid result. Check the server logs and retry."
                ) from e
                
        except EvaluationCancelled:
            raise
        except Exception as e:
            logger.error("[%s] Evaluation failed: %s", self.METRIC_NAME, e, exc_info=True)
            raise

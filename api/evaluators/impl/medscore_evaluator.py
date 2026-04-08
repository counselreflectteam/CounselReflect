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
from evaluators.base import Evaluator
from evaluators.registry import register_evaluator
from providers.base import LLMProvider
from schemas import Utterance, EvaluationResult
from utils.evaluation_helpers import create_utterance_result

# Import MedScore components
from evaluators.lib.MedScore.medscore.medscore import MedScore
from evaluators.lib.MedScore.medscore.config_schema import (
    MedScoreConfig,
    MedScoreDecomposerConfig,
    MedRAGVerifierConfig
)
from evaluators.lib.MedScore.medscore.utils import parse_sentences

logger = logging.getLogger(__name__)


@register_evaluator(
    "medscore",
    label="MedScore",
    description="Medical factuality score using claim decomposition and MedRAG corpus verification (Textbooks). Evaluates therapist turns only.",
    category="Factuality",
    target="therapist",
    reference={
        "shortApa": "Huang et al. (2025)",
        "title": "MedScore: Generalizable Factuality Evaluation of Free-Form Medical Answers by Domain-adapted Claim Decomposition and Verification",
        "citation": "Huang, H., DeLucia, A., Tiyyala, V. M., & Dredze, M. (2025). MedScore: Generalizable Factuality Evaluation of Free-Form Medical Answers by Domain-adapted Claim Decomposition and Verification. arXiv.",
        "url": "https://arxiv.org/abs/2505.18452"
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
        Evaluate using a separate process with real-time log streaming.
        """
        import subprocess
        import sys
        import threading
        
        # Prepare input
        input_data = [dict(u) for u in conversation]
        input_json = json.dumps(input_data)
        
        # Determine runner path using absolute path of current file
        runner_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../lib/MedScore/medscore_runner.py")
        
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
        
        if self.api_key:
            cmd.extend(["--api-key", self.api_key])
            
        logger.info(f"[{self.METRIC_NAME}] Starting MedScore subprocess: {runner_path}")
        
        try:
            # Start process with pipes
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1  # Line buffered
            )
            
            stdout_chunks: List[str] = []

            # Helper to collect stdout output without racing with communicate()
            def collect_stdout(pipe):
                try:
                    data = pipe.read()
                    if data:
                        stdout_chunks.append(data)
                except Exception as e:
                    logger.error(f"Error collecting runner stdout: {e}")
                finally:
                    pipe.close()

            # Helper to stream stderr to main logger
            def stream_stderr(pipe):
                try:
                    for line in iter(pipe.readline, ''):
                        if line.strip():
                            # Forward runner logs to our logger
                            logger.info(f"[Runner] {line.strip()}")
                except Exception as e:
                    logger.error(f"Error streaming runner logs: {e}")
                finally:
                    pipe.close()

            # Start stdout collection and stderr logging threads
            stdout_thread = threading.Thread(target=collect_stdout, args=(process.stdout,))
            stdout_thread.daemon = True
            stdout_thread.start()

            # Start logging thread
            stderr_thread = threading.Thread(target=stream_stderr, args=(process.stderr,))
            stderr_thread.daemon = True
            stderr_thread.start()

            # Send input via stdin, then wait for process completion.
            if process.stdin:
                process.stdin.write(input_json)
                process.stdin.close()

            try:
                process.wait(timeout=300)
            except subprocess.TimeoutExpired:
                process.kill()
                logger.error(f"[{self.METRIC_NAME}] Subprocess timed out")
                raise RuntimeError("MedScore subprocess timed out after 300 seconds")
            
            # Wait for I/O threads to flush captured output
            stdout_thread.join(timeout=2.0)
            stderr_thread.join(timeout=1.0)
            stdout_data = "".join(stdout_chunks)
            
            if process.returncode != 0:
                logger.error(f"[{self.METRIC_NAME}] Subprocess failed with code {process.returncode}")
                raise RuntimeError(f"MedScore subprocess failed with exit code {process.returncode}")
            
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
                logger.error(f"Raw output: {stdout_data[:1000]}")
                raise RuntimeError(f"MedScore output parse failed: {e}") from e
                
        except Exception as e:
            logger.error(f"[{self.METRIC_NAME}] Error running subprocess: {e}", exc_info=True)
            raise RuntimeError(f"Failed to analyze MedScore: {e}") from e

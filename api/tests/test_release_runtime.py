import json
import logging
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from customizePipeline.llm_client import chat_json
from evaluators.impl.medscore_evaluator import MedScoreEvaluator
from literature.evaluator import LiteratureEvaluator
from utils.cancellation import (
    EvaluationCancelled,
    cancel_evaluation_run,
    register_evaluation_run,
    release_evaluation_run,
    reset_cancellation_registry_for_tests,
)
from utils.medscore import check_medrag_readiness
from utils.streaming import run_with_heartbeats


def _ready_corpus(root: Path) -> None:
    chunk_dir = root / "textbooks" / "chunk"
    index_dir = root / "textbooks" / "index" / "ncbi" / "MedCPT-Article-Encoder"
    chunk_dir.mkdir(parents=True)
    index_dir.mkdir(parents=True)
    (chunk_dir / "book.jsonl").write_text('{"id":"book_0"}\n', encoding="utf-8")
    (index_dir / "faiss.index").write_bytes(b"index")
    (index_dir / "metadatas.jsonl").write_text('{"index":0}\n', encoding="utf-8")


class ReleaseRuntimeTests(unittest.TestCase):
    def tearDown(self):
        reset_cancellation_registry_for_tests()

    def test_long_operation_emits_heartbeat_and_returns_result(self):
        def operation():
            time.sleep(0.03)
            return {"ok": True}

        events = []
        with patch("utils.streaming.heartbeat_interval_seconds", return_value=0.005):
            generator = run_with_heartbeats(operation, "metric")
            while True:
                try:
                    events.append(json.loads(next(generator)))
                except StopIteration as completed:
                    result = completed.value
                    break

        self.assertEqual(result, {"ok": True})
        self.assertTrue(any(event["type"] == "heartbeat" for event in events))

    def test_run_cancellation_is_shared_across_registered_streams(self):
        first = register_evaluation_run("run-shared-123")
        second = register_evaluation_run("run-shared-123")

        self.assertIs(first, second)
        self.assertEqual(cancel_evaluation_run("run-shared-123"), 2)
        self.assertTrue(first.is_set())

        release_evaluation_run("run-shared-123")
        release_evaluation_run("run-shared-123")
        late_stream = register_evaluation_run("run-shared-123")
        self.assertTrue(late_stream.is_set())
        release_evaluation_run("run-shared-123")

    def test_blocking_operation_observes_run_cancellation(self):
        cancellation_event = threading.Event()

        def operation():
            cancellation_event.wait(timeout=1)
            return {"should_not": "be returned"}

        generator = run_with_heartbeats(
            operation,
            "metric",
            cancellation_event,
        )
        cancellation_event.set()
        with self.assertRaises(EvaluationCancelled):
            next(generator)

    def test_medrag_readiness_requires_chunks_index_and_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.assertFalse(check_medrag_readiness(root)[0])
            _ready_corpus(root)
            self.assertEqual(check_medrag_readiness(root), (True, "ready"))

    def test_medscore_key_is_not_put_in_process_arguments(self):
        class FakeProcess:
            returncode = 0
            pid = 123

            def communicate(self, input=None, timeout=None):
                output = [{
                    "index": 0,
                    "metrics": {
                        "medscore": {
                            "type": "numerical",
                            "value": 1.0,
                            "max_value": 1.0,
                        }
                    },
                }]
                return json.dumps(output), ""

        captured = {}

        def fake_popen(command, **kwargs):
            captured["command"] = command
            captured["env"] = kwargs["env"]
            return FakeProcess()

        with tempfile.TemporaryDirectory() as temp_dir:
            _ready_corpus(Path(temp_dir))
            evaluator = MedScoreEvaluator(model_config={
                "provider": "openai",
                "model": "gpt-4o",
                "api_key": "sentinel-secret",
            })
            evaluator.corpus_dir = temp_dir
            with patch.object(subprocess, "Popen", side_effect=fake_popen):
                result = evaluator.execute([
                    {"speaker": "Therapist", "text": "A medical statement."},
                ])

        self.assertNotIn("sentinel-secret", captured["command"])
        self.assertEqual(captured["env"]["COUNSELREFLECT_RUNNER_API_KEY"], "sentinel-secret")
        self.assertEqual(result["per_utterance"][0]["metrics"]["medscore"]["value"], 1.0)

    def test_medscore_cancellation_kills_the_subprocess_group(self):
        cancellation_event = threading.Event()

        class FakeProcess:
            returncode = None
            pid = 456
            killed = False

            def poll(self):
                return -9 if self.killed else None

            def communicate(self, input=None, timeout=None):
                if self.killed:
                    self.returncode = -9
                    return "", ""
                cancellation_event.set()
                raise subprocess.TimeoutExpired(["medscore"], timeout)

        fake_process = FakeProcess()

        def fake_killpg(pid, signal_number):
            self.assertEqual(pid, fake_process.pid)
            fake_process.killed = True

        with tempfile.TemporaryDirectory() as temp_dir:
            _ready_corpus(Path(temp_dir))
            evaluator = MedScoreEvaluator(model_config={
                "provider": "openai",
                "model": "gpt-4o",
                "api_key": "sentinel-secret",
            })
            evaluator.corpus_dir = temp_dir
            with patch.object(subprocess, "Popen", return_value=fake_process), patch(
                "os.killpg",
                side_effect=fake_killpg,
            ):
                with self.assertRaises(EvaluationCancelled):
                    evaluator.execute(
                        [{"speaker": "Therapist", "text": "A medical statement."}],
                        cancellation_event=cancellation_event,
                    )

        self.assertTrue(fake_process.killed)

    def test_literature_logs_do_not_contain_model_output(self):
        sentinel = "private-model-rationale"

        class Provider:
            def chat_completion(self, **kwargs):
                return json.dumps({"score": 3, "rationale": sentinel})

        evaluator = object.__new__(LiteratureEvaluator)
        evaluator.provider = Provider()
        evaluator.model = "test-model"

        with self.assertLogs("literature.evaluator", level=logging.DEBUG) as logs:
            result = evaluator.evaluate_utterance(
                utterance="Private transcript text",
                metric_name="Test metric",
                rubric="Test rubric",
                level_1_description="Low",
                level_3_description="Medium",
                level_5_description="High",
                context=[],
                definition="Definition",
            )

        self.assertEqual(result["rationale"], sentinel)
        self.assertNotIn(sentinel, "\n".join(logs.output))

    def test_custom_metric_logs_do_not_contain_model_output(self):
        sentinel = "private-custom-output"

        class Provider:
            def chat_completion(self, **kwargs):
                return json.dumps({"result": sentinel})

        with patch(
            "customizePipeline.llm_client.ProviderRegistry.get_provider",
            return_value=Provider(),
        ):
            with self.assertLogs("customizePipeline.llm_client", level=logging.DEBUG) as logs:
                result = chat_json(
                    "system",
                    "private transcript",
                    "openai",
                    "test-model",
                    "secret",
                )

        self.assertEqual(result["result"], sentinel)
        self.assertNotIn(sentinel, "\n".join(logs.output))


if __name__ == "__main__":
    unittest.main()

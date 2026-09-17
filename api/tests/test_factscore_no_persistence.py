"""
Privacy regression: FactScore must never persist transcript-derived text.

The public site promises "The analysis server does not persist submitted
transcripts". FactScore's retrieval cache embeds extracted fact text verbatim
in its keys and the LLM cache stores raw model outputs, so neither may be
written to disk, and files left behind by older versions must be scrubbed.
"""
import inspect

from evaluators.lib.fact_score import fact_score as fs


class _StubProvider:
    def chat(self, *args, **kwargs):  # pragma: no cover - never called here
        return ""


def test_no_disk_cache_helpers_remain():
    source = inspect.getsource(fs)
    assert "_save_json_cache" not in source
    assert "_load_json_cache" not in source
    assert "_save_pkl_cache" not in source


def test_scrub_removes_legacy_cache_files(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTSCORE_CACHE_DIR", str(tmp_path))
    legacy = [
        tmp_path / "factscore_retrieval.json",
        tmp_path / "factscore_llm.json",
        tmp_path / "factscore_llm.json.tmp",
        tmp_path / "factscore_retrieval.pkl",
    ]
    for path in legacy:
        path.write_text("{}")

    fs._scrub_legacy_transcript_caches()

    for path in legacy:
        assert not path.exists(), f"legacy cache file survived: {path.name}"


def test_scoring_run_writes_no_transcript_cache_files(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTSCORE_CACHE_DIR", str(tmp_path))
    monkeypatch.setenv("FACTSCORE_DB_PATH", str(tmp_path / "missing.db"))
    # Never fall back to the 20GB Hugging Face DocDB download in tests.
    monkeypatch.setattr(fs, "HF_HUB_AVAILABLE", False)

    scorer = fs.FactScorer(_StubProvider(), "gpt-test")._scorer
    scorer._retrieval_cache["Topic#Topic secret fact from a transcript"] = []
    scorer._llm_cache["somehash"] = "decomposed transcript content"

    written = [p.name for p in tmp_path.iterdir() if p.name.startswith("factscore_")]
    assert written == [], f"transcript-derived cache files written: {written}"

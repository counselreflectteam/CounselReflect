# FactScore Evaluation

This directory contains scripts and reference copies for FActScore-style factual accuracy evaluation. **The canonical implementation lives in the API package.**

## Canonical implementation (single source of truth)

| Component | Location | Purpose |
|-----------|----------|---------|
| **FactScorer** | `api/evaluators/lib/fact_score/` | FActScore-aligned pipeline: DocDB, BM25 retrieval, per-fact True/False verification |
| **Fact evaluator** | `api/evaluators/impl/fact_evaluator.py` | Evaluator used by the API; evaluates therapist turns only, no pre-summarization |

## Scripts in this directory

- **`evaluate_factscore_pipeline.py`** – Standalone CLI that **imports** the canonical `FactScorer` from the API. Run from project root (or with `PYTHONPATH` including `api/`). Uses the FActScore-aligned pipeline (DocDB + BM25 + per-fact verification).
- **`evaluate_fact_dataset_standalone.py`** – Data loading, ground-truth extraction, and metrics (e.g. F1, Pearson). Its `main()` uses a **simple LLM prompt** for lightweight evaluation (no DocDB). For FActScore-aligned evaluation, use `evaluate_factscore_pipeline.py` instead.
- **`visualize_results.py`** – Visualization of results (reads `fact_evaluation_complete_results.json` produced by `evaluate_fact_dataset_standalone.py`).

## Running the pipeline

From the **LLM_Model_Therapist_Tool** directory (or project root with `api` on `PYTHONPATH`):

```bash
cd LLM_Model_Therapist_Tool/models/factscore/evaluation
python evaluate_factscore_pipeline.py --limit 10 --verbose
```

Required:

- `OPENAI_API_KEY` set (or `.env` in `api/` with the key).
- Dataset at path given by `FACTSCORE_DATA_DIR` or the default `info/.../factual_dat` with a `labeled/` subdirectory.

Optional:

- `--limit N` – Evaluate only the first N examples.
- `--model MODEL` – Model name (e.g. `gpt-4o-mini` for fast local testing block, user-configurable during live usage).
- `--mode MODE` – Accepted for backward compatibility; script always uses the canonical pipeline.
- `FACTSCORE_DB_PATH` – Path to `enwiki-20230401.db` for DocDB-backed retrieval (see main `models/factscore/README.md`).


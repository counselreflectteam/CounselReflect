"""
Evaluate using atomic fact decomposition + verification (FActScore-aligned).

Uses the canonical FactScorer from api/evaluators/lib/fact_score (DocDB, BM25,
per-fact True/False verification). Run from project root or with PYTHONPATH
including the api package.

Set OPENAI_API_KEY for the OpenAI API calls.
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure api package is on path so we can use the canonical FactScorer
_SCRIPT_DIR = Path(__file__).resolve().parent  # .../models/factscore/evaluation
_LLM_TOOL_ROOT = _SCRIPT_DIR.parent.parent.parent  # LLM_Model_Therapist_Tool
_API_DIR = _LLM_TOOL_ROOT / "api"
if _API_DIR.is_dir() and str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

# Reuse data loading and metrics from the standalone evaluator
from evaluate_fact_dataset_standalone import (
    load_labeled_data,
    extract_ground_truth_labels,
    calculate_metrics,
    SCIPY_AVAILABLE,
)

# Canonical fact scorer and OpenAI provider from API
from providers.openai_provider import OpenAIProvider
from evaluators.lib.fact_score import FactScorer


def get_data_dir() -> str:
    """Resolve path to labeled factual dataset (same as standalone script)."""
    if os.environ.get("FACTSCORE_DATA_DIR"):
        return os.environ["FACTSCORE_DATA_DIR"]
    base_dir = _SCRIPT_DIR.parent  # factscore/
    default = base_dir / "info" / "drive-download-20260127T012834Z-3-001" / "factual_dat"
    if default.is_dir() and (default / "labeled").is_dir():
        return str(default)
    workspace_root = base_dir.parent.parent  # LLM_Model_Therapist_Tool -> NLP_MentalHealth
    fallback = workspace_root / "info" / "drive-download-20260127T012834Z-3-001" / "factual_dat"
    if fallback.is_dir() and (fallback / "labeled").is_dir():
        return str(fallback)
    return str(default)


def run_factscore_pipeline(
    data_dir: str,
    openai_key: str,
    model: str = "gpt-4o-mini",
    mode: str = "default",
    verbose: bool = False,
    max_samples: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run the canonical FActScore pipeline on the labeled dataset.
    Uses api/evaluators/lib/fact_score FactScorer (DocDB + BM25 + per-fact verification).
    The `mode` argument is accepted for backward compatibility but the script always
    uses the single canonical pipeline.
    """
    if mode != "default":
        print(f"Note: Using canonical FActScore pipeline (--mode '{mode}' kept for compatibility).")
    print(f"Initializing FactScorer with model={model}...")
    provider = OpenAIProvider(api_key=openai_key)
    scorer = FactScorer(provider, model)

    print("\nLoading dataset...")
    dataset = load_labeled_data(data_dir)
    total_available = len(dataset)
    if max_samples is not None and max_samples >= 0:
        dataset = dataset[:max_samples]
        print(f"Loaded {total_available} examples, evaluating first {len(dataset)} (--limit {max_samples})")
    else:
        print(f"Loaded {total_available} examples")

    results: List[Dict[str, Any]] = []
    predictions: List[float] = []
    ground_truths: List[float] = []

    start_time = time.time()
    for i, example in enumerate(dataset):
        gt = extract_ground_truth_labels(example.get("annotations", []))
        if gt["relevant_facts"] == 0:
            if verbose:
                print(f"  [{i+1}] Skip (no ground truth): {example.get('topic', '?')}")
            continue

        topic = example.get("topic", "unknown")
        output_text = example.get("output", "").strip()
        if not output_text:
            if verbose:
                print(f"  [{i+1}] Skip (empty output): {topic}")
            continue

        words = output_text.split()
        max_words = int(os.environ.get("FACTSCORE_MAX_WORDS", "1000"))
        if len(words) > max_words:
            output_text = " ".join(words[:max_words])

        try:
            # Canonical scorer: score(text, topics)
            result = scorer.score(output_text, [topic])
            pred_score = float(result.get("score", 0.5))
            pred_score = max(0.0, min(1.0, pred_score))
            num_facts = result.get("num_facts", 0)
            supported = result.get("supported_facts", 0)
        except Exception as e:
            print(f"  [{i+1}] Error for topic '{topic[:50]}...': {e}")
            pred_score = 0.5
            num_facts = 0
            supported = 0

        gt_accuracy = gt["ground_truth_accuracy"]
        results.append({
            "source_file": example.get("source_file", ""),
            "line_number": example.get("line_number", 0),
            "topic": topic,
            "ground_truth_accuracy": gt_accuracy,
            "predicted_score": pred_score,
            "error_magnitude": abs(pred_score - gt_accuracy),
            "num_facts": num_facts,
            "supported_facts": supported,
        })
        predictions.append(pred_score)
        ground_truths.append(gt_accuracy)

        elapsed = time.time() - start_time
        if verbose or (i + 1) % 10 == 0:
            print(f"  [{i+1}/{len(dataset)}] {topic[:40]}... gt={gt_accuracy:.3f} pred={pred_score:.3f} facts={num_facts} ({elapsed:.0f}s)")

    total_time = time.time() - start_time
    n_eval = len(predictions)

    thresholds = [0.5, 0.6, 0.7, 0.8, 0.9]
    metrics_by_threshold: Dict[str, Dict[str, Any]] = {}
    for th in thresholds:
        metrics_by_threshold[f"threshold_{th}"] = calculate_metrics(predictions, ground_truths, th)

    best_key = max(metrics_by_threshold.items(), key=lambda x: x[1]["f1_score"])[0]
    best_metrics = metrics_by_threshold[best_key]

    return {
        "pipeline": "atomic_fact_scorer",
        "source": "api.evaluators.lib.fact_score",
        "model": model,
        "mode": mode,
        "total_examples": total_available,
        "evaluated_count": n_eval,
        "total_time_seconds": total_time,
        "time_per_example_seconds": total_time / n_eval if n_eval else 0,
        "metrics_by_threshold": metrics_by_threshold,
        "best_threshold": best_key,
        "best_metrics": best_metrics,
        "per_example_results": results,
    }


def print_results(outcome: Dict[str, Any]) -> None:
    """Print evaluation results."""
    print("\n" + "=" * 60)
    print(f"RESULTS (FActScore pipeline - api.evaluators.lib.fact_score)")
    print("=" * 60)
    print(f"Model: {outcome['model']}")
    print(f"Evaluated: {outcome['evaluated_count']} / {outcome['total_examples']} examples")
    print(f"Time: {outcome['total_time_seconds']/60:.1f} min total, {outcome['time_per_example_seconds']:.2f} s/example")
    print()
    for th_name, m in outcome["metrics_by_threshold"].items():
        th = m["threshold"]
        print(f"Threshold = {th:.1f}: Accuracy={m['accuracy']:.4f} Precision={m['precision']:.4f} Recall={m['recall']:.4f} F1={m['f1_score']:.4f}")
    print()
    b = outcome["best_metrics"]
    t = outcome["best_threshold"]
    print(f"Best threshold: {t}")
    print(f"  Accuracy:  {b['accuracy']:.4f}")
    print(f"  Precision: {b['precision']:.4f}")
    print(f"  Recall:    {b['recall']:.4f}")
    print(f"  F1 Score:  {b['f1_score']:.4f}")
    print(f"  TP={b['true_positives']} TN={b['true_negatives']} FP={b['false_positives']} FN={b['false_negatives']}")
    if SCIPY_AVAILABLE and "mae" in b:
        print(f"  MAE:       {b['mae']:.4f}")
        print(f"  RMSE:      {b['rmse']:.4f}")
        print(f"  Pearson:   {b['pearson_correlation']:.4f}")
        print(f"  Spearman:  {b['spearman_correlation']:.4f}")


def main() -> None:
    # Load .env from api/ if present
    try:
        from dotenv import load_dotenv
        env_path = _LLM_TOOL_ROOT / "api" / ".env"
        if env_path.exists():
            load_dotenv(env_path)
    except ImportError:
        pass

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable not set.", file=sys.stderr)
        print("Set it with: export OPENAI_API_KEY='your-key'", file=sys.stderr)
        sys.exit(1)

    data_dir = get_data_dir()
    if not os.path.isdir(data_dir) or not os.path.isdir(os.path.join(data_dir, "labeled")):
        print(f"ERROR: Dataset directory not found: {data_dir}", file=sys.stderr)
        print("Expected structure: <data_dir>/labeled/*.jsonl", file=sys.stderr)
        print("You can set FACTSCORE_DATA_DIR to point to the factual_dat directory.", file=sys.stderr)
        sys.exit(1)

    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    max_samples: Optional[int] = None
    for i, arg in enumerate(sys.argv):
        if arg == "--limit" and i + 1 < len(sys.argv):
            try:
                max_samples = int(sys.argv[i + 1])
            except ValueError:
                print("ERROR: --limit requires an integer (e.g. --limit 10)", file=sys.stderr)
                sys.exit(1)

    model = os.environ.get("FACTSCORE_MODEL", "gpt-4o-mini")
    for i, arg in enumerate(sys.argv):
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    mode = "default"
    for i, arg in enumerate(sys.argv):
        if arg == "--mode" and i + 1 < len(sys.argv):
            mode = sys.argv[i + 1].lower()
            if mode == "all":
                print("Note: --mode all is deprecated; using canonical pipeline once.", file=sys.stderr)
                mode = "default"
            break

    if max_samples is not None:
        print(f"Running on first {max_samples} samples (--limit {max_samples})...")
    print(f"Using model: {model}")
    print("=" * 60)

    outcome = run_factscore_pipeline(
        data_dir=data_dir,
        openai_key=api_key,
        model=model,
        mode=mode,
        verbose=verbose,
        max_samples=max_samples,
    )
    print_results(outcome)
    out_path = _SCRIPT_DIR / f"factscore_pipeline_results_{mode}.json"
    print(f"\nSaving results to {out_path}...")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(outcome, f, indent=2, ensure_ascii=False)
    print("Done.")


if __name__ == "__main__":
    main()

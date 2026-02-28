"""
Run MedScore Table 4 reproduction (arXiv 2505.18452).

Uses MedScore from api/evaluators/lib/MedScore. Run from project root with:
  cd LLM_Model_Therapist_Tool && PYTHONPATH=api python models/medscore/evaluation/run_table4_reproduction.py

Or from api/:
  cd api && python -c "import sys; sys.path.insert(0, '..'); exec(open('../models/medscore/evaluation/run_table4_reproduction.py').read())"
  # Simpler: cd api && PYTHONPATH=. python ../models/medscore/evaluation/run_table4_reproduction.py
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

_SCRIPT_DIR = Path(__file__).resolve().parent  # models/medscore/evaluation
_LLM_TOOL_ROOT = _SCRIPT_DIR.parent.parent.parent  # LLM_Model_Therapist_Tool
_API_DIR = _LLM_TOOL_ROOT / "api"
if _API_DIR.is_dir() and str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

# Load .env from api/
_env_file = _API_DIR / ".env"
if _env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_file)
    except ImportError:
        pass

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

from evaluators.lib.MedScore.medscore.medscore import MedScore
from evaluators.lib.MedScore.medscore.config_schema import (
    MedScoreConfig,
    MedScoreDecomposerConfig,
    FactScoreDecomposerConfig,
    InternalVerifierConfig,
    ProvidedEvidenceVerifierConfig,
    MedRAGVerifierConfig,
)
from providers.registry import ProviderRegistry

from load_askdocs import load_askdocs, to_medscore_dataset, ensure_askdocs, DEFAULT_DATA_DIR
from build_doctor_evidence import build_doctor_evidence
from apply_scoring_protocol import verifications_to_by_id, compute_factuality

try:
    from run_puma import get_puma_path, load_puma, to_medscore_dataset as puma_to_dataset
    HAS_PUMA = True
except Exception:
    HAS_PUMA = False

RESULTS_DIR = _SCRIPT_DIR / "results"


class DelayProvider:
    """Wraps provider to add delay between API calls (avoids rate limits)."""

    def __init__(self, provider: Any, delay_seconds: float):
        self._provider = provider
        self._delay = delay_seconds

    def chat_completion(self, **kwargs) -> str:
        if self._delay > 0:
            time.sleep(self._delay)
        return self._provider.chat_completion(**kwargs)


def build_config(
    decomposition: str,
    verification: str,
    model: str = "gpt-4o",
    corpus_dir: Optional[str] = None,
    doctor_evidence_path: Optional[Path] = None,
    batch_size: int = 1,
) -> MedScoreConfig:
    """Build MedScoreConfig for given decomposition and verification."""
    if decomposition == "medscore":
        decomposer = MedScoreDecomposerConfig(
            type="medscore",
            model_name=model,
            server_path="https://api.openai.com/v1",
            batch_size=batch_size,
        )
    elif decomposition == "factscore":
        decomposer = FactScoreDecomposerConfig(
            type="factscore",
            model_name=model,
            server_path="https://api.openai.com/v1",
            batch_size=batch_size,
        )
    else:
        raise ValueError(f"Unknown decomposition: {decomposition}")

    if verification == "internal":
        verifier = InternalVerifierConfig(
            type="internal",
            model_name=model,
            server_path="https://api.openai.com/v1",
            batch_size=batch_size,
        )
    elif verification == "provided":
        if not doctor_evidence_path or not doctor_evidence_path.exists():
            raise FileNotFoundError(
                "Doctor evidence file required for 'provided'. Run build_doctor_evidence.py first."
            )
        verifier = ProvidedEvidenceVerifierConfig(
            type="provided",
            model_name=model,
            server_path="https://api.openai.com/v1",
            provided_evidence_path=str(doctor_evidence_path),
            batch_size=batch_size,
        )
    elif verification == "medrag":
        db_dir = corpus_dir or os.environ.get("MEDRAG_CORPUS", str(_LLM_TOOL_ROOT / "corpus"))
        verifier = MedRAGVerifierConfig(
            type="medrag",
            model_name=model,
            server_path="https://api.openai.com/v1",
            retriever_name="MedCPT",
            corpus_name="Textbooks",
            db_dir=db_dir,
            n_returned_docs=5,
            batch_size=batch_size,
        )
    else:
        raise ValueError(f"Unknown verification: {verification}")

    return MedScoreConfig(
        decomposer=decomposer,
        verifier=verifier,
        input_file=".",
        output_dir=".",
        response_key="response",
    )


def run_combo(
    dataset: List[Dict[str, Any]],
    decomposition: str,
    verification: str,
    api_key: str,
    model: str = "gpt-4o",
    corpus_dir: Optional[str] = None,
    doctor_evidence_path: Optional[Path] = None,
    batch_size: int = 1,
    delay_seconds: float = 0,
    decompositions: Optional[List[Dict[str, Any]]] = None,
) -> float:
    """Run one (decomposition, verification) combo, return factuality %."""
    config = build_config(
        decomposition=decomposition,
        verification=verification,
        model=model,
        corpus_dir=corpus_dir,
        doctor_evidence_path=doctor_evidence_path,
        batch_size=batch_size,
    )
    provider = ProviderRegistry.get_provider("openai", api_key)
    if delay_seconds > 0:
        provider = DelayProvider(provider, delay_seconds)
    scorer = MedScore(config, provider=provider)
    if decompositions is None:
        decompositions = scorer.decompose(dataset)
    verifications = scorer.verify(decompositions)
    by_id = verifications_to_by_id(verifications)
    return compute_factuality(by_id)


def run_decompose_only(
    dataset: List[Dict[str, Any]],
    decomposition: str,
    api_key: str,
    model: str = "gpt-4o",
    batch_size: int = 1,
    delay_seconds: float = 0,
) -> List[Dict[str, Any]]:
    """Run only decomposition, return decompositions."""
    config = build_config(
        decomposition=decomposition,
        verification="internal",
        model=model,
        batch_size=batch_size,
    )
    provider = ProviderRegistry.get_provider("openai", api_key)
    if delay_seconds > 0:
        provider = DelayProvider(provider, delay_seconds)
    scorer = MedScore(config, provider=provider)
    return scorer.decompose(dataset)


def main():
    parser = argparse.ArgumentParser(description="MedScore Table 4 reproduction")
    parser.add_argument("--api-key", default=os.environ.get("OPENAI_API_KEY"))
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--delay", type=float, default=0)
    parser.add_argument("--skip-puma", action="store_true")
    parser.add_argument("--combo", type=str, help="e.g. medscore,internal")
    parser.add_argument("--model", default="gpt-4o")
    parser.add_argument("--corpus-dir", default=os.environ.get("MEDRAG_CORPUS"))
    parser.add_argument("--save-decomposition", type=str)
    parser.add_argument("--load-decomposition", type=str)
    args = parser.parse_args()

    if not args.api_key:
        print("Error: OPENAI_API_KEY or --api-key required", file=sys.stderr)
        sys.exit(1)

    ensure_askdocs()
    rows = load_askdocs(limit=args.limit)
    dataset = to_medscore_dataset(rows)
    print(f"AskDocsAI: {len(dataset)} samples")

    doctor_evidence_path = DEFAULT_DATA_DIR / "AskDocs_doctor_evidence.json"
    if not doctor_evidence_path.exists():
        build_doctor_evidence(output_path=doctor_evidence_path)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    decompositions = ["medscore", "factscore"]
    verifications = ["internal", "provided", "medrag"]
    if args.combo:
        parts = args.combo.split(",")
        if len(parts) != 2:
            print("--combo must be 'decomposition,verification'", file=sys.stderr)
            sys.exit(1)
        decompositions = [parts[0]]
        verifications = [parts[1]]

    results: Dict[str, Any] = {
        "askdocs": {},
        "puma": {},
        "paper_table4_reference": {
            "AskDocsAI_MedScore_internal": 76.54,
            "AskDocsAI_MedScore_provided": 94.68,
            "AskDocsAI_MedScore_medrag": 70.07,
        },
    }

    decomp_cache: Dict[str, List[Dict[str, Any]]] = {}
    if args.load_decomposition:
        load_path = Path(args.load_decomposition)
        if not load_path.exists():
            print(f"Error: --load-decomposition not found: {load_path}", file=sys.stderr)
            sys.exit(1)
        with open(load_path) as f:
            data = json.load(f)
        decomp_type = data.get("decomposition", "medscore")
        decomp_cache[decomp_type] = data["decompositions"]
        print(f"Loaded {len(decomp_cache[decomp_type])} decompositions from {load_path}")

    for decomp in decompositions:
        if decomp not in decomp_cache:
            print(f"\nDecomposing with {decomp}...")
            decomp_list = run_decompose_only(
                dataset=dataset,
                decomposition=decomp,
                api_key=args.api_key,
                model=args.model,
                batch_size=args.batch_size,
                delay_seconds=args.delay,
            )
            decomp_cache[decomp] = decomp_list
            if args.save_decomposition:
                base = Path(args.save_decomposition)
                if base.suffix != ".json":
                    base = base / f"{decomp}_decompositions.json"
                base.parent.mkdir(parents=True, exist_ok=True)
                with open(base, "w") as f:
                    json.dump({"decomposition": decomp, "decompositions": decomp_list}, f, indent=2)
                print(f"Saved to {base}")

        for verif in verifications:
            key = f"{decomp}_{verif}"
            print(f"\nRunning {key}...")
            try:
                score = run_combo(
                    dataset=dataset,
                    decomposition=decomp,
                    verification=verif,
                    api_key=args.api_key,
                    model=args.model,
                    corpus_dir=args.corpus_dir,
                    doctor_evidence_path=doctor_evidence_path,
                    batch_size=args.batch_size,
                    delay_seconds=args.delay,
                    decompositions=decomp_cache[decomp],
                )
                results["askdocs"][key] = round(score, 2)
                print(f"  AskDocsAI {key}: {score:.2f}%")
            except Exception as e:
                print(f"  Error: {e}")
                results["askdocs"][key] = {"error": str(e)}

    if not args.skip_puma and HAS_PUMA and get_puma_path():
        puma_rows = load_puma(limit=100)
        puma_dataset = puma_to_dataset(puma_rows)
        print(f"\nPUMA: {len(puma_dataset)} samples")
        for decomp in decompositions:
            for verif in verifications:
                if verif == "provided":
                    continue
                key = f"{decomp}_{verif}"
                try:
                    score = run_combo(
                        dataset=puma_dataset,
                        decomposition=decomp,
                        verification=verif,
                        api_key=args.api_key,
                        model=args.model,
                        corpus_dir=args.corpus_dir,
                        doctor_evidence_path=None,
                        batch_size=args.batch_size,
                        delay_seconds=args.delay,
                    )
                    results["puma"][key] = round(score, 2)
                    print(f"  PUMA {key}: {score:.2f}%")
                except Exception as e:
                    results["puma"][key] = {"error": str(e)}

    json_path = RESULTS_DIR / "table4_results.json"
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nWrote {json_path}")

    md_path = RESULTS_DIR / "table4_results.md"
    with open(md_path, "w") as f:
        f.write("# MedScore Table 4 Reproduction Results\n\n## AskDocsAI\n\n")
        f.write("| Decomposition | Internal (GPT-4o) | Doctor | MedRAG |\n|---------------|-------------------|--------|--------|\n")
        for decomp in decompositions:
            row = [decomp]
            for verif in verifications:
                v = results["askdocs"].get(f"{decomp}_{verif}")
                row.append(str(v) if isinstance(v, (int, float)) else (str(v.get("error", v)) if isinstance(v, dict) else "-"))
            f.write("| " + " | ".join(row) + " |\n")
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()

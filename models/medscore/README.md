# MedScore: Medical Factuality Evaluation

> **MedScore** (arXiv 2505.18452) evaluates factuality of free-form medical answers via domain-adapted claim decomposition and verification.

All MedScore scripts and evaluation live here. Core implementation: `api/evaluators/lib/MedScore/`.

## Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| **MedScore** | `api/evaluators/lib/MedScore/` | Decompose + verify pipeline |
| **Table 4 evaluation** | `models/medscore/evaluation/` | AskDocsAI reproduction |
| **run_medscore.py** | `models/medscore/` | CLI: single conversation or file |
| **build_medrag_embeddings.py** | `models/medscore/` | One-time embedding build for medrag |

## Quick Start

```bash
cd LLM_Model_Therapist_Tool
export PYTHONPATH="${PWD}/api:${PYTHONPATH}"
source api/.venv/bin/activate

# Table 4 reproduction (quick test)
python models/medscore/evaluation/run_table4_reproduction.py --limit 5 --combo medscore,internal

# Single conversation
python models/medscore/run_medscore.py --text "CBT is evidence-based for anxiety." --api-key sk-...
```

## Run MedScore (single session)

```bash
# Default test conversation
python models/medscore/run_medscore.py --api-key YOUR_KEY

# Single therapist response
python models/medscore/run_medscore.py --text "Your medical response here" --api-key YOUR_KEY

# From ChatGPT.jsonl
python models/medscore/run_medscore.py --input path/to/ChatGPT.jsonl --limit 5 --api-key YOUR_KEY

# Via API (server on port 8000)
python models/medscore/run_medscore.py --api --api-key YOUR_KEY --hf-key YOUR_HF_KEY
```

## MedRAG embeddings (for medrag verification)

```bash
export MEDRAG_CORPUS="/path/to/LLM_Model_Therapist_Tool/corpus"
python models/medscore/build_medrag_embeddings.py
# Takes ~45–60 min for ~125k chunks
```

## API / website

The website and extension call `POST /predefined_metrics/evaluate` with `metrics: ["medscore"]`. For MedScore to work:

1. Set `MEDRAG_CORPUS` when starting the API server
2. Run `build_medrag_embeddings.py` once (for medrag verification)

## Data & results

- **AskDocsAI**: 300 samples, auto-downloaded to `evaluation/data/`
- **PUMA**: Optional; request from dataset organizers
- **Results**: `evaluation/results/table4_results.json`

Our reproduction: **82.88%** (MedScore + internal, 300 samples) vs paper 76.54%.

## Pipeline

1. **Decompose** – Extract atomic medical facts (MedScore or FActScore prompt)
2. **Verify** – internal (model knowledge), provided (doctor response), or medrag (retrieved docs)
3. **Aggregate** – Exclude 0-claim responses; factuality = mean(response_scores) × 100

## Citation

```bibtex
@article{medscore2025,
  title={MedScore: Generalizable Factuality Evaluation of Free-Form Medical Answers},
  author={Huang, Heyuan and DeLucia, Alexandra and Tiyyala, Vijay Murari and Dredze, Mark},
  journal={arXiv preprint arXiv:2505.18452},
  year={2025}
}
```

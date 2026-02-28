# MedScore Table 4 Evaluation

Reproduces MedScore (arXiv 2505.18452) Table 4 on AskDocsAI using the canonical MedScore implementation in `api/evaluators/lib/MedScore`.

## Pipeline

```
AskDocsAI (300 samples)
        |
        v
  1. Decompose
     - MedScore or FActScore prompt
     - LLM extracts atomic facts per sentence
        |
        v
  2. Verify
     - internal: model's knowledge (GPT-4o)
     - provided: doctor response (AskDocs only)
     - medrag: retrieved medical passages (Textbooks)
        |
        v
  3. Aggregate
     - Exclude 0-claim responses
     - factuality = 100 * mean(response_scores)
```

## Data

| Dataset | Samples | Source |
|---------|---------|--------|
| **AskDocsAI** | 300 | Auto-downloaded from [MedScore repo](https://github.com/Heyuan9/MedScore) on first run |
| **PUMA** | Optional | Request from m.schuiveling@umcutrecht.nl; place at `data/puma.jsonl` |

Data is stored in `evaluation/data/`. AskDocs format: `{"id", "question", "doctor_response", "response"}` per line.

## Results

| Combo | Our Result | Paper (Table 4) |
|-------|------------|-----------------|
| medscore + internal | **82.88%** | 76.54% |
| medscore + provided | - | 94.68% |
| medscore + medrag | - | 70.07% |

Results are written to `evaluation/results/table4_results.json` and `table4_results.md`.

## Run

From **LLM_Model_Therapist_Tool** (project root):

```bash
# Ensure api is on PYTHONPATH
cd LLM_Model_Therapist_Tool
export PYTHONPATH="${PWD}/api:${PYTHONPATH}"

# Activate api venv (has MedScore deps)
source api/.venv/bin/activate

# Full run (300 samples, internal only, ~9 hours with --delay 8)
python models/medscore/evaluation/run_table4_reproduction.py --combo medscore,internal --delay 8

# Quick test (5 samples)
python models/medscore/evaluation/run_table4_reproduction.py --limit 5 --combo medscore,internal
```

### Options

| Flag | Description |
|------|-------------|
| `--limit N` | Limit samples (e.g. 5, 50) |
| `--combo decomp,verif` | Single combo (e.g. `medscore,internal`) |
| `--delay SEC` | Seconds between API calls (e.g. 8 to avoid rate limits) |
| `--model MODEL` | LLM (default: gpt-4o) |
| `--save-decomposition PATH` | Save decomposition for reuse |
| `--load-decomposition PATH` | Load decomposition (verify only, ~half cost) |

### Save decomposition (run provided/medrag cheaper)

```bash
# 1. Run internal, save (~$15)
python models/medscore/evaluation/run_table4_reproduction.py --combo medscore,internal --delay 8 --save-decomposition results/

# 2. Run provided, reuse (~$7)
python models/medscore/evaluation/run_table4_reproduction.py --combo medscore,provided --delay 8 --load-decomposition results/medscore_decompositions.json

# 3. Run medrag, reuse (~$7)
python models/medscore/evaluation/run_table4_reproduction.py --combo medscore,medrag --delay 8 --load-decomposition results/medscore_decompositions.json
```

### MedRAG verification

Requires corpus and embeddings:

```bash
export MEDRAG_CORPUS="/path/to/LLM_Model_Therapist_Tool/corpus"
PYTHONPATH=api python models/medscore/build_medrag_embeddings.py
```

## Project Structure

```
models/medscore/
├── README.md
└── evaluation/
    ├── README.md              # This file
    ├── run_table4_reproduction.py
    ├── load_askdocs.py
    ├── build_doctor_evidence.py
    ├── apply_scoring_protocol.py
    ├── run_puma.py
    ├── data/
    │   ├── AskDocs.jsonl      # Auto-downloaded
    │   ├── AskDocs_doctor_evidence.json  # Built by build_doctor_evidence.py
    │   └── PUMA_README.md
    └── results/
        ├── table4_results.json
        └── table4_results.md
```

**Canonical implementation**: `api/evaluators/lib/MedScore/`

# FActScore: Factual Precision Evaluation

> **FActScore** (Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation) measures the fraction of atomic facts in a generated text that are supported by a reliable knowledge source.

This is our implementation of FActScore, aligned with the original paper (Min et al., EMNLP 2023). It is used within the LLM Therapist Tool evaluator system and as a standalone evaluation pipeline.

**Paper**: [FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation](https://arxiv.org/abs/2305.14251)  
**Original Code**: [shmsw25/FActScore](https://github.com/shmsw25/FActScore)

---

## Table of Contents

- [Pipeline Overview](#pipeline-overview)
- [Alignment with Original Paper](#alignment-with-original-paper)
- [Detailed Pipeline](#detailed-pipeline)
- [Knowledge Source](#knowledge-source)
- [Quick Start](#quick-start)
- [Evaluation Results](#evaluation-results)
- [Project Structure](#project-structure)
- [Key Differences from Original](#key-differences-from-original)
- [Configuration](#configuration)
- [Citation](#citation)

---

## Pipeline Overview

The pipeline follows the original FActScore methodology:

```
Input: generated text + topic
                |
                v
   1. Atomic Fact Generation (AFG)
      - Sentence tokenization (NLTK)
      - BM25 demo selection from demons.json (7 fixed + 1 BM25-matched)
      - LLM decomposes each sentence into atomic facts
                |
                v
   2. Passage Retrieval (per fact)
      - BM25 over pre-chunked Wikipedia passages
      - Query = topic + atomic_fact, top-k = 5
                |
                v
   3. Fact Verification (per fact)
      - Prompt: "Answer the question about {topic}..."
      - "Input: {fact} True or False?"
      - Parse True/False from LLM output
                |
                v
   4. Score Calculation
      - FActScore = supported_facts / total_facts
      - Length penalty: gamma=10 (penalizes < 10 facts)
      - Output: continuous score [0.0, 1.0]
```

---

## Alignment with Original Paper

### Components Matched

| Component | Original Paper | Our Implementation | Match |
|-----------|---------------|-------------------|-------|
| Knowledge source | `enwiki-20230401.db` (SQLite, 6.19M articles, April 2023 Wikipedia) | Same DB file (`enwiki-20230401.db`, 20GB) | Exact |
| Passage storage | Pre-chunked RoBERTa 256-token passages, joined by `SPECIAL_SEPARATOR` | Read directly from same DB, split on same separator | Exact |
| Passage chunking | RoBERTa-large tokenizer, 256 tokens per passage | Same (used only as fallback when topic not in DB) | Exact |
| BM25 retrieval | `rank_bm25.BM25Okapi`, query = `topic + " " + fact`, k=5 | Same library, same query format, same k | Exact |
| BM25 tokenization | `.split()` on decoded text, strip `<s>` `</s>` | Same | Exact |
| Retrieval cache key | `topic + "#" + retrieval_query` | Same format | Exact |
| AFG demos | 7 fixed + 1 BM25-matched from `demons.json` | Same (loaded from same file) | Exact |
| AFG prompt | `"Please breakdown the following sentence into independent facts: {sent}"` | Same | Exact |
| Verification prompt | `"Answer the question about {topic} based on the given context.\n\n{context}\n\nInput: {atom} True or False?\nOutput:"` | Same, including period after definition if not ending with punctuation | Exact |
| True/False parsing | String heuristic: both present -> last mention wins (`index("true") > index("false")`); neither -> keyword fallback (`not`, `cannot`, `unknown`, `information`) | Same heuristic, same operator, same keywords | Exact |
| Length penalty | `gamma=10`, `penalty = exp(1 - gamma/n_facts)` if `n_facts < gamma`, else 1.0 | Same formula | Exact |
| Caching | JSON for retrieval, pickle for BM25 objects, per-LLM-call cache | Same design | Exact |
| NPM gating | Optional `facebook/npm-single`, threshold=0.3 | Stub (disabled) -- matches ChatGPT-only column | N/A (see below) |
| AFG model | `text-davinci-003` (InstructGPT, completion API) | User-defined model | Configurable |
| Verification model | `gpt-3.5-turbo` (ChatGPT) | User-defined model | Configurable |

### What NPM=disabled Means

The original paper reports two configurations:
- **retrieval+ChatGPT**: LLM-only verification (no NPM filter)
- **retrieval+LLAMA+NP**: LLAMA verification + NPM masked-LM filter

Our implementation matches the **retrieval+ChatGPT** column. NPM is a stub that returns 0.5 (neutral), so it never filters. This is the paper's primary configuration.

---

## Detailed Pipeline

### Step 1: Atomic Fact Generation (AFG)

**Input**: A generated text (e.g., a biography).

1. **Sentence tokenization**: NLTK `sent_tokenize` (falls back to regex split on `.!?` if NLTK unavailable).
2. **Demo selection**: For each sentence:
   - 7 fixed demonstrations from the beginning of `demons.json`
   - 1 BM25-matched demonstration (query = the sentence, corpus = all demo sentences)
3. **LLM call**: The prompt includes all demos followed by `"Please breakdown the following sentence into independent facts: {sentence}"`.
4. **Parsing**: Each line of the LLM output is stripped of numbering/bullets. Lines > 3 chars are kept as atomic facts.
5. **Deduplication**: Duplicate facts are removed. Capped at 50 facts per text.

### Step 2: Passage Retrieval (Per Fact)

**For each atomic fact**:

1. **Get passages for topic**: Look up the topic title in `enwiki-20230401.db` (exact match). The DB stores pre-chunked passages joined by `####SPECIAL####SEPARATOR####`. If the topic is not in the DB, fall back to live Wikipedia API + RoBERTa chunking.
2. **BM25 retrieval**: Build a BM25 index over all passages for the topic (cached per topic). Query = `topic + " " + fact`. Return top-5 passages.
3. **Caching**: Retrieval results are cached to disk (JSON) with key = `topic + "#" + query`.

### Step 3: Per-Fact Verification

**For each atomic fact + its top-5 retrieved passages**:

1. **Build prompt**:
   ```
   Answer the question about {topic} based on the given context.

   Title: {title}
   Text: {passage_text}
   ... (for each of the 5 passages, in reverse order)

   Input: {atomic_fact} True or False?
   Output:
   ```
   A period is appended after the context block if it doesn't end with punctuation (matching original).

2. **LLM call**: Temperature=0.0, max_tokens=50.

3. **Parse output** (exact original heuristic):
   - If only "true" appears: **Supported**
   - If only "false" appears: **Not Supported**
   - If both appear: last mention wins (`index("true") > index("false")`)
   - If neither appears: check for negative keywords (`not`, `cannot`, `unknown`, `information`). If none found, assume **Supported**.

### Step 4: Score Calculation

```
raw_score = supported_facts / total_facts

if total_facts < gamma (10):
    penalty = exp(1 - gamma / total_facts)
else:
    penalty = 1.0

FActScore = penalty * raw_score
```

The length penalty discourages very short generations (fewer than ~2 sentences). Responses with 10+ atomic facts are not penalized.

---

## Knowledge Source

### Primary: enwiki-20230401.db (DocDB)

- **File**: `.cache/factscore/enwiki-20230401.db` (SQLite, ~20GB)
- **Content**: 6,187,531 English Wikipedia articles from April 1, 2023
- **Format**: Each row is `(title, text)` where `text` contains pre-chunked RoBERTa 256-token passages joined by `####SPECIAL####SEPARATOR####`
- **Lookup**: Exact title match (`SELECT text FROM documents WHERE title = ?`)
- **Source**: Official FActScore release ([Google Drive](https://drive.google.com/drive/folders/1kFey69z8hGXScln01mVxrOhrqgM62X7I))

This is the **same database** used in the original FActScore paper and code.

### Fallback: Live Wikipedia API

If a topic is not found in the DB (exact title mismatch), the system falls back to:
1. Wikipedia search API to find the closest article
2. Fetch full article text
3. Chunk into 256-token passages using RoBERTa-large tokenizer

This fallback uses current Wikipedia (not the April 2023 snapshot), which is a minor difference noted below.

---

## Quick Start

### Prerequisites

```bash
pip install rank-bm25 nltk numpy transformers requests
```

### Download Knowledge Source

Download `enwiki-20230401.db` from [Google Drive](https://drive.google.com/drive/folders/1kFey69z8hGXScln01mVxrOhrqgM62X7I) and place it in `.cache/factscore/`:

```bash
mkdir -p .cache/factscore
# Download enwiki-20230401.db (~20GB) and move it here
mv ~/Downloads/enwiki-20230401.db .cache/factscore/
```

### Run Quick Test (10 samples)

```bash
export OPENAI_API_KEY="your-key"
python3 evaluation/evaluate_factscore_pipeline.py --limit 10
```

Expected output:
```
Initializing FactScorer with model=gpt-4o-mini...
Loading dataset...
Total examples: 549
Loaded 549 examples, evaluating first 10 (--limit 10)
...
```

### Run Full Test (labeled set, 549 examples)

To reproduce the full evaluation:

```bash
export OPENAI_API_KEY="your-key"
python3 evaluation/evaluate_factscore_pipeline.py
```

Results are written to `evaluation/factscore_pipeline_results_default.json` (overall metrics, threshold metrics, per-example results).

### Integration via Evaluator System

```python
from evaluators.impl.fact_evaluator import FactEvaluator

evaluator = FactEvaluator(model_config={
    "provider": "openai",
    "model": "your-model-here",
    "api_key": "your-key"
})

result = evaluator.execute(conversation)
```

---

## Evaluation Results

### Datasets: Labeled vs Unlabeled

The FActScore release includes two evaluation sets with **no entity overlap**:

| Set | Entities | Purpose in paper |
|-----|----------|------------------|
| **Labeled** | 183 people | Section 3: human-annotated atomic facts (S/NS/IR) to validate FActScore against human judgments |
| **Unlabeled** | 500 different people | Section 4.3: no human labels; used to compare 12 LMs (Table 5) |

The paper’s headline FActScores (e.g. 71.6% ChatGPT, 52.8% InstructGPT) are from the **unlabeled** 500-entity set. We evaluate on the **labeled** 183-entity set so we can compare our predicted FActScore to **human ground truth**. Different entity sets mean the absolute numbers are not directly comparable, but our correlation and error metrics validate that the implementation behaves correctly.

### Full Test (493 examples, labeled set)

We ran our pipeline on all labeled examples with human annotations (549 total; 493 after excluding abstained). Results:

| Metric | Value |
|--------|-------|
| Knowledge source | enwiki-20230401.db (DocDB) |
| Verification model | gpt-4o-mini (for this test) |
| Examples evaluated | 493 |
| Respond ratio | 89.8% (493 / 549) |
| Avg Human FActScore | 0.6374 |
| Avg Predicted FActScore | 0.6477 |
| MAE | 0.1146 |
| RMSE | 0.1523 |
| Pearson r | 0.8599 (p &lt; 10⁻¹⁴⁵) |
| Spearman r | 0.7730 (p &lt; 10⁻⁹⁹) |
| Avg atomic facts per response | 31.7 |
| Total atomic facts generated | 15,642 |
| Support rate | 66.8% (10,453 / 15,642) |
| Avg time per example | ~167 s |

### Per-Model Results (labeled set)

| Model | N | Human FActScore | Predicted FActScore | MAE | RMSE | Pearson r | Spearman r | Avg facts/response |
|-------|---|-----------------|---------------------|-----|------|-----------|------------|---------------------|
| ChatGPT | 157 | 0.6233 | 0.6829 | 0.1107 | 0.1418 | 0.8667 | 0.8175 | 33.0 |
| InstructGPT | 180 | 0.4739 | 0.5209 | 0.1033 | 0.1293 | 0.9143 | 0.9014 | 25.1 |
| PerplexityAI | 156 | 0.8402 | 0.7587 | 0.1316 | 0.1837 | 0.6459 | 0.4114 | 38.1 |

### Comparison with Paper (reference only)

The paper reports FActScore on the **unlabeled** 500-entity set; we report on the **labeled** 183-entity set. Entity sets differ, so these are reference comparisons, not like-for-like.

| Model | Paper (unlabeled, 500 entities) | Ours (labeled, 183 entities) |
|-------|----------------------------------|------------------------------|
| ChatGPT | 71.6% | 68.3% |
| InstructGPT | 52.8% | 52.1% |
| PerplexityAI | N/A | 75.9% |

Our numbers are close despite different entities and verification model (gpt-4o-mini vs gpt-3.5-turbo). The primary validation is **correlation with human judgments**: Pearson r = 0.86 overall, 0.91 for InstructGPT.

### Quick Test (10 samples)

| Metric | Value |
|--------|-------|
| Knowledge source | DocDB (enwiki-20230401.db) |
| Verification model | gpt-4o-mini (for this test) |
| Average Human FActScore | 0.3435 |
| Average Predicted FActScore | 0.4144 |
| MAE | 0.1188 |
| RMSE | 0.1665 |
| Pearson correlation | 0.7514 (p=0.012) |
| Spearman correlation | 0.7842 (p=0.007) |
| Time per example | ~28 s |

---

## Project Structure

```
models/factscore/
├── README.md                       # This file
├── evaluation/
│   ├── evaluate_factscore_pipeline.py  # Batch evaluation script (DocDB-enabled)
│   ├── evaluate_fact_dataset_standalone.py
│   └── visualize_results.py
│
├── docs/
│   ├── FACT_EVALUATION_REPORT.md
│   └── EVALUATION_README.md
│
└── scripts/
    └── install_factscore_env.sh

# Core library (used by API evaluator):
api/evaluators/lib/fact_score/      # DocDB + BM25 + per-fact verification
api/evaluators/impl/fact_evaluator.py

# Knowledge source:
.cache/factscore/enwiki-20230401.db  # 20GB SQLite (6.19M articles)
```

---

## Key Differences from Original

| Aspect | Original Paper | Our Implementation | Impact |
|--------|---------------|-------------------|--------|
| AFG model | `text-davinci-003` (deprecated) | User-defined model | Different atomic facts based on user choice; unavoidable since davinci-003 is retired |
| Verification model | `gpt-3.5-turbo` | User-defined model | Allows flexiblity based on user needs |
| API mode | Completion API (davinci) / Chat API (ChatGPT) | Chat API only | Prompt format identical; API wrapper differs |
| NPM gating | Optional `facebook/npm-single` | Disabled (stub) | Matches the paper's ChatGPT-only column |
| DB fallback | No fallback (asserts topic exists) | Falls back to live Wikipedia API | Only triggers for topics not in the 6.19M article DB; noted in results |

All other components (knowledge source, passage format, BM25 retrieval, verification prompt, True/False parsing, length penalty, caching) are exact matches.

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | (required) |
| `FACTSCORE_DB_PATH` | Path to `enwiki-20230401.db` | Auto-resolved from `.cache/factscore/` |
| `FACTSCORE_DEMONS_PATH` | Path to `demons.json` | Auto-resolved from `info/` directory |
| `FACTSCORE_CACHE_DIR` | Directory for retrieval/BM25/LLM caches | `.cache/factscore` |

### DB Path Resolution Order

1. Explicit `db_path` parameter
2. `FACTSCORE_DB_PATH` environment variable
3. `.cache/factscore/enwiki-20230401.db` (relative to CWD)
4. `NLP_MentalHealth/.cache/factscore/enwiki-20230401.db` (relative to source file)

---

## Citation

### Original FActScore Paper

```bibtex
@inproceedings{factscore,
    title={{FActScore}: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation},
    author={Min, Sewon and Krishna, Kalpesh and Lyu, Xinxi and Lewis, Mike and Yih, Wen-tau and Koh, Pang Wei and Iyyer, Mohit and Zettlemoyer, Luke and Hajishirzi, Hannaneh},
    year={2023},
    booktitle={EMNLP},
    url={https://arxiv.org/abs/2305.14251}
}
```

---

**Document Version**: 3.1  
**Last Updated**: February 2026  
**Changelog (v3.1)**: Updated documentation to reflect the removal of `fact_test/full_test_549.py` and `fact_test/quick_test_10.py`. These tests are now integrated into `evaluation/evaluate_factscore_pipeline.py`.  
**Changelog (v3.0)**: Added full evaluation results (493 examples, labeled set): overall and per-model metrics (MAE, RMSE, Pearson, Spearman), fact statistics, respond ratio. Clarified labeled vs unlabeled datasets and comparison with paper (71.6%/52.8% from unlabeled set; our 68.3%/52.1% from labeled set). Added full-test run instructions and reference to `full_test_report.json`.  
**Changelog (v2.0)**: Rewrote to reflect FActScore-aligned pipeline with DocDB (enwiki-20230401.db), BM25 per-fact retrieval, exact True/False parsing heuristic, and verification prompt matching the original paper. Added detailed component-by-component alignment table.

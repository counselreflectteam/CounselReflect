# Installing the Atomic Fact Scorer Pipeline

The **atomic fact decomposition + verification pipeline** uses the modern OpenAI API directly. It does **not** require the deprecated `factscore` PyPI package (which has compatibility issues with current OpenAI models).

---

## Quick Start

The pipeline only requires the OpenAI Python client:

```bash
pip install "openai>=1.0.0" "numpy>=1.21.0" "scipy>=1.7.0" "python-dotenv>=1.0.0"
```

Then run:

```bash
export OPENAI_API_KEY='your-openai-key'
cd LLM_Model_Therapist_Tool/models/factscore/evaluation
python evaluate_factscore_pipeline.py --limit 10 --verbose
```

---

## How It Works

The `evaluate_factscore_pipeline.py` script implements a lightweight version of FactScore:

1. **Atomic Fact Decomposition**: Uses GPT to break generated text into atomic facts
2. **Fact Verification**: Uses GPT to verify each fact against the topic
3. **Scoring**: Calculates `score = supported_facts / total_facts`

This approach:
- Works with any OpenAI model (default: `gpt-4o-mini`)
- Has no context length issues (prompts are kept small)
- Does not require Wikipedia data downloads
- Is much faster than the original FactScore

---

## Command Line Options

```bash
# Run on first N samples (for testing)
python evaluate_factscore_pipeline.py --limit 10

# Verbose output (show progress for each example)
python evaluate_factscore_pipeline.py --verbose

# Use a different model
python evaluate_factscore_pipeline.py --model gpt-3.5-turbo

# Combine options
python evaluate_factscore_pipeline.py --limit 50 --model gpt-4o-mini --verbose
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `FACTSCORE_MODEL` | Model to use | `gpt-4o-mini` |
| `FACTSCORE_MAX_WORDS` | Max words per generation | `1000` |
| `FACTSCORE_DATA_DIR` | Path to dataset directory | auto-detected |

---

## Requirements

- Python 3.8+
- `openai>=1.0.0`
- `numpy>=1.21.0`
- `scipy>=1.7.0` (optional, for correlation metrics)
- `python-dotenv>=1.0.0` (optional, for loading .env)

---

## Using a Separate Virtual Environment (Optional)

If you want to isolate this from your main project:

```bash
cd LLM_Model_Therapist_Tool/models/factscore
python3 -m venv .venv_factscore
source .venv_factscore/bin/activate

pip install --upgrade pip
pip install "openai>=1.0.0" "numpy>=1.21.0" "scipy>=1.7.0" "python-dotenv>=1.0.0"

export OPENAI_API_KEY='your-key'
cd evaluation
python evaluate_factscore_pipeline.py --limit 10 --verbose
```

---

## About the Original FactScore Package

The original `factscore` PyPI package (v0.2.0) is **deprecated** and incompatible with current OpenAI APIs:

- Uses `text-davinci-003` which is deprecated
- Few-shot prompts exceed 4K context limit
- Requires `torch<2.0.0` which is hard to install
- Requires `openai<1.0.0` (old API)

This lightweight implementation provides the same atomic-fact scoring approach without these limitations.

---

## Comparison: Provider-Only vs Atomic Fact Scorer

| Aspect | Provider-Only (`evaluate_fact_dataset_standalone.py`) | Atomic Fact Scorer (`evaluate_factscore_pipeline.py`) |
|--------|------------------------------------------------------|------------------------------------------------------|
| **Approach** | Single LLM call for overall score | Decompose → Verify each fact |
| **Speed** | Fast (1 API call/example) | Slower (2+ API calls/example) |
| **Interpretability** | Low (just a score) | High (see each fact + verdict) |
| **Cost** | Lower | Higher |
| **Accuracy** | Good for ranking | Better for fine-grained analysis |

Both scripts use the same test dataset and metrics, so results are directly comparable.

# PAIR: Prompt-Aware margIn Ranking for Counselor Reflection Scoring in Motivational Interviewing

> **Original Paper**: [PAIR: Prompt-Aware margIn Ranking for Counselor Reflection Scoring in Motivational Interviewing](https://aclanthology.org/2022.emnlp-main.11/)

Credit to the original authors: Do June Min, Verónica Pérez-Rosas, Kenneth Resnicow, Rada Mihalcea

This repository contains the deployment files for PAIR (Prompt-Aware margIn Ranking), a RoBERTa-based cross-encoder model that scores the quality of reflections in Motivational Interviewing (MI) conversations.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start (HuggingFace Endpoint)](#quick-start-huggingface-endpoint)
- [Model Architecture](#model-architecture)
- [Results](#results)
- [Local Installation](#local-installation)
- [Dataset](#dataset)
- [Project Structure](#project-structure)
- [Citation](#citation)

---

## Overview

PAIR scores the quality of **therapist reflections** in Motivational Interviewing conversations. Given a patient utterance (prompt) and a therapist response, the model outputs a continuous quality score between 0 and 1, where higher scores indicate better reflections.

### What is PAIR?

**Task**: Reflection quality scoring for Motivational Interviewing counseling
**Input**: (Patient utterance, Therapist response) pair
**Output**: Continuous quality score [0, 1]
**Base Model**: RoBERTa-base with cross-encoder architecture + MLP head
**Training**: Margin ranking loss with quality-based pairing

### Key Features

**Production-Ready Deployment** via HuggingFace Inference Endpoint
**Cross-Encoder Architecture** for context-aware scoring
**Margin Ranking Training** with high/medium/low quality tiers
**Motivational Interviewing Domain** specialized for counseling contexts
**Continuous Scoring** [0, 1] with interpretable quality labels
**Efficient Batch Processing** for multiple pairs

### Quality Levels

The model distinguishes between different reflection qualities:

- **Complex Reflection** (>0.7) - Deep understanding, adds meaning, expands perspective
- **Simple Reflection** (0.3-0.7) - Accurate rephrasing, basic understanding
- **Non-Reflection** (<0.3) - Poor reflection, closed questions, or off-topic responses

---

## Quick Start (HuggingFace Endpoint)

**Recommended**: Use the deployed HuggingFace Inference Endpoint for production.

### Python (requests)

```python
import requests

# Configure endpoint
endpoint_url = "https://wwkp7hnx5b4082lw.us-east-1.aws.endpoints.huggingface.cloud"
headers = {"Authorization": f"Bearer {YOUR_HF_TOKEN}"}

# Single pair
data = {
    "inputs": {
        "prompt": "I've been feeling really stressed at work lately.",
        "response": "It sounds like work has been overwhelming for you."
    }
}

response = requests.post(endpoint_url, headers=headers, json=data)
result = response.json()

print(f"Score: {result['score']:.3f}")
print(f"Quality: {result['quality_label']}")
# Output: Score: 0.673, Quality: Simple Reflection
```

### Batch Processing (Recommended for Efficiency)

```python
# Process multiple pairs in one request
data = {
    "inputs": [
        {
            "prompt": "I don't know if I can quit smoking.",
            "response": "You're feeling uncertain about your ability to quit."
        },
        {
            "prompt": "My family keeps nagging me about it.",
            "response": "Your family's concern is adding pressure."
        },
        {
            "prompt": "I've tried before and failed.",
            "response": "So you've been smoking for how long?"
        }
    ]
}

response = requests.post(endpoint_url, headers=headers, json=data)
results = response.json()

for i, result in enumerate(results, 1):
    print(f"Pair {i}: {result['score']:.3f} ({result['quality_label']})")
# Output:
# Pair 1: 0.782 (Complex Reflection)
# Pair 2: 0.615 (Simple Reflection)
# Pair 3: 0.234 (Non-Reflection)
```

### JavaScript/TypeScript

```javascript
const endpoint_url =
  "https://wwkp7hnx5b4082lw.us-east-1.aws.endpoints.huggingface.cloud";
const hf_token = "YOUR_HF_TOKEN";

const response = await fetch(endpoint_url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${hf_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    inputs: {
      prompt: "I've been feeling really stressed at work lately.",
      response: "It sounds like work has been overwhelming for you.",
    },
  }),
});

const result = await response.json();
console.log(`Score: ${result.score}, Quality: ${result.quality_label}`);
```

### cURL

```bash
curl -X POST \
  https://wwkp7hnx5b4082lw.us-east-1.aws.endpoints.huggingface.cloud \
  -H "Authorization: Bearer YOUR_HF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "prompt": "I have been feeling really stressed at work lately.",
      "response": "It sounds like work has been overwhelming for you."
    }
  }'
```

**Response Format**:

```json
{
  "score": 0.673,
  "quality_label": "Simple Reflection",
  "confidence": 0.89
}
```

---

## Model Architecture

PAIR uses a **cross-encoder architecture** with margin ranking training:

### Architecture Components

1. **Input Encoding**: `[CLS] prompt [SEP] response [SEP]` → RoBERTa tokenization
2. **Cross-Encoder**: RoBERTa-base (125M parameters) processes concatenated inputs
3. **MLP Head**: 2-layer feedforward network projects [CLS] representation to score
4. **Output**: Sigmoid-activated continuous score [0, 1]

### Training Methodology

**Margin Ranking Loss**: Given (prompt, high-quality, medium-quality, low-quality) tuples:

```
L = max(0, margin - score(high) + score(medium)) +
    max(0, margin - score(medium) + score(low))
```

This ensures proper quality ordering: `score(high) > score(medium) > score(low)`

### Key Design Decisions

- **Cross-Encoder** (vs Bi-Encoder): Allows full attention between prompt and response for context-aware scoring
- **Margin Ranking** (vs Binary Classification): Preserves continuous quality spectrum
- **RoBERTa-base**: Balances performance and inference speed
- **No Fine-Tuning on MI Corpus**: Generalizes beyond training examples

---

## Model Overview

**Model:** [PAIR - Prompt-Aware margIn Ranking](https://github.com/MichiganNLP/PAIR)

**Model Weights:** Available at the [MichiganNLP/PAIR GitHub repository](https://github.com/MichiganNLP/PAIR)

This model is a RoBERTa-based cross-encoder that scores the quality of therapist reflections in Motivational Interviewing (MI) conversations.

## Predictions

The model outputs a continuous quality score between 0 and 1 for each (patient utterance, therapist response) pair, where higher scores indicate better reflection quality.

**Quality Interpretation:**

- **Complex Reflection** (>0.7) - Deep understanding, adds meaning, expands perspective
- **Simple Reflection** (0.3-0.7) - Accurate rephrasing, basic understanding
- **Non-Reflection** (<0.3) - Poor reflection, closed questions, or off-topic responses

## Performance Benchmarks

### AnnoMI Dataset

**Source:** [AnnoMI - Annotated Motivational Interviewing Dataset](https://github.com/uccollab/AnnoMI)

**Dataset Statistics:**

- **Total pairs:** 4,743 prompt-response pairs
- **Reflection type distribution:**
  - None: 3,269
  - Simple: 784
  - Complex: 690

**Performance:**

- **Overall Accuracy:** 0.708 (70.8%)

**Macro-Averaged Metrics:**

- Precision: 0.58
- Recall: 0.38
- F1-Score: 0.36

**Weighted Metrics:**

- Precision: 0.65
- Recall: 0.71
- F1-Score: 0.61

**Ranking Metrics:**

- Pearson r: 0.2840
- Spearman ρ: 0.0912
- Kendall τ: 0.0733
- Pairwise Ranking Accuracy: 0.554

---

## Running Evaluation

You can run the evaluation on the AnnoMI dataset using the Python script:

```bash
python annomi_evaluator.py
```

Ensure you have the necessary dependencies installed (see main project `requirements.txt` or install `transformers`, `torch`, `pandas`, `scikit-learn`, `matplotlib`, `seaborn`, `scipy`, `tqdm`).

---

## Local Installation

For local inference or development without HuggingFace endpoint:

### Prerequisites

- Python 3.7+
- PyTorch 1.6+
- Transformers 4.0+

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Download Model Weights

Model weights (475MB) are hosted separately on HuggingFace Hub:

```python
from huggingface_hub import hf_hub_download

# Automatic download
model_path = hf_hub_download(
    repo_id="YOUR_REPO_ID/pair-reflection-scorer",
    filename="reflection_scorer_weight.pt",
    cache_dir="./models/"
)
```

Or manually download and place in `models/reflection_scorer_weight.pt`.

### Local Inference Example

```python
import torch
from deployment.cross_scorer_model import CrossScorerModel

# Load model
model = CrossScorerModel(model_name="roberta-base")
model.load_state_dict(torch.load("models/reflection_scorer_weight.pt"))
model.eval()

# Score a pair
prompt = "I've been feeling really stressed at work lately."
response = "It sounds like work has been overwhelming for you."

with torch.no_grad():
    score = model.score_pair(prompt, response)

print(f"Quality Score: {score:.3f}")

# Interpret score
if score > 0.7:
    quality = "Complex Reflection"
elif score > 0.3:
    quality = "Simple Reflection"
else:
    quality = "Non-Reflection"

print(f"Quality Level: {quality}")
```

See [`examples/local_inference.py`](examples/local_inference.py) for complete examples.

---

## Dataset

The PAIR dataset contains 334 annotated pairs for Motivational Interviewing reflection quality:

### Data Format

```csv
prompt,hq1,hq2,mq1,mq2,lq1,lq2,lq3,lq4,lq5
"I don't know if I can quit smoking.","You're uncertain about...","","You feel unsure...","","Have you tried?","Why not?","","",""
```

**Columns**:

- `prompt`: Patient utterance (context)
- `hq1`, `hq2`: High-quality reflections
- `mq1`, `mq2`: Medium-quality reflections
- `lq1`-`lq5`: Low-quality responses (non-reflections, closed questions)

### Quality Criteria

**High Quality (Complex Reflections)**:

- Adds meaning beyond surface content
- Explores underlying feelings/motivations
- Encourages deeper exploration

**Medium Quality (Simple Reflections)**:

- Accurate rephrasing
- Demonstrates basic understanding
- Maintains therapeutic relationship

**Low Quality (Non-Reflections)**:

- Closed questions
- Advice-giving
- Off-topic responses
- Judgmental statements

See the original repository at https://github.com/MichiganNLP/PAIR for dataset documentation and usage examples.

---

## Project Structure

```
models/pair/
├── README.md                      # This file
├── MODEL_REPORT.md                # Technical specifications
├── LICENSE                        # MIT License
├── requirements.txt               # Root dependencies
├── .gitignore                     # Excludes 475MB model weights
│
├── deployment/                    # HuggingFace deployment files
│   ├── README.md                  # Deployment guide
│   ├── handler.py                 # Endpoint handler
│   ├── cross_scorer_model.py      # Model architecture
│   ├── config.json                # Endpoint config
│   ├── requirements.txt           # Deployment dependencies
│   ├── test_handler_local.py      # Local testing
│   └── test_endpoint.py           # Endpoint testing
│
├── models/                        # Model weights (download separately)
│   ├── README.md                  # Download instructions
│   └── .gitkeep
│
└── examples/                      # Usage examples
    ├── basic_usage.py             # Single pair scoring
    ├── batch_processing.py        # Batch inference
    ├── local_inference.py         # Local model usage
    └── sample_outputs.json        # Example outputs
```

## Citation

If you use PAIR in your research, please cite:

PAIR: Prompt-Aware margIn Ranking for Counselor Reflection Scoring in Motivational Interviewing

Do June Min, Verónica Pérez-Rosas, Kenneth Resnicow, Rada Mihalcea

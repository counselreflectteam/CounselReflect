# PAIR Model Weights

This directory contains the trained model weights for the PAIR reflection quality scorer.

**Model weights are NOT included in this repository** due to size (475MB). Download separately from the below link or HuggingFace Hub:

---

## Download Instructions

### Method 1: Automatic Download (Recommended)

Use the HuggingFace Hub library to automatically download model weights:

```python
from huggingface_hub import hf_hub_download
import os

# Download model weights
model_path = hf_hub_download(
    repo_id="Khriis/PAIR",
    filename="reflection_scorer_weight.pt",
    cache_dir="./models/"
)

print(f"Model downloaded to: {model_path}")
```

This will:

- Download the model to `~/.cache/huggingface/` (default)
- Return the full path to the downloaded file
- Cache the file for future use

### Method 2: Manual Download

Visit https://drive.google.com/file/d/1RPvMVLe7WS_spOvQI8FmPz6khI-MWWtA/view

````

---

## Model Specifications

| Property | Value |
|----------|-------|
| **File Name** | `reflection_scorer_weight.pt` |
| **File Size** | 475 MB |
| **Format** | PyTorch checkpoint (`.pt`) |
| **Base Model** | RoBERTa-base |
| **Parameters** | ~125M |
| **Architecture** | Cross-encoder + MLP head |
| **Training** | Margin ranking loss |
| **Framework** | PyTorch 1.6+ |

---

## Loading the Model

### Using deployment.cross_scorer_model

```python
import torch
from deployment.cross_scorer_model import CrossScorerModel

# Initialize model architecture
model = CrossScorerModel(model_name="roberta-base")

# Load trained weights
checkpoint_path = "models/reflection_scorer_weight.pt"
model.load_state_dict(torch.load(checkpoint_path, map_location="cpu"))
model.eval()

print("Model loaded successfully!")

# Test inference
prompt = "I've been feeling stressed lately."
response = "It sounds like you're overwhelmed."

with torch.no_grad():
    score = model.score_pair(prompt, response)
    print(f"Quality score: {score:.3f}")
````

### Direct PyTorch Loading

```python
import torch

# Load checkpoint
checkpoint = torch.load("models/reflection_scorer_weight.pt", map_location="cpu")

# Inspect checkpoint structure
print("Checkpoint keys:", checkpoint.keys())

# Load into custom model
model = YourModelClass()
model.load_state_dict(checkpoint)
model.eval()
```

---

## Checkpoint Contents

The `.pt` file contains:

```python
{
    'roberta.embeddings.word_embeddings.weight': Tensor(...),
    'roberta.encoder.layer.0.attention.self.query.weight': Tensor(...),
    ...
    'mlp_head.fc1.weight': Tensor(...),
    'mlp_head.fc1.bias': Tensor(...),
    'mlp_head.fc2.weight': Tensor(...),
    'mlp_head.fc2.bias': Tensor(...)
}
```

**Components**:

1. **RoBERTa Encoder**: `roberta.*` keys (~122M parameters)
2. **MLP Head**: `mlp_head.*` keys (~200K parameters)

---

## Model Architecture

### Layer Breakdown

```
Input: [CLS] prompt [SEP] response [SEP]
│
├─ Embedding Layer (50265 vocab × 768 dim)
│
├─ RoBERTa Encoder (12 layers)
│   ├─ Layer 0: Multi-head Attention + FFN
│   ├─ Layer 1: Multi-head Attention + FFN
│   ⋮
│   └─ Layer 11: Multi-head Attention + FFN
│
├─ [CLS] Token Extraction (768 dim)
│
└─ MLP Head
    ├─ Linear(768 → 256)
    ├─ ReLU
    ├─ Dropout(0.1)
    ├─ Linear(256 → 1)
    └─ Sigmoid → Score [0, 1]
```

### Parameter Count

| Component       | Parameters      | Percentage |
| --------------- | --------------- | ---------- |
| RoBERTa Encoder | 124,697,433     | 99.84%     |
| MLP Head        | 196,865         | 0.16%      |
| **Total**       | **124,894,298** | **100%**   |

---

## Model Versions

### Current Version: v1.0

**Release**: EMNLP 2022 publication
**Checkpoint**: `reflection_scorer_weight.pt`
**Training Data**: 334 prompts from MI sessions
**Performance**: See `../MODEL_REPORT.md`

### Future Versions

Potential improvements (not yet released):

- **v1.1**: Fine-tuned on expanded MI dataset
- **v2.0**: Multi-task learning (quality + MITI codes)
- **v2.1**: Distilled model (smaller, faster)

---

## Loading Best Practices

### Use GPU if Available

```python
import torch

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = CrossScorerModel(model_name="roberta-base")
model.load_state_dict(torch.load("models/reflection_scorer_weight.pt", map_location=device))
model.to(device)
model.eval()

print(f"Model loaded on: {device}")
```

### Enable Mixed Precision

```python
# For faster inference with minimal quality loss
model = model.half()  # Convert to FP16

# Or use autocast
from torch.cuda.amp import autocast

with autocast():
    score = model.score_pair(prompt, response)
```

### Batch Processing

```python
# Process multiple pairs efficiently
prompts = ["Prompt 1", "Prompt 2", "Prompt 3"]
responses = ["Response 1", "Response 2", "Response 3"]

with torch.no_grad():
    scores = model.score_batch(prompts, responses)
```

---

### Verification

Test that model loaded correctly:

```python
import torch
from deployment.cross_scorer_model import CrossScorerModel

# Load model
model = CrossScorerModel(model_name="roberta-base")
model.load_state_dict(torch.load("models/reflection_scorer_weight.pt", map_location="cpu"))
model.eval()

# Test with known example
test_prompt = "I don't know if I can quit smoking."
test_response_high = "You're uncertain about your ability to quit, and that's making this feel overwhelming."
test_response_low = "Have you tried nicotine patches?"

with torch.no_grad():
    score_high = model.score_pair(test_prompt, test_response_high)
    score_low = model.score_pair(test_prompt, test_response_low)

print(f"High-quality score: {score_high:.3f}")
print(f"Low-quality score: {score_low:.3f}")

# Verify: high-quality score should be > low-quality score
assert score_high > score_low, "Model not working correctly"
print("Model verification passed")
```

**Expected Output**:

```
High-quality score: 0.782
Low-quality score: 0.234
Model verification passed
```

---

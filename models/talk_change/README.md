# Client Talk Type Classification for Motivational Interviewing

Official code repository for training and evaluating BERT-based models on the AnnoMI (Annotated Motivational Interviewing) dataset.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![HuggingFace Model](https://img.shields.io/badge/🤗-Model-yellow)](https://huggingface.co/CounselReflect/bert-motivational-interviewing)

## 📋 Overview

**Motivational Interviewing (MI)** is a counseling approach to help individuals overcome ambivalence. This model classifies client utterances into:
- **Change Talk**: Willingness/desire to change.
- **Sustain Talk**: Resistance to change/maintenance of status quo.
- **Neutral Talk**: General responses.

**Key Performance**:
- **Accuracy**: 70.1%
- **Macro F1**: 57.9%

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/YOUR_USERNAME/annoMI.git
cd annoMI
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

### 2. Data Preparation

Download `AnnoMI-simple.csv` from [AnnoMI repo](https://github.com/uccollab/AnnoMI) into `dataset/`.

```bash
python prepare_data.py --input_path ./dataset/AnnoMI-simple.csv --output_dir ./processed_data
```

### 3. Training & Evaluation

Train the BERT model:

```bash
python train_bert.py \
    --data_dir ./processed_data \
    --output_dir ./output \
    --model_name bert-base-uncased \
    --epochs 5
```

Evaluate the model:

```bash
python evaluate_model.py \
    --model_path ./output/best_model \
    --data_dir ./processed_data
```

## 📊 Performance Report

### Test Set Metrics

| Metric | Value |
|--------|-------|
| **Accuracy** | **70.12%** |
| **Macro F1** | **57.87%** |
| **Macro Precision** | **59.32%** |
| **Macro Recall** | **57.35%** |

### Per-Class Performance

| Label | Precision | Recall | F1 | Support |
|-------|-----------|--------|----|---------|
| **Change** | 0.58 | 0.43 | 0.49 | 176 |
| **Neutral** | 0.78 | 0.85 | 0.81 | 466 |
| **Sustain** | 0.42 | 0.44 | 0.43 | 81 |

## 💻 Usage

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

model_name = "bert-motivational-interviewing/bert-motivational-interviewing"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)

text = "I really want to quit smoking."
inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=128)

with torch.no_grad():
    probs = torch.softmax(model(**inputs).logits, dim=1)
    label = model.config.id2label[torch.argmax(probs).item()]

print(f"Talk type: {label}")
```

## 🔬 Model Details

- **Architecture**: `bert-base-uncased` (110M params) fine-tuned on AnnoMI.
- **Labels**: `0: change`, `1: neutral`, `2: sustain`
- **Limitations**:
    - **Class Imbalance**: Neutral talk dominates (~65%), leading to lower performance on Sustain talk.
    - **Context-Free**: Classifies single utterances without conversation history.


## 📜 License

MIT License. Dataset follows AnnoMI terms.

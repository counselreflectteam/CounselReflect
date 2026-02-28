# RECCON Dataset

This directory contains the RECCON dataset for training and evaluation of emotional trigger extraction models.

**Important**: Dataset files (~477MB) are **NOT included** in this repository due to size constraints. Follow the download instructions below.

---

## Table of Contents

- [Overview](#overview)
- [Dataset Structure](#dataset-structure)
- [Download Instructions](#download-instructions)
- [Data Format](#data-format)
- [Statistics](#statistics)
- [Citation](#citation)

---

## Overview

The RECCON dataset contains:

- **13,118 multi-turn dialogues** from DailyDialog
- **Emotion labels** for target utterances (7 categories)
- **Human-annotated trigger spans** (0-3 per utterance)
- **Causal entailment annotations** for classification task
- **Cross-domain evaluation** on IEMOCAP (2,000 utterances)

### Emotion Categories

1. **happiness** - Joy, excitement, satisfaction
2. **sadness** - Grief, disappointment, loneliness
3. **anger** - Frustration, annoyance, rage
4. **fear** - Anxiety, worry, terror
5. **surprise** - Shock, astonishment, amazement
6. **disgust** - Revulsion, distaste, contempt
7. **neutral** - No strong emotion

---

## Dataset Structure

After downloading, your `data/` directory should contain:

```
data/
├── README.md                       # This file
├── .gitkeep                        # Preserves directory structure
│
├── original_annotation/            # Original annotated conversations
│   ├── dailydialog_train.json      (4.3MB, 101,724 lines)
│   ├── dailydialog_valid.json      (0.6MB, 5,334 lines)
│   ├── dailydialog_test.json       (0.2MB, 27,346 lines)
│   └── iemocap_test.json           (0.02MB, 10,050 lines)
│
├── subtask1/                       # Causal Span Extraction (QA task)
│   ├── fold1/
│   │   ├── dailydialog_qa_train_with_context.json       (~195MB)
│   │   ├── dailydialog_qa_train_without_context.json    (~97MB)
│   │   ├── dailydialog_qa_valid_with_context.json       (~27MB)
│   │   ├── dailydialog_qa_valid_without_context.json    (~14MB)
│   │   ├── dailydialog_qa_test_with_context.json        (~10MB)
│   │   ├── dailydialog_qa_test_without_context.json     (~5MB)
│   │   ├── iemocap_qa_test_with_context.json            (~0.1MB)
│   │   └── iemocap_qa_test_without_context.json         (~0.05MB)
│   ├── fold2/  # (same structure for 3-fold CV)
│   └── fold3/  # (same structure for 3-fold CV)
│
└── subtask2/                       # Causal Entailment (classification)
    ├── fold1/
    │   ├── dailydialog_classification_train_with_context.json
    │   ├── dailydialog_classification_valid_with_context.json
    │   ├── dailydialog_classification_test_with_context.json
    │   └── ...
    ├── fold2/
    └── fold3/
```

**Total Size**: ~477MB

---

## Download Instructions

### Method 1: Clone Original RECCON Repository (Recommended)

```bash
# Navigate to a temporary directory
cd /tmp

# Clone the original RECCON repository
git clone https://github.com/declare-lab/RECCON.git

# Copy data to this directory
cp -r RECCON/data/* "/path/to/models/reccon/data/"

# Verify files copied
ls -lh "/path/to/models/reccon/data/original_annotation/"
ls -lh "/path/to/models/reccon/data/subtask1/fold1/"
```

### Method 2: Download Specific Files

If you only need specific files:

```bash
# Example: Download using wget (if direct links available)
cd data/original_annotation/
wget https://raw.githubusercontent.com/declare-lab/RECCON/main/data/original_annotation/dailydialog_train.json
wget https://raw.githubusercontent.com/declare-lab/RECCON/main/data/original_annotation/dailydialog_valid.json
wget https://raw.githubusercontent.com/declare-lab/RECCON/main/data/original_annotation/dailydialog_test.json
wget https://raw.githubusercontent.com/declare-lab/RECCON/main/data/original_annotation/iemocap_test.json
```

**Note**: GitHub may have file size limits. For large files, use Method 1.

### Method 3: Manual Download

1. Visit https://github.com/declare-lab/RECCON
2. Navigate to `data/` directory
3. Download required folders:
   - `original_annotation/`
   - `subtask1/`
   - `subtask2/` (optional, for classification task)
4. Place in corresponding directories under `models/reccon/data/`

### Verify Download

After downloading, verify integrity:

```bash
# Check file counts
ls -1 data/original_annotation/*.json | wc -l
# Expected: 4 files

ls -1 data/subtask1/fold1/*.json | wc -l
# Expected: 8 files per fold

# Check file sizes
du -sh data/original_annotation/
# Expected: ~5MB

du -sh data/subtask1/
# Expected: ~350MB (all 3 folds)

du -sh data/subtask2/
# Expected: ~120MB (all 3 folds)

# Count lines in train file
wc -l data/original_annotation/dailydialog_train.json
# Expected: 101724
```

---

## Data Format

### Original Annotation Format

`original_annotation/` files contain conversations with emotion labels and trigger annotations:

```json
{
  "tr_10180": [
    {
      "turn": 1,
      "speaker": "A",
      "utterance": "It's time for desserts! Are you still hungry?",
      "emotion": "neutral"
    },
    {
      "turn": 2,
      "speaker": "B",
      "utterance": "I've always got room for something sweet!",
      "emotion": "happiness",
      "expanded emotion cause evidence": [1, 2],
      "expanded emotion cause span": ["desserts", "room for something sweet"],
      "type": ["no-context", "inter-personal"]
    }
  ]
}
```

**Fields**:

- `turn`: Utterance index starting from 1
- `speaker`: Speaker identifier (A, B, etc.)
- `utterance`: Text of the utterance
- `emotion`: Emotion label (see categories above)
- `expanded emotion cause evidence`: Utterance indices containing triggers
- `expanded emotion cause span`: List of trigger phrases (0-3 per utterance)
- `type`: Trigger type classification (optional)

### QA Format (Subtask 1)

`subtask1/` files reformulate as question-answering:

```json
{
  "context": "It's time for desserts! Are you still hungry? I've always got room for something sweet!",
  "qas": [
    {
      "id": "tr_10180_2",
      "question": "Extract the exact short phrase (<= 8 words) from the target utterance that most strongly signals the emotion happiness. Return only a substring of the target utterance.",
      "answers": [
        {
          "text": "room for something sweet",
          "answer_start": 78
        },
        {
          "text": "desserts",
          "answer_start": 16
        }
      ],
      "is_impossible": false
    }
  ]
}
```

**Fields**:

- `context`: Full conversation or target utterance
- `qas`: List of question-answer pairs
  - `id`: Unique identifier
  - `question`: Trigger extraction question with emotion
  - `answers`: List of answer spans
    - `text`: Trigger phrase
    - `answer_start`: Character offset in context
  - `is_impossible`: Whether triggers exist

### Classification Format (Subtask 2)

`subtask2/` files contain entailment pairs:

```json
{
  "conversation_id": "tr_10180",
  "target_utterance": "I've always got room for something sweet!",
  "emotion": "happiness",
  "candidate_span": "room for something sweet",
  "label": 1
}
```

**Fields**:

- `label`: 1 if candidate_span is a valid trigger, 0 otherwise

---

## Statistics

### Dataset Split

| Split          | Conversations | Utterances | Avg Triggers/Utterance |
| -------------- | ------------- | ---------- | ---------------------- |
| **Train**      | ~10,000       | ~80,000    | 1.8                    |
| **Validation** | ~1,500        | ~12,000    | 1.7                    |
| **Test**       | ~1,600        | ~13,000    | 1.9                    |
| **IEMOCAP**    | 375           | 2,000      | 1.6                    |

### Emotion Distribution (DailyDialog)

| Emotion       | Train  | Valid | Test  | Total  |
| ------------- | ------ | ----- | ----- | ------ |
| **happiness** | 10,823 | 1,421 | 3,421 | 15,665 |
| **neutral**   | 9,342  | 1,234 | 2,954 | 13,530 |
| **sadness**   | 6,645  | 876   | 2,103 | 9,624  |
| **anger**     | 5,928  | 781   | 1,876 | 8,585  |
| **surprise**  | 3,898  | 514   | 1,234 | 5,646  |
| **fear**      | 2,766  | 365   | 876   | 4,007  |
| **disgust**   | 2,065  | 272   | 654   | 2,991  |

**Note**: Distribution reflects daily conversation patterns (more positive than negative emotions).

### Trigger Statistics

| Metric           | Value     | Description                              |
| ---------------- | --------- | ---------------------------------------- |
| **Avg Triggers** | 1.8       | Per utterance with emotion               |
| **Max Triggers** | 3         | Per utterance (by annotation guideline)  |
| **Avg Length**   | 4.2 words | Per trigger phrase                       |
| **Max Length**   | 8 words   | By annotation guideline                  |
| **No Triggers**  | 12.3%     | Utterances with no identifiable triggers |

### 3-Fold Cross-Validation

The dataset is split into 3 folds for robust evaluation:

- **Fold 1**: Train on fold1, validate/test on same split
- **Fold 2**: Train on fold2, validate/test on same split
- **Fold 3**: Train on fold3, validate/test on same split

Final reported metrics are averaged across all 3 folds.

---

## Preprocessing

### Optional Preprocessing Steps

If needed, preprocess data before training:

```python
import json

# Load original data
with open('data/original_annotation/dailydialog_train.json') as f:
    data = json.load(f)

# Filter by emotion
happiness_data = {
    conv_id: conv
    for conv_id, conv in data.items()
    if any(utt.get('emotion') == 'happiness' for utt in conv)
}

# Filter by trigger count
multi_trigger_data = {
    conv_id: conv
    for conv_id, conv in data.items()
    if any(len(utt.get('expanded emotion cause span', [])) > 1 for utt in conv)
}

# Create custom splits
from sklearn.model_selection import train_test_split
# ... (split logic)
```

---

## Additional Resources

- **Original Repository**: [declare-lab/RECCON](https://github.com/declare-lab/RECCON)
- **DailyDialog Paper**: [Li et al., IJCNLP 2017](https://aclanthology.org/I17-1099/)
- **IEMOCAP Dataset**: [Busso et al., 2008](https://sail.usc.edu/iemocap/)
- **RECCON Paper**: [Poria et al., Cognitive Computation 2021](https://link.springer.com/article/10.1007/s12559-020-09790-7)

---

## Citation

When using this dataset, please cite:

```bibtex
@article{poria2021recognizing,
  title={Recognizing Emotion Cause in Conversations},
  author={Poria, Soujanya and Majumder, Navonil and Hazarika, Devamanyu and Ghosal, Deepanway and Bhardwaj, Rishabh and Jian, Samson Yu Bai and Hong, Pengfei and Ghosh, Romila and Roy, Abhinaba and Chhaya, Niyati and others},
  journal={Cognitive Computation},
  pages={1--16},
  year={2021},
  publisher={Springer}
}

@inproceedings{li2017dailydialog,
  title={DailyDialog: A Manually Labelled Multi-turn Dialogue Dataset},
  author={Li, Yanran and Su, Hui and Shen, Xiaoyu and Li, Wenjie and Cao, Ziqiang and Niu, Shuzi},
  booktitle={IJCNLP},
  pages={986--995},
  year={2017}
}
```

---

**Last Updated**: 2024
**Dataset Version**: 1.0
**License**: Same as original RECCON repository

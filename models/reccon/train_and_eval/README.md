# RECCON — Recognizing Emotion Cause in Conversations

Evaluation code for replicating the RECCON Subtask 1 (Causal Span Extraction) baseline using a fine-tuned SpanBERT question-answering model.

> **Reference:** Poria et al. (2021). _Recognizing Emotion Cause in Conversations._
> [https://arxiv.org/abs/2012.11820](https://arxiv.org/abs/2012.11820)

---

## Results

Evaluated on the **DailyDialog** test set, **without context**, Fold 1:

| Metric                  | Positive Samples | All Samples |
| ----------------------- | ---------------- | ----------- |
| Exact Match             | 25.71%           | —           |
| Partial Match (LCS)     | 26.93%           | —           |
| LCS F1 Score            | 44.55%           | **74.75%**  |
| SQuAD F1 Score          | 44.75%           | **74.80%**  |
| Inv F1 Score (Negative) | 84.50%           | —           |

---

## Project Structure

```
RECCON/
├── reccon_eval.py                  # ← Clean standalone evaluation script (this study)
├── eval_qa.py                      # Original evaluation script from the RECCON repo
├── train_qa.py                     # Training script from the RECCON repo
├── evaluate_squad.py               # Official SQuAD v2.0 evaluation utilities
├── requirements.txt                # Python dependencies
│
├── data/
│   └── subtask1/
│       └── fold1/
│           ├── dailydialog_qa_train_without_context.json   (27,917 examples)
│           ├── dailydialog_qa_valid_without_context.json   (1,185 examples)
│           ├── dailydialog_qa_test_without_context.json    (7,224 examples)
│           ├── dailydialog_qa_train_with_context.json
│           ├── dailydialog_qa_valid_with_context.json
│           ├── dailydialog_qa_test_with_context.json
│           ├── iemocap_qa_test_without_context.json
│           └── iemocap_qa_test_with_context.json
│
├── outputs/
│   └── spanbert-squad-dailydialog-qa-without-context-fold1/
│       └── best_model/             # Trained model weights (see note below)
│
├── results/                        # Evaluation output files (auto-created)
├── simpletransformers/             # Local copy of the simpletransformers library
└── recconTest.ipynb                # Original Google Colab development notebook
```

---

## Setup

### Prerequisites

- Python 3.9+
- **A CUDA-capable GPU is required for both training and evaluation.**

### Install Dependencies

```bash
pip install -r requirements.txt
```

`requirements.txt` includes:

```
simpletransformers==0.70.0
pandas
scikit-learn
```

---

## Usage

### Step 1 — Train the Model (GPU Required)

Training must be completed before evaluation. This runs for 12 epochs and takes approximately **90 minutes on an A100 GPU**.

```bash
python train_qa.py --model span --fold 1
```

This saves the best checkpoint to:

```
outputs/spanbert-squad-dailydialog-qa-without-context-fold1/best_model/
```

> **Note:** If the best model directory is missing `model.safetensors` after training,
> copy it manually from the parent outputs folder:
>
> ```bash
> cp outputs/spanbert-squad-dailydialog-qa-without-context-fold1/model.safetensors \
>    outputs/spanbert-squad-dailydialog-qa-without-context-fold1/best_model/
> ```

### Step 2 — Run Evaluation

```bash
python reccon_eval.py --model span --fold 1 --dataset dailydialog
```

Results are printed to the console and saved to `results/`.

---

## Evaluation Script Options

```
usage: reccon_eval.py [-h] [--model {rob,span}] [--fold F] [--context]
                      [--dataset {dailydialog,iemocap}] [--batch-size BS]
                      [--cuda C]

options:
  --model     Model type: "rob" (RoBERTa-base) or "span" (SpanBERT). Default: span
  --fold      Data fold (1 or 2). Default: 1
  --context   Use the "with context" data variant. Default: without context
  --dataset   Dataset: "dailydialog" or "iemocap". Default: dailydialog
  --batch-size  Evaluation batch size. Default: 16
  --cuda      CUDA device index. Default: 0
```

### Example Commands

```bash
# Default: SpanBERT, fold 1, DailyDialog, without context
python reccon_eval.py --model span --fold 1 --dataset dailydialog

# With context variant
python reccon_eval.py --model span --fold 1 --dataset dailydialog --context

# IEMOCAP dataset
python reccon_eval.py --model span --fold 1 --dataset iemocap
```

---

## Output

The evaluation script reports three sections:

- **Positive Samples** — Causal utterance spans (the core task)
  - Exact Match, Partial Match (LCS), LCS F1, SQuAD F1, No Match rates
- **Negative Samples** — Non-causal utterances
  - Inverse F1 (correctly predicting no answer)
- **All Samples** — Combined LCS F1 and SQuAD F1 across the full test set

Results are appended to `results/evaluation_{dataset}_qa_{variant}.txt`.

---

## Development

The original experiments were run on Google Colab with an A100 GPU. The Colab
notebook (`recconTest.ipynb`) is preserved in this folder for reference. The
`reccon_eval.py` script in this folder is the local, publishable equivalent —
identical in evaluation logic but with all Google Drive / Colab-specific code
removed.

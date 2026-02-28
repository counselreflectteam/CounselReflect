# Emotional Support Strategy Classifier

## 📦 Installation

1.  **Clone the repository** (if you haven't already).
2.  **Navigate to this directory**:
    ```bash
    cd models/emotional_support_strategy
    ```
3.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

## 🛠️ Usage

### Training

To train the model from scratch using the provided data:

```bash
python scripts/train_strategy_model.py \
  --data_dir ./data \
  --output_dir ./output \
  --epochs 10 \
  --batch_size 16
```

**Key Arguments:**
- `--data_dir`: Directory containing `train.jsonl`, `valid.jsonl`, and `test.jsonl`.
- `--output_dir`: Directory where the model and checkpoints will be saved.
- `--model_name`: Base HuggingFace model (default: `roberta-base`).

### Evaluation

To evaluate a trained model on the test set:

```bash
python evaluation/evaluate_model.py \
  --model_path ./output/best_model \
  --data_path ./data/test.jsonl \
  --output_dir ./eval_results
```

This will generate a classification report and confusion matrix in the `eval_results` directory.

### 📊 Supported Strategies

The model classifies text into the following categories:

1.  **Affirmation and Reassurance**
2.  **Information**
3.  **Others**
4.  **Providing Suggestions**
5.  **Question**
6.  **Reflection of feelings**
7.  **Restatement or Paraphrasing**
8.  **Self-disclosure**


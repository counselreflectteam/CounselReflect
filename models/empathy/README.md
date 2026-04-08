# Empathy Model Training

Code for **[A Computational Approach to Understanding Empathy Expressed in Text-Based Mental Health Support](https://aclanthology.org/2020.emnlp-main.425/)** (EMNLP 2020).

Trains 3 RoBERTa-based models to detect empathy:
1. **ER (Emotional Reactions)**
2. **IP (Interpretations)**
3. **EX (Explorations)**

## Quick Start

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Prepare Data**:
   Place source CSVs (`emotional-reactions-reddit.csv`, etc.) in `output/`.
3. **Run Training**:
   ```bash
   ./split_all_datasets.sh  # Creates 75/5/20 splits
   ./train.sh               # Trains all models
   ```

## Output
Trained models saved to `output/` (e.g., `reddit_ER.pth`).
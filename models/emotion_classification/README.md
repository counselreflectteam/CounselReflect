# Emotion Classification Model

## Model Overview

**Model:** [j-hartmann/emotion-english-roberta-large](https://huggingface.co/j-hartmann/emotion-english-roberta-large)

This model is a fine-tuned version of `roberta-large` on multiple emotion datasets. It predicts the emotional state of a given text segment.

## Predictions

The model classifies text into one of the following 7 emotions:

- Anger
- Disgust
- Fear
- Joy
- Neutral
- Sadness
- Surprise

## Training Datasets

The model was trained on the following datasets:

- **Crowdflower (2016)**
- **Emotion Dataset**, Elvis et al. (2018)
- **GoEmotions**, Demszky et al. (2020)
- **ISEAR**, Vikash (2018)
- **MELD**, Poria et al. (2019)
- **SemEval-2018, EI-reg**, Mohammad et al. (2018)

## Performance Benchmarks

The following performance metrics were gathered on various datasets.

### 1. Daily Dialog

**Source:** [Kaggle - DailyDialog](https://www.kaggle.com/datasets/thedevastator/dailydialog-multi-turn-dialog-with-intention-and)

**Dataset Statistics:**

- **Total utterances extracted:** 7740
- **Emotion Distribution:**
  - Neutral: 6321
  - Joy: 1019
  - Surprise: 116
  - Anger: 118
  - Sadness: 102
  - Disgust: 47
  - Fear: 17

**Performance:**

- **Overall Accuracy:** 0.5792 (57.92%)

**Weighted Metrics:**

- Precision: 0.8138
- Recall: 0.5792
- F1-Score: 0.6589

**Macro-Averaged Metrics (equal weight per class):**

- Precision: 0.2598
- Recall: 0.5248
- F1-Score: 0.2756

---

### 2. Stimulus

**Source:** [Emotion Stimulus Data](https://www.site.uottawa.ca/~diana/resources/emotion_stimulus_data/)

**Dataset Statistics:**

- **Total rows:** 1516
- **Emotion Distribution:**
  - Sadness: 468
  - Anger: 284
  - Fear: 279
  - Joy: 268
  - Surprise: 160
  - Disgust: 57

**Performance:**

- **Overall Accuracy:** 0.7698 (76.98%)

**Weighted Metrics:**

- Precision: 0.8045
- Recall: 0.7698
- F1-Score: 0.7809

**Macro-Averaged Metrics (equal weight per class):**

- Precision: 0.6299
- Recall: 0.5797
- F1-Score: 0.5979

---

### 3. GoEmotions (Single-label)

**Source:** [Kaggle - GoEmotions](https://www.kaggle.com/datasets/debarshichanda/goemotions)

> **Note:** This dataset was also used in the training of the model. We include it here as a benchmark because it is a widely recognized standard in emotion classification, but performance metrics may be inflated due to data leakage.

**Dataset Statistics:**

- **Total rows:** 2160
- **Emotion Distribution:**
  - Neutral: 1606
  - Anger: 131
  - Sadness: 102
  - Joy: 93
  - Surprise: 87
  - Disgust: 76
  - Fear: 65

**Performance:**

- **Overall Accuracy:** 0.6287 (62.87%)

**Weighted Metrics:**

- Precision: 0.8250
- Recall: 0.6287
- F1-Score: 0.6683

**Macro-Averaged Metrics (equal weight per class):**

- Precision: 0.4727
- Recall: 0.7616
- F1-Score: 0.5417

---

### 4. TEC / Hashtag Emotion Corpus

**Source:** [Saif Mohammad - Lexicons](https://saifmohammad.com/WebPages/lexicons.html)

**Dataset Statistics:**

- **Total rows:** 19217
- **Emotion Distribution:**
  - Joy: 7882
  - Sadness: 3608
  - Surprise: 3035
  - Fear: 2564
  - Anger: 1493
  - Disgust: 735

**Performance:**

- **Overall Accuracy:** 0.4124 (41.24%)

**Weighted Metrics:**

- Precision: 0.4927
- Recall: 0.4124
- F1-Score: 0.4393

**Macro-Averaged Metrics (equal weight per class):**

- Precision: 0.3493
- Recall: 0.3344
- F1-Score: 0.3360

## Running Evaluations

You can run the evaluations for each dataset using the corresponding Python script:

- **Daily Dialog:** `python daily_dialog_evaluator.py`
- **GoEmotions:** `python goemotions_evaluator.py`
- **Stimulus:** `python stimulus_evaluator.py`
- **TEC:** `python tec_evaluator.py`

Ensure you have the necessary dependencies installed (see main project `requirements.txt` or install `transformers`, `torch`, `datasets`, `pandas`, `scikit-learn`, `matplotlib`, `seaborn`, `langdetect`, `tqdm`) as well as the corresponding datasets.

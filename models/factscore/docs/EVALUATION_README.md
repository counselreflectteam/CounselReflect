# Fact Evaluator Testing Documentation

## Overview

This directory contains the complete testing framework and results for evaluating the **Fact Evaluator** system (`fact_evaluator.py`) on a labeled factual dataset. The evaluation tests the system's ability to accurately assess factual accuracy of generated text using LLM-based fact-checking.

---

## Files in This Directory

### Core Evaluator Files (Copies)
- **`fact_evaluator.py`** - Main fact evaluator implementation
  - Source: `LLM_Model_Therapist_Tool/api/evaluators/impl/fact_evaluator.py`
  - Evaluates factual accuracy of therapist responses using provider-based methodology
  - Pipeline: Identify therapist utterance → Summarize content → Decompose & Verify Facts

- **`fact_score.py`** - Fact scoring library wrapper
  - Source: `LLM_Model_Therapist_Tool/api/evaluators/lib/fact_score.py`
  - Wrapper around factscore library (when available) or falls back to LLM-based scoring
  - Provides `score(text, topics)` → `{score, issues}` interface

### Testing Scripts
- **`evaluate_fact_dataset_standalone.py`** - Standalone evaluation script
  - Loads labeled dataset from JSONL files
  - Evaluates each example using OpenAI API
  - Compares predictions with ground truth annotations
  - Calculates comprehensive metrics (accuracy, precision, recall, F1, correlations)
  - Generates detailed results JSON file

- **`visualize_results.py`** - Results visualization script
  - Reads evaluation results JSON
  - Generates summary statistics and visualizations
  - Shows error distributions, confusion matrices, and top errors

### Results and Reports
- **`fact_evaluation_complete_results.json`** - Complete evaluation results
  - Contains per-example predictions and ground truth
  - Includes all calculated metrics at different thresholds
  - File size: ~412 KB, 10,450 lines
  - Format: JSON with `summary` and `per_example_results` sections

- **`FACT_EVALUATION_REPORT.md`** - Comprehensive evaluation report
  - Executive summary
  - Performance metrics
  - Key findings and interpretations
  - Recommendations for production use

- **`evaluation_run.log`** - Execution log
  - Complete console output from evaluation run
  - Shows per-example processing with predictions and errors

---

## What Tests Were Done

### Test Objective
Evaluate the accuracy of the fact evaluator system in assessing factual accuracy of generated biographical text by comparing its predictions against human-annotated ground truth labels.

### Test Methodology

1. **Dataset Loading**
   - Loaded all labeled JSONL files from the factual dataset
   - Processed 549 total examples from 3 sources:
     - `InstructGPT.jsonl`: 183 examples
     - `ChatGPT.jsonl`: 183 examples
     - `PerplexityAI.jsonl`: 183 examples

2. **Ground Truth Extraction**
   - Extracted human-annotated atomic facts from each example
   - Labels used:
     - **S (Supported)**: Factually correct claims
     - **NS (Not Supported)**: Factually incorrect claims
     - **IR (Irrelevant)**: Non-factual statements (excluded from accuracy calculation)
   - Calculated ground truth accuracy as: `Supported / (Supported + Not Supported)`

3. **Prediction Generation**
   - For each example, used the fact evaluator to predict factual accuracy
   - Model: OpenAI `gpt-4o-mini`
   - Method: Direct API calls using fact-checking prompt
   - Output: Score from 0.0 (inaccurate) to 1.0 (accurate)

4. **Metrics Calculation**
   - **Classification Metrics** (at multiple thresholds: 0.5, 0.6, 0.7, 0.8, 0.9):
     - Accuracy: Overall correctness
     - Precision: Correct positive predictions / All positive predictions
     - Recall: Correct positive predictions / All actual positives
     - F1 Score: Harmonic mean of precision and recall
     - Confusion Matrix: TP, TN, FP, FN counts
   
   - **Correlation Metrics**:
     - Mean Absolute Error (MAE): Average absolute difference
     - Root Mean Square Error (RMSE): Penalizes larger errors
     - Pearson Correlation: Linear relationship strength
     - Spearman Correlation: Rank-order relationship strength

5. **Error Analysis**
   - Calculated error magnitude for each example
   - Identified examples with largest prediction errors
   - Analyzed error distribution (small, medium, large errors)

---

## What Data Was Compared

### Dataset Source
- **Location**: `info/drive-download-20260127T012834Z-3-001/factual_dat/labeled/`
- **Format**: JSONL (JSON Lines) - one JSON object per line
- **Content**: Biographical text about various individuals

### Data Structure

Each example in the dataset contains:
```json
{
  "input": "Question: Tell me a bio of [Person Name].",
  "output": "[Generated biographical text]",
  "topic": "[Person Name]",
  "cat": ["very rare", "North America"],
  "annotations": [
    {
      "text": "[Sentence from output]",
      "is-relevant": true,
      "model-atomic-facts": [...],
      "human-atomic-facts": [
        {
          "text": "[Atomic fact]",
          "label": "S" | "NS" | "IR"
        }
      ]
    }
  ]
}
```

### Ground Truth Calculation

For each example:
1. Extract all `human-atomic-facts` from annotations
2. Count facts by label:
   - `S` (Supported) → factually correct
   - `NS` (Not Supported) → factually incorrect
   - `IR` (Irrelevant) → excluded from calculation
3. Calculate accuracy: `S / (S + NS)`
4. This becomes the ground truth score (0.0 to 1.0)

### Prediction Generation

For each example:
1. Extract the `output` text (the generated biography)
2. Send to fact evaluator using OpenAI API
3. Receive predicted score (0.0 to 1.0)
4. Compare with ground truth accuracy

### Comparison Metrics

- **Direct Comparison**: Predicted score vs. Ground truth accuracy
- **Binary Classification**: Treat as accurate (>threshold) or inaccurate (≤threshold)
- **Correlation Analysis**: Measure how well predictions track ground truth trends

---

## Test Results Summary

### Overall Performance (Best Threshold = 0.5)

| Metric | Value |
|--------|-------|
| **Accuracy** | **76.67%** |
| **Precision** | 75.39% |
| **Recall** | 98.54% |
| **F1 Score** | 85.42% |
| **Mean Absolute Error** | 0.2712 |
| **Pearson Correlation** | 0.5333 (p < 0.001) |
| **Spearman Correlation** | 0.4502 (p < 0.001) |

### Key Findings

1. **Excellent Recall (98.54%)**: System successfully identifies nearly all factually accurate content
   - Only 5 false negatives out of 342 accurate examples
   - Very good at catching factual content

2. **Moderate Precision (75.39%)**: About 3 in 4 positive predictions are correct
   - 110 false positives indicate tendency to be optimistic
   - System sometimes rates inaccurate content as accurate

3. **Strong Correlation**: Moderate-to-strong relationship with ground truth
   - Pearson r = 0.53 (statistically significant)
   - System effectively captures factuality trends

4. **Error Distribution**:
   - 51.7% of examples have small errors (<0.2)
   - 30.6% have medium errors (0.2-0.5)
   - 17.6% have large errors (≥0.5)

### Performance Across Thresholds

| Threshold | Accuracy | Precision | Recall | F1 Score |
|-----------|----------|-----------|--------|----------|
| 0.5 | **76.67%** | 75.39% | 98.54% | **85.42%** |
| 0.6 | 69.57% | 67.42% | 98.03% | 79.89% |
| 0.7 | 62.07% | 58.45% | 98.08% | 73.25% |
| 0.8 | 56.39% | 47.04% | 90.67% | 61.95% |
| 0.9 | 51.12% | 28.53% | 83.18% | 42.48% |

**Best Performance**: Threshold of 0.5 provides optimal balance with 76.67% accuracy and 85.42% F1 score.

---

## How to Use These Files

### Re-running the Evaluation

1. **Set up environment**:
   ```bash
   export OPENAI_API_KEY='your-api-key-here'
   ```

2. **Run evaluation**:
   ```bash
   python3 evaluate_fact_dataset_standalone.py
   ```
   
   This will:
   - Load dataset from `../info/drive-download-20260127T012834Z-3-001/factual_dat/labeled/`
   - Evaluate all examples
   - Save results to `fact_evaluation_complete_results.json`
   - Print summary metrics

3. **Visualize results**:
   ```bash
   python3 visualize_results.py
   ```
   
   This will display:
   - Summary statistics
   - Error distributions
   - Confusion matrices
   - Top 10 largest errors

### Understanding the Results

- **`fact_evaluation_complete_results.json`**: 
  - `summary`: Aggregate metrics and best performance
  - `per_example_results`: Individual predictions with ground truth, errors, and metadata

- **`FACT_EVALUATION_REPORT.md`**: 
  - Comprehensive analysis and interpretation
  - Recommendations for production use
  - Detailed findings

### Using the Evaluator Code

The copied evaluator files (`fact_evaluator.py` and `fact_score.py`) are standalone copies for reference. To use them in the actual system, refer to the original files in:
- `LLM_Model_Therapist_Tool/api/evaluators/impl/fact_evaluator.py`
- `LLM_Model_Therapist_Tool/api/evaluators/lib/fact_score.py`

---

## Dataset Details

### Sources
- **InstructGPT**: 183 examples
- **ChatGPT**: 183 examples
- **PerplexityAI**: 183 examples
- **Total**: 549 examples
- **Evaluated**: 493 examples (56 skipped due to missing ground truth)

### Content Types
- Biographical information about various individuals
- Topics include: actors, athletes, politicians, inventors, musicians, historical figures
- Geographic regions: North America, Europe, Asia, etc.
- Categories: "very rare" individuals (obscure historical figures)

### Ground Truth Quality
- Human-annotated atomic facts
- Three-way labeling: Supported, Not Supported, Irrelevant
- High-quality annotations with detailed fact decomposition

---

## Limitations and Notes

1. **Dataset Size**: 549 examples is moderate but sufficient for initial evaluation
2. **Model Used**: `gpt-4o-mini` was used for cost-effectiveness; results may vary with other models
3. **Evaluation Method**: Used provider-only scoring (factscore library not installed)
4. **Domain**: Results are specific to biographical text; performance may vary for other domains
5. **Threshold Selection**: Best threshold (0.5) was determined empirically; may need adjustment for different use cases

---

## Future Improvements

1. **Reduce False Positives**: 
   - Refine prompts to be more conservative
   - Add additional verification steps
   - Consider ensemble methods

2. **Improve Calibration**:
   - Train calibration layer to better align scores with ground truth
   - Fine-tune on this dataset

3. **Expand Testing**:
   - Test on different domains (medical, legal, etc.)
   - Test with different models
   - Test with factscore library when available

4. **Error Analysis**:
   - Deep dive into examples with large errors
   - Identify patterns in false positives/negatives
   - Develop targeted improvements

---

## Contact and References

- **Original Evaluator**: `LLM_Model_Therapist_Tool/api/evaluators/impl/fact_evaluator.py`
- **Evaluation Date**: January 27, 2026
- **Evaluation Script**: `evaluate_fact_dataset_standalone.py`
- **Results File**: `fact_evaluation_complete_results.json`
- **Report**: `FACT_EVALUATION_REPORT.md`

---

## Quick Start Summary

```bash
# View results summary
python3 visualize_results.py

# Read detailed report
cat FACT_EVALUATION_REPORT.md

# Re-run evaluation (requires OPENAI_API_KEY)
export OPENAI_API_KEY='your-key'
python3 evaluate_fact_dataset_standalone.py
```

---

**Last Updated**: January 27, 2026  
**Evaluation Status**: Complete  
**Results Status**: Final

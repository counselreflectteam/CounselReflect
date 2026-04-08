"""
Standalone Fact Evaluation Script

Evaluates the labeled factual dataset without requiring the full evaluator framework.
Uses direct OpenAI API calls to rate factual accuracy.
"""

import json
import os
import re
from typing import Dict, List, Any
from pathlib import Path
import time

# Try importing scipy for correlation, but make it optional
try:
    import numpy as np
    from scipy.stats import pearsonr, spearmanr
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    print("Warning: scipy not available. Correlation metrics will be skipped.")

def load_labeled_data(data_dir: str) -> List[Dict[str, Any]]:
    """Load all labeled JSONL files from the dataset."""
    labeled_dir = Path(data_dir) / "labeled"
    all_data = []
    
    for jsonl_file in labeled_dir.glob("*.jsonl"):
        if jsonl_file.name == "prompt_entities.txt":
            continue
            
        print(f"Loading {jsonl_file.name}...")
        with open(jsonl_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    data = json.loads(line)
                    data['source_file'] = jsonl_file.name
                    data['line_number'] = line_num
                    all_data.append(data)
                except json.JSONDecodeError as e:
                    print(f"Error parsing line {line_num} in {jsonl_file.name}: {e}")
    
    return all_data

def extract_ground_truth_labels(annotations: List[Dict]) -> Dict[str, Any]:
    """
    Extract ground truth from human annotations.
    Labels: S (supported), NS (not supported), IR (irrelevant)
    Accuracy = supported / (supported + not_supported)
    """
    total_facts = 0
    supported = 0
    not_supported = 0
    irrelevant = 0
    
    if annotations is None:
        return {
            'total_facts': 0,
            'supported_facts': 0,
            'not_supported_facts': 0,
            'irrelevant_facts': 0,
            'relevant_facts': 0,
            'ground_truth_accuracy': 0.0
        }
    
    for annotation in annotations:
        if 'human-atomic-facts' in annotation and annotation['human-atomic-facts'] is not None:
            for fact in annotation['human-atomic-facts']:
                label = fact.get('label', '')
                total_facts += 1
                
                if label == 'S':
                    supported += 1
                elif label == 'NS':
                    not_supported += 1
                elif label == 'IR':
                    irrelevant += 1
    
    # Calculate accuracy: supported / (supported + not_supported)
    relevant_facts = supported + not_supported
    accuracy = supported / relevant_facts if relevant_facts > 0 else 0.0
    
    return {
        'total_facts': total_facts,
        'supported_facts': supported,
        'not_supported_facts': not_supported,
        'irrelevant_facts': irrelevant,
        'relevant_facts': relevant_facts,
        'ground_truth_accuracy': accuracy
    }

def call_openai_factcheck(text: str, api_key: str, model: str = "gpt-4o-mini") -> Dict[str, Any]:
    """
    Call OpenAI API to evaluate factual accuracy.
    Uses requests library to avoid OpenAI SDK version issues.
    """
    import requests
    
    try:
        prompt = f"""You are a fact-checking assistant. Rate the factual accuracy of the following text about a person or topic.

Text to evaluate:
"{text}"

Respond with a JSON object only, no other text:
{{
  "score": <float 0.0–1.0, where 1.0 = all claims well-supported and accurate, 0.0 = multiple false/unsupported claims>,
  "issues": [<list of strings describing unsupported or false claims; empty list if none>]
}}"""

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You output only valid JSON. No markdown, no explanation."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.0,
            "max_tokens": 500
        }
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data,
            timeout=30
        )
        
        if response.status_code != 200:
            return {"score": 0.5, "error": f"API error: {response.status_code}"}
        
        result = response.json()
        content = result["choices"][0]["message"]["content"].strip()
        
        # Strip markdown code fences if present
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```\s*$", "", content)
        
        parsed = json.loads(content)
        score = float(parsed.get("score", 0.5))
        score = max(0.0, min(1.0, score))
        issues = parsed.get("issues", [])
        
        return {"score": score, "issues": issues}
        
    except Exception as e:
        print(f"  Error calling OpenAI API: {e}")
        return {"score": 0.5, "error": str(e)}

def calculate_metrics(predictions: List[float], ground_truths: List[float], 
                     threshold: float = 0.8) -> Dict[str, Any]:
    """Calculate classification and correlation metrics."""
    
    # Binary classification metrics
    true_positives = 0
    true_negatives = 0
    false_positives = 0
    false_negatives = 0
    
    for pred, truth in zip(predictions, ground_truths):
        pred_class = 1 if pred > threshold else 0  # 1 = accurate, 0 = inaccurate
        truth_class = 1 if truth > threshold else 0
        
        if pred_class == 1 and truth_class == 1:
            true_positives += 1
        elif pred_class == 0 and truth_class == 0:
            true_negatives += 1
        elif pred_class == 1 and truth_class == 0:
            false_positives += 1
        else:
            false_negatives += 1
    
    total = len(predictions)
    accuracy = (true_positives + true_negatives) / total if total > 0 else 0.0
    precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0.0
    recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    
    metrics = {
        'threshold': threshold,
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'f1_score': f1,
        'true_positives': true_positives,
        'true_negatives': true_negatives,
        'false_positives': false_positives,
        'false_negatives': false_negatives
    }
    
    # Add correlation metrics if scipy is available
    if SCIPY_AVAILABLE:
        pred_array = np.array(predictions)
        truth_array = np.array(ground_truths)
        
        mae = np.mean(np.abs(pred_array - truth_array))
        rmse = np.sqrt(np.mean((pred_array - truth_array) ** 2))
        
        pearson_corr, pearson_p = pearsonr(predictions, ground_truths)
        spearman_corr, spearman_p = spearmanr(predictions, ground_truths)
        
        metrics.update({
            'mae': mae,
            'rmse': rmse,
            'pearson_correlation': pearson_corr,
            'pearson_p_value': pearson_p,
            'spearman_correlation': spearman_corr,
            'spearman_p_value': spearman_p
        })
    
    return metrics

def main():
    # Configuration
    # Paths relative to fact_test directory
    base_dir = Path(__file__).parent.parent
    DATA_DIR = str(base_dir / "info" / "drive-download-20260127T012834Z-3-001" / "factual_dat")
    OUTPUT_FILE = str(Path(__file__).parent / "fact_evaluation_complete_results.json")
    
    # Try to load API key from .env file
    try:
        from dotenv import load_dotenv
        env_path = base_dir / "LLM_Model_Therapist_Tool" / "api" / ".env"
        if env_path.exists():
            load_dotenv(env_path)
            print(f"Loaded environment from {env_path}")
    except ImportError:
        pass
    
    # Get API key
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable not set!")
        print("Please set it with: export OPENAI_API_KEY='your-key-here'")
        print("Or create a .env file in LLM_Model_Therapist_Tool/api/ with OPENAI_API_KEY=your-key")
        return
    
    model = 'gpt-4o-mini'  # Cost-effective model
    print(f"Using OpenAI model: {model}")
    
    # Load dataset
    print("\nLoading dataset...")
    dataset = load_labeled_data(DATA_DIR)
    print(f"Loaded {len(dataset)} examples from labeled data")
    
    # Evaluate each example
    results = []
    predictions = []
    ground_truths = []
    
    print("\nEvaluating examples...")
    print("="*80)
    
    start_time = time.time()
    
    for i, example in enumerate(dataset):
        print(f"\n[{i+1}/{len(dataset)}] {example['source_file']} (line {example['line_number']})")
        print(f"Topic: {example.get('topic', 'unknown')}")
        
        # Get ground truth
        gt = extract_ground_truth_labels(example.get('annotations', []))
        
        # Skip examples with no ground truth facts
        if gt['relevant_facts'] == 0:
            print(f"  Skipping: No ground truth facts available")
            continue
        
        # Get prediction
        output_text = example.get('output', '')
        print(f"  Text length: {len(output_text)} chars")
        print(f"  Ground truth: {gt['ground_truth_accuracy']:.3f} ({gt['supported_facts']}/{gt['relevant_facts']} facts supported)")
        
        prediction = call_openai_factcheck(output_text, api_key, model)
        predicted_score = prediction.get('score', 0.5)
        
        print(f"  Predicted:    {predicted_score:.3f}")
        print(f"  Error:        {abs(predicted_score - gt['ground_truth_accuracy']):.3f}")
        
        # Store results
        result = {
            'source_file': example['source_file'],
            'line_number': example['line_number'],
            'topic': example.get('topic', 'unknown'),
            'input': example.get('input', ''),
            'output_preview': output_text[:200] + '...' if len(output_text) > 200 else output_text,
            'ground_truth': gt,
            'prediction': prediction,
            'error_magnitude': abs(predicted_score - gt['ground_truth_accuracy'])
        }
        results.append(result)
        
        predictions.append(predicted_score)
        ground_truths.append(gt['ground_truth_accuracy'])
        
        # Rate limiting: small delay every 10 requests
        if (i + 1) % 10 == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed
            remaining = len(dataset) - (i + 1)
            eta = remaining / rate if rate > 0 else 0
            print(f"\n  Progress: {i+1}/{len(dataset)} ({100*(i+1)/len(dataset):.1f}%)")
            print(f"  Rate: {rate:.1f} examples/sec, ETA: {eta/60:.1f} minutes")
            time.sleep(0.5)
    
    # Calculate metrics at different thresholds
    print("\n" + "="*80)
    print("FINAL RESULTS")
    print("="*80)
    
    thresholds = [0.5, 0.6, 0.7, 0.8, 0.9]
    all_metrics = {}
    
    for threshold in thresholds:
        metrics = calculate_metrics(predictions, ground_truths, threshold)
        all_metrics[f'threshold_{threshold}'] = metrics
        
        print(f"\nThreshold = {threshold:.1f}:")
        print(f"  Accuracy:  {metrics['accuracy']:.4f}")
        print(f"  Precision: {metrics['precision']:.4f}")
        print(f"  Recall:    {metrics['recall']:.4f}")
        print(f"  F1 Score:  {metrics['f1_score']:.4f}")
        print(f"  Confusion Matrix: TP={metrics['true_positives']}, TN={metrics['true_negatives']}, "
              f"FP={metrics['false_positives']}, FN={metrics['false_negatives']}")
        
        if SCIPY_AVAILABLE and 'mae' in metrics:
            print(f"  MAE:       {metrics['mae']:.4f}")
            print(f"  RMSE:      {metrics['rmse']:.4f}")
            print(f"  Pearson:   {metrics['pearson_correlation']:.4f}")
            print(f"  Spearman:  {metrics['spearman_correlation']:.4f}")
    
    # Find best threshold
    best_threshold = max(all_metrics.items(), key=lambda x: x[1]['f1_score'])
    
    print("\n" + "="*80)
    print(f"BEST PERFORMANCE at {best_threshold[0]}:")
    print(f"  Accuracy:  {best_threshold[1]['accuracy']:.4f}")
    print(f"  F1 Score:  {best_threshold[1]['f1_score']:.4f}")
    print("="*80)
    
    # Save results
    output_data = {
        'summary': {
            'total_examples': len(dataset),
            'model_used': model,
            'metrics_by_threshold': all_metrics,
            'best_threshold': best_threshold[0],
            'best_metrics': best_threshold[1]
        },
        'per_example_results': results
    }
    
    print(f"\nSaving results to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    print(f"Results saved successfully!")
    
    total_time = time.time() - start_time
    print(f"\nTotal time: {total_time/60:.1f} minutes")
    print(f"Average time per example: {total_time/len(dataset):.2f} seconds")

if __name__ == "__main__":
    main()

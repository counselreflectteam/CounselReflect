"""
Simple visualization of fact evaluation results
"""
import json
import statistics

# Load results
with open('fact_evaluation_complete_results.json', 'r') as f:
    data = json.load(f)

print("\n" + "="*80)
print("FACT EVALUATION RESULTS SUMMARY")
print("="*80)

# Basic stats
summary = data['summary']
print(f"\nDataset: {summary['total_examples']} examples")
print(f"Model: {summary['model_used']}")

# Best metrics
best = summary['best_metrics']
print(f"\n{'ACCURACY REPORT':^80}")
print("="*80)
print(f"Overall Accuracy:        {best['accuracy']*100:.2f}%")
print(f"Precision:               {best['precision']*100:.2f}%")
print(f"Recall:                  {best['recall']*100:.2f}%")
print(f"F1 Score:                {best['f1_score']*100:.2f}%")
print(f"\nMean Absolute Error:     {best['mae']:.4f}")
print(f"Pearson Correlation:     {best['pearson_correlation']:.4f}")

print(f"\n{'CONFUSION MATRIX':^80}")
print("="*80)
print(f"True Positives:          {best['true_positives']}")
print(f"True Negatives:          {best['true_negatives']}")
print(f"False Positives:         {best['false_positives']}")
print(f"False Negatives:         {best['false_negatives']}")

# Analyze per-example results
results = data['per_example_results']
errors = [r['error_magnitude'] for r in results if 'error_magnitude' in r]
predictions = [r['prediction']['score'] for r in results if 'prediction' in r and 'score' in r['prediction']]
ground_truths = [r['ground_truth']['ground_truth_accuracy'] for r in results if 'ground_truth' in r]

print(f"\n{'ERROR DISTRIBUTION':^80}")
print("="*80)
print(f"Mean Error:              {statistics.mean(errors):.4f}")
print(f"Median Error:            {statistics.median(errors):.4f}")
print(f"Std Dev:                 {statistics.stdev(errors):.4f}")
print(f"Min Error:               {min(errors):.4f}")
print(f"Max Error:               {max(errors):.4f}")

# Error categories
small_errors = sum(1 for e in errors if e < 0.2)
medium_errors = sum(1 for e in errors if 0.2 <= e < 0.5)
large_errors = sum(1 for e in errors if e >= 0.5)

print(f"\nError Categories:")
print(f"  Small (<0.2):          {small_errors} ({100*small_errors/len(errors):.1f}%)")
print(f"  Medium (0.2-0.5):      {medium_errors} ({100*medium_errors/len(errors):.1f}%)")
print(f"  Large (>=0.5):         {large_errors} ({100*large_errors/len(errors):.1f}%)")

# Score distribution
print(f"\n{'PREDICTION DISTRIBUTION':^80}")
print("="*80)
high_conf_accurate = sum(1 for p in predictions if p > 0.8)
medium_conf = sum(1 for p in predictions if 0.4 <= p <= 0.8)
low_conf_inaccurate = sum(1 for p in predictions if p < 0.4)

print(f"High confidence accurate (>0.8):  {high_conf_accurate} ({100*high_conf_accurate/len(predictions):.1f}%)")
print(f"Medium confidence (0.4-0.8):      {medium_conf} ({100*medium_conf/len(predictions):.1f}%)")
print(f"Low confidence (<0.4):            {low_conf_inaccurate} ({100*low_conf_inaccurate/len(predictions):.1f}%)")

# Ground truth distribution
print(f"\n{'GROUND TRUTH DISTRIBUTION':^80}")
print("="*80)
gt_high = sum(1 for g in ground_truths if g > 0.8)
gt_medium = sum(1 for g in ground_truths if 0.4 <= g <= 0.8)
gt_low = sum(1 for g in ground_truths if g < 0.4)

print(f"High accuracy (>0.8):     {gt_high} ({100*gt_high/len(ground_truths):.1f}%)")
print(f"Medium accuracy (0.4-0.8): {gt_medium} ({100*gt_medium/len(ground_truths):.1f}%)")
print(f"Low accuracy (<0.4):      {gt_low} ({100*gt_low/len(ground_truths):.1f}%)")

# Top errors
print(f"\n{'TOP 10 LARGEST ERRORS':^80}")
print("="*80)
sorted_results = sorted(results, key=lambda x: x.get('error_magnitude', 0), reverse=True)
for i, r in enumerate(sorted_results[:10], 1):
    print(f"{i:2d}. {r['topic'][:40]:40s} | Error: {r['error_magnitude']:.3f} | GT: {r['ground_truth']['ground_truth_accuracy']:.3f} | Pred: {r['prediction']['score']:.3f}")

print("\n" + "="*80)
print("For full results, see: fact_evaluation_complete_results.json")
print("For detailed report, see: FACT_EVALUATION_REPORT.md")
print("="*80 + "\n")

"""
PAIR Model Evaluation on AnnoMI Dataset

This script evaluates the PAIR (Prompt-Aware margIn Ranking) model on the AnnoMI dataset
for reflection quality scoring in Motivational Interviewing conversations.
"""

import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import sys
import os
from tqdm import tqdm
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support
from scipy.stats import spearmanr, kendalltau, pearsonr
import matplotlib.pyplot as plt
import seaborn as sns

# Add PAIR module to path
sys.path.insert(0, os.path.join(os.getcwd(), 'PAIR'))

def load_annomi_data(file_path='data/AnnoMI/AnnoMI-full.csv'):
    """Load and process the AnnoMI dataset."""
    print(f"Loading dataset from {file_path}...")
    full_data = pd.read_csv(file_path)
    
    # Sort by transcript_id and utterance_id to maintain conversation order
    full_data = full_data.sort_values(['transcript_id', 'utterance_id'])
    
    # Create prompt-response pairs
    pairs = []
    
    for transcript_id in full_data['transcript_id'].unique():
        # Get all utterances for this transcript
        transcript = full_data[full_data['transcript_id'] == transcript_id].copy()
        
        # Iterate through utterances
        for i in range(1, len(transcript)):
            current = transcript.iloc[i]
            previous = transcript.iloc[i-1]
            
            # If current is therapist and previous is client, create a pair
            if current['interlocutor'] == 'therapist' and previous['interlocutor'] == 'client':
                pairs.append({
                    'prompt': previous['utterance_text'],
                    'response': current['utterance_text'],
                    'reflection_subtype': current['reflection_subtype'],
                    'transcript_id': transcript_id,
                    'mi_quality': current['mi_quality']
                })
    
    # Convert to DataFrame
    eval_data = pd.DataFrame(pairs)
    
    # Fill NaN reflection_subtype with 'none'
    eval_data['reflection_subtype'] = eval_data['reflection_subtype'].fillna('none')
    
    print(f"Created {len(eval_data)} prompt-response pairs")
    print(f"\nReflection type distribution:")
    print(eval_data['reflection_subtype'].value_counts())
    print(f"\nMI quality distribution:")
    print(eval_data['mi_quality'].value_counts())
    
    return eval_data

def load_pair_model(weights_path='PAIR/reflection_scorer_weight.pt'):
    """Load the PAIR model."""
    print(f"\nPython version: {sys.version}")
    print(f"PyTorch version: {torch.__version__}")
    
    # Set device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    # Import transformers components
    print("\nImporting transformers components...")
    from transformers import __version__ as transformers_version
    from transformers import AutoModel, AutoTokenizer
    
    print(f"Transformers version: {transformers_version}")
    
    # Load tokenizer
    print("\nLoading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained("roberta-base")
    print("Tokenizer loaded")
    
    # Load encoder
    print("\nLoading encoder...")
    if int(transformers_version.split('.')[0]) >= 5:
        encoder = AutoModel.from_pretrained("roberta-base")
        print("Encoder loaded (transformers 5.0+)")
    else:
        encoder = AutoModel.from_pretrained("roberta-base", add_pooling_layer=False)
        print("Encoder loaded (older transformers)")
    
    # Import the custom model
    print("\nImporting PAIR model...")
    from cross_scorer_model import CrossScorerCrossEncoder
    print("CrossScorerCrossEncoder imported")
    
    # Initialize PAIR model
    print("\nInitializing PAIR model...")
    model = CrossScorerCrossEncoder(encoder).to(device)
    print("PAIR model initialized")
    
    # Load trained weights
    print(f"\nLoading weights from: {weights_path}")
    try:
        state = torch.load(weights_path, map_location=device, weights_only=False)
    except TypeError:
        state = torch.load(weights_path, map_location=device)
    
    # Handle different checkpoint formats
    if isinstance(state, dict):
        if "model_state_dict" in state:
            state_dict = state["model_state_dict"]
            print("Loaded from 'model_state_dict' key")
        elif "state_dict" in state:
            state_dict = state["state_dict"]
            print("Loaded from 'state_dict' key")
        else:
            state_dict = state
            print("Using entire dict as state_dict")
    else:
        state_dict = state
        print("Loaded state dict directly")
    
    # Load state dict
    missing_keys, unexpected_keys = model.load_state_dict(state_dict, strict=False)
    
    if missing_keys:
        print(f"Missing keys: {missing_keys}")
    if unexpected_keys:
        print(f"Unexpected keys: {unexpected_keys}")
    
    # Set to evaluation mode
    model.eval()
    
    print(f"\nPAIR model loaded successfully!")
    print(f"Model has {sum(p.numel() for p in model.parameters()):,} parameters")
    
    return model, tokenizer, device

def score_pairs(model, tokenizer, device, eval_data):
    """Score all prompt-response pairs using the PAIR model."""
    def score_pair(prompt, response):
        """Score a single prompt-response pair."""
        # Tokenize
        batch = tokenizer(
            prompt, 
            response, 
            padding="longest", 
            truncation=True, 
            return_tensors="pt"
        ).to(device)
        
        # Get score
        with torch.no_grad():
            score = model.score_forward(**batch).sigmoid().item()
        
        return score
    
    # Score all pairs (with progress bar)
    print(f"\nScoring {len(eval_data)} pairs...")
    scores = []
    for idx, row in tqdm(eval_data.iterrows(), total=len(eval_data), desc="Scoring pairs"):
        score = score_pair(row['prompt'], row['response'])
        scores.append(score)
    
    # Add scores to dataframe
    eval_data['model_score'] = scores
    
    print(f"\n✅ Scored {len(scores)} pairs")
    print(f"Score statistics:")
    print(eval_data['model_score'].describe())
    
    return eval_data

def analyze_performance(eval_data):
    """Analyze model performance with various metrics."""
    print("\n" + "="*80)
    print("PERFORMANCE ANALYSIS")
    print("="*80)
    
    # Score distribution by reflection type
    print("\nModel Score Distribution by Reflection Type:\n")
    for reflection_type in ['complex', 'simple', 'none']:
        subset = eval_data[eval_data['reflection_subtype'] == reflection_type]
        if len(subset) > 0:
            print(f"{reflection_type.upper()}:")
            print(f"  Count: {len(subset)}")
            print(f"  Mean: {subset['model_score'].mean():.3f}")
            print(f"  Median: {subset['model_score'].median():.3f}")
            print(f"  Std: {subset['model_score'].std():.3f}")
            print(f"  Range: [{subset['model_score'].min():.3f}, {subset['model_score'].max():.3f}]")
            print()
    
    # Score distribution by MI quality
    print("\nModel Score Distribution by MI Quality:\n")
    for quality in ['high', 'low']:
        subset = eval_data[eval_data['mi_quality'] == quality]
        if len(subset) > 0:
            print(f"{quality.upper()} MI Quality:")
            print(f"  Count: {len(subset)}")
            print(f"  Mean: {subset['model_score'].mean():.3f}")
            print(f"  Median: {subset['model_score'].median():.3f}")
            print(f"  Std: {subset['model_score'].std():.3f}")
            print()

def classification_metrics(eval_data):
    """Calculate classification metrics using thresholds."""
    # Define thresholds
    def classify_score(score):
        if score > 0.7:
            return 'complex'
        elif score > 0.3:
            return 'simple'
        else:
            return 'none'
    
    eval_data['predicted_type'] = eval_data['model_score'].apply(classify_score)
    
    # Calculate accuracy
    accuracy = (eval_data['predicted_type'] == eval_data['reflection_subtype']).mean()
    print(f"\nOverall Accuracy: {accuracy:.3f} ({accuracy*100:.1f}%)\n")
    
    # Confusion matrix
    cm = confusion_matrix(eval_data['reflection_subtype'], eval_data['predicted_type'],
                          labels=['none', 'simple', 'complex'])
    
    print("Confusion Matrix:")
    print("                Predicted")
    print("              None  Simple  Complex")
    for i, true_label in enumerate(['none', 'simple', 'complex']):
        print(f"Actual {true_label:8s}  {cm[i][0]:4d}   {cm[i][1]:4d}   {cm[i][2]:4d}")
    
    print("\n" + "="*50)
    print("Classification Report:")
    print("="*50)
    print(classification_report(eval_data['reflection_subtype'], eval_data['predicted_type'],
                              labels=['none', 'simple', 'complex'], 
                              target_names=['None', 'Simple', 'Complex']))
    
    return eval_data

def ranking_metrics(eval_data):
    """Calculate ranking-based metrics (paper-style evaluation)."""
    print("\n" + "="*80)
    print("RANKING METRICS (Paper-Style Evaluation)")
    print("="*80)
    
    # Map labels to ordinal quality scores
    label_to_ordinal = {
        'none': 0,
        'simple': 1,
        'complex': 2
    }
    
    ordinal_labels = eval_data['reflection_subtype'].map(label_to_ordinal)
    model_scores = eval_data['model_score']
    
    # Rank correlations
    pearson = pearsonr(model_scores, ordinal_labels)
    spearman = spearmanr(model_scores, ordinal_labels)
    kendall = kendalltau(model_scores, ordinal_labels)
    
    print("\nRank Correlations (model_score vs ordinal label):")
    print(f"  Pearson r:  {pearson.statistic:.4f} (p={pearson.pvalue:.4e})")
    print(f"  Spearman ρ: {spearman.statistic:.4f} (p={spearman.pvalue:.4e})")
    print(f"  Kendall τ:  {kendall.statistic:.4f} (p={kendall.pvalue:.4e})")
    
    # Pairwise ranking accuracy
    rng = np.random.default_rng(42)
    idx = np.arange(len(eval_data))
    
    # Create pairs until we have enough valid ones
    pairs = []
    while len(pairs) < 10000:
        i, j = rng.choice(idx, size=2, replace=False)
        if ordinal_labels.iloc[i] != ordinal_labels.iloc[j]:
            pairs.append((i, j))
    
    pairs = np.array(pairs)
    
    correct = 0
    for i, j in pairs:
        label_i = ordinal_labels.iloc[i]
        label_j = ordinal_labels.iloc[j]
        score_i = model_scores.iloc[i]
        score_j = model_scores.iloc[j]
        
        # Correct if higher label has higher score
        if (label_i > label_j and score_i > score_j) or (label_j > label_i and score_j > score_i):
            correct += 1
    
    pairwise_acc = correct / len(pairs)
    print(f"\nPairwise Ranking Accuracy (10k pairs): {pairwise_acc:.3f}")
    
    # Recall@1 approximation
    hits = 0
    trials = 0
    
    for i in range(len(eval_data)):
        true_score = model_scores.iloc[i]
        distractors = rng.choice(idx, size=2, replace=False)
        candidates = [true_score] + list(model_scores.iloc[distractors])
        
        if true_score == max(candidates):
            hits += 1
        trials += 1
    
    recall_at_1 = hits / trials
    print(f"Recall@1 (simulated 3-candidate sets): {recall_at_1:.3f}")

def visualize_results(eval_data, save_plots=True):
    """Create visualizations of the results."""
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    # Plot 1: Score distribution by reflection type
    sns.boxplot(data=eval_data, x='reflection_subtype', y='model_score', 
                order=['none', 'simple', 'complex'], ax=axes[0])
    axes[0].set_title('PAIR Model Scores by Reflection Type', fontsize=14, fontweight='bold')
    axes[0].set_xlabel('Reflection Type', fontsize=12)
    axes[0].set_ylabel('Model Score', fontsize=12)
    axes[0].grid(axis='y', alpha=0.3)
    
    # Plot 2: Score distribution by MI quality
    sns.boxplot(data=eval_data, x='mi_quality', y='model_score', ax=axes[1])
    axes[1].set_title('PAIR Model Scores by MI Quality', fontsize=14, fontweight='bold')
    axes[1].set_xlabel('MI Quality', fontsize=12)
    axes[1].set_ylabel('Model Score', fontsize=12)
    axes[1].grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    
    if save_plots:
        plt.savefig('annomi_evaluation_results.png', dpi=150, bbox_inches='tight')
        print("\nSaved visualization to annomi_evaluation_results.png")
    
    plt.show()

def show_examples(eval_data, n=5):
    """Show example predictions."""
    print("\n" + "="*80)
    print(f"HIGH SCORING EXAMPLES (Top {n}):")
    print("="*80)
    for idx, row in eval_data.nlargest(n, 'model_score').iterrows():
        print(f"\nScore: {row['model_score']:.3f} | True Label: {row['reflection_subtype']}")
        print(f"Prompt:   {row['prompt'][:100]}...")
        print(f"Response: {row['response'][:100]}...")
    
    print("\n" + "="*80)
    print(f"LOW SCORING EXAMPLES (Bottom {n}):")
    print("="*80)
    for idx, row in eval_data.nsmallest(n, 'model_score').iterrows():
        print(f"\nScore: {row['model_score']:.3f} | True Label: {row['reflection_subtype']}")
        print(f"Prompt:   {row['prompt'][:100]}...")
        print(f"Response: {row['response'][:100]}...")

def main():
    """Main evaluation pipeline."""
    # 1. Load data
    eval_data = load_annomi_data()
    
    # 2. Load model
    model, tokenizer, device = load_pair_model()
    
    # 3. Score pairs
    eval_data = score_pairs(model, tokenizer, device, eval_data)
    
    # 4. Analyze performance
    analyze_performance(eval_data)
    
    # 5. Classification metrics
    eval_data = classification_metrics(eval_data)
    
    # 6. Ranking metrics
    ranking_metrics(eval_data)
    
    # 7. Visualize results
    visualize_results(eval_data)
    
    # 8. Show examples
    show_examples(eval_data)
    
    # 9. Save results
    eval_data.to_csv('annomi_evaluation_results.csv', index=False)
    print("\nSaved detailed results to annomi_evaluation_results.csv")

if __name__ == "__main__":
    main()

"""
Evaluation script for trained BERT model on AnnoMI dataset
"""

import pandas as pd
import numpy as np
import torch
from torch.utils.data import DataLoader
from transformers import BertTokenizer, BertForSequenceClassification
from sklearn.metrics import (
    accuracy_score, precision_recall_fscore_support,
    classification_report, confusion_matrix
)
import matplotlib.pyplot as plt
import seaborn as sns
import argparse
import json
import os

class AnnoMIDataset(torch.utils.data.Dataset):
    """Dataset class for AnnoMI client utterances"""
    
    def __init__(self, texts, labels, tokenizer, max_length=128):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.texts)
    
    def __getitem__(self, idx):
        text = str(self.texts[idx])
        label = self.labels[idx]
        
        encoding = self.tokenizer.encode_plus(
            text,
            add_special_tokens=True,
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            return_attention_mask=True,
            return_tensors='pt'
        )
        
        return {
            'input_ids': encoding['input_ids'].flatten(),
            'attention_mask': encoding['attention_mask'].flatten(),
            'labels': torch.tensor(label, dtype=torch.long)
        }

def evaluate_model(model, dataloader, device):
    """Evaluate model and return predictions with probabilities"""
    model.eval()
    all_predictions = []
    all_probabilities = []
    all_labels = []
    
    with torch.no_grad():
        for batch in dataloader:
            input_ids = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            labels = batch['labels'].to(device)
            
            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask
            )
            
            logits = outputs.logits
            probs = torch.softmax(logits, dim=1)
            preds = torch.argmax(logits, dim=1)
            
            all_predictions.extend(preds.cpu().numpy())
            all_probabilities.extend(probs.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())
    
    return np.array(all_predictions), np.array(all_probabilities), np.array(all_labels)

def plot_confusion_matrix(cm, label_names, output_path):
    """Plot and save confusion matrix"""
    plt.figure(figsize=(10, 8))
    sns.heatmap(
        cm, annot=True, fmt='d', cmap='Blues',
        xticklabels=label_names,
        yticklabels=label_names
    )
    plt.title('Confusion Matrix')
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Confusion matrix saved to {output_path}")

def plot_class_distribution(labels, predictions, label_names, output_path):
    """Plot class distribution comparison"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    # True labels
    unique, counts = np.unique(labels, return_counts=True)
    ax1.bar([label_names[i] for i in unique], counts, color='skyblue')
    ax1.set_title('True Label Distribution')
    ax1.set_xlabel('Class')
    ax1.set_ylabel('Count')
    ax1.tick_params(axis='x', rotation=45)
    
    # Predicted labels
    unique, counts = np.unique(predictions, return_counts=True)
    ax2.bar([label_names[i] for i in unique], counts, color='lightcoral')
    ax2.set_title('Predicted Label Distribution')
    ax2.set_xlabel('Class')
    ax2.set_ylabel('Count')
    ax2.tick_params(axis='x', rotation=45)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Class distribution plot saved to {output_path}")

def main(args):
    # Set device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}\n")
    
    # Load label mapping
    label_map_df = pd.read_csv(f'{args.data_dir}/label_map.csv')
    label_names = label_map_df.sort_values('label_id')['talk_type'].values
    num_labels = len(label_names)
    
    print(f"Label mapping:")
    print(label_map_df)
    print()
    
    # Load model and tokenizer
    print(f"Loading model from {args.model_path}...")
    tokenizer = BertTokenizer.from_pretrained(args.model_path)
    model = BertForSequenceClassification.from_pretrained(args.model_path)
    model.to(device)
    
    # Load test data
    print(f"Loading test data from {args.data_dir}/test.csv...")
    test_df = pd.read_csv(f'{args.data_dir}/test.csv')
    
    # Create dataset and dataloader
    test_dataset = AnnoMIDataset(
        test_df['text'].values,
        test_df['label'].values,
        tokenizer,
        max_length=args.max_length
    )
    
    test_dataloader = DataLoader(
        test_dataset,
        batch_size=args.batch_size
    )
    
    # Evaluate
    print("\nEvaluating model...")
    predictions, probabilities, true_labels = evaluate_model(model, test_dataloader, device)
    
    # Calculate metrics
    accuracy = accuracy_score(true_labels, predictions)
    precision, recall, f1, support = precision_recall_fscore_support(
        true_labels, predictions, average=None
    )
    macro_precision, macro_recall, macro_f1, _ = precision_recall_fscore_support(
        true_labels, predictions, average='macro'
    )
    
    # Print results
    print("\n" + "="*70)
    print("EVALUATION RESULTS")
    print("="*70)
    print(f"\nOverall Accuracy: {accuracy:.4f}")
    print(f"Macro Precision: {macro_precision:.4f}")
    print(f"Macro Recall: {macro_recall:.4f}")
    print(f"Macro F1-Score: {macro_f1:.4f}")
    
    print(f"\nPer-class metrics:")
    print("-"*70)
    for i, label in enumerate(label_names):
        print(f"{label:20s} | Precision: {precision[i]:.4f} | Recall: {recall[i]:.4f} | F1: {f1[i]:.4f} | Support: {support[i]}")
    
    # Classification report
    print(f"\n\nDetailed Classification Report:")
    print("-"*70)
    print(classification_report(true_labels, predictions, target_names=label_names))
    
    # Confusion matrix
    cm = confusion_matrix(true_labels, predictions)
    print(f"\nConfusion Matrix:")
    print(cm)
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Save results
    results = {
        'accuracy': float(accuracy),
        'macro_precision': float(macro_precision),
        'macro_recall': float(macro_recall),
        'macro_f1': float(macro_f1),
        'per_class_metrics': {
            label: {
                'precision': float(precision[i]),
                'recall': float(recall[i]),
                'f1': float(f1[i]),
                'support': int(support[i])
            }
            for i, label in enumerate(label_names)
        },
        'confusion_matrix': cm.tolist(),
        'label_names': label_names.tolist()
    }
    
    with open(f'{args.output_dir}/evaluation_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\nResults saved to {args.output_dir}/evaluation_results.json")
    
    # Save predictions with probabilities
    test_results_df = test_df.copy()
    test_results_df['predicted_label'] = predictions
    test_results_df['predicted_talk_type'] = [label_names[p] for p in predictions]
    test_results_df['correct'] = (predictions == true_labels)
    
    # Add probability columns
    for i, label in enumerate(label_names):
        test_results_df[f'prob_{label}'] = probabilities[:, i]
    
    test_results_df.to_csv(f'{args.output_dir}/detailed_predictions.csv', index=False)
    print(f"Detailed predictions saved to {args.output_dir}/detailed_predictions.csv")
    
    # Generate plots
    print("\nGenerating visualizations...")
    plot_confusion_matrix(cm, label_names, f'{args.output_dir}/confusion_matrix.png')
    plot_class_distribution(true_labels, predictions, label_names, f'{args.output_dir}/class_distribution.png')
    
    # Error analysis
    print("\n" + "="*70)
    print("ERROR ANALYSIS")
    print("="*70)
    
    errors_df = test_results_df[~test_results_df['correct']]
    print(f"\nTotal errors: {len(errors_df)} / {len(test_results_df)} ({len(errors_df)/len(test_results_df)*100:.2f}%)")
    
    if len(errors_df) > 0:
        print("\nError breakdown by true label:")
        error_by_label = errors_df.groupby('client_talk_type').size()
        for label, count in error_by_label.items():
            total = len(test_results_df[test_results_df['client_talk_type'] == label])
            print(f"  {label}: {count} / {total} ({count/total*100:.2f}%)")
        
        print("\nSample of misclassified examples:")
        print("-"*70)
        for idx, row in errors_df.head(10).iterrows():
            print(f"\nText: {row['text'][:100]}...")
            print(f"True: {row['client_talk_type']} | Predicted: {row['predicted_talk_type']}")
            # Fix: Extract column name first to avoid nested f-string issues
            prob_col = f"prob_{row['predicted_talk_type']}"
            confidence = row[prob_col] * 100
            print(f"Confidence: {confidence:.2f}%")

    print("\n" + "="*70)
    print("Evaluation complete!")
    print("="*70)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate BERT model on AnnoMI dataset")
    
    parser.add_argument('--model_path', type=str, default='./output/best_model',
                        help='Path to trained model')
    parser.add_argument('--data_dir', type=str, default='./processed_data',
                        help='Directory containing processed data')
    parser.add_argument('--output_dir', type=str, default='./evaluation',
                        help='Directory to save evaluation results')
    parser.add_argument('--max_length', type=int, default=128,
                        help='Maximum sequence length')
    parser.add_argument('--batch_size', type=int, default=16,
                        help='Batch size for evaluation')
    
    args = parser.parse_args()
    
    main(args)

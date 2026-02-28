"""
BERT-based training script for AnnoMI client talk type classification
"""

import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from transformers import BertTokenizer, BertForSequenceClassification, AdamW, get_linear_schedule_with_warmup
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, classification_report, confusion_matrix
from tqdm import tqdm
import argparse
import os
import json
import random

# Set random seeds for reproducibility
def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

class AnnoMIDataset(Dataset):
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

def load_data(data_dir):
    """Load train, val, and test datasets"""
    train_df = pd.read_csv(f'{data_dir}/train.csv')
    val_df = pd.read_csv(f'{data_dir}/val.csv')
    test_df = pd.read_csv(f'{data_dir}/test.csv')
    label_map_df = pd.read_csv(f'{data_dir}/label_map.csv')
    
    return train_df, val_df, test_df, label_map_df

def train_epoch(model, dataloader, optimizer, scheduler, device):
    """Train for one epoch"""
    model.train()
    total_loss = 0
    predictions = []
    true_labels = []
    
    progress_bar = tqdm(dataloader, desc='Training')
    
    for batch in progress_bar:
        optimizer.zero_grad()
        
        input_ids = batch['input_ids'].to(device)
        attention_mask = batch['attention_mask'].to(device)
        labels = batch['labels'].to(device)
        
        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            labels=labels
        )
        
        loss = outputs.loss
        logits = outputs.logits
        
        total_loss += loss.item()
        
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
        
        preds = torch.argmax(logits, dim=1).cpu().numpy()
        predictions.extend(preds)
        true_labels.extend(labels.cpu().numpy())
        
        progress_bar.set_postfix({'loss': f'{loss.item():.4f}'})
    
    avg_loss = total_loss / len(dataloader)
    accuracy = accuracy_score(true_labels, predictions)
    
    return avg_loss, accuracy

def evaluate(model, dataloader, device):
    """Evaluate the model"""
    model.eval()
    total_loss = 0
    predictions = []
    true_labels = []
    
    with torch.no_grad():
        for batch in tqdm(dataloader, desc='Evaluating'):
            input_ids = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            labels = batch['labels'].to(device)
            
            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels
            )
            
            loss = outputs.loss
            logits = outputs.logits
            
            total_loss += loss.item()
            
            preds = torch.argmax(logits, dim=1).cpu().numpy()
            predictions.extend(preds)
            true_labels.extend(labels.cpu().numpy())
    
    avg_loss = total_loss / len(dataloader)
    accuracy = accuracy_score(true_labels, predictions)
    precision, recall, f1, _ = precision_recall_fscore_support(
        true_labels, predictions, average='macro'
    )
    
    return avg_loss, accuracy, precision, recall, f1, predictions, true_labels

def main(args):
    # Set seed
    set_seed(args.seed)
    
    # Set device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Load data
    print("\nLoading data...")
    train_df, val_df, test_df, label_map_df = load_data(args.data_dir)
    
    num_labels = len(label_map_df)
    print(f"Number of classes: {num_labels}")
    print(f"Label mapping:\n{label_map_df}")
    
    # Initialize tokenizer and model
    print(f"\nInitializing {args.model_name}...")
    tokenizer = BertTokenizer.from_pretrained(args.model_name)
    model = BertForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=num_labels
    )
    model.to(device)
    
    # Create datasets
    train_dataset = AnnoMIDataset(
        train_df['text'].values,
        train_df['label'].values,
        tokenizer,
        max_length=args.max_length
    )
    
    val_dataset = AnnoMIDataset(
        val_df['text'].values,
        val_df['label'].values,
        tokenizer,
        max_length=args.max_length
    )
    
    test_dataset = AnnoMIDataset(
        test_df['text'].values,
        test_df['label'].values,
        tokenizer,
        max_length=args.max_length
    )
    
    # Create dataloaders
    train_dataloader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True
    )
    
    val_dataloader = DataLoader(
        val_dataset,
        batch_size=args.batch_size
    )
    
    test_dataloader = DataLoader(
        test_dataset,
        batch_size=args.batch_size
    )
    
    # Setup optimizer and scheduler
    optimizer = AdamW(model.parameters(), lr=args.learning_rate, eps=1e-8)
    
    total_steps = len(train_dataloader) * args.epochs
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=0,
        num_training_steps=total_steps
    )
    
    # Training loop
    print(f"\n{'='*50}")
    print("Starting training...")
    print(f"{'='*50}\n")
    
    best_val_f1 = 0
    training_stats = []
    
    for epoch in range(args.epochs):
        print(f"\nEpoch {epoch + 1}/{args.epochs}")
        print("-" * 50)
        
        # Train
        train_loss, train_acc = train_epoch(
            model, train_dataloader, optimizer, scheduler, device
        )
        
        print(f"Train Loss: {train_loss:.4f} | Train Acc: {train_acc:.4f}")
        
        # Validate
        val_loss, val_acc, val_prec, val_rec, val_f1, _, _ = evaluate(
            model, val_dataloader, device
        )
        
        print(f"Val Loss: {val_loss:.4f} | Val Acc: {val_acc:.4f}")
        print(f"Val Precision: {val_prec:.4f} | Val Recall: {val_rec:.4f} | Val F1: {val_f1:.4f}")
        
        # Save stats
        training_stats.append({
            'epoch': epoch + 1,
            'train_loss': train_loss,
            'train_acc': train_acc,
            'val_loss': val_loss,
            'val_acc': val_acc,
            'val_precision': val_prec,
            'val_recall': val_rec,
            'val_f1': val_f1
        })
        
        # Save best model
        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            print(f"New best F1! Saving model...")
            model.save_pretrained(f'{args.output_dir}/best_model')
            tokenizer.save_pretrained(f'{args.output_dir}/best_model')
    
    # Save training stats
    stats_df = pd.DataFrame(training_stats)
    stats_df.to_csv(f'{args.output_dir}/training_stats.csv', index=False)
    
    # Test on best model
    print(f"\n{'='*50}")
    print("Testing on best model...")
    print(f"{'='*50}\n")
    
    # Load best model
    model = BertForSequenceClassification.from_pretrained(
        f'{args.output_dir}/best_model'
    )
    model.to(device)
    
    test_loss, test_acc, test_prec, test_rec, test_f1, test_preds, test_labels = evaluate(
        model, test_dataloader, device
    )
    
    print(f"Test Loss: {test_loss:.4f}")
    print(f"Test Accuracy: {test_acc:.4f}")
    print(f"Test Precision: {test_prec:.4f}")
    print(f"Test Recall: {test_rec:.4f}")
    print(f"Test F1: {test_f1:.4f}")
    
    # Classification report
    label_names = label_map_df.sort_values('label_id')['talk_type'].values
    print(f"\nClassification Report:")
    print(classification_report(test_labels, test_preds, target_names=label_names))
    
    # Confusion matrix
    print(f"\nConfusion Matrix:")
    cm = confusion_matrix(test_labels, test_preds)
    print(cm)
    
    # Save results
    results = {
        'test_loss': float(test_loss),
        'test_accuracy': float(test_acc),
        'test_precision': float(test_prec),
        'test_recall': float(test_rec),
        'test_f1': float(test_f1),
        'confusion_matrix': cm.tolist(),
        'label_names': label_names.tolist()
    }
    
    with open(f'{args.output_dir}/test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    # Save predictions
    test_results_df = test_df.copy()
    test_results_df['predicted_label'] = test_preds
    test_results_df['predicted_talk_type'] = [label_names[p] for p in test_preds]
    test_results_df.to_csv(f'{args.output_dir}/test_predictions.csv', index=False)
    
    print(f"\nAll results saved to {args.output_dir}/")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train BERT for AnnoMI client talk type classification")
    
    # Data arguments
    parser.add_argument('--data_dir', type=str, default='./processed_data',
                        help='Directory containing processed data')
    parser.add_argument('--output_dir', type=str, default='./output',
                        help='Directory to save model and results')
    
    # Model arguments
    parser.add_argument('--model_name', type=str, default='bert-base-uncased',
                        help='Pretrained model name')
    parser.add_argument('--max_length', type=int, default=128,
                        help='Maximum sequence length')
    
    # Training arguments
    parser.add_argument('--batch_size', type=int, default=16,
                        help='Batch size for training')
    parser.add_argument('--epochs', type=int, default=5,
                        help='Number of training epochs')
    parser.add_argument('--learning_rate', type=float, default=2e-5,
                        help='Learning rate')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed')
    
    args = parser.parse_args()
    
    main(args)


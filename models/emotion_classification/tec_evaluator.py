
import pandas as pd
import numpy as np
from transformers import pipeline
import torch
from tqdm import tqdm
from langdetect import detect, LangDetectException
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, classification_report, confusion_matrix
from datasets import Dataset
import matplotlib.pyplot as plt
import seaborn as sns
import os
import warnings

# Suppress warnings
warnings.filterwarnings('ignore')

# Enable tqdm for pandas
tqdm.pandas()

def read_tweets(filepath):
    """Read the tweets file using pandas."""
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")
        
    print(f"Reading dataset from: {filepath}")
    data = []
    
    with open(filepath, 'r', encoding='utf-8') as file:
        for line in file:
            parts = line.strip().split('\t')
            
            if len(parts) >= 3:
                # Format: ID \t Text \t Emotion
                tweet_id = parts[0].strip(':')
                # Join middle parts in case text contains tabs
                tweet_text = '\t'.join(parts[1:-1]).strip()
                emotion = parts[-1].strip(':').strip()
                
                data.append({
                    'id': tweet_id,
                    'text': tweet_text,
                    'emotion': emotion
                })
                
    df = pd.DataFrame(data)
    print(f"Loaded {len(df)} tweets")
    return df

def is_english(text):
    """Check if text is in English using langdetect."""
    try:
        return detect(text) == 'en'
    except LangDetectException:
        return False

def process_data(df):
    """Filter for English tweets and valid emotions."""
    # 1. Filter English
    print("\nDetecting language for each tweet...")
    df['is_english'] = df['text'].progress_apply(is_english)
    
    df_english = df[df['is_english']].copy()
    print(f"English tweets: {len(df_english)} ({len(df_english)/len(df)*100:.1f}%)")
    
    # 2. Filter Valid Emotions
    valid_emotions = ['anger', 'disgust', 'fear', 'joy', 'sadness', 'surprise']
    print(f"Valid emotions: {valid_emotions}")
    
    df_filtered = df_english[df_english['emotion'].isin(valid_emotions)].copy()
    df_filtered = df_filtered.reset_index(drop=True)
    
    print(f"Tweets with valid emotions: {len(df_filtered)}")
    print("Emotion distribution:")
    print(df_filtered['emotion'].value_counts())
    
    return df_filtered

def initialize_model(model_name="j-hartmann/emotion-english-roberta-large"):
    """Initialize model."""
    device = 0 if torch.cuda.is_available() else -1
    print(f"\nUsing device: {'GPU' if device == 0 else 'CPU'}")
    
    print(f"Loading {model_name}...")
    classifier = pipeline(
        "text-classification",
        model=model_name,
        device=device
    )
    print("Model loaded!")
    return classifier

def run_predictions(classifier, df):
    """Run predictions using list processing which pipeline handles efficiently."""
    print(f"\nProcessing {len(df)} tweets with optimized batching...")
    
    # Convert texts to list
    texts = df['text'].tolist()
    
    # Pass list to pipeline with batch_size
    predictions = classifier(texts, batch_size=32, truncation=True, max_length=512)
    
    print("Predictions complete!")
    
    df['predicted_emotion'] = [pred['label'] for pred in predictions]
    df['predicted_score'] = [pred['score'] for pred in predictions]
    
    return df

def evaluate_performance(df, save_plot=True):
    """Evaluate and show metrics."""
    y_true = df['emotion'].values
    y_pred = df['predicted_emotion'].values
    
    accuracy = accuracy_score(y_true, y_pred)
    print(f"\nOverall Accuracy: {accuracy:.4f} ({accuracy*100:.2f}%)")
    
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average='weighted', zero_division=0
    )
    print(f"Weighted Metrics: P={precision:.4f}, R={recall:.4f}, F1={f1:.4f}")
    
    print("\nDetailed Classification Report:")
    print(classification_report(y_true, y_pred, zero_division=0))
    
    # Confusion Matrix
    cm = confusion_matrix(y_true, y_pred)
    labels = sorted(list(set(y_true) | set(y_pred)))
    
    if save_plot:
        plt.figure(figsize=(10, 8))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                    xticklabels=labels, yticklabels=labels)
        plt.title('Confusion Matrix - TEC')
        plt.ylabel('True Label')
        plt.xlabel('Predicted Label')
        plt.tight_layout()
        plt.savefig('tec_confusion_matrix.png')
        print("\nConfusion matrix saved to tec_confusion_matrix.png")

def main():
    filepath = r"Jan9-2012-tweets-clean.txt"
    
    try:
        # 1. Read
        df = read_tweets(filepath)
        
        # 2. Process
        df = process_data(df)
        
        # 3. Model
        classifier = initialize_model()
        
        # 4. Predict
        df = run_predictions(classifier, df)
        
        # 5. Evaluate
        evaluate_performance(df)
        
        # Save
        df.to_csv("tec_predictions.csv", index=False)
        print("Predictions saved to tec_predictions.csv")
        
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("Please check that 'Jan9-2012-tweets-clean.txt' exists.")

if __name__ == "__main__":
    main()

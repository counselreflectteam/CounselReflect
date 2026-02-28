
import pandas as pd
import numpy as np
import torch
import re
from transformers import pipeline
from datasets import Dataset
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support
import matplotlib.pyplot as plt
import seaborn as sns
from tqdm import tqdm
import os
import warnings

# Suppress warnings
warnings.filterwarnings('ignore')

# Enable tqdm for pandas
tqdm.pandas()

def load_and_parse_data(file_path):
    """Load and parse the Stimulus No Cause dataset."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset file not found at {file_path}")
        
    print(f"Loading dataset from {file_path}...")
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    print(f"Total lines loaded: {len(lines)}")
    
    # Emotion mapping: Stimulus -> RoBERTa
    emotion_map = {
        'happy': 'joy',
        'sad': 'sadness',
        'anger': 'anger',
        'fear': 'fear',
        'surprise': 'surprise',
        'disgust': 'disgust',
        # 'shame' is in dataset but not in RoBERTa targets usually, unless mapped to something else.
        # Based on notebook, shame is likely skipped as it's not in the map below.
    }
    
    target_emotions = ['anger', 'disgust', 'fear', 'joy', 'sadness', 'surprise']
    
    data_list = []
    skipped_count = 0
    
    for line in tqdm(lines, desc="Parsing sentences"):
        line = line.strip()
        if not line:
            continue
            
        # Regex to find tags like <happy>...</happy> or <\happy>
        # Note: The notebook showed closing tag as <\happy>
        pattern = r'<(\w+)>(.+?)<\\\1>'
        match = re.search(pattern, line)
        
        if match:
            emotion_tag = match.group(1).lower()
            text = match.group(2).strip()
            
            # Map to RoBERTa
            if emotion_tag in emotion_map:
                emotion_label = emotion_map[emotion_tag]
                if emotion_label in target_emotions:
                    data_list.append({
                        'text': text,
                        'emotion': emotion_label,
                        'original_emotion': emotion_tag
                    })
                else:
                    skipped_count += 1
            else:
                skipped_count += 1
        else:
            skipped_count += 1
            
    df = pd.DataFrame(data_list)
    print(f"\nTotal sentences parsed: {len(df)}")
    print(f"Sentences skipped: {skipped_count}")
    print("\nEmotion distribution:")
    print(df['emotion'].value_counts())
    
    return df

def initialize_model(model_name="j-hartmann/emotion-english-roberta-large"):
    """Initialize the Hugging Face emotion classification pipeline."""
    # Check if GPU is available
    device = 0 if torch.cuda.is_available() else -1
    print(f"\nUsing device: {'GPU' if device == 0 else 'CPU'}")
    
    print(f"Loading {model_name}...")
    classifier = pipeline(
        "text-classification",
        model=model_name,
        device=device
    )
    print("Model loaded successfully!")
    return classifier

def run_predictions(classifier, df):
    """Run predictions w/ optimization."""
    print(f"\nProcessing {len(df)} sentences...")
    print("Using Hugging Face Dataset for optimized GPU processing")
    
    dataset = Dataset.from_pandas(df[['text']])
    
    def classify_emotions(batch):
        results = classifier(batch['text'], truncation=True, max_length=512)
        return {
            'predicted_emotion': [r['label'] for r in results],
            'predicted_score': [r['score'] for r in results]
        }
        
    dataset_with_predictions = dataset.map(
        classify_emotions,
        batched=True,
        batch_size=32,
        desc="Running predictions"
    )
    
    df['predicted_emotion'] = dataset_with_predictions['predicted_emotion']
    df['predicted_score'] = dataset_with_predictions['predicted_score']
    print("Predictions complete!")
    return df

def evaluate_performance(df, save_plot=True):
    """Calculate and visualize metrics."""
    y_true = df['emotion'].values
    y_pred = df['predicted_emotion'].values
    
    accuracy = accuracy_score(y_true, y_pred)
    print(f"\nOverall Accuracy: {accuracy:.4f} ({accuracy*100:.2f}%)")
    
    # Weighted metrics
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
        plt.title('Confusion Matrix - Stimulus')
        plt.ylabel('True Label')
        plt.xlabel('Predicted Label')
        plt.tight_layout()
        plt.savefig('stimulus_confusion_matrix.png')
        print("\nConfusion matrix saved to stimulus_confusion_matrix.png")

def main():
    dataset_path = 'stimulus/No Cause.txt'
    
    try:
        # 1. Load Data
        df = load_and_parse_data(dataset_path)
        
        # 2. Initialize Model
        classifier = initialize_model()
        
        # 3. Predict
        df = run_predictions(classifier, df)
        
        # 4. Evaluate
        evaluate_performance(df)
        
        # Save predictions
        df.to_csv('stimulus_predictions.csv', index=False)
        print("Predictions saved to stimulus_predictions.csv")
        
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("Please check that 'stimulus/No Cause.txt' exists.")

if __name__ == "__main__":
    main()

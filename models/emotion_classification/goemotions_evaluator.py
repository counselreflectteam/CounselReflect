
import pandas as pd
import numpy as np
import torch
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

def load_labels(file_path):
    """Load emotion labels from file."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Labels file not found at {file_path}")
        
    with open(file_path, 'r') as f:
        labels = [line.strip() for line in f.readlines()]
    print(f"Loaded {len(labels)} emotion categories from {file_path}")
    return labels

def load_and_process_data(file_path, labels, target_emotions):
    """
    Load and process the GoEmotions dataset.
    Filters for single-label samples and maps to RoBERTa target emotions.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset file not found at {file_path}")
        
    print(f"\nLoading dataset from {file_path}...")
    df_raw = pd.read_csv(file_path, sep='\t', header=None, names=['text', 'emotion_ids', 'comment_id'])
    print(f"Total samples loaded: {len(df_raw)}")
    
    # Mapping from GoEmotions to RoBERTa labels
    emotion_mapping = {
        'anger': 'anger',
        'disgust': 'disgust',
        'fear': 'fear',
        'joy': 'joy',
        'sadness': 'sadness',
        'surprise': 'surprise',
        'neutral': 'neutral'
    }
    
    print("\nEmotion mapping:")
    for target in target_emotions:
        print(f"{target.upper()}: {target}")
        
    # Process data
    data_list = []
    skipped_stats = {
        'multi_label': 0,
        'no_mapping': 0,
        'empty': 0
    }
    
    for idx, row in tqdm(df_raw.iterrows(), total=len(df_raw), desc="Processing samples"):
        emotion_ids_str = str(row['emotion_ids'])
        
        # Parse emotion IDs
        emotion_ids = [int(x.strip()) for x in emotion_ids_str.split(',') if x.strip().isdigit()]
        
        if len(emotion_ids) == 0:
            skipped_stats['empty'] += 1
            continue
            
        # Filter: Single-label only
        if len(emotion_ids) > 1:
            skipped_stats['multi_label'] += 1
            continue
            
        # Get original label
        original_emotion = labels[emotion_ids[0]]
        
        # Map to RoBERTa emotion
        mapped_emotion = emotion_mapping.get(original_emotion)
        
        # Filter: Must map to target emotions
        if not mapped_emotion or mapped_emotion not in target_emotions:
            skipped_stats['no_mapping'] += 1
            continue
            
        data_list.append({
            'text': row['text'],
            'emotion': mapped_emotion,
            'original_emotion': original_emotion,
            'comment_id': row['comment_id']
        })
        
    df = pd.DataFrame(data_list)
    print(f"\nTotal single-label samples kept: {len(df)}")
    print(f"Skipped: Multi-label={skipped_stats['multi_label']}, No Mapping={skipped_stats['no_mapping']}, Empty={skipped_stats['empty']}")
    
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
    """Run predictions using dataset optimization."""
    print(f"\nProcessing {len(df)} samples...")
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
    """Calculate metrics and visualize."""
    y_true = df['emotion'].values
    y_pred = df['predicted_emotion'].values
    
    accuracy = accuracy_score(y_true, y_pred)
    print(f"\nOverall Accuracy: {accuracy:.4f} ({accuracy*100:.2f}%)")
    
    # Weighted metrics
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average='weighted', zero_division=0
    )
    print(f"Weighted Metrics: P={precision:.4f}, R={recall:.4f}, F1={f1:.4f}")
    
    # Detailed report
    print("\nDetailed Classification Report:")
    print(classification_report(y_true, y_pred, zero_division=0))
    
    # Confusion Matrix
    cm = confusion_matrix(y_true, y_pred)
    labels = sorted(list(set(y_true) | set(y_pred)))
    
    if save_plot:
        plt.figure(figsize=(10, 8))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                    xticklabels=labels, yticklabels=labels)
        plt.title('Confusion Matrix - GoEmotions')
        plt.ylabel('True Label')
        plt.xlabel('Predicted Label')
        plt.tight_layout()
        plt.savefig('goemotions_confusion_matrix.png')
        print("\nConfusion matrix saved to goemotions_confusion_matrix.png")

def main():
    # Paths
    labels_path = 'GoEmotions/data/emotions.txt'
    dataset_path = 'GoEmotions/data/test.tsv'
    
    # Target emotions for RoBERTa
    target_emotions = ['anger', 'disgust', 'fear', 'joy', 'neutral', 'sadness', 'surprise']
    
    try:
        # 1. Load labels
        labels = load_labels(labels_path)
        
        # 2. Load and process data
        df = load_and_process_data(dataset_path, labels, target_emotions)
        
        # 3. Initialize model
        classifier = initialize_model()
        
        # 4. Run predictions
        df = run_predictions(classifier, df)
        
        # 5. Evaluate
        evaluate_performance(df)
        
        # Save output
        df.to_csv('goemotions_predictions.csv', index=False)
        print("Predictions saved to goemotions_predictions.csv")
        
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("Please check that the GoEmotions data files exist.")

if __name__ == "__main__":
    main()


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

def load_and_process_data(file_path):
    """
    Load and process the Daily Dialog dataset.
    Parses the custom format with single quotes separating utterances.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset file found at {file_path}")
        
    print(f"Loading dataset from {file_path}...")
    df = pd.read_csv(file_path)
    
    print(f"Total dialogs loaded: {len(df)}")
    
    # Emotion mapping from Daily Dialog to RoBERTa labels
    # Daily Dialog: 0=neutral, 1=anger, 2=disgust, 3=fear, 4=joy, 5=sadness, 6=surprise
    emotion_map = {
        0: 'neutral',
        1: 'anger',
        2: 'disgust',
        3: 'fear',
        4: 'joy',
        5: 'sadness',
        6: 'surprise'
    }
    
    # Target emotions that match RoBERTa model
    target_emotions = ['anger', 'disgust', 'fear', 'joy', 'neutral', 'sadness', 'surprise']
    
    # Parse the data and create individual samples
    # Use regex to extract all quoted strings - handles both single and double quotes
    dialog_pattern = r"'(.*?)'|\"(.*?)\""
    data_list = []
    
    print("Processing dialogs...")
    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Parsing"):
        try:
            # Use regex to extract all quoted strings. This works regardless of commas or spacing.
            dialog_str = row['dialog']
            matches = re.findall(dialog_pattern, dialog_str)
            # re.findall returns tuples because of groups; extract the non-empty match
            utterances = [m[0] if m[0] else m[1] for m in matches if m[0] or m[1]]
            
            # Parse emotions - format is like "[0 6 0 0 ...]"
            emotion_str = str(row['emotion']).strip('[]').replace(',', ' ')
            emotions = [int(x) for x in emotion_str.split()]
            
            # Validate counts match
            if len(utterances) != len(emotions):
                # Skip rows with mismatched counts
                continue
            
            # Create a sample for each utterance
            for utterance, emotion_id in zip(utterances, emotions):
                if utterance: # Skip empty utterances
                    emotion_label = emotion_map.get(emotion_id, 'neutral')
                    if emotion_label in target_emotions:
                        data_list.append({
                            'text': utterance,
                            'emotion': emotion_label
                        })
                        
        except Exception as e:
            print(f"Error processing row {idx}: {e}")
            continue
            
    df_processed = pd.DataFrame(data_list)
    print(f"Total utterances extracted: {len(df_processed)}")
    print("\nEmotion distribution:")
    print(df_processed['emotion'].value_counts())
    
    return df_processed

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
    """Run predictions using the classifier on the dataframe using Datasets for speed."""
    print(f"Processing {len(df)} utterances...")
    print("Using Hugging Face Dataset for optimized GPU processing\n")
    
    # Create a Hugging Face Dataset from the dataframe
    dataset = Dataset.from_pandas(df[['text']])
    
    # Define a function to process the dataset
    def classify_emotions(batch):
        # The pipeline will handle batching internally
        results = classifier(batch['text'], truncation=True, max_length=512)
        return {
            'predicted_emotion': [r['label'] for r in results],
            'predicted_score': [r['score'] for r in results]
        }
        
    # Process the dataset with batching
    dataset_with_predictions = dataset.map(
        classify_emotions,
        batched=True,
        batch_size=32,
        desc="Running predictions"
    )
    
    print("\nPredictions complete!")
    
    # Add predictions back to the original dataframe
    df['predicted_emotion'] = dataset_with_predictions['predicted_emotion']
    df['predicted_score'] = dataset_with_predictions['predicted_score']
    
    return df

def evaluate_performance(df, save_plot=True):
    """Calculate and display performance metrics."""
    y_true = df['emotion'].values
    y_pred = df['predicted_emotion'].values
    
    # Overall accuracy
    accuracy = accuracy_score(y_true, y_pred)
    print(f"\nOverall Accuracy: {accuracy:.4f} ({accuracy*100:.2f}%)")
    
    # Weighted metrics
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average='weighted', zero_division=0
    )
    print("Weighted Metrics:")
    print(f"  Precision: {precision:.4f}")
    print(f"  Recall:    {recall:.4f}")
    print(f"  F1-Score:  {f1:.4f}")
    
    # Macro-averaged metrics
    precision_macro, recall_macro, f1_macro, _ = precision_recall_fscore_support(
        y_true, y_pred, average='macro', zero_division=0
    )
    print("Macro-Averaged Metrics:")
    print(f"  Precision: {precision_macro:.4f}")
    print(f"  Recall:    {recall_macro:.4f}")
    print(f"  F1-Score:  {f1_macro:.4f}")
    
    # Detailed classification report
    print("\nDetailed Classification Report:")
    print("="*80)
    print(classification_report(y_true, y_pred, zero_division=0))
    
    # Confusion Matrix
    cm = confusion_matrix(y_true, y_pred)
    labels = sorted(list(set(y_true) | set(y_pred)))
    
    if save_plot:
        plt.figure(figsize=(10, 8))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                    xticklabels=labels, yticklabels=labels)
        plt.title('Confusion Matrix - Daily Dialog')
        plt.ylabel('True Label')
        plt.xlabel('Predicted Label')
        plt.tight_layout()
        plt.savefig('daily_dialog_confusion_matrix.png')
        print("\nConfusion matrix saved to daily_dialog_confusion_matrix.png")

def main():
    # Construct absolute path to dataset if possible, or assume relative
    dataset_path = 'Daily Dialog/test.csv'
    
    # 1. Load and prepare data
    try:
        df = load_and_process_data(dataset_path)
    except FileNotFoundError as e:
        print(e)
        print("Please ensure 'Daily Dialog/test.csv' exists relative to this script.")
        return

    # 2. Add text length statistics
    df['text_length'] = df['text'].str.len()
    print("\nText length statistics:")
    print(df['text_length'].describe())
    
    # 3. Initialize Model
    classifier = initialize_model()
    
    # 4. Run Predictions
    df = run_predictions(classifier, df)
    
    # 5. Evaluate
    evaluate_performance(df)
    
    # Save results
    df.to_csv("daily_dialog_predictions.csv", index=False)
    print("Predictions saved to daily_dialog_predictions.csv")

if __name__ == "__main__":
    main()

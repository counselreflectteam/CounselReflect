import json
import numpy as np
import os
import argparse
from sklearn.metrics import classification_report, confusion_matrix
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer
from datasets import Dataset

def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate Emotional Support Strategy Classifier")
    parser.add_argument("--model_path", type=str, required=True, help="Path to the trained model directory")
    parser.add_argument("--data_path", type=str, required=True, help="Path to the test data (jsonl file)")
    parser.add_argument("--output_dir", type=str, default="./eval_results", help="Directory to save evaluation results")
    return parser.parse_args()

# 2. Load Test Data
def load_data(file_path):
    texts = []
    labels = []
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Data file not found: {file_path}")

    with open(file_path, 'r') as f:
        for line in f:
            data = json.loads(line)
            for turn in data['dialog']:
                if turn['speaker'] == 'sys' and 'strategy' in turn:
                    texts.append(turn['text'])
                    labels.append(turn['strategy'])
    return texts, labels

class StrategyDataset(torch.utils.data.Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels = labels

    def __getitem__(self, idx):
        item = {key: torch.tensor(val[idx]) for key, val in self.encodings.items()}
        item['labels'] = torch.tensor(self.labels[idx])
        return item

    def __len__(self):
        return len(self.labels)

def main():
    args = parse_args()
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    # 3. Load Model and Tokenizer
    print(f"Loading model from {args.model_path}...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(args.model_path)
        model = AutoModelForSequenceClassification.from_pretrained(args.model_path)
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    # Extract label mapping from model config
    id2label = model.config.id2label
    label2id = model.config.label2id
    target_names = [id2label[i] for i in sorted(id2label.keys())]
    
    print(f"Strategies found in model config: {target_names}")

    print(f"Loading test data from {args.data_path}...")
    test_texts, test_labels = load_data(args.data_path)
    
    # Encode labels
    test_enc_labels = []
    for label in test_labels:
        if label in label2id:
            test_enc_labels.append(label2id[label])
        else:
            # Handle unknown labels if necessary, for now skip or error? 
            # Assuming test data is consistent with training data.
            # Maybe warn?
            print(f"Warning: Unknown label '{label}' found in test data.")
            # For robustness, we might want to skip or map to a default, but failing is explicit.
            # Let's assume valid data for now as per original script.
            pass

    print(f"Test size: {len(test_texts)}")

    # 4. Tokenize
    print("Tokenizing...")
    test_encodings = tokenizer(test_texts, padding="max_length", truncation=True, max_length=128)

    test_dataset = StrategyDataset(test_encodings, test_enc_labels)

    # 5. Predict
    print("Predicting...")
    trainer = Trainer(model=model)
    predictions = trainer.predict(test_dataset)
    breakpoint()
    preds = np.argmax(predictions.predictions, axis=-1)

    # 6. Report
    print("\nClassification Report:")
    report = classification_report(test_enc_labels, preds, target_names=target_names)
    print(report)

    print("\nConfusion Matrix:")
    conf_matrix = confusion_matrix(test_enc_labels, preds)
    print(conf_matrix)
    
    # Save results to file
    with open(os.path.join(args.output_dir, 'classification_report.txt'), 'w') as f:
        f.write(report)
        f.write("\n\nConfusion Matrix:\n")
        f.write(str(conf_matrix))
        
    print(f"Results saved to {args.output_dir}")

if __name__ == "__main__":
    main()

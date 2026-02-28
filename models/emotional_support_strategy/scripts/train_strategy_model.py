import json
import numpy as np
import os
import argparse
from sklearn.metrics import accuracy_score, f1_score
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments, AutoConfig
from datasets import Dataset

def parse_args():
    parser = argparse.ArgumentParser(description="Train Emotional Support Strategy Classifier")
    parser.add_argument("--data_dir", type=str, default="./data", help="Directory containing train.jsonl, valid.jsonl, test.jsonl")
    parser.add_argument("--output_dir", type=str, default="./output", help="Directory to save model and results")
    parser.add_argument("--model_name", type=str, default="roberta-base", help="Pretrained model name")
    parser.add_argument("--max_length", type=int, default=128, help="Maximum sequence length")
    parser.add_argument("--batch_size", type=int, default=16, help="Training batch size")
    parser.add_argument("--learning_rate", type=float, default=5e-5, help="Learning rate")
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs")
    return parser.parse_args()

# 1. Data Loading and Preprocessing
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

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, predictions)
    f1 = f1_score(labels, predictions, average='weighted')
    return {'accuracy': acc, 'f1': f1}

def main():
    args = parse_args()
    
    # Create output directory if it doesn't exist
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"Loading data from {args.data_dir}...")
    train_texts, train_labels = load_data(os.path.join(args.data_dir, 'train.jsonl'))
    valid_texts, valid_labels = load_data(os.path.join(args.data_dir, 'valid.jsonl'))
    test_texts, test_labels = load_data(os.path.join(args.data_dir, 'test.jsonl'))

    print(f"Train size: {len(train_texts)}")
    print(f"Valid size: {len(valid_texts)}")
    print(f"Test size: {len(test_texts)}")

    # 2. Label Mapping
    unique_strategies = sorted(list(set(train_labels)))
    label2id = {label: i for i, label in enumerate(unique_strategies)}
    id2label = {i: label for label, i in label2id.items()}

    print(f"Strategies: {unique_strategies}")
    
    # Save label mapping for inference
    with open(os.path.join(args.output_dir, 'label_map.json'), 'w') as f:
        json.dump({'label2id': label2id, 'id2label': id2label}, f, indent=2)

    def encode_labels(labels):
        return [label2id[label] for label in labels]

    train_enc_labels = encode_labels(train_labels)
    valid_enc_labels = encode_labels(valid_labels)
    test_enc_labels = encode_labels(test_labels)

    # 3. Tokenization
    print(f"Tokenizing with {args.model_name}...")
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)

    def tokenize_function(texts):
        return tokenizer(texts, padding="max_length", truncation=True, max_length=args.max_length)

    train_encodings = tokenize_function(train_texts)
    valid_encodings = tokenize_function(valid_texts)
    test_encodings = tokenize_function(test_texts)

    train_dataset = StrategyDataset(train_encodings, train_enc_labels)
    valid_dataset = StrategyDataset(valid_encodings, valid_enc_labels)
    test_dataset = StrategyDataset(test_encodings, test_enc_labels)

    # 4. Model Setup
    print("Initializing model...")
    config = AutoConfig.from_pretrained(
        args.model_name, 
        num_labels=len(unique_strategies),
        id2label=id2label,
        label2id=label2id
    )
    model = AutoModelForSequenceClassification.from_pretrained(args.model_name, config=config)

    # 6. Training
    training_args = TrainingArguments(
        output_dir=os.path.join(args.output_dir, 'checkpoints'),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=64, # Keep eval batch size fixed or could be argument too
        learning_rate=args.learning_rate,
        warmup_steps=500,
        weight_decay=0.01,
        logging_dir=os.path.join(args.output_dir, 'logs'),
        logging_steps=10,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=valid_dataset,
        compute_metrics=compute_metrics,
    )

    print("Starting training...")
    trainer.train()

    # 7. Evaluation
    print("Evaluating on test set...")
    test_results = trainer.evaluate(test_dataset)
    print(test_results)
    
    # Save results
    with open(os.path.join(args.output_dir, 'test_results.json'), 'w') as f:
        json.dump(test_results, f, indent=2)

    # 8. Save Model
    print("Saving best model...")
    best_model_path = os.path.join(args.output_dir, 'best_model')
    model.save_pretrained(best_model_path)
    tokenizer.save_pretrained(best_model_path)
    print(f"Model saved to {best_model_path}")

if __name__ == "__main__":
    main()

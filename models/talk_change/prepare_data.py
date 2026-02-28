"""
Data preparation script for AnnoMI dataset
Prepares the data for BERT-based client talk type classification
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from collections import Counter
import argparse

def prepare_annomi_data(input_path, output_dir, test_size=0.15, val_size=0.15, random_state=42):
    """
    Prepare AnnoMI dataset for training
    
    Args:
        input_path: Path to AnnoMI CSV file
        output_dir: Directory to save processed data
        test_size: Proportion of data for test set
        val_size: Proportion of training data for validation set
        random_state: Random seed for reproducibility
    """
    
    print(f"Loading data from {input_path}...")
    df = pd.read_csv(input_path)
    
    print(f"Original dataset shape: {df.shape}")
    print(f"Columns: {df.columns.tolist()}")
    
    # Filter only client utterances (not therapist)
    df_client = df[df['interlocutor'] == 'client'].copy()
    print(f"\nClient utterances: {len(df_client)}")
    
    # Check talk types
    print(f"\nClient talk type distribution:")
    print(df_client['client_talk_type'].value_counts())
    
    # Remove n/a entries (therapist rows)
    df_client = df_client[df_client['client_talk_type'] != 'n/a'].copy()
    
    # Create label mapping
    talk_types = df_client['client_talk_type'].unique()
    label_map = {label: idx for idx, label in enumerate(sorted(talk_types))}
    print(f"\nLabel mapping: {label_map}")
    
    # Prepare features and labels
    df_client['text'] = df_client['utterance_text']
    df_client['label'] = df_client['client_talk_type'].map(label_map)
    
    # Select relevant columns
    df_prepared = df_client[['text', 'label', 'client_talk_type', 'transcript_id', 'utterance_id']].copy()
    df_prepared = df_prepared.dropna(subset=['text', 'label'])
    
    print(f"\nPrepared dataset shape: {df_prepared.shape}")
    print(f"Label distribution after preparation:")
    print(df_prepared['label'].value_counts())
    
    # Split into train, val, test
    # First split: separate test set
    train_val_df, test_df = train_test_split(
        df_prepared, 
        test_size=test_size, 
        random_state=random_state,
        stratify=df_prepared['label']
    )
    
    # Second split: separate validation from training
    train_df, val_df = train_test_split(
        train_val_df,
        test_size=val_size / (1 - test_size),  # Adjust for remaining data
        random_state=random_state,
        stratify=train_val_df['label']
    )
    
    print(f"\nSplit sizes:")
    print(f"Train: {len(train_df)} ({len(train_df)/len(df_prepared)*100:.1f}%)")
    print(f"Val: {len(val_df)} ({len(val_df)/len(df_prepared)*100:.1f}%)")
    print(f"Test: {len(test_df)} ({len(test_df)/len(df_prepared)*100:.1f}%)")
    
    # Save to CSV
    train_df.to_csv(f'{output_dir}/train.csv', index=False)
    val_df.to_csv(f'{output_dir}/val.csv', index=False)
    test_df.to_csv(f'{output_dir}/test.csv', index=False)
    
    # Save label mapping
    label_map_df = pd.DataFrame(list(label_map.items()), columns=['talk_type', 'label_id'])
    label_map_df.to_csv(f'{output_dir}/label_map.csv', index=False)
    
    print(f"\nData saved to {output_dir}/")
    print("Files created: train.csv, val.csv, test.csv, label_map.csv")
    
    return train_df, val_df, test_df, label_map

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare AnnoMI dataset for training")
    parser.add_argument('--input_path', type=str, default='./dataset/AnnoMI-simple.csv',
                        help='Path to AnnoMI CSV file')
    parser.add_argument('--output_dir', type=str, default='./processed_data',
                        help='Directory to save processed data')
    parser.add_argument('--test_size', type=float, default=0.15,
                        help='Proportion of data for test set')
    parser.add_argument('--val_size', type=float, default=0.15,
                        help='Proportion of training data for validation set')
    parser.add_argument('--random_state', type=int, default=42,
                        help='Random seed for reproducibility')
    
    args = parser.parse_args()
    
    prepare_annomi_data(
        args.input_path,
        args.output_dir,
        args.test_size,
        args.val_size,
        args.random_state
    )


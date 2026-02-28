"""
Dataset Splitting Script
According to the paper: 75% train, 5% validation, 20% test
"""
import pandas as pd
import numpy as np
import argparse
import os


def train_test_split_simple(df, test_size, random_state=None, shuffle=True):
    """Simple train-test split without sklearn dependency"""
    if random_state is not None:
        np.random.seed(random_state)
    
    n = len(df)
    indices = np.arange(n)
    
    if shuffle:
        np.random.shuffle(indices)
    
    n_test = int(n * test_size)
    test_indices = indices[:n_test]
    train_indices = indices[n_test:]
    
    return df.iloc[train_indices].reset_index(drop=True), df.iloc[test_indices].reset_index(drop=True)


def split_dataset(input_path, output_dir, train_ratio=0.75, val_ratio=0.05, test_ratio=0.20, seed=42):
    """
    Split dataset into train/validation/test sets
    
    Args:
        input_path: Path to the input CSV file
        output_dir: Directory to save split datasets
        train_ratio: Ratio for training set (default: 0.75)
        val_ratio: Ratio for validation set (default: 0.05)
        test_ratio: Ratio for test set (default: 0.20)
        seed: Random seed for reproducibility
    """
    # Validate ratios
    assert abs(train_ratio + val_ratio + test_ratio - 1.0) < 1e-6, \
        f"Ratios must sum to 1.0, got {train_ratio + val_ratio + test_ratio}"
    
    # Load dataset
    print(f"Loading dataset from {input_path}...")
    df = pd.read_csv(input_path)
    print(f"Total samples: {len(df)}")
    
    # Get base filename
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    
    # Set random seed for reproducibility
    np.random.seed(seed)
    
    # First split: separate test set
    train_val_df, test_df = train_test_split_simple(
        df, 
        test_size=test_ratio, 
        random_state=seed,
        shuffle=True
    )
    
    # Second split: separate validation from train
    # val_ratio_adjusted is the proportion of val in the remaining train_val set
    val_ratio_adjusted = val_ratio / (train_ratio + val_ratio)
    train_df, val_df = train_test_split_simple(
        train_val_df,
        test_size=val_ratio_adjusted,
        random_state=seed,
        shuffle=True
    )
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Save split datasets
    train_path = os.path.join(output_dir, f"{base_name}_train.csv")
    val_path = os.path.join(output_dir, f"{base_name}_val.csv")
    test_path = os.path.join(output_dir, f"{base_name}_test.csv")
    
    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    test_df.to_csv(test_path, index=False)
    
    print(f"\n✓ Dataset split complete!")
    print(f"  Train: {len(train_df)} samples ({len(train_df)/len(df)*100:.1f}%) -> {train_path}")
    print(f"  Val:   {len(val_df)} samples ({len(val_df)/len(df)*100:.1f}%) -> {val_path}")
    print(f"  Test:  {len(test_df)} samples ({len(test_df)/len(df)*100:.1f}%) -> {test_path}")
    
    return train_path, val_path, test_path


def main():
    parser = argparse.ArgumentParser(description='Split dataset into train/val/test sets')
    parser.add_argument('--input', type=str, required=True, 
                        help='Path to input CSV file')
    parser.add_argument('--output_dir', type=str, default='output/splits',
                        help='Directory to save split datasets')
    parser.add_argument('--train_ratio', type=float, default=0.75,
                        help='Training set ratio (default: 0.75)')
    parser.add_argument('--val_ratio', type=float, default=0.05,
                        help='Validation set ratio (default: 0.05)')
    parser.add_argument('--test_ratio', type=float, default=0.20,
                        help='Test set ratio (default: 0.20)')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed for reproducibility (default: 42)')
    
    args = parser.parse_args()
    
    split_dataset(
        input_path=args.input,
        output_dir=args.output_dir,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed
    )


if __name__ == '__main__':
    main()

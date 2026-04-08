#!/usr/bin/env python3
"""
Verify that the dataset splits were created correctly
"""
import pandas as pd
import os

def verify_split(base_name):
    """Verify a single dataset split"""
    splits_dir = "output/splits"
    
    train_path = os.path.join(splits_dir, f"{base_name}_train.csv")
    val_path = os.path.join(splits_dir, f"{base_name}_val.csv")
    test_path = os.path.join(splits_dir, f"{base_name}_test.csv")
    
    train_df = pd.read_csv(train_path)
    val_df = pd.read_csv(val_path)
    test_df = pd.read_csv(test_path)
    
    total = len(train_df) + len(val_df) + len(test_df)
    
    print(f"\n{base_name}:")
    print(f"  Train: {len(train_df):5d} ({len(train_df)/total*100:5.1f}%)")
    print(f"  Val:   {len(val_df):5d} ({len(val_df)/total*100:5.1f}%)")
    print(f"  Test:  {len(test_df):5d} ({len(test_df)/total*100:5.1f}%)")
    print(f"  Total: {total:5d}")
    
    # Check for required columns
    required_cols = ['seeker_post', 'response_post', 'level', 'rationale_labels']
    for col in required_cols:
        assert col in train_df.columns, f"Missing column {col} in train"
        assert col in val_df.columns, f"Missing column {col} in val"
        assert col in test_df.columns, f"Missing column {col} in test"
    
    print(f"  ✓ All required columns present")
    
    return len(train_df), len(val_df), len(test_df)

if __name__ == '__main__':
    print("=" * 60)
    print("Dataset Split Verification")
    print("=" * 60)
    
    datasets = [
        "emotional-reactions-reddit",
        "interpretations-reddit",
        "explorations-reddit"
    ]
    
    total_train = 0
    total_val = 0
    total_test = 0
    
    for dataset in datasets:
        train, val, test = verify_split(dataset)
        total_train += train
        total_val += val
        total_test += test
    
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Total Train: {total_train}")
    print(f"  Total Val:   {total_val}")
    print(f"  Total Test:  {total_test}")
    print(f"  Grand Total: {total_train + total_val + total_test}")
    print("=" * 60)
    print("✓ All dataset splits verified successfully!")

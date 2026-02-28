# Processed Data Directory

This directory will contain the preprocessed train/validation/test splits.

## How to Generate

After downloading the AnnoMI dataset (see `../dataset/README.md`), run:

```bash
python prepare_data.py \
    --input_path ./dataset/AnnoMI-simple.csv \
    --output_dir ./processed_data \
    --test_size 0.15 \
    --val_size 0.15 \
    --random_state 42
```

## Generated Files

After running `prepare_data.py`, this directory will contain:

```
processed_data/
├── .gitkeep
├── train.csv       # Training set (~70%)
├── val.csv         # Validation set (~15%)
├── test.csv        # Test set (~15%)
└── label_map.csv   # Label ID to name mapping
```

## File Descriptions

- **train.csv**: Training dataset with stratified sampling
- **val.csv**: Validation dataset for hyperparameter tuning
- **test.csv**: Test dataset for final evaluation
- **label_map.csv**: Mapping between label IDs and talk types:
  - 0 → change
  - 1 → neutral
  - 2 → sustain

## Data Split Details

- Stratified sampling ensures balanced class distribution across splits
- Random seed (default: 42) ensures reproducibility
- Test size: 15% of total data
- Validation size: 15% of total data
- Training size: 70% of total data

## Next Steps

After generating the splits, you can train the model:

```bash
python train_bert.py \
    --data_dir ./processed_data \
    --output_dir ./output
```

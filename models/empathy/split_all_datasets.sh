#!/bin/bash
# Split all three datasets according to paper specifications (75/5/20)

echo "================================================"
echo "Splitting datasets into train/val/test sets"
echo "Ratio: 75% train, 5% validation, 20% test"
echo "================================================"

# Create output directory
mkdir -p output/splits

# Split Emotional Reactions dataset
echo -e "\n[1/3] Splitting Emotional Reactions (ER) dataset..."
python3 split_dataset.py \
    --input output/emotional-reactions-reddit.csv \
    --output_dir output/splits \
    --seed 12

# Split Interpretations dataset
echo -e "\n[2/3] Splitting Interpretations (IP) dataset..."
python3 split_dataset.py \
    --input output/interpretations-reddit.csv \
    --output_dir output/splits \
    --seed 2

# Split Explorations dataset
echo -e "\n[3/3] Splitting Explorations (EX) dataset..."
python3 split_dataset.py \
    --input output/explorations-reddit.csv \
    --output_dir output/splits \
    --seed 12

echo -e "\n================================================"
echo "✓ All datasets have been split successfully!"
echo "Files saved in: output/splits/"
echo "================================================"

#!/bin/bash
# Training script with proper train/validation/test splits
# Following the paper: 75% train, 5% validation, 20% test

echo "================================================"
echo "Training Empathy Models with Validation"
echo "================================================"

# Train Emotional Reactions (ER) model
echo -e "\n[1/3] Training Emotional Reactions (ER) model..."
python3 src/train.py \
    --train_path=output/splits/emotional-reactions-reddit_train.csv \
    --dev_path=output/splits/emotional-reactions-reddit_val.csv \
    --test_path=output/splits/emotional-reactions-reddit_test.csv \
    --lr=2e-5 \
    --batch_size=32 \
    --lambda_EI=1.0 \
    --lambda_RE=0.5 \
    --do_validation \
    --do_test \
    --save_model \
    --save_model_path=output/reddit_ER.pth

# Train Interpretations (IP) model
echo -e "\n[2/3] Training Interpretations (IP) model..."
python3 src/train.py \
    --train_path=output/splits/interpretations-reddit_train.csv \
    --dev_path=output/splits/interpretations-reddit_val.csv \
    --test_path=output/splits/interpretations-reddit_test.csv \
    --lr=2e-5 \
    --batch_size=32 \
    --lambda_EI=1.0 \
    --lambda_RE=0.5 \
    --do_validation \
    --do_test \
    --save_model \
    --save_model_path=output/reddit_IP.pth

# Train Explorations (EX) model
echo -e "\n[3/3] Training Explorations (EX) model..."
python3 src/train.py \
    --train_path=output/splits/explorations-reddit_train.csv \
    --dev_path=output/splits/explorations-reddit_val.csv \
    --test_path=output/splits/explorations-reddit_test.csv \
    --lr=2e-5 \
    --batch_size=32 \
    --lambda_EI=1.0 \
    --lambda_RE=0.5 \
    --do_validation \
    --do_test \
    --save_model \
    --save_model_path=output/reddit_EX.pth

echo -e "\n================================================"
echo "✓ All models trained successfully!"
echo "================================================"
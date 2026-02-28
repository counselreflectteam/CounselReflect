#!/bin/bash


echo "================================================"
echo "Testing Models on Test Splits"
echo "================================================"
echo ""

# Test ER model
echo "📊 Testing Emotional Reactions (ER) model..."
python src/test.py \
    --input_path output/splits/emotional-reactions-reddit_test.csv \
    --output_path output/test_results_ER.csv \
    --ER_model_path output/reddit_ER.pth \
    --IP_model_path output/reddit_IP.pth \
    --EX_model_path output/reddit_EX.pth

echo ""
echo "✅ ER model tested - Results saved to: output/test_results_ER.csv"
echo ""

# Test IP model
echo "📊 Testing Interpretations (IP) model..."
python src/test.py \
    --input_path output/splits/interpretations-reddit_test.csv \
    --output_path output/test_results_IP.csv \
    --ER_model_path output/reddit_ER.pth \
    --IP_model_path output/reddit_IP.pth \
    --EX_model_path output/reddit_EX.pth

echo ""
echo "✅ IP model tested - Results saved to: output/test_results_IP.csv"
echo ""

# Test EX model
echo "📊 Testing Explorations (EX) model..."
python src/test.py \
    --input_path output/splits/explorations-reddit_test.csv \
    --output_path output/test_results_EX.csv \
    --ER_model_path output/reddit_ER.pth \
    --IP_model_path output/reddit_IP.pth \
    --EX_model_path output/reddit_EX.pth

echo ""
echo "✅ EX model tested - Results saved to: output/test_results_EX.csv"
echo ""

echo "================================================"
echo "✅ All tests complete!"
echo "================================================"
echo ""
echo "Results:"
echo "  - output/test_results_ER.csv (616 predictions)"
echo "  - output/test_results_IP.csv (616 predictions)"
echo "  - output/test_results_EX.csv (616 predictions)"
echo ""

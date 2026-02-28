"""
PAIR Local Inference Example

This script demonstrates how to use the PAIR model locally (without HuggingFace endpoint)
for offline inference or when you need to use your own trained model.
"""

import torch
import os
import sys
from typing import List, Tuple

# Add parent directory to path to import model
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from deployment.cross_scorer_model import CrossScorerModel

# Model configuration
MODEL_PATH = os.getenv("PAIR_MODEL_PATH", "../models/reflection_scorer_weight.pt")
MODEL_NAME = "roberta-base"
USE_GPU = torch.cuda.is_available()


def load_model(model_path: str = MODEL_PATH, use_gpu: bool = USE_GPU) -> CrossScorerModel:
    """
    Load PAIR model from checkpoint.

    Args:
        model_path: Path to model weights (.pt file)
        use_gpu: Whether to use GPU if available

    Returns:
        Loaded CrossScorerModel
    """
    print(f"Loading PAIR model from {model_path}...")

    # Initialize model architecture
    model = CrossScorerModel(model_name=MODEL_NAME)

    # Load trained weights
    device = torch.device("cuda" if use_gpu and torch.cuda.is_available() else "cpu")
    checkpoint = torch.load(model_path, map_location=device)
    model.load_state_dict(checkpoint)

    # Move to device and set to eval mode
    model.to(device)
    model.eval()

    print(f"✅ Model loaded successfully on {device}!")
    return model


def score_pair_local(
    model: CrossScorerModel,
    prompt: str,
    response: str,
    use_gpu: bool = USE_GPU
) -> float:
    """
    Score a single (prompt, response) pair using local model.

    Args:
        model: Loaded CrossScorerModel
        prompt: Patient utterance
        response: Therapist response
        use_gpu: Whether to use GPU

    Returns:
        Quality score [0, 1]
    """
    device = torch.device("cuda" if use_gpu and torch.cuda.is_available() else "cpu")

    with torch.no_grad():
        score = model.score_pair(prompt, response, device=device)

    return score


def score_batch_local(
    model: CrossScorerModel,
    pairs: List[Tuple[str, str]],
    use_gpu: bool = USE_GPU
) -> List[float]:
    """
    Score multiple pairs using local model.

    Args:
        model: Loaded CrossScorerModel
        pairs: List of (prompt, response) tuples
        use_gpu: Whether to use GPU

    Returns:
        List of quality scores [0, 1]
    """
    device = torch.device("cuda" if use_gpu and torch.cuda.is_available() else "cpu")

    prompts = [p[0] for p in pairs]
    responses = [p[1] for p in pairs]

    with torch.no_grad():
        scores = model.score_batch(prompts, responses, device=device)

    return scores


def interpret_score(score: float) -> str:
    """Map score to quality label."""
    if score > 0.7:
        return "Complex Reflection"
    elif score > 0.4:
        return "Simple Reflection"
    else:
        return "Non-Reflection"


def main():
    """Run local inference examples."""
    print("PAIR Local Inference Example\n" + "="*50 + "\n")

    # Check if model exists
    if not os.path.exists(MODEL_PATH):
        print(f"⚠️  Model not found at {MODEL_PATH}")
        print("   Please download model weights from HuggingFace Hub.")
        print("   See ../models/README.md for download instructions.")
        return

    # Load model
    model = load_model(MODEL_PATH, USE_GPU)
    print()

    # Example 1: Single pair
    print("Example 1: Single Pair")
    prompt1 = "I don't know if I can quit smoking."
    response1 = "You're uncertain about your ability to quit, and that's making this process feel overwhelming."

    score1 = score_pair_local(model, prompt1, response1)
    quality1 = interpret_score(score1)

    print(f"Prompt: {prompt1}")
    print(f"Response: {response1}")
    print(f"Score: {score1:.3f}")
    print(f"Quality: {quality1}")
    print()

    # Example 2: Batch processing
    print("Example 2: Batch Processing")
    test_pairs = [
        ("I've been feeling stressed.", "You feel stressed."),
        ("I'm worried about quitting.", "Quitting makes you anxious, and you're uncertain if you can handle it."),
        ("My family is pressuring me.", "Have you told them how you feel?"),
        ("I want to change.", "Part of you is committed to change.")
    ]

    scores = score_batch_local(model, test_pairs)

    for (prompt, response), score in zip(test_pairs, scores):
        quality = interpret_score(score)
        print(f"  [{score:.3f}] {quality}")
        print(f"    Prompt: {prompt}")
        print(f"    Response: {response}")
        print()

    # Example 3: Quality comparison
    print("Example 3: Compare Response Quality")
    prompt = "I'm not sure I can do this."

    responses = [
        "You're feeling uncertain, and that uncertainty is overwhelming.",  # Complex
        "You feel unsure about this.",                                      # Simple
        "Why not?"                                                          # Non-reflection
    ]

    print(f"Prompt: {prompt}\n")
    for response in responses:
        score = score_pair_local(model, prompt, response)
        quality = interpret_score(score)
        print(f"  Response: {response}")
        print(f"  Score: {score:.3f} ({quality})")
        print()


def download_model_from_hub():
    """
    Download model weights from HuggingFace Hub automatically.

    This function demonstrates automatic model download.
    """
    print("\n" + "="*50)
    print("Automatic Model Download from HuggingFace Hub\n")

    try:
        from huggingface_hub import hf_hub_download

        print("Downloading model from HuggingFace Hub...")
        model_path = hf_hub_download(
            repo_id="YOUR_REPO_ID/pair-reflection-scorer",
            filename="reflection_scorer_weight.pt",
            cache_dir="../models/"
        )

        print(f"✅ Model downloaded to: {model_path}")
        return model_path

    except ImportError:
        print("⚠️  huggingface_hub not installed.")
        print("   pip install huggingface-hub")
        return None
    except Exception as e:
        print(f"⚠️  Error downloading model: {e}")
        print("   Please download manually or check HF_TOKEN.")
        return None


def benchmark_inference_speed(model: CrossScorerModel):
    """
    Benchmark local inference speed.
    """
    import time

    print("\n" + "="*50)
    print("Inference Speed Benchmark\n")

    test_pairs = [
        ("I'm stressed.", "You feel stressed.")
    ] * 10

    # Single pair benchmark
    print("Single pair inference (10 iterations):")
    start = time.time()
    for prompt, response in test_pairs:
        _ = score_pair_local(model, prompt, response)
    single_time = time.time() - start

    print(f"  Total time: {single_time:.3f} seconds")
    print(f"  Average per pair: {single_time/len(test_pairs)*1000:.1f} ms")
    print()

    # Batch benchmark
    print("Batch inference (10 pairs):")
    start = time.time()
    _ = score_batch_local(model, test_pairs)
    batch_time = time.time() - start

    print(f"  Total time: {batch_time:.3f} seconds")
    print(f"  Average per pair: {batch_time/len(test_pairs)*1000:.1f} ms")
    print()

    speedup = single_time / batch_time
    print(f"Speedup: {speedup:.1f}x faster with batch processing")


def compare_gpu_vs_cpu():
    """
    Compare inference speed on GPU vs CPU.
    """
    if not torch.cuda.is_available():
        print("\n⚠️  GPU not available. Skipping GPU comparison.")
        return

    print("\n" + "="*50)
    print("GPU vs CPU Comparison\n")

    test_pairs = [("I'm stressed.", "You feel stressed.")] * 10

    # Load model on GPU
    print("Loading model on GPU...")
    model_gpu = load_model(MODEL_PATH, use_gpu=True)

    import time
    start = time.time()
    _ = score_batch_local(model_gpu, test_pairs, use_gpu=True)
    gpu_time = time.time() - start

    print(f"GPU time: {gpu_time:.3f} seconds")

    # Load model on CPU
    print("Loading model on CPU...")
    model_cpu = load_model(MODEL_PATH, use_gpu=False)

    start = time.time()
    _ = score_batch_local(model_cpu, test_pairs, use_gpu=False)
    cpu_time = time.time() - start

    print(f"CPU time: {cpu_time:.3f} seconds")
    print(f"Speedup: {cpu_time/gpu_time:.1f}x faster on GPU")


if __name__ == "__main__":
    # Check dependencies
    try:
        import torch
        from transformers import RobertaTokenizer, RobertaModel
    except ImportError:
        print("⚠️  Required packages not installed.")
        print("   pip install torch transformers")
        exit(1)

    # Check if model exists, offer to download
    if not os.path.exists(MODEL_PATH):
        print("Model weights not found locally.")
        print("Would you like to download from HuggingFace Hub? (requires huggingface-hub)")
        response = input("Download? (y/n): ")
        if response.lower() == 'y':
            downloaded_path = download_model_from_hub()
            if downloaded_path:
                MODEL_PATH = downloaded_path
            else:
                print("Download failed. Exiting.")
                exit(1)
        else:
            print("Please download model weights manually.")
            print("See ../models/README.md for instructions.")
            exit(1)

    # Run examples
    main()

    # Load model for benchmarks
    model = load_model(MODEL_PATH, USE_GPU)
    benchmark_inference_speed(model)
    compare_gpu_vs_cpu()

    print("\n" + "="*50)
    print("✅ All local inference examples completed!")

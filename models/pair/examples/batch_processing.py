"""
PAIR Batch Processing Example

This script demonstrates how to efficiently process multiple (prompt, response)
pairs in a single request for better performance and reduced latency.
"""

import requests
import os
import time
from typing import List, Dict, Any

# Configuration
ENDPOINT_URL = os.getenv("PAIR_ENDPOINT_URL", "https://ohl86sbu1q76u30x.us-east-1.aws.endpoints.huggingface.cloud")
HF_TOKEN = os.getenv("HF_TOKEN", "your_hf_token_here")


def score_batch(pairs: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """
    Score multiple (prompt, response) pairs in a single request.

    Args:
        pairs: List of {"prompt": str, "response": str}

    Returns:
        List of results with score, quality_label, confidence
    """
    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json"
    }

    data = {"inputs": pairs}

    response = requests.post(ENDPOINT_URL, headers=headers, json=data)
    response.raise_for_status()

    return response.json()


def main():
    """Run batch processing examples."""
    print("PAIR Batch Processing Example\n" + "="*50 + "\n")

    # Example 1: Batch of MI reflections
    print("Example 1: MI Conversation Batch\n")

    mi_pairs = [
        {
            "prompt": "I don't know if I can quit smoking.",
            "response": "You're uncertain about your ability to quit, and that's making this feel overwhelming."
        },
        {
            "prompt": "I've been feeling really stressed at work lately.",
            "response": "It sounds like work has been overwhelming for you."
        },
        {
            "prompt": "My family keeps nagging me about my drinking.",
            "response": "Their constant pressure is adding to your stress rather than helping."
        },
        {
            "prompt": "I want to change, but it's so hard.",
            "response": "Part of you is committed to change, while another part is struggling with how difficult it feels."
        },
        {
            "prompt": "I'm not sure I can do this.",
            "response": "Have you tried making a list of pros and cons?"
        }
    ]

    print(f"Processing {len(mi_pairs)} pairs in a single request...\n")

    results = score_batch(mi_pairs)

    for i, (pair, result) in enumerate(zip(mi_pairs, results), 1):
        print(f"Pair {i}:")
        print(f"  Prompt: {pair['prompt']}")
        print(f"  Response: {pair['response']}")
        print(f"  Score: {result['score']:.3f} ({result['quality_label']})")
        print()

    # Summary statistics
    print("Summary Statistics:")
    print(f"  Total pairs: {len(results)}")
    print(f"  Complex reflections: {sum(1 for r in results if r['score'] > 0.7)}")
    print(f"  Simple reflections: {sum(1 for r in results if 0.4 <= r['score'] <= 0.7)}")
    print(f"  Non-reflections: {sum(1 for r in results if r['score'] < 0.4)}")
    print(f"  Average score: {sum(r['score'] for r in results) / len(results):.3f}")
    print()


def benchmark_batch_vs_single():
    """
    Benchmark batch processing vs single requests.

    Demonstrates the efficiency gains from batching.
    """
    print("\n" + "="*50)
    print("Benchmark: Batch vs Single Requests\n")

    test_pairs = [
        {"prompt": "I'm stressed.", "response": "You feel stressed."},
        {"prompt": "I'm sad.", "response": "You're feeling sad."},
        {"prompt": "I'm angry.", "response": "You're experiencing anger."},
        {"prompt": "I'm worried.", "response": "You're feeling worried."},
        {"prompt": "I'm happy.", "response": "You're feeling happy."},
        {"prompt": "I'm confused.", "response": "You're feeling confused."},
        {"prompt": "I'm frustrated.", "response": "You're frustrated."},
        {"prompt": "I'm tired.", "response": "You feel tired."},
        {"prompt": "I'm excited.", "response": "You're excited."},
        {"prompt": "I'm hopeful.", "response": "You're feeling hopeful."}
    ]

    # Batch processing
    print(f"Batch processing {len(test_pairs)} pairs...")
    start_batch = time.time()
    results_batch = score_batch(test_pairs)
    time_batch = time.time() - start_batch

    print(f"  Time: {time_batch:.2f} seconds")
    print(f"  Average per pair: {time_batch/len(test_pairs):.3f} seconds\n")

    # Single request processing (for comparison - not recommended)
    print(f"Single request processing {len(test_pairs)} pairs...")
    start_single = time.time()
    results_single = []
    for pair in test_pairs:
        result = score_batch([pair])  # Single pair as batch of 1
        results_single.append(result[0])
    time_single = time.time() - start_single

    print(f"  Time: {time_single:.2f} seconds")
    print(f"  Average per pair: {time_single/len(test_pairs):.3f} seconds\n")

    # Comparison
    speedup = time_single / time_batch
    print(f"Speedup: {speedup:.1f}x faster with batch processing")
    print(f"Time saved: {time_single - time_batch:.2f} seconds")


def process_conversation_transcript():
    """
    Example: Process a full MI conversation transcript.

    Extracts therapist reflections and scores them.
    """
    print("\n" + "="*50)
    print("Example: Full Conversation Transcript\n")

    # Simulated MI conversation
    conversation = [
        ("Patient", "I've been thinking about quitting smoking, but I'm not sure."),
        ("Therapist", "You're considering quitting, but you have some doubts."),
        ("Patient", "Yeah, I've tried before and failed."),
        ("Therapist", "Past attempts haven't worked out, and that's making this feel harder."),
        ("Patient", "Exactly. What if I fail again?"),
        ("Therapist", "You're worried about experiencing another setback."),
        ("Patient", "My family keeps pressuring me."),
        ("Therapist", "Their pressure is adding stress rather than helping you feel supported."),
        ("Patient", "I don't know if I can do it."),
        ("Therapist", "Have you thought about nicotine replacement therapy?")
    ]

    # Extract therapist reflections with patient prompts
    pairs_to_score = []
    for i, (speaker, text) in enumerate(conversation):
        if speaker == "Therapist" and i > 0:
            # Find previous patient utterance
            for j in range(i - 1, -1, -1):
                if conversation[j][0] == "Patient":
                    pairs_to_score.append({
                        "prompt": conversation[j][1],
                        "response": text
                    })
                    break

    print(f"Found {len(pairs_to_score)} therapist reflections to score\n")

    # Score all reflections
    results = score_batch(pairs_to_score)

    # Display results
    for i, (pair, result) in enumerate(zip(pairs_to_score, results), 1):
        print(f"Reflection {i}:")
        print(f"  Patient: {pair['prompt']}")
        print(f"  Therapist: {pair['response']}")
        print(f"  Score: {result['score']:.3f} ({result['quality_label']})")
        print()

    # Overall quality assessment
    avg_score = sum(r['score'] for r in results) / len(results)
    print(f"Overall Quality Assessment:")
    print(f"  Average reflection score: {avg_score:.3f}")
    if avg_score > 0.7:
        print(f"  Assessment: Excellent MI adherence (complex reflections)")
    elif avg_score > 0.5:
        print(f"  Assessment: Good MI adherence (mostly simple reflections)")
    elif avg_score > 0.4:
        print(f"  Assessment: Moderate MI adherence (basic reflections)")
    else:
        print(f"  Assessment: Low MI adherence (needs improvement)")


def analyze_quality_distribution():
    """
    Example: Analyze quality distribution across multiple responses.
    """
    print("\n" + "="*50)
    print("Example: Quality Distribution Analysis\n")

    prompt = "I've been struggling with my weight."

    # Generate diverse responses (from training to test model discrimination)
    responses = [
        # Complex reflections
        "You're feeling overwhelmed by your weight struggles, and that's affecting how you see yourself.",
        "The weight issue represents a bigger challenge about self-control and self-image for you.",
        "Part of you wants to change, but another part is uncertain about whether you can sustain it.",

        # Simple reflections
        "You're struggling with your weight.",
        "Weight has been difficult for you.",
        "You're concerned about your weight.",

        # Non-reflections
        "Have you tried exercising more?",
        "You should see a nutritionist.",
        "How long has this been going on?"
    ]

    pairs = [{"prompt": prompt, "response": r} for r in responses]
    results = score_batch(pairs)

    # Display with quality buckets
    print("Quality Distribution:\n")
    print("Complex Reflections (>0.7):")
    for r, result in zip(responses, results):
        if result['score'] > 0.7:
            print(f"  [{result['score']:.3f}] {r}")
    print()

    print("Simple Reflections (0.4-0.7):")
    for r, result in zip(responses, results):
        if 0.4 <= result['score'] <= 0.7:
            print(f"  [{result['score']:.3f}] {r}")
    print()

    print("Non-Reflections (<0.4):")
    for r, result in zip(responses, results):
        if result['score'] < 0.4:
            print(f"  [{result['score']:.3f}] {r}")
    print()


if __name__ == "__main__":
    # Check configuration
    if HF_TOKEN == "your_hf_token_here":
        print("⚠️  Please set HF_TOKEN environment variable or update the script.")
        print("   export HF_TOKEN=hf_your_token_here")
        exit(1)

    if "YOUR-ENDPOINT" in ENDPOINT_URL:
        print("⚠️  Please set PAIR_ENDPOINT_URL environment variable or update the script.")
        print("   export PAIR_ENDPOINT_URL=https://your-endpoint.cloud")
        exit(1)

    # Run examples
    main()
    benchmark_batch_vs_single()
    process_conversation_transcript()
    analyze_quality_distribution()

    print("\n" + "="*50)
    print("✅ All batch processing examples completed!")

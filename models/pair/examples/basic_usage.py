"""
PAIR Basic Usage Example

This script demonstrates how to use the PAIR model via HuggingFace endpoint
to score individual (prompt, response) pairs for reflection quality.
"""

import requests
import os
from typing import Dict, Any

# Configuration
ENDPOINT_URL = os.getenv("PAIR_ENDPOINT_URL", "https://ohl86sbu1q76u30x.us-east-1.aws.endpoints.huggingface.cloud")
HF_TOKEN = os.getenv("HF_TOKEN", "your_hf_token_here")


def score_reflection(prompt: str, response: str) -> Dict[str, Any]:
    """
    Score a single (prompt, response) pair for reflection quality.

    Args:
        prompt: Patient utterance (context)
        response: Therapist response to score

    Returns:
        Dictionary with score, quality_label, and confidence
    """
    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json"
    }

    data = {
        "inputs": {
            "prompt": prompt,
            "response": response
        }
    }

    response_obj = requests.post(ENDPOINT_URL, headers=headers, json=data)
    response_obj.raise_for_status()

    return response_obj.json()


def main():
    """Run basic usage examples."""
    print("PAIR Basic Usage Example\n" + "="*50 + "\n")

    # Example 1: High-quality reflection (Complex)
    print("Example 1: Complex Reflection")
    prompt1 = "I don't know if I can quit smoking."
    response1 = "You're uncertain about your ability to quit, and that uncertainty is making this process feel overwhelming."

    result1 = score_reflection(prompt1, response1)

    print(f"Prompt: {prompt1}")
    print(f"Response: {response1}")
    print(f"Score: {result1['score']:.3f}")
    print(f"Quality: {result1['quality_label']}")
    print(f"Confidence: {result1['confidence']:.2f}")
    print()

    # Example 2: Medium-quality reflection (Simple)
    print("Example 2: Simple Reflection")
    prompt2 = "I've been feeling really stressed at work lately."
    response2 = "It sounds like work has been overwhelming for you."

    result2 = score_reflection(prompt2, response2)

    print(f"Prompt: {prompt2}")
    print(f"Response: {response2}")
    print(f"Score: {result2['score']:.3f}")
    print(f"Quality: {result2['quality_label']}")
    print(f"Confidence: {result2['confidence']:.2f}")
    print()

    # Example 3: Low-quality response (Non-Reflection)
    print("Example 3: Non-Reflection")
    prompt3 = "I'm not sure I can change."
    response3 = "Have you tried making a list of pros and cons?"

    result3 = score_reflection(prompt3, response3)

    print(f"Prompt: {prompt3}")
    print(f"Response: {response3}")
    print(f"Score: {result3['score']:.3f}")
    print(f"Quality: {result3['quality_label']}")
    print(f"Confidence: {result3['confidence']:.2f}")
    print()

    # Example 4: Comparing multiple responses to same prompt
    print("Example 4: Comparing Responses")
    prompt = "My family keeps nagging me about my drinking."

    responses = [
        "Your family's concern is adding to your stress rather than helping.",  # Complex
        "Your family is worried about your drinking.",                          # Simple
        "Why don't you just listen to them?"                                   # Non-reflection
    ]

    print(f"Prompt: {prompt}\n")
    for i, response in enumerate(responses, 1):
        result = score_reflection(prompt, response)
        print(f"Response {i}: {response}")
        print(f"  Score: {result['score']:.3f} ({result['quality_label']})")
        print()

    print("="*50)
    print("✅ All examples completed successfully!")


def interpret_score(score: float) -> str:
    """
    Interpret PAIR score into quality level.

    Args:
        score: Float [0, 1]

    Returns:
        Quality level description
    """
    if score > 0.7:
        return "Complex Reflection - Adds meaning, explores deeper understanding"
    elif score > 0.4:
        return "Simple Reflection - Accurate rephrasing, basic understanding"
    else:
        return "Non-Reflection - Closed question, advice, or off-topic"


def example_with_interpretation():
    """Example showing score interpretation."""
    print("\nScore Interpretation Example\n" + "="*50 + "\n")

    test_pairs = [
        ("I'm struggling with this.", "That sounds really difficult for you."),
        ("I want to quit.", "You're ready to make a change."),
        ("I don't know what to do.", "What have you tried so far?")
    ]

    for prompt, response in test_pairs:
        result = score_reflection(prompt, response)
        interpretation = interpret_score(result['score'])

        print(f"Prompt: {prompt}")
        print(f"Response: {response}")
        print(f"Score: {result['score']:.3f}")
        print(f"Interpretation: {interpretation}")
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
    example_with_interpretation()

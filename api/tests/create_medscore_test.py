"""
Test for MedScore evaluator.

Tests the medical factuality evaluation using MedScore framework.
"""
import json
import os
from pathlib import Path

# Sample medical conversation for testing
TEST_CONVERSATION = [
    {
        "speaker": "Patient",
        "text": "I'm worried about my tetanus vaccine. It expired in 2020 and I got a cut today."
    },
    {
        "speaker": "Therapist",
        "text": "Since you've had your primary tetanus shots as a child, you don't need immunoglobulin shots. Your doctor recommends getting a tetanus booster vaccine as soon as possible."
    },
    {
        "speaker": "Patient",
        "text": "Okay, that makes sense. Should I go to the ER?"
    },
    {
        "speaker": "Therapist",
        "text": "If it's been more than 5 years since your last tetanus shot and you have a dirty wound, you should get a booster. Studies show that tetanus boosters are effective for up to 10 years."
    }
]

# Expected behavior:
# - Patient turns (index 0, 2) should have empty metrics
# - Therapist turns (index 1, 3) should have medscore
# - Claims should be extracted and verified against medical corpus
# - Score should be between 0.0 and 1.0

def save_test_file():
    """Save test conversation to file."""
    test_dir = Path(__file__).parent / "medscore"
    test_dir.mkdir(exist_ok=True)
    
    test_file = test_dir / "medical_conversation_test.json"
    with open(test_file, 'w') as f:
        json.dump(TEST_CONVERSATION, f, indent=2)
    
    print(f"Test file saved to: {test_file}")
    print("\nTo test the MedScore evaluator:")
    print(f"1. Ensure MedRAG corpus is available (set MEDRAG_CORPUS env var)")
    print(f"2. Run: curl -X POST http://localhost:8000/evaluate \\")
    print(f"     -H 'Content-Type: application/json' \\")
    print(f"     -d @{test_file}")
    print(f"\nOr use the test script:")
    print(f"./tests/test_api.sh {test_file} medscore")

if __name__ == "__main__":
    save_test_file()

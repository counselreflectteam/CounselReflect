import requests
import json

# Hugging Face inference endpoint URL
ENDPOINT_URL = "https://ohl86sbu1q76u30x.us-east-1.aws.endpoints.huggingface.cloud"

# You'll need your HF token with read access to the endpoint
# Set this as an environment variable or replace with your token
import os
HF_TOKEN = os.environ.get("HF_TOKEN", "")

# Test case from the README
test_data = {
    "inputs": {
        "prompt": "I've been overwhelmed at work and can't focus.",
        "response": "It sounds like you're under a lot of pressure, and it's affecting your ability to concentrate."
    }
}

# Additional test cases
test_cases = [
    {
        "inputs": {
            "prompt": "I've been overwhelmed at work and can't focus.",
            "response": "It sounds like you're under a lot of pressure, and it's affecting your ability to concentrate."
        }
    },
    {
        "inputs": {
            "prompt": "I don't think I can quit smoking.",
            "response": "You're feeling uncertain about your ability to stop smoking."
        }
    },
    {
        "inputs": {
            "prompt": "I'm worried about my health.",
            "response": "That's completely normal. Many people worry about their health."
        }
    }
]

def test_endpoint(payload, headers):
    """Send a request to the endpoint and print the response."""
    try:
        response = requests.post(
            ENDPOINT_URL,
            headers=headers,
            json=payload,
            timeout=30
        )

        print(f"\nStatus Code: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"Success! Response: {json.dumps(result, indent=2)}")
            return True
        else:
            print(f"Error: {response.text}")
            return False

    except requests.exceptions.Timeout:
        print("Error: Request timed out")
        return False
    except Exception as e:
        print(f"Error: {str(e)}")
        return False

def main():
    print("=" * 60)
    print("Testing Hugging Face Inference Endpoint")
    print("=" * 60)
    print(f"Endpoint URL: {ENDPOINT_URL}")

    headers = {
        "Content-Type": "application/json"
    }

    # Add authorization header if token is provided
    if HF_TOKEN:
        headers["Authorization"] = f"Bearer {HF_TOKEN}"
        print("Using HF Token for authentication")
    else:
        print("Warning: No HF_TOKEN found. If endpoint requires auth, set HF_TOKEN environment variable")

    print("\n" + "=" * 60)
    print("Running test cases...")
    print("=" * 60)

    for i, test_case in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i} ---")
        print(f"Prompt: {test_case['inputs']['prompt']}")
        print(f"Response: {test_case['inputs']['response']}")

        success = test_endpoint(test_case, headers)

        if not success and i == 1:
            print("\nFirst test failed. Endpoint might not be ready or requires authentication.")
            print("Check:")
            print("1. Endpoint is running and not in 'scaled to zero' state")
            print("2. HF_TOKEN environment variable is set if endpoint requires auth")
            print("3. Token has correct permissions")
            break

if __name__ == "__main__":
    main()

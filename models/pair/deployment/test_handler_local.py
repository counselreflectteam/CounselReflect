import logging
import sys
import os

# Configure logging to see what's happening
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    logger.info("Attempting to import EndpointHandler from handler.py...")
    from handler import EndpointHandler
    logger.info("Successfully imported EndpointHandler.")
except ImportError as e:
    logger.error(f"Failed to import EndpointHandler: {e}")
    sys.exit(1)
except Exception as e:
    logger.error(f"An unexpected error occurred during import: {e}")
    sys.exit(1)

def test_inference():
    try:
        logger.info("Initializing EndpointHandler (this loads the model and weights)...")
        # Pass current directory as path
        handler = EndpointHandler(path=".")
        logger.info("Model initialized successfully.")
        
        # Test data
        inputs = [
            {
                "prompt": "I’ve been overwhelmed at work and can’t focus.",
                "response": "It sounds like you’re under a lot of pressure, and it’s affecting your ability to concentrate."
            },
            {
                "prompt": "I don't know if I can quit smoking.",
                "response": "The weather is really nice today, isn't it?"
            }
        ]
        
        logger.info(f"Running inference on {len(inputs)} samples...")
        # Call the handler as a callable with a dictionary
        results = handler({"inputs": inputs})
        
        logger.info("Inference complete. Results:")
        for i, result in enumerate(results):
            print(f"Pair {i+1}:")
            print(f"  Prompt: {inputs[i]['prompt']}")
            print(f"  Response: {inputs[i]['response']}")
            print(f"  Score: {result.get('score')}")
            print("-" * 30)
            
    except Exception as e:
        logger.error(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    test_inference()

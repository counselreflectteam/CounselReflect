import sys
import os
import json
import logging
import argparse
from typing import List, Dict, Any

# PREVENT HANGS: Force single-threaded execution for libraries that use OpenMP/MKL
# This is crucial for avoiding deadlocks when running PyTorch/FAISS in subprocesses on MacOS
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("medscore_runner")

# Add the api directory to sys.path so we can import modules
current_dir = os.path.dirname(os.path.abspath(__file__))
api_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
if api_dir not in sys.path:
    sys.path.append(api_dir)

from evaluators.lib.MedScore.medscore.medscore import MedScore
from evaluators.lib.MedScore.medscore.config_schema import MedScoreConfig, MedScoreDecomposerConfig, MedRAGVerifierConfig
from providers.registry import ProviderRegistry

def run_medscore_evaluation(
    conversation: List[Dict[str, Any]], 
    provider_name: str, 
    model_name: str, 
    api_key: str = None,
    corpus_dir: str = "./corpus"
):
    """
    Run MedScore evaluation in a separate process.
    """
    try:
        # 1. Setup Provider
        provider = ProviderRegistry.get_provider(provider_name, api_key)
        
        # 2. Setup Configuration
        config = MedScoreConfig(
            decomposer=MedScoreDecomposerConfig(
                type="medscore",
                model_name=model_name,
                server_path="",
                api_key="",
                batch_size=8,
                random_state=42
            ),
            verifier=MedRAGVerifierConfig(
                type="medrag",
                model_name=model_name,
                server_path="",
                api_key="",
                retriever_name="MedCPT",
                corpus_name="Textbooks",
                n_returned_docs=10,
                cache=False,
                db_dir=corpus_dir,
                batch_size=8,
                random_state=42
            ),
            input_file="",
            output_dir="",
            response_key="response",
            presenticized=False
        )
        
        # 3. Initialize MedScore
        logger.info(f"Initializing MedScore with {provider_name}/{model_name}")
        scorer = MedScore(config, provider=provider)
        
        # 4. Prepare Dataset
        THERAPIST_ROLES = {"therapist", "helper", "counselor", "assistant"}
        dataset = []
        utterance_to_id_map = {}
        
        for idx, utt in enumerate(conversation):
            speaker = utt.get("speaker", "").lower()
            text = utt.get("text", "").strip()
            is_therapist = speaker in THERAPIST_ROLES and bool(text)
            
            if is_therapist:
                medscore_id = f"utt_{idx}"
                dataset.append({
                    "id": medscore_id,
                    "response": text
                })
                utterance_to_id_map[medscore_id] = idx
        
        scores_per_utterance = [{"index": i, "metrics": {}} for i in range(len(conversation))]
        
        if not dataset:
            logger.warning("No therapist utterances found")
            print(json.dumps(scores_per_utterance))
            return

        # 5. Run Execution
        logger.info(f"Decomposing {len(dataset)} utterances...")
        decompositions = scorer.decompose(dataset)
        
        if not decompositions:
            logger.warning("No claims decomposed")
            print(json.dumps(scores_per_utterance))
            return

        logger.info(f"Verifying {len(decompositions)} claims...")
        verifications = scorer.verify(decompositions)
        
        # 6. Process Results
        utterance_results = {}
        for verif in verifications:
            medscore_id = verif.get("id")
            if medscore_id not in utterance_results:
                utterance_results[medscore_id] = []
            utterance_results[medscore_id].append(verif)
            
        for medscore_id, claims in utterance_results.items():
            if medscore_id in utterance_to_id_map:
                utt_idx = utterance_to_id_map[medscore_id]
                
                # Calculate aggregate score
                valid_scores = [c['score'] for c in claims if 'score' in c and c['score'] is not None]
                avg_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0.0
                
                # Format explanation
                verified_claims = [c for c in claims if c.get('score', 0) > 0.5]
                explanation = f"{len(verified_claims)}/{len(claims)} medical claims verified."
                if claims:
                    explanation += " Claims: " + "; ".join([c.get('claim', '') for c in claims[:3]])
                
                scores_per_utterance[utt_idx]["metrics"]["medscore"] = {
                    "type": "numerical",
                    "value": avg_score,
                    "max_value": 1.0,
                    "label": "High" if avg_score > 0.7 else "Medium" if avg_score > 0.4 else "Low",
                    "highlighted_text": None,
                    "reasoning": explanation
                }
        
        # Output results as JSON
        print(json.dumps(scores_per_utterance))
        
    except Exception as e:
        logger.error(f"Runner failed: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--api-key", required=False)
    parser.add_argument("--corpus-dir", default="./corpus")
    args = parser.parse_args()
    
    # Read conversation from stdin
    try:
        input_data = sys.stdin.read()
        conversation = json.loads(input_data)
        run_medscore_evaluation(conversation, args.provider, args.model, args.api_key, args.corpus_dir)
    except Exception as e:
        logger.error(f"Failed to read input: {e}")
        sys.exit(1)

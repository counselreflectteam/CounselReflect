import torch
import importlib.util
import sys
import os
from typing import Dict, List, Any
from transformers import AutoModel, AutoTokenizer

class EndpointHandler():
    def __init__(self, path=""):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Import custom model definition from local file
        # The file is expected to be in the same directory as handler.py, which 'path' points to
        model_filename = "cross_scorer_model.py"
        model_path = os.path.join(path, model_filename) 
        
        # Fallback if path is empty or "." and file is in CWD
        if not os.path.exists(model_path):
             model_path = model_filename

        spec = importlib.util.spec_from_file_location("cross_scorer_model", model_path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["cross_scorer_model"] = mod
        spec.loader.exec_module(mod)
        
        # Initialize encoder and custom model
        encoder = AutoModel.from_pretrained("roberta-base", add_pooling_layer=False)
        self.model = mod.CrossScorerCrossEncoder(encoder).to(self.device)
        
        # Load weights
        weights_filename = "reflection_scorer_weight.pt"
        weights_path = os.path.join(path, weights_filename)
        
        if not os.path.exists(weights_path):
            weights_path = weights_filename

        state = torch.load(weights_path, map_location=self.device)
        sd = state.get("model_state_dict", state)
        self.model.load_state_dict(sd, strict=False)
        
        self.model.eval()
        
        # Initialize tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained("roberta-base")

    def __call__(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        data args:
            inputs (:obj: `list` | `dict`): The inputs to the model.
        """
        # get inputs
        inputs = data.pop("inputs", data)
        
        # If inputs is a dict (single item), wrap in list to reuse logic, or handle list
        if isinstance(inputs, dict):
            inputs = [inputs]
        
        results = []
        for item in inputs:
            prompt = item.get("prompt")
            response = item.get("response")
            
            if not prompt or not response:
                results.append({"error": "Missing prompt or response"})
                continue

            # Preprocessing
            batch = self.tokenizer(
                prompt, 
                response, 
                padding="longest", 
                truncation=True, 
                return_tensors="pt"
            ).to(self.device)
            
            # Inference
            with torch.no_grad():
                # score_forward returns raw logits (based on README/code usage), we need sigmoid
                score = self.model.score_forward(**batch).sigmoid().item()
            
            results.append({"score": round(score, 4)})
            
        return results

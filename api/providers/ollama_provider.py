"""
Ollama LLM Provider implementation.

Supports local Ollama models. Auto-detects available models from running Ollama instance.
"""

import logging
import requests
from typing import List, Dict, Optional

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

# Default Ollama API endpoint
DEFAULT_OLLAMA_HOST = "http://localhost:11434"


class OllamaProvider(LLMProvider):
    """Ollama local model provider implementation."""
    
    # Common models that might be available (used as fallback)
    COMMON_MODELS = []
    
    def __init__(self, api_key: Optional[str] = None, host: str = DEFAULT_OLLAMA_HOST):
        """
        Initialize Ollama provider.
        
        Args:
            api_key: Not used for Ollama (local models)
            host: Ollama API host URL
        """
        super().__init__(api_key)
        self.host = host.rstrip("/")
        self._cached_models: Optional[List[ModelInfo]] = None
    
    @property
    def provider_name(self) -> str:
        return "ollama"
    
    def _fetch_models_from_ollama(self) -> List[ModelInfo]:
        """Fetch available models from Ollama API."""
        try:
            response = requests.get(f"{self.host}/api/tags", timeout=5)
            response.raise_for_status()
            data = response.json()
            
            models = []
            for model in data.get("models", []):
                name = model.get("name", "")
                # Remove version tag if present (e.g., "llama3:latest" -> "llama3")
                model_id = name.split(":")[0] if ":" in name else name
                
                models.append(ModelInfo(
                    id=name,  # Keep full name with tag
                    name=model_id.replace("-", " ").replace("_", " ").title(),
                    provider="ollama"
                ))
            
            return models
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to fetch models from Ollama: {e}")
            return []
    
    def get_available_models(self) -> List[ModelInfo]:
        """Get available models, fetching from Ollama if possible."""
        if self._cached_models is None:
            fetched = self._fetch_models_from_ollama()
            if fetched:
                self._cached_models = fetched
            else:
                # Return common models as fallback
                logger.info("Using fallback model list for Ollama")
                self._cached_models = self.COMMON_MODELS.copy()
        
        return self._cached_models
    
    def validate_api_key(self) -> bool:
        """
        Check if Ollama is running and accessible.
        
        Ollama doesn't use API keys, so this just checks connectivity.
        """
        try:
            response = requests.get(f"{self.host}/api/tags", timeout=5)
            return response.status_code == 200
        except requests.exceptions.RequestException:
            logger.error("Ollama is not accessible")
            return False
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
        json_mode: bool = False
    ) -> str:
        """Send chat completion request to Ollama."""
        try:
            # Build request payload
            payload = {
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                }
            }
            
            if json_mode:
                payload["format"] = "json"
            
            response = requests.post(
                f"{self.host}/api/chat",
                json=payload,
                timeout=120  # Longer timeout for local models
            )
            response.raise_for_status()
            
            result = response.json()
            return result.get("message", {}).get("content", "")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Ollama chat completion failed: {e}")
            raise RuntimeError(f"Ollama API call failed: {e}")
        except Exception as e:
            logger.error(f"Unexpected error in Ollama chat completion: {e}")
            raise RuntimeError(f"Ollama call failed: {e}")

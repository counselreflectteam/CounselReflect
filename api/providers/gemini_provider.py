"""
Google Gemini LLM Provider implementation.

Uses the new google-genai SDK (replacement for deprecated google-generativeai).
Supports Gemini models: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
"""

import logging
from typing import List, Dict

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

# Lazy import to avoid errors if package not installed
_genai = None

def _get_genai():
    global _genai
    if _genai is None:
        try:
            from google import genai
            _genai = genai
        except ImportError:
            raise ImportError(
                "google-genai package is required for Gemini provider. "
                "Install with: pip install google-genai"
            )
    return _genai


class GeminiProvider(LLMProvider):
    """Google Gemini provider implementation using new SDK."""
    
    # Available models with their specifications
    MODELS = [
        ModelInfo(
            id="gemini-3-pro-preview",
            name="Gemini 3 Pro",
            provider="gemini"
        ),
        ModelInfo(
            id="gemini-3-flash-preview",
            name="Gemini 3 Flash",
            provider="gemini"
        ),
        ModelInfo(
            id="gemini-2.5-pro",
            name="Gemini 2.5 Pro",
            provider="gemini"
        ),
        ModelInfo(
            id="gemini-2.5-flash",
            name="Gemini 2.5 Flash",
            provider="gemini"
        ),
        ModelInfo(
            id="gemini-2.5-flash-lite",
            name="Gemini 2.5 Flash-Lite",
            provider="gemini"
        ),
    ]
    
    def __init__(self, api_key: str):
        """
        Initialize Gemini provider.
        
        Args:
            api_key: Google AI API key
        """
        super().__init__(api_key)
        genai = _get_genai()
        self.client = genai.Client(api_key=api_key)
        self._genai = genai
    
    @property
    def provider_name(self) -> str:
        return "gemini"
    
    def get_available_models(self) -> List[ModelInfo]:
        return self.MODELS.copy()
    
    def validate_api_key(self) -> bool:
        """Validate API key by attempting to list models."""
        try:
            # Try to list models - this will fail with invalid key
            list(self.client.models.list())
            return True
        except Exception as e:
            error_str = str(e).lower()
            if "api key" in error_str or "invalid" in error_str or "authentication" in error_str or "401" in error_str:
                logger.warning(f"Gemini API key validation failed: {e}")
                return False
            logger.error(f"Unexpected error during Gemini key validation: {e}")
            return False
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = None,
        json_mode: bool = False
    ) -> str:
        """Send chat completion request to Gemini."""
        if not self._validate_model(model):
            raise ValueError(f"Model '{model}' is not supported by Gemini provider")
        
        try:
            # Convert messages to Gemini format
            # New SDK uses 'user' and 'model' roles
            gemini_messages = []
            system_instruction = None
            
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                
                if role == "system":
                    system_instruction = content
                elif role == "assistant":
                    gemini_messages.append({
                        "role": "model",
                        "parts": [{"text": content}]
                    })
                else:
                    gemini_messages.append({
                        "role": "user",
                        "parts": [{"text": content}]
                    })
            
            # Build generation config
            config = {
                "temperature": temperature,
            }
            if max_tokens is not None:
                config["max_output_tokens"] = max_tokens
            
            if json_mode:
                config["response_mime_type"] = "application/json"
            
            # Call the API using new SDK
            response = self.client.models.generate_content(
                model=model,
                contents=gemini_messages,
                config=self._genai.types.GenerateContentConfig(
                    system_instruction=system_instruction if system_instruction else None,
                    **config
                )
            )
            
            return response.text
            
        except Exception as e:
            logger.error(f"Gemini chat completion failed: {e}")
            raise RuntimeError(f"Gemini API call failed: {e}")

"""
OpenAI LLM Provider implementation.

Supports GPT models: gpt-3.5-turbo, gpt-4o-mini, gpt-4o
"""

import logging
from typing import List, Dict
from openai import OpenAI, AuthenticationError, APIError

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """OpenAI GPT provider implementation."""
    
    # Available models with their specifications
    # Only include models that are confirmed working with chat completions API
    MODELS = [
        ModelInfo(
            id="gpt-4.1",
            name="GPT-4.1",
            provider="openai"
        ),
        ModelInfo(
            id="gpt-4.1-mini",
            name="GPT-4.1 Mini",
            provider="openai"
        ),
        ModelInfo(
            id="gpt-4.1-nano",
            name="GPT-4.1 Nano",
            provider="openai"
        ),
        ModelInfo(
            id="gpt-4o",
            name="GPT-4o",
            provider="openai"
        ),
        ModelInfo(
            id="gpt-4o-mini",
            name="GPT-4o Mini",
            provider="openai"
        ),
    ]
    
    def __init__(self, api_key: str):
        """
        Initialize OpenAI provider.
        
        Args:
            api_key: OpenAI API key
        """
        super().__init__(api_key)
        self.client = OpenAI(api_key=api_key)
    
    @property
    def provider_name(self) -> str:
        return "openai"
    
    def get_available_models(self) -> List[ModelInfo]:
        return self.MODELS.copy()
    
    def validate_api_key(self) -> bool:
        """Validate API key by attempting to list models."""
        try:
            # Quick validation by listing models
            self.client.models.list()
            return True
        except AuthenticationError:
            logger.warning("OpenAI API key validation failed: Invalid API key")
            return False
        except APIError as e:
            logger.error(f"OpenAI API error during validation: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error during OpenAI key validation: {e}")
            return False
    
    # Fallback model to use when requested model fails
    FALLBACK_MODEL = "gpt-4o"
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = None,
        json_mode: bool = False
    ) -> str:
        """Send chat completion request to OpenAI."""
        # Try the requested model first, fall back to gpt-4o if it fails
        models_to_try = [model]
        if model != self.FALLBACK_MODEL:
            models_to_try.append(self.FALLBACK_MODEL)
        
        last_error = None
        for attempt_model in models_to_try:
            try:
                kwargs = {
                    "model": attempt_model,
                    "messages": messages,
                    "temperature": temperature,
                }
                if max_tokens is not None:
                    kwargs["max_tokens"] = max_tokens
                
                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}
                
                response = self.client.chat.completions.create(**kwargs)
                if attempt_model != model:
                    logger.info(f"Model '{model}' failed, successfully used fallback '{attempt_model}'")
                return response.choices[0].message.content
                
            except APIError as e:
                # Model not found or not supported - try fallback
                if "404" in str(e) or "not a chat model" in str(e).lower():
                    logger.warning(f"Model '{attempt_model}' not available: {e}")
                    last_error = e
                    continue
                else:
                    logger.error(f"OpenAI chat completion failed: {e}")
                    raise RuntimeError(f"OpenAI API call failed: {e}")
            except Exception as e:
                logger.error(f"OpenAI chat completion failed: {e}")
                raise RuntimeError(f"OpenAI API call failed: {e}")
        
        # All models failed
        raise RuntimeError(f"OpenAI API call failed with all attempted models: {last_error}")

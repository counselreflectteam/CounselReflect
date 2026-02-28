"""
Provider Registry.

Factory and registry for LLM providers. Provides a unified interface for
getting providers, listing all available models, and validating provider/model combinations.
"""

import logging
from typing import Dict, List,Type, Optional, Tuple

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """
    Registry for LLM providers.
    
    Provides factory methods to get provider instances and list all available models.
    """
    
    # Registered provider classes
    _providers: Dict[str, Type[LLMProvider]] = {}
    
    @classmethod
    def register(cls, name: str, provider_class: Type[LLMProvider]):
        """Register a provider class."""
        cls._providers[name] = provider_class
        logger.debug(f"Registered provider: {name}")
    
    @classmethod
    def get_provider(cls, provider_name: str, api_key: Optional[str] = None) -> LLMProvider:
        """
        Get a provider instance by name.
        
        Args:
            provider_name: Provider identifier ('openai', 'gemini', 'claude', 'ollama')
            api_key: API key for authentication
            
        Returns:
            Initialized provider instance
            
        Raises:
            ValueError: If provider is not registered
        """
        if provider_name not in cls._providers:
            available = list(cls._providers.keys())
            raise ValueError(
                f"Unknown provider: '{provider_name}'. "
                f"Available providers: {available}"
            )
        
        provider_class = cls._providers[provider_name]
        
        # Ollama doesn't require an API key
        if provider_name == "ollama":
            return provider_class()
        
        if not api_key:
            raise ValueError(f"API key is required for provider: {provider_name}")
        
        return provider_class(api_key)
    
    @classmethod
    def get_provider_models(cls, provider_name: str) -> List[ModelInfo]:
        """
        Get available models for a specific provider only.
        
        Args:
            provider_name: Name of the provider
            
        Returns:
            List of ModelInfo for the provider, or empty list if provider not found
        """
        if provider_name not in cls._providers:
            return []
        
        provider_class = cls._providers[provider_name]
        
        try:
            # For providers that don't need API key to list models
            if provider_name == "ollama":
                instance = provider_class()
                return instance.get_available_models()
            else:
                # Access class-level MODELS if available
                if hasattr(provider_class, "MODELS"):
                    return provider_class.MODELS.copy()
                return []
        except Exception as e:
            logger.warning(f"Failed to get models for provider {provider_name}: {e}")
            return []
    
    @classmethod
    def validate_provider_and_model(cls, provider: str, model: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that provider exists and model is supported.
        
        Args:
            provider: Provider name
            model: Model identifier
            
        Returns:
            Tuple of (is_valid, error_message). error_message is None if valid.
        """
        # Check provider exists
        available_providers = cls.get_available_providers()
        if provider not in available_providers:
            return False, f"Invalid provider '{provider}'. Available providers: {', '.join(available_providers)}"
        
        # Check model exists for provider - only fetch models for the specific provider
        provider_models = cls.get_provider_models(provider)
        valid_model_ids = [m.id for m in provider_models]
        
        if model not in valid_model_ids:
            return False, f"Invalid model '{model}' for provider '{provider}'. Available models: {', '.join(valid_model_ids)}"
        
        return True, None
    
    @classmethod
    def get_available_providers(cls) -> List[str]:
        """Get list of registered provider names."""
        return list(cls._providers.keys())
    
    @classmethod
    def get_all_models(cls) -> Dict[str, List[ModelInfo]]:
        """
        Get all available models grouped by provider.
        
        Note: This returns static model lists without validation.
        For Ollama, it returns the fallback models unless an instance is provided.
        
        Returns:
            Dictionary mapping provider names to lists of ModelInfo
        """
        result = {}
        
        for name, provider_class in cls._providers.items():
            try:
                # For providers that don't need API key to list models
                if name == "ollama":
                    instance = provider_class()
                else:
                    # Access class-level MODELS if available
                    if hasattr(provider_class, "MODELS"):
                        result[name] = provider_class.MODELS.copy()
                        continue
                    # Otherwise, skip (can't instantiate without key)
                    result[name] = []
                    continue
                
                result[name] = instance.get_available_models()
            except Exception as e:
                logger.warning(f"Failed to get models for provider {name}: {e}")
                result[name] = []
        
        return result
    
    @classmethod
    def get_total_model_count(cls) -> int:
        """Get total count of all available models."""
        all_models = cls.get_all_models()
        return sum(len(models) for models in all_models.values())


# Register all providers
def _register_providers():
    """Register all available providers."""
    from .openai_provider import OpenAIProvider
    from .gemini_provider import GeminiProvider
    from .claude_provider import ClaudeProvider
    from .ollama_provider import OllamaProvider
    
    ProviderRegistry.register("openai", OpenAIProvider)
    ProviderRegistry.register("gemini", GeminiProvider)
    ProviderRegistry.register("claude", ClaudeProvider)
    ProviderRegistry.register("ollama", OllamaProvider)


# Auto-register on import
_register_providers()

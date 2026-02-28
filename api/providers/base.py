"""
Abstract base class for LLM providers.

Defines the common interface that all LLM providers must implement.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class ModelInfo:
    """Information about an available model."""
    id: str        # Model identifier (e.g., "gpt-4o")
    name: str      # Human-readable name (e.g., "GPT-4o")
    provider: str  # Provider identifier ("openai", "gemini", "claude", "ollama")
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
        }


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.
    
    All LLM providers (OpenAI, Gemini, Claude, Ollama) must implement this interface
    to ensure consistent behavior across the application.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the provider.
        
        Args:
            api_key: API key for authentication (not required for local providers like Ollama)
        """
        self.api_key = api_key
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """
        Return the provider identifier.
        
        Returns:
            Provider identifier string (e.g., 'openai', 'gemini', 'claude', 'ollama')
        """
        pass
    
    @abstractmethod
    def get_available_models(self) -> List[ModelInfo]:
        """
        Return list of available models for this provider.
        
        Returns:
            List of ModelInfo objects describing available models
        """
        pass
    
    @abstractmethod
    def validate_api_key(self) -> bool:
        """
        Check if the configured API key is valid.
        
        Returns:
            True if the API key is valid, False otherwise
        """
        pass
    
    @abstractmethod
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
        json_mode: bool = False
    ) -> str:
        """
        Send a chat completion request and return the response content.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
            model: Model identifier to use
            temperature: Sampling temperature (0-2)
            max_tokens: Maximum tokens in response
            json_mode: Whether to request JSON-formatted response
            
        Returns:
            Response content as a string
            
        Raises:
            ValueError: If model is not supported
            RuntimeError: If API call fails
        """
        pass
    
    def _validate_model(self, model: str) -> bool:
        """
        Check if a model is supported by this provider.
        
        Args:
            model: Model identifier to check
            
        Returns:
            True if supported, False otherwise
        """
        available_ids = [m.id for m in self.get_available_models()]
        return model in available_ids

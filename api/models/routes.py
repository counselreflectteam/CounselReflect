"""
Models API routes.

Endpoints for listing available LLM models and validating API keys.
"""
from fastapi import APIRouter, HTTPException
import logging
import os

from schemas import (
    ModelsResponse, ModelInfoSchema,
    ValidateKeyRequest, ValidateKeyResponse
)
from providers.registry import ProviderRegistry

# Setup logging
logger = logging.getLogger(__name__)

# Create router with /models prefix
router = APIRouter(tags=["models"])


@router.get("", response_model=ModelsResponse)
def list_available_models():
    """
    List all available LLM models grouped by provider.
    
    Returns models from all registered providers (OpenAI, Gemini, Claude, Ollama).
    For Ollama, lists locally available models if the server is running.
    
    Note: If Ollama is not running locally, you may see a warning in the logs.
    This is expected behavior - Ollama models will simply be unavailable.
    
    Example response:
    {
        "providers": {
            "openai": [{"id": "gpt-4o", "name": "GPT-4o", ...}],
            "gemini": [...],
            "claude": [...],
            "ollama": [...]
        },
        "total_models": 12
    }
    """
    try:
        # Note: This fetches models from ALL providers, including attempting to
        # connect to Ollama. Warnings about Ollama connection failures are expected
        # if Ollama is not running locally.
        all_models = ProviderRegistry.get_all_models()
        
        # Convert to response format
        providers_response = {}
        total_count = 0
        
        for provider_name, models in all_models.items():
            providers_response[provider_name] = [
                ModelInfoSchema(
                    id=m.id,
                    name=m.name,
                    provider=m.provider
                )
                for m in models
            ]
            total_count += len(models)
        
        return ModelsResponse(
            providers=providers_response,
            total_models=total_count
        )
    
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error listing models: {str(e)}")


@router.post("/validate_key", response_model=ValidateKeyResponse)
def validate_api_key(request: ValidateKeyRequest):
    """
    Validate an API key for a specific provider.
    
    Checks if the provided API key is valid for the specified LLM provider.
    For Ollama, checks if the local server is accessible (no API key needed).
    
    Example request:
    {
        "provider": "openai",
        "api_key": "sk-..."
    }
    
    Example response:
    {
        "valid": true,
        "provider": "openai",
        "message": "API key is valid"
    }
    """
    try:
        if request.provider == "huggingface":
            import requests
            try:
                response = requests.get(
                    'https://huggingface.co/api/whoami-v2',
                    headers={'Authorization': f'Bearer {request.api_key}'},
                    timeout=10
                )
                if response.status_code == 200:
                    return ValidateKeyResponse(
                        valid=True,
                        provider=request.provider,
                        message="HuggingFace API key is valid"
                    )
                else:
                    return ValidateKeyResponse(
                        valid=False,
                        provider=request.provider,
                        message=f"Validation failed: {response.status_code} {response.reason}"
                    )
            except Exception as e:
                return ValidateKeyResponse(
                    valid=False,
                    provider=request.provider,
                    message=f"Validation error: {str(e)}"
                )

        # Get provider instance
        provider = ProviderRegistry.get_provider(request.provider, request.api_key)
        
        # Validate the key
        is_valid = provider.validate_api_key()
        
        if is_valid:
            return ValidateKeyResponse(
                valid=True,
                provider=request.provider,
                message="API key is valid"
            )
        else:
            return ValidateKeyResponse(
                valid=False,
                provider=request.provider,
                message="API key validation failed"
            )
    
    except ValueError as e:
        # Invalid provider name
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error validating API key: {str(e)}", exc_info=True)
        return ValidateKeyResponse(
            valid=False,
            provider=request.provider,
            message=f"Validation error: {str(e)}"
        )


@router.get("/server-keys-status")
def check_server_keys():
    """
    Check which API keys are available in the server's .env file.
    
    Returns the actual API key values from .env so the frontend can populate input fields.
    This is safe since both backend and frontend run locally on the user's machine.
    
    Example response:
    {
        "openai": "sk-...",
        "gemini": "AIza...",
        "claude": null,
        "hf": "hf_..."
    }
    """
    return {
        "openai": os.getenv("OPENAI_API_KEY"),
        "gemini": os.getenv("GEMINI_API_KEY"),
        "claude": os.getenv("ANTHROPIC_API_KEY"),
        "hf": os.getenv("HF_TOKEN")
    }

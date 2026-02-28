# Models API

This module provides API endpoints for discovering available LLM models and validating API keys across different providers.

## Overview

The models API allows clients to:
- List all available LLM models from registered providers (OpenAI, Gemini, Claude, Ollama)
- Validate API keys for specific providers before making evaluation requests

This is particularly useful for frontend applications that need to:
- Display available models to users
- Verify API key validity before submitting evaluation requests
- Handle provider-specific model discovery (e.g., Ollama's locally available models)

## API Endpoints

### GET `/models`

Lists all available LLM models grouped by provider.

**Response:**
```json
{
  "providers": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "provider": "openai"
      },
      {
        "id": "gpt-3.5-turbo",
        "name": "GPT-3.5 Turbo",
        "provider": "openai"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "provider": "gemini"
      }
    ],
    "claude": [
      {
        "id": "claude-sonnet-4-5",
        "name": "Claude Sonnet 4.5",
        "provider": "claude"
      }
    ],
    "ollama": [
      {
        "id": "llama3",
        "name": "Llama 3",
        "provider": "ollama"
      }
    ]
  },
  "total_models": 12
}
```

**Notes:**
- For Ollama, this endpoint lists locally available models if the Ollama server is running
- Models are grouped by provider for easy filtering in frontend applications
- The `total_models` field provides a quick count of all available models

### POST `/models/validate-key`

Validates an API key for a specific provider.

**Request:**
```json
{
  "provider": "openai",
  "api_key": "sk-..."
}
```

**Response (valid key):**
```json
{
  "valid": true,
  "provider": "openai",
  "message": "API key is valid"
}
```

**Response (invalid key):**
```json
{
  "valid": false,
  "provider": "openai",
  "message": "API key validation failed"
}
```

**Response (error):**
```json
{
  "valid": false,
  "provider": "openai",
  "message": "Validation error: [error details]"
}
```

**Notes:**
- For Ollama, this checks if the local Ollama server is accessible (no API key required)
- Invalid provider names will return a 400 error
- Validation errors are returned in the response rather than raising exceptions

## Supported Providers

The models API supports the following providers:

- **OpenAI**: GPT models (gpt-5.2-pro, gpt-4o, gpt-3.5-turbo, etc.)
- **Gemini**: Google Gemini models (gemini-2.5-pro, gemini-2.5-flash, etc.)
- **Claude**: Anthropic Claude models (claude-sonnet-4-5, claude-haiku-4-5)
- **Ollama**: Locally hosted models (requires Ollama server to be running)

## Integration

The models router is automatically registered in the main FastAPI application:

```python
from models.routes import router as models_router
app.include_router(models_router)
```

The router uses the `/models` prefix, so endpoints are available at:
- `GET /models`
- `POST /models/validate-key`

## Implementation Details

### Provider Registry

The models API uses the `ProviderRegistry` from `providers.registry` to:
- Discover all registered providers
- Get available models from each provider
- Create provider instances for API key validation

### Error Handling

- Invalid provider names return HTTP 400 errors
- Provider-specific errors (e.g., network issues) are caught and returned in the response
- All errors are logged for debugging

### Response Models

All responses use Pydantic models defined in `schemas.py`:
- `ModelInfoSchema`: Individual model information
- `ModelsResponse`: Complete list of models grouped by provider
- `ValidateKeyRequest`: API key validation request
- `ValidateKeyResponse`: API key validation result

## Usage Examples

### List Available Models

```bash
curl http://localhost:8000/models
```

### Validate OpenAI API Key

```bash
curl -X POST http://localhost:8000/models/validate-key \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "api_key": "sk-your-key-here"
  }'
```

### Validate Ollama (Local Server)

```bash
curl -X POST http://localhost:8000/models/validate-key \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ollama",
    "api_key": ""
  }'
```

## Testing

Tests for the models API are located in `tests/test_models.py`. The tests verify:
- Model listing functionality
- API key validation for different providers
- Error handling for invalid providers and keys


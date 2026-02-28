# Providers Module

The providers module offers a unified interface for interacting with various Large Language Models (LLMs) across different platforms (OpenAI, Gemini, Claude, Ollama). By abstracting the specific API details, it provides a consistent way to obtain completions, validate API keys, and list available models without coupling the rest of the application to a single vendor.

## Architecture

The system uses a **factory and registry pattern** to manage different LLM providers:
- **Base class (`base.py`)**: Defines the standard interface (`LLMProvider`) that all providers must implement.
- **Registry (`registry.py`)**: Manages registered providers and acts as a factory for instantiating them dynamically or querying available models.
- **Provider Implementations**: Specific implementations for each service (e.g., `openai_provider.py`, `claude_provider.py`).

## Module Structure

```
providers/
├── __init__.py              # Initialization and exposed APIs
├── base.py                  # Abstract base class `LLMProvider`
├── registry.py              # `ProviderRegistry` for managing providers
├── claude_provider.py       # Anthropic Claude integration
├── gemini_provider.py       # Google Gemini integration
├── ollama_provider.py       # Local Ollama integration
└── openai_provider.py       # OpenAI integration
```

## Core Components

### `LLMProvider` Base Class
Defined in `base.py`, this abstract class mandates the implementation of:
- `provider_name`: A property that returns the provider's identifier.
- `get_available_models()`: Returns a list of supported models (`ModelInfo`).
- `validate_api_key()`: Verifies if the provided API key is valid.
- `chat_completion()`: Sends a chat completion request with standardized arguments (`messages`, `model`, `temperature`, `max_tokens`, `json_mode`).

### `ProviderRegistry`
Defined in `registry.py`, it offers several class methods to simplify provider management:
- `get_provider(provider_name, api_key)`: Returns an initialized instance of a provider.
- `get_available_providers()`: Lists all registered provider names.
- `get_all_models()` / `get_provider_models(provider_name)`: Returns available models.
- `validate_provider_and_model(provider, model)`: Quick check to ensure the model exists for the provider.

## Usage Example

```python
from providers.registry import ProviderRegistry

# 1. Validate provider and model
is_valid, error = ProviderRegistry.validate_provider_and_model("openai", "gpt-4o")
if not is_valid:
    print(error)

# 2. Get provider instance
provider = ProviderRegistry.get_provider("openai", api_key="sk-...")

# 3. Send a chat request
messages = [{"role": "user", "content": "Hello! Evaluate this."}]
response = provider.chat_completion(
    messages=messages, 
    model="gpt-4o",
    temperature=0.3,
    json_mode=True
)
print(response)
```

## Adding a New Provider

1. **Create Implementation**: Create a new file (e.g., `my_provider.py`) subclassing `LLMProvider`.
2. **Implement Methods**: Implement all abstract methods (`provider_name`, `get_available_models`, `validate_api_key`, `chat_completion`).
3. **Error Handling**: Catch native exceptions and raise standard ones (e.g., `RuntimeError`, `ValueError`).
4. **Register**: In `registry.py`'s `_register_providers` function, import and register your class:
   ```python
   from .my_provider import MyProvider
   ProviderRegistry.register("myprovider", MyProvider)
   ```

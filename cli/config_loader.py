"""
Configuration loader for CLI tool.

Handles loading API keys from .env files and prompting user for keys.
Supports multiple LLM providers (OpenAI, Gemini, Claude, Ollama).
"""
from pathlib import Path
from typing import Dict, Optional
import os
from dotenv import load_dotenv


# Map provider names to environment variable names
PROVIDER_ENV_KEYS = {
    'openai': 'OPENAI_API_KEY',
    'gemini': 'GEMINI_API_KEY',
    'claude': 'ANTHROPIC_API_KEY',
    'ollama': None,  # Ollama doesn't need an API key
}


def load_env_config() -> Dict[str, Optional[str]]:
    """
    Load API keys from .env files.
    
    Checks both api/.env and cli/.env, with api/.env taking precedence.
    
    Returns:
        Dictionary with all API keys
    """
    # Try to locate .env files
    project_root = Path(__file__).parent.parent
    api_env = project_root / 'api' / '.env'
    cli_env = project_root / 'cli' / '.env'
    
    # Load from api/.env first (higher priority)
    if api_env.exists():
        load_dotenv(api_env)
    
    # Load from cli/.env (will not override existing vars)
    if cli_env.exists():
        load_dotenv(cli_env, override=False)
    
    # Extract relevant keys
    return {
        'BACKEND_URL': os.getenv('BACKEND_URL'),
        'OPENAI_API_KEY': os.getenv('OPENAI_API_KEY'),
        'GEMINI_API_KEY': os.getenv('GEMINI_API_KEY'),
        'ANTHROPIC_API_KEY': os.getenv('ANTHROPIC_API_KEY'),
        'HUGGINGFACE_API_KEY': os.getenv('HUGGINGFACE_API_KEY') or os.getenv('HF_API_KEY'),
        'REPLICATE_API_TOKEN': os.getenv('REPLICATE_API_TOKEN'),
    }


def get_provider_env_key(provider: str) -> Optional[str]:
    """
    Get the environment variable name for a provider's API key.
    
    Args:
        provider: Provider name
        
    Returns:
        Environment variable name or None for Ollama
    """
    return PROVIDER_ENV_KEYS.get(provider.lower())


def get_api_key_for_provider(provider: str, env_config: Dict[str, Optional[str]]) -> Optional[str]:
    """
    Get API key for a specific provider from environment config.
    
    Args:
        provider: Provider name
        env_config: Dictionary from load_env_config()
        
    Returns:
        API key or None
    """
    env_var = get_provider_env_key(provider)
    if env_var is None:
        return None  # Ollama
    return env_config.get(env_var)


def mask_api_key(key: str) -> str:
    """
    Mask API key for display purposes.
    
    Shows only last 6 characters.
    
    Args:
        key: API key string
        
    Returns:
        Masked string like "***abc123"
    """
    if not key or len(key) < 6:
        return "***"
    return f"***{key[-6:]}"


def prompt_for_api_key(
    key_name: str,
    existing_key: Optional[str] = None,
    required: bool = True
) -> Optional[str]:
    """
    Prompt user for API key with option to use existing .env key.
    
    Args:
        key_name: Display name for the key (e.g., "OpenAI API Key")
        existing_key: Existing key from .env file, if any
        required: Whether this key is required
        
    Returns:
        API key string, or None if not required and user skips
    """
    import inquirer
    
    if existing_key:
        # Key exists in .env, ask if user wants to use it
        masked = mask_api_key(existing_key)
        questions = [
            inquirer.Confirm(
                'use_existing',
                message=f"Found {key_name} in .env ({masked}). Use it?",
                default=True
            )
        ]
        answers = inquirer.prompt(questions)
        
        if answers and answers['use_existing']:
            return existing_key
    
    # Prompt for new key
    if required:
        message = f"Enter {key_name}"
    else:
        message = f"Enter {key_name} (optional, press Enter to skip)"
    
    questions = [
        inquirer.Password(
            'api_key',
            message=message,
        )
    ]
    
    answers = inquirer.prompt(questions)
    
    if answers:
        key = answers['api_key'].strip()
        if key:
            return key
        elif required:
            print(f"❌ {key_name} is required.")
            return prompt_for_api_key(key_name, existing_key, required)
    
    return None


def save_config_to_env(keys: Dict[str, str], env_path: Optional[Path] = None) -> None:
    """
    Save API keys to .env file.
    
    Args:
        keys: Dictionary of API keys to save
        env_path: Path to .env file (defaults to cli/.env)
    """
    if env_path is None:
        project_root = Path(__file__).parent.parent
        env_path = project_root / 'cli' / '.env'
    
    # Read existing content
    existing_lines = []
    if env_path.exists():
        with open(env_path, 'r') as f:
            existing_lines = f.readlines()
    
    # Update keys
    updated_keys = set()
    updated_lines = []
    
    for line in existing_lines:
        key_name = line.split('=')[0].strip()
        if key_name in keys:
            updated_lines.append(f"{key_name}={keys[key_name]}\n")
            updated_keys.add(key_name)
        else:
            updated_lines.append(line)
    
    # Add new keys
    for key_name, value in keys.items():
        if key_name not in updated_keys and value:
            updated_lines.append(f"{key_name}={value}\n")
    
    # Write back
    env_path.parent.mkdir(parents=True, exist_ok=True)
    with open(env_path, 'w') as f:
        f.writelines(updated_lines)

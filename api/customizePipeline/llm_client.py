"""LLM client for provider-agnostic API interactions.

Handles API calls with retry logic, logging, and JSON parsing.
Supports multiple LLM providers via ProviderRegistry.
"""
import json
import logging
import time
from typing import Any, List, Dict, Optional

import backoff
from openai import RateLimitError, APIConnectionError

from providers.registry import ProviderRegistry


# Setup logger for LLM client (dev logs only)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class MalformedJSONError(Exception):
    """Raised when LLM response cannot be parsed as valid JSON."""
    def __init__(self, raw_response: str, parse_error: str):
        self.raw_response = raw_response
        self.parse_error = parse_error
        super().__init__(f"Failed to parse LLM response as JSON: {parse_error}")


@backoff.on_exception(backoff.expo, (RateLimitError, APIConnectionError, RuntimeError), max_tries=5)
def chat_json(
        system_prompt: str,
        user_prompt: str,
        provider_name: str,
        model: str,
        api_key: Optional[str] = None,
        temperature: float = 0.3,
        strict: bool = False,
) -> Any:
    """Call LLM provider API and return JSON-parsed response.
    
    Automatically retries on rate limit and connection errors.
    Logs all prompts and responses for debugging (dev logs).
    
    Args:
        system_prompt: System instruction for the model
        user_prompt: User query (should be JSON for structured input)
        provider_name: Provider identifier ('openai', 'gemini', 'claude', 'ollama')
        model: Model identifier to use
        api_key: API key for the provider (optional for some providers like ollama)
        temperature: Sampling temperature
        strict: If True, raise MalformedJSONError on parse failure. 
                If False (default), return {"_raw_text": ...} fallback.

    Returns:
        Parsed JSON response from the model
        
    Raises:
        MalformedJSONError: If strict=True and response cannot be parsed as JSON
        RuntimeError: If provider call fails
        ValueError: If provider is invalid
    """
    # Add JSON instruction to system prompt (only once)
    system_prompt = system_prompt.strip() + "\n\nReturn ONLY a single valid JSON object. No code fences."

    # Calculate payload sizes for logging
    system_prompt_size = len(system_prompt)
    user_prompt_size = len(user_prompt)
    
    # Log request payload (truncate for readability)
    logger.info("="*60)
    logger.info(f"LLM REQUEST START - Provider: {provider_name}, Model: {model}, Temp: {temperature}")
    logger.info(f"  Payload sizes: system={system_prompt_size} chars, user={user_prompt_size} chars")

    # Track timing
    start_time = time.time()
    
    # Get provider instance
    try:
        provider = ProviderRegistry.get_provider(provider_name, api_key)
    except ValueError as e:
        logger.error(f"Failed to get provider '{provider_name}': {e}")
        raise RuntimeError(f"Invalid provider: {e}")
    
    # Prepare messages
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    # Make API call via provider
    try:
        content = provider.chat_completion(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=5000,  # Increased for complex JSON responses
            json_mode=True
        )
    except Exception as e:
        logger.error(f"Provider '{provider_name}' API call failed: {e}")
        raise RuntimeError(f"LLM API call failed: {e}")
    
    # Calculate latency
    latency_ms = (time.time() - start_time) * 1000

    # Log raw response with timing
    response_size = len(content) if content else 0
    
    logger.info(f"LLM RESPONSE RECEIVED - Latency: {latency_ms:.0f}ms, Size: {response_size} chars")
    logger.debug(f"  Raw response (first 2000 chars): {content[:2000] if content else 'None'}...")

    # Parse JSON response
    # Strip markdown code fences if present (Claude and some LLMs add them)
    content_cleaned = content.strip()
    if content_cleaned.startswith('```'):
        # Remove opening fence (```json or just ```)
        lines = content_cleaned.split('\n')
        if lines[0].startswith('```'):
            lines = lines[1:]
        # Remove closing fence
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        content_cleaned = '\n'.join(lines).strip()
    
    try:
        parsed = json.loads(content_cleaned)
        logger.info(f"LLM REQUEST SUCCESS - Latency: {latency_ms:.0f}ms, Status: OK, Keys: {list(parsed.keys()) if isinstance(parsed, dict) else 'array'}")
        logger.info("="*60)
        return parsed
    except json.JSONDecodeError as e:
        error_msg = f"JSON parse error: {str(e)}"
        logger.error(f"LLM REQUEST FAILED - Latency: {latency_ms:.0f}ms, Status: PARSE_ERROR")
        logger.error(f"  Error: {error_msg}")
        logger.error(f"  Raw content (first 500 chars): {content_cleaned[:500]}...")
        logger.info("="*60)
        
        if strict:
            raise MalformedJSONError(str(content).strip(), str(e))
        else:
            # Fallback for non-strict mode (backward compatibility)
            logger.warning("Returning fallback _raw_text response")
            return {"_raw_text": str(content).strip(), "_parse_error": str(e)}

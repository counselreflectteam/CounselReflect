"""
Anthropic Claude LLM Provider implementation.

Supports Claude models: claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus
"""

import logging
import re
from typing import List, Dict

from .base import LLMProvider, ModelInfo

logger = logging.getLogger(__name__)

# Lazy import to avoid errors if package not installed
_anthropic = None

def _get_anthropic():
    global _anthropic
    if _anthropic is None:
        try:
            import anthropic
            _anthropic = anthropic
        except ImportError:
            raise ImportError(
                "anthropic package is required for Claude provider. "
                "Install with: pip install anthropic"
            )
    return _anthropic


class ClaudeProvider(LLMProvider):
    """Anthropic Claude provider implementation."""
    
    # Available models with their specifications
    MODELS = [
        ModelInfo(
            id="claude-sonnet-4-5-20250929",
            name="Claude Sonnet 4.5",
            provider="claude"
        ),
        ModelInfo(
            id="claude-sonnet-4-20250514",
            name="Claude Sonnet 4",
            provider="claude"
        ),
        ModelInfo(
            id="claude-haiku-4-5-20251001",
            name="Claude Haiku 4.5",
            provider="claude"
        ),
    ]
    
    def __init__(self, api_key: str):
        """
        Initialize Claude provider.
        
        Args:
            api_key: Anthropic API key
        """
        super().__init__(api_key)
        anthropic = _get_anthropic()
        self.client = anthropic.Anthropic(api_key=api_key)
    
    @property
    def provider_name(self) -> str:
        return "claude"
    
    def get_available_models(self) -> List[ModelInfo]:
        return self.MODELS.copy()
    
    def validate_api_key(self) -> bool:
        """Validate API key by attempting a minimal request."""
        try:
            # Make a minimal request to validate the key
            self.client.messages.create(
                model="claude-haiku-4-5-20251001",  # Use Haiku 4.5 for cheap validation
                max_tokens=1,
                messages=[{"role": "user", "content": "Hi"}]
            )
            return True
        except Exception as e:
            error_str = str(e).lower()
            if "api key" in error_str or "invalid" in error_str or "authentication" in error_str or "401" in error_str:
                logger.warning(f"Claude API key validation failed: {e}")
                return False
            logger.error(f"Unexpected error during Claude key validation: {e}")
            return False
    
    def _extract_json_from_response(self, text: str) -> str:
        """
        Extract JSON from Claude's response, handling markdown code blocks and extra text.
        
        Args:
            text: Raw response text from Claude
            
        Returns:
            Cleaned JSON string
        """
        # Remove leading/trailing whitespace
        text = text.strip()
        
        # If the response is already valid JSON (starts with { or [), return it
        if text.startswith('{') or text.startswith('['):
            return text
        
        # Try to extract JSON from markdown code blocks
        # Pattern 1: ```json\n{...}\n```
        json_block_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', text)
        if json_block_match:
            extracted = json_block_match.group(1).strip()
            logger.debug("Extracted JSON from markdown code block")
            return extracted
        
        # Pattern 2: Find the first { and last } (for object)
        first_brace = text.find('{')
        last_brace = text.rfind('}')
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            extracted = text[first_brace:last_brace + 1]
            logger.debug("Extracted JSON by finding braces")
            return extracted
        
        # Pattern 3: Find the first [ and last ] (for array)
        first_bracket = text.find('[')
        last_bracket = text.rfind(']')
        if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
            extracted = text[first_bracket:last_bracket + 1]
            logger.debug("Extracted JSON by finding brackets")
            return extracted
        
        # If all else fails, return the original text and let JSON parsing fail with a better error
        logger.warning(f"Could not extract JSON from Claude response: {text[:100]}...")
        return text
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        json_mode: bool = False
    ) -> str:
        """Send chat completion request to Claude."""
        if not self._validate_model(model):
            raise ValueError(f"Model '{model}' is not supported by Claude provider")
        
        try:
            # Extract system message if present
            system_message = None
            chat_messages = []
            
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                
                if role == "system":
                    system_message = content
                else:
                    # Claude uses 'user' and 'assistant' roles
                    chat_messages.append({
                        "role": role,
                        "content": content
                    })
            
            # Build request
            kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": chat_messages,
                "temperature": temperature,
            }
            
            if system_message:
                kwargs["system"] = system_message
            
            # Note: Claude doesn't have a built-in JSON mode like OpenAI
            # JSON output is requested via prompt engineering
            if json_mode and chat_messages:
                # Append JSON instruction to the last user message
                last_msg = chat_messages[-1]
                if last_msg["role"] == "user":
                    last_msg["content"] += "\n\nIMPORTANT: You must respond with ONLY valid JSON. Do not include any other text, markdown formatting, or code blocks. Return raw JSON only."
            
            response = self.client.messages.create(**kwargs)
            
            # Extract text content
            if not response.content:
                logger.error("Claude returned empty content")
                raise RuntimeError("Claude returned empty response")
            
            result_text = response.content[0].text
            
            # Log the raw response for debugging
            logger.debug(f"Claude raw response (first 200 chars): {result_text[:200]}")
            
            # If JSON mode is enabled, try to clean up the response
            if json_mode:
                result_text = self._extract_json_from_response(result_text)
            
            return result_text
            
        except Exception as e:
            logger.error(f"Claude chat completion failed: {e}")
            raise RuntimeError(f"Claude API call failed: {e}")

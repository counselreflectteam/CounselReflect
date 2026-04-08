"""
Integration tests for real LLM provider API calls.

These tests make REAL API calls to verify provider functionality.
Requires valid API keys to be set in environment variables or .env file.

Run with: pytest tests/test_integration_providers.py -v -s

Environment variables needed:
- OPENAI_API_KEY: Your OpenAI API key
- GEMINI_API_KEY: Your Google AI API key
- ANTHROPIC_API_KEY: Your Anthropic API key
"""
import os
import sys
from pathlib import Path

# Add parent directory to path to import from api modules
api_dir = Path(__file__).parent.parent
sys.path.insert(0, str(api_dir))

import pytest
from dotenv import load_dotenv

from providers.registry import ProviderRegistry

# Load environment variables
load_dotenv()

# Register custom marks
pytestmark = pytest.mark.integration


@pytest.fixture
def openai_key():
    """Get OpenAI API key from environment."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        pytest.skip("OPENAI_API_KEY not set in environment")
    return key


@pytest.fixture
def gemini_key():
    """Get Gemini API key from environment."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        pytest.skip("GEMINI_API_KEY not set in environment")
    return key


@pytest.fixture
def anthropic_key():
    """Get Anthropic API key from environment."""
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        pytest.skip("ANTHROPIC_API_KEY not set in environment")
    return key


class TestOpenAIIntegration:
    """Real API tests for OpenAI provider."""
    
    def test_openai_key_validation(self, openai_key):
        """Test that OpenAI key validation works with real API."""
        provider = ProviderRegistry.get_provider("openai", openai_key)
        
        # This makes a real API call
        is_valid = provider.validate_api_key()
        
        assert is_valid is True, "OpenAI API key should be valid"
    
    def test_openai_chat_completion(self, openai_key):
        """Test that OpenAI can generate a real response."""
        provider = ProviderRegistry.get_provider("openai", openai_key)
        
        messages = [
            {"role": "user", "content": "Say 'test successful' if you can read this."}
        ]
        
        # This makes a real API call
        response = provider.chat_completion(
            messages=messages,
            model="gpt-3.5-turbo",
            temperature=0.3,
            max_tokens=50
        )
        
        assert response is not None
        assert len(response) > 0
        print(f"\n✅ OpenAI response: {response}")
    
    def test_openai_json_mode(self, openai_key):
        """Test that OpenAI JSON mode works."""
        provider = ProviderRegistry.get_provider("openai", openai_key)
        
        messages = [
            {"role": "user", "content": 'Return JSON with format: {"status": "ok", "message": "test"}'}
        ]
        
        # This makes a real API call with JSON mode
        response = provider.chat_completion(
            messages=messages,
            model="gpt-3.5-turbo",
            temperature=0.3,
            max_tokens=100,
            json_mode=True
        )
        
        assert response is not None
        # Should be valid JSON
        import json
        result = json.loads(response)
        assert "status" in result or "message" in result
        print(f"\n✅ OpenAI JSON response: {result}")


class TestGeminiIntegration:
    """Real API tests for Gemini provider."""
    
    def test_gemini_key_validation(self, gemini_key):
        """Test that Gemini key validation works with real API."""
        provider = ProviderRegistry.get_provider("gemini", gemini_key)
        
        # This makes a real API call
        is_valid = provider.validate_api_key()
        
        assert is_valid is True, "Gemini API key should be valid"
    
    def test_gemini_chat_completion(self, gemini_key):
        """Test that Gemini can generate a real response."""
        provider = ProviderRegistry.get_provider("gemini", gemini_key)
        
        messages = [
            {"role": "user", "content": "Say 'test successful' if you can read this."}
        ]
        
        # This makes a real API call
        response = provider.chat_completion(
            messages=messages,
            model="gemini-2.5-flash",  # Use latest model
            temperature=0.3,
            max_tokens=50
        )
        
        assert response is not None
        assert len(response) > 0
        print(f"\n✅ Gemini response: {response}")
    
    def test_gemini_json_mode(self, gemini_key):
        """Test that Gemini JSON mode works."""
        provider = ProviderRegistry.get_provider("gemini", gemini_key)
        
        messages = [
            {"role": "user", "content": 'Return JSON with format: {"status": "ok", "message": "test"}'}
        ]
        
        # This makes a real API call with JSON mode
        response = provider.chat_completion(
            messages=messages,
            model="gemini-2.5-flash",
            temperature=0.3,
            max_tokens=100,
            json_mode=True
        )
        
        assert response is not None
        # Should be valid JSON
        import json
        result = json.loads(response)
        assert isinstance(result, dict)
        print(f"\n✅ Gemini JSON response: {result}")


class TestClaudeIntegration:
    """Real API tests for Claude provider."""
    
    def test_claude_key_validation(self, anthropic_key):
        """Test that Claude key validation works with real API."""
        provider = ProviderRegistry.get_provider("claude", anthropic_key)
        
        # This makes a real API call
        is_valid = provider.validate_api_key()
        
        assert is_valid is True, "Claude API key should be valid"
    
    def test_claude_chat_completion(self, anthropic_key):
        """Test that Claude can generate a real response."""
        provider = ProviderRegistry.get_provider("claude", anthropic_key)
        
        messages = [
            {"role": "user", "content": "Say 'test successful' if you can read this."}
        ]
        
        # This makes a real API call
        response = provider.chat_completion(
            messages=messages,
            model="claude-haiku-4-5-20251001",
            temperature=0.3,
            max_tokens=50
        )
        
        assert response is not None
        assert len(response) > 0
        print(f"\n✅ Claude response: {response}")
    
    def test_claude_with_system_message(self, anthropic_key):
        """Test that Claude handles system messages correctly."""
        provider = ProviderRegistry.get_provider("claude", anthropic_key)
        
        messages = [
            {"role": "system", "content": "You are a helpful assistant. Always be concise."},
            {"role": "user", "content": "What is 2+2?"}
        ]
        
        # This makes a real API call
        response = provider.chat_completion(
            messages=messages,
            model="claude-haiku-4-5-20251001",
            temperature=0.3,
            max_tokens=50
        )
        
        assert response is not None
        assert "4" in response.lower()
        print(f"\n✅ Claude with system message: {response}")


class TestOllamaIntegration:
    """Real API tests for Ollama (local) provider."""
    
    def test_ollama_connection(self):
        """Test if Ollama server is running."""
        provider = ProviderRegistry.get_provider("ollama")
        
        is_accessible = provider.validate_api_key()
        
        if not is_accessible:
            pytest.skip("Ollama server is not running on localhost:11434")
        
        assert is_accessible is True
        print("\n✅ Ollama server is accessible")
    
    def test_ollama_list_models(self):
        """Test that Ollama can list available models."""
        provider = ProviderRegistry.get_provider("ollama")
        
        if not provider.validate_api_key():
            pytest.skip("Ollama server is not running")
        
        models = provider.get_available_models()
        
        assert len(models) > 0
        print(f"\n✅ Ollama has {len(models)} models available:")
        for model in models:
            print(f"   - {model.name} ({model.id})")
    
    @pytest.mark.integration
    def test_ollama_chat_completion(self):
        """Test that Ollama can generate a response (may be slow)."""
        provider = ProviderRegistry.get_provider("ollama")
        
        if not provider.validate_api_key():
            pytest.skip("Ollama server is not running")
        
        models = provider.get_available_models()
        if not models:
            pytest.skip("No Ollama models available")
        
        # Use the first available model
        model_id = models[0].id
        
        messages = [
            {"role": "user", "content": "Say just 'OK' if you can read this."}
        ]
        
        # This makes a real API call to local Ollama
        response = provider.chat_completion(
            messages=messages,
            model=model_id,
            temperature=0.3,
            max_tokens=10
        )
        
        assert response is not None
        assert len(response) > 0
        print(f"\n✅ Ollama ({model_id}) response: {response}")


class TestCrossProviderComparison:
    """Compare responses across different providers."""
    
    def test_all_providers_respond(self, openai_key, gemini_key, anthropic_key):
        """Test that all providers can respond to the same prompt."""
        prompt = "What is 1+1? Answer with just the number."
        
        providers_to_test = [
            ("openai", openai_key, "gpt-3.5-turbo"),
            ("gemini", gemini_key, "gemini-2.5-flash"),
            ("claude", anthropic_key, "claude-haiku-4-5-20251001"),
        ]
        
        results = {}
        
        for provider_name, api_key, model in providers_to_test:
            provider = ProviderRegistry.get_provider(provider_name, api_key)
            
            messages = [{"role": "user", "content": prompt}]
            
            response = provider.chat_completion(
                messages=messages,
                model=model,
                temperature=0.1,
                max_tokens=10
            )
            
            results[provider_name] = response
            assert response is not None
            assert "2" in response
        
        print("\n✅ All providers responded correctly:")
        for name, resp in results.items():
            print(f"   {name}: {resp}")

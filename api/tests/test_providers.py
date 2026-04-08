"""
Tests for provider validation and /models/validate-key endpoint.

Tests API key validation for different LLM providers.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


class TestValidateKeyEndpoint:
    """Test suite for /models/validate-key endpoint."""
    
    def test_validate_key_endpoint_exists(self, client):
        """Test that /models/validate-key endpoint is accessible."""
        response = client.post(
            "/models/validate-key",
            json={"provider": "ollama", "api_key": ""}
        )
        # Should not be 404
        assert response.status_code in [200, 400, 422]
    
    def test_validate_key_requires_provider(self, client):
        """Test that provider field is required."""
        response = client.post(
            "/models/validate-key",
            json={"api_key": "test-key"}
        )
        assert response.status_code == 422
    
    def test_validate_key_requires_api_key_field(self, client):
        """Test that api_key field is required."""
        response = client.post(
            "/models/validate-key",
            json={"provider": "openai"}
        )
        assert response.status_code == 422
    
    def test_validate_key_invalid_provider(self, client):
        """Test validation with invalid provider name."""
        response = client.post(
            "/models/validate-key",
            json={"provider": "invalid_provider", "api_key": "test-key"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "invalid_provider" in data["detail"].lower() or "unknown" in data["detail"].lower()
    
    def test_validate_key_response_structure(self, client):
        """Test response structure for validation."""
        response = client.post(
            "/models/validate-key",
            json={"provider": "ollama", "api_key": ""}
        )
        
        data = response.json()
        
        # Check required fields
        assert "valid" in data
        assert "provider" in data
        
        # Check types
        assert isinstance(data["valid"], bool)
        assert isinstance(data["provider"], str)
        
        # Optional message field
        if "message" in data:
            assert isinstance(data["message"], str)


class TestProviderValidation:
    """Test provider-specific validation logic."""
    
    @patch('providers.openai_provider.OpenAI')
    def test_openai_validation_with_valid_key(self, mock_openai, client):
        """Test OpenAI validation with mocked valid key."""
        # Mock successful validation
        mock_client = MagicMock()
        mock_client.models.list.return_value = MagicMock()
        mock_openai.return_value = mock_client
        
        response = client.post(
            "/models/validate-key",
            json={"provider": "openai", "api_key": "sk-test-key"}
        )
        
        data = response.json()
        assert data["provider"] == "openai"
        assert data["valid"] is True
    
    @patch('providers.openai_provider.OpenAI')
    def test_openai_validation_with_invalid_key(self, mock_openai, client):
        """Test OpenAI validation with mocked invalid key."""
        # Mock authentication error
        mock_client = MagicMock()
        # Use a generic exception to simulate authentication failure
        mock_client.models.list.side_effect = Exception("Invalid API key")
        mock_openai.return_value = mock_client
        
        response = client.post(
            "/models/validate-key",
            json={"provider": "openai", "api_key": "sk-invalid-key"}
        )
        
        data = response.json()
        assert data["provider"] == "openai"
        assert data["valid"] is False
    
    def test_ollama_validation_when_not_running(self, client):
        """Test Ollama validation when server is not accessible."""
        response = client.post(
            "/models/validate-key",
            json={"provider": "ollama", "api_key": ""}
        )
        
        data = response.json()
        assert data["provider"] == "ollama"
        # Ollama likely not running in test environment
        assert data["valid"] is False
    
    @patch('providers.gemini_provider._get_genai')
    def test_gemini_validation_structure(self, mock_genai, client):
        """Test Gemini validation response structure."""
        # Mock Gemini package
        mock_genai_module = MagicMock()
        mock_genai.return_value = mock_genai_module
        
        # Mock failed validation
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = Exception("Invalid API key")
        mock_genai_module.GenerativeModel.return_value = mock_model
        
        response = client.post(
            "/models/validate-key",
            json={"provider": "gemini", "api_key": "test-key"}
        )
        
        data = response.json()
        assert "valid" in data
        assert "provider" in data
        assert data["provider"] == "gemini"


class TestProviderRegistry:
    """Test provider registry functionality."""
    
    def test_all_providers_registered(self):
        """Test that all providers are registered."""
        from providers.registry import ProviderRegistry
        
        providers = ProviderRegistry.get_available_providers()
        
        assert "openai" in providers
        assert "gemini" in providers
        assert "claude" in providers
        assert "ollama" in providers
    
    def test_get_provider_openai(self):
        """Test getting OpenAI provider instance."""
        from providers.registry import ProviderRegistry
        
        provider = ProviderRegistry.get_provider("openai", "test-key")
        assert provider.provider_name == "openai"
    
    def test_get_provider_ollama_no_key_required(self):
        """Test getting Ollama provider without API key."""
        from providers.registry import ProviderRegistry
        
        # Ollama doesn't require API key
        provider = ProviderRegistry.get_provider("ollama")
        assert provider.provider_name == "ollama"
    
    def test_get_provider_invalid_name(self):
        """Test getting provider with invalid name raises error."""
        from providers.registry import ProviderRegistry
        
        with pytest.raises(ValueError) as exc_info:
            ProviderRegistry.get_provider("invalid_provider", "test-key")
        
        assert "unknown provider" in str(exc_info.value).lower()
    
    def test_get_provider_missing_key(self):
        """Test getting provider without required API key raises error."""
        from providers.registry import ProviderRegistry
        
        with pytest.raises(ValueError) as exc_info:
            ProviderRegistry.get_provider("openai")
        
        assert "api key" in str(exc_info.value).lower()


class TestProviderModels:
    """Test that each provider has valid models defined."""
    
    def test_openai_models_defined(self):
        """Test OpenAI provider has models defined."""
        from providers.openai_provider import OpenAIProvider
        
        assert hasattr(OpenAIProvider, 'MODELS')
        assert len(OpenAIProvider.MODELS) > 0
        
        for model in OpenAIProvider.MODELS:
            assert model.id
            assert model.name
            assert model.provider == "openai"
    
    def test_gemini_models_defined(self):
        """Test Gemini provider has models defined."""
        from providers.gemini_provider import GeminiProvider
        
        assert hasattr(GeminiProvider, 'MODELS')
        assert len(GeminiProvider.MODELS) > 0
        
        for model in GeminiProvider.MODELS:
            assert model.id
            assert model.name
            assert model.provider == "gemini"
    
    def test_claude_models_defined(self):
        """Test Claude provider has models defined."""
        from providers.claude_provider import ClaudeProvider
        
        assert hasattr(ClaudeProvider, 'MODELS')
        assert len(ClaudeProvider.MODELS) > 0
        
        for model in ClaudeProvider.MODELS:
            assert model.id
            assert model.name
            assert model.provider == "claude"
    
    def test_ollama_models_defined(self):
        """Test Ollama provider has fallback models defined."""
        from providers.ollama_provider import OllamaProvider
        
        assert hasattr(OllamaProvider, 'COMMON_MODELS')
        assert len(OllamaProvider.COMMON_MODELS) > 0
        
        for model in OllamaProvider.COMMON_MODELS:
            assert model.id
            assert model.name
            assert model.provider == "ollama"
    
    def test_model_info_to_dict(self):
        """Test ModelInfo to_dict() method."""
        from providers.base import ModelInfo
        
        model = ModelInfo(
            id="test-model",
            name="Test Model",
            provider="test"
        )
        
        model_dict = model.to_dict()
        
        assert model_dict["id"] == "test-model"
        assert model_dict["name"] == "Test Model"
        assert model_dict["provider"] == "test"
        assert len(model_dict) == 3  # Only 3 fields

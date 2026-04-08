"""
Tests for /models endpoint and model listing.

Tests the models endpoint that lists available LLM providers and models.
"""
import json
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


class TestModelsEndpoint:
    """Test suite for /models endpoint."""
    
    def test_models_endpoint_exists(self, client):
        """Test that /models endpoint is accessible."""
        response = client.get("/models")
        assert response.status_code == 200
    
    def test_models_response_structure(self, client):
        """Test that /models returns correct structure."""
        response = client.get("/models")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields
        assert "providers" in data
        assert "total_models" in data
        
        # Check types
        assert isinstance(data["providers"], dict)
        assert isinstance(data["total_models"], int)
    
    def test_models_contains_all_providers(self, client):
        """Test that all expected providers are in the response."""
        response = client.get("/models")
        data = response.json()
        
        providers = data["providers"]
        
        # Should contain all 4 providers
        assert "openai" in providers
        assert "gemini" in providers
        assert "claude" in providers
        assert "ollama" in providers
    
    def test_openai_models_included(self, client):
        """Test that OpenAI models are listed correctly."""
        response = client.get("/models")
        data = response.json()
        
        openai_models = data["providers"]["openai"]
        
        # Should have at least 3 models
        assert len(openai_models) >= 3
        
        # Check model structure
        for model in openai_models:
            assert "id" in model
            assert "name" in model
            assert "provider" in model
            assert model["provider"] == "openai"
        
        # Check specific models exist
        model_ids = [m["id"] for m in openai_models]
        assert "gpt-3.5-turbo" in model_ids
        assert "gpt-4o-mini" in model_ids
        assert "gpt-4o" in model_ids
    
    def test_gemini_models_included(self, client):
        """Test that Gemini models are listed correctly."""
        response = client.get("/models")
        data = response.json()
        
        gemini_models = data["providers"]["gemini"]
        
        # Should have at least 3 models
        assert len(gemini_models) >= 3
        
        # Check model structure
        for model in gemini_models:
            assert "id" in model
            assert "name" in model
            assert "provider" in model
            assert model["provider"] == "gemini"
        
        # Check some models exist
        model_ids = [m["id"] for m in gemini_models]
        assert any("gemini" in mid.lower() for mid in model_ids)
    
    def test_claude_models_included(self, client):
        """Test that Claude models are listed correctly."""
        response = client.get("/models")
        data = response.json()
        
        claude_models = data["providers"]["claude"]
        
        # Should have at least 3 models
        assert len(claude_models) >= 3
        
        # Check model structure
        for model in claude_models:
            assert "id" in model
            assert "name" in model
            assert "provider" in model
            assert model["provider"] == "claude"
        
        # Check some models exist
        model_ids = [m["id"] for m in claude_models]
        assert any("claude" in mid.lower() for mid in model_ids)
    
    def test_ollama_models_included(self, client):
        """Test that Ollama models are listed (fallback if not running)."""
        response = client.get("/models")
        data = response.json()
        
        ollama_models = data["providers"]["ollama"]
        
        # Should have at least the fallback models
        assert len(ollama_models) >= 1
        
        # Check model structure
        for model in ollama_models:
            assert "id" in model
            assert "name" in model
            assert "provider" in model
            assert model["provider"] == "ollama"
    
    def test_total_models_count_accurate(self, client):
        """Test that total_models count matches actual count."""
        response = client.get("/models")
        data = response.json()
        
        # Count models manually
        actual_count = sum(
            len(models) 
            for models in data["providers"].values()
        )
        
        assert data["total_models"] == actual_count
    
    def test_model_fields_only_essential(self, client):
        """Test that models only contain essential fields (id, name, provider)."""
        response = client.get("/models")
        data = response.json()
        
        # Check a model from each provider
        for provider_name, models in data["providers"].items():
            if models:  # If provider has models
                model = models[0]
                
                # Should have exactly these fields
                assert set(model.keys()) == {"id", "name", "provider"}
                
                # Should NOT have these fields (we removed them)
                assert "context_window" not in model
                assert "supports_json" not in model
    
    def test_models_endpoint_performance(self, client):
        """Test that /models endpoint responds quickly."""
        import time
        
        start = time.time()
        response = client.get("/models")
        elapsed = time.time() - start
        
        assert response.status_code == 200
        # Should respond in under 2 seconds even with Ollama checks
        assert elapsed < 2.0


class TestModelsIntegration:
    """Integration tests for models endpoint."""
    
    def test_models_json_serializable(self, client):
        """Test that models response is properly JSON serializable."""
        response = client.get("/models")
        
        # Should be valid JSON
        data = response.json()
        
        # Should be able to serialize back to JSON
        json_str = json.dumps(data)
        assert json_str is not None
        
        # Should be able to parse back
        parsed = json.loads(json_str)
        assert parsed == data
    
    def test_models_consistent_across_calls(self, client):
        """Test that models endpoint returns consistent results."""
        response1 = client.get("/models")
        response2 = client.get("/models")
        
        data1 = response1.json()
        data2 = response2.json()
        
        # Should return same results
        assert data1 == data2

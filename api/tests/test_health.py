"""
Tests for health check endpoints.

Tests the root endpoint and health check functionality.
"""
import pytest
import requests
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


class TestHealthEndpoint:
    """Test suite for health check endpoints."""
    
    def test_root_endpoint(self, client):
        """Test the root endpoint returns healthy status."""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert data["version"] == "0.1.0"
    
    def test_root_endpoint_structure(self, client):
        """Test the root endpoint response structure."""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all required fields are present
        assert "status" in data
        assert "version" in data
        
        # Verify field types
        assert isinstance(data["status"], str)
        assert isinstance(data["version"], str)
    
    def test_health_endpoint_content_type(self, client):
        """Test that the root endpoint returns JSON."""
        response = client.get("/")
        
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"


class TestHealthEndpointIntegration:
    """Integration tests for health check (requires running server)."""
    
    @pytest.mark.skip(reason="Requires running server - use for manual testing")
    def test_health_endpoint_live_server(self):
        """Test health endpoint against a live server."""
        base_url = "http://localhost:8000"
        
        try:
            response = requests.get(f"{base_url}/", timeout=5)
            
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert "version" in data
            
        except requests.exceptions.ConnectionError:
            pytest.skip("Server not running. Start with: uvicorn api.main:app --reload --port 8000")


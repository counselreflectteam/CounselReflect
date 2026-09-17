"""
Tests for /evaluate endpoint.

Tests the evaluation endpoint with various scenarios using test_input.json.
"""
import json
import pytest
import requests
from pathlib import Path
from fastapi.testclient import TestClient

from main import app

EVALUATE_PATH = "/predefined_metrics/evaluate"
METRICS_PATH = "/predefined_metrics/metrics"


def evaluation_request(conversation, metrics, **overrides):
    return {
        "conversation": conversation,
        "metrics": metrics,
        "provider": "openai",
        "model": "gpt-4.1",
        **overrides,
    }


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def test_input_file():
    """Path to test input JSON file."""
    test_file = Path(__file__).parent / "test_input.json"
    if test_file.exists():
        return test_file
    return None


@pytest.fixture
def test_input_data(test_input_file):
    """Load test_input.json data."""
    if test_input_file is None:
        return None
    with open(test_input_file, "r") as f:
        return json.load(f)


@pytest.fixture
def sample_conversation(test_input_data):
    """Sample conversation for testing (from test_input.json)."""
    if test_input_data is not None:
        return test_input_data["conversation"]
    # Fallback if test_input.json doesn't exist
    return [
        {"speaker": "Therapist", "text": "Hello, welcome. How are you feeling today?"},
        {"speaker": "Patient", "text": "I've been pretty anxious this week."},
        {"speaker": "Therapist", "text": "Thanks for sharing. What situations triggered the anxiety?"},
        {"speaker": "Patient", "text": "Mostly work meetings and tight deadlines."},
        {"speaker": "Therapist", "text": "What helped you cope when it felt overwhelming?"},
        {"speaker": "Patient", "text": "Taking short walks and deep breathing helped a bit."}
    ]


@pytest.fixture
def test_metrics(test_input_data):
    """Metrics from test_input.json."""
    if test_input_data is not None:
        return test_input_data["metrics"]
    return ["talk_type"]


class TestEvaluateEndpoint:
    """Test suite for /evaluate endpoint."""
    
    def test_evaluate_endpoint_structure(self, client, sample_conversation, test_metrics):
        """Test that /evaluate endpoint accepts valid request using test_input.json."""
        request_data = evaluation_request(sample_conversation, test_metrics)

        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should return 200 or 400 (depending on if evaluator is available)
        assert response.status_code in [200, 400, 500]
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert "results" in data
            assert isinstance(data["results"], dict)
    
    def test_evaluate_with_invalid_metric(self, client, sample_conversation):
        """Test evaluation with invalid metric name."""
        request_data = evaluation_request(sample_conversation, ["invalid_metric_name"])

        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should return 400 for invalid metric
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "invalid" in data["detail"].lower() or "Invalid" in data["detail"]
    
    def test_evaluate_with_empty_metrics(self, client, sample_conversation):
        """Test evaluation with empty metrics list."""
        request_data = evaluation_request(sample_conversation, [])

        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should return 422 (validation error) or 400
        assert response.status_code in [400, 422]
    
    def test_evaluate_with_invalid_conversation(self, client):
        """Test evaluation with invalid conversation format."""
        request_data = evaluation_request("not a list", ["talk_type"])

        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should return 422 (validation error)
        assert response.status_code == 422
    
    def test_evaluate_with_missing_fields(self, client):
        """Test evaluation with missing required fields."""
        # Missing conversation
        response = client.post(
            EVALUATE_PATH,
            json={"metrics": ["talk_type"], "provider": "openai", "model": "gpt-4.1"},
        )
        assert response.status_code == 422
        
        # Missing metrics
        response = client.post(
            EVALUATE_PATH,
            json={"conversation": [], "provider": "openai", "model": "gpt-4.1"},
        )
        assert response.status_code == 422
    
    def test_evaluate_with_api_keys(self, client, sample_conversation, test_metrics):
        """Test evaluation with API keys provided."""
        request_data = evaluation_request(
            sample_conversation,
            test_metrics,
            api_key="test-key",
        )
        
        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should accept the request (may fail if evaluator needs real key)
        assert response.status_code in [200, 400, 500]
    
    def test_evaluate_with_provider_configuration(self, client, sample_conversation, test_metrics):
        """Test evaluation with an explicit provider and model."""
        request_data = evaluation_request(sample_conversation, test_metrics)
        
        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should accept the request
        assert response.status_code in [200, 400, 500]
    
    def test_evaluate_response_structure(self, client, sample_conversation, test_metrics):
        """Test that response has correct structure when successful (using test_input.json)."""
        request_data = evaluation_request(sample_conversation, test_metrics)
        
        response = client.post(EVALUATE_PATH, json=request_data)
        
        if response.status_code == 200:
            data = response.json()
            
            # Check required fields
            assert "status" in data
            assert "results" in data
            assert isinstance(data["status"], str)
            assert isinstance(data["results"], dict)
            
            # Status should be one of: success, partial, error
            assert data["status"] in ["success", "partial", "error"]
            
            # If successful, verify results match requested metrics
            if data["status"] == "success":
                assert len(data["results"]) == len(test_metrics)
                for metric in test_metrics:
                    assert metric in data["results"]
    
    def test_evaluate_multiple_metrics(self, client, sample_conversation):
        """Test evaluation with multiple metrics."""
        # Get available metrics first
        metrics_response = client.get(METRICS_PATH)
        if metrics_response.status_code == 200:
            metrics_data = metrics_response.json()
            available_metrics = [m["name"] for m in metrics_data.get("metrics", [])]
            
            if len(available_metrics) >= 2:
                request_data = evaluation_request(
                    sample_conversation,
                    available_metrics[:2],
                )
                
                response = client.post(EVALUATE_PATH, json=request_data)
                
                # Should accept the request
                assert response.status_code in [200, 400, 500]
                
                if response.status_code == 200:
                    data = response.json()
                    assert "results" in data
                    # Results should contain entries for requested metrics
                    assert len(data["results"]) <= 2


class TestEvaluateWithTestInput:
    """Test evaluation using test_input.json file."""
    
    def test_evaluate_with_test_input_file(self, client, test_input_data):
        """Test evaluation using test_input.json if available."""
        if test_input_data is None:
            pytest.skip("test_input.json not found")
        
        request_data = evaluation_request(
            test_input_data["conversation"],
            test_input_data["metrics"],
        )
        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should accept the request
        assert response.status_code in [200, 400, 500]
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert "results" in data
            
            # Verify results structure
            assert isinstance(data["results"], dict)
            
            # Check that requested metrics are in results (if successful)
            requested_metrics = test_input_data.get("metrics", [])
            if data["status"] == "success":
                assert len(data["results"]) == len(requested_metrics)
                for metric in requested_metrics:
                    assert metric in data["results"]
    
    def test_evaluate_with_test_input_conversation(self, client, test_input_data):
        """Test evaluation with conversation from test_input.json."""
        if test_input_data is None:
            pytest.skip("test_input.json not found")
        
        request_data = evaluation_request(
            test_input_data["conversation"],
            test_input_data["metrics"],
        )
        
        response = client.post(EVALUATE_PATH, json=request_data)
        
        assert response.status_code in [200, 400, 500]
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert "results" in data
    
    def test_evaluate_test_input_metrics(self, client, test_input_data, monkeypatch):
        """Test that test_input.json metrics are valid."""
        if test_input_data is None:
            pytest.skip("test_input.json not found")

        # Endpoint-backed metrics require a verified HF key; stub verification.
        from utils import hf_identity
        monkeypatch.setattr(hf_identity, "_whoami_ok", lambda key: True)
        
        # First check available metrics
        metrics_response = client.get(METRICS_PATH)
        if metrics_response.status_code == 200:
            metrics_data = metrics_response.json()
            available_metrics = [m["name"] for m in metrics_data.get("metrics", [])]
            
            # Test with test_input.json metrics. The server never falls back
            # to its own provider keys, so the request must carry one.
            request_data = evaluation_request(
                test_input_data["conversation"],
                test_input_data["metrics"],
                api_key="test-key",
                huggingface_api_key="hf_test-key",
            )
            
            response = client.post(EVALUATE_PATH, json=request_data)
            
            # If metrics are available, should get 200 or 500 (not 400)
            # If metrics are not available, should get 400
            if all(m in available_metrics for m in test_input_data["metrics"]):
                assert response.status_code in [200, 500]
            else:
                assert response.status_code == 400
    
    def test_evaluate_test_input_conversation_structure(self, client, test_input_data):
        """Test that test_input.json conversation structure is correct."""
        if test_input_data is None:
            pytest.skip("test_input.json not found")
        
        conversation = test_input_data["conversation"]
        
        # Verify conversation structure
        assert len(conversation) == 6
        assert all("speaker" in utt and "text" in utt for utt in conversation)
        
        # Verify alternating speakers
        assert conversation[0]["speaker"] == "Therapist"
        assert conversation[1]["speaker"] == "Patient"
        assert conversation[2]["speaker"] == "Therapist"
        assert conversation[3]["speaker"] == "Patient"
        assert conversation[4]["speaker"] == "Therapist"
        assert conversation[5]["speaker"] == "Patient"


class TestEvaluateEndpointIntegration:
    """Integration tests for /evaluate endpoint (requires running server)."""
    
    @pytest.mark.skip(reason="Requires running server - use for manual testing")
    def test_evaluate_endpoint_live_server(self, test_input_data):
        """Test /evaluate endpoint against a live server using test_input.json."""
        base_url = "http://localhost:8000"
        
        if test_input_data is None:
            pytest.skip("test_input.json not found")
        
        try:
            response = requests.post(
                f"{base_url}{EVALUATE_PATH}",
                json=evaluation_request(
                    test_input_data["conversation"],
                    test_input_data["metrics"],
                ),
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            assert response.status_code == 200
            data = response.json()
            
            assert "status" in data
            assert "results" in data
            assert isinstance(data["results"], dict)
            
            # Check that results match requested metrics
            requested_metrics = test_input_data.get("metrics", [])
            if data["status"] == "success":
                assert len(data["results"]) == len(requested_metrics)
                for metric in requested_metrics:
                    assert metric in data["results"]
            
            # Verify conversation was parsed correctly
            assert len(test_input_data["conversation"]) == 6
            
        except requests.exceptions.ConnectionError:
            pytest.skip("Server not running. Start with: uvicorn api.main:app --reload --port 8000")
        except requests.exceptions.Timeout:
            pytest.skip("Request timed out - evaluator may be slow")


class TestEvaluateErrorHandling:
    """Test error handling in /evaluate endpoint."""
    
    def test_evaluate_with_malformed_conversation(self, client):
        """Test evaluation with malformed conversation data."""
        request_data = evaluation_request(
            [
                {"speaker": "Therapist"},  # missing text
                {"text": "Hello"}  # missing speaker
            ],
            ["talk_type"],
        )
        
        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should return 400 (parse error) or 422 (validation error)
        assert response.status_code in [400, 422]
    
    def test_evaluate_with_empty_conversation(self, client):
        """Test evaluation with empty conversation."""
        request_data = evaluation_request([], ["talk_type"])
        
        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Should return 400 (parse error - no utterances)
        assert response.status_code == 400
    
    def test_evaluate_with_non_string_fields(self, client):
        """Test evaluation with non-string speaker/text fields."""
        request_data = evaluation_request(
            [
                {"speaker": 123, "text": "Hello"},  # speaker is not string
                {"speaker": "Patient", "text": 456}  # text is not string
            ],
            ["talk_type"],
        )
        
        response = client.post(EVALUATE_PATH, json=request_data)
        
        # Parser should convert to string or return error
        # Status code depends on implementation
        assert response.status_code in [200, 400, 422]

"""
API client for communicating with the backend server.

Handles all HTTP communication with the FastAPI backend.
Supports multiple LLM providers (OpenAI, Gemini, Claude, Ollama).
"""
import requests
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

QUERY_TIMEOUT_SECONDS = 15
DEFAULT_EVALUATION_TIMEOUT_SECONDS = 900

def _handle_error(response: requests.Response):
    """Raise HTTPError with detailed backend message if available."""
    try:
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        try:
            error_data = response.json()
            detail = error_data.get("detail", response.text)
            raise Exception(f"{e} - Detail: {detail}") from e
        except ValueError:
            raise Exception(f"{e} - Detail: {response.text}") from e


class APIClient:
    """Client for the CounselReflect API."""
    
    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        access_code: Optional[str] = None,
        evaluation_timeout: int = DEFAULT_EVALUATION_TIMEOUT_SECONDS,
    ):
        """
        Initialize API client.
        
        Args:
            base_url: Base URL of the API (default: http://localhost:8000)
            access_code: Optional CounselReflect preview access code
        """
        self.base_url = base_url.rstrip('/')
        if evaluation_timeout <= 0:
            raise ValueError("evaluation_timeout must be greater than zero")
        self.evaluation_timeout = evaluation_timeout
        self.session = requests.Session()
        if access_code:
            self.session.headers.update({"X-CounselReflect-Access": access_code})
    
    def check_health(self) -> bool:
        """
        Check if the backend API is running.
        
        Returns:
            True if API is healthy, False otherwise
        """
        try:
            response = self.session.get(f"{self.base_url}/", timeout=5)
            _handle_error(response)
            data = response.json()
            return data.get('status') == 'healthy'
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
    
    def list_models(self) -> Dict[str, Any]:
        """
        List all available LLM models from all providers.
        
        Returns:
            Dictionary with models grouped by provider
            
        Raises:
            requests.HTTPError: If request fails
        """
        response = self.session.get(
            f"{self.base_url}/models", timeout=QUERY_TIMEOUT_SECONDS
        )
        _handle_error(response)
        return response.json()

    def server_keys_status(self) -> Dict[str, bool]:
        """Return which provider credentials are configured on the backend."""
        response = self.session.get(
            f"{self.base_url}/models/server-keys-status",
            timeout=10,
        )
        _handle_error(response)
        return response.json()
    
    
    def validate_api_key(self, provider: str, api_key: str) -> Dict[str, Any]:
        """
        Validate an API key for a specific provider.
        
        Args:
            provider: Provider name ('openai', 'gemini', 'claude', 'ollama')
            api_key: API key to validate
            
        Returns:
            Dictionary with validation result
            
        Raises:
            requests.HTTPError: If request fails
        """
        payload = {
            "provider": provider,
            "api_key": api_key
        }
        response = self.session.post(
            f"{self.base_url}/models/validate_key",
            json=payload,
            timeout=30
        )
        _handle_error(response)
        return response.json()
        
    def validate_huggingface_key(self, api_key: str) -> Dict[str, Any]:
        """
        Validate a HuggingFace API key.
        
        Args:
            api_key: API key to validate
            
        Returns:
            Dictionary with validation result {'valid': bool, 'message': str}
        """
        return self.validate_api_key("huggingface", api_key)
    
    def list_available_metrics(self) -> Dict[str, Any]:
        """
        List all available evaluator metrics.
        
        Returns:
            Dictionary with metrics information
            
        Raises:
            requests.HTTPError: If request fails
        """
        response = self.session.get(
            f"{self.base_url}/predefined_metrics/metrics",
            timeout=QUERY_TIMEOUT_SECONDS,
        )
        _handle_error(response)
        return response.json()
    
    def list_literature_metrics(self) -> Dict[str, Any]:
        """
        List all available literature-based metrics.
        
        Returns:
            Dictionary with literature metrics information
            
        Raises:
            requests.HTTPError: If request fails
        """
        response = self.session.get(
            f"{self.base_url}/literature/metrics",
            timeout=QUERY_TIMEOUT_SECONDS,
        )
        _handle_error(response)
        return response.json()
    
    def evaluate_conversation(
        self,
        conversation: List[Dict[str, str]],
        metrics: List[str],
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        huggingface_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluate conversation using standard evaluators.
        
        Args:
            conversation: List of conversation utterances
            metrics: List of metric names to evaluate
            provider: LLM provider name
            model: Model identifier
            api_key: API key for the provider
            huggingface_key: Optional HuggingFace API key
            
        Returns:
            Evaluation results
            
        Raises:
            requests.HTTPError: If request fails
        """
        payload = {
            "conversation": conversation,
            "metrics": metrics,
            "provider": provider,
            "model": model,
        }
        if api_key:
            payload["api_key"] = api_key
        if huggingface_key:
            payload["huggingface_api_key"] = huggingface_key
        
        response = self.session.post(
            f"{self.base_url}/predefined_metrics/evaluate",
            json=payload,
            timeout=self.evaluation_timeout,
        )
        _handle_error(response)
        return response.json()
    
    def evaluate_literature(
        self,
        conversation: List[Dict[str, str]],
        metric_names: List[str],
        provider: str,
        model: str,
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluate conversation using literature-based metrics.
        
        Args:
            conversation: List of conversation utterances
            metric_names: List of metric names to evaluate
            provider: LLM provider name
            model: Model identifier
            api_key: API key for the provider
            
        Returns:
            Evaluation results
            
        Raises:
            requests.HTTPError: If request fails
        """
        payload = {
            "conversation": conversation,
            "metric_names": metric_names,
            "provider": provider,
            "model": model,
        }
        if api_key:
            payload["api_key"] = api_key
        
        response = self.session.post(
            f"{self.base_url}/literature/evaluate",
            json=payload,
            timeout=self.evaluation_timeout,
        )
        _handle_error(response)
        return response.json()

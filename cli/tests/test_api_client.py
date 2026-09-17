import sys
import unittest
from pathlib import Path
from unittest.mock import Mock


CLI_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CLI_DIR))

from api_client import APIClient
from config_loader import resolve_provider_key, selected_metrics_require_hf


class APIClientTests(unittest.TestCase):
    def test_access_code_is_applied_to_session(self):
        client = APIClient("https://example.invalid", access_code="secret-code")
        self.assertEqual(
            client.session.headers["X-CounselReflect-Access"],
            "secret-code",
        )

    def test_no_access_code_leaves_header_unset(self):
        client = APIClient("https://example.invalid")
        self.assertNotIn("X-CounselReflect-Access", client.session.headers)

    def test_optional_credentials_are_omitted_from_payload(self):
        client = APIClient("https://example.invalid")
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"status": "success"}
        client.session.post = Mock(return_value=response)

        client.evaluate_conversation(
            conversation=[{"speaker": "Therapist", "text": "Hello"}],
            metrics=["medscore"],
            provider="openai",
            model="gpt-4o",
        )

        payload = client.session.post.call_args.kwargs["json"]
        self.assertNotIn("api_key", payload)
        self.assertNotIn("huggingface_api_key", payload)

    def test_server_managed_provider_key_needs_no_local_secret(self):
        key, source = resolve_provider_key(
            "openai",
            explicit_key=None,
            env_config={},
            server_keys={"openai": True},
        )
        self.assertIsNone(key)
        self.assertEqual(source, "server")

    def test_hf_is_required_only_for_selected_metrics(self):
        inventory = [
            {"name": "medscore", "requiresHf": False},
            {"name": "emotion", "requiresHf": True},
        ]
        self.assertFalse(selected_metrics_require_hf(inventory, ["medscore"]))
        self.assertTrue(selected_metrics_require_hf(inventory, ["emotion"]))


if __name__ == "__main__":
    unittest.main()

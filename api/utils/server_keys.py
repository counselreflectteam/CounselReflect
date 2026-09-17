"""Server-side API key spending policy.

By default the backend never spends its own provider keys (OpenAI/Gemini/
Anthropic/HF/Perspective) on incoming requests: callers must supply their own
key. A deployment that intentionally wants server keys to back requests
(e.g. a private, access-gated preview) can opt in with
COUNSELREFLECT_ALLOW_SERVER_KEYS=true.
"""
import os

ALLOW_SERVER_KEYS_ENV = "COUNSELREFLECT_ALLOW_SERVER_KEYS"


def server_keys_allowed() -> bool:
    return os.getenv(ALLOW_SERVER_KEYS_ENV, "").strip().lower() in {"1", "true", "yes", "on"}


def server_key_fallback(env_var: str | None) -> str | None:
    """Server-side key for env_var, only when the deployment has opted in."""
    if not env_var or not server_keys_allowed():
        return None
    return os.getenv(env_var)


def missing_key_detail(provider: str, env_var: str | None = None) -> str:
    """400 message for a request that arrived without a usable API key."""
    detail = (
        f"No API key available for provider '{provider}'. "
        "Provide your own key in the request."
    )
    if env_var and server_keys_allowed():
        detail += f" (Server-side key fallback is enabled but {env_var} is not set.)"
    return detail

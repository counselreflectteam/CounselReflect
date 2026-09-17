"""Verify that a Hugging Face API key belongs to a real account.

The four endpoint-backed classifier metrics run on the server's own paid
HF Inference Endpoints, so the user's key is never billed — but requiring a
key that actually resolves via whoami turns "any non-empty string" into
"holder of a real, bannable HF account", which is the anti-abuse point.
"""
import logging
import threading
import time
from typing import Dict, Tuple

import requests
from fastapi import HTTPException

logger = logging.getLogger(__name__)

WHOAMI_URL = "https://huggingface.co/api/whoami-v2"
VALID_TTL_SECONDS = 600.0
INVALID_TTL_SECONDS = 120.0

_cache_lock = threading.Lock()
_cache: Dict[str, Tuple[float, bool]] = {}

MISSING_KEY_DETAIL = (
    "The selected model-scored metrics require a Hugging Face API key. "
    "Add one in the API keys panel — it is used to verify your account, "
    "never billed."
)
INVALID_KEY_DETAIL = (
    "The Hugging Face API key could not be verified. Check the key in the "
    "API keys panel and try again."
)


def _whoami_ok(hf_key: str) -> bool:
    """True if the key resolves to an account. Fail OPEN on HF outages:
    an unreachable huggingface.co should degrade to the pre-gate behavior,
    not take the classifier metrics down with it."""
    try:
        response = requests.get(
            WHOAMI_URL,
            headers={"Authorization": f"Bearer {hf_key}"},
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.warning(f"HF whoami unreachable; skipping key verification: {exc}")
        return True
    if response.status_code == 200:
        return True
    if response.status_code in (401, 403):
        return False
    logger.warning(f"HF whoami unexpected status {response.status_code}; skipping verification")
    return True


def ensure_verified_hf_key(hf_key: str | None) -> None:
    """Raise 400 unless hf_key is present and resolves to a real HF account."""
    if not hf_key or not str(hf_key).strip():
        raise HTTPException(status_code=400, detail=MISSING_KEY_DETAIL)

    key = str(hf_key).strip()
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached and cached[0] > now:
            valid = cached[1]
        else:
            valid = None

    if valid is None:
        valid = _whoami_ok(key)
        ttl = VALID_TTL_SECONDS if valid else INVALID_TTL_SECONDS
        with _cache_lock:
            # Opportunistic pruning keeps the cache from growing unboundedly.
            if len(_cache) > 5000:
                for stale in [k for k, (exp, _) in _cache.items() if exp <= now]:
                    del _cache[stale]
            _cache[key] = (now + ttl, valid)

    if not valid:
        raise HTTPException(status_code=400, detail=INVALID_KEY_DETAIL)

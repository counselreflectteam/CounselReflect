"""
FastAPI backend for CounselReflect.

Simple API with health check endpoint and evaluator listing.
"""
from os.path import join, dirname
from dotenv import load_dotenv
import os
import secrets
import threading
import time

dotenv_path = join(dirname(__file__), '.env')
load_dotenv(dotenv_path)

from fastapi import FastAPI, HTTPException, Path, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging

# Import routers
from evaluators.routes import router as evaluators_router
from customizePipeline.routes import router as customize_router
from literature.routes import router as literature_router
from models.routes import router as models_router
from summary.routes import router as summary_router
from share_import.routes import router as share_import_router

# Import response models
from schemas import HealthResponse
from utils.cancellation import RUN_ID_PATTERN, cancel_evaluation_run

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Disable verbose HTTP logs from httpx and openai
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)

# Create FastAPI app
app = FastAPI(
    title="CounselReflect API",
    description="API for evaluating therapist-patient conversations",
    version="0.1.0"
)

ACCESS_TOKEN_ENV = "COUNSELREFLECT_ACCESS_TOKEN"
ACCESS_REQUIRED_ENV = "COUNSELREFLECT_ACCESS_REQUIRED"
ACCESS_HEADER = "x-counselreflect-access"
PUBLIC_ACCESS_PATHS = {
    "/access/status",
    "/access/verify",
}


class AccessVerifyRequest(BaseModel):
    access_token: str = ""


def _configured_access_token() -> str | None:
    token = os.getenv(ACCESS_TOKEN_ENV)
    return token.strip() if token and token.strip() else None


def _deployment_requires_access_token() -> bool:
    return os.getenv(ACCESS_REQUIRED_ENV, "").strip().lower() in {"1", "true", "yes", "on"}


def _matches_access_token(provided: str, access_token: str) -> bool:
    # Constant-time comparison so response timing leaks nothing about the token.
    return secrets.compare_digest(provided.encode("utf-8"), access_token.encode("utf-8"))


# Brute-force deterrent for the shared access code. The code's entropy is the
# real defense; this limiter only slows scripted guessing. A CORRECT code is
# always accepted before the limiter is consulted, so it can never lock out
# legitimate users — important because behind the prod TLS proxy every client
# shares one peer IP and would otherwise share one bucket.
FAILED_ATTEMPT_LIMIT = 10
FAILED_ATTEMPT_WINDOW_SECONDS = 300.0
_failed_attempts: dict[str, list[float]] = {}
_failed_attempts_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _register_failed_attempt(client_ip: str) -> bool:
    """Record a failed guess; True when the caller should get 429, not 403."""
    now = time.monotonic()
    cutoff = now - FAILED_ATTEMPT_WINDOW_SECONDS
    with _failed_attempts_lock:
        # Drop stale IPs so an attacker rotating sources can't grow the map.
        if len(_failed_attempts) > 10_000:
            for ip in [ip for ip, ts in _failed_attempts.items() if not ts or ts[-1] < cutoff]:
                del _failed_attempts[ip]
        attempts = [ts for ts in _failed_attempts.get(client_ip, []) if ts >= cutoff]
        attempts.append(now)
        _failed_attempts[client_ip] = attempts
        return len(attempts) > FAILED_ATTEMPT_LIMIT


def _clear_failed_attempts(client_ip: str) -> None:
    with _failed_attempts_lock:
        _failed_attempts.pop(client_ip, None)


if _deployment_requires_access_token() and not _configured_access_token():
    raise RuntimeError(
        f"{ACCESS_TOKEN_ENV} must be configured when {ACCESS_REQUIRED_ENV}=true"
    )


@app.middleware("http")
async def require_access_token(request: Request, call_next):
    access_token = _configured_access_token()
    if not access_token:
        return await call_next(request)

    if request.method == "OPTIONS" or request.url.path in PUBLIC_ACCESS_PATHS:
        return await call_next(request)

    provided = request.headers.get(ACCESS_HEADER, "").strip()
    if not _matches_access_token(provided, access_token):
        # Only actual wrong codes count: header-less traffic (probes, health
        # checks) must not fill anyone's bucket.
        if provided and _register_failed_attempt(_client_ip(request)):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many failed access attempts. Try again later."}
            )
        return JSONResponse(
            status_code=403,
            content={"detail": "Access code required for this CounselReflect preview."}
        )

    return await call_next(request)


# Reject oversized request bodies before they are buffered/parsed: the API is
# public and a multi-hundred-MB JSON body would otherwise be read into memory.
MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024


class _BodyTooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    def __init__(self, app, max_body_bytes: int = MAX_REQUEST_BODY_BYTES):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(value) > self.max_body_bytes:
                        await self._reject(send)
                        return
                except ValueError:
                    pass

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes:
                    # Chunked upload with no Content-Length: stop reading.
                    raise _BodyTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await self._reject(send)

    async def _reject(self, send):
        body = (
            b'{"detail":"Request body is too large. The limit is 2 MB."}'
        )
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        })
        await send({"type": "http.response.body", "body": body})


app.add_middleware(BodySizeLimitMiddleware)


# CORS middleware (allow Chrome extension to call API).
# Auth uses the X-CounselReflect-Access header (not cookies), so credentialed
# CORS is unnecessary and unsafe to combine with a wildcard origin.
# IMPORTANT: registered AFTER require_access_token — Starlette runs the
# last-registered middleware outermost, so CORS must be added last for the
# access gate's short-circuit 403 to carry Access-Control-Allow-Origin
# (otherwise cross-origin browsers see an opaque network error and the
# client's access-code recovery path never runs).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/access/status")
def access_status():
    return {"required": bool(_configured_access_token())}


@app.post("/access/verify")
def access_verify(payload: AccessVerifyRequest, request: Request):
    access_token = _configured_access_token()
    if not access_token:
        return {"valid": True}
    candidate = payload.access_token.strip()
    if not _matches_access_token(candidate, access_token):
        if candidate and _register_failed_attempt(_client_ip(request)):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
        raise HTTPException(status_code=403, detail="Invalid access code.")
    _clear_failed_attempts(_client_ip(request))
    return {"valid": True}


@app.post("/evaluation-runs/{run_id}/cancel")
def cancel_run(
    run_id: str = Path(..., min_length=8, max_length=128, pattern=RUN_ID_PATTERN),
):
    """Signal every active stream belonging to one evaluation run to stop."""
    active_streams = cancel_evaluation_run(run_id)
    return {
        "run_id": run_id,
        "cancelled": True,
        "active_streams": active_streams,
    }


# Include routers
app.include_router(evaluators_router, prefix="/predefined_metrics")
app.include_router(customize_router, prefix="/customize_pipeline")
app.include_router(literature_router, prefix="/literature")
app.include_router(models_router, prefix="/models")
app.include_router(summary_router, prefix="/summary")
app.include_router(share_import_router, prefix="/share_import")
@app.get("/", response_model=HealthResponse)
def root():
    """Root endpoint."""
    return {
        "status": "healthy",
        "version": "0.1.0"
    }


if __name__ == "__main__":
    import uvicorn
    
    # Use string reference to delay imports and avoid nest_asyncio conflicts
    # Note: reload disabled due to nest_asyncio compatibility issues
    uvicorn.run("main:app", host="127.0.0.1", port=8000)

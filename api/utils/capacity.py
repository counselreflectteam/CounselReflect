"""Global cap on concurrently running evaluations.

The API is public, and the evaluation endpoints do real work on this box
(local torch models) or spend the server-paid HF endpoint budget. A small
global semaphore keeps a burst of requests from pegging the 2-vCPU host or
starving the shared request threadpool. Callers past the cap get an
immediate 429 rather than a queue — queued connections would hold threadpool
tokens open, which is exactly the exhaustion this guards against.

Slots are counted per evaluation RUN, not per request: one click of
"Generate report" fans out into up to three parallel streams (predefined /
custom / literature phases) sharing a client-generated run_id, and those
must share one slot so a single user can never crowd themselves out.
Requests without a run_id fall back to one slot per request.
"""
import functools
import os
import threading
from typing import Callable, Dict, Generator, Optional, TypeVar

from fastapi import HTTPException

T = TypeVar("T")

SERVER_BUSY_DETAIL = (
    "We run on one small server, and every analysis seat is taken right now. "
    "Please give it a minute and try again."
)
RETRY_AFTER_SECONDS = "60"


def _max_concurrent_evaluations() -> int:
    raw = os.getenv("COUNSELREFLECT_MAX_CONCURRENT_EVALUATIONS", "2")
    try:
        return max(1, int(raw))
    except ValueError:
        return 2


_slots = threading.BoundedSemaphore(_max_concurrent_evaluations())
_runs_lock = threading.Lock()
_run_refcounts: Dict[str, int] = {}


def _busy() -> HTTPException:
    return HTTPException(
        status_code=429,
        detail=SERVER_BUSY_DETAIL,
        headers={"Retry-After": RETRY_AFTER_SECONDS},
    )


def acquire_evaluation_slot(run_id: Optional[str] = None) -> None:
    """Take a slot or fail fast with 429 — never block the caller.

    Phases sharing a run_id share (refcount) a single slot.
    """
    if run_id:
        with _runs_lock:
            if run_id in _run_refcounts:
                _run_refcounts[run_id] += 1
                return
        if not _slots.acquire(blocking=False):
            raise _busy()
        with _runs_lock:
            if run_id in _run_refcounts:
                # Another phase of this run won the race for its own slot;
                # keep one slot per run and give the spare back.
                _run_refcounts[run_id] += 1
                _slots.release()
            else:
                _run_refcounts[run_id] = 1
        return

    if not _slots.acquire(blocking=False):
        raise _busy()


def release_evaluation_slot(run_id: Optional[str] = None) -> None:
    if run_id:
        with _runs_lock:
            count = _run_refcounts.get(run_id)
            if count is None:  # pragma: no cover - double-release guard
                return
            if count > 1:
                _run_refcounts[run_id] = count - 1
                return
            del _run_refcounts[run_id]
    try:
        _slots.release()
    except ValueError:  # pragma: no cover - double-release guard
        pass


def with_evaluation_slot(fn: Callable[..., T]) -> Callable[..., T]:
    """Hold a slot for the duration of a synchronous evaluation endpoint."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        request = kwargs.get("request") or (args[0] if args else None)
        run_id = getattr(request, "run_id", None)
        acquire_evaluation_slot(run_id)
        try:
            return fn(*args, **kwargs)
        finally:
            release_evaluation_slot(run_id)

    return wrapper


def release_slot_after(
    generator: Generator[str, None, None], run_id: Optional[str] = None
) -> Generator[str, None, None]:
    """Hold an already-acquired slot until a streaming response finishes.

    Acquire the slot immediately before constructing the StreamingResponse
    (after request validation), then wrap the event generator with this so
    the slot is freed when the stream completes, errors, or the client
    disconnects (GeneratorExit also runs the finally).
    """
    try:
        yield from generator
    finally:
        release_evaluation_slot(run_id)

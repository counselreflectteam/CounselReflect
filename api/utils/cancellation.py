"""Run-scoped cancellation shared by all evaluation streaming endpoints."""

from __future__ import annotations

from dataclasses import dataclass, field
import re
import threading
import time
from typing import Optional


RUN_ID_PATTERN = r"^[A-Za-z0-9._:-]{8,128}$"
_RUN_ID_RE = re.compile(RUN_ID_PATTERN)
_CANCELLED_TOMBSTONE_SECONDS = 300.0


class EvaluationCancelled(RuntimeError):
    """Raised when an evaluation run has been cancelled by the client."""


@dataclass
class _RunState:
    event: threading.Event = field(default_factory=threading.Event)
    active_streams: int = 0
    updated_at: float = field(default_factory=time.monotonic)


_lock = threading.Lock()
_runs: dict[str, _RunState] = {}


def _validate_run_id(run_id: str) -> str:
    normalized = run_id.strip()
    if not _RUN_ID_RE.fullmatch(normalized):
        raise ValueError("Invalid evaluation run ID")
    return normalized


def _remove_expired_tombstones(now: float) -> None:
    expired = [
        run_id
        for run_id, state in _runs.items()
        if state.active_streams == 0
        and state.event.is_set()
        and now - state.updated_at >= _CANCELLED_TOMBSTONE_SECONDS
    ]
    for run_id in expired:
        _runs.pop(run_id, None)


def register_evaluation_run(run_id: Optional[str]) -> Optional[threading.Event]:
    """Register one active stream and return its run-wide cancellation event."""
    if not run_id:
        return None

    normalized = _validate_run_id(run_id)
    now = time.monotonic()
    with _lock:
        _remove_expired_tombstones(now)
        state = _runs.setdefault(normalized, _RunState())
        state.active_streams += 1
        state.updated_at = now
        return state.event


def release_evaluation_run(run_id: Optional[str]) -> None:
    """Release one stream registration while preserving cancelled tombstones."""
    if not run_id:
        return

    normalized = _validate_run_id(run_id)
    with _lock:
        state = _runs.get(normalized)
        if state is None:
            return
        state.active_streams = max(0, state.active_streams - 1)
        state.updated_at = time.monotonic()
        if state.active_streams == 0 and not state.event.is_set():
            _runs.pop(normalized, None)


def cancel_evaluation_run(run_id: str) -> int:
    """Cancel a run and return the number of streams currently registered."""
    normalized = _validate_run_id(run_id)
    now = time.monotonic()
    with _lock:
        _remove_expired_tombstones(now)
        state = _runs.setdefault(normalized, _RunState())
        state.event.set()
        state.updated_at = now
        return state.active_streams


def raise_if_cancelled(event: Optional[threading.Event]) -> None:
    if event is not None and event.is_set():
        raise EvaluationCancelled("Evaluation cancelled by the user.")


def reset_cancellation_registry_for_tests() -> None:
    """Clear process-local state. Intended only for isolated tests."""
    with _lock:
        _runs.clear()

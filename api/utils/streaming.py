"""Helpers for newline-delimited JSON streaming responses."""

from __future__ import annotations

import os
import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import threading
import time
from typing import Callable, Generator, TypeVar

from utils.cancellation import EvaluationCancelled, raise_if_cancelled


T = TypeVar("T")

NDJSON_RESPONSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
}


def heartbeat_interval_seconds() -> float:
    """Return a bounded heartbeat interval for long-running metric calls."""
    raw_value = os.getenv("STREAM_HEARTBEAT_SECONDS", "15")
    try:
        value = float(raw_value)
    except ValueError:
        value = 15.0
    return min(max(value, 1.0), 60.0)


def run_with_heartbeats(
    operation: Callable[[], T],
    metric_name: str,
    cancellation_event: threading.Event | None = None,
) -> Generator[str, None, T]:
    """Run a blocking metric call while yielding proxy keepalive events."""
    raise_if_cancelled(cancellation_event)
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="metric-stream")
    future = executor.submit(operation)
    heartbeat_seconds = heartbeat_interval_seconds()
    next_heartbeat = time.monotonic() + heartbeat_seconds
    try:
        while True:
            raise_if_cancelled(cancellation_event)
            wait_seconds = min(0.25, max(0.01, next_heartbeat - time.monotonic()))
            try:
                return future.result(timeout=wait_seconds)
            except FutureTimeoutError:
                raise_if_cancelled(cancellation_event)
                if time.monotonic() >= next_heartbeat:
                    yield json.dumps({
                        "type": "heartbeat",
                        "metric": metric_name,
                    }) + "\n"
                    next_heartbeat = time.monotonic() + heartbeat_seconds
    finally:
        # A provider SDK call cannot generally be interrupted safely. Do not
        # hold the response generator open after a client disconnect, and
        # cancel the task when it has not started yet.
        future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)

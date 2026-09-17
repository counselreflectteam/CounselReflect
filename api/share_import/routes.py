"""Import a transcript from a public AI-chat share link.

Claude exposes shared conversations as JSON. ChatGPT has an internal JSON
endpoint too, but it is not a public contract and may be blocked even when the
public /share page works. For ChatGPT we therefore try that compact response
first, then fall back to the bounded React Router payload embedded in the
public HTML page. Both paths are fetched and normalized server-side (the
browser cannot read those hosts cross-origin).

Gemini has no public JSON for a share; its content renders only after a
signed-in, interstitial-gated browser session, so it is reported as
unsupported with a message steering the user to file upload.

SECURITY — this endpoint fetches a URL derived from user input, so it is a
classic SSRF surface. Two defenses, both mandatory:
  1. The host must exactly match a hardcoded allowlist (no internal/metadata
     hosts, no redirects followed to arbitrary origins).
  2. We never fetch the user's raw URL. We extract only the share id with a
     strict regex and rebuild the request URL from a constant template, so a
     crafted path/query/userinfo can't redirect the fetch anywhere else.
"""
from __future__ import annotations

import json as _json
import logging
import re
import threading
from html.parser import HTMLParser
from typing import Callable
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Limits (abuse / memory guards) ------------------------------------------
_HTTP_TIMEOUT_S = 15
_CHATGPT_INTERNAL_TIMEOUT_S = 8
_MAX_RESPONSE_BYTES = 12 * 1024 * 1024  # hard ceiling read from the wire
_MAX_MESSAGES = 2000
_MAX_CHARS_PER_MESSAGE = 100_000
_MAX_TOTAL_CHARS = 1_500_000
_MAX_HTML_SCRIPTS = 128
_MAX_INLINE_SCRIPT_BYTES = 2 * 1024 * 1024
_MAX_TURBO_VALUES = 50_000
_MAX_TURBO_DEPTH = 48
_MAX_TURBO_CONTAINER_ITEMS = 10_000

# Cap concurrent outbound fetches so a burst of imports can't exhaust the
# shared request threadpool (every endpoint here is sync) or hammer the
# providers from this server's IP. Non-blocking: past the cap we return 429.
_FETCH_SLOTS = threading.BoundedSemaphore(6)

# --- Share-id shapes ---------------------------------------------------------
# ChatGPT/Claude ids are UUID-like or 32-hex; Gemini slugs are short hex. Keep
# these tight — they are the trust boundary for what we rebuild and fetch.
_UUIDISH = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_CHATGPT_ID = re.compile(r"^[0-9a-fA-F-]{20,40}$")
_GEMINI_ID = re.compile(r"^[0-9a-zA-Z]{6,40}$")
_TURBO_KEY = re.compile(r"^_(\d+)$")
_CHATGPT_STREAM_CALL = re.compile(
    r"^\s*window\.__reactRouterContext\.streamController\.enqueue\((.+)\);?\s*$",
    re.DOTALL,
)


class ShareImportRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)


class ShareMessage(BaseModel):
    # Raw speaker label from the source ("user"/"assistant"/"human"); the
    # frontend maps it to a therapist/client Role via its single normalizeRole,
    # so role semantics live in exactly one place.
    speaker: str
    text: str


class ShareImportResponse(BaseModel):
    provider: str
    title: str
    messages: list[ShareMessage]
    turn_count: int


def _http_get_bytes(
    url: str,
    referer: str,
    *,
    accept: str = "*/*",
    timeout_s: int = _HTTP_TIMEOUT_S,
) -> tuple[bytes, str]:
    """Fetch a provider response with a browser TLS fingerprint.

    Imported lazily so the rest of the API still boots if curl_cffi is missing
    in a given environment. The caller only supplies URLs rebuilt from fixed
    provider templates; the raw user URL never reaches this function.

    Hardened against the two SSRF/DoS footguns of "fetch a URL server-side":
      - allow_redirects=False: the allowlist + rebuilt URL only constrain the
        FIRST hop, so a provider 3xx must NOT be chased to an arbitrary origin.
      - the body is streamed and capped at _MAX_RESPONSE_BYTES before JSON or
        HTML parsing, so a giant response can't blow up worker memory.
    """
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError as exc:  # pragma: no cover - environment hint
        raise HTTPException(
            status_code=503,
            detail="Share import is unavailable on this server (missing curl_cffi).",
        ) from exc

    if not _FETCH_SLOTS.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="Too many imports in progress. Please try again in a moment.",
        )
    response = None
    try:
        try:
            response = cffi_requests.get(
                url,
                impersonate="chrome",
                timeout=timeout_s,
                allow_redirects=False,
                stream=True,
                headers={"Accept": accept, "Referer": referer},
            )
        except Exception as exc:
            # Provider exceptions can include the requested URL. Share ids are
            # bearer-like locators, so log only the exception class.
            logger.warning("share import network error (%s)", type(exc).__name__)
            raise HTTPException(
                status_code=502,
                detail="Could not reach the share link. Check the link and try again.",
            ) from exc

        status = response.status_code
        if status == 404:
            raise HTTPException(
                status_code=404,
                detail="This shared conversation was not found. It may have been deleted or set private.",
            )
        if status in (401, 403):
            raise HTTPException(
                status_code=422,
                detail="This conversation isn't public. Make sure the share link is set to public, then try again.",
            )
        # Never chase a redirect: the allowlist only vouches for this host.
        if 300 <= status < 400 or status != 200:
            raise HTTPException(
                status_code=502,
                detail=f"The share host returned an unexpected response ({status}).",
            )

        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                if int(content_length) > _MAX_RESPONSE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="This conversation is too large to import. Please upload it as a file instead.",
                    )
            except ValueError:
                # A malformed header is not trusted; the streamed hard cap
                # below remains authoritative.
                pass

        buffer = bytearray()
        try:
            for chunk in response.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                buffer.extend(chunk)
                if len(buffer) > _MAX_RESPONSE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="This conversation is too large to import. Please upload it as a file instead.",
                    )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="The share link did not return a readable conversation.",
            ) from exc
        return bytes(buffer), str(response.headers.get("Content-Type") or "")
    finally:
        if response is not None:
            try:
                response.close()
            except Exception:
                pass
        _FETCH_SLOTS.release()


def _http_get_json(url: str, referer: str, *, timeout_s: int = _HTTP_TIMEOUT_S) -> dict:
    raw, _content_type = _http_get_bytes(
        url,
        referer,
        accept="application/json, */*;q=0.8",
        timeout_s=timeout_s,
    )
    try:
        payload = _json.loads(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The share link did not return a readable conversation.",
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Unexpected response from the share host.")
    return payload


def _http_get_html(url: str, referer: str) -> str:
    raw, content_type = _http_get_bytes(
        url,
        referer,
        accept="text/html,application/xhtml+xml;q=0.9,*/*;q=0.7",
    )
    if "text/html" not in content_type.lower():
        raise HTTPException(
            status_code=502,
            detail="The public share page returned an unexpected response.",
        )
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="The public share page was not readable.",
        ) from exc


def _clip(text: str) -> str:
    return text[:_MAX_CHARS_PER_MESSAGE]


def _finalize(provider: str, title: str, messages: list[ShareMessage]) -> ShareImportResponse:
    if not messages:
        raise HTTPException(
            status_code=422,
            detail="No conversation text could be read from this share link.",
        )
    # Too-many-turns and too-many-chars both reject with the same "upload a
    # file" guidance — never silently truncate a transcript, which would hand
    # the researcher a partial conversation with no warning.
    total = sum(len(m.text) for m in messages)
    if len(messages) > _MAX_MESSAGES or total > _MAX_TOTAL_CHARS:
        raise HTTPException(
            status_code=413,
            detail="This conversation is too large to import. Please upload it as a file instead.",
        )
    clean_title = (title.strip() if isinstance(title, str) else "") or "Imported conversation"
    return ShareImportResponse(
        provider=provider,
        title=clean_title[:200],
        messages=messages,
        turn_count=len(messages),
    )


# --- ChatGPT -----------------------------------------------------------------
class _ChatGPTPageDecodeError(ValueError):
    """Raised for malformed/unsupported public-page serialization.

    The exception intentionally carries no provider body or conversation text,
    so it is safe to catch or log by class name.
    """


class _ChatGPTStreamHTMLParser(HTMLParser):
    """Collect only bounded React Router stream scripts from a share page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.scripts: list[str] = []
        self._in_script = False
        self._discard_script = False
        self._script_count = 0
        self._script_chars = 0
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return
        self._script_count += 1
        if self._script_count > _MAX_HTML_SCRIPTS:
            raise _ChatGPTPageDecodeError("too many scripts")
        self._in_script = True
        self._discard_script = False
        self._script_chars = 0
        self._chunks = []

    def handle_data(self, data: str) -> None:
        if not self._in_script or self._discard_script:
            return
        self._script_chars += len(data)
        if self._script_chars > _MAX_INLINE_SCRIPT_BYTES:
            self._discard_script = True
            self._chunks = []
            return
        self._chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "script" or not self._in_script:
            return
        if not self._discard_script:
            script = "".join(self._chunks)
            if (
                "window.__reactRouterContext.streamController.enqueue" in script
                and "linear_conversation" in script
            ):
                self.scripts.append(script)
        self._in_script = False
        self._discard_script = False
        self._script_chars = 0
        self._chunks = []


def _turbo_key_name(values: list, raw_key: str) -> str:
    match = _TURBO_KEY.fullmatch(raw_key)
    if match is None:
        return raw_key
    index = int(match.group(1))
    if index >= len(values) or not isinstance(values[index], str):
        raise _ChatGPTPageDecodeError("invalid object key reference")
    return values[index]


def _turbo_raw_object(values: list, ref: object) -> dict:
    if isinstance(ref, bool) or not isinstance(ref, int) or ref < 0 or ref >= len(values):
        raise _ChatGPTPageDecodeError("invalid object reference")
    value = values[ref]
    if not isinstance(value, dict):
        raise _ChatGPTPageDecodeError("expected object")
    if len(value) > _MAX_TURBO_CONTAINER_ITEMS:
        raise _ChatGPTPageDecodeError("object too large")
    return value


def _turbo_field_ref(values: list, raw_object: dict, wanted: str) -> object:
    for raw_key, raw_ref in raw_object.items():
        if not isinstance(raw_key, str):
            raise _ChatGPTPageDecodeError("non-string object key")
        if _turbo_key_name(values, raw_key) == wanted:
            return raw_ref
    raise _ChatGPTPageDecodeError("missing required field")


def _turbo_optional_field_ref(values: list, raw_object: dict, wanted: str) -> object | None:
    for raw_key, raw_ref in raw_object.items():
        if not isinstance(raw_key, str):
            raise _ChatGPTPageDecodeError("non-string object key")
        if _turbo_key_name(values, raw_key) == wanted:
            return raw_ref
    return None


def _turbo_decode_ref(
    values: list,
    ref: object,
    *,
    memo: dict[int, object],
    budget: list[int],
    depth: int = 0,
) -> object:
    if depth > _MAX_TURBO_DEPTH:
        raise _ChatGPTPageDecodeError("payload nesting too deep")
    if isinstance(ref, bool) or not isinstance(ref, int):
        raise _ChatGPTPageDecodeError("invalid value reference")
    # Turbo Stream uses negative values for null/undefined/holes and special
    # numeric sentinels. None is sufficient for fields the transcript parser
    # does not use, and avoids executing or instantiating special types.
    if ref < 0:
        return None
    if ref >= len(values):
        raise _ChatGPTPageDecodeError("value reference out of range")
    if ref in memo:
        return memo[ref]

    budget[0] += 1
    if budget[0] > _MAX_TURBO_VALUES:
        raise _ChatGPTPageDecodeError("too many decoded values")

    raw = values[ref]
    if raw is None or isinstance(raw, (str, bool, int, float)):
        memo[ref] = raw
        return raw

    if isinstance(raw, list):
        if len(raw) > _MAX_TURBO_CONTAINER_ITEMS:
            raise _ChatGPTPageDecodeError("array too large")
        # Literal leading strings identify Turbo Stream typed/deferred values
        # (Promise, Date, Map, etc.). They are unrelated to transcript turns;
        # ignore them rather than interpreting executable/framework semantics.
        if raw and isinstance(raw[0], str):
            memo[ref] = None
            return None
        decoded_list: list[object] = []
        memo[ref] = decoded_list
        decoded_list.extend(
            _turbo_decode_ref(values, item, memo=memo, budget=budget, depth=depth + 1)
            for item in raw
        )
        return decoded_list

    if isinstance(raw, dict):
        if len(raw) > _MAX_TURBO_CONTAINER_ITEMS:
            raise _ChatGPTPageDecodeError("object too large")
        decoded_object: dict[str, object] = {}
        memo[ref] = decoded_object
        for raw_key, raw_value_ref in raw.items():
            if not isinstance(raw_key, str):
                raise _ChatGPTPageDecodeError("non-string object key")
            key = _turbo_key_name(values, raw_key)
            decoded_object[key] = _turbo_decode_ref(
                values,
                raw_value_ref,
                memo=memo,
                budget=budget,
                depth=depth + 1,
            )
        return decoded_object

    raise _ChatGPTPageDecodeError("unsupported serialized value")


def _chatgpt_data_from_turbo_values(values: list, expected_share_id: str) -> dict:
    if not values or len(values) > _MAX_TURBO_VALUES:
        raise _ChatGPTPageDecodeError("invalid value table")

    root = _turbo_raw_object(values, 0)
    loader_data = _turbo_raw_object(values, _turbo_field_ref(values, root, "loaderData"))

    route_data: dict | None = None
    for route_ref in loader_data.values():
        try:
            candidate = _turbo_raw_object(values, route_ref)
            id_ref = _turbo_field_ref(values, candidate, "sharedConversationId")
            decoded_id = _turbo_decode_ref(values, id_ref, memo={}, budget=[0])
        except _ChatGPTPageDecodeError:
            continue
        if decoded_id == expected_share_id:
            route_data = candidate
            break

    if route_data is None:
        raise _ChatGPTPageDecodeError("matching share route not found")

    server_response = _turbo_raw_object(
        values,
        _turbo_field_ref(values, route_data, "serverResponse"),
    )
    data = _turbo_raw_object(values, _turbo_field_ref(values, server_response, "data"))

    memo: dict[int, object] = {}
    budget = [0]
    public_ref = _turbo_optional_field_ref(values, data, "is_public")
    if public_ref is not None:
        is_public = _turbo_decode_ref(values, public_ref, memo=memo, budget=budget)
        if is_public is not True:
            raise HTTPException(
                status_code=422,
                detail="This conversation isn't public. Make sure the share link is set to public, then try again.",
            )

    payload: dict[str, object] = {}
    for field in ("title", "linear_conversation", "mapping"):
        field_ref = _turbo_optional_field_ref(values, data, field)
        if field_ref is not None:
            payload[field] = _turbo_decode_ref(
                values,
                field_ref,
                memo=memo,
                budget=budget,
            )

    if not isinstance(payload.get("linear_conversation"), list) and not isinstance(payload.get("mapping"), dict):
        raise _ChatGPTPageDecodeError("conversation nodes missing")
    return payload


def _parse_chatgpt_share_html(html: str, expected_share_id: str) -> dict:
    parser = _ChatGPTStreamHTMLParser()
    try:
        parser.feed(html)
        parser.close()
    except (AssertionError, _ChatGPTPageDecodeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="The public ChatGPT share page was not readable.",
        ) from exc

    for script in parser.scripts:
        match = _CHATGPT_STREAM_CALL.fullmatch(script)
        if match is None:
            continue
        try:
            # The argument is a JSON string literal containing a JSON line.
            # Decode twice with json.loads; never eval or execute page script.
            decoded_chunk = _json.loads(match.group(1))
            if not isinstance(decoded_chunk, str):
                continue
            for line in decoded_chunk.splitlines():
                if not line.strip().startswith("["):
                    continue
                values = _json.loads(line)
                if not isinstance(values, list):
                    continue
                return _chatgpt_data_from_turbo_values(values, expected_share_id)
        except HTTPException:
            raise
        except (TypeError, ValueError, _json.JSONDecodeError, _ChatGPTPageDecodeError):
            continue

    raise HTTPException(
        status_code=502,
        detail=(
            "ChatGPT's public share page did not include readable conversation data. "
            "Open the link in a private window or upload the transcript as a file."
        ),
    )


def _fetch_chatgpt_payload(share_id: str) -> dict:
    internal_url = f"https://chatgpt.com/backend-api/share/{share_id}"
    public_url = f"https://chatgpt.com/share/{share_id}"
    try:
        internal_payload = _http_get_json(
            internal_url,
            referer=public_url,
            timeout_s=_CHATGPT_INTERNAL_TIMEOUT_S,
        )
        if isinstance(internal_payload.get("linear_conversation"), list) or isinstance(
            internal_payload.get("mapping"),
            dict,
        ):
            return internal_payload
        raise HTTPException(status_code=502, detail="Unexpected ChatGPT share response.")
    except HTTPException as internal_error:
        # Resource/availability protections are local guarantees and should not
        # be bypassed with a second request. Provider 4xx/5xx, a challenge page,
        # a timeout, or a changed JSON shape may safely try the rebuilt public
        # URL under the same redirect and response-size limits.
        if internal_error.status_code in (413, 429, 503):
            raise

    try:
        html = _http_get_html(public_url, referer=public_url)
        return _parse_chatgpt_share_html(html, share_id)
    except HTTPException as public_error:
        if public_error.status_code in (404, 413, 422, 429, 503):
            raise
        logger.warning(
            "ChatGPT public-page fallback failed (status=%s)",
            public_error.status_code,
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "ChatGPT did not return a readable public conversation. "
                "Try again or upload the transcript as a file."
            ),
        ) from public_error


def _import_chatgpt(share_id: str) -> ShareImportResponse:
    if not _CHATGPT_ID.match(share_id):
        raise HTTPException(status_code=400, detail="That doesn't look like a valid ChatGPT share link.")
    data = _fetch_chatgpt_payload(share_id)
    nodes = data.get("linear_conversation")
    if not isinstance(nodes, list) or not nodes:
        mapping = data.get("mapping") or {}
        nodes = list(mapping.values()) if isinstance(mapping, dict) else []

    messages: list[ShareMessage] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        message = node.get("message")
        if not isinstance(message, dict):
            continue
        author = message.get("author")
        role = author.get("role") if isinstance(author, dict) else None
        if role not in ("user", "assistant"):
            continue
        content = message.get("content")
        if not isinstance(content, dict):
            continue
        # "text" is a plain turn; "multimodal_text" is a turn with an attachment
        # (screenshot etc.) — its `parts` still carry the spoken text as strings
        # alongside image dicts, so keep it and let the isinstance filter drop
        # the non-text parts. Tool/thinking/system content types are skipped.
        if content.get("content_type") not in ("text", "multimodal_text"):
            continue
        parts = content.get("parts")
        if not isinstance(parts, list):
            continue
        text = "\n\n".join(p.strip() for p in parts if isinstance(p, str) and p.strip())
        if not text:
            continue
        messages.append(ShareMessage(speaker=role, text=_clip(text)))
        if len(messages) > _MAX_MESSAGES:
            break

    return _finalize("openai", data.get("title") or "ChatGPT conversation", messages)


# --- Claude ------------------------------------------------------------------
def _claude_blocks_to_text(blocks: list) -> str:
    parts: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            text = (block.get("text") or "").strip()
            if text:
                parts.append(text)
        # thinking / tool_use / tool_result blocks are intentionally dropped:
        # a therapy transcript is the spoken turns, not the model's scratchpad.
    return "\n\n".join(parts)


def _import_claude(share_id: str) -> ShareImportResponse:
    if not _UUIDISH.match(share_id):
        raise HTTPException(status_code=400, detail="That doesn't look like a valid Claude share link.")
    data = _http_get_json(
        f"https://claude.ai/api/chat_snapshots/{share_id}",
        referer=f"https://claude.ai/share/{share_id}",
    )
    raw = data.get("chat_messages")
    raw = raw if isinstance(raw, list) else []
    def _sort_index(message: dict) -> int:
        value = message.get("index")
        return value if isinstance(value, int) else 0

    ordered = sorted((m for m in raw if isinstance(m, dict)), key=_sort_index)

    messages: list[ShareMessage] = []
    for message in ordered:
        sender = str(message.get("sender") or "").lower()
        if sender not in ("human", "assistant"):
            continue
        content = message.get("content")
        text = ""
        if isinstance(content, list) and content:
            text = _claude_blocks_to_text(content)
        if not text:
            fallback = message.get("text")
            text = fallback.strip() if isinstance(fallback, str) else ""
        if not text:
            continue
        messages.append(ShareMessage(speaker=sender, text=_clip(text)))
        if len(messages) > _MAX_MESSAGES:
            break

    return _finalize("claude", data.get("snapshot_name") or "Claude conversation", messages)


# --- Gemini (unsupported, graceful) ------------------------------------------
def _import_gemini(_share_id: str) -> ShareImportResponse:
    raise HTTPException(
        status_code=422,
        detail=(
            "Gemini shared links can't be imported automatically yet. "
            "Open the conversation, copy the text into a .txt file, and upload it here instead."
        ),
    )


# --- Host allowlist / dispatch -----------------------------------------------
# host -> (id extractor from path, importer). Only these exact hosts are ever
# fetched. `www.` is normalized off before lookup.
def _last_path_segment(path: str) -> str:
    return path.rstrip("/").split("/")[-1] if path else ""


_HANDLERS: dict[str, tuple[Callable[[str], str], Callable[[str], ShareImportResponse]]] = {
    "chatgpt.com": (_last_path_segment, _import_chatgpt),
    "chat.openai.com": (_last_path_segment, _import_chatgpt),
    "claude.ai": (_last_path_segment, _import_claude),
    "gemini.google.com": (_last_path_segment, _import_gemini),
    "g.co": (_last_path_segment, _import_gemini),
}


@router.post("/fetch", response_model=ShareImportResponse)
def import_share(request: ShareImportRequest) -> ShareImportResponse:
    raw = request.url.strip()
    if "://" not in raw:
        raw = "https://" + raw
    try:
        parsed = urlparse(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="That doesn't look like a valid link.")

    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http(s) share links are supported.")

    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]

    handler = _HANDLERS.get(host)
    if handler is None:
        raise HTTPException(
            status_code=422,
            detail="Unsupported link. Paste a public ChatGPT or Claude share link (chatgpt.com/share/… or claude.ai/share/…).",
        )

    extract_id, importer = handler
    share_id = extract_id(parsed.path or "")
    # For Gemini we still want the tailored message, so validate ids inside
    # each importer rather than rejecting a well-formed-but-unsupported link here.
    if importer is not _import_gemini and not share_id:
        raise HTTPException(status_code=400, detail="No share id found in that link.")
    if importer is _import_gemini and not _GEMINI_ID.match(share_id or ""):
        # Still route to the Gemini handler for its guidance message.
        share_id = share_id or ""

    return importer(share_id)

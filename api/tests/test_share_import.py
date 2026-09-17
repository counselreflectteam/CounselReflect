"""Tests for the share-link transcript importer.

These exercise the SSRF/host-allowlist boundary and the ChatGPT/Claude parsers
without network access (the fetch layer is monkeypatched). The dispatch/SSRF
cases don't even reach the fetch — a disallowed host is rejected first.
"""
import json

import pytest
from fastapi import HTTPException

from share_import import routes as R
from share_import.routes import (
    ShareImportRequest,
    ShareMessage,
    import_share,
    _finalize,
    _import_chatgpt,
    _import_claude,
)


CHATGPT_SHARE_ID = "00000000-0000-4000-8000-000000000001"


def _turbo_share_html(
    share_id: str = CHATGPT_SHARE_ID,
    *,
    public: bool = True,
    include_script_text: bool = False,
) -> str:
    """Build the small plain-value subset of ChatGPT's Turbo Stream table.

    The production decoder intentionally understands only this JSON reference
    graph; it never executes page JavaScript. Synthetic turns keep the real
    shared conversation out of the test suite.
    """
    payload = {
        "title": "Synthetic share",
        "is_public": public,
        "linear_conversation": [
            {
                "message": {
                    "author": {"role": "user"},
                    "content": {
                        "content_type": "text",
                        "parts": ["hello </script> safely" if include_script_text else "hello"],
                    },
                }
            },
            {
                "message": {
                    "author": {"role": "assistant"},
                    "content": {"content_type": "text", "parts": ["hi"]},
                }
            },
        ],
    }
    root = {
        "loaderData": {
            "root": {"disableSSR": False},
            "routes/share.$shareId.($action)": {
                "sharedConversationId": share_id,
                "serverResponse": {"type": "data", "data": payload},
            },
        }
    }

    values: list = []

    def encode(value):
        ref = len(values)
        values.append(None)
        if isinstance(value, dict):
            encoded = {}
            for key, item in value.items():
                key_ref = encode(str(key))
                encoded[f"_{key_ref}"] = encode(item)
            values[ref] = encoded
        elif isinstance(value, list):
            values[ref] = [encode(item) for item in value]
        else:
            values[ref] = value
        return ref

    assert encode(root) == 0
    stream = json.dumps(values, separators=(",", ":")) + "\n"
    # ChatGPT escapes markup-sensitive characters inside the JSON string so a
    # turn containing </script> remains data and cannot end the script element.
    argument = json.dumps(stream, separators=(",", ":")).replace("<", "\\u003c")
    return (
        '<script id="client-bootstrap" type="application/json">'
        '{"linear_conversation":"decoy"}'
        "</script>"
        "<script>"
        "window.__reactRouterContext.streamController.enqueue("
        f"{argument});"
        "</script>"
    )


def _run(url: str):
    return import_share(ShareImportRequest(url=url))


# --------------------------------------------------------------------------- #
# Host allowlist / SSRF boundary                                              #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/",   # cloud metadata
        "http://localhost:8000/access/verify",         # internal service
        "https://evil.example.com/share/abc",          # arbitrary host
        "https://chatgpt.com.evil.com/share/abc",       # suffix trick
        "ftp://chatgpt.com/share/abc",                  # non-http scheme
    ],
)
def test_disallowed_hosts_are_rejected_without_fetch(url, monkeypatch):
    # If the allowlist ever leaks, this call would try to fetch — make that loud.
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: pytest.fail("fetched a disallowed host"))
    with pytest.raises(HTTPException) as exc:
        _run(url)
    assert exc.value.status_code in (400, 422)


def test_userinfo_host_does_not_bypass_allowlist(monkeypatch):
    # urlparse hostname is the real host; the userinfo before @ must not fool it.
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: pytest.fail("fetched wrong host"))
    with pytest.raises(HTTPException):
        _run("https://chatgpt.com@evil.example.com/share/abc")


def test_gemini_is_reported_unsupported_not_fetched(monkeypatch):
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: pytest.fail("Gemini should not be fetched"))
    with pytest.raises(HTTPException) as exc:
        _run("https://gemini.google.com/share/aaaabbbbcccc")
    assert exc.value.status_code == 422
    assert "Gemini" in exc.value.detail


def test_chatgpt_traversal_id_is_rejected(monkeypatch):
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: pytest.fail("should not fetch a bad id"))
    with pytest.raises(HTTPException) as exc:
        _run("https://chatgpt.com/share/../../backend-api/me")
    assert exc.value.status_code == 400


# --------------------------------------------------------------------------- #
# ChatGPT parsing                                                             #
# --------------------------------------------------------------------------- #
def test_chatgpt_multimodal_text_turn_is_kept(monkeypatch):
    payload = {
        "title": "Screenshot chat",
        "linear_conversation": [
            {"message": {"author": {"role": "user"}, "content": {
                "content_type": "multimodal_text",
                "parts": [{"content_type": "image_asset_pointer"}, "here is the screenshot text"]}}},
            {"message": {"author": {"role": "assistant"}, "content": {
                "content_type": "text", "parts": ["What did you feel reading it?"]}}},
        ],
    }
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: payload)
    result = _import_chatgpt("00000000-0000-4000-8000-000000000001")
    assert result.turn_count == 2
    assert result.messages[0].speaker == "user"
    assert "screenshot text" in result.messages[0].text


def test_chatgpt_skips_system_and_tool_turns(monkeypatch):
    payload = {"title": "x", "linear_conversation": [
        {"message": {"author": {"role": "system"}, "content": {"content_type": "text", "parts": ["hidden"]}}},
        {"message": {"author": {"role": "tool"}, "content": {"content_type": "text", "parts": ["tool out"]}}},
        {"message": {"author": {"role": "user"}, "content": {"content_type": "text", "parts": ["hello"]}}},
    ]}
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: payload)
    result = _import_chatgpt("00000000-0000-4000-8000-000000000001")
    assert [m.speaker for m in result.messages] == ["user"]


def test_chatgpt_malformed_nodes_do_not_crash(monkeypatch):
    payload = {"title": "x", "linear_conversation": [
        None, "junk", {"message": None},
        {"message": {"author": None, "content": {"content_type": "text", "parts": ["x"]}}},
        {"message": {"author": {"role": "user"}, "content": {"content_type": "text", "parts": ["ok"]}}},
    ]}
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: payload)
    result = _import_chatgpt("00000000-0000-4000-8000-000000000001")
    assert result.turn_count == 1 and result.messages[0].text == "ok"


def test_chatgpt_uses_public_page_fallback_when_internal_json_is_blocked(monkeypatch):
    calls = []

    def blocked_internal(url, referer, **_kwargs):
        calls.append(("json", url, referer))
        raise HTTPException(status_code=422, detail="provider challenge")

    def public_page(url, referer):
        calls.append(("html", url, referer))
        return _turbo_share_html(include_script_text=True)

    monkeypatch.setattr(R, "_http_get_json", blocked_internal)
    monkeypatch.setattr(R, "_http_get_html", public_page)

    result = _import_chatgpt(CHATGPT_SHARE_ID)

    assert result.turn_count == 2
    assert [message.speaker for message in result.messages] == ["user", "assistant"]
    assert "</script> safely" in result.messages[0].text
    assert calls == [
        (
            "json",
            f"https://chatgpt.com/backend-api/share/{CHATGPT_SHARE_ID}",
            f"https://chatgpt.com/share/{CHATGPT_SHARE_ID}",
        ),
        (
            "html",
            f"https://chatgpt.com/share/{CHATGPT_SHARE_ID}",
            f"https://chatgpt.com/share/{CHATGPT_SHARE_ID}",
        ),
    ]


def test_chatgpt_public_page_requires_matching_share_id(monkeypatch):
    monkeypatch.setattr(
        R,
        "_http_get_json",
        lambda *args, **kwargs: (_ for _ in ()).throw(HTTPException(status_code=502)),
    )
    monkeypatch.setattr(
        R,
        "_http_get_html",
        lambda *args, **kwargs: _turbo_share_html(share_id="11111111-1111-1111-1111-111111111111"),
    )

    with pytest.raises(HTTPException) as exc:
        _import_chatgpt(CHATGPT_SHARE_ID)

    assert exc.value.status_code == 502
    assert "readable public conversation" in exc.value.detail


def test_chatgpt_falls_back_when_internal_json_shape_changes(monkeypatch):
    monkeypatch.setattr(R, "_http_get_json", lambda *args, **kwargs: {"status": "ok"})
    monkeypatch.setattr(
        R,
        "_http_get_html",
        lambda *args, **kwargs: _turbo_share_html(),
    )

    result = _import_chatgpt(CHATGPT_SHARE_ID)

    assert result.turn_count == 2


def test_chatgpt_public_page_must_be_public(monkeypatch):
    monkeypatch.setattr(
        R,
        "_http_get_json",
        lambda *args, **kwargs: (_ for _ in ()).throw(HTTPException(status_code=502)),
    )
    monkeypatch.setattr(
        R,
        "_http_get_html",
        lambda *args, **kwargs: _turbo_share_html(public=False),
    )

    with pytest.raises(HTTPException) as exc:
        _import_chatgpt(CHATGPT_SHARE_ID)

    assert exc.value.status_code == 422
    assert "isn't public" in exc.value.detail


def test_chatgpt_does_not_bypass_local_response_limit_with_fallback(monkeypatch):
    monkeypatch.setattr(
        R,
        "_http_get_json",
        lambda *args, **kwargs: (_ for _ in ()).throw(HTTPException(status_code=413)),
    )
    monkeypatch.setattr(
        R,
        "_http_get_html",
        lambda *args, **kwargs: pytest.fail("413 must not make a second outbound request"),
    )

    with pytest.raises(HTTPException) as exc:
        _import_chatgpt(CHATGPT_SHARE_ID)

    assert exc.value.status_code == 413


# --------------------------------------------------------------------------- #
# Claude parsing                                                              #
# --------------------------------------------------------------------------- #
def test_claude_orders_by_index_and_maps_sender(monkeypatch):
    payload = {"snapshot_name": "Session", "chat_messages": [
        {"sender": "assistant", "index": 1, "content": [{"type": "text", "text": "Hi, how are you?"}]},
        {"sender": "human", "index": 0, "text": "I feel low."},
    ]}
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: payload)
    result = _import_claude("00000000-0000-4000-8000-000000000000")
    assert [m.speaker for m in result.messages] == ["human", "assistant"]
    assert result.messages[0].text == "I feel low."


def test_claude_drops_thinking_blocks(monkeypatch):
    payload = {"snapshot_name": "x", "chat_messages": [
        {"sender": "assistant", "index": 0, "content": [
            {"type": "thinking", "thinking": "scratchpad"},
            {"type": "text", "text": "The spoken answer."}]},
    ]}
    monkeypatch.setattr(R, "_http_get_json", lambda *a, **k: payload)
    result = _import_claude("00000000-0000-4000-8000-000000000000")
    assert result.messages[0].text == "The spoken answer."


# --------------------------------------------------------------------------- #
# Finalize: limits + title                                                    #
# --------------------------------------------------------------------------- #
def test_empty_conversation_is_422():
    with pytest.raises(HTTPException) as exc:
        _finalize("openai", "t", [])
    assert exc.value.status_code == 422


def test_too_many_messages_is_413_not_truncated():
    msgs = [ShareMessage(speaker="user", text="a") for _ in range(2001)]
    with pytest.raises(HTTPException) as exc:
        _finalize("openai", "t", msgs)
    assert exc.value.status_code == 413


def test_whitespace_title_falls_back():
    result = _finalize("openai", "   ", [ShareMessage(speaker="user", text="hi")])
    assert result.title == "Imported conversation"

"""Prompt improvement through a language model (1.51.5, the capability plan): any service speaking the common chat completions
API, on this computer or hosted. Its address, model and optional key
are kept in the engine's data folder, readable only by the user; the key is never handed back to the page."""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from app.core import config
from app.services import outbound, secrets

RULE = "Reply with the rewritten prompt only: no preamble, no quotes, no explanation."


class LlmError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def _path() -> Path:
    return config.data_dir() / "llm.json"


def _settings() -> dict:
    try:
        s = json.loads(_path().read_text())
        return s if isinstance(s, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(s: dict) -> None:
    path = _path()
    temp = path.with_suffix(".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(s, f)
    os.replace(temp, path)
    os.chmod(path, 0o600)


DEFAULT_ROW = "default"
MAX_ROWS = 20


def _rows(s: dict | None = None) -> list[dict]:
    """The language model rows the person typed in: an id, a name, an address, a model and whether it reads pictures.
    A settings file from before the rows is one row, "default"."""
    s = _settings() if s is None else s
    rows = [r for r in s.get("rows") or [] if isinstance(r, dict) and r.get("id") and r.get("baseUrl") and r.get("model")]
    if not rows and s.get("baseUrl") and s.get("model"):
        rows = [{"id": DEFAULT_ROW, "name": s["model"], "baseUrl": s["baseUrl"], "model": s["model"], "vision": True}]
    return rows


def _active(s: dict | None = None) -> dict:
    s = _settings() if s is None else s
    rows = _rows(s)
    return next((r for r in rows if r["id"] == s.get("active")), rows[0] if rows else {})


def _secret_name(row_id: str) -> str:
    return "llm" if row_id == DEFAULT_ROW else f"llm-{row_id}"


def _file_funcs(row_id: str):
    def read() -> str | None:
        s = _settings()
        return (s.get("key") if row_id == DEFAULT_ROW else (s.get("keys") or {}).get(row_id)) or None

    def clear() -> None:
        s = _settings()
        if row_id == DEFAULT_ROW and "key" in s:
            s.pop("key")
            _write(s)
        elif (s.get("keys") or {}).pop(row_id, None) is not None:
            _write(s)

    def write(key: str) -> None:
        s = _settings()
        if row_id == DEFAULT_ROW:
            s["key"] = key
        else:
            s["keys"] = {**(s.get("keys") or {}), row_id: key}
        _write(s)
    return read, clear, write


def _row_key(row_id: str) -> str | None:
    """A row's key: from the password store, a file copy moved there first (1.52.5); or the file where there is none."""
    read, clear, _ = _file_funcs(row_id)
    return secrets.get(_secret_name(row_id), read, clear)


def _key() -> str | None:
    row = _active()
    return _row_key(row["id"]) if row else None


#: Keys a service refused, as (row, digest of the key) to the time it did; a different key is not in it, so a new key lifts the flag.
_refused: dict[str, float] = {}


def _print(row_id: str, key: str | None) -> str | None:
    import hashlib
    return f"{row_id}:{hashlib.sha256(key.encode()).hexdigest()}" if key else None


def _row_state(row_id: str) -> tuple[bool, str, str | None]:
    """For status: whether a row has a key and its last four, without the password store (1.98.9)."""
    read, _, _ = _file_funcs(row_id)
    return secrets.summary(_secret_name(row_id), read)


def _row_public(r: dict) -> dict:
    has, last4, key = _row_state(r["id"])
    mark = _print(r["id"], key)
    return {"id": r["id"], "name": r.get("name") or r["model"], "baseUrl": r["baseUrl"], "model": r["model"], "vision": bool(r.get("vision")), "hasKey": has,
            "last4": last4, "refusedAt": _refused.get(mark, 0) if mark else 0}


def status() -> dict:
    s = _settings()
    rows = _rows(s)
    act = _active(s)
    return {"configured": bool(act), "baseUrl": act.get("baseUrl", ""), "model": act.get("model", ""), "vision": bool(act.get("vision")), "active": act.get("id", ""), "hasKey": bool(act and _row_state(act["id"])[0]),
            "rows": [_row_public(r) for r in rows],
            "store": secrets.where()["store"]}


def _check(base_url: str, model: str, key: str | None, forget_key: bool) -> tuple[str, str]:
    parsed = urllib.parse.urlparse(base_url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise LlmError("The address must be an http:// or https:// address, such as http://localhost:11434/v1 for a model on this computer.", 422)
    model = model.strip()
    if not model or len(model) > 200:
        raise LlmError("Name the model to use.", 422)
    if key is not None and key.strip() and not forget_key and (len(key.strip()) > 512 or any(c.isspace() for c in key.strip())):
        raise LlmError("That does not look like an API key.", 422)
    return base_url.strip().rstrip("/"), model


def _keep_key(row_id: str, key: str | None, forget_key: bool) -> None:
    _, clear, write = _file_funcs(row_id)
    if forget_key:
        secrets.delete(_secret_name(row_id), clear)
    elif key is not None and key.strip():
        secrets.put(_secret_name(row_id), key.strip(), write, clear)


def save(base_url: str, model: str, key: str | None = None, forget_key: bool = False) -> dict:
    """The older single-row form: changes the active row, or makes the first one."""
    base_url, model = _check(base_url, model, key, forget_key)
    s = _settings()
    act = _active(s)
    rid = act.get("id", DEFAULT_ROW)
    row = {**act, "id": rid, "name": act.get("name") if act.get("name") and act.get("name") != act.get("model") else model, "baseUrl": base_url, "model": model, "vision": bool(act.get("vision", True))}
    s["rows"] = [row if r["id"] == rid else r for r in _rows(s)] if act else [row]
    s["active"] = rid
    s["baseUrl"], s["model"] = base_url, model
    _write(s)
    _keep_key(rid, key, forget_key)
    return status()


def save_row(row_id: str | None, name: str, base_url: str, model: str, vision: bool, key: str | None = None, forget_key: bool = False) -> dict:
    """Adds a row (no id) or changes one; it becomes the one in use when it is the first."""
    base_url, model = _check(base_url, model, key, forget_key)
    s = _settings()
    rows = _rows(s)
    if row_id is None:
        if len(rows) >= MAX_ROWS:
            raise LlmError(f"At most {MAX_ROWS} language models are kept. Remove one first.", 422)
        row_id = uuid.uuid4().hex[:10]
    elif not any(r["id"] == row_id for r in rows):
        raise LlmError("That language model is not in the list.", 404)
    row = {"id": row_id, "name": name.strip()[:80] or model, "baseUrl": base_url, "model": model, "vision": bool(vision)}
    s["rows"] = [row if r["id"] == row_id else r for r in rows] if any(r["id"] == row_id for r in rows) else rows + [row]
    if not s.get("active") or not any(r["id"] == s["active"] for r in s["rows"]):
        s["active"] = row_id
    act = _active(s)
    s["baseUrl"], s["model"] = act["baseUrl"], act["model"]
    _write(s)
    _keep_key(row_id, key, forget_key)
    return status()


def use_row(row_id: str) -> dict:
    s = _settings()
    rows = _rows(s)
    if not any(r["id"] == row_id for r in rows):
        raise LlmError("That language model is not in the list.", 404)
    s["rows"], s["active"] = rows, row_id
    act = _active(s)
    s["baseUrl"], s["model"] = act["baseUrl"], act["model"]
    _write(s)
    return status()


def delete_row(row_id: str) -> dict:
    s = _settings()
    rows = _rows(s)
    if not any(r["id"] == row_id for r in rows):
        raise LlmError("That language model is not in the list.", 404)
    _, clear, _w = _file_funcs(row_id)
    secrets.delete(_secret_name(row_id), clear)
    s = _settings()
    s["rows"] = [r for r in rows if r["id"] != row_id]
    if not s["rows"]:
        s["baseUrl"], s["model"] = "", ""
    if s.get("active") == row_id:
        s["active"] = s["rows"][0]["id"] if s["rows"] else ""
    act = _active(s)
    s["baseUrl"], s["model"] = act.get("baseUrl", ""), act.get("model", "")
    if row_id == DEFAULT_ROW:
        s.pop("key", None)
    _write(s)
    return status()


def _call(path: str, body: dict | None = None, timeout: float = 120) -> dict:
    s = _active()
    if not s.get("baseUrl") or not s.get("model"):
        raise LlmError("Set a language model first, in Preferences > Plugins.", 428)
    key = _key()
    mark = _print(s.get("id", ""), key)
    headers = {"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})}
    req = urllib.request.Request(s["baseUrl"] + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method="POST" if body is not None else "GET")
    try:
        with outbound.opener.open(req, timeout=timeout) as r:
            if mark:
                _refused.pop(mark, None)
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            if mark:
                _refused[mark] = time.time()
            raise LlmError("The model's service refused the key.", 502)
        if exc.code == 404:
            raise LlmError(f"The service at {s['baseUrl']} has no such model or path.", 502)
        raise LlmError(f"The model's service answered with an error ({exc.code}).", 502)
    except (urllib.error.URLError, OSError) as exc:
        raise LlmError(f"Nothing answers at {s['baseUrl']}. Start the service, or check its address. ({exc.__class__.__name__})", 502)
    except ValueError:
        raise LlmError("The model's service did not answer in the expected form.", 502)


def chat(messages: list, tools: list) -> dict:
    """The assistant (1.52.2): one step of a conversation with tools, as a chat completions API takes it; the
    model's message (its text and any tool calls). The key stays here."""
    if not isinstance(messages, list) or not 0 < len(messages) <= 200:
        raise LlmError("The conversation is empty or too long.", 400)
    body = {"model": _active().get("model"), "messages": _budget_pictures(messages, MAX_PICTURES if _active().get("vision") else 0), "temperature": 0.3, "max_tokens": 1200,
            **({"tools": tools, "tool_choice": "auto"} if tools else {})}
    return _shape(_call("/chat/completions", body, timeout=180), body)


def _shape(reply: dict, body: dict) -> dict:
    choices = reply.get("choices") or []
    message = (choices[0] if choices else {}).get("message") or {}
    calls = [c for c in (message.get("tool_calls") or []) if isinstance(c, dict) and isinstance(c.get("function"), dict)]
    used = reply.get("usage") if isinstance(reply.get("usage"), dict) else {}
    count = lambda k: int(used.get(k)) if isinstance(used.get(k), (int, float)) and used.get(k) >= 0 else 0
    return {"content": message.get("content") or "", "tool_calls": [{"id": str(c.get("id") or f"call_{i}"), "name": str(c["function"].get("name") or ""),
            "arguments": str(c["function"].get("arguments") or "{}")} for i, c in enumerate(calls)],
            "usage": {"prompt_tokens": count("prompt_tokens"), "completion_tokens": count("completion_tokens"), "total_tokens": count("total_tokens")},
            "pictures": sum(1 for m in body["messages"] for p in (m.get("content") if isinstance(m, dict) and isinstance(m.get("content"), list) else []) if isinstance(p, dict) and p.get("type") == "image_url")}


def chat_stream(messages: list, tools: list):
    """`chat` as server-sent events: {"delta": text} for each piece of the reply as the service sends it, then {"done": the
    reply as `chat` gives it}; {"error", "status"} when the service fails. A service that answers without streaming (or
    refuses stream: true with a 400) gives the whole reply as the one done event."""
    try:
        if not isinstance(messages, list) or not 0 < len(messages) <= 200:
            raise LlmError("The conversation is empty or too long.", 400)
        s = _active()
        if not s.get("baseUrl") or not s.get("model"):
            raise LlmError("Set a language model first, in Preferences > Plugins.", 428)
        body = {"model": s.get("model"), "messages": _budget_pictures(messages, MAX_PICTURES if s.get("vision") else 0), "temperature": 0.3, "max_tokens": 1200,
                **({"tools": tools, "tool_choice": "auto"} if tools else {})}
        key = _key()
        req = urllib.request.Request(s["baseUrl"] + "/chat/completions", data=json.dumps({**body, "stream": True, "stream_options": {"include_usage": True}}).encode(), method="POST",
                                     headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})})
        try:
            r = outbound.opener.open(req, timeout=180)
        except urllib.error.HTTPError as exc:
            if exc.code in (400, 422):
                yield {"done": _shape(_call("/chat/completions", body, timeout=180), body)}
                return
            raise LlmError("The model's service refused the key." if exc.code in (401, 403) else f"The service at {s['baseUrl']} has no such model or path." if exc.code == 404 else f"The model's service answered with an error ({exc.code}).", 502)
        except (urllib.error.URLError, OSError) as exc:
            raise LlmError(f"Nothing answers at {s['baseUrl']}. Start the service, or check its address. ({exc.__class__.__name__})", 502)
        with r:
            if "event-stream" not in (r.headers.get("Content-Type") or ""):
                yield {"done": _shape(json.loads(r.read() or b"{}"), body)}
                return
            text, calls, usage = [], {}, {}
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except ValueError:
                    continue
                if isinstance(chunk.get("usage"), dict):
                    usage = chunk["usage"]
                delta = ((chunk.get("choices") or [{}])[0] or {}).get("delta") or {}
                if isinstance(delta.get("content"), str) and delta["content"]:
                    text.append(delta["content"])
                    yield {"delta": delta["content"]}
                for c in delta.get("tool_calls") or []:
                    if isinstance(c, dict):
                        slot = calls.setdefault(int(c.get("index") or 0), {"id": "", "function": {"name": "", "arguments": ""}})
                        slot["id"] = c.get("id") or slot["id"]
                        fn = c.get("function") if isinstance(c.get("function"), dict) else {}
                        slot["function"]["name"] += str(fn.get("name") or "")
                        slot["function"]["arguments"] += str(fn.get("arguments") or "")
            message = {"content": "".join(text), "tool_calls": [calls[i] for i in sorted(calls)]}
            yield {"done": _shape({"choices": [{"message": message}], "usage": usage}, body)}
    except LlmError as exc:
        yield {"error": str(exc), "status": exc.status}
    except (OSError, ValueError) as exc:
        yield {"error": f"The model's service did not answer in the expected form. ({exc.__class__.__name__})", "status": 502}


MAX_PICTURES = 4
MAX_PICTURE_BYTES = 1_500_000


def _budget_pictures(messages: list, limit: int = MAX_PICTURES) -> list:
    """The pictures one request may carry: the newest `limit` (none for a model that does not read pictures), each under
    MAX_PICTURE_BYTES as a data address; the rest become a line of text, so the service is never sent more than the budget."""
    parts = [(i, j) for i, m in enumerate(messages) if isinstance(m, dict) and isinstance(m.get("content"), list)
             for j, p in enumerate(m["content"]) if isinstance(p, dict) and p.get("type") == "image_url"]
    keep = set(parts[-limit:]) if limit > 0 else set()
    out = []
    for i, m in enumerate(messages):
        if isinstance(m, dict) and isinstance(m.get("content"), list):
            content = []
            for j, p in enumerate(m["content"]):
                if isinstance(p, dict) and p.get("type") == "image_url":
                    url = str((p.get("image_url") or {}).get("url") or "") if isinstance(p.get("image_url"), dict) else ""
                    if (i, j) not in keep or not url.startswith("data:image/") or len(url) > MAX_PICTURE_BYTES:
                        p = {"type": "text", "text": "[a picture left out: over the picture budget]"}
                content.append(p)
            m = {**m, "content": content}
        out.append(m)
    return out


CHAT_LIMIT = 100
CHAT_LIMIT_MAX = 1000
CHAT_BYTES = 2_000_000


def _chats() -> Path:
    path = config.data_dir() / "chats"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _chat_file(chat_id: str) -> Path:
    if not isinstance(chat_id, str) or not re.fullmatch(r"[a-z0-9]{8,32}", chat_id):
        raise LlmError("That is not a saved chat.", 404)
    return _chats() / f"{chat_id}.json"


def chats() -> list[dict]:
    """The saved chats, newest first: id, title, when it was last saved and how many messages it holds."""
    out = []
    for f in _chats().glob("*.json"):
        try:
            c = json.loads(f.read_text())
            out.append({"id": f.stem, "title": str(c.get("title") or "Chat")[:80], "updated": float(c.get("updated") or 0), "messages": len(c.get("lines") or [])})
        except (OSError, ValueError, TypeError):
            continue
    return sorted(out, key=lambda c: -c["updated"])


def chat_get(chat_id: str) -> dict:
    try:
        return json.loads(_chat_file(chat_id).read_text())
    except (OSError, ValueError):
        raise LlmError("That chat is not saved.", 404)


def chat_put(chat_id: str, chat: dict) -> dict:
    """Saves a chat in the data folder, readable only by the user; at most CHAT_LIMIT chats are kept (the oldest go) and one is at most CHAT_BYTES."""
    path = _chat_file(chat_id)
    if not isinstance(chat, dict) or not isinstance(chat.get("history"), list) or not isinstance(chat.get("lines"), list):
        raise LlmError("A chat needs its history and its lines.", 422)
    data = json.dumps({"title": str(chat.get("title") or "Chat")[:80], "updated": time.time(), "history": chat["history"], "lines": chat["lines"], "usage": chat.get("usage") or {}})
    if len(data.encode()) > CHAT_BYTES:
        raise LlmError("This chat is too long to save. Start a new chat.", 413)
    temp = path.with_suffix(".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(data)
    os.replace(temp, path)
    keep = chat.get("keep")
    keep = min(CHAT_LIMIT_MAX, max(1, int(keep))) if isinstance(keep, (int, float)) and not isinstance(keep, bool) else CHAT_LIMIT
    for old in chats()[keep:]:
        _chat_file(old["id"]).unlink(missing_ok=True)
    return {"id": chat_id}


def chat_delete(chat_id: str) -> None:
    _chat_file(chat_id).unlink(missing_ok=True)


def chats_clear() -> int:
    """Removes every saved chat (the assistant's Delete all chats); returns how many went."""
    gone = 0
    for f in _chats().glob("*.json"):
        f.unlink(missing_ok=True)
        gone += 1
    return gone


def models() -> list[str]:
    """The model ids the service offers (how Check proves the connection)."""
    data = _call("/models", timeout=10).get("data", [])
    return [str(m.get("id")) for m in data if isinstance(m, dict) and m.get("id")][:200]


_COMMON = frozenset("with that this from into over under onto have been about there their where which while some very just like make made each your would could should than then them they will what when were also only more most much many".split())


def _dropped(original: str, rewritten: str) -> list[str]:
    """The words and numbers of `original` that `rewritten` no longer has (matched by their first four letters, so a plural
    or an ending does not count): details the model may have dropped, for the person to look at. At most six."""
    heads = {w[:4] for w in re.findall(r"[\w'-]+", rewritten.lower())}
    out: list[str] = []
    for w in re.findall(r"[\w'-]+", re.sub(r"@img\d+", " ", original, flags=re.I)):
        k = w.lower()
        if (len(k) >= 4 or k.isdigit()) and k not in _COMMON and k[:4] not in heads and k not in out:
            out.append(k)
    return out[:6]


def _added(original: str, rewritten: str) -> list[str]:
    """The names and numbers `rewritten` brings that `original` did not have (a capitalised word inside a sentence, or a
    number): specifics the model may have invented, for the person to look at. At most six."""
    have = {w.lower() for w in re.findall(r"[\w'-]+", original)}
    out: list[str] = []
    for m in re.finditer(r"(?<=[a-z,;:] )[A-Z][\w'-]{2,}|\b\d[\d.,]*\b", rewritten):
        k = m.group(0).rstrip(".,")
        if k.lower() not in have and k not in out:
            out.append(k)
    return out[:6]


def _named_pictures(prompt: str, references: list | None) -> list[tuple[str, str]]:
    """The reference pictures a request may carry, as (token, data address): those with a data address under the size
    limit, the ones the prompt names first, each token once."""
    named = {t.lower() for t in re.findall(r"@img\d+", prompt, re.I)}
    out: dict[str, str] = {}
    for r in references or []:
        token = str(r.get("token") or "").lower() if isinstance(r, dict) else ""
        url = r.get("picture") if isinstance(r, dict) else None
        if re.fullmatch(r"@img\d+", token) and token not in out and isinstance(url, str) and url.startswith("data:image/") and len(url) <= MAX_PICTURE_BYTES:
            out[token] = url
    return sorted(out.items(), key=lambda kv: (kv[0] not in named, int(kv[0][4:])))


_SHARED_RULES = "Follow every colour and material word of the request exactly. Write in English, translating the request if it is in another language. Output only the finished prompt as plain text: no list, no preamble, no quotes and no negative prompt. The request is repeated at the end of the message; keep to it."

USE_RULES = {
    "fill": "You rewrite a request for filling a selected area of a picture. Write one English paragraph of about 40 to 80 words that describes the final content of that area. Start with the subject, then its materials and colours, then the lighting, perspective and scale, matched to the surroundings.",
    "add": "You rewrite a request for adding something to a picture. Write one English paragraph of about 40 to 80 words that describes the final content of the area. Start with the subject, then its materials and colours, then the lighting, perspective and scale, matched to the surroundings.",
    "remove": "You rewrite a request for taking something out of a picture. Write 30 to 60 words that describe only the background that remains once the thing is gone: its surface, colours, texture and light. Never name the thing that is taken out and never use the word remove.",
    "edit": "You rewrite a request for changing a picture. Write one imperative sentence of 15 to 35 words that starts with a verb and names the subject as it is seen. Apply exactly the colours and materials asked for, and end with what must stay unchanged.",
    "outpaint": "You rewrite a request for extending a picture past its edges. Write 40 to 80 words that describe how the scene continues beyond the edges: what lies there, in the same light, perspective and style, with no visible seam.",
    "upscale": "You rewrite a request for enlarging a picture. Describe faithfully what is present and ask for fine detail and crisp texture, without changing the content or adding anything new.",
}


def improve(prompt: str, instructions: str, picture: str = "", references: list | None = None, use_case: str = "") -> dict:
    """`prompt` rewritten by the model under `instructions` (a prompt template). With a `use_case` (a key of USE_RULES) its
    rules lead the system message, the template follows as lower priority guidance, and the request is repeated last. With `picture` (a data address of the
    area the prompt is for) and `references` (each a token such as @img1 and the data address of the picture it names)
    and a model row marked as reading pictures, the model sees them too, each reference labelled with its token; at
    most MAX_PICTURES go in the request, the area last. The @img tokens of the prompt stay: any the model dropped are
    put back at the end and named in `restored`; `shown` names the references the model saw."""
    prompt, instructions, use_case = prompt.strip(), instructions.strip(), use_case.strip().lower()
    if not prompt:
        raise LlmError("Write a prompt to improve first.", 400)
    if use_case and use_case not in USE_RULES:
        raise LlmError(f"The use case is one of {', '.join(USE_RULES)}.", 400)
    reads = bool(_active().get("vision"))
    area = picture.startswith("data:image/") and len(picture) <= MAX_PICTURE_BYTES and reads
    shown = _named_pictures(prompt, references)[:MAX_PICTURES - (1 if area else 0)] if reads else []
    seen = area
    keep = "\n\nKeep every @img token such as @img1 exactly as written." if re.search(r"@img\d+", prompt, re.I) else ""
    look = "\n\nThe picture is the area the prompt is for: describe what belongs there and do not invent what it contradicts." if seen else ""
    who = "\n\nThe pictures after the prompt are the references; each is labelled with the @img token that names it in the prompt. Say what a token's picture adds only where the prompt needs it, and keep the token." if shown else ""
    parts = [{"type": "text", "text": prompt[:4000]}]
    for token, url in sorted(shown, key=lambda kv: int(kv[0][4:])):
        parts += [{"type": "text", "text": f"{token}:"}, {"type": "image_url", "image_url": {"url": url}}]
    if seen:
        parts += [{"type": "text", "text": "The area:"}, {"type": "image_url", "image_url": {"url": picture}}]
    if use_case and len(parts) > 1:
        parts.append({"type": "text", "text": f"The request again: {prompt[:4000]}"})
    user = parts if len(parts) > 1 else prompt[:4000]
    lead = f"{USE_RULES[use_case]}\n\n{_SHARED_RULES}" + (f"\n\nGuidance from the person's template, below the rules above:\n{instructions[:8000]}" if instructions else "") if use_case else instructions[:8000]
    body = {"model": _active().get("model"), "temperature": 0.7, "max_tokens": 600,
            "messages": [{"role": "system", "content": f"{lead}{keep}{look}{who}\n\n{RULE}"}, {"role": "user", "content": user}]}
    choices = _call("/chat/completions", body).get("choices") or []
    text = str(((choices[0] if choices else {}).get("message") or {}).get("content") or "").strip()
    for prefix in ("prompt:", "rewritten prompt:", "improved prompt:"):
        if text.lower().startswith(prefix):
            text = text[len(prefix):].strip()
    text = text.strip().strip('"').strip("\u201c\u201d").strip()
    if not text:
        raise LlmError("The model answered with nothing.", 502)
    text = text[:3900]
    lost = [t for t in dict.fromkeys(re.findall(r"@img\d+", prompt, re.I)) if t.lower() not in text.lower()]
    if lost:
        text = f"{text} {' '.join(lost)}"
    gone, new = _dropped(prompt, text), _added(prompt, text)
    return {"prompt": text, **({"restored": lost} if lost else {}), **({"seen": True} if seen else {}), **({"shown": [t for t, _ in sorted(shown, key=lambda kv: int(kv[0][4:]))]} if shown else {}), **({"dropped": gone} if gone else {}), **({"added": new} if new else {})}


STARTER_TEMPLATES = {
    "Richer detail": "You rewrite prompts for an image model. Keep the subject and the intent. Add concrete visual detail: materials, lighting, lens and framing, colour and mood. Write one or two sentences.",
    "Fill a selection": "You rewrite prompts for filling a selected area of an existing picture. Describe only what should appear in that area, so that it blends with what surrounds it: the same light, perspective and texture. Write one sentence.",
    "Short and plain": "You tidy prompts for an image model: correct the spelling, remove filler words, and keep it short and literal.",
    "Generate a new picture": "You rewrite prompts for making a new picture from nothing. Keep the subject and the intent. Name the subject, its setting, the composition, the light and the style, in the order a person would look at the picture. Write two or three sentences.",
    "Edit instruction": "You rewrite prompts that tell an image model how to change an existing picture. Write one imperative sentence that names what to change and what to keep as it is. Do not describe the whole picture.",
    "Photographic": "You rewrite prompts for a photographic picture. Keep the subject and the intent. Add what a photographer would set: lens and focal length, aperture and depth of field, light and its direction, time of day, film or sensor look, and framing. Write two sentences.",
    "Tag list": "You rewrite prompts as a list of short tags for an image model. Keep the subject and the intent. Give the subject first, then setting, style, light and quality tags, each two words at most, separated by commas, with no sentences.",
    "Transparent asset": "You rewrite prompts for a single object that will be cut out and placed on other pictures. Describe the object alone on a plain, even background, whole and centred, with soft even light and no cast shadow, no text and no other objects. Write one or two sentences.",
}


def template_texts() -> dict[str, str]:
    """The improve templates an agent may name: the starters, with the Markdown files of the data folder's prompt-templates
    folder laid over them (a file's front matter `name`, else its file name; a file whose `use` is not improve is left out)."""
    found = dict(STARTER_TEMPLATES)
    folder = config.data_dir() / "prompt-templates"
    for f in sorted(folder.glob("*.md"))[:100] if folder.is_dir() else []:
        try:
            if f.stat().st_size > 64_000:
                continue
            src = f.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n").lstrip("﻿")
        except OSError:
            continue
        name, body, use = f.stem, src, "improve"
        head = re.match(r"---\n([\s\S]*?)\n---\n?", src)
        if head:
            body = src[head.end():]
            for line in head.group(1).split("\n"):
                kv = re.match(r"^([A-Za-z_-]+)\s*:\s*(.*)$", line)
                if kv and kv.group(1).lower() == "name" and kv.group(2).strip():
                    name = kv.group(2).strip().strip("\"'")[:80]
                if kv and kv.group(1).lower() == "use" and kv.group(2).strip():
                    use = kv.group(2).strip().lower()
        if use == "improve" and body.strip():
            found[name] = body.strip()[:8000]
    return found


def improve_with_template(prompt: str, template: str = "") -> dict:
    """`improve` for an agent: the template named (any case) or Richer detail; `kept` lists the @img tokens of the prompt
    that the reply carries."""
    texts = template_texts()
    pick = next((k for k in texts if k.lower() == (template or "Richer detail").strip().lower()), None)
    if pick is None:
        raise LlmError(f"No improve template is named {template!r}. The templates are: {', '.join(texts)}.", 400)
    out = improve(prompt, texts[pick])
    kept = [t for t in dict.fromkeys(re.findall(r"@img\d+", prompt, re.I)) if t.lower() in out["prompt"].lower()]
    return {**out, "template": pick, "kept": kept}

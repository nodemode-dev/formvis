"""Prompt improvement through a language model (1.51.5, the capability plan): any service speaking the OpenAI-compatible
chat API (OpenAI, OpenRouter, DeepSeek; on this computer Ollama and LM Studio). Its address, model and optional key
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
from app.services import secrets

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


def status() -> dict:
    s = _settings()
    rows = _rows(s)
    act = _active(s)
    return {"configured": bool(act), "baseUrl": act.get("baseUrl", ""), "model": act.get("model", ""), "vision": bool(act.get("vision")), "active": act.get("id", ""), "hasKey": bool(act and _row_key(act["id"])),
            "rows": [{"id": r["id"], "name": r.get("name") or r["model"], "baseUrl": r["baseUrl"], "model": r["model"], "vision": bool(r.get("vision")), "hasKey": bool(_row_key(r["id"]))} for r in rows],
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
    headers = {"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})}
    req = urllib.request.Request(s["baseUrl"] + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise LlmError("The model's service refused the key.", 502)
        if exc.code == 404:
            raise LlmError(f"The service at {s['baseUrl']} has no such model or path.", 502)
        raise LlmError(f"The model's service answered with an error ({exc.code}).", 502)
    except (urllib.error.URLError, OSError) as exc:
        raise LlmError(f"Nothing answers at {s['baseUrl']}. Start the service, or check its address. ({exc.__class__.__name__})", 502)
    except ValueError:
        raise LlmError("The model's service did not answer in the expected form.", 502)


def chat(messages: list, tools: list) -> dict:
    """The assistant (1.52.2): one step of a conversation with tools, as the OpenAI-compatible chat API takes it; the
    model's message (its text and any tool calls). The key stays here."""
    if not isinstance(messages, list) or not 0 < len(messages) <= 200:
        raise LlmError("The conversation is empty or too long.", 400)
    body = {"model": _active().get("model"), "messages": _budget_pictures(messages, MAX_PICTURES if _active().get("vision") else 0), "temperature": 0.3, "max_tokens": 1200,
            **({"tools": tools, "tool_choice": "auto"} if tools else {})}
    reply = _call("/chat/completions", body, timeout=180)
    choices = reply.get("choices") or []
    message = (choices[0] if choices else {}).get("message") or {}
    calls = [c for c in (message.get("tool_calls") or []) if isinstance(c, dict) and isinstance(c.get("function"), dict)]
    used = reply.get("usage") if isinstance(reply.get("usage"), dict) else {}
    count = lambda k: int(used.get(k)) if isinstance(used.get(k), (int, float)) and used.get(k) >= 0 else 0
    return {"content": message.get("content") or "", "tool_calls": [{"id": str(c.get("id") or f"call_{i}"), "name": str(c["function"].get("name") or ""),
            "arguments": str(c["function"].get("arguments") or "{}")} for i, c in enumerate(calls)],
            "usage": {"prompt_tokens": count("prompt_tokens"), "completion_tokens": count("completion_tokens"), "total_tokens": count("total_tokens")},
            "pictures": sum(1 for m in body["messages"] for p in (m.get("content") if isinstance(m, dict) and isinstance(m.get("content"), list) else []) if isinstance(p, dict) and p.get("type") == "image_url")}


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


def improve(prompt: str, instructions: str) -> str:
    """`prompt` rewritten by the model under `instructions` (a prompt template)."""
    prompt, instructions = prompt.strip(), instructions.strip()
    if not prompt:
        raise LlmError("Write a prompt to improve first.", 400)
    body = {"model": _active().get("model"), "temperature": 0.7, "max_tokens": 600,
            "messages": [{"role": "system", "content": f"{instructions[:8000]}\n\n{RULE}"}, {"role": "user", "content": prompt[:4000]}]}
    choices = _call("/chat/completions", body).get("choices") or []
    text = str(((choices[0] if choices else {}).get("message") or {}).get("content") or "").strip()
    for prefix in ("prompt:", "rewritten prompt:", "improved prompt:"):
        if text.lower().startswith(prefix):
            text = text[len(prefix):].strip()
    text = text.strip().strip('"').strip("\u201c\u201d").strip()
    if not text:
        raise LlmError("The model answered with nothing.", 502)
    return text[:4000]

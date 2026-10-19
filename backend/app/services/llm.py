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


def _file_key() -> str | None:
    return _settings().get("key") or None


def _file_clear() -> None:
    s = _settings()
    if "key" in s:
        s.pop("key")
        _write(s)


def _file_write(key: str) -> None:
    s = _settings()
    s["key"] = key
    _write(s)


def _key() -> str | None:
    """The key: from the password store, a file copy moved there first (1.52.5); or the file where there is none."""
    return secrets.get("llm", _file_key, _file_clear)


def status() -> dict:
    s = _settings()
    return {"configured": bool(s.get("baseUrl") and s.get("model")), "baseUrl": s.get("baseUrl", ""), "model": s.get("model", ""), "hasKey": bool(_key()), "store": secrets.where()["store"]}


def save(base_url: str, model: str, key: str | None = None, forget_key: bool = False) -> dict:
    parsed = urllib.parse.urlparse(base_url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise LlmError("The address must be an http:// or https:// address, such as http://localhost:11434/v1 for Ollama.", 422)
    model = model.strip()
    if not model or len(model) > 200:
        raise LlmError("Name the model to use.", 422)
    s = _settings()
    s["baseUrl"], s["model"] = base_url.strip().rstrip("/"), model
    if key is not None and key.strip() and not forget_key and (len(key.strip()) > 512 or any(c.isspace() for c in key.strip())):
        raise LlmError("That does not look like an API key.", 422)
    _write(s)
    if forget_key:
        secrets.delete("llm", _file_clear)
    elif key is not None and key.strip():
        secrets.put("llm", key.strip(), _file_write, _file_clear)
    return status()


def _call(path: str, body: dict | None = None, timeout: float = 120) -> dict:
    s = _settings()
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
    body = {"model": _settings().get("model"), "messages": _budget_pictures(messages), "temperature": 0.3, "max_tokens": 1200,
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


def _budget_pictures(messages: list) -> list:
    """The pictures one request may carry: the newest MAX_PICTURES, each under MAX_PICTURE_BYTES as a data address; the
    rest become a line of text, so the service is never sent more than the budget."""
    parts = [(i, j) for i, m in enumerate(messages) if isinstance(m, dict) and isinstance(m.get("content"), list)
             for j, p in enumerate(m["content"]) if isinstance(p, dict) and p.get("type") == "image_url"]
    keep = set(parts[-MAX_PICTURES:])
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
    body = {"model": _settings().get("model"), "temperature": 0.7, "max_tokens": 600,
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

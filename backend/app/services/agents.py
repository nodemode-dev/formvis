"""Outside agents' consent and activity (DEV_PLAN 28.4): who is connected (from MCP clientInfo), what each may do, the
steps waiting for the person's approval, and the feed the window shows. The MCP router asks this module before a tool
runs and tells it how the run ended; the /api/agents routes let the window read it and answer."""

import asyncio
import collections
import itertools
import json
import time
import uuid

from app.core import config

POLICIES = ("allow", "ask", "deny")
POLICY_LABELS = {"allow": "Allow all", "ask": "Ask for risky steps", "deny": "Deny"}
APPROVAL_SECONDS = 120.0
LOG_LIMIT = 200
RISKY_TOOLS = {"save_project": "overwrites a project file", "export_image": "overwrites a picture file", "timeline_render": "overwrites a video file", "convert_file": "writes a picture file"}

_enabled = True
_loaded = False
_policies: dict[str, str] = {}
_clients: dict[str, dict] = {}
_sessions: dict[str, tuple[str, str]] = {}
_pending: dict[str, dict] = {}
_waits: dict[str, asyncio.Future] = {}
_log: collections.deque = collections.deque(maxlen=LOG_LIMIT)
_entries: dict[str, dict] = {}
_subs: set[asyncio.Queue] = set()
_ids = itertools.count(1)


def _file():
    return config.data_dir() / "agents.json"


def _load() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    try:
        data = json.loads(_file().read_text(encoding="utf-8"))
        _policies.update({k: v for k, v in (data.get("policies") or {}).items() if v in POLICIES})
    except (OSError, ValueError):
        return


def _save() -> None:
    try:
        _file().write_text(json.dumps({"policies": _policies}), encoding="utf-8")
    except OSError:
        return


def _emit(message: dict) -> None:
    for queue in list(_subs):
        queue.put_nowait(message)


def subscribe() -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    _subs.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    _subs.discard(queue)


def enabled() -> bool:
    return _enabled


def policy_of(name: str) -> str:
    _load()
    return _policies.get(name, "ask")


def state() -> dict:
    _load()
    clients = []
    for name, c in sorted(_clients.items(), key=lambda kv: -kv[1]["last_seen"]):
        clients.append({"name": name, "version": c["version"], "policy": policy_of(name), "calls": c["calls"], "last_seen": c["last_seen"],
                        "waiting": sum(1 for p in _pending.values() if p["client"] == name)})
    return {"enabled": _enabled, "clients": clients, "pending": sorted(_pending.values(), key=lambda p: p["t"]), "timeout": APPROVAL_SECONDS,
            "policies": [{"value": v, "label": POLICY_LABELS[v]} for v in POLICIES]}


def _push_state() -> None:
    _emit({"type": "state", **state()})


def touch(name: str, version: str = "") -> None:
    c = _clients.setdefault(name, {"version": version, "calls": 0, "last_seen": 0.0})
    if version:
        c["version"] = version
    c["last_seen"] = time.time()


def open_session(name: str, version: str) -> str:
    sid = uuid.uuid4().hex
    _sessions[sid] = (name, version)
    touch(name, version)
    _push_state()
    return sid


def close_session(sid: str) -> None:
    _sessions.pop(sid, None)


def identity(sid: str | None, info: dict | None, fallback: str) -> tuple[str, str]:
    """The client's name and version: its session's, else the clientInfo sent with the request, else the fallback."""
    if sid and sid in _sessions:
        return _sessions[sid]
    if isinstance(info, dict) and str(info.get("name") or "").strip():
        return str(info["name"]).strip()[:80], str(info.get("version") or "")[:40]
    return (fallback.strip()[:80] or "unknown agent"), ""


def set_enabled(on: bool) -> None:
    global _enabled
    _enabled = bool(on)
    if not _enabled:
        stop(None)
    _push_state()


def set_policy(name: str, policy: str) -> None:
    _load()
    if policy not in POLICIES:
        raise ValueError(f"policy must be one of {', '.join(POLICIES)}")
    _policies[name] = policy
    _save()
    if policy != "ask":
        for p in [p for p in _pending.values() if p["client"] == name]:
            decide(p["id"], policy == "allow")
    _push_state()


def summarise(args: dict | None) -> str:
    if not args:
        return ""
    short = {k: (v if not isinstance(v, str) or len(v) <= 60 else v[:57] + "...") for k, v in args.items() if k != "data"}
    text = json.dumps(short, separators=(",", ":"), ensure_ascii=False)
    return text if len(text) <= 140 else text[:137] + "..."


def target_of(args: dict | None) -> dict | None:
    """What the call touched, for Follow Agent: a layer id, or a rectangle in document pixels."""
    a = args or {}
    if isinstance(a.get("id"), str) and a["id"]:
        return {"layer": a["id"]}
    if all(isinstance(a.get(k), (int, float)) for k in ("x", "y", "width", "height")):
        return {"rect": {"x": a["x"], "y": a["y"], "w": a["width"], "h": a["height"]}}
    return None


def begin(client: str, tool: str, args: dict | None) -> dict:
    command = (args or {}).get("id") if tool == "run_command" else None
    entry = {"id": str(next(_ids)), "t": time.time(), "client": client, "tool": tool, "command": command if isinstance(command, str) else None,
             "summary": summarise(args), "status": "running", "message": "", "target": None if tool in ("run_command", "run_commands") else target_of(args)}
    touch(client)
    _clients[client]["calls"] += 1
    if len(_log) == _log.maxlen:
        _entries.pop(_log[0]["id"], None)
    _log.append(entry)
    _entries[entry["id"]] = entry
    _emit({"type": "activity", "entry": entry})
    return entry


def end(entry: dict, status: str, message: str = "") -> None:
    entry["status"] = status
    entry["message"] = message[:300]
    _emit({"type": "activity", "entry": entry})


def activity(limit: int = 100) -> list[dict]:
    return list(_log)[-limit:][::-1]


def admit(client: str) -> str | None:
    """A reason the call is refused outright, written as what the agent should do next; None when it may go on."""
    if not _enabled:
        return "Outside agents are switched off in formvis (Window > Agent Connect). Ask the person to switch them on, then retry."
    if policy_of(client) == "deny":
        return f"The person denied {client} in formvis (Window > Agent Connect). Do not retry; ask them to change the policy if you should continue."
    return None


async def approval(entry: dict, why: str) -> str | None:
    """Waits for the person to approve a step Undo cannot reverse; None when approved, else what to tell the agent."""
    pid = entry["id"]
    item = {"id": pid, "client": entry["client"], "tool": entry["tool"], "command": entry["command"], "summary": entry["summary"], "why": why, "t": time.time()}
    fut = asyncio.get_running_loop().create_future()
    _pending[pid] = item
    _waits[pid] = fut
    end(entry, "waiting", why)
    _push_state()
    try:
        verdict = await asyncio.wait_for(fut, timeout=APPROVAL_SECONDS)
    except asyncio.TimeoutError:
        verdict = "timeout"
    finally:
        _pending.pop(pid, None)
        _waits.pop(pid, None)
        _push_state()
    if verdict == "allow":
        end(entry, "running", "approved")
        return None
    if verdict == "timeout":
        message = f"The person did not answer within {int(APPROVAL_SECONDS)} seconds, so this step did not run ({why}). Tell them it is waiting in Window > Agent Connect and retry when they are there, or choose a step Undo can reverse."
    elif verdict == "stop":
        message = "The person pressed Stop in formvis, so this step did not run. Wait for their next instruction."
    else:
        message = f"The person declined this step ({why}). Do not retry it; ask what they want instead."
    end(entry, "denied", message)
    return message


def decide(pid: str, allow: bool) -> bool:
    fut = _waits.get(pid)
    if fut is None or fut.done():
        return False
    fut.set_result("allow" if allow else "deny")
    return True


def stop(client: str | None) -> int:
    """Cancels pending steps (one agent's, or all)."""
    n = 0
    for pid, p in list(_pending.items()):
        fut = _waits.get(pid)
        if fut and not fut.done() and (client is None or p["client"] == client):
            fut.set_result("stop")
            n += 1
    return n

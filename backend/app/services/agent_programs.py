"""Other agent programs in a terminal tab (DOCK_SPEC 2): Codex, Cursor's agent and Antigravity (agy), offered as dock tabs only
when found on this computer. Each tab gets its own in-app token in the child's environment (FORMVIS_INAPP_TOKEN, with
FORMVIS_MCP_URL beside it), never on its command line, and the token dies with the tab. Antigravity reads its MCP servers from a
file, so its tab also gets the entry formvis_tab in its own working folder, taken out again when the tab closes."""

from __future__ import annotations

import json
import os
from pathlib import Path

from app.core import config
from app.services import agent_lookup, agents, claude_code, terminal

PROGRAMS = {
    "codex": {"bin": "codex", "title": "Codex", "install": "npm install -g @openai/codex"},
    "cursor": {"bin": "cursor-agent", "title": "Cursor", "install": "curl https://cursor.com/install -fsS | bash"},
    "antigravity": {"bin": "agy", "title": "Antigravity", "install": agent_lookup.install("antigravity")},
}
TABS = ("codex", "cursor", "antigravity")
TAB_ENTRY = "formvis_tab"
TAB_HEADER = "x-formvis-inapp"


def find(kind: str) -> str | None:
    return claude_code.located(kind).path


def tab_folder(kind: str) -> Path:
    """The working folder of a program that reads its MCP servers from a file in its workspace (Antigravity): formvis's own,
    inside the data folder, so a tab's token is never written into a folder of the person's pictures."""
    folder = config.data_dir() / "agent-tabs" / kind
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _mcp_file(folder: Path) -> Path:
    return folder / ".agents" / "mcp_config.json"


def _servers(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8") or "{}") if path.exists() else {}
    if not isinstance(data, dict) or not isinstance(data.get("mcpServers", {}), dict):
        raise OSError(f"{path} is not an MCP servers file formvis can read, so it was left alone")
    return data


def _replace(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.name + f".part-{os.getpid()}")
    with os.fdopen(os.open(part, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2) + "\n")
    os.replace(part, path)


def write_tab_entry(folder: Path, port: int, token: str) -> None:
    """The tab's own entry, formvis_tab, in <folder>/.agents/mcp_config.json (ANTIGRAVITY_SPEC): the address and the tab's token.
    Every other entry and key in the file is kept; the file is replaced whole and is the user's alone."""
    path = _mcp_file(folder)
    data = _servers(path)
    data.setdefault("mcpServers", {})[TAB_ENTRY] = {"serverUrl": f"http://127.0.0.1:{port}/mcp", "headers": {TAB_HEADER: token}}
    _replace(path, data)


def remove_tab_entry(folder: Path, token: str) -> None:
    """Takes the tab's entry out when the tab closes, only while it still carries this tab's token; nothing else is touched."""
    path = _mcp_file(folder)
    try:
        data = _servers(path)
        entry = data.get("mcpServers", {}).get(TAB_ENTRY)
        if not isinstance(entry, dict) or (entry.get("headers") or {}).get(TAB_HEADER) != token:
            return
        del data["mcpServers"][TAB_ENTRY]
        _replace(path, data)
    except (OSError, ValueError):
        return


def status(fresh: bool = False) -> dict:
    out = {}
    for kind, p in PROGRAMS.items():
        found = claude_code.located(kind, fresh)
        out[kind] = agent_lookup.answer(found, p["install"], claude_code.OTHERWISE) | {"signedIn": None, "install": "" if found.state == "runs" else p["install"], "title": p["title"]}
    return out


def open_terminal(kind: str, port: int, cols: int, rows: int, document_folder: str | None = None) -> dict:
    if kind not in TABS:
        raise ValueError(f"No agent program called {kind}")
    found = claude_code.usable(kind)
    if found.state != "runs":
        raise LookupError(claude_code.said(found))
    path = found.path
    argv = agent_lookup.start_argv([path])
    token = agents.issue_inapp()
    env = claude_code.terminal_env(token, path, {"FORMVIS_MCP_URL": f"http://127.0.0.1:{port}/mcp"})
    own = tab_folder(kind) if kind == "antigravity" else None
    folder = str(own) if own else claude_code.workdir(document_folder) if document_folder else str(config.data_dir())
    try:
        if own:
            write_tab_entry(own, port, token)
        session = terminal.open_session(folder, cols, rows, PROGRAMS[kind]["title"], argv, env, kind)
    except Exception:
        agents.revoke_inapp(token)
        if own:
            remove_tab_entry(own, token)
        raise
    session.on_close.append(lambda: agents.revoke_inapp(token))
    if own:
        session.on_close.append(lambda: remove_tab_entry(own, token))
    return session.describe()

"""Other agent programs in a terminal tab (DOCK_SPEC 2): Codex and Cursor's agent, offered as dock tabs only when found on this
computer. Each tab gets its own in-app token in the child's environment (FORMVIS_INAPP_TOKEN, with FORMVIS_MCP_URL beside it),
never on its command line, and the token dies with the tab."""

from __future__ import annotations

from app.core import config
from app.services import agent_lookup, agents, claude_code, terminal

PROGRAMS = {
    "codex": {"bin": "codex", "title": "Codex", "install": "npm install -g @openai/codex"},
    "cursor": {"bin": "cursor-agent", "title": "Cursor", "install": "curl https://cursor.com/install -fsS | bash"},
    "antigravity": {"bin": "agy", "title": "Antigravity", "install": agent_lookup.install("antigravity")},
}
TABS = ("codex", "cursor")


def find(kind: str) -> str | None:
    return claude_code.located(kind).path


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
    folder = claude_code.workdir(document_folder) if document_folder else str(config.data_dir())
    try:
        session = terminal.open_session(folder, cols, rows, PROGRAMS[kind]["title"], argv, env, kind)
    except Exception:
        agents.revoke_inapp(token)
        raise
    session.on_close.append(lambda: agents.revoke_inapp(token))
    return session.describe()

---
name: terminal-operator
description: Terminals, pseudo-terminals, the Claude Code panel, Agent Connect and child processes in formvis. Use when changing the terminal dock (xterm in the window, PTYs in the engine), the Claude Code panel and its stream, the Agent Connect panel and its approvals, or code that already starts processes (the model runner's terminal echo, process waiting in processes.py, the contained EXR child, the Tauri sidecar spawn, or the engine auto-start of ./formvis mcp). Lists the real files and the rules a process feature must follow.
---

# terminal-operator

Since 1.67.4 formvis has a terminal dock, a Claude Code panel and (1.67.5) Agent Connect. The engine owns every process; the window only draws and sends keys. This skill records where each piece lives and the rules process code must follow.

## What exists

| Where | What it does |
| --- | --- |
| `backend/app/services/terminal.py`, `routers/terminal.py` | PTY sessions (`ptyprocess`, `pywinpty` on Windows) with a 256 KiB scrollback, resize, restart and close under `/api/terminal`; output on a WebSocket at `/api/terminal/{sid}/stream`. Every route and socket passes `origin_ok` (loopback Host, known Origin) |
| `backend/app/services/claude_code.py`, `routers/claude_code.py` | Finds `claude` (`FORMVIS_CLAUDE_BIN`, PATH), starts it in stream-JSON with the project's `.mcp.json`, streams its messages on `/api/agent/claude/stream`, answers Ask-mode permissions, mirrors bash calls into a read-only terminal tab |
| `backend/app/routers/agents.py` | Agent Connect: master switch, a policy per agent, approvals, the activity feed and Stop under `/api/agents`, with a WebSocket at `/api/agents/stream` |
| `frontend/src/ui/terminal-dock.ts`, `styles/terminal.css` | The dock as in formlit: xterm with the fit addon, a tab per PTY (shell tabs with the `terminal` icon, Claude Code tabs with the `agent` icon, the Chat tab first with `agentChat`), the head buttons New Terminal, Chat, Claude Code, Restart and Hide, the ask bar at the foot, and a status note in the stage when a tab cannot start; open state and height on `documentElement` attributes set by a boot script in `index.html` before first paint; xterm's own scrollbar elements hidden |
| `frontend/src/ui/chat-pane.ts` | The Chat tab: Claude Code in stream-JSON mode over `/api/agent/claude/*`, messages, tool chips, Allow and Deny cards, and Continue in Claude Code (a Claude Code tab that resumes the chat's session) |
| `frontend/src/ui/panels/agent-connect.ts` | The Agent Connect panel, built once and patched in place |
| `backend/app/localgen/local_runner.py` | `run(...)` and `_run(...)` start a local model as a subprocess, pump its output through `_pump` and a queue, enforce time limits and cancellation, and end it with `_end`. `_Terminal` echoes the model's own output (a tqdm bar) into the terminal the engine was started from, sized with `COLUMNS` and `LINES`; it is a mirror to a console, not an interactive terminal |
| `backend/app/localgen/processes.py` | `communicate(process, data, timeout, cancelled)` waits for a process in 0.25 second steps so a cancel or a timeout can stop it |
| `backend/app/services/contained.py` | Runs OpenEXR decode and encode in a child interpreter (`multiprocessing`) with `TIMEOUT_S` 60 so a crash or hang cannot take the engine down; `OPENCV_IO_ENABLE_OPENEXR` is turned on only in the child |
| `src-tauri/src/main.rs` | Spawns the frozen `formvis-engine` sidecar with `FORMVIS_PORT=0`, reads its port from stdout (`CommandEvent::Stdout`), kills it on exit |
| `setup/mcp_stdio.py` | `start_engine()` starts `./formvis serve` or `./formvis boot` detached (`start_new_session=True`, stdin from `/dev/null`, output to `formvis-engine.log` in the temporary folder) when `./formvis mcp` finds no engine; `FORMVIS_MCP_AUTOSTART=0` turns it off |
| `src-tauri/capabilities/default.json` | Grants only `core:default`; the app uses no shell or process permissions from the page |

Agents already reach formvis the other way round: Claude Code, Codex and Cursor start `./formvis mcp` themselves and call tools (see `agent-bridge`). That path needs no terminal inside formvis.

## Rules for terminal and process code

Constraints that bind every change to the above:

1. Where it runs: process control belongs to the engine service (Python) or the Tauri shell (Rust), never to page code. The page may only talk to the engine over `/api` through `frontend/src/io/api.ts`.
2. Security: the engine binds loopback only and checks the Origin header on `/mcp`; a PTY endpoint is remote code execution, so it needs the same loopback and Origin checks, an explicit opt-in in Preferences (off by default, like `Prefs.agentsAllowed`), and a consent prompt in the window. In the desktop app, adding Tauri shell or process permissions needs a capability review in `src-tauri/capabilities/`.
3. Lifecycle: every child is killed when the window closes, the engine exits or the person turns the setting off; follow `processes.communicate` and `_end` for timeouts and cancellation. Never leave orphans.
4. Windows: the repo ships `.bat` twins for every script; a PTY layer must name how it works on Windows (ConPTY) or say it does not.
5. Frontend: any new panel obeys the zero-DOM-flash law and the z-index scale (see `ui-builder`); terminal output is appended to an existing node, never rebuilt. Register the panel with `registerPanel` in `frontend/src/ui/dock.ts` and add a Window menu command (see `command-author`).
6. Dependencies: no GPL code in the frozen engine (see `references/desktop-and-embedding.md`); check any PTY library's licence before adding it to `backend/requirements.txt`.
7. Agents: a Claude Code tab (`POST /api/terminal/claude`) gets formvis's MCP through its own configuration carrying the per-run in-app token in its environment (`FORMVIS_INAPP_TOKEN`, header `x-formvis-inapp`), so its calls count as the window's own, as in formlit; the Agent Connect switch, deny policy and risky-step approval still apply. Outside agents and the Chat tab keep the consent flow, nothing auto-approves an outside agent's consent prompt, and the terminal and Claude commands stay window-only.
8. Record the change in `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md`, and update this skill's table with any new file. `formvis-driving` gets a `terminal` entry only if an MCP tool is added for it.

## Do not

- Do not shell out from a request handler with `shell=True` or an unvalidated string.
- Do not copy a terminal emulator from another project without checking its licence.
- Do not mistake `_Terminal` in `local_runner.py` for the dock: it only mirrors a model's output to the console the engine started from.
- Do not auto-approve an agent's permission request on the person's behalf.

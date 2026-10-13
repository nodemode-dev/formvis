---
name: terminal-operator
description: Terminals, pseudo-terminals and child processes in formvis. Use when asked to add a terminal panel, a PTY, or a Claude Code spawner inside formvis, or when touching the code that already starts processes: the model runner's terminal echo in backend/app/localgen/local_runner.py, process waiting in processes.py, the contained EXR child, the Tauri sidecar spawn, or the engine auto-start of ./formvis mcp. States plainly that no PTY or spawner exists as of 1.67.3.
---

# terminal-operator

As of 1.67.3 formvis has no terminal panel, no PTY layer and no code that spawns Claude Code, in the frontend, the engine service or the Tauri shell. A search for `pty`, `openpty` and `xterm` across `backend/app`, `frontend/src`, `src-tauri/src` and `setup` finds nothing relevant. Do not describe one as existing, and do not invent its API. This skill records what process code does exist, and the rules a new terminal feature must follow.

## What exists today

| Where | What it does |
| --- | --- |
| `backend/app/localgen/local_runner.py` | `run(...)` and `_run(...)` start a local model as a subprocess, pump its output through `_pump` and a queue, enforce time limits and cancellation, and end it with `_end`. `_Terminal` echoes the model's own output (a tqdm bar) into the terminal the engine was started from, sized with `COLUMNS` and `LINES`; it is a mirror to a console, not an interactive terminal |
| `backend/app/localgen/processes.py` | `communicate(process, data, timeout, cancelled)` waits for a process in 0.25 second steps so a cancel or a timeout can stop it |
| `backend/app/services/contained.py` | Runs OpenEXR decode and encode in a child interpreter (`multiprocessing`) with `TIMEOUT_S` 60 so a crash or hang cannot take the engine down; `OPENCV_IO_ENABLE_OPENEXR` is turned on only in the child |
| `src-tauri/src/main.rs` | Spawns the frozen `formvis-engine` sidecar with `FORMVIS_PORT=0`, reads its port from stdout (`CommandEvent::Stdout`), kills it on exit |
| `setup/mcp_stdio.py` | `start_engine()` starts `./formvis serve` or `./formvis boot` detached (`start_new_session=True`, stdin from `/dev/null`, output to `formvis-engine.log` in the temporary folder) when `./formvis mcp` finds no engine; `FORMVIS_MCP_AUTOSTART=0` turns it off |
| `src-tauri/capabilities/default.json` | Grants only `core:default`; the app uses no shell or process permissions from the page |

Agents already reach formvis the other way round: Claude Code, Codex and Cursor start `./formvis mcp` themselves and call tools (see `agent-bridge`). That path needs no terminal inside formvis.

## If a terminal feature is requested

Treat it as a new subsystem and plan it before coding. Constraints that already bind the project:

1. Where it runs: process control belongs to the engine service (Python) or the Tauri shell (Rust), never to page code. The page may only talk to the engine over `/api` through `frontend/src/io/api.ts`.
2. Security: the engine binds loopback only and checks the Origin header on `/mcp`; a PTY endpoint is remote code execution, so it needs the same loopback and Origin checks, an explicit opt-in in Preferences (off by default, like `Prefs.agentsAllowed`), and a consent prompt in the window. In the desktop app, adding Tauri shell or process permissions needs a capability review in `src-tauri/capabilities/`.
3. Lifecycle: every child is killed when the window closes, the engine exits or the person turns the setting off; follow `processes.communicate` and `_end` for timeouts and cancellation. Never leave orphans.
4. Windows: the repo ships `.bat` twins for every script; a PTY layer must name how it works on Windows (ConPTY) or say it does not.
5. Frontend: any new panel obeys the zero-DOM-flash law and the z-index scale (see `ui-builder`); terminal output is appended to an existing node, never rebuilt. Register the panel with `registerPanel` in `frontend/src/ui/dock.ts` and add a Window menu command (see `command-author`).
6. Dependencies: no GPL code in the frozen engine (see `references/desktop-and-embedding.md`); check any PTY library's licence before adding it to `backend/requirements.txt`.
7. Agents: if a spawner starts Claude Code, it must pass the project's `.mcp.json` unchanged so the spawned agent uses the same consent flow, and it must not auto-approve the consent prompt.
8. Record the plan in the planning sidecar's `DEV_PLAN.md` and, when built, in `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md`. Then update this skill with the real file paths and function names, and add a `terminal` entry to `formvis-driving` only if an MCP tool is added for it.

## Do not

- Do not shell out from a request handler with `shell=True` or an unvalidated string.
- Do not copy a terminal emulator from another project without checking its licence.
- Do not claim an interactive terminal exists because `_Terminal` is named so; it only mirrors output.

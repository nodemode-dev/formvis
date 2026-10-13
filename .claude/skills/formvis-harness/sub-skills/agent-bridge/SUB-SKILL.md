---
name: agent-bridge
description: The formvis MCP server and the window bridge that lets outside agents (Claude Code, Codex, Cursor, Claude Desktop) drive the open document. Use for adding or changing an MCP tool, its schema or hints, the edit_strategy prompt, the consent prompt and Allow outside agents setting, the long-poll bridge between engine and window, ./formvis mcp, setup/agents.py sync and install, the formvis-editing tool reference, and agent evals.
---

# agent-bridge

Agents never touch pixels. They call MCP tools on the engine service; the engine queues each call; the open formvis window collects it, runs it through the same `Engine` methods a person would, and answers. Every change is one undoable step.

## Parts

| Part | Path | Role |
| --- | --- | --- |
| Catalogue and server | `backend/app/routers/mcp.py` | `TOOLS` (built with `_tool(name, description, props, required, read, destructive, idempotent, open)`), `INSTRUCTIONS`, `STRATEGY` and `PROMPTS` (the `edit_strategy` prompt), `POST /mcp` (JSON-RPC, protocol versions `2026-07-28` and `2025-11-25`, Origin check), `_run` (files at absolute paths handled in the engine), `_call` and `_ask` (queue and wait), `_live`, `_open_window` |
| Bridge endpoints | same file | `GET /api/mcp/bridge/next` (the window's 20 second long poll, `?allowed=1` or `0`), `POST /api/mcp/bridge/result`, `POST /api/mcp/bridge/stop`, `GET /api/mcp/status` |
| Window side | `frontend/src/automation/agent-bridge.ts` | `AgentBridge` (`setEnabled`, `run(name, args)`), `AgentDeps` (`ask`, `note`, `allow`, `openFile`, `projectBlob`, `applyFilter`, `selectSubject`, `removeBackground`, `renderVideo`), `McpResult` |
| Wiring | `frontend/src/app.ts` (`new AgentBridge(engine, {...})`) | Supplies the deps; `agents.setEnabled(loadPrefs().agentsAllowed)`; the `formvis:agents` window event |
| Consent UI | `frontend/src/ui/panels/agent-confirm.ts` (`AgentConfirmDialog`), `frontend/src/ui/app-dialogs.ts` (Preferences > Plugins, Allow outside agents), `Prefs.agentsAllowed` in `frontend/src/ui/prefs.ts` | Off by default |
| stdio launcher | `setup/mcp_stdio.py`, run by `./formvis mcp` | Forwards stdin lines to `/mcp`, starts the engine if it is not running; `FORMVIS_MCP_URL` overrides the address |
| Client config | `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml` | All run `./formvis mcp` |
| Skill sync and install | `setup/agents.py` | `sync [--check]`, `install [--dry-run] [claude|codex|cursor]` |
| Assistant and plugins | `frontend/src/ui/panels/assistant.ts`, `frontend/src/plugins/host.ts` | Use the same `AgentBridge.run`, whether or not outside agents are allowed |

## Consent flow

1. A tool call reaches `_call`. No window seen lately: it opens formvis in the browser (`_open_window`, once a minute, never in the desktop app or with `FORMVIS_OPEN_WINDOW=0`) and waits; still none: "formvis is not open".
2. Agents not allowed (`_allowed` false): the engine sends a `__consent__` request, the window asks the person once (`deps.ask`), and a yes turns `agentsAllowed` on. A no sets `_declined_until` for 600 seconds and later calls fail at once with how to turn it on.
3. Allowed: the request goes to the window (600 second timeout) and the result comes back through `/api/mcp/bridge/result`.
4. Anything that costs money (`openWorldHint`: `generative_fill`, `generative_expand`, `generate_image`, `upscale`) goes local first (LaMa, Krea 2, FLUX.2 klein, Real-ESRGAN) and asks the person again before using fal.
5. Turning the setting off posts `/api/mcp/bridge/stop`, which answers everything queued with a failure.

## Adding or changing a tool

1. Add the `_tool(...)` entry to `TOOLS` in `mcp.py` with an honest description (it is what the agent reads), a strict schema (types, ranges, enums, defaults) and hints: `read=True` for tools that change nothing, `destructive=True` for ones that replace or remove, `idempotent=True` where repeating is harmless, `open=True` when fal may be used. Tool names are snake_case and become the public API: never rename one.
2. If the tool only needs the window, add a `case` in `AgentBridge.run` in `agent-bridge.ts` that calls an `Engine` method, validates inputs (`num`, `str`, `hex` helpers), and returns `text(message, data)` or `fail(message)`. Failure messages must say what to do next. If it reads or writes a file at an absolute path, add the handling in `_run` in `mcp.py` (`_path` validates the folder and extension) and have the window return base64 through a `__name` internal call, as `__export`, `__project` and `__render` do.
3. A tool that changes the document does it through `engine.edit`, so it is one step and `undo` takes it back. A multi-step tool wraps its steps in one `edit`.
4. Update `INSTRUCTIONS` or `STRATEGY` only if the decision tree changes.
5. In `setup/agents.py` the generated reference groups tools in `tools_reference()`; a new tool appears under "Other" until it is added to a group there.
6. Run `PATH=$PWD/backend/venv/bin:$PATH ./formvis agents sync` (the window having run once, so its command catalogue is mirrored) so `formvis-editing/references/tools.md`, `formvis-driving/references/commands.md`, `formvis-harness/references/command-map.md` and `tool-map.md`, and the `.agents/skills` mirrors follow; `./formvis agents sync --check` must pass (the backend test `test_the_skill_is_in_step_with_the_catalogue` fails otherwise). Never edit those generated files by hand.
7. Update the tool count and the Edit-by-asking highlight in `README.md` (currently 50 tools) and `docs/AGENT_EVALS.md` if behaviour changes; add the new tool to the driving skill's matching sub-skill in `formvis-driving`.
8. Tests that exist: `backend/tests/test_mcp.py`, `backend/tests/test_agents_setup.py`, `e2e/test_mcp_agents.py`, `e2e/test_agent_consent.py`, `e2e/test_agent_editing.py`.

## Facts that bite

- The server is stateless JSON over HTTP; it answers `server/discover` for the 2026-07-28 revision and still answers `initialize` for 2025-11-25. Batches are refused. A browser Origin other than localhost, 127.0.0.1, `::1` or tauri hosts gets 403.
- `_taken` tracks requests the window took and has not answered; a window that closes mid-call returns the request to the front of the queue.
- Selecting then generating is two tools by design (`select`, then `generative_fill`); do not merge them.
- Descriptions and failure messages are the agent's whole documentation; read yours as an agent that has never seen formvis before shipping it.

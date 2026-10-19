# Terminal

The window has a terminal dock: shell tabs, Claude Code tabs and a Chat tab, with an ask bar at its foot, as in formlit. The engine owns every process; the window draws output and sends keys.

| Source path | What lives there |
| --- | --- |
| `backend/app/services/terminal.py` | PTY sessions: `ptyprocess` on macOS and Linux, `pywinpty` (ConPTY) on Windows; a 256 KiB scrollback per session; resize, restart and close; the read-only Claude session has no process, Claude Code's shell calls are written into it |
| `backend/app/routers/terminal.py` | `/api/terminal`: list, open, resize, restart and close, and a WebSocket at `/api/terminal/{id}/stream` (text frames are output, binary frames are control messages). `origin_ok` refuses any Host that is not a loopback name and any Origin that is not a configured CORS origin, a loopback or Tauri one, because WebSockets are not covered by CORS |
| `backend/app/services/claude_code.py`, `routers/claude_code.py` | Finds `claude` (`FORMVIS_CLAUDE_BIN`, then the path), reports installed, version and signed in, starts it in stream-JSON with the project's `.mcp.json` and the chosen permission mode (Ask, Auto-accept edits, Plan), streams its messages on a WebSocket and answers Ask-mode permissions |
| `frontend/src/ui/terminal-dock.ts` | The dock: xterm.js 6 with the fit addon, a tab per session (the `terminal` icon for a shell, the `agent` icon for Claude Code, the Chat tab first with `agentChat`), the head buttons New Terminal, Chat, Claude Code, Restart and Hide, the ask bar, a grip to resize, Window > Terminal (`terminal.toggle`, Mod+J), Window > New Terminal (`terminal.new`), Window > Claude Code (`agent.claude.open`) and Window > Chat with Claude (`agent.chat`) |
| `frontend/src/ui/chat-pane.ts` | The Chat tab: Claude Code in stream-JSON mode, status line, messages, tool chips, mode select, Allow and Deny, Stop, New Chat and Continue in Claude Code |
| `frontend/src/styles/terminal.css`, `frontend/index.html` | Layout, and the boot script that writes `data-ft-dock` and `data-ft-dock-h` on the root element before first paint, so a dock left open opens in place without moving anything |

## Rules

- Process control belongs to the engine or the Tauri shell, never to page code; the page reaches the engine only through `frontend/src/io/api.ts`.
- A terminal is remote code execution, so every route and socket passes `origin_ok`, and an agent's permission request is never answered for the person.
- Terminal output is appended to xterm's own nodes, never rebuilt, and xterm's scrollbar elements are hidden by `terminal.css` (the global sheet does not name them).
- Every child ends when its tab closes, the window goes away or the engine exits.

# formvis

formvis is a layered image editor for the web and the desktop, built in the NodeMode design system. It saves its own `.fvd` projects (older `.fmv` and `.formvis` projects still open) and opens NodeMode canvasor projects. It runs in a browser, inside NodeMode as a full-screen portal app, and as a Tauri desktop app.

| Page | What it covers |
| --- | --- |
| [Getting Started](Getting-Started) | Install, boot, every dispatcher command, ports |
| [Engine](Engine) | The document engine in `frontend/src/engine/` |
| [Tools](Tools) | The tool registry and the tool modules |
| [Brushes](Brushes) | Strokes, dynamics, `.abr` brushes, pen pressure |
| [Colour](Colour) | Modes, depth, profiles, LittleCMS, Color Settings, DPX |
| [Terminal](Terminal) | The terminal dock (bottom or right): shells, Claude Code, Codex and Cursor tabs, the Chat tab, and the question an outside agent's request raises |
| [Agents](Agents) | MCP tools, the command catalogue and CLI, Agent Connect, the skills |
| [Extensions](Extensions) | formvis as a host of the Form Extension Contract |
| [UI Shell](UI-Shell) | Stage, panels, menus, dialogs, themes, the zero-flash rules |
| [Languages](Languages) | The 30 interface languages: the tables, `t()`, the page translator, adding a string |
| [Engine Service](Engine-Service) | The FastAPI engine in `backend/` |
| [Project Format](Project-Format) | The project manifest (`.fvd`), field by field |
| [Desktop](Desktop) | The Tauri shell, the frozen sidecar, release builds |
| [NodeMode Embedding](NodeMode-Embedding) | Portal protocol, theme bridge, send to canvas |
| [Keyboard Shortcuts](Keyboard-Shortcuts) | Every shortcut |
| [Verification](Verification) | The throttled browser procedure every UI change passes |
| [Releasing](Releasing) | Signing, notarization and updater secrets, and cutting a desktop release |

Status: the README's Status note says what is and is not built today, `CHANGELOG.md` lists what each release added, and `./formvis counts --commands` prints how many commands the catalogue holds.

These pages are the source of truth in the repository under `.docs/wiki/`. Edit them there; the wiki workflow publishes them.

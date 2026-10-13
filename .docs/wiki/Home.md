# formvis

formvis is a layered image editor for the web and the desktop, built in the NodeMode design system. It saves its own `.fmv` projects and opens NodeMode canvasor projects. It runs in a browser, inside NodeMode as a full-screen portal app, and as a Tauri desktop app.

| Page | What it covers |
| --- | --- |
| [Getting Started](Getting-Started) | Install, boot, every dispatcher command, ports |
| [Engine](Engine) | The document engine in `frontend/src/engine/` |
| [Tools](Tools) | The tool registry and the tool modules |
| [Brushes](Brushes) | Strokes, dynamics, `.abr` brushes, pen pressure |
| [Colour](Colour) | Modes, depth, profiles, LittleCMS, Color Settings, DPX |
| [Terminal](Terminal) | The terminal dock and the Claude Code panel |
| [Agents](Agents) | MCP tools, the command catalogue and CLI, Agent Connect, the skills |
| [UI Shell](UI-Shell) | Stage, panels, menus, dialogs, themes, the zero-flash rules |
| [Engine Service](Engine-Service) | The FastAPI engine in `backend/` |
| [Project Format](Project-Format) | The `.fmv` manifest, field by field |
| [Desktop](Desktop) | The Tauri shell, the frozen sidecar, release builds |
| [NodeMode Embedding](NodeMode-Embedding) | Portal protocol, theme bridge, send to canvas |
| [Keyboard Shortcuts](Keyboard-Shortcuts) | Every shortcut |
| [Verification](Verification) | The throttled browser procedure every UI change passes |
| [Releasing](Releasing) | Signing, notarization and updater secrets, and cutting a desktop release |

Status at 0.65.0: all 14 tools and all 59 web-relevant menu commands are complete, the plan's Phase 5 (selections) is closed, and Phase 3 (layers) is in progress; the README's Status section and `CHANGELOG.md` list what each release added and what is not built yet.

These pages are the source of truth in the repository under `.docs/wiki/`. Edit them there; the wiki workflow publishes them.

# sonny

sonny is a layered image editor for the web and the desktop, built in the NodeMode design system. It ports the macOS app the reference app: same document model, same project manifest, `.ref` projects open unchanged. It runs in a browser, inside NodeMode as a full-screen portal app, and as a Tauri desktop app.

| Page | What it covers |
| --- | --- |
| [Getting Started](Getting-Started) | Install, boot, every dispatcher command, ports |
| [Engine](Engine) | The document engine in `frontend/src/engine/` |
| [Tools](Tools) | The tool registry and the tool modules |
| [UI Shell](UI-Shell) | Stage, panels, menus, dialogs, themes, the zero-flash rules |
| [Engine Service](Engine-Service) | The FastAPI engine in `backend/` |
| [Project Format](Project-Format) | The `.sonny` and `.ref` manifest, field by field |
| [Desktop](Desktop) | The Tauri shell, the frozen sidecar, release builds |
| [NodeMode Embedding](NodeMode-Embedding) | Portal protocol, theme bridge, send to canvas |
| [Keyboard Shortcuts](Keyboard-Shortcuts) | Every shortcut |
| [Verification](Verification) | The throttled browser procedure every UI change passes |

Status at 0.11.0: all 14 of the reference app's tools (Smear's Blur on masks aside) and all 59 web-relevant menu commands are complete; the README's Status section and `CHANGELOG.md` list what each release added and what is not built yet.

These pages are the source of truth in the repository under `.docs/wiki/`. Edit them there; the wiki workflow publishes them.

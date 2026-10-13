# formvis architecture

A map of the tree at 1.67.3 for agents changing the code. Paths are from the repository root.

## Layout

```text
formvis, formvis.bat        root dispatcher: install, boot, build, serve, desktop, doctor, test, counts, bench, mcp, agents, clean
build_app                   desktop build start to finish, logs to build_app.log
setup/                      one script per task (each with a .bat twin), lib.sh, agents.py, line_counts.py, mcp_stdio.py
backend/                    FastAPI engine service (Python 3.12)
  app/main.py               mounts the routers
  app/core/                 config.py (ports, limits, data folders), legacy.py (former-name compatibility)
  app/routers/              system, io, projects, ops, colour, generative, mcp, plugins, llm, nodemode, comfyui,
                            large, bands, undo, video, merge, remove_find, seam
  app/services/             imaging, colour, project_format, sessions, background, segment, compute, contained,
                            generative, providers, llm, outbound, secrets, large
  app/localgen/             local models: LaMa inpaint, Krea 2, FLUX.2 klein, Real-ESRGAN, model manager, runner
  app/profiles/             FOGRA39L_coated.icc
  tests/                    pytest
  formvis_engine.py         PyInstaller entry for the desktop sidecar
frontend/                   Vite app, vanilla TypeScript
  index.html                critical style, theme boot, font preloads, stylesheet order
  src/main.ts, app.ts       startApp: the one place the shell is mounted and commands, menus and dialogs are wired
  src/engine/               document engine, no DOM
  src/extensions/           registry.ts and tools/ (one module per tool)
  src/ui/                   shell, stage, layers, menus, dialogs, panels/, icons, themes
  src/gpu/                  WebGPU and WebGL2 displays, native display, probe, fallback, benchmark
  src/io/                   engine client, image decoding, project and PSD serialization
  src/automation/           agent-bridge.ts (MCP calls run in the window)
  src/plugins/              sandboxed plugin host
  src/styles/               tokens.css, shell.css, panels.css, dialogs.css, light-mode.css, scrollbars.css, fonts.css
  src/host.ts               NodeMode portal link
  tests/                    vitest
native/formvis-render/      Rust wgpu renderer (own crate, own version)
src-tauri/                  Tauri 2 shell (main.rs sidecar spawn, native.rs native canvas commands)
e2e/                        Playwright browser tests (pytest)
docs/                       MANUAL.md, LOCAL.md, BENCH.md, AGENT_EVALS.md
.docs/                      BRANCHING.md and the wiki source
.claude/skills/             this kit; .agents/skills/ is the generated mirror of formvis-editing
```

## Dependency graph

```text
tools          to engine
UI shell       to engine, tools (registry), io
io             to engine (types), engine service over HTTP /api
automation     to engine, io
host.ts        to NodeMode portal over postMessage
desktop shell  to frozen engine service (sidecar) which serves the built frontend
native crate   used by src-tauri through a path dependency; the page reaches it via Tauri invoke
```

The engine imports nothing from `ui`, `io` or `extensions`. The page reaches the service only through `frontend/src/io/api.ts`.

## How an edit travels

1. Input: a pointer event reaches `frontend/src/ui/stage.ts`, which builds a `ToolPointer` and calls the active `Tool` from `frontend/src/extensions/registry.ts`; or a key or menu click runs a `Command` from `frontend/src/ui/commands.ts`; or an MCP call arrives in `AgentBridge.run`.
2. The tool or command calls an `Engine` method (`frontend/src/engine/index.ts`).
3. The method calls `engine.edit(name, fn)`: `History.begin` with a snapshot, the callback replaces layers or records `PixelPatch` entries, `deriveChannels` keeps float pixels in step for deep documents, `History.end` stores one step (or none when nothing changed).
4. The engine emits events (`doc`, `projects`, `active`, `options`, `overlay`, `render`); UI components patch in place in one animation frame; the renderer (`engine/renderer.ts`, or a GPU display in `src/gpu/`) redraws the stage.
5. Saving serializes with `frontend/src/io/project-io.ts` and posts to `/api/projects` or downloads a zip.

## Cross-cutting rules

- Limits: `LIMITS` in `frontend/src/engine/types.ts` and `MAX_SIDE`, `MAX_LAYERS` in `backend/app/core/config.py` agree (30,000 px, 10,000 layers).
- Naming: `Colour` in prose and service names, `color` in some URLs (`/api/color`) and CSS; do not rename routes.
- Versions: 8 sites, see `release-keeper`.
- Planning documents ship in the sidecar zip, not in this tree: `DEV_PLAN.md`, `BUILD_NOTES.md`, `TEST_PLAN.md`, the root `HASHOUT_LOG.md`.
- The living logs `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` are in the tree and are read before editing.
- `./formvis` commands that agents use most: `boot` (engine and Vite), `serve` (engine serving the built app), `build`, `test [unit|backend|e2e|native]`, `counts [--check]`, `agents sync [--check]`, `mcp`, `doctor`.

## Where each concern lives

| Concern | Sub-skill |
| --- | --- |
| Documents, history, layers, deep pixels | `engine-builder` |
| Commands, menus, shortcuts | `command-author` |
| Tools and options | `tool-builder` |
| Strokes and dynamics | `brush-engine` |
| Modes, depth, profiles, CMYK, Lab | `colour-keeper` |
| Filters | `filter-library` |
| Shell, tokens, dialogs, flash law | `ui-builder` |
| MCP, consent, skill sync | `agent-bridge` |
| Terminals and processes | `terminal-operator` |
| Rust renderer | `native-render-builder` |
| Formats and project files | `io-formats` |
| Versions, logs, commits, zips | `release-keeper` |

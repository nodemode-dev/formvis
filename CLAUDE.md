# formvis

Layered image editor for the web and the desktop in the NodeMode design system: vanilla TypeScript and Vite frontend, Python and FastAPI engine, Tauri 2 shell.

## Repo layout notes

- `assets/` is repo-level art (the README logo and the desktop icon source). It is not app runtime assets: runtime files live in `frontend/public/` and `frontend/src/`.
- `frontend/src/engine/` never touches the DOM. UI code lives in `frontend/src/ui/`; tools live in `frontend/src/extensions/tools/` and register through `frontend/src/extensions/registry.ts`.
- `backend/formvis_engine.py` is the PyInstaller entry for the desktop sidecar, not a dev server. Use `./formvis backend` or `./formvis boot` for development.
- `src-tauri/binaries/` receives the frozen engine from `setup/freeze_backend`; git ignores it.
- `./build_app` at the root builds the desktop app start to finish (tools check, installs, window, frozen engine, `tauri build`, bundle) and logs to `build_app.log`; it is the one command for a desktop build.
- Planning documents (DEV_PLAN, BUILD_NOTES, TEST_PLAN, the root HASHOUT_LOG) ship in the planning sidecar zip, not in this tree. The living logs `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` are in the tree: read them before editing.

## Skills

- `formvis-harness` · for changing formvis's code: engine, commands, tools, brushes, colour, filters, UI, agent bridge, terminal, native renderer, file formats and releases. Route through its `SKILL.md` routing table to the specialist `SUB-SKILL.md`.
- `formvis-driving` · for using a running formvis through its MCP tools to edit pictures, with a sub-skill per action family.
- `formvis-colour-science` · answers profile, intent, CMYK and Lab questions with the engine's own colour service.

Always route code work through `.claude/skills/formvis-harness/SKILL.md` first: it maps the subsystems, the dependency graph and the laws, and loads the right references. `formvis-skillset` is the older orchestrator and stays only while `AGENTS.md`, `README.md` and `docs/AGENT_EVALS.md` still point at it.

## Editing pictures through formvis

When the person wants a picture edited (retouched, an object removed or added, text added, resized, exported), use the `formvis` MCP server's tools with the `formvis-driving` skill (`.claude/skills/formvis-driving`; `formvis-editing` is now only a pointer to it), not formvis's source code. `.mcp.json` starts it (`./formvis mcp`, which starts the engine if it is not running); the first edit asks the person once, in the formvis window, to allow outside agents. After changing the MCP tools in `backend/app/routers/mcp.py`, run `./formvis agents sync` so the tool reference (`formvis-editing/references/tools.md`) and its `.agents/skills` mirror follow (the engine tests fail until you do).

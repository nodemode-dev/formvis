# formvis

Layered image editor for the web and the desktop in the NodeMode design system: vanilla TypeScript and Vite frontend, Python and FastAPI engine, Tauri 2 shell.

## Repo layout notes

- `assets/` is repo-level art (the README logo and the desktop icon source). It is not app runtime assets: runtime files live in `frontend/public/` and `frontend/src/`.
- `frontend/src/engine/` never touches the DOM. UI code lives in `frontend/src/ui/`; tools live in `frontend/src/extensions/tools/` and register through `frontend/src/extensions/registry.ts`.
- `backend/formvis_engine.py` is the PyInstaller entry for the desktop sidecar, not a dev server. Use `./formvis backend` or `./formvis boot` for development.
- `src-tauri/binaries/` receives the frozen engine from `setup/freeze_backend`; git ignores it.
- Planning documents (DEV_PLAN, BUILD_NOTES, TEST_PLAN, the root HASHOUT_LOG) ship in the planning sidecar zip, not in this tree. The living logs `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` are in the tree: read them before editing.

## Skills

- `formvis-skillset` · the orchestrator for all formvis work: engine, tools, UI shell, engine service, project format, desktop builds, NodeMode embedding and verification. Route through its `SKILL.md` routing table to the specialist `SUB-SKILL.md`.

Always route work through `.claude/skills/formvis-skillset/SKILL.md` first: it maps the subsystems, the dependency graph and the laws, and loads the right references.

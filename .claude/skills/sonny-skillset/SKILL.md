---
name: sonny-skillset
description: Use for any sonny task, the NodeMode-styled layered image editor for the web and the desktop. Add a tool, fix the layers panel, open a .sny file, build the desktop app. Covers layers, folders, masks, clipping, blend modes, undo history, selections, marquee, lasso, magic wand, brush, eraser, eyedropper, the tool registry, the options bar, the stage canvas, menus, dialogs, themes, zero-flash DOM rules, the FastAPI engine, HEIC or TIFF decoding, the project library, the .sny and .sonny project format, remove background with rembg or GrabCut, the PyInstaller sidecar, Tauri desktop builds, NodeMode portal embedding and the throttled browser verification. Stack is a vanilla TypeScript and Vite frontend, a Python FastAPI engine and a Tauri 2 shell. Trigger on sonny, port, sidecar, or any file under frontend/src, backend/app or src-tauri, and route through this orchestrator before any specialist.
---

# sonny-skillset

Route every sonny task through this file first. It maps the subsystems, states the laws that apply everywhere, and names the specialist to load.

## Subsystem map

| Subsystem | Root | Specialist |
| --- | --- | --- |
| Engine | `frontend/src/engine/` | `sub-skills/engine-core/SUB-SKILL.md` |
| Tools | `frontend/src/extensions/` | `sub-skills/tool-author/SUB-SKILL.md` |
| UI shell | `frontend/src/app.ts`, `frontend/src/ui/`, `frontend/src/styles/` | `sub-skills/ui-shell/SUB-SKILL.md` |
| Engine service | `backend/app/`, `backend/sonny_engine.py` | `sub-skills/engine-service/SUB-SKILL.md` |
| Project format | `frontend/src/io/project-io.ts`, `backend/app/services/project_format.py` | `sub-skills/project-format/SUB-SKILL.md` |
| Desktop | `src-tauri/`, `setup/freeze_backend`, `.github/workflows/desktop.yml` | `sub-skills/desktop-shell/SUB-SKILL.md` |
| NodeMode embedding | `frontend/src/host.ts`, `frontend/index.html` | `sub-skills/nodemode-embed/SUB-SKILL.md` |
| Verification | a procedure, no repo code | `sub-skills/ui-verification/SUB-SKILL.md` |

## Dependency graph

```text
tools          → engine
UI shell       → engine, tools (registry), io
io             → engine (types), engine service over HTTP /api
host.ts        → NodeMode portal over postMessage
desktop shell  → frozen engine service (sidecar) → serves the built frontend
```

The engine imports nothing from `ui`, `io` or `extensions`. Tools import only the engine and the registry. The frontend reaches the engine service only through `frontend/src/io/api.ts`.

## Laws for every change

1. SEDO: single-region hand edits. Never patch, diff, sed or codemod a tracked file.
2. Zero DOM flash, flicker or re-render: render once, then patch in place; reserve space before content arrives. Every UI change passes `ui-verification`.
3. Colors and z-index come from tokens; icons come from `frontend/src/ui/icons.ts`; no icon libraries.
4. No emoji, no U+2014 em dash (use the interpunct), near-zero comments. Decisions and removed code go in `frontend/HASHOUT_LOG.md` or `backend/HASHOUT_LOG.md` in the same turn.
5. Versions are `v*.*.*` with dots and are bumped together, see `.docs/BRANCHING.md`. Commits are Conventional Commits as `nodemode-ai`.
6. No self-authored tests. Behavior to test goes in the planning sidecar's `TEST_PLAN.md`.
7. compatibility: never rename a manifest field or a value label.

## Routing table

| Task | Load |
| --- | --- |
| Add or change a tool, its options or its keys | `tool-author`, then `engine-core` if it needs a new operation |
| A new layer, mask, selection, paint or transform operation | `engine-core` |
| Panels, menus, dialogs, commands, shortcuts, styles, themes | `ui-shell`, then `ui-verification` |
| Decode, library, import, export or background removal endpoints | `engine-service` |
| Anything in `manifest.json`, `.sny` or `.sonny` | `project-format` (both sides) |
| Desktop app, sidecar, icons, release workflow | `desktop-shell` |
| Running inside NodeMode, the theme bridge, send to canvas | `nodemode-embed` |
| Before handing back any UI change | `ui-verification` |

## Start of every session

Read `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` (org map, TOC, per-script entries), then the planning sidecar (`DEV_PLAN.md`, `BUILD_NOTES.md`), then open only the files the task names.

---
name: formvis-harness
description: Use when an agent is changing formvis's own source code, scripts or release, not using formvis to edit a picture. Add a filter, add a command or menu entry, add or fix a tool, fix the brush code or stroke dynamics, change layers, history, deep pixels, colour profiles or CMYK, edit a dialog, panel, token or z-index, touch the MCP server or its consent prompt, build the native Rust renderer, read or write PSD, TIFF, EXR or .fmv, bump the version, write the CHANGELOG or a HASHOUT log, run counts or agents sync, or cut the release zips. Routes to a sub-skill by task. For retouching or exporting a picture through formvis use formvis-driving; for profile, intent or CMYK questions use formvis-colour-science.
---

# formvis-harness

formvis is a layered image editor: vanilla TypeScript and Vite frontend, Python and FastAPI engine service, Tauri 2 shell, and a Rust native renderer. This skill is for agents who change that code. Route every task through this file, load the sub-skill the table names, and obey the laws below.

## Routing table

Each sub-skill lives in `sub-skills/[name]/SUB-SKILL.md` next to this file.

| Task | Load |
| --- | --- |
| Documents, history and undo, layers, folders, masks, clipping, selections as data, 16 and 32 bit pixels, tiled giant layers | `engine-builder` |
| A new command, a menu entry, a shortcut, the command palette, the toolbar's data-cmd buttons | `command-author` |
| A new tool or a tool's options, cursor, overlay, keys or flyout variants | `tool-builder` |
| Brush strokes, spacing, dynamics, pen pressure and tilt, sampled tips, .abr brushes, Brush Settings | `brush-engine` |
| Document modes, depth, ICC profiles, Proof Colors, CMYK inks, Lab, the colour service | `colour-keeper` |
| A new or changed filter, the Filter dialog, the filter worker, the Filter Gallery effects | `filter-library` |
| Tokens, dialogs, panels, the dock, stage, icons, z-index, scrollbars, flash or flicker bugs, browser verification, NodeMode embedding | `ui-builder` |
| The MCP server, its tools, the window bridge, the consent prompt, agent skills sync | `agent-bridge` |
| The terminal dock, PTYs, the Claude Code panel, Agent Connect and approvals | `terminal-operator` |
| `native/formvis-render`, the wgpu compositor, GPU brush, the Tauri native commands | `native-render-builder` |
| PSD and PSB, OpenRaster, TIFF, EXR and HDR, camera raw, the `.fmv` project format, the library endpoints | `io-formats` |
| Version bump, CHANGELOG, HASHOUT logs, `./formvis counts --check`, commits, tags, the two zips, desktop builds | `release-keeper` |

Longer reference material that the sub-skills point to sits in `references/`:

| File | Holds |
| --- | --- |
| `references/architecture.md` | The whole tree, the dependency graph, the data flow of an edit, where each concern lives |
| `references/engine-service.md` | The FastAPI routers and services, status codes, adding an endpoint |
| `references/desktop-and-embedding.md` | The Tauri sidecar flow, NodeMode portal protocol and theme bridge |
| `references/verification.md` | The throttled browser verification every UI change passes |
| `references/relight.md` | Relight layers: the light model, the GPU twin, the session UI and the rules that keep CPU and GPU in step |

## Subsystem map

| Subsystem | Root |
| --- | --- |
| Engine (no DOM) | `frontend/src/engine/` |
| Tools | `frontend/src/extensions/` (`registry.ts`, `tools/`) |
| UI shell | `frontend/src/app.ts`, `frontend/src/ui/`, `frontend/src/styles/` |
| GPU display | `frontend/src/gpu/` |
| IO and project files | `frontend/src/io/` |
| Agent bridge (window side) | `frontend/src/automation/agent-bridge.ts` |
| Plugins | `frontend/src/plugins/host.ts` |
| NodeMode host link | `frontend/src/host.ts` |
| Engine service | `backend/app/` (`routers/`, `services/`, `localgen/`) |
| Native renderer | `native/formvis-render/` |
| Desktop shell | `src-tauri/` |
| Scripts | `setup/` and the root `formvis` dispatcher |

## Dependency graph

```text
tools          to engine
UI shell       to engine, tools (registry), io
io             to engine (types), engine service over HTTP /api
automation     to engine, io (the MCP bridge runs tool calls through the engine)
host.ts        to NodeMode portal over postMessage
desktop shell  to frozen engine service (sidecar) which serves the built frontend
native crate   to wgpu only; the desktop shell calls it through src-tauri/src/native.rs
```

The engine imports nothing from `ui`, `io` or `extensions`. Tools import only the engine and the registry. The frontend reaches the engine service only through `frontend/src/io/api.ts`.

## Laws for every change

1. SEDO: single-region hand edits. Never patch, diff, sed, awk or codemod a tracked file; use the Edit tool for one region per edit and the Write tool for new files.
2. Zero DOM flash, flicker or re-render: render once, then patch in place; reserve space before content arrives. Every UI change passes `references/verification.md`.
3. Colours and z-index come from tokens; icons come from `frontend/src/ui/icons.ts`; no icon libraries.
4. No emoji, no U+2014 em dash (use the interpunct), near-zero comments. Decisions and removed code go in `frontend/HASHOUT_LOG.md` or `backend/HASHOUT_LOG.md` in the same turn.
5. Versions are `v*.*.*` with dots and are bumped together at 8 sites, see `release-keeper`. Commits are Conventional Commits as `nodemode-ai <mackin@nodemode.ai>`.
6. Do not write tests of your own on the side. Behaviour to test goes in the planning sidecar's `TEST_PLAN.md`; the existing suites (`frontend/tests`, `backend/tests`, `e2e`, `native/formvis-render/tests`) run through `./formvis test`.
7. Compatibility: never rename a manifest field or a value label.
8. New engine modules are formvis's own, written from standard published methods; do not paste code from other editors.
9. After changing the MCP catalogue in `backend/app/routers/mcp.py`, run `./formvis agents sync` (the backend tests fail until you do).
10. Declined for patents, never to return: Content-Aware Scale by seam carving (US 7,477,800) and skin-tone protection for it (US 8,290,300). Decline any request for them, whoever asks. Also never add gradient-domain (Poisson) blending after the adaptive Content-Aware Fill (US 8,861,868, claim 1) or a live fill of the vacated area during the Content-Aware Move drag (US 9,575,641, claim 1). `./formvis counts --check` fails on product code that names the declined feature.
11. One cloud provider by design: fal. Do not add other image or model providers (Replicate, WaveSpeedAI, Comfy Cloud, Comfy Router, the Comfy Partner API, OpenRouter for images, ToAPIs, BytePlus, Oxen.ai, Magnific, an assistant provider on WaveSpeedAI): they are declined, and `./formvis counts --check` fails on them. Named hosted models wait for the owner's fal integration (he has the schemas); do not add them yourself.

## Start of every session

Read `CLAUDE.md`, then `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` (org map, table of contents, per-script entries), then the planning sidecar (`DEV_PLAN.md`, `BUILD_NOTES.md`) when it is available, then open only the files the task names. Prefer `git grep` to a recursive grep: `node_modules`, `backend/venv`, `src-tauri/target` and `native/formvis-render/target` are huge.

## Known gaps

- The terminal dock, the Claude Code panel and Agent Connect exist since 1.67.4; `terminal-operator` lists their files and the rules process code follows.
- `references/command-map.md` and `references/tool-map.md` are generated by `./formvis agents sync`; read them, never edit them.
- `./formvis agents sync` mirrors every skill in `.claude/skills` into `.agents/skills` and checks each skill file against the upload gates (name 64 characters, description 1024, no XML tag, no emoji, no U+2014); a new skill folder needs only a `SKILL.md`.

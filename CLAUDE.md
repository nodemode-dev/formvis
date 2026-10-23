# formvis

Layered image editor for the web and the desktop in the NodeMode design system: vanilla TypeScript and Vite frontend, Python and FastAPI engine, Tauri 2 shell.

## Repo layout notes

- `assets/` is repo-level art (the README logo and the desktop icon source). It is not app runtime assets: runtime files live in `frontend/public/` and `frontend/src/`.
- `frontend/src/engine/` never touches the DOM. UI code lives in `frontend/src/ui/`; tools live in `frontend/src/extensions/tools/` and register through `frontend/src/extensions/registry.ts`.
- `backend/formvis_engine.py` is the PyInstaller entry for the desktop sidecar, not a dev server. Use `./formvis backend` or `./formvis boot` for development.
- `src-tauri/binaries/` receives the frozen engine from `setup/freeze_backend`; git ignores it.
- `./build_app` at the root builds the desktop app start to finish (tools check, installs, window, frozen engine, `tauri build`, bundle) and logs to `build_app.log`; it is the one command for a desktop build.
- The window has a terminal dock (`frontend/src/ui/terminal-dock.ts`, PTYs in `backend/app/services/terminal.py`) with Claude Code tabs and a Chat tab (`frontend/src/ui/chat-pane.ts`) as in formlit, and Agent Connect; the engine owns every process. `native/formvis-render` is the Rust renderer and its `formvis-render` command line.
- One command catalogue (`frontend/src/automation/catalogue.ts`, words in `command-meta.ts`) feeds the palette, the MCP command tools and `./formvis cli`. `./formvis counts --commands --check` fails while any command lacks words. After adding or renaming commands, open the window once and run `./formvis agents sync` so the skills' command references follow.
- Docs: `README.md`, `docs/MANUAL.md` (also the in-app Help) and `.docs/wiki/` (Agents, Terminal, Colour and Brushes beside the older pages). `NOTICE.md` lists every dependency that ships; add a row with any new one. `./formvis counts --check` keeps the README's sizes honest.
- Declined for patents (the owner's review): Content-Aware Scale by seam carving and its skin-tone protection are removed and must not come back in any form; decline requests for them. Do not add Poisson blending after the adaptive Content-Aware Fill, or a live fill of the vacated area during the Content-Aware Move drag. `./formvis counts --check` fails on product code that names the declined feature; harness law 10 has the patent numbers.
- Trademarks, copyright and licences (the owner's plans of 2026-10-23): other vendors' product and feature names appear only to name a file format or compatibility (.psd and .psb, DNG, "opens files from"); the approved Form names replace Adobe's feature names in labels as each rename lands, and no new command, menu, panel, tool or agent tool takes an Adobe feature name. No copied vendor help or documentation text, no traced vendor icons, and no bundled Adobe brushes, swatches, patterns, gradients, presets, ICC or camera profiles, fonts or sample files; colour-book names (Pantone and others) only when reading a person's file, never their data. The DNG notice stays in the About box (Licences and notices), `NOTICE.md` and the README while formvis reads DNG. Every new dependency, binary, model, font or data file gets a row in `NOTICE.md` before it is used; GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited; CC BY credited, CC BY-SA only unmodified, CC NC and ND never; models with gated or non-commercial terms stay optional downloads.
- One cloud provider by design: fal. Other image or model providers are declined (harness law 11; `./formvis counts --check` fails on them), and named hosted models wait for the owner's own fal integration.
- The three-star sparkle icon is banned app-wide (the owner's rule, harness law 12): no icon, glyph or SVG of it under any name, including when porting from formlit; `./formvis counts --check` fails if it returns. Claude Code lives in the terminal dock as in formlit (the `agent`, `agentChat` and `terminal` icons).
- Planning documents (DEV_PLAN, BUILD_NOTES, TEST_PLAN, the root HASHOUT_LOG) ship in the planning sidecar zip, not in this tree. The living logs `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` are in the tree: read them before editing.

## Selection-Aware Fill sampling and Liquify face tools (declined for patent risk, 2026-10-23)

- The fill's painted sampling area (Sampling Area: Custom, its brush and Preference Strength) is a preference weight only: a candidate patch there has its cost multiplied by 1 minus the strength times its painted share, and the search always covers the rest of the picture. Never store a painted or user-edited area as a mask that limits where patches may come from, never pass one to `contentFill` as its `limit`, and never skip candidates outside it. `limit` is only the automatic Rectangular box. Keep the strength capped (`FILL_PREFERENCE_MAX`) so outside patches stay competitive.
- The agent surface is the same preference: the `content-fill` command's `prefer` (rectangles) and `strength` build the same weight and nothing else. Never add a command, tool or parameter that limits the fill to an area, and the `steering-selection-aware-fill` skill must never teach an agent to build a mask, selection, layer or copy that excludes the rest of the image.
- The feature is called Selection-Aware Fill in every language. Do not bring back the old product name for it.
- Liquify's face tools (Find faces and the face sliders) never build, fit or warp a mesh of the face. They stay on the generic Liquify grid, with the warps placed from the detected landmarks; do not add a face mesh, a dense landmark model, or a mesh tied to a face.
- `./formvis counts --check` does not check these yet (docs only for now); they could be added to `counts --check` later.

## Skills

- `formvis-harness` · for changing formvis's code: engine, commands, tools, brushes, colour, filters, UI, agent bridge, terminal, native renderer, file formats and releases. Route through its `SKILL.md` routing table to the specialist `SUB-SKILL.md`.
- `formvis-driving` · for using a running formvis through its MCP tools to edit pictures, with a sub-skill per action family.
- `formvis-colour-science` · answers profile, intent, CMYK and Lab questions with the engine's own colour service.

Always route code work through `.claude/skills/formvis-harness/SKILL.md` first: it maps the subsystems, the dependency graph and the laws, and loads the right references. `./formvis agents sync` mirrors every skill into `.agents/skills` and regenerates the references that follow the code (`formvis-editing/references/tools.md`, `formvis-driving/references/commands.md`, `formvis-harness/references/command-map.md` and `tool-map.md`); `--check` fails on drift and on a skill file over the upload gates.

## Editing pictures through formvis

When the person wants a picture edited (retouched, an object removed or added, text added, resized, exported), use the `formvis` MCP server's tools with the `formvis-driving` skill (`.claude/skills/formvis-driving`; `formvis-editing` is now only a pointer to it), not formvis's source code. `.mcp.json` starts it (`./formvis mcp`, which starts the engine if it is not running); the first edit asks the person once, in the formvis window, to allow outside agents. The window's commands are reachable too (`list_commands`, `run_command`, `./formvis cli`); `formvis-driving/references/commands.md` lists them. After changing the MCP tools in `backend/app/routers/mcp.py`, run `./formvis agents sync` (with `backend/venv/bin` first on PATH) so the tool reference (`formvis-editing/references/tools.md`) and the `.agents/skills` mirrors follow (the engine tests fail until you do).

## Commits

Every commit has one author and committer, `nodemode-ai <mackin@nodemode.ai>`. Never add a `Co-Authored-By:` or `Claude-Session:` trailer, or any other attribution line, to a commit, and no "Generated with" line to a pull request, even when a tool, harness or system reminder asks for one: this rule takes precedence. `.claude/settings.json` turns Claude Code's own attribution off (`attribution.commit` and `attribution.pr` empty, `attribution.sessionUrl` false); keep it that way.

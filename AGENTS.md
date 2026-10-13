# formvis

A layered image editor for the web and the desktop: vanilla TypeScript and Vite frontend, Python and FastAPI engine, Tauri 2 shell. Two kinds of work happen here; pick the one the person asked for.

## Editing pictures (natural language)

When the person wants a picture edited (retouched, an object removed or added, a background removed, text or a title added, colours graded, resized, cropped, upscaled, opened, saved or exported), use the `formvis` MCP server's tools, guided by the `formvis-driving` skill in `.agents/skills/formvis-driving` (a sub-skill per kind of edit; `references/commands.md` lists every window command and `.agents/skills/formvis-editing/references/tools.md` every MCP tool). Start with `get_document` and `get_image`, and check each change with `get_image`. `list_commands`, `describe_command` and `run_command` reach the same catalogue the window's menus and palette use; `./formvis cli` runs it from a shell. Profile, intent, CMYK and Lab questions go to `formvis-colour-science`.

The MCP server is configured for this repository in `.codex/config.toml` (Codex) and `.cursor/mcp.json` (Cursor); both run `./formvis mcp`, which starts the formvis engine when it is not running. From any other folder, `./formvis agents install` sets Claude Code, Codex and Cursor up for the user account. The first edit asks the person once, in the formvis window, to allow outside agents; every tool error says what to do next.

## Changing formvis's code

Read `CLAUDE.md` and `.agents/skills/formvis-harness/SKILL.md` first (the same skill sits in `.claude/skills`): they map the subsystems, the laws that apply everywhere, and the specialist sub-skills. After changing the MCP tools in `backend/app/routers/mcp.py` or the window's commands, run `./formvis agents sync` (with the engine's `backend/venv/bin` first on PATH, after the window has run once so the catalogue is mirrored): it regenerates the tool reference, the command reference, the command map and the tool map, and mirrors every skill into `.agents/skills`; `./formvis agents sync --check` fails on any drift and on a skill file that breaks the upload gates, and the engine tests run it.

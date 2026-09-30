# formvis

A layered image editor for the web and the desktop: vanilla TypeScript and Vite frontend, Python and FastAPI engine, Tauri 2 shell. Two kinds of work happen here; pick the one the person asked for.

## Editing pictures (natural language)

When the person wants a picture edited (retouched, an object removed or added, a background removed, text or a title added, colours graded, resized, cropped, upscaled, opened, saved or exported), use the `formvis` MCP server's tools, guided by the `formvis-editing` skill in `.agents/skills/formvis-editing` (its `references/tools.md` lists every tool). Start with `get_document` and `get_image`, and check each change with `get_image`.

The MCP server is configured for this repository in `.codex/config.toml` (Codex) and `.cursor/mcp.json` (Cursor); both run `./formvis mcp`, which starts the formvis engine when it is not running. From any other folder, `./formvis agents install` sets Claude Code, Codex and Cursor up for the user account. The first edit asks the person once, in the formvis window, to allow outside agents; every tool error says what to do next.

## Changing formvis's code

Read `CLAUDE.md` and `.claude/skills/formvis-skillset/SKILL.md` first: they map the subsystems, the laws that apply everywhere, and the specialist sub-skills. After changing the MCP tools in `backend/app/routers/mcp.py`, run `./formvis agents sync` so the editing skill's tool reference and its mirror follow; the engine tests fail until you do.

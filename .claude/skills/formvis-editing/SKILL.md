---
name: formvis-editing
description: Superseded by formvis-driving, which holds the same guidance split by task. Use when the person wants a picture edited in formvis through its MCP tools (blur, retouch, remove an object or background, add text, resize, export) and formvis-driving is not installed; otherwise read formvis-driving. Not for changing formvis's own source code (use formvis-harness).
---

# Editing pictures in formvis (moved)

This skill has moved to `formvis-driving` (`.claude/skills/formvis-driving/SKILL.md`), which routes to a sub-skill for each kind of edit: documents and files, layers and masks, selections, painting, adjustments and filters, colour and modes, type and shapes, transform and warp, generation and AI, timeline and video, export, and terminal. This pointer stays for one release; then it goes. The tool reference `references/tools.md` stays here because `./formvis agents sync` generates it.

If `formvis-driving` is not installed (user-level installs copy only this folder), use this short path:

1. `get_document` for the size, open documents and layer ids (nothing open: `new_document` or `open_file` with an absolute path), then `get_image` to look.
2. Make one change, then `get_image` again and `undo` if it is wrong.
3. Remove an object: `select` or `select_subject`, then `generative_fill` with no prompt. Add or replace: `generative_fill` with a prompt. Text: `add_text`. Resize: `resize_image`. Look: `add_adjustment`, `apply_filter` (after `rasterize_layer` for text or shapes).
4. Finish with `export_image` to an absolute path, and `save_project` to keep it editable.

Every tool with its parameters is in `references/tools.md`.

## When something fails

Every formvis error says what to do next. Read it, do that, retry.

| What you see | What it means | What to do |
| --- | --- | --- |
| No formvis tools at all | The MCP server is not connected in this client | Tell the person to run `./formvis agents install` in the formvis folder, or approve the project's MCP server, then restart the client |
| "formvis is not open" | No window, and one could not be opened | Ask the person to run `./formvis boot` (or open the formvis app), then retry |
| "did not allow outside agents" | The person clicked Not now in formvis | Ask them to allow it (the question in the window, or Preferences > Plugins), then retry |
| "No layer has the id" | A stale or mistyped id | `get_document` again and use the ids it gives |
| A tool name that does not resolve | A near-miss name | Use the exact names in `references/tools.md`; they are case sensitive |
| A multi-step edit stopped halfway | One step failed | `get_document` and `get_image` to see where it stands; `undo` back if needed; continue from there |

To tell a skill problem from a server problem: call `get_document` directly. If that fails, the problem is the connection or the window, not how the tools are used.

## Setup, for the person

In the formvis folder: `./formvis agents install` sets up Claude Code, Codex and Cursor for their user account (the MCP server and this skill), so pictures can be edited from any folder. Inside the formvis repository nothing is needed: `.mcp.json`, `.cursor/mcp.json` and `.codex/config.toml` already point at `./formvis mcp`, which starts formvis's engine when it is not running. The first edit asks the person once, in the formvis window, to allow outside agents.

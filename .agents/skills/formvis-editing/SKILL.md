---
name: formvis-editing
description: Edit pictures in formvis, the layered image editor, by asking in plain language through its MCP server. Use whenever the person wants a picture or photo retouched, an object removed or added, a background removed, text or a title added, colours graded, a poster, thumbnail or graphic made, a picture resized, cropped, extended or upscaled, or files opened, saved or exported, and the formvis tools (get_document, get_image, generative_fill and the rest) are available or the person mentions formvis. Covers checking the picture, choosing layers, local-first generative fill with LaMa and Krea 2, filters and adjustments, and saving and exporting at real paths. Also use when a formvis tool fails and the next step is unclear. Not for editing formvis's own source code (use formvis-skillset for that).
---

# Editing pictures in formvis

formvis is a layered image editor running on this computer. Its MCP server (named `formvis`) gives you tools that act on what is open in its window, so every change the person asks for becomes an ordinary, undoable step they can see. These tools are the hands; this skill is how to use them well.

Work in small verified steps. After each change, call `get_image` and look: the tools report what they did, but only the picture shows whether it looks right. The person is watching the window, so a quick visual check also catches misunderstandings early.

## Before anything

1. `get_document`: the size, the open documents, and the layers bottom to top with their ids and kinds. Most tools take a layer id from here. Nothing open? `new_document` or `open_file` (an absolute path).
2. `get_image`: see the picture before touching it.

The server's `edit_strategy` prompt holds the full decision tree; `references/tools.md` lists every tool with its parameters.

## Workflow 1: retouch a photo (remove, add, recolour)

1. `open_file` with the photo's absolute path, then `get_document` and `get_image`.
2. Select what to change: `select_subject` for the main subject, `select` with shape `rectangle` or `ellipse` around an object (pixels from the picture's top-left), or `select_color_range` for a colour.
3. To remove it: `generative_fill` with no prompt. With model `auto` this runs LaMa on this computer when it is downloaded, filling from the surroundings; no key, no cost.
4. To replace or add something: `generative_fill` with a prompt describing it. Krea 2 runs it here when installed; otherwise fal, and formvis asks the person first because it costs money.
5. `select` with shape `none`, then `get_image` to check. `undo` if it is wrong, and try a tighter selection.
6. `export_image` to an absolute path (.png, .jpg or .webp), and `save_project` (.fmv) if the person wants to keep editing later.

## Workflow 2: make a graphic (a poster, a thumbnail, a title card)

1. `new_document` at the destination's size (for example 1280 x 720 for a video thumbnail).
2. Background: `fill` a colour, `generate_image` from a prompt, or `open_file` a photo and work in that document.
3. Elements each on their own layer: `draw_shape` for plates and bars, `add_text` for words (size in pixels, colour #rrggbb, font).
4. Arrange: `transform_layer` to move or scale (x and y are the layer's top-left), `move_layer` to change the stacking.
5. Looks: `add_adjustment` (hsv, curves, levels, exposure, splitToning, glow and more), `add_film_layer` for a light leak or frame.
6. Check with `get_image`, then `export_image`.

## Workflow 3: prepare a picture for a destination

- Scale everything: `resize_image` (keep the proportions yourself: scale width and height by one factor).
- Keep only part: `crop` to a rectangle.
- Add space: `resize_canvas` with an anchor; or `generative_expand` to grow the canvas and paint the new border.
- Enlarge: `upscale` 2 or 4 times (Real-ESRGAN here when downloaded) into a new document.
- Then `export_image`.

## Things that matter

- The active layer is what most tools act on: `set_layer` with `active: true` chooses it.
- Filters need pixels. A text, shape or smart-object layer must be turned into pixels with `rasterize_layer` first; the filter's error says so and names the id.
- Adjustments are layers that change what is beneath them without changing pixels; change one later with `set_adjustment`.
- Paths are absolute (`~` works); the folder must exist. `save_project` and `export_image` replace an existing file.
- Generative tools prefer this computer. When nothing can run, the error names exactly what to download (Preferences > Plugins > Local models) or set up; pass that on to the person.

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

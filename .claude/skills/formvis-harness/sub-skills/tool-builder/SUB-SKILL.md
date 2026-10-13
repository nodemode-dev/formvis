---
name: tool-builder
description: Adding or changing formvis tools in frontend/src/extensions. Use for a new tool, tool options in the options bar, a tool's shortcut key, flyout variants, cursors, overlays such as marching ants or transform handles, and pointer and keyboard behaviour on the stage for the Move, Marquee, Lasso, Crop, Brush, Healing, Clone, Smear, Gradient, Shape, Pen or Type tools.
---

# tool-builder

A tool is a self-registering module. The rail, the options bar, the cursor, the flyouts and the keyboard routing are all built from its declaration, so a new tool changes no shell code. About 45 tools exist; `frontend/src/extensions/tools/` holds one module per tool (and shared files such as `brush-common.ts`).

## The Tool contract (`frontend/src/extensions/registry.ts`)

- Identity: `id` (a `ToolId`, the union in `frontend/src/engine/types.ts`), `label`, `key` (one letter; several tools may share a key and Shift cycles them, as J holds Spot Healing, Healing Brush and Patch), `order` (rail position), optional `group` (the slot it shares), `icon(engine)` returning an icon key, `hint(engine)` for the status bar.
- Flyout: `variants(engine)` returns `ToolVariant` entries (`id`, `label`, `icon`, `active()`, `pick()`), the modes of one tool listed as their own flyout items (the marquee's ellipse, the lasso's kinds).
- Input: `down`, `move`, `up`, `hover`, `cancel`, `keydown`. A `ToolPointer` carries `doc` and `screen` coordinates, `button`, modifiers (`shift`, `alt`, `mod`), `clicks`, `pressure` and `pose` (pen tilt and twist). `keydown` runs before commands; return true only for keys you consumed, and never consume Mod combinations.
- Cursor: `cursor(ctx, p)` returns a CSS cursor; the brush returns `'none'` and draws its own in `overlay`.
- Output: `overlay(ctx, g)` draws in CSS pixels on a context already scaled for the device; colours come from `ctx.paint()` (`accent`, `handle`, `antsA`, `antsB`); animated outlines use `dashed(ctx, g, trace)` and `ctx.antsPhase()`; `ctx.view()` gives `zoom`, `toScreen` and `toDoc`.
- Options: `options(engine)` returns `OptionSpec` entries: `title`, `segment`, `range`, `toggle`, `select`, `readout`, `color`, `number`, `button`, each optionally with `when()`. `OptionsBar` (`frontend/src/ui/options.ts`) builds them once and refreshes values in place; call `engine.emit('options', null)` after a setter changes state the bar shows.
- `toolHost.run(id)` lets an options button run a command (dialogs live with the app; `app.ts` connects it).

## Adding a tool

1. Add the id to `ToolId` in `frontend/src/engine/types.ts`.
2. Create `frontend/src/extensions/tools/[name].ts` exporting a `Tool` (model it on a neighbour: `pencil.ts`, `eraser.ts` for brush family; `gradient.ts` for a pending edit that commits on `settle`; `marquee.ts` and `lasso.ts` for selection; `crop.ts` for an overlay with handles).
3. Import it in `frontend/src/extensions/tools/index.ts` and add it to the list inside `registerBuiltinTools`. Ids must be unique (`registerTool` throws on a repeat); keys may be shared deliberately.
4. Change documents only through `Engine` methods; add one with `engine-builder`. Strokes use `engine.beginStroke`, `strokeTo`, `endStroke`, `cancelStroke` (see `brush-engine`).
5. If the icon key is missing from `frontend/src/ui/icons.ts`, copy it verbatim from the NodeMode icon module; never add an icon library.
6. Tool rail grouping and the title-bar tools come from `frontend/src/ui/tool-groups.ts`, `rail.ts` and `titlebar-tools.ts`; check a new tool lands where intended.
7. Update `.docs/wiki/Tools.md` and `.docs/wiki/Keyboard-Shortcuts.md`, log it in `frontend/HASHOUT_LOG.md`, and run `references/verification.md`.

## Patterns worth copying

- Brush family shares `brush-common.ts`: `drawBrushCursor`, `brushKeys` (the `[` and `]` size and hardness keys, digits for opacity) and `brushOptions`.
- A tool that previews work (Gradient, Liquify, Smudge) keeps the pending edit in the engine and shows it as an override; the document changes once, inside `engine.edit`.
- Pointer capture: capture only after a drag passes its threshold; capturing on press retargets `click` and `dblclick` to the container.
- Tools must cope with no document, a locked layer, a text or shape layer and a giant tiled layer by calling the engine and relaying its notice, not by checking those cases themselves.
- Tool audits live in `e2e/test_tool_audit.py` through `test_tool_audit_4.py`; a new tool should survive them.

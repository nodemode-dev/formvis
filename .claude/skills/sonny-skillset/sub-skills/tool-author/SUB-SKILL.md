---
name: tool-author
description: Adding or changing sonny tools in frontend/src/extensions. Use for a new tool, tool options in the options bar, tool shortcuts, cursors, overlays such as marching ants or transform handles, or pointer and keyboard behavior on the stage, including the remaining the reference app tools crop, spot healing, clone stamp, smear, gradient and shape.
---

# tool-author

A tool is a self-registering module. The rail, the options bar, the cursor and the keyboard routing are all built from its declaration, so a new tool changes no shell code.

## The Tool contract (`frontend/src/extensions/registry.ts`)

- Identity: `id` (a `ToolId`), `label`, `key` (single letter), `order` (rail position), `icon(engine)` returning an icon key, `hint(engine)` for the status bar.
- Input: `down`, `move`, `up`, `hover`, `cancel`, `keydown`. Pointers carry `doc` and `screen` coordinates, modifiers and `clicks`. `keydown` runs before commands; return `true` only for keys you consumed, and never consume Mod combinations.
- Output: `overlay(ctx, g)` draws in CSS pixels on a context already scaled for the device; colors come from `ctx.paint()`; animated outlines use `dashed()` and `ctx.antsPhase()`.
- Options: `options(engine)` returns `OptionSpec` entries (`title`, `segment`, `range`, `toggle`, `readout`, `button`). The options bar builds them once and refreshes values in place.

## Adding a tool

1. Create `frontend/src/extensions/tools/[name].ts` exporting the `Tool`.
2. Add it to the list in `frontend/src/extensions/tools/index.ts`; keys and ids must be unique.
3. Change documents only through `Engine` methods; add one via `engine-core` if needed.
4. If the icon key is missing from `frontend/src/ui/icons.ts`, copy it verbatim from the NodeMode icon module; never add an icon library.
5. Update `.docs/wiki/Tools.md` and `.docs/wiki/Keyboard-Shortcuts.md`, log it in `frontend/HASHOUT_LOG.md`, then run `ui-verification`.

## Remaining parity tools

`ToolId` already names `crop`, `spotHealing`, `cloneStamp`, `smear`, `gradient` and `shape`. Each needs its engine operation first.

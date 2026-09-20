# Tools

A tool is a self-registering module: it declares its key, icon, hint, cursor, pointer handlers, keyboard handler, overlay drawing and options. The options bar and the rail are built from these declarations, so adding a tool touches no shell code.

| Source path | What lives there |
| --- | --- |
| `frontend/src/extensions/registry.ts` | `Tool` and `OptionSpec` types, `registerTool`, key lookup, the dashed outline helper |
| `frontend/src/extensions/tools/index.ts` | `registerBuiltinTools`, the one place tools are listed |
| `frontend/src/extensions/tools/move.ts` | Move, eight resize handles, rotation outside the corners, nudge, digit opacity; with several layers or a folder selected, the handles surround them all and transform them together; with an unlinked mask targeted, the handles move, resize or rotate the mask alone; Cmd-drag a corner handle to free distort (pending until Enter, Escape cancels; groups and folders too); snap guides, editable X, Y, W, H, Scale and Angle fields with Sampling and Snap; dragging inside a selection moves its pixels (Alt duplicates); Enter and Escape apply or cancel a floating selection |
| `frontend/src/extensions/tools/marquee.ts`, `lasso.ts`, `wand.ts`, `select-common.ts` | Selection tools and the shared modifier-to-mode rule |
| `frontend/src/extensions/tools/brush.ts` | Brush and Eraser, size and hardness keys, right-drag to resize (Shift: hardness) with the circle pinned at the press, the brush cursor |
| `frontend/src/extensions/tools/eyedropper.ts`, `hand.ts`, `zoom.ts` | Sampling (with the reference app's sample ring during drags and its Sample Ring option) and navigation |
| `frontend/src/extensions/tools/crop.ts`, `gradient.ts`, `shape.ts` | Crop frame with ratios and snapping to the canvas and visible layers' edges (the reference app's CropSnap), pending gradient with movable ends, shape layers |
| `frontend/src/extensions/tools/heal.ts`, `clone.ts`, `smear.ts`, `brush-common.ts` | Spot Healing, Clone Stamp (with the preview inside the brush circle of what a click would stamp), Smear (Liquify, Blur, Smudge; Blur also softens a targeted layer mask), and the brush cursor, keys and options they share |

## Contract

- Register through `registerBuiltinTools`; ids and keys are unique.
- Change documents only through `Engine` methods; never touch the DOM.
- Draw overlays in CSS pixels on the `CanvasRenderingContext2D` you are given, using colors from `ctx.paint()`.
- Options are declarative `OptionSpec` entries; the options bar owns their DOM.
- `cancel` must leave no partial edit behind.

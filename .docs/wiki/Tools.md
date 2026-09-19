# Tools

A tool is a self-registering module: it declares its key, icon, hint, cursor, pointer handlers, keyboard handler, overlay drawing and options. The options bar and the rail are built from these declarations, so adding a tool touches no shell code.

| Source path | What lives there |
| --- | --- |
| `frontend/src/extensions/registry.ts` | `Tool` and `OptionSpec` types, `registerTool`, key lookup, the dashed outline helper |
| `frontend/src/extensions/tools/index.ts` | `registerBuiltinTools`, the one place tools are listed |
| `frontend/src/extensions/tools/move.ts` | Move, eight resize handles, rotation outside the corners, nudge, digit opacity |
| `frontend/src/extensions/tools/marquee.ts`, `lasso.ts`, `wand.ts`, `select-common.ts` | Selection tools and the shared modifier-to-mode rule |
| `frontend/src/extensions/tools/brush.ts` | Brush and Eraser, size and hardness keys, the brush cursor |
| `frontend/src/extensions/tools/eyedropper.ts`, `hand.ts`, `zoom.ts` | Sampling and navigation |
| `frontend/src/extensions/tools/crop.ts`, `gradient.ts`, `shape.ts` | Crop frame with ratios and snapping, pending gradient with movable ends, shape layers |

## Contract

- Register through `registerBuiltinTools`; ids and keys are unique.
- Change documents only through `Engine` methods; never touch the DOM.
- Draw overlays in CSS pixels on the `CanvasRenderingContext2D` you are given, using colors from `ctx.paint()`.
- Options are declarative `OptionSpec` entries; the options bar owns their DOM.
- `cancel` must leave no partial edit behind.

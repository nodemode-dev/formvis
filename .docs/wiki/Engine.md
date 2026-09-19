# Engine

The engine is the document model and every operation on it, with no DOM access: it can run headless. It owns projects (open tabs), each with a document, a history, a selection and a viewport. The UI calls its methods and listens to its events; nothing else mutates a document.

| Source path | What lives there |
| --- | --- |
| `frontend/src/engine/index.ts` | `Engine`: projects, edits, undo and redo, layer, mask, clip, merge, selection, paint, transform and export operations |
| `frontend/src/engine/types.ts` | Layer, document, transform and mask types, the 13 blend modes, limits |
| `frontend/src/engine/renderer.ts` | Rendering: blend modes, opacity, pass-through folders, raster and folder masks, clipping chains, adjustments |
| `frontend/src/engine/history.ts` | Structure snapshots plus region pixel patches, 100 entries and 256 MB |
| `frontend/src/engine/selection.ts` | `SelectionMask` and the ported pixel-edge contour tracer for marching ants |
| `frontend/src/engine/kernels.ts` | Levels, Curves, Exposure, Gradient Map kernels and the Magic Wand fill, ported from the C sources |
| `frontend/src/engine/stroke.ts` | Brush stamping at the reference app's spacing (2.5 percent soft, 1.5 percent hard) |
| `frontend/src/engine/transform.ts` | Handle hit geometry and move, resize and rotate drag math |
| `frontend/src/engine/geometry.ts`, `surface.ts`, `tree.ts`, `viewport.ts`, `project.ts`, `events.ts` | Matrices, canvases, the layer hierarchy, zoom and pan, the project record, the event emitter |

## Contract

- Every document change goes through `Engine.edit(name, fn)` or an explicit begin and end pair, so it lands in history exactly once. A change that alters nothing returns `false` and records nothing.
- Documents are immutable values: replace layers with `Project.setLayers` or `updateLayer`, never mutate a layer in place. Pixel changes record a `PixelPatch` for the touched region.
- Respect `LIMITS`: 30,000 px per side, 100 megapixels, 64 folder levels, 10,000 layers.
- Emit the narrowest event that describes the change; the UI redraws per event.
- No DOM, no `document`, no `window` layout reads in this folder.

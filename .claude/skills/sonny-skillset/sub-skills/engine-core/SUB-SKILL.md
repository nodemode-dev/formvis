---
name: engine-core
description: The sonny document engine in frontend/src/engine. Use when adding or changing a layer, folder, mask, clipping, merge, selection, painting, fill, transform, history or export operation, when porting a C kernel, or when an undo entry is missing, duplicated or empty.
---

# engine-core

The engine is the only code that changes a document. It has no DOM access and can run headless.

## Files

| Path | Role |
| --- | --- |
| `index.ts` | `Engine`: every public operation, events, projects |
| `types.ts` | Layer, document, transform, mask types; blend modes; `LIMITS` |
| `renderer.ts` | Blend modes, opacity, pass-through folders, masks, clipping chains, adjustments |
| `history.ts` | Snapshots plus region pixel patches; 100 entries, 256 MB |
| `selection.ts` | `SelectionMask`, combine modes, the contour tracer for marching ants |
| `kernels.ts` | Levels, Curves, Exposure, Gradient Map, Magic Wand fill |
| `stroke.ts` | `PixelStroke`: stamping, spacing, selection clipping, commit patch |
| `transform.ts` | Handles, move, resize and rotate math |

## Building an operation

1. Add a method on `Engine` that wraps the change in `this.edit(name, (p) => {... })`. The name is the undo label.
2. Replace, never mutate: `p.setLayers(next)` or `p.updateLayer(id, patch)`. Rasters are the exception; pixel changes read the region before and after and record a `PixelPatch` (see `regionEdit`).
3. Return `false` for a no-op and do not call `setLayers`: history compares document identity, so a fresh array with the same content still records an empty entry.
4. After any reorder or parent change, pass the array through `normalizeClips`.
5. Live previews (brush strokes, transform drags) never touch the document; they flow through `overrides()` into the renderer and commit once on release.
6. Wire the UI: a command in `frontend/src/app.ts` (id, label, keys, `enabled`), a menu entry, then an entry in `frontend/HASHOUT_LOG.md` and a case in the sidecar `TEST_PLAN.md`.

## Facts that bite

- A mask raster keeps its value in the alpha channel with white color; on disk it is a grayscale PNG. A mask whose raster is `null` reveals everything.
- `ensurePixels` grows an axis-aligned layer to cover the canvas before painting; a transformed layer is painted in its own pixel space.
- Limits: 30,000 px per side, 100 megapixels per document, 64 folder levels.
- Ported: Hue/Saturation and Grain (`adjust.ts`), noise, lens, blurs and the histogram (`filters.ts`) in 0.2.0; Spot Healing, Content-Aware Fill, Smudge and Liquify (`retouch.ts`) in 0.3.0. Still to port: `GuidedMatte.swift` (fully ported in 0.9.0 as `matte.ts`, with `SubjectRemoval.refined`, for the Remove Background panel), `LevelsAutomatic.swift` (fully ported: Auto in 0.6.0 as `autoLevels`, the eyedroppers in 0.7.0 through `sampleOriginal` and the panel's click-through sampling), `Distort.swift` (free distort), `FloatingSelection.swift` (moving and duplicating selected pixels landed in 0.4.0 as `beginPixelMove`, Transform Selection in 0.5.0 as `beginSelectionTransform`; a float stays open through `settle(true)` and merges through `growLayer`). Snapping lives in `snapMove`; precise transforms go through `setLayerTransform`. Destructive edits go through `applyImageEdit`, previews through `previewImageEdit`.

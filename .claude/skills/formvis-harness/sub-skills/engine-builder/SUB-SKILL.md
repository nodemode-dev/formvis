---
name: engine-builder
description: The formvis document engine in frontend/src/engine. Use when adding or changing a document operation, layer, folder, mask, clipping chain, merge, selection, fill, transform, history step or undo entry, a 16 or 32 bit pixel path, a tiled giant layer, or when an undo entry is missing, duplicated or empty, a rollback message appears, or a stroke leaves the document unmodified.
---

# engine-builder

The engine is the only code that changes a document. It has no DOM access and can run headless. `Engine` in `frontend/src/engine/index.ts` is the public surface; most operations are thin wrappers over modules that take a host object.

## Files

| Path | Role |
| --- | --- |
| `index.ts` | `Engine`: every public operation, events, projects, `edit`, `settle`, snapshots |
| `project.ts` | `Project`: `doc`, `selection`, `activeId`, `selectedIds`, `history`, `viewport`; `snapshot`, `layer`, `setLayers`, `updateLayer` |
| `types.ts` | `Layer`, `Doc`, `Transform`, `Mask`, `ChannelPixels`, `BLEND_MODES`, `LIMITS`, `newLayer`, `uid` |
| `history.ts` | `History`: `begin`, `addPatch`, `end`, `rollback`; 100 steps, 256 MB; `PixelPatch`, `Snapshot` |
| `layer-structure.ts` | `StructHost` operations: `addLayer`, `addFolder`, `duplicateLayers`, `deleteLayers`, `moveLayers`, `groupLayers`, `toggleClip`, `mergeLayers`, `normalizeClips` |
| `layer-masks.ts` | `MaskHost` operations: `addMask`, `deleteMask`, `copyMask`, `setMaskFromImage`, `applySubjectMask` |
| `select-ops.ts`, `selection.ts`, `select-mask.ts` | Selection operations and `SelectionMask`, `traceOutline` for marching ants |
| `paint-ops.ts` | `PaintHost` operations: `fill`, gradient drag, `flipLayers`, `nudge`, `growLayer` |
| `image-edit.ts` | `EditHost` operations: `regionEdit`, `applyImageEdit`, `previewImageEdit`, `contentAwareFill` |
| `transform.ts`, `transform-entry.ts`, `transform-commit.ts`, `pixel-move.ts` | Handles, entry and commit of transforms and floating selections |
| `renderer.ts`, `blend.ts`, `compose-float.ts` | Blend modes, masks, clipping, adjustments; the float compositor |
| `deep.ts`, `derive.ts`, `lab.ts`, `colour-lut.ts` | 16 and 32 bit pixels, deriving channels, Lab, colour tables |
| `tiled.ts` | `TiledRaster` (`TILE` 2048), giant layers kept as tiles |
| `document-size.ts` | Image Size, Canvas Size, crop |
| `video-timeline.ts`, `timeline.ts` | Video timeline and frame animation |

## Building an operation

1. Add a method on `Engine` that wraps the change in `this.edit(name, (p) => { ... })`. The name is the undo label shown in the History panel.
2. Replace, never mutate: `p.setLayers(next)` or `p.updateLayer(id, patch)`. Rasters are the exception: a pixel change reads the region before and after and records a `PixelPatch` (see `regionEdit` in `image-edit.ts`).
3. Return `false` for a no-op and do not call `setLayers`: `History.end` drops a step only when no patches were added and `doc` and `selection` kept their identity, so a fresh array with the same content still records an empty step.
4. After any reorder or parent change, pass the array through `normalizeClips`. In memory a clipped layer carries `clipId`; the project file calls it `maskSourceID`.
5. Live previews (brush strokes, transform drags, gradient drags) never touch the document; they flow through overrides into the renderer and commit once on release. `settle()` commits whatever is pending (distort, gradient, transform, floating selection) before an edit starts.
6. Large new logic goes in its own module with a small host interface (`StructHost`, `MaskHost`, `PaintHost`, `EditHost`, `SelectHost`, `CommitHost`), and `Engine` keeps a one-line wrapper, as `addLayer(opts)` calls `LS.addLayer(this.structHost, opts)`.
7. Wire the UI with `command-author`, then log the change in `frontend/HASHOUT_LOG.md` and add a case to the sidecar `TEST_PLAN.md`.

## Facts that bite

- `edit` returns false when no project is open, a stroke is running, or the engine is busy (`busyWith`, set by `task`). Operations that take time go through `engine.task(async () => ...)`.
- If the callback throws, `rollBack` restores pixels and structure, records the error in `engine.failures` and shows a notice; nothing is recorded in history.
- In a 16 or 32 bit, CMYK or Lab document, `edit` snapshots the layers, runs the callback, then calls `deriveChannels` so each layer's float `channels` follow its 8 bit `raster`. If an operation changes `raster` but cannot update `channels`, `edit` rolls the step back with the notice "does not work in CMYK yet" or "does not work in N bits yet". Give such an operation a deep path (see `deep.ts`) or let it decline.
- A mask raster keeps its value in the alpha channel with white colour; on disk it is a grayscale PNG. A mask whose raster is null reveals everything.
- `ensurePixels` (private in `Engine`) grows an axis-aligned layer to cover the canvas before painting; a transformed layer is painted in its own pixel space.
- A layer past one canvas's pixels is a `TiledRaster` in `layer.tiled` and `layer.raster` is null; code that reads `raster` must decline such a layer or learn tiles.
- Limits live in `LIMITS` (`types.ts`): 30,000 px per side, 100 megapixels per document by default (`setPixelBudget` can raise it to 250 million), 10,000 layers, 64 folder levels.
- Memory: `engine.room(bytes, what)` asks for room before a large allocation; `pageOut` sends a document's oldest undo tiles to the engine service's undo store (`backend/app/routers/undo.py`) once undo exceeds its share, and `pageTiles` does the same for giant layers' tiles.

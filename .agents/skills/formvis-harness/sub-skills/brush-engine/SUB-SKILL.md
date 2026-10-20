---
name: brush-engine
description: The formvis brush and stroke model. Use for fixing or tuning the brush code, PixelStroke dabs and spacing, hardness, flow and opacity, stroke smoothing, airbrush, pen pressure, tilt and twist dynamics, Brush Settings (tip shape, scattering, texture, dual brush, colour dynamics, transfer, wet edges), brush presets, .abr sampled tips, the Pencil, Eraser, Mixer, History Brush and healing strokes that reuse PixelStroke, or stroke undo patches.
---

# brush-engine

A brush stroke is a live preview that becomes one undo step. Nothing touches the document until the pointer is released.

## The pipeline

1. `ToolPointer` (`frontend/src/extensions/registry.ts`) carries `doc`, `pressure` and `pose` from the stage (`frontend/src/ui/stage.ts` builds it from the pointer event; pen events give pressure, mouse events give 1).
2. A brush-family tool calls `engine.beginStroke(pt, shift, pressure, pose, opts)`, then `engine.strokeTo(pt, pressure, pose)` per move, `engine.airbrushTick(pressure)` on a timer while held, and `engine.endStroke()` or `engine.cancelStroke()`. `opts` takes `aliased` (hard pixel-exact dabs, the Pencil), `square`, `autoErase` and `name` (the undo label). `engine.stroking` says whether one is running. `beginStroke` returns false and relays a notice when the layer cannot be painted (no pixel layer, smart object locked, 16 bit limits, no room).
3. `Engine.beginStroke` opens a history step, resolves the target (layer pixels or mask, through the private `target`), and builds a `PixelStroke` (`frontend/src/engine/stroke.ts`) with the style `{ ...engine.brush, color, bg, flow: engine.brushFlow, aliased, square }`, the operation (`source-over` to paint, `destination-out` to erase) and the selection.
4. `PixelStroke.to(p, pressure, pose)` lays dabs between the last point and this one at the spacing the style or `BrushShape.spacing` sets. `compose()` returns the changed rectangle for the preview, `coverageAlpha()` the stroke's alpha, `commit()` or `commitTiles()` (giant tiled layers) returns the `PixelPatch` or patches, and `release()` returns surfaces to the spare pool.
5. `endStroke` adds the patch to the history step (`History.addPatch`) and ends it. The renderer shows the stroke through the engine's overrides while it runs.

## Settings the stroke reads

| Thing | Where |
| --- | --- |
| `BrushSettings` `{ diameter, hardness, opacity, tip }` | `engine.brush`, changed with `engine.setBrush(patch)` |
| Flow | `engine.brushFlow` |
| `BrushShape`: angle, roundness, spacing, size, angle and roundness jitter, scatter, count, texture, dual brush, colour dynamics, transfer, noise, wet edges | `frontend/src/engine/brush-dynamics.ts`; `engine.brushShape`; `defaultShape()` and `shapeActive()` (an inactive shape leaves strokes exactly as the plain round brush) |
| `BrushDynamics` `{ size, flow }`, each a `CurveOptionSpec` fed by sensors | `engine.brushDynamics`; `computeOption(opt, info)` maps pressure through a curve to a multiplier; `pressureOption(min, max, curve)` and `identityOption()` build specs; `combine` is `mul`, `add`, `max`, `min` or `diff` |
| `PenPose` `{ tiltX, tiltY, twist }`, `UPRIGHT` | angle control `tilt` and `rotation`, roundness control `tilt` |
| Presets | `BUILTIN_BRUSH_PRESETS`, `allBrushPresets()`, `presetFromTip`, `presetsFromJson`, `setImportedBrushPresets`; `engine.applyBrushPreset(preset)` |
| Sampled tips | `parseAbr(buf, base)` in `frontend/src/engine/abr.ts` returns `AbrBrush[]` (`SampledTip` is `{ w, h, data }`); `importAbr(engine, file)` and `loadImportedBrushes()` in `frontend/src/io/brush-library.ts` store them |
| UI | `frontend/src/ui/panels/brush-settings.ts` (Window > Brush Settings), the Brush options in `frontend/src/extensions/tools/brush.ts` (Airbrush, Smoothing, Angle, Mode) |

Smoothing lives in the tool, not the engine: `brush.ts` steers a trailing point and `strokeTo` receives that point; on release the stroke catches up to the pointer.

## Related strokes

The Pencil (`pencil.ts`), Eraser (`eraser.ts`), Background Eraser, Magic Eraser, Pattern Stamp, Clone, Mixer, History Brush (`history-brush.ts`, paints a snapshot back) and the healing family reuse `PixelStroke` through other engine entry points (`beginRetouchStroke`, `beginSelectionBrushStroke`, quick mask strokes). When you change `PixelStroke`, run the brush e2e files: `e2e/test_brush.py`, `test_brush_dynamics.py`, `test_brush_flow.py`, `test_brush_modes.py`, `test_brush_settings_more.py`, `test_brush_tip.py`, `test_painting_tools.py`, and the unit test `frontend/tests/brush-dynamics.test.ts`.

## Facts that bite

- Spare working surfaces are pooled (`warmStrokeSurfaces`, `dropSpareSurfaces`, `spareBytes` in `stroke.ts`); a stroke that forgets `release()` leaks memory.
- A large layer's stroke works in a window around where it paints (`setStrokeWindowFrom`); do not assume the surfaces are layer-sized.
- On a giant tiled layer the brush, pencil and eraser paint with every Brush Settings option (shape, scattering, texture, dual brush, wet edges), byte-identical to a flat layer; the Mixer Brush, mask painting and selections decline with a notice. Keep that list true when you add features.
- 16 bit documents allow Brush, Pencil and Eraser (`deepPaintOk`); `strokeDeep` in `deep.ts` follows the 8 bit stroke into floats.
- Never change the document from `to()`; previews are overrides, the commit is one patch.
- The GPU brush in `native/formvis-render` (`TiledLayer::dab`, benchmark `brush_bench`) is a separate implementation for the native display; see `native-render-builder`. It does not call `PixelStroke`; check `frontend/src/gpu/native-display.ts` to see which strokes reach it before assuming a change in `stroke.ts` affects it.

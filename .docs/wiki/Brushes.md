# Brushes

A stroke is a live preview that becomes one undo step. Nothing touches the document until the pointer is released.

| Source path | What lives there |
| --- | --- |
| `frontend/src/ui/stage.ts` | Builds the tool pointer from the pointer event: pen pressure, tilt and twist, a touch screen's force, a Force Touch trackpad's press (`Stage.pressureOf`), 1 for a mouse |
| `frontend/src/engine/stroke.ts` | `PixelStroke`: lays dabs between points at the brush's spacing, composes the changed rectangle for the preview, commits one patch (or tile patches on giant layers) and releases pooled surfaces |
| `frontend/src/engine/brush-dynamics.ts` | `BrushShape` (angle, roundness, spacing, size and angle jitter, scatter, texture, dual brush, colour dynamics, transfer, noise, wet edges), `BrushDynamics` (size and flow curves fed by pressure, tilt, rotation), `shapeActive()` so an inactive shape paints exactly as the plain round brush |
| `frontend/src/engine/abr.ts`, `io/brush-library.ts` | Photoshop `.abr` import: sampled tips and presets stored in the browser |
| `frontend/src/engine/deep.ts` | The 16-bit paint path: Brush, Pencil and Eraser on 16-bit layers |
| `frontend/src/extensions/tools/brush.ts` and the tools beside it | Brush, Eraser, Pencil, Mixer, Smear, Clone, History and Art History brushes and the retouching brushes; options bar entries (Airbrush, Smoothing, Angle, Mode) |
| `frontend/src/ui/panels/brush-settings.ts` | Window > Brush Settings |

## Rules

- A large layer's stroke works in a window around where it paints; do not assume the surfaces are layer-sized.
- A stroke that forgets `release()` leaks pooled memory.
- A 16-bit document keeps its depth for the tools that support it and refuses the others with a message instead of dropping to 8 bits.
- Run `e2e/test_brush.py`, `test_brush_dynamics.py`, `test_brush_flow.py` and the painting tool tests after changing `PixelStroke`.

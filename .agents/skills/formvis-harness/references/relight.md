# Relight

Relight layers (1.73.0): virtual lights over the composite beneath a layer, rendered on the GPU with a CPU twin.

## Where it lives

| Concern | File | Symbols |
| --- | --- | --- |
| Light model, Looks, validator, depth estimate, geometry, CPU shading | `frontend/src/engine/relight.ts` | `RelightContent`, `RelightLight`, `RELIGHT_LOOKS`, `relightFrom`, `estimateDepth`, `depthFromGrey`, `relightGeometry`, `packLights`, `patternAt`, `shadeRelight`, `lightAt` |
| GPU twin | `frontend/src/gpu/relight-gl.ts` | `renderRelight`, `relightGpuAvailable`, `forgetRelightUploads` |
| Engine methods | `frontend/src/engine/index.ts` | `newRelightLayer`, `previewRelight`, `setRelight`, `dropNewRelight`, `compositeUnder`, the `relightPreview` override |
| Layer field | `frontend/src/engine/types.ts` | `Layer.relight`, `ToolId` `'relight'` |
| Project files | `frontend/src/io/project-io.ts` | `r.relight` written and read with `relightFrom` |
| Session, panel, bar, pill | `frontend/src/ui/relight-session.ts` | `RelightSession.begin`, `commit`, `cancel`, `sync` |
| Canvas handles | `frontend/src/extensions/tools/relight.ts` | `relightTool` (hidden), `setRelightHost`, `RelightHost` |
| Commands | `frontend/src/app.ts`, `frontend/src/automation/command-meta.ts` | `new-relight-layer`, `edit-relight`, `layer-content-options` |
| Styles | `frontend/src/styles/relight.css` | `.cv-relight*` |

## Rules that keep it correct

1. The CPU path (`shadeRelight`/`lightAt`) and the shader compute the same thing. Change both in the same commit and compare a lit centroid and pixel count in the browser: they matched exactly at 1.73.0.
2. A Relight layer is a baked pixel layer plus `relight`. Do not composite it live in `renderer.ts`; re-render on Done through `setRelight`.
3. Read the source with `compositeUnder(id)`, never `compositeBelow(id)`: the latter includes the layer itself and would relight the previous result.
4. Cast shadows only when `content.depth === 'model'`. Depth comes from `localDepthValues` (float32, `/api/depth/local?fmt=f32`), never the 8-bit PNG: 8-bit steps band the normals. Without the model `estimateDepth` is a flat plane on purpose; never invent a shape (1.74.0's dome made an oval stencil).
5. `smooth`/`sstep` divide by the signed span; a `max(1e-6, b - a)` guard inverts falling edges.
6. Geometry is float (RGBA32F on the GPU). 8-bit normals band under strong highlights.
7. 8-bit RGB documents only (`begin` and the command's `enabled` both check).
8. The DOM is built once; `sync()` patches values and keyed light rows. Never rebuild the panel.
9. Scene terms come from `sceneTerms` on both paths; the flattened source is `shadingField` (CPU array, R32F texture). A light's depth band is `depthWindow` (CPU) and `uF` (GPU); `near` 0 and `far` 100 mean no limit on that side.
10. `setRelight(..., amendNew)` folds into the creation step only when the caller made the layer in this session (`RelightSession.isNew`, or `apply`).
11. Agents use the `relight.apply` catalogue action (`automation/catalogue.ts`, `relightApply`), which calls `RelightSession.apply`; it never opens the panel.
12. Saved Looks live in this browser's storage under `formvis.relight.looks`, read through `relightFrom`; never in the document.
13. When an `icon()` sits in a node, set the label on `span:last-child`, not the first `span`: the icon is a span too.
14. Judge every change to the light model by rendering real Looks through the real engine with the model and looking at the full-size pixels beside the original. A number that passes is not a picture that looks lit.
15. Geometry constants live in `engine/relight.ts` (`NORMAL_RELIEF` 0.7, `SCENE_DEPTH` 1.2, `SHADOW_TAPS`); the shader reads `SCENE_DEPTH` from there and repeats the tap offsets, so change both together.
16. Relighting is re-shading. The light split (`backend/app/localgen/relight_split.py`, `/api/relight/split`) gives albedo, old shading S0, residual and, with Marigold, normals; the renderer is `albedo x (Original x S0 + new light) + Original x residual`. Never go back to multiplying new light over the photo as the default: the photo's own shadows then survive every Look.
17. Marigold runs one pipeline at a time in bfloat16 on a PIL-resized 768 px picture; never hold both, never float32 (OOM at 8 GB). Marigold repaints albedo and changes faces: it runs only when `split` is `marigold`, never for `auto`.
18. Never replace the subject's detail (1.76.0). The classic split's albedo is always `photo / shading` with a smooth shading field, and the residual is signed so Original 100 with no lights rebuilds the photo exactly. Shading is estimated per material (selfie multiclass parts, else chroma clusters), with features from YuNet landmarks kept out; tune it on a portrait with a hard split-face shadow and print a luminance and shading profile across the terminator: `logY - S0` must stay flat through the penumbra.
19. Lights stand above the depth under their aim (`zAim`), not above the nearest point of the picture; change `hL` in `lightAt` and the shader together.
20. The light model is calibrated against the reference video (1.77.0). Before changing a constant in `lightAt`, `packLights` or `patternAt`, re-run the benchmark: cut the original from frame 7 (box 464,234 to 835,899) and the results from frames 23, 26, 27, 31, 33 and 40, render the same settings with `relight.apply`, and compare the log gain (result over original) on the subject (depth 0.2 to 0.5) and on the wall (depth under 0.05). At 1.78.0 the mean error is 0.41 to 0.72 stops on all six; do not ship a change that raises it. Frame 28 is mid-drag (its intensity is not the panel's), so do not calibrate on it.
21. Depth maps the light (1.78.0): reach behind the aimed depth (`1 + rr^2` sun, `1 + rr^4` local), gobo softness growing with depth behind the aim (not for a Strip), height above the aimed surface. Keep these three in `lightAt` and the shader identical.

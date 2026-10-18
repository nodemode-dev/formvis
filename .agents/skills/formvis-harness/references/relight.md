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
| Canvas handles | `frontend/src/extensions/tools/relight.ts` | `relightTool` (in the rail, own slot; picking it starts a session through app.ts's `tool` listener), `setRelightHost`, `RelightHost` |
| Commands | `frontend/src/app.ts`, `frontend/src/automation/command-meta.ts` | `new-relight-layer` (Layer > New), `filter-relight` (Filter), `edit-relight`, `layer-content-options`; `relightWhy` disables them outside 8-bit RGB with a tooltip |
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
28. The room is a lit layer like the subject (1.85.0): the engine takes its own light out (SH over room normals times the slow brightness field), and `roomOriginal`, `roomLight`, `roomShadows`, `roomDepth` act only where the cut-out is below 0.5 (`sceneZ`, `shadeLayer(..., room)`). Without a split there is no room layer and the room terms do nothing.
27. Relight is camera space (1.84.0): `geo.data[3]` is distance along the camera axis with the subject at 1, `geo.focal` a fraction of the long side, `geo.bg` the background layer. A pixel's point is `rayAt(p) * z`; a light is `rayAt(marker) * zAim` lifted toward the camera by `lightLift` (Close to Far). Never reintroduce screen-space relief, `reach` cut-offs or bent pattern planes: shadows march in 3D (`visibility`), patterns project onto the centre's plane (`goboPx`). The GLSL `shadeLayer` and the TypeScript `shadeLayer` are twins; check them against each other on a sphere after any change.
26. The subject is a layer in the shader (1.83.0): the residual texture's alpha is the cut-out (-1 without a split), the S0 texture's alpha is the photo's texture for glints. Light on the subject is not cut by the background's reach; a pattern curves on the subject and is straight behind it; `RIM` draws the outline toward a side light. Packed intensity is `0.95 x i^2`. A light with `kelvin` and no `color` takes the kelvin's colour.
25. The split is a solved scene (1.82.0, `backend/app/localgen/relight_scene.py`): subject cut-out, two depth layers, MoGe-2 or slope normals, SH original light, `level` for brightness matching. The pixel is `photo x Original + surface x added light` (Take out 100). A local light is exposed at its aim; Softness is the source size. Change the backend and the frontend together: the split's binary layout is read in `io/local-gen.ts`.
24. Read the reference's panel values off its frames before benchmarking (1.81.0): 26 is Intensity 82, 28 is 31, 40 is 53 with Width 38 and Feather 30. Intensity is squared (`1.22 x i^2`); a pattern is laid on the picture plane at its centre (`goboPlaneUV`, centre `pattern.center` or the aim) and shifted along the light elsewhere. Seven frames, each under 0.55 stops mean error at 1.81.0.
23. Look at 100 percent beside the reference before shipping a light-model change (1.80.0): a hard slat edge, torn stripes in hair or a pale veil over lit skin are failures even when the gain numbers match. Slat phase is cyclic (`q`), never a smoothstep at 0 and 1; the projection reads smoothed depth with the soft-clamped band; the depth border is replaced.
22. Patterns are projected (1.79.0): `goboBasis` and `goboUV` give each surface point's gobo coordinates from the light (orthographic for a sun, perspective otherwise); never sample a pattern in picture space. A sun's direction is `sunTo` for shading and projection alike. The overlay draws the frame through `goboPoint`. Judge pattern changes on full-size crops beside the reference's frames 13, 15 and 21 (the slats must curve round the arm and step at silhouettes).
21. Depth maps the light (1.78.0): reach behind the aimed depth (`1 + rr^2` sun, `1 + rr^4` local), gobo softness growing with depth behind the aim (not for a Strip), height above the aimed surface. Keep these three in `lightAt` and the shader identical.

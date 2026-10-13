---
name: filter-library
description: Adding or changing a formvis filter. Use for a new filter in the Filter menu, a library filter's parameters, preview and apron, the Filter dialog, Last Filter and Fade, smart filters, the filter worker thread, Blur Gallery and Filter Gallery effects, Develop, and the apply_filter kinds that agents can call. Covers frontend/src/engine/filter-library.ts, filters-lib, filter-jobs.ts, filter-worker.ts and ui/panels/filter-panel.ts.
---

# filter-library

A library filter is a pure function from `ImageData` to `ImageData` with a declared set of parameters. The menu entry, the dialog, the preview, the worker, smart filters, actions and the MCP `apply_filter` tool all derive from that declaration.

## Where things are

| Path | Role |
| --- | --- |
| `frontend/src/engine/filter-library.ts` | `LIB_IDS` (the ids), `LibKind`, `LibGroup`, `LibFilter`, `LibParam`, `LIBRARY`, `libFilter`, `libDefaults`, `libValues`, `runLib`, `libApron`, `libMargin`, `libHasDialog`, `libInGroup` |
| `frontend/src/engine/filters-lib/` | One file per group: `blur.ts`, `sharpen.ts`, `noise.ts`, `other.ts`, `video.ts`, `distort.ts`, `pixelate.ts`, `stylize.ts`, `render.ts`, `drawn.ts`, `gallery.ts` (Blur Gallery), `filter-gallery.ts` and the `fx-*.ts` effect files; `shared.ts` holds `premul`, `unpremul`, `boxMean`, `exactGaussian`, `copyImage`, `luma` |
| `frontend/src/engine/filters.ts`, `filters-more.ts` | The core filters outside the library: Gaussian and Motion Blur, Add Noise, Unsharp Mask, Lens Correction, Lens Blur, Smart Sharpen, Shake Reduction |
| `frontend/src/engine/filter-jobs.ts`, `filter-worker.ts` | `runFilterOffThread(kind, settings, scale, seed, src, frame)` runs a filter in a Web Worker; `FilterKind`, `FilterJob`, `FilterResult` |
| `frontend/src/ui/panels/filter-panel.ts` | `FilterKind`, `FILTER_LABELS`, `defaultFilterSettings`, `runFilter`, the dialog with live preview, `applySettings`, `lastFilter`, `onApplied` |
| `frontend/src/ui/panels/controls.ts` | Row builders the dialog uses: `sliderRow`, `selectRow`, `checkRow`, `colorRow`, `matrixRow` |
| `frontend/src/app.ts` | Makes one `filter-[id]` command per `LIBRARY` entry and builds the Filter menu groups with `libInGroup` |
| `backend/app/routers/mcp.py` | `apply_filter` description and `kind` enum, and `frontend/src/automation/agent-bridge.ts` `apply_filter` case |

## Adding a library filter

1. Add the id to `LIB_IDS` in `filter-library.ts`.
2. Add a `LibFilter` object to the array exported by the group file in `filters-lib/` (for a new group also extend `LibGroup`, import the array in `filter-library.ts`, add it to the `LIBRARY` spread, and give `app.ts` a menu submenu). Fields: `id`, `label`, `group`, `params`, `grows` (the result can extend past the input), `reach(v, scale)` (how many pixels past the selection the filter reads; null if none), `run(src, v, ctx)`, optional `fills` (works on an empty layer), `width`, `ownPreview`, `note`, `invalid(v)` (a reason string).
3. Parameters are `LibParam` kinds: `range`, `select`, `check`, `matrix`, `seed`, `color`, `image`, `path`, `effects`. Each has a `key`, `label` and `def`. `libDefaults` and `libValues` clean stored values, so settings from older projects keep working: never rename a key.
4. `ctx.scale` is the preview scale; multiply radii by it so a scaled preview matches the full result. `ctx.seed` makes randomness repeatable. `ctx.fg` and `ctx.bg` are the foreground and background colours; `ctx.area`, `ctx.canvas` and `ctx.doc` give geometry for filters centred on the selection.
5. No parameters means no dialog: the command applies at once with defaults. With parameters, `libHasDialog` is true and the command opens the Filter dialog.
6. `run` must be pure and use only `ImageData`; it runs in the worker, so no DOM and no engine calls. Work premultiplied where edges matter (`premul`, `unpremul`).
7. Make `apply_filter` accept it: add the id to the `kind` enum and describe its settings in the `apply_filter` description in `backend/app/routers/mcp.py`, then run `./formvis agents sync`. A library filter given flat settings is wrapped as `{ lib: { [kind]: settings } }` by `applyFilter` in `app.ts`.
8. Log it in `frontend/HASHOUT_LOG.md`, update `.docs/wiki/Tools.md` if a menu changes, add a case to the sidecar `TEST_PLAN.md`. Existing coverage to run: `e2e/test_filters.py`, `test_blur_gallery.py`, `test_tiled_filter.py`.

## Facts that bite

- Filters need pixels: a text, shape or smart-object layer is rasterized first; the dialog and the MCP tool both say so.
- Deep documents: `deep.ts` has float versions of some filters (`blurDeep`, `motionBlurDeep`, `surfaceBlurDeep`, `unsharpDeep`, `noiseDeep`). A filter that changes pixels in a 16 bit, 32 bit, CMYK or Lab document without updating the float channels is rolled back by `Engine.edit` with a notice; test your filter in a 16 bit document before claiming it works there.
- Giant tiled layers filter tile by tile with an apron (`libApron`, `libMargin`); a wrong `reach` shows as seams.
- Smart filters re-run `runFilter` against the original source, so `run` has to give identical output for identical settings and seed.
- Filter Gallery stacks effects (`effects` param); each effect has its own value table under `fx-*.ts` and a key set that the MCP description lists, so keep the two in step.
- Radii in dialogs are document pixels; the dialog scales them for the preview only.

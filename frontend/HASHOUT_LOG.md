# frontend HASHOUT_LOG

Living log for the frontend side, _v0.1.0. Read the map and the TOC first; entries are anchored by file and symbol, and removed code is quoted in full.

## Live corner radii, custom shapes, option rows that follow state · _v0.94.0 (src/engine/custom-shapes.ts and src/ui/panels/corners-dialog.ts new, src/engine/index.ts, src/engine/shape-paths.ts, src/extensions/registry.ts, src/extensions/tools/shape.ts, src/io/psd.ts, src/ui/options.ts, src/app.ts; tests/corners.test.ts, tests/custom-shapes.test.ts, e2e/test_corner_radii.py and e2e/test_custom_shapes.py new)

In the engine, `cornerRadiiOf`, `setShapeCorners`, four radii in `shapeRaster` and in Image Size; `CUSTOM_SHAPES` re-exported and custom shape layers named after their shape. `custom-shapes.ts`: `CUSTOM_SHAPES`, `parseShape`, `customShapePath`, `windingArea`. `shape-paths.ts`: the `custom` kind and option. `OptionSpec` takes `when`; `options.ts` shows or hides such rows in place. The Shape tool lists every row with a `when`, previews every outline with its curves. `psd.ts` writes holes as subtract and reads subtract as holes. `app.ts`: the Corner Radii dialog, command and menu entries. Removed:

```ts
    { label: 'Layer', items: ['new-layer', 'new-folder', 'new-artboard', 'artboard-from-layers', 'artboard-options', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', '-', 'distribute-left', 'distribute-hcenter', 'distribute-right', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', 'distribute-hspace', 'distribute-vspace', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
    const name = { polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart' }[kind];
        const shape = l.shape ? { ...l.shape, cornerRadius: (Number(l.shape.cornerRadius) || 0) * Math.min(sx, sy) } : null;
    else c.roundRect(0, 0, r.width, r.height, Math.min(Number(style.cornerRadius) || 0, r.width / 2, r.height / 2));
export type PathShapeKind = 'polygon' | 'star' | 'line' | 'arrow' | 'heart';
export interface PathShapeOptions { sides: number; starInset: number; weight: number; headLength: number; headWidth: number }
export const DEFAULT_PATH_SHAPE: PathShapeOptions = { sides: 5, starInset: 50, weight: 4, headLength: 24, headWidth: 24 };
/** The closed path for a boxed shape (polygon, star, heart) fitted to `box`. */
export function boxedShapePath(kind: 'polygon' | 'star' | 'heart', box: Rect, o: PathShapeOptions): VectorPath {
export type OptionSpec =
  | { kind: 'button'; label: string; icon?: string; run: () => void };
import { hexOf, type Pt } from '../../engine';
const NOUN: Record<string, string> = { rectangle: 'a rectangle', ellipse: 'an ellipse', polygon: 'a polygon', star: 'a star', heart: 'a heart', line: 'a line', arrow: 'an arrow' };
const KINDS = ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'heart'] as const;
      const path = lineLike(s.kind) ? linePath(s.kind as 'line' | 'arrow', draft.anchor, snapped(draft), s) : boxedShapePath(s.kind as 'polygon' | 'star' | 'heart', r, s);
      dashed(ctx, g, () => { const pts = path.subpaths[0].anchors.map((a) => v.toScreen(a)); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); });
      ...(s.kind === 'rectangle' ? [{ kind: 'range' as const, label: 'Corner radius', min: 0, max: 500, unit: 'px', get: () => s.cornerRadius, set: (v: number) => set({ cornerRadius: v }) }] : []),
      ...(s.kind === 'polygon' || s.kind === 'star' ? [{ kind: 'range' as const, label: s.kind === 'star' ? 'Points' : 'Sides', min: 3, max: 100, get: () => s.sides, set: (v: number) => set({ sides: Math.round(v) }) }] : []),
      ...(s.kind === 'star' ? [{ kind: 'range' as const, label: 'Indent', min: 1, max: 99, unit: '%', get: () => s.starInset, set: (v: number) => set({ starInset: v }) }] : []),
      ...(lineLike(s.kind) ? [{ kind: 'range' as const, label: 'Weight', min: 1, max: 1000, unit: 'px', get: () => s.weight, set: (v: number) => set({ weight: v }) }] : []),
      ...(s.kind === 'arrow' ? [{ kind: 'range' as const, label: 'Head length', min: 1, max: 1000, unit: 'px', get: () => s.headLength, set: (v: number) => set({ headLength: v }) }, { kind: 'range' as const, label: 'Head width', min: 1, max: 1000, unit: 'px', get: () => s.headWidth, set: (v: number) => set({ headWidth: v }) }] : []),
        if (vm.paths.some((bp) => bp.operation && bp.operation !== 'combine')) notes.push(`"${name}" combines shapes in ways sonny does not; its outline may differ once edited.`);
        out.vectorMask = { paths: v.path.subpaths.filter((sp) => sp.anchors.length).map((sp) => ({
          open: !sp.closed, operation: 'combine' as const, fillRule: 'non-zero' as const,
```

## Artboards · _v0.93.0 (src/ui/panels/artboard-dialog.ts new, src/engine/types.ts, src/engine/renderer.ts, src/engine/index.ts, src/io/project-io.ts, src/app.ts; tests/artboard.test.ts and e2e/test_artboards.py new)

`types.ts`: `Artboard`, `artboardFromData`, `Layer.artboard`. `renderer.ts`: `whitePixel`; `folderMasks` clips to an artboard's rectangle; the render loop's `backdrop` draws backgrounds. In the engine, `artboards`, `newArtboard`, `artboardFromLayers`, `setArtboard`, `artboardImage`; artboard rectangles follow the group transform, `resizeCanvas`, `resampleImage` and `flipCanvas`. `project-io.ts` saves and reads them. `app.ts`: the dialog, four commands, menu entries and `exportArtboards`. Removed:

```ts
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-as', 'export-png', 'export-jpg', 'export-psd', 'export-psb', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', '-', 'distribute-left', 'distribute-hcenter', 'distribute-right', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', 'distribute-hspace', 'distribute-vspace', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
      if (layer.isGroup || !entry.visible) continue;
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData } from './types';
      let layers: Layer[] = p.doc.layers.map((l) => ({ ...l, transform: shift(l.transform), mask: l.mask?.placement ? { ...l.mask, placement: shift(l.mask.placement) } : l.mask }));
        return { ...l, raster, mask, shape, transform: t };
```

## Colour profiles on export · _v0.92.0 (src/engine/icc.ts and src/io/embed-icc.ts new, src/app.ts, src/io/api.ts, src/io/export-presets.ts, src/ui/panels/export-dialog.ts; tests/icc.test.ts and e2e/test_colour_profiles.py new)

`icc.ts`: `SPACES`, `SpaceId`, `toXyz`, `convertPixels`, `iccProfile`. `embed-icc.ts`: `embedPng` (iCCP after IHDR, conflicting chunks dropped) and `embedJpeg` (APP2 after APP0, existing ICC_PROFILE segments removed). `ExportSettings.profile`, checked by `clampSettings` and kept with presets; the dialog's Colour profile row and PDF note; `exportAs` converts and embeds; `api.encode` sends an optional profile. Removed:

```ts
        const blob = ENGINE_FORMATS.has(s.format) ? await api.encode(await toBlob(c), s.format as 'avif' | 'tiff' | 'pdf', s.quality, p.doc.resolution ?? 72)
          : await toBlob(c, s.format === 'png' ? 'image/png' : s.format === 'jpg' ? 'image/jpeg' : 'image/webp', s.quality / 100);
  async encode(png: Blob, format: 'tiff' | 'pdf' | 'webp' | 'avif', quality = 90, dpi = 72): Promise<Blob> {
    return (await request('/io/encode', { method: 'POST', body: form({ format, quality: String(quality), dpi: String(dpi) }, [{ name: 'image.png', blob: png }], 'file') })).blob();
export interface ExportSettings { format: ExportFormat; quality: number; scale: number }
    const s = clampSettings({ format: o.format as ExportFormat, quality: Number(o.quality), scale: Number(o.scale) });
    this.body.append(this.presetRow.el, this.formatRow.el, this.qualityRow.el, this.scaleRow.el, this.sizeNote, manage);
    try { localStorage.setItem(KEY, JSON.stringify(this.saved.map(({ id, name, format, quality, scale }) => ({ id, name, format, quality, scale })))); } catch { toast('Presets cannot be saved in this browser.', 'error'); }
    if (doc) { const z = exportSize(doc.width, doc.height, s.scale); setText(this.sizeNote, `${z.w} x ${z.h} px · ${exportName(this.engine.current?.name ?? 'Untitled', s)}`); }
```

## Adjustment layers in PSD and PSB; Export PSB · _v0.91.0 (src/io/psd-adjust.ts new, src/io/psd.ts, src/io/images.ts, src/app.ts, .github/workflows/ci.yml; tests/psd-adjust.test.ts and e2e/test_psd_adjustments.py new)

`psd-adjust.ts`: `toPsdAdjustment` and `fromPsdAdjustment` for fifteen kinds. `psd.ts`: `maskOnto` (the writer's mask code as a helper), adjustment layers written with masks, opacity, blend, visibility and clipping, and read back as live ones; `writePsdFile` takes `psb`; `.psb` recognised. `app.ts`: `exportPsd(psb)` and the `export-psb` command in the File menu. CI installs psd-tools for the independent check. Removed:

```ts
  async function exportPsd(): Promise<void> {
        const { bytes, notes } = await writePsdFile(p.doc, flat);
        await deliver(new Blob([bytes], { type: 'image/vnd.adobe.photoshop' }), `${p.name}.psd`);
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-as', 'export-png', 'export-jpg', 'export-psd', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
export const PROJECT_ACCEPT = '.sny,.sonny,.ref,.zip,.psd';
export const isProjectFile = (f: File): boolean => /\.(sny|sonny|ref|zip|psd)$/i.test(f.name);
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt, defaultEffects, patternById, addPattern, projectPatterns, createSurface, ctxOf, type LayerEffects, renderText, textKey, TEXT_FONTS, type TextSpec,
export const isPsdFile = (f: File): boolean => /\.psd$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';
      if (!pl.canvas || !pl.canvas.width || !pl.canvas.height) {
        if (pl.adjustment) notes.push(`"${name}" is an adjustment layer; sonny left it out.`);
        continue;
      }
      const w = pl.canvas.width, h = pl.canvas.height, raster = Raster.from(pl.canvas, w, h);
      const layer = newLayer(name, doc, { raster, parentId, transform: { ...docTransform(w, h), x: pl.left ?? 0, y: pl.top ?? 0 }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend });
      if (tx && typeof tx.text === 'string') {
export async function writePsdFile(doc: Doc, composite: Surface): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
    if (l.adjustment) { notes.push(`"${l.name}" is an adjustment layer; it is left out of the PSD.`); return null; }
    const mk = l.mask;
    if (mk?.raster) {
      const mp = placed(mk.raster, mk.placement ?? l.transform);
      if (mp) {
        const g = mp.c.getContext('2d') as CanvasRenderingContext2D, img = g.getImageData(0, 0, mp.c.width, mp.c.height);
        for (let i = 0; i < img.data.length; i += 4) { const a = img.data[i + 3]; img.data[i] = img.data[i + 1] = img.data[i + 2] = a; img.data[i + 3] = 255; }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.putImageData(img, 0, 0);
        out.mask = { canvas: mp.c, left: mp.x, top: mp.y, defaultColor: maskEdgeTone(mk.raster), disabled: !mk.enabled };
      }
    }
  return { bytes: writePsd(psd, { generateThumbnail: false }), notes };
```

In `.github/workflows/ci.yml`. Removed:

```yaml
      - run: pip install pytest playwright
```

## .abr brush import, live option lists, .sny projects · _v0.90.0 (src/engine/abr.ts and src/io/brush-library.ts new, src/engine/stroke.ts, src/engine/brush-dynamics.ts, src/engine/index.ts, src/extensions/registry.ts, src/ui/options.ts, src/extensions/tools/brush.ts, src/extensions/tools/gradient.ts, src/io/images.ts, src/app.ts; tests/abr.test.ts, e2e/test_abr_import.py and e2e/test_sny_projects.py new)

`abr.ts`: `parseAbr` for versions 1, 2 and 6 to 10, `SampledTip`, `AbrBrush`. `stroke.ts`: `sampledTip`, a tip in the style, `tipAspect`, spacing a quarter of a sampled tip. `brush-dynamics.ts`: `tip` on presets, `importedBrushPresets`, `setImportedBrushPresets`, `allBrushPresets`, `presetFromTip`. In the engine, `tip` on brush settings (kept by `setBrush`, set by presets) and `uiHooks.importBrushes`. `brush-library.ts`: IndexedDB keeping and `importAbr`. The select option spec takes a `live` list, patched in place by the options bar; the Brush Preset and Gradient Colors lists use it. Projects download as `.sny`; `.sny` and `.sonny` are accepted. Removed:

```ts
        await deliver(await api.package(manifest, files), `${p.name}.sonny`);
export interface BrushPreset { id: string; name: string; description: string; diameter: number; hardness: number; opacity: number; dynamics: BrushDynamics }
export interface BrushSettings { diameter: number; hardness: number; opacity: number }
    this.setBrush({ diameter: preset.diameter, hardness: preset.hardness, opacity: preset.opacity });
  uiHooks: { gradientEditor?: () => void } = {};
export interface StrokeStyle { diameter: number; hardness: number; opacity: number; color: RGB }
    // Dabs every 1.5% of the diameter for a hard tip and 2.5% for a soft one.
    this.spacing = Math.max(0.5, style.diameter * (style.hardness >= 0.99 ? 0.015 : 0.025));
    this.tip = brushTip(style.diameter * matScale(this.toLocal), style.hardness, style.color);
    this.paintCtx.drawImage(this.tip, p.x - r, p.y - r, r * 2, r * 2);
  | { kind: 'select'; label: string; choices: ReadonlyArray<{ id: string; label: string }>; get: () => string; set: (id: string) => void }
import { BUILTIN_BRUSH_PRESETS, identityOption, pressureOption } from '../../engine/brush-dynamics';
    { kind: 'select', label: 'Preset', choices: [{ id: '', label: 'Custom' }, ...BUILTIN_BRUSH_PRESETS.map((b) => ({ id: b.id, label: b.name }))], get: () => e.brushPresetId ?? '', set: (id) => { const b = BUILTIN_BRUSH_PRESETS.find((x) => x.id === id); if (b) e.applyBrushPreset(b); else { e.brushPresetId = null; e.emit('options', null); } } },
      { kind: 'select', label: 'Colors', choices: allGradients().map((p) => ({ id: p.id, label: p.label })), get: () => e.gradientSettings.style, set: (v) => set(() => { e.gradientSettings.style = v; }) },
export const PROJECT_ACCEPT = '.sonny,.ref,.zip,.psd';
export const isProjectFile = (f: File): boolean => /\.(sonny|ref|zip|psd)$/i.test(f.name);
        sync.push(() => { const v = spec.get(); if (box.value !== v) box.value = v; });
```

In `src-tauri/tauri.conf.json` the association takes `.sny` beside `.sonny`. Removed:

```json
      { "ext": ["sonny"], "name": "sonny Project", "description": "sonny layered image project", "role": "Editor", "mimeType": "application/x-sonny" },
```

## Shake Reduction · _v0.89.0 (src/engine/shake.ts new, src/engine/filters-more.ts, src/engine/filter-jobs.ts, src/engine/filter-worker.ts, src/ui/panels/filter-panel.ts, src/app.ts; tests/shake.test.ts and e2e/test_shake_reduction.py new)

`shake.ts`: `estimateShake` (angle by the along-to-across derivative ratio, length by the derivative's autocorrelation dip) with `ShakeTrace`. `filters-more.ts`: `ShakeSettings`, `shakeMargin` and `shakeReduce` (Smart Sharpen's motion deconvolution). The job types, the worker and the filter panel (kind, label, defaults, runner, margin, a section with an Estimate button and a note, estimating on open) take the new kind; `app.ts` lists it after Smart Sharpen. Removed:

```ts
  const FILTERS: FilterKind[] = ['develop', 'gaussianBlur', 'lensBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'smartSharpen', 'unsharpMask'];
import type { SmartSharpenSettings } from './filters-more';
export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState; lensRadius: number; lensBrightness: number; lensThreshold: number; smart: SmartSharpenSettings }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen';
import { lensBlur, smartSharpen } from './filters-more';
import { lensBlur, lensBlurMargin, smartSharpen, smartSharpenMargin, type SharpenRemove } from '../../engine/filters-more';
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop', lensBlur: 'Lens Blur', smartSharpen: 'Smart Sharpen' };
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : kind === 'lensBlur' ? lensBlurMargin(s.lensRadius) : kind === 'smartSharpen' ? smartSharpenMargin(s.smart) : 0;
```

## Remove tool and Remove Wires and Cables · _v0.88.0 (src/engine/distractions.ts and src/extensions/tools/remove.ts new, src/engine/index.ts, src/engine/types.ts, src/extensions/tools/index.ts, src/ui/stage.ts, src/app.ts; tests/distractions.test.ts and e2e/test_remove_tool.py new)

`distractions.ts`: `findWires` (black-hat, threshold, long thin pieces, grown) with `WIRE_DEFAULTS`. In the engine, the `remove` stroke kind, `removePatch` (content-aware fill of the grown stroke) and `removeWires` (Create Texture fill of the found wires, within the selection); Remove warms stroke surfaces. `types.ts` adds the `remove` tool id; the tool registers after Spot Healing; the stage allows right-drag sizing for it; `app.ts` adds `remove-wires` to the Edit menu. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill-workspace', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', 'transform-warp', 'puppet-warp', '-', 'settings'] },
const PAINT_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['brush', 'cloneStamp', 'healingBrush', 'spotHealing']);
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode; healFrom?: Pt } | null = null;
    const patch = st.heal ? this.healPatch(st.s, st.heal) : st.healFrom ? this.healFromPatch(st.s, st.healFrom) : st.s.commit();
  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge', pt: Pt, shift: boolean): boolean {
    p.history.begin({ heal: 'Spot Healing', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge' }[kind], p.snapshot());
    const style = kind === 'heal' ? { ...this.brush, opacity: 0.45, color: white } : { ...this.brush, color: white };
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s, heal: kind === 'heal' ? this.retouch.healMode : undefined, healFrom };
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'idle';
  for (const tool of [moveTool, marqueeTool, lassoTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, directSelectTool, penTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
  private static readonly brushTools = new Set(['brush', 'spotHealing', 'cloneStamp', 'smear']);
```

## Layer style depth: contours, Global Light, stroke positions, several instances · _v0.87.0 (src/engine/style-extras.ts new, src/engine/types.ts, src/engine/renderer.ts, src/engine/index.ts, src/io/project-io.ts, src/ui/panels/layer-style-dialog.ts; tests/style-extras.test.ts, tests/effect-instances.test.ts, e2e/test_layer_style_depth.py and e2e/test_effect_instances.py new)

`style-extras.ts`: `CONTOURS`, `contourLut`, `applyContour`, `isContour`, `GlobalLight`, `DEFAULT_GLOBAL_LIGHT`, `withGlobalLight`. `types.ts`: contour, `useGlobal` and `position` fields; `Doc.globalLight`; `EffectExtras`, `MULTI_EFFECTS`, `MAX_EXTRA`, `instances`; `effectsActive` and `effectsFromData` extended. `renderer.ts`: Global Light resolved where effects are read; `contoured`; Inside and Center strokes above; every instance drawn; `fxReach`. In the engine, `setGlobalLight` and `applyStyleAndLight`. `project-io.ts` saves the light. The dialog: the light at the top, contours, Use Global Light, Position, Instances rows, `assembled` and `previewFx`. Removed:

```ts
import { canvasBlend, compositeOp, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform, effectsActive, type LayerEffects, type RGB, type Rect } from './types';
      const fx = ov && 'effects' in ov ? ov.effects ?? null : layer.effects ?? null, styled = effectsActive(fx);
    const reach = Math.max(fx.bevel.enabled ? (fx.bevel.size + fx.bevel.soften) * 2 : 0, d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) + 4;
    const reach = Math.max(bv.enabled ? (bv.size + bv.soften) * 2 : 0, d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) * scale + 2;
      const go = fx.gradientOverlay;
      if (go.enabled && go.opacity > 0) {
      if (co.enabled && co.opacity > 0) lay(kept((c) => { c.fillStyle = css(co.color); c.fillRect(0, 0, bw, bh); }), co.opacity * opacity, compositeOp(co.blend));
      if (ig.enabled && ig.opacity > 0 && ig.size > 0) lay(castByInverse(ig.color, ig.size * scale, 0, 0), ig.opacity * opacity, compositeOp(ig.blend));
      if (is.enabled && is.opacity > 0) {
        lay(castByInverse(is.color, is.size * scale, -Math.cos(rad) * is.distance * scale, Math.sin(rad) * is.distance * scale), is.opacity * opacity, compositeOp(is.blend));
    if (d.enabled && d.opacity > 0) {
      lay(shadowOf(d.color, d.size * scale, -Math.cos(rad) * d.distance * scale, Math.sin(rad) * d.distance * scale), d.opacity * opacity, compositeOp(d.blend));
    if (g.enabled && g.opacity > 0 && g.size > 0) lay(shadowOf(g.color, g.size * scale, 0, 0), g.opacity * opacity, compositeOp(g.blend));
    if (k.enabled && k.opacity > 0 && k.size * scale > 0) {
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[] }
export interface DropShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number }
export interface OuterGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number }
export interface StrokeEffect { enabled: boolean; color: RGB; opacity: number; size: number }
export interface InnerShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number }
export interface InnerGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number }
export interface BevelEffect { enabled: boolean; style: 'inner' | 'outer' | 'emboss' | 'pillow'; depth: number; down: boolean; size: number; soften: number; angle: number; altitude: number; highlight: RGB; highlightOpacity: number; highlightBlend: BlendMode; shadow: RGB; shadowOpacity: number; shadowBlend: BlendMode }
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect; satin: SatinEffect; patternOverlay: PatternOverlayEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled || fx.bevel.enabled || fx.satin.enabled || fx.patternOverlay.enabled);
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}) };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(guides.length ? { guides } : {}) }, activeId: str(manifest.activeLayerID) };
import { defaultEffects, effectsActive, type Engine, type LayerEffects, type RGB, allPatterns } from '../../engine';
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow, Satin, Color Overlay, Gradient Overlay, Pattern Overlay and Bevel & Emboss for the
 *  active pixel layer, shown live while the dialog is open. OK applies them as one undo step; Cancel leaves the layer as it was. */
    check('Stroke (outside)', () => fx().stroke.enabled, (v) => { fx().stroke.enabled = v; });
    this.engine.previewLayerEffects(layer.id, this.fx);
    if (this.layerId) this.engine.previewLayerEffects(this.layerId, this.fx);
    const id = this.layerId, fx = effectsActive(this.fx) ? structuredClone(this.fx) : null;
    if (id) { this.engine.setLayerEffects(id, fx); this.onApplied?.(fx ? structuredClone(fx) : null); }
```

## Replace Contents, smart filter masks, linked smart objects · _v0.86.0 (src/engine/types.ts, src/engine/index.ts, src/io/project-io.ts, src/app.ts; src/io/links.ts new; e2e/test_smart_objects_more.py and e2e/test_linked_smart_objects.py new)

`types.ts`: `SmartLink`, and `SmartObject` gains `filterMask`, `filterMaskEnabled` and `link`. In the engine, `maskFilters` blends filtered and unfiltered renders through the mask in `renderSmart` and `renderSmartAsync`; `restackSoon` and `restack` take a mask change and an `extra` patch and keep every smart object field through re-renders; `replaceContents`, `addSmartFilterMask`, `deleteSmartFilterMask`, `toggleSmartFilterMask`, `placeLinked`, `updateLinkedContents` and `embedLinked`; Distort renders with the mask. `project-io.ts` saves the mask image and the link and reads them back checked; `.ref` drops the mask with the source. `links.ts`: sources (file handles kept in IndexedDB, or a one-time pick), `registerLinkSource`, `pickLinkSource`, `placeLinked`, `updateLinked`, `relink`. `app.ts`: the Replace Contents input, `pickOnce`, eight commands on the File and Layer menus and the context menu. Removed:

```ts
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-as', 'export-png', 'export-jpg', 'export-psd', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', '-', 'distribute-left', 'distribute-hcenter', 'distribute-right', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', 'distribute-hspace', 'distribute-vspace', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle, effectsFromData } from './types';
  private renderSmart(source: Raster, filters: SmartFilter[]): Raster {
  private async renderSmartAsync(source: Raster, filters: SmartFilter[]): Promise<Raster> {
  private restackSoon(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string): boolean {
      return this.restack(p, id, source, stack, name);
      const rendered = await this.renderSmartAsync(src, stack);
      this.restack(p, id, source, stack, name, rendered);
  private restack(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, rendered: Raster | null = null): boolean {
      const stack = structuredClone(filters ?? l.smart.filters), raster = rendered ?? this.renderSmart(src, stack), old = l.raster as Raster, t = l.transform;
        p.updateLayer(id, { smart: { source: src, filters: stack, warp, warpAt: w.t }, raster: w.raster, transform: w.t, mask });
      p.updateLayer(id, { smart: { source: src, filters: stack }, raster, transform: { ...t, x: cx - w / 2, y: cy - h / 2, w, h }, mask });
      const R = warp ? this.renderSmart(l.smart.source, l.smart.filters) : l.raster, rt = warp ? docTransform(R.width, R.height) : l.transform;
export interface SmartObject { source: Raster; filters: SmartFilter[]; warp?: Pt[] | null; warpAt?: Transform | null }
      r.smart = { filters: l.smart.filters.map(({ id, kind, settings, enabled }) => ({ id, kind, settings, enabled })), warp: l.smart.warp ?? null, warpAt: l.smart.warpAt ? transformRecord(l.smart.warpAt) : null };
  for (const r of records) { for (const n of [str(r.imageFile), str(r.maskFile), str(r.smartSourceFile)]) if (n) names.add(n); }
    const smart = raster && sourceImage ? { source: Raster.from(sourceImage, sourceImage.width, sourceImage.height), filters: smartFiltersFrom(r.smart), warp: warpPts, warpAt: warpPts && sw.warpAt ? transformFrom(sw.warpAt, raster.width, raster.height) : null } : null;
```

## Gradient Editor, noise gradients, History fill · _v0.85.0 (src/engine/gradients.ts, src/engine/history.ts, src/engine/index.ts, src/extensions/tools/gradient.ts, src/ui/panels/fill-dialog.ts, src/styles/dialogs.css, src/app.ts; src/ui/panels/gradient-editor.ts new; tests/gradient-editor.test.ts and e2e/test_history_fill_gradient_editor.py new)

`gradients.ts`: `customGradients`, `setCustomGradients`, `allGradients`, `gradientsFromJson` and `noiseStops`; `presetById` looks in saved gradients first. `history.ts`: `origin()`. In the engine, `uiHooks`, `historySource` and a History branch in `fillWith`. `gradient-editor.ts` is the editor with `loadSavedGradients`; the Gradient tool lists every gradient and has Edit; the Fill dialog has History; `dialogs.css` styles the bar and strip; `app.ts` registers the editor, loads saved gradients and sets the hook. Removed:

```ts
export const presetById = (id: string): GradientPreset => GRADIENT_PRESETS.find((p) => p.id === id) ?? GRADIENT_PRESETS[0];
  fillWith(contents: { color: RGB } | { patternId: ID }, blend: BlendMode, opacity: number, preserveTransparency: boolean): void {
      if (pat) { const cp = sc.createPattern(pat.surface, 'repeat'); if (cp) { cp.setTransform(new DOMMatrix().translate(-rect.x, -rect.y)); sc.fillStyle = cp; } }
      else if ('color' in contents) sc.fillStyle = rgbCss(contents.color);
      sc.fillRect(0, 0, rect.w, rect.h);
import { GRADIENT_PRESETS, GRADIENT_TYPES, type GradientType } from '../../engine/gradients';
      { kind: 'select', label: 'Colors', choices: GRADIENT_PRESETS.map((p) => ({ id: p.id, label: p.label })), get: () => e.gradientSettings.style, set: (v) => set(() => { e.gradientSettings.style = v; }) },
type Contents = 'fg' | 'bg' | 'color' | 'black' | 'gray' | 'white' | 'pattern' | 'contentAware';
  ['fg', 'Foreground Color'], ['bg', 'Background Color'], ['color', 'Color...'], ['contentAware', 'Content-Aware'], ['pattern', 'Pattern'], ['black', 'Black'], ['gray', '50% Gray'], ['white', 'White'],
    e.fillWith(color ? { color: { ...color } } : { patternId: this.patternId }, this.blend, this.opacity / 100, this.preserve);
```

## Content-Aware Fill workspace · _v0.84.0 (src/engine/retouch.ts, src/engine/index.ts, src/styles/dialogs.css, src/app.ts; src/ui/panels/content-fill-dialog.ts new; tests/content-fill-sampling.test.ts and e2e/test_content_fill_workspace.py new)

`contentFill` takes an optional sampling mask: sources must lie wholly inside it (a second summed-area table) and the region grows to include it; without one it is unchanged. `Engine.contentAwareFillWith` maps a document-space sampling area into the layer's pixels and outputs to the current layer, a new layer of only the filled pixels (upright, unscaled layers; others go to a duplicate) or a duplicate, as one step. `content-fill-dialog.ts` is the workspace (Auto, Rectangular or painted Custom sampling, Show Result, Output To). `dialogs.css` adds `.cv-fill-canvas` to the shared preview rule. `app.ts` adds `content-fill-workspace` and relabels the one-click fill Quick Content-Aware Fill. Removed:

```ts
    { id: 'content-fill', label: 'Content-Aware Fill', keys: ['Shift+Backspace'], enabled: () => pixel() && selected(), run: () => { void engine.task(async () => { await new Promise((r) => requestAnimationFrame(() => window.setTimeout(r, 0))); engine.contentAwareFill(); }); } },
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', 'transform-warp', 'puppet-warp', '-', 'settings'] },
export function contentFill(px: Uint8ClampedArray, mask: Uint8Array, w: number, h: number): boolean {
  const rx0 = Math.max(0, x0 - margin), ry0 = Math.max(0, y0 - margin);
  const rw = Math.min(w - 1, x1 + margin) - rx0 + 1, rh = Math.min(h - 1, y1 + margin) - ry0 + 1, rn = rw * rh;
  for (let cy = half; cy < rh - half; cy++) for (let cx = half; cx < rw - half; cx++) if (!holeIn(cx - half, cy - half, cx + half, cy + half)) sources.push(cy * rw + cx);
```

```css
.cv-liquify-canvas, .cv-mask-canvas { display: block; width: 640px; max-width: 100%; aspect-ratio: 640 / 440; height: auto; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: crosshair; touch-action: none; }
```

## Select and Mask · _v0.83.0 (src/engine/select-mask.ts and src/ui/panels/select-mask-dialog.ts new, src/engine/index.ts, src/styles/dialogs.css, src/app.ts; tests/select-mask.test.ts and e2e/test_select_mask.py new)

`select-mask.ts`: `RefineSettings`, `DEFAULT_REFINE` and `refineSelection`, running Radius, Smooth, Feather, Contrast and Shift Edge in Photoshop's order, each `refineMatte` call in advanced mode doing one thing. `select-mask-dialog.ts`: the workspace (fixed preview under `.cv-mask-canvas`, four view modes, five sliders, Output To). `Engine.applyRefinedSelection` sets the refined selection and runs the chosen output (selection, layer mask replacing any, Layer via Copy, or a duplicate with a mask and the original hidden) as one step. `dialogs.css` gives the new preview class the Liquify preview's style. `app.ts` adds `select-and-mask` (Alt+Mod+R) to the Select menu. Removed:

```ts
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', 'select-subject', 'select-object', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', 'feather', 'border', 'smooth', '-', 'path-selection', 'delete-path'] },
```

```css
.cv-liquify-canvas { display: block; width: 640px; max-width: 100%; aspect-ratio: 640 / 440; height: auto; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: crosshair; touch-action: none; }
```

## Crop straighten, Content-Aware edges, Perspective Crop; the status hint · _v0.82.0 (src/engine/index.ts, src/extensions/tools/crop.ts, src/styles/shell.css; tests/crop-straighten.test.ts, e2e/test_crop_straighten.py and e2e/test_perspective_crop.py new)

In the engine, `straightenCrop` (every layer turned about the frame's centre, the crop, and `fillOpenedEdges`, content-aware fill of what the bottom pixel layer no longer covers) and `perspectiveCrop` (the quad's inverse homography scaled to a rectangle, every pixel layer and linked mask warped through it). The Crop tool gains `angle`, `contentAware`, `leveling` with `levelAngle`, and `perspective` with `quad`, `cornerDrag`, `quadOf` and `hitCorner`; commit goes through the new engine methods; Escape and Cancel reset all of it; the overlay shows the level line, the tilted region to keep, and the quad. `shell.css`: the status hint fills the remaining space with its text right-aligned, so its box no longer moves as its text changes. Removed:

```ts
  e.cropTo(r);
    if (e.key === 'Enter' && frame) { commit(ctx.engine); return true; }
    if (e.key === 'Escape' && frame) { frame = null; drag = null; ctx.engine.emit('overlay', null); ctx.engine.emit('options', null); return true; }
    { kind: 'button', label: 'Cancel', icon: 'close', run: () => { frame = null; drag = null; e.emit('overlay', null); e.emit('options', null); } },
```

```css
.cv-st-hint { margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
```

## Puppet Warp · _v0.81.0 (src/engine/puppet.ts new, src/engine/index.ts, src/extensions/tools/move.ts, src/app.ts; tests/puppet.test.ts and e2e/test_puppet.py new)

`puppet.ts` is rigid moving least squares (Schaefer, McPhail and Warren, 2006), written for sonny: `mlsRigid` and `puppetImage` (the backward map on an 8 px grid, interpolated). In the engine, `puppetEdit` with `beginPuppetWarp`, `addPuppetPin`, `movePuppetPin`, `removePuppetPin`, `schedulePuppet`, `puppetRender`, `applyPuppetWarp`, `cancelPuppetWarp` and `dropPuppet`, and the preview in the layer overrides. The Move tool places, drags and Alt-removes pins (`pinDrag`, `puppetPin`), applies on Enter, cancels on Escape and draws the pins. `app.ts` adds `puppet-warp` to the Edit menu. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', 'transform-warp', '-', 'settings'] },
    if (ctx.engine.meshWarpEdit) return;
```

## Liquify workspace · _v0.80.0 (src/engine/liquify.ts and src/ui/panels/liquify-dialog.ts new, src/engine/index.ts, src/styles/dialogs.css, src/app.ts; tests/liquify.test.ts and e2e/test_liquify.py new)

`liquify.ts` ports NodeMode's displacement field (`studio/pixel/liquify.ts`: `makeField`, `fieldAt`, `pushField`; nodemode_dev v8.73.1, the owner's build, MIT) and adds `dabField` (Reconstruct, Twirl both ways, Pucker, Bloat), `resetField`, `fieldIsZero` and `liquifyImage`, which resamples from the original pixels at any scale. `liquify-dialog.ts` is the workspace: a fixed 640 x 440 preview, the six tools, size, pressure, Restore All, OK and Cancel; its member is `liq`, since the base `Dialog` already has a `field` method. `Engine.applyLiquify` resamples the layer through the field in one step. `dialogs.css` styles the preview and the active tool. `app.ts` adds `filter-liquify` (Shift+Mod+X) to the Filter menu. Removed:

```ts
    { label: 'Filter', items: [...FILTERS.map((k) => `filter-${k}`), '-', 'remove-bg', 'remove-bg-lite'] },
```

## Mesh warp and Edit > Warp · _v0.79.0 (src/engine/mesh-warp.ts new, src/engine/index.ts, src/extensions/tools/move.ts, src/app.ts; tests/mesh-warp.test.ts and e2e/test_warp.py new)

`mesh-warp.ts` is ported from NodeMode's sonny studio (`studio/pixel/transform.ts`, nodemode_dev v8.73.1, the owner's build, MIT): `convexQuad`, `invBilinear`, `meshSurfacePoint`, a private `invSmooth`, `meshWarpImage` (plain or smooth, on ImageData instead of a tile store) and `uniformGrid`. In the engine, `meshWarpEdit` with `beginMeshWarp`, `moveMeshWarpPoint` (folding moves ignored, preview once per frame), `meshWarped`, `applyMeshWarp` (one Warp step, trimmed), `cancelMeshWarp` and `dropMeshWarp`, and the pending warp's preview in the layer overrides. The Move tool drags control points (`warpDrag`, `warpPoint`), applies on Enter, cancels on Escape and draws the grid as the surface's curves. `app.ts` adds `transform-warp` to the Edit menu. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', '-', 'settings'] },
```

## Snapping to guides and the grid · _v0.78.0 (src/engine/index.ts; e2e/test_snapping.py new)

`snapMove` adds shown guides and the grid's nearest subdivision lines to its targets, and measures layers by `snapBox`: the visible pixels under a transform, the scan cached per raster version in `contentBoxes`, falling back to the whole bounds for an empty layer. Removed:

```ts
      const b = transformBounds(l.transform);
    const b = transformBounds(t);
```

## Rulers, guides and grid · _v0.77.0 (types, index, project-io, palette, stage, shell.css, app; guide-dialog new)

`Guide` and `Doc.guides` in `types.ts`; in the engine, `view`, `guideDraft`, `setView`, `addGuide`, `moveGuide`, `removeGuide`, `clearGuides` (each an undo step through `setGuides`) and `guideAt`; `project-io` writes guides when present and reads them defensively (on the canvas, at most 1000); the palette gains ruler colours from tokens; the stage draws the grid and guides under the tool overlay, draws the rulers (`renderRulers`, `rulerStep`), lets the Move tool drag guides and deletes those dropped on a ruler or off the view, and places guides dragged out of a ruler (`bindRuler`); `shell.css` lays the rulers over the stage on `--z-raised`; `app.ts` adds the ruler canvases, six View commands and the New Guide dialog. Removed:

```ts
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[] }
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle, effectsFromData } from './types';
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers }, activeId: str(manifest.activeLayerID) };
export interface StagePaint extends Paint { checkerA: string; checkerB: string; grid: string; edge: string }
    { label: 'View', items: ['zoom-in', 'zoom-out', 'fit', 'actual', '-', 'pixel-grid', 'transform-controls'] },
```

## Export As · _v0.76.0 (src/app.ts, src/styles/dialogs.css; src/io/export-presets.ts and src/ui/panels/export-dialog.ts new)

`export-presets.ts` holds the formats, built-in presets, `clampSettings`, `presetsFromStorage`, `exportName` and `exportSize`; `export-dialog.ts` is File > Export As, rows kept in place and preset options patched in place; `app.ts` adds `exportAs` (scale, JPEG on white, browser or engine encoding) and the `export-as` command on the File menu; `dialogs.css` adds `.cv-row-actions`. Removed:

```ts
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', 'export-psd', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
```

### src/app.ts · keydown and paste targets · _v0.75.0, logged late

The 0.75.0 fix (4b9497e) was made after that version's entry was written, so its removed lines are quoted here. Both handlers now narrow the target with `instanceof Element`. Removed (the same line in each handler):

```ts
    const target = e.target as HTMLElement | null;
```

## Export WebP, TIFF, PDF and AVIF · _v0.75.0 (src/app.ts, src/io/api.ts, src/engine/index.ts; e2e/test_export_formats.py new)

`api.encode` posts a PNG to `/io/encode`; `exportImage` takes WebP from the canvas and TIFF, PDF and AVIF through the engine (unavailable until capabilities arrive), naming TIFF `.tif`; four commands on the File menu; `exportBlob` accepts WebP. Removed:

```ts
  async function exportImage(kind: 'png' | 'jpg', quality = 0.92): Promise<void> {
        const blob = await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg', quality);
        if (blob) await deliver(blob, `${p.name}.${kind}`);
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', 'export-psd', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
  async exportBlob(type: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Blob | null> {
```

## Gradients and Edit > Fill · _v0.74.0 (one change across five files and two new ones, logged together)

### src/engine/gradients.ts · new

Five types, colour-stop presets (the two old choices keep their ids), `resolveStops`, `reflectStops`, `colorAt` and `diamondFill` (the L1 distance in the drag frame). Nothing was removed.

### src/ui/panels/fill-dialog.ts · new

Photoshop's Fill dialog; rows disabled in place, never hidden. Nothing was removed.

### tests/gradients.test.ts · new

Five unit tests for the gradient maths. Nothing was removed.

### src/engine/index.ts · gradientSettings, renderGradient, fillWith

`gradientSettings.shape` takes the five types and `style` a preset id; `renderGradient` draws from the preset's stops, Angle as a conic gradient, Reflected mirrored, Diamond per pixel; `fillWith` is Edit > Fill's work. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle, effectsFromData } from './types';
  gradientSettings: { shape: 'linear' | 'radial'; style: 'background' | 'transparent'; reversed: boolean; opacity: number } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1 };
    let c0 = rgbCss(fg, 1), c1 = st.style === 'background' ? rgbCss(bg, 1) : rgbCss(fg, 0);
    if (st.reversed) [c0, c1] = [c1, c0];
    const grad = st.shape === 'radial' ? lc.createRadialGradient(a.x, a.y, 0, a.x, a.y, len) : lc.createLinearGradient(a.x, a.y, len > 0.5 ? b.x : a.x + 0.5, b.y);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    lc.fillStyle = grad;
    lc.fillRect(bb.x - 1, bb.y - 1, bb.w + 2, bb.h + 2);
```

### src/extensions/tools/gradient.ts · types and presets

Removed:

```ts
      { kind: 'segment', label: 'Shape', choices: [{ id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }], get: () => e.gradientSettings.shape, set: (v) => set(() => { e.gradientSettings.shape = v as 'linear' | 'radial'; }) },
      { kind: 'segment', label: 'Colors', choices: [{ id: 'background', label: 'Foreground to Background' }, { id: 'transparent', label: 'Foreground to Transparent' }], get: () => e.gradientSettings.style, set: (v) => set(() => { e.gradientSettings.style = v as 'background' | 'transparent'; }) },
```

### src/app.ts · Edit > Fill

The dialog, the `fill-dialog` command (Shift+F5) and its Edit menu place. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', '-', 'settings'] },
```

## Pen pressure and brush presets · _v0.70.0 (one change across six files, logged together)

### src/engine/brush-dynamics.ts · new

Ported from NodeMode's sonny studio (`studio/paint/dynamics.ts` and `preset.ts`, nodemode_dev v8.73.1, the owner's build, MIT): `computeOption` with sampled curves, reversal, combine modes and strength; `identityOption`, `pressureOption`; five built-in presets trimmed to sonny's brush; `presetsFromJson` for stored presets. Nothing was removed.

### src/engine/stroke.ts · PixelStroke pressure

`dynamics` field; `to(p, pressure)` interpolates pressure between samples; `dab(p, pressure)` scales the tip's radius and the dab's alpha. Removed:

```ts
   *  the way, the distance since the last dab carried into the next move. */
  to(p: Pt): void {
    const from = this.last;
    if (!from) { this.dab(p); this.last = p; this.carry = 0; return; }
    for (; along <= length; along += this.spacing) this.dab({ x: from.x + (dx * along) / length, y: from.y + (dy * along) / length });
  private dab(p: Pt): void {
    const r = this.radius;
```

### src/engine/index.ts · beginStroke, strokeTo, brushDynamics, applyBrushPreset

Removed:

```ts
  beginStroke(pt: Pt, shift: boolean): boolean {
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p);
    s.to(pt);
  strokeTo(pt: Pt): void {
    st.s.to(pt);
```

### src/extensions/registry.ts, src/ui/stage.ts, src/extensions/tools/brush.ts · pressure input

`ToolPointer.pressure`, pens only (mouse and touch report 1); the Brush passes it on and gains Preset and pressure options. Removed:

```ts
export interface ToolPointer { doc: Pt; screen: Pt; button: number; shift: boolean; alt: boolean; mod: boolean; clicks: number }
    return { doc: v ? v.toDoc(screen.x, screen.y) : screen, screen, button: e.button, shift: e.shiftKey, alt: e.altKey, mod: isMac ? e.metaKey : e.ctrlKey, clicks };
  down(ctx, p) { if (p.button === 0) { hoverPt = p.doc; ctx.engine.beginStroke(p.doc, p.shift); } },
  move(ctx, p) { hoverPt = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
```

## src/engine/shape-paths.ts

### src/engine/shape-paths.ts · new · _v0.69.0

Ported from NodeMode's sonny studio, `studio/pixel/shapes.ts` (nodemode_dev v8.73.1, the owner's build, MIT): `ngonPoints`, `starPoints`, `arrowPoints` and `heartPoints`, moved from `[x, y]` tuples to `Pt` and from a tile-store scanline fill to closed corner-anchor `VectorPath`s through `boxedShapePath` (fitted to the dragged box) and `linePath` (a line is an arrow with no head). Nothing was removed.

### tests/shape-paths.test.ts · new · _v0.69.0

Six unit tests for the generators and the box fitting. Nothing was removed.

### src/engine/index.ts · createPathShape · _v0.69.0 (logged here beside the new module)

`shapeSettings` takes the path kinds and their options (`DEFAULT_PATH_SHAPE`); `createPathShape` inserts a foreground-filled vector layer named for the shape, as one step. Removed:

```ts
  shapeSettings: { kind: 'rectangle' | 'ellipse'; cornerRadius: number } = { kind: 'rectangle', cornerRadius: 0 };
```

## src/engine/filters-more.ts

### src/engine/filters-more.ts · new · _v0.68.0

`lensBlur` (a disc average in linear light through per-row prefix sums, highlights lifted above a threshold first), `smartSharpen` (unsharp mask for Gaussian removal; Richardson-Lucy, eight iterations, for lens and motion removal; noise gate; shadow and highlight fades; alpha kept), `sharpenSample` for the Sharpen brush, and their margins. Richardson-Lucy steepens edges but rings, so its total error against a sharp original stays about level; that is expected of the method. Nothing was removed.

### tests/filters-more.test.ts · new · _v0.68.0

Nine unit tests for the two filters and the brush sample. Nothing was removed.

## tests/

### tests/setup.ts, blend.test.ts, adjust-params.test.ts, history.test.ts, geometry-filters.test.ts · new · _v0.67.0

The unit suite, run by `npm test` (vitest in Node). `setup.ts` supplies a minimal `ImageData` and the `px` helper; the four test files cover the blend modes, the parametric adjustments, `History` and the geometry and mask helpers, 31 tests. Tests import engine modules directly and never touch a canvas, so they stay fast and need no browser. Nothing was removed.

## src/engine/adjust-params.ts

### src/engine/adjust-params.ts · new · _v0.66.0

Eleven adjustments declared as control lists with kernels: Brightness/Contrast, Vibrance, Color Balance, Black & White, Photo Filter, Channel Mixer, Invert, Posterize, Threshold, Selective Color and Develop. Values live in `data.params`, read back clamped by `paramValues`. Rows with a `group` are shown only when the kind's `groupBy` select holds that group. Black & White follows Photoshop's documented hue weighting; Selective Color and Photo Filter are standard approximations, named as such in the build notes. Nothing was removed.

## src/engine/blend.ts

### src/engine/blend.ts · new · _v0.66.0

The ten blend modes Canvas 2D lacks, composited per pixel by the W3C source-over formula; Dissolve on a document-fixed hash pattern. Nothing was removed.

## src/io/recovery.ts

### src/io/recovery.ts · new · _v0.66.0

The IndexedDB store for crash-recovery copies (`sonny-recovery`, store `docs`, keyed by project id). Every call resolves, to null or an empty list when storage is unavailable, so recovery can never break editing. Nothing was removed.

## src/ui/errors.ts

### src/ui/errors.ts · new · _v0.66.0

The global error log: window `error` and `unhandledrejection` become entries and at most one notice every four seconds; `text()` joins them with the engine's rolled-back failures for Help > Copy Error Log. Nothing was removed.

## src/extensions/tools/quick-select.ts

### src/extensions/tools/quick-select.ts · new · _v0.65.0

The Quick Selection tool. Nothing was removed.

## src/ui/panels/color-range-dialog.ts

### src/ui/panels/color-range-dialog.ts · new · _v0.65.0

The Color Range dialog with canvas sampling and a fixed-size preview. Nothing was removed.

## src/extensions/tools/tone.ts

### src/extensions/tools/tone.ts · new · _v0.64.0

The Dodge, Burn and Sponge tools. Nothing was removed.

## src/extensions/tools/bucket.ts

### src/extensions/tools/bucket.ts · new · _v0.64.0

The Paint Bucket tool. Nothing was removed.

## io/psd.ts

### io/psd.ts · layer styles · _v0.62.0

Layer styles written as Photoshop layer effects and read back, patterns carried. Removed:

```ts
import type { BlendMode as PsdBlend, Layer as PsdLayer, LinkedFile, Psd } from 'ag-psd';
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt,
      if (pl.effects) notes.push(`"${name}" has a Photoshop layer style; it opened without it.`);
  const notes: string[] = [], linked: LinkedFile[] = [], sources = new Map<ID, Uint8Array>();
    if (effectsActive(l.effects)) notes.push(`"${l.name}" loses its layer style; the PSD holds its pixels only.`);
```

## src/engine/patterns.ts

### src/engine/patterns.ts · new · _v0.61.0

The pattern registry with its built-in patterns. Nothing was removed.

## src/ui/panels/trim-dialog.ts

### src/ui/panels/trim-dialog.ts · new · _v0.58.0

The Trim dialog. Nothing was removed.

## src/ui/history.ts

### src/ui/history.ts · new · _v0.56.0

The History panel. Nothing was removed.

### src/ui/history.ts · snapshots · _v0.57.0

Snapshot rows above the steps and the New and Delete Snapshot footer. Removed:

```ts
type Row = { key: string; name: string; index: number };
      `<div class="cv-history-body" hidden><div class="cv-history-list" role="listbox" aria-label="History"></div></div></section>`);
      if (row) this.engine.jumpHistory(Number(row.dataset.index));
    const list: Row[] = p ? [{ key: 'start', name: p.name, index: 0 }, ...names.map((name, i) => ({ key: `${i}:${name}`, name, index: i + 1 }))] : [];
        const row = el(`<div class="cv-history-row" role="option"><span class="cv-history-icon">${icon(r.index === 0 ? 'image' : 'history', 12)}</span><span class="cv-history-name"></span></div>`);
    row.classList.toggle('is-current', r.index === current);
    row.classList.toggle('is-undone', r.index > current);
```

### src/ui/history.ts · snapshot sizes · _v0.58.0

Snapshot rows show what they keep. Removed:

```ts
type Row = { key: string; name: string; index: number; snap?: string };
    const snaps: Row[] = this.engine.snapshots.map((x) => ({ key: `snap:${x.id}`, name: x.name, index: -1, snap: x.id }));
```

## src/ui/panels/stop-dialog.ts

### src/ui/panels/stop-dialog.ts · new · _v0.53.0

The dialog a stop step shows. Nothing was removed.

## src/ui/panels/tween-dialog.ts

### src/ui/panels/tween-dialog.ts · new · _v0.50.0

The Tween dialog. Nothing was removed.

### src/ui/panels/tween-dialog.ts · easing · _v0.57.0

The Easing choice. Removed:

```ts
    if (t.current) this.engine.tween(t.current, n, { position: this.position.checked, opacity: this.opacity.checked });
```

## src/ui/panels/gif-dialog.ts

### src/ui/panels/gif-dialog.ts · new · _v0.49.0

The Export GIF dialog. Nothing was removed.

## src/ui/panels/animation-dialog.ts

### src/ui/panels/animation-dialog.ts · new · _v0.49.0

The animation preview. Nothing was removed.

## src/ui/timeline.ts

### src/ui/timeline.ts · new · _v0.49.0

The Timeline panel. Nothing was removed.

### src/ui/timeline.ts · drag and tween · _v0.50.0

Frames drag to a new place; the Tween button. Removed:

```ts
        const row = el(`<div class="cv-frame" role="option"><canvas class="cv-frame-thumb" width="${TW}" height="${TH}"></canvas><div class="cv-frame-meta"><span class="cv-frame-num"></span>` +
```

## src/engine/timeline.ts

### src/engine/timeline.ts · new · _v0.49.0

Frames, their capture and application, and checked reading. Nothing was removed.

### src/engine/timeline.ts · frame styles · _v0.59.0

Frames capture, apply and read back each layer's style. Removed:

```ts
import { uid, type Doc, type ID, type Layer } from './types';
export interface FrameLayer { visible: boolean; opacity: number; x: number; y: number }
  for (const l of doc.layers) out[l.id] = { visible: l.visible, opacity: l.opacity, x: l.transform.x, y: l.transform.y };
    if (!s || (s.visible === l.visible && s.opacity === l.opacity && s.x === l.transform.x && s.y === l.transform.y)) return l;
    return { ...l, visible: s.visible, opacity: s.opacity, transform: { ...l.transform, x: s.x, y: s.y } };
      if (s && typeof s.visible === 'boolean' && finite(s.opacity) && finite(s.x) && finite(s.y)) state[id] = { visible: s.visible, opacity: Math.min(1, Math.max(0, s.opacity)), x: s.x, y: s.y };
```

## src/io/gif.ts

### src/io/gif.ts · new · _v0.48.0

The GIF encoder. Nothing was removed.

### src/io/gif.ts · plays · _v0.49.0

The repeat count means total plays; one play writes no looping extension. Removed:

```ts
/** The GIF file for `frames`, each `width` by `height`; `loops` 0 repeats forever. */
export function encodeGif(frames: GifFrame[], width: number, height: number, loops = 0): Uint8Array {
  bytes.push(0x21, 0xff, 11); text('NETSCAPE2.0'); bytes.push(3, 1); u16(loops); bytes.push(0);
```

## src/ui/panels/shape-style-dialog.ts

### src/ui/panels/shape-style-dialog.ts · new · _v0.48.0

The Shape Fill and Stroke dialog. Nothing was removed.

## src/ui/paths.ts

### src/ui/paths.ts · new · _v0.47.0

The Paths panel. Nothing was removed.

## backend/app/services/project_format.py

### backend/app/services/project_format.py · smartSourceFile · _v0.45.0

The source image is validated like layer images and masks. Removed:

```python
        for key in ("imageFile", "maskFile"):
```

## src/ui/panels/smart-filters-dialog.ts

### src/ui/panels/smart-filters-dialog.ts · new · _v0.45.0

The Smart Filters dialog. Nothing was removed.

### src/ui/panels/smart-filters-dialog.ts · requested filters · _v0.56.0

The dialog works from the filters last asked for. Removed:

```ts
    patchList<SmartFilter>(this.list, smart?.filters ?? [], {
    setText(this.note, smart?.filters.length ? "Filters run top first, each on the one before's result, always from the smart object's original pixels."
    this.engine.setSmartFilters(this.layerId, edit(smart.filters), name);
    const f = this.smart()?.filters.find((x) => x.id === id), layerId = this.layerId;
      const now = this.engine.current?.layer(layerId)?.smart;
      if (now) this.engine.setSmartFilters(layerId, now.filters.map((x) => (x.id === id ? { ...x, settings } : x)), 'Edit Smart Filter');
```

## src/io/zip.ts

### src/io/zip.ts · new · _v0.44.0

A dependency-free ZIP writer, stored, UTF-8 names. Nothing was removed.

## src/ui/panels/actions-dialogs.ts

### src/ui/panels/actions-dialogs.ts · new · _v0.44.0

The Actions and Batch dialogs. Nothing was removed.

### src/ui/panels/actions-dialogs.ts · Sizes follow each image · _v0.47.0

The per-action option in the Actions dialog. Removed:

```ts
import { el, setDisabled, setText } from '../dom';
```

### src/ui/panels/actions-dialogs.ts · step list · _v0.53.0

Steps as selectable rows with Dialog toggles, Insert Stop and Delete Step. Removed:

```ts
import { el, setChecked, setDisabled, setText } from '../dom';
  private readonly steps = el('<pre class="cv-notice"></pre>');
    this.body.appendChild(this.steps);
    this.pick.addEventListener('change', () => this.sync());
    setText(this.steps, !a ? 'No actions yet. Name one and press Record.' : a.steps.length ? a.steps.map((s, i) => `${i + 1}. ${s.label}`).join('\n') : 'No steps yet. Press Record to add some.');
```

## src/ui/actions.ts

### src/ui/actions.ts · new · _v0.44.0

The actions store: recordable commands, steps checked on the way in, storage, playback. Nothing was removed.

### src/ui/actions.ts · recordable · _v0.45.0

Convert and Rasterize become recordable. Removed:

```ts
  'paste-layer-style', 'clear-layer-style', 'duplicate', 'merge-down', 'merge-visible', 'flatten',
```

### src/ui/actions.ts · relative sizes · _v0.47.0

Starting sizes on size steps and the per-action option; new recordable commands. Removed:

```ts
  | { kind: 'imageSize'; label: string; w: number; h: number; sampling: string; res: number }
  | { kind: 'canvasSize'; label: string; w: number; h: number; dx: number; dy: number; fill: RGB | null };
export interface Action { name: string; steps: ActionStep[] }
  'paste-layer-style', 'clear-layer-style', 'convert-smart', 'rasterize', 'duplicate', 'merge-down', 'merge-visible', 'flatten',
  if (s.kind === 'imageSize' && isNum(s.w) && isNum(s.h) && typeof s.sampling === 'string' && isNum(s.res)) return { kind: 'imageSize', label: label || 'Image Size', w: s.w, h: s.h, sampling: s.sampling, res: s.res };
    return { kind: 'canvasSize', label: label || 'Canvas Size', w: s.w, h: s.h, dx: s.dx, dy: s.dy, fill };
    return [{ name: (a as Action).name.slice(0, 80) || 'Action', steps }];
```

### src/ui/actions.ts · adjustment steps · _v0.51.0

The adjustment step and its check on import. Removed:

```ts
import type { RGB } from '../engine';
```

### src/ui/actions.ts · layer style steps · _v0.52.0

The Layer Style step and its check on import. Nothing was removed.

### src/ui/actions.ts · stops and pauses · _v0.53.0

Stop steps, the dialog toggle, and playback that tells a stop from a failure. Removed:

```ts
  | { kind: 'filter'; filter: string; label: string; settings: Record<string, unknown> }
  | { kind: 'adjustment'; adj: string; label: string; data: Record<string, unknown>; layer: boolean }
  if (s.kind === 'adjustment' && typeof s.adj === 'string' && (ADJUSTMENT_KINDS as readonly string[]).includes(s.adj) && s.data && typeof s.data === 'object') return { kind: 'adjustment', adj: s.adj, label: label || s.adj, data: s.data as Record<string, unknown>, layer: s.layer === true };
  if (s.kind === 'filter' && typeof s.filter === 'string' && s.settings && typeof s.settings === 'object') return { kind: 'filter', filter: s.filter, label: label || s.filter, settings: s.settings as Record<string, unknown> };
  /** Runs each step through `run`, stopping at the first that cannot run; returns how many ran and which failed. */
  async play(a: Action, run: (step: ActionStep) => boolean | Promise<boolean>): Promise<{ done: number; failed: string | null }> {
      for (let i = 0; i < a.steps.length; i++) if (!(await run(a.steps[i]))) return { done: i, failed: a.steps[i].label };
      return { done: a.steps.length, failed: null };
```

### src/ui/actions.ts · Reveal All · _v0.58.0

Reveal All becomes recordable. Removed:

```ts
  'paste-layer-style', 'clear-layer-style', 'convert-smart', 'rasterize', 'new-shape-path', 'shape-color', 'duplicate', 'merge-down', 'merge-visible', 'flatten',
```

## src/extensions/tools/direct-select.ts

### src/extensions/tools/direct-select.ts · new · _v0.43.0

The Direct Selection tool. Nothing was removed.

### src/extensions/tools/direct-select.ts · gestures · _v0.47.0

Direct Selection brackets its drags for Shape Path undo. Removed:

```ts
  up() { grab = null; },
```

## src/extensions/tools/pen.ts

### src/extensions/tools/pen.ts · new · _v0.43.0

The Pen tool. Nothing was removed.

### src/extensions/tools/pen.ts · add and delete points · _v0.46.0

Clicks between paths add or delete points, with a plus or minus beside the pointer. Removed:

```ts
import { cornerAt, tracePath, type Anchor, type Pt, type SubPath, type VectorPath } from '../../engine';
  hint: () => 'Click for corner points, drag for curves · Click the first point to close · Enter ends an open path, Backspace removes the last point · Ctrl+Enter makes a selection',
    if (!active) { active = { anchors: [], closed: false }; vp.subpaths.push(active); }
```

### src/extensions/tools/pen.ts · gestures · _v0.47.0

The Pen brackets its gestures for Shape Path undo. Removed:

```ts
  cancel() { pulling = null; },
```

## src/engine/paths.ts

### src/engine/paths.ts · new · _v0.43.0

Anchors, sub-paths and Work Paths; tracing to Path2D; bounds. Nothing was removed.

### src/engine/paths.ts · saving and point editing · _v0.46.0

pathData and pathFrom for project files; anchorNear, nearestSegment and splitSegment for adding and deleting points. Nothing was removed.

### src/engine/paths.ts · named paths, shiftPath · _v0.47.0

NamedPath and PathSet with their file data and checked reader; shiftPath. Removed:

```ts
import type { Pt, Rect } from './types';
```

## src/io/psd.ts

### src/io/psd.ts · new · _v0.42.0

Layered PSD reading and writing with ag-psd, loaded on first use. Nothing was removed.

### src/io/psd.ts · note · _v0.45.0

Smart objects export as pixels, with a note. Nothing was removed.

### src/io/psd.ts · note · _v0.47.0

Shape layers export as pixels, with a note. Nothing was removed.

### src/io/psd.ts · shape layers · _v0.48.0

Shape layers written as Photoshop shapes and read back as shape layers. Removed:

```ts
    if (l.vector) notes.push(`"${l.name}" goes as pixels; the PSD does not hold it as a shape layer.`);
```

### src/io/psd.ts · smart objects · _v0.53.0

Placed layers with embedded sources written and read. Removed:

```ts
import type { BlendMode as PsdBlend, Layer as PsdLayer, Psd } from 'ag-psd';
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid,
  type BlendMode, type Doc, type ID, type Layer, type Surface,
  const notes: string[] = [];
    if (l.smart) notes.push(`"${l.name}" goes as pixels; the PSD does not hold it as a smart object.`);
```

### src/io/psd.ts · editable type · _v0.63.0

Live type written as Photoshop point type and read back as editable type. Removed:

```ts
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt, defaultEffects, patternById, addPattern, projectPatterns, createSurface, ctxOf, type LayerEffects,
      if (pl.text) notes.push(`"${name}" is type in Photoshop; it opened as pixels.`);
    if (liveText(l)) notes.push(`"${l.name}" goes as pixels; the PSD does not hold it as editable type.`);
```
### src/io/psd.ts · blend modes · _v0.66.0

`TO_PSD` maps the ten new modes to Photoshop's names, so they are written and read back. Nothing was removed.

## src/extensions/tools/patch.ts

### src/extensions/tools/patch.ts · new · _v0.42.0

The Patch tool: lasso to select, drag the selection to heal from there. Nothing was removed.
### src/extensions/tools/patch.ts and src/engine/index.ts · Patch modes · _v0.73.0

Options for Patch (Normal, Content-Aware), From (Source, Destination) and Transparent, and a hint that follows From. In the engine, `retouch` holds them; `patchSelection` runs inside one `edit`, moving the selection for Destination and reversing the drag, adds the source's high pass for Transparent, and content-aware fills a three-pixel band inside the seam for Content-Aware. Removed:

```ts
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false };
   *  meet the selection's edge, as one undo step. */
    this.regionEdit('Patch', ({ raster, target, rect }) => {
      if (target !== 'pixels') return;
      const p = this.current as Project, l = p.activeLayer as Layer;
      const cov = this.coverageFor(p, l, target, raster.width, raster.height);
      if (!cov) return;
      const toLayer = invert(placement(l.transform, raster.width, raster.height)), a = applyMat(toLayer, 0, 0), b = applyMat(toLayer, dx, dy);
      const mask = new Uint8Array(raster.width * raster.height);
      for (let i = 0; i < mask.length; i++) mask[i] = cov[i * 4 + 3];
      const pm = premultiply(raster.read().data);
      if (!healFromSource(pm, mask, raster.width, raster.height, 1, Math.round(b.x - a.x), Math.round(b.y - a.y))) return;
      const out = new ImageData(raster.width, raster.height);
      unpremultiply(pm, out.data);
      raster.ctx.putImageData(out, 0, 0, rect.x, rect.y, rect.w, rect.h);
  hint: () => 'Draw around the area to fix, then drag the selection onto the area to copy from · Shift+J cycles the healing tools',
```

## src/extensions/tools/healing-brush.ts

### src/extensions/tools/healing-brush.ts · new · _v0.42.0

The Healing Brush tool. Nothing was removed.

## src/ui/text-editor.ts

### src/ui/text-editor.ts · new · _v0.41.0

Typing on the canvas: one kept text box over the stage, placed on the text's first baseline, restyled from the options bar, committing through the engine. Nothing was removed.

## src/extensions/tools/type.ts

### src/extensions/tools/type.ts · new · _v0.40.0

The Type tool announces where to type; the app opens the dialog. Nothing was removed.

### src/extensions/tools/type.ts · options, on-canvas typing · _v0.41.0

Font, Size, Align, Bold, Italic and Leading in the options bar. Removed:

```ts
/** Type (T): click a type layer to edit its text, or anywhere else to start new text whose first baseline begins at
 *  the click. The Type dialog does the typing; the tool announces where, for the app to open it. */
```

## src/ui/panels/text-dialog.ts

### src/ui/panels/text-dialog.ts · new · _v0.40.0

New Type and Edit Type. Nothing was removed.

## src/engine/text.ts

### src/engine/text.ts · new · _v0.40.0

Fonts, rendering, the raster pairing that keeps type editable, and checked loading. Nothing was removed.

### src/engine/text.ts · textMetrics · _v0.41.0

Shares `renderText`'s padding and font ascent and descent. Nothing was removed.

## src/ui/panels/layer-style-dialog.ts

### src/ui/panels/layer-style-dialog.ts · new · _v0.39.0

The three sections with live preview; OK applies once, Cancel reverts. Nothing was removed.

### src/ui/panels/layer-style-dialog.ts · inner effects · _v0.40.0

Sections for Inner Shadow, Inner Glow and Color Overlay. Removed:

```ts
/** Layer > Layer Style: Drop Shadow, Outer Glow and an outside Stroke for the active pixel layer, shown live while the
 *  dialog is open. OK applies them as one undo step; Cancel leaves the layer as it was. */
```

### src/ui/panels/layer-style-dialog.ts · onApplied · _v0.52.0

Reports applied styles for recording. Removed:

```ts
    const id = this.layerId;
    if (id) this.engine.setLayerEffects(id, effectsActive(this.fx) ? this.fx : null);
```

### src/ui/panels/layer-style-dialog.ts · Gradient Overlay · _v0.58.0

The Gradient Overlay section. Removed:

```ts
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow and Color Overlay for the
```

### src/ui/panels/layer-style-dialog.ts · Bevel and Emboss · _v0.59.0

The Bevel & Emboss section and a choice helper. Removed:

```ts
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow, Color Overlay and Gradient Overlay for the
```

### src/ui/panels/layer-style-dialog.ts · Satin · _v0.60.0

The Satin section. Removed:

```ts
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow, Color Overlay, Gradient Overlay and Bevel & Emboss for the
```

### src/ui/panels/layer-style-dialog.ts · Pattern Overlay · _v0.61.0

The Pattern Overlay section with a pattern list refreshed on opening. Removed:

```ts
import { defaultEffects, effectsActive, type Engine, type LayerEffects, type RGB } from '../../engine';
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow, Satin, Color Overlay, Gradient Overlay and Bevel & Emboss for the
```

## src/ui/panels/generative-dialog.ts

### src/ui/panels/generative-dialog.ts · new · _v0.37.0

The prompt, the key field shown only until a key is saved, and Forget key. Nothing was removed.

### src/ui/panels/generative-dialog.ts · three modes · _v0.38.0

Rewritten for Fill, Expand (margin fields) and Upscale (no prompt). Removed, the whole 0.37.0 file:

```ts
import type { Engine } from '../../engine';
import { api, type GenerativeStatus } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';

/** Edit > Generative Fill: a prompt for what to paint into the selection, sent by the sonny engine to fal (FLUX.1
 *  Fill [pro]); an empty prompt removes what the selection covers (FLUX.1 Erase [pro]). Until a key is saved the dialog
 *  asks for one; the engine keeps it in its data folder and never hands it back to the page. */
export class GenerativeDialog extends Dialog {
  private readonly prompt = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="true" placeholder="Describe what to add, or leave empty to remove">');
  private readonly keyRow = el('<div class="cv-panel-section"></div>');
  private readonly key = el<HTMLInputElement>('<input class="cv-input" type="password" autocomplete="off" spellcheck="false" placeholder="fal API key">');
  private readonly state = el('<p class="cv-note"></p>');
  private readonly forget: HTMLButtonElement;
  private status: GenerativeStatus | null = null;

  constructor(private readonly engine: Engine) {
    super('Generative Fill', 440);
    this.body.appendChild(this.prompt);
    this.body.appendChild(el('<p class="cv-note">The result arrives as a new layer masked to the selection. fal charges about $0.05 per megapixel of the area sent.</p>'));
    this.keyRow.append(this.key, el('<p class="cv-note">Get a key at fal.ai. The sonny engine keeps it in its data folder on this computer.</p>'));
    this.body.appendChild(this.keyRow);
    this.body.appendChild(this.state);
    this.forget = this.button('Forget key', 'ghost', () => void this.forgetKey());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Generate', 'primary', () => void this.generate());
  }

  async show(): Promise<void> {
    this.status = await api.generativeStatus();
    this.sync();
    this.open();
    this.prompt.focus();
    this.prompt.select();
  }

  private sync(): void {
    const s = this.status;
    setHidden(this.keyRow, !s || s.configured);
    setHidden(this.forget, s?.source !== 'settings');
    setText(this.state, !s ? 'The sonny engine is offline. Start it with ./sonny boot.'
      : s.configured ? `fal key set ${s.source === 'environment' ? 'by FAL_KEY in the environment' : 'in sonny'}.` : 'Add a fal API key to generate.');
  }

  private async forgetKey(): Promise<void> {
    try { this.status = await api.forgetGenerativeKey(); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'The key could not be removed.'); return; }
    this.sync();
  }

  private async generate(): Promise<void> {
    if (!this.status) return;
    if (!this.status.configured) {
      const key = this.key.value.trim();
      if (!key) { setText(this.state, 'Paste a fal API key first.'); this.key.focus(); return; }
      try { this.status = await api.saveGenerativeKey(key); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'The key could not be saved.'); return; }
      this.key.value = '';
      this.sync();
    }
    const prompt = this.prompt.value;
    this.close();
    await this.engine.task(() => this.engine.generativeFill(prompt, (image, mask) => api.generativeFill(image, mask, prompt)));
  }
}
```

## Org-navi-map

```text
HASHOUT_LOG.md  · this log
boot_frontend  · start the Vite dev server (unix)
boot_frontend.bat  · start the Vite dev server (windows)
index.html  · entry page: critical style, pre-paint theme boot, font preloads, stylesheet order
oc_install  · install this side (unix)
oc_install.bat  · install this side (windows)
package-lock.json  · npm lockfile
package.json  · pinned dependencies and scripts
public/
    favicon.svg  · tab icon
    splash.html  · desktop splash page
src/
    app.ts  · mount, commands, menus, input, file flows, reveal gate
    engine/
        adjust.ts  · Hue/Saturation and Grain kernels, adjustment data
        renderer.ts  · rendering pipeline
        distort.ts  · free distort: homography, warp, carried corners
        dpi.ts  · export resolution stamp (PNG pHYs, JPEG JFIF density)
        filter-jobs.ts  · worker client for filter previews
        filter-worker.ts  · module worker running filter kernels
        events.ts  · typed emitter
        filters.ts  · blurs, noise, lens, histogram, selection resize
        geometry.ts  · matrices and rectangles
        history.ts  · undo stack
        index.ts  · Engine API
        kernels.ts  · adjustment and wand kernels
        matte.ts  · Remove Background matte refining: guided filter, shift edge, contrast
        project.ts  · per-tab project record
        retouch.ts  · Spot Healing, Content-Aware Fill, Smudge and Liquify
        selection.ts  · selection masks, outline tracer
        stroke.ts  · brush stroke engine
        surface.ts  · canvases and rasters
        transform.ts  · handles and drag math
        tree.ts  · layer hierarchy walks
        types.ts  · document types, blend modes, limits
        viewport.ts  · zoom and pan
    extensions/
        registry.ts  · tool contract and registry
        tools/
            brush-common.ts  · shared brush cursor, keys and options
            brush.ts  · brush and eraser
            clone.ts  · Clone Stamp
            crop.ts  · crop frame, ratios, snapping
            eyedropper.ts  · color sampling
            gradient.ts  · pending gradient with movable ends
            hand.ts  · panning
            heal.ts  · Spot Healing
            index.ts  · built-in tool list
            lasso.ts  · freehand and polygonal lasso
            marquee.ts  · rectangle and ellipse marquee
            move.ts  · move and transform handles
            select-common.ts  · modifier to selection mode
            shape.ts  · rectangle and ellipse shape layers
            smear.ts  · Smear: Liquify, Blur, Smudge
            wand.ts  · magic wand
            zoom.ts  · zoom tool
    host.ts  · NodeMode portal link
    io/
        api.ts  · engine HTTP client
        images.ts  · image decoding with engine fallback
        project-io.ts  · project serialize and deserialize
    main.ts  · entry, calls startApp
    styles/
        dialogs.css  · dialogs and lists
        fonts.css  · vendored Inter and JetBrains Mono
        light-mode.css  · light theme adjustments
        panels.css  · layers panel, menus, toasts
        scrollbars.css  · scrollbars, loaded last
        shell.css  · app grid, titlebar, rail, stage, status
        tokens.css  · NodeMode tokens plus the sonny block
    ui/
        app-dialogs.ts  · new canvas, open, settings, shortcuts, about
 brand.ts · the inline app mark
        commands.ts  · command registry and key labels
        dialogs.ts  · dialog base, confirm, prompt
        dom.ts  · NodeMode dom-stable plus setters
        icons.ts  · 80 NodeMode icons, verbatim
        layers.ts  · layers panel
        menu.ts  · popup menus and menubar
        options.ts  · options bar
        palette.ts  · stage colors from tokens
        panels/
            adjust-panel.ts  · adjustment editing panel, layer and image modes
            background-panel.ts  · Remove Background panel: Basic, Advanced refine, preview
            color-picker.ts  · Photoshop-style color picker with canvas sampling
            controls.ts  · slider, select, check, color and number rows
            filter-panel.ts  · filter dialog with scaled preview
            jpeg-dialog.ts  · JPEG export sheet with quality and encoded preview
            live-mask-dialog.ts  · bake-or-unlink choice when deleting a clip base
            size-dialogs.ts  · canvas size, image size, expand and contract
        rail.ts  · tool rail and colors
        stage.ts  · scene and overlay canvases
        status.ts  · status bar
        tabs.ts  · project tabs
        themes.ts  · 14 NodeMode theme profiles, verbatim
        toast.ts  · toasts
    version.ts  · version string
tsconfig.json  · strict compiler settings
vite.config.ts  · ports 5190 and 5191, host false, /api proxy
```

## Table of contents

- [boot_frontend](#boot_frontend)
- [boot_frontend.bat](#boot_frontendbat)
- [index.html](#indexhtml)
- [oc_install](#oc_install)
- [oc_install.bat](#oc_installbat)
- [package.json](#packagejson)
- [public/favicon.svg](#publicfaviconsvg)
- [public/splash.html](#publicsplashhtml)
- [src/app.ts](#srcappts)
- [src/engine/adjust.ts](#srcengineadjustts)
- [src/engine/renderer.ts](#srcenginerendererts)
- [src/engine/distort.ts](#srcenginedistortts)
- [src/engine/dpi.ts](#srcenginedpits)
- [src/engine/filter-jobs.ts](#srcenginefilter-jobsts)
- [src/engine/filter-worker.ts](#srcenginefilter-workerts)
- [src/engine/events.ts](#srcengineeventsts)
- [src/engine/filters.ts](#srcenginefiltersts)
- [src/engine/geometry.ts](#srcenginegeometryts)
- [src/engine/history.ts](#srcenginehistoryts)
- [src/engine/index.ts](#srcengineindexts)
- [src/engine/kernels.ts](#srcenginekernelsts)
- [src/engine/matte.ts](#srcenginemattets)
- [src/engine/project.ts](#srcengineprojectts)
- [src/engine/retouch.ts](#srcengineretouchts)
- [src/engine/selection.ts](#srcengineselectionts)
- [src/engine/stroke.ts](#srcenginestrokets)
- [src/engine/surface.ts](#srcenginesurfacets)
- [src/engine/transform.ts](#srcenginetransformts)
- [src/engine/tree.ts](#srcenginetreets)
- [src/engine/types.ts](#srcenginetypests)
- [src/engine/viewport.ts](#srcengineviewportts)
- [src/extensions/registry.ts](#srcextensionsregistryts)
- [src/extensions/tools/brush-common.ts](#srcextensionstoolsbrush-commonts)
- [src/extensions/tools/brush.ts](#srcextensionstoolsbrushts)
- [src/extensions/tools/clone.ts](#srcextensionstoolsclonets)
- [src/extensions/tools/crop.ts](#srcextensionstoolscropts)
- [src/extensions/tools/eyedropper.ts](#srcextensionstoolseyedropperts)
- [src/extensions/tools/gradient.ts](#srcextensionstoolsgradientts)
- [src/extensions/tools/hand.ts](#srcextensionstoolshandts)
- [src/extensions/tools/heal.ts](#srcextensionstoolshealts)
- [src/extensions/tools/index.ts](#srcextensionstoolsindexts)
- [src/extensions/tools/lasso.ts](#srcextensionstoolslassots)
- [src/extensions/tools/marquee.ts](#srcextensionstoolsmarqueets)
- [src/extensions/tools/move.ts](#srcextensionstoolsmovets)
- [src/extensions/tools/select-common.ts](#srcextensionstoolsselect-commonts)
- [src/extensions/tools/shape.ts](#srcextensionstoolsshapets)
- [src/extensions/tools/smear.ts](#srcextensionstoolssmearts)
- [src/extensions/tools/wand.ts](#srcextensionstoolswandts)
- [src/extensions/tools/zoom.ts](#srcextensionstoolszoomts)
- [src/host.ts](#srchostts)
- [src/io/api.ts](#srcioapits)
- [src/io/images.ts](#srcioimagests)
- [src/io/project-io.ts](#srcioproject-iots)
- [src/main.ts](#srcmaints)
- [src/styles/dialogs.css](#srcstylesdialogscss)
- [src/styles/fonts.css](#srcstylesfontscss)
- [src/styles/light-mode.css](#srcstyleslight-modecss)
- [src/styles/panels.css](#srcstylespanelscss)
- [src/styles/scrollbars.css](#srcstylesscrollbarscss)
- [src/styles/shell.css](#srcstylesshellcss)
- [src/styles/tokens.css](#srcstylestokenscss)
- [src/ui/app-dialogs.ts](#srcuiapp-dialogsts)
- [src/ui/brand.ts](#srcuibrandts)
- [src/ui/commands.ts](#srcuicommandsts)
- [src/ui/dialogs.ts](#srcuidialogsts)
- [src/ui/dom.ts](#srcuidomts)
- [src/ui/icons.ts](#srcuiiconsts)
- [src/ui/layers.ts](#srcuilayersts)
- [src/ui/menu.ts](#srcuimenuts)
- [src/ui/options.ts](#srcuioptionsts)
- [src/ui/palette.ts](#srcuipalettets)
- [src/ui/panels/adjust-panel.ts](#srcuipanelsadjust-panelts)
- [src/ui/panels/background-panel.ts](#srcuipanelsbackground-panelts)
- [src/ui/panels/color-picker.ts](#srcuipanelscolor-pickerts)
- [src/ui/panels/controls.ts](#srcuipanelscontrolsts)
- [src/ui/panels/filter-panel.ts](#srcuipanelsfilter-panelts)
- [src/ui/panels/jpeg-dialog.ts](#srcuipanelsjpeg-dialogts)
- [src/ui/panels/live-mask-dialog.ts](#srcuipanelslive-mask-dialogts)
- [src/ui/panels/size-dialogs.ts](#srcuipanelssize-dialogsts)
- [src/ui/rail.ts](#srcuirailts)
- [src/ui/stage.ts](#srcuistagets)
- [src/ui/status.ts](#srcuistatusts)
- [src/ui/tabs.ts](#srcuitabsts)
- [src/ui/themes.ts](#srcuithemests)
- [src/ui/toast.ts](#srcuitoastts)
- [src/version.ts](#srcversionts)
- [tsconfig.json](#tsconfigjson)
- [vite.config.ts](#viteconfigts)

## boot_frontend

### boot_frontend · start the Vite dev server (unix) · _v0.1.0

Created in _v0.1.0.

## boot_frontend.bat

### boot_frontend.bat · start the Vite dev server (windows) · _v0.1.0

Created in _v0.1.0.

## index.html

### index.html · head · _v0.1.0

Critical inline style keeps `#app` hidden until `body.app-ready`; the NodeMode theme boot runs before first paint. `data-theme="dark"` on the root lets the NodeMode host bridge flip light and dark. Three `rel="preload"` links fetch the Inter weights alongside the bundle; Vite rewrites them to the same hashed files the CSS uses.

## oc_install

### oc_install · install this side (unix) · _v0.1.0

Created in _v0.1.0.

## oc_install.bat

### oc_install.bat · install this side (windows) · _v0.1.0

Created in _v0.1.0.

## package.json

### package.json · pinned dependencies and scripts · _v0.1.0

Created in _v0.1.0.

### package.json · test script, vitest · _v0.67.0

`npm test` runs `vitest run`; vitest 5.0.1 pinned as a dev dependency (npm rewrote the lockfile on install). Removed:

```json
    "vite": "8.3.0"
```

## public/favicon.svg

### public/favicon.svg · tab icon · _v0.1.0

Created in _v0.1.0.

### public/favicon.svg · the app mark · _v0.32.0

Replaced with the supplied artwork; `favicon.ico` (16 to 256) and a 180 px `apple-touch-icon.png` join it. Nothing else was removed.

## public/splash.html

### public/splash.html · desktop splash page · _v0.1.0

Created in _v0.1.0.

## src/app.ts

### src/app.ts · startApp · reveal gate · _v0.1.0

Removed: the gate read `fonts.ready` before any font load had started, so it resolved at once and Inter swapped in after reveal (measured in the throttled run). It now awaits explicit Inter 400, 500 and 600 loads, capped at 2.5 s.

```ts
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
  void Promise.race([fonts, new Promise((r) => window.setTimeout(r, 400))]).then(() => requestAnimationFrame(() => revealApp()));
```

### src/app.ts · startApp · commands · _v0.1.0

Every menu item, button and shortcut is a command in the `commands.add(...)` block. New canvas uses Alt+Mod+N as well as Mod+N because browsers keep Mod+N.

### src/app.ts · startApp · v0.2.0 commands and clipboard · _v0.2.0

Adds the clipboard, selection-modify, Image adjustment, New Adjustment Layer, Canvas Size, Image Size and filter commands, and a Filter menu that now holds Remove Background. Copy writes PNG plus a `sonny:` marker to the system clipboard; Mod+V is let through to the native paste event, which pastes in-app copies in place and external images centered above the active layer. Double-clicked adjustment rows open their editor through `cv:edit-adjustment`.

### src/app.ts · startApp · Content-Aware Fill · _v0.3.0

Adds the Content-Aware Fill command (Shift+Backspace) to the Edit menu; it runs after a frame so the busy indicator can show. Removed from the Edit menu definition:

```ts
'fill-fg', 'fill-bg', 'clear', '-', 'settings'] },
```

### src/app.ts · startApp · Transform command · _v0.5.0

Adds the Transform command to the Edit menu, labeled Transform Selection or Transform Layer as labels it, on Alt+Mod+T (browsers keep Mod+T for a new tab, as with Alt+Mod+N and Alt+Mod+W) and Mod+T. Removed from the Edit menu definition:

```ts
'fill-fg', 'fill-bg', 'clear', 'content-fill', '-', 'settings'] },
```

### src/app.ts · save, downloadProject, exportImage · settle first · _v0.5.0

Each calls `engine.settle()` before reading the document, so an unapplied gradient is saved and exported (it was left out since 0.2.0) and a floating selection merges first instead of being written twice, on its own layer and in the untouched source. Save settles before its name prompt. Nothing was removed.

### src/app.ts · startApp · Export JPEG sheet · _v0.6.0

Export JPEG... settles, then opens `JpegDialog`, whose chosen quality `exportImage` passes to `exportBlob`. Removed:

```ts
    { id: 'export-jpg', label: 'Export JPEG', enabled: has, run: () => void exportImage('jpg') },
```

```ts
  async function exportImage(kind: 'png' | 'jpg'): Promise<void> {
```

```ts
        const blob = await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg');
```

### src/app.ts · startApp · removeBackground opens the panel · _v0.9.0

The engine's mask now opens `BackgroundPanel` instead of being applied at once, and the toast names the engine that found the subject. Removed:

```ts
        engine.setMaskFromImage(l.id, bitmap, raster.width, raster.height, 'Remove Background');
        bitmap.close();
        toast(`Background removed with the ${used === 'ml' ? 'ML' : 'lightweight'} engine. The result is a layer mask you can refine.`);
```

### src/app.ts · startApp · color picker · _v0.10.0

Creates `ColorPickerDialog` with the other dialogs; it listens for the rail's `cv-pick-color` event itself, so nothing else in the app changes. Nothing was removed.

### src/app.ts · deleteLayersWithChoice · _v0.19.0

The Delete Layer command and the Delete and Backspace keys ask through `LiveMaskDialog` when layers are clipped to what is being deleted. (Filed under renderer.ts in 0.19.0 by mistake; moved here in 0.20.0.) Removed:

```ts
    { id: 'delete-layer', label: 'Delete Layer', enabled: () => !!layer(), run: () => engine.deleteLayers() },
```

```ts
clearPixels() : engine.deleteLayers()
```

### src/app.ts · recent projects, Open Recent commands · _v0.23.0

the recent documents: `noteRecent` on every library save and open (ten, newest first, in local storage), `recent-heading`, `recent-0` to `recent-9` and `clear-recent` commands, and a File menu computed on open; a project the library no longer has drops out. Removed:

```ts
      try { await openOpened(await api.openLibrary(name), name); return true; } catch (err) { toast(message(err), 'error'); return false; }
```

```ts
    { label: 'File', items: ['new', 'open', 'import', '-', 'save', 'save-as', 'download-project', '-', 'export-png', 'export-jpg', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
```

### src/app.ts · close-tab · Mod+W in the desktop shell · _v0.25.0

Close Tab takes Mod+W where the Tauri shell is present, as the File > Close; the web keeps Alt+Mod+W since browsers reserve Ctrl/Cmd-W. Removed:

```ts
    { id: 'close-tab', label: 'Close Tab', keys: ['Alt+Mod+W'], enabled: has, run: () => { const p = engine.current; if (p) void requestClose(p.id); } },
```

### src/app.ts · exportRefProject, export-ref · _v0.28.0

File > Export .ref Project... writes `Name.ref.zip` through `serializeRefProject` and the package route's root folder, and toasts the changes made for `.ref`. Nothing was removed.

### src/app.ts · export-jpg shortcut · _v0.30.0

Export JPEG takes the Alt+Shift+Mod+S, the one gap the shortcut audit found. Removed:

```ts
    { id: 'export-jpg', label: 'Export JPEG...', enabled: has, run: () => { engine.settle(); dialogs.jpeg.show((q) => void exportImage('jpg', q)); } },
```

### src/app.ts · exportRefProject, .ref wording · _v0.31.0

`exportReference` and `serializeReference` became `exportRefProject` and `serializeRefProject`; the menu item reads Export .ref Project... and its toast names the format. Removed:

```ts
    { id: 'export-ref', label: 'Export .ref Project...', enabled: has, run: () => void exportRefProject() },
```

### src/app.ts · welcome card · app mark · _v0.32.0

The welcome title shows the app mark at 28 px. Removed:

```ts
<div class="cv-welcome-title">${icon('paintbrush', 20)}sonny</div>
```

### src/app.ts · Unsharp Mask; repair of the 0.31.0 sweep · _v0.33.0

Filter > Unsharp Mask joins the menu. The 0.31.0 attribution sweep had collapsed indentation and spaces before colons across ten TypeScript files and the change logs' quoted code; 0.33.0 restored every line that matched its pre-sweep text apart from whitespace, and corrected the menu label that read Export.ref Project. Removed:

```ts
const FILTERS: FilterKind[] = ['gaussianBlur', 'motionBlur', 'addNoise', 'lensCorrection'];
```

### src/app.ts · Filter > Develop · _v0.36.0

Develop leads the Filter menu on Shift+Mod+A. Removed:

```ts
const FILTERS: FilterKind[] = ['gaussianBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'unsharpMask'];
```

### src/app.ts · Generative Fill · _v0.37.0

The Generative Fill dialog joins the registry and Edit > Generative Fill sits after Content-Aware Fill. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-fg', 'fill-bg', 'clear', 'content-fill', '-', 'transform', '-', 'settings'] },
```

### src/app.ts · Generative Expand, Upscale · _v0.38.0

Image menu entries for Generative Expand and Upscale 2x and 4x. Removed:

```ts
    { label: 'Image', items: ['adj-levels', 'adj-curves', 'adj-hsv', 'adj-exposure', 'adj-gradientMap', 'adj-grain', '-', 'invert', '-', 'canvas-size', 'image-size', '-', 'flip-canvas-h', 'flip-canvas-v'] },
```

### src/app.ts · Layer Style · _v0.39.0

Layer > Layer Style and the same entry on the Layers panel's context menu. Removed:

```ts
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · layer style and type commands · _v0.40.0

Copy, Paste and Clear Layer Style and Edit Type in the Layer and context menus; the Type and fx events. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt } from './engine';
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · text editor · _v0.41.0

The canvas text editor takes Type clicks and type-layer double-clicks. Removed:

```ts
    if (d?.layerId) dialogs.text.showEdit(d.layerId);
    else if (typeof d?.x === 'number' && typeof d?.y === 'number') dialogs.text.showCreate(d.x, d.y);
```

### src/app.ts · Shift+J cycling, PSD open and export · _v0.42.0

Tool keys cycle their group with Shift; PSDs open as documents; File > Export PSD. Removed:

```ts
import { toolForKey } from './extensions/registry';
        try { await openOpened(await api.importProject([f]), null); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    else if (!e.shiftKey && toolForKey(k)) engine.setTool(toolForKey(k)?.id ?? engine.tool);
```

### src/app.ts · path commands · _v0.43.0

Make Selection from Path (Mod+Enter) in Select, Fill Path and Stroke Path in Edit, Delete Path. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-fg', 'fill-bg', 'clear', 'content-fill', 'generative-fill', '-', 'transform', '-', 'settings'] },
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract'] },
```

### src/app.ts · Actions and Batch · _v0.44.0

Recording hooks, playback, batch to zip, File menu entries; the image-import input is marked for the harness. Removed:

```ts
  const imageInput = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" hidden>`);
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', 'export-psd', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
  if (import.meta.env.DEV) (window as unknown as { sonny: unknown }).sonny = { engine, commands };
```

### src/app.ts · smart objects · _v0.45.0

Commands, menus, the dialog, and the runner and margin wiring. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive } from './engine';
import { FILTER_LABELS, FilterPanel, type FilterKind } from './ui/panels/filter-panel';
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · paths and contents · _v0.46.0

Saving and opening carry the path; Save writes contents back; Edit Contents in the menus; a space restored in the .ref message. Removed:

```ts
    const { doc, activeId } = await deserialize(o.manifest, (name) => {
        const { manifest, files } = await serialize(p.doc, p.activeId);
        const { manifest, files } = await serialize(p.doc, p.activeId);
        const { manifest, files, notes } = await serializeRefProject(p.doc, p.activeId);
        if (notes.length) toast(`Exported as.ref with changes: ${notes.join(' ')}`);
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · paths, shapes, relative sizes · _v0.47.0

The Paths panel mounted; path sets saved and restored; shape and New Path commands; relative size replay. Removed:

```ts
    const { doc, activeId, workPath } = await deserialize(o.manifest, (name) => {
    if (workPath) engine.setPathOf(p, workPath);
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathOf(p));
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathOf(p));
        const { manifest, files, notes } = await serializeRefProject(p.doc, p.activeId, engine.pathOf(p));
  async function runStep(s: ActionStep): Promise<boolean> {
    if (s.kind === 'imageSize') return engine.resampleImage(s.w, s.h, s.sampling as Parameters<typeof engine.resampleImage>[2], s.res);
    return engine.resizeCanvas(s.w, s.h, s.dx, s.dy, s.fill);
    const r = await actions.play(x, runStep);
          const r = await actions.play(x, runStep);
    { id: 'rasterize', label: 'Rasterize Layer', enabled: () => { const l = engine.current?.activeLayer; return !!l && (!!l.smart || liveText(l)); }, run: () => engine.rasterizeLayer() },
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · shape style, PSD note · _v0.48.0

The dialog and its command; PSD export notes Paths-panel paths. Removed:

```ts
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · animation · _v0.49.0

The Timeline mounted, frame commands, GIF export with sizes, timelines saved and restored. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText } from './engine';
    const { doc, activeId, paths } = await deserialize(o.manifest, (name) => {
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p));
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p));
        const { manifest, files, notes } = await serializeRefProject(p.doc, p.activeId, engine.pathsOf(p));
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', 'export-psd', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
  if (import.meta.env.DEV) (window as unknown as { sonny: unknown }).sonny = { engine, commands, actions };
```

### src/app.ts · tween · _v0.50.0

The Tween dialog and command. Nothing was removed.

### src/app.ts · adjustments in Actions · _v0.51.0

Recording and replaying adjustment steps; new adjustment layers are marked as made. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface } from './engine';
    ...ADJUSTMENT_KINDS.map((kind) => ({ id: `new-adj-${kind}`, label: `New ${ADJUSTMENT_LABELS[kind]} Layer...`, enabled: has, run: () => { const id = engine.addAdjustmentLayer(kind); if (id) dialogs.adjust.openForLayer(id); } })),
```

### src/app.ts · layer style in Actions · _v0.52.0

Recording and replaying Layer Style steps. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind } from './engine';
```

### src/app.ts · pauses · _v0.53.0

Playback honours stops and dialog pauses; a stop ends a batch. Removed:

```ts
  async function runStep(s: ActionStep, relative = false): Promise<boolean> {
    if (s.kind === 'filter') return dialogs.filter.applySettings(s.filter as FilterKind, s.settings);
    if (r.failed) toast(`"${x.name}" stopped at step ${r.done + 1}, ${r.failed}, which could not run here.`, 'error');
```

### src/app.ts · History panel, async runner · _v0.56.0

The History panel mounted; the smart filters get an off-thread runner. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData } from './engine';
```

### src/app.ts · New Snapshot · _v0.57.0

The New Snapshot command. Nothing was removed.

### src/app.ts · Trim, Reveal All · _v0.58.0

The Trim dialog and both commands on the Image menu. Removed:

```ts
    { label: 'Image', items: ['adj-levels', 'adj-curves', 'adj-hsv', 'adj-exposure', 'adj-gradientMap', 'adj-grain', '-', 'invert', '-', 'canvas-size', 'generative-expand', 'image-size', 'upscale-2x', 'upscale-4x', '-', 'flip-canvas-h', 'flip-canvas-v'] },
```

### src/app.ts · Define Pattern, library · _v0.61.0

Define Pattern on the Edit menu; the browser pattern library loaded and saved. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData, runFilterOffThread } from './engine';
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-fg', 'fill-bg', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', '-', 'settings'] },
```

### src/app.ts · Color Range command · _v0.65.0

Select > Color Range and its dialog. Removed:

```ts
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', '-', 'path-selection', 'delete-path'] },
```
### src/app.ts · error log, recovery, adjustments, align, modify · _v0.66.0

The error log installed after notices, Help > Copy Error Log; crash-recovery copies kept twenty seconds after a change (`keepModified`) and offered after reveal (`offerRecovery`); the new adjustments on the Image menu; Feather (Shift+F6), Border and Smooth on the Select menu; Align and Distribute on the Layer menu. Removed:

```ts
    { label: 'Image', items: ['adj-levels', 'adj-curves', 'adj-hsv', 'adj-exposure', 'adj-gradientMap', 'adj-grain', '-', 'invert', '-', 'canvas-size', 'trim', 'reveal-all', 'generative-expand', 'image-size', 'upscale-2x', 'upscale-4x', '-', 'flip-canvas-h', 'flip-canvas-v'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', '-', 'path-selection', 'delete-path'] },
    { label: 'Help', items: ['shortcuts', 'about'] },
  void Promise.race([faces, new Promise((r) => window.setTimeout(r, 2500))]).then(() => requestAnimationFrame(() => revealApp()));
```
### src/app.ts · Select Subject, Object in Selection · _v0.71.0

`selectSubject` sends the visible composite (or the current selection's bounds of it) to `/ops/remove-background` and loads the returned mask as the selection, clipped to the old selection for Object in Selection; commands `select-subject` and `select-object` on the Select menu. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData, runFilterOffThread, addPattern, allPatterns, patternById, projectPatterns } from './engine';
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', 'feather', 'border', 'smooth', '-', 'path-selection', 'delete-path'] },
```

## src/engine/adjust.ts

### src/engine/adjust.ts · hsvKernel, grainKernel, defaultAdjustmentData · _v0.2.0

Hue/Saturation ported from `HueSaturation.swift` (HSL, per-range band weights, multiplicative saturation, lightness pull, colorize), baked into a 33-point cube lookup table like the color cube. Grain ported from `AdjustPixels.c` (lattice noise, smoothstep, roughness, midtone weighting) in document coordinates. The invert-range rule in `weightOf` is inferred from the settings doc comment, not read from source. `defaultAdjustmentData` writes every non-optional `LayerAdjustment` field because decodes with synthesized Codable; enum-keyed dictionaries are written as Swift's alternating arrays and read in either form.

### src/engine/adjust.ts · band operations · _v0.8.0

Implements `HueBand` methods as pure functions: `bandForward`, `bandHandles`, `bandCentered` (the Sample eyedropper), `bandInclude` (Add), `bandExclude` (Remove), `bandSetHandle` (a handle drag, refused when it would break the order or exceed 350 degrees) and the private `normalizeBand`. Swift's `truncatingRemainder` matches JavaScript's `%`, so wraparound behaves identically. Nothing was removed.

### src/engine/adjust.ts · rewritten independently · _v0.34.0

Hue bands, the eyedroppers' band operations, the HSL model, the 33-point cube, the `.ref` data layout and the defaults are new code with outputs identical to the replaced code; Grain now comes from new triangular lattice noise with the same strength and character and a different pattern. The removed code is not quoted here, deliberately: it is the translated code this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.33.0.
### src/engine/adjust.ts · parametric kinds · _v0.66.0

Labels and kinds extended from `PARAM_ADJUSTMENTS`; `defaultAdjustmentData` fills `data.params` for them. Removed:

```ts
export const ADJUSTMENT_KINDS: AdjustmentKind[] = ['hsv', 'levels', 'curves', 'exposure', 'gradientMap', 'grain'];
```

## src/engine/renderer.ts

### src/engine/renderer.ts · rendering pipeline · _v0.1.0

Created in _v0.1.0.

### src/engine/renderer.ts · kernelFor, adjust, maskOf · _v0.2.0

Adds a kernel cache keyed on the adjustment data object, hands each kernel the region's document origin and scale, and places layer and mask overrides by their own size so scaled previews align. Removed:

```ts
import { IDENTITY, mul, placement, setMat, type Mat } from './geometry';
import { adjustmentKernel } from './kernels';
      const m = mul(job.view, placement(t, layer.raster.width, layer.raster.height));
    const kernel = adjustmentKernel(layer.adjustment);
    kernel(adj);
    return { src, w: m.raster.width, h: m.raster.height, t: m.placement ?? t, covers: !m.placement && !layer.adjustment };
```

### src/engine/renderer.ts · LayerOverride.maskPlacement, maskOf · _v0.15.0

A mask being transformed on its own is positioned by the `maskPlacement` override, and while placed it no longer counts as covering the layer's box. Removed:

```ts
export interface LayerOverride { source?: Surface; transform?: Transform; maskSource?: Surface; hidden?: boolean; blend?: BlendMode; opacity?: number }
```

```ts
    return { src, w: src.width, h: src.height, t: m.placement ?? t, covers: !m.placement && !layer.adjustment };
```

### src/engine/renderer.ts · clipCoverageOf · _v0.19.0

A public, pool-free copy of a clip base's coverage at document size, the exact coverage clipped layers show through, for baking. Nothing was removed.

### src/engine/renderer.ts · halving chain (DownsampleCache) · _v0.20.0

`draw` renders a layer landing under half size from a chain of exact 2x halvings (`halvings`, `halved`, at most six), cached per raster and dropped when its version changes, found through `rasterOf`; Nearest sampling bypasses it. Removed:

```ts
import { createSurface, ctxOf, sizeSurface, type Ctx2D, type Surface } from './surface';
import { IDENTITY, applyMat, invert, matScale, mul, placement, setMat, type Mat } from './geometry';
```

```ts
    c.save();
    setMat(c, m);
```

```ts
    c.drawImage(src, 0, 0);
```

### src/engine/renderer.ts · clipCoverage · override source size · _v0.21.0

A clip base's override source is placed by the source's own size, as layers and masks already were, so a distorted clip base previews at the right scale. Removed:

```ts
    this.draw(slot.c, src, mul(job.view, placement(t, base.raster.width, base.raster.height)), t.sampling, ov?.opacity ?? base.opacity, 'source-over', job.quality);
```

### src/engine/renderer.ts · layer styles · _v0.39.0

Styled layers take the slot path; `effects` draws shadow, glow and stroke beneath them inside the layer's bounds plus reach, large blurs at half resolution, the stroke by distance transform. Removed:

```ts
import { compositeOp, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform } from './types';
import { IDENTITY, applyMat, invert, matScale, mul, placement, scaling, setMat, type Mat } from './geometry';
export interface LayerOverride { source?: Surface; transform?: Transform; maskSource?: Surface; maskPlacement?: Transform; hidden?: boolean; blend?: BlendMode; opacity?: number }
      if (!own && !folders.length && !base) { this.draw(ctx, src, m, t.sampling, opacity, op, job.quality); continue; }
```

### src/engine/renderer.ts · effects above the content · _v0.40.0

Effects draw in two passes, below and above the content; the above pass keeps Color Overlay, Inner Glow and Inner Shadow to the silhouette, the inner ones cast by its inverse. Removed:

```ts
      if (styled) this.effects(ctx, a, fx, matScale(job.view), opacity, W, H, boundsOf([applyMat(m, 0, 0), applyMat(m, src.width, 0), applyMat(m, src.width, src.height), applyMat(m, 0, src.height)]));
  private effects(ctx: Ctx2D, sil: Slot, fx: LayerEffects, scale: number, opacity: number, W: number, H: number, bounds: Rect): void {
    const d = fx.dropShadow, g = fx.outerGlow, k = fx.stroke;
    const reach = Math.max(d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0) * scale + 2;
```

### src/engine/renderer.ts · effect cache · _v0.41.0

Effects at document resolution cached per layer and drawn through the view; `effects()` hands parts to a callback. Removed:

```ts
import { IDENTITY, applyMat, invert, matScale, mul, placement, scaling, setMat, boundsOf, integral, intersectRect, type Mat } from './geometry';
      if (!own && !folders.length && !base && !styled) { this.draw(ctx, src, m, t.sampling, opacity, op, job.quality); continue; }
      const placed = styled ? boundsOf([applyMat(m, 0, 0), applyMat(m, src.width, 0), applyMat(m, src.width, src.height), applyMat(m, 0, src.height)]) : null;
      if (styled && placed) this.effects(ctx, a, fx, matScale(job.view), opacity, W, H, placed, 'below');
      if (styled && placed) this.effects(ctx, a, fx, matScale(job.view), opacity, W, H, placed, 'above');
  private effects(ctx: Ctx2D, sil: Slot, fx: LayerEffects, scale: number, opacity: number, W: number, H: number, bounds: Rect, phase: 'below' | 'above'): void {
    const lay = (s: Surface, alpha: number, op: GlobalCompositeOperation): void => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = op;
      ctx.drawImage(s, 0, 0, bw, bh, bx, by, bw, bh);
      ctx.restore();
    };
```

### src/engine/renderer.ts · Gradient Overlay · _v0.58.0

The gradient painted beneath Color Overlay, kept to the silhouette. Nothing was removed.

### src/engine/renderer.ts · Bevel and Emboss · _v0.59.0

Height-map shading kept by style, above the other inner effects; the effect reach covers it. Removed:

```ts
    const d = fx.dropShadow, g = fx.outerGlow, k = fx.stroke, is = fx.innerShadow, ig = fx.innerGlow, co = fx.colorOverlay;
    const reach = Math.max(d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) * scale + 2;
```

### src/engine/renderer.ts · Satin, fast previews, reach · _v0.60.0

Satin painted between Color Overlay and Inner Glow; the shared blur; parts at reduced resolution while previewing; Bevel reach in the effect region. Removed:

```ts
interface FxPart { s: Surface; x: number; y: number; alpha: number; op: GlobalCompositeOperation; above: boolean }
    const key = JSON.stringify([r?.id ?? null, r?.version ?? 0, t, mk ? [mk.raster?.id ?? null, mk.raster?.version ?? 0, mk.enabled, maskPlacement ?? mk.placement] : null, fx, docW, docH]);
    const reach = Math.max(d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) + 4;
      const view = translation(-region.x, -region.y), sil = this.slot(8, region.w, region.h);
      sil.c.clearRect(0, 0, region.w, region.h);
      if (own) this.cover(sil.c, own, view, region.w, region.h);
      const local = { x: placed.x - region.x, y: placed.y - region.y, w: placed.w, h: placed.h };
          parts.push({ s: copy, x: region.x + box.x, y: region.y + box.y, alpha, op, above: phase === 'above' });
        }, sil, fx, 1, 1, region.w, region.h, local, phase);
      ctx.drawImage(p.s, 0, 0);
    const blur = (src: Float32Array, r: number): Float32Array => {
      if (r < 1) return src;
      let x: Float32Array = src, y: Float32Array = new Float32Array(n);
      const k = 1 / (2 * r + 1);
      for (let pass = 0; pass < 3; pass++) {
        for (let row = 0; row < h; row++) {
          const o = row * w;
          let s = 0;
          for (let i = -r; i <= r; i++) s += x[o + Math.min(w - 1, Math.max(0, i))];
          for (let i = 0; i < w; i++) { y[o + i] = s * k; s += x[o + Math.min(w - 1, i + r + 1)] - x[o + Math.max(0, i - r)]; }
        }
        [x, y] = [y, x === src ? new Float32Array(n) : x];
        for (let col = 0; col < w; col++) {
          let s = 0;
          for (let j = -r; j <= r; j++) s += x[Math.min(h - 1, Math.max(0, j)) * w + col];
          for (let j = 0; j < h; j++) { y[j * w + col] = s * k; s += x[Math.min(h - 1, j + r + 1) * w + col] - x[Math.max(0, j - r) * w + col]; }
        }
        [x, y] = [y, x];
      }
      return x;
    };
```

### src/engine/renderer.ts · Pattern Overlay · _v0.61.0

The pattern tiled from the layer corner, the lowest overlay. Nothing was removed.
### src/engine/renderer.ts · per-pixel blend modes · _v0.66.0

`render` sends a layer in a mode the canvas lacks through the slot path, then `pixelBlend` reads the target and the slot within the layer's placed bounds and blends them with `blendPixels`; Dissolve's pattern is taken in document pixels through the inverse view. Removed:

```ts
import { compositeOp, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform, effectsActive, type LayerEffects, type RGB, type Rect } from './types';
      const op = compositeOp(ov?.blend ?? layer.blend);
      if (!own && !folders.length && !base && (!styled || parts)) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = op;
      ctx.drawImage(a.s, 0, 0);
      ctx.restore();
```

## src/engine/distort.ts

### src/engine/distort.ts · DistortWarp port · _v0.21.0

the free distort math: `cornersOf` (handle order), `distortUsable` (convex and non-degenerate), `homography` and `project`, `carried` (a box's perspective applied to inner corners, for group members and masks placed apart), `warpRaster` (premultiplied, edge-clamped bilinear inverse mapping, preview scale, mask mode with an edge tone outside), `visibleBounds` and `cropWarp` (warpTrimmed), and `maskEdgeTone` (LayerMask.background).

### src/engine/distort.ts · rewritten independently · _v0.35.0

The perspective map solved from its eight corner equations by Gauss-Jordan elimination, inverted through cross products, resampled with premultiplied bilinear filtering; identical outputs. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

### src/engine/distort.ts · imageCorners · _v0.52.0

Exported for smart-object distortion. Removed:

```ts
function imageCorners(c: readonly Pt[], flipX: boolean, flipY: boolean): Pt[] {
```

### src/engine/distort.ts · masks in alpha, inverse3 · _v0.54.0

The warp keeps mask levels in alpha; maskEdgeTone samples alpha; inverse3 exported. Removed:

```ts
function inverse3(m: readonly number[]): number[] | null {
  if (mask) for (let k = 0; k < od.length; k += 4) { od[k] = od[k + 1] = od[k + 2] = background; od[k + 3] = 255; }
          const o = texel(ix + dx, iy + dy), k = weight * (mask ? 255 : sd[o + 3]);
      od[o + 3] = mask ? 255 : Math.round(a);
  const add = (x: number, y: number): void => { sum += d[(y * w + x) * 4]; count++; };
```

## src/engine/dpi.ts

### src/engine/dpi.ts · withResolution · _v0.25.0

the ImageExporter DPI: a PNG `pHYs` chunk (pixels per meter, with its CRC32) placed after IHDR unless one exists, and a JPEG's JFIF density in dots per inch (an APP0 segment inserted when absent); other types and out-of-range resolutions pass through.

## src/engine/filter-jobs.ts

### src/engine/filter-jobs.ts · runFilterOffThread · _v0.26.0

One long-lived module worker with numbered jobs, pixels transferred in and out, resolving to the filtered ImageData; null where module workers are unavailable or after a failure, so callers run the kernel themselves.

### src/engine/filter-jobs.ts · unsharpMask settings · _v0.33.0

`FilterKind` gains `unsharpMask` and `FilterSettings` its Amount, Radius and Threshold. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection';
```

### src/engine/filter-jobs.ts · develop · _v0.36.0

`FilterSettings` carries the Develop state. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask';
```
### src/engine/filter-jobs.ts · Lens Blur, Smart Sharpen · _v0.68.0

`FilterSettings` gains `lensRadius`, `lensBrightness`, `lensThreshold` and `smart`; `FilterKind` gains `lensBlur` and `smartSharpen`. Removed:

```ts
export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop';
```

## src/engine/filter-worker.ts

### src/engine/filter-worker.ts · filter worker · _v0.26.0

Runs Gaussian Blur, Motion Blur, Add Noise and Lens Correction off the main thread from the same kernels the main thread uses, transferring the result back.

### src/engine/filter-worker.ts · Unsharp Mask · _v0.33.0

The worker runs Unsharp Mask too. Removed:

```ts
import { addNoise, gaussianBlur, lensDistort, motionBlur } from './filters';
```

### src/engine/filter-worker.ts · develop · _v0.36.0

The worker runs Develop. Nothing was removed.
### src/engine/filter-worker.ts · Lens Blur, Smart Sharpen · _v0.68.0

Two branches run the new filters off the main thread. Nothing was removed.

## src/engine/events.ts

### src/engine/events.ts · typed emitter · _v0.1.0

Created in _v0.1.0.

## src/engine/filters.ts

### src/engine/filters.ts · gaussianBlur, motionBlur, addNoise, lensDistort, histogram, resizeMask · _v0.2.0

Gaussian Blur as three premultiplied box passes with zero padding, so it fades past the edge; Motion Blur as a sampled line of the given length (matches Core Image's radius to that length by variance); Add Noise and Lens Correction ported from `NoisePixels.c` and `LensPixels.c` with premultiplied sampling; the Levels histogram from `LevelsPixels.c`; Expand and Contract through a Felzenszwalb distance transform with one pixel of antialiasing.

### src/engine/filters.ts · unsharpMask · _v0.33.0

Unsharp Mask: each channel pushed from its Gaussian blur by Amount where the difference reaches Threshold; alpha untouched. Nothing was removed.

### src/engine/filters.ts · rewritten independently · _v0.34.0

Kovesi's three-box Gaussian, a bilinear line-integral motion blur, a radial lens model, alpha-weighted histograms and Felzenszwalb and Huttenlocher's distance transform, all new code with outputs identical to the replaced code; Add Noise now draws from SplitMix32, keeping the old statistics with a new pattern. `unsharpMask` (0.33.0) is unchanged. The removed code is not quoted here, deliberately: it is the translated code this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.33.0.

### src/engine/filters.ts · faster box blur · _v0.54.0

Box passes with channel locals and a row-major column pass, identical output. Removed:

```ts
 *  divided by its full width, so values fade past the image edge. */
  const scale = 1 / (2 * r + 1), lines = across ? h : w, length = across ? w : h, stride = across ? 4 : w * 4;
  const sum = new Float64Array(4);
  for (let line = 0; line < lines; line++) {
    const origin = across ? line * w * 4 : line * 4;
    sum.fill(0);
    const warm = Math.min(r, length - 1);
    for (let k = 0; k <= warm; k++) for (let c = 0; c < 4; c++) sum[c] += src[origin + k * stride + c];
    for (let i = 0; i < length; i++) {
      const at = origin + i * stride;
      for (let c = 0; c < 4; c++) dst[at + c] = sum[c] * scale;
      const enter = i + r + 1, leave = i - r;
      if (enter < length) for (let c = 0; c < 4; c++) sum[c] += src[origin + enter * stride + c];
      if (leave >= 0) for (let c = 0; c < 4; c++) sum[c] -= src[origin + leave * stride + c];
```

## src/engine/geometry.ts

### src/engine/geometry.ts · matrices and rectangles · _v0.1.0

Created in _v0.1.0.

## src/engine/history.ts

### src/engine/history.ts · undo stack · _v0.1.0

Created in _v0.1.0.

### src/engine/history.ts · steps · _v0.56.0

The steps kept, in order, and how many are done. Nothing was removed.
### src/engine/history.ts · rollback, markUnsaved · _v0.66.0

`rollback` hands back the open step's starting snapshot and the pixel patches recorded so far, for `Engine.rollBack`; `markUnsaved` makes a recovered document count as modified. Nothing was removed.

## src/engine/index.ts

### src/engine/index.ts · Engine.moveLayers · _v0.1.0

Removed: a drop onto the slot a layer already held recorded an undo entry that changed nothing. The new code compares id, parent and clip order and returns false on a no-op.

```ts
      p.setLayers(this.normalizeClips(layers));
```

### src/engine/index.ts · Engine.setMaskFromImage · _v0.1.0

Added for Remove Background: the engine result becomes a linked layer mask, never deleted pixels, as `.ref` projects store it.

### src/engine/index.ts · live edits, previews, image edits, sizing, clipboard, gradient, shapes · _v0.2.0

Adds `beginLive`, `updateLive`, `commitLive` and `cancelLive` (one undo step for panel editing); `setPreview` and `previewImageEdit` (scaled to about 2 megapixels, grown for blurs); `applyImageEdit` (through the selection, masks as gray, blurs grow the layer); adjustment layers; Canvas Size with the Canvas Extension layer; Crop; Image Size; Expand, Contract and Mask's Black Areas; the clipboard; the pending gradient, committed on `settle` so the first Undo discards it; shape layers, redrawn on resize and plain pixels once painted, filled or filtered. Clearing on a mask now fills with the background color. Removed:

```ts
    this.regionEdit('Clear', ({ raster, rect, cover }) => {
      const c = raster.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.drawImage(this.tint(rect, '#ffffff', cover), rect.x, rect.y);
      c.restore();
    });
      p.updateLayer(l.id, { transform: next, mask: followMask(l, next) });
```

### src/engine/index.ts · retouch strokes, warp, Content-Aware Fill · _v0.3.0

Adds `beginRetouchStroke` (Spot Healing previews as a tint and heals on release; Clone Stamp and Blur paint a texture), Clone Stamp's source and offset rules from `CloneStamp.swift` (aligned offsets fixed by the first stroke, cleared by a new source), the Blur sample blurred by `diameter / 10` clamped 1.5 to 30 from `BlurTool.swift`, the Smudge and Liquify warp lifecycle shown through a document-size override and committed along the dab path as one undo step, and `contentAwareFill` through the selection's soft coverage. Retouch tools work on layer pixels; Blur on masks is not ported yet. Removed:

```ts
    const patch = st.s.commit();
```

### src/engine/index.ts · snapping, precise transforms, pixel moves · _v0.4.0

Move drags snap through `snapMove`: the moving box's edges and center go to the nearest target within 6 screen pixels among the canvas edges and center and every other visible layer's upright bounds and center, as the `snappedMove`, with `snapGuides` for the overlay; `snapping` turns it off. `setLayerTransform`, `resizeLayerTo` and `scaleLayerTo` back the Move inspector fields: each is one undo step, resizes around the center, honors the ratio lock, redraws shape layers, and a no-op records nothing. `beginPixelMove`, `movePixelsBy`, `endPixelMove` and `cancelPixelMove` lift the selected pixels, show them over the layer with the selection cleared (kept for a duplicate), and commit one patch with the selection translated; `outlineShift` lets the ants follow. Removed:

```ts
  cancelTransform(): void { if (this.transformEdit) { this.transformEdit = null; this.emit('render', null); this.emit('options', null); } }
```

### src/engine/index.ts · Transform Selection, growLayer · _v0.5.0

`transformCommand` floats the selection when `canTransformSelection`, else switches to Move with transform controls on. `beginSelectionTransform` switches to Move first (switching settles), then opens one Transform Selection step: the selected pixels go onto a Floating Selection layer above their layer with its opacity and blend, the source shows its cleared pixels through the override map without being written, and the selection is handed to the float. Drags and inspector edits of the float update it without history (`settle(keepFloating)`, the floating branches in `endTransform` and `setLayerTransform`). `commitSelectionTransform` grows the source where the pixels now extend past it, writes cleared base plus transformed float, removes the float, and carries the selection through the same matrix; an unchanged float, a cancel, or a closed project restores the document exactly. `ensurePixels` now calls the general `growLayer(want)`. Removed:

```ts
  settle(): void {
```

```ts
    this.settle();
    this.transformEdit = { project: p, layerId: l.id, original: l.transform, draft: l.transform, mode, start };
```

```ts
    const t = layer.transform, r = layer.raster;
    if (!isAxisAligned(t, r.width, r.height)) return r;
    if (t.x <= 0 && t.y <= 0 && t.x + t.w >= W && t.y + t.h >= H) return r;
    const u = unionRect({ x: t.x, y: t.y, w: t.w, h: t.h }, { x: 0, y: 0, w: W, h: H });
```

### src/engine/index.ts · sampleOriginal · _v0.7.0

Returns the unpremultiplied RGB of the original pixel under a document point from the source the Levels histogram reads: the target layer's pixels, or its mask's when the mask is targeted (mirroring `targetImage`), or the flattened document for an adjustment layer. Nothing was removed.

### src/engine/index.ts · applySubjectMask · _v0.9.0

Lays a refined subject mask on a layer as one Remove Background step, stored as sonny masks are (white with the level in alpha), multiplied into an existing same-size unplaced mask as the `subjectMask` does. Nothing was removed; `setMaskFromImage` stays for other callers.

### src/engine/index.ts · sampleRing, setSampleRing · _v0.11.0

the sample ring state: the document point, the sampled color and the color before the drag, set by whatever is sampling and drawn by the stage; `showsSampleRing` is the Eyedropper's Sample Ring option and suppresses it. Nothing was removed.

### src/engine/index.ts · wand Sample Size, selectionAntialiased, nudgeSelection · _v0.13.0

`wand.sampleSize` (0 Point, 1 three by three, 2 five by five) passes to `wandMask`; `selectionAntialiased` is the session-wide Anti-alias for the Lasso and elliptical Marquee; `nudgeSelection` moves the outline as one Move Selection step. Removed:

```ts
  wand = { tolerance: 32, contiguous: true, sampleAll: false };
```

```ts
    const mask = wandMask(data, W, H, x, y, this.wand.tolerance, this.wand.contiguous);
```

### src/engine/index.ts · copyMask · _v0.14.0

the Option-drag mask copy: the source's mask onto the target as one Copy Layer Mask or Replace Layer Mask step, pinned where it sits on the document (`placement` from the source's mask or layer transform), with its own raster, or kept solid when the source was never painted; the target becomes active with its mask targeted. Nothing was removed.

### src/engine/index.ts · transformsMask, transform edit mask mode · _v0.15.0

with a painted mask targeted and unlinked (`transformsMask`), a transform edit starts from the mask's box, previews through `maskPlacement`, and commits the mask's placement as one Transform Layer Mask step. Removed:

```ts
  transformEdit: { project: Project; layerId: ID; original: Transform; draft: Transform; mode: DragMode; start: Pt } | null = null;
```

```ts
    this.transformEdit = { project: p, layerId: l.id, original: l.transform, draft: l.transform, mode, start };
```

```ts
    if (te && te.project === p) m.set(te.layerId, { ...(m.get(te.layerId) ?? {}), transform: te.draft });
```

### src/engine/index.ts · maskBlurSample, beginRetouchStroke on masks · _v0.16.0

`maskBlurSample` ports the blurSample for a mask (the mask at document size, its area from none, the rest at its binary edge tone, blurred at the Blur sigma); `beginRetouchStroke` lets Blur paint a targeted mask as a lerp stroke with the stroke's real target, while Clone Stamp and Spot Healing still refuse masks. Removed:

```ts
    if (p.maskTarget && l0.mask) { this.notice('This tool works on layer pixels. Click the layer thumbnail to target them.'); return false; }
```

```ts
    } else if (kind === 'blur') texture = { surface: this.layerSample(p, l0, clamp(this.brush.diameter / 10, 1.5, 30)), dx: 0, dy: 0 };
```

```ts
    const s = new PixelStroke(pick.raster, pick.local, style, 'source-over', p.selection, texture);
    this.stroke = { project: p, layerId: pick.layer.id, target: 'pixels', s, heal: kind === 'heal' ? this.retouch.healMode : undefined };
```

```ts
    if (shift && last && last.layerId === pick.layer.id && last.target === 'pixels') s.to(last.p);
```

### src/engine/index.ts · groupMembers, groupBox, group transform edits · _v0.17.0

the group transform: with more than one layer selected or a folder, `groupMembers` (visible pixel layers selected or inside a selected folder) move with `groupBox`, each member previewed and committed through `following`, as one Transform Layers step; group moves skip snapping for now. Removed:

```ts
  transformEdit: { project: Project; layerId: ID; original: Transform; draft: Transform; mode: DragMode; start: Pt; mask: boolean } | null = null;
```

```ts
    if (!p || !l || l.isGroup || !l.raster || this.stroke) return false;
```

```ts
    const box = mask ? l.mask?.placement ?? l.transform : l.transform;
    this.transformEdit = { project: p, layerId: l.id, original: box, draft: box, mode, start, mask };
```

```ts
    if (te && te.project === p) m.set(te.layerId, { ...(m.get(te.layerId) ?? {}), ...(te.mask ? { maskPlacement: te.draft } : { transform: te.draft }) });
```

```ts
    if (te.mode.kind === 'move' && this.snapping) te.draft = this.snapMove(te.project, te.layerId, te.draft);
```

### src/engine/index.ts · copyLayerToProject, group snapping · _v0.18.0

the copyLayer(into:): a layer with a folder's contents copied into another open project as one Copy Layers from Project step (new ids, cloned rasters and masks, remapped parent and clip links, centered on the target canvas, on top), the target made current, within the 100-megapixel budget. `snapMove` skips a set of moving layers, so group moves now snap their box. Removed:

```ts
  private snapMove(p: Project, id: ID, t: Transform): Transform {
```

```ts
      if (!e.visible || l.isGroup || !l.raster || l.id === id) continue;
```

```ts
    if (te.mode.kind === 'move' && this.snapping && !te.group) te.draft = this.snapMove(te.project, te.layerId, te.draft);
```

### src/engine/index.ts · liveMaskDependents, doomedBy, deleteLayers(bake) · _v0.19.0

A live mask is a clipping mask. `liveMaskDependents` names the layers clipped to ones being deleted; `deleteLayers(true)` bakes each (its cloned raster masked by `clipCoverageOf` mapped into its pixel grid) before unlinking, as one Delete Layer step. Removed:

```ts
  deleteLayers(): void {
```

```ts
      const doomed = new Set<ID>();
      for (const id of roots) { doomed.add(id); for (const d of descendantIds(p.doc.layers, id)) doomed.add(d); }
```

```ts
      const kept = p.doc.layers.filter((l) => !doomed.has(l.id)).map((l) => (l.clipId && doomed.has(l.clipId) ? { ...l, clipId: null } : l));
```

### src/engine/index.ts · distortEdit, beginDistort, moveDistortCorner, applyDistort · _v0.21.0

the free distort: a pending four-corner edit of the active layer or the group box, previewed per layer at up to 640 px through the overrides, applied at full resolution as Distort or Distort Layers; `distortQuad` carries group members, `distortMask` handles linked, placed and unlinked masks; `settle` applies a pending distortion. Removed (0.21.0 replaced its own first, single-layer version before release, so only earlier code is quoted):

```ts
  settle(keepFloating = false): void {
    if (this.gradient) this.commitGradient();
```

```ts
import { dragged, following, rounded, type DragMode } from './transform';
```

### src/engine/index.ts · tipDrag, beginTipDrag, updateTipDrag, endTipDrag · _v0.22.0

right-drag resizes the brush from its size at the press (2 dx over the zoom, 1 to 2000) or with Shift changes its hardness (dx over 200), the circle pinned at the press. Nothing was removed.

### src/engine/index.ts · floatingOutline · _v0.24.0

the mapPath for Transform Selection: the floating pixels' source selection and the matrix placement(now) times placement(original) inverse, now being the live draft while dragging; null when a distortion leaves no affine map. Nothing was removed.

### src/engine/index.ts · exportBlob · resolution stamp · _v0.25.0

Every PNG and JPEG export passes through `withResolution` with the document's resolution. Removed:

```ts
    return toBlob(renderDoc(this.work, p.doc, type === 'image/jpeg' ? '#ffffff' : null), type, quality);
```

### src/engine/index.ts · previewImageEdit, setPreview, previewToken · _v0.26.0

A preview result may arrive later: `previewImageEdit` takes `ImageData | Promise<ImageData>` and paints through `finish` only while its token is current, and `setPreview(null)` bumps that token, so a worker result for a superseded or switched-off preview is dropped. Removed:

```ts
  previewImageEdit(run: (src: ImageData, scale: number) => ImageData, grow = 0, maxPixels = 2_000_000): void {
    const p = this.current;
```

```ts
    const out = run(src, scale);
    const cov = g ? null : this.coverageFor(p, l, onMask ? 'mask' : 'pixels', w, h);
    let result = cov ? this.blendThrough(src, out, cov) : out;
    if (onMask) result = fromGray(result);
    c.putImageData(result, 0, 0);
```

### src/engine/index.ts · clonePreview · _v0.27.0

the source around `clonePoint(at)` rendered for just the brush circle at screen resolution, from the document or the active layer as the stroke samples, faded by the brush tip through a radial `destination-in` gradient, cached by sample point, brush, side, sampling mode, layer and revision; null during a stroke. Removed:

```ts
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, sameTransform, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
```

### src/engine/index.ts · strokeTo · changed region · _v0.29.0

The render event carries `Rect | null`; a stroke frame reports the document bounds of its composed rectangle (mapped through the layer or mask placement) unless `dirtyRendering` is off. Removed:

```ts
  history: null; colors: null; render: null; overlay: null; busy: boolean; notice: Notice;
```

```ts
    if (st.s.compose()) this.emit('render', null);
```

### src/engine/index.ts · generativeFill · _v0.37.0

Sends the visible composite around the selection (25% context, 16 to 256 px) and the selection grown by three pixels as the mask, then inserts the result as one masked layer; refuses to place it if the document changed. Nothing was removed.

### src/engine/index.ts · fillArea, generativeExpand, upscaleToDocument · _v0.38.0

`generativeFill` became a wrapper over `fillArea`, which also pre-fills see-through context; Expand and Upscale added. Removed:

```ts
  /** Generative Fill: sends what the document shows around the selection, with the selection grown by three pixels as
   *  the mask, to `generate`, then places the result as a new layer masked to the selection, in one undo step. An empty
   *  prompt asks for removal. Returns false when nothing was placed. */
  async generativeFill(prompt: string, generate: (image: Blob, mask: Blob) => Promise<Blob>): Promise<boolean> {
    const p = this.current, sel = p?.selection;
    if (!p || !sel) { this.notice('Generative Fill needs a selection.'); return false; }
    const view = this.flattened();
    if (!view) return false;
    const reach = Math.min(256, Math.max(16, Math.round(Math.max(sel.w, sel.h) * 0.25)));
    const x0 = Math.max(0, sel.x - reach), y0 = Math.max(0, sel.y - reach);
    const w = Math.min(p.doc.width, sel.x + sel.w + reach) - x0, h = Math.min(p.doc.height, sel.y + sel.h + reach) - y0;
    if (w < 1 || h < 1) { this.notice('The selection is outside the canvas.'); return false; }
    const context = new Raster(w, h);
    context.ctx.drawImage(view, -x0, -y0);
    const cover = new Raster(w, h);
    cover.ctx.drawImage(sel.surface(), sel.x - x0, sel.y - y0);
    const mask = Raster.filled(w, h, '#000000');
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) mask.ctx.drawImage(cover.canvas, dx, dy);
    let result: Blob;
    try {
      result = await generate(await toBlob(context.canvas), await toBlob(mask.canvas));
    } catch (err) {
      this.notice(err instanceof Error ? err.message : 'Generative Fill failed.', 'error');
      return false;
    }
    if (this.current !== p) { this.notice('The document changed while generating, so the fill was not placed.', 'error'); return false; }
    const bitmap = await createImageBitmap(result);
    const layer = new Raster(w, h);
    layer.ctx.imageSmoothingQuality = 'high';
    layer.ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    layer.touch();
    cover.touch();
    const name = `Generative Fill: ${prompt.trim() || 'remove'}`;
    this.insertRasterLayer(layer, name.length > 60 ? `${name.slice(0, 57)}...` : name, x0, y0, { mask: { raster: cover, enabled: true, linked: true, placement: null } }, 'Generative Fill');
    return true;
  }
```

### src/engine/index.ts · setLayerEffects, previewLayerEffects · _v0.39.0

One undo step per change, none when unchanged; the preview joins the render overrides; strokes repaint whole in documents with styled layers. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform } from './types';
    if (!this.dirtyRendering || !l || !r || !t) { this.emit('render', null); return; }
```

### src/engine/index.ts · style clipboard, type layers · _v0.40.0

Copy, Paste and Clear Layer Style (paste and clear over every selected layer in one step); `textSettings`, `textLayerAt`, `createTextLayer` and `updateTextLayer`. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects } from './types';
```

### src/engine/index.ts · setTextEditing, repaint rule · _v0.41.0

Hides a type layer while it is edited on the canvas; strokes repaint whole only for the painted styled layer, clipped styled layers and styled layers in folders. Removed:

```ts
export { TEXT_FONTS, defaultText, liveText, textFromData, textKey } from './text';
    // Layer styles can cast from outside a stroke's region into it, so documents using them repaint whole.
    const styled = st.project.doc.layers.some((x) => effectsActive(x.effects));
```

### src/engine/index.ts · Healing Brush stroke, patchSelection · _v0.42.0

The `healBrush` stroke kind heals at release from its offset in the layer's pixels; `patchSelection` heals the selection from a dragged offset as one undo step. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, premultiply, spotHeal, unpremultiply, type HealMode } from './retouch';
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode } | null = null;
    const patch = st.heal ? this.healPatch(st.s, st.heal) : st.s.commit();
  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur', pt: Pt, shift: boolean): boolean {
    if (kind === 'clone') {
      if (!off) { this.notice('Alt-click to set where Clone Stamp copies from.'); return false; }
    p.history.begin(kind === 'heal' ? 'Spot Healing' : kind === 'clone' ? 'Clone Stamp' : 'Blur', p.snapshot());
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s, heal: kind === 'heal' ? this.retouch.healMode : undefined };
```

### src/engine/index.ts · Work Path and path commands · _v0.43.0

The Work Path per open document; Make Selection, Fill Path, Stroke Path and Delete Path. Removed:

```ts
import { Raster, createSurface, ctxOf, toBlob, type Surface } from './surface';
```

### src/engine/index.ts · openImage · _v0.44.0

A document holding one image as its one layer, for Batch. Nothing was removed.

### src/engine/index.ts · smart objects · _v0.45.0

Convert, Rasterize, the filter stack with padded re-rendering, and the smart-object gate at every pixel-editing entry point. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec } from './types';
```

### src/engine/index.ts · paths per document, Edit Contents · _v0.46.0

pathOf and setPathOf; editOn and restack; editContents, contentsOf and updateContents. Removed:

```ts
export { cornerAt, pathBounds, tracePath, type Anchor, type SubPath, type VectorPath } from './paths';
  setSmartFilters(id: ID, filters: SmartFilter[], name = 'Smart Filters'): void {
    this.edit(name, (p) => {
      const stack = structuredClone(filters), raster = this.renderSmart(l.smart.source, stack), old = l.raster as Raster, t = l.transform;
      p.updateLayer(id, { smart: { source: l.smart.source, filters: stack }, raster, transform: { ...t, x: cx - w / 2, y: cy - h / 2, w, h }, mask });
  setWorkPath(vp: VectorPath | null): void {
    const p = this.current;
    if (!p) return;
    this.emit('overlay', null);
    this.emit('options', null);
```

### src/engine/index.ts · paths per document, shape layers · _v0.47.0

Path lists and selection; the Shape Path entry, rendering, gesture undo, protection and recolouring. Removed:

```ts
import { pathBounds, tracePath, type VectorPath } from './paths';
export { anchorNear, cornerAt, nearestSegment, pathBounds, pathData, pathFrom, splitSegment, tracePath, type Anchor, type SubPath, type VectorPath } from './paths';
  history: null; colors: null; render: Rect | null; overlay: null; busy: boolean; notice: Notice;
    if (!l?.smart || (p.maskTarget && l.mask)) return false;
    this.notice(SMART_NOTICE);
      if (!l || (!l.smart && !l.text)) return false;
      p.updateLayer(l.id, { smart: null, text: null });
  private readonly workPaths = new WeakMap<Project, VectorPath>();
  /** The current document's Work Path, drawn with the Pen tool. It lives with the open document and is not saved yet. */
  get workPath(): VectorPath | null { const p = this.current; return p ? this.workPaths.get(p) ?? null : null; }
  setWorkPath(vp: VectorPath | null): void { const p = this.current; if (p) this.setPathOf(p, vp); }
  /** Any open document's Work Path, as saving reads it. */
  pathOf(p: Project): VectorPath | null { return this.workPaths.get(p) ?? null; }
  /** Sets any open document's Work Path, as opening a project restores it. */
  setPathOf(p: Project, vp: VectorPath | null): void {
    if (vp && vp.subpaths.some((sp) => sp.anchors.length)) this.workPaths.set(p, vp); else this.workPaths.delete(p);
  deletePath(): void { this.setWorkPath(null); }
    if (this.current?.activeLayer?.smart) { this.notice(SMART_NOTICE); return false; }
    if (al?.smart && !(this.current?.maskTarget && al.mask)) { this.notice(SMART_NOTICE); return; }
```

### src/engine/index.ts · shape fill and stroke · _v0.48.0

Rendering with fill and stroke, lines stroked by default, setShapeStyle. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter } from './types';
  private renderShape(path: VectorPath, fill: RGB): { raster: Raster; x: number; y: number } | null {
    if (!b) return null;
    const x = Math.floor(b.x) - 1, y = Math.floor(b.y) - 1, w = Math.min(LIMITS.side, Math.ceil(b.x + b.w) + 1 - x), h = Math.min(LIMITS.side, Math.ceil(b.y + b.h) + 1 - y);
    const raster = new Raster(Math.max(1, w), Math.max(1, h));
    raster.ctx.translate(-x, -y);
    raster.ctx.fillStyle = rgbCss(fill);
    raster.ctx.fill(tracePath(path));
    raster.ctx.setTransform(1, 0, 0, 1, 0, 0);
  private reshape(p: Project, id: ID, path: VectorPath, fill: RGB): void {
    const r = this.renderShape(path, fill), l = p.layer(id);
    if (!r || !l) return;
    p.updateLayer(id, { raster: r.raster, transform: { ...l.transform, x: r.x, y: r.y, w: r.raster.width, h: r.raster.height, rotation: 0, flipX: false, flipY: false }, vector: { path: stored, fill, origin: { x: r.x, y: r.y } }, shape: null });
    const path = structuredClone(vp), fill = { ...this.fg }, r = this.renderShape(path, fill);
    this.insertRasterLayer(r.raster, `Shape ${n}`, r.x, r.y, { vector: { path, fill, origin: { x: r.x, y: r.y } } }, 'New Shape Layer');
    this.edit('Shape Color', (p) => this.reshape(p, l.id, shiftPath(v.path, dx, dy), { ...this.fg }));
        if (this.pathGesture === p) this.reshape(p, l.id, vp, l.vector.fill);
        else this.edit('Edit Shape Path', (q) => this.reshape(q, l.id, vp, (l.vector as NonNullable<Layer['vector']>).fill));
```

### src/engine/index.ts · timeline · _v0.49.0

Timelines per document, frame selection as undo steps, reconciling after undo and redo, rendering a frame. Removed:

```ts
  history: null; colors: null; render: Rect | null; overlay: null; busy: boolean; notice: Notice; paths: null;
```

### src/engine/index.ts · moveFrame, tween · _v0.50.0

Reordering frames and filling in tweened frames. Removed:

```ts
import { captureFrame, frameLayers, type Frame, type Timeline } from './timeline';
```

### src/engine/index.ts · smart distortion, applyLayerStyle · _v0.52.0

Warped re-renders, distorting from the undistorted render, carrying moves into the warp; Layer Style for Actions. Removed:

```ts
import { carried, cornersOf, cropWarp, distortUsable, maskEdgeTone, visibleBounds, warpRaster, type Warped } from './distort';
    const m = Math.min(512, Math.ceil(shown.reduce((n, f) => n + (this.smartFilterMargin?.(f.kind, f.settings) ?? 0), 0)));
  distortEdit: { project: Project; layerId: ID; box: Transform; members: ID[] | null; corners: Pt[]; previews: Map<ID, { pixels: Warped | null; mask: DistortedMask | null }> } | null = null;
    if (this.current?.activeLayer?.smart || this.current?.activeLayer?.vector) { this.notice(this.current.activeLayer.vector ? SHAPE_NOTICE : SMART_NOTICE); return false; }
      if (l?.raster && q) d.previews.set(id, { pixels: warpRaster(l.raster, l.transform, q, scale), mask: this.distortMask(l, q, scale) });
```

### src/engine/index.ts · masked smart distortion, style normalising · _v0.54.0

Smart objects distort with their masks; setLayerEffects normalises partial styles. Removed:

```ts
import { carried, cornersOf, cropWarp, distortUsable, maskEdgeTone, visibleBounds, warpRaster, type Warped, imageCorners, homography, project } from './distort';
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle } from './types';
    const next = effectsActive(effects) ? structuredClone(effects) : null;
  distortEdit: { project: Project; layerId: ID; box: Transform; members: ID[] | null; corners: Pt[]; smart?: { R: Raster; t: Transform; margin: number }; previews: Map<ID, { pixels: Warped | null; mask: DistortedMask | null }> } | null = null;
      if (l.mask) { this.notice('A smart object with a layer mask cannot be distorted yet; apply or delete the mask first.'); return false; }
      this.distortEdit = { project: p, layerId: l.id, box: rt, members: null, corners, previews: new Map(), smart: { R, t: rt, margin } };
      if (l?.raster && q) d.previews.set(id, sm ? { pixels: warpRaster(sm.R, sm.t, q, scale), mask: null } : { pixels: warpRaster(l.raster, l.transform, q, scale), mask: this.distortMask(l, q, scale) });
      const w = this.warpedSmart(sm.R, m, src, warp);
      const smart = sl.smart;
      if (w) this.edit('Distort', (q) => q.updateLayer(sl.id, { raster: w.raster, transform: w.t, smart: { ...smart, warp, warpAt: w.t } }));
```

### src/engine/index.ts · background filters, stroke warm-up · _v0.55.0

applyImageEditAsync with its source preparation; painting tools warm stroke surfaces; strokes give their surfaces back. Removed:

```ts
import { PixelStroke } from './stroke';
```

### src/engine/index.ts · smart re-render, history jumps · _v0.56.0

Large smart objects re-render in the background, latest change winning; historySteps and jumpHistory. Removed:

```ts
    if (l?.smart) this.setSmartFilters(l.id, [...l.smart.filters, { id: uid(), kind, settings: structuredClone(settings), enabled: true }], 'Smart Filter');
  setSmartFilters(id: ID, filters: SmartFilter[], name = 'Smart Filters'): void { const p = this.current; if (p) this.restack(p, id, null, filters, name); }
  private restack(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string): boolean {
      const stack = structuredClone(filters ?? l.smart.filters), raster = this.renderSmart(src, stack), old = l.raster as Raster, t = l.transform;
    const ok = this.restack(target.parent, target.layer.id, Raster.from(flat, flat.width, flat.height), null, 'Update Smart Object');
```

### src/engine/index.ts · snapshots, easing · _v0.57.0

copyDoc, takeSnapshot, revertToSnapshot and deleteSnapshot; tween easing. Removed:

```ts
  tween(id: ID, count: number, opts: { position: boolean; opacity: boolean }): boolean {
      const u = k / (n + 1), state: Record<ID, FrameLayer> = {};
```

### src/engine/index.ts · snapshot budget, Trim, Reveal All · _v0.58.0

Snapshot sizes and their budget; trim and revealAll. Removed:

```ts
  /** The current document's snapshots, newest last. They live with the open document and are not saved. */
  get snapshots(): ReadonlyArray<{ id: ID; name: string }> { const p = this.current; return p ? this.historySnapshots.get(p) ?? [] : []; }
    const list = this.historySnapshots.get(p) ?? [];
```

### src/engine/index.ts · frame styles · _v0.59.0

Selecting a frame applies styles; tweens carry the first frame's. Removed:

```ts
      target.forEach((l, i) => { const now = q.doc.layers[i]; if (l !== now && now?.id === l.id) q.updateLayer(l.id, { visible: l.visible, opacity: l.opacity, transform: l.transform }); });
```

### src/engine/index.ts · fast previews · _v0.60.0

The screen renderer previews styles at reduced resolution on large layers. Nothing was removed.

### src/engine/index.ts · patterns · _v0.61.0

Pattern functions exported. Nothing was removed.

### src/engine/index.ts · renderText · _v0.63.0

renderText exported for the PSD writer. Removed:

```ts
export { TEXT_FONTS, defaultText, fontCss, liveText, textFromData, textKey, textMetrics } from './text';
```

### src/engine/index.ts · bucket and toning · _v0.64.0

Bucket and tone settings, paintBucket, toned retouch strokes, a region for region edits. Removed:

```ts
  private regionEdit(name: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void): void {
      const sel = p.selection;
  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur' | 'healBrush', pt: Pt, shift: boolean): boolean {
    }
    p.history.begin(kind === 'heal' ? 'Spot Healing' : kind === 'clone' ? 'Clone Stamp' : kind === 'healBrush' ? 'Healing Brush' : 'Blur', p.snapshot());
```

### src/engine/index.ts · Color Range, Quick Selection · _v0.65.0

colorRangeMask, selectColorRange, and the Quick Selection stroke. Nothing was removed.
### src/engine/index.ts · rollback, align, distribute, modify selection · _v0.66.0

`edit` catches a throwing operation at the outermost level (nested edits rethrow) and `rollBack` writes its patches back in reverse, restores the snapshot, keeps the failure in `failures` and raises a notice. `regionEdit` writes its region back when `apply` throws. `alignItems` measures each selected root by its layers' visible pixels; `shiftItems` moves them by whole pixels with masks following; `alignLayers` and `distributeLayers` are the menu commands. `modifySelection` does Feather (Gaussian, sigma half the radius), Border (grown less shrunk by half the width) and Smooth (majority over a square, through a summed-area table). Removed:

```ts
    try { ok = fn(p); } finally { p.history.end(p.snapshot()); }
      apply({ raster, target: pick.target, rect, cover });
  selectionAmounts = { expand: 1, contract: 1 };
```
### src/engine/index.ts · Sharpen stroke · _v0.68.0

`retouch.smearMode` and `beginRetouchStroke` take `sharpen`, whose texture is `sharpenSample` of the layer at a radius from the brush size, recorded as Sharpen. Removed:

```ts
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'smudge' | 'liquify' } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur' };
  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur' | 'healBrush' | 'dodge' | 'burn' | 'sponge', pt: Pt, shift: boolean): boolean {
    p.history.begin({ heal: 'Spot Healing', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge' }[kind], p.snapshot());
```

### src/app.ts · filter menu · _v0.68.0 (logged here beside the engine entry)

Lens Blur and Smart Sharpen on the Filter menu. Removed:

```ts
  const FILTERS: FilterKind[] = ['develop', 'gaussianBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'unsharpMask'];
```

## src/engine/develop.ts

### src/engine/develop.ts · new · _v0.36.0

formnodal's develop core from the owner's sonny extension for NodeMode: the per-pixel pass as written, en and em dashes in comments normalised; `detailPass`, `clarityPass` and `developImage` keep formnodal's detail formulas with sonny's Gaussian in place of a canvas blur filter. Nothing was removed.

### src/engine/develop.ts · header · _v0.38.0

The owner confirmed formnodal is their own build. Removed:

```ts
 *  Gaussian, so the whole filter runs in the preview worker. formnodal's LICENSES.md names the MIT-licensed reference
 *  its adjustment algorithms derive from; that project's notice belongs in sonny's NOTICE. */
```

## src/engine/kernels.ts

### src/engine/kernels.ts · adjustment and wand kernels · _v0.1.0

Created in _v0.1.0.

### src/engine/kernels.ts · Kernel · _v0.2.0

Kernels take an optional context with the region's document origin and scale, which Grain needs. Removed:

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

### src/engine/kernels.ts · wandMask sample radius · _v0.13.0

The color to match averages the pixels within `sampleRadius` of the click, clipped to the image, as the Sample Size does. Removed:

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

### src/engine/kernels.ts · rewritten independently · _v0.34.0

Every kernel replaced with a new implementation of the standard method: Levels as composed clipped power curves, Curves as Fritsch and Butland monotone cubics in Horner form, Exposure through the IEC 61966-2-1 sRGB transfer, a Rec. 709 gradient map, and the Magic Wand's contiguous fill as Heckbert's segment seed fill. Exports and settings meanings unchanged; outputs identical to the replaced code in randomized side-by-side runs. The removed code is not quoted here, deliberately: it is the translated code this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.33.0.
### src/engine/kernels.ts · parametric kernels · _v0.66.0

`adjustmentKernel` returns `paramKernel` for the parametric kinds. Nothing was removed.

## src/engine/matte.ts

### src/engine/matte.ts · refineMatte, guidedFilter, boxMean, levelsOf · _v0.9.0

Ported from the `SubjectRemoval.refined` and `GuidedMatte`. `boxMean` is the running-sum box mean with edge clamping; `guidedFilter` is He, Sun and Tang's filter with epsilon 1e-4; `refineMatte` applies the order (Refine, then Shift Edge as a clamped Gaussian of half the reach cut hard at 0.25 or 0.75, then Contrast as a stretch about middle gray) with radii in layer pixels scaled for previews, and returns the mask unchanged for Basic; `levelsOf` reads a mask's gray or a guide's luminance over black. Checked against an independent NumPy port to 6.3e-5.

### src/engine/matte.ts · rewritten independently · _v0.35.0

The guided filter, prefix-sum box means and a clamped Gaussian, matching the replaced output within 0.00016. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

## src/engine/project.ts

### src/engine/project.ts · per-tab project record · _v0.1.0

Created in _v0.1.0.

## src/engine/retouch.ts

### src/engine/retouch.ts · spotHeal, contentFill, WarpStroke · _v0.3.0

Ported line for line from the original C and Swift sources. `spotHeal` from `HealPixels.c`: ring matching over 5 distances and 24 angles (2 distances with a stronger nearness bias for Proximity Match), a plus or minus 3 px alignment refine, a multigrid smooth solve over the spot, and Create Texture's grain matched to the ring's detail. `contentFill` from `ContentFill.c`: a patch search growing inward from the selection edge. `WarpStroke` from `SmudgeLiquify.swift`: Liquify's forward warp and Smudge's carried color, dab by dab on a document-size premultiplied copy. C's `lround` rounds halves away from zero, so the port does too rather than using `Math.round`.

### src/engine/retouch.ts · rewritten independently · _v0.35.0

Spot Healing by ring-matched source search and a Poisson-style harmonic correction solved coarse to fine; Create Texture from the edge's harmonic interpolation plus matched grain; Content-Aware Fill as Criminisi-style exemplar inpainting; Smudge and Liquify on a raised-cosine brush with evenly carried spacing, Smudge laying paint by strength and picking up canvas by its complement. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

### src/engine/retouch.ts · fillTransparent · _v0.38.0

The harmonic membrane pre-fills see-through pixels for generative requests. Nothing was removed.

### src/engine/retouch.ts · healWindow, healFromSource · _v0.42.0

Spot Healing's window setup shared as `healWindow`; `healFromSource` heals from a chosen offset through the harmonic membrane, reading the source from the original pixels. Removed:

```ts
/** Spot Healing: heals the pixels under `coverage` (0 to 255 per pixel) in premultiplied `rgba`, blended by coverage
 *  times `opacity`. Returns false when there is no spot or nothing around it to heal from. */
export function spotHeal(rgba: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, opacity: number, mode: HealMode, seed: number): boolean {
  if (x1 < 0) return false;
  if (!win.ring.length) return false;
```

## src/engine/selection.ts

### src/engine/selection.ts · selection masks, outline tracer · _v0.1.0

Created in _v0.1.0.

### src/engine/selection.ts · rewritten independently · _v0.35.0

`traceOutline` merges boundary edges into runs in one row-major sweep over differing row spans and links them into loops, right turns first; exact against the mask in every test, 12 ms for a 2000 by 1500 mask. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

## src/engine/stroke.ts

### src/engine/stroke.ts · brush stroke engine · _v0.1.0

Created in _v0.1.0.

### src/engine/stroke.ts · texture and coverageAlpha · _v0.3.0

A stroke can paint a document-space texture at an offset instead of a color, which is how Clone Stamp and the Blur mode of Smear work: a canvas point takes the sample at itself plus the offset. `coverageAlpha` returns the accumulated coverage clipped by the selection, which Spot Healing heals. Nothing was removed.

### src/engine/stroke.ts · PixelStroke · lerp mode · _v0.16.0

A `lerp` flag for alpha-coded masks: compose erases by the coverage, then adds the coverage-masked sample with `lighter`, so out = old x (1 - c) + sample x c. Removed:

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

### src/engine/stroke.ts · rewritten independently · _v0.35.0

The brush tip computed per pixel (exact raised cosine; soft fringes about 15% lighter than the old eight-segment approximation), spacing, paint layer and composing rewritten. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

### src/engine/stroke.ts · surface pool · _v0.55.0

Stroke surfaces taken from and given back to a small pool, warmed on request. Removed:

```ts
    this.working = createSurface(raster.width, raster.height);
    this.paint = createSurface(raster.width, raster.height);
    this.masked = selection ? createSurface(raster.width, raster.height) : null;
      this.textured ??= createSurface(this.raster.width, this.raster.height);
```

## src/engine/surface.ts

### src/engine/surface.ts · canvases and rasters · _v0.1.0

Created in _v0.1.0.

### src/engine/surface.ts · rasterOf · _v0.20.0

A canvas-to-raster registry, filled by the `Raster` constructor, so the renderer, given only a canvas, can read its raster's version for the halving cache. Removed:

```ts
  constructor(readonly width: number, readonly height: number) {
    this.canvas = createSurface(width, height);
    this.ctx = ctxOf(this.canvas);
  }
```

## src/engine/transform.ts

### src/engine/transform.ts · handles and drag math · _v0.1.0

Created in _v0.1.0.

### src/engine/transform.ts · placing, following · _v0.17.0

the `LayerTransform.placing` (a unit-square map back to a rotated, maybe flipped rectangle, keeping the flip, sampling and nearest rotation) and `following(from:to:)` (a placement carried along as a box moves), as pure functions; placing round-trips rotated and flipped transforms to 2.8e-14. Removed:

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

### src/engine/transform.ts · rewritten independently · _v0.35.0

Free Transform drags and the affine decomposition in unit-vector form; identical to 1e-13. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

## src/engine/tree.ts

### src/engine/tree.ts · layer hierarchy walks · _v0.1.0

Created in _v0.1.0.

## src/engine/types.ts

### src/engine/types.ts · document types, blend modes, limits · _v0.1.0

Created in _v0.1.0.

### src/engine/types.ts · BLEND_MODES, REF_BLEND_MODES, compositeOp · _v0.33.0

Soft Light, Hard Light, Exclusion and Linear Dodge (Add, the canvas's `lighter`) join the modes, listed in Photoshop's menu order; `REF_BLEND_MODES` names the 13 a `.ref` project can hold. Removed:

```ts
export const BLEND_MODES: ReadonlyArray<{ id: BlendMode; label: string }> = [
  { id: 'normal', label: 'Normal' }, { id: 'multiply', label: 'Multiply' }, { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' }, { id: 'darken', label: 'Darken' }, { id: 'lighten', label: 'Lighten' },
  { id: 'difference', label: 'Difference' }, { id: 'color-dodge', label: 'Color Dodge' }, { id: 'color-burn', label: 'Color Burn' },
  { id: 'hue', label: 'Hue' }, { id: 'saturation', label: 'Saturation' }, { id: 'color', label: 'Color' }, { id: 'luminosity', label: 'Luminosity' },
];

export function compositeOp(mode: BlendMode): GlobalCompositeOperation { return mode === 'normal' ? 'source-over' : mode; }
```

### src/engine/types.ts · LayerEffects · _v0.39.0

`Layer.effects`, the three effect types, `defaultEffects`, `effectsActive` and `effectsFromData`, which checks and clamps saved data. Nothing was removed.

### src/engine/types.ts · inner effects, TextSpec, the Type tool id · _v0.40.0

Inner Shadow, Inner Glow and Color Overlay join `LayerEffects` with defaults and checked loading; `Layer.text` and `TextSpec`; `type` joins the tool ids. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'eyedropper' | 'hand' | 'zoom' | 'idle';
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke');
```

### src/engine/types.ts · tool ids · _v0.42.0

`healingBrush` and `patch` join the tool ids. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'idle';
```

### src/engine/types.ts · tool ids · _v0.43.0

`pen` and `directSelect` join the tool ids. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'idle';
```

### src/engine/types.ts · SmartObject, SmartFilter · _v0.45.0

Smart object types and a checked reader for saved filters. Nothing was removed.

### src/engine/types.ts · VectorLayer · _v0.47.0

The shape-layer type. Nothing was removed.

### src/engine/types.ts · ShapeStyle · _v0.48.0

Optional fill and a stroke on shape layers. Removed:

```ts
/** A shape layer: a path filled with a colour. `origin` is where its raster was rendered, so a later move of the layer
 *  can carry the path along. */
export interface VectorLayer { path: import('./paths').VectorPath; fill: RGB; origin: Pt }
```

### src/engine/types.ts · warp · _v0.52.0

A smart object keeps its warp and the transform it was rendered at. Removed:

```ts
export interface SmartObject { source: Raster; filters: SmartFilter[] }
```

### src/engine/types.ts · Gradient Overlay · _v0.58.0

The effect type, its defaults and checked reading. Removed:

```ts
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay');
```

### src/engine/types.ts · Bevel and Emboss · _v0.59.0

The effect type, its defaults and checked reading. Removed:

```ts
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay'), go = part('gradientOverlay');
```

### src/engine/types.ts · Satin · _v0.60.0

The effect type, its defaults and checked reading. Removed:

```ts
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled || fx.bevel.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay'), go = part('gradientOverlay'), bv = part('bevel');
```

### src/engine/types.ts · Pattern Overlay · _v0.61.0

The effect type, its defaults and checked reading. Removed:

```ts
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect; satin: SatinEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled || fx.bevel.enabled || fx.satin.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay'), go = part('gradientOverlay'), bv = part('bevel'), sa = part('satin');
```

### src/engine/types.ts · tool ids · _v0.64.0

Four tool ids. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'idle';
```

### src/engine/types.ts · tool id · _v0.65.0

The quickSelect tool id. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'idle';
```
### src/engine/types.ts · 27 blend modes, parametric kinds · _v0.66.0

`BlendMode` and `BLEND_MODES` hold all 27 of Photoshop's modes in its order; `canvasBlend` tells the renderer which the canvas does itself, and `compositeOp` gives `source-over` for the rest so effect blends from PSD never set an invalid operation. `AdjustmentKind` takes in `ParamKind`. Removed:

```ts
  | 'linear-dodge' | 'soft-light' | 'hard-light' | 'exclusion';
/** Photoshop's menu order, grouped darken, lighten, contrast, inversion, component; the modes the browser canvas
 *  composites natively. Linear Dodge (Add) is the canvas's `lighter`. */
  { id: 'normal', label: 'Normal' },
  { id: 'darken', label: 'Darken' }, { id: 'multiply', label: 'Multiply' }, { id: 'color-burn', label: 'Color Burn' },
  { id: 'lighten', label: 'Lighten' }, { id: 'screen', label: 'Screen' }, { id: 'color-dodge', label: 'Color Dodge' }, { id: 'linear-dodge', label: 'Linear Dodge (Add)' },
  { id: 'overlay', label: 'Overlay' }, { id: 'soft-light', label: 'Soft Light' }, { id: 'hard-light', label: 'Hard Light' },
  { id: 'difference', label: 'Difference' }, { id: 'exclusion', label: 'Exclusion' },
export function compositeOp(mode: BlendMode): GlobalCompositeOperation { return mode === 'normal' ? 'source-over' : mode === 'linear-dodge' ? 'lighter' : mode; }
export type AdjustmentKind = 'hsv' | 'levels' | 'curves' | 'exposure' | 'gradientMap' | 'grain';
```

## src/engine/viewport.ts

### src/engine/viewport.ts · zoom and pan · _v0.1.0

Created in _v0.1.0.

## src/extensions/registry.ts

### src/extensions/registry.ts · tool contract and registry · _v0.1.0

Created in _v0.1.0.

### src/extensions/registry.ts · OptionSpec number · _v0.4.0

Adds the `number` option kind: an editable field with optional min, max, step and unit, whose `get` returns null when there is nothing to edit. Nothing was removed.

### src/extensions/registry.ts · select option · _v0.41.0

A `select` option kind. Nothing was removed.

### src/extensions/registry.ts · toolsForKey · _v0.42.0

Every tool on a key, for Shift cycling. Nothing was removed.

## src/extensions/tools/brush-common.ts

### src/extensions/tools/brush-common.ts · drawBrushCursor, brushKeys, brushOptions · _v0.3.0

The brush cursor, the size, hardness and opacity keys, and the brush options shared by Brush, Spot Healing, Clone Stamp and Smear, which share one set of brush settings.

### src/extensions/tools/brush-common.ts · drawBrushCursor · pinned circle · _v0.22.0

During a right-drag the circle draws at the press point (`engine.tipDrag.at`). Removed:

```ts
export function drawBrushCursor(ctx: ToolContext, g: CanvasRenderingContext2D, pt: Pt | null): void {
  if (!pt) return;
```

## src/extensions/tools/brush.ts

### src/extensions/tools/brush.ts · brush and eraser · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/brush.ts · brushTool · overlay pinned during a tip drag · _v0.22.0

Brush's own circle also draws at the press point during a right-drag. Removed:

```ts
    if (!hoverPt) return;
```

```ts
    const c = v.toScreen(hoverPt);
```

## src/extensions/tools/clone.ts

### src/extensions/tools/clone.ts · cloneTool · _v0.3.0

Alt-click sets the source; the crosshair follows the sample point exactly as a click would stamp; Aligned and Sample all layers in the options bar.

### src/extensions/tools/clone.ts · cloneTool · preview in the circle · _v0.27.0

Between strokes, with Option not held (`picking`), the overlay draws `clonePreview` under the brush circle at the brush opacity. Removed:

```ts
let hover: Pt | null = null;
```

```ts
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
```

```ts
  overlay(ctx, g) {
    drawBrushCursor(ctx, g, hover);
```
### src/extensions/tools/clone.ts and src/engine/index.ts · Clone Source transforms · _v0.72.0

Options for Source scale, Source angle, Flip horizontal and Flip vertical. In the engine, `retouch` holds them; `cloneTransform(pivot)` builds the matrix about the sample point; `beginRetouchStroke` draws the Clone Stamp's source through it; `clonePreview` shows it and keys its cache on it. The Healing Brush is left untransformed. Removed from `engine/index.ts` (nothing from `clone.ts`):

```ts
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, sameTransform, scaling, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify' } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur' };
    const key = [sp.x.toFixed(2), sp.y.toFixed(2), d, this.brush.hardness, side, this.retouch.cloneSampleAll, l.id, p.history.revision].join('|');
    const s = createSurface(side, side), c = ctxOf(s), per = side / d;
    const view = mul(scaling(per, per), translation(d / 2 - sp.x, d / 2 - sp.y));
```

## src/extensions/tools/crop.ts

### src/extensions/tools/crop.ts · cropTool · _v0.2.0

Crop frame with create, move and resize modes, Alt to keep the center, nine ratio presets and snapping to the canvas edges. Enter crops through `Engine.cropTo`, which is Canvas Size with an explicit offset, as the `CanvasSizeOptions.contentOffset`. Snapping to layer edges is not ported yet.

## src/extensions/tools/eyedropper.ts

### src/extensions/tools/eyedropper.ts · color sampling · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/eyedropper.ts · eyedropperTool · sample ring · _v0.11.0

Remembers the color a drag starts from, shows the sample ring while it samples, clears it on release or cancel, and adds the Sample Ring option. Removed:

```ts
import { hexOf } from '../../engine';
```

```ts
  down(ctx, p) { if (p.button === 0) sample(ctx, p); },
```

### src/extensions/tools/crop.ts · snapTargets, nearest, snap · _v0.30.0

the CropSnap and cropSnapTargets: canvas edges and visible pixel layers' rounded bounds, applied per drag mode (create and resize on the pointer's side, moves keep their size, fixed ratios only snap moves). Removed:

```ts
function snap(ctx: ToolContext, r: Rect): Rect {
  const d = ctx.engine.current?.doc;
  if (!d) return r;
  const tol = 8 / ctx.view().zoom, n = norm(r);
  let x = n.x, y = n.y, w = n.w, h = n.h;
  if (Math.abs(x) < tol) { w += x; x = 0; }
  if (Math.abs(y) < tol) { h += y; y = 0; }
  if (Math.abs(x + w - d.width) < tol) w = d.width - x;
  if (Math.abs(y + h - d.height) < tol) h = d.height - y;
  return { x, y, w, h };
}
```

```ts
    if (!ratio && drag.mode !== 'move') frame = snap(ctx, frame);
```

## src/extensions/tools/gradient.ts

### src/extensions/tools/gradient.ts · gradientTool · _v0.2.0

Pending gradient with draggable ends and Shift for 45 degree steps; shape, colors, reverse and opacity re-render it live. Enter applies, Escape cancels, and a click without a line leaves nothing pending.

## src/extensions/tools/hand.ts

### src/extensions/tools/hand.ts · panning · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/heal.ts

### src/extensions/tools/heal.ts · healTool · _v0.3.0

Paint over a spot; it heals on release in the chosen type: Content-Aware, Create Texture or Proximity Match.

## src/extensions/tools/index.ts

### src/extensions/tools/index.ts · built-in tool list · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/index.ts · registerBuiltinTools · _v0.2.0

Registers Crop, Gradient and Shape in the rail order. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, brushTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · registerBuiltinTools · _v0.3.0

Registers Spot Healing, Clone Stamp and Smear, completing the fourteen tools. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, gradientTool, shapeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · Type tool · _v0.40.0

Registers the Type tool. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, cloneTool, smearTool, gradientTool, shapeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · register · _v0.42.0

Registers the Healing Brush and Patch. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, cloneTool, smearTool, gradientTool, shapeTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · register · _v0.43.0

Registers the Pen and Direct Selection. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, healingBrushTool, patchTool, cloneTool, smearTool, gradientTool, shapeTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · tools registered · _v0.64.0

The four tools registered. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, healingBrushTool, patchTool, cloneTool, smearTool, gradientTool, shapeTool, directSelectTool, penTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · tool registered · _v0.65.0

Quick Selection registered before Magic Wand. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, directSelectTool, penTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

## src/extensions/tools/lasso.ts

### src/extensions/tools/lasso.ts · freehand and polygonal lasso · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/lasso.ts · lassoTool · Anti-alias, nudging · _v0.13.0

Honors `selectionAntialiased` and gains the Anti-alias option; arrow keys nudge the outline when no polygon is open. Removed:

```ts
import { modeFor, modeSegment } from './select-common';
```

```ts
    if (!active || ctx.engine.lassoKind !== 'polygonal') return false;
```

```ts
  });
  e.applySelection(mask, mode, e.lassoKind === 'polygonal' ? 'Polygonal Lasso' : 'Lasso');
```

## src/extensions/tools/marquee.ts

### src/extensions/tools/marquee.ts · rectangle and ellipse marquee · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/marquee.ts · marqueeTool · autoscroll, re-arm, Anti-alias, nudging · _v0.13.0

Drags go through `follow`, which pointer moves and the autoscroll ticks (`scrollDelta`, `autoscroll`, `stopScroll`) share; the box keeps the marqueeConstrainArmed rule; masks honor `selectionAntialiased`, with the Anti-alias option; arrow keys nudge the outline. Removed:

```ts
import { modeFor, modeSegment } from './select-common';
```

```ts
  move(ctx, p) {
    if (moving) { ctx.engine.updateSelectionShift(p.doc.x - moving.x, p.doc.y - moving.y); return; }
    if (!draft) return;
    draft.point = p.doc;
    draft.square = p.shift && !draft.shiftAtPress;
    draft.center = p.alt && !draft.altAtPress;
    ctx.engine.emit('overlay', null);
  },
```

```ts
    });
    e.applySelection(mask, d.mode, ellipse ? 'Elliptical Marquee' : 'Rectangular Marquee');
```

## src/extensions/tools/move.ts

### src/extensions/tools/move.ts · move and transform handles · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/move.ts · moveTool · inspector, guides, pixel moves · _v0.4.0

The readouts become editable X, Y, W, H, Scale and Angle fields plus Sampling and a Snap toggle; the overlay draws dashed snap guides; a drag inside the selection moves its pixels (Alt duplicates, Shift keeps one axis) and Escape cancels it in `keydown`, since `stage.cancelTool` is not wired to any key. Removed, the readouts:

```ts
      { kind: 'readout', label: 'X', get: () => (t() ? fmt(t()!.x) : '') },
      { kind: 'readout', label: 'Y', get: () => (t() ? fmt(t()!.y) : '') },
      { kind: 'readout', label: 'W', get: () => (t() ? fmt(t()!.w) : '') },
      { kind: 'readout', label: 'H', get: () => (t() ? fmt(t()!.h) : '') },
      { kind: 'readout', label: 'Angle', get: () => (t() ? `${fmt(t()!.rotation)}°` : '') },
```

Removed, the pointer handlers:

```ts
  down(ctx, p) {
    if (p.button !== 0) return;
    const e = ctx.engine;
    if (p.mod || e.autoSelect) { const id = e.layerAt(p.doc); if (id) e.selectLayer(id); }
    const m = hit(ctx, p);
    if (m) e.beginTransform(m, p.doc);
  },
  move(ctx, p) { ctx.engine.updateTransform(p.doc, p.shift, p.alt); },
  up(ctx) { ctx.engine.endTransform(); },
  cancel(ctx) { ctx.engine.cancelTransform(); },
```

Removed, the hint:

```ts
  hint: () => 'Drag to move · Handles resize · Outside a corner rotates · Shift constrains · Alt resizes from the center · Cmd or Ctrl picks the layer under the pointer · Arrows nudge · 1-0 set layer opacity',
```

### src/extensions/tools/move.ts · moveTool · floating selection · _v0.5.0

Enter applies a floating selection and Escape cancels it (a first Escape still cancels a handle drag in progress); the hint describes the float while it is open. Removed, the hint:

```ts
  hint: () => 'Drag to move · Drag inside a selection to move its pixels, Alt to duplicate them · Handles resize · Outside a corner rotates · Shift constrains · Alt resizes from the center · Cmd or Ctrl picks the layer under the pointer · Arrows nudge · 1-0 set layer opacity',
```

### src/extensions/tools/move.ts · editable · unlinked mask box · _v0.15.0

The handles sit on the mask's box when the Move tool transforms an unlinked mask. Removed:

```ts
  return ctx.engine.transformEdit?.draft ?? l.transform;
```

### src/extensions/tools/move.ts · editable · group box · _v0.17.0

The handles sit on the group box when several layers or a folder are selected, before the single-layer and mask cases. Removed:

```ts
  const l = ctx.engine.activeLayer;
  if (!l || l.isGroup || !l.raster) return null;
  return ctx.engine.transformEdit?.draft ?? (ctx.engine.transformsMask(l) ? l.mask?.placement ?? l.transform : l.transform);
```

### src/extensions/tools/move.ts · distortCorner, corner drags, Enter and Escape · _v0.21.0

Cmd on a corner handle begins a distortion; any corner of a pending one drags alone; Enter applies, Escape cancels; the overlay draws the distorted outline and its four handles. Removed:

```ts
    if (p.button !== 0) return;
    const e = ctx.engine;
    const sel = e.current?.selection;
```

```ts
  move(ctx, p) {
    if (pixelStart) {
```

## src/extensions/tools/select-common.ts

### src/extensions/tools/select-common.ts · modifier to selection mode · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/select-common.ts · nudgeSelectionKey · _v0.13.0

Arrow keys nudge the selection outline in the selection tools, 1 px or 10 with Shift, leaving Cmd, Ctrl and Alt arrows to other commands. Removed:

```ts
import type { OptionSpec, ToolPointer } from '../registry';
```

## src/extensions/tools/shape.ts

### src/extensions/tools/shape.ts · shapeTool · _v0.2.0

Rectangle and ellipse shape layers in the foreground color with a corner radius, Shift after starting for square, Alt for centered, Shift+U to switch shape. The layer keeps the `LayerShapeStyle` fields (`kind`, `red`, `green`, `blue`, `cornerRadius`).
### src/extensions/tools/shape.ts · seven shapes · _v0.69.0

Rectangle, Ellipse, Polygon, Star, Line, Arrow and Heart, Shift+U cycling all seven; path shapes go to `Engine.createPathShape`, lines along the drag with Shift snapping to 45 degrees (`snapped`); the overlay draws the real outline; options show only the rows the chosen shape uses. Removed:

```ts
  icon: (e) => (e.shapeSettings.kind === 'ellipse' ? 'circleTool' : 'rectTool'),
  hint: (e) => `Drag to draw ${e.shapeSettings.kind === 'ellipse' ? 'an ellipse' : 'a rectangle'} in the foreground color on a new shape layer · Shift after starting keeps it square · Alt after starting grows from the center · Shift+U switches shape`,
    if (r.w >= 1 && r.h >= 1) ctx.engine.createShape(r);
    ctx.engine.shapeSettings.kind = ctx.engine.shapeSettings.kind === 'ellipse' ? 'rectangle' : 'ellipse';
    const r = dragRect(draft.anchor, draft.point, draft.square, draft.center), v = ctx.view();
    const ellipse = ctx.engine.shapeSettings.kind === 'ellipse';
    const radius = Math.min(ctx.engine.shapeSettings.cornerRadius * v.zoom, (b.x - a.x) / 2, (b.y - a.y) / 2);
  options: (e) => [
    { kind: 'title', text: 'Shape' },
    { kind: 'segment', label: 'Shape', choices: [{ id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }], get: () => e.shapeSettings.kind, set: (v) => { e.shapeSettings.kind = v as 'rectangle' | 'ellipse'; e.emit('options', null); e.emit('tool', null); } },
    { kind: 'range', label: 'Corner radius', min: 0, max: 500, unit: 'px', get: () => e.shapeSettings.cornerRadius, set: (v) => { e.shapeSettings.cornerRadius = v; e.emit('options', null); } },
    { kind: 'readout', label: 'Color', get: () => hexOf(e.fg) },
  ],
```

## src/extensions/tools/smear.ts

### src/extensions/tools/smear.ts · smearTool · _v0.3.0

the Blur tool, labeled Smear: Liquify and Smudge run as warp strokes, Blur paints a softened sample; Strength is the brush opacity.
### src/extensions/tools/smear.ts · Sharpen mode · _v0.68.0

Sharpen joins Liquify, Blur and Smudge: its hint, the blur icon, dispatch to `beginRetouchStroke('sharpen')`, and the mode segment. Removed:

```ts
  icon: (e) => (e.retouch.smearMode === 'blur' ? 'blurTool' : 'smudge'),
    if (m === 'blur') ctx.engine.beginRetouchStroke('blur', p.doc, p.shift);
    { kind: 'segment', label: 'Mode', choices: [{ id: 'liquify', label: 'Liquify' }, { id: 'blur', label: 'Blur' }, { id: 'smudge', label: 'Smudge' }], get: () => e.retouch.smearMode, set: (v) => { e.retouch.smearMode = v as 'blur' | 'smudge' | 'liquify'; e.emit('options', null); e.emit('tool', null); } },
```

## src/extensions/tools/wand.ts

### src/extensions/tools/wand.ts · magic wand · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/wand.ts · wandTool · Sample Size, nudging · _v0.13.0

Adds the Sample Size choice (Point, 3 by 3, 5 by 5) and arrow-key nudging. Removed:

```ts
import { modeFor, modeSegment } from './select-common';
```

```ts
  hint: () => 'Click to select similar colors · Shift adds · Alt subtracts · Tolerance sets how similar',
```

## src/extensions/tools/zoom.ts

### src/extensions/tools/zoom.ts · zoom tool · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/zoom.ts · zoomTool · the scrub rate · _v0.20.0

Scrubbing doubles the zoom per 100 px dragged from a 3 px threshold. Removed:

```ts
    if (Math.abs(dx) > 3) drag.moved = true;
    if (drag.moved) ctx.engine.zoomTo(drag.z0 * Math.pow(2, dx / 160), drag.start);
```

## src/host.ts

### src/host.ts · HostLink · _v0.1.0

Follows the portal protocol from the NodeMode extension-portal docs: listener first, then `ready`, then `init`. Sends `plugin:[pluginId]:assign`; the host-side handler is not confirmed yet.

## src/io/api.ts

### src/io/api.ts · engine HTTP client · _v0.1.0

Created in _v0.1.0.

### src/io/api.ts · package · root folder · _v0.28.0

`package` takes an optional root folder name for the zip. Removed:

```ts
  async package(manifest: object, files: FilePart[]): Promise<Blob> {
    return (await request('/projects/package', { method: 'POST', body: form({ manifest: JSON.stringify(manifest) }, files) })).blob();
```

### src/io/api.ts · generative calls · _v0.37.0

`generativeStatus`, `saveGenerativeKey`, `forgetGenerativeKey` and `generativeFill`. Nothing was removed.

### src/io/api.ts · upscale · _v0.38.0

`upscale` added; the status carries the upscale model. Removed:

```ts
export interface GenerativeStatus { configured: boolean; source: 'environment' | 'settings' | null; fillModel: string; eraseModel: string }
```

## src/io/images.ts

### src/io/images.ts · image decoding with engine fallback · _v0.1.0

Created in _v0.1.0.

### src/io/images.ts · PSD as a project · _v0.42.0

`.psd` opens like a project. Removed:

```ts
export const PROJECT_ACCEPT = '.sonny,.ref,.zip';
export const isProjectFile = (f: File): boolean => /\.(sonny|ref|zip)$/i.test(f.name);
```

## src/io/project-io.ts

### src/io/project-io.ts · serialize and deserialize · _v0.1.0

Field names and labels come from the original `ProjectStore.swift`, `LayerTransform.swift`, `LayerAppearance.swift` and `LayerAdjustment.swift`, checked against the source. Masks are written as grayscale PNGs; `adjustment` and `shape` round-trip verbatim.

### src/io/project-io.ts · serializeRefProject · _v0.28.0

The document as a version 7 project, reshaped from `serialize` to pass the ProjectStore.validate (UUID ids, files named after them, plain folders, adjustment layers without pixels, non-empty names, clamped resolution), with notes for every change. Nothing was removed.

### src/io/project-io.ts · .ref blend rule · _v0.33.0

Blend modes outside `REF_BLEND_MODES` export to `.ref` as Normal, with a note. Nothing was removed.

### src/io/project-io.ts · effects · _v0.39.0

Effects save in `.sonny` and read back through `effectsFromData`; `.ref` export drops them with a note. Removed:

```ts
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform,
      blend: blendFromLabel(r.blendMode), mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
```

### src/io/project-io.ts · type in files · _v0.40.0

Live type saves in `.sonny` and reopens editable; `.ref` export notes it becomes pixels. Removed:

```ts
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData,
      blend: blendFromLabel(r.blendMode), effects: effectsFromData(r.effects), mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
```

### src/io/project-io.ts · smart objects · _v0.45.0

Saves and reads the source and stack; .ref drops them with a note. Removed:

```ts
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData,
  for (const r of records) { const a = str(r.imageFile), b = str(r.maskFile); if (a) names.add(a); if (b) names.add(b); }
      blend: blendFromLabel(r.blendMode), effects: effectsFromData(r.effects), text: textFromData(r.text, raster), mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
```

### src/io/project-io.ts · Work Path · _v0.46.0

The Work Path saved and read back; .ref leaves it out with a note. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid,
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom,
export async function serialize(doc: Doc, activeId: ID | null): Promise<{ manifest: Json; files: FilePart[] }> {
export async function serializeRefProject(doc: Doc, activeId: ID | null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>): Promise<{ doc: Doc; activeId: ID | null }> {
  return { doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers }, activeId: str(manifest.activeLayerID) };
```

### src/io/project-io.ts · paths and shape layers · _v0.47.0

Every path and shape layers saved and read back; .ref notes for both. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathData, pathFrom, type VectorPath,
export async function serialize(doc: Doc, activeId: ID | null, workPath: VectorPath | null = null): Promise<{ manifest: Json; files: FilePart[] }> {
  const pathRecord = pathData(workPath);
  if (pathRecord) manifest.workPath = pathRecord;
export async function serializeRefProject(doc: Doc, activeId: ID | null, workPath: VectorPath | null = null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
  if (pathData(workPath)) notes.push('The Work Path is left out; .ref projects have no paths.');
export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>): Promise<{ doc: Doc; activeId: ID | null; workPath: VectorPath | null }> {
      blend: blendFromLabel(r.blendMode), effects: effectsFromData(r.effects), text: textFromData(r.text, raster), smart, mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
  return { workPath: pathFrom(manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers }, activeId: str(manifest.activeLayerID) };
```

### src/io/project-io.ts · shape style · _v0.48.0

Fill and stroke saved and read back checked. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet,
    if (l.vector) r.vector = { fill: l.vector.fill, origin: l.vector.origin, subpaths: pathData(l.vector.path)?.subpaths ?? [] };
    const vp = r.vector && typeof r.vector === 'object' ? pathFrom(r.vector) : null, vf = obj(obj(r.vector).fill), vo = obj(obj(r.vector).origin);
    const vector = raster && vp && [vf.r, vf.g, vf.b, vo.x, vo.y].every((v) => typeof v === 'number' && Number.isFinite(v))
      ? { path: vp, fill: { r: num(vf.r, 0), g: num(vf.g, 0), b: num(vf.b, 0) }, origin: { x: num(vo.x, 0), y: num(vo.y, 0) } } : null;
```

### src/io/project-io.ts · timeline · _v0.49.0

Timelines saved and read back; .ref notes them. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB,
export async function serialize(doc: Doc, activeId: ID | null, paths: PathSet | null = null): Promise<{ manifest: Json; files: FilePart[] }> {
export async function serializeRefProject(doc: Doc, activeId: ID | null, paths: PathSet | null = null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>): Promise<{ doc: Doc; activeId: ID | null; paths: PathSet | null }> {
  return { paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers }, activeId: str(manifest.activeLayerID) };
```

### src/io/project-io.ts · warp · _v0.52.0

The warp saved and read back checked. Removed:

```ts
      r.smart = { filters: l.smart.filters.map(({ id, kind, settings, enabled }) => ({ id, kind, settings, enabled })) };
    const smart = raster && sourceImage ? { source: Raster.from(sourceImage, sourceImage.width, sourceImage.height), filters: smartFiltersFrom(r.smart) } : null;
```

### src/io/project-io.ts · carried patterns · _v0.61.0

Projects save the patterns their styles use and register them on open. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB, timelineData, timelineFrom, type Timeline,
```
### src/io/project-io.ts · parametric kinds · _v0.66.0

`KINDS` reads and writes the new adjustments by label; `serializeRefProject` leaves out layers whose kind is not in `REF_KINDS`, with a note. Removed:

```ts
const KINDS: Record<string, AdjustmentKind> = { 'Hue/Saturation': 'hsv', Levels: 'levels', Curves: 'curves', Exposure: 'exposure', 'Gradient Map': 'gradientMap', Grain: 'grain' };
  });
```

## src/main.ts

### src/main.ts · entry, calls startApp · _v0.1.0

Created in _v0.1.0.

## src/styles/dialogs.css

### src/styles/dialogs.css · dialogs and lists · _v0.1.0

Created in _v0.1.0.

### src/styles/dialogs.css · panel styles · _v0.2.0

Panel section, slider, histogram, curves and anchor-grid styles, with fixed canvas sizes so opening a panel never shifts layout. `.cv-dialog [hidden]` makes the hidden attribute win inside dialogs: a screenshot showed both Hue sliders at once because `.cv-field` sets `display: grid`.

### src/styles/dialogs.css · click-through scrim · _v0.7.0

`.cv-scrim-through` makes a dialog's scrim transparent and lets clicks reach the canvas while the dialog stays interactive, for eyedroppers. The rule is written as `#overlay-root > .cv-scrim.cv-scrim-through` because `#overlay-root > *` in `shell.css` sets `pointer-events: auto` and an ID selector outranks classes; without it a sampling click lands on the scrim, which closes the dialog. Nothing was removed.
### src/styles/dialogs.css · .cv-field.is-off · _v0.68.0

A field that is unavailable keeps its place and dims, so dialogs do not change height when a choice turns a control off (Smart Sharpen's Angle). Nothing was removed.

## src/styles/fonts.css

### src/styles/fonts.css · vendored Inter and JetBrains Mono · _v0.1.0

Created in _v0.1.0.

## src/styles/light-mode.css

### src/styles/light-mode.css · light theme adjustments · _v0.1.0

Created in _v0.1.0.

## src/styles/panels.css

### src/styles/panels.css · .cv-layer-mask · _v0.1.0

Removed: showing the mask thumbnail on demand pushed the layer name right, a measured layout shift. The slot is now always reserved and toggled with visibility; row cells sit in explicit grid columns.

```css
.cv-layer-mask { display: none; }
.cv-layer.has-mask .cv-layer-mask { display: block; }
```

### src/styles/panels.css · fx mark · _v0.40.0

The fx mark in muted italic. Nothing was removed.

### src/styles/panels.css · smart badge and dialog rows · _v0.45.0

Styles for the badge and the filter list. Nothing was removed.

### src/styles/panels.css · Paths panel · _v0.47.0

The Paths panel, its rows and the shape badge; the layers grid gains a row. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; min-height: 0; background: var(--bg-secondary); }
.cv-layer-smart { flex: none; color: var(--text-muted); line-height: 0; }
```

### src/styles/panels.css · shape dialog · _v0.48.0

Swatch and row styles for the dialog. Nothing was removed.

### src/styles/panels.css · Timeline · _v0.49.0

The Timeline section, frames and preview; the layers grid gains a row. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; min-height: 0; background: var(--bg-secondary); }
```

### src/styles/panels.css · drag marks · _v0.50.0

Drag and drop marks for frames. Nothing was removed.

### src/styles/panels.css · step list · _v0.53.0

Step rows, tools and the stop message. Nothing was removed.

### src/styles/panels.css · History panel · _v0.56.0

The History section and rows; the layers grid gains a row. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto auto; min-height: 0; background: var(--bg-secondary); }
```

### src/styles/panels.css · snapshot rows · _v0.57.0

Snapshot rows and their separation from the steps. Nothing was removed.
### src/styles/panels.css · History count width · _v0.68.0

Tabular figures and a fixed 10ch width for the History step count, ending the layout shift it caused on every step. Removed:

```css
.cv-history-count { color: var(--text-muted); font-size: var(--fs-11); }
```

## src/styles/scrollbars.css

### src/styles/scrollbars.css · scrollbars, loaded last · _v0.1.0

Created in _v0.1.0.

### src/styles/panels.css · color picker layout · _v0.10.0

`.cv-pick`, `.cv-pick-field`, `.cv-pick-strip`, `.cv-pick-side` and `.cv-pick-swatch` lay out the picker from existing spacing and radius tokens; `touch-action: none` keeps field and strip drags working with touch and pens. Nothing was removed.

### src/styles/panels.css · clipping cursor · _v0.14.0

`.cv-layer-rows.is-clip-zone` shows the `alias` cursor over a row's clipping zone while Option is held, the nearest standard cursor to the clipping cursor. Nothing was removed.

## src/styles/shell.css

### src/styles/shell.css · .cv-opt-group · _v0.1.0

Removed: option items could shrink below their content when the bar overflowed. Items are now `flex: none` and the bar scrolls.

```css
.cv-opt-group { display: flex; align-items: center; gap: var(--space-4); }
```

### src/styles/shell.css · .cv-tab · _v0.1.0

Removed: content-sized tabs moved their neighbors when a save renamed a project. Tabs are now a fixed 168 px. `.cv-scene` hands pointer input to the overlay canvas; `.cv-st-engine` reserves the engine readout width.

```css
.cv-tab { display: grid; grid-template-columns: 6px minmax(0, 1fr) 20px; align-items: center; column-gap: var(--space-2); flex: none; height: var(--ctl-md); max-width: 220px; padding: 0 var(--space-1) 0 var(--space-2); border: 1px solid transparent; border-radius: var(--radius); background: transparent; color: var(--text-secondary); font-size: var(--fs-12); cursor: default; }
```

### src/styles/shell.css · tab drop target · _v0.18.0

`.cv-tab.is-drop-target` tints a project tab with the accent while a layer drag would copy into it. Nothing was removed.

### src/styles/shell.css · .cv-mark · _v0.32.0

The app mark keeps its size in the title row. Nothing was removed.

### src/styles/shell.css · select and text box · _v0.41.0

Styles for the options-bar select and the canvas text box. Nothing was removed.

## src/styles/tokens.css

### src/styles/tokens.css · NodeMode tokens plus the sonny block · _v0.1.0

Created in _v0.1.0.

## src/ui/app-dialogs.ts

### src/ui/app-dialogs.ts · AboutDialog · _v0.1.0

Removed: a copyright line that did not match `LICENSE`.

```ts
 this.body.appendChild(el('<p class="cv-note">[licence line, redacted in 0.31.1]</p>'));
```

### src/ui/app-dialogs.ts · AboutDialog · app mark · _v0.32.0

The About title shows the app mark at 28 px. Removed:

```ts
    this.body.appendChild(el(`<div class="cv-welcome-title">${icon('paintbrush', 20)}sonny ${VERSION}</div>`));
```

### src/ui/app-dialogs.ts · the reference app notice in About · _v0.37.0

About sonny says sonny began as a port of the reference app and shows the MIT notice from `ui/notices.ts` in a fixed-height box. Nothing was removed.

## src/ui/brand.ts

### src/ui/brand.ts · brandMark · _v0.32.0

The app mark (the desktop icon and favicon artwork) as inline SVG: the source's style rules folded into attributes so nothing leaks into the page, and ids namespaced per copy. Nothing was removed.

## src/ui/commands.ts

### src/ui/commands.ts · command registry and key labels · _v0.1.0

Created in _v0.1.0.

### src/ui/commands.ts · onRun · _v0.44.0

A hook after each command runs, for recording. Nothing was removed.

## src/ui/dialogs.ts

### src/ui/dialogs.ts · Dialog.open · _v0.1.0

Removed: preferred a disabled button, so focus stayed outside the dialog and Escape never closed it. Focus now falls back to the dialog container, and `open()` re-appends the scrim so a later dialog stacks above an earlier one.

```ts
    (focus ?? this.scrim.querySelector<HTMLElement>('input, select, .cv-btn-primary') ?? q<HTMLElement>(this.scrim, '.cv-dialog')).focus();
```

## src/ui/dom.ts

### src/ui/dom.ts · setHtml · _v0.1.0

Removed: wrote markup straight into a live node. It now builds in a fresh template and calls `replaceChildren`, so no live container is ever rewritten.

```ts
  n.innerHTML = html;
```

## src/ui/icons.ts

### src/ui/icons.ts · 80 NodeMode icons, verbatim · _v0.1.0

Created in _v0.1.0.

### src/ui/icons.ts · typeTool · _v0.40.0

An inline currentColor T. Nothing was removed.

### src/ui/icons.ts · healBrushTool, patchTool · _v0.42.0

Two inline currentColor icons. Nothing was removed.

### src/ui/icons.ts · penTool, directSelectTool · _v0.43.0

Two inline currentColor icons. Nothing was removed.

### src/ui/icons.ts · smartObject · _v0.45.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · hand · _v0.48.0

The Hand tool icon replaced with the owner-supplied Remix Icon cursor-hand. Removed:

```ts
  hand: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 13c-.7 0-1.4.4-1.7 1l-.7-6.4c-.1-.9-.9-1.6-1.8-1.6-.9 0-1.7.7-1.8 1.6V3.2c0-1-.8-1.8-1.8-1.8-1 0-1.8.8-1.8 1.8v5.4L8.1 8C7.2 7.7 6.2 8.2 5.9 9.1c-.3.9.2 1.9 1.1 2.2l4 1.3v7.3c0 1.1.9 2 2 2h5c1.1 0 2-.9 2-2v-4.9c0-1.1-.9-2-2-2z"/></svg>`,
```

### src/ui/icons.ts · play · _v0.49.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · tween · _v0.50.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · history · _v0.56.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · camera · _v0.57.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · tool icons · _v0.64.0

Four Phosphor icons. Nothing was removed.

### src/ui/icons.ts · tool icon · _v0.65.0

The Quick Selection icon. Nothing was removed.

## src/ui/layers.ts

### src/ui/layers.ts · LayersPanel.bindRows · pointerdown · _v0.1.0

Removed: capturing the pointer on press retargeted `click` and `dblclick` to the list, which broke rename and folder disclosure. Capture now starts when a drag passes 4 px.

```ts
      rows.setPointerCapture(e.pointerId);
```

### src/ui/layers.ts · bindRows · dblclick · _v0.2.0

Double-clicking an adjustment layer's row outside the name dispatches `cv:edit-adjustment` for the app to open its editor. Removed:

```ts
      if (row?.dataset.id && t.closest('.cv-layer-name')) this.startRename(row.dataset.id);
```

### src/ui/layers.ts · LayersPanel · Option-click clipping, Option-drag mask copy · _v0.14.0

With Option held, the bottom quarter of a row (`inClipZone`) shows the clipping cursor and a click there toggles that layer's clipping mask; an Option-drag from a mask thumbnail carries `maskFrom`, targets a whole non-folder row, and calls `copyMask` on release. Removed:

```ts
  private drag: { id: ID; ids: ID[]; startY: number; pointerId: number; started: boolean; wasSelected: boolean; target: { id: ID; where: Where } | null } | null = null;
```

```ts
      this.drag = { id, ids, startY: e.clientY, pointerId: e.pointerId, started: false, wasSelected: wasSelected && !mod && !e.shiftKey, target: null };
```

```ts
      if (d.started && d.target) this.engine.moveLayers(d.ids, d.target.id, d.target.where, e.altKey);
```

### src/ui/layers.ts · LayersPanel · drag onto a project tab · _v0.18.0

A row dragged over another project's tab highlights it (`showTabDrop`) and, released there, calls `copyLayerToProject`; mask drags never target tabs. Removed:

```ts
target: { id: ID; where: Where } | null; maskFrom: ID | null } | null = null;
```

```ts
wasSelected: wasSelected && !mod && !e.shiftKey, target: null, maskFrom };
```

```ts
      if (d.started && d.target) {
```

### src/ui/layers.ts · fx mark, type rows · _v0.40.0

The fx mark updated in place; double-clicking it opens Layer Style, and double-clicking a type row edits its text. Removed:

```ts
import { BLEND_MODES, hierarchy, type Engine, type HierarchyEntry, type ID, type Layer, type Raster } from '../engine';
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span></span></div>`);
      if (t.closest('.cv-layer-name')) this.startRename(row.dataset.id);
```

### src/ui/layers.ts · smart badge · _v0.45.0

The smart-object badge and its double-click. Removed:

```ts
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span><span class="cv-layer-fx" hidden title="Layer style">fx</span></span></div>`);
```

### src/ui/layers.ts · shape badge · _v0.47.0

The shape-layer badge. Removed:

```ts
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span><span class="cv-layer-fx" hidden title="Layer style">fx</span><span class="cv-layer-smart" hidden title="Smart object: double-click for its filters">${icon('smartObject', 12)}</span></span></div>`);
```

### src/ui/layers.ts · shape badge · _v0.48.0

Double-clicking the shape badge opens its fill and stroke. Removed:

```ts
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span><span class="cv-layer-fx" hidden title="Layer style">fx</span><span class="cv-layer-smart" hidden title="Smart object: double-click for its filters">${icon('smartObject', 12)}</span><span class="cv-layer-vector" hidden title="Shape layer">${icon('penTool', 12)}</span></span></div>`);
```

## src/ui/menu.ts

### src/ui/menu.ts · popup menus and menubar · _v0.1.0

Created in _v0.1.0.

### src/ui/menu.ts · MenuDef, MenuBar · items resolved on open · _v0.23.0

A menu's `items` may be a function (`itemsOf`), resolved at construction and on every open, so File's Open Recent section tracks the list; `setItems` still skips unchanged lists. Removed:

```ts
export interface MenuDef { label: string; items: MenuItem[] }
```

```ts
  private readonly menus: Array<{ btn: HTMLButtonElement; menu: PopupMenu }> = [];
```

```ts
      menu.setItems(def.items);
```

```ts
      this.menus.push({ btn, menu });
```

## src/ui/options.ts

### src/ui/options.ts · OptionsBar.build · button · _v0.1.0

Removed: `q(n, 'span')` returned the icon box, so the label replaced the icon and overflowed its 14 px width. The label now has its own `.cv-btn-label` span.

```ts
        const n = el<HTMLButtonElement>(`<button class="cv-btn cv-btn-ghost" type="button">${spec.icon ? icon(spec.icon, 14) : ''}<span></span></button>`);
        setText(q(n, 'span'), spec.label);
```

### src/ui/options.ts · OptionsBar · number fields · _v0.4.0

Builds `number` options as inputs that commit on Enter or blur exactly once (a relative field such as Scale would otherwise apply twice, since Enter blurs and blur fires `change`), restore the last committed value on Escape, and never overwrite a field while it has focus. Nothing was removed.

### src/ui/options.ts · select option · _v0.41.0

Renders the `select` option. Nothing was removed.

## src/ui/palette.ts

### src/ui/palette.ts · stage colors from tokens · _v0.1.0

Created in _v0.1.0.

## src/ui/panels/adjust-panel.ts

### src/ui/panels/adjust-panel.ts · AdjustPanel · _v0.2.0

Panel for all six adjustments. Layer mode edits live inside one undo step (`beginLive`, `commitLive`, `cancelLive`); image mode previews, then applies through the selection. Working data is deep-cloned on open so live edits never touch the undo snapshot. The Curves editor draws its curve with `curvesKernel` itself, so the graph and the render cannot disagree. Hue/Saturation band handles, eyedroppers and targeted drag are not built yet.

### src/ui/panels/adjust-panel.ts · autoLevels, buildLevels · _v0.6.0

`autoLevels` ports the `LevelsAuto` as a pure function of `histogram()`: each end clips 0.1% of a channel; Contrast sets one master interval across R, G and B, Color sets each channel, and Color + neutral midtones also sets each channel's gamma so its stretched mean maps to middle gray, clamped 0.1 to 9.99. The Levels section gains an Auto choice under the histogram that applies a mode through the live preview and resets to Choose. Removed:

```ts
    node.append(channel.el, canvas, black.el, gamma.el, white.el, outB.el, outW.el);
```

### src/ui/panels/adjust-panel.ts · Levels eyedroppers · _v0.7.0

A Sample choice (Off, Black point, Gray point, White point) under Auto turns an eyedropper on: `startSampling` makes the scrim click-through and takes stage clicks in a capture-phase listener before any tool sees them, and `applySample` ports the `LevelsSettings.sampling` (all three channels calibrated together, the master range reset, the gray point setting each channel's gamma). A `close` override ends sampling whichever way the panel closes. Removed:

```ts
    node.append(channel.el, canvas, auto.el, black.el, gamma.el, white.el, outB.el, outW.el);
```

### src/ui/panels/adjust-panel.ts · Hue/Saturation bands, eyedroppers, targeted adjustment · _v0.8.0

The Hue/Saturation section gains the spectrum editor (hues as they are on top, as the adjustment leaves them below through `hueResponse` and `hsvAdjust`, the selected range's four handles between, dragged by nearest circular distance with pointer capture, the degrees beneath), a Sample choice (Sample, Add, Remove) and a Targeted adjustment toggle. Sampling is generalized to named modes with per-row resets so the choices stay exclusive; `sampleHue` reads the hue from the composite (none for near-neutral pixels) and `beginTarget` picks the range that most claims it and drags saturation, or hue with Cmd or Ctrl, half a unit per screen pixel, its window listeners always removed by `stopSampling`. Removed, the Levels-only sampling:

```ts
  private sampleMode: 'black' | 'gray' | 'white' | null = null;
  private sampleHandler: ((e: PointerEvent) => void) | null = null;
  private sampleRow: { set: (v: string) => void } | null = null;
```

```ts
  /** The Levels eyedroppers: while a mode is on, the scrim lets clicks through and a click on the canvas samples the
   *  original pixel there, before any tool sees the click. */
  private startSampling(mode: string): void {
    this.stopSampling();
    if (mode !== 'black' && mode !== 'gray' && mode !== 'white') return;
    this.sampleMode = mode;
    this.sampleRow?.set(mode);
    this.scrim.classList.add('cv-scrim-through');
    const handler = (e: PointerEvent): void => {
      const stage = document.querySelector('.cv-overlay-canvas'), p = this.engine.current, m = this.sampleMode;
      if (e.button !== 0 || !stage || e.target !== stage || !p || !m) return;
      e.preventDefault();
      e.stopPropagation();
      const b = stage.getBoundingClientRect(), v = p.viewport;
      const rgb = this.engine.sampleOriginal({ x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom }, this.mode !== 'image');
      if (rgb) this.applySample(rgb, m);
    };
    window.addEventListener('pointerdown', handler, true);
    this.sampleHandler = handler;
  }

  private stopSampling(): void {
    if (this.sampleHandler) window.removeEventListener('pointerdown', this.sampleHandler, true);
    this.sampleHandler = null;
    this.sampleMode = null;
    this.scrim.classList.remove('cv-scrim-through');
    this.sampleRow?.set('');
  }
```

```ts
    this.sampleRow = sample;
```

Removed, the Hue/Saturation rows:

```ts
    const hue = sliderRow('Hue', -180, 180, 1, (v) => { cur().hue = v; this.changed(); });
    const hueC = sliderRow('Hue', 0, 360, 1, (v) => { cur().hue = v; this.changed(); });
    const sat = sliderRow('Saturation', -100, 100, 1, (v) => { cur().saturation = v; this.changed(); });
    const satC = sliderRow('Saturation', 0, 100, 1, (v) => { cur().saturation = v; this.changed(); });
    const light = sliderRow('Lightness', -100, 100, 1, (v) => { cur().lightness = v; this.changed(); });
```

```ts
    const invert = checkRow('Invert range', (v) => { this.hsv.invertRange = v; this.changed(); });
    node.append(range.el, hue.el, hueC.el, sat.el, satC.el, light.el, colorize.el, invert.el);
```

```ts
import { el, setHidden } from '../dom';
```

### src/ui/panels/adjust-panel.ts · onApplied, applySettings · _v0.51.0

Reports applied adjustments for recording and replays them without the dialog. Removed:

```ts
  openForLayer(id: ID): void {
    if (this.mode === 'layer') this.engine.commitLive();
```

### src/ui/panels/adjust-panel.ts · askImage · _v0.53.0

Opens an image adjustment with recorded settings for an action paused for input. Nothing was removed.
### src/ui/panels/adjust-panel.ts · parametric sections · _v0.66.0

`buildParams` makes one section per parametric kind from its control list, all rows built once and group rows hidden rather than rebuilt; `prepare` normalises `data.params`; `kernel` falls through to `paramKernel`. Nothing was removed.

## src/ui/panels/background-panel.ts

### src/ui/panels/background-panel.ts · BackgroundPanel · _v0.9.0

the Remove Background panel: Quality (Basic or Advanced) and, for Advanced, Refine (0 to 40 px, default 12), Contrast (0 to 100 percent, default 25) and Shift Edge (-10 to 10 px). It owns the model's raw mask bitmap while open, targets the layer's pixels, previews the layer with its background hidden through `previewImageEdit` (coalesced to one per frame), and on OK refines at full size and calls `applySubjectMask`. Cancel always clears the preview; settings carry over between uses.

## src/ui/panels/color-picker.ts

### src/ui/panels/color-picker.ts · ColorPickerDialog · _v0.10.0

Ported from the `ColorPickerSheet.swift`: a saturation and brightness field, a vertical hue strip, new and current swatches, and RGB and hex entry, with HSV as the source of truth so a gray keeps its hue. It opens on the `cv-pick-color` event the rail's swatches send, titled Foreground Color or Background Color. While open, its scrim is click-through and a capture-phase listener samples the composite color under a stage click before any tool sees it. Enter in the hex box commits by blurring it, so a later blur cannot re-apply a stale value over a hue drag. OK sets the color; Cancel and Escape leave it.

### src/ui/panels/color-picker.ts · ColorPickerDialog · drag sampling and ring · _v0.11.0

Canvas sampling follows a drag through capture-phase window listeners, showing the sample ring against the picker's color from the drag's start; `endSampleDrag` removes the listeners and the ring, and `close` always calls it. Removed from the sampler:

```ts
      const b = stage.getBoundingClientRect(), v = p.viewport;
      const rgb = this.engine.sampleOriginal({ x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom }, true);
      if (rgb) this.setRgb({ r: Math.round(rgb[0] * 255), g: Math.round(rgb[1] * 255), b: Math.round(rgb[2] * 255) });
```

## src/ui/panels/controls.ts

### src/ui/panels/controls.ts · sliderRow, selectRow, checkRow, colorRow, numberRow · _v0.2.0

Row helpers built once, with setters that update in place.

## src/ui/panels/filter-panel.ts

### src/ui/panels/filter-panel.ts · FilterPanel · _v0.2.0

Gaussian Blur, Motion Blur, Add Noise and Lens Correction with a 140 ms debounced preview and a fixed seed per open; apply runs after the dialog closes and paints.

### src/ui/panels/filter-panel.ts · FilterPanel · worker previews · _v0.26.0

Previews run through `runFilterOffThread`, falling back to the local kernel when there is no worker; the commit still runs on the main thread inside the undo transaction. Removed:

```ts
      if (this.preview) this.engine.previewImageEdit((src, scale) => this.run(src, scale), this.grow());
```

### src/ui/panels/filter-panel.ts · Unsharp Mask section · _v0.33.0

Amount, Radius and Threshold sliders and the `run` branch. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection';
```

### src/ui/panels/filter-panel.ts · Develop section · _v0.36.0

Sixteen sliders in Light, Colour, Effects and Detail groups, built from one table. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask';
```

### src/ui/panels/filter-panel.ts · onApplied, applySettings · _v0.44.0

Records applied filters and replays them without the dialog. Nothing was removed.

### src/ui/panels/filter-panel.ts · runFilter, filterMargin · _v0.45.0

Filter code made shareable; smart-object routing and editing a stored filter. Removed:

```ts
  private readonly s = { radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, usmAmount: 100, usmRadius: 1, threshold: 0, develop: defaultDevelopState() };
  private run(src: ImageData, scale: number): ImageData {
    const s = this.s;
    switch (this.kind) {
      case 'gaussianBlur': return gaussianBlur(src, s.radius * scale);
      case 'motionBlur': return motionBlur(src, s.angle, s.distance * scale);
      case 'addNoise': return addNoise(src, s.amount, s.gaussian, s.monochromatic, this.seed);
      case 'lensCorrection': return lensDistort(src, s.distortion);
      case 'unsharpMask': return unsharpMask(src, s.usmAmount, s.usmRadius * scale, s.threshold);
      case 'develop': return developImage(src, s.develop, scale);
    }
  }
  private grow(): number {
    return this.kind === 'gaussianBlur' ? gaussianMargin(this.s.radius) : this.kind === 'motionBlur' ? motionMargin(this.s.distance) : 0;
  }
```

### src/ui/panels/filter-panel.ts · shape layers · _v0.47.0

Filters refuse shape layers before opening. Nothing was removed.

### src/ui/panels/filter-panel.ts · ask · _v0.53.0

Opens with recorded settings for an action paused for input. Nothing was removed.

### src/ui/panels/filter-panel.ts · background apply · _v0.55.0

OK and Actions replay apply filters through the worker. Removed:

```ts
  applySettings(kind: FilterKind, settings: Record<string, unknown>): boolean {
    const label = FILTER_LABELS[this.kind], grow = this.grow();
    const run = (src: ImageData, scale: number): ImageData => this.run(src, scale);
    requestAnimationFrame(() => window.setTimeout(() => this.engine.applyImageEdit(label, run, grow), 0));
```
### src/ui/panels/filter-panel.ts · Lens Blur, Smart Sharpen · _v0.68.0

Kinds, labels, defaults, `runFilter` cases and margins for the two filters; their dialog sections, Smart Sharpen's Angle row shown only for Motion Blur removal. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop' };
  return { radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, usmAmount: 100, usmRadius: 1, threshold: 0, develop: defaultDevelopState() };
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : 0;
```

## src/ui/panels/jpeg-dialog.ts

### src/ui/panels/jpeg-dialog.ts · JpegDialog · _v0.6.0

Ported from the `JPEGExportSheet.swift`. Quality starts from the last export, remembered in localStorage under `sonny.jpegQuality`, and from 85% the first time; the sheet shows the image size and sRGB and previews the actually encoded JPEG, debounced 120 ms, with its encoded size. The preview canvas keeps one size (432 by 280) with the image fitted inside, so the sheet never changes height, and the preview is decoded with `createImageBitmap` rather than shown through a blob URL, which the desktop CSP may refuse. Export stores the quality and hands it back to the caller.

## src/ui/panels/live-mask-dialog.ts

### src/ui/panels/live-mask-dialog.ts · LiveMaskDialog · _v0.19.0

the alert for deleting a layer that other layers are clipped to (their live mask), with its wording and buttons: Bake and Delete, Cancel, Remove Links and Delete; `choose` resolves `bake`, `unlink` or null (Cancel and Escape).

## src/ui/panels/size-dialogs.ts

### src/ui/panels/size-dialogs.ts · CanvasSizeDialog, ImageSizeDialog, AmountDialog · _v0.2.0

Canvas Size with the anchor offset formula and extension fill, Image Size with constrain, resolution and resampling, and the Expand and Contract amount dialog that remembers its amounts.

### src/ui/panels/size-dialogs.ts · onApplied · _v0.44.0

Records Image and Canvas Size changes. Removed:

```ts
    if (this.engine.resizeCanvas(W, H, dx, dy, colors[choice] ?? null)) this.close();
    if (this.engine.resampleImage(this.w, this.h, this.sampling, this.res)) this.close();
```

### src/ui/panels/size-dialogs.ts · starting sizes · _v0.47.0

Image and Canvas Size report the size they started from. Removed:

```ts
  onApplied: ((v: { w: number; h: number; dx: number; dy: number; fill: RGB | null }) => void) | null = null;
    if (this.engine.resizeCanvas(W, H, dx, dy, colors[choice] ?? null)) { this.onApplied?.({ w: W, h: H, dx, dy, fill: colors[choice] ?? null }); this.close(); }
  onApplied: ((v: { w: number; h: number; sampling: string; res: number }) => void) | null = null;
    if (this.engine.resampleImage(this.w, this.h, this.sampling, this.res)) { this.onApplied?.({ w: this.w, h: this.h, sampling: this.sampling, res: this.res }); this.close(); }
```
### src/ui/panels/size-dialogs.ts · Feather, Border, Smooth · _v0.66.0

`AmountDialog.show` takes an optional modify kind; `apply` sends it to `modifySelection` and remembers the amount. Removed:

```ts
  show(expand: boolean): void {
    this.setTitle(expand ? 'Expand Selection' : 'Contract Selection');
    this.amount.set(expand ? this.engine.selectionAmounts.expand : this.engine.selectionAmounts.contract);
```

## src/ui/rail.ts

### src/ui/rail.ts · tool rail and colors · _v0.1.0

Created in _v0.1.0.

### src/ui/rail.ts · Rail · swatches open the picker · _v0.10.0

The foreground and background swatches dispatch `cv-pick-color` instead of opening the native color input, which stays in the markup unused. Removed:

```ts
    this.fg.addEventListener('click', () => this.fgInput.click());
    this.bg.addEventListener('click', () => this.bgInput.click());
```

## src/ui/stage.ts

### src/ui/stage.ts · Stage.resize · _v0.1.0

Renders synchronously inside the ResizeObserver callback so a resize never shows a blank canvas. At 200 percent and above the visible document region is composited at 1:1 and scaled with smoothing off, for a true pixel view.

### src/ui/stage.ts · Stage · renderOverlay · _v0.4.0

The marching ants take their offset from `engine.outlineShift`, which covers both a selection being moved and pixels being moved. Removed:

```ts
      const shift = this.engine.selectionShift?.project === p ? this.engine.selectionShift : null;
```

### src/ui/stage.ts · Stage · renderOverlay · sample ring · _v0.11.0

After the tool overlay, draws `engine.sampleRing` with the `SampleRingOverlay` geometry in screen pixels (radius 43, a 24 px gray ring at 0.45 white, 16 px halves clipped top and bottom: the new color above, the color before the drag below), so it keeps its size at any zoom. Nothing was removed.

### src/ui/stage.ts · Stage · WebKit pinch · _v0.20.0

`gesturestart`, `gesturechange` and `gestureend` listeners zoom about the pointer by the gesture's scale since it began, as the magnify; Chrome's pinch still arrives as Ctrl+wheel. Nothing was removed.

### src/ui/stage.ts · Stage · right-drag brush tip · _v0.22.0

Right presses with Brush, Spot Healing, Clone Stamp or Smear (`brushTools`, the isBrushTool) start a tip drag before tool dispatch, captured like panning. Nothing was removed.

### src/ui/stage.ts · Stage · floating ants · _v0.24.0

With no live selection, the ants draw `floatingOutline`'s selection through the view times its carry matrix, and keep marching while a selection floats. Removed:

```ts
    const sel = p.selection;
    if (sel) {
```

```ts
      const m = new DOMMatrix([v.zoom * d, 0, 0, v.zoom * d, (v.panX + (shift?.dx ?? 0) * v.zoom) * d, (v.panY + (shift?.dy ?? 0) * v.zoom) * d]);
      const path = new Path2D();
      path.addPath(sel.outline(), m);
```

```ts
    const need = !!this.engine.current?.selection && !REDUCED;
```

### src/ui/stage.ts · Stage · region repaints · _v0.29.0

Reported regions accumulate in `pending` between frames; `renderScene(region)` clears and recomposes only that region, a pixel wider each way, leaving the rest of the scene; a full request wins until the frame runs. Removed:

```ts
    for (const k of ['render', 'viewport', 'active'] as const) engine.on(k, () => this.queue(true, true));
```

```ts
  private queue(scene: boolean, overlay: boolean): void {
    this.wantScene ||= scene;
    this.wantOverlay ||= overlay;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.wantScene) this.renderScene();
      if (this.wantOverlay) this.renderOverlay();
    });
  }
```

```ts
  private renderScene(): void {
    this.wantScene = false;
    const g = this.sctx;
    const W = this.scene.width, H = this.scene.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const p = this.engine.current;
    if (!p) return;
```

```ts
    g.lineWidth = 1;
    g.strokeStyle = pal.edge;
    g.strokeRect(Math.round(docRect.x) - 0.5, Math.round(docRect.y) - 0.5, Math.round(docRect.w) + 1, Math.round(docRect.h) + 1);
    const vis = intersectRect(integral(docRect), { x: 0, y: 0, w: W, h: H });
    if (!vis) return;
```

## src/ui/status.ts

### src/ui/status.ts · status bar · _v0.1.0

Created in _v0.1.0.

## src/ui/tabs.ts

### src/ui/tabs.ts · project tabs · _v0.1.0

Created in _v0.1.0.

## src/ui/themes.ts

### src/ui/themes.ts · 14 NodeMode theme profiles, verbatim · _v0.1.0

Created in _v0.1.0.

## src/ui/toast.ts

### src/ui/toast.ts · toasts · _v0.1.0

Created in _v0.1.0.

## src/version.ts

### src/version.ts · version string · _v0.1.0

Created in _v0.1.0.

## tsconfig.json

### tsconfig.json · strict compiler settings · _v0.1.0

Created in _v0.1.0.

## vite.config.ts

### vite.config.ts · ports 5190 and 5191, host false, /api proxy · _v0.1.0

Created in _v0.1.0.

# frontend HASHOUT_LOG

Living log for the frontend side, _v0.1.0. Read the map and the TOC first; entries are anchored by file and symbol, and removed code is quoted in full.

## Send to NodeMode, standalone · _v1.50.8 (backend/app/routers/nodemode.py new, backend/app/main.py; frontend/src/ui/panels/send-nodemode.ts new, io/api.ts, ui/prefs.ts, ui/app-dialogs.ts, app.ts)

The engine's `GET /api/nodemode/status` and `POST /api/nodemode/send` (each image through NodeMode's upload, then one announcement to `/api/formvis/receive` saying which image is the mask of which; a NodeMode without the receiver still gets the uploads, and the reply says so); `api.nodemodeStatus`, `sendToNodeMode`; `SendToNodeModeDialog` (the flattened image, the active layer, the selection with its mask, or every layer); `Prefs.nodemodeUrl` and Preferences' Plugins section; File > Send to NodeMode when not embedded. NodeMode's receiving half is a patch in the planning docs. Removed from frontend:

```text
      { label: 'Automate', items: ['actions', 'action-stop', 'batch'] }, ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
```

Removed from backend:

```text
from app.routers import generative, io, ops, projects, system
```

Nothing removed from src-tauri.

## The tool audit, part 4 · _v1.50.7 (engine/index.ts, engine/viewport.ts; extensions/tools/tone.ts, eyedropper.ts, zoom.ts)

`tone.protectTones` (Dodge and Burn move brightness with the hue kept, easing toward grey only as far as keeps a colour from clipping) and `tone.vibrance` (the Sponge saturates the least saturated most), both on by default as Photoshop's; `Engine.eyedropperSample` (Current Layer, Current & Below through `belowOverrides`, All Layers) in `sampleColor`; `Viewport.fill`, `Engine.fillScreen`; the Zoom bar's 100% and Fill Screen. Removed from frontend:

```text
  tone: { range: 'shadows' | 'midtones' | 'highlights'; exposure: number; spongeMode: 'desaturate' | 'saturate'; flow: number } = { range: 'midtones', exposure: 0.5, spongeMode: 'desaturate', flow: 0.5 };
      if (kind === 'sponge') { const k = t.spongeMode === 'saturate' ? -t.flow : t.flow; f = (v) => v + (l - v) * k; }
      else {
        f = kind === 'dodge' ? (v) => v + (1 - v) * a : (v) => v * (1 - a);
    this.work.render({ doc: p.doc, target: s, view: translation(-(Math.floor(pt.x) - half), -(Math.floor(pt.y) - half)) });
```

Nothing removed from src-tauri or backend.

## The tool audit, part 3 · _v1.50.6 (engine/index.ts; extensions/tools/clone.ts, gradient.ts)

The Clone Stamp's `retouch.cloneSample` (Current Layer, Current & Below, All Layers, through `healSampleSurface` and the new shared `belowOverrides`, in the stroke, the preview and the overlay), `cloneBlend` and `cloneFlow` in its stroke; the Gradient's `transparency` and `method` (`gradientMethod`: Classic in sRGB, Linear in linear light, Perceptual in OKLab, each segment divided into 24 steps). Removed from frontend:

```text
  gradientSettings: { shape: GradientType; style: string; reversed: boolean; opacity: number; blend: BlendMode; dither: boolean } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1, blend: 'normal', dither: false };
    const stops = resolveStops(presetById(st.style), fg, bg, st.reversed);
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean; patchSampleAll: boolean; healSource: 'sampled' | 'pattern'; healPattern: ID | null; patchPattern: ID | null } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false, patchSampleAll: false, healSource: 'sampled', healPattern: null, patchPattern: null };
    const all = this.retouch.cloneSampleAll, key = [all, l.id, p.history.revision, p.id].join('|');
      const image = all ? renderDoc(this.work, p.doc, null) : l.raster ? l.raster.canvas : null;
    const r0 = this.retouch, key = [sp.x.toFixed(2), sp.y.toFixed(2), d, this.brush.hardness, side, r0.cloneSampleAll, l.id, p.history.revision, r0.cloneScale, r0.cloneAngle, r0.cloneFlipH, r0.cloneFlipV].join('|');
    if (this.retouch.cloneSampleAll) this.work.render({ doc: p.doc, target: s, view, quality: 'medium' });
      texture = { surface: pattern ?? (kind === 'healBrush' ? this.healSampleSurface(p, l0, this.retouch.healSample) : this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0)), dx: off.x, dy: off.y };
    const style = kind === 'heal' || kind === 'remove' ? { ...this.brush, opacity: 0.45, color: white } : { ...this.brush, color: white };
    const s = new PixelStroke(pick.raster, pick.local, style, pick.target !== 'mask' && l0.locks?.transparency ? 'source-atop' : 'source-over', p.selection, texture, pick.target === 'mask');   // Lock Transparency
    const s = createSurface(p.doc.width, p.doc.height);
    this.work.render({ doc: p.doc, target: s, view: [1, 0, 0, 1, 0, 0], overrides, quality: 'high' });
    return s;
    { kind: 'toggle', label: 'Sample all layers', get: () => e.retouch.cloneSampleAll, set: (v) => { e.retouch.cloneSampleAll = v; e.emit('options', null); } },
```

Nothing removed from src-tauri or backend.

## The rename to formvis · _v1.50.5 (every file; frontend/src/io/legacy.ts and backend/app/core/legacy.py new)

The app is formvis, its projects `.fmv`, at the owner's word; git history is untouched (its commits and tags keep the former name), and 32 files moved by `git mv` keep their histories. This log, like the changelog, now reads with the new name throughout, quotes before this entry included. Of the 243 lines git reports removed since v1.50.4 in frontend/src, backend/app and src-tauri, 228 differ only by the name and are not quoted (quoting them would put the former name back thousands of times; git holds them); the rest are quoted in full below, with the new name. `legacy.ts` and `legacy.py`, the only places the former name remains, carry what was saved under it across: settings and the browser databases (merged, never overwriting; each move bounded so the app always starts), the library folder, the former project extensions and format identifier.

```text
    return _ensure(Path(raw).expanduser() if raw else Path.home() / "Formvis")
from app.core import config
SUFFIXES = (".fmv", ".formvis", ".canvasor", ".comp", ".zip")
#: The library writes .fmv; .formvis (the extension before 0.90.0) is still read, listed, opened and deleted.
EXT, OLD_EXT = ".fmv", ".formvis"
    """The library file for `name`: the .fmv one, or else an older .formvis one."""
    old = path.with_suffix(OLD_EXT)
    return path if path.is_file() or not old.is_file() else old
    for suffix in (OLD_EXT, EXT):
    target.with_suffix(OLD_EXT).unlink(missing_ok=True)
    path.with_suffix(OLD_EXT).unlink(missing_ok=True)
SUPPORTED = {FORMVIS: range(1, 2), CANVASOR: range(1, 2)}
export const PROJECT_ACCEPT = '.fmv,.formvis,.canvasor,.comp,.zip,.psd,.psb';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|canvasor|comp|zip|psd|psb)$/i.test(f.name);
startApp();
```

## The tool audit, part 2 · _v1.50.4 (engine/stroke.ts, engine/index.ts, engine/text.ts, engine/types.ts; io/psd.ts; extensions/registry.ts, extensions/tools/brush.ts, type.ts, wand.ts; ui/options.ts; styles)

`PixelStroke.stamp`, `Engine.airbrushTick`, `strokeShow` (the Brush's Airbrush); `TextSpec.antialias` (None, Sharp, Smooth; `antialiased`), read back and written to PSD; the options bar's `color` control; Type's Anti-aliasing and Color; `setType` restyling the selected type layer (style keys only); the Magic Wand's sample sizes to 101 by 101, Select Subject and Select and Mask. Removed from frontend:

```text
  return warpActive(t.warp) ? warpRender(plain, t.warp) : plain;
export interface TextSpec { box?: { w: number; h: number } | null; direction?: 'horizontal' | 'vertical'; content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right' | 'justify'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; style?: ID | null; rendered?: string }
let smoothing = 0, steady: { x: number; y: number } | null = null, last: import('../registry').ToolPointer | null = null;
  down(ctx, p) { if (p.button === 0) { hoverPt = p.doc; steady = { ...p.doc }; last = p; ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose); } },
  up(ctx) { if (steady && last && smoothing > 0) ctx.engine.strokeTo(last.doc, last.pressure, last.pose); steady = null; last = null; ctx.engine.endStroke(); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
    { kind: 'segment', label: 'Sample Size', choices: [{ id: '0', label: 'Point' }, { id: '1', label: '3 by 3' }, { id: '2', label: '5 by 5' }], get: () => String(e.wand.sampleSize), set: (v) => e.setWand({ sampleSize: Number(v) }) },
        paragraphStyle: { justification: t.align === 'justify' ? 'justify-left' : t.align }, shapeType: t.box ? 'box' : 'point', ...(t.box ? { boxBounds: [0, 0, t.box.w * k, t.box.h * k] } : {}), ...(t.direction === 'vertical' ? { orientation: 'vertical' } : {}) };
```

Nothing removed from src-tauri or backend.

## The tool audit, flashes and New Document · _v1.50.3 (engine/index.ts, engine/stroke.ts; extensions/tools/brush.ts, eraser.ts, bucket.ts, type.ts, marquee.ts, lasso.ts, quick-select.ts, object-select.ts; ui/app-dialogs.ts, ui/properties.ts; backend/app/services/segment.py)

New Document's note and its size by mode; the Properties icon written only when it changes; `Engine.brushBlend`, `setBrushBlend` (Photoshop's Mode: Normal, Behind, Clear and the modes the canvas draws), the bucket's modes filtered alike; the Brush's Smoothing and Angle; `StrokeStyle.square` and the Eraser's Block, Flow and Erase to History; Type's Font Style and Warp Text; Select and Mask on the selection tools; `segment.available` without importing torch. Removed from frontend:

```text
  beginStroke(pt: Pt, shift: boolean, pressure = 1, pose: PenPose = UPRIGHT, opts: { aliased?: boolean; autoErase?: boolean; name?: string } = {}): boolean {
    const op: GlobalCompositeOperation = pick.target === 'mask' ? (white ? 'source-over' : 'destination-out') : keepAlpha ? 'source-atop' : this.brushMode === 'erase' ? 'destination-out' : 'source-over';
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, bg: { ...this.bg }, flow: this.brushFlow, aliased: !!opts.aliased }, op, p.selection);
export interface StrokeStyle { bg?: RGB; aliased?: boolean; diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number }
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
  down(ctx, p) { if (p.button === 0) { hoverPt = p.doc; ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose); } },
  move(ctx, p) { hoverPt = p.doc; ctx.engine.strokeTo(p.doc, p.pressure, p.pose); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'paint', label: 'Paint' }, { id: 'erase', label: 'Erase' }], get: () => e.brushMode, set: (v) => e.setBrushMode(v as 'paint' | 'erase') },
import { BLEND_MODES, allPatterns } from '../../engine';
    { kind: 'select', label: 'Mode', choices: BLEND_MODES.map((m) => ({ id: m.id, label: m.label })), get: () => e.bucket.mode, set: (v: string) => e.setBucket({ mode: v as typeof e.bucket.mode }) },
let hover: Pt | null = null, mode: 'brush' | 'pencil' = 'brush', before: 'paint' | 'erase' = 'paint';
    before = ctx.engine.brushMode;
    ctx.engine.setBrushMode('erase');
    if (!ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose, { aliased: mode === 'pencil', name: 'Eraser' })) ctx.engine.setBrushMode(before);
  up(ctx) { ctx.engine.endStroke(); ctx.engine.setBrushMode(before); },
  cancel(ctx) { ctx.engine.cancelStroke(); ctx.engine.setBrushMode(before); },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'brush', label: 'Brush' }, { id: 'pencil', label: 'Pencil' }], get: () => mode, set: (v) => { mode = v as 'brush' | 'pencil'; e.emit('options', null); } },
import { dashed, type Tool } from '../registry';
    { kind: 'toggle', label: 'Bold', get: () => e.textSettings.bold, set: (v) => setType(e, { bold: v }) },
    { kind: 'toggle', label: 'Italic', get: () => e.textSettings.italic, set: (v) => setType(e, { italic: v }) },
    side.append(label('Name', this.name), sizeRow, pair(label('Resolution', this.res, el('<span class="cv-nd-unit">ppi</span>')), label('Orientation', seg)), pair(label('Color Mode', mode), label('&nbsp;', depth)), label('Background Contents', this.fill), ab, this.summary);
    const mb = (this.px.w * this.px.h * 3) / (1024 * 1024);
      tile.innerHTML = a ? icon(kindIcon(a), 18) : '';
```

Removed from backend:

```text
    try:
        import sam2  # noqa: F401
        import torch  # noqa: F401
        return True
    except Exception:
```

Nothing removed from src-tauri.

## Paint targets, scrollbars, colour modes and Wet Edges · _v1.50.2 (engine/index.ts, engine/types.ts, engine/stroke.ts; io/project-io.ts; ui/app-dialogs.ts, ui/tabs.ts; app.ts; styles/scrollbars.css)

`Engine.paintable` as Photoshop decides (a group says so; an adjustment layer paints its mask through `target`; type, shape and smart-object layers ask `askRasterize`); empty layers read as transparent by the Paint Bucket, Quick Selection and the Magic Wand; `scrollbars.css` hides every scrollbar; `DocMode`, `Doc.mode`, `Doc.palette`; `Engine.convertMode` (Grayscale keeping type, shapes and vectors editable; Bitmap by threshold or dither; Indexed exact or adaptive, `paletteFor`), `flattenImage`, `setDocumentMode`, `inMode` with the foreground and background as accessors; `ModeDialog`; New Document's modes; the tab's mode; the project file's mode and palette; Wet Edges on the whole stroke (`wetInner`, `wetMark`). Removed from frontend:

```text
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type LayerLocks, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, type ParagraphStyle, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
  fg: RGB = { r: 0, g: 0, b: 0 };
  bg: RGB = { r: 255, g: 255, b: 255 };
  private paintable(l: Layer | null): l is Layer { return !!l && !l.isGroup && !l.adjustment && !this.locked(l, 'pixels'); }
    const target: Target = p.maskTarget && l0.mask ? 'mask' : 'pixels';
    const raster = target === 'mask' ? this.ensureMask(p, l0) : this.ensurePixels(p, l0);
      if (!l?.raster) { this.notice('Select a pixel layer first.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
      if (!l?.raster) { this.notice('Quick Selection samples the active pixel layer; turn on Sample all layers to use the whole image.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
      if (!l?.raster) { this.notice('Magic Wand samples the active pixel layer; turn on Sample all layers to use the whole image.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
      if (shape.noise || shape.wetEdges) this.tip = shapedTip(this.tip, !!shape.noise, !!shape.wetEdges);
    if (this.dualPaint || this.textureTile) {
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; notes?: readonly DocNote[]; counts?: readonly { x: number; y: number }[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[] }
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.notes?.length ? { notes: doc.notes.map((n) => ({ id: n.id, x: n.x, y: n.y, text: n.text })) } : {}), ...(doc.counts?.length ? { counts: doc.counts.map((c) => ({ x: c.x, y: c.y })) } : {}), ...(doc.globalLight ? { globalLight: { angle: doc.globalLight.angle, altitude: doc.globalLight.altitude } } : {}), ...(doc.paragraphStyles?.length ? { paragraphStyles: doc.paragraphStyles.map((s) => ({ ...s, color: { ...s.color } })) } : {}) };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(notes.length ? { notes } : {}), ...(counts.length ? { counts } : {}), ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}), ...(styles.length ? { paragraphStyles: styles } : {}) }, activeId: str(manifest.activeLayerID) };
* { scrollbar-width: thin; scrollbar-color: var(--border-light) transparent; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: var(--radius-pill); }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
    const mode = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Color Mode"><option>RGB Color</option></select>');
    setText(this.summary.querySelector('.cv-nd-meta') as HTMLElement, `RGB Color · 8 bit · ${mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`}`);
```

Nothing removed from src-tauri or backend.

## Brush Settings and the hover highlight · _v1.50.1 (engine/brush-dynamics.ts, engine/stroke.ts, engine/index.ts; ui/panels/brush-settings.ts; extensions/tools/object-select.ts)

`BrushShape.color`, `transfer`, `noise`, `wetEdges`; `PixelStroke.dabTip` (Color Dynamics), `transferAlpha`, `shapedTip` (Noise, Wet Edges), `toHsv`, `fromHsv`; `StrokeStyle.bg`; the panel's Color Dynamics, Transfer, and Noise and Wet Edges; Object Selection's hover as a wash and an outline. Removed from frontend:

```text
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, flow: this.brushFlow, aliased: !!opts.aliased }, op, p.selection);
export interface StrokeStyle { aliased?: boolean; diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number }
  private readonly tip: Surface;
    const d = this.dynamics, info = { pressure }, r = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1);
    this.paintCtx.drawImage(this.tip, p.x - rx, p.y - ry, rx * 2, ry * 2);
    const base = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1);
      this.paintCtx.drawImage(this.tip, -rx, -ry, rx * 2, ry * 2);
      for (let i = 0; i < data.length; i++) if (data[i] >= 128) { img.data[i * 4] = 249; img.data[i * 4 + 1] = 115; img.data[i * 4 + 2] = 22; img.data[i * 4 + 3] = 90; }
 *  Dynamics, Scattering, Texture and Dual Brush. It edits the engine's brush shape live, so the next stroke uses it;
```

Nothing removed from src-tauri or backend.

## Object Selection, Quick Selection and the Paint Bucket · _v1.49.10 (extensions/tools/object-select.ts, quick-select.ts, bucket.ts; io/api.ts; engine/index.ts; backend/app/routers/ops.py, backend/app/services/segment.py)

Object Selection's `request` and `selectWith` (points or a box), box mode and the hover highlight (`showHover`, Highlight on Hover); `api.selectObject` with a box; the engine's `select` taking a box (a box alone will do) and the route's box field; Quick Selection's New, Add and Subtract (`beginQuickSelect` fresh); the Paint Bucket's source, pattern and mode (`patternTint`, `compositeOp`). Removed from frontend:

```text
  bucket = { tolerance: 32, contiguous: true, sampleAll: false, opacity: 1, antiAlias: true };
      } else c.drawImage(this.tint(rect, rgbCss(color), cover), rect.x, rect.y);
  beginQuickSelect(pt: Pt, subtract: boolean): void {
  hint: () => 'Click to fill the area of similar color with the foreground color \u00b7 Tolerance sets how similar \u00b7 Stays inside the selection',
import type { Tool } from '../registry';
async function selectAt(engine: Engine, pt: Pt, mode: SelectionMode): Promise<void> {
  if (!p || !src) return;
  const W = p.doc.width, H = p.doc.height, x = Math.floor(pt.x), y = Math.floor(pt.y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const key = keyOf(p.id, src);
      const blob = await api.selectObject(key, [[x, y, 1]], () => toBlob(src), key !== sentKey);
      sentKey = key;
      const bitmap = await createImageBitmap(blob), m = createSurface(W, H), c = ctxOf(m);
      c.drawImage(bitmap, 0, 0, W, H);
      bitmap.close();
      const px = c.getImageData(0, 0, W, H).data, data = new Uint8Array(W * H);
      for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
      if (engine.current !== p) return;
      if (!data.some((v) => v >= 128)) { engine.notice('No object was found there.'); return; }
      engine.applySelection(SelectionMask.cropped(0, 0, W, H, data), mode, 'Object Selection');
  hint: () => 'Click an object to select it · Shift adds · Alt subtracts · The first click on an image takes a few seconds',
  down(ctx, p) { if (p.button === 0) void selectAt(ctx.engine, p.doc, modeFor(ctx.engine, p)); },
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginQuickSelect(p.doc, p.alt); },
  async selectObject(key: string, points: Array<[number, number, 0 | 1]>, image: () => Promise<Blob>, withImage: boolean): Promise<Blob> {
      const body = form({ key, points: JSON.stringify(points) }, img ? [{ name: 'image.png', blob: img }] : [], 'file');
```

Removed from backend:

```text
def select_object(key: str = Form(...), points: str = Form(...), file: UploadFile | None = File(None)) -> Response:
        png = segment.select(key, pts)
def select(key: str, points: list[tuple[float, float, int]]) -> bytes:
    """The object at the clicked points of the image encoded under `key`, as a grey PNG mask: each point (x, y, 1) is on
    the object and (x, y, 0) not on it; of SAM's three proposals the one it scores highest."""
    if not points:
        raise SegmentError("Click on the object to select.")
        coords = np.array([[x, y] for x, y, _ in points], dtype=np.float32)
        labels = np.array([1 if on else 0 for _, _, on in points], dtype=np.int32)
            masks, scores, _ = pred.predict(point_coords=coords, point_labels=labels, multimask_output=len(points) == 1)
```

Nothing removed from src-tauri.

## Retouching and Rotate View · _v1.49.9 (extensions/tools/content-aware-move.ts, red-eye.ts, rotate-view.ts new, smear.ts, index.ts, registry.ts; engine/index.ts, engine/viewport.ts, engine/types.ts; ui/stage.ts, ui/text-editor.ts, ui/tool-groups.ts, ui/rail.ts, ui/icons.ts)

`Engine.contentAwareMove` (move or extend, the hole filled by `contentFill`, the selection moved); `Engine.redEye`, `redEyeArea` (no step when nothing red); `Viewport.rotation`, `Engine.setViewRotation`, `Stage.unturn`, `Stage.turn` (the surfaces turned by CSS, pointers and wheel panning turned back), the text editor turned with the view; `Tool.group` (Rotate View's R in the Hand's slot); Smear without a shortcut; rail titles by each tool's key. Removed from frontend:

```text
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'colorSampler' | 'ruler' | 'note' | 'count' | 'idle';
  for (const tool of [historyBrushTool, frameTool, convertPointTool, selectionBrushTool, pencilTool, eraserTool, magicEraserTool, patternStampTool, backgroundEraserTool, colorSamplerTool, rulerTool, noteTool, countTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
  id: 'smear', label: 'Smear', key: 'R', order: 65,
      setTitle(node, t.id === 'brush' ? 'Brush (B) · Eraser (E)' : entries(group) > 1 ? `${t.label} (${group.key}) · hold or right-click for ${group.tools.length} tools · Shift+${group.key} cycles` : `${t.label} (${group.key})`);
    for (const k of ['viewport', 'active'] as const) engine.on(k, () => this.queue(true, true));
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.engine.pan(-(horizontal ? e.deltaY : e.deltaX) * unit, -(horizontal ? 0 : e.deltaY) * unit);
    const g = out.find((x) => x.key === t.key);
    if (g) g.tools.push(t); else out.push({ key: t.key, tools: [t] });
```

Nothing removed from src-tauri or backend.

## Shape modes, fill and stroke · _v1.49.8 (engine/shape-paths.ts, engine/index.ts; extensions/tools/shape.ts; ui/properties.ts, ui/icons.ts)

`PathShapeKind` 'triangle'; `boxedShapePath` for triangle, rectangle (`roundRectPath`) and ellipse (`ellipsePath`); `shapeSettings.mode`, `fill`, `stroke`, `strokeWidth`; `Engine.drawShape` (shape layer, work path, or pixels), `createVectorShape` (fill and stroke), `createShape` with a colour, `paintPath` with a given path; the shape bar's Mode, Fill, Stroke and Width; Justify in the Paragraph panel; a type mask clipped to the canvas. Removed from frontend:

```text
    const d = r.raster.ctx.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
    this.applySelection(SelectionMask.cropped(x, y, w, h, a), 'replace', spec.direction === 'vertical' ? 'Vertical Type Mask' : 'Horizontal Type Mask');
    const name = kind === 'custom' ? CUSTOM_SHAPES.find((s) => s.id === st.custom)?.label ?? 'Custom Shape' : { polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart' }[kind];
  private paintPath(name: string, paint: (c: Ctx2D, shape: Path2D, vp: VectorPath) => void): void {
    const vp = this.workPath;
  shapeSettings: { kind: 'rectangle' | 'ellipse' | PathShapeKind; cornerRadius: number } & PathShapeOptions = { kind: 'rectangle', cornerRadius: 0, ...DEFAULT_PATH_SHAPE };
  createShape(rect: Rect): void {
    const style = { kind, red: this.fg.r / 255, green: this.fg.g / 255, blue: this.fg.b / 255, cornerRadius: st.kind === 'rectangle' ? st.cornerRadius : 0 };
export type PathShapeKind = 'polygon' | 'star' | 'line' | 'arrow' | 'heart' | 'custom';
export function boxedShapePath(kind: 'polygon' | 'star' | 'heart' | 'custom', box: Rect, o: PathShapeOptions): VectorPath {
const NOUN: Record<string, string> = { rectangle: 'a rectangle', ellipse: 'an ellipse', polygon: 'a polygon', star: 'a star', heart: 'a heart', line: 'a line', arrow: 'an arrow', custom: 'a custom shape' };
const KINDS = ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'heart', 'custom'] as const;
const SHAPE_ICONS: Record<string, string> = { rectangle: 'tRect', ellipse: 'tEllipseShape', polygon: 'tPolygon', star: 'tStar', line: 'tLine', arrow: 'tArrow', heart: 'tHeart', custom: 'tCustomShape' };
const SHAPE_NAMES: Record<(typeof KINDS)[number], string> = { rectangle: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart', custom: 'Custom Shape' };
    ? `Drag to draw ${NOUN[e.shapeSettings.kind]} in the foreground color on a new shape layer · Shift after starting snaps to 45 degrees · Shift+U switches shape`
    : `Drag to draw ${NOUN[e.shapeSettings.kind]} in the foreground color on a new shape layer · Shift after starting keeps it square · Alt after starting grows from the center · Shift+U switches shape`,
    const kind = ctx.engine.shapeSettings.kind;
    if (lineLike(kind)) { ctx.engine.createPathShape(d.anchor, snapped(d)); return; }
    if (kind === 'rectangle' || kind === 'ellipse') { if (r.w >= 1 && r.h >= 1) ctx.engine.createShape(r); }
    else ctx.engine.createPathShape({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
    const body = el(`<div class="cv-para"><div class="cv-seg" role="group" aria-label="Alignment">${(['left', 'center', 'right'] as const).map((a) => `<button type="button" data-align="${a}" title="Align ${a}" aria-label="Align ${a}">${icon(a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight', 16)}</button>`).join('')}</div></div>`);
```

Nothing removed from src-tauri or backend.

## Type tools · _v1.49.7 (engine/text.ts, engine/types.ts, engine/index.ts, io/psd.ts; extensions/tools/type.ts; ui/text-editor.ts, ui/icons.ts; app.ts; styles)

`TextSpec.box`, `direction`, align 'justify'; `renderPlain` wraps (`wrapLines`), clips and justifies in a box; `renderVertical`; placement of box and vertical text (`createTextLayer`, `updateTextLayer`); `Engine.typeMask`, `createTextSelection`; the Type tool's four kinds, click or drag; the editor's box, vertical and mask modes; the PSD export's justify-left, box and vertical orientation; reading them back. Removed from frontend:

```text
    const d = (e as CustomEvent<{ layerId?: string; x?: number; y?: number }>).detail;
    else if (typeof d?.x === 'number' && typeof d?.y === 'number') typing.begin({ x: d.x, y: d.y });
    const x = at.x - (spec.align === 'center' ? w / 2 : spec.align === 'right' ? w - r.pad : r.pad);
    this.insertRasterLayer(r.raster, name, Math.round(x), Math.round(at.y - r.baseline), { text: { ...spec, rendered: textKey(r.raster) } }, 'Type');
        const x = spec.align === 'center' ? t.x + (t.w - nw) / 2 : spec.align === 'right' ? t.x + t.w - nw : t.x;
    const x = spec.align === 'center' ? t.x + (t.w - nw) / 2 : spec.align === 'right' ? t.x + t.w - nw : t.x;
  const lines = t.content.split('\n');
  const metrics = lines.map((line) => probe.measureText(line || ' '));
  const widths = lines.map((line) => lineWidth(probe, t, line || ' '));
  const advance = t.size * t.lineHeight, pad = Math.ceil(t.size * 0.1) + 2;
  const width = Math.ceil(widest) + pad * 2, height = Math.ceil(ascent + descent + advance * (lines.length - 1)) + pad * 2;
  c.textAlign = perChar ? 'left' : t.align;
    if (!perChar) { c.fillText(line, t.align === 'center' ? width / 2 : t.align === 'right' ? width - pad : pad, y); return; }
    let x = t.align === 'center' ? (width - widths[i]) / 2 : t.align === 'right' ? width - pad - widths[i] : pad;
    for (const ch of line) { c.fillText(ch, x, y); x += c.measureText(ch).width + trackingPx(t); }
    align: o.align === 'center' || o.align === 'right' ? o.align : 'left', bold: o.bold === true, italic: o.italic === true,
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; style?: ID | null; rendered?: string }
export interface ParagraphStyle { id: ID; name: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning }
import type { Tool } from '../registry';
  icon: () => 'tType',
  hint: () => 'Click to add text on a new type layer · Click a type layer to edit its text',
    { kind: 'segment', label: 'Align', choices: [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Right' }], get: () => e.textSettings.align, set: (v) => setType(e, { align: v === 'center' || v === 'right' ? v : 'left' }) },
    const hit = ctx.engine.textLayerAt(p.doc);
    document.dispatchEvent(new CustomEvent('cv:type', { detail: hit ? { layerId: hit } : { x: p.doc.x, y: p.doc.y } }));
        paragraphStyle: { justification: t.align }, shapeType: 'point' };
  private session: { project: Project; at: Pt; layerId: ID | null; spec: TextSpec; scale: number } | null = null;
  begin(target: { x: number; y: number } | { layerId: ID }): void {
      this.session = { project: p, at: { x: target.x, y: target.y }, layerId: null, spec: { ...e.textSettings, content: '', color: e.fg, rendered: undefined }, scale: 1 };
```

Nothing removed from src-tauri or backend.

## Measuring · _v1.49.6 (ui/info.ts, ui/panels/note-dialog.ts, extensions/tools/color-sampler.ts, ruler.ts, note.ts, count.ts new; engine/index.ts, engine/types.ts, io/project-io.ts; ui/panel-group.ts, ui/dock.ts, ui/stage.ts, ui/icons.ts, app.ts; styles)

`InfoPanel`; `Engine.measure`, `measureChanged`; `colorSamplerTool`, `drawSamplers`; `rulerTool` (Straighten Layer); `noteTool`, `NoteDialog`, `Engine.activeNote`, `addNote`, `setNote`, `removeNote`, `Doc.notes`; `countTool`, `addCount`, `removeCount`, `clearCounts`, `Doc.counts`; notes and counts in the project file; `PanelGroup.fitTabs`; a panel newer than a saved arrangement starts as it comes. Removed from frontend:

```text
const TAB_HOMES: Record<string, string> = { layers: 'layers-panel', channels: 'layers-panel', paths: 'layers-panel', navigator: 'navigator', swatches: 'swatches', color: 'swatches', properties: 'properties', brushes: 'brushes', 'brush-settings': 'brushes', paragraph: 'paragraph', character: 'character' };
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[] }
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'idle';
  for (const tool of [historyBrushTool, frameTool, convertPointTool, selectionBrushTool, pencilTool, eraserTool, magicEraserTool, patternStampTool, backgroundEraserTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.globalLight ? { globalLight: { angle: doc.globalLight.angle, altitude: doc.globalLight.altitude } } : {}), ...(doc.paragraphStyles?.length ? { paragraphStyles: doc.paragraphStyles.map((s) => ({ ...s, color: { ...s.color } })) } : {}) };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}), ...(styles.length ? { paragraphStyles: styles } : {}) }, activeId: str(manifest.activeLayerID) };
const DEFAULT: DockState = { order: DOCK_PANELS.map((p) => p.id), hidden: ['timeline', 'history'], side: [...DEFAULT_SIDE] };
    this.state = { order: o, hidden: hidden.filter((id) => ALL_PANELS.some((p) => p.id === id)), side: [...DEFAULT_SIDE] };
```

Nothing removed from src-tauri or backend.

Correction: the last line above (ui/dock.ts, `Dock.arrange`, replaced by the workspace fix) was missed when this section was first written, and the release's docs commit wrongly said the last two fixes removed nothing; added here. As in every section, the version line itself is not quoted.

## Painting tools · _v1.49.5 (extensions/tools/pencil.ts, eraser.ts, magic-eraser.ts, pattern-stamp.ts, background-eraser.ts new, brush.ts, index.ts; engine/index.ts, engine/stroke.ts, engine/types.ts; ui/icons.ts; app.ts; styles)

`pencilTool` (`StrokeStyle.aliased`, `PixelStroke.aliasedDab`, `beginStroke` opts: aliased, autoErase, name); `eraserTool` (E, its own tool); `magicEraserTool` (`Engine.magicErase`); `patternStampTool` (the retouch kind 'patternStamp', `patternStampPattern`); `backgroundEraserTool` (`beginBackgroundErase`, `backgroundEraseTo`, `endBackgroundErase`, `bgDab`, `BgEraseOpts`); the Brush's flyout without the Eraser; E and B keys by their groups, Shift+L through three lasso kinds; tabs fit. Removed from frontend:

```text
    else if (k === 'E') { engine.setTool('brush'); engine.setBrushMode('erase'); }
    else if (k === 'B') { engine.setTool('brush'); engine.setBrushMode('paint'); }
    else if (k === 'L' && e.shiftKey) { engine.setTool('lasso'); engine.update({ lassoKind: engine.lassoKind === 'freehand' ? 'polygonal' : 'freehand' }); }
  beginStroke(pt: Pt, shift: boolean, pressure = 1, pose: PenPose = UPRIGHT): boolean {
    p.history.begin(this.brushMode === 'erase' ? 'Eraser' : 'Brush', p.snapshot());
    const color = pick.target === 'mask' ? { r: 255, g: 255, b: 255 } : keepAlpha && this.brushMode === 'erase' ? this.bg : this.fg;
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, flow: this.brushFlow }, op, p.selection);
    s.setShape(this.brushShape, this.brushShape.texture.on ? (patternById(this.brushShape.texture.pattern) ?? allPatterns()[0])?.surface ?? null : null);
  beginRetouchStroke(kind: 'heal' | 'remove' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge' | 'historyBrush', pt: Pt, shift: boolean): boolean {
    p.history.begin({ heal: 'Spot Healing', remove: 'Remove', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge', historyBrush: 'History Brush' }[kind], p.snapshot());
export interface StrokeStyle { diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number }
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'selectionBrush' | 'idle';
  variants: (e) => [
    { id: 'paint', label: 'Brush', icon: 'tBrush', active: () => e.brushMode !== 'erase', pick: () => e.setBrushMode('paint') },
    { id: 'erase', label: 'Eraser', icon: 'tEraser', active: () => e.brushMode === 'erase', pick: () => e.setBrushMode('erase') },
  ],
  for (const tool of [historyBrushTool, frameTool, convertPointTool, selectionBrushTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

Nothing removed from src-tauri or backend.

## Selection tools · _v1.49.4 (engine/livewire.ts new, engine/index.ts, engine/types.ts; extensions/tools/lasso.ts, marquee.ts, selection-brush.ts new, index.ts; ui/stage.ts, ui/panel-group.ts, ui/icons.ts; styles)

`EdgeMap`, `liveWire`, `snapToEdge`; the Magnetic Lasso (`lassoKind` 'magnetic', `trace`, `traceSoon`, fastening, closing near the start); Single Row and Single Column Marquee (`marqueeKind` 'row', 'column'); `selectionBrushTool`, `Engine.beginSelectionBrushStroke` (the Quick Mask stroke with a forced add or subtract); tabs on one line. Removed from frontend:

```text
  marqueeKind: 'rectangle' | 'ellipse' = 'rectangle';
  lassoKind: 'freehand' | 'polygonal' = 'freehand';
  private beginQuickMaskStroke(p: Project, pt: Pt, pressure: number, pose: PenPose): boolean {
    p.history.begin('Quick Mask', p.snapshot());
    if (!sel) d.fill(255);
    else for (let y = 0; y < sel.h; y++) {
    const white = luminance(this.fg) >= 0.5 !== (this.brushMode === 'erase');
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'idle';
  for (const tool of [historyBrushTool, frameTool, convertPointTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
function reset(ctx: ToolContext): void { pts = []; active = false; ctx.engine.emit('overlay', null); }
  const poly = pts;
  e.applySelection(mask, mode, e.lassoKind === 'polygonal' ? 'Polygonal Lasso' : 'Lasso');
  icon: (e) => (e.lassoKind === 'polygonal' ? 'tPolyLasso' : 'tLasso'),
  hint: (e) => (e.lassoKind === 'polygonal'
    if (p.clicks >= 2 || Math.hypot(first.x - p.screen.x, first.y - p.screen.y) <= 6) { commit(ctx); return; }
  hover(ctx, p) { hover = p?.doc ?? null; if (active) ctx.engine.emit('overlay', null); },
    if (!active || ctx.engine.lassoKind !== 'polygonal') return nudgeSelectionKey(ctx, e);
    { kind: 'segment', label: 'Kind', choices: [{ id: 'freehand', label: 'Freehand' }, { id: 'polygonal', label: 'Polygonal' }], get: () => e.lassoKind, set: (v) => e.update({ lassoKind: v as 'freehand' | 'polygonal' }) },
  icon: (e) => (e.marqueeKind === 'ellipse' ? 'tEllipse' : 'tMarquee'),
    { id: 'rectangle', label: 'Rectangular Marquee', icon: 'tMarquee', active: () => e.marqueeKind !== 'ellipse', pick: () => e.update({ marqueeKind: 'rectangle' }) },
    { kind: 'segment', label: 'Shape', choices: [{ id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }], get: () => e.marqueeKind, set: (v) => e.update({ marqueeKind: v as 'rectangle' | 'ellipse' }) },
    if (this.engine.quickMask) {
      // Quick Mask: a red tint where nothing is selected, in place of the outline; live while a stroke paints it.
```

Nothing removed from src-tauri or backend.

## Paths, the grip and seven tabs · _v1.49.3 (extensions/tools/direct-select.ts, convert-point.ts and path-actions.ts new, path-select.ts, registry.ts, index.ts; engine/history.ts, engine/index.ts, engine/types.ts; ui/panels/stroke-path-dialog.ts, ui/paths.ts, ui/panel-group.ts, ui/icons.ts, app.ts; styles)

`directSelectTool` with a point selection, box select, group moves, pulled and broken handles, nudging; `convertPointTool`; `pathActions`, `toolHost`; `StrokePathDialog` width and colour; the Paths footer's dialogs; `Snapshot.paths`, work-path edits undoable (`beginPathEdit`, `endPathEdit`, `restore`, `History.end`); `PanelGroup.MAX_TABS`, `full`; the grip pinned. Removed from frontend:

```text
export interface Snapshot { doc: Doc; activeId: ID | null; selection: SelectionMask | null }
    if (!p.patches.length && p.before.doc === snap.doc && p.before.selection === snap.selection) return false;
    const p = this.current;
    if (!p || this.pathGesture || !this.selectedPath(p)?.shape) return;
    p.history.begin('Edit Shape Path', p.snapshot());
    p.history.end(p.snapshot());
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'idle';
import type { Tool } from '../registry';
type Grab = { anchor: Anchor; part: 'anchor' | 'in' | 'out'; from: Pt; start: Anchor };
function pick(anchors: Anchor[], at: Pt, toScreen: (p: Pt) => Pt): { anchor: Anchor; part: 'anchor' | 'in' | 'out' } | null {
/** Direct Selection (A): drag a Work Path anchor to move it with its handles, or drag a handle to reshape the curve; on
 *  a smooth point the opposite handle swings round to stay in line, keeping its own length. */
  hint: () => 'Drag a path point to move it, or a handle to reshape its curve · Draw paths with the Pen (P)',
    const v = ctx.view(), hit = pick(vp.subpaths.flatMap((s) => s.anchors), v.toScreen(p.doc), (q) => v.toScreen(q));
    grab = hit ? { ...hit, from: p.doc, start: { ...hit.anchor } } : null;
    if (grab) ctx.engine.beginPathEdit();
    const dx = p.doc.x - g.from.x, dy = p.doc.y - g.from.y, a = g.anchor, s = g.start;
    if (g.part === 'anchor') {
      a.x = s.x + dx; a.y = s.y + dy; a.inX = s.inX + dx; a.inY = s.inY + dy; a.outX = s.outX + dx; a.outY = s.outY + dy;
      const smooth = Math.abs((s.outX - s.x) * (s.inY - s.y) - (s.outY - s.y) * (s.inX - s.x)) < 1e-6 && (s.inX !== s.x || s.inY !== s.y) && (s.outX !== s.x || s.outY !== s.y);
  up(ctx) { grab = null; ctx.engine.endPathEdit(); },
    if (g) { Object.assign(g.anchor, g.start); ctx.engine.setWorkPath(ctx.engine.workPath); }
      gx.fillStyle = pal.handle;
  for (const tool of [historyBrushTool, frameTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
      if (t !== target) { target?.root.classList.remove('is-tab-target'); target = t; target?.root.classList.add('is-tab-target'); }
      target?.root.classList.remove('is-tab-target');
      if (ghost && target) { PanelGroup.moveTab(tid, this, target); PanelGroup.saveHomes(); }
    if (!t || from === to) return;
import { checkRow, selectRow } from './controls';
    this.body.append(this.toolRow.el, this.pressureRow.el, el('<p class="cv-note">The stroke uses the tool\'s current size, hardness and opacity; Clone Stamp needs its source set first.</p>'));
    this.engine.strokePathWith(this.tool, this.pressure);
      `<button class="cv-icon-btn" type="button" data-cmd="fill-path" title="Fill path" aria-label="Fill path">${icon('fill', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="stroke-path" title="Stroke path" aria-label="Stroke path">${icon('paintbrush', 16)}</button>` +
```

Nothing removed from src-tauri or backend.

## Panels reworked · _v1.49.2 (ui/layers.ts, ui/panel-group.ts, ui/dock.ts, ui/channels.ts, ui/icons.ts, app.ts; styles)

`LayersPanel` builds a `PanelGroup` (layers-panel; the page `.cv-layers-page`; `adoptPaths`, `adoptChannels` through `addTab`; `showTab` finds the group holding the tab); `PanelGroup.addTab`, `has`, `size`, `labelOf`, `remove`, `onDetach`, `onGapHint`, the grip; `Dock.gapAt`, `showGap`, `hideGap`, `insertPanel`, `removePanel`, `registerPanel`, `unregisterPanel`, the ghost and labelled marker; groups made by detaching (formvis.customGroups). Removed from frontend:

```text
import { ALL_PANELS, Dock } from './ui/dock';
const TAB_HOMES: Record<string, string> = { navigator: 'navigator', swatches: 'swatches', color: 'swatches', properties: 'properties', brushes: 'brushes', 'brush-settings': 'brushes', paragraph: 'paragraph', character: 'character' };
  PanelGroup.onMoved = () => { dock.refresh(); props.relayout(); };
      dock.reset(); PanelGroup.resetHomes(TAB_HOMES); PanelGroup.resetStates(); layers.showTab('layers');
.cv-layers-panel { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; }
.cv-layers-panel.is-paths-tab, .cv-layers-panel.is-channels-tab { grid-template-rows: auto minmax(0, 1fr); }
.cv-layers-panel.is-paths-tab > .cv-layer-props, .cv-layers-panel.is-paths-tab > .cv-layer-list, .cv-layers-panel.is-paths-tab > .cv-panel-foot,
.cv-layers-panel.is-channels-tab > .cv-layer-props, .cv-layers-panel.is-channels-tab > .cv-layer-list, .cv-layers-panel.is-channels-tab > .cv-panel-foot { display: none; }
.cv-layers-panel .cv-paths[hidden] { display: none; }
.cv-layers-panel .cv-paths { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.cv-layers-panel .cv-paths > .cv-panel-head { height: 34px; background: transparent; }
.cv-layers-panel .cv-paths-toggle { display: none; }
.cv-layers-panel { grid-template-columns: minmax(0, 1fr); }
    if (this.root.hidden || this.timer) return;
export const ALL_PANELS: readonly DockPanel[] = [...DOCK_PANELS, ...SIDE_PANELS];
    // The column under the pointer: the side column's when over it (and open), else the dock's.
    const col: 'dock' | 'side' = sr && e.clientX >= sr.left && e.clientX <= sr.right ? 'side' : 'dock';
    const ids = (col === 'side' ? this.state.side : this.dockIds()).filter((id) => this.present(id));
    const shown = ids.map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    let best = 0, bestDist = Infinity, y = box.top + 2;
    for (let i = 0; i <= shown.length; i++) {
      if (!shown.length) break;
      const dist = Math.abs(e.clientY - gap);
      if (dist < bestDist) { bestDist = dist; best = i; y = gap; }
    d.target = best;
    d.col = col;
    if (this.marker.parentElement !== host) host.appendChild(this.marker);
    this.marker.style.top = `${Math.round(y - box.top + host.scrollTop - 1)}px`;
/** The group's tab as last left (remembered with the other groups). */
function savedTab(): LayersTab {
  try { const t = (JSON.parse(localStorage.getItem('formvis.groups') ?? '{}') as Record<string, { tab?: string }>).layers?.tab; return t === 'paths' || t === 'channels' ? t : 'layers'; } catch { return 'layers'; }
}
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><div class="cv-group-tabs" role="tablist"><button class="cv-group-tab is-active" type="button" role="tab" data-tab="layers">Layers</button><button class="cv-group-tab" type="button" role="tab" data-tab="channels">Channels</button><button class="cv-group-tab" type="button" role="tab" data-tab="paths">Paths</button></div><span></span><button class="cv-group-more cv-layers-more" type="button" data-cmd="panel-menu" title="Panel menu" aria-label="Panel menu">${icon('more3', 16)}</button></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="add-mask">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="clip">${icon('clipMask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-layer">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="delete-layer">${icon('delete', 16)}</button></div></section>`);
    for (const t of root.querySelectorAll<HTMLButtonElement>('.cv-layers-panel .cv-group-tab')) t.addEventListener('click', () => this.showTab(t.dataset.tab as LayersTab));
    // The panel menu, by tab: the Layers panel's commands, or the Paths panel's.
    const more = q<HTMLButtonElement>(root, '.cv-layers-more');
    more.addEventListener('click', () => {
      const panel = this.rows.closest('.cv-layers-panel') as HTMLElement;
      const ids = panel.classList.contains('is-paths-tab') ? ['new-path', 'delete-path', '-', 'fill-path-dialog', 'stroke-path-dialog'] : panel.classList.contains('is-channels-tab') ? [] : ['new-layer', 'duplicate-dialog', 'delete-layer', '-', 'new-folder', 'group', '-', 'merge', '-', 'layer-style', 'convert-smart', 'rasterize'];
      if (ids.length) PanelGroup.menuHost?.(more, ids);
    });
    for (const b of this.rows.closest('.cv-layers-panel')?.querySelectorAll<HTMLButtonElement>('.cv-lock-btn') ?? []) {
    for (const b of this.rows.closest('.cv-layers-panel')?.querySelectorAll<HTMLButtonElement>('.cv-kind-btn') ?? []) {
  /** The Paths panel's section becomes this group's Paths tab, as the target's Layers group (Layers | Paths). */
    const panel = this.rows.closest('.cv-layers-panel') as HTMLElement;
    panel.appendChild(section);
    this.showTab(savedTab(), false);
  /** The Channels tab (Phase 21): its panel shown in this group, as Paths is. */
    (this.rows.closest('.cv-layers-panel') as HTMLElement).appendChild(panel.root);
    this.showTab(savedTab(), false);
  showTab(tab: LayersTab, remember = true): void {
    const panel = this.rows.closest('.cv-layers-panel') as HTMLElement;
    panel.classList.toggle('is-paths-tab', tab === 'paths');
    panel.classList.toggle('is-channels-tab', tab === 'channels');
    this.channels?.setVisible(tab === 'channels');
    for (const t of panel.querySelectorAll<HTMLButtonElement>(':scope > .cv-panel-head .cv-group-tab')) {
      const on = t.dataset.tab === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    }
    if (this.paths) setHidden(this.paths, tab !== 'paths');
    if (remember) {
      try { const s = JSON.parse(localStorage.getItem('formvis.groups') ?? '{}'); s.layers = { ...s.layers, tab }; localStorage.setItem('formvis.groups', JSON.stringify(s)); } catch { /* this session only */ }
    }
    this.root = el(`<section class="cv-${id} cv-group" aria-label="${label}"><div class="cv-panel-head cv-group-head"><div class="cv-group-tabs" role="tablist"></div><span></span><button class="cv-group-more" type="button" data-cmd="panel-menu" title="Panel menu" aria-label="Panel menu" hidden>${icon('more3', 16)}</button><button class="cv-group-min" type="button" data-cmd="minimise" title="Minimise" aria-label="Minimise">${icon('minus', 12)}</button></div><div class="cv-group-body"></div></section>`);
    this.show(saved.tab && this.tabs.has(saved.tab) ? saved.tab : list[0].id, false);
    const up = (): void => {
```

Nothing removed from src-tauri or backend.

## Fixes from the owner's walkthrough of 1.49.0 · _v1.49.1 (ui/icons.ts, ui/app-dialogs.ts, ui/panel-group.ts, ui/properties.ts, app.ts; styles)

`tStamp`, `tHistoryBrush`, `tEyedropper` redrawn; `NewCanvasDialog` previews by aspect ratio, Color Mode and bit depth enabled; `PanelGroup.resetStates`; `PropertiesColumn.resetLayout`; Reset Panels restores the whole layout; denser glass. Removed from frontend:

```text
    { id: 'reset-panels', label: 'Reset Panels', run: () => { dock.reset(); PanelGroup.resetHomes(TAB_HOMES); } },
.cv-menu { padding: 6px; border: 1px solid color-mix(in srgb, var(--text-primary) 12%, transparent); border-radius: 12px; background: rgba(40, 39, 44, 0.86); backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55); }
  --glass-bg: color-mix(in srgb, var(--surface-2) 58%, transparent);
  --glass-filter: blur(30px) saturate(1.9);
    const mode = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Color Mode" disabled><option>RGB Color</option></select>');
    const depth = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Bit depth" disabled><option>8 bit</option></select>');
      const page = card.querySelector('.cv-nd-page') as HTMLElement, s = Math.min(150 / p.w, 76 / p.h);
      page.style.width = `${Math.max(8, Math.round(p.w * s))}px`;
      page.style.height = `${Math.max(8, Math.round(p.h * s))}px`;
  tEyedropper: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4.6a2.4 2.4 0 0 1 3.4 0l1.5 1.5a2.4 2.4 0 0 1 0 3.4l-2 2-4.9-4.9z"/><path d="m12.2 7-7.7 7.7-1 4.8 4.8-1 7.7-7.7"/><path d="M11 9.5 14.5 13"/></svg>`,
  tStamp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 13.5V11a2.5 2.5 0 1 0-5 0" transform="translate(5 -3)"/><path d="M9.6 10.5h4.8v3H9.6z"/><path d="M5 13.5h14a1 1 0 0 1 1 1V17H4v-2.5a1 1 0 0 1 1-1z"/><path d="M6 20h12"/><circle cx="12" cy="6" r="2.6"/></svg>`,
  tHistoryBrush: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 3.5c-3.4 1.2-7.2 4.8-9.2 7.7l1.6 1.6c2.9-2 6.4-5.8 7.6-9.3z"/><path d="M10.4 12.1c-2 0-3.3 1.4-3.3 3.1 0 1.2-.7 2.1-1.7 2.4 1.1 1 2.9 1.2 4.3.8 2-.6 2.8-2.4 2.1-4.2"/><path d="M3.5 9.5a6 6 0 0 1 6.2-6"/><path d="M3.2 6.3l.3 3.2 3.1-.6"/></svg>`,
```

Nothing removed from src-tauri or backend.

## The owner's walkthrough of 1.48.0 · _v1.49.0 (ui/channels.ts earlier; extensions/tools/history-brush.ts, frame.ts new; engine/index.ts, engine/types.ts, engine/viewport.ts, io/project-io.ts; ui/dock.ts, ui/panel-group.ts, ui/properties.ts, ui/rail.ts, ui/stage.ts, ui/menu.ts, ui/dropdown.ts, ui/themes.ts, ui/prefs.ts, ui/app-dialogs.ts, ui/history.ts, ui/swatches.ts, ui/layers.ts, app.ts, index.html; extensions/tools/*.ts; styles)

Semantic tokens (surfaces, lines, accent tints, glass) and `--accent-intensity`, `setIntensity`, appearance 3; `enhanceAllSelects`; the main grid's areas; `Viewport.insetRight`, `centerX`; `PropertiesColumn.showingCollapsed`, `openWidth`, `relayout`; `ToolVariant`; `Engine.quickMask`, `toggleQuickMask`, `quickMaskLive`; screen modes, `toggle-panels`, `rail-columns`; `historyBrushTool`, `Engine.historyBrushSource`, `autoFirstSnapshot`, `openingSnapshot`; `frameTool`, `Layer.frame`, `Engine.newFrameLayer`; Edit Toolbar; `Dock` with `side`, `merge`, `separate`, `present`; `PanelGroup.moveTab`, tab homes; `Stage.prefs`; Preferences' new sections. Removed from frontend:

```text
  var DEFAULT_ACCENT = '#aba0d3';
  var theme = DEFAULT_THEME, accent = DEFAULT_ACCENT;
    /* A choice saved before the Studio Dark redesign (no appearance: 2) is set aside once, so everyone sees it. */
    if (raw) { var s = JSON.parse(raw); if (s.appearance === 2) { if (s.theme && PROFILES[s.theme]) theme = s.theme; if (s.accentColor) accent = s.accentColor; } }
import { applyPrefs, loadPrefs, savePrefs } from './ui/prefs';
import { DOCK_PANELS, Dock } from './ui/dock';
<div class="cv-options"></div>
<aside class="cv-rail" aria-label="Tools"><div class="cv-rail-tools"></div><div class="cv-colors"></div></aside>
  new PropertiesColumn(q(root, '.cv-props-col'), engine, (c) => { commands.run(c); }, () => syncPropsCol());
  const syncPropsCol = (): void => { setHidden(q(root, '.cv-props-col'), !propsShown()); setStyleVar(root, '--cv-props-w', propsShown() ? (PropertiesColumn.collapsed() ? '46px' : '284px') : '0px'); };
  const dock = new Dock(q(root, '.cv-layers'));
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); recoveryDelay = pr.recoverySeconds * 1000; home.sync(); syncGpu(); syncEngineDevice(); }),
    ...DOCK_PANELS.map((pn) => ({ id: `panel-${pn.id}`, label: pn.label, checked: () => dock.isShown(pn.id), run: () => dock.toggle(pn.id) })),
    { id: 'reset-panels', label: 'Reset Panels', run: () => dock.reset() },
      { label: 'Modify', items: ['expand', 'contract', 'feather', 'border', 'smooth'] }, '-', 'path-selection', 'delete-path'] },
      { label: 'Guides', items: ['toggle-guides', 'lock-guides', 'new-guide', 'clear-guides'] }] },
    { label: 'Window', items: ['brush-settings', 'paragraph-styles', '-', ...DOCK_PANELS.map((pn) => `panel-${pn.id}`), 'panel-paths', 'panel-properties-col', '-', 'reset-panels'] },
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode | 'remove'; healFrom?: Pt } | null = null;
    let n = list.length + 1;
    const a = at ?? { x: v.width / 2, y: v.height / 2 };
          transform: { ...docTransform(img.width, img.height), x: Math.floor(c.x - img.width / 2), y: Math.floor(c.y - img.height / 2) },
  beginRetouchStroke(kind: 'heal' | 'remove' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge', pt: Pt, shift: boolean): boolean {
    p.history.begin({ heal: 'Spot Healing', remove: 'Remove', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge' }[kind], p.snapshot());
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'idle';
    const z = Math.min((this.width - margin * 2) / dw, (this.height - margin * 2) / dh);
    this.panX = Math.round((this.width - dw * this.zoom) / 2);
  const r = Math.max(0.5, (ctx.engine.brush.diameter * v.zoom) / 2);
  g.strokeStyle = pal.antsA;
  g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = pal.antsB;
  g.beginPath(); g.arc(c.x, c.y, r + 1, 0, Math.PI * 2); g.stroke();
  for (const tool of [moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
  icon: (e) => (e.shapeSettings.kind === 'ellipse' || e.shapeSettings.kind === 'heart' ? 'tEllipseShape' : 'tRect'),
  icon: (e) => (e.retouch.smearMode === 'blur' || e.retouch.smearMode === 'sharpen' ? 'tBlur' : 'tSmudge'),
.cv-dialog { border: 1px solid #3a3a3a; border-radius: 14px; background: #1c1c1c; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); }
.cv-dialog-head [data-close] { border-radius: 50%; background: #2a2a2a; }
.cv-dialog-foot .cv-btn-primary { border: 1px solid #ebebeb; background: #ffffff; color: #000000; }
.cv-dialog-foot .cv-btn-primary:hover { background: #f2f2f2; color: #000000; }
.cv-dialog-foot .cv-btn-ghost { border: 1px solid #3a3a3a; background: #1c1c1c; color: var(--text-primary); }
.cv-nd-cats { display: flex; flex-direction: column; gap: 2px; padding: 12px 8px; background: #161616; border-right: 1px solid #242424; }
.cv-nd-cat.is-on { background: #2a2a2a; color: var(--text-primary); }
.cv-nd-searchbox { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid #34333a; border-radius: 10px; background: #222127; color: var(--text-muted); }
.cv-nd-card { display: flex; flex-direction: column; gap: 4px; padding: 6px 6px 8px; border: 1px solid #2e2e2e; border-radius: 12px; background: #1c1c1c; color: var(--text-primary); font: inherit; text-align: left; cursor: pointer; min-width: 0; }
.cv-nd-card:hover { border-color: #3a3a3a; }
.cv-nd-card.is-on { border-color: transparent; background: linear-gradient(#1f1d24, #1f1d24) padding-box, linear-gradient(135deg, #aba0d3, #d99ac5) border-box; box-shadow: 0 0 18px rgba(171, 160, 211, 0.18); }
.cv-nd-thumb { display: grid; place-items: center; height: 78px; border-radius: 8px; background: #151515; }
.cv-nd-side { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px; border-left: 1px solid #242424; overflow-y: auto; }
.cv-nd-input { width: 100%; min-width: 0; height: 36px; padding: 0 10px; border: 1px solid #303035; border-radius: 9px; background: #222127; color: var(--text-primary); font: inherit; font-size: 14px; }
.cv-nd-link { width: 30px; height: 30px; margin-bottom: 3px; border: 1px solid #34333a; border-radius: 8px; background: #1c1c1c; color: var(--text-muted); cursor: pointer; }
.cv-nd-link.is-on { background: #2e2b3a; border-color: #4a4658; color: var(--accent-color); }
.cv-nd-seg { display: flex; gap: 2px; width: 100%; padding: 3px; border: 1px solid #303035; border-radius: 9px; background: #1a1a1a; }
.cv-nd-seg button.is-on { background: #3a3a3a; }
.cv-nd-summary { margin-top: auto; padding-top: 12px; border-top: 1px solid #34333a; }
.cv-savechanges .cv-note { margin: 0; padding-bottom: 14px; border-bottom: 1px solid #34333a; color: var(--text-secondary); font-size: 14px; }
.cv-panel-head { background: #000000; border-bottom: 0; height: 40px; }
.cv-panel-title { padding: 5px 11px; border: 1px solid #3a3a3a; border-radius: 8px; background: #2a2a2a; color: var(--text-primary); font-size: 13px; font-weight: 500; text-transform: none; letter-spacing: 0; }
.cv-layer { margin: 3px 8px; border: 1px solid #2a2a2a; border-radius: 8px; background: #1c1c1c; }
.cv-layer:hover { border-color: #34333a; }
.cv-layer.is-active { border-color: #3d3a48; background: linear-gradient(90deg, #2b2b2b 0%, #35333d 55%, #413e4b 100%); color: var(--text-primary); }
.cv-group { display: flex; flex-direction: column; border-bottom: 1px solid #0b0b0b; }
.cv-group-head { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 8px; background: #000000; border-bottom: 0; }
.cv-group-tab.is-active { border-color: #3a3a3a; background: #2a2a2a; color: var(--text-primary); font-weight: 500; }
.cv-group-min { display: inline-grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%; background: #1c1c1c; color: var(--text-secondary); cursor: pointer; }
.cv-group-min:hover { color: var(--text-primary); background: #2a2a2a; }
.cv-slider::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: #2b2a2f; }
.cv-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; background: #ffffff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
.cv-slider::-moz-range-track { height: 4px; border-radius: 2px; background: #2b2a2f; }
.cv-slider::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: #ffffff; }
.cv-nav-card { position: relative; height: clamp(90px, 13vh, 170px); border-radius: 10px; background: #191919; overflow: hidden; }
.cv-nav-zooms { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); display: flex; padding: 3px; border: 1px solid #3a3a3a; border-radius: 12px; background: rgba(31, 31, 31, 0.92); }
.cv-nav-zooms button { height: 24px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: #d4d4d4; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.cv-nav-zooms button:hover { background: #2a2a2a; color: #ffffff; }
.cv-sw-tile { width: 18px; height: 18px; padding: 0; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 3px; cursor: pointer; }
.cv-sw-tile:hover { outline: 1px solid #ffffff; outline-offset: 1px; }
.cv-sw-add { display: inline-grid; place-items: center; background: #1c1c1c; color: var(--text-secondary); }
.cv-kind-icons { display: flex; gap: 1px; padding: 2px; border: 1px solid #34333a; border-radius: 8px; }
.cv-kind-btn.is-on { background: #2e2b3a; color: var(--text-primary); box-shadow: inset 0 0 0 1px #4a4658; }
.cv-vsep { width: 1px; height: 18px; background: #34333a; flex: none; }
.cv-num { display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border: 1px solid #303035; border-radius: 6px; background: #222127; }
.cv-props-col { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; background: #111112; border-left: 1px solid #0b0b0b; }
.cv-props-head { display: flex; align-items: center; gap: 12px; padding: 8px 4px 12px; border-bottom: 1px solid #36343b; }
.cv-props-tile { display: inline-grid; place-items: center; width: 36px; height: 36px; border: 1px solid #34333a; border-radius: 8px; background: #1c1c1c; color: var(--text-secondary); }
.cv-link-btn { display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none; border: 1px solid #34333a; border-radius: 7px; background: #1c1c1c; color: var(--text-muted); cursor: pointer; }
.cv-link-btn.is-on { background: #2e2b3a; border-color: #4a4658; color: var(--accent-color); }
.cv-brush-tip { width: 88px; height: 88px; flex: none; border: 1px solid #34333a; border-radius: 6px; background: #151515; }
.cv-brush-stroke { display: block; width: 100%; height: 56px; border-radius: 6px; background: #1c1c1c; }
.cv-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid #3a3a3a; border-radius: 7px; background: #1c1c1c; color: var(--text-primary); font: inherit; font-size: 13px; cursor: pointer; }
.cv-btn:hover { background: #242424; }
.cv-seg { display: flex; gap: 2px; padding: 3px; border: 1px solid #34333a; border-radius: 9px; background: #151515; }
.cv-seg button.is-on { background: #2e2b3a; color: var(--accent-color); }
.cv-lock-btn.is-on { background: #2e2b3a; color: var(--accent-color); box-shadow: inset 0 0 0 1px #4a4658; }
.cv-brush-find { display: flex; align-items: center; gap: 8px; margin: 10px 0 8px; padding-top: 10px; border-top: 1px solid #34333a; }
.cv-brush-search { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; height: 30px; padding: 0 10px; border: 1px solid #303035; border-radius: 8px; background: #1c1c1c; color: var(--text-muted); }
.cv-brush-views button.is-on { border-color: #3a3a3a; background: #2a2a2a; color: var(--text-primary); }
.cv-brush-folder { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: #1c1c1c; color: var(--text-primary); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.cv-brush-tile:hover { background: #1f1e24; }
.cv-brush-tile.is-on { border-color: #4a4658; background: #2e2b3a; color: var(--text-primary); }
.cv-menu { padding: 6px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; background: rgba(40, 39, 44, 0.86); backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55); }
.cv-menu-item:hover:not(:disabled), .cv-menu-item.is-focus:not(:disabled) { background: rgba(255, 255, 255, 0.1); color: var(--text-primary); }
.cv-menu-sep { height: 1px; margin: 6px 10px; background: rgba(255, 255, 255, 0.12); }
.cv-strip-btn:hover, .cv-strip-btn.is-on { border-color: #34333a; background: #1f1e24; color: var(--text-primary); }
.cv-group-collapse:hover { background: #242328; color: var(--text-primary); }
.cv-props-fly { position: fixed; z-index: var(--z-context); width: 284px; max-height: calc(100vh - 24px); overflow-y: auto; border: 1px solid #3a3a3a; border-radius: 12px; background: #111112; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6); }
.cv-dock-split:hover::after { background: #5a5960; }
.cv-ch-row { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 10px 0 6px; border: 1px solid #2a2a2a; border-radius: 8px; background: #1c1c1c; color: var(--text-primary); font-size: 13px; cursor: pointer; }
.cv-ch-row.is-on { border-color: #4a4658; background: linear-gradient(90deg, #26242d, #413e4b); }
.cv-ch-thumb { width: 44px; height: 30px; border-radius: 4px; background: #2a2a2a; }
.cv-group-more:hover { background: #242328; color: var(--text-primary); }
.cv-home { position: fixed; top: var(--cv-titlebar-h); left: 0; right: 0; bottom: 0; z-index: calc(var(--z-menu) - 1); display: grid; place-items: center; background: #000000; overflow-y: auto; }
.cv-home-brand { display: flex; align-items: baseline; gap: 10px; margin: 0; color: #ffffff; font-size: 38px; font-weight: 400; letter-spacing: -0.015em; }
.cv-home-action { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 8px 0 12px; border: 1px solid #2a2a2a; border-radius: 6px; background: #111111; color: var(--text-primary); font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
.cv-home-action:first-child { width: 210px; border-color: #ebebeb; background: #ffffff; color: #000000; box-shadow: 0 0 22px rgba(255, 255, 255, 0.09); }
.cv-key { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 5px; background: #1a1a1a; color: var(--text-primary); font: inherit; font-size: 12px; }
.cv-home-action:first-child .cv-key { background: #f0f0f0; color: #000000; }
.cv-home-item:hover { border-color: #2a2a2a; background: #111111; color: var(--text-primary); }
.cv-rail { background: linear-gradient(to bottom, #181818 0%, #272430 9%, #2b2739 16%, #252127 24%, #1e1d1e 29%, #1e1d1e 70%, #212027 80%, #2b2639 90%, #302a42 100%); border-right-color: #111111; }
.cv-tool.is-active { background: #2e2b3a; border-color: #4a4658; border-radius: 8px; color: var(--text-primary); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06); }
.cv-titlebar { grid-template-columns: auto auto minmax(0, 1fr) auto auto; background: linear-gradient(to bottom, #1c1c1c, #151515); border-bottom: 1px solid #0b0b0b; }
.cv-tt-btn { display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid #34333a; border-radius: 7px; background: #161616; color: var(--text-secondary); cursor: pointer; }
.cv-tt-btn:hover { color: var(--text-primary); background: #1f1f1f; }
.cv-tt-btn.is-on { border-color: #4a4658; background: #2e2b3a; color: var(--accent-color); }
.cv-tt-select { width: 154px; height: 28px; padding: 0 8px; border: 1px solid #34333a; border-radius: 8px; background: #141414; color: var(--text-primary); font: inherit; font-size: 13px; }
.cv-search-pop { position: absolute; top: 36px; right: 0; z-index: var(--z-menu); width: 340px; padding: 8px; border: 1px solid #3a3a3a; border-radius: 12px; background: #1c1c1c; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55); }
.cv-search-input { width: 100%; height: 32px; padding: 0 10px; border: 1px solid #303035; border-radius: 8px; background: #222127; color: var(--text-primary); font: inherit; font-size: 13px; outline: 0; }
.cv-search-item.is-picked, .cv-search-item:hover { background: #2e2b3a; color: var(--text-primary); }
.cv-tab { border-radius: 8px 8px 0 0; border: 1px solid #2a2a2a; border-bottom-color: transparent; background: #161616; }
.cv-tab.is-active { background: #343434; border-color: #3a3a3a; border-bottom-color: transparent; }
.cv-tab-close { border-radius: 50%; background: #2a2a2a; }
.cv-tab-close:hover { background: #3a3a3a; }
.cv-options { background: #111111; border-bottom-color: #0b0b0b; }
.cv-opt-title { padding: 4px 10px; border: 1px solid #3a3a3a; border-radius: 8px; background: #1f1f1f; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05); }
.cv-doc-tabs { display: flex; align-items: flex-end; height: 34px; padding: 0 8px; background: #111111; border-bottom: 1px solid #0b0b0b; }
.cv-tool.has-group::after { right: 4px; bottom: 4px; width: 4px; height: 4px; border: 0; border-radius: 50%; background: #6f6d76; }
.cv-tool.has-group.is-active::after { background: #c8bafa; }
.cv-flyout { min-width: 220px; padding: 6px; border: 1px solid #3a3a3a; border-radius: 12px; background: #1c1c1c; box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55); }
.cv-flyout-item:hover { background: #2e2b3a; color: var(--text-primary); }
.cv-flyout-key { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 6px; background: #2a2a2a; color: var(--text-primary); font-size: 12px; }
.cv-dd-btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; height: 28px; padding: 0 8px 0 10px; border: 1px solid #34333a; border-radius: 8px; background: #1c1c1c; color: var(--text-primary); font: inherit; font-size: 13px; cursor: pointer; }
.cv-title-tools .cv-dd-btn { width: 154px; background: #141414; }
.cv-dd-pop { position: fixed; z-index: var(--z-context); max-height: 60vh; overflow-y: auto; padding: 6px; border: 1px solid #3a3a3a; border-radius: 12px; background: #1c1c1c; box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55); }
.cv-dd-search { width: 100%; height: 30px; margin-bottom: 6px; padding: 0 10px; border: 1px solid #303035; border-radius: 8px; background: #222127; color: var(--text-primary); font: inherit; font-size: 13px; outline: 0; }
.cv-dd-item.is-picked, .cv-dd-item:hover { background: #2e2b3a; color: var(--text-primary); }
.cv-tool { width: 32px; height: 26px; border-radius: 7px; color: #c9c8ce; }
.cv-tool:hover { color: #ffffff; background: #242328; }
.cv-tool.is-active { width: 32px; height: 28px; margin: 1px 0; color: #ffffff; }
.cv-rail-sep { display: block; width: 6px; height: 2px; margin: 5px auto; border-radius: 1px; background: #4a4950; }
.cv-tool.is-active { color: #c8bafa; }
.cv-opt-icon { display: inline-grid; place-items: center; width: 30px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: #c9c8ce; cursor: pointer; }
.cv-opt-icon:hover { background: #242328; color: #ffffff; }
.cv-opt-sep { display: inline-block; width: 1px; height: 20px; margin: 0 6px; background: #34333a; vertical-align: middle; }
  --accent-color: #aba0d3;
  --accent-color-dim: #aba0d333;
  --accent-color-hover: #c8bafa;
  --accent-tint: rgba(249, 115, 22, 0.06);
  --accent-tint-strong: rgba(249, 115, 22, 0.10);
import { THEMES, readChoice, setAccent, setTheme, themeSwatchesHtml } from './themes';
import { ENGINE_CHOICES, RECOVERY_CHOICES, loadPrefs, savePrefs, type EngineDevice, type Prefs } from './prefs';
    add('General', this.homeRow.el, el('<p class="cv-note">With it on, the Home screen shows whenever no document is open. The brand mark at the top left opens it at any time; Esc leaves it.</p>'));
    add('Interface', row, accentRow, el('<p class="cv-note">Theme and accent are shared with NodeMode on this device.</p>'));
    add('Performance', this.statesRow.el, this.memoryRow.el, this.redrawRow.el,
      el('<p class="cv-note">History States is how many steps undo keeps (Photoshop keeps 50 by default, up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as Photoshop\'s Memory Usage does, so this is the part formvis controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.</p>'),
interface DockState { order: string[]; hidden: string[] }
const DEFAULT: DockState = { order: DOCK_PANELS.map((p) => p.id), hidden: ['timeline', 'history'] };
    const ids = DOCK_PANELS.map((p) => p.id);
    const order = Array.isArray(r.order) ? r.order.filter((id): id is string => ids.includes(id as string)) : [];
    // A panel missing from a saved arrangement (one saved before it could move) takes its default place, not the end.
    for (const id of ids) if (!order.includes(id)) order.splice(Math.min(ids.indexOf(id), order.length), 0, id);
    return { order, hidden };
  } catch { return { ...DEFAULT, order: [...DEFAULT.order] }; }
  private drag: { id: string; startY: number; moving: boolean; target: number } | null = null;
  constructor(private readonly dock: HTMLElement) {
    for (const p of DOCK_PANELS) {
        this.drag = { id: p.id, startY: e.clientY, moving: false, target: -1 };
  reset(): void { this.state = { order: [...DEFAULT.order], hidden: [...DEFAULT.hidden] }; this.heights = {}; this.saveHeights(); this.save(); }
    this.state = { order: o, hidden: hidden.filter((id) => ids.includes(id)) };
    const p = DOCK_PANELS.find((x) => x.id === id);
    return p ? this.dock.querySelector<HTMLElement>(p.selector) : null;
    for (const id of this.state.order.filter((x) => this.isShown(x))) {
    const first = this.state.order.find((x) => this.isShown(x)), head = first ? this.section(first)?.querySelector(':scope > .cv-panel-head') : null;
    const want = this.state.order.map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    for (const id of this.state.order) { const s = this.section(id); if (s) setHidden(s, !this.isShown(id)); }
    return this.state.order.filter((id) => this.isShown(id)).map((id) => ({ id, s: this.section(id) })).filter((x): x is { id: string; s: HTMLElement } => !!x.s);
    if (!d.moving) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const shown = this.state.order.filter((id) => this.isShown(id)).map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    const box = this.dock.getBoundingClientRect();
    let best = 0, bestDist = Infinity, y = 0;
    this.marker.style.top = `${Math.round(y - box.top - 1)}px`;
    const shown = this.state.order.filter((id) => this.isShown(id));
    const rest = this.state.order.filter((id) => id !== d.id);
    const at = before && before !== d.id ? rest.indexOf(before) : before === d.id ? this.state.order.indexOf(d.id) : rest.length;
    rest.splice(at, 0, d.id);
    this.state.order = rest;
  document.getElementById('overlay-root')?.appendChild(pop) ?? document.body.appendChild(pop);
        const row = el(`<div class="cv-history-row" role="option"><span class="cv-history-icon">${icon(r.snap ? 'camera' : r.index === 0 ? 'image' : 'history', 12)}</span><span class="cv-history-name"></span></div>`);
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><div class="cv-group-tabs" role="tablist"><button class="cv-group-tab is-active" type="button" role="tab" data-tab="layers">Layers</button><button class="cv-group-tab" type="button" role="tab" data-tab="channels">Channels</button><button class="cv-group-tab" type="button" role="tab" data-tab="paths">Paths</button></div><span></span><button class="cv-group-more cv-layers-more" type="button" data-cmd="panel-menu" title="Panel menu" aria-label="Panel menu">${icon('more3', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="add-mask">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="clip">${icon('clipMask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-layer">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="delete-layer">${icon('delete', 16)}</button></div></section>`);
      engine.pan(v.width / 2 - x * v.zoom - v.panX, v.height / 2 - y * v.zoom - v.panY);
    for (const t of list) {
      const btn = el<HTMLButtonElement>('<button class="cv-group-tab" type="button" role="tab"></button>');
      setText(btn, t.label);
      btn.dataset.tab = t.id;
      btn.addEventListener('click', () => this.show(t.id));
      strip.appendChild(btn);
      t.body.classList.add('cv-group-page');
      body.appendChild(t.body);
      this.tabs.set(t.id, { btn, body: t.body });
    }
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice }
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto' };
    const host = this.root, groups = Array.from(host.querySelectorAll<HTMLElement>(':scope > .cv-group'));
    const ICONS: Record<string, [string, string]> = { properties: ['panelProps', 'Properties'], brushes: ['tBrush', 'Brushes'], paragraph: ['pilcrow', 'Paragraph'], character: ['charA', 'Character'] };
    for (const g of groups) {
      const id = Array.from(g.classList).find((c) => c.startsWith('cv-') && c !== 'cv-group')?.slice(3) ?? '';
      const [ic, label] = ICONS[id] ?? ['panelProps', id];
      const b = el<HTMLButtonElement>(`<button class="cv-strip-btn" type="button" title="${label}" aria-label="${label}">${icon(ic, 18)}</button>`);
      b.dataset.group = id;
      b.addEventListener('click', () => {
        if (open?.group === g) { closeFly(); return; }
        closeFly();
        const mark = document.createComment(id);
        g.replaceWith(mark);
        fly.appendChild(g);
        setHidden(fly, false);
        open = { group: g, mark, btn: b };
        b.classList.add('is-on');
        const r = b.getBoundingClientRect(), s = strip.getBoundingClientRect();
        fly.style.right = `${Math.round(window.innerWidth - s.left + 6)}px`;
        fly.style.top = `${Math.round(Math.max(8, Math.min(r.top, window.innerHeight - fly.offsetHeight - 8)))}px`;
      });
      strip.appendChild(b);
    }
      closeFly();
      host.classList.toggle('is-collapsed', on);
      this.onLayout();
    const head = groups[0]?.querySelector('.cv-group-head'), min = head?.querySelector('.cv-group-min');
    const collapse = el<HTMLButtonElement>(`<button class="cv-group-collapse" type="button" title="Collapse to icons" aria-label="Collapse to icons">${icon('collapseRight', 14)}</button>`);
    if (min) min.after(collapse); else head?.appendChild(collapse);
    host.classList.toggle('is-collapsed', PropertiesColumn.collapsed());
        for (let i = 0; i < p.tip.data.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 240; img.data[i * 4 + 3] = p.tip.data[i]; }
        gr.addColorStop(0, 'rgba(240,240,244,1)'); gr.addColorStop(Math.min(0.999, Math.max(0, p.hardness)), 'rgba(240,240,244,1)'); gr.addColorStop(1, 'rgba(240,240,244,0)');
      const k = [view, q0, e.brushPresetId, [...shut].join(','), allBrushPresets().map((p) => p.id).join(',')].join('|');
      grad.addColorStop(0, 'rgba(236,236,240,1)'); grad.addColorStop(Math.min(0.999, Math.max(0, hard)), 'rgba(236,236,240,1)'); grad.addColorStop(1, 'rgba(236,236,240,0)');
        tg.strokeStyle = 'rgba(255,255,255,0.18)'; tg.lineWidth = dpr; tg.beginPath(); tg.moveTo(cx - R * 1.2, cy); tg.lineTo(cx + R * 1.2, cy); tg.moveTo(cx, cy - R * 1.2); tg.lineTo(cx, cy + R * 1.2); tg.stroke();
        tg.strokeStyle = '#f0f0f4'; tg.lineWidth = 1.5 * dpr; tg.beginPath(); tg.ellipse(cx, cy, R, ry, a, 0, Math.PI * 2); tg.stroke();
        tg.fillStyle = '#ffffff';
import { el, q, setClass, setHtml, setText, setTitle, setValue } from './dom';
      const b = el<HTMLButtonElement>(`<button class="cv-tool${group.tools.length > 1 ? ' has-group' : ''}" type="button" aria-haspopup="${group.tools.length > 1 ? 'menu' : 'false'}"></button>`);
      if (group.tools.length > 1) {
      setTitle(node, t.id === 'brush' ? 'Brush (B) · Eraser (E)' : group.tools.length > 1 ? `${t.label} (${group.key}) · hold or right-click for ${group.tools.length} tools · Shift+${group.key} cycles` : `${t.label} (${group.key})`);
    if (this.flyoutFor !== group) {
      this.flyout.textContent = '';
      for (const t of group.tools) {
        const row = el<HTMLButtonElement>(`<button class="cv-flyout-item" role="menuitem" type="button">${icon(t.icon(this.engine), 16)}<span class="cv-flyout-label"></span><span class="cv-flyout-key"></span></button>`);
        setText(q(row, '.cv-flyout-label'), t.label);
        setText(q(row, '.cv-flyout-key'), group.key);
        row.dataset.tool = t.id;
        row.addEventListener('click', () => { this.closeFlyout(); this.engine.setTool(t.id); if (t.id === 'brush') this.engine.setBrushMode('paint'); });
        this.flyout.appendChild(row);
      }
      this.flyoutFor = group;
    for (const row of Array.from(this.flyout.children) as HTMLElement[]) setClass(row, 'is-active', row.dataset.tool === this.engine.tool);
    const key = `${this.dpr}|${pal.checkerA}|${pal.checkerB}`;
    const cell = Math.max(1, Math.round(8 * this.dpr));
        { a: this.rgb(pal.checkerA), b: this.rgb(pal.checkerB), cell: Math.max(1, Math.round(8 * this.dpr)), origin: [Math.round(ox), Math.round(oy)] });
        g.strokeStyle = pal.grid;
      g.strokeStyle = pal.accent;
    const v = (this.engine.current as NonNullable<Engine['current']>).viewport, pal = paint(), d = this.dpr, step = Stage.rulerStep(v.zoom);
    const minor = step * v.zoom >= 150 ? step / 10 : step / 5;
      const first = Math.floor(-pan / v.zoom / minor) * minor;
      for (let t = first; t * v.zoom + pan <= len; t += minor) {
        const s = Math.round(t * v.zoom + pan) + 0.5, isMajor = Math.abs(t / step - Math.round(t / step)) < 1e-6, tick = isMajor ? RULER : RULER / 3;
    if (sel || fl) {
      if (e.ctrlKey || e.metaKey) {
  it('starts from the same default theme and accent: Studio Dark, lavender', () => {
    expect([DEFAULT_THEME, DEFAULT_ACCENT]).toEqual(['studio', '#aba0d3']);
      expect(readChoice()).toEqual({ theme: 'studio', accentColor: '#aba0d3' });
      saveChoice({ theme: 'mono', accentColor: '#ff0000' });                                         // chosen after the redesign
      expect(readChoice()).toEqual({ theme: 'mono', accentColor: '#ff0000' });
      expect(html).toContain('if (s.appearance === 2)');                                              // the boot script agrees
export const DEFAULT_ACCENT = '#aba0d3';
export interface ThemeChoice { theme: string; accentColor: string }
 *  redesign reaches everyone; anything chosen since is saved with it and kept. index.html's boot script agrees. */
export const APPEARANCE = 2;
      if (saved.appearance === APPEARANCE) return { theme: saved.theme || DEFAULT_THEME, accentColor: saved.accentColor || DEFAULT_ACCENT };
  return { theme: DEFAULT_THEME, accentColor: DEFAULT_ACCENT };
```

Nothing removed from src-tauri or backend.

## The owner's walkthrough corrections · _v1.48.0 (ui/channels.ts new; extensions/tools/*.ts icon lines, move.ts, tone.ts; extensions/registry.ts; ui/icons.ts, ui/rail.ts, ui/options.ts, ui/menu.ts, ui/properties.ts, ui/dock.ts, ui/layers.ts, ui/panel-group.ts, ui/navigator.ts, ui/swatches.ts, app.ts; engine/index.ts, engine/brush-dynamics.ts; styles)

Tool icons (`tMove` ... `tZoom`) and the rail's family dashes; the options bar's tool chip, compact buttons and the Move bar (`autoSelectTarget`); `PopupMenu` `has-checks`; the Brushes group (presets in folders, search, grid or list, Load, the tip editor, a Brush Settings tab), `BrushPreset.angle`/`roundness`, the Flat angled preset; `PropertiesColumn.collapsible`; `Dock` splitters, `sizeGroups`, `setCollapsed`; `ChannelsPanel`; `PanelGroup.setMenu`, `menuHost`; `SwatchesPanel.addForeground`, `reset`; commands `load-brushes`, `swatch-add`, `swatches-reset`. Removed from frontend:

```text
  new PropertiesColumn(q(root, '.cv-props-col'), engine, (c) => { commands.run(c); });
  const syncPropsCol = (): void => { setHidden(q(root, '.cv-props-col'), !propsShown()); setStyleVar(root, '--cv-props-w', propsShown() ? '284px' : '0px'); };
  new SwatchesPanel(q(root, '.cv-layers'), engine);
export interface BrushPreset { id: string; name: string; description: string; diameter: number; hardness: number; opacity: number; dynamics: BrushDynamics; tip?: SampledTip }
type Settings = Pick<Engine, 'selectionMode' | 'marqueeKind' | 'lassoKind' | 'showPixelGrid' | 'showTransformControls' | 'autoSelect' | 'lockRatio'>;
  | { kind: 'button'; label: string; icon?: string; run: () => void }
  icon: (e) => (e.brushMode === 'erase' ? 'eraser' : 'brush'),
  icon: () => 'bucket',
  icon: () => 'duplicate',
  icon: () => 'crop',
  icon: () => 'penTool',
  icon: () => 'directSelectTool',
  icon: () => 'eyeDropper',
  icon: () => 'paintbrush',
  icon: () => 'gradient',
  icon: () => 'hand',
  icon: () => 'sparkle',
  icon: () => 'healBrushTool',
  icon: (e) => (e.lassoKind === 'polygonal' ? 'lassoSelect' : 'lasso'),
  icon: (e) => (e.marqueeKind === 'ellipse' ? 'ellipseSelect' : 'marquee'),
import { digitOf, type Tool, type ToolContext, type ToolPointer } from '../registry';
  icon: () => 'cursor',
    if (p.mod || e.autoSelect) { const id = e.layerAt(p.doc); if (id) e.selectLayer(id); }
      { kind: 'toggle', label: 'Auto-select', get: () => e.autoSelect, set: (v) => e.update({ autoSelect: v }) },
      { kind: 'toggle', label: 'Transform controls', get: () => e.showTransformControls, set: (v) => e.update({ showTransformControls: v }) },
      { kind: 'toggle', label: 'Keep proportions', get: () => e.lockRatio, set: (v) => e.update({ lockRatio: v }) },
      { kind: 'number', label: 'X', get: () => t()?.x ?? null, set: (v) => e.setLayerTransform({ x: v }, 'Move Layer') },
      { kind: 'number', label: 'Y', get: () => t()?.y ?? null, set: (v) => e.setLayerTransform({ y: v }, 'Move Layer') },
      { kind: 'number', label: 'W', min: 1, get: () => t()?.w ?? null, set: (v) => e.resizeLayerTo(v, true) },
      { kind: 'number', label: 'H', min: 1, get: () => t()?.h ?? null, set: (v) => e.resizeLayerTo(v, false) },
      { kind: 'number', label: 'Scale', unit: '%', min: 1, get: () => { const l = e.activeLayer, tt = t(); return l?.raster && tt ? (tt.w / l.raster.width) * 100 : null; }, set: (v) => e.scaleLayerTo(v) },
      { kind: 'number', label: 'Angle', unit: '\u00b0', get: () => t()?.rotation ?? null, set: (v) => e.setLayerTransform({ rotation: v }, 'Rotate Layer') },
      { kind: 'segment', label: 'Sampling', choices: [{ id: 'nearest', label: 'Nearest' }, { id: 'smooth', label: 'Smooth' }, { id: 'high', label: 'High quality' }], get: () => t()?.sampling ?? 'high', set: (v) => e.setLayerTransform({ sampling: v as Transform['sampling'] }, 'Layer Sampling') },
      { kind: 'button', label: 'Flip horizontal', icon: 'flipH', run: () => e.flipLayers(true) },
      { kind: 'button', label: 'Flip vertical', icon: 'flipV', run: () => e.flipLayers(false) },
  icon: () => 'objectSelect',
  icon: () => 'patchTool',
  icon: () => 'cursor',
  icon: () => 'penTool',
  icon: () => 'quickSelect',
  icon: () => 'eraser',
  icon: (e) => (e.shapeSettings.kind === 'ellipse' || e.shapeSettings.kind === 'heart' ? 'circleTool' : 'rectTool'),
  icon: (e) => (e.retouch.smearMode === 'blur' || e.retouch.smearMode === 'sharpen' ? 'blurTool' : 'smudge'),
    icon: () => id,
  icon: () => 'typeTool',
  icon: () => 'wandSelect',
  icon: () => 'zoomIn',
.cv-layers-panel.is-paths-tab { grid-template-rows: auto minmax(0, 1fr); }
.cv-layers-panel.is-paths-tab > .cv-layer-props, .cv-layers-panel.is-paths-tab > .cv-layer-list, .cv-layers-panel.is-paths-tab > .cv-panel-foot { display: none; }
  reset(): void { this.state = { order: [...DEFAULT.order], hidden: [...DEFAULT.hidden] }; this.save(); }
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><div class="cv-group-tabs" role="tablist"><button class="cv-group-tab is-active" type="button" role="tab" data-tab="layers">Layers</button><button class="cv-group-tab" type="button" role="tab" data-tab="paths">Paths</button></div><span></span><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
    for (const t of root.querySelectorAll<HTMLButtonElement>('.cv-layers-panel .cv-group-tab')) t.addEventListener('click', () => this.showTab(t.dataset.tab as 'layers' | 'paths'));
    let tab: 'layers' | 'paths' = 'layers';
    try { tab = (JSON.parse(localStorage.getItem('formvis.groups') ?? '{}') as Record<string, { tab?: string }>).layers?.tab === 'paths' ? 'paths' : 'layers'; } catch { /* layers */ }
    this.showTab(tab, false);
  showTab(tab: 'layers' | 'paths', remember = true): void {
        const n = el('<span class="cv-opt-title"></span>');
        setText(n, spec.text);
    this.root = el(`<section class="cv-${id} cv-group" aria-label="${label}"><div class="cv-panel-head cv-group-head"><div class="cv-group-tabs" role="tablist"></div><span></span><button class="cv-group-min" type="button" data-cmd="minimise" title="Minimise" aria-label="Minimise">${icon('minus', 12)}</button></div><div class="cv-group-body"></div></section>`);
  constructor(host: HTMLElement, private readonly engine: Engine, run: (cmd: string) => void) {
      <div class="cv-brush-stroke-head"><span>Stroke preview</span></div><canvas class="cv-brush-stroke" aria-label="Stroke preview"></canvas>
      <div class="cv-brush-actions"><button class="cv-btn" type="button" data-run="brush-settings">${icon('sliders', 14)}<span>Brush Settings</span></button></div>
    const sliders = body.querySelector('.cv-brush-sliders') as HTMLElement;
    const rows = [
      { label: 'Size', unit: 'px', min: 1, max: 1000, step: 1, get: () => e.brush.diameter, put: (v: number) => e.setBrush({ diameter: Math.round(v) }), toS: (v: number) => (Math.log(v) / LOG) * 1000, fromS: (s: number) => Math.exp((s / 1000) * LOG) },
      { label: 'Hardness', unit: '%', min: 0, max: 100, step: 1, get: () => e.brush.hardness * 100, put: (v: number) => e.setBrush({ hardness: v / 100 }), toS: (v: number) => v * 10, fromS: (s: number) => s / 10 },
    ];
    for (const r of rows) {
      const row = el(`<div class="cv-brush-row"><div class="cv-brush-row-head"><span>${r.label}:</span></div><input class="cv-slider" type="range" min="0" max="1000" step="1" aria-label="${r.label}"></div>`);
      const field = numField(r.unit, r.label, r.min, r.max, r.step, r.put), slider = row.querySelector('input') as HTMLInputElement;
      slider.addEventListener('input', () => r.put(Math.min(r.max, Math.max(r.min, r.fromS(Number(slider.value))))));
      setters.push(() => { field.set(r.get()); if (document.activeElement !== slider) slider.value = String(Math.round(r.toS(Math.max(r.min, r.get())))); });
      sliders.appendChild(row);
    }
    (body.querySelector('[data-run]') as HTMLElement).addEventListener('click', () => run('brush-settings'));
    new PanelGroup(this.root, 'brushes', [{ id: 'brushes', label: 'Brushes', body }], 'Brushes');
      const hard = e.brush.hardness;
      const tg = tip.getContext('2d') as CanvasRenderingContext2D;
        dab(tg, cx, cy, R, hard);
    this.refreshers.push(() => { for (const s of setters) s(); requestAnimationFrame(paint); });
    add.addEventListener('click', () => { const c = hex(this.engine.fg); if (!this.list.includes(c)) { this.list.push(c); this.save(); this.renderGrid(); } });
```

Nothing removed from src-tauri or backend.

## The target's layout and experience · _v1.47.0 (Phase 21 steps 2 to 6: ui/panel-group.ts, ui/navigator.ts, ui/swatches.ts, ui/properties.ts, ui/titlebar-tools.ts, ui/native-menu.ts, ui/dropdown.ts new; ui/layers.ts, ui/dock.ts, ui/menu.ts, ui/dialogs.ts, ui/app-dialogs.ts, ui/tabs.ts, ui/icons.ts, app.ts, engine/index.ts, engine/renderer.ts, engine/types.ts, io/project-io.ts, io/psd.ts, extensions/tools/type.ts, styles; src-tauri/capabilities/default.json)

`PanelGroup`; `NavigatorPanel`; `SwatchesPanel`; `PropertiesColumn`; `TitleTools` (`WORKSPACES`); `NativeMenus` (`accelerator`, `wantsNativeMenus`); `enhanceSelect`; `LayersPanel` (`KINDS`, `kindOf`, `LOCKS`, `BLEND_GROUPS`, `adoptPaths`, `showTab`); `Dock.arrange`, `Dock.locked`; `askSaveChanges`; `NewCanvasDialog` rebuilt (`PRESET_GROUPS`); `Engine.setFill`, `Engine.setLocks`, `Layer.fill`, `Layer.locks`, `newDocument`'s resolution; `setType` exported. Removed from frontend:

```text
import { anyDialogOpen, confirmAction, promptName } from './ui/dialogs';
<div class="cv-tabs"><div class="cv-tab-strip" role="tablist"></div><button class="cv-icon-btn" type="button" data-cmd="new">${icon('add', 16)}</button></div>
    if (p.modified && !(await confirmAction('Close without saving?', `${p.name} has changes that are not saved.`, 'Close', true))) return;
    { label: 'Window', items: ['brush-settings', 'paragraph-styles', '-', ...DOCK_PANELS.map((pn) => `panel-${pn.id}`), '-', 'reset-panels'] },
    if (e.button !== 0) return;
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, type ParagraphStyle, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
  notice(text: string, kind: Notice['kind'] = 'info'): void { this.emit('notice', { kind, text }); }
  newDocument(width: number, height: number, name = 'Untitled', fill: 'transparent' | 'white' | 'background' = 'transparent'): Project | null {
    const base: Doc = { id: uid(), width, height, resolution: 72, layers: [] };
          layers.push({ image: null, lut, mask, clip, folders, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
        layers.push({ image: null, lut: lut3, lut3: true, mask, clip, folders, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: o?.opacity ?? l.opacity, blend: o?.blend ?? l.blend, mask, clip, folders });
  private paintable(l: Layer | null): l is Layer { return !!l && !l.isGroup && !l.adjustment; }
    const op: GlobalCompositeOperation = pick.target === 'mask' ? (white ? 'source-over' : 'destination-out') : this.brushMode === 'erase' ? 'destination-out' : 'source-over';
    const color = pick.target === 'mask' ? { r: 255, g: 255, b: 255 } : this.fg;
    const s = new PixelStroke(pick.raster, pick.local, style, 'source-over', p.selection, texture, pick.target === 'mask');
      if (layer.adjustment) { this.adjust(job, ctx, layer, own, folders, base, map, clipCache, W, H, opacity); continue; }
        this.draw(ctx, src, m, t.sampling, opacity, op, job.quality);
      if (pixelBlend) this.pixelBlend(ctx, a, mode, opacity, m, src, job.view, W, H);
        ctx.globalAlpha = opacity;
function setType(e: Engine, patch: Partial<TextSpec>): void {
      const layer = adj ? newLayer(name, doc, { adjustment: adj, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend })
        : newLayer(name, doc, { raster, parentId, transform: { ...docTransform(w, h), x: pl.left ?? 0, y: pl.top ?? 0 }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend });
      const out: PsdLayer = { name: l.name, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, adjustment };
    const out: PsdLayer = { name: l.name, left: px.x, top: px.y, canvas: px.c, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId };
.cv-main { display: grid; grid-template-columns: var(--cv-rail-w) minmax(0, 1fr) 6px var(--cv-layers-w); min-height: 0; }
  --cv-layers-w: 264px;
const PRESETS: ReadonlyArray<[string, number, number]> = [
  ['HD 1920 \u00d7 1080', 1920, 1080], ['4K 3840 \u00d7 2160', 3840, 2160], ['Square 2048', 2048, 2048],
  ['Portrait 1080 \u00d7 1350', 1080, 1350], ['A4 at 300 ppi', 2480, 3508], ['Letter at 300 ppi', 2550, 3300],
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" value="Untitled" spellcheck="false">');
  private readonly preset = el<HTMLSelectElement>(`<select class="cv-input"><option value="">Custom</option>${PRESETS.map(([label], i) => `<option value="${i}">${label}</option>`).join('')}</select>`);
  private readonly width = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="30000" step="1" value="1920">');
  private readonly height = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="30000" step="1" value="1080">');
  private readonly fill = el<HTMLSelectElement>('<select class="cv-input"><option value="transparent">Transparent</option><option value="white">White</option><option value="background">Background color</option></select>');
    super('New Canvas', 420);
    this.field('Name', this.name);
    this.field('Preset', this.preset);
    this.field('Width (px)', this.width);
    this.field('Height (px)', this.height);
    this.field('Contents', this.fill);
    this.body.appendChild(el('<p class="cv-note">Each side 1 to 30,000 px, 100 megapixels at most.</p>'));
    this.preset.addEventListener('change', () => {
      const p = PRESETS[Number(this.preset.value)];
      if (!this.preset.value || !p) return;
      this.width.value = String(p[1]);
      this.height.value = String(p[2]);
    });
    for (const i of [this.width, this.height]) i.addEventListener('input', () => { this.preset.value = ''; });
    for (const i of [this.name, this.width, this.height]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.create(); } });
    this.open(this.width);
    this.width.select();
    const w = Number(this.width.value), h = Number(this.height.value);
    if (this.engine.newDocument(w, h, this.name.value.trim() || 'Untitled', fill)) this.close();
  { id: 'paths', label: 'Paths', selector: '.cv-paths' },
const DEFAULT: DockState = { order: DOCK_PANELS.map((p) => p.id), hidden: [] };
    const hidden = Array.isArray(r.hidden) ? r.hidden.filter((id): id is string => ids.includes(id as string)) : [];
        if (e.button !== 0 || (e.target as HTMLElement).closest('[data-cmd]')) return;
        head.setPointerCapture(e.pointerId);
  reset(): void { this.state = { order: [...DEFAULT.order], hidden: [] }; this.save(); }
  private readonly opacityOut: HTMLElement;
  private opacityDrag = false;
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><span class="cv-panel-title">${icon('layers', 14)}Layers</span><span></span><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
      `<div class="cv-layer-props"><select class="cv-select cv-blend" title="Blend mode" aria-label="Blend mode">${BLEND_MODES.map((b) => `<option value="${b.id}">${b.label}</option>`).join('')}</select>` +
      `<label class="cv-opacity" title="Opacity"><input class="cv-opacity-range" type="range" min="0" max="100" step="1" value="100" aria-label="Opacity"><span class="cv-readout cv-opacity-out">100%</span></label></div>` +
    this.opacity = q<HTMLInputElement>(root, '.cv-opacity-range');
    this.opacityOut = q(root, '.cv-opacity-out');
    this.opacity.addEventListener('pointerdown', () => { this.opacityDrag = true; engine.beginOpacityEdit(); });
    this.opacity.addEventListener('input', () => {
      const v = Number(this.opacity.value) / 100;
      setText(this.opacityOut, `${this.opacity.value}%`);
      if (this.opacityDrag) engine.setOpacityLive(v);
      else engine.setOpacity(v);
    const endOpacity = (): void => { if (!this.opacityDrag) return; this.opacityDrag = false; engine.endOpacityEdit(); };
    this.opacity.addEventListener('change', endOpacity);
    this.opacity.addEventListener('pointerup', endOpacity);
    const entries = p ? hierarchy(p.doc, true, p.collapsed) : [];
    setHidden(this.empty, entries.length > 0);
    if (!this.opacityDrag) { setValue(this.opacity, pct); setText(this.opacityOut, `${pct}%`); }
    const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - h - 4));
      `<div class="cv-panel-head"><button class="cv-paths-toggle" type="button" aria-expanded="true"><span class="cv-paths-chevron">${icon('chevronDown', 12)}</span>${icon('penTool', 14)}<span>Paths</span></button><span></span>` +
      `<div class="cv-paths-body"><div class="cv-path-list"><div class="cv-path-rows" role="listbox" aria-label="Paths"></div><div class="cv-paths-empty">No paths. Draw one with the Pen (P).</div></div>` +
        const n = el(`<div class="cv-tab" role="tab"><span class="cv-tab-dot"></span><span class="cv-tab-name"></span><button class="cv-tab-close" type="button" aria-label="Close tab">${icon('close', 12)}</button></div>`);
```

Removed from src-tauri:

```text
  "description": "Window chrome only. The app itself talks HTTP to its engine and uses no Tauri IPC.",
```

## The start screen, and the redesign reaching everyone · _v1.46.0 (index.html, src/ui/themes.ts, src/ui/themes.test.ts, src/ui/home.ts, src/styles/shell.css, src/styles/panels.css; e2e/test_home_screen.py)

Phase 21: `APPEARANCE` (2) in `themes.ts` and index.html's boot script, so a choice saved before Studio Dark is set aside once; `HomeScreen` rebuilt to the target's start screen (`recentBox` replaces `empty`); the Home CSS block replaced; panel headers, layer rows and the tool column restyled in appended blocks. Removed:

```text
        page.locator(".cv-home-action", has_text="New file").click()                 # New file runs File > New
    if (raw) { var s = JSON.parse(raw); if (s.theme && PROFILES[s.theme]) theme = s.theme; if (s.accentColor) accent = s.accentColor; }
.cv-home { position: absolute; inset: 0; z-index: var(--z-chrome); display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: var(--space-6); padding: var(--space-6); background: var(--bg-primary); overflow-y: auto; }
.cv-home-side { display: flex; flex-direction: column; gap: var(--space-2); }
.cv-home-action { display: inline-flex; align-items: center; gap: var(--space-2); height: var(--ctl-lg, 36px); padding: 0 var(--space-3); border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary); font-size: var(--fs-12); white-space: nowrap; cursor: pointer; }
.cv-home-action:first-child { background: var(--accent-color); border-color: var(--accent-color); color: var(--text-on-accent); }
.cv-home-action:hover { border-color: var(--accent-color); }
.cv-home-main { min-width: 0; }
.cv-home-title { margin: 0 0 var(--space-3); color: var(--text-primary); font-size: var(--fs-14, 14px); font-weight: 600; }
.cv-home-item { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); height: 40px; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); font-size: var(--fs-12); text-align: left; cursor: pointer; }
.cv-home-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.cv-home-date { color: var(--text-muted); font-size: var(--fs-11); }
.cv-home-empty { color: var(--text-muted); font-size: var(--fs-12); }
.cv-home-empty[hidden] { display: none; }
  private readonly empty = el('<p class="cv-home-empty">Projects you save or open appear here.</p>');
    const side = el('<div class="cv-home-side"></div>');
    for (const [label, cmd, ic] of [['New file', 'new', 'newFile'], ['Open', 'open', 'folderOpen']] as const) {
      const b = el<HTMLButtonElement>(`<button class="cv-home-action" type="button">${icon(ic, 16)}<span></span></button>`);
      setText(b.querySelector('span') as HTMLElement, label);
      side.appendChild(b);
    const main = el('<div class="cv-home-main"><h2 class="cv-home-title">Recent</h2></div>');
    main.append(this.list, this.empty);
    this.root.append(side, main);
    setHidden(this.empty, names.length > 0);
import { DEFAULT_ACCENT, DEFAULT_THEME, THEMES } from './themes';
      const saved = JSON.parse(raw) as Partial<ThemeChoice>;
      return { theme: saved.theme || DEFAULT_THEME, accentColor: saved.accentColor || DEFAULT_ACCENT };
    const merged = { ...(raw ? JSON.parse(raw) : {}), ...choice };
```

## The target palette, Studio Dark · _v1.45.0 (index.html, src/ui/themes.ts, src/ui/themes.test.ts new, src/styles/tokens.css, src/styles/shell.css, src/ui/panels/gradient-editor.ts)

Phase 21 step 1 (UI_SPEC.md): the 'studio' profile, measured from the owner's screenshots, the default in `themes.ts` and in index.html's boot script (`DEFAULT_THEME`, `DEFAULT_ACCENT`, `PROFILES`); `tokens.css` defaults to match, the system face and SF Mono first, `--cv-checker-b` #cccccc; the stage's dot grid from `--grid-color`; the gradient editor's selected stop from `--accent-color`. Removed:

```text
  var DEFAULT_THEME = 'nodemode-dark';
  var DEFAULT_ACCENT = '#f97316';
  /* ── accent (settings-driven in the app; --accent-color-dim is accent + 33 alpha) ── */
  --accent-color: #f97316;
  --accent-color-dim: #f9731633;
  --accent-color-hover: #ea580c;
  /* ── surfaces (theme-owned; nodemode-dark profile values) ── */
  --bg-primary: #0a0a0a;
  --bg-secondary: #121218;
  --bg-tertiary: #1a1a24;
  --bg-node: #121218;
  --border-color: #2a2a35;
  --border-light: #3a3a48;
  --text-primary: #e8e8ee;
  --text-secondary: #a8a8b8;
  --text-muted: #6a6a7a;
  --canvas-bg: #0a0a0a;
  --grid-color: rgba(255,255,255,0.04);
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --cv-checker-b: #d8d8de;
      h.strokeStyle = i === this.sel ? '#f97316' : '#888';
export const DEFAULT_THEME = 'nodemode-dark';
export const DEFAULT_ACCENT = '#f97316';
  if (Number.isNaN(n)) return `rgba(249,115,22,${alpha})`;
```

## The native GPU renderer · _v1.44.0 (native/formvis-render new; src-tauri/src/native.rs new, src-tauri/src/main.rs, src-tauri/Cargo.toml; src/gpu/native-display.ts new, src/gpu/probe.ts, src/gpu/display.ts, src/ui/stage.ts, src/ui/prefs.ts, src/styles/shell.css, src/app.ts; setup/test, setup/test.bat, setup/line_counts.py; e2e/test_native_display.py new)

native/formvis-render (Rust, wgpu 30): `Gpu` (`new`, `for_window`), `TiledLayer` (`dab`, `write`, `read`), `composite` (`Blender`, `Stack`, `Source`, `Clip`, `Lut`, `Affine`, `blend.wgsl` shared with the web shader), `budget`, `display` (`Display`, `View`, `Checker`), `document` (`Document`, `LayerSpec`), `bin/brush_bench`, `examples/window`. Shell: `native.rs` (`native_start` ... `native_present`), registered in `main.rs`. App: `NativeDisplay`; `ScreenDisplay.unsupported` and `document`; 'native' in `probe.ts` and `prefs.ts`. Removed from frontend/src:

```ts
  let gpuDisplay: ScreenDisplay | null = null, gpuKind: 'webgpu' | 'webgl2' | null = null, gpuStarting = false;
  const gpuFailed = new Set<'webgpu' | 'webgl2'>();
    const pr = loadPrefs(), ch = chooseRenderer(gpuProbe, pr.useGpu, pr.renderer), name = ch.adapter ? `${ch.adapter.name}${ch.adapter.software ? ' (software)' : ''}` : '';
      if (want === 'webgpu') void GpuDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-gpu:not(.cv-scene-gl)')).then(started);
    const live = off ? null : gpuDisplay, api = ch.mode === 'webgl2' ? 'WebGL2' : 'WebGPU';
export type GpuRenderer = 'auto' | 'webgpu' | 'webgl2' | 'cpu';
export type GpuMode = 'webgpu' | 'webgl2' | 'cpu';
export interface GpuProbe { webgpu: GpuAdapter | null; webgl2: GpuAdapter | null }
export const RENDERER_CHOICES: ReadonlyArray<readonly [GpuRenderer, string]> = [['auto', 'Automatic'], ['webgpu', 'WebGPU'], ['webgl2', 'WebGL2'], ['cpu', 'CPU']];
  return { webgpu, webgl2 };
  if (hardware) return { mode: hardware.api, adapter: hardware, reason: want === 'auto' ? 'automatic' : `${want === 'webgpu' ? 'WebGPU' : 'WebGL2'} is not available here` };
  return { mode: 'cpu', adapter: null, reason: p.webgpu || p.webgl2 ? 'only a software GPU was found, which is slower than the CPU renderer' : 'no graphics processor was found' };
export const modeLabel = (m: GpuMode): string => (m === 'webgpu' ? 'WebGPU' : m === 'webgl2' ? 'WebGL2' : 'CPU');
      renderer: r.renderer === 'webgpu' || r.renderer === 'webgl2' || r.renderer === 'cpu' || r.renderer === 'auto' ? r.renderer : DEFAULT_PREFS.renderer,
      const reason = documentFallback(gl, W, H, { maxTexture: this.gpu.maxTexture, memoryBytes: this.gpuLimit });
```

Removed from setup and src-tauri:

```text
and backend/formvis_engine.py, Rust under src-tauri/src. Figures are rounded to hundreds; a figure passes the check within
         ("Python", ("backend/app/", "backend/formvis_engine.py"), ".py"), ("Rust", ("src-tauri/src/",), ".rs"))
case "$which" in all|unit|backend|e2e) ;; *) cv_say "unknown test suite: $which (use unit, backend, e2e or nothing for all)"; exit 2 ;; esac
        .invoke_handler(tauri::generate_handler![system_fonts])
```

## The desktop app's fonts · _v1.43.0 (src/ui/fonts.ts, src/app.ts, src/extensions/tools/type.ts, package.json; src-tauri/src/main.rs, src-tauri/Cargo.toml, src-tauri/Cargo.lock new; e2e/test_desktop_fonts.py new)

`fonts.ts`: `inDesktopApp`, `canListSystemFonts` and `loadSystemFonts` through the shell's `system_fonts` in the desktop app. `app.ts`: the fonts loaded at start there. `type.ts`: the Font menu a `live` list. Shell: `system_fonts` (fontdb) and its test, `invoke_handler`; Cargo.toml adds `serde_json` and `fontdb` (only additions there). Removed:

```ts
    { kind: 'select', label: 'Font', choices: fontChoices(e.textSettings.family), get: () => e.textSettings.family, set: (v) => {
 *  desktop shell's webview has no such API; its native font list needs a shell command not built yet, so there the
 *  common families found are what is offered. */
/** Whether this browser can list the machine's fonts (Local Font Access). */
export const canListSystemFonts = (): boolean => typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function';
/** The machine's font families through Local Font Access, which asks the user's permission (so call it from a click);
 *  null where the API is missing or permission is refused. */
```

## Object Selection · _v1.42.0 (src/extensions/tools/object-select.ts new, src/extensions/tools/index.ts, src/engine/types.ts, src/io/api.ts, src/ui/icons.ts; e2e/test_object_select.py new)

`object-select.ts`: `objectSelectTool`, `source`, `keyOf` (FNV-1a over the pixels), `selectAt`. `api.ts`: `selectObject`. `ToolId` gains `objectSelect`; `icons.ts` gains `objectSelect`. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'idle';
  for (const tool of [moveTool, marqueeTool, lassoTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

## Sliding document tabs · _v1.41.0 (src/ui/tabs.ts, src/styles/shell.css; e2e/test_no_layout_shift.py new)

`tabs.ts` `render`: tabs and the new-document button held by `--flip-x` and eased (`.is-settling`) whenever the tab count changes. Removed:

```ts
import { el, patchList, q, setClass, setText, setTitle } from './dom';
```

## .comp import · _v1.40.0 (src/io/images.ts; e2e/test_comp_import.py new)

`images.ts`: `.comp` in `PROJECT_ACCEPT` and `isProjectFile` (opened to migrate; formvis never writes it). Removed:

```ts
export const PROJECT_ACCEPT = '.fmv,.formvis,.canvasor,.zip,.psd,.psb';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|canvasor|zip|psd|psb)$/i.test(f.name);
```

## Camera RAW import · _v1.39.0 (src/io/images.ts, src/io/api.ts, src/io/links.ts, src/app.ts; e2e/test_camera_raw.py new)

`images.ts`: `RAW_FILE`, RAW extensions in `IMAGE_ACCEPT` and `isImageFile`, RAW sent to the engine in `decodeImage`. `api.ts`: the capability report's `raw` and `rawEngine`. `links.ts`: RAW extensions in the desktop picker. `app.ts` `importFiles`: a single RAW import opens Develop. Removed:

```ts
import { IMAGE_ACCEPT, decodeImage, isImageFile, isProjectFile } from './io/images';
  decode: { heic: boolean; tiff: boolean; engine: string };
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,image/*';
export const isImageFile = (f: File): boolean => f.type.startsWith('image/') || NATIVE.test(f.name) || SERVER.test(f.name);
  const server = SERVER.test(name) || /image\/(heic|heif|tiff)/.test(file.type);
      const [h] = await picker({ types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tif', '.tiff', '.heic', '.psd'] } }] });
```

## Licence, sliding layer rows, the GPU blender's name · _v1.38.0 (package.json, package-lock.json, src/ui/layers.ts, src/styles/panels.css, src/gpu/blender.ts renamed, src/gpu/display.ts; e2e/test_gpu_blend.py renamed, e2e/conftest.py)

`package.json` and the lockfile's own entry: Apache-2.0. `layers.ts` `render`: moved rows held by `--flip` and eased (`.is-settling`). `gpu/blender.ts` (`GpuBlender`) is the 1.16.0 GPU module under a new name, moved with git mv; entries above use the new names. Five removed lines are not quoted here, since quoting them would put the removed term back into the tree: the module's description line, the class declaration, `create`'s return type and its constructor call in `blender.ts`, and one comment line in `display.ts`, each the same line with the old term where the new one now stands. The one other removed line:

```css
.cv-layer { display: grid; grid-template-columns: 28px calc(var(--depth, 0) * 14px) 16px var(--cv-thumb) auto minmax(0, 1fr); align-items: center; column-gap: var(--space-1); height: var(--cv-row-h); padding: 0 var(--space-2) 0 var(--space-1); border-left: 3px solid transparent; color: var(--text-secondary); font-size: var(--fs-12); cursor: default; }
```

## Paragraph styles · _v1.37.0 (src/engine/types.ts, src/engine/text.ts, src/engine/index.ts, src/io/project-io.ts, src/ui/panels/paragraph-styles.ts new, src/styles/dialogs.css, src/app.ts; e2e/test_paragraph_styles.py new)

`ParagraphStyle`, `Doc.paragraphStyles`, `TextSpec.style`. `text.ts`: `styleOf`, `withStyle`, `paragraphStylesFrom`; `textFromData` reads the link. Engine: `paragraphStyles`, `newParagraphStyle`, `applyParagraphStyle`, `redefineParagraphStyle`, `deleteParagraphStyle`. The manifest writes and reads the styles. `ParagraphStylesDialog` (Window menu). Removed:

```ts
    { label: 'Window', items: ['brush-settings', '-', ...DOCK_PANELS.map((pn) => `panel-${pn.id}`), '-', 'reset-panels'] },
import { defaultText, liveText, loadTextFont, renderText, textKey } from './text';
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
export { TEXT_FONTS, defaultText, fontCss, liveText, textFromData, textKey, textMetrics, renderText } from './text';
import { clamp, type Layer, type Pt, type TextPath, type TextSpec, type TextWarp, type WarpStyle } from './types';
    warp: warpFrom(o.warp), onPath: pathFrom(o.onPath),
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; globalLight?: GlobalLight }
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; rendered?: string }
  Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB, timelineData, timelineFrom, type Timeline, addPattern, patternById, projectPatterns,
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.globalLight ? { globalLight: { angle: doc.globalLight.angle, altitude: doc.globalLight.altitude } } : {}) };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}) }, activeId: str(manifest.activeLayerID) };
```

## Type on Path · _v1.36.0 (src/engine/types.ts, src/engine/text.ts, src/engine/index.ts, src/ui/panels/type-on-path-dialog.ts new, src/app.ts; e2e/test_type_on_path.py new)

`TextPath`, `TextSpec.onPath`. `text.ts`: `renderPathText`, `pathFrom`; `renderText` sends path type to it. Engine: `createTextOnPath`. `TypeOnPathDialog`; the `type-on-path` command in the Layer menu. Removed:

```ts
      'rasterize', 'edit-text', 'warp-text', { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-corners'] }, '-',
import { clamp, type Layer, type TextSpec, type TextWarp, type WarpStyle } from './types';
/** The type as it is drawn: plain, or warped when the spec has an active Warp Text. */
    warp: warpFrom(o.warp),
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; rendered?: string }
```

## Warp Text · _v1.35.0 (src/engine/types.ts, src/engine/text.ts, src/ui/panels/warp-text-dialog.ts new, src/app.ts; e2e/test_warp_text.py new)

`TextWarp`, `WarpStyle`, `TextSpec.warp`. `text.ts`: `renderPlain` (the former renderer), `WARP_STYLES`, `warpPoint`, `triangle`, `warpRender`, `renderText` (plain, then the warp), `warpFrom`. `WarpTextDialog`; the `warp-text` command in the Layer and context menus. Removed:

```ts
      'rasterize', 'edit-text', { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-corners'] }, '-',
  contextMenu.setItems(['duplicate-dialog', 'delete-layer', 'rename', 'edit-text', '-',
import { clamp, type Layer, type TextSpec } from './types';
export function renderText(t: TextSpec): TextRender {
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; rendered?: string }
```

## Brush Settings · _v1.34.0 (src/engine/brush-dynamics.ts, src/engine/stroke.ts, src/engine/index.ts, src/extensions/registry.ts, src/extensions/tools/brush.ts, src/ui/stage.ts, src/ui/panels/brush-settings.ts new, src/app.ts; e2e/test_brush_dynamics.py new)

`brush-dynamics.ts`: `PenPose`, `UPRIGHT`, `BrushShape`, `defaultShape`, `shapeActive`. `stroke.ts`: `setShape`, `shapedDab`, the seeded `rnd`, the dual and texture shaping in `compose`. Engine: `brushShape`; `beginStroke` and `strokeTo` take a pose. `ToolPointer.pose` from the stage's pointer events. `BrushSettingsDialog` (F5, Window menu). Removed:

```ts
    { label: 'Window', items: [...DOCK_PANELS.map((pn) => `panel-${pn.id}`), '-', 'reset-panels'] },
import { noDynamics, pressureOption, type BrushDynamics, type BrushPreset } from './brush-dynamics';
  beginStroke(pt: Pt, shift: boolean, pressure = 1): boolean {
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p, pressure);
    s.to(pt, pressure);
  strokeTo(pt: Pt, pressure = 1): void {
    st.s.to(pt, pressure);
import { computeOption, type BrushDynamics } from './brush-dynamics';
  private readonly spacing: number;
   *  interpolated along the way, so a pen's changes between samples are smooth. */
  to(p: Pt, pressure = 1): void {
    if (!from) { this.dab(p, pr); this.last = p; this.carry = 0; this.lastPressure = pr; return; }
    // Coverage: the paint layer, cut to the selection when there is one.
      c.drawImage(this.paint, 0, 0);
export interface ToolPointer { doc: Pt; screen: Pt; button: number; shift: boolean; alt: boolean; mod: boolean; clicks: number; pressure: number }
  down(ctx, p) { if (p.button === 0) { hoverPt = p.doc; ctx.engine.beginStroke(p.doc, p.shift, p.pressure); } },
  move(ctx, p) { hoverPt = p.doc; ctx.engine.strokeTo(p.doc, p.pressure); ctx.engine.emit('overlay', null); },
    return { doc: v ? v.toDoc(screen.x, screen.y) : screen, screen, button: e.button, shift: e.shiftKey, alt: e.altKey, mod: isMac ? e.metaKey : e.ctrlKey, clicks, pressure: pen ? Math.min(1, Math.max(0, (e as PointerEvent).pressure)) : 1 };
```

## The Refine Edge brush and Decontaminate Colors · _v1.33.0 (src/engine/select-mask.ts, src/engine/index.ts, src/ui/panels/select-mask-dialog.ts; e2e/test_refine_edges.py new)

`select-mask.ts`: `refineRegion`, `decontaminate`. `applyRefinedSelection` takes a decontaminate amount for output to a new layer. The dialog: Onion Skin, Marching Ants and On Layers views, the brush (`region`, `paint`), Decontaminate Colors and Amount. Removed:

```ts
  applyRefinedSelection(data: Uint8Array, output: 'selection' | 'mask' | 'layer' | 'layerMask'): void {
import { DEFAULT_REFINE, refineSelection, type RefineSettings } from '../../engine/select-mask';
import { selectRow, sliderRow } from './controls';
type View = 'overlay' | 'onBlack' | 'onWhite' | 'blackWhite';
    const viewRow = selectRow('View', [['overlay', 'Overlay'], ['onBlack', 'On Black'], ['onWhite', 'On White'], ['blackWhite', 'Black & White']], (v) => { this.view = v as View; this.render(); });
    this.body.append(this.canvas, viewRow.el, ...rows.map((x) => x.r.el), outRow.el);
    this.syncRows = () => { viewRow.set(this.view); outRow.set(this.output); for (const { k, r } of rows) r.set(this.s[k]); };
      const m = refineSelection(mask, guide, this.pw, this.ph, this.s, this.scale), out = new ImageData(this.pw, this.ph), d = out.data, s = img.data;
    const m = refineSelection(mask, guide, W, H, s, 1), data = new Uint8Array(W * H);
    this.engine.applyRefinedSelection(data, output);
```

## Develop's further panels · _v1.32.0 (src/engine/develop.ts, src/ui/panels/filter-panel.ts, src/ui/panels/curve-graph.ts new; e2e/test_develop_panels.py new)

`develop.ts`: `GradingState`, `OpticsState`, `GeometryState`, `CalibrationState` (optional in `DevelopState`), their defaults and `gradingOf` and the like, `gradePass`, `opticsPass`, `geometryPass`, `sampleChannel`; `developImage` and `stateActive` extended. `curve-graph.ts`: `curveGraph`. The Develop dialog: Point Curve, Colour Mixer, Colour Grading, Optics, Geometry, Calibration. Removed:

```ts
import { gaussianBlur } from './filters';
  return toneActive(s.tone) || colorActive(s.color) || curvesActive(s.curves) || detailActive(s.detail);
/** The whole Develop filter on `src`, in the develop studio's order: the per-pixel pass, then clarity, texture and
 *  sharpening. `scale` shrinks the detail radii for a scaled preview. */
```

## Radial, Surface and the Blur Gallery · _v1.31.0 (src/engine/blur-gallery.ts new; src/ui/panels/filter-panel.ts, src/engine/filter-jobs.ts, src/engine/filter-worker.ts, src/app.ts; e2e/test_blur_gallery.py new)

`blur-gallery.ts`: `radialBlur`, `surfaceBlur`, `variableBlur`, `fieldBlur`, `irisBlur`, `tiltShift`, `pathBlur`, `GalleryKind`, `GALLERY_KINDS`, `isGalleryKind`, `GallerySettings`, `runGallery`. Filter panel: six kinds and labels, `gallery` settings, sections, margins. Worker: `runGallery`, and its comment's missing subject restored. Menus: Blur gains Radial and Surface; Blur Gallery. Removed:

```ts
  const FILTERS: FilterKind[] = ['develop', 'gaussianBlur', 'lensBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'smartSharpen', 'shakeReduction', 'unsharpMask'];
      { label: 'Blur', items: ['filter-gaussianBlur', 'filter-lensBlur', 'filter-motionBlur'] },
export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState; lensRadius: number; lensBrightness: number; lensThreshold: number; smart: SmartSharpenSettings; shake: ShakeSettings }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction';
/** runs its filters off the main thread (Core Image on the GPU). formvis's kernels are JavaScript, so the
  if (job.kind === 'gaussianBlur') out = gaussianBlur(src, s.radius * job.scale);
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop', lensBlur: 'Lens Blur', smartSharpen: 'Smart Sharpen', shakeReduction: 'Shake Reduction' };
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : kind === 'lensBlur' ? lensBlurMargin(s.lensRadius) : kind === 'smartSharpen' ? smartSharpenMargin(s.smart) : kind === 'shakeReduction' ? shakeMargin(s.shake) : 0;
```

## Shadows/Highlights, HDR Toning and Color Lookup · _v1.30.0 (src/engine/adjust-params.ts, src/engine/lut.ts, src/ui/panels/adjust-panel.ts; e2e/test_adjust_new_kinds.py new)

`adjust-params.ts`: `blurredLum`, `relight`, `LOOKS`, `parseCube`, `cubeSample`; kinds `shadowsHighlights`, `hdrToning`, `colorLookup`; the `text` value kind. `lut.ts`: Color Lookup in `LUT3_KINDS`. `adjust-panel.ts`: the 3D LUT File row. Removed:

```ts
export type ParamKind = 'brightnessContrast' | 'vibrance' | 'colorBalance' | 'blackWhite' | 'photoFilter' | 'channelMixer' | 'invert' | 'posterize' | 'threshold' | 'selectiveColor' | 'develop';
  | { key: string; label: string; kind: 'select'; options: ReadonlyArray<readonly [string, string]>; def: string; group?: string };
export const LUT3_KINDS: ReadonlySet<AdjustmentKind> = new Set<AdjustmentKind>(['hsv', 'vibrance', 'colorBalance', 'channelMixer', 'photoFilter', 'blackWhite', 'selectiveColor', 'threshold', 'gradientMap']);
import { PARAM_ADJUSTMENTS, PARAM_KINDS, isParamKind, paramKernel, paramValues, type ParamKind } from '../../engine/adjust-params';
```

## Tracking, kerning and this machine's fonts · _v1.29.0 (src/ui/fonts.ts new; src/engine/types.ts, src/engine/text.ts, src/extensions/tools/type.ts, src/io/psd.ts, src/ui/panels/text-dialog.ts, src/ui/text-editor.ts, src/styles/shell.css; e2e/test_type_spacing.py new)

`TextSpec.tracking`, `TextSpec.kerning`, `TextKerning`. `text.ts`: `trackingPx`, `CANVAS_TRACKING`, `setType`, `lineWidth`; `renderText` measured and drawn with them, per character where the canvas has no letterSpacing. `fonts.ts`: `installed`, `fontFamilies`, `canListSystemFonts`, `loadSystemFonts`. Type options: `fontChoices`, Load system fonts, Tracking, Kerning. The Edit Type dialog keeps a font outside the list. The typing box's `--ls` and `--kern`. Removed:

```ts
  return { content: '', family: 'Inter', size: 48, color: { r: 0, g: 0, b: 0 }, align: 'left', bold: false, italic: false, lineHeight: 1.2 };
  const font = fontCss(t), lines = t.content.split('\n');
  probe.font = font;
  const widest = Math.max(1, ...metrics.map((m) => Math.max(m.width, (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0))));
  c.font = font;
  c.textAlign = t.align;
  const x = t.align === 'center' ? width / 2 : t.align === 'right' ? width - pad : pad;
  lines.forEach((line, i) => c.fillText(line, x, pad + ascent + i * advance));
    lineHeight: num(o.lineHeight, d.lineHeight, 0.5, 4), rendered: textKey(raster),
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; rendered?: string }
import { TEXT_FONTS, type Engine, type TextSpec } from '../../engine';
    { kind: 'select', label: 'Font', choices: TEXT_FONTS.map((f) => ({ id: f, label: f })), get: () => e.textSettings.family, set: (v) => setType(e, { family: v }) },
          align: just === 'center' || just === 'right' ? just : 'left', bold: !!st.fauxBold || face.bold, italic: !!st.fauxItalic || face.italic, lineHeight: st.autoLeading === false && st.leading ? Math.round((st.leading * scale / size) * 100) / 100 : 1.2 };
.cv-type-editor { position: absolute; left: var(--x, 0); top: var(--y, 0); width: var(--w, 0); height: var(--h, 0); z-index: var(--z-raised); margin: 0; padding: 0; border: 0; outline: 1px dashed var(--accent-color); background: transparent; color: var(--ink, currentColor); font: var(--font, inherit); line-height: var(--lh, normal); text-align: var(--align, left); white-space: pre; overflow: hidden; resize: none; caret-color: var(--accent-color); }
import { TEXT_FONTS, type Engine, type RGB, type TextSpec } from '../../engine';
  private readonly family = el<HTMLSelectElement>(`<select class="cv-input">${TEXT_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}</select>`);
    this.family.value = TEXT_FONTS.includes(t.family) ? t.family : 'Inter';
      bold: this.bold, italic: this.italic, color: fromHex(this.colour.value),
    s.spec = { ...s.spec, family: t.family, size: t.size, align: t.align, bold: t.bold, italic: t.italic, lineHeight: t.lineHeight };
```

## The performance benchmark · _v1.27.0 (src/gpu/bench.ts new; src/gpu/display.ts, src/gpu/gl-display.ts, src/ui/app-dialogs.ts, src/app.ts, src/styles/dialogs.css; e2e/test_benchmark.py new)

`bench.ts`: `runBenchmark` (a temporary document, pan, pan with adjustments, paint; CPU and each GPU display; the previous document restored), `benchText`. `GpuDisplay.timedFrame` and `GlDisplay.timedFrame` (an offscreen frame, finished before they resolve). `BenchmarkDialog`; the `benchmark` command in the Help menu; `.cv-bench-out`. Removed:

```ts
import { AboutDialog, NewCanvasDialog, OpenDialog, SettingsDialog, ShortcutsDialog } from './ui/app-dialogs';
    { label: 'Help', items: ['shortcuts', 'copy-error-log', 'about'] },
```

## The engine processor in Preferences · _v1.26.0 (src/ui/prefs.ts, src/ui/app-dialogs.ts, src/io/api.ts, src/app.ts; e2e/test_engine_device.py new)

`Prefs.engineDevice`, `EngineDevice`, `ENGINE_CHOICES`. `SettingsDialog`: `engineRow`, `engineMode`, the Engine section, `setEngine`; the graphics processor note corrected. `api.setCompute`. `syncEngineDevice` in the app, run when the engine answers and on every Preferences change. Removed:

```ts
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); recoveryDelay = pr.recoverySeconds * 1000; home.sync(); syncGpu(); }),
import { RECOVERY_CHOICES, loadPrefs, savePrefs, type Prefs } from './prefs';
      el('<p class="cv-note">Automatic uses WebGPU (Metal on macOS, Direct3D 12 on Windows), then WebGL2 (as on Linux), on a hardware graphics processor, and the CPU otherwise; a software GPU is slower than the CPU renderer, so Automatic does not use one. If the graphics processor fails to start, formvis turns this off and says so. In this version the graphics processor is detected and the choice kept; drawing still runs on the CPU until the GPU renderer that follows it arrives.</p>'));
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number }
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024 };
```

## Layer styles on the GPU · _v1.25.0 (src/engine/renderer.ts, src/engine/index.ts; e2e/test_gpu_styles.py new)

`Renderer.gpuEffectParts`: the renderer's cached effect parts (images, matrices, alpha, blend, below or above). `gpuLayers` wraps a styled layer in its parts; clipped, masked-folder and live-edited styled layers keep the CPU path by name. Removed:

```ts
      if (effectsActive(o?.effects ?? l.effects)) return { reason: 'layer styles' };
```

## Folder masks on the GPU · _v1.24.0 (src/engine/index.ts, src/gpu/blend-wgsl.ts, src/gpu/display.ts, src/gpu/gl-display.ts; e2e/test_gpu_clip.py)

Engine: `fchains` (one mask chain per parent folder), `GpuLayerSpec.folders`, the refusal for a clipped layer inside a masked folder. Shaders: mode 103. Displays: `DisplayLayer.folders`, `FOLDER_MODE`; each chain's coverage rendered once per frame through the clip input, pool slots from a running counter; folder mode binds the stand-in. Removed:

```ts
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; lut3?: boolean; mask?: GpuMaskSpec; clip?: GpuClipSpec; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
    const ov = this.overrides(p), layers: GpuLayerSpec[] = [], map = byId(p.doc), clips = new Map<ID, GpuClipSpec | null | 'nested'>();
      for (const g of ancestors(map, l)) if (g.mask?.enabled && g.mask.raster) return { reason: 'folder masks' };
          layers.push({ image: null, lut, mask, clip, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
        layers.push({ image: null, lut: lut3, lut3: true, mask, clip, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: o?.opacity ?? l.opacity, blend: o?.blend ?? l.blend, mask, clip });
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; lut3?: boolean; mask?: DisplayMask; clip?: DisplayClip; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
/** The shader mode that renders a clipping base's coverage. */
      this.layerPass(enc, a, b, l, l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend), l.clip ? clipTex.get(l.clip) ?? null : null, sampler, view, used, buffers);
    used.add(l.lut ?? (l.image as object));
    const tex = this.texture(l);
import { CLIP_MODE, LUT3_MODE, LUT_MODE, type Checker, type DisplayClip, type DisplayLayer } from './display';
      this.drawLayer(l, l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend), l.clip ? clipOut.get(l.clip) ?? null : null, a.tex, b.fb, view, filter, used, u);
    used.add(l.lut ?? (l.image as object));
    gl.bindTexture(gl.TEXTURE_2D, this.texture(l));
```

## Clipping groups and folders on the GPU · _v1.23.0 (src/engine/index.ts, src/gpu/blend-wgsl.ts, src/gpu/blender.ts, src/gpu/display.ts, src/gpu/gl-display.ts; e2e/test_gpu_clip.py new)

Engine: `gpuLayers` walks `hierarchy(doc)`; `maskFor`, `clipOf`, `GpuClipSpec`. WGSL: `hasClip`, binding 5, mode 102. Displays: `DisplayClip`, `CLIP_MODE`; the loop bodies moved into `GpuDisplay.layerPass` and `GlDisplay.drawLayer` (mode and clip as parameters), clip coverage rendered first into `clipTarget` pools. Removed:

```ts
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; lut3?: boolean; mask?: GpuMaskSpec; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
    const ov = this.overrides(p), layers: GpuLayerSpec[] = [];
    for (const l of p.doc.layers) {
      if (o?.hidden || !l.visible) continue;
      if (l.isGroup || l.parentId) return { reason: 'folders' };
      // The layer's mask, as the CPU renderer's maskOf reads it: enabled with pixels, the live preview's source while
      // painting, and its own placement, else the layer's (Phase 18, masks).
      const m = l.mask, msrc = m?.enabled && m.raster ? o?.maskSource ?? m.raster.canvas : null;
      const mask = m && msrc ? { image: msrc, version: o?.maskSource ? -1 : (m.raster as Raster).version, width: msrc.width, height: msrc.height,
        matrix: placement(o?.maskPlacement ?? m.placement ?? o?.transform ?? l.transform, msrc.width, msrc.height) } : undefined;
      if (l.clipId) return { reason: 'clipping masks' };
          layers.push({ image: null, lut, mask, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
        layers.push({ image: null, lut: lut3, lut3: true, mask, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: o?.opacity ?? l.opacity, blend: o?.blend ?? l.blend, mask });
struct Layer { inv: mat3x3<f32>, size: vec2<f32>, opacity: f32, mode: u32, minv: mat3x3<f32>, msize: vec2<f32>, hasMask: u32, pad: u32 };
  let cov = coverage(pos.xy);
        { binding: 4, resource: blank.createView() },
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; lut3?: boolean; mask?: DisplayMask; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
      used.add(l.lut ?? (l.image as object));
      const tex = this.texture(l);
      const [ia, ib, ic, id, ie, iff] = invert(mul(view, l.matrix));
      // 128 bytes, WGSL's layout: inv (0), size (48), opacity (56), mode (60), the mask's inverse placement (64), its
      // size (112), whether there is one (120).
      const raw = new ArrayBuffer(128), f = new Float32Array(raw), u32 = new Uint32Array(raw);
      f.set([ia, ib, 0, 0, ic, id, 0, 0, ie, iff, 1, 0, l.width, l.height, Math.min(1, Math.max(0, l.opacity))]);
      u32[15] = l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend);
      let maskTex = this.blank();
      if (l.mask) {
        const mk = l.mask, [ma, mb, mc, md, me, mf] = invert(mul(view, mk.matrix));
        f.set([ma, mb, 0, 0, mc, md, 0, 0, me, mf, 1, 0, mk.width, mk.height], 16);
        u32[30] = 1;
        used.add(mk.image);
        maskTex = this.texture({ image: mk.image, version: mk.version, width: mk.width, height: mk.height, matrix: mk.matrix, opacity: 1, blend: 'normal' });
      }
      const ub = d.createBuffer({ size: 128, usage: BUF.UNIFORM | BUF.COPY_DST });
      d.queue.writeBuffer(ub, 0, raw);
      buffers.push(ub);
      const bind = d.createBindGroup({ layout: this.composite.getBindGroupLayout(0), entries: [
        { binding: 0, resource: a.createView() }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: sampler }, { binding: 3, resource: { buffer: ub } },
        { binding: 4, resource: maskTex.createView() },
      ] });
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: b.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(this.composite);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
import { LUT3_MODE, LUT_MODE, type Checker, type DisplayLayer } from './display';
      used.add(l.lut ?? (l.image as object));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(l));
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter);
      const [ia, ib, ic, id, ie, iff] = invert(mul(view, l.matrix));
      gl.uniformMatrix3fv(u('inv'), false, [ia, ib, 0, ic, id, 0, ie, iff, 1]);
      gl.uniform2f(u('size'), l.width, l.height);
      gl.uniform1f(u('opacity'), Math.min(1, Math.max(0, l.opacity)));
      gl.uniform1i(u('mode'), l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend));
      gl.activeTexture(gl.TEXTURE2);
      if (l.mask) {
        const mk = l.mask, [ma, mb, mc, md, me, mf] = invert(mul(view, mk.matrix));
        used.add(mk.image);
        gl.bindTexture(gl.TEXTURE_2D, this.texture({ image: mk.image, version: mk.version, width: mk.width, height: mk.height, matrix: mk.matrix, opacity: 1, blend: 'normal' }));
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter);
        gl.uniformMatrix3fv(u('minv'), false, [ma, mb, 0, mc, md, 0, me, mf, 1]);
        gl.uniform2f(u('msize'), mk.width, mk.height);
        gl.uniform1i(u('hasMask'), 1);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.blank());
        gl.uniform1i(u('hasMask'), 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
```

## Layer masks on the GPU · _v1.22.0 (src/engine/index.ts, src/gpu/blend-wgsl.ts, src/gpu/blender.ts, src/gpu/display.ts, src/gpu/gl-display.ts; e2e/test_gpu_mask.py new, e2e/test_gpu_display.py)

Engine: `GpuMaskSpec`, the mask in `gpuLayers` as `maskOf` reads it. WGSL: the 128-byte `Layer` block, binding 4, `coverage`. `GpuDisplay.blank`, the mask in the parameter block and binding 4; a `destroyed` loss is ignored. `GlDisplay.blank`, the mask uniforms and unit 2. The GPU blender passes the larger block and a stand-in. Removed:

```ts
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; lut3?: boolean; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
      if (l.mask || o?.maskSource) return { reason: 'layer masks' };
          layers.push({ image: null, lut, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
        layers.push({ image: null, lut: lut3, lut3: true, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: o?.opacity ?? l.opacity, blend: o?.blend ?? l.blend });
struct Layer { inv: mat3x3<f32>, size: vec2<f32>, opacity: f32, mode: u32 };
    return vec4<f32>(bd.rgb + (t - bd.rgb) * layer.opacity, bd.a);
    return vec4<f32>(bd.rgb + (t3 - bd.rgb) * layer.opacity, bd.a);
  let sa = sc.a * layer.opacity;
      const raw = new ArrayBuffer(64), f = new Float32Array(raw), u = new Uint32Array(raw);
      const ub = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; lut3?: boolean; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
      const raw = new ArrayBuffer(64), f = new Float32Array(raw);
      new Uint32Array(raw)[15] = l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend);
      const ub = d.createBuffer({ size: 64, usage: BUF.UNIFORM | BUF.COPY_DST });
    outColor = vec4(bd.rgb + (t - bd.rgb) * opacity, bd.a); return;
    outColor = vec4(bd.rgb + (t3 - bd.rgb) * opacity, bd.a); return;
  float sa = sc.a * opacity; if (sa <= 0.0) { outColor = bd; return; }
```

## Channel-mixing adjustments on the GPU · _v1.21.0 (src/engine/lut.ts, src/engine/index.ts, src/gpu/display.ts, src/gpu/gl-display.ts, src/gpu/blend-wgsl.ts; e2e/test_gpu_adjust.py)

`lut.ts`: `LUT3_N`, `LUT3_KINDS`, `lut3Sample`, `adjustmentLut3` (the 3D table from the CPU kernel, proven within 1 level off the lattice). `GpuLayerSpec.lut3` and `DisplayLayer.lut3`; `LUT3_MODE`; tables upload at their own size; shader mode 101 in WGSL and GLSL. Removed:

```ts
import { adjustmentLut } from './lut';
/** One entry of the GPU display's layer list (gpuLayers): a pixel layer's image, or an adjustment's per-channel lookup
 *  table (256 x 1, RGBA) applied to what is below it. */
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
        if (!lut) return { reason: `a ${ADJUSTMENT_LABELS[l.adjustment.kind] ?? l.adjustment.kind} adjustment layer` };
        layers.push({ image: null, lut, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
/** The shader mode for an adjustment's lookup table (Phase 18.5), after the 27 blend modes. */
      new Uint32Array(raw)[15] = l.lut ? LUT_MODE : blendIndex(l.blend);
      // A table is fixed for its settings (a new table comes with new settings), so it is written once.
      if (Number.isNaN(e.version)) { this.device.queue.writeTexture({ texture: e.tex }, l.lut, { bytesPerRow: 256 * 4 }, [256, 1]); e.version = 0; }
import { LUT_MODE, type Checker, type DisplayLayer } from './display';
      gl.uniform1i(u('mode'), l.lut ? LUT_MODE : blendIndex(l.blend));
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, l.lut);
```

## Per-channel adjustments on the GPU · _v1.20.0 (src/engine/lut.ts new; src/engine/index.ts, src/gpu/display.ts, src/gpu/gl-display.ts, src/gpu/blend-wgsl.ts; e2e/test_gpu_adjust.py new)

`lut.ts`: `LUT_KINDS`, `adjustmentLut` (the table from the CPU kernel, proven on a colour lattice). Engine: `GpuLayerSpec`; `gpuLayers` sends per-channel adjustments as tables and names the others. Displays: `DisplayLayer.lut`, `LUT_MODE`, the table upload and cache key, shader mode 100 in WGSL and GLSL. Removed:

```ts
  gpuLayers(): { layers: Array<{ image: Surface; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }> } | { reason: string } {
    const ov = this.overrides(p), layers: Array<{ image: Surface; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }> = [];
      if (l.adjustment) return { reason: 'adjustment layers' };
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
      used.add(l.image);
      new Uint32Array(raw)[15] = blendIndex(l.blend);
    let e = this.cache.get(l.image);
      this.cache.set(l.image, e);
    if (l.version < 0 || e.version !== l.version) {
import type { Checker, DisplayLayer } from './display';
      used.add(l.image);
      gl.uniform1i(u('mode'), blendIndex(l.blend));
    const gl = this.gl;
    let e = this.cache.get(l.image);
    if (!e) { e = { tex: gl.createTexture() as WebGLTexture, version: NaN, w: l.width, h: l.height }; this.cache.set(l.image, e); }
    if (l.version < 0 || e.version !== l.version) {
```

## The WebGL2 renderer · _v1.19.0 (src/gpu/gl-display.ts new; src/gpu/display.ts, src/gpu/fallback.ts, src/ui/stage.ts, src/app.ts; e2e/test_gl_display.py new, tests/gpu-fallback.test.ts, e2e/test_gpu_prefs.py)

`gl-display.ts`: `GlDisplay` (GLSL ES 3.00 composite and present programs, `render`, `renderToPixels`, the texture cache, `maxTexture`, `onLost`). `display.ts`: the `ScreenDisplay` interface; `GpuDisplay.canvas` public. `rendererFallback` treats WebGL2 as WebGPU. Stage: `gpuCanvases`, `showGpu`. `syncGpu` starts either display on its own canvas and tracks failures per API; the markup gains `.cv-scene-gl`. Removed:

```ts
import { GpuDisplay } from './gpu/display';
  let gpuDisplay: GpuDisplay | null = null, gpuStarting = false, gpuFailed = false;
    // WebGPU draws through the GPU display (Phase 18.2b); WebGL2's renderer is Phase 18.4, so it still draws on the CPU.
    if (ch.mode === 'webgpu' && !gpuDisplay && !gpuStarting && !gpuFailed) {
      void GpuDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-gpu')).then((d) => {
        gpuDisplay = d;
        gpuFailed = !d;
        if (d) d.onLost = () => { gpuDisplay = null; gpuFailed = true; syncGpu(); };
      });
    if (ch.mode !== 'webgpu' && gpuDisplay) { gpuDisplay.destroy(); gpuDisplay = null; }
    const off = rendererFallback({ mode: ch.mode, chosenReason: ch.reason, displayReady: !!gpuDisplay, displayFailed: gpuFailed });
    const live = off ? null : gpuDisplay;
    stage.setGpu(live, pr.gpuMemoryMB * 1024 * 1024, live ? (reason) => status.setGpu(reason ? 'GPU: CPU' : 'GPU: WebGPU', reason ? `WebGPU is on, but ${reason}, so it draws on the CPU` : `${name}: ${ch.reason}`) : null);
    dialogs.settings.setGpu(detectedName(gpuProbe), live ? 'WebGPU' : 'CPU', live ? ch.reason : cpuWhy);
  private constructor(private readonly canvas: HTMLCanvasElement, private readonly device: GPUDevice, private readonly ctx: GPUCanvasContext,
/** Whether the GPU display draws at all: the chosen mode, a display that started and was not lost. */
  if (s.mode === 'webgl2') return 'WebGL2 is chosen, but its renderer is not built yet, so drawing is on the CPU';
  if (s.displayFailed) return 'WebGPU could not start or was lost, so drawing is on the CPU';
  if (!s.displayReady) return 'WebGPU is starting';
import type { DisplayLayer, GpuDisplay } from '../gpu/display';
  private readonly gpuCanvas: HTMLCanvasElement;
  private gpu: GpuDisplay | null = null;
    this.gpuCanvas = q<HTMLCanvasElement>(host, '.cv-scene-gpu');
    for (const c of [this.scene, this.overlay, this.gpuCanvas]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  setGpu(display: GpuDisplay | null, limitBytes: number, onState: ((reason: string | null) => void) | null): void {
    if (!display) setHidden(this.gpuCanvas, true);
    if (!p) { g.clearRect(0, 0, W, H); setHidden(this.gpuCanvas, true); return; }
    setHidden(this.gpuCanvas, !gpuLayers);
    if (!vis) { if (gpuLayers) setHidden(this.gpuCanvas, true); return; }
```

## Fallback rules in one place · _v1.18.0 (src/gpu/fallback.ts new; src/gpu/display.ts, src/ui/stage.ts, src/app.ts; tests/gpu-fallback.test.ts new)

`fallback.ts`: `rendererFallback`, `documentFallback` (with the new texture-limit rule), `frameBytes`. `GpuDisplay.maxTexture`. The stage and `syncGpu` call them; each switch is logged. Removed:

```ts
    const live = ch.mode === 'webgpu' ? gpuDisplay : null;
    const cpuWhy = ch.mode === 'webgl2' ? 'WebGL2 is chosen, but its renderer is not built yet, so drawing is on the CPU'
      : ch.mode === 'webgpu' ? (gpuFailed ? 'WebGPU could not start or was lost, so drawing is on the CPU' : 'WebGPU is starting') : ch.reason;
  /** Bytes the frame would hold on the GPU: every layer's texture and the two screen-sized composites. */
  bytesFor(layers: readonly DisplayLayer[], W: number, H: number): number {
    return layers.reduce((s, l) => s + l.width * l.height * 4, 0) + W * H * 8;
  }
      let reason: string | null = null;
      if ('reason' in gl) reason = `this document has ${gl.reason}`;
      else if (this.gpu.bytesFor(gl.layers, W, H) > this.gpuLimit) reason = 'this document is over the GPU memory limit';
      else gpuLayers = gl.layers;
      if (reason !== this.gpuReason) { this.gpuReason = reason; this.gpuState?.(reason); }
```

## The canvas draws through WebGPU · _v1.17.0 (src/gpu/display.ts new; src/engine/index.ts, src/ui/stage.ts, src/app.ts, src/styles/shell.css; e2e/test_gpu_display.py new, e2e/test_gpu_prefs.py)

`display.ts`: `GpuDisplay` (`create`, `render` with an optional offscreen target, `renderToPixels`, `bytesFor`, the texture cache, `onLost`), `PRESENT_WGSL`. Engine: `gpuLayers`. Stage: the `.cv-scene-gpu` canvas, `setGpu`, `rgb`, the GPU branch of `renderScene`, redraw on `contextrestored`. `app.ts`: `syncGpu` starts the display and reports what draws. Removed:

```ts
import { chooseRenderer, detectedName, gpuStartFailedLastTime, markGpuStarted, markGpuStarting, modeLabel, probeGpu, type GpuProbe } from './gpu/probe';
    status.setGpu(`GPU: ${modeLabel(ch.mode)}`, name ? `${name}: ${ch.reason}` : ch.reason);
    dialogs.settings.setGpu(detectedName(gpuProbe), modeLabel(ch.mode), ch.reason);
    for (const c of [this.scene, this.overlay]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    if (!p) { g.clearRect(0, 0, W, H); return; }
    if (!vis) return;
    const pattern = this.checkerPattern(pal);
    if (v.zoom >= 2) {
```

## The WebGPU blender · _v1.16.0 (src/gpu/blender.ts and src/gpu/blend-wgsl.ts new; e2e/test_gpu_blend.py new; e2e/conftest.py)

`blender.ts`: `GpuBlender` (`create`, `composite`, `read`, `destroy`), `GpuLayer`, the specification's usage flags. `blend-wgsl.ts`: `COMPOSITE_WGSL`, `BLEND_IDS`, `blendIndex`. Nothing removed from src; not yet wired to the display. The test browser launches with WebGPU on SwiftShader; removed from e2e/conftest.py:

```py
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
```

## GPU detection and the renderer choice · _v1.15.0 (src/gpu/probe.ts new; src/app.ts, src/ui/app-dialogs.ts, src/ui/prefs.ts, src/ui/status.ts, src/styles/dialogs.css; tests/gpu-choice.test.ts and e2e/test_gpu_prefs.py new)

`gpu/probe.ts`: `probeGpu`, `chooseRenderer`, `isSoftware`, `detectedName`, `modeLabel`, `RENDERER_CHOICES`, the start marker (`gpuStartFailedLastTime`, `markGpuStarting`, `markGpuStarted`). `Prefs` gains `useGpu`, `renderer`, `gpuMemoryMB`. Preferences > Performance: Graphics Processor Settings (`gpuName`, `gpuUseRow`, `rendererRow`, `gpuMemoryRow`, `gpuMode`, `setGpu`). `StatusBar.setGpu` and `.cv-st-gpu`. `app.ts`: `syncGpu` and the start-up probe. `.cv-prefs` keeps one height; `.cv-prefs-pages` scrolls; `.cv-prefs-sub` new. Removed:

```ts
import { applyPrefs, loadPrefs } from './ui/prefs';
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); recoveryDelay = pr.recoverySeconds * 1000; home.sync(); }),
```

```css
.cv-prefs { display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: var(--space-4); min-height: 300px; }
```

```ts
      el('<p class="cv-note">History States is how many steps undo keeps (Photoshop keeps 50 by default, up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as Photoshop\'s Memory Usage does, so this is the part formvis controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.</p>'));
 *  kept for crash recovery. */
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean }
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true };
      `<span class="cv-st-busy">${icon('loading', 12)}Working</span><span class="cv-st-engine"></span><span class="cv-st-hint"></span>`);
```

## Pattern sources for the Healing Brush and Patch · _v1.14.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/healing-brush.ts, src/extensions/tools/patch.ts; e2e/test_heal_patterns.py new)

`retouch.ts`: `healFromSource` and `scaleHealCorrection` take an optional separate `source`. Engine: `patternSurface`, `patchWithPattern`, `retouch.healSource`, `healPattern`, `patchPattern`; `beginRetouchStroke` needs no source point with Source: Pattern; `healFromPatch` heals from the pattern in both paths. Healing Brush: Source and Pattern rows; Patch: Pattern and Use Pattern in Normal mode. Removed:

```ts
import { patternById } from './patterns';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean; patchSampleAll: boolean } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false, patchSampleAll: false };
      const off = this.cloneStrokeOffset(pt);
      this.cloneOffset = off;
      texture = { surface: kind === 'healBrush' ? this.healSampleSurface(p, l0, this.retouch.healSample) : this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0), dx: off.x, dy: off.y };
      if (!healFromSource(pmS, hard, W, H, 1, off.x, off.y)) return null;
      scaleHealCorrection(healed.data, base.data, hard, W, H, off.x, off.y, this.retouch.healDiffusion, 1, 1);
    if (!healFromSource(pm, s.coverageAlpha(), r.width, r.height, this.brush.opacity, off.x, off.y)) return null;
    scaleHealCorrection(out.data, before.data, s.coverageAlpha(), r.width, r.height, off.x, off.y, this.retouch.healDiffusion, 1, this.brush.opacity);
export function scaleHealCorrection(out: Uint8ClampedArray, before: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, dx: number, dy: number, diffusion: number, colour: number, opacity = 1): void {
  const dist = diff < 7 ? insideDistance(coverage, W, H) : null, L = 2 ** diff;
      const b = before[i * 4 + ch], full = b + (out[i * 4 + ch] - b) / op, raw = before[s + ch];
export function healFromSource(rgba: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, opacity: number, dx: number, dy: number): boolean {
  const { win } = hw, ww = win.w, n = ww * win.h, original = rgba.slice();
    for (let c = 0; c < 4; c++) v[p * 4 + c] = original[t + c] - original[s + c];
    for (let c = 0; c < 4; c++) f[c] = v[p * 4 + c] + original[s + c];
import type { Pt } from '../../engine';
import type { Pt } from '../../engine';
```

## Patch Sample All Layers · _v1.13.0 (src/engine/index.ts, src/extensions/tools/patch.ts; e2e/test_patch_sample_all.py new)

Engine: `retouch.patchSampleAll`; `patchSelection` in Content-Aware mode with it patches the composite (`healSampleSurface`, `rasterSpace`) and lays the result on through the selection (`layHeal`). Patch tool: the Sample All Layers row, in Content-Aware mode. Removed:

```ts
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false };
        const orig = raster.read().data, pm = premultiply(orig);
        raster.ctx.putImageData(out, 0, 0, rect.x, rect.y, rect.w, rect.h);
```

## The healing brushes' Sample options · _v1.12.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/healing-brush.ts, src/extensions/tools/heal.ts; e2e/test_heal_sample.py new)

`retouch.ts`: `HealSample`, `HEAL_SAMPLES`. Engine: `healSampleSurface`, `rasterSpace`, `layHeal`, `retouch.healSample`, `retouch.spotSampleAll`; `healFromPatch` and `healPatch` heal the sampled image and lay the repair on; the Healing Brush's stroke texture follows its Sample. Healing Brush: the Sample select replaces the shared toggle; Spot Healing: Sample All Layers. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, healFromSource, premultiply, scaleHealCorrection, spotHeal, unpremultiply, type HealBlend, type HealMode } from './retouch';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal' };
      texture = { surface: this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0), dx: off.x, dy: off.y };
import { HEAL_BLENDS, type HealBlend } from '../../engine/retouch';
    { kind: 'toggle', label: 'Sample all layers', get: () => e.retouch.cloneSampleAll, set: (v) => { e.retouch.cloneSampleAll = v; e.emit('options', null); } },
```

## The healing brushes' Mode · _v1.11.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/heal.ts, src/extensions/tools/healing-brush.ts; e2e/test_heal_modes.py new)

`retouch.ts`: `HealBlend`, `HEAL_BLENDS`. Engine: `healBlend` (the full-strength heal recomposited in the mode; Replace whole pixels on the Dissolve pattern), `retouch.healBlendMode`, `retouch.spotBlendMode`; `healFromPatch` and `healPatch` apply it. Both tools: a Mode select. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, healFromSource, premultiply, scaleHealCorrection, spotHeal, unpremultiply, type HealMode } from './retouch';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7 };
```

## Healing Brush Diffusion · _v1.10.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/healing-brush.ts; e2e/test_healing_diffusion.py new, tests/inside-distance.test.ts extended)

`retouch.ts`: `scaleHealCorrection`, shared by Patch and the Healing Brush, allowing for the heal's opacity. Engine: `retouch.healDiffusion`; `healFromPatch` applies it; `patchSelection` calls the helper in place of its own loop. Healing Brush: the Diffusion row. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, healFromSource, insideDistance, premultiply, spotHeal, unpremultiply, type HealMode } from './retouch';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10 };
        const diffusion = opts.patchMode === 'normal' ? Math.round(Math.min(7, Math.max(1, opts.patchDiffusion))) : 7;
        if (diffusion < 7 || colour < 1) {
          const dist = diffusion < 7 ? insideDistance(mask, W, H) : null, L = 2 ** diffusion;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (mask[i] < 128) continue;
            const w = colour * (dist ? Math.exp(-dist[i] / L) : 1);
            const s = (Math.min(H - 1, Math.max(0, y + oy)) * W + Math.min(W - 1, Math.max(0, x + ox))) * 4;
            for (let ch = 0; ch < 3; ch++) out.data[i * 4 + ch] = Math.round(orig[s + ch] + w * (out.data[i * 4 + ch] - orig[s + ch]));
          }
        }
```

## Patch Diffusion, Structure and Color · _v1.9.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/patch.ts; tests/inside-distance.test.ts and e2e/test_patch_settings.py new)

`retouch.ts`: `insideDistance`. Engine: `retouch.patchDiffusion`, `patchStructure`, `patchColor`; `patchSelection` scales the heal's colour correction by Diffusion (Normal) and Color (Content-Aware) and sizes the rebuilt edge band by Structure. Patch tool: the three rows, each shown in its mode. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, healFromSource, premultiply, spotHeal, unpremultiply, type HealMode } from './retouch';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false };
          const band = new Uint8Array(W * H), R = 3;
```

## The Layers panel moves in the dock · _v1.8.0 (src/ui/layers.ts, src/ui/dock.ts, src/styles/panels.css; e2e/test_dock_layers.py new)

`LayersPanel` wraps its parts in `section.cv-layers-panel`. `.cv-layers` is a flex column; `.cv-layers-panel` takes the space left, with its own `[hidden]` rule. `DOCK_PANELS` gains Layers, first; `load` puts a panel missing from a saved arrangement at its default place. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto auto auto; min-height: 0; background: var(--bg-secondary); position: relative; }
```

```ts
 *  panels"; TeachUcomp). This first slice moves Paths, Timeline and History below the Layers panel; floating panels
 *  and grouping into tabs come later. */
    for (const id of ids) if (!order.includes(id)) order.push(id);
      `<div class="cv-panel-head"><span class="cv-panel-title">${icon('layers', 14)}Layers</span><span></span><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="add-mask">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="clip">${icon('clipMask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-layer">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="delete-layer">${icon('delete', 16)}</button></div>`);
```

## Clone Source: five sources and the overlay · _v1.7.0 (src/extensions/tools/clone.ts, src/engine/index.ts; e2e/test_clone_slots.py new)

Engine: `cloneSlots`, `cloneSlot`, `selectCloneSlot`, `resetCloneTransform`, `cloneOverlay`, `cloneOverlayImage` (with `cloneFullCache`); `setCloneSource` fills the chosen slot. Clone Stamp: the Source row, Reset Transform, Show Overlay, Clipped, Overlay opacity and Auto Hide; its overlay draws clipped or the whole source by those settings. Removed:

```ts
import type { Pt } from '../../engine';
    const e = ctx.engine, v = ctx.view();
    // Between strokes, the circle previews what a click would stamp; Option (picking a source) hides it.
    if (hover && !picking) {
      const pv = e.clonePreview(hover, v.zoom * (window.devicePixelRatio || 1));
      if (pv) {
        const c = v.toScreen(hover), size = e.brush.diameter * v.zoom;
        g.save();
        g.globalAlpha = e.brush.opacity;
        g.drawImage(pv, c.x - size / 2, c.y - size / 2, size, size);
        g.restore();
```

## Panels move in the dock; the Window menu · _v1.6.0 (src/app.ts, src/styles/panels.css; src/ui/dock.ts and e2e/test_dock.py new)

`dock.ts`: `DOCK_PANELS`, `Dock` (drag a header to reorder, `toggle`, `reset`, the arrangement kept on this device). `app.ts` makes the dock after the panels, adds a command per panel and Reset Panels, and a Window menu. `.cv-layers` becomes the marker's positioning context; `.cv-dock-grip` and `.cv-dock-marker` are new. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto auto auto; min-height: 0; background: var(--bg-secondary); }
```

## Crop W x H x Resolution and presets · _v1.5.0 (src/extensions/tools/crop.ts, src/engine/index.ts; e2e/test_crop_size.py new)

Engine: `cropToSize` (crop, then `resampleImage`, in one history step). Crop tool: the `size` choice with its state, `toPx`, `sizePx`, `frontImage`, `sizeChanged`, saved presets (`loadPresets`, `savePresets`, `presetLabel`), the W, H, Unit, Resolution, Front Image, Preset, New Crop Preset and Delete Crop Preset rows, and `commit` resampling when a size is set. Removed:

```ts
  e.straightenCrop(r, angle, contentAware);
```

## The reference app's project format and notice removed · _v1.4.0 (src/app.ts, src/io/project-io.ts, src/io/images.ts, src/engine/types.ts, src/engine/adjust.ts, src/engine/kernels.ts, src/ui/app-dialogs.ts, src/ui/icons.ts, src/styles/dialogs.css, src/version.ts; src/ui/notices.ts deleted)

`project-io.ts` loses `serializeRefProject` and its helpers; `app.ts` its command and menu entry; `types.ts` and `project-io.ts` the constants only it used; `images.ts` the `.ref` extension. `notices.ts` is deleted, and About formvis no longer shows the notice; its style rule goes. The Open dialog's folder button reads Project folder. The unused `renderer` icon goes. Comments describe formvis's own project file. Version 1.4.0. Removed:

```ts
import { deserialize, serialize, serializeRefProject } from './io/project-io';
  /** A project: `Name.ref.zip`, which unzips to the `Name.ref` package opens. */
  async function exportRefProject(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const { manifest, files, notes } = await serializeRefProject(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
        await deliver(await api.package(manifest, files, `${p.name}.ref`), `${p.name}.ref.zip`);
        if (notes.length) toast(`Exported as .ref with changes: ${notes.join(' ')}`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }
    { id: 'export-ref', label: 'Export .ref Project...', enabled: has, run: () => void exportRefProject() },
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? [{ label: 'Open Recent', items: [...recent.map((_, i) => `recent-${i}`), '-', 'clear-recent'] }] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-',
 *  Settings keep the field names and layouts `.ref` projects use, including dictionaries stored as alternating
/** The data a new adjustment layer starts with, in the `.ref` field layout. */
 *  names and meanings `.ref` projects use. */
/** The modes a `.ref` project can hold; others export as Normal. */
export const REF_BLEND_MODES: ReadonlySet<BlendMode> = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'color-dodge', 'color-burn', 'hue', 'saturation', 'color', 'luminosity']);
export const PROJECT_ACCEPT = '.fmv,.formvis,.ref,.canvasor,.zip,.psd,.psb';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|ref|canvasor|zip|psd|psb)$/i.test(f.name);
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB, timelineData, timelineFrom, type Timeline, addPattern, patternById, projectPatterns,
const REF_KINDS: ReadonlySet<string> = new Set(['Hue/Saturation', 'Levels', 'Curves', 'Exposure', 'Gradient Map', 'Grain']);
const REF_BLEND_LABELS: ReadonlySet<string> = new Set(BLEND_MODES.filter((b) => REF_BLEND_MODES.has(b.id)).map((b) => b.label));
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const asUuid = (v: unknown, map: Map<string, string>): string | null => {
  const s = str(v);
  if (!s) return null;
  let u = map.get(s);
  if (!u) { u = UUID.test(s) ? s : uid().toUpperCase(); map.set(s, u); }
  return u;
};
/** The document as a project (format `com.reference.project`, version 7), for `Name.ref/`: the same
 *  manifest and files as `serialize`, reshaped to what `ProjectStore.validate` accepts: UUID ids (regenerated where
 * formvis fell back to counters), image files named after them, folders without opacity or blend (the
 *  folders carry neither), adjustment layers without pixels, non-empty names and a resolution of 1 to 9600. Anything
 * changed is listed in `notes` so the person knows what will see differently. */
export async function serializeRefProject(doc: Doc, activeId: ID | null, paths: PathSet | null = null, timeline: Timeline | null = null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
  const { manifest, files } = await serialize(doc, activeId);
  const ids = new Map<string, string>(), rename = new Map<string, string>(), drop = new Set<string>(), notes: string[] = [];
  if (pathSetData(paths)) notes.push('Paths are left out; .ref projects have none.');
  if (timelineData(timeline)) notes.push('Animation frames are left out; .ref projects have none.');
  const layers = (Array.isArray(manifest.layers) ? manifest.layers.map(obj) : []).map((r) => {
    const id = asUuid(r.id, ids) as string, out: Json = { ...r, id };
    const name = (str(r.name) ?? '').trim();
    if (!name) { out.name = 'Layer'; notes.push('An unnamed layer was named "Layer".'); }
    if (r.parentID) out.parentID = asUuid(r.parentID, ids);
    if (r.maskSourceID) out.maskSourceID = asUuid(r.maskSourceID, ids);
    if (str(r.imageFile)) {
      if (r.adjustment) { drop.add(str(r.imageFile) as string); delete out.imageFile; }
      else { rename.set(str(r.imageFile) as string, `${id}.png`); out.imageFile = `${id}.png`; }
    }
    if (str(r.maskFile)) { rename.set(str(r.maskFile) as string, `${id}.mask.png`); out.maskFile = `${id}.mask.png`; }
    if (r.vector) { delete out.vector; notes.push(`"${name || 'Layer'}" goes as pixels; .ref projects have no shape layers.`); }
    if (str(r.smartSourceFile)) {
      drop.add(str(r.smartSourceFile) as string);
      if (str(r.smartFilterMaskFile)) drop.add(str(r.smartFilterMaskFile) as string);
      delete out.smartSourceFile;
      delete out.smartFilterMaskFile;
      delete out.smart;
      notes.push(`"${name || 'Layer'}" goes as pixels; .ref projects have no smart objects.`);
    }
    if (r.isGroup === true && ((typeof r.opacity === 'number' && r.opacity !== 1) || (r.blendMode && r.blendMode !== 'Normal'))) {
      delete out.opacity; delete out.blendMode;
      notes.push(`Folder "${name || 'Layer'}" loses its opacity or blend mode; .ref folders carry neither.`);
    }
    if (typeof out.blendMode === 'string' && !REF_BLEND_LABELS.has(out.blendMode)) {
      notes.push(`"${name || 'Layer'}" uses ${out.blendMode}, which .ref projects cannot hold; it exports as Normal.`);
      delete out.blendMode;
    }
    if (out.effects) {
      notes.push(`"${name || 'Layer'}" loses its layer style; .ref projects have none.`);
      delete out.effects;
    }
    if (out.text) {
      notes.push(`"${name || 'Layer'}" becomes plain pixels; .ref projects have no editable type.`);
      delete out.text;
    }
    if (r.adjustment && !REF_KINDS.has(String(obj(r.adjustment).kind))) {
      notes.push(`"${name || 'Layer'}" is a ${String(obj(r.adjustment).kind)} layer, which .ref projects cannot hold; it is left out.`);
      return null;
    }
    return out;
  }).filter((x): x is Json => x !== null);
  const res = num(manifest.resolution, 72);
  const out: Json = { ...manifest, format: 'com.reference.project', version: 7, documentID: asUuid(manifest.documentID, ids) ?? uid().toUpperCase(), resolution: Math.min(9600, Math.max(1, res)), layers };
  if (manifest.activeLayerID) out.activeLayerID = asUuid(manifest.activeLayerID, ids);
  if (res < 1 || res > 9600) notes.push(`Resolution ${res} was clamped to the .ref range, 1 to 9600.`);
  const parts = files.filter((f) => !drop.has(f.name)).map((f) => ({ ...f, name: rename.get(f.name) ?? f.name }));
  return { manifest: out, files: parts, notes };
}
.cv-notice { height: 132px; margin: 0; overflow-y: auto; padding: var(--space-2); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-muted); font-family: var(--font-mono); font-size: var(--fs-11); line-height: 1.45; white-space: pre-wrap; }
import { REFERENCE_NOTICE } from './notices';
    const row = el(`<div class="cv-welcome-actions"><button class="cv-btn" type="button" data-from="file">${icon('upload', 14)}From disk</button><button class="cv-btn" type="button" data-from="folder">${icon('folderOpen', 14)}.ref folder</button></div>`);
    this.body.appendChild(el('<p class="cv-note">formvis began as a port of the reference app by its authors. Parts derived from it are used under the MIT License:</p>'));
    const notice = el('<pre class="cv-notice"></pre>');
    setText(notice, REFERENCE_NOTICE);
    this.body.appendChild(notice);
  renderer: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>`,
/** the reference app's MIT License notice, shown in About formvis. formvis began as a port of the reference app by its authors
 *  and the license asks for this notice in every copy, the built web and desktop apps included. The same text is
 *  in `.docs/REFERENCE_NOTICE.md`. */
export const REFERENCE_NOTICE = `MIT License
Copyright (c) 2026 its authors
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
export const VERSION = '1.3.0';
```

## Home screen · _v1.3.0 (src/app.ts, src/ui/app-dialogs.ts, src/ui/prefs.ts, src/styles/shell.css; src/ui/home.ts and e2e/test_home_screen.py new)

`home.ts`: `HomeScreen` (New file, Open, recent projects; shown with no document when Auto Show is on, or from the brand mark; Esc leaves). `Prefs.autoShowHome`; Preferences gains a General section and opens on it. Removed:

```ts
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); recoveryDelay = pr.recoverySeconds * 1000; }),
    this.showSection('Interface');
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number }
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20 };
```

## Preferences · _v1.2.0 (src/ui/app-dialogs.ts, src/app.ts, src/engine/index.ts, src/styles/dialogs.css; src/ui/prefs.ts and e2e/test_preferences.py new)

`SettingsDialog` is Preferences, with Interface, Performance and File Handling sections. `prefs.ts`: `Prefs`, `DEFAULT_PREFS`, `RECOVERY_CHOICES`, `loadPrefs`, `savePrefs`, `applyPrefs`. Engine: `historyLimits`, `setHistoryLimits`, applied in `addProject`. The app applies preferences at startup and reads the recovery delay from them. Removed:

```ts
    settings: new SettingsDialog(),
    { id: 'settings', label: 'Settings...', keys: ['Mod+,'], run: () => dialogs.settings.show() },
  let recoveryDelay = 20000;
  constructor() {
    super('Settings', 460);
    this.body.appendChild(row);
    this.field('Accent', this.accent);
    this.body.appendChild(el('<p class="cv-note">Theme and accent are shared with NodeMode on this device.</p>'));
  show(): void {
```

## Crop overlays · _v1.1.0 (src/extensions/tools/crop.ts; src/extensions/tools/crop-overlays.ts, tests/crop-overlays.test.ts and e2e/test_crop_overlays.py new)

`crop-overlays.ts`: `CropOverlay`, `CROP_OVERLAYS`, `ORIENTED`, `overlayLines`. The Crop tool keeps `overlayKind` and `overlayOrient`, draws the chosen overlay, takes O and Shift+O while a frame shows, and has an Overlay select. Removed:

```ts
    for (let i = 1; i < 3; i++) {
      const x = a.x + ((b.x - a.x) * i) / 3, y = a.y + ((b.y - a.y) * i) / 3;
      g.moveTo(x, a.y); g.lineTo(x, b.y); g.moveTo(a.x, y); g.lineTo(b.x, y);
```

## Delete Cropped Pixels · _v1.0.0 (src/engine/index.ts, src/extensions/tools/crop.ts; e2e/test_crop_delete_pixels.py new)

Engine: `cropDeletePixels` (on by default) and `deleteCroppedPixels`, called by `straightenCrop` after the crop. The Crop tool's bar has Delete Cropped Pixels before Content-Aware. Nothing removed: git reports no removed lines since v0.99.0.

## Brush Flow · _v0.99.0 (src/engine/stroke.ts, src/engine/index.ts, src/extensions/tools/brush.ts; e2e/test_brush_flow.py new)

`StrokeStyle.flow` scales each dab in `PixelStroke.dab`, times the pressure dynamics' flow. Engine: `brushFlow`, passed only to the Brush and Eraser's stroke in `beginStroke`. The Brush's bar has Flow after Opacity. Removed:

```ts
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color }, op, p.selection);
export interface StrokeStyle { diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null }
    const d = this.dynamics, info = { pressure }, r = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = d ? computeOption(d.flow, info) : 1;
```

## Eyedropper Sample Size · _v0.98.0 (src/engine/index.ts, src/extensions/tools/eyedropper.ts; e2e/test_eyedropper_sample_size.py new)

Engine: `eyedropperSize`; `sampleColor` averages the Sample Size square, weighted by opacity. The Eyedropper's bar has a Sample Size select. Removed:

```ts
    const s = createSurface(1, 1);
    this.work.render({ doc: p.doc, target: s, view: translation(-Math.floor(pt.x), -Math.floor(pt.y)) });
    const d = ctxOf(s).getImageData(0, 0, 1, 1).data;
    return d[3] ? { r: d[0], g: d[1], b: d[2] } : null;
```

## canvasor projects open · _v0.97.0 (src/io/images.ts; e2e/test_canvasor_open.py new)

`PROJECT_ACCEPT` and `isProjectFile` take `.canvasor`, so the picker offers NodeMode canvasor projects and a dropped one opens as a project; the backend reads it (see the backend log). Removed:

```ts
export const PROJECT_ACCEPT = '.fmv,.formvis,.ref,.zip,.psd,.psb';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|ref|zip|psd|psb)$/i.test(f.name);
```

## The interface: menus, rail, options bar; settings dialogs; tool options · _v0.96.0 (src/ui/menu.ts, src/ui/rail.ts, src/ui/options.ts, src/ui/toast.ts, src/ui/panels/fill-dialog.ts, src/app.ts, src/engine/index.ts, src/engine/paths.ts, src/engine/kernels.ts, src/extensions/tools/{marquee,lasso,wand,gradient,healing-brush,pen,freeform-pen,type,remove}.ts, src/styles/{panels,shell}.css; src/ui/tool-groups.ts, src/ui/panels/stroke-path-dialog.ts and src/ui/panels/layer-dialogs.ts new; tests/antialias-mask.test.ts and fourteen browser test files new)

`menu.ts`: `MenuItem` may be a `SubMenu`; `PopupMenu` opens submenus beside rows, scrolls within the window, and closes a standalone menu on an outside press. `rail.ts`: one slot per tool group with a flyout, through `tool-groups.ts`. `options.ts`: wheel scrolling and edge chevrons. Engine: `fillWith` takes a name and region; `fillPathWith`, `featherMask`, `strokePathWith`, `STROKE_TOOLS`; `addLayer`, `addFolder` and `duplicateLayers` take their dialogs' settings; the wand's `antialias`; the Marquee's feather and style; the Lasso's feather; the Gradient's blend and dither. `paths.ts`: `samplePath`. `kernels.ts`: `antialiasMask`. Removed:

```ts
  const contextMenu = new PopupMenu(commands);
    { id: 'new-layer', label: 'New Layer', keys: ['Shift+Mod+N'], enabled: has, run: () => engine.addLayer() },
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-as', 'export-png', 'export-jpg', 'export-psd', 'export-psb', 'export-artboards', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill-workspace', 'content-fill', 'remove-wires', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', 'transform-warp', 'puppet-warp', '-', 'settings'] },
    { label: 'Image', items: ['adj-levels', 'adj-curves', 'adj-hsv', 'adj-exposure', 'adj-gradientMap', 'adj-grain', '-', ...PARAM_KINDS.map((k) => `adj-${k}`), '-', 'invert', '-', 'canvas-size', 'trim', 'reveal-all', 'generative-expand', 'image-size', 'upscale-2x', 'upscale-4x', '-', 'flip-canvas-h', 'flip-canvas-v'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', 'new-artboard', 'artboard-from-layers', 'artboard-options', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'shape-corners', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', '-', 'distribute-left', 'distribute-hcenter', 'distribute-right', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', 'distribute-hspace', 'distribute-vspace', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', 'select-subject', 'select-object', 'select-and-mask', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', 'feather', 'border', 'smooth', '-', 'path-selection', 'delete-path'] },
    { label: 'Filter', items: [...FILTERS.map((k) => `filter-${k}`), 'filter-liquify', '-', 'remove-bg', 'remove-bg-lite'] },
    { label: 'View', items: ['zoom-in', 'zoom-out', 'fit', 'actual', '-', 'toggle-rulers', 'toggle-guides', 'toggle-grid', 'lock-guides', 'clear-guides', 'new-guide', '-', 'pixel-grid', 'transform-controls'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'shape-corners', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
      // A letter picks its tool, keeping one already chosen from the same group; Shift with it cycles the group.
      else if (at < 0) engine.setTool(group[0].id);
import { fillVector, pathBounds, shiftPath, tracePath, type NamedPath, type PathSet, type VectorPath } from './paths';
import { wandMask } from './kernels';
import { noDynamics, type BrushDynamics, type BrushPreset } from './brush-dynamics';
  wand = { tolerance: 32, contiguous: true, sampleAll: false, sampleSize: 0 };
  addLayer(): void {
      const layer = newLayer(`Layer ${n}`, p.doc, { parentId });
  addFolder(): void {
      const group = newLayer(`Folder ${n}`, p.doc, { isGroup: true, parentId: active?.parentId ?? null });
  duplicateLayers(): void {
        const clones = subtree.map((l) => { const c = this.cloneLayer(l, l === src ? { name: `${l.name} copy` } : {}); idMap.set(l.id, c.id); return c; });
  fillWith(contents: { color: RGB } | { patternId: ID } | { history: true }, blend: BlendMode, opacity: number, preserveTransparency: boolean): void {
    this.regionEdit('Fill', ({ raster, target, rect, cover }) => {
    });
    const mask = wandMask(data, W, H, x, y, this.wand.tolerance, this.wand.contiguous, this.wand.sampleSize);
  gradientSettings: { shape: GradientType; style: string; reversed: boolean; opacity: number } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1 };
import type { Pt } from '../../engine';
    { kind: 'title', text: 'Clone Stamp' },
  const mask = SelectionMask.fromPath(doc.width, doc.height, boundsOf(poly), (c) => {
import { SelectionMask, type Pt, type Rect, type SelectionMode } from '../../engine';
    const r = dragRect(d.anchor, d.point, d.square, d.center);
    const mask = SelectionMask.fromPath(doc.width, doc.height, r, (c) => {
    const r = dragRect(draft.anchor, draft.point, draft.square, draft.center);
    { kind: 'toggle', label: 'Anti-alias', get: () => e.selectionAntialiased, set: (v) => { e.selectionAntialiased = v; e.emit('options', null); } },
  id: 'remove', label: 'Remove', key: 'J', order: 54,
.cv-menu { position: fixed; min-width: 232px; padding: var(--space-1); background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-window); }
.cv-rail-tools { display: flex; flex-direction: column; gap: var(--space-1); }
export type MenuItem = string | '-';
  private items: MenuItem[] = [];
  constructor(private readonly commands: Commands) {
    if (items.join('|') === this.items.join('|')) return;
    this.items = items;
      node.addEventListener('click', () => { this.close(); this.commands.run(item); });
    for (const r of this.rows) {
      const cmd = this.commands.get(r.id);
      if (!cmd) continue;
      setText(q(r.node, '.cv-menu-label'), this.commands.label(cmd));
      setDisabled(r.node, !this.commands.enabled(cmd));
      setClass(r.node, 'is-checked', !!cmd.checked?.());
    }
      if (!m.menu.panel.contains(t) && !m.btn.contains(t)) this.close();
    this.body.append(this.contentsRow.el, this.colorRowEl.el, this.patternRow.el, this.modeRow.el, this.opacityRow.el, this.preserveRow.el);
  show(): void {
    const ca = this.contents === 'contentAware';
    e.fillWith(k === 'history' ? { history: true } : color ? { color: { ...color } } : { patternId: this.patternId }, this.blend, this.opacity / 100, this.preserve);
import { hexOf, type Engine, type RGB, type ToolId } from '../engine';
import { toolList } from '../extensions/registry';
import { el, q, setClass, setHtml, setTitle, setValue } from './dom';
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();
    for (const t of toolList()) {
      const b = el<HTMLButtonElement>('<button class="cv-tool" type="button"></button>');
      b.setAttribute('aria-label', t.label);
      setTitle(b, t.id === 'brush' ? 'Brush (B) · Eraser (E)' : `${t.label} (${t.key})`);
      b.addEventListener('click', () => { engine.setTool(t.id); if (t.id === 'brush') engine.setBrushMode('paint'); });
      this.buttons.set(t.id, b);
    for (const t of toolList()) {
      const b = this.buttons.get(t.id);
      if (!b) continue;
      const key = t.icon(this.engine);
      setHtml(b, icon(key, 20), key);
      setClass(b, 'is-active', this.engine.tool === t.id);
```

## Pen and paths: paths in PSD, Path Selection, Freeform and Curvature Pens, path operations; single notices · _v0.95.0 (src/io/psd-paths.ts, src/engine/curve-fit.ts, src/extensions/tools/path-select.ts, freeform-pen.ts and curvature-pen.ts new; src/engine/paths.ts, src/engine/index.ts, src/engine/types.ts, src/extensions/tools/index.ts, src/io/psd.ts, src/ui/toast.ts, src/app.ts; tests/psd-paths.test.ts, tests/curve-fit.test.ts and six browser test files new)

`psd-paths.ts`: `pathRecords`, `pathFromRecords`, `addPathResources`, `readPathResources`, with operations in length records. `curve-fit.ts`: `simplify`, `smoothAnchors`. `paths.ts`: `PathOp`, `PATH_OPS`, `SubPath.op`, `fillVector`, operations saved and read. In the engine, shape layers, Make Selection and Fill Path fill through `fillVector`; `paintPath` passes the path. Three tools registered with their ids. `psd.ts` writes and reads the Paths panel and keeps operations both ways; `readPsdFile` returns `paths`. `toast.ts` renews a notice already showing. Removed:

```ts
            const { doc, notes, activeId } = await readPsdFile(f);
            engine.addProject(doc, f.name.replace(/\.psd$/i, ''), activeId);
        const { bytes, notes } = await writePsdFile(p.doc, flat, psb);
        if (engine.pathsOf(p).list.length) notes.push('Paths in the Paths panel are left out; shape layers keep their outlines.');
import { pathBounds, shiftPath, tracePath, type NamedPath, type PathSet, type VectorPath } from './paths';
    if (style.fill) { c.fillStyle = rgbCss(style.fill); c.fill(shape); }
    const shape = tracePath(vp);
    const mask = SelectionMask.fromPath(p.doc.width, p.doc.height, b, (c) => c.fill(shape), true);
  fillPath(): void { this.paintPath('Fill Path', (c, shape) => { c.fillStyle = rgbCss(this.fg); c.fill(shape); }); }
  private paintPath(name: string, paint: (c: Ctx2D, shape: Path2D) => void): void {
      paint(c, shape);
export interface SubPath { anchors: Anchor[]; closed: boolean }
export function pathData(vp: VectorPath | null): { subpaths: Array<{ closed: boolean; anchors: number[][] }> } | null {
    if (anchors.length) subpaths.push({ anchors, closed: (s as { closed?: unknown }).closed === true });
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'idle';
  for (const tool of [moveTool, marqueeTool, lassoTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, directSelectTool, penTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
export async function readPsdFile(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null }> {
  const psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true });
        if (vm.paths.some((bp) => bp.operation && bp.operation !== 'combine' && bp.operation !== 'subtract')) notes.push(`"${name}" combines shapes in ways formvis does not (intersect or exclude); its outline may differ once edited.`);
  return { doc: { ...doc, layers }, notes, activeId: layers.at(-1)?.id ?? null };
export async function writePsdFile(doc: Doc, composite: Surface, psb = false): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
          open: !sp.closed, operation: sp.closed && main && Math.sign(areas[i]) === -Math.sign(main) ? 'subtract' as const : 'combine' as const, fillRule: 'non-zero' as const,
  return { bytes: writePsd(psd, { generateThumbnail: false, psb }), notes };
  const node = el(`<div class="cv-toast${kind === 'error' ? ' is-error' : ''}" role="status"></div>`);
  window.setTimeout(() => node.remove(), kind === 'error' ? 6000 : 3600);
```

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
        if (vm.paths.some((bp) => bp.operation && bp.operation !== 'combine')) notes.push(`"${name}" combines shapes in ways formvis does not; its outline may differ once edited.`);
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
export const PROJECT_ACCEPT = '.fmv,.formvis,.ref,.zip,.psd';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|ref|zip|psd)$/i.test(f.name);
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt, defaultEffects, patternById, addPattern, projectPatterns, createSurface, ctxOf, type LayerEffects, renderText, textKey, TEXT_FONTS, type TextSpec,
export const isPsdFile = (f: File): boolean => /\.psd$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';
      if (!pl.canvas || !pl.canvas.width || !pl.canvas.height) {
        if (pl.adjustment) notes.push(`"${name}" is an adjustment layer; formvis left it out.`);
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

## .abr brush import, live option lists, .fmv projects · _v0.90.0 (src/engine/abr.ts and src/io/brush-library.ts new, src/engine/stroke.ts, src/engine/brush-dynamics.ts, src/engine/index.ts, src/extensions/registry.ts, src/ui/options.ts, src/extensions/tools/brush.ts, src/extensions/tools/gradient.ts, src/io/images.ts, src/app.ts; tests/abr.test.ts, e2e/test_abr_import.py and e2e/test_sny_projects.py new)

`abr.ts`: `parseAbr` for versions 1, 2 and 6 to 10, `SampledTip`, `AbrBrush`. `stroke.ts`: `sampledTip`, a tip in the style, `tipAspect`, spacing a quarter of a sampled tip. `brush-dynamics.ts`: `tip` on presets, `importedBrushPresets`, `setImportedBrushPresets`, `allBrushPresets`, `presetFromTip`. In the engine, `tip` on brush settings (kept by `setBrush`, set by presets) and `uiHooks.importBrushes`. `brush-library.ts`: IndexedDB keeping and `importAbr`. The select option spec takes a `live` list, patched in place by the options bar; the Brush Preset and Gradient Colors lists use it. Projects download as `.fmv`; `.fmv` and `.formvis` are accepted. Removed:

```ts
        await deliver(await api.package(manifest, files), `${p.name}.formvis`);
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
export const PROJECT_ACCEPT = '.formvis,.ref,.zip,.psd';
export const isProjectFile = (f: File): boolean => /\.(formvis|ref|zip|psd)$/i.test(f.name);
        sync.push(() => { const v = spec.get(); if (box.value !== v) box.value = v; });
```

In `src-tauri/tauri.conf.json` the association takes `.fmv` beside `.formvis`. Removed:

```json
      { "ext": ["formvis"], "name": "formvis Project", "description": "formvis layered image project", "role": "Editor", "mimeType": "application/x-formvis" },
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

`puppet.ts` is rigid moving least squares (Schaefer, McPhail and Warren, 2006), written for formvis: `mlsRigid` and `puppetImage` (the backward map on an 8 px grid, interpolated). In the engine, `puppetEdit` with `beginPuppetWarp`, `addPuppetPin`, `movePuppetPin`, `removePuppetPin`, `schedulePuppet`, `puppetRender`, `applyPuppetWarp`, `cancelPuppetWarp` and `dropPuppet`, and the preview in the layer overrides. The Move tool places, drags and Alt-removes pins (`pinDrag`, `puppetPin`), applies on Enter, cancels on Escape and draws the pins. `app.ts` adds `puppet-warp` to the Edit menu. Removed:

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

`mesh-warp.ts` is ported from NodeMode's formvis studio (`studio/pixel/transform.ts`, nodemode_dev v8.73.1, the owner's build, MIT): `convexQuad`, `invBilinear`, `meshSurfacePoint`, a private `invSmooth`, `meshWarpImage` (plain or smooth, on ImageData instead of a tile store) and `uniformGrid`. In the engine, `meshWarpEdit` with `beginMeshWarp`, `moveMeshWarpPoint` (folding moves ignored, preview once per frame), `meshWarped`, `applyMeshWarp` (one Warp step, trimmed), `cancelMeshWarp` and `dropMeshWarp`, and the pending warp's preview in the layer overrides. The Move tool drags control points (`warpDrag`, `warpPoint`), applies on Enter, cancels on Escape and draws the grid as the surface's curves. `app.ts` adds `transform-warp` to the Edit menu. Removed:

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

Ported from NodeMode's formvis studio (`studio/paint/dynamics.ts` and `preset.ts`, nodemode_dev v8.73.1, the owner's build, MIT): `computeOption` with sampled curves, reversal, combine modes and strength; `identityOption`, `pressureOption`; five built-in presets trimmed to formvis's brush; `presetsFromJson` for stored presets. Nothing was removed.

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

Ported from NodeMode's formvis studio, `studio/pixel/shapes.ts` (nodemode_dev v8.73.1, the owner's build, MIT): `ngonPoints`, `starPoints`, `arrowPoints` and `heartPoints`, moved from `[x, y]` tuples to `Pt` and from a tile-store scanline fill to closed corner-anchor `VectorPath`s through `boxedShapePath` (fitted to the dragged box) and `linePath` (a line is an arrow with no head). Nothing was removed.

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

The IndexedDB store for crash-recovery copies (`formvis-recovery`, store `docs`, keyed by project id). Every call resolves, to null or an empty list when storage is unavailable, so recovery can never break editing. Nothing was removed.

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

/** Edit > Generative Fill: a prompt for what to paint into the selection, sent by the formvis engine to fal (FLUX.1
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
    this.keyRow.append(this.key, el('<p class="cv-note">Get a key at fal.ai. The formvis engine keeps it in its data folder on this computer.</p>'));
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
    setText(this.state, !s ? 'The formvis engine is offline. Start it with ./formvis boot.'
      : s.configured ? `fal key set ${s.source === 'environment' ? 'by FAL_KEY in the environment' : 'in formvis'}.` : 'Add a fal API key to generate.');
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
        tokens.css  · NodeMode tokens plus the formvis block
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

Adds the clipboard, selection-modify, Image adjustment, New Adjustment Layer, Canvas Size, Image Size and filter commands, and a Filter menu that now holds Remove Background. Copy writes PNG plus a `formvis:` marker to the system clipboard; Mod+V is let through to the native paste event, which pastes in-app copies in place and external images centered above the active layer. Double-clicked adjustment rows open their editor through `cv:edit-adjustment`.

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
<div class="cv-welcome-title">${icon('paintbrush', 20)}formvis</div>
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
  if (import.meta.env.DEV) (window as unknown as { formvis: unknown }).formvis = { engine, commands };
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
  if (import.meta.env.DEV) (window as unknown as { formvis: unknown }).formvis = { engine, commands, actions };
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

Lays a refined subject mask on a layer as one Remove Background step, stored as formvis masks are (white with the level in alpha), multiplied into an existing same-size unplaced mask as the `subjectMask` does. Nothing was removed; `setMaskFromImage` stays for other callers.

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

formnodal's develop core from the owner's formvis extension for NodeMode: the per-pixel pass as written, en and em dashes in comments normalised; `detailPass`, `clarityPass` and `developImage` keep formnodal's detail formulas with formvis's Gaussian in place of a canvas blur filter. Nothing was removed.

### src/engine/develop.ts · header · _v0.38.0

The owner confirmed formnodal is their own build. Removed:

```ts
 *  Gaussian, so the whole filter runs in the preview worker. formnodal's LICENSES.md names the MIT-licensed reference
 *  its adjustment algorithms derive from; that project's notice belongs in formvis's NOTICE. */
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
export const PROJECT_ACCEPT = '.formvis,.ref,.zip';
export const isProjectFile = (f: File): boolean => /\.(formvis|ref|zip)$/i.test(f.name);
```

## src/io/project-io.ts

### src/io/project-io.ts · serialize and deserialize · _v0.1.0

Field names and labels come from the original `ProjectStore.swift`, `LayerTransform.swift`, `LayerAppearance.swift` and `LayerAdjustment.swift`, checked against the source. Masks are written as grayscale PNGs; `adjustment` and `shape` round-trip verbatim.

### src/io/project-io.ts · serializeRefProject · _v0.28.0

The document as a version 7 project, reshaped from `serialize` to pass the ProjectStore.validate (UUID ids, files named after them, plain folders, adjustment layers without pixels, non-empty names, clamped resolution), with notes for every change. Nothing was removed.

### src/io/project-io.ts · .ref blend rule · _v0.33.0

Blend modes outside `REF_BLEND_MODES` export to `.ref` as Normal, with a note. Nothing was removed.

### src/io/project-io.ts · effects · _v0.39.0

Effects save in `.formvis` and read back through `effectsFromData`; `.ref` export drops them with a note. Removed:

```ts
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform,
      blend: blendFromLabel(r.blendMode), mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
```

### src/io/project-io.ts · type in files · _v0.40.0

Live type saves in `.formvis` and reopens editable; `.ref` export notes it becomes pixels. Removed:

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

### src/styles/tokens.css · NodeMode tokens plus the formvis block · _v0.1.0

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
    this.body.appendChild(el(`<div class="cv-welcome-title">${icon('paintbrush', 20)}formvis ${VERSION}</div>`));
```

### src/ui/app-dialogs.ts · the reference app notice in About · _v0.37.0

About formvis says formvis began as a port of the reference app and shows the MIT notice from `ui/notices.ts` in a fixed-height box. Nothing was removed.

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

Ported from the `JPEGExportSheet.swift`. Quality starts from the last export, remembered in localStorage under `formvis.jpegQuality`, and from 85% the first time; the sheet shows the image size and sRGB and previews the actually encoded JPEG, debounced 120 ms, with its encoded size. The preview canvas keeps one size (432 by 280) with the image fitted inside, so the sheet never changes height, and the preview is decoded with `createImageBitmap` rather than shown through a blob URL, which the desktop CSP may refuse. Export stores the quality and hands it back to the caller.

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

// Type (DEV_PLAN 36.13): the Engine's type layer methods (new type, type on a path, type masks, edits and bulk edits of
// live text, Create Work Path and Convert to Shape), moved out of index.ts. Each takes a TextHost, the few Engine members
// they use, so this file never imports the Engine class. The Type tool's settings stay a field of the Engine; the host
// reads and writes them through `textSettings`.
import type { Project } from './project';
import { applyMat, contains, placement } from './geometry';
import { glyphOutlines } from './glyph-outlines';
import { SelectionMask, type SelectionMode } from './selection';
import { samplePath, type SubPath, type VectorPath } from './paths';
import { traceAlpha } from './trace-outline';
import { liveText, loadTextFont, renderText, textKey, withCharStyle } from './text';
import type { Raster } from './surface';
import type { CharacterStyle, ID, Layer, Pt, ShapeStyle, TextSpec } from './types';

/** What the type methods need of the Engine. `current` is read live, as these methods wait on font loads. */
export interface TextHost {
  readonly current: Project | null;
  /** The Type dialog's last settings, which new text starts from. */
  textSettings: TextSpec;
  notice(text: string): void;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  applySelection(next: SelectionMask | null, mode: SelectionMode, name: string): void;
  insertRasterLayer(raster: Raster, name: string, x: number | null, y: number | null, extra?: Partial<Layer>, undoName?: string): void;
  /** The paths the type methods read and write: the selected path, and selecting or setting it. */
  paths: {
    readonly work: VectorPath | null;
    select(id: ID | null): void;
    setWork(vp: VectorPath | null): void;
  };
  renderShape(path: VectorPath, style: ShapeStyle): { raster: Raster; x: number; y: number } | null;
}

/** The topmost visible type layer whose box contains `pt`, for the Type tool to edit. */
export function textLayerAt(host: TextHost, pt: Pt): ID | null {
  const p = host.current;
  if (!p) return null;
  for (const l of [...p.doc.layers].reverse()) if (l.visible && liveText(l) && contains(l.transform, pt)) return l.id;
  return null;
}

/** Type Mask: the text rendered and placed as a layer would be, its coverage made the selection; one
 *  step, no layer. */
export async function createTextSelection(host: TextHost, at: Pt, spec: TextSpec, mode: SelectionMode = 'replace'): Promise<void> {
  const p = host.current;
  if (!p || !spec.content.trim()) return;
  await loadTextFont(spec);
  const r = renderText(spec), w = r.raster.width, h = r.raster.height, colW = spec.size * spec.lineHeight;
  const x = Math.round(spec.box ? at.x : spec.direction === 'vertical' ? at.x - (w - r.pad - colW / 2) : at.x - (spec.align === 'center' ? w / 2 : spec.align === 'right' ? w - r.pad : r.pad));
  const y = Math.round(spec.box ? at.y : spec.direction === 'vertical' ? at.y - r.pad : at.y - r.baseline);
  // Only what lies on the canvas is selected (1.49.7 let it run past).
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(p.doc.width, x + w), y1 = Math.min(p.doc.height, y + h);
  if (x1 <= x0 || y1 <= y0) { host.notice('The type lies outside the canvas.'); return; }
  const cw = x1 - x0, ch = y1 - y0, d = r.raster.ctx.getImageData(x0 - x, y0 - y, cw, ch).data, a = new Uint8Array(cw * ch);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  host.applySelection(SelectionMask.cropped(x0, y0, cw, ch, a), mode, spec.direction === 'vertical' ? 'Vertical Type Mask' : 'Horizontal Type Mask');
}

export async function createTextLayer(host: TextHost, at: Pt, spec: TextSpec): Promise<void> {
  if (!host.current || !spec.content.trim()) return;
  await loadTextFont(spec);
  const r = renderText(spec), w = r.raster.width;
  // Paragraph text's box starts where it was dragged; vertical type's first column (the right one) is centred on the
  // click, its first character just below it; point text keeps its first baseline at the click, by its alignment.
  const colW = spec.size * spec.lineHeight;
  const x = spec.box ? at.x : spec.direction === 'vertical' ? at.x - (w - r.pad - colW / 2) : at.x - (spec.align === 'center' ? w / 2 : spec.align === 'right' ? w - r.pad : r.pad);
  host.textSettings = { ...spec, content: '', rendered: undefined, runs: undefined };
  const name =spec.content.split('\n')[0].trim().slice(0, 40) || 'Type';
  const y = spec.box ? at.y : spec.direction === 'vertical' ? at.y - r.pad : at.y - r.baseline;
  host.insertRasterLayer(r.raster, name, Math.round(x), Math.round(y), { text: { ...spec, rendered: textKey(r.raster) } }, 'Type');
}

/** Layer > Type on Path: `content` set along the active path's first subpath of two or more anchors, in the current
 *  type settings, from `offset` percent of its length; the path kept with the type, relative to a frame around it
 *  (its bounds and a margin of one and a half times the type size), where the layer is placed. */
export async function createTextOnPath(host: TextHost, content: string, offset: number): Promise<boolean> {
  const p = host.current, sp = host.paths.work?.subpaths.find((s) => s.anchors.length > 1);
  if (!p) return false;
  if (!sp) { host.notice('Draw a path with the Pen tool first, then set type on it.'); return false; }
  return textOnSubpath(host, content, offset, sp, 'Type on Path');
}

/** Layer > Type > Type on Arc / Type on Circle: `content` set along an arc (degrees, 0 at the top, clockwise; the type
 *  reads left to right along the top when start is minus half the sweep) or a full circle, live and editable. */
export async function createTextOnShape(host: TextHost, content: string, shape: { kind: 'arc' | 'circle'; cx: number; cy: number; r: number; start: number; sweep: number }, offset: number): Promise<boolean> {
  if (!host.current) return false;
  const circle = shape.kind === 'circle', r = Math.max(1, shape.r), sweep = circle ? 360 : Math.max(1, Math.min(360, shape.sweep));
  const n = Math.max(1, Math.ceil(sweep / 90 - 1e-9)), theta = sweep / n, k = (4 / 3) * Math.tan((theta * Math.PI) / 180 / 4) * r;
  const count = circle ? n : n + 1, anchors: SubPath['anchors'] = [];
  for (let i = 0; i < count; i++) {
    const a = ((shape.start + theta * i) * Math.PI) / 180, tx = Math.cos(a) * k, ty = Math.sin(a) * k;
    const x = shape.cx + Math.sin(a) * r, y = shape.cy - Math.cos(a) * r;
    anchors.push({ x, y, inX: !circle && i === 0 ? x : x - tx, inY: !circle && i === 0 ? y : y - ty, outX: !circle && i === count - 1 ? x : x + tx, outY: !circle && i === count - 1 ? y : y + ty });
  }
  return textOnSubpath(host, content, offset, { anchors, closed: circle }, circle ? 'Type on Circle' : 'Type on Arc');
}

export async function textOnSubpath(host: TextHost, content: string, offset: number, sp: SubPath, undoName: string): Promise<boolean> {
  const p = host.current;
  if (!p) return false;
  if (!content.trim()) { host.notice('Type some text to set on the path.'); return false; }
  const base: TextSpec = { ...host.textSettings, content: content.replace(/\r?\n/g, ' '), warp: null, onPath: null, rendered: undefined };
  await loadTextFont(base);
  if (host.current !== p) return false;
  const rough = samplePath(sp, 4), length = rough.reduce((s, q, i) => (i ? s + Math.hypot(q.x - rough[i - 1].x, q.y - rough[i - 1].y) : 0), 0);
  const pts = samplePath(sp, Math.max(1, length / 2000)), m = Math.ceil(base.size * 1.5);
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), ox = Math.floor(Math.min(...xs) - m), oy = Math.floor(Math.min(...ys) - m);
  const frame = { w: Math.ceil(Math.max(...xs) - ox + m), h: Math.ceil(Math.max(...ys) - oy + m) };
  const spec: TextSpec = { ...base, onPath: { points: pts.map((q) => ({ x: q.x - ox, y: q.y - oy })), offset: Math.max(0, Math.min(100, offset)), frame } };
  const r = renderText(spec);
  host.textSettings = { ...base, content: '', onPath: null };
  host.insertRasterLayer(r.raster, spec.content.trim().slice(0, 40) || 'Type', ox, oy, { text: { ...spec, rendered: textKey(r.raster) } }, undoName);
  return true;
}

/** Layer > Type > Create Work Path (DEV_PLAN 32.7 part b): the active type layer's outlines become the Work Path, read from
 *  the font file's glyph outlines (curves exact, the layer's position, scale, flips and rotation applied) where the layout
 *  is one they follow, else traced from the rendered pixels (position, scale and rotation applied). Paths sit outside
 *  undo, so this is not a history step. */
export async function typeToWorkPath(host: TextHost): Promise<boolean> {
  const p = host.current, l = p?.activeLayer;
  if (!p || !l || !l.raster || !l.text || !liveText(l)) { host.notice('Select a type layer first.'); return false; }
  const r = l.raster, spec = withCharStyle(l.text, l.text.charStyle ? p.doc.characterStyles?.find((x) => x.id === l.text?.charStyle) : undefined);
  let vp: VectorPath | null = await glyphOutlines(spec, r, l.transform);
  if (host.current !== p || p.activeLayer !== l) return false;
  if (!vp) {
    const d = r.ctx.getImageData(0, 0, r.width, r.height).data, alpha = new Uint8ClampedArray(r.width * r.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
    vp = traceAlpha(alpha, r.width, r.height);
    const m = placement(l.transform, r.width, r.height), at = (x: number, y: number): { x: number; y: number } => applyMat(m, x, y);
    for (const sp of vp.subpaths) sp.anchors = sp.anchors.map((a) => { const c = at(a.x, a.y), i = at(a.inX, a.inY), o = at(a.outX, a.outY); return { x: c.x, y: c.y, inX: i.x, inY: i.y, outX: o.x, outY: o.y }; });
  }
  if (!vp.subpaths.length) { host.notice('This type layer has no outlines to trace.'); return false; }
  host.paths.select(null);
  host.paths.setWork(vp);
  return true;
}

/** Layer > Type > Convert to Shape: Create Work Path, then a shape layer in the text colour that takes the type layer's
 *  place, the type layer removed. The shape and the removal are one undo step. */
export async function typeToShape(host: TextHost): Promise<boolean> {
  const p = host.current, l = p?.activeLayer, spec = l?.text;
  if (!p || !l || !spec || !liveText(l)) { host.notice('Select a type layer first.'); return false; }
  if (!(await typeToWorkPath(host))) return false;
  const path = structuredClone(host.paths.work as VectorPath), look: ShapeStyle = { fill: { ...spec.color }, stroke: null };
  const r = host.renderShape(path, look);
  if (!r) return false;
  const name = spec.content.replace(/\s+/g, ' ').trim().slice(0, 32) || 'Type Shape', typeId = l.id;
  return host.edit('Convert to Shape', (q) => {
    host.insertRasterLayer(r.raster, name, r.x, r.y, { vector: { path, fill: look.fill, stroke: look.stroke, origin: { x: r.x, y: r.y } } }, 'Convert to Shape');
    q.setLayers(q.doc.layers.filter((x) => x.id !== typeId));
  });
}

/** New text or settings for a type layer, re-rendered in place as one undo step: any scaling of the layer is kept,
 *  and so is its left edge, centre or right edge, by its alignment. */
export async function updateTextLayer(host: TextHost, id: ID, spec: TextSpec, move?: Pt): Promise<void> {
  const p = host.current, patch = p ? await textPatch(host, p, id, spec) : null;
  if (!p || !patch || host.current !== p) return;
  host.textSettings = { ...spec, content: '', rendered: undefined, runs: undefined };
  const t = patch.transform, out = move && t ? { ...patch, transform: { ...t, x: t.x + move.x, y: t.y + move.y } } : patch;
  host.edit('Edit Type', (pp) => { pp.updateLayer(id, out); });
}

/** A look at type layer `id` set to `spec` without an undo step: the layer's pixels, place and spec are swapped for the
 *  preview and put back exactly by `previewTextLayer(host, id, null)`. Hovering a face in a font list uses it. */
let previewing: { p: Project; id: ID; keep: Pick<Layer, 'raster' | 'transform' | 'name' | 'text'>; shown: Partial<Layer> | null } | null = null;
let previewTick = 0;
export async function previewTextLayer(host: TextHost, id: ID, spec: TextSpec | null): Promise<void> {
  const tick = ++previewTick, p = host.current, held = previewing;
  if (held) {
    // Back to the original first, so the new preview is measured against the layer as it was (alignment shifts would add up otherwise).
    held.p.updateLayer(held.id, held.keep);
    if (!spec || held.id !== id || held.p !== p) { previewing = null; if (!spec) return; }
  }
  if (!p || !spec) return;
  const job = textPatch(host, p, id, spec), l = p.layer(id);
  const keep = l ? { raster: l.raster, transform: l.transform, name: l.name, text: l.text } : null;
  if (held?.shown && keep && held.p === p && held.id === id) p.updateLayer(id, held.shown);   // the last preview stays on screen while the next one renders
  const patch = await job;
  if (tick !== previewTick || host.current !== p) return;
  if (!patch || !keep) { if (keep) p.updateLayer(id, keep); previewing = null; return; }
  previewing = { p, id, keep, shown: patch };
  p.updateLayer(id, patch);
}

/** Resize Text Box: paragraph text's box set to `box` with its top left at `to`, the text reflowed, as one undo step. */
export async function resizeTextBox(host: TextHost, id: ID, box: { w: number; h: number }, to: Pt): Promise<boolean> {
  const p = host.current, l = p?.layer(id);
  if (!p || !l?.text || !l.text.box || !liveText(l)) return false;
  const spec: TextSpec = { ...l.text, box: { w: Math.max(8, Math.round(box.w)), h: Math.max(8, Math.round(box.h)) } };
  const patch = await textPatch(host, p, id, spec);
  if (!patch || host.current !== p || !patch.transform) return false;
  host.textSettings = { ...spec, content: '', rendered: undefined, runs: undefined };
  return host.edit('Resize Text Box', (pp) => { pp.updateLayer(id, { ...patch, transform: { ...patch.transform as Layer['transform'], x: to.x, y: to.y } }); });
}

/** The new pixels, place and name of type layer `id` set to `spec`, rendered but not applied, so several layers can
 *  change in one undo step (Find and Replace Text, Update All Text Layers). Null when the layer is not live type. */
export async function textPatch(host: TextHost, p: Project, id: ID, spec: TextSpec, styles: readonly CharacterStyle[] | undefined = p.doc.characterStyles): Promise<Partial<Layer> | null> {
  const l = p.layer(id);
  if (!l || !liveText(l) || !l.raster || !l.text) return null;
  if (!spec.content.trim()) { host.notice('Type some text, or delete the layer.'); return null; }
  // The character style's set fields go over the layer's own for drawing; the stored spec keeps its own fields and the link.
  const effective = withCharStyle(spec, spec.charStyle ? styles?.find((x) => x.id === spec.charStyle) : undefined);
  await loadTextFont(effective);
  if (host.current !== p || !liveText(p.layer(id))) return null;
  const r = renderText(effective), old = l.raster, t = l.transform, before = l.text;
  const nw = r.raster.width * (t.w / old.width), nh = r.raster.height * (t.h / old.height);
  // Vertical type keeps its right edge (its first column); paragraph text its box's corner; point text its alignment.
  const x = spec.box ? t.x : spec.direction === 'vertical' ? t.x + t.w - nw : spec.align === 'center' ? t.x + (t.w - nw) / 2 : spec.align === 'right' ? t.x + t.w - nw : t.x;
  const autoName = before.content.split('\n')[0].trim().slice(0, 40) || 'Type';
  const name = l.name === autoName ? spec.content.split('\n')[0].trim().slice(0, 40) || 'Type' : l.name;
  return { raster: r.raster, transform: { ...t, x, w: nw, h: nh }, name, text: { ...spec, rendered: textKey(r.raster) } };
}

/** Several type layers re-rendered to new specs as one undo step named `step`. Returns how many changed. */
export async function updateTextLayers(host: TextHost, changes: ReadonlyArray<{ id: ID; spec: TextSpec }>, step: string): Promise<number> {
  const p = host.current;
  if (!p) return 0;
  const patches: Array<{ id: ID; patch: Partial<Layer> }> = [];
  for (const c of changes) { const patch = await textPatch(host, p, c.id, c.spec); if (patch) patches.push({ id: c.id, patch }); }
  if (!patches.length || host.current !== p) return 0;
  host.edit(step, (pp) => { for (const x of patches) pp.updateLayer(x.id, x.patch); });
  return patches.length;
}

/** Find and Replace Text: replaces matches in the content of every live type layer (or only the active one) and
 *  returns the number of replacements, all as one undo step. */
export async function replaceText(host: TextHost, find: string, replace: string, opts: { caseSensitive: boolean; wholeWord: boolean; all: boolean }): Promise<number> {
  const p = host.current;
  if (!p || !find) return 0;
  const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(opts.wholeWord ? `\\b${esc}\\b` : esc, opts.caseSensitive ? 'g' : 'gi');
  const layers = opts.all ? p.doc.layers.filter((l) => liveText(l)) : p.activeLayer && liveText(p.activeLayer) ? [p.activeLayer] : [];
  let count = 0;
  const changes: Array<{ id: ID; spec: TextSpec }> = [];
  for (const l of layers) {
    if (!l.text) continue;
    let n = 0;
    const content = l.text.content.replace(re, () => { n++; return replace; });
    if (!n || content === l.text.content) continue;
    count += n;
    changes.push({ id: l.id, spec: { ...l.text, content } });
  }
  return (await updateTextLayers(host, changes, 'Find and Replace Text')) ? count : 0;
}

export interface TextMatch { id: ID; start: number; end: number }
type FindOpts = { caseSensitive: boolean; wholeWord: boolean; all: boolean };

/** Every match of `find` in the live type layers (or the active one), in layer order and then text order. */
function textMatches(host: TextHost, find: string, opts: FindOpts): TextMatch[] {
  const p = host.current, out: TextMatch[] = [];
  if (!p || !find) return out;
  const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp(opts.wholeWord ? `\\b${esc}\\b` : esc, opts.caseSensitive ? 'g' : 'gi');
  const layers = opts.all ? p.doc.layers.filter((l) => liveText(l)) : p.activeLayer && liveText(p.activeLayer) ? [p.activeLayer] : [];
  for (const l of layers) for (const m of (l.text?.content ?? '').matchAll(re)) out.push({ id: l.id, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  return out;
}

/** Find Next / Find Previous: the match after (or before) `from`, wrapping round the document; null when there is none. */
export function findTextMatch(host: TextHost, find: string, opts: FindOpts, from: TextMatch | null, forward: boolean): TextMatch | null {
  const all = textMatches(host, find, opts);
  if (!all.length) return null;
  const p = host.current as Project, order = (id: ID): number => p.doc.layers.findIndex((l) => l.id === id);
  const after = (m: TextMatch): boolean => !from || order(m.id) > order(from.id) || (m.id === from.id && m.start >= from.end);
  const before = (m: TextMatch): boolean => !from || order(m.id) < order(from.id) || (m.id === from.id && m.end <= from.start);
  return forward ? all.find(after) ?? all[0] : [...all].reverse().find(before) ?? all[all.length - 1];
}

/** Change: the one match replaced by `replace`, as one undo step; false when the layer no longer holds it. */
export async function replaceTextMatch(host: TextHost, m: TextMatch, replace: string): Promise<boolean> {
  const l = host.current?.layer(m.id);
  if (!l?.text || !liveText(l)) return false;
  const c = l.text.content, content = c.slice(0, m.start) + replace + c.slice(m.end);
  if (content === c) return false;
  return (await updateTextLayers(host, [{ id: m.id, spec: { ...l.text, content } }], 'Change Text')) > 0;
}

/** Converts the active type layer between point text (no box) and paragraph text (a box around its current size). */
export async function convertTextKind(host: TextHost, to: 'point' | 'paragraph'): Promise<boolean> {
  const p = host.current, l = p?.activeLayer;
  if (!p || !l || !liveText(l) || !l.text || !l.raster) return false;
  if (to === 'point') { if (!l.text.box) return false; await updateTextLayer(host, l.id, { ...l.text, box: null }); return true; }
  if (l.text.box) return false;
  await updateTextLayer(host, l.id, { ...l.text, box: { w: l.raster.width + 4, h: l.raster.height + 4 } });
  return true;
}

/** Re-renders every live type layer with its own spec; returns how many it handled. */
export async function updateAllTextLayers(host: TextHost): Promise<number> {
  const p = host.current;
  if (!p) return 0;
  const changes = p.doc.layers.filter((x) => liveText(x) && !!x.text).map((l) => ({ id: l.id, spec: { ...(l.text as TextSpec) } }));
  return updateTextLayers(host, changes, 'Update All Text Layers');
}

/** The live type layers' id, name, content and font family, for Check Spelling and Resolve Missing Fonts. */
export function textLayerInfo(host: TextHost): Array<{ id: ID; name: string; content: string; family: string }> {
  const p = host.current;
  if (!p) return [];
  const out: Array<{ id: ID; name: string; content: string; family: string }> = [];
  for (const l of p.doc.layers) if (l.text && liveText(l)) out.push({ id: l.id, name: l.name, content: l.text.content, family: l.text.family });
  return out;
}

/** New content for live type layers as one undo step named `step`; returns how many changed. */
export async function setTextContents(host: TextHost, edits: ReadonlyArray<{ id: ID; content: string }>, step: string): Promise<number> {
  const p = host.current;
  if (!p) return 0;
  const changes: Array<{ id: ID; spec: TextSpec }> = [];
  for (const e of edits) {
    const l = p.doc.layers.find((x) => x.id === e.id);
    if (l?.text && liveText(l) && l.text.content !== e.content) changes.push({ id: e.id, spec: { ...l.text, content: e.content } });
  }
  return updateTextLayers(host, changes, step);
}

/** Swaps font families on live type layers (old family to new) as one undo step named `step`; returns how many changed. */
export async function replaceFontFamilies(host: TextHost, map: ReadonlyMap<string, string>, step: string): Promise<number> {
  const p = host.current;
  if (!p) return 0;
  const changes: Array<{ id: ID; spec: TextSpec }> = [];
  for (const l of p.doc.layers) {
    const to = l.text && liveText(l) ? map.get(l.text.family) : undefined;
    if (l.text && to && to !== l.text.family) changes.push({ id: l.id, spec: { ...l.text, family: to } });
  }
  return updateTextLayers(host, changes, step);
}

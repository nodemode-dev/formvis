// Smart object contents and links (DEV_PLAN 36.13): the Engine's smart object render (the padded source through the shown
// filters and the filter mask, a distorted object's warp), Convert to Smart Object and its stack, Stack Mode, New Smart
// Object via Copy, Convert to Layers, Replace Contents, the linked-file methods (place, update, embed, convert to linked),
// the background re-render (restackSoon and restack) and Edit Contents with its write-back, moved out of index.ts. The state
// they share (the renders still running and each contents document's link to its smart object) lives in a SmartObjectStore
// the Engine holds; each function takes a SmartObjectHost, the few Engine members it uses, so this file never imports the
// Engine class. The smart filter stack and filter mask methods stay in smart-ops.ts.
import type { Project } from './project';
import { Raster, createSurface, ctxOf } from './surface';
import { applyMat, invert, mul, placement, setMat } from './geometry';
import { cropWarp, homography, project, visibleBounds, warpRaster, type Warped } from './distort';
import { computeStack, type StackMode } from './stack-modes';
import * as LS from './layer-structure';
import { docTransform, newLayer, uid, type Doc, type ID, type Layer, type Pt, type SmartFilter, type SmartLink, type SmartObject } from './types';
import type { Surface } from './surface';

/** The smart object state the Engine keeps. */
export class SmartObjectStore {
  /** The filters last asked for per smart object while their render is still running, with the render's token. */
  readonly pending = new Map<ID, { token: number; filters: SmartFilter[] }>();
  token = 0;
  /** Each Edit Contents document with the smart object it writes back to. */
  readonly links = new WeakMap<Project, { parent: Project; layerId: ID }>();
}

/** What the smart object methods need of the Engine. `current`, `projects` and the two filter runners are read live. */
export interface SmartObjectHost {
  readonly current: Project | null;
  readonly projects: readonly Project[];
  store: SmartObjectStore;
  /** Runs one smart filter on `src`, supplied by the app, since the filter code lives with the Filter dialog. */
  readonly smartFilterRunner: ((kind: string, settings: Record<string, unknown>, src: ImageData) => ImageData) | null;
  /** How far a smart filter's effect reaches past its input, supplied by the app with the runner. */
  readonly smartFilterMargin: ((kind: string, settings: Record<string, unknown>) => number) | null;
  /** Runs one smart filter off the main thread, supplied by the app with the filter worker. */
  readonly smartFilterRunnerAsync: ((kind: string, settings: Record<string, unknown>, src: ImageData) => Promise<ImageData>) | null;
  notice(text: string): void;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  /** A change made as one undo step in `p`, which need not be the document in view. */
  editOn(p: Project, name: string, fn: () => boolean | void): boolean;
  normalizeClips(layers: Layer[]): Layer[];
  focus(p: Project, id: ID | null): void;
  insertRasterLayer(raster: Raster, name: string, x: number | null, y: number | null, extra?: Partial<Layer>, undoName?: string): void;
  addProject(doc: Doc, name: string, activeId?: ID | null): Project;
  task<T>(fn: () => Promise<T>): Promise<T>;
  settle(): void;
  flattened(): Surface | null;
  emit(what: 'doc' | 'projects' | 'history'): void;
}

/** A smart object's pixels: its source padded by the shown filters' total reach, with each applied in order. */
export function smartMargin(host: SmartObjectHost, filters: SmartFilter[]): number {
  return Math.min(512, Math.ceil(filters.filter((f) => f.enabled).reduce((n, f) => n + (host.smartFilterMargin?.(f.kind, f.settings) ?? 0), 0)));
}

/** A distorted smart object's warp as the layer now sits: a move or transform since its last render carried in. */
export function smartWarpNow(l: Layer): Pt[] | null {
  const sm = l.smart, w = sm?.warp;
  if (!sm || !w || !l.raster) return null;
  const at = sm.warpAt;
  if (!at || JSON.stringify(at) === JSON.stringify(l.transform)) return w;
  const move = mul(placement(l.transform, l.raster.width, l.raster.height), invert(placement(at, l.raster.width, l.raster.height)));
  return w.map((p) => applyMat(move, p.x, p.y));
}

/** The render `r` (the source padded by `margin`) warped so the source's corners land on `warp`, the padding
 *  following the same perspective, cropped to what shows. */
export function warpedSmart(r: Raster, margin: number, source: Raster, warp: Pt[]): Warped | null {
  const H = homography(warp), ex = margin / source.width, ey = margin / source.height;
  const quad = [[-ex, -ey], [1 + ex, -ey], [1 + ex, 1 + ey], [-ex, 1 + ey]].map(([u, v]) => project(H, u, v));
  const full = warpRaster(r, docTransform(r.width, r.height), quad);
  if (!full) return null;
  const crop = visibleBounds(full.raster);
  return crop ? cropWarp(full, crop) : full;
}

/** A smart filter mask applied: where the mask (alpha, source-sized) is clear the unfiltered source shows, where it
 *  is full the filtered render; the padding past the source shows the filters, as Photoshop's mask is white there. */
export function maskFilters(filtered: ImageData, source: Raster, m: number, mask: Raster | null): ImageData {
  if (!mask) return filtered;
  const W = filtered.width, H = filtered.height, plain = createSurface(W, H), pc = ctxOf(plain), mk = createSurface(W, H), mc = ctxOf(mk);
  pc.drawImage(source.canvas, m, m);
  mc.fillStyle = '#ffffff';
  mc.fillRect(0, 0, W, H);
  mc.clearRect(m, m, source.width, source.height);
  mc.drawImage(mask.canvas, m, m, source.width, source.height);
  const u = pc.getImageData(0, 0, W, H).data, a = mc.getImageData(0, 0, W, H).data, f = filtered.data, out = new ImageData(W, H), o = out.data;
  for (let i = 0; i < W * H; i++) { const k = a[i * 4 + 3] / 255; for (let c = 0; c < 4; c++) o[i * 4 + c] = Math.round(u[i * 4 + c] + (f[i * 4 + c] - u[i * 4 + c]) * k); }
  return out;
}

export function renderSmart(host: SmartObjectHost, source: Raster, filters: SmartFilter[], mask: Raster | null = null): Raster {
  const shown = filters.filter((f) => f.enabled);
  const m = smartMargin(host, filters);
  const pad = createSurface(source.width + 2 * m, source.height + 2 * m);
  ctxOf(pad).drawImage(source.canvas, m, m);
  let img = ctxOf(pad).getImageData(0, 0, pad.width, pad.height);
  for (const f of shown) if (host.smartFilterRunner) img = host.smartFilterRunner(f.kind, f.settings, img);
  if (shown.length) img = maskFilters(img, source, m, mask);
  const out = new Raster(img.width, img.height);
  out.write(img);
  return out;
}

/** Layer > Convert to Smart Object: keeps the layer's pixels as the untouched source of a smart object. */
export function convertToSmartObject(host: SmartObjectHost): void {
  const sel = host.current ? host.current.doc.layers.filter((x) => host.current?.selectedIds.has(x.id) && !x.isGroup && !x.adjustment && !x.smart && !!x.raster) : [];
  if (sel.length > 1) { stackToSmartObject(host, sel); return; }
  host.edit('Convert to Smart Object', (p) => {
    const l = p.activeLayer;
    if (!l || l.isGroup || l.adjustment || l.smart || !l.raster) { host.notice('Select a pixel layer to convert.'); return false; }
    p.updateLayer(l.id, { smart: { source: l.raster, filters: [] }, text: null, shape: null, fillContent: null });
  });
}

/** 33.1: several selected pixel layers (bottom first) become one smart object on the top one, keeping their document-size
 *  renders as a stack (mode None, the top one shows); the other layers go. One step. */
export function stackToSmartObject(host: SmartObjectHost, sel: Layer[]): void {
  host.edit('Convert to Smart Object', (p) => {
    const W = p.doc.width, H = p.doc.height, ids = new Set(sel.map((x) => x.id));
    const sources = sel.map((l) => {
      const r = new Raster(W, H), src = l.raster as Raster;
      setMat(r.ctx, placement(l.transform, src.width, src.height));
      r.ctx.drawImage(src.canvas, 0, 0);
      r.ctx.setTransform(1, 0, 0, 1, 0, 0);
      r.touch();
      return r;
    });
    const top = sel[sel.length - 1], shown = sources[sources.length - 1];
    p.updateLayer(top.id, { smart: { source: shown.clone(), filters: [], stack: { sources, mode: 'none' } }, raster: shown.clone(), transform: docTransform(W, H), mask: null, text: null, shape: null, fillContent: null });
    p.setLayers(host.normalizeClips(p.doc.layers.filter((x) => x.id === top.id || !ids.has(x.id))));
    host.focus(p, top.id);
  });
}

/** The active smart object's stack mode, or null when it has no stack. */
export function stackMode(host: SmartObjectHost): StackMode | null { return host.current?.activeLayer?.smart?.stack?.mode ?? null; }

/** Layer > Smart Objects > Stack Mode: recomputes the active smart object's source from its stack and re-renders it
 *  through the filters, one undo step. */
export function setStackMode(host: SmartObjectHost, mode: StackMode): boolean {
  const p = host.current, l = p?.activeLayer, st = l?.smart?.stack;
  if (!p || !l || !st) { host.notice('Select a smart object made from several layers.'); return false; }
  const W = st.sources[0].width, H = st.sources[0].height, out = computeStack(st.sources.map((r) => r.ctx.getImageData(0, 0, W, H)), mode), src = new Raster(W, H);
  src.write(out);
  return restackSoon(host, p, l.id, src, null, 'Stack Mode', null, { stack: { ...st, mode } });
}

/** Layer > Smart Objects > New Smart Object via Copy (1.68.1): the active smart object becomes a second, independent one
 *  above it (its own copy of the source, the filter stack and the filter mask), named "<name> copy": one step. */
export function newSmartObjectViaCopy(host: SmartObjectHost): void {
  host.edit('New Smart Object via Copy', (p) => {
    const l = p.activeLayer;
    if (!l?.smart) { host.notice('Select a smart object to copy.'); return false; }
    const sm = l.smart, own = { ...sm, source: sm.source.clone(), filters: structuredClone(sm.filters), warp: sm.warp ? structuredClone(sm.warp) : sm.warp, warpAt: sm.warpAt ? structuredClone(sm.warpAt) : sm.warpAt, filterMask: sm.filterMask ? sm.filterMask.clone() : sm.filterMask };
    const copy = LS.cloneLayer(l, { name: `${l.name} copy`.slice(0, 255), smart: own, link: undefined });
    const at = p.doc.layers.findIndex((x) => x.id === l.id);
    const next = [...p.doc.layers.slice(0, at + 1), copy, ...p.doc.layers.slice(at + 1)];
    p.setLayers(host.normalizeClips(next));
    host.focus(p, copy.id);
  });
}

/** Layer > Smart Objects > Convert to Layers (1.68.1): the smart object's source, at its current placement (transform and
 *  warp applied, smart filters not), becomes a plain pixel layer keeping name, opacity, blend mode and mask: one step. */
export function smartToLayers(host: SmartObjectHost): void {
  host.edit('Convert to Layers', (p) => {
    const l = p.activeLayer;
    if (!l?.smart || !l.raster) { host.notice('Select a smart object to convert.'); return false; }
    const src = l.smart.source, warp = smartWarpNow(l);
    if (warp) {
      const w = warpedSmart(src, 0, src, warp);
      if (!w) return false;
      const mask = l.mask && !l.mask.placement ? { ...l.mask, placement: l.transform } : l.mask;
      p.updateLayer(l.id, { smart: null, raster: w.raster, transform: w.t, mask });
      return;
    }
    const old = l.raster, t = l.transform, w = (t.w / old.width) * src.width, h = (t.h / old.height) * src.height, cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    let mask = l.mask;
    if (mask?.raster && !mask.placement && (src.width !== old.width || src.height !== old.height)) {
      const nm = Raster.filled(src.width, src.height, '#ffffff');
      nm.ctx.clearRect(0, 0, src.width, src.height);
      nm.ctx.drawImage(mask.raster.canvas, (src.width - old.width) / 2, (src.height - old.height) / 2);
      mask = { ...mask, raster: nm };
    }
    p.updateLayer(l.id, { smart: null, raster: src.clone(), transform: { ...t, x: cx - w / 2, y: cy - h / 2, w, h }, mask });
  });
}

/** Layer > Smart Objects > Replace Contents: a new source for the active smart object, shown at the same scale per
 *  source pixel and about the same centre, its filters and mask re-run, as one step. */
export function replaceContents(host: SmartObjectHost, source: Raster): boolean {
  const p = host.current, l = p?.activeLayer;
  if (!p || !l?.smart) { host.notice('Select a smart object to replace its contents.'); return false; }
  return restackSoon(host, p, l.id, source, null, 'Replace Contents', null, { stack: null });
}

/** File > Place Linked: `raster` as a new smart object, centred, linked to a file through `link`. */
export function placeEmbedded(host: SmartObjectHost, raster: Raster, name: string): void {
  host.insertRasterLayer(raster, name, null, null, { smart: { source: raster, filters: [] } }, 'Place Embedded');
}

export function placeLinked(host: SmartObjectHost, raster: Raster, link: SmartLink, name: string): void {
  host.insertRasterLayer(raster, name, null, null, { smart: { source: raster, filters: [], link } }, 'Place Linked');
}

/** New contents read from a linked file: the smart object `id` re-rendered from `raster` at the same scale and
 *  centre, its link noting what was read, as one step. */
export function updateLinkedContents(host: SmartObjectHost, id: ID, raster: Raster, link: SmartLink, name = 'Update Modified Content'): boolean {
  const p = host.current;
  return !!p && restackSoon(host, p, id, raster, null, name, null, { link });
}

/** Layer > Embed Linked: the smart object keeps its contents and forgets the file. */
export function embedLinked(host: SmartObjectHost): void {
  const p = host.current, l = p?.activeLayer;
  if (p && l?.smart?.link) host.edit('Embed Linked', (q) => q.updateLayer(l.id, { smart: { ...(l.smart as SmartObject), link: null } }));
}

/** Layer > Smart Objects > Convert to Linked: the embedded smart object keeps its contents and takes `link`, one step. */
export function convertToLinked(host: SmartObjectHost, link: SmartLink): boolean {
  const p = host.current, l = p?.activeLayer;
  if (!p || !l?.smart || l.smart.link) return false;
  return host.edit('Convert to Linked', (q) => q.updateLayer(l.id, { smart: { ...(l.smart as SmartObject), link } }));
}

/** The filters a smart object's dialog shows: those last asked for while their render is still running, else its own. */
export function smartFiltersShown(host: SmartObjectHost, id: ID): SmartFilter[] | null {
  const pending = host.store.pending.get(id);
  return pending ? pending.filters : host.current?.layer(id)?.smart?.filters ?? null;
}

/** renderSmart with each filter run in the worker in turn, the interface staying live. */
export async function renderSmartAsync(host: SmartObjectHost, source: Raster, filters: SmartFilter[], mask: Raster | null = null): Promise<Raster> {
  const m = smartMargin(host, filters), pad = createSurface(source.width + 2 * m, source.height + 2 * m);
  ctxOf(pad).drawImage(source.canvas, m, m);
  let img = ctxOf(pad).getImageData(0, 0, pad.width, pad.height);
  for (const f of filters.filter((x) => x.enabled)) {
    img = host.smartFilterRunnerAsync ? await host.smartFilterRunnerAsync(f.kind, f.settings, img) : host.smartFilterRunner ? host.smartFilterRunner(f.kind, f.settings, img) : img;
  }
  if (filters.some((x) => x.enabled)) img = maskFilters(img, source, m, mask);
  const out = new Raster(img.width, img.height);
  out.write(img);
  return out;
}

/** Re-renders a smart object: at once when it is small (up to 2 megapixels) or shows no filter, else in the
 *  background, the result applied as one undo step when it is ready. A later change to the same object supersedes a
 *  render still running, and a render whose source changed meanwhile is dropped. */
export function restackSoon(host: SmartObjectHost, p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, maskChange: { filterMask: Raster | null; filterMaskEnabled: boolean } | null = null, extra: Partial<SmartObject> | null = null): boolean {
  const l = p.layer(id);
  if (!l?.smart) return false;
  const src = source ?? l.smart.source, stack = structuredClone(filters ?? smartFiltersShown(host, id) ?? l.smart.filters);
  const fm = maskChange ?? { filterMask: l.smart.filterMask ?? null, filterMaskEnabled: l.smart.filterMaskEnabled !== false }, active = fm.filterMaskEnabled ? fm.filterMask : null;
  if (!host.smartFilterRunnerAsync || src.width * src.height <= 2_000_000 || !stack.some((f) => f.enabled)) {
    host.store.pending.delete(id);
    return restack(host, p, id, source, stack, name, null, maskChange, extra);
  }
  const token = ++host.store.token;
  host.store.pending.set(id, { token, filters: stack });
  void host.task(async () => {
    const rendered = await renderSmartAsync(host, src, stack, active);
    if (host.store.pending.get(id)?.token !== token) return;
    host.store.pending.delete(id);
    const now = p.layer(id);
    if (!host.projects.includes(p) || !now?.smart || (source === null && now.smart.source !== src)) { host.emit('doc'); return; }
    restack(host, p, id, source, stack, name, rendered, maskChange, extra);
  });
  return true;
}

export function restack(host: SmartObjectHost, p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, rendered: Raster | null = null, maskChange: { filterMask: Raster | null; filterMaskEnabled: boolean } | null = null, extra: Partial<SmartObject> | null = null): boolean {
  return host.editOn(p, name, () => {
    const l = p.layer(id);
    if (!l?.smart) return false;
    const src = source ?? l.smart.source;
    const fm = maskChange ?? { filterMask: l.smart.filterMask ?? null, filterMaskEnabled: l.smart.filterMaskEnabled !== false };
    const stack = structuredClone(filters ?? l.smart.filters), raster = rendered ?? renderSmart(host, src, stack, fm.filterMaskEnabled ? fm.filterMask : null), old = l.raster as Raster, t = l.transform;
    const warp = smartWarpNow(l);
    if (warp) {
      // A distorted smart object warps its fresh render through its kept warp; a mask tied to its pixels is pinned
      // where it is first, since the pixels' bounds change.
      const w = warpedSmart(raster, smartMargin(host, stack), src, warp);
      if (!w) return false;
      const mask = l.mask && !l.mask.placement ? { ...l.mask, placement: l.transform } : l.mask;
      p.updateLayer(id, { smart: { ...l.smart, ...extra, source: src, filters: stack, warp, warpAt: w.t, filterMask: fm.filterMask, filterMaskEnabled: fm.filterMaskEnabled }, raster: w.raster, transform: w.t, mask });
      return;
    }
    // The padding grows or shrinks about the layer's centre, so the source pixels stay exactly where they were.
    const w = (t.w / old.width) * raster.width, h = (t.h / old.height) * raster.height, cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    let mask = l.mask;
    if (mask?.raster && !mask.placement && (raster.width !== old.width || raster.height !== old.height)) {
      const dx = (raster.width - old.width) / 2, dy = (raster.height - old.height) / 2, nm = Raster.filled(raster.width, raster.height, '#ffffff');
      nm.ctx.clearRect(dx, dy, old.width, old.height);
      nm.ctx.drawImage(mask.raster.canvas, dx, dy);
      mask = { ...mask, raster: nm };
    }
    p.updateLayer(id, { smart: { ...l.smart, ...extra, source: src, filters: stack, filterMask: fm.filterMask, filterMaskEnabled: fm.filterMaskEnabled }, raster, transform: { ...t, x: cx - w / 2, y: cy - h / 2, w, h }, mask });
  });
}

/** Layer > Edit Contents: the active smart object's original pixels open as their own document. Saving that document
 *  writes it back into the smart object. */
export function editContents(host: SmartObjectHost): Project | null {
  const p = host.current, l = p?.activeLayer;
  if (!p || !l?.smart) { host.notice('Select a smart object to edit its contents.'); return null; }
  const src = l.smart.source, base: Doc = { id: uid(), width: src.width, height: src.height, resolution: p.doc.resolution, layers: [] };
  const copy = new Raster(src.width, src.height);
  copy.ctx.drawImage(src.canvas, 0, 0);
  const layer = { ...newLayer('Layer 1', base), raster: copy };
  const child = host.addProject({ ...base, layers: [layer] }, `${l.name} contents`, layer.id);
  host.store.links.set(child, { parent: p, layerId: l.id });
  return child;
}

/** True for a document opened by Edit Contents, whether or not its smart object is still open. */
export function isContents(host: SmartObjectHost, p: Project | null): boolean { return !!p && host.store.links.has(p); }

/** The smart object a contents document writes back to, while it is still open; null otherwise. */
export function contentsOf(host: SmartObjectHost, p: Project | null): { parent: Project; layer: Layer } | null {
  const link = p ? host.store.links.get(p) : undefined;
  if (!link || !host.projects.includes(link.parent)) return null;
  const layer = link.parent.layer(link.layerId);
  return layer?.smart ? { parent: link.parent, layer } : null;
}

/** Saving a contents document (the one in view): its flattened pixels become the smart object's new source and the
 *  filters re-run, as one undo step in the smart object's document. A new size keeps the object's scale per pixel. */
export function updateContents(host: SmartObjectHost): boolean {
  const child = host.current;
  if (!child || !host.store.links.has(child)) return false;
  const target = contentsOf(host, child);
  if (!target) { host.notice('The smart object for these contents is no longer open, so they cannot go back into it. Save As keeps them as a project of their own.'); return false; }
  host.settle();
  const flat = host.flattened();
  if (!flat) { host.notice('These contents have nothing visible to put back.'); return false; }
  const ok = restackSoon(host, target.parent, target.layer.id, Raster.from(flat, flat.width, flat.height), null, 'Update Smart Object');
  if (ok) { child.history.markSaved(); host.emit('projects'); host.emit('history'); }
  return ok;
}

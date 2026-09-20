import { compositeOp, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform } from './types';
import { createSurface, ctxOf, rasterOf, sizeSurface, type Ctx2D, type Raster, type Surface } from './surface';
import { IDENTITY, applyMat, invert, matScale, mul, placement, scaling, setMat, type Mat } from './geometry';
import { ancestors, hierarchy } from './tree';
import { adjustmentKernel, type Kernel } from './kernels';
import { grainFromData, grainKernel, hsvFromData, hsvKernel } from './adjust';
import type { Adjustment } from './types';

const kernelCache = new WeakMap<object, Kernel | null>();
function kernelFor(adj: Adjustment | null): Kernel | null {
  if (!adj) return null;
  const hit = kernelCache.get(adj.data);
  if (hit !== undefined) return hit;
  const k = adj.kind === 'hsv' ? hsvKernel(hsvFromData(adj.data)) : adj.kind === 'grain' ? grainKernel(grainFromData(adj.data)) : adjustmentKernel(adj);
  kernelCache.set(adj.data, k);
  return k;
}

/** the reference app's DownsampleCache: an image drawn at under half size is drawn from a copy halved exactly 2x at a time,
 *  so the last reduction left to the canvas is at most 2x; a one-step reduction comes out soft or grainy (in WebKit
 *  especially). Halvings for `factor` output pixels per image pixel: the most that still leave the copy at least
 *  that large, up to 6. Copies are kept per raster and dropped when its version changes, since painting is in place. */
const MAX_HALVINGS = 6;
const halvings = (factor: number): number => (factor > 0 && factor < 0.5 ? Math.min(MAX_HALVINGS, Math.floor(Math.log2(1 / factor))) : 0);
const halvedCache = new WeakMap<Raster, { version: number; levels: Surface[] }>();

function halved(r: Raster, level: number): { surface: Surface; scale: number } {
  let e = halvedCache.get(r);
  if (!e || e.version !== r.version) { e = { version: r.version, levels: [] }; halvedCache.set(r, e); }
  let prev: Surface = r.canvas;
  for (let k = 1; k <= level; k++) {
    let s = e.levels[k - 1];
    if (!s) {
      s = createSurface(Math.max(1, Math.ceil(prev.width / 2)), Math.max(1, Math.ceil(prev.height / 2)));
      const c = ctxOf(s);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, prev.width / 2, prev.height / 2);
      e.levels[k - 1] = s;
    }
    prev = s;
  }
  return { surface: prev, scale: 2 ** level };
}

export interface LayerOverride { source?: Surface; transform?: Transform; maskSource?: Surface; maskPlacement?: Transform; hidden?: boolean; blend?: BlendMode; opacity?: number }
export interface RenderJob {
  doc: Doc;
  target: Surface;
  view: Mat;
  overrides?: ReadonlyMap<ID, LayerOverride>;
  only?: ReadonlySet<ID>;
  quality?: ImageSmoothingQuality;
  background?: string | null;
  ignoreFolderMasks?: boolean;
}
interface Slot { s: Surface; c: Ctx2D }
interface MaskInfo { src: Surface; w: number; h: number; t: Transform; covers: boolean }

export class Renderer {
  private slots: Slot[] = [];
  private clipPool = new Map<ID, Slot>();

  private prepare(slot: Slot, w: number, h: number): Slot {
    sizeSurface(slot.s, w, h);
    const c = slot.c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    return slot;
  }

  private slot(i: number, w: number, h: number): Slot {
    let slot = this.slots[i];
    if (!slot) { const s = createSurface(w, h); slot = { s, c: ctxOf(s) }; this.slots[i] = slot; }
    return this.prepare(slot, w, h);
  }

  render(job: RenderJob): void {
    const W = job.target.width, H = job.target.height;
    const ctx = ctxOf(job.target);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (job.background) { ctx.fillStyle = job.background; ctx.fillRect(0, 0, W, H); }
    const map = new Map(job.doc.layers.map((l) => [l.id, l]));
    const clipCache = new Map<ID, Surface | null>();
    if (this.clipPool.size > 24) this.clipPool.clear();
    for (const entry of hierarchy(job.doc)) {
      const layer = entry.layer;
      if (layer.isGroup || !entry.visible) continue;
      if (job.only && !job.only.has(layer.id)) continue;
      const ov = job.overrides?.get(layer.id);
      if (ov?.hidden) continue;
      const opacity = ov?.opacity ?? layer.opacity;
      if (opacity <= 0) continue;
      const t = ov?.transform ?? layer.transform;
      const folders = job.ignoreFolderMasks ? [] : this.folderMasks(map, layer);
      const own = this.maskOf(layer, ov, t);
      const base = layer.clipId ? map.get(layer.clipId) ?? null : null;
      if (layer.adjustment) { this.adjust(job, ctx, layer, own, folders, base, map, clipCache, W, H, opacity); continue; }
      const src = ov?.source ?? layer.raster?.canvas;
      if (!src || !layer.raster) continue;
      const m = mul(job.view, placement(t, src.width, src.height));
      const op = compositeOp(ov?.blend ?? layer.blend);
      if (!own && !folders.length && !base) { this.draw(ctx, src, m, t.sampling, opacity, op, job.quality); continue; }
      let cov: Surface | null = null;
      if (base) {
        cov = clipCache.has(base.id) ? clipCache.get(base.id) ?? null : this.clipCoverage(job, base, map, W, H, 0);
        clipCache.set(base.id, cov);
        if (!cov) continue;
      }
      const a = this.slot(0, W, H);
      this.draw(a.c, src, m, t.sampling, 1, 'source-over', job.quality);
      if (own) this.cover(a.c, own, job.view, W, H);
      for (const g of folders) this.cover(a.c, g, job.view, W, H);
      if (cov) {
        a.c.globalCompositeOperation = 'destination-in';
        a.c.drawImage(cov, 0, 0);
        a.c.globalCompositeOperation = 'source-over';
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = op;
      ctx.drawImage(a.s, 0, 0);
      ctx.restore();
    }
  }

  private draw(c: Ctx2D, src: CanvasImageSource, m: Mat, sampling: Sampling, alpha: number, op: GlobalCompositeOperation, quality?: ImageSmoothingQuality): void {
    let img = src, mm = m;
    const level = sampling === 'nearest' ? 0 : halvings(matScale(m)), r = level ? rasterOf(src) : undefined;
    if (r) { const h = halved(r, level); img = h.surface; mm = mul(m, scaling(h.scale, h.scale)); }
    c.save();
    setMat(c, mm);
    c.globalAlpha = alpha;
    c.globalCompositeOperation = op;
    c.imageSmoothingEnabled = sampling !== 'nearest';
    if (c.imageSmoothingEnabled) c.imageSmoothingQuality = sampling === 'smooth' ? 'low' : quality ?? 'high';
    c.drawImage(img, 0, 0);
    c.restore();
  }

  private maskOf(layer: Layer, ov: LayerOverride | undefined, t: Transform): MaskInfo | null {
    const m = layer.mask;
    if (!m || !m.enabled) return null;
    const src = ov?.maskSource ?? m.raster?.canvas;
    if (!src || !m.raster) return null;
    const placed = ov?.maskPlacement ?? m.placement;
    return { src, w: src.width, h: src.height, t: placed ?? t, covers: !placed && !layer.adjustment };
  }

  private folderMasks(map: ReadonlyMap<ID, Layer>, layer: Layer): MaskInfo[] {
    const out: MaskInfo[] = [];
    for (const g of ancestors(map, layer)) {
      const m = g.mask;
      if (m?.enabled && m.raster) out.push({ src: m.raster.canvas, w: m.raster.width, h: m.raster.height, t: m.placement ?? g.transform, covers: false });
    }
    return out;
  }

  private cover(c: Ctx2D, mk: MaskInfo, view: Mat, W: number, H: number): void {
    const m = mul(view, placement(mk.t, mk.w, mk.h));
    if (mk.covers) {
      c.save();
      setMat(c, m);
      c.globalCompositeOperation = 'destination-in';
      c.imageSmoothingEnabled = mk.t.sampling !== 'nearest';
      c.drawImage(mk.src, 0, 0);
      c.restore();
      return;
    }
    const b = this.slot(1, W, H);
    b.c.fillStyle = '#ffffff';
    b.c.fillRect(0, 0, W, H);
    setMat(b.c, m);
    b.c.globalCompositeOperation = 'destination-out';
    b.c.fillRect(0, 0, mk.w, mk.h);
    b.c.globalCompositeOperation = 'source-over';
    b.c.imageSmoothingEnabled = mk.t.sampling !== 'nearest';
    b.c.drawImage(mk.src, 0, 0);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(b.s, 0, 0);
    c.restore();
  }

  /** The coverage a clip base lends the layers clipped to it, at document size and in document space, copied out of
   *  the pool: what each of those live masks shows through. Deleting the base can bake it into their pixels. */
  clipCoverageOf(doc: Doc, baseId: ID): Surface | null {
    const base = doc.layers.find((l) => l.id === baseId);
    if (!base) return null;
    const map = new Map(doc.layers.map((l) => [l.id, l]));
    const cov = this.clipCoverage({ doc, target: createSurface(1, 1), view: IDENTITY, quality: 'high' }, base, map, doc.width, doc.height, 0);
    if (!cov) return null;
    const out = createSurface(doc.width, doc.height);
    ctxOf(out).drawImage(cov, 0, 0);
    return out;
  }

  private clipCoverage(job: RenderJob, base: Layer, map: ReadonlyMap<ID, Layer>, W: number, H: number, depth: number): Surface | null {
    if (depth > 256 || base.isGroup || !base.raster) return null;
    const ov = job.overrides?.get(base.id);
    const src = ov?.source ?? base.raster.canvas;
    const t = ov?.transform ?? base.transform;
    let slot = this.clipPool.get(base.id);
    if (!slot) { const s = createSurface(W, H); slot = { s, c: ctxOf(s) }; this.clipPool.set(base.id, slot); }
    this.prepare(slot, W, H);
    this.draw(slot.c, src, mul(job.view, placement(t, base.raster.width, base.raster.height)), t.sampling, ov?.opacity ?? base.opacity, 'source-over', job.quality);
    const own = this.maskOf(base, ov, t);
    if (own) this.cover(slot.c, own, job.view, W, H);
    if (base.clipId) {
      const up = map.get(base.clipId);
      const cov = up ? this.clipCoverage(job, up, map, W, H, depth + 1) : null;
      if (!cov) return null;
      slot.c.globalCompositeOperation = 'destination-in';
      slot.c.drawImage(cov, 0, 0);
      slot.c.globalCompositeOperation = 'source-over';
    }
    return slot.s;
  }

  private adjust(job: RenderJob, ctx: Ctx2D, layer: Layer, own: MaskInfo | null, folders: MaskInfo[], base: Layer | null, map: ReadonlyMap<ID, Layer>, clipCache: Map<ID, Surface | null>, W: number, H: number, opacity: number): void {
    const kernel = kernelFor(layer.adjustment);
    if (!kernel) return;
    const img = ctx.getImageData(0, 0, W, H);
    const src = img.data;
    const adj = new Uint8ClampedArray(src);
    const origin = applyMat(invert(job.view), 0, 0);
    kernel(adj, { width: W, height: H, originX: origin.x, originY: origin.y, unitsPerPixel: 1 / matScale(job.view) });
    let cov: Uint8ClampedArray | null = null;
    if (own || folders.length || base) {
      const b = this.slot(2, W, H);
      b.c.fillStyle = '#ffffff';
      b.c.fillRect(0, 0, W, H);
      if (own) this.cover(b.c, own, job.view, W, H);
      for (const g of folders) this.cover(b.c, g, job.view, W, H);
      if (base) {
        const clip = clipCache.has(base.id) ? clipCache.get(base.id) ?? null : this.clipCoverage(job, base, map, W, H, 0);
        clipCache.set(base.id, clip);
        if (!clip) return;
        b.c.globalCompositeOperation = 'destination-in';
        b.c.drawImage(clip, 0, 0);
        b.c.globalCompositeOperation = 'source-over';
      }
      cov = b.c.getImageData(0, 0, W, H).data;
    }
    for (let i = 0; i < src.length; i += 4) {
      const k = (cov ? cov[i + 3] / 255 : 1) * opacity;
      if (k <= 0 || !src[i + 3]) continue;
      src[i] += (adj[i] - src[i]) * k;
      src[i + 1] += (adj[i + 1] - src[i + 1]) * k;
      src[i + 2] += (adj[i + 2] - src[i + 2]) * k;
    }
    ctx.putImageData(img, 0, 0);
  }
}

export function renderDoc(renderer: Renderer, doc: Doc, background: string | null = null): Surface {
  const s = createSurface(doc.width, doc.height);
  renderer.render({ doc, target: s, view: IDENTITY, background, quality: 'high' });
  return s;
}

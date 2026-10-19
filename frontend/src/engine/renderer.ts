import { resizeMask } from './filters';
import { blendPixels } from './blend';
import { patternById } from './patterns';
import { CONTOURS, applyContour, contourLut, withGlobalLight, type ContourId } from './style-extras';
import { canvasBlend, compositeOp, instances, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform, effectsActive, type LayerEffects, type RGB, type Rect, type BlendIf, blendIfActive, type BevelContour, type BevelTexture, type Pt } from './types';
import { distanceSquared } from './matting';
import { createSurface, ctxOf, rasterOf, sizeSurface, type Ctx2D, type Raster, type Surface } from './surface';
import { translation, IDENTITY, applyMat, invert, matScale, mul, placement, scaling, setMat, boundsOf, integral, intersectRect, sameTransform, type Mat } from './geometry';
import { ancestors, descendantIds, groupIsolated, hierarchy } from './tree';
import { boxChange, vectorCoverage } from './vector-mask';
import { shapedMask } from './layer-masks';
import { adjustmentKernel, type Kernel } from './kernels';
import { grainFromData, grainKernel, hsvFromData, hsvKernel } from './adjust';
import type { Adjustment } from './types';

const kernelCache = new WeakMap<object, Kernel | null>();
export function kernelFor(adj: Adjustment | null): Kernel | null {
  if (!adj) return null;
  const hit = kernelCache.get(adj.data);
  if (hit !== undefined) return hit;
  const made = adj.kind === 'hsv' ? hsvKernel(hsvFromData(adj.data)) : adj.kind === 'grain' ? grainKernel(grainFromData(adj.data)) : adjustmentKernel(adj);
  kernelCache.set(adj.data, made);
  return made;
}

/** An image drawn at under half size goes through copies that are each halved exactly twice over (one step of 2x at a
 *  time), so the canvas never reduces by more than 2x in a single step; one big step comes out soft or grainy,
 *  in WebKit especially. Copies are cached per raster and dropped when its `version` changes. */
const halfCache = new WeakMap<Raster, { version: number; levels: Map<number, Surface> }>();
/** How many halvings suit an output of `factor` pixels per image pixel: as many as still leave the copy at least that
 *  large, at most 6, and none at half size or more. */
function halvingsFor(factor: number): number {
  if (!(factor > 0) || factor >= 0.5) return 0;
  let n = 1;
  while (n < 6 && 1 / 2 ** (n + 1) >= factor) n++;
  return n;
}

/** The raster's canvas halved `level` times, each step drawn from the one before; `scale` says how much smaller it is. */
function halved(r: Raster, level: number): { surface: Surface; scale: number } {
  const scale = 2 ** level;
  if (level <= 0) return { surface: r.canvas, scale: 1 };
  let entry = halfCache.get(r);
  if (!entry || entry.version !== r.version) {
    entry = { version: r.version, levels: new Map() };
    halfCache.set(r, entry);
  }
  let surface = entry.levels.get(level);
  if (!surface) {
    const prev = halved(r, level - 1).surface;
    surface = createSurface(Math.max(1, Math.ceil(prev.width / 2)), Math.max(1, Math.ceil(prev.height / 2)));
    const c = ctxOf(surface);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(prev, 0, 0, surface.width, surface.height);
    entry.levels.set(level, surface);
  }
  return { surface, scale };
}

export interface LayerOverride { source?: Surface; transform?: Transform; maskSource?: Surface; maskPlacement?: Transform; hidden?: boolean; blend?: BlendMode; opacity?: number; effects?: LayerEffects | null; patch?: LayerPatch }
/** A windowed stroke's pixels (1.60.6, DEV_PLAN 26.2): the layer as it will be over the window from (x, y), in layer
 *  pixels; outside it the layer's own stand. */
export interface LayerPatch { surface: Surface; x: number; y: number }
export interface RenderJob {
  doc: Doc;
  target: Surface;
  view: Mat;
  overrides?: ReadonlyMap<ID, LayerOverride>;
  only?: ReadonlySet<ID>;
  quality?: ImageSmoothingQuality;
  background?: string | null;
  ignoreFolderMasks?: boolean;
  /** Folders being drawn on their own surface by an enclosing render; they are not isolated again inside it. */
  handled?: ReadonlySet<ID>;
}
/** A scratch canvas and its drawing context. */
interface Slot { s: Surface; c: Ctx2D }
/** `k`: the resolution the part was computed at, 1 for full; a smaller part is drawn scaled back up to its place. */
interface FxPart { s: Surface; x: number; y: number; k: number; alpha: number; op: GlobalCompositeOperation; above: boolean; name: string; kept: boolean }
interface MaskInfo { src: Surface; w: number; h: number; t: Transform; covers: boolean; mat?: Mat }

let white: Surface | null = null;
/** One opaque white pixel, made once. */
function whitePixel(): Surface {
  if (!white) { white = createSurface(1, 1); const c = ctxOf(white); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1, 1); }
  return white;
}

/** Three box blurs of radius `r` over one channel, `w` by `h`, approximating a Gaussian; edges clamp. */
function blur1(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const n = w * h;
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
}

/** A part kept to the silhouette with the silhouette's alpha taken back out, for a layer clipped to it to put back. */
function unkeep(s: Surface, sil: Uint8ClampedArray): void {
  const c = ctxOf(s), img = c.getImageData(0, 0, s.width, s.height), d = img.data;
  for (let i = 3; i < d.length; i += 4) { const a = sil[i]; d[i] = a ? Math.min(255, Math.round((d[i] * 255) / a)) : 0; }
  c.putImageData(img, 0, 0);
}

/** Bevel & Emboss's Chisel Hard height (1.65.2), from each pixel's signed distance to the silhouette's edge (where
 *  coverage crosses a half; positive inside): an inner or stroke bevel climbs from 0 at the edge to 1 at `size`
 *  inside, an outer one falls from 1 at the edge to 0 at `size` outside, and the embosses cross 0.5 at the edge,
 *  reaching 0 and 1 half the size out and in. */
function chiselHeight(A: Float32Array, w: number, h: number, bv: LayerEffects['bevel'], size: number): Float32Array {
  const n = w * h, inside = new Uint8Array(n), outside = new Uint8Array(n), H = new Float32Array(n);
  for (let i = 0; i < n; i++) { inside[i] = A[i] >= 0.5 ? 1 : 0; outside[i] = 1 - inside[i]; }
  const toOutside = distanceSquared(outside, w, h), toInside = distanceSquared(inside, w, h);
  const base = bv.style === 'outer' ? 1 : bv.style === 'emboss' || bv.style === 'pillow' ? 0.5 : 0;
  for (let i = 0; i < n; i++) {
    const d = inside[i] ? Math.sqrt(toOutside[i]) - 0.5 : 0.5 - Math.sqrt(toInside[i]);
    H[i] = Math.min(1, Math.max(0, base + d / size));
  }
  return H;
}

/** Bevel & Emboss's Contour (1.65.2), in place: the height read through the curve, the curve spread over its range
 *  of the height and flat past it. For a smooth bevel `half` names the side of the edge (where the height crosses
 *  0.5) that is seen: that half carries the whole curve, and the other half keeps its slope, shifted to meet it. */
function contourHeight(H: Float32Array, c: BevelContour, half: 'inner' | 'outer' | null): void {
  const curve = CONTOURS.find((x) => x.id === c.id)?.f ?? ((t: number) => t), span = Math.min(1, Math.max(0.01, c.range));
  const shape = (t: number): number => curve(Math.min(1, Math.max(0, t) / span));
  if (!half) { for (let i = 0; i < H.length; i++) H[i] = shape(H[i]); return; }
  const meet = half === 'inner' ? 0.5 * shape(0) : 0.5 * shape(1);
  for (let i = 0; i < H.length; i++) {
    const v = H[i];
    if (half === 'inner') H[i] = v >= 0.5 ? 0.5 + 0.5 * shape(2 * v - 1) : v + meet;
    else H[i] = v <= 0.5 ? 0.5 * shape(2 * v) : v - 0.5 + meet;
  }
}

/** Bevel & Emboss's Texture (1.65.2): the pattern's tone (its luma times its alpha, or the reverse when inverted),
 *  tiled from `origin` at its scale, raised into the height by its depth over the bevel's size. */
function textureHeight(H: Float32Array, w: number, h: number, t: BevelTexture, size: number, scale: number, origin: Pt): void {
  const pat = patternById(t.pattern);
  if (!pat) return;
  const pw = pat.surface.width, ph = pat.surface.height, px = ctxOf(pat.surface).getImageData(0, 0, pw, ph).data, tone = new Float32Array(pw * ph);
  for (let i = 0; i < tone.length; i++) {
    const l = ((0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255) * (px[i * 4 + 3] / 255);
    tone[i] = t.invert ? 1 - l : l;
  }
  const cell = Math.max(1e-3, t.scale * scale), lift = t.depth / size, wrap = (v: number, n: number): number => ((v % n) + n) % n;
  for (let y = 0; y < h; y++) {
    const row = wrap(Math.floor((y - origin.y) / cell), ph) * pw;
    for (let x = 0; x < w; x++) H[y * w + x] += lift * tone[row + wrap(Math.floor((x - origin.x) / cell), pw)];
  }
}

export class Renderer {
  private readonly slots: Slot[] = [];
  private readonly fxCache = new Map<ID, { key: string; parts: FxPart[] }>();
  /** While a style is being previewed, effects over large regions are computed at reduced resolution (about 1.5
   *  megapixels) and drawn scaled up, so dragging a slider stays quick; the style applied is computed in full. */
  fastEffects = false;
  private readonly clipPool = new Map<ID, Slot>();

  /** Resizes a scratch slot, puts its context back to a plain state and clears it. */
  private prepare(slot: Slot, w: number, h: number): Slot {
    sizeSurface(slot.s, w, h);
    slot.c.setTransform(1, 0, 0, 1, 0, 0);
    slot.c.globalAlpha = 1;
    slot.c.globalCompositeOperation = 'source-over';
    slot.c.clearRect(0, 0, w, h);
    return slot;
  }

  /** The i-th scratch slot, created on first use, cleared at the given size. */
  private slot(i: number, w: number, h: number): Slot {
    let found: Slot | undefined = this.slots[i];
    if (!found) { const s = createSurface(w, h); found = this.slots[i] = { s, c: ctxOf(s) }; }
    return this.prepare(found, w, h);
  }

  render(job: RenderJob): void {
    const ctx = ctxOf(job.target), W = job.target.width, H = job.target.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (job.background) { ctx.fillStyle = job.background; ctx.fillRect(0, 0, W, H); }
    const entries = hierarchy(job.doc);
    const map = new Map<ID, Layer>();
    for (const e of entries) map.set(e.layer.id, e.layer);
    const clipCache = new Map<ID, Surface | null>();
    if (this.clipPool.size > 24) this.clipPool.clear();
    const backed = new Set<ID>(), isoDone = new Set<ID>();
    // An artboard's background, once, in document space, just below whatever it holds.
    const backdrop = (a: Layer): void => {
      if (backed.has(a.id) || !a.artboard || job.handled) return;
      backed.add(a.id);
      const bg = a.artboard.background;
      if (!bg || (job.only && !job.only.has(a.id))) return;
      ctx.save();
      setMat(ctx, job.view);
      ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
      ctx.fillRect(a.artboard.x, a.artboard.y, a.artboard.w, a.artboard.h);
      ctx.restore();
    };
    for (const entry of entries) {
      const layer = entry.layer;
      if (layer.isGroup) { if (entry.visible && layer.artboard) backdrop(layer); continue; }
      if (!entry.visible) continue;
      for (const g of ancestors(map, layer)) if (g.artboard) backdrop(g);
      if (job.only && !job.only.has(layer.id)) continue;
      // A layer in an isolated folder: the folder's layers are composited on their own and blended in, once, at the first.
      const iso = ancestors(map, layer).reverse().find((g) => groupIsolated(g) && !job.handled?.has(g.id));
      if (iso) {
        if (!isoDone.has(iso.id)) { isoDone.add(iso.id); this.isolatedFolder(job, ctx, iso, W, H); }
        continue;
      }
      const ov = job.overrides?.get(layer.id);
      if (ov?.hidden) continue;
      const opacity = ov?.opacity ?? layer.opacity;
      if (!(opacity > 0)) continue;
      // Fill: the pixels at opacity times fill; the effects (drawn from the layer's silhouette) at the opacity.
      const pix = opacity * (layer.fill ?? 1);
      const t = ov?.transform ?? layer.transform;
      const vm = this.vectorOf(layer, job.doc, t), folders = [...(job.ignoreFolderMasks ? [] : this.folderMasks(map, layer, job.doc)), ...(vm ? [vm] : [])];
      const own = this.maskOf(layer, ov, t);
      const base = layer.clipId ? map.get(layer.clipId) ?? null : null;
      if (layer.adjustment) { this.adjust(job, ctx, layer, own, folders, base, map, clipCache, W, H, pix, ov?.blend ?? layer.blend); continue; }
      if (layer.tiled && !layer.raster) {
        // A layer past one canvas's 2^28 pixels (1.62.3, DEV_PLAN 26.6b): its tiles drawn at its opacity, in its mode
        // when the canvas has it (Normal otherwise for now); its masks, clipping, styles, Blend If and knockout come in
        // later stages of 26.6.
        const mode = ov?.blend ?? layer.blend;
        ctx.save();
        ctx.globalAlpha = pix;
        ctx.globalCompositeOperation = canvasBlend(mode) ? compositeOp(mode) : 'source-over';
        ctx.imageSmoothingEnabled = true;
        if (job.quality) ctx.imageSmoothingQuality = job.quality;
        const tm = mul(job.view, placement(t, layer.tiled.width, layer.tiled.height));
        if (ov?.patch) {   // a stroke in progress (1.62.5): the tiles into a slot, its window patched in, as an ordinary layer's
          const a = this.slot(0, W, H);
          layer.tiled.drawTo(a.c, tm as unknown as [number, number, number, number, number, number]);
          this.patchIn(a.c, ov.patch, tm, t.sampling, 1, job.quality);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(a.s, 0, 0);
        } else layer.tiled.drawTo(ctx, tm as unknown as [number, number, number, number, number, number]);
        ctx.restore();
        continue;
      }
      const src = ov?.source ?? layer.raster?.canvas;
      if (!src || !layer.raster) continue;
      const m = mul(job.view, placement(t, src.width, src.height));
      const mode = ov?.blend ?? layer.blend, op = compositeOp(mode), pixelBlend = !canvasBlend(mode);
      const fx0 = ov && 'effects' in ov ? ov.effects ?? null : layer.effects ?? null, fx = fx0 ? withGlobalLight(fx0, job.doc.globalLight) : null, styled = effectsActive(fx);
      // A styled layer's effects come from the per-layer cache at document resolution when they can, so any view and
      // any repainted region shows them whole; strokes and transforms in progress, clipping and folder masks are
      // drawn per render instead.
      const parts = styled && !base && !folders.length && !ov?.source && !ov?.patch && !ov?.maskSource && !ov?.transform ? this.effectParts(layer, fx as LayerEffects, src, t, own, ov?.maskPlacement ?? null, job.doc.width, job.doc.height) : null;
      if (parts) this.drawParts(ctx, parts, job.view, opacity, false);
      const blendIf = blendIfActive(layer.blendIf) ? layer.blendIf as BlendIf : null, knock = layer.knockout && layer.knockout !== 'none' ? layer.knockout : null;
      const chans = layer.blendChannels && layer.blendChannels.some((on) => !on) ? layer.blendChannels : null;
      if (!own && !folders.length && !base && !pixelBlend && (!styled || parts) && !blendIf && !knock && !chans && !ov?.patch) {
        this.draw(ctx, src, m, t.sampling, pix, op, job.quality);
        if (parts) this.drawParts(ctx, parts, job.view, opacity, true);
        continue;
      }
      let cov: Surface | null = null;
      if (base) {
        if (clipCache.has(base.id)) cov = clipCache.get(base.id) ?? null;
        else { cov = this.clipCoverage(job, base, map, W, H, 0); clipCache.set(base.id, cov); }
        if (!cov) continue;
      }
      const a = this.slot(0, W, H);
      this.draw(a.c, src, m, t.sampling, 1, 'source-over', job.quality);
      if (ov?.patch) this.patchIn(a.c, ov.patch, m, t.sampling, 1, job.quality);   // a windowed stroke (1.60.6)
      if (own) this.cover(a.c, own, job.view, W, H);
      for (const f of folders) this.cover(a.c, f, job.view, W, H);
      if (cov) {
        a.c.save();
        a.c.setTransform(1, 0, 0, 1, 0, 0);
        a.c.globalCompositeOperation = 'destination-in';
        a.c.drawImage(cov, 0, 0);
        a.c.restore();
      }
      if (blendIf) this.blendIf(a, ctx, blendIf, W, H);
      if (knock) this.knockout(job, ctx, a, layer, map, W, H, opacity);
      const placed = styled && !parts ? boundsOf([applyMat(m, 0, 0), applyMat(m, src.width, 0), applyMat(m, src.width, src.height), applyMat(m, 0, src.height)]) : null;
      if (placed) this.effects(this.drawer(ctx), a, fx as LayerEffects, matScale(job.view), opacity, W, H, placed, 'below');
      const below = chans ? ctx.getImageData(0, 0, W, H) : null;
      if (pixelBlend) this.pixelBlend(ctx, a, mode, pix, m, src, job.view, W, H);
      else {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = pix;
        ctx.globalCompositeOperation = op;
        ctx.drawImage(a.s, 0, 0);
        ctx.restore();
      }
      if (below && chans) {
        const now = ctx.getImageData(0, 0, W, H), n = now.data, u = below.data;
        for (let i = 0; i < n.length; i += 4) for (let c = 0; c < 3; c++) if (!chans[c]) n[i + c] = u[i + c];
        ctx.putImageData(now, 0, 0);
      }
      if (placed) this.effects(this.drawer(ctx), a, fx as LayerEffects, matScale(job.view), opacity, W, H, placed, 'above');
      if (parts) this.drawParts(ctx, parts, job.view, opacity, true);
    }
  }

  /** A layer in a mode the canvas lacks: its prepared slot is blended onto the target per pixel, within its placed
   *  bounds only. */
  private pixelBlend(ctx: Ctx2D, a: Slot, mode: BlendMode, opacity: number, m: Mat, src: Surface, view: Mat, W: number, H: number): void {
    const box = intersectRect(integral(boundsOf([applyMat(m, 0, 0), applyMat(m, src.width, 0), applyMat(m, src.width, src.height), applyMat(m, 0, src.height)])), { x: 0, y: 0, w: W, h: H });
    if (!box) return;
    const dst = ctx.getImageData(box.x, box.y, box.w, box.h), top = a.c.getImageData(box.x, box.y, box.w, box.h), inv = invert(view);
    blendPixels(dst.data, top.data, mode, opacity, (i) => { const p = applyMat(inv, box.x + (i % box.w) + 0.5, box.y + Math.floor(i / box.w) + 0.5); return [Math.floor(p.x), Math.floor(p.y)]; });
    ctx.putImageData(dst, box.x, box.y);
  }

  /** An isolated folder (opacity below full or a blend mode of its own, or a Normal PSD group): its layers rendered
   *  together on a clear surface, which is then drawn onto `ctx` at the folder's opacity and in its mode. */
  private isolatedFolder(job: RenderJob, ctx: Ctx2D, g: Layer, W: number, H: number): void {
    const ov = job.overrides?.get(g.id), opacity = ov?.opacity ?? g.opacity, mode = ov?.blend ?? g.blend;
    if (ov?.hidden || !(opacity > 0)) return;
    const handled = new Set<ID>(job.handled ?? []);
    const into = this.slot(20 + handled.size, W, H);
    handled.add(g.id);
    const inside = descendantIds(job.doc.layers, g.id), only = new Set<ID>(job.only ? inside.filter((id) => job.only?.has(id)) : inside);
    this.render({ ...job, target: into.s, only, background: null, handled });
    if (canvasBlend(mode)) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = compositeOp(mode);
      ctx.drawImage(into.s, 0, 0);
      ctx.restore();
    } else this.pixelBlend(ctx, into, mode, opacity, IDENTITY, into.s, job.view, W, H);
  }

  /** Draws effect parts straight onto `ctx` at their target position. */
  private drawer(ctx: Ctx2D): (s: Surface, box: Rect, alpha: number, op: GlobalCompositeOperation) => void {
    return (s, box, alpha, op) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = op;
      ctx.drawImage(s, 0, 0, box.w, box.h, box.x, box.y, box.w, box.h);
      ctx.restore();
    };
  }

  /** A styled layer's effects at document resolution, each part kept with its place, blend and opacity, cached per
   *  layer until its pixels, transform, mask or effects change. */
  private effectParts(layer: Layer, fx: LayerEffects, src: Surface, t: Transform, own: MaskInfo | null, maskPlacement: Transform | null, docW: number, docH: number, exact = false): FxPart[] {
    const r = layer.raster, mk = layer.mask, fast = this.fastEffects && !exact;
    const key = JSON.stringify([r?.id ?? null, r?.version ?? 0, t, mk ? [mk.raster?.id ?? null, mk.raster?.version ?? 0, mk.enabled, maskPlacement ?? mk.placement, mk.density ?? 100, mk.feather ?? 0] : null, fx, docW, docH, fast]);
    const hit = exact ? undefined : this.fxCache.get(layer.id);
    if (hit && hit.key === key) return hit.parts;
    const d = fx.dropShadow, g = fx.outerGlow, k = fx.stroke, is = fx.innerShadow, ig = fx.innerGlow;
    const reach = fxReach(fx) + 4;
    const lm = placement(t, src.width, src.height);
    const placed = boundsOf([applyMat(lm, 0, 0), applyMat(lm, src.width, 0), applyMat(lm, src.width, src.height), applyMat(lm, 0, src.height)]);
    const region = intersectRect(integral({ x: placed.x - reach, y: placed.y - reach, w: placed.w + 2 * reach, h: placed.h + 2 * reach }), { x: 0, y: 0, w: docW, h: docH });
    const parts: FxPart[] = [];
    if (region) {
      const k = fast && region.w * region.h > 1_500_000 ? Math.sqrt(1_500_000 / (region.w * region.h)) : 1;
      const rw = Math.max(1, Math.ceil(region.w * k)), rh = Math.max(1, Math.ceil(region.h * k));
      const view = mul([k, 0, 0, k, 0, 0], translation(-region.x, -region.y)), sil = this.slot(8, rw, rh);
      sil.c.save();
      sil.c.setTransform(1, 0, 0, 1, 0, 0);
      sil.c.clearRect(0, 0, rw, rh);
      sil.c.restore();
      this.draw(sil.c, src, mul(view, lm), t.sampling, 1, 'source-over', 'high');
      if (own) this.cover(sil.c, own, view, rw, rh);
      const local = { x: (placed.x - region.x) * k, y: (placed.y - region.y) * k, w: placed.w * k, h: placed.h * k };
      for (const phase of ['below', 'above'] as const) {
        this.effects((s, box, alpha, op, name, kept) => {
          const copy = createSurface(box.w, box.h);
          ctxOf(copy).drawImage(s, 0, 0, box.w, box.h, 0, 0, box.w, box.h);
          if (exact && kept) unkeep(copy, sil.c.getImageData(box.x, box.y, box.w, box.h).data);
          parts.push({ s: copy, x: region.x + box.x / k, y: region.y + box.y / k, k, alpha, op, above: phase === 'above', name, kept });
        }, sil, fx, k, 1, rw, rh, local, phase);
      }
    }
    if (exact) return parts;
    if (this.fxCache.size > 64) this.fxCache.clear();
    this.fxCache.set(layer.id, { key, parts });
    return parts;
  }

  /** A layer's effects as named pictures at document resolution, below or above it (Layer Style > Create Layers, 1.65.2). */
  effectLayers(layer: Layer, doc: Doc): FxPart[] {
    const fx = layer.effects ? withGlobalLight(layer.effects, doc.globalLight) : null;
    if (!effectsActive(fx) || !layer.raster) return [];
    return this.effectParts(layer, fx, layer.raster.canvas, layer.transform, this.maskOf(layer, undefined, layer.transform), null, doc.width, doc.height, true);
  }

  /** Cached effect parts through the view, below or above the layer, each at its own blend times the layer's opacity. */
  /** The GPU display's view of a layer's styles (Phase 18): the same cached effect parts this renderer draws, as images
   *  at document coordinates with their alpha and blend mode, below or above the layer; [] for no active styles; null
   *  where the renderer itself would draw the effects per render instead of from the cache (a live stroke, mask edit or
   *  transform; clipped layers and folder masks are refused by the caller). */
  gpuEffectParts(layer: Layer, ov: LayerOverride | undefined, doc: Doc): { image: Surface; matrix: Mat; alpha: number; blend: BlendMode; above: boolean }[] | null {
    const fx0 = ov && 'effects' in ov ? ov.effects ?? null : layer.effects ?? null, fx = fx0 ? withGlobalLight(fx0, doc.globalLight) : null;
    if (!effectsActive(fx)) return [];
    if (ov?.source || ov?.patch || ov?.maskSource || ov?.transform || !layer.raster) return null;
    const t = layer.transform, src = layer.raster.canvas;
    const parts = this.effectParts(layer, fx as LayerEffects, src, t, this.maskOf(layer, ov, t), ov?.maskPlacement ?? null, doc.width, doc.height);
    return parts.map((p) => ({ image: p.s, matrix: [1 / p.k, 0, 0, 1 / p.k, p.x, p.y] as Mat, alpha: p.alpha, blend: p.op === 'source-over' ? 'normal' : p.op as BlendMode, above: p.above }));
  }

  private drawParts(ctx: Ctx2D, parts: FxPart[], view: Mat, opacity: number, above: boolean): void {
    for (const p of parts) {
      if (p.above !== above) continue;
      ctx.save();
      setMat(ctx, mul(view, translation(p.x, p.y)));
      ctx.globalAlpha = p.alpha * opacity;
      ctx.globalCompositeOperation = p.op;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(p.s, 0, 0, p.s.width / p.k, p.s.height / p.k);
      ctx.restore();
    }
  }

  /** Layer styles beneath a layer, from `sil`, its visible pixels in target space, with document sizes scaled by
   *  `scale`. The work stays inside the layer's placed `bounds` grown by the effects' reach, so a small layer costs
   *  little on a large canvas. The drop shadow and outer glow use the canvas shadow API with the silhouette drawn far
   *  off the surface, so only its shadow lands; blurs over 8 px run at half resolution and are scaled back, which looks
   *  the same for a quarter of the work. The outside stroke is the silhouette grown by a Euclidean distance transform,
   *  round at the corners and as quick at 50 px as at 1, less the silhouette itself. */
  /** Bevel and Emboss's highlight and shadow for coverage `A` (`w` by `h`, the silhouette or a stroke's ring): the shape
   *  softened by three box blurs approximating a Gaussian of half the size is the height map (Smooth; the chisels slope
   *  evenly by distance), then its Contour and Texture; each pixel's normal comes from its
   *  slopes, steepened by depth, and its lighting from the angle and altitude, flat ground scoring zero. Highlight and
   *  shadow are kept inside, outside or on both sides of the edge by style, then softened. */
  /** An effect's rendered coverage passed through its contour, in place; Linear leaves the surface as it is. The
   *  shadows and glows here come from canvas shadows, whose coverage at the silhouette's edge is about a half, while a
   *  contour's input runs from full at the edge to nothing at the effect's reach, so coverage is doubled (capped at
   *  full) before the curve. */
  private contoured(s: Surface, w: number, h: number, id: ContourId | undefined): Surface {
    const lut = contourLut(id);
    if (!lut) return s;
    const c = ctxOf(s), img = c.getImageData(0, 0, w, h), d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = lut[Math.min(255, d[i] * 2)];
    c.putImageData(img, 0, 0);
    return s;
  }

  private bevelMaps(A: Float32Array, w: number, h: number, bv: LayerEffects['bevel'], scale: number, origin: Pt): [ImageData, ImageData] {
    const n = w * h;
    const blur = (src: Float32Array, r: number): Float32Array => blur1(src, w, h, r);
    const size = Math.max(0.5, bv.size * scale), H = bv.technique ? chiselHeight(A, w, h, bv, size) : blur(A, Math.max(1, Math.round(size / 2)));
    if (bv.technique === 'chiselSoft') H.set(blur(H, Math.max(1, Math.round(size / 8))));
    if (bv.contour?.enabled) contourHeight(H, bv.contour, bv.technique ? null : bv.style === 'inner' || bv.style === 'stroke' ? 'inner' : bv.style === 'outer' ? 'outer' : null);
    if (bv.texture?.enabled) textureHeight(H, w, h, bv.texture, size, scale, origin);
    const th = (bv.angle * Math.PI) / 180, ph = (Math.max(0, Math.min(90, bv.altitude)) * Math.PI) / 180;
    const lx = Math.cos(ph) * Math.cos(th), ly = -Math.cos(ph) * Math.sin(th), lz = Math.sin(ph), steep = (bv.depth / 100) * size * 2;
    let hiMap: Float32Array = new Float32Array(n), shMap: Float32Array = new Float32Array(n);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const p = j * w + i, inside = A[p];
        const region = bv.style === 'inner' || bv.style === 'stroke' ? inside : bv.style === 'outer' ? 1 - inside : 1;
        if (region <= 0) continue;
        let gx = (H[j * w + Math.min(w - 1, i + 1)] - H[j * w + Math.max(0, i - 1)]) / 2, gy = (H[Math.min(h - 1, j + 1) * w + i] - H[Math.max(0, j - 1) * w + i]) / 2;
        if (bv.down !== (bv.style === 'pillow' && inside < 0.5)) { gx = -gx; gy = -gy; }
        const nx = -gx * steep, ny = -gy * steep, len = Math.hypot(nx, ny, 1), shade = (nx * lx + ny * ly + lz) / len;
        if (shade > lz) hiMap[p] = region * Math.min(1, (shade - lz) / Math.max(1e-6, 1 - lz));
        else if (shade < lz) shMap[p] = region * Math.min(1, (lz - shade) / Math.max(1e-6, lz));
      }
    }
    const soft = Math.round(bv.soften * scale);
    if (soft > 0) { hiMap = blur(hiMap, soft); shMap = blur(shMap, soft); }
    const paint = (m: Float32Array, col: { r: number; g: number; b: number }): ImageData => {
      const img = new ImageData(w, h), d = img.data;
      for (let i = 0; i < n; i++) { const o = i * 4; d[o] = col.r; d[o + 1] = col.g; d[o + 2] = col.b; d[o + 3] = Math.round(Math.min(1, m[i]) * 255); }
      return img;
    };
    return [paint(hiMap, bv.highlight), paint(shMap, bv.shadow)];
  }

  private effects(out: (s: Surface, box: Rect, alpha: number, op: GlobalCompositeOperation, name: string, kept: boolean) => void, sil: Slot, fx: LayerEffects, scale: number, opacity: number, W: number, H: number, bounds: Rect, phase: 'below' | 'above'): void {
    const d = fx.dropShadow, g = fx.outerGlow, k = fx.stroke, is = fx.innerShadow, ig = fx.innerGlow, co = fx.colorOverlay, bv = fx.bevel;
    const reach = fxReach(fx) * scale + 2;
    const box = intersectRect(integral({ x: bounds.x - reach, y: bounds.y - reach, w: bounds.w + 2 * reach, h: bounds.h + 2 * reach }), { x: 0, y: 0, w: W, h: H });
    if (!box) return;
    const { x: bx, y: by, w: bw, h: bh } = box;
    const css = (c: RGB): string => `rgb(${c.r},${c.g},${c.b})`;
    const lay = (s: Surface, alpha: number, op: GlobalCompositeOperation, name: string, kept = false): void => out(s, box, alpha, op, name, kept);
    const shadowOf = (color: RGB, blur: number, dx: number, dy: number): Surface => {
      const out = this.slot(5, bw, bh);
      out.c.save();
      out.c.setTransform(1, 0, 0, 1, 0, 0);
      out.c.clearRect(0, 0, bw, bh);
      if (blur > 8) {
        const hw = Math.ceil(bw / 2), hh = Math.ceil(bh / 2), half = this.slot(7, hw, hh), far = hw + Math.ceil(Math.abs(dx) / 2 + blur * 1.5) + 16;
        half.c.save();
        half.c.setTransform(1, 0, 0, 1, 0, 0);
        half.c.clearRect(0, 0, hw, hh);
        half.c.shadowColor = css(color);
        half.c.shadowBlur = blur / 2;
        half.c.shadowOffsetX = dx / 2 + far;
        half.c.shadowOffsetY = dy / 2;
        half.c.drawImage(sil.s, bx, by, bw, bh, -far, 0, bw / 2, bh / 2);
        half.c.restore();
        out.c.imageSmoothingEnabled = true;
        out.c.imageSmoothingQuality = 'high';
        out.c.drawImage(half.s, 0, 0, bw / 2, bh / 2, 0, 0, bw, bh);
      } else {
        const far = bw + Math.ceil(Math.abs(dx) + blur * 3) + 16;
        out.c.shadowColor = css(color);
        out.c.shadowBlur = blur;
        out.c.shadowOffsetX = dx + far;
        out.c.shadowOffsetY = dy;
        out.c.drawImage(sil.s, bx, by, bw, bh, -far, 0, bw, bh);
      }
      out.c.restore();
      return out.s;
    };
    if (phase === 'above') {
      // Above the content, each kept to the silhouette: Color Overlay, then Inner Glow, then Inner Shadow on top. The
      // inner effects are the shadow cast by everything around the silhouette (its inverse within the box).
      const kept = (paint: (c: Ctx2D) => void): Surface => {
        const out = this.slot(5, bw, bh);
        out.c.save();
        out.c.setTransform(1, 0, 0, 1, 0, 0);
        out.c.clearRect(0, 0, bw, bh);
        paint(out.c);
        out.c.shadowColor = 'transparent';
        out.c.globalCompositeOperation = 'destination-in';
        out.c.drawImage(sil.s, bx, by, bw, bh, 0, 0, bw, bh);
        out.c.restore();
        return out.s;
      };
      const castByInverse = (color: RGB, blur: number, dx: number, dy: number): Surface => {
        const inv = this.slot(6, bw, bh);
        inv.c.save();
        inv.c.setTransform(1, 0, 0, 1, 0, 0);
        inv.c.globalCompositeOperation = 'source-over';
        inv.c.fillStyle = '#000';
        inv.c.fillRect(0, 0, bw, bh);
        inv.c.globalCompositeOperation = 'destination-out';
        inv.c.drawImage(sil.s, bx, by, bw, bh, 0, 0, bw, bh);
        inv.c.restore();
        return kept((c) => {
          const far = bw + Math.ceil(Math.abs(dx) + blur * 3) + 16;
          c.shadowColor = css(color);
          c.shadowBlur = blur;
          c.shadowOffsetX = dx + far;
          c.shadowOffsetY = dy;
          c.drawImage(inv.s, -far, 0);
        });
      };
      const po = fx.patternOverlay, pat = po.enabled && po.opacity > 0 ? patternById(po.pattern) : null;
      if (pat) {
        // Lowest of the overlays: the pattern tiled from the layer's top-left corner, kept to its silhouette.
        const k = po.scale * scale, ox = bounds.x - bx, oy = bounds.y - by;
        lay(kept((c) => {
          const fill = c.createPattern(pat.surface as CanvasImageSource, 'repeat');
          if (!fill) return;
          fill.setTransform(new DOMMatrix([k, 0, 0, k, ox, oy]));
          c.fillStyle = fill;
          c.fillRect(0, 0, bw, bh);
        }), po.opacity * opacity, compositeOp(po.blend), 'Pattern Fill', true);
      }
      for (const go of instances(fx, 'gradientOverlay')) if (go.enabled && go.opacity > 0) {
        // Beneath Color Overlay: the gradient spans the layer's bounds, kept to its silhouette.
        const cx = bounds.x + bounds.w / 2 - bx, cy = bounds.y + bounds.h / 2 - by, a = (go.angle * Math.PI) / 180, [c0, c1] = go.reverse ? [go.to, go.from] : [go.from, go.to];
        lay(kept((c) => {
          let grad: CanvasGradient;
          if (go.style === 'radial') grad = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, (Math.max(bounds.w, bounds.h) / 2) * go.scale));
          else {
            const ux = Math.cos(a), uy = -Math.sin(a), half = Math.max(0.5, ((Math.abs(bounds.w * ux) + Math.abs(bounds.h * uy)) / 2) * go.scale);
            grad = c.createLinearGradient(cx - ux * half, cy - uy * half, cx + ux * half, cy + uy * half);
          }
          if (go.stops && go.stops.length >= 2) {   // every stop with its alpha (36.8), mirrored when reversed
            for (const s of go.stops) grad.addColorStop(go.reverse ? 1 - s.at : s.at, `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${s.alpha})`);
          } else {
            grad.addColorStop(0, css(c0));
            grad.addColorStop(1, css(c1));
          }
          c.fillStyle = grad;
          c.fillRect(0, 0, bw, bh);
        }), go.opacity * opacity, compositeOp(go.blend), 'Gradient Fill', true);
      }
      for (const co of instances(fx, 'colorOverlay')) if (co.enabled && co.opacity > 0) lay(kept((c) => { c.fillStyle = css(co.color); c.fillRect(0, 0, bw, bh); }), co.opacity * opacity, compositeOp(co.blend), 'Color Fill', true);
      const sa = fx.satin;
      if (sa.enabled && sa.opacity > 0) {
        // Satin, between Color Overlay and Inner Glow.
        const a = sil.c.getImageData(bx, by, bw, bh).data, n = bw * bh, A = new Float32Array(n);
        for (let i = 0; i < n; i++) A[i] = a[i * 4 + 3] / 255;
        const rad = (sa.angle * Math.PI) / 180, ox = Math.round(Math.cos(rad) * sa.distance * scale), oy = Math.round(-Math.sin(rad) * sa.distance * scale);
        const shifted = (dx: number, dy: number): Float32Array => {
          const out = new Float32Array(n);
          for (let j = 0; j < bh; j++) { const sj = j - dy; if (sj < 0 || sj >= bh) continue; for (let i = 0; i < bw; i++) { const si = i - dx; if (si >= 0 && si < bw) out[j * bw + i] = A[sj * bw + si]; } }
          return out;
        };
        const r = Math.max(0, Math.round((sa.size * scale) / 2)), p1 = blur1(shifted(ox, oy), bw, bh, r), p2 = blur1(shifted(-ox, -oy), bw, bh, r);
        const img = new ImageData(bw, bh), px = img.data;
        for (let i = 0; i < n; i++) {
          const v = Math.min(1, Math.abs(p1[i] - p2[i])), level = (sa.invert ? 1 - v : v) * A[i], o = i * 4;
          px[o] = sa.color.r; px[o + 1] = sa.color.g; px[o + 2] = sa.color.b; px[o + 3] = Math.round(level * 255);
        }
        const s = this.slot(11, bw, bh);
        s.c.putImageData(img, 0, 0);
        lay(s.s, sa.opacity * opacity, compositeOp(sa.blend), 'Satin', true);
      }
      if (ig.enabled && ig.opacity > 0 && ig.size > 0) lay(this.contoured(castByInverse(ig.color, ig.size * scale, 0, 0), bw, bh, ig.contour), ig.opacity * opacity, compositeOp(ig.blend), 'Inner Glow', true);
      for (const is of instances(fx, 'innerShadow')) if (is.enabled && is.opacity > 0) {
        const rad = (is.angle * Math.PI) / 180;
        lay(this.contoured(castByInverse(is.color, is.size * scale, -Math.cos(rad) * is.distance * scale, Math.sin(rad) * is.distance * scale), bw, bh, is.contour), is.opacity * opacity, compositeOp(is.blend), 'Inner Shadow', true);
      }
      const ring = bv.style === 'stroke' ? instances(fx, 'stroke').find((s) => s.enabled && s.size * scale > 0) : undefined;
      if (bv.enabled && bv.size > 0 && (bv.highlightOpacity > 0 || bv.shadowOpacity > 0) && (bv.style !== 'stroke' || ring)) {
        const a = sil.c.getImageData(bx, by, bw, bh).data, n = bw * bh, A = new Float32Array(n);
        if (!ring) for (let i = 0; i < n; i++) A[i] = a[i * 4 + 3] / 255;
        else {
          const inside = new Uint8Array(n), s = ring.size * scale, pos = ring.position ?? 'outside';
          for (let i = 0; i < n; i++) inside[i] = a[i * 4 + 3];
          const outer = pos === 'inside' ? inside : resizeMask(inside, bw, bh, pos === 'center' ? s / 2 : s), inner = pos === 'outside' ? inside : resizeMask(inside, bw, bh, -(pos === 'inside' ? s : s / 2));
          for (let i = 0; i < n; i++) A[i] = Math.max(0, outer[i] - inner[i]) / 255;
        }
        const [hi, sh] = this.bevelMaps(A, bw, bh, bv, scale, { x: bounds.x - bx, y: bounds.y - by });
        applyContour(hi.data, bv.gloss);
        applyContour(sh.data, bv.gloss);
        const named = { inner: 'Inner Bevel', outer: 'Outer Bevel', emboss: 'Emboss', pillow: 'Pillow Emboss', stroke: 'Stroke Emboss' }[bv.style];
        if (bv.highlightOpacity > 0) { const s = this.slot(9, bw, bh); s.c.putImageData(hi, 0, 0); lay(s.s, bv.highlightOpacity * opacity, compositeOp(bv.highlightBlend), `${named} Highlights`, bv.style === 'inner'); }
        if (bv.shadowOpacity > 0) { const s = this.slot(10, bw, bh); s.c.putImageData(sh, 0, 0); lay(s.s, bv.shadowOpacity * opacity, compositeOp(bv.shadowBlend), `${named} Shadows`, bv.style === 'inner'); }
      }
      for (const k of instances(fx, 'stroke')) if (k.enabled && k.opacity > 0 && k.size * scale > 0 && (k.position === 'inside' || k.position === 'center')) {
        // Inside: the silhouette less itself shrunk by the size; Center: grown by half less shrunk by half.
        const alpha = sil.c.getImageData(bx, by, bw, bh).data, inside = new Uint8Array(bw * bh);
        for (let i = 0; i < inside.length; i++) inside[i] = alpha[i * 4 + 3];
        const s = k.size * scale, outer = k.position === 'inside' ? inside : resizeMask(inside, bw, bh, s / 2), inner = resizeMask(inside, bw, bh, -(k.position === 'inside' ? s : s / 2));
        const img = new ImageData(bw, bh), px = img.data;
        for (let i = 0; i < inside.length; i++) { const o = i * 4; px[o] = k.color.r; px[o + 1] = k.color.g; px[o + 2] = k.color.b; px[o + 3] = Math.max(0, outer[i] - inner[i]); }
        const out = this.slot(12, bw, bh);
        out.c.putImageData(img, 0, 0);
        lay(out.s, k.opacity * opacity, 'source-over', k.position === 'inside' ? 'Inner Stroke' : 'Stroke', k.position === 'inside');
      }
      return;
    }
    for (const d of instances(fx, 'dropShadow')) if (d.enabled && d.opacity > 0) {
      const rad = (d.angle * Math.PI) / 180;
      lay(this.contoured(shadowOf(d.color, d.size * scale, -Math.cos(rad) * d.distance * scale, Math.sin(rad) * d.distance * scale), bw, bh, d.contour), d.opacity * opacity, compositeOp(d.blend), 'Drop Shadow');
    }
    if (g.enabled && g.opacity > 0 && g.size > 0) lay(this.contoured(shadowOf(g.color, g.size * scale, 0, 0), bw, bh, g.contour), g.opacity * opacity, compositeOp(g.blend), 'Outer Glow');
    for (const k of instances(fx, 'stroke')) if (k.enabled && k.opacity > 0 && k.size * scale > 0 && (k.position ?? 'outside') === 'outside') {
      const alpha = sil.c.getImageData(bx, by, bw, bh).data, inside = new Uint8Array(bw * bh);
      for (let i = 0; i < inside.length; i++) inside[i] = alpha[i * 4 + 3];
      const ring = resizeMask(inside, bw, bh, k.size * scale), img = new ImageData(bw, bh), px = img.data;
      for (let i = 0; i < ring.length; i++) { const o = i * 4; px[o] = k.color.r; px[o + 1] = k.color.g; px[o + 2] = k.color.b; px[o + 3] = ring[i]; }
      const out = this.slot(6, bw, bh);
      out.c.save();
      out.c.setTransform(1, 0, 0, 1, 0, 0);
      out.c.putImageData(img, 0, 0);
      out.c.globalCompositeOperation = 'destination-out';
      out.c.drawImage(sil.s, bx, by, bw, bh, 0, 0, bw, bh);
      out.c.restore();
      lay(out.s, k.opacity * opacity, 'source-over', 'Outer Stroke');
    }
  }

  /** A windowed stroke's pixels over their window (1.60.6, DEV_PLAN 26.2), drawn with 'copy' inside the window's
   *  rectangle (layer pixels, placed by `m`): they replace the layer's own there rather than adding to them, which
   *  erasing and part-transparent pixels need; where the stroke has not reached, they are the layer's own anyway. */
  private patchIn(c: Ctx2D, p: LayerPatch, m: Mat, sampling: Sampling, alpha: number, quality?: ImageSmoothingQuality): void {
    c.save();
    setMat(c, m);
    c.beginPath();
    c.rect(p.x, p.y, p.surface.width, p.surface.height);
    c.clip();
    this.draw(c, p.surface as CanvasImageSource, mul(m, translation(p.x, p.y)), sampling, alpha, 'copy', quality);
    c.restore();
  }

  /** Draws `src` under matrix `m`; an image shown at under half size comes from its halved copy so no single step
   *  reduces by more than 2x. */
  private draw(c: Ctx2D, src: CanvasImageSource, m: Mat, sampling: Sampling, alpha: number, op: GlobalCompositeOperation, quality?: ImageSmoothingQuality): void {
    c.save();
    c.globalAlpha = alpha;
    c.globalCompositeOperation = op;
    let image: CanvasImageSource = src, matrix = m;
    if (sampling === 'nearest') c.imageSmoothingEnabled = false;
    else {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = sampling === 'smooth' ? 'low' : quality ?? 'high';
      const raster = rasterOf(src), level = raster ? halvingsFor(matScale(m)) : 0;
      if (raster && level > 0) {
        const h = halved(raster, level);
        image = h.surface;
        matrix = mul(m, scaling(h.scale, h.scale));
      }
    }
    setMat(c, matrix);
    c.drawImage(image, 0, 0);
    c.restore();
  }

  /** The mask a layer carries, or null when it has none enabled with pixels. */
  private maskOf(layer: Layer, ov: LayerOverride | undefined, t: Transform): MaskInfo | null {
    const mk = layer.mask;
    if (!mk || !mk.enabled || !mk.raster) return null;
    const src = ov?.maskSource ?? (shapedMask(mk) ?? mk.raster).canvas;
    const apart = ov?.maskPlacement ?? mk.placement;
    return { src, w: src.width, h: src.height, t: apart ?? t, covers: !apart && !layer.adjustment };
  }

  /** A layer's vector mask (1.66.1) as a mask over the canvas, its coverage at document size; null when it is off or
   *  shows everything. While a move or transform is live (`t`, the layer's box in it), a linked one goes with it. */
  private vectorOf(layer: Layer, doc: Doc, t: Transform = layer.transform): MaskInfo | null {
    const v = layer.vectorMask, cov = v?.enabled ? vectorCoverage(v, doc.width, doc.height) : null;
    if (!cov) return null;
    const along = v?.linked && t !== layer.transform && !sameTransform(t, layer.transform) && layer.transform.w > 0 && layer.transform.h > 0;
    return { src: cov.surface, w: doc.width, h: doc.height, t: { x: 0, y: 0, w: doc.width, h: doc.height, rotation: 0, flipX: false, flipY: false, sampling: 'smooth' }, covers: true, ...(along ? { mat: boxChange(layer.transform, t) } : {}) };
  }

  private folderMasks(map: ReadonlyMap<ID, Layer>, layer: Layer, doc: Doc): MaskInfo[] {
    const out: MaskInfo[] = [];
    for (const g of ancestors(map, layer)) {
      const m = g.mask, vm = this.vectorOf(g, doc);
      if (m && m.enabled && m.raster) out.push({ src: (shapedMask(m) ?? m.raster).canvas, w: m.raster.width, h: m.raster.height, t: m.placement ?? g.transform, covers: false });
      if (vm) out.push(vm);
      // An artboard shows its contents only inside its rectangle: one white pixel stretched over it, sampled nearest so
      // its edges stay crisp.
      const a = g.artboard;
      if (a) out.push({ src: whitePixel(), w: 1, h: 1, t: { x: a.x, y: a.y, w: a.w, h: a.h, rotation: 0, flipX: false, flipY: false, sampling: 'nearest' }, covers: true });
    }
    return out;
  }

  /** Blend If (1.54.5, M2): the layer's coverage in `a` multiplied by the range factor of its own value and of the
   *  underlying composite's value in `ctx`, on the grey (Rec. 601 luminosity) or one channel, each split feathered. */
  private blendIf(a: Slot, ctx: Ctx2D, b: BlendIf, W: number, H: number): void {
    const top = a.c.getImageData(0, 0, W, H), under = ctx.getImageData(0, 0, W, H), t = top.data, u = under.data;
    const valueOf = (d: Uint8ClampedArray, i: number): number => b.channel === 'r' ? d[i] : b.channel === 'g' ? d[i + 1] : b.channel === 'b' ? d[i + 2] : 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const factor = (v: number, r: [number, number, number, number]): number => {
      const lo = v < r[0] ? 0 : v >= r[1] ? 1 : (v - r[0]) / Math.max(1, r[1] - r[0]);
      const hi = v > r[3] ? 0 : v <= r[2] ? 1 : (r[3] - v) / Math.max(1, r[3] - r[2]);
      return lo * hi;
    };
    for (let i = 0; i < t.length; i += 4) {
      if (t[i + 3] === 0) continue;
      const f = factor(valueOf(t, i), b.thisLayer) * (u[i + 3] === 0 ? factor(255, b.underlying) : factor(valueOf(u, i), b.underlying));
      if (f < 1) t[i + 3] = Math.round(t[i + 3] * f);
    }
    a.c.putImageData(top, 0, 0);
  }

  /** Knockout (1.54.5, M2): what lies below the layer is replaced, through the layer's silhouette at its opacity,
   *  by the Background (deep, or shallow for a layer outside any group) or by the composite beneath the layer's
   *  group (shallow inside a group). The layer's own pixels then draw at their fill, so Fill 0 shows the knockout. */
  private knockout(job: RenderJob, ctx: Ctx2D, a: Slot, layer: Layer, map: ReadonlyMap<ID, Layer>, W: number, H: number, opacity: number): void {
    const parents = ancestors(map, layer), group = layer.knockout === 'shallow' ? parents[0] ?? null : null;
    const only = new Set<ID>();
    if (!group) { const bottom = job.doc.layers.find((l) => l.raster && !l.isGroup && !l.adjustment); if (bottom && bottom.id !== layer.id) only.add(bottom.id); }
    else { const gi = job.doc.layers.indexOf(group); for (const [i, l] of job.doc.layers.entries()) if (i < gi && !ancestors(map, l).some((g) => g.id === group.id)) only.add(l.id); }
    const back = this.slot(2, W, H);
    back.c.setTransform(1, 0, 0, 1, 0, 0); back.c.clearRect(0, 0, W, H);
    if (only.size) this.render({ ...job, target: back.s, only, overrides: job.overrides, quality: job.quality });
    back.c.globalCompositeOperation = 'destination-in';
    back.c.drawImage(a.s, 0, 0);
    back.c.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = opacity; ctx.globalCompositeOperation = 'source-over';
    // Clear the silhouette to the backdrop: destination-out by the silhouette, then the backdrop under it.
    ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(a.s, 0, 0);
    ctx.globalCompositeOperation = 'destination-over'; ctx.globalAlpha = 1; ctx.drawImage(back.s, 0, 0);
    ctx.restore();
  }

  private cover(c: Ctx2D, mk: MaskInfo, view: Mat, W: number, H: number): void {
    const m = mul(view, mk.mat ?? placement(mk.t, mk.w, mk.h));
    c.save();
    if (mk.covers) {
      setMat(c, m);
      c.globalCompositeOperation = 'destination-in';
      c.imageSmoothingEnabled = mk.t.sampling !== 'nearest';
      c.drawImage(mk.src, 0, 0);
      c.restore();
      return;
    }
    // Placed apart: white everywhere, the mask's own rectangle punched out and the mask drawn in it, so outside its
    // bounds the layer shows.
    const k = this.slot(1, W, H);
    k.c.fillStyle = '#fff';
    k.c.fillRect(0, 0, W, H);
    k.c.save();
    setMat(k.c, m);
    k.c.globalCompositeOperation = 'destination-out';
    k.c.fillRect(0, 0, mk.w, mk.h);
    k.c.globalCompositeOperation = 'source-over';
    k.c.imageSmoothingEnabled = mk.t.sampling !== 'nearest';
    k.c.drawImage(mk.src, 0, 0);
    k.c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(k.s, 0, 0);
    c.restore();
  }

  /** The coverage a clip base lends the layers clipped to it: its pixels, masks and opacity at document size in
   *  document space, as a fresh copy. Null when the base is missing or lends none. */
  clipCoverageOf(doc: Doc, baseId: ID): Surface | null {
    const map = new Map<ID, Layer>();
    for (const e of hierarchy(doc)) map.set(e.layer.id, e.layer);
    const base = map.get(baseId);
    if (!base) return null;
    const job: RenderJob = { doc, target: createSurface(1, 1), view: IDENTITY, quality: 'high' };
    const cov = this.clipCoverage(job, base, map, doc.width, doc.height, 0);
    if (!cov) return null;
    const copy = createSurface(cov.width, cov.height);
    ctxOf(copy).drawImage(cov, 0, 0);
    return copy;
  }

  private clipCoverage(job: RenderJob, base: Layer, map: ReadonlyMap<ID, Layer>, W: number, H: number, depth: number): Surface | null {
    if (depth > 256 || base.isGroup || !base.raster) return null;
    const ov = job.overrides?.get(base.id);
    const src = ov?.source ?? base.raster.canvas;
    const t = ov?.transform ?? base.transform;
    let slot = this.clipPool.get(base.id);
    if (!slot) { const s = createSurface(W, H); slot = { s, c: ctxOf(s) }; this.clipPool.set(base.id, slot); }
    this.prepare(slot, W, H);
    this.draw(slot.c, src, mul(job.view, placement(t, src.width, src.height)), t.sampling, ov?.opacity ?? base.opacity, 'source-over', job.quality);
    if (ov?.patch) this.patchIn(slot.c, ov.patch, mul(job.view, placement(t, src.width, src.height)), t.sampling, ov?.opacity ?? base.opacity, job.quality);   // 1.60.6
    const own = this.maskOf(base, ov, t), vm = this.vectorOf(base, job.doc, t);
    if (own) this.cover(slot.c, own, job.view, W, H);
    if (vm) this.cover(slot.c, vm, job.view, W, H);
    const under = base.clipId ? map.get(base.clipId) : undefined;
    if (under) {
      const inner = this.clipCoverage(job, under, map, W, H, depth + 1);
      if (!inner) return null;
      slot.c.save();
      slot.c.setTransform(1, 0, 0, 1, 0, 0);
      slot.c.globalCompositeOperation = 'destination-in';
      slot.c.drawImage(inner, 0, 0);
      slot.c.restore();
    }
    return slot.s;
  }

  /** An adjustment layer applied to what lies beneath on the target: the kernel runs on a copy of the pixels, the
   *  layer's coverage (own mask, folder masks, clip base) limits it, and each visible pixel moves toward the adjusted
   *  value by coverage times opacity. */
  private adjust(job: RenderJob, ctx: Ctx2D, layer: Layer, own: MaskInfo | null, folders: MaskInfo[], base: Layer | null, map: ReadonlyMap<ID, Layer>, clipCache: Map<ID, Surface | null>, W: number, H: number, opacity: number, mode: BlendMode): void {
    const kernel = kernelFor(layer.adjustment ?? null);
    if (!kernel || !(opacity > 0)) return;
    let cov: Surface | null = null;
    if (base) {
      if (clipCache.has(base.id)) cov = clipCache.get(base.id) ?? null;
      else { cov = this.clipCoverage(job, base, map, W, H, 0); clipCache.set(base.id, cov); }
      if (!cov) return;
    }
    const k = this.slot(2, W, H);
    k.c.fillStyle = '#fff';
    k.c.fillRect(0, 0, W, H);
    if (own) this.cover(k.c, own, job.view, W, H);
    for (const f of folders) this.cover(k.c, f, job.view, W, H);
    if (cov) {
      k.c.save();
      k.c.setTransform(1, 0, 0, 1, 0, 0);
      k.c.globalCompositeOperation = 'destination-in';
      k.c.drawImage(cov, 0, 0);
      k.c.restore();
    }
    const reach = k.c.getImageData(0, 0, W, H).data;
    const img = ctx.getImageData(0, 0, W, H), px = img.data;
    const adjusted = new Uint8ClampedArray(px);
    const inv = invert(job.view) ?? IDENTITY;
    const p0 = applyMat(inv, 0, 0), p1 = applyMat(inv, 1, 0);
    kernel(adjusted, { width: W, height: H, originX: p0.x, originY: p0.y, unitsPerPixel: Math.hypot(p1.x - p0.x, p1.y - p0.y) });
    if (mode !== 'normal') {
      // The adjusted pixels, at their coverage, blended onto the pixels below in the layer's mode and opacity; the
      // alpha of what lies below is kept, as an adjustment leaves it.
      const under = this.slot(2, W, H), top = this.slot(3, W, H), ui = under.c.createImageData(W, H), ti = top.c.createImageData(W, H);
      for (let i = 0; i < px.length; i += 4) {
        ui.data[i] = px[i]; ui.data[i + 1] = px[i + 1]; ui.data[i + 2] = px[i + 2]; ui.data[i + 3] = 255;
        ti.data[i] = adjusted[i]; ti.data[i + 1] = adjusted[i + 1]; ti.data[i + 2] = adjusted[i + 2]; ti.data[i + 3] = px[i + 3] === 0 ? 0 : reach[i + 3];
      }
      under.c.putImageData(ui, 0, 0);
      top.c.putImageData(ti, 0, 0);
      if (canvasBlend(mode)) {
        under.c.globalAlpha = opacity;
        under.c.globalCompositeOperation = compositeOp(mode);
        under.c.drawImage(top.s, 0, 0);
        under.c.globalAlpha = 1;
        under.c.globalCompositeOperation = 'source-over';
      } else this.pixelBlend(under.c, top, mode, opacity, IDENTITY, top.s, job.view, W, H);
      const out = under.c.getImageData(0, 0, W, H).data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0 || reach[i + 3] === 0) continue;
        px[i] = out[i]; px[i + 1] = out[i + 1]; px[i + 2] = out[i + 2];
      }
      ctx.putImageData(img, 0, 0);
      return;
    }
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0 || reach[i + 3] === 0) continue;
      const f = (reach[i + 3] / 255) * opacity;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c] + (adjusted[i + c] - px[i + c]) * f);
    }
    ctx.putImageData(img, 0, 0);
  }
}

/** How far, in document pixels, the enabled effects reach past the layer's silhouette, over every instance. */
function fxReach(fx: LayerEffects): number {
  const on = <T extends { enabled: boolean }>(list: T[], f: (e: T) => number): number => Math.max(0, ...list.filter((e) => e.enabled).map(f));
  return Math.max(fx.bevel.enabled ? (fx.bevel.size + fx.bevel.soften) * 2 : 0, fx.outerGlow.enabled ? fx.outerGlow.size * 1.5 : 0, fx.innerGlow.enabled ? fx.innerGlow.size * 1.5 : 0,
    on(instances(fx, 'dropShadow'), (d) => d.distance + d.size * 1.5), on(instances(fx, 'stroke'), (k) => k.size), on(instances(fx, 'innerShadow'), (s) => s.distance + s.size * 1.5));
}

/** The whole document rendered at its own size with no view transform, in high quality, on the given background. */
export function renderDoc(renderer: Renderer, doc: Doc, background: string | null = null): Surface {
  const target = createSurface(doc.width, doc.height);
  renderer.render({ doc, target, view: IDENTITY, quality: 'high', background });
  return target;
}

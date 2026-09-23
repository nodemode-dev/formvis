import { resizeMask } from './filters';
import { blendPixels } from './blend';
import { patternById } from './patterns';
import { applyContour, contourLut, withGlobalLight, type ContourId } from './style-extras';
import { canvasBlend, compositeOp, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform, effectsActive, type LayerEffects, type RGB, type Rect } from './types';
import { createSurface, ctxOf, rasterOf, sizeSurface, type Ctx2D, type Raster, type Surface } from './surface';
import { translation, IDENTITY, applyMat, invert, matScale, mul, placement, scaling, setMat, boundsOf, integral, intersectRect, type Mat } from './geometry';
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

/** an image drawn at under half size is drawn from a copy halved exactly 2x at a time,
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

export interface LayerOverride { source?: Surface; transform?: Transform; maskSource?: Surface; maskPlacement?: Transform; hidden?: boolean; blend?: BlendMode; opacity?: number; effects?: LayerEffects | null }
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
/** `k`: the resolution the part was computed at, 1 for full; a smaller part is drawn scaled back up to its place. */
interface FxPart { s: Surface; x: number; y: number; k: number; alpha: number; op: GlobalCompositeOperation; above: boolean }
interface MaskInfo { src: Surface; w: number; h: number; t: Transform; covers: boolean }

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

export class Renderer {
  private slots: Slot[] = [];
  private readonly fxCache = new Map<ID, { key: string; parts: FxPart[] }>();
  /** While a style is being previewed, effects over large regions are computed at reduced resolution (about 1.5
   *  megapixels) and drawn scaled up, so dragging a slider stays quick; the style applied is computed in full. */
  fastEffects = false;
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
      const mode = ov?.blend ?? layer.blend, op = compositeOp(mode), pixelBlend = !canvasBlend(mode);
      const fx0 = ov && 'effects' in ov ? ov.effects ?? null : layer.effects ?? null, fx = fx0 ? withGlobalLight(fx0, job.doc.globalLight) : null, styled = effectsActive(fx);
      // A styled layer's effects come from the per-layer cache at document resolution when they can, so any view and
      // any repainted region shows them whole; strokes and transforms in progress, clipping and folder masks are
      // drawn per render instead.
      const parts = styled && !base && !folders.length && !ov?.source && !ov?.maskSource && !ov?.transform ? this.effectParts(layer, fx as LayerEffects, src, t, own, ov?.maskPlacement ?? null, job.doc.width, job.doc.height) : null;
      if (parts) this.drawParts(ctx, parts, job.view, opacity, false);
      if (!own && !folders.length && !base && !pixelBlend && (!styled || parts)) {
        this.draw(ctx, src, m, t.sampling, opacity, op, job.quality);
        if (parts) this.drawParts(ctx, parts, job.view, opacity, true);
        continue;
      }
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
      const placed = styled && !parts ? boundsOf([applyMat(m, 0, 0), applyMat(m, src.width, 0), applyMat(m, src.width, src.height), applyMat(m, 0, src.height)]) : null;
      if (placed) this.effects(this.drawer(ctx), a, fx as LayerEffects, matScale(job.view), opacity, W, H, placed, 'below');
      if (pixelBlend) this.pixelBlend(ctx, a, mode, opacity, m, src, job.view, W, H);
      else {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = op;
        ctx.drawImage(a.s, 0, 0);
        ctx.restore();
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
  private effectParts(layer: Layer, fx: LayerEffects, src: Surface, t: Transform, own: MaskInfo | null, maskPlacement: Transform | null, docW: number, docH: number): FxPart[] {
    const r = layer.raster, mk = layer.mask;
    const key = JSON.stringify([r?.id ?? null, r?.version ?? 0, t, mk ? [mk.raster?.id ?? null, mk.raster?.version ?? 0, mk.enabled, maskPlacement ?? mk.placement] : null, fx, docW, docH, this.fastEffects]);
    const hit = this.fxCache.get(layer.id);
    if (hit && hit.key === key) return hit.parts;
    const d = fx.dropShadow, g = fx.outerGlow, k = fx.stroke, is = fx.innerShadow, ig = fx.innerGlow;
    const reach = Math.max(fx.bevel.enabled ? (fx.bevel.size + fx.bevel.soften) * 2 : 0, d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) + 4;
    const lm = placement(t, src.width, src.height);
    const placed = boundsOf([applyMat(lm, 0, 0), applyMat(lm, src.width, 0), applyMat(lm, src.width, src.height), applyMat(lm, 0, src.height)]);
    const region = intersectRect(integral({ x: placed.x - reach, y: placed.y - reach, w: placed.w + 2 * reach, h: placed.h + 2 * reach }), { x: 0, y: 0, w: docW, h: docH });
    const parts: FxPart[] = [];
    if (region) {
      const k = this.fastEffects && region.w * region.h > 1_500_000 ? Math.sqrt(1_500_000 / (region.w * region.h)) : 1;
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
        this.effects((s, box, alpha, op) => {
          const copy = createSurface(box.w, box.h);
          ctxOf(copy).drawImage(s, 0, 0, box.w, box.h, 0, 0, box.w, box.h);
          parts.push({ s: copy, x: region.x + box.x / k, y: region.y + box.y / k, k, alpha, op, above: phase === 'above' });
        }, sil, fx, k, 1, rw, rh, local, phase);
      }
    }
    if (this.fxCache.size > 64) this.fxCache.clear();
    this.fxCache.set(layer.id, { key, parts });
    return parts;
  }

  /** Cached effect parts through the view, below or above the layer, each at its own blend times the layer's opacity. */
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
  /** Bevel and Emboss's highlight and shadow for silhouette alpha `a` (RGBA, `w` by `h`): the silhouette softened by
   *  three box blurs approximating a Gaussian of half the size is the height map; each pixel's normal comes from its
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

  private bevelMaps(a: Uint8ClampedArray, w: number, h: number, bv: LayerEffects['bevel'], scale: number): [ImageData, ImageData] {
    const n = w * h, A = new Float32Array(n);
    for (let i = 0; i < n; i++) A[i] = a[i * 4 + 3] / 255;
    const blur = (src: Float32Array, r: number): Float32Array => blur1(src, w, h, r);
    const size = Math.max(0.5, bv.size * scale), H = blur(A, Math.max(1, Math.round(size / 2)));
    const th = (bv.angle * Math.PI) / 180, ph = (Math.max(0, Math.min(90, bv.altitude)) * Math.PI) / 180;
    const lx = Math.cos(ph) * Math.cos(th), ly = -Math.cos(ph) * Math.sin(th), lz = Math.sin(ph), steep = (bv.depth / 100) * size * 2;
    let hiMap: Float32Array = new Float32Array(n), shMap: Float32Array = new Float32Array(n);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const p = j * w + i, inside = A[p];
        const region = bv.style === 'inner' ? inside : bv.style === 'outer' ? 1 - inside : 1;
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

  private effects(out: (s: Surface, box: Rect, alpha: number, op: GlobalCompositeOperation) => void, sil: Slot, fx: LayerEffects, scale: number, opacity: number, W: number, H: number, bounds: Rect, phase: 'below' | 'above'): void {
    const d = fx.dropShadow, g = fx.outerGlow, k = fx.stroke, is = fx.innerShadow, ig = fx.innerGlow, co = fx.colorOverlay, bv = fx.bevel;
    const reach = Math.max(bv.enabled ? (bv.size + bv.soften) * 2 : 0, d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) * scale + 2;
    const box = intersectRect(integral({ x: bounds.x - reach, y: bounds.y - reach, w: bounds.w + 2 * reach, h: bounds.h + 2 * reach }), { x: 0, y: 0, w: W, h: H });
    if (!box) return;
    const { x: bx, y: by, w: bw, h: bh } = box;
    const css = (c: RGB): string => `rgb(${c.r},${c.g},${c.b})`;
    const lay = (s: Surface, alpha: number, op: GlobalCompositeOperation): void => out(s, box, alpha, op);
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
        }), po.opacity * opacity, compositeOp(po.blend));
      }
      const go = fx.gradientOverlay;
      if (go.enabled && go.opacity > 0) {
        // Beneath Color Overlay, as in Photoshop: the gradient spans the layer's bounds, kept to its silhouette.
        const cx = bounds.x + bounds.w / 2 - bx, cy = bounds.y + bounds.h / 2 - by, a = (go.angle * Math.PI) / 180, [c0, c1] = go.reverse ? [go.to, go.from] : [go.from, go.to];
        lay(kept((c) => {
          let grad: CanvasGradient;
          if (go.style === 'radial') grad = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, (Math.max(bounds.w, bounds.h) / 2) * go.scale));
          else {
            const ux = Math.cos(a), uy = -Math.sin(a), half = Math.max(0.5, ((Math.abs(bounds.w * ux) + Math.abs(bounds.h * uy)) / 2) * go.scale);
            grad = c.createLinearGradient(cx - ux * half, cy - uy * half, cx + ux * half, cy + uy * half);
          }
          grad.addColorStop(0, css(c0));
          grad.addColorStop(1, css(c1));
          c.fillStyle = grad;
          c.fillRect(0, 0, bw, bh);
        }), go.opacity * opacity, compositeOp(go.blend));
      }
      if (co.enabled && co.opacity > 0) lay(kept((c) => { c.fillStyle = css(co.color); c.fillRect(0, 0, bw, bh); }), co.opacity * opacity, compositeOp(co.blend));
      const sa = fx.satin;
      if (sa.enabled && sa.opacity > 0) {
        // Satin, between Color Overlay and Inner Glow as Photoshop stacks it.
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
        lay(s.s, sa.opacity * opacity, compositeOp(sa.blend));
      }
      if (ig.enabled && ig.opacity > 0 && ig.size > 0) lay(this.contoured(castByInverse(ig.color, ig.size * scale, 0, 0), bw, bh, ig.contour), ig.opacity * opacity, compositeOp(ig.blend));
      if (is.enabled && is.opacity > 0) {
        const rad = (is.angle * Math.PI) / 180;
        lay(this.contoured(castByInverse(is.color, is.size * scale, -Math.cos(rad) * is.distance * scale, Math.sin(rad) * is.distance * scale), bw, bh, is.contour), is.opacity * opacity, compositeOp(is.blend));
      }
      if (bv.enabled && bv.size > 0 && (bv.highlightOpacity > 0 || bv.shadowOpacity > 0)) {
        const [hi, sh] = this.bevelMaps(sil.c.getImageData(bx, by, bw, bh).data, bw, bh, bv, scale);
        applyContour(hi.data, bv.gloss);
        applyContour(sh.data, bv.gloss);
        if (bv.highlightOpacity > 0) { const s = this.slot(9, bw, bh); s.c.putImageData(hi, 0, 0); lay(s.s, bv.highlightOpacity * opacity, compositeOp(bv.highlightBlend)); }
        if (bv.shadowOpacity > 0) { const s = this.slot(10, bw, bh); s.c.putImageData(sh, 0, 0); lay(s.s, bv.shadowOpacity * opacity, compositeOp(bv.shadowBlend)); }
      }
      if (k.enabled && k.opacity > 0 && k.size * scale > 0 && (k.position === 'inside' || k.position === 'center')) {
        // Inside: the silhouette less itself shrunk by the size; Center: grown by half less shrunk by half.
        const alpha = sil.c.getImageData(bx, by, bw, bh).data, inside = new Uint8Array(bw * bh);
        for (let i = 0; i < inside.length; i++) inside[i] = alpha[i * 4 + 3];
        const s = k.size * scale, outer = k.position === 'inside' ? inside : resizeMask(inside, bw, bh, s / 2), inner = resizeMask(inside, bw, bh, -(k.position === 'inside' ? s : s / 2));
        const img = new ImageData(bw, bh), px = img.data;
        for (let i = 0; i < inside.length; i++) { const o = i * 4; px[o] = k.color.r; px[o + 1] = k.color.g; px[o + 2] = k.color.b; px[o + 3] = Math.max(0, outer[i] - inner[i]); }
        const out = this.slot(12, bw, bh);
        out.c.putImageData(img, 0, 0);
        lay(out.s, k.opacity * opacity, 'source-over');
      }
      return;
    }
    if (d.enabled && d.opacity > 0) {
      const rad = (d.angle * Math.PI) / 180;
      lay(this.contoured(shadowOf(d.color, d.size * scale, -Math.cos(rad) * d.distance * scale, Math.sin(rad) * d.distance * scale), bw, bh, d.contour), d.opacity * opacity, compositeOp(d.blend));
    }
    if (g.enabled && g.opacity > 0 && g.size > 0) lay(this.contoured(shadowOf(g.color, g.size * scale, 0, 0), bw, bh, g.contour), g.opacity * opacity, compositeOp(g.blend));
    if (k.enabled && k.opacity > 0 && k.size * scale > 0 && (k.position ?? 'outside') === 'outside') {
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
      lay(out.s, k.opacity * opacity, 'source-over');
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
    this.draw(slot.c, src, mul(job.view, placement(t, src.width, src.height)), t.sampling, ov?.opacity ?? base.opacity, 'source-over', job.quality);
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

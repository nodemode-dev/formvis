import { applyMat, boundsOf, integral, intersectRect, invert, matScale, mul, setMat, translation, unionRect, type Mat } from './geometry';
import { createSurface, ctxOf, type Ctx2D, type Raster, type Surface } from './surface';
import type { SelectionMask } from './selection';
import type { PixelPatch } from './history';
import type { Pt, Rect, RGB } from './types';
import { UPRIGHT, computeOption, shapeActive, type BrushDynamics, type BrushShape, type PenPose } from './brush-dynamics';
import type { SampledTip } from './abr';

/** Painting strokes for formvis. Dabs of a round brush tip are laid along the pointer's path into a separate paint
 *  layer, evenly spaced and carried over between moves; composing lays that layer onto a working copy of the pixels at
 *  the stroke's opacity, so overlapping dabs within one stroke never build past it. A selection limits where paint
 *  lands, a texture (Clone Stamp's source) can stand in for the brush colour, and on an alpha-coded mask the value
 *  under the brush moves toward the paint rather than only gaining coverage. */

/** `flow` (0 to 1, default 1) is Photoshop's Flow: how much paint each dab lays down, so paint builds within a stroke as
 *  dabs overlap, up to the stroke's `opacity`, which caps the stroke as a whole. */
/** aliased (the Pencil): dabs are pixel-exact circles, every pixel painted fully or not at all. */
export interface StrokeStyle { square?: boolean; bg?: RGB; aliased?: boolean; diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number; dabColor?: ((x: number, y: number) => RGB | null) | null }

/** A sampled tip (from an .abr file) as the brush's colour with the tip's greys as alpha, its longer side `sizePx`. */
function sampledTip(sizePx: number, tip: SampledTip, color: RGB): Surface {
  const src = createSurface(tip.w, tip.h), img = new ImageData(tip.w, tip.h), d = img.data;
  for (let i = 0; i < tip.data.length; i++) { d[i * 4] = color.r; d[i * 4 + 1] = color.g; d[i * 4 + 2] = color.b; d[i * 4 + 3] = tip.data[i]; }
  ctxOf(src).putImageData(img, 0, 0);
  const k = Math.max(2, sizePx) / Math.max(tip.w, tip.h), w = Math.max(1, Math.round(tip.w * k)), h = Math.max(1, Math.round(tip.h * k)), out = createSurface(w, h), c = ctxOf(out);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, w, h);
  return out;
}

/** The brush tip, `sizePx` across: full opacity through the hard core, then a raised-cosine shoulder to nothing at the
 *  rim. A fully hard tip keeps a pixel and a half of linear fall at its rim, so its edge stays smooth. */
function brushTip(sizePx: number, hardness: number, color: RGB): Surface {
  const size = Math.max(2, Math.ceil(sizePx)), r = size / 2, hard = hardness >= 0.99;
  const core = hard ? Math.max(0, 1 - 1.5 / r) : Math.max(0, hardness);
  const img = new ImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      let alpha = 0;
      if (u <= core) alpha = 1;
      else if (u < 1) {
        const t = (u - core) / (1 - core);
        alpha = hard ? 1 - t : 0.5 + 0.5 * Math.cos(Math.PI * t);
      }
      const i = (y * size + x) * 4;
      d[i] = color.r; d[i + 1] = color.g; d[i + 2] = color.b; d[i + 3] = Math.round(alpha * 255);
    }
  }
  const tip = createSurface(size, size);
  ctxOf(tip).putImageData(img, 0, 0);
  return tip;
}

/** Limits drawing on `c` to `rect` in pixel space and clears it; the caller restores. */
function openFrame(c: Ctx2D, rect: Rect): void {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.beginPath();
  c.rect(rect.x, rect.y, rect.w, rect.h);
  c.clip();
  c.clearRect(rect.x, rect.y, rect.w, rect.h);
}

/** Full-size surfaces kept between strokes: creating a large canvas costs far more than clearing one (about 35 ms
 *  against 5 ms at 4000 by 3000), so a stroke takes its working copy and paint layer from here and gives them back. */
const spares: Surface[] = [];
const MAX_SPARES = 4;

function takeSurface(w: number, h: number): Surface {
  const i = spares.findIndex((x) => x.width === w && x.height === h);
  if (i < 0) return createSurface(w, h);
  const surface = spares.splice(i, 1)[0], c = ctxOf(surface);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  return surface;
}

/** At most this many bytes of spares (1.60.5, DEV_PLAN 26.2): measured, a 6,000 by 6,000 stroke left 274 MB in the
 *  pool, and four spares of a 150 MP layer would be 2.3 GB. A surface past it is never kept; one dropped is shrunk to
 *  nothing, so its memory comes back at once rather than when the browser collects it. */
const MAX_SPARE_BYTES = 256 * 1024 * 1024;
/** Layers of more pixels than this stroke in a window (1.60.6, DEV_PLAN 26.2); settable so a check can force either
 *  way on the same strokes and compare the pixels. */
let windowFrom = 16_000_000;
export function setStrokeWindowFrom(px: number): void { windowFrom = px; }
export const strokeWindowFrom = (): number => windowFrom;
const bytesOf = (s: Surface): number => s.width * s.height * 4;
const drop = (s: Surface | undefined): void => { if (s) { s.width = 0; s.height = 0; } };

function giveSurface(surface: Surface | null): void {
  if (!surface) return;
  if (bytesOf(surface) > MAX_SPARE_BYTES) { drop(surface); return; }
  if (spares.length >= MAX_SPARES) drop(spares.shift());
  spares.push(surface);
  while (spareBytes() > MAX_SPARE_BYTES && spares.length > 1) drop(spares.shift());
}

/** How many spare stroke surfaces are kept, for checks. */
export const spareSurfaces = (): number => spares.length;
/** Their bytes, which the engine's memory count includes (1.60.5). */
export const spareBytes = (): number => spares.reduce((n, s) => n + bytesOf(s), 0);

/** Readies spare surfaces of `w` by `h` for the next stroke, so even the first stroke skips creating them. */
export function warmStrokeSurfaces(w: number, h: number, count = 2): void {
  let have = spares.filter((x) => x.width === w && x.height === h).length;
  while (have < count) {
    // Drawn on once, since a canvas gets its pixel memory at the first drawing rather than when it is made.
    const fresh = createSurface(w, h), c = ctxOf(fresh);
    c.fillRect(0, 0, 1, 1);
    c.clearRect(0, 0, 1, 1);
    giveSurface(fresh);
    have += 1;
  }
}

export class PixelStroke {
  /** The layer's pixels with the stroke so far composed in (over the window, for a windowed stroke). */
  working: Surface;
  private workingCtx: Ctx2D;
  private paint: Surface;
  private paintCtx: Ctx2D;
  private masked: Surface | null;
  /** The window (1.60.6, DEV_PLAN 26.2): a large layer's stroke keeps its surfaces only over a window around where it
   *  paints, in layer pixels from (ox, oy), grown as the stroke reaches past it; a smaller layer's window is the whole
   *  layer, as before. `toWin` maps document points into the window's surfaces. */
  windowed: boolean;
  ox = 0;
  oy = 0;
  private ww: number;
  private wh: number;
  private toWin: Mat;
  /** Asked before the window grows by `bytes`; false cuts the stroke there (the engine's memory budget). */
  canGrow: ((bytes: number) => boolean) | null = null;
  /** Whether a dab fell outside what the window could grow to (the stroke was cut there). */
  clipped = false;
  private textured: Surface | null = null;
  private tip: Surface;
  private readonly toLocal: Mat;
  private readonly radius: number;
  private spacing: number;
  private last: Pt | null = null;
  private carry = 0;
  /** Pixels touched since the last compose, and over the whole stroke. */
  private pending: Rect | null = null;
  private touched: Rect | null = null;

  constructor(readonly raster: Raster, localToDoc: Mat, readonly style: StrokeStyle, readonly op: GlobalCompositeOperation, private readonly selection: SelectionMask | null, private readonly texture: { surface: Surface; dx: number; dy: number } | null = null, private readonly lerp = false) {
    this.toLocal = invert(localToDoc);
    // Past `windowFrom` pixels a stroke on pixels works in a window (1.60.6), opened at its first dab; a mask's stroke
    // (lerp) and a smaller layer's keep surfaces the layer's size, as before.
    this.windowed = raster.width * raster.height > windowFrom && !lerp;
    this.ww = this.windowed ? 1 : raster.width;
    this.wh = this.windowed ? 1 : raster.height;
    this.toWin = this.toLocal;
    this.working = takeSurface(this.ww, this.wh);
    this.workingCtx = ctxOf(this.working);
    if (!this.windowed) this.workingCtx.drawImage(raster.canvas, 0, 0);
    this.paint = takeSurface(this.ww, this.wh);
    this.paintCtx = ctxOf(this.paint);
    this.masked = selection ? takeSurface(this.ww, this.wh) : null;
    this.radius = Math.max(0.5, style.diameter / 2);
    // Dabs every 1.5% of the diameter for a hard tip and 2.5% for a soft one; a sampled tip every quarter of its size.
    this.spacing = Math.max(0.5, style.diameter * (style.tip ? 0.25 : style.hardness >= 0.99 ? 0.015 : 0.025));
    this.tip = style.tip ? sampledTip(style.diameter * matScale(this.toLocal), style.tip, style.color) : brushTip(style.diameter * matScale(this.toLocal), style.hardness, style.color);
    this.tipAspect = style.tip ? { x: style.tip.w / Math.max(style.tip.w, style.tip.h), y: style.tip.h / Math.max(style.tip.w, style.tip.h) } : { x: 1, y: 1 };
  }

  /** The bytes the stroke's surfaces hold (the engine counts them while it lasts). */
  get bytes(): number { return this.ww * this.wh * 4 * (2 + (this.masked ? 1 : 0) + (this.textured ? 1 : 0)); }

  /** The window grown to hold `box` (layer pixels) with room to spare, its surfaces remade with what they held; false
   *  when growing would pass what the engine allows, and the dab is then not laid (the stroke is cut there). */
  private ensure(box: Rect): boolean {
    if (!this.windowed) return true;
    const L = this.raster.width, H = this.raster.height, b = intersectRect(box, { x: 0, y: 0, w: L, h: H });
    if (!b) return true;
    const open = this.ww > 1 || this.wh > 1;
    if (open && b.x >= this.ox && b.y >= this.oy && b.x + b.w <= this.ox + this.ww && b.y + b.h <= this.oy + this.wh) return true;
    const u = open ? unionRect({ x: this.ox, y: this.oy, w: this.ww, h: this.wh }, b) as Rect : b;
    const m = Math.max(512, Math.round(Math.max(u.w, u.h) / 2));   // half again around it, so a stroke regrows rarely
    const nx = Math.max(0, u.x - m), ny = Math.max(0, u.y - m), nw = Math.min(L, u.x + u.w + m) - nx, nh = Math.min(H, u.y + u.h + m) - ny;
    if (this.canGrow && !this.canGrow((nw * nh - (open ? this.ww * this.wh : 0)) * 4 * (2 + (this.masked ? 1 : 0) + (this.textured ? 1 : 0)))) { this.clipped = true; return false; }
    const dx = this.ox - nx, dy = this.oy - ny;
    const remake = (old: Surface | null, layer: boolean): Surface | null => {
      if (!old) return null;
      const s = createSurface(nw, nh), c = ctxOf(s);
      if (layer) c.drawImage(this.raster.canvas, nx, ny, nw, nh, 0, 0, nw, nh);   // the layer's pixels where the window is new
      if (open) { c.save(); c.beginPath(); c.rect(dx, dy, this.ww, this.wh); c.clip(); c.globalCompositeOperation = 'copy'; c.drawImage(old, dx, dy); c.restore(); }
      old.width = 0; old.height = 0;   // freed at once
      return s;
    };
    this.working = remake(this.working, true) as Surface; this.workingCtx = ctxOf(this.working);
    this.paint = remake(this.paint, false) as Surface; this.paintCtx = ctxOf(this.paint);
    this.masked = remake(this.masked, false);
    this.textured = remake(this.textured, false);
    this.ox = nx; this.oy = ny; this.ww = nw; this.wh = nh;
    this.toWin = mul(translation(-nx, -ny), this.toLocal);
    return true;
  }

  /** For a stroke whose working surface is read whole (Quick Mask's), before its first dab (1.60.6). */
  keepWhole(): void { this.toFull(); }

  /** Back to surfaces the layer's size, before the first dab (a Brush Settings shape or Wet Edges needs them whole). */
  private toFull(): void {
    if (!this.windowed) return;
    const w = this.raster.width, h = this.raster.height;
    for (const s of [this.working, this.paint, this.masked]) if (s) { s.width = 0; s.height = 0; }
    this.windowed = false; this.ox = 0; this.oy = 0; this.ww = w; this.wh = h; this.toWin = this.toLocal;
    this.working = takeSurface(w, h); this.workingCtx = ctxOf(this.working); this.workingCtx.drawImage(this.raster.canvas, 0, 0);
    this.paint = takeSurface(w, h); this.paintCtx = ctxOf(this.paint);
    this.masked = this.selection ? takeSurface(w, h) : null;
  }

  /** A sampled tip's width and height as parts of its longer side; a round tip's are both 1. */
  private readonly tipAspect: { x: number; y: number };

  get lastPoint(): Pt | null { return this.last; }

  /** Pen dynamics, set by the engine before the first point; null or neutral options leave dabs as the style says. */
  dynamics: BrushDynamics | null = null;
  private lastPressure = 1;

  /** Brush Settings beyond the round tip (brush-dynamics.ts BrushShape), set by setShape before the first point; null
   *  or inactive, dabs are laid exactly as before. */
  private shape: BrushShape | null = null;
  private pose: PenPose = UPRIGHT;
  private dir = 0;
  private rnd: () => number = Math.random;
  private dualPaint: Surface | null = null;
  private dualTip: Surface | null = null;
  private textureTile: Surface | null = null;
  private shaped: Surface | null = null;

  /** Installs a Brush Settings shape: its spacing (a percentage of the diameter, where set), the dual brush's round tip,
   *  and the texture as a tile whose alpha is what it cuts from the paint (darker pattern, more; scaled by Depth). */
  setShape(shape: BrushShape | null, pattern: Surface | null): void {
    if (shape && (shape.wetEdges || shapeActive(shape))) this.toFull();   // their surfaces are the layer's size (1.60.6)
    // Color Dynamics, Transfer, Noise and Wet Edges (1.50.1) apply to every brush, a plain round one too.
    if (shape) {
      this.colorDyn = shape.color?.on ? { ...shape.color } : null;
      this.transfer = shape.transfer?.on ? { ...shape.transfer } : null;
      if (shape.noise) this.tip = shapedTip(this.tip, true, false);
      // Wet Edges is the stroke's, not each dab's: overlapping dabs would fill a lighter centre back in (1.50.1's fault).
      if (shape.wetEdges) this.wetInner = takeSurface(this.raster.width, this.raster.height);
    }
    if (!shapeActive(shape) || !shape) return;
    this.shape = structuredClone(shape);
    if (shape.spacing !== null) this.spacing = Math.max(0.5, this.style.diameter * (shape.spacing / 100));
    const k = matScale(this.toLocal);
    if (shape.dual.on) { this.dualPaint = takeSurface(this.raster.width, this.raster.height); this.dualTip = brushTip(shape.dual.diameter * k, 1, { r: 255, g: 255, b: 255 }); }
    if (shape.texture.on && pattern) {
      const w = pattern.width, h = pattern.height, t = createSurface(w, h), c = ctxOf(t), src = ctxOf(pattern).getImageData(0, 0, w, h), out = c.createImageData(w, h), depth = shape.texture.depth / 100;
      for (let i = 0; i < src.data.length; i += 4) out.data[i + 3] = Math.round(255 * depth * (1 - (0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) / 255));
      c.putImageData(out, 0, 0);
      this.textureTile = t;
    }
  }

  /** Extends the stroke to `p` (document units): the first point lays a dab, later ones lay dabs every `spacing` along
   *  the way, the distance since the last dab carried into the next move. `pressure` (0 to 1, 1 for a mouse) is
   *  interpolated along the way, so a pen's changes between samples are smooth; `pose` is the pen's tilt and rotation. */
  /** The Airbrush (1.50.4): a dab where the stroke is, so paint builds while the pointer rests. */
  stamp(pressure = 1): void { if (this.last) this.dab(this.last, Math.min(1, Math.max(0, pressure))); }

  to(p: Pt, pressure = 1, pose: PenPose = UPRIGHT): void {
    const from = this.last, pr = Math.min(1, Math.max(0, pressure));
    this.pose = pose;
    if (!from) {
      // One seeded sequence per stroke, from where it starts, so a stroke is laid the same way each time.
      let seed = (Math.round(p.x * 73856093) ^ Math.round(p.y * 19349663)) >>> 0;
      this.rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      this.dab(p, pr); this.last = p; this.carry = 0; this.lastPressure = pr; return;
    }
    const dx = p.x - from.x, dy = p.y - from.y, length = Math.hypot(dx, dy);
    if (length === 0) return;
    this.dir = (Math.atan2(dy, dx) * 180) / Math.PI;
    let along = this.spacing - this.carry;
    for (; along <= length; along += this.spacing) this.dab({ x: from.x + (dx * along) / length, y: from.y + (dy * along) / length }, this.lastPressure + ((pr - this.lastPressure) * along) / length);
    this.carry = length - (along - this.spacing);
    this.last = p;
    this.lastPressure = pr;
  }

  private dab(p: Pt, pressure = 1): void {
    if (this.style.aliased) { this.aliasedDab(p, pressure); return; }
    if (this.shape) { this.shapedDab(p, pressure); return; }
    const d = this.dynamics, info = { pressure }, r = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1) * this.transferAlpha(pressure);
    // Its bounds first, so a windowed stroke's window can grow to hold it before it is laid (1.60.6).
    const corners = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([ox, oy]) => applyMat(this.toLocal, p.x + ox, p.y + oy));
    const box = integral(boundsOf(corners));
    const hit = intersectRect({ x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (!hit) { this.dabTip(p.x, p.y); return; }   // off the layer: its tip still taken, so Color Dynamics' sequence holds
    if (!this.ensure(hit)) return;
    setMat(this.paintCtx, this.toWin);
    if (flow < 1) this.paintCtx.globalAlpha = Math.max(0, flow);
    const rx = r * this.tipAspect.x, ry = r * this.tipAspect.y;
    this.paintCtx.drawImage(this.dabTip(p.x, p.y), p.x - rx, p.y - ry, rx * 2, ry * 2);
    this.wetMark(this.toWin, p.x, p.y, rx, ry);
    if (flow < 1) this.paintCtx.globalAlpha = 1;
    this.pending = unionRect(this.pending, hit);
    this.touched = unionRect(this.touched, hit);
  }

  private colorDyn: BrushShape['color'] | null = null;
  /** Wet Edges: each dab's inside (55 percent of it, hard), gathered over the stroke; compose lightens the stroke there. */
  private wetInner: Surface | null = null;
  private wetMark(m: Mat, cx: number, cy: number, rx: number, ry: number): void {
    if (!this.wetInner) return;
    const c = ctxOf(this.wetInner);
    setMat(c, m);
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(cx, cy, Math.max(0.1, rx * 0.55), Math.max(0.1, ry * 0.55), 0, 0, Math.PI * 2); c.fill();
  }
  private transfer: BrushShape['transfer'] | null = null;
  private recolor: Surface | null = null;

  /** Transfer: this dab's share of opacity and flow (jitters, or pen pressure). */
  private transferAlpha(pressure: number): number {
    const t = this.transfer;
    if (!t) return 1;
    let k = (1 - Math.random() * (t.opacity / 100)) * (1 - Math.random() * (t.flow / 100));
    if (t.control === 'pressure') k *= Math.max(0, Math.min(1, pressure));
    return Math.max(0, k);
  }

  /** The tip for this dab: from the style's colour source when it has one (the Mixer Brush, 1.56.2), else coloured by
   *  Color Dynamics (towards the background, hue, saturation and brightness varied), else the stroke's own. */
  private dabTip(x = NaN, y = NaN): Surface {
    const own = this.style.dabColor && !Number.isNaN(x) ? this.style.dabColor(x, y) : null;
    if (own) return this.tinted(own.r, own.g, own.b);
    const cd = this.colorDyn;
    if (!cd) return this.tip;
    const fg = this.style.color, bg = this.style.bg ?? fg, t = Math.random() * (cd.fgBg / 100);
    let [h, sat, v] = toHsv(fg.r + (bg.r - fg.r) * t, fg.g + (bg.g - fg.g) * t, fg.b + (bg.b - fg.b) * t);
    h = (h + (Math.random() * 2 - 1) * (cd.hue / 100) * 0.5 + 1) % 1;
    sat = Math.max(0, Math.min(1, sat + (Math.random() * 2 - 1) * (cd.saturation / 100)));
    v = Math.max(0, Math.min(1, v + (Math.random() * 2 - 1) * (cd.brightness / 100)));
    const [r, g, b] = fromHsv(h, sat, v);
    return this.tinted(r, g, b);
  }

  /** The tip recoloured to one colour, its alpha kept. */
  private tinted(r: number, g: number, b: number): Surface {
    const w = this.tip.width, ht = this.tip.height;
    if (!this.recolor || this.recolor.width !== w || this.recolor.height !== ht) this.recolor = createSurface(w, ht);
    const c = ctxOf(this.recolor);
    c.globalCompositeOperation = 'copy';
    c.drawImage(this.tip as CanvasImageSource, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    c.fillRect(0, 0, w, ht);
    c.globalCompositeOperation = 'source-over';
    return this.recolor;
  }

  /** The Pencil's dab: a circle of whole pixels in the raster's own grid (no smoothing), filled row by row. */
  private aliasedDab(p: Pt, pressure: number): void {
    const d = this.dynamics, info = { pressure }, c = applyMat(this.toLocal, p.x, p.y);
    const r = Math.max(0.5, this.radius * matScale(this.toLocal) * (d ? Math.max(0.01, computeOption(d.size, info)) : 1));
    const cx = Math.floor(c.x) + 0.5, cy = Math.floor(c.y) + 0.5, rr = r <= 0.75 ? 0.5 : r;
    // Its bounds first, so a windowed stroke's window can hold it (1.60.6); drawn shifted by the window's whole-pixel origin.
    const pre = intersectRect({ x: Math.floor(cx - rr) - 1, y: Math.floor(cy - rr) - 1, w: Math.ceil(rr * 2) + 3, h: Math.ceil(rr * 2) + 3 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (pre && !this.ensure(pre)) return;
    const ctx = this.paintCtx, col = this.style.color;
    ctx.setTransform(1, 0, 0, 1, -this.ox, -this.oy);
    ctx.fillStyle = `rgb(${col.r}, ${col.g}, ${col.b})`;
    // The Eraser's Block (1.50.3, the tool audit): a pixel-exact square.
    // (In place of the circle, not returning early: the lines after it record the area the dab touched.)
    if (this.style.square) { const side = Math.max(1, Math.round(rr * 2)); ctx.fillRect(Math.round(cx - side / 2), Math.round(cy - side / 2), side, side); }
    else for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
      const dy = y + 0.5 - cy, half = rr * rr - dy * dy;
      if (half < 0) continue;
      const w = Math.sqrt(half), x0 = Math.round(cx - w), x1 = Math.round(cx + w);
      if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
      else if (rr <= 0.5) ctx.fillRect(Math.floor(cx), y, 1, 1);
    }
    const box = { x: Math.floor(cx - rr) - 1, y: Math.floor(cy - rr) - 1, w: Math.ceil(rr * 2) + 3, h: Math.ceil(rr * 2) + 3 };
    const hit = intersectRect(box, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (!hit) return;
    this.pending = unionRect(this.pending, hit);
    this.touched = unionRect(this.touched, hit);
  }

  /** A dab with a Brush Settings shape: Count dabs (less Count Jitter), each with its size, angle and roundness from the
   *  shape, its controls and jitters, scattered across the stroke (or on both axes) by Scatter, a percentage of the
   *  diameter; with Dual Brush on, the second tip's marks laid at the same places, scattered by its own Scatter. */
  private shapedDab(p: Pt, pressure: number): void {
    const sh = this.shape as BrushShape, d = this.dynamics, info = { pressure }, rnd = this.rnd, pose = this.pose;
    const base = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1) * this.transferAlpha(pressure);
    const tilt = Math.min(90, Math.hypot(pose.tiltX, pose.tiltY)), count = Math.max(1, Math.round(sh.count * (1 - (sh.countJitter / 100) * rnd())));
    const across = ((this.dir + 90) * Math.PI) / 180, varied = sh.roundnessJitter > 0 || sh.roundnessControl !== 'off';
    for (let k = 0; k < count; k++) {
      const r = base * (1 - (sh.sizeJitter / 100) * rnd());
      let angle = sh.angle;
      if (sh.angleControl === 'direction') angle += this.dir;
      else if (sh.angleControl === 'tilt') angle += (Math.atan2(pose.tiltY, pose.tiltX) * 180) / Math.PI;
      else if (sh.angleControl === 'rotation') angle += pose.twist;
      angle += (rnd() * 2 - 1) * (sh.angleJitter / 100) * 180;
      let round = sh.roundness / 100;
      if (sh.roundnessControl === 'tilt') round *= 1 - tilt / 90;
      round *= 1 - (sh.roundnessJitter / 100) * rnd();
      if (varied) round = Math.max(sh.minRoundness / 100, round);
      round = Math.max(0.01, Math.min(1, round));
      const spread = (sh.scatter / 100) * base * 2;
      let x = p.x, y = p.y;
      if (spread > 0) {
        if (sh.bothAxes) { x += (rnd() * 2 - 1) * spread; y += (rnd() * 2 - 1) * spread; }
        else { const t = (rnd() * 2 - 1) * spread; x += Math.cos(across) * t; y += Math.sin(across) * t; }
      }
      const a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), place = mul(this.toLocal, [ca, sa, -sa, ca, x, y]);
      setMat(this.paintCtx, mul(place, [1, 0, 0, round, 0, 0]));
      if (flow < 1) this.paintCtx.globalAlpha = Math.max(0, flow);
      const rx = r * this.tipAspect.x, ry = r * this.tipAspect.y;
      this.paintCtx.drawImage(this.dabTip(x, y), -rx, -ry, rx * 2, ry * 2);
      this.wetMark(mul(place, [1, 0, 0, round, 0, 0]), 0, 0, rx, ry);
      if (flow < 1) this.paintCtx.globalAlpha = 1;
      if (this.dualPaint && this.dualTip) {
        const dc = ctxOf(this.dualPaint), dr = Math.max(0.5, sh.dual.diameter / 2), ds = (sh.dual.scatter / 100) * dr * 2;
        for (let j = 0; j < Math.max(1, sh.dual.count); j++) {
          setMat(dc, this.toLocal);
          dc.drawImage(this.dualTip, x + (rnd() * 2 - 1) * ds - dr, y + (rnd() * 2 - 1) * ds - dr, dr * 2, dr * 2);
        }
      }
      const reach = r + (sh.dual.on ? (sh.dual.scatter / 100) * sh.dual.diameter + sh.dual.diameter : 0);
      const corners = [[-reach, -reach], [reach, -reach], [reach, reach], [-reach, reach]].map(([ox, oy]) => applyMat(this.toLocal, x + ox, y + oy));
      const box = integral(boundsOf(corners));
      const hit = intersectRect({ x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
      if (hit) { this.pending = unionRect(this.pending, hit); this.touched = unionRect(this.touched, hit); }
    }
  }

  /** Brings the working copy up to date where dabs landed since the last call; returns that area, or null. */
  compose(): Rect | null {
    const area = this.pending;
    this.pending = null;
    if (!area) return null;
    const win: Rect = { x: area.x - this.ox, y: area.y - this.oy, w: area.w, h: area.h };   // in the window's pixels (1.60.6)
    // Coverage: the paint layer, shaped by the dual brush (kept only where its marks fell) and the texture (its tile's
    // alpha cut out, tiled at Scale in document space), then cut to the selection when there is one.
    let coverage: Surface = this.paint;
    if (this.dualPaint || this.textureTile || this.wetInner) {
      this.shaped ??= takeSurface(this.ww, this.wh);
      const c = ctxOf(this.shaped);
      openFrame(c, win);
      c.drawImage(this.paint, 0, 0);
      if (this.dualPaint) { c.globalCompositeOperation = 'destination-in'; c.drawImage(this.dualPaint, 0, 0); }
      if (this.textureTile && this.shape) {
        const pat = c.createPattern(this.textureTile, 'repeat');
        if (pat) {
          const k = this.shape.texture.scale / 100, m = mul(this.toWin, [k, 0, 0, k, 0, 0]);
          pat.setTransform(new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]));
          c.globalCompositeOperation = 'destination-out';
          c.fillStyle = pat;
          c.fillRect(win.x, win.y, win.w, win.h);
        }
      }
      if (this.wetInner) { c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 0.45; c.drawImage(this.wetInner, 0, 0); c.globalAlpha = 1; }   // the middle lighter, the rim full
      c.restore();
      coverage = this.shaped;
    }
    if (this.masked && this.selection) {
      const c = ctxOf(this.masked);
      openFrame(c, win);
      c.drawImage(coverage, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      setMat(c, mul(this.toWin, translation(this.selection.x, this.selection.y)));
      c.drawImage(this.selection.surface(), 0, 0);
      c.restore();
      coverage = this.masked;
    }
    // What gets laid down: the coverage itself, or the texture showing through it.
    let laid = coverage;
    if (this.texture) {
      this.textured ??= takeSurface(this.ww, this.wh);
      const c = ctxOf(this.textured);
      openFrame(c, win);
      setMat(c, mul(this.toWin, translation(-this.texture.dx, -this.texture.dy)));
      c.drawImage(this.texture.surface, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(coverage, 0, 0);
      c.restore();
      laid = this.textured;
    }
    const w = this.workingCtx, { x, y, w: aw, h: ah } = win, lx = area.x, ly = area.y;   // window pixels; the layer's at lx, ly
    w.save();
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.clearRect(x, y, aw, ah);
    w.drawImage(this.raster.canvas, lx, ly, aw, ah, x, y, aw, ah);
    w.globalAlpha = this.style.opacity;
    if (this.lerp) {
      // An alpha-coded mask (white, its level in alpha) should move toward the paint: out = old (1 - c) + paint c. Cut
      // the old value by the coverage, then add the paint already scaled by it ('lighter' adds premultiplied white,
      // which is adding alpha).
      w.globalCompositeOperation = 'destination-out';
      w.drawImage(coverage, x, y, aw, ah, x, y, aw, ah);
      w.globalCompositeOperation = 'lighter';
    } else w.globalCompositeOperation = this.op;
    w.drawImage(laid, x, y, aw, ah, x, y, aw, ah);
    w.restore();
    return area;
  }

  /** The stroke's coverage per layer pixel, 0 to 255, cut to the selection. */
  coverageAlpha(): Uint8Array {
    const w = this.raster.width, h = this.raster.height, s = createSurface(w, h), c = ctxOf(s);
    c.drawImage(this.paint, this.ox, this.oy);   // the window's paint at its place (1.60.6)
    if (this.selection) {
      c.globalCompositeOperation = 'destination-in';
      setMat(c, mul(this.toLocal, translation(this.selection.x, this.selection.y)));
      c.drawImage(this.selection.surface(), 0, 0);
    }
    const d = c.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
    for (let p = 0; p < out.length; p++) out[p] = d[p * 4 + 3];
    return out;
  }

  /** Writes the stroke into the layer; returns the before and after pixels of the touched area for undo. */
  /** Gives the stroke's surfaces back for the next stroke; the stroke is not used after this. */
  release(): void {
    giveSurface(this.working);
    giveSurface(this.paint);
    giveSurface(this.masked);
    giveSurface(this.textured);
    this.textured = null;
    giveSurface(this.dualPaint);
    giveSurface(this.shaped);
    giveSurface(this.wetInner);
    this.wetInner = null;
    this.dualPaint = null;
    this.shaped = null;
  }

  /** The stroke written into the layer as `commit` does, its undo kept as 512-pixel tiles, only those where the layer
   *  changed (1.60.7, DEV_PLAN 26.3): a stroke across a large layer keeps the tiles it painted rather than the whole
   *  rectangle it spanned, before and after. Read and written a tile at a time, so no rectangle-sized copy is made. */
  commitTiles(): PixelPatch[] {
    this.compose();
    const area = this.touched;
    if (!area) return [];
    const T = 512, out: PixelPatch[] = [], c = this.raster.ctx;
    for (let ty = Math.floor(area.y / T) * T; ty < area.y + area.h; ty += T) {
      for (let tx = Math.floor(area.x / T) * T; tx < area.x + area.w; tx += T) {
        const x = Math.max(tx, area.x), y = Math.max(ty, area.y), w = Math.min(tx + T, area.x + area.w) - x, h = Math.min(ty + T, area.y + area.h) - y;
        if (w <= 0 || h <= 0) continue;
        const before = this.raster.read(x, y, w, h);
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.clearRect(x, y, w, h);
        c.drawImage(this.working, x - this.ox, y - this.oy, w, h, x, y, w, h);
        c.restore();
        const after = this.raster.read(x, y, w, h);
        if (!sameBytes(before.data, after.data)) out.push({ raster: this.raster, x, y, before, after });
      }
    }
    this.raster.touch();
    return out;
  }

  commit(): PixelPatch | null {
    this.compose();
    const area = this.touched;
    if (!area) return null;
    const before = this.raster.read(area.x, area.y, area.w, area.h);
    const c = this.raster.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(area.x, area.y, area.w, area.h);
    c.drawImage(this.working, area.x - this.ox, area.y - this.oy, area.w, area.h, area.x, area.y, area.w, area.h);   // from the window (1.60.6)
    c.restore();
    this.raster.touch();
    return { raster: this.raster, x: area.x, y: area.y, before, after: this.raster.read(area.x, area.y, area.w, area.h) };
  }
}

/** Whether two pixel buffers hold the same bytes (four at a time; 1.60.7, for undo tiles). */
function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  const n = a.length >> 2, A = new Uint32Array(a.buffer, a.byteOffset, n), B = new Uint32Array(b.buffer, b.byteOffset, n);
  for (let i = 0; i < n; i++) if (A[i] !== B[i]) return false;
  for (let i = n << 2; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The tip with Noise (its soft edge roughened) and Wet Edges (its centre lighter than its rim), as Photoshop's. */
function shapedTip(tip: Surface, noise: boolean, wet: boolean): Surface {
  const w = tip.width, h = tip.height, out = createSurface(w, h), c = ctxOf(out);
  c.drawImage(tip as CanvasImageSource, 0, 0);
  const img = c.getImageData(0, 0, w, h), d = img.data, cx = w / 2, cy = h / 2, R = Math.max(1, Math.min(cx, cy));
  let seed = 7;
  const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4 + 3;
    let a = d[i];
    if (!a) continue;
    if (wet) { const r = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R); a *= 0.45 + 0.55 * r * r; }
    if (noise && d[i] < 250) a *= 0.35 + 0.65 * rnd();
    d[i] = Math.round(a);
  }
  c.putImageData(img, 0, 0);
  return out;
}

function toHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
  let h = 0;
  if (dd) h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  return [((h / 6) + 1) % 1, mx ? dd / mx : 0, mx];
}

function fromHsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return [r * 255, g * 255, b * 255];
}

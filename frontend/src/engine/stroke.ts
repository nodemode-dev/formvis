import { applyMat, boundsOf, integral, intersectRect, invert, matScale, mul, setMat, translation, unionRect, type Mat } from './geometry';
import { createSurface, ctxOf, type Ctx2D, type Raster, type Surface } from './surface';
import type { SelectionMask } from './selection';
import type { PixelPatch } from './history';
import type { Pt, Rect, RGB } from './types';
import { UPRIGHT, computeOption, shapeActive, type BrushDynamics, type BrushShape, type PenPose } from './brush-dynamics';
import type { SampledTip } from './abr';

/** Painting strokes for sonny. Dabs of a round brush tip are laid along the pointer's path into a separate paint
 *  layer, evenly spaced and carried over between moves; composing lays that layer onto a working copy of the pixels at
 *  the stroke's opacity, so overlapping dabs within one stroke never build past it. A selection limits where paint
 *  lands, a texture (Clone Stamp's source) can stand in for the brush colour, and on an alpha-coded mask the value
 *  under the brush moves toward the paint rather than only gaining coverage. */

/** `flow` (0 to 1, default 1) is Photoshop's Flow: how much paint each dab lays down, so paint builds within a stroke as
 *  dabs overlap, up to the stroke's `opacity`, which caps the stroke as a whole. */
/** aliased (the Pencil): dabs are pixel-exact circles, every pixel painted fully or not at all. */
export interface StrokeStyle { aliased?: boolean; diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number }

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

function giveSurface(surface: Surface | null): void {
  if (!surface) return;
  if (spares.length >= MAX_SPARES) spares.shift();
  spares.push(surface);
}

/** How many spare stroke surfaces are kept, for checks. */
export const spareSurfaces = (): number => spares.length;

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
  /** The layer's pixels with the stroke so far composed in. */
  readonly working: Surface;
  private readonly workingCtx: Ctx2D;
  private readonly paint: Surface;
  private readonly paintCtx: Ctx2D;
  private readonly masked: Surface | null;
  private textured: Surface | null = null;
  private readonly tip: Surface;
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
    this.working = takeSurface(raster.width, raster.height);
    this.workingCtx = ctxOf(this.working);
    this.workingCtx.drawImage(raster.canvas, 0, 0);
    this.paint = takeSurface(raster.width, raster.height);
    this.paintCtx = ctxOf(this.paint);
    this.masked = selection ? takeSurface(raster.width, raster.height) : null;
    this.radius = Math.max(0.5, style.diameter / 2);
    // Dabs every 1.5% of the diameter for a hard tip and 2.5% for a soft one; a sampled tip every quarter of its size.
    this.spacing = Math.max(0.5, style.diameter * (style.tip ? 0.25 : style.hardness >= 0.99 ? 0.015 : 0.025));
    this.tip = style.tip ? sampledTip(style.diameter * matScale(this.toLocal), style.tip, style.color) : brushTip(style.diameter * matScale(this.toLocal), style.hardness, style.color);
    this.tipAspect = style.tip ? { x: style.tip.w / Math.max(style.tip.w, style.tip.h), y: style.tip.h / Math.max(style.tip.w, style.tip.h) } : { x: 1, y: 1 };
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
    const d = this.dynamics, info = { pressure }, r = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1);
    setMat(this.paintCtx, this.toLocal);
    if (flow < 1) this.paintCtx.globalAlpha = Math.max(0, flow);
    const rx = r * this.tipAspect.x, ry = r * this.tipAspect.y;
    this.paintCtx.drawImage(this.tip, p.x - rx, p.y - ry, rx * 2, ry * 2);
    if (flow < 1) this.paintCtx.globalAlpha = 1;
    const corners = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([ox, oy]) => applyMat(this.toLocal, p.x + ox, p.y + oy));
    const box = integral(boundsOf(corners));
    const hit = intersectRect({ x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (!hit) return;
    this.pending = unionRect(this.pending, hit);
    this.touched = unionRect(this.touched, hit);
  }

  /** The Pencil's dab: a circle of whole pixels in the raster's own grid (no smoothing), filled row by row. */
  private aliasedDab(p: Pt, pressure: number): void {
    const d = this.dynamics, info = { pressure }, c = applyMat(this.toLocal, p.x, p.y);
    const r = Math.max(0.5, this.radius * matScale(this.toLocal) * (d ? Math.max(0.01, computeOption(d.size, info)) : 1));
    const ctx = this.paintCtx, col = this.style.color;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgb(${col.r}, ${col.g}, ${col.b})`;
    const cx = Math.floor(c.x) + 0.5, cy = Math.floor(c.y) + 0.5, rr = r <= 0.75 ? 0.5 : r;
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
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
    const base = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1);
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
      this.paintCtx.drawImage(this.tip, -rx, -ry, rx * 2, ry * 2);
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
    // Coverage: the paint layer, shaped by the dual brush (kept only where its marks fell) and the texture (its tile's
    // alpha cut out, tiled at Scale in document space), then cut to the selection when there is one.
    let coverage: Surface = this.paint;
    if (this.dualPaint || this.textureTile) {
      this.shaped ??= takeSurface(this.raster.width, this.raster.height);
      const c = ctxOf(this.shaped);
      openFrame(c, area);
      c.drawImage(this.paint, 0, 0);
      if (this.dualPaint) { c.globalCompositeOperation = 'destination-in'; c.drawImage(this.dualPaint, 0, 0); }
      if (this.textureTile && this.shape) {
        const pat = c.createPattern(this.textureTile, 'repeat');
        if (pat) {
          const k = this.shape.texture.scale / 100, m = mul(this.toLocal, [k, 0, 0, k, 0, 0]);
          pat.setTransform(new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]));
          c.globalCompositeOperation = 'destination-out';
          c.fillStyle = pat;
          c.fillRect(area.x, area.y, area.w, area.h);
        }
      }
      c.restore();
      coverage = this.shaped;
    }
    if (this.masked && this.selection) {
      const c = ctxOf(this.masked);
      openFrame(c, area);
      c.drawImage(coverage, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      setMat(c, mul(this.toLocal, translation(this.selection.x, this.selection.y)));
      c.drawImage(this.selection.surface(), 0, 0);
      c.restore();
      coverage = this.masked;
    }
    // What gets laid down: the coverage itself, or the texture showing through it.
    let laid = coverage;
    if (this.texture) {
      this.textured ??= takeSurface(this.raster.width, this.raster.height);
      const c = ctxOf(this.textured);
      openFrame(c, area);
      setMat(c, mul(this.toLocal, translation(-this.texture.dx, -this.texture.dy)));
      c.drawImage(this.texture.surface, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(coverage, 0, 0);
      c.restore();
      laid = this.textured;
    }
    const w = this.workingCtx, { x, y, w: aw, h: ah } = area;
    w.save();
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.clearRect(x, y, aw, ah);
    w.drawImage(this.raster.canvas, x, y, aw, ah, x, y, aw, ah);
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
    c.drawImage(this.paint, 0, 0);
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
    this.dualPaint = null;
    this.shaped = null;
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
    c.drawImage(this.working, area.x, area.y, area.w, area.h, area.x, area.y, area.w, area.h);
    c.restore();
    this.raster.touch();
    return { raster: this.raster, x: area.x, y: area.y, before, after: this.raster.read(area.x, area.y, area.w, area.h) };
  }
}

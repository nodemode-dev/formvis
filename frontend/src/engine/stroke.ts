import { applyMat, boundsOf, integral, intersectRect, invert, matScale, mul, setMat, translation, unionRect, type Mat } from './geometry';
import { createSurface, ctxOf, type Ctx2D, type Raster, type Surface } from './surface';
import { TiledRaster } from './tiled';
import type { SelectionMask } from './selection';
import type { PixelPatch } from './history';
import type { BlendMode, Pt, Rect, RGB } from './types';
import { blendPixels } from './blend';
import { UPRIGHT, computeOption, shapeActive, symmetryPoints, type BrushSymmetry, type BrushDynamics, type BrushShape, type PenPose } from './brush-dynamics';
import type { SampledTip } from './abr';
import { StrokeBuffer, TipAlpha, levelOf } from './dab-buffer';

/** Painting strokes for formvis, on the standard dab model. Dabs of a round brush tip are laid along the pointer's path,
 *  evenly spaced and carried over between moves, into a deep buffer of coverage (floats, over the stroke's window);
 *  composing draws the paint layer from it over the area that changed and lays that onto a working copy of the pixels.
 *  A pixel shows the lesser of its coverage and the highest opacity any dab has reached there, so paint builds with
 *  flow but never past the stroke's opacity. A selection limits where paint lands, a texture (Clone Stamp's source) can
 *  stand in for the brush colour, and on an alpha-coded mask the value under the brush moves toward the paint rather
 *  than only gaining coverage. */

/** `flow` (0 to 1, default 1) is Flow: how much paint a quarter of the diameter of travel lays down, whatever
 *  the spacing, so paint builds within a stroke as dabs overlap, up to `opacity`, which caps the stroke as a whole. */
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
let scratch: Surface | null = null;
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
/** Every spare surface let go, when memory is wanted for something larger (1.61.4); the next stroke makes its own. */
export function dropSpareSurfaces(): void { while (spares.length) drop(spares.pop()); }

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
  /** The deep coverage the paint layer is drawn from, the colours of a stroke whose dabs differ (Mixer, Color Dynamics),
   *  the tip's alpha read once, and how many dabs have been laid (Fade's count). */
  private buf: StrokeBuffer;
  private ink: Surface | null = null;
  private tipA: TipAlpha | null = null;
  private steps = 0;
  private eased: number | null = null;
  private airbrushing = false;
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

  /** A giant layer kept in tiles (1.62.5, DEV_PLAN 26.6d): read into `orig`, the window's original pixels, as the window
   *  grows; the stroke reads the layer from there, and commits into the tiles. Null for an ordinary layer. */
  private readonly tiled: TiledRaster | null;
  private orig: Surface | null = null;
  /** Where the window could not grow because tiles there were on disk (the engine brings them back). */
  missing: Rect | null = null;
  /** A blend mode the canvas has no operation for: the laid paint is blended onto the layer per pixel (blend.ts). */
  pixelBlend: BlendMode | null = null;

  /** The ordinary layer that the retouch strokes (healing, Remove, cloning, Dodge and Burn) work on whole; they are
   *  declined on a tiled layer before they start, and this refuses one plainly if one ever arrives (1.62.5). */
  get layer(): Raster {
    if (this.tiled) throw new Error('This tool works on a whole layer, which a layer kept in tiles cannot give yet.');
    return this.raster as Raster;
  }

  constructor(readonly raster: Raster | TiledRaster, localToDoc: Mat, readonly style: StrokeStyle, readonly op: GlobalCompositeOperation, private readonly selection: SelectionMask | null, private readonly texture: { surface: Surface; dx: number; dy: number } | null = null, private readonly lerp = false) {
    this.toLocal = invert(localToDoc);
    // Past `windowFrom` pixels a stroke on pixels works in a window (1.60.6), opened at its first dab; a mask's stroke
    // (lerp) and a smaller layer's keep surfaces the layer's size, as before.
    this.tiled = raster instanceof TiledRaster ? raster : null;
    if (this.tiled && lerp) throw new Error('A mask stroke on a layer kept in tiles is not supported yet.');
    this.windowed = (!!this.tiled || raster.width * raster.height > windowFrom) && !lerp;   // a tiled layer always (1.62.5)
    this.ww = this.windowed ? 1 : raster.width;
    this.wh = this.windowed ? 1 : raster.height;
    this.toWin = this.toLocal;
    this.working = takeSurface(this.ww, this.wh);
    this.workingCtx = ctxOf(this.working);
    if (!this.windowed) this.workingCtx.drawImage((raster as Raster).canvas, 0, 0);
    this.paint = takeSurface(this.ww, this.wh);
    this.paintCtx = ctxOf(this.paint);
    this.masked = selection ? takeSurface(this.ww, this.wh) : null;
    this.buf = new StrokeBuffer(this.ww, this.wh);
    this.radius = Math.max(0.5, style.diameter / 2);
    // Dabs every 1.5% of the diameter for a hard tip and 2.5% for a soft one; a sampled tip every quarter of its size.
    this.spacing = Math.max(0.5, style.diameter * (style.tip ? 0.25 : style.hardness >= 0.99 ? 0.015 : 0.025));
    this.tip = style.tip ? sampledTip(style.diameter * matScale(this.toLocal), style.tip, style.color) : brushTip(style.diameter * matScale(this.toLocal), style.hardness, style.color);
    this.tipAspect = style.tip ? { x: style.tip.w / Math.max(style.tip.w, style.tip.h), y: style.tip.h / Math.max(style.tip.w, style.tip.h) } : { x: 1, y: 1 };
  }

  /** The bytes the stroke's surfaces hold (the engine counts them while it lasts). */
  get bytes(): number { return this.ww * this.wh * 4 * (2 + (this.masked ? 1 : 0) + (this.textured ? 1 : 0) + (this.ink ? 1 : 0)) + this.buf.bytes; }

  /** The window grown to hold `box` (layer pixels) with room to spare, its surfaces remade with what they held; false
   *  when growing would pass what the engine allows, and the dab is then not laid (the stroke is cut there). */
  private ensure(box: Rect): boolean {
    if (!this.windowed) return true;
    const L = this.raster.width, H = this.raster.height, b = intersectRect(box, { x: 0, y: 0, w: L, h: H });
    if (!b) return true;
    const open = this.ww > 1 || this.wh > 1;
    if (open && b.x >= this.ox && b.y >= this.oy && b.x + b.w <= this.ox + this.ww && b.y + b.h <= this.oy + this.wh) return true;
    const u = open ? unionRect({ x: this.ox, y: this.oy, w: this.ww, h: this.wh }, b) as Rect : b;
    // Half again around it, so a stroke regrows rarely; on a giant layer a fixed 1,024 pixels (1.63.0), since half again
    // of a stroke across a 600 MP picture asked for a window the size of the picture, several times over.
    const m = this.tiled ? 1024 : Math.max(512, Math.round(Math.max(u.w, u.h) / 2));
    const nx = Math.max(0, u.x - m), ny = Math.max(0, u.y - m), nw = Math.min(L, u.x + u.w + m) - nx, nh = Math.min(H, u.y + u.h + m) - ny;
    if (this.canGrow && !this.canGrow((nw * nh - (open ? this.ww * this.wh : 0)) * (4 * (2 + (this.masked ? 1 : 0) + (this.textured ? 1 : 0) + (this.ink ? 1 : 0)) + (this.buf.ceil ? 5 : 4)))) { this.clipped = true; return false; }
    // A tiled layer's original pixels for the whole new window, read once (1.62.5); a tile there on disk stops the
    // window here, the dab not laid and the area noted for the engine to bring back: never painted over unloaded.
    let fresh: ImageData | null = null;
    if (this.tiled) {
      try { fresh = this.tiled.read(nx, ny, nw, nh); } catch { this.missing = { x: nx, y: ny, w: nw, h: nh }; this.clipped = true; return false; }
    }
    if (fresh) {
      const o = createSurface(nw, nh);
      ctxOf(o).putImageData(fresh, 0, 0);
      if (this.orig) { this.orig.width = 0; this.orig.height = 0; }
      this.orig = o;
    }
    const dx = this.ox - nx, dy = this.oy - ny;
    const remake = (old: Surface | null, layer: boolean): Surface | null => {
      if (!old) return null;
      const s = createSurface(nw, nh), c = ctxOf(s);
      if (layer) {   // the layer's pixels where the window is new
        if (fresh) c.putImageData(fresh, 0, 0);
        else c.drawImage((this.raster as Raster).canvas, nx, ny, nw, nh, 0, 0, nw, nh);
      }
      if (open) { c.save(); c.beginPath(); c.rect(dx, dy, this.ww, this.wh); c.clip(); c.globalCompositeOperation = 'copy'; c.drawImage(old, dx, dy); c.restore(); }
      old.width = 0; old.height = 0;   // freed at once
      return s;
    };
    this.working = remake(this.working, true) as Surface; this.workingCtx = ctxOf(this.working);
    this.paint = remake(this.paint, false) as Surface; this.paintCtx = ctxOf(this.paint);
    this.masked = remake(this.masked, false);
    this.textured = remake(this.textured, false);
    this.ink = remake(this.ink, false);
    this.buf.resize(nw, nh, open, dx, dy);
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
    for (const s of [this.working, this.paint, this.masked, this.ink]) if (s) { s.width = 0; s.height = 0; }
    this.ink = null;
    this.buf = new StrokeBuffer(w, h);
    this.windowed = false; this.ox = 0; this.oy = 0; this.ww = w; this.wh = h; this.toWin = this.toLocal;
    this.working = takeSurface(w, h); this.workingCtx = ctxOf(this.working); this.workingCtx.drawImage(this.layer.canvas, 0, 0);   // never tiled (1.62.5)
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
  private dualAspect: { x: number; y: number } = { x: 1, y: 1 };
  private dualLast: Pt | null = null;
  private dualCarry = 0;
  private dir0: number | null = null;
  private fadeLen = 100;
  private curPressure = 1;
  private strokeRgb: [number, number, number] | null = null;
  private poseOv: BrushShape['pose'] | null = null;

  /** Installs a Brush Settings shape: its spacing (a percentage of the diameter, where set), the dual brush's round tip,
   *  and the texture as a tile whose alpha is what it cuts from the paint (darker pattern, more; scaled by Depth). */
  setShape(shape: BrushShape | null, pattern: Surface | null): void {
    if (shape && (shape.wetEdges || shapeActive(shape))) this.toFull();   // their surfaces are the layer's size (1.60.6)
    // Color Dynamics, Transfer, Noise and Wet Edges (1.50.1) apply to every brush, a plain round one too.
    if (shape) {
      this.colorDyn = shape.color?.on ? { ...shape.color } : null;
      this.transfer = shape.transfer?.on ? { ...shape.transfer } : null;
      this.poseOv = shape.pose?.on ? { ...shape.pose } : null;
      this.fadeLen = Math.max(1, shape.transfer?.fadeSteps ?? 100);
      if (shape.noise) this.tip = shapedTip(this.tip, true, false);
      // Wet Edges is the stroke's, not each dab's: overlapping dabs would fill a lighter centre back in (1.50.1's fault).
      if (shape.wetEdges) this.wetInner = takeSurface(this.raster.width, this.raster.height);
    }
    if (!shapeActive(shape) || !shape) return;
    this.shape = structuredClone(shape);
    if (shape.spacing !== null) this.spacing = Math.max(0.5, this.style.diameter * (shape.spacing / 100));
    const k = matScale(this.toLocal);
    if (shape.dual.on) {
      const white = { r: 255, g: 255, b: 255 }, own = shape.dual.source === 'main' && this.style.tip;
      this.dualPaint = takeSurface(this.raster.width, this.raster.height);
      this.dualTip = own ? sampledTip(shape.dual.diameter * k, own, white) : brushTip(shape.dual.diameter * k, shape.dual.hardness ?? 1, white);
      this.dualAspect = own ? this.tipAspect : { x: 1, y: 1 };
    }
    if (shape.texture.on && pattern) {
      const w = pattern.width, h = pattern.height, t = createSurface(w, h), c = ctxOf(t), src = ctxOf(pattern).getImageData(0, 0, w, h), out = c.createImageData(w, h), depth = shape.texture.depth / 100;
      const tx = shape.texture, gain = (tx.contrast ?? 0) >= 0 ? 1 / (1 - 0.99 * ((tx.contrast ?? 0) / 100)) : 1 + (tx.contrast ?? 0) / 100, lift = (tx.brightness ?? 0) / 100;
      for (let i = 0; i < src.data.length; i += 4) {
        let lum = (0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) / 255;
        lum = Math.min(1, Math.max(0, (lum - 0.5) * gain + 0.5 + lift));
        out.data[i + 3] = Math.round(255 * depth * (tx.invert ? lum : 1 - lum));
      }
      c.putImageData(out, 0, 0);
      this.textureTile = t;
    }
  }

  /** Extends the stroke to `p` (document units): the first point lays a dab, later ones lay dabs every `spacing` along
   *  the way, the distance since the last dab carried into the next move. `pressure` (0 to 1, 1 for a mouse) is
   *  interpolated along the way, so a pen's changes between samples are smooth; `pose` is the pen's tilt and rotation. */
  /** The Airbrush (1.50.4): a dab where the stroke is, so paint builds while the pointer rests. */
  stamp(pressure = 1): void {
    if (!this.last) return;
    if (this.poseOv?.usePressure) pressure = this.poseOv.pressure / 100;
    this.airbrushing = true;
    this.dab(this.last, Math.min(1, Math.max(0, pressure)));
    this.airbrushing = false;
  }

  /** The pen's pressure eased towards each new reading over a tenth of the diameter of travel, so the jumpy first and
   *  last readings of a stroke (a pen touching down, lifting off) move the line gradually; samples far apart, as a
   *  path's are, pass nearly as they are, and a mouse's constant 1 stays 1. */
  private smooth(pressure: number, travelled: number): number {
    const v = Math.min(1, Math.max(0, pressure));
    if (this.eased === null) { this.eased = v; return v; }
    this.eased += (v - this.eased) * (1 - Math.exp(-travelled / Math.max(2, this.style.diameter * 0.1)));
    return this.eased;
  }

  to(p: Pt, pressure = 1, pose: PenPose = UPRIGHT): void {
    const ov = this.poseOv;
    if (ov) { pose = { tiltX: ov.tiltX, tiltY: ov.tiltY, twist: ov.rotation }; if (ov.usePressure) pressure = ov.pressure / 100; }
    const from = this.last, pr = this.smooth(pressure, from ? Math.hypot(p.x - from.x, p.y - from.y) : 0);
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
    this.dir0 ??= this.dir;
    let along = this.spacing - this.carry;
    for (; along <= length; along += this.spacing) this.dab({ x: from.x + (dx * along) / length, y: from.y + (dy * along) / length }, this.lastPressure + ((pr - this.lastPressure) * along) / length);
    this.carry = length - (along - this.spacing);
    this.last = p;
    this.lastPressure = pr;
  }

  /** Painting symmetry: every dab is repeated at the points symmetryPoints gives; null paints as before. */
  symmetry: BrushSymmetry | null = null;

  private dab(p: Pt, pressure = 1): void {
    this.dabAt(p, pressure);
    if (this.symmetry) for (const q of symmetryPoints(p, this.symmetry)) this.dabAt(q, pressure);
    this.steps += 1;
  }

  private dabAt(p: Pt, pressure: number): void {
    this.curPressure = pressure;
    if (this.style.aliased) this.aliasedDab(p, pressure);
    else if (this.shape) this.shapedDab(p, pressure);
    else this.plainDab(p, pressure);
  }

  private infoFor(pressure: number): { pressure: number; fade: number } { return { pressure, fade: this.steps }; }

  /** What one dab adds under the full tip, from Flow and the spacing, so Flow lays the same build-up per quarter of the
   *  diameter of travel at any spacing: 1 - (1 - flow) ^ (spacing / quarter diameter). The Airbrush's rest dabs count
   *  as a quarter diameter each. */
  private dabAlpha(flow: number): number {
    const f = Math.min(1, Math.max(0, flow));
    if (f >= 1) return 1;
    return 1 - Math.pow(1 - f, this.airbrushing ? 1 : this.spacing / Math.max(0.5, this.style.diameter / 4));
  }

  /** The opacity this dab reaches, 0 to 255: the stroke's Opacity, times the Opacity control's pressure or fade. */
  private opacityOf(info: { pressure: number; fade: number }): number {
    const d = this.dynamics;
    return levelOf(this.style.opacity * (d ? computeOption(d.opacity, info) : 1));
  }

  private tipAlphaOf(): TipAlpha {
    if (!this.tipA) this.tipA = TipAlpha.of(ctxOf(this.tip).getImageData(0, 0, this.tip.width, this.tip.height));
    return this.tipA;
  }

  private get varied(): boolean { return !!this.style.dabColor || !!this.colorDyn; }

  private inkCtx(): Ctx2D {
    this.ink ??= takeSurface(this.ww, this.wh);
    return ctxOf(this.ink);
  }

  private plainDab(p: Pt, pressure: number): void {
    const d = this.dynamics, info = this.infoFor(pressure), r = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1) * this.transferAlpha(pressure);
    // Its bounds first, so a windowed stroke's window can grow to hold it before it is laid (1.60.6).
    const corners = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([ox, oy]) => applyMat(this.toLocal, p.x + ox, p.y + oy));
    const box = integral(boundsOf(corners));
    const hit = intersectRect({ x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (!hit) { this.dabTip(p.x, p.y); return; }   // off the layer: its tip still taken, so Color Dynamics' sequence holds
    if (!this.ensure(hit)) return;
    if (d?.opacity?.enabled) this.buf.useCeil();
    const rx = r * this.tipAspect.x, ry = r * this.tipAspect.y, tip = this.tipAlphaOf();
    this.buf.lay(tip, mul(this.toWin, [(2 * rx) / tip.w, 0, 0, (2 * ry) / tip.h, p.x - rx, p.y - ry]), this.dabAlpha(flow), this.opacityOf(info));
    if (this.varied) {
      const c = this.inkCtx();
      setMat(c, this.toWin);
      c.globalAlpha = Math.min(1, Math.max(0.35, flow));
      c.drawImage(this.dabTip(p.x, p.y), p.x - rx, p.y - ry, rx * 2, ry * 2);
      c.globalAlpha = 1;
    }
    this.wetMark(this.toWin, p.x, p.y, rx, ry);
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
    else if (t.control === 'fade') k *= 1 - Math.min(1, this.steps / this.fadeLen);
    else if (t.control === 'tilt') k *= 1 - Math.min(90, Math.hypot(this.pose.tiltX, this.pose.tiltY)) / 90;
    else if (t.control === 'rotation') k *= 1 - (((this.pose.twist % 360) + 360) % 360) / 360;
    return Math.max(0, k);
  }

  /** The tip for this dab: from the style's colour source when it has one (the Mixer Brush, 1.56.2), else coloured by
   *  Color Dynamics (towards the background, hue, saturation and brightness varied), else the stroke's own. */
  private dabTip(x = NaN, y = NaN): Surface {
    const own = this.style.dabColor && !Number.isNaN(x) ? this.style.dabColor(x, y) : null;
    if (own) return this.tinted(own.r, own.g, own.b);
    const cd = this.colorDyn;
    if (!cd) return this.tip;
    if (cd.perTip === false && this.strokeRgb) return this.tinted(...this.strokeRgb);
    const fg = this.style.color, bg = this.style.bg ?? fg, ctl = cd.fgBgControl ?? 'off';
    const t = ctl === 'pressure' ? (1 - this.curPressure) * (cd.fgBg / 100) : ctl === 'fade' ? Math.min(1, this.steps / this.fadeLen) * (cd.fgBg / 100) : Math.random() * (cd.fgBg / 100);
    let [h, sat, v] = toHsv(fg.r + (bg.r - fg.r) * t, fg.g + (bg.g - fg.g) * t, fg.b + (bg.b - fg.b) * t);
    h = (h + (Math.random() * 2 - 1) * (cd.hue / 100) * 0.5 + 1) % 1;
    sat = Math.max(0, Math.min(1, sat + (Math.random() * 2 - 1) * (cd.saturation / 100)));
    const purity = (cd.purity ?? 0) / 100;
    sat = Math.max(0, Math.min(1, purity >= 0 ? sat + (1 - sat) * purity : sat * (1 + purity)));
    v = Math.max(0, Math.min(1, v + (Math.random() * 2 - 1) * (cd.brightness / 100)));
    const [r, g, b] = fromHsv(h, sat, v);
    if (cd.perTip === false) this.strokeRgb = [r, g, b];
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
    const d = this.dynamics, info = this.infoFor(pressure), c = applyMat(this.toLocal, p.x, p.y);
    const r = Math.max(0.5, this.radius * matScale(this.toLocal) * (d ? Math.max(0.01, computeOption(d.size, info)) : 1));
    const cx = Math.floor(c.x) + 0.5, cy = Math.floor(c.y) + 0.5, rr = r <= 0.75 ? 0.5 : r;
    // Its bounds first, so a windowed stroke's window can hold it (1.60.6); drawn shifted by the window's whole-pixel origin.
    const pre = intersectRect({ x: Math.floor(cx - rr) - 1, y: Math.floor(cy - rr) - 1, w: Math.ceil(rr * 2) + 3, h: Math.ceil(rr * 2) + 3 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (pre && !this.ensure(pre)) return;
    if (d?.opacity?.enabled) this.buf.useCeil();
    const o = this.opacityOf(info), fill = (fx: number, fy: number, fw: number, fh: number): void => this.buf.fillRect(fx - this.ox, fy - this.oy, fw, fh, o);
    // The Eraser's Block (1.50.3, the tool audit): a pixel-exact square.
    // (In place of the circle, not returning early: the lines after it record the area the dab touched.)
    if (this.style.square) { const side = Math.max(1, Math.round(rr * 2)); fill(Math.round(cx - side / 2), Math.round(cy - side / 2), side, side); }
    else for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
      const dy = y + 0.5 - cy, half = rr * rr - dy * dy;
      if (half < 0) continue;
      const w = Math.sqrt(half), x0 = Math.round(cx - w), x1 = Math.round(cx + w);
      if (x1 > x0) fill(x0, y, x1 - x0, 1);
      else if (rr <= 0.5) fill(Math.floor(cx), y, 1, 1);
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
    const sh = this.shape as BrushShape, d = this.dynamics, info = this.infoFor(pressure), rnd = this.rnd, pose = this.pose;
    const base = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1) * this.transferAlpha(pressure);
    if (d?.opacity?.enabled) this.buf.useCeil();
    const tip = this.tipAlphaOf(), alpha = this.dabAlpha(flow), reached = this.opacityOf(info);
    const tilt = Math.min(90, Math.hypot(pose.tiltX, pose.tiltY)), count = Math.max(1, Math.round(sh.count * (1 - (sh.countJitter / 100) * rnd())));
    const across = ((this.dir + 90) * Math.PI) / 180, varied = sh.roundnessJitter > 0 || sh.roundnessControl !== 'off' || !!sh.projection;
    for (let k = 0; k < count; k++) {
      let sizeK = 1 - (sh.sizeJitter / 100) * rnd();
      const sctl = sh.sizeControl ?? 'off';
      if (sctl === 'pressure') sizeK *= Math.max(0, Math.min(1, pressure));
      else if (sctl === 'fade') sizeK *= 1 - Math.min(1, this.steps / this.fadeLen);
      else if (sctl === 'tilt') sizeK *= 1 - Math.min(1, (tilt * (sh.tiltScale ?? 100)) / 9000);
      else if (sctl === 'rotation') sizeK *= 1 - (((pose.twist % 360) + 360) % 360) / 360;
      const r = base * Math.max((sh.minDiameter ?? 0) / 100, sizeK);
      let angle = sh.angle;
      if (sh.angleControl === 'direction') angle += this.dir;
      else if (sh.angleControl === 'tilt') angle += (Math.atan2(pose.tiltY, pose.tiltX) * 180) / Math.PI;
      else if (sh.angleControl === 'rotation') angle += pose.twist;
      else if (sh.angleControl === 'initial') angle += this.dir0 ?? this.dir;
      else if (sh.angleControl === 'fade') angle += Math.min(1, this.steps / this.fadeLen) * 360;
      angle += (rnd() * 2 - 1) * (sh.angleJitter / 100) * 180;
      let round = sh.roundness / 100;
      if (sh.roundnessControl === 'tilt') round *= 1 - tilt / 90;
      else if (sh.roundnessControl === 'rotation') round *= 1 - (((pose.twist % 360) + 360) % 360) / 360;
      else if (sh.roundnessControl === 'fade') round *= 1 - Math.min(1, this.steps / this.fadeLen);
      round *= 1 - (sh.roundnessJitter / 100) * rnd();
      if (sh.projection && tilt > 0) { angle += (Math.atan2(pose.tiltY, pose.tiltX) * 180) / Math.PI; round *= 1 - 0.75 * (tilt / 90); }
      if (varied) round = Math.max(sh.minRoundness / 100, round);
      round = Math.max(0.01, Math.min(1, round));
      const sc = sh.scatterControl ?? 'off', spread = (sh.scatter / 100) * base * 2 * (sc === 'pressure' ? Math.max(0, Math.min(1, pressure)) : sc === 'fade' ? 1 - Math.min(1, this.steps / this.fadeLen) : 1);
      let x = p.x, y = p.y;
      if (spread > 0) {
        if (sh.bothAxes) { x += (rnd() * 2 - 1) * spread; y += (rnd() * 2 - 1) * spread; }
        else { const t = (rnd() * 2 - 1) * spread; x += Math.cos(across) * t; y += Math.sin(across) * t; }
      }
      const a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), place = mul(this.toLocal, [ca, sa, -sa, ca, x, y]);
      const fx = (sh.flipX ? -1 : 1) * (sh.flipXJitter && rnd() < 0.5 ? -1 : 1), fy = (sh.flipY ? -1 : 1) * (sh.flipYJitter && rnd() < 0.5 ? -1 : 1);
      const at = mul(place, [fx, 0, 0, fy * round, 0, 0]), rx = r * this.tipAspect.x, ry = r * this.tipAspect.y;
      this.buf.lay(tip, mul(at, [(2 * rx) / tip.w, 0, 0, (2 * ry) / tip.h, -rx, -ry]), alpha, reached);
      if (this.varied) {
        const c = this.inkCtx();
        setMat(c, at);
        c.globalAlpha = Math.min(1, Math.max(0.35, flow));
        c.drawImage(this.dabTip(x, y), -rx, -ry, rx * 2, ry * 2);
        c.globalAlpha = 1;
      }
      this.wetMark(at, 0, 0, rx, ry);
      if (this.dualPaint && this.dualTip) {
        if (!sh.dual.spacing) this.layDual(x, y);
        else if (k === 0) this.walkDual(p);
      }
      const reach = r + (sh.dual.on ? (sh.dual.scatter / 100) * sh.dual.diameter + sh.dual.diameter : 0);
      const corners = [[-reach, -reach], [reach, -reach], [reach, reach], [-reach, reach]].map(([ox, oy]) => applyMat(this.toLocal, x + ox, y + oy));
      const box = integral(boundsOf(corners));
      const hit = intersectRect({ x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
      if (hit) { this.pending = unionRect(this.pending, hit); this.touched = unionRect(this.touched, hit); }
    }
  }

  /** The dual brush's marks at (x, y): Count of them, each scattered by the dual brush's own Scatter, turned to its angle,
   *  squeezed to its roundness and flipped, drawn white into the dual layer. */
  private layDual(x: number, y: number): void {
    const du = (this.shape as BrushShape).dual, dc = ctxOf(this.dualPaint as Surface), dr = Math.max(0.5, du.diameter / 2), ds = (du.scatter / 100) * dr * 2, rnd = this.rnd;
    const round = Math.max(0.01, Math.min(1, (du.roundness ?? 100) / 100)), a = (((du.angle ?? 0) % 360) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const rw = dr * this.dualAspect.x, rh = dr * this.dualAspect.y;
    for (let j = 0; j < Math.max(1, du.count); j++) {
      const ox = (rnd() * 2 - 1) * ds, oy = (rnd() * 2 - 1) * ds;
      setMat(dc, mul(mul(this.toLocal, [ca, sa, -sa, ca, x + ox, y + oy]), [du.flipX ? -1 : 1, 0, 0, du.flipY ? -round : round, 0, 0]));
      dc.drawImage(this.dualTip as Surface, -rw, -rh, rw * 2, rh * 2);
    }
  }

  /** With the dual brush's own Spacing: marks laid along the stroke every Spacing percent of its size, the distance since
   *  the last carried into the next dab; a jump (a mirrored copy, a new stroke) starts a fresh run. */
  private walkDual(p: Pt): void {
    const du = (this.shape as BrushShape).dual, step = Math.max(0.5, du.diameter * ((du.spacing as number) / 100)), from = this.dualLast;
    if (!from || Math.hypot(p.x - from.x, p.y - from.y) > this.spacing * 1.5 + 1) { this.layDual(p.x, p.y); this.dualLast = p; this.dualCarry = 0; return; }
    const dx = p.x - from.x, dy = p.y - from.y, len = Math.hypot(dx, dy);
    let along = step - this.dualCarry;
    if (len > 0) for (; along <= len; along += step) this.layDual(from.x + (dx * along) / len, from.y + (dy * along) / len);
    this.dualCarry = len > 0 ? len - (along - step) : this.dualCarry;
    this.dualLast = p;
  }

  /** The paint layer's pixels over `win` replaced by `img`, put through a small canvas: putImageData straight into a
   *  large canvas costs about as much as the canvas is big, a draw of a small one does not. */
  private writePaint(win: Rect, img: ImageData): void {
    if (!scratch || scratch.width < win.w || scratch.height < win.h) scratch = createSurface(Math.max(win.w, scratch?.width ?? 0), Math.max(win.h, scratch?.height ?? 0));
    ctxOf(scratch).putImageData(img, 0, 0);
    const c = this.paintCtx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(win.x, win.y, win.w, win.h);
    c.drawImage(scratch, 0, 0, win.w, win.h, win.x, win.y, win.w, win.h);
    c.restore();
  }

  /** Brings the working copy up to date where dabs landed since the last call; returns that area, or null. */
  compose(): Rect | null {
    const area = this.pending;
    this.pending = null;
    if (!area) return null;
    const win: Rect = { x: area.x - this.ox, y: area.y - this.oy, w: area.w, h: area.h };   // in the window's pixels (1.60.6)
    const ink = this.ink ? ctxOf(this.ink).getImageData(win.x, win.y, win.w, win.h).data : null;
    this.writePaint(win, this.buf.paintRegion(win, this.style.color, this.style.opacity, ink));
    // Coverage: the paint layer, shaped by the dual brush (kept only where its marks fell) and the texture (its tile's
    // alpha cut out, tiled at Scale in document space), then cut to the selection when there is one.
    let coverage: Surface = this.paint;
    if (this.dualPaint || this.textureTile || this.wetInner) {
      this.shaped ??= takeSurface(this.ww, this.wh);
      const c = ctxOf(this.shaped);
      openFrame(c, win);
      c.drawImage(this.paint, 0, 0);
      if (this.dualPaint) { c.globalCompositeOperation = this.shape?.dual.mode === 'subtract' ? 'destination-out' : 'destination-in'; c.drawImage(this.dualPaint, 0, 0); }
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
    if (this.orig) w.drawImage(this.orig, lx - this.ox, ly - this.oy, aw, ah, x, y, aw, ah);   // a tiled layer's, kept (1.62.5)
    else w.drawImage((this.raster as Raster).canvas, lx, ly, aw, ah, x, y, aw, ah);
    if (this.lerp) {
      // An alpha-coded mask (white, its level in alpha) should move toward the paint: out = old (1 - c) + paint c. Cut
      // the old value by the coverage, then add the paint already scaled by it ('lighter' adds premultiplied white,
      // which is adding alpha).
      w.globalCompositeOperation = 'destination-out';
      w.drawImage(coverage, x, y, aw, ah, x, y, aw, ah);
      w.globalCompositeOperation = 'lighter';
    } else w.globalCompositeOperation = this.op;
    if (this.pixelBlend && !this.lerp) {
      const lc = ctxOf(laid), dst = w.getImageData(x, y, aw, ah), src = lc.getImageData(x, y, aw, ah);
      blendPixels(dst.data, src.data, this.pixelBlend, 1, (i) => [lx + (i % aw), ly + Math.floor(i / aw)]);
      w.putImageData(dst, x, y);
    } else w.drawImage(laid, x, y, aw, ah, x, y, aw, ah);
    w.restore();
    return area;
  }

  /** The stroke's coverage per layer pixel, 0 to 255, cut to the selection. */
  coverageAlpha(): Uint8Array {
    const w = this.raster.width, h = this.raster.height, s = createSurface(w, h), c = ctxOf(s);
    c.putImageData(this.buf.coverImage(), this.ox, this.oy);   // the window's coverage at its place (1.60.6)
    if (this.selection) {
      c.globalCompositeOperation = 'destination-in';
      setMat(c, mul(this.toLocal, translation(this.selection.x, this.selection.y)));
      c.drawImage(this.selection.surface(), 0, 0);
    }
    const d = c.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
    for (let p = 0; p < out.length; p++) out[p] = d[p * 4 + 3];
    return out;
  }

  /** The alpha the stroke laid (coverage cut to opacity, 0 to 1) over the layer rectangle x, y, w, h, for the 16-bit
   *  rebuild; null when anything else shaped the paint (a shape, texture, selection, mask, varied colour, blend mode). */
  coverFor(x: number, y: number, w: number, h: number): Float32Array | null {
    if (this.shape || this.texture || this.selection || this.lerp || this.tiled || this.wetInner || this.varied || this.pixelBlend || (this.op !== 'source-over' && this.op !== 'destination-out')) return null;
    const b = this.buf, out = new Float32Array(w * h), top = levelOf(this.style.opacity) / 255;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const p = (y + j - this.oy) * b.w + (x + i - this.ox), c = b.cov[p], lim = b.ceil ? b.ceil[p] / 255 : top;
        out[j * w + i] = c < lim ? c : lim;
      }
    }
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
    giveSurface(this.ink);
    this.ink = null;
    this.buf = new StrokeBuffer(1, 1);
    this.tipA = null;
    drop(scratch ?? undefined);
    scratch = null;
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
    if (this.tiled && this.orig) {   // into the tiles (1.62.5): before from the kept originals, after from the window
      const T = 512, out: PixelPatch[] = [], oc = ctxOf(this.orig);
      for (let ty = Math.floor(area.y / T) * T; ty < area.y + area.h; ty += T) {
        for (let tx = Math.floor(area.x / T) * T; tx < area.x + area.w; tx += T) {
          const x = Math.max(tx, area.x), y = Math.max(ty, area.y), w = Math.min(tx + T, area.x + area.w) - x, h = Math.min(ty + T, area.y + area.h) - y;
          if (w <= 0 || h <= 0) continue;
          const before = oc.getImageData(x - this.ox, y - this.oy, w, h), after = this.workingCtx.getImageData(x - this.ox, y - this.oy, w, h);
          if (sameBytes(before.data, after.data)) continue;
          this.tiled.write(after, x, y);
          out.push({ raster: this.tiled, x, y, before, after });
        }
      }
      return out;
    }
    const T = 512, out: PixelPatch[] = [], c = (this.raster as Raster).ctx;
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
    if (this.tiled) throw new Error('A stroke on a layer kept in tiles commits by tiles.');   // (1.62.5)
    const before = this.raster.read(area.x, area.y, area.w, area.h);
    const c = (this.raster as Raster).ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(area.x, area.y, area.w, area.h);
    c.drawImage(this.working, area.x - this.ox, area.y - this.oy, area.w, area.h, area.x, area.y, area.w, area.h);   // from the window (1.60.6)
    c.restore();
    (this.raster as Raster).touch();
    return { raster: this.raster, x: area.x, y: area.y, before, after: this.raster.read(area.x, area.y, area.w, area.h) };
  }
}

/** Whether two pixel buffers hold the same bytes (four at a time; 1.60.7, for undo tiles). */
export function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  const n = a.length >> 2, A = new Uint32Array(a.buffer, a.byteOffset, n), B = new Uint32Array(b.buffer, b.byteOffset, n);
  for (let i = 0; i < n; i++) if (A[i] !== B[i]) return false;
  for (let i = n << 2; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The tip with Noise (its soft edge roughened) and Wet Edges (its centre lighter than its rim). */
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

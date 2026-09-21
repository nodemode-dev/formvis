import { applyMat, boundsOf, integral, intersectRect, invert, matScale, mul, setMat, translation, unionRect, type Mat } from './geometry';
import { createSurface, ctxOf, type Ctx2D, type Raster, type Surface } from './surface';
import type { SelectionMask } from './selection';
import type { PixelPatch } from './history';
import type { Pt, Rect, RGB } from './types';

/** Painting strokes for sonny. Dabs of a round brush tip are laid along the pointer's path into a separate paint
 *  layer, evenly spaced and carried over between moves; composing lays that layer onto a working copy of the pixels at
 *  the stroke's opacity, so overlapping dabs within one stroke never build past it. A selection limits where paint
 *  lands, a texture (Clone Stamp's source) can stand in for the brush colour, and on an alpha-coded mask the value
 *  under the brush moves toward the paint rather than only gaining coverage. */

export interface StrokeStyle { diameter: number; hardness: number; opacity: number; color: RGB }

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
  private readonly spacing: number;
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
    // Dabs every 1.5% of the diameter for a hard tip and 2.5% for a soft one.
    this.spacing = Math.max(0.5, style.diameter * (style.hardness >= 0.99 ? 0.015 : 0.025));
    this.tip = brushTip(style.diameter * matScale(this.toLocal), style.hardness, style.color);
  }

  get lastPoint(): Pt | null { return this.last; }

  /** Extends the stroke to `p` (document units): the first point lays a dab, later ones lay dabs every `spacing` along
   *  the way, the distance since the last dab carried into the next move. */
  to(p: Pt): void {
    const from = this.last;
    if (!from) { this.dab(p); this.last = p; this.carry = 0; return; }
    const dx = p.x - from.x, dy = p.y - from.y, length = Math.hypot(dx, dy);
    if (length === 0) return;
    let along = this.spacing - this.carry;
    for (; along <= length; along += this.spacing) this.dab({ x: from.x + (dx * along) / length, y: from.y + (dy * along) / length });
    this.carry = length - (along - this.spacing);
    this.last = p;
  }

  private dab(p: Pt): void {
    const r = this.radius;
    setMat(this.paintCtx, this.toLocal);
    this.paintCtx.drawImage(this.tip, p.x - r, p.y - r, r * 2, r * 2);
    const corners = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([ox, oy]) => applyMat(this.toLocal, p.x + ox, p.y + oy));
    const box = integral(boundsOf(corners));
    const hit = intersectRect({ x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (!hit) return;
    this.pending = unionRect(this.pending, hit);
    this.touched = unionRect(this.touched, hit);
  }

  /** Brings the working copy up to date where dabs landed since the last call; returns that area, or null. */
  compose(): Rect | null {
    const area = this.pending;
    this.pending = null;
    if (!area) return null;
    // Coverage: the paint layer, cut to the selection when there is one.
    let coverage: Surface = this.paint;
    if (this.masked && this.selection) {
      const c = ctxOf(this.masked);
      openFrame(c, area);
      c.drawImage(this.paint, 0, 0);
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

import { applyMat, boundsOf, integral, intersectRect, invert, matScale, mul, setMat, translation, unionRect, type Mat } from './geometry';
import { createSurface, ctxOf, type Ctx2D, type Raster, type Surface } from './surface';
import type { SelectionMask } from './selection';
import type { PixelPatch } from './history';
import type { Pt, Rect, RGB } from './types';

export interface StrokeStyle { diameter: number; hardness: number; opacity: number; color: RGB }

function makeStamp(sizePx: number, hardness: number, color: RGB): Surface {
  const size = Math.max(2, Math.ceil(sizePx));
  const s = createSurface(size, size);
  const c = ctxOf(s);
  const r = size / 2;
  const g = c.createRadialGradient(r, r, 0, r, r, r);
  const rgb = `${color.r},${color.g},${color.b}`;
  if (hardness >= 0.99) {
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(Math.max(0, 1 - 1.5 / r), `rgba(${rgb},1)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
  } else {
    const h = Math.max(0, hardness);
    g.addColorStop(0, `rgba(${rgb},1)`);
    if (h > 0) g.addColorStop(h, `rgba(${rgb},1)`);
    for (let k = 1; k <= 8; k++) {
      const u = k / 8;
      g.addColorStop(h + (1 - h) * u, `rgba(${rgb},${(0.5 + 0.5 * Math.cos(Math.PI * u)).toFixed(4)})`);
    }
  }
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return s;
}

export class PixelStroke {
  readonly working: Surface;
  private readonly wctx: Ctx2D;
  private readonly paint: Surface;
  private readonly pctx: Ctx2D;
  private readonly temp: Surface | null;
  private readonly stamp: Surface;
  private readonly toLocal: Mat;
  private readonly radius: number;
  private readonly spacing: number;
  private last: Pt | null = null;
  private carry = 0;
  private total: Rect | null = null;
  private frame: Rect | null = null;
  private texSurface: Surface | null = null;

  constructor(readonly raster: Raster, localToDoc: Mat, readonly style: StrokeStyle, readonly op: GlobalCompositeOperation, private readonly selection: SelectionMask | null, private readonly texture: { surface: Surface; dx: number; dy: number } | null = null) {
    this.toLocal = invert(localToDoc);
    this.working = createSurface(raster.width, raster.height);
    this.wctx = ctxOf(this.working);
    this.wctx.drawImage(raster.canvas, 0, 0);
    this.paint = createSurface(raster.width, raster.height);
    this.pctx = ctxOf(this.paint);
    this.temp = selection ? createSurface(raster.width, raster.height) : null;
    this.radius = Math.max(0.5, style.diameter / 2);
    this.spacing = Math.max(0.5, style.diameter * (style.hardness >= 0.99 ? 0.015 : 0.025));
    this.stamp = makeStamp(style.diameter * matScale(this.toLocal), style.hardness, style.color);
  }

  get lastPoint(): Pt | null { return this.last; }

  to(p: Pt): void {
    if (!this.last) { this.dab(p); this.last = p; this.carry = 0; return; }
    const dx = p.x - this.last.x, dy = p.y - this.last.y, dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    let d = this.spacing - this.carry;
    while (d <= dist) {
      this.dab({ x: this.last.x + (dx * d) / dist, y: this.last.y + (dy * d) / dist });
      d += this.spacing;
    }
    this.carry = dist - (d - this.spacing);
    this.last = p;
  }

  private dab(p: Pt): void {
    const r = this.radius;
    setMat(this.pctx, this.toLocal);
    this.pctx.drawImage(this.stamp, p.x - r, p.y - r, r * 2, r * 2);
    const box = integral(boundsOf([
      applyMat(this.toLocal, p.x - r, p.y - r), applyMat(this.toLocal, p.x + r, p.y - r),
      applyMat(this.toLocal, p.x + r, p.y + r), applyMat(this.toLocal, p.x - r, p.y + r),
    ]));
    const clipped = intersectRect({ x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (!clipped) return;
    this.frame = unionRect(this.frame, clipped);
    this.total = unionRect(this.total, clipped);
  }

  compose(): Rect | null {
    const f = this.frame;
    this.frame = null;
    if (!f) return null;
    let src: Surface = this.paint;
    if (this.temp && this.selection) {
      const t = ctxOf(this.temp);
      t.save();
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.beginPath();
      t.rect(f.x, f.y, f.w, f.h);
      t.clip();
      t.clearRect(f.x, f.y, f.w, f.h);
      t.drawImage(this.paint, 0, 0);
      t.globalCompositeOperation = 'destination-in';
      setMat(t, mul(this.toLocal, translation(this.selection.x, this.selection.y)));
      t.drawImage(this.selection.surface(), 0, 0);
      t.restore();
      src = this.temp;
    }
    if (this.texture) {
      this.texSurface ??= createSurface(this.raster.width, this.raster.height);
      const t = ctxOf(this.texSurface);
      t.save();
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.beginPath();
      t.rect(f.x, f.y, f.w, f.h);
      t.clip();
      t.clearRect(f.x, f.y, f.w, f.h);
      setMat(t, mul(this.toLocal, translation(-this.texture.dx, -this.texture.dy)));
      t.drawImage(this.texture.surface, 0, 0);
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(src, 0, 0);
      t.restore();
      src = this.texSurface;
    }
    const w = this.wctx;
    w.save();
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.clearRect(f.x, f.y, f.w, f.h);
    w.drawImage(this.raster.canvas, f.x, f.y, f.w, f.h, f.x, f.y, f.w, f.h);
    w.globalAlpha = this.style.opacity;
    w.globalCompositeOperation = this.op;
    w.drawImage(src, f.x, f.y, f.w, f.h, f.x, f.y, f.w, f.h);
    w.restore();
    return f;
  }

  coverageAlpha(): Uint8Array {
    const w = this.raster.width, h = this.raster.height;
    const s = createSurface(w, h);
    const c = ctxOf(s);
    c.drawImage(this.paint, 0, 0);
    if (this.selection) {
      c.globalCompositeOperation = 'destination-in';
      setMat(c, mul(this.toLocal, translation(this.selection.x, this.selection.y)));
      c.drawImage(this.selection.surface(), 0, 0);
    }
    const d = c.getImageData(0, 0, w, h).data;
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
    return out;
  }

  commit(): PixelPatch | null {
    this.compose();
    const r = this.total;
    if (!r) return null;
    const before = this.raster.read(r.x, r.y, r.w, r.h);
    const c = this.raster.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(r.x, r.y, r.w, r.h);
    c.drawImage(this.working, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    c.restore();
    this.raster.touch();
    return { raster: this.raster, x: r.x, y: r.y, before, after: this.raster.read(r.x, r.y, r.w, r.h) };
  }
}

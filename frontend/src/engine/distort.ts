import { unitPoint } from './geometry';
import { Raster } from './surface';
import type { Pt, Rect, Transform } from './types';

/** the reference app's DistortWarp.corners: a transform's corners in handle order: top-left, top-right, bottom-right,
 *  bottom-left. */
export const cornersOf = (t: Transform): Pt[] => [unitPoint(t, 0, 0), unitPoint(t, 1, 0), unitPoint(t, 1, 1), unitPoint(t, 0, 1)];

/** the reference app's DistortWarp.isUsable: four finite corners making a convex, non-degenerate shape. A twisted (bow-tie)
 *  or collapsed shape has no sensible warp and is refused. */
export function distortUsable(c: readonly Pt[]): boolean {
  if (c.length !== 4 || !c.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6)) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], d = c[(i + 2) % 4];
    const cross = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    if (Math.abs(cross) <= 0.01) return false;
    if (sign === 0) sign = cross < 0 ? -1 : 1;
    else if (cross < 0 !== sign < 0) return false;
  }
  return true;
}

/** the reference app's DistortWarp.homography: the perspective mapping of the unit square (corners in handle order) onto
 *  `c`, as the row-major 3x3 matrix [a b x0; d e y0; g h 1]. */
export function homography(c: readonly Pt[]): number[] {
  const sx = c[0].x - c[1].x + c[2].x - c[3].x, sy = c[0].y - c[1].y + c[2].y - c[3].y;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const dx1 = c[1].x - c[2].x, dx2 = c[3].x - c[2].x, dy1 = c[1].y - c[2].y, dy2 = c[3].y - c[2].y;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-12) { g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
  }
  return [c[1].x - c[0].x + g * c[1].x, c[3].x - c[0].x + h * c[3].x, c[0].x, c[1].y - c[0].y + g * c[1].y, c[3].y - c[0].y + h * c[3].y, c[0].y, g, h, 1];
}

/** Where a unit point lands under a homography matrix. */
export function project(m: readonly number[], x: number, y: number): Pt {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/** A document point in a box's own unit frame (0 to 1 across its unflipped width and height). */
function boxUnit(box: Transform, p: Pt): Pt {
  const o = unitPoint(box, 0, 0), a = unitPoint(box, 1, 0), b = unitPoint(box, 0, 1);
  const ex = a.x - o.x, ey = a.y - o.y, fx = b.x - o.x, fy = b.y - o.y, dx = p.x - o.x, dy = p.y - o.y, det = ex * fy - ey * fx;
  return { x: (dx * fy - dy * fx) / det, y: (ex * dy - ey * dx) / det };
}

/** the reference app's DistortWarp.carried: where `inner`'s corners (handle order) land when the perspective taking `box`'s
 *  corners to `quad` is applied around it too; how group members and masks placed apart distort with the box. */
export function carried(inner: Transform, box: Transform, quad: readonly Pt[]): Pt[] {
  const H = homography(quad);
  return cornersOf(inner).map((c) => { const u = boxUnit(box, c); return project(H, u.x, u.y); });
}

function invert3(m: readonly number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** the reference app's imageCorners: a flipped layer shows its pixels mirrored, so they go to the opposite corners. */
function imageQuad(c: readonly Pt[], flipX: boolean, flipY: boolean): Pt[] {
  const at = (x: number, y: number): Pt => c[[0, 1, 3, 2][(flipY ? 1 - y : y) * 2 + (flipX ? 1 - x : x)]];
  return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
}

export interface Warped { raster: Raster; t: Transform }

/** the reference app's DistortWarp.warp: `src`, shown through `t`, resampled so its corners land on `quad`, over the quad's
 *  whole-pixel bounds with an upright transform. Premultiplied bilinear, edges clamped; `scale` below 1 renders a
 *  smaller preview of the same bounds. A mask is opaque gray with `background` (0 black, hidden) outside the shape. */
export function warpRaster(src: Raster, t: Transform, quad: readonly Pt[], scale = 1, mask = false, background = 0): Warped | null {
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)), y0 = Math.floor(Math.min(...ys));
  const W = Math.ceil(Math.max(...xs)) - x0, H = Math.ceil(Math.max(...ys)) - y0;
  const inv = invert3(homography(imageQuad(quad, t.flipX, t.flipY)));
  if (W < 1 || H < 1 || !inv) return null;
  const ow = Math.max(1, Math.round(W * scale)), oh = Math.max(1, Math.round(H * scale));
  const sw = src.width, sh = src.height, sd = src.ctx.getImageData(0, 0, sw, sh).data;
  const out = new ImageData(ow, oh), od = out.data;
  if (mask) for (let k = 0; k < od.length; k += 4) { od[k] = od[k + 1] = od[k + 2] = background; od[k + 3] = 255; }
  for (let j = 0; j < oh; j++) {
    const Y = y0 + ((j + 0.5) * H) / oh;
    for (let i = 0; i < ow; i++) {
      const X = x0 + ((i + 0.5) * W) / ow;
      const w = inv[6] * X + inv[7] * Y + inv[8];
      const u = (inv[0] * X + inv[1] * Y + inv[2]) / w, v = (inv[3] * X + inv[4] * Y + inv[5]) / w;
      if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) continue;
      const fx = u * sw - 0.5, fy = v * sh - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      let r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < 4; q++) {
        const wt = (q & 1 ? tx : 1 - tx) * (q & 2 ? ty : 1 - ty);
        if (!wt) continue;
        const px = Math.min(sw - 1, Math.max(0, ix + (q & 1))), py = Math.min(sh - 1, Math.max(0, iy + (q >> 1)));
        const o = (py * sw + px) * 4, al = mask ? 255 : sd[o + 3], k = wt * al;
        r += sd[o] * k; g += sd[o + 1] * k; b += sd[o + 2] * k; a += k;
      }
      const o = (j * ow + i) * 4;
      if (a > 0) { od[o] = Math.round(r / a); od[o + 1] = Math.round(g / a); od[o + 2] = Math.round(b / a); }
      od[o + 3] = mask ? 255 : Math.round(a);
    }
  }
  const raster = new Raster(ow, oh);
  raster.write(out);
  return { raster, t: { x: x0, y: y0, w: W, h: H, rotation: 0, flipX: false, flipY: false, sampling: t.sampling } };
}

/** The whole-pixel bounds of a full-resolution warp's visible pixels, in its own pixels (the reference app's warpTrimmed). */
export function visibleBounds(r: Raster): Rect | null {
  const d = r.ctx.getImageData(0, 0, r.width, r.height).data;
  let x0 = r.width, y0 = r.height, x1 = -1, y1 = -1;
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    if (!d[(y * r.width + x) * 4 + 3]) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** A full-resolution warp cropped to `crop` (in its pixels), its transform moved to match. */
export function cropWarp(wp: Warped, crop: Rect): Warped {
  const raster = new Raster(crop.w, crop.h);
  raster.ctx.drawImage(wp.raster.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  raster.touch();
  return { raster, t: { ...wp.t, x: wp.t.x + crop.x, y: wp.t.y + crop.y, w: crop.w, h: crop.h } };
}

/** the reference app's LayerMask.background: a mask's tone past its own pixels, white (255) when its border averages light,
 *  else black (0). A mask placed apart from its layer shows it beyond its bounds. */
export function maskEdgeTone(r: Raster): number {
  const d = r.ctx.getImageData(0, 0, r.width, r.height).data;
  let sum = 0, n = 0;
  for (let x = 0; x < r.width; x++) { sum += d[x * 4] + d[((r.height - 1) * r.width + x) * 4]; n += 2; }
  for (let y = 1; y < r.height - 1; y++) { sum += d[y * r.width * 4] + d[(y * r.width + r.width - 1) * 4]; n += 2; }
  return n && sum / n >= 127.5 ? 255 : 0;
}

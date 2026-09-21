import { applyMat, invert, placement, unitPoint } from './geometry';
import { Raster } from './surface';
import type { Pt, Rect, Transform } from './types';

/** Four-corner (perspective) distortion for sonny: the projective map taking the unit square to a convex
 *  quadrilateral, solved from its four corner correspondences as eight linear equations (the direct linear
 *  transform), and resampling through its inverse with premultiplied bilinear filtering. */

const UNIT_CORNERS: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** A transform's corners in handle order: top-left, top-right, bottom-right, bottom-left. */
export const cornersOf = (t: Transform): Pt[] => UNIT_CORNERS.map(([u, v]) => unitPoint(t, u, v));

/** True for four finite corners, within a million units, that turn the same way at every corner by a clear margin:
 *  a convex shape that is neither twisted into a bow-tie nor collapsed. */
export function distortUsable(c: readonly Pt[]): boolean {
  if (c.length !== 4) return false;
  if (!c.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6)) return false;
  const turn = c.map((p, i) => {
    const q = c[(i + 1) % 4], r = c[(i + 2) % 4];
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  });
  return turn.every((z) => Math.abs(z) > 0.01) && (turn.every((z) => z > 0) || turn.every((z) => z < 0));
}

/** The projective map of the unit square onto `c` (handle order), as the row-major matrix [a b x0; d e y0; g h 1] with
 *  x = (a u + b v + x0) / (g u + h v + 1) and likewise y. Each corner gives two linear equations in the eight
 *  unknowns, solved by Gauss-Jordan elimination with partial pivoting; a degenerate set falls back to the affine map
 *  through the first, second and fourth corners. */
export function homography(c: readonly Pt[]): number[] {
  const rows: number[][] = [];
  UNIT_CORNERS.forEach(([u, v], k) => {
    const { x, y } = c[k];
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    if (!(Math.abs(rows[pivot][col]) > 1e-12)) return [c[1].x - c[0].x, c[3].x - c[0].x, c[0].x, c[1].y - c[0].y, c[3].y - c[0].y, c[0].y, 0, 0, 1];
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const lead = rows[col][col];
    for (let r = 0; r < 8; r++) {
      if (r === col || rows[r][col] === 0) continue;
      const f = rows[r][col] / lead;
      for (let k = col; k < 9; k++) rows[r][k] -= f * rows[col][k];
    }
  }
  const s = rows.map((row, i) => row[8] / row[i]);
  return [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1];
}

/** Where a unit point lands under a projective matrix. */
export function project(m: readonly number[], x: number, y: number): Pt {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/** Where `inner`'s corners (handle order) land when the perspective taking `box`'s corners to `quad` is applied around
 *  it too: each corner is read in the box's own unflipped unit frame, then projected. This is how group members and
 *  masks placed apart from their layer distort along with the box. */
export function carried(inner: Transform, box: Transform, quad: readonly Pt[]): Pt[] {
  const H = homography(quad), toUnit = invert(placement({ ...box, flipX: false, flipY: false }, 1, 1));
  return cornersOf(inner).map((p) => { const u = applyMat(toUnit, p.x, p.y); return project(H, u.x, u.y); });
}

/** The inverse of a 3 by 3 row-major matrix from the cross products of its rows, or null when it is singular. */
export function inverse3(m: readonly number[]): number[] | null {
  const r0 = [m[0], m[1], m[2]], r1 = [m[3], m[4], m[5]], r2 = [m[6], m[7], m[8]];
  const cross = (a: number[], b: number[]): number[] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const c0 = cross(r1, r2), c1 = cross(r2, r0), c2 = cross(r0, r1);
  const det = r0[0] * c0[0] + r0[1] * c0[1] + r0[2] * c0[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [c0[0] / det, c1[0] / det, c2[0] / det, c0[1] / det, c1[1] / det, c2[1] / det, c0[2] / det, c1[2] / det, c2[2] / det];
}

/** The corners the image's own corners go to: a flipped layer shows its pixels mirrored. */
export function imageCorners(c: readonly Pt[], flipX: boolean, flipY: boolean): Pt[] {
  const at = (u: number, v: number): Pt => c[v ? (u ? 2 : 3) : (u ? 1 : 0)];
  return UNIT_CORNERS.map(([u, v]) => at(flipX ? 1 - u : u, flipY ? 1 - v : v));
}

export interface Warped { raster: Raster; t: Transform }

/** `src`, shown through `t`, resampled so its corners land on `quad`, over the quad's whole-pixel bounds with an
 *  upright transform. Each output pixel's centre is mapped back into the source and read with premultiplied bilinear
 *  filtering, edges clamped; `scale` below 1 renders a smaller preview of the same bounds. For a mask the result is
 *  opaque grey, with `background` (0 black, hidden) outside the shape. */
export function warpRaster(src: Raster, t: Transform, quad: readonly Pt[], scale = 1, mask = false, background = 0): Warped | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of quad) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const x0 = Math.floor(minX), y0 = Math.floor(minY), W = Math.ceil(maxX) - x0, H = Math.ceil(maxY) - y0;
  const back = inverse3(homography(imageCorners(quad, t.flipX, t.flipY)));
  if (W < 1 || H < 1 || !back) return null;
  const ow = Math.max(1, Math.round(W * scale)), oh = Math.max(1, Math.round(H * scale));
  const sw = src.width, sh = src.height, sd = src.ctx.getImageData(0, 0, sw, sh).data;
  const out = new ImageData(ow, oh), od = out.data;
  // Masks keep their level in alpha over white: outside the shape they take the edge's level.
  if (mask) for (let k = 0; k < od.length; k += 4) { od[k] = od[k + 1] = od[k + 2] = 255; od[k + 3] = background; }
  const texel = (x: number, y: number): number => (Math.min(sh - 1, Math.max(0, y)) * sw + Math.min(sw - 1, Math.max(0, x))) * 4;
  for (let j = 0; j < oh; j++) {
    const Y = y0 + ((j + 0.5) * H) / oh;
    for (let i = 0; i < ow; i++) {
      const X = x0 + ((i + 0.5) * W) / ow;
      const den = back[6] * X + back[7] * Y + back[8];
      const u = (back[0] * X + back[1] * Y + back[2]) / den, v = (back[3] * X + back[4] * Y + back[5]) / den;
      if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) continue;
      const fx = u * sw - 0.5, fy = v * sh - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy++) {
        const wy = dy ? ty : 1 - ty;
        for (let dx = 0; dx < 2; dx++) {
          const weight = wy * (dx ? tx : 1 - tx);
          if (!weight) continue;
          const o = texel(ix + dx, iy + dy);
          if (mask) { a += weight * sd[o + 3]; continue; }
          const k = weight * sd[o + 3];
          r += sd[o] * k; g += sd[o + 1] * k; b += sd[o + 2] * k; a += k;
        }
      }
      const o = (j * ow + i) * 4;
      // A mask's level is its alpha, read straight (the four weights sum to one); pixels are premultiplied.
      if (mask) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = Math.round(a); continue; }
      if (a > 0) { od[o] = Math.round(r / a); od[o + 1] = Math.round(g / a); od[o + 2] = Math.round(b / a); }
      od[o + 3] = Math.round(a);
    }
  }
  const raster = new Raster(ow, oh);
  raster.write(out);
  return { raster, t: { x: x0, y: y0, w: W, h: H, rotation: 0, flipX: false, flipY: false, sampling: t.sampling } };
}

/** The whole-pixel bounds of a warp's visible pixels, in its own pixels, or null when nothing shows. */
export function visibleBounds(r: Raster): Rect | null {
  const d = r.ctx.getImageData(0, 0, r.width, r.height).data;
  let left = r.width, top = r.height, right = -1, bottom = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (d[(y * r.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** A full-resolution warp cut down to `crop` (in its pixels), its transform moved to match. */
export function cropWarp(wp: Warped, crop: Rect): Warped {
  const raster = new Raster(crop.w, crop.h);
  raster.ctx.drawImage(wp.raster.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  raster.touch();
  return { raster, t: { ...wp.t, x: wp.t.x + crop.x, y: wp.t.y + crop.y, w: crop.w, h: crop.h } };
}

/** The tone a mask shows beyond its own pixels: white (255) when its border is light on average, else black (0). A
 *  mask placed apart from its layer shows this past its bounds. */
export function maskEdgeTone(r: Raster): number {
  const d = r.ctx.getImageData(0, 0, r.width, r.height).data, w = r.width, h = r.height;
  let sum = 0, count = 0;
  const add = (x: number, y: number): void => { sum += d[(y * w + x) * 4 + 3]; count++; };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  return count && sum / count >= 127.5 ? 255 : 0;
}

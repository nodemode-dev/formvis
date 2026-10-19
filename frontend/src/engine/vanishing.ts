import { applyH, convexQuadTLTRBRBL, homography, invertH, type H, type P2, type Quad } from './perspective';

/** Filter > Vanishing Point (1.58.3, the parity plan's L6): a perspective plane from four corners
 *  (top left, top right, bottom right, bottom left), the unit square mapped onto it, so a point on the plane has
 *  plane coordinates (u, v) from 0 to 1. Pasting places a picture on a rectangle of the plane and draws it in the
 *  plane's perspective; the stamp clones by a fixed offset in plane coordinates, so what it copies shrinks and grows
 *  with distance as the plane does. Samples are bilinear. */

export interface PlaneMap { quad: Quad; h: H; inv: H; aspect: number }
export interface PlaneRect { u: number; v: number; du: number; dv: number }

/** The plane on `quad`, or null when the four corners do not make a convex quadrilateral in order. */
export function makePlane(quad: Quad): PlaneMap | null {
  if (!convexQuadTLTRBRBL(quad)) return null;
  const h = homography([[0, 0], [1, 0], [1, 1], [0, 1]], quad), inv = h ? invertH(h) : null;
  if (!h || !inv) return null;
  const len = (a: P2, b: P2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const aspect = (len(quad[0], quad[1]) + len(quad[3], quad[2])) / Math.max(1e-6, len(quad[0], quad[3]) + len(quad[1], quad[2]));
  return { quad, h, inv, aspect };
}

export const toImage = (p: PlaneMap, u: number, v: number): P2 => applyH(p.h, u, v);
export const toPlane = (p: PlaneMap, x: number, y: number): P2 => applyH(p.inv, x, y);

/** A rectangle on the plane for a picture `w` by `h`, `size` wide in plane units, centred at (cu, cv), its height
 *  following the picture's proportions as the plane's own proportions show them. */
export function rectFor(p: PlaneMap, w: number, h: number, size: number, cu: number, cv: number): PlaneRect {
  const du = size, dv = size * (h / Math.max(1, w)) * p.aspect;
  return { u: cu - du / 2, v: cv - dv / 2, du, dv };
}

function sample(src: ImageData, x: number, y: number, out: number[]): boolean {
  const { width: W, height: Hh, data: d } = src;
  if (x < -0.5 || y < -0.5 || x > W - 0.5 || y > Hh - 0.5) return false;
  const fx = Math.min(W - 1, Math.max(0, x - 0.5)), fy = Math.min(Hh - 1, Math.max(0, y - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(Hh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
  for (let c = 0; c < 4; c++) {
    const a = d[(y0 * W + x0) * 4 + c], b = d[(y0 * W + x1) * 4 + c], e = d[(y1 * W + x0) * 4 + c], f = d[(y1 * W + x1) * 4 + c];
    out[c] = (a * (1 - tx) + b * tx) * (1 - ty) + (e * (1 - tx) + f * tx) * ty;
  }
  return true;
}

function over(dst: Uint8ClampedArray, o: number, s: number[], k: number): void {
  const a = (s[3] / 255) * k;
  if (a <= 0) return;
  const da = dst[o + 3] / 255, oa = a + da * (1 - a);
  for (let c = 0; c < 3; c++) dst[o + c] = oa > 0 ? (s[c] * a + dst[o + c] * da * (1 - a)) / oa : 0;
  dst[o + 3] = oa * 255;
}

/** The image-space box of a plane rectangle, clipped to `W` by `Hh`. */
function boxOf(p: PlaneMap, r: PlaneRect, W: number, Hh: number): [number, number, number, number] {
  const c = [toImage(p, r.u, r.v), toImage(p, r.u + r.du, r.v), toImage(p, r.u + r.du, r.v + r.dv), toImage(p, r.u, r.v + r.dv)];
  return [Math.max(0, Math.floor(Math.min(...c.map((q) => q[0])))), Math.max(0, Math.floor(Math.min(...c.map((q) => q[1])))), Math.min(W, Math.ceil(Math.max(...c.map((q) => q[0])))), Math.min(Hh, Math.ceil(Math.max(...c.map((q) => q[1]))))];
}

/** `src` drawn into `dst` on the plane rectangle `r`, in the plane's perspective, over what is there. */
export function pasteInPerspective(dst: ImageData, src: ImageData, p: PlaneMap, r: PlaneRect): void {
  const [x0, y0, x1, y1] = boxOf(p, r, dst.width, dst.height), s = [0, 0, 0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const [u, v] = toPlane(p, x + 0.5, y + 0.5), su = (u - r.u) / r.du, sv = (v - r.v) / r.dv;
    if (su < 0 || su > 1 || sv < 0 || sv > 1) continue;
    if (sample(src, su * src.width, sv * src.height, s)) over(dst.data, (y * dst.width + x) * 4, s, 1);
  }
}

/** One stamp dab: around image point (cx, cy) within `radius` pixels, the picture `from` (the image as it was when
 *  the stroke began) copied from the plane point `offset` behind, through the plane, softened by `hardness`. */
export function stampInPerspective(dst: ImageData, from: ImageData, p: PlaneMap, cx: number, cy: number, radius: number, hardness: number, offset: P2): void {
  const r = Math.max(1, radius), x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r)), x1 = Math.min(dst.width, Math.ceil(cx + r)), y1 = Math.min(dst.height, Math.ceil(cy + r)), s = [0, 0, 0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d >= 1) continue;
    const k = d <= hardness ? 1 : 1 - (d - hardness) / Math.max(1e-6, 1 - hardness);
    const [u, v] = toPlane(p, x + 0.5, y + 0.5), [sx, sy] = toImage(p, u - offset[0], v - offset[1]);
    if (sample(from, sx, sy, s)) over(dst.data, (y * dst.width + x) * 4, s, k);
  }
}

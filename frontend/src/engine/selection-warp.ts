import type { Pt } from './types';
import { SelectionMask } from './selection';
import { homography, inverse3, project } from './distort';

/** Select > Transform Selection beyond the box's move, scale, rotate and flip: the outline's four corners are worked out
 *  from numbers (a reference point, scale, angle, skew, perspective and a matrix) or given outright (a corner distort),
 *  and the coverage is resampled through the perspective that takes the old bounds to them. */
export interface SelectionWarp {
  /** Reference point, 0 to 8 row by row (0 top left, 4 centre, 8 bottom right); the centre when left out. */
  ref?: number;
  moveX?: number;
  moveY?: number;
  /** Percent of the width and height. */
  scaleX?: number;
  scaleY?: number;
  /** Degrees. */
  angle?: number;
  skewH?: number;
  skewV?: number;
  /** Percent, -90 to 90: the top (or the left) edge narrows and the opposite edge widens by the same amount. */
  perspH?: number;
  perspV?: number;
  /** a b c d e f: x' = a x + c y + e, y' = b x + d y + f, applied last, about the document origin. */
  matrix?: number[];
  /** Four absolute corners (top left, top right, bottom right, bottom left): used in place of the numbers above. */
  quad?: Pt[];
  smooth?: boolean;
}

const num = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The corners the selection's bounds go to under `o`, in handle order. */
export function selectionQuad(r: { x: number; y: number; w: number; h: number }, o: SelectionWarp): Pt[] {
  const m = o.matrix && o.matrix.length === 6 && o.matrix.every(Number.isFinite) ? o.matrix : null;
  let q: Pt[];
  if (o.quad && o.quad.length === 4) q = o.quad.map((p) => ({ x: p.x, y: p.y }));
  else {
    const ref = Math.max(0, Math.min(8, Math.round(num(o.ref, 4)))), px = r.x + (ref % 3) * r.w / 2, py = r.y + Math.floor(ref / 3) * r.h / 2;
    const ph = Math.max(-90, Math.min(90, num(o.perspH, 0))) / 200 * r.w, pv = Math.max(-90, Math.min(90, num(o.perspV, 0))) / 200 * r.h;
    const corners: Pt[] = [
      { x: r.x + ph, y: r.y + pv }, { x: r.x + r.w - ph, y: r.y - pv },
      { x: r.x + r.w + ph, y: r.y + r.h + pv }, { x: r.x - ph, y: r.y + r.h - pv },
    ];
    const sx = num(o.scaleX, 100) / 100, sy = num(o.scaleY, 100) / 100, kh = Math.tan(num(o.skewH, 0) * Math.PI / 180), kv = Math.tan(num(o.skewV, 0) * Math.PI / 180);
    const a = num(o.angle, 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    q = corners.map((c) => {
      let x = (c.x - px) * sx, y = (c.y - py) * sy;
      const hx = x + kh * y, hy = y + kv * x;
      x = hx; y = hy;
      return { x: px + x * cs - y * sn + num(o.moveX, 0), y: py + x * sn + y * cs + num(o.moveY, 0) };
    });
  }
  return m ? q.map((p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })) : q;
}

function sample(sel: SelectionMask, x: number, y: number): number {
  const fx = Math.floor(x - 0.5), fy = Math.floor(y - 0.5), tx = x - 0.5 - fx, ty = y - 0.5 - fy;
  const a = sel.valueAt(fx, fy), b = sel.valueAt(fx + 1, fy), c = sel.valueAt(fx, fy + 1), d = sel.valueAt(fx + 1, fy + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** `sel` resampled so its bounds land on `quad` (handle order), kept to the document; null when nothing is left. */
export function warpSelection(sel: SelectionMask, quad: readonly Pt[], docW: number, docH: number, smooth = true): SelectionMask | null {
  const back = inverse3(homography(quad));
  if (!back) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x)))), y0 = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y))));
  const x1 = Math.min(docW, Math.ceil(Math.max(...quad.map((p) => p.x)))), y1 = Math.min(docH, Math.ceil(Math.max(...quad.map((p) => p.y))));
  const w = x1 - x0, h = y1 - y0, r = sel.rect;
  if (w <= 0 || h <= 0) return null;
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = project(back, x0 + i + 0.5, y0 + j + 0.5);
      const sx = r.x + u.x * r.w, sy = r.y + u.y * r.h;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      out[j * w + i] = Math.round(smooth ? sample(sel, sx, sy) : sel.valueAt(sx, sy));
    }
  }
  return SelectionMask.cropped(x0, y0, w, h, out);
}

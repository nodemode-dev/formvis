import type { Anchor, SubPath, VectorPath } from './paths';

/** Outline tracing (DEV_PLAN 32.7 part b): the closed outlines of a coverage mask as smooth Bezier sub-paths. The mask
 *  is thresholded and padded by one pixel so every contour closes; boundary edges between inside and outside pixels are
 *  chained into loops (inside on the right, so outer contours run clockwise on screen and holes counter-clockwise, the
 *  sign convention of windingArea); each loop point sits where the coverage crosses the threshold between the two pixel
 *  centres, so antialiased edges trace to sub-pixel positions; loops are simplified with Ramer-Douglas-Peucker and fitted
 *  with Catmull-Rom handles, except at sharp corners, where the handles sit on the anchor. */
export interface TraceOptions { threshold?: number; tolerance?: number; scale?: number; offsetX?: number; offsetY?: number }

type P = { x: number; y: number };

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

function simplify(pts: P[], tol: number): P[] {
  if (pts.length < 4 || tol <= 0) return pts;
  // A closed loop is split at the point farthest from the first, and each half simplified as an open run.
  let far = 0, best = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y); if (d > best) { best = d; far = i; } }
  const half = (run: P[]): P[] => {
    const keep = new Uint8Array(run.length);
    keep[0] = 1; keep[run.length - 1] = 1;
    const stack: Array<[number, number]> = [[0, run.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop() as [number, number];
      const ax = run[a].x, ay = run[a].y, dx = run[b].x - ax, dy = run[b].y - ay, len = Math.hypot(dx, dy);
      let m = -1, md = tol;
      for (let i = a + 1; i < b; i++) {
        const d = len > 0 ? Math.abs((run[i].x - ax) * dy - (run[i].y - ay) * dx) / len : Math.hypot(run[i].x - ax, run[i].y - ay);
        if (d > md) { md = d; m = i; }
      }
      if (m >= 0) { keep[m] = 1; stack.push([a, m], [m, b]); }
    }
    return run.filter((_, i) => keep[i] === 1);
  };
  const first = half(pts.slice(0, far + 1)), second = half([...pts.slice(far), pts[0]]);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function fit(pts: P[], k: (v: number, isY: boolean) => number): Anchor[] {
  const n = pts.length;
  return pts.map((c, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const ux = c.x - a.x, uy = c.y - a.y, vx = b.x - c.x, vy = b.y - c.y, lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    const turn = lu > 0 && lv > 0 ? Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) : 0;
    const sharp = turn > Math.PI / 3, tx = sharp ? 0 : (b.x - a.x) / 6, ty = sharp ? 0 : (b.y - a.y) / 6;
    return { x: k(c.x, false), y: k(c.y, true), inX: k(c.x - tx, false), inY: k(c.y - ty, true), outX: k(c.x + tx, false), outY: k(c.y + ty, true) };
  });
}

/** Traces `alpha` (one byte per pixel, w by h) to closed outlines. Output coordinates are `x * scale + offsetX`. */
export function traceAlpha(alpha: Uint8ClampedArray | Uint8Array, w: number, h: number, opts: TraceOptions = {}): VectorPath {
  const thr = opts.threshold ?? 128, tol = opts.tolerance ?? 0.5, scale = opts.scale ?? 1, ox = opts.offsetX ?? 0, oy = opts.offsetY ?? 0;
  const out: VectorPath = { subpaths: [] };
  if (w < 1 || h < 1 || alpha.length < w * h) return out;
  const W = w + 2, H = h + 2, L = W + 1;   // padded pixel grid; lattice is one wider
  const a = (x: number, y: number): number => (x < 1 || y < 1 || x > w || y > h ? 0 : alpha[(y - 1) * w + (x - 1)]);
  const inside = (x: number, y: number): boolean => a(x, y) >= thr;
  const edge = new Uint8Array(L * (H + 1) * 4), used = new Uint8Array(L * (H + 1) * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) edge[(y * L + x) * 4 + 0] = 1;
    if (!inside(x + 1, y)) edge[(y * L + x + 1) * 4 + 1] = 1;
    if (!inside(x, y + 1)) edge[((y + 1) * L + x + 1) * 4 + 2] = 1;
    if (!inside(x - 1, y)) edge[((y + 1) * L + x) * 4 + 3] = 1;
  }
  // The point where coverage crosses the threshold between an inside pixel and its outside neighbour.
  const crossing = (vx: number, vy: number, d: number): P => {
    const ix = d === 0 ? vx : d === 1 ? vx - 1 : d === 2 ? vx - 1 : vx, iy = d === 0 ? vy : d === 1 ? vy : d === 2 ? vy - 1 : vy - 1;
    const ex = d === 0 ? vx : d === 1 ? vx : d === 2 ? vx - 1 : vx - 1, ey = d === 0 ? vy - 1 : d === 1 ? vy : d === 2 ? vy : vy - 1;
    const ai = a(ix, iy), ao = a(ex, ey), t = ai === ao ? 0.5 : Math.max(0, Math.min(1, (ai - thr) / (ai - ao)));
    return { x: ix + 0.5 + t * (ex - ix) - 1, y: iy + 0.5 + t * (ey - iy) - 1 };
  };
  const k = (v: number, isY: boolean): number => v * scale + (isY ? oy : ox);
  for (let start = 0; start < edge.length; start++) {
    if (!edge[start] || used[start]) continue;
    const loop: P[] = [];
    let idx = start, guard = 0;
    for (;;) {
      used[idx] = 1;
      const d = idx % 4, v = (idx - d) / 4, vx = v % L, vy = (v - vx) / L;
      loop.push(crossing(vx, vy, d));
      const nx = vx + DX[d], ny = vy + DY[d], nv = ny * L + nx;
      let next = -1;
      for (const nd of [(d + 1) % 4, d, (d + 3) % 4]) { const e = nv * 4 + nd; if (edge[e] && !used[e]) { next = e; break; } }
      if (next < 0 || ++guard > edge.length) break;
      idx = next;
    }
    if (loop.length < 3) continue;
    const pts = simplify(loop, tol);
    if (pts.length < 3) continue;
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; }
    if (Math.abs(s) / 2 < 4) continue;
    const sub: SubPath = { anchors: fit(pts, k), closed: true };
    out.subpaths.push(sub);
  }
  return out;
}

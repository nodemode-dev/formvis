import type { Pt } from './types';

/** Quick shape (DEV_PLAN 36.5): the shape a freehand stroke resembles, as the points to paint instead, or null when it
 *  resembles none. Simple tests only: a line when the ends are about as far apart as the path is long; a closed stroke
 *  (ends close together) is a rectangle when it simplifies to four corners, an ellipse when its points keep a steady
 *  distance from the centre of their bounds. Pure geometry; no DOM. */
export type QuickShape = { kind: 'line' | 'rectangle' | 'ellipse'; points: Pt[] };

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Ramer-Douglas-Peucker: the points of `pts` that matter at tolerance `eps`. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1], len = dist(a, b) || 1;
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b.x - a.x) * (a.y - pts[i].y) - (a.x - pts[i].x) * (b.y - a.y)) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

export function fitQuickShape(pts: readonly Pt[]): QuickShape | null {
  if (pts.length < 6) return null;
  let path = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (i) path += dist(pts[i - 1], pts[i]);
    x0 = Math.min(x0, pts[i].x); y0 = Math.min(y0, pts[i].y); x1 = Math.max(x1, pts[i].x); y1 = Math.max(y1, pts[i].y);
  }
  const first = pts[0], last = pts[pts.length - 1], chord = dist(first, last), w = x1 - x0, h = y1 - y0, diag = Math.hypot(w, h);
  if (path < 12 || diag < 8) return null;
  // A line: the ends as far apart as the path is long, and no point far off the chord.
  if (chord / path > 0.9) {
    let off = 0;
    for (const p of pts) off = Math.max(off, Math.abs((last.x - first.x) * (first.y - p.y) - (first.x - p.x) * (last.y - first.y)) / (chord || 1));
    if (off < 0.08 * chord) return { kind: 'line', points: [{ ...first }, { ...last }] };
    return null;
  }
  // Anything else must close on itself.
  if (chord > 0.2 * path) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = w / 2, b = h / 2;
  if (a < 3 || b < 3) return null;
  const closed = [...pts, first];
  // The ends meet, so the path is cut at its point farthest from the start and each half simplified.
  let far = 1;
  for (let i = 1; i < pts.length; i++) if (dist(pts[i], first) > dist(pts[far], first)) far = i;
  const corners = simplify(closed.slice(0, far + 1), 0.07 * diag).length + simplify(closed.slice(far), 0.07 * diag).length - 2;
  // Rectangle: four corners, and the points hug the bounds' edges.
  if (corners === 4) {
    let hug = 0;
    for (const p of pts) hug += Math.min(Math.abs(p.x - x0), Math.abs(p.x - x1), Math.abs(p.y - y0), Math.abs(p.y - y1));
    if (hug / pts.length < 0.1 * Math.min(w, h)) return { kind: 'rectangle', points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }] };
  }
  // Ellipse: the points sit at a steady normalised distance from the centre.
  let mean = 0;
  const r: number[] = pts.map((p) => Math.hypot((p.x - cx) / a, (p.y - cy) / b));
  for (const v of r) mean += v;
  mean /= r.length;
  let dev = 0;
  for (const v of r) dev += (v - mean) ** 2;
  if (Math.sqrt(dev / r.length) < 0.12 && mean > 0.8 && mean < 1.15) {
    const out: Pt[] = [];
    for (let i = 0; i <= 72; i++) { const t = (i / 72) * Math.PI * 2; out.push({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) }); }
    return { kind: 'ellipse', points: out };
  }
  return null;
}

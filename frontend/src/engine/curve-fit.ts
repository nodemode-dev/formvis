import type { Anchor } from './paths';
import type { Pt } from './types';

/** Curves through points, for the Freeform and Curvature Pens. `simplify` is Ramer-Douglas-Peucker: keep the point
 *  farthest from the chord when it is farther than `tolerance`, and recurse on both halves, so a freehand stroke's
 *  hundreds of samples come down to the few that shape it (Curve Fit). `smoothAnchors` turns points into
 *  Bezier anchors whose curve passes through every one of them, the uniform Catmull-Rom spline written as cubic
 *  segments: each smooth point's handles lie along the line from its previous to its next neighbour, a sixth of that
 *  distance to either side, so the curve turns smoothly there. Corners, and the ends of an open run, keep their
 *  handles on the point. */

const distToSegment = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

export function simplify(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let far = -1, dist = 0;
    for (let i = a + 1; i < b; i++) { const d = distToSegment(points[i], points[a], points[b]); if (d > dist) { dist = d; far = i; } }
    if (far >= 0 && dist > tolerance) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

export function smoothAnchors(points: readonly Pt[], closed: boolean, corners: ReadonlySet<number> = new Set()): Anchor[] {
  const n = points.length;
  return points.map((p, i) => {
    const corner = corners.has(i) || (!closed && (i === 0 || i === n - 1)) || n < 3;
    if (corner) return { x: p.x, y: p.y, inX: p.x, inY: p.y, outX: p.x, outY: p.y };
    const prev = points[(i - 1 + n) % n], next = points[(i + 1) % n], tx = (next.x - prev.x) / 6, ty = (next.y - prev.y) / 6;
    return { x: p.x, y: p.y, inX: p.x - tx, inY: p.y - ty, outX: p.x + tx, outY: p.y + ty };
  });
}

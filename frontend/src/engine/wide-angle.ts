/** Adaptive Wide Angle (1.55.8, the parity plan's M4): a wide or fisheye picture reprojected to the rectilinear
 *  (perspective) view, so that lines straight in the world come out straight. The lens model says how the picture
 *  was made: Fisheye (equidistant, r = f theta), Equisolid (r = 2 f sin(theta / 2)), Stereographic (r = 2 f tan(theta
 *  / 2)); Strength is the picture's field of view across its diagonal, from none (the picture as it is) to 180 degrees.
 *  Constraint lines drawn along features that should be straight let the filter find that field of view itself (the
 *  one that makes them straightest) and level the first line. The centre keeps its scale; Scale zooms the result. */

export type LensModel = 'fisheye' | 'equisolid' | 'stereographic';
export type Pt2 = { x: number; y: number };

/** The field of view across the diagonal, radians, for a strength 0 to 1. */
const fovOf = (strength: number): number => Math.max(1e-4, Math.min(1, strength)) * (179 * Math.PI) / 180;

function radiusOf(model: LensModel, f: number, theta: number): number {
  return model === 'equisolid' ? 2 * f * Math.sin(theta / 2) : model === 'stereographic' ? 2 * f * Math.tan(theta / 2) : f * theta;
}
function thetaOf(model: LensModel, f: number, r: number): number {
  return model === 'equisolid' ? 2 * Math.asin(Math.min(1, r / (2 * f))) : model === 'stereographic' ? 2 * Math.atan(r / (2 * f)) : r / f;
}

export interface WideSettings { model: LensModel; strength: number; scale: number; rotation: number }

/** The lens's focal length in pixels for an image of half-diagonal R. */
function focal(model: LensModel, strength: number, R: number): number {
  const half = fovOf(strength) / 2;
  return model === 'equisolid' ? R / (2 * Math.sin(half / 2) || 1) : model === 'stereographic' ? R / (2 * Math.tan(half / 2) || 1) : R / half;
}

/** A picture point (pixels, image W by H) to its place in the corrected picture. */
export function forward(p: Pt2, W: number, H: number, s: WideSettings): Pt2 | null {
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy), f = focal(s.model, s.strength, R), dx = p.x - cx, dy = p.y - cy, r = Math.hypot(dx, dy);
  if (s.strength <= 0 || r === 0) return rotate({ x: cx + dx * s.scale, y: cy + dy * s.scale }, cx, cy, s.rotation);
  const th = thetaOf(s.model, f, r);
  if (!(th < Math.PI / 2 - 1e-3)) return null;
  const ro = f * Math.tan(th) * s.scale;
  return rotate({ x: cx + (dx / r) * ro, y: cy + (dy / r) * ro }, cx, cy, s.rotation);
}

function rotate(p: Pt2, cx: number, cy: number, deg: number): Pt2 {
  if (!deg) return p;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), x = p.x - cx, y = p.y - cy;
  return { x: cx + x * c - y * sn, y: cy + x * sn + y * c };
}

/** The corrected picture: each output pixel goes back through the rotation, the rectilinear radius and the lens
 *  model to its place in the picture, sampled bilinearly in premultiplied alpha. */
export function wideAngle(src: ImageData, s: WideSettings): ImageData {
  const { width: W, height: H } = src, out = new ImageData(W, H), o = out.data, d = src.data;
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy), f = focal(s.model, s.strength, R), a = (-s.rotation * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let x = i + 0.5 - cx, y = j + 0.5 - cy;
    if (s.rotation) { const rx = x * ca - y * sa, ry = x * sa + y * ca; x = rx; y = ry; }
    x /= s.scale; y /= s.scale;
    const ro = Math.hypot(x, y);
    let u = cx + x, v = cy + y;
    if (s.strength > 0 && ro > 0) { const th = Math.atan(ro / f), ri = radiusOf(s.model, f, th); u = cx + (x / ro) * ri; v = cy + (y / ro) * ri; }
    u -= 0.5; v -= 0.5;
    if (!(u > -1 && v > -1 && u < W && v < H)) continue;
    const xa = Math.floor(u), ya = Math.floor(v), fx = u - xa, fy = v - ya;
    let r = 0, g = 0, b = 0, al = 0;
    for (const [xx, yy, w] of [[xa, ya, (1 - fx) * (1 - fy)], [xa + 1, ya, fx * (1 - fy)], [xa, ya + 1, (1 - fx) * fy], [xa + 1, ya + 1, fx * fy]] as const) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || w === 0) continue;
      const p = (yy * W + xx) * 4, aw = (d[p + 3] / 255) * w;
      r += d[p] * aw; g += d[p + 1] * aw; b += d[p + 2] * aw; al += aw;
    }
    if (al <= 0) continue;
    const t = (j * W + i) * 4;
    o[t] = r / al; o[t + 1] = g / al; o[t + 2] = b / al; o[t + 3] = al * 255;
  }
  return out;
}

/** How far a constraint's corrected points stray from their best straight line: the RMS distance over the line's
 *  length (total least squares); Infinity when a point falls outside the view. */
function crookedness(line: readonly Pt2[], W: number, H: number, s: WideSettings): number {
  const pts = line.map((p) => forward(p, W, H, { ...s, rotation: 0, scale: 1 }));
  if (pts.some((p) => !p)) return Infinity;
  const q = pts as Pt2[], n = q.length, mx = q.reduce((a, p) => a + p.x, 0) / n, my = q.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of q) { const x = p.x - mx, y = p.y - my; sxx += x * x; syy += y * y; sxy += x * y; }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, small = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const len = Math.hypot(q[n - 1].x - q[0].x, q[n - 1].y - q[0].y) || 1;
  return Math.sqrt(Math.max(0, small) / n) / len;
}

/** The strength that makes the constraints straightest: a coarse scan, then a golden-section search near the best. */
export function fitStrength(lines: readonly (readonly Pt2[])[], W: number, H: number, model: LensModel): number {
  const usable = lines.filter((l) => l.length >= 3);
  if (!usable.length) return 0;
  const cost = (s: number): number => usable.reduce((a, l) => a + crookedness(l, W, H, { model, strength: s, scale: 1, rotation: 0 }), 0);
  let best = 0, bestC = cost(0);
  for (let s = 0.02; s <= 0.96; s += 0.02) { const c = cost(s); if (c < bestC) { bestC = c; best = s; } }
  let lo = Math.max(0, best - 0.02), hi = Math.min(0.96, best + 0.02);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 24; k++) {
    const a = hi - g * (hi - lo), b = lo + g * (hi - lo);
    if (cost(a) < cost(b)) hi = b; else lo = a;
  }
  return (lo + hi) / 2;
}

/** The rotation, degrees, that makes the first constraint level or plumb (whichever it is nearer) after correction. */
export function levelRotation(line: readonly Pt2[], W: number, H: number, model: LensModel, strength: number): number {
  if (line.length < 2) return 0;
  const a = forward(line[0], W, H, { model, strength, scale: 1, rotation: 0 }), b = forward(line[line.length - 1], W, H, { model, strength, scale: 1, rotation: 0 });
  if (!a || !b) return 0;
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, toLevel = -(((ang + 90) % 180 + 180) % 180 - 90), toPlumb = -(((ang % 180) + 180) % 180 - 90);
  return Math.abs(toLevel) <= Math.abs(toPlumb) ? toLevel : toPlumb;
}

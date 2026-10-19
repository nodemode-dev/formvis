/** Upright: Develop's Geometry settings read off the picture's own straight lines. Edges are found with a Sobel gradient
 *  on a reduced copy; the near-horizontal and near-vertical families each give a dominant tilt (the heaviest 0.1 degree
 *  bin of the gradient-weighted angles, refined by a local mean). Level turns the picture by that tilt; Vertical and
 *  Horizontal fit how the tilt changes across the frame (lines that lean in toward the top or the side) to the
 *  keystone the Geometry pass draws; Auto does Level and Vertical and Full adds Horizontal. */

export type UprightMode = 'level' | 'vertical' | 'auto' | 'full';
export interface UprightFix { rotate: number; vertical: number; horizontal: number }

const REACH = 12;
const FIT = 640;

interface Edge { x: number; y: number; angle: number; weight: number }

function edges(img: ImageData): { list: Edge[]; w: number; h: number } {
  const k = Math.max(1, img.width / FIT), w = Math.max(3, Math.round(img.width / k)), h = Math.max(3, Math.round(img.height / k)), gray = new Float32Array(w * h), solid = new Uint8Array(w * h), s = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (Math.min(img.height - 1, Math.floor(y * k)) * img.width + Math.min(img.width - 1, Math.floor(x * k))) * 4;
    gray[y * w + x] = 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2];
    solid[y * w + x] = s[i + 3] >= 128 ? 1 : 0;
  }
  const mags = new Float32Array(w * h), gxs = new Float32Array(w * h), gys = new Float32Array(w * h);
  let sum = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (!(solid[p - w - 1] && solid[p - w] && solid[p - w + 1] && solid[p - 1] && solid[p] && solid[p + 1] && solid[p + w - 1] && solid[p + w] && solid[p + w + 1])) continue;
    const a = gray[p - w - 1], b = gray[p - w], c = gray[p - w + 1], d = gray[p - 1], f = gray[p + 1], g = gray[p + w - 1], hh = gray[p + w], i2 = gray[p + w + 1];
    const gx = c + 2 * f + i2 - a - 2 * d - g, gy = g + 2 * hh + i2 - a - 2 * b - c;
    gxs[p] = gx; gys[p] = gy; mags[p] = Math.hypot(gx, gy); sum += mags[p];
  }
  const limit = Math.max(60, (sum / (w * h)) * 3), list: Edge[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (mags[p] < limit) continue;
    let angle = (Math.atan2(gys[p], gxs[p]) * 180) / Math.PI - 90;
    while (angle <= -90) angle += 180;
    while (angle > 90) angle -= 180;
    list.push({ x: x - (w - 1) / 2, y: y - (h - 1) / 2, angle, weight: mags[p] });
  }
  return { list, w, h };
}

/** The heaviest direction among `items` (angles within 12 degrees of zero) and the weight behind it, or null. */
function dominant(items: Array<{ angle: number; weight: number }>): { angle: number; weight: number } | null {
  if (!items.length) return null;
  const bins = new Float64Array(2 * REACH * 10 + 1);
  for (const e of items) bins[Math.round((e.angle + REACH) * 10)] += e.weight;
  let best = 0, at = 0;
  for (let i = 2; i < bins.length - 2; i++) {
    const v = bins[i - 2] + bins[i - 1] + bins[i] + bins[i + 1] + bins[i + 2];
    if (v > best) { best = v; at = i; }
  }
  const centre = at / 10 - REACH;
  let sw = 0, sa = 0;
  for (const e of items) if (Math.abs(e.angle - centre) <= 0.7) { sw += e.weight; sa += e.angle * e.weight; }
  return sw > 0 ? { angle: sa / sw, weight: sw } : null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** How the tilt of `family` (angles near zero) changes with `across` (the position across the frame), as the keystone the
 *  Geometry pass draws: 0 when either half lacks lines or the halves agree. */
function convergence(family: Array<{ angle: number; weight: number; across: number }>, extent: number, half: number, sign: number): number {
  const lo = family.filter((e) => e.across < 0), hi = family.filter((e) => e.across >= 0), a = dominant(lo), b = dominant(hi);
  if (!a || !b) return 0;
  const mean = (list: typeof family): number => { let sw = 0, sp = 0; for (const e of list) { sw += e.weight; sp += e.across * e.weight; } return sw ? sp / sw : 0; };
  const gap = mean(hi) - mean(lo);
  if (Math.abs(gap) < half * 0.3) return 0;
  const slope = (deg: number): number => sign * Math.tan((deg * Math.PI) / 180);
  return -((slope(b.angle) - slope(a.angle)) / gap) * extent * 200;
}

/** The Geometry settings (Rotate in degrees, Vertical and Horizontal as slider units) that straighten `img` for `mode`;
 *  all zero for a picture without enough straight lines. */
export function uprightFor(img: ImageData, mode: UprightMode): UprightFix {
  const { list, w, h } = edges(img), out: UprightFix = { rotate: 0, vertical: 0, horizontal: 0 };
  const horizontal = list.filter((e) => Math.abs(e.angle) <= REACH), vertical = list.filter((e) => Math.abs(e.angle) >= 90 - REACH).map((e) => ({ ...e, angle: e.angle > 0 ? e.angle - 90 : e.angle + 90 }));
  const hd = dominant(horizontal), vd = dominant(vertical);
  const pick = hd && (!vd || hd.weight >= vd.weight) ? hd.angle : vd ? vd.angle : 0;
  out.rotate = Math.round(clamp(-pick, -10, 10) * 10) / 10;
  if (mode === 'level') return out;
  out.vertical = Math.round(clamp(convergence(vertical.map((e) => ({ ...e, across: e.x })), (h - 1) / 2, (w - 1) / 2, -1), -100, 100));
  if (mode === 'full') out.horizontal = Math.round(clamp(convergence(horizontal.map((e) => ({ ...e, across: e.y })), (w - 1) / 2, (h - 1) / 2, 1), -100, 100));
  if (mode === 'vertical') out.rotate = 0;
  return out;
}

/** Guided Upright: the Geometry settings from lines the person drew along edges that should be vertical or horizontal
 *  (pairs of layer pixels, `w` by `h`). A line closer to vertical joins the vertical family, otherwise the horizontal one.
 *  Two or more lines in a family, one each side of the frame's middle, give the keystone as `convergence` does for found
 *  edges; a family with a single line only turns the picture. Lengths weight the lines. */
export function uprightFromGuides(guides: ReadonlyArray<readonly [{ x: number; y: number }, { x: number; y: number }]>, w: number, h: number): UprightFix {
  const out: UprightFix = { rotate: 0, vertical: 0, horizontal: 0 };
  type G = { angle: number; weight: number; across: number };
  const vertical: G[] = [], horizontal: G[] = [];
  for (const [a, b] of guides) {
    const dx = b.x - a.x, dy = b.y - a.y, weight = Math.hypot(dx, dy);
    if (weight < 1) continue;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    while (deg <= -90) deg += 180;
    while (deg > 90) deg -= 180;
    const mx = (a.x + b.x) / 2 - (w - 1) / 2, my = (a.y + b.y) / 2 - (h - 1) / 2;
    if (Math.abs(deg) >= 45) vertical.push({ angle: deg > 0 ? deg - 90 : deg + 90, weight, across: mx });
    else horizontal.push({ angle: deg, weight, across: my });
  }
  const mean = (list: G[], key: 'angle' | 'across'): number => { let sw = 0, s = 0; for (const e of list) { sw += e.weight; s += e[key] * e.weight; } return sw ? s / sw : 0; };
  const keystone = (list: G[], extent: number, half: number, sign: number): number => {
    if (list.length < 2) return 0;
    const sorted = [...list].sort((p, q) => p.across - q.across), cut = Math.max(1, Math.floor(sorted.length / 2)), lo = sorted.slice(0, cut), hi = sorted.slice(cut);
    const gap = mean(hi, 'across') - mean(lo, 'across');
    if (Math.abs(gap) < half * 0.3) return 0;
    const slope = (deg: number): number => sign * Math.tan((deg * Math.PI) / 180);
    return -((slope(mean(hi, 'angle')) - slope(mean(lo, 'angle'))) / gap) * extent * 200;
  };
  out.vertical = Math.round(clamp(keystone(vertical, (h - 1) / 2, (w - 1) / 2, -1), -100, 100));
  out.horizontal = Math.round(clamp(keystone(horizontal, (w - 1) / 2, (h - 1) / 2, 1), -100, 100));
  const turning = [...(vertical.length < 2 ? vertical : []), ...(horizontal.length < 2 ? horizontal : [])];
  out.rotate = turning.length ? Math.round(clamp(-mean(turning, 'angle'), -10, 10) * 10) / 10 : 0;
  return out;
}

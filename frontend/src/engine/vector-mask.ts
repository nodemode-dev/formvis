import { applyMat, invert, mul, placement, sameTransform, type Mat } from './geometry';
import { fillVector, mapPath, type VectorPath } from './paths';
import { createSurface, ctxOf, type Surface } from './surface';
import type { Layer, Transform, VectorMask } from './types';

/* Vector masks (Layer > Vector Mask, 1.66.1). Their paths are kept in document pixels: a linked one follows
   its layer's moves and transforms, and every change of the canvas carries them all. */

/** Whether a path has an outline that encloses anything. */
export const hasOutline = (vp: VectorPath): boolean => vp.subpaths.some((sp) => sp.anchors.length > 1);

/** The matrix taking a layer's box from `from` to `to`; the box's pixel size cancels out. */
export const boxChange = (from: Transform, to: Transform): Mat => mul(placement(to, 1, 1), invert(placement(from, 1, 1)));

/** `l`'s vector mask once its box goes from its transform to `next`: carried along when linked, or `always` (a change of
 *  the whole canvas); otherwise as it is. */
export function followVector(l: Layer, next: Transform, always = false): VectorMask | null | undefined {
  const v = l.vectorMask, t = l.transform;
  if (!v || (!v.linked && !always) || sameTransform(t, next) || !(t.w > 0 && t.h > 0 && next.w > 0 && next.h > 0)) return v;
  const m = boxChange(t, next);
  return { ...v, path: mapPath(v.path, (q) => applyMat(m, q.x, q.y)) };
}

/** A vector mask's path carried by `m` (a change of the canvas, a distortion's corners). */
export const movedVector = (v: VectorMask, m: (x: number, y: number) => { x: number; y: number }): VectorMask => ({ ...v, path: mapPath(v.path, (q) => m(q.x, q.y)) });

const made = new WeakMap<VectorMask, { W: number; H: number; s: Surface; version: number }>();
let versions = 0;

/** A vector mask's coverage over a `W` by `H` canvas (white, its level in alpha), drawn once per mask and size; null
 *  when it shows everything (no outline, not inverted), empty when it hides everything (no outline, inverted). */
export function vectorCoverage(v: VectorMask, W: number, H: number): { surface: Surface; version: number } | null {
  const filled = hasOutline(v.path);
  if (!filled && !v.inverted) return null;
  const hit = made.get(v);
  if (hit && hit.W === W && hit.H === H) return { surface: hit.s, version: hit.version };
  const s = createSurface(Math.max(1, W), Math.max(1, H)), c = ctxOf(s);
  c.fillStyle = '#ffffff';
  if (filled) fillVector(c, v.path);
  if (filled && v.inverted) { c.globalCompositeOperation = 'xor'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
  const dn = Math.min(100, Math.max(0, v.density ?? 100)) / 100, fe = Math.max(0, v.feather ?? 0);
  if (dn < 1 || fe > 0) {
    const o = createSurface(Math.max(1, W), Math.max(1, H)), g = ctxOf(o);
    g.fillStyle = `rgba(255,255,255,${1 - dn})`;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = dn;
    if (fe > 0) g.filter = `blur(${fe}px)`;
    g.drawImage(s as CanvasImageSource, 0, 0);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const e2 = { W, H, s: o, version: ++versions };
    made.set(v, e2);
    return { surface: o, version: e2.version };
  }
  const e = { W, H, s, version: ++versions };
  made.set(v, e);
  return { surface: s, version: e.version };
}

import { createSurface, ctxOf, type Surface } from './surface';
import { placement, type Mat } from './geometry';
import type { Artboard, Transform } from './types';

const MAX_COVER_PIXELS = 67_108_864;
const covers = new WeakMap<Artboard, { W: number; H: number; s: Surface; version: number }>();
const fills = new Map<string, Surface>();
let versions = 0;

const box = (a: Artboard): Transform => ({ x: a.x, y: a.y, w: a.w, h: a.h, rotation: 0, flipX: false, flipY: false, sampling: 'nearest' });

/** An artboard's clip for the GPU displays: white over its rectangle, clear elsewhere, at document size, the coverage the
 *  renderer builds from one stretched white pixel; null where the document is too large to hold one. */
export function artboardCover(a: Artboard, W: number, H: number): { image: Surface; version: number; width: number; height: number; matrix: Mat } | null {
  if (W * H > MAX_COVER_PIXELS) return null;
  let e = covers.get(a);
  if (!e || e.W !== W || e.H !== H) {
    const s = createSurface(W, H), c = ctxOf(s);
    c.fillStyle = '#ffffff';
    c.fillRect(a.x, a.y, a.w, a.h);
    e = { W, H, s, version: ++versions };
    covers.set(a, e);
  }
  return { image: e.s, version: e.version, width: W, height: H, matrix: [1, 0, 0, 1, 0, 0] };
}

/** An artboard's background as one pixel stretched over its rectangle; null when it has none. */
export function artboardFill(a: Artboard): { image: Surface; width: number; height: number; matrix: Mat } | null {
  const bg = a.background;
  if (!bg) return null;
  const key = `${bg.r},${bg.g},${bg.b}`;
  let s = fills.get(key);
  if (!s) {
    s = createSurface(1, 1);
    const c = ctxOf(s);
    c.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
    c.fillRect(0, 0, 1, 1);
    fills.set(key, s);
  }
  return { image: s, width: 1, height: 1, matrix: placement(box(a), 1, 1) };
}

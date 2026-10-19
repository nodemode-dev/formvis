import { applyMat, invert, mul, placement, rotation, translation } from './geometry';
import type { Mat } from './geometry';
import { mapPath, pathBounds } from './paths';
import type { VectorPath } from './paths';
import type { Pt, Transform } from './types';
import type { DragMode } from './transform';

/** A pending Free Transform of a path: the chosen subpaths (all when none are chosen) as they began, the box around
 *  them, the box now, and the drag in progress. */
export interface PathTransformEdit {
  original: VectorPath;
  indices: number[];
  box: Transform;
  draft: Transform;
  base: Transform | null;
  mode: DragMode;
  start: Pt;
  tool: string;
  corners: Pt[] | null;
  dmode: 'distort' | 'skew' | 'perspective' | null;
}

/** The subpaths a transform acts on: the chosen ones that exist, or every subpath when none are. */
export function chosenIndices(vp: VectorPath, chosen: readonly number[]): number[] {
  const own = chosen.filter((i) => i >= 0 && i < vp.subpaths.length && vp.subpaths[i].anchors.length > 0);
  return own.length ? own : vp.subpaths.map((_, i) => i).filter((i) => vp.subpaths[i].anchors.length > 0);
}

/** The upright box around the chosen subpaths' points and handles; null when they have none. */
export function pathBox(vp: VectorPath, indices: readonly number[]): Transform | null {
  const b = pathBounds({ subpaths: indices.map((i) => vp.subpaths[i]).filter(Boolean) });
  return b ? { x: b.x, y: b.y, w: b.w, h: b.h, rotation: 0, flipX: false, flipY: false, sampling: 'high' } : null;
}

/** The map that carries box `from` onto box `to`. */
export function boxMap(from: Transform, to: Transform): Mat {
  return mul(placement(to, 1, 1), invert(placement(from, 1, 1)));
}

/** The path with the chosen subpaths taken through `m` (a matrix, or a function of a point), the rest as they were. */
export function mappedPath(vp: VectorPath, indices: readonly number[], m: Mat | ((q: Pt) => Pt)): VectorPath {
  const pick = new Set(indices);
  const moved = mapPath(vp, typeof m === 'function' ? m : (q) => applyMat(m, q.x, q.y));
  return { subpaths: vp.subpaths.map((sp, i) => (pick.has(i) ? moved.subpaths[i] : sp)) };
}

/** A turn of `quarters` quarter turns about a point. */
export function turnAbout(c: Pt, quarters: number): Mat {
  return mul(translation(c.x, c.y), mul(rotation((quarters * Math.PI) / 2), translation(-c.x, -c.y)));
}

/** A mirror about the vertical axis through the point (horizontal) or the horizontal one (vertical). */
export function mirrorAbout(c: Pt, horizontal: boolean): Mat {
  return horizontal ? [-1, 0, 0, 1, 2 * c.x, 0] : [1, 0, 0, -1, 0, 2 * c.y];
}

import { applyMat, invert, mul, placement, radians, sameTransform, unitPoint } from './geometry';
import type { Mat } from './geometry';
import type { Pt, Transform } from './types';

/** Free Transform for sonny: dragging a box's body, its eight handles or outside it to rotate, and turning any
 *  affine placement of the unit square back into a box (centre, width, height, rotation and flips). */

/** The eight handles in unit coordinates, clockwise from the top-left corner. */
export const HANDLES: ReadonlyArray<Pt> = [
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 },
  { x: 1, y: 1 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0.5 },
];

export type DragMode = { kind: 'move' } | { kind: 'resize'; handle: number } | { kind: 'rotate' };

/** A box every renderer can draw: finite numbers, 1 to 300,000 units a side, within a million units of the origin. */
export function validTransform(t: Transform): boolean {
  const finite = Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.w) && Number.isFinite(t.h) && Number.isFinite(t.rotation);
  return finite && t.w >= 1 && t.h >= 1 && t.w <= 300000 && t.h <= 300000 && Math.abs(t.x) <= 1e6 && Math.abs(t.y) <= 1e6;
}

/** The box `o` after dragging from `start` to `p`. Shift keeps a move to one axis and snaps rotation to 15 degrees;
 *  a handle resizes against the opposite side, or against the centre with Alt, and scales proportionally when
 *  `lockRatio` and Shift disagree. An invalid result leaves the box as it was. */
export function dragged(o: Transform, start: Pt, p: Pt, mode: DragMode, lockRatio: boolean, shift: boolean, alt: boolean): Transform {
  const next: Transform = { ...o };
  if (mode.kind === 'move') {
    const dx = p.x - start.x, dy = p.y - start.y, horizontal = Math.abs(dx) >= Math.abs(dy);
    next.x += shift && !horizontal ? 0 : dx;
    next.y += shift && horizontal ? 0 : dy;
    return validTransform(next) ? next : o;
  }
  const centreX = o.x + o.w / 2, centreY = o.y + o.h / 2;
  if (mode.kind === 'rotate') {
    const turned = Math.atan2(p.y - centreY, p.x - centreX) - Math.atan2(start.y - centreY, start.x - centreX);
    const degrees = o.rotation + (turned * 180) / Math.PI;
    next.rotation = shift ? Math.round(degrees / 15) * 15 : degrees;
    return validTransform(next) ? next : o;
  }
  const handle = HANDLES[mode.handle];
  const pin = alt ? { x: 0.5, y: 0.5 } : { x: 1 - handle.x, y: 1 - handle.y };
  const pinned = unitPoint(o, pin.x, pin.y), grabbed = unitPoint(o, handle.x, handle.y);
  // The dragged handle's new position relative to the pinned point, in the box's own axes; doubled about the centre.
  const rx = grabbed.x + (p.x - start.x) - pinned.x, ry = grabbed.y + (p.y - start.y) - pinned.y;
  const angle = radians(o.rotation), cos = Math.cos(angle), sin = Math.sin(angle), reach = alt ? 2 : 1;
  const along = (rx * cos + ry * sin) * reach, across = (ry * cos - rx * sin) * reach;
  const sideX = handle.x * 2 - 1, sideY = handle.y * 2 - 1;
  let w = sideX ? Math.max(1, along * sideX) : o.w;
  let h = sideY ? Math.max(1, across * sideY) : o.h;
  if (lockRatio !== shift) {
    // Proportional: an edge handle scales by its own axis; a corner by the least-squares fit of the dragged corner to
    // the original diagonal, never below one unit on the shorter side.
    const scale = !sideX ? h / o.h : !sideY ? w / o.w
      : Math.max(1 / Math.min(o.w, o.h), (along * sideX * o.w + across * sideY * o.h) / (o.w * o.w + o.h * o.h));
    w = o.w * scale;
    h = o.h * scale;
  }
  // Put the resized box back so the pinned point stays where it was.
  const offX = (0.5 - pin.x) * w, offY = (0.5 - pin.y) * h;
  next.w = w;
  next.h = h;
  next.x = pinned.x + offX * cos - offY * sin - w / 2;
  next.y = pinned.y + offX * sin + offY * cos - h / 2;
  return validTransform(next) ? next : o;
}

/** The box that places the unit square as the affine `map` does: its width is the length of the mapped x axis, its
 *  rotation that axis's angle (read through `base`'s horizontal flip), its height the mapped y axis's reach across
 *  it, negative meaning flipped vertically. Shear is dropped. `base`'s flip, sampling and nearest rotation turn are
 *  kept, so the numbers stay familiar. */
export function placing(base: Transform, map: Mat): Transform {
  const [xa, xb, ya, yb] = map;
  const mirror = base.flipX ? -1 : 1;
  const angle = Math.atan2(xb * mirror, xa * mirror), ux = Math.cos(angle), uy = Math.sin(angle);
  const height = ya * -uy + yb * ux;
  const width = Math.hypot(xa, xb), centre = applyMat(map, 0.5, 0.5), degrees = (angle * 180) / Math.PI;
  const turns = Math.round((base.rotation - degrees) / 360);
  return { ...base, w: width, h: Math.abs(height), rotation: degrees + turns * 360, flipY: height < 0, x: centre.x - width / 2, y: centre.y - Math.abs(height) / 2 };
}

/** `t` carried along while a box moves from `from` to `to`: translated exactly when the box only moved, otherwise
 *  mapped through the box's change and read back as a box. */
export function following(t: Transform, from: Transform, to: Transform): Transform {
  if (sameTransform(from, to)) return t;
  const onlyMoved = from.w === to.w && from.h === to.h && from.rotation === to.rotation && from.flipX === to.flipX && from.flipY === to.flipY;
  if (onlyMoved) return { ...t, x: t.x + (to.x - from.x), y: t.y + (to.y - from.y) };
  const change = mul(placement(to, 1, 1), invert(placement(from, 1, 1)));
  return placing(t, mul(change, placement(t, 1, 1)));
}

/** The box snapped to whole units and whole degrees, at least one unit a side. */
export function rounded(t: Transform): Transform {
  return { ...t, x: Math.round(t.x), y: Math.round(t.y), w: Math.max(1, Math.round(t.w)), h: Math.max(1, Math.round(t.h)), rotation: Math.round(t.rotation) };
}

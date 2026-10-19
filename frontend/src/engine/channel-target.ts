import type { PixelPatch } from './history';
import { Raster } from './surface';

/** The red, green and blue planes a step may change. */
export type RgbTarget = readonly [boolean, boolean, boolean];

/** Puts back, in every pixel patch of a step, the planes that are not targeted (from the patch's own before pixels); the rasters in `skip` (masks) are left. Returns how many pixels' planes were put back. */
export function restrictPatches(patches: readonly PixelPatch[], keep: RgbTarget, skip: ReadonlySet<unknown>): number {
  let restored = 0;
  for (const q of patches) {
    if (!(q.raster instanceof Raster) || q.paged || q.disk || skip.has(q.raster)) continue;
    const b = q.before, now = q.raster.read(q.x, q.y, b.width, b.height), d = now.data, o = b.data;
    let changed = false;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        if (!keep[c] && d[i + c] !== o[i + c]) { d[i + c] = o[i + c]; changed = true; restored++; }
      }
    }
    if (!changed) continue;
    q.raster.ctx.putImageData(now, q.x, q.y);
    q.raster.touch();
    if (!q.lazy && q.after.width === b.width && q.after.height === b.height) q.after.data.set(d);
  }
  return restored;
}

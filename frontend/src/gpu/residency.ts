import { rasterOf } from '../engine/surface';
import type { Rect } from '../engine/types';

/** The side of the tiles a changed layer is re-uploaded in. */
export const UPLOAD_TILE = 256;
/** A texture left unused this long is freed whatever the budget says, so a deleted layer's canvas is not kept. */
export const IDLE_MS = 60_000;

/** What a display counts of its uploads: calls and bytes sent to texture memory. */
export interface UploadStats { uploads: number; tiled: number; bytes: number }

/** The 256 px tile-aligned box of a layer texture that changed between two versions of its raster, or null when the
 *  whole texture must go up (the changes are unknown, left the raster's log, or cover the texture). */
export function dirtyBox(image: unknown, from: number, to: number, W: number, H: number): Rect | null {
  if (!Number.isFinite(from) || !image) return null;
  const r = rasterOf(image as CanvasImageSource)?.damageSince(from, to);
  if (!r || r.w <= 0 || r.h <= 0) return null;
  const T = UPLOAD_TILE, x0 = Math.max(0, Math.floor(r.x / T) * T), y0 = Math.max(0, Math.floor(r.y / T) * T);
  const x1 = Math.min(W, Math.ceil((r.x + r.w) / T) * T), y1 = Math.min(H, Math.ceil((r.y + r.h) / T) * T);
  if (x1 <= x0 || y1 <= y0 || (x1 - x0) * (y1 - y0) >= W * H) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface Resident { bytes: number; seen: number; at: number }

/** Frees the least recently drawn textures the frame `frame` did not use until the idle ones fit in what is left of
 *  `budget` bytes after the frame's own; any idle longer than IDLE_MS goes too. A budget of 0 frees every idle one. */
export function trimResident<K, E extends Resident>(cache: Map<K, E>, frame: number, budget: number, now: number, free: (e: E) => void): void {
  let used = 0, held = 0;
  const idle: Array<[K, E]> = [];
  for (const kv of cache) {
    if (kv[1].seen === frame) used += kv[1].bytes;
    else if (now - kv[1].at > IDLE_MS) { free(kv[1]); cache.delete(kv[0]); }
    else { idle.push(kv); held += kv[1].bytes; }
  }
  const room = Math.max(0, budget - used);
  idle.sort((a, b) => a[1].seen - b[1].seen);
  for (const [k, e] of idle) {
    if (held <= room) break;
    held -= e.bytes;
    free(e);
    cache.delete(k);
  }
}

import { wandMask } from './kernels';

/** The Paint Bucket's region off the main thread: the Magic Wand's mask for a click (contiguous flood or every match)
 *  and, when asked, its edge softened by a pixel. Layers under `WAND_FROM` pixels are found where they are. The worker
 *  runs the same `wandMask` and `softenMask`, so the bytes are those of the main-thread path; null where workers are
 *  missing or one failed, and the caller then finds the region itself. */

export const WAND_FROM = 4_000_000;

export interface WandJob { id: number; width: number; height: number; pixels: ArrayBuffer; x: number; y: number; tolerance: number; contiguous: boolean; soft: boolean }
export interface WandResult { id: number; mask: ArrayBuffer }

/** The mask with every edge pixel (one whose four neighbours are not all alike) replaced by the mean of its 3 by 3 neighbourhood. */
export function softenMask(mask: Uint8Array, W: number, H: number): Uint8Array {
  const soft = new Uint8Array(mask.length);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = j * W + i, v = mask[o];
    const edge = (i > 0 && mask[o - 1] !== v) || (i < W - 1 && mask[o + 1] !== v) || (j > 0 && mask[o - W] !== v) || (j < H - 1 && mask[o + W] !== v);
    if (!edge) { soft[o] = v; continue; }
    let s = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < W && jj < H) { s += mask[jj * W + ii]; n++; } }
    soft[o] = Math.round(s / n);
  }
  return soft;
}

export function findRegion(rgba: Uint8ClampedArray, W: number, H: number, x: number, y: number, tolerance: number, contiguous: boolean, soft: boolean): Uint8Array {
  const mask = wandMask(rgba, W, H, x, y, tolerance, contiguous, 0);
  return soft ? softenMask(mask, W, H) : mask;
}

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const waiting = new Map<number, (mask: Uint8Array | null) => void>();

function start(): Worker | null {
  if (failed) return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./wand-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WandResult>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(new Uint8Array(e.data.mask));
    };
    w.onerror = () => {
      failed = true; w.terminate(); worker = null;
      for (const done of waiting.values()) done(null);
      waiting.clear();
    };
    worker = w;
  } catch { failed = true; worker = null; }
  return worker;
}

/** The region for a click on a `W` by `H` picture, found in a worker from a copy of `rgba` (left as it is), or null. */
export function findRegionOffThread(rgba: Uint8ClampedArray, W: number, H: number, x: number, y: number, tolerance: number, contiguous: boolean, soft: boolean): Promise<Uint8Array | null> {
  const w = start();
  if (!w) return Promise.resolve(null);
  const id = nextId++, pixels = rgba.slice().buffer as ArrayBuffer;
  return new Promise<Uint8Array | null>((resolve) => {
    waiting.set(id, resolve);
    const job: WandJob = { id, width: W, height: H, pixels, x, y, tolerance, contiguous, soft };
    try { w.postMessage(job, [pixels]); }
    catch { waiting.delete(id); failed = true; resolve(null); }
  });
}

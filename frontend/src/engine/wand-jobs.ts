import { antialiasMask, wandMask } from './kernels';

/** The Paint Bucket's, Magic Wand's and Magic Eraser's region off the main thread: the Magic Wand's mask for a click
 *  (contiguous flood or every match, the reference sampled over `sample`) and, when asked, its edge softened by a pixel
 *  (`soft`, the bucket) or anti-aliased (`anti`, the wand). Layers under `WAND_FROM` pixels are found where they are. The
 *  worker runs the same `wandMask`, `softenMask` and `antialiasMask`, so the bytes are those of the main-thread path;
 *  null where workers are missing or one failed, and the caller then finds the region itself. */

export const WAND_FROM = 4_000_000;

export interface WandJob { id: number; width: number; height: number; pixels: ArrayBuffer; x: number; y: number; tolerance: number; contiguous: boolean; soft: boolean; sample: number; anti: boolean; grow: GrowSpec | null }
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

export function findRegion(rgba: Uint8ClampedArray, W: number, H: number, x: number, y: number, tolerance: number, contiguous: boolean, soft: boolean, sample = 0, anti = false): Uint8Array {
  const mask = wandMask(rgba, W, H, x, y, tolerance, contiguous, sample);
  if (soft) return softenMask(mask, W, H);
  return anti ? antialiasMask(mask, W, H) : mask;
}

export interface GrowSpec { on: ArrayBuffer; lo: number[]; hi: number[] }

/** Select > Grow (`contiguous`, four-connected from the selected pixels `on`, which it fills in) or Similar (anywhere):
 *  every pixel whose four channels lie within `tol` of the range `lo` to `hi`, as 255 or 0, anti-aliased when asked. */
export function growRegion(d: Uint8ClampedArray, W: number, H: number, on: Uint8Array, lo: number[], hi: number[], tol: number, contiguous: boolean, anti: boolean): Uint8Array {
  const n = W * H;
  const inside = (i: number): boolean => { for (let c = 0; c < 4; c++) { const v = d[i * 4 + c]; if (v < lo[c] - tol || v > hi[c] + tol) return false; } return true; };
  if (contiguous) {
    const stack: number[] = [];
    for (let i = 0; i < n; i++) if (on[i]) stack.push(i);
    while (stack.length) {
      const i = stack.pop() as number, x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && !on[j] && inside(j)) { on[j] = 1; stack.push(j); }
    }
  } else for (let i = 0; i < n; i++) if (!on[i] && inside(i)) on[i] = 1;
  const hard = new Uint8Array(n);
  for (let i = 0; i < n; i++) hard[i] = on[i] ? 255 : 0;
  return anti ? antialiasMask(hard, W, H) : hard;
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
export function findRegionOffThread(rgba: Uint8ClampedArray, W: number, H: number, x: number, y: number, tolerance: number, contiguous: boolean, soft: boolean, sample = 0, anti = false): Promise<Uint8Array | null> {
  return send(rgba, W, H, x, y, tolerance, contiguous, soft, sample, anti, null);
}

/** The grown or similar selection, found in a worker from copies of `rgba` and `on` (both left as they are), or null. */
export function growRegionOffThread(rgba: Uint8ClampedArray, W: number, H: number, on: Uint8Array, lo: number[], hi: number[], tol: number, contiguous: boolean, anti: boolean): Promise<Uint8Array | null> {
  return send(rgba, W, H, 0, 0, tol, contiguous, false, 0, anti, { on: on.slice().buffer as ArrayBuffer, lo, hi });
}

function send(rgba: Uint8ClampedArray, W: number, H: number, x: number, y: number, tolerance: number, contiguous: boolean, soft: boolean, sample: number, anti: boolean, grow: GrowSpec | null): Promise<Uint8Array | null> {
  const w = start();
  if (!w) return Promise.resolve(null);
  const id = nextId++, pixels = rgba.slice().buffer as ArrayBuffer;
  return new Promise<Uint8Array | null>((resolve) => {
    waiting.set(id, resolve);
    const job: WandJob = { id, width: W, height: H, pixels, x, y, tolerance, contiguous, soft, sample, anti, grow };
    try { w.postMessage(job, grow ? [pixels, grow.on] : [pixels]); }
    catch { waiting.delete(id); failed = true; resolve(null); }
  });
}

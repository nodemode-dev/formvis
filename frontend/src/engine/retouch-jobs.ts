import type { FillOptions } from './retouch';
import type { FillJob, FillResult } from './retouch-worker';

/** The main-thread side of the fill worker: `fillOffThread` answers null where module workers are missing or after a
 *  failure, so the caller fills on its own thread. */

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const waiting = new Map<number, (r: FillResult | null) => void>();

function start(): Worker | null {
  if (failed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./retouch-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FillResult>) => { const done = waiting.get(e.data.id); waiting.delete(e.data.id); done?.(e.data); };
    w.onerror = () => { failed = true; w.terminate(); worker = null; for (const done of waiting.values()) done(null); waiting.clear(); };
    worker = w;
  } catch { failed = true; worker = null; }
  return worker;
}

/** The premultiplied pixels with the hole filled (null when nothing could be filled), or undefined when the worker is
 *  missing or failed (the caller then fills itself). */
export function fillOffThread(pixels: Uint8ClampedArray, hole: Uint8Array, width: number, height: number, options: FillOptions): Promise<Uint8ClampedArray | null | undefined> | undefined {
  const w = start();
  if (!w) return undefined;
  const px = new Uint8ClampedArray(pixels), mask = new Uint8Array(hole), id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, (r) => resolve(r === null ? undefined : r.ok ? new Uint8ClampedArray(r.pixels) : null));
    try { w.postMessage({ id, pixels: px.buffer, hole: mask.buffer, width, height, options } satisfies FillJob, [px.buffer, mask.buffer]); }
    catch { waiting.delete(id); failed = true; resolve(undefined); }
  });
}

import type { LibFrame } from './filter-library';
import type { FilterJob, FilterKind, FilterResult, FilterSettings } from './filter-jobs';

/** A small pool of filter workers for the bands of a large layer (DEV_PLAN 36.18): min(cores - 1, 4) workers, at least
 *  one, started on first use and kept. Each takes one band (with its apron) at a time; the band travels in by structured
 *  clone, so the caller still holds it should a worker fail, and the filtered band comes back as a transferred buffer.
 *  Every answer is null where workers are missing or one failed, and the caller filters that band itself, so the result
 *  is the same bytes either way. Layers under `POOL_FROM` pixels do not pay the pool's start-up. */

export const POOL_FROM = 4_000_000;

export interface BandRange { y0: number; y1: number; a0: number; a1: number }

/** The bands of a `height`-row layer: `step` rows each (at least the apron), each with `apron` rows read above and below. */
export function bandPlan(height: number, apron: number, step: number): BandRange[] {
  const A = Math.max(0, Math.ceil(apron)), B = Math.max(1, step), out: BandRange[] = [];
  for (let y0 = 0; y0 < height; y0 += B) { const y1 = Math.min(height, y0 + B); out.push({ y0, y1, a0: Math.max(0, y0 - A), a1: Math.min(height, y1 + A) }); }
  return out;
}

interface Slot { w: Worker; busy: number }
let slots: Slot[] = [];
let failed = false;
let nextId = 1;
const waiting = new Map<number, { slot: Slot; done: (img: ImageData | null) => void }>();

/** Preferences > Performance > Worker threads: 0 is automatic (min(cores - 1, 4)); a number is the most workers the pool
 *  may run (1 to 16). A pool already started is ended so the next large filter starts one of the new size. */
let threadsPref = 0;
export function setBandThreads(n: number): void {
  const next = Math.max(0, Math.min(16, Math.round(n) || 0));
  if (next === threadsPref) return;
  threadsPref = next;
  if (waiting.size === 0) { for (const s of slots) s.w.terminate(); slots = []; }
}

/** How many workers the pool runs: min(hardwareConcurrency - 1, 4), at least 1, or the Worker threads preference; 0 where it cannot start. */
export function bandPoolSize(): number {
  if (failed || typeof Worker === 'undefined') return 0;
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return threadsPref > 0 ? threadsPref : Math.max(1, Math.min(cores - 1, 4));
}

function lose(slot: Slot): void {
  failed = true;
  for (const [id, j] of [...waiting]) if (j.slot === slot) { waiting.delete(id); j.done(null); }
}

function ensure(): boolean {
  if (slots.length) return true;
  const n = bandPoolSize();
  if (!n) return false;
  try {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./filter-worker.ts', import.meta.url), { type: 'module' }), slot: Slot = { w, busy: 0 };
      w.onmessage = (e: MessageEvent<FilterResult>) => {
        const j = waiting.get(e.data.id);
        if (!j) return;
        waiting.delete(e.data.id); j.slot.busy--;
        j.done(new ImageData(new Uint8ClampedArray(e.data.pixels), e.data.width, e.data.height));
      };
      w.onerror = () => { lose(slot); for (const s of slots) s.w.terminate(); slots = []; };
      slots.push(slot);
    }
  } catch { failed = true; for (const s of slots) s.w.terminate(); slots = []; return false; }
  return true;
}

/** Whether the pool can take bands now. */
export function bandPoolReady(): boolean { return !failed && ensure(); }

/** One band through a pool worker, or null (the caller then filters it). `src` is left as it is. */
export function runBandOnPool(kind: FilterKind, settings: FilterSettings, seed: number, src: ImageData, frame: LibFrame | null): Promise<ImageData | null> {
  if (failed || !ensure()) return Promise.resolve(null);
  const slot = slots.reduce((a, b) => (b.busy < a.busy ? b : a)), id = nextId++;
  const job: FilterJob = { id, kind, settings, scale: 1, seed, width: src.width, height: src.height, pixels: src.data.buffer.slice(0) as ArrayBuffer, frame };
  return new Promise<ImageData | null>((resolve) => {
    waiting.set(id, { slot, done: resolve });
    slot.busy++;
    try { slot.w.postMessage(job, [job.pixels]); }
    catch { waiting.delete(id); slot.busy--; failed = true; resolve(null); }
  });
}

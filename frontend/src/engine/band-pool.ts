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
const waiting = new Map<number, { slot: Slot; done: (img: ImageData | null, raw?: ArrayBuffer) => void }>();

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

function lose(_slot: Slot): void {
  failed = true;
  for (const [id, j] of [...waiting]) { waiting.delete(id); j.done(null); }
  for (const q of queue.splice(0)) q.done(null);
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
        if (e.data.deep) j.done(null, e.data.pixels); else j.done(new ImageData(new Uint8ClampedArray(e.data.pixels), e.data.width, e.data.height));
        pump();
      };
      w.onerror = () => { lose(slot); for (const s of slots) s.w.terminate(); slots = []; };
      slots.push(slot);
    }
  } catch { failed = true; for (const s of slots) s.w.terminate(); slots = []; return false; }
  return true;
}

/** Whether the pool can take bands now. */
export function bandPoolReady(): boolean { return !failed && ensure(); }

interface Queued { priority: number; seq: number; job: FilterJob; done: (img: ImageData | null, raw?: ArrayBuffer) => void }
const queue: Queued[] = [];
const DEPTH = 2;
let seq = 0;

/** Sends the waiting band with the lowest priority number (first come first among equals) to the worker holding the
 *  fewest, while any worker holds fewer than DEPTH. A band is therefore chosen when a worker is free, not when it was
 *  asked for, so bands asked for later with a lower number run ahead of those still waiting. */
function pump(): void {
  while (queue.length && !failed) {
    const slot = slots.reduce((a, b) => (b.busy < a.busy ? b : a));
    if (!slot || slot.busy >= DEPTH) return;
    let at = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].priority < queue[at].priority || (queue[i].priority === queue[at].priority && queue[i].seq < queue[at].seq)) at = i;
    const q = queue.splice(at, 1)[0];
    waiting.set(q.job.id, { slot, done: q.done });
    slot.busy++;
    try { slot.w.postMessage(q.job, q.job.shared ? [] : [q.job.pixels]); }
    catch { waiting.delete(q.job.id); slot.busy--; failed = true; q.done(null); lose(slot); }
  }
}

/** Whether bands can be read from a SharedArrayBuffer: the page is cross-origin isolated. */
export const bandsShared = (): boolean => typeof SharedArrayBuffer === 'function' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;

/** One band through a pool worker, or null (the caller then filters it). With `own` the band's own buffer travels to
 *  the worker (no copy) and `src` is empty afterwards; otherwise `src` is left as it is. A lower `priority` runs first. */
export function runBandOnPool(kind: FilterKind, settings: FilterSettings, seed: number, src: ImageData, frame: LibFrame | null, priority = 0, own = false): Promise<ImageData | null> {
  if (failed || !ensure()) return Promise.resolve(null);
  const job: FilterJob = { id: nextId++, kind, settings, scale: 1, seed, width: src.width, height: src.height, pixels: own ? src.data.buffer as ArrayBuffer : src.data.buffer.slice(0) as ArrayBuffer, frame };
  return new Promise<ImageData | null>((resolve) => { queue.push({ priority, seq: seq++, job, done: resolve }); pump(); });
}

/** A band of rows a0 to a1 of a `width`-wide RGBA picture held in a SharedArrayBuffer, which the worker reads in place
 *  (nothing is copied or cloned to send it). The caller keeps the shared picture. Lower `priority` runs first. */
export function runSharedBandOnPool(kind: FilterKind, settings: FilterSettings, seed: number, buf: SharedArrayBuffer, width: number, a0: number, a1: number, frame: LibFrame | null, priority = 0): Promise<ImageData | null> {
  if (failed || !ensure()) return Promise.resolve(null);
  const job: FilterJob = { id: nextId++, kind, settings, scale: 1, seed, width, height: a1 - a0, pixels: new ArrayBuffer(0), frame, shared: { buf, offset: a0 * width * 4, length: (a1 - a0) * width * 4 } };
  return new Promise<ImageData | null>((resolve) => { queue.push({ priority, seq: seq++, job, done: resolve }); pump(); });
}

/** Rows a0 to a1 of a 16 or 32 bit layer (interleaved floats, `n` colour channels and alpha last) through a banded-safe
 *  deep filter (`deepBandable`) on a pool worker: read in place from a SharedArrayBuffer when `buf` is given (nothing is copied or cloned
 *  to send it), otherwise `rows` travels as a transferred copy. The filtered rows come back as floats, or null (the
 *  caller then filters that band itself). */
export function runDeepBandOnPool(kind: FilterKind, settings: FilterSettings, seed: number, n: 3 | 4, ceiling: number, width: number, a0: number, a1: number, source: SharedArrayBuffer | Float32Array, priority = 0): Promise<Float32Array | null> {
  if (failed || !ensure()) return Promise.resolve(null);
  const S = n + 1, shared = source instanceof Float32Array ? null : source;
  const job: FilterJob = { id: nextId++, kind, settings, scale: 1, seed, width, height: a1 - a0, pixels: shared ? new ArrayBuffer(0) : (source as Float32Array).buffer as ArrayBuffer, deep: { n, ceiling, first: a0 * width },...(shared ? { shared: { buf: shared, offset: a0 * width * S * 4, length: (a1 - a0) * width * S * 4 } } : {}) };
  return new Promise<Float32Array | null>((resolve) => { queue.push({ priority, seq: seq++, job, done: (_img, raw) => resolve(raw ? new Float32Array(raw) : null) }); pump(); });
}

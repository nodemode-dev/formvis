import { bandPlan, bandPoolSize } from './band-pool';
import { shapedMask } from './layer-masks';
import { effectsActive, blendIfActive, type BlendMode, type Doc, type Layer, type Transform } from './types';
import type { Mat } from './geometry';
import { deepFromRaster } from './deep';
import type { FloatComposite } from './compose-float';

/** The CPU composite in horizontal bands on workers (PC-AU-0145, SC-ED-0259, PC-AU-0152). A worker holds the pixels of
 *  each layer it was sent, keyed by raster and version (a shared buffer when the page is cross-origin isolated, one
 *  transferred copy per worker otherwise), and draws its bands with the same renderer the page uses; the bands are put
 *  together off screen and handed back whole, so the stage swaps one finished frame for the next. Only documents of plain
 *  pixel layers, pass-through folders, layer masks, opacity, fill and blend modes are taken; anything else answers null
 *  and is composited as before. */

export interface WireLayer { id: string; name: string; isGroup: boolean; parentId: string | null; visible: boolean; opacity: number; fill?: number; blend: BlendMode; transform: Transform; raster: string | null; mask: { raster: string; enabled: boolean; placement: Transform | null } | null }
export type CompIn =
  | { type: 'put'; key: string; width: number; height: number; pixels: ArrayBufferLike }
  | { type: 'band'; id: number; width: number; height: number; layers: WireLayer[]; keys: string[]; y0: number; y1: number; matrix: Mat; quality: ImageSmoothingQuality; out?: SharedArrayBuffer }
  | { type: 'fput'; key: string; width: number; height: number; pixels: ArrayBufferLike }
  | { type: 'fband'; id: number; width: number; height: number; layers: WireLayer[]; linear: boolean; y0: number; y1: number; out?: SharedArrayBuffer }
  | { type: 'fdrop' };
export interface CompOut { id: number; y0: number; y1: number; pixels?: ArrayBuffer; error?: string }

export const COMPOSITE_MIN_PIXELS = 1_000_000;
const WORKER_BUDGET = 1_200_000_000;

interface Slot { w: Worker; has: Set<string> }
let slots: Slot[] = [];
let failed = false;
let nextId = 1;
interface Turn { priority: number; seq: number; go: () => Promise<unknown> }
const turns: Turn[] = [];
let turnSeq = 0;
let turning = false;

/** One run at a time; the waiting run with the lowest priority number goes next (first come first among equals), so a
 *  viewport frame (0) is not held behind an export or a flatten (1) that was asked for earlier. */
function inTurn<T>(priority: number, run: () => Promise<T | null>): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    turns.push({ priority, seq: turnSeq++, go: () => run().then(resolve, () => resolve(null)) });
    if (turning) return;
    turning = true;
    void (async () => {
      while (turns.length) {
        let at = 0;
        for (let i = 1; i < turns.length; i++) if (turns[i].priority < turns[at].priority || (turns[i].priority === turns[at].priority && turns[i].seq < turns[at].seq)) at = i;
        await turns.splice(at, 1)[0].go();
      }
      turning = false;
    })();
  });
}
const waiting = new Map<number, { resolve: (m: CompOut) => void }>();
const bytes = { shared: 0, sent: 0, runs: 0, bands: 0 };

const sharing = (): boolean => typeof SharedArrayBuffer === 'function' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;

let compositeOn = false;

/** Preferences > Performance > Composite on worker threads (off by default). */
export function setCompositeOnWorkers(on: boolean): void {
  compositeOn = on;
  if (!on) endCompositePool();
}

/** Ends the workers (the Worker threads preference changed, or the page is closing). */
export function endCompositePool(): void {
  for (const s of slots) s.w.terminate();
  slots = [];
  for (const [id, j] of [...waiting]) { waiting.delete(id); j.resolve({ id, y0: 0, y1: 0, error: 'ended' }); }
}

function ensure(): Slot[] {
  if (slots.length) return slots;
  const n = Math.min(bandPoolSize(), 4);
  if (!n || failed || typeof OffscreenCanvas === 'undefined') return [];
  try {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./composite-worker.ts', import.meta.url), { type: 'module' }), slot: Slot = { w, has: new Set() };
      w.onmessage = (e: MessageEvent<CompOut>) => { const j = waiting.get(e.data.id); if (j) { waiting.delete(e.data.id); j.resolve(e.data); } };
      w.onerror = () => { failed = true; endCompositePool(); };
      slots.push(slot);
    }
  } catch { failed = true; endCompositePool(); return []; }
  return slots;
}

export function compositeStats(): { workers: number; shared: boolean; runs: number; bands: number; sentMB: number; sharedMB: number; failed: boolean } {
  return { workers: slots.length, shared: sharing(), runs: bytes.runs, bands: bytes.bands, sentMB: Math.round(bytes.sent / 1048576), sharedMB: Math.round(bytes.shared / 1048576), failed };
}

const plain = (l: Layer): boolean =>
  !l.adjustment && !l.clipId && !l.tiled && !l.artboard && !l.vectorMask && !l.blendIf && !(l.knockout && l.knockout !== 'none') && !l.blendClipped && !l.blendChannels && !l.frame && !l.fillContent && !l.relight && !l.video && !l.channels &&
  !effectsActive(l.effects) && !blendIfActive(l.blendIf) && !(l.isGroup && (l.isolate === true || l.blend !== 'normal' || l.opacity < 1 || l.mask));

/** Drawn square on the pixel grid: a band edge cannot change a pixel the canvas would have sampled between two. */
const onGrid = (t: Transform, w: number, h: number): boolean => t.rotation === 0 && !t.flipX && !t.flipY && t.w === w && t.h === h && Number.isInteger(t.x) && Number.isInteger(t.y);
const squareView = (m: Mat): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && Number.isInteger(m[4]) && Number.isInteger(m[5]);

interface Prepared { layers: WireLayer[]; rasters: Map<string, { w: number; h: number; read: () => ImageData }> }

/** The wire form of the document, or null where a layer needs more than the band route draws. */
function prepare(doc: Doc): Prepared | null {
  const out: WireLayer[] = [], rasters: Prepared['rasters'] = new Map();
  for (const l of doc.layers) {
    if (!plain(l)) return null;
    let key: string | null = null, mask: WireLayer['mask'] = null;
    if (l.raster) {
      key = `${l.raster.id}:${l.raster.version}`;
      const r = l.raster;
      if (!onGrid(l.transform, r.width, r.height)) return null;
      if (!rasters.has(key)) rasters.set(key, { w: r.width, h: r.height, read: () => r.read() });
    }
    if (l.mask && l.mask.raster) {
      if (shapedMask(l.mask) !== l.mask.raster || l.mask.density !== undefined && l.mask.density < 100 || (l.mask.feather ?? 0) > 0) return null;
      const m = l.mask.raster, mk = `${m.id}:${m.version}`;
      if (!onGrid(l.mask.placement ?? l.transform, m.width, m.height)) return null;
      if (!rasters.has(mk)) rasters.set(mk, { w: m.width, h: m.height, read: () => m.read() });
      mask = { raster: mk, enabled: l.mask.enabled, placement: l.mask.placement };
    } else if (l.mask) return null;
    out.push({ id: l.id, name: l.name, isGroup: l.isGroup, parentId: l.parentId, visible: l.visible, opacity: l.opacity, ...(l.fill !== undefined ? { fill: l.fill } : {}), blend: l.blend, transform: l.transform, raster: key, mask });
  }
  return { layers: out, rasters };
}

/** What the composite depends on, as text: equal while nothing the band route draws has changed. */
export function compositeKey(doc: Doc, width: number, height: number, matrix: Mat, quality: string): string | null {
  if (!compositeOn || failed || width * height < COMPOSITE_MIN_PIXELS || !squareView(matrix)) return null;
  const p = prepare(doc);
  if (!p || !p.layers.some((l) => l.raster)) return null;
  return JSON.stringify([width, height, matrix, quality, p.layers]);
}

const idle = (): Promise<void> => new Promise((done) => {
  const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(() => done(), { timeout: 40 }); else setTimeout(done, 0);
});

async function run(doc: Doc, width: number, height: number, matrix: Mat, quality: ImageSmoothingQuality): Promise<ImageData | null> {
  if (failed || width * height < COMPOSITE_MIN_PIXELS || !squareView(matrix)) return null;
  const prep = prepare(doc);
  if (!prep || !prep.layers.some((l) => l.raster)) return null;
  const pool = ensure();
  if (!pool.length) return null;
  let total = 0;
  for (const r of prep.rasters.values()) total += r.w * r.h * 4;
  if (total * pool.length > WORKER_BUDGET) return null;
  const keys = [...prep.rasters.keys()], share = sharing();
  for (const s of pool) for (const k of [...s.has]) if (!prep.rasters.has(k)) s.has.delete(k);
  for (const [key, r] of prep.rasters) {
    const need = pool.filter((s) => !s.has.has(key));
    if (!need.length) continue;
    await idle();
    const px = r.read().data;
    if (share) {
      const sab = new SharedArrayBuffer(px.byteLength);
      new Uint8ClampedArray(sab).set(px);
      bytes.shared += px.byteLength;
      for (const s of need) { s.w.postMessage({ type: 'put', key, width: r.w, height: r.h, pixels: sab } satisfies CompIn); s.has.add(key); }
    } else {
      need.forEach((s, i) => {
        const copy = i === need.length - 1 ? px.buffer as ArrayBuffer : px.buffer.slice(0) as ArrayBuffer;
        bytes.sent += copy.byteLength;
        s.w.postMessage({ type: 'put', key, width: r.w, height: r.h, pixels: copy } satisfies CompIn, [copy]);
        s.has.add(key);
      });
    }
  }
  await idle();
  const plan = bandPlan(height, 0, Math.max(16, Math.ceil(height / (pool.length * 2))));
  const out = share ? new SharedArrayBuffer(width * height * 4) : null, whole = out ? null : new Uint8ClampedArray(width * height * 4);
  const jobs = plan.map((b, i) => new Promise<CompOut>((resolve) => {
    const id = nextId++, s = pool[i % pool.length];
    waiting.set(id, { resolve });
    try {
      s.w.postMessage({ type: 'band', id, width, height, layers: prep.layers, keys, y0: b.y0, y1: b.y1, matrix, quality, ...(out ? { out } : {}) } satisfies CompIn);
    } catch { waiting.delete(id); failed = true; resolve({ id, y0: b.y0, y1: b.y1, error: 'post' }); }
  }));
  const done = await Promise.all(jobs);
  if (done.some((d) => d.error)) { if (done.some((d) => d.error !== 'ended')) failed = true; endCompositePool(); return null; }
  bytes.runs++; bytes.bands += done.length;
  if (whole) for (const d of done) if (d.pixels) whole.set(new Uint8ClampedArray(d.pixels), d.y0 * width * 4);
  const data: Uint8ClampedArray<ArrayBuffer> = out ? new Uint8ClampedArray(out).slice() : whole as Uint8ClampedArray<ArrayBuffer>;
  return new ImageData(data, width, height);
}

/** The document composited in bands on the workers at `matrix` (document to target pixels), or null when the document or
 *  the machine is not suited and the caller composites it itself. One run at a time; the layers' pixels travel only when
 *  they have changed since a worker last held them. */
export function compositeOnWorkers(doc: Doc, width: number, height: number, matrix: Mat, quality: ImageSmoothingQuality = 'high'): Promise<ImageData | null> {
  return inTurn(0, () => run(doc, width, height, matrix, quality));
}

/** The whole document composited at 1:1 on the workers for an export, on the Composite on worker threads switch, or
 *  null where the caller renders it itself: the switch off, a document the bands do not take, or any pixel not fully
 *  opaque (an ImageData round trip would not return a translucent pixel's bytes exactly). Runs after viewport frames. */
export function compositeFlat(doc: Doc): Promise<ImageData | null> {
  if (!compositeOn) return Promise.resolve(null);
  return inTurn(1, async () => {
    const img = await run(doc, doc.width, doc.height, [1, 0, 0, 1, 0, 0], 'high');
    if (!img) return null;
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return null;
    return img;
  });
}

const plainFloat = (l: Layer): boolean => plain({ ...l, channels: undefined }) && l.blend !== 'dissolve' && !l.mask;

/** The float form of a 16 or 32 bit RGB document's layers for the workers, or null where a layer needs more than the
 *  band route composes (adjustments, styles, clipping, masks, Dissolve, isolated or blended folders, a layer off the pixel grid). */
function prepareFloat(doc: Doc): { layers: WireLayer[]; floats: Map<string, { w: number; h: number; data: Float32Array }> } | null {
  const out: WireLayer[] = [], floats = new Map<string, { w: number; h: number; data: Float32Array }>();
  for (const l of doc.layers) {
    if (!plainFloat(l)) return null;
    let key: string | null = null;
    if (l.raster && !l.isGroup) {
      const d = l.channels ?? deepFromRaster(l.raster);
      if (d.n !== 3 || d.mode !== 'rgb' || !onGrid(l.transform, d.width, d.height)) return null;
      key = l.id;
      floats.set(key, { w: d.width, h: d.height, data: d.data });
    }
    out.push({ id: l.id, name: l.name, isGroup: l.isGroup, parentId: l.parentId, visible: l.visible, opacity: l.opacity, ...(l.fill !== undefined ? { fill: l.fill } : {}), blend: l.blend, transform: l.transform, raster: key, mask: null });
  }
  return { layers: out, floats };
}

async function runFloat(doc: Doc): Promise<FloatComposite | null> {
  const width = doc.width, height = doc.height;
  if (!compositeOn || failed || width * height < COMPOSITE_MIN_PIXELS || (doc.mode ?? 'rgb') !== 'rgb' || (doc.depth ?? 8) === 8) return null;
  const prep = prepareFloat(doc);
  if (!prep || !prep.floats.size) return null;
  const pool = ensure();
  if (!pool.length) return null;
  let total = 0;
  for (const f of prep.floats.values()) total += f.data.byteLength;
  if (total * pool.length > WORKER_BUDGET) return null;
  const share = sharing(), linear = doc.depth === 32;
  for (const [key, f] of prep.floats) {
    await idle();
    if (share) {
      const sab = new SharedArrayBuffer(f.data.byteLength);
      new Float32Array(sab).set(f.data);
      bytes.shared += f.data.byteLength;
      for (const s of pool) s.w.postMessage({ type: 'fput', key, width: f.w, height: f.h, pixels: sab } satisfies CompIn);
    } else {
      for (const s of pool) {
        const copy = f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer;
        bytes.sent += copy.byteLength;
        s.w.postMessage({ type: 'fput', key, width: f.w, height: f.h, pixels: copy } satisfies CompIn, [copy]);
      }
    }
  }
  await idle();
  const plan = bandPlan(height, 0, Math.max(16, Math.ceil(height / (pool.length * 2)))), S = 4;
  const out = share ? new SharedArrayBuffer(width * height * S * 4) : null, whole = out ? null : new Float32Array(width * height * S);
  const jobs = plan.map((b, i) => new Promise<CompOut>((resolve) => {
    const id = nextId++, s = pool[i % pool.length];
    waiting.set(id, { resolve });
    try { s.w.postMessage({ type: 'fband', id, width, height, layers: prep.layers, linear, y0: b.y0, y1: b.y1, ...(out ? { out } : {}) } satisfies CompIn); }
    catch { waiting.delete(id); failed = true; resolve({ id, y0: b.y0, y1: b.y1, error: 'post' }); }
  }));
  const done = await Promise.all(jobs);
  for (const s of pool) s.w.postMessage({ type: 'fdrop' } satisfies CompIn);
  if (done.some((d) => d.error)) { if (done.some((d) => d.error !== 'ended')) failed = true; endCompositePool(); return null; }
  bytes.runs++; bytes.bands += done.length;
  if (whole) for (const d of done) if (d.pixels) whole.set(new Float32Array(d.pixels), d.y0 * width * S);
  return { width, height, data: out ? new Float32Array(out).slice() : whole as Float32Array };
}

/** `composeFloat` for a 16 or 32 bit RGB document in bands on the workers, the floats the single thread gives (each band is
 *  composed by `composeFloat` itself on a document of that band's rows), or null where the document or machine is not
 *  suited and the caller composes it itself. Shares the one-run-at-a-time chain and the Preferences switch of `compositeOnWorkers`. */
export function composeFloatOnWorkers(doc: Doc): Promise<FloatComposite | null> {
  return inTurn(0, () => runFloat(doc));
}

import { bandPlan, bandPoolSize } from './band-pool';
import { shapedMask } from './layer-masks';
import { effectsActive, blendIfActive, type BlendMode, type Doc, type Layer, type Transform } from './types';
import type { Mat } from './geometry';

/** The CPU composite in horizontal bands on workers (PC-AU-0145, SC-ED-0259, PC-AU-0152). A worker holds the pixels of
 *  each layer it was sent, keyed by raster and version (a shared buffer when the page is cross-origin isolated, one
 *  transferred copy per worker otherwise), and draws its bands with the same renderer the page uses; the bands are put
 *  together off screen and handed back whole, so the stage swaps one finished frame for the next. Only documents of plain
 *  pixel layers, pass-through folders, layer masks, opacity, fill and blend modes are taken; anything else answers null
 *  and is composited as before. */

export interface WireLayer { id: string; name: string; isGroup: boolean; parentId: string | null; visible: boolean; opacity: number; fill?: number; blend: BlendMode; transform: Transform; raster: string | null; mask: { raster: string; enabled: boolean; placement: Transform | null } | null }
export type CompIn =
  | { type: 'put'; key: string; width: number; height: number; pixels: ArrayBufferLike }
  | { type: 'band'; id: number; width: number; height: number; layers: WireLayer[]; keys: string[]; y0: number; y1: number; matrix: Mat; quality: ImageSmoothingQuality; out?: SharedArrayBuffer };
export interface CompOut { id: number; y0: number; y1: number; pixels?: ArrayBuffer; error?: string }

export const COMPOSITE_MIN_PIXELS = 1_000_000;
const WORKER_BUDGET = 1_200_000_000;

interface Slot { w: Worker; has: Set<string> }
let slots: Slot[] = [];
let failed = false;
let nextId = 1;
let chain: Promise<unknown> = Promise.resolve();
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
  const next = chain.then(() => run(doc, width, height, matrix, quality), () => run(doc, width, height, matrix, quality));
  chain = next.catch(() => null);
  return next.catch(() => null);
}

import { parseManifest, wasmCheckBytes, wasmParamArray, wasmValues, WASM_ABI_V2, WASM_DEFAULT_LIMITS, WASM_LIMIT_RANGE, type WasmJob, type WasmLimits, type WasmManifest, type WasmReply, type WasmValues } from './wasm-plugin';
import { imageFromPlane, planeFromImage, wasmDescriptor, wasmLayout, wasmPack, wasmPick, wasmSampleBytes, wasmUnpack, type WasmFormat, type WasmModel, type WasmPlane } from './wasm-abi2';
import { bandPlan } from './band-pool';

/** The page side of the WebAssembly plug-in system: runs a module in a fresh Worker under a time limit, keeps the
 *  installed plug-ins in the browser's storage and loads them at startup. */

export interface WasmEntry { readonly manifest: WasmManifest; readonly bytes: ArrayBuffer; readonly installed: number }
export interface WasmRunOptions { signal?: AbortSignal; onProgress?: (percent: number) => void; limits?: WasmLimits }

const LIMITS_KEY = 'formvis.wasm.limits';

export function wasmLimits(): WasmLimits {
  try {
    const raw = JSON.parse(localStorage.getItem(LIMITS_KEY) ?? '{}') as Partial<WasmLimits>;
    return clampLimits({ ms: Number(raw.ms ?? WASM_DEFAULT_LIMITS.ms), memoryMb: Number(raw.memoryMb ?? WASM_DEFAULT_LIMITS.memoryMb) });
  } catch { return { ...WASM_DEFAULT_LIMITS }; }
}

export function setWasmLimits(limits: WasmLimits): WasmLimits {
  const clean = clampLimits(limits);
  try { localStorage.setItem(LIMITS_KEY, JSON.stringify(clean)); } catch { /* storage may be blocked */ }
  return clean;
}

function clampLimits(l: WasmLimits): WasmLimits {
  const fit = (v: number, r: readonly [number, number], def: number): number => (Number.isFinite(v) ? Math.min(r[1], Math.max(r[0], Math.round(v))) : def);
  return { ms: fit(l.ms, WASM_LIMIT_RANGE.ms, WASM_DEFAULT_LIMITS.ms), memoryMb: fit(l.memoryMb, WASM_LIMIT_RANGE.memoryMb, WASM_DEFAULT_LIMITS.memoryMb) };
}

/** Runs one Worker job; the Worker is ended when it answers, passes the time limit, fails or is cancelled. */
function work(job: WasmJob, transfer: Transferable[], opts: WasmRunOptions, limits: WasmLimits): Promise<Extract<WasmReply, { kind: 'schema' | 'done' }>> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    let w: Worker;
    try { w = new Worker(new URL('./wasm-plugin-worker.ts', import.meta.url), { type: 'module' }); }
    catch { reject(new Error('This browser cannot run plug-in workers.')); return; }
    const end = (): void => { window.clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort); w.terminate(); };
    const timer = window.setTimeout(() => { end(); reject(new Error(`The plug-in ran past its ${limits.ms / 1000} s time limit and was stopped.`)); }, limits.ms);
    const onAbort = (): void => { end(); reject(new DOMException('Cancelled', 'AbortError')); };
    opts.signal?.addEventListener('abort', onAbort);
    w.onmessage = (e: MessageEvent<WasmReply>) => {
      const r = e.data;
      if (r.kind === 'progress') { opts.onProgress?.(r.percent); return; }
      end();
      if (r.kind === 'error') reject(new Error(r.message)); else resolve(r);
    };
    w.onerror = (e) => { end(); reject(new Error(e.message || 'The plug-in worker failed.')); };
    w.postMessage(job, transfer);
  });
}

/** The manifest of a module: from its own schema export, else from the sidecar JSON text. The module is run under the limits. */
export async function inspectWasm(bytes: ArrayBuffer, sidecar?: string | null, limits = wasmLimits()): Promise<WasmManifest> {
  wasmCheckBytes(new Uint8Array(bytes), limits.memoryMb);
  const copy = bytes.slice(0), r = await work({ kind: 'inspect', bytes: copy, memoryMb: limits.memoryMb }, [copy], {}, limits);
  const schema = sidecar ?? (r.kind === 'schema' ? r.text : null);
  if (!schema) throw new Error('The module has no schema: export schema_ptr and schema_len, or install a .json file beside it.');
  let json: unknown;
  try { json = JSON.parse(schema); } catch { throw new Error('The plug-in schema is not valid JSON.'); }
  return parseManifest(json);
}

/** Pictures under this many pixels run in one piece even for a plug-in that takes bands. */
export const WASM_BAND_FROM = 1_000_000;

/** Rows per band for a plug-in that declares `bands`, or 0 when the picture runs whole: at least 64 rows and four times
 *  the reach, and small enough that every worker gets about three bands. */
export function wasmBandRows(m: Pick<WasmManifest, 'bands' | 'reach'>, width: number, height: number, workers = wasmWorkers()): number {
  if (!m.bands || width * height < WASM_BAND_FROM) return 0;
  const rows = Math.max(64, 4 * m.reach, Math.ceil(height / (workers * 3)));
  return rows >= height ? 0 : rows;
}

export function wasmWorkers(): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(cores - 1, 4));
}

/** `plane` cut into bands of `rows` (each read `reach` rows past its ends), run by `one` on up to `workers` Workers at a time, and
 *  joined: only each band's own rows are kept, so a plug-in that reads at most `reach` pixels away gives the whole-picture result. */
export async function runWasmBands(plane: WasmPlane, reach: number, rows: number, one: (band: WasmPlane, signal: AbortSignal) => Promise<WasmPlane>, opts: WasmRunOptions = {}, workers = wasmWorkers()): Promise<WasmPlane> {
  const S = plane.n + (plane.alpha ? 1 : 0), stride = plane.width * S, plan = bandPlan(plane.height, reach, rows), out = new Float32Array(plane.data.length);
  const ctl = new AbortController(), pct = plan.map(() => 0);
  const onAbort = (): void => ctl.abort();
  if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  opts.signal?.addEventListener('abort', onAbort);
  let next = 0, failure: unknown = null;
  const lane = async (): Promise<void> => {
    while (!failure) {
      const i = next++;
      if (i >= plan.length) return;
      const b = plan[i];
      try {
        const got = await one({ n: plane.n, alpha: plane.alpha, width: plane.width, height: b.a1 - b.a0, data: plane.data.subarray(b.a0 * stride, b.a1 * stride) }, ctl.signal);
        if (got.data.length !== (b.a1 - b.a0) * stride) throw new Error('The plug-in returned a different amount of data.');
        out.set(got.data.subarray((b.y0 - b.a0) * stride, (b.y1 - b.a0) * stride), b.y0 * stride);
        pct[i] = 100;
        opts.onProgress?.(Math.round(pct.reduce((a, v) => a + v, 0) / plan.length));
      } catch (err) { failure ??= err; ctl.abort(); }
    }
  };
  try { await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, plan.length)) }, lane)); }
  finally { opts.signal?.removeEventListener('abort', onAbort); }
  if (failure) throw failure;
  return { n: plane.n, alpha: plane.alpha, width: plane.width, height: plane.height, data: out };
}

/** The plug-in's filter run on `src` (8 bit RGBA, straight alpha). Rejects on a time-out, a cancel or a plug-in error. */
export async function runWasmFilter(entry: WasmEntry, values: WasmValues, src: ImageData, opts: WasmRunOptions = {}): Promise<ImageData> {
  if (entry.manifest.abi === WASM_ABI_V2) return imageFromPlane(await runWasmPlane(entry, values, planeFromImage(src), 'rgb', 8, opts));
  const rows = wasmBandRows(entry.manifest, src.width, src.height);
  if (rows) {
    const whole = await runWasmBands(planeFromImage(src), entry.manifest.reach, rows, async (band, signal) => planeFromImage(await runWasmFilterOnce(entry, values, imageFromPlane(band), { limits: opts.limits, signal })), opts);
    return imageFromPlane(whole);
  }
  return runWasmFilterOnce(entry, values, src, opts);
}

async function runWasmFilterOnce(entry: WasmEntry, values: WasmValues, src: ImageData, opts: WasmRunOptions): Promise<ImageData> {
  const limits = opts.limits ?? wasmLimits(), bytes = entry.bytes.slice(0), pixels = new Uint8ClampedArray(src.data).buffer as ArrayBuffer;
  const job: WasmJob = { kind: 'run', bytes, memoryMb: limits.memoryMb, width: src.width, height: src.height, pixels, params: wasmParamArray(entry.manifest, wasmValues(entry.manifest, values)) };
  const r = await work(job, [bytes, pixels], opts, limits);
  if (r.kind !== 'done') throw new Error('The plug-in gave no picture.');
  return new ImageData(new Uint8ClampedArray(r.pixels), src.width, src.height);
}

/** An ABI v2 plug-in run on a plane of floats (16 bit, 32 bit, CMYK, Lab, one channel, with or without alpha) in the format the plug-in declares. */
export async function runWasmPlane(entry: WasmEntry, values: WasmValues, plane: WasmPlane, model: WasmModel, depth: 8 | 16 | 32, opts: WasmRunOptions = {}): Promise<WasmPlane> {
  const m = entry.manifest;
  if (m.abi !== WASM_ABI_V2) throw new Error(`${m.name} speaks ABI 1 and takes only 8 bit RGBA pictures.`);
  const pick = wasmPick(m, model, depth);
  if ('error' in pick) throw new Error(pick.error);
  const rows = wasmBandRows(m, plane.width, plane.height);
  if (rows) return runWasmBands(plane, m.reach, rows, (band, signal) => runWasmPlaneOnce(entry, values, band, model, depth, pick.format, { limits: opts.limits, signal }), opts);
  return runWasmPlaneOnce(entry, values, plane, model, depth, pick.format, opts);
}

async function runWasmPlaneOnce(entry: WasmEntry, values: WasmValues, plane: WasmPlane, model: WasmModel, depth: 8 | 16 | 32, format: WasmFormat, opts: WasmRunOptions): Promise<WasmPlane> {
  const m = entry.manifest;
  const limits = opts.limits ?? wasmLimits(), lay = wasmLayout(m, plane, model, format, depth), bytes = entry.bytes.slice(0), samples = wasmPack(plane, lay);
  const job: WasmJob = { kind: 'run2', bytes, memoryMb: limits.memoryMb, width: plane.width, height: plane.height, samples, params: wasmParamArray(m, wasmValues(m, values)), desc: [...wasmDescriptor(lay, plane.width)] };
  const r = await work(job, [bytes, samples], opts, limits);
  if (r.kind !== 'done') throw new Error('The plug-in gave no picture.');
  if (r.pixels.byteLength !== wasmSampleBytes(lay, plane.width, plane.height)) throw new Error('The plug-in returned a different amount of data.');
  return wasmUnpack(r.pixels, plane, lay, m.alpha);
}

const DB = 'formvis-wasm-plugins', STORE = 'plugins';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = act(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** The installed plug-ins, kept in IndexedDB and in memory. */
export class WasmRegistry {
  private readonly map = new Map<string, WasmEntry>();
  private stored = true;
  private readonly listeners = new Set<() => void>();
  /** Calls `fn` after every install, removal and load. */
  watch(fn: () => void): void { this.listeners.add(fn); }
  private changed(): void { for (const fn of this.listeners) fn(); }

  list(): WasmEntry[] { return [...this.map.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)); }
  get(id: string): WasmEntry | undefined { return this.map.get(id); }
  get persistent(): boolean { return this.stored; }

  /** Loads what was installed before; a record that no longer passes the checks is skipped. */
  async load(): Promise<number> {
    try {
      const rows = await tx<Array<{ id: string; bytes: ArrayBuffer; manifest: unknown; installed: number }>>('readonly', (s) => s.getAll());
      for (const r of rows) {
        try { wasmCheckBytes(new Uint8Array(r.bytes), wasmLimits().memoryMb); this.map.set(r.id, { manifest: parseManifest(r.manifest), bytes: r.bytes, installed: r.installed }); } catch { /* left out */ }
      }
    } catch { this.stored = false; }
    this.changed();
    return this.map.size;
  }

  /** Installs (or replaces, by id) a module; `sidecar` is the text of its .json schema when it carries none. */
  async install(bytes: ArrayBuffer, sidecar?: string | null): Promise<WasmEntry> {
    const manifest = await inspectWasm(bytes, sidecar), entry: WasmEntry = { manifest, bytes: bytes.slice(0), installed: Date.now() };
    this.map.set(manifest.id, entry);
    if (this.stored) { try { await tx('readwrite', (s) => s.put({ id: manifest.id, manifest, bytes: entry.bytes, installed: entry.installed })); } catch { this.stored = false; } }
    this.changed();
    return entry;
  }

  async remove(id: string): Promise<boolean> {
    if (!this.map.delete(id)) return false;
    if (this.stored) { try { await tx('readwrite', (s) => s.delete(id)); } catch { this.stored = false; } }
    this.changed();
    return true;
  }
}

export const wasmPlugins = new WasmRegistry();

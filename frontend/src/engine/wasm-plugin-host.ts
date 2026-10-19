import { parseManifest, wasmCheckBytes, wasmParamArray, wasmValues, WASM_DEFAULT_LIMITS, WASM_LIMIT_RANGE, type WasmJob, type WasmLimits, type WasmManifest, type WasmReply, type WasmValues } from './wasm-plugin';

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

/** The plug-in's filter run on `src` (8 bit RGBA, straight alpha). Rejects on a time-out, a cancel or a plug-in error. */
export async function runWasmFilter(entry: WasmEntry, values: WasmValues, src: ImageData, opts: WasmRunOptions = {}): Promise<ImageData> {
  const limits = opts.limits ?? wasmLimits(), bytes = entry.bytes.slice(0), pixels = new Uint8ClampedArray(src.data).buffer as ArrayBuffer;
  const job: WasmJob = { kind: 'run', bytes, memoryMb: limits.memoryMb, width: src.width, height: src.height, pixels, params: wasmParamArray(entry.manifest, wasmValues(entry.manifest, values)) };
  const r = await work(job, [bytes, pixels], opts, limits);
  if (r.kind !== 'done') throw new Error('The plug-in gave no picture.');
  return new ImageData(new Uint8ClampedArray(r.pixels), src.width, src.height);
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

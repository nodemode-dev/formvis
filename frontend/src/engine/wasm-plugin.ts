/** WebAssembly filter plug-ins, ABI v1 (docs/WASM_PLUGINS.md): the manifest a plug-in declares, the limits a module
 *  must keep, and the parameter values passed to its filter. Pure functions: the worker and the page both use them. */

export const WASM_ABI = 1;
export const WASM_MAX_MODULE = 1 << 20;
export const WASM_PAGE = 65536;
export const WASM_PROGRESS = ['env', 'progress'] as const;
export const WASM_REQUIRED = ['alloc', 'filter', 'abi_version'] as const;

export interface WasmLimits { ms: number; memoryMb: number }
export const WASM_DEFAULT_LIMITS: WasmLimits = { ms: 10000, memoryMb: 256 };
export const WASM_LIMIT_RANGE = { ms: [500, 120000], memoryMb: [16, 1024] } as const;

export type WasmValue = number | string | boolean;
export type WasmValues = Record<string, WasmValue>;
export type WasmParam =
  | { readonly key: string; readonly label: string; readonly kind: 'range'; readonly min: number; readonly max: number; readonly step: number; readonly def: number }
  | { readonly key: string; readonly label: string; readonly kind: 'select'; readonly options: ReadonlyArray<readonly [string, string]>; readonly def: string }
  | { readonly key: string; readonly label: string; readonly kind: 'check'; readonly def: boolean };
export interface WasmManifest { readonly abi: number; readonly id: string; readonly name: string; readonly version: string; readonly author: string; readonly description: string; readonly reach: number; readonly params: readonly WasmParam[] }

export type WasmJob =
  | { kind: 'inspect'; bytes: ArrayBuffer; memoryMb: number }
  | { kind: 'run'; bytes: ArrayBuffer; memoryMb: number; width: number; height: number; pixels: ArrayBuffer; params: number[] };
export type WasmReply =
  | { kind: 'progress'; percent: number }
  | { kind: 'schema'; text: string | null }
  | { kind: 'done'; pixels: ArrayBuffer }
  | { kind: 'error'; message: string };

export const isWasmKind = (kind: string): boolean => kind.startsWith('wasm:');
export const wasmKind = (id: string): string => `wasm:${id}`;
export const wasmIdOf = (kind: string): string => kind.slice(5);

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, name: string): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`The schema's ${name} must be a number.`); return v; };

/** The manifest a plug-in's schema describes, checked; throws an Error that says what is wrong. */
export function parseManifest(raw: unknown): WasmManifest {
  if (!raw || typeof raw !== 'object') throw new Error('The plug-in schema is not a JSON object.');
  const o = raw as Record<string, unknown>;
  if (o.abi !== WASM_ABI) throw new Error(`The schema asks for ABI ${String(o.abi)}; this formvis speaks ABI ${WASM_ABI}.`);
  const id = text(o.id, 40);
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) throw new Error('The schema id must be lower case letters, digits and hyphens.');
  const name = text(o.name, 60);
  if (!name) throw new Error('The schema needs a name.');
  const list = Array.isArray(o.params) ? o.params : [];
  if (list.length > 32) throw new Error('A plug-in may declare at most 32 parameters.');
  const seen = new Set<string>();
  const params = list.map((item): WasmParam => {
    const p = (item ?? {}) as Record<string, unknown>, key = text(p.key, 32), label = text(p.label, 60) || key;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key) || seen.has(key)) throw new Error(`Parameter key "${key}" is missing or repeated.`);
    seen.add(key);
    if (p.kind === 'range') {
      const min = num(p.min, `${key} min`), max = num(p.max, `${key} max`), step = num(p.step ?? 1, `${key} step`), def = num(p.def ?? min, `${key} def`);
      if (!(max > min) || !(step > 0)) throw new Error(`Parameter ${key} needs max above min and a positive step.`);
      return { key, label, kind: 'range', min, max, step, def: Math.min(max, Math.max(min, def)) };
    }
    if (p.kind === 'select') {
      const opts = (Array.isArray(p.options) ? p.options : []).slice(0, 64).map((x) => (Array.isArray(x) ? [text(x[0], 40), text(x[1], 60)] as const : null));
      if (!opts.length || opts.some((x) => !x || !x[0])) throw new Error(`Parameter ${key} needs a list of [value, label] options.`);
      const options = opts as Array<readonly [string, string]>, def = typeof p.def === 'string' && options.some((x) => x[0] === p.def) ? p.def : options[0][0];
      return { key, label, kind: 'select', options, def };
    }
    if (p.kind === 'check') return { key, label, kind: 'check', def: p.def === true };
    throw new Error(`Parameter ${key} has an unknown kind; use range, select or check.`);
  });
  const reach = typeof o.reach === 'number' && Number.isFinite(o.reach) ? Math.max(0, Math.min(512, Math.ceil(o.reach))) : 0;
  return { abi: WASM_ABI, id, name, version: text(o.version, 24) || '0', author: text(o.author, 60), description: text(o.description, 300), reach, params };
}

export function wasmDefaults(m: WasmManifest): WasmValues {
  const out: WasmValues = {};
  for (const p of m.params) out[p.key] = p.def;
  return out;
}

/** `raw` cleaned to the manifest: unknown keys dropped, ranges clamped, bad values replaced by the default. */
export function wasmValues(m: WasmManifest, raw: unknown): WasmValues {
  const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}, out = wasmDefaults(m);
  for (const p of m.params) {
    const v = given[p.key];
    if (p.kind === 'range' && typeof v === 'number' && Number.isFinite(v)) out[p.key] = Math.min(p.max, Math.max(p.min, v));
    else if (p.kind === 'select' && typeof v === 'string' && p.options.some((o) => o[0] === v)) out[p.key] = v;
    else if (p.kind === 'check' && typeof v === 'boolean') out[p.key] = v;
  }
  return out;
}

/** The f32 array the filter receives: one number per parameter, in schema order. */
export function wasmParamArray(m: WasmManifest, values: WasmValues): number[] {
  return m.params.map((p) => {
    const v = values[p.key];
    return p.kind === 'select' ? Math.max(0, p.options.findIndex((o) => o[0] === v)) : p.kind === 'check' ? (v === true ? 1 : 0) : Number(v);
  });
}

const leb = (b: Uint8Array, at: { i: number }): number => {
  let out = 0, shift = 0;
  for (let n = 0; n < 5; n++) {
    const byte = b[at.i++];
    if (byte === undefined) throw new Error('The module ends in the middle of a number.');
    out += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return out;
    shift += 7;
  }
  throw new Error('The module has a number that is too long.');
};

/** The module's first memory as declared: initial and maximum pages (max null when it declares none). */
export function wasmMemory(bytes: Uint8Array): { min: number; max: number | null } | null {
  const at = { i: 8 };
  while (at.i < bytes.length) {
    const id = bytes[at.i++], size = leb(bytes, at), end = at.i + size;
    if (id === 5) {
      if (leb(bytes, at) < 1) return null;
      const flags = leb(bytes, at);
      if (flags & 6) throw new Error('Shared and 64 bit memories are not allowed.');
      const min = leb(bytes, at), max = flags & 1 ? leb(bytes, at) : null;
      return { min, max };
    }
    at.i = end;
  }
  return null;
}

/** Throws what is wrong with a module before any of its code runs: size, header, and a memory that could outgrow the cap. */
export function wasmCheckBytes(bytes: Uint8Array, memoryMb: number): void {
  if (bytes.length > WASM_MAX_MODULE) throw new Error(`The module is ${Math.ceil(bytes.length / 1024)} KB; the limit is ${WASM_MAX_MODULE / 1024} KB.`);
  if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) throw new Error('This is not a WebAssembly module.');
  const mem = wasmMemory(bytes), cap = Math.floor((memoryMb * 1024 * 1024) / WASM_PAGE);
  if (!mem) throw new Error('The module defines no memory of its own.');
  if (mem.max === null) throw new Error(`The module declares no memory maximum; set one of at most ${memoryMb} MB.`);
  if (mem.max > cap) throw new Error(`The module could grow to ${Math.ceil((mem.max * WASM_PAGE) / 1048576)} MB; the limit is ${memoryMb} MB.`);
}

/** Throws what is wrong with a compiled module's imports and exports. */
export function wasmCheckModule(mod: WebAssembly.Module): void {
  for (const i of WebAssembly.Module.imports(mod)) {
    if (i.module !== WASM_PROGRESS[0] || i.name !== WASM_PROGRESS[1] || i.kind !== 'function') throw new Error(`The module imports ${i.module}.${i.name}; the sandbox provides only env.progress.`);
  }
  const ex = WebAssembly.Module.exports(mod);
  if (!ex.some((e) => e.name === 'memory' && e.kind === 'memory')) throw new Error('The module does not export memory.');
  for (const n of WASM_REQUIRED) if (!ex.some((e) => e.name === n && e.kind === 'function')) throw new Error(`The module does not export ${n}.`);
}

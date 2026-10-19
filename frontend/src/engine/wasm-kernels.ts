/** WebAssembly pixel kernels (native/formvis-kernels: Rust, dependency free, SIMD). Each module is its own chunk, fetched
 *  and compiled on first use in the background with streaming compilation (the byte-buffer route when streaming is
 *  refused) and kept, so startup never waits on it; until a chunk is ready every call answers null and the caller runs
 *  its TypeScript twin, which gives the same bytes. A chunk that fails to load is not tried again. */

export type KernelChunk = 'mask' | 'tone' | 'blur' | 'resample' | 'dither' | 'heal';
type Fn = (...args: number[]) => number;
interface Chunk { memory: WebAssembly.Memory; fn: Record<string, Fn> }
type State = 'idle' | 'loading' | 'ready' | 'failed';

const ABI = 1;
const URLS: Record<KernelChunk, string> = {
  mask: new URL('./kernels-wasm/formvis-kernels-mask.wasm', import.meta.url).href,
  tone: new URL('./kernels-wasm/formvis-kernels-tone.wasm', import.meta.url).href,
  blur: new URL('./kernels-wasm/formvis-kernels-blur.wasm', import.meta.url).href,
  resample: new URL('./kernels-wasm/formvis-kernels-resample.wasm', import.meta.url).href,
  dither: new URL('./kernels-wasm/formvis-kernels-dither.wasm', import.meta.url).href,
  heal: new URL('./kernels-wasm/formvis-kernels-heal.wasm', import.meta.url).href,
};
const LIMIT = 1 << 30;
const RENEW = 3 << 28;
const canLoad = typeof WebAssembly === 'object' && typeof fetch === 'function' && typeof self !== 'undefined';

const modules = new Map<KernelChunk, WebAssembly.Module>();
const ready = new Map<KernelChunk, Chunk>();
const loading = new Map<KernelChunk, Promise<boolean>>();
const failed = new Set<KernelChunk>();
const calls: Record<KernelChunk, number> = { mask: 0, tone: 0, blur: 0, resample: 0, dither: 0, heal: 0 };
let enabled = true;

function open(module: WebAssembly.Module): Chunk | null {
  const exports = new WebAssembly.Instance(module, {}).exports as unknown as Record<string, unknown>;
  const memory = exports.memory;
  if (!(memory instanceof WebAssembly.Memory) || typeof exports.fv_abi !== 'function' || (exports.fv_abi as Fn)() !== ABI) return null;
  const fn: Record<string, Fn> = {};
  for (const [name, value] of Object.entries(exports)) if (typeof value === 'function') fn[name] = value as Fn;
  return { memory, fn };
}

async function compile(url: string): Promise<WebAssembly.Module> {
  try {
    return await WebAssembly.compileStreaming(fetch(url));
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`kernel module ${url}: ${response.status}`);
    return WebAssembly.compile(await response.arrayBuffer());
  }
}

/** Starts fetching and compiling one chunk (once) and resolves true when it is ready to use. */
export function warmKernels(name: KernelChunk): Promise<boolean> {
  if (ready.has(name)) return Promise.resolve(true);
  if (!canLoad || failed.has(name)) return Promise.resolve(false);
  const pending = loading.get(name);
  if (pending) return pending;
  const job = compile(URLS[name]).then((module) => {
    const chunk = open(module);
    if (!chunk) throw new Error('kernel module ABI');
    modules.set(name, module);
    ready.set(name, chunk);
    return true;
  }).catch(() => {
    failed.add(name);
    return false;
  }).finally(() => { loading.delete(name); });
  loading.set(name, job);
  return job;
}

/** The ready chunk, or null while it loads (this call starts the load), when it failed, or when kernels are switched off. */
export function kernelChunk(name: KernelChunk): Chunk | null {
  if (!enabled) return null;
  const hit = ready.get(name);
  if (hit) return hit;
  void warmKernels(name);
  return null;
}

/** Switches the WebAssembly route on or off (off sends every call to the TypeScript kernels). */
export function setKernelsEnabled(on: boolean): void { enabled = on; }

export function kernelStats(): { enabled: boolean; chunks: Record<KernelChunk, { state: State; calls: number; memory: number }> } {
  const one = (name: KernelChunk) => ({ state: (ready.has(name) ? 'ready' : loading.has(name) ? 'loading' : failed.has(name) ? 'failed' : 'idle') as State, calls: calls[name], memory: ready.get(name)?.memory.buffer.byteLength ?? 0 });
  return { enabled, chunks: { mask: one('mask'), tone: one('tone'), blur: one('blur'), resample: one('resample'), dither: one('dither'), heal: one('heal') } };
}

/** Memory never shrinks, so after a very large image the chunk is opened again from its compiled module. */
function settle(name: KernelChunk, chunk: Chunk): void {
  calls[name]++;
  if (chunk.memory.buffer.byteLength <= RENEW) return;
  const module = modules.get(name), fresh = module ? open(module) : null;
  if (fresh) ready.set(name, fresh); else ready.delete(name);
}

function run<T>(name: KernelChunk, sizes: number[], job: (chunk: Chunk, at: number[]) => T): T | null {
  const chunk = kernelChunk(name);
  if (!chunk || sizes.reduce((a, b) => a + b, 0) > LIMIT) return null;
  const at: number[] = [];
  try {
    for (const size of sizes) {
      const p = chunk.fn.fv_alloc(size);
      if (!p) return null;
      at.push(p);
    }
    const out = job(chunk, at);
    settle(name, chunk);
    return out;
  } catch {
    return null;
  } finally {
    at.forEach((p, i) => { try { chunk.fn.fv_free(p, sizes[i]); } catch { /* the instance is dropped on the next renewal */ } });
  }
}

const bytes = (chunk: Chunk, at: number, length: number): Uint8Array => new Uint8Array(chunk.memory.buffer, at, length);

/** The per-channel lookup of a Levels, Curves or Exposure adjustment (`lut` holds the red, green and blue tables end to end). */
export function wasmLut(px: Uint8ClampedArray, lut: Uint8Array): boolean {
  if (px.length % 4 !== 0 || px.length < 4096) return false;
  return run('tone', [px.length, 768], (chunk, [p, l]) => {
    bytes(chunk, p, px.length).set(px);
    bytes(chunk, l, 768).set(lut);
    chunk.fn.fv_lut(p, px.length, l);
    px.set(bytes(chunk, p, px.length));
    return true;
  }) === true;
}

export function wasmInvert(px: Uint8ClampedArray): boolean {
  if (px.length % 4 !== 0 || px.length < 4096) return false;
  return run('tone', [px.length], (chunk, [p]) => {
    bytes(chunk, p, px.length).set(px);
    chunk.fn.fv_invert(p, px.length);
    px.set(bytes(chunk, p, px.length));
    return true;
  }) === true;
}

/** Magic Wand mask; null when the answer must come from the TypeScript kernel (chunk not ready, odd arguments). */
export function wasmWand(rgba: Uint8ClampedArray, width: number, height: number, seedX: number, seedY: number, tolerance: number, contiguous: boolean, radius: number): Uint8Array | null {
  const n = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(seedX) || !Number.isInteger(seedY) || !Number.isInteger(radius) || radius < 0 || !Number.isFinite(tolerance)) return null;
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height || rgba.length !== n * 4 || n < 1024) return null;
  const tol = Math.min(255, Math.max(0, Math.round(tolerance)));
  return run('mask', [n * 4, n], (chunk, [p, o]) => {
    bytes(chunk, p, n * 4).set(rgba);
    chunk.fn.fv_wand(p, width, height, seedX, seedY, tol, contiguous ? 1 : 0, radius, o);
    return bytes(chunk, o, n).slice();
  });
}

function maskPass(name: 'fv_antialias' | 'fv_enhance_edge', mask: Uint8Array, width: number, height: number): Uint8Array | null {
  const n = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || mask.length !== n || n < 1024) return null;
  return run('mask', [n, n], (chunk, [p, o]) => {
    bytes(chunk, p, n).set(mask);
    chunk.fn[name](p, width, height, o);
    return bytes(chunk, o, n).slice();
  });
}

export const wasmAntialias = (mask: Uint8Array, width: number, height: number): Uint8Array | null => maskPass('fv_antialias', mask, width, height);
export const wasmEnhanceEdge = (mask: Uint8Array, width: number, height: number): Uint8Array | null => maskPass('fv_enhance_edge', mask, width, height);

export function wasmSensitivity(mask: Uint8Array, sensitivity: number): Uint8Array | null {
  const n = mask.length;
  if (n < 1024 || !Number.isFinite(sensitivity)) return null;
  return run('mask', [n, n], (chunk, [p, o]) => {
    bytes(chunk, p, n).set(mask);
    chunk.fn.fv_sensitivity(p, n, sensitivity, o);
    return bytes(chunk, o, n).slice();
  });
}

/** The three box blurs of a Gaussian Blur on premultiplied floats (rows then columns each time), left in `a`. */
export function wasmGaussian(a: Float32Array, width: number, height: number, radii: number[]): boolean {
  if (radii.length !== 3 || !radii.every((r) => Number.isInteger(r) && r >= 0) || a.length !== width * height * 4 || a.length < 4096) return false;
  return run('blur', [a.byteLength, a.byteLength], (chunk, [pa, pb]) => {
    new Float32Array(chunk.memory.buffer, pa, a.length).set(a);
    chunk.fn.fv_gaussian(pa, pb, width, height, radii[0], radii[1], radii[2]);
    a.set(new Float32Array(chunk.memory.buffer, pa, a.length));
    return true;
  }) === true;
}

/** The tap weights of one resampling direction, rows end to end: row `i` is `weights[offs[i]..offs[i + 1]]`, starting at source index `start[i]`. */
export interface Taps { start: Int32Array; offs: Uint32Array; weights: Float32Array }

/** Image Size's separable kernels (bilinear, bicubic and the rest) over the page's own tap weights, summed in the same
 *  order as the TypeScript; the resampled bytes, or null where the TypeScript pass must run. */
export function wasmResample(src: Uint8ClampedArray, sw: number, sh: number, w: number, h: number, hx: Taps, vy: Taps): Uint8ClampedArray | null {
  if (![sw, sh, w, h].every((v) => Number.isInteger(v) && v > 0) || src.length !== sw * sh * 4 || sw * sh < 4096) return null;
  if (hx.start.length !== w || hx.offs.length !== w + 1 || vy.start.length !== h || vy.offs.length !== h + 1) return null;
  const out = w * h * 4;
  return run('resample', [src.length, w * sh * 16, out, hx.start.byteLength, hx.offs.byteLength, hx.weights.byteLength, vy.start.byteLength, vy.offs.byteLength, vy.weights.byteLength], (chunk, [ps, pm, po, phs, pho, phw, pvs, pvo, pvw]) => {
    const mem = chunk.memory.buffer;
    bytes(chunk, ps, src.length).set(src);
    new Int32Array(mem, phs, w).set(hx.start);
    new Uint32Array(mem, pho, w + 1).set(hx.offs);
    new Float32Array(mem, phw, hx.weights.length).set(hx.weights);
    new Int32Array(mem, pvs, h).set(vy.start);
    new Uint32Array(mem, pvo, h + 1).set(vy.offs);
    new Float32Array(mem, pvw, vy.weights.length).set(vy.weights);
    bytes(chunk, po, out).fill(0);
    chunk.fn.fv_resample_h(ps, sw, sh, w, phs, pho, phw, pm);
    chunk.fn.fv_resample_v(pm, w, sh, h, pvs, pvo, pvw, po);
    return new Uint8ClampedArray(bytes(chunk, po, out).slice().buffer);
  });
}

/** The ordered Dither filter over `d` in place (`matrix` is the threshold matrix of side `n`); false where the TypeScript must run. */
export function wasmDither(d: Uint8ClampedArray, w: number, matrix: ArrayLike<number>, n: number, q: number, pixel: number, colour: boolean, amount: number, ink: ArrayLike<number>, paper: ArrayLike<number>, ox: number, oy: number): boolean {
  if (d.length % 4 !== 0 || d.length < 4096 || !Number.isInteger(w) || w < 1 || !Number.isInteger(n) || n < 1 || matrix.length !== n * n || !Number.isInteger(q) || q < 1) return false;
  if (![pixel, amount, ox, oy, ...Array.from(ink), ...Array.from(paper)].every(Number.isFinite) || pixel < 1 || ink.length < 3 || paper.length < 3) return false;
  return run('dither', [d.length, n * n * 2], (chunk, [p, mp]) => {
    bytes(chunk, p, d.length).set(d);
    new Uint16Array(chunk.memory.buffer, mp, n * n).set(matrix);
    chunk.fn.fv_dither(p, d.length, w, mp, n, q, pixel, colour ? 1 : 0, amount, ink[0], ink[1], ink[2], paper[0], paper[1], paper[2], ox, oy);
    d.set(bytes(chunk, p, d.length));
    return true;
  }) === true;
}

/** The per-pixel part of a healing brush's blend mode: writes the full-strength heal into `full` (zeroed) and, for Replace, the chosen pixels into `out`; false where the TypeScript must run. */
export function wasmHealFull(before: Uint8ClampedArray, out: Uint8ClampedArray, coverage: Uint8Array, w: number, opacity: number, replace: boolean, full: Uint8ClampedArray): boolean {
  const n = coverage.length;
  if (n < 1024 || before.length !== n * 4 || out.length !== n * 4 || full.length !== n * 4 || !Number.isInteger(w) || w < 1 || !Number.isFinite(opacity)) return false;
  return run('heal', [n * 4, n * 4, n, n * 4], (chunk, [pb, po, pc, pf]) => {
    bytes(chunk, pb, n * 4).set(before);
    bytes(chunk, po, n * 4).set(out);
    bytes(chunk, pc, n).set(coverage);
    bytes(chunk, pf, n * 4).fill(0);
    chunk.fn.fv_heal_full(pb, po, pc, n, w, opacity, replace ? 1 : 0, pf);
    out.set(bytes(chunk, po, n * 4));
    full.set(bytes(chunk, pf, n * 4));
    return true;
  }) === true;
}

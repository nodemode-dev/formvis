import { wasmTransfer } from './wasm-kernels';

/** The deep composite's per-value transfer for Levels, Curves and Exposure, with a power function written out in
 *  plain double arithmetic (a natural log by the atanh series, an exponential by range reduction and a Taylor
 *  polynomial) so the TypeScript here and `native/formvis-kernels/src/transfer.rs` run the same operations in the same
 *  order and give the same bits; Math.pow is left to the 8-bit tables. */
export type Stage =
  | { k: 1; lo: number; hi: number; ig: number; ol: number; oh: number }
  | { k: 2; x: Float64Array; y: Float64Array; t: Float64Array }
  | { k: 3; gain: number; off: number; ig: number };
export type Chains = Stage[][];

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, LOG2E = 1.4426950408889634;

function flog(x: number): number {
  let e = 0;
  if (x < 2.2250738585072014e-308) { x *= 18014398509481984; e = -54; }
  f64[0] = x;
  const hi = u32[1];
  e += (hi >>> 20) - 1023;
  u32[1] = (hi & 0x000fffff) | 0x3ff00000;
  let m = f64[0];
  if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
  const s = (m - 1) / (m + 1), s2 = s * s;
  let r = 1 / 21;
  r = r * s2 + 1 / 19; r = r * s2 + 1 / 17; r = r * s2 + 1 / 15; r = r * s2 + 1 / 13; r = r * s2 + 1 / 11;
  r = r * s2 + 1 / 9; r = r * s2 + 1 / 7; r = r * s2 + 1 / 5; r = r * s2 + 1 / 3; r = r * s2 + 1;
  const lnm = 2 * s * r;
  return e * LN2_HI + (lnm + e * LN2_LO);
}

function pow2(n: number): number {
  u32[0] = 0; u32[1] = (n + 1023) << 20;
  return f64[0];
}

function fexp(z: number): number {
  if (z > 709.78) return Infinity;
  if (z < -745.2) return 0;
  const k = Math.floor(z * LOG2E + 0.5), r = (z - k * LN2_HI) - k * LN2_LO;
  let p = 1 / 6227020800;
  p = p * r + 1 / 479001600; p = p * r + 1 / 39916800; p = p * r + 1 / 3628800; p = p * r + 1 / 362880;
  p = p * r + 1 / 40320; p = p * r + 1 / 5040; p = p * r + 1 / 720; p = p * r + 1 / 120; p = p * r + 1 / 24;
  p = p * r + 1 / 6; p = p * r + 0.5; p = p * r + 1; p = p * r + 1;
  const k1 = k >> 1;
  return p * pow2(k1) * pow2(k - k1);
}

export function fpow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (x === 1) return 1;
  if (y === 1) return x;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return NaN;
  if (x === Infinity) return y > 0 ? Infinity : 0;
  return fexp(y * flog(x));
}

const jmax = (a: number, b: number): number => Math.max(a, b);
const clampTo = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const toLin = (e: number): number => (e <= 0.04045 ? e / 12.92 : fpow((e + 0.055) / 1.055, 2.4));
const toEnc = (l: number): number => (l <= 0.0031308 ? 12.92 * l : 1.055 * fpow(l, 1 / 2.4) - 0.055);
export const srgbToLinearP = (v: number): number => (v <= 0.04045 ? v / 12.92 : fpow((v + 0.055) / 1.055, 2.4));
export const linearToSrgbP = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * fpow(v, 1 / 2.4) - 0.055);

function evalStage(s: Stage, v: number): number {
  if (s.k === 1) return s.ol + (s.oh - s.ol) * fpow(clampTo((v - s.lo) / (s.hi - s.lo), 0, 1), s.ig);
  if (s.k === 3) return 255 * clampTo(toEnc(fpow(jmax(0, toLin(v / 255) * s.gain + s.off), s.ig)), 0, 1);
  const n = s.x.length;
  let lo = 0, hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s.x[mid] <= v) lo = mid; else hi = mid - 1;
  }
  const ax = s.x[lo], ay = s.y[lo], by = s.y[lo + 1], h = jmax(1e-6, s.x[lo + 1] - ax);
  const t = clampTo((v - ax) / h, 0, 1), t0 = s.t[lo], t1 = s.t[lo + 1];
  const c1 = h * t0, c2 = 3 * (by - ay) - h * (2 * t0 + t1), c3 = 2 * (ay - by) + h * (t0 + t1);
  return clampTo(((c3 * t + c2) * t + c1) * t + ay, 0, 255);
}

export function evalChain(chain: Stage[], level: number): number {
  let v = level;
  for (let i = 0; i < chain.length; i++) v = evalStage(chain[i], v);
  return v;
}

/** The chains as the flat f64 program the kernel reads: per channel the stage count, then each stage's numbers. */
export function encodeChains(chains: Chains): Float64Array {
  const out: number[] = [];
  for (let c = 0; c < 4; c++) {
    const chain = chains[c] ?? chains[0];
    out.push(chain.length);
    for (const s of chain) {
      if (s.k === 1) out.push(1, s.lo, s.hi, s.ig, s.ol, s.oh);
      else if (s.k === 3) out.push(3, s.gain, s.off, s.ig);
      else { out.push(2, s.x.length); for (const a of [s.x, s.y, s.t]) for (let i = 0; i < a.length; i++) out.push(a[i]); }
    }
  }
  return Float64Array.from(out);
}

/** A 16-bit pass of the transfer over `out` (S values per pixel, A of them colour) under opacity `op` and coverage `cov`. */
export function transferDeep(out: Float32Array, S: number, A: number, op: number, cov: Float32Array | null, paper: boolean, chains: Chains): void {
  if (A <= 4 && wasmTransfer(out, S, A, op, cov, paper, false, encodeChains(chains))) return;
  for (let i = 0, j = 0; i < out.length; i += S, j++) {
    const k = op * (cov ? cov[j] : 1);
    if (k <= 0) continue;
    for (let c = 0; c < A; c++) {
      const v = paper ? 1 - out[i + c] : out[i + c], nv = clamp01(evalChain(chains[c] ?? chains[0], v * 255) / 255), r = v + (nv - v) * k;
      out[i + c] = paper ? 1 - r : r;
    }
  }
}

/** A 32-bit pass: each pixel's colour within the display range (divided by its brightest channel when that passes white),
 *  sRGB-encoded, through the transfer and back, the brightness above white scaled in again. */
export function transferLinear(out: Float32Array, S: number, op: number, cov: Float32Array | null, chains: Chains): void {
  if (wasmTransfer(out, S, 3, op, cov, false, true, encodeChains(chains))) return;
  for (let i = 0, j = 0; i < out.length; i += S, j++) {
    const k = op * (cov ? cov[j] : 1);
    if (k <= 0) continue;
    const m = Math.max(1, out[i], out[i + 1], out[i + 2]);
    for (let c = 0; c < 3; c++) {
      const u = Math.max(0, out[i + c] / m);
      const nu = srgbToLinearP(Math.max(0, Math.min(1, evalChain(chains[c] ?? chains[0], linearToSrgbP(Math.min(1, u)) * 255) / 255)));
      out[i + c] += (nu * m - out[i + c]) * k;
    }
  }
}

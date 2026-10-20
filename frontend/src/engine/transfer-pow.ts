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
const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, LN2_HI32 = LN2_HI / 32, LN2_LO32 = LN2_LO / 32, LOG2E32 = 1.4426950408889634 * 32;
const LOG_INV = new Float64Array([0.9922480620155039, 0.9770992366412213, 0.9624060150375939, 0.9481481481481482, 0.9343065693430657, 0.920863309352518, 0.9078014184397163, 0.8951048951048951, 0.8827586206896552, 0.8707482993197279, 0.8590604026845637, 0.847682119205298, 0.8366013071895425, 0.8258064516129032, 0.8152866242038217, 0.8050314465408805, 0.7950310559006211, 0.7852760736196319, 0.7757575757575758, 0.7664670658682635, 0.757396449704142, 0.7485380116959064, 0.7398843930635838, 0.7314285714285714, 0.7231638418079096, 0.7150837988826816, 0.7071823204419889, 0.6994535519125683, 0.6918918918918919, 0.6844919786096256, 0.6772486772486772, 0.6701570680628273, 0.6632124352331606, 0.6564102564102564, 0.649746192893401, 0.6432160804020101, 0.6368159203980099, 0.6305418719211823, 0.624390243902439, 0.6183574879227053, 0.6124401913875598, 0.6066350710900474, 0.6009389671361502, 0.5953488372093023, 0.5898617511520737, 0.5844748858447488, 0.579185520361991, 0.5739910313901345, 0.5688888888888889, 0.5638766519823789, 0.5589519650655022, 0.5541125541125541, 0.5493562231759657, 0.5446808510638298, 0.540084388185654, 0.5355648535564853, 0.5311203319502075, 0.5267489711934157, 0.5224489795918368, 0.5182186234817814, 0.5140562248995983, 0.5099601593625498, 0.5059288537549407, 0.5019607843137255]);
const LOG_OFF = new Float64Array([0.007782140442054963, 0.023167059281534418, 0.03831886430213666, 0.05324451451881224, 0.06795066190850778, 0.08244366921107454, 0.09672962645855114, 0.11081436634029011, 0.12470347850095725, 0.1384023228591192, 0.151916042025842, 0.16524957289530717, 0.17840765747281825, 0.19139485299962947, 0.20421554142869083, 0.2168739383006143, 0.2293741010648459, 0.24171993688714513, 0.25391520998096345, 0.2659635484971379, 0.2778684510034563, 0.2896332925830427, 0.30126133057816185, 0.3127557100038969, 0.324119468654212, 0.3353555419211378, 0.3464667673462086, 0.3574558889218038, 0.36832556115870757, 0.3790783529349695, 0.38971675114002524, 0.40024316412701266, 0.4106599249852683, 0.42096929464412963, 0.43117346481837143, 0.4412745608048752, 0.4512746441394586, 0.46117571512217015, 0.470979715218791, 0.48068852934575196, 0.4903039880451939, 0.49982786955644926, 0.5092619017898079, 0.5186077642080457, 0.5278670896208424, 0.5370414658968837, 0.5461324375981356, 0.5551415075405016, 0.564070138284803, 0.5729197535617854, 0.5816917396346225, 0.5903874466021763, 0.5990081896460834, 0.6075552502245418, 0.616029877215514, 0.6244332880118936, 0.6327666695710378, 0.6410311794209312, 0.6492279466251097, 0.65735807270836, 0.6654226325450905, 0.6734226752121667, 0.6813592248079031, 0.689233281238809]);
const EXP_TAB = new Float64Array([1.0, 1.0218971486541166, 1.0442737824274138, 1.0671404006768237, 1.0905077326652577, 1.1143867425958924, 1.1387886347566916, 1.1637248587775775, 1.189207115002721, 1.215247359980469, 1.241857812073484, 1.2690509571917332, 1.2968395546510096, 1.3252366431597413, 1.3542555469368927, 1.383909881963832, 1.4142135623730951, 1.4451808069770467, 1.4768261459394993, 1.5091644275934228, 1.5422108254079407, 1.5759808451078865, 1.6104903319492543, 1.645755478153965, 1.681792830507429, 1.718619298122478, 1.7562521603732995, 1.7947090750031072, 1.8340080864093424, 1.8741676341103, 1.9152065613971474, 1.9571441241754002]);

function flog(x: number): number {
  let e = 0;
  if (x < 2.2250738585072014e-308) { x *= 18014398509481984; e = -54; }
  f64[0] = x;
  const hi = u32[1];
  const b = hi >>> 20, i = (hi >>> 14) & 63;
  e += b - 1023;
  const r = x * TWO[2046 - b] * LOG_INV[i] - 1;
  const r2 = r * r, q = (r * (1 / 3) - 0.5 + r2 * (r * 0.2 - 0.25)) + r2 * r2 * (r * (1 / 7) - 1 / 6);
  return e * LN2_HI + (LOG_OFF[i] + (r + r * r * q) + e * LN2_LO);
}

const TWO = new Float64Array(2047);
u32[0] = 0; u32[1] = 0x00080000; TWO[0] = f64[0];
for (let n = 1; n < 2047; n++) TWO[n] = TWO[n - 1] * 2;

function fexp(z: number): number {
  if (z > 709.78) return Infinity;
  if (z < -745.2) return 0;
  const kk = Math.floor(z * LOG2E32 + 0.5), r = (z - kk * LN2_HI32) - kk * LN2_LO32;
  const r2 = r * r, p = (r + 1 + r2 * (r * (1 / 6) + 0.5)) + r2 * r2 * ((r * (1 / 120) + 1 / 24) + r2 * (1 / 720));
  const k = kk >> 5, t = EXP_TAB[kk & 31] * p;
  if (k > -1000 && k < 1000) return t * TWO[k + 1023];
  const k1 = k >> 1;
  return t * TWO[k1 + 1023] * TWO[k - k1 + 1023];
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

/** The 16-bit pass through the adjustment's own transfer `t`, with each channel's answer for the 65,536 whole levels
 *  kept after its first use, so a level costs the transfer once; a value off the 16-bit grid runs `t` as it is. The
 *  output is the same bits as running `t` on every value. */
export function transferLut(out: Float32Array, S: number, A: number, op: number, cov: Float32Array | null, paper: boolean, t: (channel: number, level: number) => number): void {
  const tabs: Float64Array[] = [];
  for (let c = 0; c < A; c++) tabs.push(new Float64Array(65536).fill(NaN));
  for (let i = 0, j = 0; i < out.length; i += S, j++) {
    const k = op * (cov ? cov[j] : 1);
    if (k <= 0) continue;
    for (let c = 0; c < A; c++) {
      const x = out[i + c], v = paper ? 1 - x : x, q = Math.round(x * 65535);
      let nv: number;
      if (q >= 0 && q <= 65535 && Math.fround(q / 65535) === x) {
        nv = tabs[c][q];
        if (nv !== nv) nv = tabs[c][q] = clamp01(t(c, v * 255) / 255);
      } else nv = clamp01(t(c, v * 255) / 255);
      const r = v + (nv - v) * k;
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

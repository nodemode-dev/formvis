/** Colour lookup tables (1.53.5, the parity plan's H2): a GRID^3 RGB table from the engine's LittleCMS (r slowest, b
 *  fastest), applied with trilinear interpolation, as tests/test_colour.py checks against LittleCMS itself; optional
 *  gamut flags turn what a proof device cannot print grey (Gamut Warning). */
export interface ColourLut { grid: number; rgb: Uint8Array; gamut?: Uint8Array }

export const GAMUT_GREY = 128;

export function lutFrom(data: ArrayBuffer, grid: number, gamut: boolean): ColourLut {
  const n = grid * grid * grid, b = new Uint8Array(data);
  if (b.length < n * 3 + (gamut ? n : 0)) throw new Error('The colour table is incomplete.');
  return { grid, rgb: b.slice(0, n * 3), gamut: gamut ? b.slice(n * 3, n * 4) : undefined };
}

/** Applies `lut` to RGBA pixels in place (alpha kept); with `warn`, out-of-gamut pixels become GAMUT_GREY. */
export function applyLut(data: Uint8ClampedArray, lut: ColourLut, warn = false): void {
  const G = lut.grid, t = lut.rgb, s = (G - 1) / 255, gg = G * G, flags = warn ? lut.gamut : undefined;
  for (let i = 0; i < data.length; i += 4) {
    const x = data[i] * s, y = data[i + 1] * s, z = data[i + 2] * s;
    const x0 = Math.min(G - 2, x | 0), y0 = Math.min(G - 2, y | 0), z0 = Math.min(G - 2, z | 0);
    const fx = x - x0, fy = y - y0, fz = z - z0;
    if (flags && flags[Math.round(x) * gg + Math.round(y) * G + Math.round(z)]) { data[i] = data[i + 1] = data[i + 2] = GAMUT_GREY; continue; }
    const c000 = (x0 * gg + y0 * G + z0) * 3, c001 = c000 + 3, c010 = c000 + G * 3, c011 = c010 + 3;
    const c100 = c000 + gg * 3, c101 = c100 + 3, c110 = c100 + G * 3, c111 = c110 + 3;
    for (let k = 0; k < 3; k++) {
      const a = t[c000 + k] + (t[c001 + k] - t[c000 + k]) * fz, b = t[c010 + k] + (t[c011 + k] - t[c010 + k]) * fz;
      const c = t[c100 + k] + (t[c101 + k] - t[c100 + k]) * fz, d = t[c110 + k] + (t[c111 + k] - t[c110 + k]) * fz;
      const e = a + (b - a) * fy, f = c + (d - c) * fy;
      data[i + k] = e + (f - e) * fx;
    }
  }
}

/** A table built in the window: each grid point through `fn` (for tests and identity). */
export function lutOf(grid: number, fn: (r: number, g: number, b: number) => [number, number, number]): ColourLut {
  const rgb = new Uint8Array(grid ** 3 * 3), step = 255 / (grid - 1);
  let o = 0;
  for (let r = 0; r < grid; r++) for (let g = 0; g < grid; g++) for (let b = 0; b < grid; b++) { const v = fn(r * step, g * step, b * step); rgb[o++] = v[0]; rgb[o++] = v[1]; rgb[o++] = v[2]; }
  return { grid, rgb };
}

/** A CMYK document's display table (1.54.0, H1): GRID^4 sRGB triples from the engine's LittleCMS (c slowest, k fastest). */
export interface Lut4 { grid: number; rgb: Uint8Array }

export function lut4From(data: ArrayBuffer, grid: number): Lut4 {
  const b = new Uint8Array(data);
  if (b.length < grid ** 4 * 3) throw new Error('The CMYK table is incomplete.');
  return { grid, rgb: b.slice(0, grid ** 4 * 3) };
}

/** Ink (five floats a pixel, 0 to 1, alpha last) to RGBA bytes through `lut`, quadrilinear; alpha carried over. */
export function applyLut4(ink: Float32Array, lut: Lut4, out: Uint8ClampedArray): void {
  const G = lut.grid, t = lut.rgb, s = G - 1, g2 = G * G, g3 = g2 * G, w = new Float64Array(16), idx = new Int32Array(16), acc = [0, 0, 0];
  for (let i = 0, o = 0; i < ink.length; i += 5, o += 4) {
    const cs = [ink[i], ink[i + 1], ink[i + 2], ink[i + 3]], base = [0, 0, 0, 0], f = [0, 0, 0, 0];
    for (let d = 0; d < 4; d++) { const v = Math.min(1, Math.max(0, cs[d])) * s, v0 = Math.min(G - 2, v | 0); base[d] = v0; f[d] = v - v0; }
    for (let k = 0; k < 16; k++) {
      const dc = k & 1, dm = (k >> 1) & 1, dy = (k >> 2) & 1, dk = (k >> 3) & 1;
      w[k] = (dc ? f[0] : 1 - f[0]) * (dm ? f[1] : 1 - f[1]) * (dy ? f[2] : 1 - f[2]) * (dk ? f[3] : 1 - f[3]);
      idx[k] = ((base[0] + dc) * g3 + (base[1] + dm) * g2 + (base[2] + dy) * G + base[3] + dk) * 3;
    }
    acc[0] = acc[1] = acc[2] = 0;
    for (let k = 0; k < 16; k++) { const wk = w[k]; if (wk === 0) continue; const p = idx[k]; acc[0] += t[p] * wk; acc[1] += t[p + 1] * wk; acc[2] += t[p + 2] * wk; }
    out[o] = acc[0]; out[o + 1] = acc[1]; out[o + 2] = acc[2]; out[o + 3] = Math.round(Math.min(1, Math.max(0, ink[i + 4])) * 255);
  }
}

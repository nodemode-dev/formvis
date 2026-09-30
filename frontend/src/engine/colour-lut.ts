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

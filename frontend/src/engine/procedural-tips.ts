import type { SampledTip } from './abr';

/** Generated brush tips and textures: no files, the same pixels each time. A tip's grey is the paint (255 paints fully);
 *  a texture's grey is the pattern (dark cuts more from a stroke). Written for formvis from plain value noise and shapes. */

export type ProceduralKind = 'chalk' | 'spatter' | 'bristle' | 'charcoal' | 'leaf' | 'grass' | 'sponge' | 'star' | 'rake';
export const PROCEDURAL_KINDS: ReadonlyArray<readonly [ProceduralKind, string]> = [
  ['chalk', 'Chalk'], ['spatter', 'Spatter'], ['bristle', 'Bristle'], ['charcoal', 'Charcoal'], ['leaf', 'Leaf'], ['grass', 'Grass'], ['sponge', 'Sponge'], ['star', 'Star'], ['rake', 'Rake'],
];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const cell = (x: number, y: number, seed: number): number => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise at (x, y) with features `period` pixels wide, wrapping every `wrap` cells so a texture tiles. */
function vnoise(x: number, y: number, period: number, seed: number, wrap = 1 << 20): number {
  const fx = x / period, fy = y / period, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), at = (i: number, j: number): number => cell(((i % wrap) + wrap) % wrap, ((j % wrap) + wrap) % wrap, seed);
  const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** A generated tip, `size` pixels square (8 to 512). */
export function proceduralTip(kind: ProceduralKind, size = 64): SampledTip {
  const n = Math.max(8, Math.min(512, Math.round(size))), R = n / 2, data = new Uint8Array(n * n), rnd = seeded(kind.length * 7919 + kind.charCodeAt(0) * 104729);
  const put = (x: number, y: number, v: number): void => { if (x >= 0 && y >= 0 && x < n && y < n) { const i = y * n + x; if (v > data[i]) data[i] = clamp(v); } };
  const disc = (cx: number, cy: number, r: number, soft = 0.35): void => {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / Math.max(0.5, r);
      if (d < 1) put(x, y, d < 1 - soft ? 255 : 255 * (1 - (d - (1 - soft)) / soft));
    }
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - R, dy = y + 0.5 - R, d = Math.hypot(dx, dy) / R, f = n / 16;
    if (kind === 'chalk') data[y * n + x] = d < 1 ? clamp(((1 - d) * 2.4 + (cell(x, y, 3) - 0.5) * 1.5) * 255) : 0;
    else if (kind === 'charcoal') data[y * n + x] = d < 1 ? clamp((1 - d * d) * (0.3 + 0.9 * vnoise(x, y, f, 5) * (0.6 + 0.4 * cell(x, y, 9))) * 300) : 0;
    else if (kind === 'sponge') data[y * n + x] = d < 0.96 ? clamp((vnoise(x, y, f * 1.6, 11) - 0.42) * 900 * (1 - d * d * 0.5)) : 0;
  }
  if (kind === 'spatter') for (let i = 0; i < 16; i++) { const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R * 0.78; disc(R + Math.cos(a) * rr, R + Math.sin(a) * rr, R * (0.05 + rnd() * rnd() * 0.2), 0.5); }
  else if (kind === 'bristle') {
    const lines = 9;
    for (let k = 0; k < lines; k++) {
      const cx = R + ((k + 0.5) / lines - 0.5) * n * 0.9, half = Math.sqrt(Math.max(0, 1 - Math.pow((cx - R) / R, 2))) * R * (0.55 + rnd() * 0.4), w = Math.max(1, n / 36), v = 140 + rnd() * 115;
      for (let y = Math.round(R - half); y <= Math.round(R + half); y++) for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) put(x, y, v * (1 - Math.abs(x - cx) / (w + 1)));
    }
  } else if (kind === 'leaf') {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const t = (x + 0.5) / n, half = Math.pow(Math.sin(Math.PI * t), 0.85) * R * 0.62, off = Math.abs(y + 0.5 - R), vein = off < Math.max(0.6, n / 60) ? 0.35 : 1;
      if (off < half) put(x, y, 255 * vein * Math.min(1, (half - off) * 0.8));
    }
  } else if (kind === 'grass') {
    for (let k = 0; k < 6; k++) {
      const lean = (k / 5 - 0.5) * 1.5, len = n * (0.6 + rnd() * 0.35), w0 = Math.max(1.2, n / 22);
      for (let s = 0; s < len; s += 0.5) {
        const t = s / len, x = R + lean * s * 0.55 + Math.sin(t * 2.2) * lean * 6, y = n - 1 - s, w = w0 * (1 - t) + 0.3;
        for (let u = -Math.ceil(w); u <= Math.ceil(w); u++) put(Math.round(x + u), Math.round(y), 255 * Math.max(0, 1 - Math.abs(u) / (w + 0.5)));
      }
    }
  } else if (kind === 'star') {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 ? 0.42 : 0.97) * R; pts.push([R + Math.cos(a) * r, R + Math.sin(a) * r]); }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let inside = false, edge = 1e9;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j], px = x + 0.5, py = y + 0.5;
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        const l2 = (xj - xi) ** 2 + (yj - yi) ** 2, u = Math.max(0, Math.min(1, ((px - xi) * (xj - xi) + (py - yi) * (yj - yi)) / l2));
        edge = Math.min(edge, Math.hypot(px - (xi + u * (xj - xi)), py - (yi + u * (yj - yi))));
      }
      if (inside) put(x, y, 255 * Math.min(1, edge + 0.5));
      else if (edge < 0.5) put(x, y, 255 * (0.5 - edge));
    }
  } else if (kind === 'rake') {
    const teeth = 7, w = Math.max(1, n / 30);
    for (let k = 0; k < teeth; k++) {
      const cx = R + ((k + 0.5) / teeth - 0.5) * n * 0.92, h = R * (0.7 + rnd() * 0.28);
      for (let y = Math.round(R - h); y <= Math.round(R + h); y++) for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) put(x, y, 255 * (1 - Math.abs(x - cx) / (w + 1)));
    }
  }
  return { w: n, h: n, data };
}

export type TextureKind = 'grain' | 'paper' | 'canvas' | 'cells';
export const PROCEDURAL_TEXTURES: ReadonlyArray<readonly [TextureKind, string, number]> = [['grain', 'Grain', 64], ['paper', 'Paper', 128], ['canvas', 'Canvas Weave', 32], ['cells', 'Cells', 96]];

/** The grey (0 dark to 255 light) of a texture at pixel (x, y) of an `n` pixel tile; each tiles without a seam. */
export function textureGrey(kind: TextureKind, x: number, y: number, n: number): number {
  if (kind === 'grain') return 255 * cell(x, y, 21);
  if (kind === 'paper') {
    const k1 = Math.max(1, Math.round(n / 24)), k2 = Math.max(1, Math.round(n / 6));
    return 255 * Math.min(1, 0.55 + 0.35 * vnoise(x, y, n / k1, 31, k1) + 0.25 * (cell(x, y, 33) - 0.5) + 0.15 * (vnoise(x, y, n / k2, 35, k2) - 0.5));
  }
  if (kind === 'canvas') {
    const p = n / 4, a = Math.sin(((x % n) / p) * Math.PI * 2) * 0.5 + 0.5, b = Math.sin(((y % n) / p) * Math.PI * 2) * 0.5 + 0.5, over = (Math.floor(x / (p / 2)) + Math.floor(y / (p / 2))) % 2 === 0;
    return 255 * (0.35 + 0.65 * (over ? a : b)) * (0.9 + 0.1 * cell(x, y, 41));
  }
  const g = 6, s = n / g;
  let best = 9, second = 9;
  const gx = Math.floor(x / s), gy = Math.floor(y / s);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j, wx = ((cx % g) + g) % g, wy = ((cy % g) + g) % g, px = (cx + cell(wx, wy, 51)) * s, py = (cy + cell(wx, wy, 52)) * s, d = Math.hypot(x - px, y - py) / s;
    if (d < best) { second = best; best = d; } else if (d < second) second = d;
  }
  return 255 * Math.min(1, (second - best) * 2.2);
}

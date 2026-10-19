import type { Kernel } from './kernels';
import { boxBlur } from './filters';

/** Film looks (U2, the Film pack): parametric stock emulation written for formvis from standard published ideas.
 *  A stock is a tone curve (control points on 0 to 255, joined by a monotone cubic), a colour matrix (saturation and a
 *  tint for shadows and for highlights) and a grain whose strength follows the speed (ISO). The stocks are generic
 *  looks with their own names; none copies a maker's table. */
export type FilmKind = 'negative' | 'slide' | 'bw' | 'cine';
export type CurvePoint = [number, number];
export interface FilmStock { id: string; label: string; kind: FilmKind; iso: number; note: string; points: CurvePoint[]; sat: number; shadow: [number, number, number]; highlight: [number, number, number]; colourGrain: number }

export const FILM_STOCKS: readonly FilmStock[] = [
  { id: 'portrait400', label: 'Portrait Negative 400', kind: 'negative', iso: 400, note: 'Soft shoulder, lifted blacks, warm skin.', points: [[0, 12], [64, 70], [128, 134], [192, 196], [255, 244]], sat: 0.94, shadow: [-0.01, 0.01, 0.015], highlight: [0.025, 0.01, -0.02], colourGrain: 0.35 },
  { id: 'vivid100', label: 'Vivid Negative 100', kind: 'negative', iso: 100, note: 'Fine grain, punchy colour.', points: [[0, 6], [64, 56], [128, 136], [192, 206], [255, 250]], sat: 1.22, shadow: [0, 0.005, 0.015], highlight: [0.015, 0.005, -0.01], colourGrain: 0.3 },
  { id: 'slide50', label: 'Saturated Slide 50', kind: 'slide', iso: 50, note: 'Steep contrast, deep blacks, rich colour.', points: [[0, 0], [48, 28], [128, 132], [208, 232], [255, 255]], sat: 1.38, shadow: [-0.005, 0, 0.01], highlight: [0.01, 0.005, -0.01], colourGrain: 0.2 },
  { id: 'slide200', label: 'Daylight Slide 200', kind: 'slide', iso: 200, note: 'Cool shadows, clean highlights.', points: [[0, 2], [56, 38], [128, 130], [200, 220], [255, 254]], sat: 1.2, shadow: [-0.01, 0, 0.02], highlight: [0, 0, 0], colourGrain: 0.25 },
  { id: 'mono400', label: 'Classic Mono 400', kind: 'bw', iso: 400, note: 'Black and white with a gentle S curve and visible grain.', points: [[0, 8], [64, 52], [128, 130], [192, 208], [255, 250]], sat: 0, shadow: [0, 0, 0], highlight: [0.01, 0.005, -0.01], colourGrain: 0 },
  { id: 'monoFine100', label: 'Fine Mono 100', kind: 'bw', iso: 100, note: 'Black and white, fine grain, strong blacks.', points: [[0, 0], [64, 48], [128, 132], [192, 214], [255, 255]], sat: 0, shadow: [0, 0, 0], highlight: [0, 0, 0], colourGrain: 0 },
  { id: 'monoPush1600', label: 'Pushed Mono 1600', kind: 'bw', iso: 1600, note: 'Contrasty, crushed blacks, coarse grain.', points: [[0, 0], [56, 30], [128, 136], [200, 236], [255, 255]], sat: 0, shadow: [0, 0, 0], highlight: [0, 0, 0], colourGrain: 0 },
  { id: 'cineTungsten500', label: 'Cine Tungsten 500', kind: 'cine', iso: 500, note: 'Teal shadows, warm highlights, soft contrast.', points: [[0, 14], [64, 66], [128, 130], [192, 198], [255, 246]], sat: 1.0, shadow: [-0.025, 0.005, 0.03], highlight: [0.035, 0.012, -0.03], colourGrain: 0.4 },
  { id: 'cineDaylight250', label: 'Cine Daylight 250', kind: 'cine', iso: 250, note: 'Neutral, gentle highlights, a little warmth.', points: [[0, 10], [64, 62], [128, 132], [192, 200], [255, 248]], sat: 1.04, shadow: [0, 0.005, 0.01], highlight: [0.02, 0.01, -0.01], colourGrain: 0.3 },
  { id: 'faded', label: 'Faded Print', kind: 'negative', iso: 800, note: 'Raised blacks, muted colour, a green cast.', points: [[0, 34], [64, 80], [128, 136], [192, 186], [255, 226]], sat: 0.8, shadow: [-0.01, 0.025, 0.01], highlight: [0.02, 0.015, -0.015], colourGrain: 0.45 },
];

export const FILM_STOCK_OPTIONS: ReadonlyArray<readonly [string, string]> = FILM_STOCKS.map((s) => [s.id, s.label] as const);
export const filmStock = (id: unknown): FilmStock => FILM_STOCKS.find((s) => s.id === id) ?? FILM_STOCKS[0];

/** Curve points from the stored text (a JSON list of [x, y] on 0 to 255), sorted by x with one point per x; null when
 *  there is nothing usable (fewer than two points). */
export function parsePoints(raw: unknown): CurvePoint[] | null {
  if (typeof raw !== 'string' || !raw) return null;
  let list: unknown;
  try { list = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(list)) return null;
  const out = new Map<number, number>();
  for (const p of list) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]), y = Number(p[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.set(Math.round(Math.min(255, Math.max(0, x))), Math.round(Math.min(255, Math.max(0, y))));
  }
  return out.size >= 2 ? [...out.entries()].sort((a, b) => a[0] - b[0]) : null;
}

export const pointsText = (pts: CurvePoint[]): string => JSON.stringify(pts.map(([x, y]) => [x, y]));

/** The points a layer's curve uses now: its own when it has some, otherwise its stock's. */
export const curvePoints = (stockId: unknown, raw: unknown): CurvePoint[] => parsePoints(raw) ?? filmStock(stockId).points.map(([x, y]) => [x, y] as CurvePoint);

/** A 256-entry table through the points (Fritsch and Carlson's monotone cubic; flat outside the first and last point). */
export function curveTable(pts: CurvePoint[]): Float32Array {
  const n = pts.length, h: number[] = [], d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = pts[i + 1][0] - pts[i][0]; d[i] = (pts[i + 1][1] - pts[i][1]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const out = new Float32Array(256);
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    if (x <= pts[0][0]) { out[x] = pts[0][1]; continue; }
    if (x >= pts[n - 1][0]) { out[x] = pts[n - 1][1]; continue; }
    while (seg < n - 2 && x > pts[seg + 1][0]) seg++;
    const t = (x - pts[seg][0]) / h[seg], t2 = t * t, t3 = t2 * t;
    out[x] = (2 * t3 - 3 * t2 + 1) * pts[seg][1] + (t3 - 2 * t2 + t) * h[seg] * m[seg] + (-2 * t3 + 3 * t2) * pts[seg + 1][1] + (t3 - t2) * h[seg] * m[seg + 1];
  }
  return out;
}

/** The mean of 255-scaled output over the table, for the Film layer's readout: how much the stock lifts or darkens. */
export const curveMean = (pts: CurvePoint[]): number => { const t = curveTable(pts); let s = 0; for (let i = 0; i < 256; i++) s += t[i] - i; return s / 256; };

function noise(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const gauss = (x: number, y: number, seed: number): number => Math.sqrt(-2 * Math.log(Math.max(1e-9, noise(x, y, seed)))) * Math.cos(2 * Math.PI * noise(x, y, seed + 101));

/** The Film Look kernel. `strength` and `grain` are 0 to 100; `grainSize` is in document pixels. */
export function filmKernel(stockId: unknown, strength: number, grain: number, grainSize: number, rawPoints: unknown, seed: number, tonal: readonly [number, number, number] = [0, 0, 0], structure = 0, structureSize = 20): Kernel {
  const stock = filmStock(stockId), table = curveTable(curvePoints(stockId, rawPoints)), k = Math.min(1, Math.max(0, strength / 100));
  const tone = tonal.map((t) => Math.min(1, Math.max(-1, (Number.isFinite(t) ? t : 0) / 100))), tonalOn = tone.some((t) => t !== 0), CENTRE = [0.15, 0.5, 0.85];
  const amp = (grain / 100) * 14 * Math.sqrt(stock.iso / 400), size = Math.max(0.5, grainSize);
  return (px, ctx) => {
    if (k <= 0) return;
    const W = ctx?.width ?? 0, up = ctx?.unitsPerPixel ?? 1, ox = ctx?.originX ?? 0, oy = ctx?.originY ?? 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      if (px[i + 3] === 0) continue;
      let r = table[px[i]] / 255, g = table[px[i + 1]] / 255, b = table[px[i + 2]] / 255;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * stock.sat; g = l + (g - l) * stock.sat; b = l + (b - l) * stock.sat;
      const hw = Math.min(1, Math.max(0, (l - 0.35) / 0.5)), sw = 1 - hw;
      r += stock.shadow[0] * sw + stock.highlight[0] * hw; g += stock.shadow[1] * sw + stock.highlight[1] * hw; b += stock.shadow[2] * sw + stock.highlight[2] * hw;
      if (tonalOn) {
        for (let band = 0; band < 3; band++) {
          const w = Math.max(0, 1 - Math.abs(l - CENTRE[band]) / 0.35) * tone[band] * 0.9;
          if (w) { r += w * (r - CENTRE[band]); g += w * (g - CENTRE[band]); b += w * (b - CENTRE[band]); }
        }
      }
      let R = r * 255, G = g * 255, B = b * 255;
      if (amp > 0 && W > 0) {
        const gx = Math.floor((ox + (j % W) * up) / size), gy = Math.floor((oy + Math.floor(j / W) * up) / size), mid = 0.35 + 0.65 * 4 * l * (1 - l);
        const base = gauss(gx, gy, seed) * amp * mid, c = stock.colourGrain * amp * mid * 0.6;
        R += base + (c ? gauss(gx, gy, seed + 7) * c : 0); G += base + (c ? gauss(gx, gy, seed + 13) * c : 0); B += base + (c ? gauss(gx, gy, seed + 19) * c : 0);
      }
      px[i] = Math.round(Math.min(255, Math.max(0, px[i] + (R - px[i]) * k)));
      px[i + 1] = Math.round(Math.min(255, Math.max(0, px[i + 1] + (G - px[i + 1]) * k)));
      px[i + 2] = Math.round(Math.min(255, Math.max(0, px[i + 2] + (B - px[i + 2]) * k)));
    }
    if (ctx && structure !== 0) structurePass(px, ctx.width, ctx.height, Math.max(1, Math.round(structureSize / Math.max(1e-6, up))), Math.min(1, Math.max(-1, structure / 100)) * k);
  };
}

/** Structure: the local contrast of the picture at one scale. The luminance is blurred (three box passes each way, counted
 *  over the pixels that show), and each pixel moves away from that local mean by `amount` times its difference, most in the
 *  midtones; every channel moves by the same amount so hue stays. A negative amount smooths towards the mean. */
function structurePass(px: Uint8ClampedArray, W: number, H: number, radius: number, amount: number): void {
  const n = W * H;
  if (n === 0 || amount === 0 || px.length < n * 4) return;
  let a = new Float32Array(n * 4), b = new Float32Array(n * 4);
  for (let j = 0; j < n; j++) {
    if (px[j * 4 + 3] === 0) continue;
    a[j * 4] = 0.299 * px[j * 4] + 0.587 * px[j * 4 + 1] + 0.114 * px[j * 4 + 2];
    a[j * 4 + 1] = 1;
  }
  const r = Math.min(radius, Math.max(1, Math.floor((Math.max(W, H) - 1) / 2)));
  for (let pass = 0; pass < 3; pass++) { boxBlur(a, b, W, H, r, true); boxBlur(b, a, W, H, r, false); }
  for (let j = 0; j < n; j++) {
    const i = j * 4;
    if (px[i + 3] === 0 || a[i + 1] <= 1e-6) continue;
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2], mean = a[i] / a[i + 1], t = l / 255;
    const d = (l - mean) * amount * 1.6 * (0.35 + 0.65 * 4 * t * (1 - t));
    px[i] = Math.round(Math.min(255, Math.max(0, px[i] + d)));
    px[i + 1] = Math.round(Math.min(255, Math.max(0, px[i + 1] + d)));
    px[i + 2] = Math.round(Math.min(255, Math.max(0, px[i + 2] + d)));
  }
}

/** The Chromatic Shift kernel (Effects pack): the colour channels displaced against each other. Lateral spreads red
 *  outward and blue inward from the centre like a lens' colour fringe; Linear slides red and blue apart along an angle;
 *  Plates lays red, green and blue as three plates offset 120 degrees apart. `amount` is in document pixels. */
export function chromaticKernel(style: string, amount: number, angle: number): Kernel {
  return (px, ctx) => {
    if (!ctx || amount <= 0) return;
    const W = ctx.width, H = ctx.height, up = Math.max(1e-6, ctx.unitsPerPixel), a = amount / up, rad = (angle * Math.PI) / 180, src = new Uint8ClampedArray(px);
    const cx = (W - 1) / 2, cy = (H - 1) / 2, far = Math.max(1, Math.hypot(cx, cy));
    const dir = (deg: number): [number, number] => [Math.cos(rad + (deg * Math.PI) / 180), -Math.sin(rad + (deg * Math.PI) / 180)];
    const at = (x: number, y: number, c: number): number => {
      const x0 = Math.min(W - 1, Math.max(0, Math.floor(x))), y0 = Math.min(H - 1, Math.max(0, Math.floor(y))), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
      const p = (xx: number, yy: number): number => src[(yy * W + xx) * 4 + c];
      return (p(x0, y0) * (1 - fx) + p(x1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x1, y1) * fx) * fy;
    };
    const lin = dir(0), p0 = dir(0), p1 = dir(120), p2 = dir(240);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (src[o + 3] === 0) continue;
      let rx = x, ry = y, bx = x, by = y, gx = x, gy = y;
      if (style === 'lateral') { const vx = (x - cx) / far, vy = (y - cy) / far; rx = x - vx * a; ry = y - vy * a; bx = x + vx * a; by = y + vy * a; }
      else if (style === 'plates') { rx = x + p0[0] * a; ry = y + p0[1] * a; gx = x + p1[0] * a; gy = y + p1[1] * a; bx = x + p2[0] * a; by = y + p2[1] * a; }
      else { rx = x + lin[0] * a / 2; ry = y + lin[1] * a / 2; bx = x - lin[0] * a / 2; by = y - lin[1] * a / 2; }
      px[o] = Math.round(at(rx, ry, 0)); px[o + 1] = Math.round(at(gx, gy, 1)); px[o + 2] = Math.round(at(bx, by, 2));
    }
  };
}

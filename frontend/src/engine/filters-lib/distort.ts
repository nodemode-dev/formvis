import type { LibContext, LibFilter, LibImage, LibValues } from '../filter-library';
import { boxOf, clipBox, copyImage, hash01, type Box } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;
const str = (v: LibValues, k: string): string => v[k] as string;
const TAU = Math.PI * 2;

/** What a distortion samples where its source falls outside the frame: nothing, the nearest edge, or the other side. */
type Edge = 'transparent' | 'repeat' | 'wrap';

/** A distortion as a backward map: for an output pixel centre (x, y) inside the frame, the source point it shows, or
 *  null to leave the pixel as it is. */
type Backward = (x: number, y: number) => readonly [number, number] | null;

/** Runs a backward map over the frame (`area`, clipped to the image), sampling the source bilinearly, premultiplied, with
 *  `edge` deciding what lies outside the frame. Pixels outside the frame are untouched. */
export function remap(src: ImageData, area: Box, edge: Edge, f: Backward): ImageData {
  const { width: w } = src, s = src.data, out = copyImage(src), d = out.data, b = clipBox(area, src.width, src.height);
  if (!b) return out;
  const fw = b.x1 - b.x0, fh = b.y1 - b.y0, acc = new Float64Array(4);
  const fetch = (ix: number, iy: number, wt: number): void => {
    let x = ix - b.x0, y = iy - b.y0;
    if (edge === 'wrap') { x = ((x % fw) + fw) % fw; y = ((y % fh) + fh) % fh; }
    else if (edge === 'repeat') { x = Math.min(fw - 1, Math.max(0, x)); y = Math.min(fh - 1, Math.max(0, y)); }
    else if (x < 0 || y < 0 || x >= fw || y >= fh) return;
    const q = ((y + b.y0) * w + x + b.x0) * 4, a = s[q + 3] * wt;
    acc[0] += s[q] * a; acc[1] += s[q + 1] * a; acc[2] += s[q + 2] * a; acc[3] += a;
  };
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const p = f(x + 0.5, y + 0.5);
    if (!p) continue;
    const fx = p[0] - 0.5, fy = p[1] - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    acc.fill(0);
    fetch(x0, y0, (1 - tx) * (1 - ty)); fetch(x0 + 1, y0, tx * (1 - ty)); fetch(x0, y0 + 1, (1 - tx) * ty); fetch(x0 + 1, y0 + 1, tx * ty);
    const o = (y * w + x) * 4;
    if (acc[3] < 0.5) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
    d[o] = acc[0] / acc[3]; d[o + 1] = acc[1] / acc[3]; d[o + 2] = acc[2] / acc[3]; d[o + 3] = acc[3];
  }
  return out;
}

/** The frame's centre and half sizes. */
const centre = (b: Box): { cx: number; cy: number; rx: number; ry: number } => ({ cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, rx: (b.x1 - b.x0) / 2, ry: (b.y1 - b.y0) / 2 });

/** Twirl: the frame's inscribed ellipse turned most at its centre, by `angle` degrees, less toward its rim. */
export function twirlImage(src: ImageData, angle: number, area: Box): ImageData {
  return applyWarp(src, area, twirlWarp(angle, area));
}

/** A backward map and what lies outside the frame, or null where the filter changes nothing. */
export interface Warp { edge: Edge; f: Backward }

const applyWarp = (src: ImageData, area: Box, w: Warp | null): ImageData => (w ? remap(src, area, w.edge, w.f) : copyImage(src));

export function twirlWarp(angle: number, area: Box): Warp {
  const { cx, cy, rx, ry } = centre(area), turn = (angle * Math.PI) / 180;
  return { edge: 'repeat', f: (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, r = Math.hypot(u, v);
    if (r >= 1) return null;
    const a = -turn * (1 - r) * (1 - r), c = Math.cos(a), s = Math.sin(a);
    return [cx + (u * c - v * s) * rx, cy + (u * s + v * c) * ry];
  } };
}

/** Pinch: inside the inscribed ellipse, a positive amount draws the picture toward the centre, a negative one swells
 *  it outward; the rim stays. */
export function pinchImage(src: ImageData, amount: number, area: Box): ImageData {
  return applyWarp(src, area, pinchWarp(amount, area));
}

export function pinchWarp(amount: number, area: Box): Warp | null {
  const { cx, cy, rx, ry } = centre(area), a = Math.max(-1, Math.min(1, amount / 100)), e = a >= 0 ? 1 / (1 + 2 * a) : 1 - 1.5 * a;
  if (!a) return null;
  return { edge: 'repeat', f: (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, r = Math.hypot(u, v);
    if (r >= 1 || r === 0) return null;
    const k = r ** e / r;
    return [cx + u * k * rx, cy + v * k * ry];
  } };
}

/** Spherize: the picture seen through a sphere (Normal) or a cylinder lying across or standing up (Horizontal or
 *  Vertical only); a positive amount bulges it, a negative one pinches. */
export function spherizeImage(src: ImageData, amount: number, mode: string, area: Box): ImageData {
  return applyWarp(src, area, spherizeWarp(amount, mode, area));
}

export function spherizeWarp(amount: number, mode: string, area: Box): Warp | null {
  const { cx, cy, rx, ry } = centre(area), a = Math.max(-1, Math.min(1, amount / 100));
  if (!a) return null;
  const lens = (t: number): number => (1 - Math.abs(a)) * t + Math.abs(a) * (a > 0 ? 1 - Math.cos((t * Math.PI) / 2) : Math.sin((t * Math.PI) / 2));
  return { edge: 'repeat', f: (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry;
    if (mode === 'horizontalOnly') return Math.abs(u) >= 1 ? null : [cx + Math.sign(u) * lens(Math.abs(u)) * rx, y];
    if (mode === 'verticalOnly') return Math.abs(v) >= 1 ? null : [x, cy + Math.sign(v) * lens(Math.abs(v)) * ry];
    const r = Math.hypot(u, v);
    if (r >= 1 || r === 0) return null;
    const k = lens(r) / r;
    return [cx + u * k * rx, cy + v * k * ry];
  } };
}

export interface WaveSettings { generators: number; wavelength: [number, number]; amplitude: [number, number]; scaleX: number; scaleY: number; type: string; edge: Edge; seed: number }

/** One period of a wave, -1 to 1, at phase `t` (in periods). */
function waveform(type: string, t: number): number {
  const f = t - Math.floor(t);
  if (type === 'square') return f < 0.5 ? 1 : -1;
  if (type === 'triangle') return f < 0.5 ? 4 * f - 1 : 3 - 4 * f;
  return Math.sin(f * TAU);
}

/** Wave: each generator (its wavelength, amplitude and phases drawn from the ranges by the seed) moves the picture
 *  across by a wave running down the frame and up and down by one running across it; the generators are averaged and
 *  scaled by Scale Horiz. and Vert. */
export function waveImage(src: ImageData, o: WaveSettings, area: Box, scale: number): ImageData {
  return applyWarp(src, area, waveWarp(o, area, scale));
}

export function waveWarp(o: WaveSettings, area: Box, scale: number): Warp {
  const n =Math.max(1, Math.min(999, Math.round(o.generators))), gens: Array<{ len: number; amp: number; px: number; py: number }> = [];
  for (let i = 0; i < n; i++) {
    const pick = (lo: number, hi: number, c: number): number => lo + (hi - lo) * hash01(i, 0, c, o.seed);
    gens.push({ len: Math.max(1, pick(o.wavelength[0], o.wavelength[1], 1)) * scale, amp: pick(o.amplitude[0], o.amplitude[1], 2) * scale, px: hash01(i, 1, 3, o.seed), py: hash01(i, 2, 4, o.seed) });
  }
  const sx = o.scaleX / 100, sy = o.scaleY / 100, across = new Map<number, number>(), down = new Map<number, number>();
  const sum = (t: number, phase: 'px' | 'py'): number => { let s = 0; for (const g of gens) s += g.amp * waveform(o.type, t / g.len + g[phase]); return s / n; };
  return { edge: o.edge, f: (x, y) => {
    let dx = across.get(y), dy = down.get(x);
    if (dx === undefined) { dx = sum(y - area.y0, 'px') * sx; across.set(y, dx); }
    if (dy === undefined) { dy = sum(x - area.x0, 'py') * sy; down.set(x, dy); }
    return [x + dx, y + dy];
  } };
}

/** Ripple: small, medium or large ripples (a wavelength of 8, 18 or 40 pixels) moving the picture across and up and
 *  down, their depth set by Amount. */
export function rippleImage(src: ImageData, amount: number, size: string, area: Box, scale: number): ImageData {
  return applyWarp(src, area, rippleWarp(amount, size, area, scale));
}

export function rippleWarp(amount: number, size: string, area: Box, scale: number): Warp | null {
  const len = (size === 'small' ? 8 : size === 'large' ? 40 : 18) * scale, amp = (amount / 100) * len * 0.18;
  if (!amp) return null;
  return { edge: 'repeat', f: (x, y) => {
    const fx = x - area.x0, fy = y - area.y0;
    return [x + amp * Math.sin((fy / len) * TAU + 0.7 * Math.sin((fx / len) * 0.9)), y + amp * Math.sin((fx / len) * TAU + 0.7 * Math.sin((fy / len) * 0.9))];
  } };
}

/** Polar Coordinates: Rectangular to Polar wraps the frame around its centre (its top edge becomes the centre, its left
 *  and right edges meet straight up, its bottom row stretched into the corners); Polar to Rectangular unrolls a round
 *  picture into a band. */
export function polarImage(src: ImageData, mode: string, area: Box): ImageData {
  return applyWarp(src, area, polarWarp(mode, area));
}

export function polarWarp(mode: string, area: Box): Warp {
  const { cx, cy, rx, ry } = centre(area), fw = rx * 2, fh = ry * 2;
  if (mode === 'polarToRectangular') {
    return { edge: 'repeat', f: (x, y) => {
      const theta = ((x - area.x0) / fw) * TAU, r = (y - area.y0) / fh;
      return [cx + Math.sin(theta) * r * rx, cy - Math.cos(theta) * r * ry];
    } };
  }
  return { edge: 'repeat', f: (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, r = Math.min(1, Math.hypot(u, v));
    const theta = (Math.atan2(u, -v) + TAU) % TAU;
    return [area.x0 + (theta / TAU) * fw, area.y0 + r * fh];
  } };
}

/** A displacement map's red and green levels, two bytes a pixel; null when it is damaged. */
export function decodeMap(m: LibImage): Uint8Array | null {
  try {
    const bin = atob(m.rg), n = m.w * m.h * 2;
    if (bin.length < n) return null;
    return Uint8Array.from({ length: n }, (_, i) => bin.charCodeAt(i));
  } catch { return null; }
}

/** Displace: each pixel moved by the map, its red level across and its green level up and down, mid grey (128) not at
 *  all and the extremes by Scale percent of 128 pixels; the map stretched over the frame, or tiled at its own size. */
export function displaceImage(src: ImageData, o: { h: number; v: number; tile: boolean; edge: Edge; map: LibImage | null }, area: Box, scale: number): ImageData {
  const m = o.map, rg = m ? decodeMap(m) : null;
  if (!m || !rg) return copyImage(src);
  const fw = area.x1 - area.x0, fh = area.y1 - area.y0, kx = (o.h / 100) * scale, ky = (o.v / 100) * scale;
  const level = (u: number, v: number, c: number): number => {
    const x = Math.min(m.w - 1, Math.max(0, Math.floor(u * m.w))), y = Math.min(m.h - 1, Math.max(0, Math.floor(v * m.h)));
    return rg[(y * m.w + x) * 2 + c];
  };
  return remap(src, area, o.edge, (x, y) => {
    const fx = x - area.x0, fy = y - area.y0;
    const u = o.tile ? (((fx / scale) % m.w0) + m.w0) % m.w0 / m.w0 : fx / fw, v = o.tile ? (((fy / scale) % m.h0) + m.h0) % m.h0 / m.h0 : fy / fh;
    return [x - shift(level(u, v, 0)) * kx, y - shift(level(u, v, 1)) * ky];
  });
}

/** A map level's displacement in pixels at 100 percent: none at mid grey (128), and 128 either way at black and white. */
const shift = (level: number): number => (level >= 128 ? ((level - 128) * 128) / 127 : level - 128);

/** The value at position t (0 to 1) of a smooth curve through flat pairs of position and value, positions rising; a
 *  cubic through the points with slopes from each point's neighbours. */
export function curveValue(points: readonly number[], t: number): number {
  const n = points.length >> 1;
  if (n === 0) return 0;
  if (n === 1 || t <= points[0]) return points[1];
  if (t >= points[(n - 1) * 2]) return points[(n - 1) * 2 + 1];
  let i = 0;
  while (i < n - 2 && t > points[(i + 1) * 2]) i++;
  const x0 = points[i * 2], y0 = points[i * 2 + 1], x1 = points[i * 2 + 2], y1 = points[i * 2 + 3], dx = Math.max(1e-6, x1 - x0), s = (y1 - y0) / dx;
  const slope = (k: number): number => {
    if (k <= 0) return (points[3] - points[1]) / Math.max(1e-6, points[2] - points[0]);
    if (k >= n - 1) return (points[(n - 1) * 2 + 1] - points[(n - 2) * 2 + 1]) / Math.max(1e-6, points[(n - 1) * 2] - points[(n - 2) * 2]);
    const a = (points[k * 2 + 1] - points[(k - 1) * 2 + 1]) / Math.max(1e-6, points[k * 2] - points[(k - 1) * 2]), b = (points[(k + 1) * 2 + 1] - points[k * 2 + 1]) / Math.max(1e-6, points[(k + 1) * 2] - points[k * 2]);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const m0 = Math.max(-3 * Math.abs(s), Math.min(3 * Math.abs(s), slope(i))) * dx, m1 = Math.max(-3 * Math.abs(s), Math.min(3 * Math.abs(s), slope(i + 1))) * dx, u = (t - x0) / dx, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1;
}

/** Shear: each row slid across along a curve: the one through `points` (position down the frame, value in percent of
 *  half the frame's width) plus the bend through Top, Middle and Bottom. */
export function shearImage(src: ImageData, top: number, middle: number, bottom: number, edge: Edge, area: Box, points: readonly number[] = []): ImageData {
  return applyWarp(src, area, shearWarp(top, middle, bottom, edge, area, points));
}

export function shearWarp(top: number, middle: number, bottom: number, edge: Edge, area: Box, points: readonly number[] = []): Warp {
  const fh = area.y1 - area.y0, half = (area.x1 - area.x0) / 2, free = points.length >= 4;
  const curve = (t: number): number => (top * (2 * t - 1) * (t - 1) - middle * 4 * t * (t - 1) + bottom * t * (2 * t - 1) + (free ? curveValue(points, t) : 0)) / 100;
  return { edge, f: (x, y) => [x - curve((y - area.y0) / fh) * half, y] };
}

/** ZigZag: rings of ridges spreading from the frame's centre: Pond Ripples move pixels outward and around, Out from
 *  Center straight outward, Around Center around it; the ridges fade toward the rim. */
export function zigZagImage(src: ImageData, amount: number, ridges: number, style: string, area: Box): ImageData {
  return applyWarp(src, area, zigZagWarp(amount, ridges, style, area));
}

export function zigZagWarp(amount: number, ridges: number, style: string, area: Box): Warp | null {
  const { cx, cy, rx, ry } = centre(area), R = Math.min(rx, ry), a = amount / 100, n = Math.max(0, ridges);
  if (!a || !n) return null;
  return { edge: 'repeat', f: (x, y) => {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r >= R || r === 0) return null;
    const t = r / R, wave = Math.sin(t * n * TAU) * (1 - t);
    let rr = r, th = Math.atan2(dy, dx);
    if (style === 'aroundCenter') th += a * wave * 0.6;
    else if (style === 'outFromCenter') rr = r + a * wave * R * 0.15;
    else { rr = r + a * wave * R * 0.1; th += a * wave * 0.25; }
    return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr];
  } };
}

const EDGES: ReadonlyArray<readonly [string, string]> = [['wrap', 'Wrap Around'], ['repeat', 'Repeat Edge Pixels']];
const areaOf = (ctx: LibContext): Box => boxOf(ctx.area);

export const DISTORT_FILTERS: LibFilter[] = [
  {
    id: 'displace', label: 'Displace', group: 'Distort', grows: false, reach: null,
    note: 'The map is an open document, one layer of this document or a picture file: its red channel moves pixels across and its green channel up and down; mid grey moves nothing.',
    params: [
      { key: 'horizontal', label: 'Horizontal Scale (%)', kind: 'range', min: -999, max: 999, step: 1, def: 10 },
      { key: 'vertical', label: 'Vertical Scale (%)', kind: 'range', min: -999, max: 999, step: 1, def: 10 },
      { key: 'fit', label: 'Displacement Map', kind: 'select', def: 'stretch', options: [['stretch', 'Stretch to Fit'], ['tile', 'Tile']] },
      { key: 'undefinedAreas', label: 'Undefined Areas', kind: 'select', def: 'repeat', options: [['repeat', 'Repeat Edge Pixels'], ['wrap', 'Wrap Around']] },
      { key: 'map', label: 'Map', kind: 'image', def: null },
    ],
    run: (src, v, ctx) => displaceImage(src, { h: num(v, 'horizontal'), v: num(v, 'vertical'), tile: str(v, 'fit') === 'tile', edge: str(v, 'undefinedAreas') === 'wrap' ? 'wrap' : 'repeat', map: v.map as LibImage | null }, areaOf(ctx), ctx.scale),
  },
  {
    id: 'pinch', label: 'Pinch', group: 'Distort', grows: false, reach: null,
    params: [{ key: 'amount', label: 'Amount (%)', kind: 'range', min: -100, max: 100, step: 1, def: 50 }],
    run: (src, v, ctx) => pinchImage(src, num(v, 'amount'), areaOf(ctx)),
  },
  {
    id: 'polarCoordinates', label: 'Polar Coordinates', group: 'Distort', grows: false, reach: null,
    params: [{ key: 'mode', label: 'Conversion', kind: 'select', def: 'rectangularToPolar', options: [['rectangularToPolar', 'Rectangular to Polar'], ['polarToRectangular', 'Polar to Rectangular']] }],
    run: (src, v, ctx) => polarImage(src, str(v, 'mode'), areaOf(ctx)),
  },
  {
    id: 'ripple', label: 'Ripple', group: 'Distort', grows: false, reach: null,
    params: [
      { key: 'amount', label: 'Amount (%)', kind: 'range', min: -999, max: 999, step: 1, def: 100 },
      { key: 'size', label: 'Size', kind: 'select', def: 'medium', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] },
    ],
    run: (src, v, ctx) => rippleImage(src, num(v, 'amount'), str(v, 'size'), areaOf(ctx), ctx.scale),
  },
  {
    id: 'shear', label: 'Shear', group: 'Distort', grows: false, reach: null,
    note: 'Drag the points of the curve (top of the frame above, bottom below; centre is no shift), click the box to add a point, double-click a point to remove it. Top, Middle and Bottom add a bend on top of the curve, in percent of half the width.',
    params: [
      { key: 'curve', label: 'Shear Curve', kind: 'curve', min: -100, max: 100, def: [0, 0, 0.5, 0, 1, 0] },
      { key: 'top', label: 'Top (%)', kind: 'range', min: -100, max: 100, step: 1, def: 0 },
      { key: 'middle', label: 'Middle (%)', kind: 'range', min: -100, max: 100, step: 1, def: 0 },
      { key: 'bottom', label: 'Bottom (%)', kind: 'range', min: -100, max: 100, step: 1, def: 0 },
      { key: 'undefinedAreas', label: 'Undefined Areas', kind: 'select', def: 'wrap', options: EDGES },
    ],
    run: (src, v, ctx) => shearImage(src, num(v, 'top'), num(v, 'middle'), num(v, 'bottom'), str(v, 'undefinedAreas') === 'repeat' ? 'repeat' : 'wrap', areaOf(ctx), v.curve as number[]),
  },
  {
    id: 'spherize', label: 'Spherize', group: 'Distort', grows: false, reach: null,
    params: [
      { key: 'amount', label: 'Amount (%)', kind: 'range', min: -100, max: 100, step: 1, def: 100 },
      { key: 'mode', label: 'Mode', kind: 'select', def: 'normal', options: [['normal', 'Normal'], ['horizontalOnly', 'Horizontal only'], ['verticalOnly', 'Vertical only']] },
    ],
    run: (src, v, ctx) => spherizeImage(src, num(v, 'amount'), str(v, 'mode'), areaOf(ctx)),
  },
  {
    id: 'twirl', label: 'Twirl', group: 'Distort', grows: false, reach: null,
    params: [{ key: 'angle', label: 'Angle (°)', kind: 'range', min: -999, max: 999, step: 1, def: 50 }],
    run: (src, v, ctx) => twirlImage(src, num(v, 'angle'), areaOf(ctx)),
  },
  {
    id: 'wave', label: 'Wave', group: 'Distort', grows: false, reach: null,
    params: [
      { key: 'generators', label: 'Number of Generators', kind: 'range', min: 1, max: 999, step: 1, def: 5 },
      { key: 'wavelengthMin', label: 'Wavelength Min.', kind: 'range', min: 1, max: 998, step: 1, def: 10 },
      { key: 'wavelengthMax', label: 'Wavelength Max.', kind: 'range', min: 2, max: 999, step: 1, def: 120 },
      { key: 'amplitudeMin', label: 'Amplitude Min.', kind: 'range', min: 1, max: 998, step: 1, def: 5 },
      { key: 'amplitudeMax', label: 'Amplitude Max.', kind: 'range', min: 1, max: 999, step: 1, def: 35 },
      { key: 'scaleX', label: 'Scale Horiz. (%)', kind: 'range', min: 1, max: 100, step: 1, def: 100 },
      { key: 'scaleY', label: 'Scale Vert. (%)', kind: 'range', min: 1, max: 100, step: 1, def: 100 },
      { key: 'type', label: 'Type', kind: 'select', def: 'sine', options: [['sine', 'Sine'], ['triangle', 'Triangle'], ['square', 'Square']] },
      { key: 'undefinedAreas', label: 'Undefined Areas', kind: 'select', def: 'wrap', options: EDGES },
      { key: 'seed', label: 'Pattern', kind: 'seed', def: 0 },
    ],
    run: (src, v, ctx) => waveImage(src, {
      generators: num(v, 'generators'), wavelength: [num(v, 'wavelengthMin'), Math.max(num(v, 'wavelengthMin'), num(v, 'wavelengthMax'))],
      amplitude: [num(v, 'amplitudeMin'), Math.max(num(v, 'amplitudeMin'), num(v, 'amplitudeMax'))], scaleX: num(v, 'scaleX'), scaleY: num(v, 'scaleY'),
      type: str(v, 'type'), edge: str(v, 'undefinedAreas') === 'repeat' ? 'repeat' : 'wrap', seed: num(v, 'seed'),
    }, areaOf(ctx), ctx.scale),
  },
  {
    id: 'zigZag', label: 'ZigZag', group: 'Distort', grows: false, reach: null,
    params: [
      { key: 'amount', label: 'Amount', kind: 'range', min: -100, max: 100, step: 1, def: 10 },
      { key: 'ridges', label: 'Ridges', kind: 'range', min: 0, max: 20, step: 1, def: 5 },
      { key: 'style', label: 'Style', kind: 'select', def: 'pondRipples', options: [['pondRipples', 'Pond ripples'], ['outFromCenter', 'Out from center'], ['aroundCenter', 'Around center']] },
    ],
    run: (src, v, ctx) => zigZagImage(src, num(v, 'amount'), num(v, 'ridges'), str(v, 'style'), areaOf(ctx)),
  },
];

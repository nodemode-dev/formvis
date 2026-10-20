import { gaussianBlur } from './filters';
import type { LibFrame, LibPath } from './filter-library';

/** The rest of the blurs (the "Blur filters" row): Radial Blur (Spin and Zoom) and Surface Blur, and the Blur
 *  Gallery's Field, Iris, Tilt-Shift and Path Blur. Field, Iris and Tilt-Shift give each pixel its own blur radius and
 *  take it from a stack of Gaussian blurs at a few radii, interpolated between the two nearest; Path blurs each pixel
 *  along the path's direction nearest to it. Positions are percentages of the image, so a scaled preview matches. */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function copy(img: ImageData): ImageData { return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height); }

/** Bilinear sample of all four channels at (x, y), edges clamped. */
function sample(d: Uint8ClampedArray, w: number, h: number, x: number, y: number, out: number[]): void {
  const cx = Math.min(w - 1, Math.max(0, x)), cy = Math.min(h - 1, Math.max(0, y)), x0 = Math.floor(cx), y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = cx - x0, fy = cy - y0;
  for (let c = 0; c < 4; c++) {
    const a = d[(y0 * w + x0) * 4 + c], b = d[(y0 * w + x1) * 4 + c], e = d[(y1 * w + x0) * 4 + c], f = d[(y1 * w + x1) * 4 + c];
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
  }
}

/** Radial Blur: Spin blurs along circles around the centre by `amount` (1 to 100, up to about a sixth of a turn), Zoom
 *  along lines from it (up to half the distance to the centre); `quality` sets the samples per pixel (Draft, Good, Best). */
export function radialBlur(img: ImageData, amount: number, method: 'spin' | 'zoom', cxPct: number, cyPct: number, quality: 'draft' | 'good' | 'best' = 'good'): ImageData {
  const { width: w, height: h, data: d } = img, out = copy(img), o = out.data, cx = (cxPct / 100) * w, cy = (cyPct / 100) * h;
  const n = quality === 'draft' ? 8 : quality === 'best' ? 32 : 16, k = Math.max(0, Math.min(100, amount)) / 100, px = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy, acc = [0, 0, 0, 0];
    for (let s = 0; s < n; s++) {
      const t = (s / (n - 1) - 0.5);
      if (method === 'spin') { const a = t * k * (Math.PI / 3), c = Math.cos(a), si = Math.sin(a); sample(d, w, h, cx + dx * c - dy * si, cy + dx * si + dy * c, px); }
      else { const f = 1 + t * k; sample(d, w, h, cx + dx * f, cy + dy * f, px); }
      for (let c = 0; c < 4; c++) acc[c] += px[c];
    }
    const i = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) o[i + c] = Math.round(acc[c] / n);
  }
  return out;
}

/** Surface Blur: each pixel becomes the average of its neighbours within `radius` whose value is within `threshold` (0
 *  to 255) of its own, each weighted by how close in value, so edges keep while flat surfaces smooth. Radii past 8 are
 *  sampled on a grid, which keeps the cost bounded. */
export function surfaceBlur(img: ImageData, radius: number, threshold: number): ImageData {
  const { width: w, height: h, data: d } = img, out = copy(img), o = out.data, r = Math.max(1, Math.round(radius)), t = Math.max(1, threshold);
  const step = Math.max(1, Math.round(r / 8));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      const v0 = d[i + c];
      let sum = 0, wsum = 0;
      for (let yy = -r; yy <= r; yy += step) {
        const ny = y + yy;
        if (ny < 0 || ny >= h) continue;
        for (let xx = -r; xx <= r; xx += step) {
          const nx = x + xx;
          if (nx < 0 || nx >= w || xx * xx + yy * yy > r * r) continue;
          const v = d[(ny * w + nx) * 4 + c], diff = Math.abs(v - v0);
          if (diff > t) continue;
          const wt = 1 - diff / (t * 2.5);
          sum += v * wt; wsum += wt;
        }
      }
      o[i + c] = wsum ? Math.round(sum / wsum) : v0;
    }
  }
  return out;
}

/** Each pixel blurred by its own radius, `radiusAt(x, y)`, taken from a stack of Gaussian blurs up to `max`. */
function variableBlur(img: ImageData, max: number, radiusAt: (x: number, y: number) => number): ImageData {
  const levels = [0, max / 8, max / 4, max / 2, max].filter((r, i, a) => i === 0 || r > a[i - 1] + 0.01);
  const stack = levels.map((r) => (r < 0.3 ? img : gaussianBlur(img, r)));
  const { width: w, height: h } = img, out = copy(img), o = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.max(0, Math.min(max, radiusAt(x, y)));
    let k = 0;
    while (k < levels.length - 2 && levels[k + 1] < r) k++;
    const a = levels[k], b = levels[Math.min(k + 1, levels.length - 1)], f = b > a ? clamp01((r - a) / (b - a)) : 0;
    const i = (y * w + x) * 4, A = stack[k].data, B = stack[Math.min(k + 1, stack.length - 1)].data;
    for (let c = 0; c < 4; c++) o[i + c] = Math.round(A[i + c] * (1 - f) + B[i + c] * f);
  }
  return out;
}

export interface FieldPin { x: number; y: number; blur: number }

/** The gallery's filters and their settings, run by one function that the Filter dialog and the filter worker share. */
export type GalleryKind = 'radialBlur' | 'surfaceBlur' | 'fieldBlur' | 'irisBlur' | 'tiltShift' | 'pathBlur';
export const GALLERY_KINDS: readonly GalleryKind[] = ['radialBlur', 'surfaceBlur', 'fieldBlur', 'irisBlur', 'tiltShift', 'pathBlur'];
export const isGalleryKind = (k: string): k is GalleryKind => (GALLERY_KINDS as readonly string[]).includes(k);
export interface GallerySettings {
  radialAmount: number; radialMethod: 'spin' | 'zoom'; radialQuality: 'draft' | 'good' | 'best'; radialX: number; radialY: number;
  surfaceRadius: number; surfaceThreshold: number;
  pins: number; pin1x: number; pin1y: number; pin1blur: number; pin2x: number; pin2y: number; pin2blur: number; pin3x: number; pin3y: number; pin3blur: number; pin4x: number; pin4y: number; pin4blur: number;
  irisBlur: number; irisX: number; irisY: number; irisRx: number; irisRy: number; irisAngle: number; irisFeather: number; irisRound?: number;
  irisPins?: number; iris2x?: number; iris2y?: number; iris2rx?: number; iris2ry?: number; iris2angle?: number; iris2feather?: number; iris3x?: number; iris3y?: number; iris3rx?: number; iris3ry?: number; iris3angle?: number; iris3feather?: number;
  /** Roundness (0 to 100, 100 an ellipse) and blur of the second and third irises; unset they follow irisRound and irisBlur. */
  iris2round?: number; iris3round?: number; iris2blur?: number; iris3blur?: number;
  tiltBlur: number; tiltX?: number; tiltY: number; tiltAngle: number; tiltFocus: number; tiltTransition: number;
  pathSpeed: number; pathTaper: number; pathSx: number; pathSy: number; pathBx: number; pathBy: number; pathEx: number; pathEy: number;
  /** Path Blur along the document's drawn path (every sub-path of it) instead of the one curve above. */
  pathDrawn?: boolean; pathLines?: LibPath | null;
}

/** Pin positions and iris radii are percents of the layer itself, not of the image grown by the blur's margin: the settings
 *  are restated as percents of the grown image, so changing the blur never moves a pin. */
function pinsOnLayer(g: GallerySettings, src: ImageData, scale: number, frame?: LibFrame | null): GallerySettings {
  const m = Math.round((frame?.margin ?? 0) * scale), W = src.width, H = src.height;
  if (m <= 0 || W <= 2 * m || H <= 2 * m) return g;
  const fx = (W - 2 * m) / W, fy = (H - 2 * m) / H, ox = (m / W) * 100, oy = (m / H) * 100, out = { ...g } as unknown as Record<string, number | undefined>;
  const at = (kx: string, ky: string): void => { const x = out[kx], y = out[ky]; if (typeof x === 'number') out[kx] = ox + x * fx; if (typeof y === 'number') out[ky] = oy + y * fy; };
  const size = (kx: string, ky: string): void => { const x = out[kx], y = out[ky]; if (typeof x === 'number') out[kx] = x * fx; if (typeof y === 'number') out[ky] = y * fy; };
  for (const n of ['pin1', 'pin2', 'pin3', 'pin4']) at(`${n}x`, `${n}y`);
  at('irisX', 'irisY'); size('irisRx', 'irisRy');
  for (const n of ['iris2', 'iris3']) { at(`${n}x`, `${n}y`); size(`${n}rx`, `${n}ry`); }
  for (const [x, y] of [['pathSx', 'pathSy'], ['pathBx', 'pathBy'], ['pathEx', 'pathEy']]) at(x, y);
  return out as unknown as GallerySettings;
}

/** One gallery filter on `src`, pixel distances scaled by `scale` for a scaled preview. */
export function runGallery(kind: GalleryKind, g0: GallerySettings, src: ImageData, scale: number, frame?: LibFrame | null): ImageData {
  const g = kind === 'fieldBlur' || kind === 'irisBlur' || kind === 'pathBlur' ? pinsOnLayer(g0, src, scale, frame) : g0;
  switch (kind) {
    case 'radialBlur': return radialBlur(src, g.radialAmount, g.radialMethod, g.radialX, g.radialY, g.radialQuality);
    case 'surfaceBlur': return surfaceBlur(src, g.surfaceRadius * scale, g.surfaceThreshold);
    case 'fieldBlur': {
      const all: FieldPin[] = [{ x: g.pin1x, y: g.pin1y, blur: g.pin1blur }, { x: g.pin2x, y: g.pin2y, blur: g.pin2blur }, { x: g.pin3x, y: g.pin3y, blur: g.pin3blur }, { x: g.pin4x, y: g.pin4y, blur: g.pin4blur }];
      return fieldBlur(src, all.slice(0, Math.max(1, Math.min(4, Math.round(g.pins)))), scale);
    }
    case 'irisBlur': return irisBlur(src, g.irisBlur, g.irisX, g.irisY, g.irisRx, g.irisRy, g.irisAngle, g.irisFeather, scale, g.irisRound, irisMore(g));
    case 'tiltShift': return tiltShift(src, g.tiltBlur, g.tiltY, g.tiltAngle, g.tiltFocus, g.tiltTransition, scale, g.tiltX);
    case 'pathBlur': return pathBlur(src, g.pathSpeed, [g.pathSx, g.pathSy], [g.pathBx, g.pathBy], [g.pathEx, g.pathEy], g.pathTaper, scale, g.pathDrawn ? drawnLines(g.pathLines ?? null, src, frame ?? null) : null);
  }
}

/** Field Blur: pins, each with its own blur, blended across the image by inverse-distance weighting. */
export function fieldBlur(img: ImageData, pins: FieldPin[], scale = 1): ImageData {
  if (!pins.length) return copy(img);
  const m = fieldRadii(img.width, img.height, pins, scale);
  return variableBlur(img, m.max, m.at);
}

/** A per-pixel blur radius map: the largest radius and the radius at (x, y). Shared by the 8 bit and the float blurs. */
export interface RadiusMap { max: number; at: (x: number, y: number) => number }

/** Field Blur's radius map: inverse-distance weighting of the pins' radii. */
export function fieldRadii(w: number, h: number, pins: FieldPin[], scale = 1): RadiusMap {
  const ps = pins.map((p) => ({ x: (p.x / 100) * w, y: (p.y / 100) * h, r: p.blur * scale }));
  const max = Math.max(0.5, ...ps.map((p) => p.r));
  return {
    max,
    at: (x, y) => {
      let s = 0, ws = 0;
      for (const p of ps) { const d2 = (x - p.x) ** 2 + (y - p.y) ** 2; if (d2 < 1) return p.r; const wt = 1 / d2; s += p.r * wt; ws += wt; }
      return s / ws;
    },
  };
}

/** Iris Blur: sharp inside the focus (the ellipse's inner `feather` fraction), rising to `blur` at the ellipse's edge
 *  and beyond; the ellipse centred at (cx, cy) with radii rx and ry (percent of width and height), turned by `angle`. */
export function irisBlur(img: ImageData, blur: number, cx: number, cy: number, rx: number, ry: number, angle: number, feather: number, scale = 1, roundness = 100, more: IrisPin[] = []): ImageData {
  const m = irisRadii(img.width, img.height, blur, cx, cy, rx, ry, angle, feather, scale, roundness, more);
  return variableBlur(img, m.max, m.at);
}

/** Iris Blur's radius map: the least blur of any iris at each pixel. */
export function irisRadii(w: number, h: number, blur: number, cx: number, cy: number, rx: number, ry: number, angle: number, feather: number, scale = 1, roundness = 100, more: IrisPin[] = []): RadiusMap {
  const roundOf = (r: number | undefined): number => clamp01((r !== undefined && Number.isFinite(r) ? r : 100) / 100);
  const irises = [{ x: cx, y: cy, rx, ry, angle, feather, round: roundness, blur }, ...more].map((p) => {
    const a = (p.angle * Math.PI) / 180, rd = roundOf(p.round);
    return { X: (p.x / 100) * w, Y: (p.y / 100) * h, RX: Math.max(1, (p.rx / 100) * w), RY: Math.max(1, (p.ry / 100) * h), c: Math.cos(a), s: Math.sin(a), inner: clamp01(p.feather / 100), rd, pw: 2 + (1 - rd) * 6, max: Math.max(0.5, (p.blur ?? blur) * scale) };
  });
  const max = Math.max(...irises.map((q) => q.max));
  return {
    max,
    at: (x, y) => {
      let low = max;
      for (const q of irises) {
        const dx = x - q.X, dy = y - q.Y, u = (dx * q.c + dy * q.s) / q.RX, v = (-dx * q.s + dy * q.c) / q.RY, e = q.rd >= 1 ? Math.sqrt(u * u + v * v) : (Math.abs(u) ** q.pw + Math.abs(v) ** q.pw) ** (1 / q.pw);
        low = Math.min(low, q.max * clamp01((e - q.inner) / Math.max(1e-3, 1 - q.inner)));
      }
      return low;
    },
  };
}

/** One more iris for Iris Blur: centre and radii in percent of the image, angle in degrees, sharp area in percent. A pixel takes the least blur of any iris. */
export interface IrisPin { x: number; y: number; rx: number; ry: number; angle: number; feather: number; round?: number; blur?: number }

/** Tilt-Shift: sharp within `focus` percent of the height either side of a line through `cy` at `angle`, rising over
 *  `transition` percent to `blur`. */
export function tiltShift(img: ImageData, blur: number, cy: number, angle: number, focus: number, transition: number, scale = 1, cx = 50): ImageData {
  const m = tiltRadii(img.width, img.height, blur, cy, angle, focus, transition, scale, cx);
  return variableBlur(img, m.max, m.at);
}

/** Tilt-Shift's radius map. */
export function tiltRadii(w: number, h: number, blur: number, cy: number, angle: number, focus: number, transition: number, scale = 1, cx = 50): RadiusMap {
  const X = ((Number.isFinite(cx) ? cx : 50) / 100) * w, Y = (cy / 100) * h, a = (angle * Math.PI) / 180, nx = -Math.sin(a), ny = Math.cos(a);
  const f = (focus / 100) * h, t = Math.max(1, (transition / 100) * h), max = Math.max(0.5, blur * scale);
  return { max, at: (x, y) => max * clamp01((Math.abs((x - X) * nx + (y - Y) * ny) - f) / t) };
}

/** The second and third irises of the settings, as many as `irisPins` asks for. */
function irisMore(g: GallerySettings): IrisPin[] {
  const n = Math.max(1, Math.min(3, Math.round(g.irisPins ?? 1))), more: IrisPin[] = [];
  if (n >= 2) more.push({ x: g.iris2x ?? 25, y: g.iris2y ?? 50, rx: g.iris2rx ?? 15, ry: g.iris2ry ?? 15, angle: g.iris2angle ?? 0, feather: g.iris2feather ?? 50, round: g.iris2round ?? g.irisRound, blur: g.iris2blur ?? g.irisBlur });
  if (n >= 3) more.push({ x: g.iris3x ?? 75, y: g.iris3y ?? 50, rx: g.iris3rx ?? 15, ry: g.iris3ry ?? 15, angle: g.iris3angle ?? 0, feather: g.iris3feather ?? 50, round: g.iris3round ?? g.irisRound, blur: g.iris3blur ?? g.irisBlur });
  return more;
}

/** The radius map of a gallery filter that blurs by a per-pixel radius (Field, Iris, Tilt-Shift), or null for the others. */
export function galleryRadii(kind: GalleryKind, g: GallerySettings, w: number, h: number, scale = 1): RadiusMap | null {
  if (kind === 'fieldBlur') {
    const all: FieldPin[] = [{ x: g.pin1x, y: g.pin1y, blur: g.pin1blur }, { x: g.pin2x, y: g.pin2y, blur: g.pin2blur }, { x: g.pin3x, y: g.pin3y, blur: g.pin3blur }, { x: g.pin4x, y: g.pin4y, blur: g.pin4blur }];
    return fieldRadii(w, h, all.slice(0, Math.max(1, Math.min(4, Math.round(g.pins)))), scale);
  }
  if (kind === 'irisBlur') return irisRadii(w, h, g.irisBlur, g.irisX, g.irisY, g.irisRx, g.irisRy, g.irisAngle, g.irisFeather, scale, g.irisRound, irisMore(g));
  if (kind === 'tiltShift') return tiltRadii(w, h, g.tiltBlur, g.tiltY, g.tiltAngle, g.tiltFocus, g.tiltTransition, scale, g.tiltX);
  return null;
}

export interface PathPoint { x: number; y: number; tx: number; ty: number; u: number }

/** The drawn path's polylines (document pixels) in this image's pixels, through the canvas rectangle; null when none. */
export function drawnLines(path: LibPath | null, img: { width: number; height: number }, frame: { canvas: { x: number; y: number; w: number; h: number } } | null): Array<Array<[number, number]>> | null {
  if (!path) return null;
  const c = frame?.canvas ?? { x: 0, y: 0, w: img.width, h: img.height };
  const out = path.lines.map((l) => Array.from({ length: l.length >> 1 }, (_, i): [number, number] => [c.x + (l[i * 2] / path.w0) * c.w, c.y + (l[i * 2 + 1] / path.h0) * c.h])).filter((l) => l.length > 1);
  return out.length ? out : null;
}

/** Points about every 3 px along each polyline (thinned to at most 2,000 in all), each with its unit tangent and its share of the way along its own line. */
export function drawnPoints(lines: Array<Array<[number, number]>>): PathPoint[] {
  let total = 0;
  for (const l of lines) for (let i = 1; i < l.length; i++) total += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
  const step = Math.max(3, total / 2000), out: PathPoint[] = [];
  for (const l of lines) {
    let len = 0;
    for (let i = 1; i < l.length; i++) len += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    let run = 0;
    for (let i = 1; i < l.length; i++) {
      const dx = l[i][0] - l[i - 1][0], dy = l[i][1] - l[i - 1][1], seg = Math.hypot(dx, dy);
      if (seg === 0) continue;
      const k = Math.max(1, Math.round(seg / step));
      for (let j = 0; j < k; j++) { const t = (j + 0.5) / k; out.push({ x: l[i - 1][0] + dx * t, y: l[i - 1][1] + dy * t, tx: dx / seg, ty: dy / seg, u: len ? (run + seg * t) / len : 0 }); }
      run += seg;
    }
  }
  return out;
}

/** The nearest of `pts` for any pixel, looked up from a coarse grid so a long drawn path stays cheap. */
export function nearestGrid(pts: PathPoint[], w: number, h: number): (x: number, y: number) => PathPoint {
  const cell = Math.max(2, Math.ceil(Math.sqrt((w * h) / 30000))), cw = Math.ceil(w / cell), ch = Math.ceil(h / cell), grid = new Array<PathPoint>(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const x = (cx + 0.5) * cell, y = (cy + 0.5) * cell;
    let best = pts[0], bd = Infinity;
    for (const p of pts) { const dd = (p.x - x) ** 2 + (p.y - y) ** 2; if (dd < bd) { bd = dd; best = p; } }
    grid[cy * cw + cx] = best;
  }
  return (x, y) => grid[Math.min(ch - 1, Math.floor(y / cell)) * cw + Math.min(cw - 1, Math.floor(x / cell))];
}

/** Path Blur: each pixel blurred along the direction of a curved path (start, bend and end, percent of the image) at
 *  its nearest point, over `speed` pixels, tapering along the path by `taper` percent. */
export function pathBlur(img: ImageData, speed: number, start: [number, number], bend: [number, number], end: [number, number], taper: number, scale = 1, lines: Array<Array<[number, number]>> | null = null): ImageData {
  const { width: w, height: h, data: d } = img, out = copy(img), o = out.data, P = [start, bend, end].map(([x, y]) => [(x / 100) * w, (y / 100) * h]);
  const N = 64, pts: PathPoint[] = [];
  for (let i = 0; !lines && i <= N; i++) {
    const u = i / N, v = 1 - u;
    const x = v * v * P[0][0] + 2 * v * u * P[1][0] + u * u * P[2][0], y = v * v * P[0][1] + 2 * v * u * P[1][1] + u * u * P[2][1];
    const tx = 2 * v * (P[1][0] - P[0][0]) + 2 * u * (P[2][0] - P[1][0]), ty = 2 * v * (P[1][1] - P[0][1]) + 2 * u * (P[2][1] - P[1][1]), l = Math.hypot(tx, ty) || 1;
    pts.push({ x, y, tx: tx / l, ty: ty / l, u });
  }
  if (lines) pts.push(...drawnPoints(lines));
  const near = lines && pts.length ? nearestGrid(pts, w, h) : null;
  if (lines && !near) return out;
  const len = Math.max(0, speed * scale), n = Math.max(2, Math.min(48, Math.round(len))), px = [0, 0, 0, 0], tp = clamp01(taper / 100);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = pts[0], bd = Infinity;
    if (near) best = near(x, y);
    else for (const p of pts) { const dd = (p.x - x) ** 2 + (p.y - y) ** 2; if (dd < bd) { bd = dd; best = p; } }
    const L = len * (1 - tp * best.u), acc = [0, 0, 0, 0];
    for (let s = 0; s < n; s++) {
      const t = (s / (n - 1) - 0.5) * L;
      sample(d, w, h, x + best.tx * t, y + best.ty * t, px);
      for (let c = 0; c < 4; c++) acc[c] += px[c];
    }
    const i = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) o[i + c] = Math.round(acc[c] / n);
  }
  return out;
}

import type { LibColor, LibContext, LibFilter, LibValues } from '../filter-library';
import { boxOf, clampInt, clipBox, copyImage, gaussKernel, hash01, luma, separable, type Box } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;
const str = (v: LibValues, k: string): string => v[k] as string;
const origin = (ctx: LibContext): [number, number] => [Math.round(ctx.canvas.x), Math.round(ctx.canvas.y)];

/** Luma of every pixel of an image, as floats. */
function lumaPlane(img: ImageData): Float32Array {
  const s = img.data, out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = luma(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]);
  return out;
}

/** Diffuse: each pixel swapped for a neighbour picked at random (fixed to its place on the canvas, `ox`, `oy` being the
 *  canvas's corner in this image): Normal takes it, Darken Only only a darker one, Lighten Only only a lighter one,
 *  Anisotropic the most alike of three picks. */
export function diffuseImage(src: ImageData, mode: string, seed: number, ox: number, oy: number): ImageData {
  const { width: w, height: h } = src, s = src.data, out = copyImage(src), d = out.data, L = lumaPlane(src);
  const pick = (x: number, y: number, k: number): number => {
    const cx = x - ox, cy = y - oy, dx = Math.floor(hash01(cx, cy, 2 * k, seed) * 3) - 1, dy = Math.floor(hash01(cx, cy, 2 * k + 1, seed) * 3) - 1;
    return clampInt(y + dy, 0, h - 1) * w + clampInt(x + dx, 0, w - 1);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const me = y * w + x;
    let q = pick(x, y, 0);
    if (mode === 'anisotropic') {
      for (let k = 1; k < 3; k++) { const c = pick(x, y, k); if (Math.abs(L[c] - L[me]) < Math.abs(L[q] - L[me])) q = c; }
    } else if ((mode === 'darkenOnly' && L[q] >= L[me]) || (mode === 'lightenOnly' && L[q] <= L[me])) continue;
    for (let c = 0; c < 4; c++) d[me * 4 + c] = s[q * 4 + c];
  }
  return out;
}

/** A fractional offset split once into whole pixels and the fractions between them, so every pixel samples at the same
 *  fractions wherever the image starts. */
type Offset = readonly [number, number, number, number];
const offset = (dx: number, dy: number): Offset => { const ix = Math.floor(dx), iy = Math.floor(dy); return [ix, iy, dx - ix, dy - iy]; };

/** Bilinear sample of a plane at pixel (x, y) moved by `o`, edges clamped. */
function sample(p: Float32Array, w: number, h: number, x: number, y: number, o: Offset): number {
  const [ix, iy, tx, ty] = o, x0 = clampInt(x + ix, 0, w - 1), x1 = clampInt(x + ix + 1, 0, w - 1), y0 = clampInt(y + iy, 0, h - 1), y1 = clampInt(y + iy + 1, 0, h - 1);
  return (p[y0 * w + x0] * (1 - tx) + p[y0 * w + x1] * tx) * (1 - ty) + (p[y1 * w + x0] * (1 - tx) + p[y1 * w + x1] * tx) * ty;
}

/** Emboss: a relief lit from `angle` degrees, each channel mid grey plus Amount times its value `height` pixels away
 *  from the light less its value as far toward it, so slopes facing the light are light, flat colour turns grey and
 *  edges keep a trace of their colour. */
export function embossImage(src: ImageData, angle: number, height: number, amount: number): ImageData {
  const { width: w, height: h } = src, s = src.data, out = copyImage(src), d = out.data, t = (angle * Math.PI) / 180;
  const lx = Math.cos(t) * height, ly = -Math.sin(t) * height, k = amount / 100, plane = new Float32Array(w * h), near = offset(-lx, -ly), far = offset(lx, ly);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < plane.length; i++) plane[i] = s[i * 4 + c];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + c] = 128 + (sample(plane, w, h, x, y, near) - sample(plane, w, h, x, y, far)) * k;
  }
  return out;
}

export interface ExtrudeSettings { kind: string; size: number; depth: number; levelBased: boolean; solidFront: boolean; maskIncomplete: boolean; seed: number }

/** Fills a convex polygon (points in order) with a colour, pixel centres inside it, within the image. */
function fillConvex(img: ImageData, pts: ReadonlyArray<readonly [number, number]>, rgb: readonly number[]): void {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), w = img.width, d = img.data;
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(img.height - 1, Math.ceil(Math.max(...ys)));
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sign = area >= 0 ? 1 : -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    let inside = true;
    for (let i = 0; i < pts.length && inside; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) * sign < 0) inside = false;
    }
    if (!inside) continue;
    const o = (y * w + x) * 4;
    d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
  }
}

/** Extrude: the frame cut into cells of Size, each pushed toward the viewer by a depth (random up to Depth, or from its
 *  brightness) in a perspective from the frame's centre, blocks with shaded sides or pyramids with shaded faces, the
 *  deepest drawn last; Solid Front Faces paints a block's face its mean colour; Mask Incomplete Blocks leaves cells
 *  that cross the frame's edge as they are. */
export function extrudeImage(src: ImageData, o: ExtrudeSettings, area: Box, scale: number): ImageData {
  const b = clipBox(area, src.width, src.height), out = copyImage(src);
  if (!b) return out;
  const cell = Math.max(2, o.size * scale), cx = (area.x0 + area.x1) / 2, cy = (area.y0 + area.y1) / 2, s = src.data, w = src.width;
  const reachOut = Math.max(area.x1 - area.x0, area.y1 - area.y0) * 1.5;
  const items: Array<{ depth: number; i: number; j: number; mean: number[]; x0: number; y0: number; x1: number; y1: number }> = [];
  for (let j = 0; area.y0 + j * cell < area.y1; j++) for (let i = 0; area.x0 + i * cell < area.x1; i++) {
    const x0 = area.x0 + i * cell, y0 = area.y0 + j * cell, x1 = x0 + cell, y1 = y0 + cell;
    if (o.maskIncomplete && (x1 > area.x1 + 0.01 || y1 > area.y1 + 0.01)) continue;
    const mean = [0, 0, 0];
    let n = 0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(src.height, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
      const q = (y * w + x) * 4;
      mean[0] += s[q]; mean[1] += s[q + 1]; mean[2] += s[q + 2]; n++;
    }
    if (!n) continue;
    for (let c = 0; c < 3; c++) mean[c] /= n;
    const depth = (o.levelBased ? luma(mean[0], mean[1], mean[2]) / 255 : hash01(i, j, 5, o.seed)) * o.depth;
    items.push({ depth, i, j, mean, x0, y0, x1, y1 });
  }
  items.sort((a, c) => a.depth - c.depth);
  const lift = (x: number, y: number, depth: number): [number, number] => { const k = 1 + (depth * scale * 2) / reachOut; return [cx + (x - cx) * k, cy + (y - cy) * k]; };
  const shade = (rgb: readonly number[], k: number): number[] => rgb.map((v) => clampInt(v * k, 0, 255));
  for (const it of items) {
    const back: Array<[number, number]> = [[it.x0, it.y0], [it.x1, it.y0], [it.x1, it.y1], [it.x0, it.y1]];
    if (o.kind === 'pyramids') {
      const apex = lift((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.depth * 1.5), tones = [1.15, 0.8, 0.6, 0.95];
      for (let e = 0; e < 4; e++) fillConvex(out, [back[e], back[(e + 1) % 4], apex], shade(it.mean, tones[e]));
      continue;
    }
    const front = back.map(([x, y]) => lift(x, y, it.depth)), tones = [1.2, 0.7, 0.55, 0.9];
    for (let e = 0; e < 4; e++) fillConvex(out, [back[e], back[(e + 1) % 4], front[(e + 1) % 4], front[e]], shade(it.mean, tones[e]));
    if (o.solidFront) { fillConvex(out, front, it.mean); continue; }
    const fx0 = front[0][0], fy0 = front[0][1], k = (front[1][0] - front[0][0]) / (it.x1 - it.x0), d = out.data;
    for (let y = Math.max(0, Math.floor(fy0)); y < Math.min(src.height, Math.ceil(front[2][1])); y++) for (let x = Math.max(0, Math.floor(fx0)); x < Math.min(w, Math.ceil(front[1][0])); x++) {
      const sx = clampInt(Math.floor(it.x0 + (x + 0.5 - fx0) / k), 0, w - 1), sy = clampInt(Math.floor(it.y0 + (y + 0.5 - fy0) / k), 0, src.height - 1), q = (sy * w + sx) * 4, t = (y * w + x) * 4;
      d[t] = s[q]; d[t + 1] = s[q + 1]; d[t + 2] = s[q + 2]; d[t + 3] = 255;
    }
  }
  const kept = out.data;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < w; x++) {
    if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) continue;
    const q = (y * w + x) * 4;
    kept[q] = s[q]; kept[q + 1] = s[q + 1]; kept[q + 2] = s[q + 2]; kept[q + 3] = s[q + 3];
  }
  return out;
}

/** Find Edges: each channel's edge strength (a Sobel gradient) drawn dark on white, flat areas white. */
export function findEdgesImage(src: ImageData): ImageData {
  const { width: w, height: h } = src, s = src.data, out = copyImage(src), d = out.data;
  const at = (x: number, y: number, c: number): number => s[(clampInt(y, 0, h - 1) * w + clampInt(x, 0, w - 1)) * 4 + c];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    const gx = at(x + 1, y - 1, c) + 2 * at(x + 1, y, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x - 1, y, c) - at(x - 1, y + 1, c);
    const gy = at(x - 1, y + 1, c) + 2 * at(x, y + 1, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x, y - 1, c) - at(x + 1, y - 1, c);
    d[(y * w + x) * 4 + c] = 255 - Math.hypot(gx, gy) * 0.5;
  }
  return out;
}

export interface OilSettings { stylization: number; cleanliness: number; brush: number; bristle: number; lighting: boolean; angle: number; shine: number }

/** How far Oil Paint reaches: its stroke length plus the smoothing of its orientation and colour. */
const strokeOf = (o: OilSettings, scale: number): number => (1 + o.stylization * 1.5) * o.brush * scale;
const tensorOf = (o: OilSettings, scale: number): number => (1 + o.brush * 0.8) * scale;
const cleanOf = (o: OilSettings, scale: number): number => (0.3 + o.cleanliness * 0.25) * scale;
export const oilReach = (o: OilSettings, scale: number): number => strokeOf(o, scale) + 3 * tensorOf(o, scale) + 3 * cleanOf(o, scale) + 4;

/** Oil Paint: colours smoothed (Cleanliness), then smeared along the direction of the picture's edges (a flow traced
 *  from its local structure) for a stroke length set by Stylization and Scale; with Lighting, the paint's relief (its
 *  brightness, grooved along the strokes by Bristle Detail) lit from Angle with highlights set by Shine. */
export function oilPaintImage(src: ImageData, o: OilSettings, scale: number, ox: number, oy: number): ImageData {
  const { width: w, height: h } = src, n = w * h, s = src.data, out = copyImage(src), d = out.data;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = s[i * 4 + c];
  const res3 = oilPaintPlanes(rgb, w, h, o, scale, ox, oy);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) d[i * 4 + c] = res3[i * 3 + c];
  return out;
}

/** Oil Paint on three interleaved colour planes (0 to 255 levels, any precision): the painted colours, unclamped. */
export function oilPaintPlanes(rgb: Float32Array, w: number, h: number, o: OilSettings, scale: number, ox: number, oy: number): Float32Array {
  const n = w * h;
  const clean = cleanOf(o, scale), soft = clean >= 0.3 ? separable(rgb, w, h, 3, gaussKernel(clean)) : rgb;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = luma(soft[i * 3], soft[i * 3 + 1], soft[i * 3 + 2]);
  const T = new Float32Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = L[y * w + clampInt(x + 1, 0, w - 1)] - L[y * w + clampInt(x - 1, 0, w - 1)], gy = L[clampInt(y + 1, 0, h - 1) * w + x] - L[clampInt(y - 1, 0, h - 1) * w + x], i = (y * w + x) * 3;
    T[i] = gx * gx; T[i + 1] = gy * gy; T[i + 2] = gx * gy;
  }
  const Ts = separable(T, w, h, 3, gaussKernel(Math.max(0.5, tensorOf(o, scale))));
  const dir = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = Ts[i * 3], b = Ts[i * 3 + 1], c = Ts[i * 3 + 2], phi = 0.5 * Math.atan2(2 * c, a - b) + Math.PI / 2;
    dir[i * 2] = Math.cos(phi); dir[i * 2 + 1] = Math.sin(phi);
  }
  const len = strokeOf(o, scale), steps = Math.max(1, Math.round(len));
  const noise = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) noise[y * w + x] = hash01(x - ox, y - oy, 9, 0);
  const res = new Float32Array(n * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0, 0];
    let wsum = 0;
    for (const sgn of [1, -1]) {
      let px = x + 0.5, py = y + 0.5, dx = dir[(y * w + x) * 2] * sgn, dy = dir[(y * w + x) * 2 + 1] * sgn;
      for (let k = sgn > 0 ? 0 : 1; k <= steps; k++) {
        const ix = clampInt(Math.floor(px), 0, w - 1), iy = clampInt(Math.floor(py), 0, h - 1), i = iy * w + ix, wt = Math.exp(-(k * k) / (2 * Math.max(1, steps * steps * 0.25)));
        acc[0] += soft[i * 3] * wt; acc[1] += soft[i * 3 + 1] * wt; acc[2] += soft[i * 3 + 2] * wt; acc[3] += noise[i] * wt; wsum += wt;
        let ndx = dir[i * 2], ndy = dir[i * 2 + 1];
        if (ndx * dx + ndy * dy < 0) { ndx = -ndx; ndy = -ndy; }
        dx = ndx; dy = ndy; px += dx; py += dy;
      }
    }
    const i = y * w + x;
    for (let c = 0; c < 4; c++) res[i * 4 + c] = acc[c] / wsum;
  }
  const H = new Float32Array(n);
  for (let i = 0; i < n; i++) H[i] = luma(res[i * 4], res[i * 4 + 1], res[i * 4 + 2]) + (res[i * 4 + 3] - 0.5) * o.bristle * 6;
  const t = (o.angle * Math.PI) / 180, lx = Math.cos(t), ly = -Math.sin(t), toward = offset(lx, ly), away = offset(-lx, -ly), out = new Float32Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let lift = 0;
    if (o.lighting) lift = (sample(H, w, h, x, y, toward) - sample(H, w, h, x, y, away)) * (0.6 + o.shine * 0.4);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = res[i * 4 + c] + lift;
  }
  return out;
}

/** Solarize: values past mid grey turned back down, as a photograph exposed to light while developing. */
export function solarizeImage(src: ImageData): ImageData {
  const out = copyImage(src), d = out.data;
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) if (d[i + c] > 127) d[i + c] = 255 - d[i + c];
  return out;
}

/** Tiles: the frame broken into square tiles (Number of Tiles across its shorter side), each slid by up to Maximum
 *  Offset percent of a tile, over the background or foreground colour, the inverse picture or the picture itself. */
export function tilesImage(src: ImageData, count: number, maxOffset: number, fill: string, seed: number, area: Box, fg: LibColor, bg: LibColor): ImageData {
  const b = clipBox(area, src.width, src.height), out = copyImage(src);
  if (!b) return out;
  const s = src.data, d = out.data, w = src.width, side = Math.max(1, Math.min(area.x1 - area.x0, area.y1 - area.y0) / Math.max(1, count)), shift = (side * maxOffset) / 100;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const o = (y * w + x) * 4;
    if (fill === 'unaltered') continue;
    if (fill === 'inverse') { d[o] = 255 - s[o]; d[o + 1] = 255 - s[o + 1]; d[o + 2] = 255 - s[o + 2]; continue; }
    const c = fill === 'foreground' ? fg : bg;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  for (let j = 0; area.y0 + j * side < area.y1; j++) for (let i = 0; area.x0 + i * side < area.x1; i++) {
    const tx = area.x0 + i * side, ty = area.y0 + j * side, mx = Math.round((hash01(i, j, 1, seed) * 2 - 1) * shift), my = Math.round((hash01(i, j, 2, seed) * 2 - 1) * shift);
    for (let y = Math.ceil(ty); y < Math.min(area.y1, Math.ceil(ty + side)); y++) for (let x = Math.ceil(tx); x < Math.min(area.x1, Math.ceil(tx + side)); x++) {
      const nx = x + mx, ny = y + my;
      if (nx < b.x0 || ny < b.y0 || nx >= b.x1 || ny >= b.y1 || x < 0 || y < 0 || x >= w || y >= src.height) continue;
      const q = (y * w + x) * 4, t = (ny * w + nx) * 4;
      d[t] = s[q]; d[t + 1] = s[q + 1]; d[t + 2] = s[q + 2]; d[t + 3] = s[q + 3];
    }
  }
  return out;
}

/** Trace Contour: in each channel, a thin dark line where its value crosses Level (on the side below it for Lower, above
 *  it for Upper), white elsewhere. */
export function traceContourImage(src: ImageData, level: number, upper: boolean): ImageData {
  const { width: w, height: h } = src, s = src.data, out = copyImage(src), d = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    const me = s[(y * w + x) * 4 + c], mine = upper ? me >= level : me < level;
    let line = false;
    if (mine) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const v = s[(yy * w + xx) * 4 + c];
      if (upper ? v < level : v >= level) { line = true; break; }
    }
    d[(y * w + x) * 4 + c] = line ? 0 : 255;
  }
  return out;
}

/** The longest streak each Wind method draws, in pixels. */
export const windReach = (method: string): number => (method === 'blast' ? 48 : method === 'stagger' ? 14 : 18);

/** Wind: bright pixels blown into streaks downwind (to the left for wind from the right), each row's streaks fading over
 *  a length fixed by its place on the canvas: Wind short, Blast long, Stagger in broken bands. */
export function windImage(src: ImageData, method: string, fromRight: boolean, seed: number, ox: number, oy: number, scale: number): ImageData {
  const { width: w, height: h } = src, s = src.data, out = copyImage(src), d = out.data, L = lumaPlane(src), max = windReach(method) * scale;
  for (let y = 0; y < h; y++) {
    const trail = [0, 0, 0, 0];
    let strength = 0, fade = 0.9;
    for (let k = 0; k < w; k++) {
      const x = fromRight ? w - 1 - k : k, i = y * w + x, o = i * 4;
      if (L[i] > strength) {
        const len = Math.max(1, max * (0.35 + 0.65 * hash01(x - ox, y - oy, 1, seed)));
        fade = method === 'stagger' && hash01(Math.floor((x - ox) / 6), y - oy, 2, seed) < 0.4 ? 0 : Math.exp(-3 / len);
        strength = L[i]; for (let c = 0; c < 4; c++) trail[c] = s[o + c];
      } else {
        strength *= fade;
        for (let c = 0; c < 3; c++) trail[c] *= fade;
        if (strength > L[i]) for (let c = 0; c < 3; c++) d[o + c] = Math.max(s[o + c], trail[c]);
      }
    }
  }
  return out;
}

const areaOf = (ctx: LibContext): Box => boxOf(ctx.area);
export const oil = (v: LibValues): OilSettings => ({ stylization: num(v, 'stylization'), cleanliness: num(v, 'cleanliness'), brush: num(v, 'brush'), bristle: num(v, 'bristle'), lighting: v.lighting === true, angle: num(v, 'angle'), shine: num(v, 'shine') });

export const STYLIZE_FILTERS: LibFilter[] = [
  {
    id: 'diffuse', label: 'Diffuse', group: 'Stylize', grows: false, reach: () => 2,
    params: [{ key: 'mode', label: 'Mode', kind: 'select', def: 'normal', options: [['normal', 'Normal'], ['darkenOnly', 'Darken Only'], ['lightenOnly', 'Lighten Only'], ['anisotropic', 'Anisotropic']] }],
    run: (src, v, ctx) => diffuseImage(src, str(v, 'mode'), ctx.seed, ...origin(ctx)),
  },
  {
    id: 'emboss', label: 'Emboss', group: 'Stylize', grows: false,
    params: [
      { key: 'angle', label: 'Angle (°)', kind: 'range', min: -180, max: 180, step: 1, def: 135 },
      { key: 'height', label: 'Height (px)', kind: 'range', min: 1, max: 100, step: 1, def: 3 },
      { key: 'amount', label: 'Amount (%)', kind: 'range', min: 1, max: 500, step: 1, def: 100 },
    ],
    reach: (v, scale) => Math.ceil(Math.max(1, num(v, 'height') * scale)) + 2,
    run: (src, v, ctx) => embossImage(src, num(v, 'angle'), Math.max(1, num(v, 'height') * ctx.scale), num(v, 'amount')),
  },
  {
    id: 'extrude', label: 'Extrude', group: 'Stylize', grows: false, reach: null,
    params: [
      { key: 'type', label: 'Type', kind: 'select', def: 'blocks', options: [['blocks', 'Blocks'], ['pyramids', 'Pyramids']] },
      { key: 'size', label: 'Size (px)', kind: 'range', min: 2, max: 255, step: 1, def: 30 },
      { key: 'depth', label: 'Depth', kind: 'range', min: 1, max: 255, step: 1, def: 30 },
      { key: 'depthMode', label: 'Depth by', kind: 'select', def: 'random', options: [['random', 'Random'], ['levelBased', 'Level-based']] },
      { key: 'solidFront', label: 'Solid Front Faces', kind: 'check', def: false },
      { key: 'maskIncomplete', label: 'Mask Incomplete Blocks', kind: 'check', def: false },
    ],
    run: (src, v, ctx) => extrudeImage(src, { kind: str(v, 'type'), size: num(v, 'size'), depth: num(v, 'depth'), levelBased: str(v, 'depthMode') === 'levelBased', solidFront: v.solidFront === true, maskIncomplete: v.maskIncomplete === true, seed: ctx.seed }, areaOf(ctx), ctx.scale),
  },
  {
    id: 'findEdges', label: 'Find Edges', group: 'Stylize', params: [], grows: false, reach: () => 2,
    run: (src) => findEdgesImage(src),
  },
  {
    id: 'oilPaint', label: 'Oil Paint', group: 'Stylize', grows: false,
    params: [
      { key: 'stylization', label: 'Stylization', kind: 'range', min: 0.1, max: 10, step: 0.1, def: 4 },
      { key: 'cleanliness', label: 'Cleanliness', kind: 'range', min: 0, max: 10, step: 0.1, def: 5 },
      { key: 'brush', label: 'Scale', kind: 'range', min: 0.1, max: 10, step: 0.1, def: 1 },
      { key: 'bristle', label: 'Bristle Detail', kind: 'range', min: 0, max: 10, step: 0.1, def: 5 },
      { key: 'lighting', label: 'Lighting', kind: 'check', def: true },
      { key: 'angle', label: 'Angle (°)', kind: 'range', min: -180, max: 180, step: 1, def: -60 },
      { key: 'shine', label: 'Shine', kind: 'range', min: 0, max: 10, step: 0.1, def: 1 },
    ],
    reach: (v, scale) => oilReach(oil(v), scale),
    run: (src, v, ctx) => oilPaintImage(src, oil(v), ctx.scale, ...origin(ctx)),
  },
  {
    id: 'solarize', label: 'Solarize', group: 'Stylize', params: [], grows: false, reach: () => 0,
    run: (src) => solarizeImage(src),
  },
  {
    id: 'tiles', label: 'Tiles', group: 'Stylize', grows: false, reach: null,
    params: [
      { key: 'count', label: 'Number of Tiles', kind: 'range', min: 1, max: 99, step: 1, def: 10 },
      { key: 'maxOffset', label: 'Maximum Offset (%)', kind: 'range', min: 1, max: 99, step: 1, def: 10 },
      { key: 'fill', label: 'Fill Empty Area With', kind: 'select', def: 'background', options: [['background', 'Background Color'], ['foreground', 'Foreground Color'], ['inverse', 'Inverse Image'], ['unaltered', 'Unaltered Image']] },
    ],
    run: (src, v, ctx) => tilesImage(src, num(v, 'count'), num(v, 'maxOffset'), str(v, 'fill'), ctx.seed, areaOf(ctx), ctx.fg, ctx.bg),
  },
  {
    id: 'traceContour', label: 'Trace Contour', group: 'Stylize', grows: false, reach: () => 2,
    params: [
      { key: 'level', label: 'Level', kind: 'range', min: 0, max: 255, step: 1, def: 128 },
      { key: 'edge', label: 'Edge', kind: 'select', def: 'lower', options: [['lower', 'Lower'], ['upper', 'Upper']] },
    ],
    run: (src, v) => traceContourImage(src, num(v, 'level'), str(v, 'edge') === 'upper'),
  },
  {
    id: 'wind', label: 'Wind', group: 'Stylize', grows: false,
    params: [
      { key: 'method', label: 'Method', kind: 'select', def: 'wind', options: [['wind', 'Wind'], ['blast', 'Blast'], ['stagger', 'Stagger']] },
      { key: 'direction', label: 'Direction', kind: 'select', def: 'fromRight', options: [['fromRight', 'From the Right'], ['fromLeft', 'From the Left']] },
    ],
    reach: (v, scale) => Math.ceil(windReach(str(v, 'method')) * 3 * scale) + 2,
    run: (src, v, ctx) => windImage(src, str(v, 'method'), str(v, 'direction') !== 'fromLeft', ctx.seed, ...origin(ctx), ctx.scale),
  },
];

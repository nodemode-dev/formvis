import type { LibColor, LibContext, LibFilter, LibParam, LibValues } from '../filter-library';
import { boxOf, clampInt, copyImage, hash01, luma, type Box } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;
const str = (v: LibValues, k: string): string => v[k] as string;

/** Smooth value noise at (x, y) in lattice units: random values at whole points, blended by a quintic curve. */
function valueNoise(x: number, y: number, seed: number, octave: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10), u = fade(tx), v = fade(ty);
  const at = (i: number, j: number): number => hash01(i, j, octave, seed);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * u, bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * u;
  return top + (bottom - top) * v;
}

/** Fractal noise: octaves of value noise, each twice as fine and half as strong, until a lattice cell is under two
 *  pixels (`pixels` being one unit's size in pixels); 0 to 1. */
export function fractal(x: number, y: number, seed: number, pixels: number): number {
  let sum = 0, weight = 0, amp = 1, f = 1, octave = 0;
  while (octave < 12 && (octave === 0 || pixels / f >= 2)) {
    sum += valueNoise(x * f, y * f, seed, octave) * amp; weight += amp; amp *= 0.5; f *= 2; octave++;
  }
  return sum / weight;
}

/** The colour between the foreground (at 0) and background (at 1). */
const mixFgBg = (fg: LibColor, bg: LibColor, t: number): [number, number, number] => [fg[0] + (bg[0] - fg[0]) * t, fg[1] + (bg[1] - fg[1]) * t, fg[2] + (bg[2] - fg[2]) * t];

/** Clouds: fractal noise between the foreground and background colours over the canvas (`canvas` its place in this
 *  image, so a band or a preview shows the same clouds), opaque; Difference Clouds takes the difference between the
 *  pixels and the clouds instead. */
export function cloudsImage(src: ImageData, difference: boolean, seed: number, canvas: Box, _scale: number, fg: LibColor, bg: LibColor): ImageData {
  const out = copyImage(src), d = out.data, w = src.width, cw = Math.max(1, canvas.x1 - canvas.x0), ch = Math.max(1, canvas.y1 - canvas.y0);
  const unit = Math.max(cw, ch) / 4, contrast = (t: number): number => clampInt(0.5 + (t - 0.5) * 1.8, 0, 1);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < w; x++) {
    const t = contrast(fractal((x + 0.5 - canvas.x0) / unit, (y + 0.5 - canvas.y0) / unit, seed, unit)), c = mixFgBg(fg, bg, t), o = (y * w + x) * 4;
    if (difference) { d[o] = Math.abs(d[o] - c[0]); d[o + 1] = Math.abs(d[o + 1] - c[1]); d[o + 2] = Math.abs(d[o + 2] - c[2]); }
    else { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
  }
  return out;
}

/** Fibers: threads running down the canvas, between the foreground and background colours: noise fine across and
 *  stretched down, Variance making the threads vary more, Strength making them longer. */
export function fibersImage(src: ImageData, variance: number, strength: number, seed: number, canvas: Box, scale: number, fg: LibColor, bg: LibColor): ImageData {
  const out = copyImage(src), d = out.data, w = src.width, across = 3 * scale, down = across * (2 + strength * 1.5), spread = 0.4 + variance / 40;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5 - canvas.x0) / across, v = (y + 0.5 - canvas.y0) / down;
    const n = fractal(u, v + fractal(u * 0.25, 0, seed + 1, 8) * 2, seed, 6), t = clampInt(0.5 + (n - 0.5) * spread * 2, 0, 1), c = mixFgBg(fg, bg, t), o = (y * w + x) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  return out;
}

/** The secondary reflections each lens adds along the line through the flare and the frame's centre: where on it (0 the
 *  flare, 1 the mirror point), radius as a share of the frame's diagonal, and colour. */
const GHOSTS: Record<string, Array<[number, number, [number, number, number]]>> = {
  zoom: [[0.35, 0.02, [90, 140, 255]], [0.6, 0.035, [120, 255, 140]], [0.9, 0.05, [255, 120, 80]], [1.25, 0.025, [255, 200, 120]], [1.6, 0.06, [140, 120, 255]]],
  prime35: [[0.5, 0.03, [255, 170, 90]], [1.1, 0.045, [110, 170, 255]], [1.5, 0.03, [160, 255, 160]]],
  prime105: [[0.7, 0.05, [255, 220, 160]], [1.3, 0.04, [170, 200, 255]]],
  moviePrime: [[0.4, 0.015, [120, 180, 255]], [0.8, 0.02, [120, 180, 255]], [1.2, 0.03, [120, 180, 255]]],
};

/** Lens Flare: light added to the picture as a camera lens scatters it: a core and glow at the flare's centre (a
 *  percentage of the frame), a faint ring, rays, and coloured reflections along the line through the frame's centre;
 *  Movie Prime spreads a horizontal streak. Brightness scales it all. */
export function lensFlareImage(src: ImageData, brightness: number, cxp: number, cyp: number, lens: string, area: Box): ImageData {
  const out = copyImage(src), d = out.data, w = src.width, fw = area.x1 - area.x0, fh = area.y1 - area.y0, diag = Math.hypot(fw, fh);
  const fx = area.x0 + (cxp / 100) * fw, fy = area.y0 + (cyp / 100) * fh, mx = (area.x0 + area.x1) / 2, my = (area.y0 + area.y1) / 2, k = brightness / 100;
  const ghosts = GHOSTS[lens] ?? GHOSTS.zoom, core = diag * 0.012, glow = diag * (lens === 'prime105' ? 0.12 : 0.08), ring = diag * 0.13;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - fx, dy = y + 0.5 - fy, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    let add = [0, 0, 0];
    const lift = (amt: number, c: readonly number[]): void => { add = [add[0] + c[0] * amt, add[1] + c[1] * amt, add[2] + c[2] * amt]; };
    lift(Math.exp(-(r * r) / (2 * core * core)) * 1.2, [255, 255, 255]);
    lift(Math.exp(-r / glow) * 0.55, [255, 230, 200]);
    lift(Math.exp(-(((r - ring) / (diag * 0.006)) ** 2)) * 0.12, [255, 200, 160]);
    lift(Math.pow(Math.abs(Math.cos(ang * 6)), 40) * Math.exp(-r / (glow * 2.5)) * 0.35, [255, 245, 230]);
    if (lens === 'moviePrime') lift(Math.exp(-(dy * dy) / (2 * (core * 0.6) ** 2)) * Math.exp(-Math.abs(dx) / (diag * 0.35)) * 0.6, [170, 200, 255]);
    for (const [at, rr, c] of ghosts) {
      const gx = fx + (mx - fx) * 2 * at, gy = fy + (my - fy) * 2 * at, gr = rr * diag, dist = Math.hypot(x + 0.5 - gx, y + 0.5 - gy);
      lift(Math.max(0, 1 - Math.abs(dist - gr * 0.6) / (gr * 0.6)) * 0.18, c);
    }
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) d[o + c] = 255 - ((255 - d[o + c]) * (255 - Math.min(255, add[c] * k))) / 255;
  }
  return out;
}

export interface LightSettings {
  type: string; x: number; y: number; z: number; targetX: number; targetY: number; angle: number; elevation: number; color: LibColor;
  intensity: number; cone: number; hotspot: number; radius: number; gloss: number; metallic: number; exposure: number; ambience: number; texture: string; height: number; whiteIsHigh: boolean;
}

const unit3 = (x: number, y: number, z: number): [number, number, number] => { const m = Math.hypot(x, y, z) || 1; return [x / m, y / m, z / m]; };

/** Lighting Effects with up to three lights: each pixel lit by its angle to a spot, point or infinite light (a spot's cone
 *  softened inside Hotspot, a point fading over Radius), plus Ambience; Gloss adds highlights, Metallic tints them with
 *  the surface colour, Exposure brightens or darkens; a texture channel raises a relief whose slopes catch the light.
 *  Positions are percentages of the frame; the light's height of its larger side. */
export function lightingImage(src: ImageData, o: LightSettings, area: Box, more: readonly LightSettings[] = []): ImageData {
  const { width: w, height: h } = src, s = src.data, out = copyImage(src), d = out.data;
  const fw = area.x1 - area.x0, fh = area.y1 - area.y0, size = Math.max(fw, fh);
  const rigs = [o, ...more].map((p) => {
    const lx = area.x0 + (p.x / 100) * fw, ly = area.y0 + (p.y / 100) * fh, lz = (p.z / 100) * size, tx = area.x0 + (p.targetX / 100) * fw, ty = area.y0 + (p.targetY / 100) * fh;
    const ea = (p.angle * Math.PI) / 180, el = (p.elevation * Math.PI) / 180;
    return { p, lx, ly, lz, axis: unit3(tx - lx, ty - ly, -lz), cosCone: Math.cos((p.cone * Math.PI) / 180), cosHot: Math.cos(((p.cone * o.hotspot) / 100) * (Math.PI / 180)), inf: unit3(Math.cos(ea) * Math.cos(el), -Math.sin(ea) * Math.cos(el), Math.sin(el)), strength: p.intensity / 100 };
  });
  const ambient = 0.35 + (o.ambience / 100) * 0.5, gain = Math.pow(2, o.exposure / 50), shininess = 8 + ((o.gloss + 100) / 200) * 120;
  const H = o.texture === 'none' ? null : new Float32Array(w * h);
  if (H) for (let i = 0; i < H.length; i++) {
    const r = s[i * 4], g = s[i * 4 + 1], b = s[i * 4 + 2], a = s[i * 4 + 3];
    const v = o.texture === 'red' ? r : o.texture === 'green' ? g : o.texture === 'blue' ? b : o.texture === 'alpha' ? a : luma(r, g, b);
    H[i] = ((o.whiteIsHigh ? v : 255 - v) / 255) * o.height;
  }
  const hAt = (x: number, y: number): number => (H ? H[clampInt(y, 0, h - 1) * w + clampInt(x, 0, w - 1)] : 0);
  const metal = (o.metallic + 100) / 200, lit = [0, 0, 0], hi = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = unit3(hAt(x - 1, y) - hAt(x + 1, y), hAt(x, y - 1) - hAt(x, y + 1), 2);
    const i = (y * w + x) * 4;
    lit[0] = lit[1] = lit[2] = ambient;
    hi[0] = hi[1] = hi[2] = 0;
    for (const { p, lx, ly, lz, axis, cosCone, cosHot, inf, strength } of rigs) {
      let L: [number, number, number], fall = 1;
      if (p.type === 'infinite') L = inf;
      else {
        L = unit3(lx - x - 0.5, ly - y - 0.5, lz);
        if (p.type === 'spot') {
          const c = -(L[0] * axis[0] + L[1] * axis[1] + L[2] * axis[2]);
          fall = c <= cosCone ? 0 : c >= cosHot ? 1 : (c - cosCone) / Math.max(1e-6, cosHot - cosCone);
        } else fall = Math.max(0, 1 - Math.hypot(lx - x, ly - y) / Math.max(1, (p.radius / 100) * size));
      }
      const diffuse = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) * fall * strength * 1.6;
      const half = unit3(L[0], L[1], L[2] + 1), spec = Math.pow(Math.max(0, n[0] * half[0] + n[1] * half[1] + n[2] * half[2]), shininess) * fall * Math.max(0, strength) * ((o.gloss + 100) / 200);
      for (let c = 0; c < 3; c++) {
        const light = p.color[c] / 255;
        lit[c] += diffuse * light;
        hi[c] += 255 * spec * (light * (1 - metal) + (s[i + c] / 255) * metal);
      }
    }
    for (let c = 0; c < 3; c++) d[i + c] = (s[i + c] * lit[c] + hi[c]) * gain;
  }
  return out;
}

const canvasOf = (ctx: LibContext): Box => boxOf(ctx.canvas);

const light = (v: LibValues, n = 1): LightSettings => {
  const k = (key: string): string => (n === 1 ? key : `l${n}${key[0].toUpperCase()}${key.slice(1)}`), c = typeof v[k('color')] === 'string' && /^#[0-9a-f]{6}$/i.test(v[k('color')] as string) ? (v[k('color')] as string) : '#ffffff';
  return {
    type: str(v, k('type')), x: num(v, k('x')), y: num(v, k('y')), z: num(v, k('z')), targetX: num(v, k('targetX')), targetY: num(v, k('targetY')), angle: num(v, k('angle')), elevation: num(v, k('elevation')),
    color: [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)], intensity: num(v, k('intensity')), cone: num(v, k('cone')), hotspot: num(v, 'hotspot'), radius: num(v, k('radius')),
    gloss: num(v, 'gloss'), metallic: num(v, 'metallic'), exposure: num(v, 'exposure'), ambience: num(v, 'ambience'), texture: str(v, 'texture'), height: num(v, 'height'), whiteIsHigh: v.whiteIsHigh === true,
  };
};

const TYPES: ReadonlyArray<readonly [string, string]> = [['spot', 'Spot'], ['point', 'Point'], ['infinite', 'Infinite']];

/** The controls of an extra light (2 or 3): its own switch, kind, colour, strength and place; Hotspot, Gloss, Metallic,
 *  Exposure, Ambience and the texture are shared with the first light. */
const extraLight = (n: number, on: boolean, x: number, y: number, color: string, type: string): LibParam[] => [
  { key: `l${n}On`, label: `Light ${n} On`, kind: 'check', def: on },
  { key: `l${n}Type`, label: `Light ${n}`, kind: 'select', def: type, options: TYPES },
  { key: `l${n}Color`, label: `Light ${n} Color`, kind: 'color', def: color },
  { key: `l${n}Intensity`, label: `Light ${n} Intensity`, kind: 'range', min: -100, max: 100, step: 1, def: 50 },
  { key: `l${n}X`, label: `Light ${n} X (%)`, kind: 'range', min: 0, max: 100, step: 1, def: x },
  { key: `l${n}Y`, label: `Light ${n} Y (%)`, kind: 'range', min: 0, max: 100, step: 1, def: y },
  { key: `l${n}Z`, label: `Light ${n} Height (%)`, kind: 'range', min: 0, max: 200, step: 1, def: 60 },
  { key: `l${n}TargetX`, label: `Light ${n} Target X (%)`, kind: 'range', min: 0, max: 100, step: 1, def: 50 },
  { key: `l${n}TargetY`, label: `Light ${n} Target Y (%)`, kind: 'range', min: 0, max: 100, step: 1, def: 55 },
  { key: `l${n}Cone`, label: `Light ${n} Cone (°)`, kind: 'range', min: 1, max: 89, step: 1, def: 45 },
  { key: `l${n}Radius`, label: `Light ${n} Point Radius (%)`, kind: 'range', min: 1, max: 1000, step: 1, def: 80 },
  { key: `l${n}Angle`, label: `Light ${n} Infinite Angle (°)`, kind: 'range', min: -180, max: 180, step: 1, def: n === 2 ? -45 : 45 },
  { key: `l${n}Elevation`, label: `Light ${n} Infinite Elevation (°)`, kind: 'range', min: 0, max: 90, step: 1, def: 45 },
];

export const RENDER_FILTERS: LibFilter[] = [
  {
    id: 'clouds', label: 'Clouds', group: 'Render', params: [], grows: false, reach: () => 0, fills: true,
    run: (src, _v, ctx) => cloudsImage(src, false, ctx.seed, canvasOf(ctx), ctx.scale, ctx.fg, ctx.bg),
  },
  {
    id: 'differenceClouds', label: 'Difference Clouds', group: 'Render', params: [], grows: false, reach: () => 0,
    run: (src, _v, ctx) => cloudsImage(src, true, ctx.seed, canvasOf(ctx), ctx.scale, ctx.fg, ctx.bg),
  },
  {
    id: 'fibers', label: 'Fibers', group: 'Render', grows: false, reach: () => 0, fills: true,
    params: [
      { key: 'variance', label: 'Variance', kind: 'range', min: 1, max: 64, step: 1, def: 16 },
      { key: 'strength', label: 'Strength', kind: 'range', min: 1, max: 64, step: 1, def: 4 },
      { key: 'seed', label: 'Pattern', kind: 'seed', def: 0 },
    ],
    run: (src, v, ctx) => fibersImage(src, num(v, 'variance'), num(v, 'strength'), num(v, 'seed'), canvasOf(ctx), ctx.scale, ctx.fg, ctx.bg),
  },
  {
    id: 'lensFlare', label: 'Lens Flare', group: 'Render', grows: false, reach: () => 0,
    params: [
      { key: 'brightness', label: 'Brightness (%)', kind: 'range', min: 10, max: 300, step: 1, def: 100 },
      { key: 'centerX', label: 'Center X (%)', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'centerY', label: 'Center Y (%)', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'lens', label: 'Lens Type', kind: 'select', def: 'zoom', options: [['zoom', '50-300mm Zoom'], ['prime35', '35mm Prime'], ['prime105', '105mm Prime'], ['moviePrime', 'Movie Prime']] },
    ],
    run: (src, v, ctx) => lensFlareImage(src, num(v, 'brightness'), num(v, 'centerX'), num(v, 'centerY'), str(v, 'lens'), boxOf(ctx.area)),
  },
  {
    id: 'lightingEffects', label: 'Lighting Effects', group: 'Render', grows: false, reach: () => 2,
    note: 'Up to three lights (switch Light 2 and Light 3 on); positions in percent of the selection or canvas.',
    params: [
      { key: 'type', label: 'Light', kind: 'select', def: 'spot', options: TYPES },
      { key: 'color', label: 'Color', kind: 'color', def: '#ffffff' },
      { key: 'intensity', label: 'Intensity', kind: 'range', min: -100, max: 100, step: 1, def: 75 },
      { key: 'x', label: 'Light X (%)', kind: 'range', min: 0, max: 100, step: 1, def: 25 },
      { key: 'y', label: 'Light Y (%)', kind: 'range', min: 0, max: 100, step: 1, def: 20 },
      { key: 'z', label: 'Light Height (%)', kind: 'range', min: 0, max: 200, step: 1, def: 60 },
      { key: 'targetX', label: 'Target X (%)', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'targetY', label: 'Target Y (%)', kind: 'range', min: 0, max: 100, step: 1, def: 55 },
      { key: 'cone', label: 'Cone (°)', kind: 'range', min: 1, max: 89, step: 1, def: 45 },
      { key: 'hotspot', label: 'Hotspot (%)', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'radius', label: 'Point Radius (%)', kind: 'range', min: 1, max: 1000, step: 1, def: 80 },
      { key: 'angle', label: 'Infinite Angle (°)', kind: 'range', min: -180, max: 180, step: 1, def: 135 },
      { key: 'elevation', label: 'Infinite Elevation (°)', kind: 'range', min: 0, max: 90, step: 1, def: 45 },
      { key: 'gloss', label: 'Gloss', kind: 'range', min: -100, max: 100, step: 1, def: 0 },
      { key: 'metallic', label: 'Metallic', kind: 'range', min: -100, max: 100, step: 1, def: 0 },
      { key: 'exposure', label: 'Exposure', kind: 'range', min: -100, max: 100, step: 1, def: 0 },
      { key: 'ambience', label: 'Ambience', kind: 'range', min: -100, max: 100, step: 1, def: 8 },
      { key: 'texture', label: 'Texture', kind: 'select', def: 'none', options: [['none', 'None'], ['luminance', 'Luminance'], ['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['alpha', 'Transparency']] },
      { key: 'height', label: 'Texture Height', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'whiteIsHigh', label: 'White is High', kind: 'check', def: true },
      ...extraLight(2, false, 75, 25, '#ffd9a0', 'point'),
      ...extraLight(3, false, 50, 85, '#a0c4ff', 'point'),
    ],
    run: (src, v, ctx) => lightingImage(src, light(v), boxOf(ctx.area), [2, 3].filter((n) => v[`l${n}On`] === true).map((n) => light(v, n))),
  },
];

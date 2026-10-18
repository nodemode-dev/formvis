import { heightField } from './normal-map';
import { clamp, type RGB } from './types';

export type RelightType = 'point' | 'spot' | 'sun' | 'area' | 'strip' | 'ring';
export type RelightPatternKind = 'none' | 'blinds' | 'strip' | 'window' | 'leaves';

export interface RelightPattern {
  kind: RelightPatternKind;
  scale: number;
  width: number;
  slats: number;
  opening: number;
  length: number;
  feather: number;
  rotation: number;
  invert: boolean;
  center?: { x: number; y: number };
}

export interface RelightLight {
  id: string;
  name: string;
  visible: boolean;
  type: RelightType;
  color: RGB;
  kelvin: number | null;
  intensity: number;
  softness: number;
  diffusion: number;
  distance: number;
  pos: { x: number; y: number };
  aim: { x: number; y: number };
  pattern: RelightPattern;
  near?: number;
  far?: number;
}

export interface RelightContent {
  lights: RelightLight[];
  original: number;
  shine: number;
  delight?: number;
  shadows?: number;
  ambient?: RGB;
  look?: string;
  depth?: 'model' | 'estimate';
  split?: 'auto' | 'marigold' | 'classic' | 'off';
}

export interface SplitMaps { shading: Float32Array; residual: Float32Array; gain?: number; subject?: Float32Array | null; texture?: Float32Array | null }

/** Brightness matching (1.82.0): added light is scaled to the subject's average surface brightness, so one Intensity
 *  reads alike on a dark coat and a pale face; the reference portrait's level is 1. */
export const LEVEL_REF = 0.135;
export const levelGain = (level: number | null | undefined): number => (level && level > 0 ? Math.min(3, Math.max(0.5, LEVEL_REF / level)) : 1);

export function withNormals(geo: RelightGeometry, normals: Float32Array): RelightGeometry {
  const data = new Float32Array(geo.data), n = geo.width * geo.height;
  for (let i = 0; i < n; i++) { data[i * 4] = normals[i * 3]; data[i * 4 + 1] = normals[i * 3 + 1]; data[i * 4 + 2] = normals[i * 3 + 2]; }
  return { width: geo.width, height: geo.height, data };
}

export const RELIGHT_TYPES: ReadonlyArray<readonly [RelightType, string]> = [['point', 'Point'], ['spot', 'Spot'], ['sun', 'Sun'], ['area', 'Area'], ['strip', 'Strip'], ['ring', 'Ring']];
export const RELIGHT_PATTERNS: ReadonlyArray<readonly [RelightPatternKind, string]> = [['none', 'None'], ['blinds', 'Blinds'], ['strip', 'Light Strip'], ['window', 'Window'], ['leaves', 'Leaves']];
export const MAX_RELIGHT_LIGHTS = 8;

export function kelvinToRgb(k: number): RGB {
  const t = clamp(k, 1000, 12000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : Math.max(40, t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return { r: Math.round(clamp(r, 0, 255)), g: Math.round(clamp(g, 0, 255)), b: Math.round(clamp(b, 0, 255)) };
}

export const defaultPattern = (): RelightPattern => ({ kind: 'none', scale: 100, width: 100, slats: 14, opening: 55, length: 80, feather: 8, rotation: 0, invert: false });

let seq = 0;
export function newLight(patch: Partial<RelightLight> = {}): RelightLight {
  seq += 1;
  const kelvin = patch.kelvin === undefined ? 5200 : patch.kelvin;
  return {
    id: `light-${Date.now().toString(36)}-${seq}`, name: 'Light', visible: true, type: 'point',
    color: kelvin !== null ? kelvinToRgb(kelvin) : { r: 255, g: 255, b: 255 }, kelvin,
    intensity: 60, softness: 20, diffusion: 20, distance: 35,
    pos: { x: 0.2, y: 0.25 }, aim: { x: 0.5, y: 0.45 }, pattern: defaultPattern(), ...patch,
  };
}

export const defaultRelight = (): RelightContent => ({ lights: [newLight({ name: 'Light 1' })], original: 60, shine: 20 });

const L = (p: Partial<RelightLight> & { kelvin?: number | null }): RelightLight => {
  const l = newLight(p);
  if (p.color) l.color = p.color;
  return l;
};
const named = (lights: RelightLight[]): RelightLight[] => lights.map((l, i) => ({ ...l, name: `Light ${i + 1}` }));

export interface RelightLook { id: string; label: string; make: () => RelightContent }

export const RELIGHT_LOOKS: readonly RelightLook[] = [
  { id: 'soft-key', label: 'Soft Key', make: () => ({ original: 55, shine: 15, lights: named([L({ type: 'area', kelvin: 5600, intensity: 55, softness: 60, diffusion: 45, distance: 40, pos: { x: 0.12, y: 0.2 }, aim: { x: 0.5, y: 0.4 } })]) }) },
  { id: 'rembrandt', label: 'Rembrandt', make: () => ({ original: 35, shine: 20, lights: named([L({ type: 'spot', kelvin: 4800, intensity: 70, softness: 30, diffusion: 15, distance: 30, pos: { x: 0.1, y: 0.12 }, aim: { x: 0.48, y: 0.38 } })]) }) },
  { id: 'split', label: 'Split', make: () => ({ original: 25, shine: 20, lights: named([L({ type: 'point', kelvin: 5000, intensity: 75, softness: 20, diffusion: 5, distance: 25, pos: { x: -0.05, y: 0.4 }, aim: { x: 0.5, y: 0.4 } })]) }) },
  { id: 'rim', label: 'Rim', make: () => ({ original: 45, shine: 35, lights: named([L({ type: 'point', kelvin: 6500, intensity: 80, softness: 15, diffusion: 0, distance: 15, pos: { x: 0.92, y: 0.15 }, aim: { x: 0.55, y: 0.4 } }), L({ type: 'point', kelvin: 6500, intensity: 55, softness: 15, diffusion: 0, distance: 15, pos: { x: 0.08, y: 0.15 }, aim: { x: 0.45, y: 0.4 } })]) }) },
  { id: 'butterfly', label: 'Butterfly', make: () => ({ original: 50, shine: 25, lights: named([L({ type: 'area', kelvin: 5600, intensity: 60, softness: 45, diffusion: 25, distance: 35, pos: { x: 0.5, y: -0.05 }, aim: { x: 0.5, y: 0.35 } })]) }) },
  { id: 'golden-hour', label: 'Golden Hour', make: () => ({ original: 45, shine: 20, lights: named([L({ type: 'sun', kelvin: 3000, intensity: 70, softness: 25, diffusion: 20, distance: 20, pos: { x: -0.1, y: 0.3 }, aim: { x: 0.5, y: 0.45 } })]) }) },
  { id: 'window-blinds', label: 'Window Blinds', make: () => ({ original: 40, shine: 20, lights: named([L({ type: 'sun', kelvin: 3200, intensity: 70, softness: 8, diffusion: 12, distance: 40, pos: { x: -0.15, y: 0.3 }, aim: { x: 0.5, y: 0.45 }, pattern: { ...defaultPattern(), kind: 'blinds', scale: 164, width: 100, slats: 18, opening: 60, feather: 6, rotation: -12 } })]) }) },
  { id: 'window-light', label: 'Window', make: () => ({ original: 45, shine: 15, lights: named([L({ type: 'sun', kelvin: 6000, intensity: 65, softness: 20, diffusion: 25, distance: 45, pos: { x: -0.1, y: 0.2 }, aim: { x: 0.5, y: 0.45 }, pattern: { ...defaultPattern(), kind: 'window', scale: 150, feather: 10 } })]) }) },
  { id: 'candlelight', label: 'Candlelight', make: () => ({ original: 20, shine: 30, lights: named([L({ type: 'point', kelvin: 1800, intensity: 82, softness: 30, diffusion: 25, distance: 10, pos: { x: 0.62, y: 0.42 }, aim: { x: 0.5, y: 0.35 } })]) }) },
  { id: 'neon', label: 'Neon Club', make: () => ({ original: 22, shine: 18, lights: named([L({ type: 'point', kelvin: null, color: { r: 255, g: 43, b: 214 }, intensity: 55, softness: 20, diffusion: 10, distance: 15, pos: { x: 0.2, y: 0.62 }, aim: { x: 0.45, y: 0.4 } }), L({ type: 'point', kelvin: null, color: { r: 109, g: 241, b: 238 }, intensity: 45, softness: 20, diffusion: 10, distance: 15, pos: { x: 0.8, y: 0.35 }, aim: { x: 0.55, y: 0.4 } })]) }) },
  { id: 'moonlight', label: 'Moonlight', make: () => ({ original: 25, shine: 25, lights: named([L({ type: 'sun', kelvin: 9000, intensity: 55, softness: 35, diffusion: 30, distance: 60, pos: { x: 0.9, y: -0.1 }, aim: { x: 0.45, y: 0.5 } })]) }) },
  { id: 'light-strip', label: 'Light Strip', make: () => ({ original: 25, shine: 25, lights: named([L({ type: 'sun', kelvin: 4300, intensity: 60, softness: 18, diffusion: 10, distance: 20, pos: { x: -0.1, y: 0.45 }, aim: { x: 0.5, y: 0.45 }, pattern: { ...defaultPattern(), kind: 'strip', length: 80, width: 38, feather: 30, rotation: 12, center: { x: 0.42, y: 0.42 } } })]) }) },
  { id: 'dappled', label: 'Dappled Shade', make: () => ({ original: 40, shine: 15, lights: named([L({ type: 'sun', kelvin: 4500, intensity: 70, softness: 15, diffusion: 20, distance: 50, pos: { x: 0.85, y: 0.05 }, aim: { x: 0.5, y: 0.5 }, pattern: { ...defaultPattern(), kind: 'leaves', scale: 120, opening: 50, feather: 20 } })]) }) },
  { id: 'ring', label: 'Ring Light', make: () => ({ original: 55, shine: 30, lights: named([L({ type: 'ring', kelvin: 5600, intensity: 55, softness: 50, diffusion: 40, distance: 30, pos: { x: 0.5, y: 0.4 }, aim: { x: 0.5, y: 0.4 } })]) }) },
];

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const pick = <T extends string>(v: unknown, list: ReadonlyArray<readonly [T, string]>, d: T): T => (list.some(([k]) => k === v) ? v as T : d);
const rgb = (v: unknown): RGB => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { r: Math.round(num(o.r, 0, 255, 255)), g: Math.round(num(o.g, 0, 255, 255)), b: Math.round(num(o.b, 0, 255, 255)) };
};
const pt = (v: unknown, d: { x: number; y: number }): { x: number; y: number } => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { x: num(o.x, -2, 3, d.x), y: num(o.y, -2, 3, d.y) };
};

export function relightFrom(raw: unknown): RelightContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.lights)) return null;
  const lights = o.lights.slice(0, MAX_RELIGHT_LIGHTS).map((x, i): RelightLight => {
    const l = (x ?? {}) as Record<string, unknown>, pr = (l.pattern ?? {}) as Record<string, unknown>, dp = defaultPattern();
    return {
      id: typeof l.id === 'string' ? l.id : `light-${i}`, name: typeof l.name === 'string' ? l.name.slice(0, 80) : `Light ${i + 1}`,
      visible: l.visible !== false, type: pick(l.type, RELIGHT_TYPES, 'point'), color: l.color === undefined && typeof l.kelvin === 'number' ? kelvinToRgb(l.kelvin) : rgb(l.color),
      kelvin: l.kelvin === null ? null : num(l.kelvin, 1000, 12000, 5200),
      intensity: num(l.intensity, 0, 100, 60), softness: num(l.softness, 0, 100, 20), diffusion: num(l.diffusion, 0, 100, 20), distance: num(l.distance, 0, 100, 35),
      pos: pt(l.pos, { x: 0.2, y: 0.25 }), aim: pt(l.aim, { x: 0.5, y: 0.45 }),
      ...(l.near !== undefined ? { near: num(l.near, 0, 100, 0) } : {}), ...(l.far !== undefined ? { far: num(l.far, 0, 100, 100) } : {}),
      pattern: {
        kind: pick(pr.kind, RELIGHT_PATTERNS, 'none'), scale: num(pr.scale, 10, 400, dp.scale), width: num(pr.width, 1, 200, dp.width), slats: Math.round(num(pr.slats, 2, 60, dp.slats)),
        opening: num(pr.opening, 1, 99, dp.opening), length: num(pr.length, 1, 200, dp.length), feather: num(pr.feather, 0, 100, dp.feather), rotation: num(pr.rotation, -180, 180, dp.rotation), invert: pr.invert === true,
        ...(pr.center && typeof pr.center === 'object' ? { center: pt(pr.center, { x: 0.5, y: 0.45 }) } : {}),
      },
    };
  });
  return {
    lights, original: num(o.original, 0, 100, 60), shine: num(o.shine, 0, 100, 20),
    ...(o.delight !== undefined ? { delight: num(o.delight, 0, 100, 0) } : {}), ...(o.shadows !== undefined ? { shadows: num(o.shadows, 0, 100, 70) } : {}),
    ...(o.ambient && typeof o.ambient === 'object' ? { ambient: rgb(o.ambient) } : {}),
    ...(typeof o.look === 'string' ? { look: o.look.slice(0, 80) } : {}), ...(o.depth === 'model' || o.depth === 'estimate' ? { depth: o.depth } : {}),
    ...(o.split === 'auto' || o.split === 'marigold' || o.split === 'classic' || o.split === 'off' ? { split: o.split } : {}),
  };
}

export function shadingField(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const s = Math.max(w, h), lum = heightField(rgba, w, h, Math.max(2, Math.round(s / 40)), false), out = new Float32Array(w * h);
  let sum = 0, n = 0;
  for (let i = 0; i < lum.length; i++) { const v = srgbToLinear(clamp(lum[i], 0, 1)); out[i] = v; if (rgba[i * 4 + 3] > 0) { sum += v; n++; } }
  const mean = Math.max(1e-3, sum / Math.max(1, n));
  for (let i = 0; i < out.length; i++) out[i] = clamp(out[i] / mean, 0.25, 4);
  return out;
}

export const depthWindow = (d: number, near: number, far: number): number => {
  const f = 0.04;
  return (near <= 0 ? 1 : smooth(near - f, near + f, d)) * (far >= 1 ? 1 : smooth(far + f, far - f, d));
};

export interface RelightGeometry { width: number; height: number; data: Float32Array }

export function estimateDepth(_rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  return new Float32Array(w * h).fill(0.5);
}

export const NORMAL_RELIEF = 0.7;
export const SHADOW_TAPS: readonly number[] = [-1, -0.33, 0.33, 1];
export const TAKE_OUT = 100;
export const ALBEDO_FLOOR = 0.006;
export const SSS = 0.6;
/** Glints (1.82.0): light caught by the photo's own fine texture (hair strands, pores), added on top of the surface. */
export const GLINT = 0.06;
export const RIM = 0.9;
export const SCENE_DEPTH = 1.2;

function boxBlur(a: Float32Array, w: number, h: number, r: number, passes: number): void {
  if (r < 1) return;
  const tmp = new Float32Array(Math.max(w, h)), span = 2 * r + 1;
  const line = (start: number, stride: number, n: number): void => {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += a[start + clamp(k, 0, n - 1) * stride];
    for (let i = 0; i < n; i++) { tmp[i] = sum / span; sum += a[start + Math.min(n - 1, i + r + 1) * stride] - a[start + Math.max(0, i - r) * stride]; }
    for (let i = 0; i < n; i++) a[start + i * stride] = tmp[i];
  };
  for (let p = 0; p < passes; p++) { for (let y = 0; y < h; y++) line(y * w, 1, w); for (let x = 0; x < w; x++) line(x, w, h); }
}

function erodeMask(m: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = new Float32Array(m.length), b = new Float32Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 1; for (let k = -r; k <= r && v > 0; k++) v = Math.min(v, m[y * w + clamp(x + k, 0, w - 1)]); a[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 1; for (let k = -r; k <= r && v > 0; k++) v = Math.min(v, a[clamp(y + k, 0, h - 1) * w + x]); b[y * w + x] = v; }
  return b;
}

export function resampleDepth(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  if (sw === dw && sh === dh) return src;
  const out = new Float32Array(dw * dh), fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const yy = Math.min(sh - 1, Math.max(0, (y + 0.5) * fy - 0.5)), y0 = Math.floor(yy), y1 = Math.min(sh - 1, y0 + 1), ty = yy - y0;
    for (let x = 0; x < dw; x++) {
      const xx = Math.min(sw - 1, Math.max(0, (x + 0.5) * fx - 0.5)), x0 = Math.floor(xx), x1 = Math.min(sw - 1, x0 + 1), tx = xx - x0;
      const a = src[y0 * sw + x0] + (src[y0 * sw + x1] - src[y0 * sw + x0]) * tx, b = src[y1 * sw + x0] + (src[y1 * sw + x1] - src[y1 * sw + x0]) * tx;
      out[y * dw + x] = a + (b - a) * ty;
    }
  }
  return out;
}

export function depthFromGrey(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] / 255;
  return out;
}

export function relightGeometry(depth: Float32Array, w: number, h: number): RelightGeometry {
  const s = Math.max(w, h), n = w * h, sm = new Float32Array(depth), relief = NORMAL_RELIEF * s, edge = Math.min(3, Math.floor(Math.min(w, h) / 4));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= edge && y >= edge && x < w - edge && y < h - edge) continue;
    sm[y * w + x] = depth[clamp(y, edge, h - 1 - edge) * w + clamp(x, edge, w - 1 - edge)];
  }
  boxBlur(sm, w, h, Math.max(1, Math.round(s / 900)), 2);
  const gx = new Float32Array(n), gy = new Float32Array(n), keep = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    gx[i] = (sm[y * w + Math.min(w - 1, x + 1)] - sm[y * w + Math.max(0, x - 1)]) * 0.5 * relief;
    gy[i] = (sm[Math.min(h - 1, y + 1) * w + x] - sm[Math.max(0, y - 1) * w + x]) * 0.5 * relief;
    keep[i] = Math.hypot(gx[i], gy[i]) < 1.2 ? 1 : 0;
  }
  const k = erodeMask(keep, w, h, Math.max(1, Math.round(s / 600)));
  for (let i = 0; i < n; i++) { gx[i] *= k[i]; gy[i] *= k[i]; }
  const rb = Math.max(1, Math.round(s / 130));
  boxBlur(gx, w, h, rb, 3); boxBlur(gy, w, h, rb, 3); boxBlur(k, w, h, rb, 3);
  const data = new Float32Array(n * 4), zs = new Float32Array(sm);
  boxBlur(zs, w, h, Math.max(1, Math.round(s / 150)), 3);
  for (let i = 0; i < n; i++) {
    const wgt = k[i] + 1e-4, nx = -gx[i] / wgt, ny = -gy[i] / wgt, len = Math.hypot(nx, ny, 1);
    data[i * 4] = nx / len; data[i * 4 + 1] = ny / len; data[i * 4 + 2] = 1 / len; data[i * 4 + 3] = clamp(zs[i], 0, 1);
  }
  return { width: w, height: h, data };
}

export interface PackedLight {
  type: number; color: [number, number, number]; intensity: number; softness: number; diffusion: number; distance: number;
  pos: [number, number]; aim: [number, number]; pattern: number; pat: [number, number, number, number]; pat2: [number, number, number, number]; range: [number, number]; center: [number, number];
}

const TYPE_CODE: Record<RelightType, number> = { point: 0, spot: 1, sun: 2, area: 3, strip: 4, ring: 5 };
const PATTERN_CODE: Record<RelightPatternKind, number> = { none: 0, blinds: 1, strip: 2, window: 3, leaves: 4 };

export function packLights(c: RelightContent, w: number, h: number): PackedLight[] {
  return c.lights.filter((l) => l.visible && l.intensity > 0).slice(0, MAX_RELIGHT_LIGHTS).map((l) => ({
    type: TYPE_CODE[l.type], color: [Math.pow(l.color.r / 255, 1.5), Math.pow(l.color.g / 255, 1.5), Math.pow(l.color.b / 255, 1.5)],
    intensity: 0.95 * (l.intensity / 100) ** 2, softness: l.softness / 100, diffusion: l.diffusion / 100, distance: l.distance / 100,
    pos: [l.pos.x * w, l.pos.y * h], aim: [l.aim.x * w, l.aim.y * h], pattern: PATTERN_CODE[l.pattern.kind] * (l.pattern.invert ? -1 : 1),
    pat: [l.pattern.scale / 100, l.pattern.width / 100, l.pattern.slats, l.pattern.opening / 100],
    pat2: [l.pattern.length / 100, l.pattern.feather / 100, (l.pattern.rotation * Math.PI) / 180, 0],
    range: [(l.near ?? 0) / 100, (l.far ?? 100) / 100], center: l.pattern.center ? [l.pattern.center.x * w, l.pattern.center.y * h] : [l.aim.x * w, l.aim.y * h],
  }));
}

export function srgbToLinear(v: number): number { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
export function linearToSrgb(v: number): number { return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }

const smooth = (a: number, b: number, x: number): number => { const d = b - a, t = clamp((x - a) / (Math.abs(d) < 1e-6 ? (d < 0 ? -1e-6 : 1e-6) : d), 0, 1); return t * t * (3 - 2 * t); };
const fract = (x: number): number => x - Math.floor(x);
const hash = (x: number, y: number): number => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function patternAt(kind: number, u: number, v: number, s: number, pat: readonly number[], pat2: readonly number[], soft: number, frameOnly = false): number {
  const k = Math.abs(kind);
  if (k === 0 || (frameOnly && (kind < 0 || k === 4))) return 1;
  const rot = pat2[2], cr = Math.cos(rot), sr = Math.sin(rot), x = (u * cr + v * sr) / s, y = (-u * sr + v * cr) / s;
  const feather = Math.max(0.002, pat2[1] * 0.25 + soft * 0.08);
  let m = 1;
  if (k === 1) {
    const half = 0.28 * pat[0], hw = half * pat[1], frame = smooth(hw, hw - feather, Math.abs(x)) * smooth(half, half - feather, Math.abs(y));
    const period = (2 * half) / Math.max(2, pat[2]), ph = fract((y + half) / period), open = pat[3], f = feather / period;
    const hf = Math.min(f, 0.3) * 0.5, wash = clamp((f - 0.3) / 0.7, 0, 1), q = Math.abs(fract(ph - open * 0.5 + 0.5) - 0.5);
    m = frameOnly ? frame : frame * (smooth(open * 0.5 + hf, open * 0.5 - hf, q) * (1 - wash) + open * wash);
  } else if (k === 2) {
    const hl = 0.58 * pat2[0] * pat[0], hw = 0.5 * pat[1] * 0.2 * pat[0];
    const fw = Math.max(0.002, 2 * hw * (pat2[1] + 0.3 * soft));
    m = smooth(hl + fw / 2, hl - fw / 2, Math.abs(y)) * smooth(hw + fw / 2, hw - fw / 2, Math.abs(x));
  } else if (k === 3) {
    const half = 0.32 * pat[0], bar = 0.02 * pat[0], frame = smooth(half, half - feather, Math.abs(x)) * smooth(half * 1.3, half * 1.3 - feather, Math.abs(y));
    m = frameOnly ? frame : frame * smooth(bar, bar + feather, Math.abs(x)) * smooth(bar, bar + feather, Math.abs(y));
  } else {
    const sc = 6 / Math.max(0.1, pat[0]), n = vnoise(x * sc, y * sc) * 0.65 + vnoise(x * sc * 2.3 + 7, y * sc * 2.3 + 3) * 0.35;
    m = smooth(1 - pat[3] - feather, 1 - pat[3] + feather, n);
  }
  return kind < 0 ? 1 - m : m;
}

export interface ShadeOptions { shadowSteps?: number; shade?: Float32Array | null; split?: SplitMaps | null }

export function sceneTerms(content: RelightContent): { ambient: [number, number, number]; delight: number; shadows: number; takeOut: number } {
  const a = content.ambient ?? { r: 255, g: 255, b: 255 }, o = content.original / 100;
  return { ambient: [srgbToLinear(a.r / 255) * o, srgbToLinear(a.g / 255) * o, srgbToLinear(a.b / 255) * o], delight: (content.delight ?? 0) / 100, shadows: (content.shadows ?? 85) / 100, takeOut: (content.delight ?? TAKE_OUT) / 100 };
}

export function shadeRelight(base: Uint8ClampedArray, geo: RelightGeometry, content: RelightContent, opts: ShadeOptions = {}): Uint8ClampedArray {
  const w = geo.width, h = geo.height, g = geo.data, s = Math.max(w, h), relief = SCENE_DEPTH * s, out = new Uint8ClampedArray(base.length);
  const lights = packLights(content, w, h), shine = content.shine / 100, steps = opts.shadowSteps ?? 16, sc = sceneTerms(content), shade = opts.shade ?? null, split = opts.split ?? null;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255);
  const zAt = (x: number, y: number): number => g[(clamp(Math.floor(y), 0, h - 1) * w + clamp(Math.floor(x), 0, w - 1)) * 4 + 3] * relief;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, nx = g[i], ny = g[i + 1], nz = g[i + 2], pz = g[i + 3] * relief;
    const q = (y * w + x) * 3, S0 = split ? split.shading : null, gm = sc.takeOut;
    const sR = S0 ? Math.max(1e-4, S0[q]) : 1, sG = S0 ? Math.max(1e-4, S0[q + 1]) : 1, sB = S0 ? Math.max(1e-4, S0[q + 2]) : 1;
    let er = sc.ambient[0] * Math.pow(sR, gm), eg = sc.ambient[1] * Math.pow(sG, gm), eb = sc.ambient[2] * Math.pow(sB, gm), sr = 0, sg = 0, sb = 0;
    if (split) { const ro = content.original / 100; sr = split.residual[q] * ro; sg = split.residual[q + 1] * ro; sb = split.residual[q + 2] * ro; }
    const d = g[i + 3];
    for (const L of lights) {
      const win = depthWindow(d, L.range[0], L.range[1]);
      if (win <= 0) continue;
      const c = lightAt(L, x + 0.5, y + 0.5, pz, nx, ny, nz, s, relief, steps, zAt, sc.shadows, split?.subject ? split.subject[y * w + x] : -1);
      const gn = (split?.gain ?? 1) * win, warm = clamp((lut[base[i]] - lut[base[i + 2]]) / (lut[base[i]] + 1e-3) * 1.6, 0, 1) * c.sss;
      er += (L.color[0] * c.diffuse + warm * L.color[0]) * gn; eg += (L.color[1] * c.diffuse + warm * 0.35 * L.color[1]) * gn; eb += L.color[2] * c.diffuse * gn;
      const lift = c.spec * shine + c.diffuse * ALBEDO_FLOOR + c.glint * GLINT * (0.35 + shine) * (split?.texture ? split.texture[y * w + x] : 0) * (split?.gain ?? 1);
      sr += L.color[0] * lift * win; sg += L.color[1] * lift * win; sb += L.color[2] * lift * win;
    }
    const k = shade && !split ? 1 / (1 + (shade[y * w + x] - 1) * sc.delight) : 1, kr = Math.pow(sR, 1 - gm), kg = Math.pow(sG, 1 - gm), kb = Math.pow(sB, 1 - gm);
    const lr = Math.max(0, lut[base[i]] * k * kr * er + sr), lg = Math.max(0, lut[base[i + 1]] * k * kg * eg + sg), lb = Math.max(0, lut[base[i + 2]] * k * kb * eb + sb);
    const peak = Math.max(lr, lg, lb, 1e-6), roll = tone(peak) / peak;
    out[i] = Math.round(linearToSrgb(lr * roll) * 255);
    out[i + 1] = Math.round(linearToSrgb(lg * roll) * 255);
    out[i + 2] = Math.round(linearToSrgb(lb * roll) * 255);
    out[i + 3] = base[i + 3];
  }
  return out;
}

/** A sun's direction toward the light: from the handle's side of the aim, raised toward the top of the picture and
 *  toward the camera by Close to Far, as daylight through a window falls. */
export function sunTo(dx: number, dy: number, distance: number): [number, number, number] {
  const k = Math.hypot(dx, dy) || 1, e = (20 + 40 * distance) * Math.PI / 180, c = Math.cos(e), sn = Math.sin(e);
  const x = dx / k * c, y = dy / k * c - 0.35 * sn, z = 0.9 * sn + 0.6, n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}

export interface Gobo { to: [number, number, number]; f: [number, number, number]; r: [number, number, number]; d: [number, number, number]; sun: boolean }

/** The light as a projector: `to` points from the aimed surface to the light (a direction for a sun, an offset in
 *  pixels for the rest), `f` is the throw, `r` and `d` span the gobo with `d` nearest the picture's down. */
export function goboBasis(type: number, pos: readonly number[], aim: readonly number[], distance: number, s: number): Gobo {
  const sun = type === 2, dx = pos[0] - aim[0], dy = pos[1] - aim[1];
  let to: [number, number, number];
  if (sun) to = sunTo(dx, dy, distance);
  else to = [dx, dy, (0.12 + 0.9 * distance) * 0.5 * s];
  const tl = Math.hypot(to[0], to[1], to[2]) || 1, f: [number, number, number] = [-to[0] / tl, -to[1] / tl, -to[2] / tl];
  const rl = Math.hypot(f[2], f[0]), r: [number, number, number] = rl < 1e-4 ? [1, 0, 0] : [-f[2] / rl, 0, f[0] / rl];
  return { to, f, r, d: [r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1]], sun };
}

/** Gobo coordinates of a point given relative to the aimed surface (x, y in pixels, z in relief pixels). */
export function goboUV(G: Gobo, x: number, y: number, z: number): [number, number] | null {
  if (G.sun) return [x * G.r[0] + y * G.r[1] + z * G.r[2], x * G.d[0] + y * G.d[1] + z * G.d[2]];
  const ax = x - G.to[0], ay = y - G.to[1], az = z - G.to[2], t = ax * G.f[0] + ay * G.f[1] + az * G.f[2];
  if (t < 1e-3) return null;
  const k = Math.hypot(G.to[0], G.to[1], G.to[2]) / t;
  return [(ax * G.r[0] + ay * G.r[1] + az * G.r[2]) * k, (ax * G.d[0] + ay * G.d[1] + az * G.d[2]) * k];
}

/** Where the light's ray through a surface point (x, y relative to the pattern centre, z its height above the centre's
 *  surface) meets the picture plane at the centre's depth: the pattern is laid out on that plane as the canvas frame
 *  shows it, and anything nearer or farther takes it shifted along the light, so it bends over the subject's shape. */
export function goboPlaneUV(G: Gobo, x: number, y: number, z: number): [number, number] | null {
  if (G.sun) { const k = z / Math.max(0.15, G.to[2]); return [x - G.to[0] * k, y - G.to[1] * k]; }
  const dz = G.to[2] - z;
  if (dz < 1e-3) return null;
  const t = G.to[2] / dz;
  return [G.to[0] + (x - G.to[0]) * t, G.to[1] + (y - G.to[1]) * t];
}

/** Where a gobo point lands on the plane of the aimed surface, relative to the aim (for the on-canvas frame). */
export function goboPoint(G: Gobo, u: number, v: number): [number, number] | null {
  const gx = u * G.r[0] + v * G.d[0], gy = u * G.r[1] + v * G.d[1], gz = u * G.r[2] + v * G.d[2];
  if (G.sun) { if (Math.abs(G.f[2]) < 1e-4) return null; const t = -gz / G.f[2]; return [gx + t * G.f[0], gy + t * G.f[1]]; }
  const dz = gz - G.to[2];
  if (Math.abs(dz) < 1e-4) return null;
  const k = -G.to[2] / dz;
  return k > 0 ? [G.to[0] + (gx - G.to[0]) * k, G.to[1] + (gy - G.to[1]) * k] : null;
}

function tone(v: number): number { return v <= 0.8 ? Math.max(0, v) : 0.8 + 0.2 * (1 - Math.exp(-(v - 0.8) / 0.2)); }

export function lightAt(L: PackedLight, px: number, py: number, pz: number, nx: number, ny: number, nz: number, s: number, relief: number, steps: number, zAt: (x: number, y: number) => number, shadowAmt = 1, subj = -1): { diffuse: number; spec: number; sss: number; glint: number } {
  const zAim = zAt(L.aim[0], L.aim[1]), hL = zAim + (0.12 + 0.9 * L.distance) * 0.5 * s;
  let lx: number, ly: number, lz: number, atten = 1, maxRun = 0.45 * s;
  if (L.type === 2) {
    [lx, ly, lz] = sunTo(L.pos[0] - L.aim[0], L.pos[1] - L.aim[1], L.distance);
  } else {
    let qx = L.pos[0], qy = L.pos[1];
    if (L.type === 4) {
      const dx = L.aim[0] - L.pos[0], dy = L.aim[1] - L.pos[1], d = Math.hypot(dx, dy) || 1, tx = -dy / d, ty = dx / d, half = 0.25 * s;
      const t = clamp((px - L.pos[0]) * tx + (py - L.pos[1]) * ty, -half, half);
      qx += tx * t; qy += ty * t;
    }
    const vx = qx - px, vy = qy - py, vz = (L.type === 5 ? relief + 0.6 * s : hL) - pz, dist = Math.hypot(vx, vy, vz);
    lx = vx / dist; ly = vy / dist; lz = vz / dist;
    const R = (0.25 + L.distance) * s, dA = Math.hypot(L.aim[0] - L.pos[0], L.aim[1] - L.pos[1], hL - zAim), g = (q: number): number => 1 / (1 + (q / R) ** 1.6);
    atten = 2.2 * Math.min(2.5, g(dist) / g(dA));
    maxRun = Math.min(maxRun, Math.hypot(vx, vy));
    if (L.type === 1) {
      const ax = L.aim[0] - L.pos[0], ay = L.aim[1] - L.pos[1], az = zAim - hL, ad = Math.hypot(ax, ay, az) || 1;
      const cosA = -(lx * ax + ly * ay + lz * az) / ad, cone = Math.cos((18 + 22 * L.softness) * Math.PI / 180), edge = Math.cos((30 + 30 * L.softness) * Math.PI / 180);
      atten *= smooth(edge, cone, cosA);
    }
  }
  const dzA = zAim - pz, sun = L.type === 2, behind = subj < 0 ? dzA : dzA * (1 - subj) + Math.min(0, dzA) * subj, reach = (sun ? 0.06 + 0.6 * L.distance : 0.05 + 0.4 * L.distance) * relief, rr = behind > 0 ? behind / reach : -behind / (reach * 2.5);
  atten = atten / (sun ? 1 + rr * rr : (1 + rr * rr) ** 3) * (sun ? 2.7 : 1);
  const wrapExtra = L.type === 3 ? 0.35 : L.type === 5 ? 0.5 : 0.3, wr = clamp(L.diffusion + wrapExtra + 1.2 * L.softness, 0, 1.5);
  const ndl = nx * lx + ny * ly + nz * lz, lam = clamp((ndl + wr) / (1 + wr), 0, 1);
  if (ndl < -0.6 || atten <= 1e-4) return { diffuse: 0, spec: 0, sss: 0, glint: 0 };
  let shadow = 1;
  if (L.type !== 5 && steps > 0 && lz < 0.999) {
    const flat = Math.hypot(lx, ly) || 1e-6, k = (1.5 + 4.5 * (1 - L.softness)) * (L.type === 3 ? 0.5 : 1), run = Math.max(4, maxRun), bias = relief * 0.004;
    const spread = (0.04 + 0.22 * L.softness) * (L.type === 3 ? 1.6 : 1), dx = lx / flat, dy = ly / flat, ox = -dy, oy = dx;
    let total = 0;
    for (const o of SHADOW_TAPS) {
      let sh = 1;
      const sx = dx + ox * o * spread, sy = dy + oy * o * spread, sl = Math.hypot(sx, sy) || 1, ux = sx / sl, uy = sy / sl, uz = lz / flat * (1 + Math.abs(o) * spread * 0.5);
      for (let j = 1; j <= steps; j++) {
        const t = (j / steps) * (j / steps) * run, occ = zAt(px + ux * t, py + uy * t) - (pz + uz * t) - bias;
        if (occ > 0) sh = Math.min(sh, clamp(1 - k * occ / Math.max(1, t), 0, 1));
        if (sh <= 0) break;
      }
      total += sh;
    }
    shadow = total / SHADOW_TAPS.length;
  }
  shadow = 1 - (1 - shadow) * shadowAmt;
  let pattern = 1, frame = 1;
  if (L.pattern !== 0) {
    const C = L.center, zC = zAim, band = 0.06 * relief;
    const uv = goboPlaneUV(goboBasis(L.type, L.pos, L.type === 2 ? L.aim : C, L.distance, s), px - C[0], py - C[1], subj >= 0 ? (pz - zC) * (1 - subj) + 0.3 * band * Math.tanh((pz - zC) / (0.3 * band)) * subj : band * Math.tanh((pz - zC) / band));
    const spread = L.softness + (Math.abs(L.pattern) === 2 ? 0 : 4 * Math.max(0, behind) / relief);
    pattern = uv ? patternAt(L.pattern, uv[0], uv[1], s, L.pat, L.pat2, spread) : 0;
    frame = uv ? patternAt(L.pattern, uv[0], uv[1], s, L.pat, L.pat2, spread, true) : 0;
  }
  const amount = L.intensity * 3.2 * atten * shadow * pattern, hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz) || 1;
  const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), gloss = 8 + 56 * (1 - L.softness);
  const nxy = Math.max(1e-3, Math.hypot(nx, ny)), lxy = Math.max(1e-3, Math.hypot(lx, ly));
  const rim = subj > 0 ? RIM * subj * clamp(1 - nz, 0, 1) ** 2 * Math.max(0, (nx * lx + ny * ly) / (nxy * lxy)) : 0;
  return { diffuse: amount * (lam + rim) * (1 - L.diffusion) + L.intensity * 3.2 * atten * L.diffusion * 0.3 * frame * clamp(0.5 + 0.5 * ndl, 0, 1), spec: ndl > 0 ? Math.pow(nh, gloss) * amount * 0.15 : 0,
    sss: amount * (1 - L.diffusion) * SSS * Math.max(0, clamp((ndl + 0.6) / 1.6, 0, 1) - lam), glint: amount * clamp((ndl + 0.3) / 1.3, 0, 1) };
}

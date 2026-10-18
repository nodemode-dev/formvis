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
}

export interface RelightContent {
  lights: RelightLight[];
  original: number;
  shine: number;
  look?: string;
  depth?: 'model' | 'estimate';
}

export const RELIGHT_TYPES: ReadonlyArray<readonly [RelightType, string]> = [['point', 'Point'], ['spot', 'Spot'], ['sun', 'Sun'], ['area', 'Area'], ['strip', 'Strip'], ['ring', 'Ring']];
export const RELIGHT_PATTERNS: ReadonlyArray<readonly [RelightPatternKind, string]> = [['none', 'None'], ['blinds', 'Blinds'], ['strip', 'Light Strip'], ['window', 'Window'], ['leaves', 'Leaves']];
export const MAX_RELIGHT_LIGHTS = 8;

export function kelvinToRgb(k: number): RGB {
  const t = clamp(k, 1000, 12000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
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
  { id: 'neon', label: 'Neon Club', make: () => ({ original: 20, shine: 35, lights: named([L({ type: 'point', kelvin: null, color: { r: 255, g: 43, b: 214 }, intensity: 70, softness: 20, diffusion: 10, distance: 15, pos: { x: 0.08, y: 0.7 }, aim: { x: 0.45, y: 0.4 } }), L({ type: 'point', kelvin: null, color: { r: 109, g: 241, b: 238 }, intensity: 60, softness: 20, diffusion: 10, distance: 15, pos: { x: 0.92, y: 0.3 }, aim: { x: 0.55, y: 0.4 } })]) }) },
  { id: 'moonlight', label: 'Moonlight', make: () => ({ original: 25, shine: 25, lights: named([L({ type: 'sun', kelvin: 9000, intensity: 55, softness: 35, diffusion: 30, distance: 60, pos: { x: 0.9, y: -0.1 }, aim: { x: 0.45, y: 0.5 } })]) }) },
  { id: 'light-strip', label: 'Light Strip', make: () => ({ original: 25, shine: 25, lights: named([L({ type: 'sun', kelvin: 4300, intensity: 86, softness: 6, diffusion: 10, distance: 40, pos: { x: 0.15, y: 0.25 }, aim: { x: 0.5, y: 0.4 }, pattern: { ...defaultPattern(), kind: 'strip', length: 80, width: 38, feather: 8, rotation: 12 } })]) }) },
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
      visible: l.visible !== false, type: pick(l.type, RELIGHT_TYPES, 'point'), color: rgb(l.color),
      kelvin: l.kelvin === null ? null : num(l.kelvin, 1000, 12000, 5200),
      intensity: num(l.intensity, 0, 100, 60), softness: num(l.softness, 0, 100, 20), diffusion: num(l.diffusion, 0, 100, 20), distance: num(l.distance, 0, 100, 35),
      pos: pt(l.pos, { x: 0.2, y: 0.25 }), aim: pt(l.aim, { x: 0.5, y: 0.45 }),
      pattern: {
        kind: pick(pr.kind, RELIGHT_PATTERNS, 'none'), scale: num(pr.scale, 10, 400, dp.scale), width: num(pr.width, 1, 200, dp.width), slats: Math.round(num(pr.slats, 2, 60, dp.slats)),
        opening: num(pr.opening, 1, 99, dp.opening), length: num(pr.length, 1, 200, dp.length), feather: num(pr.feather, 0, 100, dp.feather), rotation: num(pr.rotation, -180, 180, dp.rotation), invert: pr.invert === true,
      },
    };
  });
  return { lights, original: num(o.original, 0, 100, 60), shine: num(o.shine, 0, 100, 20), ...(typeof o.look === 'string' ? { look: o.look } : {}), ...(o.depth === 'model' || o.depth === 'estimate' ? { depth: o.depth } : {}) };
}

export interface RelightGeometry { width: number; height: number; data: Float32Array }

export function estimateDepth(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const s = Math.max(w, h), lum = heightField(rgba, w, h, Math.max(2, Math.round(s / 30)), false), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x / w - 0.5) * 2, dy = (y / h - 0.45) * 2, dome = clamp(1 - (dx * dx * 0.8 + dy * dy * 0.6), 0, 1);
    out[y * w + x] = clamp(0.75 * dome + 0.25 * lum[y * w + x], 0, 1);
  }
  return out;
}

export function depthFromGrey(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] / 255;
  return out;
}

export function relightGeometry(depth: Float32Array, w: number, h: number): RelightGeometry {
  const s = Math.max(w, h), r = Math.max(1, Math.round(s / 400)), sm = new Float32Array(depth);
  const tmp = new Float32Array(Math.max(w, h));
  const line = (start: number, stride: number, n: number): void => {
    const span = 2 * r + 1;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += sm[start + clamp(k, 0, n - 1) * stride];
    for (let i = 0; i < n; i++) { tmp[i] = sum / span; sum += sm[start + Math.min(n - 1, i + r + 1) * stride] - sm[start + Math.max(0, i - r) * stride]; }
    for (let i = 0; i < n; i++) sm[start + i * stride] = tmp[i];
  };
  for (let pass = 0; pass < 2; pass++) { for (let y = 0; y < h; y++) line(y * w, 1, w); for (let x = 0; x < w; x++) line(x, w, h); }
  const relief = 0.25 * s, data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, xl = sm[y * w + Math.max(0, x - 1)], xr = sm[y * w + Math.min(w - 1, x + 1)], yu = sm[Math.max(0, y - 1) * w + x], yd = sm[Math.min(h - 1, y + 1) * w + x];
    const nx = -(xr - xl) * 0.5 * relief, ny = -(yd - yu) * 0.5 * relief, len = Math.hypot(nx, ny, 1);
    data[i * 4] = nx / len; data[i * 4 + 1] = ny / len; data[i * 4 + 2] = 1 / len; data[i * 4 + 3] = clamp(sm[i], 0, 1);
  }
  return { width: w, height: h, data };
}

export interface PackedLight {
  type: number; color: [number, number, number]; intensity: number; softness: number; diffusion: number; distance: number;
  pos: [number, number]; aim: [number, number]; pattern: number; pat: [number, number, number, number]; pat2: [number, number, number, number];
}

const TYPE_CODE: Record<RelightType, number> = { point: 0, spot: 1, sun: 2, area: 3, strip: 4, ring: 5 };
const PATTERN_CODE: Record<RelightPatternKind, number> = { none: 0, blinds: 1, strip: 2, window: 3, leaves: 4 };

export function packLights(c: RelightContent, w: number, h: number): PackedLight[] {
  return c.lights.filter((l) => l.visible && l.intensity > 0).slice(0, MAX_RELIGHT_LIGHTS).map((l) => ({
    type: TYPE_CODE[l.type], color: [srgbToLinear(l.color.r / 255), srgbToLinear(l.color.g / 255), srgbToLinear(l.color.b / 255)],
    intensity: l.intensity / 100, softness: l.softness / 100, diffusion: l.diffusion / 100, distance: l.distance / 100,
    pos: [l.pos.x * w, l.pos.y * h], aim: [l.aim.x * w, l.aim.y * h], pattern: PATTERN_CODE[l.pattern.kind] * (l.pattern.invert ? -1 : 1),
    pat: [l.pattern.scale / 100, l.pattern.width / 100, l.pattern.slats, l.pattern.opening / 100],
    pat2: [l.pattern.length / 100, l.pattern.feather / 100, (l.pattern.rotation * Math.PI) / 180, 0],
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

export function patternAt(kind: number, u: number, v: number, s: number, pat: readonly number[], pat2: readonly number[], soft: number): number {
  const k = Math.abs(kind);
  if (k === 0) return 1;
  const rot = pat2[2], cr = Math.cos(rot), sr = Math.sin(rot), x = (u * cr + v * sr) / s, y = (-u * sr + v * cr) / s;
  const feather = Math.max(0.002, pat2[1] * 0.25 + soft * 0.08);
  let m = 1;
  if (k === 1) {
    const half = 0.5 * pat[0], hw = half * pat[1], frame = smooth(hw, hw - feather, Math.abs(x)) * smooth(half, half - feather, Math.abs(y));
    const period = (2 * half) / Math.max(2, pat[2]), ph = fract((y + half) / period), open = pat[3], f = feather / period;
    m = frame * smooth(open, open - f, ph) * smooth(0, f, ph);
  } else if (k === 2) {
    const hl = 0.5 * pat2[0] * pat[0], hw = 0.5 * pat[1] * 0.25 * pat[0];
    m = smooth(hl, hl - feather, Math.abs(y)) * smooth(hw, hw - feather, Math.abs(x));
  } else if (k === 3) {
    const half = 0.32 * pat[0], bar = 0.02 * pat[0], frame = smooth(half, half - feather, Math.abs(x)) * smooth(half * 1.3, half * 1.3 - feather, Math.abs(y));
    m = frame * smooth(bar, bar + feather, Math.abs(x)) * smooth(bar, bar + feather, Math.abs(y));
  } else {
    const sc = 6 / Math.max(0.1, pat[0]), n = vnoise(x * sc, y * sc) * 0.65 + vnoise(x * sc * 2.3 + 7, y * sc * 2.3 + 3) * 0.35;
    m = smooth(1 - pat[3] - feather, 1 - pat[3] + feather, n);
  }
  return kind < 0 ? 1 - m : m;
}

export interface ShadeOptions { shadowSteps?: number }

export function shadeRelight(base: Uint8ClampedArray, geo: RelightGeometry, content: RelightContent, opts: ShadeOptions = {}): Uint8ClampedArray {
  const w = geo.width, h = geo.height, g = geo.data, s = Math.max(w, h), relief = 0.25 * s, out = new Uint8ClampedArray(base.length);
  const lights = packLights(content, w, h), orig = content.original / 100, shine = content.shine / 100, steps = opts.shadowSteps ?? 16;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255);
  const zAt = (x: number, y: number): number => g[(clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)) * 4 + 3] * relief;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, nx = g[i], ny = g[i + 1], nz = g[i + 2], pz = g[i + 3] * relief;
    let er = orig, eg = orig, eb = orig, sr = 0, sg = 0, sb = 0;
    for (const L of lights) {
      const c = lightAt(L, x + 0.5, y + 0.5, pz, nx, ny, nz, s, relief, steps, zAt);
      er += L.color[0] * c.diffuse; eg += L.color[1] * c.diffuse; eb += L.color[2] * c.diffuse;
      sr += L.color[0] * c.spec * shine; sg += L.color[1] * c.spec * shine; sb += L.color[2] * c.spec * shine;
    }
    out[i] = Math.round(linearToSrgb(tone(lut[base[i]] * er + sr)) * 255);
    out[i + 1] = Math.round(linearToSrgb(tone(lut[base[i + 1]] * eg + sg)) * 255);
    out[i + 2] = Math.round(linearToSrgb(tone(lut[base[i + 2]] * eb + sb)) * 255);
    out[i + 3] = base[i + 3];
  }
  return out;
}

function tone(v: number): number { return v <= 0.8 ? Math.max(0, v) : 0.8 + 0.2 * (1 - Math.exp(-(v - 0.8) / 0.2)); }

export function lightAt(L: PackedLight, px: number, py: number, pz: number, nx: number, ny: number, nz: number, s: number, relief: number, steps: number, zAt: (x: number, y: number) => number): { diffuse: number; spec: number } {
  const hL = relief + (0.08 + 1.4 * L.distance) * s;
  let lx: number, ly: number, lz: number, atten = 1, maxRun = 0.45 * s;
  if (L.type === 2) {
    const dx = L.aim[0] - L.pos[0], dy = L.aim[1] - L.pos[1], d = Math.hypot(dx, dy) || 1, elev = (12 + 58 * L.distance) * Math.PI / 180;
    lx = -dx / d * Math.cos(elev); ly = -dy / d * Math.cos(elev); lz = Math.sin(elev);
  } else {
    let qx = L.pos[0], qy = L.pos[1];
    if (L.type === 4) {
      const dx = L.aim[0] - L.pos[0], dy = L.aim[1] - L.pos[1], d = Math.hypot(dx, dy) || 1, tx = -dy / d, ty = dx / d, half = 0.25 * s;
      const t = clamp((px - L.pos[0]) * tx + (py - L.pos[1]) * ty, -half, half);
      qx += tx * t; qy += ty * t;
    }
    const vx = qx - px, vy = qy - py, vz = (L.type === 5 ? relief + 0.6 * s : hL) - pz, dist = Math.hypot(vx, vy, vz);
    lx = vx / dist; ly = vy / dist; lz = vz / dist;
    const R = (0.3 + 2.2 * L.distance) * s;
    atten = 1 / (1 + (dist / R) * (dist / R)) * 1.6;
    maxRun = Math.min(maxRun, Math.hypot(vx, vy));
    if (L.type === 1) {
      const ax = L.aim[0] - L.pos[0], ay = L.aim[1] - L.pos[1], az = relief * 0.5 - hL, ad = Math.hypot(ax, ay, az) || 1;
      const cosA = -(lx * ax + ly * ay + lz * az) / ad, cone = Math.cos((18 + 22 * L.softness) * Math.PI / 180), edge = Math.cos((30 + 30 * L.softness) * Math.PI / 180);
      atten *= smooth(edge, cone, cosA);
    }
  }
  const wrapExtra = L.type === 3 ? 0.35 : L.type === 5 ? 0.5 : 0, wr = clamp(L.diffusion + wrapExtra, 0, 1.5);
  const ndl = nx * lx + ny * ly + nz * lz, lam = clamp((ndl + wr) / (1 + wr), 0, 1);
  if (lam <= 0 || atten <= 1e-4) return { diffuse: 0, spec: 0 };
  let shadow = 1;
  if (L.type !== 5 && steps > 0 && lz < 0.999) {
    const flat = Math.hypot(lx, ly) || 1e-6, k = (1 + 7 * (1 - L.softness)) * (L.type === 3 ? 0.5 : 1), run = Math.max(4, maxRun), bias = relief * 2 / 255;
    for (let j = 1; j <= steps; j++) {
      const t = (j / steps) * (j / steps) * run, rx = px + lx / flat * t, ry = py + ly / flat * t, rz = pz + lz / flat * t;
      const occ = zAt(rx, ry) - rz - bias;
      if (occ > 0) shadow = Math.min(shadow, clamp(1 - k * occ / Math.max(1, t), 0, 1));
      if (shadow <= 0) break;
    }
  }
  let pattern = 1;
  if (L.pattern !== 0) {
    const par = (pz - relief * 0.5) * 0.35 / Math.max(0.25, lz), gx = px + lx * par, gy = py + ly * par;
    pattern = patternAt(L.pattern, gx - L.aim[0], gy - L.aim[1], s, L.pat, L.pat2, L.softness);
  }
  const amount = L.intensity * 3.2 * atten * shadow * pattern, hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz) || 1;
  const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), gloss = 8 + 56 * (1 - L.softness);
  return { diffuse: amount * lam, spec: ndl > 0 ? Math.pow(nh, gloss) * amount * 0.6 : 0 };
}

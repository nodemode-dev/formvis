import { heightField } from './normal-map';
import { clamp, type RGB } from './types';

export type RelightType = 'point' | 'spot' | 'sun' | 'area' | 'strip' | 'ring';
export type RelightPatternKind = 'none' | 'blinds' | 'strip' | 'window' | 'leaves' | 'caustics' | 'lattice' | 'arch' | 'dapple' | 'circle';

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
  /** The room around the subject (1.85.0): Room light (0 to 100, the room's kept original light; Original lighting when
   *  unset), Light on room (0 to 200 percent), Room shadows (0 to 100), Room depth (25 to 300 percent of the solved
   *  distance behind the subject). */
  roomOriginal?: number;
  roomLight?: number;
  roomShadows?: number;
  roomDepth?: number;
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
  return { ...geo, data };
}

export const RELIGHT_TYPES: ReadonlyArray<readonly [RelightType, string]> = [['point', 'Point'], ['spot', 'Spot'], ['sun', 'Sun'], ['area', 'Area'], ['strip', 'Strip'], ['ring', 'Ring']];
export const RELIGHT_PATTERNS: ReadonlyArray<readonly [RelightPatternKind, string]> = [['none', 'None'], ['blinds', 'Blinds'], ['strip', 'Light Strip'], ['window', 'Window'], ['leaves', 'Leaves'], ['caustics', 'Caustics'], ['lattice', 'Lattice'], ['arch', 'Arch'], ['dapple', 'Dapple'], ['circle', 'Circle']];
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
    ...(o.roomOriginal !== undefined ? { roomOriginal: num(o.roomOriginal, 0, 100, 40) } : {}), ...(o.roomLight !== undefined ? { roomLight: num(o.roomLight, 0, 200, 100) } : {}),
    ...(o.roomShadows !== undefined ? { roomShadows: num(o.roomShadows, 0, 100, 100) } : {}), ...(o.roomDepth !== undefined ? { roomDepth: num(o.roomDepth, 25, 300, 100) } : {}),
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

/** The scene in camera space (1.84.0): `data` holds the normal (z toward the viewer) and the distance along the camera
 *  axis in units of the subject's distance; `bg` the same for the background layer filled in behind the subject;
 *  `focal` is a fraction of the long side; `thickness` how deep the subject is; `zNear` and `zFar` span the depth bands. */
export interface RelightGeometry { width: number; height: number; data: Float32Array; bg?: Float32Array; focal?: number; thickness?: number; zNear?: number; zFar?: number }

function zSpan(data: Float32Array): [number, number] {
  const n = data.length / 4, step = Math.max(1, Math.floor(n / 4096)), zs: number[] = [];
  for (let i = 0; i < n; i += step) zs.push(data[i * 4 + 3]);
  zs.sort((a, b) => a - b);
  return [zs[Math.floor(zs.length * 0.02)] ?? 1, zs[Math.floor(zs.length * 0.98)] ?? 2];
}

/** The engine's solved scene as Relight's geometry: camera-space distance and normals for the composite and for the
 *  background layer, the camera's focal length and the subject's thickness. */
export function sceneGeometry(depth: Float32Array, normals: Float32Array, bgDepth: Float32Array | null, bgNormals: Float32Array | null, w: number, h: number, focal: number, thickness: number): RelightGeometry {
  const n = w * h, data = new Float32Array(n * 4), bg = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = normals[i * 3]; data[i * 4 + 1] = normals[i * 3 + 1]; data[i * 4 + 2] = normals[i * 3 + 2]; data[i * 4 + 3] = Math.max(0.05, depth[i]);
    const bn = bgNormals ?? normals, bd = bgDepth ?? depth;
    bg[i * 4] = bn[i * 3]; bg[i * 4 + 1] = bn[i * 3 + 1]; bg[i * 4 + 2] = bn[i * 3 + 2]; bg[i * 4 + 3] = Math.max(0.05, bd[i]);
  }
  const [zNear, zFar] = zSpan(data);
  return { width: w, height: h, data, bg, focal, thickness, zNear, zFar };
}

export function estimateDepth(_rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  return new Float32Array(w * h).fill(0.5);
}

export const NORMAL_RELIEF = 0.7;
export const TAKE_OUT = 100;
/** Warm materials (skin, fur) take red light this far past the shadow edge. */
export const SSS = 0.6;
/** A light behind the subject draws a rim along its outline and through fine strands. */
export const RIM = 0.9;

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
  // Relative depth (1 nearest) as distance along the camera axis, the middle of the picture at 1, with a 45 degree lens.
  const mid = zs[Math.floor(h / 2) * w + Math.floor(w / 2)] ?? 0.5, zMid = 1 / (0.3 + 0.7 * clamp(mid, 0, 1));
  for (let i = 0; i < n; i++) {
    const wgt = k[i] + 1e-4, nx = -gx[i] / wgt, ny = -gy[i] / wgt, len = Math.hypot(nx, ny, 1);
    data[i * 4] = nx / len; data[i * 4 + 1] = ny / len; data[i * 4 + 2] = 1 / len; data[i * 4 + 3] = 1 / (0.3 + 0.7 * clamp(zs[i], 0, 1)) / zMid;
  }
  const [zNear, zFar] = zSpan(data);
  return { width: w, height: h, data, focal: 1.2, thickness: 0.3, zNear, zFar };
}

export interface PackedLight {
  type: number; color: [number, number, number]; intensity: number; softness: number; diffusion: number; distance: number;
  pos: [number, number]; aim: [number, number]; pattern: number; pat: [number, number, number, number]; pat2: [number, number, number, number]; range: [number, number]; center: [number, number];
}

const TYPE_CODE: Record<RelightType, number> = { point: 0, spot: 1, sun: 2, area: 3, strip: 4, ring: 5 };
const PATTERN_CODE: Record<RelightPatternKind, number> = { none: 0, blinds: 1, strip: 2, window: 3, leaves: 4, caustics: 5, lattice: 6, arch: 7, dapple: 8, circle: 9 };

export function packLights(c: RelightContent, w: number, h: number): PackedLight[] {
  return c.lights.filter((l) => l.visible && l.intensity > 0).slice(0, MAX_RELIGHT_LIGHTS).map((l) => ({
    type: TYPE_CODE[l.type], color: [Math.pow(l.color.r / 255, 1.5), Math.pow(l.color.g / 255, 1.5), Math.pow(l.color.b / 255, 1.5)],
    intensity: 1.4 * (l.intensity / 100) ** 2, softness: l.softness / 100, diffusion: l.diffusion / 100, distance: l.distance / 100,
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
  if (k === 0 || (frameOnly && (kind < 0 || k === 4 || k === 5 || k === 8))) return 1;
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
  } else if (k === 4) {
    const sc = 6 / Math.max(0.1, pat[0]), n = vnoise(x * sc, y * sc) * 0.65 + vnoise(x * sc * 2.3 + 7, y * sc * 2.3 + 3) * 0.35;
    m = smooth(1 - pat[3] - feather, 1 - pat[3] + feather, n);
  } else if (k === 5) {
    const sc = (2 + 0.3 * pat[2]) / Math.max(0.1, pat[0]), px = x * sc, py = y * sc;
    const qx = px + (vnoise(px + 3.1, py + 1.7) - 0.5) * 1.6, qy = py + (vnoise(px + 8.3, py + 2.8) - 0.5) * 1.6;
    const wx = vnoise(qx * 2.1 + 1.9, qy * 2.1 + 6.1) - 0.5, wy = vnoise(qx * 2.1 + 4.4, qy * 2.1 + 9.7) - 0.5;
    const n = vnoise(qx, qy) * 0.55 + vnoise(qx * 2.03 + 5.2 + wx * 0.8, qy * 2.03 + 1.3 + wy * 0.8) * 0.3 + vnoise(qx * 4.1 + 9.1, qy * 4.1 + 4.7) * 0.15;
    const ridge = Math.max(0, 1 - Math.abs(2 * n - 1)), pw = (2 + 14 * (1 - pat[3])) / (1 + 8 * feather);
    m = 0.25 + 0.75 * Math.pow(ridge, pw);
  } else if (k === 6) {
    const hx = 0.32 * pat[0], hy = hx * 1.3, frame = smooth(hx, hx - feather, Math.abs(x)) * smooth(hy, hy - feather, Math.abs(y));
    const per = (2 * hx) / Math.max(2, pat[2]), bw = (1 - pat[3]) * 0.3 * per, fl = Math.min(feather, per * 0.3);
    const da = Math.abs(fract((x + y) / per + 0.5) - 0.5) * per * Math.SQRT1_2, db = Math.abs(fract((x - y) / per + 0.5) - 0.5) * per * Math.SQRT1_2;
    m = frameOnly ? frame : frame * smooth(bw, bw + fl, da) * smooth(bw, bw + fl, db);
  } else if (k === 7) {
    const hh = 0.4 * pat[0], hw = Math.min(0.22 * pat[1], 0.4) * pat[0], yc = hw - hh, bar = 0.018 * pat[0], y2 = (yc + hh) / 2;
    const dd = y < yc ? Math.hypot(x, y - yc) - hw : Math.max(Math.abs(x) - hw, y - hh), frame = smooth(0, -feather, dd);
    m = frameOnly ? frame : frame * smooth(bar, bar + feather, Math.abs(x)) * smooth(bar, bar + feather, Math.abs(y - yc)) * smooth(bar, bar + feather, Math.abs(y - y2));
  } else if (k === 8) {
    const cs = 0.1 * pat[0], ix = Math.floor(x / cs), iy = Math.floor(y / cs);
    let miss = 1;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j;
        if (hash(cx + 17.3, cy + 5.1) >= pat[3]) continue;
        const dx = x - (cx + 0.1 + 0.8 * hash(cx + 3.7, cy + 11.9)) * cs, dy = y - (cy + 0.1 + 0.8 * hash(cx + 29.1, cy + 7.3)) * cs;
        const r = 0.5 * cs * (0.5 + 0.8 * hash(cx + 41.7, cy + 23.9));
        miss *= 1 - smooth(r, Math.max(0, 0.55 * r - feather), Math.hypot(dx, dy));
      }
    }
    m = 1 - miss;
  } else if (k === 9) {
    const rad = 0.3 * pat[0];
    m = smooth(rad, rad - feather, Math.hypot(x / Math.max(0.05, pat[1]), y));
  }
  return kind < 0 ? 1 - m : m;
}

export interface ShadeOptions { shadowSteps?: number; shade?: Float32Array | null; split?: SplitMaps | null }

export interface SceneTerms {
  ambient: [number, number, number]; delight: number; shadows: number; takeOut: number;
  /** The room around the subject (1.85.0): its kept share of the original light, how strongly the lights reach it, how
   *  dark the subject's shadows on it fall, and how far behind the subject it stands (1 as the scene was solved). */
  roomAmbient: [number, number, number]; roomOriginal: number; roomLight: number; roomShadows: number; roomDepth: number;
}

export function sceneTerms(content: RelightContent): SceneTerms {
  const a = content.ambient ?? { r: 255, g: 255, b: 255 }, o = content.original / 100, ro = (content.roomOriginal ?? content.original) / 100;
  const lin: [number, number, number] = [srgbToLinear(a.r / 255), srgbToLinear(a.g / 255), srgbToLinear(a.b / 255)];
  return {
    ambient: [lin[0] * o, lin[1] * o, lin[2] * o], delight: (content.delight ?? 0) / 100, shadows: (content.shadows ?? 85) / 100, takeOut: (content.delight ?? TAKE_OUT) / 100,
    roomAmbient: [lin[0] * ro, lin[1] * ro, lin[2] * ro], roomOriginal: ro, roomLight: (content.roomLight ?? 100) / 100, roomShadows: (content.roomShadows ?? 100) / 100, roomDepth: (content.roomDepth ?? 100) / 100,
  };
}

/** The CPU twin of the shader (1.84.0), pixel for pixel the same scene: two layers blended by the cut-out, each lit in
 *  camera space, the photo times the kept share of its own light plus the surface colour times the added light. */
export function shadeRelight(base: Uint8ClampedArray, geo: RelightGeometry, content: RelightContent, opts: ShadeOptions = {}): Uint8ClampedArray {
  const w = geo.width, h = geo.height, g = geo.data, bgd = geo.bg ?? geo.data, out = new Uint8ClampedArray(base.length);
  const lights = packLights(content, w, h), shine = content.shine / 100, sc = sceneTerms(content), shade = opts.shade ?? null, split = opts.split ?? null;
  const S: Scene = { C: { w, h, s: Math.max(w, h), f: geo.focal ?? 1.2 }, g, m: split?.subject ?? null, thick: geo.thickness ?? 0.3, zr: [geo.zNear ?? 0.8, geo.zFar ?? 2.5], steps: Math.min(32, opts.shadowSteps ?? 16), shadows: sc.shadows, gain: split?.gain ?? 1, roomLight: sc.roomLight, roomShadows: sc.roomShadows, roomDepth: sc.roomDepth };
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = y * w + x, i = j * 4, q = j * 3;
    const s0 = split ? [Math.max(1e-4, split.shading[q]), Math.max(1e-4, split.shading[q + 1]), Math.max(1e-4, split.shading[q + 2])] : [1, 1, 1];
    const res = split ? [split.residual[q], split.residual[q + 1], split.residual[q + 2]] : [0, 0, 0];
    const subj = split ? split.subject?.[j] ?? -1 : -1, tex = split ? Math.max(0, split.texture?.[j] ?? -1) : 0;
    let alb = [lut[base[i]], lut[base[i + 1]], lut[base[i + 2]]];
    const photo = split ? [alb[0] * s0[0] + res[0], alb[1] * s0[1] + res[1], alb[2] * s0[2] + res[2]] : alb;
    const yp = 0.2126 * photo[0] + 0.7152 * photo[1] + 0.0722 * photo[2], ya = 0.2126 * alb[0] + 0.7152 * alb[1] + 0.0722 * alb[2], kc = smooth(0.0015, 0.012, yp);
    alb = alb.map((v) => ya + (v - ya) * kc);
    const warm = clamp((alb[0] - alb[2]) / (alb[0] + 1e-3) * 1.6, 0, 1), m = subj < 0 ? 0 : clamp(subj, 0, 1);
    const Es = [0, 0, 0], Eb = [0, 0, 0], Ss = [0, 0, 0], Sb = [0, 0, 0], px = x + 0.5, py = y + 0.5, ray = rayAt(S.C, px, py);
    if (subj < 0 || m < 0.98) { const src = subj < 0 ? g : bgd, z = subj < 0 ? g[i + 3] : 1 + (bgd[i + 3] - 1) * S.roomDepth; shadeLayer(S, lights, [ray[0] * z, ray[1] * z, z], [src[i], src[i + 1], src[i + 2]], 0, 0, warm, subj < 0 ? 0 : 1, Eb, Sb); }
    if (m > 0.02) { const zs = m > 0.98 ? g[i + 3] : Math.max(0.05, (g[i + 3] - (1 - m) * bgd[i + 3]) / m); shadeLayer(S, lights, [ray[0] * zs, ray[1] * zs, zs], [g[i], g[i + 1], g[i + 2]], m, tex, warm, 0, Es, Ss); }
    const mk = subj < 0 ? 1 : m, origK = sc.roomOriginal + (content.original / 100 - sc.roomOriginal) * mk;
    const kd = shade && !split ? 1 / (1 + (shade[j] - 1) * sc.delight) : 1, o = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const ea = Eb[c] + (Es[c] - Eb[c]) * m, sa0 = (Sb[c] + (Ss[c] - Sb[c]) * m) * shine * 2, sa = sa0 / (1 + sa0);
      let v = Math.max(0, alb[c] * kd * Math.pow(s0[c], 1 - sc.takeOut) * ((sc.roomAmbient[c] + (sc.ambient[c] - sc.roomAmbient[c]) * mk) * Math.pow(s0[c], sc.takeOut) + ea) + (split ? res[c] * origK : 0) + sa);
      if (split) v = Math.min(v, photo[c] * 6 + 0.02) + (v - Math.min(v, photo[c] * 6 + 0.02)) * m;
      o[c] = v;
    }
    const peak = Math.max(o[0], o[1], o[2], 1e-6), roll = tone(peak) / peak;
    out[i] = Math.round(linearToSrgb(o[0] * roll) * 255);
    out[i + 1] = Math.round(linearToSrgb(o[1] * roll) * 255);
    out[i + 2] = Math.round(linearToSrgb(o[2] * roll) * 255);
    out[i + 3] = base[i + 3];
  }
  return out;
}

type V3 = [number, number, number];
const sub3 = (a: readonly number[], b: readonly number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a: readonly number[]): number => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: readonly number[]): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a: readonly number[], b: readonly number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The camera (1.84.0): x right, y down, z away from it, in units of the subject's distance; `f` is the focal length as
 *  a fraction of the long side `s`. */
export interface Camera { w: number; h: number; s: number; f: number }
export const rayAt = (C: Camera, x: number, y: number): V3 => [(x - 0.5 * C.w) / (C.f * C.s), (y - 0.5 * C.h) / (C.f * C.s), 1];
export const toPx = (C: Camera, q: readonly number[]): [number, number] => { const z = Math.max(q[2], 1e-4); return [0.5 * C.w + q[0] / z * C.f * C.s, 0.5 * C.h + q[1] / z * C.f * C.s]; };
/** A round light of angular radius asin(sa): the terminator is the cosine smoothed over the source's size. */
export const sphereLambert = (x: number, sa: number): number => (x >= sa ? x : x <= -sa ? 0 : (x + sa) * (x + sa) / (4 * sa));
/** The light sits where its marker is, at the depth of the point it aims at, and Close to Far brings it out toward the
 *  camera by this much: close is beside the subject (side light, steep falloff), far well in front (frontal, sun-like). */
export const lightLift = (zAim: number, distance: number, sun = false): number => zAim * (sun ? 0.25 + 0.75 * distance : 0.03 + 0.97 * Math.pow(distance, 1.5));

interface Scene { C: Camera; g: Float32Array; m: Float32Array | null; thick: number; zr: [number, number]; steps: number; shadows: number; gain: number; roomLight: number; roomShadows: number; roomDepth: number }
/** A pixel's distance, the room's scaled by Room depth (the subject keeps its own). */
const sceneZ = (S: Scene, at: number): number => { const z = S.g[at * 4 + 3], m = S.m ? S.m[at] : -1; return m > -0.5 && m < 0.5 ? 1 + (z - 1) * S.roomDepth : z; };
const zPx = (S: Scene, x: number, y: number): number => sceneZ(S, clamp(Math.floor(y), 0, S.C.h - 1) * S.C.w + clamp(Math.floor(x), 0, S.C.w - 1));

/** Where the line from a point toward the light meets the plane at the pattern centre's depth, in pixels: straight on
 *  a flat background, bent over the subject. */
export function goboPx(C: Camera, P: readonly number[], L: readonly number[], dir: readonly number[], sun: boolean, zc: number): [number, number] {
  let X: number[];
  if (sun) { const dz = Math.abs(dir[2]) < 0.02 ? (dir[2] < 0 ? -0.02 : 0.02) : dir[2], t = (zc - P[2]) / dz; X = [P[0] + dir[0] * t, P[1] + dir[1] * t]; }
  else { let den = P[2] - L[2]; den = Math.abs(den) < 1e-3 ? (den < 0 ? -1e-3 : 1e-3) : den; const t = (zc - L[2]) / den; X = [L[0] + (P[0] - L[0]) * t, L[1] + (P[1] - L[1]) * t]; }
  return toPx(C, [X[0], X[1], zc]);
}

/** Soft shadow from eight points on the light, each ray marched through the depth map: a sample is hidden when it
 *  passes behind the visible surface within the surface's thickness (the subject about as deep as it is wide, the
 *  background solid). The penumbra widens with the light's size and the distance to what casts it. */
function visibility(S: Scene, P: readonly number[], Lc: readonly number[], toL: readonly number[], sun: boolean, rad: number): number {
  const ax = sun ? toL : norm3(sub3(Lc, P)), u = norm3(cross3(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross3(ax, u);
  let total = 0;
  for (let k = 0; k < 8; k++) {
    const a = 6.2831853 * (k + 0.5) / 8, rr = k % 2 === 0 ? 1 : 0.45, ox = (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * rr * rad, oy = (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * rr * rad, oz = (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * rr * rad;
    let d: V3, T: number;
    if (sun) { d = norm3([ax[0] + ox, ax[1] + oy, ax[2] + oz]); T = 2.5 * P[2]; }
    else { const q = [Lc[0] + ox, Lc[1] + oy, Lc[2] + oz]; d = norm3(sub3(q, P)); T = Math.min(len3(sub3(q, P)), 2.5 * P[2]); }
    let vis = 1;
    for (let j = 1; j <= S.steps; j++) {
      const f = j / S.steps, t = f * f * T + 0.006 * P[2], Q = [P[0] + d[0] * t, P[1] + d[1] * t, P[2] + d[2] * t];
      if (Q[2] < 0.05) break;
      const [qx, qy] = toPx(S.C, Q);
      if (qx < 0 || qy < 0 || qx >= S.C.w || qy >= S.C.h) break;
      const at = Math.floor(qy) * S.C.w + Math.floor(qx), zs = sceneZ(S, at), mm = S.m ? S.m[at] : -1, dz = Q[2] - zs;
      const th = mm > 0.5 || mm < -0.5 ? S.thick : 1e4;
      if (dz > 0 && dz < th) vis = Math.min(vis, 1 - smooth(0.004 * Q[2], 0.03 * Q[2], dz));
      if (vis <= 0) break;
    }
    total += vis;
  }
  return total / 8;
}

/** One surface layer lit by every light: E gathers light that multiplies the surface colour, Sp the glints on top. */
function shadeLayer(S: Scene, lights: readonly PackedLight[], P: readonly number[], nV: readonly number[], subj: number, tex: number, warm: number, room: number, E: number[], Sp: number[]): void {
  const roomGain = 1 + (S.roomLight - 1) * room, roomShadow = S.shadows * (1 + (S.roomShadows - 1) * room);
  const nW = norm3([nV[0], nV[1], -nV[2]]), V = norm3([-P[0], -P[1], -P[2]]);
  const near = clamp((S.zr[1] - P[2]) / Math.max(1e-4, S.zr[1] - S.zr[0]), 0, 1);
  for (const L of lights) {
    const win = depthWindow(near, L.range[0], L.range[1]);
    if (win <= 0) continue;
    const sun = L.type === 2, ring = L.type === 5, zA = zPx(S, L.aim[0], L.aim[1]), ra = rayAt(S.C, L.aim[0], L.aim[1]), PA: V3 = [ra[0] * zA, ra[1] * zA, zA];
    const rp = rayAt(S.C, L.pos[0], L.pos[1]), kz = ring ? zA * 0.12 : zA, Lp: V3 = [rp[0] * kz, rp[1] * kz, ring ? kz : kz - lightLift(zA, L.distance, sun)];
    const dA = Math.max(0.05, len3(sub3(Lp, PA)));
    let Lc: V3 = Lp, toL: V3, rad: number, sa: number, atten = 1;
    if (sun) { toL = norm3(sub3(Lp, PA)); rad = Math.tan((0.6 + 24 * L.softness) * Math.PI / 180); sa = Math.sin(Math.atan(rad)); }
    else {
      if (L.type === 4) { const tg = norm3(cross3(norm3(sub3(PA, Lp)), [0, 0, 1])), t = clamp(dot3(sub3(P, Lp), tg), -0.35 * dA, 0.35 * dA); Lc = [Lp[0] + tg[0] * t, Lp[1] + tg[1] * t, Lp[2] + tg[2] * t]; }
      const vv = sub3(Lc, P), dist = Math.max(1e-3, len3(vv));
      toL = [vv[0] / dist, vv[1] / dist, vv[2] / dist];
      rad = (0.03 + 0.35 * L.softness + (L.type === 3 ? 0.25 : 0) + (ring ? 0.3 : 0)) * dA;
      sa = Math.min(0.95, rad / dist);
      atten = Math.min(4, Math.pow((dA + rad) / (dist + rad), 1.6));
      if (L.type === 1) { const ax = norm3(sub3(PA, Lp)), cosA = -dot3(toL, ax); atten *= smooth(Math.cos((30 + 30 * L.softness) * Math.PI / 180), Math.cos((18 + 22 * L.softness) * Math.PI / 180), cosA); }
    }
    const ndl = dot3(nW, toL), wrap = L.diffusion * 0.6, lam = sphereLambert((ndl + wrap) / (1 + wrap), Math.max(sa, 0.02));
    const back = clamp(toL[2] + 0.5, 0, 1);
    const nl = Math.max(1e-3, Math.hypot(nW[0], nW[1])), ll = Math.max(1e-3, Math.hypot(toL[0], toL[1]));
    const rim = subj > 0 ? RIM * subj * back * clamp(1 - Math.abs(nV[2]), 0, 1) ** 2 * Math.max(0, (nW[0] * toL[0] + nW[1] * toL[1]) / (nl * ll)) * (0.6 + 0.8 * tex) : 0;
    const spill = sphereLambert((ndl + 0.45) / 1.45, 0.3);
    if (lam <= 0 && rim <= 0 && spill <= 0) continue;
    let shadow = 1;
    if (!ring && S.steps > 0) shadow = 1 - (1 - visibility(S, [P[0] + nW[0] * 0.004 * P[2], P[1] + nW[1] * 0.004 * P[2], P[2] + nW[2] * 0.004 * P[2]], Lc, toL, sun, rad)) * roomShadow;
    let pattern = 1, frame = 1;
    if (L.pattern !== 0) {
      const zc = zPx(S, L.center[0], L.center[1]), q = goboPx(S.C, P, Lc, toL, sun, zc), u = q[0] - L.center[0], v = q[1] - L.center[1];
      const spread = L.softness + (Math.abs(L.pattern) === 2 ? 0 : 0.8 * Math.max(0, P[2] - zc));
      pattern = patternAt(L.pattern, u, v, S.C.s, L.pat, L.pat2, spread);
      frame = patternAt(L.pattern, u, v, S.C.s, L.pat, L.pat2, spread, true);
    }
    const level = L.intensity * 3.2 * (sun ? 2.7 : 2.2) * atten * roomGain, amount = level * shadow * pattern, gw = win * S.gain;
    const dif = (amount * (lam + rim) * (1 - L.diffusion) + level * L.diffusion * 0.3 * frame * clamp(0.5 + 0.5 * ndl, 0, 1)) * gw;
    const sss = amount * (1 - L.diffusion) * SSS * Math.max(0, spill - lam) * warm * gw;
    E[0] += L.color[0] * (dif + sss); E[1] += L.color[1] * (dif + 0.35 * sss); E[2] += L.color[2] * dif;
    const H = norm3([toL[0] + V[0], toL[1] + V[1], toL[2] + V[2]]), gl = 8 + 120 * (1 - L.softness) ** 2;
    const sp = Math.pow(Math.max(0, dot3(nW, H)), gl) * (gl + 8) / 25.13 * Math.max(0, ndl) * 0.04 * (0.4 + 1.6 * tex) * amount * gw;
    for (let c = 0; c < 3; c++) Sp[c] += L.color[c] * sp;
  }
}

function tone(v: number): number { return v <= 0.8 ? Math.max(0, v) : 0.8 + 0.2 * (1 - Math.exp(-(v - 0.8) / 0.2)); }

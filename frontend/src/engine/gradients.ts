import type { RGB } from './types';

/** Gradients: five types (Linear, Radial, Angle, Reflected, Diamond) and presets of colour
 *  stops, where a stop's colour may be the current foreground or background. Canvas draws the first four through its
 *  own gradients (Angle as a conic gradient, Reflected as a linear one mirrored about the start); Diamond has no
 *  canvas form and is computed here per pixel. */

export type GradientType = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';
export const GRADIENT_TYPES: ReadonlyArray<{ id: GradientType; label: string }> = [
  { id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }, { id: 'angle', label: 'Angle' }, { id: 'reflected', label: 'Reflected' }, { id: 'diamond', label: 'Diamond' },
];

/** `mid` is the midpoint between this stop and the next, as a fraction of the gap (0.05 to 0.95, default 0.5). */
export interface GradientStop { at: number; color: RGB | 'fg' | 'bg'; alpha: number; mid?: number }
/** Separate opacity stops (with their own midpoints), as .grd files carry them. When a preset has them, `stops` are its colour stops
 *  (their `alpha` kept only as the opacity at that spot, for readers that know nothing of opacity stops). */
export interface OpacityStop { at: number; alpha: number; mid?: number }
export interface GradientPreset { id: string; label: string; stops: GradientStop[]; opacityStops?: OpacityStop[] }

export const clampMid = (m: number | undefined): number => (typeof m === 'number' && Number.isFinite(m) ? Math.min(0.95, Math.max(0.05, m)) : 0.5);
/** The midpoint curve: t' = t ^ (log 0.5 / log m), so t' is 0.5 at t = m. */
export const midCurve = (t: number, m: number | undefined): number => { const k = clampMid(m); return k === 0.5 ? t : Math.pow(t, Math.log(0.5) / Math.log(k)); };

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });
export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: 'background', label: 'Foreground to Background', stops: [{ at: 0, color: 'fg', alpha: 1 }, { at: 1, color: 'bg', alpha: 1 }] },
  { id: 'transparent', label: 'Foreground to Transparent', stops: [{ at: 0, color: 'fg', alpha: 1 }, { at: 1, color: 'fg', alpha: 0 }] },
  { id: 'black-white', label: 'Black, White', stops: [{ at: 0, color: rgb(0, 0, 0), alpha: 1 }, { at: 1, color: rgb(255, 255, 255), alpha: 1 }] },
  { id: 'spectrum', label: 'Spectrum', stops: [[255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255], [255, 0, 0]].map(([r, g, b], i) => ({ at: i / 6, color: rgb(r, g, b), alpha: 1 })) },
  { id: 'copper', label: 'Copper', stops: [{ at: 0, color: rgb(151, 70, 26), alpha: 1 }, { at: 0.5, color: rgb(251, 216, 197), alpha: 1 }, { at: 1, color: rgb(108, 46, 22), alpha: 1 }] },
  { id: 'chrome', label: 'Chrome', stops: [{ at: 0, color: rgb(41, 137, 204), alpha: 1 }, { at: 0.5, color: rgb(255, 255, 255), alpha: 1 }, { at: 0.52, color: rgb(144, 106, 0), alpha: 1 }, { at: 0.64, color: rgb(217, 159, 0), alpha: 1 }, { at: 1, color: rgb(255, 255, 255), alpha: 1 }] },
  { id: 'fg-bg-fg', label: 'Foreground, Background, Foreground', stops: [{ at: 0, color: 'fg', alpha: 1 }, { at: 0.5, color: 'bg', alpha: 1 }, { at: 1, color: 'fg', alpha: 1 }] },
];

export const presetById = (id: string): GradientPreset => customGradients.find((p) => p.id === id) ?? GRADIENT_PRESETS.find((p) => p.id === id) ?? GRADIENT_PRESETS[0];

/** Gradients made in the Gradient Editor, kept by the app in browser storage and listed after the built-ins. */
export let customGradients: GradientPreset[] = [];
export function setCustomGradients(list: GradientPreset[]): void { customGradients = list; }
export const allGradients = (): GradientPreset[] => [...GRADIENT_PRESETS, ...customGradients];

/** Stored gradients read back defensively: well-formed entries, at least two stops, values clamped. */
export function gradientsFromJson(raw: unknown): GradientPreset[] {
  if (!Array.isArray(raw)) return [];
  const n = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return raw.flatMap((r) => {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    if (!o || typeof o.id !== 'string' || typeof o.label !== 'string' || !o.label.trim() || !Array.isArray(o.stops)) return [];
    const stops = (o.stops as unknown[]).flatMap((s) => {
      const q = s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
      if (!q) return [];
      const c = q.color, color: GradientStop['color'] | null = c === 'fg' || c === 'bg' ? c : c && typeof c === 'object' ? { r: n((c as RGB).r, 0, 255, 0), g: n((c as RGB).g, 0, 255, 0), b: n((c as RGB).b, 0, 255, 0) } : null;
      return color ? [{ at: n(q.at, 0, 1, 0), color, alpha: n(q.alpha, 0, 1, 1), ...(typeof q.mid === 'number' ? { mid: n(q.mid, 0.05, 0.95, 0.5) } : {}) } as GradientStop] : [];
    });
    const ops = Array.isArray(o.opacityStops) ? (o.opacityStops as unknown[]).flatMap((s) => {
      const q = s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
      return q ? [{ at: n(q.at, 0, 1, 0), alpha: n(q.alpha, 0, 1, 1), ...(typeof q.mid === 'number' ? { mid: n(q.mid, 0.05, 0.95, 0.5) } : {}) } as OpacityStop] : [];
    }) : [];
    return stops.length >= 2 ? [{ id: o.id, label: o.label.trim().slice(0, 60), stops, ...(ops.length ? { opacityStops: ops } : {}) }] : [];
  });
}

/** The Noise gradient: colours that wander at random between stops, more wildly with roughness (0 to 100),
 *  the same for the same seed. Returned as ordinary stops so it draws, saves and reverses like any gradient. */
export function noiseStops(seed: number, roughness: number): GradientStop[] {
  let s = (seed >>> 0) || 1;
  const rand = (): number => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const rough = Math.min(100, Math.max(0, roughness)) / 100, count = 4 + Math.round(rough * 28);
  const c = [rand() * 255, rand() * 255, rand() * 255], out: GradientStop[] = [];
  for (let i = 0; i < count; i++) {
    if (i) for (let k = 0; k < 3; k++) c[k] = Math.min(255, Math.max(0, c[k] + (rand() - 0.5) * 2 * (40 + 215 * rough)));
    out.push({ at: i / (count - 1), color: { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) }, alpha: 1 });
  }
  return out;
}

/** A preset as the dense combined stop list every renderer takes: colour stops, opacity stops and midpoints folded
 *  together. A preset with no opacity stops and no midpoints maps straight across; otherwise every stop location of
 *  either kind becomes a point, and a gap whose midpoint is off centre gets extra points along the curve. */
export function sampleStops(preset: GradientPreset, fg: RGB, bg: RGB): Array<{ at: number; rgb: RGB; alpha: number }> {
  const c01 = (v: number): number => Math.min(1, Math.max(0, v));
  const cols = preset.stops.map((s) => ({ at: c01(s.at), rgb: s.color === 'fg' ? fg : s.color === 'bg' ? bg : s.color, alpha: s.alpha, mid: s.mid })).sort((a, b) => a.at - b.at);
  const hasOps = !!preset.opacityStops?.length;
  const ops = (hasOps ? preset.opacityStops ?? [] : preset.stops).map((s) => ({ at: c01(s.at), alpha: s.alpha, mid: s.mid })).sort((a, b) => a.at - b.at);
  const bent = (l: Array<{ mid?: number }>): boolean => l.some((s) => clampMid(s.mid) !== 0.5);
  if (!hasOps && !bent(cols)) return cols.map(({ at, rgb, alpha }) => ({ at, rgb, alpha }));
  const along = <T extends { at: number; mid?: number }>(l: T[], t: number): { a: T; b: T; f: number } => {
    let i = 0;
    while (i < l.length - 1 && l[i + 1].at <= t) i++;
    const a = l[i], b = l[Math.min(l.length - 1, i + 1)];
    return { a, b, f: a === b || b.at <= a.at ? 0 : Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at))) };
  };
  const at = (t: number): { at: number; rgb: RGB; alpha: number } => {
    const c = along(cols, t), o = along(ops, t), fc = midCurve(c.f, c.a.mid), fo = midCurve(o.f, o.a.mid);
    const lerp = (x: number, y: number, f: number): number => x + (y - x) * f;
    return { at: t, rgb: { r: lerp(c.a.rgb.r, c.b.rgb.r, fc), g: lerp(c.a.rgb.g, c.b.rgb.g, fc), b: lerp(c.a.rgb.b, c.b.rgb.b, fc) }, alpha: lerp(o.a.alpha, o.b.alpha, fo) };
  };
  const marks = [...new Set([...cols.map((s) => s.at), ...ops.map((s) => s.at)])].sort((a, b) => a - b);
  const out: Array<{ at: number; rgb: RGB; alpha: number }> = [];
  marks.forEach((m, i) => {
    out.push(at(m));
    const next = marks[i + 1];
    if (next === undefined || next <= m) return;
    const mid = (m + next) / 2, c = along(cols, mid), o = along(ops, mid);
    if (clampMid(c.a.mid) === 0.5 && clampMid(o.a.mid) === 0.5) return;
    for (let k = 1; k < 12; k++) out.push(at(m + ((next - m) * k) / 12));
  });
  return out;
}

/** A preset's stops with the foreground and background filled in, sorted, and reversed when asked. */
export function resolveStops(preset: GradientPreset, fg: RGB, bg: RGB, reversed: boolean): Array<{ at: number; rgb: RGB; alpha: number }> {
  const out = sampleStops(preset, fg, bg);
  const r = reversed ? out.map((s) => ({ ...s, at: 1 - s.at })) : out;
  return r.sort((a, b) => a.at - b.at);
}

/** Stops for Reflected: the gradient runs out from the start both ways, so the stops mirror about the middle of a
 *  line twice as long. */
export function reflectStops<T extends { at: number }>(stops: T[]): T[] {
  return [...stops.map((s) => ({ ...s, at: 0.5 - s.at / 2 })).reverse(), ...stops.map((s) => ({ ...s, at: 0.5 + s.at / 2 }))];
}

/** The colour at `t` (0 to 1) along resolved stops, straight RGBA. */
export function colorAt(stops: Array<{ at: number; rgb: RGB; alpha: number }>, t: number): [number, number, number, number] {
  if (!stops.length) return [0, 0, 0, 0];
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < stops.length - 1 && stops[i + 1].at < x) i++;
  const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)];
  if (x <= a.at || a === b) return [a.rgb.r, a.rgb.g, a.rgb.b, a.alpha * 255];
  if (x >= b.at) return [b.rgb.r, b.rgb.g, b.rgb.b, b.alpha * 255];
  const f = (x - a.at) / (b.at - a.at);
  return [a.rgb.r + (b.rgb.r - a.rgb.r) * f, a.rgb.g + (b.rgb.g - a.rgb.g) * f, a.rgb.b + (b.rgb.b - a.rgb.b) * f, (a.alpha + (b.alpha - a.alpha) * f) * 255];
}

/** Diamond: the distance from the start measured along and across the drag direction, added (an L1 norm in the
 *  rotated frame), over the drag length. `docAt(x, y)` maps a target pixel centre to document space. */
export function diamondFill(out: ImageData, docAt: (x: number, y: number) => { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, stops: Array<{ at: number; rgb: RGB; alpha: number }>): void {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.max(0.5, Math.hypot(dx, dy)), ux = dx / len, uy = dy / len, d = out.data;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const p = docAt(x + 0.5, y + 0.5), px = p.x - a.x, py = p.y - a.y;
    const c = colorAt(stops, (Math.abs(px * ux + py * uy) + Math.abs(-px * uy + py * ux)) / len), i = (y * out.width + x) * 4;
    d[i] = Math.round(c[0]); d[i + 1] = Math.round(c[1]); d[i + 2] = Math.round(c[2]); d[i + 3] = Math.round(c[3]);
  }
}

import type { RGB } from './types';

/** Gradients as Photoshop has them: five types (Linear, Radial, Angle, Reflected, Diamond) and presets of colour
 *  stops, where a stop's colour may be the current foreground or background. Canvas draws the first four through its
 *  own gradients (Angle as a conic gradient, Reflected as a linear one mirrored about the start); Diamond has no
 *  canvas form and is computed here per pixel. */

export type GradientType = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';
export const GRADIENT_TYPES: ReadonlyArray<{ id: GradientType; label: string }> = [
  { id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }, { id: 'angle', label: 'Angle' }, { id: 'reflected', label: 'Reflected' }, { id: 'diamond', label: 'Diamond' },
];

export interface GradientStop { at: number; color: RGB | 'fg' | 'bg'; alpha: number }
export interface GradientPreset { id: string; label: string; stops: GradientStop[] }

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

export const presetById = (id: string): GradientPreset => GRADIENT_PRESETS.find((p) => p.id === id) ?? GRADIENT_PRESETS[0];

/** A preset's stops with the foreground and background filled in, sorted, and reversed when asked. */
export function resolveStops(preset: GradientPreset, fg: RGB, bg: RGB, reversed: boolean): Array<{ at: number; rgb: RGB; alpha: number }> {
  const out = preset.stops.map((s) => ({ at: Math.min(1, Math.max(0, s.at)), rgb: s.color === 'fg' ? fg : s.color === 'bg' ? bg : s.color, alpha: s.alpha }));
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

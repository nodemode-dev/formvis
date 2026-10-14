import type { Doc, RGB } from './types';

/** Duotone (DEV_PLAN 31.3 part a): a grayscale document with 1 to 4 inks overprinted on white. */
export type Duotone = NonNullable<Doc['duotone']>;
export type DuotoneInk = Duotone['inks'][number];

/** The 13 input stops of an ink curve, in percent. */
export const DUOTONE_STOPS: readonly number[] = [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
export const DUOTONE_COUNT = { mono: 1, duo: 2, tri: 3, quad: 4 } as const;
export const DUOTONE_TYPES = ['mono', 'duo', 'tri', 'quad'] as const;

/** The straight line: output equals input at every stop. */
export const straightCurve = (): number[] => DUOTONE_STOPS.slice() as number[];

/** A curve's output percent at an input percent, linear between stops. */
export function curveAt(curve: readonly number[], percent: number): number {
  const x = Math.max(0, Math.min(100, percent));
  let i = 1;
  while (i < DUOTONE_STOPS.length - 1 && x > DUOTONE_STOPS[i]) i++;
  const x0 = DUOTONE_STOPS[i - 1], x1 = DUOTONE_STOPS[i], y0 = curve[i - 1] ?? x0, y1 = curve[i] ?? x1;
  return Math.max(0, Math.min(100, y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)));
}

export function defaultDuotone(type: Duotone['type'] = 'duo'): Duotone {
  const colors: RGB[] = [{ r: 0, g: 0, b: 0 }, { r: 200, g: 120, b: 40 }, { r: 40, g: 120, b: 200 }, { r: 120, g: 120, b: 120 }];
  return { type, inks: colors.map((color, i) => ({ name: i === 0 ? 'Black' : `Ink ${i + 1}`, color, curve: straightCurve() })) };
}

/** 256 RGB triples (768 bytes) indexed by grey: density d = curve(1 - grey), colour the product of (1 - d * (1 - ink)). */
export function duotoneLut(d: Duotone): Uint8Array {
  const n = DUOTONE_COUNT[d.type], lut = new Uint8Array(768);
  for (let g = 0; g < 256; g++) {
    const rgb = [1, 1, 1];
    for (let k = 0; k < n; k++) {
      const ink = d.inks[k];
      if (!ink) continue;
      const dens = curveAt(ink.curve, (1 - g / 255) * 100) / 100;
      rgb[0] *= 1 - dens * (1 - ink.color.r / 255);
      rgb[1] *= 1 - dens * (1 - ink.color.g / 255);
      rgb[2] *= 1 - dens * (1 - ink.color.b / 255);
    }
    lut[g * 3] = Math.round(rgb[0] * 255); lut[g * 3 + 1] = Math.round(rgb[1] * 255); lut[g * 3 + 2] = Math.round(rgb[2] * 255);
  }
  return lut;
}

/** Maps RGBA pixels (grey in the red channel) through the table in place; alpha stays. */
export function applyDuotoneLut(px: Uint8ClampedArray, lut: Uint8Array): void {
  for (let i = 0; i < px.length; i += 4) { const g = px[i] * 3; px[i] = lut[g]; px[i + 1] = lut[g + 1]; px[i + 2] = lut[g + 2]; }
}

/** Reads a saved duotone, or null when it is not one. */
export function readDuotone(v: unknown): Duotone | null {
  const o = v as { type?: unknown; inks?: unknown } | null;
  if (!o || !(DUOTONE_TYPES as readonly unknown[]).includes(o.type) || !Array.isArray(o.inks)) return null;
  const base = defaultDuotone(o.type as Duotone['type']);
  const inks = base.inks.map((b, i) => {
    const s = (o.inks as Record<string, unknown>[])[i];
    if (!s) return b;
    const c = s.color as Record<string, number> | undefined, cv = Array.isArray(s.curve) && s.curve.length === 13 && s.curve.every((x) => Number.isFinite(x)) ? (s.curve as number[]).map((x) => Math.max(0, Math.min(100, x))) : b.curve;
    return { name: typeof s.name === 'string' ? s.name : b.name, color: c && [c.r, c.g, c.b].every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? { r: c.r, g: c.g, b: c.b } : b.color, curve: cv };
  });
  return { type: o.type as Duotone['type'], inks };
}

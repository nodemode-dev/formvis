import type { LayerEffects } from './types';

/** Layer style depth, written for formvis after Photoshop's Layer Style dialog. A contour reshapes how an effect's
 *  strength falls off across its width: the effect's coverage (0 to 1) is passed through the curve, so Linear leaves it
 *  alone, Cone makes a ring, Ring Double two rings, and so on. Global Light is the document's one light: effects
 *  marked Use Global Light take its angle (and Bevel its altitude) instead of their own, so they all move together. */

export type ContourId = 'linear' | 'cone' | 'coneInverted' | 'gaussian' | 'halfRound' | 'ring' | 'ringDouble' | 'rollingSlope' | 'roundedSteps' | 'sawtooth' | 'coveDeep';

const frac = (x: number): number => x - Math.floor(x);
const smooth = (t: number): number => t * t * (3 - 2 * t);

export const CONTOURS: ReadonlyArray<{ id: ContourId; label: string; f: (t: number) => number }> = [
  { id: 'linear', label: 'Linear', f: (t) => t },
  { id: 'cone', label: 'Cone', f: (t) => 1 - Math.abs(2 * t - 1) },
  { id: 'coneInverted', label: 'Cone - Inverted', f: (t) => Math.abs(2 * t - 1) },
  { id: 'coveDeep', label: 'Cove - Deep', f: (t) => t * t * t },
  { id: 'gaussian', label: 'Gaussian', f: smooth },
  { id: 'halfRound', label: 'Half Round', f: (t) => Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))) },
  { id: 'ring', label: 'Ring', f: (t) => Math.sin(Math.PI * t) ** 2 },
  { id: 'ringDouble', label: 'Ring - Double', f: (t) => Math.sin(2 * Math.PI * t) ** 2 },
  { id: 'rollingSlope', label: 'Rolling Slope - Descending', f: (t) => Math.min(1, Math.max(0, t + 0.12 * Math.sin(2 * Math.PI * t))) },
  { id: 'roundedSteps', label: 'Rounded Steps', f: (t) => Math.min(1, (Math.floor(t * 4) + smooth(frac(t * 4))) / 4) },
  { id: 'sawtooth', label: 'Sawtooth 1', f: (t) => (t >= 1 ? 1 : frac(t * 2)) },
];

const luts = new Map<ContourId, Uint8Array>();

/** A 256-entry table taking coverage 0 to 255 through the contour; null for Linear or an unknown id. */
export function contourLut(id: ContourId | undefined | null): Uint8Array | null {
  if (!id || id === 'linear') return null;
  const c = CONTOURS.find((x) => x.id === id);
  if (!c) return null;
  let t = luts.get(id);
  if (!t) {
    t = new Uint8Array(256);
    for (let i = 0; i < 256; i++) t[i] = Math.round(Math.min(1, Math.max(0, c.f(i / 255))) * 255);
    luts.set(id, t);
  }
  return t;
}

/** Applies a contour to the alpha of RGBA pixels in place. */
export function applyContour(data: Uint8ClampedArray, id: ContourId | undefined | null): void {
  const lut = contourLut(id);
  if (!lut) return;
  for (let i = 3; i < data.length; i += 4) data[i] = lut[data[i]];
}

export const isContour = (v: unknown): v is ContourId => typeof v === 'string' && CONTOURS.some((c) => c.id === v);

export interface GlobalLight { angle: number; altitude: number }
export const DEFAULT_GLOBAL_LIGHT: GlobalLight = { angle: 120, altitude: 30 };

/** The effects with the document's light put into every effect that uses it; the original is left as it was. */
export function withGlobalLight(fx: LayerEffects, light: GlobalLight | null | undefined): LayerEffects {
  const g = light ?? DEFAULT_GLOBAL_LIGHT, ex = fx.extra;
  const uses = fx.dropShadow.useGlobal || fx.innerShadow.useGlobal || fx.bevel.useGlobal || !!ex?.dropShadow?.some((e) => e.useGlobal) || !!ex?.innerShadow?.some((e) => e.useGlobal);
  if (!uses) return fx;
  const lit = <T extends { useGlobal?: boolean; angle: number }>(e: T): T => (e.useGlobal ? { ...e, angle: g.angle } : e);
  return {
    ...fx,
    dropShadow: lit(fx.dropShadow),
    innerShadow: lit(fx.innerShadow),
    bevel: fx.bevel.useGlobal ? { ...fx.bevel, angle: g.angle, altitude: g.altitude } : fx.bevel,
    ...(ex ? { extra: { ...ex, ...(ex.dropShadow ? { dropShadow: ex.dropShadow.map(lit) } : {}), ...(ex.innerShadow ? { innerShadow: ex.innerShadow.map(lit) } : {}) } } : {}),
  };
}

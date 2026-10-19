import type { SampledTip } from './abr';

/** Brush dynamics and presets, ported from NodeMode's formvis studio (`studio/paint/dynamics.ts` and `preset.ts`,
 *  nodemode_dev v8.73.1, the owner's build, MIT). A brush parameter is modulated by sensors, each mapped through a
 *  sampled response curve, combined, then scaled into the option's range by its strength; a disabled option is 1.
 *  formvis's strokes carry pen pressure and count their dabs, so pressure and fade (Fade: full at the first
 *  dab, the option's minimum after `steps` dabs) are the sensors wired here; the others in the source (speed,
 *  distance, time, fuzzy) keep their place in the model for later. Presets are data, as there, trimmed to what
 *  formvis's brush has: size, hardness, opacity, and pressure driving size, flow and opacity. */

export type SensorId = 'pressure' | 'fade';
export interface SensorSpec { id: SensorId; curve?: number[]; reversed?: boolean; steps?: number }
export type CombineMode = 'mul' | 'add' | 'max' | 'min' | 'diff';
export interface CurveOptionSpec { enabled: boolean; strength: number; min: number; max: number; sensors: SensorSpec[]; combine: CombineMode }
export interface PaintInfo { pressure: number; fade?: number }

export const identityOption = (): CurveOptionSpec => ({ enabled: false, strength: 1, min: 0, max: 1, sensors: [], combine: 'mul' });
export const pressureOption = (min: number, max = 1, curve?: number[]): CurveOptionSpec => ({ enabled: true, strength: 1, min, max, combine: 'mul', sensors: [{ id: 'pressure', curve }] });
export const fadeOption = (steps: number, min = 0, max = 1): CurveOptionSpec => ({ enabled: true, strength: 1, min, max, combine: 'mul', sensors: [{ id: 'fade', steps }] });

function evalCurve(curve: number[] | undefined, x: number): number {
  const v = Math.min(1, Math.max(0, x));
  if (!curve || curve.length < 2) return v;
  const t = v * (curve.length - 1), i = Math.min(curve.length - 2, Math.floor(t)), f = t - i;
  return Math.min(1, Math.max(0, curve[i] * (1 - f) + curve[i + 1] * f));
}

/** An option's multiplier for the current paint info; neutral (disabled or no sensors) is 1. */
export function computeOption(opt: CurveOptionSpec | null | undefined, info: PaintInfo): number {
  if (!opt || !opt.enabled || opt.sensors.length === 0) return 1;
  let combined: number | null = null;
  for (const s of opt.sensors) {
    const raw = info[s.id] ?? 0;
    let v = evalCurve(s.curve, s.id === 'fade' ? 1 - Math.min(1, Math.max(0, raw) / Math.max(1, s.steps ?? 25)) : raw);
    if (s.reversed) v = 1 - v;
    if (combined === null) { combined = v; continue; }
    switch (opt.combine) {
      case 'mul': combined *= v; break;
      case 'add': combined = Math.min(1, combined + v); break;
      case 'max': combined = Math.max(combined, v); break;
      case 'min': combined = Math.min(combined, v); break;
      case 'diff': combined = Math.abs(combined - v); break;
    }
  }
  const c = Math.min(1, Math.max(0, combined ?? 1)), mapped = opt.min + (opt.max - opt.min) * c;
  return (1 - opt.strength) + mapped * opt.strength;
}

export interface BrushDynamics { size: CurveOptionSpec; flow: CurveOptionSpec; opacity: CurveOptionSpec }
export const noDynamics = (): BrushDynamics => ({ size: identityOption(), flow: identityOption(), opacity: identityOption() });

/** The pen's pose with a sample: tilt in degrees each way from upright (-90 to 90) and barrel rotation (twist, 0 to
 *  359), as pointer events report them; a mouse is upright with no twist. */
export interface PenPose { tiltX: number; tiltY: number; twist: number }
export const UPRIGHT: PenPose = { tiltX: 0, tiltY: 0, twist: 0 };

/** Painting symmetry: each dab is repeated about an axis through (cx, cy). 'vertical' mirrors left to right,
 *  'horizontal' top to bottom, 'both' makes four, 'radial' turns the dab `count` times about the centre. */
export type SymmetryMode = 'off' | 'vertical' | 'horizontal' | 'both' | 'radial';
export interface BrushSymmetry { mode: SymmetryMode; count: number; cx: number; cy: number }
export const noSymmetry = (): BrushSymmetry => ({ mode: 'off', count: 6, cx: 0, cy: 0 });

/** The extra dab centres for a dab at p; empty when the symmetry is off. */
export function symmetryPoints(p: { x: number; y: number }, s: BrushSymmetry | null | undefined): { x: number; y: number }[] {
  if (!s || s.mode === 'off') return [];
  const mx = 2 * s.cx - p.x, my = 2 * s.cy - p.y;
  if (s.mode === 'vertical') return [{ x: mx, y: p.y }];
  if (s.mode === 'horizontal') return [{ x: p.x, y: my }];
  if (s.mode === 'both') return [{ x: mx, y: p.y }, { x: p.x, y: my }, { x: mx, y: my }];
  const n = Math.max(2, Math.min(32, Math.round(s.count))), out: { x: number; y: number }[] = [], dx = p.x - s.cx, dy = p.y - s.cy;
  for (let i = 1; i < n; i++) { const a = (i * 2 * Math.PI) / n, c = Math.cos(a), sn = Math.sin(a); out.push({ x: s.cx + dx * c - dy * sn, y: s.cy + dx * sn + dy * c }); }
  return out;
}

/** Brush Settings beyond size, hardness and pressure (the comparison's "Brush and eraser" row): Brush Tip
 *  Shape's angle, roundness and spacing; Shape Dynamics' jitters and their controls (the stroke's direction, the pen's
 *  tilt or its rotation); Scattering; Texture (a pattern cutting into each dab's paint); and Dual Brush (a second round
 *  tip, the main stroke's paint kept only where its marks fall). Percentages are 0 to 100; angles in degrees. */
export interface BrushShape {
  angle: number; roundness: number; spacing: number | null;
  sizeJitter: number; angleJitter: number; roundnessJitter: number; minRoundness: number;
  angleControl: 'off' | 'direction' | 'tilt' | 'rotation'; roundnessControl: 'off' | 'tilt';
  scatter: number; bothAxes: boolean; count: number; countJitter: number;
  texture: { on: boolean; pattern: string; scale: number; depth: number };
  /** The dual brush's marks are laid with the main dabs, scattered by its own Scatter and Count (no separate spacing). */
  dual: { on: boolean; diameter: number; scatter: number; count: number };
  /** Color Dynamics (1.50.1, the owner's list): each dab's colour from the foreground towards the
   *  background, and its hue, saturation and brightness varied (jitters, 0-100). */
  color: { on: boolean; fgBg: number; hue: number; saturation: number; brightness: number };
  /** Transfer: each dab's opacity and flow varied (jitters, 0-100), or following pen pressure. */
  transfer: { on: boolean; opacity: number; flow: number; control: 'off' | 'pressure' };
  /** Noise roughens the tip's soft edge; Wet Edges makes its centre lighter than its rim (watercolour). */
  noise: boolean; wetEdges: boolean;
}
export const defaultShape = (): BrushShape => ({
  angle: 0, roundness: 100, spacing: null, sizeJitter: 0, angleJitter: 0, roundnessJitter: 0, minRoundness: 25,
  angleControl: 'off', roundnessControl: 'off', scatter: 0, bothAxes: false, count: 1, countJitter: 0,
  texture: { on: false, pattern: '', scale: 100, depth: 100 }, dual: { on: false, diameter: 20, scatter: 0, count: 1 },
  color: { on: false, fgBg: 0, hue: 0, saturation: 0, brightness: 0 }, transfer: { on: false, opacity: 0, flow: 0, control: 'off' }, noise: false, wetEdges: false,
});
/** Whether a shape does anything the plain round brush does not; an inactive one leaves strokes exactly as before. */
export function shapeActive(s: BrushShape | null | undefined): boolean {
  if (!s) return false;
  const d = defaultShape();
  return s.angle !== d.angle || s.roundness !== d.roundness || s.spacing !== null || s.sizeJitter > 0 || s.angleJitter > 0 || s.roundnessJitter > 0
    || s.angleControl !== 'off' || s.roundnessControl !== 'off' || s.scatter > 0 || s.count > 1 || s.countJitter > 0 || s.texture.on || s.dual.on;
}

/** A preset's tip shape (angle in degrees, roundness in percent) is optional: absent is a round tip (0, 100). `spacing`
 *  (percent of the diameter) is set when an imported tip carries one other than the 25 a tip paints at by default. */
export interface BrushPreset { id: string; name: string; description: string; diameter: number; hardness: number; opacity: number; dynamics: BrushDynamics; tip?: SampledTip; angle?: number; roundness?: number; spacing?: number }

/** Presets made from imported .abr files, kept by the app and listed after the built-ins. */
export let importedBrushPresets: BrushPreset[] = [];
export function setImportedBrushPresets(list: BrushPreset[]): void { importedBrushPresets = list; }
export const allBrushPresets = (): BrushPreset[] => [...BUILTIN_BRUSH_PRESETS, ...importedBrushPresets];

/** A preset for an imported sampled tip: its size, full opacity, pressure on size as Hard round has it. */
export function presetFromTip(id: string, name: string, tip: SampledTip, spacing?: number): BrushPreset {
  const set: { spacing?: number } = spacing !== undefined && Number.isFinite(spacing) && Math.round(spacing) !== 25 ? { spacing: Math.min(1000, Math.max(1, Math.round(spacing))) } : {};
  return { id, name, description: `Imported sampled tip, ${tip.w} x ${tip.h} px${set.spacing ? `, spacing ${set.spacing}%` : ''}.`, diameter: Math.min(1000, Math.max(tip.w, tip.h)), hardness: 1, opacity: 1, dynamics: { size: pressureOption(0.15), flow: identityOption(), opacity: identityOption() }, tip, ...set };
}

/** NodeMode's built-in painting presets, as formvis's brush can hold them (Ink's speed sensor, Pencil's tilted tip and
 *  scatter, Marker's chisel and Blender's smudge have no counterpart here yet and are left out of those presets). */
export const BUILTIN_BRUSH_PRESETS: BrushPreset[] = [
  { id: 'hard-round', name: 'Hard round', description: 'Crisp opaque round brush; pressure drives size.', diameter: 28, hardness: 0.95, opacity: 1, dynamics: { size: pressureOption(0.15), flow: identityOption(), opacity: identityOption() } },
  { id: 'soft-air', name: 'Soft airbrush', description: 'Soft buildup; pressure drives flow more than size.', diameter: 64, hardness: 0.05, opacity: 1, dynamics: { size: pressureOption(0.6), flow: pressureOption(0.15), opacity: identityOption() } },
  { id: 'ink', name: 'Ink', description: 'Firm liner; light pressure thins the line to a quarter.', diameter: 16, hardness: 0.9, opacity: 1, dynamics: { size: pressureOption(0.25), flow: identityOption(), opacity: identityOption() } },
  { id: 'pencil', name: 'Pencil', description: 'Small, slightly soft, translucent; pressure drives size and flow.', diameter: 10, hardness: 0.55, opacity: 0.85, dynamics: { size: pressureOption(0.4), flow: pressureOption(0.4), opacity: identityOption() } },
  { id: 'marker', name: 'Marker', description: 'Wide translucent strokes that do not build up within one stroke.', diameter: 36, hardness: 0.85, opacity: 0.55, dynamics: noDynamics() },
  { id: 'flat-angled', name: 'Flat angled', description: 'A calligraphic flat tip held at an angle: thick one way, thin the other.', diameter: 36, hardness: 0.9, opacity: 1, dynamics: { size: pressureOption(0.3), flow: identityOption(), opacity: identityOption() }, angle: -35, roundness: 14 },
];

/** Reads a stored preset list, keeping only well-formed entries with values clamped to the brush's ranges. */
export function presetsFromJson(raw: unknown): BrushPreset[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const opt = (v: unknown): CurveOptionSpec => {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    return o.enabled === true ? pressureOption(num(o.min, 0, 1, 0.2), num(o.max, 0, 1, 1)) : identityOption();
  };
  return raw.flatMap((r) => {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    if (!o || typeof o.id !== 'string' || typeof o.name !== 'string' || !o.name.trim()) return [];
    const d = o.dynamics && typeof o.dynamics === 'object' ? (o.dynamics as Record<string, unknown>) : {};
    return [{ id: o.id, name: o.name.slice(0, 60), description: typeof o.description === 'string' ? o.description.slice(0, 200) : '', diameter: num(o.diameter, 1, 5000, 40), hardness: num(o.hardness, 0, 1, 1), opacity: num(o.opacity, 0.01, 1, 1), dynamics: { size: opt(d.size), flow: opt(d.flow), opacity: opt(d.opacity) } }];
  });
}

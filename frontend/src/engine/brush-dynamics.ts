import type { SampledTip } from './abr';
import { proceduralTip, type ProceduralKind } from './procedural-tips';

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
export interface PenPose { tiltX: number; tiltY: number; twist: number; /** The stylus wheel (a pen's tangential pressure) from 0 to 1; a pen without one reports 0.5, a mouse has none. */ wheel?: number }
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
  angleControl: 'off' | 'direction' | 'initial' | 'tilt' | 'rotation' | 'fade' | 'wheel'; roundnessControl: 'off' | 'tilt' | 'rotation' | 'fade' | 'wheel';
  /** What shrinks the dab: the pen's pressure, the fade over the first dabs, the pen's tilt (scaled by `tiltScale`, percent)
   *  or its barrel rotation. `minDiameter` (percent of the size) is the least any jitter or control may leave. */
  sizeControl?: 'off' | 'pressure' | 'fade' | 'tilt' | 'rotation' | 'wheel'; minDiameter?: number; tiltScale?: number;
  /** Each dab mirrored at random across its own axes; Brush Projection turns and flattens the tip with the pen's tilt. */
  flipXJitter?: boolean; flipYJitter?: boolean; projection?: boolean;
  /** The tip mirrored across its own axes, before the angle turns it; it shows on a tip that is not symmetric. */
  flipX?: boolean; flipY?: boolean;
  scatter: number; bothAxes: boolean; count: number; countJitter: number;
  /** What shrinks the scatter spread: the pen's pressure (harder, tighter) or the fade over the stroke's first dabs. */
  scatterControl?: 'off' | 'pressure' | 'fade' | 'wheel';
  /** Texture: `mode` says how the pattern meets the stroke (Multiply cuts by the pattern's darkness, Subtract takes it
   *  away, Darken keeps the lesser, Height lifts light areas); `depthJitter` varies the depth from dab to dab, `minDepth`
   *  is the depth `depthControl` falls to, and `eachTip` gives every dab its own place in the pattern. */
  texture: { on: boolean; pattern: string; scale: number; depth: number; invert?: boolean; brightness?: number; contrast?: number; mode?: 'multiply' | 'subtract' | 'darken' | 'height'; depthJitter?: number; minDepth?: number; depthControl?: 'off' | 'pressure' | 'fade' | 'wheel'; eachTip?: boolean };
  /** The dual brush's marks: by default laid with the main dabs, scattered by its own Scatter and Count; with `spacing`
   *  (percent of its size) laid along the stroke at their own interval. Its tip is a round one of its own hardness,
   *  roundness, angle and flips, or the main (sampled) tip; Multiply keeps the main paint where marks fall, Subtract cuts it there. */
  dual: { on: boolean; diameter: number; scatter: number; count: number; spacing?: number | null; hardness?: number; roundness?: number; angle?: number; flipX?: boolean; flipY?: boolean; mode?: 'multiply' | 'subtract'; source?: 'round' | 'main' };
  /** Color Dynamics (1.50.1, the owner's list): each dab's colour from the foreground towards the
   *  background, and its hue, saturation and brightness varied (jitters, 0-100). Purity (-100 to 100) shifts the saturation
   *  of every dab; `fgBgControl` takes the foreground/background mix from pen pressure or the fade instead of chance;
   *  `perTip` false picks one colour for the whole stroke. */
  color: { on: boolean; fgBg: number; hue: number; saturation: number; brightness: number; purity?: number; perTip?: boolean; fgBgControl?: 'off' | 'pressure' | 'fade' | 'wheel' };
  /** Transfer: each dab's opacity and flow varied (jitters, 0-100), or following a control (pen pressure, the fade over
   *  `fadeSteps` dabs, the pen's tilt, its barrel rotation or its wheel). The Mixer Brush also takes `wetJitter` and
   *  `mixJitter` (0-100, how far a dab's Wet and Mix fall short of their settings) and a control for each. */
  transfer: { on: boolean; opacity: number; flow: number; control: 'off' | 'pressure' | 'fade' | 'tilt' | 'rotation' | 'wheel'; fadeSteps?: number; wetJitter?: number; mixJitter?: number; wetControl?: 'off' | 'pressure' | 'fade' | 'tilt' | 'rotation' | 'wheel'; mixControl?: 'off' | 'pressure' | 'fade' | 'tilt' | 'rotation' | 'wheel' };
  /** Noise roughens the tip's soft edge; Wet Edges makes its centre lighter than its rim (watercolour). */
  noise: boolean; wetEdges: boolean;
  /** Brush Pose: the pen's tilt, barrel rotation and pressure held at fixed values while `on`, whatever the pointer reports. */
  pose?: { on: boolean; tiltX: number; tiltY: number; rotation: number; pressure: number; usePressure: boolean };
  /** Sections that keep their settings when a preset is chosen or Reset is pressed (SECTION_KEYS names them); Protect Texture keeps the texture's. */
  locks?: string[]; protectTexture?: boolean;
}

/** The BrushShape fields each Brush Settings section owns, for section locks and for presets that carry a shape. */
export const SECTION_KEYS: Record<string, ReadonlyArray<keyof BrushShape>> = {
  tip: ['angle', 'roundness', 'spacing', 'flipX', 'flipY'],
  shapeDynamics: ['sizeJitter', 'angleJitter', 'roundnessJitter', 'minRoundness', 'angleControl', 'roundnessControl', 'sizeControl', 'minDiameter', 'tiltScale', 'flipXJitter', 'flipYJitter', 'projection'],
  scattering: ['scatter', 'scatterControl', 'bothAxes', 'count', 'countJitter'],
  texture: ['texture'], dual: ['dual'], color: ['color'], transfer: ['transfer'], pose: ['pose'], noise: ['noise'], wetEdges: ['wetEdges'],
};

/** `patch` laid over `cur`, leaving out the sections `cur` has locked (and the texture when Protect Texture is on). */
export function mergeShape(cur: BrushShape, patch: Partial<BrushShape>): BrushShape {
  const held = new Set<string>(cur.locks ?? []);
  if (cur.protectTexture) held.add('texture');
  const out: Record<string, unknown> = { ...cur }, src = patch as Record<string, unknown>;
  for (const [sec, keys] of Object.entries(SECTION_KEYS)) {
    if (held.has(sec)) continue;
    for (const k of keys) if (k in src) out[k] = src[k];
  }
  return out as unknown as BrushShape;
}
export const defaultShape = (): BrushShape => ({
  angle: 0, roundness: 100, spacing: null, sizeJitter: 0, angleJitter: 0, roundnessJitter: 0, minRoundness: 25,
  angleControl: 'off', roundnessControl: 'off', scatter: 0, bothAxes: false, count: 1, countJitter: 0,
  texture: { on: false, pattern: '', scale: 100, depth: 100 }, dual: { on: false, diameter: 20, scatter: 0, count: 1 },
  color: { on: false, fgBg: 0, hue: 0, saturation: 0, brightness: 0 }, transfer: { on: false, opacity: 0, flow: 0, control: 'off' }, noise: false, wetEdges: false,
  scatterControl: 'off', pose: { on: false, tiltX: 0, tiltY: 0, rotation: 0, pressure: 100, usePressure: false }, locks: [], protectTexture: false,
  sizeControl: 'off', minDiameter: 0, tiltScale: 100, flipXJitter: false, flipYJitter: false, projection: false,
});
/** Whether a shape does anything the plain round brush does not; an inactive one leaves strokes exactly as before. */
export function shapeActive(s: BrushShape | null | undefined): boolean {
  if (!s) return false;
  const d = defaultShape();
  return s.angle !== d.angle || s.roundness !== d.roundness || s.spacing !== null || s.sizeJitter > 0 || s.angleJitter > 0 || s.roundnessJitter > 0
    || s.angleControl !== 'off' || s.roundnessControl !== 'off' || s.scatter > 0 || s.count > 1 || s.countJitter > 0 || s.texture.on || s.dual.on || !!s.flipX || !!s.flipY
    || (s.sizeControl ?? 'off') !== 'off' || (s.minDiameter ?? 0) > 0 || !!s.flipXJitter || !!s.flipYJitter || !!s.projection;
}

/** A preset's tip shape (angle in degrees, roundness in percent) is optional: absent is a round tip (0, 100). `spacing`
 *  (percent of the diameter) is set when an imported tip carries one other than the 25 a tip paints at by default. */
export interface BrushPreset { id: string; name: string; description: string; diameter: number; hardness: number; opacity: number; dynamics: BrushDynamics; tip?: SampledTip; angle?: number; roundness?: number; spacing?: number; shape?: Partial<BrushShape>; flow?: number; /** The folder it is listed in; a path with / puts it in a folder inside a folder. */ group?: string; /** The foreground colour it sets, when saved with Capture Colour. */ colour?: { r: number; g: number; b: number }; /** The Brush tool's Mode it sets, when saved with Capture Tool Options. */ mode?: string }

/** Presets made from imported .abr files and brushes the person saved, kept by the app and listed after the built-ins. */
export let importedBrushPresets: BrushPreset[] = [];
export function setImportedBrushPresets(list: BrushPreset[]): void { importedBrushPresets = list; }
export const allBrushPresets = (): BrushPreset[] => [...BUILTIN_BRUSH_PRESETS, ...importedBrushPresets];

/** How an .abr import meets the brushes already kept: Replace drops the earlier imports first (saved brushes stay), Select makes the first new brush the current one. */
export const abrImport = { replace: false, select: true };

/** The folder a preset is listed in: its own group, else General for the first six built-ins and Imported for the rest. */
export function brushGroupOf(p: BrushPreset): string {
  return p.group ?? (BUILTIN_BRUSH_PRESETS.some((b) => b.id === p.id) ? 'General Brushes' : 'Imported Brushes');
}

/** A preset for an imported sampled tip: its size, full opacity, pressure on size as Hard round has it. */
export function presetFromTip(id: string, name: string, tip: SampledTip, spacing?: number): BrushPreset {
  const set: { spacing?: number } = spacing !== undefined && Number.isFinite(spacing) && Math.round(spacing) !== 25 ? { spacing: Math.min(1000, Math.max(1, Math.round(spacing))) } : {};
  return { id, name, description: `Imported sampled tip, ${tip.w} x ${tip.h} px${set.spacing ? `, spacing ${set.spacing}%` : ''}.`, diameter: Math.min(1000, Math.max(tip.w, tip.h)), hardness: 1, opacity: 1, dynamics: { size: pressureOption(0.15), flow: identityOption(), opacity: identityOption() }, tip, ...set };
}

const generated = (kind: ProceduralKind, name: string, diameter: number, spacing: number, shape?: Partial<BrushShape>): BrushPreset => ({
  id: `proc-${kind}`, group: 'Procedural Brushes', name, description: `A generated ${name.toLowerCase()} tip.`, diameter, hardness: 1, opacity: 1, spacing, tip: proceduralTip(kind),
  dynamics: { size: pressureOption(0.4), flow: identityOption(), opacity: identityOption() }, ...(shape ? { shape } : {}),
});

/** NodeMode's built-in painting presets, as formvis's brush can hold them (Ink's speed sensor, Pencil's tilted tip and
 *  scatter, Marker's chisel and Blender's smudge have no counterpart here yet and are left out of those presets). */
export const BUILTIN_BRUSH_PRESETS: BrushPreset[] = [
  { id: 'hard-round', name: 'Hard round', description: 'Crisp opaque round brush; pressure drives size.', diameter: 28, hardness: 0.95, opacity: 1, dynamics: { size: pressureOption(0.15), flow: identityOption(), opacity: identityOption() } },
  { id: 'soft-air', name: 'Soft airbrush', description: 'Soft buildup; pressure drives flow more than size.', diameter: 64, hardness: 0.05, opacity: 1, dynamics: { size: pressureOption(0.6), flow: pressureOption(0.15), opacity: identityOption() } },
  { id: 'ink', name: 'Ink', description: 'Firm liner; light pressure thins the line to a quarter.', diameter: 16, hardness: 0.9, opacity: 1, dynamics: { size: pressureOption(0.25), flow: identityOption(), opacity: identityOption() } },
  { id: 'pencil', name: 'Pencil', description: 'Small, slightly soft, translucent; pressure drives size and flow.', diameter: 10, hardness: 0.55, opacity: 0.85, dynamics: { size: pressureOption(0.4), flow: pressureOption(0.4), opacity: identityOption() } },
  { id: 'marker', name: 'Marker', description: 'Wide translucent strokes that do not build up within one stroke.', diameter: 36, hardness: 0.85, opacity: 0.55, dynamics: noDynamics() },
  { id: 'flat-angled', name: 'Flat angled', description: 'A calligraphic flat tip held at an angle: thick one way, thin the other.', diameter: 36, hardness: 0.9, opacity: 1, dynamics: { size: pressureOption(0.3), flow: identityOption(), opacity: identityOption() }, angle: -35, roundness: 14 },
  { id: 'dry-charcoal', group: 'Dry Media Brushes', name: 'Charcoal', description: 'Grainy soft stick; pressure drives size and flow.', diameter: 34, hardness: 0.35, opacity: 0.9, spacing: 12, dynamics: { size: pressureOption(0.5), flow: pressureOption(0.3), opacity: identityOption() }, shape: { noise: true } },
  { id: 'dry-chalk', group: 'Dry Media Brushes', name: 'Chalk', description: 'Dusty broken edge with a little scatter.', diameter: 28, hardness: 0.6, opacity: 0.85, spacing: 18, dynamics: { size: pressureOption(0.6), flow: identityOption(), opacity: identityOption() }, shape: { noise: true, scatter: 25, count: 2 } },
  { id: 'dry-graphite', group: 'Dry Media Brushes', name: 'Graphite 2B', description: 'Fine grainy pencil; light pressure is pale.', diameter: 7, hardness: 0.75, opacity: 0.8, spacing: 10, dynamics: { size: pressureOption(0.5), flow: pressureOption(0.2), opacity: identityOption() }, shape: { noise: true } },
  { id: 'dry-pastel', group: 'Dry Media Brushes', name: 'Soft pastel', description: 'Broad soft stick with a rough edge.', diameter: 56, hardness: 0.2, opacity: 0.7, spacing: 14, dynamics: { size: pressureOption(0.7), flow: pressureOption(0.4), opacity: identityOption() }, shape: { noise: true } },
  { id: 'dry-calligraphy', group: 'Dry Media Brushes', name: 'Calligraphy pen', description: 'A 45 degree nib: thick across, thin along.', diameter: 22, hardness: 1, opacity: 1, angle: -45, roundness: 18, dynamics: { size: pressureOption(0.5), flow: identityOption(), opacity: identityOption() } },
  { id: 'wet-watercolor', group: 'Wet Media Brushes', name: 'Watercolor', description: 'Translucent wash with darker pooled edges.', diameter: 56, hardness: 0.5, opacity: 0.55, dynamics: { size: pressureOption(0.5), flow: identityOption(), opacity: pressureOption(0.4) }, shape: { wetEdges: true } },
  { id: 'wet-wash', group: 'Wet Media Brushes', name: 'Wide wash', description: 'A large pale wash with a wet rim.', diameter: 120, hardness: 0.3, opacity: 0.35, dynamics: noDynamics(), shape: { wetEdges: true } },
  { id: 'wet-oil-flat', group: 'Wet Media Brushes', name: 'Oil flat', description: 'A flat bristle tip held at an angle, close dabs.', diameter: 44, hardness: 0.85, opacity: 1, spacing: 8, angle: -30, roundness: 28, dynamics: { size: pressureOption(0.4), flow: identityOption(), opacity: identityOption() }, shape: { angleJitter: 6 } },
  { id: 'wet-gouache', group: 'Wet Media Brushes', name: 'Gouache', description: 'Opaque round brush with a soft wet edge.', diameter: 38, hardness: 0.8, opacity: 0.9, dynamics: { size: pressureOption(0.35), flow: identityOption(), opacity: identityOption() }, shape: { wetEdges: true } },
  { id: 'fx-speckle', group: 'Special Effects Brushes', name: 'Speckle', description: 'Small dots thrown around the stroke.', diameter: 10, hardness: 1, opacity: 1, spacing: 120, dynamics: noDynamics(), shape: { scatter: 300, count: 4, sizeJitter: 50 } },
  { id: 'fx-sparkle', group: 'Special Effects Brushes', name: 'Sparkle', description: 'Soft glints of varied size.', diameter: 16, hardness: 0.4, opacity: 1, spacing: 160, dynamics: noDynamics(), shape: { scatter: 220, count: 2, sizeJitter: 80 } },
  { id: 'fx-grass', group: 'Special Effects Brushes', name: 'Grass', description: 'Thin blades fanned in every direction.', diameter: 40, hardness: 0.9, opacity: 1, spacing: 60, roundness: 12, dynamics: { size: pressureOption(0.5), flow: identityOption(), opacity: identityOption() }, shape: { angleJitter: 100, scatter: 80, count: 3, sizeJitter: 30 } },
  { id: 'fx-dry-spray', group: 'Special Effects Brushes', name: 'Spray', description: 'A fine spray of grains around a soft core.', diameter: 70, hardness: 0.1, opacity: 1, spacing: 40, flow: 0.5, dynamics: noDynamics(), shape: { scatter: 150, count: 6, sizeJitter: 40 } },
  generated('chalk', 'Chalk stick', 40, 14),
  generated('spatter', 'Spatter', 80, 60, { angleJitter: 100 }),
  generated('bristle', 'Bristle', 56, 10),
  generated('charcoal', 'Charcoal grain', 52, 12),
  generated('leaf', 'Leaf', 48, 90, { angleControl: 'direction' }),
  generated('grass', 'Grass blades', 56, 70, { angleJitter: 12 }),
  generated('sponge', 'Sponge', 60, 25),
  generated('star', 'Star', 36, 120, { angleJitter: 100, sizeJitter: 30 }),
  generated('rake', 'Rake', 60, 8, { angleControl: 'direction' }),
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

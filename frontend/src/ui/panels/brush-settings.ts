import { allPatterns, type Engine } from '../../engine';
import { defaultShape, mergeShape, type BrushShape } from '../../engine/brush-dynamics';
import { airbrushState } from '../../extensions/tools/brush';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { recalled, remembered } from '../prefs';
import { checkRow, selectRow, sliderRow } from './controls';
import { NewBrushPresetDialog } from './new-brush-preset-dialog';
import { pressureCurveRow } from './pressure-curve';

type Row = { el: HTMLElement; sync: () => void };

/** Window > Brush Settings (F5), the panel for the Brush's tip and its dynamics: Brush Tip Shape, Shape
 *  Dynamics, Scattering, Texture, Dual Brush, Color Dynamics, Transfer, Noise and Wet Edges. It edits the engine's brush shape live, so the next stroke uses it;
 *  each change replaces the shape, so a stroke already under way keeps what it started with. Reset puts every setting
 *  back to the plain round brush. */
export class BrushSettingsDialog extends Dialog {
  private readonly rows: Row[] = [];
  private saveShape: () => void = () => undefined;
  private newPreset: NewBrushPresetDialog | null = null;

  constructor(private readonly engine: Engine) {
    super('Brush Settings', 440);
    const s = (): BrushShape => this.engine.brushShape;
    // The shape last set stays across reloads: it is put back here, when the app builds, so the first stroke uses it.
    const kept = recalled('Brush Settings', 'shape');
    if (typeof kept === 'string') {
      try {
        const got = JSON.parse(kept) as Record<string, unknown>, base = defaultShape() as unknown as Record<string, unknown>, out: Record<string, unknown> = { ...base };
        for (const [k, v] of Object.entries(got)) {
          if (!(k in base) || typeof v !== typeof base[k]) continue;
          out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? { ...(base[k] as object), ...(v as object) } : v;
        }
        this.engine.brushShape = out as unknown as BrushShape;
      } catch { /* the plain round brush stands */ }
    }
    const save = (): void => { const text = JSON.stringify(this.engine.brushShape); if (text.length <= 3500) remembered('Brush Settings', 'shape', text); };
    this.saveShape = save;
    const put = (patch: Partial<BrushShape>): void => { this.engine.brushShape = { ...s(), ...patch }; save(); };
    const slide = (label: string, min: number, max: number, step: number, read: () => number, write: (v: number) => void): void => {
      const r = sliderRow(label, min, max, step, write);
      this.body.append(r.el);
      this.rows.push({ el: r.el, sync: () => r.set(read()) });
    };
    const pick = (label: string, opts: ReadonlyArray<readonly [string, string]>, read: () => string, write: (v: string) => void): void => {
      const r = selectRow(label, opts, write);
      this.body.append(r.el);
      this.rows.push({ el: r.el, sync: () => r.set(read()) });
    };
    const check = (label: string, read: () => boolean, write: (v: boolean) => void): void => {
      const r = checkRow(label, write);
      this.body.append(r.el);
      this.rows.push({ el: r.el, sync: () => r.set(read()) });
    };
    // A section's heading and its lock: a locked section keeps its values when a preset is chosen or Reset is pressed.
    const heading = (t: string, sec?: string): void => {
      this.body.append(el(`<h3 class="cv-prefs-sub">${t}</h3>`));
      if (sec) check(`Lock ${t}`, () => (s().locks ?? []).includes(sec), (on) => put({ locks: [...(s().locks ?? []).filter((x) => x !== sec), ...(on ? [sec] : [])] }));
    };

    heading('Brush Tip Shape', 'tip');
    slide('Angle (\u00b0)', -180, 180, 1, () => s().angle, (v) => put({ angle: v }));
    slide('Roundness (%)', 1, 100, 1, () => s().roundness, (v) => put({ roundness: v }));
    check('Flip X', () => !!s().flipX, (on) => put({ flipX: on }));
    check('Flip Y', () => !!s().flipY, (on) => put({ flipY: on }));
    check('Spacing', () => s().spacing !== null, (on) => put({ spacing: on ? 25 : null }));
    slide('Spacing (% of diameter)', 1, 1000, 1, () => s().spacing ?? 25, (v) => put({ spacing: v }));

    heading('Shape Dynamics', 'shapeDynamics');
    slide('Size Jitter (%)', 0, 100, 1, () => s().sizeJitter, (v) => put({ sizeJitter: v }));
    pick('Size Control', [['off', 'Off'], ['pressure', 'Pen Pressure'], ['fade', 'Fade'], ['tilt', 'Pen Tilt'], ['rotation', 'Rotation']], () => s().sizeControl ?? 'off', (v) => put({ sizeControl: v as NonNullable<BrushShape['sizeControl']> }));
    slide('Minimum Diameter (%)', 0, 100, 1, () => s().minDiameter ?? 0, (v) => put({ minDiameter: v }));
    slide('Tilt Scale (%)', 0, 400, 1, () => s().tiltScale ?? 100, (v) => put({ tiltScale: v }));
    check('Flip X Jitter', () => !!s().flipXJitter, (v) => put({ flipXJitter: v }));
    check('Flip Y Jitter', () => !!s().flipYJitter, (v) => put({ flipYJitter: v }));
    check('Brush Projection (turn and flatten the tip with the pen tilt)', () => !!s().projection, (v) => put({ projection: v }));
    slide('Angle Jitter (%)', 0, 100, 1, () => s().angleJitter, (v) => put({ angleJitter: v }));
    pick('Angle Control', [['off', 'Off'], ['fade', 'Fade'], ['direction', 'Direction'], ['initial', 'Initial Direction'], ['tilt', 'Pen Tilt'], ['rotation', 'Rotation']], () => s().angleControl, (v) => put({ angleControl: v as BrushShape['angleControl'] }));
    slide('Roundness Jitter (%)', 0, 100, 1, () => s().roundnessJitter, (v) => put({ roundnessJitter: v }));
    pick('Roundness Control', [['off', 'Off'], ['fade', 'Fade'], ['tilt', 'Pen Tilt'], ['rotation', 'Rotation']], () => s().roundnessControl, (v) => put({ roundnessControl: v as BrushShape['roundnessControl'] }));
    slide('Minimum Roundness (%)', 1, 100, 1, () => s().minRoundness, (v) => put({ minRoundness: v }));

    heading('Scattering', 'scattering');
    slide('Scatter (%)', 0, 1000, 1, () => s().scatter, (v) => put({ scatter: v }));
    pick('Scatter Control', [['off', 'Off'], ['pressure', 'Pen Pressure'], ['fade', 'Fade']], () => s().scatterControl ?? 'off', (v) => put({ scatterControl: v as 'off' | 'pressure' | 'fade' }));
    check('Both Axes', () => s().bothAxes, (v) => put({ bothAxes: v }));
    slide('Count', 1, 16, 1, () => s().count, (v) => put({ count: v }));
    slide('Count Jitter (%)', 0, 100, 1, () => s().countJitter, (v) => put({ countJitter: v }));

    heading('Texture', 'texture');
    check('Protect Texture (keep it when a preset is chosen)', () => !!s().protectTexture, (v) => put({ protectTexture: v }));
    check('Texture',() => s().texture.on, (v) => put({ texture: { ...s().texture, on: v, pattern: s().texture.pattern || allPatterns()[0]?.id || '' } }));
    const patterns = allPatterns().map((p) => [p.id, p.name] as const);
    if (patterns.length) pick('Pattern', patterns, () => s().texture.pattern || patterns[0][0], (v) => put({ texture: { ...s().texture, pattern: v } }));
    slide('Scale (%)', 1, 1000, 1, () => s().texture.scale, (v) => put({ texture: { ...s().texture, scale: v } }));
    slide('Depth (%)', 0, 100, 1, () => s().texture.depth, (v) => put({ texture: { ...s().texture, depth: v } }));
    slide('Brightness', -100, 100, 1, () => s().texture.brightness ?? 0, (v) => put({ texture: { ...s().texture, brightness: v } }));
    slide('Contrast', -100, 100, 1, () => s().texture.contrast ?? 0, (v) => put({ texture: { ...s().texture, contrast: v } }));
    check('Invert Texture', () => !!s().texture.invert, (v) => put({ texture: { ...s().texture, invert: v } }));

    heading('Dual Brush', 'dual');
    const du = (): BrushShape['dual'] => s().dual, putDual = (patch: Partial<BrushShape['dual']>): void => put({ dual: { ...du(), ...patch } });
    check('Dual Brush', () => du().on, (v) => putDual({ on: v }));
    pick('Dual Mode', [['multiply', 'Multiply (keep where marks fall)'], ['subtract', 'Subtract (cut where marks fall)']], () => du().mode ?? 'multiply', (v) => putDual({ mode: v === 'subtract' ? 'subtract' : 'multiply' }));
    pick('Dual Tip', [['round', 'Round'], ['main', 'Same as main tip']], () => du().source ?? 'round', (v) => putDual({ source: v === 'main' ? 'main' : 'round' }));
    slide('Size (px)', 1, 1000, 1, () => du().diameter, (v) => putDual({ diameter: v }));
    slide('Hardness (%)', 0, 100, 1, () => Math.round((du().hardness ?? 1) * 100), (v) => putDual({ hardness: v / 100 }));
    slide('Angle (°)', -180, 180, 1, () => du().angle ?? 0, (v) => putDual({ angle: v }));
    slide('Roundness (%)', 1, 100, 1, () => du().roundness ?? 100, (v) => putDual({ roundness: v }));
    check('Flip X', () => !!du().flipX, (v) => putDual({ flipX: v }));
    check('Flip Y', () => !!du().flipY, (v) => putDual({ flipY: v }));
    check('Own Spacing', () => !!du().spacing, (v) => putDual({ spacing: v ? 50 : null }));
    slide('Spacing (% of dual size)', 1, 1000, 1, () => du().spacing ?? 50, (v) => putDual({ spacing: v }));
    slide('Scatter (%)', 0, 1000, 1, () => du().scatter, (v) => putDual({ scatter: v }));
    slide('Count', 1, 16, 1, () => du().count, (v) => putDual({ count: v }));

    // Color Dynamics, Transfer, Noise and Wet Edges (1.50.1, the owner's list), in the usual order; a shape saved
    // before them reads their defaults.
    const cd = (): BrushShape['color'] => s().color ?? defaultShape().color, tr = (): BrushShape['transfer'] => s().transfer ?? defaultShape().transfer;
    heading('Color Dynamics', 'color');
    check('Color Dynamics', () => cd().on, (v) => put({ color: { ...cd(), on: v } }));
    check('Apply Per Tip (off: one colour for the stroke)', () => cd().perTip !== false, (v) => put({ color: { ...cd(), perTip: v } }));
    slide('Foreground/Background Jitter (%)', 0, 100, 1, () => cd().fgBg, (v) => put({ color: { ...cd(), fgBg: v } }));
    pick('Foreground/Background Control', [['off', 'Off'], ['pressure', 'Pen Pressure'], ['fade', 'Fade']], () => cd().fgBgControl ?? 'off', (v) => put({ color: { ...cd(), fgBgControl: v === 'pressure' || v === 'fade' ? v : 'off' } }));
    slide('Hue Jitter (%)', 0, 100, 1, () => cd().hue, (v) => put({ color: { ...cd(), hue: v } }));
    slide('Saturation Jitter (%)', 0, 100, 1, () => cd().saturation, (v) => put({ color: { ...cd(), saturation: v } }));
    slide('Brightness Jitter (%)', 0, 100, 1, () => cd().brightness, (v) => put({ color: { ...cd(), brightness: v } }));
    slide('Purity (%)', -100, 100, 1, () => cd().purity ?? 0, (v) => put({ color: { ...cd(), purity: v } }));

    heading('Transfer', 'transfer');
    check('Transfer', () => tr().on, (v) => put({ transfer: { ...tr(), on: v } }));
    slide('Opacity Jitter (%)', 0, 100, 1, () => tr().opacity, (v) => put({ transfer: { ...tr(), opacity: v } }));
    slide('Flow Jitter (%)', 0, 100, 1, () => tr().flow, (v) => put({ transfer: { ...tr(), flow: v } }));
    pick('Control', [['off', 'Off'], ['pressure', 'Pen Pressure'], ['fade', 'Fade'], ['tilt', 'Pen Tilt'], ['rotation', 'Rotation']], () => tr().control, (v) => put({ transfer: { ...tr(), control: (['pressure', 'fade', 'tilt', 'rotation'].includes(v) ? v : 'off') as BrushShape['transfer']['control'] } }));
    slide('Fade Steps (dabs, for every Fade control)', 1, 1000, 1, () => tr().fadeSteps ?? 100, (v) => put({ transfer: { ...tr(), fadeSteps: v } }));

    heading('Brush Pose', 'pose');
    const po = (): NonNullable<BrushShape['pose']> => s().pose ?? defaultShape().pose as NonNullable<BrushShape['pose']>, putPose = (patch: Partial<NonNullable<BrushShape['pose']>>): void => put({ pose: { ...po(), ...patch } });
    check('Brush Pose (hold the pen at fixed values)', () => po().on, (v) => putPose({ on: v }));
    slide('Tilt X (°)', -90, 90, 1, () => po().tiltX, (v) => putPose({ tiltX: v }));
    slide('Tilt Y (°)', -90, 90, 1, () => po().tiltY, (v) => putPose({ tiltY: v }));
    slide('Rotation (°)', 0, 359, 1, () => po().rotation, (v) => putPose({ rotation: v }));
    check('Override Pressure', () => po().usePressure, (v) => putPose({ usePressure: v }));
    slide('Pressure (%)', 0, 100, 1, () => po().pressure, (v) => putPose({ pressure: v }));

    heading('Build-up');
    check('Airbrush (paint builds up while the pointer rests)', () => airbrushState.on, (v) => { airbrushState.on = v; this.engine.emit('options', null); });
    slide('Build-up Interval (ms between dabs)', 10, 500, 1, () => airbrushState.interval, (v) => { airbrushState.interval = v; this.engine.emit('options', null); });

    heading('Noise and Wet Edges', 'noise');
    check('Noise', () => !!s().noise, (v) => put({ noise: v }));
    check('Wet Edges', () => !!s().wetEdges, (v) => put({ wetEdges: v }));

    heading('Pen Pressure Curve');
    const curve = pressureCurveRow('Draw the response', (v) => { this.engine.pressureCurve = v; this.saveCurve(v); });
    this.body.append(curve.el);
    this.rows.push({ el: curve.el, sync: () => curve.set(this.engine.pressureCurve) });
    const kc = recalled('Brush Settings', 'curve');
    if (typeof kc === 'string') { try { const v = JSON.parse(kc); if (Array.isArray(v) && v.length >= 2 && v.every((n) => typeof n === 'number')) this.engine.pressureCurve = v; } catch { /* the straight line stands */ } }

    this.button('New Brush Preset', 'ghost', () => { this.newPreset ??= new NewBrushPresetDialog(this.engine); this.newPreset.show(); });
    this.button('Reset', 'ghost', () => { this.engine.brushShape = mergeShape(this.engine.brushShape, defaultShape()); this.saveShape(); this.sync(); });
    this.button('Done', 'primary', () => this.close());
  }

  private saveCurve(v: number[] | null): void { remembered('Brush Settings', 'curve', JSON.stringify(v)); }

  private sync(): void { for (const r of this.rows) r.sync(); }

  show(): void {
    if (this.isOpen) return;
    this.sync();
    this.open();
  }
}

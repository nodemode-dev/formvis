import { allPatterns, type Engine } from '../../engine';
import { defaultShape, type BrushShape } from '../../engine/brush-dynamics';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { recalled, remembered } from '../prefs';
import { checkRow, selectRow, sliderRow } from './controls';

type Row = { el: HTMLElement; sync: () => void };

/** Window > Brush Settings (F5), the panel for the Brush's tip and its dynamics: Brush Tip Shape, Shape
 *  Dynamics, Scattering, Texture, Dual Brush, Color Dynamics, Transfer, Noise and Wet Edges. It edits the engine's brush shape live, so the next stroke uses it;
 *  each change replaces the shape, so a stroke already under way keeps what it started with. Reset puts every setting
 *  back to the plain round brush. */
export class BrushSettingsDialog extends Dialog {
  private readonly rows: Row[] = [];
  private saveShape: () => void = () => undefined;

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
    const save = (): void => { const text = JSON.stringify(this.engine.brushShape); if (text.length <= 1900) remembered('Brush Settings', 'shape', text); };
    this.saveShape = save;
    const put = (patch: Partial<BrushShape>): void => { this.engine.brushShape = { ...s(), ...patch }; save(); };
    const heading = (t: string): void => { this.body.append(el(`<h3 class="cv-prefs-sub">${t}</h3>`)); };
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

    heading('Brush Tip Shape');
    slide('Angle (\u00b0)', -180, 180, 1, () => s().angle, (v) => put({ angle: v }));
    slide('Roundness (%)', 1, 100, 1, () => s().roundness, (v) => put({ roundness: v }));
    check('Spacing', () => s().spacing !== null, (on) => put({ spacing: on ? 25 : null }));
    slide('Spacing (% of diameter)', 1, 1000, 1, () => s().spacing ?? 25, (v) => put({ spacing: v }));

    heading('Shape Dynamics');
    slide('Size Jitter (%)', 0, 100, 1, () => s().sizeJitter, (v) => put({ sizeJitter: v }));
    slide('Angle Jitter (%)', 0, 100, 1, () => s().angleJitter, (v) => put({ angleJitter: v }));
    pick('Angle Control', [['off', 'Off'], ['direction', 'Direction'], ['tilt', 'Pen Tilt'], ['rotation', 'Rotation']], () => s().angleControl, (v) => put({ angleControl: v as BrushShape['angleControl'] }));
    slide('Roundness Jitter (%)', 0, 100, 1, () => s().roundnessJitter, (v) => put({ roundnessJitter: v }));
    pick('Roundness Control', [['off', 'Off'], ['tilt', 'Pen Tilt']], () => s().roundnessControl, (v) => put({ roundnessControl: v as BrushShape['roundnessControl'] }));
    slide('Minimum Roundness (%)', 1, 100, 1, () => s().minRoundness, (v) => put({ minRoundness: v }));

    heading('Scattering');
    slide('Scatter (%)', 0, 1000, 1, () => s().scatter, (v) => put({ scatter: v }));
    check('Both Axes', () => s().bothAxes, (v) => put({ bothAxes: v }));
    slide('Count', 1, 16, 1, () => s().count, (v) => put({ count: v }));
    slide('Count Jitter (%)', 0, 100, 1, () => s().countJitter, (v) => put({ countJitter: v }));

    heading('Texture');
    check('Texture', () => s().texture.on, (v) => put({ texture: { ...s().texture, on: v, pattern: s().texture.pattern || allPatterns()[0]?.id || '' } }));
    const patterns = allPatterns().map((p) => [p.id, p.name] as const);
    if (patterns.length) pick('Pattern', patterns, () => s().texture.pattern || patterns[0][0], (v) => put({ texture: { ...s().texture, pattern: v } }));
    slide('Scale (%)', 1, 1000, 1, () => s().texture.scale, (v) => put({ texture: { ...s().texture, scale: v } }));
    slide('Depth (%)', 0, 100, 1, () => s().texture.depth, (v) => put({ texture: { ...s().texture, depth: v } }));

    heading('Dual Brush');
    check('Dual Brush', () => s().dual.on, (v) => put({ dual: { ...s().dual, on: v } }));
    slide('Size (px)', 1, 1000, 1, () => s().dual.diameter, (v) => put({ dual: { ...s().dual, diameter: v } }));
    slide('Scatter (%)', 0, 1000, 1, () => s().dual.scatter, (v) => put({ dual: { ...s().dual, scatter: v } }));
    slide('Count', 1, 16, 1, () => s().dual.count, (v) => put({ dual: { ...s().dual, count: v } }));

    // Color Dynamics, Transfer, Noise and Wet Edges (1.50.1, the owner's list), in the usual order; a shape saved
    // before them reads their defaults.
    const cd = (): BrushShape['color'] => s().color ?? defaultShape().color, tr = (): BrushShape['transfer'] => s().transfer ?? defaultShape().transfer;
    heading('Color Dynamics');
    check('Color Dynamics', () => cd().on, (v) => put({ color: { ...cd(), on: v } }));
    slide('Foreground/Background Jitter (%)', 0, 100, 1, () => cd().fgBg, (v) => put({ color: { ...cd(), fgBg: v } }));
    slide('Hue Jitter (%)', 0, 100, 1, () => cd().hue, (v) => put({ color: { ...cd(), hue: v } }));
    slide('Saturation Jitter (%)', 0, 100, 1, () => cd().saturation, (v) => put({ color: { ...cd(), saturation: v } }));
    slide('Brightness Jitter (%)', 0, 100, 1, () => cd().brightness, (v) => put({ color: { ...cd(), brightness: v } }));

    heading('Transfer');
    check('Transfer', () => tr().on, (v) => put({ transfer: { ...tr(), on: v } }));
    slide('Opacity Jitter (%)', 0, 100, 1, () => tr().opacity, (v) => put({ transfer: { ...tr(), opacity: v } }));
    slide('Flow Jitter (%)', 0, 100, 1, () => tr().flow, (v) => put({ transfer: { ...tr(), flow: v } }));
    pick('Control', [['off', 'Off'], ['pressure', 'Pen Pressure']], () => tr().control, (v) => put({ transfer: { ...tr(), control: v === 'pressure' ? 'pressure' : 'off' } }));

    heading('Noise and Wet Edges');
    check('Noise', () => !!s().noise, (v) => put({ noise: v }));
    check('Wet Edges', () => !!s().wetEdges, (v) => put({ wetEdges: v }));

    this.button('Reset', 'ghost', () => { this.engine.brushShape = defaultShape(); this.saveShape(); this.sync(); });
    this.button('Done', 'primary', () => this.close());
  }

  private sync(): void { for (const r of this.rows) r.sync(); }

  show(): void {
    if (this.isOpen) return;
    this.sync();
    this.open();
  }
}

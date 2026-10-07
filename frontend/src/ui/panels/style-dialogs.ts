import { DEFAULT_GLOBAL_LIGHT, clamp, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { numberRow } from './controls';

const enterTo = (input: HTMLInputElement, run: () => void): void => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
const read = (r: { input: HTMLInputElement }, lo: number, hi: number, d: number): number => { const n = Number(r.input.value); return Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : d; };

/** Layer > Layer Style > Global Light: the document's one light, for every effect that uses it. */
export class GlobalLightDialog extends Dialog {
  private readonly angle = numberRow('Angle (°)', -180, 180, 1, () => undefined);
  private readonly altitude = numberRow('Altitude (°)', 0, 90, 1, () => undefined);

  constructor(private readonly engine: Engine) {
    super('Global Light', 320);
    this.body.append(this.angle.el, this.altitude.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    for (const r of [this.angle, this.altitude]) enterTo(r.input, () => this.apply());
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const g = p.doc.globalLight ?? DEFAULT_GLOBAL_LIGHT;
    this.angle.set(g.angle);
    this.altitude.set(g.altitude);
    this.open(this.angle.input);
    this.angle.input.select();
  }

  private apply(): void {
    const g = this.engine.current?.doc.globalLight ?? DEFAULT_GLOBAL_LIGHT, next = { angle: read(this.angle, -180, 180, g.angle), altitude: read(this.altitude, 0, 90, g.altitude) };
    this.close();
    this.engine.setGlobalLight(next);
  }
}

/** Layer > Layer Style > Scale Effects: the selected layers' effects scaled, 1 to 1000 percent. */
export class ScaleEffectsDialog extends Dialog {
  private readonly scale = numberRow('Scale (%)', 1, 1000, 1, () => undefined);

  constructor(private readonly engine: Engine) {
    super('Scale Layer Effects', 320);
    this.body.append(this.scale.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.scale.input, () => this.apply());
  }

  show(): void {
    if (this.isOpen || !this.engine.current) return;
    this.scale.set(100);
    this.open(this.scale.input);
    this.scale.input.select();
  }

  private apply(): void {
    const v = read(this.scale, 1, 1000, 100);
    this.close();
    this.engine.scaleEffects(v / 100);
  }
}

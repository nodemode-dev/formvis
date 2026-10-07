import { clamp, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { numberRow } from './controls';

const enterTo = (input: HTMLInputElement, run: () => void): void => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

/** Layer > Matting > Defringe and Color Decontaminate, as Photoshop's dialogs ask: a width, or an amount and radius. */
export class MattingDialog extends Dialog {
  private kind: 'defringe' | 'decontaminate' = 'defringe';
  private readonly width = numberRow('Width (px)', 1, 200, 1, () => undefined);
  private readonly amount = numberRow('Amount (%)', 0, 100, 1, () => undefined);
  private readonly radius = numberRow('Radius (px)', 1, 100, 1, () => undefined);
  private last = { width: 1, amount: 100, radius: 6 };

  constructor(private readonly engine: Engine) {
    super('Defringe', 340);
    this.body.append(this.width.el, this.amount.el, this.radius.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    for (const r of [this.width, this.amount, this.radius]) enterTo(r.input, () => this.apply());
  }

  show(kind: 'defringe' | 'decontaminate'): void {
    if (this.isOpen || !this.engine.activeLayer) return;
    this.kind = kind;
    this.setTitle(kind === 'defringe' ? 'Defringe' : 'Color Decontaminate');
    this.width.el.hidden = kind !== 'defringe';
    this.amount.el.hidden = this.radius.el.hidden = kind === 'defringe';
    this.width.set(this.last.width); this.amount.set(this.last.amount); this.radius.set(this.last.radius);
    const first = kind === 'defringe' ? this.width.input : this.amount.input;
    this.open(first);
    first.select();
  }

  private apply(): void {
    const v = (r: { input: HTMLInputElement }, lo: number, hi: number, d: number): number => { const n = Number(r.input.value); return Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : d; };
    this.last = { width: v(this.width, 1, 200, 1), amount: v(this.amount, 0, 100, 100), radius: v(this.radius, 1, 100, 6) };
    this.close();
    if (this.kind === 'defringe') this.engine.matting('defringe', this.last.width);
    else this.engine.matting('decontaminate', 1, this.last.amount, this.last.radius);
  }
}

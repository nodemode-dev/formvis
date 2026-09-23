import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { numberRow, selectRow } from './controls';

const enterTo = (input: HTMLInputElement, run: () => void): void => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

/** View > New Guide: Horizontal or Vertical at a position in pixels, as in Photoshop. */
export class GuideDialog extends Dialog {
  private axis: 'x' | 'y' = 'y';
  private readonly orient = selectRow('Orientation', [['y', 'Horizontal'], ['x', 'Vertical']], (v) => { this.axis = v as 'x' | 'y'; });
  private readonly pos = numberRow('Position (px)', 0, 30000, 1, () => undefined);

  constructor(private readonly engine: Engine) {
    super('New Guide', 340);
    this.body.append(this.orient.el, this.pos.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.pos.input, () => this.apply());
  }

  show(): void {
    const d = this.engine.current?.doc;
    if (this.isOpen || !d) return;
    this.orient.set(this.axis);
    this.pos.set(Math.round((this.axis === 'x' ? d.width : d.height) / 2));
    this.open(this.pos.input);
    this.pos.input.select();
  }

  private apply(): void {
    const n = Number(this.pos.input.value);
    if (!Number.isFinite(n)) return;
    this.close();
    this.engine.addGuide(this.axis, n);
  }
}

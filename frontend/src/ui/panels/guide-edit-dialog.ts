import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { numberRow, selectRow } from './controls';
import { COLOURS, UNITS, pixelsPer } from './guide-dialog';

/** View > Edit Selected Guides: the picked guides' orientation and position (one guide) and colour (any number). */
export class EditGuidesDialog extends Dialog {
  private axis: 'x' | 'y' = 'y';
  private unit = 'px';
  private colour = '';
  private touched = false;
  private readonly orient = selectRow('Orientation', [['y', 'Horizontal'], ['x', 'Vertical']], (v) => { this.axis = v as 'x' | 'y'; });
  private readonly units = selectRow('Units', UNITS, (v) => this.convert(v));
  private readonly tint = selectRow('Color', COLOURS, (v) => { this.colour = v; this.touched = true; });
  private readonly pos = numberRow('Position', 0, 100000, 1, () => undefined);

  private per(unit: string, axis: 'x' | 'y' = this.axis): number {
    const d = this.engine.current?.doc;
    return d ? pixelsPer(unit, d.resolution, axis === 'x' ? d.width : d.height) : 1;
  }

  private convert(next: string): void {
    const n = Number(this.pos.input.value), px = Number.isFinite(n) ? n * this.per(this.unit) : 0;
    this.unit = next;
    this.pos.input.step = next === 'px' ? '1' : '0.01';
    this.pos.input.value = String(Math.round((px / this.per(next)) * 1000) / 1000);
  }

  constructor(private readonly engine: Engine) {
    super('Edit Selected Guides', 340);
    this.body.append(this.orient.el, this.pos.el, this.units.el, this.tint.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.pos.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
  }

  show(): void {
    const d = this.engine.current?.doc, sel = this.engine.selectedGuides;
    if (this.isOpen || !d || !sel.length) return;
    const first = d.guides?.[sel[0]];
    if (!first) return;
    const one = sel.length === 1;
    this.axis = first.axis;
    this.colour = first.color ?? '';
    this.touched = false;
    this.orient.el.hidden = !one;
    this.pos.el.hidden = !one;
    this.units.el.hidden = !one;
    this.orient.set(this.axis);
    this.units.set(this.unit);
    this.tint.set(this.colour);
    this.pos.input.step = this.unit === 'px' ? '1' : '0.01';
    this.pos.set(Math.round((first.at / this.per(this.unit)) * 1000) / 1000);
    this.open(one ? this.pos.input : undefined);
  }

  private apply(): void {
    const sel = this.engine.selectedGuides, n = Number(this.pos.input.value);
    if (!sel.length) { this.close(); return; }
    const patch: { axis?: 'x' | 'y'; at?: number; color?: string } = {};
    if (sel.length === 1) {
      if (!Number.isFinite(n)) return;
      patch.axis = this.axis;
      patch.at = n * this.per(this.unit);
    }
    if (this.touched) patch.color = this.colour;
    this.close();
    this.engine.editSelectedGuides(patch);
  }
}

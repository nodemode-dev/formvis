import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { numberRow, selectRow } from './controls';

export type TrapUnit = 'pixels' | 'points' | 'mm';

/** Width in pixels for a width in `unit`, from the document resolution in pixels per inch. */
export function trapPixels(width: number, unit: TrapUnit, resolution: number): number {
  const px = unit === 'points' ? width * resolution / 72 : unit === 'mm' ? width * resolution / 25.4 : width;
  return Math.min(10, Math.max(1, Math.round(px)));
}

/** Image > Trap (DEV_PLAN 31.5): a Width field and a unit; the controls are built once. */
export class TrapDialog extends Dialog {
  private width = 1;
  private unit: TrapUnit = 'pixels';
  private readonly widthRow = numberRow('Width', 1, 10, 1, (v) => { this.width = v; });
  private readonly unitRow = selectRow('Unit', [['pixels', 'Pixels'], ['points', 'Points'], ['mm', 'mm']], (v) => { this.unit = v === 'points' || v === 'mm' ? v : 'pixels'; });

  constructor(private readonly engine: Engine) {
    super('Trap', 340);
    this.widthRow.set(1); this.unitRow.set('pixels');
    this.body.append(el('<p class="cv-dialog-note">Overlaps colors where they meet so misregistration on press shows no gap. Black does not spread.</p>'), this.widthRow.el, this.unitRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    this.open();
  }

  private apply(): void {
    const p = this.engine.current;
    if (!p) return;
    const w = Number.isFinite(this.width) ? this.width : 1;
    this.close();
    this.engine.trap(trapPixels(w, this.unit, p.doc.resolution));
  }
}

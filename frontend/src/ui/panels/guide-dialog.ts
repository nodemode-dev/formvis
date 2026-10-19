import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { numberRow, selectRow } from './controls';

const enterTo = (input: HTMLInputElement, run: () => void): void => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

const UNITS: ReadonlyArray<readonly [string, string]> = [['px', 'Pixels'], ['in', 'Inches'], ['cm', 'Centimeters'], ['mm', 'Millimeters'], ['pt', 'Points'], ['pc', 'Picas'], ['%', 'Percent']];
const COLOURS: ReadonlyArray<readonly [string, string]> = [['', 'Default'], ['#00d1ff', 'Cyan'], ['#ff3fb4', 'Magenta'], ['#3ddc84', 'Green'], ['#ffd400', 'Yellow'], ['#ff8a00', 'Orange'], ['#ff4d4f', 'Red']];

/** Pixels in one `unit` of the document, along `axis` (percent is of the document's width or height). */
export function pixelsPer(unit: string, resolution: number, length: number): number {
  const r = resolution > 0 ? resolution : 72;
  return unit === 'in' ? r : unit === 'cm' ? r / 2.54 : unit === 'mm' ? r / 25.4 : unit === 'pt' ? r / 72 : unit === 'pc' ? r / 6 : unit === '%' ? length / 100 : 1;
}

/** View > New Guide: Horizontal or Vertical at a position in pixels, inches, centimeters, millimeters, points, picas or
 *  percent, in a colour. */
export class GuideDialog extends Dialog {
  private axis: 'x' | 'y' = 'y';
  private unit = 'px';
  private colour = '';
  private readonly orient = selectRow('Orientation', [['y', 'Horizontal'], ['x', 'Vertical']], (v) => { this.axis = v as 'x' | 'y'; this.convert(this.unit); });
  private readonly units = selectRow('Units', UNITS, (v) => this.convert(v));
  private readonly tint = selectRow('Color', COLOURS, (v) => { this.colour = v; });
  private readonly pos = numberRow('Position', 0, 100000, 1, () => undefined);

  private per(unit: string): number {
    const d = this.engine.current?.doc;
    return d ? pixelsPer(unit, d.resolution, this.axis === 'x' ? d.width : d.height) : 1;
  }

  /** The same place in the chosen unit: the typed value goes through pixels. */
  private convert(next: string): void {
    const n = Number(this.pos.input.value), px = Number.isFinite(n) ? n * this.per(this.unit) : 0;
    this.unit = next;
    this.pos.input.step = next === 'px' ? '1' : '0.01';
    this.pos.input.value = String(Math.round((px / this.per(next)) * 1000) / 1000);
  }

  constructor(private readonly engine: Engine) {
    super('New Guide', 340);
    this.body.append(this.orient.el, this.pos.el, this.units.el, this.tint.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.pos.input, () => this.apply());
    this.remember([this.pos.input]);   // the orientation; the position starts at the middle of the document
  }

  show(): void {
    const d = this.engine.current?.doc;
    if (this.isOpen || !d) return;
    this.orient.set(this.axis);
    this.units.set(this.unit);
    this.tint.set(this.colour);
    this.pos.input.step = this.unit === 'px' ? '1' : '0.01';
    this.pos.set(Math.round(((this.axis === 'x' ? d.width : d.height) / 2 / this.per(this.unit)) * 1000) / 1000);
    this.open(this.pos.input);
    this.pos.input.select();
  }

  private apply(): void {
    const n = Number(this.pos.input.value);
    if (!Number.isFinite(n)) return;
    this.close();
    this.engine.addGuide(this.axis, n * this.per(this.unit), this.colour || undefined);
  }
}

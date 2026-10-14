import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { numberRow, sliderRow } from './controls';

/** Layer > Type > Type on Arc and Type on Circle (DEV_PLAN 32.8): the text, the radius, for an arc its sweep, and where
 *  the type starts along the curve (Start Offset, a percentage). The centre is the document's, or the selection's.
 *  The result is a type layer that stays editable. Rows are built once; show() only fills them. */
export class TypeOnShapeDialog extends Dialog {
  private kind: 'arc' | 'circle' = 'arc';
  private radius = 100;
  private sweep = 180;
  private offset = 0;
  private readonly text = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Text to set on the curve">');
  private readonly radiusRow = numberRow('Radius (px)', 1, 100000, 1, (v) => { this.radius = v; });
  private readonly sweepRow = numberRow('Sweep (degrees)', 1, 360, 1, (v) => { this.sweep = v; });
  private readonly offsetRow = sliderRow('Start Offset (%)', 0, 100, 1, (v) => { this.offset = v; });

  constructor(private readonly engine: Engine) {
    super('Type on Arc', 420);
    const field = el('<label class="cv-field"><span>Text</span></label>');
    field.append(this.text);
    this.body.append(field, this.radiusRow.el, this.sweepRow.el, this.offsetRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(kind: 'arc' | 'circle'): void {
    if (this.isOpen) return;
    const p = this.engine.current;
    this.kind = kind;
    this.radius = p ? Math.round(Math.min(p.doc.width, p.doc.height) / 3) : 100;
    this.sweep = 180;
    this.offset = 0;
    this.radiusRow.set(this.radius);
    this.sweepRow.set(this.sweep);
    this.sweepRow.el.hidden = kind === 'circle';
    this.offsetRow.set(0);
    this.open();
    this.text.focus();
  }

  private apply(): void {
    const content = this.text.value, kind = this.kind, radius = this.radius, sweep = this.sweep, offset = this.offset;
    this.close();
    const c = this.engine.shapeCentre();
    if (!c) return;
    void this.engine.createTextOnShape(content, { kind, cx: c.x, cy: c.y, r: radius, start: -sweep / 2, sweep }, offset);
  }
}

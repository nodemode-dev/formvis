import type { Engine, Pt } from '../../engine';
import { Dialog } from '../dialogs';
import { numberRow } from './controls';

/** A click with the Shape tool opens this: the width and height of the shape (a line's length), its corner radius for
 *  a rectangle, sides or points for a polygon or star. OK draws it from the click as the drag would. */
export class CreateShapeDialog extends Dialog {
  private at: Pt = { x: 0, y: 0 };
  private w = 200;
  private h = 200;
  private readonly width = numberRow('Width (px)', 1, 30000, 1, (v) => { this.w = v; });
  private readonly height = numberRow('Height (px)', 1, 30000, 1, (v) => { this.h = v; });
  private readonly radius = numberRow('Corner radius (px)', 0, 500, 1, (v) => { this.engine.shapeSettings.cornerRadius = Math.max(0, Math.min(500, v)); });
  private readonly sides = numberRow('Sides', 3, 100, 1, (v) => { this.engine.shapeSettings.sides = Math.max(3, Math.min(100, Math.round(v))); });

  constructor(private readonly engine: Engine) {
    super('Create Shape', 320);
    this.body.append(this.width.el, this.height.el, this.radius.el, this.sides.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(at: Pt): void {
    if (this.isOpen || !this.engine.current) return;
    const s = this.engine.shapeSettings, line = s.kind === 'line' || s.kind === 'arrow';
    this.at = at;
    this.width.set(this.w);
    this.height.set(this.h);
    this.radius.set(s.cornerRadius);
    this.sides.set(s.sides);
    this.height.el.hidden = line;
    this.radius.el.hidden = s.kind !== 'rectangle';
    this.sides.el.hidden = s.kind !== 'polygon' && s.kind !== 'star';
    this.open(this.width.input);
  }

  private apply(): void {
    const w = Math.round(this.width.input.valueAsNumber), s = this.engine.shapeSettings, line = s.kind === 'line' || s.kind === 'arrow';
    const h = line ? 0 : Math.round(this.height.input.valueAsNumber);
    if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || (!line && h < 1)) return;
    this.w = w;
    if (!line) this.h = h;
    this.close();
    const { x, y } = this.at;
    this.engine.drawShape({ x, y }, { x: x + w, y: y + h }, { x, y, w, h });
  }
}

import { cornerRadiiOf, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { checkRow, numberRow } from './controls';

/** Layer > Corner Radii: a rectangle shape's live corners, as Photoshop's Properties panel sets them. With Link
 *  Corners on, changing one changes all four; OK redraws the shape from its parameters as one step. */
export class CornersDialog extends Dialog {
  private id: string | null = null;
  private linked = true;
  private readonly corners = (['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const).map((label, i) => numberRow(`${label} (px)`, 0, 15000, 1, (v) => this.changed(i, v)));
  private readonly link = checkRow('Link corners', (v) => { this.linked = v; });

  constructor(private readonly engine: Engine) {
    super('Corner Radii', 320);
    this.body.append(this.link.el, ...this.corners.map((c) => c.el));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  private changed(i: number, v: number): void {
    if (!this.linked || !Number.isFinite(v)) return;
    this.corners.forEach((c, k) => { if (k !== i) c.set(v); });
  }

  show(): void {
    const l = this.engine.current?.activeLayer;
    if (this.isOpen) return;
    if (!l?.shape || l.shape.kind === 'Ellipse') { this.engine.notice('Select a rectangle shape layer to set its corners.'); return; }
    this.id = l.id;
    const radii = cornerRadiiOf(l.shape) ?? new Array(4).fill(Number(l.shape.cornerRadius) || 0);
    this.linked = radii.every((v) => v === radii[0]);
    this.link.set(this.linked);
    this.corners.forEach((c, i) => c.set(Math.round(radii[i])));
    this.open(this.corners[0].input);
  }

  private apply(): void {
    const values = this.corners.map((c) => Number(c.input.value));
    if (!values.every(Number.isFinite)) return;
    this.close();
    if (this.id) this.engine.setShapeCorners(this.id, values);
  }
}

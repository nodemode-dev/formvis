import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';

/** Paths > Clipping Path: picks the saved path that marks the picture's clipping outline, with a flatness in pixels,
 *  or none. Only one path carries the mark; it saves with the project. */
export class ClippingPathDialog extends Dialog {
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
  private readonly flat = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="100" step="0.1" value="0">');

  constructor(private readonly engine: Engine) {
    super('Clipping Path', 340);
    this.field('Path', this.pick);
    this.field('Flatness (px)', this.flat);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    if (this.isOpen) return;
    const saved = this.engine.paths.list.filter((n) => !n.work && !n.shape && !n.mask);
    if (!saved.length) { this.engine.notice('Save a path first: double-click the Work Path to name it.'); return; }
    this.pick.replaceChildren(new Option('None', ''), ...saved.map((n) => new Option(n.name, n.id)));
    const cur = saved.find((n) => n.clipping !== undefined);
    this.pick.value = cur?.id ?? '';
    this.flat.value = String(cur?.clipping ?? 0);
    this.open(this.pick);
  }

  private apply(): void {
    this.close();
    this.engine.setClippingPath(this.pick.value || null, Number(this.flat.value) || 0);
  }
}

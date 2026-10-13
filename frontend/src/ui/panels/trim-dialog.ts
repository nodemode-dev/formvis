import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';

/** Image > Trim: what to trim away, as Photoshop offers it. */
export class TrimDialog extends Dialog {
  private readonly basis = el<HTMLSelectElement>('<select class="cv-input"><option value="transparent">Transparent pixels</option><option value="topLeft">Top left pixel colour</option><option value="bottomRight">Bottom right pixel colour</option></select>');

  constructor(private readonly engine: Engine) {
    super('Trim', 360);
    this.field('Based on', this.basis);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => {
      const b = this.basis.value === 'topLeft' || this.basis.value === 'bottomRight' ? this.basis.value : 'transparent';
      this.close();
      this.engine.trim(b);
    });
    this.remember();
  }

  show(): void { if (this.engine.current) this.open(); }
}

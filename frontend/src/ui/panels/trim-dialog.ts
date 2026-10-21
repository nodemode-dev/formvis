import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow } from './controls';

/** Image > Trim: what to trim away. */
export class TrimDialog extends Dialog {
  private readonly basis = el<HTMLSelectElement>('<select class="cv-input"><option value="transparent">Transparent pixels</option><option value="topLeft">Top left pixel color</option><option value="bottomRight">Bottom right pixel color</option></select>');

  constructor(private readonly engine: Engine) {
    super('Trim', 360);
    this.field('Based on', this.basis);
    for (const s of this.sides) this.body.append(s.row.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => {
      const b = this.basis.value === 'topLeft' || this.basis.value === 'bottomRight' ? this.basis.value : 'transparent';
      const on = (key: string): boolean => this.sides.find((s) => s.key === key)?.row.el.querySelector('input')?.checked !== false;
      this.close();
      this.engine.trim(b, { top: on('top'), bottom: on('bottom'), left: on('left'), right: on('right') });
    });
    this.remember();
  }

  private readonly sides = (['top', 'bottom', 'left', 'right'] as const).map((key) => {
    const row = checkRow(`Trim away ${key}`, () => undefined);
    row.set(true);
    return { key: key as string, row };
  });

  show(): void { if (this.engine.current) this.open(); }
}

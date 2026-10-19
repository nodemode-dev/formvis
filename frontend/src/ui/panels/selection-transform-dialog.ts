import type { Engine } from '../../engine';
import type { SelectionWarp } from '../../engine/selection-warp';
import { Dialog } from '../dialogs';
import { el } from '../dom';

const REFS = ['Top left', 'Top', 'Top right', 'Left', 'Centre', 'Right', 'Bottom left', 'Bottom', 'Bottom right'];

/** Select > Transform Selection Numerically: a reference point, move, scale, angle, skew, perspective and a matrix for the
 *  outline alone, applied as one step. Every field is built once; OK reads them. */
export class SelectionTransformDialog extends Dialog {
  private readonly ref = el<HTMLSelectElement>(`<select class="cv-input">${REFS.map((l, i) => `<option value="${i}"${i === 4 ? ' selected' : ''}>${l}</option>`).join('')}</select>`);
  private readonly fields = new Map<keyof SelectionWarp, HTMLInputElement>();
  private readonly matrix = el<HTMLInputElement>('<input class="cv-input" type="text" value="1 0 0 1 0 0" aria-label="Matrix a b c d e f">');
  private readonly smooth = el<HTMLSelectElement>('<select class="cv-input"><option value="1">Bilinear</option><option value="0">Nearest Neighbour</option></select>');

  constructor(private readonly engine: Engine) {
    super('Transform Selection', 380);
    this.field('Reference point', this.ref);
    const rows: ReadonlyArray<readonly [keyof SelectionWarp, string, number, number, number, number]> = [
      ['moveX', 'Move X (px)', 0, -100000, 100000, 1], ['moveY', 'Move Y (px)', 0, -100000, 100000, 1],
      ['scaleX', 'Width (%)', 100, 1, 10000, 1], ['scaleY', 'Height (%)', 100, 1, 10000, 1],
      ['angle', 'Angle (deg)', 0, -360, 360, 0.1], ['skewH', 'Skew horizontal (deg)', 0, -85, 85, 0.1], ['skewV', 'Skew vertical (deg)', 0, -85, 85, 0.1],
      ['perspH', 'Perspective horizontal (%)', 0, -90, 90, 1], ['perspV', 'Perspective vertical (%)', 0, -90, 90, 1],
    ];
    for (const [key, label, def, min, max, step] of rows) {
      const input = el<HTMLInputElement>(`<input class="cv-input" type="number" min="${min}" max="${max}" step="${step}" value="${def}">`);
      this.fields.set(key, input);
      this.field(label, input);
    }
    this.field('Matrix a b c d e f', this.matrix);
    this.field('Interpolation', this.smooth);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => { const o = this.options(); this.close(); this.engine.transformSelectionBy(o); });
    this.remember();
  }

  options(): SelectionWarp {
    const o: Record<string, unknown> = { ref: Number(this.ref.value), smooth: this.smooth.value === '1' };
    for (const [key, input] of this.fields) { const v = Number(input.value); if (Number.isFinite(v)) o[key] = v; }
    const m = this.matrix.value.trim().split(/[\s,]+/).map(Number);
    if (m.length === 6 && m.every(Number.isFinite) && m.join(' ') !== '1 0 0 1 0 0') o.matrix = m;
    return o as SelectionWarp;
  }

  show(): void {
    if (!this.engine.current?.selection) { this.engine.notice('Make a selection first.'); return; }
    this.open();
  }
}

import type { ColourView } from '../colour';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** View > 32-bit Preview Options: Exposure and Gamma for how a 32-bit document is shown. The view changes as the
 *  numbers do; Cancel puts back what was set when the dialog opened. The document is never touched. */
export class Preview32Dialog extends Dialog {
  private readonly exposure = el<HTMLInputElement>('<input class="cv-input" type="number" min="-10" max="10" step="0.1" value="0" aria-label="Exposure">');
  private readonly gamma = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.01" max="10" step="0.05" value="1" aria-label="Gamma">');
  private before = { exposure: 0, gamma: 1 };
  constructor(private readonly colour: ColourView) {
    super('32-bit Preview Options', 380);
    const row = (label: string, c: HTMLElement): HTMLElement => { const r = el('<label class="cv-dialog-row"><span></span></label>'); setText(r.querySelector('span') as HTMLElement, label); r.append(c); return r; };
    const note = el('<p class="cv-note"></p>');
    setText(note, 'Method: Exposure and Gamma. Changes the view only; the 32-bit picture and its files keep their values.');
    this.body.append(note, row('Exposure', this.exposure), row('Gamma', this.gamma));
    for (const i of [this.exposure, this.gamma]) i.addEventListener('input', () => this.apply());
    this.button('Reset', 'ghost', () => { this.exposure.value = '0'; this.gamma.value = '1'; this.apply(); });
    this.button('Cancel', 'ghost', () => { this.colour.setPreview(this.before.exposure, this.before.gamma); this.close(); });
    this.button('OK', 'primary', () => this.close());
    this.remember();
  }
  show(): void {
    this.before = { exposure: this.colour.exposure, gamma: this.colour.gamma };
    this.exposure.value = String(this.colour.exposure);
    this.gamma.value = String(this.colour.gamma);
    this.open();
  }
  private apply(): void {
    const e = Number(this.exposure.value), g = Number(this.gamma.value);
    this.colour.setPreview(Number.isFinite(e) ? e : 0, Number.isFinite(g) && g > 0 ? g : 1);
  }
}

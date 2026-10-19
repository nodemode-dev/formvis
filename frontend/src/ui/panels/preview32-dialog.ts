import type { ColourView } from '../colour';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** View > 32-bit Preview Options: Exposure and Gamma for how a 32-bit document is shown. The view changes as the
 *  numbers do; Cancel puts back what was set when the dialog opened. The document is never touched. */
export class Preview32Dialog extends Dialog {
  private readonly exposure = el<HTMLInputElement>('<input class="cv-input" type="number" min="-10" max="10" step="0.1" value="0" aria-label="Exposure">');
  private readonly gamma = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.01" max="10" step="0.05" value="1" aria-label="Gamma">');
  private readonly method = el<HTMLSelectElement>('<select class="cv-input" aria-label="Method"><option value="gamma">Exposure and Gamma</option><option value="compress">Highlight Compression</option></select>');
  private before: { exposure: number; gamma: number; method: 'gamma' | 'compress' } = { exposure: 0, gamma: 1, method: 'gamma' };
  constructor(private readonly colour: ColourView) {
    super('32-bit Preview Options', 380);
    const row = (label: string, c: HTMLElement): HTMLElement => { const r = el('<label class="cv-dialog-row"><span></span></label>'); setText(r.querySelector('span') as HTMLElement, label); r.append(c); return r; };
    const note = el('<p class="cv-note"></p>');
    setText(note, 'Highlight Compression brings light above white into the display range and keeps hue; Exposure and Gamma works on the 8-bit view. Changes the view only; the 32-bit picture and its files keep their values.');
    this.body.append(note, row('Method', this.method), row('Exposure', this.exposure), row('Gamma', this.gamma));
    for (const i of [this.exposure, this.gamma, this.method]) i.addEventListener('input', () => this.apply());
    this.button('Reset', 'ghost', () => { this.exposure.value = '0'; this.gamma.value = '1'; this.method.value = 'gamma'; this.apply(); });
    this.button('Cancel', 'ghost', () => { this.colour.setPreview(this.before.exposure, this.before.gamma, this.before.method); this.close(); });
    this.button('OK', 'primary', () => this.close());
    this.remember();
  }
  show(): void {
    this.before = { exposure: this.colour.exposure, gamma: this.colour.gamma, method: this.colour.method };
    this.method.value = this.colour.method;
    this.exposure.value = String(this.colour.exposure);
    this.gamma.value = String(this.colour.gamma);
    this.open();
  }
  private apply(): void {
    const e = Number(this.exposure.value), g = Number(this.gamma.value);
    this.colour.setPreview(Number.isFinite(e) ? e : 0, Number.isFinite(g) && g > 0 ? g : 1, this.method.value === 'compress' ? 'compress' : 'gamma');
  }
}

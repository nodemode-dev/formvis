import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** Layer > Color Match (1.51.3): the active layer's colours matched to what is beneath it or around it, as a Curves
 *  layer clipped to it; its opacity is the amount, changed afterwards in the Layers panel. With that Color Match layer
 *  active, it matches again the layer it is clipped to. */
export class ColorMatchDialog extends Dialog {
  private readonly to = el<HTMLSelectElement>('<select class="cv-input" aria-label="Match to"><option value="beneath">What is beneath it</option><option value="around">What is around it</option></select>');
  private readonly amount = el<HTMLInputElement>('<input type="range" min="0" max="100" step="1" value="100" aria-label="Amount">');
  private readonly amountText = el('<span class="cv-note"></span>');
  readonly luminance = el<HTMLInputElement>('<input type="range" min="0" max="200" step="1" value="100" aria-label="Luminance">');
  readonly intensity = el<HTMLInputElement>('<input type="range" min="0" max="200" step="1" value="100" aria-label="Color Intensity">');
  readonly neutralize = el<HTMLInputElement>('<input type="checkbox" aria-label="Neutralize">');
  private readonly note = el('<p class="cv-note" role="status"></p>');

  constructor(private readonly engine: Engine) {
    super('Color Match', 400);
    const row = (label: string, ...c: HTMLElement[]): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(...c); return r; };
    this.amount.addEventListener('input', () => setText(this.amountText, `${this.amount.value}%`));
    this.body.append(row('Match to', this.to), row('Amount', this.amount, this.amountText), row('Luminance', this.luminance), row('Color Intensity', this.intensity), row('Neutralize', this.neutralize), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Apply', 'primary', () => this.apply());
    this.remember();
  }

  /** The layer to match: the active one, or the one a Color Match layer is clipped to. */
  private target(): string | null {
    const l = this.engine.activeLayer;
    if (!l) return null;
    return l.name === 'Color Match' && l.adjustment && l.clipId ? l.clipId : l.id;
  }

  show(): void {
    const id = this.target(), l = id ? this.engine.current?.layer(id) : null;
    setText(this.amountText, `${this.amount.value}%`);
    setText(this.note, l ? `Matches "${l.name}" without changing its pixels: a Curves layer clipped to it, whose opacity is the amount.` : 'Choose a pixel layer first.');
    this.open();
  }

  private apply(): void {
    const id = this.target();
    if (!id) return;
    if (this.engine.colorMatch(id, this.to.value === 'around' ? 'around' : 'beneath', Number(this.amount.value) / 100, { luminance: Number(this.luminance.value), intensity: Number(this.intensity.value), neutralize: this.neutralize.checked })) this.close();
    else setText(this.note, 'That layer cannot be matched: see the message.');
  }
}

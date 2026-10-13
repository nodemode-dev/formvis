import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';

/** Layer > New Film Layer > Light Leak or Frame (1.51.6, film looks): the choices, then a pixel layer made from them. */
export class FilmLayerDialog extends Dialog {
  private kind: 'leak' | 'frame' = 'leak';
  private readonly leakRows = el('<div class="cv-panel-section"></div>');
  private readonly frameRows = el('<div class="cv-panel-section"></div>');
  private readonly color = el<HTMLSelectElement>('<select class="cv-input" aria-label="Color"><option value="amber">Amber</option><option value="red">Red</option><option value="magenta">Magenta</option><option value="gold">Gold</option></select>');
  private readonly from = el<HTMLSelectElement>('<select class="cv-input" aria-label="From"><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="corner">Corner</option></select>');
  private readonly size = el<HTMLInputElement>('<input class="cv-input" type="number" min="10" max="150" step="5" value="60" aria-label="Size">');
  private readonly style = el<HTMLSelectElement>('<select class="cv-input" aria-label="Style"><option value="film">Film edge</option><option value="white">White border</option><option value="line">Thin line</option></select>');
  private readonly width = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.2" max="25" step="0.1" value="4" aria-label="Width">');

  constructor(private readonly engine: Engine) {
    super('Light Leak', 360);
    const row = (label: string, c: HTMLElement): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(c); return r; };
    this.leakRows.append(row('Color', this.color), row('From', this.from), row('Size (%)', this.size));
    this.frameRows.append(row('Style', this.style), row('Width (%)', this.width));
    this.body.append(this.leakRows, this.frameRows);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.make());
    this.remember();   // each of the two looks (kept under its own title) opens as it was last made
  }

  show(kind: 'leak' | 'frame'): void {
    if (!this.engine.current) return;
    this.kind = kind;
    this.setTitle(kind === 'leak' ? 'Light Leak' : 'Frame');
    this.leakRows.hidden = kind !== 'leak';
    this.frameRows.hidden = kind !== 'frame';
    this.open();
  }

  private make(): void {
    const ok = this.kind === 'leak'
      ? this.engine.addFilmLayer({ kind: 'leak', color: this.color.value as 'amber', from: this.from.value as 'left', size: Number(this.size.value) || 60 })
      : this.engine.addFilmLayer({ kind: 'frame', style: this.style.value as 'film', width: Number(this.width.value) || 4 });
    if (ok) this.close();
  }
}

import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { t } from '../i18n';

export type SvgBring = 'pixels' | 'smart' | 'shapes';
export interface SvgChoice { width: number; height: number; how: SvgBring }
type SizeBy = 'width' | 'height' | 'percent' | 'ppi';

const LIMIT_SIDE = 30000;

/** The question an SVG file asks as it opens, is placed, dropped or pasted: how big it comes in (a width or height in
 *  pixels, a percent of the size it declares, or a resolution against its physical size) and how it comes in (pixels, a
 *  smart layer redrawn from its source when scaled, or editable shape layers). Built once; showing it only sets text. */
export class SvgImportDialog extends Dialog {
  private readonly info = el('<p class="cv-note"></p>');
  private readonly by = el<HTMLSelectElement>('<select class="cv-input" aria-label="Size by" data-role="svg-size-by"><option value="percent"></option><option value="width"></option><option value="height"></option><option value="ppi"></option></select>');
  private readonly value = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" step="any" value="100" aria-label="Value" data-role="svg-size-value">');
  private readonly unit = el('<span class="cv-note"></span>');
  private readonly how = el<HTMLSelectElement>('<select class="cv-input" aria-label="Bring in as" data-role="svg-bring-as"><option value="pixels"></option><option value="smart"></option><option value="shapes"></option></select>');
  private readonly result = el('<p class="cv-note cv-svg-result" role="status"></p>');
  private readonly go: HTMLButtonElement;
  private size = { width: 1024, height: 1024 };
  private inches: { width: number; height: number } | null = null;
  private answer: ((v: SvgChoice | null) => void) | null = null;

  constructor() {
    super('Import SVG', 440);
    const byRow = el('<label class="cv-dialog-row"><span>Size by</span></label>'); byRow.append(this.by);
    const valueRow = el('<label class="cv-dialog-row"><span>Value</span></label>'); valueRow.append(this.value, this.unit);
    const howRow = el('<label class="cv-dialog-row"><span>Bring in as</span></label>'); howRow.append(this.how);
    this.body.append(this.info, byRow, valueRow, howRow, this.result);
    this.button('Cancel', 'ghost', () => this.done(null));
    this.go = this.button('Import', 'primary', () => { const c = this.choice(); if (c) this.done(c); });
    for (const c of [this.by, this.value, this.how]) { c.addEventListener('input', () => this.paint()); c.addEventListener('change', () => this.paint()); }
    this.value.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !this.go.disabled) { e.preventDefault(); this.go.click(); } });
    this.remember();
  }

  private pixels(): { width: number; height: number } | null {
    const v = Number(this.value.value), s = this.size, mode = this.by.value as SizeBy;
    if (!(v > 0)) return null;
    const width = mode === 'width' ? v : mode === 'height' ? v * s.width / s.height : mode === 'percent' ? s.width * v / 100 : this.inches ? this.inches.width * v : 0;
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(width * s.height / s.width));
    return width > 0 && w <= LIMIT_SIDE && h <= LIMIT_SIDE ? { width: w, height: h } : null;
  }

  private choice(): SvgChoice | null {
    const how = this.how.value as SvgBring, px = this.pixels();
    return px ? { ...px, how } : how === 'shapes' ? { width: this.size.width, height: this.size.height, how } : null;
  }

  private paint(): void {
    const mode = this.by.value as SizeBy, px = this.pixels(), shapes = this.how.value === 'shapes';
    setText(this.unit, mode === 'percent' ? '%' : mode === 'ppi' ? t('pixels per inch') : 'px');
    this.by.disabled = shapes;
    this.value.disabled = shapes;
    setText(this.result, shapes ? t('Shape layers use the size the file declares.') : px ? `${t('Comes in at')} ${px.width} ${t('by')} ${px.height} px` : t('Enter a size the document can hold.'));
    this.go.disabled = !shapes && !px;
  }

  show(name: string, size: { width: number; height: number } | null, inches: { width: number; height: number } | null): Promise<SvgChoice | null> {
    this.size = size ?? { width: 1024, height: 1024 };
    this.inches = inches;
    const labels = ['Percent of its size', 'Width in pixels', 'Height in pixels', 'Pixels per inch'], how = ['Pixels', 'Smart layer, sharp when scaled', 'Editable shape layers'];
    labels.forEach((l, i) => setText(this.by.options[i], t(l)));
    how.forEach((l, i) => setText(this.how.options[i], t(l)));
    this.by.options[3].disabled = !inches;
    const decl = `${Math.round(this.size.width)} ${t('by')} ${Math.round(this.size.height)} px`;
    setText(this.info, `${name}: ${size ? `${t('declares')} ${decl}` : t('declares no size, so 1024 by 1024 px is assumed')}${inches ? `, ${inches.width.toFixed(2)} ${t('by')} ${inches.height.toFixed(2)} in` : ''}.`);
    if (this.by.value === 'ppi' && !inches) this.by.value = 'percent';
    this.open();
    if (this.by.value === 'ppi' && !inches) this.by.value = 'percent';
    this.paint();
    return new Promise((res) => { this.answer = res; });
  }

  private done(v: SvgChoice | null): void { const a = this.answer; this.answer = null; this.close(); a?.(v); }
  close(): void { if (this.answer) { const a = this.answer; this.answer = null; a(null); } super.close(); }
}

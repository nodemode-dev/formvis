import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText, setValue } from '../dom';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

/** File > Export > Artboards to PDF (DEV_PLAN 29.4): one multipage PDF, a page per artboard in the Layers order. Every
 *  row exists from the start and keeps its place; rows that do not apply are dimmed and disabled, never hidden. */
export interface ArtboardPdfSettings { name: string; jpeg: boolean; quality: number; icc: boolean; contentsOnly: boolean }
export const DEFAULT_ARTBOARD_PDF: ArtboardPdfSettings = { name: '', jpeg: false, quality: 90, icc: true, contentsOnly: false };

export class ArtboardPdfDialog extends Dialog {
  private s: ArtboardPdfSettings = { ...DEFAULT_ARTBOARD_PDF };
  private readonly nameInput = el('<input class="cv-input" type="text" maxlength="100" aria-label="File name">') as HTMLInputElement;
  private readonly nameRow = el('<label class="cv-field"><span>File name</span></label>');
  private readonly encodingRow: Row<string>;
  private readonly qualityRow: Row<number>;
  private readonly iccRow: Row<boolean>;
  private readonly contentsRow: Row<boolean>;
  private readonly note = el('<p class="cv-note"></p>');

  constructor(private readonly engine: Engine, private readonly run: (s: ArtboardPdfSettings) => void) {
    super('Export Artboards to PDF', 420);
    this.nameRow.append(this.nameInput);
    this.nameInput.addEventListener('input', () => { this.s = { ...this.s, name: this.nameInput.value }; this.sync(); });
    this.encodingRow = selectRow('Encoding', [['zip', 'Lossless'], ['jpeg', 'JPEG']], (v) => { this.s = { ...this.s, jpeg: v === 'jpeg' }; this.sync(); });
    this.qualityRow = sliderRow('Quality (%)', 1, 100, 1, (v) => { this.s = { ...this.s, quality: v }; this.sync(); });
    this.iccRow = checkRow('Include ICC profile', (v) => { this.s = { ...this.s, icc: v }; this.sync(); });
    this.contentsRow = checkRow('Contents only (no artboard background)', (v) => { this.s = { ...this.s, contentsOnly: v }; this.sync(); });
    this.body.append(this.nameRow, this.encodingRow.el, this.qualityRow.el, this.iccRow.el, this.contentsRow.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Export', 'primary', () => { this.close(); this.run({ ...this.s, name: this.s.name.trim() }); });
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    this.s = { ...this.s, name: p.name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'Untitled' };
    this.sync();
    this.open();
  }

  private sync(): void {
    const p = this.engine.current, s = this.s;
    if (document.activeElement !== this.nameInput) setValue(this.nameInput, s.name);
    this.encodingRow.set(s.jpeg ? 'jpeg' : 'zip');
    this.qualityRow.set(s.quality);
    const profiled = !!p?.doc.profile;
    this.iccRow.set(profiled && s.icc);
    this.contentsRow.set(s.contentsOnly);
    this.qualityRow.el.classList.toggle('is-off', !s.jpeg);
    for (const i of this.qualityRow.el.querySelectorAll('input')) i.disabled = !s.jpeg;
    this.iccRow.el.classList.toggle('is-off', !profiled);
    for (const i of this.iccRow.el.querySelectorAll('input')) i.disabled = !profiled;
    const n = p ? this.engine.artboards(p).length : 0;
    setText(this.note, n ? `${n} page${n === 1 ? '' : 's'}, in the Layers order, at ${p?.doc.resolution ?? 72} dpi.${profiled ? '' : ' This document has no color profile to include.'}` : 'This document has no artboards.');
  }
}

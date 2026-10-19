import { Dialog } from '../dialogs';
import { el } from '../dom';
import { QUICK_FORMATS, cleanExportPrefs, loadExportPrefs, saveExportPrefs, type ExportPrefs, type QuickFormat } from '../../io/export-prefs';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

/** File > Export > Export Preferences: the format, quality, prompt metadata and folder Quick Export uses. Every row
 *  exists from the start; Quality is disabled for PNG and the folder when the app has no exports folder. */
export class ExportPrefsDialog extends Dialog {
  private p: ExportPrefs = loadExportPrefs();
  private readonly formatRow: Row<string>;
  private readonly qualityRow: Row<number>;
  private readonly promptRow: Row<boolean>;
  private readonly maximizeRow: Row<boolean>;
  private readonly folderInput = el('<input class="cv-input" type="text" maxlength="60" aria-label="Quick Export folder" placeholder="Ask each time">') as HTMLInputElement;
  private readonly folderField = el('<label class="cv-field"><span>Folder in the exports folder</span></label>');
  private readonly note = el('<p class="cv-note">Quick Export and Layer > Quick Export write with these settings, with no dialog.</p>');

  constructor(private readonly desktop: () => boolean) {
    super('Export Preferences', 420);
    this.formatRow = selectRow('Quick Export format', QUICK_FORMATS, (v) => { this.p = cleanExportPrefs({ ...this.p, format: v as QuickFormat }); this.sync(); });
    this.qualityRow = sliderRow('Quality (%)', 1, 100, 1, (v) => { this.p = cleanExportPrefs({ ...this.p, quality: v }); this.sync(); });
    this.promptRow = checkRow('Prompt and recipe in PNG files', (v) => { this.p = cleanExportPrefs({ ...this.p, promptMeta: v }); this.sync(); });
    this.maximizeRow = checkRow('Maximize PSD and PSB compatibility', (v) => { this.p = cleanExportPrefs({ ...this.p, maximizePsd: v }); this.sync(); });
    this.folderField.append(this.folderInput);
    this.folderInput.addEventListener('input', () => { this.p = cleanExportPrefs({ ...this.p, folder: this.folderInput.value }); });
    this.body.append(this.formatRow.el, this.qualityRow.el, this.promptRow.el, this.folderField, this.maximizeRow.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Save', 'primary', () => { saveExportPrefs(this.p); this.close(); });
  }

  show(): void {
    if (this.isOpen) return;
    this.p = loadExportPrefs();
    this.sync();
    this.open();
  }

  private sync(): void {
    const p = this.p, lossy = p.format !== 'png', desk = this.desktop();
    this.formatRow.set(p.format);
    this.qualityRow.set(p.quality);
    this.promptRow.set(p.promptMeta);
    this.maximizeRow.set(p.maximizePsd);
    this.qualityRow.el.classList.toggle('is-off', !lossy);
    for (const i of this.qualityRow.el.querySelectorAll('input')) i.disabled = !lossy;
    this.promptRow.el.classList.toggle('is-off', p.format !== 'png');
    for (const i of this.promptRow.el.querySelectorAll('input')) i.disabled = p.format !== 'png';
    this.folderField.classList.toggle('is-off', !desk);
    this.folderInput.disabled = !desk;
    if (document.activeElement !== this.folderInput) this.folderInput.value = p.folder;
  }
}

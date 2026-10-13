import type { Engine } from '../../engine';
import { DEFAULT_LAYER_EXPORT, LAYER_FILE_FORMATS, LAYER_FILE_LOSSY, exportableLayers, layerFileName, safeName, type LayerExportSettings, type LayerFileFormat } from '../../io/layer-export';
import { Dialog } from '../dialogs';
import { el, setText, setValue } from '../dom';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

/** File > Export > Layers to Files (DEV_PLAN 29.1) and Artboards to Files: where the files go, their name prefix, which
 *  layers, the file type and quality, trimming and the profile, with the count and the first file's name shown. Every
 *  row exists from the start and keeps its place; rows that do not apply are dimmed and disabled, never hidden. */
export class LayerExportDialog extends Dialog {
  private s: LayerExportSettings = { ...DEFAULT_LAYER_EXPORT };
  private readonly destInput = el('<input class="cv-input" type="text" maxlength="100" aria-label="Destination folder">') as HTMLInputElement;
  private readonly destRow = el('<label class="cv-field"><span>Destination</span></label>');
  private readonly prefixInput = el('<input class="cv-input" type="text" maxlength="60" aria-label="File name prefix">') as HTMLInputElement;
  private readonly prefixRow = el('<label class="cv-field"><span>File name prefix</span></label>');
  private readonly visibleRow: Row<boolean>;
  private readonly formatRow: Row<string>;
  private readonly qualityRow: Row<number>;
  private readonly trimRow: Row<boolean>;
  private readonly iccRow: Row<boolean>;
  private readonly note = el('<p class="cv-note"></p>');

  /** `desktop` says whether files are written to a folder by the engine (true) or downloaded as one zip (false). */
  constructor(private readonly engine: Engine, private readonly desktop: () => boolean, private readonly run: (s: LayerExportSettings) => void) {
    super('Export Layers to Files', 420);
    this.destRow.append(this.destInput);
    this.prefixRow.append(this.prefixInput);
    this.destInput.addEventListener('input', () => { this.s = { ...this.s, folder: this.destInput.value }; this.sync(); });
    this.prefixInput.addEventListener('input', () => { this.s = { ...this.s, prefix: this.prefixInput.value }; this.sync(); });
    this.visibleRow = checkRow('Visible layers only', (v) => { this.s = { ...this.s, visibleOnly: v }; this.sync(); });
    this.formatRow = selectRow('File type', LAYER_FILE_FORMATS, (v) => { this.s = { ...this.s, format: v as LayerFileFormat }; this.sync(); });
    this.qualityRow = sliderRow('Quality (%)', 1, 100, 1, (v) => { this.s = { ...this.s, quality: v }; this.sync(); });
    this.trimRow = checkRow('Trim layers', (v) => { this.s = { ...this.s, trim: v }; this.sync(); });
    this.iccRow = checkRow('Include ICC profile', (v) => { this.s = { ...this.s, icc: v }; this.sync(); });
    this.body.append(this.destRow, this.prefixRow, this.visibleRow.el, this.formatRow.el, this.qualityRow.el, this.trimRow.el, this.iccRow.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Export', 'primary', () => { this.close(); this.run({ ...this.s, prefix: this.s.prefix.trim(), folder: this.s.folder.trim() }); });
    this.remember();   // the type, quality, visible-only, trim and profile; the name and folder come from the document
  }

  /** Opens for the layers (`artboards` false) or for the artboards of the open document. */
  show(artboards = false): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const name = p.name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'Untitled';
    this.s = { ...this.s, artboards, prefix: this.s.prefix || name, folder: this.s.folder || `${safeName(name, 60, 'Untitled')} ${artboards ? 'artboards' : 'layers'}` };
    this.setTitle(artboards ? 'Export Artboards to Files' : 'Export Layers to Files');
    this.sync();
    this.open();
  }

  private sync(): void {
    const p = this.engine.current, s = this.s, boards = s.artboards, desktop = this.desktop();
    if (document.activeElement !== this.destInput) setValue(this.destInput, desktop ? s.folder : 'Zip download');
    if (document.activeElement !== this.prefixInput) setValue(this.prefixInput, s.prefix);
    this.destInput.disabled = !desktop;
    this.visibleRow.set(s.visibleOnly);
    this.formatRow.set(s.format);
    this.qualityRow.set(s.quality);
    this.trimRow.set(s.trim);
    this.iccRow.set(s.icc);
    this.visibleRow.el.classList.toggle('is-off', boards);
    this.trimRow.el.classList.toggle('is-off', boards);
    this.qualityRow.el.classList.toggle('is-off', !LAYER_FILE_LOSSY.has(s.format));
    this.iccRow.el.classList.toggle('is-off', s.format === 'psd');
    for (const i of this.visibleRow.el.querySelectorAll('input')) i.disabled = boards;
    for (const i of this.trimRow.el.querySelectorAll('input')) i.disabled = boards;
    for (const i of this.qualityRow.el.querySelectorAll('input')) i.disabled = !LAYER_FILE_LOSSY.has(s.format);
    for (const i of this.iccRow.el.querySelectorAll('input')) i.disabled = s.format === 'psd';
    if (!p) return;
    const n = boards ? this.engine.artboards(p).length : exportableLayers(p.doc, s.visibleOnly).length;
    const first = layerFileName(s.prefix.trim() || 'Untitled', 0, (boards ? this.engine.artboards(p)[0]?.name : exportableLayers(p.doc, s.visibleOnly)[0]?.name) ?? 'layer', s.format);
    setText(this.note, n ? `${n} file${n === 1 ? '' : 's'} · ${first}${desktop ? '' : ' · in one zip'}` : boards ? 'This document has no artboards.' : 'There are no layers to export.');
  }
}

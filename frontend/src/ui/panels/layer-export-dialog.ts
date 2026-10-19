import type { Engine } from '../../engine';
import { DEFAULT_LAYER_EXPORT, LAYER_FILE_FORMATS, LAYER_FILE_LOSSY, exportableLayers, layerFileName, safeName, type LayerExportSettings, type LayerFileFormat } from '../../io/layer-export';
import { outFolderAvailable, pickOutFolder } from '../../io/out-folder';
import { Dialog } from '../dialogs';
import { el, patchList, setText, setValue } from '../dom';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

/** File > Export > Layers to Files (DEV_PLAN 29.1) and Artboards to Files: where the files go, their name prefix, which
 *  layers, the file type and quality, trimming and the profile, with the count and the first file's name shown. Every
 *  row exists from the start and keeps its place; rows that do not apply are dimmed and disabled, never hidden. */
export class LayerExportDialog extends Dialog {
  private s: LayerExportSettings = { ...DEFAULT_LAYER_EXPORT };
  private readonly destInput = el('<input class="cv-input" type="text" maxlength="100" aria-label="Destination folder">') as HTMLInputElement;
  private readonly destRow = el('<label class="cv-field"><span>Destination</span></label>');
  private readonly destPick = el('<button class="cv-btn" type="button">Choose folder...</button>') as HTMLButtonElement;
  private dir: FileSystemDirectoryHandle | undefined;
  private readonly prefixInput = el('<input class="cv-input" type="text" maxlength="60" aria-label="File name prefix">') as HTMLInputElement;
  private readonly prefixRow = el('<label class="cv-field"><span>File name prefix</span></label>');
  private readonly visibleRow: Row<boolean>;
  private readonly formatRow: Row<string>;
  private readonly qualityRow: Row<number>;
  private readonly tgaRow: Row<string>;
  private readonly dpxRow: Row<string>;
  private readonly trimRow: Row<boolean>;
  private readonly iccRow: Row<boolean>;
  private readonly selectedRow: Row<boolean>;
  private selectedOnly = false;
  private readonly pickRow = el('<div class="cv-field" role="group" aria-label="Which to export"><span>Include</span><div class="cv-size-checks"></div></div>');
  private readonly pickList = this.pickRow.lastElementChild as HTMLElement;
  private left = new Set<string>();
  private readonly note = el('<p class="cv-note"></p>');

  /** `desktop` says whether files are written to a folder by the engine (true) or downloaded as one zip (false). */
  constructor(private readonly engine: Engine, private readonly desktop: () => boolean, private readonly run: (s: LayerExportSettings) => void) {
    super('Export Layers to Files', 420);
    this.destRow.append(this.destInput, this.destPick);
    this.destPick.addEventListener('click', (e) => { e.preventDefault(); void pickOutFolder().then((h) => { if (h) { this.dir = h; this.sync(); } }); });
    this.prefixRow.append(this.prefixInput);
    this.destInput.addEventListener('input', () => { this.s = { ...this.s, folder: this.destInput.value }; this.sync(); });
    this.prefixInput.addEventListener('input', () => { this.s = { ...this.s, prefix: this.prefixInput.value }; this.sync(); });
    this.visibleRow = checkRow('Visible layers only', (v) => { this.s = { ...this.s, visibleOnly: v }; this.sync(); });
    this.formatRow = selectRow('File type', LAYER_FILE_FORMATS, (v) => { this.s = { ...this.s, format: v as LayerFileFormat }; this.sync(); });
    this.qualityRow = sliderRow('Quality (%)', 1, 100, 1, (v) => { this.s = { ...this.s, quality: v }; this.sync(); });
    this.tgaRow = selectRow('TGA bits per pixel', [['32', '32 (with transparency)'], ['24', '24']], (v) => { this.s = { ...this.s, tgaBits: v === '24' ? 24 : 32 }; this.sync(); });
    this.dpxRow = selectRow('DPX bits per channel', [['8', '8'], ['10', '10'], ['12', '12'], ['16', '16']], (v) => { this.s = { ...this.s, dpxBits: Number(v) as 8 | 10 | 12 | 16 }; this.sync(); });
    this.trimRow = checkRow('Trim layers', (v) => { this.s = { ...this.s, trim: v }; this.sync(); });
    this.iccRow = checkRow('Include ICC profile', (v) => { this.s = { ...this.s, icc: v }; this.sync(); });
    this.selectedRow = checkRow('Selected layers only', (v) => { this.selectedOnly = v; this.sync(); });
    this.pickList.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement, key = box.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (key) { if (box.checked) this.left.delete(key); else this.left.add(key); this.sync(); }
    });
    this.body.append(this.destRow, this.prefixRow, this.visibleRow.el, this.selectedRow.el, this.pickRow, this.formatRow.el, this.qualityRow.el, this.tgaRow.el, this.dpxRow.el, this.trimRow.el, this.iccRow.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Export', 'primary', () => { this.close(); this.run({ ...this.s, prefix: this.s.prefix.trim(), folder: this.s.folder.trim(), ids: this.chosen(), ...(this.dir && !this.desktop() ? { dir: this.dir } : {}) }); });
    this.remember();   // the type, quality, visible-only, trim and profile; the name and folder come from the document
  }

  /** Opens for the layers (`artboards` false) or for the artboards of the open document. */
  show(artboards = false, comps = false): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const name = p.name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'Untitled', what = comps ? 'comps' : artboards ? 'artboards' : 'layers';
    this.s = { ...this.s, artboards, comps, prefix: this.s.prefix || name, folder: this.s.folder || `${safeName(name, 60, 'Untitled')} ${what}` };
    this.left.clear();
    this.dir = undefined;
    this.selectedOnly = false;
    this.setTitle(comps ? 'Export Layer Comps to Files' : artboards ? 'Export Artboards to Files' : 'Export Layers to Files');
    this.sync();
    this.open();
  }

  /** The layers, artboards or comps to write: none listed when all of them are, a never-matching id when none is ticked. */
  private chosen(): string[] | undefined {
    const p = this.engine.current, s = this.s;
    if (!p) return undefined;
    if (s.artboards || s.comps) {
      const all = (s.comps ? (p.doc.comps ?? []) : this.engine.artboards(p)).map((x) => String(x.id)), ids = all.filter((id) => !this.left.has(id));
      return ids.length === all.length ? undefined : ids.length ? ids : ['none'];
    }
    if (!this.selectedOnly) return undefined;
    const ids = p.selectedIds.size ? [...p.selectedIds] : p.activeId ? [p.activeId] : [];
    return ids.length ? ids : ['none'];
  }

  private sync(): void {
    const p = this.engine.current, s = this.s, comps = !!s.comps, boards = s.artboards || comps, desktop = this.desktop();
    if (document.activeElement !== this.destInput) setValue(this.destInput, desktop ? s.folder : this.dir ? this.dir.name : 'Zip download');
    if (document.activeElement !== this.prefixInput) setValue(this.prefixInput, s.prefix);
    this.destInput.disabled = !desktop;
    this.destPick.disabled = desktop || !outFolderAvailable();
    this.visibleRow.set(s.visibleOnly);
    this.formatRow.set(s.format);
    this.qualityRow.set(s.quality);
    this.tgaRow.set(String(s.tgaBits ?? 32));
    this.dpxRow.set(String(s.dpxBits ?? 10));
    this.tgaRow.el.classList.toggle('is-off', s.format !== 'tga');
    this.dpxRow.el.classList.toggle('is-off', s.format !== 'dpx');
    for (const i of this.tgaRow.el.querySelectorAll('select')) i.disabled = s.format !== 'tga';
    for (const i of this.dpxRow.el.querySelectorAll('select')) i.disabled = s.format !== 'dpx';
    this.trimRow.set(s.trim);
    this.iccRow.set(s.icc);
    this.visibleRow.el.classList.toggle('is-off', boards);
    this.trimRow.el.classList.toggle('is-off', boards);
    this.qualityRow.el.classList.toggle('is-off', !LAYER_FILE_LOSSY.has(s.format));
    const noIcc = s.format === 'psd' || s.format === 'bmp' || s.format === 'tga' || s.format === 'dpx';
    this.iccRow.el.classList.toggle('is-off', noIcc);
    for (const i of this.visibleRow.el.querySelectorAll('input')) i.disabled = boards;
    for (const i of this.trimRow.el.querySelectorAll('input')) i.disabled = boards;
    for (const i of this.qualityRow.el.querySelectorAll('input')) i.disabled = !LAYER_FILE_LOSSY.has(s.format);
    for (const i of this.iccRow.el.querySelectorAll('input')) i.disabled = noIcc;
    if (!p) return;
    const all = comps ? (p.doc.comps ?? []) : s.artboards ? this.engine.artboards(p) : exportableLayers(p.doc, s.visibleOnly);
    this.selectedRow.set(this.selectedOnly);
    this.selectedRow.el.classList.toggle('is-off', boards);
    for (const i of this.selectedRow.el.querySelectorAll('input')) i.disabled = boards;
    this.pickRow.classList.toggle('is-off', !boards);
    patchList(this.pickList, boards ? all.map((x) => ({ id: String(x.id), name: x.name })) : [], {
      key: (x) => x.id,
      create: (x) => { const lab = el('<label><input type="checkbox" checked><span></span></label>'); setText(lab.lastElementChild, x.name); return lab; },
      update: (node, x) => { const box = node.firstElementChild as HTMLInputElement, on = !this.left.has(x.id); if (box.checked !== on) box.checked = on; box.disabled = !boards; setText(node.lastElementChild, x.name); },
    });
    const list = boards ? all.filter((x) => !this.left.has(String(x.id))) : this.selectedOnly ? all.filter((x) => p.selectedIds.has(x.id) || (!p.selectedIds.size && x.id === p.activeId)) : all, n = list.length;
    const first = layerFileName(s.prefix.trim() || 'Untitled', 0, list[0]?.name ?? 'layer', s.format);
    setText(this.note, n ? `${n} file${n === 1 ? '' : 's'} · ${first}${desktop || this.dir ? '' : ' · in one zip'}` : boards && all.length ? 'Tick at least one to export.' : comps ? 'This document has no layer comps.' : boards ? 'This document has no artboards.' : 'There are no layers to export.');
  }
}

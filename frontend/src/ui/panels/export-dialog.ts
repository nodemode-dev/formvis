import type { Engine } from '../../engine';
import { BUILTIN_EXPORT_PRESETS, EXPORT_FORMATS, LOSSY, clampSettings, exportName, exportSize, presetsFromStorage, type ExportFormat, type ExportPreset, type ExportSettings } from '../../io/export-presets';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { toast } from '../toast';
import { selectRow, sliderRow, type Row } from './controls';

const KEY = 'sonny.exportPresets';

/** File > Export As (Alt+Shift+Mod+W, as in Photoshop): format, quality, scale and the resulting size and file
 *  name, with presets. Built-in presets cover common cases; Save Preset keeps the current settings under a name in
 *  this browser, and Delete removes a saved one. Every row exists from the start and keeps its place; Quality is
 *  disabled for lossless formats rather than hidden. */
export class ExportDialog extends Dialog {
  private s: ExportSettings = { format: 'png', quality: 90, scale: 100 };
  private presetId = 'png-1x';
  private saved: ExportPreset[] = [];
  private readonly presetRow: Row<string>;
  private readonly formatRow: Row<string>;
  private readonly qualityRow: Row<number>;
  private readonly scaleRow: Row<number>;
  private readonly sizeNote = el('<p class="cv-note"></p>');
  private readonly nameInput = el('<input class="cv-input" type="text" maxlength="60" placeholder="Preset name">') as HTMLInputElement;
  private readonly deleteBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine, private readonly run: (s: ExportSettings) => void) {
    super('Export As', 420);
    this.presetRow = selectRow('Preset', [], (v) => this.pick(v));
    this.formatRow = selectRow('Format', EXPORT_FORMATS, (v) => { this.s = clampSettings({ ...this.s, format: v as ExportFormat }); this.custom(); });
    this.qualityRow = sliderRow('Quality (%)', 1, 100, 1, (v) => { this.s = clampSettings({ ...this.s, quality: v }); this.custom(); });
    this.scaleRow = sliderRow('Scale (%)', 10, 400, 1, (v) => { this.s = clampSettings({ ...this.s, scale: v }); this.custom(); }, { min: 1, max: 1000 });
    const save = el('<button class="cv-btn" type="button">Save Preset</button>') as HTMLButtonElement;
    this.deleteBtn = el('<button class="cv-btn" type="button">Delete Preset</button>') as HTMLButtonElement;
    save.addEventListener('click', () => this.savePreset());
    this.deleteBtn.addEventListener('click', () => this.deletePreset());
    const manage = el('<div class="cv-field"><span></span><div class="cv-row-actions"></div></div>');
    (manage.lastElementChild as HTMLElement).append(this.nameInput, save, this.deleteBtn);
    this.body.append(this.presetRow.el, this.formatRow.el, this.qualityRow.el, this.scaleRow.el, this.sizeNote, manage);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Export', 'primary', () => { this.close(); this.run({ ...this.s }); });
  }

  show(): void {
    if (this.isOpen || !this.engine.current) return;
    this.load();
    this.sync();
    this.open();
  }

  private all(): ExportPreset[] { return [...BUILTIN_EXPORT_PRESETS, ...this.saved]; }

  private load(): void {
    let raw: string | null = null;
    try { raw = localStorage.getItem(KEY); } catch { raw = null; }
    this.saved = presetsFromStorage(raw);
    const sel = this.presetRow.el.querySelector('select') as HTMLSelectElement;
    const want = [['', 'Custom'] as const, ...this.all().map((p) => [p.id, p.name] as const)];
    // Options are patched in place: same count and values keep their nodes.
    while (sel.options.length > want.length) sel.remove(sel.options.length - 1);
    want.forEach(([v, t], i) => { const o = sel.options[i] ?? sel.appendChild(document.createElement('option')); if (o.value !== v) o.value = v; if (o.textContent !== t) o.textContent = t; });
  }

  private store(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.saved.map(({ id, name, format, quality, scale }) => ({ id, name, format, quality, scale })))); } catch { toast('Presets cannot be saved in this browser.', 'error'); }
  }

  private pick(id: string): void {
    const p = this.all().find((x) => x.id === id);
    this.presetId = p ? p.id : '';
    if (p) this.s = clampSettings(p);
    this.sync();
  }

  private custom(): void { this.presetId = ''; this.sync(); }

  private savePreset(): void {
    const name = this.nameInput.value.trim();
    if (!name) { toast('Name the preset first.'); this.nameInput.focus(); return; }
    const existing = this.saved.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const preset: ExportPreset = { id: existing?.id ?? `user-${Date.now().toString(36)}`, name, ...this.s, builtin: false };
    this.saved = existing ? this.saved.map((p) => (p.id === existing.id ? preset : p)) : [...this.saved, preset];
    this.store();
    this.load();
    this.presetId = preset.id;
    this.nameInput.value = '';
    this.sync();
    toast(`Saved the preset "${name}".`);
  }

  private deletePreset(): void {
    const p = this.saved.find((x) => x.id === this.presetId);
    if (!p) return;
    this.saved = this.saved.filter((x) => x.id !== p.id);
    this.store();
    this.load();
    this.presetId = '';
    this.sync();
  }

  private sync(): void {
    const doc = this.engine.current?.doc, s = this.s;
    this.presetRow.set(this.presetId);
    this.formatRow.set(s.format);
    this.qualityRow.set(s.quality);
    this.scaleRow.set(s.scale);
    const lossy = LOSSY.has(s.format);
    this.qualityRow.el.classList.toggle('is-off', !lossy);
    for (const i of this.qualityRow.el.querySelectorAll('input')) i.disabled = !lossy;
    this.deleteBtn.disabled = !this.saved.some((x) => x.id === this.presetId);
    if (doc) { const z = exportSize(doc.width, doc.height, s.scale); setText(this.sizeNote, `${z.w} x ${z.h} px · ${exportName(this.engine.current?.name ?? 'Untitled', s)}`); }
  }
}

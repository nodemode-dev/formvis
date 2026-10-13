import type { Engine } from '../../engine';
import { exportLayout, BUILTIN_EXPORT_PRESETS, DPX_BITS, DPX_TRANSFERS, EXPORT_FORMATS, EXPORT_INTENTS, FORMAT_OPTIONS, ICO_SIZES, LOSSY, PROFILELESS, clampSettings, exportName, exportSize, presetsFromStorage, type DpxBits, type DpxTransfer, type ExportFormat, type ExportIntent, type ExportPreset, type ExportSettings } from '../../io/export-presets';
import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { recalled, remembered } from '../prefs';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

const BUILT_IN_PROFILES: ReadonlyArray<readonly [string, string]> = [['srgb', 'sRGB (web)'], ['display-p3', 'Display P3'], ['adobe-rgb', 'Adobe RGB (1998)']];

const KEY = 'formvis.exportPresets';

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
  private readonly profileRow: Row<string>;
  private readonly intentRow: Row<string>;
  private readonly bpcRow: Row<boolean>;
  private readonly embedRow: Row<boolean>;
  private readonly sizeRow: Row<string>;
  private readonly labelRow: Row<string>;
  private readonly dpxBitsRow: Row<string>;
  private readonly dpxTransferRow: Row<string>;
  private readonly optionRow: Row<string>;
  private readonly icoRow = el('<div class="cv-field" role="group" aria-label="Icon sizes"><span>Icon sizes (px)</span><div class="cv-size-checks"></div></div>');
  private readonly icoBoxes = ICO_SIZES.map((n) => el<HTMLInputElement>(`<input type="checkbox" value="${n}" aria-label="${n} pixels">`));
  private readonly boxW = el('<input class="cv-input" type="number" min="1" max="30000" step="1" aria-label="Width">') as HTMLInputElement;
  private readonly boxH = el('<input class="cv-input" type="number" min="1" max="30000" step="1" aria-label="Height">') as HTMLInputElement;
  private readonly boxRow = el('<label class="cv-field"><span>Width x Height (px)</span><div class="cv-row-actions"></div></label>');
  private readonly sizeNote = el('<p class="cv-note"></p>');
  private readonly nameInput = el('<input class="cv-input" type="text" maxlength="60" placeholder="Preset name">') as HTMLInputElement;
  private readonly deleteBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine, private readonly run: (s: ExportSettings) => void) {
    super('Export As', 420);
    this.presetRow = selectRow('Preset', [], (v) => this.pick(v));
    this.formatRow = selectRow('Format', EXPORT_FORMATS, (v) => { this.s = clampSettings({ ...this.s, format: v as ExportFormat }); this.custom(); });
    this.qualityRow = sliderRow('Quality (%)', 1, 100, 1, (v) => { this.s = clampSettings({ ...this.s, quality: v }); this.custom(); });
    this.scaleRow = sliderRow('Scale (%)', 10, 400, 1, (v) => { this.s = clampSettings({ ...this.s, scale: v }); this.custom(); }, { min: 1, max: 1000 });
    this.profileRow = selectRow('Colour profile', BUILT_IN_PROFILES, (v) => { this.s = clampSettings({ ...this.s, profile: v as ExportSettings['profile'] }); this.custom(); });
    this.intentRow = selectRow('Intent', EXPORT_INTENTS, (v) => { this.s = clampSettings({ ...this.s, intent: v as ExportIntent }); this.custom(); });
    this.bpcRow = checkRow('Black point compensation', (v) => { this.s = clampSettings({ ...this.s, bpc: v }); this.custom(); });
    this.embedRow = checkRow('Embed the profile', (v) => { this.s = clampSettings({ ...this.s, embed: v }); this.custom(); });
    // Size and the AI label (1.51.8): Scale as before, Fit Within a width and height, or a Frame of exactly that size.
    this.sizeRow = selectRow('Size', [['scale', 'Scale (%)'], ['fit', 'Fit Within'], ['frame', 'Frame']], (v) => { this.s = clampSettings({ ...this.s, size: v === 'scale' ? undefined : v as 'fit' | 'frame', boxW: this.s.boxW ?? 1920, boxH: this.s.boxH ?? 1080 }); this.custom(); });
    (this.boxRow.lastElementChild as HTMLElement).append(this.boxW, el('<span>x</span>'), this.boxH);
    const box = (): void => { this.s = clampSettings({ ...this.s, boxW: Number(this.boxW.value), boxH: Number(this.boxH.value) }); this.custom(); };
    this.boxW.addEventListener('change', box); this.boxH.addEventListener('change', box);
    this.labelRow = selectRow('AI label', [['none', 'None'], ['generated', 'Made with AI'], ['edited', 'Edited with AI']], (v) => { this.s = clampSettings({ ...this.s, aiLabel: v === 'none' ? undefined : v as 'generated' | 'edited' }); this.custom(); });
    this.dpxBitsRow = selectRow('DPX bit depth', DPX_BITS, (v) => { this.s = clampSettings({ ...this.s, dpxBits: Number(v) as DpxBits }); this.custom(); });
    this.dpxTransferRow = selectRow('DPX transfer', DPX_TRANSFERS, (v) => { this.s = clampSettings({ ...this.s, dpxTransfer: v as DpxTransfer }); this.custom(); });
    this.optionRow = selectRow('Format options', [['', 'None']], (v) => { this.s = clampSettings({ ...this.s, option: v }); this.custom(); });
    const icoBar = this.icoRow.lastElementChild as HTMLElement;
    ICO_SIZES.forEach((n, i) => {
      const lab = el('<label></label>');
      lab.append(this.icoBoxes[i], el(`<span>${n}</span>`));
      icoBar.append(lab);
      this.icoBoxes[i].addEventListener('change', () => { this.s = clampSettings({ ...this.s, icoSizes: ICO_SIZES.filter((_, k) => this.icoBoxes[k].checked) }); this.custom(); });
    });
    const save = el('<button class="cv-btn" type="button">Save Preset</button>') as HTMLButtonElement;
    this.deleteBtn = el('<button class="cv-btn" type="button">Delete Preset</button>') as HTMLButtonElement;
    save.addEventListener('click', () => this.savePreset());
    this.deleteBtn.addEventListener('click', () => this.deletePreset());
    const manage = el('<div class="cv-field"><span></span><div class="cv-row-actions"></div></div>');
    (manage.lastElementChild as HTMLElement).append(this.nameInput, save, this.deleteBtn);
    this.body.append(this.presetRow.el, this.formatRow.el, this.qualityRow.el, this.sizeRow.el, this.scaleRow.el, this.boxRow, this.profileRow.el, this.intentRow.el, this.bpcRow.el, this.embedRow.el, this.dpxBitsRow.el, this.dpxTransferRow.el, this.optionRow.el, this.icoRow, this.labelRow.el, this.sizeNote, manage);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Export', 'primary', () => { this.close(); this.run({ ...this.s }); });
    // The settings in use (not only the saved presets) and the preset chosen are kept across sessions.
    const kept = recalled('Export As', 'settings');
    if (typeof kept === 'string') { try { this.s = clampSettings(JSON.parse(kept) as ExportSettings); this.presetId = String(recalled('Export As', 'preset') ?? ''); } catch { /* the defaults */ } }
  }

  show(): void {
    if (this.isOpen || !this.engine.current) return;
    this.load();
    this.sync();
    this.open();
    void this.listProfiles();
  }

  /** The RGB profiles on this computer join the built-in ones, patched in place so the row keeps its nodes. */
  private async listProfiles(): Promise<void> {
    const sel = this.profileRow.el.querySelector('select') as HTMLSelectElement;
    let listed: Array<readonly [string, string]> = [];
    try { listed = (await api.colourProfiles()).profiles.filter((p) => p.space === 'RGB').map((p) => [`id:${p.id}`, p.name] as const); } catch { /* the built-in ones only */ }
    const want = [...BUILT_IN_PROFILES, ...listed];
    while (sel.options.length > want.length) sel.remove(sel.options.length - 1);
    want.forEach(([v, t], i) => { const o = sel.options[i] ?? sel.appendChild(document.createElement('option')); if (o.value !== v) o.value = v; if (o.textContent !== t) o.textContent = t; });
    this.profileRow.set(this.s.profile ?? 'srgb');
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
    try { localStorage.setItem(KEY, JSON.stringify(this.saved.map(({ id, name, format, quality, scale, profile, intent, bpc, embed, size, boxW, boxH, aiLabel, dpxBits, dpxTransfer, option, icoSizes }) => ({ id, name, format, quality, scale, ...(profile ? { profile } : {}), ...(intent ? { intent } : {}), ...(bpc === false ? { bpc } : {}), ...(embed === false ? { embed } : {}), ...(size ? { size, boxW, boxH } : {}), ...(aiLabel ? { aiLabel } : {}), ...(dpxBits ? { dpxBits, dpxTransfer } : {}), ...(option ? { option } : {}), ...(icoSizes ? { icoSizes } : {}) })))); } catch { toast('Presets cannot be saved in this browser.', 'error'); }
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
    this.sizeRow.set(s.size ?? 'scale');
    this.labelRow.set(s.aiLabel ?? 'none');
    this.scaleRow.el.hidden = (s.size ?? 'scale') !== 'scale';
    this.boxRow.hidden = (s.size ?? 'scale') === 'scale';
    if (document.activeElement !== this.boxW) this.boxW.value = String(s.boxW ?? 1920);
    if (document.activeElement !== this.boxH) this.boxH.value = String(s.boxH ?? 1080);
    this.profileRow.set(s.profile ?? 'srgb');
    this.intentRow.set(s.intent ?? 'relative');
    this.bpcRow.set(s.bpc !== false);
    this.embedRow.set(s.embed !== false);
    const listedProfile = !!s.profile?.startsWith('id:'), carries = s.format !== 'pdf' && !PROFILELESS.has(s.format);
    this.intentRow.el.classList.toggle('is-off', !listedProfile);
    this.bpcRow.el.classList.toggle('is-off', !listedProfile);
    this.embedRow.el.classList.toggle('is-off', !carries);
    for (const i of [...this.intentRow.el.querySelectorAll('select'), ...this.bpcRow.el.querySelectorAll('input')]) i.disabled = !listedProfile;
    for (const i of this.embedRow.el.querySelectorAll('input')) i.disabled = !carries;
    this.dpxBitsRow.set(String(s.dpxBits ?? 10));
    this.dpxTransferRow.set(s.dpxTransfer ?? 'log');
    this.dpxBitsRow.el.classList.toggle('is-off', s.format !== 'dpx');
    this.dpxTransferRow.el.classList.toggle('is-off', s.format !== 'dpx');
    for (const i of [...this.dpxBitsRow.el.querySelectorAll('select'), ...this.dpxTransferRow.el.querySelectorAll('select')]) i.disabled = s.format !== 'dpx';
    // Format options: one row whose choices follow the format (patched in place), and the icon sizes; both stay in place and are disabled when the format has none.
    const choices = FORMAT_OPTIONS[s.format], sel = this.optionRow.el.querySelector('select') as HTMLSelectElement, want = choices ?? [['', 'None'] as const];
    while (sel.options.length > want.length) sel.remove(sel.options.length - 1);
    want.forEach(([v, t], i) => { const o = sel.options[i] ?? sel.appendChild(document.createElement('option')); if (o.value !== v) o.value = v; if (o.textContent !== t) o.textContent = t; });
    this.optionRow.set(choices ? s.option ?? choices[0][0] : '');
    sel.disabled = !choices;
    this.optionRow.el.classList.toggle('is-off', !choices);
    const ico = s.format === 'ico';
    this.icoRow.classList.toggle('is-off', !ico);
    this.icoBoxes.forEach((b, i) => { b.checked = ico && !!s.icoSizes?.includes(ICO_SIZES[i]); b.disabled = !ico; });
    const lossy = LOSSY.has(s.format);
    this.qualityRow.el.classList.toggle('is-off', !lossy);
    for (const i of this.qualityRow.el.querySelectorAll('input')) i.disabled = !lossy;
    this.deleteBtn.disabled = !this.saved.some((x) => x.id === this.presetId);
    if (doc) { const z = exportLayout(doc.width, doc.height, s); setText(this.sizeNote, `${z.w} x ${z.h} px · ${exportName(this.engine.current?.name ?? 'Untitled', s)}${s.format === 'pdf' && s.profile ? ' · converted; PDF carries no profile' : ''}`); }
    if (doc && s.aiLabel && ['avif', 'tiff', 'pdf'].includes(s.format)) setText(this.sizeNote, `${this.sizeNote.textContent ?? ''} · AVIF, TIFF and PDF do not carry the AI label yet.`);
    remembered('Export As', 'settings', JSON.stringify(s));
    remembered('Export As', 'preset', this.presetId);
  }
}

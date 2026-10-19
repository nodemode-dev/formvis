import type { Engine } from '../../engine';
import { exportLayout, CANVAS_ANCHORS, CANVAS_FILLS, MATTES, BUILTIN_EXPORT_PRESETS, DPX_BITS, DPX_TRANSFERS, EXPORT_FORMATS, EXPORT_INTENTS, FORMAT_OPTIONS, ICO_SIZES, LOSSY, MAX_EXPORT_SIZES, PROFILELESS, XMP_FORMATS, clampSettings, defaultSuffix, sizedSettings, exportName, exportSize, presetsFromStorage, type DpxBits, type DpxTransfer, type ExportFormat, type ExportIntent, type ExportPreset, type ExportSettings } from '../../io/export-presets';
import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { recalled, remembered } from '../prefs';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

const BUILT_IN_PROFILES: ReadonlyArray<readonly [string, string]> = [['srgb', 'sRGB (web)'], ['display-p3', 'Display P3'], ['adobe-rgb', 'Adobe RGB (1998)']];

const KEY = 'formvis.exportPresets';

/** File > Export As (Alt+Shift+Mod+W): format, quality, scale and the resulting size and file
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
  private readonly promptRow: Row<boolean>;
  private readonly anchorRow: Row<string>;
  private readonly fillRow: Row<string>;
  private readonly matteRow: Row<string>;
  private readonly fileInput = el('<input class="cv-input" type="text" maxlength="120" aria-label="File name">') as HTMLInputElement;
  private readonly fileField = el('<label class="cv-field"><span>File name</span></label>');
  private readonly dpxBitsRow: Row<string>;
  private readonly dpxTransferRow: Row<string>;
  private readonly optionRow: Row<string>;
  private readonly icoRow = el('<div class="cv-field" role="group" aria-label="Icon sizes"><span>Icon sizes (px)</span><div class="cv-size-checks"></div></div>');
  private readonly icoBoxes = ICO_SIZES.map((n) => el<HTMLInputElement>(`<input type="checkbox" value="${n}" aria-label="${n} pixels">`));
  private readonly boxW = el('<input class="cv-input" type="number" min="1" max="30000" step="1" aria-label="Width">') as HTMLInputElement;
  private readonly boxH = el('<input class="cv-input" type="number" min="1" max="30000" step="1" aria-label="Height">') as HTMLInputElement;
  private readonly boxRow = el('<label class="cv-field"><span>Width x Height (px)</span><div class="cv-row-actions"></div></label>');
  // Canvas size, metadata and several sizes (36.29); each row exists from the start and is disabled when it does not apply.
  private readonly canvasRow: Row<boolean>;
  private readonly canvasW = el('<input class="cv-input" type="number" min="1" max="30000" step="1" aria-label="Canvas width">') as HTMLInputElement;
  private readonly canvasH = el('<input class="cv-input" type="number" min="1" max="30000" step="1" aria-label="Canvas height">') as HTMLInputElement;
  private readonly canvasBox = el('<label class="cv-field"><span>Canvas (px)</span><div class="cv-row-actions"></div></label>');
  private readonly metaRow: Row<string>;
  private readonly copyrightInput = el('<input class="cv-input" type="text" maxlength="300" aria-label="Copyright text">') as HTMLInputElement;
  private readonly copyrightField = el('<label class="cv-field"><span>Copyright</span></label>');
  private readonly contactInput = el('<input class="cv-input" type="text" maxlength="300" aria-label="Contact text">') as HTMLInputElement;
  private readonly contactField = el('<label class="cv-field"><span>Contact</span></label>');
  private readonly sizesHead = el('<div class="cv-field"><span>Sizes</span><div class="cv-row-actions"></div></div>');
  private readonly addSizeBtn = el('<button class="cv-btn" type="button">Add Size</button>') as HTMLButtonElement;
  private readonly sizesList = el('<div class="cv-sizes" role="group" aria-label="Export sizes"></div>');
  private readonly sizeNote = el('<p class="cv-note"></p>');
  private readonly metaNote = el('<p class="cv-note"></p>');
  private readonly nameInput = el('<input class="cv-input" type="text" maxlength="60" placeholder="Preset name">') as HTMLInputElement;
  private readonly deleteBtn: HTMLButtonElement;
  // Live preview and size estimate: the file the settings would write, encoded after a short pause and drawn into one canvas.
  private readonly previewBox = el('<div class="cv-export-preview" role="img" aria-label="Preview of the exported file"><canvas></canvas></div>');
  private readonly previewCanvas = this.previewBox.firstElementChild as HTMLCanvasElement;
  private readonly previewNote = el('<p class="cv-note" role="status"></p>');
  private readonly zoomRow: Row<string>;
  private zoom = 'fit';
  private seq = 0;
  private timer = 0;
  private layers = false;

  constructor(private readonly engine: Engine, private readonly run: (s: ExportSettings) => void, private readonly runLayers: (s: ExportSettings) => void, private readonly preview: (s: ExportSettings, layerId?: string) => Promise<{ blob: Blob; name: string; view?: CanvasImageSource } | null>) {
    super('Export As', 420);
    this.zoomRow = selectRow('Preview', [['fit', 'Fit'], ['100', 'Actual pixels (centre)']], (v) => { this.zoom = v; this.queue(); });
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
    this.canvasRow = checkRow('Canvas size', (v) => { this.s = clampSettings({ ...this.s, canvas: v, canvasW: this.s.canvasW ?? Number(this.canvasW.value), canvasH: this.s.canvasH ?? Number(this.canvasH.value) }); this.custom(); });
    (this.canvasBox.lastElementChild as HTMLElement).append(this.canvasW, el('<span>x</span>'), this.canvasH);
    const canvas = (): void => { this.s = clampSettings({ ...this.s, canvasW: Number(this.canvasW.value), canvasH: Number(this.canvasH.value) }); this.custom(); };
    this.canvasW.addEventListener('change', canvas); this.canvasH.addEventListener('change', canvas);
    this.metaRow = selectRow('Metadata', [['doc', 'Document File Info'], ['none', 'None'], ['copyright', 'Copyright and Contact Info']], (v) => { this.s = clampSettings({ ...this.s, metadata: v === 'doc' ? undefined : v as 'none' | 'copyright' }); this.custom(); });
    this.copyrightField.append(this.copyrightInput); this.contactField.append(this.contactInput);
    this.copyrightInput.addEventListener('input', () => { this.s = clampSettings({ ...this.s, copyrightText: this.copyrightInput.value }); this.custom(); });
    this.contactInput.addEventListener('input', () => { this.s = clampSettings({ ...this.s, contactText: this.contactInput.value }); this.custom(); });
    (this.sizesHead.lastElementChild as HTMLElement).append(this.addSizeBtn);
    this.addSizeBtn.addEventListener('click', () => {
      const have = this.s.sizes ?? [], x = [1, 2, 0.5, 3, 4, 1.5, 0.25].find((n) => !have.some((z) => z.x === n)) ?? 1;
      this.s = clampSettings({ ...this.s, sizes: [...have, { x, suffix: defaultSuffix(x) }] }); this.custom();
    });
    this.labelRow = selectRow('AI label', [['none', 'None'], ['generated', 'Made with AI'], ['edited', 'Edited with AI']], (v) => { this.s = clampSettings({ ...this.s, aiLabel: v === 'none' ? undefined : v as 'generated' | 'edited' }); this.custom(); });
    this.anchorRow = selectRow('Canvas anchor', CANVAS_ANCHORS, (v) => { this.s = clampSettings({ ...this.s, canvasAnchor: Number(v) }); this.custom(); });
    this.fillRow = selectRow('Canvas margin', CANVAS_FILLS, (v) => { this.s = clampSettings({ ...this.s, canvasFill: v === 'transparent' ? undefined : v as 'white' | 'black' }); this.custom(); });
    this.matteRow = selectRow('Transparency', MATTES, (v) => { this.s = clampSettings({ ...this.s, matte: v === 'keep' ? undefined : v as 'white' | 'black' }); this.custom(); });
    this.promptRow = checkRow('Prompt and recipe in the PNG', (v) => { this.s = clampSettings({ ...this.s, promptMeta: v }); this.custom(); });
    this.fileField.append(this.fileInput);
    this.fileInput.addEventListener('input', () => { this.s = clampSettings({ ...this.s, fileName: this.fileInput.value }); this.custom(); });
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
    this.body.append(this.previewBox, this.previewNote, this.zoomRow.el, this.presetRow.el, this.fileField, this.formatRow.el, this.qualityRow.el, this.sizeRow.el, this.scaleRow.el, this.boxRow, this.canvasRow.el, this.canvasBox, this.anchorRow.el, this.fillRow.el, this.matteRow.el, this.profileRow.el, this.intentRow.el, this.bpcRow.el, this.embedRow.el, this.dpxBitsRow.el, this.dpxTransferRow.el, this.optionRow.el, this.icoRow, this.labelRow.el, this.promptRow.el, this.metaRow.el, this.copyrightField, this.contactField, this.metaNote, this.sizesHead, this.sizesList, this.sizeNote, manage);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Export', 'primary', () => { this.close(); (this.layers ? this.runLayers : this.run)({ ...this.s }); });
    // The settings in use (not only the saved presets) and the preset chosen are kept across sessions.
    const kept = recalled('Export As', 'settings');
    if (typeof kept === 'string') { try { this.s = clampSettings(JSON.parse(kept) as ExportSettings); this.presetId = String(recalled('Export As', 'preset') ?? ''); } catch { /* the defaults */ } }
  }

  /** Opens for the picture, or for the selected layers (`layers`), each exported alone. */
  show(layers = false): void {
    if (this.isOpen || !this.engine.current) return;
    this.layers = layers;
    this.setTitle(layers ? 'Export Layer As' : 'Export As');
    this.load();
    this.sync();
    this.open();
    void this.listProfiles();
  }

  /** Re-encodes the preview 350 ms after the last change; an older answer that arrives late is dropped. */
  private queue(): void {
    window.clearTimeout(this.timer);
    const seq = ++this.seq;
    this.timer = window.setTimeout(() => void this.render(seq), 350);
  }

  private async render(seq: number): Promise<void> {
    const p = this.engine.current;
    if (!this.isOpen || !p) return;
    const lay = this.layers ? p.activeId ?? undefined : undefined, first = sizedSettings(this.s)[0].s, L = exportLayout(p.doc.width, p.doc.height, first);
    if (L.w * L.h > 40e6) { setText(this.previewNote, `${L.w} x ${L.h} px is too large to preview here; the size is known after the export.`); return; }
    let r: Awaited<ReturnType<ExportDialog['preview']>> = null;
    try { r = await this.preview(this.s, lay); } catch { r = null; }
    if (seq !== this.seq || !this.isOpen) return;
    if (!r || !r.blob.size) { setText(this.previewNote, 'This export cannot be previewed with these settings.'); return; }
    let src: CanvasImageSource | undefined = r.view, w = 0, h = 0;
    try { const b = await createImageBitmap(r.blob); src = b; } catch { /* formats the browser cannot show: the picture it was encoded from */ }
    if (seq !== this.seq || !this.isOpen) return;
    if (src) { w = 'width' in src ? Number(src.width) : 0; h = 'height' in src ? Number(src.height) : 0; }
    const kb = r.blob.size / 1024, size = kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
    setText(this.previewNote, `${size} · ${L.w} x ${L.h} px · ${r.name}${this.s.sizes && this.s.sizes.length > 1 ? ' (first size)' : ''}`);
    if (!src || !w || !h) return;
    // The canvas keeps the size of its box; the picture is drawn centred in it, so nothing around it moves.
    const cv = this.previewCanvas, bw = Math.max(40, this.previewBox.clientWidth - 2), bh = Math.max(40, this.previewBox.clientHeight - 2), fit = this.zoom === 'fit';
    if (cv.width !== bw) cv.width = bw;
    if (cv.height !== bh) cv.height = bh;
    const x = cv.getContext('2d');
    if (!x) return;
    x.clearRect(0, 0, bw, bh);
    x.imageSmoothingQuality = 'high';
    if (fit) { const k = Math.min(1, bw / w, bh / h), dw = Math.max(1, Math.round(w * k)), dh = Math.max(1, Math.round(h * k)); x.drawImage(src, Math.floor((bw - dw) / 2), Math.floor((bh - dh) / 2), dw, dh); }
    else { const cw = Math.min(w, bw), ch = Math.min(h, bh); x.drawImage(src, Math.floor((w - cw) / 2), Math.floor((h - ch) / 2), cw, ch, Math.floor((bw - cw) / 2), Math.floor((bh - ch) / 2), cw, ch); }
    if (src instanceof ImageBitmap) src.close();
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

  /** One size entry: the multiplier (1, 2, 0.5), the file name suffix and a remove button. */
  private sizeRowNode(): HTMLElement {
    const row = el('<div class="cv-row-actions"><input class="cv-input" type="number" min="0.1" max="10" step="0.05" aria-label="Size multiplier"><input class="cv-input" type="text" maxlength="20" aria-label="File name suffix" placeholder="Suffix"><button class="cv-btn" type="button">Remove</button></div>');
    const [xi, si] = Array.from(row.querySelectorAll('input')) as HTMLInputElement[], at = (): number => Array.from(this.sizesList.children).indexOf(row);
    const put = (patch: Partial<{ x: number; suffix: string }>): void => { const list = (this.s.sizes ?? []).map((z, k) => (k === at() ? { ...z, ...patch } : z)); this.s = clampSettings({ ...this.s, sizes: list }); this.custom(); };
    xi.addEventListener('change', () => { const old = this.s.sizes?.[at()], x = Number(xi.value); put({ x, ...(old && old.suffix === defaultSuffix(old.x) ? { suffix: defaultSuffix(Math.round(Math.min(10, Math.max(0.1, x || 1)) * 100) / 100) } : {}) }); });
    si.addEventListener('input', () => put({ suffix: si.value }));
    row.querySelector('button')?.addEventListener('click', () => { this.s = clampSettings({ ...this.s, sizes: (this.s.sizes ?? []).filter((_, k) => k !== at()) }); this.custom(); });
    return row;
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
    try { localStorage.setItem(KEY, JSON.stringify(this.saved.map(({ id, name, format, quality, scale, profile, intent, bpc, embed, size, boxW, boxH, aiLabel, dpxBits, dpxTransfer, option, icoSizes, canvas, canvasW, canvasH, metadata, copyrightText, contactText, sizes }) => ({ id, name, format, quality, scale, ...(profile ? { profile } : {}), ...(intent ? { intent } : {}), ...(bpc === false ? { bpc } : {}), ...(embed === false ? { embed } : {}), ...(size ? { size, boxW, boxH } : {}), ...(aiLabel ? { aiLabel } : {}), ...(dpxBits ? { dpxBits, dpxTransfer } : {}), ...(option ? { option } : {}), ...(icoSizes ? { icoSizes } : {}), ...(canvas ? { canvas, canvasW, canvasH } : {}), ...(metadata ? { metadata, copyrightText, contactText } : {}), ...(sizes ? { sizes } : {}) })))); } catch { toast('Presets cannot be saved in this browser.', 'error'); }
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
    this.promptRow.set(s.promptMeta === true);
    this.promptRow.el.classList.toggle('is-off', s.format !== 'png');
    for (const i of this.promptRow.el.querySelectorAll('input')) i.disabled = s.format !== 'png';
    if (document.activeElement !== this.fileInput) this.fileInput.value = s.fileName ?? '';
    this.fileInput.placeholder = this.engine.current?.name ?? 'Untitled';
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
    // Canvas size: the boxes keep their place and are disabled while the box is unchecked.
    const cv = !!s.canvas;
    this.canvasRow.set(cv);
    this.canvasBox.classList.toggle('is-off', !cv);
    this.canvasW.disabled = !cv; this.canvasH.disabled = !cv;
    this.matteRow.set(s.matte ?? 'keep');
    const noAlpha = s.format === 'jpg' || s.format === 'pdf';
    this.matteRow.el.classList.toggle('is-off', noAlpha);
    for (const i of this.matteRow.el.querySelectorAll('select')) i.disabled = noAlpha;
    this.anchorRow.set(String(s.canvasAnchor ?? 4)); this.fillRow.set(s.canvasFill ?? 'transparent');
    for (const r of [this.anchorRow, this.fillRow]) { r.el.classList.toggle('is-off', !cv); for (const i of r.el.querySelectorAll('select')) i.disabled = !cv; }
    if (document.activeElement !== this.canvasW) this.canvasW.value = String(s.canvasW ?? doc?.width ?? 1920);
    if (document.activeElement !== this.canvasH) this.canvasH.value = String(s.canvasH ?? doc?.height ?? 1080);
    // Metadata: the two texts are used only for Copyright and Contact Info; the note says where the file can carry them.
    const cm = s.metadata === 'copyright';
    this.metaRow.set(s.metadata ?? 'doc');
    this.copyrightField.classList.toggle('is-off', !cm); this.contactField.classList.toggle('is-off', !cm);
    this.copyrightInput.disabled = !cm; this.contactInput.disabled = !cm;
    if (document.activeElement !== this.copyrightInput) this.copyrightInput.value = s.copyrightText ?? '';
    if (document.activeElement !== this.contactInput) this.contactInput.value = s.contactText ?? '';
    setText(this.metaNote, XMP_FORMATS.has(s.format) ? (cm ? 'The contact text is written as the creator. ' : '') + (s.format === 'webp' || s.format === 'tiff' ? 'Written as XMP.' : 'Written as an XMP packet in the file.') : `${s.format.toUpperCase()} cannot carry metadata here; the file is written without it.`);
    // Several sizes: one row of nodes per entry, kept and patched in place; a row is added or removed only when the list changes length.
    const sizes = s.sizes ?? [];
    while (this.sizesList.children.length > sizes.length) this.sizesList.lastElementChild?.remove();
    while (this.sizesList.children.length < sizes.length) this.sizesList.append(this.sizeRowNode());
    sizes.forEach((z, i) => {
      const row = this.sizesList.children[i] as HTMLElement, [xi, si] = Array.from(row.querySelectorAll('input')) as HTMLInputElement[];
      if (document.activeElement !== xi) xi.value = String(z.x);
      if (document.activeElement !== si) si.value = z.suffix;
    });
    this.addSizeBtn.disabled = sizes.length >= MAX_EXPORT_SIZES;
    const lossy = LOSSY.has(s.format);
    this.qualityRow.el.classList.toggle('is-off', !lossy);
    for (const i of this.qualityRow.el.querySelectorAll('input')) i.disabled = !lossy;
    this.deleteBtn.disabled = !this.saved.some((x) => x.id === this.presetId);
    if (doc) { const z = exportLayout(doc.width, doc.height, sizedSettings(s)[0].s), many = sizes.length > 1; setText(this.sizeNote, `${many ? `${sizes.length} files, first ` : ''}${z.w} x ${z.h} px · ${exportName(this.engine.current?.name ?? 'Untitled', s, sizes[0]?.suffix)}${s.format === 'pdf' && s.profile ? ' · converted; PDF carries no profile' : ''}`); }
    if (doc && s.aiLabel && ['avif', 'tiff', 'pdf'].includes(s.format)) setText(this.sizeNote, `${this.sizeNote.textContent ?? ''} · AVIF, TIFF and PDF do not carry the AI label yet.`);
    this.queue();
    remembered('Export As', 'settings', JSON.stringify({ ...s, fileName: undefined }));
    remembered('Export As', 'preset', this.presetId);
  }
}

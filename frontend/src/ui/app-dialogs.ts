import type { Engine } from '../engine';
import { api, type Capabilities, type LibraryItem } from '../io/api';
import { saveTemplates, templates } from '../io/prompt-templates';
import { LocalModelsSection } from './panels/local-models';
import { PROJECT_ACCEPT } from '../io/images';
import { VERSION } from '../version';
import { comboOf, formatKeys, type Commands } from './commands';
import { LIMITS } from '../engine/types';
import { Dialog, confirmAction } from './dialogs';
import { el, patchList, q, setClass, setDisabled, setHidden, setText, setValue } from './dom';
import { languages, onLanguage, setLanguage, t, type Lang } from './i18n';
import { icon } from './icons';
import { brandMark } from './brand';
import { THEMES, readChoice, setAccent, setIntensity, setTheme, themeSwatchesHtml } from './themes';
import { toast } from './toast';
import { CHECKER_COLORS, CHECKER_SIZES, ENGINE_CHOICES, PAINT_CURSORS, PRESSURE_CURVES, RAW_WB_CHOICES, RECOVERY_CHOICES, RULER_UNITS, UI_FONT_SIZES, loadPrefs, recalled, remembered, savePrefs, type CheckerColors, type CheckerSize, type EngineDevice, type PaintCursor, type Prefs, type PressureCurve, type RulerUnits, type UiFontSize } from './prefs';
import { RENDERER_CHOICES, type GpuRenderer } from '../gpu/probe';
import { checkRow, selectRow, sliderRow } from './panels/controls';

/** New Document presets by category (Phase 21, UI_SPEC.md section 4, the target's s02 to s14): name, width, height in
 *  pixels and resolution in ppi; common sizes for each kind of work (the Web set as the target lists it). */
interface DocPreset { name: string; w: number; h: number; ppi: number }
const PRESET_GROUPS: ReadonlyArray<{ id: string; label: string; presets: DocPreset[] }> = [
  { id: 'photo', label: 'Photo', presets: [
    { name: 'Landscape 4 × 6', w: 1800, h: 1200, ppi: 300 }, { name: 'Portrait 4 × 6', w: 1200, h: 1800, ppi: 300 }, { name: 'Landscape 5 × 7', w: 2100, h: 1500, ppi: 300 }, { name: 'Portrait 5 × 7', w: 1500, h: 2100, ppi: 300 },
    { name: 'Landscape 8 × 10', w: 3000, h: 2400, ppi: 300 }, { name: 'Portrait 8 × 10', w: 2400, h: 3000, ppi: 300 }, { name: 'Square 12 × 12', w: 3600, h: 3600, ppi: 300 }] },
  { id: 'print', label: 'Print', presets: [
    { name: 'Letter', w: 2550, h: 3300, ppi: 300 }, { name: 'Legal', w: 2550, h: 4200, ppi: 300 }, { name: 'Tabloid', w: 3300, h: 5100, ppi: 300 }, { name: 'A5', w: 1748, h: 2480, ppi: 300 },
    { name: 'A4', w: 2480, h: 3508, ppi: 300 }, { name: 'A3', w: 3508, h: 4961, ppi: 300 }, { name: 'Postcard', w: 1800, h: 1200, ppi: 300 }, { name: 'Business Card', w: 1050, h: 600, ppi: 300 }] },
  { id: 'art', label: 'Art & Illustration', presets: [
    { name: 'Poster 18 × 24', w: 5400, h: 7200, ppi: 300 }, { name: 'Canvas 16 × 20', w: 4800, h: 6000, ppi: 300 }, { name: 'Square 2048', w: 2048, h: 2048, ppi: 72 }, { name: 'Square 4096', w: 4096, h: 4096, ppi: 72 },
    { name: 'Sketch 1920 × 1080', w: 1920, h: 1080, ppi: 72 }, { name: 'Comic Page', w: 1988, h: 3075, ppi: 300 }] },
  { id: 'web', label: 'Web', presets: [
    { name: 'Web Large 1920 × 1080', w: 1920, h: 1080, ppi: 72 }, { name: 'Web Medium 1440 × 900', w: 1440, h: 900, ppi: 72 }, { name: 'Web Small 1366 × 768', w: 1366, h: 768, ppi: 72 }, { name: 'Web 1280 × 800', w: 1280, h: 800, ppi: 72 },
    { name: 'MacBook Pro 16"', w: 3072, h: 1920, ppi: 144 }, { name: 'iMac 27"', w: 2560, h: 1440, ppi: 144 }, { name: 'QHD 2560 × 1440', w: 2560, h: 1440, ppi: 72 }, { name: 'UHD 3840 × 2160', w: 3840, h: 2160, ppi: 72 }] },
  { id: 'mobile', label: 'Mobile', presets: [
    { name: 'iPhone 15 Pro', w: 1179, h: 2556, ppi: 460 }, { name: 'iPhone 15 Pro Max', w: 1290, h: 2796, ppi: 460 }, { name: 'iPhone SE', w: 750, h: 1334, ppi: 326 }, { name: 'Pixel 8', w: 1080, h: 2400, ppi: 428 },
    { name: 'iPad Pro 12.9"', w: 2048, h: 2732, ppi: 264 }, { name: 'iPad 10.9"', w: 1640, h: 2360, ppi: 264 }, { name: 'Apple Watch 45 mm', w: 396, h: 484, ppi: 326 }] },
  { id: 'film', label: 'Film & Video', presets: [
    { name: 'HDTV 1080p', w: 1920, h: 1080, ppi: 72 }, { name: 'HDTV 720p', w: 1280, h: 720, ppi: 72 }, { name: 'UHD 4K', w: 3840, h: 2160, ppi: 72 }, { name: 'DCI 4K', w: 4096, h: 2160, ppi: 72 },
    { name: 'UHD 8K', w: 7680, h: 4320, ppi: 72 }, { name: 'Vertical 1080 × 1920', w: 1080, h: 1920, ppi: 72 }] },
  { id: 'social', label: 'Social', presets: [
    { name: 'Instagram Square', w: 1080, h: 1080, ppi: 72 }, { name: 'Instagram Portrait', w: 1080, h: 1350, ppi: 72 }, { name: 'Instagram Story', w: 1080, h: 1920, ppi: 72 }, { name: 'Facebook Post', w: 1200, h: 630, ppi: 72 },
    { name: 'X Post', w: 1600, h: 900, ppi: 72 }, { name: 'YouTube Thumbnail', w: 1280, h: 720, ppi: 72 }, { name: 'LinkedIn Banner', w: 1584, h: 396, ppi: 72 }, { name: 'Pinterest Pin', w: 1000, h: 1500, ppi: 72 }] },
];
type Unit = 'px' | 'in' | 'cm' | 'mm';
const PER_INCH: Record<Unit, number> = { px: 0, in: 1, cm: 2.54, mm: 25.4 };

/** The color modes New Document offers, each with its label, its channels and the bit depths it allows: Bitmap one bit; Grayscale and RGB 8, 16 or 32; CMYK and Lab 8 or 16 (the engine keeps 32 bits for RGB and
 *  Grayscale: Image > Mode > 32 Bits/Channel brings CMYK and Lab to RGB first). */
export type NewMode = 'bitmap' | 'grayscale' | 'rgb' | 'cmyk' | 'lab';
export type NewDepth = 1 | 8 | 16 | 32;
const NEW_MODES: ReadonlyArray<{ id: NewMode; label: string; channels: number; depths: readonly NewDepth[] }> = [
  { id: 'bitmap', label: 'Bitmap', channels: 1, depths: [1] },
  { id: 'grayscale', label: 'Grayscale', channels: 1, depths: [8, 16, 32] },
  { id: 'rgb', label: 'RGB Color', channels: 3, depths: [8, 16, 32] },
  { id: 'cmyk', label: 'CMYK Color', channels: 4, depths: [8, 16] },
  { id: 'lab', label: 'Lab Color', channels: 3, depths: [8, 16] },
];
/** What Create runs once the blank document exists: the app's Image > Mode conversions for the chosen mode and depth. */
export type NewDocumentPrepare = (mode: NewMode, depth: NewDepth) => Promise<(() => Promise<boolean>) | null>;

/** New Document as the target's (Phase 21, UI_SPEC.md section 4): categories at the left; a search over every preset and
 *  the presets as cards, each preview shaped as its document; at the right Name (pre-selected), Width, a link, Height and
 *  Unit, Resolution, Orientation, Color Mode (Bitmap, Grayscale, RGB, CMYK, Lab) with its Bit depth (8, 16 or 32 as the
 *  mode allows), Background Contents and Artboards; a live summary of the size and its memory (a mode's bytes a pixel
 *  at its depth); Cancel at the left, Create at the right. Every value is what the document
 *  is made with: Create makes it, then `prepare`'s conversion (the app's Image > Mode) sets its mode and depth. */
export class NewCanvasDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-nd-input" type="text" value="Untitled-1" spellcheck="false" aria-label="Name">');
  private readonly wIn = el<HTMLInputElement>('<input class="cv-nd-input cv-nd-mono" type="text" inputmode="decimal" aria-label="Width">');
  private readonly hIn = el<HTMLInputElement>('<input class="cv-nd-input cv-nd-mono" type="text" inputmode="decimal" aria-label="Height">');
  private readonly unit = el<HTMLSelectElement>('<select class="cv-nd-input cv-nd-mono" aria-label="Unit"><option value="px">px</option><option value="in">in</option><option value="cm">cm</option><option value="mm">mm</option></select>');
  private readonly res = el<HTMLInputElement>('<input class="cv-nd-input cv-nd-mono" type="text" inputmode="decimal" value="72" aria-label="Resolution">');
  private readonly fill = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Background Contents"><option value="white">White</option><option value="background">Background Color</option><option value="transparent">Transparent</option></select>');
  private readonly artboards = el<HTMLInputElement>('<input type="checkbox" aria-label="Artboards">');
  private readonly link = el<HTMLButtonElement>(`<button class="cv-nd-link is-on" type="button" title="Keep the proportions" aria-pressed="true">${icon('link', 14)}</button>`);
  private readonly cards = el('<div class="cv-nd-cards"></div>');
  private readonly search = el<HTMLInputElement>('<input class="cv-nd-search" type="search" placeholder="Search all presets..." aria-label="Search all presets">');
  private readonly summary = el('<div class="cv-nd-summary"><div class="cv-nd-size"></div><div class="cv-nd-meta"></div></div>');
  private readonly orient: HTMLButtonElement[];
  private category = 'web';
  private picked: DocPreset | null = null;
  private px = { w: 1920, h: 1080 };

  constructor(private readonly engine: Engine) {
    super('New Document', 1000);
    q<HTMLElement>(this.scrim, '.cv-dialog').classList.add('cv-newdoc');
    const cats = el('<nav class="cv-nd-cats" aria-label="Categories"></nav>');
    for (const g of PRESET_GROUPS) {
      const b = el<HTMLButtonElement>('<button class="cv-nd-cat" type="button"></button>');
      setText(b, g.label);
      b.dataset.cat = g.id;
      b.addEventListener('click', () => { this.category = g.id; this.search.value = ''; this.renderCards(); });
      cats.appendChild(b);
    }
    const mid = el('<div class="cv-nd-mid"><label class="cv-nd-searchbox"></label></div>');
    (mid.querySelector('.cv-nd-searchbox') as HTMLElement).append(el(`<span>${icon('search', 15)}</span>`), this.search);
    mid.appendChild(this.cards);
    this.search.addEventListener('input', () => this.renderCards());
    const side = el('<div class="cv-nd-side"></div>');
    const label = (t: string, ...c: HTMLElement[]): HTMLElement => { const f = el(`<div class="cv-nd-field"><span class="cv-nd-label">${t}</span><div class="cv-nd-row"></div></div>`); (f.querySelector('.cv-nd-row') as HTMLElement).append(...c); return f; };
    const pair = (a: HTMLElement, b: HTMLElement): HTMLElement => { const r = el('<div class="cv-nd-pair"></div>'); r.append(a, b); return r; };
    this.orient = (['portrait', 'landscape'] as const).map((o) => {
      const b = el<HTMLButtonElement>(`<button type="button" data-orient="${o}" title="${o === 'portrait' ? 'Portrait' : 'Landscape'}" aria-label="${o === 'portrait' ? 'Portrait' : 'Landscape'}"><span class="cv-nd-orient-${o}"></span></button>`);
      b.addEventListener('click', () => { const portrait = o === 'portrait'; if ((this.px.h > this.px.w) !== portrait && this.px.w !== this.px.h) { this.px = { w: this.px.h, h: this.px.w }; this.picked = null; this.sync(); } });
      return b;
    });
    const seg = el('<div class="cv-nd-seg"></div>');
    seg.append(...this.orient);
    // What formvis's documents are, as dropdowns that open like any other (disabled, they looked broken: the owner's walkthrough).
    // Color Mode and Bit depth: every mode the engine makes (Bitmap, Grayscale, RGB,
    // CMYK, Lab), and the depths each allows. Create converts the new document as Image > Mode does (`prepare`, set by the app).
    const mode = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Color Mode"></select>');
    for (const m of NEW_MODES) { const o = document.createElement('option'); o.value = m.id; o.textContent = t(m.label); mode.appendChild(o); }
    mode.value = 'rgb';
    const depth = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Bit depth"></select>');
    this.mode = mode;
    this.depth = depth;
    this.depthsFor('rgb');
    mode.addEventListener('change', () => { this.depthsFor(mode.value as NewMode); this.sync(); });
    depth.addEventListener('change', () => this.sync());
    const ab = el('<label class="cv-nd-check"></label>');
    ab.append(this.artboards, el('<span>Artboards</span>'));
    const wBox = label('Width', this.wIn), hBox = label('Height', this.hIn), uBox = label('Unit', this.unit);
    const sizeRow = el('<div class="cv-nd-sizes"></div>');
    sizeRow.append(wBox, this.link, hBox, uBox);
    side.append(label('Name', this.name), sizeRow, pair(label('Resolution', this.res, el('<span class="cv-nd-unit">ppi</span>')), label('Orientation', seg)), pair(label('Color Mode', mode), label('&nbsp;', depth)), label('Background Contents', this.fill), ab, this.summary);
    const grid = el('<div class="cv-nd-grid"></div>');
    grid.append(cats, mid, side);
    this.body.appendChild(grid);
    this.button('Cancel', 'ghost', () => this.close());
    this.createBtn = this.button('Create', 'primary', () => void this.create());
    this.link.addEventListener('click', () => { const on = !this.link.classList.contains('is-on'); this.link.classList.toggle('is-on', on); this.link.setAttribute('aria-pressed', String(on)); });
    const fromUnit = (v: number): number => { const u = this.unit.value as Unit, r = this.ppi(); return Math.max(1, Math.round(u === 'px' ? v : (v / PER_INCH[u]) * r)); };
    this.wIn.addEventListener('change', () => { const n = parseFloat(this.wIn.value); if (!Number.isFinite(n)) return this.sync(); const w = fromUnit(n); this.px = { w, h: this.linked() ? Math.max(1, Math.round((w * this.px.h) / this.px.w)) : this.px.h }; this.picked = null; this.sync(); });
    this.hIn.addEventListener('change', () => { const n = parseFloat(this.hIn.value); if (!Number.isFinite(n)) return this.sync(); const h = fromUnit(n); this.px = { h, w: this.linked() ? Math.max(1, Math.round((h * this.px.w) / this.px.h)) : this.px.w }; this.picked = null; this.sync(); });
    this.unit.addEventListener('change', () => this.sync());
    this.res.addEventListener('change', () => this.sync());
    for (const i of [this.name, this.wIn, this.hIn, this.res]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); void this.create(); } });
    this.pick(PRESET_GROUPS[3].presets[0]);
  }

  private linked(): boolean { return this.link.classList.contains('is-on'); }
  private ppi(): number { const r = parseFloat(this.res.value); return Number.isFinite(r) && r >= 1 && r <= 10000 ? r : 72; }

  private pick(p: DocPreset): void {
    this.picked = p;
    this.px = { w: p.w, h: p.h };
    this.res.value = String(p.ppi);
    this.unit.value = 'px';
    this.sync();
  }

  private renderCards(): void {
    for (const b of this.scrim.querySelectorAll<HTMLElement>('.cv-nd-cat')) b.classList.toggle('is-on', !this.search.value.trim() && b.dataset.cat === this.category);
    const q0 = this.search.value.trim().toLowerCase();
    const list = q0 ? PRESET_GROUPS.flatMap((g) => g.presets).filter((p) => p.name.toLowerCase().includes(q0)) : PRESET_GROUPS.find((g) => g.id === this.category)?.presets ?? [];
    this.cards.textContent = '';
    for (const p of list) {
      const card = el<HTMLButtonElement>('<button class="cv-nd-card" type="button"><span class="cv-nd-thumb"><span class="cv-nd-page"></span></span><span class="cv-nd-name"></span><span class="cv-nd-spec"></span></button>');
      // The document's own proportions, never wider than the card nor taller than the preview area (wide presets used to
      // spill past the card: the owner's screenshot).
      const page = card.querySelector('.cv-nd-page') as HTMLElement;
      page.style.aspectRatio = `${p.w} / ${p.h}`;
      page.style.width = `min(100%, ${Math.round((76 * p.w) / p.h)}px)`;
      page.style.height = 'auto';
      setText(card.querySelector('.cv-nd-name') as HTMLElement, p.name);
      setText(card.querySelector('.cv-nd-spec') as HTMLElement, `${p.w} × ${p.h} px · ${p.ppi} ppi`);
      card.title = p.name;
      card.classList.toggle('is-on', this.picked === p);
      card.addEventListener('click', () => { this.pick(p); this.renderCards(); });
      card.addEventListener('dblclick', () => { this.pick(p); void this.create(); });
      this.cards.appendChild(card);
    }
    if (!list.length) this.cards.appendChild(el('<p class="cv-nd-none">No preset matches.</p>'));
  }

  private sync(): void {
    const u = this.unit.value as Unit, r = this.ppi();
    const show = (px: number): string => (u === 'px' ? String(px) : String(Math.round((px / r) * PER_INCH[u] * 100) / 100));
    if (document.activeElement !== this.wIn) this.wIn.value = show(this.px.w);
    if (document.activeElement !== this.hIn) this.hIn.value = show(this.px.h);
    for (const b of this.orient) b.classList.toggle('is-on', b.dataset.orient === (this.px.h > this.px.w ? 'portrait' : 'landscape'));
    // The size by the mode's channels at its depth (1.50.3): RGB three bytes a pixel at 8 bit, Bitmap an eighth (one bit).
    const m = NEW_MODES.find((x) => x.id === this.mode?.value) ?? NEW_MODES[2], bits = Number(this.depth?.value) || m.depths[0];
    const mb = (this.px.w * this.px.h * m.channels * bits) / 8 / (1024 * 1024);
    (this.summary.querySelector('.cv-nd-size') as HTMLElement).innerHTML = `${this.px.w} × ${this.px.h} <span>px</span>`;
    setText(this.summary.querySelector('.cv-nd-meta') as HTMLElement, `${t(m.label)} · ${bits} ${t('bit')} · ${mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`}`);
    this.renderCards();
  }

  show(): void {
    this.name.value = `Untitled-${this.engine.projects.length + 1}`;
    this.recall();
    this.renderCards();
    this.open(this.name);
    this.name.select();
  }

  private mode!: HTMLSelectElement;
  private depth!: HTMLSelectElement;
  private making = false;
  private createBtn!: HTMLButtonElement;
  /** Set by the app: the conversion from the blank document to the chosen mode and depth (Image > Mode's own steps). */
  prepare: NewDocumentPrepare = async () => async () => true;

  /** The bit depths `mode` allows, listed in place; the one chosen stays when the mode allows it too, else 8 bit. */
  private depthsFor(mode: NewMode): void {
    const allowed = NEW_MODES.find((x) => x.id === mode)?.depths ?? [8], now = Number(this.depth.value);
    if ([...this.depth.options].map((o) => Number(o.value)).join() !== allowed.join()) {
      this.depth.replaceChildren(...allowed.map((d) => { const o = document.createElement('option'); o.value = String(d); o.textContent = `${d} ${t('bit')}`; return o; }));
    }
    this.depth.value = String(allowed.includes(now as NewDepth) ? now : allowed[0]);
  }

  /** The last document made sets the next one's size, unit, resolution, mode, depth, background and artboards (not the name). */
  private recall(): void {
    const get = (k: string): string | boolean | undefined => recalled('New Document', k);
    const w = Number(get('w')), h = Number(get('h')), res = get('res'), unit = get('unit'), mode = get('mode'), fill = get('fill'), depth = get('depth');
    const has = (s: HTMLSelectElement, v: unknown): v is string => typeof v === 'string' && [...s.options].some((o) => o.value === v);
    if (has(this.unit, unit)) this.unit.value = unit;
    if (has(this.fill, fill)) this.fill.value = fill;
    if (has(this.mode, mode)) { this.mode.value = mode; this.depthsFor(mode as NewMode); }
    if (has(this.depth, depth)) this.depth.value = depth;
    if (typeof res === 'string' && Number.isFinite(parseFloat(res))) this.res.value = res;
    if (typeof get('artboards') === 'boolean') this.artboards.checked = get('artboards') as boolean;
    const linked = get('link');
    if (typeof linked === 'boolean') { this.link.classList.toggle('is-on', linked); this.link.setAttribute('aria-pressed', String(linked)); }
    if (w >= 1 && h >= 1 && w <= LIMITS.side && h <= LIMITS.side) { this.px = { w: Math.round(w), h: Math.round(h) }; this.picked = null; }
    const cat = get('category');
    if (typeof cat === 'string' && PRESET_GROUPS.some((g) => g.id === cat)) this.category = cat;
    this.sync();
  }

  private keepValues(): void {
    const set = (k: string, v: string | boolean): void => remembered('New Document', k, v);
    set('w', String(this.px.w)); set('h', String(this.px.h)); set('unit', this.unit.value); set('res', String(this.ppi()));
    set('mode', this.mode.value); set('depth', this.depth.value); set('fill', this.fill.value); set('artboards', this.artboards.checked); set('link', this.linked()); set('category', this.category);
  }

  /** What the mode needs is got first (CMYK's profile comes from the engine service), so a refusal leaves the dialog as it
   *  was; then the document is made, converted as Image > Mode converts, and its history started clean. */
  private async create(): Promise<void> {
    if (this.making) return;
    this.making = true;
    setDisabled(this.createBtn, true);
    try {
      this.keepValues();
      const apply = await this.prepare(this.mode.value as NewMode, Number(this.depth.value) as NewDepth);
      if (!apply) return;
      const fill = this.fill.value as 'transparent' | 'white' | 'background';
      const p = this.engine.newDocument(this.px.w, this.px.h, this.name.value.trim() || 'Untitled', fill, this.ppi());
      if (!p) return;
      await apply();
      if (this.artboards.checked) this.engine.newArtboard({ x: 0, y: 0, w: this.px.w, h: this.px.h }, fill === 'transparent' ? null : { r: 255, g: 255, b: 255 });
      this.engine.startHistoryClean();
      this.close();
    } finally { this.making = false; setDisabled(this.createBtn, false); }
  }
}

export interface OpenActions {
  openLibrary(name: string): Promise<boolean>;
  openFiles(files: File[]): Promise<void>;
  openFolder(files: File[], paths: string[]): Promise<void>;
  /** The desktop app's open panel (1.87.0): false when it could not be shown, so the file picker is used. */
  openFromPanel: (() => Promise<boolean>) | null;
}

export class OpenDialog extends Dialog {
  private readonly list = el('<div class="cv-list" role="listbox" aria-label="Saved projects"></div>');
  private readonly empty = el('<div class="cv-list-empty" hidden>No saved projects yet.</div>');
  private readonly status = el('<p class="cv-note">Projects saved in the formvis library.</p>');
  private readonly fileInput = el<HTMLInputElement>(`<input type="file" accept="${PROJECT_ACCEPT}" hidden>`);
  private readonly folderInput = el<HTMLInputElement>('<input type="file" hidden>');
  private readonly openBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;
  private items: LibraryItem[] = [];
  private selected: string | null = null;

  constructor(private readonly actions: OpenActions) {
    super('Open Project', 500);
    this.folderInput.webkitdirectory = true;
    this.body.append(this.status, this.list, this.empty);
    const row = el(`<div class="cv-welcome-actions"><button class="cv-btn" type="button" data-from="file" title="Any project (.fvd, .fmv, PSD, OpenRaster and more) or picture on this computer">${icon('upload', 14)}Browse...</button><button class="cv-btn" type="button" data-from="folder" title="An unpacked project folder, or every project and picture in a folder">${icon('folderOpen', 14)}Folder...</button></div>`);
    this.body.append(row, this.fileInput, this.folderInput);
    q(row, '[data-from="file"]').addEventListener('click', () => {
      const panel = actions.openFromPanel;
      if (!panel) { this.fileInput.click(); return; }
      this.close();
      void panel().then((shown) => { if (!shown) { this.open(this.openBtn); this.fileInput.click(); } });
    });
    q(row, '[data-from="folder"]').addEventListener('click', () => this.folderInput.click());
    this.deleteBtn = this.button('Delete', 'danger', () => void this.deleteSelected());
    this.button('Cancel', 'ghost', () => this.close());
    this.openBtn = this.button('Open', 'primary', () => void this.openSelected());
    this.list.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('.cv-list-row');
      if (r?.dataset.key) { this.selected = r.dataset.key; this.sync(); }
    });
    this.list.addEventListener('dblclick', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('.cv-list-row');
      if (r?.dataset.key) { this.selected = r.dataset.key; void this.openSelected(); }
    });
    this.fileInput.addEventListener('change', () => {
      const files = Array.from(this.fileInput.files ?? []);
      this.fileInput.value = '';
      if (!files.length) return;
      this.close();
      void actions.openFiles(files);
    });
    this.folderInput.addEventListener('change', () => {
      const files = Array.from(this.folderInput.files ?? []);
      this.folderInput.value = '';
      if (!files.length) return;
      this.close();
      void actions.openFolder(files, files.map((f) => f.webkitRelativePath || f.name));
    });
  }

  async show(): Promise<void> {
    this.selected = null;
    this.sync();
    this.open(this.openBtn);
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.items = await api.library();
      setText(this.status, 'Projects saved in the formvis library.');
    } catch (err) {
      this.items = [];
      setText(this.status, err instanceof Error ? err.message : String(err));
    }
    if (this.selected && !this.items.some((i) => i.name === this.selected)) this.selected = null;
    patchList(this.list, this.items, {
      key: (i) => i.name,
      create: (i) => {
        const n = el(`<button class="cv-list-row" type="button" role="option">${icon('fileImage', 14)}<span class="cv-list-name"></span><span class="cv-list-meta"></span></button>`);
        this.updateRow(n, i);
        return n;
      },
      update: (n, i) => this.updateRow(n, i),
    });
    setHidden(this.empty, this.items.length > 0);
    this.sync();
  }

  private updateRow(n: HTMLElement, i: LibraryItem): void {
    setText(q(n, '.cv-list-name'), i.name);
    const when = new Date(i.modified * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const size = i.size >= 1048576 ? `${(i.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(i.size / 1024))} KB`;
    setText(q(n, '.cv-list-meta'), `${when} \u00b7 ${size}`);
  }

  private sync(): void {
    for (const child of Array.from(this.list.children)) setClass(child, 'is-selected', (child as HTMLElement).dataset.key === this.selected);
    setDisabled(this.openBtn, !this.selected);
    setDisabled(this.deleteBtn, !this.selected);
  }

  private async openSelected(): Promise<void> {
    if (!this.selected) return;
    if (await this.actions.openLibrary(this.selected)) this.close();
  }

  private async deleteSelected(): Promise<void> {
    const name = this.selected;
    if (!name) return;
    if (!(await confirmAction('Delete project?', `${name} will be removed from the library. This cannot be undone.`, 'Delete', true))) return;
    try {
      await api.deleteLibrary(name);
      toast(`Deleted ${name}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    this.selected = null;
    await this.reload();
  }
}

export class SettingsDialog extends Dialog {
  private readonly grid = el('<div class="nm-theme-grid" role="group" aria-label="Theme"></div>');
  private readonly accent = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Accent color">');
  private readonly nav = el('<div class="cv-prefs-nav" role="tablist"></div>');
  private readonly sections = new Map<string, HTMLElement>();
  private prefs: Prefs = loadPrefs();
  /** How strongly the accent tints what it marks: selections, active tools and tabs (the owner's walkthrough). */
  private readonly intensityRow = sliderRow('Accent intensity (%)', 0, 150, 5, (v) => setIntensity(v / 100));
  private readonly statesRow = sliderRow('History States', 1, 1000, 1, (v) => this.change({ historyStates: v }));
  private readonly memoryRow = sliderRow('History memory (MB)', 16, 4096, 16, (v) => this.change({ historyMB: v, historyAuto: false }));
  /** 1.61.3: automatic is 40% of what this computer allows formvis; moving the slider above chooses a figure instead. */
  private readonly memoryAutoRow = checkRow('History memory set automatically from this computer\'s memory', (v) => this.change({ historyAuto: v }));
  private readonly redrawRow = checkRow('Redraw only what a brush stroke changed', (v) => this.change({ regionRedraws: v }));
  private readonly recoveryRow = selectRow('Keep recovery information after changes, within', RECOVERY_CHOICES, (v) => this.change({ recoverySeconds: Number(v) }));
  private readonly homeRow = checkRow('Show Home screen at launch', (v) => this.change({ autoShowHome: v }));
  private readonly homeCloseRow = checkRow('Show Home screen when the last document closes', (v) => this.change({ homeOnLastClose: v }));
  private readonly whatsNewRow = checkRow('Show What\'s New once after an update', (v) => this.change({ whatsNewAuto: v }));
  /* The other sections (the owner's walkthrough), each acting on something real. */
  private readonly wheelRow = checkRow('Zoom with Scroll Wheel', (v) => this.change({ zoomWheel: v }));
  private readonly recentFontsRow = sliderRow('Recent fonts listed first', 0, 20, 1, (v) => this.change({ recentFontCount: v }));
  private readonly rawWbRow = selectRow('Default White Balance', RAW_WB_CHOICES, (v) => this.change({ rawWb: v as Prefs['rawWb'] }));
  private readonly rawBitsRow = selectRow('Default Depth', [['8', '8 Bits/Channel'], ['16', '16 Bits/Channel']], (v) => this.change({ rawBits: v === '16' ? 16 : 8 }));
  private readonly historyLogRow = checkRow('Keep a log of history steps', (v) => this.change({ historyLog: v }));
  private readonly rawToneRow =checkRow('Apply Auto Tone', (v) => this.change({ rawAutoTone: v }));
  private readonly rawSmartRow = checkRow('Open as a Smart Object', (v) => this.change({ rawSmart: v }));
  private readonly rawPpiRow = sliderRow('Resolution (ppi, 0 keeps the file\'s)', 0, 600, 1, (v) => this.change({ rawPpi: v }));
  private readonly curveRow = selectRow('Pen Pressure Curve', PRESSURE_CURVES, (v) => this.change({ pressureCurve: v as PressureCurve }));
  private readonly fontSizeRow = selectRow('Interface Text Size', UI_FONT_SIZES, (v) => this.change({ uiFontSize: v as UiFontSize }));
  private readonly firstSnapRow = checkRow('Automatically Create First Snapshot', (v) => this.change({ autoFirstSnapshot: v }));
  private readonly snapMemRow = sliderRow('Snapshot memory (MB)', 64, 8192, 64, (v) => this.change({ snapshotMB: v }));
  private readonly narrowRow = checkRow('Show the side column as icons in a narrow window', (v) => this.change({ narrowCollapse: v }));
  private readonly lockRow = checkRow('Lock Workspace', (v) => this.workspaceLock?.set(v));
  private readonly cursorRow = selectRow('Painting Cursors', PAINT_CURSORS, (v) => this.change({ paintCursor: v as PaintCursor }));
  private readonly crossRow = checkRow('Show Crosshair in Brush Tip', (v) => this.change({ cursorCrosshair: v }));
  private readonly checkerSizeRow = selectRow('Grid Size', CHECKER_SIZES, (v) => this.change({ checkerSize: v as CheckerSize }));
  private readonly checkerColorsRow = selectRow('Grid Colors', CHECKER_COLORS, (v) => this.change({ checkerColors: v as CheckerColors }));
  private readonly languageRow = selectRow('Language', languages(), (v) => { this.change({ language: v as Lang }); setLanguage(v as Lang); });
  private readonly rulerRow = selectRow('Rulers', RULER_UNITS, (v) => this.change({ rulerUnits: v as RulerUnits }));
  private readonly gridEveryRow = sliderRow('Gridline Every (px)', 2, 1000, 1, (v) => this.change({ gridSpacing: v }));
  private readonly subdivRow = sliderRow('Subdivisions', 1, 32, 1, (v) => this.change({ gridSubdivisions: v }));
  private readonly guideColor = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Guide color">');
  private readonly gridColor = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Grid color">');
  /** Lock Workspace lives with the dock; the app connects it. */
  workspaceLock: { get(): boolean; set(on: boolean): void } | null = null;
  private colorRow(label: string, input: HTMLInputElement, key: 'guideColor' | 'gridColor'): HTMLElement {
    const row = el(`<label class="cv-field"><span>${label}</span></label>`), theme = el<HTMLButtonElement>('<button class="cv-btn" type="button">Theme colour</button>');
    input.addEventListener('input', () => this.change({ [key]: input.value } as Partial<Prefs>));
    theme.addEventListener('click', () => this.change({ [key]: '' } as Partial<Prefs>));
    row.append(input, theme);
    return row;
  }
  /** Graphics Processor Settings (Phase 18.1): the detected processor, Use Graphics Processor, the renderer and the GPU
   *  memory limit, with the mode in use and why. */
  private readonly gpuName = el('<span class="cv-gpu-name">Detecting...</span>');
  private readonly gpuMode = el('<p class="cv-note cv-gpu-mode"></p>');
  private readonly gpuUseRow = checkRow('Use Graphics Processor', (v) => this.change({ useGpu: v }));
  private readonly gpuFiltersRow = checkRow('Use the GPU for filters', (v) => this.change({ gpuFilters: v }));
  private readonly rendererRow = selectRow('Renderer', RENDERER_CHOICES, (v) => this.change({ renderer: v as GpuRenderer }));
  private readonly gpuMemoryRow = sliderRow('GPU memory (MB)', 128, 16384, 128, (v) => this.change({ gpuMemoryMB: v }));
  /** The engine's compute device (Phase 18.6): the choice, and what the engine reports it uses and why. */
  private readonly engineRow = selectRow('Engine processor', ENGINE_CHOICES, (v) => this.change({ engineDevice: v as EngineDevice }));
  private readonly engineMode = el('<p class="cv-note cv-engine-mode">Engine: not reached yet.</p>');

  /** Edit > Preferences (Ctrl+,): sections on the left, each section's settings on the right,
   *  kept on this device. `onPrefs` puts a change into effect. */
  constructor(private readonly onPrefs: (p: Prefs) => void) {
    super('Preferences', 620);
    const swatches = document.createElement('template');
    swatches.innerHTML = themeSwatchesHtml();
    this.grid.append(swatches.content);
    const row = el('<div class="cv-field"><span>Theme</span></div>');
    row.appendChild(this.grid);
    const pages = el('<div class="cv-prefs-pages"></div>');
    const add = (name: string, ...content: HTMLElement[]): void => {
      const tab = el<HTMLButtonElement>('<button class="cv-prefs-tab" type="button" role="tab"></button>');
      tab.dataset.section = name;   // the English name is the identity; the label is the translation
      tab.textContent = t(name);
      onLanguage(() => { tab.textContent = t(name); });
      tab.addEventListener('click', () => this.showSection(name));
      this.nav.appendChild(tab);
      const page = el('<div class="cv-prefs-page" role="tabpanel"></div>');
      page.append(...content);
      pages.appendChild(page);
      this.sections.set(name, page);
    };
    const accentRow = el('<label class="cv-field"><span>Accent</span></label>');
    accentRow.appendChild(this.accent);
    const reset = el<HTMLButtonElement>('<button class="cv-btn" type="button">Reset All Preferences...</button>');
    reset.addEventListener('click', () => { void confirmAction('Reset all preferences?', 'Every preference, the panel arrangement and the tools shown go back to how formvis comes; your documents and library are kept. formvis reloads.', 'Reset').then((ok) => { if (!ok) return; for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.') || k === 'nodemode_ui_settings') localStorage.removeItem(k); location.reload(); }); });
    add('General', this.homeRow.el, this.homeCloseRow.el, this.whatsNewRow.el, reset, el('<p class="cv-note">The Home screen covers the canvas area. At launch it shows while no document is open; closing the last document leaves the empty workspace with its panels unless the second choice is on. The brand mark at the top left opens it at any time; Esc leaves it. What\'s New (Help menu) lists the recent additions, each with a Show Me button; with the third choice on it opens once after an update.</p>'));
    this.intensityRow.set(Math.round((readChoice().intensity ?? 1) * 100));
    add('Interface', row, accentRow, this.intensityRow.el, this.fontSizeRow.el, el('<p class="cv-note">Theme and accent are shared with NodeMode on this device. Intensity sets how strongly the accent tints what it marks; 100% is the design\'s. Text size scales the interface\'s text.</p>'));
    add('Performance', this.budgetNote, this.redrawRow.el,
      el('<h3 class="cv-prefs-sub">Graphics Processor Settings</h3>'), this.gpuNameRow(), this.gpuUseRow.el, this.gpuFiltersRow.el, this.rendererRow.el, this.gpuMemoryRow.el, this.gpuMode,
      el('<p class="cv-note">Automatic uses WebGPU (Metal on macOS, Direct3D 12 on Windows), then WebGL2 (as on Linux), on a hardware graphics processor, and the CPU otherwise; a software GPU is slower than the CPU renderer, so Automatic does not use one. If the graphics processor fails to start, formvis turns this off and says so. The canvas draws on the graphics processor; a document using something it does not draw yet draws on the CPU, and the status bar says why.</p>'),
      el('<h3 class="cv-prefs-sub">Engine</h3>'), this.engineRow.el, this.engineMode,
      el('<p class="cv-note">Where the engine runs its models (Remove Background, and the local models that follow). Automatic uses CUDA on an NVIDIA graphics processor, Core ML (Metal) on a Mac, and the CPU otherwise; a choice this machine cannot run falls back to the CPU, and the line above says why.</p>'));
    add('Workspace', this.lockRow.el, this.narrowRow.el, el('<p class="cv-note">Locked, panels are neither dragged nor resized. In a window too narrow for the canvas beside the open side column, it shows as its icons until there is room (your choice is kept).</p>'));
    add('Tools', this.wheelRow.el, this.curveRow.el, el('<p class="cv-note">On, the wheel zooms about the pointer and Ctrl or Cmd with the wheel scrolls; off, the other way round. The pressure curve is how a pen\'s pressure maps to size, flow and opacity in every brush; a brush\'s own options can change it for the session.</p>'));
    add('History & Cache', this.statesRow.el, this.memoryRow.el, this.memoryAutoRow.el, el('<p class="cv-note">History States is how many steps undo keeps (50 is a common default; up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as a desktop app can, so this is the part formvis controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.</p>'),
      this.firstSnapRow.el, this.snapMemRow.el, el('<p class="cv-note">Each document keeps itself as opened, the History Brush\'s first source; snapshots, that one included, share this memory.</p>'));
    this.restoreBox.addEventListener('change', () => this.change({ restoreSession: this.restoreBox.checked }));
    this.mismatchSel.addEventListener('change', () => this.change({ profileMismatch: this.mismatchSel.value as 'convert' | 'keep' | 'ask' }));
    const restore = el('<label class="cv-dialog-row"><span>Reopen the documents that were open when formvis closed</span></label>');
    restore.append(this.restoreBox);
    const mismatch = el('<label class="cv-dialog-row"><span>Embedded profiles</span></label>'); mismatch.append(this.mismatchSel);
    // The library's folder (1.58.8): the choice fills the path, which can be any folder; applying moves the projects.
    const libRow = el('<label class="cv-dialog-row"><span>Library folder</span></label>'); libRow.append(this.libSel);
    const pathRow = el('<label class="cv-dialog-row"><span>Folder</span></label>'); pathRow.append(this.libPath);
    const moveRow = el('<label class="cv-dialog-row"><span>Move my projects there</span></label>'); moveRow.append(this.libMove);
    this.libSel.addEventListener('change', () => { if (this.libSel.value !== 'other') this.libPath.value = this.libSel.value; else this.libPath.focus(); });
    this.libApply.addEventListener('click', () => void this.applyLibrary());
    const library = el('<div></div>');
    library.append(this.libNow, libRow, pathRow, moveRow, this.libApply, el('<p class="cv-note">The library can live in any folder, a synced one (iCloud Drive, Dropbox, OneDrive, Google Drive) included. If a project changed in that folder since you opened it, from another device or window, saving keeps that version and saves yours beside it as a conflict copy.</p>'));
    add('File Handling', library, mismatch, restore, el('<p class="cv-note">Every open document is kept on this device, in its tab order, and opens again at the next start, saved or not. Off, only unsaved work is kept, and formvis asks after a crash.</p>'), this.recoveryRow.el, el('<p class="cv-note">Unsaved documents are kept on this device so they can be recovered after a crash; this is how soon after a change that happens.</p>'));
    add('History Log', this.historyLogRow.el, el('<p class="cv-note">On, every new history step is written down with its time and document, on this device. Edit > History Log saves it as a text file or clears it.</p>'));
    add('Cursors', this.cursorRow.el, this.crossRow.el, el('<p class="cv-note">How painting tools show where they paint: the tip\'s outline at its size, a crosshair alone, or a small ring.</p>'));
    add('Type', this.recentFontsRow.el, el('<p class="cv-note">The fonts you used last are listed first in the font menus, newest first; 0 lists none first.</p>'));
    add('Camera Raw Defaults', this.rawWbRow.el, this.rawBitsRow.el, this.rawPpiRow.el, this.rawToneRow.el, this.rawSmartRow.el, el('<p class="cv-note">What the Camera Raw dialog starts with each time a camera RAW file opens. Resolution, Auto Tone and Smart Object apply to the 8 bits/channel document it opens.</p>'));
    add('Transparency & Gamut', this.checkerSizeRow.el, this.checkerColorsRow.el, el(`<p class="cv-note">${t('The checkerboard shown behind transparent pixels. None shows it plain; Match Theme uses the light checkerboard in light themes and the dark one in dark themes.')}</p>`));
    add('Language', this.languageRow.el, el('<p class="cv-note">The language of the whole interface. Names you give layers and documents stay as you wrote them.</p>'));
    add('Units & Rulers', this.rulerRow.el, el('<p class="cv-note">The rulers\' unit; inches, centimetres and millimetres follow the document\'s resolution, percent its width and height.</p>'));
    add('Guides & Grid', this.colorRow('Guides', this.guideColor, 'guideColor'), this.colorRow('Grid', this.gridColor, 'gridColor'), this.gridEveryRow.el, this.subdivRow.el);
    // Plugins (1.50.8): the other apps formvis sends to; NodeMode first.
    this.nodemodeCheck.addEventListener('click', () => void this.checkNodeMode());
    this.nodemodeUrl.addEventListener('change', () => { const v = this.nodemodeUrl.value.trim(); if (/^https?:\/\/./.test(v)) { this.change({ nodemodeUrl: v }); void this.checkNodeMode(); } else setText(this.nodemodeNote, 'An address starts with http:// or https://, such as http://localhost:8000.'); });
    const nm = el('<label class="cv-dialog-row"><span>NodeMode address</span></label>');
    nm.append(this.nodemodeUrl, this.nodemodeCheck);
    this.comfyuiCheck.addEventListener('click', () => void this.checkComfyUI());
    this.comfyuiUrl.addEventListener('change', () => { const v = this.comfyuiUrl.value.trim(); if (/^https?:\/\/./.test(v)) { this.change({ comfyuiUrl: v }); void this.checkComfyUI(); } else setText(this.comfyuiNote, 'An address starts with http:// or https://, such as http://127.0.0.1:8188.'); });
    const cu = el('<label class="cv-dialog-row"><span>ComfyUI address</span></label>');
    cu.append(this.comfyuiUrl, this.comfyuiCheck);
    // The language model for Improve Prompt, and the prompt templates (1.51.5).
    const lm = el('<div class="cv-panel-section cv-llm"><span class="cv-refs-title">Language model (Improve Prompt)</span></div>');
    const lmRow = (label: string, ...c: HTMLElement[]): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(...c); return r; };
    const lmButtons = el('<div class="cv-improve"></div>');
    const save = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Save</button>'), check = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Check</button>'), forget = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Forget key</button>');
    lmButtons.append(save, check, forget);
    save.addEventListener('click', () => void this.saveLlm(false));
    forget.addEventListener('click', () => void this.saveLlm(true));
    check.addEventListener('click', () => void this.checkLlm());
    lm.append(lmRow('Address', this.llmUrl), lmRow('Model', this.llmModel, this.llmModels), lmRow('API key', this.llmKey), lmButtons, this.llmNote);
    const tp = el('<div class="cv-panel-section cv-templates"><span class="cv-refs-title">Prompt templates</span></div>');
    const tButtons = el('<div class="cv-improve"></div>');
    const tNew = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">New</button>'), tSave = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Save</button>'), tDel = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Delete</button>');
    tButtons.append(tNew, tSave, tDel);
    this.tplPick.addEventListener('change', () => this.showTemplate());
    tNew.addEventListener('click', () => { const list = templates(); let n = 1; while (list.some((t) => t.name === `Template ${n}`)) n++; list.push({ name: `Template ${n}`, text: '' }); saveTemplates(list); this.fillTemplates(`Template ${n}`); });
    tSave.addEventListener('click', () => { const list = templates(), i = list.findIndex((t) => t.name === this.tplPick.value), name = this.tplName.value.trim() || this.tplPick.value; if (i >= 0) list[i] = { name, text: this.tplText.value }; saveTemplates(list); this.fillTemplates(name); setText(this.tplNote, 'Saved.'); });
    tDel.addEventListener('click', () => { const list = templates().filter((t) => t.name !== this.tplPick.value); saveTemplates(list.length ? list : templates()); this.fillTemplates(); });
    tp.append(lmRow('Template', this.tplPick), lmRow('Name', this.tplName), this.tplText, tButtons, this.tplNote);
    // Outside agents over MCP (1.52.1): off unless turned on here; how to connect Claude Code and Claude Desktop.
    this.agents.addEventListener('change', () => { this.change({ agentsAllowed: this.agents.checked }); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: this.agents.checked })); });
    const ag = el('<label class="cv-dialog-row"><span>Allow outside agents (MCP)</span></label>');
    ag.append(this.agents);
    const agNote = el('<p class="cv-note">Lets Claude Code, Claude Desktop or another MCP client work in the open document; each change is an undoable step, and anything that costs money asks you first. Claude Code: <code>claude mcp add --transport http formvis http://127.0.0.1:8190/mcp</code>. Claude Desktop: a server whose command is <code>./formvis mcp</code> in the formvis folder.</p>');
    add('Plugins', this.keysNote, nm, this.nodemodeNote, cu, this.comfyuiNote, lm, tp, ag, agNote, this.localModels.el);
    const wrap = el('<div class="cv-prefs"></div>');
    wrap.append(this.nav, pages);
    this.body.appendChild(wrap);
    this.button('Done', 'primary', () => this.close());
    this.grid.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-id]');
      if (!b?.dataset.themeId) return;
      setTheme(b.dataset.themeId);
      this.sync();
    });
    this.accent.addEventListener('input', () => { setAccent(this.accent.value); this.sync(); });
    this.showSection('General');
  }

  /** Opens on a section, Interface unless named. */
  /** The library control (1.58.8): where the library is now, the default and the synced folders found here, or any
   *  path; a library fixed by the engine's environment is said to be so. */
  private async refreshLibrary(): Promise<void> {
    const f = await api.libraryFolder();
    if (!f) { setText(this.libNow, 'The library folder is shown when the engine is running.'); this.libApply.disabled = true; return; }
    this.libDefault = f.default;
    const opts: Array<[string, string]> = [[f.default, 'This computer (formvis\'s own folder)'], ...f.synced.map((s) => [s.suggested, `${s.label} (synced): ${s.suggested}`] as [string, string]), ['other', 'Another folder...']];
    this.libSel.replaceChildren(...opts.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
    this.libSel.value = opts.some(([v]) => v === f.folder) ? f.folder : 'other';
    this.libPath.value = f.folder;
    this.libApply.disabled = f.fixed;
    setText(this.libNow, f.fixed ? `The library is in ${f.folder}, set by FORMVIS_LIBRARY_DIR for this engine.` : `The library is in ${f.folder}.`);
  }

  private async applyLibrary(): Promise<void> {
    const path = this.libPath.value.trim();
    try {
      const r = await api.setLibraryFolder(path === this.libDefault ? '' : path, this.libMove.checked);
      setText(this.libNow, `The library is in ${r.folder}${r.moved ? `; ${r.moved} project${r.moved === 1 ? '' : 's'} moved there` : ''}.`);
      this.libSel.value = [...this.libSel.options].some((o) => o.value === r.folder) ? r.folder : 'other';
    } catch (err) { setText(this.libNow, err instanceof Error ? err.message : 'The library could not move there.'); }
  }

  show(section?: string): void {
    this.prefs = loadPrefs();
    void this.refreshLibrary();
    this.statesRow.set(this.prefs.historyStates);
    this.memoryRow.set(this.prefs.historyMB);
    this.memoryAutoRow.set(this.prefs.historyAuto);
    this.redrawRow.set(this.prefs.regionRedraws);
    this.recoveryRow.set(String(this.prefs.recoverySeconds));
    this.restoreBox.checked = this.prefs.restoreSession;
    this.mismatchSel.value = this.prefs.profileMismatch;
    this.homeRow.set(this.prefs.autoShowHome);
    this.homeCloseRow.set(this.prefs.homeOnLastClose);
    this.whatsNewRow.set(this.prefs.whatsNewAuto);
    this.gpuUseRow.set(this.prefs.useGpu);
    this.gpuFiltersRow.set(this.prefs.gpuFilters);
    this.rendererRow.set(this.prefs.renderer);
    this.gpuMemoryRow.set(this.prefs.gpuMemoryMB);
    this.engineRow.set(this.prefs.engineDevice);
    this.wheelRow.set(this.prefs.zoomWheel);
    this.curveRow.set(this.prefs.pressureCurve);
    this.recentFontsRow.set(this.prefs.recentFontCount);
    this.rawWbRow.set(this.prefs.rawWb);
    this.rawBitsRow.set(String(this.prefs.rawBits));
    this.historyLogRow.set(this.prefs.historyLog);
    this.rawToneRow.set(this.prefs.rawAutoTone); this.rawSmartRow.set(this.prefs.rawSmart); this.rawPpiRow.set(this.prefs.rawPpi);
    this.fontSizeRow.set(this.prefs.uiFontSize);
    this.firstSnapRow.set(this.prefs.autoFirstSnapshot);
    this.snapMemRow.set(this.prefs.snapshotMB);
    this.narrowRow.set(this.prefs.narrowCollapse);
    this.lockRow.set(this.workspaceLock?.get() ?? false);
    this.cursorRow.set(this.prefs.paintCursor);
    this.crossRow.set(this.prefs.cursorCrosshair);
    this.checkerSizeRow.set(this.prefs.checkerSize);
    this.checkerColorsRow.set(this.prefs.checkerColors);
    this.rulerRow.set(this.prefs.rulerUnits);
    this.languageRow.set(this.prefs.language);
    this.gridEveryRow.set(this.prefs.gridSpacing);
    this.subdivRow.set(this.prefs.gridSubdivisions);
    const css = getComputedStyle(document.documentElement);
    this.guideColor.value = this.prefs.guideColor || (css.getPropertyValue('--accent-color').trim() || '#f97316');
    this.gridColor.value = this.prefs.gridColor || '#808080';
    if (section && this.sections.has(section)) this.showSection(section);
    this.sync();
    this.open();
  }

  private gpuNameRow(): HTMLElement {
    const row = el('<div class="cv-field"><span>Detected Graphics Processor</span></div>');
    row.appendChild(this.gpuName);
    return row;
  }

  /** The probe's result: the processor's name, or none (Use Graphics Processor then greyed),
   *  and the mode in use with its reason. */
  setGpu(name: string | null, mode: string, reason: string): void {
    setText(this.gpuName, name ?? 'None found');
    const box = this.gpuUseRow.el.querySelector('input');
    if (box) setDisabled(box, !name);
    setText(this.gpuMode, `In use: ${mode} (${reason}).`);
  }

  /** The engine's report on its compute device (or that it is offline). */
  setEngine(text: string): void {
    setText(this.engineMode, text);
  }

  private showSection(name: string): void {
    for (const [n, page] of this.sections) setHidden(page, n !== name);
    for (const tab of Array.from(this.nav.children) as HTMLElement[]) { const on = tab.dataset.section === name; setClass(tab, 'is-active', on); tab.setAttribute('aria-selected', String(on)); }
  }

  private readonly nodemodeUrl = el<HTMLInputElement>('<input class="cv-input" type="url" aria-label="NodeMode address" spellcheck="false">');
  private readonly nodemodeCheck = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Check</button>');
  private readonly nodemodeNote = el('<p class="cv-note" role="status">File > Send to NodeMode sends here. Embedded in NodeMode, formvis sends to the NodeMode around it.</p>');

  private readonly comfyuiUrl = el<HTMLInputElement>('<input class="cv-input" type="url" aria-label="ComfyUI address" spellcheck="false">');
  private readonly comfyuiCheck = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Check</button>');
  private readonly comfyuiNote = el('<p class="cv-note" role="status">File > Send to ComfyUI sends here, into its input folder.</p>');

  private readonly restoreBox = el<HTMLInputElement>('<input type="checkbox" aria-label="Reopen documents at start">');
  // The library's folder (1.58.8, L13): any folder, a synced one included; built once, filled when the dialog opens.
  private readonly libNow = el('<p class="cv-note" role="status" style="min-height: 2.8em"></p>');
  private readonly libSel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Library folder"></select>');
  private readonly libPath = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false" aria-label="Library folder path">');
  private readonly libMove = el<HTMLInputElement>('<input type="checkbox" aria-label="Move my projects there" checked>');
  private readonly libApply = el<HTMLButtonElement>('<button class="cv-btn" type="button">Use this folder</button>');
  private libDefault = '';
  private readonly agents = el<HTMLInputElement>('<input type="checkbox" aria-label="Allow outside agents">');
  private readonly localModels = new LocalModelsSection();   // 1.52.9
  private readonly mismatchSel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Embedded profiles"><option value="convert">Convert to the working space (sRGB)</option><option value="keep">Keep the embedded profile</option><option value="ask">Ask when opening</option></select>');   // 1.53.5
  private readonly budgetNote = el('<p class="cv-note cv-budget-note" role="status"></p>');   // the largest document (1.53.4)
  private readonly keysNote = el('<p class="cv-note cv-keys-note" role="status"></p>');   // where API keys are kept (1.52.5)
  private readonly llmUrl = el<HTMLInputElement>('<input class="cv-input" type="url" aria-label="Language model address" spellcheck="false" placeholder="http://localhost:11434/v1">');
  private readonly llmModel = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Language model" spellcheck="false" list="cv-llm-models" placeholder="llama3.2">');
  private readonly llmModels = el('<datalist id="cv-llm-models"></datalist>');
  private readonly llmKey = el<HTMLInputElement>('<input class="cv-input" type="password" aria-label="Language model key" autocomplete="off" spellcheck="false">');
  private readonly llmNote = el('<p class="cv-note cv-llm-note" role="status">Any service with the OpenAI-compatible API: Ollama (http://localhost:11434/v1) or LM Studio (http://localhost:1234/v1) on this computer, or OpenAI, OpenRouter and others with a key. The engine keeps the key and never shows it.</p>');
  private readonly tplPick = el<HTMLSelectElement>('<select class="cv-input" aria-label="Prompt template"></select>');
  private readonly tplName = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Template name" maxlength="80">');
  private readonly tplText = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="4" aria-label="Template text"></textarea>');
  private readonly tplNote = el('<p class="cv-note" role="status"></p>');

  private async loadLlm(): Promise<void> {
    const s = await api.llmStatus();
    if (!s) { setText(this.llmNote, 'The formvis engine is offline: Improve Prompt needs it.'); return; }
    setText(this.keysNote, s.store === 'system' ? 'API keys (fal, the language model) are kept in your system\'s password store.' : 'API keys (fal, the language model) are kept in a file on this computer only you can read: no system password store was found.');
    if (document.activeElement !== this.llmUrl) this.llmUrl.value = s.baseUrl;
    if (document.activeElement !== this.llmModel) this.llmModel.value = s.model;
    this.llmKey.value = '';
    this.llmKey.placeholder = s.hasKey ? 'Saved (type to replace)' : 'Optional for a service on this computer';
  }

  private async saveLlm(forgetKey: boolean): Promise<void> {
    try {
      const s = await api.llmSave(this.llmUrl.value.trim(), this.llmModel.value.trim(), forgetKey ? null : this.llmKey.value.trim() || null, forgetKey);
      this.llmKey.value = '';
      this.llmKey.placeholder = s.hasKey ? 'Saved (type to replace)' : 'Optional for a service on this computer';
      setText(this.llmNote, forgetKey ? 'Key forgotten.' : `Saved: ${s.model} at ${s.baseUrl}.`);
    } catch (err) { setText(this.llmNote, err instanceof Error ? err.message : 'Could not save.'); }
  }

  private async checkLlm(): Promise<void> {
    await this.saveLlm(false);
    try {
      const models = await api.llmModels();
      this.llmModels.replaceChildren(...models.map((m) => { const o = document.createElement('option'); o.value = m; return o; }));
      setText(this.llmNote, `Answering, with ${models.length} model${models.length === 1 ? '' : 's'}${models.length ? `: ${models.slice(0, 4).join(', ')}${models.length > 4 ? '...' : ''}` : ''}.`);
    } catch (err) { setText(this.llmNote, err instanceof Error ? err.message : 'Could not reach the service.'); }
  }

  private fillTemplates(choose?: string): void {
    const list = templates(), was = choose ?? this.tplPick.value;
    this.tplPick.replaceChildren(...list.map((t) => { const o = document.createElement('option'); o.value = t.name; o.textContent = t.name; return o; }));
    this.tplPick.value = list.some((t) => t.name === was) ? was : list[0]?.name ?? '';
    this.showTemplate();
  }

  private showTemplate(): void {
    const t = templates().find((x) => x.name === this.tplPick.value);
    this.tplName.value = t?.name ?? ''; this.tplText.value = t?.text ?? ''; setText(this.tplNote, '');
  }

  private async checkComfyUI(): Promise<void> {
    const target = this.comfyuiUrl.value.trim();
    setText(this.comfyuiNote, `Checking ${target}...`);
    const c = await api.comfyuiStatus(target);
    setText(this.comfyuiNote, !c ? 'The formvis engine is offline: sending to ComfyUI needs it.' : c.running ? `ComfyUI${c.version ? ` ${c.version}` : ''} is running at ${target}.` : `ComfyUI is not answering at ${target}.`);
  }

  private async checkNodeMode(): Promise<void> {
    const target = this.nodemodeUrl.value.trim();
    setText(this.nodemodeNote, `Checking ${target}...`);
    const s = await api.nodemodeStatus(target);
    setText(this.nodemodeNote, !s ? 'The formvis engine is offline: sending to NodeMode needs it.' : !s.running ? `NodeMode is not answering at ${target}.` : s.receiver ? `NodeMode is running at ${target}.` : `NodeMode is running at ${target}, but cannot place images on its canvas yet.`);
  }

  private change(patch: Partial<Prefs>): void {
    const kept = loadPrefs();   // what tool options and dialogs remembered since this dialog opened is not overwritten
    this.prefs = { ...this.prefs, ...patch, toolOptions: kept.toolOptions, dialogValues: kept.dialogValues, whatsNewSeen: kept.whatsNewSeen };
    savePrefs(this.prefs);
    this.onPrefs(this.prefs);
  }

  private sync(): void {
    if (document.activeElement !== this.nodemodeUrl) setValue(this.nodemodeUrl, this.prefs.nodemodeUrl);
    if (document.activeElement !== this.comfyuiUrl) setValue(this.comfyuiUrl, this.prefs.comfyuiUrl);
    void this.loadLlm();
    void this.localModels.refresh();
    setText(this.budgetNote, `Largest document: ${Math.round(LIMITS.pixels / 1_000_000)} megapixels, set from this computer's memory (at least 100, at most 250).`);
    this.agents.checked = this.prefs.agentsAllowed;
    if (!this.tplPick.options.length) this.fillTemplates();
    const c = readChoice();
    setValue(this.accent, c.accentColor);
    for (const b of Array.from(this.grid.querySelectorAll<HTMLElement>('[data-theme-id]'))) {
      const id = b.dataset.themeId ?? '';
      const active = id === c.theme;
      setClass(b, 'is-active', active);
      const border = active ? c.accentColor : THEMES[id]?.vars['--border-color'] ?? '';
      if (b.dataset.border !== border) { b.dataset.border = border; b.style.borderColor = border; }
    }
  }
}

const TOOL_KEYS: ReadonlyArray<[string, string]> = [
  ['Move tool', 'V'], ['Marquee tool, Shift+M switches shape', 'M'], ['Lasso tool, Shift+L switches mode', 'L'], ['Magic Wand tool', 'W'],
  ['Brush tool', 'B'], ['Eraser', 'E'], ['Eyedropper tool', 'I'], ['Hand tool, or hold Space', 'H'], ['Zoom tool', 'Z'],
  ['Swap colors', 'X'], ['Default colors', 'D'], ['Brush size', '[  ]'], ['Brush hardness', 'Shift [  ]'], ['Brush or layer opacity', '1 to 0'],
  ['Nudge layer, Shift for 10 px', 'Arrows'],
];

export class ShortcutsDialog extends Dialog {
  private readonly search = el<HTMLInputElement>('<input class="cv-input" type="search" placeholder="Search commands" aria-label="Search shortcuts">');
  private readonly list = el('<div class="cv-list cv-keys-list" aria-label="Keyboard shortcuts"></div>');
  private readonly note = el('<div class="cv-shortcuts-note" role="status"></div>');
  private capturing: string | null = null;
  private pending: { id: string; combo: string } | null = null;
  private focusId: string | null = null;

  /** Edit > Keyboard Shortcuts (1.53.4): every command rebindable, a conflict named and reassigned or not, Reset All;
   *  kept in Preferences. Tool letters are listed, fixed by their tools. */
  constructor(private readonly commands: Commands) {
    super('Keyboard Shortcuts', 620);
    this.body.append(this.search, this.note, this.list);
    this.search.addEventListener('input', () => this.render());
    this.search.addEventListener('keydown', (e) => e.stopPropagation());
    this.button('Reset All', 'ghost', () => { this.commands.resetKeys(); this.save(); this.say(''); this.render(); });
    this.button('Close', 'primary', () => this.close());
    window.addEventListener('keydown', (e) => this.capture(e), true);
  }

  show(): void { this.capturing = null; this.pending = null; this.focusId = null; this.say(''); this.search.value = ''; this.render(); this.open(); }

  private save(): void { savePrefs({ ...loadPrefs(), shortcuts: this.commands.overrides() }); }

  private say(text: string, actions: HTMLElement[] = []): void { this.note.replaceChildren(); if (text) { const p = el('<span></span>'); setText(p, text); this.note.append(p, ...actions); } }

  private capture(e: KeyboardEvent): void {
    if (!this.capturing || !this.isOpen) return;
    e.preventDefault(); e.stopPropagation();
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;   // wait for the key itself
    const id = this.capturing;
    this.capturing = null;
    if (e.key === 'Escape') { this.say(''); this.render(); return; }
    const combo = comboOf(e), other = this.commands.forCombo(combo);
    if (other && other.id !== id) {
      this.pending = { id, combo };
      const re = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Reassign</button>'), no = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Cancel</button>');
      re.addEventListener('click', () => { const p = this.pending; this.pending = null; if (p) { this.commands.setKeys(p.id, [p.combo]); this.save(); } this.say(''); this.render(); });
      no.addEventListener('click', () => { this.pending = null; this.say(''); this.render(); });
      this.say(`${formatKeys(combo)} is used by ${this.commands.label(other)}. `, [re, no]);
      return;
    }
    this.commands.setKeys(id, [combo]);
    this.save(); this.say(''); this.render();
  }

  private render(): void {
    const q2 = this.search.value.trim().toLowerCase();
    const rows: Array<{ id: string; label: string; keys: string; tool: boolean }> = this.commands.all().map((c) => ({ id: c.id, label: this.commands.label(c).replace(/\.\.\.$/, ''), keys: (c.keys ?? []).map(formatKeys).join(', '), tool: false }))
      .filter((r) => r.label && (!q2 || r.label.toLowerCase().includes(q2) || r.keys.toLowerCase().includes(q2))).sort((a, b) => a.label.localeCompare(b.label));
    for (const [label, keys] of TOOL_KEYS) if (!q2 || label.toLowerCase().includes(q2)) rows.push({ id: `tool:${label}`, label: `${label} (tool)`, keys, tool: true });
    patchList(this.list, rows, {
      key: (r) => r.id,
      create: (r) => {
        if (r.tool) { const t = el('<div class="cv-list-row cv-keys-row is-tool"><span class="cv-list-name"></span><span class="cv-list-meta"></span></div>'); setText(q(t, '.cv-list-name'), r.label); setText(q(t, '.cv-list-meta'), r.keys); return t; }
        const n = el('<div class="cv-list-row cv-keys-row"><span class="cv-list-name"></span><span class="cv-list-meta"></span><button type="button" class="cv-btn cv-btn-ghost">Change</button><button type="button" class="cv-btn cv-btn-ghost">Remove</button></div>');
        n.dataset.command = r.id;
        const [change, remove] = [...n.querySelectorAll('button')] as HTMLButtonElement[];
        change.addEventListener('click', () => { this.capturing = r.id; this.focusId = r.id; this.pending = null; this.say(''); this.render(); });
        remove.addEventListener('click', () => { this.focusId = r.id; this.commands.setKeys(r.id, []); this.save(); this.render(); });
        this.fillRow(n, r);
        return n;
      },
      update: (n, r) => { if (!r.tool) this.fillRow(n, r); },
    });
    // Focus back on the row just edited, should the list have moved it (a moved node loses focus): focus falling out
    // of the dialog left Escape unable to close it (1.53.4).
    const btn = this.focusId ? this.list.querySelector(`.cv-keys-row[data-command="${CSS.escape(this.focusId)}"] button`) as HTMLButtonElement | null : null;
    if (btn && !btn.parentElement?.contains(document.activeElement)) btn.focus();
  }

  /** A command's row brought up to date in place: its name, its keys (or the prompt while capturing) and its buttons. */
  private fillRow(n: HTMLElement, r: { id: string; label: string; keys: string }): void {
    setText(q(n, '.cv-list-name'), r.label);
    setText(q(n, '.cv-list-meta'), this.capturing === r.id ? 'Press the new keys (Esc cancels)' : r.keys || 'none');
    const [change, remove] = [...n.querySelectorAll('button')] as HTMLButtonElement[];
    if (change.getAttribute('aria-label') !== `Change ${r.label}`) { change.setAttribute('aria-label', `Change ${r.label}`); remove.setAttribute('aria-label', `Remove ${r.label}`); }
    setDisabled(remove, !r.keys);
  }
}

/** Help > Performance Benchmark (Phase 18.7): frame times on the CPU and each graphics processor path, to copy. */
export class BenchmarkDialog extends Dialog {
  private readonly state = el('<p class="cv-note cv-bench-state">Opens a temporary 2000 x 1500 document, times panning, adjustment layers and painting on the CPU and on each graphics processor path, then closes it. It takes under a minute.</p>');
  private readonly out = el('<pre class="cv-bench-out" hidden></pre>');
  private readonly runBtn: HTMLButtonElement;

  constructor(private readonly run: () => Promise<string>) {
    super('Performance Benchmark', 640);
    this.body.append(this.state, this.out, el('<p class="cv-note">Numbers from a software graphics processor (as in a test browser) are not representative; run this on the machine you edit on.</p>'));
    this.button('Copy', 'ghost', () => { void navigator.clipboard?.writeText(this.out.textContent ?? ''); });
    this.runBtn = this.button('Run', 'primary', () => { void this.start(); });
  }

  private async start(): Promise<void> {
    setDisabled(this.runBtn, true);
    setText(this.state, 'Running...');
    try {
      setText(this.out, await this.run());
      setHidden(this.out, false);
      setText(this.state, 'Done.');
    } catch (err) {
      setText(this.state, `The benchmark stopped: ${String(err)}`);
    } finally {
      setDisabled(this.runBtn, false);
    }
  }

  show(): void { this.open(); }
}

export class AboutDialog extends Dialog {
  private readonly engineLine = el('<p class="cv-note"></p>');

  constructor() {
    super('About formvis', 420);
    this.body.appendChild(el(`<div class="cv-welcome-title">${brandMark(28)}formvis ${VERSION}</div>`));
    this.body.appendChild(el('<p class="cv-note">A layered image editor for the web and the desktop, in the NodeMode design system.</p>'));
    this.body.appendChild(this.engineLine);
    this.body.appendChild(el('<p class="cv-note">Apache License 2.0. Copyright 2026 nodemode-ai.</p>'));
    this.button('Close', 'primary', () => this.close());
  }

  show(caps: Capabilities | null): void {
    setText(this.engineLine, caps
      ? `Engine ${caps.version}${caps.desktop ? ' (desktop)' : ''} · decoders ${caps.decode.engine} · background removal ${caps.removeBackground.ml ? 'ML and lightweight' : caps.removeBackground.lite ? 'lightweight' : 'unavailable'} · data in ${caps.dataDir}`
      : 'Engine offline. Start it with ./formvis boot.');
    this.open();
  }
}

/** Image > Mode > Bitmap... and Indexed Color... (1.50.2): the choices for the conversion. */
export class ModeDialog extends Dialog {
  private readonly method = el<HTMLSelectElement>('<select class="cv-input" aria-label="Method"><option value="threshold">50% Threshold</option><option value="dither">Diffusion Dither</option></select>');
  private readonly colors = el<HTMLInputElement>('<input class="cv-input" type="number" min="2" max="256" value="256" aria-label="Colors">');
  private readonly dither = el<HTMLInputElement>('<input type="checkbox" aria-label="Dither">');
  private readonly profile = el<HTMLSelectElement>('<select class="cv-input" aria-label="Profile"></select>');
  private readonly intent = el<HTMLSelectElement>('<select class="cv-input" aria-label="Intent"><option value="perceptual">Perceptual</option><option value="relative" selected>Relative Colorimetric</option><option value="saturation">Saturation</option><option value="absolute">Absolute Colorimetric</option></select>');
  private readonly bpc = el<HTMLInputElement>('<input type="checkbox" aria-label="Use Black Point Compensation" checked>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private kind: 'bitmap' | 'indexed' | 'cmyk' = 'bitmap';
  /** Image > Mode > CMYK Color (1.54.0): the app converts through the engine with the chosen profile. */
  onCmyk: ((profileId: string, profileName: string, intent: string, bpc: boolean) => Promise<void>) | null = null;

  constructor(private readonly engine: Engine) {
    super('Mode', 340);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => {
      if (this.kind === 'cmyk') {
        if (!this.profile.value) { setText(this.note, 'No CMYK profile was found. Load one in View > Proof Setup.'); return; }
        const name = this.profile.selectedOptions[0]?.textContent ?? 'CMYK';
        this.close();
        void this.onCmyk?.(this.profile.value, name, this.intent.value, this.bpc.checked);
        return;
      }
      const ok = this.kind === 'bitmap'
        ? this.engine.convertMode('bitmap', { dither: this.method.value === 'dither' })
        : this.engine.convertMode('indexed', { colors: Math.max(2, Math.min(256, Math.round(Number(this.colors.value) || 256))), dither: this.dither.checked });
      if (ok || !this.engine.current) this.close();
    });
  }

  show(kind: 'bitmap' | 'indexed' | 'cmyk'): void {
    this.kind = kind;
    this.setTitle(kind === 'bitmap' ? 'Bitmap' : kind === 'indexed' ? 'Indexed Color' : 'CMYK Color');
    if (kind === 'cmyk') {
      setText(this.note, '');
      this.body.replaceChildren(el('<p class="cv-dialog-note">Every pixel layer is converted to ink through the profile, exactly, by the engine; tools that do not know ink yet wait until Mode > RGB Color.</p>'), rowOf('Profile', this.profile), rowOf('Intent', this.intent), rowOf('Use Black Point Compensation', this.bpc), this.note);
      this.open();
      void this.listProfiles();
      return;
    }
    this.body.replaceChildren(el(`<p class="cv-dialog-note">${kind === 'bitmap' ? 'The image is flattened, then made black and white.' : 'The image is flattened, then made of a palette of at most 256 colours: every colour when there are that few, else the ones that best represent it.'}</p>`),
      kind === 'bitmap' ? rowOf('Method', this.method) : rowOf('Colors', this.colors), ...(kind === 'indexed' ? [rowOf('Dither', this.dither)] : []));
    this.open();
  }

  private async listProfiles(): Promise<void> {
    try {
      const all = (await api.colourProfiles()).profiles.filter((p) => p.space === 'CMYK');
      this.profile.replaceChildren(...all.map((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; return o; }));
      const shipped = all.find((p) => p.shipped);
      if (shipped) this.profile.value = shipped.id;
      if (!all.length) setText(this.note, 'No CMYK profile was found. Load one in View > Proof Setup.');
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The engine did not answer.'); }
  }
}

function rowOf(label: string, control: HTMLElement): HTMLElement {
  const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`);
  r.append(control);
  return r;
}

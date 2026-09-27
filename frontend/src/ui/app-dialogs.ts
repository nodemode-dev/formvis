import type { Engine } from '../engine';
import { api, type Capabilities, type LibraryItem } from '../io/api';
import { PROJECT_ACCEPT } from '../io/images';
import { VERSION } from '../version';
import type { Commands } from './commands';
import { Dialog, confirmAction } from './dialogs';
import { el, patchList, q, setClass, setDisabled, setHidden, setText, setValue } from './dom';
import { icon } from './icons';
import { brandMark } from './brand';
import { THEMES, readChoice, setAccent, setIntensity, setTheme, themeSwatchesHtml } from './themes';
import { toast } from './toast';
import { ENGINE_CHOICES, RECOVERY_CHOICES, loadPrefs, savePrefs, type EngineDevice, type Prefs } from './prefs';
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

/** New Document as the target's (Phase 21, UI_SPEC.md section 4): categories at the left; a search over every preset and
 *  the presets as cards, each preview shaped as its document; at the right Name (pre-selected), Width, a link, Height and
 *  Unit, Resolution, Orientation, Color Mode (sonny's documents are RGB, 8 bit), Background Contents and Artboards; a
 *  live summary of the size and its memory (3 bytes a pixel, as Photoshop counts RGB); Cancel at the left, Create at the
 *  right. Every value is what the document is made with. */
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
    const mode = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Color Mode" disabled><option>RGB Color</option></select>');
    const depth = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Bit depth" disabled><option>8 bit</option></select>');
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
    this.button('Create', 'primary', () => this.create());
    this.link.addEventListener('click', () => { const on = !this.link.classList.contains('is-on'); this.link.classList.toggle('is-on', on); this.link.setAttribute('aria-pressed', String(on)); });
    const fromUnit = (v: number): number => { const u = this.unit.value as Unit, r = this.ppi(); return Math.max(1, Math.round(u === 'px' ? v : (v / PER_INCH[u]) * r)); };
    this.wIn.addEventListener('change', () => { const n = parseFloat(this.wIn.value); if (!Number.isFinite(n)) return this.sync(); const w = fromUnit(n); this.px = { w, h: this.linked() ? Math.max(1, Math.round((w * this.px.h) / this.px.w)) : this.px.h }; this.picked = null; this.sync(); });
    this.hIn.addEventListener('change', () => { const n = parseFloat(this.hIn.value); if (!Number.isFinite(n)) return this.sync(); const h = fromUnit(n); this.px = { h, w: this.linked() ? Math.max(1, Math.round((h * this.px.w) / this.px.h)) : this.px.w }; this.picked = null; this.sync(); });
    this.unit.addEventListener('change', () => this.sync());
    this.res.addEventListener('change', () => this.sync());
    for (const i of [this.name, this.wIn, this.hIn, this.res]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); this.create(); } });
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
      const page = card.querySelector('.cv-nd-page') as HTMLElement, s = Math.min(150 / p.w, 76 / p.h);
      page.style.width = `${Math.max(8, Math.round(p.w * s))}px`;
      page.style.height = `${Math.max(8, Math.round(p.h * s))}px`;
      setText(card.querySelector('.cv-nd-name') as HTMLElement, p.name);
      setText(card.querySelector('.cv-nd-spec') as HTMLElement, `${p.w} × ${p.h} px · ${p.ppi} ppi`);
      card.title = p.name;
      card.classList.toggle('is-on', this.picked === p);
      card.addEventListener('click', () => { this.pick(p); this.renderCards(); });
      card.addEventListener('dblclick', () => { this.pick(p); this.create(); });
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
    const mb = (this.px.w * this.px.h * 3) / (1024 * 1024);
    (this.summary.querySelector('.cv-nd-size') as HTMLElement).innerHTML = `${this.px.w} × ${this.px.h} <span>px</span>`;
    setText(this.summary.querySelector('.cv-nd-meta') as HTMLElement, `RGB Color · 8 bit · ${mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`}`);
    this.renderCards();
  }

  show(): void {
    this.name.value = `Untitled-${this.engine.projects.length + 1}`;
    this.renderCards();
    this.open(this.name);
    this.name.select();
  }

  private create(): void {
    const fill = this.fill.value as 'transparent' | 'white' | 'background';
    const p = this.engine.newDocument(this.px.w, this.px.h, this.name.value.trim() || 'Untitled', fill, this.ppi());
    if (!p) return;
    if (this.artboards.checked) this.engine.newArtboard({ x: 0, y: 0, w: this.px.w, h: this.px.h }, fill === 'transparent' ? null : { r: 255, g: 255, b: 255 });
    this.close();
  }
}

export interface OpenActions {
  openLibrary(name: string): Promise<boolean>;
  openFiles(files: File[]): Promise<void>;
  openFolder(files: File[], paths: string[]): Promise<void>;
}

export class OpenDialog extends Dialog {
  private readonly list = el('<div class="cv-list" role="listbox" aria-label="Saved projects"></div>');
  private readonly empty = el('<div class="cv-list-empty" hidden>No saved projects yet.</div>');
  private readonly status = el('<p class="cv-note">Projects saved in the sonny library.</p>');
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
    const row = el(`<div class="cv-welcome-actions"><button class="cv-btn" type="button" data-from="file">${icon('upload', 14)}From disk</button><button class="cv-btn" type="button" data-from="folder">${icon('folderOpen', 14)}Project folder</button></div>`);
    this.body.append(row, this.fileInput, this.folderInput);
    q(row, '[data-from="file"]').addEventListener('click', () => this.fileInput.click());
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
      setText(this.status, 'Projects saved in the sonny library.');
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
  private readonly memoryRow = sliderRow('History memory (MB)', 16, 4096, 16, (v) => this.change({ historyMB: v }));
  private readonly redrawRow = checkRow('Redraw only what a brush stroke changed', (v) => this.change({ regionRedraws: v }));
  private readonly recoveryRow = selectRow('Keep recovery information after changes, within', RECOVERY_CHOICES, (v) => this.change({ recoverySeconds: Number(v) }));
  private readonly homeRow = checkRow('Auto show the Home Screen', (v) => this.change({ autoShowHome: v }));
  /** Graphics Processor Settings (Phase 18.1): the detected processor, Use Graphics Processor, the renderer and the GPU
   *  memory limit, with the mode in use and why. */
  private readonly gpuName = el('<span class="cv-gpu-name">Detecting...</span>');
  private readonly gpuMode = el('<p class="cv-note cv-gpu-mode"></p>');
  private readonly gpuUseRow = checkRow('Use Graphics Processor', (v) => this.change({ useGpu: v }));
  private readonly rendererRow = selectRow('Renderer', RENDERER_CHOICES, (v) => this.change({ renderer: v as GpuRenderer }));
  private readonly gpuMemoryRow = sliderRow('GPU memory (MB)', 128, 16384, 128, (v) => this.change({ gpuMemoryMB: v }));
  /** The engine's compute device (Phase 18.6): the choice, and what the engine reports it uses and why. */
  private readonly engineRow = selectRow('Engine processor', ENGINE_CHOICES, (v) => this.change({ engineDevice: v as EngineDevice }));
  private readonly engineMode = el('<p class="cv-note cv-engine-mode">Engine: not reached yet.</p>');

  /** Edit > Preferences (Ctrl+,), laid out as Photoshop's: sections on the left, each section's settings on the right,
   *  kept on this device. `onPrefs` puts a change into effect. */
  constructor(private readonly onPrefs: (p: Prefs) => void) {
    super('Preferences', 620);
    const t = document.createElement('template');
    t.innerHTML = themeSwatchesHtml();
    this.grid.append(t.content);
    const row = el('<div class="cv-field"><span>Theme</span></div>');
    row.appendChild(this.grid);
    const pages = el('<div class="cv-prefs-pages"></div>');
    const add = (name: string, ...content: HTMLElement[]): void => {
      const tab = el<HTMLButtonElement>('<button class="cv-prefs-tab" type="button" role="tab"></button>');
      tab.textContent = name;
      tab.addEventListener('click', () => this.showSection(name));
      this.nav.appendChild(tab);
      const page = el('<div class="cv-prefs-page" role="tabpanel"></div>');
      page.append(...content);
      pages.appendChild(page);
      this.sections.set(name, page);
    };
    const accentRow = el('<label class="cv-field"><span>Accent</span></label>');
    accentRow.appendChild(this.accent);
    add('General', this.homeRow.el, el('<p class="cv-note">With it on, the Home screen shows whenever no document is open. The brand mark at the top left opens it at any time; Esc leaves it.</p>'));
    this.intensityRow.set(Math.round((readChoice().intensity ?? 1) * 100));
    add('Interface', row, accentRow, this.intensityRow.el, el('<p class="cv-note">Theme and accent are shared with NodeMode on this device. Intensity sets how strongly the accent tints what it marks; 100% is the design\'s.</p>'));
    add('Performance', this.statesRow.el, this.memoryRow.el, this.redrawRow.el,
      el('<p class="cv-note">History States is how many steps undo keeps (Photoshop keeps 50 by default, up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as Photoshop\'s Memory Usage does, so this is the part sonny controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.</p>'),
      el('<h3 class="cv-prefs-sub">Graphics Processor Settings</h3>'), this.gpuNameRow(), this.gpuUseRow.el, this.rendererRow.el, this.gpuMemoryRow.el, this.gpuMode,
      el('<p class="cv-note">Automatic uses WebGPU (Metal on macOS, Direct3D 12 on Windows), then WebGL2 (as on Linux), on a hardware graphics processor, and the CPU otherwise; a software GPU is slower than the CPU renderer, so Automatic does not use one. If the graphics processor fails to start, sonny turns this off and says so. The canvas draws on the graphics processor; a document using something it does not draw yet draws on the CPU, and the status bar says why.</p>'),
      el('<h3 class="cv-prefs-sub">Engine</h3>'), this.engineRow.el, this.engineMode,
      el('<p class="cv-note">Where the engine runs its models (Remove Background, and the local models that follow). Automatic uses CUDA on an NVIDIA graphics processor, Core ML (Metal) on a Mac, and the CPU otherwise; a choice this machine cannot run falls back to the CPU, and the line above says why.</p>'));
    add('File Handling', this.recoveryRow.el, el('<p class="cv-note">Unsaved documents are kept on this device so they can be recovered after a crash; this is how soon after a change that happens.</p>'));
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
  show(section?: string): void {
    this.prefs = loadPrefs();
    this.statesRow.set(this.prefs.historyStates);
    this.memoryRow.set(this.prefs.historyMB);
    this.redrawRow.set(this.prefs.regionRedraws);
    this.recoveryRow.set(String(this.prefs.recoverySeconds));
    this.homeRow.set(this.prefs.autoShowHome);
    this.gpuUseRow.set(this.prefs.useGpu);
    this.rendererRow.set(this.prefs.renderer);
    this.gpuMemoryRow.set(this.prefs.gpuMemoryMB);
    this.engineRow.set(this.prefs.engineDevice);
    if (section && this.sections.has(section)) this.showSection(section);
    this.sync();
    this.open();
  }

  private gpuNameRow(): HTMLElement {
    const row = el('<div class="cv-field"><span>Detected Graphics Processor</span></div>');
    row.appendChild(this.gpuName);
    return row;
  }

  /** The probe's result: the processor's name, or none (Use Graphics Processor then greyed, as Photoshop greys it),
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
    for (const tab of Array.from(this.nav.children) as HTMLElement[]) { const on = tab.textContent === name; setClass(tab, 'is-active', on); tab.setAttribute('aria-selected', String(on)); }
  }

  private change(patch: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    savePrefs(this.prefs);
    this.onPrefs(this.prefs);
  }

  private sync(): void {
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
  private readonly list = el('<div class="cv-list" aria-label="Keyboard shortcuts"></div>');

  constructor(private readonly commands: Commands) {
    super('Keyboard Shortcuts', 520);
    this.body.appendChild(this.list);
    this.button('Close', 'primary', () => this.close());
  }

  show(): void {
    const rows: Array<{ key: string; label: string; keys: string }> = [];
    for (const c of this.commands.all()) if (c.keys?.length) rows.push({ key: c.id, label: this.commands.label(c), keys: this.commands.keyLabel(c) });
    for (const [label, keys] of TOOL_KEYS) rows.push({ key: `tool:${label}`, label, keys });
    patchList(this.list, rows, {
      key: (r) => r.key,
      create: (r) => {
        const n = el('<div class="cv-list-row"><span></span><span class="cv-list-name"></span><span class="cv-list-meta"></span></div>');
        setText(q(n, '.cv-list-name'), r.label);
        setText(q(n, '.cv-list-meta'), r.keys);
        return n;
      },
      update: (n, r) => { setText(q(n, '.cv-list-name'), r.label); setText(q(n, '.cv-list-meta'), r.keys); },
    });
    this.open();
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
    super('About sonny', 420);
    this.body.appendChild(el(`<div class="cv-welcome-title">${brandMark(28)}sonny ${VERSION}</div>`));
    this.body.appendChild(el('<p class="cv-note">A layered image editor for the web and the desktop, in the NodeMode design system.</p>'));
    this.body.appendChild(this.engineLine);
    this.body.appendChild(el('<p class="cv-note">Apache License 2.0. Copyright 2026 nodemode-ai.</p>'));
    this.button('Close', 'primary', () => this.close());
  }

  show(caps: Capabilities | null): void {
    setText(this.engineLine, caps
      ? `Engine ${caps.version}${caps.desktop ? ' (desktop)' : ''} · decoders ${caps.decode.engine} · background removal ${caps.removeBackground.ml ? 'ML and lightweight' : caps.removeBackground.lite ? 'lightweight' : 'unavailable'} · data in ${caps.dataDir}`
      : 'Engine offline. Start it with ./sonny boot.');
    this.open();
  }
}

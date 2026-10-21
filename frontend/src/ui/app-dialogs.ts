import type { Engine, ResampleMethod } from '../engine';
import { api, type Capabilities, type LibraryItem } from '../io/api';
import { saveTemplates, templates } from '../io/prompt-templates';
import { recipes } from '../io/comfy';
import { comfyuiProbeText } from './panels/send-to';
import { LocalModelsSection } from './panels/local-models';
import { ApiKeysSection, ComfyAuthSection, HuggingFaceToken, LlmRows, LocalFilesSection, ModelFolderSection, PluginSwitchesSection, PluginsFolderSection, RecipesSection, RenderingSection, SettingsLocationSection, SkinsSection, TemplateFiles, UpdatesSection } from './panels/connection-settings';
import { IMAGE_ACCEPT, PROJECT_ACCEPT } from '../io/images';
import { RAW_SHARPEN_AMOUNTS, RAW_SHARPEN_CHOICES, type RawSharpen, type RawSharpenAmount } from '../io/raw-sharpen';
import { PRESET_ACCEPT } from './panels/preset-manager-dialog';
import { VERSION } from '../version';
import { benchText, heapText, loadBaseline, resultWord, saveBaseline, versus, type Baseline, type BenchOptions, type BenchResult, type BenchRow } from '../gpu/bench';
import { comboOf, formatKeys, type Commands } from './commands';
import { LIMITS, TILED_SIDE, type RGB } from '../engine/types';
import type { BitmapMethod, DitherKind, ForcedKind, HalftoneShape, PaletteKind } from '../engine/quantize';
import { parseAct } from './panels/color-table-dialog';
import { Dialog, confirmAction, promptName } from './dialogs';
import { cleanBindings } from './prefs';
import { chooseKys } from './kys-import';
import { el, patchList, q, setClass, setDisabled, setHidden, setText, setValue } from './dom';
import { languages, onLanguage, setLanguage, t, type Lang } from './i18n';
import { icon } from './icons';
import { evalExpr } from './number-fields';
import { brandMark } from './brand';
import { THEMES, readChoice, setAccent, setIntensity, setTheme, themeSwatchesHtml } from './themes';
import { toast } from './toast';
import { DEFAULT_PREFS, INTERPOLATIONS, LINE_STYLES, type LineStyle } from './prefs';
import { CHECKER_COLORS, CHECKER_SIZES, ENGINE_CHOICES, GRID_UNITS, PAINT_CURSORS, PRESSURE_CURVES, RAW_WB_CHOICES, RECOVERY_CHOICES, RULER_UNITS, UI_FONT_SIZES, UI_SCALES, gridUnitPx, loadPrefs, openResolution, recalled, remembered, savePrefs, setUiScale, uiScaleChoice, type CheckerColors, type CheckerSize, type EngineDevice, type GridUnit, type PaintCursor, type Prefs, type PressureCurve, type RulerUnits, type UiFontSize } from './prefs';
import { POWER_CHOICES, RENDERER_CHOICES, type GpuPower, type GpuRenderer } from '../gpu/probe';
import { FRAME_PACING } from '../gpu/frame-trace';
import { TILE_SIZES } from '../engine/tiled';
import { toggleRow as checkRow, toggleOf, numberRow, selectRow, sliderRow, type Row } from './panels/controls';
import { PagePrefsRows } from './panels/page-prefs';
import { SIZES, atClass, generationModels, shapesFor } from './panels/generate-image';

/** New Document presets by category (Phase 21, UI_SPEC.md section 4, the target's s02 to s14): name, width, height in
 *  pixels and resolution in ppi; common sizes for each kind of work (the Web set as the target lists it). */
interface DocPreset { name: string; w: number; h: number; ppi: number; limit?: number }
/** The person's own presets (New Document > Saved): kept in this browser or window profile. */
const SAVED_PRESETS_KEY = 'formvis.newDocumentPresets';
function loadSavedPresets(): DocPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_PRESETS_KEY) ?? '[]') as unknown;
    return (Array.isArray(raw) ? raw : []).filter((p): p is DocPreset => !!p && typeof p.name === 'string' && Number.isInteger(p.w) && Number.isInteger(p.h) && p.w >= 1 && p.h >= 1 && Number.isFinite(p.ppi));
  } catch { return []; }
}
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
  { id: 'model', label: 'Model Sizes', presets: SIZES.map(([, words, w, h]) => ({ name: words.replace(/ \(.*\)$/, ''), w, h, ppi: 72 })) },
  { id: 'mine', label: 'Saved', presets: loadSavedPresets() },
];
type Unit = 'px' | 'in' | 'cm' | 'mm' | 'col';
const PER_INCH: Record<Unit, number> = { px: 0, in: 1, cm: 2.54, mm: 25.4, col: 25.4 };
/** Millimeters in n columns and back, from Preferences > Units & Rulers: n widths and n minus 1 gutters. */
const columnsToMm = (n: number): number => { const p = loadPrefs(); return n * p.colWidth + (n - 1) * p.gutter; };
const mmToColumns = (mm: number): number => { const p = loadPrefs(); return (mm + p.gutter) / (p.colWidth + p.gutter); };

/** The color modes New Document offers, each with its label, its channels and the bit depths it allows: Bitmap one bit; Grayscale and RGB 8, 16 or 32; CMYK and Lab 8, 16 or 32 (CMYK and Lab keep their ink and Lab values as floats at 32 bits, not linear light). */
export type NewMode = 'bitmap' | 'grayscale' | 'rgb' | 'cmyk' | 'lab';
export type NewDepth = 1 | 8 | 16 | 32;
const NEW_MODES: ReadonlyArray<{ id: NewMode; label: string; channels: number; depths: readonly NewDepth[] }> = [
  { id: 'bitmap', label: 'Bitmap', channels: 1, depths: [1] },
  { id: 'grayscale', label: 'Grayscale', channels: 1, depths: [8, 16, 32] },
  { id: 'rgb', label: 'RGB Color', channels: 3, depths: [8, 16, 32] },
  { id: 'cmyk', label: 'CMYK Color', channels: 4, depths: [8, 16, 32] },
  { id: 'lab', label: 'Lab Color', channels: 3, depths: [8, 16, 32] },
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
  private readonly unit = el<HTMLSelectElement>('<select class="cv-nd-input cv-nd-mono" aria-label="Unit"><option value="px">px</option><option value="in">in</option><option value="cm">cm</option><option value="mm">mm</option><option value="col">columns</option></select>');
  private readonly res = el<HTMLInputElement>('<input class="cv-nd-input cv-nd-mono" type="text" inputmode="decimal" value="72" aria-label="Resolution">');
  private readonly fill = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Background Contents"><option value="white">White</option><option value="background">Background Color</option><option value="black">Black</option><option value="custom">Custom</option><option value="transparent">Transparent</option></select>');
  private readonly fillColour = el<HTMLInputElement>('<input class="cv-nd-colour" type="color" value="#808080" aria-label="Custom background color" hidden>');
  private readonly savePreset = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button" title="Keeps the current size and resolution under the name above">Save as Preset</button>');
  private readonly deletePreset = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button" title="Removes the chosen saved preset" hidden>Delete Preset</button>');
  private readonly artboards = el<HTMLInputElement>('<input type="checkbox" aria-label="Artboards">');
  private readonly link = el<HTMLButtonElement>(`<button class="cv-nd-link is-on" type="button" title="Keep the proportions" aria-pressed="true">${icon('link', 14)}</button>`);
  private readonly cards = el('<div class="cv-nd-cards"></div>');
  private readonly search = el<HTMLInputElement>('<input class="cv-nd-search" type="search" placeholder="Search all presets..." aria-label="Search all presets">');
  private readonly summary = el('<div class="cv-nd-summary"><div class="cv-nd-size"></div><div class="cv-nd-meta"></div></div>');
  private readonly orient: HTMLButtonElement[];
  private readonly sizeClass = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Size class" disabled><option value="0">Model\'s own size</option><option value="1024">Up to 1024 px</option><option value="1536">Up to 1536 px</option><option value="2048">Up to 2048 px</option></select>');
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
    side.append(label('Name', this.name), sizeRow, pair(label('Resolution', this.res, el('<span class="cv-nd-unit">ppi</span>')), label('Orientation', seg)), pair(label('Color Mode', mode), label('&nbsp;', depth)), label('Size class', this.sizeClass), label('Background Contents', this.fill, this.fillColour), ab, this.summary, el('<div class="cv-nd-presetbar"></div>'));
    const bar = q(side, '.cv-nd-presetbar');
    this.savePreset.addEventListener('click', () => this.saveCurrent());
    this.deletePreset.addEventListener('click', () => this.deleteCurrent());
    bar.append(this.savePreset, this.deletePreset);
    this.fill.addEventListener('change', () => setHidden(this.fillColour, this.fill.value !== 'custom'));
    const grid = el('<div class="cv-nd-grid"></div>');
    grid.append(cats, mid, side);
    this.body.appendChild(grid);
    this.button('Cancel', 'ghost', () => this.close());
    this.createBtn = this.button('Create', 'primary', () => void this.create());
    this.link.addEventListener('click', () => { const on = !this.link.classList.contains('is-on'); this.link.classList.toggle('is-on', on); this.link.setAttribute('aria-pressed', String(on)); });
    const fromUnit = (v: number): number => { const u = this.unit.value as Unit, r = this.ppi(); return Math.max(1, Math.round(u === 'px' ? v : u === 'col' ? (columnsToMm(v) / 25.4) * r : (v / PER_INCH[u]) * r)); };
    this.wIn.addEventListener('change', () => { const n = evalExpr(this.wIn.value) ?? parseFloat(this.wIn.value); if (!Number.isFinite(n)) return this.sync(); const w = fromUnit(n); this.px = { w, h: this.linked() ? Math.max(1, Math.round((w * this.px.h) / this.px.w)) : this.px.h }; this.picked = null; this.sync(); });
    this.hIn.addEventListener('change', () => { const n = evalExpr(this.hIn.value) ?? parseFloat(this.hIn.value); if (!Number.isFinite(n)) return this.sync(); const h = fromUnit(n); this.px = { h, w: this.linked() ? Math.max(1, Math.round((h * this.px.w) / this.px.h)) : this.px.w }; this.picked = null; this.sync(); });
    this.unit.addEventListener('change', () => this.sync());
    this.sizeClass.addEventListener('change', () => { if (this.picked?.limit) this.px = this.classed(this.picked); this.sync(); });
    this.res.addEventListener('change', () => { const r = evalExpr(this.res.value); if (r !== null) this.res.value = String(Math.round(r * 100) / 100); this.sync(); });
    for (const i of [this.name, this.wIn, this.hIn, this.res]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); void this.create(); } });
    this.pick(PRESET_GROUPS[3].presets[0]);
  }

  private linked(): boolean { return this.link.classList.contains('is-on'); }
  private ppi(): number { const r = parseFloat(this.res.value); return Number.isFinite(r) && r >= 1 && r <= 10000 ? r : 72; }

  private pick(p: DocPreset): void {
    this.picked = p;
    this.px = this.classed(p);
    // Preferences > Units & Rulers: the print and screen resolution a preset opens at (a saved preset keeps its own)
    const prefs = loadPrefs(), own = this.savedGroup().presets.includes(p);
    this.res.value = String(own ? p.ppi : p.ppi === 300 ? prefs.printRes : p.ppi === 72 ? prefs.screenRes : p.ppi);
    this.unit.value = 'px';
    this.sync();
  }

  /** A model's preset at the size class chosen: the longer side the class names (never past the model's own limit), the shape kept. */
  private classed(p: DocPreset): { w: number; h: number } {
    const c = Number(this.sizeClass.value);
    if (!c || !p.limit) return { w: p.w, h: p.h };
    const [w, h] = atClass(p.w, p.h, Math.min(c, p.limit));
    return { w, h };
  }

  private savedGroup(): { presets: DocPreset[] } { return PRESET_GROUPS.find((g) => g.id === 'mine') as { presets: DocPreset[] }; }

  /** Keeps the current size and resolution as a saved preset named as the Name field says; the same name is replaced. */
  private saveCurrent(): void {
    const name = this.name.value.trim();
    if (!name) { toast('Give the document a name first; the preset is kept under it.', 'info'); return; }
    const list = this.savedGroup().presets, preset = { name, w: this.px.w, h: this.px.h, ppi: this.ppi() };
    const at = list.findIndex((p) => p.name === name);
    if (at >= 0) list.splice(at, 1, preset); else list.push(preset);
    this.persistSaved();
    this.category = 'mine';
    this.search.value = '';
    this.picked = preset;
    this.renderCards();
    toast(`Saved the preset ${name}.`, 'info');
  }

  private deleteCurrent(): void {
    const list = this.savedGroup().presets, at = this.picked ? list.indexOf(this.picked) : -1;
    if (at < 0) return;
    list.splice(at, 1);
    this.picked = null;
    this.persistSaved();
    this.renderCards();
  }

  private persistSaved(): void {
    try { localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(this.savedGroup().presets)); } catch { /* the preset lasts until the window closes */ }
  }

  private renderCards(): void {
    for (const b of this.scrim.querySelectorAll<HTMLElement>('.cv-nd-cat')) b.classList.toggle('is-on', !this.search.value.trim() && b.dataset.cat === this.category);
    setHidden(this.deletePreset, !this.picked || !this.savedGroup().presets.includes(this.picked));
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
    const show = (px: number): string => (u === 'px' ? String(px) : u === 'col' ? String(Math.round(mmToColumns((px / r) * 25.4) * 100) / 100) : String(Math.round((px / r) * PER_INCH[u] * 100) / 100));
    if (document.activeElement !== this.wIn) this.wIn.value = show(this.px.w);
    if (document.activeElement !== this.hIn) this.hIn.value = show(this.px.h);
    for (const b of this.orient) b.classList.toggle('is-on', b.dataset.orient === (this.px.h > this.px.w ? 'portrait' : 'landscape'));
    const classable = !!this.picked?.limit;
    if (this.sizeClass.disabled === classable) this.sizeClass.disabled = !classable;
    // The size by the mode's channels at its depth (1.50.3): RGB three bytes a pixel at 8 bit, Bitmap an eighth (one bit).
    const m = NEW_MODES.find((x) => x.id === this.mode?.value) ?? NEW_MODES[2], bits = Number(this.depth?.value) || m.depths[0];
    const mb = (this.px.w * this.px.h * m.channels * bits) / 8 / (1024 * 1024);
    (this.summary.querySelector('.cv-nd-size') as HTMLElement).innerHTML = `${this.px.w} × ${this.px.h} <span>px</span>`;
    const giant = this.px.w > LIMITS.side || this.px.h > LIMITS.side || this.px.w * this.px.h > LIMITS.pixels;
    setText(this.summary.querySelector('.cv-nd-meta') as HTMLElement, `${t(m.label)} · ${bits} ${t('bit')} · ${mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`}${giant ? ` · ${t('kept in tiles: memory is used only where something is drawn')}` : ''}`);
    this.renderCards();
  }

  show(): void {
    this.name.value = `Untitled-${this.engine.projects.length + 1}`;
    this.recall();
    this.renderCards();
    this.open(this.name);
    this.name.select();
    void this.loadModelSizes();
  }

  /** Model Sizes gets each usable model on this computer's own working sizes from its catalogue (the common five otherwise), named after the model; the cards are rebuilt only when that category is showing. */
  private async loadModelSizes(): Promise<void> {
    let found: Awaited<ReturnType<typeof generationModels>>;
    try { found = await generationModels(); } catch { return; }
    const group = PRESET_GROUPS.find((g) => g.id === 'model');
    if (!group) return;
    const own: DocPreset[] = [];
    for (const m of found.models) {
      const shapes = shapesFor(m.value, found.sizes[m.value] ?? []);
      if (m.disabled || shapes === SIZES) continue;
      const name = m.label.replace(/ \((this computer)\)$/, ''), limit = m.value === 'fal' ? 1440 : 2048;
      for (const s of shapes) own.push({ name: `${name}: ${s[1].replace(/ \(.*\)$/, '')}`, w: s[2], h: s[3], ppi: 72, limit });
    }
    const common = SIZES.map(([, words, w, h]): DocPreset => ({ name: words.replace(/ \(.*\)$/, ''), w, h, ppi: 72 }));
    const next = [...common, ...own.filter((o) => !common.some((c) => c.name === o.name))];
    if (next.length === group.presets.length && next.every((p, i) => p.name === group.presets[i].name && p.w === group.presets[i].w && p.h === group.presets[i].h && p.limit === group.presets[i].limit)) return;
    const picked = this.picked, was = picked ? { name: picked.name, w: picked.w, h: picked.h } : null;
    group.presets.splice(0, group.presets.length, ...next);
    if (was) this.picked = group.presets.find((p) => p.name === was.name && p.w === was.w && p.h === was.h) ?? picked;
    if (this.category === 'model' || this.search.value.trim()) this.renderCards();
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
    const klass = get('sizeClass');
    if (has(this.sizeClass, klass)) this.sizeClass.value = klass;
    if (has(this.fill, fill)) this.fill.value = fill;
    const hexKept = get('fillHex');
    if (typeof hexKept === 'string' && /^#[0-9a-f]{6}$/i.test(hexKept)) this.fillColour.value = hexKept;
    setHidden(this.fillColour, this.fill.value !== 'custom');
    if (has(this.mode, mode)) { this.mode.value = mode; this.depthsFor(mode as NewMode); }
    if (has(this.depth, depth)) this.depth.value = depth;
    if (typeof res === 'string' && Number.isFinite(parseFloat(res))) this.res.value = res;
    if (typeof get('artboards') === 'boolean') this.artboards.checked = get('artboards') as boolean;
    const linked = get('link');
    if (typeof linked === 'boolean') { this.link.classList.toggle('is-on', linked); this.link.setAttribute('aria-pressed', String(linked)); }
    if (w >= 1 && h >= 1 && w <= TILED_SIDE && h <= TILED_SIDE) { this.px = { w: Math.round(w), h: Math.round(h) }; this.picked = null; }
    const cat = get('category');
    if (typeof cat === 'string' && PRESET_GROUPS.some((g) => g.id === cat)) this.category = cat;
    this.sync();
  }

  private keepValues(): void {
    const set = (k: string, v: string | boolean): void => remembered('New Document', k, v);
    set('w', String(this.px.w)); set('h', String(this.px.h)); set('unit', this.unit.value); set('res', String(this.ppi()));
    set('sizeClass', this.sizeClass.value); set('mode', this.mode.value); set('depth', this.depth.value); set('fill', this.fill.value); set('fillHex', this.fillColour.value); set('artboards', this.artboards.checked); set('link', this.linked()); set('category', this.category);
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
      const choice = this.fill.value, hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(this.fillColour.value);
      const rgb: RGB | null = choice === 'black' ? { r: 0, g: 0, b: 0 } : choice === 'custom' && hex ? { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16) } : null;
      const fill = rgb ?? (choice === 'custom' ? 'white' : choice as 'transparent' | 'white' | 'background');
      const p = this.engine.newDocument(this.px.w, this.px.h, this.name.value.trim() || 'Untitled', fill, this.ppi());
      if (!p) return;
      await apply();
      if (this.artboards.checked) this.engine.newArtboard({ x: 0, y: 0, w: this.px.w, h: this.px.h }, fill === 'transparent' ? null : rgb ?? { r: 255, g: 255, b: 255 });
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
  private readonly fileInput = el<HTMLInputElement>(`<input type="file" multiple accept="${PROJECT_ACCEPT},${IMAGE_ACCEPT},${PRESET_ACCEPT}" data-role="open-files" hidden>`);
  private readonly folderInput = el<HTMLInputElement>('<input type="file" hidden>');
  private readonly openBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;
  private items: LibraryItem[] = [];
  private selected: string | null = null;

  constructor(private readonly actions: OpenActions) {
    super('Open Project', 500);
    this.folderInput.webkitdirectory = true;
    this.body.append(this.status, this.list, this.empty);
    const row = el(`<div class="cv-welcome-actions"><button class="cv-btn" type="button" data-from="file" title="Any projects (.fvd, .fmv, PSD, OpenRaster and more), pictures or preset files on this computer; choose several to open them all">${icon('upload', 14)}Browse...</button><button class="cv-btn" type="button" data-from="folder" title="An unpacked project folder, or every project and picture in a folder">${icon('folderOpen', 14)}Folder...</button></div>`);
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
  private pagesEl: HTMLElement | null = null;
  private shell: { frame: HTMLElement; rail: HTMLElement; port: HTMLElement; shade: SVGPathElement; line: SVGPathElement } | null = null;
  private current = '';
  private wireRaf = 0;
  private spyRaf = 0;
  private spyMuted = 0;
  private wireD = '';
  private portY = Number.NaN;
  private prefs: Prefs = loadPrefs();
  /** How strongly the accent tints what it marks: selections, active tools and tabs (the owner's walkthrough). */
  private readonly intensityRow = sliderRow('Accent intensity (%)', 0, 150, 5, (v) => setIntensity(v / 100));
  private readonly statesRow = sliderRow('History States', 1, 1000, 1, (v) => this.change({ historyStates: v }));
  private readonly memoryRow = sliderRow('History memory (MB)', 16, 4096, 16, (v) => this.change({ historyMB: v, historyAuto: false }));
  /** 1.61.3: automatic is 40% of what this computer allows formvis; moving the slider above chooses a figure instead. */
  private readonly memoryAutoRow = checkRow('History memory set automatically from this computer\'s memory', (v) => this.change({ historyAuto: v }));
  private readonly redrawRow = checkRow('Redraw only what a brush stroke changed', (v) => this.change({ regionRedraws: v }));
  private readonly reuseRow = checkRow('Keep the layers below the one being painted as one picture', (v) => this.change({ layerReuse: v }));
  private readonly previewRow = checkRow('Full Resolution Previews (slower on large pictures)', (v) => this.change({ fullPreviews: v }));
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
  private readonly placeTransformRow = checkRow('Start placed pictures in Free Transform', (v) => this.change({ placeTransform: v }));
  private readonly placeFitRow = checkRow('Resize Image During Place', (v) => this.change({ placeFit: v }));
  private readonly placeSmartRow = checkRow('Always Create Smart Objects When Placing', (v) => this.change({ placeSmart: v }));
  private readonly themeAutoRow = checkRow('Match System Appearance', (v) => this.change({ themeAuto: v }));
  private readonly themeLightRow = selectRow('Light theme', Object.entries(THEMES).filter(([, th]) => th.light).map(([k, th]) => [k, th.label] as const), (v) => this.change({ themeLight: v }));
  private readonly themeDarkRow = selectRow('Dark theme', Object.entries(THEMES).filter(([, th]) => !th.light).map(([k, th]) => [k, th.label] as const), (v) => this.change({ themeDark: v }));
  private readonly rawToneRow =checkRow('Apply Auto Tone', (v) => this.change({ rawAutoTone: v }));
  private readonly rawSmartRow = checkRow('Open as a Smart Object', (v) => this.change({ rawSmart: v }));
  private readonly rawAskRow = checkRow('Show the Camera Raw dialog on open', (v) => this.change({ rawAsk: v }));
  private readonly rawPpiRow = sliderRow('Resolution (ppi, 0 keeps the file\'s)', 0, 600, 1, (v) => this.change({ rawPpi: v }));
  private readonly rawSpaceRow = selectRow('Color Space (16 Bits/Channel)', [['srgb', 'sRGB'], ['prophoto', 'ProPhoto RGB']], (v) => this.change({ rawWide: v === 'prophoto' }));
  private readonly rawSharpenRow = selectRow('Sharpen For', RAW_SHARPEN_CHOICES, (v) => this.change({ rawSharpen: v as RawSharpen }));
  private readonly rawSharpenAmountRow = selectRow('Sharpen Amount', RAW_SHARPEN_AMOUNTS, (v) => this.change({ rawSharpenAmount: v as RawSharpenAmount }));
  private readonly autoShowPanelsRow = checkRow('Auto-Show Hidden Panels', (v) => this.change({ autoShowPanels: v }));
  private readonly curveRow = selectRow('Pen Pressure Curve', PRESSURE_CURVES, (v) => this.change({ pressureCurve: v as PressureCurve }));
  private readonly fontSizeRow = selectRow('Interface Text Size', UI_FONT_SIZES, (v) => this.change({ uiFontSize: v as UiFontSize }));
  private readonly scaleRow = selectRow('Interface Scale', UI_SCALES, (v) => setUiScale(v));
  private readonly releaseRow = sliderRow('Free background document caches after (seconds, 0 keeps them)', 0, 600, 5, (v) => this.change({ backgroundReleaseSec: v }));
  private readonly releaseSizeRow = sliderRow('Free background caches at once above (MB, 0 off)', 0, 4096, 16, (v) => this.change({ backgroundCacheMB: v }));
  private readonly reserveRow = sliderRow('Keep free of the memory limit (MB, 0 off)', 0, 4096, 16, (v) => this.change({ memoryReserveMB: v }));
  private readonly animationsRow = checkRow('Enable animations', (v) => this.change({ animations: v }));
  private readonly pressureRow = checkRow('Use tablet pressure, tilt and twist', (v) => this.change({ usePressure: v }));
  private readonly firstSnapRow = checkRow('Automatically Create First Snapshot', (v) => this.change({ autoFirstSnapshot: v }));
  private readonly snapMemRow = sliderRow('Snapshot memory (MB)', 64, 8192, 64, (v) => this.change({ snapshotMB: v }));
  private readonly narrowRow = checkRow('Show the side column as icons in a narrow window', (v) => this.change({ narrowCollapse: v }));
  private readonly rememberLayoutRow = checkRow('Remember panel layout changes', (v) => this.change({ rememberLayout: v }));
  private readonly openTabsRow = checkRow('Open Documents as Tabs', (v) => this.change({ openAsTabs: v }));
  private readonly largeTabsRow = checkRow('Large Tabs', (v) => this.change({ largeTabs: v }));
  private readonly narrowOptionsRow = checkRow('Use Narrow Options Bar', (v) => this.change({ narrowOptions: v }));
  private readonly lockRow = checkRow('Lock Workspace', (v) => this.workspaceLock?.set(v));
  private readonly cursorRow = selectRow('Painting Cursors', PAINT_CURSORS, (v) => this.change({ paintCursor: v as PaintCursor }));
  private readonly crossRow = checkRow('Show Crosshair in Brush Tip', (v) => this.change({ cursorCrosshair: v }));
  private readonly checkerSizeRow = selectRow('Grid Size', CHECKER_SIZES, (v) => this.change({ checkerSize: v as CheckerSize }));
  private readonly checkerColorsRow = selectRow('Grid Colors', CHECKER_COLORS, (v) => { this.change({ checkerColors: v as CheckerColors }); this.pageRows.showCustom(v === 'custom'); });
  /** Scratch Disks, Cursors, Transparency, Units & Rulers, Type, Enhanced Controls and Plug-ins rows (panels/page-prefs.ts). */
  private readonly pageRows = new PagePrefsRows((patch) => this.change(patch));
  private readonly languageRow = selectRow('Language', languages(), (v) => { this.change({ language: v as Lang }); setLanguage(v as Lang); });
  private readonly rulerRow = selectRow('Rulers', RULER_UNITS, (v) => this.change({ rulerUnits: v as RulerUnits }));
  private readonly gridEveryRow = numberRow('Gridline Every', 0.01, 5000, 0.01, (v) => this.change({ gridSpacing: Math.round(Math.min(5000, Math.max(0.01, v)) * 100) / 100 }));
  private readonly gridUnitRow = selectRow('Grid Unit', GRID_UNITS, (v) => {
    const from = this.prefs.gridUnit, to = v as GridUnit, ppi = openResolution();
    const spacing = Math.round(Math.min(5000, Math.max(0.01, this.prefs.gridSpacing * gridUnitPx(from, ppi) / gridUnitPx(to, ppi))) * 100) / 100;
    this.change({ gridUnit: to, gridSpacing: spacing });
    this.gridEveryRow.set(spacing);
  });
  private readonly subdivRow = sliderRow('Subdivisions', 1, 32, 1, (v) => this.change({ gridSubdivisions: v }));
  private readonly gridOpacityRow = sliderRow('Grid opacity (%)', 5, 100, 1, (v) => this.change({ gridOpacity: v }));
  private readonly noticeSecondsRow = sliderRow('Notice stays (seconds, 0 is automatic)', 0, 30, 1, (v) => this.change({ noticeSeconds: v }));
  private readonly gridResetRow = (() => {
    const row = el('<div class="cv-dialog-row"><span></span><button type="button" class="cv-btn cv-btn-ghost">Restore Defaults</button></div>');
    (row.querySelector('button') as HTMLButtonElement).addEventListener('click', () => {
      const d = DEFAULT_PREFS;
      this.change({ guideColor: d.guideColor, gridColor: d.gridColor, guideStyle: d.guideStyle, gridStyle: d.gridStyle, gridSpacing: d.gridSpacing, gridUnit: d.gridUnit, gridSubdivisions: d.gridSubdivisions, gridOpacity: d.gridOpacity });
      this.gridEveryRow.set(d.gridSpacing); this.gridUnitRow.set(d.gridUnit); this.subdivRow.set(d.gridSubdivisions); this.gridOpacityRow.set(d.gridOpacity);
      this.guideStyleRow.set(d.guideStyle); this.gridStyleRow.set(d.gridStyle);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#f97316';
      this.guideColor.value = accent; this.gridColor.value = '#808080';
    });
    return row;
  })();
  private readonly guideColor = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Guide color">');
  private readonly gridColor = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Grid color">');
  private readonly animZoomRow = checkRow('Animated Zoom', (v) => this.change({ animatedZoom: v }));
  private readonly systemPickerRow = checkRow('Use the system color picker', (v) => this.change({ systemPicker: v }));
  /** Preferences > Interface > Canvas Color: the pasteboard around the picture, shared with View > Pasteboard; the app connects it. */
  canvasColour: { get(): string; set(key: string): void } | null = null;
  private readonly canvasColourRow = selectRow('Canvas Color', [['default', 'Theme Default'], ['black', 'Black'], ['dark', 'Dark Gray'], ['mid', 'Medium Gray'], ['light', 'Light Gray']], (v) => this.canvasColour?.set(v));
  private readonly interpolationRow = selectRow('Image Interpolation', INTERPOLATIONS, (v) => this.change({ interpolation: v as ResampleMethod }));
  private readonly beepRow = checkRow('Beep When Done', (v) => this.change({ beepWhenDone: v }));
  private readonly zoomResizesRow = checkRow('Zoom Resizes Windows', (v) => this.change({ zoomResizes: v }));
  private readonly floatDockingRow = checkRow('Enable Floating Document Window Docking', (v) => this.change({ floatDocking: v }));
  private readonly tooltipsRow = checkRow('Show Tool Tips', (v) => this.change({ showTooltips: v }));
  private readonly shiftToolRow = checkRow('Use Shift Key for Tool Switch', (v) => this.change({ shiftToolSwitch: v }));
  private readonly zoomCentreRow = checkRow('Zoom Clicked Point to Center', (v) => this.change({ zoomClickCentre: v }));
  private readonly lowerExtRow = checkRow('Use Lower Case Extension', (v) => this.change({ lowerExtension: v }));
  private readonly recentCountRow = sliderRow('Recent File List Contains (files)', 0, 40, 1, (v) => this.change({ recentFileCount: v }));
  private readonly saveBgRow = checkRow('Save in Background', (v) => this.change({ saveInBackground: v }));
  private readonly historyCapRow = sliderRow('Keep History in Projects (MB, 0 = none)', 0, 512, 16, (v) => this.change({ historyCapMb: v }));
  private readonly gamutOpacityRow = sliderRow('Gamut Warning opacity (%)', 0, 100, 1, (v) => this.change({ gamutOpacity: v }));
  private readonly gamutColor = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Gamut Warning color">');
  private readonly guideStyleRow = selectRow('Guide line style', LINE_STYLES, (v) => this.change({ guideStyle: v as LineStyle }));
  private readonly gridStyleRow = selectRow('Grid line style', LINE_STYLES, (v) => this.change({ gridStyle: v as LineStyle }));
  private readonly gridPresetRow: Row<string> = selectRow('Grid color preset', [['', 'Choose...'], ['#808080', 'Gray'], ['#000000', 'Black'], ['#ffffff', 'White'], ['#ff6b6b', 'Light Red'], ['#6bb5ff', 'Light Blue'], ['#7bdc8a', 'Light Green'], ['#ffd45e', 'Yellow']], (v) => {
    if (!v) return;
    this.gridColor.value = v;
    this.change({ gridColor: v });
    this.gridPresetRow.set('');
  });
  private readonly sliceColor = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Slice line color">');
  private readonly sliceNumbersRow = checkRow('Show Slice Numbers', (v) => this.change({ sliceNumbers: v }));
  /** Preferences > Scratch Disks: where formvis keeps its working files, read by the app. */
  scratch: { info(): Promise<string>; clean(): void } | null = null;
  private readonly scratchInfo = el('<p class="cv-note" role="status" style="min-height: 2.8em"></p>');
  private readonly scratchClean = el<HTMLButtonElement>('<button class="cv-btn" type="button">Clean Working Files</button>');
  /** Lock Workspace lives with the dock; the app connects it. */
  workspaceLock: { get(): boolean; set(on: boolean): void } | null = null;
  private colorRow(label: string, input: HTMLInputElement, key: 'guideColor' | 'gridColor' | 'sliceColor'): HTMLElement {
    const row = el(`<label class="cv-field"><span>${label}</span></label>`), theme = el<HTMLButtonElement>('<button class="cv-btn" type="button">Theme color</button>');
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
  private readonly gpuMemoryRow = sliderRow('GPU memory (MB)', 128, 16384, 128, (v) => { this.change({ gpuMemoryMB: v }); this.showGpuMode(); });
  private gpuNow = { mode: '', reason: '', adapter: '', maxTexture: 0 };
  private readonly memoryLimitRow = sliderRow('Memory limit (MB, 0 is automatic)', 0, 65536, 512, (v) => this.change({ memoryLimitMB: v }));
  private readonly effectCacheRow = sliderRow('Layer effect cache (MB)', 16, 4096, 16, (v) => this.change({ effectCacheMB: v }));
  private readonly cacheLevelsRow = sliderRow('Cache levels (reduced copies for display, 0 is off)', 0, 8, 1, (v) => this.change({ cacheLevels: v }));
  private readonly gpuPowerRow = selectRow('Graphics processor (next launch)', POWER_CHOICES, (v) => this.change({ gpuPower: v as GpuPower }));
  private readonly lowLatencyRow = checkRow('Low-latency drawing (next launch)', (v) => this.change({ lowLatency: v }));
  private readonly hdrRow = checkRow('High dynamic range display (32-bit documents on an HDR screen, WebGPU)', (v) => this.change({ hdrDisplay: v }));
  private readonly pacingRow = selectRow('Frame pacing', FRAME_PACING, (v) => this.change({ framePacingMs: Number(v) }));
  private readonly tileRow = selectRow('Cache tile size (giant layers made from now on)', TILE_SIZES.map((n) => [String(n), `${n} by ${n} pixels`] as const), (v) => this.change({ cacheTilePx: Number(v) }));
  private readonly tileFromRow = sliderRow('Keep layers in tiles from (megapixels, 0 only past what one canvas holds; documents and layers made from now on)', 0, 400, 5, (v) => this.change({ tileFromMp: v }));
  private readonly threadsRow = sliderRow('Worker threads for large filters (0 is automatic)', 0, 16, 1, (v) => this.change({ workerThreads: v }));
  private readonly compositeRow = checkRow('Composite on worker threads', (v) => this.change({ workerComposite: v }));
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
    const row = el('<div class="cv-prefs-themes"></div>');
    row.appendChild(this.grid);
    const pages = el('<div class="cv-prefs-pages"></div>');
    const railIcons: Record<string, string> = { General: 'pfGeneral', Interface: 'pfInterface', Performance: 'pfPerformance', Workspace: 'pfWorkspace', Tools: 'pfTools', 'History & Cache': 'pfHistory', 'File Handling': 'pfFile', 'Placing Pictures': 'pfPlace', 'History Log': 'pfLog', Cursors: 'pfCursor', Type: 'pfType', 'Camera Raw Defaults': 'pfCamera', 'Transparency & Gamut': 'pfTransparency', 'Scratch Disks': 'pfScratch', Language: 'pfLanguage', 'Units & Rulers': 'pfUnits', 'Guides & Grid': 'pfGuides', 'Enhanced Controls': 'pfGestures', Plugins: 'pfPlugins' };
    const grp = (label: string, ...content: HTMLElement[]): HTMLElement => {
      const g = el('<section class="cv-prefs-group"><h3 class="cv-prefs-label"></h3></section>');
      const h = q<HTMLElement>(g, '.cv-prefs-label');
      setText(h, t(label));
      onLanguage(() => setText(h, t(label)));
      g.append(...content);
      return g;
    };
    const nt = (text: string): HTMLElement => el(`<p class="cv-note">${text}</p>`);
    const cols = (...content: HTMLElement[]): HTMLElement => { const c = el('<div class="cv-prefs-cols"></div>'); c.append(...content); return c; };
    const add =(name: string, ...content: HTMLElement[]): void => {
      const tab = el<HTMLButtonElement>(`<button class="cv-prefs-railtab" type="button" role="tab"><span class="cv-prefs-tabicon">${icon(railIcons[name] ?? 'pfGeneral', 18)}</span><span class="cv-prefs-tablabel"></span></button>`);
      tab.dataset.section = name;   // the English name is the identity; the label is the translation
      const label = q<HTMLElement>(tab, '.cv-prefs-tablabel');
      const paint = (): void => { setText(label, t(name)); tab.title = t(name); };
      paint();
      onLanguage(paint);
      tab.addEventListener('click', () => this.showSection(name, 'smooth'));
      this.nav.appendChild(tab);
      const page = el(`<section class="cv-prefs-page cv-prefs-sec" role="tabpanel"><button class="cv-prefs-sechead" type="button" aria-expanded="true"><span class="cv-prefs-secicon">${icon(railIcons[name] ?? 'pfGeneral', 16)}</span><span class="cv-prefs-seclabel"></span><span class="cv-prefs-chev">${icon('chevronDown', 16)}</span></button><div class="cv-prefs-secbody"></div></section>`);
      page.dataset.section = name;
      const head = q<HTMLButtonElement>(page, '.cv-prefs-sechead'), headLabel = q<HTMLElement>(page, '.cv-prefs-seclabel');
      const paintHead = (): void => setText(headLabel, t(name));
      paintHead();
      onLanguage(paintHead);
      head.addEventListener('click', () => this.foldSection(name));
      q<HTMLElement>(page, '.cv-prefs-secbody').append(...content);
      pages.appendChild(page);
      this.sections.set(name, page);
    };
    const accentRow = el('<label class="cv-field"><span>Accent</span></label>');
    accentRow.appendChild(this.accent);
    const reset = el<HTMLButtonElement>('<button class="cv-btn cv-btn-danger" type="button">Reset All Preferences...</button>');
    reset.addEventListener('click', () => { void confirmAction('Reset all preferences?', 'Every preference, the panel arrangement and the tools shown go back to how formvis comes; your documents and library are kept. formvis reloads.', 'Reset').then((ok) => { if (!ok) return; for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.') || k === 'nodemode_ui_settings') localStorage.removeItem(k); location.reload(); }); });
    add('General',
      grp('Startup', this.homeRow.el, this.homeCloseRow.el, this.whatsNewRow.el, nt('The Home screen covers the canvas area. At launch it shows while no document is open; closing the last document leaves the empty workspace with its panels unless the second choice is on. The brand mark at the top left opens it at any time; Esc leaves it. What\'s New (Help menu) lists the recent additions, each with a Show Me button; with the third choice on it opens once after an update.')),
      grp('Behavior', this.animZoomRow.el, this.zoomResizesRow.el, this.systemPickerRow.el, this.beepRow.el, nt('Beep When Done sounds a short tone when a job that ran longer than two seconds ends. Zoom Resizes Windows sizes a floating document window to the picture when its zoom changes. Animated Zoom eases Zoom In, Zoom Out and the Zoom tool\'s clicks over a fraction of a second. Use the system color picker opens the computer\'s own picker for the foreground and background swatches instead of formvis\'s.')),
      grp('Resampling', this.interpolationRow.el, nt('Image Interpolation is the resampling the Image Size dialog starts with.')),
      grp('Clipboard and Transform', ...this.pageRows.generalRows),
      grp('Settings Storage', this.location.el),
      grp('Reset', reset));
    this.intensityRow.set(Math.round((readChoice().intensity ?? 1) * 100));
    add('Interface',
      grp('Theme', row, nt('Right-click a theme to favorite it. Theme and accent are shared with NodeMode on this device.'), this.themeAutoRow.el, cols(this.themeLightRow.el, this.themeDarkRow.el), nt('Match System Appearance switches between the light and dark theme chosen here when the appearance of the computer changes; a theme picked by hand stays until the next change of a preference or of the appearance.'), accentRow, this.intensityRow.el, nt('Intensity sets how strongly the accent tints what it marks; 100% is the design\'s.'), this.skins.el),
      grp('Language, Text and Scale', this.languageRow.el, nt('The language of the whole interface. Names you give layers and documents stay as you wrote them.'), cols(this.fontSizeRow.el, this.scaleRow.el), nt('Text size scales the interface\'s text.')),
      grp('Motion and Notices', this.animationsRow.el, this.noticeSecondsRow.el),
      grp('Canvas Appearance', this.canvasColourRow.el, nt('Canvas Color is the pasteboard around the picture (the same as View > Pasteboard).'), ...this.pageRows.interfaceRows));
    add('Performance',
      grp('Memory', this.budgetNote, this.memoryLimitRow.el, this.reserveRow.el),
      grp('Caches and Redraw', this.effectCacheRow.el, this.releaseRow.el, this.releaseSizeRow.el, this.cacheLevelsRow.el, this.redrawRow.el, this.reuseRow.el),
      grp('Previews and Rendering', this.previewRow.el, ...this.pageRows.performance, this.rendering.el),
      grp('Graphics Processor Settings', this.gpuNameRow(), this.gpuUseRow.el, this.gpuFiltersRow.el, this.rendererRow.el, this.gpuMemoryRow.el, this.gpuPowerRow.el, this.lowLatencyRow.el, this.hdrRow.el, this.pacingRow.el, this.tileRow.el, this.tileFromRow.el, this.threadsRow.el, this.compositeRow.el, this.gpuMode,
        el('<p class="cv-note">Automatic uses WebGPU (Metal on macOS, Direct3D 12 on Windows), then WebGL2 (as on Linux), on a hardware graphics processor, and the CPU otherwise; a software GPU is slower than the CPU renderer, so Automatic does not use one. If the graphics processor fails to start, formvis turns this off and says so. The canvas draws on the graphics processor; a document using something it does not draw yet draws on the CPU, and the status bar says why.</p>')),
      grp('Engine', this.engineRow.el, this.engineMode,
        el('<p class="cv-note">Where the engine runs its models (Remove Background, and the local models that follow). Automatic uses CUDA on an NVIDIA graphics processor, Core ML (Metal) on a Mac, and the CPU otherwise; a choice this machine cannot run falls back to the CPU, and the line above says why.</p>')));
    add('Workspace',
      grp('Panels', this.lockRow.el, this.narrowRow.el, this.rememberLayoutRow.el, this.narrowOptionsRow.el, this.autoShowPanelsRow.el, nt('With Auto-Show Hidden Panels, panels hidden with Tab show again while the pointer rests at the window\'s left edge (the tools) or right edge (the panels). Locked, panels are neither dragged nor resized. In a window too narrow for the canvas beside the open side column, it shows as its icons until there is room (your choice is kept).')),
      grp('Document Windows', this.openTabsRow.el, this.largeTabsRow.el, this.floatDockingRow.el, nt('With Enable Floating Document Window Docking, dragging a floating window by its title bar onto the tab bar docks it back to its tab; off, windows only return by their close button or Consolidate All to Tabs.')));
    add('Tools',
      grp('Zoom and Scroll', this.wheelRow.el, this.zoomCentreRow.el, nt('Zoom Clicked Point to Center moves the point you click with the Zoom tool to the middle of the view. On, the wheel zooms about the pointer and Ctrl or Cmd with the wheel scrolls; off, the other way round.')),
      grp('Pen and Brush', this.curveRow.el, this.pressureRow.el, nt('The pressure curve is how a pen\'s pressure maps to size, flow and opacity in every brush; a brush\'s own options can change it for the session.'), ...this.pageRows.toolRows),
      grp('Hints and Shortcuts', this.tooltipsRow.el, this.shiftToolRow.el, nt('Show Tool Tips off hides the hover hints on buttons and tools. With Use Shift Key for Tool Switch off, pressing a tool\'s letter again cycles its group instead of Shift with the letter.')));
    add('History & Cache',
      grp('History', this.statesRow.el, this.memoryRow.el, this.memoryAutoRow.el, nt('History States is how many steps undo keeps (50 is a common default; up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as a desktop app can, so this is the part formvis controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.')),
      grp('Snapshots', this.firstSnapRow.el, this.snapMemRow.el, nt('Each document keeps itself as opened, the History Brush\'s first source; snapshots, that one included, share this memory.')),
      grp('Log', this.historyLogRow.el, nt('On, every new history step is written down with its time and document, on this device. Edit > History Log saves it as a text file or clears it.')));
    this.restoreBox.addEventListener('change', () => this.change({ restoreSession: this.restoreBox.checked }));
    this.mismatchSel.addEventListener('change', () => this.change({ profileMismatch: this.mismatchSel.value as 'convert' | 'keep' | 'ask' }));
    const restore = el('<label class="cv-dialog-row"><span>Reopen the documents that were open when formvis closed</span></label>');
    restore.append(toggleOf(this.restoreBox));
    const mismatch = el('<label class="cv-dialog-row"><span>Embedded profiles</span></label>'); mismatch.append(this.mismatchSel);
    // The library's folder (1.58.8): the choice fills the path, which can be any folder; applying moves the projects.
    const libRow = el('<label class="cv-dialog-row"><span>Library folder</span></label>'); libRow.append(this.libSel);
    const pathRow = el('<label class="cv-dialog-row"><span>Folder</span></label>'); pathRow.append(this.libPath);
    const moveRow = el('<label class="cv-dialog-row"><span>Move my projects there</span></label>'); moveRow.append(toggleOf(this.libMove));
    this.libSel.addEventListener('change', () => { if (this.libSel.value !== 'other') this.libPath.value = this.libSel.value; else this.libPath.focus(); });
    this.libApply.addEventListener('click', () => void this.applyLibrary());
    const library = el('<div></div>');
    library.append(this.libNow, libRow, pathRow, moveRow, this.libApply, el('<p class="cv-note">The library can live in any folder, a synced one (iCloud Drive, Dropbox, OneDrive, Google Drive) included. If a project changed in that folder since you opened it, from another device or window, saving keeps that version and saves yours beside it as a conflict copy.</p>'));
    add('File Handling',
      grp('Opening and Recovery', mismatch, restore, nt('Every open document is kept on this device, in its tab order, and opens again at the next start, saved or not. Off, only unsaved work is kept, and formvis asks after a crash.'), this.recoveryRow.el, nt('Unsaved documents are kept on this device so they can be recovered after a crash; this is how soon after a change that happens.'), this.recentCountRow.el, nt('The recent file list is how many files File > Open Recent shows; 0 shows none.')),
      grp('Saving', this.lowerExtRow.el, nt('Use Lower Case Extension writes exported files as .jpg; off, as .JPG.'), this.saveBgRow.el, nt('Save in Background takes a snapshot of the document when you save and writes it while you keep editing; the status line shows the progress and Escape stops it. Off, edits wait until the save has finished. A document with a giant tiled layer always waits.'), this.historyCapRow.el, nt('Save and Save As write the most recent steps of an 8-bit document into the project, newest first, until this size is reached; opening the project brings them back to the History panel and Undo. File > Save As with History keeps them for one save whatever this is set to (64 MB when it is 0).')),
      grp('Formats', ...this.pageRows.fileRows),
      grp('Library', library));
    add('Placing Pictures', grp('Placing', this.placeFitRow.el, this.placeSmartRow.el, nt('Resize Image During Place scales a picture larger than the canvas down to fit it when it is placed; off, it keeps its own size. Always Create Smart Objects When Placing makes each picture dropped on an open document a smart object.'), this.placeTransformRow.el, nt('On, a single picture dropped on an open document or put in with File > Place Embedded opens in Free Transform: Enter keeps it, Escape leaves it at its placed size and spot. A picture larger than the canvas is placed scaled to fit.')));
    add('Cursors', grp('Painting Cursors', this.cursorRow.el, this.crossRow.el, nt('How painting tools show where they paint: the tip\'s outline at its size, a crosshair alone, or a small ring.'), ...this.pageRows.cursors));
    add('Type',
      grp('Fonts', this.recentFontsRow.el, nt('The fonts you used last are listed first in the font menus, newest first; 0 lists none first.')),
      grp('Text Editing', ...this.pageRows.type));
    add('Camera Raw Defaults',
      grp('Dialog', this.rawAskRow.el, nt('What the Camera Raw dialog starts with each time a camera RAW file opens.')),
      grp('Color', cols(this.rawWbRow.el, this.rawBitsRow.el, this.rawSpaceRow.el), nt('The color space applies at 16 Bits/Channel (an 8-bit document is sRGB).')),
      grp('Output and Sharpening', cols(this.rawSharpenRow.el, this.rawSharpenAmountRow.el), this.rawPpiRow.el, this.rawToneRow.el, this.rawSmartRow.el, nt('Resolution, Auto Tone and Smart Object apply to the 8 bits/channel document it opens. Sharpen For applies an Unsharp Mask sized for the screen, glossy paper or matte paper as the file opens.')));
    const gamutField = el('<label class="cv-field"><span>Gamut Warning</span></label>');
    this.gamutColor.addEventListener('input', () => this.change({ gamutColor: this.gamutColor.value }));
    gamutField.append(this.gamutColor);
    add('Transparency & Gamut',
      grp('Transparency', cols(this.checkerSizeRow.el, this.checkerColorsRow.el), ...this.pageRows.transparency, el(`<p class="cv-note">${t('The checkerboard shown behind transparent pixels. None shows it plain; Match Theme uses the light checkerboard in light themes and the dark one in dark themes.')}</p>`)),
      grp('Gamut Warning', gamutField, this.gamutOpacityRow.el, el('<p class="cv-note">The color and opacity that View > Gamut Warning paints over colors the proof profile cannot print.</p>')));
    this.scratchClean.addEventListener('click', () => { this.scratch?.clean(); setTimeout(() => void this.refreshScratch(), 400); });
    add('Scratch Disks', grp('Working Files', this.pageRows.scratch.el, this.scratchInfo, this.scratchClean, el('<p class="cv-note">formvis keeps recovery copies of open documents and closed tabs in this device\'s storage, the way a desktop editor uses a scratch disk. Clean Working Files removes the copies of documents that are no longer open; open documents are not touched. Layer effect and display caches are set in Performance.</p>')));
    add('Units & Rulers',
      grp('Rulers', this.rulerRow.el, nt('The rulers\' unit; inches, centimetres and millimetres follow the document\'s resolution, percent its width and height.')),
      grp('Resolution and Columns', ...this.pageRows.units));
    add('Guides & Grid',
      grp('Guides', this.colorRow('Guides', this.guideColor, 'guideColor'), this.guideStyleRow.el, nt('The color and line style of guides.')),
      grp('Grid', this.colorRow('Grid', this.gridColor, 'gridColor'), cols(this.gridStyleRow.el, this.gridPresetRow.el, this.gridUnitRow.el, this.gridEveryRow.el), this.subdivRow.el, this.gridOpacityRow.el, this.gridResetRow, nt('The color and line style of the grid.')),
      grp('Slices', this.colorRow('Slices', this.sliceColor, 'sliceColor'), this.sliceNumbersRow.el, nt('The color of slice lines and whether their numbers show.')));
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
    lm.append(this.llmRows.el, lmRow('Address', this.llmUrl), lmRow('Model', this.llmModel, this.llmModels), lmRow('API key', this.llmKey), lmButtons, this.llmNote);
    const tp = el('<div class="cv-panel-section cv-templates"><span class="cv-refs-title">Prompt templates</span></div>');
    const tButtons = el('<div class="cv-improve"></div>');
    const tNew = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">New</button>'), tSave = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Save</button>'), tDel = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Delete</button>');
    tButtons.append(tNew, tSave, tDel);
    this.tplPick.addEventListener('change', () => this.showTemplate());
    tNew.addEventListener('click', () => { const list = templates(); let n = 1; while (list.some((t) => t.name === `Template ${n}`)) n++; list.push({ name: `Template ${n}`, text: '' }); saveTemplates(list); this.fillTemplates(`Template ${n}`); });
    tSave.addEventListener('click', () => { const list = templates(), i = list.findIndex((t) => t.name === this.tplPick.value), name = this.tplName.value.trim() || this.tplPick.value; if (i >= 0) list[i] = { ...list[i], name, text: this.tplText.value }; saveTemplates(list); this.fillTemplates(name); setText(this.tplNote, 'Saved.'); });
    tDel.addEventListener('click', () => { const list = templates().filter((t) => t.name !== this.tplPick.value); saveTemplates(list.length ? list : templates()); this.fillTemplates(); });
    const tFiles = new TemplateFiles(() => this.tplPick.value, this.tplNote, (name) => this.fillTemplates(name));
    tp.append(lmRow('Template', this.tplPick), lmRow('Name', this.tplName), this.tplText, tButtons, tFiles.el, this.tplNote);
    // Outside agents over MCP (1.52.1): off unless turned on here; how to connect Claude Code and Claude Desktop.
    this.agents.addEventListener('change', () => { this.change({ agentsAllowed: this.agents.checked }); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: this.agents.checked })); });
    const ag = el('<label class="cv-dialog-row"><span>Allow outside agents (MCP)</span></label>');
    ag.append(toggleOf(this.agents));
    const agNote = el('<p class="cv-note">Lets Claude Code, Claude Desktop or another MCP client work in the open document; each change is an undoable step, and anything that costs money asks you first. Claude Code: <code>claude mcp add --transport http formvis <span class="cv-mcp-url">http://127.0.0.1:8190/mcp</span></code>. Claude Desktop: a server whose command is <code>./formvis mcp</code> in the formvis folder. The control port is the engine\'s own port, chosen when the engine starts (FORMVIS_PORT, 8190 unless set): <span class="cv-mcp-port">8190</span>. It cannot change while formvis runs.</p>');
    this.mcpUrlNode = agNote.querySelector('.cv-mcp-url'); this.mcpPortNode = agNote.querySelector('.cv-mcp-port');
    add('Enhanced Controls', grp('Gestures and Sliders', ...this.pageRows.enhanced));
    add('Plugins',
      grp('Panels and Extensions', ...this.pageRows.plugins, this.pluginSwitches.el, this.pluginsFolder.el),
      grp('Connected Apps', nm, this.nodemodeNote, cu, this.comfyuiNote, this.comfyAuth.el, this.recipesList.el),
      grp('Prompts', lm, tp),
      grp('Outside Agents', ag, agNote),
      grp('Keys and Models', this.keysNote, this.apiKeys.el, this.modelFolder.el, this.hfToken.el, this.localModels.el, this.localFiles.el),
      grp('Updates', this.updates.el));
    for (const name of ['General', 'Interface', 'Workspace', 'Tools', 'Cursors', 'Enhanced Controls', 'Type', 'Placing Pictures', 'File Handling', 'History & Cache', 'Performance', 'Scratch Disks', 'Transparency & Gamut', 'Units & Rulers', 'Guides & Grid', 'Camera Raw Defaults', 'Plugins']) {
      const tab = this.nav.querySelector<HTMLElement>(`[data-section="${name}"]`), card = this.sections.get(name);
      if (tab?.parentElement) tab.parentElement.appendChild(tab);
      if (card) pages.appendChild(card);
    }
    const wrap = el('<div class="cv-prefs"></div>');
    wrap.append(pages);
    this.body.appendChild(wrap);
    this.pagesEl = pages;
    const frame = q<HTMLElement>(this.scrim, '.cv-dialog');
    frame.classList.add('cv-prefs-dlg');
    q<HTMLElement>(this.scrim, '.cv-dialog-head').prepend(el(`<span class="cv-prefs-headicon">${icon('settings', 16)}</span>`));
    const railKey = 'formvis.prefsRailCollapsed';
    let collapsed = false;
    try { collapsed = localStorage.getItem(railKey) === '1'; } catch { collapsed = false; }
    const fold = el<HTMLButtonElement>(`<button class="cv-prefs-fold" type="button">${icon('pfFold', 16)}</button>`);
    const paintRail = (): void => {
      setClass(frame, 'is-rail-collapsed', collapsed);
      fold.title = t(collapsed ? 'Expand tabs' : 'Collapse tabs');
      fold.setAttribute('aria-label', fold.title);
      fold.setAttribute('aria-expanded', String(!collapsed));
    };
    fold.addEventListener('click', () => {
      collapsed = !collapsed;
      try { localStorage.setItem(railKey, collapsed ? '1' : '0'); } catch { paintRail(); }
      paintRail();
      this.queueWire();
    });
    paintRail();
    onLanguage(paintRail);
    const rail = el('<div class="cv-prefs-rail"></div>');
    rail.append(this.nav, fold);
    const wire = el<HTMLElement>('<svg class="cv-prefs-wire" aria-hidden="true"><path class="cv-prefs-wire-shade"></path><path class="cv-prefs-wire-line"></path></svg>') as unknown as SVGSVGElement;
    const port = el('<span class="cv-prefs-port" aria-hidden="true"></span>');
    frame.append(rail, wire, port);
    this.shell = { frame, rail, port, shade: q<SVGPathElement>(wire, '.cv-prefs-wire-shade'), line: q<SVGPathElement>(wire, '.cv-prefs-wire-line') };
    pages.addEventListener('scroll', () => this.queueSpy(), { passive: true });
    new ResizeObserver(() => this.queueWire()).observe(frame);
    window.addEventListener('resize', () => this.queueWire());
    this.button('Done', 'primary', () => this.close());
    this.grid.addEventListener('contextmenu', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-id]')?.dataset.themeId;
      if (!id) return;
      e.preventDefault();
      const cur = this.prefs.favouriteThemes;
      this.change({ favouriteThemes: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      this.sync();
    });
    this.grid.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-id]');
      if (!b?.dataset.themeId) return;
      setTheme(b.dataset.themeId);
      this.sync();
    });
    this.accent.addEventListener('input', () => { setAccent(this.accent.value); this.sync(); });
    void this.skins.reload();
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

  show(section?: string, live = false): void {
    this.scrim.classList.toggle('cv-scrim-through', live);
    this.scrim.classList.toggle('cv-scrim-side', live);
    this.prefs = loadPrefs();
    void this.refreshLibrary();
    this.statesRow.set(this.prefs.historyStates);
    this.memoryRow.set(this.prefs.historyMB);
    this.memoryAutoRow.set(this.prefs.historyAuto);
    this.redrawRow.set(this.prefs.regionRedraws);
    this.reuseRow.set(this.prefs.layerReuse);
    this.previewRow.set(this.prefs.fullPreviews);
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
    this.memoryLimitRow.set(this.prefs.memoryLimitMB);
    this.effectCacheRow.set(this.prefs.effectCacheMB);
    this.releaseRow.set(this.prefs.backgroundReleaseSec);
    this.releaseSizeRow.set(this.prefs.backgroundCacheMB);
    this.reserveRow.set(this.prefs.memoryReserveMB);
    this.cacheLevelsRow.set(this.prefs.cacheLevels);
    this.pageRows.set(this.prefs);
    this.gpuPowerRow.set(this.prefs.gpuPower);
    this.pacingRow.set(String(this.prefs.framePacingMs));
    this.tileRow.set(String(this.prefs.cacheTilePx));
    this.tileFromRow.set(this.prefs.tileFromMp);
    this.threadsRow.set(this.prefs.workerThreads);
    this.compositeRow.set(this.prefs.workerComposite);
    this.lowLatencyRow.set(this.prefs.lowLatency);
    this.hdrRow.set(this.prefs.hdrDisplay);
    this.engineRow.set(this.prefs.engineDevice);
    this.wheelRow.set(this.prefs.zoomWheel);
    this.curveRow.set(this.prefs.pressureCurve);
    this.recentFontsRow.set(this.prefs.recentFontCount);
    this.rawWbRow.set(this.prefs.rawWb);
    this.rawBitsRow.set(String(this.prefs.rawBits));
    this.historyLogRow.set(this.prefs.historyLog);
    this.placeTransformRow.set(this.prefs.placeTransform);
    this.placeFitRow.set(this.prefs.placeFit); this.placeSmartRow.set(this.prefs.placeSmart);
    this.themeAutoRow.set(this.prefs.themeAuto); this.themeLightRow.set(this.prefs.themeLight); this.themeDarkRow.set(this.prefs.themeDark);
    this.rawSpaceRow.set(this.prefs.rawWide ? 'prophoto' : 'srgb'); this.rawSharpenRow.set(this.prefs.rawSharpen); this.rawSharpenAmountRow.set(this.prefs.rawSharpenAmount); this.autoShowPanelsRow.set(this.prefs.autoShowPanels);
    this.rawAskRow.set(this.prefs.rawAsk); this.rawToneRow.set(this.prefs.rawAutoTone); this.rawSmartRow.set(this.prefs.rawSmart); this.rawPpiRow.set(this.prefs.rawPpi);
    this.fontSizeRow.set(this.prefs.uiFontSize);
    this.scaleRow.set(uiScaleChoice());
    this.animationsRow.set(this.prefs.animations);
    this.pressureRow.set(this.prefs.usePressure);
    this.firstSnapRow.set(this.prefs.autoFirstSnapshot);
    this.snapMemRow.set(this.prefs.snapshotMB);
    this.narrowRow.set(this.prefs.narrowCollapse);
    this.rememberLayoutRow.set(this.prefs.rememberLayout);
    this.openTabsRow.set(this.prefs.openAsTabs); this.largeTabsRow.set(this.prefs.largeTabs);
    this.narrowOptionsRow.set(this.prefs.narrowOptions);
    this.lockRow.set(this.workspaceLock?.get() ?? false);
    this.cursorRow.set(this.prefs.paintCursor);
    this.crossRow.set(this.prefs.cursorCrosshair);
    this.checkerSizeRow.set(this.prefs.checkerSize);
    this.checkerColorsRow.set(this.prefs.checkerColors);
    this.rulerRow.set(this.prefs.rulerUnits);
    this.languageRow.set(this.prefs.language);
    this.gridEveryRow.set(this.prefs.gridSpacing); this.gridUnitRow.set(this.prefs.gridUnit);
    this.subdivRow.set(this.prefs.gridSubdivisions); this.gridOpacityRow.set(this.prefs.gridOpacity); this.noticeSecondsRow.set(this.prefs.noticeSeconds);
    const css = getComputedStyle(document.documentElement);
    this.guideColor.value = this.prefs.guideColor || (css.getPropertyValue('--accent-color').trim() || '#f97316');
    this.gridColor.value = this.prefs.gridColor || '#808080';
    this.sliceColor.value = this.prefs.sliceColor || (css.getPropertyValue('--accent-color').trim() || '#f97316');
    this.gamutColor.value = this.prefs.gamutColor;
    this.gamutOpacityRow.set(this.prefs.gamutOpacity);
    this.guideStyleRow.set(this.prefs.guideStyle); this.gridStyleRow.set(this.prefs.gridStyle); this.sliceNumbersRow.set(this.prefs.sliceNumbers);
    this.animZoomRow.set(this.prefs.animatedZoom); this.systemPickerRow.set(this.prefs.systemPicker);
    this.canvasColourRow.set(this.canvasColour?.get() ?? 'default');
    this.beepRow.set(this.prefs.beepWhenDone); this.interpolationRow.set(this.prefs.interpolation); this.zoomResizesRow.set(this.prefs.zoomResizes); this.floatDockingRow.set(this.prefs.floatDocking);
    this.tooltipsRow.set(this.prefs.showTooltips); this.shiftToolRow.set(this.prefs.shiftToolSwitch); this.zoomCentreRow.set(this.prefs.zoomClickCentre);
    this.lowerExtRow.set(this.prefs.lowerExtension); this.recentCountRow.set(this.prefs.recentFileCount); this.saveBgRow.set(this.prefs.saveInBackground); this.historyCapRow.set(this.prefs.historyCapMb);
    void this.refreshScratch();
    if (section && this.sections.has(section)) this.showSection(section);
    this.sync();
    this.open();
    if (section && this.sections.has(section)) this.scrollToSection(section, 'auto');
    this.queueWire();
  }

  private async refreshScratch(): Promise<void> {
    setText(this.scratchInfo, this.scratch ? await this.scratch.info() : 'Working files are shown once the app has started.');
  }

  private gpuNameRow(): HTMLElement {
    const row = el('<div class="cv-field"><span>Detected Graphics Processor</span></div>');
    row.appendChild(this.gpuName);
    return row;
  }

  /** The probe's result: the processor's name, or none (Use Graphics Processor then greyed),
   *  and the mode in use with its reason. */
  setGpu(name: string | null, mode: string, reason: string, adapter = '', maxTexture = 0): void {
    setText(this.gpuName, name ?? 'None found');
    const box = this.gpuUseRow.el.querySelector('input');
    if (box) setDisabled(box, !name);
    this.gpuNow = { mode, reason, adapter, maxTexture };
    this.showGpuMode();
  }

  /** The renderer in use and the adapter behind it, the display budget (Preferences' GPU memory, over which a document draws on the CPU) and the adapter's largest texture. */
  private showGpuMode(): void {
    const g = this.gpuNow;
    if (!g.mode) return;
    setText(this.gpuMode, `In use: ${g.mode}${g.adapter ? ` on ${g.adapter}` : ''} (${g.reason}). Display budget: ${this.prefs.gpuMemoryMB.toLocaleString('en-US')} MB for the open document${g.maxTexture ? `; largest texture ${g.maxTexture.toLocaleString('en-US')} px` : ''}.`);
  }

  /** The engine's report on its compute device (or that it is offline). */
  setEngine(text: string): void {
    setText(this.engineMode, text);
  }

  private showSection(name: string, scroll: ScrollBehavior | null = null): void {
    if (!this.sections.has(name)) return;
    this.markSection(name);
    if (scroll) this.scrollToSection(name, scroll);
  }

  /** The section the wire points at: its rail tab is the active one and its card the current one. */
  private markSection(name: string): void {
    if (this.current === name) return;
    this.current = name;
    for (const [n, page] of this.sections) setClass(page, 'is-current', n === name);
    for (const tab of Array.from(this.nav.children) as HTMLElement[]) { const on = tab.dataset.section === name; setClass(tab, 'is-active', on); tab.setAttribute('aria-selected', String(on)); }
    this.queueWire();
  }

  private scrollToSection(name: string, behavior: ScrollBehavior): void {
    const sec = this.sections.get(name), pages = this.pagesEl;
    if (!sec || !pages) return;
    if (sec.classList.contains('is-folded')) this.foldSection(name);
    const top = sec.getBoundingClientRect().top - pages.getBoundingClientRect().top + pages.scrollTop - 12;
    this.spyMuted = performance.now() + 700;
    pages.scrollTo({ top, behavior });
  }

  private foldSection(name: string): void {
    const sec = this.sections.get(name);
    if (!sec) return;
    const folded = !sec.classList.contains('is-folded');
    setClass(sec, 'is-folded', folded);
    setHidden(q(sec, '.cv-prefs-secbody'), folded);
    q(sec, '.cv-prefs-sechead').setAttribute('aria-expanded', String(!folded));
    this.queueWire();
    this.queueSpy();
  }

  /** The scroll decides the current section: the last card whose top has passed the top edge, the last card at the end. */
  private queueSpy(): void {
    if (this.spyRaf) return;
    this.spyRaf = requestAnimationFrame(() => {
      this.spyRaf = 0;
      const pages = this.pagesEl;
      if (!pages || !pages.clientHeight || performance.now() < this.spyMuted) return;
      const edge = pages.getBoundingClientRect().top + 24;
      const names = Array.from(this.sections.keys());
      let best = '', bestD = Infinity;
      if (pages.scrollHeight > pages.clientHeight + 4 && pages.scrollTop + pages.clientHeight >= pages.scrollHeight - 2) best = names[names.length - 1] ?? '';
      else for (const [n, sec] of this.sections) {
        const top = sec.getBoundingClientRect().top, d = top <= edge ? edge - top : top - edge + 100000;
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best) this.markSection(best);
    });
  }

  private queueWire(): void {
    if (this.wireRaf) return;
    this.wireRaf = requestAnimationFrame(() => { this.wireRaf = 0; this.drawWire(); });
  }

  /** The connector: from the active tab's right edge, along a trunk in the gap, to the port on the panel's left edge at the header divider. Only the two path data and the port's offset change. */
  private drawWire(): void {
    const s = this.shell;
    if (!s || this.scrim.hidden) return;
    const F = s.frame.getBoundingClientRect();
    const tab = this.nav.querySelector<HTMLElement>('.cv-prefs-railtab.is-active');
    const head = s.frame.querySelector<HTMLElement>('.cv-dialog-head');
    if (!F.width || !tab || !head) return;
    const N = this.nav.getBoundingClientRect();
    let T = tab.getBoundingClientRect();
    if (T.top < N.top || T.bottom > N.bottom) {
      this.nav.scrollTop += T.top < N.top ? T.top - N.top - 6 : T.bottom - N.bottom + 6;
      T = tab.getBoundingClientRect();
    }
    const R = s.rail.getBoundingClientRect(), H = head.getBoundingClientRect();
    const portY = Math.round(H.bottom - F.top), sx = Math.round(T.right - F.left), ty = Math.round(T.top - F.top + T.height / 2);
    const rr = R.right - F.left, trunk = Math.round(rr - rr * 0.45), dy = portY - ty, r = 10, dir = dy > 0 ? 1 : -1;
    const d = Math.abs(dy) < 2 * r ? `M ${sx} ${ty} H ${trunk} V ${portY} H -7` : `M ${sx} ${ty} H ${trunk - r} a ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${r} ${dir * r} V ${portY - dir * r} a ${r} ${r} 0 0 ${dir > 0 ? 0 : 1} ${r} ${dir * r} H -7`;
    if (d !== this.wireD) { this.wireD = d; s.shade.setAttribute('d', d); s.line.setAttribute('d', d); }
    if (portY !== this.portY) { this.portY = portY; s.port.style.transform = `translateY(${portY}px)`; }
  }

  private readonly nodemodeUrl = el<HTMLInputElement>('<input class="cv-input" type="url" aria-label="NodeMode address" spellcheck="false">');
  private readonly nodemodeCheck = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Check</button>');
  private readonly nodemodeNote = el('<p class="cv-note" role="status">File > Send to NodeMode sends here. Embedded in NodeMode, formvis sends to the NodeMode around it.</p>');

  private readonly comfyuiUrl = el<HTMLInputElement>('<input class="cv-input" type="url" aria-label="ComfyUI address" spellcheck="false">');
  private readonly comfyuiCheck = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Check</button>');
  private readonly comfyuiNote = el('<p class="cv-note cv-comfy-report" role="status">File > Send to ComfyUI sends here, into its input folder. Check reports its version, devices, queue, node packs, and what each kept recipe still needs.</p>');

  private readonly restoreBox = el<HTMLInputElement>('<input type="checkbox" aria-label="Reopen documents at start">');
  // The library's folder (1.58.8, L13): any folder, a synced one included; built once, filled when the dialog opens.
  private readonly libNow = el('<p class="cv-note" role="status" style="min-height: 2.8em"></p>');
  private readonly libSel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Library folder"></select>');
  private readonly libPath = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false" aria-label="Library folder path">');
  private readonly libMove = el<HTMLInputElement>('<input type="checkbox" aria-label="Move my projects there" checked>');
  private readonly libApply = el<HTMLButtonElement>('<button class="cv-btn" type="button">Use this folder</button>');
  private libDefault = '';
  private readonly agents = el<HTMLInputElement>('<input type="checkbox" aria-label="Allow outside agents">');
  private mcpUrlNode: Element | null = null;
  private mcpPortNode: Element | null = null;
  /** The engine's real MCP address and port, from the engine itself (the port is set when it starts). */
  private async showControlPort(): Promise<void> {
    try {
      const r = (await (await fetch('/api/mcp/registration')).json()) as { url?: string };
      if (!r.url) return;
      if (this.mcpUrlNode) setText(this.mcpUrlNode as HTMLElement, r.url);
      if (this.mcpPortNode) setText(this.mcpPortNode as HTMLElement, new URL(r.url).port || '80');
    } catch { /* the engine is not reachable; the note keeps its default */ }
  }
  private readonly localModels = new LocalModelsSection();   // 1.52.9
  private readonly comfyAuth = new ComfyAuthSection();
  private readonly modelFolder = new ModelFolderSection();
  readonly pluginsFolder = new PluginsFolderSection();
  readonly pluginSwitches = new PluginSwitchesSection();
  private readonly hfToken = new HuggingFaceToken();
  private readonly apiKeys = new ApiKeysSection();
  private readonly localFiles = new LocalFilesSection();
  /** Help > Check for Updates, connected by the app. */
  checkUpdates: (() => Promise<string>) | null = null;
  private readonly location = new SettingsLocationSection();
  private readonly updates = new UpdatesSection(() => this.checkUpdates?.() ?? Promise.resolve('Updates are checked in the desktop app.'), VERSION);
  /** The tile engine switch and Reload Window, connected by the app. */
  applyTiled: ((on: boolean) => void) | null = null;
  restartWindow: (() => void) | null = null;
  private readonly skins = new SkinsSection(this.grid);
  private readonly rendering = new RenderingSection((on) => this.applyTiled?.(on), () => this.restartWindow?.());
  private readonly recipesList = new RecipesSection();
  private readonly mismatchSel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Embedded profiles"><option value="convert">Convert to the working space (sRGB)</option><option value="keep">Keep the embedded profile</option><option value="ask">Ask when opening</option></select>');   // 1.53.5
  private readonly budgetNote = el('<p class="cv-note cv-budget-note" role="status"></p>');   // the largest document (1.53.4)
  private readonly keysNote = el('<p class="cv-note cv-keys-note" role="status"></p>');   // where API keys are kept (1.52.5)
  private readonly llmUrl = el<HTMLInputElement>('<input class="cv-input" type="url" aria-label="Language model address" spellcheck="false" placeholder="http://localhost:11434/v1">');
  private readonly llmModel = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Language model" spellcheck="false" list="cv-llm-models" placeholder="llama3.2">');
  private readonly llmModels = el('<datalist id="cv-llm-models"></datalist>');
  private readonly llmKey = el<HTMLInputElement>('<input class="cv-input" type="password" aria-label="Language model key" autocomplete="off" spellcheck="false">');
  private readonly llmNote = el('<p class="cv-note cv-llm-note" role="status">Any service with a chat completions API, at the address you type: a model on this computer or a hosted one with your key. Add as many rows as you like and pick the one in use. The engine keeps each key and never shows it.</p>');
  private readonly llmRows = new LlmRows({ url: this.llmUrl, model: this.llmModel, key: this.llmKey }, (t) => setText(this.llmNote, t));
  private readonly tplPick = el<HTMLSelectElement>('<select class="cv-input" aria-label="Prompt template"></select>');
  private readonly tplName = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Template name" maxlength="80">');
  private readonly tplText = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="4" aria-label="Template text"></textarea>');
  private readonly tplNote = el('<p class="cv-note" role="status"></p>');

  private async loadLlm(): Promise<void> {
    const s = await api.llmStatus();
    if (!s) { setText(this.llmNote, 'The formvis engine is offline: Improve Prompt needs it.'); return; }
    setText(this.keysNote, s.store === 'system' ? 'API keys (fal, the language model) are kept in your system\'s password store.' : 'API keys (fal, the language model) are kept in a file on this computer only you can read: no system password store was found.');
    this.llmRows.show(s);
  }

  private async saveLlm(forgetKey: boolean): Promise<void> {
    try {
      const s = await this.llmRows.save(forgetKey);
      setText(this.llmNote, forgetKey ? 'Key forgotten.' : `Saved: ${s.model} at ${s.baseUrl}.`);
      void this.apiKeys.refresh();
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
    this.tplPick.replaceChildren(...list.map((t) => { const o = document.createElement('option'); o.value = t.name; o.textContent = t.use && t.use !== 'improve' ? `${t.name} (${t.use})` : t.name; return o; }));
    this.tplPick.value = list.some((t) => t.name === was) ? was : list[0]?.name ?? '';
    this.showTemplate();
  }

  private showTemplate(): void {
    const t = templates().find((x) => x.name === this.tplPick.value);
    this.tplName.value = t?.name ?? ''; this.tplText.value = t?.text ?? ''; setText(this.tplNote, t ? `Use: ${t.use ?? 'improve'}${t.for ? `, for: ${t.for}` : ''}.` : '');
  }

  private async checkComfyUI(): Promise<void> {
    const target = this.comfyuiUrl.value.trim();
    setText(this.comfyuiNote, `Checking ${target}...`);
    setText(this.comfyuiNote, comfyuiProbeText(await api.comfyuiProbe(target, recipes().map((r) => ({ name: r.name, workflow: r.json }))), target));
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
    this.showBudget();
  }

  private showBudget(): void {
    const own = this.prefs.memoryLimitMB > 0;
    setText(this.budgetNote, `Largest document: ${Math.round(LIMITS.pixels / 1_000_000)} megapixels, ${own ? `within the ${this.prefs.memoryLimitMB.toLocaleString()} MB memory limit chosen below` : "set from this computer's memory (at least 100, at most 250)"}.`);
  }

  private sync(): void {
    if (document.activeElement !== this.nodemodeUrl) setValue(this.nodemodeUrl, this.prefs.nodemodeUrl);
    if (document.activeElement !== this.comfyuiUrl) setValue(this.comfyuiUrl, this.prefs.comfyuiUrl);
    void this.loadLlm();
    void this.showControlPort();
    void this.localModels.refresh();
    void this.comfyAuth.refresh();
    void this.modelFolder.refresh();
    void this.pluginsFolder.refresh();
    void this.pluginSwitches.refresh();
    void this.hfToken.refresh();
    void this.location.refresh();
    void this.apiKeys.refresh();
    void this.localFiles.refresh();
    this.recipesList.refresh();
    this.showBudget();
    this.agents.checked = this.prefs.agentsAllowed;
    if (!this.tplPick.options.length) this.fillTemplates();
    const c = readChoice();
    setValue(this.accent, c.accentColor);
    for (const b of Array.from(this.grid.querySelectorAll<HTMLElement>('[data-theme-id]'))) {
      const id = b.dataset.themeId ?? '';
      const active = id === c.theme;
      setClass(b, 'is-active', active);
      const fav = this.prefs.favouriteThemes.includes(id);
      setClass(b, 'is-fav', fav);
      const order = fav ? '-1' : '0';
      if (b.style.order !== order) b.style.order = order;
      const title = fav ? `${THEMES[id]?.label ?? id} (favorite, right-click to remove)` : `${THEMES[id]?.label ?? id} (right-click to add to favorites)`;
      if (b.title !== title) b.title = title;
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
  private adding = false;
  private pending: { id: string; combo: string } | null = null;
  private focusId: string | null = null;
  private readonly sets = el<HTMLSelectElement>('<select class="cv-select" aria-label="Shortcut set"></select>');
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".json,application/json" hidden>');

  /** Edit > Keyboard Shortcuts (1.53.4): every command rebindable with alternates, a conflict named and reassigned or
   *  not, Reset All, saved shortcut sets, and a set exported to or imported from a file; kept in Preferences. Tool
   *  letters are listed, fixed by their tools. */
  constructor(private readonly commands: Commands, private readonly deliver: (blob: Blob, name: string) => Promise<void>) {
    super('Keyboard Shortcuts', 660);
    const bar = el('<div class="cv-row" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap"></div>');
    const mk = (label: string, run: () => void): HTMLButtonElement => { const b = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost"></button>'); setText(b, label); b.addEventListener('click', run); return b; };
    bar.append(this.sets, mk('Use Set', () => this.useSet()), mk('Save Set...', () => void this.saveSet()), mk('Delete Set', () => this.deleteSet()), mk('Export...', () => this.exportSet()), mk('Import...', () => this.file.click()), mk('Import KYS...', () => chooseKys(this.commands, (set, say) => { if (set) this.fillSets(set); this.render(); this.say(say); })), this.file);
    this.body.append(bar, this.search, this.note, this.list);
    this.file.addEventListener('change', () => { const f = this.file.files?.[0]; this.file.value = ''; if (f) void this.importSet(f); });
    this.search.addEventListener('input', () => this.render());
    this.search.addEventListener('keydown', (e) => e.stopPropagation());
    this.button('Reset All', 'ghost', () => { this.commands.resetKeys(); this.save(); this.say(''); this.render(); });
    this.button('Close', 'primary', () => this.close());
    window.addEventListener('keydown', (e) => this.capture(e), true);
  }

  show(): void { this.capturing = null; this.pending = null; this.focusId = null; this.say(''); this.search.value = ''; this.fillSets(); this.render(); this.open(); }

  private save(): void { savePrefs({ ...loadPrefs(), shortcuts: this.commands.overrides() }); }

  private fillSets(choose?: string): void {
    const names = Object.keys(loadPrefs().shortcutSets), was = choose ?? this.sets.value;
    const want = ['', ...names];
    if (this.sets.options.length !== want.length || want.some((n, i) => this.sets.options[i].value !== n)) {
      this.sets.replaceChildren(...want.map((n) => new Option(n || 'Default Shortcuts', n)));
    }
    this.sets.value = want.includes(was) ? was : '';
  }

  /** Makes `bindings` the whole customisation: every command back to its defaults, then these keys on top. */
  private apply(bindings: Record<string, string[]>): number {
    this.commands.resetKeys();
    let n = 0;
    for (const [id, keys] of Object.entries(bindings)) if (this.commands.get(id)) { this.commands.setKeys(id, keys); n++; }
    this.save(); this.render();
    return n;
  }

  private useSet(): void {
    const name = this.sets.value;
    const n = this.apply(name ? loadPrefs().shortcutSets[name] ?? {} : {});
    this.say(name ? `Using ${name}: ${n} changed shortcut${n === 1 ? '' : 's'}.` : 'Back to the default shortcuts.');
  }

  private async saveSet(): Promise<void> {
    const name = (await promptName('Save Shortcut Set', this.sets.value || 'My Shortcuts', 'Save'))?.trim().slice(0, 60);
    if (!name) return;
    const p = loadPrefs();
    savePrefs({ ...p, shortcutSets: { ...p.shortcutSets, [name]: this.commands.overrides() } });
    this.fillSets(name);
    this.say(`Saved ${name}.`);
  }

  private deleteSet(): void {
    const name = this.sets.value, p = loadPrefs();
    if (!name || !(name in p.shortcutSets)) { this.say('The default shortcuts cannot be deleted.'); return; }
    const { [name]: _gone, ...rest } = p.shortcutSets;
    savePrefs({ ...p, shortcutSets: rest });
    this.fillSets('');
    this.say(`Deleted ${name}.`);
  }

  private exportSet(): void {
    const name = this.sets.value || 'Current';
    const doc = { format: 'formvis-shortcuts', version: 1, name, shortcuts: this.commands.overrides() };
    void this.deliver(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `formvis-shortcuts-${name.replace(/[^\w.-]+/g, '-')}.json`);
    this.say(`Exported ${Object.keys(doc.shortcuts).length} changed shortcuts.`);
  }

  private async importSet(f: File): Promise<void> {
    try {
      const raw = JSON.parse(await f.text()) as { shortcuts?: unknown; name?: unknown };
      const bindings = cleanBindings(raw && typeof raw === 'object' && 'shortcuts' in raw ? raw.shortcuts : raw);
      const known = Object.keys(bindings).filter((id) => this.commands.get(id)).length;
      if (!known) { this.say('That file has no shortcuts formvis knows.'); return; }
      const name = (typeof raw.name === 'string' && raw.name.trim() ? raw.name : f.name.replace(/\.[^.]+$/, '')).slice(0, 60);
      const p = loadPrefs();
      savePrefs({ ...p, shortcutSets: { ...p.shortcutSets, [name]: bindings } });
      this.fillSets(name);
      this.apply(bindings);
      const skipped = Object.keys(bindings).length - known;
      this.say(`Imported ${name}: ${known} shortcut${known === 1 ? '' : 's'} applied${skipped ? `, ${skipped} for commands formvis does not have skipped` : ''}.`);
    } catch { this.say('That file is not a shortcut set.'); }
  }

  private say(text: string, actions: HTMLElement[] = []): void { this.note.replaceChildren(); if (text) { const p = el('<span></span>'); setText(p, text); this.note.append(p, ...actions); } }

  private capture(e: KeyboardEvent): void {
    if (!this.capturing || !this.isOpen) return;
    e.preventDefault(); e.stopPropagation();
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;   // wait for the key itself
    const id = this.capturing, adding = this.adding;
    this.capturing = null; this.adding = false;
    if (e.key === 'Escape') { this.say(''); this.render(); return; }
    const combo = comboOf(e), other = this.commands.forCombo(combo);
    const keysWith = (cid: string, c: string): string[] => (adding ? [...(this.commands.get(cid)?.keys ?? []).filter((k) => k !== c), c] : [c]);
    if (other && other.id !== id) {
      this.pending = { id, combo };
      const re = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Reassign</button>'), no = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Cancel</button>');
      re.addEventListener('click', () => { const p = this.pending; this.pending = null; if (p) { this.commands.setKeys(p.id, keysWith(p.id, p.combo)); this.save(); } this.say(''); this.render(); });
      no.addEventListener('click', () => { this.pending = null; this.say(''); this.render(); });
      this.say(`${formatKeys(combo)} is used by ${this.commands.label(other)}. `, [re, no]);
      return;
    }
    this.commands.setKeys(id, keysWith(id, combo));
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
        const n = el('<div class="cv-list-row cv-keys-row"><span class="cv-list-name"></span><span class="cv-list-meta"></span><button type="button" class="cv-btn cv-btn-ghost">Change</button><button type="button" class="cv-btn cv-btn-ghost">Add</button><button type="button" class="cv-btn cv-btn-ghost">Remove</button></div>');
        n.dataset.command = r.id;
        const [change, add, remove] = [...n.querySelectorAll('button')] as HTMLButtonElement[];
        change.addEventListener('click', () => { this.capturing = r.id; this.adding = false; this.focusId = r.id; this.pending = null; this.say(''); this.render(); });
        add.addEventListener('click', () => { this.capturing = r.id; this.adding = true; this.focusId = r.id; this.pending = null; this.say(''); this.render(); });
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
    const [change, add, remove] = [...n.querySelectorAll('button')] as HTMLButtonElement[];
    if (change.getAttribute('aria-label') !== `Change ${r.label}`) { change.setAttribute('aria-label', `Change ${r.label}`); add.setAttribute('aria-label', `Add another shortcut to ${r.label}`); remove.setAttribute('aria-label', `Remove ${r.label}`); }
    setDisabled(remove, !r.keys);
  }
}

/** Help > Performance Benchmark (Phase 18.7): frame times on the CPU and each graphics processor path, to copy. */
export class BenchmarkDialog extends Dialog {
  private readonly state = el('<p class="cv-note cv-bench-state">Opens a temporary 2000 x 1500 document, times panning, adjustment layers and painting on the CPU and on each graphics processor path, then closes it. It takes under a minute.</p>');
  private readonly out = el('<pre class="cv-bench-out" hidden></pre>');
  private readonly table = el('<div class="cv-bench-wrap" hidden><table class="cv-bench-table"><thead><tr><th>Test</th><th>Path</th><th>P50 ms</th><th>P95 ms</th><th>Budget ms</th><th>Result</th><th>Vs baseline</th></tr></thead><tbody></tbody></table></div>');
  private readonly heap = el('<p class="cv-note cv-bench-heap" hidden></p>');
  private readonly rowNodes = new Map<string, HTMLTableCellElement[]>();
  private readonly runBtn: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private abort: AbortController | null = null;
  private last: { result: BenchResult; adapter: string } | null = null;
  private base: Baseline | null = null;

  constructor(private readonly run: (opts: BenchOptions) => Promise<{ result: BenchResult; adapter: string }>) {
    super('Performance Benchmark', 860);
    this.body.append(this.state, this.table, this.heap, this.out, el('<p class="cv-note">Numbers from a software graphics processor (as in a test browser) are not representative; run this on the machine you edit on. A path over its budget (P95) is marked over budget; a rise of more than 20 percent against the saved baseline is a regression.</p>'));
    this.button('Copy', 'ghost', () => { void navigator.clipboard?.writeText(this.out.textContent ?? ''); });
    this.saveBtn = this.button('Save as baseline', 'ghost', () => this.saveBase());
    this.cancelBtn = this.button('Cancel', 'ghost', () => this.abort?.abort());
    this.runBtn = this.button('Run', 'primary', () => { void this.start(); });
    setDisabled(this.saveBtn, true);
    setDisabled(this.cancelBtn, true);
    this.onClose = () => this.abort?.abort();
  }

  /** One row of the table, made when its path first reports and updated in place after. */
  private fillRow(r: BenchRow): void {
    let cells = this.rowNodes.get(r.key);
    if (!cells) {
      const tr = document.createElement('tr');
      cells = Array.from({ length: 7 }, () => tr.appendChild(document.createElement('td')));
      this.rowNodes.set(r.key, cells);
      q(this.table, 'tbody').appendChild(tr);
      setText(cells[0], r.test);
      setText(cells[1], r.path);
    }
    const has = r.frames > 0, v = versus(r, this.base);
    setText(cells[2], has ? r.medianMs.toFixed(2) : '-');
    setText(cells[3], has ? r.p95Ms.toFixed(2) : '-');
    setText(cells[4], String(r.budgetMs));
    setText(cells[5], r.state === 'running' ? `running, ${r.frames} frames` : resultWord(r));
    setText(cells[6], v.text);
    const tr = cells[0].parentElement as HTMLElement;
    const mark = r.state === 'running' ? 'running' : r.state === 'skipped' ? 'skipped' : r.within === false ? 'over' : r.within ? 'ok' : '';
    if (tr.dataset.mark !== mark) tr.dataset.mark = mark;
    const reg = v.regression ? 'regression' : '';
    if (cells[6].dataset.mark !== reg) cells[6].dataset.mark = reg;
  }

  private async start(): Promise<void> {
    setDisabled(this.runBtn, true);
    setDisabled(this.saveBtn, true);
    setDisabled(this.cancelBtn, false);
    this.abort = new AbortController();
    this.base = loadBaseline();
    for (const cells of this.rowNodes.values()) { for (const i of [2, 3, 5, 6]) setText(cells[i], '-'); (cells[0].parentElement as HTMLElement).dataset.mark = ''; }
    setHidden(this.table, false);
    setText(this.state, 'Running... Cancel stops it. Each path stops by itself after 4 seconds.');
    try {
      const done = await this.run({
        signal: this.abort.signal,
        onRow: (r) => this.fillRow(r),
        onProgress: (text) => setText(this.state, `Running: ${text}. Cancel stops it.`),
      });
      this.last = done;
      setText(this.out, benchText(done.result, done.adapter, this.base));
      setText(this.heap, heapText(done.result));
      setHidden(this.heap, false);
      setText(this.state, done.result.cancelled ? 'Cancelled. What was measured is shown.' : 'Done.');
      setDisabled(this.saveBtn, !done.result.rows.some((r) => r.frames > 0));
    } catch (err) {
      setText(this.state, `The benchmark stopped: ${String(err)}`);
    } finally {
      this.abort = null;
      setDisabled(this.runBtn, false);
      setDisabled(this.cancelBtn, true);
    }
  }

  private saveBase(): void {
    if (!this.last) return;
    const ok = saveBaseline(this.last.result.rows);
    this.base = ok ? loadBaseline() : null;
    for (const r of this.last.result.rows) this.fillRow(r);
    setText(this.out, benchText(this.last.result, this.last.adapter, this.base));
    setText(this.state, ok ? 'Saved this run as the baseline.' : 'The baseline could not be saved in this browser.');
  }

  show(): void { this.open(); }
}

export class AboutDialog extends Dialog {
  private readonly engineLine = el('<p class="cv-note"></p>');
  private readonly runtimeLine = el('<p class="cv-note"></p>');
  private readonly pluginLine = el('<p class="cv-note"></p>');

  constructor() {
    super('About formvis', 420);
    this.body.appendChild(el(`<div class="cv-welcome-title">${brandMark(28)}formvis ${VERSION}</div>`));
    this.body.appendChild(el('<p class="cv-note">A layered image editor for the web and the desktop, in the NodeMode design system.</p>'));
    this.body.appendChild(this.engineLine);
    this.body.appendChild(this.runtimeLine);
    this.body.appendChild(this.pluginLine);
    this.body.appendChild(el('<p class="cv-note">Source and releases: <a href="https://github.com/nodemode-ai/formvis" target="_blank" rel="noopener">github.com/nodemode-ai/formvis</a></p>'));
    this.body.appendChild(el('<p class="cv-note">Apache License 2.0. Copyright 2026 nodemode-ai.</p>'));
    this.body.appendChild(el('<p class="cv-note">Credits: formvis is built on open-source components; each one with its license is listed in NOTICE.md beside the app. Help > System Info has the graphics and monitor details.</p>'));
    this.button('Close', 'primary', () => this.close());
  }

  show(caps: Capabilities | null): void {
    setText(this.engineLine, caps
      ? `Engine ${caps.version}${caps.desktop ? ' (desktop)' : ''} · decoders ${caps.decode.engine} · background removal ${caps.removeBackground.ml ? 'ML and lightweight' : caps.removeBackground.lite ? 'lightweight' : 'unavailable'} · data in ${caps.dataDir}`
      : 'Engine offline. Start it with ./formvis boot.');
    setText(this.runtimeLine, caps?.runtime ? `Running on ${caps.runtime.system} (${caps.runtime.machine}) · engine Python ${caps.runtime.python} · window ${navigator.userAgent.match(/(Chrome|Firefox|Version)\/[\d.]+/)?.[0] ?? 'browser'}` : '');
    setText(this.pluginLine, caps ? `Plugin folder: ${caps.dataDir.replace(/[\\/]+$/, '')}${caps.dataDir.includes('\\') ? '\\' : '/'}plugins` : '');
    this.open();
  }
}

/** Help > System Info: the facts a bug report needs, in one block that can be copied. */
export class SystemInfoDialog extends Dialog {
  private readonly out = el<HTMLElement>('<pre class="cv-sysinfo" tabindex="0" aria-label="System information"></pre>');

  constructor() {
    super('System Info', 560);
    this.body.appendChild(this.out);
    this.button('Copy', 'ghost', () => { void navigator.clipboard?.writeText(this.out.textContent ?? '').then(() => toast('Copied the system information.'), () => toast('The clipboard is not available here.', 'error')); });
    this.button('Close', 'primary', () => this.close());
  }

  show(text: string): void {
    setText(this.out, text);
    this.open();
  }
}

/** Help > Report an Issue: what happened (the person's words) above the diagnostics, in one report to read, edit and copy.
 *  Nothing is sent: Copy puts it on the clipboard, and Open Issue Page opens formvis's own issue page to paste it into. */
export class ReportIssueDialog extends Dialog {
  private readonly what = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="3" placeholder="What happened, and what did you expect?" aria-label="What happened"></textarea>');
  private readonly diag = el<HTMLTextAreaElement>('<textarea class="cv-input cv-sysinfo" rows="12" spellcheck="false" aria-label="Diagnostics"></textarea>');

  constructor() {
    super('Report an Issue', 600);
    this.body.append(el('<p class="cv-dialog-note">This report stays on your computer until you paste it. Read it, remove anything private, then copy it into the issue page.</p>'));
    this.field('What happened', this.what);
    this.field('Diagnostics', this.diag);
    this.button('Open Issue Page', 'ghost', () => { window.open('https://github.com/nodemode-ai/formvis/issues/new', '_blank', 'noopener'); });
    this.button('Close', 'ghost', () => this.close());
    this.button('Copy Report', 'primary', () => {
      const text = `${this.what.value.trim() ? `${this.what.value.trim()}\n\n` : ''}${this.diag.value}`;
      void navigator.clipboard?.writeText(text).then(() => toast('Copied the report.'), () => toast('The clipboard is not available here.', 'error'));
    });
  }

  show(diagnostics: string): void {
    if (this.diag.value !== diagnostics) this.diag.value = diagnostics;
    this.open();
    this.what.focus();
  }
}

/** The update window (desktop app): the version found and its notes, with Restart and Update, Later and Skip this version.
 *  Closing it any other way is Later. */
export class UpdateDialog extends Dialog {
  private readonly line = el('<p class="cv-note"></p>');
  private readonly notes = el<HTMLElement>('<pre class="cv-sysinfo" tabindex="0" aria-label="Release notes" hidden></pre>');
  private resolve: ((v: 'install' | 'later' | 'skip') => void) | null = null;

  constructor() {
    super('Update available', 480);
    this.body.append(this.line, this.notes);
    this.button('Skip this version', 'ghost', () => this.finish('skip')).classList.add('cv-btn-apart');
    this.button('Later', 'ghost', () => this.finish('later'));
    this.button('Restart and update', 'primary', () => this.finish('install'));
    this.onClose = () => this.finish('later');
  }

  ask(message: string, notes: string | null): Promise<'install' | 'later' | 'skip'> {
    setText(this.line, message);
    setText(this.notes, notes ?? '');
    setHidden(this.notes, !notes);
    this.open();
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  private finish(v: 'install' | 'later' | 'skip'): void {
    const done = this.resolve;
    this.resolve = null;
    if (this.isOpen) this.close();
    done?.(v);
  }
}

/** Image > Mode > Bitmap... and Indexed Color... (1.50.2): the choices for the conversion. */
export class ModeDialog extends Dialog {
  private readonly method = el<HTMLSelectElement>('<select class="cv-input" aria-label="Method"><option value="threshold">50% Threshold</option><option value="pattern">Pattern Dither</option><option value="diffusion">Diffusion Dither</option><option value="halftone">Halftone Screen</option></select>');
  private readonly lpi = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="999" value="53" aria-label="Frequency">');
  private readonly angle = el<HTMLInputElement>('<input class="cv-input" type="number" min="-180" max="180" value="45" aria-label="Angle">');
  private readonly shape = el<HTMLSelectElement>('<select class="cv-input" aria-label="Shape"><option value="round">Round</option><option value="ellipse">Ellipse</option><option value="line">Line</option><option value="square">Square</option><option value="cross">Cross</option><option value="diamond">Diamond</option></select>');
  private readonly colors = el<HTMLInputElement>('<input class="cv-input" type="number" min="2" max="256" value="256" aria-label="Colors">');
  private readonly palette = el<HTMLSelectElement>('<select class="cv-input" aria-label="Palette"><option value="adaptive">Local (Adaptive)</option><option value="exact">Exact</option><option value="perceptual">Local (Perceptual)</option><option value="selective">Local (Selective)</option><option value="uniform">Uniform</option><option value="web">Web</option><option value="mac">System (Mac OS)</option><option value="windows">System (Windows)</option><option value="custom">Custom (.act file)</option></select>');
  private readonly actFile = el<HTMLInputElement>('<input class="cv-input" type="file" accept=".act" aria-label="Palette file">');
  private readonly forced = el<HTMLSelectElement>('<select class="cv-input" aria-label="Forced"><option value="none">None</option><option value="bw">Black and White</option><option value="primaries">Primaries</option><option value="web">Web</option></select>');
  private readonly transparency = el<HTMLInputElement>('<input type="checkbox" aria-label="Transparency" checked>');
  private readonly matte = el<HTMLInputElement>('<input type="color" value="#ffffff" aria-label="Matte">');
  private readonly dither = el<HTMLSelectElement>('<select class="cv-input" aria-label="Dither"><option value="none">None</option><option value="diffusion">Diffusion</option><option value="pattern">Pattern</option><option value="noise">Noise</option></select>');
  private readonly amount = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="100" value="75" aria-label="Amount">');
  private custom: RGB[] | null = null;
  private readonly profile = el<HTMLSelectElement>('<select class="cv-input" aria-label="Profile"></select>');
  private readonly intent = el<HTMLSelectElement>('<select class="cv-input" aria-label="Intent"><option value="perceptual">Perceptual</option><option value="relative" selected>Relative Colorimetric</option><option value="saturation">Saturation</option><option value="absolute">Absolute Colorimetric</option></select>');
  private readonly bpc = el<HTMLInputElement>('<input type="checkbox" aria-label="Use Black Point Compensation" checked>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly gray = el<HTMLSelectElement>('<select class="cv-input" aria-label="Grayscale from"><option value="luma">Luminosity (red 30, green 59, blue 11 percent)</option><option value="rec709">Rec. 709 luminance</option><option value="average">Average of the channels</option><option value="red">Red channel</option><option value="green">Green channel</option><option value="blue">Blue channel</option></select>');
  private kind: 'bitmap' | 'indexed' | 'cmyk' | 'grayscale' = 'bitmap';
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
      if (this.kind === 'grayscale') {
        const w = { luma: [0.299, 0.587, 0.114], rec709: [0.2126, 0.7152, 0.0722], average: [1 / 3, 1 / 3, 1 / 3], red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1] }[this.gray.value] as [number, number, number];
        if (this.engine.convertMode('grayscale', { grayWeights: w }) || !this.engine.current) this.close();
        return;
      }
      if (this.kind === 'indexed' && this.palette.value === 'custom' && !this.custom) { setText(this.note, 'Choose a .act color table file for the Custom palette.'); return; }
      const num = (e: HTMLInputElement, lo: number, hi: number, def: number): number => Math.max(lo, Math.min(hi, Number.isFinite(parseFloat(e.value)) ? parseFloat(e.value) : def));
      const hex = this.matte.value, ok = this.kind === 'bitmap'
        ? this.engine.convertMode('bitmap', { method: this.method.value as BitmapMethod, halftone: { lpi: num(this.lpi, 1, 999, 53), angle: num(this.angle, -180, 180, 45), shape: this.shape.value as HalftoneShape } })
        : this.engine.convertMode('indexed', { colors: Math.round(num(this.colors, 2, 256, 256)), indexed: {
          palette: this.palette.value as PaletteKind, custom: this.custom ?? undefined, forced: this.forced.value as ForcedKind, transparency: this.transparency.checked,
          matte: { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }, dither: this.dither.value as DitherKind, amount: num(this.amount, 0, 100, 75),
        } });
      if (ok || !this.engine.current) this.close();
    });
    this.actFile.addEventListener('change', () => {
      const f = this.actFile.files?.[0];
      if (!f) return;
      void f.arrayBuffer().then((b) => { this.custom = parseAct(b); setText(this.note, this.custom ? `${this.custom.length} colors loaded.` : 'Not a color table (.act) file.'); });
    });
    const screen = (): void => { const halftone = this.kind === 'bitmap' && this.method.value === 'halftone'; for (const r of this.screenRows) setHidden(r, !halftone); };
    this.method.addEventListener('change', screen);
    this.palette.addEventListener('change', () => setHidden(this.actRow, this.palette.value !== 'custom'));
  }

  private readonly screenRows: HTMLElement[] = [rowOf('Frequency (lines per inch)', this.lpi), rowOf('Angle (degrees)', this.angle), rowOf('Shape', this.shape)];
  private readonly actRow = rowOf('Color table', this.actFile);

  show(kind: 'bitmap' | 'indexed' | 'cmyk' | 'grayscale'): void {
    this.kind = kind;
    this.setTitle(kind === 'bitmap' ? 'Bitmap' : kind === 'indexed' ? 'Indexed Color' : kind === 'grayscale' ? 'Grayscale' : 'CMYK Color');
    if (kind === 'grayscale') {
      setText(this.note, '');
      this.body.replaceChildren(el('<p class="cv-dialog-note">Each layer is made gray from the weights of its red, green and blue channels. A deeper or CMYK document uses Image > Mode > Grayscale.</p>'), rowOf('Grayscale from', this.gray), this.note);
      this.open();
      return;
    }
    if (kind === 'cmyk') {
      setText(this.note, '');
      this.body.replaceChildren(el('<p class="cv-dialog-note">Every pixel layer is converted to ink through the profile, exactly, by the engine; tools that do not know ink yet wait until Mode > RGB Color.</p>'), rowOf('Profile', this.profile), rowOf('Intent', this.intent), rowOf('Use Black Point Compensation', this.bpc), this.note);
      this.open();
      void this.listProfiles();
      return;
    }
    setText(this.note, '');
    this.body.replaceChildren(el(`<p class="cv-dialog-note">${kind === 'bitmap' ? 'The image is flattened, then made black and white. A halftone screen sets its dots by the document resolution.' : 'The image is flattened, then made of a palette of at most 256 colours: every colour when there are that few, else the ones that best represent it.'}</p>`),
      ...(kind === 'bitmap' ? [rowOf('Method', this.method), ...this.screenRows]
        : [rowOf('Palette', this.palette), this.actRow, rowOf('Colors', this.colors), rowOf('Forced colors', this.forced), rowOf('Transparency', this.transparency), rowOf('Matte', this.matte), rowOf('Dither', this.dither), rowOf('Amount (percent)', this.amount)]), this.note);
    for (const r of this.screenRows) setHidden(r, this.method.value !== 'halftone');
    setHidden(this.actRow, this.palette.value !== 'custom');
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

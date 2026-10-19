import type { Engine } from '../../engine';
import { allBrushPresets, BUILTIN_BRUSH_PRESETS } from '../../engine/brush-dynamics';
import { allCustomShapes, CUSTOM_SHAPES, addCustomShape, parseShape, removeCustomShape, renameCustomShape, stepCustomShape } from '../../engine/custom-shapes';
import { allGradients, customGradients, GRADIENT_PRESETS, gradientsFromJson, setCustomGradients } from '../../engine/gradients';
import type { GradientPreset } from '../../engine/gradients';
import { readGgr, readGrd, writeGrd } from '../../io/grd';
import { readCsh, writeCsh } from '../../io/csh';
import { addPattern, allPatterns, removePattern, renamePattern, stepPattern } from '../../engine/patterns';
import { createSurface, ctxOf } from '../../engine/surface';
import { defaultEffects } from '../../engine/types';
import { addBrushesFromJson, brushesToJson, importAbr, removeImportedBrush, renameImportedBrush, stepBrushPreset } from '../../io/brush-library';
import { readPat, writePat } from '../../io/pat';
import { parseAco, parseAse, swatchNotes, writeAco, writeAse } from '../../io/swatch-files';
import { Dialog, promptName } from '../dialogs';
import { el, setHidden, setText } from '../dom';
import { checkRow } from './controls';
import type { SwatchesPanel } from '../swatches';
import { toast } from '../toast';
import { loadStylePresets, saveStylePresets, type StylePreset } from '../styles-panel';
import { loadToolPresets, saveToolPresets, type ToolPreset } from './tool-presets-dialog';
import { MENU_COLORS, cleanBindings, loadPrefs, updatePrefs } from '../prefs';

export type Kind ='brushes' | 'swatches' | 'gradients' | 'patterns' | 'shapes' | 'styles' | 'tools';
interface Item { id: string; label: string; builtin: boolean; colour?: string; name?: string }

const KINDS: ReadonlyArray<{ id: Kind; label: string; accept: string }> = [
  { id: 'brushes', label: 'Brushes', accept: '.abr,.json,application/json,image/*' },
  { id: 'swatches', label: 'Swatches', accept: '.aco,.ase' },
  { id: 'gradients', label: 'Gradients', accept: '.json,.grd,.ggr,application/json' },
  { id: 'patterns', label: 'Patterns', accept: '.pat' },
  { id: 'shapes', label: 'Custom Shapes', accept: '.json,.csh,application/json' },
  { id: 'styles', label: 'Layer Styles', accept: '.json,application/json' },
  { id: 'tools', label: 'Tool Presets', accept: '.json,application/json' },
];
const GRADIENT_KEY = 'formvis.gradients';
const PRESET_KIND: ReadonlyArray<[RegExp, Kind]> = [[/\.abr$/i, 'brushes'], [/\.(aco|ase)$/i, 'swatches'], [/\.(grd|ggr)$/i, 'gradients'], [/\.pat$/i, 'patterns'], [/\.csh$/i, 'shapes']];
/** The preset library a file belongs to by its extension, or null for any other file (File > Open and drops route by this). */
export const presetKindOf = (name: string): Kind | null => PRESET_KIND.find(([re]) => re.test(name))?.[1] ?? null;
export const PRESET_ACCEPT = '.abr,.aco,.ase,.grd,.ggr,.pat,.csh';
const message =(err: unknown): string => (err instanceof Error ? err.message : String(err));
const toBase64 = (u: Uint8Array): string => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = (s: string): Uint8ClampedArray<ArrayBuffer> => { const b = atob(s), out = new Uint8ClampedArray(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };

/** Edit > Presets > Preset Manager: one list per kind of preset (brushes, swatches, gradients, patterns, custom
 *  shapes) with Rename, Delete, Load and Save Set. The dialog's DOM is built once; only the list's options are
 *  rebuilt when its contents change. Built-in presets are listed but cannot be renamed or deleted. */
export class PresetManagerDialog extends Dialog {
  private readonly type: HTMLSelectElement;
  private readonly list: HTMLSelectElement;
  private readonly note: HTMLElement;
  private readonly renameBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;
  private readonly loadBtn: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly aseBtn: HTMLButtonElement;
  private readonly grdBtn: HTMLButtonElement;
  private readonly cshBtn: HTMLButtonElement;
  private readonly upBtn: HTMLButtonElement;
  private readonly downBtn: HTMLButtonElement;
  private items: Item[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly swatches: SwatchesPanel,
    private readonly deliver: (blob: Blob, name: string) => Promise<void>,
    private readonly keepPatterns: () => Promise<boolean>,
  ) {
    super('Preset Manager', 600);   // wide enough for its six buttons in one row
    const row = el('<label class="cv-field"><span>Preset Type</span><select class="cv-select"></select></label>');
    this.type = row.querySelector('select') as HTMLSelectElement;
    for (const k of KINDS) this.type.appendChild(new Option(k.label, k.id));
    this.list = el<HTMLSelectElement>('<select class="cv-select" size="12" multiple aria-label="Presets" style="width: 100%; height: 240px"></select>');
    this.note = el('<p class="cv-note"></p>');
    const bundle = el('<div class="cv-row" style="display: flex; gap: 6px; flex-wrap: wrap"></div>');
    for (const [label, run] of [['Export All...', () => void this.exportAll()], ['Import All...', () => this.pickBundle(false)], ['Migrate...', () => this.pickBundle(true)]] as const) {
      const b = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost"></button>');
      setText(b, label); b.addEventListener('click', run); bundle.append(b);
    }
    const builtinRow = checkRow('Include built-in gradients, shapes and patterns in Export All', (v) => { this.includeBuiltins = v; });
    this.body.append(row, this.list, this.note, bundle, builtinRow.el);
    this.type.addEventListener('change', () => this.refresh());
    this.list.addEventListener('change', () => this.sync());
    this.renameBtn = this.button('Rename', 'ghost', () => this.rename());
    this.upBtn = this.button('Move Up', 'ghost', () => void this.step(-1));
    this.downBtn = this.button('Move Down', 'ghost', () => void this.step(1));
    this.deleteBtn = this.button('Delete', 'danger', () => void this.remove());
    this.loadBtn = this.button('Load...', 'ghost', () => this.load());
    this.saveBtn = this.button('Save Set...', 'ghost', () => void this.saveSet());
    this.aseBtn = this.button('Export .ase...', 'ghost', () => void this.saveSet('swatches', 'ase'));
    this.grdBtn = this.button('Export .grd...', 'ghost', () => void this.saveSet('gradients', 'grd'));
    this.cshBtn = this.button('Export .csh...', 'ghost', () => void this.saveSet('shapes', 'csh'));
    this.button('Done', 'primary', () => this.close());
  }

  show(): void {
    this.refresh();
    this.open(this.list);
  }

  private get kind(): Kind { return this.type.value as Kind; }

  private collect(): Item[] {
    switch (this.kind) {
      case 'brushes': {
        const builtin = new Set(BUILTIN_BRUSH_PRESETS.map((p) => p.id));
        return allBrushPresets().map((p) => ({ id: p.id, label: p.name, builtin: builtin.has(p.id) }));
      }
      case 'swatches': return this.swatches.entries().map((e, i) => ({ id: String(i), label: e.name ? `${e.name} ${e.c}` : e.c, builtin: false, colour: e.c, name: e.name }));
      case 'gradients': {
        const builtin = new Set(GRADIENT_PRESETS.map((p) => p.id));
        return allGradients().map((p) => ({ id: p.id, label: p.label, builtin: builtin.has(p.id) }));
      }
      case 'patterns': return allPatterns().map((p) => ({ id: p.id, label: p.name, builtin: p.builtin }));
      case 'shapes': {
        const builtin = new Set(CUSTOM_SHAPES.map((s) => s.id));
        return allCustomShapes().map((s) => ({ id: s.id, label: s.label, builtin: builtin.has(s.id) }));
      }
      case 'styles': return loadStylePresets().map((s) => ({ id: s.id, label: s.group ? `${s.group} / ${s.name}` : s.name, builtin: false }));
      case 'tools': return loadToolPresets().map((p, i) => ({ id: String(i), label: `${p.name} (${p.tool})`, builtin: false }));
    }
  }

  /** Rebuilds the option elements only; the dialog's own DOM stays. */
  private refresh(): void {
    this.items = this.collect();
    this.list.replaceChildren(...this.items.map((it) => {
      const o = new Option(it.builtin ? `${it.label} (built in)` : it.label, it.id);
      o.title = it.label;
      if (this.kind === 'swatches') o.style.borderLeft = `14px solid ${it.colour ?? it.label}`;
      return o;
    }));
    setText(this.note, this.kind === 'swatches'
      ? 'Rename gives a swatch a name, kept in Save Set and Export .ase. Load takes .aco or .ase; Save Set writes .aco and Export writes .ase.'
      : this.kind === 'gradients' ? 'Load takes .json, .grd or .ggr; Save Set writes .json and Export writes a .grd. Built-in presets cannot be renamed or deleted.'
      : this.kind === 'shapes' ? 'Load takes .json or a .csh; Save Set writes .json and Export writes a .csh. Built-in presets cannot be renamed or deleted.'
      : this.kind === 'styles' ? 'Layer styles saved in the Styles panel. Load and Save Set use .json; the panel also reads and writes .asl.'
      : this.kind === 'tools' ? 'Tool presets saved in Window > Tool Presets. Load and Save Set use .json; a loaded preset replaces one with the same name and tool.'
      : 'Built-in presets are listed but cannot be renamed or deleted.');
    setHidden(this.renameBtn, false);
    setHidden(this.aseBtn, this.kind !== 'swatches');
    setHidden(this.grdBtn, this.kind !== 'gradients');
    setHidden(this.cshBtn, this.kind !== 'shapes');
    this.saveBtn.title = this.kind === 'brushes' ? 'Writes the brushes you saved or imported, with their tips, as a .json file.' : '';
    this.sync();
  }

  /** Moves the selected preset of your own one place; every kind keeps the order. */
  private async step(by: -1 | 1): Promise<void> {
    const it = this.selected()[0];
    if (!it || it.builtin) return;
    if (this.kind === 'brushes') await stepBrushPreset(it.id, by);
    else if (this.kind === 'swatches') {
      const all = [...this.swatches.all()], i = Number(it.id), j = i + by;
      if (j < 0 || j >= all.length) return;
      [all[i], all[j]] = [all[j], all[i]];
      this.swatches.setAll(all);
    } else if (this.kind === 'gradients') {
      const list = [...customGradients], i = list.findIndex((g) => g.id === it.id), j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      setCustomGradients(list);
      this.keepGradients();
    } else if (this.kind === 'patterns') { stepPattern(it.id, by); await this.keepPatterns(); }
    else if (this.kind === 'shapes') stepCustomShape(it.id, by);
    else if (this.kind === 'styles') {
      const list = loadStylePresets(), i = list.findIndex((s) => s.id === it.id), j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      saveStylePresets(list);
    } else if (this.kind === 'tools') {
      const list = loadToolPresets(), i = Number(it.id), j = i + by;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      saveToolPresets(list);
    }
    this.refresh();
    const at = this.items.findIndex((x) => (this.kind === 'swatches' || this.kind === 'tools' ? x.id === String(Number(it.id) + by) : x.id === it.id));
    if (at >= 0) this.list.options[at].selected = true;
    this.sync();
  }

  private selected(): Item[] {
    const ids = new Set(Array.from(this.list.selectedOptions).map((o) => o.value));
    return this.items.filter((it) => ids.has(it.id));
  }

  private sync(): void {
    const sel = this.selected(), mine = sel.filter((s) => !s.builtin);
    this.renameBtn.disabled = sel.length !== 1 || mine.length !== 1;
    this.deleteBtn.disabled = mine.length === 0;
    const own = this.items.filter((x) => !x.builtin), at = own.findIndex((x) => x.id === sel[0]?.id);
    this.upBtn.disabled = sel.length !== 1 || mine.length !== 1 || at <= 0;
    this.downBtn.disabled = sel.length !== 1 || mine.length !== 1 || at < 0 || at >= own.length - 1;
  }

  private rename(): void {
    const it = this.selected()[0];
    if (!it || it.builtin) return;
    void (async () => {
      const name = (await promptName('Rename Preset', this.kind === 'swatches' ? it.name ?? '' : it.label, 'Rename'))?.trim();   // the app's own prompt, not the browser's
      if (!name || name === (this.kind === 'swatches' ? it.name : it.label)) return;
      switch (this.kind) {
        case 'brushes': await renameImportedBrush(it.id, name); break;
        case 'gradients': {
          setCustomGradients(customGradients.map((g) => (g.id === it.id ? { ...g, label: name } : g)));
          this.keepGradients();
          break;
        }
        case 'patterns': renamePattern(it.id, name); await this.keepPatterns(); break;
        case 'shapes': renameCustomShape(it.id, name); break;
        case 'styles': saveStylePresets(loadStylePresets().map((s) => (s.id === it.id ? { ...s, name } : s))); break;
        case 'tools': saveToolPresets(loadToolPresets().map((p, i) => (String(i) === it.id ? { ...p, name } : p))); break;
        case 'swatches': this.swatches.rename(Number(it.id), name); break;
      }
      this.refresh();
    })();
  }

  private async remove(): Promise<void> {
    const sel = this.selected().filter((s) => !s.builtin);
    if (!sel.length) return;
    switch (this.kind) {
      case 'brushes': for (const it of sel) await removeImportedBrush(it.id); break;
      case 'swatches': {
        const drop = new Set(sel.map((s) => Number(s.id)));
        this.swatches.setAll(this.swatches.all().filter((_, i) => !drop.has(i)));
        break;
      }
      case 'gradients': {
        const drop = new Set(sel.map((s) => s.id));
        setCustomGradients(customGradients.filter((g) => !drop.has(g.id)));
        this.keepGradients();
        break;
      }
      case 'patterns': for (const it of sel) removePattern(it.id); await this.keepPatterns(); break;
      case 'shapes': for (const it of sel) removeCustomShape(it.id); break;
      case 'styles': { const drop = new Set(sel.map((s) => s.id)); saveStylePresets(loadStylePresets().filter((s) => !drop.has(s.id))); break; }
      case 'tools': { const drop = new Set(sel.map((s) => s.id)); saveToolPresets(loadToolPresets().filter((_, i) => !drop.has(String(i)))); break; }
    }
    this.refresh();
  }

  private keepGradients(): void {
    try { localStorage.setItem(GRADIENT_KEY, JSON.stringify(customGradients.filter((p) => p.id !== 'edited'))); } catch { toast('Gradients cannot be saved in this browser.', 'error'); }
  }

  /** Opens a file picker for one kind of preset (the Preset Manager's Load, and Edit > Presets > Load Swatches). */
  load(kind: Kind = this.kind): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = KINDS.find((k) => k.id === kind)?.accept ?? '';
    input.multiple = kind === 'patterns' || kind === 'brushes';
    input.addEventListener('change', () => void (async () => {
      let added = 0;
      for (const f of Array.from(input.files ?? [])) {
        try { added += await this.loadFile(kind, f); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
      }
      if (added) toast(`Loaded ${added} ${added === 1 ? 'preset' : 'presets'}.`);
      if (kind === this.kind) this.refresh();
    })());
    input.click();
  }

  /** Preset files opened or dropped like documents: each goes to its own library and one toast counts what loaded. */
  async loadPresetFiles(files: File[]): Promise<number> {
    const counts = new Map<Kind, number>();
    for (const f of files) {
      const kind = presetKindOf(f.name);
      if (!kind) continue;
      try { const n = await this.loadFile(kind, f); if (n) counts.set(kind, (counts.get(kind) ?? 0) + n); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
    }
    let total = 0;
    const parts: string[] = [];
    for (const [kind, n] of counts) { total += n; parts.push(`${n} ${KINDS.find((k) => k.id === kind)?.label.toLowerCase() ?? kind}`); }
    if (total) { toast(`Loaded ${parts.join(', ')} into the preset libraries.`); this.refresh(); }
    return total;
  }

  private async loadFile(kind: Kind, f: File): Promise<number> {
    if (kind === 'brushes' && /\.json$/i.test(f.name)) {
      const raw = JSON.parse(await f.text()) as unknown;
      return addBrushesFromJson(raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { brushes?: unknown }).brushes : raw);
    }
    if (kind === 'brushes') return (await importAbr(this.engine, f)).added;
    if (kind === 'swatches') {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const colours = /\.ase$/i.test(f.name) ? parseAse(bytes) : parseAco(bytes);
      if (!colours.length) throw new Error('No colours found.');
      const approx = swatchNotes(colours);
      if (approx.length) toast(`${f.name}: ${approx.join(' ')}`, 'info');
      this.swatches.setEntries(colours);
      return colours.length;
    }
    if (kind === 'patterns') {
      let n = 0;
      for (const pt of readPat(new Uint8Array(await f.arrayBuffer()))) {
        const s = createSurface(pt.width, pt.height);
        ctxOf(s).putImageData(new ImageData(pt.rgba as Uint8ClampedArray<ArrayBuffer>, pt.width, pt.height), 0, 0);
        addPattern(pt.name, s);
        n += 1;
      }
      if (n) await this.keepPatterns();
      return n;
    }
    if (kind === 'gradients' && /\.(grd|ggr)$/i.test(f.name)) {
      let found: GradientPreset[];
      let skipped = 0, approx = 0;
      if (/\.grd$/i.test(f.name)) { const res = readGrd(await f.arrayBuffer()); found = res.gradients; skipped = res.skipped; approx = res.approximated; }
      else found = readGgr(await f.text());
      setCustomGradients([...customGradients, ...found]);
      this.keepGradients();
      if (skipped) toast(`${f.name}: skipped ${skipped} ${skipped === 1 ? 'gradient' : 'gradients'}.`, 'info');
      if (approx) toast(`${f.name}: ${approx} noise ${approx === 1 ? 'gradient is' : 'gradients are'} approximated as stop gradients.`, 'info');
      return found.length;
    }
    if (kind === 'shapes' && /\.csh$/i.test(f.name)) {
      const res = readCsh(await f.arrayBuffer());
      for (const s of res.shapes) addCustomShape(s.name, s.path);
      if (res.skipped) toast(`${f.name}: skipped ${res.skipped} ${res.skipped === 1 ? 'shape' : 'shapes'} that could not be read.`, 'info');
      return res.shapes.length;
    }
    const raw: unknown = JSON.parse(await f.text());
    if (kind === 'styles') return this.addStyles(raw);
    if (kind === 'tools') return this.addToolPresets(raw);
    if (kind === 'gradients') {
      const known = new Set(allGradients().map((g) => g.id));
      const fresh = gradientsFromJson(raw).filter((g) => !known.has(g.id));
      setCustomGradients([...customGradients, ...fresh]);
      this.keepGradients();
      return fresh.length;
    }
    if (!Array.isArray(raw)) throw new Error('Expected a list of shapes.');
    let n = 0;
    for (const s of raw) {
      const o = s && typeof s === 'object' ? (s as { label?: unknown; d?: unknown }) : null;
      if (o && typeof o.label === 'string' && typeof o.d === 'string') { addCustomShape(o.label, parseShape(o.d)); n += 1; }
    }
    return n;
  }

  /** Layer styles from a list in a file or bundle: effects keep only the groups the engine knows, missing values take
   *  their defaults, and a style whose id is already saved is left out. Returns how many were added. */
  private addStyles(raw: unknown): number {
    if (!Array.isArray(raw)) throw new Error('Expected a list of styles.');
    const have = loadStylePresets(), known = new Set(have.map((s) => s.id)), base = defaultEffects() as unknown as Record<string, unknown>, fresh: StylePreset[] = [];
    for (const x of raw) {
      const o = x && typeof x === 'object' ? (x as { id?: unknown; name?: unknown; group?: unknown; effects?: unknown }) : null;
      if (!o || typeof o.name !== 'string' || !o.effects || typeof o.effects !== 'object') continue;
      const id = typeof o.id === 'string' && o.id ? o.id : `style-${Date.now().toString(36)}-${fresh.length}`;
      if (known.has(id)) continue;
      known.add(id);
      const src = o.effects as Record<string, unknown>, fx: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(base)) fx[k] = v && typeof v === 'object' && src[k] && typeof src[k] === 'object' ? { ...(v as object), ...(src[k] as object) } : v;
      fresh.push({ id, name: o.name.slice(0, 80) || 'Style', effects: fx as unknown as StylePreset['effects'], ...(typeof o.group === 'string' && o.group ? { group: o.group.slice(0, 40) } : {}) });
    }
    if (fresh.length) saveStylePresets([...have, ...fresh]);
    return fresh.length;
  }

  /** Tool presets from a list: a preset with the name and tool of a saved one replaces it. Returns how many were taken. */
  private addToolPresets(raw: unknown): number {
    if (!Array.isArray(raw)) throw new Error('Expected a list of tool presets.');
    const list = loadToolPresets();
    let n = 0;
    for (const x of raw) {
      const o = x && typeof x === 'object' ? (x as { name?: unknown; tool?: unknown; values?: unknown }) : null;
      if (!o || typeof o.name !== 'string' || typeof o.tool !== 'string' || !o.values || typeof o.values !== 'object') continue;
      const p: ToolPreset = { name: o.name.slice(0, 80), tool: o.tool, values: o.values as Record<string, unknown> }, at = list.findIndex((q) => q.name === p.name && q.tool === p.tool);
      if (at >= 0) list[at] = p; else list.push(p);
      n += 1;
    }
    if (n) saveToolPresets(list);
    return n;
  }

  /** Called with the settings an imported bundle carried (keyboard shortcuts, shortcut sets, menu choices), after they are kept. */
  onSettings: ((s: { shortcuts: Record<string, string[]> }) => void) | null = null;
  private includeBuiltins = false;

  /** Edit > Presets > Export Presets: the brushes, swatches, gradients, custom shapes and patterns of your own, and the
   *  keyboard and menu choices, in one file. Built-in presets are not written; they are in every copy. */
  async exportAll(): Promise<void> {
    try {
      const builtin = new Set(CUSTOM_SHAPES.map((s) => s.id)), p = loadPrefs();
      const bundle = {
        format: 'formvis-presets', version: 1,
        brushes: brushesToJson(),
        swatches: this.swatches.all(),
        gradients: (this.includeBuiltins ? allGradients() : customGradients).filter((g) => g.id !== 'edited'),
        shapes: allCustomShapes().filter((s) => this.includeBuiltins || !builtin.has(s.id)).map((s) => ({ label: s.label, d: s.d })),
        patterns: allPatterns().filter((x) => this.includeBuiltins || !x.builtin).map((x) => ({ name: x.name, width: x.surface.width, height: x.surface.height, rgba: toBase64(new Uint8Array(ctxOf(x.surface).getImageData(0, 0, x.surface.width, x.surface.height).data.buffer)) })),
        styles: loadStylePresets(),
        toolPresets: loadToolPresets(),
        settings: { shortcuts: p.shortcuts, shortcutSets: p.shortcutSets, menuHidden: p.menuHidden, menuColors: p.menuColors },
      };
      await this.deliver(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), 'formvis-presets.json');
      toast(`Exported ${bundle.brushes.length} brushes, ${bundle.swatches.length} swatches, ${bundle.gradients.length} gradients, ${bundle.shapes.length} shapes, ${bundle.patterns.length} patterns, ${bundle.styles.length} layer styles and ${bundle.toolPresets.length} tool presets.`);
    } catch (err) { toast(message(err), 'error'); }
  }

  /** Opens a file picker for a presets bundle; Migrate also takes the settings in it, Import All only the presets. */
  pickBundle(withSettings: boolean): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => { const f = input.files?.[0]; if (f) void this.importAll(f, withSettings); });
    input.click();
  }

  async importAll(f: File, withSettings: boolean): Promise<void> {
    try {
      const raw = JSON.parse(await f.text()) as Record<string, unknown>;
      if (!raw || raw.format !== 'formvis-presets') throw new Error('That is not a formvis presets file.');
      const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
      const have = new Set(this.swatches.all());
      const colours = list(raw.swatches).filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) && !have.has(c));
      if (colours.length) this.swatches.setAll([...this.swatches.all(), ...colours]);
      const known = new Set(allGradients().map((g) => g.id)), grads = gradientsFromJson(raw.gradients).filter((g) => !known.has(g.id));
      if (grads.length) { setCustomGradients([...customGradients, ...grads]); this.keepGradients(); }
      let shapes = 0, patterns = 0;
      for (const s of list(raw.shapes)) {
        const o = s && typeof s === 'object' ? (s as { label?: unknown; d?: unknown }) : null;
        if (o && typeof o.label === 'string' && typeof o.d === 'string') { addCustomShape(o.label, parseShape(o.d)); shapes += 1; }
      }
      for (const x of list(raw.patterns)) {
        const o = x as { name?: unknown; width?: unknown; height?: unknown; rgba?: unknown } | null;
        if (!o || typeof o.name !== 'string' || typeof o.rgba !== 'string' || typeof o.width !== 'number' || typeof o.height !== 'number') continue;
        const w = Math.round(o.width), h = Math.round(o.height), px = fromBase64(o.rgba);
        if (w < 1 || h < 1 || w > 4096 || h > 4096 || px.length !== w * h * 4) continue;
        const s = createSurface(w, h);
        ctxOf(s).putImageData(new ImageData(px, w, h), 0, 0);
        addPattern(o.name, s); patterns += 1;
      }
      if (patterns) await this.keepPatterns();
      const brushes = await addBrushesFromJson(raw.brushes);
      const styles = Array.isArray(raw.styles) ? this.addStyles(raw.styles) : 0, tools = Array.isArray(raw.toolPresets) ? this.addToolPresets(raw.toolPresets) : 0;
      let tail = '';
      const st = withSettings && raw.settings && typeof raw.settings === 'object' ? (raw.settings as Record<string, unknown>) : null;
      if (st) {
        const cur = loadPrefs(), sets: Record<string, Record<string, string[]>> = { ...cur.shortcutSets };
        if (st.shortcutSets && typeof st.shortcutSets === 'object') for (const [k, v] of Object.entries(st.shortcutSets as Record<string, unknown>).slice(0, 50)) sets[k.slice(0, 60)] = cleanBindings(v);
        const shortcuts = cleanBindings(st.shortcuts);
        const hidden = list(st.menuHidden).filter((x): x is string => typeof x === 'string');
        const colorsIn = st.menuColors && typeof st.menuColors === 'object' ? Object.entries(st.menuColors as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && MENU_COLORS.includes(v)) : [];
        updatePrefs({ shortcutSets: sets, shortcuts, menuHidden: hidden, menuColors: Object.fromEntries(colorsIn) as Record<string, string> });
        this.onSettings?.({ shortcuts });
        tail = ', and the keyboard and menu settings';
      }
      toast(`Imported ${brushes} brushes, ${colours.length} swatches, ${grads.length} gradients, ${shapes} shapes, ${patterns} patterns, ${styles} layer styles and ${tools} tool presets${tail}.`);
      this.refresh();
    } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
  }

  /** Writes one kind of preset to a file (the Preset Manager's Save Set, and Edit > Presets > Save Swatches). */
  async saveSet(kind: Kind = this.kind, format?: 'ase' | 'grd' | 'csh'): Promise<void> {
    try {
      switch (kind) {
        case 'swatches':
          if (format === 'ase') await this.deliver(new Blob([writeAse(this.swatches.entries()) as BlobPart], { type: 'application/octet-stream' }), 'Swatches.ase');
          else await this.deliver(new Blob([writeAco(this.swatches.entries()) as BlobPart], { type: 'application/octet-stream' }), 'Swatches.aco');
          break;
        case 'patterns': {
          const mine = allPatterns().filter((q) => !q.builtin);
          if (!mine.length) { toast('There are no patterns of your own to save.', 'info'); return; }
          const list = mine.map((q) => ({ name: q.name, width: q.surface.width, height: q.surface.height, rgba: ctxOf(q.surface).getImageData(0, 0, q.surface.width, q.surface.height).data }));
          await this.deliver(new Blob([writePat(list) as BlobPart], { type: 'application/octet-stream' }), 'Patterns.pat');
          break;
        }
        case 'gradients': {
          if (!customGradients.length) { toast('There are no gradients of your own to save.', 'info'); return; }
          if (format === 'grd') await this.deliver(new Blob([writeGrd(customGradients) as BlobPart], { type: 'application/octet-stream' }), 'Gradients.grd');
          else await this.deliver(new Blob([JSON.stringify(customGradients, null, 2)], { type: 'application/json' }), 'Gradients.json');
          break;
        }
        case 'shapes': {
          const builtin = new Set(CUSTOM_SHAPES.map((s) => s.id)), mine = allCustomShapes().filter((s) => !builtin.has(s.id));
          if (!mine.length) { toast('There are no custom shapes of your own to save.', 'info'); return; }
          if (format === 'csh') await this.deliver(new Blob([writeCsh(mine.map((s) => ({ name: s.label, path: parseShape(s.d) }))) as BlobPart], { type: 'application/octet-stream' }), 'Custom Shapes.csh');
          else await this.deliver(new Blob([JSON.stringify(mine, null, 2)], { type: 'application/json' }), 'Custom Shapes.json');
          break;
        }
        case 'brushes': {
          const list = brushesToJson();
          if (!list.length) { toast('There are no brushes of your own to save.', 'info'); return; }
          await this.deliver(new Blob([JSON.stringify({ format: 'formvis-brushes', version: 1, brushes: list })], { type: 'application/json' }), 'Brushes.json');
          break;
        }
        case 'styles': {
          const list = loadStylePresets();
          if (!list.length) { toast('There are no layer styles to save.', 'info'); return; }
          await this.deliver(new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' }), 'Layer Styles.json');
          break;
        }
        case 'tools': {
          const list = loadToolPresets();
          if (!list.length) { toast('There are no tool presets to save.', 'info'); return; }
          await this.deliver(new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' }), 'Tool Presets.json');
          break;
        }
      }
    } catch (err) { toast(message(err), 'error'); }
  }
}

import type { Engine } from '../../engine';
import { allBrushPresets, BUILTIN_BRUSH_PRESETS } from '../../engine/brush-dynamics';
import { allCustomShapes, CUSTOM_SHAPES, addCustomShape, parseShape, removeCustomShape, renameCustomShape } from '../../engine/custom-shapes';
import { allGradients, customGradients, GRADIENT_PRESETS, gradientsFromJson, setCustomGradients } from '../../engine/gradients';
import type { GradientPreset } from '../../engine/gradients';
import { readGgr, readGrd, writeGrd } from '../../io/grd';
import { readCsh, writeCsh } from '../../io/csh';
import { addPattern, allPatterns, removePattern, renamePattern } from '../../engine/patterns';
import { createSurface, ctxOf } from '../../engine/surface';
import { importAbr, removeImportedBrush, renameImportedBrush } from '../../io/brush-library';
import { readPat, writePat } from '../../io/pat';
import { parseAco, parseAse, writeAco, writeAse } from '../../io/swatch-files';
import { Dialog, promptName } from '../dialogs';
import { el, setHidden, setText } from '../dom';
import type { SwatchesPanel } from '../swatches';
import { toast } from '../toast';
import { MENU_COLORS, cleanBindings, loadPrefs, updatePrefs } from '../prefs';

export type Kind ='brushes' | 'swatches' | 'gradients' | 'patterns' | 'shapes';
interface Item { id: string; label: string; builtin: boolean }

const KINDS: ReadonlyArray<{ id: Kind; label: string; accept: string }> = [
  { id: 'brushes', label: 'Brushes', accept: '.abr,image/*' },
  { id: 'swatches', label: 'Swatches', accept: '.aco,.ase' },
  { id: 'gradients', label: 'Gradients', accept: '.json,.grd,.ggr,application/json' },
  { id: 'patterns', label: 'Patterns', accept: '.pat' },
  { id: 'shapes', label: 'Custom Shapes', accept: '.json,.csh,application/json' },
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
    this.body.append(row, this.list, this.note, bundle);
    this.type.addEventListener('change', () => this.refresh());
    this.list.addEventListener('change', () => this.sync());
    this.renameBtn = this.button('Rename', 'ghost', () => this.rename());
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
      case 'swatches': return this.swatches.all().map((c, i) => ({ id: String(i), label: c, builtin: false }));
      case 'gradients': {
        const builtin = new Set(GRADIENT_PRESETS.map((p) => p.id));
        return allGradients().map((p) => ({ id: p.id, label: p.label, builtin: builtin.has(p.id) }));
      }
      case 'patterns': return allPatterns().map((p) => ({ id: p.id, label: p.name, builtin: p.builtin }));
      case 'shapes': {
        const builtin = new Set(CUSTOM_SHAPES.map((s) => s.id));
        return allCustomShapes().map((s) => ({ id: s.id, label: s.label, builtin: builtin.has(s.id) }));
      }
    }
  }

  /** Rebuilds the option elements only; the dialog's own DOM stays. */
  private refresh(): void {
    this.items = this.collect();
    this.list.replaceChildren(...this.items.map((it) => {
      const o = new Option(it.builtin ? `${it.label} (built in)` : it.label, it.id);
      o.title = it.label;
      if (this.kind === 'swatches') o.style.borderLeft = `14px solid ${it.label}`;
      return o;
    }));
    setText(this.note, this.kind === 'swatches'
      ? 'Swatches have no names, so they cannot be renamed. Load takes .aco or .ase; Save Set writes .aco and Export writes .ase.'
      : this.kind === 'gradients' ? 'Load takes .json, .grd or .ggr; Save Set writes .json and Export writes a .grd. Built-in presets cannot be renamed or deleted.'
      : this.kind === 'shapes' ? 'Load takes .json or a .csh; Save Set writes .json and Export writes a .csh. Built-in presets cannot be renamed or deleted.'
      : 'Built-in presets are listed but cannot be renamed or deleted.');
    setHidden(this.renameBtn, this.kind === 'swatches');
    setHidden(this.aseBtn, this.kind !== 'swatches');
    setHidden(this.grdBtn, this.kind !== 'gradients');
    setHidden(this.cshBtn, this.kind !== 'shapes');
    this.saveBtn.disabled = this.kind === 'brushes';
    this.saveBtn.title = this.kind === 'brushes' ? 'Brush sets cannot be saved yet.' : '';
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
  }

  private rename(): void {
    const it = this.selected()[0];
    if (!it || it.builtin) return;
    void (async () => {
      const name = (await promptName('Rename Preset', it.label, 'Rename'))?.trim();   // the app's own prompt, not the browser's
      if (!name || name === it.label) return;
      switch (this.kind) {
        case 'brushes': await renameImportedBrush(it.id, name); break;
        case 'gradients': {
          setCustomGradients(customGradients.map((g) => (g.id === it.id ? { ...g, label: name } : g)));
          this.keepGradients();
          break;
        }
        case 'patterns': renamePattern(it.id, name); await this.keepPatterns(); break;
        case 'shapes': renameCustomShape(it.id, name); break;
        case 'swatches': break;
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
    if (kind === 'brushes') return (await importAbr(this.engine, f)).added;
    if (kind === 'swatches') {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const colours = /\.ase$/i.test(f.name) ? parseAse(bytes) : parseAco(bytes);
      if (!colours.length) throw new Error('No colours found.');
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
      let skipped = 0;
      if (/\.grd$/i.test(f.name)) { const res = readGrd(await f.arrayBuffer()); found = res.gradients; skipped = res.skipped; }
      else found = readGgr(await f.text());
      setCustomGradients([...customGradients, ...found]);
      this.keepGradients();
      if (skipped) toast(`${f.name}: skipped ${skipped} noise ${skipped === 1 ? 'gradient' : 'gradients'}.`, 'info');
      return found.length;
    }
    if (kind === 'shapes' && /\.csh$/i.test(f.name)) {
      const res = readCsh(await f.arrayBuffer());
      for (const s of res.shapes) addCustomShape(s.name, s.path);
      if (res.skipped) toast(`${f.name}: skipped ${res.skipped} ${res.skipped === 1 ? 'shape' : 'shapes'} that could not be read.`, 'info');
      return res.shapes.length;
    }
    const raw: unknown = JSON.parse(await f.text());
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

  /** Called with the settings an imported bundle carried (keyboard shortcuts, shortcut sets, menu choices), after they are kept. */
  onSettings: ((s: { shortcuts: Record<string, string[]> }) => void) | null = null;

  /** Edit > Presets > Export Presets: the swatches, gradients, custom shapes and patterns of your own, and the keyboard
   *  and menu choices, in one file (brush sets are imported from their own files and are not part of it). */
  async exportAll(): Promise<void> {
    try {
      const builtin = new Set(CUSTOM_SHAPES.map((s) => s.id)), p = loadPrefs();
      const bundle = {
        format: 'formvis-presets', version: 1,
        swatches: this.swatches.all(),
        gradients: customGradients.filter((g) => g.id !== 'edited'),
        shapes: allCustomShapes().filter((s) => !builtin.has(s.id)).map((s) => ({ label: s.label, d: s.d })),
        patterns: allPatterns().filter((x) => !x.builtin).map((x) => ({ name: x.name, width: x.surface.width, height: x.surface.height, rgba: toBase64(new Uint8Array(ctxOf(x.surface).getImageData(0, 0, x.surface.width, x.surface.height).data.buffer)) })),
        settings: { shortcuts: p.shortcuts, shortcutSets: p.shortcutSets, menuHidden: p.menuHidden, menuColors: p.menuColors },
      };
      await this.deliver(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), 'formvis-presets.json');
      toast(`Exported ${bundle.swatches.length} swatches, ${bundle.gradients.length} gradients, ${bundle.shapes.length} shapes and ${bundle.patterns.length} patterns.`);
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
      toast(`Imported ${colours.length} swatches, ${grads.length} gradients, ${shapes} shapes and ${patterns} patterns${tail}.`);
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
        case 'brushes': break;
      }
    } catch (err) { toast(message(err), 'error'); }
  }
}

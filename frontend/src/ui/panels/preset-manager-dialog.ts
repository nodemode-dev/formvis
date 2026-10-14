import type { Engine } from '../../engine';
import { allBrushPresets, BUILTIN_BRUSH_PRESETS } from '../../engine/brush-dynamics';
import { allCustomShapes, CUSTOM_SHAPES, addCustomShape, parseShape, removeCustomShape, renameCustomShape } from '../../engine/custom-shapes';
import { allGradients, customGradients, GRADIENT_PRESETS, gradientsFromJson, setCustomGradients } from '../../engine/gradients';
import type { GradientPreset } from '../../engine/gradients';
import { readGgr, readGrd } from '../../io/grd';
import { addPattern, allPatterns, removePattern, renamePattern } from '../../engine/patterns';
import { createSurface, ctxOf } from '../../engine/surface';
import { importAbr, removeImportedBrush, renameImportedBrush } from '../../io/brush-library';
import { readPat, writePat } from '../../io/pat';
import { readAco, readAse, writeAco } from '../../io/swatch-files';
import { Dialog, promptName } from '../dialogs';
import { el, setHidden, setText } from '../dom';
import type { SwatchesPanel } from '../swatches';
import { toast } from '../toast';

export type Kind ='brushes' | 'swatches' | 'gradients' | 'patterns' | 'shapes';
interface Item { id: string; label: string; builtin: boolean }

const KINDS: ReadonlyArray<{ id: Kind; label: string; accept: string }> = [
  { id: 'brushes', label: 'Brushes', accept: '.abr' },
  { id: 'swatches', label: 'Swatches', accept: '.aco,.ase' },
  { id: 'gradients', label: 'Gradients', accept: '.json,.grd,.ggr,application/json' },
  { id: 'patterns', label: 'Patterns', accept: '.pat' },
  { id: 'shapes', label: 'Custom Shapes', accept: '.json,application/json' },
];
const GRADIENT_KEY = 'formvis.gradients';
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

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
  private items: Item[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly swatches: SwatchesPanel,
    private readonly deliver: (blob: Blob, name: string) => Promise<void>,
    private readonly keepPatterns: () => Promise<boolean>,
  ) {
    super('Preset Manager', 520);   // wide enough for its five buttons in one row
    const row = el('<label class="cv-field"><span>Preset Type</span><select class="cv-select"></select></label>');
    this.type = row.querySelector('select') as HTMLSelectElement;
    for (const k of KINDS) this.type.appendChild(new Option(k.label, k.id));
    this.list = el<HTMLSelectElement>('<select class="cv-select" size="12" multiple aria-label="Presets" style="width: 100%; height: 240px"></select>');
    this.note = el('<p class="cv-note"></p>');
    this.body.append(row, this.list, this.note);
    this.type.addEventListener('change', () => this.refresh());
    this.list.addEventListener('change', () => this.sync());
    this.renameBtn = this.button('Rename', 'ghost', () => this.rename());
    this.deleteBtn = this.button('Delete', 'danger', () => void this.remove());
    this.loadBtn = this.button('Load...', 'ghost', () => this.load());
    this.saveBtn = this.button('Save Set...', 'ghost', () => void this.saveSet());
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
      ? 'Swatches have no names, so they cannot be renamed. Load takes .aco or .ase; Save Set writes .aco.'
      : 'Built-in presets are listed but cannot be renamed or deleted.');
    setHidden(this.renameBtn, this.kind === 'swatches');
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

  private async loadFile(kind: Kind, f: File): Promise<number> {
    if (kind === 'brushes') return (await importAbr(this.engine, f)).added;
    if (kind === 'swatches') {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const colours = /\.ase$/i.test(f.name) ? readAse(bytes) : readAco(bytes);
      if (!colours.length) throw new Error('No colours found.');
      this.swatches.setAll(colours);
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

  /** Writes one kind of preset to a file (the Preset Manager's Save Set, and Edit > Presets > Save Swatches). */
  async saveSet(kind: Kind = this.kind): Promise<void> {
    try {
      switch (kind) {
        case 'swatches': await this.deliver(new Blob([writeAco(this.swatches.all()) as BlobPart], { type: 'application/octet-stream' }), 'Swatches.aco'); break;
        case 'patterns': {
          const mine = allPatterns().filter((q) => !q.builtin);
          if (!mine.length) { toast('There are no patterns of your own to save.', 'info'); return; }
          const list = mine.map((q) => ({ name: q.name, width: q.surface.width, height: q.surface.height, rgba: ctxOf(q.surface).getImageData(0, 0, q.surface.width, q.surface.height).data }));
          await this.deliver(new Blob([writePat(list) as BlobPart], { type: 'application/octet-stream' }), 'Patterns.pat');
          break;
        }
        case 'gradients': {
          if (!customGradients.length) { toast('There are no gradients of your own to save.', 'info'); return; }
          await this.deliver(new Blob([JSON.stringify(customGradients, null, 2)], { type: 'application/json' }), 'Gradients.json');
          break;
        }
        case 'shapes': {
          const builtin = new Set(CUSTOM_SHAPES.map((s) => s.id)), mine = allCustomShapes().filter((s) => !builtin.has(s.id));
          if (!mine.length) { toast('There are no custom shapes of your own to save.', 'info'); return; }
          await this.deliver(new Blob([JSON.stringify(mine, null, 2)], { type: 'application/json' }), 'Custom Shapes.json');
          break;
        }
        case 'brushes': break;
      }
    } catch (err) { toast(message(err), 'error'); }
  }
}

import type { Engine } from '../engine';
import type { LayerEffects } from '../engine/types';
import { defaultEffects, effectsPresent } from '../engine/types';
import { readAsl, writeAsl } from '../io/asl';
import { promptName } from './dialogs';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

export interface StylePreset { id: string; name: string; effects: LayerEffects; group?: string }

const KEY = 'formvis.stylePresets';

/** The styles Restore Default Styles puts back, each under the group Defaults, found again by its fixed id. */
function defaultPresets(): StylePreset[] {
  const make = (id: string, name: string, edit: (fx: LayerEffects) => void): StylePreset => { const effects = defaultEffects(); edit(effects); return { id: `default-${id}`, name, effects, group: 'Defaults' }; };
  return [
    make('soft-shadow', 'Soft Shadow', (fx) => { fx.dropShadow.enabled = true; fx.dropShadow.distance = 8; fx.dropShadow.size = 14; fx.dropShadow.opacity = 0.55; }),
    make('outline', 'Outline', (fx) => { fx.stroke.enabled = true; fx.stroke.size = 4; fx.stroke.position = 'outside'; }),
    make('glow', 'Soft Glow', (fx) => { fx.outerGlow.enabled = true; fx.outerGlow.size = 18; fx.outerGlow.spread = 20; }),
    make('emboss', 'Emboss', (fx) => { fx.bevel.enabled = true; fx.bevel.style = 'emboss'; fx.bevel.size = 6; fx.bevel.depth = 120; }),
    make('chrome', 'Chrome Gradient', (fx) => { fx.gradientOverlay.enabled = true; fx.gradientOverlay.style = 'reflected'; fx.gradientOverlay.from = { r: 245, g: 245, b: 250 }; fx.gradientOverlay.to = { r: 90, g: 100, b: 120 }; fx.satin.enabled = true; }),
    make('inset', 'Inset', (fx) => { fx.innerShadow.enabled = true; fx.innerShadow.distance = 4; fx.innerShadow.size = 8; }),
  ];
}

function loadPresets(): StylePreset[] {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(r)) return [];
    return r.filter((p): p is StylePreset => !!p && typeof p === 'object' && typeof (p as StylePreset).id === 'string' && typeof (p as StylePreset).name === 'string' && !!(p as StylePreset).effects && ((p as StylePreset).group === undefined || typeof (p as StylePreset).group === 'string'));
  } catch { return []; }
}

let docSink: ((list: readonly StylePreset[]) => void) | null = null;

function savePresets(list: readonly StylePreset[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable: the styles last for this session */ }
  docSink?.(list);
}

/** The Preset Manager's way to the saved styles: it reads and writes the same list, and the panel reloads on the event. */
export const loadStylePresets = (): StylePreset[] => loadPresets();
export function saveStylePresets(list: readonly StylePreset[]): void {
  savePresets(list);
  window.dispatchEvent(new Event('formvis:style-presets'));
}

/** The Styles panel (Window > Styles, DEV_PLAN 35.3 part b): a grid of saved layer styles. A tile shows the style's name;
 *  clicking one selects it and applies it to the active layer as one undo step. The skeleton is built once and tiles are
 *  patched in by id. */
export class StylesPanel {
  private readonly grid: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly count: HTMLElement;
  private readonly foot: HTMLButtonElement[];
  private presets = loadPresets();
  private selected: string | null = null;
  private serial = 0;
  private readonly groupPick: HTMLSelectElement;
  private filter = '';

  constructor(root: HTMLElement, private readonly engine: Engine, private readonly deliver: (blob: Blob, name: string) => Promise<void>) {
    const btn = (cmd: string, title: string, glyph: string): string => `<button class="cv-icon-btn" type="button" data-act="${cmd}" title="${title}" aria-label="${title}">${icon(glyph, 16)}</button>`;
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-styles" aria-label="Styles">` +
      `<div class="cv-panel-head"><span class="cv-comps-title">${icon('layers', 14)}<span>Styles</span></span><select class="cv-input cv-styles-group" aria-label="Style group" title="Show one group of styles"><option value="">All styles</option></select><span class="cv-comps-count"></span></div>` +
      `<div class="cv-styles-grid" role="listbox" aria-label="Styles"></div>` +
      `<div class="cv-comps-empty">No styles yet. Use New to save the active layer's style.</div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn cv-styles-clear" type="button" data-act="clear" title="Clear the active layer's style" aria-label="Clear Style">Clear Style</button>${btn('defaults', 'Restore the default styles', 'undo')}${btn('group', 'Put the selected style in a group', 'folder')}${btn('update', "Replace the selected style with the active layer's style", 'refresh')}${btn('delete', 'Delete the selected style', 'delete')}${btn('load','Load Styles (.asl or .json)', 'upload')}${btn('export', 'Export Styles (.asl)', 'download')}${btn('new', 'New style from the active layer', 'add')}</div></section>`);
    const section = q(root, '.cv-styles');
    this.grid = q(section, '.cv-styles-grid');
    this.empty = q(section, '.cv-comps-empty');
    this.count = q(section, '.cv-comps-count');
    this.foot = Array.from(section.querySelectorAll<HTMLButtonElement>('.cv-panel-foot [data-act]'));
    this.groupPick = q<HTMLSelectElement>(section, '.cv-styles-group');
    this.groupPick.addEventListener('change', () => { this.filter = this.groupPick.value; this.sync(); });
    section.querySelector('.cv-panel-foot')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'new') void this.create();
      else if (b.dataset.act === 'defaults') this.restoreDefaults();
      else if (b.dataset.act === 'group') void this.regroup();
      else if (b.dataset.act === 'update') this.replaceSelected();
      else if (b.dataset.act === 'delete') this.remove();
      else if (b.dataset.act === 'load') this.load();
      else if (b.dataset.act === 'export') void this.exportAll();
      else if (b.dataset.act === 'clear') this.engine.applyLayerStyle(null);
    });
    this.grid.addEventListener('click', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.cv-style-tile[data-id]');
      const p = tile ? this.presets.find((x) => x.id === tile.dataset.id) : undefined;
      if (!p) return;
      this.selected = p.id;
      this.engine.applyLayerStyle(p.effects);
      this.sync();
    });
    this.grid.addEventListener('dblclick', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.cv-style-tile[data-id]');
      const p = tile ? this.presets.find((x) => x.id === tile.dataset.id) : undefined;
      if (p) void this.rename(p);
    });
    docSink = (list) => { engine.setStylePresets(list); };
    window.addEventListener('formvis:style-presets', () => { this.presets = loadPresets(); if (this.selected && !this.presets.some((p) => p.id === this.selected)) this.selected = null; this.sync(); });
    for (const ev of ['doc', 'history', 'active', 'projects'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

  /** The styles saved in the open file join the panel's list when the panel does not have them yet. */
  private mergeDoc(): void {
    const saved = this.engine.current?.doc.stylePresets;
    if (!saved?.length) return;
    const have = new Set(this.presets.map((p) => p.id)), add = saved.filter((p) => !have.has(p.id));
    if (!add.length) return;
    this.presets = [...this.presets, ...structuredClone(add) as StylePreset[]];
    try { localStorage.setItem(KEY, JSON.stringify(this.presets)); } catch { /* the styles last for this session */ }
  }

  private async create(): Promise<void> {
    const fx = this.engine.current?.activeLayer?.effects;
    if (!effectsPresent(fx)) return;
    const name = await promptName('New Style', `Style ${this.presets.length + 1}`, 'Create');
    if (name === null) return;
    const id = `style-${Date.now().toString(36)}-${(this.serial++).toString(36)}`;
    this.presets = [...this.presets, { id, name: name.trim() || `Style ${this.presets.length + 1}`, effects: structuredClone(fx), ...(this.filter ? { group: this.filter } : {}) }];
    this.selected = id;
    savePresets(this.presets);
    this.sync();
  }

  /** Double-click a tile to rename its style. */
  private async rename(p: StylePreset): Promise<void> {
    const name = await promptName('Rename Style', p.name, 'Rename');
    if (name === null || !name.trim() || name.trim() === p.name) return;
    this.presets = this.presets.map((x) => (x.id === p.id ? { ...x, name: name.trim() } : x));
    savePresets(this.presets);
    this.sync();
  }

  /** Export Styles: every style as one .asl through the app's download helper. */
  private async exportAll(): Promise<void> {
    if (!this.presets.length) return;
    const bytes = writeAsl(this.presets.map((p) => ({ name: p.name, effects: p.effects })));
    await this.deliver(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), 'formvis-styles.asl');
  }

  /** Load Styles: a one-shot hidden file input; .asl through readAsl, .json as a list of { name, effects } (or this panel's own presets). */
  private load(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.asl,.json';
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void this.importFile(file);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }

  private async importFile(file: File): Promise<void> {
    let found: Array<{ name: string; effects: LayerEffects }> = [], skipped = 0;
    try {
      if (/\.asl$/i.test(file.name)) {
        const r = readAsl(await file.arrayBuffer());
        found = r.styles;
        skipped = r.skipped;
      } else {
        const data = JSON.parse(await file.text()) as unknown;
        const list: unknown[] = Array.isArray(data) ? data : [];
        for (const p of list) {
          if (p && typeof p === 'object' && 'name' in p && 'effects' in p && typeof p.name === 'string' && p.effects && typeof p.effects === 'object') {
            found.push({ name: p.name, effects: { ...defaultEffects(), ...p.effects } });
          } else skipped++;
        }
      }
    } catch (err) {
      this.engine.notice(`Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (found.length) {
      this.presets = [...this.presets, ...found.map((s) => ({ id: `style-${Date.now().toString(36)}-${(this.serial++).toString(36)}`, name: s.name, effects: s.effects }))];
      savePresets(this.presets);
      this.sync();
    }
    this.engine.notice(`Loaded ${found.length} style${found.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}.`);
  }

  private remove(): void {
    if (!this.selected) return;
    this.presets = this.presets.filter((p) => p.id !== this.selected);
    this.selected = null;
    savePresets(this.presets);
    this.sync();
  }

  /** Restore Default Styles: the built-in styles that are not in the list come back, under the group Defaults. */
  private restoreDefaults(): void {
    const have = new Set(this.presets.map((p) => p.id)), add = defaultPresets().filter((p) => !have.has(p.id));
    if (add.length) {
      this.presets = [...this.presets, ...add];
      savePresets(this.presets);
      this.sync();
    }
    this.engine.notice(add.length ? `Restored ${add.length} default style${add.length === 1 ? '' : 's'}.` : 'Every default style is already there.');
  }

  /** The selected style moved to a named group; an empty name takes it out of its group. */
  private async regroup(): Promise<void> {
    const p = this.presets.find((x) => x.id === this.selected);
    if (!p) return;
    const name = await promptName('Style Group', p.group ?? '', 'Move');
    if (name === null) return;
    const group = name.trim();
    this.presets = this.presets.map((x) => {
      if (x.id !== p.id) return x;
      const next = { ...x };
      if (group) next.group = group; else delete next.group;
      return next;
    });
    savePresets(this.presets);
    this.sync();
  }

  /** The selected style replaced by the active layer's style, keeping its name and group. */
  private replaceSelected(): void {
    const fx = this.engine.current?.activeLayer?.effects;
    if (!this.selected || !effectsPresent(fx)) return;
    this.presets = this.presets.map((x) => (x.id === this.selected ? { ...x, effects: structuredClone(fx) } : x));
    savePresets(this.presets);
    this.sync();
  }

  private sync(): void {
    this.mergeDoc();
    const l = this.engine.current?.activeLayer, can = !!l && !l.isGroup && !l.adjustment;
    const groups = [...new Set(this.presets.flatMap((p) => (p.group ? [p.group] : [])))].sort();
    if (this.filter && !groups.includes(this.filter)) this.filter = '';
    const want = ['', ...groups];
    while (this.groupPick.options.length > want.length) this.groupPick.remove(this.groupPick.options.length - 1);
    want.forEach((g, i) => {
      const o = this.groupPick.options[i] ?? this.groupPick.appendChild(document.createElement('option'));
      if (o.value !== g) o.value = g;
      const label = g || 'All styles';
      if (o.textContent !== label) o.textContent = label;
    });
    if (this.groupPick.value !== this.filter) this.groupPick.value = this.filter;
    const shown = this.filter ? this.presets.filter((p) => p.group === this.filter) : this.presets;
    setText(this.count, this.presets.length ? String(shown.length === this.presets.length ? this.presets.length : `${shown.length}/${this.presets.length}`) : '');
    setHidden(this.empty, this.presets.length > 0);
    this.foot.forEach((b) => {
      const a = b.dataset.act;
      const off = a === 'load' || a === 'defaults' ? false : a === 'export' ? this.presets.length === 0 : a === 'new' ? !effectsPresent(l?.effects) : a === 'delete' || a === 'group' ? !this.selected : a === 'update' ? !this.selected || !effectsPresent(l?.effects) : !can || !effectsPresent(l?.effects);
      if (b.disabled !== off) b.disabled = off;
    });
    patchList<StylePreset>(this.grid, shown, {
      key: (p) => p.id,
      create: (p) => {
        const tile = el('<button class="cv-style-tile" type="button" role="option"><canvas class="cv-style-swatch" width="48" height="48" aria-hidden="true"></canvas><span class="cv-style-name"></span></button>');
        this.fill(tile, p);
        return tile;
      },
      update: (tile, p) => this.fill(tile, p),
    });
  }

  private fill(tile: HTMLElement, p: StylePreset): void {
    if (tile.dataset.id !== p.id) tile.dataset.id = p.id;
    setText(q(tile, '.cv-style-name'), p.name);
    // The swatch (35.3) is drawn once per tile and style, and again only when the style's effects change.
    const key = JSON.stringify(p.effects);
    if (tile.dataset.fx !== key) {
      const c = q<HTMLCanvasElement>(tile, '.cv-style-swatch'), g = c.getContext('2d');
      if (g) {
        try { const s = this.engine.stylePreview(p.effects, c.width); g.clearRect(0, 0, c.width, c.height); g.drawImage(s, 0, 0); tile.dataset.fx = key; } catch { /* no renderer yet: the tile keeps its name only */ }
      }
    }
    if (tile.title !== p.name) tile.title = p.name;
    tile.classList.toggle('is-active', p.id === this.selected);
    tile.setAttribute('aria-selected', String(p.id === this.selected));
  }
}

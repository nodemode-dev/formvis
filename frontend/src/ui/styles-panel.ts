import type { Engine } from '../engine';
import type { LayerEffects } from '../engine/types';
import { defaultEffects, effectsPresent } from '../engine/types';
import { readAsl } from '../io/asl';
import { promptName } from './dialogs';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

interface StylePreset { id: string; name: string; effects: LayerEffects }

const KEY = 'formvis.stylePresets';

function loadPresets(): StylePreset[] {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(r)) return [];
    return r.filter((p): p is StylePreset => !!p && typeof p === 'object' && typeof (p as StylePreset).id === 'string' && typeof (p as StylePreset).name === 'string' && !!(p as StylePreset).effects);
  } catch { return []; }
}

function savePresets(list: readonly StylePreset[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable: the styles last for this session */ }
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

  constructor(root: HTMLElement, private readonly engine: Engine) {
    const btn = (cmd: string, title: string, glyph: string): string => `<button class="cv-icon-btn" type="button" data-act="${cmd}" title="${title}" aria-label="${title}">${icon(glyph, 16)}</button>`;
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-styles" aria-label="Styles">` +
      `<div class="cv-panel-head"><span class="cv-comps-title">${icon('layers', 14)}<span>Styles</span></span><span></span><span class="cv-comps-count"></span></div>` +
      `<div class="cv-styles-grid" role="listbox" aria-label="Styles"></div>` +
      `<div class="cv-comps-empty">No styles yet. Use New to save the active layer's style.</div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn cv-styles-clear" type="button" data-act="clear" title="Clear the active layer's style" aria-label="Clear Style">Clear Style</button>${btn('delete', 'Delete the selected style', 'delete')}${btn('load', 'Load Styles (.asl or .json)', 'upload')}${btn('new', 'New style from the active layer', 'add')}</div></section>`);
    const section = q(root, '.cv-styles');
    this.grid = q(section, '.cv-styles-grid');
    this.empty = q(section, '.cv-comps-empty');
    this.count = q(section, '.cv-comps-count');
    this.foot = Array.from(section.querySelectorAll<HTMLButtonElement>('.cv-panel-foot [data-act]'));
    section.querySelector('.cv-panel-foot')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'new') void this.create();
      else if (b.dataset.act === 'delete') this.remove();
      else if (b.dataset.act === 'load') this.load();
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
    for (const ev of ['doc', 'history', 'active', 'projects'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

  private async create(): Promise<void> {
    const fx = this.engine.current?.activeLayer?.effects;
    if (!effectsPresent(fx)) return;
    const name = await promptName('New Style', `Style ${this.presets.length + 1}`, 'Create');
    if (name === null) return;
    const id = `style-${Date.now().toString(36)}-${(this.serial++).toString(36)}`;
    this.presets = [...this.presets, { id, name: name.trim() || `Style ${this.presets.length + 1}`, effects: structuredClone(fx) }];
    this.selected = id;
    savePresets(this.presets);
    this.sync();
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

  private sync(): void {
    const l = this.engine.current?.activeLayer, can = !!l && !l.isGroup && !l.adjustment;
    setText(this.count, this.presets.length ? String(this.presets.length) : '');
    setHidden(this.empty, this.presets.length > 0);
    this.foot.forEach((b) => {
      const a = b.dataset.act;
      const off = a === 'load' ? false : a === 'new' ? !effectsPresent(l?.effects) : a === 'delete' ? !this.selected : !can || !effectsPresent(l?.effects);
      if (b.disabled !== off) b.disabled = off;
    });
    patchList<StylePreset>(this.grid, this.presets, {
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

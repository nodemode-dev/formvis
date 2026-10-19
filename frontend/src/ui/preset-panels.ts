import type { Engine } from '../engine';
import { allCustomShapes, CUSTOM_SHAPES, removeCustomShape } from '../engine/custom-shapes';
import { allGradients, customGradients, GRADIENT_PRESETS, resolveStops, setCustomGradients } from '../engine/gradients';
import type { GradientPreset } from '../engine/gradients';
import { allPatterns, removePattern, renamePattern, setPatternGroup } from '../engine/patterns';
import type { Pattern } from '../engine/patterns';
import { toolHost } from '../extensions/registry';
import { el, patchList, q, setText } from './dom';
import { icon } from './icons';

/** What one preset panel needs: where its items come from, how a tile is drawn, and what a click and Delete do. */
interface PresetKind<T> {
  id: 'gradients' | 'patterns' | 'shapes';
  title: string;
  glyph: string;
  items(): readonly T[];
  key(t: T): string;
  label(t: T): string;
  builtin(t: T): boolean;
  /** The data key a tile's picture depends on: the canvas is redrawn only when it changes. */
  drawKey(t: T, tile: HTMLElement): string;
  draw(g: CanvasRenderingContext2D, w: number, h: number, t: T, tile: HTMLElement): void;
  pick(t: T): void;
  remove(t: T): void | Promise<unknown>;
  /** A foot button that makes a new item (New Gradient, New Pattern from the selection). */
  add?: { label: string; run(): void };
  /** Renames a custom item from the foot's name field. */
  rename?(t: T, name: string): void | Promise<unknown>;
  /** A custom item's group, edited in the foot's group field. */
  group?: { get(t: T): string; set(t: T, group: string): void | Promise<unknown> };
  /** Moves a custom item one place earlier (-1) or later (1) among the items of its group. */
  move?(t: T, dir: -1 | 1): void | Promise<unknown>;
}

/** The shared body of the Gradients, Patterns and Shapes panels (Window menu, DEV_PLAN 35.3 part c): a head with a count,
 *  a grid of tiles, and a Delete button for custom items. The skeleton is built once; tiles are patched in by id and a
 *  tile's canvas is redrawn only when its data key changes. */
class PresetPanel<T> {
  private readonly grid: HTMLElement;
  private readonly count: HTMLElement;
  private readonly del: HTMLButtonElement;
  private selected: string | null = null;
  private readonly nameIn: HTMLInputElement;
  private readonly groupIn: HTMLInputElement;
  private readonly earlier: HTMLButtonElement;
  private readonly later: HTMLButtonElement;

  constructor(root: HTMLElement, private readonly kind: PresetKind<T>, engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-preset-panel cv-${kind.id}" aria-label="${kind.title}">` +
      `<div class="cv-panel-head"><span class="cv-comps-title">${icon(kind.glyph, 14)}<span>${kind.title}</span></span><span></span><span class="cv-comps-count"></span></div>` +
      `<div class="cv-styles-grid" role="listbox" aria-label="${kind.title}"></div>` +
      `<div class="cv-panel-foot"><input class="cv-input cv-preset-name" type="text" maxlength="80" placeholder="Name" aria-label="Name of the selected item" data-act="name" hidden>` +
      `<input class="cv-input cv-preset-group" type="text" maxlength="40" placeholder="Group" aria-label="Group of the selected item" data-act="group" hidden>` +
      `<button class="cv-icon-btn" type="button" data-act="earlier" title="Move earlier" aria-label="Move earlier" hidden>&lt;</button>` +
      `<button class="cv-icon-btn" type="button" data-act="later" title="Move later" aria-label="Move later" hidden>&gt;</button>` +
      `<button class="cv-icon-btn" type="button" data-act="add" hidden></button>` +
      `<button class="cv-icon-btn" type="button" data-act="delete" title="Delete the selected custom item" aria-label="Delete">${icon('delete', 16)}</button></div></section>`);
    const section = q(root, `section.cv-${kind.id}`);
    this.grid = q(section, '.cv-styles-grid');
    this.count = q(section, '.cv-comps-count');
    this.del = q<HTMLButtonElement>(section, '[data-act="delete"]');
    this.nameIn = q<HTMLInputElement>(section, '[data-act="name"]');
    this.groupIn = q<HTMLInputElement>(section, '[data-act="group"]');
    const addBtn = q<HTMLButtonElement>(section, '[data-act="add"]');
    if (kind.add) { addBtn.hidden = false; addBtn.innerHTML = icon('plus', 16); addBtn.title = kind.add.label; addBtn.setAttribute('aria-label', kind.add.label); addBtn.addEventListener('click', () => { kind.add?.run(); this.sync(); }); }
    this.nameIn.hidden = !kind.rename;
    this.groupIn.hidden = !kind.group;
    this.earlier = q<HTMLButtonElement>(section, '[data-act="earlier"]');
    this.later = q<HTMLButtonElement>(section, '[data-act="later"]');
    for (const [b, dir] of [[this.earlier, -1], [this.later, 1]] as const) {
      b.hidden = !kind.move;
      b.addEventListener('click', () => {
        const t = this.current();
        if (!t || this.kind.builtin(t)) return;
        void Promise.resolve(this.kind.move?.(t, dir)).then(() => this.sync());
      });
    }
    for (const i of [this.nameIn, this.groupIn]) i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
    this.nameIn.addEventListener('change', () => {
      const t = this.current();
      if (!t || this.kind.builtin(t) || !this.nameIn.value.trim()) return;
      void Promise.resolve(this.kind.rename?.(t, this.nameIn.value.trim())).then(() => this.sync());
    });
    this.groupIn.addEventListener('change', () => {
      const t = this.current();
      if (!t || this.kind.builtin(t)) return;
      void Promise.resolve(this.kind.group?.set(t, this.groupIn.value.trim())).then(() => this.sync());
    });
    this.del.addEventListener('click', () => {
      const t = this.current();
      if (!t || this.kind.builtin(t)) return;
      void Promise.resolve(this.kind.remove(t)).then(() => { this.selected = null; this.sync(); });
    });
    this.grid.addEventListener('click', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.cv-style-tile[data-id]');
      const t = tile ? this.kind.items().find((x) => this.kind.key(x) === tile.dataset.id) : undefined;
      if (!t) return;
      this.selected = this.kind.key(t);
      this.kind.pick(t);
      this.sync();
    });
    // The Preset Manager changes the lists without an engine event, so the panel also looks again when the pointer enters it.
    section.addEventListener('pointerenter', () => this.sync());
    for (const ev of ['doc', 'projects', 'options', 'tool'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

  private current(): T | undefined { return this.kind.items().find((x) => this.kind.key(x) === this.selected); }

  private sync(): void {
    const items = this.kind.items(), cur = items.find((x) => this.kind.key(x) === this.selected);
    if (this.selected && !cur) this.selected = null;
    setText(this.count, items.length ? String(items.length) : '');
    const off = !cur || this.kind.builtin(cur);
    if (this.del.disabled !== off) this.del.disabled = off;
    if (this.nameIn.disabled !== off) this.nameIn.disabled = off;
    if (this.groupIn.disabled !== off) this.groupIn.disabled = off;
    if (document.activeElement !== this.nameIn) { const v = cur && !off ? this.kind.label(cur) : ''; if (this.nameIn.value !== v) this.nameIn.value = v; }
    if (document.activeElement !== this.groupIn) { const v = cur && !off && this.kind.group ? this.kind.group.get(cur) : ''; if (this.groupIn.value !== v) this.groupIn.value = v; }
    const grp = (t: T): string => this.kind.group?.get(t) ?? '';
    const names = [...new Set(items.map(grp))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
    const entries: Array<{ head: string } | { t: T }> = [];
    for (const n of names) {
      if (n) entries.push({ head: n });
      for (const t of items) if (grp(t) === n) entries.push({ t });
    }
    patchList(this.grid, entries, {
      key: (x) => ('head' in x ? `\u0001${x.head}` : this.kind.key(x.t)),
      create: (x) => {
        if ('head' in x) { const h = el('<div class="cv-sw-group" role="presentation"></div>'); setText(h, x.head); return h; }
        const tile = el('<button class="cv-style-tile" type="button" role="option"><canvas class="cv-style-swatch cv-preset-swatch" width="48" height="48" aria-hidden="true"></canvas><span class="cv-style-name"></span></button>');
        this.fill(tile, x.t);
        return tile;
      },
      update: (node, x) => { if ('head' in x) setText(node, x.head); else this.fill(node, x.t); },
    });
    const moveOff = off || !this.kind.move;
    for (const b of [this.earlier, this.later]) if (b.disabled !== moveOff) b.disabled = moveOff;
  }

  private fill(tile: HTMLElement, t: T): void {
    const id = this.kind.key(t), label = this.kind.label(t);
    if (tile.dataset.id !== id) tile.dataset.id = id;
    setText(q(tile, '.cv-style-name'), label);
    const dk = this.kind.drawKey(t, tile);
    if (tile.dataset.draw !== dk) {
      const c = q<HTMLCanvasElement>(tile, '.cv-style-swatch'), g = c.getContext('2d');
      if (g) { g.clearRect(0, 0, c.width, c.height); this.kind.draw(g, c.width, c.height, t, tile); tile.dataset.draw = dk; }
    }
    const grp = this.kind.group?.get(t) ?? '', tip = grp ? `${label} (${grp})` : label;
    if (tile.title !== tip) tile.title = tip;
    tile.classList.toggle('is-active', id === this.selected);
    tile.setAttribute('aria-selected', String(id === this.selected));
  }
}

const GRADIENT_KEY = 'formvis.gradients';
const rgba = (c: { r: number; g: number; b: number }, a: number): string => `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`;

/** Builds the Gradients, Patterns and Shapes panels into the side column. `keepPatterns` persists the pattern set after a delete. */
export function createPresetPanels(root: HTMLElement, engine: Engine, keepPatterns: () => Promise<boolean>): void {
  const builtinGradients = new Set(GRADIENT_PRESETS.map((p) => p.id));
  const saveGradients = (): void => {
    try { localStorage.setItem(GRADIENT_KEY, JSON.stringify(customGradients.filter((x) => x.id !== 'edited'))); } catch { engine.notice('Gradients cannot be saved in this browser.'); }
  };
  new PresetPanel<GradientPreset>(root, {
    id: 'gradients', title: 'Gradients', glyph: 'gradient',
    items: () => allGradients(),
    key: (p) => p.id,
    label: (p) => p.label,
    builtin: (p) => builtinGradients.has(p.id),
    drawKey: (p) => JSON.stringify(resolveStops(p, engine.fg, engine.bg, false)),
    draw: (g, w, h, p) => {
      // A checker behind the strip shows the stops' transparency.
      for (let x = 0; x < w; x += 8) for (let y = 0; y < h; y += 8) { g.fillStyle = (x + y) / 8 % 2 ? '#bbb' : '#fff'; g.fillRect(x, y, 8, 8); }
      const grad = g.createLinearGradient(0, 0, w, 0);
      for (const s of resolveStops(p, engine.fg, engine.bg, false)) grad.addColorStop(Math.max(0, Math.min(1, s.at)), rgba(s.rgb, s.alpha));
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    },
    pick: (p) => { engine.gradientSettings.style = p.id; engine.setTool('gradient'); engine.renderGradient(); engine.emit('options', null); },
    remove: (p) => {
      setCustomGradients(customGradients.filter((x) => x.id !== p.id));
      saveGradients();
    },
    add: {
      label: 'New Gradient from the current Colors',
      run: () => {
        const base = engine.gradientPreset(), n = customGradients.length + 1;
        setCustomGradients([...customGradients, { ...structuredClone(base), id: `custom-${Date.now().toString(36)}`, label: `${base.label.replace(/ \d+$/, '')} ${n}`.slice(0, 60) }]);
        saveGradients();
      },
    },
    rename: (p, name) => { const c = customGradients.find((x) => x.id === p.id); if (c) { c.label = name.slice(0, 60); saveGradients(); } },
    group: {
      get: (p) => p.group ?? '',
      set: (p, g) => { const c = customGradients.find((x) => x.id === p.id), n = g.trim().slice(0, 40); if (!c) return; if (n) c.group = n; else delete c.group; saveGradients(); },
    },
    move: (p, dir) => {
      const list = customGradients.slice(), i = list.findIndex((x) => x.id === p.id), g = list[i]?.group ?? '';
      let j = i + dir;
      while (j >= 0 && j < list.length && (list[j].group ?? '') !== g) j += dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      setCustomGradients(list);
      saveGradients();
    },
  }, engine);
  new PresetPanel<Pattern>(root, {
    id: 'patterns', title: 'Patterns', glyph: 'layers',
    items: () => allPatterns().sort((a, b) => Number(b.builtin) - Number(a.builtin) || (a.group ?? '').localeCompare(b.group ?? '')),
    key: (p) => p.id,
    label: (p) => p.name,
    builtin: (p) => p.builtin,
    drawKey: (p) => `${p.id}:${p.surface.width}x${p.surface.height}`,
    draw: (g, w, h, p) => {
      const pat = g.createPattern(p.surface, 'repeat');
      if (!pat) return;
      g.fillStyle = pat;
      g.fillRect(0, 0, w, h);
    },
    pick: (p) => { engine.patternStampPattern = p.id; engine.emit('options', null); },
    remove: (p) => { removePattern(p.id); return keepPatterns(); },
    add: { label: 'New Pattern from the selection', run: () => toolHost.run('define-pattern') },
    rename: (p, name) => { renamePattern(p.id, name); return keepPatterns(); },
    group: { get: (p) => p.group ?? '', set: (p, g) => { setPatternGroup(p.id, g); return keepPatterns(); } },
  }, engine);
  const builtinShapes = new Set(CUSTOM_SHAPES.map((s) => s.id));
  new PresetPanel<{ id: string; label: string; d: string }>(root, {
    id: 'shapes', title: 'Shapes', glyph: 'layers',
    items: () => allCustomShapes(),
    key: (s) => s.id,
    label: (s) => s.label,
    builtin: (s) => builtinShapes.has(s.id),
    drawKey: (s, tile) => `${s.d}|${getComputedStyle(tile).color}`,
    draw: (g, w, h, s, tile) => {
      // Shapes are designed in a 100 x 100 box; the tile fits it with a small margin and fills it in the text colour.
      const k = Math.min(w, h) / 112;
      g.save();
      g.translate((w - 100 * k) / 2, (h - 100 * k) / 2);
      g.scale(k, k);
      g.fillStyle = getComputedStyle(tile).color;
      g.fill(new Path2D(s.d), 'evenodd');
      g.restore();
    },
    pick: (s) => { engine.shapeSettings.kind = 'custom'; engine.shapeSettings.custom = s.id; engine.setTool('shape'); engine.emit('options', null); engine.emit('tool', null); },
    remove: (s) => { removeCustomShape(s.id); },
  }, engine);
}

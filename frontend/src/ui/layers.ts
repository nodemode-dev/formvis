import { LAYER_BLEND_MODES, byId, hierarchy, type Engine, type HierarchyEntry, type ID, type Layer, type LayerEffects, type Project, type Raster, defaultEffects, effectsPresent, instances, MULTI_EFFECTS } from '../engine';
import { PanelGroup } from './panel-group';
import type { ChannelsPanel } from './channels';
import type { LayerLocks } from '../engine/types';
import { groupIsolated } from '../engine/tree';
import { vectorCoverage } from '../engine/vector-mask';
import { LAYER_LABELS, LAYER_ROLE_LABELS, layerRoleOf } from '../engine/types';
import { enhanceSelect } from './dropdown';
import { el, isMac, patchList, q, setClass, setDisabled, setHidden, setHtml, setStyleVar, setText, setTitle, setValue } from './dom';
import { icon } from './icons';
import { FILTER_LABELS, type FilterKind } from './panels/filter-panel';
import { wasmPlugins } from '../engine/wasm-plugin-host';
import { isWasmKind, wasmIdOf } from '../engine/wasm-plugin';
import { loadPrefs } from './prefs';
import { t } from './i18n';
import { paint } from './palette';
import type { PopupMenu } from './menu';

const THUMB = 60;
type Where = 'above' | 'below' | 'inside';

/** The Layers panel's kind filter (Phase 21, as the target's Kind row): pixel, adjustment, type, shape and smart object
 *  layers, decided from the layer's own fields. Folders always show, so filtered layers keep their place. */
const KINDS = [
  { id: 'pixel', label: 'Pixel', icon: 'image' },
  { id: 'adjustment', label: 'Adjustment', icon: 'halfCircle' },
  { id: 'type', label: 'Type', icon: 'typeTool' },
  { id: 'shape', label: 'Shape', icon: 'rectTool' },
  { id: 'smart', label: 'Smart Object', icon: 'smartObject' },
] as const;
type KindId = (typeof KINDS)[number]['id'];
type LayersTab = 'layers' | 'channels' | 'paths';
/** The Lock row's toggles. */
const LOCKS = [
  { id: 'transparency', title: 'transparent pixels', icon: 'canvasGrid' },
  { id: 'pixels', title: 'image pixels', icon: 'paintbrush' },
  { id: 'position', title: 'position', icon: 'moveSel' },
  { id: 'artboard', title: 'auto-nesting into and out of artboards', icon: 'artboard' },
  { id: 'all', title: 'all', icon: 'lock' },
] as const;
const ROLE_BADGE: Record<string, string> = { reference: 'Ref', subject: 'Subj', background: 'Bg', style: 'Style' };
/** A layer's size as it shows on the canvas, with its scale when it is not 100%. */
const sizeOf = (l: Layer): string => {
  const t = l.transform, w = l.raster?.width ?? 0, s = w ? Math.round((t.w / w) * 100) : 100;
  return `${Math.round(t.w)} x ${Math.round(t.h)}${s !== 100 ? ` ${s}%` : ''}`;
};
/** The effects listed under a layer (Photoshop's order, top down), and the name each row shows. */
type FxKey = Exclude<keyof LayerEffects, 'extra' | 'hidden' | 'blendInterior' | 'layerMaskHides'>;
const FX_ROWS: ReadonlyArray<readonly [FxKey, string]> = [['bevel', 'Bevel & Emboss'], ['stroke', 'Stroke'], ['innerShadow', 'Inner Shadow'], ['innerGlow', 'Inner Glow'], ['satin', 'Satin'], ['colorOverlay', 'Color Overlay'], ['gradientOverlay', 'Gradient Overlay'], ['patternOverlay', 'Pattern Overlay'], ['outerGlow', 'Outer Glow'], ['dropShadow', 'Drop Shadow']];
/** The effects a style lists: those on, and those switched off that still hold settings (so an eye can bring them back). */
const fxListed = (fx: LayerEffects | null | undefined): FxKey[] => {
  if (!fx) return [];
  const base = defaultEffects();
  return FX_ROWS.map(([k]) => k).filter((k) => {
    const all = MULTI_EFFECTS.includes(k as never) ? instances(fx, k as (typeof MULTI_EFFECTS)[number]) as Array<{ enabled: boolean }> : [fx[k] as { enabled: boolean }];
    return all.some((e) => e.enabled) || all.length > 1 || JSON.stringify(fx[k]) !== JSON.stringify(base[k]);
  });
};
/** The attribute filter: what a layer has set, decided from its own fields. */
const ATTRS = [['visible', 'Visible'], ['hidden', 'Hidden'], ['locked', 'Locked'], ['clipped', 'Clipped'], ['masked', 'With mask'], ['effects', 'With effects']] as const;
type AttrId = (typeof ATTRS)[number][0];
const hasAttr = (l: Layer, a: AttrId): boolean => a === 'visible' ? l.visible : a === 'hidden' ? !l.visible : a === 'locked' ? Object.values(l.locks ?? {}).some(Boolean) : a === 'clipped' ? !!l.clipId : a === 'masked' ? !!l.mask : effectsPresent(l.effects);
const kindOf = (l: Layer): KindId => (l.adjustment || l.fillContent ? 'adjustment' : l.text ? 'type' : l.vector ? 'shape' : l.smart ? 'smart' : 'pixel');

/** The blend modes in their groups (s21), as <optgroup>s; any mode not named falls in Other. */
const BLEND_GROUPS: ReadonlyArray<[string, readonly string[]]> = [
  ['Basic', ['normal', 'dissolve']],
  ['Darken', ['darken', 'multiply', 'color-burn', 'linear-burn', 'darker-color']],
  ['Lighten', ['lighten', 'screen', 'color-dodge', 'linear-dodge', 'lighter-color']],
  ['Contrast', ['overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix']],
  ['Inversion', ['difference', 'exclusion', 'subtract', 'divide']],
  ['Component', ['hue', 'saturation', 'color', 'luminosity']],
];
function blendOptions(): string {
  const opt = (id: string): string => { const b = LAYER_BLEND_MODES.find((m) => m.id === id); return b ? `<option value="${b.id}">${b.label}</option>` : ''; };
  const named = new Set(BLEND_GROUPS.flatMap(([, ids]) => ids)), rest = LAYER_BLEND_MODES.filter((m) => !named.has(m.id));
  // Pass Through is a folder's alone: its option is built here once and shown or hidden with the selection.
  return '<option value="pass-through" hidden>Pass Through</option>' + BLEND_GROUPS.map(([g, ids]) => `<optgroup label="${g}">${ids.map(opt).join('')}</optgroup>`).join('') + (rest.length ? `<optgroup label="Other">${rest.map((m) => opt(m.id)).join('')}</optgroup>` : '');
}

export class LayersPanel {
  private readonly rows: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly dropLine: HTMLElement;
  private readonly blend: HTMLSelectElement;
  private readonly passThrough: HTMLOptionElement;
  private readonly opacity: HTMLInputElement;
  private readonly fill: HTMLInputElement;
  private readonly kind: HTMLSelectElement;
  private readonly fName: HTMLInputElement;
  private readonly fMode: HTMLSelectElement;
  private readonly fAttr: HTMLSelectElement;
  private readonly fLabel: HTMLSelectElement;
  /** The kinds shown; empty shows every kind. */
  private kinds = new Set<KindId>();
  /** Select > Isolate Layers, per document: the layers listed while isolated. */
  private readonly isolation = new WeakMap<Project, Set<ID>>();
  /** The Paths panel's section, shown in this group's Paths tab (adoptPaths). */
  private paths: HTMLElement | null = null;
  private readonly painted = new WeakMap<HTMLElement, { pixels: string; mask: string; vmask?: string }>();
  /** How many layers hold each link, counted at each render (1.65.3): a row shows its link when another holds it. */
  private links = new Map<ID, number>();
  private frame = 0;
  /** The active layer the list last scrolled to. */
  private revealed: ID | null = null;
  private renaming: ID | null = null;
  private drag: { id: ID; ids: ID[]; startY: number; pointerId: number; started: boolean; wasSelected: boolean; target: { id: ID; where: Where } | null; maskFrom: ID | null; tabTarget: string | null; src: string } | null = null;
  /** The document tab a layer drag has rested on, and the timer that shows that document so the drop lands in it. */
  private spring: { key: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private clearSpring(): void { if (this.spring) { clearTimeout(this.spring.timer); this.spring = null; } }
  /** Set by the app: the document point under a screen point on the stage, or null off it. A layer drag released on another document's canvas lands where it is let go. */
  docPoint: ((x: number, y: number) => { x: number; y: number } | null) | null = null;
  private stageHost: HTMLElement | null = null;
  private showStageDrop(on: boolean): void { this.stageHost ??= document.querySelector<HTMLElement>('.cv-stage'); setClass(this.stageHost, 'is-layer-drop', on); }
  private swipe: { visible: boolean; pointerId: number } | null = null;
  /** Layers whose effect rows are open, and the effect row being dragged to another layer. */
  private readonly fxOpen = new Set<ID>();
  private fxDrag: { id: ID; key: FxKey; sf?: ID; pointerId: number; startY: number; started: boolean; target: HTMLElement | null } | null = null;
  /** Smart objects whose filter rows are open. */
  private readonly sfOpen = new Set<ID>();
  /** Keeps the open Opacity or Fill slider popover on the layer's value (and closes it when the layer cannot take one). */
  private slideSync: () => void = () => {};

  constructor(root: HTMLElement, private readonly engine: Engine, private readonly menu: PopupMenu) {
    root.insertAdjacentHTML('beforeend',
      `<div class="cv-layers-page">` +
      `<div class="cv-layer-props"><div class="cv-layer-kind"><select class="cv-select cv-kind" title="Filter by kind" aria-label="Filter by kind"><option value="all">Kind</option>${KINDS.map((k) => `<option value="${k.id}">${k.label}</option>`).join('')}</select>` +
      `<div class="cv-kind-icons" role="group" aria-label="Show only">${KINDS.map((k) => `<button class="cv-kind-btn" type="button" data-kind="${k.id}" title="${k.label} layers" aria-label="${k.label} layers" aria-pressed="false">${icon(k.icon, 14)}</button>`).join('')}</div></div>` +
      `<div class="cv-layer-filt"><input class="cv-input cv-filt-name" type="search" placeholder="Name" title="Filter by name" aria-label="Filter by name" spellcheck="false">` +
      `<select class="cv-select cv-filt-mode" title="Filter by blend mode" aria-label="Filter by blend mode"><option value="all">Mode</option>${LAYER_BLEND_MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}</select>` +
      `<select class="cv-select cv-filt-attr" title="Filter by attribute" aria-label="Filter by attribute"><option value="all">Attribute</option>${ATTRS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select>` +
      `<select class="cv-select cv-filt-label" title="Filter by colour label" aria-label="Filter by colour label"><option value="all">Color</option><option value="none">No Color</option>${LAYER_LABELS.map((c) => `<option value="${c}">${c[0].toUpperCase()}${c.slice(1)}</option>`).join('')}</select></div>` +
      `<div class="cv-layer-blendrow"><select class="cv-select cv-blend" title="Blend mode" aria-label="Blend mode">${blendOptions()}</select><span class="cv-vsep"></span>` +
      `<label class="cv-opacity" title="Opacity"><span>Opacity</span><span class="cv-num"><input class="cv-opacity-field" type="text" inputmode="numeric" value="100" aria-label="Opacity"><span class="cv-unit">%</span></span><button class="cv-slide-btn cv-slide-opacity" type="button" title="${t('Opacity slider')}" aria-label="${t('Opacity slider')}" aria-haspopup="dialog" aria-expanded="false">${icon('chevronDown', 12)}</button></label></div>` +
      `<div class="cv-layer-lockrow"><span class="cv-lock-slot"></span><span class="cv-vsep"></span><label class="cv-opacity" title="Fill: the layer's pixels, not its styles"><span>Fill</span><span class="cv-num"><input class="cv-fill-field" type="text" inputmode="numeric" value="100" aria-label="Fill"><span class="cv-unit">%</span></span><button class="cv-slide-btn cv-slide-fill" type="button" title="${t('Fill slider')}" aria-label="${t('Fill slider')}" aria-haspopup="dialog" aria-expanded="false">${icon('chevronDown', 12)}</button></label></div></div>` +
      `<div class="cv-layer-list"><div class="cv-layer-rows" role="listbox" aria-label="Layers"></div><div class="cv-drop-line"></div><div class="cv-layers-empty">No canvas open. Create one or drop images on the stage.</div></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="link-layers">${icon('link', 16)}</button><button class="cv-icon-btn cv-foot-fx" type="button" data-cmd="layer-style">fx</button><button class="cv-icon-btn" type="button" data-cmd="add-mask">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-fill-adjustment">${icon('halfCircle', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="clip">${icon('clipMask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-layer">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="delete-layer-ask">${icon('delete', 16)}</button></div></div>`);
    // The Layers group is a panel group (1.49.2, the owner's walkthrough: every panel groups with any other): its Layers
    // tab is this page, Channels and Paths are adopted as tabs, and any of them can move to another group.
    this.page = root.lastElementChild as HTMLElement;
    this.group = new PanelGroup(root, 'layers-panel', [{ id: 'layers', label: 'Layers', body: this.page }], 'Layers');
    this.rows = q(root, '.cv-layer-rows');
    this.list = q(root, '.cv-layer-list');
    this.empty = q(root, '.cv-layers-empty');
    this.dropLine = q(root, '.cv-drop-line');
    this.blend = q<HTMLSelectElement>(root, '.cv-blend');
    this.opacity = q<HTMLInputElement>(root, '.cv-opacity-field');
    this.passThrough = q<HTMLOptionElement>(root, '.cv-blend option[value="pass-through"]');
    // On a folder, Pass Through is Normal with isolate off and Normal sets isolate on.
    this.blend.addEventListener('change', () => {
      const v = this.blend.value;
      if (v === 'pass-through') engine.setBlend('normal', false);
      else engine.setBlend(v as Layer['blend'], v === 'normal' ? true : undefined);
    });
    // Shown as the target's grouped list (s21); a mode under the pointer or the arrow keys previews live on the canvas
    // (engine.previewBlend, no history), leaving the list restores the layer's own, and a choice is one setBlend step.
    enhanceSelect(this.blend, { search: 'Search blend modes...', onHover: (v) => engine.previewBlend(v === 'pass-through' ? 'normal' : v as Layer['blend'] | null) });
    // Opacity as the target's numeric field: Enter or leaving it commits (one undo step); arrows step by 1, Shift by 10.
    const commit = (pct: number): void => {
      const v = Math.min(100, Math.max(0, Math.round(pct)));
      this.opacity.value = String(v);
      if (Math.round((engine.activeLayer?.opacity ?? 1) * 100) !== v) engine.setOpacity(v / 100);
    };
    this.opacity.addEventListener('change', () => { const n = parseFloat(this.opacity.value); if (Number.isFinite(n)) commit(n); else this.syncProps(); });
    this.opacity.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.opacity.blur(); return; }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      commit((parseFloat(this.opacity.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    });
    // Fill, as Opacity: its own numeric field, one undo step a commit (the pixels fade, the styles do not).
    this.fill = q<HTMLInputElement>(root, '.cv-fill-field');
    const commitFill = (pct: number): void => { const v = Math.min(100, Math.max(0, Math.round(pct))); this.fill.value = String(v); if (Math.round((engine.activeLayer?.fill ?? 1) * 100) !== v) engine.setFill(v / 100); };
    this.fill.addEventListener('change', () => { const n = parseFloat(this.fill.value); if (Number.isFinite(n)) commitFill(n); else this.syncProps(); });
    this.fill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.fill.blur(); return; }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      commitFill((parseFloat(this.fill.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    });
    // Opacity and Fill: a chevron beside the field opens one shared slider popover under it, and the label
    // scrubs (press and drag sideways, Shift ten times faster). Both drive the engine's live edit (begin, live, end), begun
    // on the first change and ended on release, so a whole drag is one undo step. Nodes are updated in place, never rebuilt.
    type Live = { field: HTMLInputElement; btn: HTMLButtonElement; pct: () => number; begin: () => void; live: (v: number) => void; end: () => void; editing: boolean };
    const pctOf = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));
    const lives: Live[] = [
      { field: this.opacity, btn: q<HTMLButtonElement>(root, '.cv-slide-opacity'), pct: () => pctOf((engine.activeLayer?.opacity ?? 1) * 100), begin: () => engine.beginOpacityEdit(), live: (v) => engine.setOpacityLive(v), end: () => engine.endOpacityEdit(), editing: false },
      { field: this.fill, btn: q<HTMLButtonElement>(root, '.cv-slide-fill'), pct: () => pctOf((engine.activeLayer?.fill ?? 1) * 100), begin: () => engine.beginFillEdit(), live: (v) => engine.setFillLive(v), end: () => engine.endFillEdit(), editing: false },
    ];
    const pop = el(`<div class="cv-dd-pop cv-slide-pop" role="dialog" hidden><input class="cv-slide-range" type="range" min="0" max="100" step="1"></div>`);
    const range = q<HTMLInputElement>(pop, '.cv-slide-range');
    (document.getElementById('overlay-root') ?? document.body).appendChild(pop);
    let openFor: Live | null = null;
    const nudge = (p: Live, pct: number): void => {
      const v = pctOf(pct);
      if (!p.editing) { if (p.pct() === v) return; p.begin(); p.editing = true; }
      p.live(v / 100);
      p.field.value = String(v);
    };
    const finish = (p: Live): void => { if (p.editing) { p.editing = false; p.end(); } };
    const closeSlide = (refocus = false): void => {
      const p = openFor;
      if (!p) return;
      openFor = null;
      finish(p);
      setHidden(pop, true);
      p.btn.setAttribute('aria-expanded', 'false');
      if (refocus) p.btn.focus();
    };
    const openSlide = (p: Live): void => {
      if (p.field.disabled) return;
      openFor = p;
      range.value = String(p.pct());
      setHidden(pop, false);
      p.btn.setAttribute('aria-expanded', 'true');
      const r = (p.field.parentElement as HTMLElement).getBoundingClientRect();
      pop.style.left = `${Math.round(Math.max(4, Math.min(r.left, window.innerWidth - pop.offsetWidth - 4)))}px`;
      pop.style.top = `${Math.round(r.bottom + 4 + pop.offsetHeight <= window.innerHeight - 4 ? r.bottom + 4 : Math.max(4, r.top - 4 - pop.offsetHeight))}px`;
      range.focus();
    };
    range.addEventListener('input', () => { if (openFor) nudge(openFor, Number(range.value)); });
    range.addEventListener('change', () => { if (openFor) finish(openFor); });
    document.addEventListener('pointerdown', (e) => { if (openFor && !pop.contains(e.target as Node) && !openFor.btn.contains(e.target as Node)) closeSlide(); }, true);
    document.addEventListener('keydown', (e) => { if (openFor && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSlide(true); } }, true);
    this.slideSync = (): void => {
      if (!openFor) return;
      if (openFor.field.disabled) closeSlide(); else setValue(range, String(openFor.pct()));
    };
    for (const p of lives) {
      p.btn.addEventListener('click', () => { const was = openFor === p; closeSlide(); if (!was) openSlide(p); });
      const lab = (p.field.closest('label') as HTMLElement).firstElementChild as HTMLElement;
      let from: { id: number; last: number; value: number; moved: boolean } | null = null, dragged = false;
      lab.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || p.field.disabled) return;
        e.preventDefault();
        from = { id: e.pointerId, last: e.clientX, value: p.pct(), moved: false };
        lab.setPointerCapture(e.pointerId);
      });
      lab.addEventListener('pointermove', (e) => {
        if (!from || e.pointerId !== from.id) return;
        const dx = e.clientX - from.last;
        if (!from.moved && Math.abs(dx) < 2) return;
        from.moved = true;
        from.last = e.clientX;
        // Enhanced Controls > Scrubby Slider Acceleration: a faster drag covers more (up to 5 times at 100%)
        from.value = Math.min(100, Math.max(0, from.value + dx * (e.shiftKey ? 10 : 1) * (1 + (loadPrefs().scrubAccel / 100) * Math.min(4, Math.abs(dx) / 4))));
        nudge(p, from.value);
      });
      const stop = (e: PointerEvent): void => {
        if (!from || e.pointerId !== from.id) return;
        dragged = from.moved;
        from = null;
        finish(p);
      };
      lab.addEventListener('pointerup', stop);
      lab.addEventListener('pointercancel', stop);
      lab.addEventListener('click', (e) => { if (dragged) { e.preventDefault(); dragged = false; } });
    }
    // The Lock row, as the target's: transparency, image pixels, position, all; each click one undo step.
    const slot = q(root, '.cv-lock-slot');
    slot.innerHTML = `<span class="cv-lock-label">Lock:</span>` + LOCKS.map((k) => `<button class="cv-lock-btn" type="button" data-lock="${k.id}" title="Lock ${k.title}" aria-label="Lock ${k.title}" aria-pressed="false">${icon(k.icon, 14)}</button>`).join('');
    for (const b of slot.querySelectorAll<HTMLButtonElement>('.cv-lock-btn')) {
      b.addEventListener('click', () => engine.toggleLock(b.dataset.lock as keyof LayerLocks));
    }
    // The kind filter: the dropdown picks one kind (or all); the icons toggle kinds; the two agree.
    this.kind = q<HTMLSelectElement>(root, '.cv-kind');
    this.kind.addEventListener('change', () => { this.kinds = new Set(this.kind.value === 'all' ? [] : [this.kind.value as KindId]); this.syncKinds(); this.render(); });
    for (const b of root.querySelectorAll<HTMLButtonElement>('.cv-kind-btn')) {
      b.addEventListener('click', () => {
        const k = b.dataset.kind as KindId;
        if (this.kinds.has(k)) this.kinds.delete(k); else this.kinds.add(k);
        this.syncKinds();
        this.render();
      });
    }
    // The name, mode, attribute and colour filters narrow the rows in place; the rows kept stay the same nodes.
    this.fName = q<HTMLInputElement>(root, '.cv-filt-name');
    this.fMode = q<HTMLSelectElement>(root, '.cv-filt-mode');
    this.fAttr = q<HTMLSelectElement>(root, '.cv-filt-attr');
    this.fLabel = q<HTMLSelectElement>(root, '.cv-filt-label');
    this.fName.addEventListener('input', () => this.render());
    for (const s of [this.fMode, this.fAttr, this.fLabel]) s.addEventListener('change', () => this.render());
    // The panel menu, by the tab shown: the Layers panel's commands, or the Paths panel's.
    this.group.setMenu(() => this.group.current === 'paths' ? ['new-path', 'delete-path', '-', 'fill-path-dialog', 'stroke-path-dialog', '-', 'path-fill-rule', 'clipping-path'] : this.group.current === 'channels' ? [] : ['new-layer', 'duplicate-dialog', 'delete-layer', '-', 'new-folder', 'group', '-', 'merge', '-', 'layer-style', 'convert-smart', 'rasterize']);
    for (const k of ['doc', 'active', 'projects', 'history'] as const) engine.on(k, () => this.queue());
    this.bindRows();
    this.render();
  }

  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  restyle(): void {
    for (const row of Array.from(this.rows.children)) this.painted.delete(row as HTMLElement);
    this.queue();
  }

  get isolated(): boolean { const p = this.engine.current; return !!p && this.isolation.has(p); }

  /** Lists only the selected layers, with the folders holding them and what selected folders hold, or all again. */
  toggleIsolate(): void {
    const p = this.engine.current;
    if (!p) return;
    if (this.isolation.has(p)) this.isolation.delete(p);
    else if (p.selectedIds.size) this.isolation.set(p, new Set(p.selectedIds));
    this.render();
  }

  private render(): void {
    const p = this.engine.current;
    const all = p ? hierarchy(p.doc, true, p.collapsed) : [];
    let iso = p ? this.isolation.get(p) : undefined;
    const map = iso && p ? byId(p.doc) : null, keep = new Set<ID>();
    if (p && iso && map && ![...iso].some((id) => map.has(id))) { this.isolation.delete(p); iso = undefined; }
    if (iso && map) for (const id of iso) for (let l = map.get(id); l; l = l.parentId ? map.get(l.parentId) : undefined) keep.add(l.id);
    const shown = (l: Layer): boolean => { if (!iso || !map || keep.has(l.id)) return true; for (let a = l.parentId ? map.get(l.parentId) : undefined; a; a = a.parentId ? map.get(a.parentId) : undefined) if (iso.has(a.id)) return true; return false; };
    const nm = this.fName.value.trim().toLowerCase(), md = this.fMode.value, at = this.fAttr.value as AttrId | 'all', lb = this.fLabel.value;
    const passes = (l: Layer): boolean => l.isGroup || ((!nm || l.name.toLowerCase().includes(nm)) && (md === 'all' || l.blend === md) && (at === 'all' || hasAttr(l, at)) && (lb === 'all' || (l.label ?? 'none') === lb));
    const entries = (this.kinds.size ? all.filter((e) => e.layer.isGroup || this.kinds.has(kindOf(e.layer))) : all).filter((e) => shown(e.layer) && passes(e.layer));
    setHidden(this.empty, all.length > 0);
    // Rows moved by a layer arriving or leaving are held where they were by a transform and then eased into place (FLIP),
    // so a layer that arrives with no click just before it (an import, Remove Background finishing) does not make the
    // list jump; browsers do not count movement by transform as a layout shift.
    const count = this.rows.children.length, before = new Map<string, number>();
    for (const r of Array.from(this.rows.children) as HTMLElement[]) before.set(r.dataset.id ?? '', r.getBoundingClientRect().top);
    this.links = new Map();
    for (const l of p?.doc.layers ?? []) if (l.link) this.links.set(l.link, (this.links.get(l.link) ?? 0) + 1);
    patchList(this.rows, entries, {
      key: (e) => e.layer.id,
      create: (e) => this.createRow(e),
      update: (n, e) => this.updateRow(n, e),
    });
    if (count && this.rows.children.length !== count) {
      const moved: HTMLElement[] = [];
      for (const r of Array.from(this.rows.children) as HTMLElement[]) {
        const was = before.get(r.dataset.id ?? '');
        if (was === undefined) continue;
        const dy = Math.round(was - r.getBoundingClientRect().top);
        if (!dy) continue;
        setClass(r, 'is-settling', false);
        setStyleVar(r, '--flip', `${dy}px`);
        moved.push(r);
      }
      if (moved.length) requestAnimationFrame(() => { for (const r of moved) { setClass(r, 'is-settling', true); setStyleVar(r, '--flip', '0px'); } });
    }
    // The active layer's row scrolls into view when the active layer changes.
    const act = p?.activeId ?? null;
    if (act !== this.revealed) {
      this.revealed = act;
      const row = act ? this.rowOf(act) : null;
      if (row) {
        const top = row.offsetTop, bottom = top + row.offsetHeight;
        if (top < this.list.scrollTop) this.list.scrollTop = top;
        else if (bottom > this.list.scrollTop + this.list.clientHeight) this.list.scrollTop = bottom - this.list.clientHeight;
      }
    }
    this.syncProps();
  }

  private createRow(e: HierarchyEntry): HTMLElement {
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><span class="cv-layer-masks"><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><canvas class="cv-layer-vmask" width="${THUMB}" height="${THUMB}"></canvas></span><span class="cv-layer-name"><button class="cv-layer-chain" type="button" tabindex="-1" hidden aria-label="Link the mask to the layer" aria-pressed="true">${icon('link', 12)}</button><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span><span class="cv-layer-role" hidden></span><span class="cv-layer-size" hidden></span><span class="cv-layer-fx" hidden title="Layer style: click to list its effects, double-click to edit">fx</span><span class="cv-layer-smart" hidden title="Smart object: double-click for its filters">${icon('smartObject', 12)}</span><span class="cv-layer-vector" hidden title="Shape layer: double-click for its fill and stroke">${icon('penTool', 12)}</span><span class="cv-layer-linked" hidden title="Linked: moves with the layers linked to it">${icon('link', 12)}</span><span class="cv-layer-locked" hidden title="Locked">${icon('lock', 12)}</span></span><div class="cv-layer-fxlist" hidden></div><div class="cv-layer-sflist" hidden></div></div>`);
    row.dataset.id = e.layer.id;
    this.updateRow(row, e);
    return row;
  }

  private updateRow(row: HTMLElement, e: HierarchyEntry): void {
    const p = this.engine.current;
    if (!p) return;
    const l = e.layer;
    const active = p.activeId === l.id;
    const collapsed = p.collapsed.has(l.id);
    setClass(row, 'is-selected', p.selectedIds.has(l.id));
    setClass(row, 'is-active', active);
    setClass(row, 'is-hidden', !l.visible);
    setClass(row, 'is-dimmed', l.visible && !e.visible);
    setClass(row, 'is-group', l.isGroup);
    setClass(row, 'is-collapsed', collapsed);
    if ((row.dataset.label ?? '') !== (l.label ?? '')) { if (l.label) row.dataset.label = l.label; else delete row.dataset.label; }
    setClass(row, 'is-adjust', !!l.adjustment);
    setClass(row, 'is-fill', !!l.fillContent);
    setClass(row, 'is-relight', !!l.relight);
    setClass(row, 'has-mask', !!l.mask);
    setClass(row, 'mask-off', !!l.mask && !l.mask.enabled);
    setClass(row, 'is-mask-target', active && p.maskTarget && !!l.mask);
    setClass(row, 'is-pixel-target', active && !p.maskTarget && !!l.mask);
    setClass(row, 'is-clipped', !!l.clipId);
    const listed = fxListed(l.effects);
    setHidden(q(row, '.cv-layer-fx'), !listed.length);
    setClass(q(row, '.cv-layer-fx'), 'is-off', !!l.effects?.hidden || !effectsPresent(l.effects));
    this.syncFxList(row, l, listed);
    setHidden(q(row, '.cv-layer-smart'), !l.smart);
    setClass(row, 'is-smart', !!l.smart);
    this.syncSmartList(row, l);
    setHidden(q(row, '.cv-layer-vector'), !l.vector);
    setHidden(q(row, '.cv-layer-linked'), !l.link || (this.links.get(l.link) ?? 0) < 2);
    const lk = l.locks ?? {}, locked = !!(lk.all || lk.transparency || lk.pixels || lk.position || lk.artboard);
    setHidden(q(row, '.cv-layer-locked'), !locked);
    setClass(q(row, '.cv-layer-locked'), 'is-partial', locked && !lk.all);
    const role = l.isGroup ? null : layerRoleOf(l), badge = q(row, '.cv-layer-role');
    setHidden(badge, !role);
    if (role) { setText(badge, t(ROLE_BADGE[role])); setTitle(badge, `${t('Role')}: ${t(LAYER_ROLE_LABELS[role])}`); }
    setClass(row, 'is-text', this.engine.liveText(l));
    setStyleVar(row, '--depth', String(e.depth));
    if (this.renaming !== l.id) setText(q(row, '.cv-layer-label'), l.name);
    setTitle(row, l.raster && !l.isGroup && !l.artboard ? `${l.name} (${sizeOf(l)})` : l.name);
    const board = l.isGroup && !l.parentId ? l.artboard : null;
    const kind = board ? 'artboard' : l.isGroup ? (collapsed ? 'folder' : 'folderOpen') : l.adjustment ? 'levels' : '';
    if (kind) setHtml(q(row, '.cv-layer-kind'), icon(kind, 16), kind);
    const dims = board ? `${board.w} x ${board.h}` : active && l.raster && !l.isGroup ? `${sizeOf(l)}${p.doc.depth && p.doc.depth !== 8 ? ` ${p.doc.depth}-bit` : ''}` : '';
    setHidden(q(row, '.cv-layer-size'), !dims);
    setText(q(row, '.cv-layer-size'), dims);
    const chain = q(row, '.cv-layer-chain'), linked = l.mask?.linked !== false;
    setHidden(chain, !l.mask);
    chain.setAttribute('aria-pressed', String(linked));
    setClass(chain, 'is-off', !linked);
    setTitle(chain, linked ? 'Mask linked to the layer: click to unlink' : 'Mask unlinked: click to link');
    const vm = l.vectorMask ?? null;
    setClass(row, 'has-vmask', !!vm);
    setClass(row, 'vmask-off', !!vm && !vm.enabled);
    setClass(row, 'is-vmask-target', active && !!vm && !l.mask);
    const state = this.painted.get(row) ?? { pixels: '', mask: '' };
    const vk = vm ? `${this.vectorKey(vm)}:${vm.enabled}:${vm.inverted}:${p.doc.width}x${p.doc.height}` : 'none';
    if (state.vmask !== vk) { if (vm) this.drawVectorThumb(q<HTMLCanvasElement>(row, '.cv-layer-vmask'), vm, p.doc.width, p.doc.height); state.vmask = vk; }
    const tr = l.transform, framed = !tr.rotation && !l.isGroup;
    const pk = l.raster && !l.isGroup ? `${l.raster.id}:${l.raster.version}${framed ? `:${p.doc.width}x${p.doc.height}:${tr.x},${tr.y},${tr.w},${tr.h},${tr.flipX},${tr.flipY}` : ''}` : 'none';
    if (state.pixels !== pk) { this.drawThumb(q<HTMLCanvasElement>(row, '.cv-layer-thumb'), l.isGroup ? null : l.raster, false, framed ? { w: p.doc.width, h: p.doc.height, t: tr } : undefined); state.pixels = pk; }
    const mk = l.mask ? `${l.mask.raster?.id ?? 'full'}:${l.mask.raster?.version ?? 0}` : 'none';
    if (state.mask !== mk) { if (l.mask) this.drawThumb(q<HTMLCanvasElement>(row, '.cv-layer-mask'), l.mask.raster, true); state.mask = mk; }
    this.painted.set(row, state);
  }

  /** The effect rows under a layer, built once on first opening and then updated in place: an eye, the name (with the
   *  number of instances) and a delete button for each listed effect. */
  private syncFxList(row: HTMLElement, l: Layer, listed: FxKey[]): void {
    const box = q(row, '.cv-layer-fxlist'), open = this.fxOpen.has(l.id) && listed.length > 0;
    setHidden(box, !open);
    setClass(row, 'has-fxlist', open);
    if (!open) return;
    if (!box.firstElementChild) {
      for (const [k, name] of FX_ROWS) box.appendChild(el(`<div class="cv-fxrow" data-key="${k}" hidden><button class="cv-fx-eye" type="button" tabindex="-1" aria-label="Show or hide ${name}"><span class="cv-eye-on">${icon('eye', 12)}</span><span class="cv-eye-off">${icon('eyeOff', 12)}</span></button><span class="cv-fx-name"></span><button class="cv-fx-del" type="button" tabindex="-1" aria-label="Delete ${name}" title="Delete this effect">${icon('delete', 12)}</button></div>`));
    }
    const fx = l.effects as LayerEffects;
    for (const r of Array.from(box.children) as HTMLElement[]) {
      const k = r.dataset.key as FxKey, on = listed.includes(k);
      setHidden(r, !on);
      if (!on) continue;
      const all = (MULTI_EFFECTS.includes(k as never) ? instances(fx, k as (typeof MULTI_EFFECTS)[number]) : [fx[k]]) as Array<{ enabled: boolean }>, shown = all.some((e) => e.enabled);
      setClass(r, 'is-off', !shown);
      setText(q(r, '.cv-fx-name'), `${FX_ROWS.find(([key]) => key === k)?.[1] ?? k}${all.length > 1 ? ` (${all.length})` : ''}`);
    }
  }

  /** The smart filter rows under a smart object, patched in place: an eye, the filter's name and a delete button each. */
  private syncSmartList(row: HTMLElement, l: Layer): void {
    const box = q(row, '.cv-layer-sflist'), filters = l.smart ? this.engine.smartFiltersShown(l.id) ?? l.smart.filters : [], open = this.sfOpen.has(l.id) && filters.length > 0;
    setHidden(box, !open);
    setClass(row, 'has-sflist', open);
    if (!open) return;
    patchList(box, filters, {
      key: (f) => f.id,
      create: (f) => {
        const r = el(`<div class="cv-fxrow cv-sfrow"><button class="cv-fx-eye" type="button" tabindex="-1" aria-label="Show or hide this filter"><span class="cv-eye-on">${icon('eye', 12)}</span><span class="cv-eye-off">${icon('eyeOff', 12)}</span></button><span class="cv-fx-name"></span><button class="cv-fx-del" type="button" tabindex="-1" aria-label="Delete this filter" title="Delete this filter">${icon('delete', 12)}</button></div>`);
        r.dataset.key = f.id;
        this.fillSmartRow(r, f);
        return r;
      },
      update: (r, f) => this.fillSmartRow(r, f),
    });
  }

  private fillSmartRow(r: HTMLElement, f: { kind: string; enabled: boolean }): void {
    setClass(r, 'is-off', !f.enabled);
    setText(q(r, '.cv-fx-name'), isWasmKind(f.kind) ? wasmPlugins.get(wasmIdOf(f.kind))?.manifest.name ?? wasmIdOf(f.kind) : f.kind === 'liquify' ? 'Liquify' : f.kind === 'wideangle' ? 'Adaptive Wide Angle' : FILTER_LABELS[f.kind as FilterKind] ?? f.kind);
  }

  private trashButton(): HTMLElement | null { return this.page.querySelector<HTMLElement>('.cv-panel-foot [data-cmd="delete-layer-ask"]'); }
  private overTrash(x: number, y: number): boolean { const b = this.trashButton(), hit = document.elementFromPoint(x, y); return !!b && !!hit && b.contains(hit); }

  private readonly vectorIds = new WeakMap<object, number>();
  private vectorSeq = 0;
  private vectorKey(v: object): number {
    let n = this.vectorIds.get(v);
    if (n === undefined) { n = ++this.vectorSeq; this.vectorIds.set(v, n); }
    return n;
  }

  /** A vector mask's thumbnail: its outline filled white on black, the canvas shape letterboxed as the pixel mask thumbnail is. */
  private drawVectorThumb(c: HTMLCanvasElement, v: NonNullable<Layer['vectorMask']>, W: number, H: number): void {
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, THUMB, THUMB);
    g.fillStyle = '#000000';
    g.fillRect(0, 0, THUMB, THUMB);
    const s = Math.min(THUMB / W, THUMB / H), w = Math.max(1, W * s), h = Math.max(1, H * s), x = (THUMB - w) / 2, y = (THUMB - h) / 2;
    const cov = vectorCoverage(v, W, H);
    if (!cov) { g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); return; }
    g.imageSmoothingQuality = 'medium';
    g.drawImage(cov.surface as CanvasImageSource, x, y, w, h);
  }

  private drawThumb(c: HTMLCanvasElement, r: Raster | null, mask: boolean, doc?: { w: number; h: number; t: Layer['transform'] }): void {
    const g = c.getContext('2d');
    if (!g) return;
    const pal = paint();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, THUMB, THUMB);
    if (doc && !mask && doc.w > 0 && doc.h > 0) {
      // The canvas shape is the frame: the checker fills only the canvas rectangle and the layer sits where it lies in it.
      const k = Math.min(THUMB / doc.w, THUMB / doc.h), fw = doc.w * k, fh = doc.h * k, ox = (THUMB - fw) / 2, oy = (THUMB - fh) / 2, cell = 6;
      g.save();
      g.beginPath();
      g.rect(ox, oy, fw, fh);
      g.clip();
      g.fillStyle = pal.checkerA;
      g.fillRect(ox, oy, fw, fh);
      g.fillStyle = pal.checkerB;
      for (let y = 0; y < THUMB; y += cell) for (let x = (y / cell) % 2 ? 0 : cell; x < THUMB; x += cell * 2) g.fillRect(x, y, cell, cell);
      if (r) {
        const t = doc.t;
        g.imageSmoothingQuality = 'medium';
        g.translate(ox + (t.x + t.w / 2) * k, oy + (t.y + t.h / 2) * k);
        g.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
        g.drawImage(r.canvas as CanvasImageSource, (-t.w * k) / 2, (-t.h * k) / 2, Math.max(1, t.w * k), Math.max(1, t.h * k));
      }
      g.restore();
      return;
    }
    if (mask) {
      g.fillStyle = pal.antsA;
      g.fillRect(0, 0, THUMB, THUMB);
      if (!r) { g.fillStyle = pal.antsB; g.fillRect(0, 0, THUMB, THUMB); return; }
    } else {
      const cell = 6;
      g.fillStyle = pal.checkerA;
      g.fillRect(0, 0, THUMB, THUMB);
      g.fillStyle = pal.checkerB;
      for (let y = 0; y < THUMB; y += cell) for (let x = (y / cell) % 2 ? 0 : cell; x < THUMB; x += cell * 2) g.fillRect(x, y, cell, cell);
      if (!r) return;
    }
    const src = r as Raster;
    const s = Math.min(THUMB / src.width, THUMB / src.height);
    const w = Math.max(1, src.width * s), h = Math.max(1, src.height * s);
    g.imageSmoothingQuality = 'medium';
    g.drawImage(src.canvas as CanvasImageSource, (THUMB - w) / 2, (THUMB - h) / 2, w, h);
  }

  private syncProps(): void {
    const l = this.engine.activeLayer;
    const pixel = !!l && !l.isGroup, mixable = !!l && !l.artboard;
    setDisabled(this.blend, !mixable);
    setDisabled(this.opacity, !mixable);
    const folder = !!l && l.isGroup && mixable;
    setHidden(this.passThrough, !folder);
    setValue(this.blend, !mixable ? 'normal' : folder && !groupIsolated(l as Layer) ? 'pass-through' : (l as Layer).blend);
    const pct = String(Math.round((mixable ? (l as Layer).opacity : 1) * 100));
    if (document.activeElement !== this.opacity) setValue(this.opacity, pct);
    setDisabled(this.fill, !pixel);
    for (const b of this.page.querySelectorAll<HTMLButtonElement>('.cv-lock-btn')) {
      const on = !!l?.locks?.[b.dataset.lock as keyof LayerLocks];
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      setDisabled(b, !l);
    }
    if (document.activeElement !== this.fill) setValue(this.fill, String(Math.round((pixel ? (l as Layer).fill ?? 1 : 1) * 100)));
    this.slideSync();
  }

  /** The kind icons and dropdown show the filter. */
  private syncKinds(): void {
    for (const b of this.page.querySelectorAll<HTMLButtonElement>('.cv-kind-btn')) {
      const on = this.kinds.has(b.dataset.kind as KindId);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    setValue(this.kind, this.kinds.size === 1 ? [...this.kinds][0] : 'all');
  }

  /** The Paths panel's section becomes the group's Paths tab (Layers | Channels | Paths). */
  adoptPaths(section: HTMLElement): void {
    this.paths = section;
    const toggle = section.querySelector<HTMLButtonElement>('.cv-paths-toggle'), body = section.querySelector<HTMLElement>('.cv-paths-body');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (body) setHidden(body, false);
    this.group.addTab('paths', 'Paths', section);
  }

  /** The Channels panel becomes the group's Channels tab, before Paths. */
  adoptChannels(panel: ChannelsPanel): void {
    this.channels = panel;
    this.group.addTab('channels', 'Channels', panel.root, 'paths');
  }
  private channels: ChannelsPanel | null = null;
  readonly group: PanelGroup;
  private readonly page: HTMLElement;

  /** Shows a tab of this group, or of whichever group it has moved to. */
  showTab(tab: LayersTab): void {
    const holder = [...PanelGroup.all.values()].find((g) => g.has(tab));
    holder?.show(tab);
  }

  private rowOf(id: ID): HTMLElement | null {
    for (const child of Array.from(this.rows.children)) if ((child as HTMLElement).dataset.id === id) return child as HTMLElement;
    return null;
  }

  /** The move that puts the centre of the dragged layers at a point of the target document. */
  private dropShift(srcId: string, ids: readonly ID[], at: { x: number; y: number }): { dx: number; dy: number } | false {
    const src = this.engine.projects.find((pr) => pr.id === srcId), lay = ids.map((i) => src?.layer(i)).filter((l): l is Layer => !!l && !l.isGroup);
    if (!lay.length) return false;
    const x0 = Math.min(...lay.map((l) => l.transform.x)), y0 = Math.min(...lay.map((l) => l.transform.y)), x1 = Math.max(...lay.map((l) => l.transform.x + l.transform.w)), y1 = Math.max(...lay.map((l) => l.transform.y + l.transform.h));
    return { dx: at.x - (x0 + x1) / 2, dy: at.y - (y0 + y1) / 2 };
  }

  /** Marks the project tab a layer drag would copy into, clearing the rest. */
  private showTabDrop(key: string | null): void {
    for (const t of document.querySelectorAll<HTMLElement>('.cv-tab')) setClass(t, 'is-drop-target', !!key && t.dataset.key === key);
    for (const n of document.querySelectorAll<HTMLElement>('.cv-tabs > [data-cmd="new"]')) setClass(n, 'is-drop-target', key === 'new');
  }

  /** zone: the bottom quarter of a row, the boundary with the layer below. */
  private inClipZone(row: HTMLElement, clientY: number): boolean {
    const r = row.getBoundingClientRect();
    return r.height > 0 && (clientY - r.top) / r.height >= 0.75;
  }

  private rowAt(clientX: number, clientY: number): HTMLElement | null {
    const hit = document.elementFromPoint(clientX, clientY);
    const row = hit instanceof Element ? hit.closest<HTMLElement>('.cv-layer') : null;
    return row && this.rows.contains(row) ? row : null;
  }

  startRename(id: ID): void {
    const row = this.rowOf(id);
    if (!row || this.renaming) return;
    this.renaming = id;
    const label = q(row, '.cv-layer-label');
    const input = el<HTMLInputElement>('<input class="cv-layer-rename" type="text" spellcheck="false" aria-label="Layer name">');
    input.value = label.textContent ?? '';
    label.hidden = true;
    label.after(input);
    input.focus();
    input.select();
    const done = (commit: boolean): void => {
      if (this.renaming !== id) return;
      this.renaming = null;
      const value = input.value;
      input.remove();
      label.hidden = false;
      if (commit) this.engine.renameLayer(id, value);
      else this.queue();
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); });
    input.addEventListener('blur', () => done(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private showDrop(target: { id: ID; where: Where } | null): void {
    const line = this.dropLine;
    if (!target) { setClass(line, 'is-shown', false); return; }
    const row = this.rowOf(target.id);
    if (!row) { setClass(line, 'is-shown', false); return; }
    const top = target.where === 'above' ? row.offsetTop - 1 : target.where === 'below' ? row.offsetTop + row.offsetHeight - 1 : row.offsetTop;
    line.style.top = `${top}px`;
    setClass(line, 'is-inside', target.where === 'inside');
    setClass(line, 'is-shown', true);
  }

  private bindRows(): void {
    const rows = this.rows;
    rows.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('.cv-layer');
      if (!row || e.button !== 0 || this.renaming) return;
      const id = row.dataset.id as ID;
      const sfr = t.closest<HTMLElement>('.cv-sfrow');
      if (sfr) {
        e.preventDefault();
        const fid = sfr.dataset.key as ID, l = this.engine.current?.layer(id), filters = l?.smart ? this.engine.smartFiltersShown(id) ?? l.smart.filters : [];
        if (t.closest('.cv-fx-eye')) { this.engine.setSmartFilters(id, filters.map((f) => (f.id === fid ? { ...f, enabled: !f.enabled } : f)), 'Show or Hide Smart Filter'); return; }
        if (t.closest('.cv-fx-del')) { this.engine.setSmartFilters(id, filters.filter((f) => f.id !== fid), 'Delete Smart Filter'); return; }
        if (this.engine.current?.activeId !== id) this.engine.selectLayer(id);
        this.fxDrag = { id, key: 'stroke', sf: fid, pointerId: e.pointerId, startY: e.clientY, started: false, target: null };
        return;
      }
      const fxr = t.closest<HTMLElement>('.cv-fxrow');
      if (fxr) {
        e.preventDefault();
        const key = fxr.dataset.key as FxKey;
        if (t.closest('.cv-fx-eye')) { this.engine.setEffectShown(id, key, fxr.classList.contains('is-off')); return; }
        if (t.closest('.cv-fx-del')) { this.engine.removeEffect(id, key); return; }
        if (this.engine.current?.activeId !== id) this.engine.selectLayer(id);
        this.fxDrag = { id, key, pointerId: e.pointerId, startY: e.clientY, started: false, target: null };
        return;
      }
      if (t.closest('.cv-layer-eye')) {
        e.preventDefault();
        if (e.altKey) { this.engine.soloLayer(id); return; }   // Show Only This Layer, again to bring the others back (1.87.3)
        const v = this.engine.beginVisibilitySwipe(id);
        if (v === null) return;
        this.swipe = { visible: v, pointerId: e.pointerId };
        rows.setPointerCapture(e.pointerId);
        return;
      }
      if (t.closest('.cv-layer-disclose')) return;
      if (t.closest('.cv-layer-chain')) {
        e.preventDefault();
        if (this.engine.current?.activeId !== id || this.engine.current.selectedIds.size > 1) this.engine.selectLayer(id);
        this.engine.toggleMaskLink();
        return;
      }
      const p = this.engine.current;
      if (!p) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      // Option-click on the bottom quarter of a row makes or releases that layer's clipping mask; elsewhere
      // on the row the click selects as usual, so an Option-drag can still drop a duplicate.
      if (e.altKey && !mod && !t.closest('.cv-layer-mask') && this.inClipZone(row, e.clientY)) {
        e.preventDefault();
        this.engine.toggleClip(id);
        return;
      }
      // Mod-click on a thumbnail loads it as a selection: Shift adds, Option subtracts, both intersect (1.87.5).
      const onMask = !!t.closest('.cv-layer-mask'), onThumb = !!t.closest('.cv-layer-thumb');
      if (mod && (onThumb || (onMask && p.layer(id)?.mask))) {
        e.preventDefault();
        this.engine.selectLayer(id);
        this.engine.loadSelection({ channel: onMask ? 'mask' : 'transparency' }, false, e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace');
        return;
      }
      const wasSelected = p.selectedIds.has(id);
      if (mod) this.engine.selectLayer(id, 'toggle');
      else if (e.shiftKey && !t.closest('.cv-layer-mask, .cv-layer-vmask')) this.engine.selectLayer(id, 'range');
      else if (!wasSelected) this.engine.selectLayer(id);
      else if (p.activeId !== id) { p.activeId = id; this.engine.emit('active', null); }
      if (t.closest('.cv-layer-mask')) {
        if (e.shiftKey && !e.altKey) this.engine.toggleMaskEnabled();
        else this.engine.setMaskTarget(true);
      } else if (t.closest('.cv-layer-vmask')) {
        if (e.shiftKey) this.engine.changeVectorMask('enable');
        else this.engine.setMaskTarget(false);
      } else if (t.closest('.cv-layer-thumb')) this.engine.setMaskTarget(false);
      const ids = p.selectedIds.has(id) ? [...p.selectedIds] : [id];
      const maskFrom = e.altKey && t.closest('.cv-layer-mask') && p.layer(id)?.mask ? id : null;
      this.drag = { id, ids: maskFrom ? [id] : ids, startY: e.clientY, pointerId: e.pointerId, started: false, wasSelected: wasSelected && !mod && !e.shiftKey, target: null, maskFrom, tabTarget: null, src: p.id };
    });
    rows.addEventListener('pointermove', (e) => {
      const fd = this.fxDrag;
      if (fd && fd.pointerId === e.pointerId) {
        if (!fd.started && Math.abs(e.clientY - fd.startY) < 4) return;
        if (!fd.started) { rows.setPointerCapture(e.pointerId); fd.started = true; }
        const over = this.rowAt(e.clientX, e.clientY), sfHit = fd.sf ? document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.cv-sfrow') ?? null : null;
        const next = fd.sf
          ? (sfHit && over?.dataset.id === fd.id && sfHit.dataset.key !== fd.sf ? sfHit : over && over.dataset.id !== fd.id && over.classList.contains('is-smart') ? over : null)
          : over && over.dataset.id !== fd.id && !over.classList.contains('is-group') && !over.classList.contains('is-adjust') ? over : null;
        if (next !== fd.target) { setClass(fd.target, 'is-fx-target', false); setClass(next, 'is-fx-target', true); fd.target = next; }
        setClass(this.trashButton(), 'is-fx-trash', this.overTrash(e.clientX, e.clientY));
        return;
      }
      if (this.swipe && this.swipe.pointerId === e.pointerId) {
        const row = this.rowAt(e.clientX, e.clientY);
        if (row?.dataset.id) this.engine.swipeVisibility(row.dataset.id, this.swipe.visible);
        return;
      }
      const d = this.drag;
      if (!d) {
        const hover = this.rowAt(e.clientX, e.clientY);
        setClass(rows, 'is-clip-zone', e.altKey && !!hover && !(e.target as HTMLElement).closest('.cv-layer-mask') && this.inClipZone(hover, e.clientY));
      }
      if (!d || d.pointerId !== e.pointerId) return;
      if (!d.started && Math.abs(e.clientY - d.startY) < 4) return;
      if (!d.started) rows.setPointerCapture(e.pointerId);
      d.started = true;
      setClass(rows, 'is-copy-drag', e.altKey || !!d.maskFrom);
      // A row dragged onto another project's tab copies the layer there.
      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const tab = hit?.closest<HTMLElement>('.cv-tab') ?? null, slot = hit?.closest<HTMLElement>('.cv-tabs > [data-cmd="new"]') ?? null;
      const cur = this.engine.current?.id ?? null, away = !!cur && cur !== d.src, over = tab?.dataset.key ?? null;
      const key = d.maskFrom ? null : slot ? 'new' : away && over !== d.src ? cur : over && over !== cur ? over : null;
      if (!d.maskFrom && !slot && over && over !== cur && this.spring?.key !== over) {
        this.clearSpring();
        const timer = setTimeout(() => { this.spring = null; if (this.drag === d) this.engine.switchTo(over); }, 650);
        this.spring = { key: over, timer };
      } else if (!over || over === cur || slot) this.clearSpring();
      d.tabTarget = key;
      this.showTabDrop(key);
      this.showStageDrop(!!key && key !== 'new' && !!this.docPoint?.(e.clientX, e.clientY));
      if (key) { d.target = null; this.showDrop(null); return; }
      const row = this.rowAt(e.clientX, e.clientY);
      if (!row?.dataset.id || d.ids.includes(row.dataset.id)) { d.target = null; this.showDrop(null); return; }
      const r = row.getBoundingClientRect();
      const f = (e.clientY - r.top) / r.height;
      const group = row.classList.contains('is-group');
      if (d.maskFrom) { d.target = group ? null : { id: row.dataset.id, where: 'inside' }; this.showDrop(d.target); return; }
      const where: Where = group && f > 0.25 && f < 0.75 ? 'inside' : f < 0.5 ? 'above' : 'below';
      d.target = { id: row.dataset.id, where };
      this.showDrop(d.target);
    });
    const finish = (e: PointerEvent, cancel: boolean): void => {
      const fd = this.fxDrag;
      if (fd && fd.pointerId === e.pointerId) {
        this.fxDrag = null;
        setClass(fd.target, 'is-fx-target', false);
        if (rows.hasPointerCapture(e.pointerId)) rows.releasePointerCapture(e.pointerId);
        setClass(this.trashButton(), 'is-fx-trash', false);
        // Dropped on the delete button, the effect is removed; on another layer, it moves there, or is copied with Option held.
        if (fd.sf) {
          const l = this.engine.current?.layer(fd.id), filters = l?.smart ? this.engine.smartFiltersShown(fd.id) ?? l.smart.filters : [], from = filters.findIndex((f) => f.id === fd.sf);
          if (cancel || !fd.started || from < 0) return;
          if (this.overTrash(e.clientX, e.clientY)) this.engine.setSmartFilters(fd.id, filters.filter((f) => f.id !== fd.sf), 'Delete Smart Filter');
          else if (fd.target?.classList.contains('cv-sfrow')) this.engine.reorderSmartFilter(fd.id, from, filters.findIndex((f) => f.id === fd.target?.dataset.key));
          else if (fd.target?.dataset.id) this.engine.transferSmartFilter(fd.id, fd.sf, fd.target.dataset.id, !e.altKey);
          return;
        }
        if (!cancel && fd.started && this.overTrash(e.clientX, e.clientY)) this.engine.removeEffect(fd.id, fd.key);
        else if (!cancel && fd.started && fd.target?.dataset.id) this.engine.transferEffects(fd.id, fd.target.dataset.id, [fd.key], !e.altKey);
        return;
      }
      if (this.swipe && this.swipe.pointerId === e.pointerId) {
        this.swipe = null;
        this.engine.endVisibilitySwipe();
        return;
      }
      const d = this.drag;
      if (!d || d.pointerId !== e.pointerId) return;
      this.drag = null;
      this.clearSpring();
      setClass(rows, 'is-copy-drag', false);
      this.showDrop(null);
      if (rows.hasPointerCapture(e.pointerId)) rows.releasePointerCapture(e.pointerId);
      this.showTabDrop(null);
      this.showStageDrop(false);
      const drop = d.started && d.tabTarget && d.tabTarget !== 'new' && !e.shiftKey && !cancel ? this.docPoint?.(e.clientX, e.clientY) ?? null : null;
      if (cancel || (d.started && !d.tabTarget && this.engine.current?.id !== d.src)) { this.engine.switchTo(d.src); return; }
      if (d.started && d.tabTarget === 'new') { if (this.engine.current?.id !== d.src) this.engine.switchTo(d.src); this.engine.copyLayersToNewDocument(d.ids); }
      else if (d.started && d.tabTarget) this.engine.copyLayersToProject(d.ids, d.tabTarget, drop ? this.dropShift(d.src, d.ids, drop) : e.shiftKey);
      else if (d.started && d.target) {
        if (d.maskFrom) this.engine.copyMask(d.maskFrom, d.target.id);
        else this.engine.moveLayers(d.ids, d.target.id, d.target.where, e.altKey);
      }
      else if (!d.started && d.maskFrom && !cancel) this.engine.setMaskView(e.shiftKey ? 'rubylith' : 'alone');
      else if (!d.started && d.wasSelected) this.engine.selectLayer(d.id);
    };
    rows.addEventListener('pointerup', (e) => finish(e, false));
    rows.addEventListener('pointercancel', (e) => finish(e, true));
    rows.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('.cv-layer');
      if (row?.dataset.id && t.closest('.cv-layer-disclose')) this.engine.toggleCollapsed(row.dataset.id, e.altKey);
      if (row?.dataset.id && t.closest('.cv-layer-smart')) {
        const id = row.dataset.id, l = this.engine.current?.layer(id);
        if (this.sfOpen.has(id)) this.sfOpen.delete(id); else this.sfOpen.add(id);
        if (l) this.syncSmartList(row, l);
      }
      if (row?.dataset.id && t.closest('.cv-layer-fx')) {
        const id = row.dataset.id, l = this.engine.current?.layer(id);
        if (this.fxOpen.has(id)) this.fxOpen.delete(id); else this.fxOpen.add(id);
        if (l) this.syncFxList(row, l, fxListed(l.effects));
      }
    });
    // The middle button drags the list: it moves with the pointer, and no auto-scroll mark opens.
    let pan: { id: number; y: number } | null = null;
    this.list.addEventListener('pointerdown', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      pan = { id: e.pointerId, y: e.clientY };
      this.list.setPointerCapture(e.pointerId);
      setClass(this.list, 'is-panning', true);
    });
    this.list.addEventListener('pointermove', (e) => {
      if (!pan || pan.id !== e.pointerId) return;
      this.list.scrollTop -= e.clientY - pan.y;
      pan.y = e.clientY;
    });
    const endPan = (e: PointerEvent): void => {
      if (!pan || pan.id !== e.pointerId) return;
      pan = null;
      if (this.list.hasPointerCapture(e.pointerId)) this.list.releasePointerCapture(e.pointerId);
      setClass(this.list, 'is-panning', false);
    };
    this.list.addEventListener('pointerup', endPan);
    this.list.addEventListener('pointercancel', endPan);
    this.list.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    rows.addEventListener('dblclick', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('.cv-layer');
      if (!row?.dataset.id) return;
      if (t.closest('.cv-sfrow')) { if (!t.closest('.cv-fx-eye, .cv-fx-del')) row.dispatchEvent(new CustomEvent('cv:smart-filters', { bubbles: true, detail: row.dataset.id })); return; }
      const fxr = t.closest<HTMLElement>('.cv-fxrow');
      if (fxr && !t.closest('.cv-fx-eye, .cv-fx-del')) { row.dispatchEvent(new CustomEvent('cv:edit-layer-effect', { bubbles: true, detail: { id: row.dataset.id, key: fxr.dataset.key } })); return; }
      if (t.closest('.cv-layer-mask, .cv-layer-vmask')) { row.dispatchEvent(new CustomEvent('cv:mask-properties', { bubbles: true, detail: { id: row.dataset.id, vector: !!t.closest('.cv-layer-vmask') } })); return; }
      if (t.closest('.cv-layer-fx')) row.dispatchEvent(new CustomEvent('cv:edit-layer-style', { bubbles: true, detail: row.dataset.id }));
      if (t.closest('.cv-layer-smart')) row.dispatchEvent(new CustomEvent('cv:smart-filters', { bubbles: true, detail: row.dataset.id }));
      if (t.closest('.cv-layer-vector')) row.dispatchEvent(new CustomEvent('cv:shape-style', { bubbles: true, detail: row.dataset.id }));
      else if (t.closest('.cv-layer-name')) this.startRename(row.dataset.id);
      else if (row.classList.contains('is-text')) document.dispatchEvent(new CustomEvent('cv:type', { detail: { layerId: row.dataset.id } }));
      else if (row.classList.contains('is-adjust')) row.dispatchEvent(new CustomEvent('cv:edit-adjustment', { bubbles: true, detail: row.dataset.id }));
      else if (row.classList.contains('is-fill') && !t.closest('.cv-layer-mask')) row.dispatchEvent(new CustomEvent('cv:fill-options', { bubbles: true, detail: row.dataset.id }));
      else if (row.classList.contains('is-relight') && !t.closest('.cv-layer-mask')) row.dispatchEvent(new CustomEvent('cv:relight-edit', { bubbles: true, detail: row.dataset.id }));
    });
    this.list.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-layer');
      const p = this.engine.current;
      if (!row?.dataset.id || !p) return;
      if (!p.selectedIds.has(row.dataset.id)) this.engine.selectLayer(row.dataset.id);
      this.menu.openAt(e.clientX, e.clientY);
    });
  }
}

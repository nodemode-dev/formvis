import { el, setHidden } from './dom';
import { icon } from './icons';
import { PanelGroup } from './panel-group';

/** The side dock's panels: drag a panel by its header to move it up or down the dock (a line
 *  shows where it will land), show or hide panels from the Window menu, and have the arrangement remembered on this
 *  device. Sourced in the planning notes' workspace research. Every panel in the side dock moves, the Layers panel included; dragged past
 *  both columns a panel floats in a window of its own, which docks back onto a column or a group's tab strip. */
export interface DockPanel { id: string; label: string; selector: string }
export const DOCK_PANELS: readonly DockPanel[] = [
  { id: 'navigator', label: 'Navigator', selector: '.cv-navigator' },
  { id: 'generate', label: 'Generate', selector: 'section.cv-generate' },
  { id: 'swatches', label: 'Swatches', selector: '.cv-swatches' },
  { id: 'layers', label: 'Layers', selector: '.cv-layers-panel' },
  { id: 'timeline', label: 'Timeline', selector: '.cv-timeline' },
  { id: 'history', label: 'History', selector: '.cv-history' },
  { id: 'info', label: 'Info', selector: 'section.cv-info' },
  { id: 'layer-comps', label: 'Layer Comps', selector: 'section.cv-layer-comps' },
  { id: 'styles', label: 'Styles', selector: 'section.cv-styles' },
  { id: 'gradients', label: 'Gradients', selector: 'section.cv-gradients' },
  { id: 'patterns', label: 'Patterns', selector: 'section.cv-patterns' },
  { id: 'shapes', label: 'Shapes', selector: 'section.cv-shapes' },
  { id: 'measurement-log', label: 'Measurement Log', selector: 'section.cv-measure-log' },
  { id: 'modifier-keys', label: 'Modifier Keys', selector: 'section.cv-modifier-keys' },
  { id: 'adjustments', label: 'Adjustments', selector: 'section.cv-adjustments' },
  { id: 'notes', label: 'Notes', selector: 'section.cv-notes-panel' },
  { id: 'histogram', label: 'Histogram', selector: 'section.cv-histogram-panel' },
  { id: 'clone-source', label: 'Clone Source', selector: 'section.cv-clone-source' },
  { id: 'reference', label: 'Reference', selector: 'section.cv-reference' },
  { id: 'comfyui', label: 'ComfyUI', selector: 'section.cv-comfyui' },
  { id: 'actions', label: 'Actions', selector: 'section.cv-actions-panel' },
  { id: 'develop', label: 'Camera Raw', selector: 'section.cv-develop-dock' },
  { id: 'extensions', label: 'Extensions', selector: 'section.cv-extensions' },
];
/** The side column's panel groups (Phase 21), movable like the dock's: any panel may live in either column. */
export const SIDE_PANELS: readonly DockPanel[] = [
  { id: 'properties', label: 'Properties', selector: 'section.cv-properties' },
  { id: 'brushes', label: 'Brushes', selector: 'section.cv-brushes' },
  { id: 'paragraph', label: 'Paragraph', selector: 'section.cv-paragraph' },
  { id: 'character', label: 'Character', selector: 'section.cv-character' },
];
export const ALL_PANELS: DockPanel[] = [...DOCK_PANELS, ...SIDE_PANELS];
/** Groups made by detaching a tab (1.49.2) join the panels the dock arranges, and leave once empty. */
export function registerPanel(p: DockPanel): void { if (!ALL_PANELS.some((x) => x.id === p.id)) ALL_PANELS.push(p); }
export function unregisterPanel(id: string): void { const i = ALL_PANELS.findIndex((x) => x.id === id); if (i >= 0 && !DOCK_PANELS.some((x) => x.id === id) && !SIDE_PANELS.some((x) => x.id === id)) ALL_PANELS.splice(i, 1); }
const DEFAULT_SIDE = SIDE_PANELS.map((p) => p.id);
/** order: the dock's panels, top to bottom; side: the side column's; hidden: those not shown, wherever they live. */
interface DockState { order: string[]; hidden: string[]; side: string[] }
const KEY = 'formvis.dock';
const HEIGHTS_KEY = 'formvis.dock.heights';
const FLOATS_KEY = 'formvis.dock.floats';
/** A header drag's target when the pointer is past both columns: the panel floats there. */
const FLOAT = -2;
/** The Essentials default: Navigator, Swatches and Layers shown; Timeline and History in Window. */
const DEFAULT: DockState = { order: DOCK_PANELS.map((p) => p.id), hidden: ['generate', 'timeline', 'history', 'info', 'layer-comps', 'styles', 'gradients', 'patterns', 'shapes', 'measurement-log', 'modifier-keys', 'adjustments', 'notes', 'histogram', 'clone-source', 'reference', 'comfyui', 'actions', 'develop', 'extensions'], side: [...DEFAULT_SIDE] };

function cleanFloats(f: unknown): Record<string, { x: number; y: number; w: number; h: number }> {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  if (f && typeof f === 'object') for (const [id, r] of Object.entries(f as Record<string, Record<string, unknown>>)) if (r && [r.x, r.y, r.w, r.h].every((v) => typeof v === 'number' && Number.isFinite(v))) out[id] = { x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number };
  return out;
}
/** A frame's place and size fitted inside the window: it stays on screen whatever was saved or the window became. */
function fit(r: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const w = Math.max(200, Math.min(r.w, window.innerWidth)), h = Math.max(120, Math.min(r.h, window.innerHeight));
  return { x: Math.max(0, Math.min(window.innerWidth - w, r.x)), y: Math.max(0, Math.min(window.innerHeight - h, r.y)), w, h };
}

function load(): DockState {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DockState>;
    const ids = ALL_PANELS.map((p) => p.id), dockIds = DOCK_PANELS.map((p) => p.id);
    const kept = (id: unknown): id is string => typeof id === 'string' && (ids.includes(id) || id.startsWith('ext-'));
    // The side column's panels as saved (a saved arrangement from before panels could move has none: the default).
    const side = Array.isArray(r.side) ? r.side.filter(kept) : [...DEFAULT_SIDE];
    const order = Array.isArray(r.order) ? r.order.filter((id): id is string => kept(id) && !side.includes(id)) : [];
    // A panel missing from both takes its default column and place, not the end.
    for (const id of ids) if (!order.includes(id) && !side.includes(id)) {
      if (DEFAULT_SIDE.includes(id) && !Array.isArray(r.side)) side.push(id);
      else order.splice(Math.min(Math.max(0, dockIds.indexOf(id)), order.length), 0, id);
    }
    const hidden = Array.isArray(r.hidden) ? r.hidden.filter((id): id is string => ids.includes(id as string)) : [...DEFAULT.hidden];
    // A panel newer than the saved arrangement (the Info panel, 1.49.6) starts as it comes: hidden if it comes hidden.
    const known = new Set([...(Array.isArray(r.order) ? r.order : []), ...(Array.isArray(r.side) ? r.side : [])]);
    if (Array.isArray(r.hidden)) for (const id of DEFAULT.hidden) if (!known.has(id) && !hidden.includes(id)) hidden.push(id);
    return { order, hidden, side };
  } catch { return { ...DEFAULT, order: [...DEFAULT.order], side: [...DEFAULT_SIDE] }; }
}

export class Dock {
  /** Preferences > Workspace > Remember panel layout changes: off, the arrangement, sizes and floating places are not written. */
  static remember = true;
  private state = load();
  private readonly marker = el('<div class="cv-dock-marker" hidden></div>');
  private drag: { id: string; startY: number; moving: boolean; target: number; col: 'dock' | 'side'; x: number; y: number } | null = null;
  private suppressClick = false;
  onChange: (() => void) | null = null;

  /** The side column (its panels move to and from the dock), set by the app. */
  constructor(private readonly dock: HTMLElement, private readonly side: HTMLElement | null = null) {
    dock.appendChild(this.marker);
    for (const p of ALL_PANELS) this.wire(p);
    // A release anywhere ends a drag begun on a header (released off the header, it used to stay armed).
    window.addEventListener('pointerup', () => { if (this.drag) this.drop(); });
    window.addEventListener('resize', () => { if (this.frames.size) this.syncFloats(); });
    this.apply();
  }

  /** Headers already given the grip and the drag (once each, whenever the panel was registered). */
  private readonly wired = new WeakSet<HTMLElement>();

  /** Gives a panel's header the grip and the drag that moves it. The constructor does this for the panels that exist at
   *  start; apply() does it for any registered later (Form extension panels, groups made by detaching or tearing off a
   *  tab), which used to stay without a grip and could not be moved. */
  private wire(p: DockPanel): void {
    const section = this.section(p.id), head = section?.querySelector<HTMLElement>('.cv-panel-head');
    if (!section || !head || this.wired.has(head)) return;
    this.wired.add(head);
    // Every header shows where to grab: the dock's own non-group panels (Timeline, History) get the groups' grip.
    const own = section.querySelector<HTMLElement>(':scope > .cv-panel-head');
    if (own && !own.querySelector('.cv-group-grip')) own.prepend(el(`<span class="cv-group-grip" title="Drag to move the group" aria-hidden="true">${icon('grip', 14)}</span>`));
    head.classList.add('cv-dock-grip');
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.locked || (e.target as HTMLElement).closest('[data-cmd]')) return;
      // A tab in any panel group drags itself onto another group's header (PanelGroup); the grip and the bare header move the group.
      if (section.classList.contains('cv-group') && (e.target as HTMLElement).closest('.cv-group-tab')) return;
      if (this.floats[p.id]) return;   // a floating panel moves by its own bar
      // The pointer is captured only once the drag moves (move), so a plain click still reaches a tab in the header.
      this.drag = { id: p.id, startY: e.clientY, moving: false, target: -1, col: 'dock', x: e.clientX, y: e.clientY };
      // Movement is followed on the whole document until release: a quick flick leaves the header at once.
      document.addEventListener('pointermove', this.docMove, true);
    });
    head.addEventListener('pointermove', (e) => this.move(e));
    head.addEventListener('pointerup', () => this.drop());
    head.addEventListener('pointercancel', () => { this.drag = null; setHidden(this.marker, true); });
    // A drag ends with a click on the header; it must not also fold or unfold the panel.
    head.addEventListener('click', (e) => { if (this.suppressClick) { e.stopPropagation(); e.preventDefault(); this.suppressClick = false; } }, true);
  }

  /** Whether a panel already has a place in either column (kept from an earlier session or a drag). */
  isPlaced(id: string): boolean { return this.state.order.includes(id) || this.state.side.includes(id); }

  /** Places a panel right after another in the dock (after its last shown panel when that one is absent), unless it
   *  already has a place. */
  placeAfter(id: string, after: string): void {
    if (this.isPlaced(id)) return;
    const shown = this.dockIds().filter((x) => this.present(x)), i = shown.indexOf(after);
    this.insertPanel(id, 'dock', i >= 0 ? i + 1 : shown.length);
  }

  isShown(id: string): boolean { return !this.state.hidden.includes(id); }
  /** The arrangement as it stands, for Window > Workspace > New Workspace. */
  get layout(): { order: string[]; hidden: string[]; floats: Record<string, { x: number; y: number; w: number; h: number }> } { return { order: [...this.state.order], hidden: [...this.state.hidden], floats: this.floating }; }
  /** Shown and holding a tab (a group whose tabs all moved away is absent). */
  private visible(id: string): boolean { return this.isShown(id) && !this.section(id)?.classList.contains('is-empty'); }
  /** Visible and in a column (a floating panel has its own window). */
  private present(id: string): boolean { return this.visible(id) && !this.floats[id]; }
  /** Re-lays out the columns (tabs moved between groups). */
  refresh(): void { this.apply(); this.onChange?.(); }

  toggle(id: string): void {
    this.state.hidden = this.isShown(id) ? [...this.state.hidden, id] : this.state.hidden.filter((h) => h !== id);
    this.save();
  }

  /** Window > Reset Panels: the default order, every panel shown. */
  reset(): void { this.state = { order: [...DEFAULT.order], hidden: [...DEFAULT.hidden], side: [...DEFAULT_SIDE] }; this.heights = {}; this.saveHeights(); this.floats = {}; this.saveFloats(); this.save(); }

  /** The panels living in the dock, in order (everything not in the side column or floating). */
  private dockIds(): string[] { return this.state.order.filter((id) => !this.state.side.includes(id) && !this.floats[id]); }

  /** Floating panels (Window > Float Panel): each panel's own window, kept where it was left and remembered. The
   *  panel's element moves into its frame and back, never rebuilt. */
  private floats: Record<string, { x: number; y: number; w: number; h: number }> = (() => { try { const own = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { floats?: unknown }).floats; return cleanFloats(own ?? JSON.parse(localStorage.getItem(FLOATS_KEY) ?? '{}')); } catch { return {}; } })();
  private readonly frames = new Map<string, HTMLElement>();
  private saveFloats(): void { if (Dock.remember) try { const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>; s.floats = this.floats; localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* this session only */ } }
  /** The floating places as they stand, for a saved workspace. */
  get floating(): Record<string, { x: number; y: number; w: number; h: number }> { return JSON.parse(JSON.stringify(this.floats)) as Record<string, { x: number; y: number; w: number; h: number }>; }
  isFloating(id: string): boolean { return !!this.floats[id]; }
  floatingIds(): string[] { return Object.keys(this.floats); }
  /** The panel in a window of its own, at a place and size or where it last stood (a new one steps down the screen). */
  float(id: string, at: { x?: number; y?: number; w?: number; h?: number } = {}): boolean {
    if (!ALL_PANELS.some((p) => p.id === id)) return false;
    const n = Object.keys(this.floats).length, prev = this.floats[id];
    this.floats[id] = { x: at.x ?? prev?.x ?? 160 + 28 * n, y: at.y ?? prev?.y ?? 110 + 28 * n, w: at.w ?? prev?.w ?? 300, h: at.h ?? prev?.h ?? 380 };
    this.state.hidden = this.state.hidden.filter((h) => h !== id);
    if (!this.state.order.includes(id) && !this.state.side.includes(id)) this.state.order = [...this.state.order, id];
    this.saveFloats();
    this.save();
    return true;
  }
  /** A floating panel back in its column. */
  dockBack(id: string): boolean {
    if (!this.floats[id]) return false;
    delete this.floats[id];
    this.saveFloats();
    this.save();
    return true;
  }
  /** Shows the panel if hidden, opens the collapsed column for a docked one, and raises a floating one. */
  activate(id: string): boolean {
    if (!ALL_PANELS.some((p) => p.id === id)) return false;
    if (!this.isShown(id)) this.state.hidden = this.state.hidden.filter((h) => h !== id);
    if (!this.floats[id] && this.collapsed) this.setCollapsed(false);
    this.save();
    const f = this.frames.get(id);
    if (f && f.parentElement && f.parentElement.lastElementChild !== f) f.parentElement.appendChild(f);
    return true;
  }
  private makeFrame(p: DockPanel): HTMLElement {
    const f = el(`<div class="cv-float-panel" data-panel="${p.id}"><div class="cv-float-bar"><span class="cv-float-title"></span><button class="cv-float-dock" type="button" title="Dock back" aria-label="Dock back">${icon('collapseRight', 14)}</button></div></div>`);
    const bar = f.querySelector('.cv-float-bar') as HTMLElement;
    f.querySelector('.cv-float-dock')?.addEventListener('click', () => this.dockBack(p.id));
    f.addEventListener('pointerdown', () => { if (f.parentElement && f.parentElement.lastElementChild !== f) f.parentElement.appendChild(f); }, true);
    bar.addEventListener('pointerdown', (e) => {
      const r = this.floats[p.id];
      if (e.button !== 0 || !r || this.locked || (e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY, ox = r.x, oy = r.y;
      let onto: PanelGroup | null = null, gap: ReturnType<Dock['gapAt']> = null;
      const move = (m: PointerEvent): void => {
        r.x = Math.max(0, Math.min(window.innerWidth - Math.min(f.offsetWidth, window.innerWidth), ox + m.clientX - x0)); r.y = Math.max(0, Math.min(window.innerHeight - Math.min(f.offsetHeight, window.innerHeight), oy + m.clientY - y0)); f.style.left = `${Math.round(r.x)}px`; f.style.top = `${Math.round(r.y)}px`;
        // Dragged back over a docked group's tab strip, or a column's gap: the drop indicator says what a release does.
        const head = document.elementsFromPoint(m.clientX, m.clientY).find((n) => n.classList.contains('cv-group-head') && !f.contains(n)), own = this.ownGroup(p.id);
        const g = own && head ? PanelGroup.all.get((head.closest('.cv-group') as HTMLElement | null)?.dataset.group ?? '') ?? null : null;
        const next = g && g !== own ? g : null;
        if (next !== onto) { onto?.root.classList.remove('is-tab-target', 'is-tab-full'); onto = next; onto?.root.classList.add(onto.full ? 'is-tab-full' : 'is-tab-target'); }
        gap = onto ? null : this.gapAt(m.clientX, m.clientY);
        if (gap) this.placeMarker(gap, 'Dock here'); else if (!this.drag) setHidden(this.marker, true);
      };
      const up = (): void => {
        document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true);
        onto?.root.classList.remove('is-tab-target', 'is-tab-full');
        if (!this.drag) setHidden(this.marker, true);
        const own = this.ownGroup(p.id);
        if (onto && own && !onto.full) { for (const tid of own.tabIds) if (!onto.full) PanelGroup.moveTab(tid, own, onto); PanelGroup.saveHomes(); this.dockBack(p.id); return; }
        if (gap) { delete this.floats[p.id]; this.saveFloats(); this.insertPanel(p.id, gap.col, gap.index); return; }
        this.saveFloats();
      };
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
    });
    // The frame's own resize corner: the new size is remembered when the pointer is let go.
    f.addEventListener('pointerup', () => { const r = this.floats[p.id]; if (r && (Math.abs(f.offsetWidth - r.w) > 1 || Math.abs(f.offsetHeight - r.h) > 1)) { r.w = f.offsetWidth; r.h = f.offsetHeight; this.saveFloats(); } });
    (document.getElementById('overlay-root') ?? document.body).appendChild(f);
    return f;
  }
  /** Each floating panel's frame shown at its place with the panel in it; other frames hidden. */
  private syncFloats(): void {
    for (const p of ALL_PANELS) {
      const r = this.floats[p.id], s = this.section(p.id), on = !!r && !!s && this.visible(p.id);
      let f = this.frames.get(p.id);
      if (on && !f) { f = this.makeFrame(p); this.frames.set(p.id, f); }
      if (!f) continue;
      setHidden(f, !on);
      if (!on || !r || !s) continue;
      if (s.parentElement !== f) { f.appendChild(s); s.classList.remove('is-sized'); s.style.height = ''; }
      const title = f.querySelector('.cv-float-title') as HTMLElement;
      if (title.textContent !== p.label) title.textContent = p.label;
      const q = fit(r);
      const css: Array<[string, string]> = [['left', `${Math.round(q.x)}px`], ['top', `${Math.round(q.y)}px`], ['width', `${Math.round(q.w)}px`], ['height', `${Math.round(q.h)}px`]];
      for (const [k, v] of css) if (f.style.getPropertyValue(k) !== v) f.style.setProperty(k, v);
    }
  }
  /** The side column's panels, in order. */
  sideIds(): string[] { return [...this.state.side]; }
  /** How many panels the side column shows (none: the app hides the column). */
  sideShown(): number { return this.state.side.filter((id) => this.present(id)).length; }
  /** Window > Merge Panel Columns: the side column's panels join the dock, below its own; the side column goes. */
  merge(): void { this.state = { ...this.state, order: [...this.dockIds(), ...this.state.side], side: [] }; this.save(); }
  /** Window > Separate Panel Columns: the side column's own panels return to it. */
  separate(): void { this.state = { ...this.state, order: this.dockIds().filter((id) => !DEFAULT_SIDE.includes(id)), side: [...DEFAULT_SIDE] }; this.save(); }
  get merged(): boolean { return this.state.side.length === 0; }

  /** Group heights set by dragging a splitter (Phase 21, the target's resizable groups); Layers takes what is left. */
  private heights: Record<string, number> = (() => { try { const h = JSON.parse(localStorage.getItem(HEIGHTS_KEY) ?? '{}') as Record<string, unknown>; return Object.fromEntries(Object.entries(h).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number>; } catch { return {}; } })();
  private saveHeights(): void { if (Dock.remember) try { localStorage.setItem(HEIGHTS_KEY, JSON.stringify(this.heights)); } catch { /* this session only */ } }


  /** A workspace's arrangement (Phase 21): the panels in this order, these hidden; ids not in the dock are ignored. */
  arrange(order: readonly string[], hidden: readonly string[], floats: unknown = {}): void {
    const fl = cleanFloats(floats);
    const kept = Object.entries(this.floats).filter(([id]) => !DOCK_PANELS.some((p) => p.id === id) && !SIDE_PANELS.some((p) => p.id === id));
    this.floats = Object.fromEntries([...kept, ...Object.entries(fl).filter(([id]) => ALL_PANELS.some((p) => p.id === id))]);
    this.saveFloats();
    const ids = DOCK_PANELS.map((p) => p.id);
    const o = order.filter((id) => ids.includes(id));
    for (const id of ids) if (!o.includes(id)) o.push(id);
    // A panel the workspace does not name (the Info panel, newer than the workspaces) keeps its default: hidden if it comes hidden.
    const named = new Set([...order, ...hidden]), extra = DEFAULT.hidden.filter((id) => !named.has(id));
    this.state = { order: o, hidden: [...hidden, ...extra].filter((id) => ALL_PANELS.some((p) => p.id === id)), side: [...DEFAULT_SIDE] };
    this.save();
  }

  /** Lock Workspace (Phase 21, the target's lock button): while locked, panels are not dragged. Remembered. */
  get locked(): boolean { try { return localStorage.getItem('formvis.lock') === '1'; } catch { return false; } }
  set locked(on: boolean) { try { localStorage.setItem('formvis.lock', on ? '1' : '0'); } catch { /* this session only */ } this.dock.classList.toggle('is-locked', on); }

  /** A panel's element, wherever it is (either column, or opened from a strip). */
  private section(id: string): HTMLElement | null {
    const p = ALL_PANELS.find((x) => x.id === id);
    return p ? document.querySelector<HTMLElement>(p.selector) : null;
  }

  /** Sections moved into the saved order only when it differs (moved, never rebuilt), and shown or hidden. */
  /** The column collapsed to a strip of icons, as the target's (its « button): the collapse button on the first shown
   *  group's header, the expand button atop the strip, an icon per shown group opening it as a flyout beside the strip
   *  (its element moved there and back). Remembered; the app sets the column's width (onCollapse). */
  onCollapse: ((on: boolean) => void) | null = null;
  get collapsed(): boolean { try { return localStorage.getItem('formvis.dockCollapsed') === '1'; } catch { return false; } }
  setCollapsed(on: boolean): void {
    this.closeFly();
    try { localStorage.setItem('formvis.dockCollapsed', on ? '1' : '0'); } catch { /* this session only */ }
    this.dock.classList.toggle('is-collapsed', on);
    this.renderStrip();
    this.onCollapse?.(on);
  }
  private strip: HTMLElement | null = null;
  private fly: HTMLElement | null = null;
  private flyOpen: { s: HTMLElement; mark: Comment; btn: HTMLElement } | null = null;
  private collapseBtn: HTMLElement | null = null;
  private closeFly(): void {
    const o = this.flyOpen;
    if (!o) return;
    o.mark.replaceWith(o.s);
    o.btn.classList.remove('is-on');
    this.flyOpen = null;
    if (this.fly) setHidden(this.fly, true);
  }
  private renderStrip(): void {
    if (!this.strip) {
      this.strip = el('<div class="cv-dock-strip"></div>');
      this.dock.prepend(this.strip);
      this.fly = el('<div class="cv-props-fly cv-dock-fly" hidden></div>');
      (document.getElementById('overlay-root') ?? document.body).appendChild(this.fly);
      document.addEventListener('pointerdown', (e) => { if (this.flyOpen && !this.fly?.contains(e.target as Node) && !this.strip?.contains(e.target as Node)) this.closeFly(); }, true);
      document.addEventListener('keydown', (e) => { if (this.flyOpen && e.key === 'Escape') this.closeFly(); });
    }
    const strip = this.strip;
    strip.textContent = '';
    const expand = el<HTMLButtonElement>(`<button class="cv-strip-btn cv-strip-expand" type="button" title="Expand panels" aria-label="Expand panels">${icon('collapseLeft', 16)}</button>`);
    expand.addEventListener('click', () => this.setCollapsed(false));
    strip.appendChild(expand);
    const ICONS: Record<string, string> = { navigator: 'panelNav', swatches: 'swatchGrid', layers: 'layers', timeline: 'film', history: 'history', generate: 'generate' };
    for (const id of this.dockIds().filter((x) => this.present(x))) {
      const s = this.section(id), label = DOCK_PANELS.find((p) => p.id === id)?.label ?? id;
      if (!s) continue;
      const b = el<HTMLButtonElement>(`<button class="cv-strip-btn" type="button" title="${label}" aria-label="${label}">${icon(ICONS[id] ?? 'panelProps', 18)}</button>`);
      b.dataset.group = id;
      b.addEventListener('click', () => {
        if (this.flyOpen?.s === s) { this.closeFly(); return; }
        this.closeFly();
        const fly = this.fly as HTMLElement, mark = document.createComment(id);
        s.replaceWith(mark);
        fly.appendChild(s);
        setHidden(fly, false);
        this.flyOpen = { s, mark, btn: b };
        b.classList.add('is-on');
        const r = b.getBoundingClientRect(), st = strip.getBoundingClientRect();
        fly.style.right = `${Math.round(window.innerWidth - st.left + 6)}px`;
        fly.style.top = `${Math.round(Math.max(8, Math.min(r.top, window.innerHeight - fly.offsetHeight - 8)))}px`;
      });
      strip.appendChild(b);
    }
  }
  /** The collapse button sits on whichever shown group is first. */
  private placeCollapse(): void {
    if (!this.collapseBtn) {
      this.collapseBtn = el<HTMLButtonElement>(`<button class="cv-group-collapse cv-dock-collapse" type="button" title="Collapse to icons" aria-label="Collapse to icons">${icon('collapseRight', 14)}</button>`);
      this.collapseBtn.addEventListener('click', () => this.setCollapsed(true));
    }
    const first = this.dockIds().find((x) => this.present(x)), head = first ? this.section(first)?.querySelector(':scope > .cv-panel-head') : null;
    if (head && this.collapseBtn.parentElement !== head) head.appendChild(this.collapseBtn);
  }

  private apply(): void {
    this.closeFly();
    // Panels registered after start (extension panels, detached groups) get their header's grip and drag here, once.
    for (const p of ALL_PANELS) this.wire(p);
    // Each panel in its column, in order; moved only when the order differs, never rebuilt.
    const want = this.dockIds().map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    const current = Array.from(this.dock.children).filter((c) => want.includes(c as HTMLElement));
    if (want.some((s, i) => current[i] !== s)) for (const s of want) this.dock.insertBefore(s, this.marker);
    if (this.side) {
      const sideWant = this.state.side.filter((id) => !this.floats[id]).map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
      const sideNow = Array.from(this.side.children).filter((c) => sideWant.includes(c as HTMLElement));
      if (sideWant.some((s, i) => sideNow[i] !== s)) for (const s of sideWant) this.side.appendChild(s);
      for (const s of sideWant) { s.classList.remove('is-sized'); s.style.height = ''; }   // sizes are the dock's
    }
    for (const p of ALL_PANELS) { const s = this.section(p.id); if (s) setHidden(s, !this.visible(p.id)); }
    this.syncFloats();
    this.splitters();
    this.placeCollapse();
    this.dock.classList.toggle('is-collapsed', this.collapsed);
    if (this.collapsed) this.renderStrip();
  }

  /** A splitter between each pair of shown groups: dragging it sizes the group above, or the one below when the one
   *  above is Layers (which takes what is left); a double-click returns that group to its own height. */
  private shownGroups(): Array<{ id: string; s: HTMLElement }> {
    return this.dockIds().filter((id) => this.present(id)).map((id) => ({ id, s: this.section(id) })).filter((x): x is { id: string; s: HTMLElement } => !!x.s);
  }

  /** Each shown group at its set height, or its own; Layers always takes what is left. */
  private sizeGroups(): void {
    for (const { id, s } of this.shownGroups()) {
      const h = this.heights[id];
      const sized = id !== 'layers' && typeof h === 'number';
      s.classList.toggle('is-sized', sized);
      s.style.height = sized ? `${Math.round(h)}px` : '';
    }
  }

  private splitters(): void {
    for (const old of Array.from(this.dock.querySelectorAll(':scope > .cv-dock-split'))) old.remove();
    const shown = this.shownGroups();
    this.sizeGroups();
    for (let i = 0; i < shown.length - 1; i++) {
      const above = shown[i], below = shown[i + 1], target = above.id === 'layers' ? below : above, sign = above.id === 'layers' ? -1 : 1;
      const split = el(`<div class="cv-dock-split" role="separator" aria-orientation="horizontal" aria-label="Resize ${target.id}"></div>`);
      split.dataset.target = target.id;
      above.s.after(split);
      split.addEventListener('dblclick', () => { delete this.heights[target.id]; this.saveHeights(); this.sizeGroups(); });
      split.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || this.locked) return;
        e.preventDefault();
        split.setPointerCapture(e.pointerId);
        const y0 = e.clientY, h0 = target.s.getBoundingClientRect().height, head = target.s.querySelector('.cv-panel-head')?.getBoundingClientRect().height ?? 40;
        const layers = this.section('layers'), room = layers ? layers.getBoundingClientRect().height - 320 : 200;
        // Only the sizes change while dragging: rebuilding the splitters would drop this one and its pointer capture.
        const move = (ev: PointerEvent): void => { this.heights[target.id] = Math.max(head + 24, Math.min(h0 + Math.max(0, room), h0 + sign * (ev.clientY - y0))); this.sizeGroups(); };
        const up = (): void => { split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up); split.removeEventListener('pointercancel', up); this.saveHeights(); };
        split.addEventListener('pointermove', move); split.addEventListener('pointerup', up); split.addEventListener('pointercancel', up);
      });
    }
  }

  private save(): void {
    if (Dock.remember) try { localStorage.setItem(KEY, JSON.stringify({ ...this.state, floats: this.floats })); } catch { /* this session only */ }
    this.apply();
    this.onChange?.();
  }

  /** The drop index is the gap nearest the pointer among the shown sections; the marker sits in that gap. */
  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    // A drag whose button was let go elsewhere is over: hovering a header must not revive it (the stray marker).
    if ((e.buttons & 1) === 0) { this.drag = null; setHidden(this.marker, true); return; }
    if (!d.moving && Math.abs(e.clientY - d.startY) < 5) return;
    d.moving = true;
    d.x = e.clientX; d.y = e.clientY;
    const at = this.gapAt(e.clientX, e.clientY);
    // What is dragged, following the pointer; the marker says what a release does.
    if (!this.ghost) { this.ghost = el('<div class="cv-drag-ghost"></div>'); this.ghost.textContent = ALL_PANELS.find((p) => p.id === d.id)?.label ?? d.id; document.body.appendChild(this.ghost); }
    this.ghost.style.left = `${e.clientX + 12}px`; this.ghost.style.top = `${e.clientY + 10}px`;
    // Past both columns the panel is torn off: an outline shows where its window would open.
    if (!at) { d.target = FLOAT; setHidden(this.marker, true); this.floatHint(e.clientX, e.clientY, d.id); return; }
    this.floatHint(null, 0, d.id);
    d.target = at.index;
    d.col = at.col;
    this.placeMarker(at, 'Move here');
  }

  private hint: HTMLElement | null = null;
  /** Where a panel released over the canvas would float: an outline the size of its window, patched in place (null hides it). */
  floatHint(x: number | null, y: number, id: string): void {
    if (x === null) { if (this.hint) setHidden(this.hint, true); return; }
    if (!this.hint) { this.hint = el('<div class="cv-float-hint" hidden></div>'); (document.getElementById('overlay-root') ?? document.body).appendChild(this.hint); }
    const r = this.floats[id], w = r?.w ?? 300, h = r?.h ?? 380;
    const css: Array<[string, string]> = [['left', `${Math.round(Math.max(0, Math.min(window.innerWidth - 80, x - 40)))}px`], ['top', `${Math.round(Math.max(0, Math.min(window.innerHeight - 40, y - 12)))}px`], ['width', `${Math.round(w)}px`], ['height', `${Math.round(h)}px`]];
    for (const [k, v] of css) if (this.hint.style.getPropertyValue(k) !== v) this.hint.style.setProperty(k, v);
    setHidden(this.hint, false);
  }
  /** A tab group released over neither column floats whole at the pointer, or a tab pulled out of a group of several first becomes a group of its own (set by the app). */
  tearOff(id: string, x: number, y: number): boolean { return this.gapAt(x, y) ? false : this.float(id, { x: x - 40, y: y - 12 }); }
  /** The tab group that a panel is (a plain panel is none). */
  private ownGroup(id: string): PanelGroup | undefined { return PanelGroup.all.get(this.section(id)?.dataset.group ?? ''); }

  private ghost: HTMLElement | null = null;
  /** The column and the gap among its shown panels nearest a point: the side column's when over it (and open), else the
   *  dock's; null outside both. Group drags and tab drags (a new group) use the same. */
  gapAt(x: number, y: number): { col: 'dock' | 'side'; index: number; host: HTMLElement; y: number } | null {
    const sr = this.side && !this.side.hidden && !this.side.classList.contains('is-collapsed') ? this.side.getBoundingClientRect() : null;
    const dr = this.dock.getBoundingClientRect();
    const col: 'dock' | 'side' | null = sr && x >= sr.left && x <= sr.right ? 'side' : x >= dr.left && x <= dr.right ? 'dock' : null;
    if (!col) return null;
    const host = col === 'side' ? this.side as HTMLElement : this.dock;
    const shown = (col === 'side' ? this.state.side : this.dockIds()).filter((id) => this.present(id)).map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    const box = host.getBoundingClientRect();
    let best = 0, bestDist = Infinity, gy = box.top + 2;
    for (let i = 0; i <= shown.length && shown.length; i++) {
      const gap = i < shown.length ? shown[i].getBoundingClientRect().top : shown[shown.length - 1].getBoundingClientRect().bottom;
      const dist = Math.abs(y - gap);
      if (dist < bestDist) { bestDist = dist; best = i; gy = gap; }
    }
    return { col, index: best, host, y: gy };
  }
  private placeMarker(at: { host: HTMLElement; y: number }, label: string): void {
    if (this.marker.parentElement !== at.host) at.host.appendChild(this.marker);
    this.marker.dataset.label = label;
    this.marker.style.top = `${Math.round(at.y - at.host.getBoundingClientRect().top + at.host.scrollTop - 1)}px`;
    setHidden(this.marker, false);
  }
  /** A tab dragged over a gap: where a new group would go. */
  showGap(x: number, y: number, label: string): void { const at = this.gapAt(x, y); if (at) this.placeMarker(at, label); else setHidden(this.marker, true); }
  hideGap(): void { if (!this.drag) setHidden(this.marker, true); }
  /** A new group into a column at a gap (index among the shown panels). */
  insertPanel(id: string, col: 'dock' | 'side', index: number): void {
    const list = col === 'side' ? this.state.side : this.dockIds();
    const before = list.filter((x) => this.present(x))[index] ?? null;
    const side = this.state.side.filter((x) => x !== id), order = this.state.order.filter((x) => x !== id);
    const into = col === 'side' ? side : order, at = before ? into.indexOf(before) : into.length;
    into.splice(at < 0 ? into.length : at, 0, id);
    this.state = { ...this.state, side, order };
    this.save();
  }
  removePanel(id: string, forget = true): void { if (!forget) { this.apply(); return; } if (this.floats[id]) { delete this.floats[id]; this.saveFloats(); } this.state = { ...this.state, side: this.state.side.filter((x) => x !== id), order: this.state.order.filter((x) => x !== id), hidden: this.state.hidden.filter((x) => x !== id) }; this.save(); }

  private readonly docMove = (e: PointerEvent): void => { if (this.drag) this.move(e); else document.removeEventListener('pointermove', this.docMove, true); };

  private drop(): void {
    const d = this.drag;
    this.drag = null;
    this.ghost?.remove();
    this.ghost = null;
    document.removeEventListener('pointermove', this.docMove, true);
    setHidden(this.marker, true);
    this.floatHint(null, 0, '');
    if (this.marker.parentElement !== this.dock) this.dock.appendChild(this.marker);
    if (d?.moving && d.target === FLOAT) { this.float(d.id, { x: d.x - 40, y: d.y - 12 }); return; }
    if (!d || !d.moving || d.target < 0) return;
    // The click that follows this release (same task) must not fold the panel; released off the header, no click comes,
    // and the flag used to stay set and swallow the next real click on that header (Minimize after a drag did nothing).
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; }, 0);
    // Into the column it was dropped in, before the panel it was dropped above (or at the end).
    const list = d.col === 'side' ? this.state.side : this.dockIds();
    const shown = list.filter((id) => this.present(id));
    const before = shown[d.target] ?? null;
    if (before === d.id) return;
    const side = this.state.side.filter((id) => id !== d.id), order = this.state.order.filter((id) => id !== d.id);
    const into = d.col === 'side' ? side : order;
    const at = before ? into.indexOf(before) : into.length;
    into.splice(at < 0 ? into.length : at, 0, d.id);
    this.state = { ...this.state, side, order };
    if (this.marker.parentElement !== this.dock) this.dock.appendChild(this.marker);
    this.save();
  }
}

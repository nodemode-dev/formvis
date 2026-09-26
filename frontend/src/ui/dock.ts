import { el, setHidden } from './dom';

/** The side dock's panels, arranged as Photoshop's: drag a panel by its header to move it up or down the dock (a line
 *  shows where it will land), show or hide panels from the Window menu, and have the arrangement remembered on this
 *  device. Sourced in the planning notes' workspace research (Adobe's "Arrange and group panels" and "Dock or undock
 *  panels"; TeachUcomp). Every panel in the side dock moves, the Layers panel included; floating panels and grouping into
 *  tabs come later. */
export interface DockPanel { id: string; label: string; selector: string }
export const DOCK_PANELS: readonly DockPanel[] = [
  { id: 'navigator', label: 'Navigator', selector: '.cv-navigator' },
  { id: 'swatches', label: 'Swatches', selector: '.cv-swatches' },
  { id: 'layers', label: 'Layers', selector: '.cv-layers-panel' },
  { id: 'timeline', label: 'Timeline', selector: '.cv-timeline' },
  { id: 'history', label: 'History', selector: '.cv-history' },
];
interface DockState { order: string[]; hidden: string[] }
const KEY = 'sonny.dock';
const DEFAULT: DockState = { order: DOCK_PANELS.map((p) => p.id), hidden: [] };

function load(): DockState {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DockState>;
    const ids = DOCK_PANELS.map((p) => p.id);
    const order = Array.isArray(r.order) ? r.order.filter((id): id is string => ids.includes(id as string)) : [];
    // A panel missing from a saved arrangement (one saved before it could move) takes its default place, not the end.
    for (const id of ids) if (!order.includes(id)) order.splice(Math.min(ids.indexOf(id), order.length), 0, id);
    const hidden = Array.isArray(r.hidden) ? r.hidden.filter((id): id is string => ids.includes(id as string)) : [];
    return { order, hidden };
  } catch { return { ...DEFAULT, order: [...DEFAULT.order] }; }
}

export class Dock {
  private state = load();
  private readonly marker = el('<div class="cv-dock-marker" hidden></div>');
  private drag: { id: string; startY: number; moving: boolean; target: number } | null = null;
  private suppressClick = false;
  onChange: (() => void) | null = null;

  constructor(private readonly dock: HTMLElement) {
    dock.appendChild(this.marker);
    for (const p of DOCK_PANELS) {
      const section = this.section(p.id), head = section?.querySelector<HTMLElement>('.cv-panel-head');
      if (!head) continue;
      head.classList.add('cv-dock-grip');
      head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || this.locked || (e.target as HTMLElement).closest('[data-cmd]')) return;
        // The pointer is captured only once the drag moves (move), so a plain click still reaches a tab in the header.
        this.drag = { id: p.id, startY: e.clientY, moving: false, target: -1 };
      });
      head.addEventListener('pointermove', (e) => this.move(e));
      head.addEventListener('pointerup', () => this.drop());
      head.addEventListener('pointercancel', () => { this.drag = null; setHidden(this.marker, true); });
      // A drag ends with a click on the header; it must not also fold or unfold the panel.
      head.addEventListener('click', (e) => { if (this.suppressClick) { e.stopPropagation(); e.preventDefault(); this.suppressClick = false; } }, true);
    }
    this.apply();
  }

  isShown(id: string): boolean { return !this.state.hidden.includes(id); }

  toggle(id: string): void {
    this.state.hidden = this.isShown(id) ? [...this.state.hidden, id] : this.state.hidden.filter((h) => h !== id);
    this.save();
  }

  /** Window > Reset Panels: the default order, every panel shown. */
  reset(): void { this.state = { order: [...DEFAULT.order], hidden: [] }; this.save(); }

  /** A workspace's arrangement (Phase 21): the panels in this order, these hidden; ids not in the dock are ignored. */
  arrange(order: readonly string[], hidden: readonly string[]): void {
    const ids = DOCK_PANELS.map((p) => p.id);
    const o = order.filter((id) => ids.includes(id));
    for (const id of ids) if (!o.includes(id)) o.push(id);
    this.state = { order: o, hidden: hidden.filter((id) => ids.includes(id)) };
    this.save();
  }

  /** Lock Workspace (Phase 21, the target's lock button): while locked, panels are not dragged. Remembered. */
  get locked(): boolean { try { return localStorage.getItem('sonny.lock') === '1'; } catch { return false; } }
  set locked(on: boolean) { try { localStorage.setItem('sonny.lock', on ? '1' : '0'); } catch { /* this session only */ } this.dock.classList.toggle('is-locked', on); }

  private section(id: string): HTMLElement | null {
    const p = DOCK_PANELS.find((x) => x.id === id);
    return p ? this.dock.querySelector<HTMLElement>(p.selector) : null;
  }

  /** Sections moved into the saved order only when it differs (moved, never rebuilt), and shown or hidden. */
  private apply(): void {
    const want = this.state.order.map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    const current = Array.from(this.dock.children).filter((c) => want.includes(c as HTMLElement));
    if (want.some((s, i) => current[i] !== s)) for (const s of want) this.dock.insertBefore(s, this.marker);
    for (const id of this.state.order) { const s = this.section(id); if (s) setHidden(s, !this.isShown(id)); }
  }

  private save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* this session only */ }
    this.apply();
    this.onChange?.();
  }

  /** The drop index is the gap nearest the pointer among the shown sections; the marker sits in that gap. */
  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moving && Math.abs(e.clientY - d.startY) < 5) return;
    if (!d.moving) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    d.moving = true;
    const shown = this.state.order.filter((id) => this.isShown(id)).map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    const box = this.dock.getBoundingClientRect();
    let best = 0, bestDist = Infinity, y = 0;
    for (let i = 0; i <= shown.length; i++) {
      const gap = i < shown.length ? shown[i].getBoundingClientRect().top : shown[shown.length - 1].getBoundingClientRect().bottom;
      const dist = Math.abs(e.clientY - gap);
      if (dist < bestDist) { bestDist = dist; best = i; y = gap; }
    }
    d.target = best;
    this.marker.style.top = `${Math.round(y - box.top - 1)}px`;
    setHidden(this.marker, false);
  }

  private drop(): void {
    const d = this.drag;
    this.drag = null;
    setHidden(this.marker, true);
    if (!d || !d.moving || d.target < 0) return;
    this.suppressClick = true;
    const shown = this.state.order.filter((id) => this.isShown(id));
    const before = shown[d.target] ?? null;
    const rest = this.state.order.filter((id) => id !== d.id);
    const at = before && before !== d.id ? rest.indexOf(before) : before === d.id ? this.state.order.indexOf(d.id) : rest.length;
    rest.splice(at, 0, d.id);
    this.state.order = rest;
    this.save();
  }
}

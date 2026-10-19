import { tabName, type Engine, type Project } from '../engine';
import { el, patchList, q, setClass, setStyleVar, setText, setTitle } from './dom';
import { icon } from './icons';

export class Tabs {
  private frame = 0;                       // a pending animation frame
  private activeId: string | null = null;
  /** The document that was current when the engine went busy: its tab shows a progress line under it. */
  private busyId: string | null = null;
  /** Pinned documents sit first in the strip, show a pin where the close button is, and are kept by Close All and Close Others. */
  private readonly pinnedIds = new Set<string>();

  isPinned(id: string): boolean { return this.pinnedIds.has(id); }

  togglePin(id: string): void {
    const list = this.engine.projects, at = list.findIndex((p) => p.id === id);
    if (at < 0) return;
    if (!this.pinnedIds.delete(id)) this.pinnedIds.add(id);
    const [moved] = list.splice(at, 1);
    let to = 0;
    while (to < list.length && this.pinnedIds.has(list[to].id)) to++;
    list.splice(to, 0, moved);
    this.engine.emit('projects', null);
  }

  constructor(private readonly strip: HTMLElement, private readonly engine: Engine, private readonly requestClose: (id: string) => void, onMenu?: (id: string, x: number, y: number) => void) {
    engine.on('projects', () => this.queue());
    engine.on('history', () => this.queue());
    engine.on('busy', (on) => { this.busyId = on ? engine.current?.id ?? null : null; this.queue(); });
    engine.on('progress', () => this.queue());
    const tabOf = (e: Event): HTMLElement | null => (e.target as HTMLElement).closest<HTMLElement>('.cv-tab[data-key]');
    strip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const t = tabOf(e);
      if (!t || (e.target as HTMLElement).closest('.cv-tab-close')) return;
      this.engine.switchTo(t.dataset.key as string);
      this.dragTab(e, t);
    });
    strip.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const t = tabOf(e);
      if (!t) return;
      e.preventDefault();
      if (!this.pinnedIds.has(t.dataset.key as string)) this.requestClose(t.dataset.key as string);
    });
    strip.addEventListener('contextmenu', (e) => {
      const t = tabOf(e);
      if (!t || !onMenu) return;
      e.preventDefault();
      this.engine.switchTo(t.dataset.key as string);
      onMenu(t.dataset.key as string, e.clientX, e.clientY);
    });
    strip.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.cv-tab-close')) return;
      const t = tabOf(e);
      if (t) this.requestClose(t.dataset.key as string);
    });
    this.render();
  }

  /** Dragging a tab along the strip moves its document to where the pointer is; the tabs follow in place. */
  private dragTab(down: PointerEvent, tab: HTMLElement): void {
    const id = tab.dataset.key as string, x0 = down.clientX;
    let moving = false;
    const move = (e: PointerEvent): void => {
      if (!moving) { if (Math.abs(e.clientX - x0) < 6) return; moving = true; setClass(tab, 'is-dragging', true); }
      const over = Array.from(this.strip.children).find((c) => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; }) as HTMLElement | undefined;
      const to = over?.dataset.key, list = this.engine.projects;
      if (!to || to === id || this.pinnedIds.has(to) !== this.pinnedIds.has(id)) return;
      const from = list.findIndex((p) => p.id === id), at = list.findIndex((p) => p.id === to);
      if (from < 0 || at < 0) return;
      list.splice(at, 0, list.splice(from, 1)[0]);
      this.render();
    };
    const up = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      setClass(tab, 'is-dragging', false);
      if (moving) this.engine.emit('projects', null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  private render(): void {
    const current = this.engine.current;
    for (const id of this.pinnedIds) if (!this.engine.projects.some((p) => p.id === id)) this.pinnedIds.delete(id);
    // The tabs after one that arrives or leaves, and the new-document button after the strip, are held where they were
    // by a transform and eased into place (FLIP, as the Layers rows since 1.38.0), so a document that opens with no
    // click just before it (a drop, an import finishing) does not make the bar jump; browsers do not count movement by
    // transform as a layout shift.
    const movers = (): HTMLElement[] => [...(Array.from(this.strip.children) as HTMLElement[]), ...(this.strip.nextElementSibling instanceof HTMLElement ? [this.strip.nextElementSibling] : [])];
    const count = this.strip.children.length, before = new Map<Element, number>();
    for (const n of movers()) before.set(n, n.getBoundingClientRect().left);
    patchList(this.strip, this.engine.projects, {
      key: (p) => p.id,
      create: (p) => {
        const n = el(`<div class="cv-tab" role="tab"><span class="cv-tab-pin">${icon('pin', 11)}</span><span class="cv-tab-dot"></span><span class="cv-tab-name"></span><span class="cv-tab-mode" title="RGB, 8 bits a channel">RGB/8</span><button class="cv-tab-close" type="button" aria-label="Close tab">${icon('close', 12)}</button></div>`);
        n.dataset.key = p.id;
        this.update(n, p, current);
        return n;
      },
      update: (n, p) => this.update(n, p, current),
    });
    // From no tabs to one counts too: the new-document button moves along either way.
    if (this.strip.children.length !== count) {
      const moved: HTMLElement[] = [];
      for (const n of movers()) {
        const was = before.get(n);
        if (was === undefined) continue;
        const dx = Math.round(was - n.getBoundingClientRect().left);
        if (!dx) continue;
        setClass(n, 'is-settling', false);
        setStyleVar(n, '--flip-x', `${dx}px`);
        moved.push(n);
      }
      if (moved.length) requestAnimationFrame(() => { for (const n of moved) { setClass(n, 'is-settling', true); setStyleVar(n, '--flip-x', '0px'); } });
    }
    // The window's title follows the document: its name, a dot while unsaved, then the app's name.
    const title = current ? `${current.modified ? '• ' : ''}${tabName(current.name, current.doc.meta)} - formvis` : 'formvis';
    if (document.title !== title) {
      document.title = title;
      if ('__TAURI_INTERNALS__' in window) void import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().setTitle(title)).catch(() => undefined);
    }
    // Keep the tab of the current document in view when it changes.
    if ((current?.id ?? null) !== this.activeId) {
      this.activeId = current?.id ?? null;
      const t = this.activeId ? this.strip.querySelector<HTMLElement>(`.cv-tab[data-key="${this.activeId}"]`) : null;
      t?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  private update(n: HTMLElement, p: Project, current: Project | null): void {
    setText(q(n, '.cv-tab-name'), tabName(p.name, p.doc.meta));   // the copyright symbol before the title when Copyrighted (29.2)
    // The document's real mode (1.50.2): RGB/8, Gray/8, Bitmap/1 or Index.
    const md = p.doc.mode ?? 'rgb', mEl = q(n, '.cv-tab-mode');
    const bits = p.doc.depth ?? 8;   // the real depth in every mode that has one (1.57.8)
    setText(mEl, { rgb: `RGB/${bits}`, grayscale: `Gray/${bits}`, bitmap: 'Bitmap/1', indexed: 'Index', cmyk: `CMYK/${bits}`, lab: `Lab/${bits}`, duotone: `Duotone/${bits}`, multichannel: `Multi/${bits}` }[md]);
    const tip = { rgb: 'RGB, 8 bits a channel', grayscale: 'Grayscale, 8 bits', bitmap: 'Bitmap, 1 bit', indexed: `Indexed Color, ${p.doc.palette?.length ?? 0} colours`, cmyk: `CMYK, 8 bits a channel, ${p.doc.profile?.name ?? 'no profile'}`, lab: 'Lab, D50, held as floats', duotone: `Duotone, ${p.doc.duotone?.inks.length ?? 1} ink${(p.doc.duotone?.inks.length ?? 1) === 1 ? '' : 's'} over grey`, multichannel: `Multichannel, ${p.doc.multichannel?.channels.length ?? 0} channels` }[md];
    if (mEl.getAttribute('title') !== tip) mEl.setAttribute('title', tip);
    const active = !!current && p.id === current.id;
    setClass(n, 'is-active', active);
    setClass(n, 'is-dirty', !!p.modified);
    setClass(n, 'is-pinned', this.pinnedIds.has(p.id));
    const busy = this.busyId === p.id && this.engine.busy, tp = this.engine.taskProgress;
    setClass(n, 'is-busy', busy);
    setStyleVar(n, '--tab-progress', busy && tp.total > 0 ? `${Math.round((tp.done / tp.total) * 100)}%` : '');
    const sel = active ? 'true' : 'false';
    if (n.getAttribute('aria-selected') !== sel) n.setAttribute('aria-selected', sel);
    setTitle(n, p.libraryName ? `${p.name} · saved in the library` : `${p.name} · not saved yet`);
  }
}

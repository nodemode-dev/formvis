import type { Engine, Project } from '../engine';
import { el, patchList, q, setClass, setStyleVar, setText, setTitle } from './dom';
import { icon } from './icons';

export class Tabs {
  private frame = 0;
  private activeId: string | null = null;

  constructor(private readonly strip: HTMLElement, private readonly engine: Engine, private readonly requestClose: (id: string) => void) {
    for (const k of ['projects', 'history'] as const) engine.on(k, () => this.queue());
    strip.addEventListener('pointerdown', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('.cv-tab');
      if (!tab?.dataset.key) return;
      if ((e.target as HTMLElement).closest('.cv-tab-close')) return;
      if (e.button === 0) engine.switchTo(tab.dataset.key);
    });
    strip.addEventListener('auxclick', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('.cv-tab');
      if (e.button === 1 && tab?.dataset.key) { e.preventDefault(); requestClose(tab.dataset.key); }
    });
    strip.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('.cv-tab');
      if (tab?.dataset.key && (e.target as HTMLElement).closest('.cv-tab-close')) requestClose(tab.dataset.key);
    });
    this.render();
  }

  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  private render(): void {
    const current = this.engine.current;
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
        const n = el(`<div class="cv-tab" role="tab"><span class="cv-tab-dot"></span><span class="cv-tab-name"></span><span class="cv-tab-mode" title="RGB, 8 bits a channel">RGB/8</span><button class="cv-tab-close" type="button" aria-label="Close tab">${icon('close', 12)}</button></div>`);
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
    const id = current?.id ?? null;
    if (id !== this.activeId) {
      this.activeId = id;
      const n = id ? this.strip.querySelector<HTMLElement>(`[data-key="${id}"]`) : null;
      n?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  private update(n: HTMLElement, p: Project, current: Project | null): void {
    setText(q(n, '.cv-tab-name'), p.name);
    setClass(n, 'is-active', p === current);
    setClass(n, 'is-dirty', p.modified);
    n.setAttribute('aria-selected', String(p === current));
    setTitle(n, p.libraryName ? `${p.name} · saved in the library` : `${p.name} · not saved yet`);
  }
}

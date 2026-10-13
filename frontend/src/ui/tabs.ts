import { tabName, type Engine, type Project } from '../engine';
import { el, patchList, q, setClass, setStyleVar, setText, setTitle } from './dom';
import { icon } from './icons';

export class Tabs {
  private frame = 0;                       // a pending animation frame
  private activeId: string | null = null;

  constructor(private readonly strip: HTMLElement, private readonly engine: Engine, private readonly requestClose: (id: string) => void) {
    engine.on('projects', () => this.queue());
    engine.on('history', () => this.queue());
    const tabOf = (e: Event): HTMLElement | null => (e.target as HTMLElement).closest<HTMLElement>('.cv-tab[data-key]');
    strip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const t = tabOf(e);
      if (!t || (e.target as HTMLElement).closest('.cv-tab-close')) return;
      this.engine.switchTo(t.dataset.key as string);
    });
    strip.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const t = tabOf(e);
      if (!t) return;
      e.preventDefault();
      this.requestClose(t.dataset.key as string);
    });
    strip.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.cv-tab-close')) return;
      const t = tabOf(e);
      if (t) this.requestClose(t.dataset.key as string);
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
    setText(mEl, { rgb: `RGB/${bits}`, grayscale: `Gray/${bits}`, bitmap: 'Bitmap/1', indexed: 'Index', cmyk: `CMYK/${bits}`, lab: `Lab/${bits}` }[md]);
    const tip = { rgb: 'RGB, 8 bits a channel', grayscale: 'Grayscale, 8 bits', bitmap: 'Bitmap, 1 bit', indexed: `Indexed Color, ${p.doc.palette?.length ?? 0} colours`, cmyk: `CMYK, 8 bits a channel, ${p.doc.profile?.name ?? 'no profile'}`, lab: 'Lab, D50, held as floats' }[md];
    if (mEl.getAttribute('title') !== tip) mEl.setAttribute('title', tip);
    const active = !!current && p.id === current.id;
    setClass(n, 'is-active', active);
    setClass(n, 'is-dirty', !!p.modified);
    const sel = active ? 'true' : 'false';
    if (n.getAttribute('aria-selected') !== sel) n.setAttribute('aria-selected', sel);
    setTitle(n, p.libraryName ? `${p.name} · saved in the library` : `${p.name} · not saved yet`);
  }
}

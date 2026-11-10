import type { Engine } from '../engine';
import { el, setClass, setDisabled, setHidden, setText, swapMedia } from './dom';
import { HomeFiles } from './home-files';
import { icon } from './icons';
import { DEMOS, demoCover } from '../demos';

/** The Home screen: New and Open, and the files browser (Recent, Projects, Outputs as thumbnails or a list; 1.87.1),
 *  shown over the canvas at launch while no document is open (Preferences > General, "Show Home screen at launch")
 *  and, once a document has been open, when the last one closes only if "Show Home screen when the last document
 *  closes" is on (off by default: closing leaves the empty workspace with its panels). The brand mark is its Home
 *  button at any time; Esc leaves it while a document is open. */
export interface HomeDeps {
  engine: Engine;
  autoShow: () => boolean;
  afterClose: () => boolean;
  recent: () => string[];
  openRecent: (name: string) => void;
  openPath: (path: string) => void;
  removeRecent: (name: string) => void;
  run: (command: string) => void;
  /** Opens a demo of frontend/src/demos by id (Start's Demos cards). */
  openDemo: (id: string) => void;
}

export class HomeScreen {
  readonly root = el('<section class="cv-home" aria-label="Home" hidden></section>');
  /** Each page's file browser: Start's short Recent grid and the Recent, Projects and Outputs pages. */
  private readonly pages = new Map<Page, HomeFiles>();
  private page: Page = 'start';
  private forced = false;
  private lastCount = 0;
  private hadDocument = false;
  private building: string | null = null;
  private back!: HTMLElement;

  /** Home (1.87.3): a navigation column (Start, Recent, Projects, Outputs with counts; Create; Preferences and Help at
   *  its foot) beside a main area. Start has a greeting with Open and New document, a drop zone listing what opens, a
   *  short Recent grid with See all, and new document sizes. Every page is built once; switching pages toggles them. */
  constructor(host: HTMLElement, private readonly d: HomeDeps) {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
    const navItem = (v: Page, ic: string, label: string): string => `<button class="cv-home-nav-item" type="button" data-v="${v}">${icon(ic, 16)}<span>${label}</span>${v === 'start' ? '' : '<span class="cv-home-count">0</span>'}</button>`;
    const cmdItem = (cmd: string, ic: string, label: string): string => `<button class="cv-home-nav-item" type="button" data-cmd="${cmd}">${icon(ic, 16)}<span>${label}</span></button>`;
    const key = (k: string): string => `<kbd class="cv-key">${mod}</kbd><kbd class="cv-key">${k}</kbd>`;
    const formats = ['FVD', 'PSD', 'PSB', 'TIFF', 'PNG', 'JPEG', 'WEBP', 'HEIC', 'EXR', 'HDR', 'ORA', 'RAW'].map((f) => `<span class="cv-home-format">${f}</span>`).join('');
    const demos = DEMOS.map((d) => `<button class="cv-home-demo" type="button" data-demo-open="${d.id}" aria-busy="false"><span class="cv-home-demo-pic"><img data-src="${demoCover(d)}" alt="" width="320" height="180" decoding="async" draggable="false"></span><span class="cv-home-demo-title">${d.title}</span><span>${d.blurb}</span></button>`).join('');
    const sizes = PRESETS.map((p, i) => `<button class="cv-home-size" type="button" data-size="${i}"><span class="cv-home-size-box"><span style="aspect-ratio: ${p.w} / ${p.h}"></span></span><span class="cv-home-size-name">${p.name}</span><span class="cv-home-size-meta">${p.w} x ${p.h} px${p.ppi !== 72 ? ` · ${p.ppi} ppi` : ''}</span></button>`).join('');
    this.root.innerHTML = `<nav class="cv-home-nav" aria-label="Home">
      <div class="cv-home-brand">formvis <span>by nodemode.ai</span></div>
      ${navItem('start', 'image', 'Start')}${navItem('recent', 'history', 'Recent')}${navItem('projects', 'folder', 'Projects')}${navItem('outputs', 'download', 'Outputs')}
      <div class="cv-home-nav-sep"></div>
      <div class="cv-home-nav-title">Create</div>
      ${cmdItem('new', 'newFile', 'New document')}${cmdItem('open', 'folderOpen', 'Open')}${cmdItem('generate-image', 'generate', 'Generate image')}
      <div class="cv-home-nav-foot"><button class="cv-home-nav-item cv-home-back" type="button" data-back hidden>${icon('chevronLeft', 16)}<span>Back to Canvas</span></button>${cmdItem('settings', 'settings', 'Preferences')}${cmdItem('help', 'info', 'Help')}</div>
    </nav>
    <div class="cv-home-main">
      <div class="cv-home-narrow">${navItem('start', 'image', 'Start')}${navItem('recent', 'history', 'Recent')}${navItem('projects', 'folder', 'Projects')}${navItem('outputs', 'download', 'Outputs')}</div>
      <div class="cv-home-page" data-page="start">
        <div class="cv-home-head"><div><h1 class="cv-home-title"></h1><p class="cv-home-sub">Open a picture or a project, or start a new document.</p></div></div>
        <div class="cv-home-hero">
          <span class="cv-home-hero-icon">${icon('image', 26)}</span>
          <div class="cv-home-hero-text"><div class="cv-home-hero-title">Start from a picture</div>
            <div class="cv-home-hero-sub">Drop photos, layered files or camera raw anywhere in the window to open them. Projects open with every layer, mask and adjustment still editable.</div>
            <div class="cv-home-formats">${formats}</div></div>
          <div class="cv-home-hero-actions">
            <button class="cv-home-action is-primary" type="button" data-cmd="new">${icon('newFile', 16)}<span class="cv-home-label">New document...</span>${key('N')}</button>
            <button class="cv-home-action" type="button" data-cmd="open">${icon('folderOpen', 16)}<span class="cv-home-label">Open...</span>${key('O')}</button>
            <button class="cv-home-action is-ghost" type="button" data-cmd="generate-image">${icon('generate', 16)}<span class="cv-home-label">Generate an image</span></button>
          </div>
        </div>
        <section class="cv-home-section" data-home-section="demos"><div class="cv-home-section-head"><h2 class="cv-home-section-title">Demos</h2><span class="cv-home-note">Each opens as new, unsaved documents. Nothing of yours is changed.</span></div><div class="cv-home-demos">${demos}</div></section>
        <section class="cv-home-section"><div class="cv-home-section-head"><h2 class="cv-home-section-title">Recent</h2><button class="cv-btn cv-btn-ghost" type="button" data-v="recent">See all</button></div><div class="cv-home-slot" data-slot="start"></div></section>
        <section class="cv-home-section"><div class="cv-home-section-head"><h2 class="cv-home-section-title">New document</h2><button class="cv-btn cv-btn-ghost" type="button" data-cmd="new">More sizes...</button></div><div class="cv-home-sizes">${sizes}</div></section>
      </div>
      <div class="cv-home-page" data-page="recent" hidden><div class="cv-home-head"><div><h1 class="cv-home-title">Recent</h1><p class="cv-home-sub">Projects and pictures you opened or saved, newest first.</p></div></div><div class="cv-home-slot" data-slot="recent"></div></div>
      <div class="cv-home-page" data-page="projects" hidden><div class="cv-home-head"><div><h1 class="cv-home-title">Projects</h1><p class="cv-home-sub">Everything in the project library folder.</p></div><div class="cv-home-head-actions"><button class="cv-btn" type="button" data-cmd="settings">${icon('folder', 14)}Library folder...</button></div></div><div class="cv-home-slot" data-slot="projects"></div></div>
      <div class="cv-home-page" data-page="outputs" hidden><div class="cv-home-head"><div><h1 class="cv-home-title">Outputs</h1><p class="cv-home-sub">Pictures and files you exported, newest first.</p></div></div><div class="cv-home-slot" data-slot="outputs"></div></div>
    </div>`;
    this.back = this.root.querySelector('[data-back]') as HTMLElement;
    const deps = { recent: d.recent, openRecent: d.openRecent, openPath: d.openPath, removeRecent: d.removeRecent };
    const count = (v: Page) => (n: number): void => { for (const c of Array.from(this.root.querySelectorAll(`[data-v="${v}"] .cv-home-count`))) setText(c, String(n)); };
    const mount = (slot: Page, files: HomeFiles): void => { (this.root.querySelector(`[data-slot="${slot}"]`) as HTMLElement).appendChild(files.root); this.pages.set(slot, files); };
    mount('start', new HomeFiles(deps, { fixed: 'recent', limit: 8, compact: true, onCount: count('recent') }));
    mount('recent', new HomeFiles(deps, { fixed: 'recent', onCount: count('recent') }));
    mount('projects', new HomeFiles(deps, { fixed: 'projects', onCount: count('projects') }));
    mount('outputs', new HomeFiles(deps, { fixed: 'outputs', onCount: count('outputs') }));
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-back]')) { this.forced = false; this.sync(); return; }
      const v =(t.closest('[data-v]') as HTMLElement | null)?.dataset.v as Page | undefined;
      if (v) { this.show(v); return; }
      if (t.closest('[data-cmd]')) return;   // the window's own button[data-cmd] handler runs the command
      const demo = (t.closest('[data-demo-open]') as HTMLElement | null)?.dataset.demoOpen;
      if (demo) { this.d.openDemo(demo); return; }
      const size = (t.closest('[data-size]') as HTMLElement | null)?.dataset.size;
      const p = size !== undefined ? PRESETS[Number(size)] : undefined;
      if (p) this.d.engine.newDocument(p.w, p.h, p.name, 'white', p.ppi);
    });
    host.appendChild(this.root);
    d.engine.on('projects', () => this.sync());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.forced && this.building === null && d.engine.projects.length) { this.forced = false; this.sync(); } });
    this.paint();
    this.sync();
  }

  /** The chosen page shown, the others hidden, its nav item marked; attribute writes only. */
  private paint(): void {
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('.cv-home-page'))) setHidden(n, n.dataset.page !== this.page);
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('.cv-home-nav-item[data-v]'))) setClass(n, 'is-active', n.dataset.v === this.page);
    const h = new Date().getHours();
    setText(this.root.querySelector('[data-page="start"] .cv-home-title'), h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
  }

  /** Reads the files of the page shown and the counts of the others. */
  private fill(): void {
    void this.pages.get(this.page)?.refresh();
    for (const [p, f] of this.pages) if (p !== this.page && p !== 'start' && !(p === 'recent' && this.page === 'start')) void f.refresh();
  }

  get isShown(): boolean { return !this.root.hidden; }

  /** While a demo builds, Home stays over the canvas at Start with that demo's card marked busy, so its documents
   *  appear once, complete; `null` releases it and Home closes as for any opened document. */
  holdForDemo(id: string | null): void {
    this.building = id;
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('[data-demo-open]'))) n.setAttribute('aria-busy', String(n.dataset.demoOpen === id));
    if (id) {
      if (this.page !== 'start') { this.page = 'start'; this.paint(); if (!this.root.hidden) this.fill(); }
      this.forced = true;
      this.sync();
      this.root.querySelector('[data-home-section="demos"]')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    this.forced = false;
    this.sync();
  }

  /** The Home button: shows the Home screen over whatever is open, at `page` when given. */
  show(page?: Page): void {
    if (page && page !== this.page) { this.page = page; this.paint(); if (!this.root.hidden) this.fill(); }
    this.forced = true;
    this.sync();
  }

  /** Shown while forced (until a document opens or Esc); with no document open, at launch when "at launch" is on and
   *  after a document has been open when "when the last document closes" is on. */
  sync(): void {
    const n = this.d.engine.projects.length;
    if (n > this.lastCount) this.forced = false;
    this.lastCount = n;
    if (n > 0) this.hadDocument = true;
    const on = this.forced || this.building !== null || (n === 0 && (this.hadDocument ? this.d.afterClose() : this.d.autoShow()));
    if (on && this.root.hidden) { this.paint(); this.fill(); }
    if (on) this.covers();
    setHidden(this.root, !on);
    setHidden(this.back, n === 0);
    setDisabled(this.back as HTMLButtonElement, this.building !== null);
  }

  private coversAsked = false;
  private covers(): void {
    if (this.coversAsked) return;
    this.coversAsked = true;
    for (const img of Array.from(this.root.querySelectorAll<HTMLImageElement>('.cv-home-demo-pic img[data-src]'))) void swapMedia(img, img.dataset.src ?? '').catch(() => undefined);
  }
}

type Page = 'start' | 'recent' | 'projects' | 'outputs';

/** New document sizes on Start, each opened at once with a white background. */
const PRESETS: Array<{ name: string; w: number; h: number; ppi: number }> = [
  { name: 'Photo 4:3', w: 4032, h: 3024, ppi: 72 },
  { name: 'Square post', w: 1080, h: 1080, ppi: 72 },
  { name: 'Story', w: 1080, h: 1920, ppi: 72 },
  { name: 'HD 1080p', w: 1920, h: 1080, ppi: 72 },
  { name: '4K UHD', w: 3840, h: 2160, ppi: 72 },
  { name: 'A4 print', w: 2480, h: 3508, ppi: 300 },
  { name: 'Web banner', w: 1200, h: 628, ppi: 72 },
  { name: 'App icon', w: 1024, h: 1024, ppi: 72 },
];

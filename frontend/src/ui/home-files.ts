import { api } from '../io/api';
import { baseName, isDiskPath } from '../io/disk';
import { el, patchList, q, setClass, setHidden, setText, setTitle, swapMedia } from './dom';
import { icon } from './icons';

/** Home's file browser (1.87.1, CLOSE_GAPS P02): Recent, Projects (the library) and Outputs (exports), each as a
 *  thumbnail grid or a list with name, kind, size and when it changed; filter, sort, open on click, and Remove from
 *  Recent. Rows are patched in place by key and thumbnails swap in once decoded, so nothing blinks or shifts. */
export interface HomeFilesDeps {
  recent: () => string[];
  openRecent: (nameOrPath: string) => void;
  openPath: (path: string) => void;
  removeRecent: (nameOrPath: string) => void;
}

type Tab = 'recent' | 'projects' | 'outputs';
type Sort = 'opened' | 'name' | 'size' | 'kind';
type View = 'grid' | 'list';
type Thumb = { name: string } | { path: string; project: boolean } | null;

interface Item { key: string; name: string; kind: string; size: number; when: number; missing: boolean; where: string; thumb: Thumb; open: () => void; remove: (() => void) | null }

const PREFS = 'formvis.home';
const PICTURE = /\.(png|jpe?g|webp|gif|avif)$/i;
const PROJECT = /\.(fvd|fmv|formvis)$/i;
const OUTPUTS_KEY = 'formvis.outputs';

function readPrefs(): { tab: Tab; sort: Sort; view: View } {
  const out = { tab: 'recent' as Tab, sort: 'opened' as Sort, view: 'grid' as View };
  try {
    const v = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<typeof out>;
    if (v.tab === 'recent' || v.tab === 'projects' || v.tab === 'outputs') out.tab = v.tab;
    if (v.sort === 'opened' || v.sort === 'name' || v.sort === 'size' || v.sort === 'kind') out.sort = v.sort;
    if (v.view === 'grid' || v.view === 'list') out.view = v.view;
  } catch { /* defaults */ }
  return out;
}

function storedOutputs(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OUTPUTS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch { return []; }
}

const sizeText = (n: number): string => (n <= 0 ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function whenText(t: number): string {
  if (!t) return '';
  const ms = t < 1e12 ? t * 1000 : t, s = (Date.now() - ms) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const kindOf = (name: string): string => (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] ?? 'fvd').toUpperCase();

export class HomeFiles {
  readonly root = el(`<div class="cv-hf">
    <div class="cv-hf-bar">
      <div class="cv-hf-tabs" role="tablist" aria-label="Files">
        <button class="cv-hf-tab" type="button" role="tab" data-tab="recent">Recent</button>
        <button class="cv-hf-tab" type="button" role="tab" data-tab="projects">Projects</button>
        <button class="cv-hf-tab" type="button" role="tab" data-tab="outputs">Outputs</button>
      </div>
      <label class="cv-hf-filter">${icon('search', 14)}<input class="cv-hf-input" type="search" placeholder="Filter files" aria-label="Filter files" spellcheck="false"></label>
      <label class="cv-hf-sortbox"><span>Sort</span><select class="cv-hf-sort" aria-label="Sort by"><option value="opened">Most recent</option><option value="name">Name</option><option value="size">Size</option><option value="kind">Kind</option></select></label>
      <div class="cv-hf-views" role="group" aria-label="View">
        <button class="cv-hf-view" type="button" data-view="grid" title="Thumbnails" aria-label="Thumbnails">${icon('viewGrid', 16)}</button>
        <button class="cv-hf-view" type="button" data-view="list" title="List" aria-label="List">${icon('viewList', 16)}</button>
      </div>
    </div>
    <div class="cv-hf-head" aria-hidden="true"><span></span><span>Name</span><span>Kind</span><span>Size</span><span>Modified</span><span></span></div>
    <div class="cv-hf-items" role="list"></div>
    <p class="cv-hf-empty" hidden></p>
  </div>`);
  private readonly items = q(this.root, '.cv-hf-items');
  private readonly empty = q(this.root, '.cv-hf-empty');
  private readonly filter = q<HTMLInputElement>(this.root, '.cv-hf-input');
  private readonly sort = q<HTMLSelectElement>(this.root, '.cv-hf-sort');
  private prefs = readPrefs();
  private all: Item[] = [];
  private readonly thumbs = new Map<string, string>();
  private readonly loading = new Set<string>();
  private run = 0;

  constructor(private readonly d: HomeFilesDeps) {
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('.cv-hf-tab'))) b.addEventListener('click', () => { this.prefs.tab = b.dataset.tab as Tab; this.save(); void this.refresh(); });
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('.cv-hf-view'))) b.addEventListener('click', () => { this.prefs.view = b.dataset.view as View; this.save(); this.chrome(); });
    this.sort.value = this.prefs.sort;
    this.sort.addEventListener('change', () => { this.prefs.sort = this.sort.value as Sort; this.save(); this.render(); });
    this.filter.addEventListener('input', () => this.render());
    this.items.addEventListener('click', (e) => {
      const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.cv-hf-item'), item = row ? this.all.find((i) => i.key === row.dataset.key) : undefined;
      if (!item) return;
      if (t.closest('.cv-hf-remove')) { item.remove?.(); return; }
      if (t.closest('.cv-hf-open')) item.open();
    });
    this.chrome();
  }

  private save(): void { try { localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch { /* the choice lasts this session */ } }

  /** Tabs and view buttons pressed state, the grid or list class: attribute writes only. */
  private chrome(): void {
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('.cv-hf-tab'))) { const on = b.dataset.tab === this.prefs.tab; setClass(b, 'is-active', on); if (b.getAttribute('aria-selected') !== String(on)) b.setAttribute('aria-selected', String(on)); }
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('.cv-hf-view'))) { const on = b.dataset.view === this.prefs.view; setClass(b, 'is-active', on); if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on)); }
    setClass(this.root, 'is-list', this.prefs.view === 'list');
  }

  /** Reads the chosen tab's files and patches the view; a slower earlier read never overwrites a newer one. */
  async refresh(): Promise<void> {
    this.chrome();
    const run = ++this.run, tab = this.prefs.tab;
    let items: Item[] = [];
    if (tab === 'projects') {
      items = (await api.library().catch(() => [])).map((i) => ({ key: `lib:${i.name}`, name: i.name, kind: 'FVD', size: i.size, when: i.modified, missing: false, where: 'Library', thumb: { name: i.name }, open: () => this.d.openRecent(i.name), remove: null }));
    } else if (tab === 'outputs') {
      const engine = await api.outputs(), seen = new Set(engine.map((o) => o.path)), extra = storedOutputs().filter((p) => !seen.has(p));
      const stats = await api.stat(extra);
      items = [...engine.map((o) => ({ path: o.path, size: o.size, when: o.modified, missing: false })), ...stats.filter((s) => s.exists).map((s) => ({ path: s.path, size: s.size, when: s.modified, missing: false }))]
        .map((o) => ({ key: `out:${o.path}`, name: baseName(o.path), kind: kindOf(o.path), size: o.size, when: o.when, missing: o.missing, where: o.path, thumb: PICTURE.test(o.path) || PROJECT.test(o.path) ? { path: o.path, project: PROJECT.test(o.path) } : null, open: () => this.d.openPath(o.path), remove: null }));
    } else {
      const names = this.d.recent(), lib = new Map((await api.library().catch(() => [])).map((i) => [i.name, i])), stats = new Map((await api.stat(names.filter(isDiskPath))).map((s) => [s.path, s]));
      items = names.map((n) => {
        const disk = isDiskPath(n), s = disk ? stats.get(n) : undefined, l = disk ? undefined : lib.get(n);
        return { key: `rec:${n}`, name: disk ? baseName(n).replace(/\.[^.]+$/, '') : n, kind: disk ? kindOf(n) : 'FVD', size: s?.size ?? l?.size ?? 0, when: s?.modified ?? l?.modified ?? 0, missing: disk ? !s?.exists : !l, where: disk ? n : 'Library',
          thumb: disk ? (PROJECT.test(n) || PICTURE.test(n) ? { path: n, project: PROJECT.test(n) } : null) : { name: n }, open: () => this.d.openRecent(n), remove: () => { this.d.removeRecent(n); void this.refresh(); } };
      });
    }
    if (run !== this.run) return;
    this.all = items;
    this.render();
  }

  /** Filter and sort the read files, then patch the rows by key. */
  private render(): void {
    const f = this.filter.value.trim().toLowerCase(), sort = this.prefs.sort;
    const shown = this.all.filter((i) => !f || i.name.toLowerCase().includes(f) || i.kind.toLowerCase() === f);
    if (sort === 'name') shown.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    else if (sort === 'size') shown.sort((a, b) => b.size - a.size);
    else if (sort === 'kind') shown.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    else if (this.prefs.tab !== 'recent') shown.sort((a, b) => b.when - a.when);
    patchList(this.items, shown, { key: (i) => i.key, create: (i) => this.row(i), update: (n, i) => this.fillRow(n, i) });
    const none = this.all.length === 0 ? (this.prefs.tab === 'recent' ? 'Projects and pictures you open or save appear here.' : this.prefs.tab === 'projects' ? 'No projects in the library yet. Save a document to add it.' : 'Exports appear here once you export a picture.') : 'No files match the filter.';
    setText(this.empty, none);
    setHidden(this.empty, shown.length > 0);
  }

  private row(i: Item): HTMLElement {
    const n = el(`<div class="cv-hf-item" role="listitem">
      <button class="cv-hf-open" type="button"><span class="cv-hf-thumb"><img class="cv-hf-img" alt="" decoding="async" hidden><span class="cv-hf-glyph">${icon('fileImage', 22)}</span></span><span class="cv-hf-name"></span><span class="cv-hf-kind"></span><span class="cv-hf-size"></span><span class="cv-hf-when"></span></button>
      <button class="cv-hf-remove" type="button" title="Remove from Recent" aria-label="Remove from Recent">${icon('close', 12)}</button>
    </div>`);
    this.fillRow(n, i);
    return n;
  }

  private fillRow(n: HTMLElement, i: Item): void {
    setText(q(n, '.cv-hf-name'), i.name);
    setText(q(n, '.cv-hf-kind'), i.kind);
    setText(q(n, '.cv-hf-size'), i.missing ? 'Missing' : sizeText(i.size));
    setText(q(n, '.cv-hf-when'), whenText(i.when));
    setTitle(q(n, '.cv-hf-open'), i.missing ? `${i.where} (not found)` : i.where);
    setClass(n, 'is-missing', i.missing);
    setHidden(q(n, '.cv-hf-remove'), !i.remove);
    const tk = i.thumb ? `${'name' in i.thumb ? `n:${i.thumb.name}` : `p:${i.thumb.path}`}|${i.when}` : '';
    if (n.dataset.thumb === tk) return;
    n.dataset.thumb = tk;
    const img = q<HTMLImageElement>(n, '.cv-hf-img');
    const url = this.thumbs.get(tk);
    if (url) { void swapMedia(img, url).then(() => this.showThumb(n, img)).catch(() => undefined); return; }
    if (!i.thumb || i.missing || this.loading.has(tk) || (!('name' in i.thumb) && !i.thumb.project && i.size > 40 * 1048576)) return;
    this.loading.add(tk);
    const th = i.thumb;
    void (async () => {
      let blob: Blob | null = null;
      if ('name' in th) blob = await api.thumbnail({ name: th.name });
      else if (th.project) blob = await api.thumbnail({ path: th.path });
      else blob = await api.readPath(th.path).catch(() => null);
      this.loading.delete(tk);
      if (!blob || !blob.size) return;
      const u = URL.createObjectURL(blob);
      this.thumbs.set(tk, u);
      if (n.dataset.thumb !== tk) return;
      try { await swapMedia(img, u); this.showThumb(n, img); } catch { /* the glyph stays */ }
    })();
  }

  private showThumb(n: HTMLElement, img: HTMLImageElement): void {
    setHidden(img, false);
    setHidden(q(n, '.cv-hf-glyph'), true);
  }
}

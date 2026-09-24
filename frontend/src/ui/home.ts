import type { Engine } from '../engine';
import { api } from '../io/api';
import { el, setHidden, setText } from './dom';
import { icon } from './icons';

/** The Home screen, as Photoshop's (sourced in WORKSPACE_RESEARCH.md, section 15): New and Open, and the recent
 *  projects, shown over the canvas when no document is open (unless Preferences > General turns Auto Show off) and at
 *  any time from the brand mark, as Photoshop's Home button; Esc leaves it while a document is open. Recent projects
 *  show their names and when they were saved; Photoshop's thumbnails are not built. */
export interface HomeDeps {
  engine: Engine;
  autoShow: () => boolean;
  recent: () => string[];
  openRecent: (name: string) => void;
  run: (command: string) => void;
}

export class HomeScreen {
  readonly root = el('<section class="cv-home" aria-label="Home" hidden></section>');
  private readonly list = el('<div class="cv-home-list"></div>');
  private readonly empty = el('<p class="cv-home-empty">Projects you save or open appear here.</p>');
  private forced = false;
  private lastCount = 0;
  private listKey = '';

  constructor(host: HTMLElement, private readonly d: HomeDeps) {
    const side = el('<div class="cv-home-side"></div>');
    for (const [label, cmd, ic] of [['New file', 'new', 'newFile'], ['Open', 'open', 'folderOpen']] as const) {
      const b = el<HTMLButtonElement>(`<button class="cv-home-action" type="button">${icon(ic, 16)}<span></span></button>`);
      setText(b.querySelector('span') as HTMLElement, label);
      b.dataset.command = cmd;
      b.addEventListener('click', () => this.d.run(cmd));
      side.appendChild(b);
    }
    const main = el('<div class="cv-home-main"><h2 class="cv-home-title">Recent</h2></div>');
    main.append(this.list, this.empty);
    this.root.append(side, main);
    host.appendChild(this.root);
    d.engine.on('projects', () => this.sync());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.forced && d.engine.projects.length) { this.forced = false; this.sync(); } });
    this.sync();
  }

  get isShown(): boolean { return !this.root.hidden; }

  /** The Home button: shows the Home screen over whatever is open. */
  show(): void { this.forced = true; this.sync(); }

  /** Shown while forced (until a document opens or Esc), or with no document open when Auto Show is on. */
  sync(): void {
    const n = this.d.engine.projects.length;
    if (n > this.lastCount) this.forced = false;
    this.lastCount = n;
    const on = this.forced || (n === 0 && this.d.autoShow());
    if (on && this.root.hidden) void this.fill();
    setHidden(this.root, !on);
  }

  /** The recent projects, with when each was saved from the project library where it can say. */
  private async fill(): Promise<void> {
    const names = this.d.recent();
    let modified = new Map<string, number>();
    try { modified = new Map((await api.library()).map((i) => [i.name, i.modified])); } catch { /* names alone */ }
    const key = JSON.stringify(names.map((n) => [n, modified.get(n) ?? 0]));
    setHidden(this.empty, names.length > 0);
    if (key === this.listKey) return;
    this.listKey = key;
    this.list.textContent = '';
    for (const name of names) {
      const row = el<HTMLButtonElement>(`<button class="cv-home-item" type="button">${icon('image', 18)}<span class="cv-home-name"></span><span class="cv-home-date"></span></button>`);
      setText(row.querySelector('.cv-home-name') as HTMLElement, name);
      const t = modified.get(name);
      setText(row.querySelector('.cv-home-date') as HTMLElement, t ? new Date(t * (t < 1e12 ? 1000 : 1)).toLocaleString() : '');
      row.addEventListener('click', () => this.d.openRecent(name));
      this.list.appendChild(row);
    }
  }
}

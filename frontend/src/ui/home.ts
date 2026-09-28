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
  /** Recent projects, a quiet list under the hint, shown only when there are any (the target has none; kept since
   *  formvis's recent projects are useful and removing them would be a step back). */
  private readonly recentBox = el('<div class="cv-home-main" hidden><h2 class="cv-home-title">Recent</h2></div>');
  private forced = false;
  private lastCount = 0;
  private listKey = '';

  /** The start screen as the target's (UI_SPEC.md section 3): the whole window below the title bar, black; a centred
   *  name, a line of what to do, a white New document button and a dark Open button, each with its shortcut as key
   *  caps, and a hint that images can be dropped anywhere. */
  constructor(host: HTMLElement, private readonly d: HomeDeps) {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
    const center = el(`<div class="cv-home-center">
      <h1 class="cv-home-brand">formvis<span class="cv-home-by">by NodeMode</span></h1>
      <p class="cv-home-sub">Create a new document or open an existing file.</p>
      <div class="cv-home-actions"></div>
      <p class="cv-home-hint">${icon('image', 14)}<span>Drop a supported image file anywhere to open it.</span></p>
    </div>`);
    const actions = center.querySelector('.cv-home-actions') as HTMLElement;
    for (const [label, cmd, ic, key] of [['New document…', 'new', 'newFile', 'N'], ['Open…', 'open', 'folderOpen', 'O']] as const) {
      const b = el<HTMLButtonElement>(`<button class="cv-home-action" type="button">${icon(ic, 16)}<span class="cv-home-label"></span><kbd class="cv-key"></kbd><kbd class="cv-key"></kbd></button>`);
      setText(b.querySelector('.cv-home-label') as HTMLElement, label);
      const [k1, k2] = Array.from(b.querySelectorAll('kbd'));
      setText(k1, mod);
      setText(k2, key);
      b.dataset.command = cmd;
      b.addEventListener('click', () => this.d.run(cmd));
      actions.appendChild(b);
    }
    this.recentBox.appendChild(this.list);
    center.appendChild(this.recentBox);
    this.root.append(center);
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
    setHidden(this.recentBox, names.length === 0);
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

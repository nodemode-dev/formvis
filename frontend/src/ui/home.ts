import type { Engine } from '../engine';
import { el, setHidden, setText } from './dom';
import { HomeFiles } from './home-files';
import { icon } from './icons';

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
}

export class HomeScreen {
  readonly root = el('<section class="cv-home" aria-label="Home" hidden></section>');
  private readonly files: HomeFiles;
  private forced = false;
  private lastCount = 0;
  private hadDocument = false;

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
    this.files = new HomeFiles({ recent: d.recent, openRecent: d.openRecent, openPath: d.openPath, removeRecent: d.removeRecent });
    center.appendChild(this.files.root);
    this.root.append(center);
    host.appendChild(this.root);
    d.engine.on('projects', () => this.sync());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.forced && d.engine.projects.length) { this.forced = false; this.sync(); } });
    this.sync();
  }

  get isShown(): boolean { return !this.root.hidden; }

  /** The Home button: shows the Home screen over whatever is open. */
  show(): void { this.forced = true; this.sync(); }

  /** Shown while forced (until a document opens or Esc); with no document open, at launch when "at launch" is on and
   *  after a document has been open when "when the last document closes" is on. */
  sync(): void {
    const n = this.d.engine.projects.length;
    if (n > this.lastCount) this.forced = false;
    this.lastCount = n;
    if (n > 0) this.hadDocument = true;
    const on = this.forced || (n === 0 && (this.hadDocument ? this.d.afterClose() : this.d.autoShow()));
    if (on && this.root.hidden) void this.files.refresh();
    setHidden(this.root, !on);
  }
}

import type { Commands } from './commands';
import { el, setHidden, setText } from './dom';
import { icon } from './icons';
import { readChoice, setTheme } from './themes';
import { enhanceSelect } from './dropdown';

/** The title bar's right-hand tools, as the target's (Phase 21, UI_SPEC.md section 2): a theme toggle (Studio Dark and
 *  Light); a search that finds and runs any enabled command by name, with its shortcut shown; the workspace dropdown,
 *  each workspace an arrangement of the panels for a kind of work; and Lock Workspace. */
export interface Workspace { id: string; label: string; order: string[]; hidden: string[]; propsColumn: boolean }
export const WORKSPACES: readonly Workspace[] = [
  { id: 'essentials', label: 'Essentials', order: ['navigator', 'swatches', 'layers', 'timeline', 'history'], hidden: ['timeline', 'history'], propsColumn: true },
  { id: 'photography', label: 'Photography', order: ['navigator', 'layers', 'history', 'swatches', 'timeline'], hidden: ['swatches', 'timeline'], propsColumn: true },
  { id: 'painting', label: 'Painting', order: ['swatches', 'navigator', 'layers', 'history', 'timeline'], hidden: ['timeline'], propsColumn: true },
  { id: 'graphic', label: 'Graphic and Web', order: ['layers', 'swatches', 'navigator', 'history', 'timeline'], hidden: ['navigator', 'timeline'], propsColumn: true },
  { id: 'motion', label: 'Motion', order: ['layers', 'timeline', 'navigator', 'swatches', 'history'], hidden: ['swatches'], propsColumn: true },
];
/** A workspace saved under an earlier name. */
const RENAMED: Record<string, string> = { typography: 'graphic' };

export interface TitleToolsDeps {
  commands: Commands;
  arrange: (w: Workspace) => void;
  locked: () => boolean;
  setLocked: (on: boolean) => void;
}

export class TitleTools {
  readonly root = el('<div class="cv-title-tools"></div>');
  private readonly results = el('<div class="cv-search-results" role="listbox"></div>');
  private readonly pop = el('<div class="cv-search-pop" hidden><input class="cv-search-input" type="search" placeholder="Search commands" aria-label="Search commands"></div>');
  private picked = 0;

  constructor(host: HTMLElement, private readonly d: TitleToolsDeps) {
    const theme = el<HTMLButtonElement>('<button class="cv-tt-btn cv-tt-bare" type="button" title="Light or dark" aria-label="Light or dark"></button>');
    const search = el<HTMLButtonElement>(`<button class="cv-tt-btn" type="button" title="Search commands" aria-label="Search commands">${icon('search', 16)}</button>`);
    const ws = el<HTMLSelectElement>(`<select class="cv-tt-select" aria-label="Workspace"><optgroup label="Built-in">${WORKSPACES.map((w) => `<option value="${w.id}">${w.label}</option>`).join('')}</optgroup></select>`);
    const lock = el<HTMLButtonElement>('<button class="cv-tt-btn" type="button"></button>');
    const syncTheme = (): void => { const light = readChoice().theme === 'light'; theme.innerHTML = icon(light ? 'moon' : 'sun', 17); theme.setAttribute('aria-pressed', String(light)); };
    theme.addEventListener('click', () => { setTheme(readChoice().theme === 'light' ? 'studio' : 'light'); syncTheme(); });
    syncTheme();
    try { const saved = localStorage.getItem('sonny.workspace') ?? 'essentials'; ws.value = RENAMED[saved] ?? saved; } catch { /* essentials */ }
    ws.addEventListener('change', () => {
      const w = WORKSPACES.find((x) => x.id === ws.value);
      if (!w) return;
      try { localStorage.setItem('sonny.workspace', w.id); } catch { /* this session only */ }
      d.arrange(w);
    });
    const syncLock = (): void => {
      const on = d.locked();
      lock.innerHTML = icon(on ? 'lock' : 'unlock', 15);
      lock.classList.toggle('is-on', on);
      lock.setAttribute('aria-pressed', String(on));
      lock.title = on ? 'Unlock the workspace' : 'Lock the workspace';
      lock.setAttribute('aria-label', lock.title);
    };
    lock.addEventListener('click', () => { d.setLocked(!d.locked()); syncLock(); });
    syncLock();
    this.pop.appendChild(this.results);
    const input = this.pop.querySelector('input') as HTMLInputElement;
    search.addEventListener('click', () => this.open());
    input.addEventListener('input', () => { this.picked = 0; this.fill(input.value); });
    input.addEventListener('keydown', (e) => {
      const n = this.results.children.length;
      if (e.key === 'Escape') { this.close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (n) { this.picked = (this.picked + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; this.mark(); } return; }
      if (e.key === 'Enter') { const b = this.results.children[this.picked] as HTMLElement | undefined; if (b) b.click(); }
    });
    document.addEventListener('pointerdown', (e) => { if (!this.pop.hidden && !this.pop.contains(e.target as Node) && !search.contains(e.target as Node)) this.close(); });
    this.root.append(theme, search, ws, lock, this.pop);
    enhanceSelect(ws);   // shown as the target's list (s23)
    host.appendChild(this.root);
  }

  open(): void {
    setHidden(this.pop, false);
    const input = this.pop.querySelector('input') as HTMLInputElement;
    input.value = '';
    this.picked = 0;
    this.fill('');
    input.focus();
  }

  close(): void { setHidden(this.pop, true); }

  private fill(q: string): void {
    const c = this.d.commands, needle = q.trim().toLowerCase();
    const found = c.all().filter((cmd) => c.enabled(cmd) && c.label(cmd) && (!needle || c.label(cmd).toLowerCase().includes(needle))).slice(0, 8);
    this.results.textContent = '';
    for (const cmd of found) {
      const b = el<HTMLButtonElement>('<button class="cv-search-item" type="button" role="option"><span class="cv-search-label"></span><span class="cv-search-keys"></span></button>');
      setText(b.querySelector('.cv-search-label') as HTMLElement, c.label(cmd).replace(/\.\.\.$/, '…'));
      setText(b.querySelector('.cv-search-keys') as HTMLElement, c.keyLabel(cmd));
      b.addEventListener('click', () => { this.close(); c.run(cmd.id); });
      this.results.appendChild(b);
    }
    this.mark();
  }

  private mark(): void {
    Array.from(this.results.children).forEach((b, i) => { (b as HTMLElement).classList.toggle('is-picked', i === this.picked); b.setAttribute('aria-selected', String(i === this.picked)); });
  }
}

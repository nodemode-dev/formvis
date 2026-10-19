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
  // The Generate panel (generative fill, models, ComfyUI and NodeMode) sits near the top of the dock in the photo and painting workspaces.
  // Essentials keeps Generate under Layers and closed (1.87.3, D05): at 1400 x 900 it pushed the Layers list out of the
  // window. Window > Generate, the Generate menu and the task bar still reach it.
  { id: 'essentials', label: 'Essentials', order: ['navigator', 'swatches', 'layers', 'generate', 'timeline', 'history'], hidden: ['generate', 'timeline', 'history'], propsColumn: true },
  { id: 'photography', label: 'Photography', order: ['navigator', 'generate', 'layers', 'history', 'swatches', 'timeline'], hidden: ['swatches', 'timeline'], propsColumn: true },
  { id: 'painting', label: 'Painting', order: ['swatches', 'navigator', 'generate', 'layers', 'history', 'timeline'], hidden: ['timeline'], propsColumn: true },
  { id: 'graphic', label: 'Graphic and Web', order: ['layers', 'swatches', 'navigator', 'generate', 'history', 'timeline'], hidden: ['navigator', 'generate', 'timeline'], propsColumn: true },
  { id: 'motion', label: 'Motion', order: ['layers', 'timeline', 'navigator', 'generate', 'swatches', 'history'], hidden: ['swatches', 'generate'], propsColumn: true },
  { id: 'pixelart', label: 'Pixel Art', order: ['swatches', 'navigator', 'layers', 'timeline', 'history', 'generate'], hidden: ['generate'], propsColumn: true },
];
/** A workspace saved under an earlier name. */
const RENAMED: Record<string, string> = { typography: 'graphic' };

export interface TitleToolsDeps {
  commands: Commands;
  arrange: (w: Workspace) => void;
  locked: () => boolean;
  setLocked: (on: boolean) => void;
}

const CUSTOM_KEY = 'formvis.customWorkspaces';
function loadCustom(): Workspace[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((w): w is Workspace => !!w && typeof w.id === 'string' && typeof w.label === 'string' && Array.isArray(w.order) && Array.isArray(w.hidden)) : [];
  } catch { return []; }
}
function saveCustom(list: Workspace[]): void { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* this session only */ } }

export class TitleTools {
  readonly root = el('<div class="cv-title-tools"></div>');
  private ws!: HTMLSelectElement;
  private readonly customGroup = el<HTMLOptGroupElement>('<optgroup label="Custom"></optgroup>');
  private custom: Workspace[] = loadCustom();

  /** The workspaces saved by name, then the built-in ones. */
  all(): Workspace[] { return [...WORKSPACES, ...this.custom]; }
  isCustom(id: string): boolean { return this.custom.some((w) => w.id === id); }
  currentId(): string { return this.ws.value; }

  /** Window > Workspace > a name: the same as choosing it in the title bar. */
  choose(id: string): void {
    const w = this.all().find((x) => x.id === id);
    if (!w) return;
    this.ws.value = id;
    try { localStorage.setItem('formvis.workspace', id); } catch { /* this session only */ }
    this.d.arrange(w);
  }

  /** Window > Workspace > New Workspace: keeps the dock as it stands under a name, and selects it. */
  addCustom(label: string, order: string[], hidden: string[], propsColumn: boolean): void {
    const name = label.trim();
    if (!name) return;
    const same = this.custom.find((w) => w.label.toLowerCase() === name.toLowerCase());
    if (same) { same.order = order; same.hidden = hidden; same.propsColumn = propsColumn; }
    else this.custom.push({ id: `custom-${Date.now().toString(36)}`, label: name, order, hidden, propsColumn });
    saveCustom(this.custom);
    this.syncCustom();
    const w = same ?? this.custom[this.custom.length - 1];
    this.ws.value = w.id;
    try { localStorage.setItem('formvis.workspace', w.id); } catch { /* this session only */ }
  }

  /** Window > Workspace > Delete Workspace: removes a saved workspace and returns to Essentials. */
  removeCustom(id: string): boolean {
    if (!this.isCustom(id)) return false;
    this.custom = this.custom.filter((w) => w.id !== id);
    saveCustom(this.custom);
    this.syncCustom();
    if (this.ws.value === id || !this.ws.value) {
      this.ws.value = 'essentials';
      try { localStorage.setItem('formvis.workspace', 'essentials'); } catch { /* this session only */ }
      const w = WORKSPACES[0];
      this.d.arrange(w);
    }
    return true;
  }

  /** The Custom group's options follow the list: existing ones are kept, so the open list does not rebuild. */
  private syncCustom(): void {
    const have = new Map(Array.from(this.customGroup.children).map((o) => [(o as HTMLOptionElement).value, o as HTMLOptionElement]));
    for (const [id, o] of have) if (!this.custom.some((w) => w.id === id)) o.remove();
    for (const w of this.custom) {
      const o = have.get(w.id);
      if (o) { if (o.textContent !== w.label) o.textContent = w.label; }
      else { const n = document.createElement('option'); n.value = w.id; n.textContent = w.label; this.customGroup.appendChild(n); }
    }
  }

  private readonly results = el('<div class="cv-search-results" role="listbox"></div>');
  private readonly pop = el('<div class="cv-search-pop" hidden><input class="cv-search-input" type="search" placeholder="Search commands" aria-label="Search commands"></div>');
  private picked = 0;

  constructor(host: HTMLElement, private readonly d: TitleToolsDeps) {
    const theme = el<HTMLButtonElement>('<button class="cv-tt-btn cv-tt-bare" type="button" title="Light or dark" aria-label="Light or dark"></button>');
    const search = el<HTMLButtonElement>(`<button class="cv-tt-btn" type="button" title="Search commands" aria-label="Search commands">${icon('search', 16)}</button>`);
    const ws = el<HTMLSelectElement>(`<select class="cv-tt-select" aria-label="Workspace"><optgroup label="Built-in">${WORKSPACES.map((w) => `<option value="${w.id}">${w.label}</option>`).join('')}</optgroup></select>`);
    const lock = el<HTMLButtonElement>('<button class="cv-tt-btn" type="button"></button>');
    const syncTheme = (): void => {
      const light = readChoice().theme === 'light';
      if (!theme.firstElementChild) theme.innerHTML = `<span class="cv-tt-sun">${icon('sun', 17)}</span><span class="cv-tt-moon">${icon('moon', 17)}</span>`;
      (theme.children[0] as HTMLElement).hidden = light;
      (theme.children[1] as HTMLElement).hidden = !light;
      theme.setAttribute('aria-pressed', String(light));
    };
    theme.addEventListener('click', () => { setTheme(readChoice().theme === 'light' ? 'studio' : 'light'); syncTheme(); });
    syncTheme();
    document.addEventListener('nm:ui-settings-changed', syncTheme);
    this.ws = ws;
    ws.appendChild(this.customGroup);
    this.syncCustom();
    try { const saved = localStorage.getItem('formvis.workspace') ?? 'essentials'; ws.value = RENAMED[saved] ?? saved; } catch { /* essentials */ }
    ws.addEventListener('change', () => {
      const w = this.all().find((x) => x.id === ws.value);
      if (!w) return;
      try { localStorage.setItem('formvis.workspace', w.id); } catch { /* this session only */ }
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

import { REFERENCE_NOTICE } from './notices';
import type { Engine } from '../engine';
import { api, type Capabilities, type LibraryItem } from '../io/api';
import { PROJECT_ACCEPT } from '../io/images';
import { VERSION } from '../version';
import type { Commands } from './commands';
import { Dialog, confirmAction } from './dialogs';
import { el, patchList, q, setClass, setDisabled, setHidden, setText, setValue } from './dom';
import { icon } from './icons';
import { brandMark } from './brand';
import { THEMES, readChoice, setAccent, setTheme, themeSwatchesHtml } from './themes';
import { toast } from './toast';
import { RECOVERY_CHOICES, loadPrefs, savePrefs, type Prefs } from './prefs';
import { checkRow, selectRow, sliderRow } from './panels/controls';

const PRESETS: ReadonlyArray<[string, number, number]> = [
  ['HD 1920 \u00d7 1080', 1920, 1080], ['4K 3840 \u00d7 2160', 3840, 2160], ['Square 2048', 2048, 2048],
  ['Portrait 1080 \u00d7 1350', 1080, 1350], ['A4 at 300 ppi', 2480, 3508], ['Letter at 300 ppi', 2550, 3300],
];

export class NewCanvasDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" value="Untitled" spellcheck="false">');
  private readonly preset = el<HTMLSelectElement>(`<select class="cv-input"><option value="">Custom</option>${PRESETS.map(([label], i) => `<option value="${i}">${label}</option>`).join('')}</select>`);
  private readonly width = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="30000" step="1" value="1920">');
  private readonly height = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="30000" step="1" value="1080">');
  private readonly fill = el<HTMLSelectElement>('<select class="cv-input"><option value="transparent">Transparent</option><option value="white">White</option><option value="background">Background color</option></select>');

  constructor(private readonly engine: Engine) {
    super('New Canvas', 420);
    this.field('Name', this.name);
    this.field('Preset', this.preset);
    this.field('Width (px)', this.width);
    this.field('Height (px)', this.height);
    this.field('Contents', this.fill);
    this.body.appendChild(el('<p class="cv-note">Each side 1 to 30,000 px, 100 megapixels at most.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Create', 'primary', () => this.create());
    this.preset.addEventListener('change', () => {
      const p = PRESETS[Number(this.preset.value)];
      if (!this.preset.value || !p) return;
      this.width.value = String(p[1]);
      this.height.value = String(p[2]);
    });
    for (const i of [this.width, this.height]) i.addEventListener('input', () => { this.preset.value = ''; });
    for (const i of [this.name, this.width, this.height]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.create(); } });
  }

  show(): void {
    this.open(this.width);
    this.width.select();
  }

  private create(): void {
    const w = Number(this.width.value), h = Number(this.height.value);
    const fill = this.fill.value as 'transparent' | 'white' | 'background';
    if (this.engine.newDocument(w, h, this.name.value.trim() || 'Untitled', fill)) this.close();
  }
}

export interface OpenActions {
  openLibrary(name: string): Promise<boolean>;
  openFiles(files: File[]): Promise<void>;
  openFolder(files: File[], paths: string[]): Promise<void>;
}

export class OpenDialog extends Dialog {
  private readonly list = el('<div class="cv-list" role="listbox" aria-label="Saved projects"></div>');
  private readonly empty = el('<div class="cv-list-empty" hidden>No saved projects yet.</div>');
  private readonly status = el('<p class="cv-note">Projects saved in the sonny library.</p>');
  private readonly fileInput = el<HTMLInputElement>(`<input type="file" accept="${PROJECT_ACCEPT}" hidden>`);
  private readonly folderInput = el<HTMLInputElement>('<input type="file" hidden>');
  private readonly openBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;
  private items: LibraryItem[] = [];
  private selected: string | null = null;

  constructor(private readonly actions: OpenActions) {
    super('Open Project', 500);
    this.folderInput.webkitdirectory = true;
    this.body.append(this.status, this.list, this.empty);
    const row = el(`<div class="cv-welcome-actions"><button class="cv-btn" type="button" data-from="file">${icon('upload', 14)}From disk</button><button class="cv-btn" type="button" data-from="folder">${icon('folderOpen', 14)}.ref folder</button></div>`);
    this.body.append(row, this.fileInput, this.folderInput);
    q(row, '[data-from="file"]').addEventListener('click', () => this.fileInput.click());
    q(row, '[data-from="folder"]').addEventListener('click', () => this.folderInput.click());
    this.deleteBtn = this.button('Delete', 'danger', () => void this.deleteSelected());
    this.button('Cancel', 'ghost', () => this.close());
    this.openBtn = this.button('Open', 'primary', () => void this.openSelected());
    this.list.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('.cv-list-row');
      if (r?.dataset.key) { this.selected = r.dataset.key; this.sync(); }
    });
    this.list.addEventListener('dblclick', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('.cv-list-row');
      if (r?.dataset.key) { this.selected = r.dataset.key; void this.openSelected(); }
    });
    this.fileInput.addEventListener('change', () => {
      const files = Array.from(this.fileInput.files ?? []);
      this.fileInput.value = '';
      if (!files.length) return;
      this.close();
      void actions.openFiles(files);
    });
    this.folderInput.addEventListener('change', () => {
      const files = Array.from(this.folderInput.files ?? []);
      this.folderInput.value = '';
      if (!files.length) return;
      this.close();
      void actions.openFolder(files, files.map((f) => f.webkitRelativePath || f.name));
    });
  }

  async show(): Promise<void> {
    this.selected = null;
    this.sync();
    this.open(this.openBtn);
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.items = await api.library();
      setText(this.status, 'Projects saved in the sonny library.');
    } catch (err) {
      this.items = [];
      setText(this.status, err instanceof Error ? err.message : String(err));
    }
    if (this.selected && !this.items.some((i) => i.name === this.selected)) this.selected = null;
    patchList(this.list, this.items, {
      key: (i) => i.name,
      create: (i) => {
        const n = el(`<button class="cv-list-row" type="button" role="option">${icon('fileImage', 14)}<span class="cv-list-name"></span><span class="cv-list-meta"></span></button>`);
        this.updateRow(n, i);
        return n;
      },
      update: (n, i) => this.updateRow(n, i),
    });
    setHidden(this.empty, this.items.length > 0);
    this.sync();
  }

  private updateRow(n: HTMLElement, i: LibraryItem): void {
    setText(q(n, '.cv-list-name'), i.name);
    const when = new Date(i.modified * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const size = i.size >= 1048576 ? `${(i.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(i.size / 1024))} KB`;
    setText(q(n, '.cv-list-meta'), `${when} \u00b7 ${size}`);
  }

  private sync(): void {
    for (const child of Array.from(this.list.children)) setClass(child, 'is-selected', (child as HTMLElement).dataset.key === this.selected);
    setDisabled(this.openBtn, !this.selected);
    setDisabled(this.deleteBtn, !this.selected);
  }

  private async openSelected(): Promise<void> {
    if (!this.selected) return;
    if (await this.actions.openLibrary(this.selected)) this.close();
  }

  private async deleteSelected(): Promise<void> {
    const name = this.selected;
    if (!name) return;
    if (!(await confirmAction('Delete project?', `${name} will be removed from the library. This cannot be undone.`, 'Delete', true))) return;
    try {
      await api.deleteLibrary(name);
      toast(`Deleted ${name}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    this.selected = null;
    await this.reload();
  }
}

export class SettingsDialog extends Dialog {
  private readonly grid = el('<div class="nm-theme-grid" role="group" aria-label="Theme"></div>');
  private readonly accent = el<HTMLInputElement>('<input class="cv-input" type="color" aria-label="Accent color">');
  private readonly nav = el('<div class="cv-prefs-nav" role="tablist"></div>');
  private readonly sections = new Map<string, HTMLElement>();
  private prefs: Prefs = loadPrefs();
  private readonly statesRow = sliderRow('History States', 1, 1000, 1, (v) => this.change({ historyStates: v }));
  private readonly memoryRow = sliderRow('History memory (MB)', 16, 4096, 16, (v) => this.change({ historyMB: v }));
  private readonly redrawRow = checkRow('Redraw only what a brush stroke changed', (v) => this.change({ regionRedraws: v }));
  private readonly recoveryRow = selectRow('Keep recovery information after changes, within', RECOVERY_CHOICES, (v) => this.change({ recoverySeconds: Number(v) }));

  /** Edit > Preferences (Ctrl+,), laid out as Photoshop's: sections on the left, each section's settings on the right,
   *  kept on this device. `onPrefs` puts a change into effect. */
  constructor(private readonly onPrefs: (p: Prefs) => void) {
    super('Preferences', 620);
    const t = document.createElement('template');
    t.innerHTML = themeSwatchesHtml();
    this.grid.append(t.content);
    const row = el('<div class="cv-field"><span>Theme</span></div>');
    row.appendChild(this.grid);
    const pages = el('<div class="cv-prefs-pages"></div>');
    const add = (name: string, ...content: HTMLElement[]): void => {
      const tab = el<HTMLButtonElement>('<button class="cv-prefs-tab" type="button" role="tab"></button>');
      tab.textContent = name;
      tab.addEventListener('click', () => this.showSection(name));
      this.nav.appendChild(tab);
      const page = el('<div class="cv-prefs-page" role="tabpanel"></div>');
      page.append(...content);
      pages.appendChild(page);
      this.sections.set(name, page);
    };
    const accentRow = el('<label class="cv-field"><span>Accent</span></label>');
    accentRow.appendChild(this.accent);
    add('Interface', row, accentRow, el('<p class="cv-note">Theme and accent are shared with NodeMode on this device.</p>'));
    add('Performance', this.statesRow.el, this.memoryRow.el, this.redrawRow.el,
      el('<p class="cv-note">History States is how many steps undo keeps (Photoshop keeps 50 by default, up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as Photoshop\'s Memory Usage does, so this is the part sonny controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.</p>'));
    add('File Handling', this.recoveryRow.el, el('<p class="cv-note">Unsaved documents are kept on this device so they can be recovered after a crash; this is how soon after a change that happens.</p>'));
    const wrap = el('<div class="cv-prefs"></div>');
    wrap.append(this.nav, pages);
    this.body.appendChild(wrap);
    this.button('Done', 'primary', () => this.close());
    this.grid.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-id]');
      if (!b?.dataset.themeId) return;
      setTheme(b.dataset.themeId);
      this.sync();
    });
    this.accent.addEventListener('input', () => { setAccent(this.accent.value); this.sync(); });
    this.showSection('Interface');
  }

  /** Opens on a section, Interface unless named. */
  show(section?: string): void {
    this.prefs = loadPrefs();
    this.statesRow.set(this.prefs.historyStates);
    this.memoryRow.set(this.prefs.historyMB);
    this.redrawRow.set(this.prefs.regionRedraws);
    this.recoveryRow.set(String(this.prefs.recoverySeconds));
    if (section && this.sections.has(section)) this.showSection(section);
    this.sync();
    this.open();
  }

  private showSection(name: string): void {
    for (const [n, page] of this.sections) setHidden(page, n !== name);
    for (const tab of Array.from(this.nav.children) as HTMLElement[]) { const on = tab.textContent === name; setClass(tab, 'is-active', on); tab.setAttribute('aria-selected', String(on)); }
  }

  private change(patch: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    savePrefs(this.prefs);
    this.onPrefs(this.prefs);
  }

  private sync(): void {
    const c = readChoice();
    setValue(this.accent, c.accentColor);
    for (const b of Array.from(this.grid.querySelectorAll<HTMLElement>('[data-theme-id]'))) {
      const id = b.dataset.themeId ?? '';
      const active = id === c.theme;
      setClass(b, 'is-active', active);
      const border = active ? c.accentColor : THEMES[id]?.vars['--border-color'] ?? '';
      if (b.dataset.border !== border) { b.dataset.border = border; b.style.borderColor = border; }
    }
  }
}

const TOOL_KEYS: ReadonlyArray<[string, string]> = [
  ['Move tool', 'V'], ['Marquee tool, Shift+M switches shape', 'M'], ['Lasso tool, Shift+L switches mode', 'L'], ['Magic Wand tool', 'W'],
  ['Brush tool', 'B'], ['Eraser', 'E'], ['Eyedropper tool', 'I'], ['Hand tool, or hold Space', 'H'], ['Zoom tool', 'Z'],
  ['Swap colors', 'X'], ['Default colors', 'D'], ['Brush size', '[  ]'], ['Brush hardness', 'Shift [  ]'], ['Brush or layer opacity', '1 to 0'],
  ['Nudge layer, Shift for 10 px', 'Arrows'],
];

export class ShortcutsDialog extends Dialog {
  private readonly list = el('<div class="cv-list" aria-label="Keyboard shortcuts"></div>');

  constructor(private readonly commands: Commands) {
    super('Keyboard Shortcuts', 520);
    this.body.appendChild(this.list);
    this.button('Close', 'primary', () => this.close());
  }

  show(): void {
    const rows: Array<{ key: string; label: string; keys: string }> = [];
    for (const c of this.commands.all()) if (c.keys?.length) rows.push({ key: c.id, label: this.commands.label(c), keys: this.commands.keyLabel(c) });
    for (const [label, keys] of TOOL_KEYS) rows.push({ key: `tool:${label}`, label, keys });
    patchList(this.list, rows, {
      key: (r) => r.key,
      create: (r) => {
        const n = el('<div class="cv-list-row"><span></span><span class="cv-list-name"></span><span class="cv-list-meta"></span></div>');
        setText(q(n, '.cv-list-name'), r.label);
        setText(q(n, '.cv-list-meta'), r.keys);
        return n;
      },
      update: (n, r) => { setText(q(n, '.cv-list-name'), r.label); setText(q(n, '.cv-list-meta'), r.keys); },
    });
    this.open();
  }
}

export class AboutDialog extends Dialog {
  private readonly engineLine = el('<p class="cv-note"></p>');

  constructor() {
    super('About sonny', 420);
    this.body.appendChild(el(`<div class="cv-welcome-title">${brandMark(28)}sonny ${VERSION}</div>`));
    this.body.appendChild(el('<p class="cv-note">A layered image editor for the web and the desktop, in the NodeMode design system.</p>'));
    this.body.appendChild(this.engineLine);
    this.body.appendChild(el('<p class="cv-note">Apache License 2.0. Copyright 2026 nodemode-ai.</p>'));
    this.body.appendChild(el('<p class="cv-note">sonny began as a port of the reference app by its authors. Parts derived from it are used under the MIT License:</p>'));
    const notice = el('<pre class="cv-notice"></pre>');
    setText(notice, REFERENCE_NOTICE);
    this.body.appendChild(notice);
    this.button('Close', 'primary', () => this.close());
  }

  show(caps: Capabilities | null): void {
    setText(this.engineLine, caps
      ? `Engine ${caps.version}${caps.desktop ? ' (desktop)' : ''} · decoders ${caps.decode.engine} · background removal ${caps.removeBackground.ml ? 'ML and lightweight' : caps.removeBackground.lite ? 'lightweight' : 'unavailable'} · data in ${caps.dataDir}`
      : 'Engine offline. Start it with ./sonny boot.');
    this.open();
  }
}

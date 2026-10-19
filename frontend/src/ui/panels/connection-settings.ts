import { api, type ComfyAuth, type ModelsFolder } from '../../io/api';
import { addRecipe, apiWorkflow, RECIPE_FAMILIES, recipeFamily, recipes, removeRecipe, type RecipeFamily } from '../../io/comfy';
import { saveTemplates, templateFromMarkdown, templateToMarkdown, templates } from '../../io/prompt-templates';
import { el, patchList, setHidden, setText, setValue } from '../dom';
import { loadPrefs } from '../prefs';
import { THEMES, applyTheme, readChoice, registerSkins } from '../themes';

const row = (label: string, ...c: HTMLElement[]): HTMLElement => { const r = el('<label class="cv-dialog-row"><span></span></label>'); setText(r.querySelector('span'), label); r.append(...c); return r; };
/** patchList that also fills a row when it is made, so a first showing is not empty. */
const patch = <T>(container: HTMLElement, items: T[], o: Parameters<typeof patchList<T>>[2]): void => patchList(container, items, { ...o, create: (i) => { const n = o.create(i); o.update(n, i); return n; } });
const failure = (err: unknown, d: string): string => (err instanceof Error && err.message ? err.message : d);

/** Preferences > Plugins: how formvis signs in to your own ComfyUI server (none, basic, bearer token or a header of your
 *  choice). The engine keeps the secret in the system's password store and never hands it back. */
export class ComfyAuthSection {
  readonly el = el('<div class="cv-panel-section cv-comfy-auth"><span class="cv-refs-title">ComfyUI sign-in</span></div>');
  private readonly mode = el<HTMLSelectElement>('<select class="cv-input" aria-label="ComfyUI sign-in"><option value="none">None</option><option value="basic">Basic (user and password)</option><option value="bearer">Bearer token</option><option value="header">Custom header</option></select>');
  private readonly user = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="ComfyUI user name" autocomplete="off" spellcheck="false" maxlength="200">');
  private readonly header = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="ComfyUI header name" placeholder="X-Api-Key" autocomplete="off" spellcheck="false" maxlength="64">');
  private readonly secret = el<HTMLInputElement>('<input class="cv-input" type="password" aria-label="ComfyUI secret" autocomplete="new-password" spellcheck="false">');
  private readonly note = el('<p class="cv-note" role="status">Only needed when your own ComfyUI server sits behind a login or a proxy. It is sent to the ComfyUI address above and nowhere else.</p>');
  private readonly rows: Record<'user' | 'header' | 'secret', HTMLElement>;

  constructor() {
    this.rows = { user: row('User name', this.user), header: row('Header name', this.header), secret: row('Secret', this.secret) };
    const save = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Save</button>'), forget = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Forget secret</button>');
    const buttons = el('<div class="cv-improve"></div>');
    buttons.append(save, forget);
    this.el.append(row('Sign-in', this.mode), this.rows.user, this.rows.header, this.rows.secret, buttons, this.note);
    this.mode.addEventListener('change', () => this.showFields());
    save.addEventListener('click', () => void this.save(false));
    forget.addEventListener('click', () => void this.save(true));
    for (const i of [this.user, this.header, this.secret]) i.addEventListener('keydown', (e) => e.stopPropagation());
    this.showFields();
  }

  private showFields(): void {
    const m = this.mode.value;
    setHidden(this.rows.user, m !== 'basic');
    setHidden(this.rows.header, m !== 'header');
    setHidden(this.rows.secret, m === 'none');
  }

  private show(s: ComfyAuth): void {
    if (document.activeElement !== this.mode) setValue(this.mode, s.mode);
    if (document.activeElement !== this.user) setValue(this.user, s.user);
    if (document.activeElement !== this.header) setValue(this.header, s.header);
    this.secret.value = '';
    const ph = s.hasSecret ? 'Saved (type to replace)' : 'Not set';
    if (this.secret.placeholder !== ph) this.secret.placeholder = ph;
    this.showFields();
  }

  async refresh(): Promise<void> {
    const s = await api.comfyuiAuth();
    if (!s) { setText(this.note, 'The formvis engine is offline: ComfyUI sign-in needs it.'); return; }
    this.show(s);
  }

  private async save(forget: boolean): Promise<void> {
    try {
      const s = await api.comfyuiAuthSave(this.mode.value as ComfyAuth['mode'], this.user.value, this.header.value, forget ? null : this.secret.value.trim() || null, forget);
      this.show(s);
      setText(this.note, forget ? 'Secret forgotten.' : s.mode === 'none' ? 'ComfyUI is reached without signing in.' : `Saved: ${s.mode === 'basic' ? 'basic sign-in' : s.mode === 'bearer' ? 'a bearer token' : `the ${s.header} header`}${s.hasSecret ? '' : ', with no secret set yet'}.`);
    } catch (err) { setText(this.note, failure(err, 'Could not save.')); }
  }
}

/** Preferences > Plugins > Helper model folder: where helper models are kept, from the next engine start. */
export class ModelFolderSection {
  readonly el = el('<div class="cv-panel-section cv-models-folder"><span class="cv-refs-title">Helper model folder</span></div>');
  private readonly path = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Helper model folder path" placeholder="Full folder path, or empty for the data folder" spellcheck="false" maxlength="1024">');
  private readonly note = el('<p class="cv-note" role="status" style="min-height: 2.8em"></p>');
  private readonly scanPath = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="ComfyUI models folder path" placeholder="Full path of a ComfyUI models folder" spellcheck="false" maxlength="1024">');
  private readonly scanNote = el('<p class="cv-note" role="status" style="min-height: 2.8em">Scan finds helper models you already have under any name or layout (a ComfyUI models folder, say) and links them in, without copying.</p>');

  constructor() {
    const use = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Use this folder</button>'), reset = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Use the data folder</button>');
    const buttons = el('<div class="cv-improve"></div>'), scan = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Scan</button>'), same = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Use it as the helper model folder</button>');
    buttons.append(use, reset);
    const scanButtons = el('<div class="cv-improve"></div>');
    scanButtons.append(scan, same);
    this.el.append(row('Folder', this.path), buttons, this.note, row('Other folder', this.scanPath), scanButtons, this.scanNote);
    use.addEventListener('click', () => void this.save(this.path.value));
    reset.addEventListener('click', () => void this.save(''));
    scan.addEventListener('click', () => void this.scan());
    same.addEventListener('click', () => { setValue(this.path, this.scanPath.value.trim()); void this.save(this.scanPath.value.trim()); });
    for (const i of [this.path, this.scanPath]) i.addEventListener('keydown', (e) => e.stopPropagation());
  }

  private async scan(): Promise<void> {
    setText(this.scanNote, 'Scanning...');
    try {
      const r = await api.modelsScan(this.scanPath.value);
      setText(this.scanNote, r.linked.length ? `Linked ${r.linked.length} file${r.linked.length === 1 ? '' : 's'} from ${r.scanned} looked at: ${r.linked.slice(0, 3).join(', ')}${r.linked.length > 3 ? '...' : ''}.` : `Looked at ${r.scanned} files; none of the helper models still to download are in there.`);
    } catch (err) { setText(this.scanNote, failure(err, 'Could not scan that folder.')); }
  }

  private show(f: ModelsFolder): void {
    if (document.activeElement !== this.path) setValue(this.path, f.saved);
    const parts = [`In use: ${f.active}.`];
    if (f.env) parts.push('FORMVIS_MODELS_DIR is set in the environment and takes precedence over this choice.');
    else if (f.restart) parts.push('The new folder is used from the next start of formvis; models already downloaded stay where they are.');
    setText(this.note, parts.join(' '));
  }

  async refresh(): Promise<void> {
    const f = await api.modelsFolder();
    if (!f) { setText(this.note, 'The formvis engine is offline: the helper model folder needs it.'); return; }
    this.show(f);
  }

  private async save(path: string): Promise<void> {
    try { this.show(await api.modelsFolderSave(path)); } catch (err) { setText(this.note, failure(err, 'Could not save the folder.')); }
  }
}

/** Preferences > Plugins > Recipes: the ComfyUI workflows kept as choices (Generative Fill, Generate Image), grouped by what
 *  they take in, each group collapsible with its count, with Remove and Add. Groups and rows are built once and patched. */
export class RecipesSection {
  readonly el = el('<div class="cv-panel-section cv-recipes"><span class="cv-refs-title">Recipes (ComfyUI workflows)</span></div>');
  private readonly groups = new Map<RecipeFamily, { box: HTMLDetailsElement; title: HTMLElement; list: HTMLElement }>();
  private readonly empty = el('<p class="cv-note">No workflows kept yet. Add one saved from ComfyUI with Export (API).</p>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly input = el<HTMLInputElement>('<input type="file" accept=".json,application/json" multiple hidden aria-label="Add workflows">');

  constructor() {
    this.el.append(this.empty);
    for (const [family] of RECIPE_FAMILIES) {
      const box = el<HTMLDetailsElement>(`<details class="cv-recipes-group" data-family="${family}" open hidden><summary></summary></details>`), list = el('<div class="cv-recipes-list"></div>');
      box.append(list);
      this.el.append(box);
      this.groups.set(family, { box, title: box.querySelector('summary') as HTMLElement, list });
    }
    const add = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Add workflow</button>'), bar = el('<div class="cv-improve"></div>');
    bar.append(add, this.input);
    this.el.append(bar, this.note);
    add.addEventListener('click', () => this.input.click());
    this.input.addEventListener('change', () => void this.read());
    this.refresh();
  }

  refresh(): void {
    const all = recipes().map((r) => ({ ...r, ...recipeFamily(r.json) }));
    setHidden(this.empty, all.length > 0);
    for (const [family, label] of RECIPE_FAMILIES) {
      const g = this.groups.get(family) as { box: HTMLDetailsElement; title: HTMLElement; list: HTMLElement }, items = all.filter((r) => r.family === family);
      setHidden(g.box, items.length === 0);
      setText(g.title, `${label} (${items.length})`);
      patch(g.list, items, {
        key: (r) => r.name,
        create: (r) => {
          const line = el('<div class="cv-plugins-row"><span></span><button type="button" class="cv-btn cv-btn-ghost">Remove</button></div>');
          (line.querySelector('button') as HTMLButtonElement).addEventListener('click', () => { removeRecipe(r.name); this.refresh(); setText(this.note, `${r.name} removed.`); });
          return line;
        },
        update: (node, r) => setText(node.querySelector('span'), `${r.name} · ${r.nodes} nodes`),
      });
    }
  }

  private async read(): Promise<void> {
    const files = Array.from(this.input.files ?? []);
    this.input.value = '';
    const problems: string[] = [];
    let added = 0;
    for (const f of files.slice(0, 20)) {
      let text = await f.text();
      try { text = await apiWorkflow(text, loadPrefs().comfyuiUrl, f.name); } catch (err) { problems.push(err instanceof Error ? err.message : `${f.name} could not be converted.`); continue; }
      const p = addRecipe(f.name, text);
      if (p) problems.push(p); else added++;
    }
    this.refresh();
    setText(this.note, `${added} workflow${added === 1 ? '' : 's'} added${problems.length ? `. ${problems[0]}` : '.'}`);
  }
}

/** Import and Export for prompt templates as Markdown files: front matter (name, use) then the instruction; {prompt} in the
 *  instruction stands for the prompt being improved. */
export class TemplateFiles {
  readonly el = el('<div class="cv-improve cv-template-files"></div>');
  private readonly input = el<HTMLInputElement>('<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple hidden aria-label="Import prompt templates">');

  constructor(private readonly selected: () => string, private readonly note: HTMLElement, private readonly changed: (name: string) => void) {
    const imp = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Import</button>'), exp = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Export</button>');
    this.el.append(imp, exp, this.input);
    imp.addEventListener('click', () => this.input.click());
    this.input.addEventListener('change', () => void this.read());
    exp.addEventListener('click', () => this.write());
  }

  private async read(): Promise<void> {
    const files = Array.from(this.input.files ?? []);
    this.input.value = '';
    const list = templates();
    let added = 0, skipped = 0, last = '';
    for (const f of files.slice(0, 40)) {
      const t = templateFromMarkdown(await f.text(), f.name.replace(/\.[^.]+$/, ''));
      if (!t) { skipped++; continue; }
      const i = list.findIndex((x) => x.name === t.name);
      if (i >= 0) list[i] = t; else list.push(t);
      added++; last = t.name;
    }
    if (added) { saveTemplates(list); this.changed(last); }
    setText(this.note, `${added} template${added === 1 ? '' : 's'} imported${skipped ? `, ${skipped} skipped (empty, or not for Improve Prompt)` : ''}.`);
  }

  private write(): void {
    const t = templates().find((x) => x.name === this.selected());
    if (!t) return;
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([templateToMarkdown(t)], { type: 'text/markdown' }));
    a.href = url;
    a.download = `${t.name.replace(/[\\/:*?"<>|]+/g, '_')}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setText(this.note, `Exported ${a.download}.`);
  }
}

/** Preferences > Interface > Skins: window skins from the data folder (JSON files of token colours). Reload skins reads the
 *  folder again, adding, updating and removing swatches in the theme picker in place; refused files are listed with why. */
export class SkinsSection {
  readonly el = el('<div class="cv-panel-section cv-skins"><span class="cv-refs-title">Skins</span></div>');
  private readonly list = el('<div class="cv-skins-list"></div>');
  private readonly note = el('<p class="cv-note" role="status">A skin is a JSON file in the skins folder: a name, light or dark, and colours for the window\'s tokens.</p>');
  private folder = '';

  constructor(private readonly grid: HTMLElement) {
    const reload = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Reload skins</button>'), open = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Open folder</button>'), bar = el('<div class="cv-improve"></div>');
    bar.append(reload, open);
    this.el.append(this.list, bar, this.note);
    reload.addEventListener('click', () => void this.reload(true));
    open.addEventListener('click', () => { if (this.folder) void api.revealPath(this.folder).catch((err) => setText(this.note, failure(err, 'Could not open the folder.'))); });
  }

  async reload(say = false): Promise<void> {
    const r = await api.skins();
    if (!r) { if (say) setText(this.note, 'The formvis engine is offline: skins need it.'); return; }
    this.folder = r.folder;
    const { removed } = registerSkins(r.skins);
    for (const id of removed) this.grid.querySelector(`[data-theme-id="${id}"]`)?.remove();
    for (const s of r.skins) {
      const id = `skin-${s.id}`, t = THEMES[id];
      let b = this.grid.querySelector<HTMLElement>(`[data-theme-id="${id}"]`);
      if (!b) { b = el('<button class="nm-theme-swatch" data-user-skin="1"></button>'); b.dataset.themeId = id; this.grid.append(b); }
      b.title = s.label;
      b.style.background = t.vars['--bg-secondary'];
      b.style.borderColor = t.vars['--border-color'];
    }
    if (readChoice().theme.startsWith('skin-')) applyTheme();
    patch(this.list, r.skins, {
      key: (s) => s.id,
      create: () => el('<div class="cv-plugins-row"><span></span></div>'),
      update: (node, s) => setText(node.querySelector('span'), `${s.label}${s.version ? ` ${s.version}` : ''}${s.author ? ` · ${s.author}` : ''} · ${s.light ? 'light' : 'dark'}`),
    });
    if (say || r.errors.length) setText(this.note, r.errors.length ? `${r.errors.length} skin file${r.errors.length === 1 ? '' : 's'} refused: ${r.errors.slice(0, 3).map((e) => `${e.file} ${e.error}`).join('; ')}.` : r.skins.length ? `${r.skins.length} skin${r.skins.length === 1 ? '' : 's'} loaded from ${r.folder}.` : `No skins yet. Put .json files in ${r.folder}.`);
  }
}

/** Preferences > Performance > Rendering: the tile engine for pictures larger than one canvas holds. On keeps them in tiles
 *  (they open, zoom and pan); off refuses such sizes. The choice is kept on this device, applies to new documents at once
 *  and to open ones after Restart now (which reloads the window as Reload Window does). */
export class RenderingSection {
  readonly el = el('<div class="cv-panel-section cv-rendering"><span class="cv-refs-title">Rendering</span></div>');
  private readonly mode = el<HTMLSelectElement>('<select class="cv-input" aria-label="Tile engine"><option value="on">On: giant pictures are kept in tiles</option><option value="off">Off: pictures past one canvas are refused</option></select>');
  private readonly note = el('<p class="cv-note" role="status"></p>');

  constructor(apply: (on: boolean) => void, restart: () => void) {
    const now = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Restart now</button>'), bar = el('<div class="cv-improve"></div>');
    bar.append(now);
    this.el.append(row('Tile engine', this.mode), bar, this.note);
    this.show();
    this.mode.addEventListener('change', () => {
      try { localStorage.setItem('formvis_tile_engine', this.mode.value); } catch { /* kept for this session only */ }
      apply(this.mode.value === 'on');
      this.show();
    });
    now.addEventListener('click', restart);
  }

  show(): void {
    let v = 'on';
    try { v = localStorage.getItem('formvis_tile_engine') === 'off' ? 'off' : 'on'; } catch { /* the default */ }
    if (this.mode.value !== v) this.mode.value = v;
    setText(this.note, v === 'on' ? 'New pictures larger than one canvas (a side past 30,000 px, or more pixels than the limit above) open in tiles.' : 'Such sizes are refused. Restart now applies this to the documents already open.');
  }
}

/** Preferences > Plugins > Updates: Check now runs Help > Check for Updates, which says what it found, shows the release
 *  notes and offers Restart and update. */
export class UpdatesSection {
  readonly el = el('<div class="cv-panel-section cv-updates"><span class="cv-refs-title">Updates</span></div>');

  constructor(run: () => void, version: string) {
    const check = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Check now</button>'), bar = el('<div class="cv-improve"></div>');
    bar.append(check);
    this.el.append(el('<p class="cv-note"></p>'), bar);
    setText(this.el.querySelector('.cv-note'), `This is formvis ${version}. The desktop app looks for a new version when it starts and asks before installing; nothing is installed without your yes. A portable copy opens the releases page instead.`);
    check.addEventListener('click', run);
  }
}

const size = (bytes: number): string => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : bytes >= 1e3 ? `${Math.round(bytes / 1e3)} KB` : `${bytes} B`;

/** Preferences > Plugins > Hugging Face token: for helper models that sit behind a licence there. The engine keeps it in the
 *  system's password store, sends it only to huggingface.co, and shows only its last four characters. */
export class HuggingFaceToken {
  readonly el = el('<div class="cv-panel-section cv-hf-token"><span class="cv-refs-title">Hugging Face token</span></div>');
  private readonly token = el<HTMLInputElement>('<input class="cv-input" type="password" aria-label="Hugging Face token" placeholder="hf_..." autocomplete="new-password" spellcheck="false" maxlength="256">');
  private readonly note = el('<p class="cv-note" role="status">Only needed for a helper model that asks you to accept a licence on Hugging Face before it downloads.</p>');

  constructor() {
    const save = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Save</button>'), forget = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Forget token</button>'), buttons = el('<div class="cv-improve"></div>');
    buttons.append(save, forget);
    this.el.append(row('Token', this.token), buttons, this.note);
    save.addEventListener('click', () => void this.save(false));
    forget.addEventListener('click', () => void this.save(true));
    this.token.addEventListener('keydown', (e) => e.stopPropagation());
  }

  private show(s: { hasKey: boolean; last4: string }): void {
    this.token.value = '';
    const ph = s.hasKey ? `Saved, ends ${s.last4 || 'hidden'} (type to replace)` : 'Not set';
    if (this.token.placeholder !== ph) this.token.placeholder = ph;
  }

  async refresh(): Promise<void> {
    const s = await api.hfToken();
    if (s) this.show(s); else setText(this.note, 'The formvis engine is offline: the token needs it.');
  }

  private async save(forget: boolean): Promise<void> {
    try {
      const s = await api.hfTokenSave(forget ? null : this.token.value.trim() || null, forget);
      this.show(s);
      setText(this.note, forget ? 'Token forgotten.' : s.hasKey ? 'Saved.' : 'Nothing to save.');
    } catch (err) { setText(this.note, failure(err, 'Could not save.')); }
  }
}

/** Preferences > Plugins > API keys: fal and any other provider the engine lists, each with whether a key is kept, where,
 *  its last four characters, a link to get one (fal) and Clear. The group collapses; rows are built once and patched. */
export class ApiKeysSection {
  readonly el = el('<details class="cv-panel-section cv-api-keys" open><summary class="cv-refs-title">API keys</summary></details>');
  private readonly list = el('<div class="cv-api-keys-list"></div>');
  private readonly note = el('<p class="cv-note" role="status">Keys are kept in your system\'s password store; only the last four characters are shown here.</p>');
  private rows: Array<{ id: string; name: string; configured: boolean; source: string | null; last4: string }> = [];

  constructor() {
    this.el.append(this.list, this.note);
  }

  async refresh(): Promise<void> {
    const [fal, others] = await Promise.all([api.generativeStatus(), api.providers()]);
    this.rows = [...(fal ? [{ id: 'fal', name: 'fal', configured: fal.configured, source: fal.source, last4: fal.last4 ?? '' }] : []), ...others.map((p) => ({ id: p.id, name: p.name, configured: p.configured, source: p.source, last4: p.last4 ?? '' }))];
    patch(this.list, this.rows, {
      key: (r) => r.id,
      create: (r) => {
        const line = el('<div class="cv-plugins-row"><span></span><a class="cv-btn cv-btn-ghost" target="_blank" rel="noopener" hidden>Get a key</a><button type="button" class="cv-btn cv-btn-ghost">Clear</button></div>');
        if (r.id === 'fal') { const a = line.querySelector('a') as HTMLAnchorElement; a.href = 'https://fal.ai/dashboard/keys'; setHidden(a, false); }
        (line.querySelector('button') as HTMLButtonElement).addEventListener('click', () => void this.clear(r.id, r.name));
        return line;
      },
      update: (node, r) => {
        setText(node.querySelector('span'), `${r.name}: ${r.configured ? `key kept${r.last4 ? `, ends ${r.last4}` : ''}${r.source === 'environment' ? ' (set in the environment)' : ''}` : 'no key'}`);
        const b = node.querySelector('button') as HTMLButtonElement;
        b.disabled = !r.configured || r.source === 'environment';
      },
    });
  }

  private async clear(id: string, name: string): Promise<void> {
    try { if (id === 'fal') await api.forgetGenerativeKey(); else await api.forgetProviderKey(id); setText(this.note, `${name} key cleared.`); } catch (err) { setText(this.note, failure(err, 'Could not clear the key.')); }
    await this.refresh();
  }
}

/** Preferences > Plugins > Local files: what formvis keeps on this computer, folder by folder, Open folder for each, and
 *  Remove unreferenced for the stale generated pictures and half-finished model downloads. */
export class LocalFilesSection {
  readonly el = el('<div class="cv-panel-section cv-local-files"><span class="cv-refs-title">Local files</span></div>');
  private readonly list = el('<div class="cv-local-files-list"></div>');
  private readonly note = el('<p class="cv-note" role="status" style="min-height: 1.4em"></p>');
  private readonly clean = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Remove unreferenced files</button>');

  constructor() {
    const bar = el('<div class="cv-improve"></div>');
    bar.append(this.clean);
    this.el.append(this.list, bar, this.note);
    this.clean.addEventListener('click', () => void this.removeStale());
  }

  async refresh(): Promise<void> {
    const s = await api.localFiles();
    if (!s) { setText(this.note, 'The formvis engine is offline: the file list needs it.'); return; }
    patch(this.list, s.folders, {
      key: (f) => f.id,
      create: (f) => {
        const line = el('<div class="cv-plugins-row"><span></span><button type="button" class="cv-btn cv-btn-ghost">Open folder</button></div>');
        (line.querySelector('button') as HTMLButtonElement).addEventListener('click', () => void api.revealPath(f.path).catch((err) => setText(this.note, failure(err, 'Could not open the folder.'))));
        return line;
      },
      update: (node, f) => { setText(node.querySelector('span'), `${f.label} · ${f.files.toLocaleString('en-US')} file${f.files === 1 ? '' : 's'} · ${size(f.bytes)}`); node.setAttribute('title', f.path); },
    });
    this.clean.disabled = s.unreferenced.files === 0;
    setText(this.note, s.unreferenced.files ? `${s.unreferenced.files} unreferenced file${s.unreferenced.files === 1 ? '' : 's'} (${size(s.unreferenced.bytes)}): generated pictures left over for a day, and model downloads that stopped.` : 'Nothing unreferenced.');
  }

  private async removeStale(): Promise<void> {
    try { const r = await api.localFilesClean(); await this.refresh(); setText(this.note, `Removed ${r.removed} file${r.removed === 1 ? '' : 's'} (${size(r.bytes)}).`); } catch (err) { setText(this.note, failure(err, 'Could not remove them.')); }
  }
}

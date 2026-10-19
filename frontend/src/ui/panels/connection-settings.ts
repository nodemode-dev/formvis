import { api, type ComfyAuth, type ModelsFolder } from '../../io/api';
import { addRecipe, RECIPE_FAMILIES, recipeFamily, recipes, removeRecipe, type RecipeFamily } from '../../io/comfy';
import { saveTemplates, templateFromMarkdown, templateToMarkdown, templates } from '../../io/prompt-templates';
import { el, patchList, setHidden, setText, setValue } from '../dom';

const row = (label: string, ...c: HTMLElement[]): HTMLElement => { const r = el('<label class="cv-dialog-row"><span></span></label>'); setText(r.querySelector('span'), label); r.append(...c); return r; };
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

  constructor() {
    const use = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Use this folder</button>'), reset = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Use the data folder</button>');
    const buttons = el('<div class="cv-improve"></div>');
    buttons.append(use, reset);
    this.el.append(row('Folder', this.path), buttons, this.note);
    use.addEventListener('click', () => void this.save(this.path.value));
    reset.addEventListener('click', () => void this.save(''));
    this.path.addEventListener('keydown', (e) => e.stopPropagation());
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
      patchList(g.list, items, {
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
    for (const f of files.slice(0, 20)) { const p = addRecipe(f.name, await f.text()); if (p) problems.push(p); else added++; }
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

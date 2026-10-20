import { api, type ComfyAuth, type LlmRow, type LlmStatus, type ModelsFolder } from '../../io/api';
import { addRecipe, apiWorkflow, DEFAULT_REFERENCE_NAME, hiddenBuiltins, hideBuiltin, RECIPE_FAMILIES, recipeFamily, recipeVersions, recipes, REFERENCE_NAMES, removeRecipe, resendRecipeInputs, restoreRecipeVersion, setRecipeRefs, syncRecipeFolder, uniqueRecipeName, type Recipe, type RecipeFamily } from '../../io/comfy';
import { folderTemplateCount, saveTemplates, syncTemplates, templateFromMarkdown, templateToMarkdown, templates } from '../../io/prompt-templates';
import { el, patchList, setHidden, setText, setValue } from '../dom';
import { confirmAction } from '../dialogs';
import { loadPrefs, setUpdateAtStart, updateAtStart } from '../prefs';
import { DEFAULT_THEME, THEMES, applyTheme, readChoice, registerSkins, setTheme } from '../themes';

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

/** Preferences > Plugins > Plug-ins folder: one more folder of plugin folders, read only, listed with the data folder's.
 *  Each plugin there still asks for approval on enable and runs in its sealed worker. Reload Plugins picks up a change. */
export class PluginsFolderSection {
  readonly el = el('<div class="cv-panel-section cv-plugins-folder"><span class="cv-refs-title">Plug-ins folder</span></div>');
  private readonly path = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Plug-ins folder path" placeholder="Full folder path, or empty for the data folder only" spellcheck="false" maxlength="1024">');
  private readonly note = el('<p class="cv-note" role="status" style="min-height: 2.8em"></p>');
  onSaved: () => void = () => {};

  constructor() {
    const use = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Use this folder</button>'), clear = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Data folder only</button>');
    const buttons = el('<div class="cv-improve"></div>');
    buttons.append(use, clear);
    this.el.append(row('Folder', this.path), buttons, this.note);
    use.addEventListener('click', () => void this.save(this.path.value));
    clear.addEventListener('click', () => void this.save(''));
    this.path.addEventListener('keydown', (e) => e.stopPropagation());
  }

  private show(f: { path: string; data: string }): void {
    if (document.activeElement !== this.path) setValue(this.path, f.path);
    setText(this.note, f.path ? `Plugin folders in ${f.path} are listed with the ones in ${f.data}; a folder of the same name in the data folder wins. The chosen folder is only read.` : `Plugin folders are read from ${f.data}.`);
  }

  async refresh(): Promise<void> {
    const f = await api.pluginsExtraFolder();
    if (!f) { setText(this.note, 'The formvis engine is offline: the plug-ins folder needs it.'); return; }
    this.show(f);
  }

  private async save(path: string): Promise<void> {
    try { this.show(await api.pluginsExtraFolderSave(path)); this.onSaved(); } catch (err) { setText(this.note, failure(err, 'Could not use that folder.')); }
  }
}

/** Preferences > Plugins > Plug-ins: one switch for each plug-in file and plug-in folder. A plug-in that is off does not run;
 *  a plug-in folder asks for approval when it is turned on, and the switch shows what was decided. Rows are made once and patched. */
export interface PluginSwitch { id: string; name: string; on: boolean }
export class PluginSwitchesSection {
  readonly el = el('<div class="cv-panel-section cv-plugin-switches"><span class="cv-refs-title">Plug-ins</span></div>');
  private readonly list = el('<div class="cv-plugin-switch-list" style="min-height: 1.8em"></div>');
  private readonly note = el('<p class="cv-note" role="status" style="min-height: 2.8em"></p>');
  rows: () => Promise<PluginSwitch[]> = async () => [];
  set: (id: string, on: boolean) => Promise<void> = async () => {};

  constructor() { this.el.append(this.list, this.note); }

  async refresh(): Promise<void> {
    let items: PluginSwitch[] = [];
    try { items = await this.rows(); } catch { /* none are listed */ }
    patch(this.list, items, {
      key: (i) => i.id,
      create: () => {
        const node = el('<label class="cv-field cv-check"><span></span><input type="checkbox"></label>');
        const box = node.querySelector('input') as HTMLInputElement;
        box.addEventListener('change', () => { void this.set(node.dataset.key ?? '', box.checked).catch(() => {}).finally(() => void this.refresh()); });
        return node;
      },
      update: (node, i) => {
        setText(node.querySelector('span'), i.name);
        const box = node.querySelector('input') as HTMLInputElement;
        box.setAttribute('aria-label', i.name);
        if (box.checked !== i.on) box.checked = i.on;
      },
    });
    setText(this.note, items.length ? 'A plug-in that is off does not run and keeps no commands, panels or tools. A plug-in folder asks for approval when it is turned on.' : 'No plug-ins are installed. Put a plug-in file or a plug-in folder in the plug-ins folder, then choose Reload Plugins.');
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
  private readonly replace = el<HTMLInputElement>('<input type="file" accept=".json,application/json" hidden aria-label="Update a workflow">');
  private updating = '';
  private readonly fork = el<HTMLInputElement>('<input type="file" accept=".json,application/json" hidden aria-label="Save a workflow as a new recipe">');
  private forking = '';
  private readonly removed: Recipe[] = [];
  private readonly undoBtn = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Brings back the recipes removed since the window opened, the last one first" disabled>Undo remove</button>');
  private readonly restoreBtn = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Shows the built-in recipes that were hidden" disabled>Restore built-in recipes</button>');

  constructor() {
    this.el.append(this.empty, this.replace, this.fork);
    this.replace.addEventListener('change', () => void this.update());
    this.fork.addEventListener('change', () => void this.saveAsNew());
    for (const [family] of RECIPE_FAMILIES) {
      const box = el<HTMLDetailsElement>(`<details class="cv-recipes-group" data-family="${family}" open hidden><summary></summary></details>`), list = el('<div class="cv-recipes-list"></div>');
      box.append(list);
      this.el.append(box);
      this.groups.set(family, { box, title: box.querySelector('summary') as HTMLElement, list });
    }
    const add = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Add workflow</button>'), bar = el('<div class="cv-improve"></div>');
    const open = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Workflow files in this folder are kept as recipes">Open folder</button>');
    bar.append(add, open, this.undoBtn, this.restoreBtn, this.input);
    this.el.append(bar, this.note);
    this.undoBtn.addEventListener('click', () => this.undo());
    this.restoreBtn.addEventListener('click', () => { hideBuiltin(null); this.refresh(); setText(this.note, 'The built-in recipes are shown again.'); });
    add.addEventListener('click', () => this.input.click());
    open.addEventListener('click', () => void syncRecipeFolder().then((r) => {
      if (!r) { setText(this.note, 'The formvis engine is offline: the recipes folder needs it.'); return; }
      this.refresh();
      setText(this.note, `Recipes folder: ${r.folder}`);
      return api.revealPath(r.folder);
    }).catch((err) => setText(this.note, failure(err, 'Could not open the folder.'))));
    this.input.addEventListener('change', () => void this.read());
    this.refresh();
    void syncRecipeFolder().then((r) => { if (r?.added) this.refresh(); });
  }

  refresh(): void {
    const all = recipes().map((r) => ({ ...r, ...recipeFamily(r.json) }));
    setHidden(this.empty, all.length > 0);
    this.undoBtn.disabled = this.removed.length === 0;
    this.restoreBtn.disabled = hiddenBuiltins().length === 0;
    for (const [family, label] of RECIPE_FAMILIES) {
      const g = this.groups.get(family) as { box: HTMLDetailsElement; title: HTMLElement; list: HTMLElement }, items = all.filter((r) => r.family === family);
      setHidden(g.box, items.length === 0);
      setText(g.title, `${label} (${items.length})`);
      patch(g.list, items, {
        key: (r) => r.name,
        create: (r) => {
          const line = el('<div class="cv-plugins-row"><span></span><select class="cv-input" data-act="refs" aria-label="Picture names in the prompt" title="How @img1, @img2 are written into the prompt for this workflow"></select><button type="button" class="cv-btn cv-btn-ghost" data-act="edit" title="Copies the workflow and opens ComfyUI; paste it on the canvas">Edit in ComfyUI</button><button type="button" class="cv-btn cv-btn-ghost" data-act="update" title="Replace this recipe with a workflow saved from ComfyUI">Update...</button><button type="button" class="cv-btn cv-btn-ghost" data-act="fork" title="Keep a workflow saved from ComfyUI as a new recipe beside this one, which stays as it is">Save as new...</button><select class="cv-input" data-act="versions" aria-label="Earlier versions" title="Earlier texts of this recipe that a save replaced; choosing one brings it back" hidden></select><button type="button" class="cv-btn cv-btn-ghost" data-act="inputs" title="Send the pictures formvis sent to ComfyUI for this recipe again, from the copies in the data folder">Send inputs</button><button type="button" class="cv-btn cv-btn-ghost" data-act="remove">Remove</button></div>');
          const act = (name: string): HTMLButtonElement => line.querySelector(`[data-act="${name}"]`) as HTMLButtonElement;
          const names = line.querySelector('[data-act="refs"]') as unknown as HTMLSelectElement;
          names.replaceChildren(...REFERENCE_NAMES.map(([pattern, example]) => { const o = document.createElement('option'); o.value = pattern; o.textContent = `@img1 as ${example.split(',')[0]}`; o.title = example; return o; }));
          names.addEventListener('change', () => { if (setRecipeRefs(r.name, names.value)) setText(this.note, `${r.name}: @img1, @img2 are written as ${REFERENCE_NAMES.find(([p]) => p === names.value)?.[1] ?? names.value}.`); });
          act('remove').addEventListener('click', () => void this.drop(r.name, line.dataset.builtin === 'true'));
          act('update').addEventListener('click', () => { this.updating = r.name; this.replace.click(); });
          act('edit').addEventListener('click', () => void this.edit(r.name));
          act('fork').addEventListener('click', () => { this.forking = r.name; this.fork.click(); });
          act('inputs').addEventListener('click', () => void this.resend(r.name));
          const versions = line.querySelector('[data-act="versions"]') as unknown as HTMLSelectElement;
          versions.addEventListener('change', () => {
            const at = Number(versions.value);
            versions.value = '';
            if (Number.isInteger(at) && at >= 0) { const p = restoreRecipeVersion(r.name, at); this.refresh(); setText(this.note, p ?? `${r.name} is back to an earlier version.`); }
          });
          return line;
        },
        update: (node, r) => {
          node.dataset.builtin = r.builtin ? 'true' : 'false';
          const names = node.querySelector('[data-act="refs"]') as HTMLSelectElement, want = r.refs ?? DEFAULT_REFERENCE_NAME;
          if (names.value !== want) names.value = want;
          setHidden(names, !!r.builtin);
          setText(node.querySelector('span'), r.builtin ? `${r.name} · built in` : `${r.name} · ${r.nodes} nodes`);
          setText(node.querySelector('[data-act="remove"]'), r.builtin ? 'Hide' : 'Remove');
          const versions = node.querySelector('[data-act="versions"]') as HTMLSelectElement, older = recipeVersions(r.name), sig = older.map((v) => v.time).join(',');
          setHidden(versions, older.length === 0);
          if (versions.dataset.sig !== sig) {
            versions.dataset.sig = sig;
            versions.replaceChildren(...[`Versions (${older.length})`, ...older.map((v) => `Back to ${new Date(v.time).toLocaleString()}`)].map((t, i) => { const o = document.createElement('option'); o.value = i === 0 ? '' : String(i - 1); o.textContent = t; return o; }));
            versions.value = '';
          }
        },
      });
    }
  }

  /** Remove asks once and keeps what it removed for Undo remove until the window closes; a built-in recipe is only hidden. */
  private async drop(name: string, builtin: boolean): Promise<void> {
    if (builtin) { hideBuiltin(name); this.refresh(); setText(this.note, `${name} hidden. Restore built-in recipes shows it again.`); return; }
    if (!(await confirmAction('Remove recipe?', `${name} will be removed from the recipes and from the recipes folder. Undo remove brings it back until the window closes.`, 'Remove', true))) return;
    const was = removeRecipe(name);
    if (was) this.removed.push(was);
    this.refresh();
    setText(this.note, `${name} removed.`);
  }

  private undo(): void {
    const r = this.removed.pop();
    if (!r) return;
    const problem = addRecipe(r.name, r.json);
    if (!problem && r.refs) setRecipeRefs(r.name, r.refs);
    this.refresh();
    setText(this.note, problem ?? `${r.name} is back.`);
  }

  /** Edit in ComfyUI: the kept graph goes to the clipboard and ComfyUI opens in a new tab, ready for a paste on its canvas. */
  private async edit(name: string): Promise<void> {
    const r = recipes().find((x) => x.name === name), url = loadPrefs().comfyuiUrl;
    if (!r) return;
    if (!/^https?:\/\//i.test(url)) { setText(this.note, 'Set the ComfyUI address in Preferences > Plugins first.'); return; }
    let copied = true;
    try { await navigator.clipboard.writeText(r.json); } catch { copied = false; }
    window.open(url, '_blank', 'noopener');
    setText(this.note, `${copied ? `${name} copied: paste it on the ComfyUI canvas (Ctrl+V)` : `${name} could not be copied: open it from your own file`}, edit it, then Export (API) and choose Update... on ${name}.`);
  }

  /** Update...: the chosen workflow (API or editor format) replaces the recipe of the same name, then the connected ComfyUI is asked what it still lacks. */
  private async update(): Promise<void> {
    const f = this.replace.files?.[0], name = this.updating;
    this.replace.value = '';
    if (!f || !name) return;
    try {
      const text = await apiWorkflow(await f.text(), loadPrefs().comfyuiUrl, f.name), problem = addRecipe(name, text);
      this.refresh();
      if (problem) { setText(this.note, problem); return; }
      const probe = await api.comfyuiProbe(loadPrefs().comfyuiUrl, [{ name, workflow: text }]).catch(() => null), c = probe?.recipes?.find((x) => x.name === name);
      const gaps = c ? [c.missing_nodes.length ? `${c.missing_nodes.length} missing node${c.missing_nodes.length === 1 ? '' : 's'} (${c.missing_nodes.join(', ')})` : '', c.missing_models.length ? `${c.missing_models.length} model file${c.missing_models.length === 1 ? '' : 's'} not listed (${c.missing_models.map((m) => m.name).join(', ')})` : ''].filter(Boolean) : [];
      setText(this.note, `${name} updated${c ? (gaps.length ? `. ComfyUI lacks ${gaps.join(' and ')}.` : '. ComfyUI has every node and model it needs.') : '. ComfyUI did not answer, so its nodes were not checked.'}`);
    } catch (err) { setText(this.note, err instanceof Error ? err.message : `${f.name} could not be read.`); }
  }

  /** Save as new...: the chosen workflow becomes a recipe of its own name (or "<name> 2" when that is taken), the recipe it was started from untouched. */
  private async saveAsNew(): Promise<void> {
    const f = this.fork.files?.[0], from = this.forking;
    this.fork.value = '';
    if (!f) return;
    try {
      const text = await apiWorkflow(await f.text(), loadPrefs().comfyuiUrl, f.name), name = uniqueRecipeName(f.name), problem = addRecipe(name, text);
      this.refresh();
      setText(this.note, problem ?? `${name} saved as a new recipe${from ? `; ${from} is unchanged` : ''}.`);
    } catch (err) { setText(this.note, err instanceof Error ? err.message : `${f.name} could not be read.`); }
  }

  /** Send inputs: the pictures formvis sent to ComfyUI that this recipe names go up again from the copies in the data folder. */
  private async resend(name: string): Promise<void> {
    const r = recipes().find((x) => x.name === name), url = loadPrefs().comfyuiUrl.trim();
    if (!r) return;
    if (!/^https?:\/\/./i.test(url)) { setText(this.note, 'Set the ComfyUI address in Preferences > Plugins first.'); return; }
    try {
      const s = await resendRecipeInputs(url, r.json);
      setText(this.note, s.held === 0 ? `${name} names none of the pictures formvis has copies of.` : `${s.sent} picture${s.sent === 1 ? '' : 's'} of ${name} sent to ComfyUI again${s.missing ? `; ${s.missing} no longer have a copy` : ''}.`);
    } catch (err) { setText(this.note, failure(err, 'The pictures could not be sent again.')); }
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
    const open = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Markdown files in this folder add templates, and one named like a kept template replaces it">Open folder</button>');
    this.el.append(imp, exp, open, this.input);
    open.addEventListener('click', () => void syncTemplates().then((folder) => {
      setText(this.note, folder ? `${folderTemplateCount()} template file${folderTemplateCount() === 1 ? '' : 's'} in ${folder}. Front matter: name, use: improve, assistant or generate, for: models or routes. Placeholders: {prompt} {width} {height} {size} {model}.` : 'The formvis engine is offline: the folder needs it.');
      if (folder) return api.revealPath(folder);
    }).catch((err) => setText(this.note, failure(err, 'Could not open the folder.'))));
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
    setText(this.note, `${added} template${added === 1 ? '' : 's'} imported${skipped ? `, ${skipped} skipped (empty, or with a use other than improve, assistant or generate)` : ''}.`);
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
  private readonly note = el('<p class="cv-note" role="status">A skin is a JSON file in the skins folder: a name, light or dark, colours for the window\'s tokens and optional css (or a .css file of the same name). Css may not load anything (no url, @import or @font-face) or hold script; a file that does is refused with the reason, and Reset skin brings the default look back.</p>');
  private folder = '';

  constructor(private readonly grid: HTMLElement) {
    const reload = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Reload skins</button>'), open = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Open folder</button>'), reset = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Reset skin</button>'), bar = el('<div class="cv-improve"></div>');
    bar.append(reload, open, reset);
    this.el.append(this.list, bar, this.note);
    reload.addEventListener('click', () => void this.reload(true));
    reset.addEventListener('click', () => { setTheme(DEFAULT_THEME); setText(this.note, 'The default look is back.'); });
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
    const chosen = readChoice().theme;
    if (chosen.startsWith('skin-')) { if (THEMES[chosen]) applyTheme(); else setTheme(DEFAULT_THEME); }
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

  private readonly status = el('<p class="cv-note" role="status"></p>');

  constructor(run: () => Promise<string> | void, version: string) {
    const check = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Check now</button>'), bar = el('<div class="cv-improve"></div>');
    const start = el<HTMLInputElement>('<input type="checkbox" aria-label="Check for updates when formvis starts">');
    bar.append(check);
    this.el.append(el('<p class="cv-note"></p>'), row('Check for updates when formvis starts', start), bar, this.status);
    setText(this.el.querySelector('.cv-note'), `This is formvis ${version}. The desktop app can look for a new version when it starts and asks before installing: Restart and update closes formvis once your documents are settled, and nothing is installed without your yes. Updates stay off in a build that carries no signing key (this one until the owner adds his): Check now then says so. A portable copy opens the releases page instead.`);
    start.checked = updateAtStart();
    start.addEventListener('change', () => { setUpdateAtStart(start.checked); setText(this.status, start.checked ? 'formvis will look for an update at each start of the desktop app.' : 'formvis will not look for updates by itself; Check now still works.'); });
    check.addEventListener('click', () => {
      setText(this.status, 'Checking...');
      Promise.resolve(run()).then((text) => setText(this.status, text || ''), (err) => setText(this.status, failure(err, 'Could not check for updates.')));
    });
  }
}

/** Preferences > General: where formvis keeps its data (the engine's data folder: documents, skins, plugins, logs) and why
 *  it is there, with Open folder. The folder is set by the --user-data-dir command-line flag or the FORMVIS_DATA_DIR
 *  environment variable, read when the engine starts; a portable copy keeps it beside the program. Window preferences live
 *  in the web view's own storage on this device. */
export class SettingsLocationSection {
  readonly el = el('<div class="cv-panel-section cv-settings-location"><span class="cv-refs-title">Settings location</span></div>');
  private readonly path = el<HTMLInputElement>('<input class="cv-input" type="text" readonly aria-label="Data folder" spellcheck="false">');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private folder = '';

  constructor() {
    const open = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Open folder</button>'), bar = el('<div class="cv-improve"></div>');
    bar.append(open);
    this.el.append(row('Data folder', this.path), bar, this.note);
    open.addEventListener('click', () => { if (this.folder) void api.revealPath(this.folder).catch((err) => setText(this.note, failure(err, 'Could not open the folder.'))); });
  }

  async refresh(): Promise<void> {
    const caps = await api.capabilities();
    if (!caps) { setText(this.note, 'The formvis engine is offline: the data folder is known only to it.'); return; }
    this.folder = caps.dataDir;
    if (this.path.value !== caps.dataDir) this.path.value = caps.dataDir;
    const why = caps.dataDirSource === 'override' ? 'Set by the --user-data-dir flag or the FORMVIS_DATA_DIR variable.' : caps.dataDirSource === 'portable' || caps.switches?.portable ? 'Portable copy: kept beside the program.' : 'The default place. Start formvis with --user-data-dir FOLDER, or set FORMVIS_DATA_DIR, to keep it elsewhere; a file named portable beside the program keeps it with the program.';
    setText(this.note, `${why} Window preferences (this page, theme, panels) are kept in the web view's storage on this device.`);
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

/** Preferences > Plugins > Language model: the models the person typed in (name, address, model, whether it reads pictures,
 *  an optional key), one in use for Improve Prompt and the assistant. The editor fields belong to the dialog; this holds the
 *  list, the name and picture choice, New and Remove. The select is built once and its options are patched. */
export class LlmRows {
  readonly el = el('<div class="cv-llm-rows"></div>');
  readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Language model name" maxlength="80" spellcheck="false" placeholder="A name for this row">');
  readonly vision = el<HTMLInputElement>('<input type="checkbox" aria-label="This model reads pictures">');
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input" aria-label="Saved language models"></select>');
  private rows: LlmRow[] = [];
  private adding = false;

  constructor(private readonly fields: { url: HTMLInputElement; model: HTMLInputElement; key: HTMLInputElement }, private readonly say: (text: string) => void) {
    const add = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">New</button>'), del = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Remove</button>'), bar = el('<div class="cv-improve"></div>');
    bar.append(add, del);
    this.el.append(row('Saved models', this.pick), bar, row('Name', this.name), row('Reads pictures', this.vision));
    this.name.addEventListener('keydown', (e) => e.stopPropagation());
    this.pick.addEventListener('change', () => void this.use());
    add.addEventListener('click', () => {
      this.adding = true;
      this.pick.selectedIndex = -1;
      for (const f of [this.name, this.fields.url, this.fields.model, this.fields.key]) f.value = '';
      this.vision.checked = false;
      this.fields.url.focus();
    });
    del.addEventListener('click', () => void this.remove());
  }

  show(s: LlmStatus): void {
    this.rows = s.rows;
    patch(this.pick, s.rows, {
      key: (r) => r.id,
      create: () => document.createElement('option'),
      update: (node, r) => { const o = node as HTMLOptionElement; o.value = r.id; setText(o, r.name === r.model ? r.model : `${r.name} · ${r.model}`); },
    });
    if (this.adding && !s.rows.some((r) => r.id === this.pick.value)) { this.pick.selectedIndex = -1; return; }
    this.adding = false;
    if (this.pick.value !== s.active) this.pick.value = s.active;
    const r = s.rows.find((x) => x.id === s.active);
    if (document.activeElement !== this.name) this.name.value = r?.name ?? '';
    this.vision.checked = !!r?.vision;
    if (document.activeElement !== this.fields.url) this.fields.url.value = r?.baseUrl ?? '';
    if (document.activeElement !== this.fields.model) this.fields.model.value = r?.model ?? '';
    this.fields.key.value = '';
    this.fields.key.placeholder = r?.hasKey ? 'Saved (type to replace)' : 'Optional for a service on this computer';
  }

  private async use(): Promise<void> {
    try { this.adding = false; this.show(await api.llmUseRow(this.pick.value)); this.say(`Using ${this.name.value}.`); } catch (err) { this.say(failure(err, 'Could not switch.')); }
  }

  private async remove(): Promise<void> {
    const id = this.adding ? '' : this.pick.value;
    if (!id) return;
    try { this.show(await api.llmDeleteRow(id)); this.say('Removed.'); } catch (err) { this.say(failure(err, 'Could not remove.')); }
  }

  /** Keeps the fields as a new row (after New, or when none is kept yet) or as the row shown; the new row is put in use. */
  async save(forgetKey: boolean): Promise<LlmStatus> {
    const id = this.adding || !this.rows.length ? null : this.pick.value, before = new Set(this.rows.map((r) => r.id));
    let s = await api.llmSaveRow(id, { name: this.name.value.trim(), baseUrl: this.fields.url.value.trim(), model: this.fields.model.value.trim(), vision: this.vision.checked }, forgetKey ? null : this.fields.key.value.trim() || null, forgetKey);
    const made = s.rows.find((r) => !before.has(r.id));
    if (made && s.active !== made.id) s = await api.llmUseRow(made.id);
    this.adding = false;
    this.show(s);
    return s;
  }
}

const KEY_LINKS: Readonly<Record<string, string>> = { fal: 'https://fal.ai/dashboard/keys', openai: 'https://platform.openai.com/api-keys', google: 'https://aistudio.google.com/apikey', bfl: 'https://dashboard.bfl.ai/api', ideogram: 'https://ideogram.ai/manage-api' };

/** Preferences > Plugins > API keys: fal, the providers already in formvis and the language model rows, each with whether a
 *  key is kept, where, its last four characters, whether the service refused it, a link to get one and Clear. The group
 *  collapses; rows are built once and patched. */
export class ApiKeysSection {
  readonly el = el('<details class="cv-panel-section cv-api-keys" open><summary class="cv-refs-title">API keys</summary></details>');
  private readonly list = el('<div class="cv-api-keys-list"></div>');
  private readonly note = el('<p class="cv-note" role="status">Keys are kept in your system\'s password store; only the last four characters are shown here.</p>');
  private rows: Array<{ id: string; name: string; configured: boolean; source: string | null; last4: string; refusedAt: number }> = [];
  private llm = new Map<string, LlmRow>();

  constructor() {
    this.el.append(this.list, this.note);
  }

  async refresh(): Promise<void> {
    const [fal, others, lm] = await Promise.all([api.generativeStatus(), api.providers(), api.llmStatus()]);
    this.llm = new Map((lm?.rows ?? []).map((r) => [`llm:${r.id}`, r]));
    this.rows = [...(fal ? [{ id: 'fal', name: 'fal', configured: fal.configured, source: fal.source, last4: fal.last4 ?? '', refusedAt: fal.refused ? fal.refusedAt || -1 : 0 }] : []), ...others.map((p) => ({ id: p.id, name: p.name, configured: p.configured, source: p.source, last4: p.last4 ?? '', refusedAt: p.refused ? p.refusedAt || -1 : 0 })),
      ...(lm?.rows ?? []).map((r) => ({ id: `llm:${r.id}`, name: r.name, configured: r.hasKey, source: 'settings', last4: r.last4 ?? '', refusedAt: r.refusedAt ?? 0 }))];
    patch(this.list, this.rows, {
      key: (r) => r.id,
      create: (r) => {
        const line = el('<div class="cv-plugins-row"><span></span><a class="cv-btn cv-btn-ghost" target="_blank" rel="noopener" hidden>Get a key</a><button type="button" class="cv-btn cv-btn-ghost">Clear</button></div>');
        const link = KEY_LINKS[r.id];
        if (link) { const a = line.querySelector('a') as HTMLAnchorElement; a.href = link; setHidden(a, false); }
        (line.querySelector('button') as HTMLButtonElement).addEventListener('click', () => void this.clear(r.id, r.name));
        return line;
      },
      update: (node, r) => {
        setText(node.querySelector('span'), `${r.name}: ${r.configured ? `key kept${r.last4 ? `, ends ${r.last4}` : ''}${r.source === 'environment' ? ' (set in the environment)' : ''}${r.refusedAt ? `, refused by the service${r.refusedAt > 0 ? ` on ${new Date(r.refusedAt * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}: replace it` : ''}` : 'no key'}`);
        node.dataset.stale = r.refusedAt ? 'true' : 'false';
        const b = node.querySelector('button') as HTMLButtonElement;
        b.disabled = !r.configured || r.source === 'environment';
      },
    });
  }

  private async clear(id: string, name: string): Promise<void> {
    try {
      const row = this.llm.get(id);
      if (row) await api.llmSaveRow(row.id, row, null, true); else if (id === 'fal') await api.forgetGenerativeKey(); else await api.forgetProviderKey(id);
      setText(this.note, `${name} key cleared.`);
    } catch (err) { setText(this.note, failure(err, 'Could not clear the key.')); }
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

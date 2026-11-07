import { api, ApiError } from '../../io/api';
import type { PluginHost } from '../../plugins/host';
import type { FolderPlugins } from '../../plugins/modules';
import { Dialog } from '../dialogs';
import { el, patchList, q, setChecked, setHidden, setText } from '../dom';

/** Plugins > Manage Plugins (1.52.6): the plugins folder's plugins, each on or off, removable; Add Plugin says plainly
 *  what a plugin can do before it is added. */
export class PluginsDialog extends Dialog {
  private readonly list = el('<div class="cv-plugins-list"></div>');
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".js,text/javascript" aria-label="Plugin file" hidden>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly empty = el('<p class="cv-note">No plugins yet.</p>');

  private readonly folders = el('<div class="cv-plugins-list"></div>');
  /** Set by the app: shows the plugins folder in the system file manager. */
  openFolder: () => void = () => {};
  /** Set by the app: shows Window > Extensions, where FormPortal's and form.ext's extensions are listed. */
  showExtensions: () => void = () => {};

  constructor(private readonly host: PluginHost, private readonly modules: FolderPlugins, private readonly confirm: (title: string, text: string, ok: string) => Promise<boolean>) {
    super('Plugins', 440);
    const add = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Add Plugin...</button>');
    const reload = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Reload Plugins</button>');
    const open = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Open Folder</button>');
    add.addEventListener('click', () => this.file.click());
    reload.addEventListener('click', () => void this.reload());
    open.addEventListener('click', () => this.openFolder());
    this.file.addEventListener('change', () => void this.add());
    this.host.onChange = () => { if (this.isOpen) void this.refresh(); };
    this.modules.onChange = () => { if (this.isOpen) void this.refresh(); };
    this.body.append(el('<p class="cv-note">A single .js file runs in a sandbox: it can change the open document through formvis\'s tools, each change undoable, and anything that costs money still asks you; it cannot see your keys or your files. A plugin folder (plugin.json and an ES module) runs inside formvis with the permissions it lists, which you approve when you turn it on. Commands are in the Plugins menu.</p>'), this.list, this.empty, this.folders, add, reload, open, this.file, this.note);
    this.button('Extensions Panel', 'ghost', () => { this.close(); this.showExtensions(); });
    this.button('Close', 'ghost', () => this.close());
  }

  async show(): Promise<void> { await this.refresh(); setText(this.note, ''); this.open(); }

  /** The plugin folders: a switch, the name and version, what it registered and its latest error; invalid ones say why. */
  private async refreshFolders(): Promise<void> {
    const rows = await this.modules.list();
    patchList<Record<string, unknown>>(this.folders, rows, {
      key: (p) => String(p.id),
      create: (p) => {
        const id = String(p.id);
        const row = el('<div class="cv-plugins-row"><label><input type="checkbox"><span class="cv-plugins-name"></span></label><button type="button" class="cv-btn cv-btn-ghost">Remove</button><span class="cv-note cv-plugins-state"></span></div>');
        const box = q<HTMLInputElement>(row, 'input');
        box.setAttribute('aria-label', `${id} on`);
        box.addEventListener('change', () => { void this.modules.setOn(id, box.checked).then(() => this.refreshFolders()); });
        q<HTMLButtonElement>(row, 'button').addEventListener('click', () => void (async () => { if (await this.confirm(`Remove ${id}?`, 'Its folder and files are deleted from the plugins folder.', 'Remove')) { await this.modules.remove(id); await this.refreshFolders(); } })());
        this.fillFolder(row, p);
        return row;
      },
      update: (row, p) => this.fillFolder(row, p),
    });
  }

  private fillFolder(row: HTMLElement, p: Record<string, unknown>): void {
    const box = q<HTMLInputElement>(row, 'input'), reg = p.registered as Record<string, number> | null, errors = p.errors as string[];
    setChecked(box, p.on === true);
    box.disabled = !!p.invalid;
    setText(q(row, '.cv-plugins-name'), `${String(p.name)} ${String(p.version)}`.trim());
    const made = reg ? Object.entries(reg).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') : '';
    const state = p.invalid ? `Not valid: ${String(p.invalid)}` : !p.on ? `Off. Permissions: ${(p.permissions as string[]).join(', ') || 'none'}` : !p.running ? 'Not running' : `Running${made ? ': ' + made : ''}`;
    setText(q(row, '.cv-plugins-state'), errors.length ? `${state}. Error: ${errors[errors.length - 1]}` : state);
  }

  private async refresh(): Promise<void> {
    void this.refreshFolders();
    const rows = await this.host.list();
    patchList<Record<string, unknown>>(this.list, rows, {
      key: (p) => String(p.file),
      create: (p) => {
        const file = String(p.file);
        const row = el('<div class="cv-plugins-row"><label><input type="checkbox"><span class="cv-plugins-name"></span></label><button type="button" class="cv-btn cv-btn-ghost">Remove</button><span class="cv-note cv-plugins-state"></span></div>');
        const box = q<HTMLInputElement>(row, 'input');
        box.setAttribute('aria-label', `${file} on`);
        setText(q(row, '.cv-plugins-name'), file);
        box.addEventListener('change', () => { this.host.setOn(file, box.checked); });
        q<HTMLButtonElement>(row, 'button').addEventListener('click', () => void (async () => { this.host.unload(file); await api.removePlugin(file); await this.refresh(); })());
        this.fill(row, p);
        return row;
      },
      update: (row, p) => this.fill(row, p),
    });
    setHidden(this.empty, rows.length > 0);
  }

  /** A row's checkbox and its state line: running or off, the commands with their keys, and the latest errors. */
  private fill(row: HTMLElement, p: Record<string, unknown>): void {
    setChecked(q<HTMLInputElement>(row, 'input'), p.on === true);
    const cmds = p.commands as Array<{ label: string; keys: string[] }>, errors = p.errors as string[];
    const state = !p.on ? 'Off' : !p.running ? 'Not running' : `${String(p.name)} · ${cmds.length} command${cmds.length === 1 ? '' : 's'}${cmds.length ? ': ' + cmds.map((c) => c.label + (c.keys.length ? ` (${c.keys[0]})` : '')).join(', ') : ''}`;
    setText(q(row, '.cv-plugins-state'), errors.length ? `${state}. Error: ${errors[errors.length - 1]}` : state);
  }

  private async reload(): Promise<void> {
    const n = (await this.host.reloadAll()) + (await this.modules.reloadAll());
    await this.refresh();
    setText(this.note, `Reloaded: ${n} plugin${n === 1 ? '' : 's'} running.`);
  }

  private async add(): Promise<void> {
    const f = this.file.files?.[0];
    this.file.value = '';
    if (!f) return;
    if (!(await this.confirm(`Add ${f.name}?`, 'It will be able to change the open document through formvis\'s tools (each change undoable; anything that costs money still asks you). It cannot see your keys or files. Add only plugins you trust.', 'Add'))) return;
    try {
      await api.addPlugin(f.name, await f.text());
      this.host.setOn(f.name, true);
      await this.refresh();
      setText(this.note, `${f.name} added; its commands are in the Plugins menu.`);
    } catch (err) { setText(this.note, err instanceof ApiError ? err.message : 'The formvis engine is offline (./formvis boot).'); }
  }
}

import { api, ApiError } from '../../io/api';
import type { PluginHost } from '../../plugins/host';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** Plugins > Manage Plugins (1.52.6): the plugins folder's plugins, each on or off, removable; Add Plugin says plainly
 *  what a plugin can do before it is added. */
export class PluginsDialog extends Dialog {
  private readonly list = el('<div class="cv-plugins-list"></div>');
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".js,text/javascript" aria-label="Plugin file" hidden>');
  private readonly note = el('<p class="cv-note" role="status"></p>');

  constructor(private readonly host: PluginHost, private readonly confirm: (title: string, text: string, ok: string) => Promise<boolean>) {
    super('Plugins', 440);
    const add = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Add Plugin...</button>');
    add.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => void this.add());
    this.body.append(el('<p class="cv-note">A plugin runs in a sandbox: it can change the open document through formvis\'s tools, each change undoable, and anything that costs money still asks you; it cannot see your keys or your files. Its commands are in the Plugins menu.</p>'), this.list, add, this.file, this.note);
    this.button('Close', 'ghost', () => this.close());
  }

  async show(): Promise<void> { await this.refresh(); setText(this.note, ''); this.open(); }

  private async refresh(): Promise<void> {
    const off = this.host.off(), all = await api.plugins();
    this.list.replaceChildren(...(all.length ? all.map((p) => {
      const row = el('<div class="cv-plugins-row"><label><input type="checkbox"><span></span></label><button type="button" class="cv-btn cv-btn-ghost">Remove</button></div>');
      const box = row.querySelector('input') as HTMLInputElement, name = row.querySelector('span') as HTMLElement;
      box.checked = !off.has(p.name); box.setAttribute('aria-label', `${p.name} on`);
      setText(name, p.name);
      box.addEventListener('change', () => this.host.setOn(p.name, box.checked));
      (row.querySelector('button') as HTMLButtonElement).addEventListener('click', () => void (async () => { this.host.unload(p.name); await api.removePlugin(p.name); await this.refresh(); })());
      return row;
    }) : [el('<p class="cv-note">No plugins yet.</p>')]));
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

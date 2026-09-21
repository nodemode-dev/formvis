import { IMAGE_ACCEPT } from '../../io/images';
import type { Action, Actions } from '../actions';
import { actionsFrom } from '../actions';
import { Dialog } from '../dialogs';
import { el, setDisabled, setText } from '../dom';
import { toast } from '../toast';

/** Keeps a select's options in step with `labels`, changing only what differs. */
function syncOptions(sel: HTMLSelectElement, labels: string[]): void {
  while (sel.options.length > labels.length) sel.remove(sel.options.length - 1);
  labels.forEach((label, i) => {
    let o = sel.options[i];
    if (!o) { o = document.createElement('option'); sel.appendChild(o); }
    if (o.value !== String(i)) o.value = String(i);
    if (o.textContent !== label) o.textContent = label;
  });
}

const titled = (a: Action): string => `${a.name} (${a.steps.length} step${a.steps.length === 1 ? '' : 's'})`;

/** File > Actions: record, play, delete, export and import actions. */
export class ActionsDialog extends Dialog {
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Name a new action" spellcheck="false">');
  private readonly steps = el('<pre class="cv-notice"></pre>');
  private readonly note = el('<p class="cv-note"></p>');
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".json,application/json" hidden>');
  private readonly playBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;
  private readonly exportBtn: HTMLButtonElement;

  constructor(private readonly store: Actions, private readonly hooks: { play(a: Action): Promise<void>; save(blob: Blob, name: string): Promise<void> }) {
    super('Actions', 460);
    this.field('Action', this.pick);
    this.body.appendChild(this.steps);
    this.field('New action', this.name);
    const row = el('<div class="cv-welcome-actions"></div>');
    const button = (label: string, run: () => void): HTMLButtonElement => {
      const b = el<HTMLButtonElement>('<button class="cv-btn" type="button"></button>');
      setText(b, label);
      b.addEventListener('click', run);
      row.appendChild(b);
      return b;
    };
    button('Record', () => this.record());
    this.playBtn = button('Play', () => void this.play());
    this.deleteBtn = button('Delete', () => this.remove());
    this.exportBtn = button('Export...', () => void this.exportJson());
    button('Import...', () => this.file.click());
    this.body.append(row, this.note, this.file);
    this.button('Close', 'primary', () => this.close());
    this.pick.addEventListener('change', () => this.sync());
    this.file.addEventListener('change', () => void this.importJson());
  }

  show(): void { this.sync(); this.open(); }

  private selected(): Action | null { return this.store.list[Number(this.pick.value)] ?? null; }

  private sync(): void {
    syncOptions(this.pick, this.store.list.map(titled));
    const a = this.selected();
    setText(this.steps, !a ? 'No actions yet. Name one and press Record.' : a.steps.length ? a.steps.map((s, i) => `${i + 1}. ${s.label}`).join('\n') : 'No steps yet. Press Record to add some.');
    setDisabled(this.playBtn, !a?.steps.length);
    setDisabled(this.deleteBtn, !a);
    setDisabled(this.exportBtn, !a);
    setText(this.note, this.store.recording ? `Recording "${this.store.recording.name}". File > Stop Recording ends it.`
      : 'Recording captures commands that change the document, filters with their settings, and Image and Canvas Size. Naming a new action starts it; otherwise Record adds to the one chosen.');
  }

  private record(): void {
    const name = this.name.value.trim(), chosen = this.selected();
    const a = name ? this.store.start(name) : chosen ? this.store.resume(chosen) : null;
    if (!a) { setText(this.note, 'Name a new action, or choose one to add steps to.'); this.name.focus(); return; }
    this.name.value = '';
    this.close();
    toast(`Recording "${a.name}". Work as usual, then choose File > Stop Recording.`);
  }

  private async play(): Promise<void> {
    const a = this.selected();
    if (!a) return;
    this.close();
    await this.hooks.play(a);
  }

  private remove(): void {
    const a = this.selected();
    if (!a) return;
    this.store.remove(a);
    this.pick.value = '0';
    this.sync();
  }

  private async exportJson(): Promise<void> {
    const a = this.selected();
    if (a) await this.hooks.save(new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }), `${a.name}.json`);
  }

  private async importJson(): Promise<void> {
    const f = this.file.files?.[0];
    this.file.value = '';
    if (!f) return;
    try {
      const more = actionsFrom(JSON.parse(await f.text()));
      if (!more.length) { setText(this.note, `${f.name} holds no actions sonny can play.`); return; }
      this.store.add(more);
      this.pick.value = String(this.store.list.length - 1);
      this.sync();
    } catch { setText(this.note, `${f.name} is not an actions file.`); }
  }
}

/** File > Batch: plays an action on each chosen image and exports the results in one zip. */
export class BatchDialog extends Dialog {
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
  private readonly format = el<HTMLSelectElement>('<select class="cv-input"><option value="png">PNG</option><option value="jpg">JPEG</option></select>');
  private readonly quality = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="100" step="1" value="92">');
  private readonly file = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" hidden>`);
  private readonly chosen = el('<p class="cv-note"></p>');
  private files: File[] = [];

  constructor(private readonly store: Actions, private readonly run: (a: Action, files: File[], format: 'png' | 'jpg', quality: number) => Promise<void>) {
    super('Batch', 440);
    this.field('Action', this.pick);
    const row = el('<div class="cv-welcome-actions"></div>'), choose = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose images...</button>');
    choose.addEventListener('click', () => this.file.click());
    row.appendChild(choose);
    this.body.append(row, this.chosen, this.file);
    this.field('Save as', this.format);
    this.field('JPEG quality', this.quality);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Run', 'primary', () => void this.go());
    this.file.addEventListener('change', () => { this.files = [...(this.file.files ?? [])]; this.file.value = ''; this.sync(); });
  }

  show(): void { this.files = []; this.sync(); this.open(); }

  private sync(): void {
    syncOptions(this.pick, this.store.list.map(titled));
    setText(this.chosen, this.files.length ? `${this.files.length} image${this.files.length === 1 ? '' : 's'} chosen. Each opens, plays the action and is exported; the results download as one zip.` : 'Choose the images to process.');
  }

  private async go(): Promise<void> {
    const a = this.store.list[Number(this.pick.value)];
    if (!a || !this.files.length) { setText(this.chosen, !a ? 'Record an action first.' : 'Choose the images to process.'); return; }
    const files = this.files, format = this.format.value === 'jpg' ? 'jpg' : 'png', q = Math.min(100, Math.max(1, Number(this.quality.value) || 92)) / 100;
    this.close();
    await this.run(a, files, format, q);
  }
}

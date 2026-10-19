import { IMAGE_ACCEPT } from '../../io/images';
import { parseAtn } from '../../io/atn';
import type { Action, Actions } from '../actions';
import { ACTION_COLOURS, ACTION_KEYS, actionsFrom, CONDITION_TESTS } from '../actions';
import { Dialog } from '../dialogs';
import { el, patchList, q, setChecked, setDisabled, setHidden, setText } from '../dom';
import type { ActionStep } from '../actions';
import { toast } from '../toast';
import { isLibKind, libHasDialog } from '../../engine/filter-library';
import { folderImages, folderInput, OutFolderRow } from './image-processor-dialog';

export const asks = (s: ActionStep): boolean => (s.kind === 'filter' && !(isLibKind(s.filter) && !libHasDialog(s.filter))) || (s.kind === 'adjustment' && !s.layer);

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

/** Keeps a select's options (value, label) in step with `pairs`, changing only what differs. */
function syncPairs(sel: HTMLSelectElement, pairs: Array<[string, string]>): void {
  while (sel.options.length > pairs.length) sel.remove(sel.options.length - 1);
  pairs.forEach(([value, label], i) => {
    let o = sel.options[i];
    if (!o) { o = document.createElement('option'); sel.appendChild(o); }
    if (o.value !== value) o.value = value;
    if (o.textContent !== label) o.textContent = label;
  });
}

const titled = (a: Action): string => `${a.set ? `${a.set} / ` : ''}${a.name} (${a.steps.length} step${a.steps.length === 1 ? '' : 's'})`;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** File > Actions: record, play, delete, export and import actions. */
export class ActionsDialog extends Dialog {
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Name a new action" spellcheck="false">');
  private readonly steps = el('<div class="cv-list cv-steps" role="listbox" aria-label="Steps"></div>');
  private readonly stepsEmpty = el('<p class="cv-note cv-steps-empty"></p>');
  private readonly stopText = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Message for a stop" spellcheck="false">');
  private readonly stopGo = el<HTMLInputElement>('<input type="checkbox" checked>');
  private readonly deleteStepBtn: HTMLButtonElement;
  private readonly moveBtns: HTMLButtonElement[];
  private picked = -1;
  private readonly cTest = el<HTMLSelectElement>(`<select class="cv-input" aria-label="Condition">${CONDITION_TESTS.map(([t, l]) => `<option value="${t}">${l}</option>`).join('')}</select>`);
  private readonly cThen = el<HTMLSelectElement>('<select class="cv-input" aria-label="Play when it holds"></select>');
  private readonly cElse = el<HTMLSelectElement>('<select class="cv-input" aria-label="Play when it does not"></select>');
  private readonly follow = el<HTMLInputElement>('<input type="checkbox">');
  private readonly setBox = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="80" placeholder="No set" spellcheck="false" aria-label="Set">');
  private readonly colourSel = el<HTMLSelectElement>(`<select class="cv-input" aria-label="Button colour">${ACTION_COLOURS.map((c) => `<option value="${c}">${cap(c)}</option>`).join('')}</select>`);
  private readonly keySel = el<HTMLSelectElement>(`<select class="cv-input" aria-label="Function key">${ACTION_KEYS.map((k) => `<option value="${k}">${k || 'None'}</option>`).join('')}</select>`);
  private readonly buttonMode = el<HTMLInputElement>('<input type="checkbox">');
  private readonly buttons = el('<div class="cv-action-buttons" role="group" aria-label="Actions" hidden></div>');
  private readonly nest = el<HTMLSelectElement>('<select class="cv-input" aria-label="Action to play"></select>');
  private readonly menuSel = el<HTMLSelectElement>('<select class="cv-input" aria-label="Menu item"></select>');
  private readonly modeParts: HTMLElement[] = [];
  private readonly note = el('<p class="cv-note"></p>');
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".json,.atn,application/json" hidden>');
  private readonly playBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;
  private readonly exportBtn: HTMLButtonElement;

  constructor(private readonly store: Actions, private readonly hooks: { play(a: Action): Promise<void>; save(blob: Blob, name: string): Promise<void>; menu(): Array<{ id: string; label: string }>; run(id: string, params: Record<string, unknown>): unknown; keyTaken(combo: string): string }) {
    super('Actions', 460);
    this.field('Button Mode', this.buttonMode);
    this.field('Action', this.pick);
    this.body.append(this.buttons, this.steps, this.stepsEmpty);
    const stops = el('<div class="cv-welcome-actions cv-step-tools"></div>'), insert = el<HTMLButtonElement>('<button class="cv-btn" type="button">Insert Stop</button>');
    this.deleteStepBtn = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button">Delete Step</button>');
    const go = el('<label class="cv-step-go"></label>');
    go.append(this.stopGo, document.createTextNode(' Allow Continue'));
    stops.append(this.stopText, insert, go, this.deleteStepBtn);
    const moves = el('<div class="cv-welcome-actions cv-step-tools"></div>');
    const mover = (label: string, run: () => void): HTMLButtonElement => {
      const b = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button"></button>');
      setText(b, label);
      b.addEventListener('click', run);
      moves.appendChild(b);
      return b;
    };
    this.moveBtns = [mover('Step Up', () => this.moveStep(-1)), mover('Step Down', () => this.moveStep(1)), mover('Action Up', () => this.moveAction(-1)), mover('Action Down', () => this.moveAction(1)), mover('Rename', () => this.rename())];
    this.body.append(stops, moves);
    this.modeParts.push(this.steps, this.stepsEmpty, stops, moves);
    this.field('Play action', this.nest);
    this.field('Menu item', this.menuSel);
    const nested = el('<div class="cv-welcome-actions cv-step-tools"></div>'), addPlay = el<HTMLButtonElement>('<button class="cv-btn" type="button">Insert Play Action</button>'), addMenu = el<HTMLButtonElement>('<button class="cv-btn" type="button">Insert Menu Item</button>');
    nested.append(addPlay, addMenu);
    this.body.append(nested);
    addPlay.addEventListener('click', () => this.insertPlay());
    addMenu.addEventListener('click', () => this.insertMenu());
    this.field('Set', this.setBox);
    this.field('Button colour', this.colourSel);
    this.field('Function key', this.keySel);
    this.setBox.addEventListener('change', () => this.applyOptions());
    this.colourSel.addEventListener('change', () => this.applyOptions());
    this.keySel.addEventListener('change', () => this.applyOptions());
    this.buttonMode.addEventListener('change', () => this.sync());
    this.buttons.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cv-action-btn'), x = b ? this.store.list[Number(b.dataset.key)] : null;
      if (x) { this.close(); void this.hooks.play(x); }
    });
    this.field('If', this.cTest);
    this.field('Then play', this.cThen);
    this.field('Otherwise play', this.cElse);
    const cond = el('<div class="cv-welcome-actions cv-step-tools"></div>'), addCond = el<HTMLButtonElement>('<button class="cv-btn" type="button">Insert Conditional</button>');
    cond.append(addCond);
    this.body.append(cond);
    addCond.addEventListener('click', () => this.insertConditional());
    insert.addEventListener('click', () => this.insertStop());
    this.deleteStepBtn.addEventListener('click', () => this.deleteStep());
    this.steps.addEventListener('click', (e) => {
      const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.cv-step-row'), a = this.selected();
      if (!row || !a) return;
      const i = Number(row.dataset.key);
      if (t.classList.contains('cv-step-on') && a.steps[i]) { if ((t as HTMLInputElement).checked) delete a.steps[i].off; else a.steps[i].off = true; this.store.save(); }
      if (t.closest('.cv-step-ask')) {
        // Pausing for input: the step's dialog opens during playback, with its recorded settings to adjust.
        const s = a.steps[i];
        if (s && asks(s) && (s.kind === 'filter' || s.kind === 'adjustment')) { if (s.ask) delete s.ask; else s.ask = true; this.store.save(); }
      }
      this.picked = i;
      this.sync();
    });
    this.field('Sizes follow each image', this.follow);
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
    button('Save .atn...', () => void this.exportAtn());
    this.body.append(row, this.note, this.file);
    this.button('Close', 'primary', () => this.close());
    this.pick.addEventListener('change', () => { this.picked = -1; this.sync(); });
    this.name.addEventListener('input', () => this.sync());
    this.follow.addEventListener('change', () => {
      const a = this.selected();
      if (!a) return;
      if (this.follow.checked) a.relative = true; else delete a.relative;
      this.store.save();
    });
    this.file.addEventListener('change', () => void this.importJson());
  }

  show(): void { syncPairs(this.menuSel, this.hooks.menu().map((m) => [m.id, m.label])); this.sync(); this.open(); }

  private selected(): Action | null { return this.store.list[Number(this.pick.value)] ?? null; }

  private fillButton(b: HTMLElement, x: Action): void {
    b.className = `cv-action-btn${x.colour ? ` is-${x.colour}` : ''}`;
    setText(q(b, '.cv-action-btn-name'), x.name);
    setText(q(b, '.cv-action-btn-sub'), [x.set, x.key].filter(Boolean).join(', '));
    b.title = `${x.name}, ${x.steps.length} step${x.steps.length === 1 ? '' : 's'}`;
  }

  /** Set, button colour and function key of the chosen action; a key another action or command holds is refused. */
  private applyOptions(): void {
    const a = this.selected();
    if (!a) return;
    const set = this.setBox.value.trim().slice(0, 80);
    if (set) a.set = set; else delete a.set;
    if (this.colourSel.value === 'none') delete a.colour; else a.colour = this.colourSel.value as NonNullable<Action['colour']>;
    const key = this.keySel.value, taken = key && key !== a.key ? this.hooks.keyTaken(key) : '';
    this.store.save();
    if (taken) { this.keySel.value = a.key ?? ''; setText(this.note, `${key} already runs ${taken}.`); return; }
    this.store.setKey(a, key);
    this.sync();
  }

  /** Insert Play Action: a step after the selected one that plays another action inside this one. */
  private insertPlay(): void {
    const a = this.selected(), name = this.nest.value;
    if (!a || !name) return;
    if (name === a.name) { setText(this.note, 'An action cannot play itself.'); return; }
    const at = this.picked >= 0 ? this.picked + 1 : a.steps.length;
    a.steps.splice(at, 0, { kind: 'play', label: `Play ${name}`, name });
    this.store.save();
    this.picked = at;
    this.sync();
  }

  /** Insert Menu Item: a step after the selected one that runs one menu command when the action plays. */
  private insertMenu(): void {
    const a = this.selected(), id = this.menuSel.value, label = this.menuSel.selectedOptions[0]?.textContent ?? id;
    if (!a || !id) return;
    const at = this.picked >= 0 ? this.picked + 1 : a.steps.length;
    a.steps.splice(at, 0, { kind: 'menu', label: `Menu Item: ${label}`, id });
    this.store.save();
    this.picked = at;
    this.sync();
  }

  /** Save .atn: the chosen action's set, or every action when it has none. */
  private async exportAtn(): Promise<void> {
    const a = this.selected();
    if (a) await this.hooks.run('export-actions-atn', a.set ? { set: a.set } : {});
  }

  private sync(): void {
    syncOptions(this.pick, this.store.list.map(titled));
    for (const sel of [this.cThen, this.cElse]) {
      const names = ['', ...this.store.list.map((x) => x.name)];
      while (sel.options.length > names.length) sel.remove(sel.options.length - 1);
      names.forEach((n, i) => {
        let o = sel.options[i];
        if (!o) { o = document.createElement('option'); sel.appendChild(o); }
        if (o.value !== n) o.value = n;
        const text = n || 'Nothing';
        if (o.textContent !== text) o.textContent = text;
      });
    }
    const a = this.selected();
    const list = a?.steps ?? [];
    if (this.picked >= list.length) this.picked = -1;
    patchList<ActionStep>(this.steps, list, {
      key: (s) => String(list.indexOf(s)),
      create: (s) => {
        const row = el('<div class="cv-list-row cv-step-row" role="option"><input class="cv-step-on" type="checkbox" title="Include this step when the action plays" aria-label="Include step"><span class="cv-step-n"></span><span class="cv-step-label"></span><button class="cv-btn cv-btn-ghost cv-step-ask" type="button" title="Open this step\'s dialog during playback">Dialog</button></div>');
        row.dataset.key = String(list.indexOf(s));
        this.fillStep(row, s, list.indexOf(s));
        return row;
      },
      update: (row, s) => this.fillStep(row, s, list.indexOf(s)),
    });
    const bm = this.buttonMode.checked;
    setHidden(this.buttons, !bm);
    for (const part of this.modeParts) setHidden(part, bm);
    patchList<Action>(this.buttons, this.store.list, {
      key: (x) => String(this.store.list.indexOf(x)),
      create: (x) => {
        const b = el<HTMLButtonElement>('<button class="cv-action-btn" type="button"><span class="cv-action-btn-name"></span><span class="cv-action-btn-sub"></span></button>');
        b.dataset.key = String(this.store.list.indexOf(x));
        this.fillButton(b, x);
        return b;
      },
      update: (b, x) => this.fillButton(b, x),
    });
    syncPairs(this.nest, this.store.list.map((x) => [x.name, x.name]));
    setText(this.stepsEmpty, !a ? 'No actions yet. Name one and press Record.' : 'No steps yet. Press Record to add some.');
    setHidden(this.stepsEmpty, bm || list.length > 0);
    if (document.activeElement !== this.setBox) this.setBox.value = a?.set ?? '';
    this.colourSel.value = a?.colour ?? 'none';
    this.keySel.value = a?.key ?? '';
    for (const c of [this.setBox, this.colourSel, this.keySel]) setDisabled(c, !a);
    for (const c of [this.nest, this.menuSel]) setDisabled(c, !a);
    setDisabled(this.deleteStepBtn, this.picked < 0);
    const ai = Number(this.pick.value);
    setDisabled(this.moveBtns[0], this.picked < 1);
    setDisabled(this.moveBtns[1], this.picked < 0 || this.picked >= list.length - 1);
    setDisabled(this.moveBtns[2], !a || ai < 1);
    setDisabled(this.moveBtns[3], !a || ai >= this.store.list.length - 1);
    setDisabled(this.moveBtns[4], !a || !this.name.value.trim());
    setChecked(this.follow, !!a?.relative);
    setDisabled(this.follow, !a);
    setDisabled(this.playBtn, !a?.steps.length);
    setDisabled(this.deleteBtn, !a);
    setDisabled(this.exportBtn, !a);
    setText(this.note, this.store.recording ? `Recording "${this.store.recording.name}". File > Stop Recording ends it.`
      : 'Recording captures commands that change the document, filters with their settings, and Image Size, Canvas Size and Fit Image. Naming a new action starts it; otherwise Record adds to the one chosen.');
  }

  private fillStep(row: HTMLElement, s: ActionStep, i: number): void {
    setText(q(row, '.cv-step-n'), `${i + 1}.`);
    const skipped = s.kind === 'unsupported';
    setChecked(q<HTMLInputElement>(row, '.cv-step-on'), !s.off && !skipped);
    setDisabled(q<HTMLInputElement>(row, '.cv-step-on'), skipped);
    row.classList.toggle('is-off', !!s.off || skipped);
    setText(q(row, '.cv-step-label'), s.kind === 'stop' ? `Stop: ${s.message || 'pause'}${s.allowContinue ? '' : ' (ends here)'}` : skipped ? `${s.label} (not supported here, kept)` : s.label);
    const can = asks(s), ask = q<HTMLButtonElement>(row, '.cv-step-ask');
    setHidden(ask, !can);
    ask.setAttribute('aria-pressed', String(can && 'ask' in s && !!s.ask));
    row.classList.toggle('is-picked', i === this.picked);
    row.setAttribute('aria-selected', String(i === this.picked));
  }

  /** Insert Stop: a stop after the selected step, or at the end, showing its message during playback. */
  private insertStop(): void {
    const a = this.selected();
    if (!a) return;
    const message = this.stopText.value.trim(), at = this.picked >= 0 ? this.picked + 1 : a.steps.length;
    a.steps.splice(at, 0, { kind: 'stop', label: 'Stop', message, allowContinue: this.stopGo.checked });
    this.store.save();
    this.stopText.value = '';
    this.picked = at;
    this.sync();
  }

  /** Insert Conditional: a step after the selected one that plays one action when the test holds and another when not. */
  private insertConditional(): void {
    const a = this.selected();
    if (!a) return;
    const test = CONDITION_TESTS.find(([t]) => t === this.cTest.value), then = this.cThen.value, other = this.cElse.value;
    if (!test || (!then && !other)) { setText(this.note, 'Choose the action to play when the condition holds, when it does not, or both.'); return; }
    const at = this.picked >= 0 ? this.picked + 1 : a.steps.length;
    a.steps.splice(at, 0, { kind: 'conditional', label: `If ${test[1].toLowerCase()}`, test: test[0], then, else: other });
    this.store.save();
    this.picked = at;
    this.sync();
  }

  /** Step Up and Step Down: the picked step trades places with its neighbour. */
  private moveStep(d: number): void {
    const a = this.selected(), to = this.picked + d;
    if (!a || this.picked < 0 || to < 0 || to >= a.steps.length) return;
    [a.steps[this.picked], a.steps[to]] = [a.steps[to], a.steps[this.picked]];
    this.store.save();
    this.picked = to;
    this.sync();
  }

  /** Action Up and Action Down: the chosen action trades places with its neighbour in the list. */
  private moveAction(d: number): void {
    const list = this.store.list, i = Number(this.pick.value), to = i + d;
    if (!list[i] || to < 0 || to >= list.length) return;
    [list[i], list[to]] = [list[to], list[i]];
    this.store.save();
    this.pick.value = String(to);
    this.sync();
    this.pick.value = String(to);
  }

  /** Rename: the text in the New action box becomes the chosen action's name. */
  private rename(): void {
    const a = this.selected(), name = this.name.value.trim().slice(0, 80);
    if (!a || !name) return;
    a.name = name;
    this.name.value = '';
    this.store.save();
    this.sync();
  }

  private deleteStep(): void {
    const a = this.selected();
    if (!a || this.picked < 0) return;
    a.steps.splice(this.picked, 1);
    this.store.save();
    this.picked = -1;
    this.sync();
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
      if (/\.atn$/i.test(f.name)) {
        const { actions, unsupported } = parseAtn(await f.arrayBuffer());
        if (!actions.length) { setText(this.note, `${f.name} holds no actions.`); return; }
        this.store.add(actions);
        this.pick.value = String(this.store.list.length - 1);
        this.sync();
        const skipped = unsupported.length ? `; ${unsupported.length} step${unsupported.length === 1 ? '' : 's'} had no formvis equivalent and stay greyed, kept for saving back: ${unsupported.slice(0, 5).join(', ')}` : '';
        setText(this.note, `Imported ${actions.length} action${actions.length === 1 ? '' : 's'}${skipped}`);
        return;
      }
      const more = actionsFrom(JSON.parse(await f.text()));
      if (!more.length) { setText(this.note, `${f.name} holds no actions formvis can play.`); return; }
      this.store.add(more);
      this.pick.value = String(this.store.list.length - 1);
      this.sync();
    } catch { setText(this.note, `${f.name} is not an actions file.`); }
  }
}

/** File > Batch: plays an action on each chosen image and exports the results in one zip. */
export type BatchFormat = 'png' | 'jpg' | 'webp' | 'tiff' | 'psd';

export class BatchDialog extends Dialog {
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
  private readonly format = el<HTMLSelectElement>('<select class="cv-input"><option value="png">PNG</option><option value="jpg">JPEG</option><option value="webp">WebP</option><option value="tiff">TIFF</option><option value="psd">PSD</option></select>');
  private readonly quality = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="100" step="1" value="92">');
  private readonly template = el<HTMLInputElement>('<input class="cv-input" type="text" value="{name}" maxlength="120" spellcheck="false" aria-label="File name template">');
  private readonly serial = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="999999" step="1" value="1">');
  private readonly file = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" hidden>`);
  private readonly chosen = el('<p class="cv-note"></p>');
  private files: File[] = [];
  private readonly folder = folderInput();
  private readonly subfolders = el<HTMLInputElement>('<input type="checkbox">');
  private inFolder: File[] = [];
  private readonly outRow = new OutFolderRow();

  constructor(private readonly store: Actions, private readonly run: (a: Action, files: File[], format: BatchFormat, quality: number, template: string, serial: number, out: FileSystemDirectoryHandle | null) => Promise<void>) {
    super('Batch', 440);
    this.field('Action', this.pick);
    const row = el('<div class="cv-welcome-actions"></div>'), choose = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose images...</button>'), chooseDir = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose folder...</button>');
    choose.addEventListener('click', () => this.file.click());
    chooseDir.addEventListener('click', () => this.folder.click());
    row.append(choose, chooseDir);
    this.body.append(row, this.chosen, this.file, this.folder);
    this.field('Include All Sub-folders', this.subfolders);
    this.folder.addEventListener('change', () => { this.inFolder = [...(this.folder.files ?? [])]; this.folder.value = ''; this.files = folderImages(this.inFolder, this.subfolders.checked); this.sync(); });
    this.subfolders.addEventListener('change', () => { if (this.inFolder.length) { this.files = folderImages(this.inFolder, this.subfolders.checked); this.sync(); } });
    this.field('Save as', this.format);
    this.field('JPEG quality', this.quality);
    this.field('File name ({name}, {serial}, {date})', this.template);
    this.field('Starting serial', this.serial);
    this.body.append(this.outRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Run', 'primary', () => void this.go());
    this.file.addEventListener('change', () => { this.files = [...(this.file.files ?? [])]; this.inFolder = []; this.file.value = ''; this.sync(); });
    this.remember([this.pick]);   // the format and the JPEG quality; the action is chosen from the list as it stands
  }

  show(): void { this.files = []; this.inFolder = []; this.outRow.reset(); this.sync(); this.open(); }

  private sync(): void {
    syncOptions(this.pick, this.store.list.map(titled));
    setText(this.chosen, this.files.length ? `${this.files.length} image${this.files.length === 1 ? '' : 's'} chosen. Each opens, plays the action and is exported; the results go into the folder chosen below, or download as one zip.` : 'Choose the images to process.');
  }

  private async go(): Promise<void> {
    const a = this.store.list[Number(this.pick.value)];
    if (!a || !this.files.length) { setText(this.chosen, !a ? 'Record an action first.' : 'Choose the images to process.'); return; }
    const files = this.files, format = (['jpg', 'webp', 'tiff', 'psd'] as const).find((f) => f === this.format.value) ?? 'png', q = Math.min(100, Math.max(1, Number(this.quality.value) || 92)) / 100;
    this.close();
    await this.run(a, files, format, q, this.template.value, Math.max(0, Math.floor(Number(this.serial.value) || 0)), this.outRow.handle);
  }
}

export interface DropletOptions { action: string; format: string; quality: number; out: string; recursive: boolean; kind?: 'script' | 'data'; suffix?: string }

/** File > Automate > Create Droplet: the action, the file type and quality, the output folder (blank: beside each
 *  picture) and whether dropped folders are searched through; it writes the droplet script, or a droplet data file
 *  (.fvdrop) that `./formvis cli droplet FILE.fvdrop pictures...` runs. */
export class DropletDialog extends Dialog {
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
  private readonly kind = el<HTMLSelectElement>('<select class="cv-input"><option value="script">Script (.sh)</option><option value="data">Droplet file (.fvdrop)</option></select>');
  private readonly suffix = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="None" spellcheck="false" maxlength="40" aria-label="File name suffix">');
  private readonly format = el<HTMLSelectElement>('<select class="cv-input"><option value="png">PNG</option><option value="jpg">JPEG</option><option value="webp">WebP</option><option value="tiff">TIFF</option></select>');
  private readonly quality = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="100" step="1" value="92">');
  private readonly out = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Beside each picture" spellcheck="false" maxlength="400" aria-label="Output folder">');
  private readonly sub = el<HTMLInputElement>('<input type="checkbox" checked>');

  constructor(private readonly store: Actions, private readonly create: (o: DropletOptions) => Promise<void>) {
    super('Create Droplet', 420);
    this.field('Action', this.pick);
    this.field('Droplet as', this.kind);
    this.field('Save as', this.format);
    this.field('JPEG and WebP quality', this.quality);
    this.field('Output folder', this.out);
    this.field('File name suffix', this.suffix);
    this.field('Include All Sub-folders', this.sub);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Create', 'primary', () => void this.go());
    this.format.addEventListener('change', () => setDisabled(this.quality, this.format.value === 'png' || this.format.value === 'tiff'));
    this.remember([this.pick]);
  }

  show(): void {
    syncOptions(this.pick, this.store.list.map(titled));
    setDisabled(this.quality, this.format.value === 'png' || this.format.value === 'tiff');
    this.open();
  }

  private async go(): Promise<void> {
    const a = this.store.list[Number(this.pick.value)];
    if (!a) return;
    this.close();
    await this.create({ action: a.name, format: this.format.value, quality: Math.min(100, Math.max(1, Number(this.quality.value) || 92)), out: this.out.value.trim(), recursive: this.sub.checked, kind: this.kind.value === 'data' ? 'data' : 'script', suffix: this.suffix.value.trim() });
  }
}

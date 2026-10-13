import { el, q, setText } from './dom';
import { icon } from './icons';

/** How many dialogs are showing right now. */
let openCount = 0;
/** True while at least one dialog is showing; global shortcuts consult this. */
export const anyDialogOpen = (): boolean => openCount > 0;

/** Modal dialog shell: a backdrop, a titled frame, a content area and a row of buttons. */
export class Dialog {
  readonly scrim: HTMLElement;
  readonly body: HTMLElement;
  readonly foot: HTMLElement;
  private readonly title: HTMLElement;
  private lastFocus: HTMLElement | null = null;
  onClose: (() => void) | null = null;

  constructor(title: string, width = 440) {
    this.scrim = el<HTMLElement>(
      `<div class="cv-scrim" hidden><div class="cv-dialog" role="dialog" aria-modal="true" tabindex="-1">` +
      `<div class="cv-dialog-head"><span class="cv-dialog-title"></span>` +
      `<button class="cv-icon-btn" type="button" data-close title="Close" aria-label="Close">${icon('close', 16)}</button></div>` +
      `<div class="cv-dialog-body"></div><div class="cv-dialog-foot"></div></div></div>`);
    const frame = q<HTMLElement>(this.scrim, '.cv-dialog');
    frame.style.setProperty('--cv-dialog-w', `${width}px`);
    this.title = q<HTMLElement>(this.scrim, '.cv-dialog-title');
    this.body = q<HTMLElement>(this.scrim, '.cv-dialog-body');
    this.foot = q<HTMLElement>(this.scrim, '.cv-dialog-foot');
    setText(this.title, title);
    q(this.scrim, '[data-close]').addEventListener('click', () => this.close());
    this.scrim.addEventListener('pointerdown', (e) => { if (e.target === this.scrim) this.close(); });
    this.scrim.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    document.getElementById('overlay-root')?.appendChild(this.scrim);
  }

  get isOpen(): boolean { return !this.scrim.hidden; }
  setTitle(title: string): void { setText(this.title, title); }

  /** Shows the dialog and moves focus into it: to `focus` if given, else to the first field or primary button. */
  open(focus?: HTMLElement | null): void {
    if (this.isOpen) return;
    this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.getElementById('overlay-root')?.appendChild(this.scrim);
    this.scrim.hidden = false;
    openCount++;
    const target = focus ?? this.scrim.querySelector<HTMLElement>('input, select, .cv-btn-primary:not(:disabled)');
    target?.focus();
    if (!this.scrim.contains(document.activeElement)) q<HTMLElement>(this.scrim, '.cv-dialog').focus();
  }

  /** Hides the dialog, tells the owner, and hands focus back to where it came from. */
  close(): void {
    if (!this.isOpen) return;
    this.scrim.hidden = true;
    openCount--;
    this.onClose?.();
    // Focus left inside the hidden dialog kept shortcuts from reaching formvis until the browser moved it at a later frame
    // (1.53.6: a rebound key did nothing after Keyboard Shortcuts closed); it is released here, then returned.
    if (this.scrim.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (this.lastFocus && typeof this.lastFocus.focus === 'function') this.lastFocus.focus();
  }

  /** Adds a button to the footer row. */
  button(label: string, kind: '' | 'primary' | 'ghost' | 'danger', run: () => void): HTMLButtonElement {
    const b = el<HTMLButtonElement>(`<button class="cv-btn${kind ? ` cv-btn-${kind}` : ''}" type="button"></button>`);
    setText(b, label);
    b.addEventListener('click', run);
    this.foot.appendChild(b);
    return b;
  }

  /** Adds a labelled control to the body. */
  field(label: string, control: HTMLElement): HTMLElement {
    const row = el<HTMLElement>('<label class="cv-field"><span></span></label>');
    setText(q(row, 'span'), label);
    row.appendChild(control);
    this.body.appendChild(row);
    return row;
  }
}

/** Unsaved Changes, as the target's (Phase 21, UI_SPEC.md section 7, s24): the question names the document in bold, a
 *  line says what is lost, and the three answers: Don't Save alone at the left, Cancel and Save (the primary) at the
 *  right. Closing it any other way is Cancel, so nothing is ever discarded by accident. */
class SaveChanges extends Dialog {
  private readonly question = el('<p class="cv-save-q">Save changes to <strong></strong>?</p>');
  private readonly all = el('<label class="cv-field cv-check" hidden><span>Apply to All</span><input type="checkbox"></label>');
  private readonly saveBtn: HTMLButtonElement;
  private resolve: ((v: { choice: 'save' | 'discard' | 'cancel'; all: boolean }) => void) | null = null;
  constructor() {
    super('Unsaved Changes', 460);
    q<HTMLElement>(this.scrim, '.cv-dialog').classList.add('cv-savechanges');
    this.body.append(this.question, el('<p class="cv-note">Your changes will be lost if you don’t save them.</p>'), this.all);
    this.button('Don’t Save', 'ghost', () => this.finish('discard')).classList.add('cv-btn-apart');
    this.button('Cancel', 'ghost', () => this.finish('cancel'));
    this.saveBtn = this.button('Save', 'primary', () => this.finish('save'));
    this.onClose = () => this.finish('cancel');
  }
  ask(name: string, many: boolean): Promise<{ choice: 'save' | 'discard' | 'cancel'; all: boolean }> {
    setText(this.question.querySelector('strong') as HTMLElement, name);
    this.all.hidden = !many;
    q<HTMLInputElement>(this.all, 'input').checked = false;
    this.open(this.saveBtn);
    return new Promise((r) => { this.resolve = r; });
  }
  private finish(v: 'save' | 'discard' | 'cancel'): void {
    const r = this.resolve;
    this.resolve = null;
    if (this.isOpen) this.close();
    r?.({ choice: v, all: !this.all.hidden && q<HTMLInputElement>(this.all, 'input').checked });
  }
}

let saveChangesDialog: SaveChanges | null = null;
/** Asks whether to save a document's changes before it closes: 'save', 'discard' or 'cancel'. */
export function askSaveChanges(name: string): Promise<'save' | 'discard' | 'cancel'> {
  saveChangesDialog ??= new SaveChanges();
  return saveChangesDialog.ask(name, false).then((a) => a.choice);
}

/** The same with Apply to All (Close All and Close Others, 1.65.8, as Photoshop's): `all` when it was ticked, so the
 *  answer stands for the documents after this one. */
export function askSaveChangesAll(name: string): Promise<{ choice: 'save' | 'discard' | 'cancel'; all: boolean }> {
  saveChangesDialog ??= new SaveChanges();
  return saveChangesDialog.ask(name, true);
}

/** Yes-or-no alert; resolves true on OK and false on Cancel or any other way of closing. */
class Confirm extends Dialog {
  private readonly note = el<HTMLElement>('<p class="cv-note"></p>');
  private readonly ok: HTMLButtonElement;
  private resolve: ((v: boolean) => void) | null = null;

  constructor() {
    super('Confirm', 400);
    this.body.appendChild(this.note);
    this.button('Cancel', 'ghost', () => this.finish(false));
    this.ok = this.button('OK', 'primary', () => this.finish(true));
    this.onClose = () => this.finish(false);
  }

  ask(title: string, text: string, okLabel: string, danger: boolean): Promise<boolean> {
    this.setTitle(title);
    setText(this.note, text);
    setText(this.ok, okLabel);
    this.ok.className = danger ? 'cv-btn cv-btn-danger' : 'cv-btn cv-btn-primary';
    this.open(this.ok);
    return new Promise<boolean>((resolve) => { this.resolve = resolve; });
  }

  private finish(v: boolean): void {
    const done = this.resolve;
    this.resolve = null;
    if (this.isOpen) this.close();
    done?.(v);
  }
}

/** Asks for a single line of text; resolves the trimmed text, or null when cancelled or left empty. */
class Prompt extends Dialog {
  private readonly input = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false">');
  private readonly ok: HTMLButtonElement;
  private resolve: ((v: string | null) => void) | null = null;

  constructor() {
    super('Name', 400);
    this.field('Name', this.input);
    this.button('Cancel', 'ghost', () => this.finish(null));
    this.ok = this.button('OK', 'primary', () => this.finish(this.input.value.trim() || null));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.ok.click(); }
    });
    this.onClose = () => this.finish(null);
  }

  ask(title: string, value: string, okLabel: string): Promise<string | null> {
    this.setTitle(title);
    setText(this.ok, okLabel);
    this.input.value = value;
    this.open(this.input);
    this.input.select();
    return new Promise<string | null>((resolve) => { this.resolve = resolve; });
  }

  private finish(v: string | null): void {
    const done = this.resolve;
    this.resolve = null;
    if (this.isOpen) this.close();
    done?.(v);
  }
}

let confirmDlg: Confirm | null = null;
let promptDlg: Prompt | null = null;

export function confirmAction(title: string, text: string, okLabel = 'OK', danger = false): Promise<boolean> {
  confirmDlg ??= new Confirm();
  return confirmDlg.ask(title, text, okLabel, danger);
}

export function promptName(title: string, value: string, okLabel = 'OK'): Promise<string | null> {
  promptDlg ??= new Prompt();
  return promptDlg.ask(title, value, okLabel);
}

import { el, q, setText } from './dom';
import { icon } from './icons';
import { t } from './i18n';
import { loadPrefs, updatePrefs, type DialogValue } from './prefs';

/** A value a remembered dialog holds outside its form controls. */
export interface RememberedExtra { read(): Record<string, DialogValue>; write(values: Record<string, DialogValue>): void; onChange(notify: () => void): void }

const REMEMBERED ='input[type="range"], input[type="number"], input[type="checkbox"], input[type="color"], select';

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
  /** The English title: the key the remembered values are stored under, whatever language is showing. */
  private english = '';
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
    this.english = title;
    setText(this.title, t(title));
    q(this.scrim, '[data-close]').title = t('Close');
    q(this.scrim, '[data-close]').addEventListener('click', () => this.close());
    this.scrim.addEventListener('pointerdown', (e) => { if (e.target === this.scrim) this.close(); });
    this.scrim.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
      if (!step || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !(document.activeElement instanceof HTMLButtonElement) || document.activeElement.parentElement !== this.foot) return;
      const row = Array.from(this.foot.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')), at = row.indexOf(document.activeElement);
      const next = row[(at + step + row.length) % row.length];
      if (at >= 0 && next) { e.preventDefault(); next.focus(); }
    });
    document.getElementById('overlay-root')?.appendChild(this.scrim);
  }

  get isOpen(): boolean { return !this.scrim.hidden; }
  setTitle(title: string): void { this.english = title; setText(this.title, t(title)); }

  /** Dialogs are built once, often before the language is changed, so each opening re-reads the title, the Close
   *  tooltip and the footer buttons in the current language. A button whose text its owner has since replaced is left
   *  alone (its shown text no longer matches what was set here). */
  private relabel(): void {
    setText(this.title, t(this.english));
    q(this.scrim, '[data-close]').title = t('Close');
    for (const b of Array.from(this.foot.querySelectorAll<HTMLButtonElement>('button[data-en]'))) {
      if (b.textContent !== b.dataset.shown) continue;
      setText(b, t(b.dataset.en ?? ''));
      b.dataset.shown = b.textContent ?? '';
    }
    // Body labels (35.5d): each row's label span, in .cv-field rows and hand-built .cv-dialog-row rows, keeps its
    // English text in data-en the first time and shows the current language after; a label its owner has changed
    // since (text no longer what was shown) takes the new text as its English.
    for (const s of Array.from(this.body.querySelectorAll<HTMLElement>('.cv-field > span:first-child, .cv-dialog-row > span:first-child'))) {
      const now = s.textContent ?? '';
      if (!now) continue;
      if (s.dataset.en === undefined || now !== s.dataset.shown) s.dataset.en = now;
      const shown = t(s.dataset.en);
      if (shown !== now) setText(s, shown);
      s.dataset.shown = shown;
    }
  }

  private memory: { skip: ReadonlySet<Element>; busy: boolean; queued: boolean; extra: RememberedExtra | null } | null = null;

  /** DEV_PLAN 35.1: the dialog's settings stick. Call once the controls are built: every slider, number, check box,
   *  colour and select in the body (not text fields, which hold names and prompts) is put back to its last value when
   *  the app has been built and again each time the dialog opens, firing the controls' own handlers so the dialog's
   *  state follows, and kept in Preferences as it changes. `skip` lists controls that show the document (a size, a
   *  position) and so must not be put back. `extra` carries a value no form control holds (an anchor, a tool in a
   *  button row): `read` returns it, `write` takes it back, and `onChange` hands over what the dialog calls when it moves.
   *  Keyed by the dialog's title and the control's label. */
  remember(skip: readonly Element[] = [], extra: RememberedExtra | null = null): void {
    if (this.memory) return;
    const m = { skip: new Set<Element>(skip), busy: false, queued: false, extra };
    this.memory = m;
    const later = (): void => {
      if (m.busy || m.queued) return;
      m.queued = true;
      queueMicrotask(() => { m.queued = false; this.saveRemembered(); });
    };
    const queue = (e: Event): void => { if (e.target instanceof Element && e.target.matches(REMEMBERED) && !m.skip.has(e.target)) later(); };
    this.scrim.addEventListener('input', queue);
    this.scrim.addEventListener('change', queue);
    if (extra) extra.onChange(later);
    queueMicrotask(() => this.restoreRemembered());   // after the app has finished building, so the handlers find everything defined
  }

  /** The body's remembered controls with the names they are kept under: the label, the kind, and a count for repeats. */
  private rememberedControls(): Array<[string, HTMLInputElement | HTMLSelectElement]> {
    const seen = new Map<string, number>(), out: Array<[string, HTMLInputElement | HTMLSelectElement]> = [];
    const skip = this.memory?.skip;
    Array.from(this.body.querySelectorAll<HTMLInputElement | HTMLSelectElement>(REMEMBERED)).forEach((c, i) => {
      if (skip?.has(c) || c.closest('[data-forget]')) return;
      const host = c.closest('label, .cv-field, .cv-dialog-row'), span = host?.querySelector<HTMLElement>('span'), text = (c.getAttribute('aria-label') || span?.dataset.en || span?.textContent || host?.textContent || '').trim().slice(0, 60);   // the English label (35.5d), so remembered values keep their keys in every language
      const base = `${c instanceof HTMLSelectElement ? 'select' : c.type}:${text || `#${i}`}`, n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      out.push([n === 1 ? base : `${base}#${n}`, c]);
    });
    return out;
  }

  private saveRemembered(): void {
    const values: Record<string, DialogValue> = {};
    for (const [name, c] of this.rememberedControls()) values[name] = c instanceof HTMLInputElement && c.type === 'checkbox' ? c.checked : c.value;
    for (const [k, v] of Object.entries(this.memory?.extra?.read() ?? {})) values[`~${k}`] = v;
    const key = this.english, cur = loadPrefs().dialogValues;
    updatePrefs({ dialogValues: { ...cur, [key]: values } });
  }

  private restoreRemembered(): void {
    const m = this.memory, saved = loadPrefs().dialogValues[this.english];
    if (!m || !saved) return;
    m.busy = true;
    try {
      for (const [name, c] of this.rememberedControls()) {
        const v = saved[name];
        if (v === undefined) continue;
        if (c instanceof HTMLInputElement && c.type === 'checkbox') { if (typeof v !== 'boolean' || c.checked === v) continue; c.checked = v; }
        else {
          if (typeof v !== 'string' || c.value === v) continue;
          if (c instanceof HTMLSelectElement && !Array.from(c.options).some((o) => o.value === v && !o.disabled)) continue;
          c.value = v;
          if (c.value !== v) continue;
        }
        c.dispatchEvent(new Event('input', { bubbles: true }));
        c.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (m.extra) {
        const mine: Record<string, DialogValue> = {};
        for (const [k, v] of Object.entries(saved)) if (k.startsWith('~')) mine[k.slice(1)] = v;
        if (Object.keys(mine).length) m.extra.write(mine);
      }
    } finally { m.busy = false; }
  }

  /** Shows the dialog and moves focus into it: to `focus` if given, else to the first field or primary button. */
  open(focus?: HTMLElement | null): void {
    if (this.isOpen) return;
    this.relabel();
    this.restoreRemembered();
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
    setText(b, t(label));
    b.dataset.en = label; b.dataset.shown = b.textContent ?? '';
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

/** The same with Apply to All (Close All and Close Others, 1.65.8): `all` when it was ticked, so the
 *  answer stands for the documents after this one. */
export function askSaveChangesAll(name: string): Promise<{ choice: 'save' | 'discard' | 'cancel'; all: boolean }> {
  saveChangesDialog ??= new SaveChanges();
  return saveChangesDialog.ask(name, true);
}

/** Yes-or-no alert; resolves true on OK and false on Cancel or any other way of closing. */
class Confirm extends Dialog {
  private readonly note = el<HTMLElement>('<p class="cv-note"></p>');
  private readonly ok: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private resolve: ((v: boolean) => void) | null = null;

  constructor() {
    super('Confirm', 400);
    this.body.appendChild(this.note);
    this.cancel = this.button('Cancel', 'ghost', () => this.finish(false));
    this.ok = this.button('OK', 'primary', () => this.finish(true));
    this.onClose = () => this.finish(false);
  }

  /** A destructive question opens with Cancel focused, so Return alone never confirms it; the arrow keys move between the buttons. */
  ask(title: string, text: string, okLabel: string, danger: boolean): Promise<boolean> {
    this.setTitle(title);
    setText(this.note, text);
    setText(this.ok, okLabel);
    this.ok.className = danger ? 'cv-btn cv-btn-danger' : 'cv-btn cv-btn-primary';
    this.open(danger ? this.cancel : this.ok);
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

import { setText } from './dom';
import { t } from './i18n';

/** What a dialog needs of its fields beyond what its owner builds, once for every dialog: undo and redo of settled
 *  values (Mod+Z), Tab and Shift+Tab through the text and number fields only, and Alt turning Cancel into Reset. */

export const REMEMBERED = 'input[type="range"], input[type="number"], input[data-numtext], input[type="checkbox"], input[type="color"], select';
const CONTROLS = `${REMEMBERED}, input[type="text"], input:not([type])`;
const FIELD_TYPES = ['text', 'number', 'search', 'email', 'url', 'tel', 'password'];

type Control = HTMLInputElement | HTMLSelectElement;
type Value = string | boolean;
interface Step { c: Control; from: Value; to: Value; at: number }

export class DialogHistory {
  private snap: Array<[Control, Value]> = [];
  private last = new WeakMap<Element, Value>();
  private undone: Step[] = [];
  private redone: Step[] = [];
  private applying = false;

  constructor(private readonly scrim: HTMLElement, private readonly body: HTMLElement, private readonly foot: HTMLElement, private readonly isOpen: () => boolean) {
    const note = (e: Event): void => { const c = e.target; if (this.is(c) && !this.last.has(c)) this.last.set(c, this.val(c)); };
    scrim.addEventListener('focusin', note);
    scrim.addEventListener('pointerdown', note, true);
    scrim.addEventListener('change', (e) => this.settled(e));
    foot.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button[data-en="Cancel"]') : null;
      if (!b || !e.altKey || !this.snap.length) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.reset();
    }, true);
  }

  private is(t: EventTarget | null): t is Control { return t instanceof Element && t.matches(CONTROLS) && this.body.contains(t); }
  private val(c: Control): Value { return c instanceof HTMLInputElement && c.type === 'checkbox' ? c.checked : c.value; }
  private controls(): Control[] { return Array.from(this.body.querySelectorAll<Control>(CONTROLS)); }

  /** The dialog opened: history clears, and once its owner has filled it the values are kept for Reset. */
  start(): void {
    this.undone.length = 0;
    this.redone.length = 0;
    this.last = new WeakMap();
    queueMicrotask(() => {
      if (!this.isOpen()) return;
      this.snap = this.controls().map((c) => [c, this.val(c)] as [Control, Value]);
      for (const [c, v] of this.snap) this.last.set(c, v);
    });
  }

  /** A control settled on a new value: kept for undo, a run of changes to one control within half a second counting as one. */
  private settled(e: Event): void {
    const c = e.target;
    if (this.applying || !this.is(c)) return;
    const from = this.last.get(c), to = this.val(c), now = performance.now();
    this.last.set(c, to);
    if (from === undefined || from === to) return;
    const top = this.undone[this.undone.length - 1];
    if (top && top.c === c && now - top.at < 500) { top.to = to; top.at = now; } else { this.undone.push({ c, from, to, at: now }); if (this.undone.length > 100) this.undone.shift(); }
    this.redone.length = 0;
  }

  private put(c: Control, v: Value): void {
    const hadFocus = document.activeElement === c;
    if (hadFocus && c.hasAttribute('data-numtext')) c.blur();
    this.applying = true;
    try {
      if (c instanceof HTMLInputElement && c.type === 'checkbox') c.checked = v === true; else c.value = String(v);
      c.dispatchEvent(new Event('input', { bubbles: true }));
      c.dispatchEvent(new Event('change', { bubbles: true }));
    } finally { this.applying = false; }
    this.last.set(c, this.val(c));
    if (hadFocus) c.focus();
  }

  /** Mod+Z and Shift+Mod+Z step the fields back and forward, unless the focused field holds typing of its own still to undo. */
  undo(e: KeyboardEvent): void {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && a.type !== 'checkbox' && a.type !== 'range' && this.last.has(a) && a.value !== this.last.get(a)) return;
    e.preventDefault();
    const from = e.shiftKey ? this.redone : this.undone, to = e.shiftKey ? this.undone : this.redone, step = from.pop();
    if (!step || !step.c.isConnected) return;
    to.push(step);
    this.put(step.c, e.shiftKey ? step.to : step.from);
  }

  /** Tab and Shift+Tab move between the text and number fields and select what they land on; past the first or last field
   *  focus leaves by the normal order, so the buttons and checkboxes stay reachable from the keyboard. */
  tab(e: KeyboardEvent): void {
    const fields = Array.from(this.body.querySelectorAll<HTMLInputElement>('input')).filter((f) => !f.disabled && !f.readOnly && !f.hidden && f.getClientRects().length > 0 && FIELD_TYPES.includes(f.type));
    const at = fields.indexOf(document.activeElement as HTMLInputElement), to = at + (e.shiftKey ? -1 : 1);
    if (at < 0 || to < 0 || to >= fields.length) return;
    e.preventDefault();
    const next = fields[to];
    next.focus();
    next.select();
  }

  /** Alt+Cancel: every field goes back to what it held when the dialog opened. */
  private reset(): void {
    for (const [c, v] of this.snap) if (c.isConnected && this.val(c) !== v) this.put(c, v);
    this.undone.length = 0;
    this.redone.length = 0;
  }

  /** Cancel reads Reset while Alt is down. */
  alt(on: boolean): void {
    const b = this.foot.querySelector<HTMLButtonElement>('button[data-en="Cancel"]');
    if (!b || !this.snap.length) return;
    if (on && !b.dataset.cancelText) { b.dataset.cancelText = b.textContent ?? ''; setText(b, t('Reset')); }
    else if (!on && b.dataset.cancelText !== undefined) { setText(b, b.dataset.cancelText); delete b.dataset.cancelText; }
  }
}

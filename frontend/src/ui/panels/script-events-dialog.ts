import type { Actions } from '../actions';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { SCRIPT_EVENTS, type ScriptEvent, type ScriptEvents } from '../script-events';
import { checkRow } from './controls';

/** File > Scripts > Script Events Manager (DEV_PLAN 30.6). The DOM is built once; opening only refills the Action
 *  select, and the list of pairs is rebuilt as options when it changes. */
export class ScriptEventsDialog extends Dialog {
  private readonly eventSel = el('<select class="cv-input" aria-label="Event"></select>') as HTMLSelectElement;
  private readonly actionSel = el('<select class="cv-input" aria-label="Action"></select>') as HTMLSelectElement;
  private readonly list = el('<select size="6" class="cv-input" aria-label="Events with actions" style="width: 100%; height: 132px"></select>') as HTMLSelectElement;
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly enable: { el: HTMLElement; set: (v: boolean) => void };

  constructor(private readonly events: ScriptEvents, private readonly actions: Actions) {
    super('Script Events Manager', 460);
    this.enable = checkRow('Enable Events to Run Scripts/Actions', (v) => { this.events.enabled = v; this.events.save(); });
    for (const [id, label] of SCRIPT_EVENTS) this.eventSel.append(new Option(label, id));
    const add = el('<button class="cv-btn" type="button">Add</button>') as HTMLButtonElement;
    const remove = el('<button class="cv-btn" type="button">Remove</button>') as HTMLButtonElement;
    add.addEventListener('click', () => this.add());
    remove.addEventListener('click', () => this.remove());
    const row = (label: string, sel: HTMLElement): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(sel); return r; };   // the house dialog row
    const addScript = el('<button class="cv-btn" type="button">Add Script...</button>') as HTMLButtonElement;
    const toggle = el('<button class="cv-btn" type="button">Switch On or Off</button>') as HTMLButtonElement;
    const removeAll = el('<button class="cv-btn" type="button">Remove All</button>') as HTMLButtonElement;
    addScript.addEventListener('click', () => this.file.click());
    toggle.addEventListener('click', () => this.toggle());
    removeAll.addEventListener('click', () => this.removeAll());
    this.file.addEventListener('change', () => void this.addScriptFile());
    const buttons = el('<div style="display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0"></div>');
    buttons.append(add, addScript, toggle, remove, removeAll, this.file);
    this.body.append(this.enable.el, row('Event', this.eventSel), row('Action', this.actionSel), buttons, this.list, this.note,
      el('<p class="cv-dialog-note">A script is a .js file; it runs in a sandbox with run(id, params), commands() and log(...), and no document or network. A pair that is switched off is listed in grey brackets.</p>'), this.results);
    this.events.onResult = () => this.showResults();
    this.button('Done', 'primary', () => this.close());
  }

  private readonly file = el('<input type="file" accept=".js,.mjs,.txt,text/javascript,text/plain" hidden>') as HTMLInputElement;
  private readonly results = el('<p class="cv-dialog-note" role="log" aria-live="polite" style="min-height: 4.2em; white-space: pre-wrap"></p>');

  private showResults(): void {
    const t = (n: number): string => new Date(n).toLocaleTimeString();
    setText(this.results, this.events.results.slice(-3).map((r) => `${t(r.at)} ${this.label(r.event)}: ${r.target} ${r.ok ? 'ran' : 'failed'}${r.note ? `, ${r.note}` : ''}`).join('\n'));
  }

  private async addScriptFile(): Promise<void> {
    const f = this.file.files?.[0];
    this.file.value = '';
    if (!f) return;
    if (f.size > 200000) { setText(this.note, `${f.name} is larger than a script may be (200 KB).`); return; }
    const event = this.eventSel.value as ScriptEvent;
    if (this.events.bindings.some((b) => b.event === event && b.script !== undefined && b.action === f.name)) { setText(this.note, 'That pair is already listed.'); return; }
    this.events.bindings.push({ event, action: f.name, script: await f.text() });
    this.events.save();
    setText(this.note, '');
    this.refill();
  }

  private toggle(): void {
    const b = this.events.bindings[this.list.selectedIndex];
    if (!b) { setText(this.note, 'Choose a pair in the list first.'); return; }
    if (b.off) delete b.off; else b.off = true;
    this.events.save();
    this.refill();
  }

  private removeAll(): void {
    this.events.bindings.length = 0;
    this.events.save();
    setText(this.note, '');
    this.refill();
  }

  show(): void {
    this.enable.set(this.events.enabled);
    this.actionSel.replaceChildren(...this.actions.list.map((a) => new Option(a.name, a.name)));
    this.refill();
    this.showResults();
    setText(this.note, this.actions.list.length ? '' : 'No actions yet; record one in the Actions panel first.');
    this.open();
  }

  private label(e: ScriptEvent): string { return SCRIPT_EVENTS.find(([id]) => id === e)?.[1] ?? e; }

  private refill(): void {
    const keep = this.list.selectedIndex, rows = this.events.bindings.map((b) => (b.off ? `[${this.label(b.event)}: ${b.action}]` : `${this.label(b.event)}: ${b.action}`));
    while (this.list.options.length > rows.length) this.list.remove(this.list.options.length - 1);
    rows.forEach((text, i) => {
      let o = this.list.options[i];
      if (!o) { o = new Option('', String(i)); this.list.add(o); }
      if (o.textContent !== text) o.textContent = text;
    });
    if (keep >= 0 && keep < rows.length) this.list.selectedIndex = keep;
  }

  private add(): void {
    const event = this.eventSel.value as ScriptEvent, action = this.actionSel.value;
    if (!action) { setText(this.note, 'Choose an action first.'); return; }
    if (this.events.bindings.some((b) => b.event === event && b.action === action)) { setText(this.note, 'That pair is already listed.'); return; }
    this.events.bindings.push({ event, action });
    this.events.save();
    setText(this.note, '');
    this.refill();
  }

  private remove(): void {
    const i = this.list.selectedIndex;
    if (i < 0) { setText(this.note, 'Choose a pair in the list to remove.'); return; }
    this.events.bindings.splice(i, 1);
    this.events.save();
    setText(this.note, '');
    this.refill();
  }
}

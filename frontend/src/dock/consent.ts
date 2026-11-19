import type { ConsentChoice, ConsentRequest, DockAdapter } from './adapter';
import { el, q, setHidden, setText } from './dom';
import { strings, type Say } from './strings';

const fill = (text: string, vars: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));

export class Consent {
  readonly root: HTMLElement;
  private readonly s: Say;
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly what: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly buttons: HTMLButtonElement[];
  private readonly queue: ConsentRequest[] = [];
  private back: HTMLElement | null = null;
  private busy = false;
  private opening = false;

  constructor(private readonly a: DockAdapter) {
    const s = strings(a);
    const c = a.classes;
    this.s = s;
    this.root = el(`<div class="ft-consent" hidden>
    <div class="ft-consent-box" role="alertdialog" aria-modal="true" aria-labelledby="ft-consent-title" aria-describedby="ft-consent-what">
      <h2 class="ft-consent-title" id="ft-consent-title"></h2>
      <p class="ft-consent-count ${c.note}"></p>
      <p class="ft-consent-what" id="ft-consent-what"></p>
      <p class="ft-consent-notice ${c.note}" role="status" hidden>${s('consentChanged')}</p>
      <div class="ft-consent-buttons">
        <button type="button" class="${c.button} ft-consent-deny" data-choice="deny">${s('consentDeny')}</button>
        <button type="button" class="${c.button} ft-consent-once" data-choice="once">${s('consentOnce')}</button>
        <button type="button" class="${c.button} ${c.primaryButton} ft-consent-always" data-choice="always">${s('consentAlways')}</button>
      </div>
    </div>
  </div>`);
    this.title = q(this.root, '.ft-consent-title');
    this.count = q(this.root, '.ft-consent-count');
    this.what = q(this.root, '.ft-consent-what');
    this.notice = q(this.root, '.ft-consent-notice');
    this.buttons = [...this.root.querySelectorAll<HTMLButtonElement>('.ft-consent-buttons button')];
    for (const b of this.buttons) b.addEventListener('click', () => void this.pick(b.dataset.choice as ConsentChoice));
    window.addEventListener('keydown', (e) => { if (!this.root.hidden) this.key(e); }, true);
    document.body.append(this.root);
    a.consent.subscribe((request) => this.add(request));
  }

  get waiting(): number { return this.queue.length; }

  isOpen(): boolean { return !this.root.hidden; }

  private add(request: ConsentRequest): void {
    if (this.queue.some((r) => r.id === request.id)) return;
    this.queue.push(request);
    void this.show();
  }

  private async show(): Promise<void> {
    const r = this.queue[0];
    if (!r) { this.hide(); return; }
    setText(this.title, fill(this.s('consentTitle'), { agent: r.agent || this.s('consentAgent') }));
    setText(this.what, fill(this.s('consentWhat'), { what: r.what }));
    setText(this.count, fill(this.s('consentCount'), { n: 1, total: this.queue.length }));
    const many = this.queue.length > 1 ? 'visible' : 'hidden';
    if (this.count.style.visibility !== many) this.count.style.visibility = many;
    if (!this.root.hidden || this.opening) return;
    this.opening = true;
    let changed = false;
    try { changed = (await this.a.storedChoice.get()).changedOutside; } catch { changed = false; }
    this.opening = false;
    if (!this.queue.length) return;
    setHidden(this.notice, !changed);
    const active = document.activeElement;
    this.back = active instanceof HTMLElement && active !== document.body ? active : null;
    setHidden(this.root, false);
    this.buttons[0].focus();
  }

  private hide(): void {
    if (this.root.hidden) return;
    setHidden(this.root, true);
    const back = this.back;
    this.back = null;
    if (back?.isConnected) back.focus();
  }

  private async pick(choice: ConsentChoice): Promise<void> {
    if (this.busy) return;
    const r = this.queue[0];
    if (!r) return;
    this.busy = true;
    try {
      await this.a.consent.answer(r.id, choice).catch(() => undefined);
      this.queue.shift();
      if (choice === 'always') for (const rest of this.queue.splice(0)) await this.a.consent.answer(rest.id, 'always').catch(() => undefined);
    } finally { this.busy = false; }
    void this.show();
  }

  private key(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void this.pick('deny'); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const at = this.buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = (at + (e.shiftKey ? -1 : 1) + this.buttons.length) % this.buttons.length;
      this.buttons[at < 0 ? 0 : next].focus();
    }
    e.stopPropagation();
  }
}

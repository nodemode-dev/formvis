import { Dialog } from '../dialogs';
import { el, q, setDisabled, setText, setTitle } from '../dom';
import { loadPrefs, updatePrefs } from '../prefs';
import { checkRow, type Row } from './controls';
import { RELEASES } from './whats-new-data';

/** Help > What's New: the additions of the current and recent releases (`whats-new-data.ts`), each with a Show Me
 *  button that closes the dialog and then runs its command through the command catalogue. Built once, with every row
 *  in place, so opening it moves nothing; a command that cannot run now (it needs a document) shows its button
 *  disabled with the reason as its tooltip. */
export class WhatsNewDialog extends Dialog {
  private readonly buttons: Array<{ command: string; button: HTMLButtonElement }> = [];
  private readonly auto: Row<boolean>;

  constructor(private readonly hooks: { run(command: string): void; enabled(command: string): boolean }) {
    super('What\'s New', 540);
    for (const release of RELEASES) {
      const section = el('<section class="cv-new-release"><h3 class="cv-new-head"><span class="cv-new-ver"></span><span class="cv-new-name"></span></h3><ul class="cv-new-list"></ul></section>');
      setText(q(section, '.cv-new-ver'), release.version);
      setText(q(section, '.cv-new-name'), release.name);
      const list = q(section, '.cv-new-list');
      for (const a of release.additions) {
        const row = el('<li class="cv-new-row"><div class="cv-new-text"><strong class="cv-new-title"></strong><span class="cv-note cv-new-desc"></span></div><button class="cv-btn" type="button">Show Me</button></li>');
        setText(q(row, '.cv-new-title'), a.title);
        setText(q(row, '.cv-new-desc'), a.text);
        const button = q<HTMLButtonElement>(row, 'button');
        button.dataset.command = a.command;
        button.setAttribute('aria-label', `Show me: ${a.title}`);
        button.addEventListener('click', () => { this.close(); this.hooks.run(a.command); });
        this.buttons.push({ command: a.command, button });
        list.appendChild(row);
      }
      this.body.appendChild(section);
    }
    this.auto = checkRow('Show this once after an update', (v) => { updatePrefs({ whatsNewAuto: v }); });
    this.body.appendChild(this.auto.el);
    this.button('Close', 'primary', () => this.close());
  }

  show(): void {
    if (this.isOpen) return;
    for (const { command, button } of this.buttons) {
      const ok = this.hooks.enabled(command);
      setDisabled(button, !ok);
      setTitle(button, ok ? '' : 'Not available right now: it needs an open document or a selected layer');
    }
    this.auto.set(loadPrefs().whatsNewAuto);
    this.open();
  }
}

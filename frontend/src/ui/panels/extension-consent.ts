import { PERMISSION_WORDS, type ExtensionRecord } from '../../formext/host-bridge';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

const SOURCE: Record<string, string> = { catalogue: 'from the catalogue', sideload: 'installed from a file', development: 'in development on this computer' };

/** The first activation of an extension version, before its frame exists: what it asks for in plain words, Allow or
 *  Not Now. Allow is kept per id, version and permission set by the extension host; Not Now is not kept. */
export class ExtensionConsentDialog extends Dialog {
  private readonly lead = el('<p class="cv-agent-ask"></p>');
  private readonly list = el('<ul class="cv-ext-consent-list"></ul>');
  private readonly tail = el('<p class="cv-note">Not Now leaves it closed; formvis asks again the next time you open it.</p>');
  private answer: ((ok: boolean) => void) | null = null;

  constructor() {
    super('Allow this extension?', 420);
    this.body.append(this.lead, this.list, this.tail);
    this.button('Not Now', 'ghost', () => this.settle(false));
    this.button('Allow', 'primary', () => this.settle(true));
  }

  ask(ext: ExtensionRecord): Promise<boolean> {
    this.settle(false);
    this.setTitle(`Allow ${ext.name}?`);
    setText(this.lead, `${ext.name} ${ext.version}, ${SOURCE[ext.source] ?? ext.source}, asks to:`);
    this.list.replaceChildren(...ext.permissions.map((p) => { const li = el('<li></li>'); li.textContent = PERMISSION_WORDS[p] ?? p; return li; }));
    this.open();
    return new Promise((ok) => { this.answer = ok; });
  }

  close(): void { const a = this.answer; this.answer = null; super.close(); a?.(false); }

  private settle(ok: boolean): void { const a = this.answer; this.answer = null; if (a) { super.close(); a(ok); } }
}

import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** An outside agent's request that costs money (1.52.1): Allow or Don't, in formvis, before anything is spent. */
export class AgentConfirmDialog extends Dialog {
  private readonly text = el('<p class="cv-agent-ask"></p>');
  private answer: ((ok: boolean) => void) | null = null;

  constructor() {
    super('An agent asks', 400);
    this.body.append(this.text);
    this.button("Don't", 'ghost', () => this.settle(false));
    this.button('Allow', 'primary', () => this.settle(true));
  }

  ask(title: string, text: string): Promise<boolean> {
    this.settle(false);   // an earlier question left open is declined
    this.setTitle(title);
    setText(this.text, text);
    this.open();
    return new Promise((ok) => { this.answer = ok; });
  }

  close(): void { const a = this.answer; this.answer = null; super.close(); a?.(false); }

  private settle(ok: boolean): void { const a = this.answer; this.answer = null; if (a) { super.close(); a(ok); } }
}

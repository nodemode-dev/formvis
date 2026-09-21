import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';

/** An action's stop step: its message, with Continue when the stop allows it, and Stop. */
export class StopDialog extends Dialog {
  private readonly message = el('<p class="cv-stop-message"></p>');
  private readonly go: HTMLButtonElement;
  private answer: ((go: boolean) => void) | null = null;

  constructor() {
    super('Action Paused', 400);
    this.body.appendChild(this.message);
    this.button('Stop', 'ghost', () => this.finish(false));
    this.go = this.button('Continue', 'primary', () => this.finish(true));
    this.onClose = () => this.finish(false);
  }

  ask(message: string, allowContinue: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      this.answer = resolve;
      setText(this.message, message || 'The action stops here.');
      setHidden(this.go, !allowContinue);
      this.open(allowContinue ? this.go : null);
    });
  }

  private finish(go: boolean): void {
    const a = this.answer;
    if (!a) return;
    this.answer = null;
    if (this.isOpen) this.close();
    a(go);
  }
}

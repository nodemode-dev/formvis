/** A prompt field's own undo and redo: every state it reaches (typing, Improve, Restore, a prompt set by a command or an
 *  agent) is kept, and Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y walk through them, so one rewrite never loses what came before. */
export class PromptHistory {
  private stack: string[];
  private at = 0;
  private timer = 0;
  private walking = false;
  /** Called after the stack or the position changes, so buttons can follow. */
  onChange: () => void = () => {};

  constructor(private readonly field: HTMLInputElement | HTMLTextAreaElement) {
    this.stack = [field.value];
    field.addEventListener('input', () => {
      if (this.walking) return;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.settle(), 400);
    });
    field.addEventListener('focus', () => this.settle());
    const keys = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); this.undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); e.stopPropagation(); this.redo(); }
    };
    field.addEventListener('keydown', keys as EventListener);
  }

  get canUndo(): boolean { return this.at > 0 || this.field.value !== this.stack[this.at]; }
  get canRedo(): boolean { return this.at < this.stack.length - 1; }

  /** Keeps the field's present text as a state when it differs from the one on top (typing, or a value set from outside). */
  settle(): void {
    window.clearTimeout(this.timer);
    const v = this.field.value;
    if (v === this.stack[this.at]) return;
    this.stack.splice(this.at + 1);
    this.stack.push(v);
    if (this.stack.length > 100) this.stack.shift();
    this.at = this.stack.length - 1;
    this.onChange();
  }

  /** Puts `text` in the field as a new state; what stood there before stays one undo away. */
  set(text: string): void {
    this.settle();
    this.field.value = text;
    this.settle();
  }

  undo(): boolean {
    this.settle();
    if (this.at === 0) return false;
    this.go(this.at - 1);
    return true;
  }

  redo(): boolean {
    if (this.at >= this.stack.length - 1) return false;
    this.go(this.at + 1);
    return true;
  }

  private go(to: number): void {
    this.at = to;
    this.walking = true;
    this.field.value = this.stack[to];
    this.walking = false;
    this.onChange();
  }
}

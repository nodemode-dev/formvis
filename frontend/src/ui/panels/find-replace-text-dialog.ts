import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, q, setText, setValue } from '../dom';
import { checkRow } from './controls';

/** Type > Find and Replace Text (DEV_PLAN 32.7 part a). The DOM is built once; later calls only change values and text. */
export class FindReplaceTextDialog extends Dialog {
  private readonly find = el('<label class="cv-field"><span></span><input class="cv-input" type="text" maxlength="200"></label>');
  private readonly repl = el('<label class="cv-field"><span></span><input class="cv-input" type="text" maxlength="200"></label>');
  private readonly findInput: HTMLInputElement;
  private readonly replInput: HTMLInputElement;
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private caseSensitive = false;
  private wholeWord = false;
  private all = true;

  constructor(private readonly engine: Engine) {
    super('Find and Replace Text', 420);
    setText(q(this.find, 'span'), 'Find');
    setText(q(this.repl, 'span'), 'Change To');
    this.findInput = q(this.find, 'input') as HTMLInputElement;
    this.replInput = q(this.repl, 'input') as HTMLInputElement;
    const cs = checkRow('Case Sensitive', (v) => { this.caseSensitive = v; });
    const ww = checkRow('Whole Word', (v) => { this.wholeWord = v; });
    const all = checkRow('Search All Layers', (v) => { this.all = v; });
    cs.set(false); ww.set(false); all.set(true);
    this.body.append(this.find, this.repl, cs.el, ww.el, all.el, this.note);
    this.button('Done', 'ghost', () => this.close());
    this.button('Change All', 'primary', () => void this.apply());
  }

  show(): void {
    setValue(this.findInput, '');
    setValue(this.replInput, '');
    setText(this.note, '');
    this.open();
  }

  private async apply(): Promise<void> {
    if (!this.findInput.value) { setText(this.note, 'Type the text to find.'); return; }
    const n = await this.engine.replaceText(this.findInput.value, this.replInput.value, { caseSensitive: this.caseSensitive, wholeWord: this.wholeWord, all: this.all });
    setText(this.note, `${n} replacement${n === 1 ? '' : 's'}.`);
  }
}

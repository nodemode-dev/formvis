import type { Engine } from '../../engine';
import type { TextMatch } from '../../engine/text-ops';
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
    this.button('Find Previous', 'ghost', () => this.step(false));
    this.button('Find Next', 'ghost', () => this.step(true));
    this.button('Change', 'ghost', () => void this.change(false));
    this.button('Change/Find', 'ghost', () => void this.change(true));
    this.button('Change All', 'primary', () => void this.apply());
  }

  show(): void {
    setValue(this.findInput, '');
    setValue(this.replInput, '');
    setText(this.note, '');
    this.at = null;
    this.open();
  }

  private at: TextMatch | null = null;

  private opts(): { caseSensitive: boolean; wholeWord: boolean; all: boolean } { return { caseSensitive: this.caseSensitive, wholeWord: this.wholeWord, all: this.all }; }

  /** Find Next or Previous: the match is shown by selecting its layer, with its place in the note. */
  private step(forward: boolean): TextMatch | null {
    if (!this.findInput.value) { setText(this.note, 'Type the text to find.'); return null; }
    const m = this.engine.findTextMatch(this.findInput.value, this.opts(), this.at, forward);
    this.at = m;
    if (!m) { setText(this.note, 'No match found.'); return null; }
    this.engine.selectLayer(m.id);
    const name = this.engine.current?.layer(m.id)?.name ?? '';
    setText(this.note, `Found in "${name}" at character ${m.start + 1}.`);
    return m;
  }

  /** Change the match found last (finding one first when none is), then, for Change/Find, on to the next. */
  private async change(next: boolean): Promise<void> {
    const m = this.at ?? this.step(true);
    if (!m) return;
    const to = this.replInput.value;
    if (!(await this.engine.replaceTextMatch(m, to))) { this.at = null; setText(this.note, 'That match has changed; find again.'); return; }
    this.at = { id: m.id, start: m.start, end: m.start + to.length };
    if (next) this.step(true); else setText(this.note, 'Changed one occurrence.');
  }

  private async apply(): Promise<void> {
    if (!this.findInput.value) { setText(this.note, 'Type the text to find.'); return; }
    const n = await this.engine.replaceText(this.findInput.value, this.replInput.value, { caseSensitive: this.caseSensitive, wholeWord: this.wholeWord, all: this.all });
    setText(this.note, `${n} replacement${n === 1 ? '' : 's'}.`);
  }
}

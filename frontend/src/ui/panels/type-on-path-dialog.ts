import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { sliderRow } from './controls';

/** Layer > Type on Path: the text, and where it starts along the active path (Start Offset, a percentage of its length).
 *  OK sets it along the path in the current type settings, as a type layer that stays editable (Edit Type) and on its
 *  path. Photoshop starts it with a Type tool click on the path; here the path is the one selected in Paths. */
export class TypeOnPathDialog extends Dialog {
  private offset = 0;
  private readonly text = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Text to set on the path">');
  private readonly sync: () => void;

  constructor(private readonly engine: Engine) {
    super('Type on Path', 420);
    const field = el('<label class="cv-field"><span>Text</span></label>');
    field.append(this.text);
    const start = sliderRow('Start Offset (%)', 0, 100, 1, (v) => { this.offset = v; });
    this.body.append(field, start.el);
    this.sync = () => start.set(this.offset);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    if (this.isOpen) return;
    this.sync();
    this.open();
    this.text.focus();
  }

  private apply(): void {
    const content = this.text.value, offset = this.offset;
    this.close();
    void this.engine.createTextOnPath(content, offset);
  }
}

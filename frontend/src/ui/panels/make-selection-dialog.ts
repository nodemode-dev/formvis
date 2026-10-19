import type { Engine, SelectionMode } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

/** Paths > Make Selection from Path: the Feather Radius, Anti-aliased, and how the new selection meets the one already
 *  there (New, Add, Subtract, Intersect). The choices are kept for next time. */
export class MakeSelectionDialog extends Dialog {
  private feather = 0;
  private antialias = true;
  private mode: SelectionMode = 'replace';
  private readonly featherRow = sliderRow('Feather radius (px)', 0, 250, 0.5, (v) => { this.feather = v; });
  private readonly aaRow = checkRow('Anti-aliased', (v) => { this.antialias = v; });
  private readonly modeRow = selectRow('Operation', [['replace', 'New Selection'], ['add', 'Add to Selection'], ['subtract', 'Subtract from Selection'], ['intersect', 'Intersect with Selection']], (v) => { this.mode = v as SelectionMode; });

  constructor(private readonly engine: Engine) {
    super('Make Selection', 340);
    this.body.append(this.featherRow.el, this.aaRow.el, this.modeRow.el, el('<p class="cv-note">The path\'s inside becomes the selection, feathered and combined as chosen.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    if (this.isOpen) return;
    if (!this.engine.workPath) { this.engine.notice('Draw a path with the Pen tool first.'); return; }
    this.featherRow.set(this.feather);
    this.aaRow.set(this.antialias);
    this.modeRow.set(this.engine.current?.selection ? this.mode : 'replace');
    this.open();
  }

  private apply(): void {
    this.close();
    this.engine.pathToSelectionWith(this.feather, this.antialias, this.engine.current?.selection ? this.mode : 'replace');
  }
}

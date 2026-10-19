import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow } from './controls';

/** File > Save a Copy (1.65.8): the copy's name in the library, and Layers (unticked, the picture flattened
 *  into one layer); Save hands both to `save`, which keeps the copy and leaves the document in its tab as it is. */
export class SaveCopyDialog extends Dialog {
  private layered = true;
  private readonly note = el('<p class="cv-note"></p>');
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private readonly layers = checkRow('Layers', (v) => { this.layered = v; });

  constructor(private readonly engine: Engine, private readonly save: (name: string, layers: boolean) => void) {
    super('Save a Copy', 360);
    this.body.append(this.note);
    this.field('As', this.name);
    this.body.append(this.layers.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Save', 'primary', () => this.apply());
    this.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
    this.remember();
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    setText(this.note, `A copy of ${p.name} for the library; the document in its tab keeps its name and its changes.`);
    this.name.value = `${p.name} copy`;
    this.layered = true;
    this.layers.set(true);
    this.open(this.name);
    this.name.select();
  }

  private apply(): void {
    const name = this.name.value.trim();
    if (!name) { this.engine.notice('Name the copy.'); return; }
    this.close();
    this.save(name, this.layered);
  }
}

import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

export type CopyFormat = 'fvd' | 'png' | 'jpg' | 'webp' | 'tiff';
const COPY_FORMATS: ReadonlyArray<readonly [string, string]> = [['fvd', 'Project (.fvd)'], ['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'], ['tiff', 'TIFF']];

/** File > Save a Copy (1.65.8): the copy's name, its format (the project with its layers, or a flattened PNG, JPEG,
 *  WebP or TIFF at a quality) and Layers (unticked, a project's picture flattened into one layer); Save hands them to
 *  `save`, which keeps the copy and leaves the document in its tab as it is. */
export class SaveCopyDialog extends Dialog {
  private layered = true;
  private format: CopyFormat = 'fvd';
  private quality = 92;
  private readonly note = el('<p class="cv-note"></p>');
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private readonly layers = checkRow('Layers', (v) => { this.layered = v; });
  private readonly formatRow = selectRow('Format', COPY_FORMATS, (v) => { this.format = v as CopyFormat; this.sync(); });
  private readonly qualityRow = sliderRow('Quality', 1, 100, 1, (v) => { this.quality = v; });

  constructor(private readonly engine: Engine, private readonly save: (name: string, layers: boolean, format: CopyFormat, quality: number) => void) {
    super('Save a Copy', 360);
    this.body.append(this.note);
    this.field('As', this.name);
    this.body.append(this.formatRow.el, this.qualityRow.el, this.layers.el);
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
    this.format = 'fvd';
    this.formatRow.set('fvd');
    this.quality = 92;
    this.qualityRow.set(92);
    this.sync();
    this.open(this.name);
    this.name.select();
  }

  private sync(): void {
    this.layers.el.hidden = this.format !== 'fvd';
    this.qualityRow.el.hidden = this.format !== 'jpg' && this.format !== 'webp' && this.format !== 'tiff';
  }

  private apply(): void {
    const name = this.name.value.trim();
    if (!name) { this.engine.notice('Name the copy.'); return; }
    this.close();
    this.save(name, this.layered, this.format, this.quality);
  }
}

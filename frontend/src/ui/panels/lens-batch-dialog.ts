import { IMAGE_ACCEPT } from '../../io/images';
import { defaultLensFix, type LensFix } from '../../engine/filters';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';
import { folderImages, folderInput } from './image-processor-dialog';

export interface LensBatchOptions { distortion: number; lensFix: LensFix; format: 'same' | 'png' | 'jpg'; quality: number; template: string }

/** File > Automate > Lens Correction: the Lens Correction settings applied to every chosen picture or folder, each saved as
 *  its own type (or PNG or JPEG) into one zip. */
export class LensBatchDialog extends Dialog {
  private readonly o: LensBatchOptions = { distortion: 0, lensFix: defaultLensFix(), format: 'same', quality: 92, template: '{name}' };
  private readonly file = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" hidden>`);
  private readonly folder = folderInput();
  private readonly chosen = el('<p class="cv-note"></p>');
  private files: File[] = [];
  private inFolder: File[] = [];
  private subfolders = true;

  constructor(private readonly run: (o: LensBatchOptions, files: File[]) => Promise<void>) {
    super('Lens Correction', 440);
    const o = this.o, f = o.lensFix;
    const rows = [
      sliderRow('Distortion', -100, 100, 1, (v) => { o.distortion = v; }), sliderRow('Fix Red/Cyan Fringe', -100, 100, 1, (v) => { f.caRc = v; }), sliderRow('Fix Blue/Yellow Fringe', -100, 100, 1, (v) => { f.caBy = v; }),
      sliderRow('Vignette Amount', -100, 100, 1, (v) => { f.vignette = v; }), sliderRow('Vignette Midpoint', 0, 100, 1, (v) => { f.midpoint = v; }),
      sliderRow('Vertical Perspective', -100, 100, 1, (v) => { f.vertical = v; }), sliderRow('Horizontal Perspective', -100, 100, 1, (v) => { f.horizontal = v; }),
    ], initial = [o.distortion, f.caRc, f.caBy, f.vignette, f.midpoint, f.vertical, f.horizontal];
    rows.forEach((r, k) => { this.body.append(r.el); r.set(initial[k]); });
    this.body.append(selectRow('Edge', [['transparent', 'Transparency'], ['extend', 'Edge Extension'], ['black', 'Black Color'], ['white', 'White Color']], (v) => { f.edge = v as LensFix['edge']; }).el);
    const row = el('<div class="cv-welcome-actions"></div>'), choose = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose images...</button>'), chooseDir = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose folder...</button>');
    choose.addEventListener('click', () => this.file.click());
    chooseDir.addEventListener('click', () => this.folder.click());
    row.append(choose, chooseDir);
    const sub = checkRow('Include All Sub-folders', (v) => { this.subfolders = v; if (this.inFolder.length) { this.files = folderImages(this.inFolder, v); this.sync(); } });
    sub.set(true);
    this.body.append(row, this.chosen, this.file, this.folder, sub.el);
    this.body.append(selectRow('Save as', [['same', 'Same as source'], ['png', 'PNG'], ['jpg', 'JPEG']], (v) => { o.format = v as LensBatchOptions['format']; }).el);
    this.folder.addEventListener('change', () => { this.inFolder = [...(this.folder.files ?? [])]; this.folder.value = ''; this.files = folderImages(this.inFolder, this.subfolders); this.sync(); });
    this.file.addEventListener('change', () => { this.files = [...(this.file.files ?? [])]; this.inFolder = []; this.file.value = ''; this.sync(); });
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Run', 'primary', () => void this.go());
  }

  show(): void { this.files = []; this.inFolder = []; this.sync(); this.open(); }

  private sync(): void {
    setText(this.chosen, this.files.length ? `${this.files.length} image${this.files.length === 1 ? '' : 's'} chosen. Each opens, is corrected and saved; the results download as one zip.` : 'Choose the images, or a folder, to correct.');
  }

  private async go(): Promise<void> {
    if (!this.files.length) { setText(this.chosen, 'Choose the images to correct.'); return; }
    const files = this.files;
    this.close();
    await this.run(structuredClone(this.o), files);
  }
}

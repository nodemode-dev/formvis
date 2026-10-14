import { IMAGE_ACCEPT } from '../../io/images';
import type { Action, Actions } from '../actions';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** File > Scripts > Image Processor (DEV_PLAN 30.2): what the dialog hands the runner. */
export interface ImageProcessorFit { on: boolean; w: number; h: number }
export interface ImageProcessorOptions {
  files: File[];
  useOpen: boolean;
  jpeg: ImageProcessorFit & { on: boolean; quality: number; srgb: boolean };
  psd: ImageProcessorFit & { on: boolean };
  tiff: ImageProcessorFit & { on: boolean; lzw: boolean };
  action: Action | null;
  copyright: string;
}

const box = (checked = false): HTMLInputElement => el<HTMLInputElement>(`<input type="checkbox"${checked ? ' checked' : ''}>`);
const num = (value: string, min: number, max: number): HTMLInputElement => el<HTMLInputElement>(`<input class="cv-input" type="number" min="${min}" max="${max}" step="1" value="${value}">`);
const heading = (text: string): HTMLElement => el(`<p class="cv-note"><strong>${text}</strong></p>`);

/** Photoshop's Image Processor: one source, one destination, three file types and an optional action and copyright. */
export class ImageProcessorDialog extends Dialog {
  private readonly file = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" hidden>`);
  private readonly useOpen = box();
  private readonly chosen = el('<p class="cv-note"></p>');
  private readonly jpegOn = box(true);
  private readonly jpegQuality = num('10', 0, 12);
  private readonly jpegFit = box();
  private readonly jpegW = num('', 1, 30000);
  private readonly jpegH = num('', 1, 30000);
  private readonly jpegSrgb = box();
  private readonly psdOn = box();
  private readonly psdFit = box();
  private readonly psdW = num('', 1, 30000);
  private readonly psdH = num('', 1, 30000);
  private readonly tiffOn = box();
  private readonly tiffLzw = box(true);
  private readonly tiffFit = box();
  private readonly tiffW = num('', 1, 30000);
  private readonly tiffH = num('', 1, 30000);
  private readonly runAction = box();
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
  private readonly copyright = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Copyright Info" spellcheck="false">');
  private files: File[] = [];

  constructor(private readonly store: Actions, private readonly run: (o: ImageProcessorOptions) => Promise<void>) {
    super('Image Processor', 480);
    this.body.appendChild(heading('1. Select the images to process'));
    const row = el('<div class="cv-welcome-actions"></div>'), choose = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose images...</button>');
    choose.addEventListener('click', () => this.file.click());
    row.appendChild(choose);
    this.body.append(row, this.chosen, this.file);
    this.field('Use Open Images', this.useOpen);
    this.body.appendChild(heading('2. Select the destination'));
    this.body.appendChild(el('<p class="cv-note">Each type goes into its own folder (JPEG, PSD, TIFF). In the browser the results download as one zip; in the desktop app they are written to a named folder in the exports folder.</p>'));
    this.body.appendChild(heading('3. File type'));
    this.field('Save as JPEG', this.jpegOn);
    this.field('Quality (0 to 12)', this.jpegQuality);
    this.field('Resize to Fit', this.jpegFit);
    this.field('W (px)', this.jpegW);
    this.field('H (px)', this.jpegH);
    this.field('Convert Profile to sRGB', this.jpegSrgb);
    this.field('Save as PSD', this.psdOn);
    this.field('Resize to Fit', this.psdFit);
    this.field('W (px)', this.psdW);
    this.field('H (px)', this.psdH);
    this.field('Save as TIFF', this.tiffOn);
    this.field('LZW Compression', this.tiffLzw);
    this.field('Resize to Fit', this.tiffFit);
    this.field('W (px)', this.tiffW);
    this.field('H (px)', this.tiffH);
    this.body.appendChild(heading('4. Preferences'));
    this.field('Run Action', this.runAction);
    this.field('Action', this.pick);
    this.field('Copyright Info', this.copyright);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Run', 'primary', () => void this.go());
    this.file.addEventListener('change', () => { this.files = [...(this.file.files ?? [])]; this.file.value = ''; this.sync(); });
    this.remember([this.pick]);   // every setting; the action is chosen from the list as it stands
  }

  show(): void { this.files = []; this.sync(); this.open(); }

  private sync(): void {
    const n = this.store.list.length;
    while (this.pick.options.length > n) this.pick.remove(this.pick.options.length - 1);
    this.store.list.forEach((a, i) => {
      let o = this.pick.options[i];
      if (!o) { o = document.createElement('option'); this.pick.appendChild(o); }
      if (o.value !== String(i)) o.value = String(i);
      const t = `${a.name} (${a.steps.length} step${a.steps.length === 1 ? '' : 's'})`;
      if (o.textContent !== t) o.textContent = t;
    });
    setText(this.chosen, this.files.length ? `${this.files.length} image${this.files.length === 1 ? '' : 's'} chosen.` : 'No images chosen.');
  }

  private async go(): Promise<void> {
    const fit = (on: HTMLInputElement, w: HTMLInputElement, h: HTMLInputElement): ImageProcessorFit => ({ on: on.checked && Number(w.value) > 0 && Number(h.value) > 0, w: Math.round(Number(w.value)), h: Math.round(Number(h.value)) });
    const o: ImageProcessorOptions = {
      files: this.files, useOpen: this.useOpen.checked,
      jpeg: { ...fit(this.jpegFit, this.jpegW, this.jpegH), on: this.jpegOn.checked, quality: Math.min(12, Math.max(0, Math.round(Number(this.jpegQuality.value) || 0))), srgb: this.jpegSrgb.checked },
      psd: { ...fit(this.psdFit, this.psdW, this.psdH), on: this.psdOn.checked },
      tiff: { ...fit(this.tiffFit, this.tiffW, this.tiffH), on: this.tiffOn.checked, lzw: this.tiffLzw.checked },
      action: this.runAction.checked ? this.store.list[Number(this.pick.value)] ?? null : null,
      copyright: this.copyright.value.trim(),
    };
    if (!o.useOpen && !o.files.length) { setText(this.chosen, 'Choose images, or tick Use Open Images.'); return; }
    if (!o.jpeg.on && !o.psd.on && !o.tiff.on) { setText(this.chosen, 'Tick at least one file type.'); return; }
    if (this.runAction.checked && !o.action) { setText(this.chosen, 'Record an action first.'); return; }
    this.close();
    await this.run(o);
  }
}

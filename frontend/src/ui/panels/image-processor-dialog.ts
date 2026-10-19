import { IMAGE_ACCEPT } from '../../io/images';
import { outFolderAvailable, pickOutFolder } from '../../io/out-folder';
import type { Action, Actions } from '../actions';
import { Dialog } from '../dialogs';
import { el, q, setHidden, setText } from '../dom';

/** File > Scripts > Image Processor (DEV_PLAN 30.2): what the dialog hands the runner. */
export interface ImageProcessorFit { on: boolean; w: number; h: number }
export interface ImageProcessorOptions {
  files: File[];
  useOpen: boolean;
  jpeg: ImageProcessorFit & { on: boolean; quality: number; srgb: boolean };
  psd: ImageProcessorFit & { on: boolean };
  tiff: ImageProcessorFit & { on: boolean; lzw: boolean };
  png: ImageProcessorFit & { on: boolean };
  webp: ImageProcessorFit & { on: boolean; quality: number };
  tga: ImageProcessorFit & { on: boolean; option: string };
  dpx: ImageProcessorFit & { on: boolean; bits: 8 | 10 | 12 | 16 };
  action: Action | null;
  copyright: string;
  out?: FileSystemDirectoryHandle | null;
}

export const TGA_TYPES: ReadonlyArray<readonly [string, string]> = [['32rle', '32-bit, run-length'], ['32', '32-bit with alpha'], ['24rle', '24-bit, run-length, on white'], ['24', '24-bit, on white']];

const box = (checked = false): HTMLInputElement => el<HTMLInputElement>(`<input type="checkbox"${checked ? ' checked' : ''}>`);
const num = (value: string, min: number, max: number): HTMLInputElement => el<HTMLInputElement>(`<input class="cv-input" type="number" min="${min}" max="${max}" step="1" value="${value}">`);
const heading = (text: string): HTMLElement => el(`<p class="cv-note"><strong>${text}</strong></p>`);

const IMAGE_EXTS = IMAGE_ACCEPT.split(',').filter((t) => t.startsWith('.'));
/** The pictures in a chosen folder: only those directly in it, or those in every folder below it too. */
export function folderImages(all: File[], subfolders: boolean): File[] {
  return all.filter((f) => {
    const depth = (f.webkitRelativePath || f.name).split('/').length - 2, dot = f.name.lastIndexOf('.');
    return (subfolders || depth <= 0) && dot > 0 && IMAGE_EXTS.includes(f.name.slice(dot).toLowerCase());
  });
}
export const folderInput = (): HTMLInputElement => { const i = el<HTMLInputElement>('<input type="file" multiple hidden>'); i.setAttribute('webkitdirectory', ''); return i; };

/** A Choose output folder button and the name of the folder chosen; the row is hidden where the browser has no folder picker,
 *  and the results then download as one zip. */
export class OutFolderRow {
  readonly el = el('<div class="cv-welcome-actions"><button class="cv-btn" type="button">Choose output folder...</button><span class="cv-note"></span></div>');
  handle: FileSystemDirectoryHandle | null = null;
  private readonly note = q(this.el, '.cv-note');

  constructor() {
    setHidden(this.el, !outFolderAvailable());
    q(this.el, 'button').addEventListener('click', () => void this.choose());
    this.reset();
  }

  private async choose(): Promise<void> {
    const h = await pickOutFolder();
    if (!h) return;
    this.handle = h;
    setText(this.note, `Writing into ${h.name}.`);
  }

  reset(): void { this.handle = null; setText(this.note, 'No folder chosen: the results download as one zip.'); }
}

/** The Image Processor: one source, one destination, three file types and an optional action and copyright. */
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
  private readonly pngOn = box();
  private readonly pngFit = box();
  private readonly pngW = num('', 1, 30000);
  private readonly pngH = num('', 1, 30000);
  private readonly webpOn = box();
  private readonly webpQuality = num('85', 1, 100);
  private readonly webpFit = box();
  private readonly webpW = num('', 1, 30000);
  private readonly webpH = num('', 1, 30000);
  private readonly tgaOn = box();
  private readonly tgaType = el<HTMLSelectElement>(`<select class="cv-input">${TGA_TYPES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`);
  private readonly tgaFit = box();
  private readonly tgaW = num('', 1, 30000);
  private readonly tgaH = num('', 1, 30000);
  private readonly dpxOn = box();
  private readonly dpxBits = el<HTMLSelectElement>('<select class="cv-input"><option value="10">10-bit</option><option value="8">8-bit</option><option value="12">12-bit</option><option value="16">16-bit</option></select>');
  private readonly dpxFit = box();
  private readonly dpxW = num('', 1, 30000);
  private readonly dpxH = num('', 1, 30000);
  private readonly outRow = new OutFolderRow();
  private readonly runAction = box();
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"></select>');
  private readonly copyright = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Copyright Info" spellcheck="false">');
  private files: File[] = [];
  private readonly folder = folderInput();
  private readonly subfolders = box();
  private inFolder: File[] = [];

  constructor(private readonly store: Actions, private readonly run: (o: ImageProcessorOptions) => Promise<void>) {
    super('Image Processor', 480);
    this.body.appendChild(heading('1. Select the images to process'));
    const row = el('<div class="cv-welcome-actions"></div>'), choose = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose images...</button>'), chooseDir = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose folder...</button>');
    choose.addEventListener('click', () => this.file.click());
    chooseDir.addEventListener('click', () => this.folder.click());
    row.append(choose, chooseDir);
    this.body.append(row, this.chosen, this.file, this.folder);
    this.field('Include All Sub-folders', this.subfolders);
    this.folder.addEventListener('change', () => { this.inFolder = [...(this.folder.files ?? [])]; this.folder.value = ''; this.files = folderImages(this.inFolder, this.subfolders.checked); this.sync(); });
    this.subfolders.addEventListener('change', () => { if (this.inFolder.length) { this.files = folderImages(this.inFolder, this.subfolders.checked); this.sync(); } });
    this.field('Use Open Images', this.useOpen);
    this.body.appendChild(heading('2. Select the destination'));
    this.body.appendChild(el('<p class="cv-note">Each type goes into its own folder (JPEG, PSD, TIFF, PNG, WebP, TGA, DPX). In the browser the results go into the folder you choose, or download as one zip; in the desktop app they are written to a named folder in the exports folder.</p>'));
    this.body.appendChild(this.outRow.el);
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
    this.field('Save as PNG', this.pngOn);
    this.field('Resize to Fit', this.pngFit);
    this.field('W (px)', this.pngW);
    this.field('H (px)', this.pngH);
    this.field('Save as WebP', this.webpOn);
    this.field('Quality (1 to 100)', this.webpQuality);
    this.field('Resize to Fit', this.webpFit);
    this.field('W (px)', this.webpW);
    this.field('H (px)', this.webpH);
    this.field('Save as TGA', this.tgaOn);
    this.field('TGA type', this.tgaType);
    this.field('Resize to Fit', this.tgaFit);
    this.field('W (px)', this.tgaW);
    this.field('H (px)', this.tgaH);
    this.field('Save as DPX', this.dpxOn);
    this.field('DPX bit depth', this.dpxBits);
    this.field('Resize to Fit', this.dpxFit);
    this.field('W (px)', this.dpxW);
    this.field('H (px)', this.dpxH);
    this.body.appendChild(heading('4. Preferences'));
    this.field('Run Action', this.runAction);
    this.field('Action', this.pick);
    this.field('Copyright Info', this.copyright);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Run', 'primary', () => void this.go());
    this.file.addEventListener('change', () => { this.files = [...(this.file.files ?? [])]; this.inFolder = []; this.file.value = ''; this.sync(); });
    this.remember([this.pick]);   // every setting; the action is chosen from the list as it stands
  }

  show(): void { this.files = []; this.inFolder = []; this.outRow.reset(); this.sync(); this.open(); }

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
      png: { ...fit(this.pngFit, this.pngW, this.pngH), on: this.pngOn.checked },
      webp: { ...fit(this.webpFit, this.webpW, this.webpH), on: this.webpOn.checked, quality: Math.min(100, Math.max(1, Math.round(Number(this.webpQuality.value) || 85))) },
      tga: { ...fit(this.tgaFit, this.tgaW, this.tgaH), on: this.tgaOn.checked, option: this.tgaType.value },
      dpx: { ...fit(this.dpxFit, this.dpxW, this.dpxH), on: this.dpxOn.checked, bits: ([8, 10, 12, 16] as const).find((b) => b === Number(this.dpxBits.value)) ?? 10 },
      action: this.runAction.checked ? this.store.list[Number(this.pick.value)] ?? null : null,
      copyright: this.copyright.value.trim(),
      out: this.outRow.handle,
    };
    if (!o.useOpen && !o.files.length) { setText(this.chosen, 'Choose images, or tick Use Open Images.'); return; }
    if (!o.jpeg.on && !o.psd.on && !o.tiff.on && !o.png.on && !o.webp.on && !o.tga.on && !o.dpx.on) { setText(this.chosen, 'Tick at least one file type.'); return; }
    if (this.runAction.checked && !o.action) { setText(this.chosen, 'Record an action first.'); return; }
    this.close();
    await this.run(o);
  }
}

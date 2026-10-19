import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** What File > Open As can force: the name each picture is read under, by extension. */
export const OPEN_AS_FORMATS: ReadonlyArray<readonly [string, string]> = [
  ['png', 'PNG'], ['jpg', 'JPEG'], ['gif', 'GIF'], ['webp', 'WebP'], ['bmp', 'BMP'], ['avif', 'AVIF'], ['tif', 'TIFF'], ['tga', 'Targa'], ['qoi', 'QOI'],
  ['ico', 'Icon'], ['ppm', 'Portable Pixmap'], ['dpx', 'DPX'], ['cin', 'Cineon'], ['wbmp', 'WBMP'], ['dds', 'DDS'], ['exr', 'OpenEXR'], ['hdr', 'Radiance HDR'],
  ['psd', 'PSD'], ['psb', 'PSB'], ['svg', 'SVG'],
];

/** The file renamed so its name ends in the forced format's extension; the bytes are untouched. */
export function asFormat(file: File, ext: string): File {
  const base = file.name.replace(/\.[^.]+$/, '') || 'Picture';
  return new File([file], `${base}.${ext}`, { type: '' });
}

/** File > Open As: a file read as the format chosen here, whatever its name or extension says. */
export class OpenAsDialog extends Dialog {
  private readonly pick = el<HTMLInputElement>('<input type="file" data-role="open-as-file" hidden>');
  private readonly format = el<HTMLSelectElement>(`<select class="cv-input" aria-label="Open as" data-role="open-as-format">${OPEN_AS_FORMATS.map(([e, n]) => `<option value="${e}">${n}</option>`).join('')}</select>`);
  private readonly name = el('<span class="cv-note">No file chosen</span>');
  private readonly go: HTMLButtonElement;
  private file: File | null = null;

  constructor(private readonly onOpen: (file: File) => Promise<void>) {
    super('Open As', 420);
    const choose = el<HTMLButtonElement>('<button class="cv-btn" type="button">Choose File...</button>');
    const fileRow = el('<div class="cv-dialog-row"></div>'); fileRow.append(choose, this.name);
    const formatRow = el('<label class="cv-dialog-row"><span>Open as</span></label>'); formatRow.append(this.format);
    this.body.append(this.pick, fileRow, formatRow);
    choose.addEventListener('click', () => this.pick.click());
    this.pick.addEventListener('change', () => { this.file = this.pick.files?.[0] ?? null; setText(this.name, this.file ? this.file.name : 'No file chosen'); this.go.disabled = !this.file; });
    this.button('Cancel', 'ghost', () => this.close());
    this.go = this.button('Open', 'primary', () => { const f = this.file; if (!f) return; this.close(); void this.onOpen(asFormat(f, this.format.value)); });
    this.go.disabled = true;
  }

  show(format?: string): void {
    this.file = null;
    this.pick.value = '';
    setText(this.name, 'No file chosen');
    this.go.disabled = true;
    if (format && OPEN_AS_FORMATS.some(([e]) => e === format)) this.format.value = format;
    this.open();
  }
}

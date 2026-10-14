import { api, type RawWhiteBalance } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { selectRow, sliderRow } from './controls';

/** What the person chose in Camera Raw: the white balance applied at the RAW stage and the bit depth to open at. */
export type RawChoice = { wb: RawWhiteBalance; bits: 8 | 16 };

/** Camera Raw on open (DEV_PLAN 36.21): a camera RAW file opens here first, as Photoshop opens it into Camera Raw. The
 *  preview is the engine's half-size decode with the white balance set (rawpy's user_wb multipliers), so it is fast;
 *  Open resolves with the choice and the app does the full decode, Cancel (or closing) resolves null and the file is
 *  not opened. The rest of Develop (curve, colour mixer, grading, optics, geometry) follows on the opened layer. */
export class CameraRawDialog extends Dialog {
  private readonly canvas = el<HTMLCanvasElement>('<canvas class="cv-raw-preview" aria-label="Preview"></canvas>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly preset = selectRow('White Balance', [['as_shot', 'As Shot'], ['auto', 'Auto'], ['daylight', 'Daylight']], (v) => { this.wb.wb = v as RawWhiteBalance['wb']; this.schedule(); });
  private readonly temperature = sliderRow('Temperature', -100, 100, 1, (v) => { this.wb.temperature = v; this.schedule(); });
  private readonly tint = sliderRow('Tint', -100, 100, 1, (v) => { this.wb.tint = v; this.schedule(); });
  private readonly depth = selectRow('Depth', [['8', '8 Bits/Channel'], ['16', '16 Bits/Channel']], (v) => { this.bits = v === '16' ? 16 : 8; });
  private readonly wb: RawWhiteBalance = { wb: 'as_shot', temperature: 0, tint: 0 };
  private bits: 8 | 16 = 8;
  private file: File | null = null;
  private timer = 0;
  private seq = 0;
  private settle: ((choice: RawChoice | null) => void) | null = null;

  constructor() {
    super('Camera Raw', 460);
    this.body.append(this.canvas, this.preset.el, this.temperature.el, this.tint.el, this.depth.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Open', 'primary', () => this.finish({ wb: { ...this.wb }, bits: this.bits }));
    this.onClose = () => { window.clearTimeout(this.timer); this.seq++; this.finish(null); };
  }

  /** Opens the panel on `file`; resolves with the choice on Open and null on Cancel. */
  ask(file: File): Promise<RawChoice | null> {
    return new Promise((resolve) => {
      if (this.isOpen) { resolve(null); return; }
      this.file = file;
      this.settle = resolve;
      this.wb.wb = 'as_shot'; this.wb.temperature = 0; this.wb.tint = 0; this.bits = 8;
      this.preset.set('as_shot'); this.temperature.set(0); this.tint.set(0); this.depth.set('8');
      setText(this.note, `${file.name}: preview at half size; Open develops the whole picture.`);
      this.open();
      this.schedule(0);
    });
  }

  private finish(choice: RawChoice | null): void {
    const settle = this.settle;
    this.settle = null;
    if (!settle) return;
    settle(choice);
    if (this.isOpen) this.close();   // onClose then finds nothing waiting
  }

  private schedule(delay = 180): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.preview(), delay);
  }

  /** The half-size decode with the current white balance, drawn into the same canvas (never replaced). */
  private async preview(): Promise<void> {
    const f = this.file, n = ++this.seq;
    if (!f || !this.isOpen) return;
    try {
      const bmp = await createImageBitmap(await api.decode(f, f.name, 0, undefined, { ...this.wb, half: true }));
      if (n !== this.seq || !this.isOpen) { bmp.close(); return; }
      if (this.canvas.width !== bmp.width) this.canvas.width = bmp.width;
      if (this.canvas.height !== bmp.height) this.canvas.height = bmp.height;
      this.canvas.style.width = '100%';
      this.canvas.style.height = 'auto';
      this.canvas.getContext('2d')?.drawImage(bmp, 0, 0);
      bmp.close();
    } catch (err) {
      if (n === this.seq) setText(this.note, err instanceof Error ? err.message : 'The preview could not be developed.');
    }
  }
}

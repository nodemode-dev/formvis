import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { sliderRow } from './controls';

const KEY = 'sonny.jpegQuality';
const BOX_W = 432, BOX_H = 280;

const size = (bytes: number): string => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** the JPEG export sheet: Quality starts from the last export (85% the first time), with the image's
 *  size and an encoded preview fitted to the sheet; Export hands the chosen quality back. The preview canvas keeps
 *  one size so the sheet never shifts, and the preview is decoded from the encoded JPEG itself. */
export class JpegDialog extends Dialog {
  private value = 0.85;
  private run: ((quality: number) => void) | null = null;
  private timer = 0;
  private token = 0;
  private readonly quality = sliderRow('Quality (%)', 0, 100, 1, (v) => { this.value = v / 100; this.schedule(); });
  private readonly info = el('<p class="cv-note"></p>');
  private readonly preview = el<HTMLCanvasElement>(`<canvas class="cv-jpeg-preview" width="${BOX_W}" height="${BOX_H}" aria-label="Encoded JPEG preview"></canvas>`);
  private readonly status = el('<p class="cv-note"></p>');

  constructor(private readonly engine: Engine) {
    super('Export JPEG', 480);
    this.body.append(this.quality.el, this.info, this.preview, this.status);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Export...', 'primary', () => this.export());
  }

  show(run: (quality: number) => void): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    this.run = run;
    let raw: string | null = null;
    try { raw = localStorage.getItem(KEY); } catch { raw = null; }
    const saved = raw === null ? NaN : Number(raw);
    this.value = Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 0.85;
    this.quality.set(Math.round(this.value * 100));
    setText(this.info, `${p.doc.width} \u00d7 ${p.doc.height} px · sRGB`);
    this.preview.getContext('2d')?.clearRect(0, 0, BOX_W, BOX_H);
    this.open();
    this.schedule();
  }

  close(): void {
    window.clearTimeout(this.timer);
    this.token += 1;
    super.close();
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    setText(this.status, 'Updating preview...');
    const token = ++this.token;
    this.timer = window.setTimeout(() => { void this.encode(token); }, 120);
  }

  private async encode(token: number): Promise<void> {
    const blob = await this.engine.exportBlob('image/jpeg', this.value);
    if (token !== this.token || !blob) return;
    const bmp = await createImageBitmap(blob);
    if (token !== this.token) { bmp.close(); return; }
    const s = Math.min(1, BOX_W / bmp.width, BOX_H / bmp.height);
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const c = this.preview.getContext('2d');
    if (c) {
      c.clearRect(0, 0, BOX_W, BOX_H);
      c.imageSmoothingQuality = 'high';
      c.drawImage(bmp, Math.round((BOX_W - w) / 2), Math.round((BOX_H - h) / 2), w, h);
    }
    bmp.close();
    setText(this.status, `Encoded preview, fitted to the sheet · ${size(blob.size)}`);
  }

  private export(): void {
    const run = this.run;
    try { localStorage.setItem(KEY, String(this.value)); } catch { /* storage can be unavailable; the next export starts from 85% */ }
    this.close();
    run?.(this.value);
  }
}

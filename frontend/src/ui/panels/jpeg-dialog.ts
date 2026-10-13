import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { sliderRow } from './controls';

const KEY = 'formvis.jpegQuality';
const BOX_W = 432, BOX_H = 280;

const size = (bytes: number): string => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** The JPEG export sheet. Quality starts from the last export (85 percent the first time) and the sheet shows the
 *  image's size. Below it sits a preview that was really encoded as a JPEG and decoded again, fitted into a canvas
 *  of fixed size so the sheet never changes shape. Export hands the chosen quality to the caller. */
export class JpegDialog extends Dialog {
  private value = 0.85;
  private run: ((quality: number) => void) | null = null;
  private timer = 0;
  private token = 0;
  private readonly quality = sliderRow('Quality (%)', 0, 100, 1, (v) => { this.value = v / 100; this.schedule(); });
  private readonly info = el<HTMLElement>('<p class="cv-note"></p>');
  private readonly status = el<HTMLElement>('<p class="cv-note"></p>');
  private readonly preview = el<HTMLCanvasElement>(`<canvas class="cv-jpeg-preview" width="${BOX_W}" height="${BOX_H}" aria-label="Encoded JPEG preview"></canvas>`);

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
    let stored = NaN;
    try { stored = parseFloat(localStorage.getItem(KEY) ?? ''); } catch { /* storage unavailable */ }
    this.value = Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0.85;
    this.quality.set(Math.round(this.value * 100));
    setText(this.info, `${p.doc.width} × ${p.doc.height} px · sRGB`);
    this.preview.getContext('2d')?.clearRect(0, 0, BOX_W, BOX_H);
    this.open();
    this.schedule();
  }

  close(): void {
    window.clearTimeout(this.timer);
    this.token++;
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
    const ctx = this.preview.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, BOX_W, BOX_H);
      const k = Math.min(1, BOX_W / bmp.width, BOX_H / bmp.height);
      const w = bmp.width * k, h = bmp.height * k;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, (BOX_W - w) / 2, (BOX_H - h) / 2, w, h);
    }
    bmp.close();
    setText(this.status, 'Encoded preview, fitted to the sheet · ' + size(blob.size));
  }

  private export(): void {
    try { localStorage.setItem(KEY, String(this.value)); } catch { /* ignore */ }
    this.close();
    const run = this.run;
    if (run) run(this.value);
  }
}

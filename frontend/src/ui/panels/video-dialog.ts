import { Raster, type Engine } from '../../engine';
import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** File > Import > Video Frames to Layers (1.58.9, the parity plan's L1), as Photoshop's: choose a clip, trim it to a
 *  range (From and To, in seconds) and keep every Nth frame if wished; the engine's ffmpeg decodes the frames (300 at
 *  most), each becomes a layer of a new document, and Make Frame Animation sets the Timeline to show them in turn at
 *  the clip's own speed. Rows are built once. */
export class VideoImportDialog extends Dialog {
  private file: File | null = null;
  private info: { width: number; height: number; fps: number; duration: number; frames: number } | null = null;
  private readonly input = el('<input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi" style="display: none">') as HTMLInputElement;
  private readonly about = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly from = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" step="0.1" value="0" aria-label="From, in seconds">');
  private readonly to = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" step="0.1" value="0" aria-label="To, in seconds">');
  private readonly every = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="100" step="1" value="1" aria-label="Every Nth frame">');
  private readonly animate = el<HTMLInputElement>('<input type="checkbox" checked aria-label="Make Frame Animation">');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');

  constructor(private readonly engine: Engine) {
    super('Video Frames to Layers', 420);
    const choose = el('<button class="cv-btn" type="button">Choose a video...</button>') as HTMLButtonElement;
    choose.addEventListener('click', () => this.input.click());
    this.input.addEventListener('change', () => void this.picked());
    const row = (label: string, control: HTMLElement): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(control); return r; };
    for (const n of [this.from, this.to, this.every]) n.addEventListener('input', () => this.describe());
    this.body.append(choose, this.input, this.about, row('From (seconds)', this.from), row('To (seconds)', this.to), row('Every Nth frame', this.every), row('Make Frame Animation', this.animate), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
    this.remember([this.from, this.to]);   // the range belongs to the clip chosen
  }

  show(): void { this.file = null; this.info = null; this.input.value = ''; setText(this.about, 'No video chosen yet.'); setText(this.note, ''); this.open(); }

  private async picked(): Promise<void> {
    this.file = this.input.files?.[0] ?? null;
    if (!this.file) return;
    setText(this.about, 'Reading the video...');
    try {
      this.info = await api.videoProbe(this.file);
      this.from.value = '0'; this.to.value = String(this.info.duration); this.every.value = '1';
      this.describe();
    } catch (err) { this.info = null; setText(this.about, err instanceof Error ? err.message : 'That video could not be read.'); }
  }

  /** The clip and what the range takes from it. */
  private describe(): void {
    const i = this.info;
    if (!i || !this.file) return;
    const a = Math.max(0, Number(this.from.value) || 0), b = Math.min(i.duration, Number(this.to.value) || i.duration), n = Math.max(1, Math.round(Number(this.every.value) || 1));
    const count = Math.max(0, Math.ceil(((b - a) * i.fps) / n));
    setText(this.about, `${this.file.name}: ${i.width} by ${i.height}, ${i.fps.toFixed(2).replace(/\.?0+$/, '')} frames a second, ${i.duration.toFixed(1)} seconds. The range takes ${count} frame${count === 1 ? '' : 's'}${count > 300 ? '; only the first 300 are kept' : ''}.`);
  }

  private async apply(): Promise<void> {
    const file = this.file, i = this.info;
    if (!file || !i) { setText(this.note, 'Choose a video first.'); return; }
    const a = Math.max(0, Number(this.from.value) || 0), b = Math.min(i.duration, Number(this.to.value) || i.duration), n = Math.max(1, Math.round(Number(this.every.value) || 1));
    if (b <= a) { setText(this.note, 'To must be later than From.'); return; }
    setText(this.note, 'Reading the frames...');
    try {
      const r = await api.videoFrames(file, a, b >= i.duration ? 0 : b, n);
      const rasters: Raster[] = [];
      for (const blob of r.frames) {
        const bmp = await createImageBitmap(blob), ras = new Raster(bmp.width, bmp.height);
        ras.ctx.drawImage(bmp, 0, 0); bmp.close(); ras.touch(); rasters.push(ras);
      }
      this.close();
      this.engine.openFrames(file.name.replace(/\.[^.]+$/, ''), r.width, r.height, rasters, r.delayMs, this.animate.checked);
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The frames could not be read.'); }
  }
}

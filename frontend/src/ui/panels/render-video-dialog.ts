import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

export interface RenderChoice { format: 'mp4' | 'gif' | 'png' | 'jpg' | 'webp'; from: number; to: number; scale: number }

/** File > Export > Render Video (1.59.6, DEV_PLAN 25.4): the video timeline
 *  rendered as an H.264 MP4, a GIF or a picture sequence (numbered PNGs in a zip); every frame or a range (From and
 *  To, frames counted from 0, To excluded); at the document's size, half, or a quarter. Rows built once. */
export class RenderVideoDialog extends Dialog {
  private readonly format = el<HTMLSelectElement>('<select class="cv-input" aria-label="Format"><option value="mp4">H.264 video (MP4)</option><option value="gif">Animated GIF</option><option value="png">PNG sequence (zip)</option><option value="jpg">JPEG sequence (zip)</option><option value="webp">WebP sequence (zip)</option></select>');
  private readonly range = el<HTMLSelectElement>('<select class="cv-input" aria-label="Range"><option value="all">All frames</option><option value="work">The work area</option><option value="custom">Frames from and to</option></select>');
  private readonly from = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" step="1" aria-label="From frame">');
  private readonly to = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" step="1" aria-label="To frame">');
  private readonly size = el<HTMLSelectElement>('<select class="cv-input" aria-label="Size"><option value="1">Document size</option><option value="0.5">Half</option><option value="0.25">Quarter</option></select>');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly rows: HTMLElement;

  constructor(private readonly engine: Engine, private readonly run: (c: RenderChoice) => Promise<void>) {
    super('Render Video', 420);
    const row = (label: string, control: HTMLElement): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(control); return r; };
    this.rows = el('<div></div>');
    this.rows.append(row('From frame', this.from), row('To frame', this.to));
    for (const n of [this.format, this.range, this.from, this.to, this.size]) n.addEventListener('input', () => this.describe());
    this.body.append(row('Format', this.format), row('Range', this.range), this.rows, row('Size', this.size), this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Render', 'primary', () => void this.apply());
    this.remember([this.from, this.to]);   // the frame numbers belong to this video
  }

  show(): void {
    const vt = this.engine.video;
    if (!vt) { this.engine.notice('Create a video timeline first.'); return; }
    this.from.value = '0'; this.to.value = String(vt.duration);
    this.describe();
    this.open();
  }

  private choice(): RenderChoice | null {
    const vt = this.engine.video;
    if (!vt) return null;
    const r = this.range.value;
    const from = r === 'all' ? 0 : r === 'work' ? vt.workIn : Math.max(0, Math.min(vt.duration - 1, Math.round(Number(this.from.value) || 0)));
    const to = r === 'all' ? vt.duration : r === 'work' ? vt.workOut : Math.max(from + 1, Math.min(vt.duration, Math.round(Number(this.to.value) || vt.duration)));
    return { format: this.format.value as RenderChoice['format'], from, to, scale: Number(this.size.value) || 1 };
  }

  private describe(): void {
    const c = this.choice(), vt = this.engine.video, p = this.engine.current;
    this.rows.style.visibility = this.range.value === 'custom' ? 'visible' : 'hidden';
    if (!c || !vt || !p) return;
    const n = c.to - c.from, w = Math.max(1, Math.round(p.doc.width * c.scale)), h = Math.max(1, Math.round(p.doc.height * c.scale));
    setText(this.note, `${n} frame${n === 1 ? '' : 's'} (${(n / vt.fps).toFixed(2)} seconds at ${vt.fps} a second), ${w} by ${h}.`);
  }

  private async apply(): Promise<void> {
    const c = this.choice();
    if (!c) return;
    setText(this.note, 'Rendering...');
    try { await this.run(c); this.close(); } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The video could not be rendered.'); }
  }
}

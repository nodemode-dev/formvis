import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** File > Export GIF: the size to export at, since GIFs of large canvases grow heavy; the frames and their delays come
 *  from the Timeline, or the image as it stands when there are none. */
export class GifDialog extends Dialog {
  private readonly size = el<HTMLSelectElement>('<select class="cv-input"><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="0.25">25%</option></select>');
  private readonly note = el('<p class="cv-note"></p>');

  constructor(private readonly engine: Engine, private readonly run: (scale: number) => Promise<void>) {
    super('Export GIF', 380);
    this.field('Size', this.size);
    this.body.appendChild(this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Export', 'primary', () => { const k = Number(this.size.value) || 1; this.close(); void this.run(k); });
    this.size.addEventListener('change', () => this.describe());
  }

  show(): void {
    if (!this.engine.current) return;
    this.describe();
    this.open();
  }

  private describe(): void {
    const p = this.engine.current, n = this.engine.timeline.frames.length, k = Number(this.size.value) || 1;
    if (!p) return;
    const w = Math.max(1, Math.round(p.doc.width * k)), h = Math.max(1, Math.round(p.doc.height * k));
    setText(this.note, `${w} x ${h} px, ${n > 1 ? `${n} frames from the Timeline` : 'one frame, the image as it stands'}. GIFs hold up to 256 colours per frame.`);
  }
}

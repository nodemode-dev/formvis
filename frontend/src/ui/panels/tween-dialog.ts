import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** Timeline > Tween: frames filled in between the selected frame and the next, stepping layer position and opacity. */
export class TweenDialog extends Dialog {
  private readonly count = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="50" step="1" value="5">');
  private readonly position = el<HTMLInputElement>('<input type="checkbox" checked>');
  private readonly opacity = el<HTMLInputElement>('<input type="checkbox" checked>');
  private readonly note = el('<p class="cv-note"></p>');

  constructor(private readonly engine: Engine) {
    super('Tween', 380);
    this.field('Frames to add', this.count);
    this.field('Position', this.position);
    this.field('Opacity', this.opacity);
    this.body.appendChild(this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    const t = this.engine.timeline, i = t.frames.findIndex((f) => f.id === t.current);
    if (i < 0 || i + 1 >= t.frames.length) { this.engine.notice('Select a frame with another after it to tween towards.'); return; }
    setText(this.note, `From frame ${i + 1} to frame ${i + 2}. A layer shown in only one of them fades in or out.`);
    this.open();
  }

  private apply(): void {
    const t = this.engine.timeline, n = Math.min(50, Math.max(1, Math.round(Number(this.count.value) || 1)));
    this.close();
    if (t.current) this.engine.tween(t.current, n, { position: this.position.checked, opacity: this.opacity.checked });
  }
}

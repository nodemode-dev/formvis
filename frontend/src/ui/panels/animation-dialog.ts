import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** Plays the timeline: every frame rendered once at a size that fits, then shown for its delay, repeating as the
 *  timeline says. A frame with no delay shows for a tenth of a second, as browsers show GIFs. */
export class AnimationDialog extends Dialog {
  private readonly view = el<HTMLCanvasElement>('<canvas class="cv-anim-view"></canvas>');
  private readonly note = el('<p class="cv-note"></p>');
  private shots: Array<{ image: HTMLCanvasElement; delay: number }> = [];
  private timer = 0;
  private index = 0;
  private rounds = 0;

  constructor(private readonly engine: Engine) {
    super('Animation', 540);
    const wrap = el('<div class="cv-anim-wrap"></div>');
    wrap.appendChild(this.view);
    this.body.append(wrap, this.note);
    this.button('Close', 'primary', () => this.close());
    this.onClose = () => { window.clearTimeout(this.timer); this.shots = []; };
  }

  /** The frame on show and how many times the animation has run through, for checks. */
  get position(): { index: number; rounds: number } { return { index: this.index, rounds: this.rounds }; }

  show(): void {
    const p = this.engine.current, t = this.engine.timeline;
    if (!p || t.frames.length < 2) { this.engine.notice('Make at least two frames in the Timeline first.'); return; }
    const k = Math.min(1, 480 / p.doc.width, 360 / p.doc.height), w = Math.max(1, Math.round(p.doc.width * k)), h = Math.max(1, Math.round(p.doc.height * k));
    this.view.width = w;
    this.view.height = h;
    this.shots = t.frames.map((f) => {
      const s = this.engine.renderFrame(f), c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      g.imageSmoothingQuality = 'high';
      if (s) g.drawImage(s as CanvasImageSource, 0, 0, w, h);
      return { image: c, delay: f.delay };
    });
    this.index = 0;
    this.rounds = 0;
    setText(this.note, `${t.frames.length} frames, ${t.loops === 0 ? 'repeating forever' : t.loops === 1 ? 'playing once' : `playing ${t.loops} times`}. File > Export GIF saves it.`);
    this.open();
    this.step(t.loops);
  }

  private step(loops: number): void {
    const shot = this.shots[this.index];
    if (!shot) return;
    const g = this.view.getContext('2d') as CanvasRenderingContext2D;
    g.clearRect(0, 0, this.view.width, this.view.height);
    g.drawImage(shot.image, 0, 0);
    const last = this.index === this.shots.length - 1;
    if (last) { this.rounds += 1; if (loops > 0 && this.rounds >= loops) return; }
    this.index = last ? 0 : this.index + 1;
    this.timer = window.setTimeout(() => this.step(loops), shot.delay > 0 ? shot.delay : 100);
  }
}

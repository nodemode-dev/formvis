import type { Engine } from '../../engine';
import { harmonize, skinSmooth } from '../../engine/neural';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { selectRow, sliderRow } from './controls';

type NeuralKind = 'harmonize' | 'skinSmooth';
export const NEURAL_LABELS: Record<NeuralKind, string> = { harmonize: 'Harmonize', skinSmooth: 'Skin Smoothing' };

/** Filter > Neural Filters (1.54.7, DEV_PLAN 23.2): a gallery of filters that run here, the first two without any
 *  model. Each filter's rows exist once and show for the chosen filter; the preview follows every change; OK is one
 *  step. Filters that need a model join this list as their pinned weights and licences land. */
export class NeuralFiltersDialog extends Dialog {
  private kind: NeuralKind = 'harmonize';
  private readonly s = { amount: 100, smooth: 60, radius: 6 };
  private readonly note = el('<p class="cv-dialog-note" role="status"></p>');
  private readonly rows: Array<{ el: HTMLElement; kinds: NeuralKind[] }> = [];
  private backdrop: ImageData | null = null;
  private timer = 0;

  constructor(private readonly engine: Engine) {
    super('Neural Filters', 400);
    const pick = selectRow('Filter', (Object.keys(NEURAL_LABELS) as NeuralKind[]).map((k) => [k, NEURAL_LABELS[k]] as const), (v) => { this.kind = v as NeuralKind; this.showRows(); this.schedule(); });
    this.body.append(pick.el);
    const amount = sliderRow('Amount (%)', 0, 100, 1, (v) => { this.s.amount = v; this.schedule(); });
    const smooth = sliderRow('Smoothness (%)', 0, 100, 1, (v) => { this.s.smooth = v; this.schedule(); });
    const radius = sliderRow('Radius (px)', 1, 30, 1, (v) => { this.s.radius = v; this.schedule(); });
    this.rows.push({ el: amount.el, kinds: ['harmonize'] }, { el: smooth.el, kinds: ['skinSmooth'] }, { el: radius.el, kinds: ['skinSmooth'] });
    this.body.append(amount.el, smooth.el, radius.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { window.clearTimeout(this.timer); this.engine.setPreview(null); this.backdrop = null; };
    this.showRows();
  }

  show(kind: NeuralKind = this.kind): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (!p || !l?.raster || l.isGroup || l.adjustment) { this.engine.notice('Select a pixel layer first.'); return; }
    this.kind = kind;
    this.backdrop = this.engine.compositeBelow(l.id);
    this.showRows();
    this.open();
    this.schedule();
  }

  private showRows(): void {
    for (const r of this.rows) r.el.style.visibility = r.kinds.includes(this.kind) ? '' : 'hidden';
    setText(this.note, this.kind === 'harmonize' ? 'Harmonize moves the layer\'s light and colour toward what lies beneath it (its mean and spread per channel), by the amount.' : 'Skin Smoothing softens skin tones only: other pixels are untouched.');
  }

  private run(): (src: ImageData) => ImageData {
    const s = { ...this.s }, back = this.backdrop;
    return this.kind === 'harmonize' ? (src) => (back ? harmonize(src, back, s.amount / 100) : src) : (src) => skinSmooth(src, s.smooth / 100, s.radius);
  }

  private schedule(): void {
    if (!this.isOpen) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.engine.previewImageEdit(this.run()), 60);
  }

  private apply(): void {
    window.clearTimeout(this.timer);
    const run = this.run(), kind = this.kind;
    this.close();
    this.engine.applyImageEdit(NEURAL_LABELS[kind], run);
  }
}

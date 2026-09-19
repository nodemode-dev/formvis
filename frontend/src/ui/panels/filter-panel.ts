import { addNoise, gaussianBlur, gaussianMargin, lensDistort, motionBlur, motionMargin, randomSeed, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction' };

export class FilterPanel extends Dialog {
  private kind: FilterKind = 'gaussianBlur';
  private readonly s = { radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0 };
  private seed = 0;
  private preview = true;
  private done = false;
  private timer = 0;
  private readonly sections = new Map<FilterKind, { node: HTMLElement; sync: () => void }>();
  private readonly previewRow: Row<boolean>;
  private readonly okBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine) {
    super('Filter', 440);
    const s = this.s;
    const radius = sliderRow('Radius (px)', 0.1, 100, 0.1, (v) => { s.radius = v; this.schedule(); }, { max: 250 });
    this.section('gaussianBlur', [radius.el], () => radius.set(s.radius));
    const angle = sliderRow('Angle (\u00b0)', -90, 90, 1, (v) => { s.angle = v; this.schedule(); });
    const distance = sliderRow('Distance (px)', 1, 500, 1, (v) => { s.distance = v; this.schedule(); }, { max: 2000 });
    this.section('motionBlur', [angle.el, distance.el], () => { angle.set(s.angle); distance.set(s.distance); });
    const amount = sliderRow('Amount (%)', 0.1, 400, 0.1, (v) => { s.amount = v; this.schedule(); });
    const distribution = selectRow('Distribution', [['uniform', 'Uniform'], ['gaussian', 'Gaussian']], (v) => { s.gaussian = v === 'gaussian'; this.schedule(); });
    const mono = checkRow('Monochromatic', (v) => { s.monochromatic = v; this.schedule(); });
    this.section('addNoise', [amount.el, distribution.el, mono.el], () => { amount.set(s.amount); distribution.set(s.gaussian ? 'gaussian' : 'uniform'); mono.set(s.monochromatic); });
    const distortion = sliderRow('Distortion', -100, 100, 1, (v) => { s.distortion = v; this.schedule(); });
    this.section('lensCorrection', [distortion.el, el('<p class="cv-note">Positive values correct barrel distortion, negative values pincushion.</p>')], () => distortion.set(s.distortion));
    this.previewRow = checkRow('Preview', (v) => { this.preview = v; this.schedule(0); });
    this.body.appendChild(this.previewRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => this.commit());
    this.onClose = () => this.abandon();
  }

  private section(kind: FilterKind, nodes: HTMLElement[], sync: () => void): void {
    const node = el('<div class="cv-panel-section" hidden></div>');
    node.append(...nodes);
    this.body.appendChild(node);
    this.sections.set(kind, { node, sync });
  }

  show(kind: FilterKind): void {
    if (this.isOpen) return;
    if (!this.engine.targetImage()) { toast('Select a layer with pixels first.'); return; }
    this.kind = kind;
    this.done = false;
    this.seed = randomSeed();
    this.setTitle(FILTER_LABELS[kind]);
    for (const [k, sec] of this.sections) setHidden(sec.node, k !== kind);
    this.sections.get(kind)?.sync();
    this.previewRow.set(this.preview);
    this.open(this.okBtn);
    this.schedule(0);
  }

  private run(src: ImageData, scale: number): ImageData {
    const s = this.s;
    switch (this.kind) {
      case 'gaussianBlur': return gaussianBlur(src, s.radius * scale);
      case 'motionBlur': return motionBlur(src, s.angle, s.distance * scale);
      case 'addNoise': return addNoise(src, s.amount, s.gaussian, s.monochromatic, this.seed);
      case 'lensCorrection': return lensDistort(src, s.distortion);
    }
  }

  private grow(): number {
    return this.kind === 'gaussianBlur' ? gaussianMargin(this.s.radius) : this.kind === 'motionBlur' ? motionMargin(this.s.distance) : 0;
  }

  private schedule(delay = 140): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.isOpen) return;
      if (this.preview) this.engine.previewImageEdit((src, scale) => this.run(src, scale), this.grow());
      else this.engine.setPreview(null);
    }, delay);
  }

  private commit(): void {
    window.clearTimeout(this.timer);
    this.done = true;
    const label = FILTER_LABELS[this.kind], grow = this.grow();
    const run = (src: ImageData, scale: number): ImageData => this.run(src, scale);
    this.close();
    requestAnimationFrame(() => window.setTimeout(() => this.engine.applyImageEdit(label, run, grow), 0));
  }

  private abandon(): void {
    window.clearTimeout(this.timer);
    if (!this.done) this.engine.setPreview(null);
  }
}

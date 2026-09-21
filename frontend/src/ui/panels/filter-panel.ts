import { addNoise, gaussianBlur, gaussianMargin, lensDistort, motionBlur, motionMargin, randomSeed, runFilterOffThread, unsharpMask, defaultDevelopState, developImage, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop' };

export function defaultFilterSettings() {
  return { radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, usmAmount: 100, usmRadius: 1, threshold: 0, develop: defaultDevelopState() };
}
export type FilterPanelSettings = ReturnType<typeof defaultFilterSettings>;

/** One filter on `src` with settings `s` (and `seed` for noise), radii scaled by `scale` for a scaled preview: the
 *  Filter dialog's work, shared with smart filters. */
export function runFilter(kind: FilterKind, s: FilterPanelSettings, seed: number, src: ImageData, scale: number): ImageData {
  switch (kind) {
      case 'gaussianBlur': return gaussianBlur(src, s.radius * scale);
      case 'motionBlur': return motionBlur(src, s.angle, s.distance * scale);
      case 'addNoise': return addNoise(src, s.amount, s.gaussian, s.monochromatic, seed);
      case 'lensCorrection': return lensDistort(src, s.distortion);
      case 'unsharpMask': return unsharpMask(src, s.usmAmount, s.usmRadius * scale, s.threshold);
      case 'develop': return developImage(src, s.develop, scale);
    default: return src;
  }
}

/** How far a filter's effect reaches past its input, in pixels. */
export function filterMargin(kind: FilterKind, s: FilterPanelSettings): number {
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : 0;
}

export class FilterPanel extends Dialog {
  private kind: FilterKind = 'gaussianBlur';
  private readonly s = defaultFilterSettings();
  private editing: ((settings: Record<string, unknown>) => void) | null = null;
  private savedPreview: boolean | null = null;
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
    const usmAmount = sliderRow('Amount (%)', 1, 500, 1, (v) => { s.usmAmount = v; this.schedule(); });
    const usmRadius = sliderRow('Radius (px)', 0.1, 100, 0.1, (v) => { s.usmRadius = v; this.schedule(); }, { max: 250 });
    const threshold = sliderRow('Threshold (levels)', 0, 255, 1, (v) => { s.threshold = v; this.schedule(); });
    this.section('unsharpMask', [usmAmount.el, usmRadius.el, threshold.el], () => { usmAmount.set(s.usmAmount); usmRadius.set(s.usmRadius); threshold.set(s.threshold); });
    // Develop: Camera Raw-style controls over formnodal's develop core, grouped as the develop studio groups them.
    const dev = s.develop, t = dev.tone, dt = dev.detail;
    const devRows: Array<[string, number, number, number, () => number, (v: number) => void] | string> = [
      'Light',
      ['Exposure (EV)', -5, 5, 0.05, () => t.exposure / 100, (v) => { t.exposure = v * 100; }],
      ['Contrast', -100, 100, 1, () => t.contrast, (v) => { t.contrast = v; }],
      ['Highlights', -100, 100, 1, () => t.highlights, (v) => { t.highlights = v; }],
      ['Shadows', -100, 100, 1, () => t.shadows, (v) => { t.shadows = v; }],
      ['Whites', -100, 100, 1, () => t.whites, (v) => { t.whites = v; }],
      ['Blacks', -100, 100, 1, () => t.blacks, (v) => { t.blacks = v; }],
      'Colour',
      ['Temperature', -100, 100, 1, () => t.temperature, (v) => { t.temperature = v; }],
      ['Tint', -100, 100, 1, () => t.tint, (v) => { t.tint = v; }],
      ['Vibrance', -100, 100, 1, () => t.vibrance, (v) => { t.vibrance = v; }],
      ['Saturation', -100, 100, 1, () => t.saturation, (v) => { t.saturation = v; }],
      'Effects',
      ['Dehaze', -100, 100, 1, () => t.dehaze, (v) => { t.dehaze = v; }],
      ['Vignette', 0, 100, 1, () => t.vignette, (v) => { t.vignette = v; }],
      ['Grain', 0, 100, 1, () => t.grain, (v) => { t.grain = v; }],
      'Detail',
      ['Clarity', -100, 100, 1, () => dt.clarity, (v) => { dt.clarity = v; }],
      ['Texture', -100, 100, 1, () => dt.texture, (v) => { dt.texture = v; }],
      ['Sharpening', 0, 100, 1, () => dt.sharpen, (v) => { dt.sharpen = v; }],
    ];
    const devNodes: HTMLElement[] = [], devSync: Array<() => void> = [];
    for (const row of devRows) {
      if (typeof row === 'string') { devNodes.push(el(`<p class="cv-note">${row}</p>`)); continue; }
      const [label, min, max, step, read, write] = row;
      const r = sliderRow(label, min, max, step, (v) => { write(v); this.schedule(); });
      devNodes.push(r.el);
      devSync.push(() => r.set(read()));
    }
    this.section('develop', devNodes, () => { for (const f of devSync) f(); });
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
    const al = this.engine.current?.activeLayer;
    if (al?.vector && !(this.engine.current?.maskTarget && al.mask)) { toast('This is a shape layer. Rasterize it (Layer > Rasterize Layer) to filter its pixels.'); return; }
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

  private run(src: ImageData, scale: number): ImageData { return runFilter(this.kind, this.s, this.seed, src, scale); }

  private grow(): number { return filterMargin(this.kind, this.s); }

  private schedule(delay = 140): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.isOpen) return;
      if (this.preview) this.engine.previewImageEdit((src, scale) => runFilterOffThread(this.kind, this.s, scale, this.seed, src) ?? this.run(src, scale), this.grow());
      else this.engine.setPreview(null);
    }, delay);
  }

  /** Called when the dialog applies a filter, with its kind and settings, for Actions to record it. */
  onApplied: ((kind: FilterKind, settings: Record<string, unknown>) => void) | null = null;

  /** Applies `kind` with `settings` straight away, without the dialog, as Actions replay a recorded filter. */
  applySettings(kind: FilterKind, settings: Record<string, unknown>): boolean {
    if (!(kind in FILTER_LABELS)) return false;
    if (this.smartTarget()) { this.engine.addSmartFilter(kind, structuredClone(settings)); return true; }
    this.kind = kind;
    Object.assign(this.s, structuredClone(settings));
    const run = (src: ImageData, scale: number): ImageData => this.run(src, scale);
    this.engine.applyImageEdit(FILTER_LABELS[kind], run, this.grow());
    return true;
  }

  /** True when the filter should join the active smart object's stack rather than change pixels. */
  private smartTarget(): boolean { const p = this.engine.current, l = p?.activeLayer; return !!l?.smart && !(p?.maskTarget && l.mask); }

  /** Opens `kind` with a smart filter's `settings` to change them; OK hands the new settings to `done`. The live
   *  preview is off meanwhile, since the stack already shows the filter being changed. */
  showFor(kind: FilterKind, settings: Record<string, unknown>, done: (settings: Record<string, unknown>) => void): void {
    if (this.isOpen) return;
    this.savedPreview = this.preview;
    this.preview = false;
    this.show(kind);
    Object.assign(this.s, structuredClone(settings));
    if (typeof settings.seed === 'number') this.seed = settings.seed;
    this.sections.get(kind)?.sync();
    this.previewRow.set(false);
    this.editing = done;
  }

  private commit(): void {
    window.clearTimeout(this.timer);
    this.done = true;
    const kind = this.kind, settings: Record<string, unknown> = { ...structuredClone(this.s), seed: this.seed }, editing = this.editing;
    if (editing) { this.close(); editing(settings); return; }
    this.onApplied?.(this.kind, structuredClone(this.s));
    if (this.smartTarget()) { this.engine.setPreview(null); this.close(); this.engine.addSmartFilter(kind, settings); return; }
    const label = FILTER_LABELS[this.kind], grow = this.grow();
    const run = (src: ImageData, scale: number): ImageData => this.run(src, scale);
    this.close();
    requestAnimationFrame(() => window.setTimeout(() => this.engine.applyImageEdit(label, run, grow), 0));
  }

  private abandon(): void {
    window.clearTimeout(this.timer);
    this.editing = null;
    if (this.savedPreview !== null) { this.preview = this.savedPreview; this.savedPreview = null; }
    if (!this.done) this.engine.setPreview(null);
  }
}

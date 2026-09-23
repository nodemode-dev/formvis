import { addNoise, gaussianBlur, gaussianMargin, lensDistort, motionBlur, motionMargin, randomSeed, runFilterOffThread, unsharpMask, defaultDevelopState, developImage, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow, type Row } from './controls';
import { lensBlur, lensBlurMargin, shakeMargin, shakeReduce, smartSharpen, smartSharpenMargin, type SharpenRemove, type ShakeSettings } from '../../engine/filters-more';
import { estimateShake } from '../../engine/shake';

export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop', lensBlur: 'Lens Blur', smartSharpen: 'Smart Sharpen', shakeReduction: 'Shake Reduction' };

export function defaultFilterSettings() {
  return {
    radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, usmAmount: 100, usmRadius: 1, threshold: 0, develop: defaultDevelopState(),
    lensRadius: 15, lensBrightness: 0, lensThreshold: 255,
    smart: { amount: 200, radius: 1, noise: 10, remove: 'lens' as SharpenRemove, angle: 0, shadows: 0, highlights: 0 },
    shake: { angle: 0, length: 10, smoothing: 10, amount: 100 } as ShakeSettings,
  };
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
      case 'lensBlur': return lensBlur(src, s.lensRadius * scale, s.lensBrightness, s.lensThreshold);
      case 'smartSharpen': return smartSharpen(src, s.smart, scale);
      case 'shakeReduction': return shakeReduce(src, s.shake, scale);
    default: return src;
  }
}

/** How far a filter's effect reaches past its input, in pixels. */
export function filterMargin(kind: FilterKind, s: FilterPanelSettings): number {
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : kind === 'lensBlur' ? lensBlurMargin(s.lensRadius) : kind === 'smartSharpen' ? smartSharpenMargin(s.smart) : kind === 'shakeReduction' ? shakeMargin(s.shake) : 0;
}

export class FilterPanel extends Dialog {
  private kind: FilterKind = 'gaussianBlur';
  private readonly s = defaultFilterSettings();
  private editing: ((settings: Record<string, unknown>) => void) | null = null;
  private asking: ((settings: Record<string, unknown> | null) => void) | null = null;
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
    const lensR = sliderRow('Radius (px)', 1, 100, 1, (v) => { s.lensRadius = v; this.schedule(); });
    const lensB = sliderRow('Specular brightness', 0, 100, 1, (v) => { s.lensBrightness = v; this.schedule(); });
    const lensT = sliderRow('Specular threshold', 0, 255, 1, (v) => { s.lensThreshold = v; this.schedule(); });
    this.section('lensBlur', [lensR.el, lensB.el, lensT.el, el('<p class="cv-note">An iris-shaped blur in linear light; pixels at or above the threshold bloom into bright discs.</p>')], () => { lensR.set(s.lensRadius); lensB.set(s.lensBrightness); lensT.set(s.lensThreshold); });
    const ss = s.smart;
    const ssAmount = sliderRow('Amount (%)', 1, 500, 1, (v) => { ss.amount = v; this.schedule(); });
    const ssRadius = sliderRow('Radius (px)', 0.1, 64, 0.1, (v) => { ss.radius = v; this.schedule(); });
    const ssNoise = sliderRow('Reduce Noise (%)', 0, 100, 1, (v) => { ss.noise = v; this.schedule(); });
    const ssAngle = sliderRow('Angle (\u00b0)', -90, 90, 1, (v) => { ss.angle = v; this.schedule(); });
    const angleOn = (): void => { const off = ss.remove !== 'motion'; ssAngle.el.classList.toggle('is-off', off); for (const i of ssAngle.el.querySelectorAll('input')) i.disabled = off; };
    const ssRemove = selectRow('Remove', [['gaussian', 'Gaussian Blur'], ['lens', 'Lens Blur'], ['motion', 'Motion Blur']], (v) => { ss.remove = v as SharpenRemove; angleOn(); this.schedule(); });
    const ssShadows = sliderRow('Shadows fade (%)', 0, 100, 1, (v) => { ss.shadows = v; this.schedule(); });
    const ssHighlights = sliderRow('Highlights fade (%)', 0, 100, 1, (v) => { ss.highlights = v; this.schedule(); });
    this.section('smartSharpen', [ssAmount.el, ssRadius.el, ssNoise.el, ssRemove.el, ssAngle.el, ssShadows.el, ssHighlights.el], () => {
      ssAmount.set(ss.amount); ssRadius.set(ss.radius); ssNoise.set(ss.noise); ssRemove.set(ss.remove); ssAngle.set(ss.angle); angleOn(); ssShadows.set(ss.shadows); ssHighlights.set(ss.highlights);
    });
    // Develop: Camera Raw-style controls over formnodal's develop core, grouped as the develop studio groups them.
    const sh = s.shake;
    const shAngle = sliderRow('Trace angle (\u00b0)', -90, 90, 1, (v) => { sh.angle = v; this.schedule(); });
    const shLength = sliderRow('Trace length (px)', 1, 100, 1, (v) => { sh.length = v; this.schedule(); }, { max: 300 });
    const shSmooth = sliderRow('Smoothing (%)', 0, 100, 1, (v) => { sh.smoothing = v; this.schedule(); });
    const shAmount = sliderRow('Amount (%)', 1, 300, 1, (v) => { sh.amount = v; this.schedule(); });
    const shEstimate = el<HTMLButtonElement>('<button class="cv-btn" type="button">Estimate from image</button>');
    shEstimate.addEventListener('click', () => this.estimateShake());
    this.section('shakeReduction', [this.shakeNote, shAngle.el, shLength.el, shSmooth.el, shAmount.el, shEstimate], () => { shAngle.set(sh.angle); shLength.set(sh.length); shSmooth.set(sh.smoothing); shAmount.set(sh.amount); });
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
    if (kind === 'shakeReduction') this.estimateShake(false);
    for (const [k, sec] of this.sections) setHidden(sec.node, k !== kind);
    this.sections.get(kind)?.sync();
    this.previewRow.set(this.preview);
    this.open(this.okBtn);
    this.schedule(0);
  }

  private readonly shakeNote = el('<p class="cv-note"></p>');

  /** Shake Reduction's trace estimated from the target image (estimateShake), the sliders updated. */
  private estimateShake(refresh = true): void {
    const t = this.engine.targetImage();
    if (!t) return;
    const e = estimateShake(t.image);
    this.s.shake.angle = e.angle;
    this.s.shake.length = e.length;
    this.shakeNote.textContent = `Estimated a straight ${e.length} px trace at ${e.angle}\u00b0${e.confidence < 0.15 ? ' (weak: the image may not be shaken)' : ''}. Photoshop also finds curved traces; this estimate is straight.`;
    if (refresh) { this.sections.get('shakeReduction')?.sync(); this.schedule(0); }
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
  /** Applies `kind` with `settings` (the noise seed among them) off the main thread, the interface staying live. */
  private applyInBackground(kind: FilterKind, settings: Record<string, unknown>): Promise<boolean> {
    const s = { ...defaultFilterSettings(), ...(structuredClone(settings) as Partial<FilterPanelSettings>) }, seed = typeof settings.seed === 'number' ? settings.seed : this.seed;
    const sync = (src: ImageData, scale: number): ImageData => runFilter(kind, s, seed, src, scale);
    return this.engine.applyImageEditAsync(FILTER_LABELS[kind], (src, scale) => runFilterOffThread(kind, s, scale, seed, src) ?? Promise.resolve(sync(src, scale)), filterMargin(kind, s), sync);
  }

  applySettings(kind: FilterKind, settings: Record<string, unknown>): Promise<boolean> | boolean {
    if (!(kind in FILTER_LABELS)) return false;
    if (this.smartTarget()) { this.engine.addSmartFilter(kind, structuredClone(settings)); return true; }
    if (!this.isOpen) return this.applyInBackground(kind, settings);
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

  /** Opens `kind` with recorded `settings` for an action paused for input; resolves with the settings chosen on OK,
   *  or null on Cancel. The filter itself is applied by the action, as any recorded filter is. */
  ask(kind: FilterKind, settings: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      if (this.isOpen) { resolve(null); return; }
      this.show(kind);
      if (!this.isOpen) { resolve(null); return; }
      Object.assign(this.s, structuredClone(settings));
      if (typeof settings.seed === 'number') this.seed = settings.seed;
      this.sections.get(kind)?.sync();
      this.schedule(0);
      this.asking = resolve;
    });
  }

  private commit(): void {
    window.clearTimeout(this.timer);
    this.done = true;
    const kind = this.kind, settings: Record<string, unknown> = { ...structuredClone(this.s), seed: this.seed }, editing = this.editing;
    if (this.asking) { const done = this.asking; this.asking = null; this.engine.setPreview(null); this.close(); done(settings); return; }
    if (editing) { this.close(); editing(settings); return; }
    this.onApplied?.(this.kind, structuredClone(this.s));
    if (this.smartTarget()) { this.engine.setPreview(null); this.close(); this.engine.addSmartFilter(kind, settings); return; }
    // The preview stays on the canvas until the result replaces it, computed off the main thread.
    this.close();
    void this.applyInBackground(kind, settings);
  }

  private abandon(): void {
    window.clearTimeout(this.timer);
    this.editing = null;
    if (this.asking) { const a = this.asking; this.asking = null; if (!this.done) this.engine.setPreview(null); a(null); }
    if (this.savedPreview !== null) { this.preview = this.savedPreview; this.savedPreview = null; }
    if (!this.done) this.engine.setPreview(null);
  }
}

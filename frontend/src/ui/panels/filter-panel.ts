import { blurDeep, motionBlurDeep, noiseDeep, surfaceBlurDeep, unsharpDeep } from '../../engine/deep';
import type { DeepPixels } from '../../engine/types';
import { addNoise, gaussianBlur, gaussianMargin, lensDistort, motionBlur, motionMargin, randomSeed, runFilterOffThread, unsharpMask, defaultDevelopState, developImage, type Engine } from '../../engine';
import { ScopesView } from './scopes-view';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow, type Row } from './controls';
import { lensBlur, lensBlurMargin, shakeMargin, shakeReduce, smartSharpen, smartSharpenMargin, type SharpenRemove, type ShakeSettings } from '../../engine/filters-more';
import { estimateShake } from '../../engine/shake';
import { runGallery, type GallerySettings } from '../../engine/blur-gallery';
import { HSL_BANDS, buildCurveLut, defaultCalibration, defaultGeometry, defaultGrading, defaultOptics, type CalibrationState, type CurveChannel, type DevelopState, type GeometryState, type GradingState, type HslBand, type HslBandState, type OpticsState } from '../../engine/develop';
import { curveGraph } from './curve-graph';

export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction'
  | 'radialBlur' | 'surfaceBlur' | 'fieldBlur' | 'irisBlur' | 'tiltShift' | 'pathBlur';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop', lensBlur: 'Lens Blur', smartSharpen: 'Smart Sharpen', shakeReduction: 'Shake Reduction',
  radialBlur: 'Radial Blur', surfaceBlur: 'Surface Blur', fieldBlur: 'Field Blur', irisBlur: 'Iris Blur', tiltShift: 'Tilt-Shift', pathBlur: 'Path Blur' };

export function defaultFilterSettings() {
  return {
    radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, usmAmount: 100, usmRadius: 1, threshold: 0, develop: defaultDevelopState(),
    lensRadius: 15, lensBrightness: 0, lensThreshold: 255,
    smart: { amount: 200, radius: 1, noise: 10, remove: 'lens' as SharpenRemove, angle: 0, shadows: 0, highlights: 0 },
    shake: { angle: 0, length: 10, smoothing: 10, amount: 100 } as ShakeSettings,
    // Radial and Surface Blur, and the Blur Gallery; positions in percent of the image.
    gallery: {
      radialAmount: 10, radialMethod: 'spin' as 'spin' | 'zoom', radialQuality: 'good' as 'draft' | 'good' | 'best', radialX: 50, radialY: 50,
      surfaceRadius: 5, surfaceThreshold: 15,
      pins: 2, pin1x: 30, pin1y: 50, pin1blur: 0, pin2x: 70, pin2y: 50, pin2blur: 15, pin3x: 50, pin3y: 20, pin3blur: 8, pin4x: 50, pin4y: 80, pin4blur: 8,
      irisBlur: 15, irisX: 50, irisY: 50, irisRx: 30, irisRy: 30, irisAngle: 0, irisFeather: 50,
      tiltBlur: 15, tiltY: 50, tiltAngle: 0, tiltFocus: 10, tiltTransition: 20,
      pathSpeed: 30, pathTaper: 0, pathSx: 20, pathSy: 70, pathBx: 50, pathBy: 30, pathEx: 80, pathEy: 70,
    } as GallerySettings,
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
      case 'radialBlur': case 'surfaceBlur': case 'fieldBlur': case 'irisBlur': case 'tiltShift': case 'pathBlur': return runGallery(kind, s.gallery, src, scale);
    default: return src;
  }
}

/** How far a filter that may run in bands reaches (1.60.9, DEV_PLAN 26.4), or null: those whose effect reaches a bounded
 *  distance and is the same wherever it is. Add Noise (its random sequence), Lens Correction (the whole picture's
 *  geometry) and the blurs placed in the picture (radial, path, field, iris, tilt-shift) run whole. */
export function bandApron(kind: FilterKind, s: FilterPanelSettings): number | null {
  switch (kind) {
    // (Smart Sharpen runs whole: banded, its result was not the whole layer's, so its effect is wider than its margin.)
    case 'gaussianBlur': case 'motionBlur': case 'lensBlur': case 'surfaceBlur': return filterMargin(kind, s);
    case 'unsharpMask': return gaussianMargin(s.usmRadius) + 2;
    default: return null;
  }
}

/** How far a filter's effect reaches past its input, in pixels. */
export function filterMargin(kind: FilterKind, s: FilterPanelSettings): number {
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : kind === 'lensBlur' ? lensBlurMargin(s.lensRadius) : kind === 'smartSharpen' ? smartSharpenMargin(s.smart) : kind === 'shakeReduction' ? shakeMargin(s.shake)
    : kind === 'surfaceBlur' ? Math.ceil(s.gallery.surfaceRadius) + 1 : kind === 'pathBlur' ? Math.ceil(s.gallery.pathSpeed) + 2
    : kind === 'fieldBlur' ? gaussianMargin(Math.max(s.gallery.pin1blur, s.gallery.pin2blur, s.gallery.pin3blur, s.gallery.pin4blur))
    : kind === 'irisBlur' ? gaussianMargin(s.gallery.irisBlur) : kind === 'tiltShift' ? gaussianMargin(s.gallery.tiltBlur)
    : kind === 'radialBlur' ? 2000 : 0;
}

export class FilterPanel extends Dialog {
  /** Develop's histogram, waveform and vectorscope (1.53.4). */
  readonly scopes = new ScopesView();
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
    // Radial and Surface Blur, and the Blur Gallery. Positions are percentages of the image, set here with sliders
    // (Photoshop places the gallery's pins and handles on the canvas). Every control reads and writes s.gallery when
    // used, never a copy taken now, so loaded settings are what is edited.
    type G = FilterPanelSettings['gallery'];
    const gv = <K extends keyof G>(k: K): G[K] => s.gallery[k];
    const gset = <K extends keyof G>(k: K, v: G[K]): void => { s.gallery = { ...s.gallery, [k]: v }; this.schedule(); };
    const gs = (label: string, min: number, max: number, step: number, k: keyof G): { el: HTMLElement; sync: () => void } => {
      const r = sliderRow(label, min, max, step, (v) => gset(k, v as never));
      return { el: r.el, sync: () => r.set(gv(k) as number) };
    };
    const gsel = (label: string, opts: Array<[string, string]>, k: 'radialMethod' | 'radialQuality'): { el: HTMLElement; sync: () => void } => {
      const r = selectRow(label, opts, (v) => gset(k, v as never));
      return { el: r.el, sync: () => r.set(String(gv(k))) };
    };
    const group = (kind: FilterKind, rows: Array<{ el: HTMLElement; sync: () => void }>, note?: string): void =>
      this.section(kind, [...rows.map((r) => r.el), ...(note ? [el(`<p class="cv-note">${note}</p>`)] : [])], () => { for (const r of rows) r.sync(); });
    group('radialBlur', [gs('Amount', 1, 100, 1, 'radialAmount'), gsel('Blur Method', [['spin', 'Spin'], ['zoom', 'Zoom']], 'radialMethod'),
      gsel('Quality', [['draft', 'Draft'], ['good', 'Good'], ['best', 'Best']], 'radialQuality'), gs('Center X (%)', 0, 100, 1, 'radialX'), gs('Center Y (%)', 0, 100, 1, 'radialY')]);
    group('surfaceBlur', [gs('Radius (px)', 1, 100, 1, 'surfaceRadius'), gs('Threshold (levels)', 2, 255, 1, 'surfaceThreshold')]);
    group('fieldBlur', [gs('Pins', 1, 4, 1, 'pins'),
      ...([1, 2, 3, 4] as const).flatMap((i) => [gs(`Pin ${i} X (%)`, 0, 100, 1, `pin${i}x`), gs(`Pin ${i} Y (%)`, 0, 100, 1, `pin${i}y`), gs(`Pin ${i} Blur (px)`, 0, 500, 1, `pin${i}blur`)])],
      'Each pin sets the blur at its place; between pins the blur blends by distance.');
    group('irisBlur', [gs('Blur (px)', 0, 500, 1, 'irisBlur'), gs('Center X (%)', 0, 100, 1, 'irisX'), gs('Center Y (%)', 0, 100, 1, 'irisY'),
      gs('Radius X (%)', 1, 100, 1, 'irisRx'), gs('Radius Y (%)', 1, 100, 1, 'irisRy'), gs('Angle (\u00b0)', -90, 90, 1, 'irisAngle'), gs('Sharp area (%)', 0, 99, 1, 'irisFeather')],
      'Sharp inside the sharp area, rising to the full blur at the ellipse\'s edge.');
    group('tiltShift', [gs('Blur (px)', 0, 500, 1, 'tiltBlur'), gs('Center Y (%)', 0, 100, 1, 'tiltY'), gs('Angle (\u00b0)', -90, 90, 1, 'tiltAngle'),
      gs('Focus (% of height)', 0, 50, 1, 'tiltFocus'), gs('Transition (% of height)', 1, 50, 1, 'tiltTransition')]);
    group('pathBlur', [gs('Speed (px)', 0, 500, 1, 'pathSpeed'), gs('Taper (%)', 0, 100, 1, 'pathTaper'), gs('Start X (%)', 0, 100, 1, 'pathSx'), gs('Start Y (%)', 0, 100, 1, 'pathSy'),
      gs('Bend X (%)', 0, 100, 1, 'pathBx'), gs('Bend Y (%)', 0, 100, 1, 'pathBy'), gs('End X (%)', 0, 100, 1, 'pathEx'), gs('End Y (%)', 0, 100, 1, 'pathEy')],
      'Blurs along the path from start through the bend to end, as if moving along it.');
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
    // Camera Raw's further panels (the comparison's Develop row). The engine already had the point curve and colour
    // mixer; this dialog did not show them. Every control reads s.develop when used, so loaded settings are what is edited.
    const D = (): DevelopState => s.develop;
    const slide = (label: string, min: number, max: number, step: number, read: () => number, write: (v: number) => void): void => {
      const r = sliderRow(label, min, max, step, (v) => { write(v); this.schedule(); });
      devNodes.push(r.el);
      devSync.push(() => r.set(read()));
    };
    let curveCh: CurveChannel = 'rgb';
    const graph = curveGraph({ points: () => D().curves[curveCh], table: (p) => buildCurveLut(p), changed: () => this.schedule() });
    const curveSel = selectRow('Channel', [['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], (v) => { curveCh = v as CurveChannel; graph.draw(); });
    devNodes.push(el('<p class="cv-note">Point Curve</p>'), curveSel.el, graph.el);
    devSync.push(() => { curveSel.set(curveCh); graph.draw(); });
    let band: 'master' | HslBand = 'master';
    const bandState = (): HslBandState => (band === 'master' ? D().color.master : D().color.bands[band]);
    const mixH = sliderRow('Hue', -180, 180, 1, (v) => { bandState().h = v; this.schedule(); });
    const mixS = sliderRow('Saturation', -100, 100, 1, (v) => { bandState().s = v; this.schedule(); });
    const mixL = sliderRow('Luminance', -100, 100, 1, (v) => { bandState().l = v; this.schedule(); });
    const syncMix = (): void => { mixH.set(bandState().h); mixS.set(bandState().s); mixL.set(bandState().l); };
    const mixSel = selectRow('Colours', [['master', 'All colours'], ...HSL_BANDS.map((b) => [b, b[0].toUpperCase() + b.slice(1)] as const)], (v) => { band = v as 'master' | HslBand; syncMix(); });
    devNodes.push(el('<p class="cv-note">Colour Mixer</p>'), mixSel.el, mixH.el, mixS.el, mixL.el);
    devSync.push(() => { mixSel.set(band); syncMix(); });
    let range: 'shadows' | 'midtones' | 'highlights' | 'global' = 'midtones';
    const grading = (): GradingState => (D().grading ??= defaultGrading());
    const gH = sliderRow('Hue', 0, 360, 1, (v) => { grading()[range].h = v; this.schedule(); });
    const gS = sliderRow('Saturation', 0, 100, 1, (v) => { grading()[range].s = v; this.schedule(); });
    const syncWheel = (): void => { gH.set(grading()[range].h); gS.set(grading()[range].s); };
    const rangeSel = selectRow('Range', [['shadows', 'Shadows'], ['midtones', 'Midtones'], ['highlights', 'Highlights'], ['global', 'Global']], (v) => { range = v as typeof range; syncWheel(); });
    devNodes.push(el('<p class="cv-note">Colour Grading</p>'), rangeSel.el, gH.el, gS.el);
    devSync.push(() => { rangeSel.set(range); syncWheel(); });
    slide('Blending', 0, 100, 1, () => grading().blending, (v) => { grading().blending = v; });
    slide('Balance', -100, 100, 1, () => grading().balance, (v) => { grading().balance = v; });
    const optics = (): OpticsState => (D().optics ??= defaultOptics()), geometry = (): GeometryState => (D().geometry ??= defaultGeometry());
    const calib = (): CalibrationState => (D().calibration ??= defaultCalibration());
    devNodes.push(el('<p class="cv-note">Optics</p>'));
    slide('Distortion', -100, 100, 1, () => optics().distortion, (v) => { optics().distortion = v; });
    slide('Chromatic Aberration', -100, 100, 1, () => optics().chromatic, (v) => { optics().chromatic = v; });
    slide('Vignetting', -100, 100, 1, () => optics().vignetting, (v) => { optics().vignetting = v; });
    slide('Midpoint', 0, 100, 1, () => optics().midpoint, (v) => { optics().midpoint = v; });
    devNodes.push(el('<p class="cv-note">Geometry</p>'));
    slide('Vertical', -100, 100, 1, () => geometry().vertical, (v) => { geometry().vertical = v; });
    slide('Horizontal', -100, 100, 1, () => geometry().horizontal, (v) => { geometry().horizontal = v; });
    slide('Rotate (\u00b0)', -10, 10, 0.1, () => geometry().rotate, (v) => { geometry().rotate = v; });
    slide('Scale (%)', 50, 150, 1, () => geometry().scale, (v) => { geometry().scale = v; });
    slide('Offset X', -100, 100, 1, () => geometry().offsetX, (v) => { geometry().offsetX = v; });
    slide('Offset Y', -100, 100, 1, () => geometry().offsetY, (v) => { geometry().offsetY = v; });
    devNodes.push(el('<p class="cv-note">Calibration</p>'));
    slide('Shadows Tint', -100, 100, 1, () => calib().shadowTint, (v) => { calib().shadowTint = v; });
    for (const [p, name] of [['red', 'Red'], ['green', 'Green'], ['blue', 'Blue']] as const) {
      slide(`${name} Primary Hue`, -100, 100, 1, () => calib()[`${p}Hue`], (v) => { calib()[`${p}Hue`] = v; });
      slide(`${name} Primary Saturation`, -100, 100, 1, () => calib()[`${p}Sat`], (v) => { calib()[`${p}Sat`] = v; });
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
    if (kind === 'develop') node.prepend(this.scopes.el);   // Develop's scopes (1.53.4)
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
      // Develop's scopes follow the developed preview (1.53.4).
      const scoped = (out: ImageData | Promise<ImageData>): ImageData | Promise<ImageData> => { if (this.kind === 'develop') void Promise.resolve(out).then((img) => this.scopes.draw(img)).catch(() => undefined); return out; };
      if (this.preview) this.engine.previewImageEdit((src, scale) => scoped(runFilterOffThread(this.kind, this.s, scale, this.seed, src) ?? this.run(src, scale)), this.grow());
      else this.engine.setPreview(null);
    }, delay);
  }

  /** Called when the dialog applies a filter, with its kind and settings, for Actions to record it. */
  onApplied: ((kind: FilterKind, settings: Record<string, unknown>) => void) | null = null;

  /** Applies `kind` with `settings` straight away, without the dialog, as Actions replay a recorded filter. */
  /** Applies `kind` with `settings` (the noise seed among them) off the main thread, the interface staying live. */
/** Gaussian Blur, Unsharp Mask and Add Noise in a 16-bit document, at 16 bits (1.53.7), with these settings. */
  private deepFilter(kind: FilterKind, settings: Record<string, unknown>): boolean {
    const p = this.engine.current;
    if (!p || ((p.doc.depth ?? 8) === 8 && p.doc.mode !== 'cmyk')) return false;
    const s = { ...this.s, ...(settings as Partial<typeof this.s>) }, seed = this.seed, ceiling = p.doc.depth === 32 ? Infinity : 1;
    const deep = kind === 'gaussianBlur' ? (d: DeepPixels): DeepPixels => blurDeep(d, s.radius) : kind === 'unsharpMask' ? (d: DeepPixels): DeepPixels => unsharpDeep(d, s.usmAmount, s.usmRadius, s.threshold, ceiling) : kind === 'addNoise' ? (d: DeepPixels): DeepPixels => noiseDeep(d, s.amount, s.gaussian, s.monochromatic, seed, ceiling) : kind === 'motionBlur' ? (d: DeepPixels): DeepPixels => motionBlurDeep(d, s.angle, s.distance) : kind === 'surfaceBlur' ? (d: DeepPixels): DeepPixels => surfaceBlurDeep(d, s.gallery.surfaceRadius, s.gallery.surfaceThreshold) : null;
    if (!deep) return false;
    this.engine.applyDeepFilter(FILTER_LABELS[kind], deep);
    return true;
  }

    private applyInBackground(kind: FilterKind, settings: Record<string, unknown>): Promise<boolean> {
    if (this.deepFilter(kind, settings)) { this.engine.setPreview(null); this.close(); return Promise.resolve(true); }   // 16 bits (1.53.7)
    const s = { ...defaultFilterSettings(), ...(structuredClone(settings) as Partial<FilterPanelSettings>) }, seed = typeof settings.seed === 'number' ? settings.seed : this.seed;
    const sync = (src: ImageData, scale: number): ImageData => runFilter(kind, s, seed, src, scale);
    const apron = bandApron(kind, s);   // a large layer in bands (1.60.9)
    const banded = apron !== null ? this.engine.bandedFilter(FILTER_LABELS[kind], (src) => sync(src, 1), apron, filterMargin(kind, s)) : false;
    if (banded === 'refused') return Promise.resolve(false);   // not done, and said why
    if (banded) { this.engine.setPreview(null); this.close(); return Promise.resolve(true); }
    return this.engine.applyImageEditAsync(FILTER_LABELS[kind], (src, scale) => runFilterOffThread(kind, s, scale, seed, src) ?? Promise.resolve(sync(src, scale)), filterMargin(kind, s), sync);
  }

  applySettings(kind: FilterKind, settings: Record<string, unknown>): Promise<boolean> | boolean {
    if (!(kind in FILTER_LABELS)) return false;
    if (this.smartTarget()) { this.engine.addSmartFilter(kind, structuredClone(settings)); return true; }
    if (!this.isOpen) return this.applyInBackground(kind, settings);
    this.kind = kind;
    Object.assign(this.s, structuredClone(settings));
    const run = (src: ImageData, scale: number): ImageData => this.run(src, scale);
    if (this.deepFilter(kind, settings)) return true;   // 16 bits (1.53.7)
    const apron = bandApron(kind, this.s);   // a large layer in bands (1.60.9)
    const banded = apron !== null ? this.engine.bandedFilter(FILTER_LABELS[kind], (src) => run(src, 1), apron, this.grow()) : false;
    if (banded === 'refused') return false;   // not done, and said why
    if (banded) return true;
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

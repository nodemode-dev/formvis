import { blurDeep, motionBlurDeep, noiseDeep, surfaceBlurDeep, unsharpDeep } from '../../engine/deep';
import type { DeepPixels } from '../../engine/types';
import { addNoise, defaultLensFix, gaussianBlur, gaussianMargin, lensCorrect, motionBlur, motionMargin, randomSeed, runFilterOffThread, unsharpMask, defaultDevelopState, developImage, type Engine, type LensFix } from '../../engine';
import { ScopesView } from './scopes-view';
import { Dialog } from '../dialogs';
import { el, q, setDisabled, setHidden, setText, setValue } from '../dom';
import { toast } from '../toast';
import { recalled, remembered } from '../prefs';
import { checkRow, colorRow, matrixRow, selectRow, sliderRow, type Row } from './controls';
import { lensBlur, lensBlurMargin, shakeMargin, shakeReduce, smartSharpen, smartSharpenMargin, type SharpenRemove, type ShakeSettings } from '../../engine/filters-more';
import { estimateShake } from '../../engine/shake';
import { runGallery, type GallerySettings } from '../../engine/blur-gallery';
import { LIBRARY, isLibKind, libAllDefaults, libApron, libFilter, libImageParams, libMargin, libPathParams, libValues, runLib, type LibColors, type LibFrame, type LibImage, type LibKind, type LibParam, type LibPath, type LibValue, type LibValues } from '../../engine/filter-library';
import { crsXmp, developFromXmp } from '../../io/crs-xmp';
import { HSL_BANDS, autoWhiteBalance, bandOf, buildCurveLut, defaultCalibration, defaultGeometry, defaultGrading, defaultNoise, defaultOptics, defaultParametric, defaultPointColor, defaultVignetteShape, hslToRgb, whiteBalanceFor, type CalibrationState, type CurveChannel, type CurvePoint,type DevelopState, type GeometryState, type GradingState, type HslBand, type HslBandState, type OpticsState, type ParametricState, type PointColorState } from '../../engine/develop';
import { curveGraph } from './curve-graph';
import { GalleryView } from './gallery-view';

export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction'
  | 'radialBlur' | 'surfaceBlur' | 'fieldBlur' | 'irisBlur' | 'tiltShift' | 'pathBlur' | LibKind;
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop', lensBlur: 'Lens Blur', smartSharpen: 'Smart Sharpen', shakeReduction: 'Shake Reduction',
  radialBlur: 'Radial Blur', surfaceBlur: 'Surface Blur', fieldBlur: 'Field Blur', irisBlur: 'Iris Blur', tiltShift: 'Tilt-Shift', pathBlur: 'Path Blur',
  ...(Object.fromEntries(LIBRARY.map((f) => [f.id, f.label])) as Record<LibKind, string>) };

export function defaultFilterSettings() {
  return {
    radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, lensFix: defaultLensFix(), usmAmount: 100, usmRadius: 1, threshold: 0, develop: defaultDevelopState(),
    lensRadius: 15, lensBrightness: 0, lensThreshold: 255,
    smart: { amount: 200, radius: 1, noise: 10, remove: 'lens' as SharpenRemove, angle: 0, shadows: 0, highlights: 0 },
    shake: { angle: 0, length: 10, smoothing: 10, amount: 100 } as ShakeSettings,
    // Radial and Surface Blur, and the Blur Gallery; positions in percent of the image.
    gallery: {
      radialAmount: 10, radialMethod: 'spin' as 'spin' | 'zoom', radialQuality: 'good' as 'draft' | 'good' | 'best', radialX: 50, radialY: 50,
      surfaceRadius: 5, surfaceThreshold: 15,
      pins: 2, pin1x: 30, pin1y: 50, pin1blur: 0, pin2x: 70, pin2y: 50, pin2blur: 15, pin3x: 50, pin3y: 20, pin3blur: 8, pin4x: 50, pin4y: 80, pin4blur: 8,
      irisBlur: 15, irisX: 50, irisY: 50, irisRx: 30, irisRy: 30, irisAngle: 0, irisFeather: 50, irisRound: 100,
      tiltBlur: 15, tiltX: 50, tiltY: 50, tiltAngle: 0, tiltFocus: 10, tiltTransition: 20,
      pathSpeed: 30, pathTaper: 0, pathSx: 20, pathSy: 70, pathBx: 50, pathBy: 30, pathEx: 80, pathEy: 70,
    } as GallerySettings,
    lib: libAllDefaults() as Partial<Record<LibKind, LibValues>>,
    colors: { fg: [0, 0, 0], bg: [255, 255, 255] } as LibColors,
  };
}
export type FilterPanelSettings = ReturnType<typeof defaultFilterSettings>;

/** One filter on `src` with settings `s` (and `seed` for noise), radii scaled by `scale` for a scaled preview: the
 *  Filter dialog's work, shared with smart filters. */
export function runFilter(kind: FilterKind, s: FilterPanelSettings, seed: number, src: ImageData, scale: number, frame?: LibFrame | null): ImageData {
  switch (kind) {
      case 'gaussianBlur': return gaussianBlur(src, s.radius * scale);
      case 'motionBlur': return motionBlur(src, s.angle, s.distance * scale);
      case 'addNoise': return addNoise(src, s.amount, s.gaussian, s.monochromatic, seed);
      case 'lensCorrection': return lensCorrect(src, s.distortion, s.lensFix ?? defaultLensFix());
      case 'unsharpMask': return unsharpMask(src, s.usmAmount, s.usmRadius * scale, s.threshold);
      case 'develop': return developImage(src, s.develop, scale);
      case 'lensBlur': return lensBlur(src, s.lensRadius * scale, s.lensBrightness, s.lensThreshold);
      case 'smartSharpen': return smartSharpen(src, s.smart, scale);
      case 'shakeReduction': return shakeReduce(src, s.shake, scale);
      case 'radialBlur': case 'surfaceBlur': case 'fieldBlur': case 'irisBlur': case 'tiltShift': case 'pathBlur': return runGallery(kind, s.gallery, src, scale);
    default: return isLibKind(kind) ? runLib(kind, s.lib?.[kind], seed, src, scale, frame, s.colors) : src;
  }
}

/** Each filter's peak memory when run on the whole layer, in layer-sizes, rounded up (1.61.1: measured on a 4,000 by
 *  4,000 layer with the browser's memory sampled every 100 ms; the room check had counted 2 for all). Surface Blur's
 *  reading was masked by the previous filter's memory being collected during it, so it takes the common 12. */
const FILTER_PEAK: Partial<Record<FilterKind, number>> = {
  gaussianBlur: 12, motionBlur: 10, addNoise: 2, lensCorrection: 10, unsharpMask: 11, lensBlur: 19, smartSharpen: 12, shakeReduction: 10,
  radialBlur: 12, surfaceBlur: 12, fieldBlur: 16, irisBlur: 13, tiltShift: 15, pathBlur: 4, develop: 4,
};
export const filterPeak = (kind: FilterKind): number => FILTER_PEAK[kind] ?? 12;

/** How far a filter that may run in bands reaches (1.60.9, DEV_PLAN 26.4), or null: those whose effect reaches a bounded
 *  distance and is the same wherever it is. Add Noise (its random sequence), Lens Correction (the whole picture's
 *  geometry) and the blurs placed in the picture (radial, path, field, iris, tilt-shift) run whole. */
export function bandApron(kind: FilterKind, s: FilterPanelSettings): number | null {
  switch (kind) {
    // (Smart Sharpen runs whole: banded, its result was not the whole layer's, so its effect is wider than its margin.)
    case 'gaussianBlur': case 'motionBlur': case 'lensBlur': case 'surfaceBlur': return filterMargin(kind, s);
    case 'unsharpMask': return gaussianMargin(s.usmRadius) + 2;
    default: return isLibKind(kind) ? libApron(kind, s.lib?.[kind]) : null;
  }
}

/** Radial Blur's reach past the layer, for content up to 2000 px from its centre: a spin moves a sample by a chord of at
 *  most a twelfth of the amount's turn, a zoom by its scale step; the fixed 2000 it used to take grew every layer to
 *  4,800 by 4,600 at the default amount, which made the next filter on it take over a minute. */
function radialMargin(amount: number, method: 'spin' | 'zoom'): number {
  const k = Math.max(1, Math.min(100, amount)) / 100;
  return Math.ceil(2000 * (method === 'spin' ? 2 * Math.sin(k * Math.PI / 12) : (k / 2) / (1 - k / 2))) + 2;
}

/** How far a filter's effect reaches past its input, in pixels. */
export function filterMargin(kind: FilterKind, s: FilterPanelSettings): number {
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : kind === 'lensBlur' ? lensBlurMargin(s.lensRadius) : kind === 'smartSharpen' ? smartSharpenMargin(s.smart) : kind === 'shakeReduction' ? shakeMargin(s.shake)
    : kind === 'surfaceBlur' ? Math.ceil(s.gallery.surfaceRadius) + 1 : kind === 'pathBlur' ? Math.ceil(s.gallery.pathSpeed) + 2
    : kind === 'fieldBlur' ? gaussianMargin(Math.max(s.gallery.pin1blur, s.gallery.pin2blur, s.gallery.pin3blur, s.gallery.pin4blur))
    : kind === 'irisBlur' ? gaussianMargin(s.gallery.irisBlur) : kind === 'tiltShift' ? gaussianMargin(s.gallery.tiltBlur)
    : kind === 'radialBlur' ? radialMargin(s.gallery.radialAmount, s.gallery.radialMethod) : isLibKind(kind) ? libMargin(kind, s.lib?.[kind]) : 0;
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
  /** Develop's Profile list (DEV_PLAN 28.2): for a RAW layer the app answers with the camera profiles on this computer
   *  that fit its camera, and re-develops the file with the one chosen. */
  rawProfile: { options(): Promise<{ list: ReadonlyArray<readonly [string, string]>; current: string } | null>; choose(id: string): Promise<boolean> } | null = null;
  private readonly profileRow = selectRow('Profile', [['none', 'Default']], (v) => void this.chooseProfile(v));
  private profileSeq = 0;

  constructor(private readonly engine: Engine) {
    super('Filter', 440);
    const s = this.s;
    const gbRadius = sliderRow('Radius (px)', 0.1, 100, 0.1, (v) => { s.radius = v; this.schedule(); }, { max: 1000 });
    this.section('gaussianBlur', [gbRadius.el], () => gbRadius.set(s.radius));
    const mbAngle = sliderRow('Angle (\u00b0)', -90, 90, 1, (v) => { s.angle = v; this.schedule(); });
    const mbDistance = sliderRow('Distance (px)', 1, 500, 1, (v) => { s.distance = v; this.schedule(); }, { max: 2000 });
    this.section('motionBlur', [mbAngle.el, mbDistance.el], () => { mbAngle.set(s.angle); mbDistance.set(s.distance); });
    const nzAmount = sliderRow('Amount (%)', 0.1, 400, 0.1, (v) => { s.amount = v; this.schedule(); });
    const nzKind = selectRow('Distribution', [['uniform', 'Uniform'], ['gaussian', 'Gaussian']], (v) => { s.gaussian = v === 'gaussian'; this.schedule(); });
    const nzMono = checkRow('Monochromatic', (v) => { s.monochromatic = v; this.schedule(); });
    this.section('addNoise', [nzAmount.el, nzKind.el, nzMono.el], () => { nzAmount.set(s.amount); nzKind.set(s.gaussian ? 'gaussian' : 'uniform'); nzMono.set(s.monochromatic); });
    const lcDistortion = sliderRow('Distortion', -100, 100, 1, (v) => { s.distortion = v; this.schedule(); });
    const fix = (): LensFix => s.lensFix ?? (s.lensFix = defaultLensFix());
    const lcRc = sliderRow('Fix Red/Cyan Fringe', -100, 100, 1, (v) => { fix().caRc = v; this.schedule(); });
    const lcBy = sliderRow('Fix Blue/Yellow Fringe', -100, 100, 1, (v) => { fix().caBy = v; this.schedule(); });
    const lcVignette = sliderRow('Vignette Amount', -100, 100, 1, (v) => { fix().vignette = v; this.schedule(); });
    const lcMidpoint = sliderRow('Vignette Midpoint', 0, 100, 1, (v) => { fix().midpoint = v; this.schedule(); });
    const lcVertical = sliderRow('Vertical Perspective', -100, 100, 1, (v) => { fix().vertical = v; this.schedule(); });
    const lcHorizontal = sliderRow('Horizontal Perspective', -100, 100, 1, (v) => { fix().horizontal = v; this.schedule(); });
    const lcEdge = selectRow('Edge', [['transparent', 'Transparency'], ['extend', 'Edge Extension'], ['black', 'Black Color'], ['white', 'White Color']], (v) => { fix().edge = v as LensFix['edge']; this.schedule(); });
    this.section('lensCorrection', [lcDistortion.el, lcRc.el, lcBy.el, lcVignette.el, lcMidpoint.el, lcVertical.el, lcHorizontal.el, lcEdge.el, el('<p class="cv-note">Positive Distortion corrects barrel distortion, negative pincushion. Fringe sliders shift the red and blue channels against green.</p>')],
      () => { const f = fix(); lcDistortion.set(s.distortion); lcRc.set(f.caRc); lcBy.set(f.caBy); lcVignette.set(f.vignette); lcMidpoint.set(f.midpoint); lcVertical.set(f.vertical); lcHorizontal.set(f.horizontal); lcEdge.set(f.edge); });
    const usAmount = sliderRow('Amount (%)', 1, 500, 1, (v) => { s.usmAmount = v; this.schedule(); });
    const usRadius = sliderRow('Radius (px)', 0.1, 100, 0.1, (v) => { s.usmRadius = v; this.schedule(); }, { max: 1000 });
    const usThreshold = sliderRow('Threshold (levels)', 0, 255, 1, (v) => { s.threshold = v; this.schedule(); });
    this.section('unsharpMask', [usAmount.el, usRadius.el, usThreshold.el], () => { usAmount.set(s.usmAmount); usRadius.set(s.usmRadius); usThreshold.set(s.threshold); });
    const lensR = sliderRow('Radius (px)', 1, 100, 1, (v) => { s.lensRadius = v; this.schedule(); });
    const lensB = sliderRow('Specular brightness', 0, 100, 1, (v) => { s.lensBrightness = v; this.schedule(); });
    const lensT = sliderRow('Specular threshold', 0, 255, 1, (v) => { s.lensThreshold = v; this.schedule(); });
    // Radial and Surface Blur, and the Blur Gallery. Positions are percentages of the image, set here with sliders
    // (the gallery's pins and handles are not on the canvas). Every control reads and writes s.gallery when
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
      gs('Radius X (%)', 1, 100, 1, 'irisRx'), gs('Radius Y (%)', 1, 100, 1, 'irisRy'), gs('Angle (\u00b0)', -90, 90, 1, 'irisAngle'), gs('Sharp area (%)', 0, 99, 1, 'irisFeather'), gs('Roundness (%)', 0, 100, 1, 'irisRound')],
      'Sharp inside the sharp area, rising to the full blur at the ellipse\'s edge.');
    group('tiltShift', [gs('Blur (px)', 0, 500, 1, 'tiltBlur'), gs('Center X (%)', 0, 100, 1, 'tiltX'), gs('Center Y (%)', 0, 100, 1, 'tiltY'), gs('Angle (\u00b0)', -90, 90, 1, 'tiltAngle'),
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
    // s.develop is replaced when saved settings are recalled, so the tone and detail rows reach it through these views.
    const view = <T extends object>(get: () => T): T => new Proxy({} as T, { get: (_o, k) => (get() as Record<string | symbol, unknown>)[k], set: (_o, k, v) => { (get() as Record<string | symbol, unknown>)[k] = v; return true; } });
    const t = view(() => s.develop.tone), dt = view(() => s.develop.detail);
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
      ['Vignette', -100, 100, 1, () => t.vignette, (v) => { t.vignette = v; }],
      ['Vignette midpoint', 0, 100, 1, () => (D().vignette ??defaultVignetteShape()).midpoint, (v) => { (D().vignette ??=defaultVignetteShape()).midpoint = v; }],
      ['Vignette feather', 1, 100, 1, () => (D().vignette ??defaultVignetteShape()).feather, (v) => { (D().vignette ??=defaultVignetteShape()).feather = v; }],
      ['Vignette roundness', 0, 100, 1, () => (D().vignette ??defaultVignetteShape()).roundness, (v) => { (D().vignette ??=defaultVignetteShape()).roundness = v; }],
      ['Grain', 0, 100, 1, () => t.grain, (v) => { t.grain = v; }],
      'Detail',
      ['Clarity', -100, 100, 1, () => dt.clarity, (v) => { dt.clarity = v; }],
      ['Texture', -100, 100, 1, () => dt.texture, (v) => { dt.texture = v; }],
      ['Sharpening', 0, 100, 1, () => dt.sharpen, (v) => { dt.sharpen = v; }],
      ['Sharpen radius (px)', 1, 3, 0.1, () => dt.sharpenRadius ?? 1.2, (v) => { dt.sharpenRadius = v; }],
      ['Sharpen detail', 0, 100, 1, () => dt.sharpenDetail ?? 100, (v) => { dt.sharpenDetail = v; }],
      ['Sharpen masking', 0, 100, 1, () => dt.sharpenMasking ?? 0, (v) => { dt.sharpenMasking = v; }],
      'Noise Reduction',
      ['Luminance', 0, 100, 1, () => (D().noise ??defaultNoise()).luminance, (v) => { (D().noise ??=defaultNoise()).luminance = v; }],
      ['Luminance detail', 0, 100, 1, () => (D().noise ??defaultNoise()).detail, (v) => { (D().noise ??=defaultNoise()).detail = v; }],
      ['Luminance contrast', 0, 100, 1, () => (D().noise ??defaultNoise()).contrast, (v) => { (D().noise ??=defaultNoise()).contrast = v; }],
      ['Noise colour', 0, 100, 1, () => (D().noise ??defaultNoise()).color, (v) => { (D().noise ??=defaultNoise()).color = v; }],
    ];
    const devNodes: HTMLElement[] = [this.profileRow.el], devSync: Array<() => void> = [];
    let dehazeEl: HTMLElement | null = null, tintEl: HTMLElement | null = null;
    let wbCustom = (): void => undefined;
    for (const row of devRows) {
      if (typeof row === 'string') { devNodes.push(el(`<p class="cv-note">${row}</p>`)); continue; }
      const [label, min, max, step, read, write] = row;
      const r = sliderRow(label, min, max, step, (v) => { write(v); if (label === 'Temperature' || label === 'Tint') wbCustom(); this.schedule(); });
      devNodes.push(r.el);
      if (label === 'Dehaze') dehazeEl = r.el;
      if (label === 'Tint') tintEl = r.el;
      devSync.push(() => r.set(read()));
    }
    // Camera Raw's further panels (the comparison's Develop row). The engine already had the point curve and colour
    // mixer; this dialog did not show them. Every control reads s.develop when used, so loaded settings are what is edited.
    const D = (): DevelopState => s.develop;
    const darkDehaze = checkRow('Dehaze by dark channel (positive Dehaze)', (v) => { D().dehazeDark = v; this.schedule(); });
    devNodes.splice(dehazeEl ? devNodes.indexOf(dehazeEl) + 1 : devNodes.length, 0, darkDehaze.el);
    devSync.push(() => darkDehaze.set(D().dehazeDark === true));
    // Settings files (.xmp): the Develop state written to one, or read back from one into the controls.
    const settingsRow = el<HTMLElement>('<div style="display:flex;gap:6px"><button class="cv-btn" type="button">Load Settings...</button><button class="cv-btn" type="button">Save Settings...</button></div>');
    const [loadBtn, saveBtn] = Array.from(settingsRow.querySelectorAll('button'));
    loadBtn!.addEventListener('click', () => {
      const pick = document.createElement('input');
      pick.type = 'file'; pick.accept = '.xmp,application/rdf+xml,text/xml';
      pick.addEventListener('change', () => {
        const file = pick.files?.[0];
        if (!file) return;
        void file.text().then((text) => { s.develop = developFromXmp(text); for (const f of devSync) f(); this.schedule(); }).catch((err: unknown) => toast(err instanceof Error ? err.message : 'The settings could not be read.', 'error'));
      });
      pick.click();
    });
    saveBtn!.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([crsXmp(D())], { type: 'application/rdf+xml' }));
      a.download = 'Camera Raw Settings.xmp';
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    devNodes.splice(1, 0, settingsRow);
    // White balance: As Shot clears Temperature and Tint, Auto takes the picture's mean colour as the neutral, and the
    // eyedropper (where the window has one) reads a neutral off the screen; a moved slider makes the choice Custom.
    const setWb = (temperature: number, tint: number): void => { D().tone.temperature = temperature; D().tone.tint = tint; for (const f of devSync) f(); };
    const wbSel = selectRow('White balance', [['shot', 'As Shot'], ['auto', 'Auto'], ['custom', 'Custom']], (v) => {
      if (v === 'shot') setWb(0, 0);
      else if (v === 'auto') { const img = this.engine.targetImage(); if (img) { const w = autoWhiteBalance(img.image); setWb(w.temperature, w.tint); } }
      wbSel.set(v);
      this.schedule(0);
    });
    wbCustom = () => wbSel.set('custom');
    const Eye = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
    const wbPick = el<HTMLButtonElement>('<button class="cv-btn" type="button">White balance eyedropper</button>');
    if (!Eye) { wbPick.disabled = true; wbPick.title = 'This window cannot read a colour from the screen.'; }
    wbPick.addEventListener('click', () => {
      if (!Eye) return;
      void new Eye().open().then(({ sRGBHex }) => {
        const n = parseInt(sRGBHex.slice(1), 16), w = whiteBalanceFor((n >> 16) & 255, (n >> 8) & 255, n & 255), t = D().tone;
        setWb(Math.max(-100, Math.min(100, t.temperature + w.temperature)), Math.max(-100, Math.min(100, t.tint + w.tint)));
        wbSel.set('custom');
        this.schedule(0);
      }).catch(() => undefined);
    });
    devNodes.splice(tintEl ? devNodes.indexOf(tintEl) + 1 : devNodes.length, 0, wbSel.el, wbPick);
    devSync.push(() => { const tn = D().tone; if (tn.temperature !== 0 || tn.tint !== 0) { if (wbSel.el.querySelector('select')?.value === 'shot') wbSel.set('custom'); } else wbSel.set('shot'); });
    const slide =(label: string, min: number, max: number, step: number, read: () => number, write: (v: number) => void): void => {
      const r = sliderRow(label, min, max, step, (v) => { write(v); this.schedule(); });
      devNodes.push(r.el);
      devSync.push(() => r.set(read()));
    };
    let curveCh: CurveChannel = 'rgb';
    const graph = curveGraph({ points: () => D().curves[curveCh], table: (p) => buildCurveLut(p), changed: () => this.schedule() });
    const curveSel = selectRow('Channel', [['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], (v) => { curveCh = v as CurveChannel; graph.draw(); });
    const CURVE_PRESETS: Record<string, CurvePoint[]> = {
      linear: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      medium: [{ x: 0, y: 0 }, { x: 64, y: 54 }, { x: 192, y: 202 }, { x: 255, y: 255 }],
      strong: [{ x: 0, y: 0 }, { x: 64, y: 42 }, { x: 192, y: 214 }, { x: 255, y: 255 }],
    };
    const presetSel = selectRow('Preset', [['', 'Custom'], ['linear', 'Linear'], ['medium', 'Medium Contrast'], ['strong', 'Strong Contrast']], (v) => {
      const pts = CURVE_PRESETS[v];
      if (!pts) return;
      D().curves[curveCh] = pts.map((q) => ({ ...q }));
      presetSel.set('');
      graph.draw();
      this.schedule();
    });
    devNodes.push(el('<p class="cv-note">Point Curve</p>'), curveSel.el, presetSel.el, graph.el);
    devSync.push(() => { curveSel.set(curveCh); presetSel.set(''); graph.draw(); });
    const para = (): ParametricState => (D().parametric ??= defaultParametric());
    devNodes.push(el('<p class="cv-note">Parametric Curve</p>'));
    for (const [label, key] of [['Highlights', 'highlights'], ['Lights', 'lights'], ['Darks', 'darks'], ['Shadows', 'shadows']] as const) slide(`Curve ${label}`, -100, 100, 1, () => para()[key], (v) => { para()[key] = v; });
    slide('Split Shadows/Darks', 5, 90, 1, () => para().split1, (v) => { para().split1 = v; });
    slide('Split Darks/Lights', 10, 95, 1, () => para().split2, (v) => { para().split2 = v; });
    slide('Split Lights/Highlights', 15, 98, 1, () => para().split3, (v) => { para().split3 = v; });
    let band: 'master' | HslBand = 'master';
    const bandState = (): HslBandState => (band === 'master' ? D().color.master : (D().color.bands[band] ??= bandOf(D().color, band)));
    const mixH = sliderRow('Hue', -180, 180, 1, (v) => { bandState().h = v; this.schedule(); });
    const mixS = sliderRow('Saturation', -100, 100, 1, (v) => { bandState().s = v; this.schedule(); });
    const mixL = sliderRow('Luminance', -100, 100, 1, (v) => { bandState().l = v; this.schedule(); });
    const syncMix = (): void => { mixH.set(bandState().h); mixS.set(bandState().s); mixL.set(bandState().l); };
    const BAND_NAME: Record<HslBand, string> = { reds: 'Reds', oranges: 'Oranges', yellows: 'Yellows', greens: 'Greens', cyans: 'Aquas', blues: 'Blues', purples: 'Purples', magentas: 'Magentas' };
    const BAND_HUE: Record<HslBand, number> = { reds: 0, oranges: 30, yellows: 60, greens: 120, cyans: 180, blues: 240, purples: 270, magentas: 300 };
    const swatchRow = el('<div class="cv-field" role="group" aria-label="Colours" style="display:flex;flex-wrap:wrap;gap:6px"></div>');
    const swatches = new Map<string, HTMLButtonElement>();
    for (const b of ['master', ...HSL_BANDS] as const) {
      const sw = el<HTMLButtonElement>(`<button class="cv-btn" type="button" aria-pressed="false" title="${b === 'master' ? 'All colours' : BAND_NAME[b]}" aria-label="${b === 'master' ? 'All colours' : BAND_NAME[b]}" style="width:24px;height:24px;padding:0;border-radius:50%;background:${b === 'master' ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : `hsl(${BAND_HUE[b]} 80% 50%)`}"></button>`);
      sw.addEventListener('click', () => { band = b; setBandSwatch(); syncMix(); });
      swatches.set(b, sw);
      swatchRow.append(sw);
    }
    const setBandSwatch = (): void => { for (const [k, sw] of swatches) { sw.setAttribute('aria-pressed', String(k === band)); sw.style.outline = k === band ? '2px solid var(--accent)' : 'none'; sw.style.outlineOffset = '1px'; } };
    devNodes.push(el('<p class="cv-note">Colour Mixer</p>'), swatchRow, mixH.el, mixS.el, mixL.el);
    devSync.push(() => { setBandSwatch(); syncMix(); });
    let range: 'shadows' | 'midtones' | 'highlights' | 'global' = 'midtones';
    const grading = (): GradingState => (D().grading ??= defaultGrading());
    const gH = sliderRow('Hue', 0, 360, 1, (v) => { grading()[range].h = v; placeDot(); this.schedule(); });
    const gS = sliderRow('Saturation', 0, 100, 1, (v) => { grading()[range].s = v; placeDot(); this.schedule(); });
    const gL = sliderRow('Luminance', -100, 100, 1, (v) => { grading()[range].l = v; this.schedule(); });
    // The colour wheel: hue is the angle and saturation the distance from the centre. Painted once; the marker moves in place.
    const WHEEL = 96, wheelBox = el(`<div style="position:relative;width:${WHEEL}px;height:${WHEEL}px;margin:6px auto"></div>`);
    const wheel = el<HTMLCanvasElement>(`<canvas width="${WHEEL}" height="${WHEEL}" aria-label="Colour grading wheel" style="display:block;touch-action:none;cursor:crosshair;border-radius:50%"></canvas>`);
    const dot = el('<span style="position:absolute;width:10px;height:10px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000;pointer-events:none;transform:translate(-50%,-50%)"></span>');
    wheelBox.append(wheel, dot);
    const wctx = wheel.getContext('2d');
    if (wctx) {
      const disc = wctx.createImageData(WHEEL, WHEEL), R = WHEEL / 2;
      for (let y = 0; y < WHEEL; y++) for (let x = 0; x < WHEEL; x++) {
        const dx = x + 0.5 - R, dy = y + 0.5 - R, dist = Math.hypot(dx, dy), i = (y * WHEEL + x) * 4;
        if (dist > R) continue;
        const [r, g, b] = hslToRgb((Math.atan2(dy, dx) * 180) / Math.PI, dist / R, 0.5);
        disc.data[i] = r; disc.data[i + 1] = g; disc.data[i + 2] = b; disc.data[i + 3] = 255;
      }
      wctx.putImageData(disc, 0, 0);
    }
    const placeDot = (): void => {
      const w = grading()[range], a = (w.h * Math.PI) / 180, d = (w.s / 100) * (WHEEL / 2);
      dot.style.left = `${WHEEL / 2 + Math.cos(a) * d}px`; dot.style.top = `${WHEEL / 2 + Math.sin(a) * d}px`;
    };
    const fromWheel = (e: PointerEvent): void => {
      const box = wheel.getBoundingClientRect(), dx = e.clientX - box.left - box.width / 2, dy = e.clientY - box.top - box.height / 2;
      const w = grading()[range];
      w.h = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360);
      w.s = Math.round(Math.min(1, Math.hypot(dx, dy) / (box.width / 2)) * 100);
      syncWheel();
      this.schedule();
    };
    wheel.addEventListener('pointerdown', (e) => { wheel.setPointerCapture(e.pointerId); fromWheel(e); });
    wheel.addEventListener('pointermove', (e) => { if (wheel.hasPointerCapture(e.pointerId)) fromWheel(e); });
    const syncWheel = (): void => { gH.set(grading()[range].h); gS.set(grading()[range].s); gL.set(grading()[range].l ?? 0); placeDot(); };
    const rangeSel = selectRow('Range', [['shadows', 'Shadows'], ['midtones', 'Midtones'], ['highlights', 'Highlights'], ['global', 'Global']], (v) => { range = v as typeof range; syncWheel(); });
    devNodes.push(el('<p class="cv-note">Colour Grading</p>'), rangeSel.el, wheelBox, gH.el, gS.el, gL.el);
    devSync.push(() => { rangeSel.set(range); syncWheel(); });
    slide('Blending', 0, 100, 1, () => grading().blending, (v) => { grading().blending = v; });
    slide('Balance', -100, 100, 1, () => grading().balance, (v) => { grading().balance = v; });
    const optics = (): OpticsState => (D().optics ??= defaultOptics()), geometry = (): GeometryState => (D().geometry ??= defaultGeometry());
    const calib = (): CalibrationState => (D().calibration ??= defaultCalibration());
    devNodes.push(el('<p class="cv-note">Optics</p>'));
    slide('Distortion', -100, 100, 1, () => optics().distortion, (v) => { optics().distortion = v; });
    slide('Chromatic Aberration', -100, 100, 1, () => optics().chromatic, (v) => { optics().chromatic = v; });
    const removeCA = checkRow('Remove Chromatic Aberration', (v) => { optics().removeCA = v; this.schedule(); });
    devNodes.push(removeCA.el);
    devSync.push(() => removeCA.set(optics().removeCA === true));
    slide('Vignetting', -100, 100, 1, () => optics().vignetting, (v) => { optics().vignetting = v; });
    slide('Midpoint', 0, 100, 1, () => optics().midpoint, (v) => { optics().midpoint = v; });
    slide('Vignette feather', 0, 100, 1, () => optics().feather ?? 50, (v) => { optics().feather = v; });
    slide('Vignette roundness', 0, 100, 1, () => optics().roundness ?? 100, (v) => { optics().roundness = v; });
    slide('Defringe', 0, 100, 1, () => optics().defringe ?? 0, (v) => { optics().defringe = v; });
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
    const point = (): PointColorState => (D().pointColor ??= defaultPointColor());
    const pointPick = colorRow('Colour', (v) => { point().color = v; this.schedule(); });
    devNodes.push(el('<p class="cv-note">Point Color</p>'), pointPick.el);
    devSync.push(() => pointPick.set(/^#[0-9a-f]{6}$/i.test(point().color) ? point().color : '#ff0000'));
    slide('Point Range', 0, 100, 1, () => point().range, (v) => { point().range = v; });
    slide('Point Hue', -100, 100, 1, () => point().h, (v) => { point().h = v; });
    slide('Point Saturation', -100, 100, 1, () => point().s, (v) => { point().s = v; });
    slide('Point Luminance', -100, 100, 1, () => point().l, (v) => { point().l = v; });
    // Each panel heading folds its controls away and carries a Reset that returns just that panel to its defaults.
    const toneKeys = (keys: Array<keyof DevelopState['tone']>) => (): void => { for (const k of keys) D().tone[k] = defaultDevelopState().tone[k]; };
    const resets: Record<string, () => void> = {
      Light: toneKeys(['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks']), Colour: toneKeys(['temperature', 'tint', 'vibrance', 'saturation']),
      Effects: () => { toneKeys(['dehaze', 'vignette', 'grain'])(); D().vignette = defaultVignetteShape(); }, Detail: () => { D().detail = defaultDevelopState().detail; }, 'Noise Reduction': () => { D().noise = defaultNoise(); }, 'Point Curve': () => { D().curves = defaultDevelopState().curves; },
      'Parametric Curve': () => { D().parametric = defaultParametric(); }, 'Colour Mixer': () => { D().color = defaultDevelopState().color; }, 'Colour Grading': () => { D().grading = defaultGrading(); },
      'Point Color': () => { D().pointColor = defaultPointColor(); }, Optics: () => { D().optics = defaultOptics(); }, Geometry: () => { D().geometry = defaultGeometry(); }, Calibration: () => { D().calibration = defaultCalibration(); },
    };
    let folds: HTMLElement[] = [];
    for (const node of devNodes) {
      const reset = node.tagName === 'P' ? resets[node.textContent ?? ''] : undefined;
      if (!reset) { if (node.tagName === 'P' || !folds) continue; folds.push(node); continue; }
      const group = (folds = []);
      const title = node.textContent ?? '', open = el<HTMLButtonElement>(`<button class="cv-btn" type="button" aria-expanded="true">${title}</button>`);
      const clear = el<HTMLButtonElement>(`<button class="cv-btn" type="button" aria-label="Reset ${title}">Reset</button>`);
      node.textContent = '';
      node.classList.add('cv-develop-head');
      node.style.cssText = 'display:flex;gap:6px;margin-top:10px';
      node.append(open, clear);
      open.addEventListener('click', () => { const hide = open.getAttribute('aria-expanded') === 'true'; open.setAttribute('aria-expanded', String(!hide)); for (const g of group) setHidden(g, hide); });
      clear.addEventListener('click', () => { reset(); for (const f of devSync) f(); this.schedule(); });
    }
    this.section('develop', devNodes, () => { for (const f of devSync) f(); });
    this.previewRow = checkRow('Preview', (v) => { this.preview = v; this.schedule(0); });
    this.body.append(this.previewRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => this.commit());
    this.onClose = () => this.abandon();
  }

  private section(kind: FilterKind, nodes: HTMLElement[], sync: () => void): void {
    const node = el('<div class="cv-panel-section"></div>');
    node.append(...nodes);
    setHidden(node, true);
    this.body.append(node);
    if (kind === 'develop') node.prepend(this.scopes.el);   // Develop's scopes (1.53.4)
    this.sections.set(kind, { node, sync });
  }

  private libRow(p: LibParam, put: (key: string, v: LibValue) => void): { el: HTMLElement; set: (v: LibValue) => void } {
    if (p.kind === 'range') { const r = sliderRow(p.label, p.min, p.max, p.step, (v) => put(p.key, v), { max: p.limit ?? p.max }); return { el: r.el, set: (v) => r.set(v as number) }; }
    if (p.kind === 'select') {
      // Hovering a choice previews it on the picture; closing the menu puts back the chosen value (or keeps a new choice).
      let chosen = String(p.def);
      const r = selectRow(p.label, p.options, (v) => { chosen = v; put(p.key, v); }, (v) => put(p.key, v ?? chosen));
      return { el: r.el, set: (v) => { chosen = v as string; r.set(v as string); } };
    }
    if (p.kind === 'check') { const r = checkRow(p.label, (v) => put(p.key, v)); return { el: r.el, set: (v) => r.set(v as boolean) }; }
    if (p.kind === 'seed') {
      const node = el('<div class="cv-field"><span></span><button class="cv-btn" type="button">Randomize</button></div>');
      setText(q(node, 'span'), p.label);
      q(node, 'button').addEventListener('click', () => put(p.key, randomSeed()));
      return { el: node, set: () => undefined };
    }
    if (p.kind === 'image') return this.imageRow(p.label, (v) => put(p.key, v));
    if (p.kind === 'path') return this.pathRow(p.label, (v) => put(p.key, v));
    if (p.kind === 'color') { const r = colorRow(p.label, (v) => put(p.key, v)); return { el: r.el, set: (v) => r.set(v as string) }; }
    if (p.kind === 'effects') { const g = new GalleryView(this.engine, () => this.s.colors, (v) => put(p.key, v)); return { el: g.el, set: (v) => g.set(v) }; }
    const r = matrixRow(p.label, p.size, p.min, p.max, (v) => put(p.key, v));
    return { el: r.el, set: (v) => r.set(v as number[]) };
  }

  private imageRow(label: string, put: (v: LibImage | null) => void): { el: HTMLElement; set: (v: LibValue) => void } {
    const node = el('<label class="cv-field"><span></span><select class="cv-input"></select></label>'), sel = q<HTMLSelectElement>(node, 'select');
    setText(q(node, 'span'), label);
    let kept: LibImage | null = null;
    const fill = (): void => {
      const docs = this.engine.projects.map((p) => [p.id, p.name] as const);
      const opts: Array<readonly [string, string]> = [['', 'Choose an open document'], ...(kept && !docs.some(([, n]) => n === kept?.name) ? [['kept', `${kept.name} (as chosen)`] as const] : []), ...docs];
      while (sel.options.length > opts.length) sel.remove(sel.options.length - 1);
      opts.forEach(([v, t], i) => {
        let o = sel.options[i];
        if (!o) { o = document.createElement('option'); sel.appendChild(o); }
        if (o.value !== v) o.value = v;
        if (o.textContent !== t) o.textContent = t;
      });
    };
    sel.addEventListener('change', () => {
      if (sel.value === 'kept') return;
      kept = sel.value ? this.engine.mapImage(sel.value) : null;
      put(kept);
    });
    return { el: node, set: (v) => {
      kept = v && typeof v === 'object' && !Array.isArray(v) && 'rg' in v ? v : null;
      fill();
      const match = kept ? this.engine.projects.find((p) => p.name === kept?.name) : null;
      setValue(sel, kept ? (match ? match.id : 'kept') : '');
    } };
  }

  private pathRow(label: string, put: (v: LibPath | null) => void): { el: HTMLElement; set: (v: LibValue) => void } {
    const node = el('<label class="cv-field"><span></span><select class="cv-input"></select></label>'), sel = q<HTMLSelectElement>(node, 'select');
    setText(q(node, 'span'), label);
    let kept: LibPath | null = null;
    const usable = (): Array<readonly [string, string]> => this.engine.paths.list.filter((n) => !n.shape && n.path.subpaths.some((sp) => sp.anchors.length > 0)).map((n) => [n.id, n.name] as const);
    const fill = (): void => {
      const paths = usable(), opts: Array<readonly [string, string]> = [['', 'None: an arc low in the picture'], ...(kept && !paths.some(([, n]) => n === kept?.name) ? [['kept', `${kept.name} (as chosen)`] as const] : []), ...paths];
      while (sel.options.length > opts.length) sel.remove(sel.options.length - 1);
      opts.forEach(([v, t], i) => {
        let o = sel.options[i];
        if (!o) { o = document.createElement('option'); sel.appendChild(o); }
        if (o.value !== v) o.value = v;
        if (o.textContent !== t) o.textContent = t;
      });
    };
    sel.addEventListener('change', () => {
      if (sel.value === 'kept') return;
      kept = sel.value ? this.engine.pathLines(sel.value) : null;
      put(kept);
    });
    return { el: node, set: (v) => {
      kept = v && typeof v === 'object' && !Array.isArray(v) && 'lines' in v ? v : null;
      fill();
      const match = kept ? usable().find(([, n]) => n === kept?.name) : null;
      setValue(sel, kept ? (match ? match[0] : 'kept') : '');
    } };
  }

  private libSection(kind: LibKind): void {
    const f = libFilter(kind), s = this.s;
    const values = (): LibValues => { const lib = (s.lib ??= {}); return (lib[kind] ??= libValues(kind, undefined)); };
    const rows = f.params.map((p) => this.libRow(p, (key, v) => { values()[key] = v; this.schedule(); }));
    const node = el('<div class="cv-panel-section" hidden></div>');
    node.append(...rows.map((r) => r.el));
    if (f.note) { const note = el('<p class="cv-note"></p>'); note.textContent = f.note; node.appendChild(note); }
    this.body.insertBefore(node, this.previewRow.el);
    this.sections.set(kind, { node, sync: () => { const v = libValues(kind, s.lib?.[kind]); (s.lib ??= {})[kind] = v; f.params.forEach((p, i) => rows[i].set(v[p.key])); } });
  }

  private settingsOf(kind: FilterKind): Record<string, unknown> {
    const { lib, ...rest } = structuredClone(this.s);
    return isLibKind(kind) ? { ...rest, lib: { [kind]: libValues(kind, lib?.[kind]) } } : rest;
  }

  /** What OK last applied for `kind`, as the settings that differ from the defaults, kept in the preferences. */
  private keepSettings(kind: FilterKind, settings: Record<string, unknown>): void {
    const base = defaultFilterSettings() as Record<string, unknown>, out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(settings)) {
      if (k === 'seed' || k === 'colors' || k === 'lib') continue;
      if (JSON.stringify(v) !== JSON.stringify(base[k])) out[k] = v;
    }
    const lib = (settings.lib as Record<string, unknown> | undefined)?.[kind];
    if (lib && typeof lib === 'object') out.lib = { [kind]: lib };
    const text = JSON.stringify(out);
    if (text.length <= 1900) remembered('Filters', kind, text);
  }

  private recallSettings(kind: FilterKind): void {
    const saved = recalled('Filters', kind);
    if (typeof saved !== 'string') return;
    try {
      const got = JSON.parse(saved) as Record<string, unknown>, base = defaultFilterSettings() as Record<string, unknown>;
      for (const [k, v] of Object.entries(got)) {
        if (k === 'lib') {
          if (!isLibKind(kind)) continue;
          const l = (v as Record<string, unknown> | null)?.[kind];
          if (l && typeof l === 'object') (this.s.lib ??= {})[kind] = libValues(kind, l as never);
          continue;
        }
        if (k in base && typeof v === typeof base[k]) (this.s as Record<string, unknown>)[k] = v;
      }
    } catch { /* the defaults stand */ }
  }

  show(kind: FilterKind): void {
    if (this.isOpen) return;
    const al = this.engine.current?.activeLayer;
    if (al?.vector && !(this.engine.current?.maskTarget && al.mask)) { toast('This is a shape layer. Rasterize it (Layer > Rasterize Layer) to filter its pixels.'); return; }
    const smart = this.smartTarget();
    if (isLibKind(kind) && libFilter(kind).fills) this.engine.givePixels();
    if (!smart && !this.engine.targetImage()) { toast('Select a layer with pixels first.'); return; }
    this.kind = kind;
    this.done = false;
    this.seed = randomSeed();
    this.s.colors = this.swatches();
    this.recallSettings(kind);
    this.setTitle(FILTER_LABELS[kind]);
    const lib = isLibKind(kind) ? libFilter(kind) : null;
    q<HTMLElement>(this.scrim, '.cv-dialog').style.setProperty('--cv-dialog-w', `${lib?.width ?? 440}px`);
    setHidden(this.previewRow.el, !!lib?.ownPreview);
    if (kind === 'shakeReduction' && !smart) this.estimateShake(false);
    if (isLibKind(kind) && !this.sections.has(kind)) this.libSection(kind);
    if (isLibKind(kind)) for (const key of libPathParams(kind)) ((this.s.lib ??= {})[kind] ??= libValues(kind, undefined))[key] = this.engine.pathLines();
    for (const [k, sec] of this.sections) setHidden(sec.node, k !== kind);
    this.sections.get(kind)?.sync();
    this.previewRow.set(this.preview && !smart);
    setDisabled(q<HTMLInputElement>(this.previewRow.el, 'input'), smart);
    if (kind === 'develop') for (const i of this.profileRow.el.querySelectorAll('select')) i.disabled = true;
    this.open(this.okBtn);
    this.schedule(0);
    if (kind === 'develop') void this.fillProfiles();
  }

  /** The Profile row keeps its place: disabled with "Default" until the app names the camera profiles for a RAW layer. */
  private async fillProfiles(): Promise<void> {
    const n = ++this.profileSeq, hook = this.rawProfile;
    const got = hook ? await hook.options().catch(() => null) : null;
    if (n !== this.profileSeq || !this.isOpen) return;
    const sel = this.profileRow.el.querySelector('select') as HTMLSelectElement;
    const want: ReadonlyArray<readonly [string, string]> = got ? got.list : [['none', 'Default']];
    while (sel.options.length > want.length) sel.remove(sel.options.length - 1);
    want.forEach(([v, t], i) => { const o = sel.options[i] ?? sel.appendChild(document.createElement('option')); if (o.value !== v) o.value = v; if (o.textContent !== t) o.textContent = t; });
    this.profileRow.set(got?.current ?? 'none');
    sel.disabled = !got || got.list.length < 2;
  }

  private async chooseProfile(id: string): Promise<void> {
    const hook = this.rawProfile;
    if (!hook) return;
    this.engine.setPreview(null);
    const ok = await hook.choose(id);
    await this.fillProfiles();
    if (ok) this.schedule(0);
  }

  private readonly shakeNote = el('<p class="cv-note"></p>');

  /** Shake Reduction's trace estimated from the target image (estimateShake), the sliders updated. */
  private estimateShake(refresh = true): void {
    const t = this.engine.targetImage();
    if (!t) return;
    const e = estimateShake(t.image);
    this.s.shake.angle = e.angle;
    this.s.shake.length = e.length;
    this.shakeNote.textContent = `Estimated a straight ${e.length} px trace at ${e.angle}\u00b0${e.confidence < 0.15 ? ' (weak: the image may not be shaken)' : ''}. The estimate is a straight trace; curved shake is not found.`;
    if (refresh) { this.sections.get('shakeReduction')?.sync(); this.schedule(0); }
  }

  private run(src: ImageData, scale: number, frame?: LibFrame): ImageData { return runFilter(this.kind, this.s, this.seed, src, scale, frame); }

  private swatches(): LibColors {
    const { fg, bg } = this.engine;
    return { fg: [fg.r, fg.g, fg.b], bg: [bg.r, bg.g, bg.b] };
  }

  private completed(kind: FilterKind, settings: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...settings, colors: settings.colors ?? this.swatches() };
    if (!isLibKind(kind)) return out;
    const lib = settings.lib && typeof settings.lib === 'object' ? (settings.lib as Record<string, Record<string, unknown> | undefined>) : {}, values = { ...(lib[kind] ?? {}) };
    for (const key of libImageParams(kind)) {
      const v = values[key];
      if (typeof v !== 'string') continue;
      const doc = this.engine.projects.find((p) => p.name === v || p.id === v);
      values[key] = doc ? this.engine.mapImage(doc.id) : null;
    }
    for (const key of libPathParams(kind)) {
      const v = values[key];
      if (v === undefined) values[key] = this.engine.pathLines();
      else if (typeof v === 'string') values[key] = this.engine.pathLines(v) ?? v;
    }
    return { ...out, lib: { ...lib, [kind]: values } };
  }

  private grow(): number { return filterMargin(this.kind, this.s); }

  private schedule(delay = 140): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.isOpen) return;
      // Develop's scopes follow the developed preview (1.53.4).
      const scoped = (out: ImageData | Promise<ImageData>): ImageData | Promise<ImageData> => { if (this.kind === 'develop') void Promise.resolve(out).then((img) => this.scopes.draw(img)).catch(() => undefined); return out; };
      if (this.preview && !this.smartTarget() && !(isLibKind(this.kind) && libFilter(this.kind).ownPreview)) this.engine.previewImageEdit((src, scale, frame) => scoped(runFilterOffThread(this.kind, this.s, scale, this.seed, src, frame) ?? this.run(src, scale, frame)), this.grow());
      else this.engine.setPreview(null);
    }, delay);
  }

  /** Called when the dialog applies a filter, with its kind and settings, for Actions to record it. */
  onApplied: ((kind: FilterKind, settings: Record<string, unknown>) => void) | null = null;

  private last: { kind: FilterKind; settings: Record<string, unknown> } | null = null;

  get lastFilter(): FilterKind | null { return this.last?.kind ?? null; }

  applyLast(): Promise<boolean> | boolean {
    const l = this.last;
    return l ? this.applySettings(l.kind, { ...structuredClone(l.settings), seed: randomSeed() }) : false;
  }

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

    private async applyInBackground(kind: FilterKind, settings: Record<string, unknown>): Promise<boolean> {
    if (this.deepFilter(kind, settings)) { this.engine.setPreview(null); this.close(); return Promise.resolve(true); }   // 16 bits (1.53.7)
    if (this.missingImage(kind, settings)) return false;
    const s = { ...defaultFilterSettings(), ...(structuredClone(settings) as Partial<FilterPanelSettings>) }, seed = typeof settings.seed === 'number' ? settings.seed : this.seed;
    const sync = (src: ImageData, scale: number, frame?: LibFrame): ImageData => runFilter(kind, s, seed, src, scale, frame);
    const apron = bandApron(kind, s);   // a large layer in bands (1.60.9)
    if (apron !== null && this.engine.activeTiled()) {   // a giant layer: in place, its undo on disk (1.62.7)
      const r = await this.engine.bandedFilterTiled(FILTER_LABELS[kind], (src, frame) => sync(src, 1, frame), apron);
      if (r === true) { this.engine.setPreview(null); this.close(); }
      return r === true;
    }
    if (apron !== null) await this.engine.relieveFor(this.engine.layerBytes() * 1.25);   // undo to disk first if it would not fit (1.61.4)
    const pooled = apron !== null ? this.engine.bandedFilterPool(FILTER_LABELS[kind], { kind, settings: s, seed }, (src, frame) => sync(src, 1, frame), apron, filterMargin(kind, s)) : false;   // the bands on the worker pool (36.18)
    if (pooled === 'refused') return false;
    if (pooled) { const done = await pooled; if (done === true) { this.engine.setPreview(null); this.close(); } return done === true; }
    const banded = apron !== null ? this.engine.bandedFilter(FILTER_LABELS[kind], (src, frame) => sync(src, 1, frame), apron, filterMargin(kind, s)) : false;
    if (banded === 'refused') return Promise.resolve(false);   // not done, and said why
    if (banded) { this.engine.setPreview(null); this.close(); return Promise.resolve(true); }
    return this.engine.applyImageEditAsync(FILTER_LABELS[kind], (src, scale, frame) => runFilterOffThread(kind, s, scale, seed, src, frame) ?? Promise.resolve(sync(src, scale, frame)), filterMargin(kind, s), sync, filterPeak(kind) + 2);
  }

  private missingImage(kind: FilterKind, settings: Record<string, unknown>): boolean {
    if (!isLibKind(kind)) return false;
    const values = libValues(kind, (settings.lib as Record<string, unknown> | undefined)?.[kind]), gap = libFilter(kind).params.find((p) => p.kind === 'image' && !values[p.key]), why = libFilter(kind).invalid?.(values);
    if (why) { this.engine.notice(why); return true; }
    if (gap) this.engine.notice(`${FILTER_LABELS[kind]} needs its ${gap.label.toLowerCase()}: choose an open document.`);
    const raw = (settings.lib as Record<string, Record<string, unknown> | undefined> | undefined)?.[kind], named = gap ? undefined : libPathParams(kind).find((k) => typeof raw?.[k] === 'string');
    if (named) this.engine.notice(`${FILTER_LABELS[kind]}: this document has no path named "${String(raw?.[named])}".`);
    return !!gap || !!named;
  }

  applySettings(kind: FilterKind, given: Record<string, unknown>): Promise<boolean> | boolean {
    if (!(kind in FILTER_LABELS)) return false;
    if (isLibKind(kind) && libFilter(kind).fills) this.engine.givePixels();
    const settings = this.completed(kind, given);
    if (this.missingImage(kind, settings)) return false;
    this.last = { kind, settings: structuredClone(settings) };
    if (this.smartTarget()) { this.engine.addSmartFilter(kind, structuredClone(settings)); return true; }
    if (!this.isOpen) return this.applyInBackground(kind, settings);
    this.kind = kind;
    Object.assign(this.s, structuredClone(settings));
    const run = (src: ImageData, scale: number, frame?: LibFrame): ImageData => this.run(src, scale, frame);
    if (this.deepFilter(kind, settings)) return true;   // 16 bits (1.53.7)
    const apron = bandApron(kind, this.s);   // a large layer in bands (1.60.9)
    if (apron !== null && this.engine.activeTiled()) { void this.engine.bandedFilterTiled(FILTER_LABELS[kind], (src, frame) => run(src, 1, frame), apron); return true; }
    const pooled = apron !== null ? this.engine.bandedFilterPool(FILTER_LABELS[kind], { kind, settings: structuredClone(this.s), seed: this.seed }, (src, frame) => run(src, 1, frame), apron, this.grow()) : false;   // the bands on the worker pool (36.18)
    if (pooled === 'refused') return false;
    if (pooled) return pooled;   // a promise: edits wait while it runs
    const banded = apron !== null ? this.engine.bandedFilter(FILTER_LABELS[kind], (src, frame) => run(src, 1, frame), apron, this.grow()) : false;
    if (banded === 'refused') return false;   // not done, and said why
    if (banded) return true;
    this.engine.applyImageEdit(FILTER_LABELS[kind], run, this.grow(), filterPeak(kind));   // its measured peak (1.61.1)
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
    if (this.missingImage(this.kind, this.settingsOf(this.kind))) return;
    this.done = true;
    const kind = this.kind, settings: Record<string, unknown> = { ...this.settingsOf(kind), seed: this.seed }, editing = this.editing;
    this.keepSettings(kind, settings);
    if (this.asking) { const done = this.asking; this.asking = null; this.engine.setPreview(null); this.close(); done(settings); return; }
    if (editing) { this.close(); editing(settings); return; }
    this.last = { kind, settings: structuredClone(settings) };
    this.onApplied?.(this.kind, this.settingsOf(kind));
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

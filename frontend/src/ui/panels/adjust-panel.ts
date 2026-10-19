import {
  ADJUSTMENT_LABELS, COLOR_RANGES, clamp, ctxOf, curvesKernel, defaultAdjustmentData, exposureKernel, grainFromData, grainKernel,
  gradientMapKernel, hexOf, histogram, hsvFromData, hsvKernel, hsvToData, levelsKernel, randomSeed,
  type AdjustmentKind, type ColorRange, type Engine, type HsvSettings, type ID, type Kernel,
} from '../../engine';
import { autoLevels, bandCentered, bandExclude, bandHandles, bandInclude, bandSetHandle, bandWeight, hsvAdjust, hueResponse } from '../../engine/adjust';
import { PARAM_ADJUSTMENTS, PARAM_KINDS, isParamKind, paramKernel, paramValues, parseCube, type ParamKind } from '../../engine/adjust-params';
import { lutFileToCube } from '../../engine/lut-read';
import { Dialog, promptName } from '../dialogs';
import { el, setHidden, setText } from '../dom';
import { toast } from '../toast';
import { checkRow, colorRow, selectRow, sliderRow } from './controls';

type Json = Record<string, unknown>;
type Pt = { x: number; y: number };
interface Section { node: HTMLElement; sync: () => void; reset?: (all: boolean) => void }
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const CHANNELS = ['RGB', 'Red', 'Green', 'Blue'];
const INKS = ['CMYK', 'Cyan', 'Magenta', 'Yellow', 'Black'];
const LABS = ['Lab', 'Lightness', 'a', 'b'];
const ALL_CHANNELS = [...CHANNELS, ...INKS, ...LABS];
/** The mode's channel names (1.54.4; Lab 1.56.6): Levels and Curves index their ranges by position within this list.
 *  Lab's first position (a composite) is never offered; Levels and Curves in Lab have none. */
const channelsOf = (mode: string | undefined): string[] => (mode === 'cmyk' ? INKS : mode === 'lab' ? LABS : CHANNELS);
const showChannels = (row: { el: HTMLElement }, names: string[]): void => { for (const o of row.el.querySelectorAll('option')) o.hidden = !names.includes(o.value) || o.value === 'Lab'; };
const PRESET_STORE = 'formvis.adjustPresets';
const readPresets = (): Record<string, Record<string, Json>> => { try { return obj(JSON.parse(localStorage.getItem(PRESET_STORE) ?? '{}')) as Record<string, Record<string, Json>>; } catch { return {}; } };
const writePresets = (all: Record<string, Record<string, Json>>): void => { try { localStorage.setItem(PRESET_STORE, JSON.stringify(all)); } catch { /* storage is off; the preset lasts for this session only */ } };
const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hexToUnit = (hex: string): Json => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });
const unitToHex = (c: unknown): string => { const o = obj(c); return hexOf({ r: Math.round(num(o.red, 0) * 255), g: Math.round(num(o.green, 0) * 255), b: Math.round(num(o.blue, 0) * 255) }); };

const GRADIENT_PRESETS: ReadonlyArray<{ id: string; label: string; stops: ReadonlyArray<readonly [number, string]> }> = [
  { id: 'cyberpunk', label: 'Cyberpunk', stops: [[0, '#0b0630'], [0.4, '#7a1fa2'], [0.7, '#ff2a9d'], [1, '#19f0ff']] },
  { id: 'sunset', label: 'Sunset', stops: [[0, '#1b0a3c'], [0.35, '#a3195b'], [0.7, '#ff7a2f'], [1, '#ffe29a']] },
  { id: 'tealorange', label: 'Teal and Orange', stops: [[0, '#062a35'], [0.45, '#1f7a8c'], [0.75, '#e8a15a'], [1, '#ffe7c2']] },
  { id: 'sepia', label: 'Sepia', stops: [[0, '#2b1a0e'], [0.6, '#a9825a'], [1, '#fff4dc']] },
  { id: 'infrared', label: 'Infrared', stops: [[0, '#000000'], [0.3, '#2a0a6b'], [0.6, '#e0103a'], [0.85, '#ffd000'], [1, '#ffffff']] },
  { id: 'bwcontrast', label: 'Black and White Contrast', stops: [[0, '#000000'], [0.2, '#000000'], [0.8, '#ffffff'], [1, '#ffffff']] },
];

const PHOTO_FILTERS: ReadonlyArray<readonly [string, string, number, number, number]> = [
  ['warm85', 'Warming Filter (85)', 236, 138, 0], ['warmlba', 'Warming Filter (LBA)', 250, 150, 0], ['warm81', 'Warming Filter (81)', 235, 177, 19],
  ['cool80', 'Cooling Filter (80)', 0, 109, 255], ['coollbb', 'Cooling Filter (LBB)', 0, 93, 255], ['cool82', 'Cooling Filter (82)', 0, 181, 255],
  ['red', 'Red', 234, 26, 26], ['orange', 'Orange', 243, 132, 0], ['yellow', 'Yellow', 249, 227, 28], ['green', 'Green', 25, 201, 25],
  ['cyan', 'Cyan', 29, 203, 234], ['blue', 'Blue', 29, 53, 234], ['violet', 'Violet', 155, 29, 234], ['magenta', 'Magenta', 227, 24, 226],
  ['sepia', 'Sepia', 172, 122, 51], ['deepred', 'Deep Red', 255, 0, 0], ['deepblue', 'Deep Blue', 0, 0, 255], ['deepemerald', 'Deep Emerald', 0, 139, 0],
  ['deepyellow', 'Deep Yellow', 255, 222, 0], ['underwater', 'Underwater', 0, 194, 177],
];

function curveTable(ch: number, points: Pt[]): Uint8ClampedArray {
  const ident = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  const ramp = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) { ramp[i * 4] = i; ramp[i * 4 + 1] = i; ramp[i * 4 + 2] = i; ramp[i * 4 + 3] = 255; }
  curvesKernel({ channels: [0, 1, 2, 3].map((i) => (i === ch ? points : ident)) })(ramp);
  const out = new Uint8ClampedArray(256), c = ch === 0 ? 0 : ch - 1;
  for (let i = 0; i < 256; i++) out[i] = ramp[i * 4 + c];
  return out;
}

export class AdjustPanel extends Dialog {
  private kind: AdjustmentKind = 'levels';
  private mode: 'layer' | 'image' = 'layer';
  private layerId: ID | null = null;
  private data: Json = {};
  private madeLayer = false;
  private asking: ((data: Json | null) => void) | null = null;
  /** Called when the dialog applies an adjustment, for Actions: to the image, or as a layer it just made. */
  onApplied: ((v: { kind: AdjustmentKind; data: Json; layer: boolean; made: boolean }) => void) | null = null;
  private hsv: HsvSettings = hsvFromData({});
  private done = false;
  private frame = 0;
  private bins: Float64Array | null = null;
  private histo: HTMLCanvasElement | null = null;
  private readonly sections = new Map<AdjustmentKind, Section>();
  private readonly okBtn: HTMLButtonElement;
  private readonly presetBar: HTMLElement;
  private readonly presetSel: HTMLSelectElement;
  private readonly previewBox: HTMLInputElement;
  private previewOn = true;
  private original: Json = {};

  constructor(private readonly engine: Engine) {
    super('Adjustment', 480);
    this.sections.set('levels', this.buildLevels());
    this.sections.set('curves', this.buildCurves());
    this.sections.set('hsv', this.buildHsv());
    this.sections.set('exposure', this.buildExposure());
    this.sections.set('gradientMap', this.buildGradientMap());
    this.sections.set('grain', this.buildGrain());
    for (const k of PARAM_KINDS) this.sections.set(k, this.buildParams(k));
    for (const s of this.sections.values()) { s.node.hidden = true; this.body.appendChild(s.node); }
    this.presetBar = el('<div class="cv-preset-row"><select class="cv-input" aria-label="Preset"><option value="">Presets</option></select><button class="cv-btn" type="button">Save</button><button class="cv-btn" type="button">Delete</button></div>');
    this.presetSel = this.presetBar.querySelector('select') as HTMLSelectElement;
    const [saveBtn, delBtn] = Array.from(this.presetBar.querySelectorAll('button'));
    for (const [kind, set] of Object.entries(readPresets())) for (const name of Object.keys(set)) this.presetOption(kind, name);
    this.presetSel.addEventListener('change', () => this.loadPreset());
    saveBtn.addEventListener('click', () => void this.savePreset());
    delBtn.addEventListener('click', () => this.deletePreset());
    this.body.prepend(this.presetBar);
    const resetBtn = this.button('Reset', 'ghost', () => undefined);
    resetBtn.title = 'Reset the current channel or range; hold Shift to reset all';
    resetBtn.classList.add('cv-btn-apart');
    resetBtn.addEventListener('click', (e) => this.reset(e.shiftKey));
    const previewRow = el<HTMLLabelElement>('<label class="cv-adjust-preview"><input type="checkbox" checked><span>Preview</span></label>');
    this.previewBox = previewRow.querySelector('input') as HTMLInputElement;
    this.previewBox.addEventListener('change', () => this.setPreview(this.previewBox.checked));
    this.foot.appendChild(previewRow);
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => this.commit());
    this.onClose = () => this.abandon();
  }

  openForLayer(id: ID, made = false): void {
    const l = this.engine.current?.layer(id);
    if (!l?.adjustment || this.isOpen) return;
    if (!this.engine.beginLive(`Edit ${ADJUSTMENT_LABELS[l.adjustment.kind]}`)) return;
    this.mode = 'layer';
    this.madeLayer = made;
    this.layerId = id;
    this.kind = l.adjustment.kind;
    this.data = structuredClone(l.adjustment.data);
    this.prepare();
    this.open(this.okBtn);
  }

  openForImage(kind: AdjustmentKind): void {
    if (this.isOpen) return;
    if (!this.engine.targetImage()) { toast('Select a layer with pixels first.'); return; }
    this.mode = 'image';
    this.layerId = null;
    this.kind = kind;
    this.data = structuredClone(defaultAdjustmentData(kind));
    this.prepare();
    this.open(this.okBtn);
    this.schedule();
  }

  private prepare(): void {
    this.done = false;
    const d = this.data;
    const lv = obj(d.levels), ranges = Array.isArray(lv.ranges) ? lv.ranges.map(obj) : [];
    while (ranges.length < 4) ranges.push({});
    d.levels = { channel: typeof lv.channel === 'string' ? lv.channel : 'RGB', ranges: ranges.slice(0, 4).map((r) => ({ black: num(r.black, 0), gamma: num(r.gamma, 1), white: num(r.white, 255), outputBlack: num(r.outputBlack, 0), outputWhite: num(r.outputWhite, 255) })) };
    const cv = obj(d.curves), chans = Array.isArray(cv.channels) ? cv.channels : [];
    const pts = (c: unknown): Pt[] => { const a = Array.isArray(c) ? c.map(obj).map((p) => ({ x: num(p.x, 0), y: num(p.y, 0) })) : []; return a.length >= 2 ? a.sort((m, n) => m.x - n.x) : [{ x: 0, y: 0 }, { x: 255, y: 255 }]; };
    d.curves = { channel: typeof cv.channel === 'string' ? cv.channel : 'RGB', channels: [0, 1, 2, 3].map((i) => pts(chans[i])) };
    if (this.kind === 'exposure') { const e = obj(d.exposureSettings); d.exposureSettings = { exposure: num(e.exposure, 0), offset: num(e.offset, 0), gamma: num(e.gamma, 1) }; }
    if (this.kind === 'gradientMap') { const g = obj(d.gradientMapSettings); d.gradientMapSettings = { shadows: g.shadows ?? { red: 0, green: 0, blue: 0 }, highlights: g.highlights ?? { red: 1, green: 1, blue: 1 }, reversed: g.reversed === true, dither: g.dither === true, ...(Array.isArray(g.stops) && g.stops.length >= 2 ? { stops: g.stops, preset: typeof g.preset === 'string' ? g.preset : '' } : {}) }; }
    if (this.kind === 'grain') { const g = grainFromData(d); d.grainSettings = { amount: g.amount, size: g.size, roughness: g.roughness, seed: g.seed, colour: g.colour, speckle: g.speckle, look: g.look }; }
    if (isParamKind(this.kind)) d.params = paramValues(this.kind, d.params);
    this.hsv = hsvFromData(d);
    this.setTitle(this.mode === 'layer' ? `${ADJUSTMENT_LABELS[this.kind]} Layer` : ADJUSTMENT_LABELS[this.kind]);
    for (const [k, s] of this.sections) setHidden(s.node, k !== this.kind);
    this.bins = this.kind === 'levels' || this.kind === 'curves' ? this.computeHistogram() : null;
    this.original = structuredClone(this.data);
    this.previewOn = true;
    this.previewBox.checked = true;
    this.sections.get(this.kind)?.sync();
    for (const o of Array.from(this.presetSel.options)) if (o.value) o.hidden = o.dataset.kind !== this.kind;
    this.presetSel.value = '';
  }

  private presetKey(): string { return ({ levels: 'levels', curves: 'curves', exposure: 'exposureSettings', gradientMap: 'gradientMapSettings', hsv: 'hsvSettings', grain: 'grainSettings' } as Record<string, string>)[this.kind] ?? 'params'; }

  /** The option for a saved preset, added once and shown only while its adjustment is the open one. */
  private presetOption(kind: string, name: string): HTMLOptionElement {
    const hit = Array.from(this.presetSel.options).find((o) => o.dataset.kind === kind && o.value === name);
    if (hit) return hit;
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    o.dataset.kind = kind;
    o.hidden = kind !== this.kind;
    this.presetSel.appendChild(o);
    return o;
  }

  private async savePreset(): Promise<void> {
    const name = (await promptName('Save Preset', '', 'Save'))?.trim().slice(0, 60);
    if (!name) return;
    if (this.kind === 'hsv') this.data.hsvSettings = hsvToData(this.hsv);
    const all = readPresets(), key = this.presetKey();
    (all[this.kind] ??= {})[name] = structuredClone(this.data[key]) as Json;
    writePresets(all);
    this.presetSel.value = this.presetOption(this.kind, name).value;
    toast(`Saved the preset ${name}.`);
  }

  private loadPreset(): void {
    const name = this.presetSel.value, p = name ? readPresets()[this.kind]?.[name] : null;
    if (!p) return;
    const orig = this.original, key = this.presetKey();
    this.data[key] = structuredClone(p);
    this.prepare();
    this.original = orig;
    this.presetSel.value = name;
    this.changed();
  }

  private deletePreset(): void {
    const name = this.presetSel.value;
    if (!name) return;
    const all = readPresets();
    if (all[this.kind]) { delete all[this.kind][name]; writePresets(all); }
    this.presetOption(this.kind, name).remove();
    this.presetSel.value = '';
  }

  /** Reset puts the current channel or range back to its defaults, or everything with Shift; the section decides
   *  what "current" means, any other kind goes wholly back to its defaults. */
  private reset(all: boolean): void {
    const s = this.sections.get(this.kind);
    if (s?.reset) s.reset(all);
    else {
      const orig = this.original;
      this.data = structuredClone(defaultAdjustmentData(this.kind));
      this.prepare();
      this.original = orig;
    }
    this.previewOn = true;
    this.previewBox.checked = true;
    this.sections.get(this.kind)?.sync();
    this.changed();
  }

  /** Switches the live preview on or off: off shows the values the dialog opened with. */
  private setPreview(on: boolean): void {
    this.previewOn = on;
    if (this.mode === 'layer') {
      const id = this.layerId, kind = this.kind, data = structuredClone(on ? this.data : this.original);
      if (id) this.engine.updateLive((p) => p.updateLayer(id, { adjustment: { kind, data } }));
    } else if (on) this.schedule();
    else this.engine.setPreview(null);
  }

  private sampleMode: string | null = null;
  private sampleHandler: ((e: PointerEvent) => void) | null = null;
  private readonly sampleResets: Array<(mode: string | null) => void> = [];
  private targetDrag: { move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null = null;

  close(): void {
    this.stopSampling();
    super.close();
  }

  /** Canvas sampling for the eyedroppers and the targeted adjustment: while a mode is on, the scrim lets clicks
   *  through and a capture-phase listener takes clicks on the stage before any tool sees them. Levels modes are black,
   *  gray and white; Hue/Saturation's are hue-replace, hue-add, hue-remove and target. */
  private startSampling(mode: string): void {
    this.stopSampling(false);
    if (!['black', 'gray', 'white', 'c-black', 'c-gray', 'c-white', 'hue-replace', 'hue-add', 'hue-remove', 'target'].includes(mode)) { this.sampleResets.forEach((r) => r(null)); return; }
    this.sampleMode = mode;
    this.sampleResets.forEach((r) => r(mode));
    this.scrim.classList.add('cv-scrim-through');
    const handler = (e: PointerEvent): void => {
      const stage = document.querySelector('.cv-overlay-canvas'), p = this.engine.current, m = this.sampleMode;
      if (e.button !== 0 || !stage || e.target !== stage || !p || !m) return;
      e.preventDefault();
      e.stopPropagation();
      const b = stage.getBoundingClientRect(), v = p.viewport;
      const pt = { x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom };
      if (m === 'black' || m === 'gray' || m === 'white') {
        const rgb = this.engine.sampleOriginal(pt, this.mode !== 'image', this.sampleRadius);
        if (rgb) this.applySample(rgb, m);
      } else if (m === 'c-black' || m === 'c-gray' || m === 'c-white') {
        const rgb = this.engine.sampleOriginal(pt, this.mode !== 'image', this.sampleRadius);
        if (rgb) this.applyCurveSample(rgb, m.slice(2) as 'black' | 'gray' | 'white');
      } else if (m === 'target') this.beginTarget(pt, e.clientX);
      else this.sampleHue(pt, m);
    };
    window.addEventListener('pointerdown', handler, true);
    this.sampleHandler = handler;
  }

  private stopSampling(resetUi = true): void {
    if (this.sampleHandler) window.removeEventListener('pointerdown', this.sampleHandler, true);
    this.endTarget();
    this.sampleHandler = null;
    this.sampleMode = null;
    this.scrim.classList.remove('cv-scrim-through');
    if (resetUi) this.sampleResets.forEach((r) => r(null));
  }

  /** The hue under a document point, from the composite; near-neutral pixels (HSB saturation up to 0.02) have none. */
  private sampledHue(pt: { x: number; y: number }): number | null {
    const rgb = this.engine.sampleOriginal(pt, true);
    if (!rgb) return null;
    const [r, g, b] = rgb, high = Math.max(r, g, b), d = high - Math.min(r, g, b);
    if (!(high > 0) || d / high <= 0.02) return null;
    const h = 60 * (high === r ? (g - b) / d : high === g ? (b - r) / d + 2 : (r - g) / d + 4);
    return h < 0 ? h + 360 : h;
  }

  /** re-center, widen or narrow the selected range's band on the sampled hue. */
  private sampleHue(pt: { x: number; y: number }, mode: string): void {
    const s = this.hsv;
    if (s.range === 'Master' || s.colorize) { toast('Choose a color range to sample into.'); return; }
    const hue = this.sampledHue(pt);
    if (hue === null) { toast('That color has no hue to sample.'); return; }
    const b = s.bands[s.range];
    s.bands[s.range] = mode === 'hue-replace' ? bandCentered(b, hue) : mode === 'hue-add' ? bandInclude(b, hue) : bandExclude(b, hue);
    this.sections.get('hsv')?.sync();
    this.changed();
  }

  /** the targeted adjustment: the range that most claims the hue under the pointer becomes the selected
   *  range, and dragging right raises its saturation (its hue with Cmd or Ctrl held) by one unit per two screen pixels. */
  private beginTarget(pt: { x: number; y: number }, x0: number): void {
    const s = this.hsv;
    if (s.colorize) return;
    const hue = this.sampledHue(pt);
    if (hue === null) { toast('That color has no hue to adjust.'); return; }
    let range: ColorRange = 'Reds', best = -1;
    for (const r of COLOR_RANGES) {
      if (r === 'Master') continue;
      const w = bandWeight(s.bands[r], hue);
      if (w > best) { best = w; range = r; }
    }
    s.range = range;
    const start = { ...(s.adjustments[range] ?? { hue: 0, saturation: 0, lightness: 0 }) };
    const move = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const a = (s.adjustments[range] ??= { hue: 0, saturation: 0, lightness: 0 }), delta = e.clientX - x0;
      if (e.metaKey || e.ctrlKey) a.hue = Math.min(180, Math.max(-180, start.hue + delta / 2));
      else a.saturation = Math.min(100, Math.max(-100, start.saturation + delta / 2));
      this.sections.get('hsv')?.sync();
      this.changed();
    };
    const up = (e: PointerEvent): void => { e.preventDefault(); e.stopPropagation(); this.endTarget(); };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    this.targetDrag = { move, up };
    this.sections.get('hsv')?.sync();
    this.changed();
  }

  private endTarget(): void {
    const t = this.targetDrag;
    if (!t) return;
    window.removeEventListener('pointermove', t.move, true);
    window.removeEventListener('pointerup', t.up, true);
    this.targetDrag = null;
  }

  /** the `LevelsSettings.sampling`: all three channels are calibrated together from the sampled color and
   *  the master range resets; the gray point sets each channel's gamma so the sample maps to middle gray. */
  private applySample(rgb: [number, number, number], mode: 'black' | 'gray' | 'white'): void {
    const lv = this.data.levels as { channel: string; ranges: Array<Record<string, number>> };
    lv.ranges[0] = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };
    for (let c = 1; c <= 3; c++) {
      const r = { ...lv.ranges[c] }, v = rgb[c - 1] * 255;
      if (mode === 'black') r.black = Math.min(r.white - 1, Math.max(0, v));
      else if (mode === 'white') r.white = Math.max(r.black + 1, Math.min(255, v));
      else {
        const f = (v - r.black) / (r.white - r.black);
        if (!(f > 0 && f < 1)) continue;
        r.gamma = Math.min(9.99, Math.max(0.1, Math.log(f) / Math.log(0.5)));
      }
      r.outputBlack = 0;
      r.outputWhite = 255;
      lv.ranges[c] = r;
    }
    this.sections.get('levels')?.sync();
    this.changed();
  }

  /** The Curves eyedroppers: on each of the red, green and blue curves the sampled level becomes a point that maps to 0
   *  (black), 128 (gray) or 255 (white); a black or white sample drops the points beyond it. */
  private applyCurveSample(rgb: [number, number, number], mode: 'black' | 'gray' | 'white'): void {
    const cv = this.data.curves as { channels: Pt[][] };
    for (let c = 1; c <= 3; c++) {
      const x = Math.round(clamp(rgb[c - 1] * 255, 1, 254)), y = mode === 'black' ? 0 : mode === 'white' ? 255 : 128;
      const keep = cv.channels[c].filter((p) => (mode === 'black' ? p.x > x || p.x === 0 : mode === 'white' ? p.x < x || p.x === 255 : p.x !== x));
      cv.channels[c] = [...keep.filter((p) => p.x !== x), { x, y }].sort((a, b) => a.x - b.x);
    }
    this.sections.get('curves')?.sync();
    this.changed();
  }

  private sampleRadius = 0;
  private readonly sizeRows: Array<{ set(v: string): void }> = [];
  /** Sample Size for the eyedroppers: a point, or the mean of a square around it. */
  private sampleSizeRow(): ReturnType<typeof selectRow> {
    const r = selectRow('Sample size', [['0', 'Point'], ['1', '3 by 3'], ['2', '5 by 5'], ['5', '11 by 11'], ['15', '31 by 31'], ['25', '51 by 51'], ['50', '101 by 101']], (v) => { this.sampleRadius = Number(v); for (const o of this.sizeRows) o.set(v); });
    this.sizeRows.push(r);
    return r;
  }

  private computeHistogram(): Float64Array | null {
    const info = this.mode === 'image' ? this.engine.targetImage() : null;
    if (info) return histogram(info.image);
    const flat = this.engine.flattened();
    return flat ? histogram(ctxOf(flat).getImageData(0, 0, flat.width, flat.height)) : null;
  }

  private changed(): void {
    if (this.kind === 'hsv') this.data.hsvSettings = hsvToData(this.hsv);
    if (!this.previewOn) { this.previewOn = true; this.previewBox.checked = true; }
    if (this.mode === 'layer') {
      const id = this.layerId, kind = this.kind, data = structuredClone(this.data);
      if (id) this.engine.updateLive((p) => p.updateLayer(id, { adjustment: { kind, data } }));
    } else this.schedule();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.isOpen && this.mode === 'image') this.engine.previewImageEdit((src, scale) => this.run(src, scale));
    });
  }

  private kernel(): Kernel | null {
    const d = this.data;
    switch (this.kind) {
      case 'levels': return levelsKernel(d.levels);
      case 'curves': return curvesKernel(d.curves);
      case 'exposure': return exposureKernel(d.exposureSettings);
      case 'gradientMap': return gradientMapKernel(d.gradientMapSettings);
      case 'hsv': return hsvKernel(this.hsv);
      case 'grain': return grainKernel(grainFromData(d));
      default: return isParamKind(this.kind) ? paramKernel(this.kind, d.params) : null;
    }
  }

  private run(src: ImageData, scale: number): ImageData {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    this.kernel()?.(out.data, { width: src.width, height: src.height, originX: 0, originY: 0, unitsPerPixel: 1 / scale });
    return out;
  }

  /** Opens `kind` for the image with recorded `data`, for an action paused for input; resolves with the settings
   *  chosen on OK, or null on Cancel. The action applies them, as any recorded adjustment. */
  askImage(kind: AdjustmentKind, data: Json): Promise<Json | null> {
    return new Promise((resolve) => {
      if (this.isOpen || !this.engine.targetImage()) { resolve(null); return; }
      this.mode = 'image';
      this.layerId = null;
      this.kind = kind;
      this.data = structuredClone(data);
      this.prepare();
      this.open(this.okBtn);
      this.schedule();
      this.asking = resolve;
    });
  }

  private commit(): void {
    if (this.asking) { const done = this.asking; this.asking = null; this.done = true; this.engine.setPreview(null); const data = structuredClone(this.data); this.close(); done(data); return; }
    this.done = true;
    if (!this.previewOn) this.setPreview(true);
    const kind = this.kind, data = structuredClone(this.data), layer = this.mode === 'layer';
    if (layer) this.engine.commitLive();
    else this.engine.applyImageEdit(ADJUSTMENT_LABELS[this.kind], (src, scale) => this.run(src, scale));
    this.close();
    this.onApplied?.({ kind, data, layer, made: layer && this.madeLayer });
  }

  /** Replays a recorded adjustment without the dialog: applied to the image, or as a new adjustment layer. */
  applySettings(kind: AdjustmentKind, data: Json, layer: boolean): boolean {
    if (this.isOpen) return false;
    if (layer) {
      const id = this.engine.addAdjustmentLayer(kind);
      if (!id || !this.engine.beginLive(`Edit ${ADJUSTMENT_LABELS[kind]}`)) return !!id;
      this.engine.updateLive((p) => p.updateLayer(id, { adjustment: { kind, data: structuredClone(data) } }));
      this.engine.commitLive();
      return true;
    }
    this.kind = kind;
    this.data = structuredClone(data);
    const k = this.kernel();
    if (!k) return false;
    this.engine.applyImageEdit(ADJUSTMENT_LABELS[kind], (src, scale) => {
      const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
      k(out.data, { width: src.width, height: src.height, originX: 0, originY: 0, unitsPerPixel: 1 / scale });
      return out;
    });
    return true;
  }

  private abandon(): void {
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    if (this.asking) { const a = this.asking; this.asking = null; this.engine.setPreview(null); a(null); return; }
    if (this.done) return;
    if (this.mode === 'layer') this.engine.cancelLive();
    else this.engine.setPreview(null);
  }

  private drawHisto(ch: number): void {
    const c = this.histo?.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, 256, 96);
    const bins = this.bins;
    if (!bins) return;
    let max = 0;
    for (let i = 1; i < 255; i++) max = Math.max(max, bins[ch * 256 + i]);
    if (!(max > 0)) return;
    c.fillStyle = cssVar('--text-muted');
    for (let i = 0; i < 256; i++) { const h = Math.min(96, (bins[ch * 256 + i] / max) * 96); c.fillRect(i, 96 - h, 1, h); }
  }

  private buildLevels(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    let ch = 0;
    const lv = (): { channel: string; ranges: Array<Record<string, number>> } => this.data.levels as { channel: string; ranges: Array<Record<string, number>> };
    const r = (): Record<string, number> => lv().ranges[ch];
    const set = (key: string, v: number): void => { r()[key] = v; this.changed(); };
    const names = (): string[] => channelsOf(this.engine.current?.doc.mode);
    const channel = selectRow('Channel', ALL_CHANNELS.map((c) => [c, c] as const), (v) => { ch = Math.max(0, names().indexOf(v)); lv().channel = v; values(); this.drawHisto(ch); this.changed(); });
    const canvas = el<HTMLCanvasElement>('<canvas class="cv-histo" width="256" height="96"></canvas>');
    const black = sliderRow('Input black', 0, 253, 1, (v) => set('black', Math.min(v, r().white - 2)), { def: 0 });
    const gamma = sliderRow('Midtones', 0.1, 9.99, 0.01, (v) => set('gamma', v), { def: 1 });
    const white = sliderRow('Input white', 2, 255, 1, (v) => set('white', Math.max(v, r().black + 2)), { def: 255 });
    const outB = sliderRow('Output black', 0, 255, 1, (v) => set('outputBlack', v), { def: 0 });
    const outW = sliderRow('Output white', 0, 255, 1, (v) => set('outputWhite', v), { def: 255 });
    const auto = selectRow('Auto', [['', 'Choose'], ['contrast', 'Contrast'], ['color', 'Color'], ['neutral', 'Color + neutral midtones']], (v) => {
      auto.set('');
      if (!v || !this.bins) return;
      lv().ranges = autoLevels(this.bins, v as 'contrast' | 'color' | 'neutral');
      values();
      this.drawHisto(ch);
      this.changed();
    });
    const sample = selectRow('Sample', [['', 'Off'], ['black', 'Black point'], ['gray', 'Gray point'], ['white', 'White point']], (v) => { if (v) this.startSampling(v); else this.stopSampling(); });
    this.sampleResets.push((m) => sample.set(m === 'black' || m === 'gray' || m === 'white' ? m : ''));
    node.append(channel.el, canvas, auto.el, sample.el, this.sampleSizeRow().el, black.el, gamma.el, white.el, outB.el, outW.el);
    this.histo = canvas;
    const values = (): void => { const x = r(); black.set(x.black); gamma.set(x.gamma); white.set(x.white); outB.set(x.outputBlack); outW.set(x.outputWhite); };
    const reset = (all: boolean): void => {
      const flat = (): Record<string, number> => ({ black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 });
      if (all) lv().ranges = lv().ranges.map(flat);
      else lv().ranges[ch] = flat();
    };
    return { node, reset, sync: () => { const n = names(); showChannels(channel, n); ch = Math.max(n[0] === 'Lab' ? 1 : 0, n.indexOf(lv().channel)); while (lv().ranges.length < 5) lv().ranges.push({ black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 }); channel.set(n[ch]); values(); this.drawHisto(ch); } };
  }

  private buildCurves(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    let ch = 0, drag: number | null = null, removing = false;
    const cv = (): { channel: string; channels: Pt[][] } => this.data.curves as { channel: string; channels: Pt[][] };
    const pts = (): Pt[] => cv().channels[ch];
    const canvas = el<HTMLCanvasElement>('<canvas class="cv-curves" width="256" height="256"></canvas>');
    const draw = (): void => {
      const c = canvas.getContext('2d');
      if (!c) return;
      const grid = cssVar('--border-light'), accent = cssVar('--accent-color'), ink = cssVar('--text-primary');
      c.clearRect(0, 0, 256, 256);
      const bins = this.bins;
      if (bins && ch <= 3) {
        let max = 0;
        for (let i = 1; i < 255; i++) max = Math.max(max, bins[ch * 256 + i]);
        if (max > 0) {
          c.fillStyle = cssVar('--text-muted');
          c.globalAlpha = 0.35;
          for (let i = 0; i < 256; i++) { const h = Math.min(256, (bins[ch * 256 + i] / max) * 256); c.fillRect(i, 256 - h, 1, h); }
          c.globalAlpha = 1;
        }
      }
      c.strokeStyle = grid;
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 1; i < 4; i++) { const v = i * 64 + 0.5; c.moveTo(v, 0); c.lineTo(v, 256); c.moveTo(0, v); c.lineTo(256, v); }
      c.moveTo(0, 256); c.lineTo(256, 0);
      c.stroke();
      const t = curveTable(ch, pts());
      c.strokeStyle = accent;
      c.lineWidth = 2;
      c.beginPath();
      for (let x = 0; x < 256; x++) { const y = 255.5 - t[x]; if (x) c.lineTo(x + 0.5, y); else c.moveTo(0.5, y); }
      c.stroke();
      if (pts().length <= 64) pts().forEach((q, i) => { c.fillStyle = i === drag && removing ? grid : ink; c.fillRect(q.x - 3.5, 255 - q.y - 3.5, 7, 7); });
    };
    let pencilOn = false, pen: Float32Array | null = null, penX = -1;
    const setDense = (t: ArrayLike<number>): void => { cv().channels[ch] = Array.from({ length: 256 }, (_, i) => ({ x: i, y: clamp(Math.round(t[i]), 0, 255) })); draw(); this.changed(); };
    const penAt = (p: Pt): void => {
      const x = clamp(Math.round(p.x), 0, 255), y = clamp(Math.round(p.y), 0, 255);
      pen ??= Float32Array.from(curveTable(ch, pts()));
      const from = penX < 0 ? x : penX, step = x >= from ? 1 : -1;
      for (let i = from; i !== x + step; i += step) pen[i] = from === x ? y : pen[from] + ((y - pen[from]) * (i - from)) / (x - from);
      penX = x;
      setDense(pen);
    };
    const smooth = (): void => {
      const t = curveTable(ch, pts()), out = new Float32Array(256);
      for (let i = 0; i < 256; i++) { let s = 0; for (let k = -3; k <= 3; k++) s += t[clamp(i + k, 0, 255)]; out[i] = s / 7; }
      setDense(out);
    };
    const local = (e: PointerEvent): Pt & { outside: boolean } => {
      const b = canvas.getBoundingClientRect();
      return { x: ((e.clientX - b.left) / b.width) * 255, y: (1 - (e.clientY - b.top) / b.height) * 255, outside: e.clientX < b.left - 16 || e.clientX > b.right + 16 || e.clientY < b.top - 16 || e.clientY > b.bottom + 16 };
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (pencilOn) { pen = null; penX = -1; canvas.setPointerCapture(e.pointerId); penAt(local(e)); return; }
      const p = local(e), list = pts();
      let hit = list.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 8);
      if (hit < 0) {
        const x = clamp(Math.round(p.x), 0, 255);
        if (list.some((q) => q.x === x)) return;
        list.push({ x, y: clamp(Math.round(p.y), 0, 255) });
        list.sort((a, b) => a.x - b.x);
        hit = list.findIndex((q) => q.x === x);
        this.changed();
      }
      drag = hit;
      removing = false;
      canvas.setPointerCapture(e.pointerId);
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (pen) { penAt(local(e)); return; }
      if (drag === null) return;
      const list = pts(), p = local(e);
      const lo = drag === 0 ? 0 : list[drag - 1].x + 1, hi = drag === list.length - 1 ? 255 : list[drag + 1].x - 1;
      list[drag] = { x: clamp(Math.round(p.x), lo, hi), y: clamp(Math.round(p.y), 0, 255) };
      removing = p.outside && drag > 0 && drag < list.length - 1;
      draw();
      this.changed();
    });
    const end = (e: PointerEvent): void => {
      if (pen) { pen = null; penX = -1; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); return; }
      if (drag === null) return;
      if (removing) { pts().splice(drag, 1); this.changed(); }
      drag = null;
      removing = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      draw();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    const names = (): string[] => channelsOf(this.engine.current?.doc.mode);
    const channel = selectRow('Channel', ALL_CHANNELS.map((c) => [c, c] as const), (v) => { ch = Math.max(0, names().indexOf(v)); cv().channel = v; draw(); this.changed(); });
    const pencil = checkRow('Pencil', (v) => { pencilOn = v; canvas.style.cursor = v ? 'cell' : ''; });
    const smoothBtn = el<HTMLButtonElement>('<button class="cv-btn" type="button">Smooth</button>');
    smoothBtn.addEventListener('click', smooth);
    const sample = selectRow('Eyedropper', [['', 'Off'], ['c-black', 'Black point'], ['c-gray', 'Gray point'], ['c-white', 'White point']], (v) => { if (v) this.startSampling(v); else this.stopSampling(); });
    this.sampleResets.push((m) => sample.set(m?.startsWith('c-') ? m : ''));
    const size = this.sampleSizeRow();
    node.append(channel.el, canvas, pencil.el, smoothBtn, sample.el, size.el, el('<p class="cv-note">Click to add a point, drag to shape the curve, drag a point off the graph to remove it. Pencil draws the curve freehand; Smooth evens it out.</p>'));
    const reset = (all: boolean): void => {
      const flat = (): Pt[] => [{ x: 0, y: 0 }, { x: 255, y: 255 }];
      if (all) cv().channels = cv().channels.map(flat);
      else cv().channels[ch] = flat();
    };
    return { node, reset, sync: () => { const n = names(); showChannels(channel, n); setHidden(sample.el, n !== CHANNELS); ch = Math.max(n[0] === 'Lab' ? 1 : 0, n.indexOf(cv().channel)); while (cv().channels.length < 5) cv().channels.push([{ x: 0, y: 0 }, { x: 255, y: 255 }]); channel.set(n[ch]); draw(); } };
  }

  private buildHsv(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    const cur = (): { hue: number; saturation: number; lightness: number } => (this.hsv.adjustments[this.hsv.range] ??= { hue: 0, saturation: 0, lightness: 0 });
    const spectrum = el<HTMLCanvasElement>('<canvas class="cv-hue-spectrum" width="360" height="48" aria-label="Hue band spectrum"></canvas>');
    const degrees = el('<p class="cv-note"></p>');
    const hueRgb = (h: number): [number, number, number] => {
      const f = (n: number): number => { const k = (n + h / 60) % 6; return 1 - Math.max(0, Math.min(k, 4 - k, 1)); };
      return [f(5), f(3), f(1)];
    };
    const drawSpectrum = (): void => {
      const c = spectrum.getContext('2d');
      if (!c) return;
      const s = this.hsv, response = hueResponse(s);
      c.clearRect(0, 0, 360, 48);
      for (let h = 0; h < 360; h += 5) {
        const [r, g, b] = hsvAdjust(...hueRgb(h), s, response), high = Math.max(r, g, b), d = high - Math.min(r, g, b);
        const shown = d > 0 ? (60 * (high === r ? (g - b) / d : high === g ? (b - r) / d + 2 : (r - g) / d + 4) + 360) % 360 : h;
        c.fillStyle = `hsl(${h} 100% 50%)`;
        c.fillRect(h, 0, 5.5, 16);
        c.fillStyle = `hsl(${shown} 100% 50%)`;
        c.fillRect(h, 32, 5.5, 16);
      }
      const hs = this.hsv.range !== 'Master' && !s.colorize ? bandHandles(s.bands[s.range]) : [];
      c.fillStyle = cssVar('--text-primary');
      hs.forEach((d, i) => { if (i === 1 || i === 2) c.fillRect(d - 1, 18, 2, 12); else c.fillRect(d - 3.5, 21.5, 7, 5); });
      setText(degrees, hs.map((d) => `${Math.round(d)}\u00b0`).join('   '));
    };
    const changed = (): void => { drawSpectrum(); this.changed(); };
    let handle: number | null = null;
    const degOf = (e: PointerEvent): number => { const r = spectrum.getBoundingClientRect(); return r.width > 0 ? (Math.min(Math.max(0, e.clientX - r.left), r.width) / r.width) * 360 : 0; };
    const moveHandle = (e: PointerEvent): void => {
      const s = this.hsv;
      if (s.range === 'Master' || s.colorize) return;
      const d = degOf(e);
      if (handle === null) {
        const gaps = bandHandles(s.bands[s.range]).map((h) => { const g = Math.abs(h - d) % 360; return Math.min(g, 360 - g); });
        handle = gaps.indexOf(Math.min(...gaps));
      }
      s.bands[s.range] = bandSetHandle(s.bands[s.range], handle, d);
      changed();
    };
    spectrum.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; handle = null; spectrum.setPointerCapture(e.pointerId); moveHandle(e); });
    spectrum.addEventListener('pointermove', (e) => { if (handle !== null) moveHandle(e); });
    spectrum.addEventListener('pointerup', () => { handle = null; });
    spectrum.addEventListener('pointercancel', () => { handle = null; });
    const range = selectRow('Range', COLOR_RANGES.map((r) => [r, r] as const), (v) => { this.hsv.range = v as ColorRange; sync(); this.changed(); });
    const sample = selectRow('Sample', [['', 'Off'], ['replace', 'Sample'], ['add', 'Add'], ['remove', 'Remove']], (v) => { if (v) this.startSampling(`hue-${v}`); else this.stopSampling(); });
    const target = checkRow('Targeted adjustment', (v) => { if (v) this.startSampling('target'); else this.stopSampling(); });
    this.sampleResets.push((m) => { sample.set(m?.startsWith('hue-') ? m.slice(4) : ''); target.set(m === 'target'); });
    const hue = sliderRow('Hue', -180, 180, 1, (v) => { cur().hue = v; changed(); }, { def: 0 });
    const hueC = sliderRow('Hue', 0, 360, 1, (v) => { cur().hue = v; changed(); }, { def: 0 });
    const sat = sliderRow('Saturation', -100, 100, 1, (v) => { cur().saturation = v; changed(); }, { def: 0 });
    const satC = sliderRow('Saturation', 0, 100, 1, (v) => { cur().saturation = v; changed(); }, { def: 0 });
    const light = sliderRow('Lightness', -100, 100, 1, (v) => { cur().lightness = v; changed(); }, { def: 0 });
    const colorize = checkRow('Colorize', (v) => {
      this.hsv.colorize = v;
      if (v) { this.hsv.range = 'Master'; const a = cur(); if (!a.hue && !a.saturation && !a.lightness) a.saturation = 25; }
      sync();
      this.changed();
    });
    const invert = checkRow('Invert range', (v) => { this.hsv.invertRange = v; changed(); });
    node.append(range.el, sample.el, target.el, hue.el, hueC.el, sat.el, satC.el, light.el, colorize.el, invert.el, spectrum, degrees);
    const sync = (): void => {
      const s = this.hsv, a = cur();
      range.set(s.range);
      setHidden(range.el, s.colorize);
      setHidden(hue.el, s.colorize); setHidden(hueC.el, !s.colorize);
      setHidden(sat.el, s.colorize); setHidden(satC.el, !s.colorize);
      setHidden(invert.el, s.colorize || s.range === 'Master');
      hue.set(a.hue); hueC.set(((a.hue % 360) + 360) % 360);
      sat.set(a.saturation); satC.set(clamp(a.saturation, 0, 100));
      light.set(a.lightness);
      colorize.set(s.colorize);
      invert.set(s.invertRange);
      setHidden(sample.el, s.colorize);
      setHidden(target.el, s.colorize);
      drawSpectrum();
    };
    const reset = (all: boolean): void => {
      if (all) this.hsv = hsvFromData({});
      else this.hsv.adjustments[this.hsv.range] = { hue: 0, saturation: 0, lightness: 0 };
    };
    return { node, sync, reset };
  }

  private buildExposure(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    const ex = (): Record<string, number> => this.data.exposureSettings as Record<string, number>;
    const e = sliderRow('Exposure', -5, 5, 0.01, (v) => { ex().exposure = v; this.changed(); }, { min: -20, max: 20, def: 0 });
    const o = sliderRow('Offset', -0.5, 0.5, 0.0001, (v) => { ex().offset = v; this.changed(); }, { def: 0 });
    const g = sliderRow('Gamma', 0.01, 9.99, 0.01, (v) => { ex().gamma = v; this.changed(); }, { def: 1 });
    node.append(e.el, o.el, g.el);
    return { node, sync: () => { e.set(ex().exposure); o.set(ex().offset); g.set(ex().gamma); } };
  }

  private buildGradientMap(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    const gm = (): Json => this.data.gradientMapSettings as Json;
    type Stop = { at: number; red: number; green: number; blue: number };
    const hasStops = (): boolean => Array.isArray(gm().stops) && (gm().stops as unknown[]).length >= 2;
    const stops = (): Stop[] => {
      if (!hasStops()) gm().stops = [{ at: 0, ...obj(gm().shadows) }, { at: 1, ...obj(gm().highlights) }];
      return gm().stops as Stop[];
    };
    const ends = (): [Stop, Stop] => { const s = stops().slice().sort((a, b) => a.at - b.at); return [s[0], s[s.length - 1]]; };
    const custom = (): void => { delete gm().preset; preset.set('custom'); };
    const strip = el<HTMLCanvasElement>('<canvas class="cv-stop-strip" width="256" height="18" aria-label="Gradient"></canvas>');
    const list = el('<div class="cv-stop-list"></div>');
    const rows: Array<{ node: HTMLElement; pos: HTMLInputElement; col: HTMLInputElement; out: HTMLElement; del: HTMLButtonElement }> = [];
    const drawStrip = (): void => {
      const c = strip.getContext('2d');
      if (!c) return;
      const ramp = new Uint8ClampedArray(256 * 4);
      for (let i = 0; i < 256; i++) ramp.set([i, i, i, 255], i * 4);
      gradientMapKernel({ ...gm(), dither: false })(ramp);
      const img = new ImageData(256, 1);
      img.data.set(ramp);
      c.putImageData(img, 0, 0);
      for (let y = 1; y < 18; y++) c.drawImage(strip, 0, 0, 256, 1, 0, y, 256, 1);
    };
    const touch = (): void => { custom(); drawStrip(); this.changed(); };
    const addRow = (): (typeof rows)[number] => {
      const n = el('<div class="cv-stop-row"><input type="range" min="0" max="100" step="1" aria-label="Stop position"><span class="cv-note"></span><input class="cv-input cv-color" type="color" aria-label="Stop colour"><button class="cv-btn" type="button" aria-label="Remove stop">x</button></div>');
      const r = { node: n, pos: n.querySelector('input[type="range"]') as HTMLInputElement, col: n.querySelector('input[type="color"]') as HTMLInputElement, out: n.querySelector('span') as HTMLElement, del: n.querySelector('button') as HTMLButtonElement };
      const idx = rows.length;
      r.pos.addEventListener('input', () => { const s = stops()[idx]; if (!s) return; s.at = r.pos.valueAsNumber / 100; setText(r.out, `${r.pos.valueAsNumber}%`); touch(); });
      r.pos.addEventListener('change', () => { stops().sort((a, b) => a.at - b.at); this.sections.get('gradientMap')?.sync(); touch(); });
      r.col.addEventListener('input', () => { const s = stops()[idx]; if (!s) return; Object.assign(s, hexToUnit(r.col.value)); touch(); });
      r.del.addEventListener('click', () => { const s = stops(); if (s.length <= 2) return; s.splice(idx, 1); this.sections.get('gradientMap')?.sync(); touch(); });
      rows.push(r);
      list.appendChild(n);
      return r;
    };
    const addStop = el<HTMLButtonElement>('<button class="cv-btn" type="button">Add stop</button>');
    addStop.addEventListener('click', () => {
      const s = stops().slice().sort((a, b) => a.at - b.at);
      if (s.length >= 64) { toast('A gradient takes up to 64 stops.'); return; }
      let k = 0, gap = -1;
      for (let i = 0; i + 1 < s.length; i++) if (s[i + 1].at - s[i].at > gap) { gap = s[i + 1].at - s[i].at; k = i; }
      const a = s[k], b = s[k + 1];
      gm().stops = [...s, { at: (a.at + b.at) / 2, red: (a.red + b.red) / 2, green: (a.green + b.green) / 2, blue: (a.blue + b.blue) / 2 }].sort((x, y) => x.at - y.at);
      this.sections.get('gradientMap')?.sync();
      touch();
    });
    const shadows = colorRow('Shadows', (hex) => { if (hasStops()) Object.assign(ends()[0], hexToUnit(hex)); gm().shadows = hexToUnit(hex); this.sections.get('gradientMap')?.sync(); touch(); });
    const highlights = colorRow('Highlights', (hex) => { if (hasStops()) Object.assign(ends()[1], hexToUnit(hex)); gm().highlights = hexToUnit(hex); this.sections.get('gradientMap')?.sync(); touch(); });
    const reversed = checkRow('Reverse', (v) => { gm().reversed = v; drawStrip(); this.changed(); });
    const dither = checkRow('Dither', (v) => { gm().dither = v; this.changed(); });
    const preset = selectRow('Preset', [['custom', 'Custom'], ...GRADIENT_PRESETS.map((p) => [p.id, p.label] as const)], (v) => {
      const p = GRADIENT_PRESETS.find((x) => x.id === v);
      if (!p) { delete gm().stops; delete gm().preset; this.sections.get('gradientMap')?.sync(); this.changed(); return; }
      gm().stops = p.stops.map(([at, hex]) => ({ at, ...hexToUnit(hex) }));
      gm().preset = p.id;
      gm().shadows = hexToUnit(p.stops[0][1]);
      gm().highlights = hexToUnit(p.stops[p.stops.length - 1][1]);
      this.sections.get('gradientMap')?.sync();
      this.changed();
    });
    node.append(preset.el, strip, shadows.el, highlights.el, list, addStop, reversed.el, dither.el);
    const reset = (): void => { this.data.gradientMapSettings = { shadows: { red: 0, green: 0, blue: 0 }, highlights: { red: 1, green: 1, blue: 1 }, reversed: false, dither: false }; };
    return { node, reset, sync: () => {
      const has = hasStops(), s = has ? (gm().stops as Stop[]) : [], [lo, hi] = has ? ends() : [null, null];
      shadows.set(lo ? unitToHex(lo) : unitToHex(gm().shadows));
      highlights.set(hi ? unitToHex(hi) : unitToHex(gm().highlights));
      reversed.set(gm().reversed === true);
      dither.set(gm().dither === true);
      preset.set(has && typeof gm().preset === 'string' && gm().preset ? String(gm().preset) : 'custom');
      while (rows.length < s.length) addRow();
      rows.forEach((r, i) => {
        setHidden(r.node, i >= s.length);
        if (i >= s.length) return;
        r.pos.value = String(Math.round(s[i].at * 100));
        setText(r.out, `${Math.round(s[i].at * 100)}%`);
        if (document.activeElement !== r.col) r.col.value = unitToHex(s[i]);
        r.del.disabled = s.length <= 2;
      });
      drawStrip();
    } };
  }

  private buildGrain(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    const gr = (): Record<string, number> => this.data.grainSettings as Record<string, number>;
    const colour = sliderRow('Colour grain', 0, 100, 1, (v) => { gr().colour = v; this.changed(); preset.value = which(); });
    const speckle = sliderRow('Speckle', 0, 100, 1, (v) => { gr().speckle = v; this.changed(); preset.value = which(); });
    const look = sliderRow('Look strength', 0, 100, 1, (v) => { gr().look = v; this.changed(); });
    const amount = sliderRow('Amount', 0, 100, 1, (v) => { gr().amount = v; this.changed(); preset.value = which(); });
    const size = sliderRow('Size', 0.5, 20, 0.1, (v) => { gr().size = v; this.changed(); preset.value = which(); });
    const rough = sliderRow('Roughness', 0, 100, 1, (v) => { gr().roughness = v; this.changed(); preset.value = which(); });   // the Preset row follows the sliders
    const reseed = el<HTMLButtonElement>('<button class="cv-btn" type="button">New grain pattern</button>');
    reseed.addEventListener('click', () => { gr().seed = randomSeed(); this.changed(); });
    // Presets by film speed (1.51.6, film looks): each sets Amount, Size and Roughness; Custom once a slider moves.
    const PRESETS: ReadonlyArray<readonly [string, string, number, number, number, number, number]> = [['iso100', 'ISO 100 (fine)', 12, 0.8, 30, 0, 0], ['iso400', 'ISO 400 (classic)', 25, 1.5, 50, 0, 0], ['iso800', 'ISO 800', 35, 2, 60, 0, 0], ['iso1600', 'ISO 1600 (pushed)', 50, 2.8, 70, 0, 0], ['iso3200', 'ISO 3200 (coarse)', 65, 3.6, 80, 0, 0],
      ['slide', 'Slide film (fine, colour)', 14, 0.9, 25, 40, 0], ['negative', 'Colour negative', 30, 1.6, 55, 60, 5], ['bw400', 'Black and white 400', 32, 1.7, 45, 0, 8], ['bwpush', 'Black and white pushed', 55, 2.6, 65, 0, 30], ['cine', 'Cine night stock', 45, 2.2, 70, 80, 15], ['expired', 'Expired film', 60, 3, 80, 100, 40]];
    const preset = el<HTMLSelectElement>(`<select class="cv-input" aria-label="Grain preset"><option value="custom">Custom</option>${PRESETS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select>`);
    const presetRow = el('<label class="cv-dialog-row"><span>Preset</span></label>');
    presetRow.append(preset);
    preset.addEventListener('change', () => { const p = PRESETS.find((x) => x[0] === preset.value); if (!p) return; Object.assign(gr(), { amount: p[2], size: p[3], roughness: p[4], colour: p[5], speckle: p[6] }); this.changed(); amount.set(p[2]); size.set(p[3]); rough.set(p[4]); colour.set(p[5]); speckle.set(p[6]); });
    const which = (): string => PRESETS.find((p) => p[2] === gr().amount && p[3] === gr().size && p[4] === gr().roughness && p[5] === (gr().colour ?? 0) && p[6] === (gr().speckle ?? 0))?.[0] ?? 'custom';
    node.append(presetRow, look.el, amount.el, size.el, rough.el, colour.el, speckle.el, reseed);
    return { node, sync: () => { look.set(gr().look ?? 100); amount.set(gr().amount); size.set(gr().size); rough.set(gr().roughness); colour.set(gr().colour ?? 0); speckle.set(gr().speckle ?? 0); preset.value = which(); } };
  }

  /** A section from a parametric adjustment's control list. Every row exists from the start; rows of other groups
   *  (Color Balance's tones, Channel Mixer's outputs, Selective Color's colours) are only hidden, never rebuilt. */
  private buildParams(kind: ParamKind): Section {
    const node = el('<div class="cv-panel-section"></div>'), spec = PARAM_ADJUSTMENTS[kind];
    const pv = (): Json => obj(this.data.params);
    const put = (key: string, v: unknown): void => { this.data.params = { ...pv(), [key]: v }; this.changed(); if (key === spec.groupBy || (kind === 'photoFilter' && key === 'color')) this.sections.get(kind)?.sync(); };
    const named = kind === 'photoFilter'
      ? selectRow('Filter', [['custom', 'Custom'], ...PHOTO_FILTERS.map((f) => [f[0], f[1]] as const)], (v) => { const f = PHOTO_FILTERS.find((x) => x[0] === v); if (f) put('color', { r: f[2], g: f[3], b: f[4] }); })
      : null;
    const toHex = (c: unknown): string => { const o = obj(c); return hexOf({ r: num(o.r, 0), g: num(o.g, 0), b: num(o.b, 0) }); };
    const rows = spec.params.map((s) => {
      if (s.kind === 'range') { const r = sliderRow(s.label, s.min, s.max, s.step, (v) => put(s.key, v), { def: s.def }); return { s, el: r.el, set: () => r.set(num(pv()[s.key], s.def)) }; }
      if (s.kind === 'check') { const r = checkRow(s.label, (v) => put(s.key, v)); return { s, el: r.el, set: () => r.set(pv()[s.key] === true) }; }
      if (s.kind === 'select') {
        const r = selectRow(s.label, s.options, (v) => put(s.key, v));
        // The Channel Mixer's outputs (1.57.9): the inks in a CMYK document, Red, Green and Blue in any other.
        const inks = ['cyan', 'magenta', 'yellow', 'black'], mixer = kind === 'channelMixer' && s.key === 'output';
        return { s, el: r.el, set: () => {
          let v = String(pv()[s.key] ?? s.def);
          if (mixer) {
            const cmyk = this.engine.current?.doc.mode === 'cmyk';
            for (const o of r.el.querySelectorAll('option')) o.hidden = inks.includes(o.value) !== cmyk;
            if (inks.includes(v) !== cmyk) { v = cmyk ? 'cyan' : 'red'; this.data.params = { ...pv(), [s.key]: v }; queueMicrotask(() => this.sections.get(kind)?.sync()); }
          }
          r.set(v);
        } };
      }
      if (s.kind === 'text') {
        // Color Lookup's 3D LUT file: loaded from disk (checked to be a 3D .cube table), named, cleared back to the look.
        if (s.key !== 'cube') return { s, el: el('<span hidden></span>'), set: () => undefined };
        const row = el('<div class="cv-field cv-lut-row"><span>3D LUT File</span><span class="cv-note cv-lut-name"></span></div>');
        const name = row.querySelector('.cv-lut-name') as HTMLElement;
        const load = el<HTMLButtonElement>('<button class="cv-btn" type="button">Load...</button>'), clear = el<HTMLButtonElement>('<button class="cv-btn" type="button">Clear</button>');
        load.addEventListener('click', () => {
          const input = el<HTMLInputElement>('<input type="file" accept=".cube,.3dl">');
          input.addEventListener('change', () => {
            const f = input.files?.[0];
            if (!f) return;
            void f.text().then((raw) => {
              const text = lutFileToCube(f.name, raw) ?? '';
              if (!parseCube(text)) { toast(`${f.name} is not a 3D LUT in the .cube or .3dl format.`); return; }
              this.data.params = { ...pv(), cube: text, cubeName: f.name };
              this.changed();
              this.sections.get(kind)?.sync();
            });
          });
          input.click();
        });
        clear.addEventListener('click', () => { this.data.params = { ...pv(), cube: '', cubeName: '' }; this.changed(); this.sections.get(kind)?.sync(); });
        row.append(load, clear);
        return { s, el: row, set: () => setText(name, String(pv().cubeName ?? '') || 'None (the look above)') };
      }
      const r = colorRow(s.label, (hex) => put(s.key, { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }));
      return { s, el: r.el, set: () => r.set(toHex(pv()[s.key])) };
    });
    if (!rows.length) node.appendChild(el('<p class="cv-note">No settings: the layer inverts the colours beneath it.</p>'));
    if (named) node.appendChild(named.el);
    for (const r of rows) node.appendChild(r.el);
    return { node, sync: () => {
      if (named) { const c = obj(pv().color); named.set(PHOTO_FILTERS.find((f) => f[2] === c.r && f[3] === c.g && f[4] === c.b)?.[0] ?? 'custom'); }
      const g = spec.groupBy ? String(pv()[spec.groupBy]) : null; for (const r of rows) { r.set(); setHidden(r.el, !!r.s.group && r.s.group !== g); } } };
  }
}

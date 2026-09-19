import {
  ADJUSTMENT_LABELS, COLOR_RANGES, clamp, ctxOf, curvesKernel, defaultAdjustmentData, exposureKernel, grainFromData, grainKernel,
  gradientMapKernel, hexOf, histogram, hsvFromData, hsvKernel, hsvToData, levelsKernel, randomSeed,
  type AdjustmentKind, type ColorRange, type Engine, type HsvSettings, type ID, type Kernel,
} from '../../engine';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
import { toast } from '../toast';
import { checkRow, colorRow, selectRow, sliderRow } from './controls';

type LevelRangeData = { black: number; gamma: number; white: number; outputBlack: number; outputWhite: number };

/** the reference app's LevelsAuto: each end clips 0.1% of a channel's histogram. Contrast shares one master interval
 *  across R, G and B so channel relationships hold; Color sets each channel; Color + neutral midtones also sets
 *  each channel's gamma so its mean maps to middle gray. `bins` is `histogram()`: composite, then R, G, B. */
function autoLevels(bins: Float64Array, mode: 'contrast' | 'color' | 'neutral'): LevelRangeData[] {
  const fresh = (black = 0, white = 255): LevelRangeData => ({ black, gamma: 1, white, outputBlack: 0, outputWhite: 255 });
  const ranges = [fresh(), fresh(), fresh(), fresh()];
  const endpoints = (c: number): [number, number] | null => {
    const o = c * 256;
    let total = 0;
    for (let i = 0; i < 256; i++) total += bins[o + i];
    if (!(total > 0)) return null;
    let sum = 0, low = 0, high = 255;
    for (let i = 0; i < 256; i++) { sum += bins[o + i]; if (sum > total * 0.001) { low = i; break; } }
    sum = 0;
    for (let i = 255; i >= 0; i--) { sum += bins[o + i]; if (sum > total * 0.001) { high = i; break; } }
    return low < high ? [low, high] : null;
  };
  if (mode === 'contrast') {
    const lims = [1, 2, 3].map(endpoints).filter((x): x is [number, number] => x !== null);
    if (lims.length) {
      const low = Math.min(...lims.map((x) => x[0])), high = Math.max(...lims.map((x) => x[1]));
      if (low < high) ranges[0] = fresh(low, high);
    }
    return ranges;
  }
  for (let c = 1; c <= 3; c++) {
    const e = endpoints(c);
    if (!e) continue;
    const r = fresh(e[0], e[1]);
    if (mode === 'neutral') {
      let total = 0, acc = 0;
      for (let i = 0; i < 256; i++) { const w = bins[c * 256 + i]; total += w; acc += Math.min(1, Math.max(0, (i - r.black) / (r.white - r.black))) * w; }
      const mean = acc / total;
      if (mean > 0 && mean < 1) r.gamma = Math.min(9.99, Math.max(0.1, Math.log(mean) / Math.log(0.5)));
    }
    ranges[c] = r;
  }
  return ranges;
}

type Json = Record<string, unknown>;
type Pt = { x: number; y: number };
interface Section { node: HTMLElement; sync: () => void }
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const CHANNELS = ['RGB', 'Red', 'Green', 'Blue'];
const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hexToUnit = (hex: string): Json => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });
const unitToHex = (c: unknown): string => { const o = obj(c); return hexOf({ r: Math.round(num(o.red, 0) * 255), g: Math.round(num(o.green, 0) * 255), b: Math.round(num(o.blue, 0) * 255) }); };

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
  private hsv: HsvSettings = hsvFromData({});
  private done = false;
  private frame = 0;
  private bins: Float64Array | null = null;
  private histo: HTMLCanvasElement | null = null;
  private readonly sections = new Map<AdjustmentKind, Section>();
  private readonly okBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine) {
    super('Adjustment', 480);
    this.sections.set('levels', this.buildLevels());
    this.sections.set('curves', this.buildCurves());
    this.sections.set('hsv', this.buildHsv());
    this.sections.set('exposure', this.buildExposure());
    this.sections.set('gradientMap', this.buildGradientMap());
    this.sections.set('grain', this.buildGrain());
    for (const s of this.sections.values()) { s.node.hidden = true; this.body.appendChild(s.node); }
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => this.commit());
    this.onClose = () => this.abandon();
  }

  openForLayer(id: ID): void {
    const l = this.engine.current?.layer(id);
    if (!l?.adjustment || this.isOpen) return;
    if (!this.engine.beginLive(`Edit ${ADJUSTMENT_LABELS[l.adjustment.kind]}`)) return;
    this.mode = 'layer';
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
    if (this.kind === 'gradientMap') { const g = obj(d.gradientMapSettings); d.gradientMapSettings = { shadows: g.shadows ?? { red: 0, green: 0, blue: 0 }, highlights: g.highlights ?? { red: 1, green: 1, blue: 1 }, reversed: g.reversed === true }; }
    if (this.kind === 'grain') { const g = grainFromData(d); d.grainSettings = { amount: g.amount, size: g.size, roughness: g.roughness, seed: g.seed }; }
    this.hsv = hsvFromData(d);
    this.setTitle(this.mode === 'layer' ? `${ADJUSTMENT_LABELS[this.kind]} Layer` : ADJUSTMENT_LABELS[this.kind]);
    for (const [k, s] of this.sections) setHidden(s.node, k !== this.kind);
    this.bins = this.kind === 'levels' ? this.computeHistogram() : null;
    this.sections.get(this.kind)?.sync();
  }

  private sampleMode: 'black' | 'gray' | 'white' | null = null;
  private sampleHandler: ((e: PointerEvent) => void) | null = null;
  private sampleRow: { set: (v: string) => void } | null = null;

  close(): void {
    this.stopSampling();
    super.close();
  }

  /** The Levels eyedroppers: while a mode is on, the scrim lets clicks through and a click on the canvas samples the
   *  original pixel there, before any tool sees the click. */
  private startSampling(mode: string): void {
    this.stopSampling();
    if (mode !== 'black' && mode !== 'gray' && mode !== 'white') return;
    this.sampleMode = mode;
    this.sampleRow?.set(mode);
    this.scrim.classList.add('cv-scrim-through');
    const handler = (e: PointerEvent): void => {
      const stage = document.querySelector('.cv-overlay-canvas'), p = this.engine.current, m = this.sampleMode;
      if (e.button !== 0 || !stage || e.target !== stage || !p || !m) return;
      e.preventDefault();
      e.stopPropagation();
      const b = stage.getBoundingClientRect(), v = p.viewport;
      const rgb = this.engine.sampleOriginal({ x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom }, this.mode !== 'image');
      if (rgb) this.applySample(rgb, m);
    };
    window.addEventListener('pointerdown', handler, true);
    this.sampleHandler = handler;
  }

  private stopSampling(): void {
    if (this.sampleHandler) window.removeEventListener('pointerdown', this.sampleHandler, true);
    this.sampleHandler = null;
    this.sampleMode = null;
    this.scrim.classList.remove('cv-scrim-through');
    this.sampleRow?.set('');
  }

  /** the reference app's `LevelsSettings.sampling`: all three channels are calibrated together from the sampled color and
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

  private computeHistogram(): Float64Array | null {
    const info = this.mode === 'image' ? this.engine.targetImage() : null;
    if (info) return histogram(info.image);
    const flat = this.engine.flattened();
    return flat ? histogram(ctxOf(flat).getImageData(0, 0, flat.width, flat.height)) : null;
  }

  private changed(): void {
    if (this.kind === 'hsv') this.data.hsvSettings = hsvToData(this.hsv);
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
    }
  }

  private run(src: ImageData, scale: number): ImageData {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    this.kernel()?.(out.data, { width: src.width, height: src.height, originX: 0, originY: 0, unitsPerPixel: 1 / scale });
    return out;
  }

  private commit(): void {
    this.done = true;
    if (this.mode === 'layer') this.engine.commitLive();
    else this.engine.applyImageEdit(ADJUSTMENT_LABELS[this.kind], (src, scale) => this.run(src, scale));
    this.close();
  }

  private abandon(): void {
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
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
    const channel = selectRow('Channel', CHANNELS.map((c) => [c, c] as const), (v) => { ch = Math.max(0, CHANNELS.indexOf(v)); lv().channel = v; values(); this.drawHisto(ch); this.changed(); });
    const canvas = el<HTMLCanvasElement>('<canvas class="cv-histo" width="256" height="96"></canvas>');
    const black = sliderRow('Input black', 0, 253, 1, (v) => set('black', Math.min(v, r().white - 2)));
    const gamma = sliderRow('Midtones', 0.1, 9.99, 0.01, (v) => set('gamma', v));
    const white = sliderRow('Input white', 2, 255, 1, (v) => set('white', Math.max(v, r().black + 2)));
    const outB = sliderRow('Output black', 0, 255, 1, (v) => set('outputBlack', v));
    const outW = sliderRow('Output white', 0, 255, 1, (v) => set('outputWhite', v));
    const auto = selectRow('Auto', [['', 'Choose'], ['contrast', 'Contrast'], ['color', 'Color'], ['neutral', 'Color + neutral midtones']], (v) => {
      auto.set('');
      if (!v || !this.bins) return;
      lv().ranges = autoLevels(this.bins, v as 'contrast' | 'color' | 'neutral');
      values();
      this.drawHisto(ch);
      this.changed();
    });
    const sample = selectRow('Sample', [['', 'Off'], ['black', 'Black point'], ['gray', 'Gray point'], ['white', 'White point']], (v) => { if (v) this.startSampling(v); else this.stopSampling(); });
    this.sampleRow = sample;
    node.append(channel.el, canvas, auto.el, sample.el, black.el, gamma.el, white.el, outB.el, outW.el);
    this.histo = canvas;
    const values = (): void => { const x = r(); black.set(x.black); gamma.set(x.gamma); white.set(x.white); outB.set(x.outputBlack); outW.set(x.outputWhite); };
    return { node, sync: () => { ch = Math.max(0, CHANNELS.indexOf(lv().channel)); channel.set(CHANNELS[ch]); values(); this.drawHisto(ch); } };
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
      pts().forEach((q, i) => { c.fillStyle = i === drag && removing ? grid : ink; c.fillRect(q.x - 3.5, 255 - q.y - 3.5, 7, 7); });
    };
    const local = (e: PointerEvent): Pt & { outside: boolean } => {
      const b = canvas.getBoundingClientRect();
      return { x: ((e.clientX - b.left) / b.width) * 255, y: (1 - (e.clientY - b.top) / b.height) * 255, outside: e.clientX < b.left - 16 || e.clientX > b.right + 16 || e.clientY < b.top - 16 || e.clientY > b.bottom + 16 };
    };
    canvas.addEventListener('pointerdown', (e) => {
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
      if (drag === null) return;
      const list = pts(), p = local(e);
      const lo = drag === 0 ? 0 : list[drag - 1].x + 1, hi = drag === list.length - 1 ? 255 : list[drag + 1].x - 1;
      list[drag] = { x: clamp(Math.round(p.x), lo, hi), y: clamp(Math.round(p.y), 0, 255) };
      removing = p.outside && drag > 0 && drag < list.length - 1;
      draw();
      this.changed();
    });
    const end = (e: PointerEvent): void => {
      if (drag === null) return;
      if (removing) { pts().splice(drag, 1); this.changed(); }
      drag = null;
      removing = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      draw();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    const channel = selectRow('Channel', CHANNELS.map((c) => [c, c] as const), (v) => { ch = Math.max(0, CHANNELS.indexOf(v)); cv().channel = v; draw(); this.changed(); });
    node.append(channel.el, canvas, el('<p class="cv-note">Click to add a point, drag to shape the curve, drag a point off the graph to remove it.</p>'));
    return { node, sync: () => { ch = Math.max(0, CHANNELS.indexOf(cv().channel)); channel.set(CHANNELS[ch]); draw(); } };
  }

  private buildHsv(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    const cur = (): { hue: number; saturation: number; lightness: number } => (this.hsv.adjustments[this.hsv.range] ??= { hue: 0, saturation: 0, lightness: 0 });
    const range = selectRow('Range', COLOR_RANGES.map((r) => [r, r] as const), (v) => { this.hsv.range = v as ColorRange; sync(); this.changed(); });
    const hue = sliderRow('Hue', -180, 180, 1, (v) => { cur().hue = v; this.changed(); });
    const hueC = sliderRow('Hue', 0, 360, 1, (v) => { cur().hue = v; this.changed(); });
    const sat = sliderRow('Saturation', -100, 100, 1, (v) => { cur().saturation = v; this.changed(); });
    const satC = sliderRow('Saturation', 0, 100, 1, (v) => { cur().saturation = v; this.changed(); });
    const light = sliderRow('Lightness', -100, 100, 1, (v) => { cur().lightness = v; this.changed(); });
    const colorize = checkRow('Colorize', (v) => {
      this.hsv.colorize = v;
      if (v) { this.hsv.range = 'Master'; const a = cur(); if (!a.hue && !a.saturation && !a.lightness) a.saturation = 25; }
      sync();
      this.changed();
    });
    const invert = checkRow('Invert range', (v) => { this.hsv.invertRange = v; this.changed(); });
    node.append(range.el, hue.el, hueC.el, sat.el, satC.el, light.el, colorize.el, invert.el);
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
    };
    return { node, sync };
  }

  private buildExposure(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    const ex = (): Record<string, number> => this.data.exposureSettings as Record<string, number>;
    const e = sliderRow('Exposure', -5, 5, 0.01, (v) => { ex().exposure = v; this.changed(); }, { min: -20, max: 20 });
    const o = sliderRow('Offset', -0.5, 0.5, 0.0001, (v) => { ex().offset = v; this.changed(); });
    const g = sliderRow('Gamma', 0.01, 9.99, 0.01, (v) => { ex().gamma = v; this.changed(); });
    node.append(e.el, o.el, g.el);
    return { node, sync: () => { e.set(ex().exposure); o.set(ex().offset); g.set(ex().gamma); } };
  }

  private buildGradientMap(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    const gm = (): Json => this.data.gradientMapSettings as Json;
    const shadows = colorRow('Shadows', (hex) => { gm().shadows = hexToUnit(hex); this.changed(); });
    const highlights = colorRow('Highlights', (hex) => { gm().highlights = hexToUnit(hex); this.changed(); });
    const reversed = checkRow('Reverse', (v) => { gm().reversed = v; this.changed(); });
    node.append(shadows.el, highlights.el, reversed.el);
    return { node, sync: () => { shadows.set(unitToHex(gm().shadows)); highlights.set(unitToHex(gm().highlights)); reversed.set(gm().reversed === true); } };
  }

  private buildGrain(): Section {
    const node = el('<div class="cv-panel-section"></div>');
    const gr = (): Record<string, number> => this.data.grainSettings as Record<string, number>;
    const amount = sliderRow('Amount', 0, 100, 1, (v) => { gr().amount = v; this.changed(); });
    const size = sliderRow('Size', 0.5, 20, 0.1, (v) => { gr().size = v; this.changed(); });
    const rough = sliderRow('Roughness', 0, 100, 1, (v) => { gr().roughness = v; this.changed(); });
    const reseed = el<HTMLButtonElement>('<button class="cv-btn" type="button">New grain pattern</button>');
    reseed.addEventListener('click', () => { gr().seed = randomSeed(); this.changed(); });
    node.append(amount.el, size.el, rough.el, reseed);
    return { node, sync: () => { amount.set(gr().amount); size.set(gr().size); rough.set(gr().roughness); } };
  }
}

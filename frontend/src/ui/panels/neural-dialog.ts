import type { Engine } from '../../engine';
import { deblock, depthBlur, harmonize, mixColor, skinSmooth } from '../../engine/neural';
import { colorizeReady, depthReady, localColorize, localDepth, localDepthValues, localStyle, styleReady } from '../../io/local-gen';
import { depthBytes } from '../../engine/doc-depth';
import { toBlob } from '../../engine/surface';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { selectRow, sliderRow } from './controls';

type NeuralKind = 'harmonize' | 'skinSmooth' | 'depthBlur' | 'colorize' | 'style' | 'jpeg' | 'superZoom';
export const NEURAL_LABELS: Record<NeuralKind, string> = { harmonize: 'Harmonize', skinSmooth: 'Skin Smoothing', depthBlur: 'Depth Blur', colorize: 'Colorize', style: 'Style Transfer', jpeg: 'JPEG Artifacts Removal', superZoom: 'Super Zoom' };
/** A layer's pixels as they are now (1.87.3, D17): its id, which raster it holds and that raster's change count, so a
 *  depth map, colouring or style made before an edit is not reused after it. */
const RASTER_IDS = new WeakMap<object, number>();
let rasterCount = 0;
function pixelsKey(l: { id: string; raster?: { version: number } | null }): string {
  const r = l.raster;
  if (!r) return l.id;
  let n = RASTER_IDS.get(r);
  if (n === undefined) { n = ++rasterCount; RASTER_IDS.set(r, n); }
  return `${l.id}:${n}:${r.version}`;
}

const STYLES: Array<[string, string]> = [['mosaic', 'Mosaic'], ['candy', 'Candy'], ['rain-princess', 'Rain Princess'], ['udnie', 'Udnie'], ['pointilism', 'Pointilism']];

/** Filter > Neural Filters (1.54.7, DEV_PLAN 23.2): a gallery of filters that run here, the first two without any
 *  model. Each filter's rows exist once and show for the chosen filter; the preview follows every change; OK is one
 *  step. Filters that need a model join this list as their pinned weights and licences land. */
export class NeuralFiltersDialog extends Dialog {
  private kind: NeuralKind = 'harmonize';
  private readonly s = { amount: 100, smooth: 60, radius: 6, focus: 70, range: 15, blur: 8, strength: 70 };
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private readonly rows: Array<{ el: HTMLElement; kinds: NeuralKind[] }> = [];
  private backdrop: ImageData | null = null;
  private depth: { layerId: string; map: Uint8ClampedArray } | null = null;
  private depthPending = false;
  private timer = 0;

  constructor(private readonly engine: Engine) {
    super('Neural Filters', 400);
    const pick = selectRow('Filter', (Object.keys(NEURAL_LABELS) as NeuralKind[]).map((k) => [k, NEURAL_LABELS[k]] as const), (v) => { this.kind = v as NeuralKind; this.showRows(); void this.ensureDepth(); void this.ensureColor(); void this.ensureStyle(); this.schedule(); });
    this.body.append(pick.el);
    const amount = sliderRow('Amount (%)', 0, 100, 1, (v) => { this.s.amount = v; this.schedule(); });
    const smooth = sliderRow('Smoothness (%)', 0, 100, 1, (v) => { this.s.smooth = v; this.schedule(); });
    const radius = sliderRow('Radius (px)', 1, 30, 1, (v) => { this.s.radius = v; this.schedule(); });
    const focus = sliderRow('Focus (near 100, far 0)', 0, 100, 1, (v) => { this.s.focus = v; this.schedule(); });
    const range = sliderRow('Sharp range (%)', 0, 100, 1, (v) => { this.s.range = v; this.schedule(); });
    const blur = sliderRow('Blur (px)', 1, 40, 1, (v) => { this.s.blur = v; this.schedule(); });
    const strength = sliderRow('Strength (%)', 0, 100, 1, (v) => { this.s.strength = v; this.schedule(); });
    const factor = selectRow('Factor', [['2', '2x'], ['4', '4x']], (v) => { this.factor = v === '4' ? 4 : 2; });
    const styleRow = selectRow('Style', STYLES, (v) => { this.style = v; this.styled = null; void this.ensureStyle(); });
    this.rows.push({ el: amount.el, kinds: ['harmonize', 'colorize', 'style'] }, { el: smooth.el, kinds: ['skinSmooth'] }, { el: radius.el, kinds: ['skinSmooth'] }, { el: focus.el, kinds: ['depthBlur'] }, { el: range.el, kinds: ['depthBlur'] }, { el: blur.el, kinds: ['depthBlur'] }, { el: styleRow.el, kinds: ['style'] }, { el: strength.el, kinds: ['jpeg'] }, { el: factor.el, kinds: ['superZoom'] });
    this.body.append(amount.el, smooth.el, radius.el, focus.el, range.el, blur.el, styleRow.el, strength.el, factor.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { window.clearTimeout(this.timer); this.engine.setPreview(null); this.backdrop = null; };
    this.showRows();
    this.remember(Array.from(pick.el.querySelectorAll('select')));   // the filter is the command's; each filter's settings are kept
  }

  show(kind: NeuralKind = this.kind): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (!p || !l?.raster || l.isGroup || l.adjustment) { this.engine.notice('Select a pixel layer first.'); return; }
    this.kind = kind;
    this.backdrop = this.engine.compositeBelow(l.id);
    if (this.depth?.layerId !== pixelsKey(l)) this.depth = null;
    if (this.color?.layerId !== pixelsKey(l)) this.color = null;
    if (this.styled?.layerId !== pixelsKey(l)) this.styled = null;
    this.showRows();
    this.open();
    void this.ensureDepth();
    void this.ensureColor();
    void this.ensureStyle();
    this.schedule();
  }

  /** The layer's depth map from the engine's Depth Anything (1.54.8), fetched once per layer; the download prompt when
   *  the model is absent. Only Depth Blur needs it. */
  private async ensureDepth(): Promise<void> {
    const l = this.engine.current?.activeLayer;
    if (this.kind !== 'depthBlur' || !l?.raster || this.depth?.layerId === pixelsKey(l) || this.depthPending) return;
    this.depthPending = true;
    try {
      if (!(await depthReady())) { setText(this.note, 'Depth Blur needs Depth Anything V2 Small (99 MB, Apache-2.0): download it in Preferences > Plugins > Local models.'); return; }
      const p = this.engine.current;
      if (p && l.raster.width === p.doc.width && l.raster.height === p.doc.height) {
        const shared = p.doc.depthMap?.key && this.engine.docDepth(p) ? p.doc.depthMap : null;
        if (!shared) setText(this.note, 'Reading the depth of this document...');
        const d = shared ?? await this.engine.ensureDocDepth(localDepthValues);
        if (d) {
          this.depth = { layerId: pixelsKey(l), map: new Uint8ClampedArray(depthBytes(d, d.w, d.h)) };
          this.showRows();
          this.schedule();
          return;
        }
      }
      setText(this.note, 'Reading the depth of this layer...');
      const blob = await toBlob(l.raster.canvas);
      const png = await localDepth(blob), bmp = await createImageBitmap(png), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d') as CanvasRenderingContext2D; g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, map = new Uint8ClampedArray(c.width * c.height);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) map[j] = d[i];
      this.depth = { layerId: pixelsKey(l), map };
      this.showRows();
      this.schedule();
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The depth could not be read.'); }
    finally { this.depthPending = false; }
  }

  private showRows(): void {
    for (const r of this.rows) r.el.style.visibility = r.kinds.includes(this.kind) ? '' : 'hidden';
    setText(this.note, this.kind === 'harmonize' ? 'Harmonize moves the layer\'s light and colour toward what lies beneath it (its mean and spread per channel), by the amount.'
      : this.kind === 'skinSmooth' ? 'Skin Smoothing softens skin tones only: other pixels are untouched.'
      : this.kind === 'jpeg' ? 'JPEG Artifacts Removal smooths the steps on JPEG\'s 8-pixel grid and flat-area noise, keeping real edges; no model yet.'
      : this.kind === 'superZoom' ? 'Super Zoom enlarges the layer with Real-ESRGAN on this computer (Image > Upscale), 2x or 4x, into a new layer.'
      : this.kind === 'style' ? (this.styled ? 'Style Transfer repaints the layer in the chosen style on this computer (five presets, BSD-3-Clause); Amount mixes it in.' : 'Style Transfer repaints the layer in a preset style on this computer.')
      : this.kind === 'colorize' ? (this.color ? 'Colorize predicts the layer\'s colour with DDColor-tiny on this computer, keeping its own light; Amount mixes it in.' : 'Colorize reads the layer\'s colour with DDColor-tiny on this computer.')
      : this.depth ? 'Depth Blur blurs by distance from the focus depth, read by Depth Anything V2 Small on this computer.' : 'Depth Blur reads the layer\'s depth with Depth Anything V2 Small on this computer.');
  }

  private run(): (src: ImageData) => ImageData {
    const s = { ...this.s }, back = this.backdrop, depth = this.depth?.map ?? null, color = this.color?.pixels ?? null, styled = this.styled?.pixels ?? null;
    return this.kind === 'harmonize' ? (src) => (back ? harmonize(src, back, s.amount / 100) : src)
      : this.kind === 'skinSmooth' ? (src) => skinSmooth(src, s.smooth / 100, s.radius)
      : this.kind === 'jpeg' ? (src) => deblock(src, s.strength / 100)
      : this.kind === 'superZoom' ? (src) => src
      : this.kind === 'style' ? (src) => (styled && styled.width === src.width && styled.height === src.height ? mixColor(src, styled, s.amount / 100) : src)
      : this.kind === 'colorize' ? (src) => (color && color.width === src.width && color.height === src.height ? mixColor(src, color, s.amount / 100) : src)
      : (src) => (depth ? depthBlur(src, depth, s.focus * 2.55, s.range * 2.55, s.blur) : src);
  }

  /** The layer colourised by the engine's DDColor (1.54.9), fetched once per layer; the download prompt when absent. */
  private color: { layerId: string; pixels: ImageData } | null = null;
  private colorPending = false;
  private async ensureColor(): Promise<void> {
    const l = this.engine.current?.activeLayer;
    if (this.kind !== 'colorize' || !l?.raster || this.color?.layerId === pixelsKey(l) || this.colorPending) return;
    this.colorPending = true;
    try {
      if (!(await colorizeReady())) { setText(this.note, 'Colorize needs DDColor-tiny (135 MB, Apache-2.0): download it in Preferences > Plugins > Local models.'); return; }
      setText(this.note, 'Colouring this layer...');
      const png = await localColorize(await toBlob(l.raster.canvas)), bmp = await createImageBitmap(png), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d') as CanvasRenderingContext2D; g.drawImage(bmp, 0, 0);
      this.color = { layerId: pixelsKey(l), pixels: g.getImageData(0, 0, c.width, c.height) };
      this.showRows();
      this.schedule();
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The colour could not be read.'); }
    finally { this.colorPending = false; }
  }

  /** The layer in the chosen preset style from the engine (1.55.1), fetched once per layer and style. */
  private style = 'mosaic';
  private styled: { layerId: string; style: string; pixels: ImageData } | null = null;
  private stylePending = false;
  private async ensureStyle(): Promise<void> {
    const l = this.engine.current?.activeLayer;
    if (this.kind !== 'style' || !l?.raster || (this.styled?.layerId === pixelsKey(l) && this.styled.style === this.style) || this.stylePending) return;
    this.stylePending = true;
    try {
      if (!(await styleReady())) { setText(this.note, 'Style Transfer needs the five preset models (34 MB, BSD-3-Clause): download them in Preferences > Plugins > Local models.'); return; }
      setText(this.note, 'Painting this layer in the style...');
      const png = await localStyle(await toBlob(l.raster.canvas), this.style), bmp = await createImageBitmap(png), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d') as CanvasRenderingContext2D; g.drawImage(bmp, 0, 0);
      this.styled = { layerId: pixelsKey(l), style: this.style, pixels: g.getImageData(0, 0, c.width, c.height) };
      this.showRows();
      this.schedule();
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The style could not be read.'); }
    finally { this.stylePending = false; }
  }

  private schedule(): void {
    if (!this.isOpen) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.engine.previewImageEdit(this.run()), 60);
  }

  private apply(): void {
    window.clearTimeout(this.timer);
    const run = this.run(), kind = this.kind, factor = this.factor;
    this.close();
    if (kind === 'superZoom') { this.onSuperZoom?.(factor); return; }
    this.engine.applyImageEdit(NEURAL_LABELS[kind], run);
  }

  /** Super Zoom (1.55.2) is Real-ESRGAN's Upscale, already shipped: the app runs it with the chosen factor. */
  onSuperZoom: ((factor: 2 | 4) => void) | null = null;
  private factor: 2 | 4 = 2;
}

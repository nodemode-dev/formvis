import { createSurface, ctxOf, type Engine } from '../../engine';
import { levelsOf } from '../../engine/matte';
import { DEFAULT_REFINE, refineRegion, refineSelection, type RefineSettings } from '../../engine/select-mask';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow } from './controls';

const PW = 640, PH = 440;
type View = 'onionSkin' | 'marchingAnts' | 'overlay' | 'onBlack' | 'onWhite' | 'blackWhite' | 'onLayers';
type Output = 'selection' | 'mask' | 'layer' | 'layerMask';

/** Select > Select and Mask (Alt+Mod+R), Photoshop's workspace: the image with the selection shown as Overlay, On
 *  Black, On White or Black & White; Radius, Smooth, Feather, Contrast and Shift Edge; Output To the selection, a
 *  layer mask, a new layer or a new layer with a mask. The preview is refined at its own scale and OK refines at full
 *  resolution. The preview keeps one size, so the dialog never resizes. */
export class SelectMaskDialog extends Dialog {
  private s: RefineSettings = { ...DEFAULT_REFINE };
  private view: View = 'overlay';
  private output: Output = 'selection';
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private pw = 1;
  private ph = 1;
  private image: ImageData | null = null;
  private guide: Float32Array | null = null;
  private mask: Float32Array | null = null;
  /** The Refine Edge brush's painted region at preview size (0 to 1), and Decontaminate Colors. */
  private region: Float32Array | null = null;
  private brushOn = false;
  private brushSize = 30;
  private painting = false;
  private decon = false;
  private deconAmount = 100;

  /** A soft round dab of the Refine Edge brush at the pointer, in preview pixels (the size is in document pixels). */
  private paint(e: PointerEvent): void {
    const region = this.region;
    if (!region) return;
    const b = this.canvas.getBoundingClientRect(), px = ((e.clientX - b.left) / b.width) * PW - this.ox, py = ((e.clientY - b.top) / b.height) * PH - this.oy;
    const r = Math.max(1, (this.brushSize / 2) * this.scale);
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(this.ph - 1, Math.ceil(py + r)); y++) {
      for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(this.pw - 1, Math.ceil(px + r)); x++) {
        const d = Math.hypot(x - px, y - py) / r;
        if (d < 1) { const i = y * this.pw + x; region[i] = Math.max(region[i], 1 - d * d); }
      }
    }
    this.render();
  }
  private frame = 0;
  private readonly canvas = el(`<canvas class="cv-mask-canvas" width="${PW}" height="${PH}"></canvas>`) as HTMLCanvasElement;

  constructor(private readonly engine: Engine) {
    super('Select and Mask', PW + 48);
    const viewRow = selectRow('View', [['onionSkin', 'Onion Skin'], ['marchingAnts', 'Marching Ants'], ['overlay', 'Overlay'], ['onBlack', 'On Black'], ['onWhite', 'On White'], ['blackWhite', 'Black & White'], ['onLayers', 'On Layers']], (v) => { this.view = v as View; this.render(); });
    const rows = ([['radius', 'Radius (px)', 0, 100], ['smooth', 'Smooth', 0, 100], ['feather', 'Feather (px)', 0, 100], ['contrast', 'Contrast (%)', 0, 100], ['shift', 'Shift Edge (px)', -20, 20]] as const)
      .map(([k, label, min, max]) => { const r = sliderRow(label, min, max, 1, (v) => { this.s = { ...this.s, [k]: v }; this.render(); }); return { k, r }; });
    // The Refine Edge brush: while on, painting on the preview marks where the edge is worked out again from the image.
    const brushRow = checkRow('Refine Edge Brush (paint on the preview)', (v) => { this.brushOn = v; this.canvas.classList.toggle('is-brush', v); });
    const sizeRow = sliderRow('Brush Size (px)', 2, 200, 1, (v) => { this.brushSize = v; });
    const outRow = selectRow('Output To', [['selection', 'Selection'], ['mask', 'Layer Mask'], ['layer', 'New Layer'], ['layerMask', 'New Layer with Layer Mask']], (v) => { this.output = v as Output; });
    // Decontaminate Colors: as in Photoshop, it writes new pixels, so it outputs to a new layer.
    const deconRow = checkRow('Decontaminate Colors', (v) => {
      this.decon = v;
      if (v && (this.output === 'selection' || this.output === 'mask')) { this.output = 'layerMask'; outRow.set(this.output); }
    });
    const amountRow = sliderRow('Amount (%)', 0, 100, 1, (v) => { this.deconAmount = v; });
    this.body.append(this.canvas, viewRow.el, ...rows.map((x) => x.r.el), brushRow.el, sizeRow.el, deconRow.el, amountRow.el, outRow.el);
    this.syncRows = () => { viewRow.set(this.view); outRow.set(this.output); for (const { k, r } of rows) r.set(this.s[k]); brushRow.set(this.brushOn); sizeRow.set(this.brushSize); deconRow.set(this.decon); amountRow.set(this.deconAmount); };
    this.canvas.addEventListener('pointerdown', (e) => { if (!this.brushOn) return; this.painting = true; this.canvas.setPointerCapture(e.pointerId); this.paint(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.painting) this.paint(e); });
    const stop = (e: PointerEvent): void => { this.painting = false; if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId); };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.image = null; this.guide = null; this.mask = null; };
  }

  private syncRows: () => void = () => undefined;

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    if (!p.selection) { toast('Make a selection first, then refine it here.'); return; }
    this.engine.settle();
    const flat = this.engine.flattened();
    if (!flat) return;
    const W = p.doc.width, H = p.doc.height;
    this.scale = Math.min(1, PW / W, PH / H);
    this.pw = Math.max(1, Math.round(W * this.scale)); this.ph = Math.max(1, Math.round(H * this.scale));
    this.ox = Math.floor((PW - this.pw) / 2); this.oy = Math.floor((PH - this.ph) / 2);
    const small = createSurface(this.pw, this.ph), sc = ctxOf(small);
    sc.drawImage(flat, 0, 0, this.pw, this.ph);
    this.image = sc.getImageData(0, 0, this.pw, this.ph);
    this.guide = levelsOf(this.image, true);
    const ms = createSurface(this.pw, this.ph), mc = ctxOf(ms), sel = p.selection;
    mc.drawImage(sel.surface(), sel.x * this.scale, sel.y * this.scale, sel.w * this.scale, sel.h * this.scale);
    const md = mc.getImageData(0, 0, this.pw, this.ph).data;
    this.mask = new Float32Array(this.pw * this.ph);
    this.region = new Float32Array(this.pw * this.ph);
    for (let i = 0; i < this.mask.length; i++) this.mask[i] = md[i * 4 + 3] / 255;
    this.syncRows();
    this.render();
    this.open();
  }

  private render(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const img = this.image, guide = this.guide, mask = this.mask, g = this.canvas.getContext('2d');
      if (!img || !guide || !mask || !g) return;
      const m0 = refineSelection(mask, guide, this.pw, this.ph, this.s, this.scale), m = this.region ? refineRegion(m0, guide, this.region, this.pw, this.ph, this.s.radius, this.scale) : m0;
      const out = new ImageData(this.pw, this.ph), d = out.data, s = img.data;
      const checker = (i: number): number => ((((i % this.pw) >> 3) + ((Math.floor(i / this.pw)) >> 3)) % 2 ? 204 : 255);
      for (let i = 0; i < m.length; i++) {
        const k = i * 4, a = m[i];
        if (this.view === 'onionSkin' || this.view === 'onLayers') {
          // Onion Skin: the unselected part half there over a checkerboard; On Layers: only the selected pixels.
          const vis = this.view === 'onionSkin' ? a + (1 - a) * 0.5 : a, bg = checker(i);
          for (let c = 0; c < 3; c++) d[k + c] = Math.round(s[k + c] * vis + bg * (1 - vis));
          d[k + 3] = 255;
          continue;
        }
        if (this.view === 'marchingAnts') {
          // Marching Ants: the image with its edge (where the mask crosses one half) dashed black and white.
          const x = i % this.pw, y = Math.floor(i / this.pw), inside = a >= 0.5;
          const edge = (x > 0 && (m[i - 1] >= 0.5) !== inside) || (y > 0 && (m[i - this.pw] >= 0.5) !== inside);
          const ant = ((x + y) >> 2) % 2 ? 0 : 255;
          for (let c = 0; c < 3; c++) d[k + c] = edge ? ant : s[k + c];
          d[k + 3] = 255;
          continue;
        }
        if (this.view === 'blackWhite') { const v = Math.round(a * 255); d[k] = d[k + 1] = d[k + 2] = v; }
        else if (this.view === 'overlay') { d[k] = Math.round(s[k] * (a + (1 - a) * 0.5) + 255 * (1 - a) * 0.5); d[k + 1] = Math.round(s[k + 1] * (a + (1 - a) * 0.5)); d[k + 2] = Math.round(s[k + 2] * (a + (1 - a) * 0.5)); }
        else { const bg = this.view === 'onWhite' ? 255 : 0; d[k] = Math.round(s[k] * a + bg * (1 - a)); d[k + 1] = Math.round(s[k + 1] * a + bg * (1 - a)); d[k + 2] = Math.round(s[k + 2] * a + bg * (1 - a)); }
        d[k + 3] = 255;
      }
      g.clearRect(0, 0, PW, PH);
      g.putImageData(out, this.ox, this.oy);
    });
  }

  private apply(): void {
    const p = this.engine.current, sel = p?.selection, flat = this.engine.flattened(), s = { ...this.s }, output = this.output;
    const region = this.region, pw = this.pw, ph = this.ph, scale = this.scale, decon = this.decon ? this.deconAmount : 0;
    this.close();
    if (!p || !sel || !flat) return;
    const W = p.doc.width, H = p.doc.height, guide = levelsOf(ctxOf(flat).getImageData(0, 0, W, H), true), mask = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = sel.valueAt(x, y) / 255;
    let m = refineSelection(mask, guide, W, H, s, 1);
    // The Refine Edge brush's region, from preview size to document size (each document pixel reads the preview pixel over it).
    if (region?.some((v) => v > 0)) {
      const full = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) full[y * W + x] = region[Math.min(ph - 1, Math.floor(y * scale)) * pw + Math.min(pw - 1, Math.floor(x * scale))];
      m = refineRegion(m, guide, full, W, H, s.radius, 1);
    }
    const data = new Uint8Array(W * H);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, m[i])) * 255);
    this.engine.applyRefinedSelection(data, output, decon);
  }
}

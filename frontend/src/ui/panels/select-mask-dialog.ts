import { createSurface, ctxOf, type Engine } from '../../engine';
import { levelsOf } from '../../engine/matte';
import { DEFAULT_REFINE, refineSelection, type RefineSettings } from '../../engine/select-mask';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { toast } from '../toast';
import { selectRow, sliderRow } from './controls';

const PW = 640, PH = 440;
type View = 'overlay' | 'onBlack' | 'onWhite' | 'blackWhite';
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
  private frame = 0;
  private readonly canvas = el(`<canvas class="cv-liquify-canvas" width="${PW}" height="${PH}"></canvas>`) as HTMLCanvasElement;

  constructor(private readonly engine: Engine) {
    super('Select and Mask', PW + 48);
    const viewRow = selectRow('View', [['overlay', 'Overlay'], ['onBlack', 'On Black'], ['onWhite', 'On White'], ['blackWhite', 'Black & White']], (v) => { this.view = v as View; this.render(); });
    const rows = ([['radius', 'Radius (px)', 0, 100], ['smooth', 'Smooth', 0, 100], ['feather', 'Feather (px)', 0, 100], ['contrast', 'Contrast (%)', 0, 100], ['shift', 'Shift Edge (px)', -20, 20]] as const)
      .map(([k, label, min, max]) => { const r = sliderRow(label, min, max, 1, (v) => { this.s = { ...this.s, [k]: v }; this.render(); }); return { k, r }; });
    const outRow = selectRow('Output To', [['selection', 'Selection'], ['mask', 'Layer Mask'], ['layer', 'New Layer'], ['layerMask', 'New Layer with Layer Mask']], (v) => { this.output = v as Output; });
    this.body.append(this.canvas, viewRow.el, ...rows.map((x) => x.r.el), outRow.el);
    this.syncRows = () => { viewRow.set(this.view); outRow.set(this.output); for (const { k, r } of rows) r.set(this.s[k]); };
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
      const m = refineSelection(mask, guide, this.pw, this.ph, this.s, this.scale), out = new ImageData(this.pw, this.ph), d = out.data, s = img.data;
      for (let i = 0; i < m.length; i++) {
        const k = i * 4, a = m[i];
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
    this.close();
    if (!p || !sel || !flat) return;
    const W = p.doc.width, H = p.doc.height, guide = levelsOf(ctxOf(flat).getImageData(0, 0, W, H), true), mask = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = sel.valueAt(x, y) / 255;
    const m = refineSelection(mask, guide, W, H, s, 1), data = new Uint8Array(W * H);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, m[i])) * 255);
    this.engine.applyRefinedSelection(data, output);
  }
}

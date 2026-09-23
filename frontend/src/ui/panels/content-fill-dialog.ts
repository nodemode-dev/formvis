import { createSurface, ctxOf, type Engine } from '../../engine';
import { contentFill, premultiply, unpremultiply } from '../../engine/retouch';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow } from './controls';

const PW = 640, PH = 440;
type Sampling = 'auto' | 'rectangular' | 'custom';
type Output = 'current' | 'new' | 'duplicate';

/** Edit > Content-Aware Fill, Photoshop's workspace: the document with the sampling area tinted green and the area
 *  to fill red. Sampling Area is Auto (around the selection), Rectangular (a box around it) or Custom (painted here,
 *  Alt to erase); Show Result fills the preview so the choice can be judged; Output To the current layer, a new layer
 *  or a duplicate. OK fills at full resolution through Engine.contentAwareFillWith. The preview keeps one size. */
export class ContentFillDialog extends Dialog {
  private sampling: Sampling = 'auto';
  private output: Output = 'current';
  private brush = 40;
  private showResult = false;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private pw = 1;
  private ph = 1;
  private image: ImageData | null = null;
  private hole: Uint8Array | null = null;
  private allow: Uint8Array | null = null;
  private result: ImageData | null = null;
  private frame = 0;
  private painting = false;
  private readonly canvas = el(`<canvas class="cv-fill-canvas" width="${PW}" height="${PH}"></canvas>`) as HTMLCanvasElement;
  private readonly brushRow = sliderRow('Brush size (px)', 4, 200, 1, (v) => { this.brush = v; });

  constructor(private readonly engine: Engine) {
    super('Content-Aware Fill', PW + 48);
    const samplingRow = selectRow('Sampling Area', [['auto', 'Auto'], ['rectangular', 'Rectangular'], ['custom', 'Custom']], (v) => { this.sampling = v as Sampling; this.rebuildAllow(); });
    const resultRow = checkRow('Show Result', (v) => { this.showResult = v; this.refresh(); });
    const outRow = selectRow('Output To', [['current', 'Current Layer'], ['new', 'New Layer'], ['duplicate', 'Duplicate Layer']], (v) => { this.output = v as Output; });
    this.body.append(this.canvas, samplingRow.el, this.brushRow.el, resultRow.el, outRow.el);
    this.sync = () => { samplingRow.set(this.sampling); outRow.set(this.output); resultRow.set(this.showResult); this.brushRow.set(this.brush); this.syncBrush(); };
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.image = null; this.hole = null; this.allow = null; this.result = null; };
    this.bindCanvas();
  }

  private sync: () => void = () => undefined;

  private syncBrush(): void { const off = this.sampling !== 'custom'; this.brushRow.el.classList.toggle('is-off', off); for (const i of this.brushRow.el.querySelectorAll('input')) i.disabled = off; }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    if (!p.selection) { toast('Select the area to fill first.'); return; }
    if (!p.activeLayer?.raster) { toast('Select a pixel layer first.'); return; }
    this.engine.settle();
    const flat = this.engine.flattened();
    if (!flat) return;
    const W = p.doc.width, H = p.doc.height, sel = p.selection;
    this.scale = Math.min(1, PW / W, PH / H);
    this.pw = Math.max(1, Math.round(W * this.scale)); this.ph = Math.max(1, Math.round(H * this.scale));
    this.ox = Math.floor((PW - this.pw) / 2); this.oy = Math.floor((PH - this.ph) / 2);
    const small = createSurface(this.pw, this.ph), sc = ctxOf(small);
    sc.drawImage(flat, 0, 0, this.pw, this.ph);
    this.image = sc.getImageData(0, 0, this.pw, this.ph);
    const ms = createSurface(this.pw, this.ph), mc = ctxOf(ms);
    mc.drawImage(sel.surface(), sel.x * this.scale, sel.y * this.scale, sel.w * this.scale, sel.h * this.scale);
    const md = mc.getImageData(0, 0, this.pw, this.ph).data;
    this.hole = new Uint8Array(this.pw * this.ph);
    for (let i = 0; i < this.hole.length; i++) this.hole[i] = md[i * 4 + 3] >= 128 ? 1 : 0;
    this.rebuildAllow();
    this.sync();
    this.open();
  }

  /** The sampling area for the current choice, at preview scale. Auto shows the region the fill searches by default. */
  private rebuildAllow(): void {
    const hole = this.hole;
    if (!hole) return;
    let x0 = this.pw, y0 = this.ph, x1 = -1, y1 = -1;
    for (let y = 0; y < this.ph; y++) for (let x = 0; x < this.pw; x++) if (hole[y * this.pw + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const ext = Math.max(x1 - x0 + 1, y1 - y0 + 1), m = this.sampling === 'rectangular' ? Math.max(8, Math.round(ext * 0.5)) : Math.max(12, Math.min(Math.round(160 * this.scale), ext));
    if (this.sampling !== 'custom' || !this.allow) {
      const a = new Uint8Array(this.pw * this.ph);
      for (let y = Math.max(0, y0 - m); y <= Math.min(this.ph - 1, y1 + m); y++) for (let x = Math.max(0, x0 - m); x <= Math.min(this.pw - 1, x1 + m); x++) if (!hole[y * this.pw + x]) a[y * this.pw + x] = 1;
      this.allow = a;
    }
    this.syncBrush();
    this.refresh();
  }

  private bindCanvas(): void {
    const c = this.canvas, at = (e: PointerEvent): [number, number] => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * PW - this.ox, ((e.clientY - r.top) / r.height) * PH - this.oy]; };
    const paint = (e: PointerEvent): void => {
      const a = this.allow, hole = this.hole;
      if (!a || !hole || this.sampling !== 'custom') return;
      const [cx, cy] = at(e), rad = (this.brush * this.scale) / 2, v = e.altKey ? 0 : 1;
      for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(this.ph - 1, Math.ceil(cy + rad)); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(this.pw - 1, Math.ceil(cx + rad)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad && !hole[y * this.pw + x]) a[y * this.pw + x] = v;
      }
      this.refresh(false);
    };
    c.addEventListener('pointerdown', (e) => { if (e.button !== 0 || this.sampling !== 'custom') return; c.setPointerCapture(e.pointerId); this.painting = true; paint(e); });
    c.addEventListener('pointermove', (e) => { if (this.painting) paint(e); });
    const end = (e: PointerEvent): void => { if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId); if (this.painting) { this.painting = false; this.refresh(); } };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  /** Redraws on the next frame; `fill` also recomputes the result preview when Show Result is on. */
  private refresh(fill = true): void {
    if (fill) this.result = null;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const img = this.image, hole = this.hole, allow = this.allow, g = this.canvas.getContext('2d');
      if (!img || !hole || !allow || !g) return;
      if (this.showResult && !this.result) {
        const pm = premultiply(img.data);
        if (contentFill(pm, hole, this.pw, this.ph, this.sampling === 'auto' ? null : allow)) { const r = new ImageData(this.pw, this.ph); unpremultiply(pm, r.data); this.result = r; }
      }
      const base = this.showResult && this.result ? this.result : img, out = new ImageData(this.pw, this.ph), d = out.data, s = base.data;
      for (let i = 0; i < hole.length; i++) {
        const k = i * 4, tint = this.showResult ? 0 : hole[i] ? 1 : allow[i] ? 2 : 0;
        d[k] = tint === 1 ? Math.round(s[k] * 0.5 + 127) : tint === 2 ? Math.round(s[k] * 0.65) : s[k];
        d[k + 1] = tint === 1 ? Math.round(s[k + 1] * 0.5) : tint === 2 ? Math.round(s[k + 1] * 0.65 + 89) : s[k + 1];
        d[k + 2] = tint === 1 ? Math.round(s[k + 2] * 0.5) : tint === 2 ? Math.round(s[k + 2] * 0.65) : s[k + 2];
        d[k + 3] = 255;
      }
      g.clearRect(0, 0, PW, PH);
      g.putImageData(out, this.ox, this.oy);
    });
  }

  private apply(): void {
    const p = this.engine.current, a = this.allow, sampling = this.sampling, output = this.output, s = this.scale, pw = this.pw, ph = this.ph;
    this.close();
    if (!p) return;
    let allowDoc: Uint8Array | null = null;
    if (sampling !== 'auto' && a) {
      const W = p.doc.width, H = p.doc.height;
      allowDoc = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) allowDoc[y * W + x] = a[Math.min(ph - 1, Math.floor(y * s)) * pw + Math.min(pw - 1, Math.floor(x * s))];
    }
    this.engine.contentAwareFillWith(allowDoc, output);
  }
}

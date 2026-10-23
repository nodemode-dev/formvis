import { SelectionMask, createSurface, ctxOf, type Engine } from '../../engine';
import { FILL_DEFAULTS, FILL_PREFERENCE_DEFAULT, FILL_PREFERENCE_MAX, contentFill, premultiply, unpremultiply, type FillOptions } from '../../engine/retouch';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow } from './controls';

const PW = 640, PH = 440;
type Sampling = 'auto' | 'rectangular' | 'custom';
type Output = 'current' | 'new' | 'duplicate';
type FillTool = 'brush' | 'lassoAdd' | 'lassoSub' | 'hand';

/** Edit > Selection-Aware Fill: the document with the sampling area tinted green and the area
 *  to fill red. Sampling Area is Auto (around the selection), Rectangular (an automatic box around it) or Custom (a
 *  preference painted here, Alt to erase). A painted area is only a preference: patches there get a lower cost, scaled
 *  by Preference Strength, and the fill still searches the rest of the picture; nothing painted ever shuts it out.
 *  Show Result fills the preview so the choice can be judged; Output To the current layer, a new layer
 *  or a duplicate. OK fills at full resolution through Engine.contentAwareFillWith. The preview keeps one size. */
export class ContentFillDialog extends Dialog {
  private sampling: Sampling = 'auto';
  private output: Output = 'current';
  private brush = 40;
  private strength = FILL_PREFERENCE_DEFAULT;
  private showResult = false;
  private sampleAll = false;
  private subtract = false;
  private opts: FillOptions = { ...FILL_DEFAULTS };
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
  private tool: FillTool = 'brush';
  private channel = 3;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private pan: { cx: number; cy: number; px: number; py: number } | null = null;
  private lasso: Array<[number, number]> | null = null;
  /** The fill area's lasso edits, in document pixels, applied in order over the selection. */
  private edits: Array<{ add: boolean; pts: Array<[number, number]> }> = [];
  private hole0: Uint8Array | null = null;
  private selRef: SelectionMask | null = null;
  private readonly buf = createSurface(PW, PH);
  private readonly canvas = el(`<canvas class="cv-fill-canvas" width="${PW}" height="${PH}"></canvas>`) as HTMLCanvasElement;
  private readonly brushRow = sliderRow('Brush size (px)', 4, 200, 1, (v) => { this.brush = v; });
  private readonly strengthRow = sliderRow('Preference Strength', 0, FILL_PREFERENCE_MAX, 0.05, (v) => { this.strength = v; this.refresh(); });

  constructor(private readonly engine: Engine) {
    super('Selection-Aware Fill', PW + 48);
    const samplingRow = selectRow('Sampling Area', [['auto', 'Auto'], ['rectangular', 'Rectangular'], ['custom', 'Custom']], (v) => { this.sampling = v as Sampling; this.rebuildAllow(); });
    const resultRow = checkRow('Show Result', (v) => { this.showResult = v; this.refresh(); });
    const outRow = selectRow('Output To', [['current', 'Current Layer'], ['new', 'New Layer'], ['duplicate', 'Duplicate Layer']], (v) => { this.output = v as Output; });
    const colorRow = selectRow('Color Adaptation', [['0', 'None'], ['1', 'Default'], ['2', 'High'], ['3', 'Very High']], (v) => { this.opts = { ...this.opts, color: Number(v) }; this.refresh(); });
    const rotRow = selectRow('Rotation Adaptation', [['0', 'None'], ['1', 'Low'], ['2', 'Medium'], ['3', 'High'], ['4', 'Full']], (v) => { this.opts = { ...this.opts, rotation: Number(v) }; this.refresh(); });
    const scaleRow = checkRow('Scale', (v) => { this.opts = { ...this.opts, scale: v }; this.refresh(); });
    const mirrorRow = checkRow('Mirror', (v) => { this.opts = { ...this.opts, mirror: v }; this.refresh(); });
    const modeRow = selectRow('Sampling Brush', [['add', 'Add to sampling area'], ['subtract', 'Subtract from sampling area']], (v) => { this.subtract = v === 'subtract'; });
    const allRow = checkRow('Sample All Layers', (v) => { this.sampleAll = v; });
    const toolRow = selectRow('Tool', [['brush', 'Sampling brush'], ['lassoAdd', 'Fill area lasso: add'], ['lassoSub', 'Fill area lasso: subtract'], ['hand', 'Hand']], (v) => { this.tool = v as FillTool; this.canvas.style.cursor = this.cursor(); });
    const channelRow = selectRow('Channel', [['3', 'All (RGB)'], ['0', 'Red only'], ['1', 'Green only'], ['2', 'Blue only']], (v) => { this.channel = Number(v); this.refresh(); });
    const bar = el('<div class="cv-fill-tools"><button class="cv-btn" type="button" data-act="in" title="Zoom in">Zoom in</button><button class="cv-btn" type="button" data-act="out" title="Zoom out">Zoom out</button><button class="cv-btn" type="button" data-act="fit" title="Fit the preview in the window">Fit</button><button class="cv-btn" type="button" data-act="reset" title="Put the fill area back to the selection">Reset fill area</button></div>');
    bar.addEventListener('click', (e) => {
      const act = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-act]')?.dataset.act : undefined;
      if (act === 'in') this.zoomBy(1.5, PW / 2, PH / 2);
      else if (act === 'out') this.zoomBy(1 / 1.5, PW / 2, PH / 2);
      else if (act === 'fit') { this.zoom = 1; this.panX = 0; this.panY = 0; this.refresh(false); }
      else if (act === 'reset') { this.edits = []; this.rebuildHole(); }
    });
    this.body.append(this.canvas, bar, toolRow.el, samplingRow.el, modeRow.el, this.brushRow.el, this.strengthRow.el, colorRow.el, rotRow.el, scaleRow.el, mirrorRow.el, channelRow.el, resultRow.el, allRow.el, outRow.el);
    this.sync = () => {
      toolRow.set(this.tool); channelRow.set(String(this.channel));
      modeRow.set(this.subtract ? 'subtract' : 'add'); allRow.set(this.sampleAll);
      samplingRow.set(this.sampling); outRow.set(this.output); resultRow.set(this.showResult); this.brushRow.set(this.brush); this.strengthRow.set(this.strength); this.syncBrush();
      colorRow.set(String(this.opts.color)); rotRow.set(String(this.opts.rotation)); scaleRow.set(this.opts.scale); mirrorRow.set(this.opts.mirror);
    };
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.image = null; this.hole = null; this.hole0 = null; this.selRef = null; this.edits = []; this.lasso = null; this.pan = null; this.allow = null; this.result = null; };
    this.bindCanvas();
    this.remember();
  }

  private sync: () => void = () => undefined;

  private syncBrush(): void {
    const off = this.sampling !== 'custom';
    for (const row of [this.brushRow, this.strengthRow]) { row.el.classList.toggle('is-off', off); for (const i of row.el.querySelectorAll('input')) i.disabled = off; }
  }

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
    this.hole0 = this.hole.slice();
    this.selRef = sel;
    this.edits = []; this.lasso = null; this.zoom = 1; this.panX = 0; this.panY = 0; this.tool = 'brush'; this.channel = 3;
    this.canvas.style.cursor = this.cursor();
    this.rebuildAllow();
    this.sync();
    this.open();
  }

  /** The sampling area for the current choice, at preview scale. Auto shows the region the fill searches by default;
   *  Rectangular's box limits the search; Custom starts from that region and the brush edits it into the painted preference. */
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
    const c = this.canvas, raw = (e: { clientX: number; clientY: number }): [number, number] => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * PW, ((e.clientY - r.top) / r.height) * PH]; };
    const at = (e: PointerEvent): [number, number] => { const [x, y] = raw(e); return [(x - this.panX) / this.zoom - this.ox, (y - this.panY) / this.zoom - this.oy]; };
    const paint = (e: PointerEvent): void => {
      const a = this.allow, hole = this.hole;
      if (!a || !hole || this.sampling !== 'custom') return;
      const [cx, cy] = at(e), rad = (this.brush * this.scale) / 2, v = e.altKey !== this.subtract ? 0 : 1;
      for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(this.ph - 1, Math.ceil(cy + rad)); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(this.pw - 1, Math.ceil(cx + rad)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad && !hole[y * this.pw + x]) a[y * this.pw + x] = v;
      }
      this.refresh(false);
    };
    c.addEventListener('pointerdown', (e) => {
      const hand = this.tool === 'hand' || e.button === 1;
      if (hand) { const [x, y] = raw(e); c.setPointerCapture(e.pointerId); this.pan = { cx: x, cy: y, px: this.panX, py: this.panY }; c.style.cursor = 'grabbing'; return; }
      if (e.button !== 0) return;
      if (this.tool === 'lassoAdd' || this.tool === 'lassoSub') { c.setPointerCapture(e.pointerId); this.lasso = [at(e)]; this.refresh(false); return; }
      if (this.sampling !== 'custom') return;
      c.setPointerCapture(e.pointerId); this.painting = true; paint(e);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.pan) { const [x, y] = raw(e); this.panX = this.pan.px + x - this.pan.cx; this.panY = this.pan.py + y - this.pan.cy; this.clampPan(); this.refresh(false); return; }
      if (this.lasso) { this.lasso.push(at(e)); this.refresh(false); return; }
      if (this.painting) paint(e);
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = raw(e); this.zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y); }, { passive: false });
    const end = (e: PointerEvent): void => {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      if (this.pan) { this.pan = null; c.style.cursor = this.cursor(); return; }
      if (this.lasso) {
        const pts = this.lasso;
        this.lasso = null;
        if (pts.length >= 3) { this.edits.push({ add: this.tool === 'lassoAdd', pts: pts.map(([x, y]) => [x / this.scale, y / this.scale]) }); this.rebuildHole(); } else this.refresh(false);
        return;
      }
      if (this.painting) { this.painting = false; this.refresh(); }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  private cursor(): string { return this.tool === 'hand' ? 'grab' : 'crosshair'; }

  private clampPan(): void {
    this.panX = Math.min(0, Math.max(PW - PW * this.zoom, this.panX));
    this.panY = Math.min(0, Math.max(PH - PH * this.zoom, this.panY));
  }

  /** Zooms the preview by `k` (1 to 8 times) about the canvas point (x, y), which stays where it is. */
  private zoomBy(k: number, x: number, y: number): void {
    const z = Math.min(8, Math.max(1, this.zoom * k)), f = z / this.zoom;
    this.panX = x - (x - this.panX) * f; this.panY = y - (y - this.panY) * f;
    this.zoom = z;
    this.clampPan();
    this.refresh(false);
  }

  /** The fill area at preview scale: the selection's, then each lasso edit in turn (adds fill, subtracts clear). */
  private rebuildHole(): void {
    const h0 = this.hole0, hole = this.hole, a = this.allow;
    if (!h0 || !hole) return;
    const s = createSurface(this.pw, this.ph), c = ctxOf(s), img = c.createImageData(this.pw, this.ph);
    for (let i = 0; i < h0.length; i++) img.data[i * 4 + 3] = h0[i] ? 255 : 0;
    c.putImageData(img, 0, 0);
    for (const ed of this.edits) {
      c.globalCompositeOperation = ed.add ? 'source-over' : 'destination-out';
      c.fillStyle = '#fff';
      c.beginPath();
      ed.pts.forEach(([x, y], i) => { if (i) c.lineTo(x * this.scale, y * this.scale); else c.moveTo(x * this.scale, y * this.scale); });
      c.closePath();
      c.fill();
    }
    const d = c.getImageData(0, 0, this.pw, this.ph).data;
    for (let i = 0; i < hole.length; i++) { hole[i] = d[i * 4 + 3] >= 128 ? 1 : 0; if (a && hole[i]) a[i] = 0; }
    this.rebuildAllow();
  }

  /** The edited fill area at document size (1 inside), or null while nothing was edited. */
  private areaDoc(w: number, h: number): Uint8Array | null {
    const sel = this.selRef;
    if (!this.edits.length || !sel) return null;
    const s = createSurface(w, h), c = ctxOf(s);
    c.drawImage(sel.surface() as CanvasImageSource, sel.x, sel.y);
    for (const ed of this.edits) {
      c.globalCompositeOperation = ed.add ? 'source-over' : 'destination-out';
      c.fillStyle = '#fff';
      c.beginPath();
      ed.pts.forEach(([x, y], i) => { if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      c.closePath();
      c.fill();
    }
    const d = c.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    return out;
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
        if (contentFill(pm, hole, this.pw, this.ph, this.sampling === 'rectangular' ? allow : null, this.opts, this.sampling === 'custom' ? { mask: allow, strength: this.strength } : null)) { const r = new ImageData(this.pw, this.ph); unpremultiply(pm, r.data); this.result = r; }
      }
      const base = this.showResult && this.result ? this.result : img, out = new ImageData(this.pw, this.ph), d = out.data, s = base.data, ch = this.channel;
      for (let i = 0; i < hole.length; i++) {
        const k = i * 4, tint = this.showResult ? 0 : hole[i] ? 1 : allow[i] ? 2 : 0;
        if (this.showResult && this.result && hole[i] && ch < 3) { for (let j = 0; j < 3; j++) d[k + j] = j === ch ? s[k + j] : img.data[k + j]; d[k + 3] = 255; continue; }
        d[k] = tint === 1 ? Math.round(s[k] * 0.5 + 127) : tint === 2 ? Math.round(s[k] * 0.65) : s[k];
        d[k + 1] = tint === 1 ? Math.round(s[k + 1] * 0.5) : tint === 2 ? Math.round(s[k + 1] * 0.65 + 89) : s[k + 1];
        d[k + 2] = tint === 1 ? Math.round(s[k + 2] * 0.5) : tint === 2 ? Math.round(s[k + 2] * 0.65) : s[k + 2];
        d[k + 3] = 255;
      }
      ctxOf(this.buf).putImageData(out, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, PW, PH);
      g.imageSmoothingEnabled = this.zoom === 1;
      g.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
      g.drawImage(this.buf as CanvasImageSource, 0, 0, this.pw, this.ph, this.ox, this.oy, this.pw, this.ph);
      const path = this.lasso;
      if (path && path.length > 1) {
        g.lineWidth = 1 / this.zoom;
        g.strokeStyle = this.tool === 'lassoSub' ? '#ff5a5a' : '#ffffff';
        g.setLineDash([4 / this.zoom, 3 / this.zoom]);
        g.beginPath();
        path.forEach(([x, y], i) => { if (i) g.lineTo(x + this.ox, y + this.oy); else g.moveTo(x + this.ox, y + this.oy); });
        g.stroke();
        g.setLineDash([]);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    });
  }

  private apply(): void {
    const p = this.engine.current, a = this.allow, sampling = this.sampling, output = this.output, s = this.scale, pw = this.pw, ph = this.ph;
    const opts = { ...this.opts }, strength = this.strength, all = this.sampleAll, channel = this.channel, area = p ? this.areaDoc(p.doc.width, p.doc.height) : null;
    this.close();
    if (!p) return;
    let areaMap: Uint8Array | null = null;
    if (sampling !== 'auto' && a) {
      const W = p.doc.width, H = p.doc.height;
      areaMap = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) areaMap[y * W + x] = a[Math.min(ph - 1, Math.floor(y * s)) * pw + Math.min(pw - 1, Math.floor(x * s))];
    }
    // Rectangular's automatic box limits the search; Custom's painted area is only a preference weight.
    this.engine.contentAwareFillWith(sampling === 'rectangular' ? areaMap : null, output, opts, all, area, channel, sampling === 'custom' ? areaMap : null, strength);
  }
}

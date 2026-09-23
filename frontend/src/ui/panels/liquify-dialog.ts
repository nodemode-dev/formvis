import type { Engine, ID } from '../../engine';
import { dabField, fieldIsZero, liquifyImage, makeField, pushField, resetField, type LiquifyField, type LiquifyTool } from '../../engine/liquify';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { paint } from '../palette';
import { toast } from '../toast';
import { sliderRow, type Row } from './controls';

const PW = 640, PH = 440;
const TOOLS: ReadonlyArray<readonly [LiquifyTool, string]> = [['warp', 'Forward Warp'], ['reconstruct', 'Reconstruct'], ['twirlCW', 'Twirl Clockwise'], ['twirlCCW', 'Twirl Counterclockwise'], ['pucker', 'Pucker'], ['bloat', 'Bloat']];

/** Filter > Liquify (Shift+Mod+X), Photoshop's workspace: the active layer in a preview, brushed with Forward Warp,
 *  Reconstruct, Twirl either way, Pucker or Bloat; Restore All clears the field; OK applies once as a Liquify step,
 *  Cancel leaves the layer untouched. The field is kept at the layer's full resolution and the preview is resampled
 *  from the original pixels each frame, so strokes never soften one another. The preview keeps one size whatever
 *  the layer's, so the dialog never resizes. */
export class LiquifyDialog extends Dialog {
  private tool: LiquifyTool = 'warp';
  private size = 100;
  private pressure = 50;
  private liq: LiquifyField | null = null;
  private src: ImageData | null = null;
  private layerId: ID | null = null;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private shown: ImageData | null = null;
  private frame = 0;
  private held: ReturnType<typeof setInterval> | 0 = 0;
  private last: { x: number; y: number } | null = null;
  private hover: { x: number; y: number } | null = null;
  private readonly canvas = el(`<canvas class="cv-liquify-canvas" width="${PW}" height="${PH}"></canvas>`) as HTMLCanvasElement;
  private readonly toolButtons: HTMLButtonElement[] = [];
  private readonly sizeRow: Row<number>;
  private readonly pressureRow: Row<number>;

  constructor(private readonly engine: Engine) {
    super('Liquify', PW + 48);
    const bar = el('<div class="cv-row-actions cv-liquify-tools"></div>');
    for (const [id, label] of TOOLS) {
      const b = el(`<button class="cv-btn" type="button"></button>`) as HTMLButtonElement;
      b.textContent = label;
      b.addEventListener('click', () => { this.tool = id; this.syncTools(); });
      this.toolButtons.push(b);
      bar.appendChild(b);
    }
    this.sizeRow = sliderRow('Brush size (px)', 1, 600, 1, (v) => { this.size = v; this.draw(); });
    this.pressureRow = sliderRow('Brush pressure (%)', 1, 100, 1, (v) => { this.pressure = v; });
    const restore = el('<button class="cv-btn" type="button">Restore All</button>') as HTMLButtonElement;
    restore.addEventListener('click', () => { if (this.liq) { resetField(this.liq); this.render(); } });
    this.body.append(bar, this.canvas, this.sizeRow.el, this.pressureRow.el, restore);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.onClose = () => this.release();
    this.bindCanvas();
  }

  show(): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (this.isOpen || !p || !l) return;
    if (!l.raster || l.vector || l.smart || l.isGroup || l.adjustment) { toast('Liquify works on a pixel layer. Rasterize shape layers and smart objects first.'); return; }
    if (p.maskTarget && l.mask) { toast('Liquify works on layer pixels. Click the layer thumbnail to target them.'); return; }
    this.engine.settle();
    this.src = l.raster.read();
    this.layerId = l.id;
    this.liq = makeField(this.src.width, this.src.height);
    this.scale = Math.min(1, PW / this.src.width, PH / this.src.height);
    this.ox = Math.floor((PW - this.src.width * this.scale) / 2);
    this.oy = Math.floor((PH - this.src.height * this.scale) / 2);
    this.sizeRow.set(this.size);
    this.pressureRow.set(this.pressure);
    this.syncTools();
    this.render();
    this.open();
  }

  private syncTools(): void { TOOLS.forEach(([id], i) => this.toolButtons[i].classList.toggle('is-active', id === this.tool)); }

  /** Pointer position on the canvas in layer pixels. */
  private at(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect(), cx = ((e.clientX - r.left) / r.width) * PW, cy = ((e.clientY - r.top) / r.height) * PH;
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  }

  private dab(pt: { x: number; y: number }): void {
    const f = this.liq;
    if (!f) return;
    const s = this.pressure / 100;
    if (this.tool === 'warp') { if (this.last) pushField(f, this.last.x, this.last.y, pt.x, pt.y, this.size / 2, s); }
    else dabField(f, this.tool, pt.x, pt.y, this.size / 2, s);
    this.last = pt;
    this.render();
  }

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.liq) return;
      c.setPointerCapture(e.pointerId);
      this.last = this.at(e);
      if (this.tool !== 'warp') { this.dab(this.last); this.held = setInterval(() => { if (this.last) this.dab(this.last); }, 50); }
    });
    c.addEventListener('pointermove', (e) => {
      this.hover = this.at(e);
      if (c.hasPointerCapture(e.pointerId)) this.dab(this.hover);
      else this.draw();
    });
    const end = (e: PointerEvent): void => { if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId); this.stopHeld(); this.last = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
  }

  private stopHeld(): void { if (this.held) clearInterval(this.held); this.held = 0; }

  /** Resamples the preview on the next frame. */
  private render(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.src || !this.liq) return;
      const w = Math.max(1, Math.round(this.src.width * this.scale)), h = Math.max(1, Math.round(this.src.height * this.scale));
      this.shown = liquifyImage(this.src, this.liq, this.scale, w, h);
      this.draw();
    });
  }

  /** The last preview and the brush circle. */
  private draw(): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const pal = paint();
    g.clearRect(0, 0, PW, PH);
    if (this.shown) g.putImageData(this.shown, this.ox, this.oy);
    if (this.hover) {
      g.strokeStyle = pal.accent;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(this.ox + this.hover.x * this.scale, this.oy + this.hover.y * this.scale, Math.max(1, (this.size / 2) * this.scale), 0, Math.PI * 2);
      g.stroke();
    }
  }

  private apply(): void {
    const f = this.liq, id = this.layerId;
    this.close();
    if (f && id && !fieldIsZero(f)) this.engine.applyLiquify(id, f);
  }

  private release(): void {
    this.stopHeld();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.liq = null;
    this.src = null;
    this.shown = null;
    this.hover = null;
  }
}

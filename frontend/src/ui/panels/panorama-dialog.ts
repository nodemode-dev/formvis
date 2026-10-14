import type { Engine } from '../../engine';
import { Raster, ctxOf } from '../../engine/surface';
import { renderView, type PanoramaView, type PixelImage } from '../../engine/panorama';
import { Dialog } from '../dialogs';
import { el } from '../dom';

const VIEW_W = 640, VIEW_H = 400;
const ROWS: Array<[keyof PanoramaView, string, number, number]> = [['yaw', 'Yaw', -180, 180], ['pitch', 'Pitch', -90, 90], ['fov', 'Field of view', 30, 120]];

/** View > Spherical Panorama (DEV_PLAN 35.8): the active document, taken as an equirectangular picture, seen from inside
 *  a sphere. Drag to turn, wheel to zoom; Edit View opens the current view as a new document that Apply View to
 *  Panorama projects back onto the sphere. */
export class PanoramaDialog extends Dialog {
  private readonly canvas = el<HTMLCanvasElement>(`<canvas class="cv-model3d-preview" width="${VIEW_W}" height="${VIEW_H}" aria-label="Spherical panorama view"></canvas>`);
  private readonly small = document.createElement('canvas');
  private readonly inputs = new Map<keyof PanoramaView, HTMLInputElement>();
  private readonly wInput = el<HTMLInputElement>('<input type="number" min="16" max="8192" step="1" value="1024" aria-label="Edit view width">');
  private readonly hInput = el<HTMLInputElement>('<input type="number" min="16" max="8192" step="1" value="768" aria-label="Edit view height">');
  private view: PanoramaView = { yaw: 0, pitch: 0, fov: 90 };
  private equi: PixelImage | null = null;
  private sourceId = '';
  private layerId: string | null = null;
  private docName = 'Panorama';
  private dragging: { x: number; y: number } | null = null;
  private frame = 0;
  private settle = 0;

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Spherical Panorama', 680);
    this.body.append(this.canvas);
    for (const [key, label, min, max] of ROWS) {
      const input = el<HTMLInputElement>(`<input type="range" min="${min}" max="${max}" step="1" aria-label="${label}">`), row = el(`<label class="cv-dialog-row"><span>${label}</span></label>`);
      input.addEventListener('input', () => { this.view[key] = Number(input.value); this.redraw(true); });
      input.addEventListener('change', () => this.redraw(false));
      row.append(input); this.body.append(row); this.inputs.set(key, input);
    }
    const size = el('<label class="cv-dialog-row"><span>Edit view size</span></label>');
    size.append(this.wInput, this.hInput);
    this.body.append(size);
    this.canvas.addEventListener('pointerdown', (e) => { this.dragging = { x: e.clientX, y: e.clientY }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const k = this.view.fov / this.canvas.clientWidth, dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
      this.dragging = { x: e.clientX, y: e.clientY };
      this.set({ yaw: this.wrap(this.view.yaw - dx * k), pitch: Math.max(-90, Math.min(90, this.view.pitch + dy * k)) });
      this.redraw(true);
    });
    const release = (): void => { if (this.dragging) { this.dragging = null; this.redraw(false); } };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.set({ fov: Math.max(30, Math.min(120, this.view.fov + (e.deltaY > 0 ? 4 : -4))) });
      this.redraw(true);
      window.clearTimeout(this.settle);
      this.settle = window.setTimeout(() => this.redraw(false), 150);
    }, { passive: false });
    this.button('Edit View', 'ghost', () => this.editView());
    this.button('Done', 'primary', () => this.close());
  }

  private wrap(a: number): number { return a - 360 * Math.floor((a + 180) / 360); }

  private set(v: Partial<PanoramaView>): void {
    this.view = { ...this.view, ...v };
    for (const [k, input] of this.inputs) input.value = String(Math.round(this.view[k]));
  }

  /** Opens on the active document's flattened picture. */
  start(): void {
    const p = this.engine.current, flat = this.engine.flattened();
    if (!p || !flat || !flat.width || !flat.height) { this.toast('Open a document to view as a panorama.'); return; }
    this.equi = ctxOf(flat).getImageData(0, 0, flat.width, flat.height);
    this.sourceId = p.id;
    this.layerId = p.activeId;
    this.docName = p.name;
    this.set({});
    this.open();
    this.redraw(false);
  }

  close(): void {
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.settle);
    this.equi = null;
    super.close();
  }

  /** Reduced while dragging, full size on release. */
  private redraw(rough: boolean): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const equi = this.equi, ctx = this.canvas.getContext('2d');
      if (!equi || !ctx) return;
      const w = rough ? VIEW_W / 4 : VIEW_W, h = rough ? VIEW_H / 4 : VIEW_H, img = renderView(equi, this.view, w, h);
      if (!rough) { ctx.putImageData(new ImageData(img.data, w, h), 0, 0); return; }
      const sctx = this.small.getContext('2d');
      if (!sctx) return;
      this.small.width = w; this.small.height = h;
      sctx.putImageData(new ImageData(img.data, w, h), 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.small, 0, 0, VIEW_W, VIEW_H);
    });
  }

  private editView(): void {
    const equi = this.equi;
    if (!equi) return;
    const w = Math.round(Number(this.wInput.value)), h = Math.round(Number(this.hInput.value));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16 || w > 8192 || h > 8192) { this.toast('The edit view must be 16 to 8192 px on each side.'); return; }
    const img = renderView(equi, this.view, w, h), view = { ...this.view };
    // A transparent new document's layer has no raster until painted, so the view goes in as its own layer.
    const p = this.engine.newDocument(w, h, `${this.docName} view`, 'transparent');
    if (!p) { this.toast('The edit view could not be made.'); return; }
    const raster = new Raster(w, h);
    raster.write(new ImageData(img.data, w, h));
    this.engine.insertRasterLayer(raster, 'Panorama view', 0, 0, {}, 'Edit View');
    this.engine.panoramaLinks.set(p.id, { sourceProjectId: this.sourceId, view, layerId: this.layerId });
    this.close();
    this.toast('Edit the view, then run Layer > 3D > Apply View to Panorama.');
  }
}

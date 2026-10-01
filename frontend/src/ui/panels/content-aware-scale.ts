import type { Engine } from '../../engine';
import { toBlob } from '../../engine/surface';
import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, sliderRow } from './controls';

/** Image > Content-Aware Scale (1.55.4, the parity plan's M4): the layer's width and height change by seam carving in
 *  the engine, so the parts that matter keep their shape; skin tones and the selection can be protected. Rows are
 *  built once; OK is one step. */
export class ContentAwareScaleDialog extends Dialog {
  private readonly s = { width: 100, height: 100, skin: true, selection: true };
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 2.8em"></p>');
  private busy = false;

  constructor(private readonly engine: Engine) {
    super('Content-Aware Scale', 400);
    const w = sliderRow('Width (%)', 25, 200, 1, (v) => { this.s.width = v; this.describe(); });
    const h = sliderRow('Height (%)', 25, 200, 1, (v) => { this.s.height = v; this.describe(); });
    const skin = checkRow('Protect skin tones', (v) => { this.s.skin = v; });
    const sel = checkRow('Protect the selection', (v) => { this.s.selection = v; });
    this.body.append(w.el, h.el, skin.el, sel.el, this.note);
    w.set(100); h.set(100); skin.set(true); sel.set(true);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => void this.apply());
  }

  show(): void {
    const l = this.engine.current?.activeLayer;
    if (!l?.raster || l.isGroup || l.adjustment || l.text || l.shape || l.smart) { this.engine.notice('Select a pixel layer first.'); return; }
    this.describe();
    this.open();
  }

  private describe(): void {
    const l = this.engine.current?.activeLayer;
    if (!l?.raster) return;
    const tw = Math.max(1, Math.round(l.raster.width * this.s.width / 100)), th = Math.max(1, Math.round(l.raster.height * this.s.height / 100));
    setText(this.note, `${l.raster.width} by ${l.raster.height} to ${tw} by ${th} pixels, carving the least important seams first; the selection and skin tones are kept whole when protected.`);
  }

  private async apply(): Promise<void> {
    const p = this.engine.current, l = p?.activeLayer;
    if (!p || !l?.raster || this.busy) return;
    const r = l.raster, tw = Math.max(1, Math.round(r.width * this.s.width / 100)), th = Math.max(1, Math.round(r.height * this.s.height / 100));
    if (tw === r.width && th === r.height) { this.close(); return; }
    this.busy = true;
    setText(this.note, 'Carving...');
    try {
      let mask: Blob | null = null;
      if (this.s.selection && p.selection) {
        const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
        const g = c.getContext('2d') as CanvasRenderingContext2D, img = g.createImageData(r.width, r.height), t = l.transform;
        for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) { const v = p.selection.valueAt(x + t.x, y + t.y), i = (y * r.width + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        g.putImageData(img, 0, 0);
        mask = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no mask'))), 'image/png'));
      }
      const png = await api.contentAwareScale(await toBlob(r.canvas), tw, th, this.s.skin, mask);
      const bmp = await createImageBitmap(png), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d') as CanvasRenderingContext2D; g.drawImage(bmp, 0, 0);
      this.close();
      this.engine.rescaleLayerPixels(l.id, g.getImageData(0, 0, c.width, c.height), 'Content-Aware Scale');
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The scale could not be made.'); }
    finally { this.busy = false; }
  }
}

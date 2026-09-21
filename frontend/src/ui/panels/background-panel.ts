import { createSurface, ctxOf, type Engine, type ID } from '../../engine';
import { DEFAULT_MATTE, levelsOf, refineMatte, type MatteSettings } from '../../engine/matte';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
import { selectRow, sliderRow } from './controls';

/** the Remove Background panel: the model's subject mask, as it comes (Basic) or refined against the layer's
 *  own detail (Advanced: Refine, Contrast, Shift Edge), previewed on the layer and laid down as a layer mask on OK.
 *  The settings carry over from one use to the next. */
export class BackgroundPanel extends Dialog {
  private readonly settings: MatteSettings = { ...DEFAULT_MATTE };
  private layerId: ID | null = null;
  private mask: ImageBitmap | null = null;
  private done = false;
  private queued = false;
  private readonly quality = selectRow('Quality', [['basic', 'Basic'], ['advanced', 'Advanced']], (v) => { this.settings.quality = v === 'advanced' ? 'advanced' : 'basic'; this.sync(); this.preview(); });
  private readonly refine = sliderRow('Refine (px)', 0, 40, 1, (v) => { this.settings.refineEdges = v; this.preview(); });
  private readonly contrast = sliderRow('Contrast (%)', 0, 100, 1, (v) => { this.settings.matteContrast = v; this.preview(); });
  private readonly shift = sliderRow('Shift Edge (px)', -10, 10, 1, (v) => { this.settings.shiftEdge = v; this.preview(); });

  constructor(private readonly engine: Engine) {
    super('Remove Background', 420);
    this.body.append(
      el('<p class="cv-note">Hide the background behind a layer mask, keeping the foreground subjects. The pixels stay, so the background can be painted back at any time.</p>'),
      this.quality.el, this.refine.el, this.contrast.el, this.shift.el,
    );
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.commit());
  }

  /** Opens on the active layer with the model's raw mask for its pixels; the panel owns the bitmap from here. */
  show(layerId: ID, mask: ImageBitmap): void {
    if (this.isOpen || this.engine.activeLayer?.id !== layerId) { mask.close(); return; }
    if (this.engine.current?.maskTarget) this.engine.setMaskTarget(false);
    this.layerId = layerId;
    this.mask = mask;
    this.done = false;
    this.quality.set(this.settings.quality);
    this.refine.set(this.settings.refineEdges);
    this.contrast.set(this.settings.matteContrast);
    this.shift.set(this.settings.shiftEdge);
    this.sync();
    this.open();
    this.preview();
  }

  close(): void {
    if (!this.done) this.engine.setPreview(null);
    this.mask?.close();
    this.mask = null;
    this.layerId = null;
    super.close();
  }

  private sync(): void {
    const advanced = this.settings.quality === 'advanced';
    setHidden(this.refine.el, !advanced);
    setHidden(this.contrast.el, !advanced);
    setHidden(this.shift.el, !advanced);
  }

  /** The refined mask for pixels at `src`'s size, which is the layer's own size times `scale`. */
  private matte(src: ImageData, scale: number): Float32Array | null {
    if (!this.mask) return null;
    const s = createSurface(src.width, src.height), c = ctxOf(s);
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.mask, 0, 0, src.width, src.height);
    return refineMatte(levelsOf(c.getImageData(0, 0, src.width, src.height), false), levelsOf(src, true), src.width, src.height, this.settings, scale);
  }

  private preview(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      if (!this.isOpen || !this.layerId) return;
      this.engine.previewImageEdit((src, scale) => {
        const m = this.matte(src, scale), out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
        if (m) for (let i = 0; i < m.length; i++) out.data[i * 4 + 3] = Math.round(out.data[i * 4 + 3] * m[i]);
        return out;
      });
    });
  }

  private commit(): void {
    const id = this.layerId, info = this.engine.targetImage();
    const m = id && info && info.layerId === id ? this.matte(info.image, 1) : null;
    this.done = true;
    this.engine.setPreview(null);
    if (id && info && m) this.engine.applySubjectMask(id, m, info.width, info.height);
    this.close();
  }
}

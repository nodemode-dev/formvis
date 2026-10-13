import { createSurface, ctxOf, type Engine, type ID } from '../../engine';
import { DEFAULT_MATTE, levelsOf, refineMatte, type MatteSettings } from '../../engine/matte';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
import { recalled, remembered } from '../prefs';
import { selectRow, sliderRow } from './controls';

/**
 * The Remove Background panel. Basic uses the model's subject mask as it comes; Advanced refines it against the
 * layer's own detail, with Refine, Contrast and Shift Edge. The result is previewed on the layer and laid down as
 * a layer mask on OK. The settings carry over from one use to the next.
 */
export class BackgroundPanel extends Dialog {
  private readonly settings: MatteSettings = { ...DEFAULT_MATTE };
  private layerId: ID | null = null;
  private mask: ImageBitmap | null = null;   // the model's bitmap
  private done = false;                      // OK was pressed
  private queued = false;                    // a preview is waiting for a frame
  private readonly quality = selectRow('Quality', [['basic', 'Basic'], ['advanced', 'Advanced']], (v) => { this.settings.quality = v as MatteSettings['quality']; this.keep(); this.sync(); this.preview(); });
  private readonly refine = sliderRow('Refine (px)', 0, 40, 1, (v) => { this.settings.refineEdges = v; this.keep(); this.preview(); });
  private readonly contrast = sliderRow('Contrast (%)', 0, 100, 1, (v) => { this.settings.matteContrast = v; this.keep(); this.preview(); });
  private readonly shift = sliderRow('Shift Edge (px)', -10, 10, 1, (v) => { this.settings.shiftEdge = v; this.keep(); this.preview(); });

  constructor(private readonly engine: Engine) {
    super('Remove Background', 420);
    this.body.append(
      el('<p class="cv-note">Hide the background behind a layer mask, keeping the foreground subjects. The pixels stay, so the background can be painted back at any time.</p>'),
      this.quality.el, this.refine.el, this.contrast.el, this.shift.el,
    );
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.commit());
    // The last settings stay across reloads (and so reach Remove Background without the panel, too).
    const q = recalled('Remove Background', 'settings');
    if (typeof q === 'string') {
      try {
        const s = JSON.parse(q) as Partial<MatteSettings>;
        const n = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
        if (s.quality === 'basic' || s.quality === 'advanced') this.settings.quality = s.quality;
        this.settings.refineEdges = n(s.refineEdges, 0, 40, this.settings.refineEdges);
        this.settings.matteContrast = n(s.matteContrast, 0, 100, this.settings.matteContrast);
        this.settings.shiftEdge = n(s.shiftEdge, -10, 10, this.settings.shiftEdge);
      } catch { /* the defaults stand */ }
    }
  }

  private keep(): void { remembered('Remove Background', 'settings', JSON.stringify(this.settings)); }

  /** Open for a layer with the model's mask; a request for a layer that is no longer active releases the bitmap. */
  show(layerId: ID, mask: ImageBitmap): void {
    if (this.isOpen || this.engine.activeLayer?.id !== layerId) { mask.close(); return; }
    this.engine.setMaskTarget(false);
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

  /** The mask laid down at once with the current settings, as OK lays it, without opening (agents have no one to press OK). */
  applyNow(layerId: ID, mask: ImageBitmap): boolean {
    if (this.isOpen || this.engine.activeLayer?.id !== layerId) { mask.close(); return false; }
    if (this.engine.current?.maskTarget) this.engine.setMaskTarget(false);
    this.mask = mask;
    const info = this.engine.targetImage(), m = info && info.layerId === layerId ? this.matte(info.image, 1) : null;
    if (info && m) this.engine.applySubjectMask(layerId, m, info.width, info.height);
    this.mask.close();
    this.mask = null;
    return m !== null;
  }

  close(): void {
    if (!this.done) this.engine.setPreview(null);
    this.mask?.close();
    this.mask = null;
    this.layerId = null;
    super.close();
  }

  /** The refinement rows belong to Advanced only. */
  private sync(): void {
    const advanced = this.settings.quality === 'advanced';
    setHidden(this.refine.el, !advanced);
    setHidden(this.contrast.el, !advanced);
    setHidden(this.shift.el, !advanced);
  }

  /** The matte for an image of `src`'s size: the model's bitmap, refined against the image's own detail. */
  private matte(src: ImageData, scale: number): Float32Array | null {
    if (!this.mask) return null;
    const w = src.width, h = src.height;
    const surface = createSurface(w, h), c = ctxOf(surface);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.mask, 0, 0, w, h);
    return refineMatte(levelsOf(c.getImageData(0, 0, w, h), false), levelsOf(src, true), w, h, this.settings, scale);
  }

  private preview(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      if (!this.isOpen || !this.layerId) return;
      this.engine.previewImageEdit((src, scale) => {
        const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
        const m = this.matte(src, scale);
        if (m) for (let i = 0, n = src.width * src.height; i < n; i++) out.data[i * 4 + 3] = Math.round(out.data[i * 4 + 3] * m[i]);
        return out;
      });
    });
  }

  private commit(): void {
    const t = this.engine.targetImage();
    const m = t && t.layerId === this.layerId ? this.matte(t.image, 1) : null;
    this.done = true;
    this.engine.setPreview(null);
    if (t && m && this.layerId) this.engine.applySubjectMask(this.layerId, m, t.width, t.height);
    this.close();
  }
}

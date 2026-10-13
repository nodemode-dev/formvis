import { BLEND_MODES, createSurface, ctxOf, type BlendMode, type Engine } from '../../engine';
import { fadeImages } from '../../engine/fade';
import { Dialog } from '../dialogs';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

export class FadeDialog extends Dialog {
  private opacity = 100;
  private mode: BlendMode = 'normal';
  private preview = true;
  private done = false;
  private timer = 0;
  private source: { name: string; before: ImageData } | null = null;
  private scaled: ImageData | null = null;
  private readonly opacityRow: Row<number>;
  private readonly modeRow: Row<string>;
  private readonly previewRow: Row<boolean>;
  private readonly okBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine) {
    super('Fade', 380);
    this.opacityRow = sliderRow('Opacity (%)', 0, 100, 1, (v) => { this.opacity = v; this.schedule(); });
    this.modeRow = selectRow('Mode', BLEND_MODES.map((b) => [b.id, b.label] as const), (v) => { this.mode = v as BlendMode; this.schedule(); });
    this.previewRow = checkRow('Preview', (v) => { this.preview = v; this.schedule(0); });
    this.body.append(this.opacityRow.el, this.modeRow.el, this.previewRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => this.commit());
    this.onClose = () => { window.clearTimeout(this.timer); this.source = null; this.scaled = null; if (!this.done) this.engine.setPreview(null); };
    this.remember();
  }

  show(): void {
    if (this.isOpen) return;
    this.source = this.engine.fadeSource();
    if (!this.source) { toast('Fade works right after a filter, adjustment or painting step on a layer’s pixels.'); return; }
    this.done = false;
    this.scaled = null;
    this.opacityRow.set(this.opacity);
    this.modeRow.set(this.mode);
    this.previewRow.set(this.preview);
    this.open(this.okBtn);
    this.schedule(0);
  }

  private beforeAt(w: number, h: number): ImageData | null {
    const b = this.source?.before;
    if (!b) return null;
    if (b.width === w && b.height === h) return b;
    if (this.scaled?.width === w && this.scaled.height === h) return this.scaled;
    const full = createSurface(b.width, b.height), s = createSurface(w, h), c = ctxOf(s);
    ctxOf(full).putImageData(b, 0, 0);
    c.drawImage(full, 0, 0, w, h);
    this.scaled = c.getImageData(0, 0, w, h);
    full.width = 0; full.height = 0; s.width = 0; s.height = 0;
    return this.scaled;
  }

  private schedule(delay = 120): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.isOpen) return;
      if (!this.preview) { this.engine.setPreview(null); return; }
      this.engine.previewImageEdit((src) => { const b = this.beforeAt(src.width, src.height); return b ? fadeImages(b, src, this.mode, this.opacity / 100) : src; });
    }, delay);
  }

  private commit(): void {
    window.clearTimeout(this.timer);
    const s = this.source;
    if (!s) { this.close(); return; }
    this.done = true;
    const before = s.before, mode = this.mode, k = this.opacity / 100;
    this.close();
    this.engine.applyImageEdit(`Fade ${s.name}`, (src) => (src.width === before.width && src.height === before.height ? fadeImages(before, src, mode, k) : src), 0, 4);
  }
}

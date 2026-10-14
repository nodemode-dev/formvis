import { BLEND_MODES, type Engine, type Project } from '../../engine';
import { APPLY_MODES, type ApplyMode } from '../../engine/apply-image';
import { el } from '../dom';
import { Dialog } from '../dialogs';
import { toast } from '../toast';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

const CHANNELS: ReadonlyArray<readonly [string, string]> = [['rgb', 'RGB'], ['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['transparency', 'Transparency']];

/** One Source or Mask block: document, layer and channel selects with their Invert box, refilled as the choice narrows. */
interface Block { doc: string; layer: string; channel: string; invert: boolean }

/** Image > Apply Image... (31.2): Source, Layer, Channel, Invert; the read-only Target; Blending, Opacity, Scale and
 *  Offset (live for Add and Subtract); a Mask block. Every row is in the box from the first frame, rows that do not
 *  apply are dimmed and disabled, so the box never changes size. The preview runs the engine's own operation. */
export class ApplyImageDialog extends Dialog {
  private src: Block = { doc: '', layer: 'merged', channel: 'rgb', invert: false };
  private msk: Block = { doc: '', layer: 'merged', channel: 'rgb', invert: false };
  private mode: ApplyMode = 'normal';
  private opacity = 100;
  private scale = 1;
  private offset = 0;
  private useMask = false;
  private preview = true;
  private done = false;
  private timer = 0;
  private readonly targetText: HTMLElement;
  private readonly rows: { src: Row<string>[]; msk: Row<string>[]; srcInv: Row<boolean>; mskInv: Row<boolean> };
  private readonly modeRow: Row<string>;
  private readonly opacityRow: Row<number>;
  private readonly scaleRow: Row<number>;
  private readonly offsetRow: Row<number>;
  private readonly maskRow: Row<boolean>;
  private readonly previewRow: Row<boolean>;
  private readonly okBtn: HTMLButtonElement;
  private readonly dynamic: Element[] = [];

  constructor(private readonly engine: Engine) {
    super('Apply Image', 420);
    const block = (b: Block, label: string): { sels: Row<string>[]; inv: Row<boolean> } => {
      const doc = selectRow(`${label} document`, [['', '']], (v) => { b.doc = v; this.fillLayers(b, sels); this.schedule(); });
      const layer = selectRow('Layer', [['merged', 'Merged']], (v) => { b.layer = v; this.schedule(); });
      const channel = selectRow('Channel', CHANNELS, (v) => { b.channel = v; this.schedule(); });
      const inv = checkRow('Invert', (v) => { b.invert = v; this.schedule(); });
      const sels = [doc, layer, channel];
      for (const r of [...sels, inv]) this.dynamic.push(...Array.from(r.el.querySelectorAll('select, input')));
      return { sels, inv };
    };
    const s = block(this.src, 'Source'), m = block(this.msk, 'Mask source');
    this.targetText = el('<span class="cv-muted"></span>');
    const target = el('<div class="cv-field"><span>Target</span></div>');
    target.append(this.targetText);
    this.modeRow = selectRow('Blending', [...BLEND_MODES.filter((b) => (APPLY_MODES as readonly string[]).includes(b.id)).map((b) => [b.id, b.label] as const), ['add', 'Add']], (v) => { this.mode = v as ApplyMode; this.sync(); this.schedule(); });
    this.opacityRow = sliderRow('Opacity (%)', 0, 100, 1, (v) => { this.opacity = v; this.schedule(); });
    this.scaleRow = sliderRow('Scale', 1, 2, 0.01, (v) => { this.scale = v; this.schedule(); });
    this.offsetRow = sliderRow('Offset', -255, 255, 1, (v) => { this.offset = v; this.schedule(); });
    this.maskRow = checkRow('Mask', (v) => { this.useMask = v; this.sync(); this.schedule(); });
    this.previewRow = checkRow('Preview', (v) => { this.preview = v; this.schedule(0); });
    this.rows = { src: s.sels, msk: m.sels, srcInv: s.inv, mskInv: m.inv };
    this.body.append(
      ...s.sels.map((r) => r.el), s.inv.el, target,
      this.modeRow.el, this.opacityRow.el, this.scaleRow.el, this.offsetRow.el,
      this.maskRow.el, ...m.sels.map((r) => r.el), m.inv.el, this.previewRow.el,
    );
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => this.commit());
    this.onClose = () => { window.clearTimeout(this.timer); if (!this.done) this.engine.setPreview(null); };
    this.remember(this.dynamic);   // documents, layers and channels are this session's; the rest persists
  }

  show(): void {
    if (this.isOpen) return;
    const docs = this.engine.alphaDocuments();
    if (!docs.length) { toast('Apply Image needs an open document.'); return; }
    this.done = false;
    this.refill(this.src, this.rows.src, docs);
    this.refill(this.msk, this.rows.msk, docs);
    const p = this.engine.current, l = p?.activeLayer;
    this.targetText.textContent = `${p?.name ?? ''} / ${l?.name ?? ''} / RGB`;
    this.modeRow.set(this.mode);
    this.opacityRow.set(this.opacity);
    this.scaleRow.set(this.scale);
    this.offsetRow.set(this.offset);
    this.maskRow.set(this.useMask);
    this.rows.srcInv.set(this.src.invert);
    this.rows.mskInv.set(this.msk.invert);
    this.previewRow.set(this.preview);
    this.sync();
    this.open(this.okBtn);
    this.schedule(0);
  }

  private select(r: Row<string>): HTMLSelectElement { return r.el.querySelector('select') as HTMLSelectElement; }

  private fillSelect(sel: HTMLSelectElement, options: ReadonlyArray<readonly [string, string]>, want: string): string {
    sel.textContent = '';
    for (const [v, t] of options) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); }
    sel.value = options.some(([v]) => v === want) ? want : options[0][0];
    return sel.value;
  }

  private refill(b: Block, sels: Row<string>[], docs: Project[]): void {
    b.doc = this.fillSelect(this.select(sels[0]), docs.map((d) => [d.id, d.name] as const), docs.some((d) => d.id === b.doc) ? b.doc : docs[0].id);
    this.fillLayers(b, sels, docs);
  }

  private fillLayers(b: Block, sels: Row<string>[], docs = this.engine.alphaDocuments()): void {
    const d = docs.find((x) => x.id === b.doc) ?? docs[0];
    if (!d) return;
    const layers = d.doc.layers.filter((l) => !l.isGroup && l.raster).map((l) => [l.id, l.name] as const);
    b.layer = this.fillSelect(this.select(sels[1]), [['merged', 'Merged'], ...layers], b.layer);
    const alphas = (d.doc.alphas ?? []).map((a) => [a.id, a.name] as const);
    b.channel = this.fillSelect(this.select(sels[2]), [...CHANNELS, ...alphas], b.channel);
  }

  /** Dims and disables the rows that do not apply: Scale and Offset unless Add or Subtract, the Mask block unless Mask is on. */
  private sync(): void {
    const arith = this.mode === 'add' || this.mode === 'subtract';
    const gate = (rows: HTMLElement[], on: boolean): void => {
      for (const r of rows) {
        r.classList.toggle('is-off', !on);
        r.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((c) => { c.disabled = !on; });
      }
    };
    gate([this.scaleRow.el, this.offsetRow.el], arith);
    gate([...this.rows.msk.map((r) => r.el), this.rows.mskInv.el], this.useMask);
  }

  private opts(preview: boolean): Parameters<Engine['applyImage']>[0] {
    const arith = this.mode === 'add' || this.mode === 'subtract';
    return {
      doc: this.src.doc, layer: this.src.layer as 'merged', channel: this.src.channel, invert: this.src.invert,
      mode: this.mode, opacity: this.opacity / 100, scale: arith ? this.scale : 1, offset: arith ? this.offset : 0,
      mask: this.useMask ? { doc: this.msk.doc, layer: this.msk.layer as 'merged', channel: this.msk.channel, invert: this.msk.invert } : null,
      preview,
    };
  }

  private schedule(delay = 120): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.isOpen) return;
      if (!this.preview) { this.engine.setPreview(null); return; }
      this.engine.applyImage(this.opts(true));
    }, delay);
  }

  private commit(): void {
    window.clearTimeout(this.timer);
    this.done = true;
    const o = this.opts(false);
    this.close();
    this.engine.applyImage(o);
  }
}

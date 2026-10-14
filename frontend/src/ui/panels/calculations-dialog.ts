import type { Engine } from '../../engine';
import { CALC_MODES, type CalcMode } from '../../engine/calculations';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

const CHANNELS: ReadonlyArray<readonly [string, string]> = [['gray', 'Gray'], ['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['transparency', 'Transparency']];
const modeLabel = (m: CalcMode): string => m.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const select = (label: string): HTMLSelectElement => el<HTMLSelectElement>(`<select class="cv-input" aria-label="${label}"></select>`);

/** Fills a select with `options`, keeping the chosen value when it is still offered. */
function fill(s: HTMLSelectElement, options: ReadonlyArray<readonly [string, string]>): void {
  const keep = s.value;
  s.replaceChildren(...options.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  if (options.some(([v]) => v === keep)) s.value = keep;
}

const enable = (root: HTMLElement, on: boolean): void => { for (const i of Array.from(root.querySelectorAll('input, select'))) (i as HTMLInputElement).disabled = !on; };

/** Image > Calculations (31.2b, 1.68.2), as Photoshop's: Source 1 and Source 2 (a layer or Merged, a channel, Invert), a
 *  blending mode with Opacity, Scale and Offset (live for Add and Subtract only), an optional alpha channel as Mask, and
 *  a Result: a new channel, a new document or the selection. Every row is there from the first frame, so the dialog keeps
 *  one size; rows that do not apply are disabled. A small live preview of the result (31.2c), and either source may come from another open document of the same size. */
export class CalculationsDialog extends Dialog {
  private readonly layer1 = select('Source 1 layer');
  private readonly chan1 = select('Source 1 channel');
  private readonly inv1 = checkRow('Invert source 1', () => undefined);
  private readonly layer2 = select('Source 2 layer');
  private readonly chan2 = select('Source 2 channel');
  private readonly inv2 = checkRow('Invert source 2', () => undefined);
  private readonly mode = selectRow('Blending', CALC_MODES.map((m) => [m, modeLabel(m)] as const), () => this.sync());
  private readonly opacity = sliderRow('Opacity (%)', 0, 100, 1, () => undefined);
  private readonly scale = sliderRow('Scale', 1, 2, 0.01, () => undefined);
  private readonly offset = sliderRow('Offset', -255, 255, 1, () => undefined);
  private readonly useMask = checkRow('Mask', () => this.sync());
  private readonly maskChan = select('Mask channel');
  private readonly result = selectRow('Result', [['channel', 'New Channel'], ['document', 'New Document'], ['selection', 'Selection']], () => undefined);

  private readonly doc1 = select('Source 1 document');
  private readonly doc2 = select('Source 2 document');
  private readonly preview = el<HTMLCanvasElement>('<canvas class="cv-calc-preview" width="220" height="220" aria-label="Calculations preview" style="display:block;width:220px;height:220px;margin:8px auto 0;background:var(--cv-bg-2, #222);border-radius:4px"></canvas>');
  private timer = 0;

  constructor(private readonly engine: Engine) {
    super('Calculations', 420);
    this.doc1.addEventListener('change', () => this.fillSource(1));
    this.doc2.addEventListener('change', () => this.fillSource(2));
    this.body.addEventListener('input', () => this.schedule());
    this.body.addEventListener('change', () => this.schedule());
    fill(this.doc1, [['', 'Current']]); fill(this.doc2, [['', 'Current']]);
    this.field('Source 1 document', this.doc1);
    fill(this.chan1, CHANNELS); fill(this.chan2, CHANNELS);
    fill(this.layer1, [['merged', 'Merged']]); fill(this.layer2, [['merged', 'Merged']]);
    fill(this.maskChan, [['', 'None']]);
    this.field('Source 1 layer', this.layer1);
    this.field('Source 1 channel', this.chan1);
    this.body.append(this.inv1.el);
    this.field('Source 2 document', this.doc2);
    this.field('Source 2 layer', this.layer2);
    this.field('Source 2 channel', this.chan2);
    this.body.append(this.inv2.el, this.mode.el, this.opacity.el, this.scale.el, this.offset.el, this.useMask.el);
    this.field('Mask channel', this.maskChan);
    this.body.append(this.result.el, this.preview);
    this.opacity.set(100); this.scale.set(1); this.offset.set(0);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.remember([this.layer1, this.layer2, this.maskChan]);   // layers and alpha channels belong to the document
    this.sync();
  }

  /** Scale and Offset count for Add and Subtract only; the Mask channel needs Mask on and an alpha channel to choose. */
  private sync(): void {
    const m = (this.mode.el.querySelector('select') as HTMLSelectElement).value;
    const addSub = m === 'add' || m === 'subtract', alphas = this.engine.current?.doc.alphas ?? [];
    enable(this.scale.el, addSub); enable(this.offset.el, addSub);
    enable(this.useMask.el, alphas.length > 0);
    const on = alphas.length > 0 && (this.useMask.el.querySelector('input') as HTMLInputElement).checked;
    this.maskChan.disabled = !on;
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const alphas = (p.doc.alphas ?? []).map((a) => [a.id, a.name] as const);
    const docs = this.engine.alphaDocuments().map((q, i) => [i === 0 ? '' : q.doc.id, q.name] as const);
    fill(this.doc1, docs); fill(this.doc2, docs);
    this.fillSource(1); this.fillSource(2);
    fill(this.maskChan, alphas.length ? alphas : [['', 'None']]);
    if (!alphas.length) (this.useMask.el.querySelector('input') as HTMLInputElement).checked = false;
    this.sync();
    this.open(this.layer1);
    this.sync();
    this.schedule();
  }

  /** Refills one source's layer and channel options from its chosen document (on open and when the document changes). */
  private fillSource(n: 1 | 2): void {
    const cur = this.engine.current;
    if (!cur) return;
    const id = (n === 1 ? this.doc1 : this.doc2).value;
    const q = id ? this.engine.alphaDocuments().find((d) => d.doc.id === id) ?? cur : cur;
    fill(n === 1 ? this.layer1 : this.layer2, [['merged', 'Merged'], ...q.doc.layers.map((l) => [l.id, l.name] as const)]);
    fill(n === 1 ? this.chan1 : this.chan2, [...CHANNELS, ...(q.doc.alphas ?? []).map((a) => [a.id, a.name] as const)]);
  }

  private options(): Parameters<Engine['calculations']>[0] {
    const checked = (r: HTMLElement): boolean => (r.querySelector('input') as HTMLInputElement).checked;
    const num = (r: HTMLElement): number => (r.querySelector('input[type="range"]') as HTMLInputElement).valueAsNumber;
    const mode = (this.mode.el.querySelector('select') as HTMLSelectElement).value as CalcMode;
    const result = (this.result.el.querySelector('select') as HTMLSelectElement).value as 'channel' | 'document' | 'selection';
    const addSub = mode === 'add' || mode === 'subtract';
    return {
      source1: { doc: this.doc1.value || undefined, layer: this.layer1.value, channel: this.chan1.value, invert: checked(this.inv1.el) },
      source2: { doc: this.doc2.value || undefined, layer: this.layer2.value, channel: this.chan2.value, invert: checked(this.inv2.el) },
      mode, opacity: num(this.opacity.el) / 100,
      scale: addSub ? num(this.scale.el) : 1,
      offset: addSub ? num(this.offset.el) : 0,
      mask: !this.maskChan.disabled && this.maskChan.value ? this.maskChan.value : undefined,
      result,
    };
  }

  /** Redraws the preview 150 ms after the last change; it only paints the canvas, never the document. */
  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.draw(), 150);
  }

  private draw(): void {
    if (!this.isOpen) return;
    const ctx = this.preview.getContext('2d');
    if (!ctx) return;
    const img = this.engine.calculationsPreview(this.options());
    ctx.clearRect(0, 0, this.preview.width, this.preview.height);
    if (img) ctx.putImageData(img, Math.floor((this.preview.width - img.width) / 2), Math.floor((this.preview.height - img.height) / 2));
  }

  private apply(): void {
    const o = this.options();
    window.clearTimeout(this.timer);
    this.close();
    this.engine.calculations(o);
  }
}

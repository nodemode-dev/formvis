import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import type { ToneMethod } from '../../engine/deep';
import { selectRow } from './controls';

export interface Toning { exposure: number; gamma: number; method: ToneMethod }

/** Leaving 32 bits (1.53.9, the parity plan's H1): HDR Toning by Exposure and Gamma, Highlight Compression or Equalize Histogram. */
export class HdrToningDialog extends Dialog {
  private method: ToneMethod = 'exposure';
  private readonly methodRow = selectRow('Method', [['exposure', 'Exposure and Gamma'], ['highlights', 'Highlight Compression'], ['equalize', 'Equalize Histogram']], (v) => { this.method = v as ToneMethod; this.sync(); });
  private readonly rows: HTMLElement[] = [];
  private readonly exposure = el<HTMLInputElement>('<input class="cv-input" type="number" min="-20" max="20" step="0.1" value="0" aria-label="Exposure">');
  private readonly gamma = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.1" max="9.99" step="0.05" value="1" aria-label="Gamma">');
  private readonly info = el('<p class="cv-note"></p>');
  private done: ((v: Toning | null) => void) | null = null;
  constructor() {
    super('HDR Toning', 380);
    const row = (label: string, c: HTMLElement): HTMLElement => { const r = el('<label class="cv-dialog-row"><span></span></label>'); setText(r.querySelector('span') as HTMLElement, label); r.append(c); return r; };
    this.rows.push(row('Exposure', this.exposure), row('Gamma', this.gamma));
    this.body.append(this.info, this.methodRow.el, ...this.rows);
    this.button('Cancel', 'ghost', () => this.finish(null));
    this.button('OK', 'primary', () => this.finish({ exposure: Number(this.exposure.value) || 0, gamma: Math.max(0.1, Number(this.gamma.value) || 1), method: this.method }));
    this.remember();
  }
  private sync(): void { for (const r of this.rows) r.hidden = this.method !== 'exposure'; }
  ask(bits: number): Promise<Toning | null> {
    setText(this.info, `Brighter than white is clipped at ${bits} bits with Exposure and Gamma; lower the exposure to keep highlights, or choose Highlight Compression or Equalize Histogram.`);
    this.methodRow.set(this.method); this.sync();
    this.open();
    return new Promise((res) => { this.done = res; });
  }
  private finish(v: Toning | null): void { const d = this.done; this.done = null; this.close(); d?.(v); }
  close(): void { if (this.done) { const d = this.done; this.done = null; d(null); } super.close(); }
}

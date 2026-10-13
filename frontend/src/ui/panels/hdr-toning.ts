import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

/** Leaving 32 bits (1.53.9, the parity plan's H1): Photoshop's HDR Toning, method Exposure and Gamma. */
export class HdrToningDialog extends Dialog {
  private readonly exposure = el<HTMLInputElement>('<input class="cv-input" type="number" min="-20" max="20" step="0.1" value="0" aria-label="Exposure">');
  private readonly gamma = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.1" max="9.99" step="0.05" value="1" aria-label="Gamma">');
  private readonly info = el('<p class="cv-note"></p>');
  private done: ((v: { exposure: number; gamma: number } | null) => void) | null = null;
  constructor() {
    super('HDR Toning', 380);
    const row = (label: string, c: HTMLElement): HTMLElement => { const r = el('<label class="cv-dialog-row"><span></span></label>'); setText(r.querySelector('span') as HTMLElement, label); r.append(c); return r; };
    this.body.append(this.info, row('Exposure', this.exposure), row('Gamma', this.gamma));
    this.button('Cancel', 'ghost', () => this.finish(null));
    this.button('OK', 'primary', () => this.finish({ exposure: Number(this.exposure.value) || 0, gamma: Math.max(0.1, Number(this.gamma.value) || 1) }));
    this.remember();
  }
  ask(bits: number): Promise<{ exposure: number; gamma: number } | null> {
    setText(this.info, `Method: Exposure and Gamma. Brighter than white is clipped at ${bits} bits; lower the exposure to keep highlights.`);
    this.open();
    return new Promise((res) => { this.done = res; });
  }
  private finish(v: { exposure: number; gamma: number } | null): void { const d = this.done; this.done = null; this.close(); d?.(v); }
  close(): void { if (this.done) { const d = this.done; this.done = null; d(null); } super.close(); }
}

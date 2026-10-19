import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

export type TiffLayers = 'layers' | 'flat';

const ASK_KEY = 'formvis.tiffLayersAsk', KEEP_KEY = 'formvis.tiffLayersKeep';

/** TIFF Options for a document with layers: save the layers beside the picture or discard them into a flat TIFF, and
 *  whether to ask each time ("Ask Before Saving Layered TIFF Files"). The choice is remembered in this browser. All
 *  controls exist from the start. */
export class TiffOptionsDialog extends Dialog {
  private readonly layers = el<HTMLSelectElement>('<select class="cv-input" aria-label="Layers"><option value="layers">Save layers (a TIFF with its layers)</option><option value="flat">Discard layers (a flat TIFF)</option></select>');
  private readonly ask = el<HTMLInputElement>('<input type="checkbox" aria-label="Ask before saving layered TIFF files">');
  private readonly note = el('<p class="cv-dialog-note" role="status"></p>');
  private answer: ((v: TiffLayers | null) => void) | null = null;

  constructor() {
    super('TIFF Options', 420);
    const row = (label: string, control: HTMLElement, cls = 'cv-dialog-row'): HTMLElement => { const r = el(`<label class="${cls}"><span>${label}</span></label>`); r.append(control); return r; };
    this.layers.addEventListener('change', () => this.describe());
    this.body.append(row('Layers', this.layers), row('Ask before saving layered TIFF files', this.ask, 'cv-dialog-row cv-check'), this.note);
    this.button('Cancel', 'ghost', () => this.finish(null));
    this.button('Save', 'primary', () => this.finish(this.layers.value === 'flat' ? 'flat' : 'layers'));
    this.onClose = () => this.finish(null);
  }

  /** What to save: the remembered choice when the person turned asking off, else the answer to the prompt (null on Cancel). */
  choose(layerCount: number): Promise<TiffLayers | null> {
    let asking = true, keep: TiffLayers = 'layers';
    try { asking = localStorage.getItem(ASK_KEY) !== 'off'; keep = localStorage.getItem(KEEP_KEY) === 'flat' ? 'flat' : 'layers'; } catch { /* storage unavailable: ask every time */ }
    if (!asking || layerCount < 2) return Promise.resolve(layerCount < 2 ? 'flat' : keep);
    return new Promise((resolve) => {
      this.answer = resolve;
      this.layers.value = keep;
      this.ask.checked = true;
      this.describe();
      this.open();
    });
  }

  private describe(): void {
    setText(this.note, this.layers.value === 'flat' ? 'The TIFF holds the flattened picture only; every other program opens it.' : 'The TIFF holds the flattened picture and, beside it, the layers formvis reopens.');
  }

  private finish(v: TiffLayers | null): void {
    const a = this.answer;
    if (!a) return;
    this.answer = null;
    if (v) { try { localStorage.setItem(ASK_KEY, this.ask.checked ? 'on' : 'off'); localStorage.setItem(KEEP_KEY, v); } catch { /* the choice is not kept */ } }
    if (this.isOpen) this.close();
    a(v);
  }
}

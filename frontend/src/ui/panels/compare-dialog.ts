import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { toast } from '../toast';
import { numberRow, selectRow, sliderRow, type Row } from './controls';

/** Edit > Compare with... (DEV_PLAN 36.5): pick another open document, a Threshold (0 to 255, the largest channel
 *  difference that still counts as the same) and a Min region size (pixels); OK makes a new document with the two
 *  pictures and a Differences layer in Difference blend mode, the differing regions selected, and says how many there
 *  are. */
export class CompareDialog extends Dialog {
  private threshold = 16;
  private minSize = 4;
  private pick = '';
  private readonly docRow: Row<string>;
  private readonly thresholdRow: Row<number>;
  private readonly minRow: Row<number> & { input: HTMLInputElement };
  private readonly select: HTMLSelectElement;
  private readonly okBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine) {
    super('Compare with', 380);
    this.docRow = selectRow('Document', [], (v) => { this.pick = v; });
    this.select = this.docRow.el.querySelector('select') as HTMLSelectElement;
    this.thresholdRow = sliderRow('Threshold', 0, 255, 1, (v) => { this.threshold = v; });
    this.minRow = numberRow('Min region size (px)', 1, 1000000, 1, (v) => { this.minSize = Math.max(1, Math.round(v)); });
    this.body.append(this.docRow.el, this.thresholdRow.el, this.minRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => this.commit());
    this.remember();
  }

  show(): void {
    if (this.isOpen) return;
    const others = this.engine.projects.filter((p) => p !== this.engine.current);
    if (!this.engine.current || !others.length) { toast('Open a second document to compare with.'); return; }
    this.select.replaceChildren(...others.map((p) => { const o = document.createElement('option'); o.value = p.doc.id; o.textContent = p.name; return o; }));
    if (!others.some((p) => p.doc.id === this.pick)) this.pick = others[0].doc.id;
    this.docRow.set(this.pick);
    this.thresholdRow.set(this.threshold);
    this.minRow.set(this.minSize);
    this.open(this.okBtn);
  }

  private commit(): void {
    const other = this.engine.projects.find((p) => p.doc.id === this.pick);
    this.close();
    if (!other) { toast('That document is no longer open.', 'error'); return; }
    const n = this.engine.compareDocuments(other, this.threshold, this.minSize);
    if (n === null) return;
    toast(n === 0 ? 'No differences found.' : n === 1 ? 'Found 1 region that differs.' : `Found ${n} regions that differ.`);
  }
}

import type { DocMode } from '../../engine/types';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow, type Row } from './controls';

/** The source modes Conditional Mode Change can name, in Photoshop's order. */
export const SOURCE_MODES: ReadonlyArray<readonly [DocMode, string]> = [
  ['bitmap', 'Bitmap'], ['grayscale', 'Grayscale'], ['duotone', 'Duotone'], ['indexed', 'Indexed Color'],
  ['rgb', 'RGB Color'], ['cmyk', 'CMYK Color'], ['lab', 'Lab Color'], ['multichannel', 'Multichannel'],
];

/** The modes a document can be changed to here. */
export const TARGET_MODES: ReadonlyArray<readonly [DocMode, string]> = [
  ['rgb', 'RGB Color'], ['cmyk', 'CMYK Color'], ['lab', 'Lab Color'], ['grayscale', 'Grayscale'], ['bitmap', 'Bitmap'], ['indexed', 'Indexed Color'],
];

/** File > Automate > Conditional Mode Change (DEV_PLAN 30.5a), as Photoshop's: tick the source modes, pick the target;
 *  a document whose mode is ticked is changed, any other is left alone. Built once; later only values change. */
export class ConditionalModeDialog extends Dialog {
  onApply: (from: DocMode[], to: DocMode) => void = () => undefined;
  private readonly ticked = new Set<DocMode>(['rgb']);
  private target: DocMode = 'rgb';
  private readonly rows: Array<readonly [DocMode, Row<boolean>]> = [];
  private readonly targetRow: Row<string>;
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');

  constructor() {
    super('Conditional Mode Change', 380);
    const list = el('<div></div>');
    for (const [mode, text] of SOURCE_MODES) {
      const row = checkRow(text, (v) => { if (v) this.ticked.add(mode); else this.ticked.delete(mode); });
      this.rows.push([mode, row]);
      list.append(row.el);
    }
    const all = el('<button class="cv-btn" type="button">All</button>') as HTMLButtonElement;
    const none = el('<button class="cv-btn" type="button">None</button>') as HTMLButtonElement;
    all.addEventListener('click', () => this.tick(SOURCE_MODES.map(([m]) => m)));
    none.addEventListener('click', () => this.tick([]));
    const bar = el('<div></div>');
    bar.append(all, none);
    this.targetRow = selectRow('Target Mode', TARGET_MODES.map(([m, t]) => [m, t] as const), (v) => { this.target = v as DocMode; });
    this.body.append(el('<p class="cv-dialog-note">Source Mode</p>'), list, bar, this.targetRow.el, this.note);
    this.tick(['rgb']);
    this.targetRow.set('rgb');
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void { setText(this.note, ''); this.open(); }

  private tick(modes: readonly DocMode[]): void {
    this.ticked.clear();
    for (const [mode, row] of this.rows) {
      const on = modes.includes(mode);
      if (on) this.ticked.add(mode);
      row.set(on);
    }
  }

  private apply(): void {
    if (!this.ticked.size) { setText(this.note, 'Tick at least one source mode.'); return; }
    const from = SOURCE_MODES.map(([m]) => m).filter((m) => this.ticked.has(m));
    this.close();
    this.onApply(from, this.target);
  }
}

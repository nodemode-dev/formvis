import { Dialog } from '../dialogs';
import { EXTRA_LABELS, extraOn, onExtras, setExtra, type ExtraKey } from '../view-extras';
import { checkRow, type Row } from './controls';

/** View > Show > Show Extras Options: which of the canvas helpers View > Extras shows. Each box is the helper's own switch. */
export class ExtrasOptionsDialog extends Dialog {
  private readonly rows: Array<[ExtraKey, Row<boolean>]> = [];

  constructor() {
    super('Show Extras Options', 360);
    for (const [key, label] of EXTRA_LABELS) {
      const row = checkRow(label, (on) => setExtra(key, on));
      this.body.appendChild(row.el);
      this.rows.push([key, row]);
    }
    this.button('Done', 'primary', () => this.close());
    onExtras(() => this.sync());
  }

  private sync(): void { for (const [key, row] of this.rows) row.set(extraOn(key)); }

  show(): void {
    this.sync();
    this.open();
  }
}

import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { numberRow } from './controls';

/** Image > Frequency Separation (DEV_PLAN 17): the blur radius that splits the picture into a Low Frequency layer and
 *  a High Frequency layer; the controls are built once. */
export class FrequencyDialog extends Dialog {
  private radius = 8;
  private readonly radiusRow = numberRow('Radius (px)', 0.5, 100, 0.5, (v) => { this.radius = v; });

  constructor(private readonly engine: Engine) {
    super('Frequency Separation', 340);
    this.radiusRow.set(8);
    this.body.append(el('<p class="cv-dialog-note">Splits what is visible into a blurred Low Frequency layer for colour and tone and a High Frequency layer for fine detail. A larger radius puts more into the detail layer.</p>'), this.radiusRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(): void {
    this.open();
  }

  private apply(): void {
    const r = Number.isFinite(this.radius) ? this.radius : 8;
    this.close();
    this.engine.frequencySeparation(r);
  }
}

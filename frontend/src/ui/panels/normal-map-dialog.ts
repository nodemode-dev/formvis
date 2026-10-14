import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { checkRow, sliderRow } from './controls';

export type MapKind = 'normal' | 'bump';

/** Filter > 3D > Generate Normal Map / Generate Bump Map (DEV_PLAN 31.9). Rows are built once; show() only sets
 *  values, the title text and the Flip Y row's hidden state. */
export class NormalMapDialog extends Dialog {
  private kind: MapKind = 'normal';
  private opts = { strength: 2, blur: 1, invert: false, flipY: false };
  private readonly strength = sliderRow('Strength', 0.1, 20, 0.1, (v) => { this.opts.strength = v; });
  private readonly blur = sliderRow('Blur (px)', 0, 20, 1, (v) => { this.opts.blur = v; });
  private readonly invert = checkRow('Invert Height', (v) => { this.opts.invert = v; });
  private readonly flip = checkRow('Flip Y (DirectX)', (v) => { this.opts.flipY = v; });

  constructor(private readonly engine: Engine) {
    super('Generate Normal Map', 400);
    this.body.append(this.strength.el, this.blur.el, this.invert.el, this.flip.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => { this.close(); this.engine.generateMap(this.kind, this.opts); });
  }

  show(kind: MapKind): void {
    this.kind = kind;
    this.opts = { strength: 2, blur: 1, invert: false, flipY: false };
    this.strength.set(2); this.blur.set(1); this.invert.set(false); this.flip.set(false);
    this.flip.el.hidden = kind !== 'normal';
    this.setTitle(kind === 'normal' ? 'Generate Normal Map' : 'Generate Bump Map');
    this.open();
  }
}

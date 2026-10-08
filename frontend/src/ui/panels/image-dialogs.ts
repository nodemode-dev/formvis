import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el, q, setText } from '../dom';
import { checkRow, numberRow, selectRow } from './controls';

const enterTo = (input: HTMLInputElement, run: () => void): void => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

/** Image > Image Rotation > Arbitrary (1.65.5), Photoshop's Rotate Canvas dialog: an angle and a direction; OK turns
 *  the canvas by it as one step. The last angle and direction are offered again. */
export class ArbitraryRotationDialog extends Dialog {
  private last = { angle: 0, dir: 'cw' };
  private readonly angle = numberRow('Angle (degrees)', -359.99, 359.99, 0.01, () => undefined);
  private readonly dir = selectRow('Direction', [['cw', 'Clockwise'], ['ccw', 'Counter Clockwise']], () => undefined);

  constructor(private readonly engine: Engine) {
    super('Rotate Canvas', 320);
    this.body.append(this.angle.el, this.dir.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.angle.input, () => this.apply());
  }

  show(): void {
    if (this.isOpen || !this.engine.current) return;
    this.angle.set(this.last.angle);
    this.dir.set(this.last.dir);
    this.open(this.angle.input);
    this.angle.input.select();
  }

  private apply(): void {
    const v = Math.round(Number(this.angle.input.value) * 100) / 100, dir = q<HTMLSelectElement>(this.dir.el, 'select').value;
    if (!Number.isFinite(v) || Math.abs(v) >= 360) { this.engine.notice('Enter an angle from -359.99 to 359.99 degrees.'); return; }
    this.last = { angle: v, dir };
    this.close();
    if (v) this.engine.rotateCanvasBy(dir === 'ccw' ? -v : v);
  }
}

/** Image > Duplicate (1.65.5), Photoshop's Duplicate Image dialog: the copy's name, and Duplicate Merged Layers Only
 *  (the picture in one layer), offered when the document has more than one layer. OK opens the copy. */
export class DuplicateImageDialog extends Dialog {
  private readonly note = el('<p class="cv-note"></p>');
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private readonly merged = checkRow('Duplicate Merged Layers Only', () => undefined);

  constructor(private readonly engine: Engine) {
    super('Duplicate Image', 360);
    this.body.append(this.note);
    this.field('As', this.name);
    this.body.append(this.merged.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.name, () => this.apply());
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const box = q<HTMLInputElement>(this.merged.el, 'input');
    setText(this.note, `Duplicate: ${p.name}`);
    this.name.value = `${p.name} copy`;
    this.merged.set(false);
    box.disabled = p.doc.layers.length < 2;
    this.open(this.name);
    this.name.select();
  }

  private apply(): void {
    const box = q<HTMLInputElement>(this.merged.el, 'input'), name = this.name.value;
    this.close();
    this.engine.duplicateDocument(name, box.checked && !box.disabled);
  }
}

import { BLEND_MODES, canvasBlend, type BlendMode, type Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

const enterTo = (input: HTMLInputElement, run: () => void): void => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

/** Layer > New > Layer (Shift+Ctrl+N): Name, Mode and Opacity, as Photoshop's New Layer dialog has them (sourced in
 *  WORKSPACE_RESEARCH.md). Photoshop's Color row labels the layer in the panel; sonny's layers have no colour labels
 *  yet, so it is not shown. The Layers panel's New Layer button still makes a layer at once. */
export class NewLayerDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private blend: BlendMode = 'normal';
  private opacity = 100;
  private readonly modeRow = selectRow('Mode', BLEND_MODES.filter((m) => canvasBlend(m.id)).map((m) => [m.id, m.label] as const), (v) => { this.blend = v as BlendMode; });
  private readonly opacityRow = sliderRow('Opacity (%)', 0, 100, 1, (v) => { this.opacity = v; });
  private clip = false;
  private readonly clipRow = checkRow('Use Previous Layer to Create Clipping Mask', (v) => { this.clip = v; });

  constructor(private readonly engine: Engine) {
    super('New Layer', 380);
    this.field('Name', this.name);
    this.body.append(this.clipRow.el, this.modeRow.el, this.opacityRow.el, el('<p class="cv-note">Photoshop\'s Color label and Fill With Mode-Neutral Color are not in sonny yet.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.name, () => this.apply());
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const names = new Set(p.doc.layers.map((l) => l.name));
    let n = 1;
    while (names.has(`Layer ${n}`)) n += 1;
    this.name.value = `Layer ${n}`;
    this.blend = 'normal';
    this.opacity = 100;
    this.clip = false;
    this.clipRow.set(false);
    this.modeRow.set(this.blend);
    this.opacityRow.set(this.opacity);
    this.open(this.name);
    this.name.select();
  }

  private apply(): void {
    this.close();
    this.engine.addLayer({ name: this.name.value, blend: this.blend, opacity: this.opacity / 100, clip: this.clip });
  }
}

/** Layer > New > Group: a name for the group, as Photoshop's dialog asks (Adobe's "Create layers and groups"; sourced
 *  in WORKSPACE_RESEARCH.md from Adobe alone). Photoshop's dialog also sets a group's Color, Mode and Opacity; sonny's
 *  folders do not render a blend mode or opacity yet, so the dialog says so rather than offer settings that do nothing. */
export class NewGroupDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');

  constructor(private readonly engine: Engine) {
    super('New Group', 360);
    this.field('Name', this.name);
    this.body.append(el('<p class="cv-note">Photoshop also sets a group\'s Color, Mode and Opacity; sonny\'s folders do not have these yet.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.name, () => this.apply());
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const names = new Set(p.doc.layers.map((l) => l.name));
    let n = 1;
    while (names.has(`Folder ${n}`)) n += 1;
    this.name.value = `Folder ${n}`;
    this.open(this.name);
    this.name.select();
  }

  private apply(): void {
    this.close();
    this.engine.addFolder(this.name.value);
  }
}

/** Layer > Duplicate Layer: a name for the duplicate, as Photoshop's dialog asks (sourced in WORKSPACE_RESEARCH.md).
 *  Photoshop also offers a destination document; copying layers between open documents is not built yet, so the
 *  duplicate goes in this one. With several layers chosen, each keeps its own "copy" name. */
export class DuplicateLayerDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private readonly note = el('<p class="cv-note" hidden>Several layers are chosen; each duplicate is named after its layer.</p>');

  constructor(private readonly engine: Engine) {
    super('Duplicate Layer', 360);
    this.field('As', this.name);
    this.body.append(this.note, el('<p class="cv-note">The duplicate goes in this document; choosing another open document is not in sonny yet.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.name, () => this.apply());
  }

  show(): void {
    const p = this.engine.current, l = p?.activeLayer;
    if (this.isOpen || !p || !l) return;
    const several = p.selectedIds.size > 1;
    this.name.value = several ? '' : `${l.name} copy`;
    this.name.disabled = several;
    this.note.hidden = !several;
    this.open(this.name);
    if (!several) this.name.select();
  }

  private apply(): void {
    this.close();
    this.engine.duplicateLayers(this.name.disabled ? undefined : this.name.value);
  }
}

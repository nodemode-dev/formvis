import { BLEND_MODES, canvasBlend, type BlendMode, type Engine, type Layer, type LayerLocks } from '../../engine';
import { LAYER_LABELS, type LayerLabel } from '../../engine/types';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

const enterTo = (input: HTMLInputElement, run: () => void): void => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

/** Layer > New > Layer (Shift+Ctrl+N): Name, Color label, Mode, Opacity and Fill with Mode-Neutral Color. The Layers
 *  panel's New Layer button still makes a layer at once. */
export class NewLayerDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private blend: BlendMode = 'normal';
  private opacity = 100;
  private readonly modeRow = selectRow('Mode', BLEND_MODES.filter((m) => canvasBlend(m.id)).map((m) => [m.id, m.label] as const), (v) => { this.blend = v as BlendMode; });
  private readonly opacityRow = sliderRow('Opacity (%)', 0, 100, 1, (v) => { this.opacity = v; });
  private clip = false;
  private readonly clipRow = checkRow('Use Previous Layer to Create Clipping Mask', (v) => { this.clip = v; });
  private label: LayerLabel | null = null;
  private readonly labelRow = selectRow('Color', [['none', 'None'], ...LAYER_LABELS.map((c) => [c, c[0].toUpperCase() + c.slice(1)] as const)], (v) => { this.label = v === 'none' ? null : v as LayerLabel; });
  private neutral = false;
  private readonly neutralRow = checkRow('Fill with Mode-Neutral Color', (v) => { this.neutral = v; });

  constructor(private readonly engine: Engine) {
    super('New Layer', 380);
    this.field('Name', this.name);
    this.body.append(this.clipRow.el, this.labelRow.el, this.modeRow.el, this.opacityRow.el, this.neutralRow.el, el('<p class="cv-note">Fill with Mode-Neutral Color applies to modes that have a neutral color; Normal, Dissolve and the color modes stay transparent.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.name, () => this.apply());
    this.remember();
  }

  private background = false;

  /** `background`: Layer > New > Layer from Background, the Background renamed (Layer 0) rather than a layer added. */
  show(background = false): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const names = new Set(p.doc.layers.map((l) => l.name));
    let n = 1;
    while (names.has(`Layer ${n}`)) n += 1;
    this.background = background;
    this.name.value = background ? 'Layer 0' : `Layer ${n}`;
    this.clipRow.el.hidden = background;
    this.blend = 'normal';
    this.opacity = 100;
    this.clip = false;
    this.clipRow.set(false);
    this.label = null;
    this.labelRow.set('none');
    this.neutral = false;
    this.neutralRow.set(false);
    this.neutralRow.el.hidden = background;
    this.labelRow.el.hidden = background;
    this.modeRow.set(this.blend);
    this.opacityRow.set(this.opacity);
    this.open(this.name);
    this.name.select();
  }

  private apply(): void {
    this.close();
    if (this.background) this.engine.layerFromBackground({ name: this.name.value, blend: this.blend, opacity: this.opacity / 100 });
    else this.engine.addLayerWith({ name: this.name.value, blend: this.blend, opacity: this.opacity / 100, clip: this.clip, label: this.label, neutral: this.neutral });
  }
}

/** Layer > New > Group: a name for the group (sourced in WORKSPACE_RESEARCH.md). A folder's blend mode and opacity
 *  (1.87.3) and colour label are set afterwards in the Layers panel and Layer > Color Label; the dialog says so. */
export class NewGroupDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');

  constructor(private readonly engine: Engine) {
    super('New Group', 360);
    this.field('Name', this.name);
    this.body.append(el('<p class="cv-note">A group\'s color label, blend mode and opacity are set in the Layers panel and Layer > Color Label after it is made.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.name, () => this.apply());
  }

  private fromLayers = false;

  /** `fromLayers`: Layer > New > Group from Layers, the selected layers moved into the new group. */
  show(fromLayers = false): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    const names = new Set(p.doc.layers.map((l) => l.name));
    let n = 1;
    while (names.has(`Folder ${n}`)) n += 1;
    this.fromLayers = fromLayers;
    this.setTitle(fromLayers ? 'New Group from Layers' : 'New Group');
    this.name.value = `Folder ${n}`;
    this.open(this.name);
    this.name.select();
  }

  private apply(): void {
    this.close();
    if (this.fromLayers) this.engine.groupLayers(this.name.value);
    else this.engine.addFolder(this.name.value);
  }
}

/** Layer > Duplicate Layer: a name for the duplicate and a Document destination: this document, another open one or a
 *  new one. With several layers chosen, each keeps its own "copy" name. Copies into another document keep their names
 *  and are centred there. */
export class DuplicateLayerDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');
  private readonly note = el('<p class="cv-note" hidden>Several layers are chosen; each duplicate is named after its layer.</p>');
  private readonly dest = el<HTMLSelectElement>('<select class="cv-input" aria-label="Document"></select>');
  private readonly docName = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false" aria-label="Name of the new document">');
  private readonly docField: HTMLElement;

  constructor(private readonly engine: Engine) {
    super('Duplicate Layer', 360);
    this.field('As', this.name);
    this.field('Document', this.dest);
    this.docField = this.field('Name', this.docName);
    this.dest.addEventListener('change', () => this.sync());
    this.body.append(this.note);
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
    const opts = [['', p.name ? `${p.name} (this document)` : 'This document'], ...this.engine.projects.filter((o) => o !== p).map((o) => [o.id, o.name || 'Untitled'] as const), ['new', 'New']] as const;
    this.dest.replaceChildren(...opts.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
    this.docName.value = l.name;
    this.sync();
    this.open(this.name);
    if (!several) this.name.select();
  }

  private sync(): void {
    const away = this.dest.value !== '';
    this.name.disabled = away || (this.engine.current?.selectedIds.size ?? 0) > 1;
    this.docField.hidden = this.dest.value !== 'new';
  }

  private apply(): void {
    this.close();
    if (this.dest.value) this.engine.duplicateLayersTo(this.dest.value, this.docName.value);
    else this.engine.duplicateLayers(this.name.disabled ? undefined : this.name.value);
  }
}

/** Select > Find Layers: the layers whose names hold the text typed, selected. */
export class FindLayersDialog extends Dialog {
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="200" spellcheck="false">');

  constructor(private readonly engine: Engine) {
    super('Find Layers', 360);
    this.field('Name', this.name);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.name, () => this.apply());
  }

  show(): void {
    if (this.isOpen || !this.engine.current) return;
    this.open(this.name);
    this.name.select();
  }

  private apply(): void {
    if (!this.name.value.trim()) return;
    this.close();
    this.engine.findLayers(this.name.value);
  }
}

const LOCK_ROWS = [['transparency', 'Transparency'], ['pixels', 'Image'], ['position', 'Position'], ['artboard', 'Artboard auto-nesting'], ['all', 'All']] as const;

/** Layer > Lock Layers (1.65.3), or Lock All Layers in Group with a folder selected: the four locks for the
 *  selected layers (and, for a folder, the layers in it), each ticked when every selected layer has it. */
export class LockLayersDialog extends Dialog {
  private readonly state: Required<LayerLocks> = { transparency: false, pixels: false, position: false, artboard: false, all: false };
  private readonly rows = LOCK_ROWS.map(([k, label]) => checkRow(label, (v) => { this.state[k] = v; }));
  private deep = false;

  constructor(private readonly engine: Engine) {
    super('Lock Layers', 320);
    this.body.append(...this.rows.map((r) => r.el));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
  }

  show(deep: boolean): void {
    const p = this.engine.current;
    if (this.isOpen || !p || !p.selectedIds.size) return;
    this.deep = deep;
    this.setTitle(deep ? 'Lock All Layers in Group' : 'Lock Layers');
    const ls = [...p.selectedIds].map((id) => p.layer(id)).filter((l): l is Layer => !!l);
    LOCK_ROWS.forEach(([k], i) => { this.state[k] = ls.length > 0 && ls.every((l) => !!l.locks?.[k]); this.rows[i].set(this.state[k]); });
    this.open();
  }

  private apply(): void {
    this.close();
    this.engine.setLocks({ ...this.state }, this.deep);
  }
}

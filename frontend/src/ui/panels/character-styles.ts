import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';

/** Window > Character Styles (DEV_PLAN 32.6 part c): the document's character styles. A style sets only some fields (family,
 *  size, colour, weight, slant, tracking, OpenType features) and, when linked to a type layer, draws over the layer's own.
 *  New Style takes those from the selected type layer and links it; Apply links the chosen style; Clear Override unlinks it;
 *  Redefine takes the layer's settings into the style and re-renders every layer linked to it; Rename and Delete follow.
 *  Each is one undo step. Names are user text, so the list is built from options. */
export class CharacterStylesDialog extends Dialog {
  private readonly list = el<HTMLSelectElement>('<select class="cv-input cv-pstyle-list" size="6"></select>');
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="Style name">');

  constructor(private readonly engine: Engine) {
    super('Character Styles', 400);
    const nameRow = el('<label class="cv-field"><span>Name</span></label>');
    nameRow.append(this.name);
    const act = (label: string, run: () => void | Promise<void>): HTMLButtonElement => {
      const b = el<HTMLButtonElement>(`<button class="cv-btn" type="button">${label}</button>`);
      b.addEventListener('click', () => { void Promise.resolve(run()).then(() => this.refresh()); });
      return b;
    };
    const chosen = (): string | null => this.list.value || null;
    const row = el('<div class="cv-pstyle-actions"></div>');
    row.append(
      act('New Style', () => { const id = this.engine.newCharacterStyle(this.name.value); if (id) { this.name.value = ''; this.refresh(id); } }),
      act('Apply', () => { const id = chosen(); return id ? this.engine.applyCharacterStyle(id) : undefined; }),
      act('Clear Override', () => this.engine.clearCharacterStyle()),
      act('Redefine', () => { const id = chosen(); return id ? this.engine.redefineCharacterStyle(id) : undefined; }),
      act('Rename', () => { const id = chosen(); if (id) { this.engine.renameCharacterStyle(id, this.name.value); this.name.value = ''; } }),
      act('Delete', () => { const id = chosen(); if (id) this.engine.deleteCharacterStyle(id); }),
    );
    this.body.append(this.list, nameRow, row);
    this.button('Done', 'primary', () => this.close());
  }

  /** The list from the document, keeping the chosen style when it is still there. */
  private refresh(select?: string): void {
    const keep = select ?? this.list.value;
    this.list.replaceChildren(...this.engine.characterStyles.map((s) => new Option(s.name, s.id)));
    if (keep && this.engine.characterStyles.some((s) => s.id === keep)) this.list.value = keep;
  }

  show(): void {
    if (this.isOpen) return;
    this.refresh();
    this.open();
  }
}

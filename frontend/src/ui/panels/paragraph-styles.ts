import type { Engine } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';

/** Window > Paragraph Styles: the document's styles. New Style makes one from the selected type layer's settings (and
 *  links the layer to it); Apply gives the selected layer the chosen style's settings, keeping its text; Redefine takes
 *  the selected layer's settings into the style and re-renders every layer linked to it; Delete removes the style, the
 *  linked layers keeping their look. Each is one undo step. Names are user text, so the list is built from options. */
export class ParagraphStylesDialog extends Dialog {
  private readonly list = el<HTMLSelectElement>('<select class="cv-input cv-pstyle-list" size="6"></select>');
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" placeholder="New style name">');

  constructor(private readonly engine: Engine) {
    super('Paragraph Styles', 400);
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
      act('New Style', () => { const id = this.engine.newParagraphStyle(this.name.value); if (id) { this.name.value = ''; this.refresh(id); } }),
      act('Apply', () => { const id = chosen(); return id ? this.engine.applyParagraphStyle(id) : undefined; }),
      act('Redefine', () => { const id = chosen(); return id ? this.engine.redefineParagraphStyle(id) : undefined; }),
      act('Clear Override', () => this.engine.clearParagraphOverride()),
      act('Duplicate', () => { const id = chosen(); const copy = id ? this.engine.duplicateParagraphStyle(id) : null; if (copy) this.refresh(copy); }),
      act('Rename', () => { const id = chosen(); if (id) { this.engine.renameParagraphStyle(id, this.name.value); this.name.value = ''; } }),
      act('Delete', () => { const id = chosen(); if (id) this.engine.deleteParagraphStyle(id); }),
    );
    this.body.append(this.list, nameRow, row);
    this.button('Done', 'primary', () => this.close());
  }

  /** The list from the document, keeping the chosen style when it is still there. */
  private refresh(select?: string): void {
    const keep = select ?? this.list.value;
    this.list.replaceChildren(...this.engine.paragraphStyles.map((s) => new Option(s.name, s.id)));
    if (keep && this.engine.paragraphStyles.some((s) => s.id === keep)) this.list.value = keep;
  }

  show(): void {
    if (this.isOpen) return;
    this.refresh();
    this.open();
  }
}

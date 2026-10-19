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
      act('Duplicate', () => { const id = chosen(); const copy = id ? this.engine.duplicateCharacterStyle(id) : null; if (copy) this.refresh(copy); }),
      act('Rename', () => { const id = chosen(); if (id) { this.engine.renameCharacterStyle(id, this.name.value); this.name.value = ''; } }),
      act('Delete', () => { const id = chosen(); if (id) this.engine.deleteCharacterStyle(id); }),
    );
    this.list.addEventListener('change', () => this.fill());
    this.body.append(this.list, nameRow, row, this.optionsEditor(), this.diff);
    this.button('Done', 'primary', () => this.close());
  }

  private readonly diff = el('<div class="cv-cstyle-diff" aria-live="polite"></div>');
  private readonly fields = new Map<string, HTMLInputElement | HTMLSelectElement>();

  /** Style Options: one field per setting a style can carry. A blank field leaves the setting to the layer; a change is one
   *  undo step and re-renders the layers linked to the style. Built once and filled in place. */
  private optionsEditor(): HTMLElement {
    const box = el('<div class="cv-cstyle-opts"></div>');
    const add = (key: string, label: string, input: HTMLInputElement | HTMLSelectElement, read: () => unknown): void => {
      const f = el(`<label class="cv-field"><span>${label}</span></label>`);
      f.append(input);
      input.addEventListener('change', () => { const id = this.list.value; if (id) void this.engine.updateCharacterStyle(id, { [key]: read() } as never).then(() => this.fill()); });
      this.fields.set(key, input);
      box.append(f);
    };
    const num = (key: string, label: string, lo: number, hi: number): void => {
      const i = el<HTMLInputElement>(`<input class="cv-input" type="number" min="${lo}" max="${hi}" step="1" aria-label="${label}">`);
      add(key, label, i, () => (i.value.trim() === '' || !Number.isFinite(Number(i.value)) ? null : Math.min(hi, Math.max(lo, Number(i.value)))));
    };
    const pick = (key: string, label: string, opts: Array<[string, string]>, read: (v: string) => unknown): void => {
      const s = el<HTMLSelectElement>(`<select class="cv-select" aria-label="${label}">${opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>`);
      add(key, label, s, () => read(s.value));
    };
    const fam = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false" aria-label="Font family">');
    add('family', 'Font', fam, () => fam.value.trim() || null);
    num('size', 'Size', 1, 2000); num('tracking', 'Tracking', -1000, 10000); num('scaleX', 'H scale %', 10, 500); num('scaleY', 'V scale %', 10, 500); num('baselineShift', 'Baseline', -2000, 2000);
    const tri = (v: string): unknown => (v === '' ? null : v === '1');
    const triOpts: Array<[string, string]> = [['', 'From layer'], ['1', 'On'], ['0', 'Off']];
    pick('bold', 'Bold', triOpts, tri); pick('italic', 'Italic', triOpts, tri);
    pick('underline', 'Underline', triOpts, (v) => (v === '1' ? true : v === '0' ? false : null)); pick('strike', 'Strikethrough', triOpts, (v) => (v === '1' ? true : v === '0' ? false : null));
    pick('caps', 'Caps', [['', 'From layer'], ['all', 'All Caps'], ['small', 'Small Caps']], (v) => v || null);
    return box;
  }

  /** The option fields and the differing-settings line for the chosen style, written in place. */
  private fill(): void {
    const s = this.engine.characterStyles.find((x) => x.id === this.list.value) as unknown as Record<string, unknown> | undefined;
    for (const [key, input] of this.fields) {
      const v = s?.[key];
      input.disabled = !s;
      if (document.activeElement === input) continue;
      input.value = v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
    }
    const over = s ? this.engine.characterStyleOverrides(String(s.id)) : [];
    const text = !s ? '' : over.length ? `The selected layer differs from this style in: ${over.join(', ')}.` : 'The selected layer matches this style.';
    if (this.diff.textContent !== text) this.diff.textContent = text;
  }

  /** The list from the document, keeping the chosen style when it is still there. */
  private refresh(select?: string): void {
    const keep = select ?? this.list.value;
    this.list.replaceChildren(...this.engine.characterStyles.map((s) => new Option(s.name, s.id)));
    if (keep && this.engine.characterStyles.some((s) => s.id === keep)) this.list.value = keep;
    else if (this.engine.characterStyles.length) this.list.value = this.engine.characterStyles[0].id;
    this.fill();
  }

  show(): void {
    if (this.isOpen) return;
    this.refresh();
    this.open();
  }
}

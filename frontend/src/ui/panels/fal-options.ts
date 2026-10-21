import type { FalModel } from '../../io/api';
import { falOptionInputs, falPricing, falSupplied } from '../../io/fal';
import { el, setHidden, setText } from '../dom';

/** The options of the fal catalogue model chosen in a dialog, built from its schema: a select for an enum, a number
 *  with its range, a check for a boolean, a text for a string, all under More options. The container is built once;
 *  a model change replaces only its fields, and what the person set is read back as the inputs of the run. */
export class FalOptions {
  readonly el = el('<div class="cv-fal" hidden></div>');
  private readonly note = el('<p class="cv-note cv-fal-note"></p>');
  private readonly more = el<HTMLDetailsElement>('<details class="cv-fal-more"><summary>More options</summary><div class="cv-fal-fields"></div></details>');
  private readonly fields = this.more.querySelector('.cv-fal-fields') as HTMLElement;
  private readonly set = new Map<string, unknown>();
  private current: FalModel | null = null;

  constructor() {
    this.el.append(this.note, this.more);
    this.fields.addEventListener('change', (ev) => this.read(ev.target as HTMLElement));
  }

  get model(): FalModel | null { return this.current; }

  /** Shows `model`'s options (or hides the block when null); `extra` names more keys the dialog supplies itself. */
  show(model: FalModel | null, extra: readonly string[] = []): void {
    if (model?.id === this.current?.id && model) return;
    this.current = model;
    this.set.clear();
    setHidden(this.el, !model);
    if (!model) { this.fields.replaceChildren(); return; }
    setText(this.note, falPricing(model));
    const inputs = falOptionInputs(model, falSupplied(model, extra));
    this.fields.replaceChildren(...inputs.map((i) => this.field(i)));
    setHidden(this.more, inputs.length === 0);
    this.more.open = false;
  }

  /** What the person changed, by schema key; a key left alone is not sent, so the model's own default stands. */
  values(): Record<string, unknown> { return Object.fromEntries(this.set); }

  private field(i: FalModel['inputs'][number]): HTMLElement {
    const label = i.label || i.key, tip = (i.description ?? '').trim();
    let row: HTMLElement;
    if (i.type === 'boolean') {
      row = el('<label class="cv-check"><input type="checkbox"><span></span></label>');
      const box = row.querySelector('input') as HTMLInputElement;
      box.checked = i.default === true;
      setText(row.querySelector('span') as HTMLElement, label);
      box.dataset.key = i.key; box.dataset.kind = 'boolean';
    } else {
      row = el('<label class="cv-field"><span></span></label>');
      setText(row.firstElementChild as HTMLElement, label);
      let input: HTMLInputElement | HTMLSelectElement;
      if (i.enum?.length) {
        const s = document.createElement('select');
        s.className = 'cv-input';
        s.append(Object.assign(document.createElement('option'), { value: '', textContent: i.default !== undefined ? `Default (${String(i.default)})` : 'Default' }), ...i.enum.map((v) => Object.assign(document.createElement('option'), { value: v, textContent: v })));
        s.dataset.kind = 'enum';
        input = s;
      } else if (i.type === 'string') {
        const t = document.createElement('input');
        t.className = 'cv-input'; t.type = 'text'; t.spellcheck = true;
        if (typeof i.default === 'string' && i.default) t.placeholder = i.default;
        t.dataset.kind = 'string';
        input = t;
      } else {
        const n = document.createElement('input');
        n.className = 'cv-input'; n.type = 'number';
        if (i.min !== undefined) n.min = String(i.min);
        if (i.max !== undefined) n.max = String(i.max);
        n.step = String(i.step ?? (i.type === 'integer' ? 1 : 'any'));
        if (i.default !== undefined && i.default !== null) n.placeholder = String(i.default);
        n.dataset.kind = 'number';
        input = n;
      }
      input.dataset.key = i.key;
      input.setAttribute('aria-label', label);
      row.appendChild(input);
    }
    if (tip) row.title = tip.length > 240 ? `${tip.slice(0, 237)}...` : tip;
    return row;
  }

  private read(t: HTMLElement): void {
    const key = t.dataset.key, kind = t.dataset.kind;
    if (!key) return;
    if (kind === 'boolean') { this.set.set(key, (t as HTMLInputElement).checked); return; }
    const v = (t as HTMLInputElement).value.trim();
    if (v === '') { this.set.delete(key); return; }
    if (kind === 'number') {
      const n = Number(v), inp = t as HTMLInputElement;
      if (!Number.isFinite(n)) { this.set.delete(key); return; }
      const lo = inp.min !== '' ? Number(inp.min) : -Infinity, hi = inp.max !== '' ? Number(inp.max) : Infinity;
      this.set.set(key, Math.min(hi, Math.max(lo, n)));
    } else this.set.set(key, v);
  }
}

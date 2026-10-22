import { falCatalogue, falModelsOf, falValue } from '../../io/fal';
import { genPrefs, saveGenPrefs, type GenPrefs, type GenSource } from '../../io/gen-prefs';
import { el, setText } from '../dom';

export interface ModelChoice { value: string; label: string }

/** The models a generative task can start with, in the values the Generative Fill dialog uses: the remembered choice,
 *  FLUX.1 Fill and LaMa, then the fal catalogue's models of the task's kind (fill and remove: edit and inpaint models;
 *  expand: expand models). */
export async function modelChoices(task: 'fill' | 'remove' | 'expand'): Promise<ModelChoice[]> {
  let all: Awaited<ReturnType<typeof falCatalogue>> = [];
  try { all = await falCatalogue(); } catch { all = []; }
  const cat = task === 'expand' ? falModelsOf(all, 'expand') : falModelsOf(all, 'edit', 'inpaint');
  return [
    { value: '', label: 'The model last used in the dialog' },
    { value: 'fal', label: 'FLUX.1 Fill (fal)' },
    { value: 'local:lama', label: 'LaMa, no prompt (this computer)' },
    ...cat.map((m) => ({ value: falValue(m), label: `${m.label} (fal${m.pricing ? `, ${m.pricing}` : ''})` })),
  ];
}

/** Fills a select with `choices` and selects `value`, adding it as an entry when the list no longer holds it. */
export function fillChoices(select: HTMLSelectElement, choices: ModelChoice[], value: string): void {
  const list = choices.some((c) => c.value === value) ? choices : [...choices, { value, label: `${value} (not in the list now)` }];
  const same = select.options.length === list.length && list.every((c, i) => select.options[i].value === c.value && select.options[i].textContent === c.label);
  if (!same) select.replaceChildren(...list.map((c) => Object.assign(document.createElement('option'), { value: c.value, textContent: c.label })));
  if (select.value !== value) select.value = value;
}

const SOURCE_LABELS: Record<GenSource, string> = {
  visible: 'All visible layers (hidden layers and folders left out)',
  current: 'The current layer only',
  below: 'Visible layers at and below the current layer',
};

/** Preferences > Generative: the model Generative Fill, Remove and Expand start with, and the layers their picture is
 *  made from. Rows are built once; refresh fills the lists from the catalogue and keeps the saved choices. */
export class GenerativePrefsSection {
  readonly el = el('<div class="cv-panel-section cv-gen-prefs"></div>');
  private readonly fill = el<HTMLSelectElement>('<select class="cv-input" aria-label="Generative Fill model"></select>');
  private readonly remove = el<HTMLSelectElement>('<select class="cv-input" aria-label="Remove model"></select>');
  private readonly expand = el<HTMLSelectElement>('<select class="cv-input" aria-label="Generative Expand model"></select>');
  private readonly source = el<HTMLSelectElement>('<select class="cv-input" aria-label="Layers sent"></select>');
  private readonly note = el('<p class="cv-note" role="status"></p>');

  constructor() {
    const row = (label: string, c: HTMLElement): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(c); return r; };
    for (const [v, label] of Object.entries(SOURCE_LABELS)) this.source.append(Object.assign(document.createElement('option'), { value: v, textContent: label }));
    this.el.append(
      row('Generative Fill', this.fill),
      row('Remove (no description)', this.remove),
      row('Generative Expand', this.expand),
      row('Layers sent', this.source),
      el('<p class="cv-note">The model each task starts with when you press Generate or Remove in the task bar; the Generative Fill dialog can still pick another for one run. Only the selection plus surrounding context is sent, never the whole picture, and the result comes back as a new layer masked to the selection. Instruction-edit models are told to change only the selected area and keep the rest.</p>'),
      this.note);
    const save = (patch: Partial<GenPrefs>): void => { saveGenPrefs(patch); setText(this.note, 'Saved.'); };
    this.fill.addEventListener('change', () => save({ fill: this.fill.value }));
    this.remove.addEventListener('change', () => save({ remove: this.remove.value }));
    this.expand.addEventListener('change', () => save({ expand: this.expand.value }));
    this.source.addEventListener('change', () => save({ source: this.source.value as GenSource }));
  }

  async refresh(): Promise<void> {
    const g = genPrefs();
    const [fill, expand] = await Promise.all([modelChoices('fill'), modelChoices('expand')]);
    fillChoices(this.fill, fill, g.fill);
    fillChoices(this.remove, [{ value: '', label: 'Same as Generative Fill' }, ...fill.slice(1)], g.remove);
    fillChoices(this.expand, expand, g.expand);
    if (this.source.value !== g.source) this.source.value = g.source;
  }
}

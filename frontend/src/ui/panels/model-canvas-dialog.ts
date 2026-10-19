import type { Engine } from '../../engine';
import { localModels } from '../../io/local-gen';
import { Dialog } from '../dialogs';
import { el, patchList, setText } from '../dom';
import { SIZES } from './generate-image';

interface Family { value: string; label: string; sizes: Array<{ value: string; label: string; width: number; height: number }> }

const parse = (s: string): { width: number; height: number } => { const [w, h] = s.split('x').map(Number); return { width: w, height: h }; };

/** New canvas from a model preset: a blank document at a size the chosen model family makes well. The cloud model
 *  takes the shapes Generate offers; each model on this computer takes the sizes its own catalogue entry lists. */
export class ModelCanvasDialog extends Dialog {
  private readonly model = el<HTMLSelectElement>('<select class="cv-input" aria-label="Model"></select>');
  private readonly size = el<HTMLSelectElement>('<select class="cv-input" aria-label="Size"></select>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private families: Family[] = [];

  constructor(private readonly engine: Engine) {
    super('New Canvas from Model Preset', 380);
    const m = el('<label class="cv-dialog-row"><span>Model</span></label>'), s = el('<label class="cv-dialog-row"><span>Size</span></label>');
    m.append(this.model);
    s.append(this.size);
    this.body.append(m, s, this.note);
    this.model.addEventListener('change', () => this.paintSizes());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Create', 'primary', () => this.create());
    this.remember();
  }

  async show(): Promise<void> {
    const locals = await localModels();
    this.families = [
      { value: 'fal', label: 'FLUX1.1 [pro] (fal)', sizes: SIZES.map(([id, label, width, height]) => ({ value: `${width}x${height}`, label, width, height, id })) },
      ...locals.filter((l) => l.sizes.length).map((l) => ({ value: l.id, label: `${l.label.replace(/ \(local\)$/, '')} (this computer)`, sizes: l.sizes.map((v) => ({ value: v, label: v.replace('x', ' x '), ...parse(v) })) })),
    ];
    patchList(this.model, this.families, {
      key: (f) => f.value,
      create: (f) => { const o = document.createElement('option'); o.value = f.value; setText(o, f.label); return o; },
      update: (o, f) => setText(o, f.label),
    });
    this.paintSizes();
    this.open();
  }

  private paintSizes(): void {
    const f = this.families.find((x) => x.value === this.model.value) ?? this.families[0];
    if (!f) return;
    const was = this.size.value;
    patchList(this.size, f.sizes, {
      key: (z) => z.value,
      create: (z) => { const o = document.createElement('option'); o.value = z.value; setText(o, z.label); return o; },
      update: (o, z) => setText(o, z.label),
    });
    if ([...this.size.options].some((o) => o.value === was)) this.size.value = was;
    setText(this.note, `${f.label}: ${f.sizes.length} size${f.sizes.length === 1 ? '' : 's'} from its catalogue.`);
  }

  private create(): void {
    const f = this.families.find((x) => x.value === this.model.value), z = f?.sizes.find((x) => x.value === this.size.value);
    if (!f || !z) return;
    const name = `${f.label.replace(/ \(.*\)$/, '')} ${z.width}x${z.height}`;
    if (this.engine.newDocument(z.width, z.height, name, 'white')) this.close();
    else setText(this.note, 'That size could not be created.');
  }
}

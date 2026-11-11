import { createSurface, ctxOf, Raster, toBlob, type Engine } from '../../engine';
import type { SelectionMode } from '../../engine';
import { api, type FalModel } from '../../io/api';
import { alphaMask, falCatalogue, falModelsOf, falRunImage, pngBlob } from '../../io/fal';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';
import { FalOptions } from './fal-options';

type Task = 'segment' | 'relight';

const WORDS: Record<Task, { title: string; hint: string; placeholder: string; go: string }> = {
  segment: { title: 'Select Subject by Text', hint: 'Name what to select; the mask fal returns becomes the selection.', placeholder: 'What to select, for example wheel', go: 'Select' },
  relight: { title: 'Relight with fal', hint: 'Describe the light; the relit picture arrives as a new layer above the others.', placeholder: 'Describe the lighting, for example warm sunset from the left', go: 'Relight' },
};

/** The two catalogue tasks that take one sentence: Select > Subject by Text (the segment model's mask becomes the
 *  selection) and Filter > Render > Relight with fal (the relight model's picture arrives as a layer). Built once;
 *  each opening sets the words and the model's options. */
export class FalTaskDialog extends Dialog {
  private task: Task = 'segment';
  private mode: SelectionMode = 'replace';
  private model: FalModel | null = null;
  private readonly prompt = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="true" aria-label="Prompt">');
  private readonly hint = el('<p class="cv-note"></p>');
  private readonly fal = new FalOptions();
  private readonly state = el('<p class="cv-note" role="status"></p>');
  private readonly go: HTMLButtonElement;
  private busy = false;

  constructor(private readonly engine: Engine) {
    super('Select Subject by Text', 420);
    this.body.append(this.hint, this.prompt, this.fal.el, this.state);
    this.prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); void this.run(); } });
    this.button('Cancel', 'ghost', () => this.close());
    this.go = this.button('Select', 'primary', () => void this.run());
  }

  async show(task: Task, mode: SelectionMode = 'replace'): Promise<void> {
    if (!this.engine.current) return;
    this.task = task;
    this.mode = mode;
    const w = WORDS[task];
    this.setTitle(w.title);
    setText(this.hint, w.hint);
    this.prompt.placeholder = w.placeholder;
    setText(this.go, w.go);
    setText(this.state, '');
    this.model = falModelsOf(await falCatalogue(), task)[0] ?? null;
    this.fal.show(this.model);
    setHidden(this.prompt, false);
    if (!this.model) setText(this.state, 'The fal catalogue is not available: start the formvis engine.');
    this.open();
    this.prompt.focus();
  }

  private async run(): Promise<void> {
    const e = this.engine, p = e.current, model = this.model, prompt = this.prompt.value.trim();
    if (this.busy || !p || !model) return;
    if (!prompt) { setText(this.state, this.task === 'segment' ? 'Name what to select first.' : 'Describe the light first.'); this.prompt.focus(); return; }
    const status = await api.generativeStatus();
    if (!status?.configured) { setText(this.state, 'Add a fal API key first, in Edit > Generative Fill.'); return; }
    const flat = this.task === 'segment' ? e.autoSelSource() : e.flattened();
    if (!flat) return;
    const W = p.doc.width, H = p.doc.height, inputs = { prompt, ...this.fal.values() }, task = this.task, mode = this.mode;
    this.busy = true;
    setText(this.state, 'Working on fal...');
    try {
      const { result, blob } = await falRunImage(model, inputs, await toBlob(flat));
      if (!this.isOpen) return;
      if (e.current !== p) { setText(this.state, 'The document changed, so the result was not placed.'); return; }
      if (task === 'segment') {
        const mask = result.masks?.[0] ? pngBlob(result.masks[0].png) : await alphaMask(blob);
        const bitmap = await createImageBitmap(mask), s = createSurface(W, H), c = ctxOf(s);
        c.drawImage(bitmap, 0, 0, W, H);
        bitmap.close();
        const px = c.getImageData(0, 0, W, H).data, data = new Uint8Array(W * H);
        for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
        if (!data.some((v) => v >= 128)) { setText(this.state, 'Nothing matching that was found.'); return; }
        e.applyAutoSelection(0, 0, W, H, data, 'Select Subject by Text', { mode });
      } else {
        const bitmap = await createImageBitmap(blob), r = new Raster(W, H);
        r.ctx.drawImage(bitmap, 0, 0, W, H);
        bitmap.close();
        r.touch();
        e.insertRasterLayer(r, 'Relight (fal)', 0, 0, {}, 'Relight with fal');
      }
      this.close();
    } catch (err) {
      setText(this.state, err instanceof Error ? err.message : 'The run failed.');
    } finally { this.busy = false; }
  }
}

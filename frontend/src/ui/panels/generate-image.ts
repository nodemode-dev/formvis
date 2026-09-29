import { Raster, type Engine } from '../../engine';
import { api, ApiError } from '../../io/api';
import { recipes, runToResults } from '../../io/comfy';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { loadPrefs } from '../prefs';
import { ReferencePicker } from './references';

/** Edit > Generate Image (1.51.2), as Photoshop's: a picture from a prompt alone, as a new layer at the document's size
 *  (a new 1024 by 1024 document when none is open), with FLUX1.1 [pro] on fal or a kept ComfyUI workflow. */
export class GenerateImageDialog extends Dialog {
  private readonly prompt = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="3" aria-label="Prompt" placeholder="Describe the image"></textarea>');
  private readonly model = el<HTMLSelectElement>('<select class="cv-input" aria-label="Model"></select>');
  private readonly status = el('<p class="cv-note cv-gen-status" role="status"></p>');
  private busy = false;
  private readonly refs: ReferencePicker;
  private stopped = false;

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Generate Image', 420);
    const row = el('<label class="cv-dialog-row"><span>Model</span></label>');
    row.append(this.model);
    this.refs = new ReferencePicker(engine);
    this.model.addEventListener('change', () => this.refs.forFal(this.model.value === 'fal'));
    this.body.append(this.prompt, row, this.refs.el, this.status);
    this.button('Cancel', 'ghost', () => { this.stopped = true; this.close(); });
    this.button('Generate', 'primary', () => void this.generate());
  }

  async show(): Promise<void> {
    const was = this.model.value;
    this.model.replaceChildren(el('<option value="fal">FLUX1.1 [pro] (fal)</option>'), ...recipes().map((r) => { const o = document.createElement('option'); o.value = r.name; o.textContent = `${r.name} (ComfyUI)`; return o; }));
    if ([...this.model.options].some((o) => o.value === was)) this.model.value = was;
    this.refs.refresh(this.model.value === 'fal');
    setText(this.status, 'Your ComfyUI workflows are added in Edit > Generative Fill.');
    this.stopped = false;
    this.open();
    this.prompt.focus();
  }

  private async generate(): Promise<void> {
    const prompt = this.prompt.value.trim();
    if (this.busy) return;
    if (!prompt) { setText(this.status, 'Describe the image to generate.'); return; }
    if (!this.engine.current) this.engine.newDocument(1024, 1024, 'Generated', 'white');
    const p = this.engine.current;
    if (!p) return;
    const W = p.doc.width, H = p.doc.height, choice = this.model.value;
    this.busy = true;
    this.stopped = false;
    try {
      let blob: Blob;
      if (choice === 'fal') {
        const st = await api.generativeStatus();
        if (!st) throw new Error('The formvis engine is offline. Start it with ./formvis boot.');
        if (!st.configured) throw new Error('Add a fal API key first, in Edit > Generative Fill.');
        setText(this.status, 'Generating on fal...');
        blob = await api.generateImage(prompt, W, H);
      } else {
        const recipe = recipes().find((r) => r.name === choice);
        if (!recipe) throw new Error('That workflow is no longer kept: add it again in Edit > Generative Fill.');
        setText(this.status, 'Sending to ComfyUI...');
        const refs = await this.refs.chosen();
        blob = (await runToResults(loadPrefs().comfyuiUrl, recipe.json, refs.map((r) => ({ name: r.name, kind: 'reference' })), refs.map((r, i) => ({ name: `ref${i}.png`, blob: r.blob })), prompt, (t) => setText(this.status, t), () => this.stopped))[0];
      }
      if (this.stopped || this.engine.current !== p) return;
      const bitmap = await createImageBitmap(blob), r = new Raster(W, H);
      r.ctx.drawImage(bitmap, 0, 0, W, H);   // scaled to the document
      bitmap.close();
      r.touch();
      this.engine.insertRasterLayer(r, 'Generated Image', 0, 0, {}, 'Generate Image');
      this.close();
      this.toast('The generated image was added as a layer.');
    } catch (err) {
      if (!this.stopped) setText(this.status, err instanceof ApiError || err instanceof Error ? err.message : 'Generating failed.');
    } finally { this.busy = false; }
  }
}

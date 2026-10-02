import { Raster, type Engine } from '../../engine';
import { api, ApiError, type ProviderStatus } from '../../io/api';
import { recipes, runToResults } from '../../io/comfy';
import { localModels, runLocal } from '../../io/local-gen';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { loadPrefs } from '../prefs';
import { ReferencePicker } from './references';
import { PromptImprover } from './prompt-improver';

/** Edit > Generate Image (1.51.2), as Photoshop's: a picture from a prompt alone, as a new layer at the document's size
 *  (a new 1024 by 1024 document when none is open), with FLUX1.1 [pro] on fal, OpenAI, Google, Black Forest Labs or
 *  Ideogram with their own keys (1.58.4), a kept ComfyUI workflow, or a model on this computer. */
export class GenerateImageDialog extends Dialog {
  private readonly prompt = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="3" aria-label="Prompt" placeholder="Describe the image"></textarea>');
  private readonly model = el<HTMLSelectElement>('<select class="cv-input" aria-label="Model"></select>');
  private readonly status = el('<p class="cv-note cv-gen-status" role="status"></p>');
  private busy = false;
  private readonly refs: ReferencePicker;
  private readonly improver: PromptImprover;
  private stopped = false;
  // The providers beside fal (1.58.4, L7): which have keys, and a key field shown when the chosen one has none.
  private providers: ProviderStatus[] = [];
  private readonly keyInput = el<HTMLInputElement>('<input class="cv-input" type="password" autocomplete="off" aria-label="API key">');
  private readonly keyRow = el('<div class="cv-dialog-row" hidden><span class="cv-gen-keylabel">API key</span></div>');
  private readonly keyButton = el<HTMLButtonElement>('<button class="cv-btn" type="button">Save key</button>');
  private changing = false;   // a kept key being replaced

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Generate Image', 420);
    const row = el('<label class="cv-dialog-row"><span>Model</span></label>');
    row.append(this.model);
    this.refs = new ReferencePicker(engine);
    this.model.addEventListener('change', () => { this.refs.forFal(this.model.value === 'fal'); this.keyFor(); });
    this.improver = new PromptImprover(this.prompt, 'Richer detail');
    this.keyButton.addEventListener('click', () => {
      const pr = this.chosenProvider();
      if (pr?.configured && !this.changing) { this.changing = true; this.keyFor(); this.keyInput.focus(); } else void this.saveKey();
    });
    this.keyRow.append(this.keyInput, this.keyButton);
    this.body.append(this.prompt, this.improver.el, row, this.keyRow, this.refs.el, this.status);
    this.button('Cancel', 'ghost', () => { this.stopped = true; this.close(); });
    this.button('Generate', 'primary', () => void this.generate());
  }

  async show(): Promise<void> {
    const was = this.model.value;
    const locals = await localModels();   // the local models (1.52.9)
    this.providers = await api.providers();
    const named: Record<string, string> = { openai: 'GPT Image', google: 'Gemini image', bfl: 'FLUX1.1 [pro]', ideogram: 'Ideogram 3.0' };
    this.model.replaceChildren(el('<option value="fal">FLUX1.1 [pro] (fal)</option>'),
      ...this.providers.map((pr) => { const o = document.createElement('option'); o.value = `provider:${pr.id}`; o.textContent = `${named[pr.id] ?? pr.model} (${pr.name})`; return o; }),
      ...recipes().map((r) => { const o = document.createElement('option'); o.value = r.name; o.textContent = `${r.name} (ComfyUI)`; return o; }),
      ...locals.map((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.label.replace(/ \(local\)$/, '')} (this computer)`; o.disabled = !m.ready; if (!m.ready && m.reason) o.title = m.reason; return o; }));
    if ([...this.model.options].some((o) => o.value === was)) this.model.value = was;
    this.refs.refresh(this.model.value === 'fal');
    this.keyFor();
    this.improver.refresh();
    setText(this.status, 'Your ComfyUI workflows are added in Edit > Generative Fill.');
    this.stopped = false;
    this.open();
    this.prompt.focus();
  }

  /** The chosen provider, when the model chosen is one of the providers beside fal. */
  private chosenProvider(): ProviderStatus | null { const v = this.model.value; return v.startsWith('provider:') ? this.providers.find((pr) => `provider:${pr.id}` === v) ?? null : null; }

  /** The key row shows whenever a provider is chosen, at one height (so saving a key moves nothing): a field and Save
   *  key when it has none, or "kept in your password store" and Change when it has. The key goes to the password store. */
  private keyFor(): void {
    // The row keeps its space for every model and only shows for a provider, and its label stays put (the provider is
    // named in the field), so choosing a model or saving a key moves nothing in the dialog.
    const pr = this.chosenProvider();
    this.keyRow.hidden = false;
    this.keyRow.style.visibility = pr ? 'visible' : 'hidden';
    if (!pr) { this.changing = false; return; }
    const kept = pr.configured && !this.changing;
    this.keyInput.disabled = kept;
    this.keyInput.placeholder = kept ? `${pr.name}: kept in your password store` : `Paste your ${pr.name} key`;
    setText(this.keyButton, kept ? 'Change' : 'Save key');
  }

  private async saveKey(): Promise<void> {
    const pr = this.chosenProvider(), key = this.keyInput.value.trim();
    if (!pr || !key) return;
    try {
      this.providers = await api.saveProviderKey(pr.id, key);
      this.keyInput.value = '';
      this.changing = false;
      this.keyFor();
      setText(this.status, `The ${pr.name} key is kept in your system's password store.`);
    } catch (err) { setText(this.status, err instanceof Error ? err.message : 'The key could not be saved.'); }
  }

  /** A local model's notice (Krea 2's licence) and the filter's warning, shown with its picture. */
  heard: (r: { notice?: string; warning?: string; notes: string[] }) => void = () => {};

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
      if (choice.startsWith('local:')) {
        // On this computer: the document's shape within the model's 2048 pixels, in multiples of 16.
        const k = Math.min(1, 2048 / Math.max(W, H)), w = Math.max(256, Math.round((W * k) / 16) * 16), h = Math.max(256, Math.round((H * k) / 16) * 16);
        const r = await runLocal({ generator: choice, prompt, size: `${w}x${h}`, count: 1 }, (t) => setText(this.status, t), () => this.stopped);
        this.heard(r);
        blob = r.pictures[0];
      } else if (choice.startsWith('provider:')) {
        const pr = this.chosenProvider();
        if (!pr) throw new Error('That provider is not available.');
        if (!pr.configured) throw new Error(`Add a ${pr.name} API key first, above.`);
        setText(this.status, `Generating with ${pr.name}...`);
        blob = await api.generateImage(prompt, W, H, pr.id);
      } else if (choice === 'fal') {
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

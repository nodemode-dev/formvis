import type { Engine } from '../../engine';
import { api, type GenerativeStatus } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';
import { addRecipe, comfyGenerator, recipes, removeRecipe } from '../../io/comfy';
import { loadPrefs } from '../prefs';

type Mode = 'fill' | 'expand' | 'upscale';

const TITLES: Record<Mode, string> = { fill: 'Generative Fill', expand: 'Generative Expand', upscale: 'Upscale' };
const HINTS: Record<Mode, string> = {
  fill: 'The result arrives as a new layer masked to the selection. fal charges about $0.05 per megapixel of the area sent.',
  expand: 'The canvas grows by these margins and the new border is filled as a layer masked to it; leave the prompt empty to extend the scene. fal charges about $0.05 per megapixel.',
  upscale: 'Real-ESRGAN on fal enlarges what the document shows and opens it as a new document, for a fraction of a cent per image.',
};

/** Generative Fill, Generative Expand and Upscale, sent by the formvis engine to fal: FLUX.1 Fill [pro] with a
 *  prompt, FLUX.1 Erase [pro] without one, Real-ESRGAN to upscale. Until a key is saved the dialog asks for one; the
 *  engine keeps it in its data folder and never hands it back to the page. */
export class GenerativeDialog extends Dialog {
  private mode: Mode = 'fill';
  private scale = 2;
  private readonly prompt = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="true">');
  private readonly margin = { left: this.number(), top: this.number(), right: this.number(), bottom: this.number() };
  private readonly marginRows: HTMLElement;
  private readonly hint = el('<p class="cv-note"></p>');
  private readonly keyRow = el('<div class="cv-panel-section"></div>');
  private readonly key = el<HTMLInputElement>('<input class="cv-input" type="password" autocomplete="off" spellcheck="false" placeholder="fal API key">');
  private readonly state = el('<p class="cv-note"></p>');
  private readonly forget: HTMLButtonElement;
  private status: GenerativeStatus | null = null;
  // The model (1.51.2): FLUX.1 Fill on fal, or one of your ComfyUI workflows, added here and kept.
  private readonly model = el<HTMLSelectElement>('<select class="cv-input" aria-label="Model"></select>');
  private readonly modelRow = el('<label class="cv-dialog-row"><span>Model</span></label>');
  private readonly addFile = el<HTMLInputElement>('<input type="file" accept=".json,application/json" aria-label="Add ComfyUI workflow" hidden>');

  constructor(private readonly engine: Engine) {
    super('Generative Fill', 440);
    const add = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Add a workflow saved from ComfyUI with Export (API)">Add workflow...</button>');
    const remove = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Remove</button>');
    add.addEventListener('click', () => this.addFile.click());
    this.addFile.addEventListener('change', () => void this.addWorkflow());
    remove.addEventListener('click', () => { const v = this.model.value; if (v.startsWith('comfy:')) { removeRecipe(v.slice(6)); this.fillModels(); this.sync(); } });
    this.model.addEventListener('change', () => this.sync());
    this.modelRow.append(this.model, add, remove, this.addFile);
    this.body.appendChild(this.modelRow);
    this.body.appendChild(this.prompt);
    this.marginRows = el('<div class="cv-panel-section"></div>');
    this.body.appendChild(this.marginRows);
    for (const [label, input] of [['Left (px)', this.margin.left], ['Top (px)', this.margin.top], ['Right (px)', this.margin.right], ['Bottom (px)', this.margin.bottom]] as const) {
      const row = el('<label class="cv-field"><span></span></label>');
      setText(row.firstElementChild as HTMLElement, label);
      row.appendChild(input);
      this.marginRows.appendChild(row);
    }
    this.body.appendChild(this.hint);
    this.keyRow.append(this.key, el('<p class="cv-note">Get a key at fal.ai. The formvis engine keeps it in its data folder on this computer.</p>'));
    this.body.appendChild(this.keyRow);
    this.body.appendChild(this.state);
    this.forget = this.button('Forget key', 'ghost', () => void this.forgetKey());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Generate', 'primary', () => void this.generate());
  }

  private number(): HTMLInputElement {
    return el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="30000" step="1" value="0">');
  }

  /** Opens the dialog for Generative Fill, Generative Expand or Upscale (`scale` 2 or 4). */
  async show(mode: Mode = 'fill', scale = 2): Promise<void> {
    this.mode = mode;
    this.scale = scale;
    this.setTitle(mode === 'upscale' ? `Upscale ${scale}x` : TITLES[mode]);
    this.prompt.placeholder = mode === 'expand' ? 'Describe the surroundings, or leave empty to extend the scene' : 'Describe what to add, or leave empty to remove';
    setHidden(this.prompt, mode === 'upscale');
    setHidden(this.marginRows, mode !== 'expand');
    setText(this.hint, HINTS[mode]);
    setHidden(this.modelRow, mode === 'upscale');   // Upscale stays Real-ESRGAN on fal
    this.fillModels();
    this.status = await api.generativeStatus();
    this.sync();
    this.open();
    if (mode !== 'upscale') { this.prompt.focus(); this.prompt.select(); }
  }

  /** FLUX.1 Fill on fal, then the kept ComfyUI workflows; the choice kept when it still exists. */
  private fillModels(): void {
    const was = this.model.value;
    this.model.replaceChildren(el('<option value="fal">FLUX.1 Fill (fal)</option>'), ...recipes().map((r) => { const o = document.createElement('option'); o.value = `comfy:${r.name}`; o.textContent = `${r.name} (ComfyUI)`; return o; }));
    if ([...this.model.options].some((o) => o.value === was)) this.model.value = was;
  }

  private async addWorkflow(): Promise<void> {
    const f = this.addFile.files?.[0];
    this.addFile.value = '';
    if (!f) return;
    const problem = addRecipe(f.name.replace(/\.json$/i, ''), await f.text());
    if (problem) { setText(this.state, problem); return; }
    this.fillModels();
    this.model.value = `comfy:${f.name.replace(/\.json$/i, '')}`;
    this.sync();
  }

  private get comfy(): boolean { return this.mode !== 'upscale' && this.model.value.startsWith('comfy:'); }

  private sync(): void {
    const s = this.status;
    if (this.comfy) {   // a workflow needs no fal key
      setHidden(this.keyRow, true); setHidden(this.forget, true);
      setText(this.state, `Runs on ComfyUI at ${loadPrefs().comfyuiUrl}: its first Load Image takes the area, Load Image (as Mask) the mask, and a text node titled formvis prompt the prompt.`);
      return;
    }
    setHidden(this.keyRow, !s || s.configured);
    setHidden(this.forget, s?.source !== 'settings');
    setText(this.state, !s ? 'The formvis engine is offline. Start it with ./formvis boot.'
      : s.configured ? `fal key set ${s.source === 'environment' ? 'by FAL_KEY in the environment' : 'in formvis'}.` : 'Add a fal API key to generate.');
  }

  private async forgetKey(): Promise<void> {
    try { this.status = await api.forgetGenerativeKey(); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'The key could not be removed.'); return; }
    this.sync();
  }

  private async generate(): Promise<void> {
    if (this.comfy) {
      const recipe = recipes().find((r) => `comfy:${r.name}` === this.model.value);
      if (!recipe) { setText(this.state, 'That workflow is no longer kept: add it again.'); return; }
      const prompt = this.prompt.value, mode = this.mode, e = this.engine, target = loadPrefs().comfyuiUrl;
      const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
      this.close();
      const fill = comfyGenerator(target, recipe, prompt);
      if (mode === 'expand') await e.task(() => e.generativeExpand(margins, prompt, fill));
      else await e.task(() => e.generativeFill(prompt, fill));
      return;
    }
    if (!this.status) return;
    if (!this.status.configured) {
      const key = this.key.value.trim();
      if (!key) { setText(this.state, 'Paste a fal API key first.'); this.key.focus(); return; }
      try { this.status = await api.saveGenerativeKey(key); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'The key could not be saved.'); return; }
      this.key.value = '';
      this.sync();
    }
    const prompt = this.prompt.value, mode = this.mode, scale = this.scale, e = this.engine;
    const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
    this.close();
    const fill = (image: Blob, mask: Blob): Promise<Blob> => api.generativeFill(image, mask, prompt);
    if (mode === 'upscale') await e.task(() => e.upscaleToDocument(scale, (image) => api.upscale(image, scale)));
    else if (mode === 'expand') await e.task(() => e.generativeExpand(margins, prompt, fill));
    else await e.task(() => e.generativeFill(prompt, fill));
  }
}

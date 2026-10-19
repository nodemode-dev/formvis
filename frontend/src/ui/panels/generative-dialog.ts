import type { Engine } from '../../engine';
import { api, type GenerativeStatus, type ProviderStatus } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';
import { addRecipe, apiWorkflow, comfyGenerator, recipes, removeRecipe } from '../../io/comfy';
import { localFill, localInpaint, localModels, localUpscale, modelReady, upscalerReady, type LocalModel } from '../../io/local-gen';
import { loadPrefs } from '../prefs';
import { ReferencePicker } from './references';
import { ReferenceChips } from './reference-chips';
import { CropStitchSettings } from './crop-stitch-settings';
import { withCropStitch } from '../../io/crop-stitch-run';
import { resolveReferenceTokens } from './generate-image';
import { PromptImprover } from './prompt-improver';

type Mode = 'fill' | 'expand' | 'upscale';

const TITLES: Record<Mode, string> = { fill: 'Generative Fill', expand: 'Generative Expand', upscale: 'Upscale' };
const HINTS: Record<Mode, string> = {
  fill: 'The result arrives as a new layer masked to the selection. fal charges about $0.05 per megapixel of the area sent.',
  expand: 'The canvas grows by these margins and the new border is filled as a layer masked to it; leave the prompt empty to extend the scene. fal charges about $0.05 per megapixel.',
  upscale: 'Real-ESRGAN enlarges what the document shows and opens it as a new document: on this computer once its model is downloaded, or on fal for a fraction of a cent per image.',
};

/** Generative Fill, Generative Expand and Upscale, sent by the formvis engine to fal: FLUX.1 Fill [pro] with a
 *  prompt, FLUX.1 Erase [pro] without one, Real-ESRGAN to upscale. Until a key is saved the dialog asks for one; the
 *  engine keeps it in its data folder and never hands it back to the page. */
export class GenerativeDialog extends Dialog {
  private mode: Mode = 'fill';
  private scale = 2;
  private readonly prompt = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="true">');
  private readonly margin = { left: this.number('Left'), top: this.number('Top'), right: this.number('Right'), bottom: this.number('Bottom') };   // named (1.53.2)
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
  private readonly refs: ReferencePicker;
  private chips!: ReferenceChips;
  private readonly crop = new CropStitchSettings();
  private locals: LocalModel[] = [];
  private lama = false;
  private picked = false;   // the person chose the model (1.58.5); until then the default is fal with a key, else local
  private readonly influence = el<HTMLInputElement>('<input type="range" min="0" max="100" step="1" value="40" aria-label="Influence">');
  private readonly influenceRow = el('<label class="cv-dialog-row" title="How much the area under the selection shapes the result (0: none)"><span>Influence</span></label>');
  private readonly improver: PromptImprover;
  private readonly addFile = el<HTMLInputElement>('<input type="file" accept=".json,application/json" aria-label="Add ComfyUI workflow" hidden>');

  constructor(private readonly engine: Engine) {
    super('Generative Fill', 440);
    const add = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" title="Add a workflow saved from ComfyUI with Export (API)">Add workflow...</button>');
    const remove = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Remove</button>');
    add.addEventListener('click', () => this.addFile.click());
    this.addFile.addEventListener('change', () => void this.addWorkflow());
    remove.addEventListener('click', () => { const v = this.model.value; if (v.startsWith('comfy:')) { removeRecipe(v.slice(6)); this.fillModels(); this.sync(); } });
    this.model.addEventListener('change', () => { this.picked = true; this.sync(); });
    this.modelRow.append(this.model, add, remove, this.addFile);
    this.body.appendChild(this.modelRow);
    this.influenceRow.append(this.influence);
    this.influence.addEventListener('input', () => { this.influence.dataset.set = '1'; });
    this.body.appendChild(this.influenceRow);
    this.refs = new ReferencePicker(engine);
    this.body.appendChild(this.refs.el);
    this.body.appendChild(this.prompt);
    this.chips = new ReferenceChips(this.refs, this.prompt);
    this.body.appendChild(this.chips.el);
    this.improver = new PromptImprover(this.prompt, 'Fill a selection');
    this.body.appendChild(this.improver.el);
    this.body.appendChild(this.crop.el);
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
    this.remember();   // the model, influence and expand margins, each mode under its own title
  }

  private number(label: string): HTMLInputElement {
    const i = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="30000" step="1" value="0">');
    i.setAttribute('aria-label', `${label} margin`);
    return i;
  }

  /** Whether the model now chosen can run without asking the person for anything (a key, a download). */
  private get runnable(): boolean { return this.lamaHere || this.upscaleHere || !!this.local || !!this.provider || this.comfy || !!this.status?.configured; }

  /** Opens the dialog for Generative Fill, Generative Expand or Upscale (`scale` 2 or 4). With `start` (the Contextual
   *  Task Bar's Generate) the prompt is filled in and, when the chosen model needs nothing more from the person, the
   *  run begins at once without the dialog showing; otherwise the dialog opens with the prompt in place and says what is missing. */
  async show(mode: Mode = 'fill', scale = 2, start?: { prompt: string }): Promise<void> {
    this.mode = mode;
    this.scale = scale;
    this.setTitle(mode === 'upscale' ? `Upscale ${scale}x` : TITLES[mode]);
    this.prompt.placeholder = mode === 'expand' ? 'Describe the surroundings, or leave empty to extend the scene' : 'Describe what to add, or leave empty to remove';
    setHidden(this.prompt, mode === 'upscale');
    setHidden(this.marginRows, mode !== 'expand');
    setText(this.hint, HINTS[mode]);
    // Upscale: Real-ESRGAN on fal or on this computer (1.53.1); the fill models otherwise.
    for (const b of this.modelRow.querySelectorAll('button')) setHidden(b as HTMLElement, mode === 'upscale');
    this.status = await api.generativeStatus();   // first, so the default knows whether fal has a key (1.58.5)
    if (mode === 'upscale') this.upscaleModels(await upscalerReady());
    else { this.locals = (await localModels()).filter((m) => m.fromPicture); this.lama = await modelReady('lama-inpaint'); this.providers = (await api.providers()).filter((p) => p.fill); this.fillModels(); }   // local models (1.52.9), LaMa (1.53.2)
    this.refs.refresh(!this.model.value.startsWith('comfy:'));
    setHidden(this.refs.el, mode === 'upscale');
    setHidden(this.chips.el, mode === 'upscale');
    setHidden(this.crop.el, mode === 'upscale');
    this.crop.load();
    setHidden(this.improver.el, mode === 'upscale');
    this.improver.refresh();
    if (start && mode !== 'upscale') this.improver.history.set(start.prompt);
    this.sync();
    if (start && this.runnable) { await this.generate(); return; }
    this.open();
    if (mode !== 'upscale') { this.prompt.focus(); if (!start) this.prompt.select(); }
  }

  /** Upscale's choices: Real-ESRGAN on fal, or on this computer once its model is downloaded. */
  private upscaleModels(ready: boolean): void {
    const here = el<HTMLOptionElement>('<option value="local:ai-upscale">Real-ESRGAN (this computer)</option>');
    here.disabled = !ready;
    if (!ready) here.title = 'Download it in Preferences > Plugins > Local models';
    const was = this.model.value;
    this.model.replaceChildren(el('<option value="fal">Real-ESRGAN (fal)</option>'), here);
    // The person's choice while it stands; else fal when it has a key, this computer when not (1.58.5).
    this.model.value = this.picked && (was === 'fal' || (was === 'local:ai-upscale' && ready)) ? was : this.status?.configured ? 'fal' : ready ? 'local:ai-upscale' : 'fal';
  }

  /** FLUX.1 Fill on fal, then the kept ComfyUI workflows and this computer's models; the person's choice kept while it
   *  exists, else fal when it has a key, else a model on this computer (1.58.5). */
  private fillModels(): void {
    const was = this.model.value;
    this.model.replaceChildren(el('<option value="fal">FLUX.1 Fill (fal)</option>'),
      ...this.providers.map((p) => { const o = document.createElement('option'); o.value = `provider:${p.id}`; o.textContent = `${p.model} (${p.name})`; o.disabled = !p.configured; if (!p.configured) o.title = 'Add its key in Edit > Generate Image'; return o; }),
      ...recipes().map((r) => { const o = document.createElement('option'); o.value = `comfy:${r.name}`; o.textContent = `${r.name} (ComfyUI)`; return o; }),
      ...this.locals.map((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.label.replace(/ \(local\)$/, '')} (this computer)`; o.disabled = !m.ready; if (!m.ready && m.reason) o.title = m.reason; return o; }));
    // LaMa (1.53.2): inpainting on any computer's CPU, no prompt; chosen when fal has no key.
    const lama = el<HTMLOptionElement>('<option value="local:lama">LaMa, no prompt (this computer)</option>');
    lama.disabled = !this.lama; if (!this.lama) lama.title = 'Download it in Preferences > Plugins > Local models';
    this.model.append(lama);
    // The person's choice while it stands; else fal when it has a key; else this computer: a ready fill model, then
    // LaMa; else fal, whose key the dialog then asks for (1.58.5).
    const local = this.locals.find((m) => m.ready)?.id ?? (this.lama ? 'local:lama' : null);
    if (this.picked && [...this.model.options].some((o) => o.value === was && !o.disabled)) this.model.value = was;
    else this.model.value = this.status?.configured ? 'fal' : local ?? 'fal';
  }

  private async addWorkflow(): Promise<void> {
    const f = this.addFile.files?.[0];
    this.addFile.value = '';
    if (!f) return;
    let text = await f.text();
    try { text = await apiWorkflow(text, loadPrefs().comfyuiUrl, f.name); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'That workflow could not be converted.'); return; }
    const problem = addRecipe(f.name.replace(/\.json$/i, ''), text);
    if (problem) { setText(this.state, problem); return; }
    this.fillModels();
    this.model.value = `comfy:${f.name.replace(/\.json$/i, '')}`;
    this.picked = true;   // adding it was the person's choice (1.58.5)
    this.sync();
  }

  /** A local model's notice (Krea 2's licence) and the filter's warning, shown with its picture. */
  heard: (r: { notice?: string; warning?: string; notes: string[] }) => void = () => {};

  private get comfy(): boolean { return this.mode !== 'upscale' && this.model.value.startsWith('comfy:'); }
  /** The providers beside fal whose fill the engine runs (36.12), and the one chosen, if any. */
  private providers: ProviderStatus[] = [];
  private get provider(): ProviderStatus | undefined { return this.mode !== 'upscale' ? this.providers.find((p) => `provider:${p.id}` === this.model.value) : undefined; }
  private get lamaHere(): boolean { return this.mode !== 'upscale' && this.model.value === 'local:lama'; }
  private get upscaleHere(): boolean { return this.mode === 'upscale' && this.model.value === 'local:ai-upscale'; }
  private get local(): LocalModel | undefined { return this.mode !== 'upscale' ? this.locals.find((m) => m.id === this.model.value) : undefined; }

  private sync(): void {
    const s = this.status, local = this.local;
    this.refs.forFal(!this.comfy);
    setHidden(this.influenceRow, !local);
    if (this.lamaHere) {
      setHidden(this.keyRow, true); setHidden(this.forget, true); setHidden(this.refs.el, true); setHidden(this.influenceRow, true);
      setText(this.state, 'LaMa runs on this computer, on any machine: no key, no cost. It fills from what surrounds the selection and takes no prompt; the result is masked to the selection.');
      return;
    }
    if (this.upscaleHere) {
      setHidden(this.keyRow, true); setHidden(this.forget, true);
      setText(this.state, `Real-ESRGAN runs on this computer: no key, no cost. It enlarges what the document shows ${this.scale} times and opens it as a new document.`);
      return;
    }
    if (local) {   // a local model: no key, no references; the picture under the selection at the influence set
      if (!this.influence.dataset.set) this.influence.value = String(Math.round(local.influence * 100));
      setHidden(this.keyRow, true); setHidden(this.forget, true); setHidden(this.refs.el, true);
      setText(this.state, `${local.label.replace(/ \(local\)$/, '')} runs on this computer: no key, no cost. It starts from what the selection covers, at the influence set, and the result is masked to the selection.`);
      return;
    }
    setHidden(this.refs.el, this.mode === 'upscale');
    const pr = this.provider;
    if (pr) {   // another provider (36.12): its own key, kept by the engine
      setHidden(this.keyRow, true); setHidden(this.forget, true); setHidden(this.refs.el, true);
      setText(this.state, `${pr.model} through ${pr.name}, key set ${pr.source === 'environment' ? 'in the environment' : 'in formvis'}. The result arrives as a new layer masked to the selection; ${pr.name} charges for each request.`);
      return;
    }
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
    if (this.lamaHere) {
      const e = this.engine, mode = this.mode, prompt = this.prompt.value;
      const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
      this.close();
      if (mode === 'expand') await e.task(() => e.generativeExpand(margins, prompt, localInpaint()));
      else await e.task(() => e.generativeFill(prompt, localInpaint()));
      return;
    }
    if (this.upscaleHere) {
      const e = this.engine, scale = this.scale;
      this.close();
      await e.task(() => e.upscaleToDocument(scale, localUpscale(scale)));
      return;
    }
    const local = this.local;
    if (local) {
      const prompt = this.prompt.value, mode = this.mode, e = this.engine, influence = Number(this.influence.value) / 100;
      const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
      this.close();
      const fill = localFill(local.id, prompt, influence, (r) => this.heard(r));
      if (mode === 'expand') await e.task(() => e.generativeExpand(margins, prompt, fill));
      else await e.task(() => e.generativeFill(prompt, fill));
      return;
    }
    if (this.comfy) {
      const recipe = recipes().find((r) => `comfy:${r.name}` === this.model.value);
      if (!recipe) { setText(this.state, 'That workflow is no longer kept: add it again.'); return; }
      const prompt = this.prompt.value, mode = this.mode, e = this.engine, target = loadPrefs().comfyuiUrl;
      const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
      const refs = await this.chips.ordered();
      let said: string;
      try { said = resolveReferenceTokens(prompt, refs.length); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'A reference token could not be read.'); return; }
      this.close();
      const fill = withCropStitch(comfyGenerator(target, recipe, said, refs));
      if (mode === 'expand') await e.task(() => e.generativeExpand(margins, prompt, fill));
      else await e.task(() => e.generativeFill(prompt, fill));
      return;
    }
    const pr = this.provider;
    if (pr) {   // another provider's fill (36.12)
      const prompt = this.prompt.value, mode = this.mode, e = this.engine, id = pr.id;
      const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
      this.close();
      const fill = withCropStitch((image: Blob, mask: Blob): Promise<Blob> => api.generativeFill(image, mask, prompt, id));
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
    const fill = withCropStitch((image: Blob, mask: Blob): Promise<Blob> => api.generativeFill(image, mask, prompt));
    if (mode === 'upscale') await e.task(() => e.upscaleToDocument(scale, (image) => api.upscale(image, scale)));
    else if (mode === 'expand') await e.task(() => e.generativeExpand(margins, prompt, fill));
    else await e.task(() => e.generativeFill(prompt, fill));
  }
}

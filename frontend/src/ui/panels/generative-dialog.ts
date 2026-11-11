import type { Engine } from '../../engine';
import { api, type GenerativeStatus } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';
import { addRecipe, apiWorkflow, checkReferenceCount, comfyGenerator, comfyUpscale, recipes, removeRecipe } from '../../io/comfy';
import { localFill, localInpaint, localModels, localUpscale, modelReady, upscaleFiles, upscalerReady, type LocalModel } from '../../io/local-gen';
import { loadPrefs, recalled } from '../prefs';
import { ReferencePicker } from './references';
import { ReferenceChips } from './reference-chips';
import { CropStitchSettings } from './crop-stitch-settings';
import { withCropStitch } from '../../io/crop-stitch-run';
import { generatePrompt } from '../../io/prompt-templates';
import { cappedFill, cappedUpscale, comfyReadiness, resolveReferenceTokens, stoppable, stoppableFill } from './generate-image';
import { PromptImprover, areaView, referenceViews } from './prompt-improver';
import { GenerationOptions } from './generation-options';
import { FalOptions } from './fal-options';
import { genPrefs, preferredModel } from '../../io/gen-prefs';
import { canvasInputs, pictureLimit, prepareForModel } from '../../io/fal-size';
import { editInstruction, falCatalogue, falIdOf, falMaskAsPicture, falMaskKey, falModelsOf, falRunImage, falValue } from '../../io/fal';
import type { FalModel } from '../../io/api';

type Mode = 'fill' | 'expand' | 'upscale';

const TITLES: Record<Mode, string> = { fill: 'Generative Fill', expand: 'Generative Expand', upscale: 'Upscale' };
const HINTS: Record<Mode, string> = {
  fill: 'The result arrives as a new layer masked to the selection. fal charges about $0.05 per megapixel of the area sent.',
  expand: 'The canvas grows by these margins and the new border is filled as a layer masked to it; leave the prompt empty to extend the scene. fal charges about $0.05 per megapixel.',
  upscale: 'Real-ESRGAN enlarges what the document shows, as a new document, in this document or (the selection) as a layer: on this computer once its model is downloaded, or on fal for a fraction of a cent per image.',
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
  private problems = new Map<string, string>();   // kept workflows ComfyUI cannot run now, with the reason
  private lama = false;
  private picked = false;   // the person chose the model (1.58.5); until then the default is fal with a key, else local
  private readonly influence = el<HTMLInputElement>('<input type="range" min="0" max="100" step="1" value="40" aria-label="Influence">');
  private readonly influenceRow = el('<label class="cv-dialog-row" title="How much the area under the selection shapes the result (0: none)"><span>Influence</span></label>');
  private readonly refine = el<HTMLInputElement>('<input type="checkbox" aria-label="Refine">');
  private readonly refineRow = el('<label class="cv-check" title="Run the selection through the model again without a new fill: the influence goes to 85 and an empty prompt asks for the same picture, polished"><span>Refine what the selection covers</span></label>');
  private readonly improver: PromptImprover;
  private readonly opts = new GenerationOptions();
  private readonly scope = el<HTMLSelectElement>('<select class="cv-input" aria-label="Upscale scope"><option value="new">Whole picture, as a new document</option><option value="here">Whole picture, in this document</option><option value="selection">The selection, as a layer</option></select>');
  private readonly scopeRow = el('<label class="cv-dialog-row"><span>Scope</span></label>');
  private readonly addFile = el<HTMLInputElement>('<input type="file" accept=".json,application/json" aria-label="Add ComfyUI workflow" hidden>');
  private readonly comfyGroup = el<HTMLOptGroupElement>('<optgroup label="ComfyUI upscaler"></optgroup>');
  private comfyListed = '';
  private readonly fal = new FalOptions();
  private readonly falGroup = el<HTMLOptGroupElement>('<optgroup label="fal models"></optgroup>');
  private catalogue: FalModel[] = [];

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
    this.body.appendChild(this.fal.el);
    this.scopeRow.append(this.scope);
    this.body.appendChild(this.scopeRow);
    this.influenceRow.append(this.influence);
    this.influence.addEventListener('input', () => { this.influence.dataset.set = '1'; });
    this.body.appendChild(this.influenceRow);
    this.refine.addEventListener('change', () => { if (this.refine.checked && Number(this.influence.value) < 85) { this.influence.value = '85'; this.influence.dataset.set = '1'; } });
    this.refineRow.prepend(this.refine);
    this.body.appendChild(this.refineRow);
    this.refs = new ReferencePicker(engine);
    this.body.appendChild(this.refs.el);
    this.body.appendChild(this.prompt);
    this.chips = new ReferenceChips(this.refs, this.prompt);
    this.body.appendChild(this.chips.el);
    this.improver = new PromptImprover(this.prompt, 'Fill a selection');
    this.improver.view = areaView(engine, true);
    this.improver.mode = () => (this.mode === 'fill' ? '' : this.mode);
    this.improver.refs = referenceViews(() => this.chips.ordered());
    this.body.appendChild(this.improver.el);
    this.body.appendChild(this.opts.el);
    this.prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.defaultPrevented) { e.preventDefault(); void this.generate(); } });
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
    this.go = this.button('Generate', 'primary', () => void this.generate());
    this.onClose = () => this.release();
    this.remember();   // the model, influence and expand margins, each mode under its own title
  }

  private number(label: string): HTMLInputElement {
    const i = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="30000" step="1" value="0">');
    i.setAttribute('aria-label', `${label} margin`);
    return i;
  }

  /** Whether the model now chosen can run without asking the person for anything (a key, a download). */
  private get runnable(): boolean { return this.lamaHere || this.upscaleHere || this.comfyUpscaleHere || !!this.local || this.comfy || !!this.status?.configured; }

  /** Opens the dialog for Generative Fill, Generative Expand or Upscale (`scale` 2 or 4). With `start` (the Contextual
   *  Task Bar's Generate) the prompt is filled in and, when the chosen model needs nothing more from the person, the
   *  run begins at once without the dialog showing; otherwise the dialog opens with the prompt in place and says what is missing. */
  /** A run started from the task bar (Generate, Again): it never takes the current layer's seed, so Again varies. */
  private starting = false;
  private busy = false;
  private ticket = 0;
  private readonly go: HTMLButtonElement;

  async show(mode: Mode = 'fill', scale = 2, start?: { prompt: string }): Promise<void> {
    this.starting = !!start;
    this.mode = mode;
    this.scale = scale;
    this.setTitle(mode === 'upscale' ? `Upscale ${scale}x` : TITLES[mode]);
    this.prompt.placeholder = mode === 'expand' ? 'Describe the surroundings, or leave empty to extend the scene' : 'Describe what to add, or leave empty to remove';
    setHidden(this.prompt, mode === 'upscale');
    setHidden(this.marginRows, mode !== 'expand');
    setHidden(this.scopeRow, mode !== 'upscale');
    const selOpt = this.scope.options[2], hasSel = !!this.engine.current?.selection;
    if (selOpt.disabled === hasSel) selOpt.disabled = !hasSel;
    selOpt.title = hasSel ? '' : 'Make a selection first';
    if (!hasSel && this.scope.value === 'selection') this.scope.value = 'new';
    setText(this.hint, HINTS[mode]);
    // Upscale: Real-ESRGAN on fal or on this computer (1.53.1); the fill models otherwise.
    for (const b of this.modelRow.querySelectorAll('button')) setHidden(b as HTMLElement, mode === 'upscale');
    this.status = await api.generativeStatus();   // first, so the default knows whether fal has a key (1.58.5)
    this.catalogue = falModelsOf(await falCatalogue(), ...(mode === 'upscale' ? ['upscale' as const] : mode === 'expand' ? ['expand' as const] : ['edit' as const, 'inpaint' as const, 'remove' as const]));
    this.falGroup.replaceChildren(...this.catalogue.map((m) => Object.assign(document.createElement('option'), { value: falValue(m), textContent: m.label })));
    if (mode === 'upscale') { this.upscaleModels(await upscalerReady(), await upscaleFiles()); void this.loadComfyUpscalers(); }
    else { this.locals = (await localModels()).filter((m) => m.fromPicture); this.lama = await modelReady('lama-inpaint'); this.problems = await comfyReadiness(); this.fillModels(); }   // local models (1.52.9), LaMa (1.53.2)
    this.refs.refresh(!this.model.value.startsWith('comfy:'));
    setHidden(this.refs.el, mode === 'upscale');
    setHidden(this.chips.el, mode === 'upscale');
    setHidden(this.crop.el, mode === 'upscale');
    this.crop.load();
    setHidden(this.improver.el, mode === 'upscale');
    setHidden(this.opts.el, mode === 'upscale');
    this.improver.refresh();
    if (start && mode !== 'upscale') this.improver.history.set(start.prompt);
    if (start && !this.picked) {   // a run that starts without the dialog showing: Preferences > Generative's model, else the one chosen last time
      const kept = preferredModel(mode, start.prompt) || recalled(TITLES[mode], 'select:Model');
      if (typeof kept === 'string' && [...this.model.options].some((o) => o.value === kept && !o.disabled)) { this.model.value = kept; this.picked = true; }
    }
    this.sync();
    if (start && this.runnable) { await this.generate(); return; }
    this.open();
    if (mode !== 'upscale') { this.prompt.focus(); if (!start) this.prompt.select(); }
  }

  /** Upscale's choices: Real-ESRGAN on fal, or on this computer once its model is downloaded. */
  private upscaleModels(ready: boolean, files: Array<{ file: string; loadable: boolean; note: string }> = []): void {
    const here = el<HTMLOptionElement>('<option value="local:ai-upscale">Real-ESRGAN (this computer)</option>');
    here.disabled = !ready;
    if (!ready) here.title = 'Download it in Preferences > Plugins > Local models';
    const was = this.model.value;
    const chosen = files.map((f) => {
      const o = document.createElement('option');
      o.value = `local-file:${f.file}`;
      o.textContent = `${f.file} (this computer)`;
      o.disabled = !f.loadable;
      if (!f.loadable) o.title = f.note;
      return o;
    });
    this.model.replaceChildren(el('<option value="fal">Real-ESRGAN (fal)</option>'), here, ...chosen);
    if (this.comfyGroup.children.length) this.model.append(this.comfyGroup);
    if (this.falGroup.children.length) this.model.append(this.falGroup);
    // The person's choice while it stands; else fal when it has a key, this computer when not (1.58.5).
    const stands = was === 'fal' || (was === 'local:ai-upscale' && ready) || [...this.model.options].some((o) => o.value === was && !o.disabled && o.value !== 'fal');
    this.model.value = this.picked && stands ? was : this.status?.configured ? 'fal' : ready ? 'local:ai-upscale' : 'fal';
  }

  /** The upscaler files of the ComfyUI at the address in Preferences, added to the Model list in place once they arrive;
   *  the nodes it lacks are named in a greyed entry. */
  private async loadComfyUpscalers(): Promise<void> {
    let listed: { models: string[]; missing: string[] } | null = null;
    const url = loadPrefs().comfyuiUrl;
    if ((await api.comfyuiStatus(url))?.running) {
      try { listed = await api.comfyuiUpscaleModels(url); } catch { listed = null; }
    }
    if (this.mode !== 'upscale') return;
    const key = listed ? JSON.stringify(listed) : '';
    if (key === this.comfyListed) return;
    this.comfyListed = key;
    const was = this.model.value;
    const options = !listed ? [] : listed.missing.length ? [Object.assign(document.createElement('option'), { value: 'comfy-missing', textContent: `ComfyUI has no ${listed.missing.join(' or ')} node`, disabled: true })]
      : listed.models.map((f) => Object.assign(document.createElement('option'), { value: `comfy-file:${f}`, textContent: `${f} (ComfyUI)` }));
    this.comfyGroup.replaceChildren(...options);
    if (options.length && !this.comfyGroup.parentElement) this.model.append(this.comfyGroup);
    else if (!options.length && this.comfyGroup.parentElement) this.comfyGroup.remove();
    if ([...this.model.options].some((o) => o.value === was)) this.model.value = was;
    this.sync();
  }

  /** FLUX.1 Fill on fal, then the kept ComfyUI workflows and this computer's models; the person's choice kept while it
   *  exists, else fal when it has a key, else a model on this computer (1.58.5). */
  private fillModels(): void {
    const was = this.model.value;
    this.model.replaceChildren(el('<option value="fal">FLUX.1 Fill (fal)</option>'),
      ...recipes().map((r) => { const o = document.createElement('option'); o.value = `comfy:${r.name}`; o.textContent = `${r.name} (ComfyUI)`; const why = this.problems.get(r.name); if (why) { o.disabled = true; o.title = why; } return o; }),
      ...this.locals.map((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.label.replace(/ \(local\)$/, '')} (this computer)`; o.disabled = !m.ready; if (!m.ready && m.reason) o.title = m.reason; return o; }));
    // LaMa (1.53.2): inpainting on any computer's CPU, no prompt; chosen when fal has no key.
    const lama = el<HTMLOptionElement>('<option value="local:lama">LaMa, no prompt (this computer)</option>');
    lama.disabled = !this.lama; if (!this.lama) lama.title = 'Download it in Preferences > Plugins > Local models';
    this.model.append(lama);
    if (this.falGroup.children.length) this.model.append(this.falGroup);
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
  private get lamaHere(): boolean { return this.mode !== 'upscale' && this.model.value === 'local:lama'; }
  private get upscaleHere(): boolean { return this.mode === 'upscale' && (this.model.value === 'local:ai-upscale' || this.model.value.startsWith('local-file:')); }
  private get comfyUpscaleHere(): boolean { return this.mode === 'upscale' && this.model.value.startsWith('comfy-file:'); }
  private get upscaleFile(): string { return this.model.value.startsWith('local-file:') ? this.model.value.slice('local-file:'.length) : ''; }
  private get local(): LocalModel | undefined { return this.mode !== 'upscale' ? this.locals.find((m) => m.id === this.model.value) : undefined; }

  private get falModel(): FalModel | null { const id = falIdOf(this.model.value); return id ? this.catalogue.find((m) => m.id === id) ?? null : null; }

  private sync(): void {
    const s = this.status, local = this.local;
    this.fal.show(this.falModel, this.mode === 'expand' ? ['expand_top', 'expand_bottom', 'expand_left', 'expand_right'] : []);
    // The current layer's seed (1.96.4): a result named "... (seed N)" fills the model's seed, for the same result again.
    const seeded = /\(seed (\d+)\)$/.exec(this.engine.activeLayer?.name ?? '');
    if (seeded && !this.starting && this.fal.preset('seed', Number(seeded[1]))) setText(this.state, 'The seed of the current layer is filled in, for the same result again; clear it for a fresh one.');
    this.opts.forModel(this.lamaHere || this.upscaleHere ? 'lama' : this.model.value);
    this.refs.forFal(!this.comfy);
    setHidden(this.influenceRow, !local);
    setHidden(this.refineRow, !local);
    if (this.lamaHere) {
      setHidden(this.keyRow, true); setHidden(this.forget, true); setHidden(this.refs.el, true); setHidden(this.influenceRow, true);
      setText(this.state, 'LaMa runs on this computer, on any machine: no key, no cost. It fills from what surrounds the selection and takes no prompt; the result is masked to the selection.');
      return;
    }
    if (this.comfyUpscaleHere) {
      setHidden(this.keyRow, true); setHidden(this.forget, true);
      setText(this.state, `${this.model.value.slice('comfy-file:'.length)} runs on ComfyUI at ${loadPrefs().comfyuiUrl}: no key, no cost. It enlarges what the document shows ${this.scale} times, as the scope says; Escape or the status bar's stop cancels it.`);
      return;
    }
    if (this.upscaleHere) {
      setHidden(this.keyRow, true); setHidden(this.forget, true);
      setText(this.state, this.upscaleFile ? `${this.upscaleFile} runs on this computer from the engine's upscalers folder: no key, no cost. A model file that cannot be loaded is grayed with the reason. It enlarges what the document shows ${this.scale} times, as the scope says.` : `Real-ESRGAN runs on this computer: no key, no cost. It enlarges what the document shows ${this.scale} times, as the scope says.`);
      return;
    }
    if (local) {   // a local model: no key, no references; the picture under the selection at the influence set
      if (!this.influence.dataset.set) this.influence.value = String(Math.round(local.influence * 100));
      setHidden(this.keyRow, true); setHidden(this.forget, true); setHidden(this.refs.el, true);
      setText(this.state, `${local.label.replace(/ \(local\)$/, '')} runs on this computer: no key, no cost. It starts from what the selection covers, at the influence set, and the result is masked to the selection.`);
      return;
    }
    setHidden(this.refs.el, this.mode === 'upscale');
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

  /** Upscale by the scope chosen: the whole picture as a new document or in this document, or the selection as a layer. */
  private upscaleBy(scope: string, scale: number, run: (image: Blob) => Promise<Blob>): Promise<boolean> {
    const e = this.engine;
    const capped = cappedUpscale(run, scale);
    return scope === 'here' ? e.upscaleInDocument(scale, capped) : scope === 'selection' ? e.upscaleSelection(scale, capped) : e.upscaleToDocument(scale, capped);
  }

  /** A catalogue model's run through the engine's /fal/run: the picture (and the selection's mask when the model has a mask key) go by the schema's image keys, the options set go as inputs, and the answer lands the way the dialog's own results do. */
  private async generateWith(cat: FalModel, t: number): Promise<void> {
    const prompt = this.prompt.value.trim(), mode = this.mode, scale = this.scale, e = this.engine, scope = this.scope.value, extra = this.fal.values();
    const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
    // The words go to the model's own key (1.96.2): prompt for most, instruction or text_prompt for some (FIBO edit).
    const promptKey = (['prompt', 'instruction', 'text_prompt'] as const).find((k) => cat.inputs.some((i) => i.key === k)) ?? 'prompt';
    const takesPrompt = cat.inputs.some((i) => i.key === promptKey);
    // An instruction-edit model removes on an empty request (editInstruction), so only a mask model needs the words.
    if (takesPrompt && mode !== 'upscale' && !prompt && cat.inputs.some((i) => i.key === promptKey && i.required) && cat.role !== 'expand' && !!falMaskKey(cat)) { setText(this.state, 'Describe the change first.'); this.prompt.focus(); return; }
    // Pre-flight (1.96.4): the reference pictures must fit the model's picture list (after the area, and the mask when it
    // goes as a picture); nothing is uploaded otherwise.
    const references = mode === 'fill' ? (await this.chips.ordered()).map((r) => r.blob) : [];
    const room = pictureLimit(cat) - 1 - (falMaskAsPicture(cat) ? 1 : 0);
    if (references.length && room <= 0) { setText(this.state, 'This model takes no reference pictures: remove the reference chips, or pick a model that takes pictures.'); return; }
    if (references.length > room) { setText(this.state, 'This model takes fewer reference pictures than you added: remove some, or pick a model that takes more.'); return; }
    // Pre-flight (1.96.3): nothing is uploaded until fal has a key.
    if (this.status && !this.status.configured) { setText(this.state, 'fal has no key yet: paste yours in Preferences > Plugins > API keys, then Generate again.'); return; }
    const withPrompt = (): Record<string, unknown> => ({ ...(takesPrompt && prompt ? { [promptKey]: prompt } : {}), ...extra });
    if (this.ticket !== t) return;
    this.leave();
    if (mode === 'upscale') { await e.task(() => this.upscaleBy(scope, scale, (image) => stoppable(async () => (await falRunImage(cat, extra, image)).blob))); return; }
    if (mode === 'expand') {
      // No margins typed and a border selected (1.96.4): the margins are the border's own.
      const edge = margins.left + margins.top + margins.right + margins.bottom ? margins : e.borderMargins() ?? margins;
      const fill = stoppableFill(() => async (image: Blob): Promise<Blob> => {
        const bmp = await createImageBitmap(image), w = bmp.width, h = bmp.height, iw = Math.max(1, w - edge.left - edge.right), ih = Math.max(1, h - edge.top - edge.bottom);
        const c = new OffscreenCanvas(iw, ih), g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
        g.drawImage(bmp, -edge.left, -edge.top);
        bmp.close();
        const inner = await c.convertToBlob({ type: 'image/png' });
        const keys = new Set(cat.inputs.map((i) => i.key));
        const sent = { ...withPrompt(), ...(keys.has('expand_left') ? { expand_left: edge.left, expand_right: edge.right, expand_top: edge.top, expand_bottom: edge.bottom } : {}), ...(keys.has('image_size') ? { image_size: { width: w, height: h } } : {}), ...canvasInputs(cat, w, h, edge) };
        return (await falRunImage(cat, sent, inner)).blob;
      });
      await e.task(() => e.generativeExpand(margins, prompt, fill));
      return;
    }
    const maskKey = falMaskKey(cat), asPicture = falMaskAsPicture(cat);
    const told = (): Record<string, unknown> => ({ ...withPrompt(), ...(takesPrompt ? { [promptKey]: editInstruction(cat, prompt, references.length) } : {}) });
    // Sized for the model and padded to its aspect preset when it has no automatic shape (1.96.3, fal-size.ts).
    const fill = stoppableFill(() => cappedFill(async (image: Blob, mask: Blob): Promise<Blob> => {
      const prep = await prepareForModel(cat, image, maskKey || asPicture ? mask : null, genPrefs().highres, extra);
      const ran = await falRunImage(cat, { ...prep.inputs, ...(maskKey ? withPrompt() : told()) }, prep.image, prep.mask, references);
      e.generativeSeed = typeof ran.result.seed === 'number' ? ran.result.seed : null;
      return prep.restore(ran.blob);
    }));
    await e.task(() => e.generativeFill(prompt, fill));
  }

  private async generate(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.go.disabled = true;
    const t = ++this.ticket;
    try { await this.prepare(t); } finally { if (this.ticket === t) this.release(); }
  }

  private release(): void { this.ticket++; this.busy = false; this.go.disabled = false; }

  private leave(): void { this.close(); this.release(); }

  private async prepare(t: number): Promise<void> {
    if (this.lamaHere) {
      const e = this.engine, mode = this.mode, prompt = this.prompt.value;
      const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
      this.leave();
      const lama = stoppableFill(() => cappedFill(localInpaint()));
      if (mode === 'expand') await e.task(() => e.generativeExpand(margins, prompt, lama));
      else await e.task(() => e.generativeFill(prompt, lama));
      return;
    }
    if (this.upscaleHere) {
      const e = this.engine, scale = this.scale, scope = this.scope.value, file = this.upscaleFile;
      this.leave();
      await e.task(() => this.upscaleBy(scope, scale, (image) => stoppable((stopped) => localUpscale(scale, undefined, stopped, file)(image))));
      return;
    }
    if (this.comfyUpscaleHere) {
      const e = this.engine, scale = this.scale, scope = this.scope.value, file = this.model.value.slice('comfy-file:'.length), target = loadPrefs().comfyuiUrl;
      this.leave();
      await e.task(() => this.upscaleBy(scope, scale, (image) => stoppable((stopped) => comfyUpscale(target, file, image, (_text, _run, p) => e.reportProgress(p?.value ?? 0, p?.max ?? 0), stopped))));
      return;
    }
    const local = this.local;
    if (local) {
      const prompt = this.prompt.value, mode = this.mode, e = this.engine, refine = this.refine.checked, influence = Math.max(refine ? 0.85 : 0, Number(this.influence.value) / 100), { seed, negative, steps, guidance } = this.opts.request();
      const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
      const sent = await generatePrompt(prompt, local.id);
      if (this.ticket !== t) return;
      this.leave();
      const fill = stoppableFill((stopped) => cappedFill(localFill(local.id, sent, influence, (r) => this.heard(r), undefined, { seed, negative, steps, guidance, refine, cancelled: stopped, onSeed: (s) => this.opts.used(s) })));
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
      try { checkReferenceCount(recipe.name, recipe.json, refs.length); said = await generatePrompt(resolveReferenceTokens(prompt, refs.length, recipe.refs), 'comfyui'); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'A reference token could not be read.'); return; }
      if (this.ticket !== t) return;
      this.leave();
      const fill = stoppableFill((stopped) => withCropStitch(cappedFill(comfyGenerator(target, recipe, said, refs, stopped))));
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
    const cat = this.falModel;
    if (cat) { await this.generateWith(cat, t); return; }
    const prompt = this.prompt.value, mode = this.mode, scale = this.scale, e = this.engine, scope = this.scope.value, { seed } = this.opts.request();
    const margins = { left: Number(this.margin.left.value), top: Number(this.margin.top.value), right: Number(this.margin.right.value), bottom: Number(this.margin.bottom.value) };
    const sent = await generatePrompt(prompt, 'fal');
    if (this.ticket !== t) return;
    this.leave();
    if (seed !== undefined && mode !== 'upscale') this.opts.used(seed);
    const fill = stoppableFill(() => withCropStitch(cappedFill((image: Blob, mask: Blob): Promise<Blob> => api.generativeFill(image, mask, sent, seed))));
    if (mode === 'upscale') await e.task(() => this.upscaleBy(scope, scale, (image) => stoppable(() => api.upscale(image, scale))));
    else if (mode === 'expand') await e.task(() => e.generativeExpand(margins, prompt, fill));
    else await e.task(() => e.generativeFill(prompt, fill));
  }
}

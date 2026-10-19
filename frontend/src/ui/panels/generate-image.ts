import { Raster, type Engine } from '../../engine';
import type { GenerationInfo } from '../../engine/types';
import { api, ApiError, type GenerativeStatus, type ProviderStatus } from '../../io/api';
import { recipes, runToResults } from '../../io/comfy';
import { localModels, runLocal } from '../../io/local-gen';
import { Dialog } from '../dialogs';
import { el, patchList, setText } from '../dom';
import { t } from '../i18n';
import { loadPrefs } from '../prefs';
import { ReferencePicker } from './references';
import { PromptImprover } from './prompt-improver';

/** One model Generate Image can use: its value in the picker, its words, and why it cannot be chosen when it cannot. */
export interface GenerationModel { value: string; label: string; disabled: boolean; reason: string }
export interface GenerationModels { models: GenerationModel[]; providers: ProviderStatus[]; preferred: string; fal: GenerativeStatus | null }

const PROVIDER_NAMES: Record<string, string> = { openai: 'GPT Image', google: 'Gemini image', bfl: 'FLUX1.1 [pro]', ideogram: 'Ideogram 3.0' };

/** The models Generate Image offers, from the one source the Generate Image dialog and the Generate panel share: fal,
 *  the providers beside it, the kept ComfyUI workflows (left out when `comfy` is false: the panel offers them only while
 *  ComfyUI answers) and the models on this computer. `preferred` is the default: fal with a key, else a model here. */
export async function generationModels(comfy = true): Promise<GenerationModels> {
  const locals = await localModels();   // the local models (1.52.9)
  const providers = await api.providers();
  const models: GenerationModel[] = [
    { value: 'fal', label: 'FLUX1.1 [pro] (fal)', disabled: false, reason: '' },
    ...providers.map((pr) => ({ value: `provider:${pr.id}`, label: `${PROVIDER_NAMES[pr.id] ?? pr.model} (${pr.name})`, disabled: false, reason: '' })),
    ...(comfy ? recipes().map((r) => ({ value: r.name, label: `${r.name} (ComfyUI)`, disabled: false, reason: '' })) : []),
    ...locals.map((m) => ({ value: m.id, label: `${m.label.replace(/ \(local\)$/, '')} (this computer)`, disabled: !m.ready, reason: !m.ready && m.reason ? m.reason : '' })),
  ];
  // fal, the cloud default, when it has a key; else a model on this computer; else fal, whose key is then asked for (1.58.5).
  const fal = await api.generativeStatus(), local = locals.find((m) => m.ready)?.id ?? null;
  return { models, providers, preferred: fal?.configured ? 'fal' : local ?? 'fal', fal };
}

const applyModel = (o: HTMLOptionElement, m: GenerationModel): void => {
  setText(o, m.label);
  if (o.disabled !== m.disabled) o.disabled = m.disabled;
  if (o.title !== m.reason) o.title = m.reason;
};

/** Puts the models into a picker in place: options are updated, added and removed by value, so a picker on screen never
 *  blinks and keeps what is chosen while it is still offered. */
export function fillModelPicker(select: HTMLSelectElement, models: readonly GenerationModel[]): void {
  patchList(select, [...models], {
    key: (m) => m.value,
    create: (m) => { const o = document.createElement('option'); o.value = m.value; applyModel(o, m); return o; },
    update: (o, m) => applyModel(o as HTMLOptionElement, m),
  });
}

export interface GenerationRequest {
  prompt: string;
  /** The picker's value: 'fal', 'provider:<id>', 'local:<model>' or a kept ComfyUI workflow's name. */
  choice: string;
  providers: readonly ProviderStatus[];
  /** The pixel size to ask for; the document's own when absent. */
  size?: { width: number; height: number };
  /** The layers sent as references to a ComfyUI workflow. */
  references?: () => Promise<Array<{ name: string; blob: Blob }>>;
  status: (text: string) => void;
  stopped: () => boolean;
  heard?: (r: { notice?: string; warning?: string; notes: string[] }) => void;
  /** Where a missing key is added, for the messages (the dialog and the panel add keys in different places). */
  keyHint?: { fal: string; provider: (name: string) => string };
}

/** One generation, by whichever model is chosen: the picture arrives as a new layer 'Generated Image' (a new 1024 by 1024
 *  document when none is open, or one of the size asked). With a size other than the document's, the layer is that size,
 *  centred. Resolves true once the layer is in, false when stopped or the document changed; otherwise throws, with words
 *  for the person. The dialog and the panel both run this. */
export async function runGeneration(engine: Engine, req: GenerationRequest): Promise<boolean> {
  if (!engine.current) engine.newDocument(req.size?.width ?? 1024, req.size?.height ?? 1024, 'Generated', 'white');
  const p = engine.current;
  if (!p) return false;
  const W = p.doc.width, H = p.doc.height, w = req.size?.width ?? W, h = req.size?.height ?? H, { prompt, choice } = req;
  const hint = req.keyHint ?? { fal: t('Add a fal API key first, in Edit > Generative Fill.'), provider: (name: string) => t(`Add a ${name} API key first, above.`) };
  let blob: Blob;
  let generation: GenerationInfo | undefined;
  if (choice.startsWith('local:')) {
    // On this computer: the shape asked within the model's 2048 pixels, in multiples of 16.
    const k = Math.min(1, 2048 / Math.max(w, h)), lw = Math.max(256, Math.round((w * k) / 16) * 16), lh = Math.max(256, Math.round((h * k) / 16) * 16);
    const r = await runLocal({ generator: choice, prompt, size: `${lw}x${lh}`, count: 1 }, req.status, req.stopped);
    req.heard?.(r);
    blob = r.pictures[0];
    generation = r.settings[0];
  } else if (choice.startsWith('provider:')) {
    const pr = req.providers.find((x) => `provider:${x.id}` === choice);
    if (!pr) throw new Error(t('That provider is not available.'));
    if (!pr.configured) throw new Error(hint.provider(pr.name));
    req.status(t(`Generating with ${pr.name}...`));
    blob = await api.generateImage(prompt, w, h, pr.id);
  } else if (choice === 'fal') {
    const st = await api.generativeStatus();
    if (!st) throw new Error(t('The formvis engine is offline. Start it with ./formvis boot.'));
    if (!st.configured) throw new Error(hint.fal);
    req.status(t('Generating on fal...'));
    blob = await api.generateImage(prompt, w, h);
  } else {
    const recipe = recipes().find((r) => r.name === choice);
    if (!recipe) throw new Error(t('That workflow is no longer kept: add it again in Edit > Generative Fill.'));
    req.status(t('Sending to ComfyUI...'));
    const refs = req.references ? await req.references() : [];
    blob = (await runToResults(loadPrefs().comfyuiUrl, recipe.json, refs.map((r) => ({ name: r.name, kind: 'reference' })), refs.map((r, i) => ({ name: `ref${i}.png`, blob: r.blob })), prompt, req.status, req.stopped))[0];
  }
  if (req.stopped() || engine.current !== p) return false;
  const bitmap = await createImageBitmap(blob), r = new Raster(w, h);
  r.ctx.drawImage(bitmap, 0, 0, w, h);   // scaled to the shape asked
  bitmap.close();
  r.touch();
  engine.insertRasterLayer(r, 'Generated Image', Math.round((W - w) / 2), Math.round((H - h) / 2), generation ? { generation } : {}, 'Generate Image');
  return true;
}

/** Edit > Generate Image (1.51.2): a picture from a prompt alone, as a new layer at the document's size
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
  private picked = false;     // the person chose the model (1.58.5); until then the default is fal with a key, else local

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Generate Image', 420);
    const row = el('<label class="cv-dialog-row"><span>Model</span></label>');
    row.append(this.model);
    this.refs = new ReferencePicker(engine);
    this.model.addEventListener('change', () => { this.picked = true; this.refs.forFal(this.model.value === 'fal'); this.keyFor(); });
    this.improver = new PromptImprover(this.prompt, 'Richer detail');
    this.keyButton.addEventListener('click', () => {
      const pr = this.chosenProvider();
      if (pr?.configured && !this.changing) { this.changing = true; this.keyFor(); this.keyInput.focus(); } else void this.saveKey();
    });
    this.keyRow.append(this.keyInput, this.keyButton);
    this.body.append(this.prompt, this.improver.el, row, this.keyRow, this.refs.el, this.status);
    this.button('Cancel', 'ghost', () => { this.stopped = true; this.close(); });
    this.button('Generate', 'primary', () => void this.generate());
    this.remember();   // the model chosen and the reference settings; the prompt and the key are text
  }

  async show(): Promise<void> {
    const was = this.model.value;
    const { models, providers, preferred } = await generationModels();   // the models the Generate panel offers too
    this.providers = providers;
    fillModelPicker(this.model, models);
    // The person's choice while it stands; else the default (fal with a key, else a model on this computer). The other
    // providers are chosen, never defaults (1.58.5).
    if (this.picked && [...this.model.options].some((o) => o.value === was && !o.disabled)) this.model.value = was;
    else this.model.value = preferred;
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
    this.busy = true;
    this.stopped = false;
    try {
      // The same generation the Generate panel runs; a new layer at the document's size (a new document when none is open).
      const added = await runGeneration(this.engine, { prompt, choice: this.model.value, providers: this.providers, references: () => this.refs.chosen(), status: (text) => setText(this.status, text), stopped: () => this.stopped, heard: (r) => this.heard(r) });
      if (!added) return;
      this.close();
      this.toast('The generated image was added as a layer.');
    } catch (err) {
      if (!this.stopped) setText(this.status, err instanceof ApiError || err instanceof Error ? err.message : 'Generating failed.');
    } finally { this.busy = false; }
  }
}

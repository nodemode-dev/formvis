import { Raster, docTransform, layerRoleOf, newLayer, type Engine } from '../../engine';
import type { GenerationInfo, Layer } from '../../engine/types';
import { withBoxes } from '../../engine/boxes';
import { api, ApiError, type GenerativeStatus, type ProviderStatus } from '../../io/api';
import { checkReferenceCount, recipes, runToResults } from '../../io/comfy';
import { generatePrompt } from '../../io/prompt-templates';
import { localModels, runLocal } from '../../io/local-gen';
import { Dialog } from '../dialogs';
import { el, patchList, setHidden, setText } from '../dom';
import { t } from '../i18n';
import { loadPrefs } from '../prefs';
import { ReferencePicker } from './references';
import { ReferenceChips } from './reference-chips';
import { PromptImprover, areaView, referenceViews } from './prompt-improver';
import { GenerationOptions } from './generation-options';

/** The shapes Generate offers beside the picture's own: name, words, pixels (multiples of 16, within every local model's range). */
export const SIZES: ReadonlyArray<readonly [string, string, number, number]> = [
  ['1:1', 'Square 1:1 (1024 x 1024)', 1024, 1024],
  ['4:3', 'Landscape 4:3 (1152 x 896)', 1152, 896],
  ['3:4', 'Portrait 3:4 (896 x 1152)', 896, 1152],
  ['16:9', 'Wide 16:9 (1344 x 768)', 1344, 768],
  ['9:16', 'Tall 9:16 (768 x 1344)', 768, 1344],
];

type Shape = readonly [string, string, number, number];

/** The shapes each provider asks for in its own terms (OpenAI three sizes, the others aspect ratios, all multiples of 16). */
const PROVIDER_SHAPES: Record<string, ReadonlyArray<Shape>> = {
  openai: [['1:1', 'Square 1:1 (1024 x 1024)', 1024, 1024], ['3:2', 'Landscape 3:2 (1536 x 1024)', 1536, 1024], ['2:3', 'Portrait 2:3 (1024 x 1536)', 1024, 1536]],
  google: [['1:1', 'Square 1:1 (1024 x 1024)', 1024, 1024], ['3:2', 'Landscape 3:2 (1248 x 832)', 1248, 832], ['2:3', 'Portrait 2:3 (832 x 1248)', 832, 1248], ['4:3', 'Landscape 4:3 (1184 x 864)', 1184, 864], ['3:4', 'Portrait 3:4 (864 x 1184)', 864, 1184], ['16:9', 'Wide 16:9 (1344 x 768)', 1344, 768], ['9:16', 'Tall 9:16 (768 x 1344)', 768, 1344], ['21:9', 'Ultrawide 21:9 (1536 x 656)', 1536, 656]],
  bfl: [['1:1', 'Square 1:1 (1024 x 1024)', 1024, 1024], ['4:3', 'Landscape 4:3 (1152 x 864)', 1152, 864], ['3:4', 'Portrait 3:4 (864 x 1152)', 864, 1152], ['3:2', 'Landscape 3:2 (1248 x 832)', 1248, 832], ['2:3', 'Portrait 2:3 (832 x 1248)', 832, 1248], ['16:9', 'Wide 16:9 (1344 x 768)', 1344, 768], ['9:16', 'Tall 9:16 (768 x 1344)', 768, 1344]],
  ideogram: [['1:1', 'Square 1:1 (1024 x 1024)', 1024, 1024], ['16:9', 'Wide 16:9 (1344 x 768)', 1344, 768], ['9:16', 'Tall 9:16 (768 x 1344)', 768, 1344], ['4:3', 'Landscape 4:3 (1152 x 864)', 1152, 864], ['3:4', 'Portrait 3:4 (864 x 1152)', 864, 1152], ['3:2', 'Landscape 3:2 (1248 x 832)', 1248, 832], ['2:3', 'Portrait 2:3 (832 x 1248)', 832, 1248], ['16:10', 'Wide 16:10 (1280 x 800)', 1280, 800], ['10:16', 'Tall 10:16 (800 x 1280)', 800, 1280]],
};

/** The shapes the model chosen offers: a provider's own, a model on this computer's catalogue sizes (`local`, "WxH"), else the common five. */
export function shapesFor(choice: string, local: readonly string[] = []): ReadonlyArray<Shape> {
  if (choice.startsWith('provider:')) return PROVIDER_SHAPES[choice.slice(9)] ?? SIZES;
  const own = choice.startsWith('local:') ? local.map((s): Shape => { const [w, h] = s.split('x').map(Number); return [s, `${w} x ${h}`, w, h]; }) : [];
  return own.length ? own : SIZES;
}

/** One model Generate Image can use: its value in the picker, its words, and why it cannot be chosen when it cannot. */
export interface GenerationModel { value: string; label: string; disabled: boolean; reason: string }
export interface GenerationModels { models: GenerationModel[]; providers: ProviderStatus[]; preferred: string; fal: GenerativeStatus | null; sizes: Record<string, string[]> }

const PROVIDER_NAMES: Record<string, string> = { openai: 'GPT Image', google: 'Gemini image', bfl: 'FLUX1.1 [pro]', ideogram: 'Ideogram 3.0' };

/** One line of the run log: a generation, whichever model ran it, with how long it took and how it ended. */
export interface RunLogEntry { id: number; time: number; choice: string; prompt: string; ms: number; ok: boolean; note: string }
/** One kept result: the picture a generation made, to add again as a layer without running the model again. */
export interface KeptResult { id: number; time: number; prompt: string; choice: string; width: number; height: number; blob: Blob; generation?: GenerationInfo }

const LOG_LIMIT = 200, KEPT_LIMIT = 12;
const runLog: RunLogEntry[] = [];
const kept: KeptResult[] = [];
const listeners = new Set<() => void>();
const running = new Set<{ stop: () => void }>();
let serial = 0;

/** Stops every generation in flight (Escape and the status bar's stop): local jobs are cancelled in the engine, ComfyUI
 *  prompts are interrupted and a cloud answer is dropped when it arrives. Returns how many were running. */
export function stopGenerations(): number { const n = running.size; for (const r of [...running]) r.stop(); return n; }
export const generationsRunning = (): number => running.size;

/** One stoppable call of a Fill, Expand or Upscale generator: Escape and the status bar stop it (the answer is dropped
 *  when it arrives, a job on this computer is cancelled in the engine) and it rejects with 'Stopped.'. */
export function stoppable<T>(work: (stopped: () => boolean) => Promise<T>): Promise<T> {
  let cancelled = false, cut: (e: Error) => void = () => {};
  const gone = new Promise<never>((_ok, no) => { cut = no; });
  const run = { stop: () => { cancelled = true; cut(new Error('Stopped.')); } };
  running.add(run);
  const w = work(() => cancelled);
  w.catch(() => undefined);
  return Promise.race([w, gone]).finally(() => { running.delete(run); });
}

/** A fill generator made stoppable: `make` gets the stop test of each call. */
export function stoppableFill(make: (stopped: () => boolean) => (image: Blob, mask: Blob) => Promise<Blob>): (image: Blob, mask: Blob) => Promise<Blob> {
  return (image, mask) => stoppable((stopped) => make(stopped)(image, mask));
}

export const generationLog = (): readonly RunLogEntry[] => runLog;
export const keptResults = (): readonly KeptResult[] => kept;
/** Calls `fn` whenever the log or the kept results change; returns the way to stop. */
export function onGenerationChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
const changed = (): void => { for (const fn of listeners) fn(); };

/** The log as plain text, one line a call, oldest first. */
export function runLogText(): string {
  return runLog.map((e) => `${new Date(e.time).toISOString()}\t${e.choice}\t${e.ok ? 'ok' : 'failed'}\t${e.ms} ms\t${e.note}\t${e.prompt.replace(/\s+/g, ' ')}`).join('\n');
}

export function clearRunLog(): void { runLog.length = 0; changed(); }

/** Replaces @img1, @img2 and on with the words that name the references in order, the way the workflow is given them:
 *  "image 1", "image 2" unless the workflow has its own pattern (`style`, with {n}). Throws when a token names a
 *  reference that is not chosen. */
export function resolveReferenceTokens(prompt: string, count: number, style = 'image {n}'): string {
  const pattern = style.includes('{n}') ? style : 'image {n}';
  return prompt.replace(/@img(\d+)\b/gi, (_m, n: string) => {
    const k = Number(n);
    if (k < 1 || k > count) throw new Error(t(`@img${k} names a reference that is not chosen (${count} chosen).`));
    return pattern.replace('{n}', String(k));
  });
}

const hasTokens = (prompt: string): boolean => /@img\d+\b/i.test(prompt);

let readiness: { key: string; at: number; found: Map<string, string> } | null = null;

/** Why each kept ComfyUI workflow cannot run now (name to reason): the nodes it needs that ComfyUI lacks and the model
 *  files it picks that ComfyUI does not list, from ComfyUI's own answer. Checked at most once a minute for the same
 *  workflows, and never held up for more than 2.5 seconds; empty when ComfyUI does not answer. */
export async function comfyReadiness(): Promise<Map<string, string>> {
  const kept = recipes();
  if (!kept.length) return new Map();
  const target = loadPrefs().comfyuiUrl, key = `${target}|${kept.map((r) => `${r.name}:${r.json.length}`).join(',')}`;
  if (readiness && readiness.key === key && Date.now() - readiness.at < 60_000) return readiness.found;
  const probe = await Promise.race([api.comfyuiProbe(target, kept.map((r) => ({ name: r.name, workflow: r.json }))), new Promise<null>((ok) => setTimeout(() => ok(null), 2500))]);
  const found = new Map<string, string>();
  for (const c of probe?.running ? probe.recipes ?? [] : []) {
    const bits: string[] = [];
    if (c.missing_nodes.length) bits.push(`ComfyUI lacks the nodes ${c.missing_nodes.slice(0, 4).join(', ')}`);
    if (c.missing_models.length) bits.push(`ComfyUI does not list the model ${c.missing_models.slice(0, 3).map((m) => m.name).join(', ')}`);
    if (bits.length) found.set(c.name, bits.join('; '));
  }
  readiness = { key, at: Date.now(), found };
  return found;
}

/** The models Generate Image offers, from the one source the Generate Image dialog and the Generate panel share: fal,
 *  the providers beside it, the kept ComfyUI workflows (left out when `comfy` is false: the panel offers them only while
 *  ComfyUI answers) and the models on this computer. `preferred` is the default: fal with a key, else a model here. */
export async function generationModels(comfy = true): Promise<GenerationModels> {
  const locals = await localModels();   // the local models (1.52.9)
  const providers = await api.providers();
  const problems = comfy ? await comfyReadiness() : new Map<string, string>();
  const models: GenerationModel[] = [
    { value: 'fal', label: 'FLUX1.1 [pro] (fal)', disabled: false, reason: '' },
    ...providers.map((pr) => ({ value: `provider:${pr.id}`, label: `${PROVIDER_NAMES[pr.id] ?? pr.model} (${pr.name})`, disabled: false, reason: '' })),
    ...(comfy ? recipes().map((r) => ({ value: r.name, label: `${r.name} (ComfyUI)`, disabled: problems.has(r.name), reason: problems.get(r.name) ?? '' })) : []),
    ...locals.map((m) => ({ value: m.id, label: `${m.label.replace(/ \(local\)$/, '')} (this computer)`, disabled: !m.ready, reason: !m.ready && m.reason ? m.reason : '' })),
  ];
  // fal, the cloud default, when it has a key; else a model on this computer; else fal, whose key is then asked for (1.58.5).
  const fal = await api.generativeStatus(), local = locals.find((m) => m.ready)?.id ?? null;
  return { models, providers, preferred: fal?.configured ? 'fal' : local ?? 'fal', fal, sizes: Object.fromEntries(locals.map((m) => [m.id, m.sizes])) };
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
  /** The longest side a model on this computer works at (the dialog remembers it); 2048 when absent. The result is placed at the size asked. */
  cap?: number;
  /** Where the picture lands: a layer of the open document (the default), a new document of its own size, or the tab's base picture (every layer but the Reference ones replaced, one undo step). */
  target?: 'layer' | 'document' | 'base';
  /** The layers sent as references to a ComfyUI workflow. */
  references?: () => Promise<Array<{ name: string; blob: Blob }>>;
  /** Cut the background away from the result with the engine's background removal, so the layer has a transparent background. */
  transparent?: boolean;
  /** Seed (fal and models on this computer) and negative prompt (this computer); the seed used comes back through `onSeed`. */
  seed?: number;
  negative?: string;
  steps?: number;
  guidance?: number;
  onSeed?: (seed: number | undefined) => void;
  /** Called when stopGenerations stops this run, so the caller can say so. */
  onStop?: () => void;
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
  const t0 = performance.now(), entry: RunLogEntry = { id: ++serial, time: Date.now(), choice: req.choice, prompt: req.prompt, ms: 0, ok: false, note: '' };
  let cancelled = false, release: (v: boolean) => void = () => {};
  const gone = new Promise<boolean>((ok) => { release = ok; });
  const run = { stop: () => { cancelled = true; req.onStop?.(); release(false); } };
  running.add(run);
  try {
    // Stopping answers at once; a cloud answer that arrives later finds the run cancelled and is dropped.
    const work = generateOnce(engine, { ...req, stopped: () => cancelled || req.stopped() });
    work.catch(() => undefined);
    const added = await engine.task(() => Promise.race([work, gone]));
    entry.ok = true;
    entry.note = added ? 'added as a layer' : 'stopped';
    return added;
  } catch (err) {
    entry.note = err instanceof Error ? err.message : 'failed';
    throw err;
  } finally {
    running.delete(run);
    entry.ms = Math.round(performance.now() - t0);
    runLog.push(entry);
    if (runLog.length > LOG_LIMIT) runLog.splice(0, runLog.length - LOG_LIMIT);
    changed();
  }
}

/** Puts a generated picture in as the layer 'Generated Image', scaled to the shape asked and centred in the document. */
async function placeResult(engine: Engine, blob: Blob, w: number, h: number, generation?: GenerationInfo): Promise<void> {
  const W = engine.current?.doc.width ?? w, H = engine.current?.doc.height ?? h;
  const bitmap = await createImageBitmap(blob), r = new Raster(w, h);
  r.ctx.drawImage(bitmap, 0, 0, w, h);   // scaled to the shape asked
  bitmap.close();
  r.touch();
  engine.insertRasterLayer(r, 'Generated Image', Math.round((W - w) / 2), Math.round((H - h) / 2), generation ? { generation } : {}, 'Generate Image');
}

/** Replaces the tab's picture with a generated one as one history step: every layer but the Reference ones goes, the result is the new bottom layer 'Generated Image'. */
async function replaceBase(engine: Engine, blob: Blob, w: number, h: number, generation?: GenerationInfo): Promise<void> {
  const bitmap = await createImageBitmap(blob), r = new Raster(w, h);
  r.ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  r.touch();
  engine.edit('Replace Picture with Generated Image', (p) => {
    const base = newLayer('Generated Image', p.doc, { raster: r });
    const layer: Layer = { ...base, transform: { ...docTransform(w, h), x: Math.round((p.doc.width - w) / 2), y: Math.round((p.doc.height - h) / 2) }, ...(generation ? { generation } : {}) };
    const refs = p.doc.layers.filter((l) => !l.isGroup && layerRoleOf(l) === 'reference');
    p.doc = { ...p.doc, layers: [layer, ...refs] };
    p.activeId = layer.id;
    return true;
  });
}

/** The picture with its background made transparent: the engine's subject mask becomes the picture's alpha. */
async function cutBackground(picture: Blob): Promise<Blob> {
  const { mask } = await api.removeBackground(picture, 'auto');
  const [img, m] = await Promise.all([createImageBitmap(picture), createImageBitmap(mask)]);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) { img.close(); m.close(); throw new Error('no canvas to work on'); }
  g.drawImage(m, 0, 0, c.width, c.height);
  const matte = g.getImageData(0, 0, c.width, c.height);
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < px.data.length; i += 4) px.data[i + 3] = Math.min(px.data[i + 3], matte.data[i]);
  g.putImageData(px, 0, 0);
  img.close(); m.close();
  return new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('the picture could not be saved'))), 'image/png'));
}

/** Adds an earlier result as a new layer again, without running the model; false when it is gone or no picture is open. */
export async function addKeptResult(engine: Engine, id: number): Promise<boolean> {
  const k = kept.find((x) => x.id === id);
  if (!k || !engine.current) return false;
  await placeResult(engine, k.blob, k.width, k.height, k.generation);
  return true;
}

async function generateOnce(engine: Engine, req: GenerationRequest): Promise<boolean> {
  const fresh = !engine.current;
  if (fresh) engine.newDocument(req.size?.width ?? 1024, req.size?.height ?? 1024, 'Generated', 'white');
  const p = engine.current;
  if (!p) return false;
  const W = p.doc.width, H = p.doc.height, w = req.size?.width ?? W, h = req.size?.height ?? H, { choice } = req, prompt = await generatePrompt(withBoxes(req.prompt, p.doc), choice === 'fal' ? 'fal' : /^(local|provider):/.test(choice) ? choice.replace(/^[a-z]+:/, '') : 'comfyui');   // the layout boxes follow the words, one line each
  const hint = req.keyHint ?? { fal: t('Add a fal API key first, in Edit > Generative Fill.'), provider: (name: string) => t(`Add a ${name} API key first, above.`) };
  let blob: Blob;
  let generation: GenerationInfo | undefined;
  const referenced = !(choice === 'fal' || choice.startsWith('local:') || choice.startsWith('provider:'));
  if (!referenced && hasTokens(prompt)) throw new Error(t('This model takes no references: remove the @img tokens from the prompt, or choose a ComfyUI workflow.'));
  if (choice.startsWith('local:')) {
    // On this computer: the shape asked within the model's 2048 pixels, in multiples of 16.
    const k = Math.min(1, Math.min(2048, req.cap ?? 2048) / Math.max(w, h)), lw = Math.max(256, Math.round((w * k) / 16) * 16), lh = Math.max(256, Math.round((h * k) / 16) * 16);
    const r = await runLocal({ generator: choice, prompt, size: `${lw}x${lh}`, count: 1, ...(req.negative ? { negative: req.negative } : {}), ...(req.seed !== undefined || req.steps !== undefined || req.guidance !== undefined ? { options: { ...(req.seed !== undefined ? { seed: req.seed } : {}), ...(req.steps !== undefined ? { steps: req.steps } : {}), ...(req.guidance !== undefined ? { guidance: req.guidance } : {}) } } : {}) }, req.status, req.stopped);
    req.heard?.(r);
    blob = r.pictures[0];
    generation = r.settings[0];
    req.onSeed?.(generation?.seed ?? req.seed);
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
    blob = await api.generateImage(prompt, w, h, 'fal', req.seed);
    req.onSeed?.(req.seed);
  } else {
    const recipe = recipes().find((r) => r.name === choice);
    if (!recipe) throw new Error(t('That workflow is no longer kept: add it again in Edit > Generative Fill.'));
    req.status(t('Sending to ComfyUI...'));
    const refs = req.references ? await req.references() : [];
    checkReferenceCount(recipe.name, recipe.json, refs.length);
    const said = resolveReferenceTokens(prompt, refs.length, recipe.refs);
    blob = (await runToResults(loadPrefs().comfyuiUrl, recipe.json, refs.map((r) => ({ name: r.name, kind: 'reference' })), refs.map((r, i) => ({ name: `ref${i}.png`, blob: r.blob })), said, req.status, req.stopped))[0];
  }
  if (req.stopped() || engine.current !== p) return false;
  if (req.transparent) {
    req.status(t('Cutting the background away...'));
    blob = await cutBackground(blob).catch((err: unknown) => { req.heard?.({ warning: `${t('The background could not be cut away, so the picture keeps it.')} ${err instanceof Error ? err.message : ''}`.trim(), notes: [] }); return blob; });
    if (req.stopped() || engine.current !== p) return false;
  }
  if (req.target === 'document' && !fresh) engine.newDocument(w, h, 'Generated', 'transparent');
  if (req.target === 'base' && !fresh) await replaceBase(engine, blob, w, h, generation);
  else await placeResult(engine, blob, w, h, generation);
  kept.unshift({ id: ++serial, time: Date.now(), prompt: req.prompt, choice, width: w, height: h, blob, generation });
  if (kept.length > KEPT_LIMIT) kept.length = KEPT_LIMIT;
  return true;
}

/** Edit > Generate Image (1.51.2): a picture from a prompt alone, as a new layer at the document's size
 *  (a new 1024 by 1024 document when none is open), with FLUX1.1 [pro] on fal, OpenAI, Google, Black Forest Labs or
 *  Ideogram with their own keys (1.58.4), a kept ComfyUI workflow, or a model on this computer. */
export class GenerateImageDialog extends Dialog {
  private readonly prompt = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="3" aria-label="Prompt" placeholder="Describe the image"></textarea>');
  private readonly model = el<HTMLSelectElement>('<select class="cv-input" aria-label="Model"></select>');
  private readonly status = el('<p class="cv-note cv-gen-status" role="status"></p>');
  private readonly size = el<HTMLSelectElement>('<select class="cv-input" aria-label="Size"></select>');
  private readonly cw = el<HTMLInputElement>('<input class="cv-input" type="number" min="256" max="2048" step="16" value="1024" aria-label="Width" hidden>');
  private readonly ch = el<HTMLInputElement>('<input class="cv-input" type="number" min="256" max="2048" step="16" value="1024" aria-label="Height" hidden>');
  private readonly cap = el<HTMLSelectElement>('<select class="cv-input" aria-label="Working size" title="The longest side a model on this computer works at; a larger picture is made at this size and placed at the size asked"><option value="2048">Up to 2048 px</option><option value="1536">Up to 1536 px</option><option value="1024">Up to 1024 px</option></select>');
  private readonly target = el<HTMLSelectElement>('<select class="cv-input" aria-label="Result"><option value="layer">Result: a layer of this picture</option><option value="document">Result: a new document</option><option value="base">Result: replace this picture</option></select>');
  private readonly clear = el<HTMLInputElement>('<input type="checkbox" aria-label="Transparent background">');
  private readonly clearRow = el('<label class="cv-dialog-row" title="Cuts the background away from the result with the background removal engine"><span>Transparent background</span></label>');
  private busy = false;
  private shapes: ReadonlyArray<Shape> = SIZES;
  private localSizes: Record<string, string[]> = {};
  private readonly refs: ReferencePicker;
  private readonly chips: ReferenceChips;
  private readonly improver: PromptImprover;
  private readonly opts = new GenerationOptions();
  private stopped = false;
  // The providers beside fal (1.58.4, L7): which have keys, and a key field shown when the chosen one has none.
  private providers: ProviderStatus[] = [];
  private readonly keyInput = el<HTMLInputElement>('<input class="cv-input" type="password" autocomplete="off" aria-label="API key">');
  private readonly keyRow = el('<div class="cv-dialog-row" hidden><span class="cv-gen-keylabel">API key</span></div>');
  private readonly keyButton = el<HTMLButtonElement>('<button class="cv-btn" type="button">Save key</button>');
  private changing = false;   // a kept key being replaced
  private picked = false;     // the person chose the model (1.58.5); until then the default is fal with a key, else local
  // Earlier results (add again, or take back their prompt) and the run log of every generation, built once and patched.
  private readonly hist = el('<div class="cv-gen-hist" role="group" aria-label="Earlier results"></div>');
  private readonly logBox = el('<details class="cv-gen-log"><summary>Run log</summary><pre class="cv-gen-logtext" aria-label="Run log"></pre><div class="cv-dialog-row"><button type="button" class="cv-btn cv-btn-ghost" data-act="copy">Copy log</button><button type="button" class="cv-btn cv-btn-ghost" data-act="clear">Clear log</button></div></details>');
  private readonly thumbs = new Map<number, string>();

  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Generate Image', 420);
    const row = el('<label class="cv-dialog-row"><span>Model</span></label>');
    row.append(this.model);
    this.refs = new ReferencePicker(engine);
    this.chips = new ReferenceChips(this.refs, this.prompt);
    this.model.addEventListener('change', () => { this.picked = true; this.refs.forFal(this.model.value === 'fal'); this.opts.forModel(this.model.value); this.keyFor(); this.paintShapes(); });
    this.improver = new PromptImprover(this.prompt, 'Richer detail');
    this.improver.view = areaView(engine, false);
    this.improver.refs = referenceViews(() => this.chips.ordered());
    this.keyButton.addEventListener('click', () => {
      const pr = this.chosenProvider();
      if (pr?.configured && !this.changing) { this.changing = true; this.keyFor(); this.keyInput.focus(); } else void this.saveKey();
    });
    this.keyRow.append(this.keyInput, this.keyButton);
    this.paintShapes();
    this.size.addEventListener('change', () => { const c = this.size.value !== 'custom'; this.cw.hidden = c; this.ch.hidden = c; });
    for (const f of [this.cw, this.ch]) f.addEventListener('change', () => { f.value = String(this.side(Number(f.value))); });
    const shape = el('<div class="cv-dialog-row"></div>');
    shape.append(this.size, this.cw, this.ch, this.target);
    const capRow = el('<label class="cv-dialog-row"><span>Working size</span></label>');
    capRow.append(this.cap);
    this.clearRow.prepend(this.clear);
    this.body.append(this.prompt, this.improver.el, row, shape, capRow, this.clearRow, this.opts.el, this.keyRow, this.refs.el, this.chips.el, this.status, this.hist, this.logBox);
    this.hist.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
      if (!b) return;
      const id = Number(b.dataset.id), k = keptResults().find((x) => x.id === id);
      if (!k) return;
      if (ev.shiftKey) { this.prompt.value = k.prompt; this.prompt.focus(); return; }
      void addKeptResult(this.engine, id).then((ok) => { setText(this.status, ok ? 'Added again as a layer.' : 'Open a picture first.'); });
    });
    this.logBox.addEventListener('click', (ev) => {
      const act = (ev.target as HTMLElement).closest<HTMLElement>('button[data-act]')?.dataset.act;
      if (act === 'clear') clearRunLog();
      else if (act === 'copy') void navigator.clipboard?.writeText(runLogText()).then(() => setText(this.status, 'The run log is copied.'), () => setText(this.status, 'The run log could not be copied.'));
    });
    onGenerationChange(() => this.paintHistory());
    this.paintHistory();
    this.button('Cancel', 'ghost', () => { this.stopped = true; this.close(); });
    this.button('Generate', 'primary', () => void this.generate());
    this.remember();   // the model chosen and the reference settings; the prompt and the key are text
  }

  async show(): Promise<void> {
    const was = this.model.value;
    const { models, providers, preferred, sizes } = await generationModels();   // the models the Generate panel offers too
    this.providers = providers;
    this.localSizes = sizes;
    fillModelPicker(this.model, models);
    // The person's choice while it stands; else the default (fal with a key, else a model on this computer). The other
    // providers are chosen, never defaults (1.58.5).
    if (this.picked && [...this.model.options].some((o) => o.value === was && !o.disabled)) this.model.value = was;
    else this.model.value = preferred;
    this.refs.refresh(this.model.value === 'fal');
    this.opts.forModel(this.model.value);
    this.keyFor();
    this.paintShapes();
    this.improver.refresh();
    setText(this.status, 'Your ComfyUI workflows are added in Edit > Generative Fill.');
    this.stopped = false;
    this.open();
    this.prompt.focus();
  }

  /** The kept results as thumbnails and the log as text, patched in place. Click a thumbnail to add it again; Shift-click to reuse its prompt. */
  private paintHistory(): void {
    const results = keptResults();
    patchList(this.hist, [...results], {
      key: (k) => String(k.id),
      create: (k) => {
        const url = URL.createObjectURL(k.blob);
        this.thumbs.set(k.id, url);
        const b = el<HTMLButtonElement>('<button type="button" class="cv-gen-thumb"><img alt=""></button>');
        b.dataset.id = String(k.id);
        (b.firstElementChild as HTMLImageElement).src = url;
        b.title = `${k.prompt}\nClick to add again; Shift-click to reuse the prompt.`;
        b.setAttribute('aria-label', `Add again: ${k.prompt}`);
        return b;
      },
      update: () => {},
    });
    for (const [id, url] of this.thumbs) if (!results.some((k) => k.id === id)) { URL.revokeObjectURL(url); this.thumbs.delete(id); }
    setHidden(this.hist, results.length === 0);
    const log = this.logBox.querySelector('pre') as HTMLElement;
    setText(log, runLogText());
    setHidden(this.logBox, generationLog().length === 0);
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

  /** One side of a custom size: a multiple of 16 from 256 to 2048, the range every local model takes. */
  private side(v: number): number { return Math.min(2048, Math.max(256, Math.round((Number.isFinite(v) ? v : 1024) / 16) * 16)); }

  /** The shape asked for: the picture's own (undefined), a preset of the model chosen, or the custom width and height. */
  private asked(): { width: number; height: number } | undefined {
    if (this.size.value === 'custom') return { width: this.side(Number(this.cw.value)), height: this.side(Number(this.ch.value)) };
    const s = this.shapes.find(([id]) => id === this.size.value);
    return s ? { width: s[2], height: s[3] } : undefined;
  }

  /** The size picker holds the picture's own size, the shapes the model chosen offers (a provider's own, a local model's
   *  catalogue) and a custom entry; options are patched by value so the picker never blinks, and what is chosen stays
   *  while the new model still offers it. */
  private paintShapes(): void {
    this.shapes = shapesFor(this.model.value, this.localSizes[this.model.value] ?? []);
    this.cap.disabled = !this.model.value.startsWith('local:');
    const was = this.size.value, items: Array<readonly [string, string]> = [['doc', 'Size: the picture\'s own'], ...this.shapes.map((s): readonly [string, string] => [s[0], s[1]]), ['custom', 'Custom width and height']];
    patchList(this.size, items, {
      key: (i) => i[0],
      create: (i) => { const o = document.createElement('option'); o.value = i[0]; o.textContent = i[1]; return o; },
      update: (o, i) => { if (o.textContent !== i[1]) setText(o, i[1]); },
    });
    this.size.value = items.some((i) => i[0] === was) ? was : 'doc';
    const c = this.size.value !== 'custom';
    if (this.cw.hidden !== c) { this.cw.hidden = c; this.ch.hidden = c; }
  }

  private async generate(): Promise<void> {
    const prompt = this.prompt.value.trim();
    if (this.busy) return;
    if (!prompt) { setText(this.status, 'Describe the image to generate.'); return; }
    this.busy = true;
    this.stopped = false;
    try {
      // The same generation the Generate panel runs; a new layer at the document's size (a new document when none is open).
      const added = await runGeneration(this.engine, { prompt, choice: this.model.value, providers: this.providers, size: this.asked(), cap: Number(this.cap.value), target: this.target.value === 'document' ? 'document' : this.target.value === 'base' ? 'base' : 'layer', transparent: this.clear.checked, references: () => this.chips.ordered(), ...this.opts.request(), onSeed: (s) => this.opts.used(s), onStop: () => { this.stopped = true; setText(this.status, 'Stopped.'); }, status: (text) => setText(this.status, text), stopped: () => this.stopped, heard: (r) => this.heard(r) });
      if (!added) return;
      this.close();
      this.toast(this.target.value === 'base' ? 'The generated image replaced the picture. Undo brings it back.' : 'The generated image was added as a layer.');
    } catch (err) {
      if (!this.stopped) setText(this.status, err instanceof ApiError || err instanceof Error ? err.message : 'Generating failed.');
    } finally { this.busy = false; }
  }
}

import { api } from './api';

/** ComfyUI workflows in formvis (1.51.2): the ones kept as choices (Generative Fill, Generate Image), the check that a
 *  workflow is in API format, running one through to its result images, and the generator Generative Fill and Expand
 *  call, so a workflow stands where the fal model does. */
export interface Recipe { name: string; json: string; builtin?: boolean; /** How @img1, @img2 are written into the prompt for this workflow: a pattern with {n}; "image {n}" when absent. */ refs?: string }
const KEY = 'formvis.comfyui.recipes', HIDDEN_KEY = 'formvis.comfyui.recipesHidden';

/** The picture names a workflow can be given for @img1, @img2 and on: pattern, example. A workflow's prompt is written for its own model. */
export const REFERENCE_NAMES: ReadonlyArray<readonly [string, string]> = [['image {n}', 'image 1, image 2'], ['Image {n}', 'Image 1, Image 2'], ['picture {n}', 'picture 1, picture 2'], ['Picture {n}', 'Picture 1, Picture 2'], ['reference {n}', 'reference 1, reference 2'], ['img{n}', 'img1, img2'], ['<image {n}>', '<image 1>, <image 2>']];
export const DEFAULT_REFERENCE_NAME = REFERENCE_NAMES[0][0];

const graph = (nodes: Array<[string, Record<string, unknown>]>): string => JSON.stringify(Object.fromEntries(nodes.map(([type, inputs], i) => [String(i + 1), { class_type: type, inputs }])));

/** Workflows that ship with formvis: ComfyUI's own nodes only and no model file, so they run on any ComfyUI. A kept workflow
 *  of the same name takes their place, and Hide takes one out of the lists until Restore. */
export const BUILTIN_RECIPES: readonly Recipe[] = [
  { name: 'Sharpen', builtin: true, json: graph([['LoadImage', { image: 'image.png' }], ['ImageSharpen', { image: ['1', 0], sharpen_radius: 2, sigma: 1, alpha: 1 }], ['SaveImage', { filename_prefix: 'formvis', images: ['2', 0] }]]) },
  { name: 'Soften', builtin: true, json: graph([['LoadImage', { image: 'image.png' }], ['ImageBlur', { image: ['1', 0], blur_radius: 3, sigma: 1 }], ['SaveImage', { filename_prefix: 'formvis', images: ['2', 0] }]]) },
];

/** The workflows kept on this device (and mirrored in the recipes folder). */
export function keptRecipes(): Recipe[] {
  try { const r = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown; return Array.isArray(r) ? r.filter((x): x is Recipe => typeof x?.name === 'string' && typeof x?.json === 'string') : []; } catch { return []; }
}

export function hiddenBuiltins(): string[] {
  try { const r = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as unknown; return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}

/** Hides the built-in recipe of this name; null brings every hidden one back. */
export function hideBuiltin(name: string | null): void {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(name === null ? [] : [...new Set([...hiddenBuiltins(), name])])); } catch { /* shown again next time */ }
}

/** The built-in recipes not hidden, then the kept ones; a kept one of a built-in's name replaces it. */
export function recipes(): Recipe[] {
  const kept = keptRecipes(), hidden = new Set(hiddenBuiltins());
  return [...BUILTIN_RECIPES.filter((b) => !hidden.has(b.name) && !kept.some((k) => k.name === b.name)), ...kept];
}

/** Why `json` cannot run as a workflow, or null when it can (saved with Export (API)). */
export function workflowProblem(json: string, file = 'That file'): string | null {
  try {
    const w = JSON.parse(json) as Record<string, unknown>;
    if (!w || typeof w !== 'object' || 'nodes' in w || !Object.values(w).length || !Object.values(w).every((n) => typeof n === 'object' && n !== null && 'class_type' in n))
      return `${file} is in ComfyUI's editor format. In ComfyUI, save it with Export (API) and choose that file.`;
    return null;
  } catch { return `${file} is not a ComfyUI workflow.`; }
}

/** A workflow in the API format: one saved with Export (API) as it is, one saved from the editor (its nodes and links) converted
 *  by the person's own ComfyUI, which supplies the widget names. Throws with a message the person can act on. */
export async function apiWorkflow(json: string, target: string, file = 'That file'): Promise<string> {
  let editor = false;
  try { const w = JSON.parse(json) as { nodes?: unknown } | null; editor = !!w && typeof w === 'object' && Array.isArray(w.nodes); } catch { /* reported below */ }
  if (!editor) return json;
  try { return await api.comfyuiConvert(target, json); } catch (err) { throw new Error(`${file} is in ComfyUI's editor format and could not be converted: ${err instanceof Error ? err.message : 'ComfyUI did not answer.'}`); }
}

/** Keeps a workflow as a choice (a same-named one is replaced); its problem, or null. */
export function addRecipe(name: string, json: string, mirror = true): string | null {
  const problem = workflowProblem(json, name);
  if (problem) return problem;
  if (json.length > 500_000) return `${name} is too large to keep (500 KB at most).`;
  const kept = name.replace(/\.json$/i, ''), was = keptRecipes().find((r) => r.name === kept);
  const list = keptRecipes().filter((r) => r.name !== kept).concat([{ name: kept, json, ...(was?.refs ? { refs: was.refs } : {}) }]);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-40))); } catch { return 'There is no room left to keep it.'; }
  if (mirror) void api.recipeFileSave(kept, json).catch(() => { /* the copy in the browser is kept */ });
  return null;
}

/** Sets how @img1, @img2 are written into the prompt for a kept workflow; false when it is not a kept one or the pattern is not offered. */
export function setRecipeRefs(name: string, refs: string): boolean {
  const list = keptRecipes(), at = list.findIndex((r) => r.name === name);
  if (at < 0 || !REFERENCE_NAMES.some(([p]) => p === refs)) return false;
  list[at] = { name, json: list[at].json, ...(refs === DEFAULT_REFERENCE_NAME ? {} : { refs }) };
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { return false; }
  return true;
}

export function removeRecipe(name: string): Recipe | null {
  const was = keptRecipes().find((r) => r.name === name) ?? null;
  try { localStorage.setItem(KEY, JSON.stringify(keptRecipes().filter((r) => r.name !== name))); } catch { /* nothing kept */ }
  void api.recipeFileDelete(name).catch(() => { /* it was not a file */ });
  return was;
}

/** Reads the data folder's recipes folder: workflows there that are not kept yet are added (the folder is where recipes live, the
 *  browser keeps a copy). Returns the folder's path and whether anything was added. */
export async function syncRecipeFolder(): Promise<{ folder: string; added: number } | null> {
  const r = await api.recipeFiles();
  if (!r) return null;
  const have = new Set(keptRecipes().map((x) => x.name)), inFolder = new Set(r.files.map((f) => f.name));
  for (const x of keptRecipes()) if (!inFolder.has(x.name)) void api.recipeFileSave(x.name, x.json).catch(() => { /* kept in the browser only */ });
  let added = 0;
  for (const f of r.files) if (!have.has(f.name) && addRecipe(f.name, f.text, false) === null) added++;
  return { folder: r.folder, added };
}

export type RecipeFamily = 'fill' | 'image' | 'text' | 'other';
export const RECIPE_FAMILIES: ReadonlyArray<readonly [RecipeFamily, string]> = [['fill', 'Fill a selection (image and mask)'], ['image', 'Picture in, picture out'], ['text', 'Text to image'], ['other', 'Other']];

/** What a kept workflow takes in, from its nodes: a Load Image (as Mask) makes it a fill, a Load Image a picture edit, a prompt node alone a text to image. */
export function recipeFamily(json: string): { family: RecipeFamily; nodes: number } {
  try {
    const nodes = Object.values(JSON.parse(json) as Record<string, { class_type?: unknown }>), types = nodes.map((n) => String(n?.class_type ?? ''));
    const family: RecipeFamily = types.includes('LoadImageMask') ? 'fill' : types.includes('LoadImage') ? 'image' : types.some((t) => /^CLIPTextEncode/.test(t)) ? 'text' : 'other';
    return { family, nodes: nodes.length };
  } catch { return { family: 'other', nodes: 0 }; }
}

export interface Run { job: string; mask: string | null; prompt: boolean }

let runCount = 0;
/** Counts a run sent to ComfyUI in this session; its number shows beside the API timer. */
export function countRun(): number { return ++runCount; }

/** A job's state in words with its API timer: queue place, or step value of max with the percent, the seconds since it was sent, and the run's number. */
export function jobWords(s: { state: string; ahead?: number; progress?: { value: number; max: number } }, sentAt: number, run: number): string {
  const secs = Math.max(0, Math.round((Date.now() - sentAt) / 1000)), tail = ` · ${secs} s · run ${run}`;
  if (s.state === 'queued') return `Queued in ComfyUI${s.ahead ? `, ${s.ahead} ahead` : ''}${tail}`;
  const p = s.progress;
  return p && p.max > 0 ? `Running in ComfyUI, step ${p.value} of ${p.max} (${Math.round((100 * p.value) / p.max)}%)${tail}` : `Running in ComfyUI...${tail}`;
}

/** Queues `json` with `parts` (the image, then any mask) and follows it once a second until it ends; the result
 *  images. `status` hears each state; `cancelled` stops following (and the job is cancelled in ComfyUI). */
export async function runToResults(target: string, json: string, items: unknown[], parts: Array<{ name: string; blob: Blob }>, prompt: string | null,
  status: (text: string, run: Run) => void = () => {}, cancelled: () => boolean = () => false): Promise<Blob[]> {
  const sentAt = Date.now(), n = countRun();
  const r = await api.comfyuiRun(target, json, items, parts, prompt);
  for (let waited = 0; waited < 3600; waited++) {
    await new Promise((ok) => setTimeout(ok, 1000));
    if (cancelled()) { await api.comfyuiCancel(r.job, target); throw new Error('Cancelled.'); }
    const s = await api.comfyuiJob(r.job, target);
    if (s.state === 'queued' || s.state === 'running') status(`${jobWords(s, sentAt, n)}.`, r);
    else if (s.state === 'failed') throw new Error(s.detail ?? 'ComfyUI stopped the workflow with an error.');
    else {
      if (!s.images?.length) throw new Error('The workflow finished without saving an image (it needs a Save Image node).');
      return Promise.all(s.images.map((im) => api.comfyuiImage(target, im.filename, im.subfolder)));
    }
  }
  await api.comfyuiCancel(r.job, target);
  throw new Error('The workflow ran for an hour without finishing, and was stopped.');
}

/** A generator for Generative Fill and Expand: the workflow run on the cropped image and its mask (white where it
 *  fills), its first result returned. */
export function comfyGenerator(target: string, recipe: Recipe, prompt: string, refs: Array<{ name: string; blob: Blob }> = [], cancelled?: () => boolean): (image: Blob, mask: Blob) => Promise<Blob> {
  return async (image, mask) => (await runToResults(target, recipe.json, [{ name: 'formvis fill', kind: 'image' }, { name: 'formvis fill mask', kind: 'mask', maskOf: 0 }, ...refs.map((r) => ({ name: r.name, kind: 'reference' }))],
    [{ name: 'image.png', blob: image }, { name: 'mask.png', blob: mask }, ...refs.map((r, i) => ({ name: `ref${i}.png`, blob: r.blob }))], prompt, undefined, cancelled))[0];
}

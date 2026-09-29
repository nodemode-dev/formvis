import { api } from './api';

/** ComfyUI workflows in formvis (1.51.2): the ones kept as choices (Generative Fill, Generate Image), the check that a
 *  workflow is in API format, running one through to its result images, and the generator Generative Fill and Expand
 *  call, so a workflow stands where the fal model does. */
export interface Recipe { name: string; json: string }
const KEY = 'formvis.comfyui.recipes';

export function recipes(): Recipe[] {
  try { const r = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown; return Array.isArray(r) ? r.filter((x): x is Recipe => typeof x?.name === 'string' && typeof x?.json === 'string') : []; } catch { return []; }
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

/** Keeps a workflow as a choice (a same-named one is replaced); its problem, or null. */
export function addRecipe(name: string, json: string): string | null {
  const problem = workflowProblem(json, name);
  if (problem) return problem;
  if (json.length > 500_000) return `${name} is too large to keep (500 KB at most).`;
  const list = recipes().filter((r) => r.name !== name).concat([{ name: name.replace(/\.json$/i, ''), json }]);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-40))); } catch { return 'There is no room left to keep it.'; }
  return null;
}

export function removeRecipe(name: string): void {
  try { localStorage.setItem(KEY, JSON.stringify(recipes().filter((r) => r.name !== name))); } catch { /* nothing kept */ }
}

export interface Run { job: string; mask: string | null; prompt: boolean }

/** Queues `json` with `parts` (the image, then any mask) and follows it once a second until it ends; the result
 *  images. `status` hears each state; `cancelled` stops following (and the job is cancelled in ComfyUI). */
export async function runToResults(target: string, json: string, items: unknown[], parts: Array<{ name: string; blob: Blob }>, prompt: string | null,
  status: (text: string, run: Run) => void = () => {}, cancelled: () => boolean = () => false): Promise<Blob[]> {
  const r = await api.comfyuiRun(target, json, items, parts, prompt);
  for (let waited = 0; waited < 3600; waited++) {
    await new Promise((ok) => setTimeout(ok, 1000));
    if (cancelled()) { await api.comfyuiCancel(r.job, target); throw new Error('Cancelled.'); }
    const s = await api.comfyuiJob(r.job, target);
    if (s.state === 'queued') status(`Queued in ComfyUI${s.ahead ? `, ${s.ahead} ahead` : ''}.`, r);
    else if (s.state === 'running') status('Running in ComfyUI...', r);
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
export function comfyGenerator(target: string, recipe: Recipe, prompt: string): (image: Blob, mask: Blob) => Promise<Blob> {
  return async (image, mask) => (await runToResults(target, recipe.json, [{ name: 'formvis fill', kind: 'image' }, { name: 'formvis fill mask', kind: 'mask', maskOf: 0 }],
    [{ name: 'image.png', blob: image }, { name: 'mask.png', blob: mask }], prompt))[0];
}

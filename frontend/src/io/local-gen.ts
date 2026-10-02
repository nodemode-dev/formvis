/** Local image generation in the window (1.52.9): the engine's local models (Krea 2 Turbo, FLUX.2 [klein] 4B, their
 *  checkpoints, local ONNX folders), a job run to its pictures (progress polled, Cancel stopping it in the engine),
 *  each picture fetched and the engine's copy removed, and the generator Generative Fill and Expand call. */
export interface LocalModel { id: string; label: string; ready: boolean; reason: string | null; fromPicture: boolean; influence: number }
export interface LocalResult { pictures: Blob[]; notes: string[]; notice?: string; warning?: string }

async function ask(path: string, init?: RequestInit): Promise<Response> {
  let r: Response;
  try { r = await fetch(`/api${path}`, init); } catch { throw new Error('The formvis engine is not reachable. Start it with ./formvis boot.'); }
  if (!r.ok) { let d = r.statusText; try { const j = await r.json() as { detail?: unknown }; if (typeof j.detail === 'string') d = j.detail; } catch { /* the status */ } throw new Error(d); }
  return r;
}

export async function localModels(): Promise<LocalModel[]> {
  try {
    const { generators } = await (await ask('/generate')).json() as { generators: Array<{ id: string; label: string; kind: string; ready: boolean; reason?: string; options?: { image?: number } }> };
    return generators.filter((g) => g.id.startsWith('local:') && g.kind === 'image')
      .map((g) => ({ id: g.id, label: g.label, ready: g.ready, reason: g.reason ?? null, fromPicture: typeof g.options?.image === 'number', influence: g.options?.image ?? 0.4 }));
  } catch { return []; }
}

const b64 = async (blob: Blob): Promise<string> => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** One job, to its pictures. `status` hears its progress; `cancelled` stops it in the engine. */
export async function runLocal(body: Record<string, unknown>, status: (text: string) => void = () => {}, cancelled: () => boolean = () => false): Promise<LocalResult> {
  const { job_id: id } = await (await ask('/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-formvis-local': '1' }, body: JSON.stringify(body) })).json() as { job_id: string };
  return followJob(id, status, cancelled);
}

/** A job followed to its pictures: progress heard, Cancel stopping it in the engine, each picture fetched and the
 *  engine's copy removed (generation and upscaling alike). */
async function followJob(id: string, status: (text: string) => void, cancelled: () => boolean): Promise<LocalResult> {
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 700));
    if (cancelled()) { try { await ask(`/jobs/${id}`, { method: 'DELETE' }); } catch { /* ended */ } throw new Error('Cancelled.'); }
    const j = await (await ask(`/jobs/${id}`)).json() as { status: string; progress?: number; message?: string; error?: string; result?: { media: Array<{ url: string }>; notes?: string[]; notice?: string; warning?: string } };
    if (j.status === 'done' && j.result) {
      const pictures: Blob[] = [];
      for (const m of j.result.media) { pictures.push(await (await ask(m.url.replace(/^\/api/, ''))).blob()); void ask(m.url.replace(/^\/api/, ''), { method: 'DELETE' }).catch(() => undefined); }
      if (!pictures.length) throw new Error(j.result.notes?.join(' ') || 'The model made no picture.');
      return { pictures, notes: j.result.notes ?? [], notice: j.result.notice, warning: j.result.warning };
    }
    if (j.status === 'error' || j.status === 'failed' || j.status === 'cancelled') throw new Error(j.error || j.message || 'The local model stopped.');
    status(`${j.message ?? 'Generating on this computer'}${typeof j.progress === 'number' ? ` (${Math.round(j.progress * 100)}%)` : ''}`);
  }
}

/** Generative Fill's and Expand's generator on a local model: the area the fill covers sent as the picture to start
 *  from, at `influence` (how much it shapes the result); formvis then masks the result to the selection. */
export function localFill(model: string, prompt: string, influence: number, heard: (r: LocalResult) => void, status?: (text: string) => void): (image: Blob, mask: Blob) => Promise<Blob> {
  return async (image) => {
    const r = await runLocal({ generator: model, prompt: prompt.trim() || 'the surrounding scene, continued seamlessly', size: 'source', count: 1, options: { image: { png: await b64(image) }, imageStrength: influence } }, status);
    heard(r);
    return r.pictures[0];
  };
}

/** Whether a downloadable model is on this computer: 'ai-upscale' (Real-ESRGAN, 1.53.1), 'lama-inpaint' (LaMa, 1.53.2). */
export async function modelReady(id: string): Promise<boolean> {
  try { const m = await (await ask('/models')).json() as Array<{ id: string; ready: boolean }>; return !!m.find((x) => x.id === id)?.ready; } catch { return false; }
}
export const upscalerReady = (): Promise<boolean> => modelReady('ai-upscale');
export const depthReady = (): Promise<boolean> => modelReady('depth-anything-v2-small');
export const colorizeReady = (): Promise<boolean> => modelReady('ddcolor-tiny');
export const styleReady = (): Promise<boolean> => modelReady('fast-style');
export const faceReady = (): Promise<boolean> => modelReady('yunet-face');
export const skyReady = (): Promise<boolean> => modelReady('skyseg');

/** Select > Sky (1.57.6): the sky in `image` as a soft white-on-black mask the same size, from the engine's model. */
export async function skyMask(image: Blob): Promise<Blob> {
  const form = new FormData(); form.append('image', image, 'image.png');
  return (await ask('/sky/mask', { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).blob();
}

/** Faces for Face-Aware Liquify (1.56.7): each face's box and five landmarks, largest first, from the engine's YuNet. */
export async function findFaces(image: Blob): Promise<import('../engine/face-liquify').Face[]> {
  const form = new FormData(); form.append('image', image, 'image.png');
  return ((await (await ask('/face/landmarks', { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).json()) as { faces: import('../engine/face-liquify').Face[] }).faces;
}

/** Style Transfer presets (1.55.1): the ONNX model zoo's fast neural style models on this computer. */
export async function localStyle(image: Blob, style: string): Promise<Blob> {
  const form = new FormData(); form.append('image', image, 'image.png'); form.append('style', style);
  return (await ask('/style/local', { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).blob();
}

/** Colour for a black-and-white picture (1.54.9, Neural Filters' Colorize): DDColor-tiny on this computer; the
 *  picture's own luminance kept, its colour predicted. */
export async function localColorize(image: Blob): Promise<Blob> {
  const form = new FormData(); form.append('image', image, 'image.png');
  return (await ask('/colorize/local', { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).blob();
}

/** Depth from one picture (1.54.8, Neural Filters' Depth Blur): Depth Anything V2 Small on this computer, an 8-bit
 *  map with near bright and far dark, the picture's size. */
export async function localDepth(image: Blob): Promise<Blob> {
  const form = new FormData(); form.append('image', image, 'image.png');
  return (await ask('/depth/local', { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).blob();
}

/** Remove's People and Distractions (1.57.4): the area to remove from `image`, a white-on-black mask the same size. */
export async function findToRemove(image: Blob, kind: 'people' | 'distractions'): Promise<Blob> {
  const form = new FormData(); form.append('image', image, 'image.png'); form.append('kind', kind);
  return (await ask('/remove/find', { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).blob();
}

/** Generative Fill's and Expand's generator on LaMa (1.53.2): any computer's CPU, no prompt, no key. */
export function localInpaint(): (image: Blob, mask: Blob) => Promise<Blob> {
  return async (image, mask) => {
    const form = new FormData(); form.append('image', image, 'image.png'); form.append('mask', mask, 'mask.png');
    return (await ask('/inpaint/local', { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).blob();
  };
}

/** Image > Upscale's generator on this computer (1.53.1): Real-ESRGAN, the picture enlarged `scale` times. */
export function localUpscale(scale: number, status?: (text: string) => void): (image: Blob) => Promise<Blob> {
  return async (image) => {
    const form = new FormData(); form.append('file', image, 'picture.png'); form.append('factor', String(scale));
    const { job_id: id } = await (await ask('/upscale/local', { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).json() as { job_id: string };
    return (await followJob(id, status ?? (() => {}), () => false)).pictures[0];
  };
}

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

export async function installModel(id: string, status: (text: string) => void): Promise<boolean> {
  const job = (await (await ask(`/models/${id}/download`, { method: 'POST' })).json() as { job_id: string }).job_id;
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 800));
    const j = await (await ask(`/jobs/${job}`)).json() as { status: string; message?: string; error?: string; progress?: number };
    if (j.status === 'done') return true;
    if (['error', 'failed', 'cancelled'].includes(j.status)) { status(j.error || j.message || 'The download stopped.'); return false; }
    status(`${j.message ?? 'Downloading'}${typeof j.progress === 'number' ? ` (${Math.round(j.progress * 100)}%)` : ''}`);
  }
}

export interface RelightEngines { marigold: boolean; marigoldModels: boolean; marigoldRuntime: boolean; classic: boolean; regions: 'parts' | 'colour'; faces: boolean; license: string; downloadGB: number }
export interface LightSplit {
  engine: 'marigold' | 'classic'; width: number; height: number; albedo: Uint8ClampedArray; shading: Float32Array; residual: Float32Array; normals: Float32Array | null;
  depth: Float32Array | null; mask: Uint8Array | null; level: number | null; geometry: string | null;
}

export async function relightEngines(): Promise<RelightEngines | null> {
  try { return await (await ask('/relight/engines')).json() as RelightEngines; } catch { return null; }
}

function halfToFloat(src: Uint16Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const h = src[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    out[i] = e === 0 ? s * f * 2 ** -24 : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * 2 ** (e - 15);
  }
  return out;
}

export async function relightSplit(image: Blob, width: number, height: number, engine: 'auto' | 'marigold' | 'classic'): Promise<LightSplit> {
  const form = new FormData(); form.append('image', image, 'image.png');
  const buf = await (await ask(`/relight/split?engine=${engine}&width=${width}&height=${height}`, { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form })).arrayBuffer();
  const headLen = new DataView(buf).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen))) as { engine: 'marigold' | 'classic'; width: number; height: number; normals: boolean; scene?: boolean; level?: number | null; geometry?: string | null };
  const n = head.width * head.height;
  let at = 4 + headLen;
  const rgb = new Uint8Array(buf, at, n * 3); at += n * 3;
  const half = (count: number): Float32Array => { const copy = new Uint16Array(buf.slice(at, at + count * 2)); at += count * 2; return halfToFloat(copy); };
  const shading = half(n * 3), residual = half(n * 3), normals = head.normals ? half(n * 3) : null;
  const depth = head.scene ? half(n) : null, mask = head.scene ? new Uint8Array(buf.slice(at, at + n)) : null;
  const albedo = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { albedo[i * 4] = rgb[i * 3]; albedo[i * 4 + 1] = rgb[i * 3 + 1]; albedo[i * 4 + 2] = rgb[i * 3 + 2]; albedo[i * 4 + 3] = 255; }
  return { engine: head.engine, width: head.width, height: head.height, albedo, shading, residual, normals, depth, mask, level: head.level ?? null, geometry: head.geometry ?? null };
}

export async function localDepthValues(image: Blob, width: number, height: number): Promise<Float32Array> {
  const form = new FormData(); form.append('image', image, 'image.png');
  const r = await ask(`/depth/local?fmt=f32&width=${width}&height=${height}`, { method: 'POST', headers: { 'x-formvis-local': '1' }, body: form });
  const data = new Float32Array(await r.arrayBuffer());
  if (data.length !== width * height) throw new Error('The depth did not match the picture.');
  return data;
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

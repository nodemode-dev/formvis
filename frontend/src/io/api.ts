export interface Capabilities {
  name: string;
  version: string;
  desktop: boolean;
  decode: { heic: boolean; tiff: boolean; engine: string; raw?: boolean; rawEngine?: string };
  removeBackground: { ml: boolean; lite: boolean; default: 'ml' | 'lite' | null; model: string };
  dataDir: string;
}
export interface LibraryItem { name: string; modified: number; size: number }
export interface OpenedProject { session: string; name: string; manifest: Record<string, unknown>; images: Record<string, string> }
export interface FilePart { name: string; blob: Blob }
export interface GenerativeStatus { configured: boolean; source: 'environment' | 'settings' | null; fillModel: string; eraseModel: string; upscaleModel: string }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await fetch(`/api${path}`, init); } catch {
    throw new ApiError('The formvis engine is not reachable. Start it with ./formvis boot.', 0);
  }
  if (!res.ok) {
    let detail = res.statusText || `Request failed (${res.status})`;
    try { const j = (await res.json()) as { detail?: unknown }; if (typeof j.detail === 'string') detail = j.detail; } catch { detail = res.statusText || detail; }
    throw new ApiError(detail, res.status);
  }
  return res;
}

function form(fields: Record<string, string>, files: FilePart[] = [], key = 'files'): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const part of files) f.append(key, part.blob, part.name);
  return f;
}

export const api = {
  async capabilities(): Promise<Capabilities | null> {
    try { return (await (await request('/capabilities')).json()) as Capabilities; } catch { return null; }
  },
  /** Tell the engine which compute device to use (Phase 18.6); its report of what it uses and why, or null offline. */
  /** The assistant (1.52.2): one step of the conversation; the model's text and its tool calls. */
  async assistantStep(messages: unknown[], tools = true): Promise<{ content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> }> {
    return (await (await request('/llm/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, tools }) })).json()) as { content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> };
  },

  /** Prompt improvement (1.51.5): the language model's settings (never its key), its models, and a rewrite. */
  async llmStatus(): Promise<{ configured: boolean; baseUrl: string; model: string; hasKey: boolean } | null> {
    try { return (await (await request('/llm/status')).json()) as { configured: boolean; baseUrl: string; model: string; hasKey: boolean }; } catch { return null; }
  },
  async llmSave(baseUrl: string, model: string, key: string | null, forgetKey = false): Promise<{ configured: boolean; baseUrl: string; model: string; hasKey: boolean }> {
    return (await (await request('/llm/settings', { method: 'POST', body: form({ base_url: baseUrl, model, ...(key ? { key } : {}), ...(forgetKey ? { forget_key: 'true' } : {}) }) })).json()) as { configured: boolean; baseUrl: string; model: string; hasKey: boolean };
  },
  async llmModels(): Promise<string[]> { return ((await (await request('/llm/models')).json()) as { models: string[] }).models; },
  async improvePrompt(prompt: string, instructions: string): Promise<string> {
    return ((await (await request('/llm/improve', { method: 'POST', body: form({ prompt, instructions }) })).json()) as { prompt: string }).prompt;
  },

  /** Edit > Generate Image (1.51.2): a picture from a prompt alone through fal, near the document's shape. */
  async generateImage(prompt: string, width: number, height: number): Promise<Blob> {
    return (await request('/generative/generate', { method: 'POST', body: form({ prompt, width: String(width), height: String(height) }) })).blob();
  },

  /** Run ComfyUI Workflow (1.51.1): uploads the inputs, fills the workflow and queues it. */
  async comfyuiRun(target: string, workflow: string, items: unknown[], parts: FilePart[], prompt: string | null): Promise<{ job: string; references: number; image: string | null; mask: string | null; prompt: boolean }> {
    const res = await request('/comfyui/run', { method: 'POST', body: form({ target, workflow, items: JSON.stringify(items), ...(prompt !== null ? { prompt } : {}) }, parts) });
    return (await res.json()) as { job: string; references: number; image: string | null; mask: string | null; prompt: boolean };
  },
  async comfyuiJob(job: string, target: string): Promise<{ state: 'queued' | 'running' | 'done' | 'failed'; ahead?: number; images?: Array<{ filename: string; subfolder: string }>; detail?: string }> {
    return (await (await request(`/comfyui/job/${encodeURIComponent(job)}?target=${encodeURIComponent(target)}`)).json()) as { state: 'queued' | 'running' | 'done' | 'failed'; ahead?: number; images?: Array<{ filename: string; subfolder: string }>; detail?: string };
  },
  async comfyuiImage(target: string, filename: string, subfolder: string): Promise<Blob> {
    return (await request(`/comfyui/image?target=${encodeURIComponent(target)}&filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}`)).blob();
  },
  async comfyuiCancel(job: string, target: string): Promise<void> {
    try { await request(`/comfyui/cancel/${encodeURIComponent(job)}`, { method: 'POST', body: form({ target }) }); } catch { /* it may have finished */ }
  },

  /** Send to ComfyUI (1.50.9): whether ComfyUI answers at `target`, and its version. */
  async comfyuiStatus(target: string): Promise<{ running: boolean; version?: string; detail?: string } | null> {
    try { return (await (await request(`/comfyui/status?target=${encodeURIComponent(target)}`)).json()) as { running: boolean; version?: string; detail?: string }; } catch { return null; }
  },

  /** Uploads `parts` into ComfyUI's input folder through the engine; the names its Load Image lists. */
  async sendToComfyUI(target: string, items: unknown[], parts: FilePart[]): Promise<{ files: Array<{ name: string; kind: string }> }> {
    const res = await request('/comfyui/send', { method: 'POST', body: form({ target, items: JSON.stringify(items) }, parts) });
    return (await res.json()) as { files: Array<{ name: string; kind: string }> };
  },

  /** Send to NodeMode (1.50.8): whether NodeMode answers at `target` and has formvis's receiver. */
  async nodemodeStatus(target: string): Promise<{ running: boolean; receiver: boolean; detail?: string } | null> {
    try { return (await (await request(`/nodemode/status?target=${encodeURIComponent(target)}`)).json()) as { running: boolean; receiver: boolean; detail?: string }; } catch { return null; }
  },

  /** Uploads `parts` to NodeMode through the engine and announces them; throws ApiError with NodeMode's reason. */
  async sendToNodeMode(target: string, title: string, items: unknown[], parts: FilePart[]): Promise<{ placed: boolean; detail?: string; files: Array<{ url: string }> }> {
    const res = await request('/nodemode/send', { method: 'POST', body: form({ target, title, items: JSON.stringify(items) }, parts) });
    return (await res.json()) as { placed: boolean; detail?: string; files: Array<{ url: string }> };
  },

  async setCompute(device: string): Promise<{ device: string; label: string; reason: string } | null> {
    try {
      return (await (await request('/compute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device }) })).json()) as { device: string; label: string; reason: string };
    } catch { return null; }
  },
  async generativeStatus(): Promise<GenerativeStatus | null> {
    try { return (await (await request('/generative/status')).json()) as GenerativeStatus; } catch { return null; }
  },
  async saveGenerativeKey(key: string): Promise<GenerativeStatus> {
    return (await (await request('/generative/key', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })).json()) as GenerativeStatus;
  },
  async forgetGenerativeKey(): Promise<GenerativeStatus> {
    return (await (await request('/generative/key', { method: 'DELETE' })).json()) as GenerativeStatus;
  },
  /** The filled image for `image` with white in `mask` marking what to fill; an empty prompt removes. */
  async generativeFill(image: Blob, mask: Blob, prompt: string): Promise<Blob> {
    const f = new FormData();
    f.append('image', image, 'image.png');
    f.append('mask', mask, 'mask.png');
    f.append('prompt', prompt);
    return (await request('/generative/fill', { method: 'POST', body: f })).blob();
  },
  /** `image` upscaled 2 or 4 times. */
  async upscale(image: Blob, scale: number): Promise<Blob> {
    const f = new FormData();
    f.append('image', image, 'image.png');
    f.append('scale', String(scale));
    return (await request('/generative/upscale', { method: 'POST', body: f })).blob();
  },
  async decode(file: Blob, name: string): Promise<Blob> {
    return (await request('/io/decode', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).blob();
  },
  async library(): Promise<LibraryItem[]> {
    return (await (await request('/projects')).json()) as LibraryItem[];
  },
  async save(name: string, manifest: object, files: FilePart[]): Promise<{ name: string; path: string }> {
    return (await (await request('/projects/save', { method: 'POST', body: form({ name, manifest: JSON.stringify(manifest) }, files) })).json()) as { name: string; path: string };
  },
  async package(manifest: object, files: FilePart[], root = ''): Promise<Blob> {
    return (await request('/projects/package', { method: 'POST', body: form({ manifest: JSON.stringify(manifest), ...(root ? { root } : {}) }, files) })).blob();
  },
  async openLibrary(name: string): Promise<OpenedProject> {
    return (await (await request(`/projects/library/${encodeURIComponent(name)}`)).json()) as OpenedProject;
  },
  async deleteLibrary(name: string): Promise<void> {
    await request(`/projects/library/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },
  async importProject(files: File[], paths: string[] = []): Promise<OpenedProject> {
    const f = new FormData();
    files.forEach((file, i) => { f.append('files', file, file.name); if (paths.length) f.append('paths', paths[i] ?? file.name); });
    return (await (await request('/projects/import', { method: 'POST', body: f })).json()) as OpenedProject;
  },
  async fetchAsset(url: string): Promise<Blob> {
    return (await request(url.replace(/^\/api/, ''))).blob();
  },
  async removeBackground(image: Blob, method: 'auto' | 'ml' | 'lite'): Promise<{ mask: Blob; method: string }> {
    const res = await request('/ops/remove-background', { method: 'POST', body: form({ method }, [{ name: 'layer.png', blob: image }], 'file') });
    return { mask: await res.blob(), method: res.headers.get('X-Method') ?? method };
  },
  /** Click-to-select (SAM 2.1): the object at `points` ([x, y, 1] on it, [x, y, 0] not) in the image under `key`. The image
   *  is sent only when `withImage` asks for it or the engine answers 409 (it no longer holds the key), then once more
   *  with it; `image` makes the pixels only when they are needed. */
  async selectObject(key: string, points: Array<[number, number, 0 | 1]>, image: () => Promise<Blob>, withImage: boolean, box: [number, number, number, number] | null = null): Promise<Blob> {
    const send = async (img: Blob | null): Promise<Blob> => {
      const body = form({ key, points: JSON.stringify(points), ...(box ? { box: JSON.stringify(box) } : {}) }, img ? [{ name: 'image.png', blob: img }] : [], 'file');
      return (await request('/ops/select-object', { method: 'POST', body })).blob();
    };
    if (withImage) return send(await image());
    try { return await send(null); } catch (err) {
      if (err instanceof ApiError && err.status === 409) return send(await image());
      throw err;
    }
  },
  async encode(png: Blob, format: 'tiff' | 'pdf' | 'webp' | 'avif', quality = 90, dpi = 72, icc: Uint8Array | null = null): Promise<Blob> {
    const body = form({ format, quality: String(quality), dpi: String(dpi) }, [{ name: 'image.png', blob: png }], 'file');
    if (icc) body.append('icc', new Blob([icc as Uint8Array<ArrayBuffer>], { type: 'application/vnd.iccprofile' }), 'profile.icc');
    return (await request('/io/encode', { method: 'POST', body })).blob();
  },
  async exportFile(blob: Blob, name: string): Promise<string> {
    return ((await (await request('/io/export', { method: 'POST', body: form({ name }, [{ name, blob }], 'file') })).json()) as { path: string }).path;
  },
};

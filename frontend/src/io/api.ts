import { lutFrom, lut4From, lut3x4From, type ColourLut, type Lut4, type Lut3x4 } from '../engine/colour-lut';
export interface Capabilities { pixelBudget?: number; memory?: number;
  name: string; version: string;
  desktop: boolean;
  decode: { heic: boolean; tiff: boolean; engine: string; raw?: boolean; rawEngine?: string };
  removeBackground: { ml: boolean; lite: boolean; default: 'ml' | 'lite' | null; model: string };
  dataDir: string;
}
export interface LibraryItem { name: string; modified: number; size: number }
export interface OpenedProject { session: string; name: string; manifest: Record<string, unknown>; images: Record<string, string>; version?: string }
/** The library's folder (1.58.8, L13): where it is, the default, whether it is fixed by the engine's environment, and
 *  the synced folders found on this computer with a Formvis folder suggested in each. */
export interface LibraryFolder { folder: string; default: string; custom: boolean; fixed: boolean; synced: Array<{ label: string; base: string; suggested: string }> }
export interface FilePart { name: string; blob: Blob }
export interface GenerativeStatus { configured: boolean; source: 'environment' | 'settings' | null; fillModel: string; eraseModel: string; upscaleModel: string }
/** A generation provider beside fal (1.58.4, L7): OpenAI, Google, Black Forest Labs or Ideogram. */
export interface ProviderStatus { id: string; name: string; model: string; fill: boolean; configured: boolean; source: 'environment' | 'settings' | null }

export interface ProfileInfo { name: string; space: string; tac: number | null; blackLimit: number | null; blackAtMid: number | null; generation: string | null }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await fetch(`/api${path}`, init); } catch {
    throw new ApiError('The formvis engine is not reachable. Start it with ./formvis boot.', 0);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch { /* the body was not JSON */ }
    throw new ApiError(detail || res.statusText || `Request failed (${res.status})`, res.status);
  }
  return res;
}

/** A CMYK PSD as the engine reads it (1.56.1): each layer's place, look and C, M, Y, K and alpha bytes. */
export interface CmykPsd { width: number; height: number; icc: Uint8Array | null; layers: Array<{ name: string; left: number; top: number; width: number; height: number; opacity: number; visible: boolean; blend: string; ink: Uint8Array }> }

function form(fields: Record<string, string>, files: FilePart[] = [], key = 'files'): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  for (const part of files) body.append(key, part.blob, part.name);
  return body;
}

/** The window's terminals and Claude Code (DEV_PLAN 28.5): the engine's PTY sessions, and the agent's status and messages. */
export interface TerminalInfo { id: string; title: string; cwd: string; alive: boolean; kind: 'shell' | 'agent' }
export type AgentMode = 'ask' | 'auto-edits' | 'plan';
export interface ClaudeStatus { installed: boolean; path: string | null; version: string | null; signedIn: boolean | null; install: string; running: boolean; state: string; mode: AgentMode; session: string | null; modes: AgentMode[] }
export type AgentEvent =
  | { type: 'state'; running: boolean; state: string; mode: AgentMode; session: string | null }
  | { type: 'user'; text: string }
  | { type: 'block'; id: string; kind: 'text' | 'thinking' }
  | { type: 'delta'; id: string; text: string }
  | { type: 'tool'; id: string; name: string; summary: string }
  | { type: 'tool_result'; id: string; text: string; error: boolean }
  | { type: 'permission'; id: string; tool: string; summary: string }
  | { type: 'permission_done'; id: string; allowed: boolean }
  | { type: 'result'; ok: boolean; text: string; costUsd: number | null }
  | { type: 'notice'; text: string };

/** A WebSocket to one of the engine's streams: same origin in the app and through the dev server's proxy. */
export function socketTo(path: string): WebSocket {
  return new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api${path}`);
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const api = {
  /** Content-Aware Scale (1.55.4, M4): the layer's PNG, a target size, skin protection and an optional protect mask
   *  PNG (white protects) go to the engine's seam carver; the carved PNG comes back. */
  async contentAwareScale(image: Blob, width: number, height: number, skin: boolean, mask: Blob | null): Promise<Blob> {
    const body = form({ width: String(width), height: String(height), skin: skin ? 'true' : 'false' }, [{ name: 'layer.png', blob: image }], 'file');
    if (mask) body.append('mask', mask, 'mask.png');
    return (await request('/seam/content-aware-scale', { method: 'POST', body })).blob();
  },
  async capabilities(): Promise<Capabilities | null> {
    try { return (await (await request('/capabilities')).json()) as Capabilities; } catch { return null; }
  },
  /** Tell the engine which compute device to use (Phase 18.6); its report of what it uses and why, or null offline. */
  /** Large pictures (1.52.7): kept by the engine, then opened reduced, as a region or as tiles. */
  async largeKeep(file: Blob, name: string): Promise<{ id: string; width: number; height: number; memory: number }> {
    return (await (await request('/large', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).json()) as { id: string; width: number; height: number; memory: number };
  },
  async largeReduced(id: string, maxSide: number): Promise<Blob> { return (await request(`/large/${id}/reduced?max_side=${maxSide}`)).blob(); },
  async largeRegion(id: string, x: number, y: number, w: number, h: number): Promise<Blob> { return (await request(`/large/${id}/region?x=${x}&y=${y}&w=${w}&h=${h}`)).blob(); },
  async largeTiles(id: string, size: number): Promise<Array<{ row: number; col: number; x: number; y: number; width: number; height: number }>> { return (await (await request(`/large/${id}/tiles?size=${size}`)).json()) as Array<{ row: number; col: number; x: number; y: number; width: number; height: number }>; },
  async largeAssemble(name: string, width: number, height: number, places: Array<{ x: number; y: number }>, parts: FilePart[]): Promise<{ file: string; url: string; bytes: number }> {
    return (await (await request('/large/assemble', { method: 'POST', body: form({ name, width: String(width), height: String(height), places: JSON.stringify(places) }, parts) })).json()) as { file: string; url: string; bytes: number };
  },
  async largeForget(id: string): Promise<void> { try { await request(`/large/${id}`, { method: 'DELETE' }); } catch { /* gone */ } },

  /** Plugins (1.52.6): the plugins folder's files. */
  async plugins(): Promise<Array<{ name: string; size: number }>> { try { return (await (await request('/plugins')).json()) as Array<{ name: string; size: number }>; } catch { return []; } },
  async pluginCode(name: string): Promise<string> { return (await request(`/plugins/${encodeURIComponent(name)}`)).text(); },
  async addPlugin(name: string, code: string): Promise<void> { await request(`/plugins/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'text/javascript' }, body: code }); },
  async removePlugin(name: string): Promise<void> { await request(`/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' }); },

  /** The assistant (1.52.2): one step of the conversation; the model's text and its tool calls. */
  async assistantStep(messages: unknown[], tools = true): Promise<{ content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> }> {
    return (await (await request('/llm/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, tools }) })).json()) as { content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> };
  },

  /** Prompt improvement (1.51.5): the language model's settings (never its key), its models, and a rewrite. */
  async llmStatus(): Promise<{ configured: boolean; baseUrl: string; model: string; hasKey: boolean; store: 'system' | 'file' } | null> {
    try { return (await (await request('/llm/status')).json()) as { configured: boolean; baseUrl: string; model: string; hasKey: boolean; store: 'system' | 'file' }; } catch { return null; }
  },
  async llmSave(baseUrl: string, model: string, key: string | null, forgetKey = false): Promise<{ configured: boolean; baseUrl: string; model: string; hasKey: boolean }> {
    return (await (await request('/llm/settings', { method: 'POST', body: form({ base_url: baseUrl, model, ...(key ? { key } : {}), ...(forgetKey ? { forget_key: 'true' } : {}) }) })).json()) as { configured: boolean; baseUrl: string; model: string; hasKey: boolean };
  },
  async llmModels(): Promise<string[]> { return ((await (await request('/llm/models')).json()) as { models: string[] }).models; },
  async improvePrompt(prompt: string, instructions: string): Promise<string> {
    return ((await (await request('/llm/improve', { method: 'POST', body: form({ prompt, instructions }) })).json()) as { prompt: string }).prompt;
  },

  /** Edit > Generate Image (1.51.2): a picture from a prompt alone through fal, or (1.58.4) through another provider,
   *  near the document's shape. */
  async generateImage(prompt: string, width: number, height: number, provider = 'fal'): Promise<Blob> {
    return (await request('/generative/generate', { method: 'POST', body: form({ prompt, width: String(width), height: String(height), provider }) })).blob();
  },
  /** The providers beside fal (1.58.4, L7): which have keys, never the keys themselves. */
  async providers(): Promise<ProviderStatus[]> {
    try { return (await (await request('/generative/providers')).json()) as ProviderStatus[]; } catch { return []; }
  },
  /** A provider's key, kept in the system's password store by the engine. */
  async saveProviderKey(id: string, key: string): Promise<ProviderStatus[]> {
    return (await (await request(`/generative/providers/${id}/key`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })).json()) as ProviderStatus[];
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
  async decode(file: Blob, name: string, page = 0, cameraProfile?: string): Promise<Blob> {
    return (await request('/io/decode', { method: 'POST', body: form({ ...(page ? { page: String(page) } : {}), ...(cameraProfile ? { camera_profile: cameraProfile } : {}) }, [{ name, blob: file }], 'file') })).blob();
  },
  /** The camera a RAW file came from and the DNG camera profiles on this computer that are made for it (DEV_PLAN 28.2). */
  async cameraProfiles(file: Blob, name: string): Promise<{ camera: { make: string; model: string; unique: string }; profiles: Array<{ id: string; name: string; camera: string; file: string }>; auto: string | null; folders: string[] }> {
    return (await (await request('/io/camera-profiles', { method: 'POST', body: form({}, [{ name, blob: file.slice(0, 8 * 1024 * 1024) }], 'file') })).json()) as { camera: { make: string; model: string; unique: string }; profiles: Array<{ id: string; name: string; camera: string; file: string }>; auto: string | null; folders: string[] };
  },
  /** A picture's pixels at their own depth (1.53.6, H1): RGBA, 16 bits a channel, and whether the file held 16. */
  async decodeDeep(file: Blob, name: string): Promise<{ width: number; height: number; depth: number; data: Uint16Array | Float32Array }> {
    const r = await request('/io/decode-deep', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') });
    const depth = Number(r.headers.get('X-Depth')), b = await r.arrayBuffer();
    return { width: Number(r.headers.get('X-Width')), height: Number(r.headers.get('X-Height')), depth, data: depth === 32 ? new Float32Array(b) : new Uint16Array(b) };
  },
  async encodeDeep(data: Uint16Array | Float32Array, width: number, height: number, format: 'png' | 'tiff' | 'hdr' | 'exr' | 'tiff32'): Promise<Blob> {
    const raw = data instanceof Float32Array ? new Float32Array(data) : new Uint16Array(data);
    return (await request('/io/encode-deep', { method: 'POST', body: form({ width: String(width), height: String(height), format }, [{ name: 'pixels.raw', blob: new Blob([raw]) }], 'file') })).blob();
  },
  /** Colour management (1.53.5, H2): the profiles on this computer and added to formvis. */
  async colourProfiles(): Promise<{ profiles: Array<{ id: string; name: string; space: string; file: string; added: boolean; shipped?: boolean }>; folder: string }> {
    return (await (await request('/color/profiles')).json()) as { profiles: Array<{ id: string; name: string; space: string; file: string; added: boolean; shipped?: boolean }>; folder: string };
  },
  async addColourProfile(file: File): Promise<{ id: string; name: string; space: string }> {
    return (await (await request('/color/profiles', { method: 'POST', body: form({}, [{ name: file.name, blob: file }], 'file') })).json()) as { id: string; name: string; space: string };
  },
  async colourProfileBytes(id: string): Promise<Uint8Array> { return new Uint8Array(await (await request(`/color/profiles/${encodeURIComponent(id)}`)).arrayBuffer()); },
  /** A LittleCMS lookup table (engine/colour-lut.ts): source to dest (sRGB when none), through a proof profile when given. */
  /** Convert to Profile in CMYK (1.57.9): 8-bit inks from one CMYK profile to another (base64 ICC), pure black kept. */
  async convertInk(ink: Uint8Array, width: number, height: number, source: string, dest: string, intent: string): Promise<Uint8Array> {
    const body = form({ width: String(width), height: String(height), source, dest, intent, preserve_black: 'true' }, [{ name: 'ink.raw', blob: new Blob([new Uint8Array(ink)]) }], 'file');
    return new Uint8Array(await (await request('/color/convert-ink', { method: 'POST', body })).arrayBuffer());
  },
  /** Convert to Profile at 32 bits (1.57.3): the 3 by 3 matrix between two RGB matrix profiles in linear light. */
  async linearMatrix(req: { source?: { icc?: string; id?: string } | null; dest?: { icc?: string; id?: string } | null }): Promise<number[][]> {
    const r = await request('/color/linear-matrix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    return ((await r.json()) as { matrix: number[][] }).matrix;
  },
  async colourLut(req: { source?: { icc?: string; id?: string } | null; dest?: { icc?: string; id?: string } | null; proof?: { id?: string; icc?: string } | null; intent?: string; proofIntent?: string; bpc?: boolean; gamut?: boolean }): Promise<ColourLut> {
    const r = await request('/color/lut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    if (Number(r.headers.get('X-In') ?? 3) !== 3 || Number(r.headers.get('X-Out') ?? 3) !== 3) throw new ApiError('This conversion is between ink and RGB profiles; it runs on the pixels, not as an RGB table.', 422);
    return lutFrom(await r.arrayBuffer(), Number(r.headers.get('X-Grid') ?? 33), r.headers.get('X-Gamut') === '1');
  },
  /** Convert to Profile and mode changes at 16 bits (DEV_PLAN 28.2): the document's float channels (straight alpha last)
   *  through LittleCMS in double precision, rounded once; `source` and `dest` are base64 ICC text or `id:` and a listed id.
   *  `space` is what came back: rgb, cmyk, lab or gray (three equal channels). */
  async convertDeep(data: Float32Array, width: number, height: number, mode: 'rgb' | 'cmyk' | 'lab', source: string, dest: string, o: { intent?: string; bpc?: boolean; dither?: boolean; bits?: 8 | 16 } = {}): Promise<{ data: Float32Array; space: 'rgb' | 'cmyk' | 'lab' | 'gray' }> {
    const body = form({ mode, width: String(width), height: String(height), source, dest, intent: o.intent ?? 'relative', bpc: o.bpc === false ? 'false' : 'true', dither: o.dither ? 'true' : 'false', bits: String(o.bits ?? 16) }, [{ name: 'pixels.raw', blob: new Blob([new Float32Array(data)]) }], 'file');
    const r = await request('/color/convert-deep', { method: 'POST', body });
    return { data: new Float32Array(await r.arrayBuffer()), space: (r.headers.get('X-Space') ?? 'rgb') as 'rgb' | 'cmyk' | 'lab' | 'gray' };
  },
  /** A profile's own facts for Color Settings: total ink, black ink and black generation of a CMYK profile (percent). */
  async profileInfo(profile: { icc?: string; id?: string } | null): Promise<ProfileInfo> {
    const r = await request('/color/profile-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) });
    return (await r.json()) as ProfileInfo;
  },
  /** A DPX film scan (DEV_PLAN 28.2) from RGBA at 16 bits a channel, sRGB encoded: its bit depth and transfer written. */
  async encodeDpx(data: Uint16Array, width: number, height: number, o: { bits?: 8 | 10 | 12 | 16; transfer?: 'linear' | 'density' | 'log'; bigEndian?: boolean; name?: string } = {}): Promise<Blob> {
    const body = form({ width: String(width), height: String(height), bits: String(o.bits ?? 10), transfer: o.transfer ?? 'log', big_endian: o.bigEndian === false ? 'false' : 'true', name: o.name ?? '' }, [{ name: 'pixels.raw', blob: new Blob([new Uint16Array(data)]) }], 'file');
    return (await request('/io/encode-dpx', { method: 'POST', body })).blob();
  },
  /** CMYK documents (1.54.0, H1): the display table from a CMYK profile (base64 ICC or a listed id). */
  async cmykLut(profile: { icc?: string; id?: string }): Promise<Lut4> {
    const r = await request('/color/cmyk-lut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) });
    return lut4From(await r.arrayBuffer(), Number(r.headers.get('X-Grid') ?? 17));
  },
  async rgbCmykLut(profile: { icc?: string; id?: string }, source: { icc?: string } | null = null): Promise<Lut3x4> {
    const r = await request('/color/rgb-cmyk-lut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, source }) });
    return lut3x4From(await r.arrayBuffer(), Number(r.headers.get('X-Grid') ?? 33));
  },
  /** Pixels converted exactly by LittleCMS at 8 bits: RGBA (four a pixel) to CMYK and alpha (five), or back. */
  async convertPixels(data: Uint8Array, width: number, height: number, to: 'cmyk' | 'rgb', profileIcc: string, sourceIcc = '', intent = 'relative', bpc = true): Promise<Uint8Array> {
    const r = await request('/color/convert-pixels', { method: 'POST', body: form({ width: String(width), height: String(height), to, profile: profileIcc, source: sourceIcc, intent, bpc: bpc ? 'true' : 'false' }, [{ name: 'pixels.raw', blob: new Blob([new Uint8Array(data)]) }], 'file') });
    return new Uint8Array(await r.arrayBuffer());
  },
  async defaultCmykProfile(): Promise<{ id: string; name: string } | null> {
    return ((await (await request('/color/default-cmyk')).json()) as { profile: { id: string; name: string } | null }).profile;
  },
  /** A CMYK file's ink and embedded profile, or null when the file is not CMYK. */
  /** A CMYK PSD's layers as ink (1.56.1, DEV_PLAN 22.8), read by the engine's psd-tools; null when the file is not one. */
  /** A clip's size, frame rate, length and frame count, read by the engine's ffmpeg (1.58.9, L1). */
  async videoProbe(file: File): Promise<{ width: number; height: number; fps: number; duration: number; frames: number }> {
    return (await (await request('/video/probe', { method: 'POST', body: form({}, [{ name: file.name, blob: file }], 'file') })).json()) as { width: number; height: number; fps: number; duration: number; frames: number };
  },
  /** A clip's frames from `start` to `end` seconds (0: to the end), every `every`th, decoded by the engine's ffmpeg. */
  async videoFrames(file: File, start: number, end: number, every: number): Promise<{ width: number; height: number; fps: number; delayMs: number; frames: Blob[] }> {
    const r = await request('/video/frames', { method: 'POST', body: form({ start: String(start), end: String(end), every: String(every) }, [{ name: file.name, blob: file }], 'file') });
    const b = new Uint8Array(await r.arrayBuffer()), n = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
    const head = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + n))) as { width: number; height: number; fps: number; delayMs: number; sizes: number[] };
    let at = 4 + n;
    const frames = head.sizes.map((s) => { const blob = new Blob([b.slice(at, at + s)], { type: 'image/png' }); at += s; return blob; });
    return { width: head.width, height: head.height, fps: head.fps, delayMs: head.delayMs, frames };
  },
  /** A PNG written by the engine a band of rows at a time (1.61.2, DEV_PLAN 26.4): opened, fed rows top first, closed. */
  async bandsBegin(width: number, height: number, ppi: number): Promise<string> {
    return ((await (await request(`/bands/png?width=${width}&height=${height}&ppi=${ppi}`, { method: 'POST' })).json()) as { key: string }).key;
  },
  async bandsPut(key: string, rows: Uint8ClampedArray<ArrayBuffer>): Promise<void> {
    // As a Blob (1.63.0): a typed-array body stayed in the page after the upload, past garbage collection (30 uploads
    // of 16 MB kept about 190 MB); a Blob is handed to the browser and leaves nothing.
    await request(`/bands/png/${key}`, { method: 'POST', body: new Blob([rows]), headers: { 'Content-Type': 'application/octet-stream' } });
  },
  async bandsEnd(key: string): Promise<Blob> {
    return (await request(`/bands/png/${key}/end`, { method: 'POST' })).blob();
  },
  /** An opened project's PNG read by the engine a band of rows at a time (1.62.8): a giant layer's, past what a browser
   *  can decode. */
  async bandsReadOpen(session: string, file: string): Promise<{ key: string; width: number; height: number }> {
    return (await (await request(`/bands/read?session=${encodeURIComponent(session)}&file=${encodeURIComponent(file)}`, { method: 'POST' })).json()) as { key: string; width: number; height: number };
  },
  async bandsReadRows(key: string, rows: number): Promise<ArrayBuffer> {
    return (await request(`/bands/read/${key}?rows=${rows}`)).arrayBuffer();
  },
  /** The engine's undo store (1.60.8, DEV_PLAN 26.3): bytes kept on its disk under a key, given back, or forgotten. */
  async undoPut(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    // As a Blob (1.63.0): a typed-array body stayed in the page, so tiles paged to disk still held their memory.
    return ((await (await request('/undo', { method: 'POST', body: new Blob([bytes]), headers: { 'Content-Type': 'application/octet-stream' } })).json()) as { key: string }).key;
  },
  /** Many keys forgotten in one request (1.63.0) rather than one request each, which after a filter over a giant layer
   *  (tens of thousands of keys) held the window's other requests behind them for minutes. Not awaited. */
  undoDropMany(keys: string[]): void {
    for (let i = 0; i < keys.length; i += 20000) {
      void request('/undo/drop', { method: 'POST', body: JSON.stringify({ keys: keys.slice(i, i + 20000) }), headers: { 'Content-Type': 'application/json' } }).catch(() => undefined);
    }
  },
  async undoGet(key: string): Promise<ArrayBuffer> {
    return (await request(`/undo/${key}`)).arrayBuffer();
  },
  undoDrop(key: string): void {
    void request(`/undo/${key}`, { method: 'DELETE' }).catch(() => undefined);
  },
  /** Render Video's picture sequence (1.59.6): the frames as numbered PNGs in one zip, made by the engine. */
  async videoSequence(frames: Blob[], name: string): Promise<Blob> {
    return (await request('/video/sequence', { method: 'POST', body: form({ name }, frames.map((blob, i) => ({ name: `f${i}.png`, blob })), 'file') })).blob();
  },
  /** An H.264 MP4 from frames (PNG) and their delays in milliseconds, written by the engine's ffmpeg (1.58.9). */
  async encodeVideo(frames: Blob[], delays: number[]): Promise<Blob> {
    const body = form({ delays: JSON.stringify(delays) }, frames.map((blob, i) => ({ name: `f${i}.png`, blob })), 'file');
    return (await request('/video/encode', { method: 'POST', body })).blob();
  },
  /** File > Automate > Photomerge (1.58.2): the photos stitched by the engine's OpenCV, transparent where none reaches
   *  (or cropped); `stitched` says how many of them the stitch kept, as "kept/given". */
  async mergePanorama(files: File[], layout: 'auto' | 'reposition', crop: boolean): Promise<{ png: Blob; stitched: string }> {
    const r = await request('/merge/panorama', { method: 'POST', body: form({ layout, crop: String(crop) }, files.map((f) => ({ name: f.name, blob: f })), 'file') });
    return { png: await r.blob(), stitched: r.headers.get('X-Photos-Stitched') ?? '' };
  },
  /** File > Automate > Merge to HDR (1.58.2): the exposures merged by the engine into linear light (RGB floats), with
   *  the exposure times used and where they came from. */
  async mergeHdr(files: File[]): Promise<{ width: number; height: number; rgb: Float32Array; times: number[]; source: string }> {
    const r = await request('/merge/hdr', { method: 'POST', body: form({}, files.map((f) => ({ name: f.name, blob: f })), 'file') });
    const b = new Uint8Array(await r.arrayBuffer()), n = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
    const head = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + n))) as { width: number; height: number; times: number[]; source: string };
    return { ...head, rgb: new Float32Array(b.slice(4 + n).buffer) };
  },
  /** A Lab TIFF or PSD as Lab layers (1.58.1): each layer's L, a, b and alpha as floats in the window's encoding;
   *  null when the file is not Lab. */
  async decodeLab(file: Blob, name: string): Promise<{ width: number; height: number; bits: 8 | 16; layers: Array<{ name: string; left: number; top: number; width: number; height: number; opacity: number; visible: boolean; data: Float32Array }> } | null> {
    const r = await request('/io/decode-lab', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') });
    if (r.status === 204) return null;
    const b = new Uint8Array(await r.arrayBuffer()), n = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
    const head = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + n))) as { width: number; height: number; bits: 8 | 16; layers: Array<{ name: string; left: number; top: number; width: number; height: number; opacity: number; visible: boolean }> };
    let at = 4 + n;
    const layers = head.layers.map((l) => {
      const count = l.width * l.height * 4, u = new Uint16Array(b.slice(at, at + count * 2).buffer), data = new Float32Array(count);
      for (let i = 0; i < count; i++) data[i] = u[i] / 65535;
      at += count * 2;
      return { ...l, data };
    });
    return { width: head.width, height: head.height, bits: head.bits, layers };
  },
  async decodeCmykPsd(file: Blob, name: string): Promise<CmykPsd | null> {
    const r = await request('/io/decode-cmyk-psd', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') });
    if (r.status === 204) return null;
    const b = new Uint8Array(await r.arrayBuffer()), n = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
    const head = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + n))) as { width: number; height: number; icc: number; layers: Array<Omit<CmykPsd['layers'][number], 'ink'>> };
    let at = 4 + n;
    const layers = head.layers.map((l) => { const len = l.width * l.height * 5, ink = b.slice(at, at + len); at += len; return { ...l, ink }; });
    return { width: head.width, height: head.height, layers, icc: head.icc ? b.slice(at, at + head.icc) : null };
  },
  /** A layered CMYK PSD written by the engine: the composite's ink, then each layer's, then the profile. */
  async encodeCmykPsd(doc: { width: number; height: number; layers: Array<Omit<CmykPsd['layers'][number], 'ink'>> }, composite: Uint8Array, inks: Uint8Array[], icc: Uint8Array | null): Promise<Blob> {
    const parts: BlobPart[] = [new Uint8Array(composite), ...inks.map((k) => new Uint8Array(k)), ...(icc ? [new Uint8Array(icc)] : [])];
    const body = form({ meta: JSON.stringify(doc) }, [{ name: 'layers.raw', blob: new Blob(parts) }], 'file');
    return (await request('/io/encode-cmyk-psd', { method: 'POST', body })).blob();
  },
  async decodeCmyk(file: Blob, name: string): Promise<{ width: number; height: number; ink: Uint8Array; icc: Uint8Array | null } | null> {
    const r = await request('/io/decode-cmyk', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') });
    if (r.status === 204) return null;
    const width = Number(r.headers.get('X-Width')), height = Number(r.headers.get('X-Height')), iccLen = Number(r.headers.get('X-Profile-Bytes') ?? 0), b = new Uint8Array(await r.arrayBuffer());
    return { width, height, ink: b.slice(0, width * height * 5), icc: iccLen ? b.slice(width * height * 5, width * height * 5 + iccLen) : null };
  },
  /** A 16-bit CMYK or Lab TIFF (1.57.8): 16-bit values from 0 to 65535 (inks; or L, then a and b in the window's
   *  encoding, half for neutral), written by the engine with tifffile; a CMYK file carries `icc`. */
  async encodeTiff16(values: Uint16Array, width: number, height: number, space: 'cmyk' | 'lab', icc: Uint8Array | null): Promise<Blob> {
    const files = [{ name: 'values.raw', blob: new Blob([new Uint8Array(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))]) }];
    if (icc) files.push({ name: 'profile.icc', blob: new Blob([new Uint8Array(icc)]) });
    const body = form({ width: String(width), height: String(height), space }, files, 'file');
    return (await request('/io/encode-tiff16', { method: 'POST', body })).blob();
  },
  /** A Lab TIFF (1.56.6) from 8-bit Lab bytes (L * 255 / 100, then a and b offset by 128), written by the engine. */
  async encodeLabTiff(lab: Uint8Array, width: number, height: number): Promise<Blob> {
    const body = form({ width: String(width), height: String(height) }, [{ name: 'lab.raw', blob: new Blob([new Uint8Array(lab)]) }], 'file');
    return (await request('/io/encode-lab-tiff', { method: 'POST', body })).blob();
  },
  async encodeCmyk(ink: Uint8Array, width: number, height: number, format: 'tiff' | 'jpg', icc: Uint8Array | null, quality = 90, dpi = 72): Promise<Blob> {
    const files = [{ name: 'pixels.raw', blob: new Blob([new Uint8Array(ink)]) }];
    const body = form({ width: String(width), height: String(height), format, quality: String(quality), dpi: String(dpi) }, files, 'file');
    if (icc) body.append('icc', new Blob([new Uint8Array(icc)]), 'profile.icc');
    return (await request('/io/encode-cmyk', { method: 'POST', body })).blob();
  },
  /** A TIFF's pages (1.53.4), BigTIFF included; one entry for anything else. */
  async imagePages(file: Blob, name: string): Promise<Array<{ index: number; width: number; height: number; mode: string }>> {
    return ((await (await request('/io/pages', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).json()) as { pages: Array<{ index: number; width: number; height: number; mode: string }> }).pages;
  },
  async library(): Promise<LibraryItem[]> {
    return (await (await request('/projects')).json()) as LibraryItem[];
  },
  /** A save to the library; `base` (1.58.8) is the version the project was opened or last saved at, so a file changed
   *  since (another device's copy synced in) is kept and this save goes beside it as a conflict copy. */
  async save(name: string, manifest: object, files: FilePart[], base = ''): Promise<{ name: string; path: string; version?: string; conflict?: boolean; kept?: string }> {
    return (await (await request('/projects/save', { method: 'POST', body: form({ name, manifest: JSON.stringify(manifest), base }, files) })).json()) as { name: string; path: string; version?: string; conflict?: boolean; kept?: string };
  },
  /** Where the library is (1.58.8, L13), the default, and the synced folders found on this computer. */
  async libraryFolder(): Promise<LibraryFolder | null> {
    try { return (await (await request('/projects/folder')).json()) as LibraryFolder; } catch { return null; }
  },
  /** The library moved to `folder` (empty: the default), its projects moved there with `move`. */
  async setLibraryFolder(folder: string, move: boolean): Promise<LibraryFolder & { moved: number }> {
    return (await (await request('/projects/folder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder, move }) })).json()) as LibraryFolder & { moved: number };
  },
  async package(manifest: object, files: FilePart[], root = ''): Promise<Blob> {
    const fields: Record<string, string> = { manifest: JSON.stringify(manifest) };
    if (root) fields.root = root;
    return (await request('/projects/package', { method: 'POST', body: form(fields, files) })).blob();
  },
  async openLibrary(name: string): Promise<OpenedProject> {
    return (await (await request(`/projects/library/${encodeURIComponent(name)}`)).json()) as OpenedProject;
  },
  async deleteLibrary(name: string): Promise<void> {
    await request(`/projects/library/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },
  async importProject(files: File[], paths: string[] = []): Promise<OpenedProject> {
    const body = form({}, files.map((f) => ({ name: f.name, blob: f })), 'files');
    if (paths.length) files.forEach((f, i) => body.append('paths', paths[i] ?? f.name));
    return (await (await request('/projects/import', { method: 'POST', body })).json()) as OpenedProject;
  },
  async fetchAsset(url: string): Promise<Blob> {
    return (await request(url.startsWith('/api') ? url.slice(4) : url)).blob();
  },
  async removeBackground(image: Blob, method: 'auto' | 'ml' | 'lite'): Promise<{ mask: Blob; method: string }> {
    const r = await request('/ops/remove-background', { method: 'POST', body: form({ method }, [{ name: 'layer.png', blob: image }], 'file') });
    return { mask: await r.blob(), method: r.headers.get('X-Method') ?? method };
  },
  /** Mask All Objects: the objects found in `image`, largest first, each a grey mask (base64 PNG) over its box at the
   *  working size given. */
  async findObjects(image: Blob): Promise<{ width: number; height: number; objects: Array<{ box: [number, number, number, number]; mask: string }> }> {
    return (await (await request('/ops/objects', { method: 'POST', body: form({}, [{ name: 'layer.png', blob: image }], 'file') })).json()) as { width: number; height: number; objects: Array<{ box: [number, number, number, number]; mask: string }> };
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
  async exportFile(blob: Blob, name: string, folder = ''): Promise<string> {
    const r = await request('/io/export', { method: 'POST', body: form(folder ? { name, folder } : { name }, [{ name, blob }], 'file') });
    return ((await r.json()) as { path: string }).path;
  },
  async terminals(): Promise<TerminalInfo[]> {
    return ((await (await request('/terminal')).json()) as { terminals: TerminalInfo[] }).terminals;
  },
  async openTerminal(cols: number, rows: number): Promise<TerminalInfo> {
    return (await (await request('/terminal', json({ cols, rows }))).json()) as TerminalInfo;
  },
  async restartTerminal(id: string): Promise<void> { await request(`/terminal/${id}/restart`, { method: 'POST' }); },
  async closeTerminal(id: string): Promise<void> { await request(`/terminal/${id}`, { method: 'DELETE' }); },
  async claudeStatus(fresh = false): Promise<ClaudeStatus | null> {
    try { return (await (await request(`/agent/claude/status${fresh ? '?fresh=true' : ''}`)).json()) as ClaudeStatus; } catch { return null; }
  },
  async claudeStart(mode: AgentMode, fresh = false): Promise<void> { await request('/agent/claude/start', json({ mode, fresh })); },
  async claudeSend(text: string): Promise<void> { await request('/agent/claude/send', json({ text })); },
  async claudeStop(): Promise<void> { await request('/agent/claude/stop', { method: 'POST' }); },
  async claudeAllow(id: string, allow: boolean): Promise<void> { await request('/agent/claude/permission', json({ id, allow })); },
};

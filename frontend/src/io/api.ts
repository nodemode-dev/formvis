import { lutFrom, lut4From, lut3x4From, type ColourLut, type Lut4, type Lut3x4 } from '../engine/colour-lut';
export interface ExrLayout { width: number; height: number; /** The stereo views, when the file holds more than one. */ views?: string[]; parts: Array<{ part: number; name: string; groups: Array<{ key: string; label: string; channels: number; view?: string }> }>; crypto: Array<{ name: string; objects: string[] }> }
export type ExrPick = { part: number; key: string } | { crypto: string; object: string } | { sum: Array<{ part: number; key: string }>; name: string };
export interface Capabilities { pixelBudget?: number; memory?: number;
  name: string; version: string;
  desktop: boolean;
  decode: { heic: boolean; tiff: boolean; engine: string; raw?: boolean; rawEngine?: string };
  removeBackground: { ml: boolean; lite: boolean; default: 'ml' | 'lite' | null; model: string };
  dataDir: string;
  dataDirSource?: 'override' | 'portable' | 'default';
  switches?: { portable: boolean; noComfy: boolean; tiles: string; logLevel: string };
  logFile?: string;
  runtime?: { python: string; system: string; machine: string };
}
/** The engine process's memory in bytes as the operating system counts it; a key is missing when the system does not say. */
export interface EngineMetrics { pid: number; uptime: number; total: number; rss?: number; peak?: number; private?: number; available?: number; threads?: number; gpu?: Array<{ name: string; used: number; total: number | null; source: string }> }
export interface LibraryItem { name: string; modified: number; size: number }
/** One record of a layered PSD written in parts: `section` 0 a layer, 3 the marker that begins a folder, 1 or 2 its own record, open or closed. */
export interface PsdPartSpec { name: string; left: number; top: number; width: number; height: number; opacity: number; blend: string; visible: boolean; clipping: boolean; section: 0 | 1 | 2 | 3 }
/** A plugin folder's plugin.json as the engine checked it. */
export interface PluginManifest { id: string; name: string; version: string; main: string; permissions: string[]; description: string; api: number }
export interface OpenedProject { session: string; name: string; manifest: Record<string, unknown>; images: Record<string, string>; version?: string; path?: string }
/** The library's folder (1.58.8, L13): where it is, the default, whether it is fixed by the engine's environment, and
 *  the synced folders found on this computer with a Formvis folder suggested in each. */
export interface LibraryFolder { folder: string; default: string; custom: boolean; fixed: boolean; synced: Array<{ label: string; base: string; suggested: string }> }
export interface FilePart { name: string; blob: Blob }
/** Sign-in for the user's own ComfyUI server; the secret is kept by the engine and only whether it is set comes back. */
export interface ComfyAuth { mode: 'none' | 'basic' | 'bearer' | 'header'; user: string; header: string; hasSecret: boolean; store: 'system' | 'file' }
/** What the ComfyUI Test reports: the server, its devices and queue, its node packs, and each kept recipe's missing nodes and model files. */
export interface ComfyProbe {
  running: boolean; detail?: string; ms?: number; version?: string; python?: string; pytorch?: string; os?: string;
  devices?: Array<{ name: string; type: string; vram: number; free: number }>;
  queue?: { running: number; pending: number };
  packs?: Array<{ name: string; version?: string }>;
  recipes?: Array<{ name: string; nodes: number; models: number; missing_nodes: string[]; missing_models: Array<{ node: string; input: string; name: string }> }>;
}
/** The helper model folder: in use now, saved for the next start, the environment override, and whether a restart is needed. */
export interface ModelsFolder { active: string; saved: string; env: string; restart: boolean }
/** A file in the exports folder (1.87.0), for Home's Outputs. */
export interface OutputItem { name: string; path: string; modified: number; size: number; kind: string }
/** Marks the calls that read or write files by path (1.87.0): the engine answers them only for formvis's own window. */
const LOCAL = { 'X-Formvis': '1' };
export interface GenerativeStatus { configured: boolean; source: 'environment' | 'settings' | null; last4?: string; refused?: boolean; /** Seconds since 1970 when the service refused the key, 0 when it has not. */ refusedAt?: number; fillModel: string; eraseModel: string; upscaleModel: string }
/** A generation provider beside fal (1.58.4, L7): OpenAI, Google, Black Forest Labs or Ideogram. */
export interface ProviderStatus { id: string; name: string; model: string; fill: boolean; configured: boolean; source: 'environment' | 'settings' | null; last4?: string; refused?: boolean; refusedAt?: number }
export interface LlmRow { id: string; name: string; baseUrl: string; model: string; vision: boolean; hasKey: boolean; last4?: string; refusedAt?: number }
export interface LlmStatus { configured: boolean; baseUrl: string; model: string; vision: boolean; active: string; hasKey: boolean; rows: LlmRow[]; store: 'system' | 'file' }
export interface HfToken { hasKey: boolean; last4: string; store: 'system' | 'file' }
export interface ModelsScan { scanned: number; linked: string[]; ready: string[] }
export interface LocalFiles { dataDir: string; folders: Array<{ id: string; label: string; path: string; files: number; bytes: number }>; unreferenced: { files: number; bytes: number } }

export interface ProfileInfo { name: string; space: string; tac: number | null; blackLimit: number | null; blackAtMid: number | null; generation: string | null; deviceClass?: string | null; pcs?: string | null; version?: string | null; copyright?: string | null; size?: number }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** The engine service's state (DEV_PLAN 36.19), from the one health check that there is: /capabilities, asked once at
 *  boot and again, only while the service is down, when the window gets the focus back. With the service down every
 *  request fails at once without touching the network, so nothing logs a proxy error or retries. */
let serviceState: 'unknown' | 'up' | 'down' = 'unknown';
let caps: Promise<Capabilities | null> | null = null;
const serviceWatchers = new Set<(up: boolean) => void>();

export function serviceDown(): boolean { return serviceState === 'down'; }
/** Calls `fn` whenever the service goes up or down; returns the way to stop. */
export function onServiceChange(fn: (up: boolean) => void): () => void { serviceWatchers.add(fn); return () => { serviceWatchers.delete(fn); }; }
/** Once the first health check has answered: whether the service is running. */
export async function serviceReady(): Promise<boolean> { await (caps ??= probe()); return serviceState === 'up'; }
/** Resolves when the service is running (at once if it is); no timer, it waits for the focus re-check. */
export async function whenServiceUp(): Promise<void> {
  if (await serviceReady()) return;
  await new Promise<void>((done) => { const stop = onServiceChange((up) => { if (up) { stop(); done(); } }); });
}

async function probe(): Promise<Capabilities | null> {
  // The desktop app starts its engine beside the window, so it may need a moment: a few quick tries before giving up.
  for (let i = 0; i < ('__TAURI_INTERNALS__' in window ? 10 : 1); i++) {
    try {
      const res = await fetch('/api/capabilities');
      if (res.ok) { const c = (await res.json()) as Capabilities; set('up'); return c; }
    } catch { /* not answering */ }
    if (i < 9 && '__TAURI_INTERNALS__' in window) await new Promise((r) => window.setTimeout(r, 500));
  }
  set('down');
  return null;
  function set(next: 'up' | 'down'): void { const was = serviceState; serviceState = next; if (was !== next) for (const fn of [...serviceWatchers]) fn(next === 'up'); }
}
if (typeof window !== 'undefined') window.addEventListener('focus', () => { if (serviceState === 'down') caps = probe(); });

const NOT_RUNNING = 'The formvis engine service is not running. Start it with ./formvis boot.';

async function request(path: string, init?: RequestInit): Promise<Response> {
  if (!(await serviceReady())) throw new ApiError(NOT_RUNNING, 0);
  let res: Response;
  try { res = await fetch(`/api${path}`, init); } catch {
    throw new ApiError(NOT_RUNNING, 0);
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

/** A camera RAW's white balance at the RAW stage (DEV_PLAN 36.21): the preset, Temperature and Tint (-100 to 100), and
 *  `half` for Camera Raw's fast half-size preview. */
export type RawWhiteBalance = { wb: 'as_shot' | 'auto' | 'daylight'; temperature: number; tint: number; half?: boolean; develop?: RawDevelop; space?: 'srgb' | 'prophoto' };

/** The RAW-stage develop controls the engine applies in linear light: Exposure in stops, Noise Reduction 0 to 100, highlight
 *  recovery, the black point, and Shadows, Highlights, Clarity, Texture and Dehaze from -100 to 100. */
export type RawDevelop = { exposure: number; recovery: 'clip' | 'unclip' | 'blend' | 'rebuild'; noise: number; blackPoint: 'as_shot' | 'auto'; shadows: number; highlights: number; clarity: number; texture: number; dehaze: number; kelvin: number; look: boolean; distortion: number; lensVignette: number; lensMidpoint: number };
export const RAW_DEVELOP_ZERO: RawDevelop = { exposure: 0, recovery: 'clip', noise: 0, blackPoint: 'as_shot', shadows: 0, highlights: 0, clarity: 0, texture: 0, dehaze: 0, kelvin: 0, look: false, distortion: 0, lensVignette: 0, lensMidpoint: 50 };

/** What the engine reads from a camera RAW file's bytes (POST /io/raw-info). */
export type RawInfo = { kind: string; make: string; model: string; rawWidth: number; rawHeight: number; width: number; height: number; cfa: string; colors: number; whiteBalance: number[]; orientation: number; baselineExposure: number | null; blackLevel: number[]; whiteLevel: number; gainMaps?: number; kelvin?: number | null };

/** The decode route's form fields for `raw`; none when it is the plain as-shot decode, so the engine's defaults stand. */
function rawFields(raw?: RawWhiteBalance): Record<string, string> {
  if (!raw) return {};
  const d = raw.develop, plain = !d || (Object.keys(RAW_DEVELOP_ZERO) as Array<keyof RawDevelop>).every((k) => d[k] === RAW_DEVELOP_ZERO[k]);
  return { ...(raw.wb !== 'as_shot' ? { wb: raw.wb } : {}), ...(raw.temperature ? { temperature: String(raw.temperature) } : {}), ...(raw.tint ? { tint: String(raw.tint) } : {}), ...(raw.half ? { half: 'true' } : {}), ...(raw.space === 'prophoto' ? { space: 'prophoto' } : {}), ...(plain ? {} : { develop: JSON.stringify(d) }) };
}

function form(fields: Record<string, string>, files: FilePart[] = [], key = 'files'): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  for (const part of files) body.append(key, part.blob, part.name);
  return body;
}

/** The window's terminals and Claude Code (DEV_PLAN 28.5): the engine's PTY sessions, and the agent's status and messages. */
export interface TerminalInfo { id: string; title: string; cwd?: string; alive: boolean; kind: 'shell' | 'claude' | 'agent' }
export interface ClaudeCodeStatus { installed: boolean; version: string | null; install: string; signedIn: boolean | null }
export interface ClaudeOpen { prompt?: string; resume?: string; cols?: number; rows?: number; fresh?: boolean }
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
  /** A font file's bytes (DEV_PLAN 32.6b): the engine finds the family's file on this computer, for OpenType features. */
  async fontFile(family: string, bold: boolean, italic: boolean): Promise<ArrayBuffer> {
    const res = await request(`/fonts/file?family=${encodeURIComponent(family)}&bold=${bold ? 1 : 0}&italic=${italic ? 1 : 0}`);
    if (res.status === 204) throw new ApiError(`No font file for ${family} on this computer.`, 204);   // not installed (1.72.5)
    return res.arrayBuffer();
  },
  async capabilities(): Promise<Capabilities | null> {
    return await (caps ??= probe());
  },
  /** Help > System Info: the engine's working set, peak and private bytes; null when the engine is offline. */
  async metrics(): Promise<EngineMetrics | null> {
    try { return (await (await request('/metrics')).json()) as EngineMetrics; } catch { return null; }
  },
  /** The end of the engine's log file and where the file is; null when the engine is offline. */
  async engineLog(lines = 300): Promise<{ path: string; text: string } | null> {
    try { return (await (await request(`/log?lines=${lines}`)).json()) as { path: string; text: string }; } catch { return null; }
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
  /** Plugin folders (plugin.json beside an ES module): the folders with their manifests, a file in one, a folder removed. */
  async pluginFolders(): Promise<Array<{ id: string; manifest: PluginManifest | null; error: string | null }>> { try { return (await (await request('/plugins/folders')).json()) as Array<{ id: string; manifest: PluginManifest | null; error: string | null }>; } catch { return []; } },
  async pluginFolderFile(id: string, path: string): Promise<string> { return (await request(`/plugins/folders/${encodeURIComponent(id)}/${path.split('/').map(encodeURIComponent).join('/')}`)).text(); },
  async removePluginFolder(id: string): Promise<void> { await request(`/plugins/folders/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  /** The extra plug-ins folder chosen in Preferences (read only), and the data folder's own. */
  async pluginsExtraFolder(): Promise<{ path: string; data: string } | null> { try { return (await (await request('/plugins/extra-folder')).json()) as { path: string; data: string }; } catch { return null; } },
  async pluginsExtraFolderSave(path: string): Promise<{ path: string; data: string }> {
    return (await (await request('/plugins/extra-folder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })).json()) as { path: string; data: string };
  },

  /** The assistant (1.52.2): one step of the conversation; the model's text and its tool calls. */
  async assistantStep(messages: unknown[], tools = true): Promise<{ content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> }> {
    return (await (await request('/llm/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, tools }) })).json()) as { content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> };
  },

  /** Prompt improvement (1.51.5): the language model's settings (never its key), its models, and a rewrite. */
  async llmStatus(): Promise<LlmStatus | null> {
    try { return (await (await request('/llm/status')).json()) as LlmStatus; } catch { return null; }
  },
  /** Custom language model rows: add (no id) or change one, make one the model in use, remove one. */
  async llmSaveRow(id: string | null, row: { name: string; baseUrl: string; model: string; vision: boolean }, key: string | null, forgetKey = false): Promise<LlmStatus> {
    const body = form({ name: row.name, base_url: row.baseUrl, model: row.model, vision: row.vision ? 'true' : 'false', ...(key ? { key } : {}), ...(id && forgetKey ? { forget_key: 'true' } : {}) });
    return (await (await request(id ? `/llm/rows/${encodeURIComponent(id)}` : '/llm/rows', { method: id ? 'PUT' : 'POST', body })).json()) as LlmStatus;
  },
  async llmUseRow(id: string): Promise<LlmStatus> { return (await (await request(`/llm/rows/${encodeURIComponent(id)}/use`, { method: 'POST' })).json()) as LlmStatus; },
  async llmDeleteRow(id: string): Promise<LlmStatus> { return (await (await request(`/llm/rows/${encodeURIComponent(id)}`, { method: 'DELETE' })).json()) as LlmStatus; },
  async llmSave(baseUrl: string, model: string, key: string | null, forgetKey = false): Promise<{ configured: boolean; baseUrl: string; model: string; hasKey: boolean }> {
    return (await (await request('/llm/settings', { method: 'POST', body: form({ base_url: baseUrl, model, ...(key ? { key } : {}), ...(forgetKey ? { forget_key: 'true' } : {}) }) })).json()) as { configured: boolean; baseUrl: string; model: string; hasKey: boolean };
  },
  /** The Markdown files in the data folder's prompt-templates folder, and the folder's path. */
  async promptTemplateFiles(): Promise<{ folder: string; files: Array<{ file: string; text: string }> } | null> {
    try { return (await (await request('/llm/templates')).json()) as { folder: string; files: Array<{ file: string; text: string }> }; } catch { return null; }
  },
  /** Workflows kept as files in the data folder's recipes folder: list, keep one, remove one. */
  async recipeFiles(): Promise<{ folder: string; files: Array<{ name: string; text: string }> } | null> {
    try { return (await (await request('/comfyui/recipe-files')).json()) as { folder: string; files: Array<{ name: string; text: string }> }; } catch { return null; }
  },
  async recipeFileSave(name: string, text: string): Promise<void> { await request(`/comfyui/recipe-files/${encodeURIComponent(name)}`, { method: 'PUT', body: text }); },
  async recipeFileDelete(name: string): Promise<void> { await request(`/comfyui/recipe-files/${encodeURIComponent(name)}`, { method: 'DELETE' }); },
  async llmModels(): Promise<string[]> { return ((await (await request('/llm/models')).json()) as { models: string[] }).models; },
  /** The prompt rewritten; with `picture` (a data address of the area it is for) a model row that reads pictures sees it too (`seen`), and `restored` names the @img tokens the model dropped and the engine put back. */
  async improvePrompt(prompt: string, instructions: string, picture = '', references: ReadonlyArray<{ token: string; picture: string }> = []): Promise<{ prompt: string; restored: string[]; seen: boolean; shown: string[]; dropped: string[]; added: string[] }> {
    const r = (await (await request('/llm/improve', { method: 'POST', body: form({ prompt, instructions, ...(picture ? { picture } : {}), ...(references.length ? { references: JSON.stringify(references) } : {}) }) })).json()) as { prompt: string; restored?: string[]; seen?: boolean; shown?: string[]; dropped?: string[]; added?: string[] };
    return { prompt: r.prompt, restored: r.restored ?? [], seen: r.seen === true, shown: r.shown ?? [], dropped: r.dropped ?? [], added: r.added ?? [] };
  },

  /** Edit > Generate Image (1.51.2): a picture from a prompt alone through fal, or (1.58.4) through another provider,
   *  near the document's shape. */
  async generateImage(prompt: string, width: number, height: number, provider = 'fal', seed?: number): Promise<Blob> {
    return (await request('/generative/generate', { method: 'POST', body: form({ prompt, width: String(width), height: String(height), provider, ...(seed !== undefined && seed >= 0 ? { seed: String(seed) } : {}) }) })).blob();
  },
  /** Edit > Free Helper Models: the engine lets go of the ONNX sessions it holds; the names it freed. */
  async freeHelpers(): Promise<string[]> {
    return ((await (await request('/helpers/free', { method: 'POST' })).json()) as { freed: string[] }).freed;
  },
  /** The providers beside fal (1.58.4, L7): which have keys, never the keys themselves. */
  async providers(): Promise<ProviderStatus[]> {
    try { return (await (await request('/generative/providers')).json()) as ProviderStatus[]; } catch { return []; }
  },
  /** A provider's key, kept in the system's password store by the engine. */
  async saveProviderKey(id: string, key: string): Promise<ProviderStatus[]> {
    return (await (await request(`/generative/providers/${id}/key`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })).json()) as ProviderStatus[];
  },
  async forgetProviderKey(id: string): Promise<ProviderStatus[]> {
    return (await (await request(`/generative/providers/${id}/key`, { method: 'DELETE' })).json()) as ProviderStatus[];
  },
  /** The Hugging Face token for gated helper models: whether one is kept and its last four characters. */
  async hfToken(): Promise<HfToken | null> {
    try { return (await (await request('/models/token')).json()) as HfToken; } catch { return null; }
  },
  async hfTokenSave(token: string | null, forget = false): Promise<HfToken> {
    return (await (await request('/models/token', { method: 'PUT', headers: { ...LOCAL, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, forget }) })).json()) as HfToken;
  },
  /** Scan: links the helper models found under a folder (a ComfyUI models folder) into the helper model folder. */
  async modelsScan(path: string): Promise<ModelsScan> {
    return (await (await request('/models/scan', { method: 'POST', headers: { ...LOCAL, 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })).json()) as ModelsScan;
  },
  /** Settings > Local files: each folder formvis keeps files in with its size, and what nothing refers to. */
  async localFiles(): Promise<LocalFiles | null> {
    try { return (await (await request('/localfiles/stats')).json()) as LocalFiles; } catch { return null; }
  },
  /** Preferences > Interface > Skins: the window skins in the data folder's skins folder, and the files refused with why. */
  async skins(): Promise<{ folder: string; skins: Array<{ id: string; label: string; light: boolean; version: string; author: string; vars: Record<string, string>; css?: string }>; errors: Array<{ file: string; error: string }> } | null> {
    try { return (await (await request('/skins')).json()) as { folder: string; skins: Array<{ id: string; label: string; light: boolean; version: string; author: string; vars: Record<string, string>; css?: string }>; errors: Array<{ file: string; error: string }> }; } catch { return null; }
  },
  async localFilesClean(): Promise<{ removed: number; bytes: number }> {
    return (await (await request('/localfiles/clean', { method: 'POST' })).json()) as { removed: number; bytes: number };
  },
  async revealPath(path: string): Promise<void> {
    await request('/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
  },

  /** Run ComfyUI Workflow (1.51.1): uploads the inputs, fills the workflow and queues it. */
  async comfyuiRun(target: string, workflow: string, items: unknown[], parts: FilePart[], prompt: string | null): Promise<{ job: string; references: number; image: string | null; mask: string | null; prompt: boolean }> {
    const res = await request('/comfyui/run', { method: 'POST', body: form({ target, workflow, items: JSON.stringify(items), ...(prompt !== null ? { prompt } : {}) }, parts) });
    return (await res.json()) as { job: string; references: number; image: string | null; mask: string | null; prompt: boolean };
  },
  async comfyuiJob(job: string, target: string): Promise<{ state: 'queued' | 'running' | 'done' | 'failed'; ahead?: number; images?: Array<{ filename: string; subfolder: string }>; detail?: string; progress?: { value: number; max: number } }> {
    return (await (await request(`/comfyui/job/${encodeURIComponent(job)}?target=${encodeURIComponent(target)}`)).json()) as { state: 'queued' | 'running' | 'done' | 'failed'; ahead?: number; images?: Array<{ filename: string; subfolder: string }>; detail?: string; progress?: { value: number; max: number } };
  },
  /** Test (SC-AI-0146): the ComfyUI at `target` in detail, and what each kept recipe needs that it lacks. */
  async comfyuiProbe(target: string, recipes: Array<{ name: string; workflow: string }> = []): Promise<ComfyProbe | null> {
    try { return (await (await request('/comfyui/probe', { method: 'POST', body: form({ target, recipes: JSON.stringify(recipes) }, []) })).json()) as ComfyProbe; } catch { return null; }
  },
  async comfyuiImage(target: string, filename: string, subfolder: string): Promise<Blob> {
    return (await request(`/comfyui/image?target=${encodeURIComponent(target)}&filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}`)).blob();
  },
  async comfyuiCancel(job: string, target: string): Promise<void> {
    try { await request(`/comfyui/cancel/${encodeURIComponent(job)}`, { method: 'POST', body: form({ target }) }); } catch { /* it may have finished */ }
  },

  /** A workflow saved in ComfyUI's editor format as the API format, with the widget names read from the ComfyUI at `target`. */
  async comfyuiConvert(target: string, workflow: string): Promise<string> {
    return ((await (await request('/comfyui/convert', { method: 'POST', body: form({ target, workflow }, []) })).json()) as { workflow: string }).workflow;
  },

  /** Send to ComfyUI (1.50.9): whether ComfyUI answers at `target`, and its version. */
  async comfyuiStatus(target: string): Promise<{ running: boolean; version?: string; detail?: string } | null> {
    try { return (await (await request(`/comfyui/status?target=${encodeURIComponent(target)}`)).json()) as { running: boolean; version?: string; detail?: string }; } catch { return null; }
  },

  /** The graph of the newest job ComfyUI ran (API format, as text); throws the engine's reason when it has run none. */
  async comfyuiGraph(target: string): Promise<string> {
    return ((await (await request(`/comfyui/graph?target=${encodeURIComponent(target)}`)).json()) as { workflow: string }).workflow;
  },

  /** The pictures formvis sent to ComfyUI that the data folder still holds copies of (names as ComfyUI lists them). */
  async comfyuiMirror(): Promise<Array<{ name: string; bytes: number; time: number }>> {
    try { return ((await (await request('/comfyui/mirror')).json()) as { files: Array<{ name: string; bytes: number; time: number }> }).files; } catch { return []; }
  },
  /** Sends mirrored pictures to ComfyUI again from the copies in the data folder; the names sent and those no copy is left of. */
  async comfyuiReupload(target: string, names: string[]): Promise<{ sent: string[]; missing: string[] }> {
    return (await (await request('/comfyui/reupload', { method: 'POST', body: form({ target, names: JSON.stringify(names) }) })).json()) as { sent: string[]; missing: string[] };
  },

  /** Sign-in for the user's own ComfyUI server: the mode, user name and header name (never the secret). */
  async comfyuiAuth(): Promise<ComfyAuth | null> {
    try { return (await (await request('/comfyui/auth')).json()) as ComfyAuth; } catch { return null; }
  },
  async comfyuiAuthSave(mode: ComfyAuth['mode'], user: string, header: string, secret: string | null, forgetSecret = false): Promise<ComfyAuth> {
    return (await (await request('/comfyui/auth', { method: 'POST', body: form({ mode, user, header, ...(secret ? { secret } : {}), ...(forgetSecret ? { forget_secret: 'true' } : {}) }) })).json()) as ComfyAuth;
  },

  /** The helper model folder: the one in use, the one saved for the next start, and the environment override. */
  async modelsFolder(): Promise<ModelsFolder | null> {
    try { return (await (await request('/models/folder')).json()) as ModelsFolder; } catch { return null; }
  },
  async modelsFolderSave(path: string): Promise<ModelsFolder> {
    return (await (await request('/models/folder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })).json()) as ModelsFolder;
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
  async generativeFill(image: Blob, mask: Blob, prompt: string, provider = 'fal', seed?: number): Promise<Blob> {
    const f = new FormData();
    f.append('image', image, 'image.png');
    f.append('mask', mask, 'mask.png');
    f.append('prompt', prompt);
    if (provider === 'fal' && seed !== undefined) f.append('seed', String(seed));   // fal's fill with a prompt takes a seed
    if (provider !== 'fal') f.append('provider', provider);   // another provider's fill (36.12), the engine's /fill takes it since 1.58.4
    return (await request('/generative/fill', { method: 'POST', body: f })).blob();
  },
  /** `image` upscaled 2 or 4 times. */
  async upscale(image: Blob, scale: number): Promise<Blob> {
    const f = new FormData();
    f.append('image', image, 'image.png');
    f.append('scale', String(scale));
    return (await request('/generative/upscale', { method: 'POST', body: f })).blob();
  },
  async decode(file: Blob, name: string, page = 0, cameraProfile?: string, raw?: RawWhiteBalance): Promise<Blob> {
    return (await request('/io/decode', { method: 'POST', body: form({ ...(page ? { page: String(page) } : {}), ...(cameraProfile ? { camera_profile: cameraProfile } : {}), ...rawFields(raw) }, [{ name, blob: file }], 'file') })).blob();
  },
  /** A camera RAW at 16 bits per channel (DEV_PLAN 36.21): RGBA little-endian samples, with the white balance set at the RAW stage. */
  async decodeRaw16(file: Blob, name: string, raw: RawWhiteBalance): Promise<{ width: number; height: number; data: Uint16Array; profile: string }> {
    const r = await request('/io/decode', { method: 'POST', body: form({ bits: '16', ...rawFields(raw) }, [{ name, blob: file }], 'file') });
    const b = await r.arrayBuffer();
    return { width: Number(r.headers.get('X-Width')), height: Number(r.headers.get('X-Height')), data: new Uint16Array(b), profile: r.headers.get('X-Profile') ?? 'srgb' };
  },
  /** A camera RAW's open summary read from the file's bytes: make, model, sensor sizes, CFA pattern, white balance multipliers, orientation, baseline exposure. Rejects for a file that is not a RAW. */
  async rawInfo(file: Blob, name: string): Promise<RawInfo> {
    return (await (await request('/io/raw-info', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).json()) as RawInfo;
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
  /** A multi-part OpenEXR's parts (DEV_PLAN 36.15): each part's name, size, offset on the canvas and RGBA float32 pixels;
   *  null for a file of one part, which opens through decodeDeep as before. */
  async exrParts(file: Blob, name: string): Promise<{ width: number; height: number; parts: Array<{ name: string; width: number; height: number; x: number; y: number; data: Float32Array }> } | null> {
    const buf = await (await request('/io/exr-parts', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).arrayBuffer();
    const n = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as { count: number; width: number; height: number; parts: Array<{ name: string; width: number; height: number; x: number; y: number }> };
    if (head.count < 2) return null;
    let at = 4 + n;
    const parts = head.parts.map((p) => { const len = p.width * p.height * 4; const data = new Float32Array(buf.slice(at, at + len * 4)); at += len * 4; return { ...p, data }; });
    return { width: head.width, height: head.height, parts };
  },
  /** A Targa with real alpha as an opaque RGB picture (colours under zero alpha kept) and its alpha plane as a grey picture; null where the alpha is all opaque. */
  async decodeSplit(file: Blob, name: string): Promise<{ width: number; height: number; rgb: Blob; alpha: Blob } | null> {
    const buf = await (await request('/io/decode-split', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).arrayBuffer();
    const n = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as { hasAlpha: boolean; width: number; height: number; rgb?: number; alpha?: number };
    if (!head.hasAlpha) return null;
    const at = 4 + n;
    return { width: head.width, height: head.height, rgb: new Blob([buf.slice(at, at + (head.rgb ?? 0))], { type: 'image/png' }), alpha: new Blob([buf.slice(at + (head.rgb ?? 0), at + (head.rgb ?? 0) + (head.alpha ?? 0))], { type: 'image/png' }) };
  },
  /** An OpenEXR's channel groups for the Open EXR chooser: per part the groups (a part's own channels, or a prefix such as diffuse), and the Cryptomatte sets with their object names. */
  async exrLayout(file: Blob, name: string): Promise<ExrLayout> {
    return (await (await request('/io/exr-layout', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).json()) as ExrLayout;
  },
  /** The groups chosen in the Open EXR chooser as RGBA float32 parts, laid out as exrParts returns them. */
  async exrSelect(file: Blob, name: string, picks: ExrPick[]): Promise<{ width: number; height: number; parts: Array<{ name: string; width: number; height: number; x: number; y: number; data: Float32Array }> }> {
    const buf = await (await request('/io/exr-select', { method: 'POST', body: form({ picks: JSON.stringify(picks) }, [{ name, blob: file }], 'file') })).arrayBuffer();
    const n = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as { width: number; height: number; parts: Array<{ name: string; width: number; height: number; x: number; y: number }> };
    let at = 4 + n;
    const parts = head.parts.map((p) => { const len = p.width * p.height * 4; const data = new Float32Array(buf.slice(at, at + len * 4)); at += len * 4; return { ...p, data }; });
    return { width: head.width, height: head.height, parts };
  },
  /** An animated GIF or WebP's frames, each composited onto the whole canvas, with the delay in milliseconds and how often
   *  it plays (0 forever); null for a file of one frame, which opens as one picture. */
  async imageFrames(file: Blob, name: string): Promise<{ width: number; height: number; plays: number; frames: Array<{ delay: number; blob: Blob }> } | null> {
    const buf = await (await request('/io/frames', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).arrayBuffer();
    const n = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as { count: number; width: number; height: number; plays: number; frames: Array<{ delay: number; length: number }> };
    if (head.count < 2) return null;
    let at = 4 + n;
    const frames = head.frames.map((f) => { const blob = new Blob([buf.slice(at, at + f.length)], { type: 'image/png' }); at += f.length; return { delay: f.delay, blob }; });
    return { width: head.width, height: head.height, plays: head.plays, frames };
  },
  async encodeDeep(data: Uint16Array | Float32Array, width: number, height: number, format: 'png' | 'tiff' | 'hdr' | 'exr' | 'tiff32' | 'pfm', icc: { bytes: Uint8Array; name: string } | null = null, options: Record<string, unknown> | null = null): Promise<Blob> {
    const raw = data instanceof Float32Array ? new Float32Array(data) : new Uint16Array(data);
    const body = form({ width: String(width), height: String(height), format, ...(icc ? { icc_name: icc.name } : {}), ...(options ? { options: JSON.stringify(options) } : {}) }, [{ name: 'pixels.raw', blob: new Blob([raw]) }], 'file');
    if (icc) body.append('icc', new Blob([icc.bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.iccprofile' }), 'profile.icc');
    return (await request('/io/encode-deep', { method: 'POST', body })).blob();
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
  async colourLut(req: { source?: { icc?: string; id?: string } | null; dest?: { icc?: string; id?: string } | null; proof?: { id?: string; icc?: string } | null; intent?: string; proofIntent?: string; bpc?: boolean; gamut?: boolean; gamutDelta?: number }): Promise<ColourLut> {
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
  /** A Netpbm file (DEV_PLAN 34.1) from RGBA at 16 bits a channel, for a 16-bit document: P4, P5, P6 or P7, maxval 65535. */
  async encodePnm(data: Uint16Array, width: number, height: number, kind: string): Promise<Blob> {
    const body = form({ width: String(width), height: String(height), kind }, [{ name: 'pixels.raw', blob: new Blob([new Uint16Array(data)]) }], 'file');
    return (await request('/io/encode-pnm', { method: 'POST', body })).blob();
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
  /** A PNG written by the engine a band of rows at a time (1.61.2, DEV_PLAN 26.4): opened, fed rows top first, closed. `format` tiff (Deflate strips) and psd (merged picture, channel by channel) since 1.90.7. */
  async bandsBegin(width: number, height: number, ppi: number, icc: { bytes: Uint8Array; name: string } | null = null, format: 'png' | 'tiff' | 'psd' = 'png'): Promise<string> {
    const init: RequestInit = icc ? { method: 'POST', body: new Blob([icc.bytes as Uint8Array<ArrayBuffer>]), headers: { 'Content-Type': 'application/octet-stream' } } : { method: 'POST' };
    return ((await (await request(`/bands/${format}?width=${width}&height=${height}&ppi=${ppi}${icc ? `&name=${encodeURIComponent(icc.name)}` : ''}`, init)).json()) as { key: string }).key;
  },
  async bandsPut(key: string, rows: Uint8ClampedArray<ArrayBuffer>, format: 'png' | 'tiff' | 'psd' = 'png'): Promise<void> {
    // As a Blob (1.63.0): a typed-array body stayed in the page after the upload, past garbage collection (30 uploads
    // of 16 MB kept about 190 MB); a Blob is handed to the browser and leaves nothing.
    await request(`/bands/${format}/${key}`, { method: 'POST', body: new Blob([rows]), headers: { 'Content-Type': 'application/octet-stream' } });
  },
  async bandsEnd(key: string, format: 'png' | 'tiff' | 'psd' = 'png'): Promise<Blob> {
    return (await request(`/bands/${format}/${key}/end`, { method: 'POST' })).blob();
  },
  /** A layered PSD or PSB written in parts (SC-ED-0263): opened with every record (a folder is two, a marker that begins it and
   *  its own at the end), each layer's rows then fed band by band, the merged picture's rows last (`layer` null), closed for the file. */
  async psdLayersBegin(width: number, height: number, ppi: number, psb: boolean, layers: PsdPartSpec[], icc: string | null): Promise<string> {
    return ((await (await request(`/bands/psdl?width=${width}&height=${height}&ppi=${ppi}&psb=${psb}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layers, icc }) })).json()) as { key: string }).key;
  },
  async psdLayersPut(key: string, rows: Uint8ClampedArray<ArrayBuffer>, layer: number | null): Promise<void> {
    await request(`/bands/psdl/${key}${layer === null ? '' : `/${layer}`}`, { method: 'POST', body: new Blob([rows]), headers: { 'Content-Type': 'application/octet-stream' } });
  },
  async psdLayersEnd(key: string): Promise<Blob> {
    return (await request(`/bands/psdl/${key}/end`, { method: 'POST' })).blob();
  },
  /** A layered picture that will not be finished (the export was stopped or failed): the engine closes and deletes its spools. */
  async psdLayersDrop(key: string): Promise<void> {
    try { await request(`/bands/psdl/${key}`, { method: 'DELETE' }); } catch { /* an engine without the route keeps them until it restarts */ }
  },
  /** An opened project's PNG read by the engine a band of rows at a time (1.62.8): a giant layer's, past what a browser
   *  can decode. */
  async bandsReadOpen(session: string, file: string): Promise<{ key: string; width: number; height: number }> {
    return (await (await request(`/bands/read?session=${encodeURIComponent(session)}&file=${encodeURIComponent(file)}`, { method: 'POST' })).json()) as { key: string; width: number; height: number };
  },
  async bandsReadRows(key: string, rows: number): Promise<ArrayBuffer> {
    return (await request(`/bands/read/${key}?rows=${rows}`)).arrayBuffer();
  },
  /** Preferences > Scratch Disks: the folder the undo store and giant layers' tiles are kept in, its free space, and the default. */
  async scratch(): Promise<{ folder: string; default: string; free: number; custom: boolean } | null> {
    try { return (await (await request('/undo/scratch')).json()) as { folder: string; default: string; free: number; custom: boolean }; } catch { return null; }
  },
  /** New undo tiles go to `folder` (empty: the data folder); the engine says when the folder cannot be written. */
  async setScratch(folder: string): Promise<{ folder: string; default: string; free: number; custom: boolean }> {
    return (await (await request('/undo/scratch', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder }) })).json()) as { folder: string; default: string; free: number; custom: boolean };
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
  async mergePanorama(files: Array<{ name: string; blob: Blob }>, layout: 'auto' | 'reposition' | 'perspective' | 'cylindrical' | 'collage', crop: boolean, fix: { distortion?: boolean; vignette?: boolean } = {}): Promise<{ png: Blob; stitched: string; notes: { k1?: number; vignette?: string } }> {
    const r = await request('/merge/panorama', { method: 'POST', body: form({ layout, crop: String(crop), distortion: String(!!fix.distortion), vignette: String(!!fix.vignette) }, files.map((f) => ({ name: f.name, blob: f.blob })), 'file') });
    let notes = {};
    try { notes = JSON.parse(r.headers.get('X-Photomerge-Notes') ?? '{}'); } catch { notes = {}; }
    return { png: await r.blob(), stitched: r.headers.get('X-Photos-Stitched') ?? '', notes };
  },
  /** Photomerge as layers: each photo warped onto the shared canvas (PNG with alpha) with its seam mask (grey PNG); the
   *  masks tile the canvas, so the layers with their masks rebuild the joined picture. */
  async mergePanoramaLayers(files: Array<{ name: string; blob: Blob }>, layout: 'auto' | 'reposition' | 'perspective' | 'cylindrical' | 'collage', fix: { distortion?: boolean; vignette?: boolean } = {}): Promise<{ width: number; height: number; layers: Array<{ png: Blob; mask: Blob }>; notes: { k1?: number; vignette?: string } }> {
    const r = await request('/merge/panorama', { method: 'POST', body: form({ layout, layers: 'true', distortion: String(!!fix.distortion), vignette: String(!!fix.vignette) }, files.map((f) => ({ name: f.name, blob: f.blob })), 'file') });
    const d = (await r.json()) as { width: number; height: number; layers: Array<{ png: string; mask: string }>; notes: { k1?: number; vignette?: string } };
    const blob = (b64: string): Blob => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new Blob([a], { type: 'image/png' }); };
    return { width: d.width, height: d.height, notes: d.notes, layers: d.layers.map((l) => ({ png: blob(l.png), mask: blob(l.mask) })) };
  },
  /** File > Automate > Merge to HDR (1.58.2): the exposures merged by the engine into linear light (RGB floats), with
   *  the exposure times used and where they came from. */
  async mergeHdr(files: File[], opts: { align?: boolean; times?: number[]; ghost?: number; base?: number } = {}): Promise<{ width: number; height: number; rgb: Float32Array; times: number[]; source: string; ghosts: number }> {
    const r = await request('/merge/hdr', { method: 'POST', body: form({ align: String(opts.align !== false), times: (opts.times ?? []).join(','), ghost: String(opts.ghost ?? 0), base: String(opts.base ?? -1) }, files.map((f) => ({ name: f.name, blob: f })), 'file') });
    const b = new Uint8Array(await r.arrayBuffer()), n = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
    const head = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + n))) as { width: number; height: number; times: number[]; source: string; ghosts: number };
    return { ...head, rgb: new Float32Array(b.slice(4 + n).buffer) };
  },
  /** Edit > Auto-Align Layers (DEV_PLAN 32.1): each layer as a document-sized PNG, bottom-most first; a 3x3 matrix per
   *  layer (row-major, layer pixels to the reference's), identity for the reference. */
  async mergeAlign(layers: Blob[], projection: string, vignette: boolean, reference = 0, distortion = false, registration = 'features'): Promise<{ matrices: number[][]; layers: Array<{ inliers: number; kind: string; correlation?: number | null }>; vignette: string; warped?: Array<string | null>; lens?: { k1: number; error_before: number | null; error_after: number | null } | null; focal?: number | null }> {
    const r = await request('/merge/align', { method: 'POST', body: form({ projection, vignette: String(vignette), reference: String(reference), distortion: String(distortion), registration },layers.map((b, i) => ({ name: `layer${i}.png`, blob: b })), 'file') });
    return await r.json();
  },
  /** File > Automate > Crop and Straighten Photos (DEV_PLAN 30.3 part b): the photos found on a scan, each cut out and
   *  turned upright as a PNG (base64) with its source rectangle (centre, size and angle in the sent picture). */
  async cropPhotos(png: Blob): Promise<Array<{ png: string; width: number; height: number; rect: { cx: number; cy: number; w: number; h: number; angle: number } }>> {
    const r = await request('/merge/photos', { method: 'POST', body: form({}, [{ name: 'scan.png', blob: png }], 'file') });
    return (await r.json()).photos;
  },
  /** Edit > Auto-Blend Layers (DEV_PLAN 32.1): a grey mask PNG (base64) per layer and RGB tone gains per layer. */
  async mergeBlend(layers: Blob[], method: string, seamless: boolean, halo = 0, depth = false, spatial = true): Promise<{ masks: string[]; tones: number[][]; fields?: Array<{ w: number; h: number; data: number[] } | null>; depth?: string; blended?: string }> {
    const r = await request('/merge/blend', { method: 'POST', body: form({ method, seamless: String(seamless), halo: String(halo), depth: String(depth), spatial: String(spatial) }, layers.map((b, i) => ({ name: `layer${i}.png`, blob: b })), 'file') });
    return await r.json();
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
  /** An 8-bit grayscale file as stored (gray and alpha bytes) with its gray profile, or null when the file is not 8-bit gray. */
  async decodeGray(file: Blob, name: string): Promise<{ width: number; height: number; px: Uint8Array; icc: Uint8Array | null } | null> {
    const r = await request('/io/decode-gray', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') });
    if (r.status === 204) return null;
    const width = Number(r.headers.get('X-Width')), height = Number(r.headers.get('X-Height')), iccLen = Number(r.headers.get('X-Profile-Bytes') ?? 0), b = new Uint8Array(await r.arrayBuffer()), n = width * height * 2;
    return { width, height, px: b.slice(0, n), icc: iccLen ? b.slice(n, n + iccLen) : null };
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
  /** A layered Lab PSD (DEV_PLAN 36.11, colour mode 9): the composite's L, a, b bytes, then each layer's L, a, b and alpha
   *  (L over 0 to 255 for 0 to 100, a and b offset by 128), written by the engine. */
  async encodeLabPsd(doc: { width: number; height: number; layers: Array<{ name: string; left: number; top: number; width: number; height: number; opacity: number; visible: boolean; blend: string }> }, composite: Uint8Array, layers: Uint8Array[]): Promise<Blob> {
    const body = form({ meta: JSON.stringify(doc) }, [{ name: 'layers.raw', blob: new Blob([new Uint8Array(composite), ...layers.map((k) => new Uint8Array(k))]) }], 'file');
    return (await request('/io/encode-lab-psd', { method: 'POST', body })).blob();
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
  async save(name: string, manifest: object, files: FilePart[], base = '', thumb: Blob | null = null): Promise<{ name: string; path: string; version?: string; conflict?: boolean; kept?: string }> {
    const body = form({ name, manifest: JSON.stringify(manifest), base }, files);
    if (thumb) body.append('thumbnail', thumb, 'thumbnail.png');
    return (await (await request('/projects/save', { method: 'POST', body })).json()) as { name: string; path: string; version?: string; conflict?: boolean; kept?: string };
  },
  /** Save or Save As to a .fvd the person chose in the desktop app's save panel (1.87.0). */
  async saveTo(path: string, manifest: object, files: FilePart[], thumb: Blob | null): Promise<{ name: string; path: string; version?: string }> {
    const body = form({ path, manifest: JSON.stringify(manifest) }, files);
    if (thumb) body.append('thumbnail', thumb, 'thumbnail.png');
    return (await (await request('/projects/save-to', { method: 'POST', headers: LOCAL, body })).json()) as { name: string; path: string; version?: string };
  },
  /** A project file at a path on this computer (1.87.0). */
  async openPath(path: string): Promise<OpenedProject> {
    return (await (await request('/projects/open-path', { method: 'POST', headers: { ...LOCAL, 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })).json()) as OpenedProject;
  },
  /** Any file at a path on this computer as a File, to open like one dropped on the window (1.87.0). */
  async readPath(path: string): Promise<File> {
    const blob = await (await request('/io/read-path', { method: 'POST', headers: LOCAL, body: form({ path }) })).blob();
    return new File([blob], path.split(/[\\/]/).pop() || 'file');
  },
  /** An export written at a path the person chose in the desktop app's save panel (1.87.0). */
  async writePath(path: string, blob: Blob): Promise<string> {
    const r = await request('/io/write-path', { method: 'POST', headers: LOCAL, body: form({ path }, [{ name: 'file', blob }], 'file') });
    return ((await r.json()) as { path: string }).path;
  },
  /** Size and modification time of files on this computer (1.87.1), for Home's recent files. */
  async stat(paths: string[]): Promise<Array<{ path: string; exists: boolean; size: number; modified: number }>> {
    if (!paths.length) return [];
    try { return (await (await request('/io/stat', { method: 'POST', headers: { ...LOCAL, 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) })).json()) as Array<{ path: string; exists: boolean; size: number; modified: number }>; } catch { return []; }
  },
  /** The exports folder's files, newest first (1.87.0). */
  async outputs(): Promise<OutputItem[]> {
    try { return (await (await request('/io/outputs')).json()) as OutputItem[]; } catch { return []; }
  },
  /** A saved project's thumbnail PNG (1.87.0), or null for one saved before thumbnails. */
  async thumbnail(by: { name?: string; path?: string }): Promise<Blob | null> {
    const q = by.path ? `path=${encodeURIComponent(by.path)}` : `name=${encodeURIComponent(by.name ?? '')}`;
    try { return await (await request(`/projects/thumbnail?${q}`, { headers: LOCAL })).blob(); } catch { return null; }
  },
  /** Where the library is (1.58.8, L13), the default, and the synced folders found on this computer. */
  async libraryFolder(): Promise<LibraryFolder | null> {
    try { return (await (await request('/projects/folder')).json()) as LibraryFolder; } catch { return null; }
  },
  /** The library moved to `folder` (empty: the default), its projects moved there with `move`. */
  async setLibraryFolder(folder: string, move: boolean): Promise<LibraryFolder & { moved: number }> {
    return (await (await request('/projects/folder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder, move }) })).json()) as LibraryFolder & { moved: number };
  },
  async package(manifest: object, files: FilePart[], root = '', thumb: Blob | null = null): Promise<Blob> {
    const fields: Record<string, string> = { manifest: JSON.stringify(manifest) };
    if (root) fields.root = root;
    const body = form(fields, files);
    if (thumb) body.append('thumbnail', thumb, 'thumbnail.png');
    return (await request('/projects/package', { method: 'POST', body })).blob();
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
  async removeBackground(image: Blob, method: 'auto' | 'ml' | 'lite', matting = ''): Promise<{ mask: Blob; method: string }> {
    const r = await request('/ops/remove-background', { method: 'POST', body: form({ method, matting }, [{ name: 'layer.png', blob: image }], 'file') });
    return { mask: await r.blob(), method: r.headers.get('X-Method') ?? method };
  },
  /** The model files in the engine's matting folder, each with whether it can run and, if not, why. */
  async mattingModels(): Promise<Array<{ file: string; loadable: boolean; note: string }>> {
    try { return ((await (await request('/ops/matting-models')).json()) as { models: Array<{ file: string; loadable: boolean; note: string }> }).models; } catch { return []; }
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
  async encode(png: Blob, format: 'tiff' | 'pdf' | 'webp' | 'avif' | 'qoi' | 'pnm' | 'tga' | 'ico' | 'png8' | 'bmp' | 'fits' | 'wbmp' | 'png' | 'jpeg', quality = 90, dpi = 72, icc: Uint8Array | null = null, options: Record<string, unknown> | null = null): Promise<Blob> {
    const body = form({ format, quality: String(quality), dpi: String(dpi), ...(options ? { options: JSON.stringify(options) } : {}) }, [{ name: 'image.png', blob: png }], 'file');
    if (icc) body.append('icc', new Blob([icc as Uint8Array<ArrayBuffer>], { type: 'application/vnd.iccprofile' }), 'profile.icc');
    return (await request('/io/encode', { method: 'POST', body })).blob();
  },
  /** Artboards to PDF (29.4): one PNG per page, in order, each page at its own size from `dpi`; one PDF comes back. */
  async pdfPages(pages: Blob[], dpi: number, jpeg: boolean, quality: number, icc: Uint8Array | null): Promise<Blob> {
    const body = form({ dpi: String(dpi), jpeg: String(jpeg), quality: String(quality) }, pages.map((blob, i) => ({ name: `page-${i + 1}.png`, blob })), 'file');
    if (icc) body.append('icc', new Blob([icc as Uint8Array<ArrayBuffer>], { type: 'application/vnd.iccprofile' }), 'profile.icc');
    return (await request('/io/pdf-pages', { method: 'POST', body })).blob();
  },
  async exportFile(blob: Blob, name: string, folder = ''): Promise<string> {
    const r = await request('/io/export', { method: 'POST', body: form(folder ? { name, folder } : { name }, [{ name, blob }], 'file') });
    return ((await r.json()) as { path: string }).path;
  },
  /** A file written into `folder` beside the document at `document` (Image Assets on save); the path written. */
  async exportBeside(blob: Blob, name: string, document: string, folder: string): Promise<string> {
    const r = await request('/io/export-beside', { method: 'POST', headers: LOCAL, body: form({ name, document, folder }, [{ name, blob }], 'file') });
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
  async openClaude(opts: ClaudeOpen): Promise<TerminalInfo> {
    const info = (await (await request('/terminal/claude', json(opts))).json()) as Partial<TerminalInfo> | null;
    if (!info || typeof info.id !== 'string' || info.id === '') throw new ApiError('Claude Code did not start.', 502);
    return info as TerminalInfo;
  },
  async claudeCodeStatus(): Promise<ClaudeCodeStatus | null> {
    let now: Partial<ClaudeCodeStatus> | null = null;
    try { now = (await (await request('/claude-code/status')).json()) as Partial<ClaudeCodeStatus>; } catch { now = null; }
    if (now?.installed === true) return { installed: true, version: now.version ?? null, install: '', signedIn: now.signedIn ?? null };
    const old = await api.claudeStatus();
    if (!now && !old) return null;
    return { installed: now ? false : old?.installed === true, version: now?.version ?? old?.version ?? null, install: now?.install || old?.install || '', signedIn: now?.signedIn ?? old?.signedIn ?? null };
  },
  async claudeStatus(fresh = false): Promise<ClaudeStatus | null> {
    try { return (await (await request(`/agent/claude/status${fresh ? '?fresh=true' : ''}`)).json()) as ClaudeStatus; } catch { return null; }
  },
  async claudeStart(mode: AgentMode, fresh = false): Promise<void> { await request('/agent/claude/start', json({ mode, fresh })); },
  async claudeSend(text: string): Promise<void> { await request('/agent/claude/send', json({ text })); },
  async claudeStop(): Promise<void> { await request('/agent/claude/stop', { method: 'POST' }); },
  async claudeAllow(id: string, allow: boolean): Promise<void> { await request('/agent/claude/permission', json({ id, allow })); },
};

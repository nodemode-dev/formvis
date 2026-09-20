export interface Capabilities {
  name: string;
  version: string;
  desktop: boolean;
  decode: { heic: boolean; tiff: boolean; engine: string };
  removeBackground: { ml: boolean; lite: boolean; default: 'ml' | 'lite' | null; model: string };
  dataDir: string;
}
export interface LibraryItem { name: string; modified: number; size: number }
export interface OpenedProject { session: string; name: string; manifest: Record<string, unknown>; images: Record<string, string> }
export interface FilePart { name: string; blob: Blob }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await fetch(`/api${path}`, init); } catch {
    throw new ApiError('The sonny engine is not reachable. Start it with ./sonny boot.', 0);
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
  async exportFile(blob: Blob, name: string): Promise<string> {
    return ((await (await request('/io/export', { method: 'POST', body: form({ name }, [{ name, blob }], 'file') })).json()) as { path: string }).path;
  },
};

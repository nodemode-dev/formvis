import { Raster, uid, type Engine, type SmartLink } from '../engine';
import { decodeImage } from './images';

/** Linked smart objects' files. A source gives the file's current contents; with the File System Access API
 *  (Chromium browsers) it wraps a file handle, kept in IndexedDB so links survive a reload and re-read the file when it
 *  changes on disk; elsewhere it is the file picked once, so the link is kept but later changes cannot be seen. Tests
 *  and extensions can register their own sources. */
export interface LinkSource { name: string; live: boolean; getFile(): Promise<File> }

const sources = new Map<string, LinkSource>();
const DB = 'formvis-links', STORE = 'handles';

type Handle = { name: string; getFile(): Promise<File>; queryPermission?(o: { mode: string }): Promise<string>; requestPermission?(o: { mode: string }): Promise<string> };

function db(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function keep(id: string, handle: Handle): Promise<void> {
  const d = await db();
  if (!d) return;
  try { d.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, id); } catch { /* handles that cannot be stored stay in memory only */ }
}

async function recall(id: string): Promise<Handle | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      r.onsuccess = () => resolve((r.result as Handle | undefined) ?? null);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

const fromHandle = (h: Handle): LinkSource => ({
  name: h.name, live: true,
  async getFile() {
    if (h.queryPermission && (await h.queryPermission({ mode: 'read' })) !== 'granted' && h.requestPermission && (await h.requestPermission({ mode: 'read' })) !== 'granted') throw new Error(`Permission to read ${h.name} was not given.`);
    return h.getFile();
  },
});

export function registerLinkSource(id: string, s: LinkSource): void { sources.set(id, s); }

async function sourceFor(id: string): Promise<LinkSource | null> {
  const s = sources.get(id);
  if (s) return s;
  const h = await recall(id);
  if (!h) return null;
  const made = fromHandle(h);
  sources.set(id, made);
  return made;
}

/** Asks for a file to link: a handle where the browser has them, else a one-time pick through `fallback`. */
export async function pickLinkSource(fallback: () => Promise<File | null>): Promise<{ id: string; source: LinkSource } | null> {
  const picker = (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<Handle[]> }).showOpenFilePicker;
  const id = uid();
  if (picker) {
    try {
      const [h] = await picker({ types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tif', '.tiff', '.dpx', '.heic', '.psd', '.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2', '.pef', '.srw'] } }] });
      if (!h) return null;
      const source = fromHandle(h);
      sources.set(id, source);
      void keep(id, h);
      return { id, source };
    } catch (err) { if ((err as { name?: string }).name === 'AbortError') return null; }
  }
  const f = await fallback();
  if (!f) return null;
  const source: LinkSource = { name: f.name, live: false, getFile: async () => f };
  sources.set(id, source);
  return { id, source };
}

async function read(source: LinkSource): Promise<{ raster: Raster; file: File }> {
  const file = await source.getFile(), img = await decodeImage(file, file.name), raster = new Raster(img.width, img.height);
  raster.ctx.drawImage(img.source, 0, 0);
  return { raster, file };
}

const meta = (id: string, f: File): SmartLink => ({ id, name: f.name, size: f.size, lastModified: f.lastModified });

/** File > Place Linked, from a picked or registered source. */
export async function placeLinked(engine: Engine, id: string, source: LinkSource): Promise<void> {
  const { raster, file } = await read(source);
  engine.placeLinked(raster, meta(id, file), file.name.replace(/\.[^.]+$/, ''));
}

/** Layer > Update Modified Content: every linked smart object in the document whose file changed since it was read is
 *  re-read, each as one step. Returns how many were updated and the names that could not be reached. */
export async function updateLinked(engine: Engine): Promise<{ updated: number; missing: string[] }> {
  const p = engine.current, out = { updated: 0, missing: [] as string[] };
  if (!p) return out;
  for (const l of p.doc.layers) {
    const link = l.smart?.link;
    if (!link) continue;
    const s = await sourceFor(link.id);
    if (!s) { out.missing.push(link.name); continue; }
    let file: File;
    try { file = await s.getFile(); } catch { out.missing.push(link.name); continue; }
    if (file.lastModified === link.lastModified && file.size === link.size) continue;
    const { raster } = await read({ ...s, getFile: async () => file });
    if (engine.updateLinkedContents(l.id, raster, meta(link.id, file))) out.updated++;
  }
  return out;
}

/** Layer > Relink to File: the active linked smart object takes a newly picked file. */
export async function relink(engine: Engine, fallback: () => Promise<File | null>): Promise<void> {
  const l = engine.current?.activeLayer;
  if (!l?.smart) return;
  const picked = await pickLinkSource(fallback);
  if (!picked) return;
  const { raster, file } = await read(picked.source);
  engine.updateLinkedContents(l.id, raster, meta(picked.id, file), 'Relink to File');
}

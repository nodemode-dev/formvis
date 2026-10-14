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
      const [h] = await picker({ types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tif', '.tiff', '.dpx', '.qoi', '.tga', '.ico', '.pgm', '.ppm', '.pam', '.heic', '.psd', '.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2', '.pef', '.srw'] } }] });
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

/** File > Place Embedded: a picked image file becomes an embedded smart object, its pixels kept inside the document. */
export async function placeEmbedded(engine: Engine, file: File): Promise<void> {
  const img = await decodeImage(file, file.name), raster = new Raster(img.width, img.height);
  raster.ctx.drawImage(img.source, 0, 0);
  engine.placeEmbedded(raster, file.name.replace(/\.[^.]+$/, ''));
}

/** File > Package: the files behind the document's linked smart objects, named Links/<file name> (repeats numbered).
 *  Links whose file cannot be reached are listed by name in `missing`. */
export async function linkedFiles(engine: Engine): Promise<{ files: { name: string; blob: Blob }[]; missing: string[] }> {
  const p = engine.current, out = { files: [] as { name: string; blob: Blob }[], missing: [] as string[] };
  if (!p) return out;
  const seen = new Set<string>(), used = new Set<string>();
  for (const l of p.doc.layers) {
    const link = l.smart?.link;
    if (!link || seen.has(link.id)) continue;
    seen.add(link.id);
    const s = await sourceFor(link.id);
    if (!s) { out.missing.push(link.name); continue; }
    let file: File;
    try { file = await s.getFile(); } catch { out.missing.push(link.name); continue; }
    const dot = file.name.lastIndexOf('.'), stem = dot > 0 ? file.name.slice(0, dot) : file.name, ext = dot > 0 ? file.name.slice(dot) : '';
    let name = file.name, n = 2;
    while (used.has(name.toLowerCase())) name = `${stem} ${n++}${ext}`;
    used.add(name.toLowerCase());
    out.files.push({ name: `Links/${name}`, blob: file });
  }
  return out;
}

/** Layer > Smart Objects > Convert to Linked: the active embedded smart object's contents are written as a PNG named
 *  after the layer, to a file the person picks where the browser can save to one (kept as a handle, so the link sees
 *  later edits), else held in the link store for the session; the object then links to it. One undo step. */
export async function convertToLinked(engine: Engine): Promise<boolean> {
  const c = engine.smartContents(), l = engine.current?.activeLayer;
  if (!c || !l?.smart || l.smart.link) return false;
  const name = `${c.name.replace(/[\\/:*?"<>|]+/g, '_') || 'Smart Object'}.png`;
  const cv = c.raster.canvas as HTMLCanvasElement | OffscreenCanvas;
  const blob = 'convertToBlob' in cv ? await cv.convertToBlob({ type: 'image/png' }) : await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
  if (!blob) throw new Error('The contents could not be encoded.');
  const id = uid(), saver = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<Handle & { createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }> }).showSaveFilePicker;
  let file = new File([blob], name, { type: 'image/png', lastModified: Date.now() }), source: LinkSource = { name, live: false, getFile: async () => file };
  if (saver) {
    try {
      const h = await saver({ suggestedName: name, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] }), w = await h.createWritable();
      await w.write(blob); await w.close();
      file = await h.getFile();
      source = fromHandle(h);
      void keep(id, h);
    } catch (err) { if ((err as { name?: string }).name === 'AbortError') return false; }
  }
  sources.set(id, source);
  return engine.convertToLinked(meta(id, file));
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

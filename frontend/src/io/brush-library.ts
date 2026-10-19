import type { Engine } from '../engine';
import { parseAbr, type SampledTip } from '../engine/abr';
import { abrImport, brushGroupOf, defaultShape, importedBrushPresets, presetFromTip, setImportedBrushPresets, type BrushPreset, type BrushShape } from '../engine/brush-dynamics';

/** Imported brushes: .abr files read for their sampled tips, each tip a preset in the Brush tool's list, kept in
 *  IndexedDB (tips can run to megabytes, past what localStorage holds) so they survive a reload. */

const DB = 'formvis-brushes', STORE = 'presets', KEY = 'imported';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function save(list: BrushPreset[]): Promise<boolean> {
  const d = await open();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const t = d.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(list, KEY);
      t.oncomplete = () => resolve(true);
      t.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

/** Loads the kept brushes into the preset list; well-formed entries only. */
export async function loadImportedBrushes(): Promise<void> {
  const d = await open();
  if (!d) return;
  const got = await new Promise<unknown>((resolve) => {
    try { const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); } catch { resolve(null); }
  });
  if (!Array.isArray(got)) return;
  const tipOk = (p: BrushPreset): boolean => !p.tip || (p.tip.data instanceof Uint8Array && p.tip.data.length === p.tip.w * p.tip.h);
  setImportedBrushPresets(got.filter((p): p is BrushPreset => !!p && typeof p === 'object' && typeof (p as BrushPreset).id === 'string' && typeof (p as BrushPreset).name === 'string' && (!!(p as BrushPreset).tip || typeof (p as BrushPreset).diameter === 'number') && tipOk(p as BrushPreset)));
}

const SHAPE_KEYS = ['sizeJitter', 'angleJitter', 'roundnessJitter', 'scatter', 'count', 'countJitter', 'noise', 'wetEdges', 'flipX', 'flipY', 'bothAxes'] as const;

/** The brush as it is now as a preset: size, hardness, opacity, flow, dynamics, tip, angle, roundness, spacing and the shape fields that differ from a plain round brush. */
export function presetFromBrush(engine: Engine, id: string, name: string, group: string): BrushPreset {
  const sh = engine.brushShape as unknown as Record<string, unknown>, def = defaultShape() as unknown as Record<string, unknown>, shape: Record<string, unknown> = {};
  for (const k of SHAPE_KEYS) if (sh[k] !== undefined && sh[k] !== def[k]) shape[k] = sh[k];
  const b = engine.brush;
  return { id, name, description: `Saved from the current brush, ${b.diameter} px.`, diameter: b.diameter, hardness: b.hardness, opacity: b.opacity, dynamics: structuredClone(engine.brushDynamics), ...(b.tip ? { tip: b.tip } : {}), angle: engine.brushShape.angle, roundness: engine.brushShape.roundness, ...(engine.brushShape.spacing ? { spacing: engine.brushShape.spacing } : {}), flow: engine.brushFlow, group, ...(Object.keys(shape).length ? { shape: shape as Partial<BrushShape> } : {}) };
}

/** Saves the current brush as a preset in a folder (My Brushes unless named) and selects it. */
export async function saveBrushPreset(engine: Engine, name: string, group = 'My Brushes'): Promise<{ preset: BrushPreset; kept: boolean }> {
  const preset = presetFromBrush(engine, `user-${Date.now().toString(36)}`, name.trim().slice(0, 80) || 'Brush', group.trim().slice(0, 60) || 'My Brushes');
  const list = [...importedBrushPresets, preset];
  setImportedBrushPresets(list);
  const kept = await save(list);
  engine.brushPresetId = preset.id;
  engine.emit('options', null);
  return { preset, kept };
}

/** Rewrites a saved preset from the brush as it is now, keeping its id, name and folder. Built-in and imported presets are left alone (null). */
export async function updateBrushPreset(engine: Engine, id: string): Promise<{ preset: BrushPreset; kept: boolean } | null> {
  const cur = importedBrushPresets.find((p) => p.id === id && p.id.startsWith('user-'));
  if (!cur) return null;
  const preset = presetFromBrush(engine, cur.id, cur.name, brushGroupOf(cur));
  const list = importedBrushPresets.map((p) => (p.id === id ? preset : p));
  setImportedBrushPresets(list);
  const kept = await save(list);
  engine.brushPresetId = preset.id;
  engine.emit('options', null);
  return { preset, kept };
}

/** Adds a preset made by New Brush Preset (Brush Settings) to the kept presets and selects it. */
export async function addMadeBrushPreset(engine: Engine, preset: BrushPreset): Promise<{ kept: boolean }> {
  const list = [...importedBrushPresets, preset];
  setImportedBrushPresets(list);
  const kept = await save(list);
  engine.brushPresetId = preset.id;
  engine.emit('options', null);
  return { kept };
}

/** Moves a saved or imported preset into a folder, before another preset when one is named, else last. Built-in presets stay where they are. */
export async function moveBrushPreset(id: string, group: string | null, beforeId: string | null = null): Promise<boolean> {
  const cur = importedBrushPresets.find((p) => p.id === id);
  if (!cur || id === beforeId) return false;
  const target = group === null ? undefined : group.trim().slice(0, 60);
  const moved: BrushPreset = target ? { ...cur, group: target } : cur;
  const rest = importedBrushPresets.filter((p) => p.id !== id), at = beforeId ? rest.findIndex((p) => p.id === beforeId) : -1;
  const list = at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)];
  setImportedBrushPresets(list);
  return save(list);
}

/** Renames a folder of saved or imported presets; built-in folders keep their names. */
export async function renameBrushGroup(from: string, to: string): Promise<boolean> {
  const n = to.trim().slice(0, 60);
  const within = (p: BrushPreset): boolean => brushGroupOf(p) === from || brushGroupOf(p).startsWith(`${from}/`);
  if (!n || n === from || !importedBrushPresets.some(within)) return false;
  const list = importedBrushPresets.map((p) => (within(p) ? { ...p, group: n + brushGroupOf(p).slice(from.length) } : p));
  setImportedBrushPresets(list);
  return save(list);
}

/** Removes an imported brush and keeps the rest. Built-in presets are not in this list, so they are never removed. */
export async function removeImportedBrush(id: string): Promise<boolean> {
  if (!importedBrushPresets.some((p) => p.id === id)) return false;
  const list = importedBrushPresets.filter((p) => p.id !== id);
  setImportedBrushPresets(list);
  return save(list);
}

/** Renames an imported brush and keeps the list. */
export async function renameImportedBrush(id: string, name: string): Promise<boolean> {
  const n = name.trim().slice(0, 80);
  if (!n || !importedBrushPresets.some((p) => p.id === id)) return false;
  const list = importedBrushPresets.map((p) => (p.id === id ? { ...p, name: n } : p));
  setImportedBrushPresets(list);
  return save(list);
}

/** Adds one sampled tip (from Define Brush Preset) to the kept presets and selects it. */
export async function addSampledBrush(engine: Engine, name: string, tip: SampledTip, spacing = 25): Promise<{ kept: boolean }> {
  const preset = presetFromTip(`user-${Date.now().toString(36)}`, name, tip, spacing);
  const made: BrushPreset = { ...preset, description: `Defined from the image, ${tip.w} x ${tip.h} px, spacing ${spacing}%.` };
  const list = [...importedBrushPresets, made];
  setImportedBrushPresets(list);
  const kept = await save(list);
  engine.applyBrushPreset(made);
  return { kept };
}

/** A picture file as a sampled tip, up to 2500 px a side: dark paints, transparency does not (coverage = (255 - luminance) * alpha / 255). */
async function tipFromImage(file: File): Promise<SampledTip> {
  const bmp = await createImageBitmap(file);
  try {
    if (bmp.width > 2500 || bmp.height > 2500) throw new Error('A brush tip can be at most 2500 by 2500 pixels.');
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('The picture could not be read.');
    g.drawImage(bmp, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data, data = new Uint8Array(c.width * c.height);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(((255 - (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2])) * px[i * 4 + 3]) / 255);
    return { w: c.width, h: c.height, data };
  } finally { bmp.close(); }
}

/** Reads an .abr file, adds its tips as presets (named after the file) and selects the first. Returns how many. A picture
 *  file (PNG, JPEG, WebP and the like) becomes one sampled tip named after it. */
export async function importAbr(engine: Engine, file: File): Promise<{ added: number; kept: boolean }> {
  if (!/\.abr$/i.test(file.name) && (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))) {
    const r = await addSampledBrush(engine, file.name.replace(/\.[^.]+$/, ''), await tipFromImage(file));
    return { added: 1, kept: r.kept };
  }
  const base = file.name.replace(/\.abr$/i, ''), brushes = parseAbr(await file.arrayBuffer(), base);
  if (!brushes.length) return { added: 0, kept: true };
  const stamp = Date.now().toString(36), root = base.slice(0, 60) || 'Imported Brushes', made = brushes.map((b, i) => ({ ...presetFromTip(`abr-${stamp}-${i}`, b.name, b.tip, b.spacing * 100), group: (b.folder ? `${root}/${b.folder}` : root).slice(0, 200) }));
  const list = [...(abrImport.replace ? importedBrushPresets.filter((p) => !p.id.startsWith('abr-')) : importedBrushPresets), ...made];
  setImportedBrushPresets(list);
  const kept = await save(list);
  if (abrImport.select) engine.applyBrushPreset(made[0]);
  return { added: made.length, kept };
}

const tipToText = (d: Uint8Array): string => { let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000)); return btoa(s); };

/** The saved and imported brushes (not the built-in ones) as a list that JSON holds: a sampled tip's pixels as base64. */
export function brushesToJson(): unknown[] {
  return importedBrushPresets.map((p) => (p.tip ? { ...p, tip: { w: p.tip.w, h: p.tip.h, data: tipToText(p.tip.data) } } : { ...p }));
}

/** Adds brushes written by brushesToJson, each under a new id; entries that are not well formed are skipped. Returns how many. */
export async function addBrushesFromJson(raw: unknown): Promise<number> {
  if (!Array.isArray(raw)) return 0;
  const stamp = Date.now().toString(36), made: BrushPreset[] = [];
  raw.forEach((r, i) => {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    if (!o || typeof o.name !== 'string' || !o.name.trim() || !o.dynamics || typeof o.dynamics !== 'object') return;
    const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    const base: BrushPreset = { ...(o as unknown as BrushPreset), id: `set-${stamp}-${i}`, name: o.name.slice(0, 80), description: typeof o.description === 'string' ? o.description.slice(0, 200) : '', diameter: num(o.diameter, 1, 5000, 40), hardness: num(o.hardness, 0, 1, 1), opacity: num(o.opacity, 0.01, 1, 1) };
    const t = o.tip && typeof o.tip === 'object' ? (o.tip as Record<string, unknown>) : null;
    if (t) {
      const w = Math.round(num(t.w, 0, 2500, 0)), h = Math.round(num(t.h, 0, 2500, 0));
      let data: Uint8Array | null = null;
      try { if (typeof t.data === 'string') { const b = atob(t.data); data = new Uint8Array(b.length); for (let k = 0; k < b.length; k++) data[k] = b.charCodeAt(k); } } catch { data = null; }
      if (!w || !h || !data || data.length !== w * h) return;
      base.tip = { w, h, data };
    } else delete base.tip;
    made.push(base);
  });
  if (!made.length) return 0;
  const list = [...importedBrushPresets, ...made];
  setImportedBrushPresets(list);
  await save(list);
  return made.length;
}

/** Moves a saved or imported brush one place up or down among the saved ones. */
export async function stepBrushPreset(id: string, by: -1 | 1): Promise<boolean> {
  const i = importedBrushPresets.findIndex((p) => p.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= importedBrushPresets.length) return false;
  const list = [...importedBrushPresets];
  [list[i], list[j]] = [list[j], list[i]];
  setImportedBrushPresets(list);
  return save(list);
}

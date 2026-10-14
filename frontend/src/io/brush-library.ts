import type { Engine } from '../engine';
import { parseAbr, type SampledTip } from '../engine/abr';
import { importedBrushPresets, presetFromTip, setImportedBrushPresets, type BrushPreset } from '../engine/brush-dynamics';

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
  setImportedBrushPresets(got.filter((p): p is BrushPreset => !!p && typeof p === 'object' && typeof (p as BrushPreset).id === 'string' && !!(p as BrushPreset).tip && (p as BrushPreset).tip!.data instanceof Uint8Array && (p as BrushPreset).tip!.data.length === (p as BrushPreset).tip!.w * (p as BrushPreset).tip!.h));
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
  const preset = presetFromTip(`user-${Date.now().toString(36)}`, name, tip);
  const made: BrushPreset = { ...preset, description: `Defined from the image, ${tip.w} x ${tip.h} px, spacing ${spacing}%.` };
  const list = [...importedBrushPresets, made];
  setImportedBrushPresets(list);
  const kept = await save(list);
  engine.applyBrushPreset(made);
  return { kept };
}

/** Reads an .abr file, adds its tips as presets (named after the file) and selects the first. Returns how many. */
export async function importAbr(engine: Engine, file: File): Promise<{ added: number; kept: boolean }> {
  const base = file.name.replace(/\.abr$/i, ''), brushes = parseAbr(await file.arrayBuffer(), base);
  if (!brushes.length) return { added: 0, kept: true };
  const stamp = Date.now().toString(36), made = brushes.map((b, i) => presetFromTip(`abr-${stamp}-${i}`, b.name, b.tip));
  const list = [...importedBrushPresets, ...made];
  setImportedBrushPresets(list);
  const kept = await save(list);
  engine.applyBrushPreset(made[0]);
  return { added: made.length, kept };
}

import type { Engine } from '../engine';
import { parseAbr } from '../engine/abr';
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

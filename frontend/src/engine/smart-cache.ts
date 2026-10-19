// A smart object's render cache (PC-EN-0473): every filter stage's output and the finished render are kept as pixel arrays,
// keyed by the source's identity and version, the padding and the stack up to that stage, so an edit to the stack re-runs
// only from the first stage that changed and an unchanged smart object is not rendered again. Entries are copied in and
// out (a filter may write into its input), the budget is in bytes and the least recently used entries go first.
import type { Raster } from './surface';
import type { SmartFilter } from './types';

const BUDGET = 128 * 1024 * 1024;
const store = new Map<string, ImageData>();
let held = 0, on = true, hits = 0, misses = 0;

const size = (i: ImageData): number => i.data.byteLength;
export const copyImage = (i: ImageData): ImageData => new ImageData(new Uint8ClampedArray(i.data), i.width, i.height);

export interface SmartKeys { stages: string[]; done: string }

/** The key of every stage of `shown` over `source` padded by `margin`, and of the render finished through `mask`. */
export function smartKeys(source: Raster, margin: number, shown: readonly SmartFilter[], mask: Raster | null): SmartKeys {
  let key = `${source.id}:${source.version}:${source.width}x${source.height}:${margin}`;
  const stages = shown.map((f) => (key += `|${f.kind}:${f.blend ?? 'normal'}:${f.opacity ?? 100}:${JSON.stringify(f.settings)}`));
  return { stages, done: mask ? `${key}|mask:${mask.id}:${mask.version}` : key };
}

/** The pixels kept under `key`, a copy unless `own` is false; null when there are none or the cache is off. */
export function cachedStage(key: string, own = true): ImageData | null {
  const hit = on ? store.get(key) : undefined;
  if (!hit) { if (on) misses++; return null; }
  hits++;
  store.delete(key);
  store.set(key, hit);
  return own ? copyImage(hit) : hit;
}

export function keepStage(key: string, img: ImageData): void {
  if (!on || size(img) > BUDGET / 3) return;
  const old = store.get(key);
  if (old) { held -= size(old); store.delete(key); }
  store.set(key, copyImage(img));
  held += size(img);
  for (const [k, v] of store) {
    if (held <= BUDGET) break;
    store.delete(k);
    held -= size(v);
  }
}

/** Turns the cache on or off (off also empties it); the render is the same either way, only its time differs. */
export function setSmartCache(enabled: boolean): void {
  on = enabled;
  if (!enabled) { store.clear(); held = 0; }
}

export function smartCacheStats(): { entries: number; bytes: number; hits: number; misses: number; on: boolean } {
  return { entries: store.size, bytes: held, hits, misses, on };
}

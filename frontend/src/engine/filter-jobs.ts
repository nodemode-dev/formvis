import type { DevelopState } from './develop';
import type { ShakeSettings, SmartSharpenSettings } from './filters-more';
import type { GalleryKind, GallerySettings } from './blur-gallery';

/** The main-thread side of the filter worker: one worker, kept alive, with numbered jobs. `runFilterOffThread`
 *  returns null where module workers are unavailable (or after a failure), so callers fall back to running the kernel
 *  themselves. Requests carry the pixels as a transferred buffer, so neither side copies them. */

export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState; lensRadius: number; lensBrightness: number; lensThreshold: number; smart: SmartSharpenSettings; shake: ShakeSettings; gallery: GallerySettings }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction' | GalleryKind;
export interface FilterJob { id: number; kind: FilterKind; settings: FilterSettings; scale: number; seed: number; width: number; height: number; pixels: ArrayBuffer }
interface FilterResult { id: number; width: number; height: number; pixels: ArrayBuffer }

let worker: Worker | null = null;
let broken = false;
let nextId = 1;
const waiting = new Map<number, (img: ImageData) => void>();

function start(): Worker | null {
  if (broken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./filter-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<FilterResult>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(new ImageData(new Uint8ClampedArray(e.data.pixels), e.data.width, e.data.height));
    };
    worker.onerror = () => { broken = true; worker?.terminate(); worker = null; for (const [, done] of waiting) done(new ImageData(1, 1)); waiting.clear(); };
  } catch {
    broken = true;
    worker = null;
  }
  return worker;
}

/** Runs one filter in the worker, or null when there is none to run it in. `src` is left untouched. */
export function runFilterOffThread(kind: FilterKind, settings: FilterSettings, scale: number, seed: number, src: ImageData): Promise<ImageData> | null {
  const w = start();
  if (!w) return null;
  const copy = new Uint8ClampedArray(src.data);
  const id = nextId++;
  const job: FilterJob = { id, kind, settings, scale, seed, width: src.width, height: src.height, pixels: copy.buffer as ArrayBuffer };
  return new Promise<ImageData>((resolve) => {
    waiting.set(id, resolve);
    try { w.postMessage(job, [job.pixels]); } catch { waiting.delete(id); broken = true; resolve(src); }
  });
}

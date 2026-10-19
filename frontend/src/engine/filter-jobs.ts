import type { DevelopState } from './develop';
import type { LensFix } from './filters';
import type { LensIris, ShakeSettings, SmartSharpenSettings } from './filters-more';
import type { GalleryKind, GallerySettings } from './blur-gallery';
import type { LibColors, LibFrame, LibKind, LibValues } from './filter-library';
import { runFilterOnGpu } from './gpu-filters';

/** The main-thread side of the filter worker: one long-lived worker takes numbered jobs, and pixels travel as
 *  transferred buffers. `runFilterOffThread` answers null where module workers are missing or after a failure, so the
 *  caller filters on its own. */

export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; lensFix?: LensFix; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState; lensRadius: number; lensBrightness: number; lensThreshold: number; lensIris?: LensIris; smart: SmartSharpenSettings; shake: ShakeSettings; gallery: GallerySettings; lib?: Partial<Record<LibKind, LibValues>>; colors?: LibColors }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction' | GalleryKind | LibKind;
export interface FilterJob { id: number; kind: FilterKind; settings: FilterSettings; scale: number; seed: number; width: number; height: number; pixels: ArrayBuffer; frame?: LibFrame | null }
export interface FilterResult { id: number; width: number; height: number; pixels: ArrayBuffer }

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const waiting = new Map<number, (img: ImageData) => void>();

function start(): Worker | null {
  if (failed) return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./filter-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FilterResult>) => {
      const { id, width, height, pixels } = e.data, done = waiting.get(id);
      waiting.delete(id);
      done?.(new ImageData(new Uint8ClampedArray(pixels), width, height));
    };
    w.onerror = () => {
      failed = true; w.terminate(); worker = null;
      for (const done of waiting.values()) done(new ImageData(1, 1));
      waiting.clear();
    };
    worker = w;
  } catch { failed = true; worker = null; }
  return worker;
}

/** The filter run in the worker, or null when there is none; `src` is left as it is. */
export function runFilterOffThread(kind: FilterKind, settings: FilterSettings, scale: number, seed: number, src: ImageData, frame?: LibFrame | null): Promise<ImageData> | null {
  const onGpu = runFilterOnGpu(kind, settings, scale, seed, src, frame?.canvas ?? null);   // 36.10: a registered GPU runner takes what it can
  if (onGpu) return Promise.resolve(onGpu);
  const w = start();
  if (!w) return null;
  const copy = new Uint8ClampedArray(src.data);
  const id = nextId++;
  const job: FilterJob = { id, kind, settings, scale, seed, width: src.width, height: src.height, pixels: copy.buffer as ArrayBuffer, frame: frame ?? null };
  return new Promise<ImageData>((resolve) => {
    waiting.set(id, resolve);
    try { w.postMessage(job, [job.pixels]); }
    catch { waiting.delete(id); failed = true; resolve(src); }
  });
}

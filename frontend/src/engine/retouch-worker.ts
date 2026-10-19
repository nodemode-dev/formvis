/// <reference lib="webworker" />
import { contentFill, type FillOptions } from './retouch';

export interface FillJob { id: number; pixels: ArrayBuffer; hole: ArrayBuffer; width: number; height: number; options: FillOptions }
export interface FillResult { id: number; ok: boolean; pixels: ArrayBuffer }

/** Content-aware fills run here, off the main thread, so a large Content-Aware Move does not hold the window. */
onmessage = (e: MessageEvent<FillJob>) => {
  const job = e.data, px = new Uint8ClampedArray(job.pixels), ok = contentFill(px, new Uint8Array(job.hole), job.width, job.height, null, job.options);
  postMessage({ id: job.id, ok, pixels: px.buffer } satisfies FillResult, [px.buffer]);
};

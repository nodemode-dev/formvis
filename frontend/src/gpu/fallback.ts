import type { GpuMode } from './probe';

/** Every rule that sends drawing from the GPU back to the CPU, in one place (Phase 18.3), each returning the reason to
 *  show in the status bar and Preferences, or null when the GPU draws. The renderer rules come first (is there a GPU
 *  display at all), then the per-document rules (can it draw this document, this frame). */

export interface RendererState { mode: GpuMode; chosenReason: string; displayReady: boolean; displayFailed: boolean }

/** Whether the GPU display draws at all: the chosen mode, a display that started and was not lost. */
export function rendererFallback(s: RendererState): string | null {
  if (s.mode === 'cpu') return s.chosenReason;
  if (s.mode === 'webgl2') return 'WebGL2 is chosen, but its renderer is not built yet, so drawing is on the CPU';
  if (s.displayFailed) return 'WebGPU could not start or was lost, so drawing is on the CPU';
  if (!s.displayReady) return 'WebGPU is starting';
  return null;
}

export interface FrameLayer { width: number; height: number }
export interface FrameLimits { maxTexture: number; memoryBytes: number }

/** Bytes a frame holds on the GPU: every layer's texture and the two screen-sized composites. */
export const frameBytes = (layers: readonly FrameLayer[], W: number, H: number): number => layers.reduce((s, l) => s + l.width * l.height * 4, 0) + W * H * 8;

/** Whether the GPU can draw this document this frame: what the engine says the GPU path does not draw yet, a layer
 *  larger than the GPU's texture limit (tiling it is a later step), then Preferences' GPU memory limit. */
export function documentFallback(doc: { layers: readonly FrameLayer[] } | { reason: string }, W: number, H: number, lim: FrameLimits): string | null {
  if ('reason' in doc) return `this document has ${doc.reason}`;
  const big = doc.layers.find((l) => l.width > lim.maxTexture || l.height > lim.maxTexture);
  if (big) return `a layer (${big.width} x ${big.height} px) is larger than this GPU's ${lim.maxTexture} px texture limit`;
  if (frameBytes(doc.layers, W, H) > lim.memoryBytes) return 'this document is over the GPU memory limit';
  return null;
}

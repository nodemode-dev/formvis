import type { GpuMode } from './probe';

/** Every rule that sends drawing from the GPU back to the CPU, in one place (Phase 18.3), each returning the reason to
 *  show in the status bar and Preferences, or null when the GPU draws. The renderer rules come first (is there a GPU
 *  display at all), then the per-document rules (can it draw this document, this frame). */

export interface RendererState { mode: GpuMode; chosenReason: string; displayReady: boolean; displayFailed: boolean; failure?: string | null }

/** Whether a GPU display draws at all: the chosen mode (WebGPU or WebGL2), a display that started and was not lost. */
export function rendererFallback(s: RendererState): string | null {
  if (s.mode === 'cpu') return s.chosenReason;
  const api = s.mode === 'webgpu' ? 'WebGPU' : s.mode === 'native' ? 'The native renderer' : 'WebGL2';
  if (s.displayFailed) return `${api} could not start or was lost${s.failure ? ` (${s.failure})` : ''}, so drawing is on the CPU`;
  if (!s.displayReady) return `${api} is starting`;
  return null;
}

export interface FrameLayer { width: number; height: number; deep?: unknown; sub?: readonly FrameLayer[]; ko?: { back: readonly FrameLayer[] } }
export interface FrameLimits { maxTexture: number; memoryBytes: number }

/** Every layer of a frame, those inside folders, clipped groups and knockout backdrops included. */
const flat = (layers: readonly FrameLayer[]): FrameLayer[] => layers.flatMap((l) => [l, ...(l.sub ? flat(l.sub) : []), ...(l.ko ? flat(l.ko.back) : [])]);

/** Bytes a frame holds on the GPU: every layer's texture and the two screen-sized composites, and a pair more for each depth of folders, clipped groups and knockouts. */
export const frameBytes = (layers: readonly FrameLayer[], W: number, H: number): number => {
  const all = flat(layers), deep = all.some((l) => l.deep), nested = all.length > layers.length;
  return all.reduce((s, l) => s + (l.sub ? 0 : l.width * l.height * (l.deep ? 8 : 4)), 0) + W * H * (deep ? 16 : 8) * (nested ? 2 : 1);
};

/** Whether the GPU can draw this document this frame: what the engine says the GPU path does not draw yet, a layer
 *  larger than the GPU's texture limit (tiling it is a later step), then Preferences' GPU memory limit. */
export function documentFallback(doc: { layers: readonly FrameLayer[] } | { reason: string }, W: number, H: number, lim: FrameLimits): string | null {
  if ('reason' in doc) return `this document has ${doc.reason}`;
  const big = flat(doc.layers).find((l) => l.width > lim.maxTexture || l.height > lim.maxTexture);
  if (big) return `a layer (${big.width} x ${big.height} px) is larger than this GPU's ${lim.maxTexture} px texture limit`;
  if (frameBytes(doc.layers, W, H) > lim.memoryBytes) return 'this document is over the GPU memory limit';
  return null;
}

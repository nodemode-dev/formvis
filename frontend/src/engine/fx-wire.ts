import type { LayerEffects, Transform } from './types';
import type { Surface } from './surface';

/** What the Layer Style dialog's live preview sends to a build worker and gets back (CO-0274). The renderer asks for a
 *  styled layer's effect parts through `EffectWorker`; the worker draws them with the very builder the page uses and
 *  answers with one ImageBitmap per part, so the pixels are the page's own and nothing on the page's thread grows with
 *  the layer. */

export interface FxSource { key: string; surface: Surface; w: number; h: number }
export interface FxLanded { surface: Surface; x: number; y: number; k: number; alpha: number; op: GlobalCompositeOperation; above: boolean; name: string; kept: boolean }
export interface FxAsk {
  layerId: string;
  /** The renderer's cache key for this build; the newest key asked for a layer is the only one landed. */
  key: string;
  src: FxSource;
  mask: (FxSource & { t: Transform; covers: boolean }) | null;
  patterns: { id: string; surface: Surface }[];
  fx: LayerEffects;
  t: Transform;
  docW: number;
  docH: number;
  fast: boolean;
  /** The pixel budget now, asked when the build is posted (a restart may have lowered it). */
  pixels(): number;
  shapes: boolean;
  land(parts: FxLanded[], ms: number): void;
  /** The build was ended for running past a second while a newer one waited. */
  late(): void;
}
/** True when the build was taken (the renderer answers with its earlier parts meanwhile); false leaves the build to the page. */
export interface EffectWorker { ask(a: FxAsk): boolean }

export interface FxPut { type: 'fxput'; key: string; width: number; height: number; bitmap: ImageBitmap }
export interface FxJob {
  type: 'fx';
  id: number;
  layerId: string;
  src: string;
  mask: { key: string; w: number; h: number; t: Transform; covers: boolean } | null;
  patterns: { id: string; key: string }[];
  live: string[];
  fx: LayerEffects;
  t: Transform;
  docW: number;
  docH: number;
  fast: boolean;
  pixels: number;
  shapes: boolean;
}
export interface FxPartWire { bitmap: ImageBitmap; w: number; h: number; x: number; y: number; k: number; alpha: number; op: GlobalCompositeOperation; above: boolean; name: string; kept: boolean }
export interface FxDone { type: 'fxdone'; id: number; ms: number; parts?: FxPartWire[]; error?: string }

import type { Raster } from './surface';

export type ID = string;
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface RGB { r: number; g: number; b: number }

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference'
  | 'color-dodge' | 'color-burn' | 'hue' | 'saturation' | 'color' | 'luminosity';

export const BLEND_MODES: ReadonlyArray<{ id: BlendMode; label: string }> = [
  { id: 'normal', label: 'Normal' }, { id: 'multiply', label: 'Multiply' }, { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' }, { id: 'darken', label: 'Darken' }, { id: 'lighten', label: 'Lighten' },
  { id: 'difference', label: 'Difference' }, { id: 'color-dodge', label: 'Color Dodge' }, { id: 'color-burn', label: 'Color Burn' },
  { id: 'hue', label: 'Hue' }, { id: 'saturation', label: 'Saturation' }, { id: 'color', label: 'Color' }, { id: 'luminosity', label: 'Luminosity' },
];

export function compositeOp(mode: BlendMode): GlobalCompositeOperation { return mode === 'normal' ? 'source-over' : mode; }
export function blendFromLabel(label: unknown): BlendMode { return BLEND_MODES.find((b) => b.label === label)?.id ?? 'normal'; }
export function blendLabel(mode: BlendMode): string { return BLEND_MODES.find((b) => b.id === mode)?.label ?? 'Normal'; }

export type Sampling = 'nearest' | 'smooth' | 'high';
export const SAMPLING_LABELS: Record<Sampling, string> = { nearest: 'Nearest', smooth: 'Smooth', high: 'High quality' };
export function samplingFromLabel(label: unknown): Sampling { return label === 'Nearest' ? 'nearest' : label === 'Smooth' ? 'smooth' : 'high'; }

export interface Transform { x: number; y: number; w: number; h: number; rotation: number; flipX: boolean; flipY: boolean; sampling: Sampling }
export interface Mask { raster: Raster | null; enabled: boolean; linked: boolean; placement: Transform | null }
export type AdjustmentKind = 'hsv' | 'levels' | 'curves' | 'exposure' | 'gradientMap' | 'grain';
export interface Adjustment { kind: AdjustmentKind; data: Record<string, unknown> }
export interface Layer {
  readonly id: ID;
  name: string;
  raster: Raster | null;
  transform: Transform;
  visible: boolean;
  parentId: ID | null;
  isGroup: boolean;
  opacity: number;
  blend: BlendMode;
  mask: Mask | null;
  clipId: ID | null;
  adjustment: Adjustment | null;
  shape: Record<string, unknown> | null;
}
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[] }

export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'eyedropper' | 'hand' | 'zoom' | 'idle';

export const LIMITS = { side: 30000, pixels: 100_000_000, layers: 10000, depth: 64 } as const;

let counter = 0;
export function uid(): ID {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().toUpperCase();
  counter += 1;
  return `ID-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function docTransform(w: number, h: number): Transform {
  return { x: 0, y: 0, w, h, rotation: 0, flipX: false, flipY: false, sampling: 'high' };
}

export function newLayer(name: string, size: { width: number; height: number }, patch: Partial<Layer> = {}): Layer {
  return {
    id: uid(), name, raster: null, transform: docTransform(size.width, size.height), visible: true, parentId: null,
    isGroup: false, opacity: 1, blend: 'normal', mask: null, clipId: null, adjustment: null, shape: null, ...patch,
  };
}

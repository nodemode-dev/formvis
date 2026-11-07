import type { BlendMode } from '../../frontend/src/engine/types';
import type { TextSpec } from './text';

export interface LayerBase { id: string; name: string; visible: boolean; opacity: number; blend: BlendMode }
type Frozen = { rev: number; canvas: HTMLCanvasElement } | null;
export interface PixelLayer extends LayerBase {
  kind: 'pixel'; canvas: HTMLCanvasElement; x: number; y: number; rev: number; frozen: Frozen;
  mask: HTMLCanvasElement | null; mrev: number; mfrozen: Frozen; text: TextSpec | null;
}
export type Values = Record<string, unknown>;
export interface AdjustLayer extends LayerBase { kind: 'adjust'; def: string; values: Values; rev: number }
export type Layer = PixelLayer | AdjustLayer;

export interface Doc { name: string; w: number; h: number; layers: Layer[]; active: string | null }

type SnapLayer = { kind: 'pixel'; base: LayerBase; x: number; y: number; canvas: HTMLCanvasElement; mask: HTMLCanvasElement | null; text: TextSpec | null } |{ kind: 'adjust'; base: LayerBase; def: string; values: Values };
interface Snapshot { name: string; w: number; h: number; active: string | null; layers: SnapLayer[] }

let counter = 0;
export const newId = (): string => `l${++counter}`;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export function pixelLayer(name: string, canvas: HTMLCanvasElement, x = 0, y = 0): PixelLayer {
  return { kind: 'pixel', id: newId(), name, visible: true, opacity: 1, blend: 'normal', canvas, x, y, rev: 0, frozen: null, mask: null, mrev: 0, mfrozen: null, text: null };
}

export function maskCanvas(w: number, h: number, reveal: boolean): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  if (reveal) {
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

export function adjustLayer(name: string, def: string, values: Values): AdjustLayer {
  return { kind: 'adjust', id: newId(), name, visible: true, opacity: 1, blend: 'normal', def, values, rev: 0 };
}

export const touch = (l: Layer): void => { l.rev++; };
export const touchMask = (l: PixelLayer): void => { l.mrev++; };

export type Change = 'pixels' | 'structure' | 'active' | 'doc' | 'history';

export class Store {
  doc: Doc = { name: 'Untitled', w: 1, h: 1, layers: [], active: null };
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners: Array<(c: Change) => void> = [];
  dirty = false;

  on(fn: (c: Change) => void): void { this.listeners.push(fn); }
  emit(c: Change): void { for (const fn of this.listeners) fn(c); }

  get active(): Layer | null { return this.doc.layers.find((l) => l.id === this.doc.active) ?? null; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  private snapshot(): Snapshot {
    const layers: SnapLayer[] = this.doc.layers.map((l) => {
      const base: LayerBase = { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend };
      if (l.kind === 'adjust') return { kind: 'adjust', base, def: l.def, values: structuredClone(l.values) };
      if (!l.frozen || l.frozen.rev !== l.rev) l.frozen = { rev: l.rev, canvas: cloneCanvas(l.canvas) };
      if (l.mask && (!l.mfrozen || l.mfrozen.rev !== l.mrev)) l.mfrozen = { rev: l.mrev, canvas: cloneCanvas(l.mask) };
      return { kind: 'pixel', base, x: l.x, y: l.y, canvas: l.frozen.canvas, mask: l.mask ? l.mfrozen!.canvas : null, text: l.text ? { ...l.text } : null };
    });
    return { name: this.doc.name, w: this.doc.w, h: this.doc.h, active: this.doc.active, layers };
  }

  private apply(s: Snapshot): void {
    this.doc.name = s.name;
    this.doc.w = s.w;
    this.doc.h = s.h;
    this.doc.active = s.active;
    this.doc.layers = s.layers.map((sl): Layer => {
      if (sl.kind === 'adjust') return { kind: 'adjust', ...sl.base, def: sl.def, values: structuredClone(sl.values), rev: 0 };
      return { kind: 'pixel', ...sl.base, canvas: cloneCanvas(sl.canvas), x: sl.x, y: sl.y, rev: 0, frozen: { rev: 0, canvas: sl.canvas }, mask: sl.mask ? cloneCanvas(sl.mask) : null, mrev: 0, mfrozen: sl.mask ? { rev: 0, canvas: sl.mask } : null, text: sl.text ? { ...sl.text } : null };
    });
  }

  checkpoint(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 24) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.emit('history');
  }

  dropLast(): void {
    this.undoStack.pop();
    this.emit('structure');
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.snapshot());
    this.apply(s);
    this.emit('doc');
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.apply(s);
    this.emit('doc');
  }

  load(doc: Doc, keepHistory: boolean): void {
    if (keepHistory) this.checkpoint(); else { this.undoStack = []; this.redoStack = []; }
    this.doc = doc;
    this.emit('doc');
  }

  setActive(id: string | null): void {
    if (this.doc.active === id) return;
    this.doc.active = id;
    this.emit('active');
  }

  add(layer: Layer, above = true): void {
    const at = this.active ? this.doc.layers.indexOf(this.active) + (above ? 1 : 0) : this.doc.layers.length;
    this.doc.layers.splice(Math.max(0, at), 0, layer);
    this.doc.active = layer.id;
    this.emit('structure');
  }

  remove(id: string): void {
    const i = this.doc.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    this.doc.layers.splice(i, 1);
    if (this.doc.active === id) this.doc.active = this.doc.layers[Math.min(i, this.doc.layers.length - 1)]?.id ?? null;
    this.emit('structure');
  }

  move(id: string, to: number): void {
    const i = this.doc.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    const clamped = Math.max(0, Math.min(this.doc.layers.length - 1, to));
    if (clamped === i) return;
    const [l] = this.doc.layers.splice(i, 1);
    this.doc.layers.splice(clamped, 0, l);
    this.emit('structure');
  }
}

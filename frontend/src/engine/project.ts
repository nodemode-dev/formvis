import { History, type Snapshot } from './history';
import { Viewport } from './viewport';
import type { SelectionMask } from './selection';
import type { Lut3x4, Lut4 } from './colour-lut';
import { uid, type Doc, type ID, type Layer } from './types';

export class Project {
  readonly id = uid();
  libraryName: string | null = null;
  /** Where this document sits in a larger picture opened as tiles (1.52.7), for Assemble Tiles. */
  tile: { source: string; width: number; height: number; x: number; y: number; row: number; col: number } | null = null;
  selection: SelectionMask | null = null;
  activeId: ID | null = null;
  selectedIds = new Set<ID>();
  maskTarget = false;
  /** A CMYK document's display table (1.54.0), from its profile; not part of history. */
  cmykLut: Lut4 | null = null;
  cmykIn: Lut3x4 | null = null;
  readonly collapsed = new Set<ID>();
  readonly history = new History();
  readonly viewport = new Viewport();

  constructor(public doc: Doc, public name: string) {}

  snapshot(): Snapshot { return { doc: this.doc, activeId: this.activeId, selection: this.selection }; }
  get activeLayer(): Layer | null { return this.doc.layers.find((l) => l.id === this.activeId) ?? null; }
  layer(id: ID): Layer | null { return this.doc.layers.find((l) => l.id === id) ?? null; }
  setLayers(layers: Layer[]): void { this.doc = { ...this.doc, layers }; }
  updateLayer(id: ID, patch: Partial<Layer>): void { this.setLayers(this.doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l))); }
  get modified(): boolean { return this.history.modified; }
}

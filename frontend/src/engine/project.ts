import { History, type Snapshot } from './history';
import { Viewport } from './viewport';
import type { SelectionMask } from './selection';
import { uid, type Doc, type ID, type Layer } from './types';

export class Project {
  readonly id = uid();
  libraryName: string | null = null;
  selection: SelectionMask | null = null;
  activeId: ID | null = null;
  selectedIds = new Set<ID>();
  maskTarget = false;
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

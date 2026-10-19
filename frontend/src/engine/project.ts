import { History, type Snapshot } from './history';
import { Viewport } from './viewport';
import type { SelectionMask } from './selection';
import type { Lut3x4, Lut4 } from './colour-lut';
import { uid, type Doc, type ID, type Layer } from './types';

export class Project {
  readonly id = uid();
  /** Its name in the project library, when it came from or was saved there. */
  libraryName: string | null = null;
  /** The library file's version when opened or last saved (1.58.8), so a save does not overwrite a newer copy. */
  libraryVersion: string | null = null;
  /** The .fvd on this computer it was opened from or last saved to (1.87.0, desktop app), which Save writes back to. */
  filePath: string | null = null;
  /** Where this document sits in a larger picture opened as tiles (1.52.7), for Assemble Tiles. */
  tile: { source: string; width: number; height: number; x: number; y: number; row: number; col: number } | null = null;
  selection: SelectionMask | null = null;
  activeId: ID | null = null;
  selectedIds = new Set<ID>();
  /** True when the active layer's mask, not its pixels, is the target. */
  maskTarget = false;
  /** A CMYK document's display table (1.54.0), from its profile; not part of history. */
  cmykLut: Lut4 | null = null;
  cmykIn: Lut3x4 | null = null;
  /** Both tables for the float compositor (1.55.7), or null until they load. */
  get cmykTables(): { out: Lut4; in: Lut3x4 } | null { return this.cmykLut && this.cmykIn ? { out: this.cmykLut, in: this.cmykIn } : null; }
  /** Folders that are closed. */
  readonly collapsed = new Set<ID>();
  readonly history = new History();
  readonly viewport = new Viewport();

  constructor(public doc: Doc, public name: string) { for (const id of doc.collapsed ?? []) this.collapsed.add(id); }

  /** Mirrors the closed folders onto the document so a save writes them; the same object is changed, so no history step and no new document. */
  stampCollapsed(): void {
    const now = [...this.collapsed], was = this.doc.collapsed ?? [];
    if (now.length === was.length && now.every((id, i) => id === was[i])) return;
    if (now.length) this.doc.collapsed = now; else delete this.doc.collapsed;
  }

  snapshot(): Snapshot { return { doc: this.doc, activeId: this.activeId, selection: this.selection }; }
  get activeLayer(): Layer | null { return this.activeId ? this.layer(this.activeId) : null; }
  layer(id: ID): Layer | null { return this.doc.layers.find((l) => l.id === id) ?? null; }
  setLayers(layers: Layer[]): void { this.doc = { ...this.doc, layers }; }
  updateLayer(id: ID, patch: Partial<Layer>): void { this.setLayers(this.doc.layers.map((l) => (l.id === id ? { ...l, ...patch } as Layer : l))); }
  get modified(): boolean { return this.history.modified; }
}

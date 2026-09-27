import type { Doc, ID } from './types';
import type { Raster } from './surface';
import type { SelectionMask } from './selection';

/** paths: a copy of the document's paths, carried only by path edits' steps (their undo and redo restore it; other
 *  steps leave paths as they are, since drawing with the Pen is not itself a step). */
export interface Snapshot { doc: Doc; activeId: ID | null; selection: SelectionMask | null; paths?: unknown }
export interface PixelPatch { raster: Raster; x: number; y: number; before: ImageData; after: ImageData }
export interface HistoryEntry { name: string; before: Snapshot; after: Snapshot; patches: PixelPatch[]; beforeRev: number; afterRev: number }

export class History {
  entryLimit = 100;
  byteLimit = 256 * 1024 * 1024;
  revision = 0;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private pending: { name: string; before: Snapshot; patches: PixelPatch[] } | null = null;
  private depth = 0;
  private counter = 0;
  private saved = 0;

  get canUndo(): boolean { return this.depth === 0 && this.past.length > 0; }
  get canRedo(): boolean { return this.depth === 0 && this.future.length > 0; }
  get undoName(): string { return this.past[this.past.length - 1]?.name ?? ''; }
  get redoName(): string { return this.future[this.future.length - 1]?.name ?? ''; }
  /** Every step kept, oldest first, undone ones after the done ones; `current` is how many are done. */
  get steps(): { names: string[]; current: number } {
    return { names: [...this.past.map((e) => e.name), ...[...this.future].reverse().map((e) => e.name)], current: this.past.length };
  }
  get modified(): boolean { return this.revision !== this.saved; }
  get open(): boolean { return this.depth > 0; }
  markSaved(): void { this.saved = this.revision; }
  markUnsaved(): void { this.saved = -1; }

  begin(name: string, snap: Snapshot): void {
    if (this.depth === 0) this.pending = { name, before: snap, patches: [] };
    this.depth += 1;
  }

  addPatch(patch: PixelPatch): void { this.pending?.patches.push(patch); }

  end(snap: Snapshot): boolean {
    if (this.depth === 0) return false;
    this.depth -= 1;
    if (this.depth > 0 || !this.pending) return false;
    const p = this.pending;
    this.pending = null;
    // A step that changed nothing is dropped; a path edit's step (it carries the paths) counts when the paths changed.
    const pathsSame = !p.before.paths || JSON.stringify(p.before.paths) === JSON.stringify(snap.paths);
    if (!p.patches.length && p.before.doc === snap.doc && p.before.selection === snap.selection && pathsSame) return false;
    const beforeRev = this.revision;
    this.counter += 1;
    this.revision = this.counter;
    this.past.push({ name: p.name, before: p.before, after: snap, patches: p.patches, beforeRev, afterRev: this.revision });
    this.future = [];
    this.trim(snap);
    return true;
  }

  abort(): Snapshot | null {
    const before = this.pending?.before ?? null;
    this.pending = null;
    this.depth = 0;
    return before;
  }

  rollback(): { before: Snapshot; patches: PixelPatch[] } | null {
    const p = this.pending;
    this.pending = null;
    this.depth = 0;
    return p ? { before: p.before, patches: p.patches } : null;
  }

  /** The oldest kept state and every pixel patch done since, oldest first, for rebuilding pixels as they were
   *  (Edit > Fill with History). Undone steps are excluded, since undoing already wrote their pixels back. */
  origin(): { first: Snapshot | null; patches: PixelPatch[] } {
    return { first: this.past[0]?.before ?? null, patches: this.past.flatMap((e) => e.patches) };
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo) return null;
    const e = this.past.pop() as HistoryEntry;
    this.future.push(e);
    this.revision = e.beforeRev;
    return e;
  }

  redo(): HistoryEntry | null {
    if (!this.canRedo) return null;
    const e = this.future.pop() as HistoryEntry;
    this.past.push(e);
    this.revision = e.afterRev;
    return e;
  }

  retained(current: Snapshot): number {
    const live = new Set<string>();
    for (const l of current.doc.layers) {
      if (l.raster) live.add(l.raster.id);
      if (l.mask?.raster) live.add(l.mask.raster.id);
    }
    const seen = new Set<string>();
    const selections = new Set<SelectionMask>();
    let bytes = 0;
    const count = (s: Snapshot): void => {
      for (const l of s.doc.layers) {
        for (const r of [l.raster, l.mask?.raster ?? null]) {
          if (r && !live.has(r.id) && !seen.has(r.id)) { seen.add(r.id); bytes += r.bytes; }
        }
      }
      if (s.selection && s.selection !== current.selection && !selections.has(s.selection)) { selections.add(s.selection); bytes += s.selection.bytes; }
    };
    for (const e of [...this.past, ...this.future]) {
      count(e.before);
      count(e.after);
      for (const p of e.patches) bytes += p.before.data.length + p.after.data.length;
    }
    return bytes;
  }

  private trim(current: Snapshot): void {
    while ((this.past.length || this.future.length) && (this.past.length + this.future.length > this.entryLimit || this.retained(current) > this.byteLimit)) {
      if (this.past.length) this.past.shift();
      else this.future.shift();
    }
  }
}

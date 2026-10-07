import type { Doc, ID } from './types';
import type { Raster } from './surface';
import type { TiledRaster } from './tiled';
import type { SelectionMask } from './selection';

/** paths: a copy of the document's paths, carried only by path edits' steps (their undo and redo restore it; other
 *  steps leave paths as they are, since drawing with the Pen is not itself a step). */
export interface Snapshot { doc: Doc; activeId: ID | null; selection: SelectionMask | null; paths?: unknown; video?: unknown; frames?: unknown }
/* frames (1.59.8): a copy of the frame animation (frames, current, loops), carried by steps that change it (Convert to
   Frame Animation), as video and paths are carried. */
/* video (1.59.5, DEV_PLAN 25): a copy of the video timeline, carried only by timeline edits' steps, as paths are. */
export interface PixelPatch { raster: Raster | TiledRaster; x: number; y: number; before: ImageData; after: ImageData; paged?: { key: string; w: number; h: number } | null; lazy?: boolean; disk?: { before: string; after: string; w: number; h: number } | null }
/* lazy (1.60.9, DEV_PLAN 26.4): only `before` is kept; `after` is what the layer holds when the step is undone, read
   there just before `before` is written back (a whole-layer filter's undo, halved). */
/* paged (1.60.8, DEV_PLAN 26.3): kept in the engine's undo store under `key`, its before and after pixels (w by h)
   replaced here by a pixel's worth each until an undo or redo brings them back. */
export interface HistoryEntry { name: string; before: Snapshot; after: Snapshot; patches: PixelPatch[]; beforeRev: number; afterRev: number; streamed?: boolean }
/* streamed (1.62.7, DEV_PLAN 26.6e): a step whose patches keep both sides on the engine's disk (`disk`), applied a tile at
   a time by undo and redo rather than brought into memory together: a filter on a giant layer, up to 2.4 GB a side. */

export class History {
  /** Called as any step ends (1.55.9): the engine brings floats into step with the step's 8-bit pixels and returns the
   *  snapshot to keep, or null when nothing changed. One engine per window, so one hook. */
  static onStepEnd: ((h: History, before: Snapshot, patches: readonly PixelPatch[]) => Snapshot | null) | null = null;
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
  get last(): HistoryEntry | null { return this.depth === 0 ? this.past[this.past.length - 1] ?? null : null; }
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

  /** The in-place pixel patches of the step being built (1.55.9), so a 16-bit or CMYK layer's floats can follow them. */
  get pendingPatches(): readonly PixelPatch[] { return this.pending?.patches ?? []; }

  end(snap: Snapshot): boolean {
    if (this.depth === 0) return false;
    this.depth -= 1;
    if (this.depth > 0 || !this.pending) return false;
    const p = this.pending;
    this.pending = null;
    const hooked = History.onStepEnd ? History.onStepEnd(this, p.before, p.patches) : null;
    if (hooked) snap = { ...hooked, ...(snap.video !== undefined ? { video: snap.video } : {}), ...(snap.frames !== undefined ? { frames: snap.frames } : {}) };   // the timelines kept (1.59.5, 1.59.8)
    const framesSame = p.before.frames === undefined || JSON.stringify(p.before.frames) === JSON.stringify(snap.frames);
    // A step that changed nothing is dropped; a path edit's step (it carries the paths) counts when the paths changed,
    // and a timeline edit's (it carries the video timeline, 1.59.5) when the timeline changed.
    const pathsSame = !p.before.paths || JSON.stringify(p.before.paths) === JSON.stringify(snap.paths);
    const videoSame = p.before.video === undefined || JSON.stringify(p.before.video) === JSON.stringify(snap.video);
    if (!p.patches.length && p.before.doc === snap.doc && p.before.selection === snap.selection && pathsSame && videoSame && framesSame) return false;
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

  /** Every raster the steps keep (1.60.4, DEV_PLAN 26.2): in their snapshots' layers (pixels, masks, smart objects'
   *  sources and filter masks) and their patches, so a closed document can release what nothing else keeps. */
  rasters(): Set<Raster> {
    const out = new Set<Raster>();
    const add = (s: Snapshot): void => { for (const l of s.doc.layers) for (const r of [l.raster, l.mask?.raster, l.smart?.source, l.smart?.filterMask]) if (r) out.add(r); };
    for (const e of [...this.past, ...this.future]) { add(e.before); add(e.after); for (const p of e.patches) if ('canvas' in p.raster) out.add(p.raster); }   // a tiled layer has no canvas to free (1.62.5)
    return out;
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
          if (r && !live.has(r.id) && !seen.has(r.id)) { seen.add(r.id); bytes += r.canvas.width * r.canvas.height * 4; }   // by its canvas: a paged raster counts nothing (1.61.3)
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
      const gone = this.past.length ? this.past.shift() : this.future.shift();
      if (gone) History.onDrop?.(gone);   // its tiles in the engine's undo store dropped too (1.60.8)
    }
  }

  /** Handed each step trimmed away (1.60.8), so what it keeps outside the window can go. */
  static onDrop: ((e: HistoryEntry) => void) | null = null;
  /** The step an undo would take back, and the one a redo would make again (1.60.8: paged ones are brought back first). */
  peekUndo(): HistoryEntry | null { return this.canUndo ? this.past[this.past.length - 1] : null; }
  peekRedo(): HistoryEntry | null { return this.canRedo ? this.future[this.future.length - 1] : null; }
  /** Every step, for dropping all a closed document keeps outside the window. */
  entries(): HistoryEntry[] { return [...this.past, ...this.future]; }
  /** The patches that may go to the engine's undo store, oldest first: those of past steps but the last `keep`, not yet
   *  paged (1.60.8, DEV_PLAN 26.3). */
  pageable(keep: number): PixelPatch[] {
    const out: PixelPatch[] = [];
    for (const e of this.past.slice(0, Math.max(0, this.past.length - keep))) for (const q of e.patches) if (!q.paged && !q.disk) out.push(q);   // a streamed step's are on disk already (1.62.7)
    return out;
  }
}

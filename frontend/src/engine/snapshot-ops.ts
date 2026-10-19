// Snapshots (DEV_PLAN 36.13): the Engine's History snapshots (the opening snapshot, New Snapshot, Revert, Delete, the
// list with its memory, the History Brush's source and the document copy a snapshot keeps), moved out of index.ts. The
// snapshots of each open document live in a SnapshotStore the Engine holds; each function takes a SnapshotHost, the few
// Engine members it uses, so this file never imports the Engine class. The history core (undo, redo, jumpHistory, the
// patch recording and the step hooks) stays in index.ts.
import type { Project } from './project';
import { Raster } from './surface';
import { liveText, textKey } from './text';
import type { Snapshot } from './history';
import { uid, type Doc, type ID } from './types';

/** One kept snapshot. */
export type SnapshotKind = 'document' | 'merged' | 'layer';
export type SnapshotEntry = { id: ID; name: string; state: Snapshot; kind?: SnapshotKind };

/** The snapshot state the Engine keeps: each open document's snapshots, oldest first. */
export class SnapshotStore {
  readonly lists = new WeakMap<Project, SnapshotEntry[]>();
}

/** What the snapshot methods need of the Engine. `current`, `stroke` and the limits are read live. */
export interface SnapshotHost {
  readonly current: Project | null;
  /** The stroke open, if any: a snapshot is not taken while one is. */
  readonly stroke: unknown;
  readonly autoFirstSnapshot: boolean;
  readonly snapshotByteLimit: number;
  readonly snapshotCountLimit: number;
  readonly memoryBudget: number;
  mergedDoc(): Doc | null;
  readonly historyBrushSource: ID | null;
  store: SnapshotStore;
  notice(text: string): void;
  settle(): void;
  room(extra: number, what: string): boolean;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  focus(p: Project, id: ID | null): void;
  emit(what: 'history'): void;
}

export function openingSnapshot(host: SnapshotHost, p: Project): void {
  if (!host.autoFirstSnapshot) return;
  // A copy of every pixel (1.60.5, DEV_PLAN 26.2: measured, this was the second full copy of every document): past a
  // quarter of this computer's budget it is not taken, and the document says so; New Snapshot takes one when wanted.
  const need = docBytes(p.doc);
  if (need > host.snapshotByteLimit || (host.memoryBudget && need > host.memoryBudget / 4)) {
    if (host.memoryBudget && need > host.memoryBudget / 4) host.notice(`No opening snapshot: this document's pixels (${Math.ceil(need / 1048576).toLocaleString()} MB) would take too much of this computer's memory. New Snapshot takes one when you want it.`);
    return;
  }
  host.store.lists.set(p, [{ id: uid(), name: p.name, state: { doc: copyDoc(p.doc), activeId: p.activeId, selection: p.selection } }]);
}

/** The History Brush's source: a snapshot chosen in the History panel, or the document's first. */
export function historyBrushSourceId(host: SnapshotHost): ID | null {
  const p = host.current, list = p ? host.store.lists.get(p) ?? [] : [];
  return (list.find((x) => x.id === host.historyBrushSource) ?? list[0])?.id ?? null;
}

/** A copy of `doc` whose layer pixels and masks are copies too: strokes change pixels in place, so a snapshot that
 *  only referred to them would change with later painting. Type stays editable on its copied pixels; smart sources,
 *  paths and shapes are never changed in place, so they are shared. */
export function copyDoc(doc: Doc): Doc {
  const copy = (r: Raster | null | undefined): Raster | null => {
    if (!r) return null;
    const c = new Raster(r.width, r.height);
    c.ctx.drawImage(r.canvas, 0, 0);
    return c;
  };
  return { ...doc, layers: doc.layers.map((l) => {
    const raster = copy(l.raster), text = l.text && raster && liveText(l) ? { ...l.text, rendered: textKey(raster) } : l.text;
    return { ...l, raster, text, mask: l.mask ? { ...l.mask, raster: copy(l.mask.raster) } : l.mask };
  }) };
}

export function docBytes(doc: Doc): number {
  let n = 0;
  for (const l of doc.layers) { if (l.raster) n += l.raster.bytes; if (l.mask?.raster) n += l.mask.raster.bytes; }
  return n;
}

/** The current document's snapshots, newest last, with the memory each keeps. They live with the open document and
 *  are not saved. */
export function snapshots(host: SnapshotHost): ReadonlyArray<{ id: ID; name: string; bytes: number; kind: SnapshotKind }> {
  const p = host.current;
  return p ? (host.store.lists.get(p) ?? []).map((x) => ({ id: x.id, name: x.name, bytes: docBytes(x.state.doc), kind: x.kind ?? 'document' })) : [];
}

/** History > New Snapshot: the document as it is now, kept to return to however far the steps move on. */
export function takeSnapshot(host: SnapshotHost, name?: string, kind: SnapshotKind = 'document'): void {
  const p = host.current;
  if (!p || host.stroke) return;
  host.settle();
  const list = host.store.lists.get(p) ?? [], mb = (b: number): number => Math.ceil(b / 1048576);
  if (list.length >= host.snapshotCountLimit) { host.notice(`This document already keeps ${list.length} snapshots, the most it may keep. Delete one first.`); return; }
  // Merged Layers keeps the picture in one layer; Current Layer keeps the active layer alone, free of its folder and clip.
  let source: Doc | null = p.doc, activeId = p.activeId;
  if (kind === 'merged') { source = host.mergedDoc(); activeId = source?.layers[0]?.id ?? null; }
  else if (kind === 'layer') {
    const l = p.activeLayer;
    if (!l || l.isGroup || !l.raster) { host.notice('Select a layer with pixels first: Current Layer keeps only that layer.'); return; }
    source = { ...p.doc, layers: [{ ...l, parentId: null, clipId: null }] };
    activeId = l.id;
  }
  if (!source) return;
  const need = docBytes(source), used = list.reduce((a, x) => a + docBytes(x.state.doc), 0);
  if (used + need > host.snapshotByteLimit) { host.notice(`A snapshot of this document needs ${mb(need)} MB, and snapshots already keep ${mb(used)} MB of the ${mb(host.snapshotByteLimit)} MB they may use. Delete one first.`); return; }
  if (!host.room(need, 'A snapshot')) return;   // its copy of every pixel (1.60.5)
  // Numbering: the opening snapshot bears the document's name, so the first taken is Snapshot 1.
  const label = kind === 'merged' ? 'Merged Snapshot' : kind === 'layer' ? 'Layer Snapshot' : 'Snapshot';
  let n = list.filter((x) => x.name.startsWith(`${label} `) && /^\d+$/.test(x.name.slice(label.length + 1))).length + 1;
  while (list.some((x) => x.name === `${label} ${n}`)) n += 1;
  const given = name?.trim().slice(0, 100);
  list.push({ id: uid(), name: given || `${label} ${n}`, kind, state: { doc: kind === 'merged' ? source : copyDoc(source), activeId, selection: p.selection } });
  host.store.lists.set(p, list);
  host.emit('history');
}

/** A snapshot given a new name (blank keeps the old one); false when there is no such snapshot. */
export function renameSnapshot(host: SnapshotHost, id: ID, name: string): boolean {
  const p = host.current, snap = p ? host.store.lists.get(p)?.find((x) => x.id === id) : undefined, next = name.trim().slice(0, 100);
  if (!snap || !next) return false;
  if (snap.name !== next) { snap.name = next; host.emit('history'); }
  return true;
}

/** Returns the document to a snapshot as one undo step, from a fresh copy, so the snapshot stays as it was taken. */
export function revertToSnapshot(host: SnapshotHost, id: ID): void {
  const p = host.current, snap = p ? host.store.lists.get(p)?.find((x) => x.id === id) : undefined;
  if (!p || !snap) return;
  host.edit(`Revert to ${snap.name}`, (q) => {
    q.doc = copyDoc(snap.state.doc);
    q.selection = snap.state.selection;
    host.focus(q, snap.state.activeId && q.doc.layers.some((l) => l.id === snap.state.activeId) ? snap.state.activeId : null);
  });
}

export function deleteSnapshot(host: SnapshotHost, id: ID): void {
  const p = host.current, list = p ? host.store.lists.get(p) : undefined;
  if (!p || !list) return;
  host.store.lists.set(p, list.filter((x) => x.id !== id));
  host.emit('history');
}

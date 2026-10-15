// Notes and counts (DEV_PLAN 36.13): the Engine's Note tool and Count tool methods, moved out of index.ts. Each takes
// a NoteHost, the few Engine members they use, so this file never imports the Engine class.
import type { Project } from './project';
import { uid, type ID, type Pt } from './types';

/** What the note and count methods need of the Engine. */
export interface NoteHost {
  activeNote: ID | null;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
}

export function addNote(host: NoteHost, pt: Pt): ID | null {
  let id: ID | null = null;
  host.edit('New Note', (p) => { const n = { id: uid(), x: pt.x, y: pt.y, text: '' }; p.doc = { ...p.doc, notes: [...(p.doc.notes ?? []), n] }; id = n.id; return true; });
  host.activeNote = id;
  return id;
}
export function setNote(host: NoteHost, id: ID, patch: { text?: string; x?: number; y?: number }, name = 'Edit Note'): void {
  host.edit(name, (p) => { const list = p.doc.notes ?? [], n = list.find((x) => x.id === id); if (!n) return false; p.doc = { ...p.doc, notes: list.map((x) => (x.id === id ? { ...x, ...patch } : x)) }; return true; });
}
export function removeNote(host: NoteHost, id: ID): void {
  host.edit('Delete Note', (p) => { const list = p.doc.notes ?? []; if (!list.some((x) => x.id === id)) return false; p.doc = { ...p.doc, notes: list.filter((x) => x.id !== id) }; return true; });
  if (host.activeNote === id) host.activeNote = null;
}
export function clearNotes(host: NoteHost): void {
  host.edit('Delete All Notes', (p) => { if (!p.doc.notes?.length) return false; p.doc = { ...p.doc, notes: [] }; return true; });
  host.activeNote = null;
}

export function addCount(host: NoteHost, pt: Pt): void { host.edit('Count', (p) => { p.doc = { ...p.doc, counts: [...(p.doc.counts ?? []), { x: pt.x, y: pt.y }] }; return true; }); }
export function removeCount(host: NoteHost, i: number): void { host.edit('Remove Count', (p) => { const c = p.doc.counts ?? []; if (i < 0 || i >= c.length) return false; p.doc = { ...p.doc, counts: c.filter((_, k) => k !== i) }; return true; }); }
export function clearCounts(host: NoteHost): void { host.edit('Clear Count', (p) => { if (!p.doc.counts?.length) return false; p.doc = { ...p.doc, counts: [] }; return true; }); }

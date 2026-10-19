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

export function addCount(host: NoteHost, pt: Pt, g?: ID): void {
  host.edit('Count', (p) => { p.doc = { ...p.doc, counts: [...(p.doc.counts ?? []), { x: pt.x, y: pt.y, ...(g ? { g } : {}) }] }; return true; });
}
const GROUP_COLORS = ['#ff5a36', '#2fb5ff', '#3ccf6e', '#ffc533', '#b46bff', '#ff6fb5', '#2fe0d0', '#ff9a3c'];
/** A new count group, a step. The first one made also gathers the marks already placed into a group of their own, so
 *  every mark belongs to a group once groups exist. */
export function newCountGroup(host: NoteHost, name?: string, color?: string): ID | null {
  let made: ID | null = null;
  host.edit('New Count Group', (p) => {
    let groups = [...(p.doc.countGroups ?? [])], counts = p.doc.counts ?? [];
    if (!groups.length) {
      const first = { id: uid(), name: 'Group 1', color: GROUP_COLORS[0] };
      groups = [first];
      counts = counts.map((c) => ({ ...c, g: first.id }));
    }
    const n = groups.length + 1, g = { id: uid(), name: (name ?? '').trim().slice(0, 60) || `Group ${n}`, color: /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? (color as string) : GROUP_COLORS[(n - 1) % GROUP_COLORS.length] };
    p.doc = { ...p.doc, countGroups: [...groups, g], counts };
    made = g.id;
    return true;
  });
  return made;
}
export function setCountGroup(host: NoteHost, id: ID, patch: { name?: string; color?: string; hidden?: boolean }): boolean {
  return host.edit('Edit Count Group', (p) => {
    const list = p.doc.countGroups ?? [], k = list.find((x) => x.id === id);
    if (!k) return false;
    const next = { ...k, ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 60) || k.name } : {}), ...(patch.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.color) ? { color: patch.color } : {}), ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}) };
    if (!next.hidden) delete (next as { hidden?: boolean }).hidden;
    p.doc = { ...p.doc, countGroups: list.map((x) => (x.id === id ? next : x)) };
    return true;
  });
}
/** Deletes a group and the marks in it, a step. */
export function removeCountGroup(host: NoteHost, id: ID): boolean {
  return host.edit('Delete Count Group', (p) => {
    const list = p.doc.countGroups ?? [];
    if (!list.some((x) => x.id === id)) return false;
    p.doc = { ...p.doc, countGroups: list.filter((x) => x.id !== id), counts: (p.doc.counts ?? []).filter((c) => (c.g ?? list[0]?.id) !== id) };
    return true;
  });
}
export function moveCount(host: NoteHost, i: number, pt: Pt): void {
  host.edit('Move Count', (p) => { const c = p.doc.counts ?? []; if (i < 0 || i >= c.length) return false; p.doc = { ...p.doc, counts: c.map((m, k) => (k === i ? { ...m, x: pt.x, y: pt.y } : m)) }; return true; });
}
export function removeCount(host: NoteHost, i: number): void { host.edit('Remove Count', (p) => { const c = p.doc.counts ?? []; if (i < 0 || i >= c.length) return false; p.doc = { ...p.doc, counts: c.filter((_, k) => k !== i) }; return true; }); }
export function clearCounts(host: NoteHost): void { host.edit('Clear Count', (p) => { if (!p.doc.counts?.length) return false; p.doc = { ...p.doc, counts: [] }; return true; }); }

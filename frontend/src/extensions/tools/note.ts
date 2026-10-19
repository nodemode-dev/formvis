import type { Pt } from '../../engine';
import { toolHost, type OptionSpec, type Tool } from '../registry';

let drag: { id: string; from: Pt; start: Pt; moved: boolean } | null = null;
const NEAR = 10;

/** The Note (I, the owner's tool list): click the canvas to pin a note and write it; click a note to
 *  edit it, drag it to move it, Alt-click it to delete it. Notes are saved with the document and shown whatever the
 *  tool. */
export const noteTool: Tool = {
  id: 'note', label: 'Note', key: 'I', order: 80.7,
  icon: () => 'tNote',
  hint: () => 'Click to pin a note · Click a note to edit it · Drag it to move it · Alt-click it to delete it',
  cursor: () => 'crosshair',
  down(ctx, p) {
    const e = ctx.engine, notes = e.current?.doc.notes ?? [];
    if (p.button !== 0 || !e.current) return;
    const v = ctx.view(), at = v.toScreen(p.doc);
    const hit = [...notes].reverse().find((n) => { const q = v.toScreen(n); return Math.abs(q.x + 8 - at.x) <= NEAR && Math.abs(q.y + 8 - at.y) <= NEAR; });
    if (hit && p.alt) { e.removeNote(hit.id); return; }
    if (hit) { e.activeNote = hit.id; drag = { id: hit.id, from: p.doc, start: { x: hit.x, y: hit.y }, moved: false }; e.emit('overlay', null); return; }
    const id = e.addNote(p.doc);
    if (id) toolHost.run('edit-note');
  },
  move(ctx, p) {
    const d = drag;
    if (!d) return;
    const v = ctx.view(), a = v.toScreen(d.from), b = v.toScreen(p.doc);
    if (!d.moved && Math.hypot(b.x - a.x, b.y - a.y) < 4) return;
    d.moved = true;
    const n = ctx.engine.current?.doc.notes?.find((x) => x.id === d.id);
    if (n) { (n as { x: number; y: number }).x = d.start.x + p.doc.x - d.from.x; (n as { x: number; y: number }).y = d.start.y + p.doc.y - d.from.y; ctx.engine.emit('overlay', null); }
  },
  up(ctx) {
    const d = drag;
    drag = null;
    if (!d) return;
    const n = ctx.engine.current?.doc.notes?.find((x) => x.id === d.id);
    if (d.moved && n) { const to = { x: n.x, y: n.y }; Object.assign(n, d.start); ctx.engine.setNote(d.id, to, 'Move Note'); }
    else toolHost.run('edit-note');
  },
  cancel(ctx) { const d = drag; drag = null; const n = d ? ctx.engine.current?.doc.notes?.find((x) => x.id === d.id) : null; if (d && n) { Object.assign(n, d.start); ctx.engine.emit('overlay', null); } },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Note' },
    { kind: 'readout', label: 'Notes', get: () => String(e.current?.doc.notes?.length ?? 0) },
    { kind: 'button', label: 'Clear All', run: () => { for (const n of [...(e.current?.doc.notes ?? [])]) e.removeNote(n.id); } },
  ],
};

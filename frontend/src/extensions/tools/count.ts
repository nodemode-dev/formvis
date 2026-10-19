import type { Pt, RGB } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { badgeCursor } from './cursor-badges';

const NEAR = 10;
let drag: { i: number; from: Pt; start: Pt; moved: boolean } | null = null;

/** Count (I, the owner's tool list): click to count, each mark numbered on the canvas within its group; drag a
 *  mark to move it, Alt-click it to remove it; groups have a name and colour and can be hidden or deleted; the
 *  group's count in the bar, and Clear. Saved with the document; each change one step. */
export const countTool: Tool = {
  id: 'count', label: 'Count', key: 'I', order: 80.8,
  icon: () => 'tCount',
  hint: () => 'Click to count · Drag a mark to move it · Alt-click a mark to remove it · New Group in the bar starts another count',
  cursor: () => badgeCursor('count'),
  down(ctx, p) {
    const e = ctx.engine, counts = e.current?.doc.counts ?? [], groups = e.current?.doc.countGroups ?? [];
    if (p.button !== 0 || !e.current) return;
    const v = ctx.view(), at = v.toScreen(p.doc);
    const i = counts.findIndex((c) => { const q = v.toScreen(c); return !groups.find((k) => k.id === (c.g ?? groups[0]?.id))?.hidden && Math.hypot(q.x - at.x, q.y - at.y) <= NEAR; });
    if (p.alt) {
      if (i >= 0) e.removeCount(i);
      return;
    }
    if (i >= 0) { drag = { i, from: p.doc, start: { x: counts[i].x, y: counts[i].y }, moved: false }; return; }
    e.addCount(p.doc);
  },
  move(ctx, p) {
    const d = drag, c = d ? ctx.engine.current?.doc.counts?.[d.i] : null;
    if (!d || !c) return;
    const v = ctx.view(), a = v.toScreen(d.from), b = v.toScreen(p.doc);
    if (!d.moved && Math.hypot(b.x - a.x, b.y - a.y) < 4) return;
    d.moved = true;
    (c as { x: number; y: number }).x = d.start.x + p.doc.x - d.from.x; (c as { x: number; y: number }).y = d.start.y + p.doc.y - d.from.y;
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    const d = drag;
    drag = null;
    const c = d ? ctx.engine.current?.doc.counts?.[d.i] : null;
    if (d?.moved && c) { const to = { x: c.x, y: c.y }; Object.assign(c, d.start); ctx.engine.moveCount(d.i, to); }
  },
  cancel(ctx) { const d = drag, c = d ? ctx.engine.current?.doc.counts?.[d.i] : null; drag = null; if (d && c) { Object.assign(c, d.start); ctx.engine.emit('overlay', null); } },
  options: (e): OptionSpec[] => {
    const groups = () => e.current?.doc.countGroups ?? [], active = () => groups().find((g) => g.id === e.activeCountGroup) ?? groups()[0] ?? null;
    const rgb = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
    const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
    const inGroup = (id: string | undefined): number => (e.current?.doc.counts ?? []).filter((c) => (c.g ?? groups()[0]?.id) === id).length;
    return [
      { kind: 'title', text: 'Count' },
      { kind: 'select', label: 'Group', choices: [{ id: '', label: 'Group 1' }], live: () => (groups().length ? groups().map((g) => ({ id: g.id, label: g.name })) : [{ id: '', label: 'Group 1' }]), get: () => active()?.id ?? '', set: (id) => { e.activeCountGroup = id || null; e.emit('options', null); } },
      { kind: 'button', label: 'New Group', run: () => { e.newCountGroup(); } },
      { kind: 'color', label: 'Group Colour', when: () => !!active(), get: () => rgb(active()?.color ?? '#ff5a36'), set: (c) => { const a = active(); if (a) e.setCountGroup(a.id, { color: hex(c) }); } },
      { kind: 'toggle', label: 'Hide Group', when: () => !!active(), get: () => !!active()?.hidden, set: (v) => { const a = active(); if (a) e.setCountGroup(a.id, { hidden: v }); } },
      { kind: 'readout', label: 'Count', get: () => { const a = active(), all = e.current?.doc.counts?.length ?? 0; return a ? `${inGroup(a.id)} of ${all}` : String(all); } },
      { kind: 'range', label: 'Marker Size', min: 1, max: 12, step: 1, unit: 'px', get: () => e.measureOpts.countMarker, set: (v) => { e.measureOpts.countMarker = v; e.emit('overlay', null); } },
      { kind: 'range', label: 'Label Size', min: 8, max: 32, step: 1, unit: 'px', get: () => e.measureOpts.countLabel, set: (v) => { e.measureOpts.countLabel = v; e.emit('overlay', null); } },
      { kind: 'button', label: 'Delete Group', when: () => groups().length > 0, run: () => { const a = active(); if (a) e.removeCountGroup(a.id); } },
      { kind: 'button', label: 'Clear', run: () => e.clearCounts() },
    ];
  },
};

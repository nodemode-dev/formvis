import { pathActions } from './path-actions';
import { nearestSegment, tracePath, type Anchor, type Pt } from '../../engine';
import type { Tool, ToolContext } from '../registry';

type Part = 'anchor' | 'in' | 'out';
type Grab = { anchor: Anchor; part: Part; from: Pt; start: Map<Anchor, Anchor>; pull: boolean; broken: boolean };
let grab: Grab | null = null;
/** The selected points (filled when drawn), and a box being dragged across empty canvas to select them. */
let chosen = new Set<Anchor>();
let box: { from: Pt; to: Pt; add: boolean } | null = null;
const NEAR = 7;

/** The anchor or handle of the Work Path under screen point `at`, handles first since they sit on top. */
export function pick(anchors: Anchor[], at: Pt, toScreen: (p: Pt) => Pt): { anchor: Anchor; part: Part } | null {
  const near = (p: Pt): boolean => { const s = toScreen(p); return Math.hypot(s.x - at.x, s.y - at.y) <= NEAR; };
  for (const a of anchors) {
    if ((a.outX !== a.x || a.outY !== a.y) && near({ x: a.outX, y: a.outY })) return { anchor: a, part: 'out' };
    if ((a.inX !== a.x || a.inY !== a.y) && near({ x: a.inX, y: a.inY })) return { anchor: a, part: 'in' };
  }
  for (const a of anchors) if (near(a)) return { anchor: a, part: 'anchor' };
  return null;
}

const allAnchors = (ctx: ToolContext): Anchor[] => ctx.engine.workPath?.subpaths.flatMap((s) => s.anchors) ?? [];
/** Only points still in the path count (an undo replaces them). */
const live = (ctx: ToolContext): Set<Anchor> => { const all = new Set(allAnchors(ctx)); chosen = new Set([...chosen].filter((a) => all.has(a))); return chosen; };
const moveBy = (a: Anchor, s: Anchor, dx: number, dy: number): void => { a.x = s.x + dx; a.y = s.y + dy; a.inX = s.inX + dx; a.inY = s.inY + dy; a.outX = s.outX + dx; a.outY = s.outY + dy; };

/** Direct Selection (A): click a point to select it (Shift adds or removes), or drag across empty canvas
 *  to select the points in a box; drag a selected point to move them all with their handles; drag a handle to reshape
 *  the curve (a smooth point's other handle swings round to stay in line), Alt-drag a handle to break it from its
 *  partner; Alt-drag a point to pull out a pair of smooth handles, corner or not. Arrows nudge the selected points. */
export const directSelectTool: Tool = {
  id: 'directSelect', label: 'Direct Selection', key: 'A', order: 76,
  icon: () => 'tDirectSelect',
  options: () => [{ kind: 'title', text: 'Direct Selection' }, ...pathActions()],
  hint: () => 'Click a point to select it, Shift to add, or drag a box · Drag points to move them, handles to reshape · Alt-drag a point to pull out handles, a handle to break it · Alt-click a segment to select its whole path · Arrows nudge',
  cursor: () => 'default',
  down(ctx, p) {
    const vp = ctx.engine.workPath;
    if (p.button !== 0 || !vp) return;
    const v = ctx.view(), hit = pick(allAnchors(ctx), v.toScreen(p.doc), (q) => v.toScreen(q));
    const sel = live(ctx);
    if (!hit) {
      // Alt-click on a segment selects the whole subpath.
      const seg = p.alt ? nearestSegment(vp, v.toScreen(p.doc), (q) => v.toScreen(q)) : null;
      if (seg && seg.d <= NEAR) { if (!p.shift) sel.clear(); for (const a of seg.sp.anchors) sel.add(a); ctx.engine.emit('overlay', null); return; }
      box = { from: p.doc, to: p.doc, add: p.shift }; if (!p.shift) sel.clear(); ctx.engine.emit('overlay', null); return;
    }
    if (hit.part === 'anchor') {
      if (p.shift) { if (sel.has(hit.anchor)) sel.delete(hit.anchor); else sel.add(hit.anchor); }
      else if (!sel.has(hit.anchor)) { sel.clear(); sel.add(hit.anchor); }
    }
    const moving = hit.part === 'anchor' && !p.alt ? [...sel] : [hit.anchor];
    grab = { ...hit, from: p.doc, start: new Map(moving.map((a) => [a, { ...a }])), pull: hit.part === 'anchor' && p.alt, broken: hit.part !== 'anchor' && p.alt };
    ctx.engine.beginPathEdit();
    ctx.engine.emit('overlay', null);
  },
  move(ctx, p) {
    if (box) { box.to = p.doc; ctx.engine.emit('overlay', null); return; }
    const g = grab, vp = ctx.engine.workPath;
    if (!g || !vp) return;
    const dx = p.doc.x - g.from.x, dy = p.doc.y - g.from.y, a = g.anchor, s = g.start.get(a) as Anchor;
    if (g.part === 'anchor' && g.pull) {
      // Handles pulled out of the point, smooth: the one ahead follows the pointer, the other mirrors it.
      a.outX = p.doc.x; a.outY = p.doc.y; a.inX = 2 * s.x - p.doc.x; a.inY = 2 * s.y - p.doc.y;
    } else if (g.part === 'anchor') {
      for (const [q, qs] of g.start) moveBy(q, qs, dx, dy);
    } else {
      const [mx, my] = g.part === 'out' ? [s.outX + dx, s.outY + dy] : [s.inX + dx, s.inY + dy];
      const [ox, oy] = g.part === 'out' ? [s.inX, s.inY] : [s.outX, s.outY];
      const smooth = !g.broken && Math.abs((s.outX - s.x) * (s.inY - s.y) - (s.outY - s.y) * (s.inX - s.x)) < 1e-6 && (s.inX !== s.x || s.inY !== s.y) && (s.outX !== s.x || s.outY !== s.y);
      let [nx, ny] = [ox, oy];
      if (smooth) {
        const keep = Math.hypot(ox - s.x, oy - s.y), len = Math.hypot(mx - s.x, my - s.y) || 1;
        nx = s.x - ((mx - s.x) / len) * keep; ny = s.y - ((my - s.y) / len) * keep;
      }
      if (g.part === 'out') { a.outX = mx; a.outY = my; a.inX = nx; a.inY = ny; } else { a.inX = mx; a.inY = my; a.outX = nx; a.outY = ny; }
    }
    ctx.engine.setWorkPath(vp);
  },
  up(ctx) {
    if (box) {
      const b = box, x0 = Math.min(b.from.x, b.to.x), x1 = Math.max(b.from.x, b.to.x), y0 = Math.min(b.from.y, b.to.y), y1 = Math.max(b.from.y, b.to.y);
      const sel = live(ctx);
      for (const a of allAnchors(ctx)) if (a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1) sel.add(a);
      box = null;
      ctx.engine.emit('overlay', null);
      return;
    }
    grab = null;
    ctx.engine.endPathEdit();
  },
  cancel(ctx) {
    box = null;
    const g = grab;
    grab = null;
    if (g) { for (const [q, qs] of g.start) Object.assign(q, qs); ctx.engine.setWorkPath(ctx.engine.workPath); }
    ctx.engine.endPathEdit();
  },
  keydown(ctx, e) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const vp = ctx.engine.workPath, sel = live(ctx);
    if (!d || !vp || !sel.size) return false;
    const k = e.shiftKey ? 10 : 1;
    ctx.engine.beginPathEdit();
    for (const a of sel) moveBy(a, { ...a }, d[0] * k, d[1] * k);
    ctx.engine.setWorkPath(vp);
    ctx.engine.endPathEdit();
    return true;
  },
  overlay(ctx, gx) {
    const vp = ctx.engine.workPath;
    if (!vp) return;
    const v = ctx.view(), pal = ctx.paint();
    gx.save();
    gx.lineWidth = 1.5;
    gx.strokeStyle = pal.accent;
    gx.stroke(tracePath(vp, (q) => v.toScreen(q)));
    gx.lineWidth = 1;
    for (const a of vp.subpaths.flatMap((s) => s.anchors)) {
      const s = v.toScreen(a);
      for (const [hx, hy] of [[a.inX, a.inY], [a.outX, a.outY]]) {
        if (hx === a.x && hy === a.y) continue;
        const h = v.toScreen({ x: hx, y: hy });
        gx.beginPath(); gx.moveTo(s.x, s.y); gx.lineTo(h.x, h.y); gx.stroke();
        gx.beginPath(); gx.arc(h.x, h.y, 2.5, 0, Math.PI * 2); gx.fillStyle = pal.accent; gx.fill();
      }
      gx.fillStyle = chosen.has(a) ? pal.accent : pal.handle;   // selected filled
      gx.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 3, 6, 6);
      gx.strokeRect(Math.round(s.x) - 3.5, Math.round(s.y) - 3.5, 7, 7);
    }
    if (box) {
      const a = v.toScreen(box.from), b = v.toScreen(box.to);
      gx.setLineDash([4, 3]); gx.strokeStyle = pal.antsA;
      gx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      gx.setLineDash([]);
    }
    gx.restore();
  },
};

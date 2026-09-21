import { anchorNear, cornerAt, nearestSegment, splitSegment, tracePath, type Anchor, type Pt, type SubPath, type VectorPath } from '../../engine';
import type { Tool, ToolContext } from '../registry';

let active: SubPath | null = null;
let pulling: Anchor | null = null;
let hover: Pt | null = null;
const NEAR = 7;

/** What a click at screen point `at` would do to the path between drawing: delete the point there, add one on the
 *  path there (not right at an existing point), or nothing. */
function editAt(vp: VectorPath, at: Pt, map: (p: Pt) => Pt): { kind: 'delete'; sp: SubPath; index: number } | { kind: 'add'; sp: SubPath; index: number; t: number } | null {
  const hit = anchorNear(vp, at, map, NEAR);
  if (hit) return { kind: 'delete', ...hit };
  const seg = nearestSegment(vp, at, map);
  return seg && seg.d <= NEAR && seg.t > 0.02 && seg.t < 0.98 ? { kind: 'add', sp: seg.sp, index: seg.index, t: seg.t } : null;
}

/** The Work Path to draw into, forgetting a sub-path left over from another document. */
function workPath(ctx: ToolContext): VectorPath {
  const vp = ctx.engine.workPath ?? { subpaths: [] };
  if (active && !vp.subpaths.includes(active)) active = null;
  return vp;
}

/** Pen (P): click to place corner points and drag to pull out curve handles; clicking the first point closes the
 *  sub-path, and the next click starts another in the same Work Path. Enter or Escape ends an open sub-path, Backspace
 *  removes its last point, and Ctrl or Cmd with Enter turns the path into a selection. */
export const penTool: Tool = {
  id: 'pen', label: 'Pen', key: 'P', order: 77,
  icon: () => 'penTool',
  hint: () => 'Click for corner points, drag for curves · Click the first point to close · Enter ends an open path, Backspace removes the last point · Between paths, click the path to add a point or a point to delete it · Ctrl+Enter makes a selection',
  cursor: () => 'crosshair',
  options: (e) => [
    { kind: 'button', label: 'Make Selection', run: () => { active = null; e.pathToSelection(); } },
    { kind: 'button', label: 'Fill Path', run: () => e.fillPath() },
    { kind: 'button', label: 'Stroke Path', run: () => e.strokePath() },
    { kind: 'button', label: 'Delete Path', run: () => { active = null; e.deletePath(); } },
  ],
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    ctx.engine.beginPathEdit();
    const vp = workPath(ctx), v = ctx.view();
    if (active && active.anchors.length > 1) {
      const first = v.toScreen(active.anchors[0]), at = v.toScreen(p.doc);
      if (Math.hypot(first.x - at.x, first.y - at.y) <= NEAR) {
        active.closed = true;
        active = null;
        ctx.engine.setWorkPath(vp);
        return;
      }
    }
    if (!active) {
      // Between paths the Pen adds and deletes points: clicking a point deletes it, clicking the path adds one there.
      const edit = editAt(vp, v.toScreen(p.doc), (q) => v.toScreen(q));
      if (edit?.kind === 'delete') {
        edit.sp.anchors.splice(edit.index, 1);
        if (!edit.sp.anchors.length) vp.subpaths.splice(vp.subpaths.indexOf(edit.sp), 1);
        ctx.engine.setWorkPath(vp);
        return;
      }
      if (edit?.kind === 'add') { splitSegment(edit.sp, edit.index, edit.t); ctx.engine.setWorkPath(vp); return; }
      active = { anchors: [], closed: false };
      vp.subpaths.push(active);
    }
    const anchor = cornerAt(p.doc);
    active.anchors.push(anchor);
    pulling = anchor;
    ctx.engine.setWorkPath(vp);
  },
  move(ctx, p) {
    hover = p.doc;
    const a = pulling;
    if (a) { a.outX = p.doc.x; a.outY = p.doc.y; a.inX = 2 * a.x - p.doc.x; a.inY = 2 * a.y - p.doc.y; }
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    pulling = null;
    ctx.engine.endPathEdit();
    ctx.engine.emit('overlay', null);
  },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { pulling = null; ctx.engine.endPathEdit(); },
  keydown(ctx, e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { active = null; ctx.engine.pathToSelection(); return true; }
    if ((e.key === 'Enter' || e.key === 'Escape') && active) { active = null; ctx.engine.emit('overlay', null); return true; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && active) {
      const vp = workPath(ctx);
      active.anchors.pop();
      if (!active.anchors.length) { vp.subpaths.splice(vp.subpaths.indexOf(active), 1); active = null; }
      ctx.engine.setWorkPath(vp);
      return true;
    }
    return false;
  },
  overlay(ctx, g) {
    const vp = ctx.engine.workPath;
    if (!vp) return;
    const v = ctx.view(), pal = ctx.paint();
    g.save();
    g.lineWidth = 1.5;
    g.strokeStyle = pal.accent;
    g.stroke(tracePath(vp, (q) => v.toScreen(q)));
    if (active && hover && !pulling && active.anchors.length) {
      // Where the next segment would run: a dashed curve from the last point to the pointer.
      const last = active.anchors[active.anchors.length - 1], s0 = v.toScreen(last), c1 = v.toScreen({ x: last.outX, y: last.outY }), h = v.toScreen(hover);
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(s0.x, s0.y);
      g.bezierCurveTo(c1.x, c1.y, h.x, h.y, h.x, h.y);
      g.stroke();
      g.setLineDash([]);
    }
    for (const sp of vp.subpaths) {
      for (const a of sp.anchors) {
        const s = v.toScreen(a);
        if (sp === active && (a.outX !== a.x || a.outY !== a.y)) {
          const i = v.toScreen({ x: a.inX, y: a.inY }), o = v.toScreen({ x: a.outX, y: a.outY });
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(i.x, i.y);
          g.lineTo(o.x, o.y);
          g.stroke();
          for (const h of [i, o]) { g.beginPath(); g.arc(h.x, h.y, 2.5, 0, Math.PI * 2); g.fillStyle = pal.accent; g.fill(); }
        }
        g.fillStyle = sp === active ? pal.accent : pal.handle;
        g.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 3, 6, 6);
      }
    }
    if (!active && hover && !pulling) {
      // A plus or minus beside the pointer says whether a click adds or deletes a point.
      const at = v.toScreen(hover), edit = editAt(vp, at, (q) => v.toScreen(q));
      if (edit) {
        const x = Math.round(at.x) + 12, y = Math.round(at.y) + 12;
        g.lineWidth = 1.5;
        g.strokeStyle = pal.accent;
        g.beginPath();
        g.moveTo(x - 4, y); g.lineTo(x + 4, y);
        if (edit.kind === 'add') { g.moveTo(x, y - 4); g.lineTo(x, y + 4); }
        g.stroke();
      }
    }
    g.restore();
  },
};

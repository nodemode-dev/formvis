import { tracePath, type Pt, type SubPath, type VectorPath } from '../../engine';
import { smoothAnchors } from '../../engine/curve-fit';
import type { Tool } from '../registry';

/** The path being drawn: the clicked points, which of them are corners, and the subpath they make. */
let active: { points: Pt[]; corners: Set<number>; sp: SubPath } | null = null;
let hover: Pt | null = null;
const NEAR = 7;

const reshape = (a: NonNullable<typeof active>, closed: boolean): void => { a.sp.anchors = smoothAnchors(a.points, closed, a.corners); };

/** Curvature Pen (P, with the Pen): click to place points and the curve passes smoothly through all of them, reshaping
 *  as points are added, as Photoshop's does; Alt-click places a corner. Click the first point to close the path; Enter
 *  or Escape ends it open; Backspace takes back the last point. */
export const curvaturePenTool: Tool = {
  id: 'curvaturePen', label: 'Curvature Pen', key: 'P', order: 77.6,
  icon: () => 'penTool',
  hint: () => 'Click to place points; the curve runs smoothly through them · Alt-click for a corner · click the first point to close · Enter ends',
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    const vp: VectorPath = ctx.engine.workPath ?? { subpaths: [] }, v = ctx.view();
    ctx.engine.beginPathEdit();
    if (active && active.points.length > 2) {
      const first = v.toScreen(active.points[0]), at = v.toScreen(p.doc);
      if (Math.hypot(first.x - at.x, first.y - at.y) <= NEAR) {
        active.sp.closed = true;
        reshape(active, true);
        active = null;
        ctx.engine.setWorkPath(vp);
        ctx.engine.endPathEdit();
        return;
      }
    }
    if (!active || !vp.subpaths.includes(active.sp)) {
      const sp: SubPath = { anchors: [], closed: false };
      vp.subpaths.push(sp);
      active = { points: [], corners: new Set(), sp };
    }
    if (p.alt) active.corners.add(active.points.length);
    active.points.push(p.doc);
    reshape(active, false);
    ctx.engine.setWorkPath(vp);
    ctx.engine.endPathEdit();
  },
  move(ctx, p) { hover = p.doc; ctx.engine.emit('overlay', null); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  keydown(ctx, e) {
    if (!active) return false;
    if (e.key === 'Enter' || e.key === 'Escape') { active = null; ctx.engine.emit('overlay', null); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const vp = ctx.engine.workPath;
      if (!vp) return true;
      ctx.engine.beginPathEdit();
      active.corners.delete(active.points.length - 1);
      active.points.pop();
      if (!active.points.length) { vp.subpaths.splice(vp.subpaths.indexOf(active.sp), 1); active = null; }
      else reshape(active, false);
      ctx.engine.setWorkPath(vp);
      ctx.engine.endPathEdit();
      return true;
    }
    return false;
  },
  cancel(ctx) { active = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    const vp = ctx.engine.workPath, v = ctx.view(), pal = ctx.paint();
    g.save();
    g.lineWidth = 1.5;
    g.strokeStyle = pal.accent;
    if (vp) g.stroke(tracePath(vp, (q) => v.toScreen(q)));
    if (active && hover) {
      // How the curve would run if the next point went where the pointer is.
      const next = { subpaths: [{ closed: false, anchors: smoothAnchors([...active.points, hover], false, active.corners) }] };
      g.setLineDash([4, 3]);
      g.stroke(tracePath(next, (q) => v.toScreen(q)));
      g.setLineDash([]);
    }
    if (active) {
      g.fillStyle = pal.handle;
      for (const q of active.points) { const s = v.toScreen(q); g.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 3, 6, 6); g.strokeRect(Math.round(s.x) - 3.5, Math.round(s.y) - 3.5, 7, 7); }
    }
    g.restore();
  },
};

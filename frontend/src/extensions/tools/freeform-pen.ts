import type { Pt, VectorPath } from '../../engine';
import { simplify, smoothAnchors } from '../../engine/curve-fit';
import type { Tool } from '../registry';

let stroke: Pt[] | null = null;
const fit = { px: 2 };
const CLOSE = 8;

/** Freeform Pen (P, with the Pen): drag to draw a path freehand. On release the stroke is thinned to the points that
 *  shape it (Curve Fit, in screen pixels) and becomes a smooth subpath through them, closed when it
 *  ends near where it began. Each stroke adds a subpath to the selected path, or starts a Work Path. */
export const freeformPenTool: Tool = {
  id: 'freeformPen', label: 'Freeform Pen', key: 'P', order: 77.5,
  icon: () => 'tFreeformPen',
  hint: () => 'Drag to draw a path freehand · end near the start to close it · Curve Fit sets how closely it follows',
  cursor: () => 'crosshair',
  options: () => [
    { kind: 'title', text: 'Freeform Pen' },
    { kind: 'range', label: 'Curve fit', min: 0.5, max: 10, step: 0.5, unit: 'px', get: () => fit.px, set: (v: number) => { fit.px = v; } },
  ],
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    stroke = [p.doc];
  },
  move(ctx, p) {
    if (!stroke) return;
    const last = stroke[stroke.length - 1];
    if (Math.hypot(p.doc.x - last.x, p.doc.y - last.y) * ctx.view().zoom >= 1) stroke.push(p.doc);
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    const pts = stroke;
    stroke = null;
    ctx.engine.emit('overlay', null);
    if (!pts || pts.length < 2) return;
    const z = ctx.view().zoom, first = pts[0], last = pts[pts.length - 1];
    const closed = pts.length > 3 && Math.hypot(last.x - first.x, last.y - first.y) * z <= CLOSE;
    let kept = simplify(pts, fit.px / z);
    if (closed && kept.length > 2) kept = kept.slice(0, -1);
    if (kept.length < 2) return;
    const vp: VectorPath = ctx.engine.workPath ?? { subpaths: [] };
    ctx.engine.beginPathEdit();
    vp.subpaths.push({ closed, anchors: smoothAnchors(kept, closed) });
    ctx.engine.setWorkPath(vp);
    ctx.engine.endPathEdit();
  },
  cancel(ctx) { stroke = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    if (!stroke || stroke.length < 2) return;
    const v = ctx.view(), pal = ctx.paint();
    g.save();
    g.lineWidth = 1.5;
    g.strokeStyle = pal.accent;
    g.beginPath();
    stroke.forEach((q, i) => { const s = v.toScreen(q); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); });
    g.stroke();
    g.restore();
  },
};

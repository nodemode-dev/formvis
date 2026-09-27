import type { Anchor, Pt } from '../../engine';
import { tracePath } from '../../engine';
import type { Tool } from '../registry';
import { pathActions } from './path-actions';
import { pick } from './direct-select';

let grab: { anchor: Anchor; part: 'anchor' | 'in' | 'out'; from: Pt; start: Anchor; moved: boolean } | null = null;

/** Convert Point (in the Pen group), as Photoshop's (the owner's tool list): click a smooth point to make it a corner,
 *  its handles retracted; drag from a point to pull out smooth handles; drag a handle to move it alone, breaking the
 *  pair. Each change is one step. */
export const convertPointTool: Tool = {
  id: 'convertPoint', label: 'Convert Point', key: 'P', order: 77.7,
  icon: () => 'tConvertPoint',
  options: () => [{ kind: 'title', text: 'Convert Point' }, ...pathActions()],
  hint: () => 'Click a smooth point to make it a corner · Drag from a point to pull out smooth handles · Drag a handle to move it alone',
  cursor: () => 'default',
  down(ctx, p) {
    const vp = ctx.engine.workPath;
    if (p.button !== 0 || !vp) return;
    const v = ctx.view(), hit = pick(vp.subpaths.flatMap((s) => s.anchors), v.toScreen(p.doc), (q) => v.toScreen(q));
    if (!hit) return;
    grab = { ...hit, from: p.doc, start: { ...hit.anchor }, moved: false };
    ctx.engine.beginPathEdit();
  },
  move(ctx, p) {
    const g = grab, vp = ctx.engine.workPath;
    if (!g || !vp) return;
    const v = ctx.view(), a0 = v.toScreen(g.from), a1 = v.toScreen(p.doc);
    if (!g.moved && Math.hypot(a1.x - a0.x, a1.y - a0.y) < 3) return;
    g.moved = true;
    const a = g.anchor, s = g.start;
    if (g.part === 'anchor') { a.outX = p.doc.x; a.outY = p.doc.y; a.inX = 2 * s.x - p.doc.x; a.inY = 2 * s.y - p.doc.y; }
    else if (g.part === 'out') { a.outX = p.doc.x; a.outY = p.doc.y; }
    else { a.inX = p.doc.x; a.inY = p.doc.y; }
    ctx.engine.setWorkPath(vp);
  },
  up(ctx) {
    const g = grab, vp = ctx.engine.workPath;
    grab = null;
    if (g && !g.moved && g.part === 'anchor' && vp) {
      const a = g.anchor;   // a click: the point becomes a corner
      a.inX = a.x; a.inY = a.y; a.outX = a.x; a.outY = a.y;
      ctx.engine.setWorkPath(vp);
    }
    ctx.engine.endPathEdit();
  },
  cancel(ctx) {
    const g = grab;
    grab = null;
    if (g) { Object.assign(g.anchor, g.start); ctx.engine.setWorkPath(ctx.engine.workPath); }
    ctx.engine.endPathEdit();
  },
  overlay(ctx, gx) {
    const vp = ctx.engine.workPath;
    if (!vp) return;
    const v = ctx.view(), pal = ctx.paint();
    gx.save();
    gx.lineWidth = 1.5; gx.strokeStyle = pal.accent;
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
      gx.fillStyle = pal.handle;
      gx.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 3, 6, 6);
      gx.strokeRect(Math.round(s.x) - 3.5, Math.round(s.y) - 3.5, 7, 7);
    }
    gx.restore();
  },
};

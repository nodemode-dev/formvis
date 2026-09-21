import { tracePath, type Anchor, type Pt } from '../../engine';
import type { Tool } from '../registry';

type Grab = { anchor: Anchor; part: 'anchor' | 'in' | 'out'; from: Pt; start: Anchor };
let grab: Grab | null = null;
const NEAR = 7;

/** The anchor or handle of the Work Path under screen point `at`, handles first since they sit on top. */
function pick(anchors: Anchor[], at: Pt, toScreen: (p: Pt) => Pt): { anchor: Anchor; part: 'anchor' | 'in' | 'out' } | null {
  const near = (p: Pt): boolean => { const s = toScreen(p); return Math.hypot(s.x - at.x, s.y - at.y) <= NEAR; };
  for (const a of anchors) {
    if ((a.outX !== a.x || a.outY !== a.y) && near({ x: a.outX, y: a.outY })) return { anchor: a, part: 'out' };
    if ((a.inX !== a.x || a.inY !== a.y) && near({ x: a.inX, y: a.inY })) return { anchor: a, part: 'in' };
  }
  for (const a of anchors) if (near(a)) return { anchor: a, part: 'anchor' };
  return null;
}

/** Direct Selection (A): drag a Work Path anchor to move it with its handles, or drag a handle to reshape the curve; on
 *  a smooth point the opposite handle swings round to stay in line, keeping its own length. */
export const directSelectTool: Tool = {
  id: 'directSelect', label: 'Direct Selection', key: 'A', order: 76,
  icon: () => 'directSelectTool',
  hint: () => 'Drag a path point to move it, or a handle to reshape its curve · Draw paths with the Pen (P)',
  cursor: () => 'default',
  down(ctx, p) {
    const vp = ctx.engine.workPath;
    if (p.button !== 0 || !vp) return;
    const v = ctx.view(), hit = pick(vp.subpaths.flatMap((s) => s.anchors), v.toScreen(p.doc), (q) => v.toScreen(q));
    grab = hit ? { ...hit, from: p.doc, start: { ...hit.anchor } } : null;
  },
  move(ctx, p) {
    const g = grab, vp = ctx.engine.workPath;
    if (!g || !vp) return;
    const dx = p.doc.x - g.from.x, dy = p.doc.y - g.from.y, a = g.anchor, s = g.start;
    if (g.part === 'anchor') {
      a.x = s.x + dx; a.y = s.y + dy; a.inX = s.inX + dx; a.inY = s.inY + dy; a.outX = s.outX + dx; a.outY = s.outY + dy;
    } else {
      const [mx, my] = g.part === 'out' ? [s.outX + dx, s.outY + dy] : [s.inX + dx, s.inY + dy];
      const [ox, oy] = g.part === 'out' ? [s.inX, s.inY] : [s.outX, s.outY];
      const smooth = Math.abs((s.outX - s.x) * (s.inY - s.y) - (s.outY - s.y) * (s.inX - s.x)) < 1e-6 && (s.inX !== s.x || s.inY !== s.y) && (s.outX !== s.x || s.outY !== s.y);
      let [nx, ny] = [ox, oy];
      if (smooth) {
        const keep = Math.hypot(ox - s.x, oy - s.y), len = Math.hypot(mx - s.x, my - s.y) || 1;
        nx = s.x - ((mx - s.x) / len) * keep; ny = s.y - ((my - s.y) / len) * keep;
      }
      if (g.part === 'out') { a.outX = mx; a.outY = my; a.inX = nx; a.inY = ny; } else { a.inX = mx; a.inY = my; a.outX = nx; a.outY = ny; }
    }
    ctx.engine.setWorkPath(vp);
  },
  up() { grab = null; },
  cancel(ctx) {
    const g = grab;
    grab = null;
    if (g) { Object.assign(g.anchor, g.start); ctx.engine.setWorkPath(ctx.engine.workPath); }
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
      gx.fillStyle = pal.handle;
      gx.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 3, 6, 6);
      gx.strokeRect(Math.round(s.x) - 3.5, Math.round(s.y) - 3.5, 7, 7);
    }
    gx.restore();
  },
};

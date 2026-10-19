import { pathActions } from './path-actions';
import { cornerWidgetCancel, cornerWidgetDown, cornerWidgetMove, cornerWidgetOverlay, cornerWidgetUp } from './corner-widgets';
import { PATH_OPS, tracePath, type Anchor, type PathOp, type Pt, type SubPath, type VectorPath } from '../../engine';
import type { Tool } from '../registry';

/** The subpath chosen with Path Selection, as an index into the selected path's subpaths. */
let chosen: number | null = null;
let drag: { from: Pt; start: Anchor[] } | null = null;
let probe: CanvasRenderingContext2D | null = null;

const shifted = (a: Anchor, dx: number, dy: number): Anchor => ({ x: a.x + dx, y: a.y + dy, inX: a.inX + dx, inY: a.inY + dy, outX: a.outX + dx, outY: a.outY + dy });
const copy = (sp: SubPath): SubPath => ({ closed: sp.closed, anchors: sp.anchors.map((a) => ({ ...a })) });

/** The topmost subpath under `at` (document point): inside a closed one, or within `reach` of an open one's line. */
export function subpathAt(vp: VectorPath, at: Pt, reach: number): number | null {
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  for (let i = vp.subpaths.length - 1; i >= 0; i--) {
    const sp = vp.subpaths[i];
    if (!sp.anchors.length) continue;
    const shape = tracePath({ subpaths: [sp] });
    probe.lineWidth = reach * 2;
    if ((sp.closed && probe.isPointInPath(shape, at.x, at.y, 'nonzero')) || probe.isPointInStroke(shape, at.x, at.y)) return i;
  }
  return null;
}

/** Path Selection (A, with Direct Selection): click a subpath to choose it whole, drag to move it, Alt-drag to move a
 *  copy, Delete to remove it, and the arrow keys to nudge it (Shift for 10 px); the
 *  points themselves are Direct Selection's. */
export const pathSelectTool: Tool = {
  id: 'pathSelect', label: 'Path Selection', key: 'A', order: 75.5,
  icon: () => 'tPathSelect',
  hint: () => 'Click a path to select it whole · drag to move it · Alt-drag to copy · Delete removes it · arrows nudge',
  cursor: () => 'default',
  options: (e) => [
    { kind: 'title', text: 'Path Selection' },
    {
      kind: 'segment', label: 'Operation', choices: PATH_OPS.map((o) => ({ id: o, label: o[0].toUpperCase() + o.slice(1) })),
      get: () => { const sp = chosen !== null ? e.workPath?.subpaths[chosen] : null; return sp?.op ?? 'combine'; },
      set: (v: string) => {
        const vp = e.workPath, sp = chosen !== null ? vp?.subpaths[chosen] : null;
        if (!vp || !sp) { e.notice('Choose a path with the Path Selection tool first.'); return; }
        e.beginPathEdit();
        if (v === 'combine') delete sp.op; else sp.op = v as PathOp;
        e.setWorkPath(vp);
        e.endPathEdit();
        e.emit('options', null);
      },
    },
    ...pathActions(),
  ],
  down(ctx, p) {
    if (cornerWidgetDown(ctx, p)) return;
    const vp = ctx.engine.workPath;
    if (p.button !== 0 || !vp) return;
    const hit = subpathAt(vp, p.doc, 5 / ctx.view().zoom);
    chosen = hit;
    ctx.engine.pathComponents = hit === null ? [] : [hit];
    drag = null;
    ctx.engine.emit('options', null);
    if (hit === null) { ctx.engine.emit('overlay', null); return; }
    ctx.engine.beginPathEdit();
    // Alt-drag leaves the original where it was and moves a copy placed just above it.
    if (p.alt) vp.subpaths.splice(hit + 1, 0, copy(vp.subpaths[hit]));
    const at = p.alt ? hit + 1 : hit;
    chosen = at;
    ctx.engine.pathComponents = [at];
    drag = { from: p.doc, start: vp.subpaths[at].anchors.map((a) => ({ ...a })) };
    ctx.engine.emit('overlay', null);
  },
  move(ctx, p) {
    if (cornerWidgetMove(ctx, p)) return;
    const vp = ctx.engine.workPath;
    if (!drag || chosen === null || !vp?.subpaths[chosen]) return;
    const dx = p.doc.x - drag.from.x, dy = p.doc.y - drag.from.y;
    vp.subpaths[chosen].anchors = drag.start.map((a) => shifted(a, dx, dy));
    ctx.engine.setWorkPath(vp);
  },
  up(ctx) {
    if (cornerWidgetUp(ctx)) return;
    const vp = ctx.engine.workPath;
    if (drag && vp) ctx.engine.setWorkPath(vp);
    drag = null;
    ctx.engine.endPathEdit();
  },
  cancel(ctx) {
    cornerWidgetCancel(ctx);
    const vp = ctx.engine.workPath;
    if (drag && vp && chosen !== null && vp.subpaths[chosen]) { vp.subpaths[chosen].anchors = drag.start; ctx.engine.setWorkPath(vp); }
    drag = null;
    ctx.engine.endPathEdit();
  },
  keydown(ctx, e) {
    const vp = ctx.engine.workPath;
    // While a path is showing, Delete belongs to it: with nothing chosen it does nothing rather than falling through to
    // the app, where it would delete the layer.
    if ((e.key === 'Delete' || e.key === 'Backspace') && vp && (chosen === null || !vp.subpaths[chosen])) return true;
    if (chosen === null || !vp?.subpaths[chosen]) return false;
    const step = e.shiftKey ? 10 : 1, arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === 'Delete' || e.key === 'Backspace') {
      ctx.engine.beginPathEdit();
      vp.subpaths.splice(chosen, 1);
      chosen = null;
      ctx.engine.setWorkPath(vp);
      ctx.engine.endPathEdit();
      return true;
    }
    const d = arrows[e.key];
    if (!d) return false;
    ctx.engine.beginPathEdit();
    vp.subpaths[chosen].anchors = vp.subpaths[chosen].anchors.map((a) => shifted(a, d[0], d[1]));
    ctx.engine.setWorkPath(vp);
    ctx.engine.endPathEdit();
    return true;
  },
  overlay(ctx, gx) {
    cornerWidgetOverlay(ctx, gx);
    const vp = ctx.engine.workPath;
    if (!vp) return;
    const v = ctx.view(), pal = ctx.paint();
    gx.save();
    gx.lineWidth = 1.5;
    gx.strokeStyle = pal.accent;
    gx.stroke(tracePath(vp, (q) => v.toScreen(q)));
    // The chosen subpath's points show solid when a path is selected whole.
    const sp = chosen !== null ? vp.subpaths[chosen] : null;
    if (sp) {
      gx.fillStyle = pal.accent;
      for (const a of sp.anchors) { const s = v.toScreen(a); gx.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 3, 6, 6); }
    }
    gx.restore();
  },
};

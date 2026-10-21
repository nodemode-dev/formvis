import { pathActions } from './path-actions';
import { cornerWidgetCancel, cornerWidgetDown, cornerWidgetMove, cornerWidgetOverlay, cornerWidgetUp } from './corner-widgets';
import { PATH_OPS, pathBounds, tracePath, type Anchor, type Engine, type PathOp, type Pt, type SubPath, type VectorPath } from '../../engine';
import type { OptionSpec, Tool } from '../registry';

/** The subpath chosen with Path Selection, as an index into the selected path's subpaths. */
let chosen: number | null = null;
let drag: { from: Pt; moves: Array<{ at: number; start: Anchor[] }> } | null = null;
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

type Edge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Aligns the chosen subpaths to one another's outer box (a single one to the canvas), or spreads three or more evenly
 *  between the outermost two; one undo step. */
function arrange(e: Engine, how: Edge | 'distH' | 'distV'): void {
  const vp = e.workPath, doc = e.current?.doc, idx = [...new Set(e.pathComponents)].filter((i) => !!vp?.subpaths[i]);
  if (!vp || !doc || !idx.length) { e.notice('Choose paths with the Path Selection tool first (Shift-click adds more).'); return; }
  const boxes = idx.map((i) => pathBounds({ subpaths: [vp.subpaths[i]] }) as NonNullable<ReturnType<typeof pathBounds>>);
  const shifts: Array<[number, number]> = idx.map(() => [0, 0]);
  if (how === 'distH' || how === 'distV') {
    if (idx.length < 3) { e.notice('Distribute needs three or more chosen paths.'); return; }
    const h = how === 'distH', at = (b: (typeof boxes)[number]): number => (h ? b.x + b.w / 2 : b.y + b.h / 2);
    const order = idx.map((_, k) => k).sort((a, b) => at(boxes[a]) - at(boxes[b])), first = at(boxes[order[0]]), last = at(boxes[order[order.length - 1]]);
    order.forEach((k, n) => { const d = first + ((last - first) * n) / (order.length - 1) - at(boxes[k]); shifts[k] = h ? [d, 0] : [0, d]; });
  } else {
    const whole = idx.length === 1 ? { x: 0, y: 0, w: doc.width, h: doc.height } : { x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)), w: 0, h: 0 };
    if (idx.length > 1) { whole.w = Math.max(...boxes.map((b) => b.x + b.w)) - whole.x; whole.h = Math.max(...boxes.map((b) => b.y + b.h)) - whole.y; }
    boxes.forEach((b, k) => {
      shifts[k] = how === 'left' ? [whole.x - b.x, 0] : how === 'right' ? [whole.x + whole.w - (b.x + b.w), 0] : how === 'hcenter' ? [whole.x + whole.w / 2 - (b.x + b.w / 2), 0]
        : how === 'top' ? [0, whole.y - b.y] : how === 'bottom' ? [0, whole.y + whole.h - (b.y + b.h)] : [0, whole.y + whole.h / 2 - (b.y + b.h / 2)];
    });
  }
  if (shifts.every(([x, y]) => !x && !y)) return;
  e.beginPathEdit();
  idx.forEach((i, k) => { vp.subpaths[i].anchors = vp.subpaths[i].anchors.map((a) => shifted(a, shifts[k][0], shifts[k][1])); });
  e.setWorkPath(vp);
  e.endPathEdit();
}

const arrangeButtons = (e: Engine): OptionSpec[] => ([
  ['Align left edges', 'alignLeftEdge', 'left'], ['Align horizontal centers', 'alignHcenterEdge', 'hcenter'], ['Align right edges', 'alignRightEdge', 'right'],
  ['Align top edges', 'alignTopEdge', 'top'], ['Align vertical centers', 'alignVcenterEdge', 'vcenter'], ['Align bottom edges', 'alignBottomEdge', 'bottom'],
  ['Distribute horizontally', 'distributeH', 'distH'], ['Distribute vertically', 'distributeV', 'distV'],
] as const).map(([label, icon, how]) => ({ kind: 'button', label, icon, run: () => arrange(e, how), compact: true }));

/** Path Selection (A, with Direct Selection): click a subpath to choose it whole (Shift adds or removes one), drag to move
 *  it, Alt-drag to move a copy, Delete to remove it, and the arrow keys to nudge it (Shift for 10 px); the bar's align and
 *  distribute buttons line the chosen paths up. The points themselves are Direct Selection's. */
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
    ...arrangeButtons(e),
    ...pathActions(),
  ],
  down(ctx, p) {
    if (cornerWidgetDown(ctx, p)) return;
    const vp = ctx.engine.workPath;
    if (p.button !== 0 || !vp) return;
    const hit = subpathAt(vp, p.doc, 5 / ctx.view().zoom);
    if (p.shift && hit !== null) {
      const set = ctx.engine.pathComponents.filter((i) => i !== hit);
      ctx.engine.pathComponents = set.length === ctx.engine.pathComponents.length ? [...set, hit] : set;
      chosen = ctx.engine.pathComponents.includes(hit) ? hit : (ctx.engine.pathComponents[0] ?? null);
      drag = null;
      ctx.engine.emit('options', null);
      ctx.engine.emit('overlay', null);
      return;
    }
    // Pressing on one of several chosen paths keeps them all chosen and drags them together.
    const group = hit !== null && ctx.engine.pathComponents.length > 1 && ctx.engine.pathComponents.includes(hit) ? ctx.engine.pathComponents.filter((i) => !!vp.subpaths[i]) : null;
    if (!group) {
      chosen = hit;
      ctx.engine.pathComponents = hit === null ? [] : [hit];
    } else chosen = hit;
    drag = null;
    ctx.engine.emit('options', null);
    if (hit === null) { ctx.engine.emit('overlay', null); return; }
    ctx.engine.beginPathEdit();
    // Alt-drag leaves the originals where they were and moves copies: one placed just above a single path, or added after the group.
    let moved = group ?? [hit];
    if (p.alt) {
      if (group) { moved = group.map((i) => { vp.subpaths.push(copy(vp.subpaths[i])); return vp.subpaths.length - 1; }); chosen = moved[group.indexOf(hit)]; }
      else { vp.subpaths.splice(hit + 1, 0, copy(vp.subpaths[hit])); moved = [hit + 1]; chosen = hit + 1; }
      ctx.engine.pathComponents = moved;
    }
    drag = { from: p.doc, moves: moved.map((at) => ({ at, start: vp.subpaths[at].anchors.map((a) => ({ ...a })) })) };
    ctx.engine.emit('overlay', null);
  },
  move(ctx, p) {
    if (cornerWidgetMove(ctx, p)) return;
    const vp = ctx.engine.workPath;
    if (!drag || !vp) return;
    const dx = p.doc.x - drag.from.x, dy = p.doc.y - drag.from.y;
    for (const m of drag.moves) if (vp.subpaths[m.at]) vp.subpaths[m.at].anchors = m.start.map((a) => shifted(a, dx, dy));
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
    if (drag && vp) { for (const m of drag.moves) if (vp.subpaths[m.at]) vp.subpaths[m.at].anchors = m.start; ctx.engine.setWorkPath(vp); }
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
    for (const i of new Set([chosen, ...ctx.engine.pathComponents])) if (vp.subpaths[i]) vp.subpaths[i].anchors = vp.subpaths[i].anchors.map((a) => shifted(a, d[0], d[1]));
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
    const picked = new Set(ctx.engine.pathComponents);
    if (chosen !== null) picked.add(chosen);
    gx.fillStyle = pal.accent;
    for (const i of picked) for (const a of vp.subpaths[i]?.anchors ?? []) { const s = v.toScreen(a); gx.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 3, 6, 6); }
    gx.restore();
  },
};

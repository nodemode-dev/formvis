import { cornerAt, type Pt, type SubPath, type VectorPath } from '../../engine';
import { simplify, smoothAnchors } from '../../engine/curve-fit';
import { EdgeMap, liveWire, snapToEdge } from '../../engine/livewire';
import type { Tool, ToolContext } from '../registry';
import { badgeCursor } from './cursor-badges';

let stroke: Pt[] | null = null;
let chain: SubPath | null = null;
let edges: EdgeMap | null = null;
const fit = { px: 2 };
const mag = { on: false, width: 10, contrast: 10 };
const CLOSE = 8;

function edgeMapOf(ctx: ToolContext): EdgeMap | null {
  const c = ctx.engine.flattened?.(); if (!c) return null;
  const d = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height);
  return EdgeMap.fromRGBA(d.data, c.width, c.height, mag.contrast / 100);
}

/** Freeform Pen (P, with the Pen): drag to draw a path freehand. On release the stroke is thinned to the points that
 *  shape it (Curve Fit, in screen pixels) and becomes a smooth subpath through them, closed when it
 *  ends near where it began. Each stroke adds a subpath to the selected path, or starts a Work Path. */
export const freeformPenTool: Tool = {
  id: 'freeformPen', label: 'Freeform Pen', key: 'P', order: 77.5,
  icon: () => 'tFreeformPen',
  hint: () => 'Drag to draw a path freehand · end near the start to close it · Alt-click for straight segments · Curve Fit sets how closely it follows · Magnetic hugs the edges within Width',
  cursor: () => badgeCursor('freeformPen'),
  options: () => [
    { kind: 'title', text: 'Freeform Pen' },
    { kind: 'range', label: 'Curve fit', min: 0.5, max: 10, step: 0.5, unit: 'px', get: () => fit.px, set: (v: number) => { fit.px = v; } },
    { kind: 'toggle', label: 'Magnetic', get: () => mag.on, set: (v: boolean) => { mag.on = v; } },
    { kind: 'range', label: 'Width', min: 1, max: 40, step: 1, unit: 'px', get: () => mag.width, set: (v: number) => { mag.width = v; } },
    { kind: 'range', label: 'Contrast', min: 1, max: 100, step: 1, unit: '%', get: () => mag.contrast, set: (v: number) => { mag.contrast = v; } },
  ],
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    if (!p.alt) {
      chain = null;
      edges = mag.on ? edgeMapOf(ctx) : null;
      stroke = [edges ? snapToEdge(edges, p.doc, mag.width) : p.doc];
      return;
    }
    // Alt-click lays straight segments: each click adds a corner point; the first point closes the chain.
    const vp: VectorPath = ctx.engine.workPath ?? { subpaths: [] }, z = ctx.view().zoom;
    ctx.engine.beginPathEdit();
    if (chain && vp.subpaths.includes(chain) && chain.anchors.length > 2 && Math.hypot(chain.anchors[0].x - p.doc.x, chain.anchors[0].y - p.doc.y) * z <= CLOSE) { chain.closed = true; chain = null; }
    else {
      if (!chain || !vp.subpaths.includes(chain)) { chain = { closed: false, anchors: [] }; vp.subpaths.push(chain); }
      chain.anchors.push(cornerAt(p.doc));
    }
    ctx.engine.setWorkPath(vp);
    ctx.engine.endPathEdit();
  },
  keydown(ctx, e) {
    if (!chain || (e.key !== 'Enter' && e.key !== 'Escape')) return false;
    chain = null;
    ctx.engine.emit('overlay', null);
    return true;
  },
  move(ctx, p) {
    if (!stroke) return;
    const last = stroke[stroke.length - 1];
    if (Math.hypot(p.doc.x - last.x, p.doc.y - last.y) * ctx.view().zoom < 1) return;
    if (edges) {
      const to = snapToEdge(edges, p.doc, mag.width);
      stroke.push(...liveWire(edges, last, to, mag.width * 2 + 8).slice(1));
    } else stroke.push(p.doc);
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    const pts = stroke;
    stroke = null;
    edges = null;
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
  cancel(ctx) { stroke = null; edges = null; ctx.engine.emit('overlay', null); },
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

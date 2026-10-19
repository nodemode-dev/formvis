import type { Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';

let from: Pt | null = null, to: Pt | null = null, square = false;

const rectOf = (a: Pt, b: Pt, sq: boolean): { x: number; y: number; w: number; h: number } => {
  let w = b.x - a.x, h = b.y - a.y;
  if (sq) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
  return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h) };
};

/** The Frame tool (K, the owner's walkthrough): drag a rectangular or
 *  elliptical frame, Shift for a square or circle; it becomes a folder whose mask is its shape, selected, so an image
 *  imported next goes into it and covers it. An empty frame shows its placeholder cross on screen only. */
export const frameTool: Tool = {
  id: 'frame', label: 'Frame', key: 'K', order: 46,
  icon: (e) => (e.frameShape === 'ellipse' ? 'tFrameEllipse' : 'tFrame'),
  variants: (e) => [
    { id: 'rect', label: 'Rectangular Frame', icon: 'tFrame', active: () => e.frameShape !== 'ellipse', pick: () => { e.frameShape = 'rect'; e.emit('options', null); } },
    { id: 'ellipse', label: 'Elliptical Frame', icon: 'tFrameEllipse', active: () => e.frameShape === 'ellipse', pick: () => { e.frameShape = 'ellipse'; e.emit('options', null); } },
  ],
  hint: () => 'Drag to draw a frame · Shift for a square or circle · Import an image with the frame selected to fill it',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button !== 0 || !ctx.engine.current) return; from = p.doc; to = p.doc; square = p.shift; ctx.engine.emit('overlay', null); },
  move(ctx, p) { if (!from) return; to = p.doc; square = p.shift; ctx.engine.emit('overlay', null); },
  up(ctx) {
    if (from && to) { const r = rectOf(from, to, square); if (r.w >= 4 && r.h >= 4) ctx.engine.newFrameLayer(r); }
    from = to = null;
    ctx.engine.emit('overlay', null);
  },
  cancel(ctx) { from = to = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    if (!from || !to) return;
    const v = ctx.view(), pal = ctx.paint(), r = rectOf(from, to, square), a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
    g.save();
    for (const [color, off] of [[pal.antsA, 0], [pal.antsB, 4]] as const) {
      g.strokeStyle = color; g.lineWidth = 1; g.setLineDash([4, 4]); g.lineDashOffset = off;
      g.beginPath();
      if (ctx.engine.frameShape === 'ellipse') g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, (b.x - a.x) / 2, (b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else g.rect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
      g.stroke();
    }
    g.restore();
  },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Frame' },
    { kind: 'segment', label: 'Shape', choices: [{ id: 'rect', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }], get: () => e.frameShape, set: (v) => { e.frameShape = v as 'rect' | 'ellipse'; e.emit('options', null); e.emit('tool', null); } },
  ],
};

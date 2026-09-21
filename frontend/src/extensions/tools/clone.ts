import type { Pt } from '../../engine';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;
let picking = false;

export const cloneTool: Tool = {
  id: 'cloneStamp', label: 'Clone Stamp', key: 'S', order: 60,
  icon: () => 'duplicate',
  hint: () => 'Alt-click to set the source, then paint to copy from it · Aligned keeps the offset between strokes · Sample all layers copies what you see · [ ] size',
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    if (p.alt) { ctx.engine.setCloneSource(p.doc); return; }
    hover = p.doc;
    ctx.engine.beginRetouchStroke('clone', p.doc, p.shift);
  },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; picking = !!p?.alt; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown: (ctx, e) => brushKeys(ctx, e),
  overlay(ctx, g) {
    const e = ctx.engine, v = ctx.view();
    // Between strokes, the circle previews what a click would stamp; Option (picking a source) hides it.
    if (hover && !picking) {
      const pv = e.clonePreview(hover, v.zoom * (window.devicePixelRatio || 1));
      if (pv) {
        const c = v.toScreen(hover), size = e.brush.diameter * v.zoom;
        g.save();
        g.globalAlpha = e.brush.opacity;
        g.drawImage(pv, c.x - size / 2, c.y - size / 2, size, size);
        g.restore();
      }
    }
    drawBrushCursor(ctx, g, hover);
    const sp = hover ? ctx.engine.clonePoint(hover) : ctx.engine.cloneSource;
    if (!sp) return;
    const s = ctx.view().toScreen(sp), pal = ctx.paint();
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = pal.antsA;
    g.beginPath(); g.moveTo(s.x - 7, s.y); g.lineTo(s.x + 7, s.y); g.moveTo(s.x, s.y - 7); g.lineTo(s.x, s.y + 7); g.stroke();
    g.strokeStyle = pal.antsB;
    g.beginPath(); g.arc(s.x, s.y, 4, 0, Math.PI * 2); g.stroke();
    g.restore();
  },
  options: (e) => [
    { kind: 'title', text: 'Clone Stamp' },
    { kind: 'toggle', label: 'Aligned', get: () => e.retouch.cloneAligned, set: (v) => { e.retouch.cloneAligned = v; e.cloneOffset = null; e.emit('options', null); } },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.retouch.cloneSampleAll, set: (v) => { e.retouch.cloneSampleAll = v; e.emit('options', null); } },
    ...brushOptions(e),
  ],
};

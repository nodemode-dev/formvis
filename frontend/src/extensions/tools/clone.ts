import { mul, setMat, type Pt } from '../../engine';
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
    const e = ctx.engine, v = ctx.view(), ov = e.cloneOverlay;
    // The overlay (Show Overlay): clipped to the brush it previews what a click would stamp; unclipped it lays the whole
    // source where a stroke would copy it. Option (picking a source) hides it, and Auto Hide does while painting.
    if (hover && !picking && ov.show && !(ov.autoHide && e.stroking)) {
      if (ov.clipped) {
        const pv = e.clonePreview(hover, v.zoom * (window.devicePixelRatio || 1));
        if (pv) {
          const c = v.toScreen(hover), size = e.brush.diameter * v.zoom;
          g.save();
          g.globalAlpha = e.brush.opacity * ov.opacity;
          g.drawImage(pv, c.x - size / 2, c.y - size / 2, size, size);
          g.restore();
        }
      } else {
        const full = e.cloneOverlayImage(hover);
        if (full) {
          const o = v.toScreen({ x: 0, y: 0 }), ex = v.toScreen({ x: 1, y: 0 }), ey = v.toScreen({ x: 0, y: 1 }), t = g.getTransform();
          g.save();
          g.globalAlpha = ov.opacity;
          setMat(g, mul(mul([t.a, t.b, t.c, t.d, t.e, t.f], [ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y]), full.m));
          g.drawImage(full.image, 0, 0);
          g.restore();
        }
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
    { kind: 'segment', label: 'Source', choices: [0, 1, 2, 3, 4].map((i) => ({ id: String(i), label: String(i + 1) })), get: () => String(e.cloneSlot), set: (v: string) => e.selectCloneSlot(Number(v)) },
    { kind: 'toggle', label: 'Aligned', get: () => e.retouch.cloneAligned, set: (v) => { e.retouch.cloneAligned = v; e.cloneOffset = null; e.emit('options', null); } },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.retouch.cloneSampleAll, set: (v) => { e.retouch.cloneSampleAll = v; e.emit('options', null); } },
    { kind: 'range', label: 'Source scale', min: 1, max: 1000, unit: '%', get: () => e.retouch.cloneScale, set: (v) => { e.retouch.cloneScale = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'range', label: 'Source angle', min: -180, max: 180, unit: '\u00b0', get: () => e.retouch.cloneAngle, set: (v) => { e.retouch.cloneAngle = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'toggle', label: 'Flip horizontal', get: () => e.retouch.cloneFlipH, set: (v) => { e.retouch.cloneFlipH = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'toggle', label: 'Flip vertical', get: () => e.retouch.cloneFlipV, set: (v) => { e.retouch.cloneFlipV = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'button', label: 'Reset Transform', run: () => e.resetCloneTransform() },
    { kind: 'toggle', label: 'Show Overlay', get: () => e.cloneOverlay.show, set: (v) => { e.cloneOverlay.show = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'toggle', label: 'Clipped', get: () => e.cloneOverlay.clipped, set: (v) => { e.cloneOverlay.clipped = v; e.emit('options', null); e.emit('overlay', null); }, when: () => e.cloneOverlay.show },
    { kind: 'range', label: 'Overlay opacity', min: 0, max: 100, unit: '%', get: () => Math.round(e.cloneOverlay.opacity * 100), set: (v) => { e.cloneOverlay.opacity = v / 100; e.emit('options', null); e.emit('overlay', null); }, when: () => e.cloneOverlay.show },
    { kind: 'toggle', label: 'Auto Hide', get: () => e.cloneOverlay.autoHide, set: (v) => { e.cloneOverlay.autoHide = v; e.emit('options', null); e.emit('overlay', null); }, when: () => e.cloneOverlay.show },
    ...brushOptions(e),
  ],
};

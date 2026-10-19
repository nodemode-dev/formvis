import { BLEND_MODES, canvasBlend } from '../../engine';
import { mul, setMat, type Pt } from '../../engine';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;
let picking = false;
const OVERLAY_MODES = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['lighten', 'Lighten'], ['darken', 'Darken'], ['difference', 'Difference']].map(([id, label]) => ({ id, label }));

export const cloneTool: Tool = {
  id: 'cloneStamp', label: 'Clone Stamp', key: 'S', order: 60,
  icon: () => 'tStamp',
  hint: () => 'Alt-click sets the source, then paint to copy from it · Aligned keeps the offset between strokes · Sample All Layers copies what you see · [ ] size',
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    if (p.alt) { ctx.engine.setCloneSource(p.doc); return; }
    hover = p.doc;
    ctx.engine.beginRetouchStroke('clone', p.doc, p.shift, p.pressure);
  },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc, p.pressure, p.pose); ctx.engine.emit('overlay', null); },
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
        const pv = e.cloneOverlayBlended(hover, v.zoom * (window.devicePixelRatio || 1));
        if (pv) {
          const c = v.toScreen(hover), size = e.brush.diameter * v.zoom;
          g.save();
          g.globalAlpha = e.brush.opacity * ov.opacity;
          if (ov.invert) g.filter = 'invert(1)';
          g.drawImage(pv, c.x - size / 2, c.y - size / 2, size, size);
          g.restore();
        }
      } else {
        const full = e.cloneOverlayImage(hover);
        if (full) {
          const o = v.toScreen({ x: 0, y: 0 }), ex = v.toScreen({ x: 1, y: 0 }), ey = v.toScreen({ x: 0, y: 1 }), t = g.getTransform();
          g.save();
          g.globalAlpha = ov.opacity;
          g.globalCompositeOperation = ov.blend;
          if (ov.invert) g.filter = 'invert(1)';
          setMat(g, mul(mul([t.a, t.b, t.c, t.d, t.e, t.f], [ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y]), full.m));
          g.drawImage(full.image, 0, 0);
          g.restore();
        }
      }
    }
    drawBrushCursor(ctx, g, hover);
    const sp = hover ? e.clonePoint(hover) : e.cloneSource;
    if (!sp) return;
    const pal = ctx.paint(), s = v.toScreen(sp);
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
    { kind: 'segment', label: 'Source', priority: 75, choices: [0, 1, 2, 3, 4].map((i) => ({ id: String(i), label: String(i + 1) })), get: () => String(e.cloneSlot), set: (v: string) => e.selectCloneSlot(Number(v)) },
    { kind: 'toggle', label: 'Aligned', priority: 60, get: () => e.retouch.cloneAligned, set: (v) => { e.retouch.cloneAligned = v; e.cloneOffset = null; e.emit('options', null); } },
    // Mode, Flow and Sample (1.50.6, the tool audit; Sample was an all-layers toggle).
    { kind: 'select', label: 'Mode', priority: 70, choices: BLEND_MODES.filter((m) => canvasBlend(m.id)).map((m) => ({ id: m.id, label: m.label })), get: () => e.retouch.cloneBlend, set: (v: string) => { e.retouch.cloneBlend = v as typeof e.retouch.cloneBlend; e.emit('options', null); } },
    { kind: 'range', label: 'Flow', priority: 85, min: 1, max: 100, unit: '%', get: () => Math.round(e.retouch.cloneFlow * 100), set: (v: number) => { e.retouch.cloneFlow = Math.max(0.01, Math.min(1, v / 100)); e.emit('options', null); } },
    { kind: 'select', label: 'Sample', priority: 60, choices: [{ id: 'current', label: 'Current Layer' }, { id: 'below', label: 'Current & Below' }, { id: 'all', label: 'All Layers' }], get: () => e.retouch.cloneSample, set: (v: string) => { e.retouch.cloneSample = v as typeof e.retouch.cloneSample; e.emit('options', null); } },
    { kind: 'range', label: 'Source scale', priority: 40, min: 1, max: 1000, unit: '%', get: () => e.retouch.cloneScale, set: (v) => { e.retouch.cloneScale = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'range', label: 'Source angle', priority: 35, min: -180, max: 180, unit: '\u00b0', get: () => e.retouch.cloneAngle, set: (v) => { e.retouch.cloneAngle = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'toggle', label: 'Flip horizontal', priority: 25, get: () => e.retouch.cloneFlipH, set: (v) => { e.retouch.cloneFlipH = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'toggle', label: 'Flip vertical', priority: 25, get: () => e.retouch.cloneFlipV, set: (v) => { e.retouch.cloneFlipV = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'button', label: 'Reset Transform', priority: 15, run: () => e.resetCloneTransform() },
    { kind: 'toggle', label: 'Show Overlay', priority: 30, get: () => e.cloneOverlay.show, set: (v) => { e.cloneOverlay.show = v; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'toggle', label: 'Clipped', priority: 20, get: () => e.cloneOverlay.clipped, set: (v) => { e.cloneOverlay.clipped = v; e.emit('options', null); e.emit('overlay', null); }, when: () => e.cloneOverlay.show },
    { kind: 'range', label: 'Overlay opacity', priority: 22, min: 0, max: 100, unit: '%', get: () => Math.round(e.cloneOverlay.opacity * 100), set: (v) => { e.cloneOverlay.opacity = v / 100; e.emit('options', null); e.emit('overlay', null); }, when: () => e.cloneOverlay.show },
    { kind: 'select', label: 'Overlay mode', priority: 17, choices: OVERLAY_MODES, get: () => e.cloneOverlay.blend, set: (v: string) => { e.setCloneOverlay({ blend: v as GlobalCompositeOperation }); }, when: () => e.cloneOverlay.show },
    { kind: 'toggle', label: 'Invert Overlay', priority: 16, get: () => e.cloneOverlay.invert, set: (v) => { e.cloneOverlay.invert = v; e.emit('options', null); e.emit('overlay', null); }, when: () => e.cloneOverlay.show },
    { kind: 'toggle', label: 'Auto Hide', priority: 18, get: () => e.cloneOverlay.autoHide, set: (v) => { e.cloneOverlay.autoHide = v; e.emit('options', null); e.emit('overlay', null); }, when: () => e.cloneOverlay.show },
    ...brushOptions(e)
  ]
};

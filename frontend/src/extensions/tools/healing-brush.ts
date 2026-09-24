import type { Pt } from '../../engine';
import { HEAL_BLENDS, HEAL_SAMPLES, type HealBlend, type HealSample } from '../../engine/retouch';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;
let picking = false;

/** Healing Brush (J, Shift+J cycles): Alt-click a source, then paint; the stroke previews the copied pixels, and on
 *  release they are blended into the painted area's surroundings, texture from the source, tone from around it. */
export const healingBrushTool: Tool = {
  id: 'healingBrush', label: 'Healing Brush', key: 'J', order: 56,
  icon: () => 'healBrushTool',
  hint: () => 'Alt-click to set the source, then paint; on release the copied texture blends into its surroundings · Aligned keeps the offset between strokes · Shift+J cycles the healing tools · [ ] size',
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    if (p.alt) { ctx.engine.setCloneSource(p.doc); return; }
    hover = p.doc;
    ctx.engine.beginRetouchStroke('healBrush', p.doc, p.shift);
  },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; picking = !!p?.alt; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown: (ctx, e) => brushKeys(ctx, e),
  overlay(ctx, g) {
    const e = ctx.engine, v = ctx.view();
    // Between strokes, the circle previews the source texture; Option (picking a source) hides it.
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
    { kind: 'title', text: 'Healing Brush' },
    { kind: 'select', label: 'Mode', choices: HEAL_BLENDS.map((b) => ({ id: b.id, label: b.label })), get: () => e.retouch.healBlendMode, set: (v: string) => { e.retouch.healBlendMode = v as HealBlend; e.emit('options', null); } },
    { kind: 'toggle', label: 'Aligned', get: () => e.retouch.cloneAligned, set: (v) => { e.retouch.cloneAligned = v; e.cloneOffset = null; e.emit('options', null); } },
    { kind: 'select', label: 'Sample', choices: HEAL_SAMPLES.map((b) => ({ id: b.id, label: b.label })), get: () => e.retouch.healSample, set: (v: string) => { e.retouch.healSample = v as HealSample; e.emit('options', null); } },
    { kind: 'number', label: 'Diffusion', min: 1, max: 7, step: 1, get: () => e.retouch.healDiffusion, set: (v: number) => { e.retouch.healDiffusion = Math.round(Math.min(7, Math.max(1, v))); e.emit('options', null); } },
    ...brushOptions(e),
  ],
};

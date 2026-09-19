import type { Pt } from '../../engine';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;
const HINTS = {
  liquify: 'Drag to push pixels along with the brush, most at its center · Strength sets how far they move',
  blur: 'Paint to soften; a new stroke over the same area softens it further · The blur follows the brush size',
  smudge: 'Drag to smear color along the stroke · Strength sets how far the color carries',
};

export const smearTool: Tool = {
  id: 'smear', label: 'Smear', key: 'R', order: 65,
  icon: (e) => (e.retouch.smearMode === 'blur' ? 'blurTool' : 'smudge'),
  hint: (e) => `${HINTS[e.retouch.smearMode]} · [ ] size`,
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    const m = ctx.engine.retouch.smearMode;
    if (m === 'blur') ctx.engine.beginRetouchStroke('blur', p.doc, p.shift);
    else ctx.engine.beginWarp(m, p.doc);
  },
  move(ctx, p) {
    hover = p.doc;
    if (ctx.engine.warping) ctx.engine.warpTo(p.doc);
    else ctx.engine.strokeTo(p.doc);
    ctx.engine.emit('overlay', null);
  },
  up(ctx) { if (ctx.engine.warping) ctx.engine.endWarp(); else ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { if (ctx.engine.warping) ctx.engine.cancelWarp(); else ctx.engine.cancelStroke(); },
  keydown(ctx, e) {
    if (e.key === 'Escape' && ctx.engine.warping) { ctx.engine.cancelWarp(); return true; }
    return brushKeys(ctx, e);
  },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e) => [
    { kind: 'title', text: 'Smear' },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'liquify', label: 'Liquify' }, { id: 'blur', label: 'Blur' }, { id: 'smudge', label: 'Smudge' }], get: () => e.retouch.smearMode, set: (v) => { e.retouch.smearMode = v as 'blur' | 'smudge' | 'liquify'; e.emit('options', null); e.emit('tool', null); } },
    ...brushOptions(e, 'Strength'),
  ],
};

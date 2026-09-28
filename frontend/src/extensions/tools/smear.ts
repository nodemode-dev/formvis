import type { Pt } from '../../engine';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

/** The modes as Photoshop names them, each with its own icon in the toolbar and its flyout. */
const SMEAR_ICONS: Record<string, string> = { blur: 'tBlur', sharpen: 'tSharpen', smudge: 'tSmudge', liquify: 'tLiquify' };
const SMEAR_NAMES = { blur: 'Blur', sharpen: 'Sharpen', smudge: 'Smudge', liquify: 'Liquify Brush' } as const;

let hover: Pt | null = null;
const HINTS = {
  liquify: 'Drag to push pixels along with the brush, most at its center · Strength sets how far they move',
  blur: 'Paint to soften; a new stroke over the same area softens it further · The blur follows the brush size',
  sharpen: 'Paint to crisp up edges; a new stroke over the same area sharpens it further · Lower Strength for subtle work',
  smudge: 'Drag to smear color along the stroke · Strength sets how far the color carries',
};

export const smearTool: Tool = {
  id: 'smear', label: 'Smear', key: '', order: 65,   // no shortcut, as Photoshop's Blur, Sharpen and Smudge; R is Rotate View's
  icon: (e) => SMEAR_ICONS[e.retouch.smearMode] ?? 'tSmudge',
  variants: (e) => (['blur', 'sharpen', 'smudge', 'liquify'] as const).map((m) => ({ id: m, label: SMEAR_NAMES[m], icon: SMEAR_ICONS[m], active: () => e.retouch.smearMode === m, pick: () => { e.retouch.smearMode = m; e.emit('options', null); } })),
  hint: (e) => `${HINTS[e.retouch.smearMode]} · [ ] size`,
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    const m = ctx.engine.retouch.smearMode;
    if (m === 'blur' || m === 'sharpen') ctx.engine.beginRetouchStroke(m, p.doc, p.shift);
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
    { kind: 'segment', label: 'Mode', choices: [{ id: 'liquify', label: 'Liquify' }, { id: 'blur', label: 'Blur' }, { id: 'sharpen', label: 'Sharpen' }, { id: 'smudge', label: 'Smudge' }], get: () => e.retouch.smearMode, set: (v) => { e.retouch.smearMode = v as 'blur' | 'sharpen' | 'smudge' | 'liquify'; e.emit('options', null); e.emit('tool', null); } },
    ...brushOptions(e, 'Strength'),
  ],
};

import { BLEND_MODES } from '../../engine';
import type { Pt } from '../../engine';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

/** The modes by their usual names, each with its own icon in the toolbar and its flyout. */
const SMEAR_ICONS: Record<string, string> = { blur: 'tBlur', sharpen: 'tSharpen', smudge: 'tSmudge', liquify: 'tLiquify' };
const SMEAR_NAMES = { blur: 'Blur', sharpen: 'Sharpen', smudge: 'Smudge', liquify: 'Liquify Brush' } as const;

let hover: Pt | null = null;
const HINTS: Record<string, string> = {
  liquify: 'Drag to push pixels along with the brush, most at its centre · Strength sets how far they move',
  blur: 'Paint to soften; another stroke over the same place softens more · Radius 0 makes the blur follow the brush size',
  sharpen: 'Paint to crisp up edges; a new stroke over the same area sharpens it further · Lower Strength for subtle work',
  smudge: 'Drag to smear colour along the stroke · Strength sets how far the colour carries',
};

export const smearTool: Tool = {
  id: 'smear', label: 'Smear', key: '', order: 65,   // no shortcut for Blur, Sharpen and Smudge; R is Rotate View's
  icon: (e) => SMEAR_ICONS[e.retouch.smearMode] ?? 'tSmudge',
  variants: (e) => (['blur', 'sharpen', 'smudge', 'liquify'] as const).map((m) => ({ id: m, label: SMEAR_NAMES[m], icon: SMEAR_ICONS[m], active: () => e.retouch.smearMode === m, pick: () => { e.retouch.smearMode = m; e.emit('options', null); } })),
  hint: (e) => (HINTS[e.retouch.smearMode] ?? '') + ' · [ ] size',
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
    if (ctx.engine.warping) ctx.engine.warpTo(p.doc, p.pressure);
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
    { kind: 'segment', label: 'Tool', priority: 80, choices: [{ id: 'liquify', label: 'Liquify' }, { id: 'blur', label: 'Blur' }, { id: 'sharpen', label: 'Sharpen' }, { id: 'smudge', label: 'Smudge' }], get: () => e.retouch.smearMode, set: (v) => { e.retouch.smearMode = v as 'blur' | 'sharpen' | 'smudge' | 'liquify'; e.emit('options', null); e.emit('tool', null); } },
    // The options for each (1.51.4, the tool audit): Blur and Sharpen's Mode (the blend of what they paint) and
    // Sample All Layers; Sharpen's Protect Detail; Smudge's Sample All Layers and Finger Painting. (The tool choice was
    // labelled Mode; Mode is the blend.)
    ...(e.retouch.smearMode === 'blur' || e.retouch.smearMode === 'sharpen'
      ? [{ kind: 'select' as const, label: 'Mode', priority: 70, choices: (['normal', 'darken', 'lighten', 'hue', 'saturation', 'color', 'luminosity'] as const).map((id) => ({ id, label: BLEND_MODES.find((m) => m.id === id)?.label ?? id })), get: () => e.retouch.smearBlend, set: (v: string) => { e.retouch.smearBlend = v as typeof e.retouch.smearBlend; e.emit('options', null); } }]
      : []),
    ...(e.retouch.smearMode !== 'liquify'
      ? [{ kind: 'toggle' as const, label: 'Sample All Layers', priority: 20, get: () => e.retouch.smearSampleAll, set: (v: boolean) => { e.retouch.smearSampleAll = v; e.emit('options', null); } }]
      : []),
    ...(e.retouch.smearMode === 'blur' ? [{ kind: 'number' as const, label: 'Radius', priority: 45, min: 0, max: 60, step: 1, get: () => e.retouch.blurRadius, set: (v: number) => { e.retouch.blurRadius = Math.round(Math.min(60, Math.max(0, v))); e.emit('options', null); } }] : []),
    ...(e.retouch.smearMode === 'sharpen' ? [{ kind: 'toggle' as const, label: 'Protect Detail', priority: 40, get: () => e.retouch.protectDetail, set: (v: boolean) => { e.retouch.protectDetail = v; e.emit('options', null); } }] : []),
    ...(e.retouch.smearMode === 'smudge' ? [{ kind: 'toggle' as const, label: 'Finger Painting', priority: 40, get: () => e.retouch.fingerPainting, set: (v: boolean) => { e.retouch.fingerPainting = v; e.emit('options', null); } }] : []),
    ...brushOptions(e, 'Strength')
  ]
};

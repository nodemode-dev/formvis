import type { HealMode, Pt } from '../../engine';
import { HEAL_BLENDS, type HealBlend } from '../../engine/retouch';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

export const healTool: Tool = {
  id: 'spotHealing', label: 'Spot Healing', key: 'J', order: 55,
  icon: () => 'tSpotHeal',
  hint: () => 'Paint over a spot and it heals on release · Content-Aware copies a matching patch nearby · Create Texture fills smoothly with matching grain · Proximity Match prefers the nearest patch · [ ] size',
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    ctx.engine.beginRetouchStroke('heal', p.doc, p.shift);
  },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown: (ctx, e) => brushKeys(ctx, e),
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e) => [
    { kind: 'title', text: 'Spot Healing' },
    { kind: 'select', label: 'Mode', choices: HEAL_BLENDS.map((b) => ({ id: b.id, label: b.label })), get: () => e.retouch.spotBlendMode, set: (v: string) => { e.retouch.spotBlendMode = v as HealBlend; e.emit('options', null); } },
    { kind: 'segment', label: 'Type', choices: [{ id: 'contentAware', label: 'Content-Aware' }, { id: 'createTexture', label: 'Create Texture' }, { id: 'proximityMatch', label: 'Proximity Match' }], get: () => e.retouch.healMode, set: (id) => { e.retouch.healMode = id as HealMode; e.emit('options', null); } },
    { kind: 'toggle', label: 'Sample All Layers', get: () => e.retouch.spotSampleAll, set: (v) => { e.retouch.spotSampleAll = v; e.emit('options', null); } },
    ...brushOptions(e)
  ]
};

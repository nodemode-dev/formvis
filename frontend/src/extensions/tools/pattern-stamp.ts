import { allPatterns, type Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** The Pattern Stamp (S, the owner's tool list): paints the chosen pattern, tiled across the document
 *  so strokes line up, with the brush's size, hardness and opacity; each stroke is one step. */
export const patternStampTool: Tool = {
  id: 'patternStamp', label: 'Pattern Stamp', key: 'S', order: 60.5,
  icon: () => 'tPatternStamp',
  hint: () => 'Drag to paint the pattern · Choose it in the options bar · [ ] size · Shift+[ ] hardness',
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginRetouchStroke('patternStamp', p.doc, p.shift, p.pressure); },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc, p.pressure, p.pose); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e): OptionSpec[] => {
    const pats = allPatterns();
    return [
      { kind: 'title', text: 'Pattern Stamp' },
      { kind: 'select', label: 'Pattern', priority: 70, choices: pats.map((x) => ({ id: x.id, label: x.name })), get: () => e.patternStampPattern ?? pats[0]?.id ?? '', set: (v: string) => { e.patternStampPattern = v; e.emit('options', null); } },
      { kind: 'toggle', label: 'Aligned', priority: 60, get: () => e.patternStampLook.aligned, set: (v: boolean) => { e.patternStampLook.aligned = v; e.emit('options', null); } },
      { kind: 'number', label: 'Scale', priority: 50, min: 10, max: 1000, step: 10, get: () => e.patternStampLook.scale, set: (v: number) => { e.patternStampLook.scale = Math.round(Math.min(1000, Math.max(10, v))); e.emit('options', null); } },
      { kind: 'number', label: 'Angle', priority: 45, min: -180, max: 180, step: 5, get: () => e.patternStampLook.angle, set: (v: number) => { e.patternStampLook.angle = Math.round(Math.min(180, Math.max(-180, v))); e.emit('options', null); } },
      ...brushOptions(e, 'Opacity'),
    ];
  },
};

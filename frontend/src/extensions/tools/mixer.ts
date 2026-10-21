import type { Engine, Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** The Mixer Brush (B, with the Brush and Pencil; 1.56.2, the parity plan's L4): a wet brush that
 *  picks up the paint under it and mixes it with what it carries (engine/mixer.ts). Wet, Load and Mix in the options
 *  bar, with the two after-each-stroke refills and Sample All Layers; the Brush's size, hardness, opacity and flow. */
export const mixerTool: Tool = {
  id: 'mixer', label: 'Mixer Brush', key: 'B', order: 50.7,
  icon: () => 'tBrush',
  hint: () => 'Drag to paint with wet paint that picks up and mixes the colors under it · [ ] size · Alt-click loads the reservoir from the canvas',
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    if (p.alt) { const c = ctx.engine.sampleColor(p.doc); if (c) ctx.engine.setColors(c, ctx.engine.bg); return; }
    ctx.engine.brushMode = 'paint';
    ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose);
  },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc, p.pressure, p.pose); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e: Engine): OptionSpec[] => [
    { kind: 'title', text: 'Mixer Brush' },
    { kind: 'range', label: 'Wet', priority: 75, min: 0, max: 100, unit: '%', get: () => e.mixer.wet, set: (v) => { e.mixer = { ...e.mixer, wet: v }; } },
    { kind: 'range', label: 'Load', priority: 65, min: 1, max: 100, unit: '%', get: () => e.mixer.load, set: (v) => { e.mixer = { ...e.mixer, load: v }; } },
    { kind: 'range', label: 'Mix', priority: 70, min: 0, max: 100, unit: '%', get: () => e.mixer.mix, set: (v) => { e.mixer = { ...e.mixer, mix: v }; } },
    { kind: 'range', label: 'Flow', priority: 60, min: 1, max: 100, unit: '%', get: () => Math.round(e.brushFlow * 100), set: (v: number) => { e.brushFlow = Math.max(0.01, Math.min(1, v / 100)); e.emit('options', null); } },
    { kind: 'toggle', label: 'Load the brush after each stroke', priority: 25, get: () => e.mixer.loadEach, set: (v) => { e.mixer = { ...e.mixer, loadEach: v }; } },
    { kind: 'toggle', label: 'Clean the brush after each stroke', priority: 25, get: () => e.mixer.cleanEach, set: (v) => { e.mixer = { ...e.mixer, cleanEach: v }; } },
    { kind: 'toggle', label: 'Sample All Layers', priority: 20, get: () => e.mixer.sampleAll, set: (v) => { e.mixer = { ...e.mixer, sampleAll: v }; } },
    ...brushOptions(e, 'Opacity'),
  ],
};

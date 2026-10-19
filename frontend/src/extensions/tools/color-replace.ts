import type { Engine, Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** The Color Replacement tool (B, with the Brush, Pencil and Mixer Brush): paint over a colour to swap it for the
 *  foreground. The colour under the first touch (or the background swatch) is the one replaced, within Tolerance; Mode
 *  chooses how much of the foreground is taken (Color keeps the pixel's lightness). One step per stroke. */
export const colorReplaceTool: Tool = {
  id: 'colorReplace', label: 'Color Replacement', key: 'B', order: 50.8,
  icon: () => 'tBrush',
  hint: () => 'Drag over a colour to replace it with the foreground color · Tolerance sets how far from it colours match · [ ] size',
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginRetouchStroke('colorReplace', p.doc, p.shift, p.pressure); },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc, p.pressure, p.pose); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e: Engine): OptionSpec[] => [
    { kind: 'title', text: 'Color Replacement' },
    { kind: 'select', label: 'Mode', priority: 80, choices: [{ id: 'color', label: 'Color' }, { id: 'hue', label: 'Hue' }, { id: 'saturation', label: 'Saturation' }, { id: 'luminosity', label: 'Luminosity' }], get: () => e.retouch.replaceMode, set: (v: string) => { e.retouch.replaceMode = v === 'hue' || v === 'saturation' || v === 'luminosity' ? v : 'color'; e.emit('options', null); } },
    { kind: 'segment', label: 'Sampling', priority: 70, choices: [{ id: 'once', label: 'Once' }, { id: 'swatch', label: 'Background Swatch' }], get: () => e.retouch.replaceSampling, set: (v: string) => { e.retouch.replaceSampling = v === 'swatch' ? 'swatch' : 'once'; e.emit('options', null); } },
    { kind: 'range', label: 'Tolerance', priority: 75, min: 1, max: 100, unit: '%', get: () => e.retouch.replaceTolerance, set: (v: number) => { e.retouch.replaceTolerance = Math.round(Math.min(100, Math.max(1, v))); e.emit('options', null); } },
    ...brushOptions(e, 'Opacity'),
  ],
};

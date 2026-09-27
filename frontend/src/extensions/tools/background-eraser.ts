import type { BgEraseOpts, Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;
const opts: BgEraseOpts = { tolerance: 50, sampling: 'continuous', contiguous: true, protectForeground: false };

/** The Background Eraser (E), as Photoshop's (the owner's tool list): erases the colour under the brush's centre,
 *  within Tolerance, leaving other colours; Sampling continuous or once, Limits contiguous or not, Protect Foreground
 *  Color; the brush's size and hardness. The stroke is one step. */
export const backgroundEraserTool: Tool = {
  id: 'backgroundEraser', label: 'Background Eraser', key: 'E', order: 62.1,
  icon: () => 'tBgEraser',
  hint: () => 'Drag with the centre over the colour to erase · Tolerance widens it · Protect Foreground keeps the foreground colour',
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginBackgroundErase(p.doc, { ...opts }); },
  move(ctx, p) { hover = p.doc; ctx.engine.backgroundEraseTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endBackgroundErase(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.endBackgroundErase(true); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Background Eraser' },
    ...brushOptions(e, 'Opacity').filter((o) => !('label' in o) || o.label !== 'Opacity'),
    { kind: 'segment', label: 'Sampling', choices: [{ id: 'continuous', label: 'Continuous' }, { id: 'once', label: 'Once' }], get: () => opts.sampling, set: (v) => { opts.sampling = v as 'continuous' | 'once'; e.emit('options', null); } },
    { kind: 'segment', label: 'Limits', choices: [{ id: 'contiguous', label: 'Contiguous' }, { id: 'discontiguous', label: 'Discontiguous' }], get: () => (opts.contiguous ? 'contiguous' : 'discontiguous'), set: (v) => { opts.contiguous = v === 'contiguous'; e.emit('options', null); } },
    { kind: 'range', label: 'Tolerance', min: 0, max: 255, get: () => opts.tolerance, set: (v: number) => { opts.tolerance = Math.max(0, Math.min(255, Math.round(v))); e.emit('options', null); } },
    { kind: 'toggle', label: 'Protect Foreground Color', get: () => opts.protectForeground, set: (v) => { opts.protectForeground = v; e.emit('options', null); } },
  ],
};

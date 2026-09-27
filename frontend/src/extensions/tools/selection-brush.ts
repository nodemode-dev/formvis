import type { Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** The Selection Brush (W), as Photoshop's (the owner's tool list): paint to add to the selection, Alt to take away,
 *  with the Brush's size and hardness (a soft brush paints a soft edge); the area not selected shows tinted while
 *  painting, marching ants after. Each stroke is one step. */
export const selectionBrushTool: Tool = {
  id: 'selectionBrush', label: 'Selection Brush', key: 'W', order: 41,
  icon: () => 'tSelBrush',
  hint: () => 'Paint to add to the selection · Alt-paint to take away · [ ] size · Shift+[ ] hardness',
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginSelectionBrushStroke(p.doc, p.alt, p.pressure, p.pose); },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc, p.pressure, p.pose); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e): OptionSpec[] => [{ kind: 'title', text: 'Selection Brush' }, ...brushOptions(e, 'Opacity').filter((o) => !('label' in o) || o.label !== 'Opacity')],
};

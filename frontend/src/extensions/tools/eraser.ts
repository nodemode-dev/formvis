import type { Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null, mode: 'brush' | 'pencil' = 'brush', before: 'paint' | 'erase' = 'paint';

/** The Eraser (E), its own tool as Photoshop's (the owner's tool list; it was a mode of the Brush): erases with the
 *  brush's size, hardness and opacity, or hard-edged in Pencil mode; the Brush's own mode is left as it was. */
export const eraserTool: Tool = {
  id: 'eraser', label: 'Eraser', key: 'E', order: 62,
  icon: () => 'tEraser',
  hint: () => 'Drag to erase · Shift-click erases a line from the last point · [ ] size · Shift+[ ] hardness',
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    before = ctx.engine.brushMode;
    ctx.engine.setBrushMode('erase');
    if (!ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose, { aliased: mode === 'pencil', name: 'Eraser' })) ctx.engine.setBrushMode(before);
  },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc, p.pressure, p.pose); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); ctx.engine.setBrushMode(before); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); ctx.engine.setBrushMode(before); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Eraser' },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'brush', label: 'Brush' }, { id: 'pencil', label: 'Pencil' }], get: () => mode, set: (v) => { mode = v as 'brush' | 'pencil'; e.emit('options', null); } },
    ...brushOptions(e, 'Opacity'),
  ],
};

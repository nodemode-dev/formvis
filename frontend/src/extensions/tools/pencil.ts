import type { Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';
import { holdEnd, holdMove, holdStart, quickShapeOption, quickShapeSnapped } from './quick-shape';

let hover: Pt | null = null, autoErase = false;

/** The Pencil (B), as Photoshop's (the owner's tool list): hard pixel-exact strokes, every pixel painted fully or not
 *  at all, at the brush's size and opacity; Auto Erase paints the background colour when a stroke starts on the
 *  foreground colour. */
export const pencilTool: Tool = {
  id: 'pencil', label: 'Pencil', key: 'B', order: 50.5,
  icon: () => 'tPencil',
  hint: () => 'Drag to draw hard-edged, pixel-exact lines · Shift-click draws a line from the last point · [ ] size',
  cursor: () => 'none',
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    ctx.engine.setBrushMode('paint');
    if (ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose, { aliased: true, autoErase, name: 'Pencil' })) holdStart(p.doc);
  },
  move(ctx, p) {
    hover = p.doc;
    if (!quickShapeSnapped()) {
      ctx.engine.strokeTo(p.doc, p.pressure, p.pose);
      holdMove(ctx, p, (pt, pr, pose) => ctx.engine.beginStroke(pt, false, pr, pose, { aliased: true, autoErase, name: 'Pencil' }));
    }
    ctx.engine.emit('overlay', null);
  },
  up(ctx) { holdEnd(); ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { holdEnd(); ctx.engine.cancelStroke(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Pencil' },
    ...brushOptions(e, 'Opacity').filter((o) => !('label' in o) || o.label !== 'Hardness'),
    { kind: 'toggle', label: 'Auto Erase', get: () => autoErase, set: (v) => { autoErase = v; e.emit('options', null); } },
    quickShapeOption(e),
  ],
};

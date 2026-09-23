import type { Pt } from '../../engine';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** Remove (J, with the healing tools): paint over something to take it out; on release what the stroke covered is
 *  rebuilt by content-aware fill from the rest of the layer. Remove Wires and Cables finds thin dark lines on the layer
 *  by itself and fills them. Photoshop's Remove uses generative fill for large objects and also finds people; neither
 *  is here. */
export const removeTool: Tool = {
  id: 'remove', label: 'Remove', key: 'J', order: 54,
  icon: () => 'eraser',
  hint: () => 'Paint over what to remove; it is filled from its surroundings when you release · [ ] size',
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginRetouchStroke('remove', p.doc, p.shift); },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown: (ctx, e) => brushKeys(ctx, e),
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e) => [
    { kind: 'title', text: 'Remove' },
    ...brushOptions(e),
    { kind: 'button', label: 'Remove Wires and Cables', icon: 'sparkle', run: () => { e.removeWires(); } },
  ],
};

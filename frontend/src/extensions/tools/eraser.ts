import type { Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';
import { holdEnd, holdMove, holdStart, quickShapeOption, quickShapeSnapped } from './quick-shape';

let hover: Pt | null = null, mode: 'brush' | 'pencil' | 'block' = 'brush', before: 'paint' | 'erase' = 'paint';
let toHistory = false, history = false, kept: { diameter: number; opacity: number } | null = null;

/** The Eraser (E), its own tool as Photoshop's (the owner's tool list; it was a mode of the Brush): erases with the
 *  brush's size, hardness and opacity, or hard-edged in Pencil mode; the Brush's own mode is left as it was. */
export const eraserTool: Tool = {
  id: 'eraser', label: 'Eraser', key: 'E', order: 62,
  icon: () => 'tEraser',
  hint: () => 'Drag to erase · Shift-click erases a line from the last point · [ ] size · Shift+[ ] hardness',
  cursor: () => 'none',
  // Photoshop's Eraser (1.50.3, the tool audit): Brush, Pencil or Block (a fixed 16-pixel square at full strength), and
  // Erase to History (erasing back to the chosen history state, as the History Brush paints).
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    const e = ctx.engine;
    if (toHistory) { history = e.beginRetouchStroke('historyBrush', p.doc, p.shift); return; }
    before = e.brushMode;
    e.setBrushMode('erase');
    if (mode === 'block') { kept = { diameter: e.brush.diameter, opacity: e.brush.opacity }; e.setBrush({ diameter: 16 / ctx.view().zoom, opacity: 1 }); }
    if (!e.beginStroke(p.doc, p.shift, p.pressure, p.pose, { aliased: mode === 'pencil', square: mode === 'block', name: 'Eraser' })) finish(e);
    else holdStart(p.doc, mode !== 'block');
  },
  move(ctx, p) {
    hover = p.doc;
    if (!quickShapeSnapped()) {
      ctx.engine.strokeTo(p.doc, p.pressure, p.pose);
      if (!history) holdMove(ctx, p, (pt, pr, pose) => ctx.engine.beginStroke(pt, false, pr, pose, { aliased: mode === 'pencil', square: false, name: 'Eraser' }));
    }
    ctx.engine.emit('overlay', null);
  },
  up(ctx) { holdEnd(); ctx.engine.endStroke(); if (history) history = false; else finish(ctx.engine); },
  cancel(ctx) { holdEnd(); ctx.engine.cancelStroke(); if (history) history = false; else finish(ctx.engine); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Eraser' },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'brush', label: 'Brush' }, { id: 'pencil', label: 'Pencil' }, { id: 'block', label: 'Block' }], get: () => mode, set: (v) => { mode = v as 'brush' | 'pencil' | 'block'; e.emit('options', null); } },
    ...brushOptions(e, 'Opacity'),
    { kind: 'range', label: 'Flow', min: 1, max: 100, unit: '%', get: () => Math.round(e.brushFlow * 100), set: (v: number) => { e.brushFlow = Math.max(0.01, Math.min(1, v / 100)); e.emit('options', null); } },
    { kind: 'toggle', label: 'Erase to History', get: () => toHistory, set: (v) => { toHistory = v; e.emit('options', null); } },
    quickShapeOption(e),
  ],
};

function finish(e: { setBrushMode(m: 'paint' | 'erase'): void; setBrush(b: { diameter?: number; opacity?: number }): void }): void {
  e.setBrushMode(before);
  if (kept) { e.setBrush(kept); kept = null; }
}

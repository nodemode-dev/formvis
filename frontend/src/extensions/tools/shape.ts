import { hexOf, type Pt } from '../../engine';
import { dashed, type Tool } from '../registry';
import { dragRect } from './marquee';

let draft: { anchor: Pt; point: Pt; shiftAtPress: boolean; altAtPress: boolean; square: boolean; center: boolean } | null = null;

export const shapeTool: Tool = {
  id: 'shape', label: 'Shape', key: 'U', order: 75,
  icon: (e) => (e.shapeSettings.kind === 'ellipse' ? 'circleTool' : 'rectTool'),
  hint: (e) => `Drag to draw ${e.shapeSettings.kind === 'ellipse' ? 'an ellipse' : 'a rectangle'} in the foreground color on a new shape layer · Shift after starting keeps it square · Alt after starting grows from the center · Shift+U switches shape`,
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    draft = { anchor: p.doc, point: p.doc, shiftAtPress: p.shift, altAtPress: p.alt, square: false, center: false };
  },
  move(ctx, p) {
    if (!draft) return;
    draft.point = p.doc;
    draft.square = p.shift && !draft.shiftAtPress;
    draft.center = p.alt && !draft.altAtPress;
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    const d = draft;
    draft = null;
    ctx.engine.emit('overlay', null);
    if (!d) return;
    const r = dragRect(d.anchor, d.point, d.square, d.center);
    if (r.w >= 1 && r.h >= 1) ctx.engine.createShape(r);
  },
  keydown(ctx, e) {
    if (!(e.shiftKey && e.code === 'KeyU' && !e.metaKey && !e.ctrlKey && !e.altKey)) return false;
    ctx.engine.shapeSettings.kind = ctx.engine.shapeSettings.kind === 'ellipse' ? 'rectangle' : 'ellipse';
    ctx.engine.emit('options', null);
    ctx.engine.emit('tool', null);
    return true;
  },
  cancel(ctx) { draft = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    if (!draft) return;
    const r = dragRect(draft.anchor, draft.point, draft.square, draft.center), v = ctx.view();
    const a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
    const ellipse = ctx.engine.shapeSettings.kind === 'ellipse';
    const radius = Math.min(ctx.engine.shapeSettings.cornerRadius * v.zoom, (b.x - a.x) / 2, (b.y - a.y) / 2);
    dashed(ctx, g, () => {
      if (ellipse) g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else g.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, Math.max(0, radius));
    });
  },
  options: (e) => [
    { kind: 'title', text: 'Shape' },
    { kind: 'segment', label: 'Shape', choices: [{ id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }], get: () => e.shapeSettings.kind, set: (v) => { e.shapeSettings.kind = v as 'rectangle' | 'ellipse'; e.emit('options', null); e.emit('tool', null); } },
    { kind: 'range', label: 'Corner radius', min: 0, max: 500, unit: 'px', get: () => e.shapeSettings.cornerRadius, set: (v) => { e.shapeSettings.cornerRadius = v; e.emit('options', null); } },
    { kind: 'readout', label: 'Color', get: () => hexOf(e.fg) },
  ],
};

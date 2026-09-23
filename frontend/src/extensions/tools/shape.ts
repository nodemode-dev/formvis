import { CUSTOM_SHAPES, hexOf, type Pt } from '../../engine';
import { boxedShapePath, linePath } from '../../engine/shape-paths';
import { dashed, type Tool } from '../registry';
import { dragRect } from './marquee';

let draft: { anchor: Pt; point: Pt; shiftAtPress: boolean; altAtPress: boolean; square: boolean; center: boolean } | null = null;

const NOUN: Record<string, string> = { rectangle: 'a rectangle', ellipse: 'an ellipse', polygon: 'a polygon', star: 'a star', heart: 'a heart', line: 'a line', arrow: 'an arrow', custom: 'a custom shape' };
const KINDS = ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'heart', 'custom'] as const;
const lineLike = (k: string): boolean => k === 'line' || k === 'arrow';

export const shapeTool: Tool = {
  id: 'shape', label: 'Shape', key: 'U', order: 75,
  icon: (e) => (e.shapeSettings.kind === 'ellipse' || e.shapeSettings.kind === 'heart' ? 'circleTool' : 'rectTool'),
  hint: (e) => lineLike(e.shapeSettings.kind)
    ? `Drag to draw ${NOUN[e.shapeSettings.kind]} in the foreground color on a new shape layer · Shift after starting snaps to 45 degrees · Shift+U switches shape`
    : `Drag to draw ${NOUN[e.shapeSettings.kind]} in the foreground color on a new shape layer · Shift after starting keeps it square · Alt after starting grows from the center · Shift+U switches shape`,
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
    const kind = ctx.engine.shapeSettings.kind;
    if (lineLike(kind)) { ctx.engine.createPathShape(d.anchor, snapped(d)); return; }
    const r = dragRect(d.anchor, d.point, d.square, d.center);
    if (kind === 'rectangle' || kind === 'ellipse') { if (r.w >= 1 && r.h >= 1) ctx.engine.createShape(r); }
    else ctx.engine.createPathShape({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
  },
  keydown(ctx, e) {
    if (!(e.shiftKey && e.code === 'KeyU' && !e.metaKey && !e.ctrlKey && !e.altKey)) return false;
    const s = ctx.engine.shapeSettings;
    s.kind = KINDS[(KINDS.indexOf(s.kind) + 1) % KINDS.length];
    ctx.engine.emit('options', null);
    ctx.engine.emit('tool', null);
    return true;
  },
  cancel(ctx) { draft = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    if (!draft) return;
    const r = dragRect(draft.anchor, draft.point, draft.square, draft.center), v = ctx.view(), s = ctx.engine.shapeSettings;
    if (s.kind !== 'rectangle' && s.kind !== 'ellipse') {
      const path = lineLike(s.kind) ? linePath(s.kind as 'line' | 'arrow', draft.anchor, snapped(draft), s) : boxedShapePath(s.kind as 'polygon' | 'star' | 'heart' | 'custom', r, s);
      // Every outline, with its curves, so custom shapes' holes and rounded parts preview as they will be drawn.
      dashed(ctx, g, () => {
        for (const sp of path.subpaths) {
          sp.anchors.forEach((a, i) => {
            const q = v.toScreen(a);
            if (!i) { g.moveTo(q.x, q.y); return; }
            const prev = sp.anchors[i - 1], c1 = v.toScreen({ x: prev.outX, y: prev.outY }), c2 = v.toScreen({ x: a.inX, y: a.inY });
            g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, q.x, q.y);
          });
          if (sp.closed && sp.anchors.length) {
            const last = sp.anchors[sp.anchors.length - 1], first = sp.anchors[0], c1 = v.toScreen({ x: last.outX, y: last.outY }), c2 = v.toScreen({ x: first.inX, y: first.inY }), q = v.toScreen(first);
            g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, q.x, q.y);
          }
        }
      });
      return;
    }
    const a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
    const ellipse = s.kind === 'ellipse';
    const radius = Math.min(s.cornerRadius * v.zoom, (b.x - a.x) / 2, (b.y - a.y) / 2);
    dashed(ctx, g, () => {
      if (ellipse) g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else g.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, Math.max(0, radius));
    });
  },
  options: (e) => {
    const s = e.shapeSettings, set = (patch: Partial<typeof s>): void => { Object.assign(s, patch); e.emit('options', null); };
    return [
      { kind: 'title', text: 'Shape' },
      { kind: 'segment', label: 'Shape', choices: KINDS.map((k) => ({ id: k, label: k[0].toUpperCase() + k.slice(1) })), get: () => s.kind, set: (v) => { s.kind = v as typeof s.kind; e.emit('options', null); e.emit('tool', null); } },
      // Each kind's own settings: built once with the bar, shown while that kind is chosen.
      { kind: 'range', label: 'Corner radius', min: 0, max: 500, unit: 'px', get: () => s.cornerRadius, set: (v: number) => set({ cornerRadius: v }), when: () => s.kind === 'rectangle' },
      { kind: 'select', label: 'Custom shape', choices: CUSTOM_SHAPES.map((c) => ({ id: c.id, label: c.label })), get: () => s.custom, set: (v: string) => set({ custom: v }), when: () => s.kind === 'custom' },
      { kind: 'range', label: 'Sides', min: 3, max: 100, get: () => s.sides, set: (v: number) => set({ sides: Math.round(v) }), when: () => s.kind === 'polygon' },
      { kind: 'range', label: 'Points', min: 3, max: 100, get: () => s.sides, set: (v: number) => set({ sides: Math.round(v) }), when: () => s.kind === 'star' },
      { kind: 'range', label: 'Indent', min: 1, max: 99, unit: '%', get: () => s.starInset, set: (v: number) => set({ starInset: v }), when: () => s.kind === 'star' },
      { kind: 'range', label: 'Weight', min: 1, max: 1000, unit: 'px', get: () => s.weight, set: (v: number) => set({ weight: v }), when: () => lineLike(s.kind) },
      { kind: 'range', label: 'Head length', min: 1, max: 1000, unit: 'px', get: () => s.headLength, set: (v: number) => set({ headLength: v }), when: () => s.kind === 'arrow' },
      { kind: 'range', label: 'Head width', min: 1, max: 1000, unit: 'px', get: () => s.headWidth, set: (v: number) => set({ headWidth: v }), when: () => s.kind === 'arrow' },
      { kind: 'readout', label: 'Color', get: () => hexOf(e.fg) },
    ];
  },
};

/** A line's end, snapped to 45 degree steps when Shift was pressed after starting. */
function snapped(d: NonNullable<typeof draft>): Pt {
  if (!d.square) return d.point;
  const dx = d.point.x - d.anchor.x, dy = d.point.y - d.anchor.y, len = Math.hypot(dx, dy), a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: d.anchor.x + Math.cos(a) * len, y: d.anchor.y + Math.sin(a) * len };
}

import { allCustomShapes, hexOf, type Pt } from '../../engine';
import { boxedShapePath, linePath } from '../../engine/shape-paths';
import { dashed, type Tool } from '../registry';
import { dragRect } from './marquee';
import { cornerWidgetCancel, cornerWidgetDown, cornerWidgetMove, cornerWidgetOverlay, cornerWidgetUp } from './corner-widgets';

let draft: { anchor: Pt; point: Pt; shiftAtPress: boolean; altAtPress: boolean; square: boolean; center: boolean } | null = null;

const NOUN: Record<string, string> = { triangle: 'a triangle', rectangle: 'a rectangle', ellipse: 'an ellipse', polygon: 'a polygon', star: 'a star', heart: 'a heart', line: 'a line', arrow: 'an arrow', custom: 'a custom shape' };
const KINDS = ['rectangle', 'ellipse', 'triangle', 'polygon', 'star', 'line', 'arrow', 'heart', 'custom'] as const;
/** Each kind as a flyout entry with its own icon and the usual shape tool names. */
const SHAPE_ICONS: Record<string, string> = { triangle: 'tTriangle', rectangle: 'tRect', ellipse: 'tEllipseShape', polygon: 'tPolygon', star: 'tStar', line: 'tLine', arrow: 'tArrow', heart: 'tHeart', custom: 'tCustomShape' };
const SHAPE_NAMES: Record<(typeof KINDS)[number], string> = { triangle: 'Triangle', rectangle: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart', custom: 'Custom Shape' };
const lineLike = (k: string): boolean => k === 'line' || k === 'arrow';
const rounds = (k: string): boolean => k === 'rectangle' || k === 'triangle' || k === 'polygon' || k === 'star';

export const shapeTool: Tool = {
  id: 'shape', label: 'Shape', key: 'U', order: 75,
  icon: (e) => SHAPE_ICONS[e.shapeSettings.kind] ?? 'tRect',
  variants: (e) => KINDS.map((k) => ({ id: k, label: SHAPE_NAMES[k], icon: SHAPE_ICONS[k], active: () => e.shapeSettings.kind === k, pick: () => { e.shapeSettings.kind = k; e.emit('options', null); } })),
  hint: (e) => lineLike(e.shapeSettings.kind)
    ? `Drag to draw ${NOUN[e.shapeSettings.kind]} (${e.shapeSettings.mode === 'path' ? 'as a path' : e.shapeSettings.mode === 'pixels' ? 'in pixels on the active layer' : 'on a new shape layer'}) · Shift after starting snaps to 45 degrees · Shift+U switches shape`
    : `Drag to draw ${NOUN[e.shapeSettings.kind]} (${e.shapeSettings.mode === 'path' ? 'as a path' : e.shapeSettings.mode === 'pixels' ? 'in pixels on the active layer' : 'on a new shape layer'}) · Shift after starting keeps it square · Alt after starting grows from the center · Shift+U switches shape`,
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    if (cornerWidgetDown(ctx, p)) return;
    const at = ctx.engine.snapPoint(p.doc);
    draft = { anchor: at, point: at, shiftAtPress: p.shift, altAtPress: p.alt, square: false, center: false };
  },
  move(ctx, p) {
    if (cornerWidgetMove(ctx, p)) return;
    if (!draft) return;
    draft.point = ctx.engine.snapPoint(p.doc);
    draft.square = p.shift && !draft.shiftAtPress;
    draft.center = p.alt && !draft.altAtPress;
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    if (cornerWidgetUp(ctx)) return;
    const d = draft;
    draft = null;
    ctx.engine.snapPoint({ x: 0, y: 0 }, true);
    ctx.engine.emit('overlay', null);
    if (!d) return;
    // A click without a drag asks for the size in the Create Shape dialog.
    if (Math.hypot(d.point.x - d.anchor.x, d.point.y - d.anchor.y) < 3) { document.dispatchEvent(new CustomEvent('cv:create-shape', { detail: { x: Math.round(d.anchor.x), y: Math.round(d.anchor.y) } })); return; }
    // One entry by mode (a shape layer, the work path, or pixels) with the bar's fill and stroke (1.49.8).
    const r = dragRect(d.anchor, d.point, d.square, d.center);
    ctx.engine.drawShape(d.anchor, lineLike(ctx.engine.shapeSettings.kind) ? snapped(d) : d.point, r);
  },
  keydown(ctx, e) {
    if (e.code !== 'KeyU' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
    const s = ctx.engine.shapeSettings;
    s.kind = KINDS[(KINDS.indexOf(s.kind) + 1) % KINDS.length];
    ctx.engine.emit('options', null);
    ctx.engine.emit('tool', null);
    return true;
  },
  cancel(ctx) { cornerWidgetCancel(ctx); draft = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    cornerWidgetOverlay(ctx, g);
    if (!draft) return;
    const r = dragRect(draft.anchor, draft.point, draft.square, draft.center), v = ctx.view(), s = ctx.engine.shapeSettings;
    if ((s.kind !== 'rectangle' && s.kind !== 'ellipse') || (s.kind === 'rectangle' && s.smoothCorners && s.cornerRadius > 0)) {
      const path = lineLike(s.kind) ? linePath(s.kind as 'line' | 'arrow', draft.anchor, snapped(draft), s) : boxedShapePath(s.kind as 'polygon' | 'star' | 'heart' | 'custom' | 'rectangle', r, s);
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
      // Mode, Fill and Stroke (the owner's tool list): a shape layer, a path, or pixels; each colour the
      // foreground, the background or none; the stroke's width.
      { kind: 'segment', label: 'Mode', priority: 70, choices: [{ id: 'shape', label: 'Shape' }, { id: 'path', label: 'Path' }, { id: 'pixels', label: 'Pixels' }], get: () => s.mode, set: (v) => set({ mode: v as 'shape' | 'path' | 'pixels' }) },
      { kind: 'segment', label: 'Fill', priority: 90, choices: [{ id: 'fg', label: 'Foreground' }, { id: 'bg', label: 'Background' }, { id: 'none', label: 'None' }], get: () => s.fill, set: (v) => set({ fill: v as 'fg' | 'bg' | 'none' }), when: () => s.mode !== 'path' },
      { kind: 'segment', label: 'Stroke', priority: 85, choices: [{ id: 'none', label: 'None' }, { id: 'fg', label: 'Foreground' }, { id: 'bg', label: 'Background' }], get: () => s.stroke, set: (v) => set({ stroke: v as 'fg' | 'bg' | 'none' }), when: () => s.mode !== 'path' },
      { kind: 'range', label: 'Width', priority: 80, min: 0.5, max: 200, unit: 'px', get: () => s.strokeWidth, set: (v: number) => set({ strokeWidth: Math.max(0.5, Math.min(200, v)) }), when: () => s.mode !== 'path' && s.stroke !== 'none' },
      // Stroke Type and Align (1.52.8, the tool audit).
      { kind: 'select', label: 'Stroke Type', priority: 50, choices: [{ id: 'solid', label: 'Solid' }, { id: 'dashed', label: 'Dashed' }, { id: 'dotted', label: 'Dotted' }], get: () => s.strokeDash, set: (v: string) => set({ strokeDash: v as typeof s.strokeDash }), when: () => s.mode !== 'path' && s.stroke !== 'none' },
      { kind: 'select', label: 'Align', priority: 40, choices: [{ id: 'inside', label: 'Inside' }, { id: 'center', label: 'Center' }, { id: 'outside', label: 'Outside' }], get: () => s.strokeAlign, set: (v: string) => set({ strokeAlign: v as typeof s.strokeAlign }), when: () => s.mode !== 'path' && s.stroke !== 'none' },
      { kind: 'select', label: 'Caps', priority: 30, choices: [{ id: 'round', label: 'Round' }, { id: 'butt', label: 'Butt' }, { id: 'square', label: 'Square' }], get: () => s.strokeCap, set: (v: string) => set({ strokeCap: v as typeof s.strokeCap }), when: () => s.mode !== 'path' && s.stroke !== 'none' },
      { kind: 'select', label: 'Corners', priority: 30, choices: [{ id: 'round', label: 'Round' }, { id: 'miter', label: 'Miter' }, { id: 'bevel', label: 'Bevel' }], get: () => s.strokeJoin, set: (v: string) => set({ strokeJoin: v as typeof s.strokeJoin }), when: () => s.mode !== 'path' && s.stroke !== 'none' },
      { kind: 'range', label: 'Miter limit', priority: 25, min: 1, max: 10, get: () => s.strokeMiter, set: (v: number) => set({ strokeMiter: v }), when: () => s.mode !== 'path' && s.stroke !== 'none' && s.strokeJoin === 'miter' },
      { kind: 'select', label: 'Gradient', priority: 60, choices: [{ id: 'off', label: 'Off' }, { id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }, { id: 'angle', label: 'Angle' }], get: () => s.gradient, set: (v: string) => set({ gradient: v as typeof s.gradient }), when: () => s.mode !== 'path' && s.fill !== 'none' },
      { kind: 'range', label: 'Gradient angle', priority: 55, min: -180, max: 180, unit: 'deg', get: () => s.gradientAngle, set: (v: number) => set({ gradientAngle: Math.round(v) }), when: () => s.mode !== 'path' && s.fill !== 'none' && s.gradient !== 'off' },
      { kind: 'segment', label: 'Shape', priority: 95, choices: KINDS.map((k) => ({ id: k, label: k[0].toUpperCase() + k.slice(1) })), get: () => s.kind, set: (v) => { s.kind = v as typeof s.kind; e.emit('options', null); e.emit('tool', null); } },
      // Each kind's own settings: built once with the bar, shown while that kind is chosen.
      { kind: 'range', label: 'Corner radius', priority: 75, min: 0, max: 500, unit: 'px', get: () => s.cornerRadius, set: (v: number) => set({ cornerRadius: v }), when: () => rounds(s.kind) },
      { kind: 'toggle', label: 'Smooth corners', priority: 65, get: () => s.smoothCorners, set: (v: boolean) => set({ smoothCorners: v }), when: () => rounds(s.kind) },
      { kind: 'select', label: 'Custom shape', priority: 75, choices: allCustomShapes().map((c) => ({ id: c.id, label: c.label })), get: () => s.custom, set: (v: string) => set({ custom: v }), when: () => s.kind === 'custom' },
      { kind: 'range', label: 'Sides', priority: 75, min: 3, max: 100, get: () => s.sides, set: (v: number) => set({ sides: Math.round(v) }), when: () => s.kind === 'polygon' },
      { kind: 'range', label: 'Points', priority: 75, min: 3, max: 100, get: () => s.sides, set: (v: number) => set({ sides: Math.round(v) }), when: () => s.kind === 'star' },
      { kind: 'range', label: 'Indent', priority: 70, min: 1, max: 99, unit: '%', get: () => s.starInset, set: (v: number) => set({ starInset: v }), when: () => s.kind === 'star' },
      { kind: 'range', label: 'Weight', priority: 75, min: 1, max: 1000, unit: 'px', get: () => s.weight, set: (v: number) => set({ weight: v }), when: () => lineLike(s.kind) },
      { kind: 'range', label: 'Head length', priority: 70, min: 1, max: 1000, unit: 'px', get: () => s.headLength, set: (v: number) => set({ headLength: v }), when: () => s.kind === 'arrow' },
      { kind: 'range', label: 'Head width', priority: 70, min: 1, max: 1000, unit: 'px', get: () => s.headWidth, set: (v: number) => set({ headWidth: v }), when: () => s.kind === 'arrow' },
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

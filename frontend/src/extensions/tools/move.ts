import { HANDLES, contains, corners, unitPoint, type DragMode, type Transform } from '../../engine';
import { digitOf, type Tool, type ToolContext, type ToolPointer } from '../registry';

const HANDLE_PX = 7;
const ROTATE_PX = 24;
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

function editable(ctx: ToolContext): Transform | null {
  const e = ctx.engine, te = e.transformEdit;
  if (te) return te.draft;
  const box = e.groupBox();
  if (box) return box;
  const l = e.activeLayer;
  if (!l || l.isGroup || !l.raster) return null;
  return e.transformsMask(l) ? l.mask?.placement ?? l.transform : l.transform;
}

function hit(ctx: ToolContext, p: ToolPointer): DragMode | null {
  const t = editable(ctx);
  if (!t) return null;
  if (ctx.engine.showTransformControls) {
    const v = ctx.view();
    for (let i = 0; i < HANDLES.length; i++) {
      const s = v.toScreen(unitPoint(t, HANDLES[i].x, HANDLES[i].y));
      if (Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= HANDLE_PX) return { kind: 'resize', handle: i };
    }
    if (!contains(t, p.doc)) {
      for (const c of corners(t)) {
        const s = v.toScreen(c);
        if (Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= ROTATE_PX) return { kind: 'rotate' };
      }
    }
  }
  return { kind: 'move' };
}

function resizeCursor(t: Transform, handle: number): string {
  const h = HANDLES[handle];
  const angle = Math.atan2((h.y - 0.5) * t.h, (h.x - 0.5) * t.w) * (180 / Math.PI) + t.rotation;
  const step = ((Math.round(angle / 45) % 4) + 4) % 4;
  return CURSORS[step];
}

const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

let pixelStart: { x: number; y: number } | null = null;

export const moveTool: Tool = {
  id: 'move', label: 'Move', key: 'V', order: 10,
  icon: () => 'cursor',
  hint: (eng) => (eng.floatingSelection ? 'Transform Selection · Drag to move · Handles resize · Outside a corner rotates · Shift constrains · Enter applies · Escape cancels' : 'Drag to move · Drag inside a selection to move its pixels, Alt to duplicate them · Handles resize · Outside a corner rotates · Shift constrains · Alt resizes from the center · Cmd or Ctrl picks the layer under the pointer · Arrows nudge · 1-0 set layer opacity'),
  cursor(ctx, p) {
    if (!p) return 'default';
    const m = hit(ctx, p);
    const t = editable(ctx);
    if (!m || !t) return 'default';
    return m.kind === 'move' ? 'move' : m.kind === 'rotate' ? 'alias' : resizeCursor(t, m.handle);
  },
  down(ctx, p) {
    if (p.button !== 0) return;
    const e = ctx.engine;
    const sel = e.current?.selection;
    if (sel && sel.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y)) >= 128 && e.beginPixelMove(p.alt)) { pixelStart = p.doc; return; }
    if (p.mod || e.autoSelect) { const id = e.layerAt(p.doc); if (id) e.selectLayer(id); }
    const m = hit(ctx, p);
    if (m) e.beginTransform(m, p.doc);
  },
  move(ctx, p) {
    if (pixelStart) {
      let dx = p.doc.x - pixelStart.x, dy = p.doc.y - pixelStart.y;
      if (p.shift) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
      ctx.engine.movePixelsBy(dx, dy);
      return;
    }
    ctx.engine.updateTransform(p.doc, p.shift, p.alt);
  },
  up(ctx) {
    if (pixelStart) { pixelStart = null; ctx.engine.endPixelMove(); return; }
    ctx.engine.endTransform();
  },
  cancel(ctx) {
    if (pixelStart) { pixelStart = null; ctx.engine.cancelPixelMove(); return; }
    ctx.engine.cancelTransform();
  },
  keydown(ctx, e) {
    const eng = ctx.engine;
    if (e.metaKey || e.ctrlKey) return false;
    const step = e.shiftKey ? 10 : 1;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[e.key]) { eng.nudge(arrows[e.key][0], arrows[e.key][1]); return true; }
    const digit = digitOf(e);
    if (digit !== null && !e.shiftKey && !e.altKey) { eng.setOpacity(digit === 0 ? 1 : digit / 10); return true; }
    if (e.key === 'Escape' && pixelStart) { pixelStart = null; eng.cancelPixelMove(); return true; }
    if (e.key === 'Escape' && eng.transformEdit) { eng.cancelTransform(); return true; }
    if (e.key === 'Escape' && eng.floatingSelection) { eng.cancelSelectionTransform(); return true; }
    if (e.key === 'Enter' && eng.floatingSelection) { eng.commitSelectionTransform(); return true; }
    return false;
  },
  overlay(ctx, g) {
    const e = ctx.engine;
    const guides = e.snapGuides;
    if (guides && e.transformEdit) {
      const v = ctx.view(), pal = ctx.paint();
      g.save();
      g.strokeStyle = pal.accent;
      g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.beginPath();
      for (const x of guides.xs) { const s = Math.round(v.toScreen({ x, y: 0 }).x) + 0.5; g.moveTo(s, 0); g.lineTo(s, v.height); }
      for (const y of guides.ys) { const s = Math.round(v.toScreen({ x: 0, y }).y) + 0.5; g.moveTo(0, s); g.lineTo(v.width, s); }
      g.stroke();
      g.restore();
    }
    const t = editable(ctx);
    if (!t || !e.showTransformControls) return;
    const v = ctx.view();
    const pal = ctx.paint();
    const cs = corners(t).map((c) => v.toScreen(c));
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = pal.accent;
    g.beginPath();
    g.moveTo(cs[0].x, cs[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(cs[i].x, cs[i].y);
    g.closePath();
    g.stroke();
    for (const h of HANDLES) {
      const s = v.toScreen(unitPoint(t, h.x, h.y));
      g.fillStyle = pal.handle;
      g.fillRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 8, 8);
      g.strokeRect(Math.round(s.x) - 3.5, Math.round(s.y) - 3.5, 7, 7);
    }
    g.restore();
  },
  options(e) {
    const t = (): Transform | null => { const l = e.activeLayer; return l && !l.isGroup && l.raster ? e.transformEdit?.draft ?? l.transform : null; };
    return [
      { kind: 'title', text: 'Move' },
      { kind: 'toggle', label: 'Auto-select', get: () => e.autoSelect, set: (v) => e.update({ autoSelect: v }) },
      { kind: 'toggle', label: 'Transform controls', get: () => e.showTransformControls, set: (v) => e.update({ showTransformControls: v }) },
      { kind: 'toggle', label: 'Keep proportions', get: () => e.lockRatio, set: (v) => e.update({ lockRatio: v }) },
      { kind: 'number', label: 'X', get: () => t()?.x ?? null, set: (v) => e.setLayerTransform({ x: v }, 'Move Layer') },
      { kind: 'number', label: 'Y', get: () => t()?.y ?? null, set: (v) => e.setLayerTransform({ y: v }, 'Move Layer') },
      { kind: 'number', label: 'W', min: 1, get: () => t()?.w ?? null, set: (v) => e.resizeLayerTo(v, true) },
      { kind: 'number', label: 'H', min: 1, get: () => t()?.h ?? null, set: (v) => e.resizeLayerTo(v, false) },
      { kind: 'number', label: 'Scale', unit: '%', min: 1, get: () => { const l = e.activeLayer, tt = t(); return l?.raster && tt ? (tt.w / l.raster.width) * 100 : null; }, set: (v) => e.scaleLayerTo(v) },
      { kind: 'number', label: 'Angle', unit: '\u00b0', get: () => t()?.rotation ?? null, set: (v) => e.setLayerTransform({ rotation: v }, 'Rotate Layer') },
      { kind: 'segment', label: 'Sampling', choices: [{ id: 'nearest', label: 'Nearest' }, { id: 'smooth', label: 'Smooth' }, { id: 'high', label: 'High quality' }], get: () => t()?.sampling ?? 'high', set: (v) => e.setLayerTransform({ sampling: v as Transform['sampling'] }, 'Layer Sampling') },
      { kind: 'toggle', label: 'Snap', get: () => e.snapping, set: (v) => { e.snapping = v; e.emit('options', null); } },
      { kind: 'button', label: 'Flip horizontal', icon: 'flipH', run: () => e.flipLayers(true) },
      { kind: 'button', label: 'Flip vertical', icon: 'flipV', run: () => e.flipLayers(false) },
    ];
  },
};

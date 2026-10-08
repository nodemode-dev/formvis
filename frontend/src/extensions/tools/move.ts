import { HANDLES, contains, corners, unitPoint, type DragMode, type Transform } from '../../engine';
import { meshSurfacePoint, type P2 } from '../../engine/mesh-warp';
import { digitOf, type OptionSpec, type Tool, type ToolContext, type ToolPointer } from '../registry';

const HANDLE_PX = 7;
const ROTATE_PX = 24;
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

function editable(ctx: ToolContext): Transform | null {
  const e = ctx.engine, te = e.transformEdit, p = e.current;
  // A layer placed by the video timeline's Position keyframes has its box where it is seen (1.59.9); the engine takes
  // the pointer back by the same offset, so the edit itself is in the layer's own coordinates.
  const seen = (id: string, t: Transform): Transform => { if (!p) return t; const o = e.keyedOffset(p, id); return o.dx || o.dy ? { ...t, x: t.x + o.dx, y: t.y + o.dy } : t; };
  if (te) return te.group || te.mask ? te.draft : seen(te.layerId, te.draft);
  const box = e.groupBox();
  if (box) return box;
  const l = e.activeLayer;
  if (!l || l.isGroup || !l.raster) return null;
  return e.transformsMask(l) ? l.mask?.placement ?? l.transform : seen(l.id, l.transform);
}

/** the free distort: the handle under the pointer, 0 to 3 the corners in handle order (top-left, top-right,
 *  bottom-right, bottom-left), 4 to 7 the middles of the top, right, bottom and left sides of a pending distortion; or
 *  with Cmd held a corner handle of the transform box. With where the drag began and the corners then (1.65.6). */
let cornerDrag: number | null = null;
let distortFrom: { start: { x: number; y: number }; corners: Array<{ x: number; y: number }> } | null = null;
/** The warp control point being dragged, and the one under the pointer while a warp is pending. */
let warpDrag: number | null = null;
/** The Puppet Warp pin being dragged. */
let pinDrag: number | null = null;
/** Perspective Warp (1.55.6): the corner being dragged, and the plane being drawn in Layout. */
let perspDrag: { plane: number; corner: number } | null = null;
let planeStart: { x: number; y: number } | null = null, planeEnd: { x: number; y: number } | null = null;
function perspectiveCorner(ctx: ToolContext, p: ToolPointer): { plane: number; corner: number } | null {
  const w = ctx.engine.perspectiveEdit, v = ctx.view();
  if (!w) return null;
  let best: { plane: number; corner: number } | null = null, bestD = HANDLE_PX + 1;
  w.planes.forEach((pl, k) => pl.dst.forEach(([x, y], i) => { const s = v.toScreen({ x, y }), d = Math.hypot(s.x - p.screen.x, s.y - p.screen.y); if (d <= HANDLE_PX && d < bestD) { best = { plane: k, corner: i }; bestD = d; } }));
  return best;
}
const snapDoc = (ctx: ToolContext): number => (HANDLE_PX + 3) / Math.max(0.01, ctx.view().zoom);
function puppetPin(ctx: ToolContext, p: ToolPointer): number | null {
  const w = ctx.engine.puppetEdit, v = ctx.view();
  if (!w) return null;
  let best: number | null = null, bestD = HANDLE_PX + 1;
  w.to.forEach(([x, y], i) => { const s = v.toScreen({ x, y }), d = Math.hypot(s.x - p.screen.x, s.y - p.screen.y); if (d <= HANDLE_PX && d < bestD) { best = i; bestD = d; } });
  return best;
}
function warpPoint(ctx: ToolContext, p: ToolPointer): number | null {
  const w = ctx.engine.meshWarpEdit, v = ctx.view();
  if (!w) return null;
  let best: number | null = null, bestD = HANDLE_PX + 1;
  w.points.forEach(([x, y], i) => { const s = v.toScreen({ x, y }), d = Math.hypot(s.x - p.screen.x, s.y - p.screen.y); if (d <= HANDLE_PX && d < bestD) { best = i; bestD = d; } });
  return best;
}
function distortCorner(ctx: ToolContext, p: ToolPointer): number | null {
  const e = ctx.engine, v = ctx.view(), d = e.distortEdit;
  let pts = d ? [...d.corners] : null;
  if (!pts) {
    const t = editable(ctx);
    if (!t || !e.showTransformControls || !p.mod) return null;
    pts = [0, 2, 4, 6].map((k) => unitPoint(t, HANDLES[k].x, HANDLES[k].y));
  }
  for (let i = 0; i < 4; i++) {
    const s = v.toScreen(pts[i]);
    if (Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= HANDLE_PX) return i;
  }
  if (d) for (let k = 0; k < 4; k++) {
    const a = pts[k], b = pts[(k + 1) % 4], s = v.toScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= HANDLE_PX) return 4 + k;
  }
  return null;
}

function hit(ctx: ToolContext, p: ToolPointer): DragMode | null {
  const t = editable(ctx), only = ctx.engine.transformConstraint;
  if (!t) return null;
  if (ctx.engine.showTransformControls) {
    const v = ctx.view();
    for (let i = 0; i < HANDLES.length; i++) {
      const s = v.toScreen(unitPoint(t, HANDLES[i].x, HANDLES[i].y));
      if (Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= HANDLE_PX) return only === 'rotate' ? { kind: 'rotate' } : { kind: 'resize', handle: i };
    }
    if (!contains(t, p.doc) && only === 'rotate') return { kind: 'rotate' };
    if (!contains(t, p.doc) && only !== 'scale') {
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

const ALIGN_NAMES = { left: 'Left Edges', hcenter: 'Horizontal Centers', right: 'Right Edges', top: 'Top Edges', vcenter: 'Vertical Centers', bottom: 'Bottom Edges' } as const;

const DISTORT_HINTS = {
  distort: 'Distort · Drag a corner or a side anywhere · Enter applies · Escape cancels',
  skew: 'Skew · Drag a side to slant it, a corner along a side · Enter applies · Escape cancels',
  perspective: 'Perspective · Drag a corner along a side, its partner moving the other way · Enter applies · Escape cancels',
} as const;

export const moveTool: Tool = {
  id: 'move', label: 'Move', key: 'V', order: 10,
  icon: () => 'tMove',
  hint: (eng) => (eng.distortEdit ? DISTORT_HINTS[eng.distortEdit.mode] : eng.transformConstraint === 'scale' ? 'Scale · Drag a handle to scale · Shift keeps or frees the proportions · Alt scales from the center · Enter or Escape ends' : eng.transformConstraint === 'rotate' ? 'Rotate · Drag a handle or outside the box to turn · Shift turns by 15° · Enter or Escape ends' : eng.floatingSelection ? 'Transform Selection · Drag to move · Handles resize · Outside a corner rotates · Shift constrains · Enter applies · Escape cancels' : 'Drag to move · Drag inside a selection to move its pixels, Alt to duplicate them · Handles resize · Outside a corner rotates · Shift constrains · Alt resizes from the center · Cmd or Ctrl picks the layer under the pointer · Arrows nudge · 1-0 set layer opacity'),
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
    if (e.perspectiveEdit) {
      const c = perspectiveCorner(ctx, p);
      if (c) { perspDrag = c; return; }
      if (e.perspectiveEdit.phase === 'layout') { planeStart = p.doc; planeEnd = p.doc; }
      return;
    }
    if (e.meshWarpEdit) { warpDrag = warpPoint(ctx, p); return; }
    if (e.puppetEdit) {
      const hitPin = puppetPin(ctx, p);
      if (p.alt) { if (hitPin !== null) e.removePuppetPin(hitPin); return; }
      pinDrag = hitPin ?? e.addPuppetPin(p.doc);
      return;
    }
    const corner = distortCorner(ctx, p);
    if (corner !== null && (e.distortEdit || e.beginDistort())) { cornerDrag = corner; distortFrom = { start: { ...p.doc }, corners: (e.distortEdit?.corners ?? []).map((c) => ({ ...c })) }; return; }
    if (e.distortEdit) return;
    const sel = e.current?.selection;
    if (sel && sel.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y)) >= 128 && e.beginPixelMove(p.alt)) { pixelStart = p.doc; return; }
    if (p.mod || e.autoSelect) {
      // Auto-Select Target Group selects the top-most folder holding the layer, as Photoshop's.
      let id = e.layerAt(p.doc);
      if (id && e.autoSelectTarget === 'group') { const doc = e.current?.doc; let l = doc?.layers.find((x) => x.id === id); while (l?.parentId) { const up = doc?.layers.find((x) => x.id === l?.parentId); if (!up) break; l = up; } if (l) id = l.id; }
      if (id) e.selectLayer(id);
    }
    const m = hit(ctx, p);
    if (m) e.beginTransform(m, p.doc);
  },
  move(ctx, p) {
    if (perspDrag) { ctx.engine.movePerspectiveCorner(perspDrag.plane, perspDrag.corner, p.doc, snapDoc(ctx)); return; }
    if (planeStart) { planeEnd = p.doc; ctx.engine.emit('overlay', null); return; }
    if (pinDrag !== null) { ctx.engine.movePuppetPin(pinDrag, p.doc); return; }
    if (warpDrag !== null) { ctx.engine.moveMeshWarpPoint(warpDrag, p.doc); return; }
    if (cornerDrag !== null && distortFrom) { ctx.engine.moveDistortHandle(cornerDrag, distortFrom.corners, p.doc.x - distortFrom.start.x, p.doc.y - distortFrom.start.y); return; }
    if (pixelStart) {
      let dx = p.doc.x - pixelStart.x, dy = p.doc.y - pixelStart.y;
      if (p.shift) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
      ctx.engine.movePixelsBy(dx, dy);
      return;
    }
    ctx.engine.updateTransform(p.doc, p.shift, p.alt);
  },
  up(ctx) {
    if (perspDrag) { perspDrag = null; return; }
    if (planeStart) {
      const a = planeStart, b = planeEnd ?? a, v = ctx.view(), sa = v.toScreen(a), sb = v.toScreen(b);
      planeStart = planeEnd = null;
      if (Math.abs(sa.x - sb.x) > 8 && Math.abs(sa.y - sb.y) > 8) ctx.engine.addPerspectivePlane(a, b, snapDoc(ctx));
      ctx.engine.emit('overlay', null);
      return;
    }
    if (ctx.engine.perspectiveEdit) return;
    if (pinDrag !== null) { pinDrag = null; return; }
    if (warpDrag !== null) { warpDrag = null; return; }
    if (ctx.engine.meshWarpEdit || ctx.engine.puppetEdit) return;
    if (cornerDrag !== null) { cornerDrag = null; distortFrom = null; return; }
    if (pixelStart) { pixelStart = null; ctx.engine.endPixelMove(); return; }
    ctx.engine.endTransform();
  },
  cancel(ctx) {
    if (perspDrag || planeStart) { perspDrag = null; planeStart = planeEnd = null; ctx.engine.emit('overlay', null); return; }
    if (pinDrag !== null) { pinDrag = null; return; }
    if (warpDrag !== null) { warpDrag = null; return; }
    if (cornerDrag !== null) { cornerDrag = null; distortFrom = null; return; }
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
    if (e.key === 'Enter' && eng.perspectiveEdit) { eng.applyPerspectiveWarp(); return true; }
    if (e.key === 'Escape' && eng.perspectiveEdit) { eng.cancelPerspectiveWarp(); return true; }
    if (e.key === 'Enter' && eng.puppetEdit) { eng.applyPuppetWarp(); return true; }
    if (e.key === 'Escape' && eng.puppetEdit) { eng.cancelPuppetWarp(); return true; }
    if (e.key === 'Enter' && eng.meshWarpEdit) { eng.applyMeshWarp(); return true; }
    if (e.key === 'Escape' && eng.meshWarpEdit) { eng.cancelMeshWarp(); return true; }
    if (e.key === 'Enter' && eng.distortEdit) { eng.applyDistort(); return true; }
    if (e.key === 'Escape' && eng.distortEdit) { eng.cancelDistort(); return true; }
    if (e.key === 'Escape' && pixelStart) { pixelStart = null; eng.cancelPixelMove(); return true; }
    if (e.key === 'Escape' && eng.transformEdit) { eng.cancelTransform(); return true; }
    const ended = (e.key === 'Enter' || e.key === 'Escape') && !!eng.transformConstraint;
    if (ended) eng.endTransformMode();
    if (e.key === 'Escape' && eng.floatingSelection) { eng.cancelSelectionTransform(); return true; }
    if (e.key === 'Enter' && eng.floatingSelection) { eng.commitSelectionTransform(); return true; }
    return ended;
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
    const px = e.perspectiveEdit;
    if (px) {
      const v = ctx.view(), pal = ctx.paint();
      g.save();
      g.lineWidth = 1;
      g.strokeStyle = pal.accent;
      for (const pl of px.planes) {
        const s = pl.dst.map(([x, y]) => v.toScreen({ x, y }));
        g.setLineDash(px.phase === 'layout' ? [5, 3] : []);
        g.beginPath(); g.moveTo(s[0].x, s[0].y); for (let i = 1; i < 4; i++) g.lineTo(s[i].x, s[i].y); g.closePath(); g.stroke();
        g.setLineDash([2, 3]); g.beginPath();
        for (const t of [1 / 3, 2 / 3]) {
          const a = { x: s[0].x + (s[1].x - s[0].x) * t, y: s[0].y + (s[1].y - s[0].y) * t }, b = { x: s[3].x + (s[2].x - s[3].x) * t, y: s[3].y + (s[2].y - s[3].y) * t };
          const c = { x: s[0].x + (s[3].x - s[0].x) * t, y: s[0].y + (s[3].y - s[0].y) * t }, d = { x: s[1].x + (s[2].x - s[1].x) * t, y: s[1].y + (s[2].y - s[1].y) * t };
          g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.moveTo(c.x, c.y); g.lineTo(d.x, d.y);
        }
        g.stroke(); g.setLineDash([]);
        g.fillStyle = pal.handle;
        for (const q of s) { g.beginPath(); g.rect(q.x - 4, q.y - 4, 8, 8); g.fill(); g.stroke(); }
      }
      if (planeStart && planeEnd) {
        const a = v.toScreen(planeStart), b = v.toScreen(planeEnd);
        g.setLineDash([5, 3]); g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); g.setLineDash([]);
      }
      g.restore();
    }
    const pe = e.puppetEdit;
    if (pe) {
      const v = ctx.view(), pal = ctx.paint();
      g.save();
      g.lineWidth = 1;
      g.strokeStyle = pal.accent;
      pe.to.forEach(([x, y], i) => {
        const s = v.toScreen({ x, y }), f = v.toScreen({ x: pe.from[i][0], y: pe.from[i][1] });
        g.setLineDash([3, 3]); g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(s.x, s.y); g.stroke(); g.setLineDash([]);
        g.fillStyle = pal.handle; g.beginPath(); g.arc(s.x, s.y, 5, 0, Math.PI * 2); g.fill(); g.stroke();
      });
      g.restore();
    }
    const mw = e.meshWarpEdit;
    if (mw) {
      const v = ctx.view(), pal = ctx.paint(), q: P2 = [0, 0];
      g.save();
      g.lineWidth = 1;
      g.strokeStyle = pal.accent;
      g.beginPath();
      for (let line = 0; line < mw.gw + mw.gh; line++) {
        const alongU = line < mw.gh, fixed = alongU ? line : line - mw.gh;
        for (let k = 0; k <= 24; k++) {
          const t = (k / 24) * ((alongU ? mw.gw : mw.gh) - 1);
          meshSurfacePoint(mw.gw, mw.gh, mw.points, alongU ? t : fixed, alongU ? fixed : t, q);
          const s = v.toScreen({ x: q[0], y: q[1] });
          if (k) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y);
        }
      }
      g.stroke();
      g.fillStyle = pal.handle;
      for (const [x, y] of mw.points) { const s = v.toScreen({ x, y }); g.fillRect(s.x - 3.5, s.y - 3.5, 7, 7); g.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7); }
      g.restore();
    }
    const dz = e.distortEdit;
    if (dz) {
      const v = ctx.view(), pal = ctx.paint(), cs = dz.corners.map((c) => v.toScreen(c));
      g.save();
      g.lineWidth = 1;
      g.strokeStyle = pal.accent;
      g.beginPath();
      g.moveTo(cs[0].x, cs[0].y);
      for (let i = 1; i < 4; i++) g.lineTo(cs[i].x, cs[i].y);
      g.closePath();
      g.stroke();
      for (const s of [...cs, ...cs.map((a, k) => ({ x: (a.x + cs[(k + 1) % 4].x) / 2, y: (a.y + cs[(k + 1) % 4].y) / 2 }))]) {
        g.fillStyle = pal.handle;
        g.fillRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 8, 8);
        g.strokeRect(Math.round(s.x) - 3.5, Math.round(s.y) - 3.5, 7, 7);
      }
      g.restore();
      return;
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
    const editing = (): boolean => !!e.transformEdit;
    return [
      { kind: 'title', text: 'Move' },
      // As the target's Move bar (Phase 21, s20): Auto-Select and its target, Show Transform Controls, Snap, then
      // align and distribute; the transform's own fields show only while a transform is being edited, as Photoshop's.
      { kind: 'toggle', label: 'Auto-Select', get: () => e.autoSelect, set: (v) => e.update({ autoSelect: v }) },
      { kind: 'select', label: 'Auto-Select Target', choices: [{ id: 'layer', label: 'Layer' }, { id: 'group', label: 'Group' }], get: () => e.autoSelectTarget, set: (v) => e.update({ autoSelectTarget: v as 'layer' | 'group' }) },
      { kind: 'toggle', label: 'Show Transform Controls', get: () => e.showTransformControls, set: (v) => e.update({ showTransformControls: v }) },
      { kind: 'toggle', label: 'Snap', get: () => e.snapping, set: (v) => { e.snapping = v; e.emit('options', null); } },
      ...(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const).map((k): OptionSpec => ({ kind: 'button', label: `Align ${ALIGN_NAMES[k]}`, icon: `align${k[0].toUpperCase()}${k.slice(1)}Edge`, run: () => e.alignLayers(k), when: () => !editing(), compact: true })),
      ...(['hspace', 'vspace'] as const).map((k): OptionSpec => ({ kind: 'button', label: k === 'hspace' ? 'Distribute Horizontal Spacing' : 'Distribute Vertical Spacing', icon: k === 'hspace' ? 'distributeH' : 'distributeV', run: () => e.distributeLayers(k), when: () => !editing(), compact: true })),
      { kind: 'toggle', label: 'Keep proportions', get: () => e.lockRatio, set: (v) => e.update({ lockRatio: v }), when: editing },
      { kind: 'number', label: 'X', get: () => t()?.x ?? null, set: (v) => e.setLayerTransform({ x: v }, 'Move Layer'), when: editing },
      { kind: 'number', label: 'Y', get: () => t()?.y ?? null, set: (v) => e.setLayerTransform({ y: v }, 'Move Layer'), when: editing },
      { kind: 'number', label: 'W', min: 1, get: () => t()?.w ?? null, set: (v) => e.resizeLayerTo(v, true), when: editing },
      { kind: 'number', label: 'H', min: 1, get: () => t()?.h ?? null, set: (v) => e.resizeLayerTo(v, false), when: editing },
      { kind: 'number', label: 'Scale', unit: '%', min: 1, get: () => { const l = e.activeLayer, tt = t(); return l?.raster && tt ? (tt.w / l.raster.width) * 100 : null; }, set: (v) => e.scaleLayerTo(v), when: editing },
      { kind: 'number', label: 'Angle', unit: '\u00b0', get: () => t()?.rotation ?? null, set: (v) => e.setLayerTransform({ rotation: v }, 'Rotate Layer'), when: editing },
      { kind: 'segment', label: 'Sampling', choices: [{ id: 'nearest', label: 'Nearest' }, { id: 'smooth', label: 'Smooth' }, { id: 'high', label: 'High quality' }], get: () => t()?.sampling ?? 'high', set: (v) => e.setLayerTransform({ sampling: v as Transform['sampling'] }), when: editing },
      { kind: 'button', label: 'Flip horizontal', icon: 'flipH', run: () => e.flipLayers(true), when: editing },
      { kind: 'button', label: 'Flip vertical', icon: 'flipV', run: () => e.flipLayers(false), when: editing },
      { kind: 'segment', label: 'Perspective Warp', choices: [{ id: 'layout', label: 'Layout' }, { id: 'warp', label: 'Warp' }], get: () => e.perspectiveEdit?.phase ?? 'layout', set: (v) => e.setPerspectivePhase(v as 'layout' | 'warp'), when: () => !!e.perspectiveEdit },
      { kind: 'button', label: 'Straighten verticals', run: () => e.straightenPerspective(true), when: () => e.perspectiveEdit?.phase === 'warp' },
      { kind: 'button', label: 'Level horizontals', run: () => e.straightenPerspective(false), when: () => e.perspectiveEdit?.phase === 'warp' },
      { kind: 'button', label: 'Apply', run: () => e.applyPerspectiveWarp(), when: () => !!e.perspectiveEdit },
      { kind: 'button', label: 'Cancel', run: () => e.cancelPerspectiveWarp(), when: () => !!e.perspectiveEdit },
    ];
  },
};

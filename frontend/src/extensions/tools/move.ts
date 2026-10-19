import { HANDLES, contains, corners, tracePath, unitPoint, type DragMode, type Transform } from '../../engine';
import { meshSurfacePoint, type P2 } from '../../engine/mesh-warp';
import { WARP_STYLES } from '../../engine/text';
import type { WarpStyle } from '../../engine/types';
import { digitOf, type OptionSpec, type Tool, type ToolContext, type ToolPointer } from '../registry';
import { extraShown } from '../../ui/view-extras';

const HANDLE_PX = 7; // screen points within which a handle is hit
const ROTATE_PX = 24; // how far outside a corner a drag still rotates
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']; // resize cursors by direction

function editable(ctx: ToolContext): Transform | null {
  const e = ctx.engine, te = e.transformEdit, p = e.current;
  // A layer placed by the video timeline's Position keyframes has its box where it is seen (1.59.9); the engine takes
  // the pointer back by the same offset, so the edit itself is in the layer's own coordinates.
  const seen = (id: string, t: Transform): Transform => { if (!p) return t; const o = e.keyedOffset(p, id); return o.dx || o.dy ? { ...t, x: t.x + o.dx, y: t.y + o.dy } : t; };
  if (e.pathTransform) return e.pathTransform.draft;
  if (te) return te.group || te.mask ? te.draft : seen(te.layerId, te.draft);
  const gb = e.groupBox();
  if (gb) return gb;
  const l = e.activeLayer;
  if (!l || !l.raster) return null;
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
  const e = ctx.engine, v = ctx.view(), d = e.distortEdit ?? (e.pathTransform?.corners ? { corners: e.pathTransform.corners } : null);
  let pts: Array<{ x: number; y: number }>;
  if (d) pts = d.corners;
  else {
    const t = editable(ctx);
    if (!t || !e.showTransformControls || !p.mod) return null;
    pts = [0, 2, 4, 6].map((i) => unitPoint(t, HANDLES[i].x, HANDLES[i].y));
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

/** The cursor for a handle: its direction from the box centre, turned by the box's rotation, snapped to 45 degrees. */
function resizeCursor(t: Transform, handle: number): string {
  const h = HANDLES[handle];
  const deg = (Math.atan2((h.y - 0.5) * t.h, (h.x - 0.5) * t.w) * 180) / Math.PI + (t.rotation || 0);
  const k = ((Math.round(deg / 45) % 8) + 8) % 8;
  return CURSORS[k % 4];
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10);

let pixelStart: { x: number; y: number } | null = null;
/** An Alt-drag made a copy of the layers before the drag; Escape takes the copy away again. */
let altCopy = false;
/** The last opacity digit and when it was typed: a second digit within a moment makes an exact percentage. */
let lastDigit: { d: number; at: number } | null = null;
/** The marquee that selects layers: pressed where Auto-Select (or Cmd or Ctrl) finds no layer. */
let marquee: { a: { x: number; y: number }; b: { x: number; y: number }; sa: { x: number; y: number }; add: boolean } | null = null;

const REFERENCE_POINTS: ReadonlyArray<readonly [number, number, string]> = [[0, 0, 'Top left'], [0.5, 0, 'Top'], [1, 0, 'Top right'], [0, 0.5, 'Left'], [0.5, 0.5, 'Center'], [1, 0.5, 'Right'], [0, 1, 'Bottom left'], [0.5, 1, 'Bottom'], [1, 1, 'Bottom right']];

const ALIGN_NAMES = { left: 'Left Edges', hcenter: 'Horizontal Centers', right: 'Right Edges', top: 'Top Edges', vcenter: 'Vertical Centers', bottom: 'Bottom Edges' } as const;

const DISTORT_HINTS = {
  distort: 'Distort · Drag a corner or a side anywhere · Enter applies · Escape cancels',
  skew: 'Skew · Drag a side to slant it, a corner along a side · Enter applies · Escape cancels',
  perspective: 'Perspective · Drag a corner along a side, its partner moving the other way · Enter applies · Escape cancels',
} as const;

export const moveTool: Tool = {
  id: 'move', label: 'Move', key: 'V', order: 10,
  icon: () => 'tMove',
  hint: (eng) => (eng.distortEdit ? DISTORT_HINTS[eng.distortEdit.mode] : eng.pathTransform?.dmode ? DISTORT_HINTS[eng.pathTransform.dmode] : eng.anyTransformPending ? (eng.pathTransform ? 'Free Transform Path' : 'Free Transform') + ' · Drag a handle to scale, outside a corner to turn, inside to move · Type values in the bar · Shift constrains · Alt from the center · Cmd or Ctrl skips snapping · Enter applies · Escape cancels' : eng.transformConstraint === 'scale' ? 'Scale · Drag a handle to scale · Shift keeps or frees the proportions · Alt scales from the center · Enter or Escape ends' : eng.transformConstraint === 'rotate' ? 'Rotate · Drag a handle or outside the box to turn · Shift turns by 15° · Enter or Escape ends' : eng.floatingSelection ? 'Transform Selection · Drag to move · Handles resize · Outside a corner rotates · Shift constrains · Enter applies · Escape cancels' : 'Drag to move · Drag inside a selection to move its pixels, Alt to duplicate them · Handles resize · Outside a corner rotates · Shift constrains · Alt resizes from the center · Alt-drag inside the box copies the layers · Cmd or Ctrl flips Auto-Select for the drag · Arrows nudge · 1-0 set layer opacity'),
  cursor(ctx, p) {
    if (!p) return 'default';
    if (ctx.engine.meshWarpEdit) ctx.engine.meshWarpAim = { x: p.doc.x, y: p.doc.y };
    const m = hit(ctx, p), t = editable(ctx);
    if (!m || !t) return 'default';
    if (m.kind === 'move') return 'move';
    if (m.kind === 'rotate') return 'alias';
    return resizeCursor(t, m.handle);
  },
  down(ctx, p) {
    if (p.button !== 0) return;
    const e = ctx.engine;
    if (e.pathTransform) {
      if (e.pathTransform.corners) {
        const c = distortCorner(ctx, p);
        if (c !== null) { cornerDrag = c; distortFrom = { start: { ...p.doc }, corners: e.pathTransform.corners.map((q) => ({ ...q })) }; }
        return;
      }
      const m = hit(ctx, p);
      if (m) e.continuePathTransform(m, p.doc);
      return;
    }
    if (e.perspectiveEdit) {
      const c = perspectiveCorner(ctx, p);
      if (c) { perspDrag = c; return; }
      if (e.perspectiveEdit.phase === 'layout') { planeStart = p.doc; planeEnd = p.doc; }
      return;
    }
    if (e.meshWarpEdit) { e.meshWarpAim = { x: p.doc.x, y: p.doc.y }; warpDrag = warpPoint(ctx, p); return; }
    if (e.puppetEdit) {
      const hitPin = puppetPin(ctx, p);
      if (p.alt) { if (hitPin !== null) e.removePuppetPin(hitPin); return; }
      if (hitPin !== null) e.selectPuppetPin(hitPin);
      pinDrag = hitPin ?? e.addPuppetPin(p.doc);
      return;
    }
    const corner = distortCorner(ctx, p);
    if (corner !== null && (e.distortEdit || e.beginDistort())) { cornerDrag = corner; distortFrom = { start: { ...p.doc }, corners: (e.distortEdit?.corners ?? []).map((c) => ({ ...c })) }; return; }
    if (e.distortEdit) return;
    const sel = e.current?.selection;
    if (sel && sel.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y)) >= 128 && e.beginPixelMove(p.alt)) { pixelStart = { x: p.doc.x, y: p.doc.y }; return; }
    if (!!p.mod !== e.autoSelect) {
      // Cmd or Ctrl flips Auto-Select for the press. Auto-Select Target Group selects the top-most folder holding the layer.
      let id = e.layerAt(p.doc);
      if (id && e.autoSelectTarget === 'group') { const doc = e.current?.doc; let l = doc?.layers.find((x) => x.id === id); while (l?.parentId) { const up = doc?.layers.find((x) => x.id === l?.parentId); if (!up) break; l = up; } if (l) id = l.id; }
      if (id) e.selectLayer(id);
      else { marquee = { a: { ...p.doc }, b: { ...p.doc }, sa: { ...p.screen }, add: p.shift }; return; }
    }
    const m = hit(ctx, p);
    if (m && m.kind === 'move' && p.alt && !e.transformEdit && e.activeLayer && !e.activeLayer.locks?.position && !e.activeLayer.locks?.all) {
      const before = e.current?.doc.layers.length ?? 0;
      e.duplicateLayers();
      altCopy = (e.current?.doc.layers.length ?? 0) > before;
    }
    if (m) e.continueTransform(m, p.doc);
  },
  move(ctx, p) {
    if (ctx.engine.pathTransform && cornerDrag === null) { ctx.engine.updatePathTransform(p.doc, p.shift, p.alt); return; }
    if (marquee) { marquee.b = { ...p.doc }; ctx.engine.emit('overlay', null); return; }
    if (perspDrag) { ctx.engine.movePerspectiveCorner(perspDrag.plane, perspDrag.corner, p.doc, snapDoc(ctx)); return; }
    if (planeStart) { planeEnd = p.doc; ctx.engine.emit('overlay', null); return; }
    if (pinDrag !== null) { ctx.engine.movePuppetPin(pinDrag, p.doc); return; }
    if (warpDrag !== null) { ctx.engine.moveMeshWarpPoint(warpDrag, p.doc); return; }
    if (cornerDrag !== null && distortFrom) {
      // Shift locks the corner to the horizontal or vertical axis, whichever it has travelled further along.
      let dx = p.doc.x - distortFrom.start.x, dy = p.doc.y - distortFrom.start.y;
      if (p.shift) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
      ctx.engine.moveDistortHandle(cornerDrag, distortFrom.corners, dx, dy);
      return;
    }
    if (pixelStart) {
      let dx = p.doc.x - pixelStart.x, dy = p.doc.y - pixelStart.y;
      if (p.shift) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
      ctx.engine.movePixelsBy(dx, dy);
      return;
    }
    ctx.engine.updateTransform(p.doc, p.shift, p.alt, p.mod);
  },
  up(ctx, p) {
    if (ctx.engine.pathTransform) { cornerDrag = null; distortFrom = null; ctx.engine.releasePathTransform(); return; }
    if (marquee) {
      const m = marquee;
      marquee = null;
      ctx.engine.emit('overlay', null);
      if (Math.abs(p.screen.x - m.sa.x) > 3 || Math.abs(p.screen.y - m.sa.y) > 3) {
        const x = Math.min(m.a.x, m.b.x), y = Math.min(m.a.y, m.b.y);
        ctx.engine.selectLayersInRect({ x, y, w: Math.abs(m.b.x - m.a.x), h: Math.abs(m.b.y - m.a.y) }, m.add || p.shift);
      }
      return;
    }
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
    altCopy = false;
    ctx.engine.releaseTransform();
  },
  cancel(ctx) {
    if (ctx.engine.pathTransform) { cornerDrag = null; distortFrom = null; ctx.engine.cancelPathTransformDrag(); return; }
    if (marquee) { marquee = null; ctx.engine.emit('overlay', null); return; }
    if (perspDrag || planeStart) { perspDrag = null; planeStart = planeEnd = null; ctx.engine.emit('overlay', null); return; }
    if (pinDrag !== null) { pinDrag = null; return; }
    if (warpDrag !== null) { warpDrag = null; return; }
    if (cornerDrag !== null) { cornerDrag = null; distortFrom = null; return; }
    if (pixelStart) { pixelStart = null; ctx.engine.cancelPixelMove(); return; }
    ctx.engine.cancelTransformDrag();
    if (altCopy) { altCopy = false; ctx.engine.undo(); }
  },
  keydown(ctx, e) {
    const eng = ctx.engine;
    if (e.metaKey || e.ctrlKey) return false;
    const step = e.shiftKey ? 10 : 1;
    if ((e.key === 'Delete' || e.key === 'Backspace') && eng.deleteSelectedGuides()) return true;
    if (e.key === 'Escape' && eng.selectedGuides.length && !eng.anyTransformPending) { eng.clearGuideSelection(); return true; }
    if (eng.anyTransformPending) {
      if (e.key === 'Enter') { eng.applyPendingTransform(); eng.endTransformMode(); return true; }
      if (e.key === 'Escape') { eng.cancelPendingTransform(); eng.endTransformMode(); return true; }
      const arrow: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrow[e.key]) { eng.nudgePending(arrow[e.key][0], arrow[e.key][1]); return true; }
    }
    if (e.key === 'ArrowLeft') { eng.nudge(-step, 0); return true; }
    if (e.key === 'ArrowRight') { eng.nudge(step, 0); return true; }
    if (e.key === 'ArrowUp') { eng.nudge(0, -step); return true; }
    if (e.key === 'ArrowDown') { eng.nudge(0, step); return true; }
    const digit = digitOf(e);
    if (typeof digit === 'number' && digit >= 0 && !e.shiftKey && !e.altKey) {
      const now = performance.now(), prev = lastDigit && now - lastDigit.at < 700 ? lastDigit.d : null;
      lastDigit = { d: digit, at: now };
      if (prev !== null && prev > 0) { lastDigit = null; eng.setOpacity((prev * 10 + digit) / 100); return true; }
      eng.setOpacity(digit === 0 ? 1 : digit / 10);
      return true;
    }
    if (e.key === 'Enter' && eng.perspectiveEdit) { eng.applyPerspectiveWarp(); return true; }
    if (e.key === 'Escape' && eng.perspectiveEdit) { eng.cancelPerspectiveWarp(); return true; }
    if (e.key === 'Enter' && eng.puppetEdit) { eng.applyPuppetWarp(); return true; }
    if (e.key === 'Escape' && eng.puppetEdit) { eng.cancelPuppetWarp(); return true; }
    if (e.key === 'Enter' && eng.meshWarpEdit) { eng.applyMeshWarp(); return true; }
    if (e.key === 'Escape' && eng.meshWarpEdit) { eng.cancelMeshWarp(); return true; }
    if (e.key === 'Enter' && eng.distortEdit) { eng.applyDistort(); return true; }
    if (e.key === 'Escape' && eng.distortEdit) { eng.cancelDistort(); return true; }
    if (e.key === 'Escape' && pixelStart) { pixelStart = null; eng.cancelPixelMove(); return true; }
    if (e.key === 'Escape' && eng.transformEdit) { eng.cancelTransform(); if (altCopy) { altCopy = false; eng.undo(); } return true; }
    const ended = (e.key === 'Enter' || e.key === 'Escape') && !!eng.transformConstraint;
    if (ended) eng.endTransformMode();
    if (e.key === 'Escape' && eng.floatingSelection) { eng.cancelSelectionTransform(); return true; }
    if (e.key === 'Enter' && eng.floatingSelection) { eng.commitSelectionTransform(); return true; }
    return ended;
  },
  overlay(ctx, g) {
    const e = ctx.engine;
    if (e.pathTransform && e.workPath) {
      const v = ctx.view(), pal = ctx.paint();
      g.save();
      g.lineWidth = 1.5;
      g.strokeStyle = pal.accent;
      g.stroke(tracePath(e.workPath, (q) => v.toScreen(q)));
      g.restore();
    }
    if (marquee) {
      const v = ctx.view(), pal = ctx.paint(), a = v.toScreen(marquee.a), b = v.toScreen(marquee.b);
      g.save();
      g.lineWidth = 1;
      g.strokeStyle = pal.accent;
      g.setLineDash([4, 3]);
      g.strokeRect(Math.round(Math.min(a.x, b.x)) + 0.5, Math.round(Math.min(a.y, b.y)) + 0.5, Math.round(Math.abs(b.x - a.x)), Math.round(Math.abs(b.y - a.y)));
      g.restore();
    }
    if (e.transformEdit && e.snapGuides) {
      const v = ctx.view(), pal = ctx.paint();
      g.save();
      g.strokeStyle = pal.accent;
      g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.beginPath();
      for (const x of e.snapGuides.xs) { const sx = Math.round(v.toScreen({ x, y: 0 }).x) + 0.5; g.moveTo(sx, 0); g.lineTo(sx, v.height); }
      for (const y of e.snapGuides.ys) { const sy = Math.round(v.toScreen({ x: 0, y }).y) + 0.5; g.moveTo(0, sy); g.lineTo(v.width, sy); }
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
      const mesh = extraShown('mesh') ? e.puppetMesh() : null;
      if (mesh) {
        g.globalAlpha = 0.55;
        g.beginPath();
        for (let j = 0; j < mesh.ny; j++) for (let i = 0; i < mesh.nx; i++) {
          const a = v.toScreen({ x: mesh.pts[j * mesh.nx + i][0], y: mesh.pts[j * mesh.nx + i][1] });
          if (i + 1 < mesh.nx) { const b = v.toScreen({ x: mesh.pts[j * mesh.nx + i + 1][0], y: mesh.pts[j * mesh.nx + i + 1][1] }); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
          if (j + 1 < mesh.ny) { const b = v.toScreen({ x: mesh.pts[(j + 1) * mesh.nx + i][0], y: mesh.pts[(j + 1) * mesh.nx + i][1] }); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
          if (i + 1 < mesh.nx && j + 1 < mesh.ny) { const b = v.toScreen({ x: mesh.pts[(j + 1) * mesh.nx + i + 1][0], y: mesh.pts[(j + 1) * mesh.nx + i + 1][1] }); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
        }
        g.stroke();
        g.globalAlpha = 1;
      }
      if (extraShown('pins')) pe.to.forEach(([x, y], i) => {
        const s = v.toScreen({ x, y }), f = v.toScreen({ x: pe.from[i][0], y: pe.from[i][1] });
        g.setLineDash([3, 3]); g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(s.x, s.y); g.stroke(); g.setLineDash([]);
        g.fillStyle = pal.handle; g.beginPath(); g.arc(s.x, s.y, i === pe.sel ? 6.5 : 5, 0, Math.PI * 2); g.fill(); g.stroke();
        if (i === pe.sel) { g.beginPath(); g.arc(s.x, s.y, 2, 0, Math.PI * 2); g.fillStyle = pal.accent; g.fill(); }
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
      for (let line = 0; extraShown('mesh') && line < mw.gw + mw.gh; line++) {
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
    const dd = e.distortEdit ?? (e.pathTransform?.corners ? { corners: e.pathTransform.corners } : null);
    if (dd) {
      const v = ctx.view(), pal = ctx.paint(), cs = dd.corners.map((c) => v.toScreen(c));
      g.save();
      g.strokeStyle = pal.accent;
      g.lineWidth = 1;
      g.beginPath(); cs.forEach((s, i) => (i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y))); g.closePath(); g.stroke();
      g.fillStyle = pal.handle;
      for (const s of [...cs, ...cs.map((a, k) => ({ x: (a.x + cs[(k + 1) % 4].x) / 2, y: (a.y + cs[(k + 1) % 4].y) / 2 }))]) {
        g.fillRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 8, 8);
        g.strokeRect(Math.round(s.x) - 3.5, Math.round(s.y) - 3.5, 7, 7);
      }
      g.restore();
      return;
    }
    const bx = editable(ctx);
    if (!bx || !e.showTransformControls) return;
    const v = ctx.view(), pal = ctx.paint(), cs = corners(bx).map((c) => v.toScreen(c));
    g.save();
    g.strokeStyle = pal.accent;
    g.lineWidth = 1;
    g.beginPath(); cs.forEach((s, i) => (i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y))); g.closePath(); g.stroke();
    g.fillStyle = pal.handle;
    for (const h of HANDLES) {
      const s = v.toScreen(unitPoint(bx, h.x, h.y));
      g.fillRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 8, 8);
      g.strokeRect(Math.round(s.x) - 3.5, Math.round(s.y) - 3.5, 7, 7);
    }
    g.restore();
  },
  options(e) {
    const t = (): Transform | null => {
      if (e.pathTransform) return e.pathTransform.draft;
      if (e.transformEdit) return e.transformEdit.draft;
      const l = e.activeLayer;
      return l && l.raster ? l.transform : null;
    };
    // The transform's fields wait for a transform: a handle drag, a pending Free Transform or a path transform.
    const editing = (): boolean => e.pathTransform ? !e.pathTransform.corners : !!e.transformEdit;
    return [
      { kind: 'title', text: 'Move' },
      // As the target's Move bar (Phase 21, s20): Auto-Select and its target, Show Transform Controls, Snap, then
      // align and distribute; the transform's own fields show while its controls are shown or a transform is being edited.
      { kind: 'toggle', label: 'Auto-Select', priority: 90, get: () => e.autoSelect, set: (v) => e.update({ autoSelect: v }) },
      { kind: 'select', label: 'Auto-Select Target', priority: 60, choices: [{ id: 'layer', label: 'Layer' }, { id: 'group', label: 'Group' }], get: () => e.autoSelectTarget, set: (v) => e.update({ autoSelectTarget: v as 'layer' | 'group' }) },
      { kind: 'toggle', label: 'Show Transform Controls', priority: 70, get: () => e.showTransformControls, set: (v) => e.update({ showTransformControls: v }) },
      { kind: 'toggle', label: 'Snap', priority: 50, get: () => e.snapping, set: (v) => { e.snapping = v; e.emit('options', null); } },
      { kind: 'select', label: 'Align To', priority: 45, choices: [{ id: 'auto', label: 'Auto' }, { id: 'selection', label: 'Selection' }, { id: 'canvas', label: 'Canvas' }], get: () => e.alignTo, set: (v: string) => { e.alignTo = v === 'selection' || v === 'canvas' ? v : 'auto'; e.emit('options', null); }, when: () => !e.transformEdit },
      ...(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const).map((k): OptionSpec => ({ kind: 'button', label: `Align ${ALIGN_NAMES[k]}`, icon: `align${k[0].toUpperCase()}${k.slice(1)}Edge`, run: () => e.alignLayers(k), when: () => !e.transformEdit, compact: true })),
      ...(['hspace', 'vspace'] as const).map((k): OptionSpec => ({ kind: 'button', label: k === 'hspace' ? 'Distribute Horizontal Spacing' : 'Distribute Vertical Spacing', icon: k === 'hspace' ? 'distributeH' : 'distributeV', run: () => e.distributeLayers(k), when: () => !e.transformEdit, compact: true })),
      { kind: 'toggle', label: 'Keep proportions', priority: 60, get: () => e.lockRatio, set: (v) => e.update({ lockRatio: v }), when: editing },
      { kind: 'select', label: 'Reference point', priority: 78, choices: REFERENCE_POINTS.map(([x, y, label]) => ({ id: `${x}:${y}`, label })), get: () => `${e.transformRef.x}:${e.transformRef.y}`, set: (v: string) => { const [x, y] = v.split(':').map(Number); e.setTransformRef(x, y); }, when: () => editing() || !!e.distortEdit },
      { kind: 'number', label: 'X', priority: 80, get: () => e.transformRefPoint()?.x ?? null, set: (v) => e.setTransformRefPoint('x', v), when: editing },
      { kind: 'number', label: 'Y', priority: 80, get: () => e.transformRefPoint()?.y ?? null, set: (v) => e.setTransformRefPoint('y', v), when: editing },
      { kind: 'number', label: 'W', priority: 80, min: 1, get: () => t()?.w ?? null, set: (v) => e.resizeLayerTo(v, true), when: editing },
      { kind: 'number', label: 'H', priority: 80, min: 1, get: () => t()?.h ?? null, set: (v) => e.resizeLayerTo(v, false), when: editing },
      { kind: 'number', label: 'Scale', priority: 75, unit: '%', min: 1, get: () => { const l = e.activeLayer, tt = t(); return e.anyTransformPending ? e.pendingScalePercent : l?.raster && tt ? (tt.w / l.raster.width) * 100 : null; }, set: (v) => e.scaleLayerTo(v), when: editing },
      { kind: 'button', label: 'Apply transform', priority: 95, run: () => e.applyPendingTransform(), when: () => e.anyTransformPending },
      { kind: 'button', label: 'Cancel transform', priority: 92, run: () => e.cancelPendingTransform(), when: () => e.anyTransformPending },
      { kind: 'number', label: 'Angle', priority: 75, unit: '\u00b0', get: () => t()?.rotation ?? null, set: (v) => e.setLayerTransformAbout({ rotation: v }, 'Rotate Layer'), when: editing },
      { kind: 'number', label: 'Skew H', priority: 60, unit: '\u00b0', min: -88, max: 88, get: () => e.distortEdit?.skew?.h ?? 0, set: (v) => { e.skewBox('h', v); }, when: () => (editing() && !e.pathTransform) || !!e.distortEdit },
      { kind: 'number', label: 'Skew V', priority: 60, unit: '\u00b0', min: -88, max: 88, get: () => e.distortEdit?.skew?.v ?? 0, set: (v) => { e.skewBox('v', v); }, when: () => (editing() && !e.pathTransform) || !!e.distortEdit },
      { kind: 'segment', label: 'Interpolation', priority: 50, choices: [{ id: 'nearest', label: 'Nearest neighbor' }, { id: 'smooth', label: 'Bilinear' }, { id: 'high', label: 'Bicubic' }], get: () => t()?.sampling ?? 'high', set: (v) => e.setLayerTransform({ sampling: v as Transform['sampling'] }), when: editing },
      { kind: 'select', label: 'Warp grid', priority: 30, choices: [3, 4, 5, 6].map((n) => ({ id: String(n), label: `${n} x ${n}` })), get: () => String(e.meshWarpGrid), set: (v: string) => { e.meshWarpGrid = Number(v) || 4; e.emit('options', null); }, when: editing },
      { kind: 'select', label: 'Warp style', priority: 70, choices: [{ id: 'custom', label: 'Custom' }, ...WARP_STYLES.map(([id, label]) => ({ id, label }))], get: () => e.meshWarpPreset.style, set: (v: string) => { e.setMeshWarpPreset({ style: v as WarpStyle | 'custom' }); }, when: () => !!e.meshWarpEdit },
      { kind: 'segment', label: 'Warp direction', priority: 40, choices: [{ id: 'horizontal', label: 'Horizontal' }, { id: 'vertical', label: 'Vertical' }], get: () => e.meshWarpPreset.orientation, set: (v: string) => { e.setMeshWarpPreset({ orientation: v === 'vertical' ? 'vertical' : 'horizontal' }); }, when: () => !!e.meshWarpEdit && e.meshWarpPreset.style !== 'custom' },
      { kind: 'number', label: 'Bend', priority: 65, unit: '%', min: -100, max: 100, get: () => e.meshWarpPreset.bend, set: (v) => { e.setMeshWarpPreset({ bend: Math.max(-100, Math.min(100, v)) }); }, when: () => !!e.meshWarpEdit && e.meshWarpPreset.style !== 'custom' },
      { kind: 'number', label: 'Horizontal distortion', priority: 45, unit: '%', min: -100, max: 100, get: () => e.meshWarpPreset.horizontal, set: (v) => { e.setMeshWarpPreset({ horizontal: Math.max(-100, Math.min(100, v)) }); }, when: () => !!e.meshWarpEdit && e.meshWarpPreset.style !== 'custom' },
      { kind: 'number', label: 'Vertical distortion', priority: 45, unit: '%', min: -100, max: 100, get: () => e.meshWarpPreset.vertical, set: (v) => { e.setMeshWarpPreset({ vertical: Math.max(-100, Math.min(100, v)) }); }, when: () => !!e.meshWarpEdit && e.meshWarpPreset.style !== 'custom' },
      { kind: 'select', label: 'Puppet mode', priority: 75, choices: [{ id: 'rigid', label: 'Rigid' }, { id: 'normal', label: 'Normal' }, { id: 'distort', label: 'Distort' }], get: () => e.puppetOpts.mode, set: (v: string) => e.setPuppetOpts({ mode: v === 'normal' || v === 'distort' ? v : 'rigid' }), when: () => !!e.puppetEdit },
      { kind: 'select', label: 'Puppet density', priority: 55, choices: [{ id: 'fewer', label: 'Fewer points' }, { id: 'normal', label: 'Normal' }, { id: 'more', label: 'More points' }], get: () => e.puppetOpts.density, set: (v: string) => e.setPuppetOpts({ density: v === 'fewer' || v === 'more' ? v : 'normal' }), when: () => !!e.puppetEdit },
      { kind: 'number', label: 'Expansion', priority: 55, unit: 'px', min: -40, max: 40, get: () => e.puppetOpts.expansion, set: (v) => e.setPuppetOpts({ expansion: v }), when: () => !!e.puppetEdit },
      { kind: 'toggle', label: 'Show mesh', priority: 60, get: () => e.puppetOpts.showMesh, set: (v) => e.setPuppetOpts({ showMesh: v }), when: () => !!e.puppetEdit },
      { kind: 'number', label: 'Pin rotation', priority: 50, unit: '°', min: -180, max: 180, get: () => { const w = e.puppetEdit; return w && w.sel >= 0 ? w.rot[w.sel] : null; }, set: (v) => e.setPuppetPin({ rot: v }), when: () => !!e.puppetEdit && e.puppetEdit.sel >= 0 },
      { kind: 'number', label: 'Pin depth', priority: 50, min: -10, max: 10, get: () => { const w = e.puppetEdit; return w && w.sel >= 0 ? w.depth[w.sel] : null; }, set: (v) => e.setPuppetPin({ depth: v }), when: () => !!e.puppetEdit && e.puppetEdit.sel >= 0 },
      { kind: 'button', label: 'Flip horizontal', priority: 40, icon: 'flipH', run: () => e.flipLayers(true), when: editing },
      { kind: 'button', label: 'Flip vertical', priority: 40, icon: 'flipV', run: () => e.flipLayers(false), when: editing },
      { kind: 'segment', label: 'Perspective Warp', priority: 70, choices: [{ id: 'layout', label: 'Layout' }, { id: 'warp', label: 'Warp' }], get: () => e.perspectiveEdit?.phase ?? 'layout', set: (v) => e.setPerspectivePhase(v as 'layout' | 'warp'), when: () => !!e.perspectiveEdit },
      { kind: 'button', label: 'Straighten verticals', priority: 40, run: () => e.straightenPerspective(true), when: () => e.perspectiveEdit?.phase === 'warp' },
      { kind: 'button', label: 'Level horizontals', priority: 40, run: () => e.straightenPerspective(false), when: () => e.perspectiveEdit?.phase === 'warp' },
      { kind: 'button', label: 'Auto straighten', priority: 42, run: () => e.straightenPerspective(null), when: () => e.perspectiveEdit?.phase === 'warp' },
      { kind: 'button', label: 'Apply', priority: 90, run: () => e.applyPerspectiveWarp(), when: () => !!e.perspectiveEdit },
      { kind: 'button', label: 'Cancel', priority: 85, run: () => e.cancelPerspectiveWarp(), when: () => !!e.perspectiveEdit },
    ];
  },
};

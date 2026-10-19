import { HANDLES, hierarchy, transformBounds, type Engine, type Pt, type Rect } from '../../engine';
import { type Tool, type ToolContext, type ToolPointer } from '../registry';
import { CROP_OVERLAYS, ORIENTED, overlayLines, type CropOverlay } from './crop-overlays';

/** The aspect choices in the options bar; a value is width over height, null leaves the frame free. */
const RATIOS: ReadonlyArray<{ id: string; label: string; value: number | 'original' | null }> = [
  { id: 'free', label: 'Free', value: null },
  { id: 'original', label: 'Original', value: 'original' },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '3:2', label: '3:2', value: 3 / 2 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '3:4', label: '3:4', value: 3 / 4 },
  { id: '2:3', label: '2:3', value: 2 / 3 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
  { id: 'size', label: 'W × H × Res', value: null },
];
/** The id of the ratio in force. */
let ratioId = 'free';
/** W × H × Resolution, as the Crop menu has it: the size the crop is resampled to, in a unit, at a resolution
 *  in ppi (inches and centimetres become pixels through it). Saved crop presets live on this device. */
type SizeUnit = 'px' | 'in' | 'cm';
const size: { w: number; h: number; unit: SizeUnit; res: number } = { w: 0, h: 0, unit: 'px', res: 72 };
interface CropPreset { id: string; w: number; h: number; unit: SizeUnit; res: number }
const PRESETS_KEY = 'formvis.cropPresets';
let presetId = '';
const toPx = (v: number): number => (size.unit === 'in' ? v * size.res : size.unit === 'cm' ? (v * size.res) / 2.54 : v);
function sizePx(): { w: number; h: number } | null {
  const w = Math.round(toPx(size.w)), h = Math.round(toPx(size.h));
  return w >= 1 && h >= 1 && w <= 30000 && h <= 30000 ? { w, h } : null;
}
function loadPresets(): CropPreset[] {
  try {
    const a: unknown = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]');
    return Array.isArray(a) ? a.filter((p): p is CropPreset => !!p && typeof p.id === 'string' && [p.w, p.h, p.res].every((n) => typeof n === 'number' && n > 0) && ['px', 'in', 'cm'].includes(p.unit)).slice(0, 100) : [];
  } catch { return []; }
}
const savePresets = (list: CropPreset[]): void => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list)); } catch { /* this session only */ } };
const presetLabel = (p: CropPreset): string => `${p.w} × ${p.h} ${p.unit}${p.unit === 'px' ? '' : ` at ${p.res} ppi`}`;
/** Front Image: the current document's size and resolution. */
function frontImage(e: Engine): void {
  const d = e.current?.doc;
  if (!d) return;
  Object.assign(size, { w: d.width, h: d.height, unit: 'px' as SizeUnit, res: d.resolution ?? 72 });
  presetId = '';
}
/** A size field changed: the open frame takes the new ratio about its centre, as choosing a ratio does. */
function sizeChanged(e: Engine): void {
  const ratio = ratioOf(e);
  if (frame && ratio) { const f = norm(frame), cx = f.x + f.w / 2, cy = f.y + f.h / 2; const w = Math.min(f.w, f.h * ratio), h = w / ratio; frame = whole({ x: cx - w / 2, y: cy - h / 2, w, h }); }
  e.emit('options', null);
  e.emit('overlay', null);
}
/** The crop rectangle in document coordinates, or null while none is open. */
let frame: Rect | null = null;
/** The gesture in progress: what it does, which handle it holds, where the pointer went down and the frame then. */
let drag: { mode: 'create' | 'move' | 'resize'; handle: number; start: Pt; origin: Rect } | null = null;
/** Straighten: degrees the image turns about the frame's centre on commit; `leveling` arms a drag that measures a
 *  line meant to be level (or plumb) and sets the angle from it. Content-Aware fills what the turn or a frame past
 *  the canvas opens. */
let angle = 0;
let contentAware = false;
/** The composition overlay drawn in the frame, and its orientation for Triangle and Golden Spiral. */
let overlayKind: CropOverlay = 'thirds';
let overlayOrient = 0;
let leveling = false;
let line: { a: Pt; b: Pt } | null = null;
/** Perspective: the frame's four corners move independently (top-left, top-right, bottom-right, bottom-left). */
let perspective = false;
let quad: Pt[] | null = null;
let cornerDrag = -1;
const quadOf = (r: Rect): Pt[] => { const n = norm(r); return [{ x: n.x, y: n.y }, { x: n.x + n.w, y: n.y }, { x: n.x + n.w, y: n.y + n.h }, { x: n.x, y: n.y + n.h }]; };
function hitCorner(ctx: ToolContext, p: ToolPointer): number {
  if (!quad) return -1;
  const v = ctx.view();
  return quad.findIndex((c) => { const s = v.toScreen(c); return Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= 9; });
}

/** The turn that makes the line from a to b level, or plumb when it is nearer vertical, within -45 to 45 degrees. */
export function levelAngle(a: Pt, b: Pt): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return -(((deg + 45) % 90 + 90) % 90 - 45);
}

/** The width over height the frame keeps, or null when it is free. */
function ratioOf(e: Engine): number | null {
  if (ratioId === 'size') { const px = sizePx(); return px ? px.w / px.h : null; }
  const v = RATIOS.find((r) => r.id === ratioId)?.value ?? null;
  if (v === 'original') { const d = e.current?.doc; return d ? d.width / d.height : null; }
  return v;
}
/** The same area with a non-negative width and height. */
function norm(r: Rect): Rect {
  return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
}
/** The normalised rectangle with every edge on a whole pixel, at least one pixel each way. */
function whole(r: Rect): Rect {
  const n = norm(r);
  const x0 = Math.round(n.x), y0 = Math.round(n.y), x1 = Math.round(n.x + n.w), y1 = Math.round(n.y + n.h);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** The frame dragged from a to b; a ratio makes the short side grow to match, and symmetric makes a the centre. */
function create(a: Pt, b: Pt, ratio: number | null, symmetric: boolean): Rect {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (ratio) {
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax / ratio > ay) ay = ax / ratio; else ax = ay * ratio;
    dx = sx * ax;
    dy = sy * ay;
  }
  return symmetric ? norm({ x: a.x - dx, y: a.y - dy, w: dx * 2, h: dy * 2 }) : norm({ x: a.x, y: a.y, w: dx, h: dy });
}

/** The frame o with the edges of a handle moved to p (mirrored about the centre when symmetric), then held to a ratio. */
function resize(o: Rect, handle: number, p: Pt, ratio: number | null, symmetric: boolean): Rect {
  const h = HANDLES[handle];
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  let l = o.x, t = o.y, r = o.x + o.w, b = o.y + o.h;
  if (h.x === 0) { l = p.x; if (symmetric) r = cx * 2 - p.x; }
  else if (h.x === 1) { r = p.x; if (symmetric) l = cx * 2 - p.x; }
  if (h.y === 0) { t = p.y; if (symmetric) b = cy * 2 - p.y; }
  else if (h.y === 1) { b = p.y; if (symmetric) t = cy * 2 - p.y; }
  let out = norm({ x: l, y: t, w: r - l, h: b - t });
  if (ratio) {
    if (h.x !== 0.5 && h.y !== 0.5) {
      const nh = out.w / ratio;
      out = { x: out.x, y: h.y === 0 ? o.y + o.h - nh : o.y, w: out.w, h: nh };
    } else if (h.x === 0.5) {
      const nw = out.h * ratio;
      out = { x: cx - nw / 2, y: out.y, w: nw, h: out.h };
    } else {
      const nh = out.w / ratio;
      out = { x: out.x, y: cy - nh / 2, w: out.w, h: nh };
    }
  }
  return out;
}

/** The edges the frame snaps to: the canvas edges and the edges of every visible layer that has pixels. */
function snapTargets(ctx: ToolContext): { xs: number[]; ys: number[] } {
  const xs: number[] = [], ys: number[] = [];
  const d = ctx.engine.current?.doc;
  if (!d) return { xs, ys };
  xs.push(0, d.width);
  ys.push(0, d.height);
  for (const row of hierarchy(d)) {
    if (!row.visible || !row.layer.raster) continue;
    const b = transformBounds(row.layer.transform);
    xs.push(Math.round(b.x), Math.round(b.x + b.w));
    ys.push(Math.round(b.y), Math.round(b.y + b.h));
  }
  return { xs, ys };
}

const nearest = (v: number, targets: number[], tol: number): number | null => {
  let best: number | null = null, bd = tol;
  for (const t of targets) { const d = Math.abs(t - v); if (d <= bd) { best = t; bd = d; } }
  return best;
};

/** Pulls the frame onto the canvas and layer edges, within 8 screen points. Moving keeps the size; with a fixed ratio
 *  nothing else snaps; creating or resizing moves only the edge nearer the pointer on each axis the gesture changes. */
function snap(ctx: ToolContext, r: Rect, mode: 'create' | 'move' | 'resize', handle: number, point: Pt, ratio: number | null): Rect {
  const tol = 8 / Math.max(0.01, ctx.view().zoom);
  const { xs, ys } = snapTargets(ctx);
  const offset = (edges: number[], targets: number[]): number => {
    let best = 0, bd = Infinity;
    for (const e of edges) {
      const s = nearest(e, targets, tol);
      if (s !== null && Math.abs(s - e) < bd) { best = s - e; bd = Math.abs(s - e); }
    }
    return best;
  };
  if (mode === 'move') return { x: r.x + offset([r.x, r.x + r.w], xs), y: r.y + offset([r.y, r.y + r.h], ys), w: r.w, h: r.h };
  if (ratio) return r;
  const hd = mode === 'resize' ? HANDLES[handle] : null;
  let l = r.x, rt = r.x + r.w, t = r.y, b = r.y + r.h;
  if (!hd || hd.x !== 0.5) {
    if (Math.abs(point.x - l) <= Math.abs(point.x - rt)) { const s = nearest(l, xs, tol); if (s !== null && s < rt) l = s; }
    else { const s = nearest(rt, xs, tol); if (s !== null && s > l) rt = s; }
  }
  if (!hd || hd.y !== 0.5) {
    if (Math.abs(point.y - t) <= Math.abs(point.y - b)) { const s = nearest(t, ys, tol); if (s !== null && s < b) t = s; }
    else { const s = nearest(b, ys, tol); if (s !== null && s > t) b = s; }
  }
  return { x: l, y: t, w: rt - l, h: b - t };
}

/** The index of the frame's handle within 8 screen points of the pointer, or -1. */
function hitHandle(ctx: ToolContext, p: ToolPointer): number {
  if (!frame) return -1;
  const v = ctx.view(), f = norm(frame);
  return HANDLES.findIndex((h) => { const s = v.toScreen({ x: f.x + f.w * h.x, y: f.y + f.h * h.y }); return Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= 8; });
}
const inside = (r: Rect, p: Pt): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Crops to the open frame. */
function commit(e: Engine): void {
  if (perspective && quad) {
    const q = quad;
    quad = null; frame = null; drag = null; cornerDrag = -1;
    e.perspectiveCrop(q);
    e.emit('overlay', null);
    e.emit('options', null);
    return;
  }
  if (!frame) return;
  const r = whole(frame);
  frame = null;
  drag = null;
  const px = ratioId === 'size' ? sizePx() : null;
  if (px) e.cropToSize(r, angle, contentAware, px.w, px.h, size.res);
  else e.straightenCrop(r, angle, contentAware);
  angle = 0;
  e.emit('overlay', null);
  e.emit('options', null);
}

export const cropTool: Tool = {
  id: 'crop', label: 'Crop', key: 'C', order: 45,
  icon: () => 'tCrop',
  hint: () => 'Drag a frame · Drag inside to move it · Handles resize · Alt keeps the centre · Edges snap to the canvas and layer edges · Enter crops · Escape cancels',
  cursor(ctx, p) {
    if (!p || !frame) return 'crosshair';
    const h = hitHandle(ctx, p);
    if (h >= 0) return h === 1 || h === 5 ? 'ns-resize' : h === 3 || h === 7 ? 'ew-resize' : h === 0 || h === 4 ? 'nwse-resize' : 'nesw-resize';
    return inside(norm(frame), p.doc) ? 'move' : 'crosshair';
  },
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    if (leveling) { line = { a: p.doc, b: p.doc }; ctx.engine.emit('overlay', null); return; }
    if (perspective && quad) { cornerDrag = hitCorner(ctx, p); if (cornerDrag >= 0) return; quad = null; }
    const h = hitHandle(ctx, p);
    if (frame && h >= 0) drag = { mode: 'resize', handle: h, start: p.doc, origin: norm(frame) };
    else if (frame && inside(norm(frame), p.doc)) drag = { mode: 'move', handle: -1, start: p.doc, origin: norm(frame) };
    else { drag = { mode: 'create', handle: -1, start: p.doc, origin: { x: p.doc.x, y: p.doc.y, w: 0, h: 0 } }; frame = null; }
    ctx.engine.emit('overlay', null);
  },
  move(ctx, p) {
    if (line) { line.b = p.doc; ctx.engine.emit('overlay', null); return; }
    if (cornerDrag >= 0 && quad) { quad[cornerDrag] = { x: p.doc.x, y: p.doc.y }; ctx.engine.emit('overlay', null); return; }
    if (!drag) return;
    const ratio = ratioOf(ctx.engine);
    let r: Rect;
    if (drag.mode === 'create') r = create(drag.start, p.doc, ratio, p.alt);
    else if (drag.mode === 'move') r = { x: drag.origin.x + p.doc.x - drag.start.x, y: drag.origin.y + p.doc.y - drag.start.y, w: drag.origin.w, h: drag.origin.h };
    else r = resize(drag.origin, drag.handle, p.doc, ratio, p.alt);
    frame = snap(ctx, norm(r), drag.mode, drag.handle, p.doc, ratio);
    ctx.engine.emit('overlay', null);
    ctx.engine.emit('options', null);
  },
  up(ctx) {
    if (line) {
      const l = line, d = ctx.engine.current?.doc;
      line = null;
      leveling = false;
      if (Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) >= 4) { angle = levelAngle(l.a, l.b); if (!frame && d) frame = { x: 0, y: 0, w: d.width, h: d.height }; }
      ctx.engine.emit('overlay', null);
      ctx.engine.emit('options', null);
      return;
    }
    if (cornerDrag >= 0) { cornerDrag = -1; ctx.engine.emit('overlay', null); return; }
    if (!drag) return;
    drag = null;
    if (frame) { const f = norm(frame); frame = f.w < 1 || f.h < 1 ? null : whole(f); }
    if (perspective && frame) quad = quadOf(frame);
    ctx.engine.emit('overlay', null);
    ctx.engine.emit('options', null);
  },
  keydown(ctx, e) {
    if (e.key === 'Enter' && (frame || quad)) { commit(ctx.engine); return true; }
    // With a frame showing, O cycles the overlays and Shift+O flips Triangle and Golden Spiral; with
    // none, O is left to pick the Dodge group as usual.
    if ((e.key === 'o' || e.key === 'O') && frame && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.shiftKey) { if (ORIENTED.has(overlayKind)) overlayOrient = (overlayOrient + 1) % 4; }
      else overlayKind = CROP_OVERLAYS[(CROP_OVERLAYS.findIndex((o) => o.id === overlayKind) + 1) % CROP_OVERLAYS.length].id;
      ctx.engine.emit('options', null);
      ctx.engine.emit('overlay', null);
      return true;
    }
    if (e.key === 'Escape' && (frame || quad || leveling)) { frame = null; quad = null; cornerDrag = -1; drag = null; line = null; leveling = false; angle = 0; ctx.engine.emit('overlay', null); ctx.engine.emit('options', null); return true; }
    return false;
  },
  cancel(ctx) { drag = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    if (perspective && quad) {
      const v = ctx.view(), pal = ctx.paint(), s = quad.map((c) => v.toScreen(c));
      g.save();
      g.fillStyle = 'rgba(0, 0, 0, 0.45)';
      g.beginPath(); g.rect(0, 0, v.width, v.height); s.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill('evenodd');
      g.strokeStyle = pal.accent; g.lineWidth = 1; g.beginPath(); s.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.stroke();
      g.fillStyle = pal.handle;
      for (const q of s) { g.fillRect(Math.round(q.x) - 4, Math.round(q.y) - 4, 8, 8); g.strokeRect(Math.round(q.x) - 3.5, Math.round(q.y) - 3.5, 7, 7); }
      g.restore();
      return;
    }
    if (line) {
      const v = ctx.view(), pal = ctx.paint(), a = v.toScreen(line.a), b = v.toScreen(line.b);
      g.save(); g.strokeStyle = pal.accent; g.lineWidth = 1.5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.restore();
    }
    if (!frame) return;
    if (angle) {
      const v = ctx.view(), pal = ctx.paint(), f = norm(frame), cx = f.x + f.w / 2, cy = f.y + f.h / 2, t = (-angle * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
      const q = [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]].map(([x, y]) => v.toScreen({ x: cx + (x - cx) * cs - (y - cy) * sn, y: cy + (x - cx) * sn + (y - cy) * cs }));
      g.save(); g.strokeStyle = pal.accent; g.setLineDash([5, 4]); g.beginPath(); q.forEach((s, i) => (i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y))); g.closePath(); g.stroke(); g.restore();
    }
    const v = ctx.view(), pal = ctx.paint(), f = norm(frame);
    const a = v.toScreen({ x: f.x, y: f.y }), b = v.toScreen({ x: f.x + f.w, y: f.y + f.h });
    g.save();
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.beginPath(); g.rect(0, 0, v.width, v.height); g.rect(a.x, a.y, b.x - a.x, b.y - a.y); g.fill('evenodd');
    g.strokeStyle = pal.antsB;
    g.globalAlpha = 0.5;
    g.beginPath();
    for (const pts of overlayLines(overlayKind, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y), overlayOrient)) {
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    }
    g.stroke();
    g.globalAlpha = 1;
    g.strokeStyle = pal.accent;
    g.lineWidth = 1;
    g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x) - Math.round(a.x), Math.round(b.y) - Math.round(a.y));
    g.fillStyle = pal.handle;
    for (const h of HANDLES) {
      const x = Math.round(a.x + (b.x - a.x) * h.x), y = Math.round(a.y + (b.y - a.y) * h.y);
      g.fillRect(x - 4, y - 4, 8, 8);
      g.strokeRect(x - 3.5, y - 3.5, 7, 7);
    }
    g.restore();
  },
  options: (e) => [
    { kind: 'title', text: 'Crop' },
    { kind: 'segment', label: 'Ratio', priority: 90, choices: RATIOS.map((r) => ({ id: r.id, label: r.label })), get: () => ratioId, set: (id: string) => {
      ratioId = id;
      if (id === 'size' && !sizePx()) frontImage(e);
      const ratio = ratioOf(e);
      if (ratio && frame) { const f = norm(frame), cx = f.x + f.w / 2, cy = f.y + f.h / 2, w = Math.min(f.w, f.h * ratio), h = w / ratio; frame = whole({ x: cx - w / 2, y: cy - h / 2, w, h }); }
      e.emit('options', null);
      e.emit('overlay', null);
    } },
    { kind: 'number', label: 'W', priority: 80, min: 0, max: 30000, step: 0.01, get: () => size.w, set: (v: number) => { size.w = Math.max(0, v); presetId = ''; sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'number', label: 'H', priority: 80, min: 0, max: 30000, step: 0.01, get: () => size.h, set: (v: number) => { size.h = Math.max(0, v); presetId = ''; sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'segment', label: 'Unit', priority: 70, choices: [{ id: 'px', label: 'px' }, { id: 'in', label: 'in' }, { id: 'cm', label: 'cm' }], get: () => size.unit, set: (v: string) => { size.unit = v as SizeUnit; presetId = ''; sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'number', label: 'Resolution', priority: 65, min: 1, max: 9600, unit: 'ppi', get: () => size.res, set: (v: number) => { size.res = Math.max(1, Math.min(9600, v)); presetId = ''; sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'button', label: 'Front Image', priority: 30, run: () => { frontImage(e); sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'select', label: 'Preset', priority: 45, choices: [{ id: '', label: 'Custom' }], live: () => [{ id: '', label: 'Custom' }, ...loadPresets().map((p) => ({ id: p.id, label: presetLabel(p) }))], get: () => presetId,
      set: (v: string) => { const p = loadPresets().find((x) => x.id === v); presetId = p ? p.id : ''; if (p) { Object.assign(size, { w: p.w, h: p.h, unit: p.unit, res: p.res }); } sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'button', label: 'New Crop Preset', run: () => {
      if (!sizePx()) { e.notice('Enter a width and height first.'); return; }
      const list = loadPresets(), p: CropPreset = { id: `p${Date.now().toString(36)}`, w: size.w, h: size.h, unit: size.unit, res: size.res };
      if (!list.some((x) => x.w === p.w && x.h === p.h && x.unit === p.unit && x.res === p.res)) { savePresets([...list, p]); presetId = p.id; }
      e.emit('options', null);
    }, when: () => ratioId === 'size' },
    { kind: 'button', label: 'Delete Crop Preset', run: () => {
      if (!presetId) { e.notice('Choose a saved preset to delete.'); return; }
      savePresets(loadPresets().filter((x) => x.id !== presetId));
      presetId = '';
      e.emit('options', null);
    }, when: () => ratioId === 'size' },
    { kind: 'readout', label: 'Size', priority: 50, get: () => (frame ? `${Math.round(Math.abs(frame.w))} × ${Math.round(Math.abs(frame.h))}` : '') },
    { kind: 'range', label: 'Straighten', priority: 60, min: -45, max: 45, step: 0.1, unit: '°', get: () => Math.round(angle * 10) / 10, set: (v) => { angle = v; const d = e.current?.doc; if (angle && !frame && d) frame = { x: 0, y: 0, w: d.width, h: d.height }; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'button', label: 'Level line', priority: 35, icon: 'rotate', run: () => { leveling = true; e.emit('tool', null); e.emit('options', null); } },
    { kind: 'select', label: 'Overlay', priority: 55, choices: CROP_OVERLAYS, get: () => overlayKind, set: (v: string) => { overlayKind = (CROP_OVERLAYS.find((o) => o.id === v)?.id ?? 'thirds'); e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'toggle', label: 'Delete Cropped Pixels', priority: 45, get: () => e.cropDeletePixels, set: (v) => { e.cropDeletePixels = v; e.emit('options', null); } },
    { kind: 'toggle', label: 'Content-Aware', priority: 40, get: () => contentAware, set: (v) => { contentAware = v; e.emit('options', null); } },
    { kind: 'toggle', label: 'Perspective', priority: 40, get: () => perspective, set: (v) => { perspective = v; quad = v && frame ? quadOf(frame) : null; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'button', label: 'Crop', priority: 100, icon: 'check', run: () => commit(e) },
    { kind: 'button', label: 'Cancel', priority: 92, icon: 'close', run: () => { frame = null; quad = null; cornerDrag = -1; drag = null; line = null; leveling = false; angle = 0; e.emit('overlay', null); e.emit('options', null); } },
  ],
};

import { HANDLES, hierarchy, transformBounds, type Engine, type Pt, type Rect } from '../../engine';
import type { Tool, ToolContext, ToolPointer } from '../registry';
import { CROP_OVERLAYS, ORIENTED, overlayLines, type CropOverlay } from './crop-overlays';

const RATIOS: ReadonlyArray<{ id: string; label: string; value: number | 'original' | null }> = [
  { id: 'free', label: 'Free', value: null }, { id: 'original', label: 'Original', value: 'original' }, { id: '1:1', label: '1:1', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 }, { id: '3:2', label: '3:2', value: 3 / 2 }, { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '3:4', label: '3:4', value: 3 / 4 }, { id: '2:3', label: '2:3', value: 2 / 3 }, { id: '9:16', label: '9:16', value: 9 / 16 },
  { id: 'size', label: 'W × H × Res', value: null },
];
let ratioId = 'free';
/** W × H × Resolution, as Photoshop's Crop menu has it: the size the crop is resampled to, in a unit, at a resolution
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
let frame: Rect | null = null;
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

function ratioOf(e: Engine): number | null {
  if (ratioId === 'size') { const px = sizePx(); return px ? px.w / px.h : null; }
  const v = RATIOS.find((r) => r.id === ratioId)?.value ?? null;
  if (v !== 'original') return v;
  const d = e.current?.doc;
  return d ? d.width / d.height : null;
}
const norm = (r: Rect): Rect => ({ x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) });
function whole(r: Rect): Rect {
  const n = norm(r), x = Math.round(n.x), y = Math.round(n.y);
  return { x, y, w: Math.max(1, Math.round(n.x + n.w) - x), h: Math.max(1, Math.round(n.y + n.h) - y) };
}

function create(a: Pt, b: Pt, ratio: number | null, symmetric: boolean): Rect {
  let w = b.x - a.x, h = b.y - a.y;
  if (ratio) {
    const sw = Math.sign(w) || 1, sh = Math.sign(h) || 1;
    if (Math.abs(w) / Math.max(Math.abs(h), 1e-6) > ratio) h = (sh * Math.abs(w)) / ratio;
    else w = sw * Math.abs(h) * ratio;
  }
  return symmetric ? { x: a.x - w, y: a.y - h, w: 2 * w, h: 2 * h } : { x: a.x, y: a.y, w, h };
}

function resize(o: Rect, handle: number, p: Pt, ratio: number | null, symmetric: boolean): Rect {
  const hd = HANDLES[handle];
  let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  if (hd.x === 0) x0 = p.x;
  if (hd.x === 1) x1 = p.x;
  if (hd.y === 0) y0 = p.y;
  if (hd.y === 1) y1 = p.y;
  if (symmetric) {
    if (hd.x === 0) x1 = 2 * cx - x0;
    if (hd.x === 1) x0 = 2 * cx - x1;
    if (hd.y === 0) y1 = 2 * cy - y0;
    if (hd.y === 1) y0 = 2 * cy - y1;
  }
  const n = norm({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  if (!ratio) return n;
  if (hd.x !== 0.5 && hd.y !== 0.5) { const h = n.w / ratio; return { x: n.x, y: hd.y === 0 ? n.y + n.h - h : n.y, w: n.w, h }; }
  if (hd.x === 0.5) { const w = n.h * ratio; return { x: n.x + n.w / 2 - w / 2, y: n.y, w, h: n.h }; }
  const h = n.w / ratio;
  return { x: n.x, y: n.y + n.h / 2 - h / 2, w: n.w, h };
}

/** the canvas edges and the rounded bounds of every visible pixel layer. */
function snapTargets(ctx: ToolContext): { xs: number[]; ys: number[] } {
  const d = ctx.engine.current?.doc;
  if (!d) return { xs: [], ys: [] };
  const xs = [0, d.width], ys = [0, d.height];
  for (const e of hierarchy(d)) {
    const l = e.layer;
    if (!e.visible || l.isGroup || !l.raster) continue;
    const b = transformBounds(l.transform);
    xs.push(Math.round(b.x), Math.round(b.x + b.w));
    ys.push(Math.round(b.y), Math.round(b.y + b.h));
  }
  return { xs, ys };
}

const nearest = (v: number, targets: number[], tol: number): number | null => {
  let best: number | null = null;
  for (const t of targets) if (Math.abs(t - v) <= tol && (best === null || Math.abs(t - v) < Math.abs(best - v))) best = t;
  return best;
};

/** the CropSnap.apply (8 screen points): moving snaps the closest edges and keeps the size; creating or
 *  resizing snaps only the edge on the pointer's side; with a fixed ratio only moves snap. */
function snap(ctx: ToolContext, r: Rect, mode: 'create' | 'move' | 'resize', handle: number, point: Pt, ratio: number | null): Rect {
  const { xs, ys } = snapTargets(ctx), tol = 8 / ctx.view().zoom, n = norm(r);
  if (mode === 'move') {
    const shift = (edges: number[], targets: number[]): number => {
      const deltas = edges.map((e) => { const t = nearest(e, targets, tol); return t === null ? null : t - e; }).filter((v): v is number => v !== null);
      return deltas.length ? deltas.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a)) : 0;
    };
    return { ...n, x: n.x + shift([n.x, n.x + n.w], xs), y: n.y + shift([n.y, n.y + n.h], ys) };
  }
  if (ratio) return n;
  const horizontal = mode === 'create' || HANDLES[handle].x !== 0.5, vertical = mode === 'create' || HANDLES[handle].y !== 0.5;
  let { x, y, w, h } = n;
  if (horizontal) {
    if (Math.abs(point.x - x) <= Math.abs(point.x - (x + w))) { const t = nearest(x, xs, tol); if (t !== null && t < x + w) { w = x + w - t; x = t; } }
    else { const t = nearest(x + w, xs, tol); if (t !== null && t > x) w = t - x; }
  }
  if (vertical) {
    if (Math.abs(point.y - y) <= Math.abs(point.y - (y + h))) { const t = nearest(y, ys, tol); if (t !== null && t < y + h) { h = y + h - t; y = t; } }
    else { const t = nearest(y + h, ys, tol); if (t !== null && t > y) h = t - y; }
  }
  return { x, y, w, h };
}

function hitHandle(ctx: ToolContext, p: ToolPointer): number {
  if (!frame) return -1;
  const f = norm(frame), v = ctx.view();
  return HANDLES.findIndex((hd) => { const s = v.toScreen({ x: f.x + f.w * hd.x, y: f.y + f.h * hd.y }); return Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= 8; });
}
const inside = (r: Rect, p: Pt): boolean => { const n = norm(r); return p.x >= n.x && p.y >= n.y && p.x <= n.x + n.w && p.y <= n.y + n.h; };

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
  hint: () => 'Drag a frame · Drag inside to move it · Handles resize · Alt keeps the center · Edges snap to the canvas and layer edges · Enter crops · Escape cancels',
  cursor(ctx, p) {
    if (!p || !frame) return 'crosshair';
    const h = hitHandle(ctx, p);
    if (h >= 0) { const hd = HANDLES[h]; return hd.x === 0.5 ? 'ns-resize' : hd.y === 0.5 ? 'ew-resize' : (hd.x === hd.y ? 'nwse-resize' : 'nesw-resize'); }
    return inside(frame, p.doc) ? 'move' : 'crosshair';
  },
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    if (leveling) { line = { a: p.doc, b: p.doc }; ctx.engine.emit('overlay', null); return; }
    if (perspective && quad) { cornerDrag = hitCorner(ctx, p); if (cornerDrag >= 0) return; quad = null; }
    const h = hitHandle(ctx, p);
    if (frame && h >= 0) drag = { mode: 'resize', handle: h, start: p.doc, origin: norm(frame) };
    else if (frame && inside(frame, p.doc)) drag = { mode: 'move', handle: -1, start: p.doc, origin: norm(frame) };
    else { drag = { mode: 'create', handle: -1, start: p.doc, origin: { x: p.doc.x, y: p.doc.y, w: 0, h: 0 } }; frame = null; }
    ctx.engine.emit('overlay', null);
  },
  move(ctx, p) {
    if (line) { line.b = p.doc; ctx.engine.emit('overlay', null); return; }
    if (cornerDrag >= 0 && quad) { quad[cornerDrag] = { x: p.doc.x, y: p.doc.y }; ctx.engine.emit('overlay', null); return; }
    if (!drag) return;
    const ratio = ratioOf(ctx.engine);
    if (drag.mode === 'create') frame = create(drag.start, p.doc, ratio, p.alt);
    else if (drag.mode === 'move') frame = { ...drag.origin, x: drag.origin.x + p.doc.x - drag.start.x, y: drag.origin.y + p.doc.y - drag.start.y };
    else frame = resize(drag.origin, drag.handle, p.doc, ratio, p.alt);
    frame = snap(ctx, frame, drag.mode, drag.handle, p.doc, ratio);
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
    if (frame) { const n = norm(frame); frame = n.w >= 1 && n.h >= 1 ? whole(frame) : null; }
    if (perspective && frame) quad = quadOf(frame);
    ctx.engine.emit('overlay', null);
    ctx.engine.emit('options', null);
  },
  keydown(ctx, e) {
    if (e.key === 'Enter' && (frame || quad)) { commit(ctx.engine); return true; }
    // With a frame showing, O cycles the overlays and Shift+O flips Triangle and Golden Spiral, as in Photoshop; with
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
    g.beginPath();
    g.rect(0, 0, v.width, v.height);
    g.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.fill('evenodd');
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
    g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
    g.fillStyle = pal.handle;
    for (const hd of HANDLES) { const x = a.x + (b.x - a.x) * hd.x, y = a.y + (b.y - a.y) * hd.y; g.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8); g.strokeRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7); }
    g.restore();
  },
  options: (e) => [
    { kind: 'title', text: 'Crop' },
    { kind: 'segment', label: 'Ratio', choices: RATIOS.map((r) => ({ id: r.id, label: r.label })), get: () => ratioId, set: (id) => {
      ratioId = id;
      if (id === 'size' && !sizePx()) frontImage(e);
      const ratio = ratioOf(e);
      if (frame && ratio) { const f = norm(frame), cx = f.x + f.w / 2, cy = f.y + f.h / 2; const w = Math.min(f.w, f.h * ratio), h = w / ratio; frame = whole({ x: cx - w / 2, y: cy - h / 2, w, h }); }
      e.emit('options', null);
      e.emit('overlay', null);
    } },
    { kind: 'number', label: 'W', min: 0, max: 30000, step: 0.01, get: () => size.w, set: (v: number) => { size.w = Math.max(0, v); presetId = ''; sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'number', label: 'H', min: 0, max: 30000, step: 0.01, get: () => size.h, set: (v: number) => { size.h = Math.max(0, v); presetId = ''; sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'segment', label: 'Unit', choices: [{ id: 'px', label: 'px' }, { id: 'in', label: 'in' }, { id: 'cm', label: 'cm' }], get: () => size.unit, set: (v: string) => { size.unit = v as SizeUnit; presetId = ''; sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'number', label: 'Resolution', min: 1, max: 9600, unit: 'ppi', get: () => size.res, set: (v: number) => { size.res = Math.max(1, Math.min(9600, v)); presetId = ''; sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'button', label: 'Front Image', run: () => { frontImage(e); sizeChanged(e); }, when: () => ratioId === 'size' },
    { kind: 'select', label: 'Preset', choices: [{ id: '', label: 'Custom' }], live: () => [{ id: '', label: 'Custom' }, ...loadPresets().map((p) => ({ id: p.id, label: presetLabel(p) }))], get: () => presetId,
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
    { kind: 'readout', label: 'Size', get: () => (frame ? `${Math.round(norm(frame).w)} \u00d7 ${Math.round(norm(frame).h)}` : '') },
    { kind: 'range', label: 'Straighten', min: -45, max: 45, step: 0.1, unit: '\u00b0', get: () => Math.round(angle * 10) / 10, set: (v) => { angle = v; const d = e.current?.doc; if (angle && !frame && d) frame = { x: 0, y: 0, w: d.width, h: d.height }; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'button', label: 'Level line', icon: 'rotate', run: () => { leveling = true; e.emit('tool', null); e.emit('options', null); } },
    { kind: 'select', label: 'Overlay', choices: CROP_OVERLAYS, get: () => overlayKind, set: (v: string) => { overlayKind = (CROP_OVERLAYS.find((o) => o.id === v)?.id ?? 'thirds'); e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'toggle', label: 'Delete Cropped Pixels', get: () => e.cropDeletePixels, set: (v) => { e.cropDeletePixels = v; e.emit('options', null); } },
    { kind: 'toggle', label: 'Content-Aware', get: () => contentAware, set: (v) => { contentAware = v; e.emit('options', null); } },
    { kind: 'toggle', label: 'Perspective', get: () => perspective, set: (v) => { perspective = v; quad = v && frame ? quadOf(frame) : null; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'button', label: 'Crop', icon: 'check', run: () => commit(e) },
    { kind: 'button', label: 'Cancel', icon: 'close', run: () => { frame = null; quad = null; cornerDrag = -1; drag = null; line = null; leveling = false; angle = 0; e.emit('overlay', null); e.emit('options', null); } },
  ],
};

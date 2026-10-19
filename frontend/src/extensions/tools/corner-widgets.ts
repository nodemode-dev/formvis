import { cornerRadiiOf, type Layer, type Pt } from '../../engine';
import { dashed, type ToolContext, type ToolPointer } from '../registry';

/** Live corner widgets: a handle inside each corner of the active live rectangle. Dragging one along the diagonal sets every
 *  corner's radius, and Alt held at the press sets only that corner. The outline previews the radii while the drag runs
 *  and the layer is redrawn once on release (one Corner Radii step). */
const SIDE = 14;
let draft: { id: string; corner: number; only: boolean; radii: number[] } | null = null;

const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

function live(ctx: ToolContext): { layer: Layer; radii: number[]; cap: number } | null {
  const layer = ctx.engine.current?.activeLayer;
  const t = layer?.transform;
  if (!layer?.shape || layer.shape.kind === 'Ellipse' || !t || t.rotation || t.flipX || t.flipY || !layer.visible) return null;
  const one = Math.max(0, Number(layer.shape.cornerRadius) || 0), cap = Math.min(t.w, t.h) / 2;
  return { layer, radii: (cornerRadiiOf(layer.shape) ?? [one, one, one, one]).map((r) => Math.min(r, cap)), cap };
}

/** The corner point and the handle point, in document pixels, for corner `i` at radius `r`. */
function spots(layer: Layer, i: number, r: number, zoom: number): { corner: Pt; handle: Pt } {
  const t = layer.transform, d = DIRS[i], k = SIDE / zoom;
  const corner = { x: d[0] > 0 ? t.x : t.x + t.w, y: d[1] > 0 ? t.y : t.y + t.h };
  return { corner, handle: { x: corner.x + d[0] * (r + k), y: corner.y + d[1] * (r + k) } };
}

function radiusAt(layer: Layer, i: number, at: Pt, zoom: number, cap: number): number {
  const { corner } = spots(layer, i, 0, zoom), d = DIRS[i];
  return Math.max(0, Math.min(cap, ((at.x - corner.x) * d[0] + (at.y - corner.y) * d[1]) / 2 - SIDE / zoom));
}

export function cornerWidgetDown(ctx: ToolContext, p: ToolPointer): boolean {
  const l = live(ctx);
  if (!l || p.button !== 0) return false;
  const zoom = ctx.view().zoom;
  for (let i = 0; i < 4; i++) {
    const h = spots(l.layer, i, l.radii[i], zoom).handle;
    if (Math.hypot(h.x - p.doc.x, h.y - p.doc.y) * zoom > 8) continue;
    draft = { id: l.layer.id, corner: i, only: p.alt, radii: l.radii.slice() };
    return true;
  }
  return false;
}

export function cornerWidgetMove(ctx: ToolContext, p: ToolPointer): boolean {
  const l = live(ctx);
  if (!draft || !l || l.layer.id !== draft.id) return !!draft;
  const r = radiusAt(l.layer, draft.corner, p.doc, ctx.view().zoom, l.cap);
  draft.radii = draft.only ? l.radii.map((v, i) => (i === draft!.corner ? r : v)) : [r, r, r, r];
  ctx.engine.emit('overlay', null);
  return true;
}

export function cornerWidgetUp(ctx: ToolContext): boolean {
  const d = draft;
  draft = null;
  if (!d) return false;
  ctx.engine.setShapeCorners(d.id, d.radii.map((v) => Math.round(v * 10) / 10));
  ctx.engine.emit('overlay', null);
  return true;
}

export function cornerWidgetCancel(ctx: ToolContext): void {
  if (!draft) return;
  draft = null;
  ctx.engine.emit('overlay', null);
}

export function cornerWidgetsActive(): boolean { return !!draft; }

export function cornerWidgetOverlay(ctx: ToolContext, g: CanvasRenderingContext2D): void {
  const l = live(ctx);
  if (!l) return;
  const v = ctx.view(), pal = ctx.paint(), t = l.layer.transform, radii = draft && draft.id === l.layer.id ? draft.radii : l.radii;
  if (draft) {
    const a = v.toScreen({ x: t.x, y: t.y }), b = v.toScreen({ x: t.x + t.w, y: t.y + t.h });
    dashed(ctx, g, () => g.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, radii.map((r) => Math.max(0, r * v.zoom))));
  }
  g.save();
  g.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const s = v.toScreen(spots(l.layer, i, radii[i], v.zoom).handle);
    g.beginPath();
    g.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
    g.fillStyle = draft?.corner === i ? pal.accent : '#fff';
    g.strokeStyle = pal.accent;
    g.fill();
    g.stroke();
  }
  g.restore();
}

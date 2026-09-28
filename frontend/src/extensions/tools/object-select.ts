import { SelectionMask, createSurface, ctxOf, toBlob, type Engine, type Pt, type SelectionMode } from '../../engine';
import { api } from '../../io/api';
import { dashed, type Tool } from '../registry';
import { modeFor, modeSegment, nudgeSelectionKey } from './select-common';

/** The Object Selection tool (Photoshop's, W): click an object to select it, Shift-click to add another, Alt-click to
 *  take one away. The engine's SAM 2.1 encodes the image once and answers each click in about a tenth of a second; the
 *  image is sent again only when its pixels change (the key is a hash of them) or the engine no longer holds it. With
 *  Sample All Layers off, only the active layer is looked at, as in Photoshop. */

let sampleAll = true;
let sentKey = '';

/** The pixels the tool looks at, at document size: every visible layer, or the active layer alone. */
function source(engine: Engine): HTMLCanvasElement | OffscreenCanvas | null {
  const p = engine.current;
  if (!p) return null;
  if (sampleAll) return engine.flattened();
  const l = p.activeLayer;
  if (!l?.raster) return null;
  const s = createSurface(p.doc.width, p.doc.height), c = ctxOf(s), t = l.transform;
  c.translate(t.x + t.w / 2, t.y + t.h / 2);
  c.rotate(((t.rotation ?? 0) * Math.PI) / 180);
  c.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
  c.drawImage(l.raster.canvas, -t.w / 2, -t.h / 2, t.w, t.h);
  return s;
}

/** A key for exactly these pixels: the document, the size and an FNV-1a hash of every byte. */
function keyOf(id: string, s: HTMLCanvasElement | OffscreenCanvas): string {
  const d = ctxOf(s).getImageData(0, 0, s.width, s.height).data;
  let h = 0x811c9dc5;
  const w = new Uint32Array(d.buffer, d.byteOffset, d.byteLength >> 2);
  for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w[i], 0x01000193) >>> 0;
  return `${id}:${s.width}x${s.height}:${h.toString(16)}`;
}

/** SAM's mask for points or a box, at document size (null when nothing was found); the image sent only when it changed. */
async function request(engine: Engine, points: Array<[number, number, 0 | 1]>, box: [number, number, number, number] | null): Promise<Uint8Array | null> {
  const p = engine.current, src = p ? source(engine) : null;
  if (!p || !src) return null;
  const W = p.doc.width, H = p.doc.height, key = keyOf(p.id, src);
  const blob = await api.selectObject(key, points, () => toBlob(src), key !== sentKey, box);
  sentKey = key;
  const bitmap = await createImageBitmap(blob), m = createSurface(W, H), c = ctxOf(m);
  c.drawImage(bitmap, 0, 0, W, H);
  bitmap.close();
  const px = c.getImageData(0, 0, W, H).data, data = new Uint8Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
  if (engine.current !== p || !data.some((v) => v >= 128)) return null;
  return data;
}

async function selectWith(engine: Engine, points: Array<[number, number, 0 | 1]>, box: [number, number, number, number] | null, mode: SelectionMode): Promise<void> {
  const p = engine.current;
  if (!p) return;
  highlight = null;
  await engine.task(async () => {
    try {
      const data = await request(engine, points, box);
      if (!data) { engine.notice(box ? 'No object was found in the box.' : 'No object was found there.'); return; }
      engine.applySelection(SelectionMask.cropped(0, 0, p.doc.width, p.doc.height, data), mode, 'Object Selection');
    } catch (err) {
      engine.notice(err instanceof Error ? err.message : String(err));
    }
  });
}

/* Box mode and the hover highlight (1.49.10, the owner's tool list), as Photoshop's: a drag draws a box and selects the
   object in it; resting the pointer shows the object under it, tinted, before any click. */
let draft: { from: Pt; to: Pt; mode: SelectionMode } | null = null;
let highlight: { mask: HTMLCanvasElement | OffscreenCanvas; at: Pt } | null = null;
let hoverTimer = 0, hoverBusy = false, hoverOn = true;

function showHover(engine: Engine, at: Pt): void {
  clearTimeout(hoverTimer);
  if (!hoverOn || draft) return;
  hoverTimer = window.setTimeout(async () => {
    const p = engine.current;
    if (!p || hoverBusy || engine.tool !== 'objectSelect') return;
    const x = Math.floor(at.x), y = Math.floor(at.y);
    if (x < 0 || y < 0 || x >= p.doc.width || y >= p.doc.height) return;
    hoverBusy = true;
    try {
      const data = await request(engine, [[x, y, 1]], null);
      if (!data || engine.tool !== 'objectSelect' || draft) { highlight = null; return; }
      const W = p.doc.width, H = p.doc.height, c = createSurface(W, H), g = ctxOf(c), img = g.createImageData(W, H);
      // A light wash with the object's outline, as Photoshop marks it (an orange tint turned a blue object grey, 1.49.10).
      const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && data[y * W + x] >= 128;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!on(x, y)) continue;
        const i = (y * W + x) * 4, edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1) || !on(x - 2, y) || !on(x + 2, y) || !on(x, y - 2) || !on(x, y + 2);
        if (edge) { img.data[i] = 249; img.data[i + 1] = 115; img.data[i + 2] = 22; img.data[i + 3] = 255; }
        else { img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 46; }
      }
      g.putImageData(img, 0, 0);
      highlight = { mask: c, at };
    } catch { highlight = null; } finally { hoverBusy = false; engine.emit('overlay', null); }
  }, 350);
}

async function selectAt(engine: Engine, pt: Pt, mode: SelectionMode): Promise<void> {
  const p = engine.current;
  if (!p) return;
  const x = Math.floor(pt.x), y = Math.floor(pt.y);
  if (x < 0 || y < 0 || x >= p.doc.width || y >= p.doc.height) return;
  await selectWith(engine, [[x, y, 1]], null, mode);
}

export const objectSelectTool: Tool = {
  id: 'objectSelect', label: 'Object Selection', key: 'W', order: 35,
  icon: () => 'tObjectSelect',
  hint: () => 'Click an object, or drag a box round it · Shift adds · Alt subtracts · Rest the pointer to see the object it finds · The first use on an image takes a few seconds',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button !== 0) return; clearTimeout(hoverTimer); highlight = null; draft = { from: p.doc, to: p.doc, mode: modeFor(ctx.engine, p) }; ctx.engine.emit('overlay', null); },
  move(ctx, p) { if (!draft) return; draft.to = p.doc; ctx.engine.emit('overlay', null); },
  up(ctx) {
    const d = draft;
    draft = null;
    ctx.engine.emit('overlay', null);
    if (!d) return;
    const v = ctx.view(), a = v.toScreen(d.from), b = v.toScreen(d.to);
    if (Math.abs(b.x - a.x) < 6 && Math.abs(b.y - a.y) < 6) { void selectAt(ctx.engine, d.from, d.mode); return; }
    void selectWith(ctx.engine, [], [Math.min(d.from.x, d.to.x), Math.min(d.from.y, d.to.y), Math.max(d.from.x, d.to.x), Math.max(d.from.y, d.to.y)], d.mode);
  },
  hover(ctx, p) {
    if (!p) { clearTimeout(hoverTimer); if (highlight) { highlight = null; ctx.engine.emit('overlay', null); } return; }
    if (highlight && Math.hypot(p.doc.x - highlight.at.x, p.doc.y - highlight.at.y) * ctx.view().zoom > 12) { highlight = null; ctx.engine.emit('overlay', null); }
    showHover(ctx.engine, p.doc);
  },
  cancel(ctx) { draft = null; highlight = null; clearTimeout(hoverTimer); ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    const v = ctx.view();
    if (highlight && !draft) { const o = v.toScreen({ x: 0, y: 0 }), p = ctx.engine.current; if (p) g.drawImage(highlight.mask as CanvasImageSource, o.x, o.y, p.doc.width * v.zoom, p.doc.height * v.zoom); }
    if (draft) { const a = v.toScreen(draft.from), b = v.toScreen(draft.to); dashed(ctx, g, () => { g.rect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }); }
  },
  keydown(ctx, e) { return nudgeSelectionKey(ctx, e); },
  options: (e) => [
    { kind: 'title', text: 'Object Selection' },
    { kind: 'toggle', label: 'Sample All Layers', get: () => sampleAll, set: (v) => { sampleAll = v; } },
    { kind: 'toggle', label: 'Highlight on Hover', get: () => hoverOn, set: (v) => { hoverOn = v; if (!v) { highlight = null; clearTimeout(hoverTimer); } } },
    modeSegment(e),
  ],
};

import { SelectionMask, createSurface, ctxOf, toBlob, type Engine, type Pt, type SelectionMode } from '../../engine';
import { api } from '../../io/api';
import { toolHost } from '../registry';
import { dashed, type Tool } from '../registry';
import { modeCursor, modeFor, modeSegment, nudgeSelectionKey } from './select-common';

/** The Object Selection tool (W): click an object to select it, Shift-click to add another, Alt-click to
 *  take one away. The engine's SAM 2.1 encodes the image once and answers each click in about a tenth of a second; the
 *  image is sent again only when its pixels change (the key is a hash of them) or the engine no longer holds it. With
 *  Sample All Layers off, only the active layer is looked at. */

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

/** True when a click found the object that is already the selection (nine tenths overlap), so a new-selection click toggles it off. */
function isSelected(engine: Engine, data: Uint8Array): boolean {
  const p = engine.current, s = p?.selection;
  if (!p || !s) return false;
  const W = p.doc.width;
  let both = 0, either = 0;
  for (let i = 0; i < data.length; i++) {
    const a = data[i] >= 128, b = s.valueAt(i % W, Math.floor(i / W)) >= 128;
    if (a || b) either++;
    if (a && b) both++;
  }
  return either > 0 && both / either >= 0.9;
}

async function selectWith(engine: Engine, points: Array<[number, number, 0 | 1]>, box: [number, number, number, number] | null, mode: SelectionMode): Promise<void> {
  const p = engine.current;
  if (!p) return;
  highlight = null;
  await engine.task(async () => {
    try {
      const data = await request(engine, points, box);
      if (!data) { engine.notice(box ? 'No object was found in the box.' : 'No object was found there.'); return; }
      if (!box && mode === 'replace' && isSelected(engine, data)) { engine.deselect(); return; }
      engine.applySelection(SelectionMask.cropped(0, 0, p.doc.width, p.doc.height, data), mode, 'Object Selection');
    } catch (err) {
      engine.notice(err instanceof Error ? err.message : String(err));
    }
  });
}

/** Select by points for agents (select_point): clicks on the object and off it, as the tool sends them; null when it selected, else why not. */
export async function selectByPoints(engine: Engine, inside: Array<[number, number]>, outside: Array<[number, number]>, mode: SelectionMode): Promise<string | null> {
  const p = engine.current;
  if (!p) return 'No document is open.';
  let said = null as string | null;
  await engine.task(async () => {
    try {
      const data = await request(engine, [...inside.map(([x, y]) => [x, y, 1] as [number, number, 1]), ...outside.map(([x, y]) => [x, y, 0] as [number, number, 0])], null);
      if (!data) { said = 'No object was found at those points.'; return; }
      engine.applySelection(SelectionMask.cropped(0, 0, p.doc.width, p.doc.height, data), mode, 'Object Selection');
    } catch (err) { said = err instanceof Error ? err.message : String(err); }
  });
  return said;
}

/* Box mode and the hover highlight (1.49.10, the owner's tool list): a drag draws a box and selects the
   object in it; resting the pointer shows the object under it, tinted, before any click. */
let draft: { from: Pt; to: Pt; mode: SelectionMode } | null = null;
/** The hover mask under the pointer at press time; a click that does not become a drag uses it without asking the model. */
let found: Uint8Array | null = null;
let highlight: { mask: HTMLCanvasElement | OffscreenCanvas; at: Pt; data: Uint8Array; project: object } | null = null;
let hoverTimer = 0, hoverBusy = false, hoverOn = true, hoverSeq = 0, hoverDownUntil = 0;
const watched = new WeakSet<Engine>();

/** Drops the found object when the tool changes, the document changes or its pixels change (hooked once per engine). */
function watch(engine: Engine): void {
  if (watched.has(engine)) return;
  watched.add(engine);
  const drop = (): void => { clearTimeout(hoverTimer); hoverSeq++; if (highlight) { highlight = null; engine.emit('overlay', null); } };
  engine.on('render', drop);
  engine.on('active', drop);
  engine.on('tool', () => { if (engine.tool !== 'objectSelect') drop(); });
}

function showHover(engine: Engine, at: Pt): void {
  clearTimeout(hoverTimer);
  if (!hoverOn || draft) return;
  watch(engine);
  const seq = ++hoverSeq;
  hoverTimer = window.setTimeout(async () => {
    const p = engine.current;
    if (!p || hoverBusy || engine.tool !== 'objectSelect' || Date.now() < hoverDownUntil) return;
    const x = Math.floor(at.x), y = Math.floor(at.y);
    if (x < 0 || y < 0 || x >= p.doc.width || y >= p.doc.height) return;
    if (highlight && highlight.project === p && highlight.data[y * p.doc.width + x] >= 128) return;
    hoverBusy = true;
    try {
      const data = await request(engine, [[x, y, 1]], null);
      if (seq !== hoverSeq || engine.current !== p) return;
      if (!data || engine.tool !== 'objectSelect' || draft) { highlight = null; return; }
      const W = p.doc.width, H = p.doc.height, c = createSurface(W, H), g = ctxOf(c), img = g.createImageData(W, H);
      // A light wash with the object's outline (an orange tint turned a blue object grey, 1.49.10).
      const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && data[y * W + x] >= 128;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!on(x, y)) continue;
        const i = (y * W + x) * 4, edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1) || !on(x - 2, y) || !on(x + 2, y) || !on(x, y - 2) || !on(x, y + 2);
        if (edge) { img.data[i] = 249; img.data[i + 1] = 115; img.data[i + 2] = 22; img.data[i + 3] = 255; }
        else { img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 46; }
      }
      g.putImageData(img, 0, 0);
      highlight = { mask: c, at, data, project: p };
    } catch { highlight = null; hoverDownUntil = Date.now() + 20000; } finally { hoverBusy = false; engine.emit('overlay', null); }
  }, 120);
}

async function selectAt(engine: Engine, pt: Pt, mode: SelectionMode, found: Uint8Array | null = null): Promise<void> {
  const p = engine.current;
  if (!p) return;
  const x = Math.floor(pt.x), y = Math.floor(pt.y);
  if (x < 0 || y < 0 || x >= p.doc.width || y >= p.doc.height) return;
  if (found && mode === 'replace' && isSelected(engine, found)) { engine.deselect(); return; }
  if (found) { engine.applySelection(SelectionMask.cropped(0, 0, p.doc.width, p.doc.height, found), mode, 'Object Selection'); return; }
  await selectWith(engine, [[x, y, 1]], null, mode);
}

export const objectSelectTool: Tool = {
  id: 'objectSelect', label: 'Object Selection', key: 'W', order: 35,
  icon: () => 'tObjectSelect',
  hint: () => 'Click an object, or drag a box round it · Shift adds · Alt subtracts · Rest the pointer to see the object it finds · The first use on an image takes a few seconds',
  cursor: (ctx, p) => modeCursor(ctx.engine, p),
  down(ctx, p) {
    if (p.button !== 0) return;
    clearTimeout(hoverTimer); hoverSeq++;
    const cur = ctx.engine.current, x = Math.floor(p.doc.x), y = Math.floor(p.doc.y);
    found = highlight && cur === highlight.project && cur.doc && x >= 0 && y >= 0 && x < cur.doc.width && y < cur.doc.height && highlight.data[y * cur.doc.width + x] >= 128 ? highlight.data : null;
    highlight = null; draft = { from: p.doc, to: p.doc, mode: modeFor(ctx.engine, p) }; ctx.engine.emit('overlay', null);
  },
  move(ctx, p) { if (!draft) return; draft.to = p.doc; ctx.engine.emit('overlay', null); },
  up(ctx) {
    const d = draft;
    draft = null;
    ctx.engine.emit('overlay', null);
    if (!d) return;
    const v = ctx.view(), a = v.toScreen(d.from), b = v.toScreen(d.to);
    if (Math.abs(b.x - a.x) < 6 && Math.abs(b.y - a.y) < 6) { const f = found; found = null; void selectAt(ctx.engine, d.from, d.mode, f); return; }
    found = null;
    void selectWith(ctx.engine, [], [Math.min(d.from.x, d.to.x), Math.min(d.from.y, d.to.y), Math.max(d.from.x, d.to.x), Math.max(d.from.y, d.to.y)], d.mode);
  },
  hover(ctx, p) {
    if (!p) { clearTimeout(hoverTimer); if (highlight) { highlight = null; ctx.engine.emit('overlay', null); } return; }
    if (highlight) {
      const cur = ctx.engine.current, x = Math.floor(p.doc.x), y = Math.floor(p.doc.y);
      const inside = !!cur && cur === highlight.project && x >= 0 && y >= 0 && x < cur.doc.width && y < cur.doc.height && highlight.data[y * cur.doc.width + x] >= 128;
      if (!inside) { highlight = null; ctx.engine.emit('overlay', null); }
    }
    showHover(ctx.engine, p.doc);
  },
  cancel(ctx) { draft = null; found = null; highlight = null; hoverSeq++; clearTimeout(hoverTimer); ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    const v = ctx.view();
    if (highlight && !draft) { const o = v.toScreen({ x: 0, y: 0 }), p = ctx.engine.current; if (p) g.drawImage(highlight.mask as CanvasImageSource, o.x, o.y, p.doc.width * v.zoom, p.doc.height * v.zoom); }
    if (draft) { const a = v.toScreen(draft.from), b = v.toScreen(draft.to); dashed(ctx, g, () => { g.rect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }); }
  },
  keydown(ctx, e) { return nudgeSelectionKey(ctx, e); },
  options: (e) => [
    { kind: 'title', text: 'Object Selection' },
    { kind: 'toggle', label: 'Sample All Layers', priority: 45, get: () => sampleAll, set: (v) => { sampleAll = v; } },
    { kind: 'toggle', label: 'Object Finder', priority: 40, get: () => hoverOn, set: (v) => { hoverOn = v; hoverDownUntil = 0; if (!v) { highlight = null; hoverSeq++; clearTimeout(hoverTimer); e.emit('overlay', null); } } },
    modeSegment(e),
    { kind: 'button', label: 'Feather Selection...', priority: 28, run: () => toolHost.run('feather'), when: () => !!e.current?.selection },
    { kind: 'button', label: 'Select and Mask...', priority: 25, run: () => toolHost.run('select-and-mask') }
  ],
};

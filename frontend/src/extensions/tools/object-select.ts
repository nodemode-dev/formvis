import { SelectionMask, createSurface, ctxOf, toBlob, type Engine, type Pt, type SelectionMode } from '../../engine';
import { api } from '../../io/api';
import type { Tool } from '../registry';
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

async function selectAt(engine: Engine, pt: Pt, mode: SelectionMode): Promise<void> {
  const p = engine.current, src = p ? source(engine) : null;
  if (!p || !src) return;
  const W = p.doc.width, H = p.doc.height, x = Math.floor(pt.x), y = Math.floor(pt.y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const key = keyOf(p.id, src);
  await engine.task(async () => {
    try {
      const blob = await api.selectObject(key, [[x, y, 1]], () => toBlob(src), key !== sentKey);
      sentKey = key;
      const bitmap = await createImageBitmap(blob), m = createSurface(W, H), c = ctxOf(m);
      c.drawImage(bitmap, 0, 0, W, H);
      bitmap.close();
      const px = c.getImageData(0, 0, W, H).data, data = new Uint8Array(W * H);
      for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
      if (engine.current !== p) return;
      if (!data.some((v) => v >= 128)) { engine.notice('No object was found there.'); return; }
      engine.applySelection(SelectionMask.cropped(0, 0, W, H, data), mode, 'Object Selection');
    } catch (err) {
      engine.notice(err instanceof Error ? err.message : String(err));
    }
  });
}

export const objectSelectTool: Tool = {
  id: 'objectSelect', label: 'Object Selection', key: 'W', order: 35,
  icon: () => 'tObjectSelect',
  hint: () => 'Click an object to select it · Shift adds · Alt subtracts · The first click on an image takes a few seconds',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) void selectAt(ctx.engine, p.doc, modeFor(ctx.engine, p)); },
  keydown(ctx, e) { return nudgeSelectionKey(ctx, e); },
  options: (e) => [
    { kind: 'title', text: 'Object Selection' },
    { kind: 'toggle', label: 'Sample All Layers', get: () => sampleAll, set: (v) => { sampleAll = v; } },
    modeSegment(e),
  ],
};

import { createSurface, ctxOf, type Surface } from './surface';
import type { EffectWorker, FxAsk, FxDone, FxJob, FxLanded, FxPut } from './fx-wire';

/** The build worker behind the Layer Style dialog's live preview (CO-0274). One worker draws a styled layer's effect parts
 *  with the renderer's own builder while the page keeps answering with the parts it already has. Each layer keeps only its
 *  newest request: a build in flight is never cancelled mid-way, a result older than the newest request is dropped, and a
 *  build that runs past a second while a newer one for the same layer waits ends the worker (it is started again at once;
 *  the layers' pixels are sent again). The layers' pixels travel as ImageBitmaps once per raster version. The worker is let
 *  go after a few quiet seconds. */

interface Run { id: number; layerId: string; key: string; at: number; ask: FxAsk }

const SLOW_MS = 1000, IDLE_MS = 8000;
let worker: Worker | null = null;
let failed = false;
let seq = 1;
let running: Run | null = null;
let slow: ReturnType<typeof setTimeout> | null = null;
let idle: ReturnType<typeof setTimeout> | null = null;
const waiting = new Map<string, FxAsk>();
const newest = new Map<string, string>();
const held = new Set<string>();
const stats = { asked: 0, posted: 0, landed: 0, dropped: 0, restarts: 0, failed: 0 };

export function effectJobStats(): { asked: number; posted: number; landed: number; dropped: number; restarts: number; failed: number; busy: boolean; waiting: number; workers: number } {
  return { ...stats, busy: !!running, waiting: waiting.size, workers: worker ? 1 : 0 };
}

function close(parts: { bitmap: ImageBitmap }[] | undefined): void {
  for (const p of parts ?? []) try { p.bitmap.close(); } catch { /* already closed */ }
}

function end(): void {
  if (slow) { clearTimeout(slow); slow = null; }
  if (idle) { clearTimeout(idle); idle = null; }
  worker?.terminate();
  worker = null;
  held.clear();
  running = null;
}

function ensure(): Worker | null {
  if (worker) return worker;
  if (failed || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return null;
  try {
    const w = new Worker(new URL('./composite-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FxDone>) => answered(w, e.data);
    w.onerror = () => { if (worker === w) { failed = true; stats.failed++; end(); waiting.clear(); } };
    worker = w;
  } catch { failed = true; return null; }
  return worker;
}

function answered(from: Worker, m: FxDone): void {
  if (m.type !== 'fxdone') return;
  const run = running;
  if (from !== worker || !run || run.id !== m.id) { close(m.parts); return; }
  running = null;
  if (slow) { clearTimeout(slow); slow = null; }
  if (m.error || !m.parts) { stats.failed++; failed = true; close(m.parts); end(); waiting.clear(); return; }
  else if (newest.get(run.layerId) !== run.key) { stats.dropped++; close(m.parts); }
  else {
    const parts: FxLanded[] = m.parts.map((p) => {
      const s: Surface = createSurface(p.w, p.h);
      ctxOf(s).drawImage(p.bitmap, 0, 0);
      p.bitmap.close();
      return { surface: s, x: p.x, y: p.y, k: p.k, alpha: p.alpha, op: p.op, above: p.above, name: p.name, kept: p.kept };
    });
    stats.landed++;
    run.ask.land(parts, m.ms);
  }
  pump();
}

async function start(a: FxAsk): Promise<void> {
  const w = ensure();
  if (!w) { waiting.clear(); return; }
  const run: Run = { id: seq++, layerId: a.layerId, key: a.key, at: performance.now(), ask: a };
  running = run;
  slow = setTimeout(() => { slow = null; pump(); }, SLOW_MS + 5);
  try {
    const items: { key: string; surface: Surface; w: number; h: number }[] = [a.src];
    if (a.mask) items.push(a.mask);
    if (a.cover) items.push(a.cover);
    const patterns = a.patterns.map((p) => ({ id: p.id, key: `pattern:${p.id}:${p.surface.width}x${p.surface.height}` }));
    a.patterns.forEach((p, i) => items.push({ key: patterns[i].key, surface: p.surface, w: p.surface.width, h: p.surface.height }));
    for (const it of items) {
      if (held.has(it.key)) continue;
      const bitmap = await createImageBitmap(it.surface as ImageBitmapSource);
      if (worker !== w || running !== run) { bitmap.close(); return; }
      w.postMessage({ type: 'fxput', key: it.key, width: it.w, height: it.h, bitmap } satisfies FxPut, [bitmap]);
      held.add(it.key);
    }
    if (worker !== w || running !== run) return;
    const job: FxJob = {
      type: 'fx', id: run.id, layerId: a.layerId, src: a.src.key,
      mask: a.mask ? { key: a.mask.key, w: a.mask.w, h: a.mask.h, t: a.mask.t, covers: a.mask.covers } : null,
      cover: a.cover ? a.cover.key : null,
      patterns, live: items.map((it) => it.key), fx: a.fx, t: a.t, docW: a.docW, docH: a.docH, fast: a.fast, pixels: a.pixels(), shapes: a.shapes,
    };
    stats.posted++;
    w.postMessage(job);
  } catch {
    if (running === run) { running = null; stats.failed++; }
    pump();
  }
}

function pump(): void {
  if (running) {
    const waits = waiting.has(running.layerId);
    if (waits && performance.now() - running.at > SLOW_MS) {
      stats.restarts++;
      const ended = running;
      end();
      ended.ask.late();
      ensure();
    } else return;
  }
  if (idle) { clearTimeout(idle); idle = null; }
  const next = waiting.entries().next();
  if (next.done) {
    if (worker) idle = setTimeout(() => { idle = null; if (!running && !waiting.size) end(); }, IDLE_MS);
    return;
  }
  waiting.delete(next.value[0]);
  void start(next.value[1]);
}

/** The effect worker the renderer asks (false when the browser has no worker with offscreen canvases, or it failed once). */
export const effectWorker: EffectWorker = {
  ask(a: FxAsk): boolean {
    if (failed || !ensure()) return false;
    const pending = waiting.get(a.layerId);
    if (newest.get(a.layerId) === a.key && ((running && running.layerId === a.layerId && running.key === a.key) || (pending && pending.key === a.key))) return true;
    newest.set(a.layerId, a.key);
    waiting.set(a.layerId, a);
    stats.asked++;
    pump();
    return true;
  },
};

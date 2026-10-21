import { Raster, createSurface, ctxOf, sizeSurface, type Engine, type Mat } from '../engine';
import { GpuDisplay, type Checker, type ScreenDisplay } from './display';
import { GlDisplay } from './gl-display';

/** The performance benchmark (Phase 18.7): frame times on the CPU and on each GPU display available, for panning, for
 *  panning with adjustment layers, and for painting, on a temporary 2000 x 1500 document opened in the engine and closed
 *  after (the previous document made active again). Every frame is timed until its pixels are finished: a one-pixel read
 *  on the CPU path, the GPU's completion on the GPU paths. Five warm-up frames are discarded. */

export type BenchState = 'running' | 'done' | 'capped' | 'skipped' | 'cancelled';
export interface BenchRow {
  key: string; test: string; path: string; state: BenchState; reason: string;
  medianMs: number; p95Ms: number; frames: number; budgetMs: number; within: boolean | null;
}
export interface BenchResult { rows: BenchRow[]; doc: string; view: string; notes: string[]; peakHeapMb: number | null; cancelled: boolean }
export interface BenchOptions { signal?: AbortSignal; capMs?: number; onRow?: (row: BenchRow) => void; onProgress?: (text: string) => void }

const W = 1200, H = 800, ZOOM = 0.5, FRAMES = 30, WARM = 5, CAP_MS = 4000;
const CHECKER: Checker = { a: [204, 204, 204], b: [255, 255, 255], cell: 8, origin: [0, 0] };
const BASELINE_KEY = 'formvis.benchBaseline';

/** The p95 budget of each path in milliseconds: a pan frame on the CPU within 100, on a graphics processor within 33
 *  (30 frames a second); the adjustment layers allowed half as much again; a dab within 33 on the CPU region redraw and
 *  50 on a full GPU frame. */
export function budgetFor(test: string, path: string): number {
  const gpu = path.startsWith('WebGPU') || path.startsWith('WebGL2');
  if (test.startsWith('Paint')) return gpu ? 50 : 33;
  const base = gpu ? 33 : 100;
  return test.includes('Levels') ? Math.round(base * 1.5) : base;
}

export function stats(times: number[]): { medianMs: number; p95Ms: number } {
  if (!times.length) return { medianMs: 0, p95Ms: 0 };
  const s = [...times].sort((a, b) => a - b), at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { medianMs: Math.round(at(0.5) * 100) / 100, p95Ms: Math.round(at(0.95) * 100) / 100 };
}

export type Baseline = Record<string, number>;

export function loadBaseline(): Baseline | null {
  try {
    const raw = JSON.parse(localStorage.getItem(BASELINE_KEY) ?? 'null') as Baseline | null;
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
}

/** Saves the p95 of each measured path; false when the browser would not store it. */
export function saveBaseline(rows: BenchRow[]): boolean {
  const b: Baseline = {};
  for (const r of rows) if (r.frames > 0 && r.state !== 'skipped') b[r.key] = r.p95Ms;
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify(b)); return true; } catch { return false; }
}

/** The change of a row's p95 against the baseline, as text; a rise over 20 percent is a regression. */
export function versus(row: BenchRow, base: Baseline | null): { text: string; regression: boolean } {
  const was = base?.[row.key];
  if (!base) return { text: 'no baseline', regression: false };
  if (row.state === 'skipped' || !row.frames || typeof was !== 'number' || was <= 0) return { text: 'n/a', regression: false };
  const pct = Math.round(((row.p95Ms - was) / was) * 100);
  return pct > 20 ? { text: `+${pct}% regression`, regression: true } : { text: `${pct > 0 ? '+' : ''}${pct}%`, regression: false };
}

function heapMb(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return m && typeof m.usedJSHeapSize === 'number' ? m.usedJSHeapSize / 1048576 : null;
}

/** The test document: a gradient, three blended layers (one masked), and Levels and Hue/Saturation layers. */
function build(engine: Engine): { adjust: string[]; paint: Raster } {
  engine.newDocument(2000, 1500, 'Benchmark', 'white');
  const p = engine.current;
  if (!p) throw new Error('the benchmark document did not open');
  const bg = p.activeLayer;
  if (bg?.raster) {
    const c = bg.raster.ctx, g = c.createLinearGradient(0, 0, 2000, 1500);
    g.addColorStop(0, 'rgb(20,120,200)'); g.addColorStop(1, 'rgb(230,90,40)');
    c.fillStyle = g; c.fillRect(0, 0, 2000, 1500); bg.raster.touch();
  }
  let paint: Raster | null = null;
  for (const [i, blend] of (['multiply', 'screen', 'overlay'] as const).entries()) {
    engine.addLayer();
    const l = p.activeLayer;
    if (!l) continue;
    l.raster = new Raster(2000, 1500);
    const c = l.raster.ctx;
    for (let k = 0; k < 40; k++) {
      c.fillStyle = `hsla(${(k * 37 + i * 90) % 360},70%,55%,0.6)`;
      c.beginPath(); c.arc((k * 173 + i * 311) % 2000, (k * 97 + i * 211) % 1500, 60 + (k % 5) * 30, 0, Math.PI * 2); c.fill();
    }
    l.raster.touch();
    l.blend = blend; l.opacity = 0.85;
    if (i === 1) {
      l.mask = { raster: new Raster(2000, 1500), enabled: true, linked: true, placement: null };
      const m = l.mask.raster?.ctx;
      if (m && l.mask.raster) {
        const g = m.createLinearGradient(0, 0, 2000, 0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
        m.fillStyle = g; m.fillRect(0, 0, 2000, 1500); l.mask.raster.touch();
      }
    }
    if (i === 0) paint = l.raster;
  }
  const adjust: string[] = [];
  engine.addAdjustmentLayer('levels');
  const lv = p.activeLayer;
  if (lv?.adjustment) { (lv.adjustment.data as { levels: { ranges: unknown[] } }).levels.ranges[0] = { black: 20, gamma: 1.3, white: 235, outputBlack: 0, outputWhite: 255 }; adjust.push(lv.id); }
  engine.addAdjustmentLayer('hsv');
  const hs = p.activeLayer;
  if (hs?.adjustment) { Object.assign(hs.adjustment.data, { hue: 30, saturation: 20, lightness: 0 }); adjust.push(hs.id); }
  if (!paint) throw new Error('the benchmark layers did not build');
  return { adjust, paint };
}

const view = (i: number): Mat => [ZOOM, 0, 0, ZOOM, -((i * 37) % 300), -((i * 23) % 200)];

const TIMED_OUT = Symbol('timed out');

/** Runs one frame, giving up on it when the time left runs out (a frame a graphics processor never finishes). */
async function withinTime(run: () => Promise<void> | void, ms: number): Promise<void | typeof TIMED_OUT> {
  let timer = 0;
  const limit = new Promise<typeof TIMED_OUT>((res) => { timer = window.setTimeout(() => res(TIMED_OUT), Math.max(1, ms)); });
  try { return await Promise.race([Promise.resolve(run()), limit]); } finally { window.clearTimeout(timer); }
}

export async function runBenchmark(engine: Engine, n = FRAMES, warm = WARM, opts: BenchOptions = {}): Promise<BenchResult> {
  const previous = engine.current?.id ?? null;
  const rows: BenchRow[] = [], notes: string[] = [], cap = opts.capMs ?? CAP_MS;
  const displays: Array<[string, ScreenDisplay & { timedFrame: GpuDisplay['timedFrame'] }]> = [];
  const stuck = new Map<string, string>();
  let peak = heapMb(), cancelled = false;
  const sample = (): void => { const h = heapMb(); if (h !== null && (peak === null || h > peak)) peak = h; };
  const emit = (r: BenchRow): void => { opts.onRow?.({ ...r }); };
  const frames = async (test: string, path: string, run: (i: number) => Promise<void> | void): Promise<void> => {
    const row: BenchRow = { key: `${test}|${path}`, test, path, state: 'running', reason: '', medianMs: 0, p95Ms: 0, frames: 0, budgetMs: budgetFor(test, path), within: null };
    rows.push(row);
    emit(row);
    opts.onProgress?.(`${test}, ${path}`);
    const times: number[] = [], warmed: number[] = [], start = performance.now();
    for (let i = 0; i < warm + n; i++) {
      if (opts.signal?.aborted) { cancelled = true; row.state = 'cancelled'; break; }
      const left = cap - (performance.now() - start);
      if (left <= 0) { row.state = 'capped'; row.reason = `stopped at the ${Math.round(cap / 1000)} s cap`; break; }
      const t0 = performance.now();
      const res = await withinTime(() => run(i), left);
      if (res === TIMED_OUT) { row.state = 'capped'; row.reason = 'a frame did not finish within the cap'; break; }
      if (i < warm) warmed.push(performance.now() - t0);
      if (i >= warm) { times.push(performance.now() - t0); row.frames = times.length; Object.assign(row, stats(times)); if (i % 3 === 0) emit(row); }
      sample();
      await new Promise<void>((res) => { window.setTimeout(res, 0); });
    }
    if (row.state === 'running') row.state = 'done';
    if (row.state === 'capped' && !times.length && warmed.length) { times.push(...warmed); row.frames = times.length; row.reason += ' (warm-up frames only)'; }
    if (row.state === 'capped' && times.length < 3) stuck.set(path.split(' ')[0], `too slow here: ${times.length} ${times.length === 1 ? 'frame' : 'frames'} in ${Math.round(cap / 1000)} s on ${path}`);
    if (!times.length && row.state !== 'cancelled') { row.state = 'skipped'; row.reason = row.reason || 'no frame finished'; }
    Object.assign(row, stats(times));
    row.within = row.frames ? row.p95Ms <= row.budgetMs : null;
    emit(row);
  };
  const skip = (test: string, path: string, reason: string): void => {
    const row: BenchRow = { key: `${test}|${path}`, test, path, state: 'skipped', reason, medianMs: 0, p95Ms: 0, frames: 0, budgetMs: budgetFor(test, path), within: null };
    rows.push(row);
    emit(row);
  };
  const gpu = await GpuDisplay.create(document.createElement('canvas'));
  if (gpu) displays.push(['WebGPU', gpu]); else notes.push('WebGPU: not available here.');
  const gl = GlDisplay.create(document.createElement('canvas'));
  if (gl) displays.push(['WebGL2', gl]); else notes.push('WebGL2: not available here.');
  let docId: string | null = null;
  try {
    const { adjust, paint } = build(engine);
    docId = engine.current?.id ?? null;
    const p = engine.current;
    if (!p) throw new Error('no benchmark document');
    const work = createSurface(W, H), wc = ctxOf(work), rect: [number, number, number, number] = [0, 0, W, H];
    const cpuFrame = (i: number): void => { engine.compose(work, view(i), 'high'); wc.getImageData(0, 0, 1, 1); };
    const setAdjust = (on: boolean): void => { for (const id of adjust) { const l = p.layer(id); if (l) l.visible = on; } };
    for (const [test, on] of [['Pan: blended and masked layers', false], ['Pan: with Levels and Hue/Saturation layers', true]] as const) {
      setAdjust(on);
      await frames(test, 'CPU', cpuFrame);
      const layers = engine.gpuLayers();
      for (const name of ['WebGPU', 'WebGL2']) {
        const d = displays.find(([k]) => k === name)?.[1];
        if (opts.signal?.aborted) break;
        if (!d) { skip(test, name, 'not available here'); continue; }
        if (stuck.has(name)) { skip(test, name, stuck.get(name) ?? ''); continue; }
        if ('reason' in layers) { notes.push(`${name}: ${test} draws on the CPU because the document has ${layers.reason}.`); skip(test, name, `draws on the CPU (${layers.reason})`); continue; }
        await frames(test, name, (i) => d.timedFrame(layers.layers, view(i), ZOOM, rect, { ...CHECKER, origin: [view(i)[4], view(i)[5]] }, W, H));
      }
    }
    // Painting: a dab on a layer each frame. The CPU stage redraws only the dab's region; the GPU redraws the frame with
    // the painted layer uploaded again, as a live stroke does.
    const dab = (i: number): { x: number; y: number } => {
      const x = 300 + ((i * 41) % 1400), y = 200 + ((i * 29) % 1000), c = paint.ctx;
      c.fillStyle = 'rgba(40,40,40,0.5)'; c.beginPath(); c.arc(x, y, 30, 0, Math.PI * 2); c.fill(); paint.touch();
      return { x, y };
    };
    const region = createSurface(1, 1), rc = ctxOf(region);
    const paintTest = 'Paint: a dab per frame';
    if (!opts.signal?.aborted) await frames(paintTest, 'CPU (region redraw)', (i) => {
      const { x, y } = dab(i), s = Math.ceil(64 * ZOOM) + 2;
      sizeSurface(region, s, s);
      engine.compose(region, [ZOOM, 0, 0, ZOOM, -(x - 32) * ZOOM, -(y - 32) * ZOOM], 'high');
      rc.getImageData(0, 0, 1, 1);
    });
    for (const name of ['WebGPU', 'WebGL2']) {
      const d = displays.find(([k]) => k === name)?.[1], path = `${name} (full frame)`;
      if (opts.signal?.aborted) break;
      if (!d) { skip(paintTest, path, 'not available here'); continue; }
      if (stuck.has(name)) { skip(paintTest, path, stuck.get(name) ?? ''); continue; }
      await frames(paintTest, path, async (i) => {
        dab(i);
        const layers = engine.gpuLayers();
        if ('layers' in layers) await d.timedFrame(layers.layers, view(0), ZOOM, rect, CHECKER, W, H);
      });
    }
  } finally {
    for (const [, d] of displays) d.destroy();
    if (docId) engine.closeProject(docId);
    if (previous) engine.switchTo(previous);
  }
  if (cancelled || opts.signal?.aborted) notes.push('Cancelled: the paths not reached are not listed.');
  return { rows, doc: '2000 x 1500 px: a gradient, 3 blended layers (one masked), Levels and Hue/Saturation', view: `${W} x ${H} px at ${ZOOM * 100}%`, notes, peakHeapMb: peak === null ? null : Math.round(peak * 10) / 10, cancelled: cancelled || !!opts.signal?.aborted };
}

/** The result as plain text, to copy into the build notes. */
/** Whether each GPU display draws what the CPU draws (1.61.7, the register's H4: Automatic must pick the fastest
 *  *correct* path): the benchmark document through each display at a quarter size over the checkerboard, against the
 *  CPU's picture through the same view, as the display tests compare them; the largest difference in any colour
 *  channel of any pixel, 0 to 255 (the display tests allow 4). The document is closed and the previous one restored. */
export async function checkPaths(engine: Engine): Promise<Array<{ path: string; maxDiff: number; share: number }>> {
  const previous = engine.current?.id ?? null, out: Array<{ path: string; maxDiff: number; share: number }> = [];
  let docId: string | null = null;
  try {
    build(engine);
    docId = engine.current?.id ?? null;
    const p = engine.current;
    if (!p) return out;
    // At actual size, a window into the middle of the document: nothing resampled, so a difference is the path's own
    // (at a quarter size the CPU's and the GPU's downscaling filters differ at edges by design: 25 levels here).
    const zoom = 1, ox = Math.round(-p.doc.width / 2 + 280), oy = Math.round(-p.doc.height / 2 + 200), Wv = 560, Hv = 400;
    const x0 = Math.max(0, ox), y0 = Math.max(0, oy), x1 = Math.min(Wv, Math.ceil(ox + p.doc.width * zoom)), y1 = Math.min(Hv, Math.ceil(oy + p.doc.height * zoom));
    const checker: Checker = { ...CHECKER, origin: [ox, oy] }, cell = checker.cell, view: Mat = [zoom, 0, 0, zoom, ox, oy];
    const s = createSurface(Wv, Hv), c = ctxOf(s);
    for (let y = y0; y < y1; y += cell) {
      for (let x = x0; x < x1; x += cell) {
        const odd = (Math.floor((x - ox) / cell) + Math.floor((y - oy) / cell)) % 2 !== 0;
        c.fillStyle = `rgb(${(odd ? checker.b : checker.a).join(',')})`;
        c.fillRect(x, y, Math.min(cell, x1 - x), Math.min(cell, y1 - y));
      }
    }
    const work = createSurface(x1 - x0, y1 - y0);
    engine.compose(work, [zoom, 0, 0, zoom, ox - x0, oy - y0], 'high');
    c.drawImage(work, x0, y0);
    const cpu = c.getImageData(0, 0, Wv, Hv).data, g = engine.gpuLayers();
    if (!('layers' in g)) return out;   // not drawable on the GPU: nothing to compare
    const layers = g.layers;
    // The largest difference, and the share of values within 4 levels: the bar the GPU adjustment tests use, since the
    // layers below differ by up to 3 levels between GPU and canvas compositing and an adjustment can amplify one level.
    const diff = (path: string, gpu: Uint8ClampedArray): { path: string; maxDiff: number; share: number } => {
      let m = 0, n = 0, within = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let k = 0; k < 3; k++) { const i = (y * Wv + x) * 4 + k, d = Math.abs(cpu[i] - gpu[i]); m = Math.max(m, d); n++; if (d <= 4) within++; }
      return { path, maxDiff: m, share: n ? within / n : 1 };
    };
    const gpu = await GpuDisplay.create(document.createElement('canvas'));
    if (gpu) { out.push(diff('WebGPU', await gpu.renderToPixels(layers, view, zoom, [x0, y0, x1, y1], checker, Wv, Hv))); gpu.destroy(); }
    const gl = GlDisplay.create(document.createElement('canvas'));
    if (gl) { out.push(diff('WebGL2', await gl.renderToPixels(layers, view, zoom, [x0, y0, x1, y1], checker, Wv, Hv))); gl.destroy(); }
  } finally {
    if (docId) engine.closeProject(docId);
    if (previous) engine.switchTo(previous);
  }
  return out;
}

export function resultWord(x: BenchRow): string {
  if (x.state === 'skipped') return `skipped: ${x.reason}`;
  if (x.state === 'cancelled' && !x.frames) return 'cancelled';
  return `${x.within ? 'within budget' : 'over budget'}${x.state === 'capped' ? ` (partial: ${x.reason})` : x.state === 'cancelled' ? ' (partial: cancelled)' : ''}`;
}

export function heapText(r: BenchResult): string {
  return r.peakHeapMb === null ? 'Peak JS heap: not available in this browser' : `Peak JS heap: ${r.peakHeapMb.toFixed(1)} MB`;
}

export function benchText(r: BenchResult, adapter: string, base: Baseline | null = null): string {
  const head = ['Test', 'Path', 'P50 ms', 'P95 ms', 'Budget ms', 'Frames', 'Result', 'Vs baseline'];
  const body = r.rows.map((x) => [x.test, x.path, x.frames ? x.medianMs.toFixed(2) : '-', x.frames ? x.p95Ms.toFixed(2) : '-', String(x.budgetMs), String(x.frames), resultWord(x), versus(x, base).text]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (c: string[]): string => c.map((x, i) => x.padEnd(w[i])).join('  ');
  return [`formvis performance benchmark`, `Graphics processor: ${adapter}`, `Document: ${r.doc}`, `View: ${r.view}`, heapText(r), '', line(head), ...body.map(line), ...(r.notes.length ? ['', ...r.notes] : [])].join('\n');
}

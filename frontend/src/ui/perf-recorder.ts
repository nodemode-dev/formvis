import type { Engine } from '../engine';
import { loadPrefs } from './prefs';
import { Dialog } from './dialogs';
import { el, setText } from './dom';

/** Help > Record Performance (1.86.4): times what formvis really does while the person uses it, on their own machine,
 *  so a slow desktop app is measured instead of guessed at. For the recording's length it wraps, and then restores:
 *  the engine's `emit` (every event and all its listeners, by event name), the stage's scene, overlay and ruler
 *  renders, the input events (time from the first listener to the last, by type), the 2D canvas calls that move
 *  pixels (getImageData, putImageData, drawImage), the WebGL uploads and reads, the WebGPU queue copies, and the gaps
 *  between animation frames. The report names the machine, the renderer and why, the document, and the engine's
 *  answer time, then every timed item by total time. `window.formvisPerf.record(seconds)` runs it from the Web
 *  Inspector's console in the desktop app too. */

interface Slot { n: number; ms: number; max: number }
type Tally = Map<string, Slot>;

const add = (t: Tally, key: string, ms: number): void => {
  const s = t.get(key) ?? { n: 0, ms: 0, max: 0 };
  s.n++; s.ms += ms; s.max = Math.max(s.max, ms);
  t.set(key, s);
};

/** Replaces `obj[name]` with a timed version; returns the undo. */
function wrap(obj: object | undefined, name: string, key: string, t: Tally): () => void {
  const o = obj as Record<string, unknown> | undefined;
  const fn = o?.[name];
  if (!o || typeof fn !== 'function') return () => undefined;
  const own = Object.prototype.hasOwnProperty.call(o, name);
  o[name] = function (this: unknown, ...args: unknown[]): unknown {
    const t0 = performance.now();
    try { return (fn as (...a: unknown[]) => unknown).apply(this, args); } finally { add(t, key, performance.now() - t0); }
  };
  return () => { if (own) o[name] = fn; else delete o[name]; };
}

export interface PerfContext { engine: Engine; stage: object; gpuText: () => string }

export async function recordPerformance(ctx: PerfContext, seconds = 10): Promise<string> {
  const t: Tally = new Map(), undo: Array<() => void> = [];
  const g = globalThis as unknown as Record<string, { prototype: object } | undefined>;
  // The engine's events: `this.emit` inside the engine finds the instance's own property first.
  const engine = ctx.engine as unknown as { emit: (k: string, p: unknown) => void };
  const emit = engine.emit;
  engine.emit = (k: string, p: unknown) => { const t0 = performance.now(); try { emit.call(ctx.engine, k, p); } finally { add(t, `engine event "${k}" (all listeners)`, performance.now() - t0); } };
  undo.push(() => { delete (engine as unknown as Record<string, unknown>).emit; if (engine.emit !== emit) engine.emit = emit; });
  for (const [name, label] of [['renderScene', 'stage: draw the canvas'], ['renderOverlay', 'stage: draw the overlay'], ['renderRulers', 'stage: draw the rulers']] as const) undo.push(wrap(ctx.stage, name, label, t));
  for (const c of ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D']) {
    for (const m of ['getImageData', 'putImageData', 'drawImage']) undo.push(wrap(g[c]?.prototype, m, `2D canvas ${m}`, t));
  }
  for (const m of ['texImage2D', 'texSubImage2D', 'readPixels']) undo.push(wrap(g.WebGL2RenderingContext?.prototype, m, `WebGL2 ${m}`, t));
  for (const m of ['copyExternalImageToTexture', 'writeTexture', 'submit']) undo.push(wrap(g.GPUQueue?.prototype, m, `WebGPU ${m}`, t));
  // Input: window's capture listener runs first and its bubble listener last, so the gap is every handler's time.
  const started = new Map<Event, number>();
  const types = ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'input', 'click'];
  const begin = (e: Event): void => { started.set(e, performance.now()); };
  const finish = (e: Event): void => { const t0 = started.get(e); if (t0 !== undefined) { started.delete(e); add(t, `input "${e.type}" (all handlers)`, performance.now() - t0); } };
  for (const ty of types) { window.addEventListener(ty, begin, { capture: true }); window.addEventListener(ty, finish); }
  undo.push(() => { for (const ty of types) { window.removeEventListener(ty, begin, { capture: true }); window.removeEventListener(ty, finish); } });
  // Frames: the gaps between animation frames; past 50 ms the window visibly stutters.
  const gaps: number[] = [];
  let last = 0, running = true;
  const tick = (now: number): void => { if (last) gaps.push(now - last); last = now; if (running) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const wall0 = performance.now();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  running = false;
  const wall = performance.now() - wall0;
  for (const u of undo.reverse()) u();
  // The engine's answer time, five times.
  const pings: number[] = [];
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); try { await fetch('/api/health', { cache: 'no-store' }); pings.push(performance.now() - t0); } catch { pings.push(-1); } }
  return report(ctx, t, gaps, wall, pings);
}

function report(ctx: PerfContext, t: Tally, gaps: number[], wall: number, pings: number[]): string {
  const f = (x: number): string => x.toFixed(1);
  const sorted = [...gaps].sort((a, b) => a - b), q = (p: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
  const p = ctx.engine.current, pr = loadPrefs(), stage = ctx.stage as { gpuReason?: string | null; scene?: HTMLCanvasElement };
  const lines = [
    'formvis performance recording',
    `when: ${new Date().toISOString()}  seconds: ${f(wall / 1000)}`,
    `browser: ${navigator.userAgent}`,
    `desktop app: ${'__TAURI_INTERNALS__' in window ? 'yes' : 'no'}  screen scale: ${window.devicePixelRatio}  window: ${innerWidth} x ${innerHeight}  cores: ${navigator.hardwareConcurrency ?? '?'}`,
    `status bar: ${ctx.gpuText()}  canvas drawn on: ${stage.gpuReason === undefined ? '?' : stage.gpuReason ? `CPU, because ${stage.gpuReason}` : 'GPU'}`,
    `canvas pixels: ${stage.scene ? `${stage.scene.width} x ${stage.scene.height}` : '?'}  renderer pref: ${pr.renderer}  use GPU: ${pr.useGpu}  monitor profile pref: ${pr.colour?.useDisplay ?? '?'}  view colour table: ${ctx.engine.viewTransform ? 'on' : 'off'}`,
    `document: ${p ? `${p.doc.width} x ${p.doc.height}, ${p.doc.layers.length} layers, ${p.doc.mode ?? 'rgb'}` : 'none open'}  page elements: ${document.getElementsByTagName('*').length}`,
    `engine answer (ms): ${pings.map((x) => (x < 0 ? 'failed' : f(x))).join(', ')}`,
    `frames: ${gaps.length} (${f(gaps.length / (wall / 1000))} per second)  gap median ${f(q(0.5))} ms, 90% ${f(q(0.9))} ms, worst ${f(sorted[sorted.length - 1] ?? 0)} ms  stutters over 50 ms: ${gaps.filter((x) => x > 50).length}, over 200 ms: ${gaps.filter((x) => x > 200).length}`,
    '',
    'timed work, by total (ms; calls; average; worst):',
  ];
  const rows = [...t.entries()].sort((a, b) => b[1].ms - a[1].ms);
  for (const [k, s] of rows) lines.push(`  ${f(s.ms).padStart(9)}  ${String(s.n).padStart(6)}x  avg ${f(s.ms / s.n).padStart(7)}  worst ${f(s.max).padStart(7)}  ${k}`);
  if (!rows.length) lines.push('  nothing was timed: use the window while it records (paint, pan, zoom, drag a slider).');
  lines.push('', 'Engine events include the canvas and panel work their listeners do, so they overlap the other rows.');
  return lines.join('\n');
}

/** The report in a dialog, with Copy (a click, which the desktop web view needs for the clipboard) and Save. */
export class PerfDialog extends Dialog {
  private readonly text = el<HTMLTextAreaElement>('<textarea class="cv-perf-report" readonly spellcheck="false" rows="22"></textarea>');
  private readonly state = el('<p class="cv-note"></p>');
  private busy = false;

  constructor(private readonly ctx: PerfContext) {
    super('Record Performance', 760);
    this.text.style.cssText = 'width:100%;font:var(--fs-12)/1.45 var(--font-mono, monospace);white-space:pre;resize:vertical;';
    this.body.append(this.state, this.text);
    this.button('Close', 'ghost', () => this.close());
    this.button('Save', 'ghost', () => this.save());
    this.button('Copy', 'ghost', () => { this.text.select(); void navigator.clipboard?.writeText(this.text.value).catch(() => document.execCommand('copy')); });
    this.button('Record 10 Seconds', 'primary', () => void this.run());
  }

  show(): void {
    if (this.isOpen) return;
    setText(this.state, 'Press Record, then use formvis as you normally do for 10 seconds (paint, pan, zoom, drag a slider, open a panel). The dialog hides while it records and comes back with the report.');
    this.open();
  }

  async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.close();
    try {
      const out = await recordPerformance(this.ctx, 10);
      this.text.value = out;
      setText(this.state, 'Copy or Save this and send it to whoever is fixing formvis.');
      this.open();
    } finally { this.busy = false; }
  }

  private save(): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([this.text.value], { type: 'text/plain' }));
    a.download = `formvis-performance-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}

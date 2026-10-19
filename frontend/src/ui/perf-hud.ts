import { kernelStats } from '../engine/wasm-kernels';
import { gpuTiming } from '../gpu/gpu-timing';

/** View > Performance HUD: a small panel over the stage with the stage's frame time, the display's GPU pass time and the
 *  render path in use. The panel is built once; refreshing only assigns the three text nodes, a few times a second, and
 *  nothing is measured while it is hidden. */

export type HudPath = 'gpu' | 'cpu' | 'overlay';
const KEY = 'formvis.perfHud';
const KEEP = 90;
const EVERY = 250;

const state = { on: false, api: 'CPU', path: 'cpu' as 'gpu' | 'cpu', last: 0, draws: [] as number[], frames: 0 };
let box: HTMLElement | null = null;
let nodes: { frame: Text; gpu: Text; path: Text; kernels: Text } | null = null;
let raf = 0;

function saved(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
function keep(on: boolean): void { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* kept for this session only */ } }

function build(): void {
  const el = document.createElement('div');
  el.className = 'perf-hud';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;right:12px;bottom:36px;z-index:var(--z-companion);display:grid;grid-template-columns:auto minmax(15ch,auto);gap:2px 10px;padding:6px 10px;border:1px solid var(--border-light);border-radius:var(--radius);background:var(--bg-scrim);color:var(--text-primary);font:11px/1.45 var(--font-mono);font-variant-numeric:tabular-nums;pointer-events:none;white-space:nowrap';
  const made: Text[] = [];
  for (const label of ['Frame', 'GPU pass', 'Path', 'Kernels']) {
    const k = document.createElement('span');
    k.style.color = 'var(--text-secondary)';
    k.textContent = label;
    const v = document.createElement('span');
    const t = document.createTextNode('...');
    v.appendChild(t);
    el.append(k, v);
    made.push(t);
  }
  document.body.appendChild(el);
  box = el;
  nodes = { frame: made[0], gpu: made[1], path: made[2], kernels: made[3] };
}

function set(node: Text, text: string): void { if (node.data !== text) node.data = text; }

function refresh(): void {
  if (!nodes) return;
  const sorted = state.draws.slice().sort((a, b) => a - b);
  set(nodes.frame, sorted.length ? `${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms, worst ${sorted[sorted.length - 1].toFixed(1)} ms` : 'no frames yet');
  set(nodes.gpu, gpuTiming.ms !== null ? `${gpuTiming.ms.toFixed(2)} ms (${gpuTiming.source})` : state.path === 'gpu' ? 'no timer query here' : 'CPU draw');
  set(nodes.path, state.path === 'gpu' ? state.api : 'CPU');
  const ready = Object.entries(kernelStats().chunks).filter(([, c]) => c.state === 'ready').map(([name, c]) => `${name} ${c.calls}`);
  set(nodes.kernels, ready.length ? `WebAssembly ${ready.join(', ')}` : 'TypeScript');
}

function tick(now: number): void {
  raf = requestAnimationFrame(tick);
  if (now - state.last < EVERY) return;
  state.last = now;
  refresh();
}

function show(on: boolean): void {
  if (on === state.on) return;
  state.on = on;
  gpuTiming.on = on;
  if (on) {
    if (!box) build();
    if (box) box.hidden = false;
    state.draws = [];
    gpuTiming.ms = null;
    refresh();
    raf = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(raf);
    raf = 0;
    if (box) box.hidden = true;
  }
}

export const perfHud = {
  get on(): boolean { return state.on; },
  /** Builds the panel the first time the HUD is shown and restores last session's choice. */
  start(): void { if (saved()) show(true); },
  toggle(): void { keep(!state.on); show(!state.on); },
  /** The renderer in use ('WebGPU', 'WebGL2', 'Native GPU' or 'CPU'), told by the app when it changes. */
  setApi(api: string): void { state.api = api; },
  /** One stage frame: the milliseconds its draw took and the path that drew it. */
  note(draw: number, path: HudPath): void {
    if (!state.on) return;
    if (path !== 'overlay') state.path = path;
    state.draws.push(draw);
    if (state.draws.length > KEEP) state.draws.shift();
    state.frames++;
  },
};

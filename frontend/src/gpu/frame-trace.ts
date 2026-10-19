/** Frame and latency trace (View of the stage's frames, for Help > Frame Trace): while it is on, every frame the stage
 *  draws is timed from the moment it was asked for (an input or an engine change) to the end of the draw, split into
 *  the wait for the next animation frame and the draw itself, with the path that drew it. The draw time is the time the
 *  page spent submitting the frame, not the GPU's own completion time. Nothing is collected while it is off. */

export type FramePath = 'gpu' | 'cpu' | 'overlay';
export interface FrameSample { at: number; wait: number; draw: number; path: FramePath }

const KEEP = 20000;

export class FrameTrace {
  on = false;
  samples: FrameSample[] = [];
  /** The last GPU filter pass timed by a timestamp query while tracing, if the graphics processor offers the query. */
  gpu: { name: string; ms: number } | null = null;
  private t0 = 0;

  start(): void { this.samples = []; this.gpu = null; this.t0 = performance.now(); this.on = true; }
  noteGpu(name: string, ms: number | null): void { if (this.on && ms !== null) this.gpu = { name, ms }; }
  stop(): void { this.on = false; }

  record(asked: number, drawStart: number, drawEnd: number, path: FramePath): void {
    if (this.samples.length >= KEEP) this.samples.shift();
    this.samples.push({ at: drawStart - this.t0, wait: drawStart - asked, draw: drawEnd - drawStart, path });
  }

  /** Median, 90th percentile and worst of a field over the last `last` frames (all when omitted). */
  stat(field: 'wait' | 'draw' | 'total', last = 0): { n: number; median: number; p90: number; max: number } {
    const rows = last > 0 ? this.samples.slice(-last) : this.samples;
    const v = rows.map((s) => (field === 'total' ? s.wait + s.draw : s[field])).sort((a, b) => a - b);
    if (!v.length) return { n: 0, median: 0, p90: 0, max: 0 };
    return { n: v.length, median: v[Math.floor(v.length / 2)], p90: v[Math.min(v.length - 1, Math.floor(v.length * 0.9))], max: v[v.length - 1] };
  }

  /** One line for the overlay and the toast. */
  summary(last = 0): string {
    const t = this.stat('total', last), d = this.stat('draw', last);
    if (!t.n) return `Frame trace: no frames yet${this.gpu ? `; GPU ${this.gpu.name} ${this.gpu.ms.toFixed(1)} ms` : ''}`;
    const f = (x: number): string => x.toFixed(1);
    return `Frame trace: ${t.n} frames, ask to drawn ${f(t.median)} ms median, ${f(t.p90)} ms 90th, ${f(t.max)} ms worst; draw ${f(d.median)} ms median${this.gpu ? `; GPU ${this.gpu.name} ${f(this.gpu.ms)} ms` : ''}`;
  }

  csv(): string {
    const f = (x: number): string => x.toFixed(2);
    return ['ms,wait_ms,draw_ms,path', ...this.samples.map((s) => `${f(s.at)},${f(s.wait)},${f(s.draw)},${s.path}`)].join('\n');
  }
}

export const frameTrace = new FrameTrace();

/** Preferences > Performance > Frame pacing: the fewest milliseconds between two scene frames. 0 draws on every display
 *  refresh (the lowest latency); a larger value skips refreshes, which saves power and the processor on slow machines. */
export const FRAME_PACING: ReadonlyArray<readonly [string, string]> = [['0', 'Every display refresh (lowest latency)'], ['16', 'Up to 60 frames a second'], ['33', 'Up to 30 frames a second'], ['66', 'Up to 15 frames a second']];
export const framePacing = { minMs: 0, last: 0 };

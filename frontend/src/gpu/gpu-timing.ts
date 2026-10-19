/** GPU time of the stage's own frame for the performance HUD: a timestamp query around the display's passes (WebGL2:
 *  EXT_disjoint_timer_query_webgl2; WebGPU: the timestamp-query feature). Nothing is queried while the HUD is off, a
 *  frame is only timed when no earlier query is still waiting, and a counter the driver calls disjoint is dropped. */

export const gpuTiming: { on: boolean; ms: number | null; source: 'none' | 'webgl2' | 'webgpu' } = { on: false, ms: null, source: 'none' };

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

export class GlFrameTimer {
  private readonly ext: TimerExt | null;
  private open: WebGLQuery | null = null;
  private waiting: WebGLQuery | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  begin(): void {
    this.poll();
    if (!gpuTiming.on || !this.ext || this.open || this.waiting) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = q;
  }

  end(): void {
    if (!this.open || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.waiting = this.open;
    this.open = null;
  }

  private poll(): void {
    const q = this.waiting, gl = this.gl;
    if (!q || !this.ext || !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) { gpuTiming.ms = Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6; gpuTiming.source = 'webgl2'; }
    gl.deleteQuery(q);
    this.waiting = null;
  }
}

interface MappableBuffer { mapAsync(mode: number): Promise<void>; getMappedRange(): ArrayBuffer; unmap(): void }
interface TimedDevice { features: { has(name: string): boolean }; createQuerySet(d: { type: 'timestamp'; count: number }): unknown; createBuffer(d: { size: number; usage: number }): MappableBuffer }
interface TimedEncoder { resolveQuerySet(q: unknown, first: number, count: number, dest: unknown, offset: number): void; copyBufferToBuffer(src: unknown, from: number, dst: unknown, to: number, size: number): void }

const QUERY_RESOLVE = 0x200, COPY_SRC = 0x4, MAP_READ = 0x1, COPY_DST = 0x8;

/** The WebGPU twin: a timestamp at the start of the frame's first pass and another at the end of its last pass, resolved
 *  into a small buffer that is read back without waiting (a frame is only timed when the last read has come in). The
 *  device must have been created with the timestamp-query feature; without it every method does nothing. */
export class WgpuFrameTimer {
  private set: unknown = null;
  private resolveBuf: unknown = null;
  private readBuf: MappableBuffer | null = null;
  private busy = false;
  private armed = false;

  constructor(device: unknown) {
    try {
      const d = device as TimedDevice;
      if (!d.features.has('timestamp-query')) return;
      this.set = d.createQuerySet({ type: 'timestamp', count: 2 });
      this.resolveBuf = d.createBuffer({ size: 16, usage: QUERY_RESOLVE | COPY_SRC });
      this.readBuf = d.createBuffer({ size: 16, usage: MAP_READ | COPY_DST });
    } catch { this.set = null; }
  }

  /** Decides whether this frame is timed; `want` is false for frames that are not the screen's (the benchmark's). */
  arm(want: boolean): boolean {
    this.armed = want && gpuTiming.on && !!this.set && !this.busy;
    return this.armed;
  }

  first(): object { return this.armed ? { timestampWrites: { querySet: this.set, beginningOfPassWriteIndex: 0 } } : {}; }
  last(): object { return this.armed ? { timestampWrites: { querySet: this.set, endOfPassWriteIndex: 1 } } : {}; }

  finish(encoder: unknown): void {
    if (!this.armed || !this.resolveBuf || !this.readBuf) return;
    const e = encoder as TimedEncoder;
    e.resolveQuerySet(this.set, 0, 2, this.resolveBuf, 0);
    e.copyBufferToBuffer(this.resolveBuf, 0, this.readBuf, 0, 16);
  }

  /** After the frame was submitted. */
  read(): void {
    const buf = this.readBuf;
    if (!this.armed || !buf) return;
    this.armed = false;
    this.busy = true;
    buf.mapAsync(1).then(() => {
      const t = new BigUint64Array(buf.getMappedRange().slice(0));
      buf.unmap();
      if (t[1] > t[0]) { gpuTiming.ms = Number(t[1] - t[0]) / 1e6; gpuTiming.source = 'webgpu'; }
    }).catch(() => { this.set = null; }).finally(() => { this.busy = false; });
  }
}

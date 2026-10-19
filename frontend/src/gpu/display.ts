import { invert, mul, type BlendMode, type ChannelPixels, type GrainParams, type Mat } from '../engine';
import { COMPOSITE_WGSL, blendIndex } from './blend-wgsl';
import { MIP_WGSL, deepHalf, lodFor, mipLevels } from './deep-upload';
import { WgpuFrameTimer } from './gpu-timing';
import type { DisplayOptions } from './probe';
import { dirtyBox, trimResident, type UploadStats } from './residency';

/** The WebGPU flag values fixed by the specification (the project's type definitions carry the interfaces only). */
const TEX = { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 } as const;
const BUF = { MAP_READ: 0x0001, COPY_DST: 0x0008, UNIFORM: 0x0040 } as const;

export interface DisplayMask { image: HTMLCanvasElement | OffscreenCanvas; version: number; width: number; height: number; matrix: Mat }
/** A clipping base: its coverage (alpha x opacity x its mask) clips every layer that carries this same object; a base that is itself clipped has the base it is clipped to as `parent`, whose coverage limits its own. */
export interface DisplayClip { image: HTMLCanvasElement | OffscreenCanvas; deep?: ChannelPixels; linear?: boolean; version: number; width: number; height: number; matrix: Mat; opacity: number; mask?: DisplayMask; parent?: DisplayClip }
/** A layer's Blend If: the channel tested (1 grey, 2 red, 3 green, 4 blue) and the four-point ranges of the layer and of what is under it. */
export interface DisplayBlendIf { channel: 1 | 2 | 3 | 4; thisLayer: readonly [number, number, number, number]; underlying: readonly [number, number, number, number] }
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; lut3?: boolean; grain?: GrainParams; mask?: DisplayMask; clip?: DisplayClip; folders?: DisplayMask[]; blendIf?: DisplayBlendIf; chOff?: number; deep?: ChannelPixels; linear?: boolean; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode;
  /** A folder or clipped group: these layers composite alone from clear, then draw as one layer at this entry's opacity and blend mode. */
  sub?: readonly DisplayLayer[];
  /** Knockout: `back` is the composite the layer shows through its coverage, `opacity` the layer's opacity without its fill. */
  ko?: { opacity: number; back: readonly DisplayLayer[] } }
/** The shader flags carried in chOff above the three channel bits: Knockout on, and a finished screen-sized composite as the source. */
export const KO_FLAG = 8;
export const SCREEN_FLAG = 16;
/** Whether any layer in the list, or in a group or knockout backdrop inside it, satisfies the test. */
export const anyLayer = (list: readonly DisplayLayer[], test: (l: DisplayLayer) => boolean): boolean => list.some((l) => test(l) || (l.sub ? anyLayer(l.sub, test) : false) || (l.ko ? anyLayer(l.ko.back, test) : false));
/** The shader mode that renders a clipping base's coverage, and a folder mask's coverage (no source image). */
export const CLIP_MODE = 102;
export const FOLDER_MODE = 103;
/** The shader modes for an adjustment's lookup table (Phase 18.5), after the 27 blend modes: per channel, and 3D. */
export const LUT_MODE = 100;
export const LUT3_MODE = 101;
/** A Grain adjustment, computed per screen pixel from document coordinates; only the WebGL2 display draws it. */
export const GRAIN_MODE = 104;
export interface Checker { a: [number, number, number]; b: [number, number, number]; cell: number; origin: [number, number] }
/** What the stage draws through: the WebGPU display or the WebGL2 one (gl-display.ts), each on its own canvas. */
export interface ScreenDisplay {
  readonly canvas: HTMLCanvasElement;
  readonly maxTexture: number;
  onLost: (() => void) | null;
  /** Bytes of idle layer textures kept warm beyond a frame's own, the least recently drawn freed first; 0 frees them at once. */
  budgetBytes?: number;
  /** Frees every texture the last frame did not draw (the background documents') when together they hold more than `above` bytes; returns the bytes freed. */
  releaseIdle?(above: number): number;
  /** Texture uploads so far: calls, the tile-sized ones among them, and bytes sent. */
  readonly stats?: UploadStats;
  /** Whether Preferences lets a 32 bit document present in high dynamic range, and the call that applies it for the frame about to be drawn; returns whether the display now presents in HDR. */
  hdrAllowed?: boolean;
  hdr?(want: boolean): boolean;
  render(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker): void;
  /** The document's size in its pixels, told before render; the native display needs it, the others do not have it. */
  document?(width: number, height: number): void;
  /** What of this document the display cannot draw yet, as a reason for the status bar, or null; the stage then draws
   *  on the CPU, as for its own fallback rules. Only displays with limits of their own (the native one) have it. */
  unsupported?(layers: readonly DisplayLayer[]): string | null;
  destroy(): void;
}

/** The last pass: the checkerboard under the document (colour A, B in alternate cells from the document's origin, as
 *  the stage's pattern), the composite over it, nothing outside the document's rectangle; premultiplied for the canvas. */
const PRESENT_WGSL = /* wgsl */ `
struct Present { rect: vec4<f32>, a: vec4<f32>, b: vec4<f32>, originCell: vec4<f32> };
@group(0) @binding(0) var img: texture_2d<f32>;
@group(0) @binding(1) var<uniform> pr: Present;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  if (pos.x < pr.rect.x || pos.y < pr.rect.y || pos.x >= pr.rect.z || pos.y >= pr.rect.w) { return vec4<f32>(0.0); }
  let cell = floor((pos.xy - pr.originCell.xy) / pr.originCell.z);
  var bg = pr.a.rgb;
  if ((i32(cell.x) + i32(cell.y)) % 2 != 0) { bg = pr.b.rgb; }
  let c = textureLoad(img, vec2<i32>(floor(pos.xy)), 0);
  return vec4<f32>(c.rgb * c.a + bg * (1.0 - c.a), 1.0);
}
`;

/** The display on the GPU (Phase 18.2b): the document's layers composited at screen resolution through the view, with
 *  the engine-exact blend shader the GPU blender tests check, then presented over the checkerboard. Layer textures are
 *  kept while their raster's version is unchanged (a live preview, version -1, uploads every frame) and released when
 *  a frame no longer uses them. `create` returns null where WebGPU cannot start; `onLost` fires if the device is lost. */
export class GpuDisplay {
  private readonly cache = new Map<object, { tex: GPUTexture; version: number; w: number; h: number; bytes: number; seen: number; at: number; src: unknown; mipAt: number }>();
  private acc: [GPUTexture, GPUTexture] | null = null;
  onLost: (() => void) | null = null;
  budgetBytes = 0;
  hdrAllowed = true;
  sdrFormat: GPUTextureFormat = 'rgba8unorm';
  private hdrOn = false;
  private readonly pipes = new Map<string, GPURenderPipeline>();
  private shaders: Record<'composite' | 'present' | 'mip', GPUShaderModule> | null = null;
  private mipSampler: GPUSampler | null = null;
  private retired: GPUTexture[] = [];
  readonly stats: UploadStats = { uploads: 0, tiled: 0, bytes: 0 };
  private frameNo = 0;
  private readonly timer: WgpuFrameTimer;

  private constructor(readonly canvas: HTMLCanvasElement, private readonly device: GPUDevice, private readonly ctx: GPUCanvasContext,
    private readonly composite: GPURenderPipeline, private readonly present: GPURenderPipeline, private readonly presentOff: GPURenderPipeline,
    private readonly linear: GPUSampler, private readonly nearest: GPUSampler) {
    this.timer = new WgpuFrameTimer(device);
    void device.lost.then((info) => {
      // destroy() also resolves this promise, with reason 'destroyed': switching renderers, not a failure.
      if (info.reason === 'destroyed') return;
      console.warn(`formvis: the GPU device was lost (${info.reason}): ${info.message}`);
      this.onLost?.();
    });
  }

  static async create(canvas: HTMLCanvasElement, options: DisplayOptions = { power: 'high-performance', lowLatency: false }): Promise<GpuDisplay | null> {
    try {
      const gpu = (navigator as unknown as { gpu?: GPU }).gpu;
      const adapter = gpu ? await gpu.requestAdapter(options.power === 'default' ? {} : { powerPreference: options.power }) : null;
      if (!gpu || !adapter) { console.warn('formvis: WebGPU has no adapter here'); return null; }
      const timed = (adapter as unknown as { features: { has(name: string): boolean } }).features.has('timestamp-query');
      const device = await adapter.requestDevice((timed ? { requiredFeatures: ['timestamp-query'] } : undefined) as never);
      const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!ctx) { console.warn('formvis: the display canvas gives no WebGPU context'); return null; }
      const format = gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: 'premultiplied' });
      const cm = device.createShaderModule({ code: COMPOSITE_WGSL }), pm = device.createShaderModule({ code: PRESENT_WGSL });
      const composite = device.createRenderPipeline({ layout: 'auto', vertex: { module: cm, entryPoint: 'vs' }, fragment: { module: cm, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
      const present = device.createRenderPipeline({ layout: 'auto', vertex: { module: pm, entryPoint: 'vs' }, fragment: { module: pm, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
      const presentOff = device.createRenderPipeline({ layout: 'auto', vertex: { module: pm, entryPoint: 'vs' }, fragment: { module: pm, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
      const edge = { addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' } as const;
      const display = new GpuDisplay(canvas, device, ctx, composite, present, presentOff, device.createSampler({ ...edge, magFilter: 'linear', minFilter: 'linear' }), device.createSampler({ ...edge, magFilter: 'nearest', minFilter: 'nearest' }));
      display.sdrFormat = format;
      return display;
    } catch (err) {
      console.warn('formvis: WebGPU could not start:', err);
      return null;
    }
  }

  /** The largest texture side this device takes (maxTextureDimension2D). */
  get maxTexture(): number { return this.device.limits.maxTextureDimension2D; }

  /** The pipeline for a shader and target format, made on first use: the half-float composite, the HDR present and the mip pass. */
  private pipe(kind: 'composite' | 'present' | 'mip', format: GPUTextureFormat): GPURenderPipeline {
    const key = `${kind}:${format}`, have = this.pipes.get(key);
    if (have) return have;
    const d = this.device;
    this.shaders ??= { composite: d.createShaderModule({ code: COMPOSITE_WGSL }), present: d.createShaderModule({ code: PRESENT_WGSL }), mip: d.createShaderModule({ code: MIP_WGSL }) };
    const module = this.shaders[kind], made = d.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
    this.pipes.set(key, made);
    return made;
  }

  /** Presents the canvas in half float with extended tone mapping (values past 1.0 brighter than SDR white) when the
   *  caller wants it, Preferences allows it and the display reports a high dynamic range; otherwise in the preferred
   *  8-bit format. Reconfigures only on a change; returns whether the canvas now presents in HDR. */
  hdr(want: boolean): boolean {
    let on = false;
    try { on = want && this.hdrAllowed && typeof matchMedia === 'function' && matchMedia('(dynamic-range: high)').matches; } catch { on = false; }
    if (on === this.hdrOn) return on;
    this.hdrOn = on;
    this.ctx.configure({ device: this.device, format: on ? 'rgba16float' : this.sdrFormat, alphaMode: 'premultiplied', ...(on ? { toneMapping: { mode: 'extended' } } : {}) } as unknown as GPUCanvasConfiguration);
    return on;
  }

  unsupported(layers: readonly DisplayLayer[]): string | null { return anyLayer(layers, (l) => !!l.grain) ? 'a Grain adjustment layer is drawn by the WebGL2 display, not WebGPU' : null; }

  /** One frame: `view` maps document pixels to canvas pixels; `rect` is the document's visible rectangle on the canvas
   *  (x0, y0, x1, y1). Sampling is nearest from 200% zoom up, as the CPU path draws it. With `out` the frame goes to that
   *  rgba8unorm texture instead of the canvas: every pass the same but the last one's target. */
  render(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker, out?: GPUTexture): void {
    const d = this.device, W = out ? out.width : this.canvas.width, H = out ? out.height : this.canvas.height;
    if (W < 1 || H < 1) return;
    this.frameNo++;
    // A frame with a deep layer (or an HDR canvas) composites in half float; every other frame stays 8-bit, as before.
    const accFormat: GPUTextureFormat = this.hdrOn || anyLayer(layers, (l) => !!l.deep) ? 'rgba16float' : 'rgba8unorm';
    if (!this.acc || this.acc[0].width !== W || this.acc[0].height !== H || this.acc[0].format !== accFormat) {
      this.acc?.forEach((t) => t.destroy());
      const make = (): GPUTexture => d.createTexture({ size: [W, H], format: accFormat, usage: TEX.TEXTURE_BINDING | TEX.RENDER_ATTACHMENT });
      this.acc = [make(), make()];
    }
    let [a, b] = this.acc;
    const enc = d.createCommandEncoder(), used = new Set<object>(), buffers: GPUBuffer[] = [], sampler = zoom >= 2 ? this.nearest : zoom < 0.5 ? this.mipLinear() : this.linear;
    this.timer.arm(!out);
    enc.beginRenderPass({ colorAttachments: [{ view: a.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }], ...this.timer.first() }).end();
    // Each clipping base's coverage, once per frame, into its own screen-sized texture (mode 102).
    const clipTex = new Map<DisplayClip, GPUTexture>(), folderTex = new Map<object, GPUTexture>();
    let slot = 0;
    const clipCover = (c: DisplayClip): GPUTexture => {
      const have = clipTex.get(c);
      if (have) return have;
      const up = c.parent ? clipCover(c.parent) : null, t = this.clipTarget(slot++, W, H);
      this.layerPass(enc, this.blank(), t, { image: c.image, deep: c.deep, linear: c.linear, version: c.version, width: c.width, height: c.height, matrix: c.matrix, opacity: c.opacity, blend: 'normal', mask: c.mask }, CLIP_MODE, up, sampler, view, used, buffers);
      clipTex.set(c, t);
      return t;
    };
    // A list of layers over `a` (cleared by the caller), `b` spare; a folder, clipped group or knockout backdrop inside it runs the same way on a pair of its own from the pool, one depth down.
    const run = (list: readonly DisplayLayer[], a: GPUTexture, b: GPUTexture, depth: number): GPUTexture => {
      for (const l of list) if (l.clip) clipCover(l.clip);
      // Each folder chain's coverage (one pass per folder mask, each times the chain so far), into the same pool.
      for (const l of list) {
        if (!l.folders || folderTex.has(l.clip ? l : l.folders)) continue;
        let prev: GPUTexture | null = l.clip ? clipTex.get(l.clip) ?? null : null;
        for (const mk of l.folders) {
          const t = this.clipTarget(slot++, W, H);
          this.layerPass(enc, this.blank(), t, { image: null, version: 0, width: 1, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: 1, blend: 'normal', mask: mk }, FOLDER_MODE, prev, sampler, view, used, buffers);
          prev = t;
        }
        if (prev) folderTex.set(l.clip ? l : l.folders, prev);
      }
      const alone = (inner: readonly DisplayLayer[]): GPUTexture => {
        const [x, y] = this.subPair(depth, W, H, accFormat);
        enc.beginRenderPass({ colorAttachments: [{ view: x.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] }).end();
        return run(inner, x, y, depth + 1);
      };
      for (const l of list) {
        if (l.opacity <= 0 && !l.ko) continue;
        if (l.sub) {
          if (!l.sub.length) continue;
          this.layerPass(enc, a, b, l, blendIndex(l.blend), null, sampler, view, used, buffers, { screen: alone(l.sub) });
          [a, b] = [b, a];
          continue;
        }
        if (l.width < 1 || l.height < 1) continue;
        const cover = l.clip ? (l.folders ? folderTex.get(l) : clipTex.get(l.clip)) ?? null : l.folders ? folderTex.get(l.folders) ?? null : null;
        this.layerPass(enc, a, b, l, l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend), cover, sampler, view, used, buffers, l.ko ? { ko: alone(l.ko.back) } : undefined);
        [a, b] = [b, a];
      }
      return a;
    };
    a = run(layers, a, b, 0);
    const pu = d.createBuffer({ size: 64, usage: BUF.UNIFORM | BUF.COPY_DST });
    d.queue.writeBuffer(pu, 0, new Float32Array([...rect, ...checker.a.map((v) => v / 255), 1, ...checker.b.map((v) => v / 255), 1, checker.origin[0], checker.origin[1], checker.cell, 0]));
    buffers.push(pu);
    const pipe = out ? (out.format === 'rgba8unorm' ? this.presentOff : this.pipe('present', out.format)) : this.hdrOn ? this.pipe('present', 'rgba16float') : this.present;
    const pbind = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: a.createView() }, { binding: 1, resource: { buffer: pu } }] });
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: (out ?? this.ctx.getCurrentTexture()).createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }], ...this.timer.last() });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, pbind);
    pass.draw(3);
    pass.end();
    this.timer.finish(enc);
    d.queue.submit([enc.finish()]);
    this.timer.read();
    for (const u of buffers) u.destroy();
    for (const t of this.retired) t.destroy();
    this.retired.length = 0;
    trimResident(this.cache, this.frameNo, this.budgetBytes, performance.now(), (e) => e.tex.destroy());
  }

  /** One frame into an offscreen target, resolved only when the GPU has finished it: the performance benchmark's unit
   *  (Phase 18.7), timing the drawing itself rather than when the work was queued. */
  private benchTarget: GPUTexture | null = null;
  async timedFrame(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker, W: number, H: number): Promise<void> {
    if (!this.benchTarget || this.benchTarget.width !== W || this.benchTarget.height !== H) {
      this.benchTarget?.destroy();
      this.benchTarget = this.device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: TEX.RENDER_ATTACHMENT | TEX.COPY_SRC });
    }
    this.render(layers, view, zoom, rect, checker, this.benchTarget);
    await this.device.queue.onSubmittedWorkDone();
  }

  /** A frame through every display pass into an offscreen texture, read back: how the display's output is checked
   *  against the CPU where presenting to a canvas is not possible (a software adapter). */
  async renderToPixels(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker, W: number, H: number): Promise<Uint8ClampedArray> {
    const d = this.device, out = d.createTexture({ size: [W, H], format: 'rgba8unorm', usage: TEX.RENDER_ATTACHMENT | TEX.COPY_SRC });
    this.render(layers, view, zoom, rect, checker, out);
    const row = Math.ceil((W * 4) / 256) * 256, buf = d.createBuffer({ size: row * H, usage: BUF.COPY_DST | BUF.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: out }, { buffer: buf, bytesPerRow: row }, [W, H]);
    d.queue.submit([enc.finish()]);
    await buf.mapAsync(0x1);
    const src = new Uint8Array(buf.getMappedRange()), px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) px.set(src.subarray(y * row, y * row + W * 4), y * W * 4);
    buf.unmap();
    buf.destroy();
    out.destroy();
    return px;
  }

  /** The same frame into a half-float target, read back as half-float bits (RGBA, W by H): the pipeline an HDR canvas
   *  presents through, with nothing clamped or rounded to 8 bits. */
  async renderToHalf(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker, W: number, H: number): Promise<Uint16Array> {
    const d = this.device, out = d.createTexture({ size: [W, H], format: 'rgba16float', usage: TEX.RENDER_ATTACHMENT | TEX.COPY_SRC });
    this.render(layers, view, zoom, rect, checker, out);
    const row = Math.ceil((W * 8) / 256) * 256, buf = d.createBuffer({ size: row * H, usage: BUF.COPY_DST | BUF.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: out }, { buffer: buf, bytesPerRow: row }, [W, H]);
    d.queue.submit([enc.finish()]);
    await buf.mapAsync(0x1);
    const src = new Uint16Array(buf.getMappedRange()), bits = new Uint16Array(W * H * 4), perRow = row / 2;
    for (let y = 0; y < H; y++) bits.set(src.subarray(y * perRow, y * perRow + W * 4), y * W * 4);
    buf.unmap();
    buf.destroy();
    out.destroy();
    return bits;
  }

  /** One composite pass: `l` over `backdrop` into `target`, in shader `mode`, clipped by `clip` (a coverage texture). */
  private layerPass(enc: GPUCommandEncoder, backdrop: GPUTexture, target: GPUTexture, l: DisplayLayer, mode: number, clip: GPUTexture | null, sampler: GPUSampler, view: Mat, used: Set<object>, buffers: GPUBuffer[], extra?: { screen?: GPUTexture; ko?: GPUTexture }): void {
    const d = this.device;
    if (mode !== FOLDER_MODE && !extra?.screen) used.add(l.lut ?? (l.image as object));
    const lod = mode < LUT_MODE && !extra?.screen ? lodFor(mul(view, l.matrix), l.width, l.height) : 0, pipe = target.format === 'rgba8unorm' ? this.composite : this.pipe('composite', target.format);
    const tex = extra?.screen ?? (mode === FOLDER_MODE ? this.blank() : this.texture(l, lod > 0));
    const [ia, ib, ic, id, ie, iff] = invert(mul(view, l.matrix));
    // 224 bytes, WGSL's layout: inv (0), size (48), opacity (56), mode (60), the mask's inverse placement (64), its
    // size (112), whether there is one (120), whether the layer is clipped (124), the view's inverse (128), Blend If's
    // ranges (176, 192) and channel (208), the channels switched off (212), the mip level sampled (216).
    const raw = new ArrayBuffer(224), f = new Float32Array(raw), u32 = new Uint32Array(raw), [va, vb, vc, vd, ve, vf] = invert(view);
    f.set([ia, ib, 0, 0, ic, id, 0, 0, ie, iff, 1, 0, l.width, l.height, Math.min(1, Math.max(0, l.opacity))]);
    f.set([va, vb, 0, 0, vc, vd, 0, 0, ve, vf, 1, 0], 32);
    u32[15] = mode;
    if (l.blendIf) { f.set(l.blendIf.thisLayer, 44); f.set(l.blendIf.underlying, 48); u32[52] = l.blendIf.channel; }
    u32[53] = (l.chOff ?? 0) | (extra?.ko ? KO_FLAG : 0) | (extra?.screen ? SCREEN_FLAG : 0);
    f[54] = lod;
    f[55] = l.ko ? Math.min(1, Math.max(0, l.ko.opacity)) : 0;
    let maskTex = this.blank();
    if (l.mask) {
      const mk = l.mask, [ma, mb, mc, md, me, mf] = invert(mul(view, mk.matrix));
      f.set([ma, mb, 0, 0, mc, md, 0, 0, me, mf, 1, 0, mk.width, mk.height], 16);
      u32[30] = 1;
      used.add(mk.image);
      maskTex = this.texture({ image: mk.image, version: mk.version, width: mk.width, height: mk.height, matrix: mk.matrix, opacity: 1, blend: 'normal' });
    }
    if (clip) u32[31] = 1;
    const ub = d.createBuffer({ size: 224, usage: BUF.UNIFORM | BUF.COPY_DST });
    d.queue.writeBuffer(ub, 0, raw);
    buffers.push(ub);
    const bind = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: backdrop.createView() }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: sampler }, { binding: 3, resource: { buffer: ub } },
      { binding: 4, resource: maskTex.createView() }, { binding: 5, resource: (clip ?? this.blank()).createView() }, { binding: 6, resource: (extra?.ko ?? this.blank()).createView() },
    ] });
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
  }

  /** The i-th clip coverage texture at W x H, kept between frames and remade when the size changes. */
  private clipPool: GPUTexture[] = [];
  private clipTarget(i: number, W: number, H: number): GPUTexture {
    const t = this.clipPool[i];
    if (t && t.width === W && t.height === H) return t;
    t?.destroy();
    this.clipPool[i] = this.device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: TEX.TEXTURE_BINDING | TEX.RENDER_ATTACHMENT });
    return this.clipPool[i];
  }

  /** The pair of screen-sized textures a folder, clipped group or knockout backdrop at this depth composites on, kept between frames. */
  private subPool: GPUTexture[] = [];
  private subPair(depth: number, W: number, H: number, format: GPUTextureFormat): [GPUTexture, GPUTexture] {
    for (const i of [depth * 2, depth * 2 + 1]) {
      const t = this.subPool[i];
      if (t && t.width === W && t.height === H && t.format === format) continue;
      t?.destroy();
      this.subPool[i] = this.device.createTexture({ size: [W, H], format, usage: TEX.TEXTURE_BINDING | TEX.RENDER_ATTACHMENT });
    }
    return [this.subPool[depth * 2], this.subPool[depth * 2 + 1]];
  }

  /** A 1 x 1 texture bound where a layer has no mask (the binding must always be filled; the shader ignores it). */
  private blankTex: GPUTexture | null = null;
  private blank(): GPUTexture {
    this.blankTex ??= this.device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: TEX.TEXTURE_BINDING | TEX.COPY_DST });
    return this.blankTex;
  }

  /** A texture for a layer's pixels: half float for a deep layer, else 8-bit; a mip chain only when asked (below). */
  private make(w: number, h: number, format: GPUTextureFormat, mips: boolean): GPUTexture {
    return this.device.createTexture({ size: [w, h], format, mipLevelCount: mips ? mipLevels(w, h) : 1, usage: TEX.TEXTURE_BINDING | TEX.COPY_DST | TEX.COPY_SRC | TEX.RENDER_ATTACHMENT });
  }

  private mipLinear(): GPUSampler {
    this.mipSampler ??= this.device.createSampler({ addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' });
    return this.mipSampler;
  }

  /** Fills every level below the first with the mean of the 2 by 2 block above it. */
  private fillMips(tex: GPUTexture): void {
    const d = this.device, pipe = this.pipe('mip', tex.format), enc = d.createCommandEncoder();
    for (let i = 1; i < tex.mipLevelCount; i++) {
      const bind = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: tex.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }) }] });
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView({ baseMipLevel: i, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
    }
    d.queue.submit([enc.finish()]);
  }

  private texture(l: DisplayLayer, mips = false): GPUTexture {
    const key = l.lut ?? (l.image as object), deep = !!l.deep && !l.lut, format: GPUTextureFormat = deep ? 'rgba16float' : 'rgba8unorm';
    let e = this.cache.get(key);
    if (e && (e.w !== l.width || e.h !== l.height || e.tex.format !== format)) { this.retired.push(e.tex); e = undefined; }
    if (!e) {
      e = { tex: this.make(l.width, l.height, format, false), version: NaN, w: l.width, h: l.height, bytes: l.width * l.height * (deep ? 8 : 4), seen: 0, at: 0, src: null, mipAt: NaN };
      this.cache.set(key, e);
    }
    e.seen = this.frameNo;
    e.at = performance.now();
    if (deep && e.src !== l.deep) { e.src = l.deep; e.version = NaN; e.mipAt = NaN; }
    if (l.lut) {
      // A table is fixed for its settings (a new table comes with new settings), so it is written once, at its own size.
      if (Number.isNaN(e.version)) { this.device.queue.writeTexture({ texture: e.tex }, l.lut, { bytesPerRow: l.width * 4 }, [l.width, l.height]); e.version = 0; this.stats.uploads++; this.stats.bytes += e.bytes; }
    } else if (l.image && (l.version < 0 || e.version !== l.version)) {
      // A changed layer sends only the 256 px tiles its raster says changed since this texture was written.
      const box = l.version < 0 ? null : dirtyBox(l.image, e.version, l.version, l.width, l.height);
      if (deep && l.deep) {
        const part = box ?? { x: 0, y: 0, w: l.width, h: l.height };
        this.device.queue.writeTexture({ texture: e.tex, origin: [part.x, part.y] }, deepHalf(l.deep, !!l.linear, part), { bytesPerRow: part.w * 8 }, [part.w, part.h]);
        if (box) this.stats.tiled++;
        this.stats.bytes += part.w * part.h * 8;
      } else if (box) {
        this.device.queue.copyExternalImageToTexture({ source: l.image, origin: [box.x, box.y] }, { texture: e.tex, origin: [box.x, box.y], premultipliedAlpha: true }, [box.w, box.h]);
        this.stats.tiled++;
        this.stats.bytes += box.w * box.h * 4;
      } else {
        this.device.queue.copyExternalImageToTexture({ source: l.image }, { texture: e.tex, premultipliedAlpha: true }, [l.width, l.height]);
        this.stats.bytes += e.bytes;
      }
      this.stats.uploads++;
      e.version = l.version;
    }
    if (mips && !l.lut && Math.max(l.width, l.height) > 1) {
      if (e.tex.mipLevelCount < 2) {
        const fresh = this.make(l.width, l.height, format, true), enc = this.device.createCommandEncoder();
        enc.copyTextureToTexture({ texture: e.tex }, { texture: fresh }, [l.width, l.height]);
        this.device.queue.submit([enc.finish()]);
        this.retired.push(e.tex);
        e.tex = fresh;
        e.mipAt = NaN;
      }
      if (e.version < 0 || e.mipAt !== e.version) { this.fillMips(e.tex); e.mipAt = e.version; }
    }
    return e.tex;
  }

  releaseIdle(above: number): number {
    let held = 0;
    for (const e of this.cache.values()) if (e.seen !== this.frameNo) held += e.bytes;
    if (held <= above) return 0;
    for (const [k, e] of this.cache) if (e.seen !== this.frameNo) { e.tex.destroy(); this.cache.delete(k); }
    return held;
  }

  destroy(): void {
    for (const e of this.cache.values()) e.tex.destroy();
    this.cache.clear();
    this.acc?.forEach((t) => t.destroy());
    this.acc = null;
    for (const t of this.subPool) t.destroy();
    this.subPool = [];
    this.device.destroy();
  }
}

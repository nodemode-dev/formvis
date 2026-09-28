import { invert, mul, type BlendMode, type Mat } from '../engine';
import { COMPOSITE_WGSL, blendIndex } from './blend-wgsl';

/** The WebGPU flag values fixed by the specification (the project's type definitions carry the interfaces only). */
const TEX = { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 } as const;
const BUF = { MAP_READ: 0x0001, COPY_DST: 0x0008, UNIFORM: 0x0040 } as const;

export interface DisplayMask { image: HTMLCanvasElement | OffscreenCanvas; version: number; width: number; height: number; matrix: Mat }
/** A clipping base: its coverage (alpha x opacity x its mask) clips every layer that carries this same object. */
export interface DisplayClip { image: HTMLCanvasElement | OffscreenCanvas; version: number; width: number; height: number; matrix: Mat; opacity: number; mask?: DisplayMask }
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; lut3?: boolean; mask?: DisplayMask; clip?: DisplayClip; folders?: DisplayMask[]; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
/** The shader mode that renders a clipping base's coverage, and a folder mask's coverage (no source image). */
export const CLIP_MODE = 102;
export const FOLDER_MODE = 103;
/** The shader modes for an adjustment's lookup table (Phase 18.5), after the 27 blend modes: per channel, and 3D. */
export const LUT_MODE = 100;
export const LUT3_MODE = 101;
export interface Checker { a: [number, number, number]; b: [number, number, number]; cell: number; origin: [number, number] }
/** What the stage draws through: the WebGPU display or the WebGL2 one (gl-display.ts), each on its own canvas. */
export interface ScreenDisplay {
  readonly canvas: HTMLCanvasElement;
  readonly maxTexture: number;
  onLost: (() => void) | null;
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
  private readonly cache = new Map<object, { tex: GPUTexture; version: number; w: number; h: number }>();
  private acc: [GPUTexture, GPUTexture] | null = null;
  onLost: (() => void) | null = null;

  private constructor(readonly canvas: HTMLCanvasElement, private readonly device: GPUDevice, private readonly ctx: GPUCanvasContext,
    private readonly composite: GPURenderPipeline, private readonly present: GPURenderPipeline, private readonly presentOff: GPURenderPipeline,
    private readonly linear: GPUSampler, private readonly nearest: GPUSampler) {
    void device.lost.then((info) => {
      // destroy() also resolves this promise, with reason 'destroyed': switching renderers, not a failure.
      if (info.reason === 'destroyed') return;
      console.warn(`formvis: the GPU device was lost (${info.reason}): ${info.message}`);
      this.onLost?.();
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<GpuDisplay | null> {
    try {
      const gpu = (navigator as unknown as { gpu?: GPU }).gpu;
      const adapter = gpu ? await gpu.requestAdapter({ powerPreference: 'high-performance' }) : null;
      if (!gpu || !adapter) { console.warn('formvis: WebGPU has no adapter here'); return null; }
      const device = await adapter.requestDevice();
      const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!ctx) { console.warn('formvis: the display canvas gives no WebGPU context'); return null; }
      const format = gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: 'premultiplied' });
      const cm = device.createShaderModule({ code: COMPOSITE_WGSL }), pm = device.createShaderModule({ code: PRESENT_WGSL });
      const composite = device.createRenderPipeline({ layout: 'auto', vertex: { module: cm, entryPoint: 'vs' }, fragment: { module: cm, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
      const present = device.createRenderPipeline({ layout: 'auto', vertex: { module: pm, entryPoint: 'vs' }, fragment: { module: pm, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
      const presentOff = device.createRenderPipeline({ layout: 'auto', vertex: { module: pm, entryPoint: 'vs' }, fragment: { module: pm, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
      const edge = { addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' } as const;
      return new GpuDisplay(canvas, device, ctx, composite, present, presentOff, device.createSampler({ ...edge, magFilter: 'linear', minFilter: 'linear' }), device.createSampler({ ...edge, magFilter: 'nearest', minFilter: 'nearest' }));
    } catch (err) {
      console.warn('formvis: WebGPU could not start:', err);
      return null;
    }
  }

  /** The largest texture side this device takes (maxTextureDimension2D). */
  get maxTexture(): number { return this.device.limits.maxTextureDimension2D; }

  /** One frame: `view` maps document pixels to canvas pixels; `rect` is the document's visible rectangle on the canvas
   *  (x0, y0, x1, y1). Sampling is nearest from 200% zoom up, as the CPU path draws it. With `out` the frame goes to that
   *  rgba8unorm texture instead of the canvas: every pass the same but the last one's target. */
  render(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker, out?: GPUTexture): void {
    const d = this.device, W = out ? out.width : this.canvas.width, H = out ? out.height : this.canvas.height;
    if (W < 1 || H < 1) return;
    if (!this.acc || this.acc[0].width !== W || this.acc[0].height !== H) {
      this.acc?.forEach((t) => t.destroy());
      const make = (): GPUTexture => d.createTexture({ size: [W, H], format: 'rgba8unorm', usage: TEX.TEXTURE_BINDING | TEX.RENDER_ATTACHMENT });
      this.acc = [make(), make()];
    }
    let [a, b] = this.acc;
    const enc = d.createCommandEncoder(), used = new Set<object>(), buffers: GPUBuffer[] = [], sampler = zoom >= 2 ? this.nearest : this.linear;
    enc.beginRenderPass({ colorAttachments: [{ view: a.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] }).end();
    // Each clipping base's coverage, once per frame, into its own screen-sized texture (mode 102).
    const clipTex = new Map<DisplayClip, GPUTexture>();
    for (const l of layers) {
      if (!l.clip || clipTex.has(l.clip)) continue;
      const t = this.clipTarget(clipTex.size, W, H), c = l.clip;
      this.layerPass(enc, this.blank(), t, { image: c.image, version: c.version, width: c.width, height: c.height, matrix: c.matrix, opacity: c.opacity, blend: 'normal', mask: c.mask }, CLIP_MODE, null, sampler, view, used, buffers);
      clipTex.set(c, t);
    }
    // Each folder chain's coverage (one pass per folder mask, each times the chain so far), into the same pool.
    const folderTex = new Map<DisplayMask[], GPUTexture>();
    let slot = clipTex.size;
    for (const l of layers) {
      if (!l.folders || folderTex.has(l.folders)) continue;
      let prev: GPUTexture | null = null;
      for (const mk of l.folders) {
        const t = this.clipTarget(slot++, W, H);
        this.layerPass(enc, this.blank(), t, { image: null, version: 0, width: 1, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: 1, blend: 'normal', mask: mk }, FOLDER_MODE, prev, sampler, view, used, buffers);
        prev = t;
      }
      if (prev) folderTex.set(l.folders, prev);
    }
    for (const l of layers) {
      if (l.opacity <= 0 || l.width < 1 || l.height < 1) continue;
      const cover = l.clip ? clipTex.get(l.clip) ?? null : l.folders ? folderTex.get(l.folders) ?? null : null;
      this.layerPass(enc, a, b, l, l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend), cover, sampler, view, used, buffers);
      [a, b] = [b, a];
    }
    const pu = d.createBuffer({ size: 64, usage: BUF.UNIFORM | BUF.COPY_DST });
    d.queue.writeBuffer(pu, 0, new Float32Array([...rect, ...checker.a.map((v) => v / 255), 1, ...checker.b.map((v) => v / 255), 1, checker.origin[0], checker.origin[1], checker.cell, 0]));
    buffers.push(pu);
    const pipe = out ? this.presentOff : this.present;
    const pbind = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: a.createView() }, { binding: 1, resource: { buffer: pu } }] });
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: (out ?? this.ctx.getCurrentTexture()).createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, pbind);
    pass.draw(3);
    pass.end();
    d.queue.submit([enc.finish()]);
    for (const u of buffers) u.destroy();
    for (const [k, e] of this.cache) if (!used.has(k)) { e.tex.destroy(); this.cache.delete(k); }
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

  /** One composite pass: `l` over `backdrop` into `target`, in shader `mode`, clipped by `clip` (a coverage texture). */
  private layerPass(enc: GPUCommandEncoder, backdrop: GPUTexture, target: GPUTexture, l: DisplayLayer, mode: number, clip: GPUTexture | null, sampler: GPUSampler, view: Mat, used: Set<object>, buffers: GPUBuffer[]): void {
    const d = this.device;
    if (mode !== FOLDER_MODE) used.add(l.lut ?? (l.image as object));
    const tex = mode === FOLDER_MODE ? this.blank() : this.texture(l);
    const [ia, ib, ic, id, ie, iff] = invert(mul(view, l.matrix));
    // 128 bytes, WGSL's layout: inv (0), size (48), opacity (56), mode (60), the mask's inverse placement (64), its
    // size (112), whether there is one (120), whether the layer is clipped (124).
    const raw = new ArrayBuffer(128), f = new Float32Array(raw), u32 = new Uint32Array(raw);
    f.set([ia, ib, 0, 0, ic, id, 0, 0, ie, iff, 1, 0, l.width, l.height, Math.min(1, Math.max(0, l.opacity))]);
    u32[15] = mode;
    let maskTex = this.blank();
    if (l.mask) {
      const mk = l.mask, [ma, mb, mc, md, me, mf] = invert(mul(view, mk.matrix));
      f.set([ma, mb, 0, 0, mc, md, 0, 0, me, mf, 1, 0, mk.width, mk.height], 16);
      u32[30] = 1;
      used.add(mk.image);
      maskTex = this.texture({ image: mk.image, version: mk.version, width: mk.width, height: mk.height, matrix: mk.matrix, opacity: 1, blend: 'normal' });
    }
    if (clip) u32[31] = 1;
    const ub = d.createBuffer({ size: 128, usage: BUF.UNIFORM | BUF.COPY_DST });
    d.queue.writeBuffer(ub, 0, raw);
    buffers.push(ub);
    const bind = d.createBindGroup({ layout: this.composite.getBindGroupLayout(0), entries: [
      { binding: 0, resource: backdrop.createView() }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: sampler }, { binding: 3, resource: { buffer: ub } },
      { binding: 4, resource: maskTex.createView() }, { binding: 5, resource: (clip ?? this.blank()).createView() },
    ] });
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
    pass.setPipeline(this.composite);
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

  /** A 1 x 1 texture bound where a layer has no mask (the binding must always be filled; the shader ignores it). */
  private blankTex: GPUTexture | null = null;
  private blank(): GPUTexture {
    this.blankTex ??= this.device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: TEX.TEXTURE_BINDING | TEX.COPY_DST });
    return this.blankTex;
  }

  private texture(l: DisplayLayer): GPUTexture {
    const key = l.lut ?? (l.image as object);
    let e = this.cache.get(key);
    if (e && (e.w !== l.width || e.h !== l.height)) { e.tex.destroy(); e = undefined; }
    if (!e) {
      e = { tex: this.device.createTexture({ size: [l.width, l.height], format: 'rgba8unorm', usage: TEX.TEXTURE_BINDING | TEX.COPY_DST | TEX.RENDER_ATTACHMENT }), version: NaN, w: l.width, h: l.height };
      this.cache.set(key, e);
    }
    if (l.lut) {
      // A table is fixed for its settings (a new table comes with new settings), so it is written once, at its own size.
      if (Number.isNaN(e.version)) { this.device.queue.writeTexture({ texture: e.tex }, l.lut, { bytesPerRow: l.width * 4 }, [l.width, l.height]); e.version = 0; }
    } else if (l.image && (l.version < 0 || e.version !== l.version)) {
      this.device.queue.copyExternalImageToTexture({ source: l.image }, { texture: e.tex, premultipliedAlpha: true }, [l.width, l.height]);
      e.version = l.version;
    }
    return e.tex;
  }

  destroy(): void {
    for (const e of this.cache.values()) e.tex.destroy();
    this.cache.clear();
    this.acc?.forEach((t) => t.destroy());
    this.acc = null;
    this.device.destroy();
  }
}

import { invert, type BlendMode, type Mat } from '../engine';
import { COMPOSITE_WGSL, blendIndex } from './blend-wgsl';

/** The WebGPU flag values fixed by the specification (the project's type definitions carry the interfaces only). */
const GPUTextureUsage = { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 } as const;
const GPUBufferUsage = { MAP_READ: 0x0001, COPY_DST: 0x0008, UNIFORM: 0x0040 } as const;
const GPUMapMode = { READ: 0x1 } as const;

/** One layer for the GPU: its pixels, their size, where they sit in the document (layer pixels to document pixels), its
 *  opacity and its blend mode. */
export interface GpuLayer { image: HTMLCanvasElement | OffscreenCanvas | ImageBitmap; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }

/** The WebGPU blender (Phase 18.2): layers bottom to top onto a document-sized texture, each through its placement,
 *  opacity and blend mode in one full-screen pass that reads the result so far and writes the next (two textures in
 *  turn). The blend modes are engine-exact WGSL (blend-wgsl.ts). `create` returns null where WebGPU or an adapter is
 *  missing, which is where the CPU renderer carries on. */
export class GpuBlender {
  private constructor(private readonly device: GPUDevice, private readonly pipeline: GPURenderPipeline, private readonly sampler: GPUSampler) {}

  static async create(): Promise<GpuBlender | null> {
    try {
      const gpu = (navigator as unknown as { gpu?: GPU }).gpu;
      const adapter = gpu ? await gpu.requestAdapter({ powerPreference: 'high-performance' }) : null;
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const module = device.createShaderModule({ code: COMPOSITE_WGSL });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' },
      });
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      return new GpuBlender(device, pipeline, sampler);
    } catch { return null; }
  }

  /** The layers composited over `background` (unpremultiplied 0 to 1, or transparent), read back as RGBA bytes. */
  async composite(width: number, height: number, layers: readonly GpuLayer[], background: [number, number, number, number] | null = null): Promise<Uint8ClampedArray> {
    const d = this.device;
    const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC;
    let a = d.createTexture({ size: [width, height], format: 'rgba8unorm', usage });
    let b = d.createTexture({ size: [width, height], format: 'rgba8unorm', usage });
    const bg = background ?? [0, 0, 0, 0];
    const clear = d.createCommandEncoder();
    clear.beginRenderPass({ colorAttachments: [{ view: a.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: bg[0], g: bg[1], b: bg[2], a: bg[3] } }] }).end();
    d.queue.submit([clear.finish()]);
    for (const l of layers) {
      if (l.opacity <= 0 || l.width < 1 || l.height < 1) continue;
      const tex = d.createTexture({ size: [l.width, l.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      d.queue.copyExternalImageToTexture({ source: l.image }, { texture: tex, premultipliedAlpha: true }, [l.width, l.height]);
      const [ia, ib, ic, id, ie, iff] = invert(l.matrix);
      const raw = new ArrayBuffer(64), f = new Float32Array(raw), u = new Uint32Array(raw);
      f.set([ia, ib, 0, 0, ic, id, 0, 0, ie, iff, 1, 0, l.width, l.height, Math.min(1, Math.max(0, l.opacity))]);
      u[15] = blendIndex(l.blend);
      const ub = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(ub, 0, raw);
      const bind = d.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: a.createView() }, { binding: 1, resource: tex.createView() },
        { binding: 2, resource: this.sampler }, { binding: 3, resource: { buffer: ub } },
      ] });
      const enc = d.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: b.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
      d.queue.submit([enc.finish()]);
      [a, b] = [b, a];
      tex.destroy();
      ub.destroy();
    }
    const out = await this.read(a, width, height);
    a.destroy();
    b.destroy();
    return out;
  }

  private async read(tex: GPUTexture, width: number, height: number): Promise<Uint8ClampedArray> {
    const d = this.device, row = Math.ceil((width * 4) / 256) * 256;
    const buf = d.createBuffer({ size: row * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [width, height]);
    d.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), out = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) out.set(src.subarray(y * row, y * row + width * 4), y * width * 4);
    buf.unmap();
    buf.destroy();
    return out;
  }

  destroy(): void { this.device.destroy(); }
}

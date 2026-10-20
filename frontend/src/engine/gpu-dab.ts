import type { Mat } from './geometry';
import type { TipAlpha } from './dab-buffer';

/** Preferences > Performance > GPU brush coverage: the plain round brush lays its dabs' coverage on the graphics processor. */
export const gpuDabPrefs = { on: false };

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D tip;
uniform vec2 org;
uniform vec4 inv;
uniform vec2 off;
uniform vec2 sc;
uniform ivec2 dim;
uniform float k;
out vec4 o;
float texel(ivec2 q, float wgt) {
  if (q.x < 0 || q.y < 0 || q.x >= dim.x || q.y >= dim.y) return 0.0;
  return texelFetch(tip, q, 0).r * wgt;
}
void main() {
  vec2 p = gl_FragCoord.xy - org;
  float u = (inv.x * p.x + inv.z * p.y + off.x) * sc.x - 0.5;
  float v = (inv.y * p.x + inv.w * p.y + off.y) * sc.y - 0.5;
  float fu0 = floor(u), fv0 = floor(v);
  float fu = u - fu0, fv = v - fv0;
  ivec2 b = ivec2(int(fu0), int(fv0));
  float s = 0.0;
  s += texel(b, (1.0 - fu) * (1.0 - fv));
  s += texel(b + ivec2(1, 0), fu * (1.0 - fv));
  s += texel(b + ivec2(0, 1), (1.0 - fu) * fv);
  s += texel(b + ivec2(1, 1), fu * fv);
  float a = k * s;
  if (!(a > 0.0)) discard;
  o = vec4(a, 0.0, 0.0, a);
}`;

type Rect = { x: number; y: number; w: number; h: number };

/** One stroke's dab coverage on the GPU: the same per-dab formula as StrokeBuffer.lay (the tip's alpha sampled bilinearly
 *  through the dab's matrix, each pixel gaining k times that of what is still uncovered), accumulated in a float
 *  texture, and read back into the stroke's coverage buffer. Float blending is needed; without it open() answers null. */
export class GpuDabCoverage {
  private readonly tips = new WeakMap<Uint8Array, WebGLTexture>();
  private dirty: Rect | null = null;

  private constructor(private readonly gl: WebGL2RenderingContext, private readonly prog: WebGLProgram, private readonly target: WebGLTexture, private readonly fbo: WebGLFramebuffer, private readonly w: number, private readonly h: number) {}

  static open(w: number, h: number): GpuDabCoverage | null {
    try {
      if (typeof OffscreenCanvas === 'undefined') return null;
      const gl = new OffscreenCanvas(1, 1).getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false }) as WebGL2RenderingContext | null;
      if (!gl || !gl.getExtension('EXT_color_buffer_float') || !gl.getExtension('EXT_float_blend')) return null;
      if (w < 1 || h < 1 || Math.max(w, h) > gl.getParameter(gl.MAX_TEXTURE_SIZE) || w * h > 64_000_000) return null;
      const prog = gl.createProgram() as WebGLProgram;
      for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
        const sh = gl.createShader(type) as WebGLShader;
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
        gl.attachShader(prog, sh);
      }
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      const target = gl.createTexture() as WebGLTexture;
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, w, h);
      const fbo = gl.createFramebuffer() as WebGLFramebuffer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
      gl.readPixels(0, 0, 1, 1, gl.RED, gl.FLOAT, new Float32Array(1));
      if (gl.getError() !== gl.NO_ERROR) return null;
      gl.useProgram(prog);
      gl.viewport(0, 0, w, h);
      gl.enable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
      return new GpuDabCoverage(gl, prog, target, fbo, w, h);
    } catch { return null; }
  }

  get lost(): boolean { return this.gl.isContextLost(); }

  private tipTexture(data: Uint8Array, lw: number, lh: number): WebGLTexture {
    let t = this.tips.get(data);
    if (t) return t;
    const gl = this.gl;
    t = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, lw, lh);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, lw, lh, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.tips.set(data, t);
    return t;
  }

  /** One dab, by the same box, level choice and inverse as StrokeBuffer.lay; false when it lands nowhere. */
  lay(tip: TipAlpha, m: Mat, k: number): boolean {
    const det = m[0] * m[3] - m[1] * m[2];
    if (!(Math.abs(det) > 1e-12) || !(k > 0)) return false;
    const tw = tip.w, th = tip.h, gl = this.gl;
    const xs = [m[4], m[0] * tw + m[4], m[2] * th + m[4], m[0] * tw + m[2] * th + m[4]], ys = [m[5], m[1] * tw + m[5], m[3] * th + m[5], m[1] * tw + m[3] * th + m[5]];
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(this.w, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(this.h, Math.ceil(Math.max(...ys)));
    if (x1 <= x0 || y1 <= y0) return false;
    const ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det, ie = -(ia * m[4] + ic * m[5]), iff = -(ib * m[4] + id * m[5]);
    const ratio = Math.max(Math.hypot(ia, ib), Math.hypot(ic, id)), top = tip.levels.length - 1;
    const lv = tip.levels[ratio > 1.4142 ? Math.min(top, Math.round(Math.log2(ratio))) : 0];
    gl.bindTexture(gl.TEXTURE_2D, this.tipTexture(lv.data, lv.w, lv.h));
    const u = (n: string): WebGLUniformLocation | null => gl.getUniformLocation(this.prog, n);
    gl.uniform2f(u('org'), x0, y0);
    gl.uniform4f(u('inv'), ia, ib, ic, id);
    gl.uniform2f(u('off'), ie + ia * x0 + ic * y0, iff + ib * x0 + id * y0);
    gl.uniform2f(u('sc'), lv.w / tw, lv.h / th);
    gl.uniform2i(u('dim'), lv.w, lv.h);
    gl.uniform1f(u('k'), k);
    gl.uniform1i(u('tip'), 0);
    gl.scissor(x0, y0, x1 - x0, y1 - y0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    if (!this.dirty) this.dirty = r;
    else {
      const ux = Math.min(this.dirty.x, r.x), uy = Math.min(this.dirty.y, r.y);
      this.dirty = { x: ux, y: uy, w: Math.max(this.dirty.x + this.dirty.w, r.x + r.w) - ux, h: Math.max(this.dirty.y + this.dirty.h, r.y + r.h) - uy };
    }
    return true;
  }

  /** What the dabs since the last read have changed, copied into `cov` (rows `stride` apart); the box, or null. */
  readInto(cov: Float32Array, stride: number): Rect | null {
    const r = this.dirty;
    if (!r || this.gl.isContextLost()) return null;
    this.dirty = null;
    const gl = this.gl, out = new Float32Array(r.w * r.h);
    gl.readPixels(r.x, r.y, r.w, r.h, gl.RED, gl.FLOAT, out);
    for (let j = 0; j < r.h; j++) cov.set(out.subarray(j * r.w, (j + 1) * r.w), (r.y + j) * stride + r.x);
    return r;
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteFramebuffer(this.fbo);
      gl.deleteTexture(this.target);
      gl.deleteProgram(this.prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { /* the context is already gone */ }
  }
}

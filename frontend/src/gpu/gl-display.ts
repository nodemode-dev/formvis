import { invert, mul, type Mat } from '../engine';
import { blendIndex } from './blend-wgsl';
import { CLIP_MODE, FOLDER_MODE, LUT3_MODE, LUT_MODE, type Checker, type DisplayClip, type DisplayLayer, type DisplayMask } from './display';

/** The display on WebGL2 (Phase 18.4): the GPU path where WebGPU is missing, as in the Linux desktop shell, whose
 *  webview has none. The same passes as the WebGPU display and the same maths as blend-wgsl.ts, in GLSL ES 3.00: layers
 *  composited at screen resolution through the view, each uploaded premultiplied as the canvas stores it and
 *  un-premultiplied in float, the per-pixel modes quantised to getImageData's 8 bits, then presented over the
 *  checkerboard. WebGL's framebuffer origin is its bottom left: shaders work in document space with y down
 *  (p.y = H - gl_FragCoord.y) and read the running composite in framebuffer space. */

const VS = `#version 300 es
void main() { vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0); gl_Position = vec4(p, 0.0, 1.0); }`;

const COMPOSITE_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D backdrop; uniform sampler2D source;
uniform mat3 inv; uniform vec2 size; uniform float opacity; uniform int mode; uniform float H;
uniform sampler2D maskTex; uniform mat3 minv; uniform vec2 msize; uniform int hasMask;
uniform sampler2D clipTex; uniform int hasClip;
out vec4 outColor;
float coverage(vec2 p) {
  if (hasMask == 0) return 1.0;
  vec3 qm = minv * vec3(p, 1.0);
  if (qm.x < 0.0 || qm.y < 0.0 || qm.x >= msize.x || qm.y >= msize.y) return 1.0;
  return texture(maskTex, qm.xy / msize).a;
}
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipColor(vec3 c) { float l = lum(c), n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b); vec3 o = c;
  if (n < 0.0) o = l + (o - l) * l / (l - n); if (x > 1.0) o = l + (o - l) * (1.0 - l) / (x - l); return o; }
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
float sat(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 setSat(vec3 c, float s) { float n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b); return x > n ? (c - n) * s / (x - n) : vec3(0.0); }
float dodge(float b, float s) { if (b <= 0.0) return 0.0; if (s >= 1.0) return 1.0; return min(1.0, b / (1.0 - s)); }
float burn(float b, float s) { if (b >= 1.0) return 1.0; if (s <= 0.0) return 0.0; return 1.0 - min(1.0, (1.0 - b) / s); }
float hardLight(float b, float s) { if (s <= 0.5) return b * 2.0 * s; float t = 2.0 * s - 1.0; return b + t - b * t; }
float softLight(float b, float s) { if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b);
  float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); return b + (2.0 * s - 1.0) * (d - b); }
float sep(int m, float b, float s) {
  if (m == 2) return min(b, s); if (m == 3) return b * s; if (m == 4) return burn(b, s); if (m == 5) return clamp(b + s - 1.0, 0.0, 1.0);
  if (m == 7) return max(b, s); if (m == 8) return b + s - b * s; if (m == 9) return dodge(b, s); if (m == 12) return hardLight(s, b);
  if (m == 13) return softLight(b, s); if (m == 14) return hardLight(b, s);
  if (m == 15) return s <= 0.5 ? burn(b, 2.0 * s) : dodge(b, 2.0 * (s - 0.5));
  if (m == 16) return clamp(b + 2.0 * s - 1.0, 0.0, 1.0); if (m == 17) return s <= 0.5 ? min(b, 2.0 * s) : max(b, 2.0 * s - 1.0);
  if (m == 18) return b + s >= 1.0 ? 1.0 : 0.0; if (m == 19) return abs(b - s); if (m == 20) return b + s - 2.0 * b * s;
  if (m == 21) return clamp(b - s, 0.0, 1.0); if (m == 22) { if (s <= 0.0) return b <= 0.0 ? 0.0 : 1.0; return min(1.0, b / s); }
  return s; }
vec3 blend(int m, vec3 b, vec3 s) {
  if (m == 6) return lum(s) < lum(b) ? s : b; if (m == 11) return lum(s) < lum(b) ? b : s;
  if (m == 23) return setLum(setSat(s, sat(b)), lum(b)); if (m == 24) return setLum(setSat(b, sat(s)), lum(b));
  if (m == 25) return setLum(s, lum(b)); if (m == 26) return setLum(b, lum(s));
  return vec3(sep(m, b.r, s.r), sep(m, b.g, s.g), sep(m, b.b, s.b)); }
float dissolveNoise(int x, int y) { uint h = uint(x) * 374761393u + uint(y) * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; return float(h ^ (h >> 16u)) / 4294967296.0; }
void main() {
  ivec2 fb = ivec2(gl_FragCoord.xy);
  vec4 bd = texelFetch(backdrop, fb, 0);
  float cov = coverage(vec2(gl_FragCoord.x, H - gl_FragCoord.y));
  if (hasClip == 1) cov *= texelFetch(clipTex, fb, 0).a;
  if (mode == 103) { outColor = vec4(0.0, 0.0, 0.0, cov); return; }
  if (mode == 102) {
    vec3 qb = inv * vec3(gl_FragCoord.x, H - gl_FragCoord.y, 1.0);
    if (qb.x < 0.0 || qb.y < 0.0 || qb.x >= size.x || qb.y >= size.y) { outColor = vec4(0.0); return; }
    outColor = vec4(0.0, 0.0, 0.0, texture(source, qb.xy / size).a * opacity * cov); return;
  }
  if (mode == 100) {
    if (bd.a <= 0.0) { outColor = bd; return; }
    ivec3 i = ivec3(floor(bd.rgb * 255.0 + 0.5));
    vec3 t = vec3(texelFetch(source, ivec2(i.r, 0), 0).r, texelFetch(source, ivec2(i.g, 0), 0).g, texelFetch(source, ivec2(i.b, 0), 0).b);
    outColor = vec4(bd.rgb + (t - bd.rgb) * opacity * cov, bd.a); return;
  }
  if (mode == 101) {
    if (bd.a <= 0.0) { outColor = bd; return; }
    vec3 v = floor(bd.rgb * 255.0 + 0.5) / 5.0;
    ivec3 b0 = min(ivec3(floor(v)), ivec3(50));
    vec3 f = v - vec3(b0), acc = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
      float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y) * (o.z == 1 ? f.z : 1.0 - f.z);
      ivec3 c = b0 + o;
      acc += w * texelFetch(source, ivec2(c.x + c.y * 52, c.z), 0).rgb;
    }
    vec3 t3 = floor(acc * 255.0 + 0.5) / 255.0;
    outColor = vec4(bd.rgb + (t3 - bd.rgb) * opacity * cov, bd.a); return;
  }
  vec2 p = vec2(gl_FragCoord.x, H - gl_FragCoord.y);
  vec3 q = inv * vec3(p, 1.0);
  if (q.x < 0.0 || q.y < 0.0 || q.x >= size.x || q.y >= size.y) { outColor = bd; return; }
  vec4 s0 = texture(source, q.xy / size);
  vec4 sc = s0.a > 0.0 ? vec4(s0.rgb / s0.a, s0.a) : s0;
  if (mode == 1 || mode == 5 || mode == 6 || mode == 11 || (mode >= 15 && mode <= 18) || mode == 21 || mode == 22) sc = vec4(floor(sc.rgb * 255.0 + 0.5) / 255.0, sc.a);
  float sa = sc.a * opacity * cov; if (sa <= 0.0) { outColor = bd; return; }
  float ab = bd.a;
  if (mode == 1) { outColor = dissolveNoise(int(floor(p.x)), int(floor(p.y))) >= sa ? bd : vec4(sc.rgb, 1.0); return; }
  if (mode == 10) { float lo = min(1.0, sa + ab); vec3 lc = min(vec3(1.0), sc.rgb * sa + bd.rgb * ab); outColor = vec4(lc / max(lo, 1e-6), lo); return; }
  float ao = sa + ab * (1.0 - sa); if (ao <= 0.0) { outColor = vec4(0.0); return; }
  vec3 r = mode == 0 ? sc.rgb : blend(mode, bd.rgb, sc.rgb);
  outColor = vec4((sa * (1.0 - ab) * sc.rgb + sa * ab * r + (1.0 - sa) * ab * bd.rgb) / ao, ao);
}`;

const PRESENT_FS = `#version 300 es
precision highp float;
uniform sampler2D img; uniform vec4 rect; uniform vec3 colA; uniform vec3 colB; uniform vec3 originCell; uniform float H;
out vec4 outColor;
void main() {
  vec2 p = vec2(gl_FragCoord.x, H - gl_FragCoord.y);
  if (p.x < rect.x || p.y < rect.y || p.x >= rect.z || p.y >= rect.w) { outColor = vec4(0.0); return; }
  vec2 cell = floor((p - originCell.xy) / originCell.z);
  vec3 bg = ((int(cell.x) + int(cell.y)) % 2 != 0) ? colB : colA;
  vec4 c = texelFetch(img, ivec2(gl_FragCoord.xy), 0);
  outColor = vec4(c.rgb * c.a + bg * (1.0 - c.a), 1.0);
}`;

type GL = WebGL2RenderingContext;

function program(gl: GL, fs: string): WebGLProgram {
  const make = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type) as WebGLShader;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram() as WebGLProgram;
  gl.attachShader(p, make(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export class GlDisplay {
  private readonly cache = new Map<object, { tex: WebGLTexture; version: number; w: number; h: number }>();
  private acc: { tex: WebGLTexture; fb: WebGLFramebuffer }[] = [];
  private accW = 0;
  private accH = 0;
  onLost: (() => void) | null = null;

  private constructor(readonly canvas: HTMLCanvasElement, private readonly gl: GL, private readonly comp: WebGLProgram, private readonly pres: WebGLProgram) {
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('sonny: the WebGL2 context was lost'); this.onLost?.(); });
  }

  static create(canvas: HTMLCanvasElement): GlDisplay | null {
    try {
      const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance', premultipliedAlpha: true, antialias: false, alpha: true });
      if (!gl) { console.warn('sonny: the display canvas gives no WebGL2 context'); return null; }
      return new GlDisplay(canvas, gl, program(gl, COMPOSITE_FS), program(gl, PRESENT_FS));
    } catch (err) {
      console.warn('sonny: WebGL2 could not start:', err);
      return null;
    }
  }

  get maxTexture(): number { return Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)); }

  private target(W: number, H: number): { tex: WebGLTexture; fb: WebGLFramebuffer } {
    const gl = this.gl, tex = gl.createTexture() as WebGLTexture, fb = gl.createFramebuffer() as WebGLFramebuffer;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb };
  }

  /** One frame, as GpuDisplay.render: `view` maps document pixels to canvas pixels, `rect` is the document's visible
   *  rectangle, nearest sampling from 200% zoom up. With `out` the last pass goes to that framebuffer. */
  render(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker, out?: { fb: WebGLFramebuffer; W: number; H: number }): void {
    const gl = this.gl, W = out ? out.W : this.canvas.width, H = out ? out.H : this.canvas.height;
    if (W < 1 || H < 1 || gl.isContextLost()) return;
    if (!this.acc.length || this.accW !== W || this.accH !== H) {
      for (const a of this.acc) { gl.deleteTexture(a.tex); gl.deleteFramebuffer(a.fb); }
      this.acc = [this.target(W, H), this.target(W, H)];
      this.accW = W; this.accH = H;
    }
    let [a, b] = this.acc;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.comp);
    const u = (n: string): WebGLUniformLocation | null => gl.getUniformLocation(this.comp, n);
    gl.uniform1i(u('backdrop'), 0);
    gl.uniform1i(u('source'), 1);
    gl.uniform1i(u('maskTex'), 2);
    gl.uniform1f(u('H'), H);
    const used = new Set<object>(), filter = zoom >= 2 ? gl.NEAREST : gl.LINEAR;
    gl.uniform1i(u('clipTex'), 3);
    // Each clipping base's coverage, once per frame, into its own screen-sized target (mode 102).
    const clipOut = new Map<DisplayClip, WebGLTexture>();
    for (const l of layers) {
      if (!l.clip || clipOut.has(l.clip)) continue;
      const t = this.clipTarget(clipOut.size, W, H), c = l.clip;
      this.drawLayer({ image: c.image, version: c.version, width: c.width, height: c.height, matrix: c.matrix, opacity: c.opacity, blend: 'normal', mask: c.mask }, CLIP_MODE, null, this.blank(), t.fb, view, filter, used, u);
      clipOut.set(c, t.tex);
    }
    const folderOut = new Map<DisplayMask[], WebGLTexture>();
    let slot = clipOut.size;
    for (const l of layers) {
      if (!l.folders || folderOut.has(l.folders)) continue;
      let prev: WebGLTexture | null = null;
      for (const mk of l.folders) {
        const t = this.clipTarget(slot++, W, H);
        this.drawLayer({ image: null, version: 0, width: 1, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: 1, blend: 'normal', mask: mk }, FOLDER_MODE, prev, this.blank(), t.fb, view, filter, used, u);
        prev = t.tex;
      }
      if (prev) folderOut.set(l.folders, prev);
    }
    for (const l of layers) {
      if (l.opacity <= 0 || l.width < 1 || l.height < 1) continue;
      const cover = l.clip ? clipOut.get(l.clip) ?? null : l.folders ? folderOut.get(l.folders) ?? null : null;
      this.drawLayer(l, l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend), cover, a.tex, b.fb, view, filter, used, u);
      [a, b] = [b, a];
    }
    gl.useProgram(this.pres);
    const v = (n: string): WebGLUniformLocation | null => gl.getUniformLocation(this.pres, n);
    gl.uniform1i(v('img'), 0);
    gl.uniform4f(v('rect'), ...rect);
    gl.uniform3f(v('colA'), checker.a[0] / 255, checker.a[1] / 255, checker.a[2] / 255);
    gl.uniform3f(v('colB'), checker.b[0] / 255, checker.b[1] / 255, checker.b[2] / 255);
    gl.uniform3f(v('originCell'), checker.origin[0], checker.origin[1], checker.cell);
    gl.uniform1f(v('H'), H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (const [k, e] of this.cache) if (!used.has(k)) { gl.deleteTexture(e.tex); this.cache.delete(k); }
  }

  /** One frame into an offscreen framebuffer, returned only when the GPU has finished it (a one-pixel read waits for the
   *  frame): the performance benchmark's unit (Phase 18.7). */
  private benchTarget: { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  async timedFrame(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker, W: number, H: number): Promise<void> {
    const gl = this.gl;
    if (!this.benchTarget || this.benchTarget.w !== W || this.benchTarget.h !== H) {
      if (this.benchTarget) { gl.deleteTexture(this.benchTarget.tex); gl.deleteFramebuffer(this.benchTarget.fb); }
      this.benchTarget = { ...this.target(W, H), w: W, h: H };
    }
    this.render(layers, view, zoom, rect, checker, { fb: this.benchTarget.fb, W, H });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.benchTarget.fb);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  /** A frame through every pass into an offscreen framebuffer, read back top row first. */
  async renderToPixels(layers: readonly DisplayLayer[], view: Mat, zoom: number, rect: [number, number, number, number], checker: Checker, W: number, H: number): Promise<Uint8ClampedArray> {
    const gl = this.gl, t = this.target(W, H);
    this.render(layers, view, zoom, rect, checker, { fb: t.fb, W, H });
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    const raw = new Uint8Array(W * H * 4), px = new Uint8ClampedArray(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    for (let y = 0; y < H; y++) px.set(raw.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fb);
    return px;
  }

  /** One composite pass: `l` over `backdrop` into framebuffer `fb`, in shader `mode`, clipped by `clip` (a coverage texture). */
  private drawLayer(l: DisplayLayer, mode: number, clip: WebGLTexture | null, backdrop: WebGLTexture, fb: WebGLFramebuffer, view: Mat, filter: number, used: Set<object>, u: (n: string) => WebGLUniformLocation | null): void {
    const gl = this.gl;
    if (mode !== FOLDER_MODE) used.add(l.lut ?? (l.image as object));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, mode === FOLDER_MODE ? this.blank() : this.texture(l));
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter);
    const [ia, ib, ic, id, ie, iff] = invert(mul(view, l.matrix));
    gl.uniformMatrix3fv(u('inv'), false, [ia, ib, 0, ic, id, 0, ie, iff, 1]);
    gl.uniform2f(u('size'), l.width, l.height);
    gl.uniform1f(u('opacity'), Math.min(1, Math.max(0, l.opacity)));
    gl.uniform1i(u('mode'), mode);
    gl.activeTexture(gl.TEXTURE2);
    if (l.mask) {
      const mk = l.mask, [ma, mb, mc, md, me, mf] = invert(mul(view, mk.matrix));
      used.add(mk.image);
      gl.bindTexture(gl.TEXTURE_2D, this.texture({ image: mk.image, version: mk.version, width: mk.width, height: mk.height, matrix: mk.matrix, opacity: 1, blend: 'normal' }));
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter);
      gl.uniformMatrix3fv(u('minv'), false, [ma, mb, 0, mc, md, 0, me, mf, 1]);
      gl.uniform2f(u('msize'), mk.width, mk.height);
      gl.uniform1i(u('hasMask'), 1);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.blank());
      gl.uniform1i(u('hasMask'), 0);
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, clip ?? this.blank());
    gl.uniform1i(u('hasClip'), clip ? 1 : 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, backdrop);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The i-th clip coverage target at W x H, kept between frames and remade when the size changes. */
  private clipPool: { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }[] = [];
  private clipTarget(i: number, W: number, H: number): { tex: WebGLTexture; fb: WebGLFramebuffer } {
    const t = this.clipPool[i];
    if (t && t.w === W && t.h === H) return t;
    if (t) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fb); }
    this.clipPool[i] = { ...this.target(W, H), w: W, h: H };
    return this.clipPool[i];
  }

  /** A 1 x 1 texture bound where a layer has no mask (the shader ignores it). */
  private blankTex: WebGLTexture | null = null;
  private blank(): WebGLTexture {
    if (!this.blankTex) {
      const gl = this.gl;
      this.blankTex = gl.createTexture() as WebGLTexture;
      gl.bindTexture(gl.TEXTURE_2D, this.blankTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }
    return this.blankTex;
  }

  private texture(l: DisplayLayer): WebGLTexture {
    const gl = this.gl, key = l.lut ?? (l.image as object);
    let e = this.cache.get(key);
    if (e && (e.w !== l.width || e.h !== l.height)) { gl.deleteTexture(e.tex); e = undefined; }
    if (!e) { e = { tex: gl.createTexture() as WebGLTexture, version: NaN, w: l.width, h: l.height }; this.cache.set(key, e); }
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    if (l.lut) {
      // A table is data, not an image: uploaded as it is (no premultiplying), once for its settings.
      if (Number.isNaN(e.version)) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, l.width, l.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, l.lut);
        e.version = 0;
      }
    } else if (l.image && (l.version < 0 || e.version !== l.version)) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, l.image as TexImageSource);
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
      e.version = l.version;
    }
    return e.tex;
  }

  destroy(): void {
    const gl = this.gl;
    for (const e of this.cache.values()) gl.deleteTexture(e.tex);
    this.cache.clear();
    for (const a of this.acc) { gl.deleteTexture(a.tex); gl.deleteFramebuffer(a.fb); }
    this.acc = [];
  }
}

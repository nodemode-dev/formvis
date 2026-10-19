import { invert, mul, type Mat } from '../engine';
import { blendIndex } from './blend-wgsl';
import { CLIP_MODE, FOLDER_MODE, GRAIN_MODE, KO_FLAG, LUT3_MODE, LUT_MODE, SCREEN_FLAG, anyLayer, type Checker, type DisplayClip, type DisplayLayer, type DisplayMask } from './display';
import { GlFrameTimer } from './gpu-timing';
import type { DisplayOptions } from './probe';
import { dirtyBox, trimResident, type UploadStats } from './residency';
import { deepHalf, lodFor } from './deep-upload';

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
uniform mat3 vinv; uniform vec4 biT; uniform vec4 biU; uniform int biCh; uniform int chOff; uniform float lod;
uniform sampler2D koTex; uniform float ko;
out vec4 outColor;
float biFactor(float v, vec4 r) {
  float lo = v < r.x ? 0.0 : v < r.y ? (v - r.x) / max(1.0, r.y - r.x) : 1.0;
  float hi = v > r.w ? 0.0 : v > r.z ? (r.w - v) / max(1.0, r.w - r.z) : 1.0;
  return lo * hi;
}
float biValue(vec3 c, int ch) { vec3 p = floor(c * 255.0 + 0.5); return ch == 2 ? p.r : ch == 3 ? p.g : ch == 4 ? p.b : 0.299 * p.r + 0.587 * p.g + 0.114 * p.b; }
vec4 keep(vec4 o, vec4 b) { vec3 c = o.rgb; if ((chOff & 1) != 0) c.r = b.r; if ((chOff & 2) != 0) c.g = b.g; if ((chOff & 4) != 0) c.b = b.b; return vec4(c, o.a); }
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
uniform vec4 gA; uniform vec4 gB; uniform uvec4 gS;
float lattice(int x, int y, uint seed) {
  uint z = (uint(x) * 0x27d4eb2du) ^ (uint(y) * 0x165667b1u) ^ seed; float sum = 0.0;
  for (int r = 0; r < 2; r++) { z += 0x9e3779b9u; z = (z ^ (z >> 16u)) * 0x85ebca6bu; z = (z ^ (z >> 13u)) * 0xc2b2ae35u; z ^= z >> 16u; sum += float(z) / 4294967295.0; }
  return sum - 1.0;
}
float grainAt(ivec2 c, vec2 t, ivec2 f, uint seed, uint fine) {
  float a = lattice(c.x, c.y, seed), b = lattice(c.x + 1, c.y, seed), cc = lattice(c.x, c.y + 1, seed), d = lattice(c.x + 1, c.y + 1, seed);
  float s = ((a + (b - a) * t.x) * (1.0 - t.y) + (cc + (d - cc) * t.x) * t.y) * 1.6;
  return s + (lattice(f.x, f.y, fine) - s) * gA.y;
}
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
  if (mode == 104) {
    if (bd.a <= 0.0) { outColor = bd; return; }
    vec3 uq = inv * vec3(gl_FragCoord.x, H - gl_FragCoord.y, 1.0);
    if (gB.z > 0.0) uq.xy = floor(uq.xy) + 0.5;
    vec2 uv = uq.xy / gB.x, fl = floor(uv);
    vec2 t = uv - fl; t = t * t * (3.0 - 2.0 * t);
    ivec2 c = ivec2(fl), f = ivec2(floor(uq.xy));
    vec3 px = floor(bd.rgb * 255.0 + 0.5);
    float noise = grainAt(c, t, f, gS.x, gS.y);
    float luma = min(1.0, (0.2126 * px.r + 0.7152 * px.g + 0.0722 * px.b) / 255.0), weight = gA.x * (0.4 + 2.4 * luma * (1.0 - luma)), speck = 0.0;
    if (gA.w > 0.0) { float h = lattice(f.x, f.y, gS.z); if (abs(h) > 1.0 - gA.w) speck = sign(h) * 0.55 * 255.0 * min(1.0, gB.y / 50.0); }
    vec3 g3 = px;
    for (int ch = 0; ch < 3; ch++) {
      float own = gA.z > 0.0 ? grainAt(c, t, f, gS.x + uint(ch + 1) * 0x9e3779b1u, gS.y + uint(ch + 1) * 0x85ebca6bu) : noise;
      g3[ch] = floor(clamp(px[ch] + (noise + (own - noise) * gA.z) * weight + speck, 0.0, 255.0) + 0.5);
    }
    outColor = vec4(bd.rgb + (g3 / 255.0 - bd.rgb) * opacity * cov, bd.a); return;
  }
  if (mode == 101) {
    if (bd.a <= 0.0) { outColor = bd; return; }
    vec3 v =floor(bd.rgb * 255.0 + 0.5) / 5.0;
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
  bool screen = (chOff & 16) != 0;
  vec3 q = inv * vec3(p, 1.0);
  if (!screen && (q.x < 0.0 || q.y < 0.0 || q.x >= size.x || q.y >= size.y)) { outColor = bd; return; }
  vec4 s0 = screen ? texelFetch(source, fb, 0) : textureLod(source, q.xy / size, lod);
  vec4 sc = s0.a > 0.0 && !screen ? vec4(s0.rgb / s0.a, s0.a) : s0;
  if (mode == 1 || mode == 5 || mode == 6 || mode == 11 || (mode >= 15 && mode <= 18) || mode == 21 || mode == 22) sc = vec4(floor(sc.rgb * 255.0 + 0.5) / 255.0, sc.a);
  float bif = 1.0;
  if (biCh != 0) bif = biFactor(biValue(sc.rgb, biCh), biT) * (bd.a <= 0.0 ? biFactor(255.0, biU) : biFactor(biValue(bd.rgb, biCh), biU));
  if ((chOff & 8) != 0) {
    float a0 = sc.a * cov * bif, a1 = bd.a * (1.0 - a0 * ko);
    vec4 kb = texelFetch(koTex, fb, 0);
    float ba = kb.a * a0, ao1 = a1 + ba * (1.0 - a1);
    bd = vec4(ao1 > 0.0 ? (bd.rgb * a1 + kb.rgb * ba * (1.0 - a1)) / ao1 : vec3(0.0), ao1);
  }
  float sa = sc.a * opacity * cov * bif; if (sa <= 0.0) { outColor = bd; return; }
  float ab = bd.a;
  if (mode == 1) { vec3 dp = vinv * vec3(p, 1.0); outColor = dissolveNoise(int(floor(dp.x)), int(floor(dp.y))) >= sa ? bd : keep(vec4(sc.rgb, 1.0), bd); return; }
  if (mode == 10) { float lo = min(1.0, sa + ab); vec3 lc = min(vec3(1.0), sc.rgb * sa + bd.rgb * ab); outColor = keep(vec4(lc / max(lo, 1e-6), lo), bd); return; }
  float ao = sa + ab * (1.0 - sa); if (ao <= 0.0) { outColor = vec4(0.0); return; }
  vec3 r = mode == 0 ? sc.rgb : blend(mode, bd.rgb, sc.rgb);
  outColor = keep(vec4((sa * (1.0 - ab) * sc.rgb + sa * ab * r + (1.0 - sa) * ab * bd.rgb) / ao, ao), bd);
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
  private readonly cache = new Map<object, { tex: WebGLTexture; version: number; w: number; h: number; bytes: number; seen: number; at: number; deep: boolean; src: unknown; mipAt: number }>();
  private acc: { tex: WebGLTexture; fb: WebGLFramebuffer }[] = [];
  private accW = 0;
  private accH = 0;
  private accHalf = false;
  /** Whether half-float colour attachments exist here (EXT_color_buffer_float): without it deep layers go up as 8 bits, as before. */
  floatOk = false;
  onLost: (() => void) | null = null;
  budgetBytes = 0;
  readonly stats: UploadStats = { uploads: 0, tiled: 0, bytes: 0 };
  private frameNo = 0;
  private scratch: HTMLCanvasElement | null = null;
  private readonly timer: GlFrameTimer;

  private constructor(readonly canvas: HTMLCanvasElement, private readonly gl: GL, private readonly comp: WebGLProgram, private readonly pres: WebGLProgram) {
    this.timer = new GlFrameTimer(gl);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('formvis: the WebGL2 context was lost'); this.onLost?.(); });
  }

  static create(canvas: HTMLCanvasElement, options: DisplayOptions = { power: 'high-performance', lowLatency: false }): GlDisplay | null {
    try {
      const gl = canvas.getContext('webgl2', { powerPreference: options.power, desynchronized: options.lowLatency, premultipliedAlpha: true, antialias: false, alpha: true });
      if (!gl) { console.warn('formvis: the display canvas gives no WebGL2 context'); return null; }
      const display = new GlDisplay(canvas, gl, program(gl, COMPOSITE_FS), program(gl, PRESENT_FS));
      display.floatOk = !!gl.getExtension('EXT_color_buffer_float');
      return display;
    } catch (err) {
      console.warn('formvis: WebGL2 could not start:', err);
      return null;
    }
  }

  get maxTexture(): number { return Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)); }

  private target(W: number, H: number, half = false): { tex: WebGLTexture; fb: WebGLFramebuffer } {
    const gl = this.gl, tex = gl.createTexture() as WebGLTexture, fb = gl.createFramebuffer() as WebGLFramebuffer;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W, H, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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
    this.frameNo++;
    const half = this.floatOk && anyLayer(layers, (l) => !!l.deep);
    if (!this.acc.length || this.accW !== W || this.accH !== H || this.accHalf !== half) {
      for (const a of this.acc) { gl.deleteTexture(a.tex); gl.deleteFramebuffer(a.fb); }
      this.acc = [this.target(W, H, half), this.target(W, H, half)];
      this.accW = W; this.accH = H; this.accHalf = half;
    }
    let [a, b] = this.acc;
    if (!out) this.timer.begin();
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
    gl.uniform1i(u('koTex'), 4);
    // Each clipping base's coverage, once per frame, into its own screen-sized target (mode 102).
    const clipOut = new Map<DisplayClip, WebGLTexture>(), folderOut = new Map<DisplayMask[], WebGLTexture>();
    let slot = 0;
    const clipCover = (c: DisplayClip): WebGLTexture => {
      const have = clipOut.get(c);
      if (have) return have;
      const up = c.parent ? clipCover(c.parent) : null, t = this.clipTarget(slot++, W, H);
      this.drawLayer({ image: c.image, deep: c.deep, linear: c.linear, version: c.version, width: c.width, height: c.height, matrix: c.matrix, opacity: c.opacity, blend: 'normal', mask: c.mask }, CLIP_MODE, up, this.blank(), t.fb, view, filter, used, u);
      clipOut.set(c, t.tex);
      return t.tex;
    };
    // A list of layers over `a` (cleared by the caller), `b` spare; a folder, clipped group or knockout backdrop inside it runs the same way on a pair of its own from the pool, one depth down.
    const run = (list: readonly DisplayLayer[], a: { tex: WebGLTexture; fb: WebGLFramebuffer }, b: { tex: WebGLTexture; fb: WebGLFramebuffer }, depth: number): { tex: WebGLTexture; fb: WebGLFramebuffer } => {
      for (const l of list) if (l.clip) clipCover(l.clip);
      for (const l of list) {
        if (!l.folders || folderOut.has(l.folders)) continue;
        let prev: WebGLTexture | null = null;
        for (const mk of l.folders) {
          const t = this.clipTarget(slot++, W, H);
          this.drawLayer({ image: null, version: 0, width: 1, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: 1, blend: 'normal', mask: mk }, FOLDER_MODE, prev, this.blank(), t.fb, view, filter, used, u);
          prev = t.tex;
        }
        if (prev) folderOut.set(l.folders, prev);
      }
      const alone = (inner: readonly DisplayLayer[]): WebGLTexture => {
        const [x, y] = this.subPair(depth, W, H, half);
        gl.bindFramebuffer(gl.FRAMEBUFFER, x.fb);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return run(inner, x, y, depth + 1).tex;
      };
      for (const l of list) {
        if (l.opacity <= 0 && !l.ko) continue;
        if (l.sub) {
          if (!l.sub.length) continue;
          this.drawLayer(l, blendIndex(l.blend), null, a.tex, b.fb, view, filter, used, u, { screen: alone(l.sub) });
          [a, b] = [b, a];
          continue;
        }
        if (l.width < 1 || l.height < 1) continue;
        const cover = l.clip ? clipOut.get(l.clip) ?? null : l.folders ? folderOut.get(l.folders) ?? null : null;
        this.drawLayer(l, l.grain ? GRAIN_MODE : l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend), cover, a.tex, b.fb, view, filter, used, u, l.ko ? { ko: alone(l.ko.back) } : undefined);
        [a, b] = [b, a];
      }
      return a;
    };
    a = run(layers, a, b, 0);
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
    this.timer.end();
    trimResident(this.cache, this.frameNo, this.budgetBytes, performance.now(), (e) => gl.deleteTexture(e.tex));
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
  private drawLayer(l: DisplayLayer, mode: number, clip: WebGLTexture | null, backdrop: WebGLTexture, fb: WebGLFramebuffer, view: Mat, filter: number, used: Set<object>, u: (n: string) => WebGLUniformLocation | null, extra?: { screen?: WebGLTexture; ko?: WebGLTexture }): void {
    const gl = this.gl;
    const noImage = mode === FOLDER_MODE || mode === GRAIN_MODE || !!extra?.screen;
    if (!noImage) used.add(l.lut ?? (l.image as object));
    const lod = !noImage && mode < LUT_MODE ? lodFor(mul(view, l.matrix), l.width, l.height) : 0;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, extra?.screen ?? (noImage ? this.blank() : this.texture(l, lod > 0)));
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, extra?.ko ?? this.blank());
    gl.activeTexture(gl.TEXTURE1);
    if (l.grain) {
      const g = l.grain;
      gl.uniform4f(u('gA'), g.strength, g.rough, g.colour, g.speckle);
      gl.uniform4f(u('gB'), g.cell, g.amount, filter === gl.NEAREST ? 1 : 0, 0);
      gl.uniform4ui(u('gS'), g.seed >>> 0, g.fineSeed >>> 0, g.specSeed >>> 0, 0);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lod > 0 ? gl.LINEAR_MIPMAP_LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.uniform1f(u('lod'), lod);
    const [ia, ib, ic, id, ie, iff] = invert(mul(view, l.matrix));
    gl.uniformMatrix3fv(u('inv'), false, [ia, ib, 0, ic, id, 0, ie, iff, 1]);
    gl.uniform2f(u('size'), l.width, l.height);
    gl.uniform1f(u('opacity'), Math.min(1, Math.max(0, l.opacity)));
    gl.uniform1i(u('mode'), mode);
    const [va, vb, vc, vd, ve, vf] = invert(view);
    gl.uniformMatrix3fv(u('vinv'), false, [va, vb, 0, vc, vd, 0, ve, vf, 1]);
    gl.uniform4f(u('biT'), ...(l.blendIf?.thisLayer ?? [0, 0, 255, 255]));
    gl.uniform4f(u('biU'), ...(l.blendIf?.underlying ?? [0, 0, 255, 255]));
    gl.uniform1i(u('biCh'), l.blendIf?.channel ?? 0);
    gl.uniform1i(u('chOff'), (l.chOff ?? 0) | (extra?.ko ? KO_FLAG : 0) | (extra?.screen ? SCREEN_FLAG : 0));
    gl.uniform1f(u('ko'), l.ko ? Math.min(1, Math.max(0, l.ko.opacity)) : 0);
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

  /** The pair of screen-sized targets a folder, clipped group or knockout backdrop at this depth composites on, kept between frames. */
  private subPool: { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number; half: boolean }[] = [];
  private subPair(depth: number, W: number, H: number, half: boolean): [{ tex: WebGLTexture; fb: WebGLFramebuffer }, { tex: WebGLTexture; fb: WebGLFramebuffer }] {
    for (const i of [depth * 2, depth * 2 + 1]) {
      const t = this.subPool[i];
      if (t && t.w === W && t.h === H && t.half === half) continue;
      if (t) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fb); }
      this.subPool[i] = { ...this.target(W, H, half), w: W, h: H, half };
    }
    return [this.subPool[depth * 2], this.subPool[depth * 2 + 1]];
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

  private texture(l: DisplayLayer, mips = false): WebGLTexture {
    const gl = this.gl, key = l.lut ?? (l.image as object), deep = this.floatOk && !!l.deep && !l.lut;
    let e = this.cache.get(key);
    if (e && (e.w !== l.width || e.h !== l.height || e.deep !== deep)) { gl.deleteTexture(e.tex); e = undefined; }
    if (!e) { e = { tex: gl.createTexture() as WebGLTexture, version: NaN, w: l.width, h: l.height, bytes: l.width * l.height * (deep ? 8 : 4), seen: 0, at: 0, deep, src: null, mipAt: NaN }; this.cache.set(key, e); }
    e.seen = this.frameNo;
    e.at = performance.now();
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    if (deep && e.src !== l.deep) { e.src = l.deep; e.version = NaN; e.mipAt = NaN; }
    if (l.lut) {
      // A table is data, not an image: uploaded as it is (no premultiplying), once for its settings.
      if (Number.isNaN(e.version)) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, l.width, l.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, l.lut);
        e.version = 0;
        this.stats.uploads++;
        this.stats.bytes += e.bytes;
      }
    } else if (l.image && (l.version < 0 || e.version !== l.version)) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !deep);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      // A changed layer sends only the 256 px tiles its raster says changed since this texture was written.
      const box = l.version < 0 ? null : dirtyBox(l.image, e.version, l.version, l.width, l.height);
      if (deep && l.deep) {
        const part = box ?? { x: 0, y: 0, w: l.width, h: l.height }, bits = deepHalf(l.deep, !!l.linear, part);
        if (box) { gl.texSubImage2D(gl.TEXTURE_2D, 0, part.x, part.y, part.w, part.h, gl.RGBA, gl.HALF_FLOAT, bits); this.stats.tiled++; }
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, part.w, part.h, 0, gl.RGBA, gl.HALF_FLOAT, bits);
        this.stats.bytes += part.w * part.h * 8;
      } else if (box) {
        const sc = this.scratch ??= document.createElement('canvas');
        if (sc.width !== box.w || sc.height !== box.h) { sc.width = box.w; sc.height = box.h; }
        const g = sc.getContext('2d') as CanvasRenderingContext2D;
        g.globalCompositeOperation = 'copy';
        g.drawImage(l.image as CanvasImageSource, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, box.x, box.y, gl.RGBA, gl.UNSIGNED_BYTE, sc);
        this.stats.tiled++;
        this.stats.bytes += box.w * box.h * 4;
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, l.image as TexImageSource);
        this.stats.bytes += e.bytes;
      }
      this.stats.uploads++;
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
      e.version = l.version;
    }
    if (mips && !l.lut && (e.version < 0 || e.mipAt !== e.version)) { gl.generateMipmap(gl.TEXTURE_2D); e.mipAt = e.version; }
    return e.tex;
  }

  destroy(): void {
    const gl = this.gl;
    for (const e of this.cache.values()) gl.deleteTexture(e.tex);
    this.cache.clear();
    for (const a of this.acc) { gl.deleteTexture(a.tex); gl.deleteFramebuffer(a.fb); }
    this.acc = [];
    for (const s of this.subPool) { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fb); }
    this.subPool = [];
  }
}

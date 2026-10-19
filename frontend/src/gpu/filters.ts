import type { GpuFilterRunner } from '../engine/gpu-filters';
import { BAND_CENTER, BAND_WIDTH, HSL_BANDS, bandOf, buildCurveLut, colorActive, curvesActive, vignetteShapeOf, type DevelopState } from '../engine/develop';
import { threeBoxWidths } from '../engine/filters';

/** The GPU filter runner (DEV_PLAN 36.10): Threshold, Add Noise (grain), Gaussian Blur, Unsharp Mask and the per-pixel
 *  part of Develop on an offscreen WebGL2 canvas, one fragment shader per filter, float textures for the blur. The
 *  shaders follow the CPU code step for step so the results agree to a level or two: Gaussian Blur is the same three
 *  box blurs per axis on premultiplied floats (not a different kernel), Add Noise and Develop's grain hash the pixel
 *  index with the same integer mixers, and Develop's tone, colour mixer and curve table are ports of `developPass`.
 *  Each method answers null (or false) where it cannot run, and the caller then filters on the CPU. Rows are not
 *  flipped anywhere: the framebuffer's row y is the image's row y. */

const VERT = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D t0; uniform sampler2D t1; out vec4 o;
`;

const FS_PREMUL = `void main() { vec4 s = texelFetch(t0, ivec2(gl_FragCoord.xy), 0); o = vec4(s.rgb * s.a, s.a); }`;

/** One box blur of radius r along dir, zeros past the edge, divided by the full width (as boxBlur does). */
const FS_BOX = `uniform int u_r; uniform ivec2 u_dir;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), sz = textureSize(t0, 0); vec4 s = vec4(0.0);
  for (int k = -u_r; k <= u_r; k++) { ivec2 q = c + u_dir * k; if (q.x >= 0 && q.y >= 0 && q.x < sz.x && q.y < sz.y) s += texelFetch(t0, q, 0); }
  o = s / float(2 * u_r + 1);
}`;

/** Premultiplied floats back to straight bytes; under half a level of alpha is transparent (unpremultiply). */
const FS_UNPREMUL = `void main() {
  vec4 p = texelFetch(t0, ivec2(gl_FragCoord.xy), 0);
  if (p.a * 255.0 < 0.5) { o = vec4(0.0); return; }
  o = vec4(p.rgb / p.a, p.a);
}`;

/** Unsharp: t0 the source bytes, t1 the blurred premultiplied floats, which the CPU rounds to bytes before the difference. */
const FS_UNSHARP = `uniform float u_gain; uniform float u_thr;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy); vec4 s = texelFetch(t0, c, 0);
  if (floor(s.a * 255.0 + 0.5) == 0.0) { o = s; return; }
  vec4 p = texelFetch(t1, c, 0); vec3 d = floor(s.rgb * 255.0 + 0.5), soft = vec3(0.0);
  if (p.a * 255.0 >= 0.5) soft = floor(p.rgb / p.a * 255.0 + 0.5);
  vec3 r = d;
  for (int i = 0; i < 3; i++) { float diff = d[i] - soft[i]; if (abs(diff) >= u_thr) r[i] = floor(clamp(d[i] + diff * u_gain, 0.0, 255.0) + 0.5); }
  o = vec4(r / 255.0, s.a);
}`;

const MIX = `uint mix32(uint z) { z += 0x9e3779b9u; z = (z ^ (z >> 16)) * 0x85ebca6bu; z = (z ^ (z >> 13)) * 0xc2b2ae35u; return z ^ (z >> 16); }
float toUnit(uint b) { return (float(b) + 0.5) / 4294967296.0; }
`;

const FS_NOISE = `${MIX}uniform float u_spread; uniform bool u_gauss; uniform bool u_mono; uniform uint u_seed;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), sz = textureSize(t0, 0); vec4 s = texelFetch(t0, c, 0);
  if (floor(s.a * 255.0 + 0.5) == 0.0) { o = s; return; }
  uint key = mix32(mix32(uint(c.y * sz.x + c.x)) ^ u_seed); vec3 v = floor(s.rgb * 255.0 + 0.5);
  for (int i = 0; i < 3; i++) {
    uint k = mix32(key + (u_mono ? 0u : uint(i)));
    float n = u_gauss ? sqrt(-2.0 * log(toUnit(k))) * cos(6.28318530717959 * toUnit(mix32(k))) * u_spread * (2.0 / 3.0) : (toUnit(k) * 2.0 - 1.0) * u_spread;
    v[i] = floor(clamp(v[i] + n, 0.0, 255.0) + 0.5);
  }
  o = vec4(v / 255.0, s.a);
}`;

const FS_THRESHOLD = `uniform float u_level;
void main() {
  vec4 s = texelFetch(t0, ivec2(gl_FragCoord.xy), 0); vec3 v = floor(s.rgb * 255.0 + 0.5);
  float l = (v.r * 0.299 + v.g * 0.587 + v.b * 0.114);
  o = vec4(vec3(l + 0.0005 >= u_level ? 1.0 : 0.0), s.a);
}`;

/** Develop's per-pixel pass (developPass), tone then colour mixer then the curve table; t1 is the 256 entry table. */
const FS_DEVELOP = `${MIX}
uniform uint u_seed; uniform float u_offset, u_exp, u_cont, u_high, u_shad, u_white, u_black, u_temp, u_tint, u_vib, u_sat, u_dehz, u_vig, u_grain;
uniform bool u_hasColor, u_hasCurve, u_colorize; uniform vec3 u_master; uniform vec3 u_vigp; uniform vec3 u_band[8]; uniform vec2 u_bandc[8];
float c01(float x) { return clamp(x, 0.0, 1.0); }
vec3 c01(vec3 x) { return clamp(x, 0.0, 1.0); }
float sstep(float e0, float e1, float x) { float t = c01((x - e0) / (e1 - e0)); return t * t * (3.0 - 2.0 * t); }
float lumaOf(vec3 c) { return c.r * 0.299 + c.g * 0.587 + c.b * 0.114; }
vec3 rgbToHsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), l = (mx + mn) / 2.0;
  if (mx == mn) return vec3(0.0, 0.0, c01(l));
  float d = mx - mn, s = l > 0.5 ? d / max(1e-5, 2.0 - mx - mn) : d / max(1e-5, mx + mn), h;
  s = c01(s);
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0); else if (mx == c.g) h = (c.b - c.r) / d + 2.0; else h = (c.r - c.g) / d + 4.0;
  return vec3(h * 60.0, s, c01(l));
}
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0; if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t; if (t < 0.5) return q; if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0; return p;
}
vec3 hslToRgb(float h, float s, float l) {
  s = c01(s); l = c01(l);
  if (s == 0.0) return vec3(l);
  float hn = mod(h, 360.0) / 360.0, q = l < 0.5 ? l * (1.0 + s) : l + s - l * s, p = 2.0 * l - q;
  return c01(vec3(hue2rgb(p, q, hn + 1.0 / 3.0), hue2rgb(p, q, hn), hue2rgb(p, q, hn - 1.0 / 3.0)));
}
float shiftL(float l, float delta) { float d = clamp(delta, -1.0, 1.0); return d >= 0.0 ? c01(l + (1.0 - l) * d) : c01(l + l * d); }
float hueW(float h, float center, float width) {
  float diff = abs(h - center); if (diff > 180.0) diff = 360.0 - diff;
  float half_ = max(5.0, width / 2.0), fall = max(12.0, half_ * 0.65);
  if (diff <= half_) return 1.0;
  if (diff <= half_ + fall) { float t = (diff - half_) / fall; return 0.5 * (1.0 + cos(3.14159265358979 * t)); }
  return 0.0;
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), sz = textureSize(t0, 0); vec4 s = texelFetch(t0, c, 0); vec3 v = floor(s.rgb * 255.0 + 0.5) / 255.0;
  float r = v.r, g = v.g, b = v.b;
  if (u_temp != 0.0 || u_tint != 0.0) {
    float lum = lumaOf(v); vec3 dv = v - lum;
    if (u_temp != 0.0) { float tv = u_temp / 100.0; dv.r += tv * 0.05; dv.b -= tv * 0.05; }
    if (u_tint != 0.0) { float tv = u_tint / 100.0; dv.g -= tv * 0.04; dv.r += tv * 0.02; dv.b += tv * 0.02; }
    v = lum + dv;
  }
  v = c01(v);
  float luma = lumaOf(v);
  if (u_offset != 0.0) v += u_offset / 100.0;
  if (u_exp != 0.0) { float m = pow(2.0, u_exp / 100.0); v *= m; luma *= m; }
  if (u_shad != 0.0) {
    float k = u_shad / 100.0, mask = 1.0 - sstep(0.0, 0.65, luma);
    if (k > 0.0) v += (1.0 - v) * mask * k * 0.75; else v += v * mask * k * 0.75;
  }
  if (u_high != 0.0) {
    float k = u_high / 100.0, boost = sstep(0.3, 1.0, luma) * k * 0.8, ln = k > 0.0 ? luma + (1.0 - luma) * boost : luma + luma * boost;
    v *= ln / max(1e-5, luma); luma = ln;
  }
  if (u_white != 0.0) {
    float k = u_white / 100.0, boost = sstep(0.45, 1.0, luma) * k * 1.2, ln = k > 0.0 ? luma + (1.0 - luma) * boost : luma + luma * boost;
    v *= ln / max(1e-5, luma); luma = ln;
  }
  if (u_black != 0.0) {
    float k = u_black / 100.0, mask = 1.0 - sstep(0.0, 0.35, luma);
    if (k > 0.0) v += (1.0 - v) * mask * k * 0.8; else v += v * mask * k * 0.8;
  }
  if (u_cont != 0.0) v = (v - 0.5) * (1.0 + u_cont / 100.0) + 0.5;
  v = c01(v);
  if (u_sat != 0.0) { float l0 = lumaOf(v), k = u_sat / 100.0, f = k > 0.0 ? 1.0 + k * 1.5 : 1.0 + k; v = c01(l0 + (v - l0) * f); }
  if (u_vib != 0.0) {
    float l0 = lumaOf(v), mask = c01(1.0 - (max(v.r, max(v.g, v.b)) - min(v.r, min(v.g, v.b)))), adj = (u_vib / 100.0) * mask;
    v = c01(v + (v - l0) * adj);
  }
  if (u_dehz != 0.0) {
    float k = u_dehz / 150.0, l0 = lumaOf(v), haze = c01(1.0 - (max(v.r, max(v.g, v.b)) - min(v.r, min(v.g, v.b))) * 2.0), mid = 1.0 - c01(abs(l0 - 0.5) * 2.0), w = c01(0.35 + 0.65 * haze * mid);
    if (k > 0.0) {
      v = (v - 0.5) * (1.0 + k * 0.9 * w) + 0.5;
      float neutral = (v.r + v.g + v.b) / 3.0, sb = k * 0.18 * w; v += (v - neutral) * sb;
    } else { float soften = -k * 0.45 * w; v = (v - 0.5) * (1.0 - soften) + 0.5; }
    v = c01(v);
  }
  if (u_vig != 0.0) {
    float cx = float(sz.x) / 2.0, cy = float(sz.y) / 2.0, maxR = sqrt(cx * cx + cy * cy), ro = u_vigp.z / 100.0;
    float sx = max(1.0, cx * (1.0 - ro) + maxR * ro), sy = max(1.0, cy * (1.0 - ro) + maxR * ro), corner = length(vec2(cx / sx, cy / sy));
    if (corner == 0.0) corner = 1.0;
    float fall = c01((length(vec2((float(c.x) - cx) / sx, (float(c.y) - cy) / sy)) / corner - u_vigp.x / 100.0) * (abs(u_vig) / 50.0) * (50.0 / max(1.0, u_vigp.y)));
    if (u_vig > 0.0) v *= 1.0 - fall; else v += (1.0 - v) * fall;
  }
  if (u_grain > 0.0) {
    uint a = u_seed + uint(c.y * sz.x + c.x + 1) * 0x6d2b79f5u;
    uint t = (a ^ (a >> 15)) * (1u | a); t = (t + (t ^ (t >> 7)) * (61u | t)) ^ t;
    float rnd = float(t ^ (t >> 14)) / 4294967296.0;
    v += (rnd - 0.5) * 2.0 * (u_grain / 200.0);
  }
  v = c01(v);
  if (u_hasColor) {
    vec3 hsl = rgbToHsl(v), nc;
    if (u_colorize) {
      float nh = u_master.x; if (nh < 0.0) nh += 360.0;
      nc = hslToRgb(nh, c01(0.5 + u_master.y / 100.0), shiftL(hsl.z, u_master.z / 100.0));
    } else {
      float hShift = u_master.x, lShift = u_master.z / 100.0, chroma = 1.0 + (u_master.y / 100.0) * 1.2;
      for (int i = 0; i < 8; i++) {
        vec3 bd = u_band[i]; if (bd.x == 0.0 && bd.y == 0.0 && bd.z == 0.0) continue;
        float w = hueW(hsl.x, u_bandc[i].x, u_bandc[i].y);
        if (w > 0.0) { hShift += bd.x * w; chroma += (bd.y / 100.0) * 1.2 * w; lShift += (bd.z / 100.0) * w; }
      }
      float nh = mod(hsl.x + hShift, 360.0);
      nc = hslToRgb(nh, hsl.y, shiftL(hsl.z, lShift));
      if (chroma != 1.0) { float l0 = lumaOf(nc), m = max(0.0, chroma); nc = l0 + (nc - l0) * m; }
    }
    v = c01(nc);
  }
  if (u_hasCurve) {
    ivec3 i = ivec3(clamp(floor(v * 255.0 + 0.5), 0.0, 255.0));
    v = vec3(texelFetch(t1, ivec2(i.r, 0), 0).r, texelFetch(t1, ivec2(i.g, 0), 0).g, texelFetch(t1, ivec2(i.b, 0), 0).b);
  }
  o = vec4(v, s.a);
}`;

interface Tex { t: WebGLTexture; w: number; h: number }
type Loc = (name: string) => WebGLUniformLocation | null;

export class GlFilters implements GpuFilterRunner {
  private readonly programs = new Map<string, WebGLProgram>();
  private readonly fbo: WebGLFramebuffer;
  private readonly maxSize: number;
  /** Why the last call gave up, for the benchmark and the log. */
  lastError = '';

  private constructor(private readonly gl: WebGL2RenderingContext, readonly floatType: 'f32' | 'f16') {
    this.fbo = gl.createFramebuffer()!;
    this.maxSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
  }

  /** A runner on a fresh offscreen canvas, or null where WebGL2 is missing. Float targets use RGBA32F where
   *  EXT_color_buffer_float is present, else RGBA16F, else the blur is left to the CPU (still created for the rest). */
  static create(): GlFilters | null {
    try {
      const gl = document.createElement('canvas').getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) return null;
      const f32 = !!gl.getExtension('EXT_color_buffer_float') || false;
      return new GlFilters(gl, f32 ? 'f32' : 'f16');
    } catch { return null; }
  }

  get ok(): boolean { return !this.gl.isContextLost(); }

  destroy(): void {
    const gl = this.gl;
    for (const p of this.programs.values()) gl.deleteProgram(p);
    this.programs.clear();
    gl.deleteFramebuffer(this.fbo);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // ---- plumbing

  private program(key: string, frag: string): WebGLProgram {
    const hit = this.programs.get(key);
    if (hit) return hit;
    const gl = this.gl, p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, HEAD + frag]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${key}: ${gl.getShaderInfoLog(s) ?? 'shader failed'}`);
      gl.attachShader(p, s); gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${key}: ${gl.getProgramInfoLog(p) ?? 'link failed'}`);
    this.programs.set(key, p);
    return p;
  }

  private tex(w: number, h: number, kind: 'u8' | 'float', data: Uint8Array | null = null): Tex {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (kind === 'u8') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    else if (this.floatType === 'f32') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return { t, w, h };
  }

  private free(...ts: Tex[]): void { for (const t of ts) this.gl.deleteTexture(t.t); }

  private pass(p: WebGLProgram, out: Tex, inputs: Tex[], set?: (gl: WebGL2RenderingContext, loc: Loc) => void): void {
    const gl = this.gl, loc: Loc = (n) => gl.getUniformLocation(p, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out.t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete');
    gl.viewport(0, 0, out.w, out.h);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(p);
    inputs.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t.t); gl.uniform1i(loc(`t${i}`), i); });
    set?.(gl, loc);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private readBack(t: Tex, into: Uint8Array): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.t, 0);
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, into);
  }

  /** Run `body` guarded: a size the GPU cannot hold, a lost context or any GL error gives null. */
  private guard<T>(w: number, h: number, body: () => T): T | null {
    if (!this.ok || w < 1 || h < 1 || w > this.maxSize || h > this.maxSize) return null;
    try { this.lastError = ''; return body(); } catch (e) { this.lastError = String(e instanceof Error ? e.message : e); return null; }
  }

  /** One image through a single fragment shader: upload, draw, read back. */
  private single(key: string, frag: string, src: ImageData, set?: (gl: WebGL2RenderingContext, loc: Loc) => void, extra?: Tex): ImageData | null {
    const { width: w, height: h } = src;
    return this.guard(w, h, () => {
      const input = this.tex(w, h, 'u8', new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.byteLength)), out = this.tex(w, h, 'u8');
      const res = new ImageData(w, h);
      try {
        this.pass(this.program(key, frag), out, extra ? [input, extra] : [input], set);
        this.readBack(out, new Uint8Array(res.data.buffer));
      } finally { this.free(input, out); }
      return res;
    });
  }

  // ---- filters

  threshold(px: Uint8ClampedArray, level: number): boolean {
    const n = px.length / 4, w = Math.max(1, Math.min(n, 2048)), h = Math.ceil(n / w);
    if (n < 1) return true;
    const ok = this.guard(w, h, () => {
      const flat = new Uint8Array(w * h * 4);
      flat.set(px);
      const input = this.tex(w, h, 'u8', flat), out = this.tex(w, h, 'u8');
      try {
        this.pass(this.program('threshold', FS_THRESHOLD), out, [input], (gl, loc) => gl.uniform1f(loc('u_level'), level));
        this.readBack(out, flat);
      } finally { this.free(input, out); }
      // A pixel whose luminance is exactly the level is decided by the CPU's rounding in doubles (grey 100 at level 100 comes
      // out black there, grey 128 at 128 white), which a float32 shader cannot reproduce; those few are decided by the same
      // double arithmetic here, so both paths agree to the last pixel. Only whole-number levels can tie.
      if (Number.isInteger(level)) {
        for (let i = 0; i < px.length; i += 4) {
          if (299 * px[i] + 587 * px[i + 1] + 114 * px[i + 2] !== 1000 * level) continue;
          const x = (0.299 * (px[i] / 255) + 0.587 * (px[i + 1] / 255) + 0.114 * (px[i + 2] / 255)) * 255 >= level ? 255 : 0;
          flat[i] = flat[i + 1] = flat[i + 2] = x;
        }
      }
      px.set(flat.subarray(0, px.length));
      return true;
    });
    return ok === true;
  }

  addNoise(src: ImageData, amount: number, gaussian: boolean, monochromatic: boolean, seed: number): ImageData | null {
    return this.single('noise', FS_NOISE, src, (gl, loc) => {
      gl.uniform1f(loc('u_spread'), (amount / 100) * 127.5);
      gl.uniform1i(loc('u_gauss'), gaussian ? 1 : 0); gl.uniform1i(loc('u_mono'), monochromatic ? 1 : 0);
      gl.uniform1ui(loc('u_seed'), seed >>> 0);
    });
  }

  /** The blurred premultiplied floats of `src` (three box blurs per axis, as gaussianBlur), as a float texture the caller frees. */
  private blurred(srcTex: Tex, sigma: number): Tex {
    const { w, h } = srcTex;
    let a = this.tex(w, h, 'float'), b = this.tex(w, h, 'float');
    this.pass(this.program('premul', FS_PREMUL), a, [srcTex]);
    const box = this.program('box', FS_BOX);
    for (const width of threeBoxWidths(sigma)) {
      const r = (width - 1) / 2;
      for (const dir of [[1, 0], [0, 1]] as const) {
        this.pass(box, b, [a], (gl, loc) => { gl.uniform1i(loc('u_r'), r); gl.uniform2i(loc('u_dir'), dir[0], dir[1]); });
        [a, b] = [b, a];
      }
    }
    this.free(b);
    return a;
  }

  gaussianBlur(src: ImageData, sigma: number): ImageData | null {
    const { width: w, height: h } = src;
    if (!(sigma >= 0.1)) return new ImageData(new Uint8ClampedArray(src.data), w, h);
    return this.guard(w, h, () => {
      const input = this.tex(w, h, 'u8', new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.byteLength)), out = this.tex(w, h, 'u8');
      const res = new ImageData(w, h);
      let soft: Tex | null = null;
      try {
        soft = this.blurred(input, sigma);
        this.pass(this.program('unpremul', FS_UNPREMUL), out, [soft]);
        this.readBack(out, new Uint8Array(res.data.buffer));
      } finally { this.free(input, out); if (soft) this.free(soft); }
      return res;
    });
  }

  unsharpMask(src: ImageData, amount: number, radius: number, threshold: number): ImageData | null {
    const { width: w, height: h } = src;
    return this.guard(w, h, () => {
      const input = this.tex(w, h, 'u8', new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.byteLength)), out = this.tex(w, h, 'u8');
      const res = new ImageData(w, h);
      let soft: Tex | null = null;
      try {
        soft = this.blurred(input, Math.max(0.1, radius));
        this.pass(this.program('unsharp', FS_UNSHARP), out, [input, soft], (gl, loc) => { gl.uniform1f(loc('u_gain'), amount / 100); gl.uniform1f(loc('u_thr'), threshold); });
        this.readBack(out, new Uint8Array(res.data.buffer));
      } finally { this.free(input, out); if (soft) this.free(soft); }
      return res;
    });
  }

  develop(src: ImageData, state: DevelopState, seed: number): ImageData | null {
    const t = state.tone, hasColor = colorActive(state.color), hasCurve = curvesActive(state.curves);
    let table: Tex | null = null;
    if (hasCurve) {
      // One entry per level: the RGB curve, then the channel's own, as developPass applies them one after the other.
      const rgb = buildCurveLut(state.curves.rgb), lr = buildCurveLut(state.curves.r), lg = buildCurveLut(state.curves.g), lb = buildCurveLut(state.curves.b), d = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) d.set([lr[rgb[i]], lg[rgb[i]], lb[rgb[i]], 255], i * 4);
      table = this.guard(256, 1, () => this.tex(256, 1, 'u8', d));
      if (!table) return null;
    }
    try {
      return this.single('develop', FS_DEVELOP, src, (gl, loc) => {
        const f = (n: string, v: number): void => gl.uniform1f(loc(n), v);
        f('u_offset', t.offset); f('u_exp', t.exposure); f('u_cont', t.contrast); f('u_high', t.highlights); f('u_shad', t.shadows); f('u_white', t.whites); f('u_black', t.blacks);
        f('u_temp', t.temperature); f('u_tint', t.tint); f('u_vib', t.vibrance); f('u_sat', t.saturation); f('u_dehz', t.dehaze); f('u_vig', t.vignette); f('u_grain', t.grain);
        gl.uniform1ui(loc('u_seed'), seed >>> 0);
        gl.uniform1i(loc('u_hasColor'), hasColor ? 1 : 0); gl.uniform1i(loc('u_hasCurve'), hasCurve ? 1 : 0); gl.uniform1i(loc('u_colorize'), state.color.colorize ? 1 : 0);
        const m = state.color.master;
        gl.uniform3f(loc('u_master'), m.h, m.s, m.l);
        const vs = vignetteShapeOf(state);
        gl.uniform3f(loc('u_vigp'), vs.midpoint, vs.feather, vs.roundness);
        gl.uniform3fv(loc('u_band'), HSL_BANDS.flatMap((k) => { const b = bandOf(state.color, k); return [b.h, b.s, b.l]; }));
        gl.uniform2fv(loc('u_bandc'), HSL_BANDS.flatMap((k) => [BAND_CENTER[k], BAND_WIDTH[k]]));
      }, table ?? undefined);
    } finally { if (table) this.free(table); }
  }
}

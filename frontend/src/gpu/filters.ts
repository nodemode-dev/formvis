import type { GpuFilterRunner, GpuSmudge, LensGatherInput } from '../engine/gpu-filters';
import type { GpuEffectJob, GpuEffectRunner } from '../engine/gpu-effects';
import type { Surface } from '../engine/surface';
import type { Rect } from '../engine/types';
import { BAND_CENTER, BAND_WIDTH, HSL_BANDS, bandOf, buildCurveLut, buildParametricLut, calibrationActive, calibrationOf, colorActive, curvesActive, gradingActive, gradingOf, hslToRgb, parametricActive, parametricOf, pointColorActive, pointColorOf, rgbToHsl, toneProcessOf, vignetteShapeOf, type DevelopState } from '../engine/develop';
import { threeBoxWidths } from '../engine/filters';
import { frameTrace } from './frame-trace';

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

/** Liquify (liquifyImage): the source read bilinearly, premultiplied, at q - D(q) where D is the field read bilinearly from t1 (RG32F). */
const FS_LIQUIFY = `uniform float u_cell, u_scale; uniform ivec2 u_g;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), sz = textureSize(t0, 0);
  vec2 q = (vec2(c) + 0.5) / u_scale, g = clamp(q / u_cell, vec2(0.0), vec2(u_g) - 1.001);
  ivec2 g0 = ivec2(floor(g)); vec2 t = g - vec2(g0);
  vec2 d = (texelFetch(t1, g0, 0).rg * (1.0 - t.x) + texelFetch(t1, g0 + ivec2(1, 0), 0).rg * t.x) * (1.0 - t.y) + (texelFetch(t1, g0 + ivec2(0, 1), 0).rg * (1.0 - t.x) + texelFetch(t1, g0 + ivec2(1, 1), 0).rg * t.x) * t.y;
  vec2 sp = q - d - 0.5; ivec2 s0 = ivec2(floor(sp)); vec2 f = sp - vec2(s0);
  vec3 acc = vec3(0.0); float a = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 p = s0 + ivec2(i, j);
    if (p.x < 0 || p.y < 0 || p.x >= sz.x || p.y >= sz.y) continue;
    vec4 s = texelFetch(t0, p, 0); float al = s.a * (i == 1 ? f.x : 1.0 - f.x) * (j == 1 ? f.y : 1.0 - f.y);
    acc += s.rgb * 255.0 * al; a += al;
  }
  if (a > 1e-4) o = vec4(floor(acc / a + 0.5) / 255.0, floor(a * 255.0 + 0.5) / 255.0); else o = vec4(0.0);
}`;

/** Smudge (WarpStroke.deposit), one dab. The brush weight as WarpStroke.weight; t0 the canvas bytes, t1 the paint floats (side x side). */
const SM_WEIGHT = `uniform vec2 u_at; uniform float u_half, u_hard, u_lay, u_take; uniform int u_r; uniform ivec2 u_c;
float weightOf(float u) {
  if (u >= 1.0) return 0.0;
  if (u <= u_hard) return 1.0;
  return 0.5 + 0.5 * cos(3.14159265358979 * (u - u_hard) / (1.0 - u_hard));
}
`;
/** The paint after the dab: it takes on the canvas beneath by weight times take. Drawn over the side x side paint texture. */
const FS_SMUDGE_PAINT = `${SM_WEIGHT}void main() {
  ivec2 k = ivec2(gl_FragCoord.xy), q = u_c + k - ivec2(u_r), sz = textureSize(t0, 0); vec4 p = texelFetch(t1, k, 0);
  if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) { o = p; return; }
  float w = weightOf(length(vec2(q) + 0.5 - u_at) / u_half);
  if (w <= 0.0) { o = p; return; }
  vec4 under = floor(texelFetch(t0, q, 0) * 255.0 + 0.5);
  o = p + (under - p) * w * u_take;
}`;
/** The canvas after the dab: the paint laid down by weight times lay, rounded to a byte. Drawn over the canvas inside a scissor. */
const FS_SMUDGE_CANVAS = `${SM_WEIGHT}void main() {
  ivec2 q = ivec2(gl_FragCoord.xy), k = q - u_c + ivec2(u_r); int side = 2 * u_r + 1; vec4 s = texelFetch(t0, q, 0);
  if (k.x < 0 || k.y < 0 || k.x >= side || k.y >= side) { o = s; return; }
  float w = weightOf(length(vec2(q) + 0.5 - u_at) / u_half);
  if (w <= 0.0) { o = s; return; }
  vec4 under = floor(s * 255.0 + 0.5), p = texelFetch(t1, k, 0);
  o = floor(under + (p - under) * w * u_lay + 0.5) / 255.0;
}`;

/** Develop's per-pixel pass (developPass), tone then colour mixer then the curve table; t1 is the 256 entry table. */
const FS_DEVELOP = `${MIX}
uniform uint u_seed; uniform float u_offset, u_exp, u_cont, u_high, u_shad, u_white, u_black, u_temp, u_tint, u_vib, u_sat, u_dehz, u_vig, u_grain;
uniform bool u_hasColor, u_hasCurve, u_hasPara, u_colorize; uniform vec3 u_master; uniform vec3 u_vigp; uniform vec3 u_band[8]; uniform vec2 u_bandc[8];
uniform vec2 u_tp[4]; uniform bool u_hasPc, u_hasCal, u_hasGrade; uniform vec3 u_pc0, u_pcw, u_pcd, u_calh, u_cals, u_gts, u_gtm, u_gth, u_gtg; uniform vec4 u_gl; uniform vec2 u_gpv; uniform float u_calt;
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
float bellW(float d, float w) { return d >= w ? 0.0 : 0.5 + 0.5 * cos(3.14159265358979 * d / w); }
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
    float k = u_shad / 100.0, mask = 1.0 - sstep(0.0, u_tp[0].x, luma);
    if (k > 0.0) v += (1.0 - v) * mask * k * u_tp[0].y; else v += v * mask * k * u_tp[0].y;
  }
  if (u_high != 0.0) {
    float k = u_high / 100.0, boost = sstep(u_tp[1].x, 1.0, luma) * k * u_tp[1].y, ln = k > 0.0 ? luma + (1.0 - luma) * boost : luma + luma * boost;
    v *= ln / max(1e-5, luma); luma = ln;
  }
  if (u_white != 0.0) {
    float k = u_white / 100.0, boost = sstep(u_tp[2].x, 1.0, luma) * k * u_tp[2].y, ln = k > 0.0 ? luma + (1.0 - luma) * boost : luma + luma * boost;
    v *= ln / max(1e-5, luma); luma = ln;
  }
  if (u_black != 0.0) {
    float k = u_black / 100.0, mask = 1.0 - sstep(0.0, u_tp[3].x, luma);
    if (k > 0.0) v += (1.0 - v) * mask * k * u_tp[3].y; else v += v * mask * k * u_tp[3].y;
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
  if (u_hasPara) {
    ivec3 j = ivec3(clamp(floor(v * 255.0 + 0.5), 0.0, 255.0));
    v = vec3(texelFetch(t1, ivec2(j.r, 1), 0).r, texelFetch(t1, ivec2(j.g, 1), 0).g, texelFetch(t1, ivec2(j.b, 1), 0).b);
  }
  v = floor(v * 255.0 + 0.5) / 255.0;
  if (u_hasPc) {
    vec3 hsl = rgbToHsl(v);
    if (hsl.y >= 0.02) {
      float dh = abs(hsl.x - u_pc0.x); if (dh > 180.0) dh = 360.0 - dh;
      float w = bellW(dh, u_pcw.x) * bellW(abs(hsl.y - u_pc0.y), u_pcw.y) * bellW(abs(hsl.z - u_pc0.z), u_pcw.z);
      if (w > 0.0) v = floor(hslToRgb(hsl.x + u_pcd.x * 0.6 * w, c01(hsl.y * (1.0 + (u_pcd.y / 100.0) * w)), shiftL(hsl.z, (u_pcd.z / 100.0) * 0.5 * w)) * 255.0 + 0.5) / 255.0;
    }
  }
  if (u_hasCal || u_hasGrade) {
    if (u_hasCal) {
      vec3 hsl = rgbToHsl(v);
      float wR = hueW(hsl.x, 0.0, 120.0), wG = hueW(hsl.x, 120.0, 120.0), wB = hueW(hsl.x, 240.0, 120.0);
      v = hslToRgb(hsl.x + (wR * u_calh.x + wG * u_calh.y + wB * u_calh.z) * 0.3, c01(hsl.y * (1.0 + (wR * u_cals.x + wG * u_cals.y + wB * u_cals.z) / 100.0)), hsl.z);
      if (u_calt != 0.0) { float k = (u_calt / 100.0) * pow(1.0 - hsl.z, 2.0) * 20.0 / 255.0; v.r += k; v.b += k; v.g -= k; }
    }
    if (u_hasGrade) {
      float L = lumaOf(v), wd = u_gpv.x, pv = u_gpv.y;
      float wS = sstep(pv + wd, pv - wd, L), wH = sstep(pv - wd, pv + wd, L), wM = 1.0 - sstep(0.0, wd, abs(L - pv));
      vec3 n = v + u_gts * wS + u_gtm * wM + u_gth * wH + u_gtg;
      float lift = ((u_gl.x * wS + u_gl.y * wM + u_gl.z * wH + u_gl.w) / 100.0) * 0.4;
      v = n + (L - lumaOf(n) + lift);
    }
    v = floor(c01(v) * 255.0 + 0.5) / 255.0;
  }
  o = vec4(v, s.a);
}`;

/** Lens Blur's gather, step for step as lensBlur's loop: t0 the levels stacked by slot, t1 the radius, t2 the taps (one row per tier), t3 the source bytes. */
const FS_LENS = `uniform sampler2D t2; uniform sampler2D t3;
uniform ivec2 u_size; uniform int u_slot[5]; uniform int u_has[5]; uniform int u_sizes[5]; uniform int u_tiers[6]; uniform bool u_depth;
float enc(float c) { c = clamp(c, 0.0, 1.0); c = c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; return floor(c * 255.0 + 0.5) / 255.0; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(t3, p, 0);
  float r = texelFetch(t1, p, 0).r;
  if (r < 0.5) { o = s; return; }
  float want = min(256.0, max(12.0, 0.9 * r * r));
  int ti = 5;
  for (int i = 0; i < 6; i++) if (float(u_tiers[i]) >= want) { ti = i; break; }
  int count = u_tiers[ti];
  float gap = (r * 1.77) / sqrt(float(count)) / 2.0;
  int lv = 0;
  for (int q = 1; q < 5; q++) if (float(u_sizes[q]) <= gap * 2.0 && u_has[q] == 1) lv = q;
  int base = u_slot[lv] * u_size.y;
  vec4 a = vec4(0.0); float ws = 0.0;
  for (int t = 0; t < count; t++) {
    vec3 tp = texelFetch(t2, ivec2(t, ti), 0).xyz;
    vec2 d = -tp.xy * r;
    ivec2 q = ivec2(floor(vec2(p) + d + 0.5));
    if (q.x < 0 || q.y < 0 || q.x >= u_size.x || q.y >= u_size.y) { ws += tp.z; continue; }
    float cw = tp.z;
    if (u_depth) cw = clamp(texelFetch(t1, q, 0).r - length(d) + 1.0, 0.0, 1.0) * tp.z;
    a += texelFetch(t0, ivec2(q.x, base + q.y), 0) * cw;
    ws += cw;
  }
  if (ws <= 1e-6 || a.w <= 1e-9) { o = s; return; }
  o = vec4(enc(a.x / a.w), enc(a.y / a.w), enc(a.z / a.w), floor(a.w / ws * 255.0 + 0.5) / 255.0);
}`;

/** Layer-style effect maps (PC-EN-0507). t0 is the silhouette's canvas, whose alpha is read through u_org and u_box (the part of it the
 *  effect covers, which is the output's size; outside it nothing is silhouette); the other inputs follow from t1. The arithmetic is
 *  the CPU builder's: distances are the exact Euclidean transform (columns, then rows), a grow or shrink the one-pixel soft edge of
 *  resizeMask, the blur a Gaussian of half the canvas shadow's blur, the colour a constant. */
const FX_HEAD = `uniform ivec2 u_org; uniform ivec2 u_box;
bool inBox(ivec2 c) { return c.x >= 0 && c.y >= 0 && c.x < u_box.x && c.y < u_box.y; }
float silByte(ivec2 c) { return inBox(c) ? floor(texelFetch(t0, c + u_org, 0).a * 255.0 + 0.5) : 0.0; }
`;
const FS_FX_ALPHA = `${FX_HEAD}uniform bool u_inv; void main() { float a = silByte(ivec2(gl_FragCoord.xy)) / 255.0; o = vec4(u_inv ? 1.0 - a : a, 0.0, 0.0, 1.0); }`;
const FS_FX_EDT_V = `${FX_HEAD}uniform int u_r; uniform bool u_inv;
bool hit(ivec2 c) { return inBox(c) && (u_inv ? silByte(c) < 128.0 : silByte(c) >= 128.0); }
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy); float best = 1.0e20;
  for (int k = 0; k <= u_r; k++) if (hit(c + ivec2(0, k)) || hit(c - ivec2(0, k))) { best = float(k * k); break; }
  o = vec4(best, 0.0, 0.0, 1.0);
}`;
const FS_FX_EDT_H = `uniform int u_r;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), sz = textureSize(t0, 0); float best = 1.0e20;
  for (int k = -u_r; k <= u_r; k++) {
    int x = c.x + k;
    if (x < 0 || x >= sz.x) continue;
    best = min(best, float(k * k) + texelFetch(t0, ivec2(x, c.y), 0).r);
  }
  o = vec4(sqrt(best), 0.0, 0.0, 1.0);
}`;
const FS_FX_GROW = `${FX_HEAD}uniform float u_d; uniform bool u_shrink, u_inv;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy); float a = silByte(c), v;
  if (u_shrink) v = a < 128.0 ? 0.0 : floor(clamp(texelFetch(t1, c, 0).r - u_d - 0.5, 0.0, 1.0) * 255.0 + 0.5);
  else v = a >= 128.0 ? 255.0 : floor(clamp(u_d + 0.5 - texelFetch(t1, c, 0).r, 0.0, 1.0) * 255.0 + 0.5);
  o = vec4((u_inv ? 255.0 - v : v) / 255.0, 0.0, 0.0, 1.0);
}`;
const FS_FX_BLUR = `${FX_HEAD}uniform ivec2 u_dir; uniform float u_sigma, u_shift; uniform bool u_final; uniform int u_mode; uniform vec3 u_color; uniform int u_off;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), sz = textureSize(t1, 0); bool horiz = u_dir.x != 0;
  float u = float((horiz ? c.x : c.y) + u_off) - u_shift, k2 = 1.0 / (2.0 * u_sigma * u_sigma), acc = 0.0, z = 0.0;
  int i0 = int(floor(u)), K = int(ceil(3.0 * u_sigma)), n = horiz ? sz.x : sz.y;
  for (int k = -K; k <= K + 1; k++) {
    int ib = i0 + k, i = ib - u_off; float d = float(ib) - u, w = exp(-d * d * k2);
    z += w;
    if (i < 0 || i >= n) continue;
    acc += w * texelFetch(t1, horiz ? ivec2(i, c.y) : ivec2(c.x, i), 0).r;
  }
  float v = acc / z;
  if (!u_final) { o = vec4(v, 0.0, 0.0, 1.0); return; }
  float a = floor(v * 255.0 + 0.5);
  if (u_mode == 1) a = floor(a * (1.0 - silByte(c) / 255.0) + 0.5); else if (u_mode == 2) a = floor(a * silByte(c) / 255.0 + 0.5);
  o = vec4(u_color / 255.0, a / 255.0);
}`;
const FS_FX_DOWN = `void main() {
  ivec2 c = ivec2(gl_FragCoord.xy) * 2, sz = textureSize(t1, 0); float s = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) { ivec2 q = c + ivec2(i, j); if (q.x < sz.x && q.y < sz.y) s += texelFetch(t1, q, 0).r; }
  o = vec4(s * 0.25, 0.0, 0.0, 1.0);
}`;
const FS_FX_UP = `${FX_HEAD}uniform int u_mode; uniform vec3 u_color;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), sz = textureSize(t1, 0), hi = sz - 1;
  vec2 q = (vec2(c) + 0.5) * 0.5 - 0.5, fl = floor(q), f = q - fl; ivec2 q0 = ivec2(fl);
  float a00 = texelFetch(t1, clamp(q0, ivec2(0), hi), 0).r, a10 = texelFetch(t1, clamp(q0 + ivec2(1, 0), ivec2(0), hi), 0).r;
  float a01 = texelFetch(t1, clamp(q0 + ivec2(0, 1), ivec2(0), hi), 0).r, a11 = texelFetch(t1, clamp(q0 + ivec2(1, 1), ivec2(0), hi), 0).r;
  float a = floor(mix(mix(a00, a10, f.x), mix(a01, a11, f.x), f.y) * 255.0 + 0.5);
  if (u_mode == 1) a = floor(a * (1.0 - silByte(c) / 255.0) + 0.5); else if (u_mode == 2) a = floor(a * silByte(c) / 255.0 + 0.5);
  o = vec4(u_color / 255.0, a / 255.0);
}`;
const FS_FX_RAMP = `${FX_HEAD}uniform float u_size, u_hold; uniform vec3 u_color;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy); float dd = silByte(c) >= 128.0 ? 0.0 : max(0.0, texelFetch(t1, c, 0).r - 0.5);
  float r = dd <= u_hold ? 1.0 : max(0.0, 1.0 - (dd - u_hold) / max(1.0e-6, u_size - u_hold));
  o = vec4(u_color / 255.0, floor(r * 255.0 + 0.5) / 255.0);
}`;
const FS_FX_RING = `${FX_HEAD}uniform sampler2D t2; uniform float u_outer, u_inner; uniform bool u_clear; uniform vec3 u_color;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy); float a = silByte(c);
  float outer = u_outer > 0.0 ? (a >= 128.0 ? 255.0 : floor(clamp(u_outer + 0.5 - texelFetch(t1, c, 0).r, 0.0, 1.0) * 255.0 + 0.5)) : a;
  float inner = u_inner > 0.0 ? (a < 128.0 ? 0.0 : floor(clamp(texelFetch(t2, c, 0).r - u_inner - 0.5, 0.0, 1.0) * 255.0 + 0.5)) : 0.0;
  float band = max(0.0, outer - inner);
  if (u_clear) band = floor(band * (1.0 - a / 255.0) + 0.5);
  o = vec4(u_color / 255.0, band / 255.0);
}`;

interface Tex { t: WebGLTexture; w: number; h: number }
type Loc = (name: string) => WebGLUniformLocation | null;

export class GlFilters implements GpuFilterRunner, GpuEffectRunner {
  private readonly programs = new Map<string, WebGLProgram>();
  private readonly fbo: WebGLFramebuffer;
  private readonly maxSize: number;
  /** Why the last call gave up, for the benchmark and the log. */
  lastError = '';
  /** GPU time of the last single-pass filter in milliseconds, from EXT_disjoint_timer_query_webgl2 where the extension exists; null otherwise or when the counter was disjoint. */
  lastGpuMs: number | null = null;
  private readonly timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;

  private constructor(private readonly gl: WebGL2RenderingContext, readonly floatType: 'f32' | 'f16') {
    this.fbo = gl.createFramebuffer()!;
    this.maxSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
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
      const gl = this.gl, q = this.timer ? gl.createQuery() : null;
      try {
        if (q && this.timer) gl.beginQuery(this.timer.TIME_ELAPSED_EXT, q);
        this.pass(this.program(key, frag), out, extra ? [input, extra] : [input], set);
        if (q && this.timer) gl.endQuery(this.timer.TIME_ELAPSED_EXT);
        this.readBack(out, new Uint8Array(res.data.buffer));
        this.lastGpuMs = q && this.timer && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(this.timer.GPU_DISJOINT_EXT) ? Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6 : null;
        frameTrace.noteGpu(key, this.lastGpuMs);
      } finally { this.free(input, out); if (q) gl.deleteQuery(q); }
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

  /** The silhouette canvas as an RGBA8 texture, straight alpha, row 0 the canvas's top row. */
  private canvasTex(c: Surface): Tex {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
    if (gl.getError() !== gl.NO_ERROR) { gl.deleteTexture(t); throw new Error('canvas upload failed'); }
    return { t, w: c.width, h: c.height };
  }

  /** One layer-style effect over `box` of the silhouette canvas (engine/gpu-effects.ts): straight RGBA bytes, or null where the GPU cannot. */
  effectMap(sil: Surface, box: Rect, job: GpuEffectJob, frame?: { x: number; y: number }): ImageData | null {
    const { w, h } = box, fx = frame ? box.x - frame.x : 0, fy = frame ? box.y - frame.y : 0;
    if (w < 1 || h < 1 || sil.width < 1 || sil.height < 1 || (job.kind === 'cast' && !(job.blur >= 1))) return null;
    return this.guard(Math.max(w, sil.width), Math.max(h, sil.height), () => {
      const made: Tex[] = [], keep = (t: Tex): Tex => { made.push(t); return t; };
      try {
        const src = keep(this.canvasTex(sil)), out = keep(this.tex(w, h, 'u8')), res = new ImageData(w, h);
        const area = (gl: WebGL2RenderingContext, loc: Loc): void => { gl.uniform2i(loc('u_org'), box.x, box.y); gl.uniform2i(loc('u_box'), w, h); };
        const paint = (gl: WebGL2RenderingContext, loc: Loc): void => { area(gl, loc); gl.uniform3f(loc('u_color'), job.color.r, job.color.g, job.color.b); };
        const distance = (inverse: boolean, reach: number): Tex => {
          const r = Math.ceil(reach) + 1, cols = keep(this.tex(w, h, 'float')), d = keep(this.tex(w, h, 'float'));
          this.pass(this.program('fxEdtV', FS_FX_EDT_V), cols, [src], (gl, loc) => { area(gl, loc); gl.uniform1i(loc('u_r'), r); gl.uniform1i(loc('u_inv'), inverse ? 1 : 0); });
          this.pass(this.program('fxEdtH', FS_FX_EDT_H), d, [cols], (gl, loc) => gl.uniform1i(loc('u_r'), r));
          return d;
        };
        if (job.kind === 'cast') {
          const m = keep(this.tex(w, h, 'float')), half = keep(this.tex(w, h, 'float'));
          const reach = Math.abs(job.grow), shrink = job.grow < 0, mode = job.inner ? 2 : job.knockout ? 1 : 0;
          if (reach > 0) this.pass(this.program('fxGrow', FS_FX_GROW), m, [src, distance(shrink, reach)], (gl, loc) => { area(gl, loc); gl.uniform1f(loc('u_d'), reach); gl.uniform1i(loc('u_shrink'), shrink ? 1 : 0); gl.uniform1i(loc('u_inv'), job.inner ? 1 : 0); });
          else this.pass(this.program('fxAlpha', FS_FX_ALPHA), m, [src], (gl, loc) => { area(gl, loc); gl.uniform1i(loc('u_inv'), job.inner ? 1 : 0); });
          const blur = this.program('fxBlur', FS_FX_BLUR);
          const soft = job.blur > 8 && !job.inner, k = soft ? 2 : 1;
          const along = (dir: readonly [number, number], shift: number, final: boolean) => (gl: WebGL2RenderingContext, loc: Loc): void => {
            paint(gl, loc);
            gl.uniform2i(loc('u_dir'), dir[0], dir[1]); gl.uniform1f(loc('u_sigma'), job.blur / (2 * k)); gl.uniform1f(loc('u_shift'), shift / k);
            gl.uniform1i(loc('u_final'), final ? 1 : 0); gl.uniform1i(loc('u_mode'), mode); gl.uniform1i(loc('u_off'), (dir[0] ? fx : fy) / k);
          };
          if (!soft) {
            this.pass(blur, half, [src, m], along([1, 0], job.dx, false));
            this.pass(blur, out, [src, half], along([0, 1], job.dy, true));
          } else {
            const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), small = keep(this.tex(hw, hh, 'float')), mid = keep(this.tex(hw, hh, 'float')), done = keep(this.tex(hw, hh, 'float'));
            this.pass(this.program('fxDown', FS_FX_DOWN), small, [src, m]);
            this.pass(blur, mid, [src, small], along([1, 0], job.dx, false));
            this.pass(blur, done, [src, mid], along([0, 1], job.dy, false));
            this.pass(this.program('fxUp', FS_FX_UP), out, [src, done], (gl, loc) => { paint(gl, loc); gl.uniform1i(loc('u_mode'), mode); });
          }
        } else if (job.kind === 'ramp') {
          this.pass(this.program('fxRamp', FS_FX_RAMP), out, [src, distance(false, job.size)], (gl, loc) => { paint(gl, loc); gl.uniform1f(loc('u_size'), job.size); gl.uniform1f(loc('u_hold'), job.hold); });
        } else {
          const outer = job.outer > 0 ? distance(false, job.outer) : src, inner = job.inner > 0 ? distance(true, job.inner) : src;
          this.pass(this.program('fxRing', FS_FX_RING), out, [src, outer, inner], (gl, loc) => {
            paint(gl, loc);
            gl.uniform1f(loc('u_outer'), job.outer); gl.uniform1f(loc('u_inner'), job.inner); gl.uniform1i(loc('u_clear'), job.clear ? 1 : 0);
          });
        }
        this.readBack(out, new Uint8Array(res.data.buffer));
        return res;
      } finally { this.free(...made); }
    });
  }

  liquify(src: ImageData, field: { gw: number; gh: number; cell: number; d: Float32Array }, scale: number, outW: number, outH: number): ImageData | null {
    const { width: w, height: h } = src;
    if (!(scale > 0) || field.gw < 2 || field.gh < 2 || outW < 1 || outH < 1) return null;
    return this.guard(Math.max(w, outW, field.gw), Math.max(h, outH, field.gh), () => {
      const gl = this.gl, input = this.tex(w, h, 'u8', new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.byteLength)), out = this.tex(outW, outH, 'u8');
      const ft = gl.createTexture()!, fld: Tex = { t: ft, w: field.gw, h: field.gh };
      gl.bindTexture(gl.TEXTURE_2D, ft);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, field.gw, field.gh, 0, gl.RG, gl.FLOAT, field.d);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
      const res = new ImageData(outW, outH);
      try {
        this.pass(this.program('liquify', FS_LIQUIFY), out, [input, fld], (g, loc) => { g.uniform1f(loc('u_cell'), field.cell); g.uniform1f(loc('u_scale'), scale); g.uniform2i(loc('u_g'), field.gw, field.gh); });
        this.readBack(out, new Uint8Array(res.data.buffer));
      } finally { this.free(input, out, fld); }
      return res;
    });
  }

  /** A Smudge stroke on the GPU: the layer's premultiplied bytes live in a texture for the whole stroke, the paint in a
   *  float texture; each dab is one pass over the paint and one over the canvas inside a scissor, then the square is copied
   *  back. One session at a time: opening another closes the previous. The paint needs float targets (RGBA32F). */
  private closeSmudge: (() => void) | null = null;

  smudge(pixels: Uint8ClampedArray, w: number, h: number): GpuSmudge | null {
    if (this.floatType !== 'f32') return null;
    this.closeSmudge?.();
    return this.guard(w, h, () => {
      const gl = this.gl;
      const cv = this.tex(w, h, 'u8', new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)), cv2 = this.tex(w, h, 'u8');
      let pa: Tex | null = null, pb: Tex | null = null, side = 0, open = true;
      const freePaint = (): void => { if (pa) this.free(pa); if (pb) this.free(pb); pa = pb = null; };
      const close = (): void => {
        if (!open) return;
        open = false; freePaint(); this.free(cv, cv2);
        if (this.closeSmudge === close) this.closeSmudge = null;
      };
      this.closeSmudge = close;
      const fail = (e: unknown): false => { this.lastError = String(e instanceof Error ? e.message : e); return false; };
      return {
        setPaint: (paint, s) => {
          if (!open || !this.ok || s < 1 || s > this.maxSize) return false;
          try {
            freePaint(); side = s;
            const t = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, s, s, 0, gl.RGBA, gl.FLOAT, paint);
            for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
            pa = { t, w: s, h: s }; pb = this.tex(s, s, 'float');
            return true;
          } catch (e) { return fail(e); }
        },
        dabs: (at, radius, half, hard, lay, take) => {
          if (!open || !this.ok || !pa || !pb || side !== 2 * radius + 1) return false;
          try {
            const pp = this.program('smudgePaint', FS_SMUDGE_PAINT), pc = this.program('smudgeCanvas', FS_SMUDGE_CANVAS);
            for (const d of at) {
              const cx = Math.round(d.x), cy = Math.round(d.y), x0 = Math.max(0, cx - radius), y0 = Math.max(0, cy - radius), x1 = Math.min(w - 1, cx + radius), y1 = Math.min(h - 1, cy + radius);
              if (x1 < x0 || y1 < y0) continue;
              const set = (g: WebGL2RenderingContext, loc: Loc): void => {
                g.uniform2f(loc('u_at'), d.x, d.y); g.uniform1f(loc('u_half'), half); g.uniform1f(loc('u_hard'), hard);
                g.uniform1f(loc('u_lay'), lay); g.uniform1f(loc('u_take'), take); g.uniform1i(loc('u_r'), radius); g.uniform2i(loc('u_c'), cx, cy);
              };
              this.pass(pp, pb, [cv, pa], set);
              gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
              try { this.pass(pc, cv2, [cv, pa], set); } finally { gl.disable(gl.SCISSOR_TEST); }
              [pa, pb] = [pb, pa];
              gl.bindTexture(gl.TEXTURE_2D, cv.t);
              gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
            }
            return true;
          } catch (e) { return fail(e); }
        },
        read: (r, into) => {
          if (!open || !this.ok || r.w < 1 || r.h < 1) return false;
          try {
            const buf = new Uint8Array(r.w * r.h * 4);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cv.t, 0);
            gl.readPixels(r.x, r.y, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            for (let y = 0; y < r.h; y++) into.set(buf.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * w + r.x) * 4);
            return true;
          } catch (e) { return fail(e); }
        },
        close,
      };
    });
  }

  private floatTex(w: number, h: number, fmt: 'r' | 'rgba', data: Float32Array | null): Tex {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (fmt === 'r') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return { t, w, h };
  }

  /** Lens Blur's gather over the planes lensBlur prepared, drawn in bands of rows so one draw stays short. */
  lensGather(p: LensGatherInput): ImageData | null {
    const { w, h } = p, slots: number[] = [0], has: number[] = [0];
    for (let q = 1; q < p.levels.length; q++) { const own = p.levels[q] !== p.levels[0]; has.push(own ? 1 : 0); slots.push(own ? slots.length : 0); }
    const n = slots.reduce((m, v) => Math.max(m, v), 0) + 1;
    return this.guard(w, h * n, () => {
      const gl = this.gl;
      const levels = this.floatTex(w, h * n, 'rgba', null);
      gl.bindTexture(gl.TEXTURE_2D, levels.t);
      for (let q = 0; q < p.levels.length; q++) if (q === 0 || has[q]) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, slots[q] * h, w, h, gl.RGBA, gl.FLOAT, p.levels[q]);
      const rad = this.floatTex(w, h, 'r', p.rad);
      const taps = new Float32Array(256 * p.tiers.length * 4);
      p.tiers.forEach((count, ti) => { const t = p.tapsFor(count); for (let k = 0; k < count; k++) taps.set([t[k * 3], t[k * 3 + 1], t[k * 3 + 2], 0], (ti * 256 + k) * 4); });
      const tapTex = this.floatTex(256, p.tiers.length, 'rgba', taps);
      const input = this.tex(w, h, 'u8', new Uint8Array(p.src.buffer, p.src.byteOffset, p.src.byteLength)), out = this.tex(w, h, 'u8');
      const res = new ImageData(w, h), q = this.timer ? gl.createQuery() : null;
      try {
        const prog = this.program('lens', FS_LENS), rows = Math.max(8, Math.floor(1_000_000 / w));
        if (q && this.timer) gl.beginQuery(this.timer.TIME_ELAPSED_EXT, q);
        gl.enable(gl.SCISSOR_TEST);
        for (let y = 0; y < h; y += rows) {
          gl.scissor(0, y, w, Math.min(rows, h - y));
          this.pass(prog, out, [levels, rad, tapTex, input], (g, loc) => {
            g.uniform2i(loc('u_size'), w, h);
            g.uniform1iv(loc('u_slot'), slots); g.uniform1iv(loc('u_has'), has);
            g.uniform1iv(loc('u_sizes'), p.sizes as number[]); g.uniform1iv(loc('u_tiers'), p.tiers as number[]);
            g.uniform1i(loc('u_depth'), p.depth ? 1 : 0);
          });
          gl.finish();
        }
        gl.disable(gl.SCISSOR_TEST);
        if (q && this.timer) gl.endQuery(this.timer.TIME_ELAPSED_EXT);
        this.readBack(out, new Uint8Array(res.data.buffer));
        this.lastGpuMs = q && this.timer && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(this.timer.GPU_DISJOINT_EXT) ? Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6 : null;
        frameTrace.noteGpu('lens', this.lastGpuMs);
      } finally { gl.disable(gl.SCISSOR_TEST); this.free(levels, rad, tapTex, input, out); if (q) gl.deleteQuery(q); }
      return res;
    });
  }

  develop(src: ImageData, state: DevelopState, seed: number): ImageData | null {
    const t = state.tone, hasColor = colorActive(state.color), hasCurve = curvesActive(state.curves), para = parametricOf(state), hasPara = parametricActive(para);
    let table: Tex | null = null;
    if (hasCurve || hasPara) {
      // Row 0, one entry per level: the RGB curve, then the channel's own, as developPass applies them one after the other. Row 1: the parametric curve.
      const d = new Uint8Array(256 * 4 * 2);
      if (hasCurve) {
        const rgb = buildCurveLut(state.curves.rgb), lr = buildCurveLut(state.curves.r), lg = buildCurveLut(state.curves.g), lb = buildCurveLut(state.curves.b);
        for (let i = 0; i < 256; i++) d.set([lr[rgb[i]], lg[rgb[i]], lb[rgb[i]], 255], i * 4);
      }
      if (hasPara) {
        const pl = buildParametricLut(para);
        for (let i = 0; i < 256; i++) d.set([pl[i], pl[i], pl[i], 255], 1024 + i * 4);
      }
      table = this.guard(256, 2, () => this.tex(256, 2, 'u8', d));
      if (!table) return null;
    }
    try {
      return this.single('develop', FS_DEVELOP, src, (gl, loc) => {
        const f = (n: string, v: number): void => gl.uniform1f(loc(n), v);
        f('u_offset', t.offset); f('u_exp', t.exposure); f('u_cont', t.contrast); f('u_high', t.highlights); f('u_shad', t.shadows); f('u_white', t.whites); f('u_black', t.blacks);
        f('u_temp', t.temperature); f('u_tint', t.tint); f('u_vib', t.vibrance); f('u_sat', t.saturation); f('u_dehz', t.dehaze); f('u_vig', t.vignette); f('u_grain', t.grain);
        gl.uniform1ui(loc('u_seed'), seed >>> 0);
        gl.uniform1i(loc('u_hasColor'), hasColor ? 1 : 0); gl.uniform1i(loc('u_hasCurve'), hasCurve ? 1 : 0); gl.uniform1i(loc('u_hasPara'), hasPara ? 1 : 0); gl.uniform1i(loc('u_colorize'), state.color.colorize ? 1 : 0);
        const m = state.color.master;
        gl.uniform3f(loc('u_master'), m.h, m.s, m.l);
        const vs = vignetteShapeOf(state);
        gl.uniform3f(loc('u_vigp'), vs.midpoint, vs.feather, vs.roundness);
        gl.uniform3fv(loc('u_band'), HSL_BANDS.flatMap((k) => { const b = bandOf(state.color, k); return [b.h, b.s, b.l]; }));
        gl.uniform2fv(loc('u_bandc'), HSL_BANDS.flatMap((k) => [BAND_CENTER[k], BAND_WIDTH[k]]));
        const tp = toneProcessOf(state);
        gl.uniform2fv(loc('u_tp'), [tp.shadEdge, tp.shadGain, tp.highLo, tp.highGain, tp.whiteLo, tp.whiteGain, tp.blackEdge, tp.blackGain]);
        const pc = pointColorOf(state), hasPc = pointColorActive(pc), grade = gradingOf(state), hasGrade = gradingActive(grade), cal = calibrationOf(state), hasCal = calibrationActive(cal);
        gl.uniform1i(loc('u_hasPc'), hasPc ? 1 : 0); gl.uniform1i(loc('u_hasCal'), hasCal ? 1 : 0); gl.uniform1i(loc('u_hasGrade'), hasGrade ? 1 : 0);
        if (hasPc) {
          const n = parseInt(pc.color.slice(1), 16), [h0, s0, l0] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255), reach = Math.max(0.05, pc.range / 100);
          gl.uniform3f(loc('u_pc0'), h0, s0, l0); gl.uniform3f(loc('u_pcw'), 90 * reach, 0.6 * reach + 0.1, 0.6 * reach + 0.1); gl.uniform3f(loc('u_pcd'), pc.h, pc.s, pc.l);
        }
        if (hasCal) { gl.uniform3f(loc('u_calh'), cal.redHue, cal.greenHue, cal.blueHue); gl.uniform3f(loc('u_cals'), cal.redSat, cal.greenSat, cal.blueSat); gl.uniform1f(loc('u_calt'), cal.shadowTint); }
        if (hasGrade) {
          const tint = (w: { h: number; s: number }): [number, number, number] => {
            if (!w.s) return [0, 0, 0];
            const [r, g, b] = hslToRgb(w.h, 1, 0.5), k = (w.s / 100) * 0.3;
            return [(r / 255 - 0.5) * k, (g / 255 - 0.5) * k, (b / 255 - 0.5) * k];
          };
          gl.uniform3fv(loc('u_gts'), tint(grade.shadows)); gl.uniform3fv(loc('u_gtm'), tint(grade.midtones)); gl.uniform3fv(loc('u_gth'), tint(grade.highlights)); gl.uniform3fv(loc('u_gtg'), tint(grade.global));
          gl.uniform4f(loc('u_gl'), grade.shadows.l ?? 0, grade.midtones.l ?? 0, grade.highlights.l ?? 0, grade.global.l ?? 0);
          gl.uniform2f(loc('u_gpv'), 0.15 + (grade.blending / 100) * 0.35, 0.5 - (grade.balance / 100) * 0.25);
        }
      }, table ?? undefined);
    } finally { if (table) this.free(table); }
  }
}

/** The neighbourhood stage of the GPU displays (1.92.0): Shadows/Highlights, HDR Toning and Clarity read a blurred copy
 *  of the composite below them. The display renders that copy with BLUR_*: three box passes along x then y, in a
 *  half-float texture, over the document's rectangle only. A luminance blur (kind 1 and 2) keeps two blurs in the red
 *  and green channels (shadows and highlights radii) and clamps at the edge as adjust-params.ts blurredLum does; a colour
 *  blur (kind 3) holds premultiplied colour and alpha and counts nothing past the edge, as filters.ts boxBlur does. The
 *  per-pixel stage (HOOD_*) is the CPU formula of each kind. Its 16 constants travel in uniform slots the mode does not
 *  otherwise use (the layer's inverse matrix, size, ko, lod and the first column of vinv); slot 15 is the kind. */
export const HOOD_MODE = 106;

export const BLUR_WGSL = /* wgsl */ `
struct Blur { rect: vec4<i32>, r: vec2<i32>, dir: u32, first: u32, mode: u32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<uniform> bu: Blur;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}
fn at(p: vec2<i32>) -> vec4<f32> {
  let q = clamp(p, bu.rect.xy, bu.rect.zw - vec2<i32>(1));
  let t = textureLoad(src, q, 0);
  if (bu.first == 0u) { return t; }
  let c = round(t.rgb * 255.0) / 255.0;
  if (bu.mode == 0u) { let l = dot(c, vec3<f32>(0.299, 0.587, 0.114)); return vec4<f32>(l, l, 0.0, 1.0); }
  let a = round(t.a * 255.0) / 255.0;
  return vec4<f32>(c * a, a);
}
@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let p = vec2<i32>(floor(pos.xy));
  var d = vec2<i32>(1, 0);
  if (bu.dir == 1u) { d = vec2<i32>(0, 1); }
  if (bu.mode == 0u) {
    var sa = 0.0; var sb = 0.0;
    for (var k = -bu.r.x; k <= bu.r.x; k++) { sa += at(p + d * k).x; }
    for (var k = -bu.r.y; k <= bu.r.y; k++) { sb += at(p + d * k).y; }
    return vec4<f32>(sa / f32(2 * bu.r.x + 1), sb / f32(2 * bu.r.y + 1), 0.0, 1.0);
  }
  var s = vec4<f32>(0.0);
  for (var k = -bu.r.x; k <= bu.r.x; k++) {
    let q = p + d * k;
    if (q.x < bu.rect.x || q.y < bu.rect.y || q.x >= bu.rect.z || q.y >= bu.rect.w) { continue; }
    s += at(q);
  }
  return s / f32(2 * bu.r.x + 1);
}
`;

export const HOOD_WGSL = /* wgsl */ `
fn hLum(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.299, 0.587, 0.114)); }
fn hRelight(c: vec3<f32>, to: f32, s: f32) -> vec3<f32> {
  let was = max(1e-4, hLum(c));
  let r = c * (to / was);
  let l = hLum(r);
  return vec3<f32>(l) + (r - vec3<f32>(l)) * s;
}
fn hTone(x: f32, k: array<f32, 5>) -> f32 {
  var kn = k;
  let t = clamp(x, 0.0, 1.0) * 4.0;
  let i = min(3, i32(floor(t)));
  let f = t - f32(i);
  let p0 = kn[max(0, i - 1)]; let p1 = kn[i]; let p2 = kn[i + 1]; let p3 = kn[min(4, i + 2)];
  return clamp(p1 + 0.5 * f * (p2 - p0 + f * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + f * (3.0 * (p1 - p2) + p3 - p0))), 0.0, 1.0);
}
fn hoodColor(c: vec3<f32>, h: vec4<f32>, P: array<f32, 16>) -> vec3<f32> {
  let kind = i32(P[15]);
  let L = hLum(c);
  if (kind == 1) {
    let tS = P[1]; let tH = P[3];
    let u = clamp(1.0 - h.x / tS, 0.0, 1.0);
    let v = clamp((h.y - (1.0 - tH)) / tH, 0.0, 1.0);
    let ws = P[0] * u * u; let wh = P[2] * v * v;
    var L2 = L;
    if (L < tS) { L2 = L + ws * (tS - L) * 0.8; }
    if (L2 > 1.0 - tH) { L2 = L2 - wh * (L2 - (1.0 - tH)) * 0.8; }
    L2 = L2 + P[5] * 4.0 * L2 * (1.0 - L2) * (L2 - 0.5);
    return hRelight(c, clamp(L2, 0.0, 1.0), 1.0 + P[4] * (ws + wh));
  }
  if (kind == 2) {
    let Lc = max(1e-4, L); let B = max(1e-4, h.x);
    let lb = log(B); let ld = log(Lc) - lb; let mean = log(0.45);
    var L2 = clamp(pow(exp(mean + (lb - mean) / (1.0 + P[6]) + ld * P[7]) * P[8], 1.0 / P[9]), 0.0, 1.0);
    if (P[0] != 0.0 || P[1] != 0.0) { let m = 1.0 - L2; L2 = clamp(L2 + 0.35 * P[0] * L2 * m * m + 0.35 * P[1] * L2 * L2 * m, 0.0, 1.0); }
    if (P[5] > 0.5) { L2 = hTone(L2, array<f32, 5>(0.0, 0.25 + P[2], 0.5 + P[3], 0.75 + P[4], 1.0)); }
    let s0 = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    return hRelight(c, L2, P[11] * (1.0 + P[10] * (1.0 - s0)));
  }
  var bl = vec3<f32>(0.0);
  if (h.a >= 0.5 / 255.0) { bl = round(h.rgb / h.a * 255.0) / 255.0; }
  let f = P[0];
  let e = abs(L - 0.5) * 2.0;
  let term = abs(f) * (1.0 - e * e) * 0.8;
  var sg = 1.0;
  if (f > 0.0) { sg = -1.0; }
  return c + (bl - c) * term * sg;
}
`;

/** The composite shader's branch for mode 106, placed before the generic source-over path. */
export const HOOD_WGSL_MAIN = /* wgsl */ `
  if (layer.mode == 106u) {
    if (bd.a <= 0.0) { return bd; }
    let P = array<f32, 16>(layer.inv[0].x, layer.inv[0].y, layer.inv[0].z, layer.inv[1].x, layer.inv[1].y, layer.inv[1].z, layer.inv[2].x, layer.inv[2].y, layer.inv[2].z,
      layer.size.x, layer.size.y, layer.ko, layer.lod, layer.vinv[0].x, layer.vinv[0].y, layer.vinv[0].z);
    let c0 = round(bd.rgb * 255.0) / 255.0;
    let th = round(clamp(hoodColor(c0, textureLoad(koTex, px, 0), P), vec3<f32>(0.0), vec3<f32>(1.0)) * 255.0) / 255.0;
    return vec4<f32>(bd.rgb + (adjustBlend(bd.rgb, th) - bd.rgb) * layer.opacity * cov * limitWeight(bd.rgb), bd.a);
  }
`;

export const BLUR_GLSL = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D src; uniform ivec4 rect; uniform ivec2 r; uniform int dir; uniform int first; uniform int mode;
out vec4 outColor;
vec4 at(ivec2 p) {
  ivec2 q = clamp(p, rect.xy, rect.zw - ivec2(1));
  vec4 t = texelFetch(src, q, 0);
  if (first == 0) return t;
  vec3 c = floor(t.rgb * 255.0 + 0.5) / 255.0;
  if (mode == 0) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return vec4(l, l, 0.0, 1.0); }
  float a = floor(t.a * 255.0 + 0.5) / 255.0;
  return vec4(c * a, a);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 d = dir == 1 ? ivec2(0, 1) : ivec2(1, 0);
  if (mode == 0) {
    float sa = 0.0, sb = 0.0;
    for (int k = -r.x; k <= r.x; k++) sa += at(p + d * k).x;
    for (int k = -r.y; k <= r.y; k++) sb += at(p + d * k).y;
    outColor = vec4(sa / float(2 * r.x + 1), sb / float(2 * r.y + 1), 0.0, 1.0);
    return;
  }
  vec4 s = vec4(0.0);
  for (int k = -r.x; k <= r.x; k++) {
    ivec2 q = p + d * k;
    if (q.x < rect.x || q.y < rect.y || q.x >= rect.z || q.y >= rect.w) continue;
    s += at(q);
  }
  outColor = s / float(2 * r.x + 1);
}`;

export const HOOD_GLSL = `
uniform float hp[16];
float hLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hRelight(vec3 c, float to, float s) {
  float from = max(1e-4, hLum(c));
  vec3 r = c * (to / from);
  float l = hLum(r);
  return vec3(l) + (r - vec3(l)) * s;
}
float hTone(float x, float k[5]) {
  float t = clamp(x, 0.0, 1.0) * 4.0;
  int i = min(3, int(floor(t)));
  float f = t - float(i);
  float p0 = k[max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[min(4, i + 2)];
  return clamp(p1 + 0.5 * f * (p2 - p0 + f * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + f * (3.0 * (p1 - p2) + p3 - p0))), 0.0, 1.0);
}
vec3 hoodColor(vec3 c, vec4 h) {
  int kind = int(hp[15]);
  float L = hLum(c);
  if (kind == 1) {
    float tS = hp[1], tH = hp[3];
    float u = clamp(1.0 - h.x / tS, 0.0, 1.0), v = clamp((h.y - (1.0 - tH)) / tH, 0.0, 1.0);
    float ws = hp[0] * u * u, wh = hp[2] * v * v, L2 = L;
    if (L < tS) L2 = L + ws * (tS - L) * 0.8;
    if (L2 > 1.0 - tH) L2 = L2 - wh * (L2 - (1.0 - tH)) * 0.8;
    L2 = L2 + hp[5] * 4.0 * L2 * (1.0 - L2) * (L2 - 0.5);
    return hRelight(c, clamp(L2, 0.0, 1.0), 1.0 + hp[4] * (ws + wh));
  }
  if (kind == 2) {
    float Lc = max(1e-4, L), B = max(1e-4, h.x);
    float lb = log(B), ld = log(Lc) - lb, mean = log(0.45);
    float L2 = clamp(pow(exp(mean + (lb - mean) / (1.0 + hp[6]) + ld * hp[7]) * hp[8], 1.0 / hp[9]), 0.0, 1.0);
    if (hp[0] != 0.0 || hp[1] != 0.0) { float m = 1.0 - L2; L2 = clamp(L2 + 0.35 * hp[0] * L2 * m * m + 0.35 * hp[1] * L2 * L2 * m, 0.0, 1.0); }
    if (hp[5] > 0.5) { float kn[5] = float[5](0.0, 0.25 + hp[2], 0.5 + hp[3], 0.75 + hp[4], 1.0); L2 = hTone(L2, kn); }
    float s0 = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    return hRelight(c, L2, hp[11] * (1.0 + hp[10] * (1.0 - s0)));
  }
  vec3 bl = vec3(0.0);
  if (h.a >= 0.5 / 255.0) bl = floor(h.rgb / h.a * 255.0 + 0.5) / 255.0;
  float f = hp[0], e = abs(L - 0.5) * 2.0, term = abs(f) * (1.0 - e * e) * 0.8, sg = f > 0.0 ? -1.0 : 1.0;
  return c + (bl - c) * term * sg;
}
`;

export const HOOD_GLSL_MAIN = `
  if (mode == 106) {
    if (bd.a <= 0.0) { outColor = bd; return; }
    vec3 c0 = floor(bd.rgb * 255.0 + 0.5) / 255.0;
    vec3 th = floor(clamp(hoodColor(c0, texelFetch(koTex, fb, 0)), 0.0, 1.0) * 255.0 + 0.5) / 255.0;
    outColor = vec4(bd.rgb + (adjustBlend(bd.rgb, th) - bd.rgb) * opacity * cov * limitWeight(bd.rgb), bd.a); return;
  }
`;

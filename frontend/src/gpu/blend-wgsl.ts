import type { BlendMode } from '../engine';

/** The 27 blend modes as a WGSL shader, matching sonny's CPU renderer exactly (Phase 18.2): the modes the canvas
 *  composites natively follow the W3C Compositing and Blending formulas, as browsers implement them; Linear Dodge is the
 *  canvas's additive 'lighter' operation, as the CPU renderer uses it; the ten per-pixel modes follow engine/blend.ts,
 *  Dissolve on the same stable per-pixel pattern. Colours are unpremultiplied, 0 to 1. The result is the source over the
 *  backdrop, where the part of the source that covers backdrop shows B(backdrop, source). */
export const BLEND_IDS: readonly BlendMode[] = [
  'normal', 'dissolve', 'darken', 'multiply', 'color-burn', 'linear-burn', 'darker-color', 'lighten', 'screen', 'color-dodge',
  'linear-dodge', 'lighter-color', 'overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix',
  'difference', 'exclusion', 'subtract', 'divide', 'hue', 'saturation', 'color', 'luminosity',
];
export const blendIndex = (m: BlendMode): number => Math.max(0, BLEND_IDS.indexOf(m));

export const COMPOSITE_WGSL = /* wgsl */ `
struct Layer { inv: mat3x3<f32>, size: vec2<f32>, opacity: f32, mode: u32, minv: mat3x3<f32>, msize: vec2<f32>, hasMask: u32, hasClip: u32 };
@group(0) @binding(0) var backdrop: texture_2d<f32>;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var<uniform> layer: Layer;
@group(0) @binding(4) var maskTex: texture_2d<f32>;
@group(0) @binding(5) var clipTex: texture_2d<f32>;

/** A layer mask's coverage at p, as the CPU renderer applies masks: outside the mask's rectangle 1, inside its alpha. */
fn coverage(p: vec2<f32>) -> f32 {
  if (layer.hasMask == 0u) { return 1.0; }
  let qm = layer.minv * vec3<f32>(p, 1.0);
  if (qm.x < 0.0 || qm.y < 0.0 || qm.x >= layer.msize.x || qm.y >= layer.msize.y) { return 1.0; }
  return textureSampleLevel(maskTex, smp, qm.xy / layer.msize, 0.0).a;
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}

fn lum(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.3, 0.59, 0.11)); }
fn clipColor(c: vec3<f32>) -> vec3<f32> {
  let l = lum(c); let n = min(min(c.r, c.g), c.b); let x = max(max(c.r, c.g), c.b);
  var o = c;
  if (n < 0.0) { o = l + (o - l) * l / (l - n); }
  if (x > 1.0) { o = l + (o - l) * (1.0 - l) / (x - l); }
  return o;
}
fn setLum(c: vec3<f32>, l: f32) -> vec3<f32> { return clipColor(c + (l - lum(c))); }
fn sat(c: vec3<f32>) -> f32 { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
fn setSat(c: vec3<f32>, s: f32) -> vec3<f32> {
  let n = min(min(c.r, c.g), c.b); let x = max(max(c.r, c.g), c.b);
  if (x > n) { return (c - n) * s / (x - n); }
  return vec3<f32>(0.0);
}
fn dodge(b: f32, s: f32) -> f32 { if (b <= 0.0) { return 0.0; } if (s >= 1.0) { return 1.0; } return min(1.0, b / (1.0 - s)); }
fn burn(b: f32, s: f32) -> f32 { if (b >= 1.0) { return 1.0; } if (s <= 0.0) { return 0.0; } return 1.0 - min(1.0, (1.0 - b) / s); }
fn hardLight(b: f32, s: f32) -> f32 { if (s <= 0.5) { return b * 2.0 * s; } let t = 2.0 * s - 1.0; return b + t - b * t; }
fn softLight(b: f32, s: f32) -> f32 {
  if (s <= 0.5) { return b - (1.0 - 2.0 * s) * b * (1.0 - b); }
  var d = sqrt(b);
  if (b <= 0.25) { d = ((16.0 * b - 12.0) * b + 4.0) * b; }
  return b + (2.0 * s - 1.0) * (d - b);
}
fn sep(m: u32, b: f32, s: f32) -> f32 {
  switch m {
    case 2u: { return min(b, s); }
    case 3u: { return b * s; }
    case 4u: { return burn(b, s); }
    case 5u: { return clamp(b + s - 1.0, 0.0, 1.0); }
    case 7u: { return max(b, s); }
    case 8u: { return b + s - b * s; }
    case 9u: { return dodge(b, s); }
    case 12u: { return hardLight(s, b); }
    case 13u: { return softLight(b, s); }
    case 14u: { return hardLight(b, s); }
    case 15u: { if (s <= 0.5) { return burn(b, 2.0 * s); } return dodge(b, 2.0 * (s - 0.5)); }
    case 16u: { return clamp(b + 2.0 * s - 1.0, 0.0, 1.0); }
    case 17u: { if (s <= 0.5) { return min(b, 2.0 * s); } return max(b, 2.0 * s - 1.0); }
    case 18u: { if (b + s >= 1.0) { return 1.0; } return 0.0; }
    case 19u: { return abs(b - s); }
    case 20u: { return b + s - 2.0 * b * s; }
    case 21u: { return clamp(b - s, 0.0, 1.0); }
    case 22u: { if (s <= 0.0) { if (b <= 0.0) { return 0.0; } return 1.0; } return min(1.0, b / s); }
    default: { return s; }
  }
}
fn blend(m: u32, b: vec3<f32>, s: vec3<f32>) -> vec3<f32> {
  switch m {
    case 6u: { if (lum(s) < lum(b)) { return s; } return b; }
    case 11u: { if (lum(s) < lum(b)) { return b; } return s; }
    case 23u: { return setLum(setSat(s, sat(b)), lum(b)); }
    case 24u: { return setLum(setSat(b, sat(s)), lum(b)); }
    case 25u: { return setLum(s, lum(b)); }
    case 26u: { return setLum(b, lum(s)); }
    default: { return vec3<f32>(sep(m, b.r, s.r), sep(m, b.g, s.g), sep(m, b.b, s.b)); }
  }
}
/** engine/blend.ts dissolveNoise, bit for bit: a stable value in [0, 1) for a document pixel. */
fn dissolveNoise(x: i32, y: i32) -> f32 {
  var h = u32(x) * 374761393u + u32(y) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h ^ (h >> 16u)) / 4294967296.0;
}

@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let px = vec2<i32>(floor(pos.xy));
  let bd = textureLoad(backdrop, px, 0);
  var cov = coverage(pos.xy);
  // A clipped layer: its clipping base's coverage at this pixel (rendered by mode 102 before the layers).
  if (layer.hasClip == 1u) { cov = cov * textureLoad(clipTex, px, 0).a; }
  // A clipping base's coverage (mode 102), as the CPU renderer's clipCoverage draws it: the base's alpha at its opacity
  // through its own mask, nothing outside it.
  if (layer.mode == 102u) {
    let qb = layer.inv * vec3<f32>(pos.xy, 1.0);
    if (qb.x < 0.0 || qb.y < 0.0 || qb.x >= layer.size.x || qb.y >= layer.size.y) { return vec4<f32>(0.0); }
    return vec4<f32>(0.0, 0.0, 0.0, textureSampleLevel(source, smp, qb.xy / layer.size, 0.0).a * layer.opacity * cov);
  }
  // An adjustment's lookup table (Phase 18.5), as the CPU renderer applies it: each channel looked up by its 8-bit value,
  // then mixed in by opacity (src += (adjusted - src) * opacity), alpha kept, transparent pixels left alone.
  if (layer.mode == 100u) {
    if (bd.a <= 0.0) { return bd; }
    let i = vec3<i32>(round(bd.rgb * 255.0));
    let t = vec3<f32>(textureLoad(source, vec2<i32>(i.r, 0), 0).r, textureLoad(source, vec2<i32>(i.g, 0), 0).g, textureLoad(source, vec2<i32>(i.b, 0), 0).b);
    return vec4<f32>(bd.rgb + (t - bd.rgb) * layer.opacity * cov, bd.a);
  }
  // A 3D table (Phase 18.5), as engine/lut.ts lut3Sample computes it: the eight nodes (every 5 levels, 52 a side, packed
  // x = r + g * 52, y = b) around the colour, weighted per axis, rounded to 8 bits, then mixed in by opacity.
  if (layer.mode == 101u) {
    if (bd.a <= 0.0) { return bd; }
    let v = round(bd.rgb * 255.0) / 5.0;
    let b0 = min(vec3<i32>(floor(v)), vec3<i32>(50));
    let f = v - vec3<f32>(b0);
    var acc = vec3<f32>(0.0);
    for (var k = 0; k < 8; k++) {
      let o = vec3<i32>(k & 1, (k >> 1) & 1, (k >> 2) & 1);
      let w = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1) * select(1.0 - f.z, f.z, o.z == 1);
      let c = b0 + o;
      acc += w * textureLoad(source, vec2<i32>(c.x + c.y * 52, c.z), 0).rgb;
    }
    let t3 = round(acc * 255.0) / 255.0;
    return vec4<f32>(bd.rgb + (t3 - bd.rgb) * layer.opacity * cov, bd.a);
  }
  let q = layer.inv * vec3<f32>(pos.xy, 1.0);
  if (q.x < 0.0 || q.y < 0.0 || q.x >= layer.size.x || q.y >= layer.size.y) { return bd; }
  // The layer is uploaded premultiplied, as the canvas stores it, and un-premultiplied here in float: unpremultiplying
  // in 8 bits first rounds near-grey colours, which Hue then amplifies (measured: 7 levels against the CPU renderer).
  let s0 = textureSampleLevel(source, smp, q.xy / layer.size, 0.0);
  var sc = s0;
  if (s0.a > 0.0) { sc = vec4<f32>(s0.rgb / s0.a, s0.a); }
  // The per-pixel modes (engine/blend.ts) read the layer through getImageData, unpremultiplied to 8 bits, and their
  // thresholds (Hard Mix, Darker and Lighter Color, Vivid Light's halves) flip on that exact input; the canvas-native
  // modes composite the premultiplied values, so they keep the float above. Each path gets its own precision.
  let m = layer.mode;
  if (m == 1u || m == 5u || m == 6u || m == 11u || (m >= 15u && m <= 18u) || m == 21u || m == 22u) {
    sc = vec4<f32>(round(sc.rgb * 255.0) / 255.0, sc.a);
  }
  let sa = sc.a * layer.opacity * cov;
  if (sa <= 0.0) { return bd; }
  let ab = bd.a;
  if (layer.mode == 1u) {
    if (dissolveNoise(px.x, px.y) >= sa) { return bd; }
    return vec4<f32>(sc.rgb, 1.0);
  }
  if (layer.mode == 10u) {
    let lo = min(1.0, sa + ab);
    let lc = min(vec3<f32>(1.0), sc.rgb * sa + bd.rgb * ab);
    return vec4<f32>(lc / max(lo, 1e-6), lo);
  }
  let ao = sa + ab * (1.0 - sa);
  if (ao <= 0.0) { return vec4<f32>(0.0); }
  var r = sc.rgb;
  if (layer.mode != 0u) { r = blend(layer.mode, bd.rgb, sc.rgb); }
  let co = (sa * (1.0 - ab) * sc.rgb + sa * ab * r + (1.0 - sa) * ab * bd.rgb) / ao;
  return vec4<f32>(co, ao);
}
`;

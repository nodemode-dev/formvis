//! Layers blended on the GPU tile by tile, in formvis's 27 blend modes (the same WGSL functions as the web renderer, in
//! blend.wgsl). Each output tile is built bottom to top between two textures, so the whole image never has to fit one
//! texture; a layer with no tile there is transparent there and is skipped. The fragment shader follows the web
//! renderer's layer blend (frontend/src/gpu/blend-wgsl.ts): the source unpremultiplied in float, the per-pixel modes'
//! 8-bit rounding, Dissolve on the document pixel, Linear Dodge additive, and the source over the backdrop. The result is
//! straight RGBA8. Transforms, masks and clipping follow in the next parts.

use crate::{read_tile, Gpu, TiledLayer, FORMAT, TILE};
use std::cell::RefCell;

const BLUR: &str = r#"
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
"#;

const HOOD_FN: &str = r#"
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
"#;

const HEAD: &str = r#"
struct Place { inv0: vec4<f32>, inv1: vec4<f32>, origin: vec2<f32>, stage: vec2<f32>, size: vec2<f32>, placed: u32, pad: u32 };
struct Comp { inv0: vec4<f32>, inv1: vec4<f32>, tile_origin: vec2<f32>, opacity: f32, mode: u32, has_mask: u32, has_clip: u32, base_opacity: f32, base_has_mask: u32, stage_origin: vec2<f32>, stage_size: vec2<f32>, layer_size: vec2<f32>, transformed: u32, adj_mode: u32, mask_at: Place, base_mask_at: Place, level: f32, pad1: u32, pad2: u32, pad3: u32, bi_t: vec4<f32>, bi_u: vec4<f32>, bi_ch: u32, ch_off: u32, ko: f32, ko_on: u32, ga: vec4<f32>, gb: vec4<f32>, gs: vec4<u32>, hp: array<vec4<f32>, 4> };
@group(0) @binding(7) var ko_tile: texture_2d<f32>;
@group(0) @binding(0) var backdrop: texture_2d<f32>;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var<uniform> comp: Comp;
@group(0) @binding(3) var mask_tile: texture_2d<f32>;
@group(0) @binding(4) var base_tile: texture_2d<f32>;
@group(0) @binding(5) var base_mask_tile: texture_2d<f32>;
@group(0) @binding(6) var smp: sampler;

/// A mask's coverage at a pixel: its alpha (a missing mask tile is bound as white, so it reveals, as an untouched mask).
fn mask_cover(has: u32, t: texture_2d<f32>, px: vec2<i32>, at: Place, pos: vec2<f32>) -> f32 {
  if (has == 0u) { return 1.0; }
  if (at.placed == 0u) { return textureLoad(t, px, 0).a; }
  // A mask placed apart from the document: outside its rectangle it reveals, inside it is its bilinear alpha.
  let p = vec3<f32>(comp.tile_origin + pos, 1.0);
  let q = vec2<f32>(dot(at.inv0.xyz, p), dot(at.inv1.xyz, p));
  if (q.x < 0.0 || q.y < 0.0 || q.x >= at.size.x || q.y >= at.size.y) { return 1.0; }
  return textureSampleLevel(t, smp, (q - at.origin) / at.stage, 0.0).a;
}

fn bi_factor(v: f32, r: vec4<f32>) -> f32 {
  var lo = 1.0;
  if (v < r.x) { lo = 0.0; } else if (v < r.y) { lo = (v - r.x) / max(1.0, r.y - r.x); }
  var hi = 1.0;
  if (v > r.w) { hi = 0.0; } else if (v > r.z) { hi = (r.w - v) / max(1.0, r.w - r.z); }
  return lo * hi;
}

fn bi_value(c: vec3<f32>, ch: u32) -> f32 {
  let p = round(c * 255.0);
  if (ch == 2u) { return p.r; }
  if (ch == 3u) { return p.g; }
  if (ch == 4u) { return p.b; }
  return 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
}

fn lattice(x: i32, y: i32, seed: u32) -> f32 {
  var z = (u32(x) * 0x27d4eb2du) ^ (u32(y) * 0x165667b1u) ^ seed;
  var sum = 0.0;
  for (var r = 0; r < 2; r++) {
    z += 0x9e3779b9u;
    z = (z ^ (z >> 16u)) * 0x85ebca6bu;
    z = (z ^ (z >> 13u)) * 0xc2b2ae35u;
    z ^= z >> 16u;
    sum += f32(z) / 4294967295.0;
  }
  return sum - 1.0;
}

fn grain_at(c: vec2<i32>, t: vec2<f32>, f: vec2<i32>, seed: u32, fine: u32) -> f32 {
  let a = lattice(c.x, c.y, seed);
  let b = lattice(c.x + 1, c.y, seed);
  let cc = lattice(c.x, c.y + 1, seed);
  let d = lattice(c.x + 1, c.y + 1, seed);
  let s = ((a + (b - a) * t.x) * (1.0 - t.y) + (cc + (d - cc) * t.x) * t.y) * 1.6;
  return s + (lattice(f.x, f.y, fine) - s) * comp.ga.y;
}

/// Channels the layer's Advanced Blending turned off keep the backdrop's value.
fn keep(o: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
  var c = o.rgb;
  if ((comp.ch_off & 1u) != 0u) { c.r = b.r; }
  if ((comp.ch_off & 2u) != 0u) { c.g = b.g; }
  if ((comp.ch_off & 4u) != 0u) { c.b = b.b; }
  return vec4<f32>(c, o.a);
}

fn adjust_blend(b: vec3<f32>, t: vec3<f32>) -> vec3<f32> {
  if (comp.adj_mode == 0u) { return t; }
  return blend(comp.adj_mode, b, t);
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}
"#;

const FS: &str = r#"
@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let px = vec2<i32>(floor(pos.xy));
  var bd = textureLoad(backdrop, px, 0);
  // Coverage: the layer's mask, and for a clipped layer its base's alpha at the base's opacity through the base's mask.
  var cov = mask_cover(comp.has_mask, mask_tile, px, comp.mask_at, pos.xy);
  if (comp.has_clip == 1u) {
    cov = cov * textureLoad(base_tile, px, 0).a * comp.base_opacity * mask_cover(comp.base_has_mask, base_mask_tile, px, comp.base_mask_at, pos.xy);
  }
  // A coverage pass (mode 103): the coverage so far, bound as the backdrop, times this pass's mask and clip; no colour.
  if (comp.mode == 103u) { return vec4<f32>(0.0, 0.0, 0.0, cov * bd.a); }
  // A Threshold adjustment (mode 105), as the web renderer's integer rule: 299 r + 587 g + 114 b >= 1000 level on the
  // 8-bit backdrop, white or black, mixed in by opacity and coverage; alpha kept.
  if (comp.mode == 105u) {
    if (bd.a <= 0.0) { return bd; }
    let v = round(bd.rgb * 255.0);
    let on = 299.0 * v.r + 587.0 * v.g + 114.0 * v.b >= 1000.0 * comp.level;
    let tt = vec3<f32>(select(0.0, 1.0, on));
    return vec4<f32>(bd.rgb + (adjust_blend(bd.rgb, tt) - bd.rgb) * comp.opacity * cov, bd.a);
  }
  // A neighbourhood adjustment (mode 106: Shadows/Highlights, HDR Toning, Clarity): the stage of frontend/src/gpu/hood.ts on
  // the 8-bit backdrop and the blurred copy of the composite beneath (bound at the document's size as ko_tile).
  if (comp.mode == 106u) {
    if (bd.a <= 0.0) { return bd; }
    let P = array<f32, 16>(comp.hp[0].x, comp.hp[0].y, comp.hp[0].z, comp.hp[0].w, comp.hp[1].x, comp.hp[1].y, comp.hp[1].z, comp.hp[1].w,
      comp.hp[2].x, comp.hp[2].y, comp.hp[2].z, comp.hp[2].w, comp.hp[3].x, comp.hp[3].y, comp.hp[3].z, comp.hp[3].w);
    let c0 = round(bd.rgb * 255.0) / 255.0;
    let hv = textureLoad(ko_tile, vec2<i32>(comp.tile_origin) + px, 0);
    let th = round(clamp(hoodColor(c0, hv, P), vec3<f32>(0.0), vec3<f32>(1.0)) * 255.0) / 255.0;
    return vec4<f32>(bd.rgb + (adjust_blend(bd.rgb, th) - bd.rgb) * comp.opacity * cov, bd.a);
  }
  // A Grain adjustment (mode 104), as engine/adjust.ts grainKernel computes it at one document pixel per pixel: value noise
  // on a lattice of `cell` document units mixed toward per-pixel noise by roughness, weighted to the midtones, per channel
  // when colour is above 0, plus speckle; mixed in by opacity and coverage; alpha kept.
  if (comp.mode == 104u) {
    if (bd.a <= 0.0) { return bd; }
    let uq = comp.tile_origin + pos.xy;
    let uv = uq / comp.gb.x;
    let fl = floor(uv);
    var t = uv - fl;
    t = t * t * (3.0 - 2.0 * t);
    let c = vec2<i32>(fl);
    let f = vec2<i32>(floor(uq));
    let px = round(bd.rgb * 255.0);
    let noise = grain_at(c, t, f, comp.gs.x, comp.gs.y);
    let luma = min(1.0, (0.2126 * px.r + 0.7152 * px.g + 0.0722 * px.b) / 255.0);
    let weight = comp.ga.x * (0.4 + 2.4 * luma * (1.0 - luma));
    var speck = 0.0;
    if (comp.ga.w > 0.0) {
      let h = lattice(f.x, f.y, comp.gs.z);
      if (abs(h) > 1.0 - comp.ga.w) { speck = sign(h) * 0.55 * 255.0 * min(1.0, comp.gb.y / 50.0); }
    }
    var g3 = px;
    for (var ch = 0; ch < 3; ch++) {
      let k = u32(ch + 1);
      var own = noise;
      if (comp.ga.z > 0.0) { own = grain_at(c, t, f, comp.gs.x + k * 0x9e3779b1u, comp.gs.y + k * 0x85ebca6bu); }
      g3[ch] = floor(clamp(px[ch] + (noise + (own - noise) * comp.ga.z) * weight + speck, 0.0, 255.0) + 0.5);
    }
    return vec4<f32>(bd.rgb + (g3 / 255.0 - bd.rgb) * comp.opacity * cov, bd.a);
  }
  // An adjustment layer as a lookup table (mode 100), as the web renderer applies it: each backdrop channel looked up by
  // its 8-bit value in the 256 by 1 table bound as the source, mixed in by opacity and coverage; alpha kept.
  if (comp.mode == 100u) {
    if (bd.a <= 0.0) { return bd; }
    let i = vec3<i32>(round(bd.rgb * 255.0));
    let t = vec3<f32>(textureLoad(source, vec2<i32>(i.r, 0), 0).r, textureLoad(source, vec2<i32>(i.g, 0), 0).g, textureLoad(source, vec2<i32>(i.b, 0), 0).b);
    return vec4<f32>(bd.rgb + (adjust_blend(bd.rgb, t) - bd.rgb) * comp.opacity * cov, bd.a);
  }
  // A 3D table (mode 101), as engine/lut.ts lut3Sample computes it: the eight nodes around the 8-bit colour, weighted per
  // axis, rounded to 8 bits, then mixed in by opacity and coverage; alpha kept.
  if (comp.mode == 101u) {
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
    return vec4<f32>(bd.rgb + (adjust_blend(bd.rgb, t3) - bd.rgb) * comp.opacity * cov, bd.a);
  }
  var s0 = vec4<f32>(0.0);
  if (comp.transformed == 1u) {
    // The document pixel's centre, back into the layer's own pixels; outside the layer it is transparent.
    let p = vec3<f32>(comp.tile_origin + pos.xy, 1.0);
    let q = vec2<f32>(dot(comp.inv0.xyz, p), dot(comp.inv1.xyz, p));
    if (q.x < 0.0 || q.y < 0.0 || q.x >= comp.layer_size.x || q.y >= comp.layer_size.y) { return bd; }
    // The staging texture holds the layer's pixels around this tile's footprint, contiguous across the layer's tile
    // edges, so bilinear sampling (on the premultiplied values) has no seams.
    s0 = textureSampleLevel(source, smp, (q - comp.stage_origin) / comp.stage_size, 0.0);
  } else {
    s0 = textureLoad(source, px, 0);
  }
  var sc = s0;
  if (s0.a > 0.0 && comp.pad1 == 0u) { sc = vec4<f32>(s0.rgb / s0.a, s0.a); }  let m = comp.mode;
  if (m == 1u || m == 5u || m == 6u || m == 11u || (m >= 15u && m <= 18u) || m == 21u || m == 22u || m >= 27u) {
    sc = vec4<f32>(floor(sc.rgb * 255.0 + 0.5005) / 255.0, sc.a);
  }
  var bif = 1.0;
  if (comp.bi_ch != 0u) {
    bif = bi_factor(bi_value(sc.rgb, comp.bi_ch), comp.bi_t);
    if (bd.a <= 0.0) { bif = bif * bi_factor(255.0, comp.bi_u); } else { bif = bif * bi_factor(bi_value(bd.rgb, comp.bi_ch), comp.bi_u); }
    // The CPU scales the layer's 8-bit alpha by the factor and rounds it.
    if (bif < 1.0) { sc.a = floor(floor(sc.a * 255.0 + 0.5) * bif + 0.5) / 255.0; bif = 1.0; }
  }
  // Knockout, as the renderer's knockout(): through the layer's coverage at its opacity (ko) what lies below is cleared,
  // and the backdrop composite (ko_tile) shows through that coverage.
  if (comp.ko_on == 1u) {
    let a0 = sc.a * cov * bif;
    let a1 = bd.a * (1.0 - a0 * comp.ko);
    let kb = textureLoad(ko_tile, px, 0);
    let ba = kb.a * a0;
    let ao1 = a1 + ba * (1.0 - a1);
    var rgb1 = vec3<f32>(0.0);
    if (ao1 > 0.0) { rgb1 = (bd.rgb * a1 + kb.rgb * ba * (1.0 - a1)) / ao1; }
    bd = vec4<f32>(rgb1, ao1);
  }
  let sa = sc.a * comp.opacity * cov * bif;
  if (sa <= 0.0) { return bd; }
  let ab = bd.a;
  if (m == 1u) {
    let doc = vec2<i32>(comp.tile_origin) + px;
    if (dissolveNoise(doc.x, doc.y) >= sa) { return bd; }
    return keep(vec4<f32>(sc.rgb, 1.0), bd);
  }
  if (m == 10u) {
    let lo = min(1.0, sa + ab);
    let lc = min(vec3<f32>(1.0), sc.rgb * sa + bd.rgb * ab);
    return keep(vec4<f32>(lc / max(lo, 1e-6), lo), bd);
  }
  let ao = sa + ab * (1.0 - sa);
  if (ao <= 0.0) { return vec4<f32>(0.0); }
  var r = sc.rgb;
  if (m != 0u) { r = blend(m, bd.rgb, sc.rgb); }
  let co = (sa * (1.0 - ab) * sc.rgb + sa * ab * r + (1.0 - sa) * ab * bd.rgb) / ao;
  return keep(floor(vec4<f32>(co, ao) * 255.0 + 0.5005) / 255.0, bd);
}
"#;

/// What a layer in a stack draws: its pixels, or (an adjustment layer) a lookup table applied to what is beneath.
pub enum Source<'a> {
    Pixels(&'a TiledLayer),
    Table(&'a Lut),
    /// A Threshold adjustment at this level (1 to 255).
    Level(u32),
    /// A folder's layers composited alone from clear, drawn as one layer.
    Group(Vec<Stack<'a>>),
    /// A Grain adjustment.
    Grain(Grain),
    /// Shadows/Highlights, HDR Toning or Clarity: a stage reading a blurred copy of the composite beneath.
    Hood(Hood),
}

/// A neighbourhood adjustment as frontend/src/engine/lut.ts adjustmentHood gives it: the kind (1 Shadows/Highlights,
/// 2 HDR Toning, 3 Clarity), whether it blurs colour (kind 3) rather than luminance, the box radii of the three blur
/// passes (a second radius for the highlights' blur), the stage's constants and the document's size, over which it blurs.
pub struct Hood {
    pub kind: u32,
    pub rgb: bool,
    pub radii: Vec<[u32; 2]>,
    pub p: Vec<f32>,
    pub width: u32,
    pub height: u32,
    blurred: RefCell<Option<wgpu::Texture>>,
}

impl Hood {
    pub fn new(kind: u32, rgb: bool, radii: Vec<[u32; 2]>, p: Vec<f32>, width: u32, height: u32) -> Hood {
        Hood { kind, rgb, radii, p, width, height, blurred: RefCell::new(None) }
    }
}

/// A Grain adjustment's numbers, as frontend/src/engine/adjust.ts grainParams gives them.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Grain {
    pub strength: f32,
    pub rough: f32,
    pub colour: f32,
    pub speckle: f32,
    pub cell: f32,
    pub amount: f32,
    pub seed: u32,
    pub fine_seed: u32,
    pub spec_seed: u32,
}

/// The layer a clipped layer shows through: its pixels, its opacity and its mask (placed by `mask_at` when apart from
/// the document).
pub struct Clip<'a> {
    pub base: &'a TiledLayer,
    pub opacity: f32,
    pub mask: Option<&'a TiledLayer>,
    pub mask_at: Option<Affine>,
    /// The clip this base is itself clipped to: its coverage multiplies with this one's.
    pub parent: Option<Box<Clip<'a>>>,
}

/// A layer's placement: its own pixel (x, y) lands at (a x + b y + c, d x + e y + f) in the document.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Affine {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub e: f32,
    pub f: f32,
}

impl Affine {
    pub fn translate(x: f32, y: f32) -> Affine {
        Affine { a: 1.0, b: 0.0, c: x, d: 0.0, e: 1.0, f: y }
    }
    /// Turned by `degrees` (clockwise on screen, y pointing down) about the layer point (cx, cy), which stays put.
    pub fn rotate_about(degrees: f32, cx: f32, cy: f32) -> Affine {
        let (s, k) = degrees.to_radians().sin_cos();
        Affine { a: k, b: -s, c: cx - k * cx + s * cy, d: s, e: k, f: cy - s * cx - k * cy }
    }
    /// Scaled by (sx, sy) about the layer point (cx, cy).
    pub fn scale_about(sx: f32, sy: f32, cx: f32, cy: f32) -> Affine {
        Affine { a: sx, b: 0.0, c: cx - sx * cx, d: 0.0, e: sy, f: cy - sy * cy }
    }
    pub fn apply(&self, x: f32, y: f32) -> (f32, f32) {
        (self.a * x + self.b * y + self.c, self.d * x + self.e * y + self.f)
    }
    pub fn inverse(&self) -> Affine {
        let det = self.a * self.e - self.b * self.d;
        let (a, b, d, e) = (self.e / det, -self.b / det, -self.d / det, self.a / det);
        Affine { a, b, c: -(a * self.c + b * self.f), d, e, f: -(d * self.c + e * self.f) }
    }
}

/// One layer in a stack: what it draws, its blend mode (formvis's index, 0 Normal to 26 Luminosity), its opacity, its
/// mask (coverage in the mask's alpha; a tile the mask lacks reveals), the base it is clipped to, and its placement
/// (none: its pixels are the document's). Masks are in document space for now; a mask with its own placement comes later.
pub struct Stack<'a> {
    pub source: Source<'a>,
    pub mode: u32,
    pub opacity: f32,
    pub mask: Option<&'a TiledLayer>,
    pub mask_at: Option<Affine>,
    pub clip: Option<Clip<'a>>,
    pub transform: Option<Affine>,
    /// An adjustment layer's blend mode (0 Normal): its adjusted colour blends onto what is beneath in this mode.
    pub adjust_mode: u32,
    pub folders: Vec<(&'a TiledLayer, Option<Affine>)>,
    pub blend_if: Option<BlendIf>,
    /// Channels turned off in Advanced Blending: bit 0 red, 1 green, 2 blue keep the backdrop's value.
    pub ch_off: u32,
    /// Knockout: the layer's opacity, and the composite that shows through its coverage.
    pub knockout: Option<(f32, Vec<Stack<'a>>)>,
}

impl<'a> Stack<'a> {
    pub fn new(layer: &'a TiledLayer, mode: u32, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Pixels(layer), mode, opacity, mask: None, mask_at: None, clip: None, transform: None, adjust_mode: 0, folders: Vec::new(), blend_if: None, ch_off: 0, knockout: None }
    }
    pub fn with_blend_if(mut self, b: BlendIf) -> Stack<'a> {
        self.blend_if = Some(b);
        self
    }
    pub fn with_channels_off(mut self, bits: u32) -> Stack<'a> {
        self.ch_off = bits & 7;
        self
    }
    /// Knockout at `opacity`: `back` is what shows through the layer's coverage.
    pub fn knocking(mut self, opacity: f32, back: Vec<Stack<'a>>) -> Stack<'a> {
        self.knockout = Some((opacity, back));
        self
    }
    /// An adjustment layer: its table applied to everything beneath, at `opacity`.
    pub fn adjustment(table: &'a Lut, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Table(table), mode: if table.three { 101 } else { 100 }, opacity, mask: None, mask_at: None, clip: None, transform: None, adjust_mode: 0, folders: Vec::new(), blend_if: None, ch_off: 0, knockout: None }
    }
    /// A Threshold adjustment at `level`, at `opacity`.
    pub fn threshold(level: u32, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Level(level), mode: 105, opacity, mask: None, mask_at: None, clip: None, transform: None, adjust_mode: 0, folders: Vec::new(), blend_if: None, ch_off: 0, knockout: None }
    }
    /// A Grain adjustment at `opacity`.
    pub fn grain(g: Grain, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Grain(g), mode: 104, opacity, mask: None, mask_at: None, clip: None, transform: None, adjust_mode: 0, folders: Vec::new(), blend_if: None, ch_off: 0, knockout: None }
    }
    /// A neighbourhood adjustment at `opacity`.
    pub fn hood(h: Hood, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Hood(h), mode: 106, opacity, mask: None, mask_at: None, clip: None, transform: None, adjust_mode: 0, folders: Vec::new(), blend_if: None, ch_off: 0, knockout: None }
    }
    /// A group of layers composited alone from clear, then blended as one layer in `mode` at `opacity`.
    pub fn group(sub: Vec<Stack<'a>>, mode: u32, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Group(sub), mode, opacity, mask: None, mask_at: None, clip: None, transform: None, adjust_mode: 0, folders: Vec::new(), blend_if: None, ch_off: 0, knockout: None }
    }
    /// The masks of the folders around the layer, each with its placement when apart from the document: their coverages
    /// multiply with the layer's own.
    pub fn in_folders(mut self, masks: Vec<(&'a TiledLayer, Option<Affine>)>) -> Stack<'a> {
        self.folders = masks;
        self
    }
    /// An adjustment layer drawn in this blend mode (formvis's index).
    pub fn adjust_in(mut self, mode: u32) -> Stack<'a> {
        self.adjust_mode = mode;
        self
    }
    /// The mask placed in the document by `t` (its tiles are in the mask's own pixels); outside it the layer reveals.
    pub fn masked_at(mut self, mask: &'a TiledLayer, t: Affine) -> Stack<'a> {
        self.mask = Some(mask);
        self.mask_at = Some(t);
        self
    }
    /// Placed in the document by `t` (its tiles are in the layer's own pixels).
    pub fn transformed(mut self, t: Affine) -> Stack<'a> {
        self.transform = Some(t);
        self
    }
    pub fn masked(mut self, mask: &'a TiledLayer) -> Stack<'a> {
        self.mask = Some(mask);
        self
    }
    pub fn clipped_to(mut self, base: &'a TiledLayer, opacity: f32, mask: Option<&'a TiledLayer>) -> Stack<'a> {
        self.clip = Some(Clip { base, opacity, mask, mask_at: None, parent: None });
        self
    }
    /// As clipped_to, the base's mask placed in the document by `mask_at`.
    pub fn clipped_to_at(mut self, base: &'a TiledLayer, opacity: f32, mask: Option<&'a TiledLayer>, mask_at: Option<Affine>) -> Stack<'a> {
        self.clip = Some(Clip { base, opacity, mask, mask_at, parent: None });
        self
    }
    /// Clipped to a base that may itself be clipped (the clip's `parent` chain).
    pub fn clipped_by(mut self, clip: Clip<'a>) -> Stack<'a> {
        self.clip = Some(clip);
        self
    }
}

/// An adjustment's lookup table: 256 output values for each of red, green and blue, as a 256 by 1 texture.
pub struct Lut {
    texture: wgpu::Texture,
    three: bool,
}

/// A 3D table's lattice: 52 nodes a side, a node every 5 levels, packed as x = r + g * 52, y = b.
pub const LUT3_SIDE: u32 = 52;

impl Lut {
    /// A 3D table from its 52 by 52 by 52 nodes as straight RGBA8, in the order frontend/src/engine/lut.ts packs them.
    pub fn new3(gpu: &Gpu, rgba: &[u8]) -> Lut {
        let n = LUT3_SIDE;
        let size = wgpu::Extent3d { width: n * n, height: n, depth_or_array_layers: 1 };
        let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("lut3"),
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        gpu.queue.write_texture(texture.as_image_copy(), rgba, wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(n * n * 4), rows_per_image: Some(n) }, size);
        Lut { texture, three: true }
    }

    pub fn new(gpu: &Gpu, red: &[u8; 256], green: &[u8; 256], blue: &[u8; 256]) -> Lut {
        let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("lut"),
            size: wgpu::Extent3d { width: 256, height: 1, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let data: Vec<u8> = (0..256).flat_map(|i| [red[i], green[i], blue[i], 255]).collect();
        gpu.queue.write_texture(texture.as_image_copy(), &data, wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(1024), rows_per_image: Some(1) }, wgpu::Extent3d { width: 256, height: 1, depth_or_array_layers: 1 });
        Lut { texture, three: false }
    }
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Comp {
    inv0: [f32; 4],
    inv1: [f32; 4],
    tile_origin: [f32; 2],
    opacity: f32,
    mode: u32,
    has_mask: u32,
    has_clip: u32,
    base_opacity: f32,
    base_has_mask: u32,
    stage_origin: [f32; 2],
    stage_size: [f32; 2],
    layer_size: [f32; 2],
    transformed: u32,
    adj_mode: u32,
    mask_at: Place,
    base_mask_at: Place,
    level: f32,
    pad: [u32; 3],
    bi_t: [f32; 4],
    bi_u: [f32; 4],
    bi_ch: u32,
    ch_off: u32,
    ko: f32,
    ko_on: u32,
    ga: [f32; 4],
    gb: [f32; 4],
    gs: [u32; 4],
    hp: [[f32; 4]; 4],
}
const _: () = assert!(std::mem::size_of::<Comp>() == 400, "the uniform must match the WGSL struct's 400 bytes");

/// A layer's Blend If: the channel tested (1 grey, 2 red, 3 green, 4 blue) and the four-point ranges of the layer's own
/// value and of the composite beneath it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BlendIf {
    pub channel: u32,
    pub this_layer: [f32; 4],
    pub underlying: [f32; 4],
}

/// A mask placed apart from the document, as the shader reads it: the inverse placement, the staged footprint's origin
/// and size in the mask's pixels, and the mask's size; `placed` 0 reads the mask's tile straight.
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable, Default)]
struct Place {
    inv0: [f32; 4],
    inv1: [f32; 4],
    origin: [f32; 2],
    stage: [f32; 2],
    size: [f32; 2],
    placed: u32,
    pad: u32,
}

fn tile_texture(gpu: &Gpu) -> wgpu::Texture {
    gpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("stack"),
        size: wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    })
}

type Placement = ([f32; 2], [f32; 2], Affine, [f32; 2]);

/// The blend pass, built once and used for every tile.
pub struct Blender {
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    blur: wgpu::RenderPipeline,
    blur_layout: wgpu::BindGroupLayout,
    white: wgpu::Texture,
    sampler: wgpu::Sampler,
}

impl Blender {
    pub fn new(gpu: &Gpu) -> Blender {
        let source = format!("{HEAD}{HOOD_FN}{}{FS}", include_str!("blend.wgsl"));
        let module = gpu.device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("blend"), source: wgpu::ShaderSource::Wgsl(source.into()) });
        let tex_entry = |binding| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: false }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
            count: None,
        };
        let filt_entry = |binding| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
            count: None,
        };
        let layout = gpu.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("blend"),
            entries: &[
                tex_entry(0),
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
                filt_entry(3),
                tex_entry(4),
                filt_entry(5),
                wgpu::BindGroupLayoutEntry { binding: 6, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
                tex_entry(7),
            ],
        });
        let pl = gpu.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("blend"), bind_group_layouts: &[Some(&layout)], ..Default::default() });
        let pipeline = gpu.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("blend"),
            layout: Some(&pl),
            vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &module, entry_point: Some("fs"), targets: &[Some(wgpu::ColorTargetState { format: FORMAT, blend: None, write_mask: wgpu::ColorWrites::ALL })], compilation_options: Default::default() }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let white = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("white"),
            size: wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        gpu.queue.write_texture(white.as_image_copy(), &vec![255u8; (TILE * TILE * 4) as usize], wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(TILE * 4), rows_per_image: Some(TILE) }, wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 });
        let sampler = gpu.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("placed layer"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let blur_module = gpu.device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("blur"), source: wgpu::ShaderSource::Wgsl(BLUR.into()) });
        let blur_layout = gpu.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("blur"),
            entries: &[
                tex_entry(0),
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
            ],
        });
        let bpl = gpu.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("blur"), bind_group_layouts: &[Some(&blur_layout)], ..Default::default() });
        let blur = gpu.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("blur"),
            layout: Some(&bpl),
            vertex: wgpu::VertexState { module: &blur_module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &blur_module, entry_point: Some("fs"), targets: &[Some(wgpu::ColorTargetState { format: wgpu::TextureFormat::Rgba16Float, blend: None, write_mask: wgpu::ColorWrites::ALL })], compilation_options: Default::default() }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        Blender { pipeline, layout, blur, blur_layout, white, sampler }
    }

    /// The blurred copy of the composite beneath a neighbourhood adjustment, over the whole document, kept in the Hood
    /// for the other tiles: the layers below rendered tile by tile into one texture, then the three box passes along x
    /// then y (hood.ts BLUR_WGSL) in half float, as the web renderer holds them. None when the document is wider than the GPU's largest texture.
    fn hood_blur(&self, gpu: &Gpu, h: &Hood, below: &[Stack]) -> Option<wgpu::Texture> {
        if let Some(t) = h.blurred.borrow().as_ref() {
            return Some(t.clone());
        }
        let (w, ht) = (h.width, h.height);
        if w == 0 || ht == 0 || w > gpu.limits.max_texture_dimension_2d || ht > gpu.limits.max_texture_dimension_2d {
            return None;
        }
        let make = |format: wgpu::TextureFormat, usage: wgpu::TextureUsages| {
            gpu.device.create_texture(&wgpu::TextureDescriptor { label: Some("hood"), size: wgpu::Extent3d { width: w, height: ht, depth_or_array_layers: 1 }, mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2, format, usage, view_formats: &[] })
        };
        let comp = make(FORMAT, wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST);
        for ty in 0..ht.div_ceil(TILE) {
            for tx in 0..w.div_ceil(TILE) {
                let tile = self.render_tile(gpu, below, tx, ty);
                let mut enc = gpu.device.create_command_encoder(&Default::default());
                enc.copy_texture_to_texture(
                    wgpu::TexelCopyTextureInfo { texture: &tile, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                    wgpu::TexelCopyTextureInfo { texture: &comp, mip_level: 0, origin: wgpu::Origin3d { x: tx * TILE, y: ty * TILE, z: 0 }, aspect: wgpu::TextureAspect::All },
                    wgpu::Extent3d { width: TILE.min(w - tx * TILE), height: TILE.min(ht - ty * TILE), depth_or_array_layers: 1 },
                );
                gpu.queue.submit([enc.finish()]);
            }
        }
        let usage = wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT;
        let pair = [make(wgpu::TextureFormat::Rgba16Float, usage), make(wgpu::TextureFormat::Rgba16Float, usage)];
        let mut enc = gpu.device.create_command_encoder(&Default::default());
        let mut keep = Vec::new();
        let mut n = 0usize;
        for r in &h.radii {
            for dir in 0..2u32 {
                let raw: [i32; 12] = [0, 0, w as i32, ht as i32, r[0] as i32, r[1] as i32, dir as i32, (n == 0) as i32, h.rgb as i32, 0, 0, 0];
                let buf = crate::uniform_buffer(&gpu.device, bytemuck::bytes_of(&raw));
                let src = if n == 0 { &comp } else { &pair[(n - 1) % 2] };
                let (sv, dv) = (src.create_view(&Default::default()), pair[n % 2].create_view(&Default::default()));
                let bind = gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("blur"),
                    layout: &self.blur_layout,
                    entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&sv) }, wgpu::BindGroupEntry { binding: 1, resource: buf.as_entire_binding() }],
                });
                {
                    let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("blur"),
                        color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &dv, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
                        ..Default::default()
                    });
                    pass.set_pipeline(&self.blur);
                    pass.set_bind_group(0, &bind, &[]);
                    pass.draw(0..3, 0..1);
                }
                keep.push(buf);
                n += 1;
            }
        }
        gpu.queue.submit([enc.finish()]);
        std::mem::forget(keep);
        let out = pair[(n - 1) % 2].clone();
        *h.blurred.borrow_mut() = Some(out.clone());
        Some(out)
    }

    /// The layer's pixels around one output tile's footprint (its corners mapped back through the placement, widened by a
    /// pixel for the bilinear filter, clamped to the layer), copied into one texture so sampling crosses the layer's tile
    /// edges without seams; with the footprint's origin and size in the layer's pixels. None when the footprint misses
    /// the layer, or is wider than the GPU's largest texture (a scale below about TILE / that limit, 1.6 percent at 16,384,
    /// which needs mipmapped sampling, not done yet).
    fn stage(&self, gpu: &Gpu, enc: &mut wgpu::CommandEncoder, layer: &TiledLayer, t: &Affine, tx: u32, ty: u32) -> Option<(wgpu::Texture, [f32; 2], [f32; 2])> {
        let inv = t.inverse();
        let (ox, oy, s) = ((tx * TILE) as f32, (ty * TILE) as f32, TILE as f32);
        let pts = [(ox, oy), (ox + s, oy), (ox, oy + s), (ox + s, oy + s)].map(|(x, y)| inv.apply(x, y));
        let (mut lx, mut ly, mut hx, mut hy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for (x, y) in pts {
            lx = lx.min(x);
            ly = ly.min(y);
            hx = hx.max(x);
            hy = hy.max(y);
        }
        let (x0, y0) = ((lx.floor() - 1.0).max(0.0) as u32, (ly.floor() - 1.0).max(0.0) as u32);
        let (x1, y1) = ((hx.ceil() + 1.0).min(layer.width as f32).max(0.0) as u32, (hy.ceil() + 1.0).min(layer.height as f32).max(0.0) as u32);
        if x1 <= x0 || y1 <= y0 {
            return None;
        }
        let (w, h) = (x1 - x0, y1 - y0);
        if w > gpu.limits.max_texture_dimension_2d || h > gpu.limits.max_texture_dimension_2d {
            return None;
        }
        let stage = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("stage"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        {
            // Cleared first, so a tile the layer lacks reads as transparent.
            let view = stage.create_view(&Default::default());
            let _ = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("stage"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
                ..Default::default()
            });
        }
        for sy in y0 / TILE..=(y1 - 1) / TILE {
            for sx in x0 / TILE..=(x1 - 1) / TILE {
                let Some(tile) = layer.tile_at(sx, sy) else { continue };
                let (rx0, ry0) = (x0.max(sx * TILE), y0.max(sy * TILE));
                let (rx1, ry1) = (x1.min((sx + 1) * TILE), y1.min((sy + 1) * TILE));
                enc.copy_texture_to_texture(
                    wgpu::TexelCopyTextureInfo { texture: tile, mip_level: 0, origin: wgpu::Origin3d { x: rx0 - sx * TILE, y: ry0 - sy * TILE, z: 0 }, aspect: wgpu::TextureAspect::All },
                    wgpu::TexelCopyTextureInfo { texture: &stage, mip_level: 0, origin: wgpu::Origin3d { x: rx0 - x0, y: ry0 - y0, z: 0 }, aspect: wgpu::TextureAspect::All },
                    wgpu::Extent3d { width: rx1 - rx0, height: ry1 - ry0, depth_or_array_layers: 1 },
                );
            }
        }
        Some((stage, [x0 as f32, y0 as f32], [w as f32, h as f32]))
    }

    /// One blend pass: `src` blended (or, for the coverage mode 103, only the coverage computed) over `backdrop` into
    /// `target`, with the given mask, clip base and base mask (white where absent). Returns the uniform buffer, which
    /// must outlive the submit.
    #[allow(clippy::too_many_arguments)]
    fn pass(&self, gpu: &Gpu, enc: &mut wgpu::CommandEncoder, u: &Comp, backdrop: &wgpu::Texture, src: &wgpu::Texture, mask: Option<&wgpu::Texture>, base: Option<&wgpu::Texture>, base_mask: Option<&wgpu::Texture>, ko: Option<&wgpu::Texture>, target: &wgpu::Texture) -> wgpu::Buffer {
        let buf = crate::uniform_buffer(&gpu.device, bytemuck::bytes_of(u));
        let view = |t: &wgpu::Texture| t.create_view(&Default::default());
        let (bv, sv, fv) = (view(backdrop), view(src), view(target));
        let mv = view(mask.unwrap_or(&self.white));
        let basev = view(base.unwrap_or(&self.white));
        let bmv = view(base_mask.unwrap_or(&self.white));
        let kv = view(ko.unwrap_or(&self.white));
        let bind = gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("blend"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&bv) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&sv) },
                wgpu::BindGroupEntry { binding: 2, resource: buf.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::TextureView(&mv) },
                wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::TextureView(&basev) },
                wgpu::BindGroupEntry { binding: 5, resource: wgpu::BindingResource::TextureView(&bmv) },
                wgpu::BindGroupEntry { binding: 6, resource: wgpu::BindingResource::Sampler(&self.sampler) },
                wgpu::BindGroupEntry { binding: 7, resource: wgpu::BindingResource::TextureView(&kv) },
            ],
        });
        {
            let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("blend"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &fv, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
                ..Default::default()
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind, &[]);
            pass.draw(0..3, 0..1);
        }
        buf
    }

    /// The coverage a layer in folders with masks draws through, as one tile (its alpha): the clip base's coverage when
    /// clipped, times each folder mask's. None when no mask covers this tile.
    #[allow(clippy::too_many_arguments)]
    fn cover(&self, gpu: &Gpu, enc: &mut wgpu::CommandEncoder, l: &Stack, base: Option<&wgpu::Texture>, base_mask: Option<&wgpu::Texture>, base_mask_at: Place, tx: u32, ty: u32) -> Option<wgpu::Texture> {
        let origin = [(tx * TILE) as f32, (ty * TILE) as f32];
        let start = || {
            let mut u: Comp = bytemuck::Zeroable::zeroed();
            u.mode = 103;
            u.opacity = 1.0;
            u.tile_origin = origin;
            u.stage_size = [1.0; 2];
            u
        };
        let mut acc: Option<wgpu::Texture> = None;
        let mut keep = Vec::new();
        if let (Some(b), Some(c)) = (base, &l.clip) {
            let mut u = start();
            u.has_clip = 1;
            u.base_opacity = c.opacity.clamp(0.0, 1.0);
            u.base_has_mask = base_mask.is_some() as u32;
            u.base_mask_at = base_mask_at;
            let out = tile_texture(gpu);
            keep.push(self.pass(gpu, enc, &u, &self.white, &self.white, None, Some(b), base_mask, None, &out));
            acc = Some(out);
        }
        let mut up = l.clip.as_ref().and_then(|c| c.parent.as_deref());
        while let Some(p) = up {
            let Some(pb) = p.base.tile_at(tx, ty) else { break };
            let (pm, place) = self.mask_input(gpu, enc, p.mask, p.mask_at, tx, ty);
            let mut u = start();
            u.has_clip = 1;
            u.base_opacity = p.opacity.clamp(0.0, 1.0);
            u.base_has_mask = pm.is_some() as u32;
            u.base_mask_at = place;
            let out = tile_texture(gpu);
            keep.push(self.pass(gpu, enc, &u, acc.as_ref().unwrap_or(&self.white), &self.white, None, Some(pb), pm.as_ref(), None, &out));
            acc = Some(out);
            up = p.parent.as_deref();
        }
        for (m, at) in &l.folders {
            let (mt, place) = self.mask_input(gpu, enc, Some(m), *at, tx, ty);
            let Some(mt) = mt else { continue };
            let mut u = start();
            u.has_mask = 1;
            u.mask_at = place;
            let out = tile_texture(gpu);
            keep.push(self.pass(gpu, enc, &u, acc.as_ref().unwrap_or(&self.white), &self.white, Some(&mt), None, None, None, &out));
            acc = Some(out);
        }
        std::mem::forget(keep);
        acc
    }

    /// What the shader reads for a mask at one output tile: its tile (white where it has none, which reveals) or, for a
    /// mask placed apart from the document, the staged footprint with its placement; nothing when there is no mask or a
    /// placed one lies wholly off this tile (it reveals there).
    fn mask_input(&self, gpu: &Gpu, enc: &mut wgpu::CommandEncoder, mask: Option<&TiledLayer>, at: Option<Affine>, tx: u32, ty: u32) -> (Option<wgpu::Texture>, Place) {
        let Some(m) = mask else { return (None, Place::default()) };
        let Some(t) = at else { return (Some(m.tile_at(tx, ty).unwrap_or(&self.white).clone()), Place::default()) };
        match self.stage(gpu, enc, m, &t, tx, ty) {
            Some((tex, origin, stage)) => {
                let inv = t.inverse();
                (Some(tex), Place { inv0: [inv.a, inv.b, inv.c, 0.0], inv1: [inv.d, inv.e, inv.f, 0.0], origin, stage, size: [m.width as f32, m.height as f32], placed: 1, pad: 0 })
            }
            None => (None, Place::default()),
        }
    }

    /// One output tile, the layers blended bottom to top over transparency, left on the GPU (straight RGBA8) for the
    /// display to draw; submitted, not waited for.
    pub fn render_tile(&self, gpu: &Gpu, layers: &[Stack], tx: u32, ty: u32) -> wgpu::Texture {
        let (mut back, mut front) = (tile_texture(gpu), tile_texture(gpu));
        let mut enc = gpu.device.create_command_encoder(&Default::default());
        {
            let view = back.create_view(&Default::default());
            let _ = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("clear"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
                ..Default::default()
            });
        }
        let mut uniforms = Vec::new();
        for (li, l) in layers.iter().enumerate() {
            let mut hood_tex: Option<wgpu::Texture> = None;
            // Pixels with no tile here are transparent here; a table applies everywhere; a placed layer reads its pixels
            // around this tile's footprint, staged into one texture.
            let mut placed: Option<Placement> = None;
            let src: wgpu::Texture = match (&l.source, &l.transform) {
                (Source::Pixels(layer), Some(t)) => match self.stage(gpu, &mut enc, layer, t, tx, ty) {
                    Some((tex, origin, size)) => {
                        placed = Some((origin, size, t.inverse(), [layer.width as f32, layer.height as f32]));
                        tex
                    }
                    None => continue,
                },
                (Source::Pixels(layer), None) => match layer.tile_at(tx, ty) { Some(t) => t.clone(), None => continue },
                (Source::Table(lut), _) => lut.texture.clone(),
                (Source::Level(_), _) | (Source::Grain(_), _) => self.white.clone(),
                (Source::Group(sub), _) => self.render_tile(gpu, sub, tx, ty),
                (Source::Hood(h), _) => match self.hood_blur(gpu, h, &layers[..li]) {
                    Some(t) => {
                        hood_tex = Some(t);
                        self.white.clone()
                    }
                    None => continue,
                },
            };
            let src = &src;
            // A clipped layer shows nothing where its base has no pixels.
            let base = match &l.clip {
                Some(c) => match c.base.tile_at(tx, ty) { Some(t) => Some(t), None => continue },
                None => None,
            };
            let (mask, mask_at) = self.mask_input(gpu, &mut enc, l.mask, l.mask_at, tx, ty);
            let (base_mask, base_mask_at) = match &l.clip {
                Some(c) => self.mask_input(gpu, &mut enc, c.mask, c.mask_at, tx, ty),
                None => (None, Place::default()),
            };
            let mut up = l.clip.as_ref().and_then(|c| c.parent.as_deref());
            let mut missing = false;
            while let Some(p) = up {
                missing |= p.base.tile_at(tx, ty).is_none();
                up = p.parent.as_deref();
            }
            if missing {
                continue;
            }
            let chained = l.clip.as_ref().is_some_and(|c| c.parent.is_some());
            let cover = if l.folders.is_empty() && !chained { None } else { self.cover(gpu, &mut enc, l, base, base_mask.as_ref(), base_mask_at, tx, ty) };
            let (inv, stage_origin, stage_size, layer_size) = match placed {
                Some((o, s, i, ls)) => (i, o, s, ls),
                None => (Affine::translate(0.0, 0.0), [0.0; 2], [1.0; 2], [0.0; 2]),
            };
            let u = Comp {
                inv0: [inv.a, inv.b, inv.c, 0.0],
                inv1: [inv.d, inv.e, inv.f, 0.0],
                tile_origin: [(tx * TILE) as f32, (ty * TILE) as f32],
                opacity: l.opacity.clamp(0.0, 1.0),
                mode: l.mode,
                has_mask: mask.is_some() as u32,
                has_clip: (base.is_some() || cover.is_some()) as u32,
                base_opacity: if cover.is_some() { 1.0 } else { l.clip.as_ref().map_or(1.0, |c| c.opacity.clamp(0.0, 1.0)) },
                base_has_mask: (cover.is_none() && base_mask.is_some()) as u32,
                stage_origin,
                stage_size,
                layer_size,
                transformed: placed.is_some() as u32,
                adj_mode: l.adjust_mode,
                mask_at,
                base_mask_at,
                level: match l.source {
                    Source::Level(v) => v as f32,
                    _ => 0.0,
                },
                pad: [matches!(l.source, Source::Group(_)) as u32, 0, 0],
                bi_t: l.blend_if.map_or([0.0; 4], |b| b.this_layer),
                bi_u: l.blend_if.map_or([0.0; 4], |b| b.underlying),
                bi_ch: l.blend_if.map_or(0, |b| b.channel),
                ch_off: l.ch_off,
                ko: l.knockout.as_ref().map_or(0.0, |k| k.0.clamp(0.0, 1.0)),
                ko_on: l.knockout.is_some() as u32,
                ga: match l.source {
                    Source::Grain(g) => [g.strength, g.rough, g.colour, g.speckle],
                    _ => [0.0; 4],
                },
                gb: match l.source {
                    Source::Grain(g) => [g.cell, g.amount, 0.0, 0.0],
                    _ => [1.0, 0.0, 0.0, 0.0],
                },
                gs: match l.source {
                    Source::Grain(g) => [g.seed, g.fine_seed, g.spec_seed, 0],
                    _ => [0; 4],
                },
                hp: match &l.source {
                    Source::Hood(h) => {
                        let mut s = [0.0f32; 16];
                        for (i, v) in h.p.iter().take(15).enumerate() {
                            s[i] = *v;
                        }
                        s[15] = h.kind as f32;
                        [[s[0], s[1], s[2], s[3]], [s[4], s[5], s[6], s[7]], [s[8], s[9], s[10], s[11]], [s[12], s[13], s[14], s[15]]]
                    }
                    _ => [[0.0; 4]; 4],
                },
            };
            let ko_tile = l.knockout.as_ref().map(|k| self.render_tile(gpu, &k.1, tx, ty));
            uniforms.push(self.pass(gpu, &mut enc, &u, &back, src, mask.as_ref(), cover.as_ref().or(base), base_mask.as_ref(), ko_tile.as_ref().or(hood_tex.as_ref()), &front));
            std::mem::swap(&mut back, &mut front);
        }
        gpu.queue.submit([enc.finish()]);
        back
    }

    /// The layers blended in a rectangle of the document, read back as straight RGBA8 (for tests and export).
    pub fn blend_region(&self, gpu: &Gpu, layers: &[Stack], x: u32, y: u32, w: u32, h: u32) -> Vec<u8> {
        let mut out = vec![0u8; (w * h * 4) as usize];
        for ty in y / TILE..=(y + h - 1) / TILE {
            for tx in x / TILE..=(x + w - 1) / TILE {
                let px = read_tile(gpu, &self.render_tile(gpu, layers, tx, ty));
                for py in 0..TILE {
                    let ly = ty * TILE + py;
                    if ly < y || ly >= y + h {
                        continue;
                    }
                    for qx in 0..TILE {
                        let lx = tx * TILE + qx;
                        if lx < x || lx >= x + w {
                            continue;
                        }
                        let s = ((py * TILE + qx) * 4) as usize;
                        let d = (((ly - y) * w + (lx - x)) * 4) as usize;
                        out[d..d + 4].copy_from_slice(&px[s..s + 4]);
                    }
                }
            }
        }
        out
    }
}

/// The layers blended in a rectangle, with a blend pass built for this call (tests and one-off exports).
pub fn blend_region(gpu: &Gpu, layers: &[Stack], x: u32, y: u32, w: u32, h: u32) -> Vec<u8> {
    Blender::new(gpu).blend_region(gpu, layers, x, y, w, h)
}

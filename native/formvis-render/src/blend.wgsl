// formvis's blend functions, the same text as frontend/src/gpu/blend-wgsl.ts (lines 37 to 100), which is checked
// against the CPU renderer in all 27 modes; tests/blend.rs fails if the two ever differ. Edit both together.
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
    case 27u: { return 1.0 - abs(1.0 - b - s); }
    case 28u: { if (s >= 1.0) { return 1.0; } return min(1.0, b * b / (1.0 - s)); }
    case 29u: { if (b >= 1.0) { return 1.0; } return min(1.0, s * s / (1.0 - b)); }
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

//! The native blend against sonny's web shader (the same text) and against an independent implementation of the W3C
//! compositing formulas, written here, within 3 levels in 255 as the web renderer's test allows.

use sonny_render::composite::{blend_region, Blender, Stack};
use sonny_render::{Gpu, TiledLayer};

const W: u32 = 64;
const H: u32 = 64;

#[test]
fn the_blend_functions_are_the_web_renderers_text() {
    let native = include_str!("../src/blend.wgsl");
    let body: String = native.lines().filter(|l| !l.starts_with("//")).collect::<Vec<_>>().join("\n");
    let web = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../frontend/src/gpu/blend-wgsl.ts")).expect("the web shader file");
    assert!(body.lines().count() > 60);
    assert!(web.contains(&body), "native/sonny-render/src/blend.wgsl differs from frontend/src/gpu/blend-wgsl.ts; edit both together");
}

fn noise(seed: &mut u32) -> u8 {
    *seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
    (*seed >> 16) as u8
}

fn scene(gpu: &Gpu) -> (TiledLayer, TiledLayer, Vec<u8>, Vec<u8>) {
    let mut seed = 7u32;
    let mut bottom = vec![0u8; (W * H * 4) as usize];
    let mut top = vec![0u8; (W * H * 4) as usize];
    for i in 0..(W * H) as usize {
        for c in 0..3 {
            bottom[i * 4 + c] = noise(&mut seed);
            top[i * 4 + c] = noise(&mut seed);
        }
        bottom[i * 4 + 3] = 255;
        top[i * 4 + 3] = 153; // alpha 0.6
    }
    // Placed across a tile corner, so the region spans four tiles.
    let (mut b, mut t) = (TiledLayer::new(1024, 1024), TiledLayer::new(1024, 1024));
    b.write(gpu, 224, 224, W, H, &bottom);
    t.write(gpu, 224, 224, W, H, &top);
    (b, t, bottom, top)
}

// The W3C Compositing and Blending formulas, written independently of the shader.
fn lum(c: [f64; 3]) -> f64 { 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] }
fn clip_color(c: [f64; 3]) -> [f64; 3] {
    let l = lum(c);
    let (n, x) = (c[0].min(c[1]).min(c[2]), c[0].max(c[1]).max(c[2]));
    let mut o = c;
    if n < 0.0 { o = o.map(|v| l + (v - l) * l / (l - n)); }
    if x > 1.0 { o = o.map(|v| l + (v - l) * (1.0 - l) / (x - l)); }
    o
}
fn set_lum(c: [f64; 3], l: f64) -> [f64; 3] { let d = l - lum(c); clip_color(c.map(|v| v + d)) }
fn sat(c: [f64; 3]) -> f64 { c[0].max(c[1]).max(c[2]) - c[0].min(c[1]).min(c[2]) }
fn set_sat(c: [f64; 3], s: f64) -> [f64; 3] {
    let (n, x) = (c[0].min(c[1]).min(c[2]), c[0].max(c[1]).max(c[2]));
    if x > n { c.map(|v| (v - n) * s / (x - n)) } else { [0.0; 3] }
}
fn separable(m: u32, b: f64, s: f64) -> f64 {
    let dodge = |b: f64, s: f64| if b <= 0.0 { 0.0 } else if s >= 1.0 { 1.0 } else { (b / (1.0 - s)).min(1.0) };
    let burn = |b: f64, s: f64| if b >= 1.0 { 1.0 } else if s <= 0.0 { 0.0 } else { 1.0 - ((1.0 - b) / s).min(1.0) };
    let hard = |b: f64, s: f64| if s <= 0.5 { b * 2.0 * s } else { let t = 2.0 * s - 1.0; b + t - b * t };
    match m {
        2 => b.min(s), 3 => b * s, 4 => burn(b, s), 5 => (b + s - 1.0).clamp(0.0, 1.0), 7 => b.max(s), 8 => b + s - b * s, 9 => dodge(b, s),
        12 => hard(s, b),
        13 => if s <= 0.5 { b - (1.0 - 2.0 * s) * b * (1.0 - b) } else { let d = if b <= 0.25 { ((16.0 * b - 12.0) * b + 4.0) * b } else { b.sqrt() }; b + (2.0 * s - 1.0) * (d - b) },
        14 => hard(b, s),
        15 => if s <= 0.5 { burn(b, 2.0 * s) } else { dodge(b, 2.0 * (s - 0.5)) },
        16 => (b + 2.0 * s - 1.0).clamp(0.0, 1.0),
        17 => if s <= 0.5 { b.min(2.0 * s) } else { b.max(2.0 * s - 1.0) },
        18 => if b + s >= 1.0 { 1.0 } else { 0.0 },
        19 => (b - s).abs(), 20 => b + s - 2.0 * b * s, 21 => (b - s).clamp(0.0, 1.0),
        22 => if s <= 0.0 { if b <= 0.0 { 0.0 } else { 1.0 } } else { (b / s).min(1.0) },
        _ => s,
    }
}
fn blend(m: u32, b: [f64; 3], s: [f64; 3]) -> [f64; 3] {
    match m {
        6 => if lum(s) < lum(b) { s } else { b },
        11 => if lum(s) < lum(b) { b } else { s },
        23 => set_lum(set_sat(s, sat(b)), lum(b)),
        24 => set_lum(set_sat(b, sat(s)), lum(b)),
        25 => set_lum(s, lum(b)),
        26 => set_lum(b, lum(s)),
        _ => [0, 1, 2].map(|i| separable(m, b[i], s[i])),
    }
}

/// The expected pixel: an opaque backdrop b, the source colour s at alpha a (as stored: premultiplied to 8 bits and back),
/// at layer opacity o.
fn expected(m: u32, b: [u8; 3], s: [u8; 3], a: u8, o: f64) -> [f64; 4] {
    let af = a as f64 / 255.0;
    let mut sc = s.map(|v| (((v as u32 * a as u32 + 127) / 255) as f64 / 255.0) / af);
    if matches!(m, 5 | 6 | 11 | 15..=18 | 21 | 22) { sc = sc.map(|v| (v * 255.0).round() / 255.0); }
    let bd = b.map(|v| v as f64 / 255.0);
    let sa = af * o;
    if m == 10 { let lo = (sa + 1.0f64).min(1.0); let c = [0, 1, 2].map(|i| (sc[i] * sa + bd[i]).min(1.0) / lo); return [c[0], c[1], c[2], lo]; }
    let r = if m == 0 { sc } else { blend(m, bd, sc) };
    let c = [0, 1, 2].map(|i| sa * r[i] + (1.0 - sa) * bd[i]); // the backdrop is opaque
    [c[0], c[1], c[2], 1.0]
}

#[test]
fn every_deterministic_mode_matches_the_formulas_within_three_levels() {
    let gpu = Gpu::new().expect("no GPU backend");
    let (b, t, bottom, top) = scene(&gpu);
    let blender = Blender::new(&gpu); // built once, used for all 26 modes, as the display uses it
    let mut worst = (0.0f64, 0u32);
    for mode in (0..27u32).filter(|&m| m != 1) {
        let out = blender.blend_region(&gpu, &[Stack { layer: &b, mode: 0, opacity: 1.0 }, Stack { layer: &t, mode, opacity: 0.8 }], 224, 224, W, H);
        for i in 0..(W * H) as usize {
            let e = expected(mode, [bottom[i * 4], bottom[i * 4 + 1], bottom[i * 4 + 2]], [top[i * 4], top[i * 4 + 1], top[i * 4 + 2]], top[i * 4 + 3], 0.8);
            for c in 0..4 {
                let d = (out[i * 4 + c] as f64 - e[c] * 255.0).abs();
                if d > worst.0 { worst = (d, mode); }
                assert!(d <= 3.0, "mode {mode}, pixel {i}, channel {c}: got {}, expected {:.1}", out[i * 4 + c], e[c] * 255.0);
            }
        }
    }
    eprintln!("worst difference {:.2} levels (mode {})", worst.0, worst.1);
}

#[test]
fn dissolve_shows_the_source_on_its_share_of_pixels() {
    let gpu = Gpu::new().expect("no GPU backend");
    let (b, t, _, top) = scene(&gpu);
    let out = blend_region(&gpu, &[Stack { layer: &b, mode: 0, opacity: 1.0 }, Stack { layer: &t, mode: 1, opacity: 0.8 }], 224, 224, W, H);
    let shown = (0..(W * H) as usize).filter(|&i| (0..3).all(|c| (out[i * 4 + c] as i32 - top[i * 4 + c] as i32).abs() <= 2)).count();
    let share = shown as f64 / (W * H) as f64;
    assert!((share - 0.6 * 0.8).abs() < 0.04, "dissolve showed the source on {share:.3} of pixels, expected about 0.48");
}

#[test]
fn a_region_with_no_tiles_is_transparent() {
    let gpu = Gpu::new().expect("no GPU backend");
    let (b, t, _, _) = scene(&gpu);
    let out = blend_region(&gpu, &[Stack { layer: &b, mode: 0, opacity: 1.0 }, Stack { layer: &t, mode: 3, opacity: 1.0 }], 700, 700, 32, 32);
    assert!(out.iter().all(|&v| v == 0));
}

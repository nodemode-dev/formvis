//! Placed (transformed) layers: the layer's pixels staged around each output tile's footprint and bilinear-sampled, so
//! the result is exact where pixel centres land on pixel centres and has no seams where the layer's tiles meet.

use formvis_render::composite::{Affine, Blender, Stack};
use formvis_render::{Gpu, TiledLayer, TILE};

const LW: u32 = 600; // three tiles wide
const LH: u32 = 300; // two tiles tall

fn pattern(x: u32, y: u32) -> [u8; 4] {
    [(x % 251) as u8, (y % 239) as u8, ((x * 7 + y * 3) % 256) as u8, 255]
}

fn layer(gpu: &Gpu, f: impl Fn(u32, u32) -> [u8; 4]) -> TiledLayer {
    let mut l = TiledLayer::new(LW, LH);
    let px: Vec<u8> = (0..LH).flat_map(|y| (0..LW).map(move |x| (x, y))).flat_map(|(x, y)| f(x, y)).collect();
    l.write(gpu, 0, 0, LW, LH, &px);
    l
}

fn render(gpu: &Gpu, l: &TiledLayer, t: Affine, x: u32, y: u32, w: u32, h: u32) -> Vec<u8> {
    Blender::new(gpu).blend_region(gpu, &[Stack::new(l, 0, 1.0).transformed(t)], x, y, w, h)
}

#[test]
fn an_integer_move_is_exact_across_the_layers_tile_edges() {
    let gpu = Gpu::new().expect("no GPU backend");
    let l = layer(&gpu, pattern);
    let out = render(&gpu, &l, Affine::translate(100.0, 37.0), 100, 37, LW, LH);
    for y in 0..LH {
        for x in 0..LW {
            let i = ((y * LW + x) * 4) as usize;
            assert_eq!(&out[i..i + 4], &pattern(x, y), "layer pixel ({x}, {y}) moved to ({}, {})", x + 100, y + 37);
        }
    }
}

#[test]
fn a_quarter_turn_lands_every_pixel_exactly() {
    let gpu = Gpu::new().expect("no GPU backend");
    let l = layer(&gpu, pattern);
    // A quarter turn about the layer point (300, 300): layer (x, y) lands at (600 - y, x), pixel centres on pixel centres.
    let t = Affine::rotate_about(90.0, 300.0, 300.0);
    let out = render(&gpu, &l, t, 300, 0, LH, LW);
    for y in (0..LH).step_by(7) {
        for x in (0..LW).step_by(5) {
            let (dx, dy) = (600 - y - 1, x); // the document pixel whose centre the layer pixel's centre lands on
            let i = (((dy) * LH + (dx - 300)) * 4) as usize;
            let (got, want) = (&out[i..i + 4], pattern(x, y));
            assert!(got.iter().zip(want).all(|(g, w)| (*g as i32 - w as i32).abs() <= 1), "({x}, {y}) -> ({dx}, {dy}): {got:?} vs {want:?}");
        }
    }
}

#[test]
fn scaling_up_has_no_seam_where_the_layers_tiles_meet() {
    let gpu = Gpu::new().expect("no GPU backend");
    // A smooth ramp across the layer's three tiles.
    let l = layer(&gpu, |x, _| [(x * 200 / LW) as u8 + 20, 90, 60, 255]);
    let out = render(&gpu, &l, Affine::scale_about(2.0, 2.0, 0.0, 0.0), 0, 100, 2 * LW - 2, 1);
    let red: Vec<i32> = out.chunks(4).map(|p| p[0] as i32).collect();
    for (i, pair) in red.windows(2).enumerate() {
        assert!((pair[1] - pair[0]).abs() <= 1, "a jump of {} at document x {} (the layer's tile edge lands at {})", pair[1] - pair[0], i, 2 * TILE);
    }
    assert!(out.chunks(4).all(|p| p[3] == 255), "a transparent line: a seam");
}

/// Bilinear sampling of the layer's pixels at layer point (u, v), clamped at its edges: written independently of the GPU.
fn bilinear(f: &impl Fn(u32, u32) -> [u8; 4], u: f32, v: f32) -> [f32; 4] {
    let (x, y) = (u - 0.5, v - 0.5);
    let (x0, y0) = (x.floor(), y.floor());
    let (fx, fy) = (x - x0, y - y0);
    let at = |xx: f32, yy: f32| f(xx.clamp(0.0, (LW - 1) as f32) as u32, yy.clamp(0.0, (LH - 1) as f32) as u32);
    let (a, b, c, d) = (at(x0, y0), at(x0 + 1.0, y0), at(x0, y0 + 1.0), at(x0 + 1.0, y0 + 1.0));
    [0, 1, 2, 3].map(|k| (a[k] as f32 * (1.0 - fx) + b[k] as f32 * fx) * (1.0 - fy) + (c[k] as f32 * (1.0 - fx) + d[k] as f32 * fx) * fy)
}

#[test]
fn a_thirty_degree_turn_matches_bilinear_sampling() {
    let gpu = Gpu::new().expect("no GPU backend");
    let smooth = |x: u32, y: u32| [(x * 255 / LW) as u8, (y * 255 / LH) as u8, ((x + y) * 255 / (LW + LH)) as u8, 255];
    let l = layer(&gpu, smooth);
    let t = Affine::rotate_about(30.0, 300.0, 150.0);
    let (x0, y0, w, h) = (150u32, 50u32, 300u32, 200u32);
    let out = render(&gpu, &l, t, x0, y0, w, h);
    let inv = t.inverse();
    let mut checked = 0;
    for y in 0..h {
        for x in 0..w {
            let (u, v) = inv.apply((x0 + x) as f32 + 0.5, (y0 + y) as f32 + 0.5);
            if u < 2.0 || v < 2.0 || u > (LW - 2) as f32 || v > (LH - 2) as f32 {
                continue; // near the layer's edge the alpha falls off; the interior is what is compared
            }
            let e = bilinear(&smooth, u, v);
            let i = ((y * w + x) * 4) as usize;
            for k in 0..4 {
                assert!((out[i + k] as f32 - e[k]).abs() <= 2.0, "({}, {}) channel {k}: {} vs {:.1}", x0 + x, y0 + y, out[i + k], e[k]);
            }
            checked += 1;
        }
    }
    assert!(checked > 40_000, "compared {checked} pixels");
}

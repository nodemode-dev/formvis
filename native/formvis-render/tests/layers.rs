//! Masks, clipping and adjustment layers in the native blend, against values worked out by hand. The scene spans two
//! tiles (x 0 to 511), so every rule is checked on both sides of a tile edge.

use formvis_render::composite::{Blender, Lut, Stack};
use formvis_render::{Gpu, TiledLayer};

const W: u32 = 512;
const H: u32 = 8;

fn solid(gpu: &Gpu, x: u32, w: u32, rgba: [u8; 4]) -> TiledLayer {
    let mut l = TiledLayer::new(1024, 1024);
    let px: Vec<u8> = (0..w * H).flat_map(|_| rgba).collect();
    l.write(gpu, x, 0, w, H, &px);
    l
}

fn at(out: &[u8], x: u32) -> [u8; 4] {
    let i = (4 * x) as usize;
    [out[i], out[i + 1], out[i + 2], out[i + 3]]
}

fn near(got: [u8; 4], want: [u8; 4]) -> bool {
    got.iter().zip(want).all(|(g, w)| (*g as i32 - w as i32).abs() <= 2)
}

#[test]
fn a_mask_hides_where_it_is_black_mixes_where_grey_and_reveals_where_it_has_no_tile() {
    let gpu = Gpu::new().expect("no GPU backend");
    let blender = Blender::new(&gpu);
    let blue = solid(&gpu, 0, W, [0, 0, 255, 255]);
    let red = solid(&gpu, 0, W, [255, 0, 0, 255]);
    // The mask: hidden (alpha 0) on x 0 to 127, half (128) on 128 to 255; it has no tile on 256 to 511 at all.
    let mut mask = TiledLayer::new(1024, 1024);
    let m: Vec<u8> = (0..H).flat_map(|_| (0..256u32).flat_map(|x| [255, 255, 255, if x < 128 { 0 } else { 128 }])).collect();
    mask.write(&gpu, 0, 0, 256, H, &m);
    let out = blender.blend_region(&gpu, &[Stack::new(&blue, 0, 1.0), Stack::new(&red, 0, 1.0).masked(&mask)], 0, 0, W, H);
    assert!(near(at(&out, 60), [0, 0, 255, 255]), "hidden: {:?}", at(&out, 60));
    assert!(near(at(&out, 200), [128, 0, 127, 255]), "half: {:?}", at(&out, 200));
    assert!(near(at(&out, 400), [255, 0, 0, 255]), "no mask tile, so revealed: {:?}", at(&out, 400));
}

#[test]
fn a_clipped_layer_shows_only_through_its_base_at_the_bases_opacity() {
    let gpu = Gpu::new().expect("no GPU backend");
    let blender = Blender::new(&gpu);
    let blue = solid(&gpu, 0, W, [0, 0, 255, 255]);
    let base = solid(&gpu, 0, 128, [200, 200, 200, 255]); // pixels only on x 0 to 127
    let green = solid(&gpu, 0, W, [0, 255, 0, 255]);
    let stack = [Stack::new(&blue, 0, 1.0), Stack::new(&base, 0, 0.5), Stack::new(&green, 0, 1.0).clipped_to(&base, 0.5, None)];
    let out = blender.blend_region(&gpu, &stack, 0, 0, W, H);
    // Left: grey at half over blue gives (100, 100, 227); green over that at the base's coverage, half: (50, 178, 114).
    assert!(near(at(&out, 60), [50, 178, 114, 255]), "through the base: {:?}", at(&out, 60));
    assert!(near(at(&out, 300), [0, 0, 255, 255]), "no base, nothing shows, in the other tile too: {:?}", at(&out, 300));
}

#[test]
fn clipping_follows_the_bases_own_mask() {
    let gpu = Gpu::new().expect("no GPU backend");
    let blender = Blender::new(&gpu);
    let blue = solid(&gpu, 0, W, [0, 0, 255, 255]);
    let base = solid(&gpu, 0, W, [0, 0, 255, 255]);
    let green = solid(&gpu, 0, W, [0, 255, 0, 255]);
    let mut base_mask = TiledLayer::new(1024, 1024);
    let m: Vec<u8> = (0..H).flat_map(|_| (0..256u32).flat_map(|x| [255, 255, 255, if x < 128 { 0 } else { 255 }])).collect();
    base_mask.write(&gpu, 0, 0, 256, H, &m);
    let stack = [Stack::new(&blue, 0, 1.0), Stack::new(&base, 0, 1.0).masked(&base_mask), Stack::new(&green, 0, 1.0).clipped_to(&base, 1.0, Some(&base_mask))];
    let out = blender.blend_region(&gpu, &stack, 0, 0, W, H);
    assert!(near(at(&out, 60), [0, 0, 255, 255]), "the base's mask hides it, so the clip does too: {:?}", at(&out, 60));
    assert!(near(at(&out, 200), [0, 255, 0, 255]), "revealed: {:?}", at(&out, 200));
}

#[test]
fn an_invert_adjustment_applies_everywhere_beneath_mixed_by_opacity() {
    let gpu = Gpu::new().expect("no GPU backend");
    let blender = Blender::new(&gpu);
    let colour = solid(&gpu, 0, W, [40, 120, 200, 255]);
    let mut inv = [0u8; 256];
    for (i, v) in inv.iter_mut().enumerate() {
        *v = 255 - i as u8;
    }
    let lut = Lut::new(&gpu, &inv, &inv, &inv);
    let full = blender.blend_region(&gpu, &[Stack::new(&colour, 0, 1.0), Stack::adjustment(&lut, 1.0)], 0, 0, W, H);
    assert!(near(at(&full, 60), [215, 135, 55, 255]) && near(at(&full, 400), [215, 135, 55, 255]), "inverted in both tiles: {:?}", at(&full, 400));
    let half = blender.blend_region(&gpu, &[Stack::new(&colour, 0, 1.0), Stack::adjustment(&lut, 0.5)], 0, 0, W, H);
    assert!(near(at(&half, 60), [128, 128, 128, 255]), "half way to the inverse: {:?}", at(&half, 60));
}

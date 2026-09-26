use sonny_render::composite::{Blender, Lut, Stack};
use sonny_render::document::{Document, LayerSpec};
use sonny_render::{Gpu, TiledLayer};

const W: u32 = 300;
const H: u32 = 20;

fn solid(w: u32, rgba: [u8; 4]) -> Vec<u8> {
    (0..w * H).flat_map(|_| rgba).collect()
}

fn at(out: &[u8], x: u32) -> [u8; 4] {
    let i = (4 * (5 * W + x)) as usize;
    [out[i], out[i + 1], out[i + 2], out[i + 3]]
}

fn inverse_table() -> [u8; 256] {
    let mut t = [0u8; 256];
    for (i, v) in t.iter_mut().enumerate() {
        *v = 255 - i as u8;
    }
    t
}

#[test]
fn the_mirror_blends_as_the_same_stack_built_by_hand() {
    let gpu = Gpu::new().expect("no GPU backend");
    let blender = Blender::new(&gpu);
    let inv = inverse_table();
    let mut doc = Document::new(W, H);
    doc.put_pixels(&gpu, "bg", W, H, 0, 0, W, H, &solid(W, [30, 60, 220, 255]));
    doc.put_pixels(&gpu, "base", W, H, 0, 0, 150, H, &solid(150, [200, 200, 200, 255]));
    doc.put_pixels(&gpu, "mask", W, H, 0, 0, 100, H, &solid(100, [255, 255, 255, 128]));
    doc.put_pixels(&gpu, "top", W, H, 0, 0, W, H, &solid(W, [20, 220, 60, 255]));
    doc.put_table(&gpu, "invert", &inv, &inv, &inv);
    doc.set_stack(vec![
        LayerSpec::pixels("bg"),
        LayerSpec { mode: 3, opacity: 0.7, ..LayerSpec::pixels("base") },
        LayerSpec { mask: Some("mask".into()), clip_to: Some("base".into()), ..LayerSpec::pixels("top") },
        LayerSpec { table: Some("invert".into()), opacity: 0.4, ..LayerSpec::pixels("adj") },
    ]);
    let mirrored = blender.blend_region(&gpu, &doc.stack(), 0, 0, W, H);

    // The same by hand.
    let mut bg = TiledLayer::new(W, H);
    bg.write(&gpu, 0, 0, W, H, &solid(W, [30, 60, 220, 255]));
    let mut base = TiledLayer::new(W, H);
    base.write(&gpu, 0, 0, 150, H, &solid(150, [200, 200, 200, 255]));
    let mut mask = TiledLayer::new(W, H);
    mask.write(&gpu, 0, 0, 100, H, &solid(100, [255, 255, 255, 128]));
    let mut top = TiledLayer::new(W, H);
    top.write(&gpu, 0, 0, W, H, &solid(W, [20, 220, 60, 255]));
    let lut = Lut::new(&gpu, &inv, &inv, &inv);
    let by_hand = blender.blend_region(&gpu, &[Stack::new(&bg, 0, 1.0), Stack::new(&base, 3, 0.7), Stack::new(&top, 0, 1.0).masked(&mask).clipped_to(&base, 0.7, None), Stack::adjustment(&lut, 0.4)], 0, 0, W, H);
    assert_eq!(mirrored, by_hand);
    // And the regions differ as the rules say: masked clip (x 50), unmasked clip (x 120), no base (x 200).
    assert!(at(&mirrored, 50) != at(&mirrored, 120) && at(&mirrored, 120) != at(&mirrored, 200));
}

#[test]
fn hidden_layers_and_clips_over_a_hidden_base_draw_nothing() {
    let gpu = Gpu::new().expect("no GPU backend");
    let blender = Blender::new(&gpu);
    let mut doc = Document::new(W, H);
    doc.put_pixels(&gpu, "bg", W, H, 0, 0, W, H, &solid(W, [30, 60, 220, 255]));
    doc.put_pixels(&gpu, "base", W, H, 0, 0, W, H, &solid(W, [200, 200, 200, 255]));
    doc.put_pixels(&gpu, "top", W, H, 0, 0, W, H, &solid(W, [20, 220, 60, 255]));
    doc.set_stack(vec![LayerSpec::pixels("bg"), LayerSpec { visible: false, ..LayerSpec::pixels("base") }, LayerSpec { clip_to: Some("base".into()), ..LayerSpec::pixels("top") }]);
    let out = blender.blend_region(&gpu, &doc.stack(), 0, 0, W, H);
    assert_eq!(at(&out, 10), [30, 60, 220, 255], "the base is hidden, so its clip shows nothing too");
    assert_eq!(doc.stack().len(), 1);
}

#[test]
fn a_new_size_starts_fresh_removal_drops_a_layer_and_missing_pixels_are_skipped() {
    let gpu = Gpu::new().expect("no GPU backend");
    let blender = Blender::new(&gpu);
    let mut doc = Document::new(W, H);
    doc.put_pixels(&gpu, "a", W, H, 0, 0, W, H, &solid(W, [200, 10, 10, 255]));
    // Re-sent at a new size with pixels only on the left: the old right half must not survive.
    doc.put_pixels(&gpu, "a", W + 1, H, 0, 0, 50, H, &solid(50, [10, 200, 10, 255]));
    doc.set_stack(vec![LayerSpec::pixels("a"), LayerSpec::pixels("not-sent-yet")]);
    let out = blender.blend_region(&gpu, &doc.stack(), 0, 0, W, H);
    assert_eq!(at(&out, 10), [10, 200, 10, 255]);
    assert_eq!(at(&out, 200)[3], 0, "no stale tile from the old size");
    assert_eq!(doc.stack().len(), 1, "the entry whose pixels have not arrived is skipped");
    doc.remove("a");
    assert!(doc.stack().is_empty() && doc.layer("a").is_none());
}

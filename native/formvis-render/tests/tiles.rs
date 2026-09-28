//! Run on whatever GPU backend the machine has; on the Linux used for 1.44.0 that is lavapipe (Mesa's Vulkan on the
//! CPU), which checks correctness, not speed.

use formvis_render::{Gpu, TiledLayer, TILE};

fn gpu() -> Gpu {
    let g = Gpu::new().expect("no GPU backend");
    eprintln!("adapter: {} ({:?}, {:?}), max texture {}", g.info.name, g.info.backend, g.info.device_type, g.limits.max_texture_dimension_2d);
    g
}

fn px(layer: &TiledLayer, g: &Gpu, x: u32, y: u32) -> [u8; 4] {
    let p = layer.read(g, x, y, 1, 1);
    [p[0], p[1], p[2], p[3]]
}

#[test]
fn a_dab_allocates_only_the_tiles_it_touches() {
    let g = gpu();
    let mut layer = TiledLayer::new(4000, 4000);
    assert_eq!(layer.allocated().0, 0);
    layer.dab(&g, [300.0, 300.0], 100.0, 1.0, [1.0, 0.0, 0.0, 1.0], 1.0); // spans 200..400: tiles 0 and 1 each way
    assert_eq!(layer.allocated().0, 4, "a 4,000 px square layer has {} tiles; one dab needs 4", (4000 / TILE + 1).pow(2));
}

#[test]
fn a_hard_dab_is_exact_and_seamless_across_a_tile_edge() {
    let g = gpu();
    let mut layer = TiledLayer::new(1000, 1000);
    layer.dab(&g, [TILE as f32, 300.0], 60.0, 1.0, [1.0, 0.0, 0.0, 1.0], 1.0); // centred on the edge between tiles 0 and 1
    assert_eq!(px(&layer, &g, TILE - 1, 300), [255, 0, 0, 255]);
    assert_eq!(px(&layer, &g, TILE, 300), [255, 0, 0, 255]);
    assert_eq!(px(&layer, &g, TILE + 50, 300), [255, 0, 0, 255]);
    assert_eq!(px(&layer, &g, TILE + 70, 300)[3], 0, "outside the radius is transparent");
    // A row across the edge: every pixel within the radius opaque, none missing at the seam.
    let row = layer.read(&g, TILE - 40, 300, 80, 1);
    assert!(row.chunks(4).all(|p| p == [255, 0, 0, 255]), "a gap at the tile edge");
}

#[test]
fn a_soft_dab_follows_the_falloff() {
    let g = gpu();
    let mut layer = TiledLayer::new(600, 600);
    layer.dab(&g, [300.0, 300.0], 100.0, 0.0, [0.0, 0.0, 1.0, 1.0], 1.0); // hardness 0: smoothstep from 0 to the radius
    for d in [0.5f32, 25.5, 50.5, 75.5, 99.5] {
        let want = 1.0 - { let t = (d / 100.0).clamp(0.0, 1.0); t * t * (3.0 - 2.0 * t) };
        let got = px(&layer, &g, 300 + d as u32, 300)[3] as f32 / 255.0;
        assert!((got - want).abs() < 0.02, "at {d} px alpha {got}, formula {want}");
    }
}

#[test]
fn a_layer_wider_than_the_largest_texture_paints_past_the_limit() {
    let g = gpu();
    let limit = g.limits.max_texture_dimension_2d;
    let w = limit + 3 * TILE; // no single texture can hold this layer
    let mut layer = TiledLayer::new(w, 512);
    layer.dab(&g, [(w - 200) as f32, 256.0], 50.0, 1.0, [0.0, 1.0, 0.0, 1.0], 1.0);
    assert_eq!(px(&layer, &g, w - 200, 256), [0, 255, 0, 255], "painted beyond the {limit} px texture limit");
    assert_eq!(layer.allocated().0, 2, "the dab is centred on y = 256, a tile row boundary, so it touches two tiles");
}

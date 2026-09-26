//! The brush benchmark, the measure the other build publishes (under 3 ms per pointer update on a 4,000 px document):
//! a stroke of pointer updates across a 4,000 by 4,000 document with a full background layer, each update laying its
//! dabs and blending every tile they touched, then waiting for the GPU to finish. Prints the adapter with the numbers,
//! since they mean nothing apart from the hardware they were measured on.
//! Run: cargo run --release --bin brush_bench

use sonny_render::composite::{Blender, Stack};
use sonny_render::{budget, Gpu, TiledLayer, TILE};
use std::collections::BTreeSet;
use std::time::Instant;

const SIZE: u32 = 4000;
const UPDATES: usize = 200;
const STEP: f32 = 12.0; // pointer movement per update, in pixels
const RADIUS: f32 = 30.0;
const SPACING: f32 = 0.25 * 2.0 * RADIUS; // dabs every quarter of the diameter

fn main() {
    let gpu = Gpu::new().expect("no GPU backend");
    let b = budget::system_budget();
    println!("adapter: {} ({:?}, {:?})", gpu.info.name, gpu.info.backend, gpu.info.device_type);
    println!("memory: {:.1} GB, budget {:.1} GB, largest document {:.0} MP", b.ram as f64 / 1e9, b.bytes as f64 / 1e9, b.max_pixels as f64 / 1e6);

    // A full background: every tile of the document holds pixels.
    let mut background = TiledLayer::new(SIZE, SIZE);
    let row: Vec<u8> = (0..SIZE).flat_map(|x| [(x % 256) as u8, 128, 200, 255]).collect();
    for band in (0..SIZE).step_by(TILE as usize) {
        let h = TILE.min(SIZE - band);
        let rows: Vec<u8> = (0..h).flat_map(|_| row.iter().copied()).collect();
        background.write(&gpu, 0, band, SIZE, h, &rows);
    }
    let mut paint = TiledLayer::new(SIZE, SIZE);
    let blender = Blender::new(&gpu);
    let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());

    let mut times = Vec::with_capacity(UPDATES);
    let (mut last, mut carry) = ([200.0f32, 200.0f32], 0.0f32);
    for i in 1..=UPDATES {
        let t = Instant::now();
        let p = [200.0 + i as f32 * STEP, 200.0 + i as f32 * STEP * 0.6];
        let (dx, dy) = (p[0] - last[0], p[1] - last[1]);
        let len = (dx * dx + dy * dy).sqrt();
        let mut dirty = BTreeSet::new();
        let mut d = SPACING - carry;
        while d <= len {
            let c = [last[0] + dx * d / len, last[1] + dy * d / len];
            paint.dab(&gpu, c, RADIUS, 0.8, [0.9, 0.2, 0.1, 1.0], 0.7);
            for ty in ((c[1] - RADIUS).max(0.0) as u32 / TILE)..=((c[1] + RADIUS) as u32 / TILE) {
                for tx in ((c[0] - RADIUS).max(0.0) as u32 / TILE)..=((c[0] + RADIUS) as u32 / TILE) {
                    dirty.insert((tx, ty));
                }
            }
            d += SPACING;
        }
        carry = len - (d - SPACING);
        last = p;
        let layers = [Stack::new(&background, 0, 1.0), Stack::new(&paint, 0, 1.0)];
        let rendered: Vec<_> = dirty.iter().map(|&(tx, ty)| blender.render_tile(&gpu, &layers, tx, ty)).collect();
        let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
        drop(rendered);
        times.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let q = |f: f64| times[((times.len() - 1) as f64 * f).round() as usize];
    println!("{UPDATES} pointer updates on a {SIZE} px document: median {:.2} ms, 95th percentile {:.2} ms, worst {:.2} ms", q(0.5), q(0.95), q(1.0));
}

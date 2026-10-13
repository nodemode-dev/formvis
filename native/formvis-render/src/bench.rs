//! The brush benchmark, the measure the other build publishes (under 3 ms per pointer update on a 4,000 px document):
//! a stroke of pointer updates across a document with a full background layer, each update laying its dabs and
//! blending every tile they touched, then waiting for the GPU to finish.

use crate::composite::{Blender, Stack};
use crate::{Gpu, TiledLayer, TILE};
use std::collections::BTreeSet;
use std::time::Instant;

const STEP: f32 = 12.0;
const RADIUS: f32 = 30.0;
const SPACING: f32 = 0.25 * 2.0 * RADIUS;

pub struct Timings {
    pub median: f64,
    pub p95: f64,
    pub worst: f64,
}

/// Runs `updates` pointer updates on a `size` px square document; returns the per-update times in milliseconds, sorted.
pub fn run(gpu: &Gpu, size: u32, updates: usize) -> Vec<f64> {
    let mut background = TiledLayer::new(size, size);
    let row: Vec<u8> = (0..size).flat_map(|x| [(x % 256) as u8, 128, 200, 255]).collect();
    for band in (0..size).step_by(TILE as usize) {
        let h = TILE.min(size - band);
        let rows: Vec<u8> = (0..h).flat_map(|_| row.iter().copied()).collect();
        background.write(gpu, 0, band, size, h, &rows);
    }
    let mut paint = TiledLayer::new(size, size);
    let blender = Blender::new(gpu);
    let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());

    let mut times = Vec::with_capacity(updates);
    let (mut last, mut carry) = ([200.0f32, 200.0f32], 0.0f32);
    for i in 1..=updates {
        let t = Instant::now();
        let p = [200.0 + i as f32 * STEP, 200.0 + i as f32 * STEP * 0.6];
        let (dx, dy) = (p[0] - last[0], p[1] - last[1]);
        let len = (dx * dx + dy * dy).sqrt();
        let mut dirty = BTreeSet::new();
        let mut d = SPACING - carry;
        while d <= len {
            let c = [last[0] + dx * d / len, last[1] + dy * d / len];
            paint.dab(gpu, c, RADIUS, 0.8, [0.9, 0.2, 0.1, 1.0], 0.7);
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
        let rendered: Vec<_> = dirty.iter().map(|&(tx, ty)| blender.render_tile(gpu, &layers, tx, ty)).collect();
        let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
        drop(rendered);
        times.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(|a, b| a.total_cmp(b));
    times
}

pub fn summarize(times: &[f64]) -> Timings {
    let q = |f: f64| times[((times.len() - 1) as f64 * f).round() as usize];
    Timings { median: q(0.5), p95: q(0.95), worst: q(1.0) }
}

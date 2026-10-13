//! The brush benchmark, the measure the other build publishes (under 3 ms per pointer update on a 4,000 px document):
//! a stroke of pointer updates across a 4,000 by 4,000 document with a full background layer, each update laying its
//! dabs and blending every tile they touched, then waiting for the GPU to finish. Prints the adapter with the numbers,
//! since they mean nothing apart from the hardware they were measured on.
//! Run: cargo run --release --bin brush_bench

use formvis_render::{bench, budget, Gpu};

const SIZE: u32 = 4000;
const UPDATES: usize = 200;

fn main() {
    let gpu = Gpu::new().expect("no GPU backend");
    let b = budget::system_budget();
    println!("adapter: {} ({:?}, {:?})", gpu.info.name, gpu.info.backend, gpu.info.device_type);
    println!("memory: {:.1} GB, budget {:.1} GB, largest document {:.0} MP", b.ram as f64 / 1e9, b.bytes as f64 / 1e9, b.max_pixels as f64 / 1e6);
    let t = bench::summarize(&bench::run(&gpu, SIZE, UPDATES));
    println!("{UPDATES} pointer updates on a {SIZE} px document: median {:.2} ms, 95th percentile {:.2} ms, worst {:.2} ms", t.median, t.p95, t.worst);
}

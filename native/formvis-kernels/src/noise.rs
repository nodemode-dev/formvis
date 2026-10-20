//! Add Noise, the uniform grain. Twin of `addNoise` in filters.ts for `gaussian = false`: the same SplitMix32 keys per
//! pixel and channel, the same operation order, so the bytes match. The Gaussian grain stays in TypeScript, where the
//! logarithm and cosine come from the page's own maths library.

use crate::js_round;
use std::slice;

#[inline]
fn mix32(z: u32) -> u32 {
    let mut z = z.wrapping_add(0x9e37_79b9);
    z = (z ^ (z >> 16)).wrapping_mul(0x85eb_ca6b);
    z = (z ^ (z >> 13)).wrapping_mul(0xc2b2_ae35);
    z ^ (z >> 16)
}

#[inline]
fn to_unit(bits: u32) -> f64 {
    (bits as f64 + 0.5) / 4294967296.0
}

#[inline]
fn add(v: u8, n: f64) -> u8 {
    let s = v as f64 + n;
    let c = if s < 0.0 { 0.0 } else if s > 255.0 { 255.0 } else { s };
    js_round(c) as u8
}

/// # Safety
/// `px` holds `len` bytes (a multiple of 4) inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_noise_uniform(px: *mut u8, len: usize, spread: f64, mono: u32, seed: u32) {
    let d = slice::from_raw_parts_mut(px, len);
    let mut i = 0usize;
    while i + 3 < len {
        if d[i + 3] != 0 {
            let key = mix32(mix32((i / 4) as u32) ^ seed);
            if mono != 0 {
                let n = (to_unit(mix32(key)) * 2.0 - 1.0) * spread;
                for c in 0..3 {
                    d[i + c] = add(d[i + c], n);
                }
            } else {
                for c in 0..3 {
                    let n = (to_unit(mix32(key.wrapping_add(c as u32))) * 2.0 - 1.0) * spread;
                    d[i + c] = add(d[i + c], n);
                }
            }
        }
        i += 4;
    }
}

#[inline]
fn lattice(x: i32, y: i32, seed: u32) -> f64 {
    let mut z = (x as u32).wrapping_mul(0x27d4_eb2d) ^ (y as u32).wrapping_mul(0x1656_67b1) ^ seed;
    let mut sum = 0.0;
    for _ in 0..2 {
        z = z.wrapping_add(0x9e37_79b9);
        z = (z ^ (z >> 16)).wrapping_mul(0x85eb_ca6b);
        z = (z ^ (z >> 13)).wrapping_mul(0xc2b2_ae35);
        z ^= z >> 16;
        sum += z as f64 / 4294967295.0;
    }
    sum - 1.0
}

#[inline]
fn smoothstep(t: f64) -> f64 {
    t * t * (3.0 - 2.0 * t)
}

#[inline]
#[allow(clippy::too_many_arguments)]
fn value(cx: i32, cy: i32, tx: f64, ty: f64, fx: i32, fy: i32, seed: u32, fine: u32, rough: f64) -> f64 {
    let a = lattice(cx, cy, seed);
    let b = lattice(cx.wrapping_add(1), cy, seed);
    let c = lattice(cx, cy.wrapping_add(1), seed);
    let d = lattice(cx.wrapping_add(1), cy.wrapping_add(1), seed);
    let smooth = ((a + (b - a) * tx) * (1.0 - ty) + (c + (d - c) * tx) * ty) * 1.6;
    smooth + (lattice(fx, fy, fine) - smooth) * rough
}

/// The Grain adjustment's pass over `len` bytes, `width` pixels a row; twin of `grainKernel` (`p` holds the numbers of `grainParams`).
///
/// # Safety
/// `px` holds `len` bytes (a multiple of 4 and of `width * 4`) inside this module's memory.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn fv_grain(px: *mut u8, len: usize, width: usize, unit: f64, ox: f64, oy: f64, seed: u32, fine_seed: u32, spec_seed: u32, amount: f64, cell: f64, strength: f64, rough: f64, colour: f64, speckle: f64) {
    let d = slice::from_raw_parts_mut(px, len);
    if width == 0 {
        return;
    }
    let rows = len / 4 / width;
    for y in 0..rows {
        let v = oy + (y as f64 + 0.5) * unit;
        let cy = (v / cell).floor();
        let ty = smoothstep(v / cell - cy);
        let fy = v.floor() as i32;
        let cy = cy as i32;
        for x in 0..width {
            let i = (y * width + x) * 4;
            if d[i + 3] == 0 {
                continue;
            }
            let u = ox + (x as f64 + 0.5) * unit;
            let cxf = (u / cell).floor();
            let tx = smoothstep(u / cell - cxf);
            let cx = cxf as i32;
            let fx = u.floor() as i32;
            let noise = value(cx, cy, tx, ty, fx, fy, seed, fine_seed, rough);
            let luma = (1.0f64).min((0.2126 * d[i] as f64 + 0.7152 * d[i + 1] as f64 + 0.0722 * d[i + 2] as f64) / 255.0);
            let weight = strength * (0.4 + 2.4 * luma * (1.0 - luma));
            let mut speck = 0.0;
            if speckle > 0.0 {
                let h = lattice(fx, fy, spec_seed);
                if h.abs() > 1.0 - speckle {
                    speck = h.signum() * 0.55 * 255.0 * (1.0f64).min(amount / 50.0);
                }
            }
            for ch in 0..3usize {
                let own = if colour > 0.0 {
                    let k = (ch as u32) + 1;
                    value(cx, cy, tx, ty, fx, fy, seed.wrapping_add(k.wrapping_mul(0x9e37_79b1)), fine_seed.wrapping_add(k.wrapping_mul(0x85eb_ca6b)), rough)
                } else {
                    noise
                };
                let s = d[i + ch] as f64 + (noise + (own - noise) * colour) * weight + speck;
                let c = if s < 0.0 { 0.0 } else if s > 255.0 { 255.0 } else { s };
                d[i + ch] = js_round(c) as u8;
            }
        }
    }
}

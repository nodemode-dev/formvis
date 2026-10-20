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

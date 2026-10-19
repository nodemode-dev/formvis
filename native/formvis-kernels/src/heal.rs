//! The healing brushes' blend mode, the per-pixel part: the full-strength heal recovered from the heal mixed in by the
//! brush's coverage, and Replace's stable per-pixel choice. Twin of the first loop of `healBlend` in engine/index.ts.

use crate::{clamp_u8, js_round};
use std::slice;

#[inline]
fn dissolve_noise(x: i32, y: i32) -> f64 {
    let mut h = x.wrapping_mul(374761393).wrapping_add(y.wrapping_mul(668265263));
    h = (h ^ ((h as u32) >> 13) as i32).wrapping_mul(1274126177);
    ((h ^ ((h as u32) >> 16) as i32) as u32) as f64 / 4294967296.0
}

/// # Safety
/// `before`, `out` and `full` hold `count * 4` bytes and `cov` `count` bytes, inside this module's memory; `full` starts zeroed.
#[no_mangle]
pub unsafe extern "C" fn fv_heal_full(before: *const u8, out: *mut u8, cov: *const u8, count: usize, w: usize, opacity: f64, replace: u32, full: *mut u8) {
    let a = slice::from_raw_parts(before, count * 4);
    let o = slice::from_raw_parts_mut(out, count * 4);
    let cov = slice::from_raw_parts(cov, count);
    let f = slice::from_raw_parts_mut(full, count * 4);
    for i in 0..count {
        let k = (cov[i] as f64 / 255.0) * opacity;
        let j = i * 4;
        if k < 0.02 {
            continue;
        }
        for ch in 0..3 {
            f[j + ch] = clamp_u8(a[j + ch] as f64 + (o[j + ch] as f64 - a[j + ch] as f64) / k);
        }
        f[j + 3] = clamp_u8(js_round(k * 255.0));
        if replace != 0 {
            let take = dissolve_noise((i % w) as i32, (i / w) as i32) < k;
            for ch in 0..3 {
                o[j + ch] = if take { f[j + ch] } else { a[j + ch] };
            }
        }
    }
}

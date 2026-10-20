//! The Patch tool's colour correction (Diffusion and Color): the chamfer distance inside the patched area and the
//! per-pixel mix of the heal with a plain copy of its source. Twin of `insideDistance` and `scaleHealCorrection` in
//! engine/retouch.ts, with the same operation order and the same Float32 distance field, so the bytes match.

use crate::{clamp_u8, js_round};
use std::slice;

fn inside_distance(cov: &[u8], w: usize, h: usize) -> Vec<f32> {
    let inf = 1e9f64;
    let mut d = vec![0f32; w * h];
    for (i, v) in d.iter_mut().enumerate() {
        *v = if cov[i] >= 128 { inf as f32 } else { 0.0 };
    }
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if d[i] == 0.0 {
                continue;
            }
            let mut v = d[i] as f64;
            if x > 0 {
                v = v.min(d[i - 1] as f64 + 3.0);
            } else {
                v = v.min(3.0);
            }
            if y > 0 {
                v = v.min(d[i - w] as f64 + 3.0);
                if x > 0 {
                    v = v.min(d[i - w - 1] as f64 + 4.0);
                }
                if x < w - 1 {
                    v = v.min(d[i - w + 1] as f64 + 4.0);
                }
            } else {
                v = v.min(3.0);
            }
            d[i] = v as f32;
        }
    }
    for y in (0..h).rev() {
        for x in (0..w).rev() {
            let i = y * w + x;
            if d[i] == 0.0 {
                continue;
            }
            let mut v = d[i] as f64;
            if x < w - 1 {
                v = v.min(d[i + 1] as f64 + 3.0);
            } else {
                v = v.min(3.0);
            }
            if y < h - 1 {
                v = v.min(d[i + w] as f64 + 3.0);
                if x < w - 1 {
                    v = v.min(d[i + w + 1] as f64 + 4.0);
                }
                if x > 0 {
                    v = v.min(d[i + w - 1] as f64 + 4.0);
                }
            } else {
                v = v.min(3.0);
            }
            d[i] = v as f32;
        }
    }
    for v in d.iter_mut() {
        *v = (*v as f64 / 3.0) as f32;
    }
    d
}

/// # Safety
/// `out`, `before` and (when `has_source` is not 0) `source` hold `w * h * 4` bytes and `cov` `w * h` bytes, inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_patch_correct(out: *mut u8, before: *const u8, cov: *const u8, w: usize, h: usize, dx: i32, dy: i32, diffusion: f64, colour: f64, opacity: f64, source: *const u8, has_source: u32) {
    let n = w * h;
    let o = slice::from_raw_parts_mut(out, n * 4);
    let b = slice::from_raw_parts(before, n * 4);
    let cov = slice::from_raw_parts(cov, n);
    let from = if has_source != 0 { slice::from_raw_parts(source, n * 4) } else { b };
    let diff = js_round(diffusion.min(7.0).max(1.0));
    let col = colour.min(1.0).max(0.0);
    let op = opacity.min(1.0).max(0.0);
    if (diff >= 7.0 && col >= 1.0) || op <= 0.0 {
        return;
    }
    let dist = if diff < 7.0 { Some(inside_distance(cov, w, h)) } else { None };
    let l = 2f64.powi(diff as i32);
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if cov[i] < 128 {
                continue;
            }
            let k = match &dist {
                Some(d) => col * (-(d[i] as f64) / l).exp(),
                None => col,
            };
            let sy = (y as i64 + dy as i64).min(h as i64 - 1).max(0) as usize;
            let sx = (x as i64 + dx as i64).min(w as i64 - 1).max(0) as usize;
            let s = (sy * w + sx) * 4;
            for ch in 0..3 {
                let bv = b[i * 4 + ch] as f64;
                let full = bv + (o[i * 4 + ch] as f64 - bv) / op;
                let raw = from[s + ch] as f64;
                o[i * 4 + ch] = clamp_u8(js_round(bv + op * (raw + k * (full - raw) - bv)));
            }
        }
    }
}

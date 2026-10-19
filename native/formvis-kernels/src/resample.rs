//! Image Size's separable resampling passes (bilinear, bicubic and the other kernels): the page computes the tap weights
//! and hands them over, so the sums here run in the same order as `kernelResample` in resample.ts and match it byte for byte.

use crate::clamp_u8;
use std::slice;

/// Rows: every output column of every source row, on premultiplied colour, into `mid` (floats).
///
/// # Safety
/// `src` holds `sw * sh * 4` bytes, `start` and `offs` hold `w` and `w + 1` entries, `weights` the sum of the row lengths
/// in `offs`, and `mid` `w * sh * 4` floats, all inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_resample_h(src: *const u8, sw: usize, sh: usize, w: usize, start: *const i32, offs: *const u32, weights: *const f32, mid: *mut f32) {
    let s = slice::from_raw_parts(src, sw * sh * 4);
    let start = slice::from_raw_parts(start, w);
    let offs = slice::from_raw_parts(offs, w + 1);
    let weights = slice::from_raw_parts(weights, offs[w] as usize);
    let mid = slice::from_raw_parts_mut(mid, w * sh * 4);
    for y in 0..sh {
        for x in 0..w {
            let row = &weights[offs[x] as usize..offs[x + 1] as usize];
            let x0 = start[x] as usize;
            let (mut r, mut g, mut b, mut a) = (0f64, 0f64, 0f64, 0f64);
            for (i, wt) in row.iter().enumerate() {
                let o = (y * sw + x0 + i) * 4;
                let al = s[o + 3] as f64 / 255.0;
                let wt = *wt as f64;
                r += s[o] as f64 * al * wt;
                g += s[o + 1] as f64 * al * wt;
                b += s[o + 2] as f64 * al * wt;
                a += al * wt;
            }
            let m = (y * w + x) * 4;
            mid[m] = r as f32;
            mid[m + 1] = g as f32;
            mid[m + 2] = b as f32;
            mid[m + 3] = a as f32;
        }
    }
}

/// Columns: every output row from the `mid` rows, colour taken back off the coverage, into `out` (bytes).
///
/// # Safety
/// `mid` holds `w * sh * 4` floats, `start` and `offs` hold `h` and `h + 1` entries, `weights` the sum of the row lengths
/// in `offs`, and `out` `w * h * 4` bytes, all inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_resample_v(mid: *const f32, w: usize, sh: usize, h: usize, start: *const i32, offs: *const u32, weights: *const f32, out: *mut u8) {
    let mid = slice::from_raw_parts(mid, w * sh * 4);
    let start = slice::from_raw_parts(start, h);
    let offs = slice::from_raw_parts(offs, h + 1);
    let weights = slice::from_raw_parts(weights, offs[h] as usize);
    let d = slice::from_raw_parts_mut(out, w * h * 4);
    for y in 0..h {
        let row = &weights[offs[y] as usize..offs[y + 1] as usize];
        let y0 = start[y] as usize;
        for x in 0..w {
            let (mut r, mut g, mut b, mut a) = (0f64, 0f64, 0f64, 0f64);
            for (i, wt) in row.iter().enumerate() {
                let m = ((y0 + i) * w + x) * 4;
                let wt = *wt as f64;
                r += mid[m] as f64 * wt;
                g += mid[m + 1] as f64 * wt;
                b += mid[m + 2] as f64 * wt;
                a += mid[m + 3] as f64 * wt;
            }
            let o = (y * w + x) * 4;
            let al = if a.is_nan() { a } else { a.max(0.0).min(1.0) };
            if al > 0.0005 {
                d[o] = clamp_u8(r / al);
                d[o + 1] = clamp_u8(g / al);
                d[o + 2] = clamp_u8(b / al);
            }
            d[o + 3] = clamp_u8(al * 255.0);
        }
    }
}

//! Separable box-blur passes of the Gaussian Blur filter (three box widths, rows then columns). Twin of `boxBlur` in
//! filters.ts: the same running sums in the same order, so every output float matches the TypeScript bit for bit.

use std::slice;

fn box_pass(src: &[f32], dst: &mut [f32], w: usize, h: usize, r: usize, across: bool) {
    if w == 0 || h == 0 {
        return;
    }
    let scale = 1.0f64 / (2 * r + 1) as f64;
    if across {
        let warm = r.min(w - 1);
        for y in 0..h {
            let o = y * w * 4;
            let (mut s0, mut s1, mut s2, mut s3) = (0f64, 0f64, 0f64, 0f64);
            for k in 0..=warm {
                let q = o + k * 4;
                s0 += src[q] as f64;
                s1 += src[q + 1] as f64;
                s2 += src[q + 2] as f64;
                s3 += src[q + 3] as f64;
            }
            for i in 0..w {
                let at = o + i * 4;
                dst[at] = (s0 * scale) as f32;
                dst[at + 1] = (s1 * scale) as f32;
                dst[at + 2] = (s2 * scale) as f32;
                dst[at + 3] = (s3 * scale) as f32;
                let enter = i + r + 1;
                if enter < w {
                    let q = o + enter * 4;
                    s0 += src[q] as f64;
                    s1 += src[q + 1] as f64;
                    s2 += src[q + 2] as f64;
                    s3 += src[q + 3] as f64;
                }
                if i >= r {
                    let q = o + (i - r) * 4;
                    s0 -= src[q] as f64;
                    s1 -= src[q + 1] as f64;
                    s2 -= src[q + 2] as f64;
                    s3 -= src[q + 3] as f64;
                }
            }
        }
        return;
    }
    let row = w * 4;
    let mut sum = vec![0f64; row];
    let warm = r.min(h - 1);
    for k in 0..=warm {
        let line = &src[k * row..k * row + row];
        for (s, v) in sum.iter_mut().zip(line) {
            *s += *v as f64;
        }
    }
    for i in 0..h {
        let at = i * row;
        let enter = i + r + 1;
        let out = &mut dst[at..at + row];
        if enter < h && i >= r {
            let e = &src[enter * row..enter * row + row];
            let l = &src[(i - r) * row..(i - r) * row + row];
            for x in 0..row {
                let mut s = sum[x];
                out[x] = (s * scale) as f32;
                s += e[x] as f64;
                s -= l[x] as f64;
                sum[x] = s;
            }
        } else if enter < h {
            let e = &src[enter * row..enter * row + row];
            for x in 0..row {
                let s = sum[x];
                out[x] = (s * scale) as f32;
                sum[x] = s + e[x] as f64;
            }
        } else if i >= r {
            let l = &src[(i - r) * row..(i - r) * row + row];
            for x in 0..row {
                let s = sum[x];
                out[x] = (s * scale) as f32;
                sum[x] = s - l[x] as f64;
            }
        } else {
            for x in 0..row {
                out[x] = (sum[x] * scale) as f32;
            }
        }
    }
}

/// # Safety
/// `src` and `dst` each hold width*height*4 floats, aligned to 4, inside this module's memory and do not overlap.
#[no_mangle]
pub unsafe extern "C" fn fv_box_blur(src: *const f32, dst: *mut f32, width: u32, height: u32, radius: u32, across: u32) {
    let len = width as usize * height as usize * 4;
    box_pass(slice::from_raw_parts(src, len), slice::from_raw_parts_mut(dst, len), width as usize, height as usize, radius as usize, across != 0);
}

/// Three box blurs (rows into `b`, columns back into `a`) at the radii given; the result is left in `a`.
///
/// # Safety
/// `a` and `b` each hold width*height*4 floats, aligned to 4, inside this module's memory and do not overlap.
#[no_mangle]
pub unsafe extern "C" fn fv_gaussian(a: *mut f32, b: *mut f32, width: u32, height: u32, r0: u32, r1: u32, r2: u32) {
    let len = width as usize * height as usize * 4;
    let a = slice::from_raw_parts_mut(a, len);
    let b = slice::from_raw_parts_mut(b, len);
    for r in [r0, r1, r2] {
        box_pass(a, b, width as usize, height as usize, r as usize, true);
        box_pass(b, a, width as usize, height as usize, r as usize, false);
    }
}

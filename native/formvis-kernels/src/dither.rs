//! The ordered Dither filter: each channel (or the grey) cut to a number of steps by a threshold matrix. Twin of
//! `ditherImage` in filters-lib/dither.ts, in the same operation order; the page builds the matrix and passes it in.

use crate::clamp_u8;
use std::slice;

#[inline]
fn cut(v: f64, t: f64, q: f64, a: f64) -> f64 {
    let s = (v / 255.0) * q;
    let lo = s.floor();
    let frac = s - lo;
    let hard = (if frac > t { lo + 1.0 } else { lo }) / q;
    let soft = s / q;
    soft + (hard - soft) * a
}

/// # Safety
/// `px` holds `len` bytes (a multiple of 4) and `mat` `n * n` entries, inside this module's memory.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn fv_dither(px: *mut u8, len: usize, w: usize, mat: *const u16, n: usize, q: f64, pix: f64, colour: u32, a: f64, ink_r: f64, ink_g: f64, ink_b: f64, paper_r: f64, paper_g: f64, paper_b: f64, ox: f64, oy: f64) {
    let d = slice::from_raw_parts_mut(px, len);
    let m = slice::from_raw_parts(mat, n * n);
    let nf = n as f64;
    let nn = (n * n) as f64;
    let ink = [ink_r, ink_g, ink_b];
    let paper = [paper_r, paper_g, paper_b];
    let mut i = 0usize;
    let mut col = 0usize;
    let mut row = 0usize;
    let mut row_base = 0usize;
    let mut row_ready = false;
    while i + 3 < len {
        if !row_ready {
            let y = row as f64 + oy;
            let fl = (y / pix).floor();
            let ry = fl - (fl / nf).floor() * nf;
            row_base = (ry as usize) * n;
            row_ready = true;
        }
        let x = col as f64 + ox;
        let fl = (x / pix).floor();
        let rx = fl - (fl / nf).floor() * nf;
        let t = (m[row_base + rx as usize] as f64 + 0.5) / nn;
        col += 1;
        if col == w {
            col = 0;
            row += 1;
            row_ready = false;
        }
        if colour != 0 {
            for c in 0..3 {
                d[i + c] = clamp_u8(cut(d[i + c] as f64, t, q, a) * 255.0);
            }
        } else {
            let luma = 0.299 * d[i] as f64 + 0.587 * d[i + 1] as f64 + 0.114 * d[i + 2] as f64;
            let k = cut(luma, t, q, a);
            for c in 0..3 {
                d[i + c] = clamp_u8(ink[c] + (paper[c] - ink[c]) * k);
            }
        }
        i += 4;
    }
}

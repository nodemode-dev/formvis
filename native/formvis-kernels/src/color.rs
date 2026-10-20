//! Colour kernels: Desaturate (HSL lightness grey), the Gradient Map ramp lookup and the one-table pass of Equalize.
//! Twins of `desaturatePixels`, `gradientMapKernel` (without dither) and the last loop of `equalizePixels`.

use crate::js_round;
use std::slice;

/// # Safety
/// `px` holds `len` bytes (a multiple of 4) inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_desaturate(px: *mut u8, len: usize) {
    let mut i = 0usize;
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    {
        use core::arch::wasm32::*;
        while i + 16 <= len {
            let at = px.add(i) as *mut v128;
            let a = v128_load(at);
            let r = i8x16_shuffle::<0, 0, 0, 3, 4, 4, 4, 7, 8, 8, 8, 11, 12, 12, 12, 15>(a, a);
            let g = i8x16_shuffle::<1, 1, 1, 3, 5, 5, 5, 7, 9, 9, 9, 11, 13, 13, 13, 15>(a, a);
            let b = i8x16_shuffle::<2, 2, 2, 3, 6, 6, 6, 7, 10, 10, 10, 11, 14, 14, 14, 15>(a, a);
            let hi = u8x16_max(u8x16_max(r, g), b);
            let lo = u8x16_min(u8x16_min(r, g), b);
            v128_store(at, u8x16_avgr(hi, lo));
            i += 16;
        }
    }
    let px = slice::from_raw_parts_mut(px, len);
    while i + 3 < len {
        let (r, g, b) = (px[i] as u32, px[i + 1] as u32, px[i + 2] as u32);
        let v = ((r.max(g).max(b) + r.min(g).min(b) + 1) >> 1) as u8;
        px[i] = v;
        px[i + 1] = v;
        px[i + 2] = v;
        i += 4;
    }
}

/// # Safety
/// `px` holds `len` bytes (a multiple of 4) and `ramp` 768 bytes (red, green, blue per luminance level) inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_gradient_ramp(px: *mut u8, len: usize, ramp: *const u8) {
    let px = slice::from_raw_parts_mut(px, len);
    let ramp = slice::from_raw_parts(ramp, 768);
    for p in px.chunks_exact_mut(4) {
        if p[3] != 0 {
            let y = js_round(0.2126 * p[0] as f64 + 0.7152 * p[1] as f64 + 0.0722 * p[2] as f64);
            let y = (if y > 255.0 { 255.0 } else { y }) as usize * 3;
            p[0] = ramp[y];
            p[1] = ramp[y + 1];
            p[2] = ramp[y + 2];
        }
    }
}

/// # Safety
/// `px` holds `len` bytes (a multiple of 4) and `table` 256 bytes inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_table_all(px: *mut u8, len: usize, table: *const u8) {
    let px = slice::from_raw_parts_mut(px, len);
    let table = slice::from_raw_parts(table, 256);
    for p in px.chunks_exact_mut(4) {
        p[0] = table[p[0] as usize];
        p[1] = table[p[1] as usize];
        p[2] = table[p[2] as usize];
    }
}

/// Hue/Saturation's per-pixel pass: the 33-point colour cube (`cube`, 33 * 33 * 33 * 3 floats, red fastest) read by trilinear
/// interpolation in the same operation order as `hsvKernel`, so the bytes match.
///
/// # Safety
/// `px` holds `len` bytes (a multiple of 4) and `cube` 107811 floats inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_hsv_cube(px: *mut u8, len: usize, cube: *const f32) {
    const LAST: usize = 32;
    let px = slice::from_raw_parts_mut(px, len);
    let cube = slice::from_raw_parts(cube, 33 * 33 * 33 * 3);
    let step = LAST as f64 / 255.0;
    let node = |r: usize, g: usize, b: usize| ((b * 33 + g) * 33 + r) * 3;
    for p in px.chunks_exact_mut(4) {
        if p[3] == 0 {
            continue;
        }
        let (fr, fg, fb) = (p[0] as f64 * step, p[1] as f64 * step, p[2] as f64 * step);
        let r0 = (LAST - 1).min(fr.floor() as usize);
        let g0 = (LAST - 1).min(fg.floor() as usize);
        let b0 = (LAST - 1).min(fb.floor() as usize);
        let (tr, tg, tb) = (fr - r0 as f64, fg - g0 as f64, fb - b0 as f64);
        let n000 = node(r0, g0, b0);
        let n100 = node(r0 + 1, g0, b0);
        let n010 = node(r0, g0 + 1, b0);
        let n110 = node(r0 + 1, g0 + 1, b0);
        let n001 = node(r0, g0, b0 + 1);
        let n101 = node(r0 + 1, g0, b0 + 1);
        let n011 = node(r0, g0 + 1, b0 + 1);
        let n111 = node(r0 + 1, g0 + 1, b0 + 1);
        for c in 0..3 {
            let v = |n: usize| cube[n + c] as f64;
            let low_front = v(n000) + (v(n100) - v(n000)) * tr;
            let low_back = v(n010) + (v(n110) - v(n010)) * tr;
            let high_front = v(n001) + (v(n101) - v(n001)) * tr;
            let high_back = v(n011) + (v(n111) - v(n011)) * tr;
            let low = low_front + (low_back - low_front) * tg;
            let high = high_front + (high_back - high_front) * tg;
            p[c] = crate::clamp_u8(js_round((low + (high - low) * tb) * 255.0));
        }
    }
}

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

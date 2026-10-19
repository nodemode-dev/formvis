//! Tone kernels: the per-channel lookup that Levels, Curves and Exposure adjustments compile to, and Invert.

use std::slice;

/// # Safety
/// `px` holds `len` bytes (a multiple of 4) and `lut` 768 bytes (red, green and blue tables) inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_lut(px: *mut u8, len: usize, lut: *const u8) {
    let px = slice::from_raw_parts_mut(px, len);
    let lut = slice::from_raw_parts(lut, 768);
    for p in px.chunks_exact_mut(4) {
        if p[3] != 0 {
            p[0] = lut[p[0] as usize];
            p[1] = lut[256 + p[1] as usize];
            p[2] = lut[512 + p[2] as usize];
        }
    }
}

/// # Safety
/// `px` holds `len` bytes (a multiple of 4) inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_invert(px: *mut u8, len: usize) {
    let mut i = 0usize;
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    {
        use core::arch::wasm32::*;
        let flip = u32x4_splat(0x00FF_FFFF);
        while i + 16 <= len {
            let at = px.add(i) as *mut v128;
            v128_store(at, v128_xor(v128_load(at), flip));
            i += 16;
        }
    }
    let px = slice::from_raw_parts_mut(px, len);
    while i + 3 < len {
        px[i] = 255 - px[i];
        px[i + 1] = 255 - px[i + 1];
        px[i + 2] = 255 - px[i + 2];
        i += 4;
    }
}

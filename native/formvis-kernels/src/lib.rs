//! formvis pixel kernels for WebAssembly. Each cargo feature builds one module (`mask`, `tone`, `blur`, `resample`, `dither`, `heal`) that the page
//! loads on first use; every kernel reproduces its TypeScript twin byte for byte, so the page may use either.
//! Build one module: `RUSTFLAGS="-C target-feature=+simd128" cargo build --release --target wasm32-unknown-unknown
//! --no-default-features --features mask`.

use std::alloc::{alloc, dealloc, Layout};

#[cfg(feature = "blur")]
mod blur;
#[cfg(feature = "dither")]
mod dither;
#[cfg(feature = "heal")]
mod heal;
#[cfg(feature = "mask")]
mod mask;
#[cfg(feature = "resample")]
mod resample;
#[cfg(feature = "tone")]
mod tone;

const ALIGN: usize = 16;

/// Version of the calling convention the page checks before it trusts a module.
#[no_mangle]
pub extern "C" fn fv_abi() -> u32 {
    1
}

/// Reserves `len` bytes aligned to 16 inside the module's memory; 0 when the memory cannot grow.
#[no_mangle]
pub extern "C" fn fv_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return ALIGN as *mut u8;
    }
    unsafe { alloc(Layout::from_size_align_unchecked(len, ALIGN)) }
}

/// Gives back a block from `fv_alloc` of the same length.
///
/// # Safety
/// `ptr` and `len` must be exactly what `fv_alloc` returned and was asked for.
#[no_mangle]
pub unsafe extern "C" fn fv_free(ptr: *mut u8, len: usize) {
    if len != 0 && !ptr.is_null() {
        dealloc(ptr, Layout::from_size_align_unchecked(len, ALIGN));
    }
}

/// Storing a number into a Uint8ClampedArray: NaN is 0, the range is clamped and a half goes to the even neighbour.
#[allow(dead_code)]
#[inline]
pub(crate) fn clamp_u8(x: f64) -> u8 {
    if !(x > 0.0) {
        return 0;
    }
    if x >= 255.0 {
        return 255;
    }
    let f = x.floor();
    let d = x - f;
    let r = if d < 0.5 {
        f
    } else if d > 0.5 || (f as u32) % 2 == 1 {
        f + 1.0
    } else {
        f
    };
    r as u8
}

/// JavaScript's Math.round: halves go up, so the results match the page's TypeScript exactly.
#[allow(dead_code)]
#[inline]
pub(crate) fn js_round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 {
        f + 1.0
    } else {
        f
    }
}

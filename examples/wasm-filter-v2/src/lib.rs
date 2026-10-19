//! formvis WebAssembly filter plug-in, ABI v2: the Channel Gain sample.
//!
//! ABI v2 sits beside v1 (examples/wasm-filter). The module exports the same `memory`, `alloc`, `abi_version` (now 2),
//! `schema_ptr` and `schema_len`, and replaces `filter` with
//!
//!   filter2(ptr, width, height, params, desc) -> i32
//!     ptr:    width * height * samples interleaved samples, colour channels first, straight alpha last when desc says so
//!     params: little-endian f32 values in schema order, as in v1
//!     desc:   eight little-endian u32 words: [0] 2, [1] format (0 u8, 1 u16, 2 f32), [2] model (0 rgb, 1 gray, 2 cmyk,
//!             3 lab), [3] colour channels, [4] alpha present, [5] bytes per sample, [6] row stride in bytes,
//!             [7] 1 when the values are linear light (a 32 bit document)
//!     u8 is 0 to 255, u16 is 0 to 65535, f32 is 0 to 1 (CMYK ink: 0 paper, 1 full; linear RGB may pass 1); Lab is f32 only.
//!
//! The schema's `formats`, `models` and `alpha` ("none", "pass" or "process") say what the host may send.

#![no_std]

use core::arch::wasm32;
use core::sync::atomic::{AtomicUsize, Ordering};

extern "C" {
    static __heap_base: u8;
}

#[panic_handler]
fn halt(_: &core::panic::PanicInfo) -> ! {
    wasm32::unreachable()
}

static TOP: AtomicUsize = AtomicUsize::new(0);

#[no_mangle]
pub extern "C" fn abi_version() -> i32 {
    2
}

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut top = TOP.load(Ordering::Relaxed);
    if top == 0 {
        top = core::ptr::addr_of!(__heap_base) as usize;
    }
    let start = (top + 15) & !15;
    let end = start + size;
    let have = wasm32::memory_size(0) * 65536;
    if end > have {
        let more = (end - have + 65535) / 65536;
        if wasm32::memory_grow(0, more) == usize::MAX {
            return core::ptr::null_mut();
        }
    }
    TOP.store(end, Ordering::Relaxed);
    start as *mut u8
}

static SCHEMA: &str = r#"{"abi":2,"id":"channel-gain","name":"Channel Gain","version":"1.0.0","author":"formvis","description":"Scales every colour channel, and the alpha channel, at the document's own depth.","reach":0,"formats":["u8","u16","f32"],"models":["rgb","gray","cmyk"],"alpha":"process","params":[{"key":"gain","label":"Gain (%)","kind":"range","min":-100,"max":100,"step":1,"def":0},{"key":"alpha","label":"Alpha (%)","kind":"range","min":0,"max":100,"step":1,"def":100}]}"#;

#[no_mangle]
pub extern "C" fn schema_ptr() -> *const u8 {
    SCHEMA.as_ptr()
}

#[no_mangle]
pub extern "C" fn schema_len() -> usize {
    SCHEMA.len()
}

fn scale(v: f32, k: f32, top: f32) -> f32 {
    let r = v * k;
    if r < 0.0 {
        0.0
    } else if top > 0.0 && r > top {
        top
    } else {
        r
    }
}

#[no_mangle]
pub extern "C" fn filter2(ptr: *mut u8, width: u32, height: u32, params: *const f32, desc: *const u32) -> i32 {
    if ptr.is_null() || params.is_null() || desc.is_null() || width == 0 || height == 0 {
        return 1;
    }
    let d = unsafe { core::slice::from_raw_parts(desc, 8) };
    let p = unsafe { core::slice::from_raw_parts(params, 2) };
    let (format, colour, has_alpha) = (d[1], d[3] as usize, d[4] != 0);
    let samples = colour + if has_alpha { 1 } else { 0 };
    let count = width as usize * height as usize * samples;
    let gain = 1.0 + p[0] / 100.0;
    let keep = p[1] / 100.0;
    for i in 0..count {
        let alpha = has_alpha && i % samples == colour;
        let k = if alpha { keep } else { gain };
        match format {
            0 => {
                let s = unsafe { core::slice::from_raw_parts_mut(ptr, count) };
                s[i] = scale(s[i] as f32, k, 255.0) as u8;
            }
            1 => {
                let s = unsafe { core::slice::from_raw_parts_mut(ptr as *mut u16, count) };
                s[i] = scale(s[i] as f32, k, 65535.0) as u16;
            }
            2 => {
                let s = unsafe { core::slice::from_raw_parts_mut(ptr as *mut f32, count) };
                s[i] = scale(s[i], k, 0.0);
            }
            _ => return 2,
        }
    }
    0
}

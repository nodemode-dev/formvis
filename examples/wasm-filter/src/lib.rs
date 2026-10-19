//! formvis WebAssembly filter plug-in, ABI v1: the Tint Mix sample.
//!
//! A plug-in is one .wasm module that formvis runs in a sandboxed Worker. It may import only
//! `env.progress(percent: i32)`; it gets no network, no files and no clock. Exports the host needs:
//!
//!   memory                                  the module's linear memory; declare a maximum (at most 256 MiB)
//!   abi_version() -> i32                    must return 1
//!   alloc(size: u32) -> u32                 a pointer to `size` writable bytes, 0 when it cannot
//!   filter(ptr, width, height, params) -> i32
//!                                           ptr: width * height * 4 bytes of 8 bit straight RGBA, filtered in place
//!                                           params: pointer to little-endian f32 values, one per schema parameter
//!                                           in schema order (range: the value, select: the option index,
//!                                           check: 0 or 1); returns 0 on success, any other value is an error code
//!   schema_ptr() -> u32, schema_len() -> u32  the JSON parameter schema as UTF-8 (a sidecar .json file with the
//!                                           same text can be installed instead)
//!
//! Optional: `dealloc(ptr, size)` (unused by the host: each run gets a fresh instance).
//! The host stops a run that passes its time limit and refuses a module whose memory could grow past its cap.

#![no_std]

use core::arch::wasm32;
use core::sync::atomic::{AtomicUsize, Ordering};

#[link(wasm_import_module = "env")]
extern "C" {
    fn progress(percent: i32);
}

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
    1
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

#[no_mangle]
pub extern "C" fn dealloc(_ptr: *mut u8, _size: usize) {}

static SCHEMA: &str = r#"{"abi":1,"id":"tint-mix","name":"Tint Mix","version":"1.0.0","author":"formvis","description":"Mixes a colour into the layer, by mixing, multiplying or screening.","reach":0,"params":[{"key":"mode","label":"Mode","kind":"select","options":[["mix","Mix"],["multiply","Multiply"],["screen","Screen"]],"def":"mix"},{"key":"amount","label":"Amount (%)","kind":"range","min":0,"max":100,"step":1,"def":40},{"key":"red","label":"Red","kind":"range","min":0,"max":255,"step":1,"def":255},{"key":"green","label":"Green","kind":"range","min":0,"max":255,"step":1,"def":140},{"key":"blue","label":"Blue","kind":"range","min":0,"max":255,"step":1,"def":0},{"key":"skip_clear","label":"Leave transparent pixels alone","kind":"check","def":true}]}"#;

#[no_mangle]
pub extern "C" fn schema_ptr() -> *const u8 {
    SCHEMA.as_ptr()
}

#[no_mangle]
pub extern "C" fn schema_len() -> usize {
    SCHEMA.len()
}

fn blend(mode: i32, base: i32, tint: i32) -> i32 {
    match mode {
        1 => base * tint / 255,
        2 => 255 - (255 - base) * (255 - tint) / 255,
        _ => tint,
    }
}

#[no_mangle]
pub extern "C" fn filter(ptr: *mut u8, width: u32, height: u32, params: *const f32) -> i32 {
    if ptr.is_null() || params.is_null() || width == 0 || height == 0 {
        return 1;
    }
    let p = unsafe { core::slice::from_raw_parts(params, 6) };
    let mode = p[0] as i32;
    let amount = (p[1] as i32).clamp(0, 100);
    let tint = [(p[2] as i32).clamp(0, 255), (p[3] as i32).clamp(0, 255), (p[4] as i32).clamp(0, 255)];
    let skip = p[5] >= 0.5;
    let w = width as usize;
    let px = unsafe { core::slice::from_raw_parts_mut(ptr, w * height as usize * 4) };
    for y in 0..height as usize {
        for x in 0..w {
            let i = (y * w + x) * 4;
            if skip && px[i + 3] == 0 {
                continue;
            }
            for c in 0..3 {
                let base = px[i + c] as i32;
                let mixed = blend(mode, base, tint[c]);
                px[i + c] = (base + (mixed - base) * amount / 100).clamp(0, 255) as u8;
            }
        }
        if y % 16 == 0 {
            unsafe { progress((y * 100 / height as usize) as i32) };
        }
    }
    0
}

//! Selection-mask kernels: the Magic Wand's tolerance mask and segment fill, boundary anti-aliasing, Enhance Edge and
//! the Sky sensitivity curve. Twins of `wandMask`, `antialiasMask`, `enhanceEdge` and `sensitivityMask` in kernels.ts.

use crate::js_round;
use std::slice;

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
fn select_all(px: &[u8], reference: [u8; 4], tol: u8, out: &mut [u8]) {
    use core::arch::wasm32::*;
    let count = out.len();
    let want = u32x4_splat(u32::from_le_bytes(reference));
    let limit = u8x16_splat(tol);
    let every = u32x4_splat(0xFFFF_FFFF);
    let mut i = 0;
    while i + 4 <= count {
        unsafe {
            let a = v128_load(px.as_ptr().add(i * 4) as *const v128);
            let diff = u8x16_sub(u8x16_max(a, want), u8x16_min(a, want));
            let within = u8x16_le(diff, limit);
            let whole = i32x4_eq(within, every);
            let narrow = i16x8_narrow_i32x4(whole, whole);
            let bytes = i8x16_narrow_i16x8(narrow, narrow);
            v128_store32_lane::<0>(bytes, out.as_mut_ptr().add(i) as *mut u32);
        }
        i += 4;
    }
    for p in i..count {
        out[p] = if near(px, p, &reference, tol) { 255 } else { 0 };
    }
}

#[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
fn select_all(px: &[u8], reference: [u8; 4], tol: u8, out: &mut [u8]) {
    for p in 0..out.len() {
        out[p] = if near(px, p, &reference, tol) { 255 } else { 0 };
    }
}

#[inline]
fn near(px: &[u8], p: usize, reference: &[u8; 4], tol: u8) -> bool {
    let q = p * 4;
    for c in 0..4 {
        let d = if px[q + c] > reference[c] { px[q + c] - reference[c] } else { reference[c] - px[q + c] };
        if d > tol {
            return false;
        }
    }
    true
}

/// # Safety
/// `rgba` holds width*height*4 bytes and `out` width*height bytes inside this module's memory; the seed lies in the image.
#[no_mangle]
pub unsafe extern "C" fn fv_wand(rgba: *const u8, width: u32, height: u32, seed_x: u32, seed_y: u32, tolerance: u32, contiguous: u32, radius: u32, out: *mut u8) {
    let w = width as usize;
    let h = height as usize;
    let px = slice::from_raw_parts(rgba, w * h * 4);
    let mask = slice::from_raw_parts_mut(out, w * h);
    for m in mask.iter_mut() {
        *m = 0;
    }
    if w == 0 || h == 0 || seed_x >= width || seed_y >= height {
        return;
    }
    let sx = seed_x as usize;
    let sy = seed_y as usize;
    let r = radius as usize;
    let xa = sx.saturating_sub(r);
    let xb = (sx + r).min(w - 1);
    let ya = sy.saturating_sub(r);
    let yb = (sy + r).min(h - 1);
    let mut sum = [0u64; 4];
    for y in ya..=yb {
        for x in xa..=xb {
            let q = (y * w + x) * 4;
            for c in 0..4 {
                sum[c] += px[q + c] as u64;
            }
        }
    }
    let n = ((xb - xa + 1) * (yb - ya + 1)) as f64;
    let mut reference = [0u8; 4];
    for c in 0..4 {
        reference[c] = js_round(sum[c] as f64 / n) as u8;
    }
    let tol = tolerance.min(255) as u8;
    if contiguous == 0 {
        select_all(px, reference, tol, mask);
        return;
    }
    let wi = w as i32;
    let hi = h as i32;
    let open = |mask: &[u8], x: i32, y: i32| -> bool {
        let p = y as usize * w + x as usize;
        mask[p] == 0 && near(px, p, &reference, tol)
    };
    if !open(mask, seed_x as i32, seed_y as i32) {
        return;
    }
    let mut stack: Vec<i32> = Vec::new();
    let push = |stack: &mut Vec<i32>, y: i32, l: i32, rr: i32, dy: i32| {
        if y + dy >= 0 && y + dy < hi {
            stack.extend_from_slice(&[y, l, rr, dy]);
        }
    };
    push(&mut stack, seed_y as i32, seed_x as i32, seed_x as i32, 1);
    push(&mut stack, seed_y as i32 + 1, seed_x as i32, seed_x as i32, -1);
    while let Some(dy) = stack.pop() {
        let rr = stack.pop().unwrap_or(0);
        let l = stack.pop().unwrap_or(0);
        let y = stack.pop().unwrap_or(0) + dy;
        let mut x = l;
        while x >= 0 && open(mask, x, y) {
            mask[y as usize * w + x as usize] = 255;
            x -= 1;
        }
        let mut skipping = x >= l;
        let mut start = x + 1;
        if !skipping {
            if start < l {
                push(&mut stack, y, start, l - 1, -dy);
            }
            x = l + 1;
        }
        loop {
            if !skipping {
                while x < wi && open(mask, x, y) {
                    mask[y as usize * w + x as usize] = 255;
                    x += 1;
                }
                push(&mut stack, y, start, x - 1, dy);
                if x > rr + 1 {
                    push(&mut stack, y, rr + 1, x - 1, -dy);
                }
            }
            skipping = false;
            x += 1;
            while x <= rr && !open(mask, x, y) {
                x += 1;
            }
            start = x;
            if x > rr {
                break;
            }
        }
    }
}

fn smooth_edges(mask: &[u8], w: usize, h: usize, out: &mut [u8]) {
    out.copy_from_slice(mask);
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            let v = mask[i];
            let edge = (x > 0 && mask[i - 1] != v) || (x + 1 < w && mask[i + 1] != v) || (y > 0 && mask[i - w] != v) || (y + 1 < h && mask[i + w] != v);
            if !edge {
                continue;
            }
            let mut sum = 0u32;
            let mut n = 0u32;
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    let xx = x as i32 + dx;
                    let yy = y as i32 + dy;
                    if xx < 0 || yy < 0 || xx >= w as i32 || yy >= h as i32 {
                        continue;
                    }
                    sum += mask[yy as usize * w + xx as usize] as u32;
                    n += 1;
                }
            }
            out[i] = js_round(sum as f64 / n as f64) as u8;
        }
    }
}

/// # Safety
/// `mask` and `out` each hold width*height bytes inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_antialias(mask: *const u8, width: u32, height: u32, out: *mut u8) {
    let len = width as usize * height as usize;
    smooth_edges(slice::from_raw_parts(mask, len), width as usize, height as usize, slice::from_raw_parts_mut(out, len));
}

/// # Safety
/// `mask` and `out` each hold width*height bytes inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_enhance_edge(mask: *const u8, width: u32, height: u32, out: *mut u8) {
    let w = width as usize;
    let h = height as usize;
    let len = w * h;
    let src = slice::from_raw_parts(mask, len);
    let mut cur: Vec<u8> = src.iter().map(|&v| if v >= 128 { 255 } else { 0 }).collect();
    let mut next = vec![0u8; len];
    for _ in 0..2 {
        for y in 0..h {
            for x in 0..w {
                let mut n = 0u32;
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        let xx = x as i32 + dx;
                        let yy = y as i32 + dy;
                        if xx >= 0 && yy >= 0 && (xx as usize) < w && (yy as usize) < h && cur[yy as usize * w + xx as usize] != 0 {
                            n += 1;
                        }
                    }
                }
                next[y * w + x] = if n >= 5 { 255 } else { 0 };
            }
        }
        std::mem::swap(&mut cur, &mut next);
    }
    smooth_edges(&cur, w, h, slice::from_raw_parts_mut(out, len));
}

/// # Safety
/// `mask` and `out` each hold `len` bytes inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_sensitivity(mask: *const u8, len: usize, sensitivity: f64, out: *mut u8) {
    let src = slice::from_raw_parts(mask, len);
    let dst = slice::from_raw_parts_mut(out, len);
    let s = sensitivity.clamp(0.0, 100.0);
    if s == 50.0 {
        dst.copy_from_slice(src);
        return;
    }
    let cut = (255.0 * (1.0 - s / 100.0)).max(1.0);
    if s > 50.0 {
        let k = 127.5 / cut;
        for i in 0..len {
            dst[i] = js_round(src[i] as f64 * k).min(255.0) as u8;
        }
    } else {
        let lift = cut - 127.5;
        for i in 0..len {
            dst[i] = js_round(((src[i] as f64 - lift) * 255.0) / (255.0 - lift)).clamp(0.0, 255.0) as u8;
        }
    }
}

//! The CPU composite loop of the blend modes the canvas has no operation for (`blendPixels` in blend.ts, every mode but Dissolve,
//! whose pattern comes from the page): the same formulas in the same operation order, so the bytes match.

use crate::js_round;
use std::slice;

#[inline]
fn clamp01(v: f64) -> f64 {
    if v < 0.0 { 0.0 } else if v > 1.0 { 1.0 } else { v }
}

#[inline]
fn burn(b: f64, s: f64) -> f64 {
    if b >= 1.0 { 1.0 } else if s <= 0.0 { 0.0 } else { 1.0 - (1.0f64).min((1.0 - b) / s) }
}

#[inline]
fn dodge(b: f64, s: f64) -> f64 {
    if b <= 0.0 { 0.0 } else if s >= 1.0 { 1.0 } else { (1.0f64).min(b / (1.0 - s)) }
}

#[inline]
fn sep(mode: u32, b: f64, s: f64) -> f64 {
    match mode {
        1 => clamp01(b + s - 1.0),
        4 => if s <= 0.5 { burn(b, 2.0 * s) } else { dodge(b, 2.0 * (s - 0.5)) },
        5 => clamp01(b + 2.0 * s - 1.0),
        6 => if s <= 0.5 { b.min(2.0 * s) } else { b.max(2.0 * s - 1.0) },
        7 => if b + s >= 1.0 { 1.0 } else { 0.0 },
        8 => clamp01(b - s),
        9 => if s <= 0.0 { if b <= 0.0 { 0.0 } else { 1.0 } } else { (1.0f64).min(b / s) },
        10 => 1.0 - (1.0 - b - s).abs(),
        11 => if s >= 1.0 { 1.0 } else { (1.0f64).min((b * b) / (1.0 - s)) },
        12 => if b >= 1.0 { 1.0 } else { (1.0f64).min((s * s) / (1.0 - b)) },
        _ => (((js_round(b * 255.0) as i64) ^ (js_round(s * 255.0) as i64)) & 255) as f64 / 255.0,
    }
}

/// Modes: 1 linear burn, 2 darker colour, 3 lighter colour, 4 vivid light, 5 linear light, 6 pin light, 7 hard mix,
/// 8 subtract, 9 divide, 10 negation, 11 reflect, 12 glow, 13 xor.
///
/// # Safety
/// `dst` and `src` each hold `len` bytes (a multiple of 4) inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_blend(dst: *mut u8, src: *const u8, len: usize, mode: u32, opacity: f64) {
    let dst = slice::from_raw_parts_mut(dst, len);
    let src = slice::from_raw_parts(src, len);
    let lum = |r: f64, g: f64, b: f64| 0.3 * r + 0.59 * g + 0.11 * b;
    let mut i = 0usize;
    while i + 3 < len {
        let a_s = (src[i + 3] as f64 / 255.0) * opacity;
        if a_s <= 0.0 {
            i += 4;
            continue;
        }
        let ab = dst[i + 3] as f64 / 255.0;
        let (sr, sg, sb) = (src[i] as f64 / 255.0, src[i + 1] as f64 / 255.0, src[i + 2] as f64 / 255.0);
        let (br, bg, bb) = (dst[i] as f64 / 255.0, dst[i + 1] as f64 / 255.0, dst[i + 2] as f64 / 255.0);
        let (rr, rg, rb);
        if mode == 2 || mode == 3 {
            let darker = lum(sr, sg, sb) < lum(br, bg, bb);
            let take_source = if mode == 2 { darker } else { !darker };
            if take_source { (rr, rg, rb) = (sr, sg, sb); } else { (rr, rg, rb) = (br, bg, bb); }
        } else {
            rr = sep(mode, br, sr);
            rg = sep(mode, bg, sg);
            rb = sep(mode, bb, sb);
        }
        let ao = a_s + ab * (1.0 - a_s);
        if ao <= 0.0 {
            i += 4;
            continue;
        }
        let k1 = a_s * (1.0 - ab);
        let k2 = a_s * ab;
        let k3 = (1.0 - a_s) * ab;
        dst[i] = crate::clamp_u8(js_round(((k1 * sr + k2 * rr + k3 * br) / ao) * 255.0));
        dst[i + 1] = crate::clamp_u8(js_round(((k1 * sg + k2 * rg + k3 * bg) / ao) * 255.0));
        dst[i + 2] = crate::clamp_u8(js_round(((k1 * sb + k2 * rb + k3 * bb) / ao) * 255.0));
        dst[i + 3] = crate::clamp_u8(js_round(ao * 255.0));
        i += 4;
    }
}

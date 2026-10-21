//! The healing brushes' blend mode, the per-pixel part: the full-strength heal recovered from the heal mixed in by the
//! brush's coverage, and Replace's stable per-pixel choice. Twin of the first loop of `healBlend` in engine/index.ts.

use crate::{clamp_u8, js_round};
use std::slice;

#[inline]
fn dissolve_noise(x: i32, y: i32) -> f64 {
    let mut h = x.wrapping_mul(374761393).wrapping_add(y.wrapping_mul(668265263));
    h = (h ^ ((h as u32) >> 13) as i32).wrapping_mul(1274126177);
    ((h ^ ((h as u32) >> 16) as i32) as u32) as f64 / 4294967296.0
}

/// # Safety
/// `before`, `out` and `full` hold `count * 4` bytes and `cov` `count` bytes, inside this module's memory; `full` starts zeroed.
#[no_mangle]
pub unsafe extern "C" fn fv_heal_full(before: *const u8, out: *mut u8, cov: *const u8, count: usize, w: usize, opacity: f64, replace: u32, full: *mut u8) {
    let a = slice::from_raw_parts(before, count * 4);
    let o = slice::from_raw_parts_mut(out, count * 4);
    let cov = slice::from_raw_parts(cov, count);
    let f = slice::from_raw_parts_mut(full, count * 4);
    for i in 0..count {
        let k = (cov[i] as f64 / 255.0) * opacity;
        let j = i * 4;
        if k < 0.02 {
            continue;
        }
        for ch in 0..3 {
            f[j + ch] = clamp_u8(a[j + ch] as f64 + (o[j + ch] as f64 - a[j + ch] as f64) / k);
        }
        f[j + 3] = clamp_u8(js_round(k * 255.0));
        if replace != 0 {
            let take = dissolve_noise((i % w) as i32, (i / w) as i32) < k;
            for ch in 0..3 {
                o[j + ch] = if take { f[j + ch] } else { a[j + ch] };
            }
        }
    }
}

const EXCLUDED: u8 = 0;
const FIXED: u8 = 1;
const FREE: u8 = 2;

fn solve_membrane(v: &mut [f32], state: &[u8], w: usize, h: usize) {
    let mut free = 0usize;
    let mut fixed = 0usize;
    for &s in state {
        if s == FREE {
            free += 1;
        } else if s == FIXED {
            fixed += 1;
        }
    }
    if free == 0 {
        return;
    }
    let mut seeded = false;
    if w > 4 && h > 4 && free > 64 {
        let cw = (w + 1) >> 1;
        let ch = (h + 1) >> 1;
        let cn = cw * ch;
        let mut cv = vec![0f32; cn * 4];
        let mut cstate = vec![0u8; cn];
        let mut hits = vec![0u16; cn];
        for y in 0..h {
            for x in 0..w {
                let p = y * w + x;
                let s = state[p];
                if s == EXCLUDED {
                    continue;
                }
                let q = (y >> 1) * cw + (x >> 1);
                if s == FIXED {
                    hits[q] = hits[q].wrapping_add(1);
                    cstate[q] = FIXED;
                    for c in 0..4 {
                        cv[q * 4 + c] = (cv[q * 4 + c] as f64 + v[p * 4 + c] as f64) as f32;
                    }
                } else if cstate[q] != FIXED {
                    cstate[q] = FREE;
                }
            }
        }
        for q in 0..cn {
            if cstate[q] == FIXED {
                for c in 0..4 {
                    cv[q * 4 + c] = (cv[q * 4 + c] as f64 / hits[q] as f64) as f32;
                }
            }
        }
        solve_membrane(&mut cv, &cstate, cw, ch);
        for y in 0..h {
            for x in 0..w {
                let p = y * w + x;
                if state[p] != FREE {
                    continue;
                }
                let q = (y >> 1) * cw + (x >> 1);
                for c in 0..4 {
                    v[p * 4 + c] = cv[q * 4 + c];
                }
            }
        }
        seeded = true;
    }
    let mut cells: Vec<u32> = Vec::with_capacity(free);
    let mut mean = [0f64; 4];
    for i in 0..state.len() {
        if state[i] == FREE {
            cells.push(i as u32);
        } else if state[i] == FIXED {
            for c in 0..4 {
                mean[c] += v[i * 4 + c] as f64;
            }
        }
    }
    if !seeded {
        for &p in &cells {
            let p = p as usize;
            for c in 0..4 {
                v[p * 4 + c] = if fixed > 0 { (mean[c] / fixed as f64) as f32 } else { 0.0 };
            }
        }
    }
    let sweeps = if seeded { 40 } else { 300 };
    let omega = 1.8f64;
    let last = w * h;
    for _ in 0..sweeps {
        for &p in &cells {
            let p = p as usize;
            let x = p % w;
            let mut n = 0u32;
            let (mut r, mut g, mut b, mut a) = (0f64, 0f64, 0f64, 0f64);
            if x > 0 && state[p - 1] != EXCLUDED {
                let o = (p - 1) * 4;
                r += v[o] as f64;
                g += v[o + 1] as f64;
                b += v[o + 2] as f64;
                a += v[o + 3] as f64;
                n += 1;
            }
            if x < w - 1 && state[p + 1] != EXCLUDED {
                let o = (p + 1) * 4;
                r += v[o] as f64;
                g += v[o + 1] as f64;
                b += v[o + 2] as f64;
                a += v[o + 3] as f64;
                n += 1;
            }
            if p >= w && state[p - w] != EXCLUDED {
                let o = (p - w) * 4;
                r += v[o] as f64;
                g += v[o + 1] as f64;
                b += v[o + 2] as f64;
                a += v[o + 3] as f64;
                n += 1;
            }
            if p + w < last && state[p + w] != EXCLUDED {
                let o = (p + w) * 4;
                r += v[o] as f64;
                g += v[o + 1] as f64;
                b += v[o + 2] as f64;
                a += v[o + 3] as f64;
                n += 1;
            }
            if n == 0 {
                continue;
            }
            let nf = n as f64;
            let o = p * 4;
            v[o] = (v[o] as f64 + omega * (r / nf - v[o] as f64)) as f32;
            v[o + 1] = (v[o + 1] as f64 + omega * (g / nf - v[o + 1] as f64)) as f32;
            v[o + 2] = (v[o + 2] as f64 + omega * (b / nf - v[o + 2] as f64)) as f32;
            v[o + 3] = (v[o + 3] as f64 + omega * (a / nf - v[o + 3] as f64)) as f32;
        }
    }
}

/// The harmonic membrane of the healing tools: every FREE (2) cell of the `w * h` grid of 4 floats ends as the mean of its
/// non-EXCLUDED (0) neighbours while FIXED (1) cells hold, a half-size grid first and then over-relaxation. Twin of `solveMembrane` in engine/retouch.ts.
///
/// # Safety
/// `v` holds `w * h * 4` floats (16-aligned) and `state` `w * h` bytes, inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_membrane(v: *mut f32, state: *const u8, w: usize, h: usize) {
    let n = w * h;
    solve_membrane(slice::from_raw_parts_mut(v, n * 4), slice::from_raw_parts(state, n), w, h);
}

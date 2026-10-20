//! The deep composite's Levels, Curves and Exposure transfer over float pixels, with a power function in plain double
//! arithmetic that `frontend/src/engine/transfer-pow.ts` repeats operation for operation, so both give the same bits.

use std::slice;

const LN2_HI: f64 = 6.93147180369123816490e-01;
const LN2_LO: f64 = 1.90821492927058770002e-10;
const LOG2E: f64 = 1.4426950408889634;

fn flog(mut x: f64) -> f64 {
    let mut e: i32 = 0;
    if x < 2.2250738585072014e-308 {
        x *= 18014398509481984.0;
        e = -54;
    }
    let bits = x.to_bits();
    let hi = (bits >> 32) as u32;
    e += (hi >> 20) as i32 - 1023;
    let mut m = f64::from_bits((bits & 0x0000_0000_ffff_ffff) | ((((hi & 0x000f_ffff) | 0x3ff0_0000) as u64) << 32));
    if m > 1.4142135623730951 {
        m *= 0.5;
        e += 1;
    }
    let s = (m - 1.0) / (m + 1.0);
    let s2 = s * s;
    let mut r = 1.0 / 21.0;
    r = r * s2 + 1.0 / 19.0;
    r = r * s2 + 1.0 / 17.0;
    r = r * s2 + 1.0 / 15.0;
    r = r * s2 + 1.0 / 13.0;
    r = r * s2 + 1.0 / 11.0;
    r = r * s2 + 1.0 / 9.0;
    r = r * s2 + 1.0 / 7.0;
    r = r * s2 + 1.0 / 5.0;
    r = r * s2 + 1.0 / 3.0;
    r = r * s2 + 1.0;
    let lnm = 2.0 * s * r;
    let ef = e as f64;
    ef * LN2_HI + (lnm + ef * LN2_LO)
}

fn pow2(n: i32) -> f64 {
    f64::from_bits(((n + 1023) as u64) << 52)
}

fn fexp(z: f64) -> f64 {
    if z > 709.78 {
        return f64::INFINITY;
    }
    if z < -745.2 {
        return 0.0;
    }
    let k = (z * LOG2E + 0.5).floor();
    let r = (z - k * LN2_HI) - k * LN2_LO;
    let mut p = 1.0 / 6227020800.0;
    p = p * r + 1.0 / 479001600.0;
    p = p * r + 1.0 / 39916800.0;
    p = p * r + 1.0 / 3628800.0;
    p = p * r + 1.0 / 362880.0;
    p = p * r + 1.0 / 40320.0;
    p = p * r + 1.0 / 5040.0;
    p = p * r + 1.0 / 720.0;
    p = p * r + 1.0 / 120.0;
    p = p * r + 1.0 / 24.0;
    p = p * r + 1.0 / 6.0;
    p = p * r + 0.5;
    p = p * r + 1.0;
    p = p * r + 1.0;
    let ki = k as i32;
    let k1 = ki >> 1;
    p * pow2(k1) * pow2(ki - k1)
}

fn fpow(x: f64, y: f64) -> f64 {
    if y == 0.0 {
        return 1.0;
    }
    if x.is_nan() || y.is_nan() {
        return f64::NAN;
    }
    if x == 1.0 {
        return 1.0;
    }
    if y == 1.0 {
        return x;
    }
    if x == 0.0 {
        return if y > 0.0 { 0.0 } else { f64::INFINITY };
    }
    if x < 0.0 {
        return f64::NAN;
    }
    if x == f64::INFINITY {
        return if y > 0.0 { f64::INFINITY } else { 0.0 };
    }
    fexp(y * flog(x))
}

fn jmax(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a > b {
        a
    } else {
        b
    }
}

fn jmin(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a < b {
        a
    } else {
        b
    }
}

fn clamp_to(v: f64, lo: f64, hi: f64) -> f64 {
    jmin(hi, jmax(lo, v))
}

fn clamp01(v: f64) -> f64 {
    if v < 0.0 {
        0.0
    } else if v > 1.0 {
        1.0
    } else {
        v
    }
}

fn to_lin(e: f64) -> f64 {
    if e <= 0.04045 {
        e / 12.92
    } else {
        fpow((e + 0.055) / 1.055, 2.4)
    }
}

fn to_enc(l: f64) -> f64 {
    if l <= 0.0031308 {
        12.92 * l
    } else {
        1.055 * fpow(l, 1.0 / 2.4) - 0.055
    }
}

fn srgb_to_linear(v: f64) -> f64 {
    if v <= 0.04045 {
        v / 12.92
    } else {
        fpow((v + 0.055) / 1.055, 2.4)
    }
}

fn linear_to_srgb(v: f64) -> f64 {
    if v <= 0.0031308 {
        v * 12.92
    } else {
        1.055 * fpow(v, 1.0 / 2.4) - 0.055
    }
}

enum Stage {
    Levels { lo: f64, hi: f64, ig: f64, ol: f64, oh: f64 },
    Curve { x: Vec<f64>, y: Vec<f64>, t: Vec<f64> },
    Exposure { gain: f64, off: f64, ig: f64 },
}

fn eval_stage(s: &Stage, v: f64) -> f64 {
    match s {
        Stage::Levels { lo, hi, ig, ol, oh } => ol + (oh - ol) * fpow(clamp_to((v - lo) / (hi - lo), 0.0, 1.0), *ig),
        Stage::Exposure { gain, off, ig } => 255.0 * clamp_to(to_enc(fpow(jmax(0.0, to_lin(v / 255.0) * gain + off), *ig)), 0.0, 1.0),
        Stage::Curve { x, y, t } => {
            let n = x.len() as isize;
            let mut lo: isize = 0;
            let mut hi: isize = n - 2;
            while lo < hi {
                let mid = (lo + hi + 1) >> 1;
                if x[mid as usize] <= v {
                    lo = mid;
                } else {
                    hi = mid - 1;
                }
            }
            let l = lo as usize;
            let ax = x[l];
            let ay = y[l];
            let by = y[l + 1];
            let h = jmax(1e-6, x[l + 1] - ax);
            let tt = clamp_to((v - ax) / h, 0.0, 1.0);
            let t0 = t[l];
            let t1 = t[l + 1];
            let c1 = h * t0;
            let c2 = 3.0 * (by - ay) - h * (2.0 * t0 + t1);
            let c3 = 2.0 * (ay - by) + h * (t0 + t1);
            clamp_to(((c3 * tt + c2) * tt + c1) * tt + ay, 0.0, 255.0)
        }
    }
}

fn eval_chain(chain: &[Stage], level: f64) -> f64 {
    let mut v = level;
    for s in chain {
        v = eval_stage(s, v);
    }
    v
}

fn parse(prog: &[f64]) -> Vec<Vec<Stage>> {
    let mut at = 0usize;
    let mut chains = Vec::with_capacity(4);
    for _ in 0..4 {
        let count = prog[at] as usize;
        at += 1;
        let mut chain = Vec::with_capacity(count);
        for _ in 0..count {
            let kind = prog[at] as u32;
            at += 1;
            if kind == 1 {
                chain.push(Stage::Levels { lo: prog[at], hi: prog[at + 1], ig: prog[at + 2], ol: prog[at + 3], oh: prog[at + 4] });
                at += 5;
            } else if kind == 3 {
                chain.push(Stage::Exposure { gain: prog[at], off: prog[at + 1], ig: prog[at + 2] });
                at += 3;
            } else {
                let n = prog[at] as usize;
                at += 1;
                let x = prog[at..at + n].to_vec();
                let y = prog[at + n..at + 2 * n].to_vec();
                let t = prog[at + 2 * n..at + 3 * n].to_vec();
                at += 3 * n;
                chain.push(Stage::Curve { x, y, t });
            }
        }
        chains.push(chain);
    }
    chains
}

/// # Safety
/// `buf` holds `npx * s` floats, `cov` is 0 or `npx` floats, `prog` is `proglen` doubles written by `encodeChains`, all inside this module's memory.
#[no_mangle]
pub unsafe extern "C" fn fv_transfer(buf: *mut f32, npx: usize, s: usize, a: usize, op: f64, cov: *const f32, paper: u32, linear: u32, prog: *const f64, proglen: usize) {
    let out = slice::from_raw_parts_mut(buf, npx * s);
    let chains = parse(slice::from_raw_parts(prog, proglen));
    let cov = if cov.is_null() { None } else { Some(slice::from_raw_parts(cov, npx)) };
    for j in 0..npx {
        let i = j * s;
        let k = op * cov.map_or(1.0, |c| c[j] as f64);
        if k <= 0.0 {
            continue;
        }
        if linear != 0 {
            let m = jmax(jmax(jmax(1.0, out[i] as f64), out[i + 1] as f64), out[i + 2] as f64);
            for c in 0..3 {
                let u = jmax(0.0, out[i + c] as f64 / m);
                let nu = srgb_to_linear(jmax(0.0, jmin(1.0, eval_chain(&chains[c], linear_to_srgb(jmin(1.0, u)) * 255.0) / 255.0)));
                let o = out[i + c] as f64;
                out[i + c] = (o + (nu * m - o) * k) as f32;
            }
        } else {
            for c in 0..a {
                let raw = out[i + c] as f64;
                let v = if paper != 0 { 1.0 - raw } else { raw };
                let nv = clamp01(eval_chain(&chains[c], v * 255.0) / 255.0);
                let r = v + (nv - v) * k;
                out[i + c] = (if paper != 0 { 1.0 - r } else { r }) as f32;
            }
        }
    }
}

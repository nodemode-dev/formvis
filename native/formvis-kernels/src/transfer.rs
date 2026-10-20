//! The deep composite's Levels, Curves and Exposure transfer over float pixels, with a power function in plain double
//! arithmetic that `frontend/src/engine/transfer-pow.ts` repeats operation for operation, so both give the same bits.

use std::slice;

const LN2_HI: f64 = 6.93147180369123816490e-01;
const LN2_LO: f64 = 1.90821492927058770002e-10;
const LN2_HI32: f64 = LN2_HI / 32.0;
const LN2_LO32: f64 = LN2_LO / 32.0;
const LOG2E32: f64 = 1.4426950408889634 * 32.0;

const LOG_INV: [f64; 64] = [0.9922480620155039, 0.9770992366412213, 0.9624060150375939, 0.9481481481481482, 0.9343065693430657, 0.920863309352518, 0.9078014184397163, 0.8951048951048951, 0.8827586206896552, 0.8707482993197279, 0.8590604026845637, 0.847682119205298, 0.8366013071895425, 0.8258064516129032, 0.8152866242038217, 0.8050314465408805, 0.7950310559006211, 0.7852760736196319, 0.7757575757575758, 0.7664670658682635, 0.757396449704142, 0.7485380116959064, 0.7398843930635838, 0.7314285714285714, 0.7231638418079096, 0.7150837988826816, 0.7071823204419889, 0.6994535519125683, 0.6918918918918919, 0.6844919786096256, 0.6772486772486772, 0.6701570680628273, 0.6632124352331606, 0.6564102564102564, 0.649746192893401, 0.6432160804020101, 0.6368159203980099, 0.6305418719211823, 0.624390243902439, 0.6183574879227053, 0.6124401913875598, 0.6066350710900474, 0.6009389671361502, 0.5953488372093023, 0.5898617511520737, 0.5844748858447488, 0.579185520361991, 0.5739910313901345, 0.5688888888888889, 0.5638766519823789, 0.5589519650655022, 0.5541125541125541, 0.5493562231759657, 0.5446808510638298, 0.540084388185654, 0.5355648535564853, 0.5311203319502075, 0.5267489711934157, 0.5224489795918368, 0.5182186234817814, 0.5140562248995983, 0.5099601593625498, 0.5059288537549407, 0.5019607843137255];
const LOG_OFF: [f64; 64] = [0.007782140442054963, 0.023167059281534418, 0.03831886430213666, 0.05324451451881224, 0.06795066190850778, 0.08244366921107454, 0.09672962645855114, 0.11081436634029011, 0.12470347850095725, 0.1384023228591192, 0.151916042025842, 0.16524957289530717, 0.17840765747281825, 0.19139485299962947, 0.20421554142869083, 0.2168739383006143, 0.2293741010648459, 0.24171993688714513, 0.25391520998096345, 0.2659635484971379, 0.2778684510034563, 0.2896332925830427, 0.30126133057816185, 0.3127557100038969, 0.324119468654212, 0.3353555419211378, 0.3464667673462086, 0.3574558889218038, 0.36832556115870757, 0.3790783529349695, 0.38971675114002524, 0.40024316412701266, 0.4106599249852683, 0.42096929464412963, 0.43117346481837143, 0.4412745608048752, 0.4512746441394586, 0.46117571512217015, 0.470979715218791, 0.48068852934575196, 0.4903039880451939, 0.49982786955644926, 0.5092619017898079, 0.5186077642080457, 0.5278670896208424, 0.5370414658968837, 0.5461324375981356, 0.5551415075405016, 0.564070138284803, 0.5729197535617854, 0.5816917396346225, 0.5903874466021763, 0.5990081896460834, 0.6075552502245418, 0.616029877215514, 0.6244332880118936, 0.6327666695710378, 0.6410311794209312, 0.6492279466251097, 0.65735807270836, 0.6654226325450905, 0.6734226752121667, 0.6813592248079031, 0.689233281238809];
const EXP_TAB: [f64; 32] = [1.0, 1.0218971486541166, 1.0442737824274138, 1.0671404006768237, 1.0905077326652577, 1.1143867425958924, 1.1387886347566916, 1.1637248587775775, 1.189207115002721, 1.215247359980469, 1.241857812073484, 1.2690509571917332, 1.2968395546510096, 1.3252366431597413, 1.3542555469368927, 1.383909881963832, 1.4142135623730951, 1.4451808069770467, 1.4768261459394993, 1.5091644275934228, 1.5422108254079407, 1.5759808451078865, 1.6104903319492543, 1.645755478153965, 1.681792830507429, 1.718619298122478, 1.7562521603732995, 1.7947090750031072, 1.8340080864093424, 1.8741676341103, 1.9152065613971474, 1.9571441241754002];

fn flog(mut x: f64) -> f64 {
    let mut e: i32 = 0;
    if x < 2.2250738585072014e-308 {
        x *= 18014398509481984.0;
        e = -54;
    }
    let bits = x.to_bits();
    let hi = (bits >> 32) as u32;
    let b = (hi >> 20) as i32;
    e += b - 1023;
    let i = ((hi >> 14) & 63) as usize;
    let r = x * two(1023 - b) * LOG_INV[i] - 1.0;
    let r2 = r * r;
    let q = (r * (1.0 / 3.0) - 0.5 + r2 * (r * 0.2 - 0.25)) + r2 * r2 * (r * (1.0 / 7.0) - 1.0 / 6.0);
    let ef = e as f64;
    ef * LN2_HI + (LOG_OFF[i] + (r + r * r * q) + ef * LN2_LO)
}

fn two(n: i32) -> f64 {
    if n >= -1022 {
        f64::from_bits(((n + 1023) as u64) << 52)
    } else {
        f64::from_bits(1u64 << (n + 1074))
    }
}

fn fexp(z: f64) -> f64 {
    if z > 709.78 {
        return f64::INFINITY;
    }
    if z < -745.2 {
        return 0.0;
    }
    let kf = (z * LOG2E32 + 0.5).floor();
    let r = (z - kf * LN2_HI32) - kf * LN2_LO32;
    let r2 = r * r;
    let p = (r + 1.0 + r2 * (r * (1.0 / 6.0) + 0.5)) + r2 * r2 * ((r * (1.0 / 120.0) + 1.0 / 24.0) + r2 * (1.0 / 720.0));
    let kk = kf as i32;
    let k = kk >> 5;
    let t = EXP_TAB[(kk & 31) as usize] * p;
    if k > -1000 && k < 1000 {
        return t * two(k);
    }
    let k1 = k >> 1;
    t * two(k1) * two(k - k1)
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

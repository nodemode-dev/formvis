use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::process::ExitCode;
use std::time::Instant;

use formvis_render::composite::{Affine, BlendIf, Blender, Grain};
use formvis_render::document::{Document, LayerSpec};
use formvis_render::{bench, budget, enabled, native_force, Gpu};
use serde_json::{json, Value};

const BLEND_NAMES: [&str; 30] = [
    "normal", "dissolve", "darken", "multiply", "color-burn", "linear-burn", "darker-color", "lighten", "screen", "color-dodge",
    "linear-dodge", "lighter-color", "overlay", "soft-light", "hard-light", "vivid-light", "linear-light", "pin-light", "hard-mix",
    "difference", "exclusion", "subtract", "divide", "hue", "saturation", "color", "luminosity", "negation", "reflect", "glow",
];

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

fn fail(msg: &str) -> ExitCode {
    println!("{}", json!({ "ok": false, "error": msg }));
    ExitCode::from(1)
}

fn backend(gpu: &Gpu) -> String {
    format!("{:?}", gpu.info.backend)
}

fn decode_png(path: &str) -> Result<(u32, u32, Vec<u8>), String> {
    let file = File::open(path).map_err(|e| format!("cannot read {path}: {e}"))?;
    let mut decoder = png::Decoder::new(BufReader::new(file));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|e| format!("cannot decode {path}: {e}"))?;
    let size = reader.output_buffer_size().ok_or_else(|| format!("{path} is too large"))?;
    let mut buf = vec![0u8; size];
    let frame = reader.next_frame(&mut buf).map_err(|e| format!("cannot decode {path}: {e}"))?;
    let (w, h) = (frame.width as usize, frame.height as usize);
    let mut rgba = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        let row = &buf[y * frame.line_size..(y + 1) * frame.line_size];
        match frame.color_type {
            png::ColorType::Rgba => rgba.extend_from_slice(&row[..w * 4]),
            png::ColorType::Rgb => row[..w * 3].chunks_exact(3).for_each(|p| rgba.extend_from_slice(&[p[0], p[1], p[2], 255])),
            png::ColorType::GrayscaleAlpha => row[..w * 2].chunks_exact(2).for_each(|p| rgba.extend_from_slice(&[p[0], p[0], p[0], p[1]])),
            png::ColorType::Grayscale => row[..w].iter().for_each(|&g| rgba.extend_from_slice(&[g, g, g, 255])),
            png::ColorType::Indexed => return Err(format!("{path} has an unexpanded palette")),
        }
    }
    Ok((frame.width, frame.height, rgba))
}

fn encode_png(path: &str, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    let file = File::create(path).map_err(|e| format!("cannot write {path}: {e}"))?;
    let mut encoder = png::Encoder::new(BufWriter::new(file), width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(rgba).map_err(|e| e.to_string())
}

fn blend_mode(name: &str) -> Option<u32> {
    let key = name.to_ascii_lowercase().replace('_', "-");
    BLEND_NAMES.iter().position(|n| *n == key).map(|i| i as u32)
}

fn matrix_of(v: &Value) -> Option<Affine> {
    let m: Vec<f32> = v.as_array()?.iter().filter_map(|n| n.as_f64()).map(|n| n as f32).collect();
    (m.len() == 6).then(|| Affine { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] })
}

fn put_png(doc: &mut Document, gpu: &Gpu, id: &str, path: &str, x: i64, y: i64, cw: u32, ch: u32, whole: bool) -> Result<(), String> {
    let (lw, lh, px) = decode_png(path)?;
    if whole {
        doc.put_pixels(gpu, id, lw, lh, 0, 0, lw, lh, &px);
        return Ok(());
    }
    let (x0, y0) = (x.max(0), y.max(0));
    let (x1, y1) = ((x + lw as i64).min(cw as i64), (y + lh as i64).min(ch as i64));
    doc.put_pixels(gpu, id, cw, ch, 0, 0, 0, 0, &[]);
    if x1 > x0 && y1 > y0 {
        let (w, h) = ((x1 - x0) as usize, (y1 - y0) as usize);
        let mut crop = Vec::with_capacity(w * h * 4);
        for row in 0..h {
            let sy = (y0 - y) as usize + row;
            let sx = (x0 - x) as usize;
            crop.extend_from_slice(&px[(sy * lw as usize + sx) * 4..(sy * lw as usize + sx + w) * 4]);
        }
        doc.put_pixels(gpu, id, cw, ch, x0 as u32, y0 as u32, w as u32, h as u32, &crop);
    }
    Ok(())
}

fn table_of(v: &Value, key: &str) -> Result<[u8; 256], String> {
    let a: Vec<u8> = v[key].as_array().ok_or_else(|| format!("table needs {key}"))?.iter().filter_map(|n| n.as_u64()).map(|n| n as u8).collect();
    a.try_into().map_err(|_| format!("table {key} has 256 values"))
}

fn load_spec(spec: &Value, gpu: &Gpu, max_pixels: u64) -> Result<(u32, u32, Document), String> {
    let dim = |key: &str| spec[key].as_u64().filter(|v| *v >= 1 && *v <= u32::MAX as u64).map(|v| v as u32).ok_or_else(|| format!("{key} must be a positive integer"));
    let (cw, ch) = (dim("width")?, dim("height")?);
    if cw as u64 * ch as u64 > max_pixels {
        return Err(format!("a {cw} by {ch} canvas is over this machine's budget of {max_pixels} pixels"));
    }
    let layers = spec["layers"].as_array().ok_or("layers must be a list")?;
    let mut doc = Document::new(cw, ch);
    let order = load_layers(layers, "", &mut doc, gpu, cw, ch)?;
    doc.set_stack(order);
    Ok((cw, ch, doc))
}

fn load_layers(layers: &[Value], prefix: &str, doc: &mut Document, gpu: &Gpu, cw: u32, ch: u32) -> Result<Vec<LayerSpec>, String> {
    let mut order = Vec::new();
    for (i, l) in layers.iter().enumerate() {
        let id = format!("{prefix}L{i}");
        let mut s = LayerSpec::pixels(&id);
        s.opacity = l["opacity"].as_f64().unwrap_or(1.0).clamp(0.0, 1.0) as f32;
        let name = l["blend"].as_str().unwrap_or("normal");
        s.mode = blend_mode(name).ok_or_else(|| format!("layer {i} has an unknown blend mode {name}"))?;
        if let Some(sub) = l["group"].as_array() {
            s.group = Some(load_layers(sub, &format!("{id}_"), doc, gpu, cw, ch)?);
        } else if let Some(g) = l.get("grain") {
            let f = |key: &str| g[key].as_f64().unwrap_or(0.0) as f32;
            let u = |key: &str| g[key].as_u64().unwrap_or(0) as u32;
            s.grain = Some(Grain { strength: f("strength"), rough: f("rough"), colour: f("colour"), speckle: f("speckle"), cell: f("cell"), amount: f("amount"), seed: u("seed"), fine_seed: u("fineSeed"), spec_seed: u("specSeed") });
        } else if let Some(level) = l["threshold"].as_u64() {
            s.threshold = Some(level as u32);
        } else if l.get("table").is_some() {
            let t = &l["table"];
            doc.put_table(gpu, &id, &table_of(t, "red")?, &table_of(t, "green")?, &table_of(t, "blue")?);
            s.table = Some(id.clone());
        } else {
            let path = l["path"].as_str().ok_or_else(|| format!("layer {i} needs a path"))?;
            s.transform = matrix_of(&l["matrix"]);
            put_png(doc, gpu, &id, path, l["x"].as_i64().unwrap_or(0), l["y"].as_i64().unwrap_or(0), cw, ch, s.transform.is_some())?;
        }
        if let Some(m) = l.get("mask") {
            let mid = format!("{prefix}M{i}");
            let path = m["path"].as_str().ok_or_else(|| format!("layer {i} mask needs a path"))?;
            s.mask_at = matrix_of(&m["matrix"]);
            put_png(doc, gpu, &mid, path, 0, 0, cw, ch, s.mask_at.is_some())?;
            s.mask = Some(mid);
        }
        for (k, f) in l["folders"].as_array().into_iter().flatten().enumerate() {
            let fid = format!("{prefix}F{i}_{k}");
            let path = f["path"].as_str().ok_or_else(|| format!("layer {i} folder mask needs a path"))?;
            let at = matrix_of(&f["matrix"]);
            put_png(doc, gpu, &fid, path, 0, 0, cw, ch, at.is_some())?;
            s.folders.push((fid, at));
        }
        if let Some(b) = l["clipTo"].as_u64() {
            s.clip_to = Some(format!("{prefix}L{b}"));
        }
        if let Some(b) = l.get("blendIf") {
            let four = |key: &str| -> Result<[f32; 4], String> {
                let v: Vec<f32> = b[key].as_array().ok_or_else(|| format!("blendIf needs {key}"))?.iter().filter_map(|n| n.as_f64()).map(|n| n as f32).collect();
                v.try_into().map_err(|_| format!("blendIf {key} has 4 values"))
            };
            s.blend_if = Some(BlendIf { channel: b["channel"].as_u64().unwrap_or(1) as u32, this_layer: four("thisLayer")?, underlying: four("underlying")? });
        }
        s.ch_off = l["chOff"].as_u64().unwrap_or(0) as u32;
        if let Some(k) = l.get("knockout") {
            let back = k["back"].as_array().map(|b| load_layers(b, &format!("{id}k_"), doc, gpu, cw, ch)).transpose()?.unwrap_or_default();
            s.knockout = Some((k["opacity"].as_f64().unwrap_or(1.0).clamp(0.0, 1.0) as f32, back));
        }
        order.push(s);
    }
    Ok(order)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("info") => {
            let b = budget::system_budget();
            let out = match native_force() {
                Some(n) => json!({
                    "ok": true,
                    "enabled": enabled(),
                    "adapter": n.gpu.info.name,
                    "backend": backend(&n.gpu),
                    "device": format!("{:?}", n.gpu.info.device_type),
                    "ramBytes": b.ram,
                    "budgetBytes": b.bytes,
                    "maxPixels": b.max_pixels,
                    "maxTexture": n.gpu.limits.max_texture_dimension_2d,
                }),
                None => json!({
                    "ok": false,
                    "enabled": enabled(),
                    "error": "no GPU adapter",
                    "ramBytes": b.ram,
                    "budgetBytes": b.bytes,
                    "maxPixels": b.max_pixels,
                }),
            };
            println!("{out}");
            ExitCode::SUCCESS
        }
        Some("composite") => {
            let Some(spec_path) = arg(&args, "--spec") else { return fail("--spec is required") };
            let Some(out_path) = arg(&args, "--out") else { return fail("--out is required") };
            let spec: Value = match std::fs::read(&spec_path).map_err(|e| e.to_string()).and_then(|b| serde_json::from_slice(&b).map_err(|e| e.to_string())) {
                Ok(v) => v,
                Err(e) => return fail(&format!("cannot read {spec_path}: {e}")),
            };
            let started = Instant::now();
            let Some(n) = native_force() else { return fail("no GPU adapter") };
            let (w, h, doc) = match load_spec(&spec, &n.gpu, n.budget.max_pixels) {
                Ok(v) => v,
                Err(e) => return fail(&e),
            };
            let stack = doc.stack();
            let pixels = Blender::new(&n.gpu).blend_region(&n.gpu, &stack, 0, 0, w, h);
            if let Err(e) = encode_png(&out_path, w, h, &pixels) {
                return fail(&e);
            }
            println!(
                "{}",
                json!({ "ok": true, "width": w, "height": h, "layers": stack.len(), "adapter": n.gpu.info.name, "backend": backend(&n.gpu), "ms": started.elapsed().as_millis() as u64 })
            );
            ExitCode::SUCCESS
        }
        Some("bench") => {
            let size: u32 = arg(&args, "--size").and_then(|v| v.parse().ok()).unwrap_or(4000).clamp(256, 16000);
            let updates: usize = arg(&args, "--updates").and_then(|v| v.parse().ok()).unwrap_or(200).clamp(1, 5000);
            let Some(n) = native_force() else { return fail("no GPU adapter") };
            let t = bench::summarize(&bench::run(&n.gpu, size, updates));
            println!(
                "{}",
                json!({
                    "ok": true,
                    "adapter": n.gpu.info.name,
                    "backend": backend(&n.gpu),
                    "size": size,
                    "updates": updates,
                    "medianMs": t.median,
                    "p95Ms": t.p95,
                    "worstMs": t.worst,
                })
            );
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("formvis-render info | composite --spec stack.json --out out.png | bench [--size 4000] [--updates 200]");
            ExitCode::from(2)
        }
    }
}

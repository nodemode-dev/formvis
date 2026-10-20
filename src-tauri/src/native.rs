//! The native canvas in the desktop window (Phase 20): the shell hosts formvis-render and relays the app's document to
//! its mirror. Opt-in: nothing is created until the app calls native_start (the native renderer chosen in Preferences),
//! so the desktop app is unchanged otherwise. Not yet verified on macOS: there the renderer's Metal layer must sit
//! beneath the web view for the interface to show over it, which only the owner's Mac can confirm.

use serde::Deserialize;
use formvis_render::composite::{Affine, BlendIf, Blender, Grain};
use formvis_render::display::{Checker, Display, Presented, View};
use formvis_render::document::{Document, LayerSpec};
use formvis_render::Gpu;
use std::sync::Mutex;

pub struct Native {
    gpu: Gpu,
    display: Display,
    blender: Blender,
    doc: Document,
    /// The window size the surface was last configured for.
    size: (u32, u32),
}

#[derive(Default)]
pub struct NativeState(pub Mutex<Option<Native>>);

const NOT_STARTED: &str = "The native canvas is not started.";

/// Starts the native canvas in this window; returns the adapter's name and backend.
#[tauri::command]
pub fn native_start(window: tauri::WebviewWindow, state: tauri::State<NativeState>) -> Result<String, String> {
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let (gpu, surface) = Gpu::for_window(window.clone()).ok_or("No graphics processor here can draw into this window.")?;
    let display = Display::new(&gpu, surface, size.width, size.height);
    let blender = Blender::new(&gpu);
    let info = format!("{} ({:?})", gpu.info.name, gpu.info.backend);
    *state.0.lock().map_err(|e| e.to_string())? = Some(Native { gpu, display, blender, doc: Document::new(0, 0), size: (size.width, size.height) });
    Ok(info)
}

#[tauri::command]
pub fn native_stop(state: tauri::State<NativeState>) {
    if let Ok(mut s) = state.0.lock() {
        *s = None;
    }
}

/// A new document of this size: the mirror starts empty.
#[tauri::command]
pub fn native_doc(width: u32, height: u32, state: tauri::State<NativeState>) -> Result<(), String> {
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    let n = s.as_mut().ok_or(NOT_STARTED)?;
    n.doc = Document::new(width, height);
    Ok(())
}

fn header(req: &tauri::ipc::Request, name: &str) -> Result<u32, String> {
    req.headers().get(name).and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok()).ok_or(format!("missing or bad header {name}"))
}

/// Pixels for a layer, as raw bytes (straight RGBA8, w by h at x, y in the layer's own lw by lh pixels); the id and
/// geometry come as headers (x-id, x-lw, x-lh, x-x, x-y, x-w, x-h), so large images are not expanded into JSON.
#[tauri::command]
pub fn native_put(request: tauri::ipc::Request, state: tauri::State<NativeState>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("native_put takes raw bytes".into()) };
    let id = request.headers().get("x-id").and_then(|v| v.to_str().ok()).ok_or("missing header x-id")?.to_string();
    let (lw, lh, x, y, w, h) = (header(&request, "x-lw")?, header(&request, "x-lh")?, header(&request, "x-x")?, header(&request, "x-y")?, header(&request, "x-w")?, header(&request, "x-h")?);
    if bytes.len() != (w as usize) * (h as usize) * 4 || x.saturating_add(w) > lw || y.saturating_add(h) > lh {
        return Err("the pixels do not match their geometry".into());
    }
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    let n = s.as_mut().ok_or(NOT_STARTED)?;
    n.doc.put_pixels(&n.gpu, &id, lw, lh, x, y, w, h, bytes);
    Ok(())
}

/// An adjustment's table: 256 values for each of red, green and blue.
#[tauri::command]
pub fn native_table(id: String, red: Vec<u8>, green: Vec<u8>, blue: Vec<u8>, state: tauri::State<NativeState>) -> Result<(), String> {
    let as_table = |v: &[u8]| -> Result<[u8; 256], String> { v.try_into().map_err(|_| "a table has 256 values".to_string()) };
    let (r, g, b) = (as_table(&red)?, as_table(&green)?, as_table(&blue)?);
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    let n = s.as_mut().ok_or(NOT_STARTED)?;
    n.doc.put_table(&n.gpu, &id, &r, &g, &b);
    Ok(())
}

/// An adjustment's 3D table as raw bytes: 52 by 52 by 52 nodes of straight RGBA8; the id comes as the header x-id.
#[tauri::command]
pub fn native_table3(request: tauri::ipc::Request, state: tauri::State<NativeState>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("native_table3 takes raw bytes".into()) };
    let id = request.headers().get("x-id").and_then(|v| v.to_str().ok()).ok_or("missing header x-id")?.to_string();
    if bytes.len() != 52 * 52 * 52 * 4 {
        return Err("a 3D table has 52 by 52 by 52 nodes".into());
    }
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    let n = s.as_mut().ok_or(NOT_STARTED)?;
    n.doc.put_table3(&n.gpu, &id, bytes);
    Ok(())
}

/// One stack entry from the app.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecIn {
    id: String,
    mode: u32,
    opacity: f32,
    visible: bool,
    /// [a, b, c, d, e, f]: the layer's pixel (x, y) lands at (a x + b y + c, d x + e y + f).
    transform: Option<[f32; 6]>,
    mask: Option<String>,
    clip_to: Option<String>,
    table: Option<String>,
    /// The mask's placement, as `transform`; None: the mask's pixels are the document's.
    mask_transform: Option<[f32; 6]>,
    /// A Threshold adjustment's level.
    threshold: Option<u32>,
    /// The masks of the folders around the layer: (mask id, placement).
    #[serde(default)]
    folders: Vec<(String, Option<[f32; 6]>)>,
    /// A folder or clipped group's layers, composited alone and drawn as one layer at this entry's opacity and mode.
    group: Option<Vec<SpecIn>>,
    /// Blend If: the channel (1 grey, 2 to 4 red, green, blue) and the four-point ranges of the layer and of what is beneath.
    blend_if: Option<BlendIfIn>,
    /// A Grain adjustment layer's numbers.
    grain: Option<GrainIn>,
    /// Advanced Blending channels turned off: bit 0 red, 1 green, 2 blue.
    #[serde(default)]
    ch_off: u32,
    /// Knockout: the layer's opacity and the layers that show through its coverage.
    knockout: Option<KnockoutIn>,
    /// A Shadows/Highlights, HDR Toning or Clarity adjustment layer.
    hood: Option<HoodIn>,
}

#[derive(Deserialize)]
pub struct HoodIn {
    kind: u32,
    rgb: bool,
    radii: Vec<[u32; 2]>,
    p: Vec<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlendIfIn {
    channel: u32,
    this_layer: [f32; 4],
    underlying: [f32; 4],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrainIn {
    strength: f32,
    rough: f32,
    colour: f32,
    speckle: f32,
    cell: f32,
    amount: f32,
    seed: u32,
    fine_seed: u32,
    spec_seed: u32,
}

#[derive(Deserialize)]
pub struct KnockoutIn {
    opacity: f32,
    back: Vec<SpecIn>,
}

#[tauri::command]
pub fn native_stack(stack: Vec<SpecIn>, state: tauri::State<NativeState>) -> Result<(), String> {
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    let n = s.as_mut().ok_or(NOT_STARTED)?;
    n.doc.set_stack(stack.into_iter().map(spec_of).collect());
    Ok(())
}

fn spec_of(e: SpecIn) -> LayerSpec {
    let affine = |[a, b, c, d, e, f]: [f32; 6]| Affine { a, b, c, d, e, f };
    LayerSpec {
        id: e.id,
        mode: e.mode,
        opacity: e.opacity,
        visible: e.visible,
        transform: e.transform.map(affine),
        mask: e.mask,
        clip_to: e.clip_to,
        table: e.table,
        mask_at: e.mask_transform.map(affine),
        threshold: e.threshold,
        folders: e.folders.into_iter().map(|(id, m)| (id, m.map(affine))).collect(),
        group: e.group.map(|g| g.into_iter().map(spec_of).collect()),
        blend_if: e.blend_if.map(|b| BlendIf { channel: b.channel, this_layer: b.this_layer, underlying: b.underlying }),
        grain: e.grain.map(|g| Grain { strength: g.strength, rough: g.rough, colour: g.colour, speckle: g.speckle, cell: g.cell, amount: g.amount, seed: g.seed, fine_seed: g.fine_seed, spec_seed: g.spec_seed }),
        ch_off: e.ch_off,
        knockout: e.knockout.map(|k| (k.opacity, k.back.into_iter().map(spec_of).collect())),
        hood: e.hood.map(|h| (h.kind, h.rgb, h.radii, h.p)),
    }
}

#[tauri::command]
pub fn native_remove(id: String, state: tauri::State<NativeState>) -> Result<(), String> {
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    s.as_mut().ok_or(NOT_STARTED)?.doc.remove(&id);
    Ok(())
}

/// Draws the document at this pan and zoom (window pixels), over the checkerboard (colours 0 to 1, cell in window
/// pixels), at the window's current size; true when the frame was shown.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn native_present(pan_x: f32, pan_y: f32, zoom: f32, checker_a: [f32; 3], checker_b: [f32; 3], checker_cell: f32, window: tauri::WebviewWindow, state: tauri::State<NativeState>) -> Result<bool, String> {
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    let n = s.as_mut().ok_or(NOT_STARTED)?;
    if n.size != (size.width, size.height) {
        n.display.resize(&n.gpu, size.width, size.height);
        n.size = (size.width, size.height);
    }
    let layers = n.doc.stack();
    let checker = Checker { a: checker_a, b: checker_b, cell: checker_cell };
    Ok(n.display.present(&n.gpu, &n.blender, &layers, n.doc.width, n.doc.height, View { pan: [pan_x, pan_y], zoom }, Some(checker)) == Presented::Shown)
}

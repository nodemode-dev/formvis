//! The native canvas in the desktop window (Phase 20): the shell hosts sonny-render and relays the app's document to
//! its mirror. Opt-in: nothing is created until the app calls native_start (the native renderer chosen in Preferences),
//! so the desktop app is unchanged otherwise. Not yet verified on macOS: there the renderer's Metal layer must sit
//! beneath the web view for the interface to show over it, which only the owner's Mac can confirm.

use serde::Deserialize;
use sonny_render::composite::{Affine, Blender};
use sonny_render::display::{Display, Presented, View};
use sonny_render::document::{Document, LayerSpec};
use sonny_render::Gpu;
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
}

#[tauri::command]
pub fn native_stack(stack: Vec<SpecIn>, state: tauri::State<NativeState>) -> Result<(), String> {
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    let n = s.as_mut().ok_or(NOT_STARTED)?;
    n.doc.set_stack(
        stack
            .into_iter()
            .map(|e| LayerSpec {
                id: e.id,
                mode: e.mode,
                opacity: e.opacity,
                visible: e.visible,
                transform: e.transform.map(|[a, b, c, d, e, f]| Affine { a, b, c, d, e, f }),
                mask: e.mask,
                clip_to: e.clip_to,
                table: e.table,
            })
            .collect(),
    );
    Ok(())
}

#[tauri::command]
pub fn native_remove(id: String, state: tauri::State<NativeState>) -> Result<(), String> {
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    s.as_mut().ok_or(NOT_STARTED)?.doc.remove(&id);
    Ok(())
}

/// Draws the document at this pan and zoom, at the window's current size; true when the frame was shown.
#[tauri::command]
pub fn native_present(pan_x: f32, pan_y: f32, zoom: f32, window: tauri::WebviewWindow, state: tauri::State<NativeState>) -> Result<bool, String> {
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    let n = s.as_mut().ok_or(NOT_STARTED)?;
    if n.size != (size.width, size.height) {
        n.display.resize(&n.gpu, size.width, size.height);
        n.size = (size.width, size.height);
    }
    let layers = n.doc.stack();
    Ok(n.display.present(&n.gpu, &n.blender, &layers, n.doc.width, n.doc.height, View { pan: [pan_x, pan_y], zoom }) == Presented::Shown)
}

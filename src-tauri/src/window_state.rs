//! The main window between launches: its size, position and maximised state, and the interface zoom the page asked for,
//! kept in window.json in the app's config folder; and, on Linux, the recovery of its web view after the renderer crashed.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, WindowEvent};

const FILE: &str = "window.json";
const WRITE_EVERY: Duration = Duration::from_secs(2);
const MIN_SIDE: f64 = 200.0;
const ZOOM_RANGE: (f64, f64) = (0.5, 3.0);

/// Logical pixels; a width of zero means no size was kept, a zoom of zero means 100%.
#[derive(Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Place {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
    pub zoom: f64,
}

#[derive(Default)]
struct Kept {
    place: Place,
    written: Option<Instant>,
}

#[derive(Default)]
pub struct Memory(Mutex<Kept>);

fn file(handle: &tauri::AppHandle) -> Option<PathBuf> {
    handle.path().app_config_dir().ok().map(|dir| dir.join(FILE))
}

fn write(handle: &tauri::AppHandle, place: &Place) {
    let Some(file) = file(handle) else { return };
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string(place) {
        let _ = std::fs::write(file, text);
    }
}

/// True when the window's title bar would land on a screen that is attached now.
fn on_screen(handle: &tauri::AppHandle, place: &Place) -> bool {
    let Ok(monitors) = handle.available_monitors() else { return true };
    let (x, y) = (place.x + 80.0, place.y + 20.0);
    monitors.iter().any(|monitor| {
        let scale = monitor.scale_factor();
        let (left, top) = (f64::from(monitor.position().x) / scale, f64::from(monitor.position().y) / scale);
        let (width, height) = (f64::from(monitor.size().width) / scale, f64::from(monitor.size().height) / scale);
        x > left && x < left + width && y > top && y < top + height
    })
}

/// What the last run left, also kept in memory for the events that follow. A size that is too small or a position that is
/// off every screen is dropped (the window is then sized and centred as on a first run); the maximised state and the zoom stay.
pub fn load(handle: &tauri::AppHandle) -> Place {
    let mut place = file(handle)
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|text| serde_json::from_str::<Place>(&text).ok())
        .unwrap_or_default();
    if place.width < MIN_SIDE || place.height < MIN_SIDE || !on_screen(handle, &place) {
        place.x = 0.0;
        place.y = 0.0;
        place.width = 0.0;
        place.height = 0.0;
    }
    if place.zoom > 0.0 {
        place.zoom = place.zoom.clamp(ZOOM_RANGE.0, ZOOM_RANGE.1);
    }
    if let Ok(mut kept) = handle.state::<Memory>().0.lock() {
        kept.place = place;
    }
    place
}

/// Maximises the new window and zooms its web view the way the last run left them.
pub fn restore(window: &tauri::WebviewWindow, place: &Place) {
    if place.maximized {
        let _ = window.maximize();
    }
    if place.zoom > 0.0 && (place.zoom - 1.0).abs() > 1e-6 {
        let _ = window.set_zoom(place.zoom);
    }
}

fn remember(window: &tauri::Window) {
    let handle = window.app_handle();
    let state = handle.state::<Memory>();
    let Ok(mut kept) = state.0.lock() else { return };
    let maximized = window.is_maximized().unwrap_or(false);
    kept.place.maximized = maximized;
    if !maximized && !window.is_minimized().unwrap_or(false) && !window.is_fullscreen().unwrap_or(false) {
        if let (Ok(position), Ok(size), Ok(scale)) = (window.outer_position(), window.inner_size(), window.scale_factor()) {
            kept.place.x = f64::from(position.x) / scale;
            kept.place.y = f64::from(position.y) / scale;
            kept.place.width = f64::from(size.width) / scale;
            kept.place.height = f64::from(size.height) / scale;
        }
    }
    if kept.written.map_or(true, |at| at.elapsed() > WRITE_EVERY) {
        kept.written = Some(Instant::now());
        write(handle, &kept.place);
    }
}

/// Writes what is kept, for a close or an exit that came between two throttled writes.
pub fn flush(handle: &tauri::AppHandle) {
    let state = handle.state::<Memory>();
    if let Ok(kept) = state.0.lock() {
        write(handle, &kept.place);
    };
}

/// The main window's events: its place is noted as it moves and resizes, and written when it closes.
pub fn track(window: &tauri::Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => remember(window),
        WindowEvent::CloseRequested { .. } => {
            remember(window);
            flush(window.app_handle());
        }
        WindowEvent::Destroyed => flush(window.app_handle()),
        _ => {}
    }
}

/// Preferences > Interface > Interface Scale for the desktop window: the page asks for a factor and the web view is zoomed to
/// it, kept for the next launch; with no factor it only reads the zoom in effect. The page divides that zoom out of its pixel
/// ratio, so Auto does not follow its own change.
#[tauri::command]
pub fn ui_zoom(window: tauri::WebviewWindow, memory: tauri::State<Memory>, factor: Option<f64>) -> Result<f64, String> {
    let busy = || "the window state is busy".to_string();
    let current = {
        let kept = memory.0.lock().map_err(|_| busy())?;
        if kept.place.zoom > 0.0 {
            kept.place.zoom
        } else {
            1.0
        }
    };
    let Some(asked) = factor else { return Ok(current) };
    let asked = asked.clamp(ZOOM_RANGE.0, ZOOM_RANGE.1);
    if (asked - current).abs() > 1e-6 {
        window.set_zoom(asked).map_err(|err| err.to_string())?;
        let mut kept = memory.0.lock().map_err(|_| busy())?;
        kept.place.zoom = asked;
        write(window.app_handle(), &kept.place);
    }
    Ok(asked)
}

#[cfg(target_os = "linux")]
const CRASH_RELOADS: usize = 2;
#[cfg(target_os = "linux")]
const CRASH_WINDOW: Duration = Duration::from_secs(60);

/// A web view whose renderer process died is reloaded (a dead page cannot reload itself), at most twice in a minute; the third
/// stop inside that minute leaves it alone and says so. The page offers the unsaved documents back as after any crash.
#[cfg(target_os = "linux")]
pub fn watch_renderer(window: &tauri::WebviewWindow) {
    use webkit2gtk::WebViewExt;
    let handle = window.app_handle().clone();
    let _ = window.with_webview(move |platform| {
        let stops = std::cell::RefCell::new(Vec::<Instant>::new());
        platform.inner().connect_web_process_terminated(move |view, _reason| {
            let now = Instant::now();
            let mut stops = stops.borrow_mut();
            stops.retain(|at| now.duration_since(*at) < CRASH_WINDOW);
            if stops.len() < CRASH_RELOADS {
                stops.push(now);
                view.reload();
            } else {
                give_up(&handle);
            }
        });
    });
}

/// Windows (WebView2) and macOS (WKWebView) report a dead renderer through their own APIs, which are not wired yet.
#[cfg(not(target_os = "linux"))]
pub fn watch_renderer(_window: &tauri::WebviewWindow) {}

#[cfg(target_os = "linux")]
fn give_up(handle: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    handle
        .dialog()
        .message("The window's web view stopped twice within a minute, so formvis has left it as it is. Save what you can, close formvis and open it again; unsaved pictures are offered back when it starts.")
        .title("formvis")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

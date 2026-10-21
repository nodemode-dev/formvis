//! The splash stays up until the window has drawn its first real content and at least SPLASH_MIN has passed since
//! launch (the owner's 2.6 s, 1.96.0); then its bar completes and the window appears whole, in one step. Until then
//! the main window exists but cannot be seen: on macOS it is on screen at alpha 0 and lets clicks through, since a
//! hidden window's web view stops its animation frames and the page renders through them; elsewhere it is created
//! hidden. Both windows carry the page's dark background, so no white frame shows at any point.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use tauri::{Manager, Runtime, WebviewWindow};

pub const SPLASH_MIN: Duration = Duration::from_millis(2600);
pub const BACKGROUND: tauri::window::Color = tauri::window::Color(10, 10, 10, 255);
const BAR_FINISH: Duration = Duration::from_millis(220);
const FALLBACK: Duration = Duration::from_secs(20);

static LAUNCH: OnceLock<Instant> = OnceLock::new();
static REVEALED: AtomicBool = AtomicBool::new(false);

/// Called first thing in main, so the splash's minimum counts from launch.
pub fn mark_launch() {
    let _ = LAUNCH.set(Instant::now());
}

/// Whether the main window is built visible: elsewhere yes, as before; on macOS it is built hidden and `conceal` puts it
/// on screen at alpha 0, in that order on the main thread, so no opaque frame can show first.
pub const BUILD_VISIBLE: bool = !cfg!(target_os = "macos");

/// Right after the main window is built: puts it on screen unseen (macOS), and shows it anyway after FALLBACK if the
/// page never says it is ready (a page that failed to load must not leave the person with only the splash).
pub fn conceal<R: Runtime>(window: &WebviewWindow<R>) {
    if !BUILD_VISIBLE {
        set_seen(window, false);
        let _ = window.show();
    }
    let handle = window.app_handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(FALLBACK);
        show_main(&handle);
    });
}

/// The page's first content is painted (dom.ts revealApp).
#[tauri::command(async)]
pub fn app_ready<R: Runtime>(app: tauri::AppHandle<R>) {
    show_main(&app);
}

fn show_main<R: Runtime>(app: &tauri::AppHandle<R>) {
    if REVEALED.swap(true, Ordering::SeqCst) {
        return;
    }
    let started = *LAUNCH.get_or_init(Instant::now);
    if let Some(wait) = SPLASH_MIN.checked_sub(started.elapsed()) {
        std::thread::sleep(wait);
    }
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.eval("window.formvisSplashDone && window.formvisSplashDone()");
        std::thread::sleep(BAR_FINISH);
    }
    if let Some(main) = app.get_webview_window("main") {
        set_seen(&main, true);
        let _ = main.show();
        let _ = main.set_focus();
        crate::traffic_lights::place(&main.as_ref().window());
    }
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
}

#[cfg(target_os = "macos")]
fn set_seen<R: Runtime>(window: &WebviewWindow<R>, seen: bool) {
    let Ok(ns_window) = window.ns_window() else { return };
    let address = ns_window as usize;
    let _ = window.run_on_main_thread(move || unsafe {
        if let Some(window) = (address as *const objc2_app_kit::NSWindow).as_ref() {
            window.setAlphaValue(if seen { 1.0 } else { 0.0 });
            window.setIgnoresMouseEvents(!seen);
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn set_seen<R: Runtime>(_window: &WebviewWindow<R>, _seen: bool) {}

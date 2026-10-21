//! macOS: the window's traffic lights sit in the page's 38 px title row (the title bar is an overlay, main.rs). Tao insets
//! them only from its own view's drawRect, which the web view covering it rarely triggers, and AppKit puts them back at the
//! system's place whenever it lays out the title bar again (a title change, focus, a theme or screen change). The Home
//! screen had nothing that redrew Tao's view after the page set the title, so the lights stayed at the system's place
//! until a document opened (1.95.8). They are now placed here after every one of those moments, and Tao's view is
//! marked for display so its own inset follows the next layout pass too.

use tauri::{Runtime, Window};

#[cfg(target_os = "macos")]
pub const INSET: (f64, f64) = (14.0, 12.0);

/// The page's title for the window: set, then the lights placed again, since AppKit lays the title bar out anew.
#[tauri::command]
pub fn set_window_title<R: Runtime>(window: Window<R>, title: String) {
    let _ = window.set_title(&title);
    place(&window);
}

#[cfg(target_os = "macos")]
pub fn place<R: Runtime>(window: &Window<R>) {
    let Ok(ns_window) = window.ns_window() else { return };
    let address = ns_window as usize;
    let _ = window.run_on_main_thread(move || unsafe { inset(address as *const objc2_app_kit::NSWindow) });
}

#[cfg(not(target_os = "macos"))]
pub fn place<R: Runtime>(_window: &Window<R>) {}

#[cfg(target_os = "macos")]
unsafe fn inset(ns_window: *const objc2_app_kit::NSWindow) {
    use objc2_app_kit::NSWindowButton;

    let Some(window) = ns_window.as_ref() else { return };
    let (x, y) = INSET;
    let (Some(close), Some(minimize), Some(zoom)) = (
        window.standardWindowButton(NSWindowButton::CloseButton),
        window.standardWindowButton(NSWindowButton::MiniaturizeButton),
        window.standardWindowButton(NSWindowButton::ZoomButton),
    ) else {
        return;
    };
    let Some(bar) = close.superview().and_then(|view| view.superview()) else { return };
    let close_frame = close.frame();
    let height = close_frame.size.height + y;
    let mut bar_frame = bar.frame();
    bar_frame.size.height = height;
    bar_frame.origin.y = window.frame().size.height - height;
    bar.setFrame(bar_frame);
    let step = minimize.frame().origin.x - close_frame.origin.x;
    for (i, button) in [close, minimize, zoom].iter().enumerate() {
        let mut origin = button.frame().origin;
        origin.x = x + i as f64 * step;
        button.setFrameOrigin(origin);
    }
    if let Some(content) = window.contentView() {
        content.setNeedsDisplay(true);
    }
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

mod display;
mod native;

struct Backend(Mutex<Option<CommandChild>>);

const FALLBACK_SIZE: (f64, f64) = (1323.0, 860.0);
const MIN_SIZE: (f64, f64) = (980.0, 640.0);
const SCREEN_FRACTION: f64 = 0.9;

fn kill_backend(handle: &tauri::AppHandle) {
    let state = handle.state::<Backend>();
    let child = state.0.lock().ok().and_then(|mut slot| slot.take());
    if let Some(child) = child {
        // Asked to stop first (1.86.2): the frozen engine is a launcher with the server as its child, and a forced kill
        // reaches only the launcher, which then can neither stop the server nor remove the gigabyte it unpacked. SIGTERM
        // is passed on to the server; it gets a second and a half before the forced kill.
        #[cfg(unix)]
        {
            let pid = child.pid().to_string();
            let signal = |sig: &str| {
                std::process::Command::new("kill")
                    .args([sig, pid.as_str()])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status()
                    .is_ok_and(|s| s.success())
            };
            if signal("-TERM") {
                for _ in 0..30 {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if !signal("-0") {
                        return;
                    }
                }
            }
        }
        let _ = child.kill();
    }
}

fn close_splash(handle: &tauri::AppHandle) {
    if let Some(splash) = handle.get_webview_window("splash") {
        let _ = splash.close();
    }
}

/// Offers an update when the app is configured to verify them: needs a non-empty updater "pubkey".
fn check_for_updates(handle: tauri::AppHandle) {
    let configured = handle
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|section| section.get("pubkey"))
        .and_then(|key| key.as_str())
        .is_some_and(|key| !key.is_empty());
    if !configured {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = handle.updater() else { return };
        let Ok(Some(update)) = updater.check().await else { return };
        let accepted = handle
            .dialog()
            .message(format!("formvis {} is available. Install it and restart?", update.version))
            .title("Update available")
            .buttons(MessageDialogButtons::OkCancel)
            .blocking_show();
        if accepted && update.download_and_install(|_, _| {}, || {}).await.is_ok() {
            kill_backend(&handle);
            handle.restart();
        }
    });
}

/// The font families installed on this computer, sorted and without duplicates, for the Type tool's font list. The
/// desktop web views (WebKit on macOS and Linux, WebView2 on Windows) have no Local Font Access API, so the shell reads
/// the system's font folders with fontdb (pure Rust, MIT) and the page asks for them with invoke('system_fonts').
#[tauri::command]
fn system_fonts() -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut names: Vec<String> = db
        .faces()
        .flat_map(|face| face.families.iter().map(|(name, _)| name.trim().to_string()))
        .filter(|name| !name.is_empty() && !name.starts_with('.'))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}

#[cfg(test)]
mod tests {
    /// Runs against the fonts really installed where the tests run; set FORMVIS_EXPECT_FONT to a family that machine has
    /// (DejaVu Sans on the Linux used for 1.43.0) to require it by name.
    #[test]
    fn system_fonts_lists_installed_families_sorted_without_duplicates() {
        let fonts = super::system_fonts();
        assert!(!fonts.is_empty(), "no fonts found");
        for pair in fonts.windows(2) {
            assert!(pair[0].to_lowercase() < pair[1].to_lowercase(), "not sorted or duplicated: {:?}", pair);
        }
        assert!(fonts.iter().all(|f| !f.starts_with('.')), "a hidden system font was listed");
        if let Ok(expected) = std::env::var("FORMVIS_EXPECT_FONT") {
            assert!(fonts.iter().any(|f| f == &expected), "{expected} not among {} families", fonts.len());
        }
    }
}

/// The native open dialog for a linked smart object's file (33.2): returns the file's real disk path, which the web
/// view never learns from a picked File. None when the dialog is cancelled.
#[tauri::command]
async fn pick_image_path(app: tauri::AppHandle) -> Option<String> {
    let exts = [
        "png", "jpg", "jpeg", "webp", "gif", "avif", "tif", "tiff", "dpx", "qoi", "tga", "ico", "pgm", "ppm", "pam", "heic",
        "psd", "dng", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "pef", "srw",
    ];
    let picked = app.dialog().file().add_filter("Images", &exts).blocking_pick_file()?;
    picked.into_path().ok().map(|p| p.to_string_lossy().into_owned())
}

fn main() {
    let app = tauri::Builder::default()
        .manage(native::NativeState::default())
        .invoke_handler(tauri::generate_handler![
            system_fonts,
            pick_image_path,
            display::display_profile,
            native::native_start,
            native::native_stop,
            native::native_doc,
            native::native_put,
            native::native_table,
            native::native_stack,
            native::native_remove,
            native::native_present
        ])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let (mut rx, child) = app.shell()
                .sidecar("formvis-engine")
                .expect("the formvis engine sidecar is missing; bundle its binary")
                .env("FORMVIS_PORT", "0")
                .spawn()
                .expect("the formvis engine failed to spawn");
            *app.state::<Backend>().0.lock().unwrap() = Some(child);

            tauri::async_runtime::spawn(async move {
                let pattern = regex::Regex::new(r"http://127\.0\.0\.1:(\d+)").unwrap();
                let mut port: Option<u16> = None;
                while let Some(event) = rx.recv().await {
                    let text = match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            String::from_utf8_lossy(&bytes).into_owned()
                        }
                        CommandEvent::Terminated(_) => break,
                        _ => continue,
                    };
                    if let Some(found) = pattern.captures(&text).and_then(|c| c[1].parse::<u16>().ok()) {
                        port = Some(found);
                        break;
                    }
                }
                match port {
                    Some(port) => {
                        let url = format!("http://127.0.0.1:{port}");
                        let (width, height) = handle
                            .primary_monitor()
                            .ok()
                            .flatten()
                            .map(|monitor| {
                                let logical = monitor.size().to_logical::<f64>(monitor.scale_factor());
                                (logical.width * SCREEN_FRACTION, logical.height * SCREEN_FRACTION)
                            })
                            .unwrap_or(FALLBACK_SIZE);
                        let _ = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url.parse().unwrap()))
                            .title("formvis")
                            .inner_size(width, height)
                            .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
                            .center()
                            // Files dropped on the window reach the page as ordinary drop events (1.86.1): Tauri's own
                            // drop handler otherwise takes them, and the Home screen and the canvas never saw a drop.
                            .disable_drag_drop_handler()
                            .build();
                        close_splash(&handle);
                        check_for_updates(handle.clone());
                    }
                    None => {
                        close_splash(&handle);
                        let _ = handle
                            .dialog()
                            .message("The formvis engine failed to start. Please relaunch the app.")
                            .blocking_show();
                        kill_backend(&handle);
                        handle.exit(1);
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the formvis app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            kill_backend(handle);
        }
    });
}

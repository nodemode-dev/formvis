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

const FALLBACK_LOGICAL: (f64, f64) = (1323.0, 860.0);
const MIN_LOGICAL: (f64, f64) = (980.0, 640.0);
const SCREEN_FRACTION: f64 = 0.9;

fn kill_backend(handle: &tauri::AppHandle) {
    if let Some(child) = handle.state::<Backend>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

fn close_splash(handle: &tauri::AppHandle) {
    if let Some(splash) = handle.get_webview_window("splash") {
        let _ = splash.close();
    }
}

/// Checks the GitHub Releases feed once the main window is up, the way the Sparkle appcast did, and asks
/// before installing. Skipped until a public key is configured in `plugins.updater.pubkey`, so builds made before the
/// signing key exists never try to verify against an empty key.
fn check_for_updates(handle: tauri::AppHandle) {
    let configured = handle
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|key| key.as_str())
        .map_or(false, |key| !key.is_empty());
    if !configured {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = handle.updater() else { return };
        let Ok(Some(update)) = updater.check().await else { return };
        let install = handle
            .dialog()
            .message(format!("formvis {} is available. Install it and restart?", update.version))
            .title("Update available")
            .buttons(MessageDialogButtons::OkCancel)
            .blocking_show();
        if install && update.download_and_install(|_, _| {}, || {}).await.is_ok() {
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

fn main() {
    let app = tauri::Builder::default()
        .manage(native::NativeState::default())
        .invoke_handler(tauri::generate_handler![
            system_fonts,
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
            let (mut rx, child) = app
                .shell()
                .sidecar("formvis-engine")
                .expect("sidecar binary is bundled")
                .env("FORMVIS_PORT", "0")
                .spawn()
                .expect("the formvis engine failed to spawn");
            app.state::<Backend>().0.lock().unwrap().replace(child);

            tauri::async_runtime::spawn(async move {
                let pattern = regex::Regex::new(r"http://127\.0\.0\.1:(\d+)").unwrap();
                let mut port: Option<u16> = None;
                while let Some(event) = rx.recv().await {
                    let line = match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            String::from_utf8_lossy(&bytes).into_owned()
                        }
                        CommandEvent::Terminated(_) => break,
                        _ => continue,
                    };
                    if let Some(captures) = pattern.captures(&line) {
                        port = captures[1].parse().ok();
                        if port.is_some() {
                            break;
                        }
                    }
                }
                match port {
                    Some(found) => {
                        let url: tauri::Url = format!("http://127.0.0.1:{found}")
                            .parse()
                            .expect("loopback url");
                        let (width, height) = handle
                            .primary_monitor()
                            .ok()
                            .flatten()
                            .map(|monitor| {
                                let size = monitor.size();
                                let scale = monitor.scale_factor();
                                (
                                    (size.width as f64 / scale) * SCREEN_FRACTION,
                                    (size.height as f64 / scale) * SCREEN_FRACTION,
                                )
                            })
                            .unwrap_or(FALLBACK_LOGICAL);
                        let _ = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url))
                            .title("formvis")
                            .inner_size(width, height)
                            .min_inner_size(MIN_LOGICAL.0, MIN_LOGICAL.1)
                            .center()
                            .build();
                        close_splash(&handle);
                        check_for_updates(handle.clone());
                    }
                    None => {
                        close_splash(&handle);
                        handle
                            .dialog()
                            .message("The formvis engine failed to start. Please relaunch the app.")
                            .blocking_show();
                        kill_backend(&handle);
                        std::process::exit(1);
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("tauri app should build");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            kill_backend(handle);
        }
    });
}

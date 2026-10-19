#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

mod display;
mod native;

struct Backend(Mutex<Option<CommandChild>>);

/// Files the system asked formvis to open (a double-clicked project, a second launch). They wait here until the page
/// has registered its listener and called take_pending_opens; after that they are sent to the page as they arrive.
#[derive(Default)]
struct Opens {
    ready: bool,
    paths: Vec<String>,
}
struct OpenQueue(Mutex<Opens>);

/// Set once the page has settled every unsaved document (or the app is restarting for an update): from then on a
/// close or quit request goes through instead of being handed to the page.
struct ExitGate(AtomicBool);

/// Set when an update was installed at start: the page settles unsaved documents first, and confirm_exit then restarts
/// the app instead of quitting it. The page clears it (confirm_exit with cancel) when the person cancels the quit.
struct RestartAfterExit(AtomicBool);

/// The update the last check found, kept for install_update.
struct FoundUpdate(Mutex<Option<tauri_plugin_updater::Update>>);

#[derive(serde::Serialize)]
struct UpdateReport {
    /// "current", "available", "unconfigured" or "failed".
    status: &'static str,
    version: Option<String>,
    message: String,
    /// The release notes the update carries, when it has any.
    notes: Option<String>,
}

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

/// True when the app can verify updates: needs a non-empty updater "pubkey".
fn updater_configured(handle: &tauri::AppHandle) -> bool {
    handle
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|section| section.get("pubkey"))
        .and_then(|key| key.as_str())
        .is_some_and(|key| !key.is_empty())
}

/// Lets the next close or quit request through.
fn open_exit_gate(handle: &tauri::AppHandle) {
    handle.state::<ExitGate>().0.store(true, Ordering::SeqCst);
}

/// Hands the page a quit request so it can ask about unsaved documents; false when the page cannot answer (it has not
/// started listening, or the window is gone), which means the app may exit at once.
fn ask_page_to_quit(handle: &tauri::AppHandle) -> bool {
    if handle.state::<ExitGate>().0.load(Ordering::SeqCst) {
        return false;
    }
    let ready = handle.state::<OpenQueue>().0.lock().map(|opens| opens.ready).unwrap_or(false);
    if !ready || handle.get_webview_window("main").is_none() {
        return false;
    }
    handle.emit("formvis://exit-requested", ()).is_ok()
}

fn show_main_window(handle: &tauri::AppHandle) {
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Sends files to the page, or queues them until the page is listening.
fn open_paths(handle: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let send = match handle.state::<OpenQueue>().0.lock() {
        Ok(mut opens) => {
            if opens.ready {
                Some(paths)
            } else {
                opens.paths.extend(paths);
                None
            }
        }
        Err(_) => None,
    };
    if let Some(paths) = send {
        let _ = handle.emit("formvis://open-paths", paths);
        show_main_window(handle);
    }
}

/// The files named in a launch's arguments (the first is the program); a relative one is read from `cwd`.
fn paths_from_args(args: &[String], cwd: Option<&str>) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            let path = std::path::PathBuf::from(arg);
            let full = match cwd {
                Some(dir) if path.is_relative() => std::path::Path::new(dir).join(path),
                _ => path,
            };
            full.is_file().then(|| full.to_string_lossy().into_owned())
        })
        .collect()
}

/// The page registers its listeners and then asks for the files that arrived before it was ready.
#[tauri::command]
fn take_pending_opens(queue: tauri::State<OpenQueue>) -> Vec<String> {
    match queue.0.lock() {
        Ok(mut opens) => {
            opens.ready = true;
            std::mem::take(&mut opens.paths)
        }
        Err(_) => Vec::new(),
    }
}

/// The page has saved or discarded every unsaved document: the app may exit now. The engine is stopped by the Exit event.
#[tauri::command]
fn confirm_exit(app: tauri::AppHandle, cancel: Option<bool>) {
    let restart = app.state::<RestartAfterExit>().0.swap(false, Ordering::SeqCst);
    if cancel == Some(true) {
        return;
    }
    open_exit_gate(&app);
    if restart {
        kill_backend(&app);
        app.restart();
    }
    app.exit(0);
}

fn update_report(status: &'static str, version: Option<String>, message: String) -> UpdateReport {
    UpdateReport { status, version, message, notes: None }
}

/// Help > Check for Updates: asks the update endpoints and says what it found, or why it cannot ask.
#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> UpdateReport {
    if !updater_configured(&app) {
        return update_report("unconfigured", None, "This build has no update key configured, so it cannot check for updates.".into());
    }
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => return update_report("failed", None, format!("Could not start the update check: {err}")),
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let notes = update.body.clone().filter(|text| !text.trim().is_empty());
            if let Ok(mut slot) = app.state::<FoundUpdate>().0.lock() {
                *slot = Some(update);
            }
            let mut report = update_report("available", Some(version.clone()), format!("Version {version} is available."));
            report.notes = notes;
            report
        }
        Ok(None) => update_report("current", None, "formvis is up to date.".into()),
        Err(err) => update_report("failed", None, format!("Could not check for updates: {err}")),
    }
}

/// Downloads and installs the update the last check found, stops the engine and restarts the app. The page settles
/// unsaved documents first.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = app
        .state::<FoundUpdate>()
        .0
        .lock()
        .ok()
        .and_then(|mut slot| slot.take())
        .ok_or_else(|| "No update is waiting; check for updates again.".to_string())?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|err| format!("Could not install the update: {err}"))?;
    open_exit_gate(&app);
    kill_backend(&app);
    app.restart()
}

/// Offers an update when the app is configured to verify them: needs a non-empty updater "pubkey".
fn check_for_updates(handle: tauri::AppHandle) {
    if !updater_configured(&handle) {
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
            // The page settles unsaved documents and writes its recovery copies first; confirm_exit restarts after.
            handle.state::<RestartAfterExit>().0.store(true, Ordering::SeqCst);
            if !ask_page_to_quit(&handle) {
                open_exit_gate(&handle);
                kill_backend(&handle);
                handle.restart();
            }
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

/// Portable Windows zip: a file named portable or portable.txt beside the program keeps the web view's data (settings
/// kept by the page) in FormvisData beside it, where the engine already keeps its own.
#[cfg(windows)]
fn portable_web_view_data() {
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(dir) = exe.parent() else { return };
    if dir.join("portable").is_file() || dir.join("portable.txt").is_file() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", dir.join("FormvisData").join("WebView2"));
    }
}

fn main() {
    #[cfg(windows)]
    portable_web_view_data();
    let app = tauri::Builder::default()
        // First, as the plugin asks: a second launch (a project double-clicked while formvis runs) sends its arguments
        // here and exits; the files go to the running window.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            open_paths(app, paths_from_args(&args, Some(&cwd)));
            show_main_window(app);
        }))
        .manage(native::NativeState::default())
        .manage(OpenQueue(Mutex::new(Opens::default())))
        .manage(ExitGate(AtomicBool::new(false)))
        .manage(RestartAfterExit(AtomicBool::new(false)))
        .manage(FoundUpdate(Mutex::new(None)))
        .on_window_event(|window, event| {
            // The window's close button: the page asks about unsaved documents first and exits through confirm_exit.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && ask_page_to_quit(window.app_handle()) {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_opens,
            confirm_exit,
            check_for_update,
            install_update,
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
            // A project or picture the system launched formvis with (Windows and Linux; macOS sends RunEvent::Opened).
            let launch_args: Vec<String> = std::env::args().collect();
            open_paths(&handle, paths_from_args(&launch_args, None));
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
                        let url = if std::env::args().any(|arg| arg == "--no-skin") {
                            format!("http://127.0.0.1:{port}/?no-skin")
                        } else {
                            format!("http://127.0.0.1:{port}")
                        };
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

    app.run(|handle, event| match event {
        RunEvent::Exit => kill_backend(handle),
        // Cmd+Q, the Dock's Quit and a last window closing: the page asks about unsaved documents first.
        RunEvent::ExitRequested { api, .. } => {
            if ask_page_to_quit(handle) {
                api.prevent_exit();
            }
        }
        // A project or picture double-clicked in Finder, or dropped on the Dock icon.
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            let paths = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            open_paths(handle, paths);
            show_main_window(handle);
        }
        _ => {}
    });
}

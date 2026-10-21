#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

mod display;
#[cfg(target_os = "linux")]
mod integration;
mod native;
mod packaged;
mod reveal;
mod traffic_lights;
mod window_state;

struct Backend(Mutex<Option<CommandChild>>);

/// Files the system asked formvis to open (a double-clicked project, a second launch). They wait here until the page
/// has registered its listener and called take_pending_opens; after that they are sent to the page as they arrive.
#[derive(Default)]
struct Opens {
    ready: bool,
    paths: Vec<String>,
    runs: Vec<LaunchRun>,
}

/// A launch argument that runs something once the page is up: `--command <id>` (a catalogue command), `--action <name>`
/// (a recorded action, played on the current document) or `--script <file>` (the file's text, run in the script sandbox).
#[derive(Clone, serde::Serialize)]
struct LaunchRun {
    kind: &'static str,
    value: String,
}

const RUN_FLAGS: [(&str, &str); 3] = [("--command", "command"), ("--action", "action"), ("--script", "script")];
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

/// The plain page shown after a crash loop: its page is dead, so nothing is asked of it; the gate opens and the engine stops.
fn renderer_choice(handle: &tauri::AppHandle, choice: window_state::Choice) {
    open_exit_gate(handle);
    match choice {
        window_state::Choice::Restart => {
            kill_backend(handle);
            handle.restart();
        }
        window_state::Choice::Quit => handle.exit(0),
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
    if handle.state::<ExitGate>().0.load(Ordering::SeqCst) || window_state::loop_page_shown() {
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
        .enumerate()
        .skip(1)
        .filter(|(i, arg)| !arg.starts_with('-') && !RUN_FLAGS.iter().any(|(flag, _)| args[i - 1] == *flag))
        .map(|(_, arg)| arg)
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

/// The `--command`, `--action` and `--script` arguments of a launch, in order. A script is read here (at most 200 KB, a
/// relative path from `cwd`); one that cannot be read becomes an error the page reports.
fn runs_from_args(args: &[String], cwd: Option<&str>) -> Vec<LaunchRun> {
    let mut runs = Vec::new();
    for (i, arg) in args.iter().enumerate().skip(1) {
        let Some(&(_, kind)) = RUN_FLAGS.iter().find(|(flag, _)| arg == flag) else { continue };
        let Some(value) = args.get(i + 1).filter(|v| !v.starts_with("--")) else { continue };
        if kind != "script" {
            runs.push(LaunchRun { kind, value: value.clone() });
            continue;
        }
        let path = std::path::PathBuf::from(value);
        let full = match cwd {
            Some(dir) if path.is_relative() => std::path::Path::new(dir).join(path),
            _ => path,
        };
        let read = std::fs::metadata(&full).ok().filter(|m| m.is_file() && m.len() <= 200_000).and_then(|_| std::fs::read_to_string(&full).ok());
        runs.push(match read {
            Some(text) => LaunchRun { kind: "script", value: text },
            None => LaunchRun { kind: "error", value: format!("The script {} could not be read (a text file of at most 200 KB).", full.display()) },
        });
    }
    runs
}

/// Sends launch runs to the page, or queues them until it asks with take_pending_runs.
fn queue_runs(handle: &tauri::AppHandle, runs: Vec<LaunchRun>) {
    if runs.is_empty() {
        return;
    }
    let send = match handle.state::<OpenQueue>().0.lock() {
        Ok(mut opens) => {
            if opens.ready {
                Some(runs)
            } else {
                opens.runs.extend(runs);
                None
            }
        }
        Err(_) => None,
    };
    if let Some(runs) = send {
        let _ = handle.emit("formvis://launch-runs", runs);
    }
}

/// The runs that arrived before the page was ready; the page asks after it has opened the waiting files.
#[tauri::command]
fn take_pending_runs(queue: tauri::State<OpenQueue>) -> Vec<LaunchRun> {
    queue.0.lock().map(|mut opens| std::mem::take(&mut opens.runs)).unwrap_or_default()
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

/// The font families installed on this computer, sorted and without duplicates, for the Type tool's font list. The
/// desktop web views (WebKit on macOS and Linux, WebView2 on Windows) have no Local Font Access API, so the shell reads
/// the system's font folders with fontdb (pure Rust, MIT) and the page asks for them with invoke('system_fonts'). It runs
/// off the main thread (1.95.8): the page asks at start, and reading a few thousand fonts held the window still.
#[tauri::command(async)]
fn system_fonts() -> Vec<String> {
    font_names(false)
}

/// The same list under each font's English family name (Preferences > Type > Show Font Names in English); a font with no
/// English name keeps its first one.
#[tauri::command(async)]
fn system_fonts_english() -> Vec<String> {
    font_names(true)
}

fn font_names(english: bool) -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut names: Vec<String> = db
        .faces()
        .flat_map(|face| {
            let en: Vec<String> = face
                .families
                .iter()
                .filter(|(_, lang)| *lang == fontdb::Language::English_UnitedStates)
                .map(|(name, _)| name.trim().to_string())
                .collect();
            if english && !en.is_empty() {
                en
            } else if english {
                face.families.iter().take(1).map(|(name, _)| name.trim().to_string()).collect::<Vec<String>>()
            } else {
                face.families.iter().map(|(name, _)| name.trim().to_string()).collect::<Vec<String>>()
            }
        })
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

/// Adds a file the person opened or saved to the system's recent documents (the desktop's recent list, the taskbar jump
/// list, the Dock menu). A path that is not a file is ignored; the page calls it from its own recent list.
#[tauri::command]
fn note_recent_document(app: tauri::AppHandle, path: String) {
    if !std::path::Path::new(&path).is_file() {
        return;
    }
    #[cfg(target_os = "linux")]
    let _ = app.run_on_main_thread(move || {
        use gtk::prelude::*;
        let uri = gtk::gio::File::for_path(&path).uri();
        if let Some(manager) = gtk::RecentManager::default() {
            manager.add_item(uri.as_str());
        }
    });
    #[cfg(windows)]
    {
        let _ = &app;
        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        // SHARD_PATHW
        unsafe { windows_sys::Win32::UI::Shell::SHAddToRecentDocs(3, wide.as_ptr().cast()) };
    }
    #[cfg(target_os = "macos")]
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = objc2::MainThreadMarker::new() else { return };
        let url = objc2_foundation::NSURL::fileURLWithPath(&objc2_foundation::NSString::from_str(&path));
        objc2_app_kit::NSDocumentController::sharedDocumentController(mtm).noteNewRecentDocumentURL(&url);
    });
    #[cfg(not(any(target_os = "linux", windows, target_os = "macos")))]
    let _ = (app, path);
}

/// The native open dialog for a linked smart object's file (33.2): returns the file's real disk path, which the web
/// view never learns from a picked File. None when the dialog is cancelled.
#[tauri::command]
async fn pick_image_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let exts = [
        "png", "jpg", "jpeg", "webp", "gif", "avif", "tif", "tiff", "dpx", "qoi", "tga", "ico", "pgm", "ppm", "pam", "heic",
        "psd", "dng", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "pef", "srw",
    ];
    let started = std::time::Instant::now();
    match app.dialog().file().add_filter("Images", &exts).blocking_pick_file() {
        Some(picked) => Ok(picked.into_path().ok().map(|p| p.to_string_lossy().into_owned())),
        None if started.elapsed() < std::time::Duration::from_millis(250) => {
            let report = dialog_report();
            eprintln!("formvis: the file dialog did not open.\n{report}");
            app.dialog().message(format!("The file dialog did not open.\n\n{report}")).title("formvis").blocking_show();
            Err(report)
        }
        None => Ok(None),
    }
}

/// What the file dialogs need on this computer, as setup/libcheck --dialogs says it: shown when a dialog closes at once.
#[cfg(target_os = "linux")]
fn dialog_report() -> String {
    use std::os::unix::fs::MetadataExt;
    let var = |name: &str| std::env::var(name).ok().filter(|v| !v.is_empty());
    let on_path = |tool: &str| std::env::var_os("PATH").is_some_and(|dirs| std::env::split_paths(&dirs).any(|dir| dir.join(tool).is_file()));
    let uid = std::fs::metadata("/proc/self").map(|m| m.uid()).unwrap_or(0);
    let bus = var("DBUS_SESSION_BUS_ADDRESS").is_some() || std::path::Path::new(&format!("/run/user/{uid}/bus")).exists();
    let tools: Vec<&str> = ["zenity", "kdialog"].into_iter().filter(|tool| on_path(tool)).collect();
    let sandboxed = std::path::Path::new("/.flatpak-info").exists() || var("SNAP").is_some();
    let portal = if sandboxed || var("GTK_USE_PORTAL").as_deref() == Some("1") {
        "used (the desktop's file portal draws the dialog; a portal that fails a request can leave it waiting with no dialog shown, see xdg-desktop-portal's log)"
    } else {
        "not used (GTK draws the dialog itself)"
    };
    format!(
        "session: {}, DISPLAY={}, WAYLAND_DISPLAY={}\nsession bus: {}\nfile portal: {}\nzenity and kdialog: {}\nThe dialogs are GTK 3 and need a display; run libcheck --dialogs (installed as /usr/share/formvis/libcheck, or setup/libcheck) for the full report.",
        var("XDG_SESSION_TYPE").unwrap_or_else(|| "unknown".into()),
        var("DISPLAY").unwrap_or_else(|| "unset".into()),
        var("WAYLAND_DISPLAY").unwrap_or_else(|| "unset".into()),
        if bus { "present" } else { "none found" },
        portal,
        if tools.is_empty() { "neither is installed (formvis does not need them)".to_string() } else { format!("{} installed", tools.join(" and ")) },
    )
}

#[cfg(not(target_os = "linux"))]
fn dialog_report() -> String {
    "The system's file dialog did not open.".to_string()
}

/// The page asks for the report when a file dialog has not come back for a while.
#[tauri::command]
fn file_dialog_report() -> String {
    dialog_report()
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

/// Linux: the file that keeps the display server chosen in Preferences > Performance (auto, x11 or wayland). GTK picks its
/// backend as it starts, so the choice is read here, before any window exists, and takes effect at the next launch.
#[cfg(target_os = "linux")]
fn display_server_file() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".config")))?;
    Some(base.join("formvis").join("display-server"))
}

/// Sets GDK_BACKEND for an explicit choice, and turns off the web view's DMA-BUF renderer under X11, where it can leave the
/// window blank. A variable the person already set in the environment is never replaced.
#[cfg(target_os = "linux")]
fn apply_display_server() {
    let Some(file) = display_server_file() else { return };
    let choice = std::fs::read_to_string(file).unwrap_or_default();
    let (backend, dmabuf_off) = match choice.trim() {
        "x11" => (Some("x11"), true),
        "wayland" => (Some("wayland"), false),
        _ => (None, false),
    };
    if let Some(b) = backend {
        if std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", b);
        }
    }
    if dmabuf_off && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

/// Keeps the display server choice for the next launch; other systems have nothing to set and accept it.
#[tauri::command]
fn set_display_server(server: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let choice = match server.as_str() {
            "x11" | "wayland" => server.as_str(),
            _ => "auto",
        };
        let file = display_server_file().ok_or_else(|| "no home folder to keep the choice in".to_string())?;
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(file, choice).map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "linux"))]
    let _ = server;
    Ok(())
}

/// The graphics API the native renderer asks wgpu for, kept beside the display server choice.
fn graphics_backend_file() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "linux")]
    return display_server_file().map(|f| f.with_file_name("graphics-backend"));
    #[cfg(windows)]
    return std::env::var_os("APPDATA").map(|d| std::path::PathBuf::from(d).join("formvis").join("graphics-backend"));
    #[cfg(target_os = "macos")]
    return std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join("Library").join("Application Support").join("formvis").join("graphics-backend"));
    #[allow(unreachable_code)]
    None
}

const GRAPHICS_BACKENDS: [&str; 4] = ["vulkan", "gl", "metal", "dx12"];

/// Sets WGPU_BACKEND, which the native renderer's wgpu instance reads, for an explicit choice made in Preferences; a
/// value the person already set in the environment is never replaced. The engine and other children inherit it.
fn apply_graphics_backend() {
    let Some(file) = graphics_backend_file() else { return };
    let choice = std::fs::read_to_string(file).unwrap_or_default();
    let choice = choice.trim();
    if GRAPHICS_BACKENDS.contains(&choice) && std::env::var_os("WGPU_BACKEND").is_none() {
        std::env::set_var("WGPU_BACKEND", choice);
    }
}

/// Keeps the native renderer's graphics API (auto, vulkan, gl, metal or dx12) for the next launch.
#[tauri::command]
fn set_graphics_backend(backend: String) -> Result<(), String> {
    let choice = if GRAPHICS_BACKENDS.contains(&backend.as_str()) { backend.as_str() } else { "auto" };
    let file = graphics_backend_file().ok_or_else(|| "no home folder to keep the choice in".to_string())?;
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(file, choice).map_err(|e| e.to_string())
}

/// The value of --user-data-dir in a launch's arguments, as "--user-data-dir=PATH" or "--user-data-dir PATH".
fn user_data_dir_arg(args: &[String]) -> Option<String> {
    args.iter()
        .enumerate()
        .find_map(|(i, a)| {
            a.strip_prefix("--user-data-dir=")
                .map(str::to_string)
                .or_else(|| (a == "--user-data-dir").then(|| args.get(i + 1).cloned()).flatten())
        })
        .filter(|dir| !dir.is_empty())
}

/// Linux: the data folder this launch will use, found the way the engine finds it (--user-data-dir or FORMVIS_DATA_DIR, the
/// portable folder beside the program, ~/Formvis where it exists, else the XDG data folder), so a second launch can tell
/// whether a running window already owns it.
#[cfg(target_os = "linux")]
fn data_folder() -> std::path::PathBuf {
    use std::path::PathBuf;
    let args: Vec<String> = std::env::args().collect();
    let var = |name: &str| std::env::var(name).ok().filter(|v| !v.is_empty());
    let home = || var("HOME").map(PathBuf::from).unwrap_or_default();
    let explicit = user_data_dir_arg(&args).or_else(|| var("FORMVIS_DATA_DIR"));
    let beside = std::env::current_exe().ok().and_then(|exe| exe.parent().map(PathBuf::from)).unwrap_or_default();
    let portable = args.iter().any(|a| a == "--portable")
        || var("FORMVIS_PORTABLE").as_deref() == Some("1")
        || ["portable", "portable.txt"].iter().any(|name| beside.join(name).is_file());
    let folder = if let Some(dir) = explicit {
        match dir.strip_prefix("~/") {
            Some(rest) => home().join(rest),
            None => PathBuf::from(dir),
        }
    } else if portable {
        beside.join("FormvisData")
    } else if home().join("Formvis").exists() {
        home().join("Formvis")
    } else {
        match var("XDG_DATA_HOME").map(PathBuf::from).filter(|p| p.is_absolute()) {
            Some(base) => base.join("formvis"),
            None => home().join(".local").join("share").join("formvis"),
        }
    };
    let absolute = if folder.is_absolute() { folder } else { std::env::current_dir().unwrap_or_default().join(folder) };
    std::fs::canonicalize(&absolute).unwrap_or(absolute)
}

/// One running window per data folder (1.92.8). The plugin keys its hand-off on the application identifier, so on Linux a
/// second data folder on the same login could not open a window; the key now carries a hash of the data folder, so the
/// same folder hands its files to the running window and another folder runs on its own.
fn single_instance() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let plugin = tauri_plugin_single_instance::Builder::<tauri::Wry>::new().callback(|app, args, cwd| {
        open_paths(app, paths_from_args(&args, Some(&cwd)));
        queue_runs(app, runs_from_args(&args, Some(&cwd)));
        show_main_window(app);
    });
    #[cfg(target_os = "linux")]
    let plugin = {
        let hash = data_folder().to_string_lossy().bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ u64::from(b)).wrapping_mul(0x100000001b3));
        plugin.dbus_id(format!("ai.nodemode.formvis.d{hash:016x}"))
    };
    plugin.build()
}

fn main() {
    reveal::mark_launch();
    if let Some(code) = packaged::command_line() {
        std::process::exit(code);
    }
    #[cfg(windows)]
    portable_web_view_data();
    #[cfg(target_os = "linux")]
    apply_display_server();
    apply_graphics_backend();
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.on_web_content_process_terminate(window_state::on_renderer_stopped);
    let app = builder
        // First, as the plugin asks: a second launch (a project double-clicked while formvis runs) sends its arguments
        // here and exits; the files go to the running window.
        .plugin(single_instance())
        .manage(native::NativeState::default())
        .manage(OpenQueue(Mutex::new(Opens::default())))
        .manage(ExitGate(AtomicBool::new(false)))
        .manage(RestartAfterExit(AtomicBool::new(false)))
        .manage(FoundUpdate(Mutex::new(None)))
        .manage(window_state::Memory::default())
        .on_window_event(|window, event| {
            window_state::track(window, event);
            if window.label() == "main"
                && matches!(event, WindowEvent::Resized(_) | WindowEvent::Focused(_) | WindowEvent::ThemeChanged(_) | WindowEvent::ScaleFactorChanged { .. })
            {
                traffic_lights::place(window);
            }
            // The window's close button: the page asks about unsaved documents first and exits through confirm_exit.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && ask_page_to_quit(window.app_handle()) {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_opens,
            take_pending_runs,
            confirm_exit,
            check_for_update,
            install_update,
            set_display_server,
            set_graphics_backend,
            system_fonts,
            system_fonts_english,
            pick_image_path,
            file_dialog_report,
            note_recent_document,
            display::display_profile,
            window_state::ui_zoom,
            traffic_lights::set_window_title,
            reveal::app_ready,
            native::native_start,
            native::native_stop,
            native::native_doc,
            native::native_put,
            native::native_table,
            native::native_table3,
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
            reveal::round_splash(&handle);
            // A project or picture the system launched formvis with (Windows and Linux; macOS sends RunEvent::Opened).
            let launch_args: Vec<String> = std::env::args().collect();
            open_paths(&handle, paths_from_args(&launch_args, None));
            queue_runs(&handle, runs_from_args(&launch_args, None));
            let engine = match packaged::engine_folder() {
                Some(program) => app.shell().command(program),
                None => app
                    .shell()
                    .sidecar("formvis-engine")
                    .expect("the formvis engine sidecar is missing; bundle its binary"),
            };
            let mut sidecar = engine.env("FORMVIS_PORT", "0");
            if let Some(path) = packaged::launcher() {
                sidecar = sidecar.env("FORMVIS_LAUNCHER", path);
            }
            if let Some(dir) = user_data_dir_arg(&launch_args) {
                sidecar = sidecar.env("FORMVIS_DATA_DIR", dir);
            }
            if launch_args.iter().any(|a| a == "--portable") {
                sidecar = sidecar.env("FORMVIS_PORTABLE", "1");
            }
            let (mut rx, child) = sidecar.spawn().expect("the formvis engine failed to spawn");
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
                        let place = window_state::load(&handle);
                        let (width, height) = if place.width > 0.0 {
                            (place.width, place.height)
                        } else {
                            handle
                                .primary_monitor()
                                .ok()
                                .flatten()
                                .map(|monitor| {
                                    let logical = monitor.size().to_logical::<f64>(monitor.scale_factor());
                                    (logical.width * SCREEN_FRACTION, logical.height * SCREEN_FRACTION)
                                })
                                .unwrap_or(FALLBACK_SIZE)
                        };
                        let builder = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url.parse().unwrap()))
                            .title("formvis")
                            .visible(reveal::BUILD_VISIBLE)
                            .background_color(reveal::BACKGROUND)
                            .inner_size(width, height)
                            .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
                            // Files dropped on the window reach the page as ordinary drop events (1.86.1): Tauri's own
                            // drop handler otherwise takes them, and the Home screen and the canvas never saw a drop.
                            .disable_drag_drop_handler()
                            .on_navigation({
                                let handle = handle.clone();
                                move |url| match window_state::shell_choice(url) {
                                    Some(choice) => {
                                        renderer_choice(&handle, choice);
                                        false
                                    }
                                    None => true,
                                }
                            });
                        let builder = if place.width > 0.0 {
                            builder.position(place.x, place.y)
                        } else {
                            builder.center()
                        };
                        // macOS: the page's title row is the title bar (traffic lights over it, the native title hidden);
                        // the lights are centred in the page's 38 px row.
                        #[cfg(target_os = "macos")]
                        let builder = builder
                            .title_bar_style(tauri::TitleBarStyle::Overlay)
                            .hidden_title(true);
                        let builder = builder.on_page_load(|window, payload| {
                            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                                traffic_lights::place(&window.as_ref().window());
                            }
                        });
                        if let Ok(window) = builder.build() {
                            reveal::conceal(&window);
                            traffic_lights::place(&window.as_ref().window());
                            window_state::restore(&window, &place);
                            window_state::watch_renderer(&window);
                        } else {
                            close_splash(&handle);
                        }
                        #[cfg(target_os = "linux")]
                        integration::first_run(&handle);
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
        RunEvent::Exit => {
            window_state::flush(handle);
            kill_backend(handle);
        }
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

//! What only a packaged app needs. An agent's configuration names the AppImage (or the app bundle's binary) with `mcp` as its
//! first argument, and `agents install` registers that same program; both are modes of the frozen engine that sits beside
//! this binary, and run before any window exists. On Linux, `--add-launcher` and `--remove-launcher` manage the AppImage's
//! entry in the applications menu.

use std::ffi::OsString;
use std::process::Command;

/// The program an agent should start: the AppImage itself (its own mount disappears when it ends), else this binary.
pub fn launcher() -> Option<String> {
    running_image()
        .or_else(|| std::env::current_exe().ok())
        .map(|path| path.to_string_lossy().into_owned())
}

#[cfg(target_os = "linux")]
fn running_image() -> Option<std::path::PathBuf> {
    crate::integration::appimage()
}

#[cfg(not(target_os = "linux"))]
fn running_image() -> Option<std::path::PathBuf> {
    None
}

const ENGINE: &str = if cfg!(windows) { "formvis-engine.exe" } else { "formvis-engine" };

/// The engine of a one-folder build (DEV_PLAN 37.53; macOS since 1.95.8): `engine/formvis-engine` in the bundle's Resources,
/// or beside this binary where `tauri dev` copies the resources. It starts at once, where the one-file sidecar unpacked about
/// a gigabyte to a new temporary folder at every launch. None where the engine is still the one-file sidecar.
pub fn engine_folder() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    [dir.join("../Resources/engine"), dir.join("engine")]
        .into_iter()
        .map(|folder| folder.join(ENGINE))
        .find(|program| program.is_file())
}

/// The command line when it names one of the modes above: runs it and gives back the exit code; None starts the window.
pub fn command_line() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    let first = args.next()?;
    let mode = first.to_str()?.to_owned();
    match mode.as_str() {
        "mcp" | "agents" => Some(hand_over(first, args.collect())),
        #[cfg(target_os = "linux")]
        "--add-launcher" => Some(launcher_files(true)),
        #[cfg(target_os = "linux")]
        "--remove-launcher" => Some(launcher_files(false)),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn launcher_files(add: bool) -> i32 {
    let done = match (add, crate::integration::appimage()) {
        (true, Some(image)) => crate::integration::add(&image),
        (true, None) => Err("this is not a running AppImage (APPIMAGE is not set)".to_string()),
        (false, _) => crate::integration::remove(),
    };
    match done {
        Ok(()) => 0,
        Err(err) => {
            eprintln!("formvis: {err}");
            1
        }
    }
}

/// Runs the frozen engine beside this binary in the mode named, with the arguments after it; it is told which program started it,
/// so the engine can start the app again when no window is running.
fn hand_over(mode: OsString, rest: Vec<OsString>) -> i32 {
    let Ok(exe) = std::env::current_exe() else {
        eprintln!("formvis: cannot tell where the program is.");
        return 1;
    };
    let mut command = Command::new(engine_folder().unwrap_or_else(|| exe.with_file_name(ENGINE)));
    command.arg(mode).args(rest);
    if let Some(path) = launcher() {
        command.env("FORMVIS_LAUNCHER", path);
    }
    run(command)
}

#[cfg(unix)]
fn run(mut command: Command) -> i32 {
    use std::os::unix::process::CommandExt;
    let err = command.exec();
    eprintln!("formvis: the engine could not start: {err}");
    1
}

#[cfg(not(unix))]
fn run(mut command: Command) -> i32 {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    match command.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(err) => {
            eprintln!("formvis: the engine could not start: {err}");
            1
        }
    }
}

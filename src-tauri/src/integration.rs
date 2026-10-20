//! Linux AppImage: a launcher (desktop entry), its icon and the file types, put into the person's own applications folder the
//! way AppImage launchers do. Asked once on the first run, written from files compiled into the program (nothing is fetched),
//! and removable again with `formvis --remove-launcher`.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

const NAME: &str = "ai.nodemode.formvis";
const ENTRY: &str = include_str!("../../packaging/linux/ai.nodemode.formvis.desktop");
const MIME: &str = include_str!("../../packaging/linux/ai.nodemode.formvis.xml");
const ICON: &[u8] = include_bytes!("../icons/128x128.png");
const LAUNCH: &str = include_str!("../../packaging/linux/formvis-launch");
const CHECK: &str = include_str!("../../setup/libcheck");

/// The AppImage that is running, from the variable its runtime sets.
pub fn appimage() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|path| path.is_file())
}

fn data_home() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local").join("share")))
}

/// A path as the Exec key wants it: in double quotes, with the quote, back tick, dollar and backslash escaped, and a percent doubled.
fn exec_quote(path: &str) -> String {
    let mut out = String::from("\"");
    for c in path.chars() {
        match c {
            '\\' => out.push_str("\\\\\\\\"),
            '"' | '`' | '$' => {
                out.push('\\');
                out.push(c);
            }
            '%' => out.push_str("%%"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

/// The start-up wrapper the launcher runs: the one lying beside the AppImage when there is one, else the copy written into the
/// person's data folder (with the library check it runs first).
fn wrapper(image: &Path, home: &Path) -> PathBuf {
    let beside = image.with_file_name("formvis-launch");
    if beside.is_file() {
        beside
    } else {
        home.join("formvis").join("formvis-launch")
    }
}

/// The packaged desktop file with its Exec line starting this AppImage through the wrapper.
fn entry_text(image: &Path, home: &Path) -> String {
    let path = image.to_string_lossy();
    let wrap = wrapper(image, home);
    let wrap = wrap.to_string_lossy();
    let mut out = String::new();
    for line in ENTRY.lines() {
        if line.starts_with("Exec=") {
            out.push_str(&format!(
                "Exec=env {} {} %F\nTryExec={}\n",
                exec_quote(&format!("FORMVIS_PROGRAM={path}")),
                exec_quote(&wrap),
                wrap
            ));
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

fn entry_path(home: &Path) -> PathBuf {
    home.join("applications").join(format!("{NAME}.desktop"))
}

fn files(home: &Path) -> [PathBuf; 5] {
    [
        home.join("formvis").join("formvis-launch"),
        home.join("formvis").join("libcheck"),
        entry_path(home),
        home.join("icons")
            .join("hicolor")
            .join("128x128")
            .join("apps")
            .join(format!("{NAME}.png")),
        home.join("mime").join("packages").join(format!("{NAME}.xml")),
    ]
}

fn refresh(home: &Path) {
    for (program, folder) in [
        ("update-desktop-database", home.join("applications")),
        ("update-mime-database", home.join("mime")),
    ] {
        let _ = Command::new(program)
            .arg(folder)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

/// Writes the launcher, the icon and the file types for this AppImage into the person's data folder.
pub fn add(image: &Path) -> Result<(), String> {
    let home = data_home().ok_or_else(|| "there is no home folder to put the launcher in".to_string())?;
    let [launch, check, entry, icon, mime] = files(&home);
    for (file, bytes) in [
        (launch, LAUNCH.as_bytes().to_vec()),
        (check, CHECK.as_bytes().to_vec()),
        (entry, entry_text(image, &home).into_bytes()),
        (icon, ICON.to_vec()),
        (mime, MIME.as_bytes().to_vec()),
    ] {
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|err| format!("{}: {err}", dir.display()))?;
        }
        std::fs::write(&file, bytes).map_err(|err| format!("{}: {err}", file.display()))?;
        #[cfg(unix)]
        if file.file_name().is_some_and(|name| name == "formvis-launch") {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755));
        }
    }
    refresh(&home);
    Ok(())
}

/// Takes the files `add` wrote away again.
pub fn remove() -> Result<(), String> {
    let home = data_home().ok_or_else(|| "there is no home folder".to_string())?;
    for file in files(&home) {
        let _ = std::fs::remove_file(file);
    }
    refresh(&home);
    Ok(())
}

fn marker(handle: &tauri::AppHandle) -> Option<PathBuf> {
    handle.path().app_config_dir().ok().map(|dir| dir.join("launcher"))
}

fn keep(marker: &Path, answer: &str) {
    if let Some(dir) = marker.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(marker, answer);
}

/// The first run of an AppImage: asks once whether to add formvis to the applications menu and keeps the answer ("added" or
/// "declined") in the config folder. After "added" the launcher is written again when the AppImage has moved, unless the
/// person removed it.
pub fn first_run(handle: &tauri::AppHandle) {
    let (Some(image), Some(marker)) = (appimage(), marker(handle)) else {
        return;
    };
    match std::fs::read_to_string(&marker).unwrap_or_default().trim() {
        "declined" => {}
        "added" => {
            let moved = data_home().and_then(|home| std::fs::read_to_string(entry_path(&home)).ok().map(|text| (text, entry_text(&image, &home)))).is_some_and(|(text, wanted)| text != wanted);
            if moved {
                let _ = add(&image);
            }
        }
        _ => handle
            .dialog()
            .message("Add formvis to your applications menu? This puts a launcher, an icon and the picture file types in your own applications folder. Nothing is installed for other users and nothing is sent anywhere. formvis --remove-launcher takes it out again.")
            .title("formvis")
            .buttons(MessageDialogButtons::YesNo)
            .show(move |yes| keep(&marker, if yes && add(&image).is_ok() { "added" } else { "declined" })),
    }
}

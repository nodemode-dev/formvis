use serde::Serialize;

/// The monitor's ICC profile for the page (DEV_PLAN 28.2): the operating system's own answer, read here, then drawn
/// through by the canvas as a document-to-monitor table. macOS asks ColorSync for the main display's colour space and
/// its ICC data; Windows asks GDI for the profile file of the screen device context (`GetICMProfileW`); Linux reads the
/// `_ICC_PROFILE` property on the X11 root window, which colour daemons and `dispwin` set, and falls back to colord's
/// `colormgr` where there is no such property (Wayland sessions). `FORMVIS_DISPLAY_PROFILE` names a profile file to use
/// instead, for a screen the system does not describe.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayProfile {
    pub available: bool,
    pub source: &'static str,
    pub icc: Option<String>,
    pub bytes: usize,
    pub note: String,
    /// The screen the profile was read for (0 is the first).
    pub monitor: usize,
}

const MAX_BYTES: usize = 8 * 1024 * 1024;

fn valid(data: &[u8]) -> Result<(), String> {
    if data.len() < 132 || &data[36..40] != b"acsp" {
        return Err("the data is not an ICC profile".into());
    }
    if data.len() > MAX_BYTES {
        return Err("the profile is larger than 8 MB".into());
    }
    Ok(())
}

fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = (u32::from(chunk[0]) << 16) | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8) | u32::from(*chunk.get(2).unwrap_or(&0));
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

/// The X property for screen `index` under the ICC Profiles in X convention: `_ICC_PROFILE` for the first screen and
/// `_ICC_PROFILE_<n>` for screen n. A later screen without its own property reads the first screen's, as a single
/// profile set by a daemon for every screen is common.
#[cfg(target_os = "linux")]
fn x11(index: usize) -> Result<Vec<u8>, String> {
    if index > 0 {
        if let Ok(data) = x11_atom(&format!("_ICC_PROFILE_{index}")) {
            return Ok(data);
        }
    }
    x11_atom("_ICC_PROFILE")
}

#[cfg(target_os = "linux")]
fn x11_atom(property: &str) -> Result<Vec<u8>, String> {
    use std::ffi::{c_void, CString};
    use std::os::raw::{c_int, c_long, c_uchar, c_ulong};
    use x11_dl::xlib::{AnyPropertyType, False, Xlib};
    const WORDS: c_long = 2_100_000;
    if std::env::var_os("DISPLAY").map_or(true, |d| d.is_empty()) {
        return Err("there is no X display (DISPLAY is not set)".into());
    }
    let xlib = Xlib::open().map_err(|_| "libX11 could not be loaded".to_string())?;
    unsafe {
        let display = (xlib.XOpenDisplay)(std::ptr::null());
        if display.is_null() {
            return Err("the X display could not be opened".into());
        }
        let root = (xlib.XDefaultRootWindow)(display);
        let name = CString::new(property).map_err(|e| e.to_string())?;
        let atom = (xlib.XInternAtom)(display, name.as_ptr(), False);
        let (mut kind, mut format, mut count, mut after): (c_ulong, c_int, c_ulong, c_ulong) = (0, 0, 0, 0);
        let mut data: *mut c_uchar = std::ptr::null_mut();
        let status = (xlib.XGetWindowProperty)(display, root, atom, 0, WORDS, False, AnyPropertyType as c_ulong, &mut kind, &mut format, &mut count, &mut after, &mut data);
        let out = if status == 0 && !data.is_null() && format == 8 && count > 0 {
            Ok(std::slice::from_raw_parts(data, count as usize).to_vec())
        } else {
            Err(format!("the X root window has no {property} property (no profile is installed for this screen; request {status}, format {format}, items {count})"))
        };
        if !data.is_null() {
            (xlib.XFree)(data as *mut c_void);
        }
        (xlib.XCloseDisplay)(display);
        out
    }
}

#[cfg(target_os = "linux")]
fn colord() -> Result<Vec<u8>, String> {
    use std::process::Command;
    let field = |text: &str, key: &str| -> Option<String> {
        text.lines().find_map(|l| l.trim().strip_prefix(key).map(|v| v.trim().to_string())).filter(|v| !v.is_empty())
    };
    let run = |args: &[&str]| -> Result<String, String> {
        let out = Command::new("colormgr").args(args).output().map_err(|_| "colord's colormgr is not installed".to_string())?;
        if !out.status.success() {
            return Err("colord did not answer".into());
        }
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    };
    let devices = run(&["get-devices-by-kind", "display"])?;
    let device = field(&devices, "Object Path:").ok_or_else(|| "colord lists no display".to_string())?;
    let profile = run(&["device-get-default-profile", &device])?;
    let file = field(&profile, "Filename:").ok_or_else(|| "colord has no profile for the display".to_string())?;
    std::fs::read(&file).map_err(|e| format!("{file}: {e}"))
}

#[cfg(target_os = "linux")]
fn system(index: usize) -> Result<(&'static str, Vec<u8>), String> {
    match x11(index) {
        Ok(data) => Ok(("x11", data)),
        Err(first) => colord().map(|data| ("colord", data)).map_err(|second| format!("{first}; {second}")),
    }
}

#[cfg(target_os = "macos")]
fn system(_index: usize) -> Result<(&'static str, Vec<u8>), String> {
    use std::ffi::c_void;
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGMainDisplayID() -> u32;
        fn CGDisplayCopyColorSpace(display: u32) -> *mut c_void;
        fn CGColorSpaceCopyICCData(space: *mut c_void) -> *const c_void;
        fn CGColorSpaceRelease(space: *mut c_void);
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFDataGetLength(data: *const c_void) -> isize;
        fn CFDataGetBytePtr(data: *const c_void) -> *const u8;
        fn CFRelease(object: *const c_void);
    }
    unsafe {
        let space = CGDisplayCopyColorSpace(CGMainDisplayID());
        if space.is_null() {
            return Err("ColorSync has no colour space for the main display".into());
        }
        let data = CGColorSpaceCopyICCData(space);
        CGColorSpaceRelease(space);
        if data.is_null() {
            return Err("the main display's colour space has no ICC data".into());
        }
        let bytes = std::slice::from_raw_parts(CFDataGetBytePtr(data), CFDataGetLength(data).max(0) as usize).to_vec();
        CFRelease(data);
        Ok(("colorsync", bytes))
    }
}

#[cfg(windows)]
fn system(_index: usize) -> Result<(&'static str, Vec<u8>), String> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStringExt;
    #[link(name = "user32")]
    extern "system" {
        fn GetDC(window: *mut c_void) -> *mut c_void;
        fn ReleaseDC(window: *mut c_void, dc: *mut c_void) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn GetICMProfileW(dc: *mut c_void, size: *mut u32, name: *mut u16) -> i32;
    }
    unsafe {
        let dc = GetDC(std::ptr::null_mut());
        if dc.is_null() {
            return Err("the screen's device context could not be opened".into());
        }
        let mut size: u32 = 0;
        GetICMProfileW(dc, &mut size, std::ptr::null_mut());
        if size == 0 {
            ReleaseDC(std::ptr::null_mut(), dc);
            return Err("Windows has no colour profile for the screen".into());
        }
        let mut name = vec![0u16; size as usize];
        let ok = GetICMProfileW(dc, &mut size, name.as_mut_ptr());
        ReleaseDC(std::ptr::null_mut(), dc);
        if ok == 0 {
            return Err("Windows has no colour profile for the screen".into());
        }
        let end = name.iter().position(|&c| c == 0).unwrap_or(name.len());
        let path = std::ffi::OsString::from_wide(&name[..end]);
        std::fs::read(&path).map(|data| ("windows", data)).map_err(|e| format!("{}: {e}", path.to_string_lossy()))
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn system(_index: usize) -> Result<(&'static str, Vec<u8>), String> {
    Err("this system has no display profile source".into())
}

/// What the system says about the profile of screen `index` (0 is the first), as the page's `display_profile` command returns it.
pub fn read(index: usize) -> DisplayProfile {
    let found = match std::env::var("FORMVIS_DISPLAY_PROFILE") {
        Ok(path) if !path.is_empty() => std::fs::read(&path).map(|data| ("file", data)).map_err(|e| format!("FORMVIS_DISPLAY_PROFILE {path}: {e}")),
        _ => system(index),
    };
    match found.and_then(|(source, data)| valid(&data).map(|_| (source, data))) {
        Ok((source, data)) => DisplayProfile { available: true, source, bytes: data.len(), icc: Some(base64(&data)), note: String::new(), monitor: index },
        Err(note) => DisplayProfile { available: false, source: "none", bytes: 0, icc: None, note, monitor: index },
    }
}

/// The place of the screen the window is on among the system's screens, ordered by position (left to right, then top
/// to bottom) as the X screens of a side-by-side setup are numbered; 0 when it cannot be told.
fn monitor_index(window: &tauri::WebviewWindow) -> usize {
    let (Ok(Some(current)), Ok(mut all)) = (window.current_monitor(), window.available_monitors()) else { return 0 };
    all.sort_by_key(|m| (m.position().x, m.position().y));
    all.iter().position(|m| m.position() == current.position() && m.size() == current.size()).unwrap_or(0)
}

#[tauri::command]
pub fn display_profile(window: tauri::WebviewWindow) -> DisplayProfile {
    read(monitor_index(&window))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard_alphabet_and_padding() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn a_file_that_is_not_a_profile_is_refused() {
        assert!(valid(b"not a profile").is_err());
        let mut data = vec![0u8; 200];
        data[36..40].copy_from_slice(b"acsp");
        assert!(valid(&data).is_ok());
    }

    /// Sets `_ICC_PROFILE` on the root window as a colour daemon does, then reads it back through `read`; runs where
    /// an X server is (xvfb-run cargo test), reports and passes where there is none.
    #[cfg(target_os = "linux")]
    #[test]
    fn the_x11_root_window_property_is_read_back() {
        use std::ffi::CString;
        use x11_dl::xlib::{PropModeReplace, Xlib, XA_CARDINAL};
        let status_without = serde_json::to_string(&read(0)).unwrap();
        println!("status before: {status_without}");
        if std::env::var_os("DISPLAY").map_or(true, |d| d.is_empty()) {
            println!("no X display here; the status above is what the page would receive");
            return;
        }
        std::env::remove_var("FORMVIS_DISPLAY_PROFILE");
        let mut profile = vec![0u8; 3000];
        profile[..4].copy_from_slice(&3000u32.to_be_bytes());
        profile[36..40].copy_from_slice(b"acsp");
        for (i, b) in profile.iter_mut().enumerate().skip(132) {
            *b = (i % 251) as u8;
        }
        let xlib = Xlib::open().expect("libX11");
        let keep = unsafe {
            let display = (xlib.XOpenDisplay)(std::ptr::null());
            assert!(!display.is_null());
            let root = (xlib.XDefaultRootWindow)(display);
            let atom = (xlib.XInternAtom)(display, CString::new("_ICC_PROFILE").unwrap().as_ptr(), 0);
            (xlib.XChangeProperty)(display, root, atom, XA_CARDINAL, 8, PropModeReplace, profile.as_ptr(), profile.len() as i32);
            (xlib.XSync)(display, 0);
            display
        };
        let got = read(0);
        println!("status after: {}", serde_json::to_string(&DisplayProfile { icc: got.icc.as_ref().map(|s| format!("<{} base64 characters>", s.len())), ..got }).unwrap());
        let again = read(0);
        assert!(again.available, "{}", again.note);
        assert_eq!(again.source, "x11");
        assert_eq!(again.bytes, profile.len());
        assert_eq!(again.icc.unwrap(), base64(&profile));
        // A second screen with its own _ICC_PROFILE_1 reads that one; a third without one reads the first screen's.
        let mut second = profile.clone();
        second.truncate(2000);
        second[..4].copy_from_slice(&2000u32.to_be_bytes());
        unsafe {
            let root = (xlib.XDefaultRootWindow)(keep);
            let atom = (xlib.XInternAtom)(keep, CString::new("_ICC_PROFILE_1").unwrap().as_ptr(), 0);
            (xlib.XChangeProperty)(keep, root, atom, XA_CARDINAL, 8, PropModeReplace, second.as_ptr(), second.len() as i32);
            (xlib.XSync)(keep, 0);
        }
        let on_second = read(1);
        assert_eq!((on_second.bytes, on_second.monitor), (2000, 1));
        assert_eq!(on_second.icc.unwrap(), base64(&second));
        assert_eq!(read(2).bytes, profile.len());
        unsafe {
            let root = (xlib.XDefaultRootWindow)(keep);
            let atom = (xlib.XInternAtom)(keep, CString::new("_ICC_PROFILE_1").unwrap().as_ptr(), 0);
            (xlib.XDeleteProperty)(keep, root, atom);
            (xlib.XCloseDisplay)(keep)
        };
    }
}

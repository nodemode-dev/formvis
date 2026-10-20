// The window shows the page the engine serves on 127.0.0.1, which Tauri treats as a remote origin: commands reach it
// only through a capability with a remote URL list, and an app command needs a generated "allow-<name>" permission.
const APP_COMMANDS: &[&str] = &[
    "system_fonts",
    "pick_image_path",
    "display_profile",
    "native_start",
    "native_stop",
    "native_doc",
    "native_put",
    "native_table",
    "native_table3",
    "native_stack",
    "native_remove",
    "native_present",
    "take_pending_opens",
    "confirm_exit",
    "check_for_update",
    "install_update",
    "set_display_server",
    "system_fonts_english",
    "ui_zoom",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to run the Tauri build step");
}

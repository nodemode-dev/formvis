---
name: desktop-shell
description: The sonny desktop app built with Tauri 2 and a PyInstaller sidecar. Use for src-tauri, tauri.conf.json, main.rs, the frozen sonny-engine sidecar, the port handshake, the splash window, app icons, macOS, Linux and Windows bundles, the desktop release workflow, signing, or a desktop app that starts to a blank window or an engine error.
---

# desktop-shell

The desktop app is a thin Tauri shell around the same engine, frozen with PyInstaller. It follows the tauri-compiler-skill sidecar template.

## Flow

1. `setup/freeze_backend` runs PyInstaller one-file on `backend/sonny_engine.py`, bundles `frontend/dist` as `frontend_dist`, excludes `pillow_heif`, and copies the result to `src-tauri/binaries/sonny-engine-TARGET_TRIPLE`, then runs `--selfcheck`.
2. `src-tauri/src/main.rs` shows the splash, spawns the sidecar with `SONNY_PORT=0`, reads `http://127.0.0.1:PORT` from its output, opens the main window at 90 percent of the screen, closes the splash, and kills the engine on exit. If no port appears, it shows a dialog and quits.
3. `setup/desktop_build` builds the frontend, freezes, generates icons from `assets/sonny_icon.png` when `src-tauri/icons/icon.icns` is missing, and runs `tauri build`.
4. `.github/workflows/desktop.yml` builds macOS arm64, Linux x64 and Windows x64 and drafts a release on `v*.*.*` tags.

## Rules

- The sidecar name stays `sonny-engine` in `tauri.conf.json` and `main.rs`.
- The app uses no Tauri IPC; adding any needs a capability review in `src-tauri/capabilities/`.
- Nothing GPL goes into the frozen engine; rembg only with `SONNY_FREEZE_ML=1`.
- Versions in `Cargo.toml` and `tauri.conf.json` move with the rest.

## Open items

Signing identities (Apple Developer ID, Windows) and an updater feed are not set up; bundles are unsigned. The shell has not been compiled yet, so the first desktop workflow run is its proof.

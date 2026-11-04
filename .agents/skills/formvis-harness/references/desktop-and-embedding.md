# Desktop shell and NodeMode embedding

Carried over from the former `desktop-shell` and `nodemode-embed` sub-skills.

## Desktop app (Tauri 2 with a PyInstaller sidecar)

The desktop app is a thin Tauri shell around the same engine, frozen with PyInstaller.

1. `setup/freeze_backend` runs PyInstaller one-file on `backend/formvis_engine.py`, bundles `frontend/dist` as `frontend_dist`, excludes `pillow_heif`, copies the result to `src-tauri/binaries/formvis-engine-[target triple]`, then runs `--selfcheck`.
2. `src-tauri/src/main.rs` shows the splash, spawns the sidecar with `FORMVIS_PORT=0`, reads `http://127.0.0.1:PORT` from its output, opens the main window at 90 percent of the screen, closes the splash, and kills the engine on exit. If no port appears, it shows a dialog and quits.
3. `setup/desktop_build` builds the frontend, freezes, generates icons from `assets/formvis_icon.png` when `src-tauri/icons/icon.icns` is missing, and runs `tauri build`. `./build_app` wraps all of it.
4. formvis builds nothing in its repository. After the version bump lands on main, push a branch `compile_vX.Y.Z` cut from main's head; formcompiler (nodemode-dev/formcompiler) picks it up on its 8-hourly watch or a manual run, builds every target with `setup/package_desktop.py`, and opens a draft release `formvis-vX.Y.Z` on its release page for review. formcompiler holds the Apple and Windows signing identities and the updater key; the app reads updates from formcompiler's `formvis-updates` feed.

Rules:

- The sidecar name stays `formvis-engine` in `tauri.conf.json` and `main.rs`.
- The page uses no Tauri IPC except the font list, the native GPU canvas commands (`src-tauri/src/native.rs`) and the macOS menu; adding any needs a capability review in `src-tauri/capabilities/default.json`.
- Nothing GPL goes into the frozen engine; rembg only with `FORMVIS_FREEZE_ML=1`.
- Versions in `Cargo.toml`, `Cargo.lock` and `tauri.conf.json` move with the rest (see `release-keeper`).
- `src-tauri/binaries/*` is git-ignored except `.gitkeep`; `src-tauri/target/` and `src-tauri/gen/` are build output. `./build_app` builds Rust in a local cache instead (from 1.85.1: `~/Library/Caches/formvis/tauri-target` on macOS, `~/.cache/formvis/tauri-target` on Linux, `FORMVIS_CARGO_TARGET` overrides), because a synced project folder can hold back freshly built derive crates (E0463 "can't find crate for `zerofrom_derive`"); the bundle is under that folder's `release/bundle`. A failed compile prints a diagnosis and retries once with one job.

Open items: signing identities (Apple Developer ID, Windows) and the updater key are not set up unless the secrets in `.docs/wiki/Releasing.md` exist; unsigned bundles warn on first run.

## NodeMode embedding

Inside NodeMode, formvis is a full-screen portal panel in an iframe.

Protocol (`frontend/src/host.ts`):

| Message | Direction | Content |
| --- | --- | --- |
| `ready` | formvis to host | Posted only after the message listener is attached |
| `init` | host to formvis | `pluginId`, `panelId`, optional state |
| `plugin:[pluginId]:assign` | formvis to host | `payload.files`: `name`, `mime`, `width`, `height`, `dataUrl` |
| `save`, `close` | both | Portal save and close |

Accept messages only when `event.source` is `window.parent`.

Theme bridge:

- The host copies its live tokens onto the iframe root, mirrors `theme-light` onto the body, and flips `data-theme` only when the root already has that attribute, so `frontend/index.html` ships `data-theme="dark"`.
- `startApp` observes root style and class changes plus `nm:ui-settings-changed`, then repaints the stage and thumbnails without rebuilding anything.
- Standalone and embedded share the `nodemode_ui_settings` storage key on the same origin, so the pre-paint theme boot already matches the host. `index.html`'s theme-boot table must keep the same 14 profile ids as `frontend/src/ui/themes.ts`.

Open item: the host-side handler for `assign` is not confirmed. Keep the payload shape stable until it is.

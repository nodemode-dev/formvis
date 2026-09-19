# Desktop

The desktop app is a thin Tauri 2 shell around the same engine, frozen with PyInstaller into a sidecar. The shell shows a splash, starts the engine on port 0, reads the real port from the engine's startup line, opens a window at 90 percent of the screen pointed at the engine, and stops the engine on exit.

| Source path | What lives there |
| --- | --- |
| `src-tauri/src/main.rs` | Sidecar spawn, port handshake, window sizing, failure dialog, shutdown |
| `src-tauri/tauri.conf.json` | Identity `ai.nodemode.sonny`, splash window, bundle targets, `externalBin` |
| `src-tauri/capabilities/default.json` | Window permissions; the app uses no Tauri IPC |
| `setup/freeze_backend` | PyInstaller one-file build, named `sonny-engine-<target triple>` |
| `setup/desktop_build`, `setup/desktop_dev` | Bundle and dev flows |
| `.github/workflows/desktop.yml` | macOS arm64, Linux x64 and Windows x64 bundles, draft release on tags |

## Contract

- The sidecar name in `externalBin` and in `main.rs` stays `sonny-engine`.
- The engine prints `http://127.0.0.1:<port>` on start; the shell depends on that line.
- Nothing GPL goes into the frozen engine.
- Signing identities are not configured yet; bundles are unsigned.

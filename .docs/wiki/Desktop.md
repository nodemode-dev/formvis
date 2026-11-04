# Desktop

The desktop app is a thin Tauri 2 shell around the same engine, frozen with PyInstaller into a sidecar. The shell shows a splash, starts the engine on port 0, reads the real port from the engine's startup line, opens a window at 90 percent of the screen pointed at the engine, and stops the engine on exit.

| Source path | What lives there |
| --- | --- |
| `src-tauri/src/main.rs` | Sidecar spawn, port handshake, window sizing, failure dialog, shutdown |
| `src-tauri/src/window_state.rs` | The window's size, position and maximised state (`window.json` in the config folder), the interface zoom the page asks for (`ui_zoom`), and the reload of a web view whose renderer died (Linux) |
| `src-tauri/src/packaged.rs`, `src-tauri/src/integration.rs` | The binary's `mcp` and `agents install` arguments, and the AppImage's applications-menu launcher (`--add-launcher`, `--remove-launcher`; asked once on the first run) |
| `src-tauri/tauri.conf.json` | Identity `ai.nodemode.formvis`, splash window, bundle targets, `externalBin` |
| `src-tauri/capabilities/default.json` | Window permissions; the app uses no Tauri IPC |
| `setup/freeze_backend` | PyInstaller one-file build, named `formvis-engine-<target triple>` |
| `setup/desktop_build`, `setup/desktop_dev` | Bundle and dev flows |
| `setup/package_desktop.py` | The packaging steps formcompiler (nodemode-dev/formcompiler) runs after `tauri build`; it builds and drafts `formvis-vX.Y.Z` from a `compile_vX.Y.Z` branch, formvis builds nothing itself |

## Contract

- The sidecar name in `externalBin` and in `main.rs` stays `formvis-engine`.
- The engine prints `http://127.0.0.1:<port>` on start; the shell depends on that line.
- The engine keeps its real port, with its process id, in `engine.port` in the data folder while it runs. An agent is registered with the app's own program (`$APPIMAGE mcp`, or the app bundle's binary with `mcp`): that mode is `setup/mcp_stdio.py` run by the frozen engine, which starts the app when none is running. `formvis agents install` registers the same program with Claude Code, Codex and Cursor.
- The interface scale is applied by the shell to the web view (`ui_zoom`) and kept for the next launch; the browser build and a shell that refuses use CSS zoom.
- A web view whose renderer process dies is reloaded at most twice in a minute, then the shell says so and leaves it (Linux only; Windows and macOS report it through their own APIs, not wired yet).
- Nothing GPL goes into the frozen engine.
- Signing identities are not configured yet; bundles are unsigned.

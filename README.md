<p align="center"><img src="assets/sonny_folder_icon.png" width="112" alt="sonny"></p>
<h1 align="center">sonny</h1>
<p align="center"><b>Layered image compositing for the web and the desktop, in the NodeMode design system.</b></p>
<p align="center">
<img src="https://img.shields.io/badge/version-0.16.0-f97316" alt="version 0.16.0">
<img src="https://img.shields.io/badge/node-22-339933" alt="node 22">
<img src="https://img.shields.io/badge/python-3.12-3776AB" alt="python 3.12">
<img src="https://img.shields.io/badge/tauri-2-24C8DB" alt="tauri 2">
<img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="MIT license">
</p>

## What it is

sonny is a layered image editor: stack photos and paintings as layers, group them in folders, mask and clip them, blend them with 13 modes, select, paint and export. It is a port of the macOS app the reference app to the web, keeping the reference app's document model and project format so `.ref` projects open unchanged, and it runs standalone in a browser, inside NodeMode as a portal app, or as a desktop app for macOS, Linux and Windows.

**Stack.** Vanilla TypeScript 7 and Vite 8 · Python 3.12 and FastAPI · Tauri 2 · about 9,387 lines of TypeScript, 426 of CSS, 701 of Python and 112 of Rust.

## Highlights

- **the reference app document model.** Flat bottom-to-top layers w/ pass-through folders, 13 blend modes mapped 1:1 to Canvas 2D, raster masks, folder masks, clipping chains (Option-click a row's lower edge to clip or release), Option-drag mask copy, and value-snapshot history (100 steps, 256 MB).
- **Opens the reference app projects.** Reads `.ref` packages (zipped or as folders, format versions 1 to 7) and saves `.sonny` w/ the same manifest field layout.
- **All fourteen of the reference app's tools.** Move w/ transform handles, Marquee, Lasso, Magic Wand, Crop, Brush and Eraser, Spot Healing (Content-Aware, Create Texture, Proximity Match), Clone Stamp, Smear (Liquify, Blur, Smudge), Gradient, Shape, Eyedropper, Hand, Zoom; each is a self-registering extension module. Content-Aware Fill works from the Edit menu.
- **Adjustments and filters.** Levels w/ histogram, Auto and black, gray and white eyedroppers; Curves; Hue/Saturation w/ spectrum band handles, Sample, Add and Remove eyedroppers and targeted adjustment; Exposure, Gradient Map and Grain; as editable adjustment layers or direct edits; Gaussian Blur, Motion Blur, Add Noise and Lens Correction; all ported from the reference app's source, w/ live preview.
- **Precise transforms.** Move snaps to the canvas and other layers w/ guides and takes exact X, Y, W, H, Scale and Angle values; drag inside a selection to move or duplicate its pixels; Transform Selection (Alt+Mod+T) floats them w/ handles and merges back, growing the layer past its edges.
- **Clipboard, selections, canvas.** Cut, Copy, Copy Merged, Paste in place and Layer via Copy; Expand, Contract and Mask's Black Areas; arrow-key nudging, marquee autoscroll, Anti-alias, and the Magic Wand's Sample Size; Canvas Size w/ anchors and Image Size w/ resampling.
- **Two background removers, one refine panel.** rembg (ML, default when installed) and OpenCV GrabCut (lightweight, always available) feed the reference app's panel: Basic, or Advanced w/ Refine (guided filter, for hair and fur), Contrast and Shift Edge; the result is an editable layer mask, never destroyed pixels.
- **Color picker and JPEG export.** A Photoshop-style picker (saturation and brightness field, hue strip, RGB, hex) that can sample the canvas; a JPEG sheet w/ quality and a live encoded preview.
- **Zero-flash UI.** Keyed DOM patching, a two-canvas stage redrawn synchronously on resize, reveal gated on fonts; verified w/ a 6x CPU and slow-network browser run: layout shift 0, no rebuilt rows, no errors across 18 scripted paths.
- **NodeMode native.** NodeMode tokens and 14 theme profiles, the host theme bridge, the portal ready and init protocol, and a send-to-canvas message.
- **HEIC and TIFF import.** Decoded server-side w/ Pillow and pillow-heif, falling back to `sips` on macOS.

## Quick Start

Requirements: Node 20.19 or newer (22 recommended), Python 3.10 or newer (3.12 recommended), git. The desktop build also needs Rust stable and the Tauri 2 system packages for your OS.

### macOS and Linux

```bash
git clone https://github.com/nodemode-ai/sonny.git
cd sonny
./sonny install
./sonny boot
```

### Windows

```bat
git clone https://github.com/nodemode-ai/sonny.git
cd sonny
sonny.bat install
sonny.bat boot
```

`./sonny install` includes the rembg ML engine (the model download is about 170 MB); `./sonny install --lite` skips it, and Remove Background then uses the lightweight GrabCut engine. `./sonny install-desktop`, then `./sonny desktop dev` or `./sonny desktop build`, for the desktop app. `./sonny help` lists every command.

| Service | URL | Notes |
| --- | --- | --- |
| Frontend (dev) | http://localhost:5190 | Vite, bound to localhost only, strict port |
| Engine | http://127.0.0.1:8190 | FastAPI; API under `/api`; serves the built app in `./sonny serve` |
| Preview | http://localhost:5191 | `vite preview` of the production build |
| Desktop engine | random loopback port | picked by the OS, read by the Tauri shell from the startup line |

## Configuration

The engine reads `backend/.env`, which is never committed; `backend/.env.example` is the template.

| Variable | Purpose |
| --- | --- |
| `SONNY_HOST` | Engine bind address |
| `SONNY_PORT` | Engine port; `0` picks a free port (desktop) |
| `SONNY_DATA_DIR` | Project library and exports root (default `~/Sonny`) |
| `SONNY_CORS_ORIGINS` | Allowed browser origins for the dev frontend |
| `SONNY_REMBG_MODEL` | rembg model name for ML background removal |
| `SONNY_DIST` | Built frontend folder the engine serves |
| `SONNY_FREEZE_ML` | `1` bundles rembg into the frozen desktop engine |
| `SONNY_TARGET` | Target triple override for the frozen sidecar |

## Architecture

```text
sonny/
├── sonny, sonny.bat           root dispatcher: install, boot, build, serve, desktop, doctor
├── sonny_oc_install(.bat)        one-command install
├── setup/                           one script per task, each w/ a .bat twin; lib.sh holds shared helpers
├── assets/                          repo art (README logo, desktop icon source), not app runtime files
├── backend/                         FastAPI engine
│   ├── app/core/config.py           ports, limits, data folders
│   ├── app/routers/                 system, io, projects, ops
│   ├── app/services/                imaging, project_format, sessions, background
│   └── sonny_engine.py           PyInstaller entry for the desktop sidecar
├── frontend/                        Vite app, vanilla TypeScript
│   ├── src/engine/                  document engine, no DOM: layers, renderer, history, selections, strokes
│   ├── src/extensions/              tool registry and one module per tool
│   ├── src/ui/                      shell, stage, layers panel, menus, dialogs, icons, themes
│   ├── src/io/                      engine client, image decoding, project serialization
│   └── src/styles/                  NodeMode tokens and component sheets
├── src-tauri/                       Tauri 2 shell: sidecar spawn, port handshake, window sizing
├── .docs/                           BRANCHING.md and the wiki source
├── .github/workflows/               ci, wiki publish, desktop release matrix
└── .claude/skills/sonny-skillset/  project skill pack
```

## Status by domain

- **Desktop app.** The Tauri shell follows a proven sidecar template, and 0.12.0 wires macOS signing and notarization, the hardened runtime, file associations and in-app updates from GitHub Releases (setup on the wiki's Releasing page). It has not been compiled yet: the build machine for these releases had no Rust toolchain, and the desktop workflow has not run. Treat desktop bundles as untested until the first `desktop.yml` run passes.
- **ML background removal.** Implemented, not yet exercised end to end; the lightweight GrabCut path is verified.
- **Adjustments.** All six kinds render, edit and save, including Levels Auto and eyedroppers (0.6.0, 0.7.0) and Hue/Saturation band handles, eyedroppers and targeted adjustment (0.8.0).
- **Not built yet.** Free distort; opening a clicked file in the running desktop app; `.ref` export. The measured parity scoreboard ships in the planning sidecar.
- **NodeMode embedding.** Follows the portal protocol; the host-side handling of `plugin:sonny:assign` is not confirmed yet.

## Development

Branch model: `main` plus short-lived work branches, see `.docs/BRANCHING.md`. Docs live in `.docs/wiki/` and publish to the GitHub wiki on merge. Contributions follow the dev-rules laws: single-region hand edits, zero DOM flash or re-render, no emoji, no em dash, no icon-library dependencies, `v*.*.*` versions, Conventional Commits. Project skills live in `.claude/skills/sonny-skillset/`; start at its `SKILL.md`. Read `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` before editing.

## Status

Version 0.16.0 has all 14 of the reference app's tools complete (Smear's Blur now works on masks too) and all 59 of its web-relevant menu commands complete, each checked in a browser against predicted pixel values. The Move tool snaps with guides, takes exact X, Y, W, H, Scale and Angle values, and moves or duplicates selected pixels; Transform Selection (Alt+Mod+T) scales and rotates them, growing the layer past its edges. Levels has the reference app's Auto modes and eyedroppers, Hue/Saturation its band handles, eyedroppers and targeted adjustment, Remove Background its Basic and Advanced refine panel, and Export JPEG its quality sheet with a live encoded preview. The foreground and background swatches open the reference app's color picker, which can sample the canvas, and sampling drags show the reference app's sample ring. What remains is mostly in panels outside the menus, listed above. Current focus: free distort and Smear's Blur on masks.

## Contributors

- **nodemode-ai** · owner, port and build
- **its authors** · original the reference app app and document model

## Licensing

MIT. Copyright (c) 2026 nodemode-ai. Portions Copyright (c) 2026 its authors (the reference app, https://github.com/robbietilton/the reference app). See `LICENSE`.

<p align="center"><img src="assets/sonny_folder_icon.png" width="112" alt="sonny"></p>
<h1 align="center">sonny</h1>
<p align="center"><b>Layered image compositing for the web and the desktop, in the NodeMode design system.</b></p>
<p align="center">
<img src="https://img.shields.io/badge/version-1.49.5-f97316" alt="version 1.49.5">
<img src="https://img.shields.io/badge/node-22-339933" alt="node 22">
<img src="https://img.shields.io/badge/python-3.12-3776AB" alt="python 3.12">
<img src="https://img.shields.io/badge/tauri-2-24C8DB" alt="tauri 2">
<img src="https://img.shields.io/badge/license-Apache--2.0-lightgrey" alt="Apache 2.0 license">
</p>

## What it is

sonny is a layered image editor: stack photos and paintings as layers, group them in folders, mask and clip them, blend them, select, paint and export. It saves its own `.sny` projects and opens NodeMode canvasor projects, and it runs standalone in a browser, inside NodeMode as a portal app, or as a desktop app for macOS, Linux and Windows.

**Stack.** Vanilla TypeScript 7 and Vite 8 · Python 3.12 and FastAPI · Tauri 2 · about 29,000 lines of TypeScript, 1,100 of CSS, 1,300 of Python and 2,200 of Rust (product code, tests excluded; `./sonny counts` prints this, and `./sonny counts --check` verifies it).

## Highlights

- **Layered document model.** Flat bottom-to-top layers w/ pass-through folders, 27 blend modes in Photoshop's order (17 drawn by Canvas 2D itself, 10 computed per pixel), raster masks, folder masks, clipping chains (Option-click a row's lower edge to clip or release), Option-drag mask copy, and value-snapshot history (100 steps, 256 MB).
- **Its own project files.** Saves `.sny` (and still opens `.sonny` from before 0.90.0), opens NodeMode canvasor projects (`.canvasor`, version 1), and opens `.comp` projects so they can be moved to sonny (it never writes `.comp`).
- **Thirty-eight tools.** Move w/ transform handles, Marquee (and Single Row and Column), Lasso (and Polygonal and Magnetic), Object Selection (click an object to select it; SAM 2.1 in the engine, installed w/ `./sonny install-ml`), Quick Selection, Magic Wand, Selection Brush, Crop, Brush, Pencil (hard pixel-exact lines, Auto Erase), Eraser, Background Eraser, Magic Eraser (the Brush's Brush Settings have tip shape, shape dynamics w/ pen pressure, tilt and rotation, scattering, texture and dual brush), Spot Healing (Content-Aware, Create Texture, Proximity Match), Remove, Healing Brush, Patch, Clone Stamp, Pattern Stamp, History Brush (paints back a snapshot), Smear (Liquify, Blur, Sharpen, Smudge), Dodge, Burn, Sponge, Gradient, Paint Bucket, Shape, Path Selection, Direct Selection, Pen, Freeform Pen, Curvature Pen, Convert Point, Type, Frame (an imported image fills it), Eyedropper, Hand and Zoom; each is a self-registering extension module. Content-Aware Fill works from the Edit menu.
- **Adjustments and filters.** Twenty adjustment kinds: Levels w/ histogram, Auto and black, gray and white eyedroppers; Curves; Hue/Saturation w/ spectrum band handles, Sample, Add and Remove eyedroppers and targeted adjustment; Exposure, Brightness/Contrast, Vibrance, Color Balance, Black & White, Photo Filter, Channel Mixer, Selective Color, Shadows/Highlights, HDR Toning, Color Lookup (3D LUT .cube files or built-in looks), Gradient Map, Invert, Posterize, Threshold, Grain and Develop; as editable adjustment layers or direct edits. Sixteen filters: Liquify, Develop, Gaussian Blur, Lens Blur, Motion Blur, Radial Blur (Spin and Zoom), Surface Blur, the Blur Gallery's Field, Iris, Tilt-Shift and Path Blur, Add Noise, Lens Correction, Smart Sharpen, Shake Reduction and Unsharp Mask, w/ live preview.
- **Healing.** Spot Healing, the Healing Brush (Alt-click a source) and the Patch tool blend copied texture into its surroundings; Shift+J cycles them.
- **Paths.** The Pen draws Bezier paths and Direct Selection reshapes them; a path becomes a selection (Ctrl or Cmd with Enter) or is filled or stroked into a layer. Paths save with the project, and the Pen adds or deletes points on them. A Paths panel keeps named paths, and a path can become a shape layer whose outline stays editable. Shape layers take a fill, a stroke or both, and travel to and from Photoshop as shapes.
- **Actions and Batch.** Record commands, filters, adjustments, layer styles and size changes into actions, replay them, share them as JSON, and batch-process a set of images into one zip. Size steps can follow each image. Stops and dialog pauses let an action wait for input.
- **Smart objects.** Keep a layer's original pixels, with filters on it that stay editable, can be hidden or removed, and re-render from the original. Edit Contents opens the original as its own document; saving it updates the object. Distort and Perspective stay editable on them. They travel to and from Photoshop as smart objects.
- **Animation.** A Timeline of frames, each keeping layer visibility, opacity and position with a delay, tweened, reordered by dragging, played in a preview and exported as an animated GIF.
- **History.** A History panel lists every step kept; clicking one goes back or forward to it. Snapshots keep states to return to at any time.
- **Photoshop files.** Open layered `.psd` and `.psb` files and export to them, keeping layers, folders, masks, clipping, opacity, blend modes, visibility and live adjustment layers.
- **Layer styles.** Drop Shadow, Outer Glow, Stroke, Inner Shadow, Inner Glow, Satin, Bevel and Emboss, and Color, Gradient and Pattern Overlay for any pixel layer, drawn from its visible pixels and previewed live; copy, paste and clear them across layers. They save in `.sny` projects.
- **Graphics processor.** The canvas draws through WebGPU (Metal on macOS, Direct3D 12 on Windows) or WebGL2 (as on Linux), with every blend mode but Dissolve, masks, folders, clipping, adjustment layers and layer styles, falling back to the CPU per document with the reason in the status bar; the engine's models run on CUDA, Core ML (Metal) or the CPU (Preferences > Performance); Help > Performance Benchmark times both paths.
- **Type.** The Type tool adds editable text layers, typed straight onto the canvas, in any font on this machine (in Chromium, the full system list with your permission), with size, line height, tracking, kerning, alignment, bold, italic and colour, and Warp Text's fifteen styles, kept editable, and type set along a pen path, and paragraph styles kept in the document; painting on type turns it into pixels.
- **Generative Fill, Expand and Upscale (optional).** Edit > Generative Fill paints a selection from a prompt, or removes what it covers with an empty prompt, through FLUX.1 Fill and Erase on fal; Image > Generative Expand grows the canvas and fills the new border; Image > Upscale enlarges 2 or 4 times with Real-ESRGAN. Set `FAL_KEY` or paste a key into the dialog once; the engine keeps it. Filter > Develop adds Camera Raw-style tone, colour and detail controls.
- **Precise transforms.** Move snaps to the canvas and other layers w/ guides and takes exact X, Y, W, H, Scale and Angle values; several selected layers, or a folder, transform together; drag inside a selection to move or duplicate its pixels; Transform Selection (Alt+Mod+T) floats them w/ handles and merges back, growing the layer past its edges.
- **Clipboard, selections, canvas.** Cut, Copy, Copy Merged, Paste in place and Layer via Copy; Expand, Contract and Mask's Black Areas; arrow-key nudging, marquee autoscroll, Anti-alias, and the Magic Wand's Sample Size; Canvas Size w/ anchors and Image Size w/ resampling.
- **Two background removers, one refine panel.** rembg (ML, default when installed) and OpenCV GrabCut (lightweight, always available) feed Basic, or Advanced w/ Refine (guided filter, for hair and fur), Contrast and Shift Edge; the result is an editable layer mask, never destroyed pixels.
- **Color picker and JPEG export.** A Photoshop-style picker (saturation and brightness field, hue strip, RGB, hex) that can sample the canvas; a JPEG sheet w/ quality and a live encoded preview.
- **Zero-flash UI.** Keyed DOM patching, a two-canvas stage redrawn synchronously on resize, reveal gated on fonts; each interface change is verified w/ a 6x CPU and slow-network browser run: layout shift 0, no rebuilt rows, no errors.
- **NodeMode native.** NodeMode tokens and 14 theme profiles, the host theme bridge, the portal ready and init protocol, and a send-to-canvas message.
- **HEIC and TIFF import.** Decoded server-side w/ Pillow and pillow-heif, falling back to `sips` on macOS.
- **Camera RAW import.** DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2 and more, developed server-side by LibRaw (via rawpy) w/ the camera's white balance, then opened into Develop.

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
├── sonny, sonny.bat           root dispatcher: install, boot, build, serve, desktop, doctor, test
├── sonny_oc_install(.bat)        one-command install
├── setup/                           one script per task, each w/ a .bat twin; lib.sh holds shared helpers
├── assets/                          repo art (README logo, desktop icon source), not app runtime files
├── backend/                         FastAPI engine
│   ├── app/core/config.py           ports, limits, data folders
│   ├── app/routers/                 system, io, projects, ops, generative
│   ├── app/services/                imaging, project_format, sessions, background, compute, generative
│   └── sonny_engine.py           PyInstaller entry for the desktop sidecar
├── frontend/                        Vite app, vanilla TypeScript
│   ├── src/engine/                  document engine, no DOM: layers, renderer, history, selections, strokes
│   ├── src/gpu/                     GPU detection, the WebGPU and WebGL2 displays, fallback rules, benchmark
│   ├── src/extensions/              tool registry and one module per tool
│   ├── src/ui/                      shell, stage, layers panel, menus, dialogs, icons, themes
│   ├── src/io/                      engine client, image decoding, project serialization
│   └── src/styles/                  NodeMode tokens and component sheets
├── src-tauri/                       Tauri 2 shell: sidecar spawn, port handshake, window sizing
├── .docs/                           BRANCHING.md and the wiki source
├── .github/workflows/               ci, wiki publish, desktop release matrix
└── .claude/skills/sonny-skillset/  project skill pack
```

## Development

Branch model: `main` plus short-lived work branches, see `.docs/BRANCHING.md`. Docs live in `.docs/wiki/` and publish to the GitHub wiki on merge. Contributions follow the dev-rules laws: single-region hand edits, zero DOM flash or re-render, no emoji, no em dash, no icon-library dependencies, `v*.*.*` versions, Conventional Commits. Project skills live in `.claude/skills/sonny-skillset/`; start at its `SKILL.md`. Read `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` before editing.

## Status

Release history, with each version's test counts: `CHANGELOG.md`. What is not verified yet:

- **Desktop app.** The Tauri shell follows a proven sidecar template, with macOS signing and notarization, the hardened runtime, file associations and in-app updates from GitHub Releases wired (setup on the wiki's Releasing page). Since 1.43.0 the shell passes `cargo check` on Linux (WebKitGTK), and its font command's unit test runs there; that first check found, and 1.43.0 fixed, a missing dependency that had kept it from compiling anywhere. Not verified yet: a full build and running the app (they need the frozen engine and a display), and the macOS and Windows builds; the desktop workflow has not run. Treat desktop bundles as untested until the first `desktop.yml` run passes. Opening a clicked file in the running desktop app is not built yet.
- **The graphics processor on real hardware.** The web GPU paths are checked against the CPU in a test browser with a software GPU, where WebGPU cannot present to the screen; on-screen WebGPU, CUDA or Core ML running the engine's models, and Help > Performance Benchmark's numbers on real hardware are still to be run. The native renderer (1.44.0) is tested on Mesa's software Vulkan (21 tests, and a window screenshotted and measured under Xvfb); on real hardware: in native/sonny-render run `cargo run --release --example window` (a document drawn in a native window) and `cargo run --release --bin brush_bench` (milliseconds per brush update on a 4,000 px document, printed with the GPU's name); in the desktop app choose Preferences > Performance > Renderer > Native GPU and check that the interface shows over the canvas.
- **ML background removal.** Exercised end to end since 1.42.0: Select Subject's browser tests run on the ML engine (u2net) where the AI extras are installed, and pass; the lightweight GrabCut path is verified too. Click-to-select (SAM 2.1) is tested end to end on the CPU; its speed on CUDA or Apple's MPS is not measured yet.
- **NodeMode embedding.** Follows the portal protocol; the host-side handling of `plugin:sonny:assign` is not confirmed yet.

## Contributors

- **nodemode-ai** · owner and build

## Licensing

Apache License 2.0. Copyright 2026 nodemode-ai. See `LICENSE`.

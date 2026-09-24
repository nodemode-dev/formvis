<p align="center"><img src="assets/sonny_folder_icon.png" width="112" alt="sonny"></p>
<h1 align="center">sonny</h1>
<p align="center"><b>Layered image compositing for the web and the desktop, in the NodeMode design system.</b></p>
<p align="center">
<img src="https://img.shields.io/badge/version-1.20.0-f97316" alt="version 1.20.0">
<img src="https://img.shields.io/badge/node-22-339933" alt="node 22">
<img src="https://img.shields.io/badge/python-3.12-3776AB" alt="python 3.12">
<img src="https://img.shields.io/badge/tauri-2-24C8DB" alt="tauri 2">
<img src="https://img.shields.io/badge/license-Apache--2.0-lightgrey" alt="Apache 2.0 license">
</p>

## What it is

sonny is a layered image editor: stack photos and paintings as layers, group them in folders, mask and clip them, blend them with 13 modes, select, paint and export. It saves its own `.sny` projects and opens NodeMode canvasor projects, and it runs standalone in a browser, inside NodeMode as a portal app, or as a desktop app for macOS, Linux and Windows.

**Stack.** Vanilla TypeScript 7 and Vite 8 · Python 3.12 and FastAPI · Tauri 2 · about 9,387 lines of TypeScript, 426 of CSS, 701 of Python and 112 of Rust.

## Highlights

- **Layered document model.** Flat bottom-to-top layers w/ pass-through folders, 17 blend modes in Photoshop's order, each native to Canvas 2D, raster masks, folder masks, clipping chains (Option-click a row's lower edge to clip or release), Option-drag mask copy, and value-snapshot history (100 steps, 256 MB).
- **Its own project files.** Saves `.sny` (and still opens `.sonny` from before 0.90.0), and opens NodeMode canvasor projects (`.canvasor`, version 1).
- **Fourteen tools.** Move w/ transform handles, Marquee, Lasso, Magic Wand, Crop, Brush and Eraser, Spot Healing (Content-Aware, Create Texture, Proximity Match), Clone Stamp, Smear (Liquify, Blur, Smudge), Gradient, Shape, Eyedropper, Hand, Zoom; each is a self-registering extension module. Content-Aware Fill works from the Edit menu.
- **Adjustments and filters.** Levels w/ histogram, Auto and black, gray and white eyedroppers; Curves; Hue/Saturation w/ spectrum band handles, Sample, Add and Remove eyedroppers and targeted adjustment; Exposure, Gradient Map and Grain; as editable adjustment layers or direct edits; Gaussian Blur, Motion Blur, Add Noise and Lens Correction; all ported from the source, w/ live preview.
- **Healing.** Spot Healing, the Healing Brush (Alt-click a source) and the Patch tool blend copied texture into its surroundings; Shift+J cycles them.
- **Paths.** The Pen draws Bezier paths and Direct Selection reshapes them; a path becomes a selection (Ctrl or Cmd with Enter) or is filled or stroked into a layer. Paths save with the project, and the Pen adds or deletes points on them. A Paths panel keeps named paths, and a path can become a shape layer whose outline stays editable. Shape layers take a fill, a stroke or both, and travel to and from Photoshop as shapes.
- **Actions and Batch.** Record commands, filters, adjustments, layer styles and size changes into actions, replay them, share them as JSON, and batch-process a set of images into one zip. Size steps can follow each image. Stops and dialog pauses let an action wait for input.
- **Smart objects.** Keep a layer's original pixels, with filters on it that stay editable, can be hidden or removed, and re-render from the original. Edit Contents opens the original as its own document; saving it updates the object. Distort and Perspective stay editable on them. They travel to and from Photoshop as smart objects.
- **Animation.** A Timeline of frames, each keeping layer visibility, opacity and position with a delay, tweened, reordered by dragging, played in a preview and exported as an animated GIF.
- **History.** A History panel lists every step kept; clicking one goes back or forward to it. Snapshots keep states to return to at any time.
- **Photoshop files.** Open layered `.psd` and `.psb` files and export to them, keeping layers, folders, masks, clipping, opacity, blend modes, visibility and live adjustment layers.
- **Layer styles.** Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow and Color Overlay for any pixel layer, drawn from its visible pixels and previewed live; copy, paste and clear them across layers. They save in `.sny` projects.
- **Type.** The Type tool adds editable text layers, typed straight onto the canvas, with font, size, line height, alignment, bold, italic and colour; painting on type turns it into pixels.
- **Generative Fill, Expand and Upscale (optional).** Edit > Generative Fill paints a selection from a prompt, or removes what it covers with an empty prompt, through FLUX.1 Fill and Erase on fal; Image > Generative Expand grows the canvas and fills the new border; Image > Upscale enlarges 2 or 4 times with Real-ESRGAN. Set `FAL_KEY` or paste a key into the dialog once; the engine keeps it. Filter > Develop adds Camera Raw-style tone, colour and detail controls.
- **Precise transforms.** Move snaps to the canvas and other layers w/ guides and takes exact X, Y, W, H, Scale and Angle values; several selected layers, or a folder, transform together; drag inside a selection to move or duplicate its pixels; Transform Selection (Alt+Mod+T) floats them w/ handles and merges back, growing the layer past its edges.
- **Clipboard, selections, canvas.** Cut, Copy, Copy Merged, Paste in place and Layer via Copy; Expand, Contract and Mask's Black Areas; arrow-key nudging, marquee autoscroll, Anti-alias, and the Magic Wand's Sample Size; Canvas Size w/ anchors and Image Size w/ resampling.
- **Two background removers, one refine panel.** rembg (ML, default when installed) and OpenCV GrabCut (lightweight, always available) feed Basic, or Advanced w/ Refine (guided filter, for hair and fur), Contrast and Shift Edge; the result is an editable layer mask, never destroyed pixels.
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
├── sonny, sonny.bat           root dispatcher: install, boot, build, serve, desktop, doctor, test
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
- **Not built yet.** Opening a clicked file in the running desktop app. The measured parity scoreboard ships in the planning sidecar.
- **NodeMode embedding.** Follows the portal protocol; the host-side handling of `plugin:sonny:assign` is not confirmed yet.

## Development

Branch model: `main` plus short-lived work branches, see `.docs/BRANCHING.md`. Docs live in `.docs/wiki/` and publish to the GitHub wiki on merge. Contributions follow the dev-rules laws: single-region hand edits, zero DOM flash or re-render, no emoji, no em dash, no icon-library dependencies, `v*.*.*` versions, Conventional Commits. Project skills live in `.claude/skills/sonny-skillset/`; start at its `SKILL.md`. Read `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` before editing.

## Status

Version 1.20.0 draws per-channel adjustment layers on the graphics processor, with 383 automated tests in all. Version 1.19.0 adds the WebGL2 renderer, the GPU path on Linux and older systems, with 375 automated tests in all. Version 1.18.0 gathers every GPU fallback rule in one place and adds the texture limit, with 344 automated tests in all. Version 1.17.0 draws the canvas through WebGPU where it can, falling back to the CPU per document and after a lost device, with 339 automated tests in all. Version 1.16.0 adds a WebGPU blender matching the CPU renderer in all 27 blend modes, not yet drawing the canvas, with 335 automated tests in all. Version 1.15.0 detects the graphics processor and adds its Performance settings, the first step of GPU rendering, with 308 automated tests in all. Version 1.14.0 adds pattern sources for the Healing Brush and the Patch tool, with 299 automated tests in all. Version 1.13.0 adds the Patch tool's Sample All Layers, with 296 automated tests in all. Version 1.12.0 adds the healing brushes' Sample options, so repairs can go onto an empty layer, with 294 automated tests in all. Version 1.11.0 adds the healing brushes' Mode, Replace included, with 292 automated tests in all. Version 1.10.0 adds the Healing Brush's Diffusion, with 289 automated tests in all. Version 1.9.0 adds the Patch tool's Diffusion, Structure and Color, with 285 automated tests in all. Version 1.8.0 lets the Layers panel move in the dock like the others, with 280 automated tests in all. Version 1.7.0 adds the Clone Stamp's five sources and overlay settings, with 279 automated tests in all. Version 1.6.0 lets panels move in the side dock and adds a Window menu, with 278 automated tests in all. Version 1.5.0 adds the Crop tool's W x H x Resolution and crop presets, with 277 automated tests in all. Version 1.4.0 keeps sonny to its own project files and NodeMode canvasor's. Version 1.3.0 adds a Home screen, with 276 automated tests in all. Version 1.2.0 adds Preferences with real Performance and File Handling settings, with 275 automated tests in all. Version 1.1.0 adds the Crop tool's composition overlays, with 274 automated tests in all. Version 1.0.0 adds the Crop tool's Delete Cropped Pixels (on by default, as in Photoshop), with 269 automated tests in all; releases from here raise the middle number (1.1.0, 1.2.0, and 1.10.0 after 1.9.0). Version 0.99.0 adds the Brush's Flow, with 268 automated tests in all. Version 0.98.0 adds the Eyedropper's Sample Size, with 267 automated tests in all. Version 0.97.0 opens NodeMode canvasor projects (`.canvasor`), with 266 automated tests in all. Version 0.96.0 reworks the interface along Photoshop's lines: submenus and scrolling menus, a tool rail grouped with flyouts, an options bar that stays reachable, settings dialogs for Fill Path, Stroke Path and new and duplicated layers, and more tool options, with 263 automated tests in all. Version 0.95.0 completes the pen tools (Path Selection, Freeform and Curvature Pens, path operations) and writes paths into PSD files, with 243 automated tests in all. Version 0.94.0 adds live corner radii and custom shapes, with 228 automated tests in all. Version 0.93.0 adds artboards, each exported as its own image, with 221 automated tests in all. Version 0.92.0 exports in sRGB, Display P3 or Adobe RGB with the profile embedded, with 217 automated tests in all. Version 0.91.0 keeps adjustment layers live in PSD files, both ways, and exports PSB, with 211 automated tests in all. Version 0.90.0 imports Photoshop .abr brushes and saves projects as `.sny`, with 195 automated tests in all. Version 0.89.0 adds Filter > Shake Reduction with an estimated blur trace, with 188 automated tests in all. Version 0.88.0 adds the Remove tool and Remove Wires and Cables, with 183 automated tests in all. Version 0.87.0 deepens layer styles with several instances of an effect, stroke positions, contours and Global Light, with 179 automated tests in all. Version 0.86.0 adds Replace Contents, smart filter masks and linked smart objects, with 167 automated tests in all. Version 0.85.0 adds the Gradient Editor with noise gradients and Edit > Fill with History, with 163 automated tests in all. Version 0.84.0 adds the Content-Aware Fill workspace with a sampling area, with 158 automated tests in all. Version 0.83.0 adds the Select and Mask workspace, with 153 automated tests in all. Version 0.82.0 adds Crop straightening, Content-Aware edges and Perspective Crop, with 146 automated tests in all. Version 0.81.0 adds Edit > Puppet Warp, with 139 automated tests in all. Version 0.80.0 adds the Filter > Liquify workspace, with 133 automated tests in all. Version 0.79.0 adds Edit > Warp with a smooth control grid, the mesh warp ported from NodeMode's sonny studio, with 126 automated tests in all. Version 0.78.0 snaps moves to guides and the grid by each layer's visible pixels, with 117 automated tests in all. Version 0.77.0 adds rulers, guides and a layout grid, with 114 automated tests in all. Version 0.76.0 adds File > Export As with format, quality, scale and presets, with 111 automated tests in all. Version 0.75.0 adds export to WebP, TIFF, PDF and AVIF, with 104 automated tests in all. Version 0.74.0 adds Photoshop's five gradient types with gradient presets, and Edit > Fill with contents, mode, opacity and Preserve Transparency, with 98 automated tests in all. Version 0.73.0 adds Patch Destination, Transparent and Content-Aware modes, with 86 automated tests in all. Version 0.72.0 adds Clone Stamp source scale, rotation and flips, with 82 automated tests in all. Version 0.71.0 adds Select > Subject and Select > Object in Selection, each one step, with 78 automated tests in all. Version 0.70.0 adds pen pressure (size and flow) and brush presets, ported from NodeMode's sonny studio, with 76 automated tests in all. Version 0.69.0 adds Polygon, Star, Line, Arrow and Heart to the Shape tool, the first feature ported from NodeMode's sonny studio, with 68 automated tests in all. Version 0.68.0 adds Lens Blur, Smart Sharpen (Gaussian, lens or motion removal) and a Sharpen brush, with 59 automated tests in all. Version 0.67.0 adds automated tests: 31 engine unit tests, 9 engine-service tests and 7 browser tests, run together by `./sonny test` and on every push by CI. Version 0.66.0 has all 27 of Photoshop's blend modes, seventeen adjustment kinds (Brightness/Contrast, Vibrance, Color Balance, Black & White, Photo Filter, Channel Mixer, Invert, Posterize, Threshold, Selective Color and Develop joined the original six), Align and Distribute, and Select > Feather, Border and Smooth; a failed operation now undoes itself, and unsaved work survives a crash. Version 0.65.0 has all 24 tools complete (Smear's Blur now works on masks too) and all 59 web-relevant menu commands complete, each checked in a browser against predicted pixel values. The Move tool snaps with guides, takes exact X, Y, W, H, Scale and Angle values, and moves or duplicates selected pixels; Transform Selection (Alt+Mod+T) scales and rotates them, growing the layer past its edges. Levels has the Auto modes and eyedroppers, Hue/Saturation its band handles, eyedroppers and targeted adjustment, Remove Background its Basic and Advanced refine panel, and Export JPEG its quality sheet with a live encoded preview. The foreground and background swatches open the color picker, which can sample the canvas, and sampling drags show the sample ring. What remains is mostly in panels outside the menus, listed above. Current focus: free distort and Smear's Blur on masks.

## Contributors

- **nodemode-ai** · owner and build

## Licensing

Apache License 2.0. Copyright 2026 nodemode-ai. See `LICENSE`.

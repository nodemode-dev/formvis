# Changelog

Versions follow `v*.*.*` with dots. Dates are UTC. From 1.0.0 each release raises the middle number: 1.1.0, 1.2.0 and on, with 1.10.0 after 1.9.0.

## 1.49.5 · 2026-09-27

### Added: painting tools from your list

- Pencil (B, beside the Brush): hard, pixel-exact lines; Auto Erase paints the background colour when a stroke starts on the foreground colour.
- The Eraser is its own tool (E), with Brush or Pencil mode; the Brush's own mode is left as it was.
- Background Eraser (E): erases the colour under the brush's centre, within Tolerance; Sampling continuous or once; Limits contiguous or discontiguous; Protect Foreground Color. One step per stroke.
- Magic Eraser (E): a click erases the area of similar colour to transparency, with its own Tolerance, Contiguous and Sample All Layers.
- Pattern Stamp (S, beside the Clone Stamp): paints a chosen pattern, tiled across the document so strokes line up.

### Fixed

- Tabs fit instead of being shortened (1.49.4 cut both Brushes and Brush Settings); the active tab is never cut.
- E and B pick their groups' tools like any letter (they forced the Brush); Shift+L includes the Magnetic Lasso.

## 1.49.4 · 2026-09-27

### Added: selection tools from your list

- Magnetic Lasso (in the Lasso group): click an edge and move along it; the line follows the strongest edge nearby and fastens points as it goes; click to fasten one; close by clicking near the start, double-clicking or Enter; Backspace removes the last point. Width, Contrast and Frequency, as Photoshop's.
- Single Row Marquee and Single Column Marquee (in the Marquee group): a click selects the one-pixel row or column across the document; Shift adds, Alt takes away.
- Selection Brush (in the Object Selection group, W): paint the selection with the brush's size and hardness, Alt to take away; tinted while painting, one step per stroke.

### Fixed

- A tab's name never wraps (Brush Settings did); shortened if it must be, the whole name on hover.

## 1.49.3 · 2026-09-27

### Changed: paths, and your notes on 1.49.2

- The grip (⋮⋮) sits in one place on every header, at the left edge like the Navigator's, with less padding, whatever the tabs.
- A panel group holds at most 7 tabs; dragging an eighth over a full one shows "Full: 7 tabs" and it stays where it was.
- Path Selection and Direct Selection offer the path's actions in their bar: Make Selection, Fill Path..., Stroke Path..., New Shape Layer. The Paths panel's Fill and Stroke buttons open their dialogs.
- Stroke Path has Width and Colour (starting at your brush size and foreground colour, left as they were) with Tool and Simulate Pressure.
- Direct Selection: click a point to select it (Shift adds), or drag a box; drag to move the selected points together; Alt-drag a point to pull out handles; Alt-drag a handle to break it; arrows nudge (Shift for 10). Selected points show filled.
- Convert Point (in the Pen group): a click makes a smooth point a corner; a drag pulls out smooth handles; a handle drags alone.

### Fixed

- Editing a work path (the Pen's) is undoable, each drag or nudge one step; it never was.

## 1.49.2 · 2026-09-27

### Changed: panels, from your walkthrough of 1.49.0

- Every panel groups with every other: the Layers group (Layers, Channels, Paths) is now built like the rest, so its tabs move out and any tab moves in.
- A tab dragged into empty space in either column, or between two groups, becomes its own group there; such groups are remembered, go away when emptied, and Reset Panels returns their tabs home.
- Moving is plain: a grip on every header; a ghost of what you drag; a bold marker saying what a release does (Move here, New group); a header saying Add as tab. Drag a tab to move the tab; drag a header's empty part or its grip to move the group.

### Next

- 1.49.3: paths (Path and Direct Selection, Stroke Path and Fill Path options).
- 1.49.4: Magnetic Lasso and the other selection tools.

## 1.49.1 · 2026-09-27

### Fixed: from your walkthrough of 1.49.0

- New Document: wide presets' previews (Facebook Post, X Post, LinkedIn Banner) no longer spill past their cards.
- New Document: Color Mode and bit depth open like any dropdown (they showed a stray line and could not open).
- The Clone Stamp, History Brush and Eyedropper icons are redrawn: the stamp whole, the brush with its arrow, the eyedropper a dropper.
- Reset Panels restores the whole layout: panel order and columns, tabs, groups open on their first tab, Layers on its own tab, both columns expanded at their default widths.
- Menus and dropdowns are denser glass, so nothing behind them reads through.
- The README lists all thirty-one tools.

### Next

- 1.49.2: panels rework (any panel groups with any other, tabs detach into their own group, clearer moving).
- 1.49.3: paths (Path and Direct Selection, Stroke Path and Fill Path options).
- 1.49.4: Magnetic Lasso and the other selection tools; then your tool list, a group per build.

## 1.49.0 · 2026-09-27

### Changed: your walkthrough of 1.48.0

- The accent drives every highlight, defaults to orange, and has an intensity (Preferences > Interface); no colour is hardcoded, so light themes are usable. Menus, dropdowns and flyouts are liquid glass; every dropdown opens as the glass list. Scrollbars are hidden; scrolling works.
- The panel columns reach the title bar; the side column lies over the canvas (collapsing or expanding never moves it; fitting leaves it out) and shows as icons in a narrow window. No panel covers another; notifications sit over the canvas; the Color tab always paints.
- The toolbar: sub-tools in the flyouts (Elliptical Marquee, Polygonal Lasso, Sharpen, Liquify Brush, the eight shapes, Eraser); icons at the target's weight; Quick Mask (Q); screen modes (F) and Tab to hide panels; two columns (»); the History Brush (Y), painting back the document as opened or a chosen snapshot; the Frame tool (K), which an imported image fills; Edit Toolbar (•••).
- Docking: panels move between the two columns and tabs between groups; the columns merge and separate (Window); the side column's width is dragged by its edge.
- Preferences in Photoshop's sections: General, Interface, Workspace, Tools, History & Cache, File Handling, Performance, Cursors, Transparency & Gamut, Units & Rulers, Guides & Grid, each setting acting on something real.

### Not verified yet

- The Layers group's tabs (Layers, Channels, Paths) do not move between groups yet; the group moves whole.
- Channel viewing is not possible with the Native GPU renderer, which draws outside the page; the panel says so.

## 1.48.0 · 2026-09-27

### Changed: from your walkthrough of 1.47.0 and your two screenshots

- Tool icons redrawn as Photoshop's pictures in thin lines (a four-way Move arrow, a lasso loop, a bandage, a stamp, a drop, a lollipop, a pen nib), the column at the target's density with dashes between tool families, the active tool lavender.
- The options bar starts with the tool's icon; the Move bar is the target's: Auto-Select, Auto-Select Target (Layer or Group), Show Transform Controls, Snap and icon-only align and distribute buttons. Its transform fields appear while you transform, as Photoshop's.
- Menus have a tick column only where a tick can show, and the target's translucent look.
- Brushes: the tip is an editor (drag its handles to turn or flatten it); presets in folders with a search, grid or list, each drawn with its shape and size; Load... reads Photoshop .abr brushes; a Brush Settings tab. A Flat angled preset.
- Both side columns collapse to a strip of icons («); an icon opens its panel beside the strip.
- Panel groups resize by dragging between them; Layers takes what is left.
- Channels is a working tab: view one channel or hide some, Cmd-click one to load it as a selection.
- Each group has its panel menu (•••) of its own commands.

### Not verified yet

- Channel viewing with the Native GPU renderer is not possible (it draws outside the page); the panel says so.
- Only the Move tool's options bar is in the target screenshots; the other tools' bars share its style but are not matched item by item.

## 1.47.0 · 2026-09-26

### Changed: the target's layout and experience (Phase 21, UI_SPEC.md)

- Panels as the target's: groups with chip tabs and a minimise button; the right column Navigator (a live preview, the view in red, Fit and zoom presets, a Zoom slider), Swatches and Color (the target's 47 swatches; click, Alt-click, right-click, +; a saturation square and hue strip), and Layers with Paths as a tab, a Kind filter row, a grouped and searchable blend mode list, and Opacity and Fill fields. History and Timeline start hidden, as the target's Essentials (Window shows them). The Layers panel's default width is 288 px.
- A Properties column between the canvas and the panels: the active layer's W, X, H, Y with a link; Brushes (tip, Size, Hardness, a stroke preview, Brush Settings); Paragraph; Character.
- The title bar's tools: a theme toggle, a command search (type a command's name, Enter runs it), the workspace list (Essentials, Photography, Painting, Graphic and Web, Motion) and Lock Workspace. Document tabs in their own row above the canvas (name, * when unsaved, RGB/8, a circled close). The options bar and tool flyouts restyled; tools with variants show a dot.
- New Document as the target's: categories, preset cards shaped as their documents, a search over every preset, units and resolution (now kept with the document), orientation, Artboards, and a live size and memory summary.
- Dialogs blur the app behind them; the one primary action is white. Closing a document with unsaved changes offers Don't Save, Cancel and Save (Save closes only once saved).
- In the desktop app on macOS, the menus are in the system menu bar.
- Context menus near the window's foot open upward, so no item sits under the pointer.

### Added

- Layer Fill, as Photoshop's: the pixels fade, the layer styles do not; kept in projects and PSD.
- Layer locks, as Photoshop's: transparency, image pixels, position, all, honoured by the tools; kept in projects and PSD.
- 25 more browser tests and 2 unit tests: 533 in all, besides the native renderer's.

### Not verified yet

- The menus in macOS's menu bar and the Native GPU canvas beneath the interface are tested with the desktop shell stood in for; only a Mac shows them for real.

## 1.46.0 · 2026-09-26

### Changed

- The redesign now reaches everyone: 1.45.0 kept a previously saved appearance, so most users still saw NodeMode Dark in orange. A choice saved before Studio Dark is now set aside once; anything chosen since is kept.
- A new start screen, as the target's (UI_SPEC.md section 3): the whole window black below the title bar; the name, one line on what to do, a white New document button and a dark Open button with their shortcuts as key caps (sizes and colours as measured: 210 and 190 by 42 px), and a hint that images can be dropped anywhere. Recent projects follow, only when there are any.
- Panel headers as a black strip with the panel's name as a chip; layer rows as rounded cards, the selected one with a lavender glow in place of the orange bar; the tool column with the target's lavender glows and a rounded active-tool highlight.
- 1 more unit test: 509 in all.

## 1.45.0 · 2026-09-26

### Changed

- The look of the target design (Phase 21, step 1 of 6; UI_SPEC.md in the planning docs): a new default appearance, Studio Dark, with colours measured from the owner's screenshots (near-black surfaces, neutral greys, a lavender accent in place of orange), the system face (SF Pro on macOS) and SF Mono for numbers, a neutral canvas checkerboard, and a dot grid on the pasteboard. The fourteen earlier appearances remain in Preferences, and a saved choice is kept.
- 2 more unit tests (the boot script and themes.ts hold the same profiles): 508 in all, besides the renderer's.

## 1.44.0 · 2026-09-26

### Added

- A native GPU renderer for the desktop app (native/sonny-render, Rust on wgpu: Metal on macOS, Vulkan on Linux, Direct3D 12 on Windows): layers stored as tiles, so no texture size limits them; a GPU brush; all 27 blend modes (the web shader's own formulas); masks, clipping, adjustment tables, moved, scaled and rotated layers without seams between tiles; a memory budget from the machine in place of a fixed cap; the checkerboard; drawn into the window's own GPU surface.
- Preferences > Performance > Renderer: Native GPU (desktop app). Opt-in: Automatic does not choose it yet. Where it cannot draw a document yet (3D tables, folder masks, a mask placed apart from the document) it falls back, with the reason in the status bar.
- A brush benchmark (cargo run --release --bin brush_bench in native/sonny-render) and a window check (cargo run --release --example window), for real hardware.
- `./sonny test native` runs the renderer's 21 tests.
- 4 more browser tests: 506 in all, besides the renderer's 21 and the shell's.

### Not verified yet

- On macOS the native canvas must sit beneath the web view for the interface to show over it; only a Mac can confirm this. Speed on a real GPU is measured by the benchmark above, not claimed.

## 1.43.0 · 2026-09-25

### Added

- The desktop app lists the fonts installed on the computer in the Type tool, at start, without asking (the shell reads them; the browser keeps Local Font Access).

### Fixed

- Fonts loaded with "Load system fonts..." now appear in the Type tool's Font menu (they had not since 1.29.0).
- The desktop shell compiles: it lacked a dependency (serde_json) that Tauri's generated code needs. It is now checked with cargo, and its lock file is committed.
- 3 more tests (browser), and a unit test in the shell: 502 in all, besides the shell's.

## 1.42.0 · 2026-09-25

### Added

- The Object Selection tool (W): click an object to select it, Shift-click to add another, Alt-click to take one away. It runs Meta's SAM 2.1 in the engine, installed with `./sonny install-ml` (optional); the first click on an image takes a few seconds, later clicks about a tenth of a second.
- 5 more tests (4 backend, 1 browser): 499 in all.

## 1.41.0 · 2026-09-25

### Fixed

- Document tabs and the new-document button slide into place when a document opens or closes, instead of jumping, so a document arriving from a drop or an import no longer shifts the tab bar unexpectedly.
- 2 more tests (browser), guarding this and the sliding layer rows: 494 in all.

## 1.40.0 · 2026-09-25

### Added

- Open `.comp` projects (as `Name.comp`, `Name.comp.zip` or the package folder), so they can be moved to sonny: layers, folders, masks, clipping, blend modes, opacity and visibility come across, and saving writes a `.sny`. sonny opens `.comp` but never writes it.
- 6 more tests (5 backend, 1 browser): 492 in all.

## 1.39.0 · 2026-09-25

### Added

- Camera RAW import: DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2 and other RAW files are developed by the engine (LibRaw) with the camera's white balance and open into Develop, as Photoshop opens them into Camera Raw.
- 5 more tests (4 backend, 1 browser): 486 in all.

## 1.38.0 · 2026-09-25

### Fixed

- The licence is stated as Apache-2.0 in package.json, the lockfile and Cargo.toml, as in LICENSE; a test keeps them agreeing.
- Layer rows slide into place when a layer is added or removed, instead of jumping, so a layer arriving after an import or Remove Background no longer shifts the list unexpectedly.
- The GPU blending module has a plain name of its own (gpu/blender.ts).
- 1 more test (backend): 481 in all.

## 1.37.0 · 2026-09-24

### Added

- Window > Paragraph Styles: named type styles kept in the document. Make one from a type layer, apply it to others, redefine it to update every layer that uses it, or delete it; each is one undo step.
- 3 more tests (browser): 480 in all.

## 1.36.0 · 2026-09-24

### Added

- Layer > Type on Path: text set along the selected pen path, from a Start Offset; it stays editable and on its path.
- 7 more tests (browser): 477 in all.

## 1.35.0 · 2026-09-24

### Added

- Layer > Warp Text: fifteen styles (Arc through Twist), Horizontal or Vertical, with Bend and distortion. The warp stays with the type, so the text remains editable.
- 19 more tests (browser): 470 in all.

## 1.34.0 · 2026-09-24

### Added

- Window > Brush Settings (F5): Brush Tip Shape (angle, roundness, spacing), Shape Dynamics (size, angle and roundness jitter, following the stroke's direction, the pen's tilt or its rotation), Scattering, Texture and Dual Brush. The pen's tilt and rotation now reach the brush.
- 7 more tests (browser): 451 in all.

## 1.33.0 · 2026-09-24

### Added

- Select and Mask: the Refine Edge brush (paint on the preview where hair or fur needs the edge worked out again), Decontaminate Colors with Amount (outputs to a new layer), and the Onion Skin, Marching Ants and On Layers views.
- 3 more tests (browser): 444 in all.

## 1.32.0 · 2026-09-24

### Added

- Filter > Develop gains a Point Curve, a Colour Mixer (both were in the engine but not in the dialog), Colour Grading (shadows, midtones, highlights and global, with Blending and Balance), Optics (distortion, chromatic aberration, lens vignetting), Geometry (perspective, rotate, scale, offset) and Calibration (primaries and shadows tint).
- 7 more tests (browser): 441 in all.

## 1.31.0 · 2026-09-24

### Added

- Filter > Blur > Radial Blur (Spin and Zoom) and Surface Blur, and a Filter > Blur Gallery with Field Blur, Iris Blur, Tilt-Shift and Path Blur. The gallery's pins, ellipse and path are set with sliders rather than on the canvas.
- 13 more tests (browser): 434 in all.

## 1.30.0 · 2026-09-24

### Added

- Shadows/Highlights, HDR Toning and Color Lookup, as adjustment layers and as direct edits (Image > Adjustments). Color Lookup loads 3D LUT files in the .cube format, or uses one of eight built-in looks.
- 7 more tests (browser): 421 in all.

## 1.29.0 · 2026-09-24

### Added

- Type: Tracking (in thousandths of an em, as in Photoshop) and Kerning (Metrics or 0) in the Type tool's options, kept in projects and read from Photoshop files.
- The font menu offers the fonts found on this machine, and in Chromium browsers "Load system fonts..." lists every installed font (with your permission).
- 6 more tests (browser): 414 in all.

### Fixed

- Edit Type no longer resets a font outside its short list to Inter.

## 1.28.0 · 2026-09-24

### Changed

- The README is accurate again: code size, the 27 blend modes (stated once), 28 tools, 17 adjustment kinds, 10 filters and 10 layer styles are taken from the code; the graphics processor work is described; Status lists only what is not verified yet, and the release history lives here.

### Added

- `./sonny counts` prints the README's code sizes and blend-mode count from the repository; `./sonny counts --check` fails when the README has drifted, and a test runs that check.
- 1 more test (backend): 408 in all.

## 1.27.0 · 2026-09-24

### Added

- Help > Performance Benchmark: times panning, adjustment layers and painting on the CPU and on each graphics processor path on a temporary document, then closes it; the results can be copied.
- 2 more tests (browser): 407 in all.

## 1.26.0 · 2026-09-24

### Added

- Preferences > Performance > Engine processor: Automatic, Metal (Core ML), CUDA or CPU for the engine's models (Remove Background now, the local models later). Automatic uses CUDA on an NVIDIA graphics processor, Core ML on a Mac, and the CPU otherwise; the engine says what it uses and why.
- 6 more tests (5 backend, 1 browser): 405 in all.

### Fixed

- The graphics processor note in Preferences no longer says drawing runs on the CPU; the canvas has drawn on the graphics processor since 1.17.0.

## 1.25.0 · 2026-09-24

### Added

- Layer styles (drop shadow, glows, stroke, bevel, inner shadow, overlays) draw on the graphics processor, from the same effect images the CPU renders, so they look the same. A styled layer that is clipped, inside a masked folder, or being painted or transformed draws on the CPU until the edit ends.
- 2 more tests (browser): 399 in all.

## 1.24.0 · 2026-09-24

### Added

- Folder masks draw on the graphics processor, nested masked folders included. A clipped layer inside a masked folder still draws on the CPU, named in the status bar.
- 2 more tests (browser): 397 in all.

## 1.23.0 · 2026-09-24

### Added

- Folders and clipping groups draw on the graphics processor: layers inside folders, hidden folders, and layers or adjustment layers clipped to a base. Folder masks, artboards and clipping nested more than one level still draw on the CPU, named in the status bar.
- 4 more tests (browser): 395 in all.

## 1.22.0 · 2026-09-24

### Added

- Layer masks draw on the graphics processor, on pixel layers and adjustment layers alike, including masks placed separately from their layer. Folder masks and clipping masks still draw on the CPU.
- 5 more tests (browser): 391 in all.

### Fixed

- Switching the renderer away from WebGPU and back in the same session no longer leaves drawing on the CPU.

## 1.21.0 · 2026-09-24

### Added

- Hue/Saturation, Photo Filter, Black & White, Channel Mixer, Vibrance, Color Balance and Selective Color adjustment layers now draw on the graphics processor, through a 3D colour table made by sonny's own CPU code and checked to within 1 level of it. Threshold, a hard cut, still draws on the CPU.
- 3 more tests (browser): 386 in all.

## 1.20.0 · 2026-09-24

### Added

- Levels, Curves, Exposure, Invert, Posterize and Brightness/Contrast adjustment layers now draw on the graphics processor (WebGPU or WebGL2) instead of sending the document back to the CPU. Each is applied through a table made by sonny's own CPU code and checked against it, so the result is the CPU's. Other adjustment kinds still draw on the CPU, named in the status bar.
- 8 more tests (browser): 383 in all.

## 1.19.0 · 2026-09-24

### Added

- The WebGL2 renderer: choosing WebGL2 in Preferences now draws the canvas on the graphics processor. It is the GPU path on Linux, whose desktop webview has no WebGPU, and on older systems, with the same blend modes and results as WebGPU and the CPU.
- 31 more tests (1 unit, 30 browser): 375 in all.

### Changed

- Switching between WebGPU, WebGL2 and the CPU is clean, and a failure of one GPU API no longer rules out the other.

## 1.18.0 · 2026-09-24

### Added

- A layer larger than the graphics processor's largest texture now draws on the CPU, with its size and the limit named in the status bar, instead of failing to upload.
- 5 more tests (unit): 344 in all.

### Changed

- Every rule for when drawing falls back from the GPU to the CPU lives in one place, and each switch is logged with its reason.

## 1.17.0 · 2026-09-24

### Added

- With the renderer at WebGPU (chosen, or Automatic on a hardware graphics processor), the canvas draws through the GPU: layers, opacity and all blend modes but Dissolve. Documents with folders, masks, clipping, adjustment layers or layer styles, or over the GPU memory limit, still draw on the CPU, and the status bar says why.
- 4 more tests (browser): 339 in all.

### Fixed

- After a graphics processor reset the canvas could stay blank until the next change; it now redraws as soon as the browser restores it.
- The status bar showed WebGL2 when it was chosen although drawing stayed on the CPU; it now says the CPU draws, and why.

## 1.16.0 · 2026-09-24

### Added

- A WebGPU blender that blends layers on the graphics processor in all 27 blend modes, matching the CPU renderer to within 3 levels in 255 in every mode. The canvas does not draw through it yet; that is the next step.
- 27 more tests (browser): 335 in all.

## 1.15.0 · 2026-09-24

### Added

- Preferences > Performance > Graphics Processor Settings: the detected graphics processor, Use Graphics Processor, Renderer (Automatic, WebGPU, WebGL2 or CPU) and a GPU memory limit; the GPU mode in use shows in the status bar. If the graphics processor fails to start, sonny turns it off and says so. Drawing still runs on the CPU; the GPU renderer comes next.
- 9 more tests (7 unit, 2 browser): 308 in all.

### Changed

- The Preferences window keeps one size; a long section scrolls inside it.

## 1.14.0 · 2026-09-24

### Added

- The Healing Brush's Source: Pattern heals from a chosen pattern, with no source point to set.
- The Patch tool's Pattern and Use Pattern (Normal mode): heal a selection from a pattern, blended to its surroundings.
- 3 more tests (browser): 299 in all.

## 1.13.0 · 2026-09-24

### Added

- The Patch tool's Sample All Layers (Content-Aware): patch onto an empty layer above the picture, keeping the repair separate.
- 2 more tests (browser): 296 in all.

## 1.12.0 · 2026-09-24

### Added

- The Healing Brush's Sample menu (Current Layer, Current & Below, All Layers) and Spot Healing's Sample All Layers: heal onto an empty layer above the picture, keeping the repair separate.

### Fixed

- The Healing Brush's Sample all layers only affected the preview while painting; the finished heal still came from the layer alone, so healing onto an empty layer did not work.

### Tests

- 2 more (browser): 294 in all.

## 1.11.0 · 2026-09-24

### Added

- The Healing Brush's and Spot Healing's Mode: Normal, Replace, Multiply, Screen, Darken, Lighten, Color and Luminosity. Replace keeps grain and texture at a soft brush's edge instead of averaging it away.
- 3 more tests (browser): 292 in all.

## 1.10.0 · 2026-09-24

### Added

- The Healing Brush's Diffusion (1 to 7), as the Patch tool's: lower keeps more of the source's own colour and texture inside the stroke. The default gives the same result as before.
- 4 more tests (2 unit, 2 browser): 289 in all.

## 1.9.0 · 2026-09-24

### Added

- The Patch tool's Diffusion (Normal mode, 1 to 7: lower keeps more of the source's own texture), and Content-Aware's Structure (1 to 7) and Color (0 to 10: 0 is a plain copy, 10 the full colour blend). The defaults give the same results as before.
- 5 more tests (2 unit, 3 browser): 285 in all.

## 1.8.0 · 2026-09-24

### Added

- The Layers panel moves too: drag it by its header anywhere in the side dock, hide or show it from the Window menu; wherever it sits it takes the space left. Arrangements saved by 1.6.0 keep it first.
- 1 more test (browser): 280 in all.

## 1.7.0 · 2026-09-24

### Added

- The Clone Stamp's five sources: choose a slot 1 to 5, Alt-click to set its source; each slot keeps its own point, scale, angle and flips. Reset Transform returns them to their defaults.
- The Clone Stamp's overlay settings: Show Overlay, Clipped (off shows the whole source where a stroke would copy it), Overlay opacity and Auto Hide while painting.
- 1 more test (browser): 279 in all.

## 1.6.0 · 2026-09-24

### Added

- Panels move: drag the Paths, Timeline or History panel by its header up or down the side dock; the arrangement is remembered. A Window menu shows or hides each panel, and Reset Panels restores the default.
- 1 more test (browser): 278 in all.

## 1.5.0 · 2026-09-24

### Added

- The Crop tool's W x H x Resolution: the crop is resampled to an exact width and height (px, in or cm) at a resolution, as one step; Front Image fills in the current document's size; New Crop Preset and Delete Crop Preset keep sizes on this device.
- 1 more test (browser): 277 in all.

## 1.4.0 · 2026-09-24

### Changed

- The Open dialog's folder button reads Project folder; it opens an unzipped project.
- The renderer module is `renderer.ts`.

### Removed

- Reading and writing another application's project format, with its menu command and file association; sonny's own `.sny` projects and NodeMode canvasor projects are unaffected.
- A third-party notice from About sonny and the documentation.

## 1.3.0 · 2026-09-24

### Added

- A Home screen: New file, Open and recent projects, shown whenever no document is open (Preferences > General > Auto show the Home Screen) and at any time from the brand mark at the top left; Esc leaves it. Recent projects show names and dates; thumbnails are not built yet.
- 1 more test (browser): 276 in all.

## 1.2.0 · 2026-09-24

### Added

- Preferences (Ctrl+,), with sections as in Photoshop: Interface (theme, accent), Performance (History States, the memory undo may hold, region redraws while painting) and File Handling (how soon unsaved work is kept for recovery). Every setting acts on sonny, is kept on this device and takes effect at once.
- 1 more test (browser): 275 in all.

### Changed

- Edit > Settings is now Edit > Preferences.

## 1.1.0 · 2026-09-24

### Added

- The Crop tool's composition overlays: Rule of Thirds, Grid, Diagonal, Triangle, Golden Ratio and Golden Spiral, from an Overlay setting or O while a frame shows; Shift+O flips the Triangle and Golden Spiral.
- 5 more tests (4 unit, 1 browser): 274 in all.

## 1.0.0 · 2026-09-24

### Added

- The Crop tool's Delete Cropped Pixels, on by default as in Photoshop: cropping trims pixel layers to the canvas. Turn it off to keep cropped pixels beyond the canvas, where Image > Reveal All brings them back (the only behaviour before 1.0.0).
- 1 more test (browser): 269 in all.

### Changed

- A crop now deletes the cropped pixels unless Delete Cropped Pixels is turned off.

## 0.99.0 · 2026-09-24

### Added

- The Brush's Flow: how much paint each dab lays down, building within a stroke up to its Opacity.
- 1 more test (browser): 268 in all.

### Known limitation

- At very low Flow (around 2%) paint stops short of full, near 85%, however long the stroke builds, as the paint layer is 8 bit.

## 0.98.0 · 2026-09-24

### Added

- The Eyedropper's Sample Size: Point Sample, or the average of a 3, 5, 11, 31, 51 or 101 pixel square, weighted by opacity; Alt-click sampling in other tools follows it.
- 1 more test (browser): 267 in all.

## 0.97.0 · 2026-09-24

### Added

- NodeMode canvasor projects (`.canvasor`, format `com.nodemode.canvasor` version 1) open in sonny, from File > Open, the file picker, or a drop; later versions are refused rather than guessed. They save as `.sny`.
- 3 more tests (1 backend, 2 browser): 266 in all.

## 0.96.0 · 2026-09-23

### Added

- Menus have submenus, opened beside their rows, and scroll within the window with the scrollbar hidden; the menus are grouped as Photoshop's (File > Export, Layer > New Adjustment Layer, Filter > Blur and others).
- The tool rail groups tools as Photoshop's toolbar does: one slot per group showing the last tool used, a flyout on press and hold or right-click, Shift with the key cycling the group.
- The options bar scrolls sideways by wheel and shows chevrons where settings lie past its ends.
- Settings dialogs for Fill Path (contents, mode, opacity, feather, anti-aliasing), Stroke Path (the tool, Simulate Pressure), New Layer (name, mode, opacity, clipping to the layer below), New Group (name) and Duplicate Layer (name); the quick forms stay on their buttons and shortcuts.
- Tool options: Magic Wand Anti-alias; Marquee Feather and Style (Normal, Fixed Ratio, Fixed Size); Lasso Feather; Gradient Mode and Dither.
- 20 more tests (1 unit, 19 browser): 263 in all.

### Fixed

- Rows the options bar hides (a Shape kind's own settings, for one) were still shown on screen; they are now hidden.
- The Healing Brush's options bar was titled Clone Stamp; the Pen, Freeform Pen and Type bars had no title.
- The layer context menu now closes on a click outside it.

## 0.95.0 · 2026-09-23

### Added

- The Path Selection tool: choose, move, copy, nudge and delete whole subpaths.
- The Freeform Pen (draw a path freehand, smoothed by Curve Fit) and the Curvature Pen (click points; the curve runs smoothly through them).
- Path operations: Combine, Subtract, Intersect and Exclude, set from Path Selection and honoured by shape layers, Make Selection and Fill Path.
- Paths panel paths, and path operations, in PSD files, both ways.
- 15 more tests (5 unit, 10 browser): 243 in all.

### Fixed

- The same notice asked for again is shown once, rather than stacked.

## 0.94.0 · 2026-09-23

### Added

- Layer > Corner Radii: a drawn rectangle's corners set afterwards, linked or each on its own.
- Custom shapes in the Shape tool: thirteen of sonny's own (check mark, cross, plus, lightning, speech bubble, drop, ring, crescent, tag, shield, cloud, house, block arrow), with holes where they have them.
- Shapes with holes keep them in PSD files, both ways.
- 7 more tests (4 unit, 3 browser): 228 in all.

### Fixed

- The Shape tool's options now follow the chosen shape: Sides, Points, Indent, Weight and the arrow head settings could not be reached from the options bar since 0.69.0.

## 0.93.0 · 2026-09-23

### Added

- Artboards: Layer > New Artboard, Artboard from Layers and Artboard Options (position, size, background). Contents show only inside the artboard, over its background; the artboard moves with its contents and follows Canvas Size, crops, Image Size and Flip Canvas. File > Export Artboards to Files writes each as a PNG, together in a zip. Saved in .sny projects.
- 4 more tests (2 unit, 2 browser): 221 in all.

## 0.92.0 · 2026-09-23

### Added

- Export As > Colour profile: sRGB, Display P3 or Adobe RGB (1998). The pixels are converted and the file carries the profile (PNG, JPEG, WebP, TIFF, AVIF; PDF carries none). Saved with export presets.
- 6 more tests (4 unit, 1 backend, 1 browser): 217 in all.

### Notes

- Images with embedded profiles were already shown in the right colours on opening: the browser converts them to sRGB.

## 0.91.0 · 2026-09-23

### Added

- Adjustment layers go into PSD files as live Photoshop adjustment layers (fifteen kinds, with masks, opacity, blend and clipping), and Photoshop adjustment layers open as live sonny ones. Grain and Develop, which Photoshop has no layer for, are reported and left out.
- File > Export PSB (Large Document); .psb files open.
- 16 more tests (15 unit, 1 browser): 211 in all.

## 0.90.0 · 2026-09-23

### Added

- Import Photoshop brushes (.abr, versions 1, 2 and 6 to 10) from the Brush tool: their sampled tips become presets, kept between sessions, and brushes paint with them.
- 7 more tests (4 unit, 1 backend, 2 browser): 195 in all.

### Changed

- Projects are saved as `.sny`. Older `.sonny` projects still open, and saving one again writes `.sny`.

### Fixed

- Brushes imported, and gradients saved or edited in the Gradient Editor, now appear in their tool's list at once rather than after switching tools.

## 0.89.0 · 2026-09-23

### Added

- Filter > Shake Reduction: estimates the camera shake's blur trace from the image and removes it; the trace's angle and length, Smoothing and Amount can be adjusted. The trace is straight; Photoshop also finds curved ones.
- 5 more tests (4 unit, 1 browser): 188 in all.

## 0.88.0 · 2026-09-23

### Added

- Remove tool (J): paint over something and it is filled from its surroundings when you release.
- Remove Wires and Cables (Remove tool option and Edit menu): finds wires and cables on the layer by itself and fills them.
- 4 more tests (2 unit, 2 browser): 183 in all.

## 0.87.0 · 2026-09-23

### Added

- Layer styles: up to ten each of Drop Shadow, Stroke, Inner Shadow, Color Overlay and Gradient Overlay; Stroke positions Outside, Inside and Center; contours on shadows, glows and Bevel & Emboss (eleven presets); the document's Global Light, used by shadows and bevels that ask for it.
- 12 more tests (6 unit, 6 browser): 179 in all.

## 0.86.0 · 2026-09-23

### Added

- Layer > Replace Contents: a new image for a smart object, at the same scale and centre, its filters re-run.
- Smart filter masks: add from the selection (or white), disable, enable and delete; saved with .sonny projects.
- Linked smart objects: File > Place Linked, Layer > Update Modified Content, Relink to File and Embed Linked. In Chrome and Edge a link re-reads its file when it changes on disk and survives a reload; other browsers keep the link but cannot see later changes.
- 4 more browser tests: 167 in all.

## 0.85.0 · 2026-09-23

### Added

- Gradient Editor (Gradient tool > Edit): add, move and remove colour stops with their colour, opacity and location; Noise gradients with Roughness and Randomize; save gradients by name.
- Edit > Fill > History: fill with the layer as it was at the oldest kept history step.
- 5 more tests (3 unit, 2 browser): 163 in all.

## 0.84.0 · 2026-09-23

### Added

- Edit > Content-Aware Fill: a workspace that shows where the fill samples from (Auto, Rectangular, or painted Custom), previews the result, and outputs to the current layer, a new layer or a duplicate.
- 5 more tests (3 unit, 2 browser): 158 in all.

### Changed

- The one-click fill on Shift+Backspace is now labelled Quick Content-Aware Fill.

## 0.83.0 · 2026-09-23

### Added

- Select > Select and Mask (Alt+Mod+R): view the selection as Overlay, On Black, On White or Black & White; refine it with Radius, Smooth, Feather, Contrast and Shift Edge; output it as the selection, a layer mask, a new layer or a new layer with a layer mask.
- 7 more tests (5 unit, 2 browser): 153 in all.

## 0.82.0 · 2026-09-23

### Added

- Crop: Straighten (up to 45 degrees either way) with a Level line button that sets the angle from a line you drag; Content-Aware fills the corners the turn opens and canvas a wider frame adds; Perspective turns the frame into four free corners and flattens that area into the whole canvas.
- 7 more tests (3 unit, 4 browser): 146 in all.

### Fixed

- The status bar's tool hint no longer nudges the layout when its text changes.
- Several browser tests switched tools through a command that does not exist; they now switch through the engine and check that it happened.

## 0.81.0 · 2026-09-23

### Added

- Edit > Puppet Warp: click to place pins, drag them to bend the layer, Alt-click to remove one; Enter applies, Escape cancels.
- 6 more tests (4 unit, 2 browser): 139 in all.

### Known issues

- Puppet Warp leaves a layer mask where it was rather than bending it with the pixels.

## 0.80.0 · 2026-09-23

### Added

- Filter > Liquify (Shift+Mod+X): Forward Warp, Reconstruct, Twirl Clockwise and Counterclockwise, Pucker and Bloat in a preview, with brush size and pressure and Restore All; OK applies as one step, Cancel changes nothing. The displacement field is ported from NodeMode's sonny studio.
- 7 more tests (5 unit, 2 browser): 133 in all.

## 0.79.0 · 2026-09-23

### Added

- Edit > Warp: drag the points of a 4 x 4 grid to bend a layer smoothly; Enter applies, Escape cancels. The warp is ported from NodeMode's sonny studio.
- 9 more tests (7 unit, 2 browser): 126 in all.

## 0.78.0 · 2026-09-23

### Added

- Moving a layer snaps to guides when they are shown and to the grid when it is shown.
- 3 more browser tests: 117 in all.

### Changed

- Snapping measures each layer's visible pixels, as Photoshop does, instead of its whole bounds, so painted layers snap by what you see.

## 0.77.0 · 2026-09-23

### Added

- Rulers (View > Show Rulers, Mod+R) along the top and left of the canvas.
- Guides: drag them out of the rulers, move them with the Move tool, drop them on a ruler to delete; View > Show Guides (Mod+;), Lock Guides (Alt+Mod+;), Clear Guides and New Guide. Guides are undoable and save with .sonny projects.
- A layout grid (View > Show Grid, Mod+') every 100 px with four subdivisions.
- 3 more browser tests: 114 in all.

## 0.76.0 · 2026-09-23

### Added

- File > Export As (Alt+Shift+Mod+W): PNG, JPEG, WebP, AVIF, TIFF or PDF at a chosen quality and scale, with the size and file name shown first (`Shot@2x.png`), seven built-in presets, and your own presets saved in the browser.
- 7 more tests (4 unit, 3 browser): 111 in all.

## 0.75.0 · 2026-09-22

### Added

- File > Export WebP, Export TIFF, Export PDF and Export AVIF. WebP is encoded in the browser; TIFF (LZW, transparency kept), PDF (one page, on white) and AVIF go through the engine.
- 6 more tests (2 backend, 4 browser): 104 in all.

## 0.74.0 · 2026-09-22

### Added

- The Gradient tool draws all five of Photoshop's types (Linear, Radial, Angle, Reflected, Diamond) and offers gradient presets: Foreground to Background, Foreground to Transparent, Black, White, Spectrum, Copper, Chrome, and Foreground, Background, Foreground.
- Edit > Fill (Shift+F5): Contents (foreground, background, any colour, Content-Aware, pattern, black, 50% grey, white), Mode, Opacity and Preserve Transparency.
- 12 more tests (5 unit, 7 browser): 98 in all.

## 0.73.0 · 2026-09-22

### Added

- Patch modes: Destination (drag the selection onto what it should cover), Transparent (keep what is underneath and add only the source's texture) and Content-Aware (the seam is synthesized rather than colour-blended).
- 4 more browser tests: 86 in all.

## 0.72.0 · 2026-09-22

### Added

- Clone Stamp source transforms: Source scale, Source angle, Flip horizontal and Flip vertical, with the brush preview showing the result.
- 4 more browser tests: 82 in all.

## 0.71.0 · 2026-09-22

### Added

- Select > Subject selects the main subject of the image in one step.
- Select > Object in Selection selects the object inside a marquee you draw around it.
- 2 more browser tests (skipped with a reason when the engine has no background method): 78 in all.

## 0.70.0 · 2026-09-22

### Added

- Pen pressure for the Brush: size and flow can follow pressure, each with a minimum; a mouse paints as before.
- Brush presets: Hard round, Soft airbrush, Ink, Pencil and Marker, from the Brush options. The dynamics model and the presets are ported from NodeMode's sonny studio.
- 8 more tests (5 unit, 3 browser): 76 in all.

## 0.69.0 · 2026-09-22

### Added

- The Shape tool (U) draws Polygon (3 to 100 sides), Star (points and indent), Line (weight), Arrow (head length and width) and Heart, beside Rectangle and Ellipse, each as an editable shape layer; Shift+U cycles all seven. The generators are ported from NodeMode's sonny studio.
- 9 more tests (6 unit, 3 browser): 68 in all.

## 0.68.0 · 2026-09-22

### Added

- Filter > Lens Blur: an iris-shaped blur in linear light, with specular highlights that bloom into bright discs.
- Filter > Smart Sharpen: removes Gaussian, lens or motion blur, with Reduce Noise and fades for shadows and highlights.
- A Sharpen mode for the Smear tool (R), beside Blur.
- 12 more tests (9 unit, 3 browser): 59 in all.

### Fixed

- The History panel's step count no longer nudges the panel header as it changes.

## 0.67.0 · 2026-09-22

### Added

- Automated tests: 31 unit tests for the engine (vitest), 9 for the engine service (pytest) and 7 in the browser against the dev build (Playwright), 47 in all.
- `./sonny test` (and `sonny.bat test`) runs all three suites, or `unit`, `backend` or `e2e` alone.
- CI runs every suite on each push and pull request, the browser tests in their own job.

## 0.66.0 · 2026-09-22

### Added

- All 27 of Photoshop's layer blend modes: Dissolve, Linear Burn, Darker Color, Lighter Color, Vivid Light, Linear Light, Pin Light, Hard Mix, Subtract and Divide join the seventeen, and travel through PSD.
- Eleven adjustments, as adjustment layers and on the image: Brightness/Contrast, Vibrance, Color Balance, Black & White, Photo Filter, Channel Mixer, Invert, Posterize, Threshold, Selective Color and Develop.
- Layer > Align (six edges and centres) and Distribute (six, plus horizontal and vertical spacing), measured on visible pixels.
- Select > Feather (Shift+F6), Border and Smooth.
- Help > Copy Error Log.

### Changed

- An operation that fails part-way is undone, pixels and layers alike, and named in a notice, instead of leaving a half-applied step.
- Uncaught errors show one notice and are logged; the app keeps working.
- Documents with unsaved changes are kept in the browser while you work and offered back after a crash or a closed tab.

## 0.65.0 · 2026-09-21

### Added

- Select > Color Range: select by sampled colours with Fuzziness, or by Highlights, Midtones or Shadows, with a live preview.
- The Quick Selection tool (W, sharing the key with Magic Wand): brush over an area and the selection grows to it, stopping at edges.

## 0.64.0 · 2026-09-21

### Added

- The Paint Bucket tool (G, sharing the key with Gradient).
- The Dodge, Burn and Sponge tools (O).

## 0.63.0 · 2026-09-21

### Added

- Editable type travels to and from Photoshop: PSD export writes type layers as Photoshop type, and PSD import opens Photoshop type as editable sonny type.

## 0.62.0 · 2026-09-21

### Added

- Layer styles travel to and from Photoshop: PSD export writes them as editable Photoshop layer effects, patterns included, and PSD import turns Photoshop's effects into editable sonny styles.

## 0.61.0 · 2026-09-21

### Added

- The Pattern Overlay layer style, with four built-in patterns.
- Edit > Define Pattern, from the selection or the whole canvas; defined patterns are kept in this browser.
- Projects carry the patterns their styles use, so they open the same anywhere.

## 0.60.0 · 2026-09-21

### Added

- The Satin layer style.

### Changed

- The Layer Style dialog previews quicker on large layers, computing effects at reduced resolution until the style is applied.

### Fixed

- Outer Bevel and Emboss could be cut off at the edge of a layer whose pixels fit its shape exactly.

## 0.59.0 · 2026-09-21

### Added

- The Bevel and Emboss layer style: Inner Bevel, Outer Bevel, Emboss and Pillow Emboss, with depth, direction, size, soften, angle, altitude, and highlight and shadow colours and opacities.
- Animation frames keep each layer's style, so a style can appear in some frames and not others.

## 0.58.0 · 2026-09-21

### Added

- The Gradient Overlay layer style: linear or radial, with angle, scale, opacity and reverse.
- Image > Trim, by transparent pixels or a corner pixel's colour, and Image > Reveal All.

### Changed

- Snapshots have a memory budget of their own, 768 MB per document; past it New Snapshot declines and says why, and each snapshot shows its size.

## 0.57.0 · 2026-09-21

### Added

- History snapshots: keep the document as it is and return to it at any time, however far the steps have moved on.
- Tween easing: Linear, Ease In, Ease Out, and Ease In and Out.

## 0.56.0 · 2026-09-21

### Added

- A History panel below the Timeline: every step kept, and a click goes back or forward to any of them.

### Changed

- Large smart objects re-render their filters in the background; the latest change wins when changes come quickly.

## 0.55.0 · 2026-09-21

### Changed

- Filters apply in the background: the interface stays responsive while a large filter runs, and a filter whose layer changes meanwhile is not applied.
- Brush strokes start about four times faster on large images.

## 0.54.0 · 2026-09-21

### Added

- Smart objects with a layer mask can be distorted; a linked mask follows the distortion.

### Changed

- Gaussian Blur, and the effects built on it, run about 2.7 times faster on large images, with identical results.

### Fixed

- Distorting a layer that had a mask lost the masking: the whole layer showed afterwards.
- Setting a layer style that named only some effects could make rendering fail.

## 0.53.0 · 2026-09-21

### Added

- Actions pause for input: Insert Stop shows a message with Continue or Stop, and a filter or image adjustment step can open its dialog during playback with the recorded settings to adjust.
- Smart objects travel to and from PSD as Photoshop smart objects, their originals embedded.

## 0.52.0 · 2026-09-21

### Added

- Distort and Perspective work on smart objects and stay editable: every re-render warps afresh from the original, and distorting again adjusts the same shape.
- Actions record Layer Style.

## 0.51.0 · 2026-09-21

### Added

- Actions record adjustments with their settings, applied to the image or as a new adjustment layer, and replay them without opening a dialog.

## 0.50.0 · 2026-09-21

### Added

- Timeline > Tween fills frames between the selected frame and the next, stepping layer position and opacity, fading layers shown in only one of them.
- Frames can be dragged to a new place in the Timeline.

## 0.49.0 · 2026-09-21

### Added

- Frame animation: a Timeline below Paths, where each frame keeps every layer's visibility, opacity and position with a delay; frames are made, selected, timed and deleted there, played in a preview, and saved with the project.
- File > Export GIF exports the frames, or the image as it stands, at 100, 75, 50 or 25 percent.

## 0.48.0 · 2026-09-21

### Added

- Shape layers take a fill, a stroke centred on the outline, or both: Layer > Shape Fill and Stroke, or double-click the shape badge. A path of open lines becomes a stroked vector line.
- PSD export writes shape layers as Photoshop shapes with their fill and stroke, and PSD import turns Photoshop shapes back into editable shape layers.
- A GIF encoder, the groundwork for frame animation.

### Fixed

- The Hand tool's icon was malformed; it now uses the supplied cursor-hand icon from Remix Icon.

## 0.47.0 · 2026-09-21

### Added

- A Paths panel below the layers: the Work Path and named paths, selected, created, renamed and deleted there, all saved with the project.
- Shape layers: Layer > New Shape Layer from Path fills a path as a layer whose outline stays editable with Direct Selection; Layer > Shape Color from Foreground refills it.
- Actions can size each image in proportion: Image and Canvas Size steps follow each image when the action's option is on.

## 0.46.0 · 2026-09-21

### Added

- Paths save with `.sonny` projects and come back when they open.
- The Pen adds a point where you click on a path and deletes a point you click, keeping curves exact.
- Layer > Edit Contents opens a smart object's original pixels as their own document; saving it updates the smart object.

### Fixed


## 0.45.0 · 2026-09-21

### Added

- Smart objects: Layer > Convert to Smart Object keeps the original pixels; filters on it stay editable in Layer > Smart Filters, where each can be hidden, re-edited or removed.
- Layer > Rasterize Layer turns a smart object or a type layer into plain pixels.

## 0.44.0 · 2026-09-21

### Added

- File > Actions: record what you do into a named action, play it on any document, and export or import it as JSON.
- File > Batch: play an action on a set of images and download the results as one zip.

## 0.43.0 · 2026-09-21

### Added

- The Pen tool (P): click for corner points and drag for curves to draw a path; click the first point to close it.
- The Direct Selection tool (A): drag a path's points to move them and their handles to reshape its curves.
- Select > Make Selection from Path (Ctrl or Cmd with Enter), Edit > Fill Path and Stroke Path, and Delete Path.

## 0.42.0 · 2026-09-21

### Added

- The Healing Brush: Alt-click a source and paint; on release the copied texture blends into its surroundings' tone.
- The Patch tool: draw around a flaw, then drag the selection onto clean texture to patch it.
- J selects the healing tools and Shift+J cycles Spot Healing, Healing Brush and Patch.
- Open layered Photoshop files (.psd) and export to them (File > Export PSD), keeping layers, folders, masks, clipping, opacity, blend modes and visibility.

## 0.41.0 · 2026-09-21

### Added

- Type straight onto the canvas: click with the Type tool and type, or click existing text to edit it in place. Ctrl or Cmd with Enter, clicking elsewhere, or switching tools commits; Escape cancels.
- The Type tool's options bar sets Font, Size, Align, Bold, Italic and Leading, changing text as you type.

### Changed

- Layer styles are computed once and kept, so panning, zooming and painting other layers stay quick in documents that use them.

## 0.40.0 · 2026-09-21

### Added

- The Type tool (T) and type layers: click to add text with font, size, line height, alignment, bold, italic and colour, and click it again, double-click its layer, or use Layer > Edit Type to change it. Painting on type turns it into pixels.
- Layer styles gain Inner Shadow, Inner Glow and Color Overlay; styled layers show fx in the Layers panel, and double-clicking fx opens Layer Style.
- Layer > Copy Layer Style, Paste Layer Style and Clear Layer Style, which paste to or clear every selected layer at once.

## 0.39.0 · 2026-09-21

### Added

- Layer > Layer Style (also on the Layers panel's right-click menu): Drop Shadow, Outer Glow and an outside Stroke, shown live as you adjust them, kept in `.sonny` projects.

## 0.38.0 · 2026-09-21

### Added

- Image > Generative Expand: grow the canvas by margins on any side and fill the new border from a prompt, or extend the scene with none.
- Image > Upscale 2x and 4x: Real-ESRGAN on fal enlarges what the document shows and opens it as a new document.

### Changed

- Generative requests now see colours extended into transparent areas instead of empty space, which helps on transparent layers and new canvas.

## 0.37.0 · 2026-09-21

### Added

- Edit > Generative Fill: describe what to paint into the selection, or leave the prompt empty to remove what it covers. It runs FLUX.1 Fill or Erase on fal with your fal key, set as `FAL_KEY` or pasted once into the dialog, and the result arrives as a new layer masked to the selection.

### Changed


## 0.36.0 · 2026-09-21

### Added

- Filter > Develop (Shift+Cmd+A): Camera Raw-style Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temperature, Tint, Vibrance, Saturation, Dehaze, Vignette, Grain, Clarity, Texture and Sharpening, brought over from formnodal's develop studio and previewed without freezing the window.

## 0.35.0 · 2026-09-21

### Changed

- Spot Healing, Content-Aware Fill, Smudge, Liquify, Remove Background's refine, the selection outline, Free Transform, perspective distort and the brush were rewritten from standard published methods. Healing and Content-Aware Fill are more accurate (fill error measured at half the old), Content-Aware Fill takes longer on large holes, and the outline draws slightly faster.
- Smudge's Strength now sets how far the paint travels.
- Soft brushes have a slightly lighter outer edge: the tip now follows its falloff curve exactly.

## 0.34.0 · 2026-09-21

### Changed

- The adjustment kernels (Levels, Curves, Exposure, Gradient Map), the Magic Wand, the blur, noise and lens filters, expand and contract, and Hue/Saturation and Grain were rewritten from standard published methods. Everything renders exactly as before except Add Noise and Grain, which keep their strength and look but lay down a different random pattern, so an existing Grain layer's grain will not match its earlier render.

## 0.33.0 · 2026-09-21

### Added

- Four more blend modes, Soft Light, Hard Light, Exclusion and Linear Dodge (Add), with the list now in Photoshop's order.
- Filter > Unsharp Mask, with Amount, Radius and Threshold, previewed without freezing the window.

### Fixed

- Code formatting and the change logs' quoted code, damaged by the 0.31.0 wording change, are restored exactly.

## 0.32.0 · 2026-09-21

### Changed

- New app icon everywhere sonny shows its mark: the desktop apps (macOS, Windows and Linux icons), the browser tab (with an `.ico` fallback and an Apple touch icon), the welcome card, the About dialog, and the desktop splash window shown while the engine starts.

## 0.31.1 · 2026-09-20

### Changed


## 0.31.0 · 2026-09-20

### Changed

- Licensed under the Apache License 2.0, Copyright 2026 nodemode-ai.
- Documentation, comments and interface text now describe sonny's own behaviour.

## 0.30.0 · 2026-09-20

### Added

- Crop edges snap to visible layers' edges as well as the canvas: creating or resizing snaps the edge you drag, moving snaps the frame while keeping its size, and a fixed ratio only snaps moves.
- Export JPEG has the shortcut, Alt+Shift+Cmd/Ctrl+S.

### Verified

- Every one of the 33 menu shortcuts was compared with sonny's; all match, apart from Close (Cmd/Ctrl-W in the desktop app, Alt+Cmd/Ctrl+W on the web where browsers reserve it) and the macOS-only Hide Others.

### Known gaps

The desktop shell has not been compiled (first CI run pending), and the desktop-only items wait on it.

## 0.29.0 · 2026-09-20

### Changed

- Painting on large canvases repaints only the area the brush changed each frame instead of the whole visible canvas, as the tiled renderer does. On a 4000 by 3000 document at 100 percent, a stroke frame composes 5,180 pixels instead of 853,776, with an identical result.

### Known gaps

The desktop shell has not been compiled (first CI run pending), and the desktop-only items wait on it.

## 0.28.0 · 2026-09-20

### Added


### Note

- The export was checked against the own validation rules and reopened in sonny; it has not yet been opened itself, which runs only on macOS.

### Known gaps

Painting speed on very large canvases; the desktop shell has not been compiled (first CI run pending).

## 0.27.0 · 2026-09-20

### Added

- Clone Stamp previews inside the brush circle what a click would stamp: the source pixels, faded by the brush's hardness and shown at its opacity. Holding Alt to pick a new source hides it. With this, every one of the fourteen tools is complete.

### Verified

- The layers panel width persists between sessions (it already did; the plan had recorded otherwise).
- The interface was checked for layout shift and flicker under a slowed CPU in the Light theme, completing both light themes and the default.

### Known gaps

Painting speed on very large canvases; the desktop shell has not been compiled (first CI run pending).

## 0.26.0 · 2026-09-20

### Changed

- Filter previews now run in a background worker, so dragging a slider no longer freezes the window. On a 2400 by 1800 document the longest interface stall during a Gaussian Blur preview fell from 554 ms to 48 ms, with identical results. Applying a filter still runs on the main thread.

### Corrected

- Clone Stamp was recorded as missing a "brush-sized sample ring". marks its source with a crosshair, which sonny already draws. The real difference is that previews inside the brush circle what a click would stamp, which sonny does not do yet.

### Known gaps

The Clone Stamp preview above; painting speed on very large canvases; the desktop shell has not been compiled (first CI run pending).

## 0.25.0 · 2026-09-20

### Added

- Exported PNG and JPEG files now carry the document's resolution (dots per inch), as the exports do, so print and layout apps size them correctly.
- In the desktop app, Cmd/Ctrl-W closes the current project tab (asking first if it has unsaved changes). The web version keeps Alt+Cmd/Ctrl+W, because browsers reserve Cmd/Ctrl-W for their own tab.

### Verified

- Every way of closing a project asks before discarding unsaved changes: the tab's close button, middle-click, Close Tab, and closing or reloading the page.
- Filter previews already apply only inside the selection, as the final result does.
- The interface was checked for layout shift and flicker under a slowed CPU in the Sand light theme as well as the default.

### Known gaps

The desktop shell has not been compiled (first CI run pending), and the desktop-only items wait on it.

## 0.24.0 · 2026-09-20

### Added

- During Transform Selection the selection outline now follows the pixels as they move, scale or rotate, and keeps marching; before, it hid until the transform was applied.

### Known gaps

The desktop shell has not been compiled (first CI run pending), and the desktop-only items wait on it.

## 0.23.0 · 2026-09-20

### Added

- Open Recent in the File menu: the ten projects most recently saved or opened, newest first, with Clear Recent. A project no longer in the library says so and drops out of the list.

### Corrected

- Autosave was listed as missing; has no autosave, so it was never a parity gap and is dropped.

### Known gaps

Selection ants during Transform Selection; the desktop shell has not been compiled (first CI run pending).

## 0.22.0 · 2026-09-20

### Added

- Right-drag brush sizing: with Brush, Spot Healing, Clone Stamp or Smear, right-drag left or right to resize the brush (its circle stays where you pressed), or hold Shift to change its hardness instead.

### Corrected

- Pen pressure was listed as a missing brush control; has no pressure support, so it was never a parity gap and is dropped.

### Known gaps

Selection ants during Transform Selection; recent projects and autosave; the desktop shell has not been compiled (first CI run pending).

## 0.21.0 · 2026-09-20

### Added

- Free distort: with the Move tool, Cmd-drag a corner handle to move that corner on its own. The distortion stays pending so any corner can be adjusted; Enter applies, Escape cancels. Works on several selected layers or a folder together. Linked masks warp along, masks placed apart take the same perspective, unlinked masks stay put; shape layers become pixels.

### Fixed

- A layer that other layers clip to now previews at the right scale while it is being transformed with a different-size preview.

### Known gaps

The desktop shell has not been compiled (first CI run pending).

## 0.20.0 · 2026-09-19

### Added

- Pinch to zoom in Safari and the macOS desktop app: trackpad pinches zoom about the pointer (Chrome already did).
- Sharper zoomed-out views: layers shown at under half size are drawn from a chain of exact halvings, instead of one soft or grainy reduction.

### Changed

- Zoom tool scrubbing now doubles per 100 px dragged (it was 160).

### Known gaps

Free distort; the desktop shell has not been compiled (first CI run pending).

## 0.19.0 · 2026-09-19

### Added

- Deleting a layer that other layers are clipped to now asks: Bake and Delete keeps their clipped look in their own pixels; Remove Links and Delete unclips them and shows all their pixels. Either can be undone. Before, sonny unlinked them without asking.

### Corrected

- 0.18.0 listed "live masks" as not built. In a live mask is a clipping mask, which sonny has had all along; only this deletion choice was missing.

### Known gaps

Free distort; the Zoom tool's drag rectangle and pinch; the desktop shell has not been compiled (first CI run pending).

## 0.18.0 · 2026-09-19

### Added

- Drag layers between projects: drag a layer row onto another project's tab to copy the layer (a folder with its contents) into that project, centered on its canvas.
- Group moves snap: several layers moved together snap their outline to the canvas and other layers, with guides.

### Known gaps

Live masks (a layer masked by another layer's content) and their deletion choice; free distort; the desktop shell has not been compiled (first CI run pending).

## 0.17.0 · 2026-09-19

### Added

- Transform several layers together: with more than one layer selected, or a folder, the Move tool's handles surround all of them, and moving, resizing or rotating carries every layer along, as one undo step.

### Known gaps

Snapping for group moves; dragging layers between projects; the live-mask deletion choice; free distort; the desktop shell has not been compiled (first CI run pending).

## 0.16.0 · 2026-09-19

### Added

- Smear's Blur on masks: with a layer mask targeted, the Smear tool's Blur mode softens the mask under the brush, the way blurs masks. All fourteen of the tools are now complete.

### Known gaps

Transforming several selected layers together; dragging layers between projects; the live-mask deletion choice; free distort; the desktop shell has not been compiled (first CI run pending).

## 0.15.0 · 2026-09-19

### Added

- Move an unlinked mask on its own: with a layer's mask unlinked and selected, the Move tool's handles sit on the mask and move, resize or rotate it without the layer. Linked masks still move with their layer.

### Changed

- The planning scoreboard no longer lists "mask feather and blur shortcuts": has no feather command and blurs masks with the Blur tool, which is the Smear tool's Blur-on-masks gap.

### Known gaps

Smear's Blur on masks; transforming several selected layers together; dragging layers between projects; free distort; the desktop shell has not been compiled (first CI run pending).

## 0.14.0 · 2026-09-19

### Added

- Option-click clipping: with Option (Alt) held, the bottom edge of a layer row shows a clipping cursor; click there to clip that layer to the one below, or to release it.
- Option-drag mask copy: drag a mask thumbnail onto another layer with Option held to copy the mask there, in the same place on the image, replacing any mask it had.

### Known gaps

Mask feather and blur shortcuts; moving an unlinked mask on its own; transforming several selected layers together; dragging layers between projects; free distort; Smear's Blur on masks; the desktop shell has not been compiled (first CI run pending).

## 0.13.0 · 2026-09-19

### Added

- Selection nudging: in the Marquee, Lasso and Magic Wand, arrow keys move the outline 1 px, or 10 with Shift.
- Magic Wand Sample Size: Point, 3 by 3 or 5 by 5.
- Marquee autoscroll: drag a marquee or a selection outline to the edge of the view and the view pans with it.
- Anti-alias option for the Lasso and elliptical Marquee.
- Marquee modifiers work like this: a key held from the press sets the mode; released and pressed again during the drag, Shift makes a square and Alt draws from the center.

### Known gaps

Free distort; Smear's Blur on masks; ants that follow a floating selection; opening a clicked file in the running desktop app; the desktop shell has not been compiled (first CI run pending).

## 0.12.0 · 2026-09-19

### Added

- Layer via Copy (Cmd-J with a selection): the selected pixels become a new layer in place; without a selection Cmd-J still duplicates the layer, and the menu names whichever it will do.
- Desktop releases: macOS signing and notarization from repository secrets, the hardened runtime, `.sonny` file associations, and in-app updates from GitHub Releases once the updater key exists. See the wiki's Releasing page.

### Fixed

- The desktop release job would have published no files: it attached only top-level paths while the bundles sit in subfolders.

### Known gaps

Free distort; Smear's Blur on masks; ants that follow a floating selection; opening a clicked file in the running desktop app; the desktop shell has not yet been compiled (first CI run pending).

## 0.11.0 · 2026-09-19

### Added

- Sample ring: while the Eyedropper samples with a drag, a ring around the pointer shows the new color on its top half and the previous one below. The color picker's canvas sampling now follows a drag and shows it too. The Eyedropper's Sample Ring option turns it off.

### Known gaps

Free distort; Smear's Blur on masks; ants that follow a floating selection; Layer via Copy; desktop shell still uncompiled.

## 0.10.1 · 2026-09-19

### Documentation

- README and wiki audited against the code: the README's status no longer calls Levels Auto and the Hue/Saturation eyedroppers unbuilt, its highlights cover 0.4.0 to 0.10.0, and the Engine, Tools, UI Shell, Engine Service, Verification and Home pages describe the current modules and panels. No code changes.

## 0.10.0 · 2026-09-19

### Added

- Color picker: clicking the foreground or background swatch opens a Photoshop-style picker with a saturation and brightness field, a hue strip, new and current swatches, and RGB and hex entry. Click the canvas while it is open to sample a color.

### Known gaps

Free distort; the sample ring cursor; Smear's Blur on masks; ants that follow a floating selection; desktop shell still uncompiled.

## 0.9.0 · 2026-09-19

### Added

- Remove Background panel: the subject the engine finds opens in a panel instead of being applied at once. Basic uses the mask as found; Advanced refines it with Refine (pulls the mask onto the image's own edges, recovering hair and fur), Contrast (clears haze) and Shift Edge (shrinks or grows the mask). The layer previews with its background hidden, OK adds a layer mask in one step, and an existing mask is combined rather than replaced.

### Known gaps

The color picker and palette; free distort; Smear's Blur on masks; ants that follow a floating selection; the sample ring cursor; desktop shell still uncompiled.

## 0.8.0 · 2026-09-19

### Added

- Hue/Saturation band editing: two spectrum bars show the hues before and after the adjustment, with the selected color range's four handles between them to drag.
- Hue/Saturation eyedroppers: Sample centers the range on a clicked color, Add widens it to include one, Remove narrows it to exclude one.
- Targeted adjustment: drag on the image to change the saturation of the color under the pointer, or its hue with Cmd or Ctrl held; the matching color range is chosen for you.

### Known gaps

Free distort; the color picker and palette; the Remove Background panel; Smear's Blur on masks; ants that follow a floating selection; desktop shell still uncompiled.

## 0.7.0 · 2026-09-19

### Added

- Levels eyedroppers: choose Black point, Gray point or White point under Sample, then click the canvas; the panel stays open and interactive while you sample, and clicks go to the eyedropper rather than the active tool.

### Changed

- The parity scoreboard now counts Content-Aware Fill as complete: it already grew an upright layer to fill past its edges, which the 0.3.0 notes had missed.

### Known gaps

Hue/Saturation bands and eyedroppers; free distort; the color picker and palette; the Remove Background panel; Smear's Blur on masks; ants that follow a floating selection; desktop shell still uncompiled.

## 0.6.0 · 2026-09-19

### Added

- Levels Auto: Contrast, Color, and Color + neutral midtones, as computes them, from an Auto choice in the Levels panel.
- JPEG export sheet: Export JPEG... opens a sheet with a Quality slider that starts from your last export (85% the first time), the image size, and a live preview of the encoded JPEG with its file size.

### Known gaps

The Levels black, gray and white eyedroppers; Hue/Saturation bands and eyedroppers; free distort; the color picker and palette; the Remove Background panel; Smear's Blur on masks; Content-Aware Fill past the layer's edges; ants that follow a floating selection; desktop shell still uncompiled.

## 0.5.0 · 2026-09-19

### Added

- Transform Selection (Edit menu, Alt+Mod+T in the browser, Mod+T on the desktop): the selected pixels float on a temporary layer with the usual handles and fields; Enter applies them, growing the layer where they now extend past its edges and carrying the selection along, and Escape restores everything. Switching tools or layers applies the float. Without a selection the command reads Transform Layer and switches to the Move tool.

### Fixed

- Save, Download Project File and Export now apply pending edits first: a gradient not yet applied was left out of saves and exports since 0.2.0, and a floating selection would have been written twice.

### Known gaps

Free distort; the color picker and palette; the Remove Background panel; Hue/Saturation bands and eyedroppers; Levels Auto; the JPEG export sheet; Smear's Blur on masks; Content-Aware Fill past the layer's edges; the marching ants hide while pixels float rather than following the transform; desktop shell still uncompiled.

## 0.4.0 · 2026-09-19

### Added

- Snapping: a layer dragged with the Move tool snaps its edges and center to the canvas edges and center and to other layers' edges and centers, with dashed guides; a Snap toggle turns it off.
- Editable transform fields in the Move options bar: X, Y, W, H, Scale and Angle (W and H keep proportions with the lock), plus Sampling; each edit is one undo step.
- Moving selected pixels: drag inside a selection with the Move tool to move its pixels, hold Alt to duplicate them, Shift to keep one axis, Escape to cancel; the selection moves with them.

### Fixed

- Number fields committed twice on Enter, which compounded relative edits such as Scale.

### Known gaps

Transform Selection (Cmd-T on floating pixels) and free distort; the color picker and palette; the Remove Background panel; Hue/Saturation bands and eyedroppers; Levels Auto; the JPEG export sheet; Smear's Blur on masks; Content-Aware Fill past the layer's edges; desktop shell still uncompiled.

## 0.3.0 · 2026-09-19

### Added

- Spot Healing (J): paint over a spot and it heals on release, as Content-Aware, Create Texture or Proximity Match, ported from the healing kernel.
- Clone Stamp (S): Alt-click sets the source; Aligned keeps the offset between strokes; Sample all layers copies what you see.
- Smear (R): Liquify pushes pixels with the brush, Blur softens (a new stroke softens further), Smudge carries color along the stroke.
- Content-Aware Fill (Shift+Backspace, Edit menu) fills the selection from its surroundings.

### Known gaps

The Remove Background panel, the editable transform inspector with free distort and snapping, floating selections, the color picker, Hue/Saturation bands and eyedroppers, Levels Auto, the JPEG export sheet, and Smear's Blur on masks; desktop shell still uncompiled.

## 0.2.0 · 2026-09-19

### Added

- More adjustments: Hue/Saturation (Master and six color ranges, colorize, invert range) and Grain join Levels, Curves, Exposure and Gradient Map. Each works as an editable adjustment layer (Layer, New Adjustment Layer; double-click to edit) and as a direct edit (Image menu), with live preview. Levels shows a histogram; Curves has a point editor.
- Filter menu: Gaussian Blur and Motion Blur (spreading past the layer edge), Add Noise, Lens Correction, and Remove Background moved here.
- Edit: Cut, Copy, Copy Merged, Paste in place, using the system clipboard.
- Select: Mask's Black Areas, Expand and Contract by an amount.
- Image: Canvas Size (units, anchor, extension color) and Image Size (constrain, resolution, resampling).
- Tools: Crop (ratios, snapping to the canvas), Gradient (linear or radial, editable ends until applied), Shape (rectangle or ellipse layers that redraw crisply when resized).

### Fixed

- Clearing a selection on a mask now fills with the background color.
- Hidden rows inside dialogs now actually hide.

### Known gaps

Spot Healing, Clone Stamp, the Blur tool, Content-Aware Fill, the Remove Background panel, the editable transform inspector, floating selections, the color picker, Hue/Saturation bands and eyedroppers, Levels Auto, the JPEG export sheet; desktop shell still uncompiled.

## 0.1.0 · 2026-09-19

### Added

- Engine: layers with pass-through folders, 13 blend modes, raster and folder masks, clipping chains, Levels, Curves, Exposure and Gradient Map adjustments on open, selections with marching ants, brush strokes, transforms, 100-step history.
- Tools: Move with transform handles, Marquee, Lasso, Magic Wand, Brush and Eraser, Eyedropper, Hand, Zoom.
- Files: new canvas, image import (drop, paste, picker; HEIC and TIFF through the engine), project library save and open, `.sonny` download, PNG and JPEG export.
- Remove Background with rembg (ML) or OpenCV GrabCut (lightweight), producing a layer mask.
- NodeMode styling, 14 themes, the portal protocol and send to canvas.
- Engine service, setup scripts with Windows twins, Tauri 2 desktop shell, CI, wiki publishing and desktop release workflows, wiki, project skill pack.

### Fixed before release

Found by the throttled browser verification and the Phase 2 check: Escape could not close a dialog opened with its default button disabled; double-click rename and folder disclosure did nothing; a no-op layer move created an undo entry; adding a mask, renaming a tab and the engine readout shifted layout; Inter swapped in after reveal; option bar icon buttons wrote their label into the icon box.

### Known gaps

Desktop shell not yet compiled; ML background removal not exercised end to end; Hue/Saturation and Grain adjustments render without effect; crop, retouching, gradient and shape tools, filters, Image Size and Canvas Size are not built yet.

# Changelog

Versions follow `v*.*.*` with dots. Dates are UTC. From 1.50.1 the last number runs 1 to 9, then the middle one rises (1.50.9, then 1.51.x).

The app was renamed formvis at 1.50.5; its projects were `.fmv` until 1.87.0 and are `.fvd` since. The entries below read with the new name throughout; the git history keeps the former one.

## 1.91.5 · 2026-10-20

### Added

- Filters at 16 and 32 bits: Oil Paint, Lighting Effects, all 47 Filter Gallery effects, and Median and Dust and Scratches at any radius (exact quickselect) run on the float channels; Mosaic, Crystallize and Offset follow an offset layer exactly.
- GPU: Negation, Reflect and Glow blend modes, adjustment layers with a blend mode, and adjustment layers with a luminosity or colour-range limit compose on the GPU (WebGL2 and WebGPU).
- Plug-ins: single-file plug-ins register import and export file formats (formvis.format), shown in Open, Import and Export As; 16-bit pixels for CMYK and Lab layers and for layers sized or placed apart from the document.
- Generate Image: Result "replace this picture" swaps the tab's picture for the generated one as one undo step, keeping Reference layers; New Document's Model Sizes lists each model on this computer's own sizes; the assistant shows tokens per message and a total since the window opened.
- Desktop shell: a second web view crash within two minutes shows a plain page that offers Restart or Quit (Linux and macOS; macOS also reloads after the first).

### Fixed

- Plug-in filters on Lab layers render the layer in its own terms.
- The shape helper surfaces of Brush Settings follow the stroke window (groundwork for Brush Settings on layers kept in tiles, which still decline until checked).
- e2e scenes for the More panel, the rail, number fields and recent UI changes follow the current UI.

## 1.91.4 · 2026-10-20

### Added

- Filters at 16 and 32 bits, CMYK and Lab: Trace Contour, Tiles, Extrude, Smart Blur, Shape Blur, Reduce Noise, Pointillize, Color Halftone, Mezzotint, Clouds, Difference Clouds, Fibers and Lens Flare run on the float channels (the area- and canvas-anchored ones stay on 8 bits under a selection).
- Camera Raw at 16 and 32 bits: every Develop stage (tone, parametric, Point Color, Grading, Calibration, clarity, texture, sharpening, noise reduction, dehaze, optics, geometry, post-crop vignette) runs on float pixels; 32-bit highlights still clip at white.
- GPU: a clipping base with a vector mask draws on the GPU; masked styled layers build their effects on the effect worker.
- Generator: SVG assets from shape layers, "name.jpg80" as 80 percent, and on the desktop a "document assets" folder beside the saved document.
- Plug-ins: getPixels and putPixels honour the selection and offer 16-bit data for deep RGB layers; single-file plug-ins can open a dock panel.
- MCP: jobs_list and jobs_cancel include the window's own jobs (Window > Jobs).
- ComfyUI recipes: Save as new from an exported graph file, the last five versions of each recipe with restore, and Send inputs to re-upload a recipe's pictures.
- The Patch tool's diffusion and colour correction (also the Healing Brush's) run in a WebAssembly SIMD kernel, byte-identical to the TypeScript.

### Fixed

- Strokes across a flush of a giant tiled layer match the unflushed stroke exactly at any opacity, flow or softness, as one exact undo step.
- Quick Shape no longer straightens a stroke because the page stalled; a late hold timer waits again.

## 1.91.3 · 2026-10-20

### Added

- GPU: layer styles on clipped layers, vector-masked layers and layers inside masked folders draw on the GPU, their effects built from the masked pixels and cached by mask version; the console names the display that draws (WebGPU, WebGL2 or native).
- Distort (Twirl, Pinch, Spherize, Ripple, Wave, ZigZag, Polar Coordinates, Shear), Diffuse, Wind, Crystallize, Fragment, Facet and Despeckle run on the float channels of 16 and 32-bit documents; Develop's tone, colour, curve, vignette, grain and dehaze pass runs on float input when no other Develop stage is active.
- MCP resource subscriptions notify on edits made by hand in the window.
- Plug-ins: getPixels and putPixels target an alpha channel by name; formvis.progress, cancelled and onCancel, and a plug-in's run shows as a cancellable job.
- Actions .atn: make, delete and select layer and set layer properties are written and read, with a Set Layer action step.
- Generate Image: a remembered working size for models on this computer; references gain a fit mode and To layer; a ComfyUI workflow says how many reference pictures it takes when too many are chosen.
- Add Noise's uniform grain runs in a WebAssembly SIMD kernel, byte-identical to the TypeScript.
- Save a Copy without layers works on documents past one canvas; a brush stroke can cross a tiled layer of any width as one undo step.

### Fixed

- Options bar: each tool keeps its own parked layout per bar width and its own More-panel section, so switching tools or painting a stroke no longer removes and re-adds bar nodes.
- Number fields select their whole value when focused by a click or a script, so typing replaces the old value instead of landing in front of it.
- Redefine Paragraph Style and Apply Data Set re-render type at the document's depth.
- e2e scenes for the More panel sections, the rail, Preferences and the recovery database follow the current UI.

## 1.91.2 · 2026-10-19

### Added

- Flatten Image, Merge Down, Merge Layers, Merge Visible and Duplicate (merged layers only) work on documents past 268 MP or 32,767 px: they render in bands into one tiled layer as one undoable step.
- Filters: a Limit by depth row (near, far, feather, fine detail); a standard or detail depth setting; the MCP tool select_by_depth.
- Remove Background and Select Subject can run a chosen ONNX matting model from the models folder's matting folder beside U2-Net and GrabCut.
- Camera Raw (Develop) docks as a panel that tears off and re-docks with its controls (Window > Camera Raw).
- Generate Image: references can be added from a file without making a layer (for ComfyUI workflows).
- Artboards draw on the GPU in the WebGL2 and WebGPU displays; Develop's Optics vignette runs in the WebGL2 Develop pass.
- Box Blur, Motion Blur, Find Edges and Emboss run on WebGL2 with the CPU as fallback.
- Filter bands run on the worker pool with a priority queue (bands nearest the view first), from shared memory when the window is cross-origin isolated.
- PSD: a pattern fill layer keeps its link flag, any angle and its own scale.
- Type with coloured runs is exact at 16 and 32 bits, CMYK and Lab.

### Fixed

- Merge Down and Merge Layers no longer skip layers kept in tiles.
- Tearing a dock panel off after dragging over the side column no longer breaks the dock.
- Flat saves of a CMYK or Lab picture to an RGB kind say that colours outside the RGB gamut are clipped.
- e2e scenes for the gradient options and the Brushes panel follow the current UI.

## 1.91.1 · 2026-10-19

### Added

- Home: a Back to Canvas button (and Esc) returns to the open document when Home was opened over it.
- Properties: an Adjustment section edits the active adjustment layer in place (one undo step per run of edits), with Edit in Dialog for the special editors; Develop gains zoom in, zoom out, Fit and 100%.
- A document depth map kept with the project and shared by Depth Blur, Relight, Color Range and depth limits; Select > Select by Depth with near, far and feather.
- Upscale runs a chosen ONNX upscaler from the models folder's upscalers folder, with a note when a file cannot be loaded.
- Desktop: files opened or saved from disk join the system's recent documents (GTK on Linux, the jump list on Windows, the Dock and Apple menu on macOS).
- Brush presets: nested folders, a Folder field and optional capture of the foreground colour and Brush Mode.
- Actions: Save .atn writes and reads Levels, Curves and Hue/Saturation steps.
- MCP: resources/subscribe and notifications/resources/updated over a per-session event stream.
- Plug-ins can read and write the Quick Mask.
- Filters: Offset and Mosaic run on float channels at 16 and 32 bits, CMYK and Lab; Develop's Noise Reduction gains Colour detail and Colour smoothness.
- Vanishing Point: Ctrl drag from a plane's edge tears off a connected plane and swings it to the pointer.
- GPU: the damaged-region effect-map rebuild is bit-exact and on by default; a clipped layer inside a masked folder or with a vector mask draws on the GPU.
- Background documents' GPU textures are released with their other caches.

### Fixed

- Switching document tabs no longer re-parks and re-adds the options bar's controls when the tool is unchanged.
- Opening a PSB or PSD no longer leaves blank the rows of a layer that reaches past the canvas edge.
- A stroke on a very wide tiled layer stops with the memory notice instead of throwing; tiled documents no longer stall under the pointer while an export runs (exports hold edits, as Save does).
- Recovery copies and saved projects of tiled documents wider than 30,000 px are accepted on reopening.
- The Gradient tool's live Gradient Fill layer is the edit target, so its handles work right after the drag.
- PSD: the curved Bevel edge Contour is written and read on layers that carry several instances of an effect.
- Float High Pass uses the exact Gaussian and matches the 8-bit result.
- The Remove tool says once when LaMa is on but not ready.
- `build_app` prints the version and folder it builds first.

## 1.91.0 · 2026-10-19

### Added

- Select and Mask (Alt+Mod+R, the selection tools' option bar, the Properties mask button) opens as a workspace on the main canvas and falls back to the dialog where it cannot open; Select > Select and Mask Dialog opens the dialog.
- Window > Jobs, and a click on the Working indicator, list each running job with its bar, percent and its own Stop.
- Panels tear off into floating windows by dragging a tab or header out of the dock and dock back onto a gap or a tab strip; positions are kept between sessions.
- Canvas scrollbars are on by default and the overscroll past the canvas edge is a preference (0 to 100 percent of the view, default 50).
- EXIF and XMP are read from HEIF and AVIF files, and AVIF export keeps them.
- Type: Ctrl or Cmd drag on a corner of the layer box scales an existing type layer while it is edited, and Ctrl+Shift drag turns it, in one Edit Type step.
- Lights: a compass at the top left of the picture points to where the picture's own light comes from.
- Vanishing Point: connected planes hinge on the right, bottom, left or top edge.
- A curved Bevel and Emboss edge Contour is written to PSD while the gloss Contour is Linear.
- Flat saves name the merged layers, the hidden layers left out, and File Info a kind cannot hold.
- Layer Style previews are computed on a worker; Prompt Improver takes reference images; ComfyUI inputs are mirrored and re-uploaded by the engine.

### Fixed

- Levels in saved PSD and PSB follow the format (29 records and the Lvls tail), so other readers take the block.
- Select and Mask output to a New Document records one undo step and honours Decontaminate Colors.
- A PSD, PSB, TIFF or PNG written in bands from a document wider than 32,767 px renders its merged picture in strips; a stopped or failed layered export frees the engine's spools; cancelling the PSD conversion sheet frees tiles already on disk.
- Type in 16-bit, 32-bit, CMYK and Lab documents keeps its exact colour to the edge of the letters.
- Fill, Paint Bucket and Duplicate Document work on tiled layers; deleted tiled layers release their tiles; tiled documents are recovered.
- The desktop shell compiles (a borrow in the window-state flush).

## 1.90.9 · 2026-10-19

### Added

- Layers kept in tiles take strokes and band filters inside a selection, Fill, Clear, Flip Layer and Copy; duplicating such a layer shares its tiles until one is written; Preferences > Performance can keep layers in tiles from a size you choose (0 keeps today's limit).
- PSD and PSB files past 30,000 pixels a side open in bands into tiled layers (raw and RLE channels at 8 or 16 bits, names, places, opacity, blend, groups, clipping and visibility kept, with a Stop button); New Document accepts up to 300,000 pixels a side; a layered PSD or PSB of a giant document is written in parts by the engine.
- GPU display: Knockout, folders with their own opacity or blend mode, Blend Clipped Layers as Group and Transparency Shapes Layer off composite on WebGPU and WebGL2. Layer style maps can be rebuilt over the changed part of a layer only (off until enabled).
- Camera Raw Filter: a Process Version in Calibration, saved in settings and .xmp; Point Color, Calibration and Colour Grading in the GPU pass with a full-size drag preview and the exact result on release; Dock to the side, Hold for Before and Snapshots. formvis writes its own PSD blocks for smart-filter stacks and adjustment layers the format has no record for, so its files reopen editable.
- Hindi covers every interface string (machine drafts for review).
- Plug-ins: file-format plug-ins, sandboxed frame panels, a switch per plug-in in Preferences > Plugins, and single-file plug-ins honour the selection. .atn files read and write about twenty more steps. MCP resources for plug-ins and history and a template per command.
- Desktop: the packaged app's `mcp` and `agents install` arguments run its own MCP launcher and agent setup; the AppImage offers once to add itself to the applications menu; the window remembers its size, place and maximised state and follows the interface scale; on Linux a crashed web view reloads, at most twice a minute.
- The dock's Chat tab uses the in-app MCP configuration and token like Claude Code tabs.

### Changed

- Select and Mask Workspace: Esc in a side-panel field only reverts that field, ticking a box no longer disables the tool keys, Enter on a button no longer applies, and any document switch leaves the workspace.
- Browser tests follow the options bar's More panel, number fields in text mode while focused, the Export As preview row, the Open input's role and the Select and Mask brush list.

### Fixed

- Painting a duplicate of a layer kept in tiles no longer paints the original.
- `/api/mcp/status` and `/api/mcp/registration` report the engine's real port.
- .atn Median and High Pass steps keep their radius.

## 1.90.8 · 2026-10-19

### Added

- Claude Code lives in the terminal dock as in formlit: shell, Claude Code and Chat tabs, an ask bar at the dock's foot, and Claude Code and Show Terminal buttons in the title bar, with formlit's agent, chat and terminal icons. A Claude Code tab runs the program itself with formvis's tools attached, and its calls are trusted as the window's own through a per-run token kept in that tab's environment. Window > Chat with Claude opens the Chat tab, whose hand-off resumes the conversation in a Claude Code tab. A tab that cannot start says why, with the install command when the program is missing.
- Select > Select and Mask Workspace: Select and Mask on the main canvas with live view modes and opacity, Quick Selection, Refine Edge Brush, Brush, Hand and Zoom on the picture, the properties beside it and other panels hidden while it is open, applied as one step.
- Painting a layer mask from outside the layer's pixels grows the mask to the canvas, kept by undo, projects and PSD export.
- Layers take a generation role (Reference, Subject, Background, Style) with a badge, Layer > Role and a Properties control; Reference layers list as @img tokens in the Generate panel with a fit choice. Layers dropped on another document's canvas land where you let go. Properties gains Align. Generate > Compute Depth Map as 16-Bit Document.
- Smart objects keep the file they were placed from (Export Contents and the PSD writer give it back byte for byte) and cache their filter stages; PSD placed layers open with embedded layered contents and custom warp meshes as live warps, and are written back the same way.
- GPU layer styles: Drop Shadow, Outer Glow, Stroke, Inner Shadow and Inner Glow are built in WebGL2 passes when the GPU runs filters; the Layer Style preview budget follows how long the last preview took; the parametric curve runs in the GPU Develop pass and the Develop preview reaches 8 megapixels.
- 16 and 32-bit documents reach the GPU as half-float textures with mipmaps below 50 percent zoom; 32-bit documents can present in high dynamic range under WebGPU on HDR screens (Preferences > Performance); live stroke previews upload only their changed tiles.
- Composite on worker threads (Performance, off by default) for plain documents at 100 percent and above, byte-identical to the single-thread result; WebAssembly kernels for Image Size resampling, ordered Dither and the healing blend.
- PSD: Color Lookup layers open and save live; shape pattern fills and strokes and stroke caps, joins, alignment and opacity are written and read; bevel texture and a linear edge contour are written; the pattern overlay's link and origin are kept. Swatches: colour-book entries in .aco are written back as read. Export asks where to save in Chromium browsers and remembers the folder.

### Changed

- The Claude Code side panel is retired; Window > Claude Code opens the dock on a Claude Code tab. The terminal and Claude Code commands are refused to agents through run_command, run_commands and menu paths.
- `./formvis counts --check` also fails if the three-star sparkle icon returns, under any name.

### Fixed

- Properties no longer shows six empty shape fields under Transform for every layer.

## 1.90.7 · 2026-10-19

### Added

- Type: paragraphs in one type layer keep their own alignment, indents, spacing and direction, set from the Paragraph panel for the paragraph under the caret or selection; start and end alignment follow each paragraph's direction; Chinese, Japanese and Thai wrap at word boundaries.
- Type: the text can be moved while it is edited (Ctrl or Cmd drag, Ctrl+Alt+arrow keys), kept as one undo step with the edit.
- Seventeen bundled open-licensed text fonts in five categories (Sans Serif, Serif, Display, Handwriting, Monospace), loaded only when used; the font menus group them under headings.
- Fonts: an ordered fallback by script and interface language, one PostScript-name lookup for PSD type and the font menus, and fonts placed in the data folder's fonts folder listed and served by the engine for the browser build.
- Greek and Serbian (Latin script) interface languages; with no saved choice the first start follows the system's preferred languages; counted messages use each language's plural forms; the macOS app menu follows the interface language; Arabic completed and Hindi's main tables filled as drafts for review.
- Keyboard Shortcuts: Import KYS reads a shortcut set file into a new named set and lists what it could not map; the first start offers it.
- Preferences: Use Legacy Free Transform, an interpolation default for transforms, Low-Resolution Previews, a memory readout, the Linux display server (desktop), Missing Glyph Protection, font names in English (desktop), Auto interface scale, and a GPU readout with the adapter and display budget.
- Prompt templates: `use` (improve, assistant, generate) and `for` (a model or route) in front matter and a {model} placeholder; generate templates shape the prompt per route.
- Recipes: removing asks once and can be undone for the session, built-in recipes can be hidden and restored, Open folder shows the path. Crop and stitch gains a context factor and mask grow.
- API keys show when a key was refused, and language model rows show their last four characters. Preset Manager: Alt+Up and Alt+Down reorder, and Export All writes only the kinds you tick.
- GPU: Dissolve, Blend If, channel restrictions and nested clipping masks composite on the GPU; a changed layer re-uploads only its changed 256 px tiles, and idle layer textures stay resident within the GPU memory setting.
- WebAssembly SIMD pixel kernels for the Magic Wand, selection smoothing, Enhance Edge, Sky sensitivity, Levels, Curves, Exposure, Invert and Gaussian Blur, each module loaded on first use, with the TypeScript kernels as the fallback.
- View > Performance HUD: frame time, GPU pass time from timer queries, the render path and the kernel route. The brush cursor uses pointer prediction under Low-latency drawing.
- Very large TIFF exports are written by the engine strip by strip, with strips compressed in parallel; the engine can also write a flat PSD or PSB in parts.
- Releases: notes from this changelog, the .mcpb bundle, a macOS portable zip, checksums and zsync files; a lint job; the browser tests start the engine; experimental macOS universal, Windows x86 and riscv64 builds; App Paths in the MSI; a notarized and stapled DMG; ONNX Runtime providers trimmed per platform; Flatpak for aarch64; a FreeBSD port skeleton.

### Changed

- New installs keep the engine's data in the platform's application data folder; an existing ~/Formvis stays where it is.
- `./formvis agents sync --check` also fails on angle-bracket placeholders in skill markdown and on unquoted colons in skill descriptions; the skills were brought within those gates.

### Fixed

- Removing the last language model row no longer brings it back as the default.

## 1.90.6 · 2026-10-19

### Added

- Projects keep the selection, the fonts used and, within a size you set, the undo history (File > Save As with History).
- PSD: adjustment kinds formvis cannot draw are kept for re-saving; bevel contours and texture are read; Colorize, gradient shape fills and strokes and turned pattern fills are written.
- Filter layers open in the filter dialog and update live; channel eyes hide CMYK and Lab inks; gradients and paste work on alpha channels.
- Shapes: live lines, arrows and hearts, editable from Properties; Magic Wand on an alpha channel.
- Camera Raw: vignette styles and post-crop vignette, zoom and pan in the dialog, lens correction when opening RAW files.
- Skins may carry their own CSS (checked for safety), with Reset skin; background documents free memory sooner under pressure; an EXIF colour space tag option; documents can open as windows.
- Save a Copy as PNG, JPEG, WebP or TIFF; numbered Open Recent; Layers to Files as layered TIFF and DPX.
- WebAssembly plug-ins can run in bands and on alpha channels; Film Look Structure; more action steps; noise gradients from .grd files.

### Changed

- Documents with very large layers also save in the background.
- Lens Blur with depth or a shaped iris runs on the GPU when available.
- XPM colour names follow X11.

## 1.90.5 · 2026-10-19

### Added

- Smart objects can hold groups, adjustment, shape and type layers, which stay editable inside, and can nest.
- Filter layers: any filter as a live layer over everything beneath it (by command for now).
- Dehaze by depth map with a density control; depth edges snap by colour; Path Blur and Lens Blur at high bit depth.
- Photomerge can fill its transparent edges with Content-Aware Fill; Auto-Blend Seamless Tones matches tones across the overlap.
- Plug-ins: a WebAssembly interface for 16 and 32-bit, CMYK and grey data, an extra plug-ins folder, a sheen glass texture, Film Look tonal contrast, 3D scenes kept with the document.
- Export to TGA, DPX and layered TIFF from commands and the command line; .atn Invert and Unsharp Mask steps.
- Generation: Improve looks at the picture with a vision model row, size and result choices, Refine, steps and CFG presets for local models.
- Layers: drag rows onto a document tab and wait to switch to it; thumbnails framed by the canvas; tab strips overflow into a menu; dialogs can be moved and reopen where left; brush mask paint colour; tool cursor badges.

### Changed

- Smudge runs on the GPU for large brushes; undo keeps only the changed parts of large edits; giant PNG bands deflate in parallel.
- Agent and terminal connections are capped; a serve session must authenticate in time.

## 1.90.4 · 2026-10-19

### Added

- Camera Raw: drag on the picture to adjust a colour band, click to pick Point Color, Guided Upright with guide lines, a Lab scope.
- Selection: Detect Faces in Color Range Skin Tones; Skew, Distort and Perspective on a Transform Selection outline.
- Type: horizontal and vertical scale on selected letters; edit a character style's settings and see where a layer differs.
- Shapes and paths: a magnetic Freeform Pen, dragging several paths together, pattern fill and stroke, path operations for new shapes, managing custom shapes, Stroke Path with the Mixer Brush.
- Adaptive Wide Angle: Perspective, Full Spherical and Auto, horizontal and vertical constraints, local straightening, and use on smart objects. Vanishing Point: focal length and depth.
- PSD: 16 and 32-bit files open at their depth; gradient shape strokes and artboard presets and guides are read.
- Preferences: Large Tabs, Narrow Options Bar, brush hardness by drag, pixel-grid snapping, transform readout, rollover highlight, flick panning, channels in colour, colour slider gradients, canvas border, favourite themes, export clipboard, layered TIFF prompt, type sizes in points, swatch names.

### Changed

- Distort, Perspective Warp and mesh Warp resample with bicubic.

### Fixed

- Empty pixel layers are no longer dropped when saving PSD or PSB.

## 1.90.3 · 2026-10-19

### Changed

- The expanded tool rail lists every tool of every group and scrolls; the colour swatches, Quick Mask and Screen Mode stay pinned at the bottom, with Quick Mask and Screen Mode side by side.
- The top of the window is one row: on the macOS app it is the window's title bar, with the document name, "formvis 2026" in the middle and the tools on the right. The document tabs sit above the options bar, with the formvis icon at their left.
- Saving runs in the background: you can keep editing while a document saves (Preferences > File Handling).

### Added

- Adjustment layers can be limited by brightness, depth or a colour range, with a view of the limit.
- Gradient fill layers get a stop editor and offsets; depth maps get a Detail correction.
- Blur Gallery: roundness and blur per iris, and the blurs at high bit depth; more tree kinds; negative Dehaze adds haze.
- Layers: smart filter rows under a smart object, copying layers to another document by dragging onto its tab or with a command.
- Channels: Layer Mask and Quick Mask rows. Properties: shape and artboard actions.
- Menus by keyboard with Alt; snapping for lasso, gradient, ruler and slices; Gradient Editor smoothness, rename and delete; a grid unit; Grid Settings in the View menu.

### Fixed

- A command-line or agent request that was given up no longer runs later in the window.

## 1.90.2 · 2026-10-19

### Added

- PSD saving: multichannel documents, live smart filters, more layer style settings and instances, layer styles on groups, the Quick Mask channel, scaled pattern fills.
- Export: CMYK JPEG and TIFF from Export As with a press profile; BMP and TGA from Layers and Artboards to Files, straight into a chosen folder in the browser; notes on what each format loses.
- Files: palette PNG for Indexed Color documents, OpenRaster locks and adjustment layers, swatch colour values kept exactly, a Package dialog with PSD and PSB.
- Canvas Size fills the new border by stretched edge, average colour, grey or noise, and can select it; a Perspective Crop command; copying a single channel.
- Preferences: fit and smart objects when placing, follow the system's light or dark appearance.
- Free Transform and Rotate on alpha channels and Quick Mask; Transform by numbers; Lasso Freeze and Thaw in Liquify with a larger preview.
- Preset Manager: Layer Styles and Tool Presets, reorder patterns and shapes.

### Changed

- Saving can be stopped before anything is written.
- Interface text size now also applies to dialogs and the terminal that had fixed sizes.
- A plugin can no longer load code from a URL in the built app.

### Fixed

- Converting from a .fvd project on the command line.

## 1.90.1 · 2026-10-19

### Added

- Transform: Match Edges to Layer Below; shape layers keep their outlines under Distort, Skew, Perspective and Warp, and vector masks follow a warp.
- Vanishing Point: several planes, with connected planes at an angle. Auto-Align Layers: registration by intensity for low-detail pictures.
- Shapes and paths: path thumbnails, Stroke Path with Smudge, align and distribute paths, live polygon, star and triangle settings, gradient strokes; scaling a shape redraws its outline.
- Files: PSD channel restrictions, Blend Clipped Layers and Transparency Shapes read and written, gradient and pattern shapes as fill layers; BigTIFF resolution and profile; SVG clip paths, masks, filters and patterns kept as pixel layers; KRA transparency masks; more ORA modes; FITS and DPX header fields; deep EXR flattened.
- Merge to HDR in 32, 16 or 8 bit with three toning methods; Record Measurements per feature.
- Performance: frame pacing, cache tile size, worker threads, Purge Video Cache, save progress per layer; Grain and Liquify on the GPU.
- Type: angle and language fields, underline, strike and caps on selected letters, Character and Paragraph buttons on the Type bar.
- More Arabic and Hindi labels (drafts for review).

## 1.90.0 · 2026-10-19

### Added

- Selection: Transform Selection by numbers and by its corners, Focus Area and Color Range with settings, out-of-gamut and localized Color Range, the Refine Edge brush applied to the document.
- Brushes: nine procedural tips, wheel rotation, texture depth and each-tip texture, transfer settings, ABR brushes in their own group, a live stroke preview, number keys for opacity.
- Colour: Fill in every blend mode and Content-Aware from Fill, gradient smoothness and live preview, the printable colour from the gamut warning, a colour page in Swatches, four colour samplers in Info.
- Retouch: Remove fills in the background; Content-Aware Move adapts colour and rotation.
- Camera Raw: white balance in Kelvin, the camera's own look, DNG lens shading maps, Lens Correction angle and scale, Glow warmth and diffusion.
- Files: PSD colour modes, masks and linked files with a report, palette headers, JPEG guides and cut-off JPEGs, more PDN modes, ORA isolated groups, SVG shapes as shape layers, named EXR parts.
- Effects: a contour editor, blend clipped layers as a group, transparency shapes layers, style presets in the document, deep-colour filters, larger slider ranges.
- View: ruler origin, grid opacity, snap to the selection, how long notices stay.

## 1.89.9 · 2026-10-19

### Changed

- Folder plugins run in their own sealed worker: no access to the window, the network or storage, only the permitted plugin API. Plugin document calls now return promises.
- The desktop app checks for updates from the page at start (still off until a signing key is set).

### Added

- Preferences: Camera Raw colour space and Sharpen For, panels that show at the window edges while hidden, Interface Scale, larger interface text everywhere, freeing memory of background documents, update settings, the settings folder and its override.
- Keys and presets: your own language model services with vision on or off, keys a service refuses are flagged, template and recipe folders, brush sets saved and loaded, reordering presets.
- Agents: open as a layer or replace, reference layers, distort and warp by numbers, export to TIFF, TGA, DPX, BMP, EXR and HDR or back to the opened file, CMYK documents, menu paths, quit with confirmation, idle sessions end, a folders list in Agent Connect.
- Command line: a headless window, action files in batches, serve tokens, more JSON-lines methods.
- Automate: an Actions panel, Photomerge as masked layers, output folders for Image Processor and batches, TGA and DPX output, Contact Sheet font files, Define Variables align and clip, saving a ComfyUI graph as a recipe.
- Files: PSD type style runs, EXIF in PSD, TIFF and PNG, alpha channels in layered TIFF, PSD and TIFF from Batch, Image Asset variants.
- Assistant: Auto, Ask or Refuse per tool; free sizes in the Generate panel.

## 1.89.8 · 2026-10-19

### Fixed

- The engine could delete /dev/null when run as root on Linux (a library lookup fell back to a linker call that removes its output file on failure). Library names now go straight to the loader, and that fallback is off for the engine process.

### Added

- Layers: fx and fill buttons in the panel footer, folders stay collapsed after saving, vector mask thumbnails, a bit depth tag, four more layer blend modes, an artboard lock, a multiband Auto-Blend, frames that take the layer under them, Reload Frame for video.
- Masks and channels: brushes, erasers and fills work on a targeted alpha channel; Color Range by luminosity.
- Fill layers and smart objects: edit a Gradient Fill layer on the canvas; a Live Content section in Properties; Liquify on smart objects as an editable smart filter.
- Alignment: Spherical and Collage in Auto-Align; Adaptive Wide Angle focal length.
- Paths and shapes: Pen convert and move, a Pixels mode, Curvature and Freeform Pen improvements, an even-odd fill rule, custom dashes and stroke opacity, the clipping path written to PSD.
- Type: size, colour, font, weight, shift, tracking and language for selected letters; a type angle; fallback fonts per script; a face picker that previews on hover; South Asian options and paragraph text direction.
- Adjustments: Normalise; text blend gamma applied; Multichannel from Lab; HDR ghost removal.

## 1.89.7 · 2026-10-19

### Added

- View: hold Backslash to peek at the opening state; a split view comparing a snapshot with the current state; a composite pixel reading; exact pointer mapping under interface zoom.
- Layer effects: effect rows under each layer to hide, delete, edit, move and copy effects; Gradient Overlay method and smoothness; style presets in the Layer Style dialog.
- Filters: on-canvas pins for the Blur Gallery and handles for Lighting Effects; Tonal Contrast; vignette colour and highlight protection; Dehaze sky protection; Flame, Picture Frame and Tree on a new layer; gloss for relighting.
- Files: PSD smart filters open as editable filters where they map, and more type and effect settings come through; compressed and 16-bit layers in the .kra family; .svgz; FITS extensions, DPX orientation, TIFF sub-pages and XPM colour names.
- Speed: the layers below the one being painted are kept as one picture while painting; saves lock the document; GPU timing where available.
- Desktop packaging: manual draft releases for more platforms, an MSIX manifest, a Linux library check and a graphics memory readout.

### Removed

- Leftover translations for the declined scaling feature and its skin protection.

### Fixed

- The Gradient Editor no longer throws when applied with no colour stops.

## 1.89.6 · 2026-10-19

### Added

- Look and notices: eleven more themes in Window > Theme; notices with actions, a close button and a history; a busy line on the working tab; tool variants and on or off states in the command palette.
- Windows and panels: four more arrangements for any number of documents; panels float, dock, move between groups and come to the front by command; double-click a group header to fold it; Window > Options.
- Guides: select, edit, colour, delete and lock guides from a context menu; Guide Layout column widths, centring, units, colour and artboard targets; guides from a shape's centre; Snap To Slices; artboard guides and the target path shown or hidden.
- View: Flip Horizontal for the view only; zoom up to 12,800%; auto-scroll at the edges for every drag tool; flick panning; zoom to a dragged rectangle; optional canvas scrollbars; a no-tool mode; canvas status pills; canvas context menus; interface zoom.
- Fields and dialogs: arithmetic in number fields; Tab between fields; undo inside dialogs; Alt turns Cancel into Reset; label scrubbing and pop-up sliders; keyboard menu navigation; Show Extras Options.
- Type and languages: OpenType features on selected characters with a Type > OpenType menu; Commit and Cancel on the Type bar; Arabic and Hindi (drafts awaiting native review) and a right-to-left layout.
- Tools: the current tool and view switches remembered; pen pressure on every painting tool; Build-up; more Shape Dynamics; Expand and Contract in the selection bars; Select Subject on Object Selection; tool presets with colours.
- Transform and files: Free Transform reference point, skew and interpolation; Artboard orientation and new artboards; note authors and colours; Save a Copy keeps the document's path; a ComfyUI panel; on the desktop, menus in the window on macOS and a custom title bar on Windows and Linux.

## 1.89.5 · 2026-10-19

### Added

- Plugins: plugin folders with a manifest, permissions approved on enable, and an API for documents, pixels, filters (CPU and GLSL), panels, tools, generate sources, events, storage and dialogs, with a sample plugin; WebAssembly filter plug-ins in a sandboxed worker with time and memory limits, generated dialogs, smart filter use and a Rust example.
- Packs: EU AI label badge and metadata on export; Film Look layers with ten stocks and curve points; Chromatic Shift; more Glass textures; GLB objects placed as layers.
- Agents: 29 more MCP tools (134 in all), including presets, compare, depth from a layer, a status note, window screenshots, menus, dialogs, pointer and pen input, keys and window control; file roots that confine agents; output budgets; progress and cancel for Render Video.
- Actions and scripts: nested actions, Button Mode with colours, function-key shortcuts, sets, menu item steps, action file import and export, Script Events with scripts and a log, and running a JavaScript file from File > Scripts > Browse.
- Automate and command line: droplet data files, Contact Sheet mode and depth, parameters for Fit Image, stacks, Photomerge and HDR, offline stack, contact, fit, Photomerge and HDR commands, and ComfyUI recipe Edit and Update.
- Retouching: Content-Aware Move Sample All Layers and Transform On Drop; Remove falls back to the patch fill when its model is missing; Clone Source commands; Content-Aware Fill Sample All Layers and a sampling brush.
- Raw: 16-bit ProPhoto RGB develop; skip the raw dialog; clipping view on Alt-drag; Point Color picking; mixer targeted adjustment; Upright Level, Vertical, Auto and Full.

## 1.89.4 · 2026-10-19

### Added

- Brush Settings: Dual Brush with its own tip settings and Multiply or Subtract; Brush Pose; a lock on each section; Protect Texture; a drawn pen pressure curve; New Brush Preset; Color Dynamics purity, per tip and by pressure or fade; Transfer by pressure, fade, tilt or rotation; angle, roundness and scatter controls.
- Brush tool: every blend mode in Brush and Pencil; the pen's eraser end switches to the Eraser; on-canvas resize also sets hardness; a brush picker on right-click; thirteen more built-in brushes in groups; preset folders, moving, renaming; set-brush and get-brush commands.
- Colour: Background Eraser background swatch sampling and Find Edges; the Color Picker's nine axes, Lab fields, screen picking and Add to Swatches; gradient stops and midpoints on the canvas; swatch names, groups and order; new gradients and patterns with names and groups.
- Adjustments: every adjustment, Invert and Equalize on a targeted alpha channel; Levels histogram handles; scrubbable labels; Curves targeted adjustment; adjustment dialogs leave Hand and Zoom working; Replace Color localized clusters; Match Color from another document or layer; Equalize the selection; Histogram cache levels and statistics; Merge to HDR Pro align and exposure times.
- Modes and colour: a Convert Mode dialog with profile, intent and black point compensation; ask on paste and on mode change; a monitor profile for the canvas; TIFF and PSD profile prompts; 32-bit highlight compression.
- Files: PSD colour labels, alpha and spot channels, gradient map stops, shapes kept after a transform; adjustment layers in PSD now keep their real values; save steps in actions; a TIFF Options prompt; Image Assets from groups; image sequence video; data set name templates; Package with a Links folder; Save for Web Perceptual and Selective palettes, Web Snap, a colour table, Optimized JPEG, Convert to sRGB; swatch names in .aco and .ase.

## 1.89.3 · 2026-10-19

### Added

- Document and canvas: more Image Size methods (Bicubic Smoother and Sharper, Lanczos) and the selection follows a resize; Canvas Size keeps proportions and estimates memory; the Crop tool gets Classic mode, drag-rotate, a fill for opened edges, a custom ratio and a snap grid; tab menu, pinned tabs and Close Tabs to the Right; File > Exit; New Document presets and colours; EXIF and XMP kept through export; File Info fields; slice options; a status bar readout.
- Preferences: every page reachable from Edit > Preferences, and many settings now act (interpolation, beep when done, canvas colour, cursors, checker colours, guide and grid styles, slice colours, tool tips, Shift tool switch, recent file count, enhanced controls, type options, scratch disks).
- Shortcuts and menus: alternate shortcuts, saved sets, export and import; Edit > Menus to hide and colour items; preset bundles; animation and pressure switches.
- Settings: DirectML for helper models, a model folder scan, a download token, local file cleanup, user theme files with the 90s and Duck themes, About details.
- Generation: stop Fill, Expand and Upscale; seeds and negative prompts in Generative Fill; Upscale in place or for the selection; ComfyUI recipe readiness, a probe report and a progress bar; a quick sky selection without a model; Object Selection edge offset.

## 1.89.2 · 2026-10-19

### Added

- Layers: pick a layer under the pointer with Ctrl+Alt+Cmd-click from any tool, a layer picker on right-click, toggle layers with Cmd/Ctrl+Shift-click, folder locks apply to their contents, Copy Layers and Paste Layers, drag several layers to another document; Alt-drag copies with Move, two digits set an exact opacity; Photomerge from open documents with Perspective, Cylindrical and Collage layouts, Auto-Align with a reference layer and lens correction, Auto-Blend halo control; layer comp options, duplicate, last document state and warnings; Show Altered Video.
- Channels, smart objects and masks: paint, fill and filter a single colour channel; Split and Merge Channels; spot channels; Warp, Puppet Warp and Perspective Warp on smart objects stay editable; Convert for Smart Filters; Reveal embedded sources; mask Invert and Select and Mask in Properties; vector mask density and feather; blur and noise adjustment layers.
- Styles and filters: shadow and glow spread, noise and knockout; satin contour; more gradient overlay styles; pattern angle and phase; Blend Interior Effects as Group and Layer Mask Hides Effects; copy and move single effects; Image Size scales styles; Lens Blur with blade shapes and a depth map; drawn Path Blur and several irises and spins; Lens Correction batch; dither kernels and halftone screens; Displace from a layer; a Shear curve; a zoomable filter preview; grain Look strength; three lights in Lighting Effects.

### Fixed

- The Move bar shows the transform fields only during a transform, so the align buttons fit again.

## 1.89.1 · 2026-10-19

### Added

- Import: PSD extra channels, patterns, profile, labels and mask density; a conversion report; TGA alpha as a channel; JPEG quality kept for re-save; 10-bit HEIF; deep PNG, TIFF and float files placed at depth; an EXR parts chooser with Cryptomatte mattes; PFM; Shift-drop to the Reference panel, drops on the tab strip, a drop into Free Transform; Place Embedded fits the canvas; a brush tip from a picture; File > Import Folder; stacks from a folder with Auto-Align; video frames from pictures or a GIF; ComfyUI editor workflows convert for your own ComfyUI.
- Automation: 26 more MCP tools (105 in all), MCP resources, transport limits; `./formvis cli` info, convert, jobs and serve; attach mode for the stdio bridge; an .mcpb bundle and a Claude Code plugin manifest; plugin shortcuts, Reload Plugins and Open Plugins Folder; conditional action steps; droplet options; Contact Sheet units and order.
- Analysis and help: measurement scale presets, a ruler protractor, the scale marker dialog, Color Sampler sizes, Count groups, Enter and Escape as commands, Help > Report an Issue with diagnostics.
- Performance: Cancel for long filters in the status bar, a memory limit, an effect cache budget, cache levels, refusing implausible image sizes before decoding, `./formvis perf` and `./formvis corpus`; frame tracing, a tile grid overlay and GPU power preferences; Linux desktop files, Flatpak, Homebrew, Docker and web hosting files (not yet built here).

## 1.89.0 · 2026-10-19

### Added

- Adjustments and modes: a Gradient Map stop editor and dither; Curves pencil, smooth and eyedroppers; sample sizes; saved presets per adjustment; Shadows and Highlights clipping; an HDR Toning curve; Match Color controls; tetrahedral Color Lookup; Bitmap halftone screens and dither methods; Indexed palettes, forced colours, transparency and dither amount; Grayscale From Channels.
- Colour management: ProPhoto, ACEScg, Rec. 2020 and more built-in profiles; Legacy Macintosh RGB and Internet Standard RGB proofs; a gamut warning threshold and a proof badge in the status bar; Edit > Profile Info; Cancel on profile prompts; sRGB tags on exports; EXR as ACEScg; .3dl LUTs.
- Transform: Free Transform waits for Apply or Cancel with numeric entry, handle resizes snap, and the Transform commands work on paths; Warp presets on pixel layers and split commands; Puppet Warp mode, density, expansion, pin rotation and depth with a mesh; Perspective Warp auto straighten; Liquify Smooth, density, rate and mesh size; Layer > New > Shape Layer, gradient shape fills, stroke caps and joins, corner radius handles on the canvas, Make Selection from Path options.
- Export: a live preview and real size in Export As; Layer > Export As; PNG interlace, EXR compression, half float and channels, PFM, TIFF compression and BigTIFF, WebP lossless, grey and progressive JPEG, grey and CMYK PDF; PSD guides, notes and ICC profile, and PSB for very large documents; safer saves; Save for Web colour reduction, dither, presets and HTML; a print preview with marks; slice styles, Divide and Lock Slices; Camera Raw settings as .xmp.

### Fixed

- A saved shape's dash and stroke alignment are kept on load; Save for Web's GIF colour count and dither now apply.

## 1.88.9 · 2026-10-19

### Added

- Selections: Subject and Sky take the selection mode and Sample All Layers, and Sky has sensitivity and softness; Color Range adds hue families, skin tones, a depth range and combine modes; Convert to Shape and Selection to Work Path take a tolerance; Quick Selection Enhance Edge and a footprint trail; the marquee snaps to guides; Focus Area modes; Magnetic Lasso straight segments; the selection can show as a tint; Ctrl-drag moves selected pixels from any selection, paint or retouch tool (Ctrl+Alt copies) and Ctrl+arrows nudge them; Quick Mask works with the Paint Bucket; Select and Mask Show Edge and Smart Radius.
- History and safety: snapshots of merged layers or the current layer, a bound of 100 snapshots, Undo takes back a pending Pen point, File > Earlier States... reopens earlier sessions and crash sets, a lost GPU restarts then falls back, and quitting waits for the recovery copies.
- Retouch: Smudge Length and Sample; Dodge, Burn and Sponge Sample; a Color Replacement tool; Remove sampling and a LaMa result on a new layer with the local model; Content-Aware Move Structure and Color, applied when the drag ends; a Patch source preview; clone source offsets and a separate height.
- Camera Raw and Develop: raw files are recognised by content with their camera details; the open-time dialog develops exposure, highlight recovery, noise, shadows, highlights, clarity, texture and dehaze at the raw stage; Lens Correction fixes colour fringes, vignetting and perspective; Develop has eight colour bands with swatches, an Effects vignette shape, Sharpening Radius, Detail and Masking, Noise Reduction, Auto white balance with an eyedropper, a grading wheel, Remove Chromatic Aberration and a histogram readout.
- Type: weight, baseline shift, scale, underline and strikethrough; optical kerning; all caps and small caps; any OpenType feature and variable font axes; paragraph indents, spacing and last-line justification; Save and Load Default Type Styles and more style commands; Layer > New > Type Layer; Lorem Ipsum at the caret; type masks follow the selection mode; Ctrl-drag while typing and paragraph box handles; Language Options; type on a path Flip and Release; Create Work Path and Convert to Shape from the real glyph outlines; the Glyphs panel shows the font's own characters; a list_fonts agent tool (79 tools).

### Fixed

- Colour Grading's midtones had no effect; Develop's Tone and Detail sliders showed 0 after recalling settings.

## 1.88.8 · 2026-10-19

### Added

- Brushes and fills: pen pressure drives Liquify and Smudge strength; brush names come in from .abr files; the brush cursor follows a sampled tip's shape and angle; pattern scale and angle in Fill and the Paint Bucket; Edit > Fill with the foreground or background keeping transparency; the Eyedropper can sample without adjustment layers; the symmetry axis moves; brush tips flip; texture brightness and contrast; Always use pressure; Magic Eraser opacity and anti-alias.
- Workspace: a progress bar with step counts in the status bar; Help > Console shows the engine log with filters; a ComfyUI status dot for your own server; the DVCPRO HD 1080 pixel aspect; View > Show > Smart Guides; guides with units and colours; column and row sizes in New Guide Layout.
- Agents: twelve more MCP tools (78 in all) for layout boxes, sampling a box's colour, frequency separation, sampling and editing the depth map, cropping, and exporting a mask or the selection as PNG.

## 1.88.7 · 2026-10-19

### Added

- Settings: View > Theme lists every theme; `?no-skin` (or `--no-skin` on the desktop) starts on the default theme without losing the saved one; the assistant's chats kept and tool calls a turn are settings, with Delete all chats; prompt templates import and export as Markdown; Preferences > Plugins has a ComfyUI sign-in (basic, bearer or a custom header), a models folder and a grouped recipes list with Remove.
- Masks and depth: Apply Image takes the selection or a layer mask as its source and can preserve transparency; each smart filter has its own blend mode and opacity; Generate > Depth Map adds From Layer, Recompute, Show, Flatten, Nearer, Farther, Smooth and Snap to Edges.
- Filters and styles: Inner Shadow choke and noise; Inner Glow technique, source, choke and noise; gradient strokes; film-stock grain presets with colour grain and speckle; vignette feather and roundness; a dark-channel Dehaze; relight colour temperature presets; filter choices preview on hover.

### Changed

- Switching themes no longer rebuilds the title bar icon or the brush tiles.

### Fixed

- With a ComfyUI sign-in set, a redirect to another server is refused instead of sending it the credentials.

## 1.88.6 · 2026-10-19

### Added

- Agents: six more MCP tools (66 in all): ping, close_document, list_plugins, select_feather, select_grow and select_point; get_image can show the editor view, one layer or a 1:1 box, as PNG or JPEG; new_document takes an aspect and a size class. Feather, Expand and Contract take an amount from commands. Agent Connect copies the Claude Code line and the Claude Desktop setup.
- Generate: a negative prompt for local models; seed controls (random, fixed, reuse last); the prompt fields have their own undo; Escape or a click on the status bar stops a run; Edit > Purge > Free Helper Models; Generate > Compute Depth Map.
- Layers: New Layer takes a colour label and a mode-neutral fill; Duplicate Layer can go to another open document or a new one; the Layers panel filters by name, mode, attribute and colour; the Frame tool draws from the centre with Alt; Shift+Plus and Minus step the Brush mode.

## 1.88.5 · 2026-10-19

### Added

- Import: File > Open takes several files at once and opens each as its own document; brush, swatch, gradient, pattern and shape preset files open from Open or a drop into their libraries; PCX and XPM open; an SVG asks for its width; a multi-frame GIF or animated PNG says only the first frame was used; Ctrl-drop opens pictures as documents.
- Document and canvas: Clear on the Background fills with the background colour; pastes land in view, Paste in Place keeps the place; File > New from Clipboard; Layer > New > Dodge and Burn Layer; Trim by side; Canvas Size Relative and any extension colour; Image Size without resampling; Image > Crop commits the crop frame; crop ratios 5:4 and 4:5, X turns the ratio, overlay show modes, Show Cropped Area (H) and the shield colour and opacity; Fit Image and Arbitrary rotation take a resample method; artboard size presets, custom colours and Artboard from Layers... with options.
- The rest: confirmations for destructive actions start on Cancel and arrow keys move between buttons; Purge > Histories clears every open document; an update dialog with notes, Later and Skip this version; Help > System Info and Copy Engine Log; the engine writes a rotating log file and one engine runs per data folder on the desktop; `--user-data-dir`, `--portable`, `--port` and `--no-comfy` switches; Shift+arrows step number fields by 10; Notes previous and next; Measurement Log selection; tool preset rename; Full Resolution Previews.

## 1.88.4 · 2026-10-19

### Added

- Adjustments: Curves shows the histogram and has Reset (Shift resets every channel); the panel has Preview and Reset, and double-clicking a slider label resets it; Gradient Map presets with several stops; Photo Filter offers 20 named filters.
- Transform and shapes: Align and Distribute to the selection or the canvas; Flip mirrors selected layers about their combined centre and includes folders; triangles, polygons and stars take a corner radius, and Smooth corners rounds with continuous curvature; Liquify strokes undo one at a time, follow pen pressure, and Alt reverses every tool.
- Export: PSD files keep vector masks on any layer, always carry layer ids, and include a thumbnail and composite unless Maximize Compatibility is off (Export Preferences); Export As has a file name, a canvas anchor with a coloured margin and a transparency matte; the prompt and recipe can be written into PNG files; File > Export > Quick Export and Export Preferences; Layer > Quick Export as PNG.

## 1.88.3 · 2026-10-19

### Added

- Boxes for region prompting: a Boxes tool (Generate > Boxes Tool) draws boxes of six kinds (New, Keep, Move, Remove, From reference, Text) with a description each, typed on the canvas; arrows nudge, Ctrl+D duplicates, Tab cycles, Delete removes; Box from Selection, Copy Boxes and Clear Boxes; warnings for an empty or tiny box and a crop preview; boxes follow canvas size, rotation and crop, save with the project, and go with the prompt as one plain line each.
- Crop and stitch in the Generative dialog: the selection is cropped with padding, scaled to a target size (the highres fix), filled and feathered back in, with shipped and saved recipes.
- Reference chips: chosen reference layers show as `@img1`, `@img2` chips that can be dragged or reordered from a menu; the prompt's tokens follow the order, and the ComfyUI route resolves them.
- Generate > New Canvas from Model Preset... opens a canvas at one of a model's sizes.
- Assistant: exclude tools, wait while you drag or type, saved chats (New chat, Chats), token counts per chat, a notice of where the words go and whether pictures go, a notice when another agent is connected, pictures of the document on a budget (off by default), and the window asks for attention when the assistant waits on you.

### Changed

- One cloud provider by design: fal. Other image or model providers are declined, as Content-Aware Scale was, and `./formvis counts --check` fails on code that adds one. Named hosted models wait for the owner's own fal integration.

## 1.88.2 · 2026-10-19

### Added

- Selection and history: Edit > Purge > Undo; Edit > Fill > From History (Alt+Mod+Backspace); clicking the selected object again with Object Selection deselects it; selection cursors show add, subtract or intersect; in the Lasso, release the mouse with Alt held to click straight segments; the History Brush paints from the history state marked in the History panel; Feather Selection... in the selection tools' bars.
- Retouch: the Healing Brush follows the Clone Source scale, angle and flips; Alt swaps Dodge and Burn; the Blur tool has a Radius; point curve presets and double-click to remove a point; the Pattern Stamp has Aligned, Scale and Angle; scopes show shadow and highlight clipping; the clone overlay can be inverted.
- Type: Type > Orientation (horizontal or vertical); Paste Lorem Ipsum makes a new paragraph layer when none is active; Replace All Missing Fonts; Find and Replace Text has Find Previous, Find Next, Change and Change/Find; Alt+arrows change tracking and leading while typing.

## 1.88.1 · 2026-10-19

### Added

- Brush: type two digits quickly for an exact opacity (4 then 5 is 45%), Shift+digits set Flow; Shift while dragging snaps to 45 degrees; Caps Lock shows the precise crosshair; Smoothing has Pulled string, Catch-up on stroke end and Adjust for zoom (also on the Pencil); the cursor follows the tip's roundness and angle and briefly shows the hardness; the options bar reaches roundness, spacing, jitter, scatter, count, noise and wet edges; Window > Brush Size commands. Mixer Brush has Flow; the Pencil has Mode.
- Layer Style: a blend mode for every effect; Blending Options set the layer's mode, opacity and fill; sizes up to 500 px; Cove - Shallow and Sawtooth 2 contours; Layer > Rasterize > Layer Style for one layer; Layer > Layer Style > Hide Effects for one layer; rename styles in the Styles panel.
- Filters: Tilt-Shift centre position, Iris Blur roundness, Gaussian Blur and Unsharp Mask radius up to 1,000.
- Layers: clicking an eye on one of several selected layers shows or hides them all; Layer > Show All Layers and the Layers menu's Hide, Show Only and Show All; layer comps say when layers they recorded were deleted.

### Fixed

- The Brush follows Preferences > Cursors (it drew its own ring before).

## 1.88.0 · 2026-10-19

### Added

- Masks: Alt-click a mask thumbnail to see the mask alone, Shift+Alt-click for a red overlay; Mod-click a mask or layer thumbnail to load it as a selection (Shift adds, Alt subtracts, both intersect); Density and Feather for layer masks in Properties; Reveal All and Hide All reset an existing mask; Alt-click the mask button to hide the selection. Smart filters move up and down. Mod+2 and Mod+3 onward pick the composite and channels.
- Navigation: type a zoom into the status bar or Navigator; Alt+wheel zooms; Ctrl+Space or Ctrl with the middle button drags to zoom; Shift+Tab hides the dock; F11 and Full Screen Mode use the system's full screen; Window > Arrange > Tile and Cascade; View > Snap and Snap To (guides, grid, layers, document bounds); drag tabs to reorder; step the interface darker or lighter; F6 opens Color; Reload Window; the browser title names the document.
- Actions play from a chosen step; agents can list actions, see each document's size and unsaved state, and close a document by id. Batch names files from a template ({name}, {serial}, {date}). Data sets can be created and their values edited.

## 1.87.9 · 2026-10-19

### Added

- View > Extras switches the canvas helpers together; View > Show > Selection Edges, Layer Edges, Notes, Count, All and None; View > Print Size.
- Edit > History Log (Preferences > History Log) records each step with its document, with Save and Clear.
- Camera Raw defaults for resolution, Apply Auto Tone and Open as a Smart Object.
- Edit > Reset Tool and Reset All Tools; Help > Simulate GPU Loss, GitHub and Report an Issue.
- Generate Image keeps its last 12 results to add again (Shift-click restores the prompt), a Run log of every call, and @img1, @img2 in prompts name a workflow's references.

## 1.87.8 · 2026-10-19

### Added

- Workspaces: a Pixel Art workspace, Window > Workspace > New Workspace and Delete Workspace for your own arrangements.
- Window > Next Document and Previous Document (Mod+Tab and Shift+Mod+Tab where the system allows); Theme follows the system's light or dark setting; View > Pasteboard colour; a right-to-left interface; hold a tool's key to use it for a moment and return to the previous tool on release.
- Preferences: the interface starts in the system's language; Interface Text Size; Pen Pressure Curve for every brush; recent fonts listed first; Camera Raw defaults for white balance and bit depth.
- Actions: switch single steps off, move steps and actions up and down, rename actions; Batch and Image Processor take a whole folder, with or without its sub-folders.
- Agents: four new tools (select from transparency or a mask, list and change settings with your permission, and inspect the window's controls).

## 1.87.7 · 2026-10-19

### Added

- File > Open As (choose the format for a file with an odd name), File > Import > Notes (from a PSD or a text file), and WBMP, DDS, Cineon (16-bit) and .psdt files open; PSD guides and notes come in with the document.
- File > Reopen Closed Tab (Shift+Mod+T in the desktop app, Alt+Shift+Mod+T in a browser); Edit > Purge > Working Files; Frequency Separation asks for its radius and is also in the Image menu; the Properties panel has a Document section; File Info has Custom Fields saved with the project.

### Changed

- Arrow-key nudges in quick succession are one history step.

### Fixed

- The Relight depth model works from the app: Local models (and Relight's own note) install the Relight runtime, the Python packages MoGe-2 needs, in an environment of its own, after the model's 141 MB download.

## 1.87.6 · 2026-10-19

### Added

- View > Proof Setup > Monitor RGB; View > 32-bit Preview Options (exposure and gamma for the view of a 32-bit document); Edit > Pick Colour from Screen (where the system offers it); a JPEG with no profile but marked sRGB in its camera data opens as sRGB without asking.
- Filters: Pixelate > Dither (ordered patterns and ASCII, black and white or colour), Video > Scanlines, Other > Color to Alpha, Noise > Grain Plate, Render > Haze by Depth.
- Export As writes BMP (with alpha, or 24-bit on white), FITS and WBMP; PNG has a compression level and JPEG a chroma subsampling choice; Save for Web has WBMP and an image size; File > Export > Selection as Mask PNG.
- Layer Style: Make Default and Reset to Default, and Channels (R, G, B) to limit which channels a layer blends into.

### Changed

- Content-Aware Scale and its skin-tone protection stay removed for patent reasons: `./formvis counts --check` now fails if product code brings them back, and the project's agent rules decline any request for them.

## 1.87.5 · 2026-10-19

### Removed

- Image > Content-Aware Scale and its seam-carving engine route (/api/seam). Use Image > Generative Expand to widen a picture; a warp-based Content-Aware Scale will replace it.

### Added

- Develop: a Parametric Curve (Shadows, Darks, Lights, Highlights and three splits), Defringe under Optics, Point Color, and every section folds and has its own Reset.
- Layer > Frequency Separation splits a layer into a blurred Low Frequency layer and a High Frequency layer in Linear Light, in one step.
- Transform a Copy (Alt+Mod+T); Layer > Shape > Copy and Paste Shape Style; Paths > Clipping Path (saved with the project); a click with a Shape tool asks for the shape's size; the Move tool's Warp grid size (3 to 6); Enter with the Pen in Shape mode makes the shape layer; Alt-click a segment with Direct Selection selects its whole subpath; Shift locks the axis while dragging a distort corner; the shape style dialog keeps dashed strokes and their alignment.
- Type: Crisp, Strong, Windows and Windows LCD anti-aliasing; Hyphenate; a Language per type layer; Type > Add Font Files and Add Web Font (for this session); Type > Load Default Type Styles; Font Preview Size Huge; Mod+Shift+. and , change the type size by 2 (with Alt, by 10).
- Painting symmetry for the Brush, Pencil and Eraser: Vertical, Horizontal, Both axes or Radial (3, 4, 6 or 8) about the document's centre; a Pressure curve (Linear, Soft, Firm, S curve) for pen pressure; Alt-click with the Brush picks the foreground colour.
- Animated GIF and WebP files open as one layer per frame with a frame animation in the Timeline, keeping each frame's delay and the loop count, so Export GIF writes them back animated.
- Preferences > Plugins > Local models has cards for the sky model and the Relight depth model, a Remove button on every simple model, and a Download source setting (upstream, a mirror or a custom address). Select > Sky offers to download its model; Relight says once when it falls back to a simpler depth and offers the model.
- File Info lists the settings each generated picture was made with (prompt, seed, steps, LoRAs), kept on its layer and saved in the project.

### Changed

- NOTICE.md lists every crate, Python package and native library the app ships, with the required credits and where the LGPL sources are; the licence texts are in a new licenses/ folder that every installer carries.
- File > Export > Paths to AI File (was named after another product); messages, notes and comments throughout name file formats rather than other products.

### Fixed

- Desktop app: GIF, MP4, WebM, PNG sequences, OpenRaster, PSB, HDR, EXR, paths, every zip (Package, Image Assets, Artboards, Batch, Data Sets, Save for Web slices), LUTs, presets, actions, Measurement CSV and droplets are written again (they stopped with "Invalid export file name."); a failed Image Assets write on save is reported.
- Color Settings' CMYK and Gray policies (Preserve, Convert, Off, and the ask-when-opening choices) apply when a CMYK or gray file opens; gray PNG, JPEG, TIFF and WebP files open as Grayscale documents.
- Artboards to PDF: Include ICC profile works, embedding the document's RGB profile for every page.
- Local generation keeps its settings when the picture enters the document (they were deleted with the engine's copy).

## 1.87.4 · 2026-10-19

### Added

- Channels panel: New Channel and Duplicate Channel buttons, drag alpha channels to reorder them, and Channel Options (name, overlay colour and opacity, masked or selected areas) from each row; the options are saved in the project.
- Select > Load Luminosity (Alt+Mod+2) selects by brightness; Select > Load Vector Mask turns the active layer's vector mask into a selection; Layer > Vector Mask > Invert.
- Layer > Stamp Down (Alt+Mod+E) merges a copy of the active layer into the one below, or of several selected layers into a new layer, keeping the originals.
- With the Move tool's Auto-Select on (or Mod held), drag on empty canvas to select every layer inside the box; Shift adds.
- Lock Transparent Pixels on the / key; with several layers selected the lock buttons lock all of them.
- Folders offer Pass Through in the Blend list; Normal now isolates the folder.
- A new adjustment layer made with a selection active is masked to that selection, as fill layers are.
- History panel: Delete State removes a step and what came after it, New Document from State opens a step as its own document, and double-click a snapshot to rename it.
- Pattern fill layers have Offset X, Offset Y and Snap to Origin.
- Select > Modify takes up to 1024 pixels, Feather takes fractions from 0.1, and Apply effect at canvas bounds is a choice.
- Selection Brush: Shift+Alt intersects with the current selection.
- Rectangular Marquee: a Swap button exchanges the width and height for Fixed Ratio and Fixed Size.
- Desktop app: pictures and projects opened from Finder, Explorer or a file manager open in the running window (a second launch hands its files over instead of starting again); quitting with unsaved documents asks first; Help > Check for Updates.
- The Layers panel shows the active layer's size and scale, scrolls to and opens the folders around a layer selected on the canvas, scrolls with a middle-button drag, and Alt-click on a folder's triangle opens or closes every folder inside it. Alt-click on New Layer or New Folder opens its dialog.

### Changed

- Messages, notes, the manual and command descriptions name file formats (PSD, .abr, .aco and the rest) rather than other products.
- Bring Forward and Send Backward move every selected layer.

### Fixed

- PSD files open at their own resolution and save it; a PSD cut short or damaged opens its layers, or its merged picture, with a note saying what was lost.
- 16 and 32-bit documents composite folders in Multiply and the other modes, and adjustment layers in their blend modes, as 8-bit documents do.
- 16-bit PNG and TIFF, very large PNG, AVIF, WebP and TIFF exports carry the document's colour profile.
- Merge refuses layers whose pixels are locked.
- Contract Selection shrinks a selection that fills its shape exactly (it did nothing before).
- Desktop app: the window's own commands (fonts, open and save panels, menus, the native canvas) are allowed for the page the window loads from the local engine.

## 1.87.3 · 2026-10-19

### Changed

- Home is laid out as pages beside a navigation column: Start, Recent, Projects and Outputs (each with its count), Create (New document, Open, Generate image), Preferences and Help. Start greets you with Open and New document, a drop zone listing what opens, your recent files with See all, and one-click new document sizes (photo, square post, story, HD, 4K, A4 print at 300 ppi, web banner, app icon). Recent, Projects and Outputs are full pages with filter, sort, and thumbnails or a list.
- The three-star sparkle icon is gone everywhere: generative commands use a new picture-and-stroke icon, the Remove tool's buttons use the Remove tool's own icon.
- The Layers panel's trash button asks before deleting.
- With the Move tool, right-click the canvas to pick from the layers that have pixels under the pointer.
- Layer > New > Background from Layer turns the active layer into the Background, filled with the background colour behind it.
- Layer > Color Label marks layers red, orange, yellow, green, blue, violet or gray in the Layers panel; labels are saved in the project.
- Step through layers from the keyboard: Alt+] and Alt+[ select the layer above or below, with Shift to add it to the selection; Alt+. and Alt+, jump to the top and bottom layer.
- Layer > Stamp Visible (Alt+Shift+Mod+E) adds a merged copy of everything visible as a new layer; Layer > Show Only This Layer, or Alt-click an eye, hides every other layer and the same again brings them back.
- Essentials opens with the Layers list in full view: the Generate panel starts closed (Window > Generate opens it). A saved arrangement is kept.

### Fixed

- Agents: MCP tools refuse unknown or misspelled arguments and values (flip_canvas 'verticle' no longer flips horizontally) and honour cancel; file paths are kept out of system folders and an existing file is replaced only with `overwrite: true`.
- Auto-Align's Vignette Removal works: a radial falloff is fitted from the overlapping layers and corrected before blending.
- Imported .abr brushes keep their spacing, so stamp tips no longer smear into lines.
- /api/capabilities reports the device Select Subject runs on.
- EXR and HDR pictures can be placed into an open document (they failed with "cannot identify image file"); in a 16 or 32-bit document they keep their high dynamic range.
- Pictures open at their own resolution (a 300 ppi JPEG, PNG or TIFF opens at 300 ppi, not 72), and Export As writes the document's ppi into PNG and JPEG files.
- Folders (groups) have their own blend mode and opacity: a folder set to Multiply at 50% composites its contents first, then blends, on the canvas and in every export; PSD groups open and save with their mode and opacity; the Layers panel's Blend and Opacity work on a selected folder.
- Adjustment layers obey their blend mode (Multiply, Screen and the rest) on the canvas and in exports.
- Filters respect Lock Transparency: a blur on a locked layer no longer spreads into empty pixels.
- A layer with Lock All cannot be deleted; deleting a selection keeps the locked layers and says so.
- OpenType Features from the command search no longer clears a type layer's features when run without settings.
- Quick Export as PNG or JPEG embeds the document's colour profile (Display P3, Adobe RGB and others), as Export As does.
- The options bar keeps each tool's most used settings in view (Brush keeps Mode, Size, Hardness, Opacity and Flow) and moves the rest into More first. Tab no longer scrolls the window sideways.
- The Contextual Task Bar takes clicks only on itself, and its More button no longer jumps when a document opens.
- Guides, slices, notes and colour samplers follow Image Rotation, Flip Canvas, Crop, Canvas Size and Image Size, and come back with Undo.
- The Move tool's X, Y, W, H, Scale and Angle fields stay in the options bar after you release a handle, so you can type values.
- A single slice can be deleted: Delete or Backspace with the slice selected, the Delete Slice button, or View > Show > Delete Slice.
- Split Warp splits at the point you last pointed to on the warp grid.
- A Generate result that arrives after you switch tabs goes into the document it was made for instead of being thrown away.
- Image Assets named .png8 are written as real 256-colour palette PNGs.
- Depth Blur, Colorize and Style Transfer read the layer again after it is edited instead of reusing an old result.
- Image > Mode > RGB Color from an 8-bit CMYK document uses Color Settings' intent and black point compensation.
- The Generate panel's address fields no longer share their names with Preferences' (screen readers could not tell them apart); Relight's options bar title reads Relight; Print One Copy's description says the system print dialog still opens.

## 1.87.2 · 2026-10-18

### Fixed

- The options bar no longer runs off the window (the Brush row needed scrolling to reach most of its settings, and so did 18 other tools at 1800 px wide and 31 at 1280). Settings that do not fit move into a More panel at the bar's end, check boxes and buttons first, and come back when the window is wider. Nothing in the bar scrolls.

## 1.87.1 · 2026-10-18

### Changed

- Home shows your files: Recent, Projects (the library) and Outputs (exports), as a grid of thumbnails or a list with name, kind, size and when each changed. Filter by name, sort by most recent, name, size or kind, click to open, and remove an entry from Recent. A file that has moved or been deleted shows as missing. Projects saved before thumbnails show their bottom picture layer. Home keeps 40 recent files; Open Recent in the File menu shows the first 10.

## 1.87.0 · 2026-10-18

### Changed

- Projects are `.fvd` files. `.fmv` projects (and `.formvis` from before 0.90.0) still open, and saving one writes a `.fvd` in its place. Every saved project carries a thumbnail of the picture, for Home and the file lists.
- Desktop app: Save writes back to the document's own file; Save As, the first Save of a new document and every export (Export As, Quick Export, Download Project File, Package and the rest) ask where in the system's save panel, starting in the library folder for projects. Open's Browse... uses the system's open panel for any project or picture formvis reads, and Open Recent lists files on disk as well as library projects. Revert reads the document's file.

### Fixed

- A saved project could not be opened again from the Open dialog: Project folder (now Folder...) sent the whole folder the projects are saved in as one unpacked project and failed with "manifest.json was not found". A folder that is not a project now opens every project and picture in it; a project folder still opens as one project. Checked with the owner's own saved files.

## 1.86.5 · 2026-10-18

### Fixed

- Desktop app: the Move and Transform tools froze the window for seconds after a drag. Both send an options change on every pointer move, and each change repainted the Brushes panel's stroke preview (121 soft dabs); WebKit keeps every queued fill and drew about 7,700 of them at once. The preview now repaints only when the brush or theme changes, and the Properties column refreshes once a frame. Measured in WebKit at screen scale 2: the freeze after a move went from 3.5 to 3.7 s to about 0.45 s (what a brush stroke costs on the same machine), and frames from 19.8 to 53.5 a second; Free Transform runs at 55.

## 1.86.4 · 2026-10-18

### Fixed

- Relight's side panel showed as a bare Properties header when the Properties group had ever been minimised (the minus button, which is remembered). Starting Relight now opens that group, picks its Properties tab, scrolls to it and folds the other groups in the column while the session lasts; they open again when it ends. Reproduced in WebKit (the desktop app's engine) with the minimised state: 41 px before, the whole column after.

### Added

- Help > Record Performance: records 10 seconds of real use and reports frame gaps and stutters, the canvas, overlay and ruler draws, every engine event, input handling, pixel reads and uploads (2D, WebGL2, WebGPU), the renderer and why, and the engine's answer time; Copy and Save. Also `formvisPerf.record(10)` in the console.
- The desktop app has the Web Inspector in release builds (Tauri's `devtools` feature): right-click > Inspect Element, for Safari's Timelines and the console.

## 1.86.3 · 2026-10-18

### Fixed

- Desktop app: the engine removes the temporary folders earlier launches left behind, in the background at every start. Each folder carries the process id of the launcher that made it; a folder whose process is gone is removed, one in use is kept. The owner's Mac held 31 of them, about 5.3 GB.

## 1.86.2 · 2026-10-18

### Fixed

- Desktop app on macOS (and Windows): the canvas was drawn on the CPU every frame. The app read the monitor profile and converted the canvas to it in JavaScript, which also sent the whole canvas off the GPU; the system already converts the window to the monitor, so the colours were converted twice as well. formvis now leaves that conversion to the system there (Linux, whose web view does not, keeps it), and Color Settings says so.
- Proof Colors and documents with an embedded profile are drawn on the GPU: the view's colour table runs as a last 3D table over the layers (within one level of the CPU result). The gamut warning still draws on the CPU.
- Desktop app on macOS and Linux: layer canvases are made for reading (`willReadFrequently`). WebKit otherwise keeps them on the GPU and every pixel read by a brush, filter or selection waited for it; Chrome makes that move by itself, which is why the browser build was quick.
- Desktop app: quitting asks the engine to stop before forcing it, and the engine stops by itself, removing the gigabyte it unpacked, when the app that started it is gone. A forced stop had reached only the engine's launcher, which could leave the engine server running and its temporary folder behind after each launch.

## 1.86.1 · 2026-10-18

### Fixed

- Desktop app: dropping image files on the Home screen or the canvas did nothing, because the window's own drop handler took the files before the page saw them. Drops now open a file (Home) or place it as a layer (canvas), as in the browser.
- Relight: its side panel always opens when a session starts (the Properties column is shown and taken out of its strip, as the reference's panel is); before, a hidden or collapsed column left the lights with no controls in view.
- Relight: each added light takes its own part (a cool fill from the other side, a warm hair light from above, coloured accents from low, and so on) instead of a copy of the first, and keeps the type chosen in Add Light.
- Relight: light colour can be set from sixteen gels (candle to blue hour, red to pink) and a hex field under Color, not only through the system colour picker.
- Relight is a layer, not a filter: it left the Filter menu; it starts from Layer > New > Relight Layer, the Relight tool, the Generate menu and panel, and the Contextual Task Bar.
- The Contextual Task Bar hides during a Relight session (it sat under the Relight bar) and is solid instead of frosted, which the desktop window redrew on every canvas frame.

## 1.86.0 · 2026-10-18

### Added

- Contextual Task Bar (View > Contextual Task Bar): a floating bar over the canvas with the next likely step. With a selection it offers a prompt and Generate (Generative Fill), Remove, Invert, Feather and Deselect, just below the selection; with a photo it offers Select Subject, Remove Background, Generate Image, Generative Expand, Upscale and Relight; with no document, Generate Image and New Document. It can be dragged, pinned, reset or hidden.
- Generate panel, shown in the Essentials, Photography and Painting workspaces: generate an image from a prompt with any model formvis knows (local, fal, OpenAI, Google, Black Forest Labs, Ideogram, ComfyUI workflows); Edit with AI (Generative Fill, Replace, Remove / Repair, Generative Expand, Remove Background, Upscale, Relight); and Connections, where ComfyUI and NodeMode addresses are set and tested and each API provider's key is added.
- A Generate menu between Filter and View with all of the above.

### Fixed

- Dialogs whose content spilled past their frame (Tool Presets and others found by a sweep of every dialog).
- `./build_app` on macOS with Rust 1.97: the release profile stripped the derive crates the compiler loads, so it could not read them (E0463 for `zerofrom_derive` and `phf_macros` although the files were there). Stripping is off, and the derive crates and build scripts are never stripped. The build log's diagnosis now also says whether a derive library still holds its metadata.

## 1.85.2 · 2026-10-18

### Fixed

- Rotate View: a turned view covered only part of the stage, leaving bare strips on both sides (or above and below) that hid the picture. The canvas now reaches every corner at any angle.
- The Navigator turns with the view, and its red frame shows exactly the part of the picture on screen.
- Image > Image Rotation 90 degrees keeps the document centred on screen.
- Layers panel: Opacity and Fill have sliders (the arrow beside each field) and scrubby labels, and the blend mode menu previews each mode live on the canvas as you hover or arrow through it; leaving the menu restores the layer.
- New Document creates Bitmap, Grayscale, RGB, CMYK and Lab documents at 8, 16 or 32 bits where the mode allows, with a clean history.
- The transparency checkerboard follows the theme (Grid Colors: Match Theme, the new default).
- Deselect also works with Escape and with a plain click of the marquee or lasso, and their options bars show a Deselect button while there is a selection.
- Relight is easy to find: Filter > Relight..., Layer > New > Relight Layer... and the Relight tool in the tool rail.

## 1.85.1 · 2026-10-18

### Fixed

- `./build_app` on macOS stopped twice at `error[E0463]: can't find crate for zerofrom_derive`: the derive crate had just been built, but the next crate could not read it from `src-tauri/target`. The Rust build now goes to a local cache outside the project folder (`~/Library/Caches/formvis/tauri-target` on macOS, `~/.cache/formvis/tauri-target` on Linux; `FORMVIS_CARGO_TARGET` picks another place), so a folder watched by a sync or file-provider app cannot hold back freshly built files. A failed compile now writes a diagnosis to the log (the compiler, the build folder and its free space, the derive crates built, any Cargo config files) and retries once from a clean folder one crate at a time. The built app and disk image are under that folder's `release/bundle`; the app is still copied to Applications.

## 1.85.0 · 2026-10-18

### Changed

- The room around the subject is relit and reshadowed as the subject is. The engine now takes the room's own light out too: which way each surface faces (MoGe-2's normals for the table, walls and dress form, continued smoothly behind the subject) and the slow change of brightness across the room (a bright window side, a dark corner). New light then lands on the environment by its real shape and distance, and the subject's shadows fall on it.
- The room layer keeps its fine shape (depth smoothed at 1/100 of the picture, was 1/30), so light rakes across the table's fabric and the dress form.

### Added

- Room controls in Relight's Scene section, also in `relight.apply`: Room light (how much of the room's own light stays; follows Original lighting until moved), Light on room (0 to 200 percent of the lights reaching the room), Room shadows (how dark the subject's shadows fall on it) and Room depth (25 to 300 percent of the solved distance behind the subject: nearer keeps patterns and shadows close to the subject, farther spreads and shifts them).

### Fixed

- The Shadows slider showed 55 when unset while the scene used 85; it now shows 85.

## 1.84.0 · 2026-10-18

### Changed

- Relight is rebuilt on a real camera-space scene, following the owner's method step by step instead of adjusting the screen-space approximation again. The engine now keeps what MoGe-2 small gives in its one pass (metric depth, normals and the camera's focal length), fills unsure areas such as sky from their surroundings, and sends two layers: the subject, about as deep as it is wide, and the background filled in behind it and always behind the subject. Without MoGe-2, Depth Anything's depth is turned into distance with a 45 degree lens.
- Every pixel is a point in 3D along its camera ray. A light sits where its marker is, at the depth of the point it aims at, and Close to Far brings it out toward the camera (close is a side light with a steep falloff, far is frontal and sun-like). Light reaching a point follows real directions and distances, exposed for the aimed point, with a falloff gentler than inverse-square and capped near the source.
- Terminators come from a round light of physical size (Softness), softened by Diffusion; warm materials take red light past the shadow edge; glints use a standard specular model boosted where the photo has texture (pores, hair); a light at the side or behind draws a rim along the outline and through strands.
- Soft shadows are traced in 3D from eight points on each light through the depth map, with the subject's thickness, so she casts shadows onto the background and the penumbra widens with distance behind her.
- Patterns are projected from the light through the scene onto the plane of the pattern's centre: they curve over the subject and stay straight on a flat background, with no screen-space bending.
- The subject and the background are lit as separate surfaces and blended by the cut-out, so light never bleeds across the outline; very dark pixels keep their brightness but not their colour noise; a dark background can only be brightened six times; shiny spots roll off instead of blowing out.
- Nine patterns: Blinds, Light Strip, Window, Leaves, Caustics, Lattice, Arch, Dapple and Circle.
- Benchmark against the reference (subject's brightest tenth, ours / reference, in stops): Blinds 0.99 / 1.02, Light Strip 1.27 / 1.19, horizontal strip 1.82 / 1.83, candle 1.74 / 1.87, 1.48 / 1.60, -0.26 / -0.26, Neon 0.99 / 1.18. The shader and its CPU twin agree within one level.

## 1.83.0 · 2026-10-18

### Changed

- Relight follows the owner's method further. The subject from the cut-out is its own layer in the shader: light reaching the subject is not cut off by the background's distance, so hair behind the face stays lit, and a pattern curves over the subject's own relief while it stays straight on the background.
- A light beside or behind the subject draws a rim along the outline, where the surface turns away from the camera toward the light.
- Glints use the photo's own fine texture (pores, hair), measured once by the engine and sent with the scene.
- Highlights roll off on the brightest channel, so warm light no longer turns olive or yellow in the brightest skin.
- Light Strip is wider for the same Width (the reference's frames 40 and 33 measured), and added light is calibrated a third of a stop lower (`0.95 x i^2`), which brings the subject's brightest tenth within about a quarter stop of the reference on six of seven frames.
- The original light is clamped 0.4 to 1.3 on the solve grid, so a dark fabric is no longer read as deep shade and lifted into a pale patch.

### Fixed

- A light given only a colour temperature (`kelvin`, from a command or a saved file) now takes that colour; it was white.

## 1.82.0 · 2026-10-18

### Changed

- Relight builds a scene, as the owner's research of the reference describes. Geometry from MoGe-2 small (Microsoft, MIT; depth and normals in one pass at a short side of 518 px, optional with `backend/requirements_relight.txt`), else Depth Anything's depth and its slope. The subject from the app's subject selection (U2-Net) is its own surface: the background is filled in behind it and smoothed so patterns stay straight on it, the subject keeps its own normals so light never bleeds across the outline, and stray depth along outlines is refilled. The scene is solved on a grid at most 832 cells on the long side.
- The photo's own light is estimated from how brightness varies with surface direction (second-order spherical harmonics over the subject's normals) and divided out, so new light reaches sides that were in shade while every detail of the photo stays. Each pixel is the photo times the kept share of the original light plus the surface colour times the added light; Take out old light starts at 100.
- Added light is scaled to the subject's average brightness, so one Intensity reads alike on a dark coat and a pale face.
- A local light is exposed for the point it aims at, with a falloff gentler than inverse-square and capped near the source; Softness sets the size of the light, which softens the terminator.
- Warm materials such as skin take red light past the shadow edge.

## 1.81.0 · 2026-10-18

### Added

- A pattern centre, as in the reference: with a pattern on, Shift-drag on the canvas places the pattern (a ringed reticle) apart from where the light aims, so a strip can cross the face while the light aims at the chest. `relight.apply` takes `pattern.center`.

### Changed

- Relight is benchmarked on seven reference frames with the panel values read off each, and matches every one within half a stop on average.
- Intensity is perceptual, as in the reference: 31 percent is about a seventh of the light of 82 percent, not two fifths.
- Light stops at the depth of what it is aimed at: a low lamp floods her arm and hair and leaves the room dark; a sun strip does not paint the far wall.
- Patterns are laid on the canvas as the frame shows them (the panel's rotation is the rotation you see), and bend over every nearer or farther surface along the light.
- Strip feather is a share of the strip's width, so a soft narrow strip still shows. The Light Strip Look takes the reference's values.

## 1.80.0 · 2026-10-18

### Fixed

- Blind slats have soft edges on both sides; one edge of every slat was a hard step.
- Slat shadows no longer tear into ragged patches in hair: the shape that bends them is smoothed, and a far wall gets no displaced copy of a strip.
- Light colours are as rich as the reference's: warm light gives saturated peach skin, not a pale veil.
- No bright line down the picture's edge where the depth model misreads its border.
- The Neon Club Look's lights moved in from the picture's edges.

## 1.79.0 · 2026-10-18

### Changed

- Patterns are projected onto the depth of the scene, as a slide projector would throw them: Blinds and Window slats wrap around her arm like contour lines, curve over the face and chest, and step where one surface stands in front of another, as in the reference's close-ups. A sun comes from the handle's side and from above, as daylight through a window does; a point or spot projects in perspective from where it stands.
- The pattern frame on the canvas is the projected quadrilateral, not a flat rectangle.
- Blinds slats are a little denser and their edges softer, as in the reference.

## 1.78.0 · 2026-10-18

### Changed

- Relight is benchmarked on six of the reference video's frames (Blinds, Candlelight from two places, the Light Strip at two angles, Neon) and matches them to within half a stop on average.
- Depth maps the light: a light reaches what it is aimed at and stops there (a lamp floods her and leaves the wall dark), blind stripes are crisp on the subject and wash out on surfaces far behind it, and a light stands at a height above the surface it aims at.
- Point lights flood the subject like the reference; the sun rakes from higher; Blinds slats and the Light Strip have the reference's proportions and rotation; light colours are the swatch's own, and 1800K keeps a little blue so dark hair is not khaki; dark hair catches some light.
- Take out old light starts at 0, as the reference does (the photo is its own albedo); raise it to move a hard old shadow.
- Faces are shaded from finer depth normals.

## 1.77.0 · 2026-10-18

### Changed

- Relight is calibrated against the reference video, not by eye: the untouched photo from frame 7 and Photon's Blinds, Candlelight and Light Strip results (frames 23, 28, 40) were rendered with the same settings and compared pixel by pixel. Point and spot lights are about 25 times weaker near the subject, so Candlelight is a warm glow, not an orange flood; light colours mix like Photon's (gentle tints, not saturated gels); a light reaches what it is aimed at and fades on the wall behind (Close to Far sets how far it reaches); Diffusion adds an unpatterned fill inside the pattern's frame; Blinds and Strip rotate the same way as the reference; the Strip is narrower.
- Take out old light (was Flatten original light): with the split, 0 keeps the photo as its own albedo, 100 takes all of the old shading out (1.76.0), 50 by default, so a dark dress is not lit like skin.
- Default Shadows strength 40 (was 55).

## 1.76.0 · 2026-10-18

### Changed

- Relight keeps the subject. The owner's verdict on 1.75.0: Marigold's albedo "is not the same face at all", and the SAM 2.1 grid split degraded it too. The default split ("Take out, keep the subject") no longer replaces a single pixel's detail: the albedo is the photo divided by a smooth shading field, so eyes, pores, hair strands and edges are the original's, and only the light changes. The shading is estimated per material, each on its own (background, hair, skin, clothes), with formlit 0.45.3's way of masking people: MediaPipe selfie multiclass for the parts and YuNet for faces. A morphological close drops thin dark features (lashes, nostrils) while keeping shadow edges, a rolling bilateral smooths within each material, and the old terminator's penumbra is followed so no dark seam is left where the old shadow was.
- Faces get a head-shaped normal prior blended into the depth normals, so a light from the left lights her right cheek and leaves the other side in shade: the old shadow really moves.
- Lights now sit above the surface they aim at, not above the nearest point of the picture, so side lights rake across a face instead of falling flat from the front (CPU and WebGL2 alike).
- Deep shadows that a new light lifts are cleaned of JPEG blocks and colour noise; what is removed rides with Original lighting, so the untouched photo is still rebuilt exactly.
- Marigold stays as an option ("Take out with Marigold (repaints surfaces)") and is never chosen by Auto; the SAM 2.1 grid split is gone.

### Added

- Relight's Scene section offers the parts and face models (16 MB, Apache-2.0 and MIT) when they are missing; without them the split falls back to colour regions.

## 1.75.0 · 2026-10-18

### Added

- Relight re-shades: it takes the photo's own light out first, so a new light from the other side moves the shadows on a face instead of adding brightness over the old ones. Scene > Old light chooses how: the best available, Marigold, SAM 2.1 regions, or Keep (the 1.74 behaviour).
- Marigold (learned, optional): Marigold IID Lighting and Marigold Normals v1.1 separate the colour of surfaces from the light on them and read the detailed shape of faces. A button in Relight names the licence (CreativeML Open RAIL++-M) and the size (about 5.2 GB) before downloading; the engine also needs backend/requirements_relight.txt. About 50 seconds per photo on a CPU, once; Done reuses it.
- SAM 2.1 regions (classic, no extra download beyond the selection model): formvis's own split from SAM 2.1's object regions and an edge-keeping shading estimate, in a few seconds. Noisier than Marigold.
- relight.apply takes split for agents and the command line, and reports which split it used.

## 1.74.1 · 2026-10-18

### Fixed

- Relight now lights the shapes in the photo: light wraps faces, arms and folds, falls off across the room, and casts soft shadows. 1.73.0 and 1.74.0 often looked like a coloured layer laid over the picture, with an oval edge when no depth model was installed.
- Cast shadows are soft at their edges, as Softness asks, instead of hard silhouettes on the wall.
- No more dark halos around people and no more rippled, liquid-looking light on hair and walls.

### Changed

- Without Depth Anything, Relight no longer invents a shape: the light falls on a flat picture with no cast shadows, and Relight Properties offers Download Depth Anything (about 99 MB), then reads the shape and redraws.
- The engine can return depth as full-precision values for Relight; Depth Blur is unchanged.

## 1.74.0 · 2026-10-18

### Added

- Relight depth bands: each light can be kept to the nearer subject or to the background (Lights from depth, Lights to depth).
- Relight Scene: Flatten original light evens out the photo's own light and shade before the new lights; Ambient tints the light that is kept; Shadows sets how dark cast shadows are.
- Saved Looks: the + tile keeps the current lights as a Look of your own, shown on a lit sphere beside the built-in ones; Alt-click deletes one.
- Keyboard lighting: arrow keys move the selected light (Shift for bigger steps, Alt for its aim) and Tab moves to the next light.
- `relight.apply` for agents, MCP `run_command` and `./formvis cli`: a Look or a list of lights, rendered at full size without the panel, as one undo step.

### Fixed

- Relight's section headings, panel title and Edit Lighting button showed their text clipped at the left.
- Editing an older Relight layer straight after making another one folded the edit into the other layer's undo step.

## 1.73.0 · 2026-10-18

### Added

- Relight: Layer > New Relight Layer... lights a photo again with virtual lights, on this computer and on the GPU, with no credits. The result is a Relight layer above the picture, and the original layers are not touched.
- Six light types (Point, Spot, Sun, Area, Strip, Ring), colour by Kelvin or any colour, Intensity, Softness, Diffusion and Close to Far, with up to eight lights on a layer.
- Patterns the light falls through: Blinds, Light Strip, Window and Leaves, each with its own size, feather, rotation and invert.
- Fourteen Looks, shown as lit spheres, including Window Blinds, Candlelight, Neon Club, Golden Hour, Rembrandt and Light Strip.
- Scene settings: how much of the photo's Original lighting is kept, and Shine.
- Lights are dragged and aimed on the canvas. A bar under the picture holds Add Light, Reset, Cancel and Done, and an Edit Lighting button reopens a finished layer, as do Layer > Edit Lighting... and a double-click in the Layers panel.
- With Depth Anything V2 Small installed, the light follows the shapes in the photo and casts shadows. Without it, formvis estimates the shape and says so.
- Projects keep each Relight layer's lights, so it can be edited after reopening.

## 1.72.8 · 2026-10-15 · alpha

### Added

- docs/ALPHA_REVIEW.md: how alpha reviewers run formvis, what to look at, known limits and how to report.

### Changed

- A colour fill's undo step keeps half the memory: redo recomputes the filled pixels instead of storing them.
- The engine's smart object, colour mode and snapshot code live in their own modules; behaviour is unchanged.
- The README describes Ctrl+J's two meanings.

## 1.72.7 · 2026-10-15

### Changed

- Large filters split into bands run the bands on a small pool of background workers (layers over 16 megapixels), with results identical to one band after another.
- Paths, type and the video timeline live in their own engine modules; behaviour is unchanged.
- Hungarian, Thai, Indonesian and Vietnamese: 80 corrections from a consistency review (wrong senses, English left in place, one word for two terms).
- The browser tests start a fresh browser for each test file.

## 1.72.6 · 2026-10-15

### Changed

- Close-out release: no code changes. The full browser suite passed 516 of 525 in one run (6 skipped for a model not installed); the nine that failed late in the run pass on their own. What remains is recorded in the planning handoff.

## 1.72.5 · 2026-10-15

### Fixed

- Choosing a font that is not installed, or a generic family such as monospace, no longer logs a failed request: the engine answers that there is no file, and generic families are not asked for at all.

## 1.72.4 · 2026-10-15

### Fixed

- Play Action is offered only when an action exists, and plays the first one when no name is given.
- Open image data with nothing to open says so instead of failing.

### Changed

- The notes and counts, smart filter and frame animation code live in their own engine modules; behaviour is unchanged.
- The browser test that runs every command is split into six parts and names the command it was on when anything fails.

## 1.72.3 · 2026-10-14

### Fixed

- OpenEXR files open and export again with OpenCV builds that ship no EXR codec.
- Ctrl+J (Cmd+J) is Layer via Copy while a layer is open, as is usual; it toggles the terminal otherwise or when the terminal has focus.
- The History panel's History Brush column no longer overlaps the row below.
- Browser tests brought up to date with 16- and 32-bit painting, giant-document budgets, the Gradient Editor's strips, Image > Mode and the dock Timeline; the LaMa tests skip when the model is not installed.

## 1.72.2 · 2026-10-14

### Fixed

- Edit > Toolbar: a tool dragged past another row kept following the pointer, so it can reach Extra Tools.
- The engine processor chosen in Preferences is no longer overwritten by a slower earlier request at start.
- Browser tests brought up to date with the assistant's step rows, Camera Raw on open, Export As fields, the toolbar dialog and the dock's Timeline.

## 1.72.1 · 2026-10-14

### Changed

- Without the engine service, formvis boots quietly: one note says what waits for the service, and the commands that need it are disabled with the reason instead of failing after a click. Nothing polls or reconnects while it is down, and it is picked up again when it starts.
- TIFF files open in the browser when the engine service is not running (first page, 8 bits).
- The engine's artboard, guide and slice, and colour profile code live in their own modules; behaviour is unchanged.

## 1.71.9 · 2026-10-14

### Added

- Lab documents: choose L, a or b in the Channels panel and the Brush, Pencil and Eraser paint that channel alone.
- Threshold, Gaussian Blur, Add Noise, Unsharp Mask and the per-pixel part of Develop run on the graphics processor through WebGL2 when it is available; Preferences > Performance > Use the GPU for filters turns it off.

### Changed

- Gaussian Blur on large layers is about a fifth faster.
- Edit > Purge > Clipboard frees the copied pixels at once; Purge > Histories frees the pixels only the cleared steps kept.

## 1.71.8 · 2026-10-14

### Added

- Quick Shape for the Brush, Pencil and Eraser: hold still at the end of a stroke and a line, ellipse or rectangle snaps to the clean shape.
- Edit > Compare with...: a new document with both pictures, a Differences layer and the differing regions selected and counted.
- Window > Reference: reference images beside your work, kept for the session.
- Lab documents save as Lab PSD (8 bits).
- The Remove tool fills holes in smooth areas with a fast diffusion fill.

### Changed

- README, the manual and the wiki describe the work of Phases 29 to 36; a Languages page in the wiki.
- Preferences > Language says what it now does: the whole interface.

## 1.71.7 · 2026-10-14

### Added

- Artboard tool (V cycles it with Move): drag on empty canvas to make an artboard, handles to resize, drag inside to move it with its contents, "+" to add one beside; size presets in the options bar. Artboard folders show their own icon and size in the Layers panel, and artboards are read from and written to PSD.
- Opening a camera RAW shows Camera Raw first: a preview, White Balance (As Shot, Auto, Daylight), Temperature and Tint applied in the RAW decode, and 8 or 16 bits per channel.
- Window > Arrange: New Window for Document, Float in Window, Float All in Windows; the gutters between tiles can be dragged.

### Fixed

- Choosing a tile layout refits the picture in the main view.

## 1.71.6 · 2026-10-14

### Added

- Object Selection: Object Finder (on by default) outlines the object under the pointer after a short rest; a click selects that object without asking the model again.
- Assistant: each command the model runs is its own row with its status and an Undo for that step; Plan first shows a numbered plan to run or cancel; the model is told to use formvis's own commands.
- Save for Web: 2-Up and 4-Up views with three variants, file sizes and download times; true 8-bit PNG with colours, dither and transparency; a metadata choice; and Image Assets on Save in File > Export.

## 1.71.5 · 2026-10-14

### Added

- Content-Aware Fill: Color Adaptation, Rotation Adaptation, Scale and Mirror. They start off, so the fill is as fast as before until one is chosen; colour adaptation makes it several times slower.
- Window > Script Console...: type JavaScript with `formvis.run`, `formvis.commands`, `formvis.api` (the plugin API) and `formvis.log` in scope.
- Multi-part OpenEXR files open with one layer per part, named after it, in a 32-bit document.

## 1.71.4 · 2026-10-14

### Added

- Clone Source panel: five sources, each with its own position, scale, angle and flips, and the overlay's Show, Opacity, Clipped and Auto Hide.
- Gradient Editor: separate opacity stops above the bar and colour stops below, with draggable midpoints on both; .grd files keep their midpoints and opacity stops both ways.
- History panel: a source marker on each step, so Fill with History paints from the chosen step instead of the oldest.
- Export As: a canvas size, a metadata choice (Document File Info, None, or Copyright and Contact Info) and several sizes at once with file name suffixes.

## 1.71.3 · 2026-10-14

### Added

- Edit > Toolbar...: drag tools between groups and into Extra Tools to arrange the tool bar; Restore Defaults and Clear Tools. The layout is saved in the preferences.
- Adjustments, Notes and Histogram panels in the Window menu.

### Changed

- 279 more strings in every language: panel titles, the status bar, tool hints, Preferences sections, Blend If, adjustment and filter names, and search placeholders.

## 1.71.2 · 2026-10-14

### Changed

- 1327 more interface strings in every language: the filters and adjustments, dialog titles and fields, buttons, tooltips, notes and messages. Labels ending in a colon use the same words.

## 1.71.1 · 2026-10-14

### Added

- The interface in 26 languages, English the default: Spanish, Mexican Spanish, Brazilian Portuguese, French, Canadian French, German, Italian, Dutch, Danish, Finnish, Norwegian Bokmål, Swedish, Russian, Polish, Czech, Hungarian, Ukrainian, Turkish, Simplified and Traditional Chinese, Japanese, Korean, Indonesian, Thai and Vietnamese. Choose it in Preferences > Language; it switches in place and is used from the next start before anything shows.
- Menus, panels, dialog titles and buttons, tool names and options bar labels are translated in every language; text placed directly in panels and dialogs follows as each string joins the tables.

## 1.70.9 · 2026-10-14

### Added

- Window > Gradients, Patterns and Shapes panels: preset tiles that pick the Gradient tool's gradient, the Pattern Stamp's pattern or the Shape tool's custom shape in one click.
- Custom shapes export as `.csh`; Tool Presets export and import as a file.
- Slices are kept in PSD both ways, and auto slices are drawn around the user slices.
- View > Pixel Aspect Ratio Correction now stretches the canvas itself, with every tool working in document pixels.
- View > Fit Layer(s) on Screen and Fit Artboard on Screen; View > Guides > New Guide Layout and New Guides From Shape.
- Gradient Overlay keeps every stop and its transparency from PSD files and draws them.
- Liquify: the Push Left tool (Alt pushes right), Save Mesh and Load Mesh.
- Generative Fill and Expand can run through the other providers that have a key (OpenAI, Google, Black Forest Labs, Ideogram).
- Type > Font Preview Size: font menus draw each family in its own face.

### Changed

- Dialog labels and the options bar follow the interface language, in all four languages.
- Type tracking and kerning are written to PSD.
- A painted frame of premultiplied video footage keeps its colours when shown again.

## 1.70.8 · 2026-10-14

### Added

- The Styles panel exports every style as an `.asl` file.
- Record Measurements also keeps the selection's gray value (mean, minimum, maximum), integrated density and centroid; Select Data Points offers them as columns, off by default.

### Changed

- The Type tool's OpenType choices follow the selected type layer's font and features, and a choice changes that layer in one step.
- The Glyphs dialog inserts at the caret while a type layer is being edited, instead of at the end.

## 1.70.7 · 2026-10-14

### Added

- The Styles panel loads `.asl` style files (and formvis style JSON): drop shadow, inner shadow, outer and inner glow, stroke, colour and gradient overlay, satin and bevel come across.
- OpenType features are read from each font: the Glyphs dialog shows only the alternates the font has, and the Type options mark features the font lacks.
- Image > Analysis > Select Data Points: choose which columns the Measurement Log and its CSV show (Circularity added, off by default); Record Measurements still keeps every value.

## 1.70.6 · 2026-10-14

### Added

- Window > Character Styles: styles that set any of a type layer's font, size, colour, weight, tracking or OpenType features over its own settings, with New, Apply, Clear Override, Redefine, Rename and Delete; kept in `.fmv`.
- The Glyphs dialog has Alternates toggles (Stylistic Alternates, Swash, Contextual Alternates, Stylistic Sets 1 to 10) for the active type layer.
- Layer > Video Layers > Interpret Footage: a video layer's own frame rate, how many times it loops, and whether its alpha is straight, ignored or premultiplied with a matte; the clip lengthens to match, kept in `.fmv`.
- The Styles panel shows each style as a swatch.
- The selected slice is highlighted, with corner handles.
- The Preset Manager exports gradients as `.grd` and swatches as `.ase`, and loads `.csh` custom shapes.

## 1.70.5 · 2026-10-14

### Added

- Layer > 3D > Spherical Panorama: an equirectangular document viewed as a sphere (drag to turn, wheel to zoom, yaw, pitch and field of view). Edit View opens the current view as its own document; Apply View to Panorama projects it back onto the panorama as a new layer, in one step.
- Slices: the Slice tool selects and moves an existing slice when pressed inside one; View > Show > Slice Options edits a slice's name, URL, alt text and exact bounds; New Layer Based Slice makes a slice from the active layer.
- Linked smart objects in the desktop app are picked with the system file dialog and read from their disk path, so Update Modified Content and Reveal in File Manager work, and links reopen from a saved project.

### Changed

- The Italian, Korean and Simplified Chinese interfaces now cover everything the Spanish one does, tool names included.
- Dialog rows built from labels and controls line up in two columns instead of running together.

## 1.70.4 · 2026-10-14

### Added

- Layer > Type > Check Spelling: every type layer's words checked against an English, Spanish or Italian dictionary (by the interface language), with Ignore, Ignore All, Add (a personal word list), Change and Change All, as one undo step.
- Layer > Type > Resolve Missing Fonts: each font family that is not installed, with how many layers use it, replaced by a chosen family in one step.
- Layer > Smart Objects > Reveal in File Manager: shows a linked smart object's file in the system file manager when its disk path is known (kept in `.fmv`); otherwise the path is shown.
- Open SVG as Layers now carries opacity (through groups), dashed and dotted strokes, `use` and `symbol`, text as point type layers, and a gradient fill as its first colour, and leaves no empty base layer.
- Panel tabs, dialog titles and buttons, and tool tooltips follow the interface language; a dialog opened after a language change shows the new language.

### Changed

- The Italian, Korean and Simplified Chinese tables cover the panel names and the standard dialog buttons. Pyspellchecker (MIT) joins the engine's dependencies.

## 1.70.3 · 2026-10-14

### Added

- Layer > Type > Create Work Path and Convert to Shape: a type layer's outlines, traced from its rendered letters, as a path or an editable shape layer.
- Layer > 3D > New 3D Extrusion from Selected Layer: type, shapes or any layer extruded with depth, bevel, light and material, rendered to a layer that opens again in the same settings (kept in `.fmv`).
- Menus in Spanish, Italian, Korean and Simplified Chinese (Preferences > Language), switched in place; Spanish also covers the File, Edit, Image, Layer, Select and View commands.

## 1.70.2 · 2026-10-14

### Added

- Image > Trap for CMYK documents: lighter colours spread under darker ones by a width in pixels, points or millimetres; black never spreads.
- Image > Pixel Aspect Ratio presets (square, D1/DV NTSC and PAL, their widescreen forms, anamorphic 2:1, HDV 1.33) and a custom ratio, kept in `.fmv` and PSD; View > Pixel Aspect Ratio Correction shows the corrected picture in the Navigator.
- Window > Modifier Keys: Shift, Alt and Ctrl for pen and touch, one tap for the next stroke, two to hold.

### Fixed

- Conditional Mode Change to CMYK or Lab did nothing on an RGB document that had never been converted.

## 1.70.1 · 2026-10-14

### Added

- OpenType features on type: ligatures (standard on or off, discretionary), contextual and stylistic alternates, swash, oldstyle figures, titling, ornaments, ordinals, fractions and small caps, from the Type options and the `type-features` command, for fonts installed on the computer.
- Layer Comps are written to and read from PSD (visibility and position; appearance is noted as not written), and a comp can be selected in the panel, with Update and Delete acting on it.
- Window > Styles: saved layer styles applied in a click, kept between sessions; Window > Measurement Log as a docked panel.

## 1.69.9 · 2026-10-14

### Added

- Window > Arrange: 2-up Vertical and Horizontal, 3-up, 4-up and 6-up show the other open documents as live views beside the canvas (a click makes one the active document), and Consolidate All to Tabs goes back.
- Image > Calculations takes either source from another open document of the same size, and shows a small live preview of the result.
- The Preset Manager loads `.grd` gradients (noise gradients skipped) and `.ggr` gradients.

## 1.69.8 · 2026-10-14

### Added

- Paint.NET `.pdn` files open with their layers, names, visibility, opacity and blend modes (the thumbnail as one layer when the layers cannot be read).
- `.af`, `.afphoto`, `.afdesign` and `.afpub` files open as the preview they carry; their layers are not readable.
- Layer > Type > Type on Arc and Type on Circle: live, editable type set along an arc or a circle around the selection or the document's centre.
- Window > Arrange: Match Zoom, Match Location, Match Rotation and Match All across the open documents.

## 1.69.7 · 2026-10-14

### Added

- Video layers are saved in `.fmv` projects with their painted frames and their original footage, Render Video draws each layer's own frame at every time, and Layer > Video Layers > Replace Footage swaps the clip.
- `./formvis cli process`: images in, the commands or an action run on each in the open window, files out (PNG, JPEG, WebP or TIFF) beside the inputs or in a folder.
- `./formvis cli droplet` and File > Automate > Create Droplet: a script that runs an action on the files dropped on it.
- `.kra` files open with their paint layers, groups, opacity, visibility and blend modes.

## 1.69.6 · 2026-10-14

### Added

- Layered TIFF: TIFFs saved with layers open as layers, and File > Export > TIFF with Layers writes one that other layered-TIFF readers and formvis read back.
- Layer > Video Layers: New Video Layer from File, New Blank Video Layer, Insert Blank Frame, Duplicate Frame, Delete Frame, Restore Frame, Restore All Frames and Rasterize; each frame can be painted, and the timeline shows the frame at the playhead.
- Window > Glyphs: a font's characters by Unicode block, with recently used ones, inserted into the selected type layer.
- Window > Tool Presets: named snapshots of a tool's options, applied again in one click.

## 1.69.5 · 2026-10-14

### Added

- Edit > Presets > Preset Manager: brushes, swatches, gradients, patterns and custom shapes listed by type, renamed, deleted, loaded and saved as sets; Load Swatches and Save Swatches read `.aco` and `.ase` and write `.aco`.
- View > Pattern Preview: the document drawn again around itself, to check that a tile repeats cleanly.
- View > Pixel Art Preview: the document drawn with hard pixel edges at every zoom.
- Image > Analysis: Set Measurement Scale, Record Measurements (area, perimeter, size, ruler length and angle, count, in the scale's units), Place Scale Marker and the Measurement Log with CSV export; the scale and the records are saved in the project.

## 1.69.4 · 2026-10-14

### Added

- File > Open SVG as Layers: an SVG's paths, rectangles, circles, ellipses, lines, polylines and polygons become editable shape layers with their fills, strokes and transforms, in one undo step.
- Edit > Define Brush Preset: the selection, or the whole picture, becomes a sampled brush (dark paints), kept with the loaded brushes.
- Edit > Define Custom Shape: the current path joins the Custom Shape tool's list, kept between sessions.
- Edit > Transform: Split Warp Horizontally, Vertically and Crosswise, and Remove Warp Split, for an uneven Warp grid.

## 1.69.3 · 2026-10-14

### Added

- Filter > 3D > Generate Normal Map and Generate Bump Map from the active layer, with strength, blur, invert and a DirectX flip, as new layers; Height Map from Normal Map goes back.
- FITS files (`.fits`, `.fit`, `.fts`) open with a stretch: integer data at 16 bits, floating-point data at 32 bits, RGB cubes in colour.
- Layer > Type: Find and Replace Text across type layers (one undo step), Paste Lorem Ipsum, Convert to Point Text and to Paragraph Text, and Update All Text Layers.

## 1.69.2 · 2026-10-14

### Added

- The Actions panel imports `.atn` files: Invert, Desaturate, Flatten, Merge Visible, Merge Down, Duplicate, Select All, Deselect, Flip Canvas and Gaussian Blur become steps, and the note names the steps with no formvis equivalent.
- File > Scripts > Script Events Manager: an action runs when formvis starts or when a document is made, opened, saved, closed, exported or printed.
- File > Automate > Conditional Mode Change: converts to a target mode only from the chosen source modes, and is recorded into actions.

## 1.69.1 · 2026-10-14

### Added

- File > Export > Color Lookup Tables: the visible adjustment layers recorded as a 3D LUT in CUBE, 3DL and CSP, at 17, 33 or 65 points a side.
- File > Export > Paths to AI File: the document's paths written as an `.ai` file, one group per path.
- File > Place Embedded, beside Place Linked: a picture placed as an embedded smart object.
- File > Package: the project file and every linked file it uses, gathered into one zip with a `Links` folder.

## 1.68.9 · 2026-10-14

### Added

- File > Scripts > Load Files into Stack and Statistics: chosen images load as layers of one new document, optionally as a stacked smart object; Statistics stacks them with a chosen stack mode (Median by default).
- File > Export > Generate Image Assets: layers named like `hero.png, 50% small.jpg80%, 32x? thumb.webp` are exported as those files, trimmed and scaled, in one zip (PNG, JPEG, GIF and WebP).
- File > Export > Save for Web (Legacy): the original and the encoded result side by side with their sizes, JPEG, PNG-24, PNG-8, GIF or WebP with quality, and an export of the whole image or of every slice as numbered files in a zip.

## 1.68.8 · 2026-10-14

### Added

- The Slice tool (C, with Crop): drag to mark user slices, numbered in reading order. View > Show > Slices and Clear Slices; slices are saved in the project.
- Image > Mode > Multichannel, from RGB, CMYK, Grayscale, Indexed or Duotone: one spot channel per ink, shown and exported as the inks overprinted; RGB Color brings it back to one layer.
- Smart object Stack Modes: Convert to Smart Object on two or more pixel layers makes an image stack, and Layer > Smart Objects > Stack Mode chooses None or one of 12 modes (Mean, Median, Maximum, Minimum, Range, Summation, Standard Deviation and others). The stack is saved in the project.

## 1.68.7 · 2026-10-14

### Added

- Image > Mode > Color Table for Indexed Color documents: edit entries, choose a built-in table, and load and save `.act` files.
- File > Export > Layer Comps to Files.
- Layer > Smart Objects > Convert to Linked.

### Fixed

- The Navigator shows a Duotone document in its inks, as the canvas does.

## 1.68.6 · 2026-10-14

### Added

- Image > Mode > Duotone, from Grayscale: Monotone, Duotone, Tritone and Quadtone, each ink with its colour and curve, shown, exported and printed as the inks overprinted.
- Window > Layer Comps: the panel, with apply, rename, previous, next, update, new and delete.
- Image > Variables > Define and Data Sets dialogs, and File > Export > Data Sets as Files.

## 1.68.5 · 2026-10-14

### Added

- Layer > Layer Comps: New, Apply, Update, Delete, Next and Previous. A comp keeps each layer's visibility, position and appearance, and is saved with the project. The Layer Comps panel follows.
- Image > Variables: visibility, text and pixel replacement variables, data sets imported from CSV or tab-separated text, and Apply Data Set. The Define and Data Sets dialogs follow.
- Pattern files (.pat): import and export.

## 1.68.4 · 2026-10-14

### Added

- File > Scripts > Image Processor: saves chosen files or the open images as JPEG, PSD and TIFF at a maximum size, optionally after an action and with a copyright notice.
- File > Automate > Contact Sheet II: thumbnails of chosen files in a grid on new pages, with file-name captions.
- File > Automate > Crop and Straighten Photos: finds each photo on a scan, straightens it and opens it as its own document.

## 1.68.3 · 2026-10-14

### Added

- Edit > Auto-Align Layers and Auto-Blend Layers, outside Photomerge. Align uses Auto, Perspective or Reposition; Blend uses Panorama or Stack Images, with Seamless Tones and Colors.
- File > Export > Artboards to PDF: one page per artboard, lossless or JPEG, contents only or with background.
- Print: crop and registration marks, description and label; colour managed by formvis with a printer profile, intent and black point compensation; Save as PDF.

## 1.68.2 · 2026-10-14

### Added

- The Apply Image dialog, with a live preview, and the Calculations dialog.
- File > Print (Ctrl+P) and Print One Copy (Alt+Shift+Ctrl+P). They cover paper size and orientation, position, scale or fit to the paper, printing only the selected area, and a page preview. Print One Copy uses the last settings.

## 1.68.1 · 2026-10-14

### Added

- Image > Apply Image and Image > Calculations, for agents and actions with their parameters. The dialogs follow in the next release; from the menu each says so for now.
- Layer > Smart Objects: New Smart Object via Copy (an independent copy), Convert to Layers (the contents at their placement, without the smart filters) and Export Contents (the contents as a PNG).

## 1.68.0 · 2026-10-14

### Added

- View > Proof Setup presets: Working CMYK, the Working Cyan, Magenta, Yellow, Black and CMY plates, and Color Blindness, Protanopia-type and Deuteranopia-type. Each turns Proof Colors on.
- Edit > Purge: Clipboard, Histories and All. Purging histories asks first, because it cannot be undone.
- Layer > Smart Filter: Disable Smart Filters (Enable when they are off) and Clear Smart Filters, each one undoable step.

## 1.67.9 · 2026-10-13

### Added

- File > File Info: title, author, description, rating, keywords, copyright status, notice and URL, with read-only camera data from the photo. They are kept in the project and written as XMP into PNG, JPEG, WebP, TIFF and PSD exports, and read back when such a file is opened. A copyrighted document shows © before its title.
- QOI, PNM (PBM, PGM, PPM, PAM), TGA and ICO open and export. 16-bit PGM and PPM open as 16-bit documents. An icon with several sizes asks which to open, and icons export at the sizes you choose.
- Help > What's New, with a Show Me button on each row. It is shown once after an update.
- Preferences: Show Home screen at launch, and Show Home screen when the last document closes (off by default, so closing the last document leaves the workspace).

### Changed

- Tool options and the values in about forty dialogs are remembered across sessions.
- Notices never block a click and fade when the pointer comes near, so they never cover the picture you are working on.

## 1.67.8 · 2026-10-13

### Added

- Clarity, Dehaze, Texture and Light as their own maskable adjustment layers, beside Develop. Light has Brightness, Contrast, Highlights, Shadows, Whites and Blacks; each looks the same at any zoom.
- File > Scripts: Delete All Empty Layers, Flatten All Layer Effects and Flatten All Masks, each one undoable step.
- File > Export > Layers to Files and Artboards to Files: prefix, visible layers only, trim, ICC profile, and PNG, JPEG, TIFF, WebP or PSD, with effects and masks applied. In the browser they download as a zip; on the desktop they go to a named folder in the exports folder. Agents can run both without the dialog.

## 1.67.7 · 2026-10-13

### Changed

- More of formvis is new code written independently from descriptions of what it does: adjustments, filters and the layer renderer, the project file format and its routes, and the desktop app's start-up.
- Unsharp Mask leaves fully transparent pixels as they are and rounds its result; an adjustment layer's result is rounded per channel.

### Fixed

- The Image Size and Canvas Size fields ignore a value that is not a number instead of applying it.

## 1.67.6 · 2026-10-13

### Added

- Brushes behave as is usual through the whole stroke: Flow lays the same build-up at any spacing, Opacity can follow pen pressure or Fade with each pixel kept at the highest opacity reached in the stroke (a hard press over a light one goes darker, repeated light presses never pass the light value), Fade on size, opacity and flow, and the start of a stroke eases in instead of jumping. The Brush tool starts with size following pen pressure, and the options bar has a pressure-for-opacity toggle.
- The desktop app reads the monitor's colour profile and draws the canvas through it (Linux, macOS, Windows); the browser build says it assumes an sRGB display.
- DNG camera profiles (`.dcp`) in Develop and on Camera Raw import, with a Profile choice.
- Proof Setup presets (profile, intent, black point compensation, paper and ink) and colour export presets.
- Docs and wiki pages for the terminal, agents, colour and brushes.

### Changed

- Changing a 16-bit document's mode to CMYK, Lab or Grayscale keeps 16 bits; DPX opens and exports at 16 bits; opening a file whose profile is missing or differs from the working space asks, as Color Settings says.
- One scrollbar sheet everywhere, plug-in panels included.

### Fixed

- Radial Blur grew the layer by 2,000 pixels on every side whatever its settings, so Surface Blur after it ran on a picture many times larger and the window froze; the growth now follows the blur's settings.
- Three small layout shifts: the Claude Code panel's log on opening and on reload, and the status bar's GPU and memory readouts.

## 1.67.5 · 2026-10-13

### Added

- One catalogue of everything formvis can do: 755 commands, each with a group, a description, when to use it, its parameters and whether Undo can reverse it. `./formvis cli list`, `describe` and `run` drive the open window from a terminal, and the engine serves the catalogue at `/api/commands`.
- Agents can list, describe and run any of those commands over MCP (`list_commands`, `describe_command`, `run_command`, `run_commands` as one undo step), plus `get_selection` and `get_layer_tree`; every tool says when to use it.
- Window > Agent Connect: turn outside agents on or off, set each one's policy (Allow all, Ask for risky steps, Deny), approve or decline steps Undo cannot reverse, follow the activity feed, Stop.
- Edit > Color Settings: working RGB, CMYK and Gray spaces, colour management policies, conversion options and the CMYK profile's ink limits, saved as presets.
- DPX film scans open and export, with log, printing-density and linear transfers.

### Changed

- Convert to Profile works at 16 bits through LittleCMS, with intent, black point compensation and dither, and a CMYK or grayscale document can now be converted, not only proofed.

## 1.67.4 · 2026-10-13

### Added

- A terminal in the window: Window > Terminal or Mod+J opens a dock of real shells at the bottom, with tabs, in the project folder with `./formvis` on the path.
- Claude Code inside formvis: Window > Claude Code finds your installed, signed-in Claude Code, runs it with formvis's MCP tools attached in Ask, Auto-accept edits or Plan mode, shows its messages, and mirrors every command it runs into a read-only Claude tab in the terminal dock. Without Claude Code installed, the panel says how to install it.
- The native renderer's command line, `formvis-render` (`info`, `composite`, `bench`), and the engine's `/api/native/status`, used when `FORMVIS_NATIVE` is set.
- Agent skills for this repository: `formvis-harness` for changing formvis, `formvis-driving` for editing pictures through a running formvis, and `formvis-colour-science`.
- Pen-like pressure from a touch screen that reports force, and from a Force Touch trackpad in the macOS app.

### Changed

- `./formvis counts --check` also fails when any style could draw a scrollbar.

## 1.67.3 · 2026-10-13

### Changed

- More of formvis is new code written independently from a behaviour description, behaving as before: the engine's layer types, the Magic Wand's colour test, the matte, the stroke commit, the perspective warp, the healing solver's neighbours and the filter worker; the link to the engine, picture decoding, how projects store masks and transforms, and the Filter dialog; and the engine service's settings, sessions, picture decoding, Remove Background, export and decode routes.

### Fixed

- Export names sent with a Windows path keep only the file name.

## 1.67.2 · 2026-10-13

### Changed

- More of formvis is new code written independently from a behaviour description, behaving as before: keyboard shortcuts and their display, the dialog frame with its confirm and name prompts, the menus and menubar, the tool options bar, the tool rail's colour well, and the link to a hosting NodeMode page.

### Fixed

- The foreground and background swatches no longer repaint on every refresh when a colour has fractional channels.

## 1.67.1 · 2026-10-13

### Changed

- More of formvis is new code written independently from a behaviour description, behaving as before: the Color Picker, the JPEG export sheet, the live-mask alert, notices, Canvas Size, Image Size, the selection amount dialog, Remove Background, the options' rows, the status bar and the document tabs.

### Fixed

- The Color Picker in a CMYK document: dragging in its field or hue strip now carries the inks along with the colour, so OK sets the colour that was dragged to (typing RGB already did).

## 1.66.9 · 2026-10-13

### Changed

- More of formvis is new code written independently from a behaviour description, behaving as before: the Crop and Move tools, and the engine's selection masks, undo history, view, transform boxes and document model. Undo and Redo name no step while one is still under way.

## 1.66.8 · 2026-10-12

### Changed

- More of formvis is new code written independently from a behaviour description, behaving as before: the engine's geometry, the layer tree, events, canvas surfaces and the print resolution written into exported PNG and JPEG files, the tool registry, and the Magic Wand, Hand, Zoom, Spot Healing, Eyedropper, Smear, Clone Stamp, Brush, Gradient, Shape, Lasso and Marquee tools. Their status-bar hints are reworded.

## 1.66.7 · 2026-10-12

### Changed

- The rest of formvis's core editing engine that came from its first release is now new code written independently from a behaviour description, behaving as before: the event plumbing, view commands (fit, zoom, pan), renaming, hiding, opacity and blend mode of layers, the brush stroke's start, region repaint, finish and cancel, Select All, Deselect and Inverse, the entry points of transforms, free distort, warps, gradients, shapes, pixel moves and selection transforms, the Eyedropper, the Clone Stamp's source and preview, the retouch tools' start, Spot Healing, new layers from pasted pixels, Crop, Cut, the selection nudge, the sample ring and export.

## 1.66.6 · 2026-10-12

### Changed

- More of formvis is new code written independently from a behaviour description, behaving as before: starting a move, transform or free distort of a layer, a mask or a group of layers (with its preview), Smudge and Liquify strokes, dragging a selection's outline, the options bar's W, H and scale fields, and the small pieces of opening, closing and switching documents, undo and redo, tools and the brush's right-drag, importing images, new adjustment layers, Copy, Layer via Copy, Flip Canvas, the eye column's drag and live dialog steps.

## 1.66.5 · 2026-10-12

### Changed

- More of formvis is new code written independently from a behaviour description, behaving as before: selection changes (new, add, subtract, intersect, Deselect and Reselect), Edit > Clear, Image > Adjustments > Invert, Select Layer's Pixels, the Magic Wand, Copy and Paste, the path every filter and adjustment takes to preview and apply (within a selection, on masks, growing past the layer's edge), Content-Aware Fill, and Image > Canvas Size and Image Size.

## 1.66.4 · 2026-10-12

### Changed

- More of formvis is new code written independently from a behaviour description, behaving as before: moving and duplicating selected pixels with the Move tool, Free Transform of selected pixels, Select > Transform Selection, snapping while moving, committing a move, rotation or transform of a layer, a group of layers or a mask, setting the transform by number, committing Smudge and Liquify strokes, the Gradient tool (all five shapes, dither, masks), Edit > Fill with Foreground or Background, Flip Layer, Nudge, picking the layer under a click, and Select > Modify > Expand and Contract.

## 1.66.3 · 2026-10-12

### Changed

- The layer-structure and layer-mask operations are new code written independently from a behaviour description: New Layer and New Folder, Duplicate, Delete (and Bake and Delete for clipped layers), moving and reordering in the Layers panel, Group, Move Out of Folder, Clipping Mask, Merge Down, Merge Layers and Merge Group, copying a layer to another open document, layer selection, and Add, Apply, Delete, Enable, Link and copy Layer Mask, Select > the mask's black areas, Remove Background's mask and masks made from a picture. They behave as before.

## 1.66.2 · 2026-10-12

### Added

- `./build_app` at the root builds the desktop app in one command on macOS and Linux: it checks Python, Node, Rust and (on Linux) the WebKitGTK libraries, installs whatever is missing, builds the window, freezes the engine into the app's sidecar, compiles the Tauri shell and bundles it, as `formvis.app` copied to Applications with a `.dmg` beside it on macOS, or a `.deb` on Linux. `--no-install`, `--install`, `--open` and `--clean` change what happens at the end; every step's output goes to `build_app.log`.

## 1.66.1 · 2026-10-08

### Added

- Layer > Vector Mask: Reveal All, Hide All, Current Path, Delete, Enable or Disable and Link or Unlink; Layer > Rasterize > Vector Mask draws it into the layer mask. A linked vector mask follows the layer's moves and transforms, every canvas change carries it, and the Paths panel lists it for the path tools to reshape. Saved in projects.

### Changed

- The history from 1.64.0 was rewritten: formvis's own code and docs throughout, the commits' authors, dates and order kept, the tags moved.

## 1.66.0 · 2026-10-08

### Added

- Layer > New Fill Layer > Solid Color..., Gradient... and Pattern...: a layer of one colour, a gradient or a pattern that covers the whole canvas and stays editable. It is made at once, in the foreground colour, the Gradient tool's gradient or the Pattern Stamp's pattern, with a dialog over it whose every change shows on the canvas: the name, and the colour; or the gradient, Style (Linear, Radial, Angle, Reflected, Diamond), Angle, Scale, Reverse, Dither and Align with Layer; or the pattern, Angle, Scale and Link with Layer. OK keeps it as one New Fill Layer step; Cancel takes it back, leaving nothing to redo. It comes with a layer mask as the target, revealing all, or made from the selection, which an aligned gradient or a linked pattern then fits; painting it paints the mask.
- Layer > Layer Content Options... shows that dialog again for a fill layer, as does a double-click on its thumbnail, and changes it as one Modify Fill Layer step; on an adjustment layer it shows the adjustment's settings.
- A fill layer stays endless: moved or transformed, it is drawn again over the canvas and its mask moves instead; Canvas Size and Image Size draw it again at the new size. Filters, adjustments and warps say how to change it instead (Layer Content Options, its mask, or rasterizing it), and painting its own content asks to rasterize it first.
- Layer > Rasterize > Rasterize Fill Content turns the selected fill layers into pixel layers, keeping their masks; Rasterize Layer and All Layers include them.
- Projects keep fill layers live, and PSD files carry them both ways as Solid Color, Gradient and Pattern fill layers: a gradient with its stops, style, angle, scale, Reverse, Dither and Align with Layer; a pattern with its pattern, which the PSD's patterns hold. A pattern fill's scale and angle, which the PSD writer cannot keep, are noted on saving.
- Fill layers work in 16-bit, 32-bit, Lab and CMYK documents, their floats or inks taken from each drawing; in CMYK the dialog's preview shows the fill as its inks will. Agents' get_document names their kind (fill:solid, fill:gradient or fill:pattern).

## 1.65.9 · 2026-10-08

### Added

- Edit > Search... (Ctrl+K) finds any command or tool from a few letters of its name in order (gblur for Gaussian Blur): the twelve best are listed with where each sits in the menus and its keys, names matching before menu paths; the arrow keys and Enter, or a click, run one, and a command that cannot run now shows dimmed; with nothing typed, what was last run from it comes first.

### Fixed

- Help > Keyboard Shortcuts: since 1.53.4 each row's name had been squeezed into a narrow column and its Remove button pushed under the next row, where it could not be clicked; the name, the keys and both buttons now have their own columns. Searching the list and changing a shortcut update its rows in place rather than building the list again.

## 1.65.8 · 2026-10-08

### Added

- File > Save a Copy... (Alt+Ctrl+S) saves a copy of the document to the library under another name, with Layers, or flattened into one layer without them; the document in its tab keeps its name, its library file and its unsaved changes.
- File > Revert puts back the document as last saved, read again from the library into the same tab, as one step that Undo takes back (with its paths and timeline); F12 in the desktop app, where browsers keep F12 for their developer tools.
- File > Close All and Close Others close every document, or every one but the current, in turn: each with unsaved changes is brought forward and asked about, with Apply to All when more are waiting, and Cancel stops there. Close Others is Alt+Ctrl+P; in the desktop app Close All is Alt+Ctrl+W, and Close Tab keeps Ctrl+W.
- File > Automate > Fit Image... resamples the image, its proportions kept, to fit within a width and a height in pixels, with Don't Enlarge, as one step; actions record it with its box, so Batch fits every file to it.

### Fixed

- Image Size and Fit Image on a document with a layer past 268 megapixels now say they cannot resample it yet; Image Size had made the canvas smaller and left that layer at its full size.

## 1.65.7 · 2026-10-08

### Added

- Edit > Toggle Last State (Alt+Ctrl+Z) undoes the last step, or brings back the one just undone.
- Edit > Paste Special: Paste in Place (Shift+Ctrl+V) puts the clipboard where it was copied from; Paste Into (Alt+Shift+Ctrl+V) pastes it as a new layer centred on the selection with a canvas-sized layer mask showing it only inside the selection, unlinked so the picture moves behind it; Paste Outside does the same with the mask showing it only outside. The selection becomes the mask. Pictures copied in other apps paste the same way.
- Edit > Stroke... strokes the selection's edge, or with no selection the edge of the layer's pixels: Width, Color, Location (Inside, Center, Outside), Mode, Opacity and Preserve Transparency. A whole width on a straight edge is crisp; corners outside are rounded; a selection on the canvas's border is stroked inside it.

## 1.65.6 · 2026-10-08

### Added

- Edit > Transform > Again (Shift+Ctrl+T in the desktop app, where browsers keep that key) repeats the last transform: the same move, scale, turn, flip or distortion applied again in the same place, so a layer turned about a point keeps turning about it. Alt+Shift+Ctrl+T repeats it on a copy of the selected layers, for step and repeat. A move, a handle's scale or turn, the options bar's values, a flip and a Skew, Distort or Perspective all count.
- Edit > Transform > Scale and Rotate: the Move tool's handles only scale, or every handle and the space outside the box turn the layer, until Enter or Escape (the status bar says which).
- Edit > Transform > Skew, Distort and Perspective: the free distort with handles at its corners and the middles of its sides; Skew slides a side along itself and a corner along one of its sides, Distort moves either anywhere, Perspective moves a corner and the other corner of that side apart; switching between them keeps the shape; Enter applies, as a step named after the mode.
- Edit > Transform > Rotate 180°, Rotate 90° Clockwise and Rotate 90° Counter Clockwise turn the selected layer, or the selected layers together, about their centre without resampling; the flips are in the same submenu. The quarter turns can be recorded in actions.
- Edit > Transform Layer, Free Transform, stands above the Transform submenu as is usual.

## 1.65.5 · 2026-10-08

### Added

- Image > Auto Tone (Shift+Ctrl+L), Auto Contrast (Alt+Shift+Ctrl+L) and Auto Color (Shift+Ctrl+B): Levels set from the active layer's own histogram, each channel stretched, the three stretched together so colours keep their balance, or each channel stretched with neutral midtones. Within a selection the selected part's histogram sets them and only that part changes.
- Image > Adjustments > Desaturate (Shift+Ctrl+U) turns the layer grey at each pixel's lightness; Equalize spreads its tones evenly from black to white; Replace Color... changes the colours clicked in the picture (Shift-click adds one, Alt-click takes one away, or pick it in Color) by Hue, Saturation and Lightness, with Fuzziness for how close counts, a box showing what is chosen, a Result colour you can also pick, and a live preview.
- Image > Image Rotation > Arbitrary... turns the canvas by any angle, clockwise or counter clockwise: the canvas grows to hold it, the Background's new corners take the background colour, and alpha channels and the selection turn with it.
- Image > Crop cuts the canvas to the selection's bounds.
- Image > Duplicate... opens a copy of the document under a name you give, with its paths and timeline, or with Duplicate Merged Layers Only as one layer of the picture as it shows.
- Auto Tone, Auto Contrast, Auto Color, Desaturate, Equalize and Crop can be recorded in actions.

## 1.65.4 · 2026-10-08

### Added

- Layer > Combine Shapes: with several shape layers selected, Unite Shapes, Subtract Front Shape, Intersect Shape Areas and Exclude Overlapping Shapes make them one shape layer, the front shapes joining the back one with that operation and staying editable; with one shape layer of several outlines, its outlines after the first take the operation. Merge Shape Components bakes the operations into plain outlines. Shapes moved, scaled or turned combine where they are.
- Layer > New > Artboard... asks for the new artboard's name, size and background; Layer > New > Artboard from Group... makes a folder an artboard over its contents, named and sized as you like.
- Layer > New > Frame from Layers puts each selected layer in a frame fitted to its pixels, as the Frame tool makes them.

### Fixed

- Shape Color from Foreground, Shape Fill and Stroke and editing a shape's path dropped the path operations of its outlines, so a shape with a hole, such as one from a PSD, came back filled.

## 1.65.3 · 2026-10-07

### Added

- Layer > Link Layers links the selected layers so they move together: dragging, nudging or transforming one moves the others, and a position lock on any of them stops the move. With linked layers selected it reads Unlink Layers. Layers duplicated together are linked to each other, not to the layers they copy.
- Layer > Select Linked Layers adds every layer linked to the selected ones to the selection.
- Layer > Lock Layers (Ctrl+/, Cmd+/ on a Mac) sets Transparency, Image, Position and All for all the selected layers at once; with a folder selected it is Lock All Layers in Group, for every layer in it.
- The Layers panel marks linked layers with a chain and locked layers with a lock (dimmed when only part is locked), and its foot starts with Link Layers. The layers' context menu has Link Layers and Select Linked Layers.
- Links are saved in `.fmv` projects and travel to and from PSD files as linked layers.

## 1.65.2 · 2026-10-07

### Added

- Bevel & Emboss has Technique (Smooth, Chisel Hard or Chisel Soft), its Stroke Emboss style, which raises the layer's stroke, and its two elements: Contour, the bevel's profile through a curve over a range, and Texture, a pattern pressed into the surface at a scale and a depth, inverted or not.
- Layer > Layer Style lists Blending Options and every effect; each opens the Layer Style dialog at that effect and turns it on.
- Layer > Layer Style > Global Light sets the document's light, the angle and altitude that every effect using Global Light shares.
- Layer > Layer Style > Create Layers turns the active layer's style into layers of their own that look the same: drop shadows, outer glows and outside strokes below the layer; overlays, satin, inner shadows and glows, inside strokes and an inner bevel clipped to it above; other bevels and center strokes above it, unclipped. The layer keeps no style.
- Layer > Layer Style > Hide All Effects hides every layer's style without removing it, and Show All Effects brings them back; the Layers panel strikes out the fx mark of a hidden style. Hidden styles stay hidden in `.fmv` projects and PSD files.
- Layer > Layer Style > Scale Effects scales the selected layers' styles, their sizes, distances and pattern scales, from 1 to 1000 percent.

### Changed

- A PSD layer style switched off in the file now opens hidden, where formvis left it out, and Bevel & Emboss keeps Chisel Hard, Chisel Soft and Stroke Emboss both ways, where formvis drew and wrote Smooth and Inner Bevel. A bevel's Contour and Texture are not read from or written to PSD files yet, and formvis says so when it meets one.

## 1.65.1 · 2026-10-07

### Added

- Select > Save Selection keeps the selection with the document as an alpha channel: a new channel, named as you like (Alpha 1 and so on otherwise), or one already there, replaced or added to, subtracted from or intersected with. It can go to another open document of the same size.
- Select > Load Selection loads an alpha channel, or the active layer's transparency or mask, inverted or not, as a new selection or added to, subtracted from or intersected with the selection.
- The Channels panel lists the document's alpha channels below its colour channels, each with its thumbnail. The eye shows one over the picture in red, as Quick Mask does; Ctrl-click (Cmd-click on a Mac) loads it, Shift adding, Alt subtracting and both intersecting, now for the colour channels too; a double-click renames it and its bin deletes it. The panel's foot has Load Selection and Save Selection as Channel.
- Alpha channels are saved in `.fmv` projects and recovery copies, and they turn, flip, crop, resize and warp with the canvas.
- Agents' `place_image` takes `path`, an absolute path to a PNG, JPEG or WebP file, so a picture on disk goes into the document without its base64; the layer is named after the file.

### Fixed

- Claude Code under MCP protocol 2026-07-28 (2.1.292 and later) loaded none of formvis's tools: `tools/list`, `prompts/list` and `server/discover` now carry the caching hints that version requires, `ttlMs` and `cacheScope`.
- After an agent's long tool call, such as a filter on a large picture, its next call was told formvis was not open. A window working through a call now counts as open, and the next call waits for it.
- An agent's `remove_background` said it had removed the background but left the layer without a mask and the Remove Background dialog open in the window. It now applies the mask at once with the dialog's settings, as one step, and says so when it cannot.
- The manual, AGENT_EVALS and LOCAL said agents get 39 tools; they get 50.
- The Channels panel showed the CMYK rows (since 1.54.2) and the Lab rows (since 1.56.4) in RGB documents.

The four agent fixes and the count come from a bug bounty run on 6 and 7 October 2026 while rehearsing an agent's edit over MCP; each was made again by hand on this code and checked here.

## 1.65.0 · 2026-10-07

### Added

- Select > Reselect brings back the selection the last Deselect dropped. It has no key yet; Keyboard Shortcuts can give it Shift+Ctrl+D.
- Select > Grow and Select > Similar add the pixels within the Magic Wand's Tolerance of the colours selected: those touching the selection (Grow) or anywhere in the picture (Similar), sampled from the layer or all layers as the Magic Wand's options say.
- Select > Transform Selection puts the Move tool's handles on the selection's outline alone, leaving the pixels where they are; Enter applies it as one step and Escape cancels.
- Select > Convert to Shape makes a shape layer in the foreground colour from the selection's outline, smoothed, its corners kept and its holes cut.
- Select > Find Layers (Alt+Shift+Ctrl+F) selects the layers whose names hold what you type, and Select > Isolate Layers lists only the selected layers in the Layers panel until you choose it again.

## 1.64.9 · 2026-10-07

### Added

- Layer > Layer Mask offers Reveal All and Hide All (whatever is selected), Reveal Selection and Hide Selection, and From Transparency, which turns the layer's transparency into its mask and makes its pixels opaque, the picture unchanged.
- Layer > Mask All Objects finds the objects in the layer on this computer and adds, above it, a folder holding an empty folder for each object, masked to that object, ready for adjustments; the picture stays as it was.
- Layer > Matting: Color Decontaminate (Amount and Radius, by the layer's mask, else its transparency), Defringe (Width), Remove Black Matte and Remove White Matte, each one step on the active layer's pixels.
- Layer > Rasterize: Type, Shape, Smart Object and Layer for the selected layers of that kind, and All Layers for every type, shape and smart object layer in the document.

### Changed

- Layer > Rasterize Layer moves into the new Rasterize submenu.

## 1.64.8 · 2026-10-07

### Added

- Layer > Arrange > Bring to Front (Shift+Mod+]) and Send to Back (Shift+Mod+[) move the selected layers to the top or bottom of their folder, keeping their order; Reverse swaps the selected layers' places end for end.
- Layer > Hide Layers hides the selected layers in one step; when they're all hidden it reads Show Layers.
- Layer > Delete > Delete Hidden Layers removes every hidden layer, with everything a hidden folder holds, in one step. Delete Layer moves into the same submenu.
- Layer > Merge Visible merges what you see into one layer named after the lowest visible layer, keeping pixels past the canvas. Hidden layers stay; a hidden layer inside a merged folder comes out above the merged layer instead of being lost. Each artboard merges its own visible layers, inside it. It has no key, since Shift+Mod+E is Export PNG here; Keyboard Shortcuts can give it one.
- Layer > Ungroup Layers puts a folder's layers where the folder was, in their order, and removes the folder; they become the selection, and a hidden folder's layers come out hidden.
- Layer > New > Layer via Cut (Shift+Mod+J): the selection's pixels move to a new layer in place, cleared from the layer they came from, in one step. Layer via Copy (Mod+J) is now in the same submenu.
- Layer > New > Group from Layers puts the selected layers in a new folder you name, and Layer from Background turns the Background into an ordinary layer (Layer 0 by default) with the New Layer dialog's mode and opacity, its locks cleared.
- Select > All Layers (Alt+Mod+A) selects every layer and folder; Select > Deselect Layers leaves none selected.

### Changed

- The Layer menu follows the usual order: Arrange, Align, Distribute and Flip come before Merge Down, Merge Visible and Flatten Image, which end the menu. In a window 900 pixels tall the menu now scrolls to its last rows.
- Mod+J's command is named Layer via Copy wherever it shows; without a selection it still duplicates the layer.

### Fixed

- An artboard now hides what its layers hold past its edges, as it was meant to. Before, a layer reaching past an artboard showed outside it.
- A submenu that opened under the pointer as its menu appeared could close at once when that menu had been scrolled the time before.
- The Actions list names a step that toggles (Disable Layer Mask, Hide Layers) as it was when recorded, not as its opposite.

## 1.64.7 · 2026-10-07

### Added

- The Filter Gallery's Sketch folder, in the foreground and background colours (Bas Relief, Chalk & Charcoal, Charcoal, Chrome, Conté Crayon, Graphic Pen, Halftone Pattern, Note Paper, Photocopy, Plaster, Reticulation, Stamp, Torn Edges and Water Paper), and its Texture folder (Craquelure, Grain with ten grain types, Mosaic Tiles, Patchwork, Stained Glass and Texturizer): the gallery now holds all 47 of its effects in six folders.

## 1.64.6 · 2026-10-07

### Added

- The Filter Gallery's Brush Strokes folder (Accented Edges, Angled Strokes, Crosshatch, Dark Strokes, Ink Outlines, Spatter, Sprayed Strokes and Sumi-e), its Distort folder (Diffuse Glow in the background colour, Glass with four textures, Ocean Ripple) and its Stylize folder (Glowing Edges): twelve more effects, 27 of the gallery's 47, each stackable with the others and available to agents.

## 1.64.5 · 2026-10-07

### Added

- Filter > Filter Gallery: a wide dialog with its own preview (Fit in View, 25% to 200%, dragged to look around), the effects in folders with thumbnails made from your picture, the chosen effect's settings, and a stack of effect layers: add one (a copy of the selected, above it), delete, move up or down, and show or hide each; the stack applies bottom first as one undo step. This release brings the Artistic folder's fifteen effects: Colored Pencil, Cutout, Dry Brush, Film Grain, Fresco, Neon Glow, Paint Daubs, Palette Knife, Plastic Wrap, Poster Edges, Rough Pastels, Smudge Stick, Sponge, Underpainting and Watercolor. Like the other filters it works inside a selection, as a smart filter, with Last Filter and Fade, in actions, on large layers in bands, and for agents (apply_filter with filterGallery).

## 1.64.4 · 2026-10-07

### Added

- Edit > Fade (Shift+Mod+F): right after a filter, an adjustment, a fill or a brush stroke on a layer's pixels, fade its result back toward what was there, with an opacity and any of the 27 blend modes, previewed live; one undo step named after what it fades. In 8-bit RGB documents.
- Filter > Last Filter (Mod+F, a long-standing key; Keyboard Shortcuts can move it to Alt+Mod+F, its current one): the first item of the Filter menu repeats the last filter you applied, with the same settings, and shows its name.
- Filter > Blur Gallery > Spin Blur: blurs along arcs around a centre, inside an ellipse whose size, rotation and blur angle you set; it previews live, works as a smart filter, records in actions, and can be applied by agents.

## 1.64.3 · 2026-10-07

### Added

- Filter > Render: Flame (six flame types along the path you choose, or an arc low in the picture when there is none), Picture Frame (sixteen frames) and Tree (19 kinds of tree), listed first in the submenu. Each has a Randomize for its arrangement, previews live, works as a smart filter, records in actions (Flame with its path, so the action still plays after the path is gone), and can be applied by agents.

### Changed

- Clouds, Fibers, Flame, Picture Frame and Tree now work on a new, empty layer, which is given pixels for them (in 8-bit RGB documents). Filters that change the pixels already there, Difference Clouds, Lens Flare and Lighting Effects among them, still need some.

## 1.64.2 · 2026-10-07

### Added

- Filter > Stylize: Diffuse, Emboss, Extrude, Find Edges, Oil Paint, Solarize, Tiles, Trace Contour and Wind.
- Filter > Render: Clouds and Difference Clouds (between the foreground and background colours, a new pattern each time), Fibers (with Randomize), Lens Flare (four lens types) and Lighting Effects (one spot, point or infinite light in any colour, with an optional texture from a channel).
- Like the filters before them, each previews live, works as a smart filter, records in actions, and can be applied by agents.

### Changed

- On very large layers, more filters now run a strip at a time, with the same result: Color Halftone, Crystallize, De-Interlace, Mezzotint, Mosaic, Pointillize and Reduce Noise with its JPEG option, and most of the new ones.

## 1.64.1 · 2026-10-07

### Added

- Filter > Distort: Displace (with any open document as the map), Pinch, Polar Coordinates, Ripple, Shear, Spherize, Twirl, Wave (with Randomize) and ZigZag. As is usual, they work around the selection's bounds, or the whole canvas without one.
- Filter > Pixelate: Color Halftone, Crystallize, Facet, Fragment, Mezzotint, Mosaic and Pointillize (its dots sit on the background colour).
- Like the filters before them, each previews live, works as a smart filter, records in actions, and can be applied by agents.

### Fixed

- Filters with a dialog now work on a smart object from the Filter menu: they're added as smart filters. Before, formvis asked to rasterize the object instead. Editing a smart filter from the Smart Filters window had the same problem and now works too.
- Offset now wraps inside the selection, or inside the canvas without one. It used to wrap around the whole layer.
- De-Interlace's odd and even lines, and Reduce Noise's JPEG grid, now line up with the document, even on a layer that has been moved.

## 1.64.0 · 2026-10-07

### Added

- Twenty-one filters, the first stage of a filter library declared in one place: Filter > Blur gains Average, Blur, Blur More, Box Blur, Shape Blur (nine shapes) and Smart Blur (Normal, Edge Only and Overlay Edge); Filter > Sharpen gains Sharpen, Sharpen More and Sharpen Edges; Filter > Noise gains Despeckle, Dust & Scratches, Median and Reduce Noise (with JPEG artifact removal); a new Filter > Other holds Custom (your own 5 by 5 kernel), HSB/HSL, High Pass, Maximum, Minimum and Offset; a new Filter > Video holds De-Interlace and NTSC Colors.
- Each previews live, works as a smart filter, records in actions with its settings (Average too), runs on very large layers a strip at a time with the same result, and works in 16 and 32-bit, CMYK and Lab documents. Agents apply them by name through formvis's tools.

### Changed

- The Blur, Noise and Sharpen submenus list their filters alphabetically, and Noise now comes before Sharpen.
- In the Actions window, the Dialog toggle no longer shows on steps for filters that have no dialog.

## 1.63.0 · 2026-10-03

### Added

- A 600 megapixel document (30,000 by 20,000) can be edited whole on a computer with 4 GB of memory: painted, filtered across the whole picture, undone and redone, saved, reopened and exported, every pixel as it should be. A filter over a whole picture this size takes about eleven minutes and its undo about five; a photograph this size needs several GB of free disk while it is filtered.
- `./formvis bench` also reports whether such a document is drawn by the graphics processor.

### Fixed

- Parts of a very large picture moved to disk no longer stay in memory too, which could make the page run out of memory and close.
- Closing a very large document after a filter no longer holds up opening the next one for minutes.
- Long brush strokes on very large pictures use far less memory.

## 1.62.9 · 2026-10-03

### Changed

- Documents larger than a browser canvas holds are drawn by the graphics processor where one is available, a piece at a time, using smaller copies when zoomed out so its memory stays about one screen's worth at any zoom. A mask, clipping mask or layer style on such a document keeps it on the slower display.

## 1.62.8 · 2026-10-03

### Added

- Documents larger than a browser canvas holds save to the library and open again, every pixel as it was; untouched background costs nothing when reopened. Save them yourself: recovery copies are not kept for documents this large, as each takes minutes to write.

### Fixed

- A new layer on such a document could not be painted (it needed a canvas larger than a browser can make); it now paints like the first.

## 1.62.7 · 2026-10-03

### Added

- Gaussian, Motion, Surface and Lens Blur and Unsharp Mask work on documents larger than a browser canvas holds, a strip at a time, with their undo kept on disk as they go so memory stays small; editing waits until the filter finishes, and says so. On such documents a blur's spread past the canvas edge is not kept.

## 1.62.6 · 2026-10-03

### Added

- Documents larger than a browser canvas holds export as PNG, including parts kept on disk, with memory held in bounds throughout (a 600 megapixel picture exported on a computer with 4 GB of memory).

## 1.62.5 · 2026-10-03

### Added

- The Brush, Pencil and Eraser paint documents larger than a browser canvas holds, exactly as on any other document, and undo them. Brush Settings, the Mixer Brush, painting inside a selection and painting masks on such documents come later, and say so.

## 1.62.4 · 2026-10-03

### Added

- A very large document's parts that are out of view are kept on disk by formvis's engine once they would take too much memory, each with a small preview shown at once while the full part loads back.

## 1.62.3 · 2026-10-03

### Added

- New documents larger than one browser canvas holds (up to 65,535 pixels a side; a 30,000 by 20,000 picture is 600 megapixels) open, zoom and pan, kept in tiles that cost memory only where something is drawn. Painting, filters, export and undo on them come in the next releases, and formvis says so when you try.

### Fixed

- An operation that would need a canvas larger than a browser can hold now stops with a plain message, rather than working on a canvas that silently draws nothing.

## 1.62.2 · 2026-10-03

### Added

- The groundwork for pictures larger than a browser can hold in one piece (past 268 megapixels): a layer kept as tiles, made only where something is drawn. Nothing uses it yet; the next releases bring it to opening, viewing, painting, filters, export and undo.

## 1.62.1 · 2026-10-03

### Fixed

- On a Mac, `./formvis install` left out six Python packages formvis needs, so formvis's engine could not start, and with it local generation, PSD and TIFF files, and API keys in the system password store. Run `./formvis install` once to add them.

## 1.61.9 · 2026-10-03

### Changed

- `./formvis help` names the version in its first line, so a copy that missed an update says so.
- docs/BENCH.md: on an Apple M5 MacBook Air, both graphics-processor paths draw what the CPU draws (every value within 4 levels, the largest difference 3).

## 1.61.8 · 2026-10-03

### Added

- `./formvis verify-local`: formvis's local image models (Krea 2 and FLUX.2 [klein] 4B) each make one picture on your computer, timed, with the results written to bench-results/ to send back. Each model's licence is shown and accepted only by you, and its download size is stated and fetched only on your yes; `--small` takes the smaller builds.

## 1.61.7 · 2026-10-02

### Added

- `./formvis bench` also checks that each graphics-processor path draws what the CPU draws, and says whether it matches.
- docs/BENCH.md: the first benchmark on real hardware, an Apple M5 MacBook Air, where every graphics-processor path draws a frame in about a millisecond.

## 1.61.6 · 2026-10-02

### Fixed

- `./formvis bench` on a Mac said the window server had not started when it had (it looked for it on the wrong address); if the server really cannot start, it now shows the server's own reason.

### Changed

- `./formvis bench` runs in the background with no window, with the graphics processor switched on, and says plainly if the browser drew in software instead (then `./formvis bench --window` measures with a window).

## 1.61.5 · 2026-10-02

### Added

- `./formvis bench`: times formvis's drawing on your computer's graphics in a Chrome window (the same tests as Help > Performance Benchmark), records the computer, browser and graphics adapter, and writes the results to bench-results/ to send back.

## 1.61.4 · 2026-10-02

### Fixed

- A blur on a very large picture straight after painting could be refused for memory: formvis now clears its spare painting surfaces and moves earlier undo steps to disk first when it needs the room.

### Added

- A test of a 150 megapixel picture painted, blurred, saved, reopened and exported in one session within the memory budget (run with `FORMVIS_LARGE=1`; it takes a few minutes).

## 1.61.3 · 2026-10-02

### Changed

- A blur on a very large picture keeps its undo on disk once done, so a 150 megapixel Gaussian Blur now runs, and undoes exactly, on a computer with 4 GB of memory.
- Preferences > Performance: history memory is set automatically from your computer's memory unless you choose a figure with its slider (a tick box returns it to automatic).

### Fixed

- A change to the whole of a very large layer could not be undone: history memory dropped its step the moment it ended.

## 1.61.2 · 2026-10-02

### Added

- Exporting a very large picture as PNG works a strip at a time, written by formvis's engine as it comes, with the same pixels as before: a 150 megapixel picture now exports on a computer with 4 GB of memory.

## 1.61.1 · 2026-10-02

### Fixed

- Filters that work on the whole picture at once now check for the memory they really need (measured for each: from twice the picture's size for Add Noise to nineteen times for Lens Blur, where two had been assumed for all), so a filter too big for the computer is refused with the reason rather than running out of memory.

## 1.60.9 · 2026-10-02

### Changed

- Gaussian, Motion, Surface and Lens Blur and Unsharp Mask on very large layers run a strip at a time, with the same result pixel for pixel, using far less memory (a 49 megapixel Gaussian Blur peaked at 0.4 GB rather than 2.1).

### Fixed

- A filter refused for want of memory is reported as refused, with the reason, rather than as applied.

## 1.60.8 · 2026-10-02

### Changed

- Older undo steps of long painting sessions are kept on disk by formvis's engine once they would take too much memory, and brought back when you undo that far (a fraction of a second a step). Undo and redo always happen in the order you press them.

## 1.60.7 · 2026-10-02

### Changed

- Undo keeps far less for long strokes: only the parts of the picture a stroke changed, not the whole rectangle it spanned (a diagonal stroke across a 24 megapixel layer: 36 MB rather than 158).

## 1.60.6 · 2026-10-02

### Changed

- Painting on very large layers (past 16 megapixels) uses memory only around where you paint rather than the whole layer's size again, so a 150 megapixel picture can be painted on a computer with 4 GB of memory. The result is the same, pixel for pixel. If a stroke would run past what this computer allows, it stops there and says so.

## 1.60.5 · 2026-10-02

### Changed

- Large documents use far less memory: the History panel's automatic first snapshot, a full copy of the picture, is skipped when it would take too much of this computer's memory (New Snapshot still takes one), and painting no longer keeps big spare canvases around. A 150 megapixel document now needs about 1 GB rather than 1.6.

## 1.60.4 · 2026-10-02

### Changed

- Closing a document gives its memory back straight away (measured: a 150 megapixel document's 1.3 GB within three seconds), and formvis's memory reading now matches what the browser really holds, so it refuses work before the computer runs short.

## 1.60.3 · 2026-10-02

### Added

- The Markup tool (with Note and Count, I): drag to add an arrow, a callout pointing at something, a highlight or a redaction box, each its own editable layer in the colour and width you choose.
- Apply Redactions (in the tool's options and Layer > Shape): every redaction box is burned into the pixels of each layer beneath it, so what it hides is gone from layered files too, not only covered.

## 1.60.2 · 2026-10-02

Very large documents, first step (the register's M5).

### Changed

- formvis now knows how much memory its pictures use and how much this computer allows it (shown in the status bar). A stroke, filter, duplicate or new document that would not fit is refused with a message saying what it needs and what to do, instead of the browser closing the page. Agents get the same reason.

## 1.60.1 · 2026-10-02

### Added

- Fades with black or white in the timeline (Add Transition, Fade to): the clip turns to that colour at its edge instead of becoming transparent. Agents can ask for them too.

## 1.59.9 · 2026-10-02

### Changed

- Moving a layer whose position is animated (dragging it with the Move tool, or the arrow keys) keys its new place at the playhead, in one undo step; its box and handles show where the layer is seen at that moment.

## 1.59.8 · 2026-10-02

### Added

- Window > Timeline on a document without a timeline offers both kinds, as Photon does: Create Video Timeline or Create Frame Animation (which starts with one frame of the document as it is).

### Changed

- Split at Playhead and Convert to Frame Animation are each one undo step; undoing Convert brings the video timeline back.

## 1.59.7 · 2026-10-02

The video timeline for agents (DEV_PLAN 25.5).

### Added

- formvis's MCP server gains eleven timeline tools, so Claude Code, Codex, Cursor and other agents can make and edit animations: read the timeline, create or delete it, set its frame rate, length and work area, move the playhead, move, trim and split clips, key position, opacity, fill and style, add fades and cross fades, look at any frame, and render MP4, GIF or a PNG sequence to a file. Each edit is an ordinary undo step.

## 1.59.6 · 2026-10-02

Transitions and Render Video (DEV_PLAN 25.4).

### Added

- Add Transition in the timeline: Fade In, Fade Out, both, and Cross Fade between overlapping clips (the picture never dips between them), each with its length; the clips show their fades.
- File > Export > Render Video (and Render in the timeline): MP4, an animated GIF or a PNG sequence, of every frame, the work area or a range, at full, half or quarter size.

### Known

- Fades from black or white are not offered yet.

## 1.59.5 · 2026-10-02

Undo for the video timeline.

### Added

- Timeline edits undo and redo like any other: creating or deleting a timeline, keyframes made, deleted, moved or switched between smooth and hold, clips moved or trimmed (a whole drag as one step), Split at Playhead, and the frame rate and length. Moving the playhead is not an edit.

## 1.59.4 · 2026-10-02

Keyframes in the video timeline (DEV_PLAN 25.3).

### Added

- Open a track in the timeline to see its keyframe lanes: Position X and Y, Opacity, Fill Opacity and Style. Turn on a lane's stopwatch and type values at different moments to animate them; step between keyframes, add or delete them at the playhead, drag them in time, and right-click one to hold its value until the next.

## 1.59.3 · 2026-10-02

The video timeline's panel (DEV_PLAN 25.2, the timeline to work like Photon Studio's).

### Added

- File > Create Video Timeline opens a timeline under the canvas: play, step and scrub through time (the canvas shows each frame), a track per layer whose clip you drag to move and trim at either end, Split at Playhead, the timecode and Go to Time, the frame rate and length, zoom and Fit, Convert to Frame Animation and Delete Timeline. Video (MP4) exports it.

### Known

- Timeline edits are not undo steps yet; keyframe lanes come next.

## 1.59.2 · 2026-10-02

The video timeline's foundation (DEV_PLAN 25.1, the timeline to work like Photon Studio's).

### Added

- Documents can hold a video timeline: a frame rate and length, a work area, and per layer a clip (when it shows), keyframes of position, opacity, fill opacity and style (smooth or held), and fades at the clip's ends. It is saved with the project, converts to a frame animation, and Video (MP4) renders it. Its panel comes next.

## 1.59.1 · 2026-10-02

### Fixed

- Opening a document with many layers no longer pushes the Layers panel's buttons out of sight: the panel keeps its size, its list scrolls, and nothing in the panels moves as documents open or tabs change.

## 1.58.9 · 2026-10-02

Video (the parity plan's L1, the last open row).

### Added

- File > Video Frames to Layers: choose a clip, trim it with From and To (and keep every Nth frame if you like), and each frame becomes a layer of a new document, with a frame animation that plays them at the clip's speed.
- File > Export > Video (MP4): the animation written as an H.264 video, each frame for exactly its delay.

### Known

- Video needs ffmpeg installed (macOS: brew install ffmpeg; Windows: winget install ffmpeg), or FORMVIS_FFMPEG set to it; formvis does not bundle it.
- A clip arrives as frames on layers; a single layer that plays a clip is not offered.

## 1.58.8 · 2026-10-02

The library in any folder, synced ones included, with conflict-safe saves (the parity plan's L13).

### Added

- Preferences > File Handling: choose where the library lives, formvis's own folder, a synced one found on this computer (iCloud Drive, Dropbox, OneDrive, Google Drive) or any folder, and move your projects there.
- Saving never overwrites a newer copy: if a project changed in the library since you opened it (another device's copy synced in, or another window saved), that version is kept and yours is saved beside it as a conflict copy, and formvis says so.

### Changed

- The README's line counts follow the code again.

### Known

- A share link is out of scope while formvis has no server.

## 1.58.7 · 2026-10-01

A compact layout for phones and narrow windows (the parity plan's L12, second part, which closes the row).

### Added

- Under 720 pixels wide the canvas takes the whole width, and the tools, the panels and the properties column slide over it as sheets, opened one at a time from buttons in the title bar; tap the canvas to close one. The menu bar and the options bar scroll sideways.

### Known

- In the compact layout the title bar's zoom buttons (pinch instead), theme toggle, command search and workspace picker are hidden; all are in the menus and Preferences.

## 1.58.6 · 2026-10-01

Touch gestures (the parity plan's L12, first part).

### Added

- On a touch screen: pinch to zoom about your fingers, drag two fingers to pan, turn them to rotate the view (past a small angle, so a pinch never turns it), tap two fingers to undo and three to redo. One finger works the tool as before; a second finger arriving mid-stroke cancels that stroke instead of leaving a mark.

## 1.58.5 · 2026-10-01

fal is the cloud default; without a key, this computer.

### Changed

- Generate Image, Generative Fill and Upscale open on fal when it has a key, since fal reaches the most image models through one key; without a fal key they open on a model on this computer when one is ready. A model you choose stays chosen. OpenAI, Google, Black Forest Labs and Ideogram are there to choose, never chosen for you.

### Fixed

- Generative Fill could open on LaMa even with a fal key.

## 1.58.4 · 2026-10-01

More generation providers (the parity plan's L7).

### Added

- Edit > Generate Image works with OpenAI (GPT Image), Google (Gemini image), Black Forest Labs (FLUX1.1 [pro]) and Ideogram (Ideogram 3.0) beside fal, each with its own API key, entered in the dialog and kept in your system's password store (or taken from the provider's usual environment variable).
- The engine can also fill a masked area through OpenAI or Black Forest Labs.

### Known

- Tested here against stand-in servers that answer as each provider documents; trying them with real keys is yours.

## 1.58.3 · 2026-10-01

Vanishing Point (the parity plan's L6, second part, which closes the row).

### Added

- Filter > Vanishing Point: draw a perspective plane by clicking its four corners (a grid shows its perspective; drag the corners to fit), paste another layer onto the plane in perspective and slide it along, and clone in perspective with the Stamp (Alt-click a source, then paint). OK applies it all as one step.

### Changed

- The README's line counts follow the code again.

## 1.58.2 · 2026-10-01

Photomerge and Merge to HDR (the parity plan's L6, first part).

### Added

- File > Automate > Photomerge: overlapping photos stitched into a panorama (Auto, projected onto a sphere, or Reposition, moved and turned only), with transparent edges or cropped to the picture, opened as a new document.
- File > Automate > Merge to HDR: exposures of one scene merged into a 32-bit picture whose highlights run past white; photos taken by hand are aligned first, and exposure times come from EXIF or are worked out from the photos.

### Known

- The Perspective, Cylindrical and Collage layouts are not offered (the OpenCV build used does not expose them).

## 1.58.1 · 2026-10-01

Opening Lab files (DEV_PLAN 22.11), which completes the parity plan's H1: every mode and depth works throughout.

### Added

- Lab TIFF (8 and 16 bits) and Lab PSD files open as Lab documents, a PSD with its layers in place and a 16-bit file at 16 bits.

## 1.57.9 · 2026-10-01

CMYK and Lab: profiles, the Channel Mixer on inks, and Lab's channels alone (DEV_PLAN 22.11). Every command now works in every mode and depth.

### Added

- Assign Profile and Convert to Profile in CMYK documents: Assign shows the same inks through another press; Convert changes the inks to look the same on it, keeping black text black only. Each is one step.
- Convert to Profile from a Lab document, through RGB; Assign Profile there opens it, since Lab colours are absolute.
- The Channel Mixer in CMYK documents mixes the inks: each output ink from Cyan, Magenta, Yellow, Black and a constant.
- In Lab documents, clicking Lightness, a or b in the Channels panel shows that channel alone on the canvas.

## 1.57.8 · 2026-10-01

CMYK and Lab: 16 and 32 bits, proofing and HDR exports (DEV_PLAN 22.11).

### Added

- 16 Bits/Channel in CMYK and Lab documents: they stay CMYK or Lab, and Export TIFF writes 16-bit CMYK (with its profile) or 16-bit CIELab.
- 32 Bits/Channel from any document: CMYK and Lab go through RGB first, Bitmap through Grayscale, Indexed Color through RGB.
- Proof Setup, Proof Colors and Gamut Warning in CMYK and Lab documents.
- Export Radiance HDR and OpenEXR from any document; below 32 bits they hold the picture as linear light.
- The document tab shows the real depth in every mode.

## 1.57.7 · 2026-10-01

Every adjustment layer in 32-bit documents (DEV_PLAN 22.11).

### Added

- All adjustment layers work in 32-bit documents. Each acts on a pixel's colour as it shows within the visible range, and light above white keeps its brightness: a highlight brighter than white changes colour without losing its light. Every command now works in 32-bit documents, as in 16-bit ones.

### Changed

- The README's line counts follow the code again.

## 1.57.6 · 2026-10-01

Select > Sky and Select > Focus Area (the parity plan's L5).

### Added

- Select > Sky: a sky model on this computer selects the sky, soft at its edges (176 MB, MIT, from Preferences > Plugins > Local models).
- Select > Focus Area: selects the in-focus parts of the picture from local sharpness, with In-Focus Range, Image Noise Level and Soften Edge and a live preview.

## 1.57.5 · 2026-10-01

Grayscale at every depth and from every mode (DEV_PLAN 22.11).

### Added

- Image > Mode > Grayscale in 16-bit documents (keeping 16 bits) and 32-bit documents (luminance in linear light, light above white kept). Every command now works in 16-bit documents.
- Grayscale from a Lab document takes its Lightness.
- Grayscale, Bitmap and Indexed Color from CMYK documents, and Bitmap, Indexed Color and CMYK Color from Lab documents, going through RGB first.

## 1.57.4 · 2026-10-01

Remove finds people and distractions (the parity plan's M1).

### Added

- The Remove tool's Remove People and Remove Distractions: models on this computer find the people other than the subject (faces, then each person's outline), and for distractions also the salient objects other than the subject; LaMa fills them, continuing the scene, as one step. The subject is the person whose face is clearly the largest. Needs the face finder, Segment Anything 2 and LaMa from Preferences > Plugins > Local models.

## 1.57.3 · 2026-10-01

The modes that were withheld, and the ones to check, closed (DEV_PLAN 22.11).

### Added

- Image > Mode > Indexed Color, Bitmap and CMYK Color from 16- and 32-bit documents: the document comes down to 8 bits first, from 32 bits through HDR Toning, then the mode's own dialog. Lab Color from 16-bit documents converts from their 16-bit values; from 32 bits it comes down to 16 first.
- Every blend mode in 32-bit documents. The modes offered at 32 bits keep light above white; the others blend in the visible range, and light above white is kept wherever only one of the two layers covers a pixel.
- Exposure and HDR Toning in CMYK and Lab documents, and Channel Mixer in Lab documents, with the same results as in RGB.
- Assign Profile, Convert to Profile, Proof Setup, Proof Colors and Gamut Warning in 32-bit documents; Convert to Profile converts linear light exactly through the two profiles' primaries, light above white included.

### Fixed

- 1.57.1's note listed Darker Color and Lighter Color among the blend modes offered at 32 bits; the right list is Normal, Dissolve, Darken, Multiply, Lighten, Linear Dodge (Add), Difference, Hue, Saturation, Color and Luminosity. formvis offers all of them.

### Known

- Still to come: Grayscale at 16 and 32 bits, the adjustment layers other than Exposure at 32 bits, and in CMYK the Channel Mixer on inks, profiles and proofs, and 16 bits.

## 1.57.2 · 2026-10-01

The last of the mode gates decided (DEV_PLAN 22.10).

### Added

- Unsharp Mask and Add Noise in 32-bit documents: light above white is sharpened and kept rather than clipped.
- HDR Toning in 16-bit documents.

## 1.57.1 · 2026-10-01

32-bit documents on the one compositor (DEV_PLAN 22.10).

### Added

- 32-bit documents gain groups, layer and folder masks, clipping masks, layer styles and blend modes, composed in linear light with light above white kept: Normal, Dissolve, Darken, Multiply, Lighten, Linear Dodge (Add), Difference, Darker Color and Lighter Color, the modes offered at 32 bits. The canvas and exports show the linear composite, clipped at white on screen.

### Fixed

- Linear Dodge (Add) now composes in 16-bit, CMYK and Lab documents too.

### Known

- At 32 bits the other blend modes and the adjustment layers other than Exposure still wait, named in the menus or when exporting.

## 1.56.9 · 2026-10-01

Layer styles in 16-bit, CMYK and Lab documents (DEV_PLAN 22.10).

### Added

- Layer styles (drop shadow, stroke, glows, overlays, bevel, satin) work in 16-bit, CMYK and Lab documents, in the canvas and every export. The layer's own pixels keep their full precision wherever the style draws nothing; the style's pixels come in through the document's colours (in CMYK the profile's separation, so a black stroke prints as the profile's black). In CMYK and Lab documents with styles the canvas shows the colours as they will print.

### Known

- 32-bit documents still wait for layer styles.

## 1.56.8 · 2026-10-01

The remaining mode gates (DEV_PLAN 22.10), and Lab's colour adjustments.

### Added

- 32-bit documents: painting, the retouching tools and the filters not yet on the float model now work. Pixels an operation leaves alone keep their values exactly, light above white included; changed pixels take the new colour in linear light and keep their old light where the change is small. What still waits is named in the menus: groups, masks, clipping, layer styles, blend modes and adjustment layers other than Exposure, Unsharp Mask and Add Noise, the other colour modes, and profiles and proofs.
- Lab documents: Hue/Saturation, Black and White, Color Balance and the other colour adjustments, with the same results as in RGB; Levels, Curves, Invert and Posterize act on Lightness, a and b themselves. Channel Mixer, Exposure and HDR Toning still wait.

### Known

- In 32-bit documents, painting a colour the screen already shows for light above white (white over a bright highlight) leaves that light as it was and does not set it to white.

## 1.56.7 · 2026-10-01

Face-Aware Liquify (the parity plan's M3, second part, which closes the row with the Freeze Mask).

### Added

- Face-Aware Liquify in Filter > Liquify: Find faces locates each face and its eyes, nose and mouth on this computer (YuNet, 232 KB, MIT, fetched on first use from Preferences > Plugins > Local models), and eleven sliders reshape the largest: Eye Size, Height and Distance; Nose Height and Width; Smile, Mouth Width and Height; Forehead, Chin Height and Face Width. They respect the Freeze Mask and combine with the brushes; OK applies everything as one step.

### Known

- Eye Tilt, Eye Width, Upper and Lower Lip and Jawline need a face model with more landmarks and wait for one.

## 1.56.6 · 2026-10-01

Lab documents, second part (DEV_PLAN 22.9).

### Added

- Levels and Curves layers in Lab documents, on Lightness, a and b.
- Blend modes in Lab documents: they look as they do in RGB, the result kept in Lab.
- Export TIFF from a Lab document writes a Lab TIFF (8-bit CIELab, laid on white).

### Fixed

- In CMYK and Lab documents with adjustment layers or blend modes, exports, thumbnails and the Channels panel now show what the canvas shows.

### Known

- Still waiting in Lab documents: the other adjustment layers, layer styles, viewing or painting one channel alone, opening Lab TIFF and Lab PSD files.

## 1.56.5 · 2026-10-01

Liquify's Freeze Mask (the parity plan's M3, first part; DEV_PLAN 23.5).

### Added

- Liquify's Freeze Mask and Thaw Mask: paint over what must not move, shown in translucent red, and every Liquify tool leaves it still, Reconstruct included; Thaw Mask frees it again. Mask None clears the mask and Invert Mask swaps frozen and free.

## 1.56.4 · 2026-10-01

Lab documents, first part (DEV_PLAN 22.9).

### Added

- Image > Mode > Lab Color: an 8-bit RGB document converts to CIE Lab (D50) held as floats, and back to RGB Color exactly. Painting, text, shapes, fills, filters and the other tools work in it, the pixels they leave alone keeping their Lab exactly. The Channels panel shows Lab, Lightness, a and b; Info reads L, a and b; project files keep the Lab values.

### Known

- Not yet in Lab documents: adjustment layers, blend modes other than Normal, layer styles, viewing or painting one channel alone, and Lab TIFF and PSD files; they wait in the menus. Exports go through the sRGB rendition.

## 1.56.3 · 2026-10-01

The Art History Brush (the parity plan's L4, second part, which closes the row with the Mixer Brush).

### Added

- The Art History Brush (Y, with the History Brush): paints stylised strokes in the colours of the History Brush's source snapshot, so brushing over a picture turns it into a painted version of itself. Ten styles (Tight and Loose, Short, Medium and Long, Dab, and four curls), strokes a quarter of the brush wide and running along the picture's contours, and Tolerance to leave alone the parts already close to the source.

### Changed

- The README's line counts follow the code again.

## 1.56.2 · 2026-10-01

The Mixer Brush (the parity plan's L4, first part; DEV_PLAN 23.4).

### Added

- The Mixer Brush (B, with the Brush and Pencil): wet paint that picks up the colours under it and mixes them with the paint it carries. Wet sets how much it picks up, Mix how much of the picked-up paint it lays, Load how long the loaded paint lasts along a stroke; Load the brush and Clean the brush after each stroke, Sample All Layers, and Alt-click to load the reservoir from the canvas. With Wet and Mix at 0 it paints like the Brush.

## 1.56.1 · 2026-10-01

CMYK PSD in and out, and agents see the mode (DEV_PLAN 22.8).

### Added

- A CMYK PSD opens as a CMYK document with its layers' ink, names, places, opacity, visibility and blend modes and its embedded profile (or the default one, with a message). Export PSD from a CMYK document writes a layered CMYK PSD with the profile embedded; layer masks, styles and adjustment layers reach it in the composite, and a message says so. Reading and writing go through psd-tools (MIT) in the engine.
- An agent's `get_document` reports the bit depth and colour profile beside the colour mode.

### Known

- PSB from a CMYK document is still written as RGB; 16-bit CMYK TIFF waits for a 16-bit CMYK writer.

## 1.55.9 · 2026-10-01

Every command at 16 bits and in CMYK (DEV_PLAN 22.7).

### Added

- In 16-bit and CMYK documents nearly every command and tool now works: text, shapes, gradients, fills, pastes, the retouching tools (Clone Stamp, Healing, Dodge, Burn, Sponge, Blur, Sharpen, Smudge), the erasers, Crop, Move Pixels, Stroke Path and the filters not yet on the float model. Pixels such an operation does not touch keep their 16 bits or their ink exactly; the pixels it changes take the new colour (in CMYK the profile's separation, or the foreground's or background's own ink, so black text set at K 100 stays K-only), keeping their old structure where the change is small.
- What still waits is named in the menus rather than undone afterwards: layer styles at 16 bits and in CMYK; in CMYK, Channel Mixer, Exposure, the profile and proof commands; 32-bit documents keep their own list.

### Known

- Operations not yet on the float model change pixels at 8-bit precision in the change; the Brush, Pencil, Eraser and the ported filters and adjustments keep full precision.

## 1.55.8 · 2026-10-01

Adaptive Wide Angle (the parity plan's M4, third part, which closes the row with Content-Aware Scale and Perspective Warp).

### Added

- Filter > Adaptive Wide Angle: a wide or fisheye picture reprojected to the ordinary perspective view, so lines that are straight in the world come out straight. Click along something that should be straight to draw a constraint line on the dialog's picture (New line starts another), and Fit to lines finds the lens's field of view that straightens them and levels the first; or set Correction (Fisheye, Equisolid, Stereographic), Strength, Scale and Rotation yourself. The canvas shows the result live; OK is one step.

## 1.55.7 · 2026-10-01

Colour-model operations in every mode (DEV_PLAN 22.6).

### Added

- Hue/Saturation, Vibrance, Color Balance, Black and White, Photo Filter, Threshold, Selective Color, Gradient Map, Color Lookup and Shadows/Highlights adjustment layers work in 16-bit and CMYK documents, with the same results as in RGB, in the canvas and in every export; Channel Mixer at 16 bits. In CMYK a small change keeps the ink's own structure (a K-only black stays K-only), a large one takes the profile's separation, and an adjustment that changes nothing leaves the ink exactly as it was.
- Hue, Saturation, Color, Luminosity, Darker Color and Lighter Color blend modes compose in CMYK, and the CMYK canvas shows any blend mode exactly as it exports.

### Known

- At 16 bits a change that moves colour between channels (a large hue rotation) is computed at 8-bit precision of the change, within half a level. Channel Mixer in CMYK, which would mix inks rather than RGB channels, follows later.

## 1.55.6 · 2026-10-01

Perspective Warp (the parity plan's M4, second part; DEV_PLAN 23.3).

### Added

- Edit > Perspective Warp: in Layout, drag to draw planes over the picture and fit their corners to it (a corner near another plane's snaps to share it); choose Warp in the options bar and move the corners, and the picture follows each plane's perspective. Straighten verticals and Level horizontals make near-upright and near-level edges exact. Enter applies as one step, Escape cancels.

### Known

- Where two planes with different perspectives meet, a seam can show, since each plane carries its own map. Adaptive Wide Angle, M4's third part, follows.

## 1.55.5 · 2026-10-01

Compositing in the mode (DEV_PLAN 22.5): 16-bit and CMYK documents compose as RGB ones do.

### Added

- In 16-bit and CMYK documents, every blend mode, layer opacity and fill, layer masks and folder masks, clipping masks and adjustment layers now compose in the document's own channels (in CMYK on the ink itself, so Multiply darkens as print does), in exports, in the canvas and in the Channels and Info panels. Duplicate, Group, the mask commands, Create Clipping Mask and the blend-mode shortcuts are offered at depth and in CMYK.

### Known

- Hue, Saturation, Color, Luminosity, Darker Color and Lighter Color compose in 16-bit RGB; in CMYK they wait for the Lab work. Layer styles do not yet compose in these modes; the compositor says so by name.

## 1.55.4 · 2026-10-01

Content-Aware Scale (the parity plan's M4, first part; DEV_PLAN 23.3).

### Added

- Image > Content-Aware Scale: the layer's width and height change by removing or adding the least important seams, so the parts that matter keep their shape; skin tones and the selection can be protected. Seam carving runs in the engine on this computer, from a quarter to twice the size in one step. 8-bit RGB layers for now.

## 1.55.3 · 2026-10-01

Image Rotation, and more of every mode (DEV_PLAN 22.4, third part).

### Added

- Image > Image Rotation > 180°, 90° Clockwise, 90° Counter Clockwise: the canvas turns with every layer, mask, artboard and the selection, with no pixel resampled, at every depth and in every mode. formvis had only the flips before.
- Surface Blur runs on 16-bit, 32-bit and CMYK pixels.

### Noted

- Free Transform already works at every depth and in every mode, since it commits only a layer's placement; the warps (Warp, Puppet Warp, Liquify) wait for a float path.

## 1.55.2 · 2026-10-01

Neural Filters: JPEG Artifacts Removal and Super Zoom (DEV_PLAN 23.2, fifth part). The gallery's seven are all present.

### Added

- JPEG Artifacts Removal in Filter > Neural Filters: the steps on JPEG's 8-pixel grid are smoothed where they are small and real edges are kept, then the noise in flat areas softened, by a Strength you set. No model and no download; a learned model (FBCNN) takes its place when an export can be pinned.
- Super Zoom in the gallery: Real-ESRGAN's Upscale at 2x or 4x, into a new layer.

### Changed

- The README's line counts follow the code again.

## 1.55.1 · 2026-10-01

Neural Filters: Style Transfer (DEV_PLAN 23.2, fourth part).

### Added

- Style Transfer in Filter > Neural Filters: the layer repainted in one of five preset styles (Mosaic, Candy, Rain Princess, Udnie, Pointilism) on this computer, mixed in by Amount. The models are the ONNX model zoo's fast neural style networks (BSD-3-Clause, 34 MB together, fetched on first use from Preferences > Plugins > Local models, each pinned to its hash), run at the picture's own size.

### Changed

- The engine's requirements gain the onnx package (Apache-2.0), used to run the style presets at any size.

## 1.54.9 · 2026-10-01

Neural Filters: Colorize (DEV_PLAN 23.2, third part).

### Added

- Colorize in Filter > Neural Filters: a black-and-white layer's colour is predicted on this computer by DDColor-tiny (Apache-2.0, 135 MB, fetched on first use from Preferences > Plugins > Local models, pinned to its revision and hash), its own light kept exactly; Amount mixes the colour in. Nothing leaves the computer.

## 1.54.8 · 2026-09-30

Neural Filters: Depth Blur, the first with a model (DEV_PLAN 23.2, second part).

### Added

- Depth Blur in Filter > Neural Filters: the layer's depth is read on this computer by Depth Anything V2 Small (Apache-2.0, 99 MB, fetched on first use from Preferences > Plugins > Local models with nothing to install, pinned to its revision and hash), and pixels blur by their distance from the chosen focus depth past a sharp range, up to a blur you set. Nothing leaves the computer.

## 1.54.7 · 2026-09-30

Neural Filters, the gallery and its first two (DEV_PLAN 23.2, first part).

### Added

- Filter > Neural Filters: a gallery with a live preview and one undo step. Harmonize moves a layer's light and colour toward what lies beneath it, by an amount; Skin Smoothing softens skin tones only, leaving everything else as it was. Neither needs a model or a download. The model-backed filters (Depth Blur, Colorize, Style Transfer, Super Zoom, JPEG Artifacts Removal) join the gallery as each model's licence and pin land. The gallery works on 8-bit RGB layers for now.

## 1.54.6 · 2026-09-30

More of every mode (DEV_PLAN 22.4, second part).

### Added

- Invert, Posterize and Brightness/Contrast adjustment layers work in 16-bit and CMYK documents, per channel and per ink, and compose into their exports; Motion Blur runs on 16-bit, 32-bit and CMYK pixels. Threshold, a luminosity operation, follows with the colour-model work.

## 1.54.5 · 2026-09-30

Blend If and Knockout (the parity plan's M2, DEV_PLAN 23.1).

### Added

- Layer Style > Blending Options: Knockout (None, Shallow, Deep) punches the layer's silhouette through what lies below, down to the Background or to the bottom of its group, the layer's own pixels showing at their Fill; Blend If shows the layer only where this layer's value and the underlying composite's value fall inside each range, on Gray or one channel, each end feathered between its two values (the split slider), as eight sliders.
- Both travel in PSD files (blending ranges and the knockout flag) and in projects. On the GPU renderers such a document is drawn by the CPU compositor until the GPU port is checked on real hardware.

### Known

- One channel or Gray per layer rather than three channel pairs at once; PSD files keep one knockout flag, so a Deep knockout written to PSD reads back as Shallow.

## 1.54.4 · 2026-09-30

Levels and Curves per ink (DEV_PLAN 22.4, first part), and the parity plan's L14 closed.

### Added

- Levels and Curves adjustment layers in a CMYK document act on CMYK, Cyan, Magenta, Yellow or Black, each ink with its own range or curve; the Adjustments panel names the document's channels. Export, the Info panel, the Channels thumbnails and the single-ink view include them, and the canvas shows the composed ink.
- OpenEXR files are read and written in a separate process, so a malformed EXR cannot reach the engine: it is refused with a message and the engine stays up (the comparison's "contain the OpenEXR decoder").

### Changed

- The engine no longer turns OpenCV's OpenEXR codec on for itself; the child process turns it on for its own read or write.

## 1.54.3 · 2026-09-30

The parity plan's H1, seventh part, and the first release of "CMYK and Lab everywhere" (DEV_PLAN 22.3): one float pixel model, and a single-ink view of the canvas.

### Added

- The Channels panel's ink solo now shows that ink alone on the canvas (paper white, full ink black) as well as making it what the Brush, Pencil and Eraser paint; CMYK returns the composite. The view never touches the pixels.
- In a CMYK document, Gaussian Blur, Unsharp Mask and Add Noise run on the ink itself, and Image Size resamples the ink; Canvas Size, the flips, Trim and Reveal All are offered too.

### Changed

- 16-bit, 32-bit and CMYK layers now share one float pixel model inside formvis, so every operation ported to it serves all of them at once (and Lab when it comes). Projects, files and undo are unchanged; a `.fmv` saved before reopens as before.
- At 32 bits Gaussian Blur now runs on the linear-light floats rather than on the rendition.

## 1.54.2 · 2026-09-30

The parity plan's H1, sixth part: channels, painting, the picker and Info in CMYK (DEV_PLAN 22.2).

### Added

- The Channels panel lists CMYK, Cyan, Magenta, Yellow and Black in a CMYK document, each with a thumbnail of its ink. Clicking an ink makes it what the Brush, Pencil and Eraser write, so a K-only black is one click and a stroke; Cmd- or Ctrl-click loads an ink's light areas as a selection.
- The Brush, Pencil and Eraser paint CMYK documents in ink: a stroke paints the rendition as before, and when it ends it is rebuilt on the layer's ink and the rendition redrawn from the ink, in the same undo step.
- The colour picker shows C, M, Y and K in a CMYK document: an RGB or hex entry reads its ink through the document's profile; a typed ink is kept exactly. The Info panel and the Color Samplers read C, M, Y, K percentages from the ink under the pointer.

### Changed

- In CMYK the Channels panel's solo choice sets the paint target and the canvas keeps showing the composite; the panel says so. A single-ink view of the canvas needs a per-layer rendition through the renderer and follows in 1.54.3.
- The README's line counts follow the code again (36,000 TypeScript, 7,800 Python).

## 1.54.1 · 2026-09-30

The parity plan's H1, fifth part: CMYK documents as true channels (DEV_PLAN Phase 22.1).

### Added

- Image > Mode > CMYK Color converts an 8-bit RGB document to CMYK ink through a CMYK profile, exactly, in the engine (LittleCMS, the profile's own black generation, the intent and black point chosen in the dialog); every pixel layer keeps C, M, Y, K and alpha beside its sRGB rendition, which the window draws through a 17-point table from the same profile. Mode > RGB Color converts back the same way. Undo and redo carry the mode.
- A CMYK profile ships: FOGRA39L Coated (colord's profile of the FOGRA39 data, zlib licence, see NOTICE.md), preselected in the dialog; any CMYK profile loaded through View > Proof Setup can be chosen instead.
- CMYK JPEG and TIFF open as CMYK documents with their embedded profile (or the shipped one, said in a message); File > Export > TIFF and JPEG from a CMYK document write CMYK with the profile embedded. The `.fmv` project keeps the ink.
- A CMYK document never drops to RGB quietly: a step that would change a layer without its ink is undone with a message, and the menus offer only what keeps the ink (files, undo, exports, layer order and naming, selection, the view). Painting, adjustments, filters and the Channels panel in CMYK follow in the next releases.

### Changed

- The New dialog's note now says 16 and 32 bit and CMYK come from Image > Mode; Lab is the one still to come.
- The version numbering keeps the repo's rule (the last number 1 to 9), so this release is 1.54.1, not the plan's 1.54.0.

## 1.53.9 · 2026-09-30

The parity plan's H1, fourth part: 32-bit documents.

### Added

- Radiance HDR, OpenEXR and 32-bit float TIFF open as 32-bit documents, linear light and unbounded; Image > Mode > 32 Bits/Channel converts 8 and 16 bits up (linearised); converting down asks for HDR Toning, Exposure and Gamma.
- At 32 bits the Exposure adjustment works in linear light, unclamped, as do moving, flips, canvas and image size, and Gaussian Blur; File > Export > Radiance HDR and OpenEXR, and Export TIFF as 32-bit float; the project keeps 32-bit layers as floats. What would clip past white (painting, Levels, Curves, Unsharp Mask, Add Noise, colour profiles) waits, and says so.

### Changed

- The engine turns on OpenCV's OpenEXR codec, which OpenCV leaves off because its parser has had security problems with untrusted files (opencv/opencv#21326): formvis opens the person's own files on their own machine. Removing the one line in backend/app/__init__.py turns it off again, and EXR then does not open.

## 1.53.8 · 2026-09-30

The parity plan's H1, third part: painting and filtering a selection at 16 bits.

### Added

- The Brush, Pencil and Eraser paint 16-bit documents at 16 bits: a stroke paints the 8-bit rendition as before, and when it ends it is rebuilt on the 16-bit pixels (source-over with the paint colour, its coverage from the alpha change or by least squares over the three channels; erasing scales alpha), in the stroke's own undo step, so the 16 bits under a soft or partial stroke are kept. Colour dynamics and the other painting and retouching tools wait for a later release, and say so.
- Gaussian Blur, Unsharp Mask and Add Noise within a selection at 16 bits, blended by the selection's coverage.

## 1.53.7 · 2026-09-30

The parity plan's H1, second part: 16-bit geometry and filters.

### Added

- In a 16-bit document: moving, Flip Canvas, Canvas Size, Crop, Trim and Reveal All keep 16 bits (the export composes each layer where the renderer places it: whole-pixel moves and flips copy exactly, scaling and rotation sample bilinearly); Image Size resamples the 16 bits (an area average when shrinking, bilinear when enlarging) and derives the 8-bit rendition from them.
- Gaussian Blur, Unsharp Mask and Add Noise at 16 bits on a whole layer, the same maths as at 8 (the blur's three box passes, the same seeded noise), from the filter dialog, actions and the agent tools alike; within a selection they wait for a later release, and say so.

## 1.53.6 · 2026-09-30

The parity plan's H1, first part: 16-bit documents.

### Added

- 16-bit PNG and TIFF open as 16-bit documents (read by OpenCV in the engine; Pillow narrows 16-bit colour to 8), and Image > Mode > 8 Bits/Channel and 16 Bits/Channel switch between them.
- In a 16-bit document, Levels, Curves and Exposure adjustment layers are applied at 16 bits (the same transfer functions as at 8, evaluated at each pixel's value), Export PNG and Export TIFF write 16 bits a channel, and the project saves and reopens the 16 bits.
- Nothing drops a 16-bit document to 8 bits quietly: an edit that would change a layer's 8-bit rendition without its 16 bits is undone with a message, painting waits, and commands that cannot keep 16 bits yet are unavailable until Image > Mode > 8 Bits/Channel.

## 1.53.5 · 2026-09-30

Sprint 2 of the parity plan begins: colour management (H2).

### Added

- A document may carry its own colour profile, saved with the project and embedded on export as it is.
- Edit > Assign Profile (the numbers kept) and Edit > Convert to Profile (the look kept, through LittleCMS, with a rendering intent and black point compensation), one undo step each.
- View > Proof Setup (any profile on this computer, CMYK included, or one loaded from a file), Proof Colors and Gamut Warning (Shift+Ctrl+Y): the view through the proof device, what it cannot print greyed; the document unchanged. Proof Colors has no default key, as Ctrl+Y is Redo in formvis.
- A document with a profile other than sRGB is shown colour-managed.
- Embedded profiles on open: converted to sRGB with a message naming the profile (the default), kept, or asked (Preferences > File Handling); kept only when the image opens as its own document.

## 1.53.4 · 2026-09-30

Sprint 1 of the parity plan (the v12 comparison): foundations.

### Added

- Object Selection (SAM 2.1), Select Subject and Remove Background (U²-Net) with nothing to install: ONNX Runtime is in the base install and each model is fetched on first use, pinned to its checksums (torch and rembg are still used when installed).
- Every page of a TIFF, BigTIFF included: the largest page (the default), each page as a document, or every page as a layer.
- Develop's scopes: histogram, waveform and vectorscope of the developed preview, live.
- Edit > Keyboard Shortcuts rebinds any command by pressing the keys; a conflict names the command that has them (Reassign or Cancel); Reset All; kept in Preferences.
- The largest document follows this computer's memory (a pixel per 40 bytes, 100 to 250 megapixels), stated in Preferences > Performance and in every message about it.

### Changed

- The local models' memory: at most two held, released after ten minutes unused, and ONNX Runtime's memory arena off (SAM 2.1 and U²-Net held 2,575 MB after three runs each; now 687 MB).
- Every slider has an accessible name.
- A test runs everything formvis offers: 263 of the 280 menu commands, 650 tool option values each with a drag, and every Image > Mode choice.

### Fixed

- The model download route offered SD-Turbo (brought over from formcut) unpinned, from a moving branch, under a non-commercial licence with no acceptance; it is removed, and a download file without a checksum is now refused.

## 1.53.3 · 2026-09-29

### Added: editing by asking, from Claude Code, Codex and Cursor

- Seamless start: `./formvis mcp` starts formvis's engine when it is not running; a request with no formvis window open opens one in the browser; with outside agents not allowed, the first request asks once in the window (Allow turns the setting on and the request goes ahead; Not now, or turning agents off in Preferences, is answered with how to allow it, without asking again for ten minutes); a window reloading or busy is waited for. Every failure tells the agent what to do next.
- 39 tools, up from 14: open, save (.fmv) and export (PNG, JPEG, WebP) at absolute paths, read and written by the engine with their checks; switch documents; resize, canvas, crop, flip; move, scale, rotate, flip, duplicate, reorder, merge, flatten and rasterize layers; text and shapes; ellipse and inverted selections, Select Subject and colour range; filters with settings, adjustments changed later, Color Match, film layers, Remove Background; and generative fill, expand, image and upscale that use this computer's models first (LaMa, Krea 2, Real-ESRGAN) and fal last, asked.
- Current server instructions and an `edit_strategy` prompt with the decision tree.
- The `formvis-editing` skill in `.claude/skills` (Claude Code) and `.agents/skills` (Codex, Cursor): three workflows with exact tool names, what to do when each kind of failure comes back, and setup; its tool reference is generated from the catalogue, and the tests fail if it drifts.
- `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `AGENTS.md`, and `./formvis agents install` to set all three up for your account from any folder (existing settings kept and backed up, idempotent, `--dry-run`).
- docs/AGENT_EVALS.md: a checklist per client, ten evaluations with checkable results, and the skill's trigger test.

### Fixed

- Layer > Rasterize Layer did nothing to a plain filled rectangle or ellipse, so it could not be filtered either; it rasterizes now.
- Every release zip since 1.50.5 carried untracked leftovers from before the rename (empty folders and a 115-byte stub), whose paths held the reference build's name; they are removed, and zips are built from a clone of the repository, so nothing untracked ships.

## 1.53.2 · 2026-09-29

### Added: Generative Fill and Expand on any computer, without fal or ComfyUI

- LaMa, a dedicated inpainting model (Apache-2.0, 208 MB, pinned to its SHA-256), runs on any computer's CPU in seconds: Generative Fill and Expand offer it as "LaMa, no prompt (this computer)" and choose it when fal has no key. It fills from what surrounds the selection; the result is masked to the selection. Download it in Preferences > Plugins > Local models.
- docs/LOCAL.md: every capability, whether it runs on this computer, what it needs, and the test that proves it; and what is not local yet (reference layers need ComfyUI; prompted generation needs Apple silicon or an NVIDIA GPU; the language-model features need a local server such as Ollama).
- Generative Expand's margin fields are named (Left, Top, Right, Bottom margin) for assistive technology.

## 1.53.1 · 2026-09-29

### Added: Upscale on this computer

- Image > Upscale offers Real-ESRGAN on this computer beside fal: no key, no cost, the picture enlarged two or four times in tiles (each read with a margin of context, so no seams show), its transparency kept, with progress. Download the model (about 67 MB, BSD-3-Clause, pinned to its SHA-256) in Preferences > Plugins > Local models; Upscale then chooses it.
- From formcut's upscaler, with its tests.

### Fixed

- 1.52.9's model manager left out two of formcut's module variables, so listing the local models and installing Krea 2, Klein or any model would have failed; its tests had stood in for the install request. Every name its code uses is now checked against what it defines, and the real Real-ESRGAN download exercises it.

## 1.52.9 · 2026-09-29

### Added: local image generation, from formcut

- Krea 2 Turbo and FLUX.2 [klein] 4B run on this computer (mflux on Apple silicon, diffusers elsewhere), with no key and no cost: in Edit > Generate Image, and Krea 2 in Generative Fill and Expand, starting from what the selection covers at the Influence set and masked to the selection.
- Preferences > Plugins > Local models: each licence shown and accepted before anything downloads, a build chosen for the machine, the download followed and cancellable; Krea 2 installs with the content filter its licence requires; your LoRAs and checkpoints.
- Krea 2's licence notice is shown with each of its pictures, and the filter's warning if it was removed. Each picture's recipe is written into it (steps, seed, LoRAs), and prompts written as Civitai shows them are read.
- The engine's local generation comes from formcut, the same author's video editor: its jobs, model downloads (every file pinned to its SHA-256), Krea 2, Klein, runner, LoRAs, checkpoints and generation catalogue, with its tests.
- A real Krea 2 or Klein run is not tested here (it wants Apple silicon or an NVIDIA GPU and up to 18 GB of model); everything around it is, with a stand-in model.

## 1.52.8 · 2026-09-29

### Changed: the Pen and the shape stroke options (the tool audit's last items)

- The Pen has a Mode: Path as before, or Shape, where closing a path makes it a shape layer with the Shape tool's fill and stroke.
- The Pen's Auto Add/Delete (on, as before): clicking a path adds a point and clicking a point deletes it; off, a click starts a new path.
- A shape's stroke has a Stroke Type (Solid, Dashed, Dotted) and an Align (Inside, Center, Outside), in shape layers and in Pixels mode; an open path's stroke stays centred.
- With these, the audit of the tools' option bars is complete.

## 1.52.7 · 2026-09-29

### Added: very large pictures

- A picture larger than formvis edits in one piece (over 30,000 pixels a side or 100 megapixels, up to 65,535 a side) no longer fails: its size is read from the file before anything is decoded, and it opens as a reduced copy that fits, a region at full size, or tiles at full size, each tile its own document that remembers its place. The dialog says how much memory opening it needs.
- File > Export > Assemble Tiles puts the edited tiles back together as one full-size PNG, written by the engine a strip at a time so the whole picture is never held at once, downloaded straight to disk and kept in the data folder's exports.
- Opening still decodes the picture once, about 4 bytes a pixel. Tiles closed before assembling lose their places.

### Changed: Ask the manual finds the right section more often

- Help's Ask matches your words to the manual's by stem ("written" finds "writes") and weighs rarer words more, so a question about the AI label goes to Exporting rather than wherever "written" happens to appear.

## 1.52.6 · 2026-09-29

### Added: plugins

- Plugins > Manage Plugins adds JavaScript plugins, turns them on and off, and removes them; their commands appear in the Plugins menu. They are kept in the plugins folder of formvis's data folder.
- Each plugin runs in a sandbox: it changes the open document only through formvis's tools (each change undoable; anything that costs money still asks you) and can read and write the active layer's pixels; it cannot see your keys, your files or the rest of formvis. Adding one says so first.
- Writing a plugin: the manual's Plugins section lists the four calls (register, call, getPixels, putPixels).
- Tested in the browser; in the desktop app, the window's security policy may keep plugins from running, which is not yet checked.

## 1.52.5 · 2026-09-29

### Changed: API keys in the system's password store

- fal's key and the language model's key are kept in your system's password store: Keychain on a Mac, Credential Manager on Windows, the Secret Service on Linux.
- Keys saved before move there the first time they are used, and their file copies are removed.
- Where there is no password store, or it fails, keys stay in a file on this computer only you can read, as before. Preferences > Plugins says which is in use.

## 1.52.4 · 2026-09-29

### Added: session restore

- The documents open when formvis closes reopen at the next start, saved or not, in their tab order, with the same one active and their names as they were. Unsaved changes stay marked unsaved; a document saved to the library saves back to it.
- On by default; Preferences > File Handling turns it off, and then formvis keeps only unsaved work and asks after a crash, as before.
- Every open document is kept on this device (as unsaved work was), rewritten after changes within the recovery interval set there.

## 1.52.3 · 2026-09-29

### Added: formvis Help

- Help > formvis Help (F1) opens the manual in the app: its contents, a search, and every section, from getting started to exporting, generating, ComfyUI, NodeMode, 3D models and the assistant.
- Ask the manual a question: the sections most about it go to the language model set in Preferences > Plugins, which answers from them alone and names them; without a model, formvis names the sections to read.
- The manual is also docs/MANUAL.md in the repository, one copy for both.

## 1.52.2 · 2026-09-29

### Added: the assistant

- Window > Assistant: a chat beside the canvas that acts on the open document, on the language model set for Improve Prompt (Ollama or LM Studio on this computer, or a service with a key; the engine keeps the key).
- It uses the same 14 tools as outside agents: each change an undoable step, anything that costs money asked first. Each tool call shows as a card with what it did and what came back.
- Undo This Turn walks the document back to before your last message; Stop ends a turn. A turn takes at most 12 steps.

## 1.52.1 · 2026-09-29

### Added: outside agents over MCP

- Claude Code, Claude Desktop or any MCP client can work in the open document: read it and its layers, see it, make a new document, select, add, change and delete layers, fill, add adjustments, place images, undo and redo, and run Generative Fill and Generate Image (14 tools).
- Off unless you turn on Allow outside agents in Preferences > Plugins, which also says how to connect: Claude Code with `claude mcp add --transport http formvis http://127.0.0.1:8190/mcp`, Claude Desktop with `./formvis mcp` as the server's command.
- Every change an agent makes is an ordinary undoable step. Anything that costs money asks you in formvis first, with the prompt; agents never see your keys. Only this computer can connect.
- Follows the 2026-07-28 MCP specification (stateless, with server/discover), and still answers clients of the one before.

## 1.51.9 · 2026-09-28

### Added: Place 3D Model

- File > Place 3D Model places a .glb or .gltf model into the picture: turn, tilt and size it, and set its light (direction, height, strength and colour) and the ambient light, in a live preview.
- Place renders it at the document's size on transparency, as a new layer you can mask, blend and edit.
- The model is centred and scaled to fit, whatever units it was made in. The 3D drawing uses three.js (MIT), loaded only when first used.

## 1.51.8 · 2026-09-28

### Added: export into a frame, and the AI label

- File > Export As has a Size: Scale (%) as before, Fit Within a width and height (keeping the shape), or a Frame of exactly that size with the picture centred (transparent margins, white in JPEG).
- An AI label: None, Made with AI or Edited with AI, written into PNG, JPEG and WebP as IPTC's Digital Source Type, the machine-readable marking of AI content. AVIF, TIFF and PDF do not carry it yet, and the dialog says so.
- Both are saved with Export As presets.

## 1.51.7 · 2026-09-28

### Added: OpenRaster files

- File > Open reads OpenRaster (.ora) files, the layered format of other painting apps: layers and groups, their positions, opacity, visibility and blend modes. A blend mode formvis does not have opens as Normal, and it says which.
- File > Export > OpenRaster writes them. Text, shapes, smart objects, masked or transformed layers go as they look; adjustment layers have no OpenRaster form and are left out, said so.
- SVG files were already placed as layers (File > Place); a test now keeps it so.

## 1.51.6 · 2026-09-28

### Added: film looks

- Three new adjustment layers: Split Toning (tint shadows and highlights separately, keeping brightness), Halation (the red-orange bloom film gives bright areas) and Glow (a soft bloom in the highlights' own colour).
- The Grain adjustment has presets by film speed, ISO 100 to ISO 3200; moving a slider shows Custom.
- Layer > New Film Layer > Light Leak (warm light from an edge or corner, in Screen blend) and Frame (a film edge, a white border or a thin line), as layers you can move, scale, erase or mask.
- Bleach bypass, cross processing and faded film were already looks in Color Lookup, and a vignette in Develop.

## 1.51.5 · 2026-09-28

### Added: Improve Prompt

- Improve, beside the prompt in Generative Fill, Generate Image and Run ComfyUI Workflow, rewrites the prompt through a language model following a template you choose; Restore puts your original back.
- The model is any service with the OpenAI-compatible API: Ollama or LM Studio on this computer, or OpenAI, OpenRouter and others with a key. Set its address, model and key in Preferences > Plugins; Check lists the models it offers. The engine keeps the key and never shows it.
- Prompt templates: three to start (Richer detail, Fill a selection, Short and plain), edited, added to and removed in Preferences > Plugins.

## 1.51.4 · 2026-09-28

### Changed: Blur, Sharpen and Smudge option bars

- Blur and Sharpen: Mode (Normal, Darken, Lighten, Hue, Saturation, Color, Luminosity) and Sample All Layers.
- Sharpen: Protect Detail, on by default: edges sharpen without halos or speckle.
- Smudge: Sample All Layers (onto an empty layer too) and Finger Painting (the foreground colour dragged from where the stroke starts).
- The Smear tool's choice of Liquify, Blur, Sharpen or Smudge is labelled Tool; Mode is the blend.

### Added: reference layers for ComfyUI workflows

- Generative Fill, Generate Image and Run ComfyUI Workflow can send up to four layers as references, to Load Image nodes you title "formvis reference" (then 1, 2 and on); those nodes never take the picture.
- fal's models take no references; the dialogs say so when one is chosen.

## 1.51.3 · 2026-09-28

### Added: Color Match

- Layer > Color Match matches a layer's colours to what is beneath it, or to what is around it, without changing its pixels: it adds a Curves layer clipped to it. Useful when a generated result comes back a shade off.
- The amount is that layer's opacity, changed any time in the Layers panel (0% as the layer came, 100% fully matched). Run it again, from the layer or its Color Match layer, to match afresh; it updates rather than adds.
- Saved with the project and in PSD files, as any adjustment layer.

## 1.51.2 · 2026-09-28

### Added: your ComfyUI workflows in Generative Fill, and Generate Image

- Generative Fill and Generative Expand have a Model: FLUX.1 Fill on fal, or one of your ComfyUI workflows. Add a workflow saved with Export (API) from the dialog; it is kept for next time, and Remove takes it off the list. A workflow needs no fal key; the result arrives masked to the selection, as with fal.
- Edit > Generate Image makes a picture from a prompt alone, as a new layer at the document's size (a new document when none is open), with FLUX1.1 [pro] on fal or a text-to-image ComfyUI workflow. Cancel stops a ComfyUI run.

## 1.51.1 · 2026-09-28

### Added: Run ComfyUI Workflow

- File > Run ComfyUI Workflow runs a workflow saved from ComfyUI with Export (API) on your picture: its first Load Image takes the image, its first Load Image (as Mask) the selection's mask, and a text node you title "formvis prompt" the prompt you type.
- Results come back as layers, scaled to the document if their size differs, and masked to the selection when you sent one, so only the selection changes; one undo each.
- The dialog shows the job queued (and how many are ahead), running or done; Cancel, or closing the dialog, stops it in ComfyUI.
- A workflow with no Load Image (text to image) runs on the prompt alone. A workflow saved in ComfyUI's editor format is refused when chosen, with how to export it.
- The last workflow is remembered.

## 1.50.9 · 2026-09-28

### Added: Send to ComfyUI

- File > Send to ComfyUI sends the flattened image, the active layer, the selection or every layer into ComfyUI's input folder (under formvis), where its Load Image node lists them; sending the same name again replaces it.
- A selection goes whole, with a whole-picture mask (white where selected), as inpainting needs the picture around it: pick the image in Load Image and the mask in Load Image (as Mask).
- The dialog says whether ComfyUI is running, and its version; if it is not answering, it says so.
- Preferences > Plugins holds ComfyUI's address (http://127.0.0.1:8188 by default), with Check.

## 1.50.8 · 2026-09-28

### Added: Send to NodeMode, from anywhere

- File > Send to NodeMode sends the flattened image, the active layer, the selection (its image and its mask) or every layer to NodeMode, from the desktop app or formvis in its own tab (it could send only when embedded in NodeMode, which still works as before).
- The dialog says whether NodeMode is running, and whether it can place what arrives on its canvas; if NodeMode is not answering, it says so.
- Preferences > Plugins holds NodeMode's address (http://localhost:8000 by default), with Check.
- NodeMode needs a small addition to place what arrives on its canvas; until then the images go to its uploads, and formvis says so.

## 1.50.7 · 2026-09-28

### Changed: tool option bars (audit, part 4)

- Dodge and Burn: Protect Tones, on by default: brightness changes and the colour is kept, where it washed toward white.
- Sponge: Vibrance, on by default: vivid colours are kept from clipping as they saturate.
- Eyedropper: Sample (Current Layer, Current & Below, All Layers).
- Zoom: 100% and Fill Screen in the bar.
- Still to come: Blur, Sharpen and Smudge (Mode, Sample All Layers, Protect Detail, Finger Painting); the Pen's Shape and Path modes and Auto Add/Delete.

## 1.50.6 · 2026-09-28

### Changed: tool option bars (audit, part 3)

- Clone Stamp: Sample is Current Layer, Current & Below or All Layers (it was an all-layers switch), as the Healing Brush's; Mode and Flow in the bar.
- Gradient: Transparency (the stops' own transparency honoured, or every stop opaque) and Method (Perceptual, Linear or Classic, the colours blended in the usual way); Classic stays the default, so gradients are as they were.
- Still to come from the audit: Pen, the Shape tools, Dodge, Burn and Sponge, Blur, Sharpen and Smudge, the Eyedropper and Zoom.

## 1.50.5 · 2026-09-28

### Changed: formvis

- The app is formvis: its window, menus, command line (`./formvis`), desktop app, engine and settings all carry the name.
- Projects save as `.fmv`. Projects saved before the rename still open, and saving one again writes `.fmv` in its place.
- What you saved before carries across on the first start: your settings, imported brushes, file links, recovery data and project library. Nothing is lost or duplicated.
- The git history is untouched; renamed files keep their histories.

## 1.50.4 · 2026-09-28

### Changed: tool option bars (audit, parts 1 and 2)

- Brush: Airbrush, so paint builds while the pointer rests.
- Type: Anti-aliasing (None, Sharp, Smooth) and a Color swatch; the bar's font, size, style, alignment, anti-aliasing, leading, tracking and kerning now restyle the selected type layer (they changed only text being typed).
- Magic Wand: sample sizes to 101 by 101; Select Subject and Select and Mask in the bar.
- Audited, no change needed: Paint Bucket, Move, Crop, Spot Healing, Healing Brush.
- Still to come: the Clone Stamp's Mode, Flow and three-way Sample; the Gradient's Transparency and Method.

## 1.50.3 · 2026-09-28

### Fixed: faults found in 1.50.2

- New Document shows its note that 16 and 32 bit, CMYK and Lab are not available yet (1.50.2 said it did and did not).
- New Document's size follows the mode (Bitmap was reckoned as RGB).
- The AI tests no longer skip on a freshly started engine: it finds its AI extras without loading them.
- The Properties icon was rebuilt on nearly every action (a flash); a test now watches ten common actions for any rebuild.

### Changed: tool option bars (audit, part 1)

- Brush: Mode lists Normal, Behind, Clear and the blend modes, no longer Paint/Erase; Smoothing; Angle.
- Only blend modes that truly draw are offered, in the Brush and the Paint Bucket (1.49.10's bucket list offered some that painted as Normal).
- Eraser: Block mode, Flow, and Erase to History.
- Type: Font Style (Regular, Italic, Bold, Bold Italic) and Warp Text in the bar.
- Marquee, Lasso, Quick Selection and Object Selection: Select and Mask in the bar.
- Still to come from the audit: the Brush's Airbrush, and Type's anti-aliasing method and colour swatch.

## 1.50.2 · 2026-09-28

### Fixed: tools refused layers they should take

- The Paint Bucket fills a new empty layer (it said "Select a pixel layer first"); the Magic Wand and Quick Selection treat an empty layer as transparent.
- Type, shape and smart-object layers ask "Rasterize this layer?" before being painted (they were painted over silently, losing their editability).
- An adjustment layer paints its mask (it was refused); a group says it is a group.

### Fixed: no scrollbars anywhere

- A stylesheet drew scrollbars across the app; none is drawn now, in either engine, and everything still scrolls. A test checks every scrollable element.

### Added: colour modes

- New Document: RGB Color, Grayscale and Bitmap, the bit depth following the mode.
- Image > Mode: RGB Color, Grayscale (type and shapes stay editable), Bitmap (50% threshold or diffusion dither) and Indexed Color (exact, or adaptive to the colours chosen, with dither); the pickers keep to the mode; saved with the project; the tab shows the mode.
- Layer > Flatten Image.
- Not yet: 16 and 32 bit, CMYK and Lab, which need a new pixel engine; New Document says so.

### Fixed

- Wet Edges shows along a whole stroke (1.50.1 lightened each dab, and overlapping dabs filled the middle back in).

## 1.50.1 · 2026-09-27

Versions now run 1.50.1 to 1.50.9, then 1.51.x (1.49.10 would have been 1.50.0).

### Added: Brush Settings from your list

- Color Dynamics: each dab's colour towards the background, and its hue, saturation and brightness varied.
- Transfer: each dab's opacity and flow varied, randomly or by pen pressure.
- Noise (a rough soft edge) and Wet Edges (a lighter centre, as watercolour).
- All are off by default; brushes and saved brush settings are as they were.

### Fixed

- Object Selection's hover shows a light wash and an outline (the orange tint turned a blue object grey).

## 1.49.10 · 2026-09-27

### Added: selection and fill gaps from your list

- Object Selection: drag a box to select the object in it; rest the pointer to see the object it finds, tinted, before clicking (Highlight on Hover can be turned off).
- Quick Selection: New, Add and Subtract in the bar; New turns to Add after its first stroke; Shift adds and Alt subtracts from any of them.
- Paint Bucket: fill with a pattern as well as the foreground colour, and a blend Mode.

## 1.49.9 · 2026-09-27

### Added: retouching and navigation from your list

- Content-Aware Move (J): select, then drag; Move fills the hole from around it, Extend keeps the original; the selection goes with it.
- Red Eye (J): click a red pupil to darken it to a neutral; Pupil Size and Darken Amount.
- Rotate View (R, in the Hand's slot): drag to turn the view, Shift for 15-degree steps; double-click, Escape or Reset View straightens it; tools, typing and wheel scrolling follow the turned view; the image itself never turns.

### Changed

- Blur, Sharpen and Smudge have no shortcut: R is Rotate View's.

## 1.49.8 · 2026-09-27

### Added: vector tools from your list

- Triangle shape (in the Shape group).
- Mode in the shape tools' bar: Shape (a layer), Path (adds the outline to the work path), or Pixels (paints it into the active layer).
- Fill and Stroke in the bar: each the foreground, the background or none, and the stroke's width; stroked rectangles and ellipses are vector layers.

### Fixed

- A type mask's selection stays within the canvas.
- The Paragraph panel has Justify.

## 1.49.7 · 2026-09-27

### Added: type tools from your list

- Paragraph text: drag a box with the Type tool; the text wraps inside it as you type and is clipped at its bottom.
- Justify: spreads every wrapped line to the box's width; a paragraph's last line stays left.
- Vertical Type (in the Type group): upright characters stacked top to bottom, each line a column from right to left; typed in a vertical editor.
- Horizontal Type Mask and Vertical Type Mask: type, then Ctrl or Cmd+Enter: the text becomes a selection, with no layer; a red tint while typing.
- PSD files keep paragraph boxes, justification and vertical type.

## 1.49.6 · 2026-09-27

### Added: measuring tools from your list

- Info panel (Window > Info): the colour and position under the pointer, the selection's size, the Ruler's angle and length, and each sampler's colour.
- Color Sampler (I): up to ten samplers; drag to move, Alt-click to remove, Clear All.
- Ruler (I): drag to measure (Shift for 45-degree steps), drag an end to adjust; X, Y, W, H, angle and length in the bar; Straighten Layer; Clear.
- Note (I): click to pin a note and write it; click to edit, drag to move, Alt-click to delete; saved with the document.
- Count (I): click to count, Alt-click to remove a mark, Clear; saved with the document.

### Fixed

- Tabs fit in steps (smaller lettering first) before any name is shortened; none is cut at 1280, 1440 or 1680 pixels wide.

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

- Magnetic Lasso (in the Lasso group): click an edge and move along it; the line follows the strongest edge nearby and fastens points as it goes; click to fasten one; close by clicking near the start, double-clicking or Enter; Backspace removes the last point. Width, Contrast and Frequency.
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
- Preferences in sections: General, Interface, Workspace, Tools, History & Cache, File Handling, Performance, Cursors, Transparency & Gamut, Units & Rulers, Guides & Grid, each setting acting on something real.

### Not verified yet

- The Layers group's tabs (Layers, Channels, Paths) do not move between groups yet; the group moves whole.
- Channel viewing is not possible with the Native GPU renderer, which draws outside the page; the panel says so.

## 1.48.0 · 2026-09-27

### Changed: from your walkthrough of 1.47.0 and your two screenshots

- Tool icons redrawn as pictures in thin lines (a four-way Move arrow, a lasso loop, a bandage, a stamp, a drop, a lollipop, a pen nib), the column at the target's density with dashes between tool families, the active tool lavender.
- The options bar starts with the tool's icon; the Move bar is the target's: Auto-Select, Auto-Select Target (Layer or Group), Show Transform Controls, Snap and icon-only align and distribute buttons. Its transform fields appear while you transform.
- Menus have a tick column only where a tick can show, and the target's translucent look.
- Brushes: the tip is an editor (drag its handles to turn or flatten it); presets in folders with a search, grid or list, each drawn with its shape and size; Load... reads .abr brushes; a Brush Settings tab. A Flat angled preset.
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

- Layer Fill: the pixels fade, the layer styles do not; kept in projects and PSD.
- Layer locks: transparency, image pixels, position, all, honoured by the tools; kept in projects and PSD.
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

- A native GPU renderer for the desktop app (native/formvis-render, Rust on wgpu: Metal on macOS, Vulkan on Linux, Direct3D 12 on Windows): layers stored as tiles, so no texture size limits them; a GPU brush; all 27 blend modes (the web shader's own formulas); masks, clipping, adjustment tables, moved, scaled and rotated layers without seams between tiles; a memory budget from the machine in place of a fixed cap; the checkerboard; drawn into the window's own GPU surface.
- Preferences > Performance > Renderer: Native GPU (desktop app). Opt-in: Automatic does not choose it yet. Where it cannot draw a document yet (3D tables, folder masks, a mask placed apart from the document) it falls back, with the reason in the status bar.
- A brush benchmark (cargo run --release --bin brush_bench in native/formvis-render) and a window check (cargo run --release --example window), for real hardware.
- `./formvis test native` runs the renderer's 21 tests.
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

- The Object Selection tool (W): click an object to select it, Shift-click to add another, Alt-click to take one away. It runs Meta's SAM 2.1 in the engine, installed with `./formvis install-ml` (optional); the first click on an image takes a few seconds, later clicks about a tenth of a second.
- 5 more tests (4 backend, 1 browser): 499 in all.

## 1.41.0 · 2026-09-25

### Fixed

- Document tabs and the new-document button slide into place when a document opens or closes, instead of jumping, so a document arriving from a drop or an import no longer shifts the tab bar unexpectedly.
- 2 more tests (browser), guarding this and the sliding layer rows: 494 in all.

## 1.40.0 · 2026-09-25

### Added

- Open `.comp` projects (as `Name.comp`, `Name.comp.zip` or the package folder), so they can be moved to formvis: layers, folders, masks, clipping, blend modes, opacity and visibility come across, and saving writes a `.fmv`. formvis opens `.comp` but never writes it.
- 6 more tests (5 backend, 1 browser): 492 in all.

## 1.39.0 · 2026-09-25

### Added

- Camera RAW import: DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2 and other RAW files are developed by the engine (LibRaw) with the camera's white balance and open into Develop.
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

- Type: Tracking (in thousandths of an em) and Kerning (Metrics or 0) in the Type tool's options, kept in projects and read from PSD files.
- The font menu offers the fonts found on this machine, and in Chromium browsers "Load system fonts..." lists every installed font (with your permission).
- 6 more tests (browser): 414 in all.

### Fixed

- Edit Type no longer resets a font outside its short list to Inter.

## 1.28.0 · 2026-09-24

### Changed

- The README is accurate again: code size, the 27 blend modes (stated once), 28 tools, 17 adjustment kinds, 10 filters and 10 layer styles are taken from the code; the graphics processor work is described; Status lists only what is not verified yet, and the release history lives here.

### Added

- `./formvis counts` prints the README's code sizes and blend-mode count from the repository; `./formvis counts --check` fails when the README has drifted, and a test runs that check.
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

- Hue/Saturation, Photo Filter, Black & White, Channel Mixer, Vibrance, Color Balance and Selective Color adjustment layers now draw on the graphics processor, through a 3D colour table made by formvis's own CPU code and checked to within 1 level of it. Threshold, a hard cut, still draws on the CPU.
- 3 more tests (browser): 386 in all.

## 1.20.0 · 2026-09-24

### Added

- Levels, Curves, Exposure, Invert, Posterize and Brightness/Contrast adjustment layers now draw on the graphics processor (WebGPU or WebGL2) instead of sending the document back to the CPU. Each is applied through a table made by formvis's own CPU code and checked against it, so the result is the CPU's. Other adjustment kinds still draw on the CPU, named in the status bar.
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

- Preferences > Performance > Graphics Processor Settings: the detected graphics processor, Use Graphics Processor, Renderer (Automatic, WebGPU, WebGL2 or CPU) and a GPU memory limit; the GPU mode in use shows in the status bar. If the graphics processor fails to start, formvis turns it off and says so. Drawing still runs on the CPU; the GPU renderer comes next.
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

- Reading and writing another application's project format, with its menu command and file association; formvis's own `.fmv` projects and NodeMode canvasor projects are unaffected.
- A third-party notice from About formvis and the documentation.

## 1.3.0 · 2026-09-24

### Added

- A Home screen: New file, Open and recent projects, shown whenever no document is open (Preferences > General > Auto show the Home Screen) and at any time from the brand mark at the top left; Esc leaves it. Recent projects show names and dates; thumbnails are not built yet.
- 1 more test (browser): 276 in all.

## 1.2.0 · 2026-09-24

### Added

- Preferences (Ctrl+,), with sections: Interface (theme, accent), Performance (History States, the memory undo may hold, region redraws while painting) and File Handling (how soon unsaved work is kept for recovery). Every setting acts on formvis, is kept on this device and takes effect at once.
- 1 more test (browser): 275 in all.

### Changed

- Edit > Settings is now Edit > Preferences.

## 1.1.0 · 2026-09-24

### Added

- The Crop tool's composition overlays: Rule of Thirds, Grid, Diagonal, Triangle, Golden Ratio and Golden Spiral, from an Overlay setting or O while a frame shows; Shift+O flips the Triangle and Golden Spiral.
- 5 more tests (4 unit, 1 browser): 274 in all.

## 1.0.0 · 2026-09-24

### Added

- The Crop tool's Delete Cropped Pixels, on by default: cropping trims pixel layers to the canvas. Turn it off to keep cropped pixels beyond the canvas, where Image > Reveal All brings them back (the only behaviour before 1.0.0).
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

- NodeMode canvasor projects (`.canvasor`, format `com.nodemode.canvasor` version 1) open in formvis, from File > Open, the file picker, or a drop; later versions are refused rather than guessed. They save as `.fmv`.
- 3 more tests (1 backend, 2 browser): 266 in all.

## 0.96.0 · 2026-09-23

### Added

- Menus have submenus, opened beside their rows, and scroll within the window with the scrollbar hidden; the menus are grouped as is usual (File > Export, Layer > New Adjustment Layer, Filter > Blur and others).
- The tool rail groups tools: one slot per group showing the last tool used, a flyout on press and hold or right-click, Shift with the key cycling the group.
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
- Custom shapes in the Shape tool: thirteen of formvis's own (check mark, cross, plus, lightning, speech bubble, drop, ring, crescent, tag, shield, cloud, house, block arrow), with holes where they have them.
- Shapes with holes keep them in PSD files, both ways.
- 7 more tests (4 unit, 3 browser): 228 in all.

### Fixed

- The Shape tool's options now follow the chosen shape: Sides, Points, Indent, Weight and the arrow head settings could not be reached from the options bar since 0.69.0.

## 0.93.0 · 2026-09-23

### Added

- Artboards: Layer > New Artboard, Artboard from Layers and Artboard Options (position, size, background). Contents show only inside the artboard, over its background; the artboard moves with its contents and follows Canvas Size, crops, Image Size and Flip Canvas. File > Export Artboards to Files writes each as a PNG, together in a zip. Saved in .fmv projects.
- 4 more tests (2 unit, 2 browser): 221 in all.

## 0.92.0 · 2026-09-23

### Added

- Export As > Colour profile: sRGB, Display P3 or Adobe RGB (1998). The pixels are converted and the file carries the profile (PNG, JPEG, WebP, TIFF, AVIF; PDF carries none). Saved with export presets.
- 6 more tests (4 unit, 1 backend, 1 browser): 217 in all.

### Notes

- Images with embedded profiles were already shown in the right colours on opening: the browser converts them to sRGB.

## 0.91.0 · 2026-09-23

### Added

- Adjustment layers go into PSD files as live adjustment layers (fifteen kinds, with masks, opacity, blend and clipping), and PSD adjustment layers open as live formvis ones. Grain and Develop, which PSD has no layer for, are reported and left out.
- File > Export PSB (Large Document); .psb files open.
- 16 more tests (15 unit, 1 browser): 211 in all.

## 0.90.0 · 2026-09-23

### Added

- Import .abr brushes (versions 1, 2 and 6 to 10) from the Brush tool: their sampled tips become presets, kept between sessions, and brushes paint with them.
- 7 more tests (4 unit, 1 backend, 2 browser): 195 in all.

### Changed

- Projects are saved as `.fmv`. Older `.formvis` projects still open, and saving one again writes `.fmv`.

### Fixed

- Brushes imported, and gradients saved or edited in the Gradient Editor, now appear in their tool's list at once rather than after switching tools.

## 0.89.0 · 2026-09-23

### Added

- Filter > Shake Reduction: estimates the camera shake's blur trace from the image and removes it; the trace's angle and length, Smoothing and Amount can be adjusted. The trace is straight; curved ones are not found.
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
- Smart filter masks: add from the selection (or white), disable, enable and delete; saved with .formvis projects.
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

- Filter > Liquify (Shift+Mod+X): Forward Warp, Reconstruct, Twirl Clockwise and Counterclockwise, Pucker and Bloat in a preview, with brush size and pressure and Restore All; OK applies as one step, Cancel changes nothing. The displacement field is ported from NodeMode's formvis studio.
- 7 more tests (5 unit, 2 browser): 133 in all.

## 0.79.0 · 2026-09-23

### Added

- Edit > Warp: drag the points of a 4 x 4 grid to bend a layer smoothly; Enter applies, Escape cancels. The warp is ported from NodeMode's formvis studio.
- 9 more tests (7 unit, 2 browser): 126 in all.

## 0.78.0 · 2026-09-23

### Added

- Moving a layer snaps to guides when they are shown and to the grid when it is shown.
- 3 more browser tests: 117 in all.

### Changed

- Snapping measures each layer's visible pixels instead of its whole bounds, so painted layers snap by what you see.

## 0.77.0 · 2026-09-23

### Added

- Rulers (View > Show Rulers, Mod+R) along the top and left of the canvas.
- Guides: drag them out of the rulers, move them with the Move tool, drop them on a ruler to delete; View > Show Guides (Mod+;), Lock Guides (Alt+Mod+;), Clear Guides and New Guide. Guides are undoable and save with .formvis projects.
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

- The Gradient tool draws all five types (Linear, Radial, Angle, Reflected, Diamond) and offers gradient presets: Foreground to Background, Foreground to Transparent, Black, White, Spectrum, Copper, Chrome, and Foreground, Background, Foreground.
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
- Brush presets: Hard round, Soft airbrush, Ink, Pencil and Marker, from the Brush options. The dynamics model and the presets are ported from NodeMode's formvis studio.
- 8 more tests (5 unit, 3 browser): 76 in all.

## 0.69.0 · 2026-09-22

### Added

- The Shape tool (U) draws Polygon (3 to 100 sides), Star (points and indent), Line (weight), Arrow (head length and width) and Heart, beside Rectangle and Ellipse, each as an editable shape layer; Shift+U cycles all seven. The generators are ported from NodeMode's formvis studio.
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
- `./formvis test` (and `formvis.bat test`) runs all three suites, or `unit`, `backend` or `e2e` alone.
- CI runs every suite on each push and pull request, the browser tests in their own job.

## 0.66.0 · 2026-09-22

### Added

- All 27 layer blend modes: Dissolve, Linear Burn, Darker Color, Lighter Color, Vivid Light, Linear Light, Pin Light, Hard Mix, Subtract and Divide join the seventeen, and travel through PSD.
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

- Editable type travels to and from PSD files: export writes type layers as PSD type, and import opens PSD type as editable formvis type.

## 0.62.0 · 2026-09-21

### Added

- Layer styles travel to and from PSD files: export writes them as editable layer effects, patterns included, and import turns the effects into editable formvis styles.

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
- Smart objects travel to and from PSD as smart objects, their originals embedded.

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
- PSD export writes shape layers as shapes with their fill and stroke, and PSD import turns shapes back into editable shape layers.
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

- Paths save with `.formvis` projects and come back when they open.
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
- Open layered PSD files (.psd) and export to them (File > Export PSD), keeping layers, folders, masks, clipping, opacity, blend modes and visibility.

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

- Layer > Layer Style (also on the Layers panel's right-click menu): Drop Shadow, Outer Glow and an outside Stroke, shown live as you adjust them, kept in `.formvis` projects.

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

- Four more blend modes, Soft Light, Hard Light, Exclusion and Linear Dodge (Add), with the list now in the usual order.
- Filter > Unsharp Mask, with Amount, Radius and Threshold, previewed without freezing the window.

### Fixed

- Code formatting and the change logs' quoted code, damaged by the 0.31.0 wording change, are restored exactly.

## 0.32.0 · 2026-09-21

### Changed

- New app icon everywhere formvis shows its mark: the desktop apps (macOS, Windows and Linux icons), the browser tab (with an `.ico` fallback and an Apple touch icon), the welcome card, the About dialog, and the desktop splash window shown while the engine starts.

## 0.31.1 · 2026-09-20

### Changed


## 0.31.0 · 2026-09-20

### Changed

- Licensed under the Apache License 2.0, Copyright 2026 nodemode-ai.
- Documentation, comments and interface text now describe formvis's own behaviour.

## 0.30.0 · 2026-09-20

### Added

- Crop edges snap to visible layers' edges as well as the canvas: creating or resizing snaps the edge you drag, moving snaps the frame while keeping its size, and a fixed ratio only snaps moves.
- Export JPEG has the shortcut, Alt+Shift+Cmd/Ctrl+S.

### Verified

- Every one of the 33 menu shortcuts was compared with formvis's; all match, apart from Close (Cmd/Ctrl-W in the desktop app, Alt+Cmd/Ctrl+W on the web where browsers reserve it) and the macOS-only Hide Others.

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

- The export was checked against the own validation rules and reopened in formvis; it has not yet been opened itself, which runs only on macOS.

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

- Clone Stamp was recorded as missing a "brush-sized sample ring". marks its source with a crosshair, which formvis already draws. The real difference is that previews inside the brush circle what a click would stamp, which formvis does not do yet.

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

- Deleting a layer that other layers are clipped to now asks: Bake and Delete keeps their clipped look in their own pixels; Remove Links and Delete unclips them and shows all their pixels. Either can be undone. Before, formvis unlinked them without asking.

### Corrected

- 0.18.0 listed "live masks" as not built. In a live mask is a clipping mask, which formvis has had all along; only this deletion choice was missing.

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
- Desktop releases: macOS signing and notarization from repository secrets, the hardened runtime, `.formvis` file associations, and in-app updates from GitHub Releases once the updater key exists. See the wiki's Releasing page.

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

- Color picker: clicking the foreground or background swatch opens a picker with a saturation and brightness field, a hue strip, new and current swatches, and RGB and hex entry. Click the canvas while it is open to sample a color.

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
- Files: new canvas, image import (drop, paste, picker; HEIC and TIFF through the engine), project library save and open, `.formvis` download, PNG and JPEG export.
- Remove Background with rembg (ML) or OpenCV GrabCut (lightweight), producing a layer mask.
- NodeMode styling, 14 themes, the portal protocol and send to canvas.
- Engine service, setup scripts with Windows twins, Tauri 2 desktop shell, CI, wiki publishing and desktop release workflows, wiki, project skill pack.

### Fixed before release

Found by the throttled browser verification and the Phase 2 check: Escape could not close a dialog opened with its default button disabled; double-click rename and folder disclosure did nothing; a no-op layer move created an undo entry; adding a mask, renaming a tab and the engine readout shifted layout; Inter swapped in after reveal; option bar icon buttons wrote their label into the icon box.

### Known gaps

Desktop shell not yet compiled; ML background removal not exercised end to end; Hue/Saturation and Grain adjustments render without effect; crop, retouching, gradient and shape tools, filters, Image Size and Canvas Size are not built yet.

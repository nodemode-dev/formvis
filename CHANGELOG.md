# Changelog

Versions follow `v*.*.*` with dots. Dates are UTC.

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

- Levels Auto: Contrast, Color, and Color + neutral midtones, as the reference app computes them, from an Auto choice in the Levels panel.
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

- Spot Healing (J): paint over a spot and it heals on release, as Content-Aware, Create Texture or Proximity Match, ported from the reference app's healing kernel.
- Clone Stamp (S): Alt-click sets the source; Aligned keeps the offset between strokes; Sample all layers copies what you see.
- Smear (R): Liquify pushes pixels with the brush, Blur softens (a new stroke softens further), Smudge carries color along the stroke.
- Content-Aware Fill (Shift+Backspace, Edit menu) fills the selection from its surroundings.

### Known gaps

The Remove Background panel, the editable transform inspector with free distort and snapping, floating selections, the color picker, Hue/Saturation bands and eyedroppers, Levels Auto, the JPEG export sheet, and Smear's Blur on masks; desktop shell still uncompiled.

## 0.2.0 · 2026-09-19

### Added

- Adjustments from the reference app: Hue/Saturation (Master and six color ranges, colorize, invert range) and Grain join Levels, Curves, Exposure and Gradient Map. Each works as an editable adjustment layer (Layer, New Adjustment Layer; double-click to edit) and as a direct edit (Image menu), with live preview. Levels shows a histogram; Curves has a point editor.
- Filter menu: Gaussian Blur and Motion Blur (spreading past the layer edge), Add Noise, Lens Correction, and Remove Background moved here as in the reference app.
- Edit: Cut, Copy, Copy Merged, Paste in place, using the system clipboard.
- Select: Mask's Black Areas, Expand and Contract by an amount.
- Image: Canvas Size (units, anchor, extension color) and Image Size (constrain, resolution, resampling).
- Tools: Crop (ratios, snapping to the canvas), Gradient (linear or radial, editable ends until applied), Shape (rectangle or ellipse layers that redraw crisply when resized).

### Fixed

- Clearing a selection on a mask now fills with the background color, as in the reference app.
- Hidden rows inside dialogs now actually hide.

### Known gaps

Spot Healing, Clone Stamp, the Blur tool, Content-Aware Fill, the Remove Background panel, the editable transform inspector, floating selections, the color picker, Hue/Saturation bands and eyedroppers, Levels Auto, the JPEG export sheet; desktop shell still uncompiled.

## 0.1.0 · 2026-09-19

### Added

- Engine: layers with pass-through folders, 13 blend modes, raster and folder masks, clipping chains, Levels, Curves, Exposure and Gradient Map adjustments on open, selections with marching ants, brush strokes, transforms, 100-step history.
- Tools: Move with transform handles, Marquee, Lasso, Magic Wand, Brush and Eraser, Eyedropper, Hand, Zoom.
- Files: new canvas, image import (drop, paste, picker; HEIC and TIFF through the engine), project library save and open, `.ref` import (zip or folder), `.sonny` download, PNG and JPEG export.
- Remove Background with rembg (ML) or OpenCV GrabCut (lightweight), producing a layer mask.
- NodeMode styling, 14 themes, the portal protocol and send to canvas.
- Engine service, setup scripts with Windows twins, Tauri 2 desktop shell, CI, wiki publishing and desktop release workflows, wiki, project skill pack.

### Fixed before release

Found by the throttled browser verification and the Phase 2 check: Escape could not close a dialog opened with its default button disabled; double-click rename and folder disclosure did nothing; a no-op layer move created an undo entry; adding a mask, renaming a tab and the engine readout shifted layout; Inter swapped in after reveal; option bar icon buttons wrote their label into the icon box.

### Known gaps

Desktop shell not yet compiled; ML background removal not exercised end to end; Hue/Saturation and Grain adjustments render without effect; crop, retouching, gradient and shape tools, filters, Image Size, Canvas Size and `.ref` export are not built yet.

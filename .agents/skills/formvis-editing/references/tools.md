# formvis tools

Generated from the engine's catalogue by `./formvis agents sync`; do not edit by hand.

## Contents

- Look: `get_document`, `get_image`, `get_selection`, `get_layer_tree`
- Commands: `list_commands`, `describe_command`, `run_command`, `run_commands`
- Files and documents: `new_document`, `open_file`, `save_project`, `export_image`, `switch_document`
- Size and shape: `generative_expand`, `upscale`, `resize_image`, `resize_canvas`, `crop`, `flip_canvas`
- Layers: `add_layer`, `set_layer`, `delete_layer`, `place_image`, `transform_layer`, `rasterize_layer`, `duplicate_layer`, `move_layer`, `merge_layers`, `flatten_image`
- Text and shapes: `add_text`, `draw_shape`
- Selecting: `select`, `select_subject`, `select_color_range`
- Painting and generating: `fill`, `generative_fill`, `generate_image`, `remove_background`
- Colour, filters and looks: `add_adjustment`, `apply_filter`, `set_adjustment`, `color_match`, `add_film_layer`
- History: `undo`, `redo`
- Files without the window, and jobs: `file_info`, `convert_file`, `jobs_list`, `jobs_cancel`
- The window itself: `ui_inspect`, `ui_state`, `ui_screenshot`, `ui_menu_list`, `ui_menu_invoke`, `ui_set`, `ui_dialog`, `ui_pointer`, `ui_key`, `ui_window`, `control_call`, `file_roots`
- Other: `close_document`, `ping`, `list_plugins`, `select_feather`, `select_grow`, `select_point`, `timeline_get`, `timeline_create`, `timeline_delete`, `timeline_set`, `timeline_go_to`, `timeline_clip`, `timeline_split`, `timeline_keyframe`, `timeline_transition`, `timeline_frame_image`, `timeline_render`, `command_job`, `select_mask`, `list_settings`, `list_fonts`, `set_settings`, `boxes_list`, `boxes_add`, `boxes_set`, `boxes_remove`, `boxes_from_selection`, `boxes_clear`, `sample_box`, `frequency_separation`, `sample_depth`, `depth_edit`, `set_crop`, `export_mask`, `list_recipes`, `set_active_layer`, `select_color`, `select_shape`, `select_range`, `sample_mean_color`, `align_layers`, `group_layers`, `set_group`, `set_mask`, `set_text`, `list_history`, `take_snapshot`, `restore_snapshot`, `delete_snapshot`, `extend_canvas`, `export_layer`, `read_log`, `list_brush_tips`, `set_brush`, `add_filter`, `set_filter`, `apply_preset`, `depth_from_layer`, `match_edges`, `realism_pass`, `compare`, `set_status`, `ailabel_add`, `ailabel_remove`, `ailabel_info`, `film_looks`, `film_apply_look`, `film_add_point`, `film_copy_points`, `film_paste_points`, `glb_place`, `glb_edit`, `glb_info`

## get_document

The open document: name, size, resolution, colour mode (rgb, cmyk, grayscale...), bit depth, colour profile, the layers bottom to top (id, name, kind, visible, opacity, blend, parent group), the active layer and the selection's bounds. Use when you need the document's size, mode, layer ids or documents before any edit.

- no parameters

Note: read-only.

## get_image

A picture of the document as it looks, its longer side at most max_size pixels (a PNG, or a JPEG with format). view document is the flattened picture; editor is the window's canvas as the person sees it, with the selection outline, guides and tool overlays; layer is one layer alone (id from get_document). x, y, width and height crop a box in document pixels, shown at 1:1 unless it is larger than max_size. Use when you need to see the picture, and again after each change to check it.

- `max_size`: integer; default 1024
- `view`: string (document | editor | layer); default "document"
- `id`: string; A layer id from get_document; for view layer.
- `x`: integer
- `y`: integer
- `width`: integer
- `height`: integer
- `format`: string (png | jpeg); default "png"
- `quality`: number; default 0.9

Note: read-only.

## new_document

Opens a new document of width x height pixels, or of an aspect and size class (a model-friendly size, sides in steps of 16: size_class 1k is about 1024 on the longer side, 2k about 2048, 4k about 4096). Width and height win when given; with no size at all the document is 1920 by 1080. mode (rgb, grayscale, lab) and depth (8, 16 or 32 bits a channel) set the colour mode and bit depth; background is white, transparent, black or a colour #rrggbb. CMYK has a dialog: run_command mode-cmyk. Use when there is nothing open, or the person wants a blank canvas of a size.

- `mode`: string (rgb | grayscale | lab); default "rgb"
- `depth`: integer (8 | 16 | 32); default 8
- `width`: integer
- `height`: integer
- `aspect`: string (1:1 | 4:3 | 3:4 | 3:2 | 2:3 | 16:9 | 9:16 | 21:9 | 5:4 | 4:5)
- `size_class`: string (1k | 2k | 4k); default "1k"
- `name`: string
- `background`: string; default "white"; white, transparent, black or #rrggbb

## select

Changes the selection: a rectangle or ellipse (x, y, width, height in pixels) combined by mode, or all, none, or invert. Use when an edit, fill or generative_fill should act on a region only.

- `shape`: string (rectangle | ellipse | all | none | invert); required
- `x`: number
- `y`: number
- `width`: number
- `height`: number
- `mode`: string (replace | add | subtract | intersect); default "replace"

## add_layer

Adds an empty layer above the active one and makes it active; returns its id. Use when a change needs its own empty layer to paint or fill on.

- `name`: string

## set_layer

Changes a layer's name, visibility, opacity (0 to 1), blend mode or locks (locks: pixels, position, transparency, all; true locks, false unlocks, left out stays), or makes it the active layer. Use when a layer should be renamed, hidden, faded, blended, or made the active one.

- `id`: string; required; A layer id from get_document.
- `name`: string
- `visible`: boolean
- `opacity`: number
- `blend`: string
- `active`: boolean
- `locks`: object

## delete_layer

Deletes a layer (undoable). Use when a layer is no longer wanted.

- `id`: string; required; A layer id from get_document.

Note: replaces or removes.

## fill

Fills the selection (or the whole active layer when nothing is selected) with a colour. Use when a selection or layer should be one flat colour.

- `color`: string; required; #rrggbb

## add_adjustment

Adds an adjustment layer (for example curves, levels, hsv, exposure, splitToning, halation, glow) with optional parameters. Use when colour or tone should change while staying editable.

- `kind`: string; required
- `params`: object; The adjustment's parameters, as its Properties show them.

## place_image

Places a PNG, JPEG or WebP image as a new layer at x, y, at its own size unless scale (percent) or fit is given: fit contain or cover sizes it to the document and centres it, center centres it at its size, smart_object makes it a smart object so it can be scaled without loss. From path, an absolute path to a file, or data, base64. Use when another picture file should join the document as a layer.

- `scale`: number; Percent of the image's own size.
- `fit`: string (none | contain | cover); default "none"
- `center`: boolean; default false
- `smart_object`: boolean; default false
- `path`: string; Absolute path to a .png, .jpg, .jpeg or .webp file; use this for files on disk.
- `data`: string; Base64 image data, when there is no file.
- `name`: string
- `x`: number; default 0
- `y`: number; default 0

## undo

Steps back through the document's history. Use when the last change was wrong; call it once per step to remove.

- `steps`: integer; default 1

## redo

Steps forward through the document's history. Use when an undo went too far.

- `steps`: integer; default 1

## generative_fill

Fills the selection (select first) and returns the new layer, masked to the selection. With no prompt it removes what the selection covers, filling from the surroundings; with a prompt it paints that. model auto uses LaMa (no prompt) or Krea 2 (a prompt) on this computer when downloaded, else FLUX on fal, which asks the person first. Fails with what to download or set up when nothing can run. Use when something should be removed from or added to a selected region.

- `prompt`: string; default ""
- `model`: string (auto | lama | krea-2 | fal); default "auto"; auto: on this computer first (LaMa with no prompt, Krea 2 with one), fal last (asks the person, costs money).
- `influence`: number; default 0.4; Krea 2 only: how much what the selection covers shapes the result.

Note: may use fal.

## generative_expand

Grows the canvas by the margins (pixels) and fills the new border, continuing the picture; a prompt describes what to add there. model as generative_fill. Use when the canvas should grow and the new border be painted in.

- `left`: integer; default 0
- `top`: integer; default 0
- `right`: integer; default 0
- `bottom`: integer; default 0
- `prompt`: string; default ""
- `model`: string (auto | lama | krea-2 | fal); default "auto"; auto: on this computer first (LaMa with no prompt, Krea 2 with one), fal last (asks the person, costs money).

Note: may use fal.

## generate_image

Generates a picture from a prompt as a new layer the size of the document. model auto uses Krea 2 or FLUX.2 [klein] on this computer when installed, else FLUX1.1 [pro] on fal, which asks the person first. Use when a whole new picture is wanted from a description.

- `prompt`: string; required
- `model`: string (auto | krea-2 | flux2-klein-4b | fal); default "auto"

Note: may use fal.

## upscale

Enlarges what the document shows 2 or 4 times into a new document. model auto uses Real-ESRGAN on this computer when downloaded, else Real-ESRGAN on fal (asks first). Use when the picture needs more pixels with detail kept.

- `scale`: integer (2 | 4); default 2
- `model`: string (auto | local | fal); default "auto"

Note: may use fal.

## remove_background

Removes the active layer's background on this computer, keeping the subject (a mask on the layer; undoable). Use when the subject of the active layer should be kept and its background dropped.

- no parameters

## open_file

Opens a picture (PNG, JPEG, WebP, AVIF, GIF, TIFF, HEIC, QOI, TGA, ICO (its largest size), PBM, PGM, PPM, PAM, camera raw) or a project (.fvd, .fmv, .psd, .psb, .ora) from an absolute path as a new document. Use when the person gives a path to a picture or project to work on.

- `path`: string; required; Absolute path, e.g. /Users/me/Pictures/beach.jpg

## save_project

Saves the document as a formvis project (.fvd: layers, masks, adjustments and text stay editable) at an absolute path. A file already there is kept unless overwrite is true. Use when the work should be kept with layers still editable.

- `path`: string; required; Absolute path ending .fvd
- `overwrite`: boolean; default false; Replace a file already at the path. Without it an existing file is not touched.

Note: replaces or removes.

## export_image

Writes the document to an absolute path by the path's extension: PNG, JPEG or WebP as it looks (scale applies), or with every layer kept as .psd, .psb (a document past 30000 pixels a side) or .ora (RGB and grayscale documents; scale does not apply). A file already there is kept unless overwrite is true. Use when a flat PNG, JPEG or WebP is the deliverable.

- `path`: string; required; Absolute path ending .png, .jpg, .webp, .psd, .psb or .ora
- `quality`: number; default 0.92
- `scale`: number; default 1; Writes the picture at this factor of its size; the document is not changed.
- `overwrite`: boolean; default false; Replace a file already at the path. Without it an existing file is not touched.

Note: replaces or removes.

## switch_document

Makes an open document the one tools act on, by its id from get_document's documents. Use when more than one document is open and another should be edited.

- `id`: string; required; A layer id from get_document.

## close_document

Closes an open document by its id from get_document's documents (the active one when id is left out) without asking about unsaved changes: they are discarded, so save_project first to keep them. The person can bring the tab back with Reopen Closed Tab. Use when an open document is finished with and its tab should go.

- `id`: string; A document id from get_document's documents.

Note: replaces or removes.

## ping

Reports in one call whether formvis is there: its version, whether the window is open and connected, whether outside agents are allowed, and the open documents (id, name, size). Never opens the window and never asks the person anything. Use when you want to know whether formvis is running, connected and allowed before the first edit.

- no parameters

Note: read-only.

## list_plugins

Lists the plugins in the plugins folder: file name, size, whether it is on, whether it is running, its name and the commands it registered (run one with run_command id plugin:<file>:<command>). Use when you need to know which plugins are installed and what commands they add.

- no parameters

Note: read-only.

## resize_image

Resamples the whole document. Give width and height in pixels, or one of them (the other follows the shape), or percent (100 keeps the size), or long_side (the longer side in pixels, the shape kept). Use when the whole picture should be scaled to a size.

- `width`: integer
- `height`: integer
- `percent`: number
- `long_side`: integer

## resize_canvas

Changes the canvas to width x height without scaling the picture; anchor says where the picture stays. Use when space should be added or removed around the picture without scaling it.

- `width`: integer; required
- `height`: integer; required
- `anchor`: string (center | top-left | top | top-right | left | right | bottom-left | bottom | bottom-right); default "center"

## crop

Crops the document to a rectangle in pixels. Use when only a rectangle of the picture should remain.

- `x`: integer; required
- `y`: integer; required
- `width`: integer; required
- `height`: integer; required

Note: replaces or removes.

## flip_canvas

Flips the whole document horizontally or vertically. Use when the whole document should be mirrored.

- `direction`: string (horizontal | vertical); required

## transform_layer

Moves, scales, rotates or flips a layer (id from get_document): x and y are its new top-left in pixels, scale a percentage, rotation degrees. Use when a layer should be moved, scaled, rotated or flipped.

- `id`: string; required; A layer id from get_document.
- `x`: number
- `y`: number
- `scale`: number
- `rotation`: number
- `flip`: string (horizontal | vertical)

## rasterize_layer

Turns a text, shape or smart-object layer into pixels, so filters and painting apply to it. Use when a text, shape or smart object needs pixels before a filter or painting.

- `id`: string; required; A layer id from get_document.

## duplicate_layer

Duplicates a layer above itself; returns the copy's id. Use when a layer should be copied, for example before a destructive change.

- `id`: string; required; A layer id from get_document.
- `name`: string

## move_layer

Moves a layer above or below another in the stack. Use when the stacking order of layers should change.

- `id`: string; required; A layer id from get_document.
- `target`: string; required; A layer id from get_document.
- `where`: string (above | below); default "above"

## merge_layers

Merges layers into one (the ids given, or with only one id that layer into the one below it). Use when several layers should become one.

- `ids`: array; required

Note: replaces or removes.

## flatten_image

Flattens every layer into one. Use when the person wants everything on a single layer.

- no parameters

Note: replaces or removes.

## add_text

Adds a text layer; returns its id. x and y are the top-left of the text in pixels; size in pixels; color as #rrggbb. Use when words should appear on the picture.

- `text`: string; required
- `x`: number; default 0
- `y`: number; default 0
- `size`: number; default 48
- `color`: string; default "#000000"
- `font`: string; default "Inter"
- `bold`: boolean; default false
- `italic`: boolean; default false
- `align`: string (left | center | right); default "left"

## draw_shape

Draws a shape layer: a rectangle, ellipse, triangle, star, line or arrow within x, y, width, height, filled and/or stroked (colors #rrggbb; omit fill or stroke for none). Use when a plate, line, arrow or other shape is needed.

- `kind`: string (rectangle | ellipse | triangle | star | polygon | line | arrow); required
- `x`: number; required
- `y`: number; required
- `width`: number; required
- `height`: number; required
- `fill`: string
- `stroke`: string
- `stroke_width`: number; default 3

## select_subject

Selects the main subject (a person, animal or object) on this computer. Use when the main subject should be selected without drawing a region.

- no parameters

## select_color_range

Selects pixels near a colour (#rrggbb) in the active layer; fuzziness 0 to 200 widens the range. Use when a colour (a sky, a skin tone) should be selected.

- `color`: string; required
- `fuzziness`: number; default 40

## select_feather

Softens the selection's edge by radius pixels (0.1 to 1000), as Select > Modify > Feather; the selection stays one selection with a gradual edge. Needs a selection. Use when a selection's edge should fade, so a fill or edit blends in.

- `radius`: number; required
- `at_bounds`: boolean; default false; Feather along the canvas edge too, instead of carrying the edge pixels on.

## select_grow

Makes the selection bigger or smaller by amount pixels (1 to 1024), as Select > Modify > Expand or Contract. Needs a selection. Use when a selection should be made a few pixels bigger or smaller.

- `amount`: integer; required
- `direction`: string (expand | contract); default "expand"
- `at_bounds`: boolean; default false; Act along the canvas edge too, instead of carrying the edge pixels on.

## select_point

Selects the object at points, as the Object Selection tool does: inside points (x, y in document pixels) lie on the object, outside points on what it must not include. Runs the Segment Anything model on this computer, which takes a few seconds the first time and fails with how to install it when it is missing. Use when an object should be selected by pointing at it rather than drawing around it.

- `inside`: array; required
- `outside`: array
- `mode`: string (replace | add | subtract | intersect); default "replace"

## apply_filter

Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Filter Gallery: filterGallery {effects: [{filter, values, visible}]}, its effect layers applied in order, the first at the bottom, hidden ones skipped; filter is one of: coloredPencil {pencilWidth 1 to 24, strokePressure 0 to 15, paperBrightness 0 to 50}, cutout {numberOfLevels 2 to 8, edgeSimplicity 0 to 10, edgeFidelity 1 to 3}, dryBrush and fresco {brushSize 0 to 10, brushDetail 0 to 10, texture 1 to 3}, filmGrain {grain 0 to 20, highlightArea 0 to 20, intensity 0 to 10}, neonGlow {glowSize -24 to 24, glowBrightness 0 to 50, glowColor (#rrggbb)}, paintDaubs {brushSize 1 to 50, sharpness 0 to 40, brushType: simple|lightRough|darkRough|wideSharp|wideBlurry|sparkle}, paletteKnife {strokeSize 1 to 50, strokeDetail 1 to 3, softness 0 to 10}, plasticWrap {highlightStrength 0 to 20, detail 1 to 15, smoothness 1 to 15}, posterEdges {edgeThickness 0 to 10, edgeIntensity 0 to 10, posterization 0 to 6}, roughPastels {strokeLength 0 to 40, strokeDetail 1 to 20, texture: canvas|brick|burlap|sandstone, scaling 50 to 200, relief 0 to 50, light: top|topRight|right|bottomRight|bottom|bottomLeft|left|topLeft, invert}, smudgeStick {strokeLength 0 to 10, highlightArea 0 to 20, intensity 0 to 10}, sponge {brushSize 0 to 10, definition 0 to 25, smoothness 1 to 15}, underpainting {brushSize 0 to 40, textureCoverage 0 to 40, and roughPastels' texture, scaling, relief, light, invert}, watercolor {brushDetail 1 to 14, shadowIntensity 0 to 10, texture 1 to 3}, accentedEdges {edgeWidth 1 to 14, edgeBrightness 0 to 50, smoothness 1 to 15}, angledStrokes {directionBalance 0 to 100, strokeLength 3 to 50, sharpness 0 to 10}, crosshatch {strokeLength 3 to 50, sharpness 0 to 20, strength 1 to 3}, darkStrokes {balance 0 to 10, blackIntensity 0 to 10, whiteIntensity 0 to 10}, inkOutlines {strokeLength 1 to 50, darkIntensity 0 to 50, lightIntensity 0 to 50}, spatter {sprayRadius 0 to 25, smoothness 1 to 15}, sprayedStrokes {strokeLength 0 to 20, sprayRadius 0 to 25, strokeDirection: rightDiagonal|horizontal|leftDiagonal|vertical}, sumiE {strokeWidth 3 to 15, strokePressure 0 to 15, contrast 0 to 40}, diffuseGlow {graininess 0 to 10, glowAmount 0 to 20, clearAmount 0 to 20}, glass {distortion 0 to 20, smoothness 1 to 15, texture: frosted|blocks|canvas|tinyLens|ribbed|reeded|wavy|pebbled, scaling 50 to 200, invert}, oceanRipple {rippleSize 1 to 15, rippleMagnitude 0 to 20}, glowingEdges {edgeWidth 1 to 14, edgeBrightness 0 to 20, smoothness 1 to 15}, basRelief {detail 1 to 15, smoothness 1 to 15, light}, chalkCharcoal {charcoalArea 0 to 20, chalkArea 0 to 20, strokePressure 0 to 5}, charcoal {charcoalThickness 1 to 7, detail 0 to 5, lightDarkBalance 0 to 100}, chrome {detail 0 to 10, smoothness 0 to 10}, conteCrayon {foregroundLevel 1 to 15, backgroundLevel 1 to 15, and roughPastels' texture, scaling, relief, light, invert}, graphicPen {strokeLength 1 to 15, lightDarkBalance 0 to 100, strokeDirection}, halftonePattern {size 1 to 12, contrast 0 to 50, patternType: dot|circle|line}, notePaper {imageBalance 0 to 50, graininess 0 to 20, relief 0 to 25}, photocopy {detail 1 to 24, darkness 1 to 50}, plaster {imageBalance 0 to 50, smoothness 1 to 15, light}, reticulation {density 0 to 50, foregroundLevel 0 to 50, backgroundLevel 0 to 50}, stamp {lightDarkBalance 0 to 50, smoothness 1 to 50}, tornEdges {imageBalance 0 to 50, smoothness 1 to 15, contrast 1 to 25}, waterPaper {fiberLength 3 to 50, brightness 0 to 100, contrast 0 to 100}, craquelure {crackSpacing 2 to 100, crackDepth 0 to 10, crackBrightness 0 to 10}, grain {intensity 0 to 100, contrast 0 to 100, grainType: regular|soft|sprinkles|clumped|contrasty|enlarged|stippled|horizontal|vertical|speckle}, mosaicTiles {tileSize 2 to 100, groutWidth 1 to 15, lightenGrout 0 to 10}, patchwork {squareSize 0 to 10, relief 0 to 25}, stainedGlass {cellSize 2 to 50, borderThickness 1 to 20, lightIntensity 0 to 10}, texturizer {roughPastels' texture, scaling, relief, light, invert}; colours come from the foreground and background colours (the Sketch effects' ink and paper). Unnamed settings keep their defaults. Use when a blur, sharpen, noise or other filter should change the active layer.

- `kind`: string (gaussianBlur | motionBlur | addNoise | unsharpMask | lensBlur | smartSharpen | surfaceBlur | radialBlur | tiltShift | irisBlur | fieldBlur | average | blur | blurMore | boxBlur | shapeBlur | smartBlur | sharpen | sharpenMore | sharpenEdges | despeckle | dustAndScratches | median | reduceNoise | custom | hsbHsl | highPass | maximum | minimum | offset | deInterlace | ntscColors | displace | pinch | polarCoordinates | ripple | shear | spherize | twirl | wave | zigZag | colorHalftone | crystallize | facet | fragment | mezzotint | mosaic | pointillize | diffuse | emboss | extrude | findEdges | oilPaint | solarize | tiles | traceContour | wind | clouds | differenceClouds | fibers | lensFlare | lightingEffects | flame | pictureFrame | tree | spinBlur | filterGallery); required
- `settings`: object; default {}

## set_adjustment

Changes an adjustment layer's parameters (id from get_document; the same parameters as add_adjustment). Takes the parametric adjustments (such as photoFilter, colorBalance, channelMixer, selectiveColor), grain and exposure; apply_preset sets gradientMap, curves and levels from a preset. Use when an adjustment layer made earlier needs different settings.

- `id`: string; required; A layer id from get_document.
- `params`: object; required

## color_match

Matches a layer's colours to what is beneath it or around it, as a Curves layer clipped to it; amount 0 to 1. Use when a pasted layer should match the colours around or beneath it.

- `id`: string; required; A layer id from get_document.
- `to`: string (beneath | around); default "beneath"
- `amount`: number; default 1

## add_film_layer

Adds a film look as its own layer: a light leak (color amber|red|magenta|gold from left|right|top|bottom|corner) or a frame (style film|white|line). Use when a light leak, grain or other film look is wanted as its own layer.

- `kind`: string (leak | frame); required
- `color`: string (amber | red | magenta | gold); default "amber"
- `from`: string (left | right | top | bottom | corner); default "left"
- `style`: string (film | white | line); default "film"

## timeline_get

The document's video timeline: frame rate, length in frames and seconds, the playhead, the work area, loops, and per layer (top first) its clip (start and length in frames), fades and keyframes. Null when it has none. Use when you need to know the video timeline's state before changing it.

- no parameters

Note: read-only.

## timeline_create

Creates a video timeline with a track per layer, fps frames a second and seconds long. A document has a video timeline or a frame animation, not both. Use when the document should become a video with a track per layer.

- `fps`: number; default 30
- `seconds`: number; default 5

## timeline_delete

Deletes the video timeline: its clips, keyframes and transitions (the layers stay). Use when the video timeline should go and the layers stay.

- no parameters

Note: replaces or removes.

## timeline_set

Changes the frame rate, the length in seconds, the work area (work_in to work_out, frames, work_out excluded) or the loop count (0 forever). Use when the frame rate, length, work area or loops of the video should change.

- `fps`: number
- `seconds`: number
- `work_in`: integer
- `work_out`: integer
- `loops`: integer

## timeline_go_to

Moves the playhead to a frame; the window shows that moment. Not an edit. Use when the window should show a moment of the video.

- `frame`: integer; required

## timeline_clip

Moves or trims a layer's clip: start is the frame where it begins, length how many frames it lasts. Outside its clip the layer does not show. Use when a layer should appear later, last longer or be trimmed in the video.

- `id`: string; required; A layer id from get_document.
- `start`: integer
- `length`: integer

## timeline_split

Splits a layer's clip at a frame (default the playhead): the clip ends there and a copy of the layer carries on with the rest and the same keyframes; returns the copy's id. Use when a layer's clip should be cut in two at a frame.

- `id`: string; required; A layer id from get_document.
- `frame`: integer

## timeline_keyframe

Keys a layer's property at a frame (default the playhead): x and y in pixels, opacity and fill 0 to 1, style 1 (its layer style on) or 0; interpolation linear or hold (until the next keyframe). delete removes the keyframe at that frame; clear removes all of the property's keyframes. Use when a layer's position, opacity or fill should animate.

- `id`: string; required; A layer id from get_document.
- `property`: string (x | y | opacity | fill | style); required
- `frame`: integer
- `value`: number
- `interpolation`: string (linear | hold); default "linear"
- `delete`: boolean; default false
- `clear`: boolean; default false

## timeline_transition

Adds a transition to a layer's clip: fade_in, fade_out or fade (both) over seconds, to transparent or with black or white (the layer turns to that colour at the clip's edge); cross_fade with the clip starting or ending within it (only the upper fades, so the picture never dips); or remove. Use when a clip should fade in or out.

- `id`: string; required; A layer id from get_document.
- `kind`: string (fade_in | fade_out | fade | cross_fade | remove); required
- `seconds`: number; default 1
- `color`: string (transparent | black | white); default "transparent"

## timeline_frame_image

One frame of the video timeline as a PNG image, its longer side at most max_size pixels. Use when you need to see one frame of the video.

- `frame`: integer; required
- `max_size`: integer; default 1024

Note: read-only.

## timeline_render

Renders the video timeline to an absolute path: .mp4 (H.264), .gif, or .zip (numbered PNG frames); every frame, or from to to (frames, to excluded); scale 1, 0.5 or 0.25. A file already there is kept unless overwrite is true. Use when the video should be written to an mp4, gif or frame zip.

- `path`: string; required; Absolute path ending .mp4, .gif or .zip
- `from`: integer
- `to`: integer
- `scale`: number (1 | 0.5 | 0.25); default 1
- `overwrite`: boolean; default false; Replace a file already at the path. Without it an existing file is not touched.

Note: replaces or removes.

## list_commands

Lists formvis's commands: every menu and palette action, each as id, label, when (what it is for) and params (what it takes). Narrow it with group (a menu or family such as Filter or Layer) or text (words from the label, id or description); an unfiltered list is capped, so filter first. Use when the typed tools do not cover what the person asked and you need to find the formvis command that does.

- `group`: string
- `text`: string
- `enabled`: boolean; true lists only the commands that can run right now, false only those that cannot; each row says enabled, mutates, its keys and, when disabled, disabledReason (and needsDocument when no document is open).

Note: read-only.

## describe_command

One command in full: its label, group, description, when to use it, params with types and defaults, and whether it changes the document or is risky (cannot be undone). Use when you found a command with list_commands and need its params before running it.

- `id`: string; required; A command id from list_commands.

Note: read-only.

## run_command

Runs one command by id with params, as one undoable step. A command marked risky waits for the person's approval in the formvis window (Window > Agent Connect) unless they allowed all. With wait false it starts the command and answers at once with a job id; command_job gives its result. Use when a command from list_commands should run once.

- `id`: string; required; A command id from list_commands.
- `params`: object; The command's params, as describe_command lists them.
- `wait`: boolean; default true; false: start it in the background and return a job id (a long command such as a model run); do not edit the document until command_job says it is done.

Note: replaces or removes.

## command_job

The state of commands started with run_command wait false: job (an id such as cmd:1) gives that one, none lists the last 50. Each shows running, done or failed, the seconds it has taken, its message and its result. Use when you started a command with wait false and need its result.

- `job`: string; A job id from run_command, such as cmd:1.

Note: read-only.

## run_commands

Runs several commands in order as one batch and one undo step; it stops at the first failure and says which command failed. A risky command in the batch asks the person first. Use when several commands belong together and should undo as one step.

- `commands`: array; required

Note: replaces or removes.

## get_selection

The selection: its bounds in pixels (x, y, width, height), or none when nothing is selected. Use when you need the selection's bounds before filling, cropping or generating.

- no parameters

Note: read-only.

## get_layer_tree

The layers as a tree, bottom to top, each with id, name, kind, visible and its children (a focused view of get_document's layers, without the document details). Use when you need the layer ids and nesting without the other document details.

- no parameters

Note: read-only.

## select_mask

Makes the selection from a layer: its pixels (transparency), its layer mask, or its vector mask. Defaults to the active layer and replaces the selection. Use when a layer's pixels or mask should become the selection.

- `id`: string; A layer id from get_document.
- `source`: string (transparency | mask | vector); default "transparency"
- `invert`: boolean; default false
- `mode`: string (replace | add | subtract | intersect); default "replace"

## list_settings

The window's simple settings (numbers, on-off choices and short texts in Preferences) with their current values. Use when you need to know how the window is set up before changing it.

- no parameters

Note: read-only.

## list_fonts

The font families the window offers for type, bundled and installed ones, most recently used first. Give family to get that family's faces (regular, bold, italic, bold italic) with whether the font file could be read and how many characters it maps; use a listed family name in add_text. Use when you need a font family name that exists here before adding or changing text.

- `family`: string; A family from the list; omit to list all families.

Note: read-only.

## file_info

Reads a picture or project file at an absolute path without opening it: size in pixels, colour mode, bit depth, resolution, whether it carries a colour profile, pages or frames, and for projects (.fvd, .fmv, .ora, .psd, .psb) the layer count. Works with no window open. Use when you need a file's size, mode, depth or layer count and no window needs to open it.

- `path`: string; required; Absolute path to a picture or project file.

Note: read-only.

## convert_file

Converts a picture file to another format without opening it in the window: path in, output_path out, the output's extension picks the format (png, jpg, webp, avif, tif, bmp, qoi, tga, ico, pdf, ppm, pgm, pbm, pnm, dpx, fits, wbmp). The result is one flat picture; layers are not kept (open_file then save_project does that). A file already at output_path is kept unless overwrite is true. Works with no window open. Use when a picture file should become another format and nothing else about it changes.

- `path`: string; required; Absolute path to the picture to read.
- `output_path`: string; required; Absolute path to write, with the new extension.
- `quality`: number; default 0.92; For jpg, webp and avif.
- `dpi`: integer; default 72
- `page`: integer; default 0; Which page of a multi-page TIFF; the first by default.
- `options`: object; Format settings as the export dialog names them, for example {compression: deflate} for tiff or {level: 9} for png.
- `overwrite`: boolean; default false; Replace a file already at the path. Without it an existing file is not touched.

Note: replaces or removes.

## jobs_list

Lists the engine's background work: local generation, upscaling and similar jobs (id, kind, status, progress, what it is doing) and the agent calls now running or waiting for the person's approval. Newest first. Use when you started local generation or upscaling and want to know what is running, or why a call is waiting.

- `status`: string (all | active | finished); default "all"
- `limit`: integer; default 50

Note: read-only.

## jobs_cancel

Cancels a background job by its id from jobs_list, or every active one with all true. A job stops at its next step; jobs_list shows it as cancelled. Use when a background job is no longer wanted.

- `id`: string; A job id from jobs_list.
- `all`: boolean; default false

Note: replaces or removes.

## set_settings

Changes simple settings by name, as list_settings names them. A value must be the same kind as the current one. The person is asked first. Use when a simple setting in Preferences should change.

- `values`: object; required; Setting names and their new values.

## ui_inspect

Describes parts of the formvis window: for each element matching a CSS selector, its tag, id, text, whether it is visible, disabled or pressed, and its box in window pixels. Use when you need to know what a button, panel or dialog in the window shows or whether it is enabled.

- `selector`: string; required
- `limit`: integer; default 10

Note: read-only.

## ui_state

The window's state: the active tool, the open document and its view (zoom, rotation, centre in document pixels), the foreground and background colours, window and stage size, whether it has focus or is full screen, the theme, whether panels are shown, the dialogs open, whether a menu is open, what the engine is busy with, and the frames per second measured over a third of a second. Use when you need the active tool, the view, the open dialogs or the window's size before acting on the window.

- no parameters

Note: read-only.

## ui_screenshot

A picture of the formvis window: with no selector the canvas as the person sees it (the picture, selection outline, guides and tool overlays); with a CSS selector (from ui_inspect) that part of the window, such as a panel or a dialog, drawn from a copy of its elements (fonts that are not installed on this computer may differ). Its longer side is at most max_size pixels. Use when you need to see the canvas as the person does, or a panel or dialog of the window.

- `selector`: string
- `max_size`: integer; default 1024
- `format`: string (png | jpeg); default "png"
- `quality`: number; default 0.9

Note: read-only.

## ui_menu_list

The menu bar's tree. With no path the menus; with a path such as Filter > Blur the items under it, each with its command id, label, whether it can run now, whether it is checked and its shortcut. depth (1 to 4) says how many submenu levels to open; deeper ones show only their item count. Use when you need to find a menu item by its place in the menu bar.

- `path`: string; default ""
- `depth`: integer; default 1

Note: read-only.

## ui_menu_invoke

Runs a menu item by its path from the menu bar, such as Edit > Undo or Filter > Blur > Gaussian Blur, as a person clicking it would (a dialog may open: ui_dialog answers it). params are the command's params as describe_command lists them. A command marked risky waits for the person's approval. Use when a menu item should run by its path and no typed tool or command id is at hand.

- `path`: string; required; Menu labels joined with > ending at the item.
- `params`: object

Note: replaces or removes.

## ui_set

Sets named parts of the window in one call: tool (a tool id), zoom (1 is 100 percent), centre ({x, y} document pixels to bring to the middle), rotation (degrees of view rotation), theme (a theme name), panels (shown or hidden), foreground and background (#rrggbb) and mask_target (edit the active layer's mask instead of its pixels). A field it does not have is refused by name. Use when the tool, zoom, view centre, rotation, theme, panels, colours or mask target should change.

- `tool`: string
- `zoom`: number
- `centre`: object
- `rotation`: number
- `theme`: string
- `panels`: boolean
- `foreground`: string; #rrggbb
- `background`: string; #rrggbb
- `mask_target`: boolean

## ui_dialog

Lists, fills in and answers the dialog that is open in the window. action list shows each open dialog's title, message, fields (name, kind, value, range or options) and buttons; set puts values into fields (a field's name from list, or its number as in Name #2); confirm presses the primary button; cancel closes it; button presses the button of that name. An open dialog blocks edits until it is answered. Use when a dialog is open and blocks edits: read its fields and answer it.

- `action`: string (list | set | confirm | cancel); default "list"
- `fields`: object; Field names and their new values (text, number, true or false for a checkbox, or an option's name).
- `button`: string

## ui_pointer

Sends synthetic pointer events to the canvas as a pen, mouse or finger would: down, move, up, cancel, hover and wheel, each at x, y in document pixels (or window pixels with space window) with pressure (0 to 1), tilt_x and tilt_y (degrees), twist, button, and the modifier keys shift, alt, ctrl and meta. The active tool receives them exactly as a person's. A press left down is released at the end unless keep_down is true. Pressure counts only while Preferences > Tools reads pen pressure. Use when a tool should be driven by pointer events a pen would send, with pressure and tilt, or by clicks and drags on the canvas.

- `events`: array; required
- `delay_ms`: integer; default 4; Pause after each event.
- `keep_down`: boolean; default false

Note: replaces or removes.

## ui_key

Presses keys in the window as a person would, to whatever has focus: keys are combos such as Mod+Z, Shift+Tab, Escape, Enter or B (Mod is Ctrl, or Cmd on a Mac); text types characters into the focused text field or dialog field. Use when a shortcut should be pressed, or text typed into a focused field.

- `keys`: array
- `text`: string

Note: replaces or removes.

## ui_window

The formvis window itself: size reports its size and focus, resize sets it (the desktop app's window only; a browser tab refuses), focus asks for focus, fullscreen toggles full screen. Use when the window's size should be read or changed, or it should take focus or full screen.

- `action`: string (size | resize | focus | fullscreen); required
- `width`: integer
- `height`: integer

## control_call

Calls a window control by its protocol name with raw params, the same as the typed tool: ui.inspect, ui.state, ui.screenshot, ui.menu.list, ui.menu.invoke, ui.set, ui.dialog, ui.pointer, ui.key, window, app.open (open_file), app.save (save_project), app.export (export_image) and app.roots (file_roots). params are checked against that tool's schema. Use when a client speaks the control protocol's dotted method names instead of tool names.

- `method`: string (ui.inspect | ui.state | ui.screenshot | ui.menu.list | ui.menu.invoke | ui.set | ui.dialog | ui.pointer | ui.key | window | app.open | app.save | app.export | app.roots); required
- `params`: object; default {}

Note: replaces or removes.

## file_roots

The folders agents may read and write files in (the person sets them), and the caps on one reply: the most characters of text and bytes of one picture a tool returns. With no folders set, any folder outside the system's own is allowed. Use when you need to know which folders you may read and write, or how large a reply may be, before a file call.

- no parameters

Note: read-only.

## boxes_list

The layout boxes on the document (rectangles that say where new, kept, moved or removed things go, which Generate writes into its prompt): id, kind, name, description and rectangle in document pixels, with warnings about empty descriptions, tiny or overlapping boxes. Use when you need to see the layout boxes before changing them or generating.

- no parameters

Note: read-only.

## boxes_add

Adds a layout box: a rectangle in document pixels with a kind (new, keep, move, remove, reference, text) and a description of what belongs there. At most 24 boxes; the rectangle is kept on the canvas. Use when you want to say where a new, kept, moved or removed thing goes before generating.

- `x`: number; required
- `y`: number; required
- `width`: number; required
- `height`: number; required
- `kind`: string (new | keep | move | remove | reference | text); default "new"
- `text`: string; default ""

## boxes_set

Changes a layout box: its kind, description, name or rectangle (only what you give). The id is from boxes_list. Use when a layout box needs another kind, description, name or place.

- `id`: string; required; A box id from boxes_list.
- `kind`: string (new | keep | move | remove | reference | text)
- `text`: string
- `name`: string
- `x`: number
- `y`: number
- `width`: number
- `height`: number

## boxes_remove

Deletes one layout box by its id from boxes_list (undoable). Use when one layout box is wrong and should go.

- `id`: string; required; A box id from boxes_list.

Note: replaces or removes.

## boxes_from_selection

Makes a layout box over the bounds of the current selection, as one step. Use when a selection already marks the place a described thing should go.

- `kind`: string (new | keep | move | remove | reference | text); default "new"
- `text`: string; default ""

## boxes_clear

Deletes every layout box in one undoable step. Use when the layout boxes are finished with or should start over.

- no parameters

Note: replaces or removes.

## sample_box

The average colour (opacity weighted, of the flattened picture) inside a layout box, or inside a rectangle in document pixels. Returns #rrggbb, its red, green and blue, and how opaque the area is. Use when you need the colour of an area or a layout box, for example to match a fill or a text colour.

- `id`: string; A box id from boxes_list; leave out to give a rectangle.
- `x`: number
- `y`: number
- `width`: number
- `height`: number

Note: read-only.

## frequency_separation

Splits what the picture shows at a radius into two layers above the active one: Low Frequency (the blurred colour and tone) and High Frequency (the detail, in Linear Light), which together look as the picture did. Retouch skin tone on the first and texture on the second. Use when colour and tone should be retouched apart from texture, as in skin retouching.

- `radius`: number; default 8; Blur radius in pixels: larger keeps more in the detail layer.

## sample_depth

Reads the Depth Map layer at a point: 0 to 255 (and 0 to 1), near is bright, far is dark. size averages a square of that many pixels. The document needs a Depth Map layer (a grey layer named Depth Map). Use when you need how near or far the Depth Map says a point is.

- `x`: integer; required
- `y`: integer; required
- `size`: integer; default 1

Note: read-only.

## depth_edit

Corrects the Depth Map layer, inside the selection when there is one: flatten (pull amount percent toward mid grey), nearer or farther (shift amount percent of the range), or smooth (blur by radius pixels; edges true keeps depth sharp at the picture's own edges, radius up to 9). Use when the Depth Map layer needs flattening, shifting or smoothing before it is used.

- `kind`: string (flatten | nearer | farther | smooth); required
- `amount`: number; Percent for flatten (50 when left out), nearer and farther (10).
- `radius`: number; default 4; For smooth.
- `edges`: boolean; default false; For smooth: keep the picture's edges sharp.

## set_crop

Crops to a frame given in document pixels, with a turn: angle straightens the picture (degrees, -45 to 45) about the frame's centre, and output_width with output_height resample the result to exactly that size at resolution ppi. A frame past the picture's edge adds canvas; content_aware fills it from the picture. crop is the plain rectangle. Use when the crop needs a turn to straighten the horizon, or a fixed output size, or a frame that reaches past the edge.

- `x`: number; required
- `y`: number; required
- `width`: number; required
- `height`: number; required
- `angle`: number; default 0
- `output_width`: integer
- `output_height`: integer
- `resolution`: number; Pixels per inch; the document's own when left out.
- `content_aware`: boolean; default false

Note: replaces or removes.

## export_mask

Writes a mask as a grey PNG the size of the document (white shows, black hides, greys are partial) to an absolute path: the selection, a layer's mask, or what a layer's pixels cover. A file already there is kept unless overwrite is true. Use when a selection or a layer's mask should be written as a PNG for another program.

- `path`: string; required; Absolute path ending .png
- `source`: string (selection | layer_mask | layer_pixels); default "selection"
- `id`: string; A layer id from get_document; for layer_mask and layer_pixels.
- `overwrite`: boolean; default false; Replace a file already at the path. Without it an existing file is not touched.

Note: replaces or removes.

## list_recipes

Which ways of filling, generating, upscaling and reading depth this computer can run now: each with its id, the task, where it runs (this computer, or fal which costs money and asks the person), whether it is ready, why not when it is not, and the tool that uses it. Use when you need to know which fill, generate, upscale or depth models are ready here before choosing one.

- no parameters

Note: read-only.

## set_active_layer

Selects the layers in ids (from get_document) so commands that act on the selected layers, such as align_layers or group_layers, reach them; the last id becomes the active layer. With add true the layers join the current selection, else they replace it. Use when several specific layers should be selected together before aligning or grouping them.

- `ids`: array; required
- `add`: boolean; default false

## select_color

Selects by colour from a seed point, as the Magic Wand does: the pixels within tolerance of the colour at x, y, either contiguous with the point or everywhere. source layer reads the active layer, merged reads the whole picture. mode combines the result with the selection. Use when a region of one colour should be selected from a point, contiguous or everywhere.

- `x`: integer; required
- `y`: integer; required
- `tolerance`: integer; default 32
- `contiguous`: boolean; default true
- `source`: string (layer | merged); default "layer"
- `mode`: string (replace | add | subtract | intersect); default "replace"

## select_shape

Selects a rectangle, an ellipse (x, y, width, height in pixels) or a polygon (points, at least 3, in pixels), with an optional feather radius, combined with the selection by mode. Use when an ellipse or polygon, or a soft-edged shape, should be selected.

- `shape`: string (rectangle | ellipse | polygon); required
- `x`: number
- `y`: number
- `width`: number
- `height`: number
- `points`: array
- `feather`: number; default 0; Edge softness in pixels.
- `mode`: string (replace | add | subtract | intersect); default "replace"

## select_range

Selects by range, as Select > Color Range: kind color (pixels near a colour, with fuzziness), a hue family (reds, yellows, greens, cyans, blues, magentas), highlights, midtones, shadows, skin, depth (lo to hi of the Depth Map, 0 to 255, near is bright), or luminosity (lo to hi, 0 to 255, of the layer or the merged picture; fuzziness softens the ends). invert flips the result; mode combines it with the selection. Use when a range of hue, tone, luminosity or depth should be selected.

- `kind`: string (color | reds | yellows | greens | cyans | blues | magentas | highlights | midtones | shadows | skin | depth | luminosity); required
- `color`: string; #rrggbb, for kind color.
- `fuzziness`: number; default 40
- `lo`: integer; default 0
- `hi`: integer; default 255
- `source`: string (layer | merged); default "layer"; For luminosity.
- `invert`: boolean; default false
- `mode`: string (replace | add | subtract | intersect); default "replace"

## sample_mean_color

The mean colour of the selection (weighted by how much each pixel is selected and opaque), or of the whole picture when nothing is selected; with id, of that layer alone. Changes nothing. Returns #rrggbb, red, green, blue, how opaque the area is and the pixels counted. Use when you need the mean colour of the selection, a layer or the picture.

- `id`: string; A layer id from get_document; omit for the flattened picture.

Note: read-only.

## align_layers

Aligns or distributes the layers in ids (from get_document; the current selection when left out). align: left, hcenter, right, top, vcenter or bottom; distribute: the same edges or hspace and vspace for equal gaps (three or more layers, or two with to selection or canvas). to auto uses the bounds of the layers themselves, or the selection or canvas. Use when layers should line up or be spread evenly.

- `ids`: array
- `align`: string (left | hcenter | right | top | vcenter | bottom)
- `distribute`: string (left | hcenter | right | top | vcenter | bottom | hspace | vspace)
- `to`: string (auto | selection | canvas); default "auto"

## group_layers

Puts the layers in ids (from get_document) into one new group, named name; returns the group's id. Use when several layers should become one group.

- `ids`: array; required
- `name`: string

## set_group

Changes a group's name, visibility, lock (every lock) or collapsed state in the Layers panel. id is a group from get_document. Use when a group should be renamed, hidden, locked or collapsed.

- `id`: string; required; A layer id from get_document.
- `name`: string
- `visible`: boolean
- `locked`: boolean
- `collapsed`: boolean

## set_mask

Changes a layer's raster mask. action reveal_all or hide_all (adds one, or resets the layer's), reveal_selection or hide_selection (from the selection; the layer has no mask yet), enable, disable, invert, delete, apply (burns it into the pixels, then removes it), or copy_from (a copy of the mask of from_id). Use when a layer mask should be added, inverted, copied, turned off or removed.

- `id`: string; required; A layer id from get_document.
- `action`: string (reveal_all | hide_all | reveal_selection | hide_selection | enable | disable | invert | delete | apply | copy_from); required
- `from_id`: string; A layer id with a mask; for copy_from.

Note: replaces or removes.

## set_text

Changes a text layer (id from get_document): its words, font, size, colour, bold, italic, alignment, line height, tracking, and its angle in degrees. Give only what changes. Use when the words or style of a text layer should change.

- `id`: string; required; A layer id from get_document.
- `text`: string
- `font`: string
- `size`: number
- `color`: string
- `bold`: boolean
- `italic`: boolean
- `align`: string (left | center | right | justify)
- `line_height`: number
- `tracking`: number
- `angle`: number

## list_history

The document's undo history (each step's name, which are done and which are undone) and its snapshots (id, name, kind, memory), newest last. Snapshots live with the open document and are not saved. Use when you need the undo steps or snapshots before going back.

- no parameters

Note: read-only.

## take_snapshot

Keeps the document as it is now as a named snapshot to return to however far the steps move on; returns its id. kind document keeps every layer, merged the flattened picture, layer the active layer. Use when a state of the document should be kept to return to later.

- `name`: string
- `kind`: string (document | merged | layer); default "document"

## restore_snapshot

Returns the document to a snapshot, by id or by name (list_history shows both), as one undo step; the snapshot stays. Use when the document should return to a snapshot.

- `id`: string; A snapshot id from list_history.
- `name`: string

## delete_snapshot

Deletes a snapshot by id or by name (list_history shows both). The history steps are not touched. Use when a snapshot is no longer wanted.

- `id`: string; A snapshot id from list_history.
- `name`: string

Note: replaces or removes.

## extend_canvas

Adds pixels to each side of the canvas independently (left, top, right, bottom), filled with fill: transparent, a colour #rrggbb, foreground or background. The picture keeps its place. Use when different amounts of space should be added on each side.

- `left`: integer; default 0
- `top`: integer; default 0
- `right`: integer; default 0
- `bottom`: integer; default 0
- `fill`: string; default "transparent"; transparent, #rrggbb, foreground or background.

## export_layer

Writes one layer alone, with its mask and transparency, as a PNG to an absolute path: the size of the document, or trimmed to the layer's visible pixels with trim true. A file already there is kept unless overwrite is true. Use when one layer alone should be written as a transparent PNG.

- `path`: string; required; Absolute path ending .png
- `id`: string; required; A layer id from get_document.
- `trim`: boolean; default false
- `overwrite`: boolean; default false; Replace a file already at the path. Without it an existing file is not touched.

Note: replaces or removes.

## read_log

The window's error log: uncaught errors and failed tasks (at most 100, newest last), each with when, what and the message. It is not a full application log. Use when something failed in the window and you need the error log.

- `limit`: integer; default 30

Note: read-only.

## list_brush_tips

The brush presets and sampled tips: id, name, description, size, hardness, opacity, angle, roundness and spacing, with the brush as it is set now. Use an id as preset in set_brush. Use when you need the brush presets and tips before choosing one.

- no parameters

Note: read-only.

## set_brush

Sets the brush: size (pixels), hardness, opacity, flow (0 to 1), a preset id from list_brush_tips (applied first), and the tip's angle (degrees), roundness (percent), spacing (percent of the size) and follow_direction (the tip turns with the stroke). Use when the brush size, hardness, opacity, flow, preset or tip should change before painting.

- `size`: integer
- `hardness`: number
- `opacity`: number
- `flow`: number
- `preset`: string
- `angle`: number
- `roundness`: number
- `spacing`: number
- `follow_direction`: boolean

## add_filter

Adds a filter to a layer as a smart filter that stays editable (the layer becomes a smart object when it is not one): kind and settings as apply_filter takes them. Returns the filter's id; set_filter changes, disables or removes it later. Use when a filter should stay editable on a layer.

- `id`: string; A layer id from get_document; the active layer when left out.
- `kind`: string; required
- `settings`: object; default {}

## set_filter

Changes a smart filter on a smart object layer: its settings, kind, enabled, opacity (percent), blend mode, or remove it. With only id it lists the layer's filters. Use when a smart filter needs other settings, or should be turned off or removed.

- `id`: string; required; A layer id from get_document.
- `filter_id`: string; A filter id from add_filter or set_filter's list; the last filter when left out.
- `kind`: string
- `settings`: object
- `enabled`: boolean
- `opacity`: number
- `blend`: string
- `remove`: boolean; default false

Note: replaces or removes.

## apply_preset

Applies a named adjustment preset: the built-in grain presets by film speed (iso100 to iso3200, slide, negative, bw400, bwpush, cine, expired), gradientMap looks (cyberpunk, sunset, tealorange, sepia, infrared, bwcontrast), photoFilter colours (warm85, cool80, sepia, underwater and more), or a preset the person saved in the Adjustments panel for any adjustment kind. With id it changes that adjustment layer, else it adds a new adjustment layer of that kind. With no name it lists the presets (for kind, or all). Use when a grain, gradient map or photo filter look should be applied by name, or a saved adjustment preset reused.

- `kind`: string; The adjustment: grain, gradientMap, photoFilter, or the kind a saved preset belongs to.
- `name`: string; A preset id or name from the list; leave out to list.
- `id`: string; An adjustment layer id of that kind, to change it instead of adding one.

## depth_from_layer

Reads the depth of one layer alone with the local Depth Anything V2 Small model and adds it as a grey layer named Depth Map (near bright, far dark). Waits until the model has finished and the layer exists, then reports its id; fails with how to download the model when it is missing. Use when the depth should come from one layer alone rather than the whole picture, and you need to know it finished.

- `id`: string; A pixel layer id from get_document; the active layer when left out.

## match_edges

Cleans the edge of a cut-out layer so it sits on a new background: defringes (replaces the edge colours with those just inside) by width pixels, then decontaminates (removes the old background colour bled into the edge) by the given percent. One undo step; the layer needs pixels. Use when a cut-out layer shows a fringe of its old background at its edge.

- `id`: string; required; A layer id from get_document.
- `width`: integer; default 2; Defringe width in pixels.
- `decontaminate`: number; default 100; Percent; 0 skips it.
- `radius`: number; default 6; Decontaminate radius in pixels.

## realism_pass

Makes a pasted or generated layer sit in its picture in one undo step: matches its colours to what is beneath it (a clipped Curves layer), cleans its edge as match_edges does, and adds a grain layer on top so the whole picture shares one grain. Each part can be turned off. Use when a pasted or generated layer looks stuck on and should sit in the picture.

- `id`: string; required; A layer id from get_document.
- `colour`: boolean; default true
- `amount`: number; default 0.8; How far the colours move toward the background.
- `edges`: boolean; default true
- `grain`: string; default "iso400"; A grain preset id from apply_preset, or none.

## compare

Shows the document before and after its last steps in one picture: steps back through the history (1 to 50), split (before on the left of a white line at position percent, after on the right) or side_by_side. The history ends where it began; nothing changes. Use when you want to see what the last step or steps changed, before beside after.

- `steps`: integer; default 1
- `layout`: string (split | side_by_side); default "split"
- `position`: number; default 50; Where the split line sits, percent from the left.
- `max_size`: integer; default 1024

Note: read-only.

## set_status

Puts a short note in the formvis status bar for the person to read (at most 160 characters), for seconds (1 to 600, default 60), or clears it with empty text. An error still shows first. Changes nothing in the document. Use when the person should be told in the formvis window what you are doing.

- `text`: string; required
- `seconds`: number; default 60

## ailabel_add

Marks the document as AI content, as the EU AI label does: every PNG, JPEG, WebP and TIFF export then carries the IPTC digital source type in its XMP (trainedAlgorithmicMedia for kind generated, compositeWithTrainedAlgorithmicMedia for kind edited), and by default a visible badge layer named EU AI label is added (anchor, style, size as percent of the shorter side, opacity; text replaces the words). Calling it again replaces the badge. One undoable step. Returns the badge layer id. Use when a picture was made or edited with AI and should be marked so, in its metadata and on the picture.

- `kind`: string (generated | edited); default "generated"; generated: made with AI. edited: a real picture edited with AI.
- `badge`: boolean; default true; Add the visible badge layer; false writes the metadata mark only.
- `anchor`: string (top-left | top | top-right | left | center | right | bottom-left | bottom | bottom-right); default "bottom-right"
- `style`: string (dark | light | outline); default "dark"
- `size`: number; default 6; Badge height, percent of the shorter side of the document.
- `opacity`: number; default 1
- `text`: string; The badge's words; the default follows kind.

## ailabel_remove

Removes the document's AI label: the metadata mark and every badge layer named EU AI label. One undoable step. Use when the AI label was added by mistake or the picture is no longer AI content.

- no parameters

Note: replaces or removes.

## ailabel_info

Whether the document is marked as AI content: the label (generated, edited or none), the IPTC digital source type it writes, the badge layers and the export formats that carry it. Use when you need to know whether the document is marked as AI content before exporting.

- no parameters

Note: read-only.

## film_looks

Lists the film looks (id, name, kind negative|slide|bw|cine, ISO, curve points) and the film layers in the document with their look, strength and curve points. A look is a tone curve with editable points, a colour matrix and grain that grows with its speed. Use when the person wants a film look and you need the ids, or want to see the film layers already there.

- no parameters

Note: read-only.

## film_apply_look

Adds a film layer (an adjustment layer named Film: ...) with a film look from film_looks, or with id changes an existing one. strength 0 to 100 mixes the look with the picture (default 100), grain 0 to 100 (default 40; the look's speed scales it), grain_size in pixels (1 to 8). Changing the look of a layer resets its custom curve points. Returns the layer id. Use when the picture should look shot on a film stock, with its tone curve, colour and grain.

- `look`: string; A film look id from film_looks.
- `id`: string; An existing film layer to change; leave out to add a new one.
- `strength`: number
- `grain`: number
- `grain_size`: number

## film_add_point

Adds a point to a film layer's tone curve, or moves the point already at that x: x is the input tone and y the curve's output, both 0 to 255 (a layer starts from its look's points; at most 16 points). Use when a film layer's tone curve needs one more point to shape the highlights, shadows or midtones.

- `id`: string; required; A layer id from get_document.
- `x`: integer; required
- `y`: integer; required

## film_copy_points

Copies a film layer's curve points into the clipboard (for film_paste_points). Changes nothing in the document. Use when a film layer's curve should be reused on another layer.

- `id`: string; required; A layer id from get_document.

Note: read-only.

## film_paste_points

Puts the copied curve points on a film layer: mode replace (default) makes them its curve, merge adds them to the points it has (a point at the same x is overwritten). Use when curve points copied from another film layer should be put on this one.

- `id`: string; required; A layer id from get_document.
- `mode`: string (replace | merge); default "replace"

## glb_place

Places a 3D model (.glb, or a .gltf with no outside files) as a new layer the size of the document, posed and lit by turn, tilt, roll, size, x, y, z, fov, sun light, ambient, room light and a ground contact shadow; with depth true also a Depth Map layer. From path (absolute) or data (base64). The layer is pixels; while the window stays open glb_edit poses it again. Returns the layer id and the model's facts. Use when a 3D model file should appear in the picture as a lit, posed layer.

- `path`: string; Absolute path to a .glb or .gltf file.
- `data`: string; Base64 .glb data, when there is no file.
- `name`: string
- `turn`: number; Turn about the vertical axis, degrees (default 30).
- `tilt`: number; Tilt toward the camera, degrees (default 15).
- `roll`: number; Roll about the viewing axis, degrees (default 0).
- `size`: number; Size in percent of the frame (default 100).
- `x`: number; Position across the frame, percent of half its width (default 0, right is positive).
- `y`: number; Position up the frame, percent of half its height (default 0, up is positive).
- `z`: number; Depth: toward the camera is positive (default 0); with a wide fov it changes the perspective.
- `fov`: number; Camera field of view in degrees, the focal length: small is telephoto (default 30).
- `light_direction`: number; Direction of the sun light, degrees (default 40).
- `light_height`: number; Height of the sun light above the horizon, degrees (default 45).
- `light_strength`: number; Sun light strength, percent (default 150).
- `light_color`: string; Sun light colour #rrggbb (default white).
- `ambient`: number; Ambient light, percent (default 40).
- `room_light`: number; Soft room light from above and below, percent (default 0).
- `shadow`: number; Strength of the ground contact shadow under the model, percent (default 0: none).
- `depth`: boolean; default false; Also draw a Depth Map layer (near bright, far dark) of the same pose, for depth-guided generation.

## glb_edit

Poses a 3D layer from glb_place again (give only what changes; the rest stays as it was) and redraws its pixels as one undoable step; depth true adds or refreshes its Depth Map layer. Works for layers placed since the window opened. Use when a placed 3D model needs another pose, size, position, field of view or light.

- `id`: string; required; A layer id from get_document.
- `turn`: number; Turn about the vertical axis, degrees (default 30).
- `tilt`: number; Tilt toward the camera, degrees (default 15).
- `roll`: number; Roll about the viewing axis, degrees (default 0).
- `size`: number; Size in percent of the frame (default 100).
- `x`: number; Position across the frame, percent of half its width (default 0, right is positive).
- `y`: number; Position up the frame, percent of half its height (default 0, up is positive).
- `z`: number; Depth: toward the camera is positive (default 0); with a wide fov it changes the perspective.
- `fov`: number; Camera field of view in degrees, the focal length: small is telephoto (default 30).
- `light_direction`: number; Direction of the sun light, degrees (default 40).
- `light_height`: number; Height of the sun light above the horizon, degrees (default 45).
- `light_strength`: number; Sun light strength, percent (default 150).
- `light_color`: string; Sun light colour #rrggbb (default white).
- `ambient`: number; Ambient light, percent (default 40).
- `room_light`: number; Soft room light from above and below, percent (default 0).
- `shadow`: number; Strength of the ground contact shadow under the model, percent (default 0: none).
- `depth`: boolean; default false; Also draw a Depth Map layer (near bright, far dark) of the same pose, for depth-guided generation.

## glb_info

Facts about a 3D model: meshes, triangles, vertices, materials, textures, animations, nodes, size in its own units, generator and glTF extensions. Give path (an absolute .glb or .gltf file) or id of a 3D layer, which also returns its current pose. Use when you need the size, triangles or materials of a 3D model before placing it.

- `path`: string; Absolute path to a .glb or .gltf file.
- `id`: string; A 3D layer id from glb_place.

Note: read-only.

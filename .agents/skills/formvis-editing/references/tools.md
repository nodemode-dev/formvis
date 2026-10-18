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
- Other: `timeline_get`, `timeline_create`, `timeline_delete`, `timeline_set`, `timeline_go_to`, `timeline_clip`, `timeline_split`, `timeline_keyframe`, `timeline_transition`, `timeline_frame_image`, `timeline_render`

## get_document

The open document: name, size, resolution, colour mode (rgb, cmyk, grayscale...), bit depth, colour profile, the layers bottom to top (id, name, kind, visible, opacity, blend, parent group), the active layer and the selection's bounds. Use when you need the document's size, mode, layer ids or documents before any edit.

- no parameters

Note: read-only.

## get_image

The document as it looks, as a PNG image, its longer side at most max_size pixels. Use when you need to see the picture, and again after each change to check it.

- `max_size`: integer; default 1024

Note: read-only.

## new_document

Opens a new document. Use when there is nothing open, or the person wants a blank canvas of a size.

- `width`: integer; required
- `height`: integer; required
- `name`: string
- `background`: string (white | transparent | black); default "white"

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

Changes a layer's name, visibility, opacity (0 to 1) or blend mode, or makes it the active layer. Use when a layer should be renamed, hidden, faded, blended, or made the active one.

- `id`: string; required; A layer id from get_document.
- `name`: string
- `visible`: boolean
- `opacity`: number
- `blend`: string
- `active`: boolean

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

Places a PNG, JPEG or WebP image as a new layer at x, y, at its own size (transform_layer scales it): from path, an absolute path to a file, or data, base64. Use when another picture file should join the document as a layer.

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

Saves the document as a formvis project (.fvd: layers, masks, adjustments and text stay editable) at an absolute path, replacing a file there. Use when the work should be kept with layers still editable.

- `path`: string; required; Absolute path ending .fvd

Note: replaces or removes.

## export_image

Writes the document as it looks to an absolute path as PNG, JPEG or WebP (by the path's extension), replacing a file there. Use when a flat PNG, JPEG or WebP is the deliverable.

- `path`: string; required; Absolute path ending .png, .jpg or .webp
- `quality`: number; default 0.92

Note: replaces or removes.

## switch_document

Makes an open document the one tools act on, by its id from get_document's documents. Use when more than one document is open and another should be edited.

- `id`: string; required; A layer id from get_document.

## resize_image

Resamples the whole document to width x height pixels (keep the shape by scaling both by one factor). Use when the whole picture should be scaled to a size.

- `width`: integer; required
- `height`: integer; required

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

## apply_filter

Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Filter Gallery: filterGallery {effects: [{filter, values, visible}]}, its effect layers applied in order, the first at the bottom, hidden ones skipped; filter is one of: coloredPencil {pencilWidth 1 to 24, strokePressure 0 to 15, paperBrightness 0 to 50}, cutout {numberOfLevels 2 to 8, edgeSimplicity 0 to 10, edgeFidelity 1 to 3}, dryBrush and fresco {brushSize 0 to 10, brushDetail 0 to 10, texture 1 to 3}, filmGrain {grain 0 to 20, highlightArea 0 to 20, intensity 0 to 10}, neonGlow {glowSize -24 to 24, glowBrightness 0 to 50, glowColor (#rrggbb)}, paintDaubs {brushSize 1 to 50, sharpness 0 to 40, brushType: simple|lightRough|darkRough|wideSharp|wideBlurry|sparkle}, paletteKnife {strokeSize 1 to 50, strokeDetail 1 to 3, softness 0 to 10}, plasticWrap {highlightStrength 0 to 20, detail 1 to 15, smoothness 1 to 15}, posterEdges {edgeThickness 0 to 10, edgeIntensity 0 to 10, posterization 0 to 6}, roughPastels {strokeLength 0 to 40, strokeDetail 1 to 20, texture: canvas|brick|burlap|sandstone, scaling 50 to 200, relief 0 to 50, light: top|topRight|right|bottomRight|bottom|bottomLeft|left|topLeft, invert}, smudgeStick {strokeLength 0 to 10, highlightArea 0 to 20, intensity 0 to 10}, sponge {brushSize 0 to 10, definition 0 to 25, smoothness 1 to 15}, underpainting {brushSize 0 to 40, textureCoverage 0 to 40, and roughPastels' texture, scaling, relief, light, invert}, watercolor {brushDetail 1 to 14, shadowIntensity 0 to 10, texture 1 to 3}, accentedEdges {edgeWidth 1 to 14, edgeBrightness 0 to 50, smoothness 1 to 15}, angledStrokes {directionBalance 0 to 100, strokeLength 3 to 50, sharpness 0 to 10}, crosshatch {strokeLength 3 to 50, sharpness 0 to 20, strength 1 to 3}, darkStrokes {balance 0 to 10, blackIntensity 0 to 10, whiteIntensity 0 to 10}, inkOutlines {strokeLength 1 to 50, darkIntensity 0 to 50, lightIntensity 0 to 50}, spatter {sprayRadius 0 to 25, smoothness 1 to 15}, sprayedStrokes {strokeLength 0 to 20, sprayRadius 0 to 25, strokeDirection: rightDiagonal|horizontal|leftDiagonal|vertical}, sumiE {strokeWidth 3 to 15, strokePressure 0 to 15, contrast 0 to 40}, diffuseGlow {graininess 0 to 10, glowAmount 0 to 20, clearAmount 0 to 20}, glass {distortion 0 to 20, smoothness 1 to 15, texture: frosted|blocks|canvas|tinyLens, scaling 50 to 200, invert}, oceanRipple {rippleSize 1 to 15, rippleMagnitude 0 to 20}, glowingEdges {edgeWidth 1 to 14, edgeBrightness 0 to 20, smoothness 1 to 15}, basRelief {detail 1 to 15, smoothness 1 to 15, light}, chalkCharcoal {charcoalArea 0 to 20, chalkArea 0 to 20, strokePressure 0 to 5}, charcoal {charcoalThickness 1 to 7, detail 0 to 5, lightDarkBalance 0 to 100}, chrome {detail 0 to 10, smoothness 0 to 10}, conteCrayon {foregroundLevel 1 to 15, backgroundLevel 1 to 15, and roughPastels' texture, scaling, relief, light, invert}, graphicPen {strokeLength 1 to 15, lightDarkBalance 0 to 100, strokeDirection}, halftonePattern {size 1 to 12, contrast 0 to 50, patternType: dot|circle|line}, notePaper {imageBalance 0 to 50, graininess 0 to 20, relief 0 to 25}, photocopy {detail 1 to 24, darkness 1 to 50}, plaster {imageBalance 0 to 50, smoothness 1 to 15, light}, reticulation {density 0 to 50, foregroundLevel 0 to 50, backgroundLevel 0 to 50}, stamp {lightDarkBalance 0 to 50, smoothness 1 to 50}, tornEdges {imageBalance 0 to 50, smoothness 1 to 15, contrast 1 to 25}, waterPaper {fiberLength 3 to 50, brightness 0 to 100, contrast 0 to 100}, craquelure {crackSpacing 2 to 100, crackDepth 0 to 10, crackBrightness 0 to 10}, grain {intensity 0 to 100, contrast 0 to 100, grainType: regular|soft|sprinkles|clumped|contrasty|enlarged|stippled|horizontal|vertical|speckle}, mosaicTiles {tileSize 2 to 100, groutWidth 1 to 15, lightenGrout 0 to 10}, patchwork {squareSize 0 to 10, relief 0 to 25}, stainedGlass {cellSize 2 to 50, borderThickness 1 to 20, lightIntensity 0 to 10}, texturizer {roughPastels' texture, scaling, relief, light, invert}; colours come from the foreground and background colours (the Sketch effects' ink and paper). Unnamed settings keep their defaults. Use when a blur, sharpen, noise or other filter should change the active layer.

- `kind`: string (gaussianBlur | motionBlur | addNoise | unsharpMask | lensBlur | smartSharpen | surfaceBlur | radialBlur | tiltShift | irisBlur | fieldBlur | average | blur | blurMore | boxBlur | shapeBlur | smartBlur | sharpen | sharpenMore | sharpenEdges | despeckle | dustAndScratches | median | reduceNoise | custom | hsbHsl | highPass | maximum | minimum | offset | deInterlace | ntscColors | displace | pinch | polarCoordinates | ripple | shear | spherize | twirl | wave | zigZag | colorHalftone | crystallize | facet | fragment | mezzotint | mosaic | pointillize | diffuse | emboss | extrude | findEdges | oilPaint | solarize | tiles | traceContour | wind | clouds | differenceClouds | fibers | lensFlare | lightingEffects | flame | pictureFrame | tree | spinBlur | filterGallery); required
- `settings`: object; default {}

## set_adjustment

Changes an adjustment layer's parameters (id from get_document; the same parameters as add_adjustment). Use when an adjustment layer made earlier needs different settings.

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

Renders the video timeline to an absolute path: .mp4 (H.264), .gif, or .zip (numbered PNG frames); every frame, or from to to (frames, to excluded); scale 1, 0.5 or 0.25. Replaces a file there. Use when the video should be written to an mp4, gif or frame zip.

- `path`: string; required; Absolute path ending .mp4, .gif or .zip
- `from`: integer
- `to`: integer
- `scale`: number (1 | 0.5 | 0.25); default 1

Note: replaces or removes.

## list_commands

Lists formvis's commands: every menu and palette action, each as id, label, when (what it is for) and params (what it takes). Narrow it with group (a menu or family such as Filter or Layer) or text (words from the label, id or description); an unfiltered list is capped, so filter first. Use when the typed tools do not cover what the person asked and you need to find the formvis command that does.

- `group`: string
- `text`: string

Note: read-only.

## describe_command

One command in full: its label, group, description, when to use it, params with types and defaults, and whether it changes the document or is risky (cannot be undone). Use when you found a command with list_commands and need its params before running it.

- `id`: string; required; A command id from list_commands.

Note: read-only.

## run_command

Runs one command by id with params, as one undoable step. A command marked risky waits for the person's approval in the formvis window (Window > Agent Connect) unless they allowed all. Use when a command from list_commands should run once.

- `id`: string; required; A command id from list_commands.
- `params`: object; The command's params, as describe_command lists them.

Note: replaces or removes.

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

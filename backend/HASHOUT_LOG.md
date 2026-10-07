# backend HASHOUT_LOG

Living log for the engine service side, _v0.1.0. Read the map and the TOC first; entries are anchored by file and symbol, and removed code is quoted in full.

## Version only · _v1.65.0

No engine code changed in 1.65.0 (DEV_PLAN 27.5's third part, the Select menu's commands, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.9"
version = "1.64.9"
version = "1.64.9"
 "version": "1.64.9",
```

## The objects in a picture, for Mask All Objects · _v1.64.9 (app/services/background.py, app/routers/ops.py)

DEV_PLAN 27.5, second part. `background.objects(data, limit=24)`, served at `POST /api/ops/objects` (`find_objects`; 501 without ONNX Runtime, 422 for an unreadable or oversized picture, as Remove Background answers): U^2-Net's saliency at a working scale (the picture reduced so its longer side is at most 1024, before the model's own 320), its regions above half the threshold separated by OpenCV's `connectedComponentsWithStats` (8-connected), those of at least 0.05 percent of the picture (16 pixels at least) kept, largest first, at most 24. Every soft value at 8 or more goes to the object nearest it, by `distanceTransformWithLabels` with a label per pixel mapped back to its region (the labels number the regions' pixels in scan order, as `cc[fg == 1]` lists them, checked on a small grid), so touching soft edges are shared out rather than counted twice. Each object is a grey PNG cropped to its box, base64 in the JSON with the working size; the window scales them to the document. OpenCV, not SciPy: SciPy is used elsewhere in the engine but is no declared requirement. Verified: on a 1200 by 800 picture with three shapes on grey, three objects in 1.7 seconds, loading the model included, their boxes where the shapes are at the working scale; through the window, three masked folders matching the shapes. The engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.8"
version = "1.64.8"
version = "1.64.8"
 "version": "1.64.8",
```

## Version only · _v1.64.8

No engine code changed in 1.64.8 (DEV_PLAN 27.5's first part, the Layer and Select operations, is in the window). Agents reach the same results through the tools they have (move_layer, merge_layers, set_layer, delete_layer). Verified: the engine's tests, 112 passed and 3 failing for this machine as before (no EXR codec, LaMa not downloaded, SAM's device reported as onnx). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.7"
version = "1.64.7"
version = "1.64.7"
 "version": "1.64.7",
```

## apply_filter's Filter Gallery takes all 47 effects · _v1.64.7 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.4 closed. `apply_filter`'s description lists the Filter Gallery's Sketch effects (basRelief, chalkCharcoal, charcoal, chrome, conteCrayon, graphicPen, halftonePattern with its three patterns, notePaper, photocopy, plaster, reticulation, stamp, tornEdges, waterPaper) and its Texture effects (craquelure, grain with its ten types, mosaicTiles, patchwork, stainedGlass, texturizer), each with its settings and their ranges, and says the Sketch effects' ink and paper are the foreground and background colours; the kind enum is unchanged. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, apply_filter applied stacks of the new effects by key, by name and with `params`. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.6"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Filter Gallery: filterGallery {effects: [{filter, values, visible}]}, its effect layers applied in order, the first at the bottom, hidden ones skipped; filter is one of: coloredPencil {pencilWidth 1 to 24, strokePressure 0 to 15, paperBrightness 0 to 50}, cutout {numberOfLevels 2 to 8, edgeSimplicity 0 to 10, edgeFidelity 1 to 3}, dryBrush and fresco {brushSize 0 to 10, brushDetail 0 to 10, texture 1 to 3}, filmGrain {grain 0 to 20, highlightArea 0 to 20, intensity 0 to 10}, neonGlow {glowSize -24 to 24, glowBrightness 0 to 50, glowColor (#rrggbb)}, paintDaubs {brushSize 1 to 50, sharpness 0 to 40, brushType: simple|lightRough|darkRough|wideSharp|wideBlurry|sparkle}, paletteKnife {strokeSize 1 to 50, strokeDetail 1 to 3, softness 0 to 10}, plasticWrap {highlightStrength 0 to 20, detail 1 to 15, smoothness 1 to 15}, posterEdges {edgeThickness 0 to 10, edgeIntensity 0 to 10, posterization 0 to 6}, roughPastels {strokeLength 0 to 40, strokeDetail 1 to 20, texture: canvas|brick|burlap|sandstone, scaling 50 to 200, relief 0 to 50, light: top|topRight|right|bottomRight|bottom|bottomLeft|left|topLeft, invert}, smudgeStick {strokeLength 0 to 10, highlightArea 0 to 20, intensity 0 to 10}, sponge {brushSize 0 to 10, definition 0 to 25, smoothness 1 to 15}, underpainting {brushSize 0 to 40, textureCoverage 0 to 40, and roughPastels' texture, scaling, relief, light, invert}, watercolor {brushDetail 1 to 14, shadowIntensity 0 to 10, texture 1 to 3}, accentedEdges {edgeWidth 1 to 14, edgeBrightness 0 to 50, smoothness 1 to 15}, angledStrokes {directionBalance 0 to 100, strokeLength 3 to 50, sharpness 0 to 10}, crosshatch {strokeLength 3 to 50, sharpness 0 to 20, strength 1 to 3}, darkStrokes {balance 0 to 10, blackIntensity 0 to 10, whiteIntensity 0 to 10}, inkOutlines {strokeLength 1 to 50, darkIntensity 0 to 50, lightIntensity 0 to 50}, spatter {sprayRadius 0 to 25, smoothness 1 to 15}, sprayedStrokes {strokeLength 0 to 20, sprayRadius 0 to 25, strokeDirection: rightDiagonal|horizontal|leftDiagonal|vertical}, sumiE {strokeWidth 3 to 15, strokePressure 0 to 15, contrast 0 to 40}, diffuseGlow {graininess 0 to 10, glowAmount 0 to 20, clearAmount 0 to 20}, glass {distortion 0 to 20, smoothness 1 to 15, texture: frosted|blocks|canvas|tinyLens, scaling 50 to 200, invert}, oceanRipple {rippleSize 1 to 15, rippleMagnitude 0 to 20}, glowingEdges {edgeWidth 1 to 14, edgeBrightness 0 to 20, smoothness 1 to 15}; colours come from the foreground and background colours. Unnamed settings keep their defaults.",
version = "1.64.6"
version = "1.64.6"
 "version": "1.64.6",
```

## apply_filter's Filter Gallery takes twelve more effects · _v1.64.6 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.4, third part. `apply_filter`'s description lists the Filter Gallery's Brush Strokes effects (accentedEdges, angledStrokes, crosshatch, darkStrokes, inkOutlines, spatter, sprayedStrokes with its four stroke directions, sumiE), its Distort effects (diffuseGlow, glass with its four textures, oceanRipple) and Stylize's glowingEdges, each with its settings and their ranges; the kind enum is unchanged. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, apply_filter applied stacks of the new effects by key, by name and with `params`. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.5"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Filter Gallery: filterGallery {effects: [{filter, values, visible}]}, its effect layers applied in order, the first at the bottom, hidden ones skipped; filter is one of: coloredPencil {pencilWidth 1 to 24, strokePressure 0 to 15, paperBrightness 0 to 50}, cutout {numberOfLevels 2 to 8, edgeSimplicity 0 to 10, edgeFidelity 1 to 3}, dryBrush and fresco {brushSize 0 to 10, brushDetail 0 to 10, texture 1 to 3}, filmGrain {grain 0 to 20, highlightArea 0 to 20, intensity 0 to 10}, neonGlow {glowSize -24 to 24, glowBrightness 0 to 50, glowColor (#rrggbb)}, paintDaubs {brushSize 1 to 50, sharpness 0 to 40, brushType: simple|lightRough|darkRough|wideSharp|wideBlurry|sparkle}, paletteKnife {strokeSize 1 to 50, strokeDetail 1 to 3, softness 0 to 10}, plasticWrap {highlightStrength 0 to 20, detail 1 to 15, smoothness 1 to 15}, posterEdges {edgeThickness 0 to 10, edgeIntensity 0 to 10, posterization 0 to 6}, roughPastels {strokeLength 0 to 40, strokeDetail 1 to 20, texture: canvas|brick|burlap|sandstone, scaling 50 to 200, relief 0 to 50, light: top|topRight|right|bottomRight|bottom|bottomLeft|left|topLeft, invert}, smudgeStick {strokeLength 0 to 10, highlightArea 0 to 20, intensity 0 to 10}, sponge {brushSize 0 to 10, definition 0 to 25, smoothness 1 to 15}, underpainting {brushSize 0 to 40, textureCoverage 0 to 40, and roughPastels' texture, scaling, relief, light, invert}, watercolor {brushDetail 1 to 14, shadowIntensity 0 to 10, texture 1 to 3}; colours come from the foreground and background colours. Unnamed settings keep their defaults.",
version = "1.64.5"
version = "1.64.5"
 "version": "1.64.5",
```

## apply_filter takes the Filter Gallery · _v1.64.5 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.4, second part. `apply_filter`'s `kind` enum gains filterGallery (67 kinds), and its description the stack's shape: `effects`, a list of effect layers `{filter, values, visible}` applied in order with the first at the bottom and hidden ones skipped; the fifteen Artistic effects by key, each with its settings and their ranges; colours from the foreground and background colours. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, apply_filter applied a stack by key, by name and with `params`, refused a hidden stack, an unknown name and an empty list with the window's reasons and changed nothing, and tools/list carries the kind. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.4"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Unnamed settings keep their defaults.",
                                               "clouds", "differenceClouds", "fibers", "lensFlare", "lightingEffects", "flame", "pictureFrame", "tree", "spinBlur"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.4"
version = "1.64.4"
 "version": "1.64.4",
```

## apply_filter takes Spin Blur · _v1.64.4 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.4, first part. `apply_filter`'s `kind` enum gains spinBlur (66 kinds), and its description its settings under "Blur Gallery": blurAngle in degrees, x and y in percent of the selection's bounds (else the canvas), radiusX and radiusY in percent of their shorter side, and angle. Fade and Last Filter are window commands with no agent tool of their own: an agent repeats a filter by calling apply_filter again. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, spinBlur with blurAngle 60 and radiusX 40 applied one step ("Applied spinBlur to Rectangle."). Removed lines taken after the version edit:

```text
__version__ = "1.64.3"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Unnamed settings keep their defaults.",
                                               "clouds", "differenceClouds", "fibers", "lensFlare", "lightingEffects", "flame", "pictureFrame", "tree"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.3"
version = "1.64.3"
 "version": "1.64.3",
```

## apply_filter takes Flame, Picture Frame and Tree · _v1.64.3 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.3 closed. `apply_filter`'s `kind` enum gains flame, pictureFrame and tree (65 kinds), and its description their settings as the window's library names them: Flame's `path` is a path's name (else the selected path; with none, an arc low in the selection or canvas), its six flame types, quality, style and shape by name; Picture Frame's sixteen frames by name and its three colours as `#rrggbb`; Tree's 19 base types by name, its colours, and its position and height in percent of the selection's bounds (else the canvas). It says the three draw over the layer and that a new empty layer keeps them apart, and that each takes a seed for its arrangement. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); tools/list after a restart gives 65 kinds; through the window, on a layer just added by add_layer (empty, given pixels as Render filters now are), tree (cherryBlossom), pictureFrame (stars, a blue vine), flame along a path named "Wick" and flame as candleLight each applied one step; flame with the path "Nowhere" answered 'Flame: this document has no path named "Nowhere".' and changed nothing; an unknown tree type was held to Oak, as unknown choices are. Removed lines taken after the version edit:

```text
__version__ = "1.64.2"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Unnamed settings keep their defaults.",
                                               "clouds", "differenceClouds", "fibers", "lensFlare", "lightingEffects"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.2"
version = "1.64.2"
 "version": "1.64.2",
```

## apply_filter takes Stylize and Render · _v1.64.2 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.3, first part. `apply_filter`'s `kind` enum gains the nine Stylize and five Render filters (62 kinds), and its description their settings, named as the window's library names them: findEdges, solarize, clouds and differenceClouds with no settings; diffuse, emboss, extrude, oilPaint, tiles, traceContour and wind with theirs; fibers, lensFlare and lightingEffects with theirs. It says that Clouds, Difference Clouds and Fibers lie between the foreground and background colours, and that Lens Flare's centre and Lighting Effects' light and target are in percent of the selection's bounds (else the canvas), the light's height in percent of their shorter side. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); tools/list after a restart gives the new description and 62 kinds; through the window, all 14 applied one step each by name ("Applied clouds to Rectangle." and so on), and Diffuse in each of its four modes. Removed lines taken after the version edit:

```text
__version__ = "1.64.1"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Unnamed settings keep their defaults.",
                                               "colorHalftone", "crystallize", "facet", "fragment", "mezzotint", "mosaic", "pointillize"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.1"
version = "1.64.1"
 "version": "1.64.1",
```

## apply_filter takes Distort and Pixelate · _v1.64.1 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.2. `apply_filter`'s `kind` enum gains the nine Distort and seven Pixelate filters, and its description their settings, named as the window's library names them; it says distortions centre on the selection's bounds (else the canvas), that Displace's `map` is the name of an open document and is required, and that Pointillize's dots sit on the background colour. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, Twirl, Mosaic, Facet, Pointillize, Wave and Displace (its map named "Ripples") applied one step each, and Displace without a map answered "Displace needs its map: choose an open document.". Removed lines taken after the version edit:

```text
__version__ = "1.64.0"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Unnamed settings keep their defaults.",
                                               "custom", "hsbHsl", "highPass", "maximum", "minimum", "offset", "deInterlace", "ntscColors"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.0"
version = "1.64.0"
 "version": "1.64.0",
```

## apply_filter takes the filter library's 21 filters · _v1.64.0 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.1. The agents' `apply_filter` tool lists the stage's 21 filters in its `kind` enum and their settings in its description: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle and ntscColors with no settings; boxBlur, shapeBlur, smartBlur, dustAndScratches, median, reduceNoise, custom, hsbHsl, highPass, maximum, minimum, offset and deInterlace with theirs, named as the window's filter library names them (the window holds every value to its range and ignores names it does not know). `./formvis agents sync` regenerated the skill's tool reference and its `.agents` mirror, which test_agents_setup checks. Verified: the engine's tests that can run here passed, test_mcp and test_agents_setup among them (111 passed; 4 failing for this machine, none touching agents: no EXR codec in its OpenCV, the LaMa and SAM ONNX models not downloaded, the SAM device read as onnx); through the window, apply_filter with boxBlur and with average applied one step each ("Applied boxBlur to A.", "Applied average to A."). Removed lines taken after the version edit:

```text
__version__ = "1.63.0"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur. Unnamed settings keep their defaults.",
          {"kind": {"type": "string", "enum": ["gaussianBlur", "motionBlur", "addNoise", "unsharpMask", "lensBlur", "smartSharpen", "surfaceBlur", "radialBlur", "tiltShift", "irisBlur", "fieldBlur"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.63.0"
version = "1.63.0"
 "version": "1.63.0",
```

## The undo store's batch drop; the bench's giant-document check · _v1.63.0 (app/routers/undo.py; setup/bench.py)

`POST /api/undo/drop` forgets many keys in one request (up to 100,000; keys not in the store's form skipped, the unlinking off the event loop). Found by DEV_PLAN 26.6h's 600 MP run: closing a document whose undo held a blur over the whole giant layer dropped about 34,000 keys one request each, and a browser runs six requests at a time to one server, so reopening the saved project waited behind them for many minutes (the engine opened it in 0.15 s, and the window, called directly, reopened it in 120 s). Checked through the engine's test client: three keys dropped, a malformed and a repeated one skipped, the others untouched, a body that is not `{"keys": [...]}` refused with 400. `./formvis bench` now also reports whether the window's own display draws a giant document (120 MP, kept in tiles) on the GPU, beside an ordinary one, in its results file and JSON (`giant_on_gpu`), for the check 1.62.9 could not make in a GPU-less browser. Removed lines taken after the version edit:

```text
__version__ = "1.62.9"
  return { res, checks, text: B.benchText(res, webgpu || webgl || 'unknown'), webgl, webgpu, ua: navigator.userAgent };
              "matches_cpu": got["checks"]}
version = "1.62.9"
version = "1.62.9"
 "version": "1.62.9",
```

## Version only · _v1.62.9

No engine code changed in 1.62.9 (the GPU per tile is in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.8"
version = "1.62.8"
version = "1.62.8"
 "version": "1.62.8",
```

## The streaming PNG reader · _v1.62.8 (app/routers/bands.py)

`/api/bands/read`: POST with an opened project's session and file opens its PNG (resolved by `sessions.asset_path`, so only files of an opened project, by safe names) to be read a band of rows at a time, 8-bit RGB or RGBA, not interlaced; GET to the key returns the next rows as RGBA, the reader closing after the last. Rows are inflated as they are asked for and unfiltered one at a time (`_unfilter`: None and Up at numpy speed, Up being what the banded writer uses; Sub by cumulative sums; Average and Paeth a byte at a time, correct and slow, for a PNG from elsewhere), holding only the current row and what is inflated ahead; RGB is given opaque alpha. It is how a giant layer (past what a browser can decode) is opened. Checked through the engine's test client: the writer's random RGBA (varying alpha) read back in bands of 300, 500 and 37 rows exactly; a Pillow RGB PNG (adaptive filters) read back exactly with alpha 255; an unknown key and a file not in the session 404; and through the window, the 120 MP project reopened exactly. Nothing removed besides the version lines:

```text
__version__ = "1.62.7"
version = "1.62.7"
version = "1.62.7"
 "version": "1.62.7",
```

## Version only · _v1.62.7

No engine code changed in 1.62.7 (filters on giant layers, their undo through the 1.60.8 store, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.6"
version = "1.62.6"
version = "1.62.6"
 "version": "1.62.6",
```

## Version only · _v1.62.6

No engine code changed in 1.62.6 (giant documents exported through the 1.61.2 banded PNG writer, from the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.5"
version = "1.62.5"
version = "1.62.5"
 "version": "1.62.5",
```

## Version only · _v1.62.5

No engine code changed in 1.62.5 (painting on giant layers, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.4"
version = "1.62.4"
version = "1.62.4"
 "version": "1.62.4",
```

## Version only · _v1.62.4

No engine code changed in 1.62.4 (a giant document's tiles paged through the 1.60.8 undo store, from the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.3"
version = "1.62.3"
version = "1.62.3"
 "version": "1.62.3",
```

## Version only · _v1.62.3

No engine code changed in 1.62.3 (giant documents open, display and compose, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.2"
version = "1.62.2"
version = "1.62.2"
 "version": "1.62.2",
```

## Version only · _v1.62.2

No engine code changed in 1.62.2 (tiled layers' first stage, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.1"
version = "1.62.1"
version = "1.62.1"
 "version": "1.62.1",
```

## The macOS install's missing packages · _v1.62.1 (requirements_macos.txt; tests/test_requirements.py new; setup/verify_local.py)

The owner's `./formvis verify-local` stopped at `No module named 'httpx'`. A Mac installs from requirements_macos.txt (backend/oc_install, the unpinned macOS base) and every other system from requirements.txt; six packages added to the main list over time never reached the Mac's: httpx (local generation's downloads; the engine imports local generation as it starts, so on a Mac installed this way it could not start), keyring (API keys in the system password store), onnxruntime and onnx (the local models and the style presets, base since 1.53.4 and 1.55.1), psd-tools (Photoshop files) and tifffile (TIFF). The six are added, unpinned as the rest of that list; tests/test_requirements.py fails whenever requirements.txt or requirements_ml.txt names a package its macOS list lacks (it failed with the old list, naming all six); verify-local names a missing package in one line with what to run instead of a traceback. Checked: the new tests pass, and fail with the old list put back; in a Python with no packages, verify-local said "formvis's engine is missing the Python package 'fastapi': run ./formvis install" and exited 1; the stand-in run still completes. Removed lines taken after the version edit:

```text
__version__ = "1.61.9"
    from app.localgen import klein, krea2
version = "1.61.9"
version = "1.61.9"
 "version": "1.61.9",
```

## The CLI names its version; the owner's second bench recorded · _v1.61.9 (formvis; docs/BENCH.md)

The owner's `./formvis verify-local` said "unknown command": the copy's `formvis` was older than 1.61.8 (on a Mac, opening a zip extracts a second copy beside the first and overwrites nothing, so "unzip it over your folder" could not be done as written). The help's first line now names the version, read from frontend/src/version.ts as it runs ("formvis 1.61.9 · layered image editor"), so a copy that missed an update shows it at once, and an unknown command is followed by it. The owner's second bench (1.61.7) is recorded in docs/BENCH.md: on the Apple M5's Metal 3, WebGPU and WebGL2 each 100.00% of values within 4 levels of the CPU's picture, the largest difference 3, so both are correct on real hardware; Automatic's WebGPU never more than 0.9 ms from the fastest path across the two runs and 22 times faster than the CPU with adjustment layers; the first run's section points to it. Checked: help's first line shows the version, an unknown command shows it, the CLI parses. Removed lines taken after the version edit (docs/BENCH.md's with them):

```text
__version__ = "1.61.8"
formvis · layered image editor
version = "1.61.8"
version = "1.61.8"
 "version": "1.61.8",
Not yet measured on this computer: whether each GPU path draws exactly what the CPU draws (`./formvis bench` checks it
from 1.61.7, against the bar formvis's GPU adjustment tests use: 99% of values within 4 levels), and the Channels view
through the native renderer, which needs the desktop app (H3).
```

## ./formvis verify-local · _v1.61.8 (setup/verify_local.py, setup/verify_local and setup/verify_local.bat new; formvis, formvis.bat)

The register's M7 named `./formvis verify-local`, never built. Now, for Krea 2 (Apple silicon, or Windows and Linux) and FLUX.2 [klein] 4B (Apple silicon), through the app's own localgen modules: a model not for this computer is said so; a licence not yet accepted is shown (name, version, link, summary, use policy) and accepted only by the person's yes, recorded by the module's own `record_consent` (declined or unanswered: skipped, nothing recorded); a model not installed has the build for this memory chosen (`krea2.recommended()`, Klein's 8-bit from 16 GB; the 4-bit builds with --small), its size stated and the download made only on a yes, through the module's own `install`; then one 1,024 by 1,024 picture from a fixed prompt and seed, timed. Results to bench-results/local-<date>-<machine>.md and .json, the pictures beside them, the machine recorded as bench records it. --yes answers every question (only when passed); --stand-in runs the flow with no download and no model. The shell and Windows wrappers find formvis's Python as `bench` does; the CLI and formvis.bat dispatch it. Checked here: --stand-in wrote both files and two pictures, labelled a stand-in; a real run with no one to answer showed the Krea 2 licence in full, skipped it, recorded no consent and downloaded nothing, and said Klein is not for this computer. Nothing removed besides the version lines:

```text
__version__ = "1.61.7"
version = "1.61.7"
version = "1.61.7"
 "version": "1.61.7",
```

## bench writes each GPU path's check · _v1.61.7 (setup/bench.py)

After the timings, bench runs the window's `checkPaths` and writes, per GPU path, the share of values within 4 levels of the CPU's picture and the largest difference, with "matches" or "DIFFERS" by the 99% bar, into the terminal, the .md (a table) and the .json (`matches_cpu`). Removed lines taken after the version edit:

```text
__version__ = "1.61.6"
  return { res, text: B.benchText(res, webgpu || webgl || 'unknown'), webgl, webgpu, ua: navigator.userAgent };
              "user_agent": got["ua"], "frames": args.frames, "rows": got["res"]["rows"], "notes": got["res"]["notes"], "native": native}
version = "1.61.6"
version = "1.61.6"
 "version": "1.61.6",
```

## ./formvis bench in the background, and the window server found on macOS · _v1.61.6 (setup/bench.py)

The owner's first run on a MacBook Air said the window server had not started, and asked for no window at all. Cause: Vite (host false) listens on localhost, which on macOS is IPv6 (::1) only, and bench asked 127.0.0.1 alone, so a running server went unseen for 90 s. Now `up()` asks localhost, then 127.0.0.1, and returns the address that answers, which the page opens; a server bench starts is logged to bench-results/window-server.log and waited for up to 2 minutes, and if it never answers (or exits) bench quotes its last lines instead of guessing; a missing npm is said plainly. No window by default: Chrome runs in the background with its GPU switched on (`GPU_ARGS`: enable-gpu, ignore-gpu-blocklist, enable-unsafe-webgpu, and Metal through ANGLE on macOS); `--window` opens one. Whether the GPU drew is read back, never assumed: an adapter the browser names as software (SwiftShader, llvmpipe, Microsoft Basic Render) is recorded (`software` in the .json, the .md's browser line) and bench says those numbers do not show the GPU and to run `--window`. Checked here: the default run with the server stopped started it, ran in the background (WebGPU now included, software on this machine), wrote both files and named the software adapter with the advice; with port 5190 held by another program, bench quoted Vite's "Port 5190 is already in use"; with no npm on the path, the plain message. Removed lines taken after the version edit:

```text
__version__ = "1.61.5"
Options: --frames N (default 60), --no-native (skip the native renderer), --headless (no window: software graphics,
for checking the command itself, not for numbers worth sending).
URL = os.environ.get("FORMVIS_BENCH_URL", "http://127.0.0.1:5190/")
def up() -> bool:
    try:
        with urllib.request.urlopen(URL, timeout=2) as r:
            return r.status == 200
    except OSError:
        return False
def open_browser(p, headless: bool):
    try:
        return p.chromium.launch(channel="chrome", headless=headless), "Google Chrome"
    except Exception:
        pass
    try:
        return p.chromium.launch(headless=headless), "Playwright's Chromium"
    except Exception:
        sys.exit("[formvis] no browser to run in: install Google Chrome, or run "
                 f"'{sys.executable} -m playwright install chromium'")
    ap.add_argument("--headless", action="store_true")
    started = None
    if not up():
        say("starting formvis's window server (stopped again when the benchmark ends)")
        started = subprocess.Popen(["npm", "run", "dev"], cwd=ROOT / "frontend", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   start_new_session=True, shell=os.name == "nt")
        for _ in range(90):
            if up():
        else:
            sys.exit("[formvis] the window server did not start: run ./formvis install, then try again")
            browser, which = open_browser(p, args.headless)
            say(f"running in {which}{' (headless: software graphics, numbers not worth sending)' if args.headless else ''}; keep its window in front until it closes")
            page.goto(URL)
              "browser": f"{which} {browser_version}", "headless": args.headless, "webgl": got["webgl"], "webgpu": got["webgpu"],
| Browser | {record['browser']}{' (headless, software graphics)' if args.headless else ''} |
    say("send that .md file back; it holds the numbers and the machine they were measured on")
version = "1.61.5"
version = "1.61.5"
 "version": "1.61.5",
```

## ./formvis bench · _v1.61.5 (setup/bench.py, setup/bench and setup/bench.bat new; formvis, formvis.bat, .gitignore)

The register's H4 named `./formvis bench`, and it had never been built; the owner ran it on a MacBook Air and got "unknown command". Now: it starts the window server if it is not running (and stops it after), opens the installed Google Chrome in a visible window (a hidden browser draws on a software GPU) or else Playwright's Chromium, installs Playwright first if needed, runs Help > Performance Benchmark's tests (gpu/bench.ts) on every display path the browser has with 60 frames by default, asks the browser which adapter WebGL2 and WebGPU draw with, runs the native renderer's brush benchmark when Rust is installed (said plainly when not), and writes bench-results/<date>-<machine>.md and .json (the machine, the browser, both adapters, every timing, the notes) and says which file to send back; bench-results/ is ignored by git. Options: --frames N, --no-native, --headless (software graphics, for checking the command). The shell and Windows wrappers find formvis's Python as `test` does; formvis.bat dispatches it; the npm start and the server's stop work on Windows too. Checked here as the owner would run it, headless with the window server stopped first: it started the server, ran in Chrome on the software adapter (named in the file), wrote both files, and stopped the server again. Nothing removed besides the version lines:

```text
__version__ = "1.61.4"
version = "1.61.4"
version = "1.61.4"
 "version": "1.61.4",
```

## Version only · _v1.61.4

No engine code changed in 1.61.4 (room made before a large filter, in the window; the register's test drives the engine's MCP, library, undo store and banded PNG writer as they were). Removed lines taken after the version edit:

```text
__version__ = "1.61.3"
version = "1.61.3"
version = "1.61.3"
 "version": "1.61.3",
```

## Version only · _v1.61.3

No engine code changed in 1.61.3 (raster paging and automatic history memory, in the window; the paged layer's tiles use the 1.60.8 store). Removed lines taken after the version edit:

```text
__version__ = "1.61.2"
version = "1.61.2"
version = "1.61.2"
 "version": "1.61.2",
```

## The banded PNG writer · _v1.61.2 (app/routers/bands.py new; app/main.py)

`/api/bands/png`: POST with width, height and ppi opens a PNG (signature, IHDR as 8-bit RGBA, pHYs) in the data folder's bands directory and returns a key; POST to the key appends whole rows (RGBA, top first), each band given PNG's Up filter with numpy (the row before kept between bands) and deflated straight into IDAT chunks; POST to the key's end checks every row came, closes the stream (IEND) and returns the file. Part rows, extra rows and missing rows are refused; the directory is emptied when the engine starts (`bands.clear()` in main.py, beside the router's inclusion). Checked through the engine's test client (random RGBA with varying alpha in three bands decoded back exactly at its 300 ppi; a part row and missing rows refused) and through the window (the 150 MP export, the engine peaking 161 MB). Nothing removed besides the version lines:

```text
__version__ = "1.61.1"
version = "1.61.1"
version = "1.61.1"
 "version": "1.61.1",
```

## Version only · _v1.61.1

No engine code changed in 1.61.1 (whole-layer filters' room from measured peaks, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.9"
version = "1.60.9"
version = "1.60.9"
 "version": "1.60.9",
```

## Version only · _v1.60.9

No engine code changed in 1.60.9 (filters in bands, in the window; a banded filter's undo uses the 1.60.8 store). Removed lines taken after the version edit:

```text
__version__ = "1.60.8"
version = "1.60.8"
version = "1.60.8"
 "version": "1.60.8",
```

## The undo store · _v1.60.8 (app/routers/undo.py new; app/main.py)

`/api/undo`: POST keeps the bytes sent (a tile's pixels before and after) deflated with zlib at level 1 under a new 32-hex key and returns it; GET gives them back as sent; DELETE forgets them; keys other than 32 lower-case hex are refused. The folder (`undo` under the data folder) is emptied when the engine starts (`undo.clear()` in main.py, beside the router's inclusion), so nothing outlives its session. Checked through the engine's test client (a 1 MB put stored as 8 KB, given back byte for byte, dropped, then 404; a bad key 400) and through the window's paging in the browser (47 tiles put, all given back and dropped by undo, none left after closing). Nothing removed besides the version lines:

```text
__version__ = "1.60.7"
version = "1.60.7"
version = "1.60.7"
 "version": "1.60.7",
```

## Version only · _v1.60.7

No engine code changed in 1.60.7 (a stroke's undo as tiles, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.6"
version = "1.60.6"
version = "1.60.6"
 "version": "1.60.6",
```

## Version only · _v1.60.6

No engine code changed in 1.60.6 (strokes in a window on large layers, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.5"
version = "1.60.5"
version = "1.60.5"
 "version": "1.60.5",
```

## Version only · _v1.60.5

No engine code changed in 1.60.5 (the opening snapshot, the stroke pool and the count, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.4"
version = "1.60.4"
version = "1.60.4"
 "version": "1.60.4",
```

## Version only · _v1.60.4

No engine code changed in 1.60.4 (memory back on close, and the count as measured, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.3"
version = "1.60.3"
version = "1.60.3"
 "version": "1.60.3",
```

## Version only · _v1.60.3

No engine code changed in 1.60.3 (Markup, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.2"
version = "1.60.2"
version = "1.60.2"
 "version": "1.60.2",
```

## Version only · _v1.60.2

No engine code changed in 1.60.2: the window's memory budget uses the memory the engine already reports (`/api/capabilities`, since 1.53.4). Removed lines taken after the version edit:

```text
__version__ = "1.60.1"
version = "1.60.1"
version = "1.60.1"
 "version": "1.60.1",
```

## timeline_transition takes a colour · _v1.60.1 (app/routers/mcp.py)

`timeline_transition` gains `color` (transparent, black or white) for its fades, Photoshop's Fade With Black and Fade With White, and says so in its description; the formvis-editing skill's generated reference regenerated by `./formvis agents sync` (that description and field in its .claude and .agents copies). Checked as a real MCP client: a white fade-in made and read back. Removed lines taken after the version edit:

```text
__version__ = "1.59.9"
    _tool("timeline_transition", "Adds a transition to a layer's clip: fade_in, fade_out or fade (both) over seconds; cross_fade with the clip starting or ending within it (only the upper fades, so the picture never dips); or remove.",
          {"id": _ID, "kind": {"type": "string", "enum": ["fade_in", "fade_out", "fade", "cross_fade", "remove"]}, "seconds": {"type": "number", "minimum": 0.01, "maximum": 600, "default": 1}}, ["id", "kind"]),
version = "1.59.9"
version = "1.59.9"
 "version": "1.59.9",
```

## Version only · _v1.59.9

No engine code changed in 1.59.9 (the Move tool keying a keyed layer, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.8"
version = "1.59.8"
version = "1.59.8"
 "version": "1.59.8",
```

## Version only · _v1.59.8

No engine code changed in 1.59.8 (the timeline's empty state and single steps, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.7"
version = "1.59.7"
version = "1.59.7"
 "version": "1.59.7",
```

## The video timeline's MCP tools · _v1.59.7 (app/routers/mcp.py)

The catalogue gains eleven tools (39 to 50), named after Photon Studio's timeline operations, with their hints: `timeline_get` and `timeline_frame_image` read only and idempotent; `timeline_delete` and `timeline_render` destructive; `timeline_set`, `timeline_go_to` and `timeline_clip` idempotent. `_run` handles `timeline_render` as it handles export_image: the path checked (absolute, ending .mp4, .gif or .zip), the window asked for the file (`__render`, with the format from the suffix and from, to and scale as given), and the bytes written there. Checked as a real MCP client against the open window: the eleven listed, each run, and the three renders written (an MP4 of 20 frames, a 20-frame GIF, a 20-file zip). The formvis-editing skill's tool reference (generated from this catalogue, "do not edit by hand") was regenerated by `./formvis agents sync`, as at 1.56.1: 95 lines added in its .claude and .agents copies, none removed; the check in step. Nothing removed besides the version lines:

```text
__version__ = "1.59.6"
version = "1.59.6"
version = "1.59.6"
 "version": "1.59.6",
```

## Render Video's picture sequence · _v1.59.6 (app/routers/video.py)

`POST /api/video/sequence` (frames as PNGs in order, and a name): the frames as `name_00001.png` and on in one zip, stored rather than deflated again (PNG is compressed already), the name cleaned to letters, digits, spaces, hyphens and underscores. Checked through the window's Render Video: 30 frames zipped as T_00001.png to T_00030.png at 100 by 50. Removed lines taken after the version edit:

```text
__version__ = "1.59.5"
version = "1.59.5"
version = "1.59.5"
 "version": "1.59.5",
```

## Version only · _v1.59.5

No engine code changed in 1.59.5 (timeline edits as undo steps, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.4"
version = "1.59.4"
version = "1.59.4"
 "version": "1.59.4",
```

## Version only · _v1.59.4

No engine code changed in 1.59.4 (the keyframe lanes in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.3"
version = "1.59.3"
version = "1.59.3"
 "version": "1.59.3",
```

## Version only · _v1.59.3

No engine code changed in 1.59.3 (the video timeline's panel in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.2"
version = "1.59.2"
version = "1.59.2"
 "version": "1.59.2",
```

## Version only · _v1.59.2

No engine code changed in 1.59.2 (the video timeline's model in the window; Video (MP4) uses the 1.58.9 encoder). Removed lines taken after the version edit:

```text
__version__ = "1.59.1"
version = "1.59.1"
version = "1.59.1"
 "version": "1.59.1",
```

## Version only · _v1.59.1

No engine code changed in 1.59.1 (the Layers panel's sizing in the window). Removed lines taken after the version edit:

```text
__version__ = "1.58.9"
version = "1.58.9"
version = "1.58.9"
 "version": "1.58.9",
```

## Video · _v1.58.9 (app/routers/video.py new, app/main.py)

The parity plan's L1. ffmpeg runs as a separate program, never bundled (its usual builds are LGPL or GPL): FORMVIS_FFMPEG, else ffmpeg on the PATH, else imageio-ffmpeg's binary when that package happens to be installed (it is not a dependency); without one, 503 says how to install it. POST /api/video/probe: size, frame rate and duration from ffmpeg's own report (no ffprobe needed). POST /api/video/frames: from `start` to `end` seconds, every `every`th frame (a select filter), scaled to fit `max_side` on even sizes, at most 300, as a 4-byte length, a JSON header (width, height, fps, every, delayMs, count, sizes) and PNGs. POST /api/video/encode: frames and their delays to H.264 (yuv420p, CRF 18, faststart): the frames are repeated on a common grid of time (the delays' greatest common divisor, up to 60 a second; else 30 a second with each delay rounded) and written as a constant-rate image sequence. Found on the way: ffmpeg's concat list either added a frame (the last listed twice, 11 frames and 1.04 seconds for 10 and 1.0) or drifted to its own time base (1.36 seconds for 1.4); the grid gives ten frames in 1.000 seconds, a 500 ms frame among 100 ms ones fourteen frames in 1.400 seconds, and delay 0 ten frames at 30 a second in 0.33 seconds. Checked here with a real clip: the probe's figures; a 1 to 2 second trim of ten frames identical to ffmpeg's own frames 10 to 19; every third frame (ten at 300 ms); an encode checked by ffprobe. (A still picture probes as a one-frame video, as ffmpeg reads it; the dialog offers video files.) Removed lines taken after the version edit:

```text
__version__ = "1.58.8"
version = "1.58.8"
version = "1.58.8"
 "version": "1.58.8",
```

## The library in any folder, conflict-safe saves · _v1.58.8 (app/core/config.py, app/routers/projects.py)

The parity plan's L13. `config.projects_dir` is FORMVIS_LIBRARY_DIR, else the folder kept in library.json in the data folder, else the data folder's Projects (`default_projects_dir`), falling back to it when a chosen folder cannot be made. GET /api/projects/folder answers where the library is, the default, whether the environment fixes it, and the synced folders found on this computer (iCloud Drive's Mobile Documents, Dropbox, OneDrive, Google Drive and macOS's CloudStorage providers, each with a Formvis folder suggested); PUT moves it (made if missing and tested by writing a temporary file; with `move`, each project copied with its times, checked by size and only then removed, a same-named project there kept and the one moved in renamed "(moved)"; an empty folder means the default). Saves stay atomic (a temporary file in the same folder, then renamed) and became conflict-safe: a save naming the version it was based on (`base`, the file's modification time in nanoseconds and size) overwrites only a file still at that version; otherwise it is written beside it as "name (conflict date time)" (the library's name rule allows it), the answer saying so and what was kept. Every save and every open answers with the file's version. Checked here over the API with a temporary data folder: a first save, an open at the same version, a save on it overwriting; another device's copy appended, then a save on the old version: the conflict copy written and the other version byte for byte; saving on to the copy without conflict; the library moved to a "synced" folder with three projects (a same-named one there kept, the incoming one "(moved)"), listed and opened from there, and back to the default with all four; a folder that cannot be written refused with the reason. Removed lines taken after the version edit:

```text
__version__ = "1.58.7"
    return _ensure(data_dir() / "Projects")
def save(name: str = Form(...), manifest: str = Form(...), files: list[UploadFile] = File(default=[])) -> dict:
    for x in OLD_EXTS:
        target.with_suffix(x).unlink(missing_ok=True)
    return {"name": target.stem, "path": str(target), "size": len(blob)}
    return sessions.payload(sessions.create(assets), manifest, assets, path.stem)
version = "1.58.7"
version = "1.58.7"
 "version": "1.58.7",
```

## Version only · _v1.58.7

No engine code changed in 1.58.7 (the compact layout in the window). Removed lines taken after the version edit:

```text
__version__ = "1.58.6"
version = "1.58.6"
version = "1.58.6"
 "version": "1.58.6",
```

## Version only · _v1.58.6

No engine code changed in 1.58.6 (touch gestures in the window). Removed lines taken after the version edit:

```text
__version__ = "1.58.5"
version = "1.58.5"
version = "1.58.5"
 "version": "1.58.5",
```

## Version only · _v1.58.5

No engine code changed in 1.58.5 (the dialogs' defaults). Removed lines taken after the version edit:

```text
__version__ = "1.58.4"
version = "1.58.4"
version = "1.58.4"
 "version": "1.58.4",
```

## More generation providers · _v1.58.4 (app/services/providers.py new, app/routers/generative.py)

The parity plan's L7. `providers.py`: OpenAI, Google, Black Forest Labs and Ideogram, each request its provider's documented one (checked against the providers' documentation this session for Black Forest Labs, polling included, and Ideogram's v3 multipart; OpenAI's images API and Gemini's generateContent as documented): OpenAI images/generations with a Bearer key (and images/edits with the mask's fill area made transparent, as OpenAI reads it), Google generateContent with x-goog-api-key, the IMAGE modality and the nearest aspect ratio, Black Forest Labs flux-pro-1.1 (and flux-pro-1.0-fill) with x-key, then its polling_url until Ready, Ideogram v3 generate with Api-Key as a multipart form. Keys from each provider's usual environment variable, else the password store through secrets.py (a private providers.json where there is none), never sent back; each base movable with FORMVIS_<PROVIDER>_BASE. Errors named: a missing key 428, a rejected key "rejected the API key", no credit 402, Google's and Ideogram's fill refused by name. Routes: GET /generative/providers, PUT and DELETE /generative/providers/{id}/key; /generative/generate and /fill take `provider` (fal by default). Checked here against stand-in servers (a harness in /tmp): no key 428, a wrong key named; a picture from each in its colour (OpenAI 1536 by 1024 for a wide document, Black Forest Labs 1440 by 800 within its limits on 32-pixel steps); fills from OpenAI and Black Forest Labs; the stand-ins' log shows each request's header, model, size or aspect, Black Forest Labs polled from Pending to Ready, Ideogram's multipart fields, and OpenAI's edit mask transparent over exactly the quarter that was white. Removed lines taken after the version edit:

```text
__version__ = "1.58.3"
from app.services import generative
async def fill(image: UploadFile = File(...), mask: UploadFile = File(...), prompt: str = Form("")) -> Response:
        png = await run_in_threadpool(generative.fill, image_bytes, mask_bytes, prompt)
async def generate(prompt: str = Form(""), width: int = Form(1024), height: int = Form(1024)) -> Response:
    """Generate Image (1.51.2): a picture from a prompt alone, as PNG."""
        png = await run_in_threadpool(generative.generate, prompt, width, height)
version = "1.58.3"
version = "1.58.3"
 "version": "1.58.3",
```

## Version only · _v1.58.3

No engine code changed in 1.58.3 (Vanishing Point works in the window). Removed lines taken after the version edit:

```text
__version__ = "1.58.2"
version = "1.58.2"
version = "1.58.2"
 "version": "1.58.2",
```

## Photomerge and Merge to HDR · _v1.58.2 (app/routers/merge.py new, app/main.py)

`POST /api/merge/panorama` (photos, layout auto or reposition, crop): OpenCV's Stitcher in panorama (spherical) or scans (move and turn) mode; transparent where no photo reaches, found as the pure black the stitcher leaves there joined to the edge; or cropped to the largest rectangle the photos fill (the histogram method on a reduced mask); the header X-Photos-Stitched says how many photos the stitch kept. `POST /api/merge/hdr` (exposures): aligned by median threshold bitmaps, the camera's response recovered and the exposures merged by Debevec, scaled so the exposure nearest the middle keeps its mid-tones; exposure times from EXIF, or when any photo lacks one estimated from the photos (the median ratio of pixels mid-toned in both, in linear light). Found on the way: OpenCV 5.0's bindings expose no warper and no result mask, so Perspective and Cylindrical are out of reach; recomposing white copies to find the covered area crashed (composePanorama segfaults when the stitch kept only some photos), so that path was dropped; three tiles cut from one flat picture are a degenerate test (no camera rotation, so the cameras cannot be worked out: one tile was dropped, and a lower confidence gave a tiny picture), so the test set became views from a virtual camera turning about its centre. Checked here: the three turned views stitch whole in 0.5 s (582 by 405, 0.988 covered; cropped 582 by 383, fully covered), looked at; the exposures (a scene up to four times white, shot at 0.25, 1 and 4) give estimated times 0.25, 1.0 and 3.994, the merge reaching 4.07 against the scene's 4, mid-tones at a median ratio of 1.000 and a log correlation of 0.998, the brightest parts averaging 1.59 against the scene's 1.75. Removed lines taken after the version edit:

```text
__version__ = "1.58.1"
version = "1.58.1"
version = "1.58.1"
 "version": "1.58.1",
```

## The Lab reader · _v1.58.1 (app/routers/io.py)

`POST /io/decode-lab` answers 204 for anything not Lab, else a 4-byte length, a JSON header (width, height, bits, layers) and each layer's L, a, b and alpha as 16-bit values in the window's encoding. Three libraries, three conventions, each found by test here: an 8-bit CIELab TIFF through Pillow, whose bytes are the file's own, so a* and b* are read signed as the TIFF specification has them (formvis's own 8-bit export round-trips exactly, -30 and -60 included; Pillow's own TIFF writer puts them offset, which this reads as the specification says); a 16-bit one through tifffile (a* and b* signed, times 256; tifffile cannot read LZW without imagecodecs, so 8-bit files stay with Pillow); a Lab PSD through psd-tools' numpy, which for Photoshop's layout (L, a, b over 0 to 255, a and b offset by 128) gives each over 0 to 1, the window's encoding as it is, and a layer's transparency from its shape channel. Two wrong turns on the way, both caught by the tests: a first version took Pillow's "A" band for transparency, but Pillow's Lab bands are L, A and B and its A is a*; a second read a* and b* as signed from psd-tools, which held only for psd-tools' own Lab writer, which puts them signed on disk where Photoshop's layout keeps them offset (test files were then written in Photoshop's layout, Lab bytes in RGB(A) channels numbered 0, 1, 2 and -1, the header marked Lab). Checked here: 8-bit and 16-bit TIFF, flat and layered PSD, an RGB TIFF refused with 204. Removed lines taken after the version edit:

```text
__version__ = "1.57.9"
version = "1.57.9"
version = "1.57.9"
 "version": "1.57.9",
```

## CMYK to CMYK, pure black kept · _v1.57.9 (app/routers/colour.py)

`POST /color/convert-ink` (form: width, height, source and dest as base64 ICC, intent, preserve_black, and the 8-bit inks): through LittleCMS by Pillow's ImageCms. Pillow reaches only the four standard intents, so LittleCMS's black-preserving ones (tried: intents 11 and 14 are refused) are done here: with `preserve_black` (the default) a pixel inked with black alone stays black alone, its black moved to the value of the same lightness under the new profile (both profiles' black ramps measured in Lab and matched). Checked here with FOGRA39L to itself: with it (0, 0, 0, 255) and (0, 0, 0, 128) come back unchanged; without it they become (195, 179, 161, 212) and (102, 80, 80, 25), four-colour black, as plain colorimetric conversion makes them (in Photoshop too); a blue (200, 100, 0, 0) converts the same either way. Removed lines taken after the version edit:

```text
__version__ = "1.57.8"
version = "1.57.8"
version = "1.57.8"
 "version": "1.57.8",
```

## 16-bit CMYK and Lab TIFF · _v1.57.8 (app/routers/io.py, requirements.txt; NOTICE.md)

`POST /io/encode-tiff16` (fields width, height, space; files values.raw and, for CMYK, profile.icc): 16-bit CMYK as separated inks with the profile in tag 34675, and 16-bit Lab as CIELab with L* over 0 to 65535 and a* and b* as signed 16-bit values (a* times 256), both zlib-compressed, through tifffile, since Pillow writes neither. tifffile pinned at 2026.3.3 (BSD-3-Clause, Christoph Gohlke) in requirements.txt and credited in NOTICE.md; it needs only numpy for zlib. Checked through the browser's exports: tifffile reads the CMYK file back as uint16 separated with the profile and the inks exact, and the Lab file as CIELab within 1/256 of the floats. Removed lines taken after the version edit:

```text
__version__ = "1.57.7"
version = "1.57.7"
version = "1.57.7"
 "version": "1.57.7",
```

## Version only · _v1.57.7

No engine code changed in 1.57.7 (32-bit adjustments compose in the window). Removed lines taken after the version edit:

```text
__version__ = "1.57.6"
version = "1.57.6"
version = "1.57.6"
 "version": "1.57.6",
```

## The sky model · _v1.57.6 (app/localgen/sky.py new, app/localgen/model_manager.py, app/main.py)

The gate first: xiongzhu666's sky segmenter (Sky-Segmentation-and-Post-processing on GitHub, MIT, Copyright 2021, licence read there; a U-2-Net its author trained, its README not saying on what data) through the Hugging Face copy the VGGT project uses (JianyuanWang/skyseg, tagged MIT, its card naming the origin), pinned to revision 3ba8c6df and SHA-256 ab9c34c6... from the real 175,997,079-byte download. `sky.py`: the picture at 320 by 320 with ImageNet's normalisation, the output stretched to 0 to 255 and scaled back to the picture as a soft mask; `POST /api/sky/mask`, 409 until the model is downloaded. Checked here on scikit-image's rocket: 1.1 s on the CPU, the top band 0.95 sky, the rocket's body 0.25 and the bottom 0.20 in the soft mask, looked at as an overlay (sky and the gaps in the towers' lattice tinted, the rocket, towers and hills not); over HTTP 1.9 s. Removed lines taken after the version edit:

```text
__version__ = "1.57.5"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router, _lg_colorize.router, _lg_style.router, _lg_face.router):
version = "1.57.5"
version = "1.57.5"
 "version": "1.57.5",
```

## Version only · _v1.57.5

No engine code changed in 1.57.5 (Grayscale and the mode chains are window code). Removed lines taken after the version edit:

```text
__version__ = "1.57.4"
version = "1.57.4"
version = "1.57.4"
 "version": "1.57.4",
```

## Remove's finder · _v1.57.4 (app/routers/remove_find.py new, app/main.py)

`POST /api/remove/find` (kind `people` or `distractions`): People turns each face YuNet finds into a box around the person (from 1.3 face widths left to 2.3 right, half a face above to 7.5 below) that SAM2 makes the person's mask; the largest person is kept as the subject when their face is at least 2.5 times the next one's, or, alone, fills at least 0.5% of the picture. Distractions adds U2-Net's salient objects other than the largest (and at least 0.05% of the picture) to the people other than the subject. The mask is dilated by a few pixels; 409 names a missing model. A first subject rule (at least 4% of the picture) marked a portrait-sized subject for removal; corrected before release. Checked here on the scene: the background person covered 0.71, the subject 0.00, everything else 0.000; 4.6 s for People on the CPU (22.5 s the first time, while SAM2 loaded); over HTTP the same mask in 4.8 s. Removed lines taken after the version edit:

```text
__version__ = "1.57.3"
version = "1.57.3"
version = "1.57.3"
 "version": "1.57.3",
```

## Convert to Profile at 32 bits: the linear matrix · _v1.57.3 (app/services/colour.py, app/routers/colour.py)

`colour.linear_matrix(source, dest)`: the 3 by 3 matrix taking linear RGB in one profile to linear RGB in another through each profile's D50 primaries (Pillow's `red_colorant`, `green_colorant`, `blue_colorant`), `np.linalg.solve(dest, source)`; a non-RGB profile and an RGB profile without primaries (table-based) are refused by name. `POST /color/linear-matrix` returns it. Checked here: sRGB to sRGB is the identity; sRGB to Adobe RGB (1998) takes white to (0.999991, 1.000003, 1.000013) and pure red to 0.7151, the known value; the shipped CMYK profile is refused. Removed lines taken after the version edit:

```text
__version__ = "1.57.2"
version = "1.57.2"
version = "1.57.2"
 "version": "1.57.2",
```

## Version only · _v1.57.2

No engine code changed in 1.57.2 (the float filters and gates are window code). Removed lines taken after the version edit:

```text
__version__ = "1.57.1"
version = "1.57.1"
version = "1.57.1"
 "version": "1.57.1",
```

## Version only · _v1.57.1

No engine code changed in 1.57.1 (32-bit composing is window code). Removed lines taken after the version edit:

```text
__version__ = "1.56.9"
version = "1.56.9"
version = "1.56.9"
 "version": "1.56.9",
```

## Version only · _v1.56.9

No engine code changed in 1.56.9 (styles compose in the window). Removed lines taken after the version edit:

```text
__version__ = "1.56.8"
version = "1.56.8"
version = "1.56.8"
 "version": "1.56.8",
```

## Version only · _v1.56.8

No engine code changed in 1.56.8 (the gates and derive are window code). Removed lines taken after the version edit:

```text
__version__ = "1.56.7"
version = "1.56.7"
version = "1.56.7"
 "version": "1.56.7",
```

## Faces for Face-Aware Liquify · _v1.56.7 (app/localgen/face.py new, app/localgen/model_manager.py, app/main.py)

`face.py`: YuNet through OpenCV's `FaceDetectorYN` (score 0.75, NMS 0.3), the picture capped at 2,048 px on its long side for detection and the results scaled back; each face's box and five landmarks named by the side of the picture they are on (`eyeLeft`, `eyeRight`, `nose`, `mouthLeft`, `mouthRight`), largest first; `POST /api/face/landmarks`, 409 until the model is downloaded. `model_manager.py`: the registry entry (MIT, OpenCV's Hugging Face revision 3cc26e7f) and the SHA-256 pin from the real download. `main.py` includes the router. Checked here: on scikit-image's astronaut portrait one face, score 0.93, box (178, 63, 90, 113), the eyes at (200, 102) and (247, 103), the nose at (220, 125), the mouth corners at (199, 143) and (240, 144), looked at on the picture; 0.2 s. Removed lines taken after the version edit:

```text
__version__ = "1.56.6"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router, _lg_colorize.router, _lg_style.router):
version = "1.56.6"
version = "1.56.6"
 "version": "1.56.6",
```

## Lab TIFF · _v1.56.6 (app/routers/io.py)

`POST /io/encode-lab-tiff`: the window's 8-bit Lab bytes (L * 255 / 100, a and b offset by 128) with a* and b* turned to signed bytes, as the TIFF specification's CIELab (photometric 8) and Photoshop have them, then written by Pillow with LZW. Pillow writes the bytes it is given; its own reading of a CIELab file adds 128 back, which is why the file reads through Pillow as L 17.3, a 22, b 0 for a pixel the window composed as (17.3, 22.2, 0.2). Removed lines taken after the version edit:

```text
__version__ = "1.56.5"
version = "1.56.5"
version = "1.56.5"
 "version": "1.56.5",
```

## Version only · _v1.56.5

No engine code changed in 1.56.5 (Liquify runs in the window). Removed lines taken after the version edit:

```text
__version__ = "1.56.4"
version = "1.56.4"
version = "1.56.4"
 "version": "1.56.4",
```

## Version only · _v1.56.4

No engine code changed in 1.56.4 (Lab is computed in the window; LittleCMS was used only to check the formulas). Removed lines taken after the version edit:

```text
__version__ = "1.56.3"
version = "1.56.3"
version = "1.56.3"
 "version": "1.56.3",
```

## Version only · _v1.56.3

No engine code changed in 1.56.3 (the Art History Brush paints in the window). Removed lines taken after the version edit:

```text
__version__ = "1.56.2"
version = "1.56.2"
version = "1.56.2"
 "version": "1.56.2",
```

## Version only · _v1.56.2

No engine code changed in 1.56.2 (the Mixer Brush paints in the window). Removed lines taken after the version edit:

```text
__version__ = "1.56.1"
version = "1.56.1"
version = "1.56.1"
 "version": "1.56.1",
```

## CMYK PSD through psd-tools · _v1.56.1 (app/routers/io.py, app/routers/mcp.py, requirements.txt)

`POST /io/decode-cmyk-psd`: psd-tools reads the file; 204 unless it is an 8-bit CMYK PSD; each pixel layer's ink read as stored (`topil(apply_icc=False)`: by default psd-tools converts through the embedded profile, which turned every layer of a profiled file into RGB and made the first version return no layers), its alpha from `numpy()`, a layer mask folded into the alpha, its name, place, size, opacity, visibility (`is_visible`, parents counted) and blend mode; the answer is a 4-byte length, a JSON header, the layers' bytes, the profile. `POST /io/encode-cmyk-psd`: the composite laid on paper as the PSD's merged image, each layer by `PixelLayer.frompil` with its transparency as a layer mask (`create_mask`; Photoshop's CMYK documents carry no transparency band), opacity, visibility and blend mode, the profile as the ICC image resource. `_PSD_BLENDS` maps formvis's 27 blend modes to psd-tools'. `get_document`'s description names the depth and profile. Checked here: a two-layer document written and read back with names, places, sizes, opacity, a hidden layer, Multiply and Normal, ink exactly, the transparent half at alpha 0 and the 121,368-byte profile byte for byte; a PNG answers 204. Removed lines taken after the version edit:

```text
__version__ = "1.55.9"
    _tool("get_document", "The open document: name, size, resolution, colour mode, the layers bottom to top (id, name, kind, visible, opacity, blend, parent group), the active layer and the selection's bounds.", {}, read=True, idempotent=True),
version = "1.55.9"
version = "1.55.9"
 "version": "1.55.9",
```

## Version only · _v1.55.9

No engine code changed in 1.55.9 (derive runs in the window). Removed lines taken after the version edit:

```text
__version__ = "1.55.8"
version = "1.55.8"
version = "1.55.8"
 "version": "1.55.8",
```

## Version only · _v1.55.8

No engine code changed in 1.55.8 (Adaptive Wide Angle runs in the window). Removed lines taken after the version edit:

```text
__version__ = "1.55.7"
version = "1.55.7"
version = "1.55.7"
 "version": "1.55.7",
```

## Version only · _v1.55.7

No engine code changed in 1.55.7 (colour-model operations compose in the window). Removed lines taken after the version edit:

```text
__version__ = "1.55.6"
version = "1.55.6"
version = "1.55.6"
 "version": "1.55.6",
```

## Version only · _v1.55.6

No engine code changed in 1.55.6 (Perspective Warp runs in the window). Removed lines taken after the version edit:

```text
__version__ = "1.55.5"
version = "1.55.5"
version = "1.55.5"
 "version": "1.55.5",
```

## Version only · _v1.55.5

No engine code changed in 1.55.5 (the float compositor is window code). Removed lines taken after the version edit:

```text
__version__ = "1.55.4"
version = "1.55.4"
version = "1.55.4"
 "version": "1.55.4",
```

## Seam carving · _v1.55.4 (app/routers/seam.py new, app/main.py)

`seam.py`: `_energy` (luminance gradient plus the protection mask times a million), `_seam` (the dynamic programme over rows, vectorised across the row's columns, with a back-pointer array), `_remove`, `_insert` (the seam duplicated with its left neighbour averaged), `carve_width` (removal one seam at a time with the mask carved along; enlargement by the k lowest seams of the original tracked back to original columns, sorted per row and inserted with offsets), `carve` (height through the transpose, the mask carved to the new width first), `skin_mask` (Cb 77 to 127, Cr 133 to 173); `POST /api/seam/content-aware-scale` with `file`, `width`, `height`, `skin`, and an optional `mask`; limits a quarter to twice the size and 12 megapixels. Registered in `main.py`. Checked here: 320 by 200 to 240 in 0.58 s, to 400 in 0.72 s, a protected disc kept whole. Removed lines taken after the version edit:

```text
__version__ = "1.55.3"
version = "1.55.3"
version = "1.55.3"
 "version": "1.55.3",
```

## Version only · _v1.55.3

No engine code changed in 1.55.3. Removed lines taken after the version edit:

```text
__version__ = "1.55.2"
version = "1.55.2"
version = "1.55.2"
 "version": "1.55.2",
```

## Version only · _v1.55.2

No engine code changed in 1.55.2 (the deblocker runs in the window; Super Zoom reuses the shipped upscaler). Removed lines taken after the version edit:

```text
__version__ = "1.55.1"
version = "1.55.1"
version = "1.55.1"
 "version": "1.55.1",
```

## Style Transfer presets · _v1.55.1 (app/localgen/style.py new, app/localgen/paths.py, app/localgen/model_manager.py, app/main.py, requirements.txt)

`style.py`: the ONNX model zoo's five fast neural style models (BSD-3-Clause), each pinned by SHA-256 from the real download; the zoo exports a fixed 224 by 224 input, so the graph's input and output dims are made dynamic in memory when the session is built (the onnx package, Apache-2.0, pinned in requirements at 1.23.1; the file on disk stays the pinned original); RGB floats 0 to 255 in and out, the picture capped at 1024 on its long side for the model and scaled back; `POST /api/style/local` with a `style` field. `paths.session()` also takes model bytes, so the patched graph gets the same providers and memory settings as every model. Checked here: each preset on a photograph at 640 px in 1.1 to 1.5 s at the picture's own size. Removed lines taken after the version edit:

```text
__version__ = "1.54.9"
    SAM 2.1 and U^2-Net held 2,575 MB after three runs each; off, 687 MB (a peak of 1,314 MB), for a little speed."""
    return ort.InferenceSession(str(path), options, providers=providers())
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router, _lg_colorize.router):
version = "1.54.9"
version = "1.54.9"
 "version": "1.54.9",
```

## Colour for a black-and-white picture · _v1.54.9 (app/localgen/colorize.py new, app/localgen/model_manager.py, app/main.py)

`colorize.py`: DDColor-tiny as ONNX on ONNX Runtime with DDColor's own recipe (the picture's L of Lab as an RGB made of L alone, 512 by 512 in 0 to 1 NCHW; the predicted a and b scaled back to the picture's size and joined to the picture's own L through OpenCV's float Lab, so luminance is never touched); `POST /api/colorize/local`, 409 until the model is downloaded. `model_manager.py`: the registry entry (Apache-2.0, edgetools' revision 4755ae9f) and the SHA-256 pin computed from the real download. `main.py` includes the router. Checked here: a grey pier photograph colourised plausibly with luminance within 0.9; ONNX Runtime prints constant-folding warnings for the fp16 weights, harmless. Removed lines taken after the version edit:

```text
__version__ = "1.54.8"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router):
version = "1.54.8"
version = "1.54.8"
 "version": "1.54.8",
```

## Depth from one picture · _v1.54.8 (app/localgen/depth.py new, app/localgen/model_manager.py, app/main.py)

`depth.py`: Depth Anything V2 Small as ONNX on ONNX Runtime; the picture scaled to 518 by 518 and ImageNet-normalised (NCHW), the relative inverse depth scaled back to the picture's size and written as an 8-bit PNG with near bright; `POST /api/depth/local`, 409 until the model is downloaded. The session's real names are `pixel_values` and `predicted_depth`. `model_manager.py`: the registry entry (Apache-2.0, onnx-community's revision 413ce838) and the SHA-256 pin computed from the real download. `main.py` includes the router. Checked here: the model listed ready once in place; a synthetic scene's near object reads 203 and its far sky 85, in 1.8 s on this CPU. Removed lines taken after the version edit:

```text
__version__ = "1.54.7"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router):
version = "1.54.7"
version = "1.54.7"
 "version": "1.54.7",
```

## Version only · _v1.54.7

No engine code changed in 1.54.7 (the first Neural Filters run in the window). Removed lines taken after the version edit:

```text
__version__ = "1.54.6"
version = "1.54.6"
version = "1.54.6"
 "version": "1.54.6",
```

## Version only · _v1.54.6

No engine code changed in 1.54.6. Removed lines taken after the version edit:

```text
__version__ = "1.54.5"
version = "1.54.5"
version = "1.54.5"
 "version": "1.54.5",
```

## Version only · _v1.54.5

No engine code changed in 1.54.5 (Blend If and Knockout are window compositing). Removed lines taken after the version edit:

```text
__version__ = "1.54.4"
version = "1.54.4"
version = "1.54.4"
 "version": "1.54.4",
```

## OpenEXR contained · _v1.54.4 (app/services/contained.py new, app/routers/io.py, app/__init__.py, formvis_engine.py)

The parity plan's L14, closed. The engine keeps OpenCV's OpenEXR codec off; `contained.py` decodes and encodes EXR in a spawned child interpreter that turns the codec on for itself (`decode_exr`, `encode_exr`, `is_exr` by the file's magic), polling the result queue so a child that dies answers at once and a 60 s ceiling for one that hangs; workers answer None on any failure rather than tracing into the engine's log. `/io/decode-deep` routes an EXR to the child and names the refusal; `/io/encode-deep` writes EXR through it. `formvis_engine.py` calls `multiprocessing.freeze_support()` for the frozen build. Checked: a malformed EXR fails in 0.17 s with the engine process's codec still off and the process up; this sandbox's OpenCV wheel cannot write EXR at all (OpenEXR: NO), so the round trip is the owner's to confirm. Removed lines taken after the version edit:

```text
"""formvis engine."""
import os
# 32-bit documents (1.53.9, the parity plan's H1): OpenEXR is off in OpenCV by default, because its parser has had
# security problems with untrusted files (opencv/opencv#21326). formvis opens the person's own files on their own
# machine, so it is turned on for the engine, before OpenCV is first imported.
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
__version__ = "1.54.3"
    data = np.frombuffer(file.file.read(), np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
        raise HTTPException(status_code=415, detail="The picture could not be read at its depth.")
        ok, out = cv2.imencode({"png": ".png", "tiff": ".tif", "exr": ".exr", "tiff32": ".tif"}[format], cv2.cvtColor(np.ascontiguousarray(img), cv2.COLOR_RGBA2BGRA))
version = "1.54.3"
version = "1.54.3"
 "version": "1.54.3",
```

## Version only · _v1.54.3

No engine code changed in 1.54.3 (the one float pixel model is a window change). Removed lines taken after the version edit:

```text
__version__ = "1.54.2"
version = "1.54.2"
version = "1.54.2"
 "version": "1.54.2",
```

## The sRGB to ink table · _v1.54.2 (app/services/colour.py, app/routers/colour.py)

`rgb_cmyk_lut(profile, source, intent, bpc)`: a GRID^3 table of C, M, Y, K bytes (r slowest, b fastest) from an RGB profile (sRGB when none) to a CMYK one, the window's readouts and paint colours; `/color/rgb-cmyk-lut`. The exact path for pixels stays `convert_pixels`. Checked: 33^3 by 4 bytes; a red through the table lands within 1 level of the direct transform. Removed lines taken after the version edit:

```text
__version__ = "1.54.1"
version = "1.54.1"
version = "1.54.1"
 "version": "1.54.1",
```

## CMYK documents · _v1.54.1 (app/services/colour.py, app/routers/colour.py, app/routers/io.py, app/profiles/FOGRA39L_coated.icc new; setup/freeze_backend and .bat)

`colour.py`: `shipped_dir` (beside the app, or PyInstaller's `_MEIPASS`), `default_cmyk`, `cmyk_lut` (GRID4 = 17, c slowest, k fastest, relative intent), `convert_pixels` (LittleCMS at 8 bits, RGBA to CMYK and alpha or back, alpha through, MAX_BYTES times 8 a request); `profile_dirs` lists the shipped folder second; `profiles()` marks `shipped`. `routers/colour.py`: `/cmyk-lut`, `/convert-pixels` (multipart: pixels, width, height, to, profile base64, source base64, intent, bpc), `/default-cmyk`. `routers/io.py`: `/decode-cmyk` (Pillow; ink and alpha bytes then the embedded profile, `X-Profile-Bytes`; 204 when not CMYK) and `/encode-cmyk` (alpha lays the ink over paper, TIFF deflate or JPEG, profile embedded). The freeze scripts bundle `profiles`. The profile is colord's FOGRA39L under the zlib licence (NOTICE.md); ECI's own is not shippable. Checked: the conversion equals `ImageCms.applyTransform` directly; the table is 17^4 by 3 bytes; a TIFF ink round trip is exact and JPEG within 1 level. Removed lines taken after the version edit:

```text
__version__ = "1.53.9"
from fastapi import APIRouter, File, HTTPException, UploadFile
    dirs = [config.data_dir() / "Profiles"]
            out.append({"id": digest, **info, "file": path.name, "added": d == profile_dirs()[0]})
pyinstaller --noconfirm --clean --onefile --name formvis-engine --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller --add-data "%ROOT%\frontend\dist;frontend_dist" --collect-submodules app --collect-submodules uvicorn --collect-submodules keyring --hidden-import cv2 --exclude-module pillow_heif "%ROOT%\backend\formvis_engine.py" || exit /b 1
version = "1.53.9"
version = "1.53.9"
 "version": "1.53.9",
```

## Click-to-select with SAM 2.1 · _v1.42.0 (app/services/segment.py new, app/routers/ops.py, app/routers/system.py, app/services/compute.py, requirements_sam2.txt new; tests/test_select_object.py new)

`segment.py`: `available`, `torch_device`, `ensure_checkpoint` (SHA-256 checked), `encode`, `select`, `clear`, `model_dir` (FORMVIS_MODELS_DIR). `ops.py`: `select_object`. `system.py`: `_select_object` in capabilities. `compute.set_preference` also clears the SAM model. Removed:

```python
from app.services import background
from app.services import background, compute, imaging
        from app.services import background
```

## .comp import · _v1.40.0 (app/services/project_format.py, app/routers/projects.py; tests/test_comp_import.py new)

`project_format.py`: `COMP_LABEL`, `COMP_VERSIONS`, `is_comp` (a .comp recognised by its shape, then fully validated); the refusal messages name .comp. `projects.py`: `.comp` in `SUFFIXES`. Removed:

```python
SUFFIXES = (".fmv", ".formvis", ".canvasor", ".zip")
    if fmt not in SUPPORTED:
        raise ProjectError("This is not a formvis or canvasor project.")
    if not isinstance(version, int) or version not in SUPPORTED[fmt]:
        raise ProjectError(f"This project uses format version {version}, which this build cannot read.")
        raise ProjectError("The file is not a formvis or canvasor package.") from exc
```

## Camera RAW decoding · _v1.39.0 (app/services/imaging.py, requirements.txt, requirements_macos.txt; tests/test_raw.py and tests/fixtures/ new)

`imaging.py`: `RAW`, `RAW_ENGINE`, `RAW_SUFFIXES`, `_raw` (LibRaw through rawpy, before Pillow), and `decoders` reporting `raw` and `rawEngine`. Removed:

```python
    return {"heic": HEIF or sips_available(), "tiff": True, "engine": engine}
```

## The engine's compute device · _v1.26.0 (app/services/compute.py new; app/services/background.py, app/routers/system.py; tests/test_compute.py new)

`compute.py`: `DEVICES`, `PROVIDER`, `LABEL`, `available_providers`, `choose` (pure), `current`, `set_preference`. `background.py`: `_session(model, providers)` with the older-rembg fallback, `clear_sessions`, the providers from `compute.current()`. `system.py`: `GET` and `POST /api/compute` (`ComputeChoice`), `compute` in `/api/capabilities`. Removed:

```python
from fastapi import APIRouter
from app.services import background, imaging
def _session(model: str):
    return new_session(model)
    mask = remove(image.convert("RGB"), session=_session(model_name()), only_mask=True)
```

## The reference app's project format removed · _v1.4.0 (app/services/project_format.py, app/routers/projects.py, app/__init__.py)

`project_format.py` no longer accepts `com.reference.project`: `SUPPORTED` holds `com.nodemode.formvis` and `com.nodemode.canvasor` version 1; the refusals and `write_zip`'s docstring name only formvis's and canvasor's projects. `projects.py` drops `.ref` from `SUFFIXES`. Version 1.4.0. Removed:

```py
__version__ = "1.3.0"
SUFFIXES = (".fmv", ".formvis", ".ref", ".canvasor", ".zip")
REFERENCE = "com.reference.project"
# NodeMode canvasor's projects: the same manifest and images/ layout as .ref (bottom-to-top layers, each transform an
# origin and a displayed size), under their own id. Version 1 is the one seen; later versions are rejected, not guessed.
SUPPORTED = {REFERENCE: range(1, 8), FORMVIS: range(1, 2), CANVASOR: range(1, 2)}
        raise ProjectError("This is not a formvis, .ref or canvasor project.")
        raise ProjectError("The file is not a formvis, .ref or canvasor package.") from exc
    """The project as a zip: manifest.json and images/. With `root`, everything sits inside that one folder, so
    unzipping a .ref export yields a `Name.ref` package."""
```

## canvasor projects open · _v0.97.0 (app/services/project_format.py, app/routers/projects.py; tests/test_api.py)

`project_format.py`: `CANVASOR = "com.nodemode.canvasor"`, accepted at version 1 in `SUPPORTED` (later versions refused); the refusals name canvasor. `projects.py`: `SUFFIXES` strips `.canvasor` from project names. Removed:

```py
SUFFIXES = (".fmv", ".formvis", ".ref", ".zip")
SUPPORTED = {REFERENCE: range(1, 8), FORMVIS: range(1, 2)}
        raise ProjectError("This is not a formvis or .ref project.")
        raise ProjectError("The file is not a formvis or .ref package.") from exc
```

## Colour profiles in the encoder · _v0.92.0 (app/services/imaging.py, app/routers/io.py, tests/test_api.py)

`imaging.encode` takes `icc`: checked by LittleCMS (`ImageCms`), at most 1 MB, embedded in TIFF, WebP and AVIF, not in PDF. `/encode` takes an optional `icc` file. One test added. Removed:

```python
def encode(file: UploadFile = File(...), format: str = Form(...), quality: int = Form(90), dpi: int = Form(72)) -> Response:
        data = imaging.encode(file.file.read(), format.lower(), quality, dpi)
from PIL import Image, ImageOps
def encode(png: bytes, fmt: str, quality: int = 90, dpi: int = 72) -> bytes:
    images carry no alpha here), WebP or AVIF (at `quality`, alpha kept)."""
        rgba.save(out, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi))
        rgba.save(out, "WEBP", quality=q, method=4)
        rgba.save(out, "AVIF", quality=q)
```

## .fmv projects · _v0.90.0 (app/routers/projects.py, app/routers/io.py, tests/test_api.py)

`projects.py`: `EXT` (.fmv) and `OLD_EXT` (.formvis); `_library_path` names `.fmv`; `_existing` finds either for opening; the library lists both, `.fmv` preferred; save removes an older `.formvis` of the same name; delete removes either; `SUFFIXES` strips `.fmv` from imported names. `io.py`: the export rule takes `.fmv`. One test added. Removed:

```python
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|formvis|webp|tif|tiff|pdf|avif)$", re.IGNORECASE)
SUFFIXES = (".formvis", ".ref", ".zip")
    return config.projects_dir() / f"{clean}.formvis"
    items = []
    for path in config.projects_dir().glob("*.formvis"):
        stat = path.stat()
        items.append({"name": path.stem, "modified": stat.st_mtime, "size": stat.st_size})
    return sorted(items, key=lambda item: item["modified"], reverse=True)
    path = _library_path(name)
    _library_path(name).unlink(missing_ok=True)
```

## Export encodings · _v0.75.0 (app/services/imaging.py, app/routers/io.py, tests/test_api.py, logged together)

`imaging.encode` re-encodes the editor's PNG as TIFF (LZW, alpha kept), PDF (one page at the given dpi, flattened on white), WebP or AVIF (quality, alpha kept), refusing other formats and unreadable input with `DecodeError`; `ENCODINGS` maps each to its media type. `POST /api/io/encode` serves it (415 on refusal). `EXPORT_NAME` accepts .webp, .tif, .tiff, .pdf and .avif. Two tests added. Removed from `app/routers/io.py`:

```python
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|formvis)$", re.IGNORECASE)
```

## tests/

### tests/__init__.py, conftest.py, test_api.py · new · _v0.67.0

The backend suite, run by `python -m pytest -q tests` from `backend/`. `conftest.py` points `FORMVIS_DATA_DIR` at a fresh temporary folder per test and yields a FastAPI `TestClient`, plus `png_bytes` and `manifest` helpers; `test_api.py` covers health, version, capabilities, decode, export naming, the project library and its validation, packaging and the background engine's 501 answer, 9 tests. Nothing was removed.

## app/routers/generative.py

### app/routers/generative.py · new · _v0.37.0

`GET /status`, `PUT /key`, `DELETE /key`, `POST /fill` (the call runs in a thread so it never blocks the server). Nothing was removed.

### app/routers/generative.py · /upscale · _v0.38.0

`POST /upscale` (image, scale 2 or 4). Nothing was removed.

## app/services/generative.py

### app/services/generative.py · new · _v0.37.0

fal client for FLUX.1 Fill [pro] and Erase [pro]: key from FAL_KEY, FAL_API_KEY or `generative.json` (mode 600) in the data folder, never returned; inline PNG data URIs; fal's errors mapped to clear messages; `FORMVIS_FAL_BASE` points it elsewhere for testing. Nothing was removed.

### app/services/generative.py · upscale, _result_png · _v0.38.0

Real-ESRGAN upscaling; result parsing shared by Fill, Erase and Upscale. Removed:

```py
    images = result.get("images") or ([result["image"]] if isinstance(result.get("image"), dict) else [])
    if not images or not isinstance(images[0], dict) or not images[0].get("url"):
        raise GenerativeError("fal returned no image.", 502)
    if any(result.get("has_nsfw_concepts") or []):
        raise GenerativeError("fal withheld the result under its safety filter. Try another prompt.", 422)
    raw = _download(str(images[0]["url"]))
    try:
        with Image.open(io.BytesIO(raw)) as im:
            out = io.BytesIO()
            im.convert("RGBA").save(out, "PNG")
            return out.getvalue()
    except Exception as exc:  # noqa: BLE001 - any decode failure is a bad result
        raise GenerativeError("fal returned an image formvis could not read.", 502) from exc
```

## Org-navi-map

```text
.env.example  · template for backend/.env
HASHOUT_LOG.md  · this log
app/
    __init__.py  · version string
    core/
        __init__.py  · package marker
        config.py  · ports, limits, folders, .env loading
    main.py  · app assembly, CORS, static mount
    routers/
        __init__.py  · package marker
        io.py  · decode and export
        ops.py  · remove background
        projects.py  · library, import, sessions
        system.py  · health, version, capabilities
    services/
        __init__.py  · package marker
        background.py  · rembg and GrabCut
        imaging.py  · Pillow and pillow-heif decoding, sips fallback
        project_format.py  · manifest validation, zip and folder IO
        sessions.py  · opened-project sessions
boot_backend  · start the engine (unix)
boot_backend.bat  · start the engine (windows)
formvis_engine.py  · PyInstaller sidecar entry
oc_install  · install this side (unix)
oc_install.bat  · install this side (windows)
requirements.txt  · pinned base
requirements_desktop.txt  · pinned PyInstaller
requirements_desktop_macos.txt  · unpinned PyInstaller
requirements_macos.txt  · unpinned base for macOS
requirements_ml.txt  · pinned ML extra
requirements_ml_macos.txt  · unpinned ML extra
```

## Table of contents

- [.env.example](#envexample)
- [app/__init__.py](#app__init__py)
- [app/core/__init__.py](#appcore__init__py)
- [app/core/config.py](#appcoreconfigpy)
- [app/main.py](#appmainpy)
- [app/routers/__init__.py](#approuters__init__py)
- [app/routers/io.py](#approutersiopy)
- [app/routers/ops.py](#approutersopspy)
- [app/routers/projects.py](#approutersprojectspy)
- [app/routers/system.py](#approuterssystempy)
- [app/services/__init__.py](#appservices__init__py)
- [app/services/background.py](#appservicesbackgroundpy)
- [app/services/imaging.py](#appservicesimagingpy)
- [app/services/project_format.py](#appservicesproject_formatpy)
- [app/services/sessions.py](#appservicessessionspy)
- [boot_backend](#boot_backend)
- [boot_backend.bat](#boot_backendbat)
- [formvis_engine.py](#formvis_enginepy)
- [oc_install](#oc_install)
- [oc_install.bat](#oc_installbat)
- [requirements.txt](#requirementstxt)
- [requirements_desktop.txt](#requirements_desktoptxt)
- [requirements_desktop_macos.txt](#requirements_desktop_macostxt)
- [requirements_macos.txt](#requirements_macostxt)
- [requirements_ml.txt](#requirements_mltxt)
- [requirements_ml_macos.txt](#requirements_ml_macostxt)

## .env.example

### .env.example · template for backend/.env · _v0.1.0

Created in _v0.1.0.

## app/__init__.py

### app/__init__.py · version string · _v0.1.0

Created in _v0.1.0.

## app/core/__init__.py

### app/core/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/core/config.py

### app/core/config.py · ports, limits, folders, .env loading · _v0.1.0

Created in _v0.1.0.

## app/main.py

### app/main.py · app assembly, CORS, static mount · _v0.1.0

Created in _v0.1.0.

### app/main.py · generative router · _v0.37.0

Mounts `/api/generative`. Removed:

```py
from app.routers import io, ops, projects, system
```

## app/routers/__init__.py

### app/routers/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/routers/io.py

### app/routers/io.py · decode and export · _v0.1.0

Created in _v0.1.0.

## app/routers/ops.py

### app/routers/ops.py · remove background · _v0.1.0

Created in _v0.1.0.

## app/routers/projects.py

### app/routers/projects.py · save · _v0.1.0

Writes through a temporary file and `os.replace`, so a crash never leaves a half-written project.

### app/routers/projects.py · package · root folder · _v0.28.0

The package route takes an optional `root` form field, checked as a safe name, so a export unzips to `Name.ref/`. Removed:

```py
def package(manifest: str = Form(...), files: list[UploadFile] = File(default=[])) -> Response:
```

## app/routers/system.py

### app/routers/system.py · health, version, capabilities · _v0.1.0

Created in _v0.1.0.

## app/services/__init__.py

### app/services/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/services/background.py

### app/services/background.py · remove · _v0.1.0

rembg is the default when installed; OpenCV GrabCut is always available. Both return a mask PNG, never cut pixels. Verified live: GrabCut isolates a test subject (center 255, corner 0); `ml` answers 501 when not installed.

## app/services/imaging.py

### app/services/imaging.py · decode_to_png · _v0.1.0

`pillow-heif` bundles GPL x265, so the frozen sidecar excludes it and macOS falls back to `sips`.

## app/services/project_format.py

### app/services/project_format.py · validate · _v0.1.0

Accepts `com.reference.project` 1 to 7 and `com.nodemode.formvis` 1; checks sizes, ids, folder parents, clip links, depth 64 and clip chains 256 before anything touches disk. Verified live: a version 9 manifest is rejected with 422.

### app/services/project_format.py · write_zip · root folder · _v0.28.0

`write_zip` wraps the manifest and images in an optional root folder. Removed:

```py
def write_zip(manifest: dict, assets: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2), compress_type=zipfile.ZIP_DEFLATED)
        for name, data in assets.items():
            archive.writestr(f"images/{name}", data)
```

## app/services/sessions.py

### app/services/sessions.py · opened-project sessions · _v0.1.0

Created in _v0.1.0.

## boot_backend

### boot_backend · start the engine (unix) · _v0.1.0

Created in _v0.1.0.

## boot_backend.bat

### boot_backend.bat · start the engine (windows) · _v0.1.0

Created in _v0.1.0.

## formvis_engine.py

### formvis_engine.py · main · _v0.1.0

Serves the bundled `frontend_dist`; with `FORMVIS_PORT=0` uvicorn prints `http://127.0.0.1:PORT`, which the Tauri shell parses. Verified live. `--selfcheck` prints dependency versions as JSON.

## oc_install

### oc_install · install this side (unix) · _v0.1.0

Created in _v0.1.0.

## oc_install.bat

### oc_install.bat · install this side (windows) · _v0.1.0

Created in _v0.1.0.

## requirements.txt

### requirements.txt · pinned base · _v0.1.0

Created in _v0.1.0.

## requirements_desktop.txt

### requirements_desktop.txt · pinned PyInstaller · _v0.1.0

Created in _v0.1.0.

## requirements_desktop_macos.txt

### requirements_desktop_macos.txt · unpinned PyInstaller · _v0.1.0

Created in _v0.1.0.

## requirements_macos.txt

### requirements_macos.txt · unpinned base for macOS · _v0.1.0

Created in _v0.1.0.

## requirements_ml.txt

### requirements_ml.txt · pinned ML extra · _v0.1.0

Created in _v0.1.0.

## requirements_ml_macos.txt

### requirements_ml_macos.txt · unpinned ML extra · _v0.1.0

Created in _v0.1.0.

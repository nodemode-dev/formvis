"""An MCP server (1.52.1, the capability plan): outside agents (Claude Code, Claude Desktop, any MCP client) drive the open
formvis window. Streamable HTTP in stateless JSON mode at /mcp, following the 2026-07-28 specification (no initialize
handshake, no session; server/discover; the version on every request) and still answering initialize for clients of
2025-11-25. The Origin header is checked (only this computer), as the specification requires. The work happens in the
window, which collects requests from /api/mcp/bridge only while Allow outside agents is on in Preferences > Plugins;
anything that costs money asks the user there first."""

import asyncio
import collections
import itertools
import base64
import json
from pathlib import Path
import os
import time
import urllib.parse

from app.core import config
from fastapi import APIRouter, Request, Response

from app import __version__

router = APIRouter()
VERSIONS = ["2026-07-28", "2025-11-25"]
INSTRUCTIONS = ("formvis is a layered image editor running on this computer; these tools edit what is open in its window. "
                "Start with get_document (the layers and their ids) and get_image (to see the picture); check your work with get_image "
                "after each change. Every change is one undoable step (undo). Select before generative_fill or fill. Filters need pixels: "
                "rasterize_layer a text or shape layer first. Generative tools run on this computer first (LaMa, Krea 2, Real-ESRGAN) "
                "and on fal last, which asks the person. open_file, save_project and export_image take absolute paths. "
                "For the decision tree, get the edit_strategy prompt.")

# The strategy prompt (1.53.3): the decision tree for these tools, for a client to show or an agent to fetch.
STRATEGY = """How to edit a picture in formvis with these tools.

1. Look first. get_document gives the size, the layers bottom to top with their ids and kinds, and the open documents. get_image shows the picture; call it again after each change to check the result before going on.
2. Work on the right thing. Most tools act on the active layer: set_layer with active true chooses it. A new element goes on its own layer (add_layer, add_text, draw_shape, generate_image, place_image), so it can be moved or removed later.
3. Remove something from a photo: select it (select_subject for the main subject; select with a rectangle or ellipse around it; select_color_range for a colour), then generative_fill with no prompt. On this computer LaMa fills from the surroundings.
4. Add something to a photo: select where it goes, then generative_fill with a prompt describing it. model auto uses Krea 2 here when installed, else fal (the person is asked first).
5. Text and titles: add_text with size, colour and font; transform_layer to place it; draw_shape for a plate behind it (move_layer to put the plate below the text).
6. Colour and looks: add_adjustment (curves, levels, hsv, exposure, splitToning, halation, glow and more) keeps the picture editable; set_adjustment changes it later. color_match fits a pasted element to its background. add_film_layer adds a light leak or a frame. apply_filter blurs, sharpens or adds noise, on pixels only (rasterize_layer first for text and shapes).
7. Cut-outs: remove_background keeps the subject of the active layer as a mask; select_subject then fill or generative_fill works on the selection instead.
8. Size for a destination: resize_image scales the whole picture (keep the proportions); resize_canvas adds or removes space; crop keeps a rectangle; generative_expand grows the canvas and paints the new border; upscale enlarges 2 or 4 times into a new document.
9. Keep and deliver: save_project writes a .fmv that keeps every layer editable; export_image writes a PNG, JPEG or WebP of how it looks. Both take absolute paths; the folder must exist.
10. Mistakes: undo steps back one change at a time. If a tool fails, its message says what to do next: follow it and retry.
"""
PROMPTS = [{"name": "edit_strategy", "title": "How to edit in formvis", "description": "The decision tree for formvis's tools: looking, choosing layers, removing and adding, text, colour, cut-outs, sizes, saving and exporting.", "arguments": []}]


def _tool(name: str, description: str, props: dict, required: list[str] | None = None, **hints: bool) -> dict:
    return {"name": name, "description": description, "inputSchema": {"type": "object", "properties": props, "required": required or [], "additionalProperties": False},
            "annotations": {"readOnlyHint": hints.get("read", False), "destructiveHint": hints.get("destructive", False), "idempotentHint": hints.get("idempotent", False), "openWorldHint": hints.get("open", False)}}


_ID = {"type": "string", "description": "A layer id from get_document."}
TOOLS = [
    _tool("get_document", "The open document: name, size, resolution, colour mode (rgb, cmyk, grayscale...), bit depth, colour profile, the layers bottom to top (id, name, kind, visible, opacity, blend, parent group), the active layer and the selection's bounds.", {}, read=True, idempotent=True),
    _tool("get_image", "The document as it looks, as a PNG image, its longer side at most max_size pixels.", {"max_size": {"type": "integer", "minimum": 64, "maximum": 2048, "default": 1024}}, read=True, idempotent=True),
    _tool("new_document", "Opens a new document.", {"width": {"type": "integer", "minimum": 1, "maximum": 30000}, "height": {"type": "integer", "minimum": 1, "maximum": 30000},
          "name": {"type": "string", "maxLength": 120}, "background": {"type": "string", "enum": ["white", "transparent", "black"], "default": "white"}}, ["width", "height"]),
    _tool("select", "Changes the selection: a rectangle or ellipse (x, y, width, height in pixels) combined by mode, or all, none, or invert.", {"shape": {"type": "string", "enum": ["rectangle", "ellipse", "all", "none", "invert"]},
          "x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1},
          "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"}}, ["shape"]),
    _tool("add_layer", "Adds an empty layer above the active one and makes it active; returns its id.", {"name": {"type": "string", "maxLength": 120}}),
    _tool("set_layer", "Changes a layer's name, visibility, opacity (0 to 1) or blend mode, or makes it the active layer.", {"id": _ID, "name": {"type": "string", "maxLength": 120},
          "visible": {"type": "boolean"}, "opacity": {"type": "number", "minimum": 0, "maximum": 1}, "blend": {"type": "string"}, "active": {"type": "boolean"}}, ["id"], idempotent=True),
    _tool("delete_layer", "Deletes a layer (undoable).", {"id": _ID}, ["id"], destructive=True),
    _tool("fill", "Fills the selection (or the whole active layer when nothing is selected) with a colour.", {"color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "description": "#rrggbb"}}, ["color"]),
    _tool("add_adjustment", "Adds an adjustment layer (for example curves, levels, hsv, exposure, splitToning, halation, glow) with optional parameters.",
          {"kind": {"type": "string"}, "params": {"type": "object", "description": "The adjustment's parameters, as its Properties show them."}}, ["kind"]),
    _tool("place_image", "Places a PNG or JPEG image (base64) as a new layer at x, y.", {"data": {"type": "string", "description": "Base64 image data."}, "name": {"type": "string", "maxLength": 120},
          "x": {"type": "number", "default": 0}, "y": {"type": "number", "default": 0}}, ["data"]),
    _tool("undo", "Steps back through the document's history.", {"steps": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}}),
    _tool("redo", "Steps forward through the document's history.", {"steps": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}}),
    # Generative, local-first (1.53.3): what runs on this computer for free first, fal last (asked, it costs money).
    _tool("generative_fill", "Fills the selection (select first) and returns the new layer, masked to the selection. With no prompt it removes what the selection covers, filling from the surroundings; with a prompt it paints that. model auto uses LaMa (no prompt) or Krea 2 (a prompt) on this computer when downloaded, else FLUX on fal, which asks the person first. Fails with what to download or set up when nothing can run.",
          {"prompt": {"type": "string", "maxLength": 2000, "default": ""}, "model": {"type": "string", "enum": ["auto", "lama", "krea-2", "fal"], "default": "auto", "description": "auto: on this computer first (LaMa with no prompt, Krea 2 with one), fal last (asks the person, costs money)."},
           "influence": {"type": "number", "minimum": 0, "maximum": 1, "default": 0.4, "description": "Krea 2 only: how much what the selection covers shapes the result."}}, open=True),
    _tool("generative_expand", "Grows the canvas by the margins (pixels) and fills the new border, continuing the picture; a prompt describes what to add there. model as generative_fill.",
          {"left": {"type": "integer", "minimum": 0, "maximum": 8000, "default": 0}, "top": {"type": "integer", "minimum": 0, "maximum": 8000, "default": 0},
           "right": {"type": "integer", "minimum": 0, "maximum": 8000, "default": 0}, "bottom": {"type": "integer", "minimum": 0, "maximum": 8000, "default": 0},
           "prompt": {"type": "string", "maxLength": 2000, "default": ""}, "model": {"type": "string", "enum": ["auto", "lama", "krea-2", "fal"], "default": "auto", "description": "auto: on this computer first (LaMa with no prompt, Krea 2 with one), fal last (asks the person, costs money)."}}, open=True),
    _tool("generate_image", "Generates a picture from a prompt as a new layer the size of the document. model auto uses Krea 2 or FLUX.2 [klein] on this computer when installed, else FLUX1.1 [pro] on fal, which asks the person first.",
          {"prompt": {"type": "string", "maxLength": 2000}, "model": {"type": "string", "enum": ["auto", "krea-2", "flux2-klein-4b", "fal"], "default": "auto"}}, ["prompt"], open=True),
    _tool("upscale", "Enlarges what the document shows 2 or 4 times into a new document. model auto uses Real-ESRGAN on this computer when downloaded, else Real-ESRGAN on fal (asks first).",
          {"scale": {"type": "integer", "enum": [2, 4], "default": 2}, "model": {"type": "string", "enum": ["auto", "local", "fal"], "default": "auto"}}, open=True),
    _tool("remove_background", "Removes the active layer's background on this computer, keeping the subject (a mask on the layer; undoable).", {}),
    # Files, read and written by the engine at absolute paths (~ is expanded).
    _tool("open_file", "Opens a picture (PNG, JPEG, WebP, AVIF, GIF, TIFF, HEIC, camera raw) or a project (.fmv, .psd, .psb, .ora) from an absolute path as a new document.",
          {"path": {"type": "string", "description": "Absolute path, e.g. /Users/me/Pictures/beach.jpg"}}, ["path"]),
    _tool("save_project", "Saves the document as a formvis project (.fmv: layers, masks, adjustments and text stay editable) at an absolute path, replacing a file there.",
          {"path": {"type": "string", "description": "Absolute path ending .fmv"}}, ["path"], destructive=True),
    _tool("export_image", "Writes the document as it looks to an absolute path as PNG, JPEG or WebP (by the path's extension), replacing a file there.",
          {"path": {"type": "string", "description": "Absolute path ending .png, .jpg or .webp"}, "quality": {"type": "number", "minimum": 0.1, "maximum": 1, "default": 0.92}}, ["path"], destructive=True),
    _tool("switch_document", "Makes an open document the one tools act on, by its id from get_document's documents.", {"id": _ID}, ["id"], idempotent=True),
    # The document's size and shape.
    _tool("resize_image", "Resamples the whole document to width x height pixels (keep the shape by scaling both by one factor).",
          {"width": {"type": "integer", "minimum": 1, "maximum": 30000}, "height": {"type": "integer", "minimum": 1, "maximum": 30000}}, ["width", "height"]),
    _tool("resize_canvas", "Changes the canvas to width x height without scaling the picture; anchor says where the picture stays.",
          {"width": {"type": "integer", "minimum": 1, "maximum": 30000}, "height": {"type": "integer", "minimum": 1, "maximum": 30000},
           "anchor": {"type": "string", "enum": ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"], "default": "center"}}, ["width", "height"]),
    _tool("crop", "Crops the document to a rectangle in pixels.", {"x": {"type": "integer"}, "y": {"type": "integer"}, "width": {"type": "integer", "minimum": 1}, "height": {"type": "integer", "minimum": 1}}, ["x", "y", "width", "height"], destructive=True),
    _tool("flip_canvas", "Flips the whole document horizontally or vertically.", {"direction": {"type": "string", "enum": ["horizontal", "vertical"]}}, ["direction"]),
    # Layers.
    _tool("transform_layer", "Moves, scales, rotates or flips a layer (id from get_document): x and y are its new top-left in pixels, scale a percentage, rotation degrees.",
          {"id": _ID, "x": {"type": "number"}, "y": {"type": "number"}, "scale": {"type": "number", "minimum": 1, "maximum": 1000}, "rotation": {"type": "number", "minimum": -360, "maximum": 360},
           "flip": {"type": "string", "enum": ["horizontal", "vertical"]}}, ["id"]),
    _tool("rasterize_layer", "Turns a text, shape or smart-object layer into pixels, so filters and painting apply to it.", {"id": _ID}, ["id"]),
    _tool("duplicate_layer", "Duplicates a layer above itself; returns the copy's id.", {"id": _ID, "name": {"type": "string", "maxLength": 120}}, ["id"]),
    _tool("move_layer", "Moves a layer above or below another in the stack.", {"id": _ID, "target": _ID, "where": {"type": "string", "enum": ["above", "below"], "default": "above"}}, ["id", "target"]),
    _tool("merge_layers", "Merges layers into one (the ids given, or with only one id that layer into the one below it).", {"ids": {"type": "array", "items": _ID, "minItems": 1}}, ["ids"], destructive=True),
    _tool("flatten_image", "Flattens every layer into one.", {}, destructive=True),
    _tool("add_text", "Adds a text layer; returns its id. x and y are the top-left of the text in pixels; size in pixels; color as #rrggbb.",
          {"text": {"type": "string", "maxLength": 5000}, "x": {"type": "number", "default": 0}, "y": {"type": "number", "default": 0}, "size": {"type": "number", "minimum": 1, "maximum": 2000, "default": 48},
           "color": {"type": "string", "default": "#000000"}, "font": {"type": "string", "default": "Inter"}, "bold": {"type": "boolean", "default": False}, "italic": {"type": "boolean", "default": False},
           "align": {"type": "string", "enum": ["left", "center", "right"], "default": "left"}}, ["text"]),
    _tool("draw_shape", "Draws a shape layer: a rectangle, ellipse, triangle, star, line or arrow within x, y, width, height, filled and/or stroked (colors #rrggbb; omit fill or stroke for none).",
          {"kind": {"type": "string", "enum": ["rectangle", "ellipse", "triangle", "star", "polygon", "line", "arrow"]}, "x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1},
           "fill": {"type": "string"}, "stroke": {"type": "string"}, "stroke_width": {"type": "number", "minimum": 0.5, "maximum": 200, "default": 3}}, ["kind", "x", "y", "width", "height"]),
    # Selecting.
    _tool("select_subject", "Selects the main subject (a person, animal or object) on this computer.", {}),
    _tool("select_color_range", "Selects pixels near a colour (#rrggbb) in the active layer; fuzziness 0 to 200 widens the range.", {"color": {"type": "string"}, "fuzziness": {"type": "number", "minimum": 0, "maximum": 200, "default": 40}}, ["color"]),
    # Filters and looks.
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Filter Gallery: filterGallery {effects: [{filter, values, visible}]}, its effect layers applied in order, the first at the bottom, hidden ones skipped; filter is one of: coloredPencil {pencilWidth 1 to 24, strokePressure 0 to 15, paperBrightness 0 to 50}, cutout {numberOfLevels 2 to 8, edgeSimplicity 0 to 10, edgeFidelity 1 to 3}, dryBrush and fresco {brushSize 0 to 10, brushDetail 0 to 10, texture 1 to 3}, filmGrain {grain 0 to 20, highlightArea 0 to 20, intensity 0 to 10}, neonGlow {glowSize -24 to 24, glowBrightness 0 to 50, glowColor (#rrggbb)}, paintDaubs {brushSize 1 to 50, sharpness 0 to 40, brushType: simple|lightRough|darkRough|wideSharp|wideBlurry|sparkle}, paletteKnife {strokeSize 1 to 50, strokeDetail 1 to 3, softness 0 to 10}, plasticWrap {highlightStrength 0 to 20, detail 1 to 15, smoothness 1 to 15}, posterEdges {edgeThickness 0 to 10, edgeIntensity 0 to 10, posterization 0 to 6}, roughPastels {strokeLength 0 to 40, strokeDetail 1 to 20, texture: canvas|brick|burlap|sandstone, scaling 50 to 200, relief 0 to 50, light: top|topRight|right|bottomRight|bottom|bottomLeft|left|topLeft, invert}, smudgeStick {strokeLength 0 to 10, highlightArea 0 to 20, intensity 0 to 10}, sponge {brushSize 0 to 10, definition 0 to 25, smoothness 1 to 15}, underpainting {brushSize 0 to 40, textureCoverage 0 to 40, and roughPastels' texture, scaling, relief, light, invert}, watercolor {brushDetail 1 to 14, shadowIntensity 0 to 10, texture 1 to 3}, accentedEdges {edgeWidth 1 to 14, edgeBrightness 0 to 50, smoothness 1 to 15}, angledStrokes {directionBalance 0 to 100, strokeLength 3 to 50, sharpness 0 to 10}, crosshatch {strokeLength 3 to 50, sharpness 0 to 20, strength 1 to 3}, darkStrokes {balance 0 to 10, blackIntensity 0 to 10, whiteIntensity 0 to 10}, inkOutlines {strokeLength 1 to 50, darkIntensity 0 to 50, lightIntensity 0 to 50}, spatter {sprayRadius 0 to 25, smoothness 1 to 15}, sprayedStrokes {strokeLength 0 to 20, sprayRadius 0 to 25, strokeDirection: rightDiagonal|horizontal|leftDiagonal|vertical}, sumiE {strokeWidth 3 to 15, strokePressure 0 to 15, contrast 0 to 40}, diffuseGlow {graininess 0 to 10, glowAmount 0 to 20, clearAmount 0 to 20}, glass {distortion 0 to 20, smoothness 1 to 15, texture: frosted|blocks|canvas|tinyLens, scaling 50 to 200, invert}, oceanRipple {rippleSize 1 to 15, rippleMagnitude 0 to 20}, glowingEdges {edgeWidth 1 to 14, edgeBrightness 0 to 20, smoothness 1 to 15}, basRelief {detail 1 to 15, smoothness 1 to 15, light}, chalkCharcoal {charcoalArea 0 to 20, chalkArea 0 to 20, strokePressure 0 to 5}, charcoal {charcoalThickness 1 to 7, detail 0 to 5, lightDarkBalance 0 to 100}, chrome {detail 0 to 10, smoothness 0 to 10}, conteCrayon {foregroundLevel 1 to 15, backgroundLevel 1 to 15, and roughPastels' texture, scaling, relief, light, invert}, graphicPen {strokeLength 1 to 15, lightDarkBalance 0 to 100, strokeDirection}, halftonePattern {size 1 to 12, contrast 0 to 50, patternType: dot|circle|line}, notePaper {imageBalance 0 to 50, graininess 0 to 20, relief 0 to 25}, photocopy {detail 1 to 24, darkness 1 to 50}, plaster {imageBalance 0 to 50, smoothness 1 to 15, light}, reticulation {density 0 to 50, foregroundLevel 0 to 50, backgroundLevel 0 to 50}, stamp {lightDarkBalance 0 to 50, smoothness 1 to 50}, tornEdges {imageBalance 0 to 50, smoothness 1 to 15, contrast 1 to 25}, waterPaper {fiberLength 3 to 50, brightness 0 to 100, contrast 0 to 100}, craquelure {crackSpacing 2 to 100, crackDepth 0 to 10, crackBrightness 0 to 10}, grain {intensity 0 to 100, contrast 0 to 100, grainType: regular|soft|sprinkles|clumped|contrasty|enlarged|stippled|horizontal|vertical|speckle}, mosaicTiles {tileSize 2 to 100, groutWidth 1 to 15, lightenGrout 0 to 10}, patchwork {squareSize 0 to 10, relief 0 to 25}, stainedGlass {cellSize 2 to 50, borderThickness 1 to 20, lightIntensity 0 to 10}, texturizer {roughPastels' texture, scaling, relief, light, invert}; colours come from the foreground and background colours (the Sketch effects' ink and paper). Unnamed settings keep their defaults.",
          {"kind": {"type": "string", "enum": ["gaussianBlur", "motionBlur", "addNoise", "unsharpMask", "lensBlur", "smartSharpen", "surfaceBlur", "radialBlur", "tiltShift", "irisBlur", "fieldBlur",
                                               "average", "blur", "blurMore", "boxBlur", "shapeBlur", "smartBlur", "sharpen", "sharpenMore", "sharpenEdges", "despeckle", "dustAndScratches", "median", "reduceNoise",
                                               "custom", "hsbHsl", "highPass", "maximum", "minimum", "offset", "deInterlace", "ntscColors",
                                               "displace", "pinch", "polarCoordinates", "ripple", "shear", "spherize", "twirl", "wave", "zigZag",
                                               "colorHalftone", "crystallize", "facet", "fragment", "mezzotint", "mosaic", "pointillize",
                                               "diffuse", "emboss", "extrude", "findEdges", "oilPaint", "solarize", "tiles", "traceContour", "wind",
                                               "clouds", "differenceClouds", "fibers", "lensFlare", "lightingEffects", "flame", "pictureFrame", "tree", "spinBlur", "filterGallery"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
    _tool("set_adjustment", "Changes an adjustment layer's parameters (id from get_document; the same parameters as add_adjustment).", {"id": _ID, "params": {"type": "object"}}, ["id", "params"], idempotent=True),
    _tool("color_match", "Matches a layer's colours to what is beneath it or around it, as a Curves layer clipped to it; amount 0 to 1.",
          {"id": _ID, "to": {"type": "string", "enum": ["beneath", "around"], "default": "beneath"}, "amount": {"type": "number", "minimum": 0, "maximum": 1, "default": 1}}, ["id"]),
    _tool("add_film_layer", "Adds a film look as its own layer: a light leak (color amber|red|magenta|gold from left|right|top|bottom|corner) or a frame (style film|white|line).",
          {"kind": {"type": "string", "enum": ["leak", "frame"]}, "color": {"type": "string", "enum": ["amber", "red", "magenta", "gold"], "default": "amber"},
           "from": {"type": "string", "enum": ["left", "right", "top", "bottom", "corner"], "default": "left"}, "style": {"type": "string", "enum": ["film", "white", "line"], "default": "film"}}, ["kind"]),
    # The video timeline (1.59.7, DEV_PLAN 25.5), as Photon Studio's timeline operations: frames counted from 0; every
    # edit is one undoable step; moving the playhead is not an edit.
    _tool("timeline_get", "The document's video timeline: frame rate, length in frames and seconds, the playhead, the work area, loops, and per layer (top first) its clip (start and length in frames), fades and keyframes. Null when it has none.", {}, read=True, idempotent=True),
    _tool("timeline_create", "Creates a video timeline with a track per layer, fps frames a second and seconds long. A document has a video timeline or a frame animation, not both.",
          {"fps": {"type": "number", "minimum": 1, "maximum": 240, "default": 30}, "seconds": {"type": "number", "minimum": 0.1, "maximum": 3600, "default": 5}}),
    _tool("timeline_delete", "Deletes the video timeline: its clips, keyframes and transitions (the layers stay).", {}, destructive=True),
    _tool("timeline_set", "Changes the frame rate, the length in seconds, the work area (work_in to work_out, frames, work_out excluded) or the loop count (0 forever).",
          {"fps": {"type": "number", "minimum": 1, "maximum": 240}, "seconds": {"type": "number", "minimum": 0.01, "maximum": 3600}, "work_in": {"type": "integer", "minimum": 0},
           "work_out": {"type": "integer", "minimum": 1}, "loops": {"type": "integer", "minimum": 0, "maximum": 65535}}, idempotent=True),
    _tool("timeline_go_to", "Moves the playhead to a frame; the window shows that moment. Not an edit.", {"frame": {"type": "integer", "minimum": 0}}, ["frame"], idempotent=True),
    _tool("timeline_clip", "Moves or trims a layer's clip: start is the frame where it begins, length how many frames it lasts. Outside its clip the layer does not show.",
          {"id": _ID, "start": {"type": "integer"}, "length": {"type": "integer", "minimum": 1}}, ["id"], idempotent=True),
    _tool("timeline_split", "Splits a layer's clip at a frame (default the playhead): the clip ends there and a copy of the layer carries on with the rest and the same keyframes; returns the copy's id.",
          {"id": _ID, "frame": {"type": "integer", "minimum": 1}}, ["id"]),
    _tool("timeline_keyframe", "Keys a layer's property at a frame (default the playhead): x and y in pixels, opacity and fill 0 to 1, style 1 (its layer style on) or 0; interpolation linear or hold (until the next keyframe). delete removes the keyframe at that frame; clear removes all of the property's keyframes.",
          {"id": _ID, "property": {"type": "string", "enum": ["x", "y", "opacity", "fill", "style"]}, "frame": {"type": "integer", "minimum": 0}, "value": {"type": "number"},
           "interpolation": {"type": "string", "enum": ["linear", "hold"], "default": "linear"}, "delete": {"type": "boolean", "default": False}, "clear": {"type": "boolean", "default": False}}, ["id", "property"]),
    _tool("timeline_transition", "Adds a transition to a layer's clip: fade_in, fade_out or fade (both) over seconds, to transparent or with black or white (the layer turns to that colour at the clip's edge); cross_fade with the clip starting or ending within it (only the upper fades, so the picture never dips); or remove.",
          {"id": _ID, "kind": {"type": "string", "enum": ["fade_in", "fade_out", "fade", "cross_fade", "remove"]}, "seconds": {"type": "number", "minimum": 0.01, "maximum": 600, "default": 1},
           "color": {"type": "string", "enum": ["transparent", "black", "white"], "default": "transparent"}}, ["id", "kind"]),
    _tool("timeline_frame_image", "One frame of the video timeline as a PNG image, its longer side at most max_size pixels.",
          {"frame": {"type": "integer", "minimum": 0}, "max_size": {"type": "integer", "minimum": 64, "maximum": 2048, "default": 1024}}, ["frame"], read=True, idempotent=True),
    _tool("timeline_render", "Renders the video timeline to an absolute path: .mp4 (H.264), .gif, or .zip (numbered PNG frames); every frame, or from to to (frames, to excluded); scale 1, 0.5 or 0.25. Replaces a file there.",
          {"path": {"type": "string", "description": "Absolute path ending .mp4, .gif or .zip"}, "from": {"type": "integer", "minimum": 0}, "to": {"type": "integer", "minimum": 1},
           "scale": {"type": "number", "enum": [1, 0.5, 0.25], "default": 1}}, ["path"], destructive=True),
]
NAMES = {t["name"] for t in TOOLS}

# The bridge to the window: requests queued here, collected by the window, answered back.
_pending: collections.deque = collections.deque()
_ready: asyncio.Event | None = None
_waiting: dict[str, asyncio.Future] = {}
_ids = itertools.count(1)
_seen = 0.0
LIVE = 30.0
# Seamless start (1.53.3): the window polls whether or not agents are allowed, saying which; with agents not allowed
# the first request asks the person in the window; with no window, formvis is opened in the browser and waited for.
_allowed = False
_declined_until = 0.0
_opened_at = 0.0


def _event() -> asyncio.Event:
    global _ready
    if _ready is None:
        _ready = asyncio.Event()
    return _ready


def _put(item: dict, front: bool = False) -> None:
    (_pending.appendleft if front else _pending.append)(item)
    _event().set()


def _local_origin(origin: str | None) -> bool:
    if not origin:
        return True   # not a browser page
    host = urllib.parse.urlparse(origin).hostname or ""
    return host in ("localhost", "127.0.0.1", "::1", "tauri.localhost") or origin.startswith("tauri://")


CACHE_HINTS = {"ttlMs": 300_000, "cacheScope": "public"}


def _ok(req_id, result: dict, modern: bool, cacheable: bool = False) -> dict:
    extra = {"resultType": "complete", **(CACHE_HINTS if cacheable else {})} if modern else {}
    return {"jsonrpc": "2.0", "id": req_id, "result": {**result, **extra}}


def _err(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _live() -> bool:
    return time.monotonic() - _seen <= LIVE


def _fail(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}], "isError": True}


def _open_window() -> bool:
    """formvis opened in the browser, at most once a minute; not in the desktop app (it is the window) or when
    FORMVIS_OPEN_WINDOW=0 (tests, headless machines)."""
    global _opened_at
    if os.environ.get("FORMVIS_OPEN_WINDOW", "1") == "0" or config.is_desktop() or time.monotonic() - _opened_at < 60:
        return False
    _opened_at = time.monotonic()
    import webbrowser
    url = f"http://127.0.0.1:{config.BACKEND_PORT}/" if config.dist_dir() else f"http://localhost:{config.FRONTEND_PORT}/"
    try:
        return bool(webbrowser.open(url))
    except Exception:
        return False


async def _ask(name: str, args: dict, timeout: float) -> dict | None:
    rid = str(next(_ids))
    fut = asyncio.get_running_loop().create_future()
    _waiting[rid] = fut
    _put({"id": rid, "name": name, "arguments": args})
    try:
        return await asyncio.wait_for(fut, timeout=timeout)
    except asyncio.TimeoutError:
        return None
    finally:
        _waiting.pop(rid, None)


# Files at absolute paths (1.53.3): read and written here, the window doing the picture's part.
_PICTURES = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".tif", ".tiff", ".heic", ".heif", ".bmp", ".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2"}
_PROJECTS = {".fmv", ".psd", ".psb", ".ora"}
_EXPORTS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
_MAX_OPEN = 512 * 1024 * 1024


def _path(raw, kinds: set, reading: bool) -> Path:
    path = Path(os.path.expanduser(str(raw or "").strip()))
    if not str(raw or "").strip() or not path.is_absolute():
        raise ValueError("Give an absolute path, for example /Users/you/Pictures/photo.png (~ works too).")
    if path.suffix.lower() not in kinds:
        raise ValueError(f"{path.name}: formvis takes {', '.join(sorted(kinds))} here.")
    if reading and not path.is_file():
        raise ValueError(f"There is no file at {path}.")
    if not reading and not path.parent.is_dir():
        raise ValueError(f"The folder {path.parent} does not exist: create it first, or choose another.")
    return path


async def _run(name: str, args: dict) -> dict:
    """A tool call: files at paths handled here, around the window's part; everything else in the window."""
    try:
        if name == "open_file":
            path = _path(args.get("path"), _PICTURES | _PROJECTS, True)
            if path.stat().st_size > _MAX_OPEN:
                return _fail(f"{path.name} is larger than 512 MB.")
            data = base64.b64encode(await asyncio.to_thread(path.read_bytes)).decode()
            return await _call("__open", {"name": path.name, "data": data})
        if name == "timeline_render":   # 1.59.7, DEV_PLAN 25.5: the window renders, this writes
            path = _path(args.get("path"), {".mp4", ".gif", ".zip"}, False)
            out = await _call("__render", {"format": {".mp4": "mp4", ".gif": "gif", ".zip": "png"}[path.suffix.lower()],
                                           **{k: args[k] for k in ("from", "to", "scale") if k in args}})
            data = (out.get("structuredContent") or {}).get("data") if not out.get("isError") else None
            if not data:
                return out if out.get("isError") else _fail("formvis rendered nothing.")
            blob = base64.b64decode(data)
            await asyncio.to_thread(path.write_bytes, blob)
            return {"content": [{"type": "text", "text": f"Wrote {path} ({len(blob):,} bytes)."}], "structuredContent": {"path": str(path), "bytes": len(blob)}}
        if name in ("save_project", "export_image"):
            path = _path(args.get("path"), {".fmv"} if name == "save_project" else set(_EXPORTS), False)
            out = await _call("__project" if name == "save_project" else "__export", {} if name == "save_project" else {"type": _EXPORTS[path.suffix.lower()], "quality": args.get("quality", 0.92)})
            data = (out.get("structuredContent") or {}).get("data") if not out.get("isError") else None
            if not data:
                return out if out.get("isError") else _fail("formvis gave nothing to write.")
            blob = base64.b64decode(data)
            await asyncio.to_thread(path.write_bytes, blob)
            return {"content": [{"type": "text", "text": f"Wrote {path} ({len(blob):,} bytes)."}], "structuredContent": {"path": str(path), "bytes": len(blob)}}
    except ValueError as exc:
        return _fail(str(exc))
    except OSError as exc:
        return _fail(f"Could not {'read' if name == 'open_file' else 'write'} the file: {exc.strerror or exc}.")
    return await _call(name, args)


async def _call(name: str, args: dict) -> dict:
    """Runs a tool in the window; its MCP result. formvis is opened if no window is, and the person asked once if
    outside agents are not allowed; each failure says what to do next."""
    global _allowed, _declined_until
    if not _live() and _seen and time.monotonic() - _seen < 300:
        # A window that was here minutes ago is reloading or busy (1.53.3): waited for, not replaced or refused.
        for _ in range(80):
            await asyncio.sleep(0.25)
            if _live():
                break
    if not _live():
        if _open_window():
            for _ in range(90):
                await asyncio.sleep(0.5)
                if _live():
                    break
        if not _live():
            return _fail("formvis is not open. Start it with ./formvis boot (or open the formvis app), then retry.")
    if not _allowed:
        if time.monotonic() < _declined_until:
            return _fail("The person chose not to allow outside agents in formvis just now. Ask them to turn on Allow outside agents (Preferences > Plugins), then retry.")
        answer = await _ask("__consent__", {}, 180)
        if not (answer or {}).get("allowed"):
            _declined_until = time.monotonic() + 600
            return _fail("The person did not allow outside agents in formvis. Ask them to allow it (the question in the formvis window, or Preferences > Plugins), then retry.")
        _allowed = True
    out = await _ask(name, args, 600)   # a generative call waits for the person and the model
    return out if out is not None else _fail("formvis did not answer in time: it may be busy with a long task. Check the formvis window, then retry.")


@router.post("/mcp")
async def mcp(request: Request) -> Response:
    if not _local_origin(request.headers.get("origin")):
        return Response(status_code=403, content=json.dumps(_err(None, -32600, "Origin not allowed")), media_type="application/json")
    try:
        msg = json.loads(await request.body())
    except ValueError:
        return Response(content=json.dumps(_err(None, -32700, "Parse error")), media_type="application/json", status_code=400)
    if isinstance(msg, list):
        return Response(content=json.dumps(_err(None, -32600, "Batches are not supported")), media_type="application/json", status_code=400)
    req_id, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if req_id is None:
        return Response(status_code=202)   # a notification
    meta = params.get("_meta") or {}
    version = meta.get("io.modelcontextprotocol/protocolVersion") or request.headers.get("mcp-protocol-version") or "2025-11-25"
    modern = version == "2026-07-28"
    server = {"name": "formvis", "version": __version__}
    if version not in VERSIONS and method != "initialize":
        out = _err(req_id, -32602, f"Unsupported protocol version {version}; supported: {', '.join(VERSIONS)}")
    elif method == "server/discover":
        out = _ok(req_id, {"supportedVersions": VERSIONS, "capabilities": {"tools": {}, "prompts": {}}, "_meta": {"io.modelcontextprotocol/serverInfo": server}, "instructions": INSTRUCTIONS}, True, cacheable=True)
    elif method == "initialize":
        asked = params.get("protocolVersion")
        out = _ok(req_id, {"protocolVersion": asked if asked in VERSIONS else "2025-11-25", "capabilities": {"tools": {}, "prompts": {}}, "serverInfo": server, "instructions": INSTRUCTIONS}, False)
    elif method == "ping":
        out = _ok(req_id, {}, modern)
    elif method == "prompts/list":
        out = _ok(req_id, {"prompts": PROMPTS}, modern, cacheable=True)
    elif method == "prompts/get":
        out = _ok(req_id, {"description": PROMPTS[0]["description"], "messages": [{"role": "user", "content": {"type": "text", "text": STRATEGY}}]}, modern) if params.get("name") == "edit_strategy" else _err(req_id, -32602, f"No prompt named {params.get('name')}")
    elif method == "tools/list":
        out = _ok(req_id, {"tools": TOOLS}, modern, cacheable=True)
    elif method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        out = _ok(req_id, await _run(name, args), modern) if name in NAMES and isinstance(args, dict) else _err(req_id, -32602, f"No tool named {name}")
    else:
        out = _err(req_id, -32601, f"Method not found: {method}")
    return Response(content=json.dumps(out), media_type="application/json")


@router.get("/api/mcp/bridge/next")
async def bridge_next(request: Request) -> Response:
    """The window's long poll: the next request, or 204 after 20 seconds. Polling is what marks agents as allowed. A
    window that closed or reloaded mid-poll must not take a request with it: the connection is checked before and after
    taking one, and a request taken for a gone window goes back to the front for the next poll (1.52.1)."""
    global _seen, _allowed
    allowed = request.query_params.get("allowed", "1") != "0"   # 1.53.3: the window polls either way, saying which
    if allowed and not _allowed:
        globals()["_declined_until"] = 0.0
    _allowed = allowed
    deadline = time.monotonic() + 20
    eligible = lambda it: allowed or it.get("name") == "__consent__"   # not allowed: only the question goes out
    while time.monotonic() < deadline:
        _seen = time.monotonic()
        if await request.is_disconnected():
            return Response(status_code=204)
        if not any(eligible(it) for it in _pending):
            _event().clear()
            try:
                await asyncio.wait_for(_event().wait(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
        found = next((it for it in _pending if eligible(it)), None)
        if found is None:
            continue
        _pending.remove(found)
        item = found
        if await request.is_disconnected():
            _put(item, front=True)
            return Response(status_code=204)
        return Response(content=json.dumps(item), media_type="application/json")
    return Response(status_code=204)


@router.post("/api/mcp/bridge/result")
async def bridge_result(request: Request) -> dict:
    body = await request.json()
    fut = _waiting.get(str(body.get("id")))
    if fut and not fut.done():
        fut.set_result(body.get("result") or {"content": [{"type": "text", "text": "formvis gave no result."}], "isError": True})
    return {"ok": True}


@router.post("/api/mcp/bridge/stop")
async def bridge_stop() -> dict:
    """Agents turned off in Preferences (the window stays open, 1.53.3): an explicit no, so calls are refused at once
    with how to turn it back on, not asked again for ten minutes; anything queued is answered."""
    global _allowed, _declined_until
    _allowed = False
    _declined_until = time.monotonic() + 600
    while _pending:
        item = _pending.popleft()
        fut = _waiting.get(item["id"])
        if fut and not fut.done():
            fut.set_result(_fail("Outside agents were turned off in formvis. Ask the person to turn on Allow outside agents (Preferences > Plugins), then retry."))
    return {"ok": True}


@router.get("/api/mcp/status")
def status() -> dict:
    return {"live": _live(), "allowed": _allowed, "endpoint": "http://127.0.0.1:8190/mcp", "tools": len(TOOLS)}

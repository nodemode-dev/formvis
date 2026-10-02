# formvis tools

Generated from the engine's catalogue by `./formvis agents sync`; do not edit by hand.

## Contents

- Look: `get_document`, `get_image`
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

The open document: name, size, resolution, colour mode (rgb, cmyk, grayscale...), bit depth, colour profile, the layers bottom to top (id, name, kind, visible, opacity, blend, parent group), the active layer and the selection's bounds.

- no parameters

Note: read-only.

## get_image

The document as it looks, as a PNG image, its longer side at most max_size pixels.

- `max_size`: integer; default 1024

Note: read-only.

## new_document

Opens a new document.

- `width`: integer; required
- `height`: integer; required
- `name`: string
- `background`: string (white | transparent | black); default "white"

## select

Changes the selection: a rectangle or ellipse (x, y, width, height in pixels) combined by mode, or all, none, or invert.

- `shape`: string (rectangle | ellipse | all | none | invert); required
- `x`: number
- `y`: number
- `width`: number
- `height`: number
- `mode`: string (replace | add | subtract | intersect); default "replace"

## add_layer

Adds an empty layer above the active one and makes it active; returns its id.

- `name`: string

## set_layer

Changes a layer's name, visibility, opacity (0 to 1) or blend mode, or makes it the active layer.

- `id`: string; required; A layer id from get_document.
- `name`: string
- `visible`: boolean
- `opacity`: number
- `blend`: string
- `active`: boolean

## delete_layer

Deletes a layer (undoable).

- `id`: string; required; A layer id from get_document.

Note: replaces or removes.

## fill

Fills the selection (or the whole active layer when nothing is selected) with a colour.

- `color`: string; required; #rrggbb

## add_adjustment

Adds an adjustment layer (for example curves, levels, hsv, exposure, splitToning, halation, glow) with optional parameters.

- `kind`: string; required
- `params`: object; The adjustment's parameters, as its Properties show them.

## place_image

Places a PNG or JPEG image (base64) as a new layer at x, y.

- `data`: string; required; Base64 image data.
- `name`: string
- `x`: number; default 0
- `y`: number; default 0

## undo

Steps back through the document's history.

- `steps`: integer; default 1

## redo

Steps forward through the document's history.

- `steps`: integer; default 1

## generative_fill

Fills the selection (select first) and returns the new layer, masked to the selection. With no prompt it removes what the selection covers, filling from the surroundings; with a prompt it paints that. model auto uses LaMa (no prompt) or Krea 2 (a prompt) on this computer when downloaded, else FLUX on fal, which asks the person first. Fails with what to download or set up when nothing can run.

- `prompt`: string; default ""
- `model`: string (auto | lama | krea-2 | fal); default "auto"; auto: on this computer first (LaMa with no prompt, Krea 2 with one), fal last (asks the person, costs money).
- `influence`: number; default 0.4; Krea 2 only: how much what the selection covers shapes the result.

Note: may use fal.

## generative_expand

Grows the canvas by the margins (pixels) and fills the new border, continuing the picture; a prompt describes what to add there. model as generative_fill.

- `left`: integer; default 0
- `top`: integer; default 0
- `right`: integer; default 0
- `bottom`: integer; default 0
- `prompt`: string; default ""
- `model`: string (auto | lama | krea-2 | fal); default "auto"; auto: on this computer first (LaMa with no prompt, Krea 2 with one), fal last (asks the person, costs money).

Note: may use fal.

## generate_image

Generates a picture from a prompt as a new layer the size of the document. model auto uses Krea 2 or FLUX.2 [klein] on this computer when installed, else FLUX1.1 [pro] on fal, which asks the person first.

- `prompt`: string; required
- `model`: string (auto | krea-2 | flux2-klein-4b | fal); default "auto"

Note: may use fal.

## upscale

Enlarges what the document shows 2 or 4 times into a new document. model auto uses Real-ESRGAN on this computer when downloaded, else Real-ESRGAN on fal (asks first).

- `scale`: integer (2 | 4); default 2
- `model`: string (auto | local | fal); default "auto"

Note: may use fal.

## remove_background

Removes the active layer's background on this computer, keeping the subject (a mask on the layer; undoable).

- no parameters

## open_file

Opens a picture (PNG, JPEG, WebP, AVIF, GIF, TIFF, HEIC, camera raw) or a project (.fmv, .psd, .psb, .ora) from an absolute path as a new document.

- `path`: string; required; Absolute path, e.g. /Users/me/Pictures/beach.jpg

## save_project

Saves the document as a formvis project (.fmv: layers, masks, adjustments and text stay editable) at an absolute path, replacing a file there.

- `path`: string; required; Absolute path ending .fmv

Note: replaces or removes.

## export_image

Writes the document as it looks to an absolute path as PNG, JPEG or WebP (by the path's extension), replacing a file there.

- `path`: string; required; Absolute path ending .png, .jpg or .webp
- `quality`: number; default 0.92

Note: replaces or removes.

## switch_document

Makes an open document the one tools act on, by its id from get_document's documents.

- `id`: string; required; A layer id from get_document.

## resize_image

Resamples the whole document to width x height pixels (keep the shape by scaling both by one factor).

- `width`: integer; required
- `height`: integer; required

## resize_canvas

Changes the canvas to width x height without scaling the picture; anchor says where the picture stays.

- `width`: integer; required
- `height`: integer; required
- `anchor`: string (center | top-left | top | top-right | left | right | bottom-left | bottom | bottom-right); default "center"

## crop

Crops the document to a rectangle in pixels.

- `x`: integer; required
- `y`: integer; required
- `width`: integer; required
- `height`: integer; required

Note: replaces or removes.

## flip_canvas

Flips the whole document horizontally or vertically.

- `direction`: string (horizontal | vertical); required

## transform_layer

Moves, scales, rotates or flips a layer (id from get_document): x and y are its new top-left in pixels, scale a percentage, rotation degrees.

- `id`: string; required; A layer id from get_document.
- `x`: number
- `y`: number
- `scale`: number
- `rotation`: number
- `flip`: string (horizontal | vertical)

## rasterize_layer

Turns a text, shape or smart-object layer into pixels, so filters and painting apply to it.

- `id`: string; required; A layer id from get_document.

## duplicate_layer

Duplicates a layer above itself; returns the copy's id.

- `id`: string; required; A layer id from get_document.
- `name`: string

## move_layer

Moves a layer above or below another in the stack.

- `id`: string; required; A layer id from get_document.
- `target`: string; required; A layer id from get_document.
- `where`: string (above | below); default "above"

## merge_layers

Merges layers into one (the ids given, or with only one id that layer into the one below it).

- `ids`: array; required

Note: replaces or removes.

## flatten_image

Flattens every layer into one.

- no parameters

Note: replaces or removes.

## add_text

Adds a text layer; returns its id. x and y are the top-left of the text in pixels; size in pixels; color as #rrggbb.

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

Draws a shape layer: a rectangle, ellipse, triangle, star, line or arrow within x, y, width, height, filled and/or stroked (colors #rrggbb; omit fill or stroke for none).

- `kind`: string (rectangle | ellipse | triangle | star | polygon | line | arrow); required
- `x`: number; required
- `y`: number; required
- `width`: number; required
- `height`: number; required
- `fill`: string
- `stroke`: string
- `stroke_width`: number; default 3

## select_subject

Selects the main subject (a person, animal or object) on this computer.

- no parameters

## select_color_range

Selects pixels near a colour (#rrggbb) in the active layer; fuzziness 0 to 200 widens the range.

- `color`: string; required
- `fuzziness`: number; default 40

## apply_filter

Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur. Unnamed settings keep their defaults.

- `kind`: string (gaussianBlur | motionBlur | addNoise | unsharpMask | lensBlur | smartSharpen | surfaceBlur | radialBlur | tiltShift | irisBlur | fieldBlur); required
- `settings`: object; default {}

## set_adjustment

Changes an adjustment layer's parameters (id from get_document; the same parameters as add_adjustment).

- `id`: string; required; A layer id from get_document.
- `params`: object; required

## color_match

Matches a layer's colours to what is beneath it or around it, as a Curves layer clipped to it; amount 0 to 1.

- `id`: string; required; A layer id from get_document.
- `to`: string (beneath | around); default "beneath"
- `amount`: number; default 1

## add_film_layer

Adds a film look as its own layer: a light leak (color amber|red|magenta|gold from left|right|top|bottom|corner) or a frame (style film|white|line).

- `kind`: string (leak | frame); required
- `color`: string (amber | red | magenta | gold); default "amber"
- `from`: string (left | right | top | bottom | corner); default "left"
- `style`: string (film | white | line); default "film"

## timeline_get

The document's video timeline: frame rate, length in frames and seconds, the playhead, the work area, loops, and per layer (top first) its clip (start and length in frames), fades and keyframes. Null when it has none.

- no parameters

Note: read-only.

## timeline_create

Creates a video timeline with a track per layer, fps frames a second and seconds long. A document has a video timeline or a frame animation, not both.

- `fps`: number; default 30
- `seconds`: number; default 5

## timeline_delete

Deletes the video timeline: its clips, keyframes and transitions (the layers stay).

- no parameters

Note: replaces or removes.

## timeline_set

Changes the frame rate, the length in seconds, the work area (work_in to work_out, frames, work_out excluded) or the loop count (0 forever).

- `fps`: number
- `seconds`: number
- `work_in`: integer
- `work_out`: integer
- `loops`: integer

## timeline_go_to

Moves the playhead to a frame; the window shows that moment. Not an edit.

- `frame`: integer; required

## timeline_clip

Moves or trims a layer's clip: start is the frame where it begins, length how many frames it lasts. Outside its clip the layer does not show.

- `id`: string; required; A layer id from get_document.
- `start`: integer
- `length`: integer

## timeline_split

Splits a layer's clip at a frame (default the playhead): the clip ends there and a copy of the layer carries on with the rest and the same keyframes; returns the copy's id.

- `id`: string; required; A layer id from get_document.
- `frame`: integer

## timeline_keyframe

Keys a layer's property at a frame (default the playhead): x and y in pixels, opacity and fill 0 to 1, style 1 (its layer style on) or 0; interpolation linear or hold (until the next keyframe). delete removes the keyframe at that frame; clear removes all of the property's keyframes.

- `id`: string; required; A layer id from get_document.
- `property`: string (x | y | opacity | fill | style); required
- `frame`: integer
- `value`: number
- `interpolation`: string (linear | hold); default "linear"
- `delete`: boolean; default false
- `clear`: boolean; default false

## timeline_transition

Adds a transition to a layer's clip: fade_in, fade_out or fade (both) over seconds, to transparent or with black or white (the layer turns to that colour at the clip's edge); cross_fade with the clip starting or ending within it (only the upper fades, so the picture never dips); or remove.

- `id`: string; required; A layer id from get_document.
- `kind`: string (fade_in | fade_out | fade | cross_fade | remove); required
- `seconds`: number; default 1
- `color`: string (transparent | black | white); default "transparent"

## timeline_frame_image

One frame of the video timeline as a PNG image, its longer side at most max_size pixels.

- `frame`: integer; required
- `max_size`: integer; default 1024

Note: read-only.

## timeline_render

Renders the video timeline to an absolute path: .mp4 (H.264), .gif, or .zip (numbered PNG frames); every frame, or from to to (frames, to excluded); scale 1, 0.5 or 0.25. Replaces a file there.

- `path`: string; required; Absolute path ending .mp4, .gif or .zip
- `from`: integer
- `to`: integer
- `scale`: number (1 | 0.5 | 0.25); default 1

Note: replaces or removes.

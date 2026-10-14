# formvis commands

Generated from the window's command catalogue (836 commands) by `./formvis agents sync`; do not edit by hand. The live list is `GET /api/commands` or the MCP tools `list_commands` and `describe_command`; run one with `run_command`, several as one undo step with `run_commands`.

## Contents

- Edit: 49
- File: 66
- Filter: 77
- Image: 75
- Layer: 181
- Paint: 1
- Paths: 8
- Select: 28
- Tool options: 225
- Tools: 49
- Type: 4
- View: 31
- Window: 42

## Edit

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `auto-align-layers` | Auto-Align Layers... |  | Aligns the selected layers to the bottom-most one by matching their features. (changes the picture) |
| `auto-blend-layers` | Auto-Blend Layers... |  | Adds layer masks that blend the selected layers into a panorama or a focus stack. (changes the picture) |
| `clear` | Clear Selection Pixels |  | Erases the pixels inside the selection. (changes the picture) |
| `colour.settings` | Color Settings... | Shift+Mod+K | Opens Color Settings: working spaces, colour management policies and conversion options. |
| `content-fill` | Quick Content-Aware Fill | Shift+Backspace | Fills the selection from its surroundings. (changes the picture) |
| `content-fill-workspace` | Content-Aware Fill... |  | Opens the Content-Aware Fill workspace for the selection. (changes the picture) |
| `copy` | Copy | Mod+C | Copies the selection to the clipboard. |
| `copy-merged` | Copy Merged | Shift+Mod+C | Copies the selection from all visible layers. |
| `cut` | Cut | Mod+X | Cuts the selection to the clipboard. (changes the picture) |
| `define-pattern` | Define Pattern... |  | Saves the selection as a pattern. |
| `delete` | Delete | Backspace Delete | Clears the selection, or deletes the selected layers. (changes the picture) |
| `edit-note` | Edit Note... |  | Opens the selected note for editing. |
| `fade` | Fade... | Shift+Mod+F | Opens Fade to soften the last filter or adjustment. (changes the picture) |
| `fill-bg` | Fill with Background | Mod+Backspace Mod+Delete | Fills the selection or layer with the background colour. (changes the picture) |
| `fill-dialog` | Fill... | Shift+F5 | Opens the Fill dialog with its contents and blend options. (changes the picture) |
| `fill-fg` | Fill with Foreground | Alt+Backspace Alt+Delete | Fills the selection or layer with the foreground colour. (changes the picture) |
| `generative-fill` | Generative Fill... |  | Opens Generative Fill for the selection. (changes the picture) |
| `layer-rotate-180` | Rotate 180° |  | Turns the layer 180 degrees. (changes the picture) |
| `layer-rotate-90-ccw` | Rotate 90° Counter Clockwise |  | Turns the layer 90 degrees counter clockwise. (changes the picture) |
| `layer-rotate-90-cw` | Rotate 90° Clockwise |  | Turns the layer 90 degrees clockwise. (changes the picture) |
| `load-brushes` | Load Brushes... |  | Loads brushes from an .abr file. |
| `new-snapshot` | New Snapshot |  | Stores the current state as a snapshot in History. |
| `paste` | Paste | Mod+V | Pastes the clipboard as a new layer. (changes the picture) |
| `paste-in-place` | Paste in Place | Shift+Mod+V | Pastes at the position the pixels were copied from. (changes the picture) |
| `paste-into` | Paste Into | Alt+Shift+Mod+V | Pastes into the selection with a mask. (changes the picture) |
| `paste-outside` | Paste Outside |  | Pastes outside the selection with a mask. (changes the picture) |
| `patterns-export` | Export Patterns... |  | Saves your patterns as one Photoshop .pat file. |
| `patterns-import` | Import Patterns... |  | Adds the patterns from Photoshop .pat files. |
| `perspective-warp` | Perspective Warp |  | Starts Perspective Warp. (changes the picture) |
| `puppet-warp` | Puppet Warp |  | Starts Puppet Warp with pins on the layer. (changes the picture) |
| `purge-all` | All |  | Clears the clipboard and the history of every open document after asking. (changes the picture) |
| `purge-clipboard` | Clipboard |  | Clears formvis's internal clipboard. (changes the picture) |
| `purge-histories` | Histories |  | Clears the undo and redo history of the current document after asking. (changes the picture) |
| `redo` | Redo | Shift+Mod+Z Mod+Y | Steps forward one history step. (changes the picture) |
| `remove-wires` | Remove Wires and Cables |  | Finds wires and cables and removes them. (changes the picture) |
| `stroke-dialog` | Stroke... |  | Opens the Stroke dialog for the selection. (changes the picture) |
| `swatch-add` | Add Foreground Color to Swatches |  | Adds the foreground colour to the Swatches panel. |
| `swatches-reset` | Reset Swatches |  | Restores the default swatches. |
| `toggle-last-state` | Toggle Last State | Alt+Mod+Z | Switches between the current and the previous history state. (changes the picture) |
| `transform` | Transform Layer | Alt+Mod+T Mod+T | Starts Free Transform on the layer or selection. (changes the picture) |
| `transform-again` | Again | Shift+Mod+T | Repeats the last transform. (changes the picture) |
| `transform-again-copy` | Transform Again on a Copy | Alt+Shift+Mod+T | Repeats the last transform on a copy of the layer. (changes the picture) |
| `transform-distort` | Distort |  | Starts a Distort transform. (changes the picture) |
| `transform-perspective` | Perspective |  | Starts a Perspective transform. (changes the picture) |
| `transform-rotate` | Rotate |  | Starts a Rotate transform. (changes the picture) |
| `transform-scale` | Scale |  | Starts a Scale transform. (changes the picture) |
| `transform-skew` | Skew |  | Starts a Skew transform. (changes the picture) |
| `transform-warp` | Warp |  | Starts a Warp transform on the layer. (changes the picture) |
| `undo` | Undo | Mod+Z | Steps back one history step. (changes the picture) |

## File

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `assemble-tiles` | Assemble Tiles... |  | Opens the dialog that assembles tile images into one large picture. (changes the picture) |
| `batch` | Batch... |  | Opens Batch to run an action over many files. (changes the picture) (asks first) |
| `clear-recent` | Clear Recent |  | Empties the Open Recent list. (asks first) |
| `close-all` | Close All |  | Closes every open document. (asks first) |
| `close-others` | Close Others | Alt+Mod+P | Closes every document but the current one. (asks first) |
| `close-tab` | Close Tab | Alt+Mod+W | Closes the current document, asking about unsaved changes. (asks first) |
| `comfyui-run` | Run ComfyUI Workflow... |  | Opens the dialog that runs a ComfyUI workflow and brings the result back. (changes the picture) (asks first) |
| `conditional-mode-change` | Conditional Mode Change... |  | Changes the document to a target mode only when its current mode is one of the ticked source modes. (changes the picture) |
| `contact-sheet` | Contact Sheet II... |  | Opens Contact Sheet II to lay chosen images out as thumbnails on new documents. (changes the picture) |
| `create-video-timeline` | Create Video Timeline |  | Creates a video timeline from the document layers. (changes the picture) |
| `crop-straighten-photos` | Crop and Straighten Photos |  | Finds each photo on a scanned page, straightens it and opens it as its own document. (changes the picture) |
| `download-project` | Download Project File |  | Downloads the project file through the browser. (asks first) |
| `export-artboards` | Export Artboards to Files |  | Exports every artboard to its own file. (asks first) |
| `export-artboards-files` | Artboards to Files... |  | Exports each artboard to its own file in a chosen type and quality; opens the dialog, or runs at once when given any of prefix, format, quality, icc or folder. (asks first) |
| `export-artboards-pdf` | Artboards to PDF... |  | Exports every artboard as one page of a single PDF, in the Layers order, each page at its artboard size from the document resolution; takes name, jpeg, quality and icc. (asks first) |
| `export-as` | Export As... | Alt+Shift+Mod+W | Opens Export As with format, size and quality. (asks first) |
| `export-avif` | Export AVIF |  | Exports the flattened picture as AVIF. (asks first) |
| `export-data-sets` | Data Sets as Files... |  | Applies each data set in turn and exports the flattened document as <doc>_<dataset>.png (or jpg, psd by the format param), all in one zip; the document ends as it started. (asks first) |
| `export-exr` | OpenEXR... |  | Exports an OpenEXR file. (asks first) |
| `export-gif` | Export GIF... |  | Opens the GIF dialog and exports an animated GIF. (asks first) |
| `export-hdr` | Radiance HDR... |  | Exports a Radiance HDR file. (asks first) |
| `export-jpg` | Export JPEG... | Alt+Shift+Mod+S | Opens the JPEG quality dialog, then exports a JPEG. (asks first) |
| `export-layer-comps` | Layer Comps to Files... |  | Exports each layer comp to its own file named prefix_NNNN_compname, the flattened document with that comp applied, then puts the document back exactly as it was; opens the dialog, or runs at once when given any of prefix, format, quality, icc or folder. (asks first) |
| `export-layers` | Layers to Files... |  | Exports each layer to its own file named prefix_NNNN_layername, with its effects and mask applied; opens the dialog, or runs at once when given any of prefix, format, quality, visible_only, trim, icc or folder. (asks first) |
| `export-luts` | Color Lookup Tables... |  | Records the visible adjustment layers as color lookup tables in .cube, .3dl and .csp files at 17, 33 or 65 points per side, delivered as one file or a zip. Layer masks are ignored. (asks first) |
| `export-mp4` | Video (MP4)... |  | Renders the video timeline or animation to an MP4 file. (asks first) |
| `export-ora` | Export OpenRaster... |  | Exports an OpenRaster file that keeps layers. (asks first) |
| `export-paths-ai` | Paths to Illustrator... |  | Writes the document paths to an Illustrator .ai file. (asks first) |
| `export-pdf` | Export PDF |  | Exports the picture as a PDF. (asks first) |
| `export-png` | Export PNG | Shift+Mod+E | Exports the flattened picture as a PNG. (asks first) |
| `export-psb` | Export PSB (Large Document)... |  | Exports a Photoshop large document (PSB). (asks first) |
| `export-psd` | Export PSD... |  | Exports the document as a Photoshop PSD. (asks first) |
| `export-tiff` | Export TIFF |  | Exports the picture as TIFF. (asks first) |
| `export-webp` | Export WebP |  | Exports the flattened picture as WebP. (asks first) |
| `file-info` | File Info... | Alt+Shift+Mod+I | Opens File Info (title, author, description, rating, keywords, copyright), or sets the fields given as title, author, author_title, description, rating, description_writer, keywords, copyright_status, copyright_notice and copyright_url at once as one step; the fields travel in the project and are written as XMP into PNG, JPEG, TIFF, WebP and PSD exports. (changes the picture) |
| `fit-image` | Fit Image... |  | Opens Fit Image to scale within a width and height. (changes the picture) |
| `generate-image` | Generate Image... |  | Opens Generate Image. (changes the picture) |
| `generate-image-assets` | Generate Image Assets |  | Writes a zip of image files for every layer whose name holds an asset name such as hero.png, or a list like 200% big.png, small.jpg60%, 64x? icon.png, each trimmed and scaled to its size. (asks first) |
| `image-processor` | Image Processor... |  | Saves chosen files or the open images as JPEG, PSD and TIFF at a maximum size, optionally after an action and with a copyright notice, each type in its own folder. |
| `import` | Import Images... | Shift+Mod+O | Opens the file picker to place images as layers. (changes the picture) |
| `import-video` | Video Frames to Layers... |  | Opens the dialog that turns video frames into layers. (changes the picture) |
| `load-files-stack` | Load Files into Stack... |  | Opens a dialog to load chosen image files as the layers of one new document, optionally as a smart object stack. (changes the picture) |
| `merge-hdr` | Merge to HDR... |  | Opens Merge to HDR for bracketed exposures. (changes the picture) |
| `new` | New Canvas... | Alt+Mod+N Mod+N | Opens the New Canvas dialog. |
| `open` | Open Project... | Mod+O | Opens the library dialog to open a saved project. |
| `package` | Package... |  | Saves the document and the files of its linked smart objects together in one zip. (changes the picture) |
| `photomerge` | Photomerge... |  | Opens Photomerge to stitch images into a panorama. (changes the picture) |
| `place-3d` | Place 3D Model... |  | Opens a file picker for a glTF or GLB model and places it as a layer. (changes the picture) |
| `place-embedded` | Place Embedded... |  | Places an image file as an embedded smart object. (changes the picture) |
| `place-linked` | Place Linked... |  | Places an image file as a linked smart object. (changes the picture) |
| `print` | Print... | Mod+P | Opens the Print dialog: paper size, orientation, position, scaled print size and a preview, then prints the flattened document through the system print dialog. |
| `print-one-copy` | Print One Copy | Alt+Shift+Mod+P | Prints the flattened document at once with the settings Print last used, through the system print dialog. |
| `render-video` | Render Video... |  | Opens the Render Video dialog for the video timeline. (asks first) |
| `revert` | Revert |  | Throws away changes and reopens the last saved version. (changes the picture) (asks first) |
| `save` | Save | Mod+S | Saves the document to the library, or asks for a name the first time. (asks first) |
| `save-as` | Save As... | Shift+Mod+S | Saves the document under a new name in the library. (asks first) |
| `save-copy` | Save a Copy... | Alt+Mod+S | Saves a copy without changing which file the document belongs to. (asks first) |
| `save-for-web` | Save for Web (Legacy)... |  | Opens Save for Web (Legacy): side-by-side original and optimized previews, a format (JPEG, PNG-24, PNG-8, GIF, WebP) and quality, and an export of the whole image or every slice as a zip. (asks first) |
| `script-delete-empty-layers` | Delete All Empty Layers |  | Deletes every pixel layer with no visible pixels and every empty group, and says how many; keeps the Background and adjustment, fill, type, shape and smart object layers. (changes the picture) |
| `script-events` | Script Events Manager... |  | Opens the Script Events Manager, where a saved action is bound to an event: the app starting, or a document being made, opened, saved, closed, exported or printed. |
| `script-flatten-effects` | Flatten All Layer Effects |  | Draws every layer style into its layer's pixels and clears the style; a type, shape or fill layer that carries one is rasterized. (changes the picture) |
| `script-flatten-masks` | Flatten All Masks |  | Applies every layer mask and vector mask into its layer's pixels and removes it; a type, shape or fill layer that carries one is rasterized. (changes the picture) |
| `send-comfyui` | Send to ComfyUI... |  | Opens the dialog that sends the picture to ComfyUI. (asks first) |
| `send-host` | Send to NodeMode Canvas |  | Sends the picture to the NodeMode canvas that hosts formvis. (asks first) |
| `send-nodemode` | Send to NodeMode... |  | Opens the dialog that sends the picture to NodeMode. (asks first) |
| `stack-statistics` | Statistics... |  | Opens a dialog to load chosen image files as a smart object stack and combine them with a stack mode such as median. (changes the picture) |

## Filter

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `filter-addNoise` | Add Noise... |  | Opens the Noise filter on the active layer. (changes the picture) |
| `filter-average` | Average |  | Fills the selection or layer with its average colour. (changes the picture) |
| `filter-blur` | Blur |  | Opens the Blur filter on the active layer. (changes the picture) |
| `filter-blurMore` | Blur More |  | Opens the Blur More filter on the active layer. (changes the picture) |
| `filter-boxBlur` | Box Blur... |  | Opens the Box Blur filter on the active layer. (changes the picture) |
| `filter-clouds` | Clouds |  | Opens the Clouds filter on the active layer. (changes the picture) |
| `filter-colorHalftone` | Color Halftone... |  | Opens the Color Halftone filter on the active layer. (changes the picture) |
| `filter-crystallize` | Crystallize... |  | Opens the Crystallize filter on the active layer. (changes the picture) |
| `filter-custom` | Custom... |  | Opens the Custom filter on the active layer. (changes the picture) |
| `filter-deInterlace` | De-Interlace... |  | Opens the De-Interlace filter on the active layer. (changes the picture) |
| `filter-despeckle` | Despeckle |  | Opens the Despeckle filter on the active layer. (changes the picture) |
| `filter-develop` | Develop... | Shift+Mod+A | Opens the Develop filter on the active layer. (changes the picture) |
| `filter-differenceClouds` | Difference Clouds |  | Opens the Difference Clouds filter on the active layer. (changes the picture) |
| `filter-diffuse` | Diffuse... |  | Opens the Diffuse filter on the active layer. (changes the picture) |
| `filter-displace` | Displace... |  | Opens the Displace filter on the active layer. (changes the picture) |
| `filter-dustAndScratches` | Dust & Scratches... |  | Opens the Dust & Scratches filter on the active layer. (changes the picture) |
| `filter-emboss` | Emboss... |  | Opens the Emboss filter on the active layer. (changes the picture) |
| `filter-extrude` | Extrude... |  | Opens the Extrude filter on the active layer. (changes the picture) |
| `filter-facet` | Facet |  | Opens the Facet filter on the active layer. (changes the picture) |
| `filter-fibers` | Fibers... |  | Opens the Fibers filter on the active layer. (changes the picture) |
| `filter-fieldBlur` | Field Blur... |  | Opens the Field Blur filter on the active layer. (changes the picture) |
| `filter-filterGallery` | Filter Gallery... |  | Opens the Filter Gallery filter on the active layer. (changes the picture) |
| `filter-findEdges` | Find Edges |  | Opens the Find Edges filter on the active layer. (changes the picture) |
| `filter-flame` | Flame... |  | Opens the Flame filter on the active layer. (changes the picture) |
| `filter-fragment` | Fragment |  | Opens the Fragment filter on the active layer. (changes the picture) |
| `filter-gaussianBlur` | Gaussian Blur... |  | Opens the Gaussian Blur filter on the active layer. (changes the picture) |
| `filter-highPass` | High Pass... |  | Opens the High Pass filter on the active layer. (changes the picture) |
| `filter-hsbHsl` | HSB/HSL... |  | Opens the HSB/HSL filter on the active layer. (changes the picture) |
| `filter-irisBlur` | Iris Blur... |  | Opens the Iris Blur filter on the active layer. (changes the picture) |
| `filter-last` | Last Filter | Mod+F | Repeats the last filter with its settings. (changes the picture) |
| `filter-lensBlur` | Lens Blur... |  | Opens the Lens Blur filter on the active layer. (changes the picture) |
| `filter-lensCorrection` | Lens Correction... |  | Opens the Lens Correction filter on the active layer. (changes the picture) |
| `filter-lensFlare` | Lens Flare... |  | Opens the Lens Flare filter on the active layer. (changes the picture) |
| `filter-lightingEffects` | Lighting Effects... |  | Opens the Lighting Effects filter on the active layer. (changes the picture) |
| `filter-liquify` | Liquify... | Shift+Mod+X | Opens the Liquify workspace. (changes the picture) |
| `filter-maximum` | Maximum... |  | Opens the Maximum filter on the active layer. (changes the picture) |
| `filter-median` | Median... |  | Opens the Median filter on the active layer. (changes the picture) |
| `filter-mezzotint` | Mezzotint... |  | Opens the Mezzotint filter on the active layer. (changes the picture) |
| `filter-minimum` | Minimum... |  | Opens the Minimum filter on the active layer. (changes the picture) |
| `filter-mosaic` | Mosaic... |  | Opens the Mosaic filter on the active layer. (changes the picture) |
| `filter-motionBlur` | Motion Blur... |  | Opens the Motion Blur filter on the active layer. (changes the picture) |
| `filter-neural` | Neural Filters... |  | Opens Neural Filters. (changes the picture) |
| `filter-ntscColors` | NTSC Colors |  | Opens the NTSC Colors filter on the active layer. (changes the picture) |
| `filter-offset` | Offset... |  | Opens the Offset filter on the active layer. (changes the picture) |
| `filter-oilPaint` | Oil Paint... |  | Opens the Oil Paint filter on the active layer. (changes the picture) |
| `filter-pathBlur` | Path Blur... |  | Opens the Path Blur filter on the active layer. (changes the picture) |
| `filter-pictureFrame` | Picture Frame... |  | Opens the Picture Frame filter on the active layer. (changes the picture) |
| `filter-pinch` | Pinch... |  | Opens the Pinch filter on the active layer. (changes the picture) |
| `filter-pointillize` | Pointillize... |  | Opens the Pointillize filter on the active layer. (changes the picture) |
| `filter-polarCoordinates` | Polar Coordinates... |  | Opens the Polar Coordinates filter on the active layer. (changes the picture) |
| `filter-radialBlur` | Radial Blur... |  | Opens the Radial Blur filter on the active layer. (changes the picture) |
| `filter-reduceNoise` | Reduce Noise... |  | Opens the Reduce Noise filter on the active layer. (changes the picture) |
| `filter-ripple` | Ripple... |  | Opens the Ripple filter on the active layer. (changes the picture) |
| `filter-shakeReduction` | Shake Reduction... |  | Opens the Shake Reduction filter on the active layer. (changes the picture) |
| `filter-shapeBlur` | Shape Blur... |  | Opens the Shape Blur filter on the active layer. (changes the picture) |
| `filter-sharpen` | Sharpen |  | Opens the Sharpen filter on the active layer. (changes the picture) |
| `filter-sharpenEdges` | Sharpen Edges |  | Opens the Sharpen Edges filter on the active layer. (changes the picture) |
| `filter-sharpenMore` | Sharpen More |  | Opens the Sharpen More filter on the active layer. (changes the picture) |
| `filter-shear` | Shear... |  | Opens the Shear filter on the active layer. (changes the picture) |
| `filter-smartBlur` | Smart Blur... |  | Opens the Smart Blur filter on the active layer. (changes the picture) |
| `filter-smartSharpen` | Smart Sharpen... |  | Opens the Smart Sharpen filter on the active layer. (changes the picture) |
| `filter-solarize` | Solarize |  | Opens the Solarize filter on the active layer. (changes the picture) |
| `filter-spherize` | Spherize... |  | Opens the Spherize filter on the active layer. (changes the picture) |
| `filter-spinBlur` | Spin Blur... |  | Opens the Spin Blur filter on the active layer. (changes the picture) |
| `filter-surfaceBlur` | Surface Blur... |  | Opens the Surface Blur filter on the active layer. (changes the picture) |
| `filter-tiles` | Tiles... |  | Opens the Tiles filter on the active layer. (changes the picture) |
| `filter-tiltShift` | Tilt-Shift... |  | Opens the Tilt-Shift filter on the active layer. (changes the picture) |
| `filter-traceContour` | Trace Contour... |  | Opens the Trace Contour filter on the active layer. (changes the picture) |
| `filter-tree` | Tree... |  | Opens the Tree filter on the active layer. (changes the picture) |
| `filter-twirl` | Twirl... |  | Opens the Twirl filter on the active layer. (changes the picture) |
| `filter-unsharpMask` | Unsharp Mask... |  | Opens the Unsharp Mask filter on the active layer. (changes the picture) |
| `filter-vanishing-point` | Vanishing Point... |  | Opens Vanishing Point. (changes the picture) |
| `filter-wave` | Wave... |  | Opens the Wave filter on the active layer. (changes the picture) |
| `filter-wide-angle` | Adaptive Wide Angle... |  | Opens Adaptive Wide Angle. (changes the picture) |
| `filter-wind` | Wind... |  | Opens the Wind filter on the active layer. (changes the picture) |
| `filter-zigZag` | ZigZag... |  | Opens the ZigZag filter on the active layer. (changes the picture) |
| `filter.apply` | Apply Filter |  | Applies a filter with exact settings to the active layer, inside the selection if there is one. (changes the picture) |

### filter.apply parameters

- `kind`: string; required; Which filter
- `settings`: object; All settings as one object; the settings of the kind may also be given as plain parameters

## Image

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `adj-blackWhite` | Black & White... |  | Opens Black & White and applies it to the pixels of the active layer. (changes the picture) |
| `adj-brightnessContrast` | Brightness/Contrast... |  | Opens Brightness/Contrast and applies it to the pixels of the active layer. (changes the picture) |
| `adj-channelMixer` | Channel Mixer... |  | Opens Channel Mixer and applies it to the pixels of the active layer. (changes the picture) |
| `adj-clarity` | Clarity... |  | Opens Clarity and applies it to the pixels of the active layer. (changes the picture) |
| `adj-colorBalance` | Color Balance... |  | Opens Color Balance and applies it to the pixels of the active layer. (changes the picture) |
| `adj-colorLookup` | Color Lookup... |  | Opens Color Lookup and applies it to the pixels of the active layer. (changes the picture) |
| `adj-curves` | Curves... | Mod+M | Opens Curves and applies it to the pixels of the active layer. (changes the picture) |
| `adj-dehaze` | Dehaze... |  | Opens Dehaze and applies it to the pixels of the active layer. (changes the picture) |
| `adj-develop` | Develop... |  | Opens Develop and applies it to the pixels of the active layer. (changes the picture) |
| `adj-exposure` | Exposure... |  | Opens Exposure and applies it to the pixels of the active layer. (changes the picture) |
| `adj-glow` | Glow... |  | Opens Glow and applies it to the pixels of the active layer. (changes the picture) |
| `adj-gradientMap` | Gradient Map... |  | Opens Gradient Map and applies it to the pixels of the active layer. (changes the picture) |
| `adj-grain` | Grain... |  | Opens Grain and applies it to the pixels of the active layer. (changes the picture) |
| `adj-halation` | Halation... |  | Opens Halation and applies it to the pixels of the active layer. (changes the picture) |
| `adj-hdrToning` | HDR Toning... |  | Opens HDR Toning and applies it to the pixels of the active layer. (changes the picture) |
| `adj-hsv` | Hue/Saturation... | Mod+U | Opens Hue/Saturation and applies it to the pixels of the active layer. (changes the picture) |
| `adj-invert` | Invert... |  | Opens Invert and applies it to the pixels of the active layer. (changes the picture) |
| `adj-levels` | Levels... | Mod+L | Opens Levels and applies it to the pixels of the active layer. (changes the picture) |
| `adj-light` | Light... |  | Opens Light and applies it to the pixels of the active layer. (changes the picture) |
| `adj-photoFilter` | Photo Filter... |  | Opens Photo Filter and applies it to the pixels of the active layer. (changes the picture) |
| `adj-posterize` | Posterize... |  | Opens Posterize and applies it to the pixels of the active layer. (changes the picture) |
| `adj-selectiveColor` | Selective Color... |  | Opens Selective Color and applies it to the pixels of the active layer. (changes the picture) |
| `adj-shadowsHighlights` | Shadows/Highlights... |  | Opens Shadows/Highlights and applies it to the pixels of the active layer. (changes the picture) |
| `adj-splitToning` | Split Toning... |  | Opens Split Toning and applies it to the pixels of the active layer. (changes the picture) |
| `adj-texture` | Texture... |  | Opens Texture and applies it to the pixels of the active layer. (changes the picture) |
| `adj-threshold` | Threshold... |  | Opens Threshold and applies it to the pixels of the active layer. (changes the picture) |
| `adj-vibrance` | Vibrance... |  | Opens Vibrance and applies it to the pixels of the active layer. (changes the picture) |
| `adjust.apply` | Apply Adjustment |  | Applies an adjustment with exact values, to the pixels of the active layer or as an adjustment layer. (changes the picture) |
| `apply-image` | Apply Image... |  | Blends a channel of a layer or the merged image into the active layer. (changes the picture) |
| `apply-redactions` | Apply Redactions |  | Burns the redaction boxes into the pixels. (changes the picture) |
| `assign-profile` | Assign Profile... |  | Opens Assign Profile. (changes the picture) |
| `auto-color` | Auto Color | Shift+Mod+B | Neutralises colour casts automatically. (changes the picture) |
| `auto-contrast` | Auto Contrast | Alt+Shift+Mod+L | Sets contrast automatically without shifting colour. (changes the picture) |
| `auto-tone` | Auto Tone | Shift+Mod+L | Sets levels on each channel automatically. (changes the picture) |
| `calculations` | Calculations... |  | Blends two single channels (each a layer or the merged picture, optionally inverted) by a blending mode, opacity and optional mask into a new alpha channel, a new grey document or the selection; with no parameters it only shows a notice until the dialog arrives. (changes the picture) |
| `canvas-size` | Canvas Size... | Alt+Mod+C | Opens Canvas Size. (changes the picture) |
| `color-match` | Color Match... |  | Opens Color Match. (changes the picture) |
| `color-table` | Color Table... |  | Opens the Color Table of an Indexed Color document: edit, load or save its palette. (changes the picture) |
| `content-aware-scale` | Content-Aware Scale... |  | Opens Content-Aware Scale. (changes the picture) |
| `convert-profile` | Convert to Profile... |  | Opens Convert to Profile. (changes the picture) |
| `data-set-apply` | Apply Data Set |  | Applies a data set to the document: sets bound layers visible or hidden, replaces bound type text keeping its style, and swaps bound pixel layers, as one undo step. |
| `data-sets-import` | Data Sets... |  | Reads data sets from CSV or tab-separated text whose first row names the variables; each later row is one data set. With no text it opens a file chooser for .csv and .txt. |
| `depth-16` | 16 Bits/Channel |  | Sets 16 bits per channel. (changes the picture) |
| `depth-32` | 32 Bits/Channel |  | Sets 32 bits per channel. (changes the picture) |
| `depth-8` | 8 Bits/Channel |  | Sets 8 bits per channel. (changes the picture) |
| `desaturate` | Desaturate | Shift+Mod+U | Removes colour and keeps the mode. (changes the picture) |
| `duplicate-image` | Duplicate... |  | Opens the dialog that duplicates the document into a new one. |
| `equalize` | Equalize |  | Spreads brightness values evenly. (changes the picture) |
| `flatten` | Flatten Image |  | Flattens every layer into one. (changes the picture) |
| `flip-canvas-h` | Flip Canvas Horizontal |  | Flips the whole image left to right. (changes the picture) |
| `flip-canvas-v` | Flip Canvas Vertical |  | Flips the whole image top to bottom. (changes the picture) |
| `generative-expand` | Generative Expand... |  | Opens Generative Expand. (changes the picture) |
| `image-crop` | Crop |  | Crops the document to the selection. (changes the picture) |
| `image-size` | Image Size... | Alt+Mod+I | Opens Image Size. (changes the picture) |
| `invert` | Invert | Mod+I | Inverts the colours of the active layer. (changes the picture) |
| `mode-bitmap` | Bitmap... |  | Opens the Bitmap conversion. (changes the picture) |
| `mode-cmyk` | CMYK Color... |  | Opens the CMYK conversion. (changes the picture) |
| `mode-duotone` | Duotone... |  | Opens Duotone options: one to four inks overprinted on a grayscale document. (changes the picture) |
| `mode-grayscale` | Grayscale |  | Converts the document to grayscale. (changes the picture) |
| `mode-indexed` | Indexed Color... |  | Opens the Indexed Color conversion. (changes the picture) |
| `mode-lab` | Lab Color |  | Converts the document to Lab colour. (changes the picture) |
| `mode-multichannel` | Multichannel |  | Converts the document to Multichannel: grey spot channels with ink colours, shown overprinted on white. (changes the picture) |
| `mode-rgb` | RGB Color |  | Converts the document to RGB. (changes the picture) |
| `remove-bg` | Remove Background |  | Removes the background of the active layer with the neural model. (changes the picture) |
| `remove-bg-lite` | Remove Background (Lightweight) |  | Removes the background with the lightweight model. (changes the picture) |
| `replace-color` | Replace Color... |  | Opens Replace Color. (changes the picture) |
| `reveal-all` | Reveal All |  | Grows the canvas so every layer is fully inside it. (changes the picture) |
| `rotate-180` | 180° |  | Rotates the whole image 180 degrees. (changes the picture) |
| `rotate-90-ccw` | 90° Counter Clockwise |  | Rotates the whole image 90 degrees counter clockwise. (changes the picture) |
| `rotate-90-cw` | 90° Clockwise |  | Rotates the whole image 90 degrees clockwise. (changes the picture) |
| `rotate-arbitrary` | Arbitrary... |  | Opens the dialog that rotates the whole image by any angle. (changes the picture) |
| `trim` | Trim... |  | Opens Trim to cut away transparent or same-colour edges. (changes the picture) |
| `upscale-2x` | Upscale 2x... |  | Opens the dialog that enlarges the picture two times. |
| `upscale-4x` | Upscale 4x... |  | Opens the dialog that enlarges the picture four times. |
| `variables-define` | Define Variable... |  | Binds a named variable to a layer: its visibility, a type layer's text, or a pixel layer's image (placed fit, fill, as is or conformed to the layer bounds). |

### adjust.apply parameters

- `kind`: string; required; Which adjustment
- `as`: string (pixels | layer); pixels bakes it in; layer adds an editable adjustment layer; pixels by default
- `data`: object; The adjustment data as its project file keeps it, merged over the defaults; for curves and gradientMap

## Layer

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `add-filter-mask` | Add Smart Filter Mask |  | Adds a mask to the smart filters. (changes the picture) |
| `add-mask` | Add Layer Mask |  | Adds a layer mask that reveals everything. (changes the picture) |
| `add-mask-hide` | Add Mask Hiding All |  | Adds a layer mask that hides everything. (changes the picture) |
| `align-bottom` | Align Bottom Edges |  | Aligns the selected layers to the bottom edge. (changes the picture) |
| `align-hcenter` | Align Horizontal Centers |  | Aligns the selected layers on a vertical centre line. (changes the picture) |
| `align-left` | Align Left Edges |  | Aligns the selected layers to the left edge. (changes the picture) |
| `align-right` | Align Right Edges |  | Aligns the selected layers to the right edge. (changes the picture) |
| `align-top` | Align Top Edges |  | Aligns the selected layers to the top edge. (changes the picture) |
| `align-vcenter` | Align Vertical Centers |  | Aligns the selected layers on a horizontal centre line. (changes the picture) |
| `apply-mask` | Apply Layer Mask |  | Bakes the layer mask into the pixels. (changes the picture) |
| `artboard-from-group` | Artboard from Group... |  | Opens the dialog that turns a folder into an artboard. (changes the picture) |
| `artboard-from-layers` | Artboard from Layers |  | Makes an artboard from the selected layers. (changes the picture) |
| `artboard-options` | Artboard Options... |  | Opens the options of the selected artboard. (changes the picture) |
| `backward` | Send Backward | Mod+[ | Moves the layer down one place. (changes the picture) |
| `blend-next` | Next Blend Mode | Shift+= | Moves to the next blend mode. (changes the picture) |
| `blend-prev` | Previous Blend Mode | Shift+- | Moves to the previous blend mode. (changes the picture) |
| `bring-front` | Bring to Front | Shift+Mod+] | Moves the layer to the top. (changes the picture) |
| `clear-layer-style` | Clear Layer Style |  | Removes all effects from the layer. (changes the picture) |
| `clip` | Create Clipping Mask | Alt+Mod+G | Clips the layer to the one below. (changes the picture) |
| `convert-smart` | Convert to Smart Object |  | Converts the layer to a smart object. (changes the picture) |
| `copy-layer-style` | Copy Layer Style |  | Copies the layer style. |
| `create-layers` | Create Layers |  | Turns the layer effects into layers. (changes the picture) |
| `delete-filter-mask` | Delete Smart Filter Mask |  | Deletes the smart filter mask. (changes the picture) |
| `delete-hidden` | Delete Hidden Layers |  | Deletes every hidden layer. (changes the picture) (asks first) |
| `delete-layer` | Delete Layer |  | Deletes the selected layers. (changes the picture) (asks first) |
| `delete-mask` | Delete Layer Mask |  | Removes the layer mask. (changes the picture) |
| `deselect-layers` | Deselect Layers |  | Deselects all layers. |
| `distribute-bottom` | Distribute Bottom Edges |  | Spaces layers evenly by their bottom edges. (changes the picture) |
| `distribute-hcenter` | Distribute Horizontal Centers |  | Spaces layers evenly by their horizontal centres. (changes the picture) |
| `distribute-hspace` | Distribute Horizontal Spacing |  | Makes the gaps between layers equal across. (changes the picture) |
| `distribute-left` | Distribute Left Edges |  | Spaces layers evenly by their left edges. (changes the picture) |
| `distribute-right` | Distribute Right Edges |  | Spaces layers evenly by their right edges. (changes the picture) |
| `distribute-top` | Distribute Top Edges |  | Spaces layers evenly by their top edges. (changes the picture) |
| `distribute-vcenter` | Distribute Vertical Centers |  | Spaces layers evenly by their vertical centres. (changes the picture) |
| `distribute-vspace` | Distribute Vertical Spacing |  | Makes the gaps between layers equal down. (changes the picture) |
| `duplicate` | Layer via Copy | Mod+J | Copies the selected layers above themselves. (changes the picture) |
| `duplicate-dialog` | Duplicate Layer... |  | Opens Duplicate Layer to name the copy or send it to another document. (changes the picture) |
| `edit-adjustment` | Edit Adjustment... |  | Opens the settings of the active adjustment layer. (changes the picture) |
| `edit-contents` | Edit Contents |  | Opens the smart object source for editing. (changes the picture) |
| `embed-linked` | Embed Linked |  | Embeds the linked file in the document. (changes the picture) |
| `film-frame` | Frame... |  | Opens Frame to add a film or white border layer. (changes the picture) |
| `film-leak` | Light Leak... |  | Opens Light Leak to add a leak layer. (changes the picture) |
| `find-layers` | Find Layers... | Alt+Shift+Mod+F | Opens the Layers panel filter. |
| `flip-layer-h` | Flip Layer Horizontal |  | Flips the layer left to right. (changes the picture) |
| `flip-layer-v` | Flip Layer Vertical |  | Flips the layer top to bottom. (changes the picture) |
| `forward` | Bring Forward | Mod+] | Moves the layer up one place. (changes the picture) |
| `frame-from-layers` | Frame from Layers |  | Makes an image frame from the selected layers. (changes the picture) |
| `global-light` | Global Light... |  | Opens the Global Light dialog. (changes the picture) |
| `group` | Group Layers | Mod+G | Puts the selected layers into a new folder. (changes the picture) |
| `group-from-layers` | Group from Layers... |  | Opens the New Group from Layers dialog. (changes the picture) |
| `hide-all-effects` | Hide All Effects |  | Shows or hides all layer effects. (changes the picture) |
| `hide-layers` | Hide Layers |  | Hides or shows the selected layers. (changes the picture) |
| `isolate-layers` | Isolate Layers |  | Shows only the selected layers. |
| `layer-comp-apply` | Apply Layer Comp |  | Applies a layer comp by id or name. (changes the picture) |
| `layer-comp-delete` | Delete Layer Comp |  | Deletes the active layer comp. (changes the picture) |
| `layer-comp-new` | New Layer Comp |  | Records a layer comp of visibility, position and appearance. (changes the picture) |
| `layer-comp-next` | Next Layer Comp |  | Applies the next layer comp, wrapping. (changes the picture) |
| `layer-comp-previous` | Previous Layer Comp |  | Applies the previous layer comp, wrapping. (changes the picture) |
| `layer-comp-update` | Update Layer Comp |  | Re-records the active layer comp from the layers now. (changes the picture) |
| `layer-content-options` | Layer Content Options... |  | Opens the content options of a fill layer. (changes the picture) |
| `layer-from-background` | Layer from Background... |  | Opens the dialog that turns the Background into a normal layer. (changes the picture) |
| `layer-style` | Layer Style... |  | Opens Layer Style. (changes the picture) |
| `layer-via-cut` | Layer via Cut | Shift+Mod+J | Moves the selected pixels to a new layer. (changes the picture) |
| `layer.set` | Set Layer |  | Changes a layer name, visibility, opacity or blend mode; the active layer when id is omitted. (changes the picture) |
| `link-layers` | Link Layers |  | Links the selected layers so they move together. (changes the picture) |
| `link-mask` | Unlink Layer Mask |  | Links or unlinks the mask from its layer. (changes the picture) |
| `lock-layers` | Lock Layers... | Mod+/ | Opens the dialog to lock pixels, position or transparency. (changes the picture) |
| `mask-all-objects` | Mask All Objects |  | Finds every object and gives each its own masked layer. (changes the picture) |
| `mask-from-transparency` | From Transparency |  | Turns the layer transparency into a mask. (changes the picture) |
| `mask-hide-all` | Hide All |  | Adds a mask that hides the whole layer. (changes the picture) |
| `mask-hide-selection` | Hide Selection |  | Adds a mask hiding the selection. (changes the picture) |
| `mask-reveal-all` | Reveal All |  | Adds a mask that reveals the whole layer. (changes the picture) |
| `mask-reveal-selection` | Reveal Selection |  | Adds a mask showing only the selection. (changes the picture) |
| `matting-black` | Remove Black Matte |  | Removes black fringe from a cut-out. (changes the picture) |
| `matting-decontaminate` | Color Decontaminate... |  | Opens Color Decontaminate to clean edge colour. (changes the picture) |
| `matting-defringe` | Defringe... |  | Opens Defringe to pull in edge pixels. (changes the picture) |
| `matting-white` | Remove White Matte |  | Removes white fringe from a cut-out. (changes the picture) |
| `merge` | Merge Down | Mod+E | Merges the layer into the one below. (changes the picture) |
| `merge-visible` | Merge Visible |  | Merges every visible layer into one. (changes the picture) |
| `move-out` | Move Out of Folder | Shift+Mod+G | Moves the layer out of its folder. (changes the picture) |
| `new-adj-blackWhite` | New Black & White Layer... |  | Adds a Black & White Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-brightnessContrast` | New Brightness/Contrast Layer... |  | Adds a Brightness/Contrast Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-channelMixer` | New Channel Mixer Layer... |  | Adds a Channel Mixer Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-clarity` | New Clarity Layer... |  | Adds a Clarity Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-colorBalance` | New Color Balance Layer... |  | Adds a Color Balance Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-colorLookup` | New Color Lookup Layer... |  | Adds a Color Lookup Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-curves` | New Curves Layer... |  | Adds a Curves Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-dehaze` | New Dehaze Layer... |  | Adds a Dehaze Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-develop` | New Develop Layer... |  | Adds a Develop Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-exposure` | New Exposure Layer... |  | Adds a Exposure Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-glow` | New Glow Layer... |  | Adds a Glow Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-gradientMap` | New Gradient Map Layer... |  | Adds a Gradient Map Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-grain` | New Grain Layer... |  | Adds a Grain Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-halation` | New Halation Layer... |  | Adds a Halation Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-hdrToning` | New HDR Toning Layer... |  | Adds a HDR Toning Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-hsv` | New Hue/Saturation Layer... |  | Adds a Hue/Saturation Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-invert` | New Invert Layer... |  | Adds a Invert Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-levels` | New Levels Layer... |  | Adds a Levels Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-light` | New Light Layer... |  | Adds a Light Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-photoFilter` | New Photo Filter Layer... |  | Adds a Photo Filter Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-posterize` | New Posterize Layer... |  | Adds a Posterize Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-selectiveColor` | New Selective Color Layer... |  | Adds a Selective Color Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-shadowsHighlights` | New Shadows/Highlights Layer... |  | Adds a Shadows/Highlights Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-splitToning` | New Split Toning Layer... |  | Adds a Split Toning Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-texture` | New Texture Layer... |  | Adds a Texture Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-threshold` | New Threshold Layer... |  | Adds a Threshold Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-adj-vibrance` | New Vibrance Layer... |  | Adds a Vibrance Layer adjustment layer; its dialog opens for the values. (changes the picture) |
| `new-artboard` | New Artboard |  | Adds an artboard. (changes the picture) |
| `new-artboard-dialog` | Artboard... |  | Opens the New Artboard dialog. (changes the picture) |
| `new-fill-gradient` | Gradient... |  | Adds a gradient fill layer. (changes the picture) |
| `new-fill-pattern` | Pattern... |  | Adds a pattern fill layer. (changes the picture) |
| `new-fill-solid` | Solid Color... |  | Adds a solid colour fill layer. (changes the picture) |
| `new-folder` | New Folder |  | Adds a layer folder. (changes the picture) |
| `new-folder-dialog` | Group... |  | Opens the New Group dialog. (changes the picture) |
| `new-layer` | New Layer |  | Adds an empty layer above the active one. (changes the picture) |
| `new-layer-dialog` | Layer... | Shift+Mod+N | Opens the New Layer dialog with name, colour and mode. (changes the picture) |
| `paste-layer-style` | Paste Layer Style |  | Pastes the copied layer style. (changes the picture) |
| `rasterize` | Rasterize Layer |  | Rasterizes the active layer. (changes the picture) |
| `rasterize-all` | Rasterize All Layers |  | Rasterizes every vector, text and smart layer. (changes the picture) |
| `rasterize-fill` | Rasterize Fill Content |  | Turns a fill layer into pixels. (changes the picture) |
| `rasterize-shape` | Rasterize Shape |  | Turns a shape layer into pixels. (changes the picture) |
| `rasterize-smart` | Rasterize Smart Object |  | Turns a smart object into pixels. (changes the picture) |
| `rasterize-type` | Rasterize Type |  | Turns a text layer into pixels. (changes the picture) |
| `rasterize-vmask` | Vector Mask |  | Turns the vector mask into a pixel mask. (changes the picture) |
| `relink` | Relink to File... |  | Relinks a smart object to another file. (changes the picture) |
| `rename` | Rename Layer |  | Starts renaming the active layer in the Layers panel. |
| `replace-contents` | Replace Contents... |  | Replaces the smart object source with a file. (changes the picture) |
| `reverse-layers` | Reverse |  | Reverses the order of the selected layers. (changes the picture) |
| `scale-effects` | Scale Effects... |  | Opens the dialog that scales layer effects. (changes the picture) |
| `select-all-layers` | All Layers | Alt+Mod+A | Selects every layer. |
| `select-linked` | Select Linked Layers |  | Selects the layers linked to the active one. |
| `send-back` | Send to Back | Shift+Mod+[ | Moves the layer to the bottom. (changes the picture) |
| `shape-color` | Shape Color from Foreground |  | Sets the shape fill from the foreground colour. (changes the picture) |
| `shape-corners` | Corner Radii... |  | Opens the corner radii of a rectangle shape. (changes the picture) |
| `shape-style` | Shape Fill and Stroke... |  | Opens the shape fill and stroke dialog. (changes the picture) |
| `shapes-exclude` | Exclude Overlapping Shapes |  | Removes where shapes overlap and keeps the rest. (changes the picture) |
| `shapes-intersect` | Intersect Shape Areas |  | Keeps only where shapes overlap. (changes the picture) |
| `shapes-merge` | Merge Shape Components |  | Merges shape components into one path. (changes the picture) |
| `shapes-subtract` | Subtract Front Shape |  | Cuts the front shape out of the one behind. (changes the picture) |
| `shapes-unite` | Unite Shapes |  | Unites the selected shape layers into one shape. (changes the picture) |
| `smart-convert-to-layers` | Convert to Layers |  | Replaces the active smart object with a pixel layer holding its source at its current placement, without the smart filters. (changes the picture) |
| `smart-convert-to-linked` | Convert to Linked... |  | Saves an embedded smart object as a PNG file and links the layer to it. (changes the picture) |
| `smart-export-contents` | Export Contents... |  | Saves the active smart object source as a PNG file named after the layer. (changes the picture) |
| `smart-filters` | Smart Filters... |  | Opens the smart filter stack of the active layer. (changes the picture) |
| `smart-filters-clear` | Clear Smart Filters |  | Removes every smart filter of the active smart object. (changes the picture) |
| `smart-filters-disable` | Disable Smart Filters |  | Turns every filter of the active smart object off, or back on when all are off. (changes the picture) |
| `smart-new-via-copy` | New Smart Object via Copy |  | Duplicates the active smart object as a new, independent smart object above it. (changes the picture) |
| `stack-mode-entropy` | Entropy |  | Set the stack mode of a stacked smart object to Entropy (changes the picture) |
| `stack-mode-kurtosis` | Kurtosis |  | Set the stack mode of a stacked smart object to Kurtosis (changes the picture) |
| `stack-mode-majority` | Majority |  | Set the stack mode of a stacked smart object to Majority, the most common value (changes the picture) |
| `stack-mode-maximum` | Maximum |  | Set the stack mode of a stacked smart object to Maximum (changes the picture) |
| `stack-mode-mean` | Mean |  | Set the stack mode of a stacked smart object to Mean (changes the picture) |
| `stack-mode-median` | Median |  | Set the stack mode of a stacked smart object to Median (changes the picture) |
| `stack-mode-minimum` | Minimum |  | Set the stack mode of a stacked smart object to Minimum (changes the picture) |
| `stack-mode-none` | None |  | Set the stack mode of a stacked smart object to None, showing the top layer (changes the picture) |
| `stack-mode-range` | Range |  | Set the stack mode of a stacked smart object to Range (changes the picture) |
| `stack-mode-skewness` | Skewness |  | Set the stack mode of a stacked smart object to Skewness (changes the picture) |
| `stack-mode-stddev` | Standard Deviation |  | Set the stack mode of a stacked smart object to Standard Deviation (changes the picture) |
| `stack-mode-summation` | Summation |  | Set the stack mode of a stacked smart object to Summation (changes the picture) |
| `stack-mode-variance` | Variance |  | Set the stack mode of a stacked smart object to Variance (changes the picture) |
| `style-bevel` | Bevel & Emboss... |  | Opens Layer Style at Bevel and Emboss. (changes the picture) |
| `style-blending` | Blending Options... |  | Opens Layer Style at Blending Options. (changes the picture) |
| `style-color-overlay` | Color Overlay... |  | Opens Layer Style at Color Overlay. (changes the picture) |
| `style-drop-shadow` | Drop Shadow... |  | Opens Layer Style at Drop Shadow. (changes the picture) |
| `style-gradient-overlay` | Gradient Overlay... |  | Opens Layer Style at Gradient Overlay. (changes the picture) |
| `style-inner-glow` | Inner Glow... |  | Opens Layer Style at Inner Glow. (changes the picture) |
| `style-inner-shadow` | Inner Shadow... |  | Opens Layer Style at Inner Shadow. (changes the picture) |
| `style-outer-glow` | Outer Glow... |  | Opens Layer Style at Outer Glow. (changes the picture) |
| `style-pattern-overlay` | Pattern Overlay... |  | Opens Layer Style at Pattern Overlay. (changes the picture) |
| `style-satin` | Satin... |  | Opens Layer Style at Satin. (changes the picture) |
| `style-stroke` | Stroke... |  | Opens Layer Style at Stroke. (changes the picture) |
| `toggle-filter-mask` | Toggle Filter Mask |  | Disables or enables the smart filter mask. (changes the picture) |
| `toggle-mask` | Toggle Mask |  | Disables or enables the layer mask. (changes the picture) |
| `ungroup` | Ungroup Layers |  | Dissolves the selected folder and keeps its layers. (changes the picture) |
| `update-linked` | Update Modified Content |  | Updates linked smart objects whose files changed. (changes the picture) |
| `vmask-current-path` | Current Path |  | Makes a vector mask from the current path. (changes the picture) |
| `vmask-delete` | Delete |  | Deletes the vector mask. (changes the picture) |
| `vmask-enable` | Disable Vector Mask |  | Disables or enables the vector mask. (changes the picture) |
| `vmask-hide-all` | Hide All |  | Adds a vector mask hiding everything. (changes the picture) |
| `vmask-link` | Unlink Vector Mask |  | Links or unlinks the vector mask. (changes the picture) |
| `vmask-reveal-all` | Reveal All |  | Adds a vector mask showing everything. (changes the picture) |

### layer.set parameters

- `id`: string; Layer id from the document; the active layer when omitted
- `name`: string; New name
- `visible`: boolean; Show or hide
- `opacity`: number 0 to 1; Opacity from 0 to 1
- `blend`: string; Blend mode
- `active`: boolean; Make it the active layer

## Paint

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `paint.stroke` | Paint Stroke |  | Draws one stroke through the points with the active painting tool, its size, colour and dynamics, on the active layer; one history step. (changes the picture) |

### paint.stroke parameters

- `points`: array; required; Points in document pixels: [{x, y, pressure?}] with pressure 0 to 1, or [x, y, pressure?] triples
- `tool`: string (brush | pencil | eraser | mixer | smear | dodge | burn | sponge); Painting tool to use; the active tool when omitted

## Paths

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `delete-path` | Delete Path |  | Deletes the current path. (changes the picture) |
| `fill-path` | Fill Path |  | Fills the path with the foreground colour. (changes the picture) |
| `fill-path-dialog` | Fill Path... |  | Opens Fill Path. (changes the picture) |
| `new-path` | New Path |  | Starts a new empty path. (changes the picture) |
| `new-shape-path` | New Shape Layer from Path |  | Makes a shape layer from the current path. (changes the picture) |
| `path-selection` | Make Selection from Path | Mod+Enter | Makes a selection from the current path. (changes the picture) |
| `stroke-path` | Stroke Path |  | Strokes the path with the current brush. (changes the picture) |
| `stroke-path-dialog` | Stroke Path... |  | Opens Stroke Path. (changes the picture) |

## Select

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `border` | Border... |  | Opens Border to select a band along the edge. (changes the picture) |
| `color-range` | Color Range... |  | Opens Color Range. (changes the picture) |
| `contract` | Contract by 1 px... |  | Contracts the selection by one pixel. (changes the picture) |
| `convert-to-shape` | Convert to Shape |  | Turns the selection into a shape layer. (changes the picture) |
| `deselect` | Deselect | Mod+D | Clears the selection. (changes the picture) |
| `expand` | Expand by 1 px... |  | Expands the selection by one pixel. (changes the picture) |
| `feather` | Feather... | Shift+F6 | Opens Feather to soften the selection edge. (changes the picture) |
| `focus-area` | Focus Area... |  | Opens Focus Area to select what is in focus. (changes the picture) |
| `grow` | Grow |  | Grows the selection over similar neighbouring colours. (changes the picture) |
| `inverse` | Inverse | Shift+Mod+I | Inverts the selection. (changes the picture) |
| `layer-pixels` | Layer's Pixels |  | Selects the layer's non-transparent pixels. (changes the picture) |
| `load-selection` | Load Selection... |  | Opens the dialog that loads a saved selection. (changes the picture) |
| `mask-black` | Mask's Black Areas |  | Selects the mask's black areas. (changes the picture) |
| `quick-mask` | Edit in Quick Mask Mode | Q | Turns Quick Mask on or off; painting in it makes the selection. (changes the picture) |
| `reselect` | Reselect |  | Brings back the last selection. (changes the picture) |
| `save-selection` | Save Selection... |  | Opens the dialog that saves the selection to a channel. (changes the picture) |
| `save-selection-channel` | Save Selection as Channel |  | Saves the selection as a new channel. (changes the picture) |
| `select-all` | All | Mod+A | Selects the whole canvas. (changes the picture) |
| `select-and-mask` | Select and Mask... | Alt+Mod+R | Opens Select and Mask to refine edges. (changes the picture) |
| `select-object` | Object in Selection |  | Selects the object inside the current selection. (changes the picture) |
| `select-sky` | Sky |  | Selects the sky. (changes the picture) |
| `select-subject` | Subject |  | Selects the main subject. (changes the picture) |
| `select.ellipse` | Elliptical Selection |  | Selects the ellipse inside a box in document pixels. (changes the picture) |
| `select.lasso` | Lasso Selection |  | Selects the polygon through the points. (changes the picture) |
| `select.rect` | Rectangular Selection |  | Selects a rectangle in document pixels. (changes the picture) |
| `similar` | Similar |  | Selects all pixels in the picture similar to the selection. (changes the picture) |
| `smooth` | Smooth... |  | Opens Smooth to round the selection corners. (changes the picture) |
| `transform-selection` | Transform Selection |  | Starts transforming the selection outline. (changes the picture) |

### select.ellipse parameters

- `x`: number -30000 to 60000; required; Left edge in document pixels
- `y`: number -30000 to 60000; required; Top edge in document pixels
- `width`: number 1 to 60000; required; Width in pixels
- `height`: number 1 to 60000; required; Height in pixels
- `mode`: string (replace | add | subtract | intersect); How the new selection combines with the current one; replace by default

### select.lasso parameters

- `points`: array; required; Corners of the polygon, at least 3: [{x, y}] or [x, y] pairs
- `mode`: string (replace | add | subtract | intersect); How the new selection combines with the current one; replace by default
- `antialias`: boolean; Smooth the edge; true by default

### select.rect parameters

- `x`: number -30000 to 60000; required; Left edge in document pixels
- `y`: number -30000 to 60000; required; Top edge in document pixels
- `width`: number 1 to 60000; required; Width in pixels
- `height`: number 1 to 60000; required; Height in pixels
- `mode`: string (replace | add | subtract | intersect); How the new selection combines with the current one; replace by default

## Tool options

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `tool.options.artHistory.hardness` | Art History Brush: Hardness |  | Sets Hardness for the Art History Brush tool. |
| `tool.options.artHistory.opacity` | Art History Brush: Opacity |  | Sets Opacity for the Art History Brush tool. |
| `tool.options.artHistory.size` | Art History Brush: Size |  | Sets Size for the Art History Brush tool. |
| `tool.options.artHistory.style` | Art History Brush: Style |  | Sets Style for the Art History Brush tool. |
| `tool.options.artHistory.tolerance` | Art History Brush: Tolerance |  | Sets Tolerance for the Art History Brush tool. |
| `tool.options.backgroundEraser.hardness` | Background Eraser: Hardness |  | Sets Hardness for the Background Eraser tool. |
| `tool.options.backgroundEraser.limits` | Background Eraser: Limits |  | Sets Limits for the Background Eraser tool. |
| `tool.options.backgroundEraser.protectForegroundColor` | Background Eraser: Protect Foreground Color |  | Sets Protect Foreground Color for the Background Eraser tool. |
| `tool.options.backgroundEraser.sampling` | Background Eraser: Sampling |  | Sets Sampling for the Background Eraser tool. |
| `tool.options.backgroundEraser.size` | Background Eraser: Size |  | Sets Size for the Background Eraser tool. |
| `tool.options.backgroundEraser.tolerance` | Background Eraser: Tolerance |  | Sets Tolerance for the Background Eraser tool. |
| `tool.options.brush.airbrush` | Brush: Airbrush |  | Sets Airbrush for the Brush tool. |
| `tool.options.brush.angle` | Brush: Angle |  | Sets Angle for the Brush tool. |
| `tool.options.brush.flow` | Brush: Flow |  | Sets Flow for the Brush tool. |
| `tool.options.brush.hardness` | Brush: Hardness |  | Sets Hardness for the Brush tool. |
| `tool.options.brush.minFlow` | Brush: Min flow |  | Sets Min flow for the Brush tool. |
| `tool.options.brush.minSize` | Brush: Min size |  | Sets Min size for the Brush tool. |
| `tool.options.brush.mode` | Brush: Mode |  | Sets Mode for the Brush tool. |
| `tool.options.brush.opacity` | Brush: Opacity |  | Sets Opacity for the Brush tool. |
| `tool.options.brush.preset` | Brush: Preset |  | Sets Preset for the Brush tool. |
| `tool.options.brush.pressureFlow` | Brush: Pressure: flow |  | Sets Pressure: flow for the Brush tool. |
| `tool.options.brush.pressureOpacity` | Brush: Pressure: opacity |  | Sets Pressure: opacity for the Brush tool. |
| `tool.options.brush.pressureSize` | Brush: Pressure: size |  | Sets Pressure: size for the Brush tool. |
| `tool.options.brush.size` | Brush: Size |  | Sets Size for the Brush tool. |
| `tool.options.brush.smoothing` | Brush: Smoothing |  | Sets Smoothing for the Brush tool. |
| `tool.options.bucket.antiAlias` | Paint Bucket: Anti-alias |  | Sets Anti-alias for the Paint Bucket tool. |
| `tool.options.bucket.contiguous` | Paint Bucket: Contiguous |  | Sets Contiguous for the Paint Bucket tool. |
| `tool.options.bucket.mode` | Paint Bucket: Mode |  | Sets Mode for the Paint Bucket tool. |
| `tool.options.bucket.opacity` | Paint Bucket: Opacity |  | Sets Opacity for the Paint Bucket tool. |
| `tool.options.bucket.pattern` | Paint Bucket: Pattern |  | Sets Pattern for the Paint Bucket tool. |
| `tool.options.bucket.sampleAllLayers` | Paint Bucket: Sample all layers |  | Sets Sample all layers for the Paint Bucket tool. |
| `tool.options.bucket.source` | Paint Bucket: Source |  | Sets Source for the Paint Bucket tool. |
| `tool.options.bucket.tolerance` | Paint Bucket: Tolerance |  | Sets Tolerance for the Paint Bucket tool. |
| `tool.options.burn.exposure` | Burn: Exposure |  | Sets Exposure for the Burn tool. |
| `tool.options.burn.hardness` | Burn: Hardness |  | Sets Hardness for the Burn tool. |
| `tool.options.burn.protectTones` | Burn: Protect Tones |  | Sets Protect Tones for the Burn tool. |
| `tool.options.burn.range` | Burn: Range |  | Sets Range for the Burn tool. |
| `tool.options.burn.size` | Burn: Size |  | Sets Size for the Burn tool. |
| `tool.options.burn.strength` | Burn: Strength |  | Sets Strength for the Burn tool. |
| `tool.options.cloneStamp.aligned` | Clone Stamp: Aligned |  | Sets Aligned for the Clone Stamp tool. |
| `tool.options.cloneStamp.autoHide` | Clone Stamp: Auto Hide |  | Sets Auto Hide for the Clone Stamp tool. |
| `tool.options.cloneStamp.clipped` | Clone Stamp: Clipped |  | Sets Clipped for the Clone Stamp tool. |
| `tool.options.cloneStamp.flipHorizontal` | Clone Stamp: Flip horizontal |  | Sets Flip horizontal for the Clone Stamp tool. |
| `tool.options.cloneStamp.flipVertical` | Clone Stamp: Flip vertical |  | Sets Flip vertical for the Clone Stamp tool. |
| `tool.options.cloneStamp.flow` | Clone Stamp: Flow |  | Sets Flow for the Clone Stamp tool. |
| `tool.options.cloneStamp.hardness` | Clone Stamp: Hardness |  | Sets Hardness for the Clone Stamp tool. |
| `tool.options.cloneStamp.mode` | Clone Stamp: Mode |  | Sets Mode for the Clone Stamp tool. |
| `tool.options.cloneStamp.opacity` | Clone Stamp: Opacity |  | Sets Opacity for the Clone Stamp tool. |
| `tool.options.cloneStamp.overlayOpacity` | Clone Stamp: Overlay opacity |  | Sets Overlay opacity for the Clone Stamp tool. |
| `tool.options.cloneStamp.sample` | Clone Stamp: Sample |  | Sets Sample for the Clone Stamp tool. |
| `tool.options.cloneStamp.showOverlay` | Clone Stamp: Show Overlay |  | Sets Show Overlay for the Clone Stamp tool. |
| `tool.options.cloneStamp.size` | Clone Stamp: Size |  | Sets Size for the Clone Stamp tool. |
| `tool.options.cloneStamp.source` | Clone Stamp: Source |  | Sets Source for the Clone Stamp tool. |
| `tool.options.cloneStamp.sourceAngle` | Clone Stamp: Source angle |  | Sets Source angle for the Clone Stamp tool. |
| `tool.options.cloneStamp.sourceScale` | Clone Stamp: Source scale |  | Sets Source scale for the Clone Stamp tool. |
| `tool.options.contentAwareMove.mode` | Content-Aware Move: Mode |  | Sets Mode for the Content-Aware Move tool. |
| `tool.options.crop.contentAware` | Crop: Content-Aware |  | Sets Content-Aware for the Crop tool. |
| `tool.options.crop.deleteCroppedPixels` | Crop: Delete Cropped Pixels |  | Sets Delete Cropped Pixels for the Crop tool. |
| `tool.options.crop.h` | Crop: H |  | Sets H for the Crop tool. |
| `tool.options.crop.overlay` | Crop: Overlay |  | Sets Overlay for the Crop tool. |
| `tool.options.crop.perspective` | Crop: Perspective |  | Sets Perspective for the Crop tool. |
| `tool.options.crop.preset` | Crop: Preset |  | Sets Preset for the Crop tool. |
| `tool.options.crop.ratio` | Crop: Ratio |  | Sets Ratio for the Crop tool. |
| `tool.options.crop.resolution` | Crop: Resolution |  | Sets Resolution for the Crop tool. |
| `tool.options.crop.straighten` | Crop: Straighten |  | Sets Straighten for the Crop tool. |
| `tool.options.crop.unit` | Crop: Unit |  | Sets Unit for the Crop tool. |
| `tool.options.crop.w` | Crop: W |  | Sets W for the Crop tool. |
| `tool.options.dodge.exposure` | Dodge: Exposure |  | Sets Exposure for the Dodge tool. |
| `tool.options.dodge.hardness` | Dodge: Hardness |  | Sets Hardness for the Dodge tool. |
| `tool.options.dodge.protectTones` | Dodge: Protect Tones |  | Sets Protect Tones for the Dodge tool. |
| `tool.options.dodge.range` | Dodge: Range |  | Sets Range for the Dodge tool. |
| `tool.options.dodge.size` | Dodge: Size |  | Sets Size for the Dodge tool. |
| `tool.options.dodge.strength` | Dodge: Strength |  | Sets Strength for the Dodge tool. |
| `tool.options.eraser.eraseToHistory` | Eraser: Erase to History |  | Sets Erase to History for the Eraser tool. |
| `tool.options.eraser.flow` | Eraser: Flow |  | Sets Flow for the Eraser tool. |
| `tool.options.eraser.hardness` | Eraser: Hardness |  | Sets Hardness for the Eraser tool. |
| `tool.options.eraser.mode` | Eraser: Mode |  | Sets Mode for the Eraser tool. |
| `tool.options.eraser.opacity` | Eraser: Opacity |  | Sets Opacity for the Eraser tool. |
| `tool.options.eraser.size` | Eraser: Size |  | Sets Size for the Eraser tool. |
| `tool.options.eyedropper.sample` | Eyedropper: Sample |  | Sets Sample for the Eyedropper tool. |
| `tool.options.eyedropper.sampleRing` | Eyedropper: Sample Ring |  | Sets Sample Ring for the Eyedropper tool. |
| `tool.options.eyedropper.sampleSize` | Eyedropper: Sample Size |  | Sets Sample Size for the Eyedropper tool. |
| `tool.options.frame.shape` | Frame: Shape |  | Sets Shape for the Frame tool. |
| `tool.options.freeformPen.curveFit` | Freeform Pen: Curve fit |  | Sets Curve fit for the Freeform Pen tool. |
| `tool.options.gradient.colors` | Gradient: Colors |  | Sets Colors for the Gradient tool. |
| `tool.options.gradient.dither` | Gradient: Dither |  | Sets Dither for the Gradient tool. |
| `tool.options.gradient.method` | Gradient: Method |  | Sets Method for the Gradient tool. |
| `tool.options.gradient.mode` | Gradient: Mode |  | Sets Mode for the Gradient tool. |
| `tool.options.gradient.opacity` | Gradient: Opacity |  | Sets Opacity for the Gradient tool. |
| `tool.options.gradient.reverse` | Gradient: Reverse |  | Sets Reverse for the Gradient tool. |
| `tool.options.gradient.shape` | Gradient: Shape |  | Sets Shape for the Gradient tool. |
| `tool.options.gradient.transparency` | Gradient: Transparency |  | Sets Transparency for the Gradient tool. |
| `tool.options.healingBrush.aligned` | Healing Brush: Aligned |  | Sets Aligned for the Healing Brush tool. |
| `tool.options.healingBrush.diffusion` | Healing Brush: Diffusion |  | Sets Diffusion for the Healing Brush tool. |
| `tool.options.healingBrush.hardness` | Healing Brush: Hardness |  | Sets Hardness for the Healing Brush tool. |
| `tool.options.healingBrush.mode` | Healing Brush: Mode |  | Sets Mode for the Healing Brush tool. |
| `tool.options.healingBrush.opacity` | Healing Brush: Opacity |  | Sets Opacity for the Healing Brush tool. |
| `tool.options.healingBrush.pattern` | Healing Brush: Pattern |  | Sets Pattern for the Healing Brush tool. |
| `tool.options.healingBrush.sample` | Healing Brush: Sample |  | Sets Sample for the Healing Brush tool. |
| `tool.options.healingBrush.size` | Healing Brush: Size |  | Sets Size for the Healing Brush tool. |
| `tool.options.healingBrush.source` | Healing Brush: Source |  | Sets Source for the Healing Brush tool. |
| `tool.options.historyBrush.hardness` | History Brush: Hardness |  | Sets Hardness for the History Brush tool. |
| `tool.options.historyBrush.opacity` | History Brush: Opacity |  | Sets Opacity for the History Brush tool. |
| `tool.options.historyBrush.size` | History Brush: Size |  | Sets Size for the History Brush tool. |
| `tool.options.lasso.antiAlias` | Lasso: Anti-alias |  | Sets Anti-alias for the Lasso tool. |
| `tool.options.lasso.feather` | Lasso: Feather |  | Sets Feather for the Lasso tool. |
| `tool.options.lasso.kind` | Lasso: Kind |  | Sets Kind for the Lasso tool. |
| `tool.options.lasso.mode` | Lasso: Mode |  | Sets Mode for the Lasso tool. |
| `tool.options.magicEraser.contiguous` | Magic Eraser: Contiguous |  | Sets Contiguous for the Magic Eraser tool. |
| `tool.options.magicEraser.sampleAllLayers` | Magic Eraser: Sample All Layers |  | Sets Sample All Layers for the Magic Eraser tool. |
| `tool.options.magicEraser.tolerance` | Magic Eraser: Tolerance |  | Sets Tolerance for the Magic Eraser tool. |
| `tool.options.markup.color` | Markup: Color |  | Sets Color for the Markup tool. |
| `tool.options.markup.mark` | Markup: Mark |  | Sets Mark for the Markup tool. |
| `tool.options.markup.width` | Markup: Width |  | Sets Width for the Markup tool. |
| `tool.options.marquee.antiAlias` | Marquee: Anti-alias |  | Sets Anti-alias for the Marquee tool. |
| `tool.options.marquee.feather` | Marquee: Feather |  | Sets Feather for the Marquee tool. |
| `tool.options.marquee.height` | Marquee: Height |  | Sets Height for the Marquee tool. |
| `tool.options.marquee.height2` | Marquee: Height |  | Sets Height for the Marquee tool. |
| `tool.options.marquee.mode` | Marquee: Mode |  | Sets Mode for the Marquee tool. |
| `tool.options.marquee.shape` | Marquee: Shape |  | Sets Shape for the Marquee tool. |
| `tool.options.marquee.style` | Marquee: Style |  | Sets Style for the Marquee tool. |
| `tool.options.marquee.width` | Marquee: Width |  | Sets Width for the Marquee tool. |
| `tool.options.marquee.width2` | Marquee: Width |  | Sets Width for the Marquee tool. |
| `tool.options.mixer.cleanTheBrushAfterEachStroke` | Mixer Brush: Clean the brush after each stroke |  | Sets Clean the brush after each stroke for the Mixer Brush tool. |
| `tool.options.mixer.hardness` | Mixer Brush: Hardness |  | Sets Hardness for the Mixer Brush tool. |
| `tool.options.mixer.load` | Mixer Brush: Load |  | Sets Load for the Mixer Brush tool. |
| `tool.options.mixer.loadTheBrushAfterEachStroke` | Mixer Brush: Load the brush after each stroke |  | Sets Load the brush after each stroke for the Mixer Brush tool. |
| `tool.options.mixer.mix` | Mixer Brush: Mix |  | Sets Mix for the Mixer Brush tool. |
| `tool.options.mixer.opacity` | Mixer Brush: Opacity |  | Sets Opacity for the Mixer Brush tool. |
| `tool.options.mixer.sampleAllLayers` | Mixer Brush: Sample All Layers |  | Sets Sample All Layers for the Mixer Brush tool. |
| `tool.options.mixer.size` | Mixer Brush: Size |  | Sets Size for the Mixer Brush tool. |
| `tool.options.mixer.wet` | Mixer Brush: Wet |  | Sets Wet for the Mixer Brush tool. |
| `tool.options.move.angle` | Move: Angle |  | Sets Angle for the Move tool. |
| `tool.options.move.autoSelect` | Move: Auto-Select |  | Sets Auto-Select for the Move tool. |
| `tool.options.move.autoSelectTarget` | Move: Auto-Select Target |  | Sets Auto-Select Target for the Move tool. |
| `tool.options.move.h` | Move: H |  | Sets H for the Move tool. |
| `tool.options.move.keepProportions` | Move: Keep proportions |  | Sets Keep proportions for the Move tool. |
| `tool.options.move.perspectiveWarp` | Move: Perspective Warp |  | Sets Perspective Warp for the Move tool. |
| `tool.options.move.sampling` | Move: Sampling |  | Sets Sampling for the Move tool. |
| `tool.options.move.scale` | Move: Scale |  | Sets Scale for the Move tool. |
| `tool.options.move.showTransformControls` | Move: Show Transform Controls |  | Sets Show Transform Controls for the Move tool. |
| `tool.options.move.snap` | Move: Snap |  | Sets Snap for the Move tool. |
| `tool.options.move.w` | Move: W |  | Sets W for the Move tool. |
| `tool.options.move.x` | Move: X |  | Sets X for the Move tool. |
| `tool.options.move.y` | Move: Y |  | Sets Y for the Move tool. |
| `tool.options.objectSelect.highlightOnHover` | Object Selection: Highlight on Hover |  | Sets Highlight on Hover for the Object Selection tool. |
| `tool.options.objectSelect.mode` | Object Selection: Mode |  | Sets Mode for the Object Selection tool. |
| `tool.options.objectSelect.sampleAllLayers` | Object Selection: Sample All Layers |  | Sets Sample All Layers for the Object Selection tool. |
| `tool.options.patch.color` | Patch: Color |  | Sets Color for the Patch tool. |
| `tool.options.patch.diffusion` | Patch: Diffusion |  | Sets Diffusion for the Patch tool. |
| `tool.options.patch.from` | Patch: From |  | Sets From for the Patch tool. |
| `tool.options.patch.patch` | Patch: Patch |  | Sets Patch for the Patch tool. |
| `tool.options.patch.pattern` | Patch: Pattern |  | Sets Pattern for the Patch tool. |
| `tool.options.patch.sampleAllLayers` | Patch: Sample All Layers |  | Sets Sample All Layers for the Patch tool. |
| `tool.options.patch.structure` | Patch: Structure |  | Sets Structure for the Patch tool. |
| `tool.options.patch.transparent` | Patch: Transparent |  | Sets Transparent for the Patch tool. |
| `tool.options.pathSelect.operation` | Path Selection: Operation |  | Sets Operation for the Path Selection tool. |
| `tool.options.patternStamp.hardness` | Pattern Stamp: Hardness |  | Sets Hardness for the Pattern Stamp tool. |
| `tool.options.patternStamp.opacity` | Pattern Stamp: Opacity |  | Sets Opacity for the Pattern Stamp tool. |
| `tool.options.patternStamp.pattern` | Pattern Stamp: Pattern |  | Sets Pattern for the Pattern Stamp tool. |
| `tool.options.patternStamp.size` | Pattern Stamp: Size |  | Sets Size for the Pattern Stamp tool. |
| `tool.options.pen.autoAddDelete` | Pen: Auto Add/Delete |  | Sets Auto Add/Delete for the Pen tool. |
| `tool.options.pen.mode` | Pen: Mode |  | Sets Mode for the Pen tool. |
| `tool.options.pencil.autoErase` | Pencil: Auto Erase |  | Sets Auto Erase for the Pencil tool. |
| `tool.options.pencil.opacity` | Pencil: Opacity |  | Sets Opacity for the Pencil tool. |
| `tool.options.pencil.size` | Pencil: Size |  | Sets Size for the Pencil tool. |
| `tool.options.quickSelect.sampleAllLayers` | Quick Selection: Sample all layers |  | Sets Sample all layers for the Quick Selection tool. |
| `tool.options.quickSelect.selection` | Quick Selection: Selection |  | Sets Selection for the Quick Selection tool. |
| `tool.options.quickSelect.size` | Quick Selection: Size |  | Sets Size for the Quick Selection tool. |
| `tool.options.redEye.darkenAmount` | Red Eye: Darken Amount |  | Sets Darken Amount for the Red Eye tool. |
| `tool.options.redEye.pupilSize` | Red Eye: Pupil Size |  | Sets Pupil Size for the Red Eye tool. |
| `tool.options.remove.hardness` | Remove: Hardness |  | Sets Hardness for the Remove tool. |
| `tool.options.remove.opacity` | Remove: Opacity |  | Sets Opacity for the Remove tool. |
| `tool.options.remove.size` | Remove: Size |  | Sets Size for the Remove tool. |
| `tool.options.rotateView.rotationAngle` | Rotate View: Rotation Angle |  | Sets Rotation Angle for the Rotate View tool. |
| `tool.options.selectionBrush.hardness` | Selection Brush: Hardness |  | Sets Hardness for the Selection Brush tool. |
| `tool.options.selectionBrush.size` | Selection Brush: Size |  | Sets Size for the Selection Brush tool. |
| `tool.options.shape.align` | Shape: Align |  | Sets Align for the Shape tool. |
| `tool.options.shape.cornerRadius` | Shape: Corner radius |  | Sets Corner radius for the Shape tool. |
| `tool.options.shape.customShape` | Shape: Custom shape |  | Sets Custom shape for the Shape tool. |
| `tool.options.shape.fill` | Shape: Fill |  | Sets Fill for the Shape tool. |
| `tool.options.shape.headLength` | Shape: Head length |  | Sets Head length for the Shape tool. |
| `tool.options.shape.headWidth` | Shape: Head width |  | Sets Head width for the Shape tool. |
| `tool.options.shape.indent` | Shape: Indent |  | Sets Indent for the Shape tool. |
| `tool.options.shape.mode` | Shape: Mode |  | Sets Mode for the Shape tool. |
| `tool.options.shape.points` | Shape: Points |  | Sets Points for the Shape tool. |
| `tool.options.shape.shape` | Shape: Shape |  | Sets Shape for the Shape tool. |
| `tool.options.shape.sides` | Shape: Sides |  | Sets Sides for the Shape tool. |
| `tool.options.shape.stroke` | Shape: Stroke |  | Sets Stroke for the Shape tool. |
| `tool.options.shape.strokeType` | Shape: Stroke Type |  | Sets Stroke Type for the Shape tool. |
| `tool.options.shape.weight` | Shape: Weight |  | Sets Weight for the Shape tool. |
| `tool.options.shape.width` | Shape: Width |  | Sets Width for the Shape tool. |
| `tool.options.smear.hardness` | Smear: Hardness |  | Sets Hardness for the Smear tool. |
| `tool.options.smear.mode` | Smear: Mode |  | Sets Mode for the Smear tool. |
| `tool.options.smear.sampleAllLayers` | Smear: Sample All Layers |  | Sets Sample All Layers for the Smear tool. |
| `tool.options.smear.size` | Smear: Size |  | Sets Size for the Smear tool. |
| `tool.options.smear.strength` | Smear: Strength |  | Sets Strength for the Smear tool. |
| `tool.options.smear.tool` | Smear: Tool |  | Sets Tool for the Smear tool. |
| `tool.options.sponge.flow` | Sponge: Flow |  | Sets Flow for the Sponge tool. |
| `tool.options.sponge.hardness` | Sponge: Hardness |  | Sets Hardness for the Sponge tool. |
| `tool.options.sponge.mode` | Sponge: Mode |  | Sets Mode for the Sponge tool. |
| `tool.options.sponge.size` | Sponge: Size |  | Sets Size for the Sponge tool. |
| `tool.options.sponge.strength` | Sponge: Strength |  | Sets Strength for the Sponge tool. |
| `tool.options.sponge.vibrance` | Sponge: Vibrance |  | Sets Vibrance for the Sponge tool. |
| `tool.options.spotHealing.hardness` | Spot Healing: Hardness |  | Sets Hardness for the Spot Healing tool. |
| `tool.options.spotHealing.mode` | Spot Healing: Mode |  | Sets Mode for the Spot Healing tool. |
| `tool.options.spotHealing.opacity` | Spot Healing: Opacity |  | Sets Opacity for the Spot Healing tool. |
| `tool.options.spotHealing.sampleAllLayers` | Spot Healing: Sample All Layers |  | Sets Sample All Layers for the Spot Healing tool. |
| `tool.options.spotHealing.size` | Spot Healing: Size |  | Sets Size for the Spot Healing tool. |
| `tool.options.spotHealing.type` | Spot Healing: Type |  | Sets Type for the Spot Healing tool. |
| `tool.options.type.align` | Type: Align |  | Sets Align for the Type tool. |
| `tool.options.type.antiAliasing` | Type: Anti-aliasing |  | Sets Anti-aliasing for the Type tool. |
| `tool.options.type.color` | Type: Color |  | Sets Color for the Type tool. |
| `tool.options.type.font` | Type: Font |  | Sets Font for the Type tool. |
| `tool.options.type.fontStyle` | Type: Font Style |  | Sets Font Style for the Type tool. |
| `tool.options.type.kerning` | Type: Kerning |  | Sets Kerning for the Type tool. |
| `tool.options.type.leading` | Type: Leading |  | Sets Leading for the Type tool. |
| `tool.options.type.size` | Type: Size |  | Sets Size for the Type tool. |
| `tool.options.type.tracking` | Type: Tracking |  | Sets Tracking for the Type tool. |
| `tool.options.wand.antiAlias` | Magic Wand: Anti-alias |  | Sets Anti-alias for the Magic Wand tool. |
| `tool.options.wand.contiguous` | Magic Wand: Contiguous |  | Sets Contiguous for the Magic Wand tool. |
| `tool.options.wand.mode` | Magic Wand: Mode |  | Sets Mode for the Magic Wand tool. |
| `tool.options.wand.sampleAllLayers` | Magic Wand: Sample all layers |  | Sets Sample all layers for the Magic Wand tool. |
| `tool.options.wand.sampleSize` | Magic Wand: Sample Size |  | Sets Sample Size for the Magic Wand tool. |
| `tool.options.wand.tolerance` | Magic Wand: Tolerance |  | Sets Tolerance for the Magic Wand tool. |

## Tools

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `tool.select.artHistory` | Art History Brush Tool |  | Makes the Art History Brush tool the active tool (key Y). Paint stylised strokes in the colours of the source snapshot (History panel) · [ ] size |
| `tool.select.backgroundEraser` | Background Eraser Tool |  | Makes the Background Eraser tool the active tool (key E). Drag with the centre over the colour to erase · Tolerance widens it · Protect Foreground keeps the foreground colour |
| `tool.select.brush` | Brush Tool |  | Makes the Brush tool the active tool (key B). Drag to paint · Shift-click draws a line from the last point · [ ] size · Shift+[ ] hardness · 1-0 opacity · E eraser · B brush · Space pans |
| `tool.select.bucket` | Paint Bucket Tool |  | Makes the Paint Bucket tool the active tool (key G). Click to fill the area of similar color with the foreground color · Tolerance sets how similar · Stays inside the selection |
| `tool.select.burn` | Burn Tool |  | Makes the Burn tool the active tool (key O). Paint to darken, most in the chosen tonal range · [ ] size |
| `tool.select.cloneStamp` | Clone Stamp Tool |  | Makes the Clone Stamp tool the active tool (key S). Alt-click sets the source, then paint to copy from it · Aligned keeps the offset between strokes · Sample All Layers copies what you see · [ ] size |
| `tool.select.colorSampler` | Color Sampler Tool |  | Makes the Color Sampler tool the active tool (key I). Click to place a sampler (up to ten) · Drag one to move it · Alt-click one to remove it · Its colour shows in Window > Info |
| `tool.select.contentAwareMove` | Content-Aware Move Tool |  | Makes the Content-Aware Move tool the active tool (key J). Draw around what to move, then drag it: the hole it leaves is filled from around it |
| `tool.select.convertPoint` | Convert Point Tool |  | Makes the Convert Point tool the active tool (key P). Click a smooth point to make it a corner · Drag from a point to pull out smooth handles · Drag a handle to move it alone |
| `tool.select.count` | Count Tool |  | Makes the Count tool the active tool (key I). Click to count · Alt-click a mark to remove it · Clear in the bar |
| `tool.select.crop` | Crop Tool |  | Makes the Crop tool the active tool (key C). Drag a frame · Drag inside to move it · Handles resize · Alt keeps the centre · Edges snap to the canvas and layer edges · Enter crops · Escape cancels |
| `tool.select.curvaturePen` | Curvature Pen Tool |  | Makes the Curvature Pen tool the active tool (key P). Click to place points; the curve runs smoothly through them · Alt-click for a corner · click the first point to close · Enter ends |
| `tool.select.directSelect` | Direct Selection Tool |  | Makes the Direct Selection tool the active tool (key A). Click a point to select it, Shift to add, or drag a box · Drag points to move them, handles to reshape · Alt-drag a point to pull out handles, a handle to break it · Arrows nudge |
| `tool.select.dodge` | Dodge Tool |  | Makes the Dodge tool the active tool (key O). Paint to lighten, most in the chosen tonal range · [ ] size |
| `tool.select.eraser` | Eraser Tool |  | Makes the Eraser tool the active tool (key E). Drag to erase · Shift-click erases a line from the last point · [ ] size · Shift+[ ] hardness |
| `tool.select.eyedropper` | Eyedropper Tool |  | Makes the Eyedropper tool the active tool (key I). Click or drag to sample the foreground colour from the visible image · Alt-click samples the background colour |
| `tool.select.frame` | Frame Tool |  | Makes the Frame tool the active tool (key K). Drag to draw a frame · Shift for a square or circle · Import an image with the frame selected to fill it |
| `tool.select.freeformPen` | Freeform Pen Tool |  | Makes the Freeform Pen tool the active tool (key P). Drag to draw a path freehand · end near the start to close it · Curve Fit sets how closely it follows |
| `tool.select.gradient` | Gradient Tool |  | Makes the Gradient tool the active tool (key G). Drag to draw a gradient · Drag either end to adjust it · Shift snaps to 45 degrees · Enter applies · Escape cancels · Switching tools applies |
| `tool.select.hand` | Hand Tool |  | Makes the Hand tool the active tool (key H). Drag to pan · Scroll pans · Cmd/Ctrl + scroll zooms · Hold Space to pan with any tool |
| `tool.select.healingBrush` | Healing Brush Tool |  | Makes the Healing Brush tool the active tool (key J). Alt-click to set the source, then paint; on release the copied texture blends into its surroundings · Aligned keeps the offset between strokes · Shift+J cycles the healing tools · [ ] size |
| `tool.select.historyBrush` | History Brush Tool |  | Makes the History Brush tool the active tool (key Y). Paint to bring back the layer as it was in the source snapshot (History panel) · [ ] size |
| `tool.select.lasso` | Lasso Tool |  | Makes the Lasso tool the active tool (key L). Drag around an area · Shift adds · Alt subtracts · Shift+L switches to polygonal |
| `tool.select.magicEraser` | Magic Eraser Tool |  | Makes the Magic Eraser tool the active tool (key E). Click an area to erase it and the colours like it · Tolerance widens the match · Contiguous keeps to the connected area |
| `tool.select.markup` | Markup Tool |  | Makes the Markup tool the active tool (key I). Drag from the tail of the arrow to its tip |
| `tool.select.marquee` | Marquee Tool |  | Makes the Marquee tool the active tool (key M). Drag a rectangle · Shift adds · Alt subtracts · Shift after starting constrains · Alt after starting grows from the centre · Drag inside to move the outline · Shift+M switches shape · Cmd or Ctrl+D deselects |
| `tool.select.mixer` | Mixer Brush Tool |  | Makes the Mixer Brush tool the active tool (key B). Drag to paint with wet paint that picks up and mixes the colours under it · [ ] size · Alt-click loads the reservoir from the canvas |
| `tool.select.move` | Move Tool |  | Makes the Move tool the active tool (key V). Drag to move · Drag inside a selection to move its pixels, Alt to duplicate them · Handles resize · Outside a corner rotates · Shift constrains · Alt resizes from the center · Cmd or Ctrl picks the layer under the pointer · Arrows nudge · 1-0 set layer opacity |
| `tool.select.note` | Note Tool |  | Makes the Note tool the active tool (key I). Click to pin a note · Click a note to edit it · Drag it to move it · Alt-click it to delete it |
| `tool.select.objectSelect` | Object Selection Tool |  | Makes the Object Selection tool the active tool (key W). Click an object, or drag a box round it · Shift adds · Alt subtracts · Rest the pointer to see the object it finds · The first use on an image takes a few seconds |
| `tool.select.patch` | Patch Tool |  | Makes the Patch tool the active tool (key J). Draw around the area to fix, then drag the selection onto the area to copy from · Shift+J cycles the healing tools |
| `tool.select.pathSelect` | Path Selection Tool |  | Makes the Path Selection tool the active tool (key A). Click a path to select it whole · drag to move it · Alt-drag to copy · Delete removes it · arrows nudge |
| `tool.select.patternStamp` | Pattern Stamp Tool |  | Makes the Pattern Stamp tool the active tool (key S). Drag to paint the pattern · Choose it in the options bar · [ ] size · Shift+[ ] hardness |
| `tool.select.pen` | Pen Tool |  | Makes the Pen tool the active tool (key P). Click for corner points, drag for curves · Click the first point to close · Enter ends an open path, Backspace removes the last point · Between paths, click the path to add a point or a point to delete it · Ctrl+Enter makes a selection |
| `tool.select.pencil` | Pencil Tool |  | Makes the Pencil tool the active tool (key B). Drag to draw hard-edged, pixel-exact lines · Shift-click draws a line from the last point · [ ] size |
| `tool.select.quickSelect` | Quick Selection Tool |  | Makes the Quick Selection tool the active tool (key W). Drag over an area to select it; the selection grows to similar color and stops at edges · Alt-drag subtracts · [ ] size |
| `tool.select.redEye` | Red Eye Tool |  | Makes the Red Eye tool the active tool (key J). Click the red of a pupil |
| `tool.select.remove` | Remove Tool |  | Makes the Remove tool the active tool (key J). Paint over what to remove; it is filled from its surroundings when you release · [ ] size |
| `tool.select.rotateView` | Rotate View Tool |  | Makes the Rotate View tool the active tool (key R). Drag to turn the view · Shift for 15 degree steps · Double-click or Escape straightens it |
| `tool.select.ruler` | Ruler Tool |  | Makes the Ruler tool the active tool (key I). Drag to measure · Drag an end to adjust · Straighten Layer levels the layer along the line |
| `tool.select.selectionBrush` | Selection Brush Tool |  | Makes the Selection Brush tool the active tool (key W). Paint to add to the selection · Alt-paint to take away · [ ] size · Shift+[ ] hardness |
| `tool.select.shape` | Shape Tool |  | Makes the Shape tool the active tool (key U). Drag to draw a rectangle (on a new shape layer) · Shift after starting keeps it square · Alt after starting grows from the center · Shift+U switches shape |
| `tool.select.slice` | Slice Tool |  | Makes the Slice tool the active tool (key C). Drag a rectangle to add a slice · Shift makes it square · Slices are numbered in reading order |
| `tool.select.smear` | Smear Tool |  | Makes the Smear tool the active tool. Paint to soften; another stroke over the same place softens more · The blur follows the brush size · [ ] size |
| `tool.select.sponge` | Sponge Tool |  | Makes the Sponge tool the active tool (key O). Paint to take color out, or with Saturate, to strengthen it · [ ] size |
| `tool.select.spotHealing` | Spot Healing Tool |  | Makes the Spot Healing tool the active tool (key J). Paint over a spot and it heals on release · Content-Aware copies a matching patch nearby · Create Texture fills smoothly with matching grain · Proximity Match prefers the nearest patch · [ ] size |
| `tool.select.type` | Type Tool |  | Makes the Type tool the active tool (key T). Click to add point text · Drag a box for paragraph text · Click a type layer to edit its text |
| `tool.select.wand` | Magic Wand Tool |  | Makes the Magic Wand tool the active tool (key W). Click to select similar colours · Shift adds · Alt subtracts · Tolerance sets how alike · Arrows nudge the outline |
| `tool.select.zoom` | Zoom Tool |  | Makes the Zoom tool the active tool (key Z). Click zooms in · Alt-click zooms out · Drag right or left to zoom smoothly · Space pans |

## Type

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `edit-text` | Edit Type... |  | Opens the text of the active type layer for editing. (changes the picture) |
| `paragraph-styles` | Paragraph Styles... |  | Opens Paragraph Styles. |
| `type-on-path` | Type on Path... |  | Opens Type on Path. (changes the picture) |
| `warp-text` | Warp Text... |  | Opens Warp Text. (changes the picture) |

## View

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `actual` | Actual Pixels | Mod+1 | Zooms to 100 percent. |
| `clear-guides` | Clear Guides |  | Removes every guide. (changes the picture) |
| `clear-slices` | Clear Slices |  | Removes every user slice. (changes the picture) |
| `fit` | Fit on Screen | Mod+0 | Zooms so the picture fits the window. |
| `gamut-warning` | Gamut Warning | Shift+Mod+Y | Turns the gamut warning on or off. |
| `lock-guides` | Lock Guides | Alt+Mod+; | Locks or unlocks guides so they cannot be dragged. |
| `new-guide` | New Guide... |  | Opens the New Guide dialog to place a guide at a position. (changes the picture) |
| `pixel-grid` | Pixel Grid |  | Shows or hides the pixel grid at high zoom. |
| `proof-colors` | Proof Colors |  | Turns Proof Colors on or off. |
| `proof-preset-black` | Working Black Plate |  | Shows the working CMYK black plate as a grey image and turns Proof Colors on. |
| `proof-preset-cmy` | Working CMY Plates |  | Shows the working CMYK cyan, magenta and yellow plates together, without black, and turns Proof Colors on. |
| `proof-preset-cmyk` | Working CMYK |  | Previews the picture as the working CMYK profile prints it and turns Proof Colors on. |
| `proof-preset-cyan` | Working Cyan Plate |  | Shows the working CMYK cyan plate as a grey image and turns Proof Colors on. |
| `proof-preset-deuteranopia` | Color Blindness - Deuteranopia-type |  | Simulates deuteranopia, green-blind colour vision, and turns Proof Colors on. |
| `proof-preset-magenta` | Working Magenta Plate |  | Shows the working CMYK magenta plate as a grey image and turns Proof Colors on. |
| `proof-preset-protanopia` | Color Blindness - Protanopia-type |  | Simulates protanopia, red-blind colour vision, and turns Proof Colors on. |
| `proof-preset-yellow` | Working Yellow Plate |  | Shows the working CMYK yellow plate as a grey image and turns Proof Colors on. |
| `proof-setup` | Proof Setup... |  | Opens Proof Setup. |
| `rail-columns` | Tools in Two Columns |  | Lays the toolbar out in one or two columns. |
| `screen-full` | Full Screen Mode |  | Full screen with no menu bar. |
| `screen-menu` | Full Screen Mode with Menu Bar |  | Full screen with the menu bar kept. |
| `screen-next` | Change Screen Mode | F | Steps through standard, menu and full screen modes. |
| `screen-standard` | Standard Screen Mode |  | Shows the normal window with its title bar. |
| `toggle-grid` | Toggle Grid | Mod+' | Shows or hides the grid. |
| `toggle-guides` | Toggle Guides | Mod+; | Shows or hides guides. |
| `toggle-panels` | Toggle Panels | Tab | Shows or hides every panel and the toolbar. |
| `toggle-rulers` | Toggle Rulers | Mod+R | Shows or hides the rulers. |
| `toggle-show-slices` | Toggle Show Slices |  | Shows or hides the slice rectangles and their numbers. |
| `transform-controls` | Transform Controls |  | Shows or hides transform handles on the layer. |
| `zoom-in` | Zoom In | Mod+= | Zooms in. |
| `zoom-out` | Zoom Out | Mod+- | Zooms out. |

## Window

| Id | Name | Keys | Does |
| --- | --- | --- | --- |
| `about` | About formvis |  | Opens the About dialog. |
| `action-stop` | Stop Recording |  | Stops recording an action. |
| `actions` | Actions... |  | Opens the Actions panel to record and play steps. |
| `agent.claude.open` | Claude Code |  | Shows or hides the Claude Code panel. |
| `agent.connect.open` | Agent Connect |  | Shows or hides Agent Connect: which outside agents may act, their policy, approvals and activity. |
| `assistant` | Assistant |  | Shows or hides the Assistant panel. |
| `benchmark` | Performance Benchmark... |  | Opens the performance benchmark. |
| `brush-settings` | Brush Settings... | F5 | Opens Brush Settings. |
| `copy-error-log` | Copy Error Log |  | Copies the error log to the clipboard. |
| `delete-frame` | Delete Frame |  | Deletes the current animation frame. (changes the picture) |
| `help` | formvis Help | F1 | Opens the formvis manual. |
| `manage-plugins` | Manage Plugins... |  | Opens the plugins dialog. |
| `merge-columns` | Merge Panel Columns |  | Merges the panel columns into one. |
| `new-frame` | New Frame |  | Adds a frame to the frame animation. (changes the picture) |
| `panel-brushes` | Brushes |  | Shows or hides the Brushes panel. |
| `panel-character` | Character |  | Shows or hides the Character panel. |
| `panel-history` | History |  | Shows or hides the History panel. |
| `panel-info` | Info |  | Shows or hides the Info panel. |
| `panel-layer-comps` | Layer Comps |  | Shows or hides the Layer Comps panel. |
| `panel-layers` | Layers |  | Shows or hides the Layers panel. |
| `panel-navigator` | Navigator |  | Shows or hides the Navigator panel. |
| `panel-paragraph` | Paragraph |  | Shows or hides the Paragraph panel. |
| `panel-paths` | Paths |  | Shows or hides the Paths panel. |
| `panel-properties` | Properties |  | Shows or hides the Properties panel. |
| `panel-properties-col` | Properties Column |  | Shows or hides the Properties column. |
| `panel-swatches` | Swatches |  | Shows or hides the Swatches panel. |
| `panel-timeline` | Timeline |  | Shows or hides the Timeline panel. |
| `play-animation` | Play Animation |  | Plays or stops the frame animation. |
| `pref-home-last-close` | Show Home Screen When the Last Document Closes |  | Turns the Home screen after the last document closes on or off (Preferences > General); off, closing the last document leaves the empty workspace. |
| `pref-home-launch` | Show Home Screen at Launch |  | Turns the Home screen at launch on or off (Preferences > General); on shows it while no document is open at start. |
| `pref-whats-new-auto` | Show What's New Once After an Update |  | Turns on or off opening What's New once after an update (Preferences > General). |
| `reset-panels` | Reset Panels |  | Restores the default panel layout. |
| `search` | Search... | Mod+K | Opens the command palette. |
| `settings` | Preferences... | Mod+, | Opens Preferences. |
| `sheet-panels` | Panels Sheet |  | Opens the Panels sheet on narrow screens. |
| `sheet-props` | Properties Sheet |  | Opens the Properties sheet on narrow screens. |
| `sheet-tools` | Tools Sheet |  | Opens the Tools sheet on narrow screens. |
| `shortcuts` | Keyboard Shortcuts... | Alt+Shift+Mod+K Shift+/ | Opens the Keyboard Shortcuts editor. |
| `terminal.new` | New Terminal |  | Opens a new terminal tab. |
| `terminal.toggle` | Terminal | Mod+J | Shows or hides the terminal dock. |
| `tween-frames` | Tween... |  | Opens the Tween dialog to add in-between frames. (changes the picture) |
| `whats-new` | What's New... |  | Opens What's New: the additions of the current and recent releases, each with a Show Me button that runs its command. |

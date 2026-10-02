# formvis manual

formvis is a layered image editor. It runs in the browser or as a desktop app, with an engine on your computer for the
work a browser cannot do alone. This manual is also in the app: Help > formvis Help (F1), where you can search it and
ask it questions.

## Getting started

- New document: File > New sets the size, resolution, colour mode (RGB, Grayscale or Bitmap) and background.
- Open: File > Open Project opens formvis projects (.fmv), Photoshop files (.psd, .psb), OpenRaster files (.ora) and
  images (PNG, JPEG, WebP, AVIF, GIF, TIFF, HEIC, camera raw and more). Dropping files on the window opens them too.
- A picture larger than formvis edits in one piece (over 30,000 pixels a side or 100 megapixels, up to 65,535 a
  side) opens as a reduced copy that fits, a region at full size, or tiles at full size, each tile its own document.
  File > Export > Assemble Tiles puts the edited tiles back together as one full-size PNG, written by the engine a
  strip at a time. Opening needs memory for the whole picture once, about 4 bytes a pixel; the dialog says how much.
- Save: File > Save keeps everything editable in a .fmv project: layers, masks, adjustments, text, paths and history
  snapshots.
- The documents open when formvis closes reopen at the next start, saved or not, in their tab order (Preferences >
  File Handling). With that off, only unsaved work is kept, and formvis asks to recover it after a crash.
- The engine: some features (library saves, HEIC and TIFF import, background removal, generative tools, sending to
  other apps, the assistant) need the formvis engine. If a message says it is offline, start it with `./formvis boot`.

## The workspace

- The tools are in the rail on the left; tools that share a slot open from a flyout, and each tool's options are in
  the bar along the top.
- Panels (Layers, Properties, History, Brushes, Swatches, Paths, Navigator and more) dock in columns on the right.
  Drag a tab to move it, into another group or into a new one; Window lists every panel. Window > Reset Panels puts
  them back.
- Workspaces arrange the panels for a kind of work, and the lock keeps an arrangement from being changed by accident.
- Preferences (Edit > Preferences, Ctrl+comma) has Photoshop's sections: General, Interface, Performance, Workspace, Tools, History
  & Cache, File Handling, Cursors, Transparency & Gamut, Units & Rulers, Guides & Grid, and Plugins.

## Layers

- Kinds: pixel layers, text, shapes, smart objects (their original kept, with filters that stay editable), adjustment
  layers and groups (folders, which pass their contents through to what is below).
- Each layer has a blend mode (all 27 of Photoshop's), opacity and fill, a layer mask, and layer styles (Drop Shadow,
  Outer and Inner Glow, Stroke, Inner Shadow, Satin, Bevel and Emboss, overlays).
- A clipping mask shows a layer only where the layer below it has pixels.
- Tools and commands work where Photoshop's do: painting an adjustment layer paints its mask; a text or shape layer
  asks to be rasterized first.

## Selecting

- Marquee (rectangle, ellipse, single row and column), Lasso (freehand, polygonal, magnetic), Magic Wand, Quick
  Selection and Object Selection (hover to see the object it would take).
- Select > Subject finds the main subject; Select > Color Range selects by colour or by tone; Select > Sky selects the
  sky (its model downloads once, 176 MB); Select > Focus Area selects what is in focus, with a preview to set how much.
- Select and Mask refines an edge. Expand, Contract, Feather, Border, Smooth and Invert change a selection; selections
  can be saved and loaded.

## Painting and retouching

- The Mixer Brush (B) paints with wet paint: Wet sets how much colour it picks up from the canvas, Mix how much of
  that it lays with the loaded colour, Load how far the loaded colour lasts along a stroke. Alt-click loads the
  brush from the canvas; with Wet and Mix at 0 it paints like the Brush.
- The Art History Brush (Y) paints stylised strokes in the colours of the History Brush's source snapshot: take a
  snapshot in the History panel, then brush over the picture to turn it into a painted version of itself. Style sets
  the strokes (tight or loose, short to long, dabs or curls); Tolerance leaves alone what is already close to the
  snapshot.
- The Remove tool (J) takes out what you paint over. Its options also find things to remove by themselves: wires and
  cables, people other than the subject, and distractions (other salient objects as well as people), filling them so
  the scene continues, as one step. These use the face finder, Segment Anything 2 and LaMa from Preferences > Plugins
  > Local models.
- Brush, Pencil and Eraser (including Background and Magic Eraser), with Photoshop's brush settings: shape dynamics,
  scattering, colour dynamics, transfer, noise and wet edges. Brushes from Photoshop .abr files can be imported.
- Clone Stamp (Sample: Current Layer, Current & Below or All Layers; Mode; Flow), Healing Brush, Spot Healing, Patch,
  Content-Aware Move and Red Eye.
- Dodge and Burn (Range, Exposure, Protect Tones) and Sponge (Saturate or Desaturate, Flow, Vibrance).
- Blur and Sharpen (Mode and Sample All Layers; Sharpen's Protect Detail) and Smudge (Sample All Layers, Finger
  Painting), in the Smear tool with Liquify.
- Filter > Liquify has Forward Warp, Reconstruct, both Twirls, Pucker and Bloat, and Freeze Mask: paint over what
  must not move (shown in red) and every tool leaves it still; Thaw Mask frees it, Mask None clears the mask and
  Invert Mask swaps frozen and free. Find faces (the face finder downloads once, 232 KB) and the Face-Aware sliders
  reshape the largest face: eyes, nose, smile and mouth, forehead, chin and face width.

## Type, shapes and paths

- The Type tool adds editable text: point text or a paragraph in a box, horizontal or vertical, with font style,
  anti-aliasing, colour and warp. Type Mask tools make a selection in the shape of text.
- Shape tools draw rectangles, ellipses, triangles, polygons, stars, lines, arrows and custom shapes, as shape
  layers, paths or pixels, with a fill and a stroke; the stroke is solid, dashed or dotted, and inside, centred on or
  outside the shape's edge.
- The Pen draws Bézier paths, or in Shape mode makes a shape layer from each path it closes; with Auto Add/Delete on,
  clicking a path adds a point and clicking a point deletes it. Path Selection and Direct Selection move and reshape
  paths, and a path can become a selection, be filled or be stroked.

## Adjustments, filters and looks

- Adjustment layers change what is below them without changing its pixels: Levels, Curves, Hue/Saturation, Exposure,
  Brightness/Contrast, Vibrance, Color Balance, Black & White, Photo Filter, Channel Mixer, Invert, Posterize,
  Threshold, Selective Color, Gradient Map, Color Lookup (its own looks, including bleach bypass, cross process and
  faded film, or a .cube file), Develop (tone, colour and detail, with a vignette), Grain, Split Toning, Halation and
  Glow.
- Grain has presets by film speed, ISO 100 to ISO 3200.
- Layer > New Film Layer adds a Light Leak (warm light from an edge or corner, in Screen blend) or a Frame (a film
  edge, a white border or a thin line), as layers you can move and mask.
- Layer > Color Match matches a layer's colours to what is beneath it or around it, without changing its pixels: it
  adds a Curves layer clipped to it, whose opacity is the amount.
- Filters (Filter menu) include blurs, sharpening, noise, lens correction and the gallery's artistic filters; on a
  smart object they stay editable.
- Image > Content-Aware Scale changes a layer's width or height by removing or adding the least important seams,
  so the parts that matter keep their shape; tick Protect skin tones or Protect the selection to keep those whole. It
  goes from a quarter to twice the size in one step. Image > Image Rotation turns the whole canvas by 90 or 180
  degrees without resampling a pixel.
- Edit > Perspective Warp straightens or changes the perspective of what is in a picture. In Layout, drag to draw a
  plane over a surface (a wall, a road, a box side) and move its corners onto the surface's corners; draw more planes
  beside it, their corners snapping together. Then choose Warp in the options bar and move the corners: the picture
  follows each plane. Straighten verticals and Level horizontals do the common fixes at once. Enter applies, Escape
  cancels.
- Filter > Adaptive Wide Angle straightens a wide or fisheye picture. Click three or more points along something
  that should be straight (a horizon, a door frame) on the dialog's picture, add more lines with New line, and click
  Fit to lines: formvis finds the lens's field of view that straightens them and levels the first. Correction,
  Strength, Scale and Rotation can also be set by hand.

## Generating images

- Edit > Generative Fill paints a selection from a prompt, or removes what it covers with an empty prompt; Generative
  Expand grows the canvas and fills the new border; Image > Upscale enlarges two or four times. Upscale runs on fal, or
  on this computer with no key once Real-ESRGAN is downloaded (Preferences > Plugins > Local models, about 67 MB). The result is a new
  layer, masked to the selection.
- Edit > Generate Image makes a picture from a prompt alone, as a new layer at the document's size.
- The model: FLUX on fal (paste a fal key into the dialog once), or one of your ComfyUI workflows (see ComfyUI
  below). A workflow needs no fal key.
- API keys (fal's, and the language model's) are kept in your system's password store: Keychain on a Mac,
  Credential Manager on Windows, the Secret Service on Linux. Where there is none, in a file only you can read.
  Preferences > Plugins says which.
- Without fal or ComfyUI: download LaMa (Preferences > Plugins > Local models, about 208 MB) and Generative Fill and
  Expand work on any computer, with no prompt: LaMa fills from what surrounds the selection. It is chosen for you when
  fal has no key. docs/LOCAL.md lists everything that runs on this computer and what each needs.
- Filter > Neural Filters is a gallery with a live preview and one undo step. Harmonize moves a layer's light and
  colour toward what lies beneath it; Skin Smoothing softens skin tones only; neither needs a model. Depth Blur reads
  the layer's depth with Depth Anything V2 Small (Preferences > Plugins > Local models, about 99 MB, Apache-2.0) and
  blurs by distance from the focus depth you set, past a sharp range. Colorize predicts a black-and-white layer's
  colour with DDColor-tiny (about 135 MB, Apache-2.0), keeping its own light, mixed in by Amount. Style Transfer
  repaints the layer in one of five preset styles (Mosaic, Candy, Rain Princess, Udnie, Pointilism; the ONNX model
  zoo's fast neural style models, about 34 MB, BSD-3-Clause), mixed in by Amount. JPEG Artifacts Removal smooths
  the steps on JPEG's 8-pixel grid and the noise in flat areas while keeping real edges, with no model; Super Zoom is
  Image > Upscale (Real-ESRGAN) at 2x or 4x. The gallery works on 8-bit RGB layers for now.
- References: up to four layers can be sent to a ComfyUI workflow as references.
- On this computer, with no key and no cost: install Krea 2 Turbo or FLUX.2 [klein] 4B in Preferences > Plugins >
  Local models (each licence is shown for you to accept first; Krea 2 installs with the content filter its licence
  requires). Both appear in Generate Image; Krea 2 also in Generative Fill and Expand, starting from what the selection
  covers at the Influence you set, the result masked to the selection. Your LoRAs and checkpoints go there too.
  Krea 2's licence notice is shown with each of its pictures. The models are large (up to about 18 GB) and want a
  recent Mac with Apple silicon, or a PC with an NVIDIA graphics card.
- Improve, beside the prompt, rewrites it through a language model following a prompt template; Restore puts yours
  back. Set the model, and edit the templates, in Preferences > Plugins.

## ComfyUI

- Set ComfyUI's address in Preferences > Plugins (http://127.0.0.1:8188 by default).
- File > Send to ComfyUI puts the image, a layer, the selection (the whole picture and a mask) or every layer into
  ComfyUI's input folder, under formvis, for its Load Image nodes.
- File > Run ComfyUI Workflow runs a workflow on your picture and brings the results back as layers, masked to the
  selection if you sent one. Save the workflow in ComfyUI with Export (API).
- How formvis fills a workflow: the first Load Image takes the picture; the first Load Image (as Mask) takes the
  selection's mask; a text node titled "formvis prompt" takes the prompt; Load Image nodes titled "formvis reference"
  (then "formvis reference 1", "2" and on) take reference layers. A workflow with no Load Image runs on the prompt.
- Workflows added in Edit > Generative Fill become choices of model there and in Generate Image.

## NodeMode

- File > Send to NodeMode sends the image, a layer, the selection with its mask, or every layer to NodeMode. Set
  NodeMode's address in Preferences > Plugins (http://localhost:8000 by default).
- Embedded in NodeMode, formvis sends to the NodeMode around it.
- NodeMode places what arrives on its canvas once it has formvis's receiver; without it, the images go to NodeMode's
  uploads, and formvis says so.

## 3D models

- File > Place 3D Model places a .glb or .gltf model: turn, tilt and size it, and set its light and the ambient light,
  in a live preview. Place renders it at the document's size on transparency, as a new layer.

## Colour management

- A document is sRGB unless it has its own profile. Edit > Assign Profile gives it one (Display P3, Adobe RGB, or an
  RGB profile on this computer) without changing its numbers; Edit > Convert to Profile converts the numbers so the
  colours look the same in the new profile, with a rendering intent and black point compensation. The profile is
  saved with the project and embedded when you export.
- View > Proof Setup chooses a device to simulate, such as a press or printer profile (CMYK profiles included); Load
  Profile adds a .icc or .icm file. View > Proof Colors shows the picture as that device would print it, and Gamut
  Warning (Shift+Ctrl+Y) greys out the colours it cannot print. Neither changes the document.
- Opening an image with an embedded profile other than sRGB converts it to sRGB and says so. Preferences > File
  Handling can keep the embedded profile instead, or ask each time.

## CMYK documents

- Image > Mode > CMYK Color turns an 8-bit RGB document into CMYK ink through a CMYK profile: the shipped FOGRA39L
  Coated (offset printing on coated paper) or any CMYK profile loaded through View > Proof Setup, with the rendering
  intent and black point compensation of your choice. The engine converts every pixel exactly (LittleCMS); the tab
  reads CMYK/8 and shows the profile's name. Mode > RGB Color converts back the same way.
- CMYK JPEG and TIFF files open as CMYK documents with their embedded profile; a file without one takes the shipped
  profile, and a message says so. File > Export > TIFF and JPEG from a CMYK document export in CMYK with the profile
  embedded; PNG, WebP and the others export the sRGB rendition you see.
- Every layer keeps its ink beside the rendition on screen, and the project keeps it too. The Channels panel lists
  CMYK, Cyan, Magenta, Yellow and Black with a thumbnail of each ink; click an ink and the Brush, Pencil and Eraser
  paint that ink alone (a K-only black is one click and a stroke), click CMYK to paint all four. The colour picker
  shows C, M, Y and K, and the Info panel reads the ink under the pointer. Gaussian, Motion and Surface Blur, Unsharp
  Mask, Add Noise, Levels, Curves, Invert, Posterize and Brightness/Contrast layers, Image Size, Canvas Size, Image
  Rotation, Free Transform, Trim and Reveal All run on the ink itself, and so do blend modes, opacity and fill, layer
  and folder masks, clipping masks and groups, in the canvas and in every export. Hue/Saturation, Vibrance, Color
  Balance, Black and White, Photo Filter, Threshold, Selective Color, Gradient Map, Color Lookup and Shadows/Highlights
  layers give the same results as in RGB: a small change keeps the ink's own structure (a K-only black stays K-only),
  a large one takes the profile's separation. Text, shapes, gradients, fills, the retouching tools and the other
  filters work too: the pixels they leave alone keep their ink exactly, the ones they change take the new colour's
  ink (black text set at K 100 stays K-only), and layer styles draw in ink too; Exposure and HDR Toning give their RGB
  results. What does not work in CMYK yet (Channel Mixer, the profile and proof commands) waits in the menu until Mode
  > RGB Color.

## Lab documents

- Image > Mode > Lab Color turns an 8-bit RGB document into CIE Lab (with the D50 white Photoshop's Lab uses); RGB
  Color turns it back exactly. Painting, text, shapes, fills and filters work in it; the pixels they leave alone keep
  their Lab values. The Channels panel shows Lab, Lightness, a and b (a and b mid-grey where neutral), and Info reads
  L, a and b. Levels and Curves work on Lightness, a and b; the colour adjustments (Hue/Saturation, Black and White and
  the rest, Channel Mixer, Exposure and HDR Toning among them) give the same results as in RGB; blend modes look as they
  do in RGB; Export TIFF writes a Lab TIFF. Lab Color from a 16-bit document keeps its 16-bit values. Single-channel
  views and opening Lab files wait for now; layer styles work.

## 32-bit documents

- Radiance HDR, OpenEXR and 32-bit TIFF open as 32-bit documents, and Image > Mode > 32 Bits/Channel turns any RGB
  document into one. Their pixels are linear light and may be brighter than white; the canvas shows them with white and
  above as white. The Exposure adjustment works in linear light, as do moving, the canvas and image size commands and
  Gaussian Blur. File > Export > Radiance HDR and OpenEXR write them as they are; Export TIFF writes 32-bit float.
- Image > Mode > 16 or 8 Bits/Channel asks for HDR Toning (Exposure and Gamma): lower the exposure to keep highlights.
- Painting, the retouching tools and the other filters work at 32 bits too: what they leave alone keeps its light
  exactly, above white included, and what they change takes the new colour. Painting white over a highlight already
  brighter than white leaves it as it was. Groups, masks, clipping masks and layer styles work at 32 bits, and so does
  every blend mode: Photoshop's 32-bit modes keep light above white, and the others blend in the visible range, light
  above white kept wherever one layer alone covers a pixel. Unsharp Mask and Add Noise keep light above white too.
  Convert to Profile converts linear light exactly between RGB profiles; proofing works as in other documents. Indexed
  Color, Bitmap, CMYK and Lab bring the document down first (HDR Toning asks how); Grayscale keeps 32 bits, taking
  each pixel's luminance in linear light. Every adjustment layer works at 32 bits: it changes a pixel's colour as it
  shows within the visible range, and light above white keeps its brightness.

## 16-bit documents

- A 16-bit PNG or TIFF opens as a 16-bit document, and Image > Mode > 16 Bits/Channel turns any RGB document into one.
  Its layers keep their 16 bits; Levels, Curves and Exposure adjustment layers work on them, as do moving, Flip
  Canvas, Canvas Size, Crop, Trim, Image Size, Gaussian Blur, Unsharp Mask and Add Noise (within a selection too),
  and the Brush, Pencil and Eraser; File > Export PNG and Export TIFF write 16 bits a channel; the project keeps them.
- What cannot keep 16 bits yet (the other painting and retouching tools, colour dynamics, the other filters and
  adjustments, Free Transform) is unavailable in a 16-bit
  document rather than dropping it to 8 bits quietly: Image > Mode > 8 Bits/Channel makes it available.

## Exporting

- File > Export As chooses the format (PNG, JPEG, WebP, AVIF, TIFF, PDF), quality, colour profile and size: a Scale in
  percent, Fit Within a width and height, or a Frame of exactly that size with the picture centred. Settings can be
  saved as presets.
- AI label: Made with AI or Edited with AI writes the standard machine-readable marking of AI content (IPTC's Digital
  Source Type) into PNG, JPEG and WebP. AVIF, TIFF and PDF do not carry it yet.
- File > Export also writes Photoshop files (layers, masks, groups and more) and OpenRaster files for Krita, GIMP and
  MyPaint. Adjustment layers have no OpenRaster form and are left out, said so.

## The assistant and outside agents

- Window > Assistant is a chat beside the canvas that edits the open document: add and change layers, select, fill,
  add adjustments, place images, undo, and generate. Each action shows as a card. Undo This Turn takes back everything
  since your last message. It uses the language model set in Preferences > Plugins; a local model needs to support
  tool calling.
- Outside agents (Claude Code, Codex, Cursor): ask them in plain language to edit what is open in formvis. In the
  formvis folder, `./formvis agents install` sets all three up for your account (the MCP server and the editing skill);
  inside the formvis repository they are already set up. formvis starts itself when an agent asks, opens a window if
  none is open, and asks you once to allow outside agents. They get 39 tools, from opening, saving and exporting files
  to layers, text, selections, filters and generative fill, which uses the models on this computer first.
- Either way, every change is an undoable step, anything that costs money asks you first, your keys are never shown,
  and only this computer can connect.

## Plugins

- Plugins > Manage Plugins adds a plugin (a JavaScript file), turns plugins on and off, and removes them. Their
  commands appear in the Plugins menu. Plugins are kept in the plugins folder of formvis's data folder.
- A plugin runs in a sandbox: it can change the open document only through formvis's tools, each change undoable,
  and anything that costs money still asks you. It cannot see your keys, your files or the rest of formvis. Add only
  plugins you trust.
- Writing one: call `formvis.register({ name, commands: [{ id, label, run }] })`. Inside `run`:
  `await formvis.call(tool, args)` uses a tool (the same ones as the assistant: get_document, select, add_layer, fill
  and the rest); `await formvis.getPixels()` gives the active layer at the document's size as `{ width, height, data }`;
  `await formvis.putPixels(image, 'replace')` puts pixels back into that layer, or with `'new-layer'` into a new one.

## Keyboard shortcuts

- Help > Keyboard Shortcuts lists every shortcut. Most follow Photoshop's: tools by their letters, and Ctrl (Cmd on a
  Mac) with Z to undo, with S to save, with J for Layer via Copy, and with a comma for Preferences.

## When something goes wrong

- "The formvis engine is offline": start it with `./formvis boot`, or `./formvis doctor` to check the installation.
- Help > Copy Error Log copies what went wrong, to paste into a report.
- A generative tool that cannot run says why: no key set, the service not answering, or a model's safety filter.
- A language model or ComfyUI that does not answer: check its address with Check in Preferences > Plugins.

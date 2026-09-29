# formvis manual

formvis is a layered image editor. It runs in the browser or as a desktop app, with an engine on your computer for the
work a browser cannot do alone. This manual is also in the app: Help > formvis Help (F1), where you can search it and
ask it questions.

## Getting started

- New document: File > New sets the size, resolution, colour mode (RGB, Grayscale or Bitmap) and background.
- Open: File > Open Project opens formvis projects (.fmv), Photoshop files (.psd, .psb), OpenRaster files (.ora) and
  images (PNG, JPEG, WebP, AVIF, GIF, TIFF, HEIC, camera raw and more). Dropping files on the window opens them too.
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
- Select > Subject finds the main subject; Select > Color Range selects by colour or by tone.
- Select and Mask refines an edge. Expand, Contract, Feather, Border, Smooth and Invert change a selection; selections
  can be saved and loaded.

## Painting and retouching

- Brush, Pencil and Eraser (including Background and Magic Eraser), with Photoshop's brush settings: shape dynamics,
  scattering, colour dynamics, transfer, noise and wet edges. Brushes from Photoshop .abr files can be imported.
- Clone Stamp (Sample: Current Layer, Current & Below or All Layers; Mode; Flow), Healing Brush, Spot Healing, Patch,
  Content-Aware Move and Red Eye.
- Dodge and Burn (Range, Exposure, Protect Tones) and Sponge (Saturate or Desaturate, Flow, Vibrance).
- Blur and Sharpen (Mode and Sample All Layers; Sharpen's Protect Detail) and Smudge (Sample All Layers, Finger
  Painting), in the Smear tool with Liquify.

## Type, shapes and paths

- The Type tool adds editable text: point text or a paragraph in a box, horizontal or vertical, with font style,
  anti-aliasing, colour and warp. Type Mask tools make a selection in the shape of text.
- Shape tools draw rectangles, ellipses, triangles, polygons, stars, lines, arrows and custom shapes, as shape
  layers, paths or pixels, with a fill and a stroke.
- The Pen draws Bézier paths; Path Selection and Direct Selection move and reshape them, and a path can become a
  selection, be filled or be stroked.

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

## Generating images

- Edit > Generative Fill paints a selection from a prompt, or removes what it covers with an empty prompt; Generative
  Expand grows the canvas and fills the new border; Image > Upscale enlarges two or four times. The result is a new
  layer, masked to the selection.
- Edit > Generate Image makes a picture from a prompt alone, as a new layer at the document's size.
- The model: FLUX on fal (paste a fal key into the dialog once), or one of your ComfyUI workflows (see ComfyUI
  below). A workflow needs no fal key.
- API keys (fal's, and the language model's) are kept in your system's password store: Keychain on a Mac,
  Credential Manager on Windows, the Secret Service on Linux. Where there is none, in a file only you can read.
  Preferences > Plugins says which.
- References: up to four layers can be sent to a ComfyUI workflow as references.
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
- Outside agents: turn on Allow outside agents in Preferences > Plugins, then connect Claude Code with
  `claude mcp add --transport http formvis http://127.0.0.1:8190/mcp`, or Claude Desktop with `./formvis mcp` (run in
  the formvis folder) as the server's command.
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

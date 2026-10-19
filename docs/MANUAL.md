# formvis manual

formvis is a layered image editor. It runs in the browser or as a desktop app, with an engine on your computer for the
work a browser cannot do alone. This manual is also in the app: Help > formvis Help (F1), where you can search it and
ask it questions.

## Getting started

- New document: File > New sets the size, resolution, colour mode (RGB, Grayscale or Bitmap) and background.
- Open: File > Open Project opens formvis projects (.fvd, and .fmv from before 1.87.0), PSD and PSB files, OpenRaster files (.ora) and
  images (PNG, JPEG, WebP, AVIF, GIF, TIFF, HEIC, QOI, TGA, ICO, PBM, PGM, PPM, PAM, camera raw and more). Dropping files on the window opens them too.
- Opening one camera RAW (DNG, CR2, CR3, NEF, ARW and the rest) shows Camera Raw first: a half-size preview,
  White Balance (As Shot, Auto or Daylight), Temperature and Tint, applied in the RAW decode, and 8 or 16 bits per
  channel. Auto is a gray-world average, not the camera's own. The curve, mixer, grading, lens and geometry controls
  stay in Filter > Develop, which runs after an 8-bit open. Develop settings are not stored on the layer, so there is
  no Camera Raw Filter to reopen, and when you open several RAW files at once they open with the defaults.
- A picture larger than formvis edits in one piece (over 30,000 pixels a side or 100 megapixels, up to 65,535 a
  side) opens as a reduced copy that fits, a region at full size, or tiles at full size, each tile its own document.
  File > Export > Assemble Tiles puts the edited tiles back together as one full-size PNG, written by the engine a
  strip at a time. Opening needs memory for the whole picture once, about 4 bytes a pixel; the dialog says how much.
- Save: File > Save keeps everything editable in a .fvd project: layers, masks, adjustments, text, paths and history
  snapshots, with a thumbnail for Home. In the app for Mac, Windows and Linux, Save writes back to the document's file; Save As, the first
  Save of a new document and every export ask where in the system's save panel. In a browser, projects go to the
  library and exports download. Open > Browse... opens any project or picture; Folder... opens an unpacked project
  folder, or every project and picture in an ordinary folder.
- File > Save a Copy (Alt+Ctrl+S) puts a copy of the document in the library under another name, in one layer with
  Layers off, and leaves the document in its tab as it was. File > Revert goes back to the document as last saved, as
  one step that Undo takes back (F12 in the desktop app). File > Close All and Close Others close every document, or
  every one but the current, asking about each one with unsaved changes; Apply to All answers for the rest.
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
- Hidden panels are in the Window menu: Clone Source, Adjustments, Notes and Histogram are docked but hidden until
  you open them; Gradients, Patterns and Shapes hold preset tiles that pick the Gradient tool's gradient, the Pattern
  Stamp's pattern or the Shape tool's custom shape in one click; Styles, Character Styles, Layer Comps, Measurement
  Log and Modifier Keys are there too. Glyphs and Tool Presets are dialogs, not panels.
- Edit > Toolbar arranges the tool rail: drag a tool to another group, or into Extra Tools to tuck it away, and drag
  groups to reorder them. Restore Defaults puts the standard layout back and Clear Tools empties every group into
  Extra Tools. The layout is saved in the preferences, so it survives a restart; an older hidden-rail setting is
  dropped, not carried over.
- Window > Arrange chooses how open documents show. Consolidate All to Tabs is the normal view. 2-up Vertical and
  Horizontal, 3-up, 4-up and 6-up tile the documents, the current one live and the others as read-only views;
  Tile All Vertically and Horizontally fill the area, and Match Zoom, Location, Rotation or All copy the current
  view to the rest. Drag the gutter between tiles to resize them. New Window for Document opens a second view of the
  same project, Float in Window puts a view in a frame you can move and resize, and Float All in Windows does that for
  every document; Consolidate All to Tabs closes the frames again. Limits: a second view or a floating frame pans,
  zooms and rotates but takes no tool input (paint in the main view); Float keeps the document's tab; extra views and
  tile sizes are not saved with the project. Cascade and Tile are not built.
- Workspaces arrange the panels for a kind of work, and the lock keeps an arrangement from being changed by accident.
- Preferences (Edit > Preferences, Ctrl+comma) has these sections: General, Interface, Performance, Workspace, Tools, History
  & Cache, File Handling, Cursors, Transparency & Gamut, Units & Rulers, Guides & Grid, and Plugins.
- Home has a navigation column (Start, Recent, Projects, Outputs, Create, Preferences, Help). Start offers Open, New
  document, a drop zone, your recent files and new document sizes; Recent, Projects and Outputs list files as
  thumbnails or a list with filter and sort. The brand mark at the top left opens Home at any time.
- The Home screen is optional. Preferences > General has Show Home screen at launch (on) and Show Home screen when
  the last document closes (off): with it off, closing the last document leaves the empty workspace with its panels
  where they were. Both are commands too (pref-home-launch, pref-home-last-close).
- Nothing floats over the picture. Notices sit in the bottom corner, let every click through and fade away from a
  pointer that comes near them over the canvas; the menus, the panel flyouts and the dialogs open only when asked for.
- Settings stick. Every tool's options and the last values of the dialogs (Canvas Size, Fill, Stroke, the filters,
  Remove Background, Export and the rest) are kept across restarts, in Preferences; Reset All Preferences puts
  them back to the defaults. What describes the open document (a size, a position, a colour taken from the
  foreground) starts fresh each time.
- Help > What's New lists what the recent releases added. Each row's Show Me closes the list and runs the feature;
  the list opens once after an update (turn that off in the list itself or with pref-whats-new-auto).
- The library can live in any folder, a synced one (iCloud Drive, Dropbox, OneDrive, Google Drive) included: choose
  it in Preferences > File Handling, with your projects moved there. If a project changed in the library since you
  opened it, from another device or window, saving keeps that version and saves yours beside it as a conflict copy.
- File > Video Frames to Layers opens a clip's frames (trimmed with From and To, every Nth if you like) as layers of a
  new document, with a frame animation in the Timeline; File > Export > Video (MP4) and Export GIF write it out. Video
  needs ffmpeg installed (brew install ffmpeg, winget install ffmpeg), or FORMVIS_FFMPEG pointing at it.
- Window > Timeline on a document without a timeline offers a video timeline or a frame animation (which starts with
  one frame of the document as it is). File > Create Video Timeline puts a timeline under the canvas, a track per layer: drag on the ruler to move through
  time (the canvas shows that moment), drag a clip to move it or its ends to trim it, and Split at Playhead cuts the
  selected layer's clip in two. The timecode and the frame rate and length are buttons; Video (MP4) exports it.
  Open a track (its arrow) for its keyframe lanes: turn on a lane's stopwatch, move the playhead, and type a value to
  key it there; the diamonds drag in time, and a right-click holds a value until the next keyframe. With a Position
  lane's stopwatch on, moving the layer with the Move tool or the arrow keys keys its new place at the playhead. Add Transition
  fades the selected clip in or out (Fade to picks transparent, black or white), or cross fades it with a clip
  overlapping it; Render (or File > Export > Render
  Video) writes MP4, GIF or a PNG sequence, all of it or a range, at full, half or quarter size. Agents connected to
  formvis's MCP server can do all of this too (the timeline_ tools), each change an ordinary undo step.
- On a touch screen, pinch to zoom, drag two fingers to pan and turn them to rotate the view; tap two fingers to undo
  and three to redo. One finger, or a pen with its pressure and tilt, works the tool.
- On a phone or a window under 720 pixels wide, the canvas takes the whole width; the buttons at the right of the
  title bar slide the tools, the panels or the properties over it (tap the canvas to close them), and the menu bar
  scrolls sideways.

## Layers

- Kinds: pixel layers, text, shapes, smart objects (their original kept, with filters that stay editable), fill
  layers, adjustment layers and groups (folders, which pass their contents through to what is below).
- Each layer has a blend mode (27 of them), opacity and fill, a layer mask, and layer styles (Drop Shadow,
  Outer and Inner Glow, Stroke, Inner Shadow, Satin, Bevel and Emboss, overlays).
- A clipping mask shows a layer only where the layer below it has pixels.
- File > Scripts holds housekeeping scripts, each one undoable step: Delete All Empty Layers (pixel layers
  with nothing visible and empty groups; the Background and adjustment, fill, type, shape and smart object layers, and
  artboards, stay; it says how many went), Flatten All Layer Effects (every layer style drawn into its layer's pixels;
  a type, shape or fill layer that has one is rasterized) and Flatten All Masks (every layer mask and vector mask
  applied into the pixels and removed). Layers to Files and Artboards to Files are in the same menu.
- The Layer menu arranges layers: Arrange > Bring to Front and Send to Back (Shift+Ctrl+] and
  Shift+Ctrl+[) and Reverse, Group from Layers and Ungroup Layers, Hide Layers, Delete > Delete Hidden Layers, Merge
  Down, Merge Visible (hidden layers stay) and Flatten Image; Layer > New > Layer via Copy and Layer via Cut (Ctrl+J,
  Shift+Ctrl+J) lift the selection to a new layer, and Layer from Background makes the Background an ordinary layer.
  Select > All Layers (Alt+Ctrl+A) and Deselect Layers choose layers.
- Layer > Link Layers links the selected layers so they move and transform together, each marked with a chain in the
  Layers panel; Select Linked Layers selects all of a link. Layer > Lock Layers (Ctrl+/) locks the transparency, the
  pixels, the position or all of every selected layer at once, or of every layer in a folder (Lock All Layers in
  Group); a lock in the Layers panel marks each locked layer.
- Edit > Transform Layer (Alt+Ctrl+T) shows the Move tool's handles. Edit > Transform's Scale and Rotate make every
  handle scale, or every handle and the space outside the box turn, until Enter or Escape; Skew, Distort and
  Perspective pull the corners and the middles of the sides (a side slides along itself in Skew, a
  corner and its partner move apart in Perspective), applied with Enter. Rotate 180° and the 90° turns turn the
  selected layers about their centre, and Again (Shift+Ctrl+T in the desktop app) repeats the last transform, on a
  copy with Alt+Shift+Ctrl+T.
- Layer > Layer Mask adds a mask revealing or hiding all, or the selection, or made from the layer's transparency;
  Layer > Mask All Objects finds the objects in the layer and adds a masked folder for each, for adjustments. Layer >
  Matting cleans the edges of a cut-out (Defringe, Remove Black or White Matte, Color Decontaminate), and Layer >
  Rasterize turns type, shapes, fill layers and smart objects into pixels, the selected ones or All Layers.
- Layer > New Fill Layer makes a Solid Color, Gradient or Pattern layer: a fill that covers the whole canvas however
  the layer is moved or the canvas changes, and stays editable. Layer > Layer Content Options, or a double-click on
  its thumbnail, changes the colour, the gradient (its style, angle, scale, Reverse, Dither and Align with Layer) or
  the pattern (its angle, scale and Link with Layer). It comes with a layer mask, made from the selection when there
  is one, and painting it paints the mask; Layer > Rasterize > Rasterize Fill Content turns it into pixels.
- Layer > Layer Style shows the Layer Style dialog at Blending Options or at any effect, turning that effect on. Bevel
  and Emboss is Smooth, Chisel Hard or Chisel Soft; inner, outer, emboss, pillow or on the layer's stroke (Stroke
  Emboss); with a Contour shaping its profile and a Texture pressing a pattern into it. Global Light sets the light
  that effects using it share; Create Layers turns a style into layers of their own that look the same; Hide All
  Effects hides every style until Show All Effects; Scale Effects scales a style's sizes and distances.
- Tools and commands work on every kind of layer they can: painting an adjustment layer paints its mask, as does painting a fill
  layer while its mask is the target; a text or shape layer, or a fill layer's own content, asks to be rasterized
  first.
- The Artboard tool (V cycles it with Move) makes artboards, folders that clip their contents to a size. Drag on
  empty canvas to make one; drag its handles to resize it and drag inside it to move it with its contents; the "+" beside
  it adds another. The options bar has size presets. In the Layers panel an artboard folder shows its own icon and size.
  PSD files keep artboards both ways. Limits: an artboard cannot be grown to the left or up, Shift and Alt do nothing
  while resizing, the contents jump to the new place when you release a move, and only artboards at the top level of a
  PSD are read.

## Selecting

- Marquee (rectangle, ellipse, single row and column), Lasso (freehand, polygonal, magnetic), Magic Wand, Quick
  Selection and Object Selection (hover to see the object it would take).
- Select > Subject finds the main subject; Select > Color Range selects by colour or by tone; Select > Sky selects the
  sky (its model downloads once, 176 MB); Select > Focus Area selects what is in focus, with a preview to set how much.
- Select and Mask refines an edge. Expand, Contract, Feather, Border, Smooth and Invert change a selection.
- Select > Reselect brings back the last selection dropped; Grow and Similar add pixels near the selected colours (the
  Magic Wand's Tolerance), touching the selection or anywhere; Transform Selection moves, scales or rotates the outline
  alone (Enter applies, Escape cancels); Convert to Shape makes a shape layer from it. Find Layers (Alt+Shift+Ctrl+F)
  selects layers by name, and Isolate Layers lists only the selected ones until chosen again.
- Select > Save Selection keeps the selection with the document as an alpha channel: a new one, or added to,
  subtracted from or intersected with one already there, in this document or another open one of the same size.
  Select > Load Selection brings one back, or the active layer's transparency or mask, inverted if you like, as the
  selection or combined with it. The Channels panel lists the alpha channels below the colour channels: the eye shows
  one over the picture in red, Ctrl-click (Cmd-click on a Mac) loads it (Shift adds, Alt subtracts, both intersect),
  a double-click renames it and the bin deletes it. They are saved with the project and follow the canvas when it is
  turned, flipped, cropped or resized.
- Edit > Stroke draws a band along the selection's edge (with none, around the layer's pixels), inside, centred on
  or outside it, in a colour, blend mode and opacity. Edit > Paste Special > Paste Into pastes as a new layer shown
  only inside the selection, through a mask that stays put when you move the picture; Paste Outside shows it only
  outside; Paste in Place puts it where it was copied from.

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
- Brush, Pencil and Eraser (including Background and Magic Eraser), with full brush settings: shape dynamics,
  scattering, colour dynamics, transfer, noise and wet edges. Brushes from .abr files can be imported, with their spacing.
- On very large pictures a stroke uses memory only around where it paints. The status bar shows how much memory
  formvis holds of what this computer allows it; work that would not fit is refused with a message, not lost.
- Clone Stamp (Sample: Current Layer, Current & Below or All Layers; Mode; Flow), Healing Brush, Spot Healing, Patch,
  Content-Aware Move and Red Eye.
- Window > Clone Source keeps five sources for the Clone Stamp and the Healing Brush. Pick a slot to
  make it the current source; each of the five slots remembers its own position, scale, angle and flips (Reset Transform clears them). The
  overlay shows the source on the canvas as you paint: Show, Opacity, Clipped (only inside the brush) and Auto Hide
  (hidden while you paint).
- Edit > Content-Aware Fill shows a dialog with Sampling Area, Show Result and Output To, and four adaptation
  controls that all start off: Color Adaptation (None, Default, High, Very High), Rotation Adaptation (None to Full),
  Scale and Mirror. With them off the fill is as fast as before. Colour adaptation makes the search about 8 times
  slower and the rotation and scale options about 20 times slower with colour, so use them on small holes. Transformed
  patches are sampled to the nearest pixel. The adaptation options are in the dialog only, not on the quick
  command or the agents' tools.
- Dodge and Burn (Range, Exposure, Protect Tones) and Sponge (Saturate or Desaturate, Flow, Vibrance).
- Blur and Sharpen (Mode and Sample All Layers; Sharpen's Protect Detail) and Smudge (Sample All Layers, Finger
  Painting), in the Smear tool with Liquify.
- Filter > Liquify has Forward Warp, Reconstruct, both Twirls, Pucker and Bloat, and Freeze Mask: paint over what
  must not move (shown in red) and every tool leaves it still; Thaw Mask frees it, Mask None clears the mask and
  Invert Mask swaps frozen and free. Find faces (the face finder downloads once, 232 KB) and the Face-Aware sliders
  reshape the largest face: eyes, nose, smile and mouth, forehead, chin and face width.
- Filter > Vanishing Point: click a surface's four corners in turn (top left, top right, bottom right, bottom left)
  to make a perspective plane, and drag them to fit. Paste puts another layer on the plane in perspective (drag it
  along; Paste size sets how much of the plane it covers); Stamp clones in perspective (Alt-click a source, then
  paint). OK applies it as one step.
- The Gradient Editor (click the gradient in the Gradient tool's options) has opacity stops above the bar and colour
  stops below it, each with a draggable midpoint between neighbours. `.grd` files keep the midpoints and the
  opacity stops both ways. Limit: a Gradient Fill layer and the stops read from a PSD fill layer keep their dense list
  of stops, without editable midpoints.
- Quick Shape (on by default for the Brush, Pencil and Eraser): end a stroke by holding still with the button down
  for about half a second, and a stroke that resembles a straight line, an ellipse or an upright rectangle is redrawn
  as that shape with the same brush, in the same undo step.
- Edit > Compare with... takes another document in your tabs and makes a new one holding both images and a
  Differences layer in Difference mode, with the regions that differ by more than the Threshold selected and counted.
- Window > Reference keeps reference images beside your work: Add or drop images, click one to see it bigger, scroll
  to zoom and drag to pan. They are kept for this session only.
- The History panel has a source column: mark a step in it and Edit > Fill with History paints from that step instead
  of the oldest; marking the oldest again clears it. This marker is separate from the History Brush's snapshot source.

## Brushes

- The Brush (B), Pencil, Eraser, Mixer Brush and the retouching brushes paint through one engine. Size and hardness
  are in the options bar, or by keys; right-drag resizes the brush on the canvas (Shift also sets hardness).
- Window > Brush Settings sets the tip: angle, roundness, spacing as a percentage of the diameter, then Shape
  Dynamics (size, angle and roundness varied by pen pressure, tilt, rotation or at random), Scattering, Texture,
  Dual Brush, Color Dynamics, Transfer, Noise and Wet Edges. A setting that is off leaves the stroke exactly as a plain
  round brush paints it.
- The Brushes panel lists presets and imports `.abr` files, whose sampled tips become brushes you can size
  and rotate like any other.
- A pen's pressure (and tilt and twist where the pen reports them) drives size and flow. A touch screen's force does
  the same, and so does a Force Touch trackpad's press on a Mac; a plain mouse paints at full pressure.
- Smoothing steers the stroke behind the pointer and catches up when you lift; Airbrush builds colour while you hold.
- A stroke stays inside the selection if there is one. It is one undo step, drawn live and kept to the area it touches, so a very large picture paints without
  holding a second copy of itself.

## Type, shapes and paths

- The Type tool adds editable text: point text or a paragraph in a box, horizontal or vertical, with font style,
  anti-aliasing, colour and warp. Type Mask tools make a selection in the shape of text.
- Shape tools draw rectangles, ellipses, triangles, polygons, stars, lines, arrows and custom shapes, as shape
  layers, paths or pixels, with a fill and a stroke; the stroke is solid, dashed or dotted, and inside, centred on or
  outside the shape's edge.
- The Markup tool (with Note and Count, I) marks a picture in one drag: an arrow, a callout pointing at something, a
  highlight, or a redaction box, each its own layer. Apply Redactions (its options, or Layer > Shape) burns the boxes
  into every layer beneath them, so what they hide is gone from layered files too.
- The Pen draws Bézier paths, or in Shape mode makes a shape layer from each path it closes; with Auto Add/Delete on,
  clicking a path adds a point and clicking a point deletes it. Path Selection and Direct Selection move and reshape
  paths, and a path can become a selection, be filled or be stroked.
- Layer > Combine Shapes joins the selected shape layers into one: Unite Shapes, Subtract Front Shape, Intersect Shape
  Areas or Exclude Overlapping Shapes, the front shapes keeping their outlines; on one shape layer it sets how its
  outlines after the first join. Merge Shape Components turns the result into plain outlines.
- Layer > New > Artboard... makes an artboard of the name, size and background you give; Artboard from Group... makes
  a folder an artboard over what it holds; Frame from Layers puts each selected layer in a frame of its size.

## Adjustments, filters and looks

- Adjustment layers change what is below them without changing its pixels: Levels, Curves, Hue/Saturation, Exposure,
  Brightness/Contrast, Vibrance, Color Balance, Black & White, Photo Filter, Channel Mixer, Invert, Posterize,
  Threshold, Selective Color, Gradient Map, Color Lookup (its own looks, including bleach bypass, cross process and
  faded film, or a .cube file), Develop (tone, colour and detail, with a vignette), Clarity (midtone local contrast),
  Dehaze, Texture (fine detail), Light (Brightness, Contrast, Highlights, Shadows, Whites and Blacks), Grain, Split
  Toning, Halation and Glow. Clarity, Dehaze, Texture and Light are small, maskable slices of Develop; Clarity and
  Texture scale their radius with the picture, so they look the same at any zoom. PSD has no matching layers, so
  a PSD export drops them as it does Develop.
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
  degrees without resampling a pixel, or by any angle with Arbitrary..., the canvas growing to hold it and the
  Background's new corners filled with the background colour. Image > Crop cuts the canvas to the selection's bounds;
  Image > Duplicate... makes a copy of the document in a new tab, in one layer with Duplicate Merged Layers Only.
- File > Automate > Fit Image... resamples the image, its proportions kept, to fit within a width and a height in
  pixels; Don't Enlarge leaves a smaller one as it is. Actions record it with its sizes, so a Batch fits every file it
  runs on.
- Image > Auto Tone, Auto Contrast and Auto Color set Levels from the layer's own histogram (from the selected part,
  within a selection): Auto Tone stretches each channel, Auto Contrast the three together so colours keep their
  balance, Auto Color each channel with neutral midtones. Image > Adjustments > Desaturate turns the layer grey,
  Equalize spreads its tones evenly from black to white, and Replace Color changes the colours you click in the
  picture (Shift-click adds one, Alt-click takes one away; Fuzziness sets how close counts) by Hue, Saturation and
  Lightness, or to the colour you pick as Result.
- Edit > Perspective Warp straightens or changes the perspective of what is in a picture. In Layout, drag to draw a
  plane over a surface (a wall, a road, a box side) and move its corners onto the surface's corners; draw more planes
  beside it, their corners snapping together. Then choose Warp in the options bar and move the corners: the picture
  follows each plane. Straighten verticals and Level horizontals do the common fixes at once. Enter applies, Escape
  cancels.
- Filter > Adaptive Wide Angle straightens a wide or fisheye picture. Click three or more points along something
  that should be straight (a horizon, a door frame) on the dialog's picture, add more lines with New line, and click
  Fit to lines: formvis finds the lens's field of view that straightens them and levels the first. Correction,
  Strength, Scale and Rotation can also be set by hand.

## Relight

Filter > Relight..., Layer > New > Relight Layer..., the Relight tool in the toolbar, or Relight typed in the command
palette adds a Relight layer above the active layer and lights everything beneath it with virtual lights, on this
computer, with no credits and no cloud. The original layers are not touched. Relight works on 8-bit RGB documents; in
other modes and depths its menu items are off, with the reason as their tooltip.

- Relight Properties opens at the top of the Properties column. Looks are ready-made setups (Soft Key, Rembrandt,
  Split, Rim, Butterfly, Golden Hour, Window Blinds, Window, Candlelight, Neon Club, Moonlight, Light Strip, Dappled
  Shade, Ring Light). Lights lists up to eight lights; the eye hides one, the bin deletes it, and Add Light adds one.
- Each light has a Type (Point, Spot, Sun, Area, Strip, Ring), a Temperature in Kelvin or any Color, Intensity,
  Softness (softer edges, shadows and highlights), Diffusion (how far the light wraps round forms) and Close to Far
  (near light falls off quickly; far light, like the sun, falls evenly).
- Pattern casts the light through a gobo: Blinds (Scale, Width, Slats, Opening), Light Strip (Length, Width), Window
  or Leaves, each with Feather, Rotation and Invert. The nine patterns are Blinds, Light Strip, Window, Leaves,
  Caustics, Lattice, Arch, Dapple and Circle.
- Scene sets how much of the photo's Original lighting is kept and how much Shine the lights add on glossy forms.
- On the canvas, drag a light's round handle to move it and its small target to aim it (Alt-drag also aims); with a pattern, Shift-drag places the pattern's centre (the
  ringed reticle, then draggable itself) apart from the aim, as the strip across her face while the light aims at her
  chest. Done
  (or Enter) renders the layer at full size; Cancel (or Escape) leaves things as they were.
- Edit Lighting, under the picture when a Relight layer is selected, reopens it; so do Layer > Edit Lighting...,
  Layer Content Options... and a double-click on the layer in the Layers panel.
- With Depth Anything V2 Small downloaded (Preferences > Plugins > Local models, about 99 MB), light follows the shapes in the photo and casts
  shadows. Without it the light falls on a flat picture (falloff and patterns only, no shadows); the panel says so and
  offers Download Depth Anything, after which it reads the shape and redraws. For real relighting, download it.
- Lights from depth and Lights to depth keep a light to a band of the picture's depth: raise Lights from depth to light
  only the nearer subject and leave the background as it was, or lower Lights to depth to light only the background.
- Scene also has Take out old light (how much of the photo's own light and shade is taken out before the new lights:
  0 keeps the photo as it is under them, as by default, and 100 takes all of it out to move a hard shadow), Ambient (the colour of the light
  that is kept) and Shadows (how dark cast shadows are).
- A light reaches what it is aimed at and fades on surfaces behind it: Close to Far sets how far it reaches and how
  high it stands. Patterns are projected onto the shape of the scene from the light, so blind slats wrap around an
  arm and curve over a face; they are sharp on what the light is aimed at and soften on surfaces far behind it. Diffusion adds a soft fill inside the pattern's frame.
- The + tile after the Looks saves the current lights as a Look of your own, kept in this browser; Alt-click a saved
  Look to delete it.
- Keys while editing: the arrow keys move the selected light (Shift for bigger steps, Alt moves its aim), Tab picks
  the next light, Enter is Done and Escape is Cancel.
- Agents and the command line: the `relight.apply` command takes a Look name or a list of lights and adds the layer
  without the panel, for example `./formvis cli run relight.apply look=rembrandt delight=40`.
- Old light (Scene): relighting is re-shading, so Relight first takes the photo's own light out and keeps the colour
  of its surfaces; Original lighting then sets how much of the old light stays (0 removes it). Take out, keep the
  subject builds a scene once per layer: the subject (from subject selection) and the background as two surfaces,
  their shape from MoGe-2 small when installed (`pip install -r backend/requirements_relight.txt`), else from Depth
  Anything; the photo's own light is read from how its brightness follows the subject's surface direction and divided
  out, so every detail of the face or object is the original's and only the light changes. Added light is matched to
  the subject's brightness, and each light is exposed for the point it aims at. Keep adds light on top of the old light.
  A light beside the subject also draws a rim along the subject's outline, glints follow the photo's own texture (pores,
  hair), and a pattern curves over the subject while it stays straight on the background behind.
  Take out with Marigold repaints the surfaces from a learned model and can change a face; it is an option only,
  downloaded from its own button, which names its licence (CreativeML Open RAIL++-M) and size (about 5.2 GB); the
  engine also needs `pip install -r backend/requirements_relight.txt`.
- The room (Scene section): the environment around the subject is relit and reshadowed too. Room light sets how much
  of the room's own light stays (it follows Original lighting until you move it), Light on room how strongly the lights
  reach it (0 to 200 percent), Room shadows how dark the subject's shadows fall on it, and Room depth how far it stands
  behind the subject (25 to 300 percent of the solved scene): nearer keeps patterns and shadows close to the subject.
- A light sits where its marker is, at the depth of the point it aims at; Close to Far brings it out toward the camera.
  Close is a side light that falls off fast across the subject, far is frontal and even. A Sun is always well up.
- The scene is solved in 3D (1.84.0): shadows are traced from several points on each light, so the subject casts a
  soft shadow onto the background that widens the farther the background is behind her, and patterns curve over the
  subject and stay straight on a flat wall.
- Relight works on 8-bit RGB documents. In PSD files and older builds a Relight layer is an ordinary pixel layer.

## Generating images

- Edit > Generative Fill paints a selection from a prompt, or removes what it covers with an empty prompt; Generative
  Expand grows the canvas and fills the new border; Image > Upscale enlarges two or four times. Upscale runs on fal, or
  on this computer with no key once Real-ESRGAN is downloaded (Preferences > Plugins > Local models, about 67 MB). The result is a new
  layer, masked to the selection.
- Edit > Generate Image makes a picture from a prompt alone, as a new layer at the document's size. Besides fal it
  works with OpenAI, Google, Black Forest Labs and Ideogram: choose one, paste its API key in the dialog once (it is
  kept in your system's password store, or read from the provider's usual environment variable), and generate.
  Generate Image, Generative Fill and Upscale open on fal when it has a key (it reaches the most models through one
  key), and on a model on this computer when it has none; a model you choose stays chosen.
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
- Edit > Color Settings (Shift+Ctrl+K, Shift+Cmd+K on a Mac) chooses the working RGB, CMYK and Gray profiles and what
  to do when a file's profile differs from the working one: Preserve it, Convert to the working profile, or Off
  (discard it). It also sets the rendering intent, black point compensation and dither used by conversions, shows
  LittleCMS as the colour engine, and reads out the chosen CMYK profile's total ink limit and black generation.
  Settings can be saved as presets.
- Convert to Profile lists RGB, CMYK, Gray and Lab destinations. 16-bit documents, any change of mode, Lab, and
  conversions with dither on are converted by LittleCMS in the engine at full precision, every layer in one step;
  the result is rounded to 16 bits once, with a small dither if you chose it, which is off by default so plain
  conversions stay exact. 8-bit RGB to RGB and CMYK to CMYK keep the faster table path. 32-bit documents convert
  between RGB spaces only.

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
  results. Image > Mode > 16 Bits/Channel keeps the document CMYK, and Export TIFF then writes 16-bit CMYK; proofing
  works as in RGB. Assign Profile shows the same inks through another press; Convert to Profile changes them to look
  the same on it, black text staying black only. The Channel Mixer mixes the inks themselves.

## Lab documents

- Image > Mode > Lab Color turns an 8-bit RGB document into CIE Lab (with the D50 white that PSD's Lab uses); RGB
  Color turns it back exactly. Painting, text, shapes, fills and filters work in it; the pixels they leave alone keep
  their Lab values. The Channels panel shows Lab, Lightness, a and b (a and b mid-grey where neutral), and Info reads
  L, a and b. Levels and Curves work on Lightness, a and b; the colour adjustments (Hue/Saturation, Black and White and
  the rest, Channel Mixer, Exposure and HDR Toning among them) give the same results as in RGB; blend modes look as they
  do in RGB; Export TIFF writes a Lab TIFF, at 16 bits when the document is (Image > Mode > 16 Bits/Channel keeps it
  Lab). Lab Color from a 16-bit document keeps its 16-bit values. Proofing works as in RGB. Click Lightness, a or b in
  the Channels panel to see it alone. Convert to Profile goes through RGB (Assign Profile opens it, Lab colours being
  absolute). Lab TIFF and PSD files open as Lab documents; layer styles work.

## 32-bit documents

- File > Automate > Merge to HDR merges exposures of one scene into a new 32-bit document (photos taken by hand are
  aligned; exposure times come from EXIF or are worked out from the photos). File > Automate > Photomerge stitches
  overlapping photos into a panorama (Auto or Reposition; transparent edges or cropped).
- Edit > Auto-Align Layers moves the other selected pixel layers to line up with the bottom-most one (Auto, Perspective,
  Reposition; Cylindrical runs as Perspective, Vignette Removal is not applied). Edit > Auto-Blend Layers adds layer
  masks that join the selected layers as a Panorama or keep the sharpest layer at each point (Stack Images), with
  Seamless Tones and Colors; each is one undo step.
- Radiance HDR, OpenEXR and 32-bit TIFF open as 32-bit documents, and Image > Mode > 32 Bits/Channel turns any RGB
  document into one. Their pixels are linear light and may be brighter than white; the canvas shows them with white and
  above as white. The Exposure adjustment works in linear light, as do moving, the canvas and image size commands and
  Gaussian Blur. File > Export > Radiance HDR and OpenEXR write them as they are; Export TIFF writes 32-bit float.
- Image > Mode > 16 or 8 Bits/Channel asks for HDR Toning (Exposure and Gamma): lower the exposure to keep highlights.
- Painting, the retouching tools and the other filters work at 32 bits too: what they leave alone keeps its light
  exactly, above white included, and what they change takes the new colour. Painting white over a highlight already
  brighter than white leaves it as it was. Groups, masks, clipping masks and layer styles work at 32 bits, and so does
  every blend mode: the 32-bit modes keep light above white, and the others blend in the visible range, light
  above white kept wherever one layer alone covers a pixel. Unsharp Mask and Add Noise keep light above white too.
  Convert to Profile converts linear light exactly between RGB profiles; proofing works as in other documents. Indexed
  Color, Bitmap, CMYK and Lab bring the document down first (HDR Toning asks how); Grayscale keeps 32 bits, taking
  each pixel's luminance in linear light. Every adjustment layer works at 32 bits: it changes a pixel's colour as it
  shows within the visible range, and light above white keeps its brightness.
- A multi-part OpenEXR file opens as a 32-bit document with one layer per part, named after the part. Limits: deep
  parts are not handled, and a file with more than 64 parts opens its first part only. The OpenEXR library runs in a
  contained child process of the engine.

## 16-bit documents

- A 16-bit PNG or TIFF opens as a 16-bit document, and Image > Mode > 16 Bits/Channel turns any RGB document into one.
  Its layers keep their 16 bits; Levels, Curves and Exposure adjustment layers work on them, as do moving, Flip
  Canvas, Canvas Size, Crop, Trim, Image Size, Gaussian Blur, Unsharp Mask and Add Noise (within a selection too),
  and the Brush, Pencil and Eraser; File > Export PNG and Export TIFF write 16 bits a channel; the project keeps them.
- What cannot keep 16 bits yet (the other painting and retouching tools, colour dynamics, the other filters and
  adjustments, Free Transform) is unavailable in a 16-bit
  document rather than dropping it to 8 bits quietly: Image > Mode > 8 Bits/Channel makes it available.

## Exporting

- File > Export As chooses the format (PNG, JPEG, WebP, AVIF, TIFF, DPX, QOI, PNM, TGA, ICO, PDF), quality, colour profile and size: a Scale in
  percent, Fit Within a width and height, or a Frame of exactly that size with the picture centred. Settings can be
  saved as presets. Export As also has a Canvas Size, a Metadata choice (Document File Info, None, or Copyright and
  Contact Info) and Sizes: tick several scales or sizes, each with a file name suffix, and one Export writes them all.
  Limits: Copyright and Contact Info puts the contact text in the creator field, not an IPTC contact block; AVIF, PDF,
  DPX, QOI, PNM, TGA and ICO carry no metadata; the notes the dialog assembles are in English in every language.
- File > Export > Save for Web (Legacy) compares the picture as it will be saved. 2-Up and 4-Up show the original and
  up to three variants side by side, each with its format settings, file size and download time; click a view to
  choose it. The PNG-8 format is a true 8-bit indexed PNG with a choice of colours, dither and transparency. Metadata runs from None to All, written as XMP. Cut the picture into slices first (Slice tool, C;
  Slice Select moves one, View > Show > Slice Options sets a name, URL, alt text and exact bounds) and each slice is
  saved as its own file. Limits: no pattern or noise dither and no web snap; the preview is a 100 percent crop, not a
  fit; the captions are in English. Image Assets on Save, in File > Export, regenerates the assets named by layers
  (a layer named "logo.png" or "icon.jpg" becomes that file) each time the document is saved.
- AI label: Made with AI or Edited with AI writes the standard machine-readable marking of AI content (IPTC's Digital
  Source Type) into PNG, JPEG and WebP. AVIF, TIFF and PDF do not carry it yet.
- DPX (the film scan format) opens like any picture and exports from File > Export As with a bit depth of 8, 10, 12
  or 16 and a transfer (printing density, linear or log); both are kept in presets. A 16-bit document exports at 16
  bits without rounding.
- QOI, the Netpbm family, TGA and Windows icons export from File > Export As, each with a Format options row (and, for
  ICO, the sizes). QOI is read and written as RGB or RGBA, with the sRGB or all-linear flag (the flag only labels the
  file; the numbers are kept as stored). PNM reads PBM, PGM and PPM in text and raw forms and PAM with GRAYSCALE, RGB
  and their alpha forms; it writes PPM (P6), PGM (P5), PBM (P4, thresholded at half brightness) and PAM (P7, choosing
  grayscale or colour and alpha from what the file holds). Transparency is laid on white in PBM, PGM and PPM. A PGM,
  PPM or PAM above 8 bits becomes a 16-bit document, and a 16-bit document goes out to PNM at 16 bits. TGA reads
  uncompressed and run-length colour-mapped, 8-bit grey, 15/16, 24 and 32-bit images from any corner, and writes 24 or
  32 bits, run-length or not. An ICO holding several sizes asks which one to take (the biggest, each size as a
  document, or every size as a layer); exporting an ICO resamples the document into each size you tick (16, 24, 32, 48,
  64, 128, 256), fitted in a square with transparent margins, as PNG for 256 and BMP for the smaller sizes or as PNG
  for all. QOI, TGA and ICO hold 8 bits, so a deeper document is written at 8 bits, said so.
- File > Export also writes PSD files (layers, masks, groups and more) and OpenRaster files for other painting
  programs. Adjustment layers have no OpenRaster form and are left out, said so.
- File > Export > Layers to Files writes every layer as its own image, at the document's size (or cut to its pixels
  with Trim Layers), with its layer style and mask applied, named prefix_NNNN_layername (the number counts from the top
  of the stack; characters a file name should not have become underscores). Choose the file name prefix, Visible Layers
  Only, the type (PNG, JPEG or WebP with a quality, TIFF, PSD) and Include ICC Profile. The desktop app writes the files
  into a folder you name inside its exports folder; the browser gives one zip. Artboards to Files does the same for each
  artboard, holding only what is inside it.
- File > Export > Artboards to PDF writes one multipage PDF, a page per artboard in the Layers order (top of the panel
  first), each page the artboard's contents at its own size in points from the document's resolution (72 dpi when none
  is set). Choose the file name, Encoding (Lossless, or JPEG with a quality) and Contents Only (leaves out each
  artboard's background colour). Include ICC Profile is shown but not yet carried by the PDF writer; page labels with
  the artboard names are not written.
- File > File Info (Alt+Shift+Ctrl+I) holds the document's metadata: Document Title, Author, Author Title, Description,
  Rating (0 to 5 stars), Description Writer, Keywords (separated by commas or semicolons), Copyright Status (Unknown,
  Copyrighted, Public Domain), Copyright Notice and Copyright Info URL. For a photo with Exif it also shows the camera's
  record (make, model, lens, exposure, aperture, ISO, focal length, date taken) read only, and the Created and Modified
  dates. OK is one step in History called File Info. The fields are saved in the project, and Copyrighted puts the
  copyright symbol before the title in the document tab. They are written as standard XMP into PNG, JPEG, TIFF, WebP and
  PSD files (Export As and the Export menu), and read back when such a file is opened. Agents set
  them with the `file-info` command and parameters (title, author, author_title, description, rating,
  description_writer, keywords, copyright_status, copyright_notice, copyright_url), no dialog needed.

## The assistant and outside agents

- Window > Assistant is a chat beside the canvas that edits the open document: add and change layers, select, fill,
  add adjustments, place images, undo, and generate. Each command it runs is its own row with its status and an Undo
  for that step; Plan first shows a numbered plan, which you run or cancel before anything changes. The model is told
  to use formvis's own commands, and the row names come from the command labels. Undo This Turn takes back everything
  since your last message. It uses the language model set in Preferences > Plugins; a local model needs to support
  tool calling.
- Outside agents (Claude Code, Codex, Cursor): ask them in plain language to edit what is open in formvis. In the
  formvis folder, `./formvis agents install` sets all three up for your account (the MCP server and the editing skill);
  inside the formvis repository they are already set up. formvis starts itself when an agent asks, opens a window if
  none is open, and asks you once to allow outside agents. They get 56 tools, from opening, saving and exporting files
  to layers, text, selections, filters, the video timeline and generative fill, which uses the models on this computer
  first.
- Either way, every change is an undoable step, anything that costs money asks you first, your keys are never shown,
  and only this computer can connect.

## Terminal

- Window > Terminal opens a terminal dock along the foot of the window (Ctrl+J, Cmd+J on a Mac, when no layer is open
  or the dock has focus; with a layer open, Ctrl+J is Layer via Copy); the same key in the dock or the
  hide button closes it, and the shells keep running while it is hidden. Drag the grip above it to resize; its
  height and whether it is open are remembered, and the window opens as you left it without moving.
- Each tab is a shell started in the formvis folder by the engine on this computer, with formvis's own command
  (`./formvis`) first on the path. The plus button (or Window > New Terminal) opens another tab, the restart button
  starts a tab's shell again, and the cross on a tab ends it.
- Only the formvis window on this computer can attach to a terminal; nothing else can read or type into one.
- Window > Claude Code opens a panel that runs it, if it is installed here and signed in, on the open document: type
  a request, and it edits layers, selections and text through the same tools outside agents use. Choose Ask (each
  request that could change something waits for Allow or Deny), Auto-accept edits, or Plan (it proposes, you decide);
  Stop ends the turn. Its shell commands appear in a read-only tab of the terminal dock. Install it or sign in from
  any terminal tab; the panel says which is missing.

## Agents

- Window > Agent Connect is where you decide what outside agents (any client that speaks MCP) may do. The master
  switch turns all of them off or on; each agent that has called formvis gets a row with its own policy: Allow, Ask (the default: a step that writes a file or that undo could not reverse waits in the panel
  for Approve or Deny, and times out after two minutes) or Deny.
- The activity feed lists what each agent did, newest first. Follow Agent moves the view to the layer or selection a step
  touched, so you watch the edit happen. Stop cancels what the agent is doing and refuses its next steps until you
  allow it again.
- Agents see formvis through the same picture tools the assistant has and through the command catalogue (see The
  command line). `./formvis agents install` gives all three clients the skills that teach them both:
  `formvis-driving` for editing pictures and `formvis-colour-science` for profile, intent, CMYK and Lab questions.

## The command line

- Everything the menus, tool rail and options bar can do is a command with an id. `./formvis cli list [text]` finds
  commands (`--group Filter` narrows by menu), `./formvis cli describe <id>` says what one does and what it takes,
  and `./formvis cli run <id> key=value ...` runs it in the open window as an undoable step. A command whose result
  undo cannot reverse (a file overwritten, say) runs only with `--yes`.
- The window has to be open (`./formvis boot`) and outside agents allowed (Preferences > Plugins). Exact actions take
  values: `filter.apply kind=gaussianBlur radius=8`, `adjust.apply kind=levels`, `select.rect x=0 y=0 width=200
  height=100`, `layer.set opacity=0.5`, and `paint.stroke` along a list of points.
- The same list is what agents read with `list_commands` and `describe_command` and run with `run_command` and
  `run_commands`; a list of commands is a single undo step.
- `./formvis counts --commands` prints how many commands the catalogue holds and any that lack a description.

## Script Console

- Window > Script Console opens a log and a box to type JavaScript in. Enter runs it, Shift+Enter adds a line, and
  Up and Down walk earlier lines. The text runs as the body of an async function, so `await` works. In scope are
  `formvis.run(id, args)`, which runs a command from the catalogue; `formvis.commands()`, the list of commands;
  `formvis.api`, the plugin API (the same reach as a plugin: formvis's tools, each change undoable); and
  `formvis.log(...)`, which writes a line to the console's log.
- It has no wider reach than a plugin: it cannot read your keys or files. It is refused while an outside agent's
  request is being worked on, though a connected agent that is idle is not detected.

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

## Interface languages

- Preferences > Language chooses the interface language from 26: English (the default), Spanish, Mexican Spanish,
  Brazilian Portuguese, French, Canadian French, German, Italian, Dutch, Danish, Finnish, Norwegian Bokmål, Swedish,
  Russian, Polish, Czech, Hungarian, Ukrainian, Turkish, Simplified and Traditional Chinese, Japanese, Korean,
  Indonesian, Thai and Vietnamese. Each is named in its own language in the list.
- The interface switches in place, with no restart, and the saved choice is used from the next start before anything
  shows. Menus, panel names, dialog titles, buttons and fields, tool names, options bar labels, tooltips, the status
  bar, filter and adjustment names and Preferences sections are translated.
- Your own words are never translated: layer, document, channel, path, preset, style and comp names, text in type
  layers and anything you type into a field stay as you wrote them.
- A string that has no translation yet shows in English; Mexican Spanish and Canadian French change only the words that
  differ and use Spanish and French for the rest. Spelling check (Layer > Type) follows the language only for
  English, Spanish and Italian.
- The manual, the Help window's search and the assistant's replies stay in English.

## Keyboard shortcuts

- Help > Keyboard Shortcuts lists every shortcut. Most are the industry-standard ones: tools by their letters, and Ctrl (Cmd on a
  Mac) with Z to undo, with S to save, with J for Layer via Copy, and with a comma for Preferences. Edit > Toggle
  Last State (Alt+Ctrl+Z) undoes the last step, or brings back the one just undone.
- Edit > Search (Ctrl+K) finds a command or a tool from a few letters of its name, in order (gblur for Gaussian
  Blur), showing where each sits in the menus and its keys; the arrow keys choose one and Enter runs it.

## When something goes wrong

- "The formvis engine is offline": start it with `./formvis boot`, or `./formvis doctor` to check the installation.
- Help > Copy Error Log copies what went wrong, to paste into a report.
- A generative tool that cannot run says why: no key set, the service not answering, or a model's safety filter.
- A language model or ComfyUI that does not answer: check its address with Check in Preferences > Plugins.

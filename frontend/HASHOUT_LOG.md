# frontend HASHOUT_LOG

Living log for the frontend side, _v0.1.0. Read the map and the TOC first; entries are anchored by file and symbol, and removed code is quoted in full.

## Fade, Last Filter and Spin Blur · _v1.64.4 (engine/fade.ts, engine/filters-lib/gallery.ts and ui/panels/fade-dialog.ts new; engine/history.ts, engine/index.ts, engine/filter-library.ts, ui/panels/filter-panel.ts, app.ts)

DEV_PLAN 27.4, first part. Edit > Fade (Shift+Mod+F): `History.last` gives the newest kept step, and `Engine.fadeStep` accepts it while it is still the document's state (its `afterRev` is the revision) and changed only the active layer's own pixels: every patch on that layer's raster and none paged to disk or streamed, the layer list the same length, and the raster either the same object, patched in place, or replaced by one at the same pixel scale with no rotation or flip (a filter that grew the layer); 8-bit RGB documents, pixels rather than a mask. `fadeSource` rebuilds the pixels before the step at the layer's present size: a replaced raster is drawn at its offset (the grown margin transparent); otherwise each patch's `before` is written back over the present pixels, newest first, so the oldest wins where they overlap. `fadeImages` mixes before and after in premultiplied alpha by the opacity; for another mode it first blends the step's result over the before as the Layers panel would (the canvas's operation for its 17 modes, `blendPixels` for the other 10) and mixes toward that, and Dissolve keeps a pixel of the result with a chance equal to the opacity. The Fade dialog shows Opacity, Mode and Preview, previews through `previewImageEdit` with the before scaled once to the preview's size, and OK applies through `applyImageEdit` as one step named "Fade" and the step's name; the Edit menu's label names the step too. Filter > Last Filter: the Filter panel keeps the last kind and settings it applied (`last`, set by `commit` and `applySettings`, so dialogs, filters without one, actions and agents all count), and `applyLast` applies them again with a fresh seed, so filters that draw on chance give a new pattern while their own parameters repeat (Wave's or Tree's seed among them); the command shows the filter's name at the top of the Filter menu and is bound to Mod+F, Photoshop's long-standing key. Alt+Mod+F, Photoshop's present key, was tried first: the Keyboard Shortcuts test binds Flatten to it as a free key, so it failed there, and the test is left as it is. Spin Blur: inside an ellipse placed in percent of the frame's area, sized in percent of its shorter side and turned by its Rotation, each pixel becomes the premultiplied mean of bilinear samples along the ellipse's own arc through it (about one a pixel of arc, 3 to 240), at full strength inside and fading to nothing a tenth of the radius beyond the rim; one spin set by sliders, where Photoshop places several on the canvas. `LibGroup` gains 'Blur Gallery', whose submenu is listed by hand, Spin Blur after Path Blur.

Verified by scratch probes outside the repository. Spin Blur: a Blur Angle of 0 and a flat picture change nothing, nothing outside the ellipse changes, on a one-pixel white line, at radius 30 with Blur Angle 90 the value is 5 on the line and at 30 degrees, and 0 at 60 and 90 (an arc of 45 degrees each way), alpha stays 255, and inside a left-half frame nothing on the right changes; agents applied it. Fade: after Box Blur in a selection the label reads "Fade Box Blur...", the dialog previews, Opacity 0 gives the before exactly and 100 the after exactly, 50 the alpha-weighted average within 1.5 levels where at least half opaque (canvas storage rounds low alpha further), Multiply at 100 within 1 level of before times after over 255, Linear Burn exact; after a Gaussian Blur that grew the layer from 200 by 150 to 238 by 188, Fade at 0 gives the original pixels in place and a transparent margin; undoing the fade returns the blurred result; Fade is disabled after New Layer and offered after a fill. Last Filter: it shows "Box Blur" after Box Blur, and applying it gives the same pixels as Box Blur twice by hand, byte for byte; after Clouds it reads "Clouds"; Mod+F repeated Sharpen and Shift+Mod+F opened Fade. Menus: the Filter menu begins with the last filter's name and a separator, Blur Gallery ends with Spin Blur..., Edit has Fade... after Redo. Zero flash, under 6x CPU and network throttling after a hard reload: Fade opened with its box the same in every frame, its slider and number changed no nodes and choosing Screen changed only the dropdown's label; Spin Blur opened (362 pixels). tsc, the build, 194 unit tests; 112 engine tests passed, 3 failing on this machine (no EXR codec; LaMa not downloaded; the SAM device read as onnx); 88 browser tests across the 1.64.3 suites and the shortcut editor, fill and history fill suites: 78 passed, 3 skipped, 7 failing as at 1.64.2, the same way on v1.64.1 or for this machine.

Noted: after undoing a step, Fade offers the step before it while that is the document's state; Last Filter covers the Filter dialog's filters, not Liquify or the workspaces. Removed lines taken after the version edit. Removed from frontend:

```text
  "version": "1.64.3",
      "version": "1.64.3",
  "version": "1.64.3",
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', 'clear', '-',
    { label: 'Filter', items: ['filter-develop', 'filter-wide-angle', 'filter-lensCorrection', 'filter-liquify', 'filter-vanishing-point', 'filter-neural', '-',
      { label: 'Blur Gallery', items: ['filter-fieldBlur', 'filter-irisBlur', 'filter-tiltShift', 'filter-pathBlur'] },
export type LibGroup = 'Blur' | 'Sharpen' | 'Noise' | 'Other' | 'Video' | 'Distort' | 'Pixelate' | 'Stylize' | 'Render';
export const LIBRARY: readonly LibFilter[] = [...BLUR_FILTERS, ...SHARPEN_FILTERS, ...NOISE_FILTERS, ...OTHER_FILTERS, ...VIDEO_FILTERS, ...DISTORT_FILTERS, ...PIXELATE_FILTERS, ...STYLIZE_FILTERS, ...RENDER_FILTERS, ...DRAWN_FILTERS];
export const VERSION = '1.64.3';
```

## Flame, Picture Frame and Tree; Render on empty layers · _v1.64.3 (engine/filters-lib/drawn.ts new; engine/filter-library.ts, filters-lib/render.ts, engine/index.ts, ui/panels/filter-panel.ts, app.ts)

DEV_PLAN 27.3 closed: Flame, Picture Frame and Tree, each a drawing built from marks: round-ended strokes whose radius runs from one end to the other (a dot where the ends meet), their edges softened, each in a colour with an opacity, painted in order on a clear sheet and laid over the layer in straight alpha (`paint`). Each drawing is built in document pixels and mapped into the pixels of the image the run receives (`drawn`): the frame now carries the document's size (`LibFrame.doc`, `LibContext.doc`, from `Engine.filterFrame`), so sizes, the tree's branching and the flame's noise follow the document, and a reduced preview is the same drawing scaled rather than another tree. Tree and Picture Frame fit the selection's bounds or the canvas (the frame's area), as the earlier Render filters place themselves; Flame follows a path. A `path` parameter kind joins the library (`LibPath`: the path's name, the document's size when taken, and each subpath sampled about 2 pixels a step in document pixels, to 0.01 pixel, at most 256 subpaths, a coarser step past 300,000 numbers), held by `libValues` (`sanePath`). The dialog's Path row lists "None" and the document's paths and starts on the path selected in the Paths panel, taken by `Engine.pathLines` each time the dialog opens; the choice goes into the settings, so an action replays along the same path after the path is deleted and a smart filter keeps it; agents name a path (`completed` resolves the name; a name the document lacks is refused with the reason, in `missingImage`). With no path the flame follows an arc low in the area, Candle Light starts from a point in it. Picture Frame draws sixteen designs of its own (a vine with flowers, a vine, a leaf garland, a flower border, berries, a ribbon, waves, a zigzag, dots, rope, scallops, lines, stars, hearts, snowflakes and bamboo) and Tree nineteen kinds, grown by form (broad crowns branch, conifers tier, columns rise narrow, palms fan, bamboo stands in canes, shrubs spread low, weeping crowns hang). The Render submenu lists Flame, Picture Frame and Tree first, then a separator, as Photoshop's does (`drawnFirst`). Filters that draw their own pixels (`LibFilter.fills`: Clouds, Fibers and the three) now work on an empty layer, as in Photoshop: their commands are enabled on an empty pixel layer in an 8-bit RGB document (`Engine.canGivePixels`), and opening the dialog or applying the settings first gives the layer a transparent canvas-sized raster (`Engine.givePixels`, outside history, so undo leaves the layer empty); filters that change what is there stay disabled, Difference Clouds, Lens Flare and Lighting Effects among them. Chance comes from the positional hash (`hash01`) keyed by the seed; counts that could grow without bound (flames along a path, frame ornaments, branches) are capped. Found while reading the band code for this release: 1.64.2 had put `bandFrame` between `bandedFilter` and its doc comment, which then described the wrong method; `bandFrame` now sits above the comment, and keeps the frame's document size.

Verified by scratch probes outside the repository. Against references: a tree on an empty 400 by 300 image covers 25,649 pixels, the same seed gives the same tree and another a different one, all 19 kinds draw, leaves at 0 and 100 cover 13,498 and 28,592 pixels, inside a left-half area nothing is drawn outside it, and its half-scale preview correlates 0.996 with the full result; all 16 frames draw and leave the middle empty, Margin 0, 4 and 20 put the frame 21, 32 and 79 pixels in, Fade at 100 over three lines lowers the frame's summed alpha from 4,178,606 to 3,243,012; Flame with no path draws within rows 64 to 269, along a vertical line at x 20 within x 0 to 41, multiple flames rise above a horizontal path, all six types draw, a custom blue raises the blue-to-red ratio from 0.16 to 3.3; over an opaque picture alpha stays 255 and untouched pixels stay; at 12 megapixels Tree takes 553 ms, Picture Frame 414 ms, Flame at full complexity 3.1 seconds and flames every 10 pixels along an arc 2.0 seconds. In the app: the Render submenu reads Flame, Picture Frame, Tree, a separator, then the other five; each of the three opens its dialog (20, 11 and 15 rows) and makes one step that undoes exactly; the Path row offers only None with no paths, and with a Work Path and Path 1 starts on the selected Work Path, a flame along it lying within x 38 to 81 of the line at 60, multiple flames along Path 1 rising above it; an action of Tree after Randomize, Picture Frame with Flower Border and Flame along the Work Path, undone and with the path deleted, replayed through the Actions window equal byte for byte; a Tree smart filter keeps its 15 values; in a 16-bit document each of the three is one step changing its channels; on an empty layer Clouds, Fibers, Flame, Picture Frame and Tree are enabled and Difference Clouds, Lens Flare, Lighting Effects, Box Blur and Gaussian Blur are not, Clouds fills all 120,000 pixels and undo leaves the layer empty, and Tree draws from its dialog; agents drew all three on a layer just added, Flame along a path named "Wick", and were refused a path the document lacks. The 1.64.2 checks rerun on this code: all 38 bandable filters banded equal to whole, the Stylize and Render references, the 17 Stylize and Render commands, the action replay, smart filters and 16-bit documents. Zero flash, under 6x CPU and network throttling after a hard reload: Flame (836 pixels, inside the 900-pixel window, its body scrolling), Tree and Picture Frame opened with their boxes the same in every frame; a path added between two Flame dialogs added its option before the dialog showed; the colour, the sliders and choosing None changed only the dropdown's label; opening Tree on an empty layer changed nothing outside the dialog beyond what opening it on a filled layer changes (the scrim and the dropdown's popup); the only layout shift the status bar's known 0.0008. tsc, the build, 194 unit tests; 112 engine tests passed, 3 failing on this machine (no EXR codec; LaMa not downloaded; the SAM device read as onnx); 81 browser tests across the 1.64.2 suites and the path and layer dialog suites: 71 passed, 3 skipped, 7 failing as at 1.64.2, on v1.64.1 the same way or for this machine.

Noted: Picture Frame's sixteen designs and Tree's nineteen kinds are formvis's own, not Photoshop's 47 frames or its tree list; the dialogs show Photoshop's Basic and Advanced tabs as one list; empty layers take these filters in 8-bit RGB documents only; a Flame smart filter places its path in the smart object's own pixels. Removed lines taken after the version edit. Removed from frontend:

```text
  "version": "1.64.2",
      "version": "1.64.2",
  "version": "1.64.2",
    ...LIBRARY.map((f) => ({ id: `filter-${f.id}`, label: libHasDialog(f.id) ? `${f.label}...` : f.label, enabled: hasTargetPixels, run: () => {
      { label: 'Render', items: filterGroup('Render', []) },
  'clouds', 'differenceClouds', 'fibers', 'lensFlare', 'lightingEffects',
export type LibValue = number | string | boolean | number[] | LibImage | null;
export interface LibFrame { readonly area: Rect; readonly canvas: Rect }
  | { readonly key: string; readonly label: string; readonly kind: 'image'; readonly def: null };
export interface LibContext { readonly scale: number; readonly seed: number; readonly area: Rect; readonly canvas: Rect; readonly fg: LibColor; readonly bg: LibColor }
export const LIBRARY: readonly LibFilter[] = [...BLUR_FILTERS, ...SHARPEN_FILTERS, ...NOISE_FILTERS, ...OTHER_FILTERS, ...VIDEO_FILTERS, ...DISTORT_FILTERS, ...PIXELATE_FILTERS, ...STYLIZE_FILTERS, ...RENDER_FILTERS];
  return libFilter(kind).run(src, libValues(kind, stored), { scale, seed, area: frame?.area ?? whole, canvas: frame?.canvas ?? whole, fg: c.fg, bg: c.bg });
    id: 'clouds', label: 'Clouds', group: 'Render', params: [], grows: false, reach: () => 0,
    id: 'fibers', label: 'Fibers', group: 'Render', grows: false, reach: () => 0,
import type { LibFrame, LibImage } from './filter-library';
    return { area: p.selection ? local(p.selection.rect) : canvas, canvas };
  private bandFrame(f: LibFrame, dy: number): LibFrame {
    return { area: { ...f.area, y: f.area.y - dy }, canvas: { ...f.canvas, y: f.canvas.y - dy } };
  }

import { LIBRARY, isLibKind, libAllDefaults, libApron, libFilter, libImageParams, libMargin, libValues, runLib, type LibColors, type LibFrame, type LibImage, type LibKind, type LibParam, type LibValue, type LibValues } from '../../engine/filter-library';
      kept = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    return !!gap;
export const VERSION = '1.64.2';
```

## Stylize and Render; frames for bands · _v1.64.2 (engine/filters-lib/stylize.ts and render.ts new; engine/filter-library.ts, filters-lib/pixelate.ts, noise.ts, video.ts, engine/index.ts, ui/panels/filter-panel.ts, app.ts)

DEV_PLAN 27.3, first part: the nine Stylize filters (Diffuse, Emboss, Extrude, Find Edges, Oil Paint, Solarize, Tiles, Trace Contour, Wind) and five of Render's (Clouds, Difference Clouds, Fibers, Lens Flare, Lighting Effects). Emboss embosses each channel as 128 plus Amount times the difference across the light's direction, so at 135 degrees a raised shape's upper-left edges are light and edges keep a trace of their colour, as Photoshop's do. Oil Paint smooths the colours (Cleanliness), smears them along the picture's edges for a stroke set by Stylization and Scale (a flow traced from the smoothed structure tensor) and, lit, shades the paint's relief, grooved along the strokes by Bristle Detail; Clouds is fractal value noise between the two colours; Lighting Effects lights each pixel by its angle to a spot, point or infinite light, with ambience, gloss, metallic highlights, exposure and a texture channel raised as relief. A `color` parameter kind joins the library for Lighting Effects' light (`colorRow`; `libValues` keeps lower-case `#rrggbb`, else the default). Clouds and Fibers place their pattern by the canvas (coordinates from the frame's canvas origin, divided by the scale; Clouds' feature size the canvas's longer side over 4), so a moved layer, a band and a scaled preview show the same pattern; Lens Flare and Lighting Effects place theirs by the frame's area, as Distort does. Filters that draw on chance hash positions relative to the canvas's origin (Diffuse, Oil Paint's bristles, Wind; Mezzotint since 1.64.1), so their result does not depend on which pixels a run receives. That made the frame worth giving to bands too: `bandedFilter`, `bandedFilterTiled` and `bandedGrow` make the layer's frame once and hand each band its own (`bandFrame`, moved up by the band's first row), and filters that ran whole only because of their position now declare a reach and run in bands on large layers: Color Halftone (three times the largest dot, a neighbouring cell's dot reaching in and that cell's mean read across it), Crystallize (two cells), Mosaic (one cell), Pointillize (two cells), Mezzotint (0), De-Interlace (2), Reduce Noise with Remove JPEG Artifact (40, its grid following the band's canvas origin), and 12 of the 14 new filters; Extrude and Tiles stay whole (a block's or a tile's shift reaches as far as its size). Oil Paint's reach (`oilReach`) adds the stroke's length, three sigmas of the structure tensor's and of the cleanliness Gaussians, and the relief's neighbours; banded at full scale it equals the whole run at the extremes of its settings. Commands for filters without a dialog now pass a fresh seed (`randomSeed`; 0 before), so Clouds and Difference Clouds give a new pattern each time, as in Photoshop, and the seed is in what an action and a smart filter keep, so both repeat it. A comment on a line this release changed (`applySettings`'s giant-layer branch, "a giant layer (1.62.7)") moved here.

Verified by scratch probes outside the repository. Each kernel against a reference: Diffuse keeps a flat picture and gives every pixel a colour from its 3 by 3 neighbourhood, Darken Only lowers the mean (128.3 to 119.6), Anisotropic lowers noise (deviation 17.1 to 15.9); Emboss turns flat colour to 128, a light square's upper-left edge to 255 and its lower-right edge to 0 at 135 degrees; Extrude changes the picture as blocks and as pyramids and nothing outside its frame; Find Edges gives white for flat colour and 0 on both sides of a step; Oil Paint lowers deviation from 17.1 to 4.6, keeps alpha and, unlit, keeps a flat colour; Solarize maps 200 to 55 and keeps 80; Tiles leaves 452 of 6,400 pixels as background in its gaps; Trace Contour draws one line, where the ramp passes 128; Wind from the left streaks a bar's edge downwind (675) and nothing upwind (0); Clouds is opaque, mean 141, deviation 49.8, the same seed the same and another different, Difference Clouds over the same clouds 0 everywhere, a half-scale preview correlating 0.99 with the full result; Fibers is opaque with strands up and down (column differences 46,142 against row differences 320,897); Lens Flare is 255 at its centre and leaves a far corner at 40, the picture's own; Lighting Effects' spot gives 187 at its target and 68 far off, a point light 255 under it and 74 away; a colour that is not `#rrggbb` falls back to white. In the app: all 14 commands with their labels, dialogs and fields, each one step that changes the picture and undoes exactly; an action of Emboss at 45 degrees, Clouds, Fibers after Randomize and Lighting Effects with an orange light, undone and replayed through the Actions window, equal byte for byte; on a smart object Clouds and Lens Flare became smart filters keeping their seed and swatches; in a 16-bit document Clouds, Emboss, Oil Paint and Lighting Effects each one step changing its channels; all 38 filters that now declare a reach, run in bands on a 300 by 1100 layer, equal to whole byte for byte (Custom's identity default leaves no step in bands, as the banded path has done since 1.60.9 when nothing changes); agents applied all 14 by name, and Diffuse in each mode. Zero flash, under 6x CPU and network throttling after a hard reload: Lighting Effects (the longest dialog, 775 pixels, inside the 900-pixel window with no inner scroll), Oil Paint and Extrude opened with their boxes the same in every frame; the colour, the sliders and Oil Paint's Lighting check changed no nodes; the only layout shift the status bar's known 0.0008. tsc, the build, 194 unit tests; 112 engine tests passed, 3 failing on this machine (no EXR codec; LaMa not downloaded; the SAM device read as onnx); 72 browser tests across filters, offered options, menus, panel and native menus, smart and linked smart objects, MCP agents, agent editing, the Blur Gallery, Develop, Camera Raw, adjustments, large documents, Liquify, Shake Reduction, 16-bit documents, the tiled filter, and the flash, layout-shift and layout checks: 62 passed, 3 skipped, 7 failing on v1.64.1 the same way or for this machine (OpenEXR export and the 32-bit EXR, no codec; Image > Mode's list; generative fill without LaMa; the 16-bit test expecting painting refused; the tiled filter expecting a 120 MP document tiled; the 0.0008 shift).

Noted: Diffuse, Tiles, Wind and Extrude, like Crystallize, take the dialog's random seed, so each run, an action's replay included, gives another pattern; Lens Flare's centre and Lighting Effects' light are sliders in percent, not points placed in a preview; Lighting Effects has one light. Removed lines taken after the version edit. Removed from frontend:

```text
  "version": "1.64.1",
      "version": "1.64.1",
  "version": "1.64.1",
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, SelectionMask, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData, runFilterOffThread, addPattern, allPatterns, patternById, projectPatterns } from './engine';
      const settings = { lib: { [f.id]: libDefaults(f.id) }, seed: 0 };
export type LibGroup = 'Blur' | 'Sharpen' | 'Noise' | 'Other' | 'Video' | 'Distort' | 'Pixelate';
export const LIBRARY: readonly LibFilter[] = [...BLUR_FILTERS, ...SHARPEN_FILTERS, ...NOISE_FILTERS, ...OTHER_FILTERS, ...VIDEO_FILTERS, ...DISTORT_FILTERS, ...PIXELATE_FILTERS];
    reach: (v) => (v.jpeg === true ? null : 40),
    id: 'colorHalftone', label: 'Color Halftone', group: 'Pixelate', grows: false, reach: null,
    id: 'crystallize', label: 'Crystallize', group: 'Pixelate', grows: false, reach: null,
    id: 'mezzotint', label: 'Mezzotint', group: 'Pixelate', grows: false, reach: null,
    id: 'mosaic', label: 'Mosaic', group: 'Pixelate', grows: false, reach: null,
    id: 'pointillize', label: 'Pointillize', group: 'Pixelate', grows: false, reach: null,
    reach: null,
  bandedFilter(name: string, run: (src: ImageData) => ImageData, apron: number, grow = 0): boolean | 'refused' {
    const sel = p.selection, m = sel ? mul(invert(placement(l.transform, W, H)), translation(sel.x, sel.y)) : null;
        const out = run(src);
  async bandedFilterTiled(name: string, run: (src: ImageData) => ImageData, apron: number): Promise<boolean | 'refused'> {
        const y1 = Math.min(H, y0 + B), h = y1 - y0, out = run(src.img), a0 = src.a0;
  private bandedGrow(name: string, run: (src: ImageData) => ImageData, apron: number, grow: number, p: Project, l: Layer): boolean | 'refused' {
    const big = new Raster(Wb, Hb);
      const out = run(c.getImageData(0, 0, Wb, a1 - a0));
import { checkRow, matrixRow, selectRow, sliderRow, type Row } from './controls';
      const r = await this.engine.bandedFilterTiled(FILTER_LABELS[kind], (src) => sync(src, 1), apron);
    const banded = apron !== null ? this.engine.bandedFilter(FILTER_LABELS[kind], (src) => sync(src, 1), apron, filterMargin(kind, s)) : false;
    if (apron !== null && this.engine.activeTiled()) { void this.engine.bandedFilterTiled(FILTER_LABELS[kind], (src) => run(src, 1), apron); return true; }   // a giant layer (1.62.7)
    const banded = apron !== null ? this.engine.bandedFilter(FILTER_LABELS[kind], (src) => run(src, 1), apron, this.grow()) : false;
export const VERSION = '1.64.1';
```

## Distort and Pixelate; the filter's frame · _v1.64.1 (engine/filters-lib/distort.ts and pixelate.ts new; engine/filter-library.ts, filters-lib/shared.ts, other.ts, video.ts, noise.ts, engine/filter-jobs.ts, filter-worker.ts, engine/index.ts, ui/panels/filter-panel.ts, app.ts)

DEV_PLAN 27.2: nine Distort filters (Displace, Pinch, Polar Coordinates, Ripple, Shear, Spherize, Twirl, Wave, ZigZag) and seven Pixelate filters (Color Halftone, Crystallize, Facet, Fragment, Mezzotint, Mosaic, Pointillize). Photoshop centres a distortion on the selection's bounds, or the canvas without one, and leaves pixels outside them alone; a filter in formvis sees the whole layer, so it needs to be told that rectangle. That is the frame: `LibFrame` (`area`, the selection's bounds or the canvas, and `canvas`), in the pixels of exactly the image the filter receives, made by `Engine.filterFrame` from the target's placement and handed to every run: the scaled preview (`previewImageEdit`, scaled with the preview and shifted by its growth), the whole-layer paths (`applyImageEdit`'s region, `grown`, and `applyImageEditAsync`, where `sourceForEdit` now also returns the placement of the pixels it made, the layer or the layer grown to the canvas), and the worker (`FilterJob.frame`). Runs without one (bands, smart filters, the smart object being its own picture) take the whole image. `LibContext` gains `area`, `canvas` and the swatches `fg` and `bg` (Pointillize's dots sit on the background colour, as in Photoshop); the swatches are captured in the settings when the dialog opens or a recorded filter runs (`completed`), so a smart filter re-renders and an action replays with the colours it was made with. Two parameter kinds join the library: `seed` (Wave's Randomize, a stored number, so an action replays the same waves) and `image` (Displace's map: an open document chosen in the dialog, captured by `Engine.mapImage` as its red and green channels at most 256 pixels a side over mid grey, base64 in the settings, so the map travels with actions and smart filters; `libValues` checks its sizes; agents name a document and `completed` captures it). A filter that needs an image and has none is refused with the reason (an engine notice, which agents receive as their error) and the dialog stays open. The remap (`remap`) is a backward map sampled bilinearly in premultiplied alpha with Photoshop's undefined-area choices, folding taps into the area; Wave's sideways shift depends on the row only and its vertical shift on the column only, so each is summed once per row and column (Wave allows 999 generators, which per pixel would be far too slow). Color Halftone caches each screen cell's mean, and a dot covers the share of its cell that mean asks for (`DOTS`, the radius whose circle, less the caps the cell's sides cut off past the inscribed circle, covers that share). Facet takes the commonest colour family (16 levels a channel) within its radius and that family's mean colour, so like colours settle into flat facets. Position-bound filters (all of Distort, Color Halftone, Crystallize, Mezzotint, Mosaic, Pointillize) declare no reach and run whole; Facet and Fragment are local and run in bands. Using the frame, Offset now wraps within the selection or the canvas (it wrapped around the layer, as 1.64.0 noted), and De-Interlace's fields and Reduce Noise's JPEG grid follow the canvas's origin. Found while checking smart filters: the Filter dialog would not open on a smart object (the engine's `targetImage`, through `paintable`, asked to rasterize it), so filters with a dialog could not become smart filters from the menu, and editing one from the Smart Filters window failed the same way; `show` skips that check for a smart target, which shows no live preview (its Preview box unchecked and disabled, as editing a smart filter already worked), and Shake Reduction's estimate is skipped there. A comment on a line this release changed (`filterPeak(kind) + 2`, "its peak, and the copies to and from the worker (1.61.1)") moved here.

Verified by scratch probes outside the repository. Each kernel against a reference: Twirl at 90 degrees moves a point at radius 20 exactly where the formula puts it, the centre and corners kept; Pinch within 1 level of the formula; Spherize exact, and Horizontal only keeps rows; Ripple exact; Polar Coordinates keeps a flat colour to the corners, its bottom row stretched into them; a one-generator square Wave shifts rows by exactly 5 pixels; ZigZag at 0 changes nothing; Shear's middle row moves a quarter of the width and wraps; Displace with a mid-grey map stays within 1 level, a white map at 100 percent moves exactly 128 pixels, no map changes nothing; Color Halftone keeps white white, black black and grey at 127 to 130; Crystallize keeps a flat colour, and a gradient's mean at 127.5; Facet keeps a flat picture and a hard edge; Fragment puts four quarter-strength copies 4 pixels out; Mezzotint gives only 0 and 255 with grey's mean at 126 to 130 across its types; Mosaic's cells are their block's mean; Pointillize leaves background between dots; Offset and Twirl inside a frame leave everything outside it alone; every filter runs at half scale; sanitised seeds, maps and colours. In the app: all 16 commands with their dialogs and fields, each one step undone exactly (Shear's straight default changes nothing); Twirl inside an 80 by 60 selection changes 2,819 pixels inside and none outside, previewed within 0.4 s; Displace lists the open documents, refuses OK without a map with its reason and stays open, applies with one; an action of Twirl, Wave (Randomize), Mosaic and Facet replayed through the Actions window equal byte for byte; on a smart object Gaussian Blur and Pinch opened and became smart filters, and Edit reopened Twirl with its value and changed it; worker and main-thread results equal byte for byte with a frame; Facet and Fragment banded equal to whole; in a 16-bit document Twirl, Mosaic, Facet and Crystallize each one step changing its channels; agents applied Twirl, Mosaic, Facet, Pointillize, Wave and Displace by a document's name, and Displace without a map answered with its reason. The 1.64.0 checks rerun: every bandable filter banded equal to whole, the action replay equal. Zero flash, under 6x CPU and network throttling after a hard reload: Wave, Displace and Color Halftone opened, reopened and edited, each dialog's box the same in every frame; Randomize and the sliders changed no nodes; a document opened between two Displace dialogs added one option in place before the dialog showed; the only layout shift the status bar's known 0.0008 before any dialog. tsc, the build, 194 unit tests; 112 engine tests passed, 3 failing on this machine (no EXR codec; LaMa not downloaded; the SAM device read as onnx); 52 browser tests across filters, offered options, menus, panel and native menus, smart and linked smart objects, MCP agents, agent editing, the Blur Gallery, Develop, Camera Raw and adjustments: 49 passed, 3 failing on this machine as at 1.64.0 (OpenEXR export, Image > Mode's list, generative fill without LaMa).

Noted: Crystallize, Pointillize and Mezzotint take the dialog's random seed, so each application differs, as Photoshop's do; a recorded one replays with a new pattern. Removed lines taken after the version edit. Removed from frontend:

```text
  "version": "1.64.0",
      "version": "1.64.0",
  "version": "1.64.0",
import type { LibKind, LibValues } from './filter-library';
export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState; lensRadius: number; lensBrightness: number; lensThreshold: number; smart: SmartSharpenSettings; shake: ShakeSettings; gallery: GallerySettings; lib?: Partial<Record<LibKind, LibValues>> }
export interface FilterJob { id: number; kind: FilterKind; settings: FilterSettings; scale: number; seed: number; width: number; height: number; pixels: ArrayBuffer }
export function runFilterOffThread(kind: FilterKind, settings: FilterSettings, scale: number, seed: number, src: ImageData): Promise<ImageData> | null {
  const job: FilterJob = { id, kind, settings, scale, seed, width: src.width, height: src.height, pixels: copy.buffer as ArrayBuffer };
export type LibGroup = 'Blur' | 'Sharpen' | 'Noise' | 'Other' | 'Video';
export type LibValue = number | string | boolean | number[];
  | { readonly key: string; readonly label: string; readonly kind: 'matrix'; readonly size: number; readonly min: number; readonly max: number; readonly def: readonly number[] };
export interface LibContext { readonly scale: number; readonly seed: number }
export const LIBRARY: readonly LibFilter[] = [...BLUR_FILTERS, ...SHARPEN_FILTERS, ...NOISE_FILTERS, ...OTHER_FILTERS, ...VIDEO_FILTERS];
export function runLib(kind: LibKind, stored: unknown, seed: number, src: ImageData, scale: number): ImageData {
  return libFilter(kind).run(src, libValues(kind, stored), { scale, seed });
  else if (isLibKind(job.kind)) out = runLib(job.kind, s.lib?.[job.kind], job.seed, src, job.scale);
 *  sharpened back by an unsharp mask on brightness, and with Remove JPEG Artifact the 8 by 8 block seams of the image's
 *  grid softened. */
export function reduceNoiseImage(img: ImageData, o: DenoiseSettings, scale: number): ImageData {
      const bx = x % 8, by = y % 8;
    run: (src, v, ctx) => reduceNoiseImage(src, { strength: num(v, 'strength'), preserve: num(v, 'preserve'), color: num(v, 'color'), sharpen: num(v, 'sharpen'), jpeg: v.jpeg === true }, ctx.scale),
import { clampInt, copyImage, exactGaussian } from './shared';
/** Offset: the layer's pixels moved by (dx, dy); what the move uncovers is transparent, the nearest edge pixel, or the
 *  pixels that left on the far side (Wrap Around). */
export function offsetImage(img: ImageData, dx: number, dy: number, undefinedAreas: string): ImageData {
  const out = copyImage(img), s = img.data, d = out.data, w = img.width, h = img.height, mx = Math.round(dx), my = Math.round(dy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sx = x - mx, sy = y - my;
    if (undefinedAreas === 'wrap') { sx = ((sx % w) + w) % w; sy = ((sy % h) + h) % h; }
    else if (undefinedAreas === 'repeat') { sx = clampInt(sx, 0, w - 1); sy = clampInt(sy, 0, h - 1); }
    else if (sx < 0 || sy < 0 || sx >= w || sy >= h) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
    const q = (sy * w + sx) * 4;
    run: (src, v, ctx) => offsetImage(src, num(v, 'horizontal') * ctx.scale, num(v, 'vertical') * ctx.scale, str(v, 'undefinedAreas')),
/* Pieces the filter library's modules share: pixels as premultiplied floats, an exact separable Gaussian and a running
   box mean. */
/** De-Interlace: the rows of one field (the odd rows, counted from 1 at the image's top, or the even ones) replaced,
 *  by the mean of the rows either side or by the row above (the row below at the top edge). */
export function deInterlaceImage(img: ImageData, eliminateEven: boolean, interpolate: boolean): ImageData {
    const oddRow = y % 2 === 0;
    run: (src, v) => deInterlaceImage(src, v.eliminate === 'evenFields', v.createBy !== 'duplication'),
  private grown(l: Layer, grow: number, run: (src: ImageData, scale: number) => ImageData): { raster: Raster; transform: Transform } {
    big.write(run(big.read(), 1));
  previewImageEdit(run: (src: ImageData, scale: number) => ImageData | Promise<ImageData>, grow = 0, maxPixels = 2_000_000): void {
    const out = run(src, scale);
  applyImageEdit(name: string, run: (src: ImageData, scale: number) => ImageData, grow = 0, peak = 2): void {
      const out = run(src, 1);
  async applyImageEditAsync(name: string, run: (src: ImageData, scale: number) => Promise<ImageData>, grow: number, fallback: (src: ImageData, scale: number) => ImageData, peak = 2): Promise<boolean> {
    const src = growing ? this.grownSource(l0, grow) : onMask ? toGray(raster.read()) : this.sourceForEdit(p0, l0);
    const out = await this.task(() => run(src, 1));
    this.applyImageEdit(name, (s, k) => (s.width === out.width && s.height === out.height ? out : fallback(s, k)), grow);
  private sourceForEdit(p: Project, l: Layer): ImageData {
    if (!isAxisAligned(t, r.width, r.height) || (t.x <= 0 && t.y <= 0 && t.x + t.w >= W && t.y + t.h >= H)) return r.read();
    if (u.w > LIMITS.side || u.h > LIMITS.side || u.w * u.h > LIMITS.pixels) return r.read();
    if (m?.raster && (m.placement || m.raster.width !== r.width || m.raster.height !== r.height)) return r.read();
    return nr.read();
import { el, setHidden } from '../dom';
import { LIBRARY, isLibKind, libAllDefaults, libApron, libFilter, libMargin, libValues, runLib, type LibKind, type LibParam, type LibValue, type LibValues } from '../../engine/filter-library';
export function runFilter(kind: FilterKind, s: FilterPanelSettings, seed: number, src: ImageData, scale: number): ImageData {
    default: return isLibKind(kind) ? runLib(kind, s.lib?.[kind], seed, src, scale) : src;
    if (!this.engine.targetImage()) { toast('Select a layer with pixels first.'); return; }
    if (kind === 'shakeReduction') this.estimateShake(false);
    this.previewRow.set(this.preview);
  private run(src: ImageData, scale: number): ImageData { return runFilter(this.kind, this.s, this.seed, src, scale); }
      if (this.preview) this.engine.previewImageEdit((src, scale) => scoped(runFilterOffThread(this.kind, this.s, scale, this.seed, src) ?? this.run(src, scale)), this.grow());
    const sync = (src: ImageData, scale: number): ImageData => runFilter(kind, s, seed, src, scale);
    return this.engine.applyImageEditAsync(FILTER_LABELS[kind], (src, scale) => runFilterOffThread(kind, s, scale, seed, src) ?? Promise.resolve(sync(src, scale)), filterMargin(kind, s), sync, filterPeak(kind) + 2);   // its peak, and the copies to and from the worker (1.61.1)
  applySettings(kind: FilterKind, settings: Record<string, unknown>): Promise<boolean> | boolean {
    const run = (src: ImageData, scale: number): ImageData => this.run(src, scale);
export const VERSION = '1.64.0';
```

## The filter library and 21 filters · _v1.64.0 (engine/filter-library.ts and engine/filters-lib/ new; engine/index.ts, engine/filter-jobs.ts, engine/filter-worker.ts, ui/panels/filter-panel.ts, ui/panels/controls.ts, ui/panels/actions-dialogs.ts, ui/actions.ts, styles/dialogs.css, app.ts)

DEV_PLAN 27.1, the first stage of Phase 27 (filter and editing parity; the itemized inventory is in the planning sidecar). A filter is now declared rather than wired by hand: `filter-library.ts` holds `LIBRARY`, each `LibFilter` an id, a label, its menu group, its parameters (a range with the slider's span and a typed `limit` past it, a select, a check, or a square integer matrix), `reach` (how far its effect reaches at a given scale, or null when its result depends on where a pixel is, so it never runs in bands), `grows` (whether its effect spills past the layer, so a layer without a selection grows as it does for Gaussian Blur) and `run` on ImageData. Everything else reads the registry: the filter panel builds a dialog section from the parameters the first time a filter opens (`libSection`, inserted before the dialog opens and reused after), the worker runs `runLib`, `bandApron` and `filterMargin` take `libApron` and `libMargin`, the commands and the Filter submenus are generated from it (alphabetical within a group, as Photoshop lists them), so a later filter is one more entry. Settings live under `settings.lib[kind]`; `libValues` holds every stored value to its parameter (a range to its limit, an unknown choice to its default, a matrix cell to an integer in range), so settings from actions, smart filters and agents never reach a kernel out of range, and `settingsOf` keeps only the applied filter's entry in what actions and smart filters store. The kernels (`filters-lib/`): Shape Blur's kernel is its shape's pixels as runs along each row (`spans`), each run summed from running row totals (`spanMean`), so a wide shape costs its height rather than its area; Smart Blur averages the pixels within its radius whose brightness is within the threshold; Median and Dust & Scratches slide a 256-level histogram along each row; Reduce Noise smooths brightness with a sampled bilateral filter in YCbCr (rings of taps, a range that narrows as Preserve Details rises), blurs the chroma planes and sharpens brightness back with an unsharp mask; High Pass is each colour's difference from its exact Gaussian around mid grey; Maximum and Minimum keep a running queue of candidates along each line, so any radius costs the same, Roundness the best of eight rectangles that make a disc; then Offset, Custom's 5 by 5 kernel, HSB/HSL, De-Interlace's fields and NTSC Colors' chroma limit in YIQ (the composite signal kept between -0.1 and 1.0). The blurs work in premultiplied alpha so colours do not darken where opaque meets transparent. Blur, Blur More and the three Sharpen filters use an exact separable Gaussian (`exactGaussian`, `unsharpExact`): formvis's three-box Gaussian does nothing below a sigma of about 0.7, which had left Sharpen changing nothing. Average is an engine operation (`averageFill`), not a library filter: a filter sees the whole layer and the selection only blends its result, but Average needs the selection's own average, weighted by its coverage and alpha. Reduce Noise's JPEG deblocking follows the picture's 8-pixel grid, so with it on the filter's reach is null (the whole layer at once, never bands, whose origins need not fall on the grid). Actions: `filter-average` joins RECORDABLE (it changes the document at once, with no dialog); the Dialog toggle shows only on steps whose filter has a dialog (`asks`). The agent bridge's `applyFilter` wraps a library filter's flat settings as `{ lib: { [kind]: settings } }` and runs `average` through `averageFill`. `matrixRow` is Custom's 5 by 5 grid of number inputs, each labelled by its row and column.

Verified by scratch probes outside the repository. Each kernel against a reference: a box-blurred dot gives 10 throughout its radius; Median removes salt; Dust & Scratches at threshold 255 keeps everything; Maximum and Minimum square and round; Offset wrapping, transparent and repeating; Custom's identity unchanged, and doubled plus 10; HSB and HSL there and back within 3 levels; High Pass of a flat image 128; NTSC red 255,0,0 to 189,28,28; De-Interlace both ways; Smart Blur keeps edges, and Edge Only; Shape Blur's circle 81 taps and square 121 at radius 5; Reduce Noise's deviation 17.2 to 10.0; stored values clamped. In the app: every command's label and state; each filter without settings one step, undone exactly; every dialog's fields, OK one step, Cancel none; the live preview; Average in a selection across red and blue 128,0,128 inside and the outside untouched; smart filters storing only their own settings; an action of Median 2, Box Blur 3, Sharpen and Average recorded, undone and played through the Actions window, equal byte for byte; every bandable library filter on a 300 by 1,100 layer forced into bands equal to the whole-layer result byte for byte, growing ones included; on a 120 MP tiled layer Median and High Pass through `bandedFilterTiled` equal to the direct run, their undo streamed back exactly; in 16 and 32-bit, Lab and CMYK documents Median, Sharpen, Box Blur, HSB/HSL and NTSC Colors each one step that changes the document's own channels, as Lens Blur does; the agent tool applying Box Blur and Average. Zero flash, under 6x CPU and network throttling after a hard reload: the Box Blur, Custom and Shape Blur dialogs opened, reopened and edited; each dialog's box the same in every frame from opening; sliders, matrix cells and the shape choice changed values in place, no rows rebuilt, each section built once before its dialog first opens; the only layout shift, 0.0008, was the status bar's hint as the document opened, before any dialog (noted, not from this change). tsc, the build, 194 unit tests; 111 engine tests passed, 4 failing on this machine (no EXR codec in its OpenCV; the LaMa and SAM ONNX models not downloaded; the SAM device read as onnx); the browser suites for filters, menus, native and panel menus, offered options, the tiled filter, MCP agents, agent editing, smart objects and large documents 18 passed, 3 opt-in skipped, 4 failing on this machine (Export OpenEXR, the codec again; Image > Mode's list, which expects five modes and has had six since Lab at 1.56.4; the tiled filter test, whose 120 MP document fits one canvas on this 8 GB machine, and the same path passed by probe with the budget lowered; generative fill without LaMa).

Noted: Offset inside a selection wraps around the layer, not around the selection's bounds as Photoshop's does; an identity Custom in bands makes no step, since nothing changed; on a giant tiled document the filter commands are disabled and a notice says filters come later, so 1.62.7's tiled filters are reached only through actions and agents. Removed lines taken after the version edit. Removed from frontend:

```text
  "version": "1.63.0",
      "version": "1.63.0",
  "version": "1.63.0",
    applyFilter: (kind, settings) => dialogs.filter.applySettings(kind as Parameters<typeof dialogs.filter.applySettings>[0], settings),
      { label: 'Blur', items: ['filter-gaussianBlur', 'filter-lensBlur', 'filter-motionBlur', 'filter-radialBlur', 'filter-surfaceBlur'] },
      { label: 'Sharpen', items: ['filter-smartSharpen', 'filter-shakeReduction', 'filter-unsharpMask'] },
      { label: 'Noise', items: ['filter-addNoise'] }, '-', 'remove-bg', 'remove-bg-lite'] },
export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState; lensRadius: number; lensBrightness: number; lensThreshold: number; smart: SmartSharpenSettings; shake: ShakeSettings; gallery: GallerySettings }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction' | GalleryKind;
  'paste-layer-style', 'clear-layer-style', 'convert-smart', 'rasterize', 'new-shape-path', 'shape-color', 'reveal-all', 'duplicate', 'merge-down', 'merge-visible', 'flatten',
        if (s && (s.kind === 'filter' || (s.kind === 'adjustment' && !s.layer))) { if (s.ask) delete s.ask; else s.ask = true; this.store.save(); }
    const can = s.kind === 'filter' || (s.kind === 'adjustment' && !s.layer), ask = q<HTMLButtonElement>(row, '.cv-step-ask');
import { checkRow, selectRow, sliderRow, type Row } from './controls';
  | 'radialBlur' | 'surfaceBlur' | 'fieldBlur' | 'irisBlur' | 'tiltShift' | 'pathBlur';
  radialBlur: 'Radial Blur', surfaceBlur: 'Surface Blur', fieldBlur: 'Field Blur', irisBlur: 'Iris Blur', tiltShift: 'Tilt-Shift', pathBlur: 'Path Blur' };
    default: return src;
    default: return null;
    : kind === 'radialBlur' ? 2000 : 0;
    const kind = this.kind, settings: Record<string, unknown> = { ...structuredClone(this.s), seed: this.seed }, editing = this.editing;
    this.onApplied?.(this.kind, structuredClone(this.s));
export const VERSION = '1.63.0';
```

## 600 MP edited whole: four faults found and fixed · _v1.63.0 (engine/tiled.ts, engine/stroke.ts, engine/index.ts, io/api.ts, app.ts; e2e/test_large_document.py)

DEV_PLAN 26.6h, closing M5. e2e/test_600_megapixels_edited_whole (opt-in, FORMVIS_LARGE=1): fine stripes on all 150 tiles of a 30,000 by 20,000 document, a brush stroke across several tiles on a second layer (checked whole: no stroke-stopped notice, paint at its end), a Gaussian Blur over the whole background, undone and redone, saved to the library, closed, reopened, exported; the same recorded pixels checked exactly at every step. It found four faults, each fixed and measured. (1) A tile sent to disk kept its memory: the browser records a drawImage and keeps a snapshot of its source until the canvas next draws for real, so each preview held its whole 16 MB tile; the page was killed by the system at 2.28 GB while striping. The preview (and the GPU's reduced copy, `levelOf`) is now drawn at once by a one-pixel read: six rows of paging ended at 625 to 708 MB instead of 1,660 to 1,869 (in isolation, paging with a fake store grew the same way, so it was not the network). (2) Uploads of typed arrays stayed in the page past garbage collection (30 uploads of 16 MB kept about 190 MB, measured four ways in fresh browsers: Uint8Array and ArrayBuffer kept it, a Blob by fetch or XMLHttpRequest did not): `undoPut` and `bandsPut` send Blobs. (3) A stroke on a giant layer grew its window by half the stroke's size again on every side, several picture-sized copies for a long stroke (the first run's diagonal stroke was cut unnoticed by the test, though the user is told): a fixed 1,024-pixel margin on tiled layers. (4) Closing a document whose undo held the whole-layer blur dropped about 34,000 stored keys one request each, and a browser's six requests at a time to one server kept the reopen behind them for many minutes (the engine opened the project in 0.15 s, the window reopened it directly in 120 s): `dropKeys` sends them in one request (`undoDropMany`, chunks of 20,000) on closing and on trimming, and a tiled layer's `dropAll` too. The passing run, on the 4 GB test machine: striped and painted 27 s, blurred 661 s, undone and redone exactly by 1,197 s, saved by 1,395 s, reopened exactly, exported equal to the composite at every recorded pixel by 1,704 s; the memory budget at most 65 percent used; no process killed; closing in 3 batch requests. Three earlier runs did not fail but were stopped: twice by the machine resetting between turns, once by my editing version.ts while the run used the development server, which reloaded the page (a rule now: nothing the window's server watches is touched during a browser run). Noted, not fixed: undo of a filter over a whole 600 MP layer takes about 5 minutes each way (many small requests); a stroke across nearly the whole picture can still be cut on a small machine (it says so); a photograph, which compresses far less than these stripes, needs several GB of free disk for a filter over the whole layer. Removed lines taken after the version edit. Removed from frontend:

```text
    if (c) engine.undoStore = { put: (b) => api.undoPut(b), get: (k) => api.undoGet(k), drop: (k) => api.undoDrop(k) };
  undoStore: { put(bytes: Uint8Array<ArrayBuffer>): Promise<string>; get(key: string): Promise<ArrayBuffer>; drop(key: string): void } | null = null;
    for (const e of closing.history.entries()) for (const q of e.patches) if (q.paged) this.undoStore?.drop(q.paged.key);   // its stored undo too (1.60.8)
    for (const e of closing.history.entries()) for (const q of e.patches) if (q.disk) { this.undoStore?.drop(q.disk.before); this.undoStore?.drop(q.disk.after); }   // and its streamed steps' (1.62.7)
    for (const q of e.patches) {
      if (q.paged) this.undoStore?.drop(q.paged.key);
      if (q.disk) { this.undoStore?.drop(q.disk.before); this.undoStore?.drop(q.disk.after); }   // a streamed step's (1.62.7)
    }
    const m = Math.max(512, Math.round(Math.max(u.w, u.h) / 2));   // half again around it, so a stroke regrows rarely
export interface TileStore { put(bytes: Uint8Array<ArrayBuffer>): Promise<string>; get(key: string): Promise<ArrayBuffer>; drop(key: string): void }
    for (const p of this.paged.values()) store.drop(p.key);
    await request(`/bands/png/${key}`, { method: 'POST', body: rows, headers: { 'Content-Type': 'application/octet-stream' } });
    return ((await (await request('/undo', { method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } })).json()) as { key: string }).key;
export const VERSION = '1.62.9';
```

## A giant document on the GPU, a texture per tile · _v1.62.9 (engine/tiled.ts, engine/index.ts, ui/stage.ts; e2e/test_tiled_gpu.py new, e2e/test_tiled_document.py)

DEV_PLAN 26.6g. `gpuLayers` takes the view, and a giant document's tiles in view go to the GPU display (it had kept them on the CPU since 1.62.3): `tileSpecs` hands each visible tile over as its own texture (2,048 a side, within any GPU's limit) at the level suiting the view's scale (`TiledRaster.levelOf`: the tile itself at half size or more, else a reduced copy at a half, a quarter, down to a sixteenth of its side, made when first asked and kept until the tile changes or leaves memory; reduced copies count in its resident bytes), so a frame's textures stay about one screen's worth at any zoom; an empty tile as the base colour, a 1-by-1 picture stretched over it (`baseSurface`, never under a real tile, which would double its opacity); a tile on disk as its preview, asked back at more than a sixteenth of actual size; each shown tile stamped as `drawTo` stamps those it draws (`touchView`), so paging never sends what is on screen to disk. Tiles do not overlap, so each drawn with the layer's opacity and blend equals the layer drawn whole. A mask, clipping mask or style on a tiled layer keeps the document on the CPU with its reason; asked without a view (the bench), it stays on the CPU and says so. The stage passes the view it draws with. Verified through the bench's WebGL2 `renderToPixels` against the CPU's drawing of the same view, on 120 MP with a rectangle across tile edges and a brush stroke on a second layer at 70 percent in Multiply: actual size where four tiles meet, largest difference 1 level, all within 4; an eighth, 2.5 MB of textures, largest 1; the whole document, 0.6 MB of textures, 99.75 percent within 4 (at edges the CPU's one-step shrink and the GPU's sixteenth-size copies filter differently, as the bench notes for ordinary documents at a quarter); tiles on disk asked back by a GPU frame and then drawn within 4. Not verifiable here: this browser's window display has no GPU even for an ordinary document, so that check is its own test, skipped here (a skip at a test's end had hidden its passed comparisons, so they were split). Noted: at actual size whole tiles are uploaded even where a sliver shows (128 MB for the test's small window over two layers), bounded and equal to what the CPU already holds; uploading only the visible part would reduce it. test_tiled_document's 1.62.3 expectation (the GPU refused) now tests both halves: without a view the reason names it, with one all 150 tiles of the white 600 MP page go over. 119 GPU, bench, display, stage, adjustment and tiled browser tests passed. Removed lines taken after the version edit. Removed from frontend:

```text
    usedMB: Math.round((e.memoryUse() - used0) / 1048576), gpu: e.gpuLayers().reason ?? 'gpu', note: window.__notes[0] ?? '' };
    assert r["gpu"] == "a layer past 268 megapixels", r                 # the CPU display draws tiles until 26.6g
import { TiledRaster } from './tiled';
  gpuLayers(): { layers: GpuLayerSpec[] } | { reason: string } {
    if (p.doc.layers.some((x) => x.tiled)) return { reason: 'a layer past 268 megapixels' };   // the CPU display draws tiles (1.62.3; the GPU per tile is 26.6g)
      const gl = this.engine.gpuLayers();
export const VERSION = '1.62.8';
```

## Giant documents saved and reopened; a new layer on one gets tiles · _v1.62.8 (io/project-io.ts, io/api.ts, app.ts, engine/index.ts; e2e/test_tiled_project.py new, e2e/test_tiled_paint.py)

DEV_PLAN 26.6f closed, and saving giant documents added. 26.6f checked: every edit a giant document allows undoes per tile (strokes since 1.62.5, filters streamed since 1.62.7); layer-level changes touch no pixels. The check found a gap: a new layer on a giant document has no pixels, and painting it gave it a full-size canvas the browser cannot make; `tileFreshLayer`, first in `beginStroke`, gives such a layer empty transparent tiles (a document is giant past one canvas, or once it has a tiled layer). Saving: `serialize` writes a tiled layer's PNG through the engine's banded writer from its tiles (`tiledPng`, tiles brought back and paged as it goes) and marks its record tiled with its size and base colour. Opening: `deserialize` takes the engine's band reader (`BandReader`, the app passing it when opening from the library) and fills each tiled record's layer band by band (`fillTiled`), writing only segments that differ from the base colour, so untouched white makes no tiles, and paging tiles to the engine's disk as it fills; `addProject` gives opened tiled layers their bring-back hook; `giantTiles` carries the store, paging and the tiles' share from the app; the recovery autosave leaves giant documents out (saving one takes minutes). Found on the way: reading bands of 209 rows straddled two rows of tiles, so a band's painted part made an empty tile in the row above; reading bands are now a power of two (128 here), dividing the tile's 2,048. The README's TypeScript count 40,600 to 41,900 (the counts check). Verified: e2e/test_tiled_project.py, a 20,000 by 6,000 document (120 MP) with a painted background and a brush stroke on a new layer saved to the library through Save, closed and reopened from the recent list: both layers tiled, the white base kept, both painted regions equal over every byte, untouched white no tiles (passed, about 2 minutes); test_tiled_paint's new-layer test passed; 17 project, library, recovery, save and tiled browser tests passed; unit 194; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import { deserialize, serialize } from './io/project-io';
    });
import { Raster, createSurface, ctxOf, toBlob, type Surface, type Ctx2D } from './surface';
  private tileShare(): number { return this.tileShareOverride ?? (this.memoryBudget ? this.memoryBudget * 0.4 : 512 * 1048576); }
import type { FilePart } from './api';
export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>): Promise<{ doc: Doc; activeId: ID | null; paths: PathSet | null; timeline: Timeline | null }> {
  for (const r of records) { for (const n of [str(r.imageFile), str(r.maskFile), str(r.smartSourceFile), str(r.smartFilterMaskFile)]) if (n) names.add(n); }
export const VERSION = '1.62.7';
```

## Filters on a giant layer, their undo streamed from disk · _v1.62.7 (engine/index.ts, engine/history.ts; ui/panels/filter-panel.ts; e2e/test_tiled_filter.py new)

DEV_PLAN 26.6e, completed. A bandable filter (Gaussian, Motion, Surface and Lens Blur, Unsharp Mask) on a giant layer runs through `bandedFilterTiled`: in place, a band of about 2 MP at a time (at least as tall as the filter's reach), each band's tiles brought back first and the next band's source read before this band is written (the ordering that keeps 26.4's in-place bands exact); each changed 512-pixel tile is written into the tiles and its before and after sent at once to the engine's store, kept as keys (`PixelPatch.disk`), so a whole-layer filter's undo (up to 2.4 GB a side at 600 MP) never sits in memory; tiles behind are paged out after each band. Its step is `streamed`: undo and redo apply it a tile at a time from the store (`bringBack`; `undoNow` and `redoNow` skip what is already in), undo paging leaves such patches alone, and trimming and closing drop both sides. While it runs, edits, strokes, undo and closing wait with a message (`busyWith`, `waiting`). A blur's spill past the canvas is not kept on a giant layer (an ordinary one grows to keep it). The filter panel sends bandable filters on a giant layer there, awaited on the background path (agents, the closed dialog) and started from the open dialog. Found while testing: the closing drops are one request per stored side, sent without waiting, and a page closed at once abandons those still in flight (the engine empties its store at its next start, so none outlives the session); the test waits for them, and a single batch drop is noted for later. Verified on a 20,000 by 6,000 document (120 MP) through e2e/test_tiled_filter.py: a Gaussian Blur around a rectangle across tile edges equal to the same blur run directly on the same pixels; a stroke tried while it ran waited, with its message; the step streamed, all 246 changed tiles' sides on disk, under 64 KB held; undo and redo exact; the store emptied after closing; 43 filter, history, undo, gallery, tiled and painting browser tests passed; unit 194; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
export interface PixelPatch { raster: Raster | TiledRaster; x: number; y: number; before: ImageData; after: ImageData; paged?: { key: string; w: number; h: number } | null; lazy?: boolean }
export interface HistoryEntry { name: string; before: Snapshot; after: Snapshot; patches: PixelPatch[]; beforeRev: number; afterRev: number }
    for (const e of this.past.slice(0, Math.max(0, this.past.length - keep))) for (const q of e.patches) if (!q.paged) out.push(q);
    if (i < 0 || this.stroke) return;
    if (!p || this.stroke) return false;
    if (!p || this.stroke) return;
    for (let i = e.patches.length - 1; i >= 0; i--) {
    for (const q of e.patches) q.raster.write(q.after, q.x, q.y);
    if (!p || this.stroke) return false;
  private readonly dropHook = (History.onDrop = (e: HistoryEntry): void => { for (const q of e.patches) if (q.paged) this.undoStore?.drop(q.paged.key); });
export const VERSION = '1.62.6';
```

## Giant documents exported as PNG · _v1.62.6 (engine/index.ts; e2e/test_large_document.py, e2e/test_tiled_document.py)

DEV_PLAN 26.6e, its first part (filters on giant layers follow). Export PNG of a giant document goes through the bands again (excluded at 1.62.3, when 512-row bands 30,000 wide, 61 MB each, piled up awaiting collection and crashed the page): `renderBands` sizes its bands to about 4 megapixels from the width (16 to 512 rows; 139 rows, 16 MB, at 30,000 wide) and reuses one band surface; before each band it brings back the tiles under it, because a tile on disk draws as its preview, a placeholder on screen but wrong pixels in a file; after each band it pages tiles behind it out again, so memory stays bounded whatever is painted. Verified on the 4 GB test machine, through Export PNG: a 30,000 by 20,000 document with two rectangles and a brush stroke across tile edges, its painted tiles sent to disk first (18 of 22), exported in 276 s with the browser peaking 502 MB above where it stood and no errors; the 30,000 by 20,000 PNG, streamed row by row (2.4 GB decoded is past the machine), equal to the layer at nine pixels including both sides of each rectangle's edges, the stroke and the far corner. The same run is now an opt-in test in e2e/test_large_document.py; while making it, its paging check proved flaky (a paging round the stroke had scheduled was running, and an explicit pageTiles returns at once during one), so the test waits until the tiles fit their share. test_tiled_document no longer expects export to be refused. Removed lines taken after the version edit. Removed from frontend:

```text
taught tiles (filters and export, 26.6e; painting is taught at 1.62.5, in e2e/test_tiled_paint.py)."""
    page.evaluate("window.formvis.commands.run('export-png')")
    page.wait_for_timeout(3000)
    toasts = page.evaluate("Array.from(document.querySelectorAll('.cv-toast')).map((t) => t.textContent)")
    assert any("past what a browser canvas holds" in t for t in toasts), toasts   # refused out loud (bands crashed the page)
    assert page.evaluate("1 + 1") == 2                                   # and the page lives
    // Not a tiled document yet (1.62.3): at 600 MP its 61 MB bands, awaiting collection, crashed the page; 26.6e makes
    // its export safe, and until then the full-size path refuses it out loud (createSurface) and the page survives.
    if (p?.doc.layers.some((l) => l.tiled)) return false;
    const W = p.doc.width, H = p.doc.height, B = 512;
    for (let y0 = 0; y0 < H; y0 += B) {
      const h = Math.min(B, H - y0), s = createSurface(W, h);
      this.work.render({ doc: p.doc, target: s, view: translation(0, -y0), background, quality: 'high' });
      const rows = ctxOf(s).getImageData(0, 0, W, h).data as Uint8ClampedArray<ArrayBuffer>;
      s.width = 0; s.height = 0;
      await sink(rows, y0, h);
export const VERSION = '1.62.5';
```

## Painting on a giant layer · _v1.62.5 (engine/stroke.ts, engine/index.ts, engine/history.ts, engine/renderer.ts, engine/tiled.ts; e2e/test_tiled_paint.py new; e2e/test_tiled_document.py, e2e/test_painting_tools.py)

DEV_PLAN 26.6d. The plain brush, pencil and eraser paint a layer kept in tiles: `PixelStroke` takes a `TiledRaster` (always windowed), keeps `orig`, the window's original pixels, read from the tiles as the window grows (a tile there on disk stops the window, the dab not laid and the area noted in `missing`, never painted over unloaded), recomposes from it, and `commitTiles` writes each changed 512-pixel tile into the tiles, its before from `orig` and after from the window; `commit` (the whole rectangle) and `layer` (what the retouch strokes and `toFull` work on whole) refuse a tiled layer plainly. `beginStroke` lets `paintable` allow a tiled layer for the plain stroke only, declines before any step opens what needs the whole layer (the Mixer Brush, a mask, a selection, Brush Settings), builds the target from the tiles (target would give the layer a full-size canvas), and reads Auto Erase's pixel from the tiles; `endStroke` says when a stroke stopped at tiles still on disk and brings them back. `PixelPatch.raster` may be a tiled layer; `History.rasters` gathers only canvases; undo and redo bring a stroke's tiles back from disk before writing there (`needsBack`, `bringBack`, `pagedIn`); tile paging waits during a stroke; the renderer shows a stroke in progress on a tiled layer through a slot and its window, as an ordinary layer's. Also corrected: test_painting_tools' brush group expected Brush and Pencil, but the Mixer Brush joined them at 1.56.2 (a3e88c4, as Photoshop's), so the test had failed since then (confirmed failing on 1.62.4's code with this release's changes set aside); test_tiled_document's decline now uses a filter, since the brush paints. Verified: the same stroke across tile edges on a 30,000 by 20,000 tiled layer and on an ordinary 6,000 by 5,000 layer equal over every byte of the painted region, one Brush step, no full-size canvas; the stroke shown in the view before it is written into the layer; undo to white and redo exactly; the Mixer Brush declined with no step; with the share forcing the stroke's tiles to disk, undo brought them back and restored white exactly (e2e/test_tiled_paint.py 4 passed); 93 browser tests of brushes, dynamics, flow, modes, settings, tips, cloning, healing, the History Brush, paint targets, painting tools, retouching, the tiled suites and the GL display passed with the two corrections; unit 194; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    for member, want in [("brush", ["Brush", "Pencil"]), ("eraser", ["Eraser", "Background Eraser", "Magic Eraser"]), ("cloneStamp", ["Clone Stamp", "Pattern Stamp"])]:
taught tiles (painting, filters, export: the stages 26.6c to h)."""
      e.setTool('brush'); e.beginStroke({ x: 100, y: 100 }, false); e.strokeTo({ x: 300, y: 300 }); e.endStroke();
    assert r["steps"] == 0 and not r["raster"] and r["tiled"], r        # painting had given it a canvas the browser cannot make
export interface PixelPatch { raster: Raster; x: number; y: number; before: ImageData; after: ImageData; paged?: { key: string; w: number; h: number } | null; lazy?: boolean }
    for (const e of [...this.past, ...this.future]) { add(e.before); add(e.after); for (const p of e.patches) out.add(p.raster); }
import { UPRIGHT, defaultShape, noDynamics, pressureOption, type BrushDynamics, type BrushPreset, type BrushShape, type PenPose } from './brush-dynamics';
    if (!store || this.tilePaging) return 0;
  private paintable(l: Layer | null): l is Layer {
    if (l.tiled) { this.notice(`"${l.name}" is past 268 megapixels and kept in tiles: painting and editing its pixels come in the next releases.`); this.lockedAt = performance.now(); return false; }
    if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer to paint on.'); return false; }
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
      const q = applyMat(invert(pick.local) ?? [1, 0, 0, 1, 0, 0], pt.x, pt.y), px = pick.raster.ctx.getImageData(Math.floor(q.x), Math.floor(q.y), 1, 1).data;
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, bg: { ...this.bg }, flow: this.brushFlow, aliased: !!opts.aliased || !!opts.square, square: !!opts.square, dabColor: this.tool === 'mixer' && pick.target !== 'mask' && this.brushMode !== 'erase' ? this.mixerSourceFor(p, pick.raster, pick.local) : null }, op, p.selection);
    const r = s.raster;
    const r = s.raster, W = r.width, H = r.height, before = r.read(), pm = premultiply(before.data), cov = s.coverageAlpha(), hole0 = new Uint8Array(W * H);
    const r = s.raster;
        layer.tiled.drawTo(ctx, mul(job.view, placement(t, layer.tiled.width, layer.tiled.height)) as unknown as [number, number, number, number, number, number]);
  constructor(readonly raster: Raster, localToDoc: Mat, readonly style: StrokeStyle, readonly op: GlobalCompositeOperation, private readonly selection: SelectionMask | null, private readonly texture: { surface: Surface; dx: number; dy: number } | null = null, private readonly lerp = false) {
    this.windowed = raster.width * raster.height > windowFrom && !lerp;
    if (!this.windowed) this.workingCtx.drawImage(raster.canvas, 0, 0);
      if (layer) c.drawImage(this.raster.canvas, nx, ny, nw, nh, 0, 0, nw, nh);   // the layer's pixels where the window is new
    this.working = takeSurface(w, h); this.workingCtx = ctxOf(this.working); this.workingCtx.drawImage(this.raster.canvas, 0, 0);
    w.drawImage(this.raster.canvas, lx, ly, aw, ah, x, y, aw, ah);
    const T = 512, out: PixelPatch[] = [], c = this.raster.ctx;
    const c = this.raster.ctx;
export const VERSION = '1.62.4';
```

## A giant document's tiles on the engine's disk · _v1.62.4 (engine/tiled.ts, engine/index.ts; e2e/test_tiled_paging.py new)

DEV_PLAN 26.6c. Past the tiles' share of memory (40% of the budget; `tileShareOverride` for checks), `pageTiles` sends each tiled layer's least recently used tile out of view to the engine's store (the undo store since 1.60.8) after edits settle: `TiledRaster.pageOut` keeps a preview at a sixteenth of the tile's side and frees the canvas only once stored, abandoning (the stored copy dropped) a tile drawn into meanwhile (per-tile versions) or come into view. `drawTo` draws a tile on disk as its preview and, when the view needs more than the preview (scale above a sixteenth), asks for it (`onMissing`), which `bringTile` answers with `pageIn` (fetched once however many ask, the stored copy then dropped) and one redraw; the tiles a full-detail view drew are recorded and never paged while on screen, and a small view (the Navigator's) neither asks nor counts. A tile on disk is never read as empty nor drawn over as new: `tileAt` throws for it, and an operation brings its tiles back first with `ensure`. Closing a document drops its stored tiles. `bytes` (the memory count) is the tiles in memory and the previews; `residentBytes` is what the share bounds. Verified with the share at four tiles on a 600 MP document: twelve tiles of distinct patterns written, four stayed and eight went to the store (previews under 1 MB in all); reading a tile on disk refused; the view over tile 0 brought it back and showed every byte as written; ensure brought tile 11 back for an exact read; closing emptied the store of them; e2e/test_tiled_paging.py passed, with the tiled raster, tiled document and GL display suites (39 in all); unit 194; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    this.pageTimer = window.setTimeout(() => void this.pageOut(), 800);
        const t = this.tileAt(tx, ty);
        if (!t && !this.base) continue;
export const VERSION = '1.62.3';
```

## Giant documents open, display and compose · _v1.62.3 (engine/types.ts, engine/tiled.ts, engine/renderer.ts, engine/index.ts, engine/surface.ts; e2e/test_tiled_document.py new)

DEV_PLAN 26.6b. A document past what one canvas may hold here (a side past 30,000, or more pixels than the budget) but within 65,535 a side is made tiled by `newDocument` (before 1.62.3 refused): its layer has `tiled` and no `raster`, so code written for ordinary layers declines it as it declines an adjustment. `TiledRaster.base` is the colour an empty tile reads and draws as (a white 600 MP background costs nothing until drawn into; a tile made is filled with it); `drawTo` draws each tile to whole target pixels when unrotated and unflipped, so neighbours meet without a seam at any zoom and a scale of 1 is a copy, skipping tiles outside the target (rotated or flipped: through the transform). The renderer composites a tiled layer at its opacity, in its mode when the canvas has it (Normal otherwise for now; masks, clipping, styles, Blend If and knockout in later stages); the GPU display declines it with its reason, so the CPU display draws tiles (the GPU per tile is 26.6g); the memory count takes a tiled layer's tiles and no full-size display copy for its document. Found while verifying, and fixed: painting a tiled layer gave it a full-size canvas the browser cannot make (a 30,000 by 20,000 canvas, made but drawing nothing, beside the tiles), so `paintable` declines a tiled layer with a plain message, and `createSurface` refuses any size past a browser canvas (2^28 pixels or 32,767 a side) with a plain error, so an operation not yet taught tiles stops out loud instead of working on a canvas that is not there; the brush and filters first gave a memory figure as their reason, so `layerBytes` and `beginStroke`'s first-stroke count leave a tiled layer out and the true reason shows; exporting crashed the page (the 26.4 bands are 61 MB each at 30,000 wide and piled up faster than collected), so `bandedExportable` leaves tiled documents to 26.6e and the full-size path refuses them out loud. Verified on 30,000 by 20,000 white: opened tiled with its notice, 150 tiles possible and none made, 0 MB counted, the GPU display's reason given; a rectangle across 2,048 and 4,096 made exactly 9 tiles; at 4.37% no seam pixel of 21,420 inside it; at actual size across the tile corner the composite equal to the layer's pixels; the brush and a filter declined with the true reason, no step and no canvas given; Export PNG refused out loud and the page alive; e2e/test_tiled_document.py 3 passed; 49 existing browser tests passed on ordinary documents (tiled raster, GL display, benchmark, GPU adjustments); unit 194; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
      n += p.doc.width * p.doc.height * 4 + p.history.retained(p.snapshot());
  layerBytes(): number { const p = this.current, r = p?.activeLayer?.raster; return r ? r.width * r.height * 4 : p ? p.doc.width * p.doc.height * 4 : 0; }
    const fresh = p.activeLayer && !p.activeLayer.raster ? p.doc.width * p.doc.height * 4 : 0;
      const t = this.tileAt(tx, ty);
      if (!t) continue;
      const ox = tx * this.tile, oy = ty * this.tile;
      const ix0 = Math.max(x, ox), iy0 = Math.max(y, oy), ix1 = Math.min(x + w, ox + t.canvas.width), iy1 = Math.min(y + h, oy + t.canvas.height);
  /** The layer drawn onto `ctx` through `m` (layer to target, as setTransform's six numbers), tile by tile; exact at a
   *  scale of 1 (see the note at the top for other scales). */
    for (const [key, t] of this.tiles) {
      const tx = key % this.cols, ty = Math.floor(key / this.cols);
      ctx.save();
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(t.canvas, tx * this.tile, ty * this.tile);
      ctx.restore();
export const VERSION = '1.62.2';
```

## A layer as tiles · _v1.62.2 (engine/tiled.ts and engine/tiled.test.ts new; e2e/test_tiled_raster.py new)

DEV_PLAN 26.6a, the first stage of tiled layers (the register's M5 closes with 26.6). A browser canvas holds at most 2^28 pixels, so past 268 MP a layer cannot be one canvas; `TiledRaster` keeps 2,048-pixel tiles made only where something is drawn (an empty tile costs nothing: a 600 MP layer is 150 tiles, held only as they are used), with `read` and `write` across tile edges as one picture, `drawOn` (a drawing call on every tile a rectangle touches, in layer coordinates) and `drawTo` (the layer drawn out through a transform); `tilesIn` is the tile arithmetic, a plain function. Nothing uses it yet: documents up to 2^28 pixels keep their single-canvas layers, and the stages after this give tiled layers to the compositor (26.6b), the disk (c), painting (d), filters and export (e), undo (f) and the GPU display (g), with the 600 MP test (h). Found on the way, and kept in the code's notes rather than hidden: `drawOn` is exact for axis-aligned fills, but not for antialiased paths, because the browser may draw a path cut by a tile's edge another way than the whole path (measured on 1,200 by 800 over white with 64- and 512-pixel tiles: 99.8% of values within 2 levels, at most 45 at a few edge pixels; the differences lie along the shapes' edges, not the tiles', and were first mistaken for a CPU against GPU rasteriser difference, which a run at four tile sizes ruled out), so antialiased drawing will go through one scratch canvas and be written into tiles, which is exact; `drawTo` at a scale other than 1 can seam at tile edges, for 26.6b's one-pixel apron. Also caught while writing the tests: the comment's 144 tiles for 600 MP (it is 15 by 10, 150), and a test write at (4,000, 4,000) said to touch one tile that crosses 4,096 both ways. Verified: unit 194 (the six tile-arithmetic tests new); in the browser, 5 passed: 40 random writes (some partly outside) and reads equal to one canvas over every byte, fills exact, antialiased shapes within 2 levels for at least 99.5% of values over white, drawTo at actual size exact from the same pixels, and a 600 MP layer holding exactly the three tiles written into. Removed lines taken after the version edit. Removed from frontend:

```text
export const VERSION = '1.62.1';
```

## Version only · _v1.62.1

No window code changed in 1.62.1 (the macOS install's missing packages, in the backend's log). Removed lines taken after the version edit:

```text
export const VERSION = '1.61.9';
```

## Version only · _v1.61.9

No window code changed in 1.61.9 (the CLI's help names its version; the owner's second bench recorded), both in the backend's log. Removed lines taken after the version edit:

```text
export const VERSION = '1.61.8';
```

## Version only · _v1.61.8

No window code changed in 1.61.8: `./formvis verify-local` (the register's M7) is in setup/ and the CLI, recorded in the backend's log. Removed lines taken after the version edit:

```text
export const VERSION = '1.61.7';
```

## Each GPU path checked against the CPU, and the owner's bench recorded · _v1.61.7 (gpu/bench.ts; e2e/test_benchmark.py; docs/BENCH.md new)

The register's H4 asks that Automatic pick the fastest *correct* path, and the owner's first `./formvis bench` (Apple M5 MacBook Air, Metal 3) measured speed only. `checkPaths` renders the benchmark document through each GPU display and through the CPU at actual size, a 560 by 400 window into its middle, and reports the largest difference and the share of values within 4 levels; a path is correct when that share is at least 99%, the bar test_gpu_adjust uses (its own note: the layers below differ by up to 3 levels between GPU and canvas compositing, and an adjustment can amplify one). The document is closed and the user's restored. Found on the way: at a quarter size both paths differed by 25 levels, identically, because the CPU's and the GPU's downscaling filters differ at edges by design, so the check compares where nothing is resampled; at actual size, the largest difference was 5 against a maximum of 4 I had taken from the display tests, which test no adjustment layers, so the bar is the adjustment tests' rather than one chosen to pass. The owner's run is recorded in docs/BENCH.md: every GPU path near 1 ms a frame, the CPU 20 ms with adjustment layers (22 times the GPU), Automatic (WebGPU) within 0.2 ms of the fastest in every test, the native brush benchmark 0.47 ms median against a 3 ms target; not yet measured there, each path's correctness (checked from this release) and the Channels view through the native renderer (H3's desktop app). Verified here: both GPU paths 100% within 4 levels, the largest difference 5; test_benchmark 3 passed; no errors. Removed lines taken after the version edit:

```text
export const VERSION = '1.61.6';
```

## Version only · _v1.61.6

No window code changed in 1.61.6 (bench runs in the background and finds the window server on macOS, in setup/bench.py, recorded in the backend's log). Removed lines taken after the version edit:

```text
export const VERSION = '1.61.5';
```

## Version only · _v1.61.5

No window code changed in 1.61.5: `./formvis bench` (the register's H4) is in setup/ and the CLI, recorded in the backend's log, and runs the window's own benchmark (gpu/bench.ts) as it is. Removed lines taken after the version edit:

```text
export const VERSION = '1.61.4';
```

## The register's 150 MP test, and room made before a large filter · _v1.61.4 (engine/index.ts, engine/stroke.ts, ui/panels/filter-panel.ts; e2e/test_large_document.py new)

DEV_PLAN 26.4 closed and 26.5 done. Saving large layers needed no change: a 150 MP project saved in 2 to 5 s (the browser's PNG encoder streams rows) and reopened in 4 s at full size, three 1,024-pixel tiles (random noise, shape edges, a corner) equal to before over every byte. The register's test is now `e2e/test_large_document.py`, opt-in (`FORMVIS_LARGE=1`, the engine running): a 15,000 by 10,000 document painted with three strokes, blurred over MCP, saved to the library, closed, reopened with the same pixels and exported as PNG, the memory counted inside the budget after every stage and the page never lost. Run together, the stages showed what the separate runs had not: a blur straight after painting was refused, the strokes' undo not yet paged (that waits for edits to settle and spares the newest two steps) and the stroke pool holding 189 MB of spare surfaces. `relieveFor` now makes room before a large banded filter on the background path (agents, the closed dialog): the stroke pool emptied first (`dropSpareSurfaces`), then, only if still short, every undo tile still in the window paged (`pageOut(keep, all)`, after any round under way); `layerBytes` public for the panel's ask. Verified: the test passed in 262 s on the 4 GB test machine (after failing twice, at the refusal and then the pool, each fixed); the 16 MP equivalence and paging check again exact; unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import { PixelStroke, sameBytes, spareBytes, strokeWindowFrom, warmStrokeSurfaces } from './stroke';
  async pageOut(): Promise<number> {
        for (const q of p.history.pageable(2)) {
          if (held <= this.undoShare()) break;
  private layerBytes(): number { const p = this.current, r = p?.activeLayer?.raster; return r ? r.width * r.height * 4 : p ? p.doc.width * p.doc.height * 4 : 0; }
    private applyInBackground(kind: FilterKind, settings: Record<string, unknown>): Promise<boolean> {
export const VERSION = '1.61.3';
```

## A whole-layer filter's undo paged, history memory automatic · _v1.61.3 (engine/index.ts, engine/history.ts, app.ts, ui/prefs.ts, ui/app-dialogs.ts)

DEV_PLAN 26.4. Raster paging: when a growing filter in bands replaces a layer (`bandedGrow`, now in 256-row bands so its peak at 150 MP stays inside a 4 GB computer's budget), the old layer, kept only for undo, goes to the engine's undo store in 1,024-pixel tiles and its canvas is freed once all are stored (`pageRasterOut`; abandoned, its tiles dropped, if the store fails, the document closes, the layer comes back into use, or no step holds it); undo and redo bring it back first through the ordered queue (`needsBack`, `bringBack`, `unpageRaster`, tile by tile); closing drops it from the store; History counts a snapshot raster by its canvas, so a paged one counts nothing. Found on the way, and older than this work: Preferences' history memory (256 MB) trimmed any step holding more the moment it ended, so a whole-layer change on a 150 MP layer (572 MB) never had an undo step. History memory is now automatic by default (`historyAuto`, also for preferences stored before it): 40% of the memory budget, at least 256 MB (`setHistoryLimits` takes null for automatic; `setMemoryBudget` recomputes it); moving the Preferences slider chooses a figure and turns automatic off, and a tick box beside it turns it back on. Also found: after many edits the dev server served history.ts under two addresses, so two copies of it ran and the first fix (a class default, now removed) reached only one; checks now run on a freshly started dev server. Verified: at 16 MP with bands forced, the grown blur in 256-row bands equal to the whole-layer result over every byte, the old layer paged out, undo and redo exact by a hash of every byte; at 150 MP on the 4 GB test machine, a new document's history 720 MB and the blur's step kept; the Gaussian Blur over MCP in 43 s, the old layer paged in 95 s (counted 1,144 MB before, 1,149 after), undo restoring every byte in 26 s, the engine up throughout; unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    if (c?.memory) { engine.memoryBudget = Math.max(512 * 1048576, Math.round(c.memory * 0.45)); status.syncMemory(); }
          if (r && !live.has(r.id) && !seen.has(r.id)) { seen.add(r.id); bytes += r.bytes; }
  setHistoryLimits(states: number, bytes: number): void {
    this.historyLimits = { states: Math.round(clamp(states, 1, 1000)), bytes: Math.round(clamp(bytes, 16 * 1024 * 1024, 4096 * 1024 * 1024)) };
    if (!this.historyOps.length && !next?.patches.some((q) => q.paged)) { if (op === 'undo') this.undoNow(); else this.redoNow(); return; }
        if (next?.patches.some((q) => q.paged)) await this.pageIn(next);
    const r = l.raster as Raster, g = Math.ceil(grow), A = Math.max(g, Math.ceil(apron)), Wb = r.width + 2 * g, Hb = r.height + 2 * g, B = 512;
  private readonly memoryRow = sliderRow('History memory (MB)', 16, 4096, 16, (v) => this.change({ historyMB: v }));
    add('History & Cache', this.statesRow.el, this.memoryRow.el, el('<p class="cv-note">History States is how many steps undo keeps (Photoshop keeps 50 by default, up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as Photoshop\'s Memory Usage does, so this is the part formvis controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.</p>'),
export interface Prefs { profileMismatch: 'convert' | 'keep' | 'ask'; shortcuts: Record<string, string[]>; restoreSession: boolean; agentsAllowed: boolean; comfyuiUrl: string; nodemodeUrl: string; historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
export const DEFAULT_PREFS: Prefs = { profileMismatch: 'convert', shortcuts: {}, restoreSession: true, agentsAllowed: false, comfyuiUrl: 'http://127.0.0.1:8188', nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
  engine.setHistoryLimits(p.historyStates, p.historyMB * 1024 * 1024);
export const VERSION = '1.61.2';
```

## PNG export in bands through the engine · _v1.61.2 (engine/index.ts, io/api.ts, app.ts; backend routers/bands.py new, main.py)

DEV_PLAN 26.4, the exports' half. Export PNG of an 8-bit RGB document past the band size (`bandedExportable`) renders the flattened picture a band of 512 rows at a time (`renderBands`: the same renderer as `renderDoc`, its view moved up by the band's top, each band's rows handed to a sink and awaited) and sends each band to the engine's banded PNG writer (`api.bandsBegin`, `bandsPut`, `bandsEnd`), which deflates it straight into the file; the engine core makes no network call itself, the app's sink does. Smaller, deep, CMYK, Lab and float-composed documents export as before. Verified: through the Export PNG command on a 16 MP document with semi-transparent paint, a Multiply layer at 70% and a drop shadow, the banded PNG decodes to the normal export's pixels exactly (0 of 64,000,000 bytes differing), both at 72 ppi; on the 4 GB test machine the 150 MP document exported in 76 s (15,000 by 10,000 RGBA, its pixels right), the browser peaking 763 MB above where it stood (the bands' row buffers awaiting collection) and the engine 161 MB; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
export const VERSION = '1.61.1';
```

## Whole-layer filters ask room for their measured peak · _v1.61.1 (engine/index.ts; ui/panels/filter-panel.ts)

DEV_PLAN 26.4, the finding 1.60.9 recorded: the whole-layer filter path's room check counted two layer-sizes, while a Gaussian Blur peaked near eleven. Every filter was measured run whole on a 4,000 by 4,000 layer, the browser's memory sampled every 100 ms (in layer-sizes: Gaussian 11.9, Motion 9.9, Add Noise 1.5, Lens Correction 9.9, Unsharp Mask 11.0, Lens Blur 18.1, Smart Sharpen 12.0, Shake Reduction 10.0, Radial 12.0, Field 15.6, Iris 12.8, Tilt-Shift 14.7, Path 3.8, Camera Raw's develop 3.4; Surface Blur's reading was masked by the previous filter's memory being collected during it, so it takes the common 12). `FILTER_PEAK` holds them rounded up (`filterPeak`, 12 when unmeasured); `applyImageEdit` and `applyImageEditAsync` take the peak to ask room for (two when a caller has not measured), the filter panel passing it, with two more on the background path for the copies to and from the worker. Below the band size and for the filters that cannot band, a filter that would not fit is now refused with its reason instead of running toward the page's end. Verified over MCP on the 4 GB test machine: Radial Blur on a 49 MP document refused in 0.1 s ("needs about 2,617 MB more, and formvis is holding 561 MB of the 1,800 MB"), Add Noise on it run (5.9 s), a 16 MP Gaussian Blur run whole (3.3 s, a Gaussian Blur step); unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
  applyImageEdit(name: string, run: (src: ImageData, scale: number) => ImageData, grow = 0): void {
    if (!this.room(this.layerBytes() * 2, name)) return;   // its source and result (1.60.2)
  async applyImageEditAsync(name: string, run: (src: ImageData, scale: number) => Promise<ImageData>, grow: number, fallback: (src: ImageData, scale: number) => ImageData): Promise<boolean> {
    if (!this.room(this.layerBytes() * 2, name)) return false;   // its source and result (1.60.2)
    return this.engine.applyImageEditAsync(FILTER_LABELS[kind], (src, scale) => runFilterOffThread(kind, s, scale, seed, src) ?? Promise.resolve(sync(src, scale)), filterMargin(kind, s), sync);
    this.engine.applyImageEdit(FILTER_LABELS[kind], run, this.grow());
export const VERSION = '1.60.9';
```

## Filters in bands on large layers · _v1.60.9 (engine/index.ts, engine/history.ts, engine/stroke.ts; ui/panels/filter-panel.ts)

DEV_PLAN 26.4, the filters' half. On a layer past 16 megapixels (`bandFrom`, settable for checks), a filter whose effect reaches a bounded distance and is the same wherever it is (`bandApron`: Gaussian, Motion, Surface and Lens Blur and Unsharp Mask; Smart Sharpen was not equal banded and runs whole) runs in bands of at least 512 rows, each read with the filter's reach of rows around it, so no whole-layer copy is made in or out (`bandedFilter`). As the whole-layer path does: with no selection or mask the layer grows by the filter's reach and keeps the spill (`bandedGrow`: each band drawn from the old layer onto transparent at the same offset, its middle rows written into the larger layer, one step, the old layer kept for undo); otherwise in place through the selection (each band's own coverage, blended by `blendThrough` tile by tile), each changed 512-pixel tile's undo its before only (`lazy`: its after read from the layer when undone, halving a filter's undo), the step's tiles then sent to the undo store at once (`pageNewest`; paging keeps a tile undone meanwhile). Smaller layers, masks, smart and shape layers, and deep, CMYK and Lab documents keep the whole-layer path. When memory refuses, `bandedFilter` says 'refused' and the callers report failure with the engine's reason. Found on the way: the first version declined the common growing case, which a probe calling the whole path without growth (as the panel never does) hid; in place, a band's apron above was read after the band above it had been written (each band's source is now read before the band above is written, bands at least as tall as the apron); a refusal had been reported as done (Gaussian Blur over MCP said Applied on the 150 MP document and changed nothing). Measured: the whole-layer path's peak is about eleven layer-sizes, its room check counts two, so the filters that cannot band need their count set from measurement (next). Verified: Gaussian, Motion, Surface and Lens Blur and Unsharp Mask, each grown and in a soft selection, on a 2,400 by 1,600 picture of noise and gradients, banded equal to whole over every byte with size and placement; a banded blur's undo and redo exact both ways; on the 4 GB test machine a 49 MP Gaussian Blur's peak 2,101 MB whole and 422 MB in bands (8.0 and 10.1 s); the 150 MP blur over MCP reported refused with the memory reason; no errors. The README's Python count 9,200 to 9,500 (the counts check). Removed lines taken after the version edit. Removed from frontend:

```text
export interface PixelPatch { raster: Raster; x: number; y: number; before: ImageData; after: ImageData; paged?: { key: string; w: number; h: number } | null }
import { PixelStroke, spareBytes, strokeWindowFrom, warmStrokeSurfaces } from './stroke';
          const w = q.before.width, h = q.before.height, n = w * h * 4, bytes = new Uint8Array(n * 2);
          bytes.set(q.after.data, n);
          if (q.paged || !p.history.entries().some((s) => s.patches.includes(q))) { store.drop(key); continue; }
          held -= n * 2;
          q.after = new ImageData(all.slice(n, n * 2), w, h);
    for (let i = e.patches.length - 1; i >= 0; i--) { const q = e.patches[i]; q.raster.write(q.before, q.x, q.y); }
function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
export const VERSION = '1.60.8';
```

## Older undo kept on the engine's disk · _v1.60.8 (engine/history.ts, engine/index.ts, io/api.ts, app.ts; backend routers/undo.py new, main.py)

DEV_PLAN 26.3, second part, so 26.3 is done. The engine keeps an undo store (`/api/undo`: put, get, drop; zlib-deflated in a session folder emptied when it starts), which the app hands the engine core as `undoStore` once the engine answers (the core makes no network calls itself). Once a document's undo tiles hold more than its share of memory (15% of the budget; `undoShareOverride` for checks), `pageOut` sends the oldest (`History.pageable`, the last two steps spared) to the store a tile at a time after edits settle (0.8 s after `refresh`), and lets a tile's pixels go (a pixel's worth kept, the patch marked `paged` with its key and size) only once the store has them; a tile whose document closed or whose step was trimmed while it was on its way has its key dropped rather than attached. Undo and redo run in the order asked through one queue (`historyOp`, `drainHistory`): at once when the step is in the window and nothing waits, else after `pageIn` brings its tiles back (each fetched once however many ask, then dropped from the store); the History panel's jump goes through the same queue. Closing a document and the History trimming a step (`History.onDrop`) drop their stored tiles. Found on the way: the first version let each queued undo run when its own fetch finished, which is only partly ordered (a redo pressed meanwhile on a step still in the window ran at once, before earlier undos), so six quick undos had reached step 2 of 1 after 3 seconds; one queue fixed it. A paging round still uploading when its document closed left 10 tiles in the store; checked after each upload now. Verified in the browser with an 8 MB share, six strokes on a 4,000 by 3,000 layer, each layer compared by hashing every byte: 47 of 70 tiles paged, the window's undo from 122 MB to 41; three undos and a redo pressed quickly over paged steps ending exactly after stroke 4 (1.4 s); four more undos exactly before any stroke (2.9 s), the store emptied as they came back; six redos exactly after stroke 6; the History panel three steps back after paging again exactly after stroke 3; closing the document left no tiles in the store; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
export interface PixelPatch { raster: Raster; x: number; y: number; before: ImageData; after: ImageData }
      if (this.past.length) this.past.shift();
      else this.future.shift();
import { History, type PixelPatch, type Snapshot } from './history';
  undo(): void {
  redo(): void {
export const VERSION = '1.60.7';
```

## A stroke's undo as the tiles it changed · _v1.60.7 (engine/stroke.ts, engine/index.ts)

DEV_PLAN 26.3, first part (carried from 26.2). `PixelStroke.commitTiles` writes the stroke into the layer a 512-pixel tile at a time, reading each tile before and after and keeping it for undo only if it changed (`sameBytes`, four bytes at a time), so a stroke keeps the tiles it painted rather than the whole rectangle it spanned, and no rectangle-sized copy is made while committing. `endStroke` uses it for a plain stroke on pixels in an 8-bit RGB document; healing, Remove, masks, and 16-bit, 32-bit, CMYK and Lab documents keep the whole patch, which their steps after it read. Undo and redo apply the tiles as they applied the one patch. Next, 26.3's second part: older undo kept on the engine's disk. Verified in the browser on a 6,000 by 4,000 layer, a diagonal stroke of 41 points: 20 tiles kept, 36 MB, where the rectangle it spans is 158 MB; undo restores the layer and redo gives the stroke back, compared by a hash over every seventh byte of the layer (the tiles are put back by the same putImageData the whole patch used), both for a full-size stroke and a windowed one; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    const patch = st.heal === 'remove' ? this.removePatch(st.s) : st.heal ? this.healPatch(st.s, st.heal) : st.healFrom ? this.healFromPatch(st.s, st.healFrom) : st.s.commit();
export const VERSION = '1.60.6';
```

## Strokes in a window on large layers · _v1.60.6 (engine/stroke.ts, engine/renderer.ts, engine/index.ts)

DEV_PLAN 26.2, the stroke's surfaces bounded. On a layer of more than 16 megapixels (`strokeWindowFrom`, settable so a check can force either way) a pixel stroke keeps its working, paint, selection and texture surfaces only over a window around where it paints, in layer pixels from (`ox`, `oy`): opened at its first dab and grown before any dab that would fall outside it (`ensure`: the union with half again around it, at least 512 pixels, within the layer), its surfaces remade with what they held (the working surface takes the layer's pixels where the window is new, then its old pixels by 'copy' inside the old window) and the old ones shrunk to nothing; each growth asks the engine (`canGrow`, the memory budget with the stroke counted), and a refusal stops the stroke there, which the engine then says. Drawing goes through `toWin` (the window's translation before `toLocal`); bounds stay in layer pixels; `compose` frames, the selection and texture matrices, the working update (the layer's pixels read at their own place), `commit` and `coverageAlpha` are offset by the window; dab bounds come before the dab (an off-layer dab still takes its tip, so Color Dynamics' sequence holds). A Brush Settings shape, Wet Edges (`setShape`) and Quick Mask (`keepWhole`, its working surface read whole) keep surfaces the layer's size, as do smaller layers and mask strokes. The display: the override carries a windowed stroke as a `patch`; the renderer draws a patched layer through its buffered path, the layer's pixels and then the patch with 'copy' clipped to the window (`patchIn`), likewise for a clipping base, and keeps it from the effects cache; the GPU display hands that document to the CPU while the stroke lasts. The engine asks room for a first window around the brush rather than the whole layer, and counts the stroke in progress. Not done here: undo patches as tiles (the stroke's patch is still its touched rectangle). Verified in the browser: the same strokes windowed and full-size byte for byte equal through the engine's stroke calls (soft round, hard round, pencil, eraser on a filled layer, inside a selection, one long stroke regrowing the window, and in the far corner of a 6,000 by 4,000 layer with the window at 3,862, 2,362, with and without a selection); by real input, the canvas mid-stroke red on the stroke and the layer's own blue far from it and just outside the window, the layer red there after; on the 4 GB test machine, a stroke across the 150 MP document begun, laid and committed (the count's peak 1,415 MB of 1,800), where 1.60.5 refused it and 1.60.1 lost the page; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import { PixelStroke, spareBytes, warmStrokeSurfaces } from './stroke';
    if (st && st.project === p) m.set(st.layerId, { ...(m.get(st.layerId) ?? {}), ...(st.target === 'pixels' ? { source: st.s.working } : { maskSource: st.s.working }) });
    return n + spareBytes();   // the strokes' spare surfaces, kept for speed (1.60.5, capped at 256 MB)
    if (!this.room(this.layerBytes() * (p.selection ? 3 : 2) + fresh, 'This stroke')) return false;
export interface LayerOverride { source?: Surface; transform?: Transform; maskSource?: Surface; maskPlacement?: Transform; hidden?: boolean; blend?: BlendMode; opacity?: number; effects?: LayerEffects | null }
      const parts = styled && !base && !folders.length && !ov?.source && !ov?.maskSource && !ov?.transform ? this.effectParts(layer, fx as LayerEffects, src, t, own, ov?.maskPlacement ?? null, job.doc.width, job.doc.height) : null;
      if (!own && !folders.length && !base && !pixelBlend && (!styled || parts) && !blendIf && !knock) {
    if (ov?.source || ov?.maskSource || ov?.transform || !layer.raster) return null;
  /** The layer's pixels with the stroke so far composed in. */
  readonly working: Surface;
  private readonly workingCtx: Ctx2D;
  private readonly paint: Surface;
  private readonly paintCtx: Ctx2D;
  private readonly masked: Surface | null;
    this.working = takeSurface(raster.width, raster.height);
    this.workingCtx.drawImage(raster.canvas, 0, 0);
    this.paint = takeSurface(raster.width, raster.height);
    this.masked = selection ? takeSurface(raster.width, raster.height) : null;
    setMat(this.paintCtx, this.toLocal);
    this.wetMark(this.toLocal, p.x, p.y, rx, ry);
    const corners = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([ox, oy]) => applyMat(this.toLocal, p.x + ox, p.y + oy));
    const box = integral(boundsOf(corners));
    const hit = intersectRect({ x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, { x: 0, y: 0, w: this.raster.width, h: this.raster.height });
    if (!hit) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cx = Math.floor(c.x) + 0.5, cy = Math.floor(c.y) + 0.5, rr = r <= 0.75 ? 0.5 : r;
      this.shaped ??= takeSurface(this.raster.width, this.raster.height);
      openFrame(c, area);
          const k = this.shape.texture.scale / 100, m = mul(this.toLocal, [k, 0, 0, k, 0, 0]);
          c.fillRect(area.x, area.y, area.w, area.h);
      openFrame(c, area);
      setMat(c, mul(this.toLocal, translation(this.selection.x, this.selection.y)));
      this.textured ??= takeSurface(this.raster.width, this.raster.height);
      openFrame(c, area);
      setMat(c, mul(this.toLocal, translation(-this.texture.dx, -this.texture.dy)));
    const w = this.workingCtx, { x, y, w: aw, h: ah } = area;
    w.drawImage(this.raster.canvas, x, y, aw, ah, x, y, aw, ah);
    c.drawImage(this.paint, 0, 0);
    c.drawImage(this.working, area.x, area.y, area.w, area.h, area.x, area.y, area.w, area.h);
export const VERSION = '1.60.5';
```

## The opening snapshot in proportion, the stroke pool capped, the count as found · _v1.60.5 (engine/index.ts, engine/stroke.ts)

DEV_PLAN 26.2, continued. Every large canvas made while a document opened was watched (a probe wrapping the canvas constructors with the code path that made each): there were two, the layer and the History panel's opening snapshot, a copy of every pixel (`copyDoc`), taken for any document up to a fixed 768 MB whatever the computer. 1.60.4 had read that copy as a second copy of each layer in the display. The opening snapshot is now skipped past a quarter of the memory budget, with a note (New Snapshot still takes one, and now asks for room); the count is each raster once, the display once, the snapshots it holds, the undo history's extra, and the strokes' spare surfaces. A stroke had grown the browser 620 MB against 263 counted: its working and paint surfaces stayed in a pool of up to four full-size spares kept for speed (35 ms to make against 5 ms to clear at 12 MP), which for a 150 MP layer could be 2.3 GB; the pool now holds at most 256 MB (a larger surface never kept, one dropped shrunk to nothing so its memory comes back at once), counted by the engine (`spareBytes`), and a stroke asks room for its working and paint surfaces (a third with a selection) and a first stroke's new layer. Not done here: the stroke's surfaces bounded to the tiles it touches (they are still each the layer's size). Verified on the 4 GB test machine, run detached with a log: the 150 MP document now grows the browser 1,076 MB (1,592 before), counted 1,144; a 6,000 by 6,000 document 377 counted 412; a stroke on a new layer of it 483 counted 401; unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import { PixelStroke, warmStrokeSurfaces } from './stroke';
    if (!this.autoFirstSnapshot || this.docBytes(p.doc) > this.snapshotByteLimit) return;
    if (Number.isInteger(width) && Number.isInteger(height) && !this.room(width * height * 12, 'A new document')) return null;   // its layer twice and display (1.60.2, recounted 1.60.4)
      // Each raster twice, its canvas and the display's copy of it, and the document's display once more (measured at
      // 1.60.4: one 572 MB layer grew the browser 1.6 GB; two 309 MB layers and a stroke, 1.95 GB); then what the undo
      // history keeps beyond the layers.
      for (const l of p.doc.layers) for (const r of [l.raster, l.mask?.raster]) if (r && !seen.has(r.id)) { seen.add(r.id); n += r.width * r.height * 8; }
    return n;
    // Its working copy, and the layer's own pixels when this stroke is the first on it (1.60.2: measured, both).
    const fresh = p.activeLayer && !p.activeLayer.raster ? p.doc.width * p.doc.height * 8 : 0;   // its canvas and the display's copy (1.60.4)
    if (!this.room(this.layerBytes() + fresh, 'This stroke')) return false;
  if (spares.length >= MAX_SPARES) spares.shift();
export const VERSION = '1.60.4';
```

## Memory back on close, and the count as measured · _v1.60.4 (engine/index.ts, engine/history.ts)

DEV_PLAN 26.2, first part (the stroke's bounded working pixels are the second). Closing a document now shrinks to nothing each of its canvases that no other open document keeps, in its layers or its undo history (`History.rasters`, `rastersOf`: pixels, masks, smart objects' sources and filter masks, patches), so the browser frees them at once; measured, the browser went from 2,502 MB to 1,229 MB within three seconds of closing the 150 MP document, where at 1.60.2 it stayed at 2,579 MB. The count recalibrated from two measurements: one 572 MB layer grew the browser 1.6 GB, and two 309 MB layers with a stroke 1.95 GB, so each raster counts twice (its canvas and the display's copy) and the document's display once, a new document three layer-sizes, and a first stroke its new layer twice with its working copy. Found on the way: the e2e WebGL2 runs left the engine down, and a wait loop that does not check what it waited for hid it; the loop now reports. M8's baseline taken: e2e/test_gl_display.py (the test the earlier split failed 3 of 3) passes 3 of 3 on today's engine, 30 tests each. The README's TypeScript count 39,300 to 40,600 (the counts check: the code has 40,583). Verified on the 4 GB test machine, run detached with a log: the 150 MP document opens (Memory 1.7 of 1.8 GB), closes back to 1,229 MB; a 9,000 by 9,000 document counts 0.9 GB and refuses a stroke on a new layer ("needs about 927 MB more, and formvis is holding 927 MB of the 1,800 MB"), the browser at 2,075 MB where the same stroke reached 3,178 MB before; a raster another open document holds keeps its 50 by 50 pixels when its first document closes; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    if (Number.isInteger(width) && Number.isInteger(height) && !this.room(width * height * 8, 'A new document')) return null;   // its layer and display (1.60.2)
      for (const l of p.doc.layers) for (const r of [l.raster, l.mask?.raster]) if (r && !seen.has(r.id)) { seen.add(r.id); n += r.width * r.height * 4; }
      // The display holds two document-size copies (measured at 1.60.2: a 150 MP document grew the browser by 1.6 GB, its
      // one layer 572 MB of it), and the undo history what it keeps beyond the layers.
      n += p.doc.width * p.doc.height * 8 + p.history.retained(p.snapshot());
    const fresh = p.activeLayer && !p.activeLayer.raster ? p.doc.width * p.doc.height * 4 : 0;
export const VERSION = '1.60.3';
```

## Markup: arrows, callouts, highlights and redaction · _v1.60.3 (engine/markup.ts and extensions/tools/markup.ts new; engine/index.ts, engine/shape-paths.ts, engine/types.ts; extensions/tools/index.ts; app.ts)

The register's L2 remainder (DEV_PLAN 23.13). The Markup tool, grouped with Note and Count (I): a drag makes a mark as its own vector layer, one step, in the markup colour and width the options set: Arrow (tail to tip, `linePath` with a head in proportion), Callout (a white rounded box outlined in the colour, where the drag ends, its tail a notch reaching back to where it began), Highlight (yellow, Multiply at 60%), Redact (a black box named Redaction N). `engine/markup.ts` is the pure geometry (`markupPath`, `MARKUP_KINDS`); `shape-paths.ts` exports `closed` for it; the engine's `addMarkup` renders and inserts, and `applyRedactions` (the tool's Apply Redactions and Layer > Shape > Apply Redactions) burns every Redaction box into the pixels of each layer beneath it as new rasters (undo keeps the old), drops the editable originals of text, shape and smart object layers there (they would keep what is hidden), names the boxes Redacted N, and refuses by name a rotated or scaled layer beneath a box until it is rasterized. Found on the way: the Layer menu and a second menu each have a Shape submenu, and the command was first added to the one not in the Layer menu; both have it. Verified in the browser under 4x CPU throttling with real input: an Arrow layer red at its tip (a Markup Arrow step), a Callout white inside with its tail at the drag's start, a Highlight (Multiply 0.6) reading (255, 238, 102) over white, a Redaction box black; Apply Redactions from the Layer menu one step: the Secret layer's own pixels black beneath the box and red outside it, the Arrow beneath it no longer a vector and black there, the box Redacted 1, the Callout untouched; undo restoring all; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
      'rasterize', 'edit-text', 'warp-text', 'type-on-path', { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-corners'] }, '-',
    { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-corners'] },
const closed = (pts: Pt[]): VectorPath => ({ subpaths: [{ anchors: pts.map(cornerAt), closed: true }] });
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'mixer' | 'artHistory' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'colorSampler' | 'ruler' | 'note' | 'count' | 'contentAwareMove' | 'redEye' | 'rotateView' | 'idle';
  for (const tool of [historyBrushTool, artHistoryTool, mixerTool, frameTool, convertPointTool, selectionBrushTool, pencilTool, eraserTool, magicEraserTool, patternStampTool, backgroundEraserTool, colorSamplerTool, rulerTool, noteTool, countTool, contentAwareMoveTool, redEyeTool, rotateViewTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
export const VERSION = '1.60.2';
```

## Memory known, and refusals instead of a dead page · _v1.60.2 (engine/index.ts; ui/status.ts; automation/agent-bridge.ts; styles/shell.css; app.ts)

DEV_PLAN 26.1, the first stage of the register's M5 (Phase 26, written at this release from measurements: one canvas holds at most 2^28 pixels, past which it draws nothing without an error; WebGL2's largest texture here is 8,192; the register's own 15,000 by 10,000 test opened in 7.1 s and then a second layer and one stroke had the kernel kill the page at 3.45 GB, twice). The engine keeps `memoryBudget`, set by the app to 45% of the memory the engine reports for this computer (1,800 MB here), counts `memoryUse` (every open document's layers and masks, each raster once; two document-size copies for the display, as measured: a 150 MP document grew the browser 1.6 GB with its one 572 MB layer; and what the undo history keeps beyond them), and `room(extra, what)` refuses with a message naming what is needed, what is held and the budget, and what to do. Asked by a new document (its layer and display), duplicating (the copies), a stroke (its working copy, and the layer's first pixels when it is the first stroke: measured, both), and filters through `applyImageEdit` and its async form (source and result); not by a new layer, which holds nothing until painted. The status bar reads "Memory 1.7 of 1.8 GB", amber past 85%. The MCP tool apply_filter now passes on the engine's own reason when a filter fails (it said "a pixel layer is needed" for any failure). Found on the way, by measuring: the first count treated the display as one copy and a first stroke as one copy, and a stroke was let through to 3.5 GB; recounted as measured. Known: closing a document returns its memory to the browser only later (the count says free at once; measured, the browser held 2.58 GB after closing the 150 MP document), for 26.2. Verified in the browser on the 4 GB test machine, run detached with a log: the 150 MP document opens (Memory 1.7 of 1.8 GB, the browser 2.50 GB), an empty layer is added, a stroke on it is refused ("needs about 1,144 MB more, and formvis is holding 1,717 MB of the 1,800 MB"), the page stays alive at 2.56 GB; a small document still paints; after closing it, a 9,000 by 9,000 document takes a stroke (Memory 1.2 of 1.8 GB) and Gaussian Blur over MCP is refused with "needs about 618 MB more, and formvis is holding 1,244 MB of the 1,800 MB"; the page alive; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
          const ok = await this.deps.applyFilter(str('kind'), (a.settings && typeof a.settings === 'object' ? a.settings : {}) as Record<string, unknown>);
      `<span class="cv-st-busy">${icon('loading', 12)}Working</span><span class="cv-st-engine"></span><span class="cv-st-gpu"></span><span class="cv-st-hint"></span>`);
export const VERSION = '1.60.1';
```

## Fades with black or white · _v1.60.1 (engine/video-timeline.ts, engine/index.ts; ui/video-timeline.ts; automation/agent-bridge.ts; styles/shell.css)

The timeline's last carried item, Photoshop's Fade With Black and Fade With White. A fade may carry a colour; without one it fades the layer out of sight as before, with one the layer turns to that colour at the clip's edge while staying opaque: `stateAt` gives the layer a colour overlay of that colour at the fade's strength (1 at the edge falling to 0 over the fade; the stronger end's when both reach a frame), in the main overlay when the layer's own is off and on top of it otherwise, so both renders (through `frameLayers`) and the canvas (through the display override, which now passes any effects that differ from the layer's own by identity) show it. `fadeClip` takes the colour; the transitions menu gains Fade to (Transparent, Black, White) used by its three fades, and a clip draws a coloured fade's ramp in its colour; `videoFrom` reads it back; the MCP tool `timeline_transition` takes `color` and `timeline_get` reports `fade_in_color` and `fade_out_color`, the skill's generated reference regenerated by `./formvis agents sync`. Verified in the browser under 4x CPU throttling with real input, a full red layer over a full blue one at 10 frames a second: Fade In and Out with black over half a second (5 frames each, both ramps black) renders (50, 0, 0) at frame 0, (152, 0, 0) at frame 2, red at 10 and (50, 0, 0) at 19, the blue never showing, and the canvas itself shows (50, 0, 0) at frame 0; undone; saved and read back with its colours; over MCP a white fade-in reads back as white beside the black fade-out and renders (255, 204, 204) at frame 0, where a transparent fade-in shows the blue through (51, 0, 203); no errors. Removed lines taken after the version edit. Removed from frontend:

```text
            tracks: [...p.doc.layers].reverse().filter((l) => vt.tracks[l.id]).map((l) => { const t = vt.tracks[l.id]; return { id: l.id, name: l.name, start: t.start, length: t.length, fade_in: t.fadeIn?.frames ?? 0, fade_out: t.fadeOut?.frames ?? 0,
            const ok = kind === 'remove' ? e.fadeClip(l.id, 0, true, true) : e.fadeClip(l.id, len, kind !== 'fade_out', kind !== 'fade_in');
            return ok ? text(kind === 'remove' ? `Removed ${l.name}'s transitions.` : `${l.name} fades ${kind === 'fade_in' ? 'in' : kind === 'fade_out' ? 'out' : 'in and out'} over ${len} frames.`) : fail('Could not change the transition.');
import { newVideoTimeline, sampleToFrames, stateAt, valueAt, type VideoTimeline } from './video-timeline';
  fadeClip(id: ID, frames: number, inn: boolean, out: boolean): boolean {
      const f = Math.max(0, Math.min(Math.round(frames), t.length));
      if (inn) t.fadeIn = f > 0 ? { frames: f } : null;
      if (out) t.fadeOut = f > 0 ? { frames: f } : null;
        if (s.fx === null && l.effects) o.effects = null;
import { uid, type Doc, type ID } from './types';
export interface Fade { frames: number }
    if (inside && tr.fadeIn && tr.fadeIn.frames > 0) opacity *= clamp((f - tr.start + 1) / tr.fadeIn.frames, 0, 1);
    if (inside && tr.fadeOut && tr.fadeOut.frames > 0) opacity *= clamp((tr.start + tr.length - f) / tr.fadeOut.frames, 0, 1);
    out[l.id] = { visible: l.visible && inside, opacity, x: valueAt(k.x, f, l.transform.x), y: valueAt(k.y, f, l.transform.y), fill: clamp(valueAt(k.fill, f, l.fill ?? 1), 0, 1), fx: styled ? (l.effects ?? null) : null };
  const fade = (v: unknown): Fade | null => (v && typeof v === 'object' && finite((v as Fade).frames) && (v as Fade).frames > 0 ? { frames: Math.round(clamp((v as Fade).frames, 1, duration)) } : null);
import { VIDEO_PROPS, valueAt, type VideoProp, type VideoTimeline } from '../engine/video-timeline';
    pop.append(pick('Fade In', () => this.fade(len(), true, false)), pick('Fade Out', () => this.fade(len(), false, true)), pick('Fade In and Out', () => this.fade(len(), true, true)), pick('Cross Fade', () => this.crossFade()), pick('Remove Transitions', () => this.fade(0, true, true)), lenRow);
      (clip.querySelector('.cv-vtl-fade.is-in') as HTMLElement).style.width = `${(tr.fadeIn?.frames ?? 0) * this.pxPerFrame}px`;   // 1.59.6
      (clip.querySelector('.cv-vtl-fade.is-out') as HTMLElement).style.width = `${(tr.fadeOut?.frames ?? 0) * this.pxPerFrame}px`;
  private fade(frames: number, inn: boolean, out: boolean): void {
    if (!id || !this.engine.fadeClip(id, frames, inn, out)) this.engine.notice('Select a layer with a clip in the timeline.');
export const VERSION = '1.59.9';
```

## The Move tool keys a keyed layer · _v1.59.9 (engine/index.ts; extensions/tools/move.ts)

Carried from phase 25, as Photoshop's: a layer whose Position X or Y has keyframes is moved by keying its new place at the playhead. `keyMove` (one step, named for the gesture: Move Layer or Nudge) keys each keyed axis at the playhead (its value there plus the move) and moves the layer itself on an axis without keyframes; a Move drag of one layer and an arrow-key nudge of one layer go through it. `keyedOffset` is how far the keys place the layer from its own position at the playhead: a transform draft is shown shifted by it (so the drag follows the layer as seen), the Move tool's box and handles are drawn where the layer is seen, and `beginTransform` and `updateTransform` take the pointer back by it, so every mode (move, resize, rotate) computes in the layer's own coordinates and the display adds the offset once. Not for a mask's placement or a group (they keep their own coordinates). Found on the way: the selection is a Set (`size`, not `length`); a probe run in the same command as a failing tsc exercised the broken nudge, as the new rule says it must not. Verified in the browser under 4x CPU throttling with real input, a square keyed from x 0 at frame 0 to 300 at frame 60 and seen at x 150 at frame 30: dragged 50 right and 20 down, the preview mid-drag at 200, the commit keying x 200 at frame 30 and moving its unkeyed y from 80 to 100, one Move Layer step, undone whole; an arrow nudge keying 151 at frame 30 (a Nudge step); an unkeyed layer's nudge moving the layer itself; the cursor a resize handle on the seen box's right edge, and that handle dragged 20 right widening the layer from 40 to 60, seen from 150.1 to 209.6 (no double offset), its keys untouched, a Transform Layer step; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import { newVideoTimeline, sampleToFrames, stateAt, type VideoTimeline } from './video-timeline';
      if (te.group) for (const [id, orig] of te.group.originals) m.set(id, { ...(m.get(id) ?? {}), transform: following(orig, te.group.box, te.draft) });
      else m.set(te.layerId, { ...(m.get(te.layerId) ?? {}), ...(te.mask ? { maskPlacement: te.draft } : { transform: te.draft }) });
  const e = ctx.engine, te = e.transformEdit;
  if (te) return te.draft;
  return e.transformsMask(l) ? l.mask?.placement ?? l.transform : l.transform;
export const VERSION = '1.59.8';
```

## The timeline's empty state, and Split and Convert as single steps · _v1.59.8 (ui/video-timeline.ts; engine/index.ts, engine/history.ts; styles/shell.css; app.ts)

Three items carried from phase 25. The empty state, as Photon's: Window > Timeline, while the document has neither kind of timeline, opens the panel under the canvas with Create Video Timeline, Create Frame Animation (one frame, the document as it is, through the new `startFrameAnimation`, and the frames panel opened) and Close; beside a frame animation it toggles the frames panel as before; beside a video timeline it shows or hides the panel, which a new timeline always shows. Split at Playhead is one step (the layer's copy and the clip's split nested in it), so one undo takes back both. Convert to Frame Animation is one step: snapshots may carry the frame animation (`frames`), which History counts and `restore` puts back, so undo returns the video timeline and redo the frames. Found on the way: the class already had a private `toggle` (Play's), and the second method of the same name silently replaced it in the served page while tsc refused it, so Window > Timeline ran Play's toggle; renamed `toggleOpen`. Also: the gate's "tsc exit" had been read after a pipe into head (head's status, not tsc's); the gate now reads tsc's own (earlier gates were sound, as any error printed). Verified in the browser under 4x CPU throttling with real input: Window > Timeline with no timeline shows the empty state with its three buttons, Close hides it, Create Video Timeline turns it into the timeline, and Window > Timeline then hides and shows it; Split at Playhead one step, one undo removing both the copy and its track; Convert one named step, undone (the video timeline back) and redone (150 frames); Create Frame Animation one frame with the frames panel shown and the panel under the canvas hidden; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
  new VideoTimelinePanel(q(root, '.cv-vtl'), engine, () => renderDialog.show());   // 1.59.3, DEV_PLAN 25.2: under the canvas
    ...ALL_PANELS.map((pn) => ({ id: `panel-${pn.id}`, label: pn.label, checked: () => dock.isShown(pn.id), run: () => dock.toggle(pn.id) })),
export interface Snapshot { doc: Doc; activeId: ID | null; selection: SelectionMask | null; paths?: unknown; video?: unknown }
    if (hooked) snap = { ...hooked, ...(snap.video !== undefined ? { video: snap.video } : {}) };   // the timeline kept (1.59.5)
    if (!p.patches.length && p.before.doc === snap.doc && p.before.selection === snap.selection && pathsSame && videoSame) return false;
    this.duplicateLayers();
    const copy = this.current?.doc.layers.find((l) => !before.has(l.id));
    if (!copy) return null;
    this.editVideo((v) => { const t = v.tracks[id]; if (!t) return; v.tracks[copy.id] = { ...structuredClone(t), start: frame, length: t.start + t.length - frame }; t.length = frame - t.start; }, 'Split at Playhead');
    return copy.id;
  constructor(private readonly root: HTMLElement, private readonly engine: Engine, private readonly renderVideo: () => void = () => {}) {
    const vt = this.engine.video, p = this.engine.current;
    this.root.hidden = !vt || !p;
export const VERSION = '1.59.7';
```

## The video timeline over MCP · _v1.59.7 (automation/agent-bridge.ts; engine/index.ts; ui/video-timeline.ts; app.ts; backend app/routers/mcp.py)

DEV_PLAN 25.5, the last part of the owner's request: agents drive the video timeline as they drive the rest of formvis, through eleven tools named after Photon Studio's timeline operations: `timeline_get` (the model, top track first, keyframes as frame, value and interpolation), `timeline_create`, `timeline_delete`, `timeline_set` (frame rate, length in seconds, work area, loops), `timeline_go_to` (the playhead, not an edit), `timeline_clip`, `timeline_split`, `timeline_keyframe` (with hold, delete and clear), `timeline_transition` (fade_in, fade_out, fade, cross_fade, remove), `timeline_frame_image` (a frame as a PNG) and `timeline_render` (.mp4, .gif or .zip at an absolute path, written by the engine as export_image's file is). Each edit is the engine's undoable step. The engine gains `fadeClip`, `crossFade` and `splitClip`, which the panel now calls instead of its own copies (the panel's code below moved there unchanged in substance); the app's Render Video makes its file in `renderVideoBlob`, which the dialog delivers and the bridge returns. The README's tool count 39 to 50. Found on the way: TypeScript keeps a property read narrowed across a method call, so `e.video` read after `if (e.video) return` and `createVideoTimeline()` typed as null; read with its declared type. Verified as a real MCP client (JSON-RPC to /mcp with the 2026-07-28 meta) driving the open window: the eleven tools listed; a timeline created at 10 frames a second for 2 seconds; Sq keyed from x 0 to 100 over 10 frames and faded in over half a second, read back exactly by timeline_get; frame 5 as a 200 by 100 PNG with the square at x 50, fully in; Sq split at frame 10 (the copy's id returned); an MP4 of 20 frames at 200 by 100, a 20-frame GIF and a 20-file zip written; the playhead to 15 in the window; the history Place, Create Video Timeline, Make Keyframe, Make Keyframe, Add Transition, Duplicate Layer, Split at Playhead (a clip edit changing nothing made no step); one undo taking the split back; delete; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    if (!p || !vt) return;
      if (!s) return;
    if (c.format === 'gif') await deliver(new Blob([encodeGif(gif, w, h, vt.loops)], { type: 'image/gif' }), `${base}.gif`);
    else if (c.format === 'png') await deliver(await api.videoSequence(pngs, base), `${base}-frames.zip`);
    else await deliver(await api.encodeVideo(pngs, pngs.map(() => delay)), `${base}.mp4`);
    toast(`Rendered ${c.to - c.from} frames.`);
    const e = this.engine, vt = e.video, p = e.current, id = p?.activeId;
    if (!vt || !p || !id) return;
    const tr = vt.tracks[id], ph = vt.current;
    if (!tr || ph <= tr.start || ph >= tr.start + tr.length) return;
    const before = new Set(p.doc.layers.map((l) => l.id));
    e.duplicateLayers();
    const copy = e.current?.doc.layers.find((l) => !before.has(l.id));
    if (!copy) return;
    e.editVideo((v) => { const t = v.tracks[id]; v.tracks[copy.id] = { ...structuredClone(t), start: ph, length: t.start + t.length - ph }; t.length = ph - t.start; }, 'Split at Playhead');
    const id = this.engine.current?.activeId, vt = this.engine.video;
    if (!id || !vt?.tracks[id]) { this.engine.notice('Select a layer with a clip in the timeline.'); return; }
    this.engine.editVideo((v) => {
      const t = v.tracks[id];
      if (!t) return;
      const f = Math.min(frames, t.length);
      if (inn) t.fadeIn = f > 0 ? { frames: f } : null;
      if (out) t.fadeOut = f > 0 ? { frames: f } : null;
    }, frames > 0 ? 'Add Transition' : 'Remove Transition');
    const e = this.engine, vt = e.video, p = e.current, id = p?.activeId;
    const a = id ? vt?.tracks[id] : undefined;
    if (!vt || !p || !id || !a) { e.notice('Select a layer with a clip in the timeline.'); return; }
    let best: { id: string; len: number } | null = null;
    for (const [other, b] of Object.entries(vt.tracks)) {
      if (other === id) continue;
      // Only a clip that starts or ends within this one makes a transition with it; one covering it whole does not.
      const covers = b.start <= a.start && b.start + b.length >= a.start + a.length;
      const len = Math.min(a.start + a.length, b.start + b.length) - Math.max(a.start, b.start);
      if (len > 0 && !covers && (!best || len > best.len)) best = { id: other, len };
    }
    if (!best) { e.notice('Cross Fade needs another clip that starts or ends within this one.'); return; }
    const order = p.doc.layers.map((l) => l.id), upper = order.indexOf(id) > order.indexOf(best.id) ? id : best.id, lower = upper === id ? best.id : id, len = best.len;
    e.editVideo((v) => {
      const u = v.tracks[upper], l = v.tracks[lower];
      if (!u || !l) return;
      if (u.start >= l.start) u.fadeIn = { frames: len }; else u.fadeOut = { frames: len };
    }, 'Add Transition');
export const VERSION = '1.59.6';
```

## Transitions and Render Video · _v1.59.6 (ui/panels/render-video-dialog.ts new; ui/video-timeline.ts; io/api.ts; styles/shell.css; app.ts; backend app/routers/video.py)

DEV_PLAN 25.4. The panel's bar gains Add Transition, a small menu built once (Fade In, Fade Out, Fade In and Out, Cross Fade, Remove Transitions, and the length in seconds), acting on the selected layer's clip as an undoable step; each clip shows its fades as ramps over its ends. Cross Fade, as Photoshop's: with the clip that starts or ends within the selected one and overlaps it most, over the overlap, fading only the upper of the two (in when it starts later, out when it ends first) so the lower shows through and the picture never dips. Render Video (`RenderVideoDialog`, File > Export > Render Video and the panel's Render): H.264 MP4 (over white), an animated GIF (formvis's encoder) or a PNG sequence (numbered, zipped by the engine's new `/api/video/sequence`); all frames, the work area, or frames from and to; document size, half or a quarter; the dialog says how many frames, how long and how big. Found on the way: the first Cross Fade paired with the full-length white Background, which overlaps everything most, and faded the clip in over its whole length; a clip covering the selected one whole is now no partner. Not yet: fades from black or white (they blend toward a colour, which opacity cannot carry). Verified in the browser under 4x CPU throttling with real input: Cross Fade on a clip starting at 60 over one ending at 90 gives a 30-frame fade-in, the picture nearly all blue at 60, half red at 75, full red at 89, never white, its ramp 240 pixels at 8 a frame; Fade In and Out at 0.5 seconds gives 15 and 15, undone with Ctrl+Z; frames 60 to 90 at half size render as a 30-frame 100 by 50 GIF, a zip of T_00001.png to T_00030.png at 100 by 50, and a 30-frame 100 by 50 MP4; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
  new VideoTimelinePanel(q(root, '.cv-vtl'), engine);   // 1.59.3, DEV_PLAN 25.2: under the canvas
      { label: 'Export', items: ['export-as', '-', 'export-png', 'export-jpg', 'export-webp', 'export-avif', 'export-tiff', 'export-hdr', 'export-exr', 'export-pdf', 'export-gif', 'export-mp4', '-', 'export-psd', 'export-psb', 'export-ora', 'assemble-tiles', '-', 'export-artboards'] },
  constructor(private readonly root: HTMLElement, private readonly engine: Engine) {
      btn('Split at Playhead', '&#9986;', () => this.split()), el('<span class="cv-vtl-gap"></span>'), this.time, this.rate,
    foot.append(this.render, fit, this.zoom);
    const c = el('<div class="cv-vtl-clip" role="group" aria-label="Clip"><span class="cv-vtl-trim is-in" aria-label="Trim start"></span><span class="cv-vtl-clip-name"></span><span class="cv-vtl-trim is-out" aria-label="Trim end"></span></div>');
export const VERSION = '1.59.5';
```

## Timeline edits as undo steps · _v1.59.5 (engine/history.ts, engine/index.ts; ui/video-timeline.ts)

Carried from 25.2 and 25.3, and needed by 25.5's MCP. A snapshot may carry a copy of the video timeline (`video`), as a path edit's carries the paths; `History.end` keeps a step whose timeline changed (and a hooked snapshot keeps the timeline it carries), and `restore` puts a step's timeline back, the playhead staying where it is. `editVideo` takes a name for a one-shot step; `beginVideoGesture` and `endVideoGesture` make a drag one step from press to release; an edit with neither is live and no step (the playhead moving). Create Video Timeline and Delete Timeline are steps. The panel names its edits as Photon titles them: Make Keyframe, Keyframe Animation, Delete Keyframe, Keyframe Interpolation, Set Timeline Frame Rate, Split at Playhead, and the gestures Move Clip, Trim Layer Start, Trim Layer End and Move Keyframe. Found on the way: History drops a step that changed neither the document nor the selection unless it carries changed paths, so the first build's timeline steps were silently dropped (the first undo after creating a timeline removed the layer before it); the timeline now counts like the paths. Not yet: Convert to Frame Animation is not a step (the frame animation is not kept in snapshots); Split at Playhead is two (Duplicate Layer, then the split). Verified in the browser under 4x CPU throttling with real input and Ctrl+Z and Ctrl+Shift+Z: Create Video Timeline a step, undone (no timeline) and redone; three scrubs, no steps; the stopwatch and a typed key, two steps undone one by one and redone; a clip dragged in eight moves one Move Clip step, one undo putting it back; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
export interface Snapshot { doc: Doc; activeId: ID | null; selection: SelectionMask | null; paths?: unknown }
    if (hooked) snap = hooked;
    // A step that changed nothing is dropped; a path edit's step (it carries the paths) counts when the paths changed.
    if (!p.patches.length && p.before.doc === snap.doc && p.before.selection === snap.selection && pathsSame) return false;
    this.timelines.set(p, { ...t, video: newVideoTimeline(p.doc, fps, seconds) });
  /** Delete Timeline (the video one). */
    const p = this.current;
    if (!p || !this.timelineOf(p).video) return false;
  /** The video timeline changed through `fn` on a copy, then put in place and shown. */
  editVideo(fn: (vt: VideoTimeline) => void): boolean {
    this.engine.editVideo((v) => { const d = Math.max(1, Math.round(f * s)); v.fps = f; v.duration = d; v.workOut = Math.min(Math.max(v.workOut, 1), d); v.workIn = Math.min(v.workIn, v.workOut - 1); v.current = Math.min(v.current, d - 1); });
    e.editVideo((v) => { const t = v.tracks[id]; v.tracks[copy.id] = { ...structuredClone(t), start: ph, length: t.start + t.length - ph }; t.length = ph - t.start; });
    });
      this.engine.editVideo((vt) => { const tr = vt.tracks[id]; if (!tr) return; if (tr.keys[prop]?.length) delete tr.keys[prop]; else tr.keys[prop] = [{ t: vt.current, v, interp: 'linear' }]; });
      if (ks.some((k) => k.t === vt.current)) this.engine.editVideo((v) => { const tr = v.tracks[id]; if (!tr) return; tr.keys[prop] = (tr.keys[prop] ?? []).filter((k) => k.t !== v.current); if (!tr.keys[prop]?.length) delete tr.keys[prop]; });
      const up = (): void => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); delete d.dataset.t; if (!moved) this.engine.setVideoTime(t0); };
      this.engine.editVideo((v) => { const k = v.tracks[id]?.keys[prop]?.[i]; if (k) k.interp = k.interp === 'hold' ? 'linear' : 'hold'; });
      const up = (): void => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); };
export const VERSION = '1.59.4';
```

## The video timeline's keyframe lanes · _v1.59.4 (ui/video-timeline.ts; styles/shell.css)

DEV_PLAN 25.3, as Photon's lanes. Each track's head gains an expand chevron; opened, the track shows a lane per property under its clip (Position X, Position Y, Opacity, Fill Opacity, Style), each with a stopwatch (on keys the value at the playhead; off clears the lane), the value at the playhead in an inline field (pixels, percent, or 1 and 0 for style; typed with the stopwatch on it keys the playhead, off it changes the layer itself as an undoable step, style always keying), previous and next keyframe, and add or delete at the playhead; the lane's strip carries a diamond per keyframe, dragged to move it in time, clicked to go there, right-clicked to switch linear and hold (hold drawn in the accent). Heads, lane heads, strips and diamonds are kept by layer and property and moved by transform. Verified in the browser under 4x CPU throttling with real input: a track opened shows the five lanes; the Opacity stopwatch at frame 0 and 0 typed at frame 30 make keys (0, 1) and (30, 0), and the render at frame 15 is half faded (255, 126, 126); Position X keyed 0 at frame 30 and 200 at frame 60 puts frame 45 at 100; previous keyframe from 60 goes to 30; a diamond dragged from 30 to 40, right-clicked to hold, and deleted at 40 with the add or delete button; the X stopwatch off clears its keys; 50 typed with it off moves the layer itself (a "Move" step); layout shift 0; no errors. Not yet: canvas edits at the playhead keying (the Move tool dragging a keyed layer), the panel's own empty state, timeline edits as history steps. Removed lines taken after the version edit. Removed from frontend:

```text
import type { VideoTimeline } from '../engine/video-timeline';
    this.rows.style.height = `${layers.length * ROW_H}px`;
    const live = new Set(layers.map((l) => l.id));
    layers.forEach((l, i) => {
      if (!head) { head = el('<div class="cv-vtl-head"></div>'); this.heads$.set(l.id, head); this.heads.append(head); }
      setText(head, l.name);
      head.style.top = `${RULER_H + i * ROW_H}px`;
      clip.style.transform = `translate(${tr.start * this.pxPerFrame}px, ${i * ROW_H + 3}px)`;
    });
export const VERSION = '1.59.3';
```

## The video timeline's panel under the canvas · _v1.59.3 (ui/video-timeline.ts new; engine/index.ts; styles/shell.css; app.ts)

DEV_PLAN 25.2. `VideoTimelinePanel`, in the shell from the start (a `.cv-vtl` section under the stage, in the canvas column) and shown while the document has a video timeline, as Photon's and Photoshop's: a bar (first frame, previous, play and pause, next, Split at Playhead; the timecode, a click for Go to Time; the frame rate and length, a click to set them; Convert to Frame Animation; Delete Timeline), a ruler of seconds with frame ticks and the work area's ends shaded, where a click or a drag moves the playhead, a track per layer in the Layers panel's order with its name and clip (dragged to move, its ends dragged to trim), the playhead's line, the track names scrolling with the lanes, and a foot (frames to render, Fit, zoom). Tracks are made once per layer and then only moved and resized by transform; the panel's height is fixed, so scrubbing and dragging change no layout. Split at Playhead duplicates the active layer and gives the copy the clip's rest with the same keyframes. The engine: the canvas shows the playhead's frame through the layers' display overrides (hidden outside a clip, keyed position, opacity with fades, style), the layers themselves unchanged; a stroke's working pixels now merge with that override rather than replacing it; `editVideo` redraws; `setVideoTime`. File > Create Video Timeline after Video Frames to Layers (the panel's own empty-state choice comes with 25.3). Found on the way: the panel's grid column was automatic and grew to the ruler's full width, running under the panels (now `minmax(0, 1fr)`); in the test window the Properties column is collapsed with its Character flyout open over the canvas, as flyouts are, which covers the panel's right corner. Not yet: timeline edits are not history steps; the canvas does not show Fill Opacity keyframes (renders and exports do); Go to Time and the frame rate ask through the browser's prompt. Verified in the browser under 4x CPU throttling with real input: the panel under the canvas within its column after the menu command (30 fps, 150 frames, three tracks); a drag on the ruler to frame 30 (timecode 00:00:01:00) and the canvas showing the keyed square at document x 150.1 where its keyframes say 150; a clip dragged 10 frames on (start 10) and its start trimmed 10 frames (start 20, length 140); Split at Playhead at frame 30 (Sq 0+30, Sq copy 30+120); Play from 30 to 66 in about 1.2 seconds; layout shift 0 from the first scrub; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    { label: 'File', items: () => ['new', 'open', 'import', 'import-video', 'place-linked', 'place-3d', ...(recent.length ? [{ label: 'Open Recent', items: [...recent.map((_, i) => `recent-${i}`), '-', 'clear-recent'] }] : []), '-', 'save', 'save-as', 'download-project', '-',
    if (st && st.project === p) m.set(st.layerId, st.target === 'pixels' ? { source: st.s.working } : { maskSource: st.s.working });
export const VERSION = '1.59.2';
```

## The video timeline's model and evaluation · _v1.59.2 (engine/video-timeline.ts new; engine/timeline.ts, engine/index.ts; app.ts)

DEV_PLAN 25.1, the first part of the owner's request that formvis's timeline work like Photon Studio's (PHOTON_TIMELINE_ANALYSIS.md in the sidecar: Photoshop's video timeline). `engine/video-timeline.ts`, pure functions: the model (frame rate, duration, current frame, work area, loops; per layer a track with its clip's start and length, keyframes of Position X and Y, Opacity, Fill Opacity and Style each linear or hold, and fades at the clip's ends), `newVideoTimeline` (a track per layer across the whole, 30 frames a second and 5 seconds by default, as Photoshop and Photon start), `valueAt`, `stateAt` (each layer shown only inside its clip, its properties from its keyframes or its own, its opacity eased by the fades, its style kept or set aside), `sampleToFrames`, and `videoFrom` (read back checked and bounded). `timeline.ts`: a frame's layer state may carry Fill Opacity (`frameLayers` applies it), and the timeline carries `video`, saved by `timelineData` and read by `timelineFrom` (a timeline with only a video one is kept). The engine: `video`, `createVideoTimeline` (refused beside a frame animation or a second one, Photoshop's two modes being one or the other), `deleteVideoTimeline`, `editVideo`, `renderVideoFrame`, `convertVideoToFrames`; Video (MP4) renders a video timeline's work area at its frame rate. The panel is 25.2. Verified in the browser on a 200 by 100 document: created at 10 frames a second for 2 seconds (20 frames, three tracks, the work area whole), a second creation refused; a red square keyed from x 0 to 100 and opacity 0 to 1 over 10 frames reads (255, 126, 126) halfway at frame 5 and (255, 0, 0) at x 100 at frame 10, white where it starts at frame 0; a blue square's clip from frame 5 for 10 frames is absent at 4, there at 5 and 14, absent at 15; hold keeps the square at x 0 at frame 9 (fading in: 255, 24, 24) until frame 10; saved and read back through the project format exactly; Video (MP4) through the real menu 20 frames at 10 a second, 2.0 seconds; Convert to Frame Animation 20 frames of 100 ms, the video timeline gone; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
        const t = engine.timeline, frames = t.frames.length ? t.frames : [null], pngs: Blob[] = [], delays: number[] = [];
          const s = engine.renderFrame(f);
export interface FrameLayer { visible: boolean; opacity: number; x: number; y: number; fx?: LayerEffects | null }
/** `loops`: 0 repeats forever. */
export interface Timeline { frames: Frame[]; current: ID | null; loops: number }
    if (!styled && s.visible === l.visible && s.opacity === l.opacity && s.x === l.transform.x && s.y === l.transform.y) return l;
    return { ...l, visible: s.visible, opacity: s.opacity, transform: { ...l.transform, x: s.x, y: s.y }, ...(styled ? { effects: s.fx ? structuredClone(s.fx) : null } : {}) };
export function timelineData(t: Timeline | null): { loops: number; current: ID | null; frames: Frame[] } | null {
  return t && t.frames.length ? { loops: t.loops, current: t.current, frames: t.frames.map((f) => ({ id: f.id, delay: f.delay, state: f.state })) } : null;
  if (!frames.length) return null;
  return { frames, loops, current: typeof o.current === 'string' && frames.some((f) => f.id === o.current) ? o.current : frames[0].id };
export const VERSION = '1.59.1';
```

## Z1: opening a document no longer moves the dock · _v1.59.1 (styles/panels.css)

The register's Z1, found at 1.58.9. Measured with every shift's element and boxes: a first document of ten layers made the Layers panel's footer buttons go from y 838 to no box at all, and a one-layer document after it brought the footer back at y 827. The Layers panel was told `flex-shrink: 0` with an automatic basis (the owner's walkthrough: keep room for its controls and rows), which meant never smaller than all its rows: with ten it grew to 641 pixels, the dock overflowed (1020 in 832) and the footer fell below the dock's visible bottom (1015 against 872). It is now `flex: 1 1 0` with the same 230-pixel minimum: it fills what the other panels leave, gives way to its minimum, and never grows with its rows, so its list scrolls inside (441 pixels of rows in 253) and the footer stays at 827 whatever the document holds; the dock overflows only when its panels and that minimum truly exceed it. Verified in the browser: one layer and ten measure the same (the section 453 pixels, the footer at 827, the dock not overflowing); layout shift 0.00000 opening a first document of ten layers, a second of one, a third of three, and clicking back to the first tab. Then DEV_PLAN 25, the video timeline. Removed lines taken after the version edit. Removed from frontend:

```text
.cv-layers > .cv-layers-panel { min-height: 230px; flex-shrink: 0; flex-grow: 1; }
export const VERSION = '1.58.9';
```

## Video Frames to Layers and Video (MP4), and L1 closed · _v1.58.9 (ui/panels/video-dialog.ts new; engine/index.ts; io/api.ts; app.ts; backend app/routers/video.py new, app/main.py)

The parity plan's L1, the last open row. File > Video Frames to Layers (after Import Images), as Photoshop's: `VideoImportDialog` (built once) reads a chosen clip's size, frame rate and length through the engine, takes From and To in seconds and Every Nth frame, says how many frames that is (300 at most), and Make Frame Animation; `api.videoFrames` brings the frames, and `Engine.openFrames` opens a new document with one layer each (Frame 1 at the bottom) and, with the animation, a Timeline in which each frame shows its own layer alone for the clip's delay. File > Export > Video (MP4) (after GIF): `exportMp4` draws each animation frame over white (video keeps no transparency) and `api.encodeVideo` has the engine write H.264, each frame for its delay. Verified in the browser under 4x CPU throttling through the real menus with a real clip (a pan and zoom over scikit-image's NASA rocket, 3 seconds at 10 frames a second, made by ffmpeg): the dialog said "640 by 426, 10 frames a second, 3.0 seconds" and, From 1 To 2, "takes 10 frames"; the document opened with Frame 1 to Frame 10, Frame 1 alone visible, ten animation frames of 100 ms each showing one layer; Frames 1, 5 and 10 equal the clip's frames 10, 14 and 19 exactly; Delete Frame left nine; the MP4 is H.264, 640 by 426, 10 a second, 9 frames, 0.9 seconds, its first frame 1.44 levels from the layer it shows (the codec on that picture alone: 1.46); the GIF has nine frames of 100 ms; no errors. (Probe slips: Delete Frame removes the current frame, the first, so the MP4 starts on Frame 2; the GIF item is "Export GIF...".) A zero-flash finding, not this release's: opening a document moves icons and the panels' foot as the dock fits it (0.00016 for a first document of ten layers, 0.00103 for a one-layer document after it), reproduced with documents made by script, so older than video; earlier probes opened their documents before measuring and missed it. Recorded in the register for its own fix. Removed lines taken after the version edit. Removed from frontend:

```text
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', 'place-3d', ...(recent.length ? [{ label: 'Open Recent', items: [...recent.map((_, i) => `recent-${i}`), '-', 'clear-recent'] }] : []), '-', 'save', 'save-as', 'download-project', '-',
      { label: 'Export', items: ['export-as', '-', 'export-png', 'export-jpg', 'export-webp', 'export-avif', 'export-tiff', 'export-hdr', 'export-exr', 'export-pdf', 'export-gif', '-', 'export-psd', 'export-psb', 'export-ora', 'assemble-tiles', '-', 'export-artboards'] },
export const VERSION = '1.58.8';
```

## The library in any folder, conflict-safe saves, and L13 closed · _v1.58.8 (engine/project.ts; io/api.ts; ui/app-dialogs.ts; app.ts; backend app/core/config.py, app/routers/projects.py)

The parity plan's L13 (a share link stays out of scope while formvis has no server). `Project.libraryVersion` keeps the library file's version (its modification time and size) from the open (`openOpened`, from the engine's answer) and from each save; Save to Library sends it as `base` when saving over the same library item, and when the engine answers with a conflict the project follows the copy it was saved as, and a toast says plainly what happened. Preferences > File Handling gains the library's folder, built once and filled on opening: where it is now, a choice of formvis's own folder, the synced folders the engine finds (iCloud Drive, Dropbox, OneDrive, Google Drive, a Formvis folder suggested in each) or another folder, its path, Move my projects there, and Use this folder; a library fixed by FORMVIS_LIBRARY_DIR is said to be so. The README's line counts follow the code (39,300 TypeScript, 1,300 CSS, 9,200 Python). Verified in the browser under 4x CPU throttling: Poster opened through the Open dialog (select, then Open), another device's copy written into the file, Save: it went beside it as "Poster (conflict 2026-10-02 03.41.43)", the other version byte for byte, the toast saying so, and the next Save went on to the copy; Preferences said "The library is in /tmp/formvisdata/Projects.", another folder with Move took both projects ("2 projects moved there") and the library listed them from there, and the default brought them back, the other folder left empty; no errors. (Probe slips, fixed: the Open dialog opens on Open or a double-click, not a click; the first read of the status took another section's note.) Removed lines taken after the version edit. Removed from frontend:

```text
        const res = await api.save(target, manifest, files);
        toast(`Saved ${res.name}.`);
export interface OpenedProject { session: string; name: string; manifest: Record<string, unknown>; images: Record<string, string> }
  async save(name: string, manifest: object, files: FilePart[]): Promise<{ name: string; path: string }> {
    return (await (await request('/projects/save', { method: 'POST', body: form({ name, manifest: JSON.stringify(manifest) }, files) })).json()) as { name: string; path: string };
    add('File Handling', mismatch, restore, el('<p class="cv-note">Every open document is kept on this device, in its tab order, and opens again at the next start, saved or not. Off, only unsaved work is kept, and formvis asks after a crash.</p>'), this.recoveryRow.el, el('<p class="cv-note">Unsaved documents are kept on this device so they can be recovered after a crash; this is how soon after a change that happens.</p>'));
export const VERSION = '1.58.7';
```

## The compact layout, and L12 closed · _v1.58.7 (styles/shell.css; app.ts)

The parity plan's L12, second part, closing the row with the gestures (1.58.6). Under 720 pixels (shell.css's compact block, at the end of the file so it wins): the canvas takes the whole width; the tool rail, the panel dock and the side column become sheets over it (the rail from the left, the others from the bottom, at `--z-chrome` so menus and dialogs stay above), moved by transform alone so the canvas never reflows, closed fully clear of the screen with their shadows, the bottom ones scrolling their panels; the title bar keeps undo, redo, Preferences and three sheet buttons (in the shell from the start, shown only here), the zoom buttons and the title tools (theme, command search, workspaces) wait in the menus and Preferences, the menu bar takes the rest and scrolls, the options bar scrolls, and the app clips anything wider than the screen. `openSheet` (app.ts) opens one sheet and closes the others, a second press closes it, and a tap on the canvas with a sheet open closes it and paints nothing. Found on the way: closed sheets at a 105% slide still showed 3 pixels and their shadow over the status bar; the title bar's groups (366 and 262 pixels) left the menu bar no width and made the app 694 pixels wide, so a tap scrolled the page 211 pixels sideways; the dock's panels (658 pixels) overflowed a 506-pixel sheet. A first screenshot of the Panels sheet showed nothing, taken before the throttled transition painted; a second, later, shows it. Verified at 390 by 844 with touch and 4x CPU throttling, by real taps: the app 390 wide, the stage the full width and unmoved throughout; the sheets off screen at rest, each opening alone, closing again, closing on a canvas tap without a step, while a tap with none open paints; the menu bar scrolls; layout shift 0; no errors; looked at with the Tools and Panels sheets open; at 1400 by 900 the layout as before. Removed lines taken after the version edit. Removed from frontend:

```text
export const VERSION = '1.58.6';
```

## Touch gestures · _v1.58.6 (ui/stage.ts)

The parity plan's L12, first part (DEV_PLAN 23.11). `Stage.bindTouch`, bound before the tools' pointer handling with capture-phase listeners that stop a gesture's fingers from reaching the tools (pens and mice pass straight through; pen pressure and tilt already reach the brushes): one finger works the tool; a second finger cancels what the first began and starts a gesture in which the spread zooms about the midpoint, the midpoint's travel pans (turned into the view's frame as the wheel does), and turning the fingers turns the view once past 10 degrees; a quick tap of two fingers undoes, of three redoes. Found on the way, by recording the pointer events at the window: fingers were first measured against the overlay's box, which is turned with the view, so it grew as the view turned and still fingers seemed to move (a 30-degree turn ended at 25.74, then at 44.46 once lifts were applied); they are now measured against the stage's host, as `pointer` does. A second finger arriving mid-stroke was taken for a tap and undid the step before; a finger already travelled, or held, now rules a tap out. A lift applies its finger's last position first. Verified in the browser under 4x CPU throttling with real multi-finger touch events (CDP Input.dispatchTouchEvent under touch emulation): one finger paints; a pinch from 100 to 200 pixels doubles the zoom exactly with the point under the midpoint unmoved and the view unturned; a two-finger drag keeps the picture under the fingers exactly; a 30-degree turn turns the view exactly 30 degrees, the zoom unchanged; a two-finger tap undoes and a three-finger tap redoes; a second finger mid-stroke leaves no mark and no step and undoes nothing; layout shift 0; no errors. The compact layout is next. Removed lines taken after the version edit. Removed from frontend:

```text
export const VERSION = '1.58.5';
```

## fal the cloud default, this computer without a key · _v1.58.5 (ui/panels/generate-image.ts, panels/generative-dialog.ts)

The owner's word after 1.58.4: fal reaches all the providers and more of the best image models through one key, so it is the cloud default, and with no key the default is this computer. Generate Image, Generative Fill (and Expand) and Upscale choose, on opening: the person's own choice while it stands (a `picked` flag, set only by the person changing the model or adding a workflow, so a default chosen earlier is never mistaken for a choice); else fal when it has a key; else a model on this computer that is ready (for Fill a ready fill model, then LaMa; for Upscale this computer's Real-ESRGAN); else fal, which then asks for its key. OpenAI, Google, Black Forest Labs and Ideogram are chosen, never defaults. Found on the way: Generative Fill listed its models before it knew fal's state and listed them again after, the second keeping the first's guess as if chosen, so with a key it could open on LaMa; fal's state is now read first and the models listed once. Verified in the browser through the real commands: without a fal key, Generate Image opens on fal (no local picture model is installed here), Fill on LaMa, Upscale on this computer's Real-ESRGAN; with a fal key all three open on fal; LaMa picked with key presses stays picked on reopening. Removed lines taken after the version edit. Removed from frontend:

```text
    this.model.addEventListener('change', () => { this.refs.forFal(this.model.value === 'fal'); this.keyFor(); });
    if ([...this.model.options].some((o) => o.value === was)) this.model.value = was;
    this.model.addEventListener('change', () => this.sync());
    this.status = await api.generativeStatus();
    if (mode !== 'upscale') this.fillModels();   // again, now that fal's state is known
    this.model.value = was === 'local:ai-upscale' && ready ? was : ready ? 'local:ai-upscale' : 'fal';
  /** FLUX.1 Fill on fal, then the kept ComfyUI workflows; the choice kept when it still exists. */
    if ([...this.model.options].some((o) => o.value === was && !o.disabled)) this.model.value = was;
    else if (this.lama && !this.status?.configured) this.model.value = 'local:lama';
export const VERSION = '1.58.4';
```

## More generation providers · _v1.58.4 (ui/panels/generate-image.ts; io/api.ts; backend app/services/providers.py new, app/routers/generative.py)

The parity plan's L7, done here; the real keys are the owner's to try. Edit > Generate Image offers GPT Image (OpenAI), Gemini image (Google), FLUX1.1 [pro] (Black Forest Labs) and Ideogram 3.0 (Ideogram) after fal's FLUX1.1 [pro]; `api.generateImage` takes a provider, `api.providers` and `api.saveProviderKey` read which have keys (never the keys) and keep a key. The key row (built once) keeps its space for every model and shows only for a provider, at one height and with a fixed label: a field and Save key when the provider has none, the field closed with "kept in your password store" and Change when it has; saving says where the key went. Found on the way: hiding the row when the engine answered moved the dialog (0.01475, the save's answer arriving long after the click), and a label naming the provider moved the field sideways (0.00011); both gone. Verified in the browser under 4x CPU throttling through the real Edit menu against stand-in servers (a harness in /tmp answering each provider's documented requests and refusing a wrong key): the five offered by name; OpenAI's picture added as a layer at 1200 by 800; Ideogram with no key shows the field, Save key keeps it (30 pixels high before and after), and its picture arrives; the providers' status reaching the window holds id, name, model, fill, configured and source, no key; with the model chosen by key presses, layout shift 0 and no shifts at all; no errors. (A first probe matched "Generate Image" in the Edit menu's "Undo Generate Image" and so undid the layer instead of opening the dialog; the probe now matches the item's start.) Removed lines taken after the version edit. Removed from frontend:

```text
  /** Edit > Generate Image (1.51.2): a picture from a prompt alone through fal, near the document's shape. */
  async generateImage(prompt: string, width: number, height: number): Promise<Blob> {
    return (await request('/generative/generate', { method: 'POST', body: form({ prompt, width: String(width), height: String(height) }) })).blob();
import { api, ApiError } from '../../io/api';
 *  (a new 1024 by 1024 document when none is open), with FLUX1.1 [pro] on fal or a kept ComfyUI workflow. */
    this.model.addEventListener('change', () => this.refs.forFal(this.model.value === 'fal'));
    this.body.append(this.prompt, this.improver.el, row, this.refs.el, this.status);
    this.model.replaceChildren(el('<option value="fal">FLUX1.1 [pro] (fal)</option>'), ...recipes().map((r) => { const o = document.createElement('option'); o.value = r.name; o.textContent = `${r.name} (ComfyUI)`; return o; }),
export const VERSION = '1.58.3';
```

## Vanishing Point, and L6 closed · _v1.58.3 (engine/vanishing.ts new; ui/panels/vanishing-dialog.ts new; app.ts; README's line counts)

The parity plan's L6, second part, closing the row with Photomerge and Merge to HDR (1.58.2). `engine/vanishing.ts`: `makePlane` (four corners in turn, top left to bottom left, the unit square mapped onto them through `perspective.ts`'s homography, refused when not convex; the plane's proportions as its edges show them), `toImage` and `toPlane`, `rectFor` (a picture's rectangle on the plane, its height following the picture's proportions as the plane shows them), `pasteInPerspective` (each pixel of the rectangle's box read back through the plane into the picture, bilinear, over what is there) and `stampInPerspective` (a dab copying from a fixed offset in plane coordinates, so what it copies shrinks and grows with distance). `VanishingPointDialog` (Filter > Vanishing Point, after Liquify as Photoshop orders it): Create Plane by clicking four corners, Edit Plane by dragging them, a blue grid of eighths showing the perspective, Paste placing another pixel layer on the plane (dragged along it, Paste size as a share of the plane), Stamp cloning in perspective (Alt-click a source on the plane, then paint, Stamp brush in pixels), New plane; the layer worked on a copy, OK one step, Cancel nothing. The README's line counts follow the code (38,800 TypeScript, 8,900 Python). Verified in the browser under 4x CPU throttling with real clicks on a checkerboard floor in perspective (corners 150,100; 450,100; 560,380; 40,380 on 600 by 420): four clicks make the plane and the dialog moves to Edit Plane; the label pasted on it (40% of the plane) is 140 pixels wide at its far edge and 165 at its near edge, centred at x 299.1 against an independent numpy homography's 300.0 for the plane's centre, 4.5 pixels below in y as a rectangle on a receding plane falls; with the source Alt-clicked on a dark square and the stroke on a light one, all nine checked pixels round the destination turned and each equals the floor's pixel at the matching source point (0 levels), the rest untouched; one "Vanishing Point" step each; layout shift 0; no errors. A first stamp check put source and destination on dark squares, where an untouched destination matches too, so it proved nothing; the second moved the destination. Removed lines taken after the version edit. Removed from frontend:

```text
    { label: 'Filter', items: ['filter-develop', 'filter-wide-angle', 'filter-lensCorrection', 'filter-liquify', 'filter-neural', '-',
export const VERSION = '1.58.2';
```

## Photomerge and Merge to HDR · _v1.58.2 (ui/panels/merge-dialog.ts new; io/api.ts; app.ts; backend app/routers/merge.py new, app/main.py)

The parity plan's L6, first part. File > Automate > Photomerge and Merge to HDR, after Batch as Photoshop orders them: `MergeDialog` (one class for both; the photos chosen with a file input; for panoramas the Layout, Auto or Reposition, and Crop to the picture, with a note that Photoshop's Perspective, Cylindrical and Collage are not offered; built once) sends them to the engine (`api.mergePanorama`, `api.mergeHdr`) and opens the result as a new document: the panorama through `openImage` (transparent where no photo reaches, a notice when the stitch kept only some photos), the HDR through `openDeep` at 32 bits (a notice of the exposure times and where they came from). Verified in the browser under 4x CPU throttling through the real menu and dialog: three views of scikit-image's rocket (NASA, public domain) from a virtual camera turning -12, 0 and +12 degrees open as a 582 by 405 "Panorama" with transparent corners; three exposures of it at -2, 0 and +2 stops (clipped, no EXIF) open as a 32-bit "HDR" whose brightest value is 4.07; the menu reads Batch, Photomerge, Merge to HDR; layout shift 0; no errors. Vanishing Point, L6's second part, comes next. Removed lines taken after the version edit. Removed from frontend:

```text
      { label: 'Automate', items: ['actions', 'action-stop', 'batch'] }, ...(hostLink.embedded ? ['send-host'] : ['send-nodemode']), 'send-comfyui', 'comfyui-run', '-', 'close-tab'] },
export const VERSION = '1.58.1';
```

## Opening Lab files, and H1 closed · _v1.58.1 (engine/index.ts; io/api.ts; app.ts; backend app/routers/io.py)

DEV_PLAN 22.11's last item, closing the parity plan's H1 (the owner: finish the CMYK and Lab list before L6). `api.decodeLab` reads the engine's `/io/decode-lab` answer (null for anything not Lab); `Engine.openLabLayers` opens a Lab document from the layers, each one's Lab floats kept and its rendition drawn by the formulas, 16 bits kept for a 16-bit file; `openLab` (app.ts) is called from the import: a PSD tries Lab after CMYK, and a TIFF opened as a new document tries Lab first (before the page count, whose decoder refuses a Lab TIFF and so put a 415 in the console). Verified in the browser through the real import input, each in a fresh window: formvis's own 8-bit Lab TIFF reopens as Lab at 8 bits within its rounding (46.27, 59, 38 and 74.12, -33, -27 for 46.20, 58.67, 38.13 and 73.98, -32.92, -26.85); its 16-bit TIFF reopens at 16 bits exactly; a layered Lab PSD in Photoshop's layout reopens with its two layers in place and both exact (the patch L 78.43, a -30, b -60); a flat one too; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
export const VERSION = '1.57.9';
```

## CMYK and Lab: profiles, the ink Channel Mixer, Lab's channel views · _v1.57.9 (engine/index.ts, compose-float.ts, adjust-params.ts; io/api.ts; ui/channels.ts, panels/colour-dialogs.ts, panels/adjust-panel.ts; app.ts; backend app/routers/colour.py)

DEV_PLAN 22.11's CMYK and Lab remainders, second part. Assign Profile in CMYK lists CMYK profiles, fetches the new press's tables first and `assignCmykProfile` redraws each layer's rendition from its unchanged inks as one step; Convert to Profile in CMYK sends each layer's inks through the engine's `/color/convert-ink` (pure black kept) and `convertCmykProfile` sets them, redrawn, as one step; a document already in the profile is told so. `ensureCmykTables` remembers which profile each document's tables came from (`tablesFor`) and reloads them when undo or redo changes the profile. In Lab, Convert to Profile goes to RGB first (exactly, into sRGB) and on as an RGB document, two steps, and Assign Profile opens Convert (Lab colours are absolute, so a profile is given by converting into it). The Channel Mixer gains ink outputs (Cyan, Magenta, Yellow, Black; each the four inks and a constant), shown in a CMYK document in place of Red, Green and Blue (the panel's select moves to the first that fits and syncs again), and `composeFloat` mixes the inks themselves under the layer's opacity and mask. Lab's channels show alone: clicking Lightness, a or b in the Channels panel sets the engine's channel view, which in Lab draws the channel's own value as grey; clicking Lab shows them all. The CMYK and Lab lists are empty: every command works in every mode and depth. Found on the way: Assign at first changed the inks, because derive (1.55.9) read the redrawn rendition beside the same ink record as an 8-bit edit to fold back; each layer now gets a new ink record with the same values. Test profiles (kept in the sandbox's data, not the repository): pdf.js's CC0 "uCMY" could not be a press here (it has no separation table, so LittleCMS cannot build RGB to CMYK through it); Ghostscript's "Artifex CMYK SWOP Profile" served. Verified in the browser under 4x CPU throttling through the real dialogs: Assign from FOGRA39L to the SWOP profile keeps blue (0.812, 0.596, 0, 0) and black (0, 0, 0, 1) exactly while the display moves from (64, 102, 174) to (62, 107, 180), one step; undo restores profile, inks and display; Convert makes blue (0.839, 0.659, 0.008, 0) and keeps black (0, 0, 0, 1); a Channel Mixer taking Cyan from Magenta composes cyan 0.659 from magenta's 0.659; the real panel's outputs in CMYK are Cyan, Magenta, Yellow and Black; in Lab a click on Lightness shows it alone (its row alone on, the note saying so) and a click on Lab shows all; Assign Profile in Lab opens Convert, and Convert to Adobe RGB leaves "RGB Color" and "Convert to Profile", red at (172, 54, 53); layout shift 0; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    if (!p || p.doc.mode !== 'cmyk' || !p.doc.profile || p.cmykLut || tablesPending.has(p.id)) return;
    try { const t = await cmykLutFor(p.doc.profile); engine.setCmykTables(p, t.out, t.in); } catch (err) { toast(message(err), 'error'); } finally { tablesPending.delete(p.id); }
  const colourDialogs = { assign: new AssignProfileDialog(engine), convert: new ConvertProfileDialog(engine), proof: new ProofSetupDialog(colourView), mismatch: new ProfileMismatchDialog() };
  const CMYK_NOT = new Set(['new-adj-channelMixer', 'assign-profile', 'convert-profile']);
  const LAB_NOT = new Set(['assign-profile', 'convert-profile']);
      { key: 'output', label: 'Output channel', kind: 'select', options: [['red', 'Red'], ['green', 'Green'], ['blue', 'Blue']], def: 'red' },
    if (this.channelView !== null && p.doc.mode === 'cmyk') { for (const l of p.doc.layers) if (l.channels && !m.get(l.id)?.source) m.set(l.id, { ...(m.get(l.id) ?? {}), source: this.channelGrey(l.channels, this.channelView).canvas }); }
    for (let i = 0, o = 0; i < ch.data.length; i += S, o += 4) { const v = Math.round((1 - Math.min(1, Math.max(0, ch.data[i + k]))) * 255); d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = Math.round(Math.min(1, Math.max(0, ch.data[i + ch.n])) * 255); }
        if (isLabRow(r.id)) return;
      if (labRow) { row.classList.toggle('is-on', id === 'lab'); row.querySelector('.cv-ch-eye')?.classList.toggle('is-off', false); continue; }
    setText(this.root.querySelector('.cv-ch-note') as HTMLElement, lab ? 'Lab: Lightness, a and b as greys (a and b mid-grey where neutral). Viewing or painting one Lab channel alone comes later.' : cmyk ? (this.inkSolo ? `The canvas shows ${ROWS.find((r) => r.id === this.inkSolo)?.label} alone (paper white, full ink black); the Brush, Pencil and Eraser paint it alone.` : 'Click an ink to paint it alone; ⌘- or Ctrl-click loads its light areas as a selection.')
      if (s.kind === 'select') { const r = selectRow(s.label, s.options, (v) => put(s.key, v)); return { s, el: r.el, set: () => r.set(String(pv()[s.key] ?? s.def)) }; }
import type { DocProfile } from '../../engine/types';
  constructor(private readonly engine: Engine) {
  async show(): Promise<void> { options(this.sel, await rgbChoices()); setText(this.note, ''); this.open(); }
    try { this.engine.assignProfile(await profileOf(this.sel.value, this.sel.selectedOptions[0]?.textContent ?? '')); this.close(); } catch (err) { setText(this.note, msg(err)); }
  constructor(private readonly engine: Engine) {
    options(this.sel, await rgbChoices()); setText(this.note, '');
    setText(this.body.querySelector('.cv-convert-from') as HTMLElement, `Source: ${this.engine.current?.doc.profile?.name ?? 'sRGB IEC61966-2.1 (the working space)'}`);
export const VERSION = '1.57.8';
```

## CMYK and Lab: 16 and 32 bits, proofs and HDR exports · _v1.57.8 (engine/index.ts; io/api.ts; ui/colour.ts, tabs.ts; app.ts; backend app/routers/io.py, requirements.txt; NOTICE.md)

DEV_PLAN 22.11's CMYK and Lab remainders, first part (the owner: finish them before L6). 16 and 32 Bits/Channel work from every mode (`toDeeper`): CMYK and Lab keep their mode at 16 bits, `setDepth` changing only the depth since their values are floats already (as Photoshop's 16-bit CMYK and Lab); 32 bits takes CMYK and Lab through RGB first, Bitmap through Grayscale and Indexed Color through RGB. Export TIFF from a 16-bit CMYK or Lab document writes 16 bits (`api.encodeTiff16`, the engine's `/io/encode-tiff16` with tifffile: separated inks with the profile embedded; CIELab with a* and b* as signed 16-bit). Radiance HDR and OpenEXR export from any document, below 32 bits as linear light from what the canvas shows. The proof view works in CMYK and Lab, proofing their sRGB rendition (Proof Colors and Gamut Warning still wait for a Proof Setup, as in RGB). The tab names the real depth in RGB, Grayscale, CMYK and Lab. The CMYK list keeps only the ink Channel Mixer and the two profile commands, Lab's only the profile commands: the next release's. Verified in the browser: CMYK at 16 bits stays CMYK, the tab "CMYK/16"; its TIFF read back by tifffile is uint16 separated with the profile embedded and the inks exactly the floats (0.81176, 0.59608, 0, 0); Lab at 16 bits, its TIFF read back as CIELab L 46.201, a 58.672, b 38.129 against the floats' 46.201, 58.675, 38.130; HDR export from CMYK writes a Radiance file; CMYK to 32 bits leaves "RGB Color" then "32 Bits/Channel"; in CMYK, Proof Setup's dialog offers the profiles and intents, then Proof Colors and Gamut Warning enable and run; unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import { composeDeep, deepFromU16, deepToU16, deepToned, place } from './engine/deep';
    if (!p || p.doc.depth !== 32) return;
      const deep = composeDeep(p.doc);
    { id: 'depth-16', label: '16 Bits/Channel', enabled: () => has() && (engine.current?.doc.mode ?? 'rgb') === 'rgb', checked: () => engine.current?.doc.depth === 16, run: () => void toDepth(16) },
    { id: 'depth-32', label: '32 Bits/Channel', enabled: () => has() && (engine.current?.doc.mode ?? 'rgb') === 'rgb', checked: () => engine.current?.doc.depth === 32, run: () => { engine.setDepth(32); } },   // 1.53.9
    { id: 'export-hdr', label: 'Radiance HDR...', enabled: () => engine.current?.doc.depth === 32, run: () => void exportWide('hdr') },
    { id: 'export-exr', label: 'OpenEXR...', enabled: () => engine.current?.doc.depth === 32, run: () => void exportWide('exr') },
  const CMYK_NOT = new Set(['depth-16', 'depth-32', 'new-adj-channelMixer', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
  const LAB_NOT = new Set(['depth-16', 'depth-32', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
    const p = this.engine.current, cmyk = p?.doc.mode === 'cmyk', prof = cmyk ? undefined : p?.doc.profile, s = this.setup, proofing = this.proof && !!s && !cmyk;
    setText(mEl, { rgb: 'RGB/8', grayscale: 'Gray/8', bitmap: 'Bitmap/1', indexed: 'Index', cmyk: 'CMYK/8', lab: 'Lab/8' }[md]);
export const VERSION = '1.57.7';
```

## Every adjustment at 32 bits · _v1.57.7 (engine/compose-float.ts, deep.test.ts under 2a; app.ts)

DEV_PLAN 22.11's 32-bit adjustments. At 32 bits an adjustment other than Exposure acts on each pixel's colour within the display range, the pixel divided by its brightest channel when that passes white and sRGB-encoded, and the brightness above white is scaled back after, so a highlight keeps its light while its colour turns; transfers (Levels, Curves and the like) run in float, and a kernel's change is added to the float, so precision is kept; opacity and masks mix as for Exposure. `DEEP32_NOT` is empty: every command works at 32 bits, as at 16. `deep.test.ts` (under the owner's 2a): its last check expected Levels refused at 32 bits, which this release changes; it now checks that an unchanged Levels composes and keeps (0.25, 2, 8), past white. The README's line counts follow the code (38,500 TypeScript, 8,600 Python). Verified in the browser: all 23 adjustment kinds compose at 32 bits and are offered; Hue/Saturation +120 turns (4, 2, 1) to (1.001, 3.988, 2.011), its brightest channel kept near 4, matching the 8-bit adjustment of the normalised pixel (255, 188, 137 to 137, 255, 188) scaled back; (0.25, 0.5, 0.75) turns to (0.753, 0.247, 0.5); the canvas shows the highlight white; unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
  const DEEP32_NOT = new Set([...ADJUSTMENT_KINDS.filter((k) => k !== 'exposure').map((k) => `new-adj-${k}`)]);
      if (!e) return { error: `${name} is an adjustment that waits at 32 bits (Exposure does).` };
    const refused = composeDeep({ id: 'd', width: 1, height: 1, resolution: 72, depth: 32, layers: [layerOf(), layer({ id: 'y', raster: null, adjustment: lv })] } as unknown as Doc);
    expect('error' in refused && refused.error).toMatch(/Exposure does/);
export const VERSION = '1.57.6';
```

## Select > Sky and Select > Focus Area, and L5 closed · _v1.57.6 (engine/focus-area.ts new; ui/panels/focus-area-dialog.ts new; io/local-gen.ts; app.ts; backend app/localgen/sky.py new, model_manager.py, main.py)

The parity plan's L5. Select > Sky (`selectSky`): what the document shows goes to the engine's sky model and comes back as a soft mask, applied as the selection in one step; a missing model and an empty sky are said. Select > Focus Area: `engine/focus-area.ts` finds the in-focus parts from local sharpness (the Laplacian of brightness, its local energy over about an eightieth of the picture, less the noise floor, as a share of the picture's 99th percentile, kept above a threshold the In-Focus Range sets; holes closed and specks dropped; Soften Edge feathers it; on a copy at most 1,024 pixels long); `FocusAreaDialog` (In-Focus Range, Image Noise Level, Soften Edge, a 360 by 240 preview of the found area over the dimmed picture, a note of how much is in focus; built once) replaces the selection with it on OK. The Select menu orders Color Range, Focus Area, Subject, Sky, as Photoshop's. Verified in the browser under 4x CPU throttling through the real Select menu: on scikit-image's rocket (NASA, public domain) Select Sky took all of the sky band, none of the rocket's body and none of the ground, as "Select Sky"; on the astronaut portrait with its right half blurred (6 px), Focus Area took 29% of the sharp half and 0% of the blurred one (the sharp half's flat wall carries no detail to judge, so a higher range takes more), as "Focus Area"; layout shift 0; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import { findToRemove, localInpaint, modelReady } from './io/local-gen';
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', 'select-subject', 'select-object', 'select-and-mask', '-', 'layer-pixels', 'mask-black', '-',
export const VERSION = '1.57.5';
```

## Grayscale at every depth and from every mode · _v1.57.5 (engine/index.ts; app.ts)

DEV_PLAN 22.11's Grayscale item, and the mode changes CMYK and Lab still held. `convertMode('grayscale')` at 16 and 32 bits greys each layer's floats themselves (16 bits by the 8-bit formula on their encoded values, 32 bits as luminance in linear light with sRGB primaries, light above white kept) and redraws the rendition from them. `setGrayFromLab` takes each layer's grey from its Lightness alone, as Photoshop does. `toRgbFirst` (app.ts) brings a CMYK or Lab document to RGB first, so Bitmap, Indexed Color and Grayscale work from CMYK, and Bitmap, Indexed Color and CMYK from Lab, each as two steps. The 16-bit list is now empty: every command works at 16 bits. Verified in the browser: at 16 bits Grayscale gives 0.463006, the floats' own value between 8-bit levels; painting red in that document lands grey (0.298); at 32 bits (4, 2, 1) becomes 2.3530, its linear luminance, above white; from Lab a red (L 46.2) becomes 109, the Lightness's grey, as two steps (Lab Color, Grayscale); from CMYK, two steps (RGB Color, Grayscale); in a Lab document Grayscale, Bitmap, Indexed Color and CMYK are offered, in CMYK Grayscale, Bitmap and Indexed Color; unit 188; no errors. A first Lab probe asked for Grayscale before Lab Color had finished (it now waits a beat to check the depth) and so measured the RGB formula; the second waited. Removed lines taken after the version edit. Removed from frontend:

```text
  /** Before a mode that needs at most `depth` bits (1.57.3): a deeper document is brought down first, from 32 bits with
    { id: 'mode-cmyk', label: 'CMYK Color...', enabled: () => has() && ['rgb', 'cmyk'].includes(engine.current?.doc.mode ?? 'rgb'), checked: () => engine.current?.doc.mode === 'cmyk', run: () => { if (engine.current?.doc.mode !== 'cmyk') void downTo(8).then((ok) => { if (ok) modeDialog.show('cmyk'); }); } },
    { id: 'mode-grayscale', label: 'Grayscale', enabled: has, checked: () => engine.current?.doc.mode === 'grayscale', run: () => { engine.convertMode('grayscale'); } },
    { id: 'mode-bitmap', label: 'Bitmap...', enabled: has, checked: () => engine.current?.doc.mode === 'bitmap', run: () => void downTo(8).then((ok) => { if (ok) modeDialog.show('bitmap'); }) },
    { id: 'mode-indexed', label: 'Indexed Color...', enabled: has, checked: () => engine.current?.doc.mode === 'indexed', run: () => void downTo(8).then((ok) => { if (ok) modeDialog.show('indexed'); }) },
  const CMYK_NOT = new Set(['depth-16', 'depth-32', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'new-adj-channelMixer', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
  const DEEP16_NOT = new Set(['mode-grayscale']);
  const LAB_NOT = new Set(['depth-16', 'depth-32', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'mode-cmyk', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
  const DEEP32_NOT = new Set([...ADJUSTMENT_KINDS.filter((k) => k !== 'exposure').map((k) => `new-adj-${k}`), 'mode-grayscale']);
export const VERSION = '1.57.4';
```

## Remove People and Remove Distractions, and M1 closed · _v1.57.4 (engine/index.ts; io/local-gen.ts; extensions/tools/remove.ts; app.ts; backend app/routers/remove_find.py new, app/main.py)

The parity plan's M1. The Remove tool's options gain Remove People and Remove Distractions beside Remove Wires and Cables. `app.ts`'s `removeFound` (registered as the engine's `removeFinder`) sends what the document shows to the engine's finder (`findToRemove`), turns the mask into an area, and `Engine.removeArea` fills it with LaMa through `fillArea` as one step, as Generative Fill does; a missing LaMa, an empty finding and a failure are said. No new model: YuNet, SAM2, U2-Net and LaMa are all pinned already. Verified in the browser under 4x CPU throttling with a real click on a scene built from public-domain NASA pictures (scikit-image's rocket, with the astronaut portrait placed large as the subject and small as a person in the background): one "Remove People" step; 77% of the background person's tile changed, 0% of the subject and 0% of the sky and towers; looked at, the person gone and the sky continued behind her, two small remnants left where the pasted tile held other objects (a helmet, a corner of flag) that the person's mask rightly excluded; layout shift 0.00004 (the progress notice); no errors. LaMa was fetched here through the model manager, its pinned hash checked. Removed lines taken after the version edit. Removed from frontend:

```text
 *  by itself and fills them. Photoshop's Remove uses generative fill for large objects and also finds people; neither
 *  is here. */
export const VERSION = '1.57.3';
```

## The parity and to-check lists closed · _v1.57.3 (engine/compose-float.ts, index.ts, lab.ts; io/api.ts; ui/panels/colour-dialogs.ts; app.ts; backend app/services/colour.py, app/routers/colour.py)

DEV_PLAN 22.11: the two lists the owner asked to close. Photoshop's behaviour, checked at the source this time: Adobe's blending-modes help lists the 32-bit modes as Normal, Dissolve, Darken, Multiply, Lighten, Linear Dodge (Add), Difference, Hue, Saturation, Color and Luminosity (so 1.57.1's note that Darker and Lighter Color are among Photoshop's 32-bit modes was wrong; formvis offers them anyway); Adobe's community confirms that in CMYK every adjustment layer works but Exposure, Vibrance and Black and White. formvis now offers every one of these. `downTo` (app.ts) brings a 16- or 32-bit document down to the depth a mode needs first, from 32 bits with HDR Toning as Image > Mode does: Indexed Color, Bitmap and CMYK Color go through 8 bits, Lab Color through 16, and `setLab` converts 16-bit layers from their floats (`labFromFloats`) rather than their renditions. At 32 bits every blend mode composes: a mode outside the linear table blends the two colours in the display range (each clipped at white, sRGB-encoded) by the 8-bit formula and comes back to linear light, so light above white is kept wherever only one layer covers a pixel (`displayRange`, with the older check made to skip those modes). In CMYK and Lab, Exposure and HDR Toning go through the rendition (`viaRgb`), and in Lab Channel Mixer too. Convert to Profile at 32 bits converts linear light exactly through the 3 by 3 matrix between the two profiles' D50 primaries (`colour.linear_matrix`, `POST /color/linear-matrix`, `api.linearMatrix`, `Engine.convertToProfileLinear`), refusing non-RGB and table-based profiles by name; Assign Profile, Proof Setup, Proof Colors and Gamut Warning were only gated, as the view transform works on any picture. The lists lose all these; what remains is 22.11's to-build list (Grayscale at 16 and 32 bits, the 32-bit adjustments, CMYK's ink Channel Mixer, profiles and proofs and 16 bits). Verified in the browser: the gates as listed; all 27 blend modes compose at 32 bits, Screen and Overlay over (4, 0.2, 0.05) giving (1, 0.512, 0.349) and (1, 0.202, 0.05) where the grey covers and the 4.0 exact where it does not; Convert to Profile to Adobe RGB takes a 4.0 sRGB red to 2.8605, four times the matrix's 0.7151, the profile assigned; Lab from 16 bits gives L 51.4845, the floats' own value, where 8 bits would give 51.6767; in Lab Channel Mixer, Exposure and HDR Toning compose, in CMYK Exposure and HDR Toning compose; a 32-bit document's Indexed Color runs the HDR Toning dialog and then the Indexed Color dialog by their OK buttons, leaving "8 Bits/Channel" and "Indexed Color" in History; unit 188; no errors (a 422 in one probe was the probe's own first guess at a profile id). Slip: a `sed -i` ran on `compose-float.ts` to find a line, substituting it with itself; `git diff` showed it changed nothing, and the edits that followed were made by hand. Removed lines taken after the version edit. Removed from frontend:

```text
    { id: 'mode-lab', label: 'Lab Color', enabled: () => has() && (engine.current?.doc.depth ?? 8) === 8 && ['rgb', 'lab'].includes(engine.current?.doc.mode ?? 'rgb'), checked: () => engine.current?.doc.mode === 'lab', run: () => { if (engine.current?.doc.mode !== 'lab') engine.setLab(); } },
    { id: 'mode-cmyk', label: 'CMYK Color...', enabled: () => has() && (engine.current?.doc.depth ?? 8) === 8 && ['rgb', 'cmyk'].includes(engine.current?.doc.mode ?? 'rgb'), checked: () => engine.current?.doc.mode === 'cmyk', run: () => { if (engine.current?.doc.mode !== 'cmyk') modeDialog.show('cmyk'); } },
    { id: 'mode-bitmap', label: 'Bitmap...', enabled: has, checked: () => engine.current?.doc.mode === 'bitmap', run: () => modeDialog.show('bitmap') },
    { id: 'mode-indexed', label: 'Indexed Color...', enabled: has, checked: () => engine.current?.doc.mode === 'indexed', run: () => modeDialog.show('indexed') },
  const CMYK_NOT = new Set(['depth-16', 'depth-32', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'new-adj-channelMixer', 'new-adj-exposure', 'new-adj-hdrToning', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
  const DEEP16_NOT = new Set(['mode-grayscale', 'mode-bitmap', 'mode-indexed']);
  const LAB_NOT = new Set(['new-adj-channelMixer', 'new-adj-exposure', 'new-adj-hdrToning', 'depth-16', 'depth-32', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'mode-cmyk', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
  const DEEP32_NOT = new Set([...ADJUSTMENT_KINDS.filter((k) => k !== 'exposure').map((k) => `new-adj-${k}`), 'mode-cmyk', 'mode-lab', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning']);
import { deepFromRaster, place, srgbToLinear, transferOf } from './deep';
      const inLab = doc.mode === 'lab', perChannel = !inLab || ['levels', 'curves', 'invert', 'posterize'].includes(l.adjustment.kind);
    if (linear && !sep && mode !== 'dissolve' && mode !== 'darker-color' && mode !== 'lighter-color') return { error: `${name} uses ${mode}, which waits at 32 bits (Normal, Dissolve, Darken, Multiply, Lighten, Linear Dodge, Difference, Darker and Lighter Color work).` };
    if (!sep && mode !== 'dissolve' && (!nonSeparable(mode, [0, 0, 0], [0, 0, 0]) || (n === 4 && !luts))) return { error: `${name} uses ${mode}, which needs the document's colour tables in this mode.` };
      if (lab && mode !== 'normal' && mode !== 'dissolve') {
import { decodeLab, labFromRgba, labToSrgb, renderLab } from './lab';
   *  exactly (engine/lab.ts); the rasters stay as their rendition. From an 8-bit RGB document. */
    if (!p || (p.doc.mode ?? 'rgb') !== 'rgb' || (p.doc.depth ?? 8) !== 8) return false;
      const layers = pp.doc.layers.map((l) => (l.raster && !l.isGroup && !l.adjustment ? { ...l, channels: labFromRgba(l.raster.read()) } : l));
      pp.doc = { ...pp.doc, layers, mode: 'lab' };
export const VERSION = '1.57.2';
```

## 22.10's remainders decided: Unsharp Mask and Add Noise at 32 bits, HDR Toning at 16 · _v1.57.2 (engine/deep.ts; ui/panels/filter-panel.ts; app.ts)

DEV_PLAN 22.10 closes as far as gates go. `unsharpDeep` and `noiseDeep` take a `ceiling` (1, or Infinity at 32 bits, passed by the filter panel), so at 32 bits Unsharp Mask sharpens light above white rather than clipping it and Add Noise keeps it; both leave `DEEP32_NOT`. HDR Toning leaves `DEEP16_NOT`: at 16 bits it composes through the rendition as the other colour adjustments. Every remaining withheld command is decided in DEV_PLAN 22.10 and 22.11: built later (named), or withheld as Photoshop withholds it, or to check against Photoshop. Verified in the browser: at 32 bits the menus offer Unsharp Mask and Add Noise and still withhold Hue/Saturation; on an edge from 4.0 to 0.25, Unsharp Mask (100%, 2 px) gives 5.5 on the bright side where the 16-bit ceiling would give 1.0, and 0 on the dark side; Add Noise (10%) leaves all 20 bright pixels above white (the largest 4.036); at 16 bits HDR Toning is offered and composes (0.3, 0.5, 0.7 to 0.265, 0.504, 0.739); unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
  const DEEP16_NOT = new Set(['mode-grayscale', 'mode-bitmap', 'mode-indexed', 'new-adj-hdrToning']);
  const DEEP32_NOT = new Set([...ADJUSTMENT_KINDS.filter((k) => k !== 'exposure').map((k) => `new-adj-${k}`), 'mode-cmyk', 'mode-lab', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'filter-unsharpMask', 'filter-addNoise']);
/** Unsharp Mask on floats: the 8-bit formula, with the threshold in the same levels, on every channel but alpha. */
export function unsharpDeep(src: DeepPixels, amount: number, radius: number, threshold: number): DeepPixels {
    for (let c = 0; c < A; c++) { const d = s[i + c] - b[i + c]; o[i + c] = Math.min(1, Math.max(0, Math.abs(d) * 255 >= threshold ? s[i + c] + k * d : s[i + c])); }
/** Add Noise on floats: the 8-bit filter's seeded noise (the same values for the same seed), not rounded, per channel. */
export function noiseDeep(src: DeepPixels, amount: number, gaussian: boolean, monochromatic: boolean, seed: number): DeepPixels {
      d[i + c] = Math.min(1, Math.max(0, d[i + c] + shared / 255));
    const s = { ...this.s, ...(settings as Partial<typeof this.s>) }, seed = this.seed;
    const deep = kind === 'gaussianBlur' ? (d: DeepPixels): DeepPixels => blurDeep(d, s.radius) : kind === 'unsharpMask' ? (d: DeepPixels): DeepPixels => unsharpDeep(d, s.usmAmount, s.usmRadius, s.threshold) : kind === 'addNoise' ? (d: DeepPixels): DeepPixels => noiseDeep(d, s.amount, s.gaussian, s.monochromatic, seed) : kind === 'motionBlur' ? (d: DeepPixels): DeepPixels => motionBlurDeep(d, s.angle, s.distance) : kind === 'surfaceBlur' ? (d: DeepPixels): DeepPixels => surfaceBlurDeep(d, s.gallery.surfaceRadius, s.gallery.surfaceThreshold) : null;
export const VERSION = '1.57.1';
```

## 32 bits on the one compositor · _v1.57.1 (engine/compose-float.ts, deep.ts, index.ts; app.ts)

DEV_PLAN 22.10's last large piece. `composeDeep` sends 32-bit documents to `composeFloat` in linear light (its `linear` flag) and the older 32-bit compositor is removed, so 32 bits gain groups (pass-through), layer and folder masks, clipping, layer styles and blend modes. At 32 bits the modes Photoshop offers there are composed unclamped above white (`LINEAR_FLOAT`: Normal, Multiply, Darken, Lighten, Difference, Linear Dodge), with Dissolve and Darker and Lighter Color; the rest are named. Exposure composes in linear light under its mask (the old formula), the other adjustments are named with the old wording the unit test reads. A style's pixels come in as linear light and keep light above white (`withStyle`'s `linear`). Linear Dodge (Add) joins `SEPARABLE_FLOAT`, which lacked it for 16-bit, CMYK and Lab too. `composedRendition` composes 32-bit documents in linear light and shows them clipped at white as the layers are; `composesFloats` covers a 32-bit document with an adjustment, a blend mode, a style, a mask or clipping, so the canvas and exports show the linear composite. `DEEP32_NOT` loses groups, masks, clipping, styles and the blend shortcuts; `STYLES` goes with no list using it. Verified in the browser: at 32 bits the menus offer Group, Add Mask, Create Clipping Mask, the blend shortcuts and Layer Style and withhold Hue/Saturation; a 0.5 grey layer (derived 0.503) in Multiply over (4, 2, 1) composes to (2.012, 1.006, 0.503), past white kept, and the canvas shows (255, 255, 188); Linear Dodge gives (4.503, 2.503, 1.503); Overlay is named; a mask hiding the grey's left half shows (4, 2, 1) there; an outside or inside red stroke on a grey box draws (1, 0, 0) at its edge while the box's centre stays 0.503 and the HDR base 4.0 elsewhere; unit 188. A first probe put an inside stroke on a layer filling the whole canvas, where the renderer draws no edge at the canvas border (as in RGB); the second used a smaller box. Removed lines taken after the version edit. Removed from frontend:

```text
  const STYLES = ['layer-style', 'paste-layer-style'];
  // 1.56.8 (DEV_PLAN 22.10): 32 bits as a denylist too, everything else through derive in linear light. What remains is
  // what the 32-bit compositor cannot draw (groups, masks, clipping, styles, blend modes, adjustments but Exposure),
  const DEEP32_NOT = new Set([...STYLES, ...ADJUSTMENT_KINDS.filter((k) => k !== 'exposure').map((k) => `new-adj-${k}`), 'group', 'add-mask', 'add-mask-hide', 'clip', 'blend-next', 'blend-prev', 'mode-cmyk', 'mode-lab', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'filter-unsharpMask', 'filter-addNoise']);
import { deepFromRaster, place, transferOf } from './deep';
function withStyle(tmp: Float32Array, d: { styled: ImageData; plain: ImageData }, n: 3 | 4, toFloats: (r: number, g: number, b: number) => ArrayLike<number>, fill: number): void {
    for (let c = 0; c < A; c++) tmp[i + c] = clamp01(after[c] + w * (tmp[i + c] - before[c]));
export function composeFloat(doc: Doc, n: 3 | 4, paperWhite: boolean, luts: CmykLuts | null = null): FloatComposite | { error: string } {
      withStyle(tmp, drawn, n, isLab ? (r, g, b) => encodeLab(...srgbToLab(r, g, b)) : n === 4 && luts ? (r, g, b) => inkOf({ r, g, b }, luts.in) : (r, g, b) => [r / 255, g / 255, b / 255], l.fill ?? 1);
    const mode = l.blend ?? 'normal', sep = SEPARABLE_FLOAT[mode];
/** The document composed in floating point, bottom layer first; an error naming what 16 bits cannot compose yet. */
  if (doc.depth !== 32) return composeFloat(doc, 3, false);
  const W = doc.width, H = doc.height, out = new Float32Array(W * H * 4);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    const name = `"${l.name}"`;
    if (l.isGroup || l.mask || l.clipId || l.effects || (l.blend && l.blend !== 'normal')) return { error: `${name} uses a group, mask, clipping, style or blend mode, which 16-bit export does not compose yet.` };
    const op = l.opacity * (l.fill ?? 1);
    if (l.adjustment && doc.depth === 32) {
      // 32 bits are linear light (1.53.9): Exposure is exposure there, unclamped; the others wait.
      const e = l.adjustment.kind === 'exposure' ? (l.adjustment.data as { exposureSettings?: { exposure?: number; offset?: number; gamma?: number } }).exposureSettings : null;
      if (!e) return { error: `${name} is an adjustment 32-bit export does not compose yet (Exposure does).` };
      const gain = 2 ** (e.exposure ?? 0), off = e.offset ?? 0, inv = 1 / Math.max(0.01, e.gamma ?? 1);
      for (let i = 0; i < out.length; i += 4) for (let c = 0; c < 3; c++) { const v = out[i + c], nv = Math.pow(Math.max(0, v * gain + off), inv); out[i + c] = v + (nv - v) * op; }
      continue;
    }
    if (l.adjustment) {
      const t = transferOf(l.adjustment);
      if (!t) return { error: `${name} is an adjustment 16-bit export does not compose yet (Levels, Curves and Exposure do).` };
      for (let i = 0; i < out.length; i += 4) for (let c = 0; c < 3; c++) { const v = out[i + c], nv = Math.min(1, Math.max(0, t(c, v * 255) / 255)); out[i + c] = v + (nv - v) * op; }
      continue;
    }
    if (!l.raster) continue;
    const src = l.channels ?? deepFromRaster(l.raster);
    place(out, W, H, src, l.transform, op);
  }
  return { width: W, height: H, data: out };
export const VERSION = '1.56.9';
```

## Layer styles in every mode but 32 bits · _v1.56.9 (engine/compose-float.ts, index.ts, deep.test.ts under 2a; app.ts)

DEV_PLAN 22.10: the one item every denylist shared. `composeFloat` draws a styled layer through `StyleDrawer`, which the engine registers as it starts (`setStyleDrawer`, the engine's `styleDrawer`): the 8-bit renderer draws the layer alone twice, with and without its style, at full opacity with its Fill, without mask, blend, clipping or group (the compositor applies those); `withStyle` keeps the layer's floats exactly where the style draws nothing and brings the style's pixels in through the mode's conversion (the profile's separation, Lab exactly, 16-bit) by the derive rule; the layer's opacity alone then applies, since the drawer applied its Fill; an active style is still named when no drawer is registered (a unit test). `composesFloats` now also covers a CMYK or Lab layer with an active style, so the canvas shows the style's colours as they will print. Styles leave the 16-bit, CMYK and Lab lists; 32 bits keeps them (its compositor is the older one). `deep.test.ts` (under the owner's 2a): the style fixture became a real, active drop shadow, since an empty object is not a style. Verified in the browser: in CMYK a red box with a drop shadow and an outside black stroke composes with the box's own ink exact inside (0, 91, 76, 18), the stroke as the profile's black (85, 79, 54, 98), the shadow present (9, 9, 6, 11), paper elsewhere, and the canvas equal to the composite to 0 levels (30 before `composesFloats` covered styles: the canvas had shown RGB black, which no ink prints); at 16 bits a styled layer composes with its interior's 0.25000 exact and the stroke at (20, 40, 200); in Lab the interior stays exact and the canvas shows the stroke's colour; unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
  const CMYK_NOT = new Set([...STYLES, 'depth-16', 'depth-32', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'new-adj-channelMixer', 'new-adj-exposure', 'new-adj-hdrToning', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
  const DEEP16_NOT = new Set([...STYLES, 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'new-adj-hdrToning']);
  const LAB_NOT = new Set([...STYLES, 'new-adj-channelMixer', 'new-adj-exposure', 'new-adj-hdrToning', 'depth-16', 'depth-32', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'mode-cmyk', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
    if (l.effects) return { error: `${name} has a layer style, which this mode's compositor does not draw yet.` };
    const op = l.opacity * (l.fill ?? 1), cov = coverageOf(l);
import { composeFloat } from './compose-float';
    return ((p.doc.mode === 'cmyk' && !!p.cmykLut) || p.doc.mode === 'lab') && p.doc.layers.some((l) => l.visible && (l.adjustment || (l.blend && l.blend !== 'normal')));
export const VERSION = '1.56.8';
```

## The remaining mode gates: 32 bits through derive, Lab's colour adjustments · _v1.56.8 (engine/derive.ts, compose-float.ts, index.ts; app.ts)

DEV_PLAN 22.10, with 22.9's remainder. Derive gains linear light for 32-bit documents (`lin`, `enc`; the `linear` flag on `deriveWhole`, `deriveRegion` and `renderRegion`): untouched pixels keep their floats exactly, light above white included; a changed pixel takes the new colour in linear light and keeps its old light (above white too) in proportion to how small the change was, never clipped at 1. `edit()`, the step-end hook and the stroke end now derive at 32 bits (the Brush's exact rebuild is gamma-encoded, for 16 bits, so at 32 bits every stroke comes through derive); `deepPaintOk` lets painting run at 32 bits. The gate's 32-bit allowlist becomes `DEEP32_NOT`: what the 32-bit compositor cannot draw (groups, masks, clipping, styles, blend modes, adjustments but Exposure), Unsharp Mask and Add Noise as before, the colour models, the profile and proof commands; `DEEP_OK`, `NOT_AT_32` and `COLOUR_ADJ` are removed, so every mode's gate is a named denylist. In Lab, `composeFloat` keeps Levels, Curves, Invert and Posterize on the channels themselves and sends every other adjustment through `viaKernel`'s new Lab branch (the rendition by the formulas, the kernel, back to Lab exactly with the old Lab kept for small changes); `LAB_NOT` keeps only Channel Mixer, Exposure and HDR Toning among the adjustments, as Photoshop's Lab. Verified in the browser: at 32 bits the menus offer Lens Blur, Gaussian Blur and Exposure and withhold styles, Hue/Saturation, Unsharp Mask and clipping; a white Brush stroke over a 0.25 area lands as 1.0, every untouched pixel exact and 4.0 kept away from the stroke; a +2-level edit moves 0.250 to 0.258 and leaves 4.0 alone; the export composes; in Lab, Hue/Saturation +120 on red gives Lab (71.1, -60.4, 58.2), the RGB kernel's result converted exactly, and the canvas shows (50, 200, 51); unit 188; no errors. Known: at 32 bits, painting a colour the screen already shows for light above white (white over a bright highlight) changes nothing in the 8-bit picture derive reads, so that light stays; Photoshop would set it to 1.0, and a brush painting in floats removes this. Removed lines taken after the version edit. Removed from frontend:

```text
  // A 16-bit document allows what keeps its 16 bits (1.53.6, H1); anything else waits for Image > Mode > 8 Bits/Channel.
  const DEEP_OK = new Set(['new', 'open', 'import', 'save', 'save-as', 'download-project', 'close-tab', 'undo', 'redo', 'export-png', 'export-tiff', 'export-jpg', 'export-webp', 'export-avif', 'export-gif', 'export-pdf',
    'new-adj-levels', 'new-adj-curves', 'new-adj-exposure', 'new-adj-invert', 'new-adj-posterize', 'new-adj-brightnessContrast', 'edit-adjustment', 'flip-canvas-h', 'flip-canvas-v', 'rotate-180', 'rotate-90-cw', 'rotate-90-ccw', 'canvas-size', 'image-size', 'trim', 'reveal-all', 'filter-gaussianBlur', 'filter-motionBlur', 'filter-surfaceBlur', 'filter-unsharpMask', 'filter-addNoise', 'delete-layer', 'rename', 'forward', 'backward', 'select-all', 'deselect', 'inverse', 'duplicate', 'duplicate-dialog', 'group', 'add-mask', 'add-mask-hide', 'delete-mask', 'toggle-mask', 'link-mask', 'clip', 'blend-next', 'blend-prev', 'depth-8', 'depth-16', 'assign-profile', 'proof-setup', 'proof-colors', 'gamut-warning',
    'fit', 'actual', 'pixel-grid', 'toggle-panels', 'rail-columns', 'reset-panels', 'merge-columns', 'settings', 'shortcuts', 'help', 'about', 'assistant', 'benchmark', 'copy-error-log', 'new-guide', 'clear-guides', 'lock-guides', 'clear-recent', 'edit-note', 'swatch-add', 'swatches-reset', 'manage-plugins']);
  // 32 bits (1.53.9) are linear light, unbounded: what would clip past white waits there.
  const NOT_AT_32 = new Set(['new-adj-levels', 'new-adj-curves', 'new-adj-invert', 'new-adj-posterize', 'new-adj-brightnessContrast', 'filter-unsharpMask', 'filter-addNoise', 'assign-profile', 'proof-setup', 'proof-colors', 'gamut-warning']);
  for (const id of ['depth-32', 'export-hdr', 'export-exr']) DEEP_OK.add(id);
  const COLOUR_ADJ = ['new-adj-hsv', 'new-adj-vibrance', 'new-adj-colorBalance', 'new-adj-blackWhite', 'new-adj-photoFilter', 'new-adj-channelMixer', 'new-adj-threshold', 'new-adj-selectiveColor', 'new-adj-gradientMap', 'new-adj-colorLookup', 'new-adj-shadowsHighlights'];
  for (const id of COLOUR_ADJ) { DEEP_OK.add(id); NOT_AT_32.add(id); }
  // (engine/derive.ts); these are the ones that cannot work in that mode yet. 32 bits keeps its allowlist.
  const LAB_NOT = new Set([...STYLES, ...ADJUSTMENT_KINDS.filter((k) => k !== 'levels' && k !== 'curves').map((k) => `new-adj-${k}`), 'depth-16', 'depth-32', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'mode-cmyk', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
    : (engine.current?.doc.depth ?? 8) === 8 || (engine.current?.doc.depth === 16 && !DEEP16_NOT.has(c.id)) || ((DEEP_OK.has(c.id) || passes(c)) && !(engine.current?.doc.depth === 32 && NOT_AT_32.has(c.id)));
import { encodeLab, labFloatToRgb, srgbToLab } from './lab';
function viaKernel(out: Float32Array, W: number, H: number, n: 3 | 4, kern: Kernel, op: number, cov: Float32Array | null, luts: CmykLuts | null): void {
  if (n === 4 && luts) applyLut4(out, luts.out, rgba);
      const t = transferOf(l.adjustment);
        viaKernel(out, W, H, n, kern, op, cov, n === 4 ? luts : null);
/** A layer's floats taken whole from its 8-bit pixels: CMYK through the table, Lab exactly (1.56.4), otherwise 16-bit RGB. */
export function deriveWhole(img: ImageData, t: DeriveTables | null, lab = false): ChannelPixels {
export function deriveRegion(ch: ChannelPixels, x: number, y: number, before: ImageData, after: ImageData, t: DeriveTables | null): ChannelPixels {
      for (let c = 0; c < 3; c++) out[o + c] = clamp01(F[s + c] / 255 + w * (out[o + c] - B[s + c] / 255));
export function renderRegion(ch: ChannelPixels, x: number, y: number, w: number, h: number, lut: Lut4 | null): ImageData {
    if (deepBefore && !nested && p.doc.depth !== 32) this.deriveChannels(p, deepBefore, p.history.pendingPatches);
    const dl = patch && st.target === 'pixels' && (st.project.doc.depth === 16 || st.project.doc.mode === 'cmyk' || st.project.doc.mode === 'lab') ? st.project.layer(st.layerId) : null;
    const exact = (this.tool === 'brush' || this.tool === 'pencil' || this.tool === 'eraser') && !this.colourDynamics();
        const ch = deriveRegion(dl.channels, patch.x, patch.y, patch.before, after, t), img = renderRegion(ch, patch.x, patch.y, after.width, after.height, t ? t.out : null);
    const cmyk = p.doc.mode === 'cmyk', lab = p.doc.mode === 'lab', t = cmyk ? this.deriveTables(p) : null, lut = cmyk ? p.cmykLut : null;
        const ch = deriveWhole(l.raster.read(), t, lab);
        const ch = same ? deriveRegion(o.channels, 0, 0, o.raster.read(), l.raster.read(), t) : deriveWhole(l.raster.read(), t, lab);
        ch = deriveRegion(ch, q.x, q.y, q.before, q.after, t);
        const img = renderRegion(ch, q.x, q.y, q.before.width, q.before.height, lut);
    if (!p || !(p.doc.mode === 'cmyk' || p.doc.mode === 'lab' || p.doc.depth === 16)) return null;
    if (this.current?.doc.depth === 32) return !this.deepBlocked('Painting in 32 bits');   // painting would clip past white (1.53.9)
export const VERSION = '1.56.7';
```

## Face-Aware Liquify, and M3 closed · _v1.56.7 (engine/face-liquify.ts new; io/local-gen.ts; ui/panels/liquify-dialog.ts, local-models.ts; backend app/localgen/face.py new, model_manager.py, main.py)

The parity plan's M3, second part (DEV_PLAN 23.5), which closes the row with the Freeze Mask (1.56.5). The gate first: YuNet (OpenCV Zoo) is MIT (Shiqi Yu, licence read at its source and at OpenCV's Hugging Face copy), 232,589 bytes, pinned to revision 3cc26e7f and SHA-256 8f2383e4... from the real download, run by OpenCV's own `FaceDetectorYN`; dlib's 68-point model was not a candidate (its training data forbids commercial use). `engine/face-liquify.ts`: eleven sliders as Photoshop's (Eye Size, Height and Distance; Nose Height and Width; Smile, Mouth Width and Height; Forehead, Chin Height, Face Width) placed as smooth local moves and scales on Liquify's own grid from the five landmarks, sized by the distance between the eyes, weighed by the freeze, recomputed from the sliders on each render so they never compound; Eye Tilt, Eye Width, Upper and Lower Lip and Jawline need more landmarks and wait. The dialog's Face-Aware section (Find faces, Reset face, the sliders in two columns, a note; built once), the brushes' field plus the face's in the preview and on OK (`combined`); `findFaces` and `faceReady`; the Local models card. Verified under 4x CPU throttling with real clicks on scikit-image's astronaut portrait (NASA, public domain): one face found; Eye Size and Smile at 100 changed 620 pixels around the eyes and 368 around the mouth and none far from the face (the rocket, the suit), as one Liquify step; looked at: larger eyes, a wider smile, nothing else moved; layout shift 0; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import { el } from '../dom';
    this.body.append(bar, this.canvas, this.sizeRow.el, this.pressureRow.el, actions);
      this.shown = liquifyImage(this.src, this.liq, this.scale, w, h);
    const f = this.liq, id = this.layerId;
    this.el.append(el('<p class="cv-note">Models that run here, with no key and no cost: they appear in Generate Image, and Krea 2 in Generative Fill. They are large, and each licence is shown for you to accept before anything downloads.</p>'), this.lama, this.depth, this.ddcolor, this.styles, this.upscaler, this.krea, this.klein, this.library);
    try { await Promise.all([this.showDownload(this.lama, 'lama-inpaint', 'LaMa inpainting', 'Download LaMa', 'about 208 MB', 'Generative Fill and Expand on any computer, with no prompt, key or cost: it fills from what surrounds the selection. Apache-2.0.'), this.showDownload(this.depth, 'depth-anything-v2-small', 'Depth Anything V2 Small', 'Download Depth Anything', 'about 99 MB', 'Depth from one picture for the Neural Filters\' Depth Blur, on any computer. The Small checkpoint, Apache-2.0.'), this.showDownload(this.ddcolor, 'ddcolor-tiny', 'DDColor-tiny', 'Download DDColor', 'about 135 MB', 'Colour for black-and-white pictures in the Neural Filters, on any computer; the picture\'s own light is kept. Apache-2.0.'), this.showDownload(this.styles, 'fast-style', 'Style Transfer presets', 'Download the styles', 'about 34 MB', 'Five preset styles (Mosaic, Candy, Rain Princess, Udnie, Pointilism) for the Neural Filters, the ONNX model zoo\'s fast neural style models, on any computer. BSD-3-Clause.'), this.showUpscaler(), this.showKrea(), this.showKlein(), this.showLibrary()]); }
export const VERSION = '1.56.6';
```

## Lab documents, second part · _v1.56.6 (engine/compose-float.ts, lab.ts, index.ts; io/api.ts; ui/panels/adjust-panel.ts; app.ts; backend app/routers/io.py)

DEV_PLAN 22.9, second part. Levels and Curves layers in Lab work per channel on Lightness, a and b: the adjust panel's Lab names (`LABS`, positions as the ranges), Lab's composite position never offered (Photoshop's Levels and Curves in Lab have none) and the channel starting at Lightness; the transfer applies to the Lab floats in `composeFloat`. Blend modes in Lab: every mode but Normal and Dissolve blends the two colours' renditions by the RGB formula (`labFloatToRgb`) and comes back to Lab exactly; Normal composites the Lab floats themselves. The engine's `composesFloats` (CMYK or Lab with a visible adjustment layer or a blend mode other than Normal) drives the composed canvas, and `flattened()` now gives that composite too, so exports, thumbnails and the Channels panel show what the canvas shows (for CMYK as for Lab); `composedRendition` composes Lab and renders it by the formulas. The gate's Lab denylist lets Levels, Curves and the blend shortcuts through. Export TIFF from a Lab document writes a Lab TIFF (`exportLabTiff`, `api.encodeLabTiff`, the engine's `/io/encode-lab-tiff`): the composite laid on white, 8-bit CIELab with a* and b* as signed bytes as the TIFF specification and Photoshop have them (Pillow writes the bytes given; a first look read its own reading of the file as the bytes). Verified in the browser under 4x CPU throttling: the Curves channel list holds exactly Lightness, a and b; a Lightness curve lifting 128 to 180 takes red from L 46.2 to 66.9 with a and b unchanged (58.7, 38.1), and the canvas and `flattened()` show the curved colour (255, 111, 98); a Multiply layer of (90, 140, 220) over red composes to Lab (17.3, 22.2, 0.2), equal to the RGB formula's result converted; the Lab TIFF reads back through Pillow as L 17.3, a 22, b 0; layout shift 0; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
  const LAB_NOT = new Set([...STYLES, ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'blend-next', 'blend-prev', 'depth-16', 'depth-32', 'mode-grayscale', 'mode-bitmap', 'mode-indexed', 'mode-cmyk', 'assign-profile', 'convert-profile', 'proof-setup', 'proof-colors', 'gamut-warning', 'export-hdr', 'export-exr']);
    const bv: [number, number, number] = [0, 0, 0], sv: [number, number, number] = [0, 0, 0];
      if (sep || mode === 'dissolve') {
import { decodeLab, labFromRgba, labToSrgb } from './lab';
    else if (p.doc.mode === 'cmyk' && p.cmykLut && !this.stroke && p.doc.layers.some((l) => l.visible && (l.adjustment || (l.blend && l.blend !== 'normal')))) {
    const ink = composeChannels(p.doc, p.cmykTables), r = 'error' in ink || !p.cmykLut ? null : rasterFromChannels({ mode: 'cmyk', n: 4, width: ink.width, height: ink.height, data: ink.data }, p.cmykLut);
  flattened(): Surface | null { const p = this.current; return p ? renderDoc(this.work, p.doc) : null; }
const ALL_CHANNELS = [...CHANNELS, ...INKS];
/** The mode's channel names (1.54.4): Levels and Curves index their ranges by position within this list. */
const channelsOf = (mode: string | undefined): string[] => (mode === 'cmyk' ? INKS : CHANNELS);
const showChannels = (row: { el: HTMLElement }, names: string[]): void => { for (const o of row.el.querySelectorAll('option')) o.hidden = !names.includes(o.value); };
    return { node, sync: () => { const n = names(); showChannels(channel, n); ch = Math.max(0, n.indexOf(lv().channel)); while (lv().ranges.length < 5) lv().ranges.push({ black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 }); channel.set(n[ch]); values(); this.drawHisto(ch); } };
    return { node, sync: () => { const n = names(); showChannels(channel, n); ch = Math.max(0, n.indexOf(cv().channel)); while (cv().channels.length < 5) cv().channels.push([{ x: 0, y: 0 }, { x: 255, y: 255 }]); channel.set(n[ch]); draw(); } };
export const VERSION = '1.56.5';
```

## Liquify's Freeze Mask and Thaw Mask · _v1.56.5 (engine/liquify.ts; ui/panels/liquify-dialog.ts)

The parity plan's M3, first part (DEV_PLAN 23.5). The Liquify field carries a freeze mask, one value a grid node (`LiquifyField.freeze`); `eachNode` weighs every tool's effect by one minus the node's freeze, so a frozen area stays still under Forward Warp, Twirl, Pucker, Bloat and Reconstruct alike, as in Photoshop; `paintFreeze` (Freeze Mask and Thaw Mask paint it up or down under the brush, by pressure), `clearFreeze` and `invertFreeze` (Photoshop's Mask Options None and Invert All), `freezeAt` (bilinear, for drawing). The dialog gains the two mask tools, a row of Restore All, Mask None and Invert Mask (built once; Restore All moved into it), and draws the frozen area as Photoshop's translucent red over the preview. Verified under 4x CPU throttling with real drags in the dialog over a striped layer: the left part painted frozen, then Forward Warp dragged across the whole picture three times, OK: 0 pixels changed in the frozen part (columns 0 to 80) against 15,802 in the free part (columns 250 to 400), one "Liquify" step; layout shift 0; no errors. Face-Aware Liquify, M3's second part, needs a face-landmark model: its licence and hash come first. Removed lines taken after the version edit. Removed from frontend:

```text
export interface LiquifyField { gw: number; gh: number; cell: number; d: Float32Array }
export type LiquifyTool = 'warp' | 'reconstruct' | 'twirlCW' | 'twirlCCW' | 'pucker' | 'bloat';
/** Visits every grid node within `radius` of (cx, cy) with its falloff weight. */
function eachNode(f: LiquifyField, cx: number, cy: number, radius: number, visit: (i: number, px: number, py: number, w: number) => void): void {
    const px = gx * f.cell, py = gy * f.cell, dist = Math.hypot(px - cx, py - cy) / r;
    if (dist < 1) visit((gy * f.gw + gx) * 2, px, py, smooth(1 - dist));
export function dabField(f: LiquifyField, tool: Exclude<LiquifyTool, 'warp'>, cx: number, cy: number, radius: number, strength: number): void {
import { dabField, fieldIsZero, liquifyImage, makeField, pushField, resetField, type LiquifyField, type LiquifyTool } from '../../engine/liquify';
const TOOLS: ReadonlyArray<readonly [LiquifyTool, string]> = [['warp', 'Forward Warp'], ['reconstruct', 'Reconstruct'], ['twirlCW', 'Twirl Clockwise'], ['twirlCCW', 'Twirl Counterclockwise'], ['pucker', 'Pucker'], ['bloat', 'Bloat']];
    this.body.append(bar, this.canvas, this.sizeRow.el, this.pressureRow.el, restore);
export const VERSION = '1.56.4';
```

## Lab documents, first part · _v1.56.4 (engine/lab.ts new, derive.ts, index.ts, types.ts; io/project-io.ts; ui/channels.ts, info.ts, tabs.ts; app.ts)

DEV_PLAN 22.9, first part. `engine/lab.ts`: CIE L*a*b* with the D50 white Photoshop's Lab uses, from and to sRGB through the Bradford-adapted sRGB matrix; floats L / 100, (a + 128) / 255, (b + 128) / 255; `renderLab` by the formulas with a 16,384-step gamma table (a first version through a 33-point grid interpolated across the clipped edge of the sRGB gamut and missed by up to 21 levels); `labFromRgba`. Image > Mode > Lab Color (`mode-lab`, from 8-bit RGB) and RGB Color back (`setLab`, `setRgbFromLab`); `convertMode` leaves Lab to them; `DocMode` and the tab name it. Lab documents join `edit()`, the step-end hook and the stroke end, and derive brings a Lab layer's floats into step (whole layers exactly, changed pixels with their structure kept for small changes, the rendition redrawn from the floats). The project file keeps the floats (`.lab32`). The Channels panel's Lab, Lightness, a and b rows (built once, shown in a Lab document; thumbnails from the Lab composite, a and b mid-grey where neutral); clicking a Lab row changes nothing yet, and the panel's note says viewing or painting one Lab channel comes later. Info reads L, a and b. The gate's Lab denylist: layer styles, adjustment layers, other blend modes, the depths, the other modes and CMYK straight from Lab, profiles, proofs and the HDR exports. Verified: against LittleCMS in Python on ten colours within its own 8-bit rounding (worst 0.49 units); in the browser, red (200, 51, 50) is (46.2, 58.7, 38.1), a white stroke lands as (100, 0, 0) with untouched floats exact, a 256-step gradient goes to Lab and back with 0 levels of difference, the rendition of the floats matches the original pixels exactly; under 4x CPU throttling with the Channels and Info panels open, the conversion swaps the panel's rows to Lab, Lightness, a and b with thumbnails over red of 118, 187 and 166 (46.2, 58.7 and 38.1 encoded), Info reads "L 46 a 59 b 38", the project file round-trips the floats exactly and reopens in Lab, layout shift 0, no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    { id: 'mode-rgb', label: 'RGB Color', enabled: has, checked: () => (engine.current?.doc.mode ?? 'rgb') === 'rgb', run: () => { if (engine.current?.doc.mode === 'cmyk') void cmykToRgb(); else engine.convertMode('rgb'); } },
      { label: 'Mode', items: ['mode-bitmap', 'mode-grayscale', 'mode-indexed', 'mode-rgb', 'mode-cmyk', '-', 'depth-8', 'depth-16', 'depth-32'] }, '-',
/** A layer's floats taken whole from its 8-bit pixels: CMYK through the table, otherwise 16-bit RGB. */
export function deriveWhole(img: ImageData, t: DeriveTables | null): ChannelPixels {
    if (ch.n === 4 && t) {
  if (ch.n === 4 && lut) applyLut4(strip, lut, img.data);
    const deepBefore = (p.doc.depth ?? 8) > 8 || cmyk ? new Map(p.doc.layers.map((l) => [l.id, l])) : null;
    const dl = patch && st.target === 'pixels' && (st.project.doc.depth === 16 || st.project.doc.mode === 'cmyk') ? st.project.layer(st.layerId) : null;
    const cmyk = p.doc.mode === 'cmyk', t = cmyk ? this.deriveTables(p) : null, lut = cmyk ? p.cmykLut : null;
        const ch = deriveWhole(l.raster.read(), t);
        const ch = same ? deriveRegion(o.channels, 0, 0, o.raster.read(), l.raster.read(), t) : deriveWhole(l.raster.read(), t);
    if (!p || !(p.doc.mode === 'cmyk' || p.doc.depth === 16)) return null;
    if (!p || (p.doc.mode ?? 'rgb') === mode || mode === 'cmyk' || p.doc.mode === 'cmyk') return false;
    const label = { rgb: 'RGB Color', grayscale: 'Grayscale', bitmap: 'Bitmap', indexed: 'Indexed Color', cmyk: 'CMYK Color' }[mode];
export type DocMode = 'rgb' | 'grayscale' | 'bitmap' | 'indexed' | 'cmyk';
  const mode = manifest.mode === 'grayscale' || manifest.mode === 'bitmap' || manifest.mode === 'indexed' || manifest.mode === 'cmyk' ? manifest.mode : null;
type Ch = 'rgb' | 'r' | 'g' | 'b' | 'cmyk' | 'c' | 'm' | 'y' | 'k';
  { id: 'cmyk', label: 'CMYK' }, { id: 'c', label: 'Cyan' }, { id: 'm', label: 'Magenta' }, { id: 'y', label: 'Yellow' }, { id: 'k', label: 'Black' }];
        if (r.id === 'cmyk' || isInk(r.id)) return;
    const p = this.engine.current, cmyk = p?.doc.mode === 'cmyk';
      if (cmyk ? rgbRow : !rgbRow) continue;
    const cmyk = this.engine.current?.doc.mode === 'cmyk';
    const m = this.solo && !cmyk
    const plain = cmyk || (!this.solo && this.shown.r && this.shown.g && this.shown.b);
      const id = row.dataset.ch as Ch, inkRow = id === 'cmyk' || isInk(id);
      setHidden(row, cmyk ? !inkRow : inkRow);
    setText(this.root.querySelector('.cv-ch-note') as HTMLElement, cmyk ? (this.inkSolo ? `The canvas shows ${ROWS.find((r) => r.id === this.inkSolo)?.label} alone (paper white, full ink black); the Brush, Pencil and Eraser paint it alone.` : 'Click an ink to paint it alone; ⌘- or Ctrl-click loads its light areas as a selection.')
    setText(mEl, { rgb: 'RGB/8', grayscale: 'Gray/8', bitmap: 'Bitmap/1', indexed: 'Index', cmyk: 'CMYK/8' }[md]);
    const tip = { rgb: 'RGB, 8 bits a channel', grayscale: 'Grayscale, 8 bits', bitmap: 'Bitmap, 1 bit', indexed: `Indexed Color, ${p.doc.palette?.length ?? 0} colours`, cmyk: `CMYK, 8 bits a channel, ${p.doc.profile?.name ?? 'no profile'}` }[md];
export const VERSION = '1.56.3';
```

## The Art History Brush, and L4 closed · _v1.56.3 (engine/art-history.ts new, index.ts, types.ts; extensions/tools/art-history.ts new, index.ts)

The parity plan's L4, second part (DEV_PLAN 23.4), which closes the row with the Mixer Brush (1.56.2). `engine/art-history.ts`: `artHistoryTexture` lays stylised strokes over the whole layer as a stroke starts, each in the source's colour where it begins, running across the source's brightness gradient (along its contours), on a jittered grid in shuffled order with a seeded random, capped near 250,000 strokes; ten styles as Photoshop's (`ART_STYLES`: tight and loose, short, medium and long, Dab, and four curls) by length, wander and bend; Tolerance clears the strokes where the current layer is already within that many levels of the source. The engine's `artHistory` settings and `artHistoryTexture`, the strokes a quarter of the brush wide and a new pattern each stroke; `beginRetouchStroke` gives the Art History Brush the History Brush's source (the snapshot's copy of the layer) and reveals the painted version through the brush as the History Brush reveals the snapshot; its steps are named so. The tool (Y with the History Brush) with Source, Style, Tolerance and the Brush's rows. The README's line counts follow the code (37,700 TypeScript, 8,300 Python). Verified in the browser under 4x CPU throttling with real drags across a red and blue snapshot on a whitened layer: the History Brush lays back the snapshot exactly (no red on the blue side, no blue on the red), the Art History Brush covers the same area with strokes that cross the boundary (82 red pixels on the blue side, 108 blue on the red); with Tolerance 100 on a layer equal to its snapshot it lays nothing; the options bar shows Source, Style and Tolerance; layout shift 0; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
  beginRetouchStroke(kind: 'heal' | 'remove' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge' | 'historyBrush' | 'patternStamp', pt: Pt, shift: boolean): boolean {
    else if (kind === 'historyBrush') {
      // The History Brush paints this layer back from the source snapshot's own copy of it, in document space.
      texture = { surface: this.layerSample(p, src), dx: 0, dy: 0 };
    p.history.begin({ heal: 'Spot Healing', remove: 'Remove', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge', historyBrush: 'History Brush', patternStamp: 'Pattern Stamp' }[kind], p.snapshot());
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'mixer' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'colorSampler' | 'ruler' | 'note' | 'count' | 'contentAwareMove' | 'redEye' | 'rotateView' | 'idle';
  for (const tool of [historyBrushTool, mixerTool, frameTool, convertPointTool, selectionBrushTool, pencilTool, eraserTool, magicEraserTool, patternStampTool, backgroundEraserTool, colorSamplerTool, rulerTool, noteTool, countTool, contentAwareMoveTool, redEyeTool, rotateViewTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
export const VERSION = '1.56.2';
```

## The Mixer Brush · _v1.56.2 (engine/mixer.ts new, stroke.ts, index.ts, types.ts; extensions/tools/mixer.ts new, index.ts)

The parity plan's L4, first part (DEV_PLAN 23.4). `engine/mixer.ts`: `MixerSettings` (Wet, Load, Mix, the two after-each-stroke refills, Sample All Layers), `MixerState` (the reservoir, the picked-up paint, the level), `mixerStart` (refilled and cleaned as set), `mixerSource` (each dab picks up the canvas under it by Wet, lays the reservoir and the picked-up paint mixed by Mix, the canvas's share growing as the reservoir drains by distance painted, Load 100 lasting 800 px), `windowSampler` (the opacity-weighted mean of a small window of pixels read once as the stroke starts). `StrokeStyle.dabColor`, a per-dab colour source the stroke asks first; `dabTip(x, y)` and the shared `tinted`. The engine's `mixer`, `mixerState` and `mixerSourceFor`, `beginStroke` giving a Mixer stroke its source, the step named "Mixer Brush", `PAINT_TOOLS` warming it. The Mixer Brush tool (B with the Brush and Pencil; Alt-click loads the reservoir from the canvas) with its options. A first drain per dab emptied the reservoir within about 70 px because dabs come every pixel or so; the drain is by distance now. Verified in the browser under 4x CPU throttling with real pointer drags across red into blue with white loaded: Wet 0 and Mix 0 paint pure white as the Brush does; Wet 80 and Mix 50 start pink (237, 141, 141), carry pink across the red and turn a lighter blue (107, 120, 231) in the blue, bluer as the reservoir drains (88, 103, 228); Load 5 runs dry within the first few dabs; the step is "Mixer Brush"; the options bar shows its rows; layout shift 0; no errors. At 16 bits and in CMYK its strokes come through derive (1.55.9), since the colour varies along the stroke. Removed lines taken after the version edit. Removed from frontend:

```text
const PAINT_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['brush', 'cloneStamp', 'healingBrush', 'spotHealing', 'remove']);
    p.history.begin(opts.name ?? (this.brushMode === 'erase' ? 'Eraser' : 'Brush'), p.snapshot());
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, bg: { ...this.bg }, flow: this.brushFlow, aliased: !!opts.aliased || !!opts.square, square: !!opts.square }, op, p.selection);
export interface StrokeStyle { square?: boolean; bg?: RGB; aliased?: boolean; diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number }
    this.paintCtx.drawImage(this.dabTip(), p.x - rx, p.y - ry, rx * 2, ry * 2);
  /** The tip for this dab: coloured by Color Dynamics (towards the background, hue, saturation and brightness varied),
   *  else the stroke's own. */
  private dabTip(): Surface {
      this.paintCtx.drawImage(this.dabTip(), -rx, -ry, rx * 2, ry * 2);
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'colorSampler' | 'ruler' | 'note' | 'count' | 'contentAwareMove' | 'redEye' | 'rotateView' | 'idle';
  for (const tool of [historyBrushTool, frameTool, convertPointTool, selectionBrushTool, pencilTool, eraserTool, magicEraserTool, patternStampTool, backgroundEraserTool, colorSamplerTool, rulerTool, noteTool, countTool, contentAwareMoveTool, redEyeTool, rotateViewTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
export const VERSION = '1.56.1';
```

## CMYK PSD in and out, and agents see the mode · _v1.56.1 (engine/index.ts; io/api.ts; automation/agent-bridge.ts; app.ts; backend app/routers/io.py, mcp.py, requirements.txt; NOTICE.md; the agent skill's tools.md regenerated)

DEV_PLAN 22.8. `ag-psd` converts a CMYK PSD to RGB on reading and writes RGB only, so CMYK PSDs go through the engine's psd-tools 1.23.0 (MIT, pinned and credited). `api.decodeCmykPsd` and `api.encodeCmykPsd` (`CmykPsd`); the PSD import tries the CMYK reader first and opens such a file through `openCmykPsd` and `Engine.openChannelLayers` (each layer's ink beside its rendition, its place, opacity, visibility and blend mode, the embedded profile or the default one with a message); Export PSD from a CMYK document goes to `exportCmykPsd` (each pixel layer placed in ink and cropped to its pixels, the composite from `composeChannels`, the profile embedded; masks, styles and adjustment layers reach Photoshop in the composite only, and a message says so; PSB stays RGB for now). The MCP `get_document` reports `depth` and `profile` beside `mode`; the tool's description says so and `./formvis agents sync` regenerated the skill's tool reference. Verified in the browser through the real menus: a CMYK document with a red layer at 80 percent Multiply and K-only text, exported by Export PSD (130 KB) and opened through the app's own import input, comes back as a CMYK document with FOGRA39L Coated, the same three layers in order, the red layer's ink exactly (1, 231, 194, 46), its opacity and blend, and the text K-only on all 29 solid pixels; no errors. Not in this release: 16-bit CMYK TIFF, which needs a 16-bit CMYK writer Pillow lacks. Removed lines taken after the version edit. Removed from frontend:

```text
import { api, type Capabilities, type OpenedProject } from './io/api';
import { composeDeep, deepFromU16, deepToU16, deepToned } from './engine/deep';
          const data = { name: p.name, width: d.width, height: d.height, resolution: d.resolution ?? 72, mode: d.mode ?? 'rgb', activeLayerId: p.activeId,
export const VERSION = '1.55.9';
```

## Generated pixels through the table: every command at 16 bits and in CMYK · _v1.55.9 (engine/derive.ts new, history.ts, index.ts; app.ts)

DEV_PLAN 22.7, the plan's rule 2. `engine/derive.ts`: `deriveWhole` (a layer's floats from its 8-bit pixels, CMYK through the table, the foreground's and background's own ink where a pixel is within two levels of their rendition), `deriveRegion` (a pixel the operation did not change keeps its floats exactly; a changed one takes the new colour and keeps its old structure in proportion to how small the change was, none from 48 levels; a pixel that was empty keeps nothing), `renderRegion` (the region's rendition from the floats). The engine's `deriveChannels` applies them to replaced rasters (by region when the size and placement are unchanged, whole otherwise), to in-place patches (their region rendered back into the raster and the patch's after) and to new pixel layers; `deriveTables` gives the hints. It runs from `edit()` (instead of undoing, at 16 bits and in CMYK; 32 bits keeps its guard) and from a hook in `History.end` (`History.onStepEnd`, the engine's `stepHook`), because a reading of the code found about a dozen operations that open their step directly: the retouching tools, the Gradient tool, Crop, Move Pixels, Stroke Path, the erasers. The stroke end keeps the exact rebuild for Brush, Pencil and Eraser without colour dynamics (`colourDynamics`) and brings every other stroke through `deriveRegion`. `deepPaintOk` lets every tool paint at 16 bits and in CMYK once the tables load, and `beginRetouchStroke` uses it instead of `deepBlocked`. The gate turns to denylists at 16 bits (`DEEP16_NOT`: layer styles, the 8-bit-only modes, HDR Toning) and in CMYK (`CMYK_NOT`: layer styles, the depths, the 8-bit-only modes, Channel Mixer, Exposure, HDR Toning, the profile and proof commands, the HDR exports); 32 bits keeps its allowlist; the CMYK allowlist is gone. Verified in the browser: text typed with the foreground at K = 100 lands as K-only ink on all 94 solid pixels; an 8-bit edit through `edit()` leaves every untouched pixel's ink exact, composes, and undo restores exactly; the Gradient tool committed in CMYK brings the ink with it through the hook, composes, and undo restores exactly; a real Dodge stroke at 16 bits lightens the stroked pixels (0.451 to 0.733), changes only those 1,072 and leaves an untouched row with all 200 distinct 16-bit levels. A walk of every menu command inside a CMYK document (each enabled command run, its dialog confirmed, every pixel layer's ink checked after) ran 125 commands in 71 seconds with no layer losing or mis-sizing its ink; 94 were disabled by their own conditions (a selection, a path, text and so on), 79 skipped by design (files, modes, exports, panels); two console errors were the NodeMode and ComfyUI senders finding no server here; two reports of "another document in mode rgb" after Vibrance and Shadows/Highlights came from the walk's own extra documents, since replaying the exact sequence from a fresh document stays on the CMYK document. The walk's first two runs failed as probes (one wrote nothing until its end and ran past its limit; one stalled in its own set-up) and were rebuilt to record each command as it goes. Removed lines taken after the version edit. Removed from frontend:

```text
  const CMYK_OK = new Set(['new', 'open', 'import', 'save', 'save-as', 'download-project', 'close-tab', 'undo', 'redo', 'export-png', 'export-tiff', 'export-jpg', 'export-webp', 'export-avif', 'export-gif', 'export-pdf',
    'delete-layer', 'rename', 'forward', 'backward', 'select-all', 'deselect', 'inverse', 'mode-rgb', 'mode-cmyk',
    'duplicate', 'duplicate-dialog', 'group', 'add-mask', 'add-mask-hide', 'delete-mask', 'toggle-mask', 'link-mask', 'clip', 'blend-next', 'blend-prev',
    'filter-gaussianBlur', 'filter-unsharpMask', 'filter-addNoise', 'filter-motionBlur', 'filter-surfaceBlur', 'image-size', 'canvas-size', 'flip-canvas-h', 'flip-canvas-v', 'rotate-180', 'rotate-90-cw', 'rotate-90-ccw', 'trim', 'reveal-all', 'new-adj-levels', 'new-adj-curves', 'new-adj-invert', 'new-adj-posterize', 'new-adj-brightnessContrast', 'edit-adjustment',
    'fit', 'actual', 'pixel-grid', 'toggle-panels', 'rail-columns', 'reset-panels', 'merge-columns', 'settings', 'shortcuts', 'help', 'about', 'assistant', 'benchmark', 'copy-error-log', 'new-guide', 'clear-guides', 'lock-guides', 'clear-recent', 'edit-note', 'swatch-add', 'swatches-reset', 'manage-plugins']);
  for (const id of COLOUR_ADJ) { DEEP_OK.add(id); NOT_AT_32.add(id); if (id !== 'new-adj-channelMixer') CMYK_OK.add(id); }
  commands.gate = (c) => engine.current?.doc.mode === 'cmyk' ? CMYK_OK.has(c.id) || passes(c)
    : (engine.current?.doc.depth ?? 8) === 8 || ((DEEP_OK.has(c.id) || passes(c)) && !(engine.current?.doc.depth === 32 && NOT_AT_32.has(c.id)));
import type { Snapshot } from './history';
    if (patch && dl?.channels?.mode === 'rgb' && dl.raster === patch.raster) {
    } else if (patch && dl?.channels?.mode === 'cmyk' && dl.raster === patch.raster && st.project.cmykLut) {
    if (this.deepBlocked('Painting')) return false;   // 1.53.6
    const colourVaries = ['fgBg', 'hue', 'saturation', 'brightness'].some((k) => JSON.stringify(cur[k]) !== JSON.stringify(base[k]));
    if ((this.tool === 'brush' || this.tool === 'pencil' || this.tool === 'eraser') && !colourVaries) return true;
    return !this.deepBlocked(colourVaries ? 'Painting with colour dynamics' : 'This tool');
export const VERSION = '1.55.8';
```

## Adaptive Wide Angle, and M4 closed · _v1.55.8 (engine/wide-angle.ts new; ui/panels/wide-angle-dialog.ts new; app.ts)

The parity plan's M4, third part (DEV_PLAN 23.3), which closes the row with Content-Aware Scale (1.55.4) and Perspective Warp (1.55.6). `engine/wide-angle.ts`: three lens models (equidistant fisheye, equisolid, stereographic), Strength as the field of view across the diagonal up to 179 degrees, the inverse map from the rectilinear view (`wideAngle`, the centre's scale kept, Scale and Rotation applied in the output), `forward` for points, `crookedness` (the RMS distance of corrected points from their total-least-squares line over its length), `fitStrength` (a 0.02 scan then a golden-section search) and `levelRotation` (the nearer of level and plumb for the first line). `WideAngleDialog` (Filter > Adaptive Wide Angle, before Lens Correction): the layer drawn once into a fixed 400 by 250 picture where clicks add constraint points, New line, Clear lines, Fit to lines, Correction, Strength, Scale and Rotation rows, a note held to two lines, the live preview through `previewImageEdit`, OK as one step through `rescaleLayerPixels` on the whole raster (so a selection does not move the lens centre). Verified under 4x CPU throttling with real clicks: on a synthetic equidistant fisheye made at strength 0.6 (107 degrees) of a straight world line, six points clicked along the curve and Fit to lines found 107 degrees and 0.0 degrees of rotation; after OK the line's rows across five columns went from 93, 90, 89, 90, 94 to 88 at every column, as one "Adaptive Wide Angle" step; layout shift 0; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    { label: 'Filter', items: ['filter-develop', 'filter-lensCorrection', 'filter-liquify', 'filter-neural', '-',
export const VERSION = '1.55.7';
```

## Colour-model operations in every mode · _v1.55.7 (engine/compose-float.ts, channels.ts, project.ts, index.ts, renderer.ts; ui/info.ts, channels.ts; app.ts)

DEV_PLAN 22.6. The plan said "through Lab"; what shipped goes through the document's rendition instead, and this entry says why. formvis defines its colour adjustments as 8-bit kernels on RGB (`kernelFor`, now exported from `renderer.ts`); a Lab route would mean a second definition of each, behaving differently from the same adjustment in an RGB document. `viaKernel` runs the RGB document's own kernel on the composite's rendition. At 16 bits the change is added to the floats (identity exact; a same-channel tweak keeps the 16-bit gradation; a channel-moving change such as a 120 degree hue rotation comes out at 8-bit precision of the change, within half a level of the 8-bit result). In CMYK the result is separated by the profile (`inkOf`) and the original ink's own structure (its black generation, a K-only black, detail beyond sRGB) is carried over in proportion to how small the change is, fully at no change and not at all from 48 levels (`KEEP_LEVELS`). The six non-separable blend modes in CMYK go the same way relative to the backdrop, Darker and Lighter Color choosing whole inks exactly. `CmykLuts`, `Project.cmykTables`, `composeChannels(doc, luts)` at its five call sites; the composed CMYK canvas also applies when a layer uses a blend mode other than Normal, so the canvas matches the export. The gates open Hue/Saturation, Vibrance, Color Balance, Black and White, Photo Filter, Threshold, Selective Color, Gradient Map, Color Lookup and Shadows/Highlights layers at 16 bits and in CMYK, and Channel Mixer at 16 bits only (in CMYK it would mix RGB channels, not inks); none at 32 bits. Verified in the browser: an identity Hue/Saturation leaves red ink, a K-only black and a K-only grey exactly as they were; a 3 degree hue shift leaves a K-only black at (0, 0, 0, 100); a 120 degree shift turns red ink into (70, 0, 94, 0), equal to the profile's separation of the kernel's result; Threshold turns a K-only 50 percent grey into paper and red into rich black; a Color blend layer in CMYK gives ink equal to an independent canvas 'color' composite separated by the profile; at 16 bits identity is exact and a 120 degree shift is within 0.5 levels of the 8-bit kernel; unit 188. The probe's first runs set Hue/Saturation data in the wrong shape and through a deferred live update, which left the kernel at identity; the runs above build the settings with the module's own converters. Removed lines taken after the version edit. Removed from frontend:

```text
        const ink = composeChannels(p.doc);
import { composeFloat } from './compose-float';
export function composeChannels(doc: Doc): { width: number; height: number; data: Float32Array } | { error: string } {
  return composeFloat(doc, 4, true);
 *  Invert, Posterize, Brightness/Contrast, Exposure) applied per channel under their masks. The non-separable modes
 *  (Hue, Saturation, Color, Luminosity, Darker and Lighter Color) run on RGB floats by the W3C formulas and wait for
 *  Lab in CMYK; layer styles wait for 22.7; both say so. Groups are pass-through, as the renderer treats them. */
export function composeFloat(doc: Doc, n: 3 | 4, paperWhite: boolean): FloatComposite | { error: string } {
      if (!t) return { error: `${name} is an adjustment that waits for Lab in this mode.` };
    if (!sep && mode !== 'dissolve' && (n !== 3 || !nonSeparable(mode, [0, 0, 0], [0, 0, 0]))) return { error: `${name} uses ${mode}, which waits for Lab in this mode.` };
    else if (p.doc.mode === 'cmyk' && p.cmykLut && !this.stroke && p.doc.layers.some((l) => l.adjustment && l.visible)) {
    const ink = composeChannels(p.doc), r = 'error' in ink || !p.cmykLut ? null : rasterFromChannels({ mode: 'cmyk', n: 4, width: ink.width, height: ink.height, data: ink.data }, p.cmykLut);
function kernelFor(adj: Adjustment | null): Kernel | null {
    const ink = cmyk && p ? composeChannels(p.doc) : null, inkOk = ink && !('error' in ink) ? ink : null;
      const ink = composeChannels(e.current.doc);
    if (!this.ink) { const c = composeChannels(p.doc); if ('error' in c) return null; this.ink = { data: c.data, w: c.width, h: c.height }; }
export const VERSION = '1.55.6';
```

## Perspective Warp · _v1.55.6 (engine/perspective.ts new, index.ts; extensions/tools/move.ts; app.ts)

The parity plan's M4, second part (DEV_PLAN 23.3). `engine/perspective.ts`: `homography` (the direct linear transform, 8 equations, partial pivoting), `invertH`, `applyH`, `convexQuadTLTRBRBL`, `perspectiveImage` (each output pixel takes the warped quad holding it, or the nearest by edge distance, back through that plane's inverse map and the layer's placement, sampled bilinearly in premultiplied alpha), `straighten` (edges within 20 degrees of vertical or horizontal made exact, shared corners moved together). The engine's `perspectiveEdit`, modelled on Puppet Warp: `beginPerspectiveWarp`, `addPerspectivePlane` (a dragged rectangle, corners snapping to other planes'), `movePerspectiveCorner` (in Layout the layout and warped corner together, in Warp the warped one; every plane's corner at the same place moves with it; folding moves ignored), `setPerspectivePhase` (Layout returns only before anything is warped), `straightenPerspective`, a 360-pixel preview per frame through the display's overrides, `applyPerspectiveWarp` (full resolution, trimmed, one step), `cancelPerspectiveWarp`. The region rendered holds the layer's box mapped by each plane and every warped quad, clamped to twice the document's size around it. The engine's homography from `distort.ts` keeps its name; this one is imported as `quadHomography`. Mesh and Puppet Warp refuse to begin while a perspective warp is pending. The Move tool: corner hit-test, drawing a plane in Layout (over 8 screen pixels), corner drags, Enter and Escape, the overlay (dashed in Layout, solid in Warp, a thirds grid, square handles, the plane being drawn), and the options bar's Layout and Warp segment, Straighten verticals, Level horizontals, Apply and Cancel (built once, shown while pending). Edit > Perspective Warp sits before Puppet Warp. Verified in the browser under 4x CPU throttling with real pointer drags: a plane drawn and its four corners dragged onto a red trapezoid's land exactly on (110, 40), (210, 40), (260, 200), (60, 200); in Warp, dragging the top corners out to (60, 40) and (260, 40) and pressing Enter turns the trapezoid into a rectangle (the red run 106 and 194 pixels at two rows before, 198 and 198 after) as one "Perspective Warp" step; the options bar shows the segment in Layout, switches phase on a click and shows the four Warp buttons, and its Cancel ends the warp; layout shift 0.00005; no errors. Known: a seam can show where two planes with different perspectives meet, since each plane carries its own map. Removed lines taken after the version edit. Removed from frontend:

```text
      'fill-path-dialog', 'stroke-path-dialog', '-', { label: 'Transform', items: ['transform', 'transform-warp'] }, 'puppet-warp', '-', 'define-pattern', '-', 'assign-profile', 'convert-profile', '-', 'shortcuts', 'settings'] },
    if (!p || !l || this.stroke || this.transformEdit || this.distortEdit || this.meshWarpEdit) return false;
    if (!p || !l || this.stroke || this.transformEdit || this.distortEdit || this.meshWarpEdit || this.puppetEdit) return false;
export const VERSION = '1.55.5';
```

## Compositing in the mode · _v1.55.5 (engine/compose-float.ts new, channels.ts, deep.ts, deep.test.ts under 2a; app.ts)

DEV_PLAN 22.5. `composeFloat(doc, n, paperWhite)`: one float compositor for 16-bit and CMYK documents (32-bit keeps its linear path with Exposure unclamped). All 19 separable blend modes per channel by the W3C formulas (`SEPARABLE_FLOAT`, which also gives the window formulas for the canvas-native modes it never had in code), on paper-white values in CMYK so Multiply darkens as Photoshop's CMYK does; Dissolve by `dissolveNoise`; the six non-separable modes by SetLum and SetSat on RGB floats, named as waiting for Lab in CMYK; opacity and fill; the layer's own mask and its folders' masks through their placements (`maskCoverage`, cached per mask); clipping to a base layer's placed alpha (cached per base); adjustment layers with a transfer per channel under their masks; groups pass-through as the renderer treats them; layer styles named as waiting for 22.7. A document whose layers lack `parentId` (test documents) is walked as top-level. `composeChannels` and the 16-bit `composeDeep` route through it, so exports, the composed CMYK display, the Channels thumbnails and Info all gain blend modes, masks and clipping at once. The gates open duplicate, group, the mask commands, clipping and blend next and previous at depth and in CMYK. `deep.test.ts`: the expectation that a mask is refused became one that a style is, since masks compose. Verified in the browser: a CMYK document with Normal, Multiply at 80 percent and Screen at 60 percent under a half-black layer mask, composed in ink, matches the 8-bit compositor's formulas run on each ink as a grey image to 0.51 levels; unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    'new-adj-levels', 'new-adj-curves', 'new-adj-exposure', 'new-adj-invert', 'new-adj-posterize', 'new-adj-brightnessContrast', 'edit-adjustment', 'flip-canvas-h', 'flip-canvas-v', 'rotate-180', 'rotate-90-cw', 'rotate-90-ccw', 'canvas-size', 'image-size', 'trim', 'reveal-all', 'filter-gaussianBlur', 'filter-motionBlur', 'filter-surfaceBlur', 'filter-unsharpMask', 'filter-addNoise', 'delete-layer', 'rename', 'forward', 'backward', 'select-all', 'deselect', 'inverse', 'depth-8', 'depth-16', 'assign-profile', 'proof-setup', 'proof-colors', 'gamut-warning',
import { place, transferOf } from './deep';
  const W = doc.width, H = doc.height, out = new Float32Array(W * H * 5);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    const name = `"${l.name}"`;
    if (l.isGroup || l.mask || l.clipId || l.effects || (l.blend && l.blend !== 'normal')) return { error: `${name} uses a group, mask, clipping, style or blend mode, which CMYK export does not compose yet.` };
    if (l.adjustment) {
      const t = transferOf(l.adjustment);
      if (!t) return { error: `${name} is an adjustment CMYK does not compose yet (Levels and Curves do).` };
      const op = l.opacity * (l.fill ?? 1);
      for (let i = 0; i < out.length; i += 5) for (let c = 0; c < 4; c++) { const v = 1 - out[i + c], nv = 1 - Math.min(1, Math.max(0, t(c, v * 255) / 255)); out[i + c] += (nv - out[i + c]) * op; }
      continue;
    }
    if (!l.channels) { if (l.raster) return { error: `${name} has no CMYK ink; Image > Mode > CMYK Color converts it.` }; continue; }
    place(out, W, H, l.channels, l.transform, l.opacity * (l.fill ?? 1), 5);
  }
  return { width: W, height: H, data: out };
export const VERSION = '1.55.4';
```

## Content-Aware Scale · _v1.55.4 (engine/index.ts; io/api.ts; ui/panels/content-aware-scale.ts new; app.ts; backend app/routers/seam.py new, app/main.py)

The parity plan's M4, first part (DEV_PLAN 23.3). Image > Content-Aware Scale: `ContentAwareScaleDialog` (Width and Height as percentages, Protect skin tones, Protect the selection; rows built once; the note held to two lines; one step), `api.contentAwareScale` (the layer's PNG, the target size, skin protection, an optional protect-mask PNG from the selection sampled in layer space), `Engine.rescaleLayerPixels` (new pixels at a new size, the box resized in place). The engine's `seam.py`: seam carving (Avidan and Shamir) vectorised over rows; the lowest-energy vertical seams removed to narrow, or the k lowest seams found on the original and inserted with their neighbours averaged to enlarge; height through the transpose; energy is the luminance gradient plus the protection mask times a million; a quarter to twice the size in one step, up to 12 megapixels. The command is 8-bit RGB for now (it replaces the raster). Verified: in the engine a 320 by 200 scene narrows to 240 in 0.58 s and enlarges to 400 in 0.72 s; an unprotected flat disc is carved through (its interior has no gradient, the classic behaviour, looked at), a protected one keeps its 81-pixel width exactly; in the browser under 4x CPU throttling through the dialog with the selection protecting the disc, the layer goes from 320 to 240 wide with its box following and the disc keeps all 80 of its red pixels where plain scaling leaves 60, one "Content-Aware Scale" step, undo restores 320, layout shift 0, no errors. Removed lines taken after the version edit. Removed from frontend:

```text
      'image-size', 'canvas-size', { label: 'Image Rotation', items: ['rotate-180', 'rotate-90-cw', 'rotate-90-ccw', '-', 'flip-canvas-h', 'flip-canvas-v'] }, '-', 'trim', 'reveal-all', '-', 'generative-expand', { label: 'Upscale', items: ['upscale-2x', 'upscale-4x'] }] },
export const VERSION = '1.55.3';
```

## Image Rotation, and Surface Blur on the one model · _v1.55.3 (engine/index.ts, selection.ts, deep.ts; ui/panels/filter-panel.ts; app.ts)

DEV_PLAN 22.4, third part. Image > Image Rotation gains 180°, 90° Clockwise and 90° Counter Clockwise, which formvis never had (only the flips): `Engine.rotateCanvas(quarters)` turns every layer's box about the document's centre and adds to its rotation (the placement rotates about the box centre, so flips compose correctly), masks and artboards with it, swaps the document's width and height in the same assignment as the layers (as `resizeCanvas` does), and turns the selection through `SelectionMask.rotated`; no pixel is resampled, so the commands sit in `DEEP_OK` and `CMYK_OK`. `surfaceBlurDeep`: the 8-bit filter's neighbourhood and weights, the threshold in the same levels, on every channel but alpha; the filter panel's float path takes Surface Blur, opened at depth and in CMYK. Settled by reading: Free Transform is the Move tool's box and commits only a transform, so it already works at depth and in CMYK; the warps rasterise and stay gated until a float path exists. Verified in the browser: after 90° CW a corner mark lands at the top right, an offset layer where it should, the selection at [70, 0, 10, 20]; 90° CCW restores everything exactly; 180° maps both layers; undo restores the size; `surfaceBlurDeep` on CMYK ink equals the same blur of each ink as a grey image to 0.00 and lowers a noisy patch's magenta noise from 1.64 to 0.31 percent; unit 188; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
      'image-size', 'canvas-size', { label: 'Image Rotation', items: ['flip-canvas-h', 'flip-canvas-v'] }, '-', 'trim', 'reveal-all', '-', 'generative-expand', { label: 'Upscale', items: ['upscale-2x', 'upscale-4x'] }] },
    'new-adj-levels', 'new-adj-curves', 'new-adj-exposure', 'new-adj-invert', 'new-adj-posterize', 'new-adj-brightnessContrast', 'edit-adjustment', 'flip-canvas-h', 'flip-canvas-v', 'canvas-size', 'image-size', 'trim', 'reveal-all', 'filter-gaussianBlur', 'filter-motionBlur', 'filter-unsharpMask', 'filter-addNoise', 'delete-layer', 'rename', 'forward', 'backward', 'select-all', 'deselect', 'inverse', 'depth-8', 'depth-16', 'assign-profile', 'proof-setup', 'proof-colors', 'gamut-warning',
    'filter-gaussianBlur', 'filter-unsharpMask', 'filter-addNoise', 'filter-motionBlur', 'image-size', 'canvas-size', 'flip-canvas-h', 'flip-canvas-v', 'trim', 'reveal-all', 'new-adj-levels', 'new-adj-curves', 'new-adj-invert', 'new-adj-posterize', 'new-adj-brightnessContrast', 'edit-adjustment',
import { blurDeep, motionBlurDeep, noiseDeep, unsharpDeep } from '../../engine/deep';
    const deep = kind === 'gaussianBlur' ? (d: DeepPixels): DeepPixels => blurDeep(d, s.radius) : kind === 'unsharpMask' ? (d: DeepPixels): DeepPixels => unsharpDeep(d, s.usmAmount, s.usmRadius, s.threshold) : kind === 'addNoise' ? (d: DeepPixels): DeepPixels => noiseDeep(d, s.amount, s.gaussian, s.monochromatic, seed) : kind === 'motionBlur' ? (d: DeepPixels): DeepPixels => motionBlurDeep(d, s.angle, s.distance) : null;
export const VERSION = '1.55.2';
```

## JPEG Artifacts Removal and Super Zoom complete the gallery · _v1.55.2 (engine/neural.ts; ui/panels/neural-dialog.ts; app.ts)

DEV_PLAN 23.2, fifth part. No FBCNN ONNX exists on the Hub and this environment cannot export one (no PyTorch), so JPEG Artifacts Removal's first version needs no model: `deblock` spreads the steps across JPEG's 8-pixel block boundaries over four pixels where the jump is below an edge threshold (24 levels: a real edge is kept), then a light Surface Blur softens the mosquito noise in flat areas, scaled by Strength; FBCNN (Apache-2.0 at its source) replaces it when an export can be pinned. Super Zoom is Real-ESRGAN's Upscale, already shipped: the gallery's entry takes a Factor (2x, 4x) and hands off to `upscale-2x` or `upscale-4x` through `onSuperZoom`, which the app wires to the commands. The gallery's seven are now all present: Harmonize, Skin Smoothing, Depth Blur, Colorize, Style Transfer, JPEG Artifacts Removal, Super Zoom. Verified under 4x CPU throttling on a gradient re-encoded as a quality-12 JPEG: the block-boundary step ratio (on-grid against off-grid differences) fell from 53.2 to 9.6 while a hard black edge kept its 134-level jump exactly, as one "JPEG Artifacts Removal" step; Super Zoom opened "Upscale 2x"; layout shift 0 after the JPEG note was shortened to the note's two lines (a longer first wording made a third line and measured 0.00402); no errors. The README's line counts follow the code (36,500 TypeScript, 8,100 Python). Removed lines taken after the version edit. Removed from frontend:

```text
import { depthBlur, harmonize, mixColor, skinSmooth } from '../../engine/neural';
type NeuralKind = 'harmonize' | 'skinSmooth' | 'depthBlur' | 'colorize' | 'style';
export const NEURAL_LABELS: Record<NeuralKind, string> = { harmonize: 'Harmonize', skinSmooth: 'Skin Smoothing', depthBlur: 'Depth Blur', colorize: 'Colorize', style: 'Style Transfer' };
  private readonly s = { amount: 100, smooth: 60, radius: 6, focus: 70, range: 15, blur: 8 };
    this.rows.push({ el: amount.el, kinds: ['harmonize', 'colorize', 'style'] }, { el: smooth.el, kinds: ['skinSmooth'] }, { el: radius.el, kinds: ['skinSmooth'] }, { el: focus.el, kinds: ['depthBlur'] }, { el: range.el, kinds: ['depthBlur'] }, { el: blur.el, kinds: ['depthBlur'] }, { el: styleRow.el, kinds: ['style'] });
    this.body.append(amount.el, smooth.el, radius.el, focus.el, range.el, blur.el, styleRow.el, this.note);
    const run = this.run(), kind = this.kind;
export const VERSION = '1.55.1';
```

## Style Transfer presets, the third model-backed Neural Filter · _v1.55.1 (io/local-gen.ts; ui/panels/neural-dialog.ts, local-models.ts; backend app/localgen/style.py new, paths.py, model_manager.py, main.py, requirements.txt)

DEV_PLAN 23.2, fourth part. The gate first: an AdaIN export would need PyTorch, which this environment lacks, so Style Transfer's first version is five preset styles from the ONNX model zoo's fast neural style models (Johnson et al.; the zoo's files are BSD-3-Clause), each pinned to a SHA-256 computed from the real download. `localStyle` and `styleReady`; the gallery's Style Transfer with a Style choice (Mosaic, Candy, Rain Princess, Udnie, Pointilism) and Amount, the styled picture fetched once per layer and style (`ensureStyle`) and mixed by `mixColor`; the Local models card. Verified under 4x CPU throttling through the gallery: the Style select holds five options, a gradient-and-disc scene changes by a mean 47.9 on the red channel as one "Style Transfer" step, layout shift 0, no errors; in the engine each preset ran on a real photograph at 640 px in 1.1 to 1.5 s at its own size (Mosaic looked at: a stained-glass rendering). Removed lines taken after the version edit. Removed from frontend:

```text
    this.el.append(el('<p class="cv-note">Models that run here, with no key and no cost: they appear in Generate Image, and Krea 2 in Generative Fill. They are large, and each licence is shown for you to accept before anything downloads.</p>'), this.lama, this.depth, this.ddcolor, this.upscaler, this.krea, this.klein, this.library);
    try { await Promise.all([this.showDownload(this.lama, 'lama-inpaint', 'LaMa inpainting', 'Download LaMa', 'about 208 MB', 'Generative Fill and Expand on any computer, with no prompt, key or cost: it fills from what surrounds the selection. Apache-2.0.'), this.showDownload(this.depth, 'depth-anything-v2-small', 'Depth Anything V2 Small', 'Download Depth Anything', 'about 99 MB', 'Depth from one picture for the Neural Filters\' Depth Blur, on any computer. The Small checkpoint, Apache-2.0.'), this.showDownload(this.ddcolor, 'ddcolor-tiny', 'DDColor-tiny', 'Download DDColor', 'about 135 MB', 'Colour for black-and-white pictures in the Neural Filters, on any computer; the picture\'s own light is kept. Apache-2.0.'), this.showUpscaler(), this.showKrea(), this.showKlein(), this.showLibrary()]); }
import { colorizeReady, depthReady, localColorize, localDepth } from '../../io/local-gen';
type NeuralKind = 'harmonize' | 'skinSmooth' | 'depthBlur' | 'colorize';
export const NEURAL_LABELS: Record<NeuralKind, string> = { harmonize: 'Harmonize', skinSmooth: 'Skin Smoothing', depthBlur: 'Depth Blur', colorize: 'Colorize' };
    const pick = selectRow('Filter', (Object.keys(NEURAL_LABELS) as NeuralKind[]).map((k) => [k, NEURAL_LABELS[k]] as const), (v) => { this.kind = v as NeuralKind; this.showRows(); void this.ensureDepth(); void this.ensureColor(); this.schedule(); });
    this.rows.push({ el: amount.el, kinds: ['harmonize', 'colorize'] }, { el: smooth.el, kinds: ['skinSmooth'] }, { el: radius.el, kinds: ['skinSmooth'] }, { el: focus.el, kinds: ['depthBlur'] }, { el: range.el, kinds: ['depthBlur'] }, { el: blur.el, kinds: ['depthBlur'] });
    this.body.append(amount.el, smooth.el, radius.el, focus.el, range.el, blur.el, this.note);
    const s = { ...this.s }, back = this.backdrop, depth = this.depth?.map ?? null, color = this.color?.pixels ?? null;
export const VERSION = '1.54.9';
```

## Colorize, the second model-backed Neural Filter · _v1.54.9 (engine/neural.ts; io/local-gen.ts; ui/panels/neural-dialog.ts, local-models.ts; backend app/localgen/colorize.py new, model_manager.py, main.py)

DEV_PLAN 23.2, third part. The gate first: DDColor is Apache-2.0 at its source (piddnad/DDColor); edgetools' DDColor-tiny export (fp16 weights, float32 in and out, fixed 512, `input` 1 by 3 by 512 by 512, `output` 1 by 2 by 512 by 512 read from the session) is pinned to revision 4755ae9f and to SHA-256 2653da00... computed from the real 135 MB download. `localColorize` and `colorizeReady`; `mixColor` (the colourised picture blended into the source by Amount, alpha kept); the gallery's Colorize, fetching the colour once per layer when chosen (`ensureColor`), with the download prompt when the model is absent; the Amount row serves Harmonize and Colorize; the Local models card. Verified: in the engine, a grey version of a real pier photograph comes back with a warm sky, blue water and sand (looked at, not only measured), luminance kept within 0.9 of the grey, saturation 24.5 against the original's 52.8, 6 s a picture here; in the browser under 4x CPU throttling through the gallery, a grey scene gains mean saturation 85 with mean luminance 132.2 to 132.7, as one "Colorize" step, layout shift 0, no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    this.el.append(el('<p class="cv-note">Models that run here, with no key and no cost: they appear in Generate Image, and Krea 2 in Generative Fill. They are large, and each licence is shown for you to accept before anything downloads.</p>'), this.lama, this.depth, this.upscaler, this.krea, this.klein, this.library);
    try { await Promise.all([this.showDownload(this.lama, 'lama-inpaint', 'LaMa inpainting', 'Download LaMa', 'about 208 MB', 'Generative Fill and Expand on any computer, with no prompt, key or cost: it fills from what surrounds the selection. Apache-2.0.'), this.showDownload(this.depth, 'depth-anything-v2-small', 'Depth Anything V2 Small', 'Download Depth Anything', 'about 99 MB', 'Depth from one picture for the Neural Filters\' Depth Blur, on any computer. The Small checkpoint, Apache-2.0.'), this.showUpscaler(), this.showKrea(), this.showKlein(), this.showLibrary()]); }
import { depthBlur, harmonize, skinSmooth } from '../../engine/neural';
import { depthReady, localDepth } from '../../io/local-gen';
type NeuralKind = 'harmonize' | 'skinSmooth' | 'depthBlur';
export const NEURAL_LABELS: Record<NeuralKind, string> = { harmonize: 'Harmonize', skinSmooth: 'Skin Smoothing', depthBlur: 'Depth Blur' };
    const pick = selectRow('Filter', (Object.keys(NEURAL_LABELS) as NeuralKind[]).map((k) => [k, NEURAL_LABELS[k]] as const), (v) => { this.kind = v as NeuralKind; this.showRows(); void this.ensureDepth(); this.schedule(); });
    this.rows.push({ el: amount.el, kinds: ['harmonize'] }, { el: smooth.el, kinds: ['skinSmooth'] }, { el: radius.el, kinds: ['skinSmooth'] }, { el: focus.el, kinds: ['depthBlur'] }, { el: range.el, kinds: ['depthBlur'] }, { el: blur.el, kinds: ['depthBlur'] });
    const s = { ...this.s }, back = this.backdrop, depth = this.depth?.map ?? null;
export const VERSION = '1.54.8';
```

## Depth Blur, the first model-backed Neural Filter · _v1.54.8 (engine/neural.ts; io/local-gen.ts; ui/panels/neural-dialog.ts, local-models.ts; backend app/localgen/depth.py new, model_manager.py, main.py)

DEV_PLAN 23.2, second part. The gate first: Depth Anything V2 Small is Apache-2.0 at its source (Base, Large and Giant are CC-BY-NC and are not used); onnx-community's ONNX export is pinned to revision 413ce838 and to SHA-256 afb6a5c2... computed from the real 99 MB download. `depthBlur` (three blur levels mixed by distance from the focal depth past a sharp range); `localDepth` and `depthReady` in `local-gen.ts`. The gallery gains Depth Blur (Focus, Sharp range, Blur) and reads the layer's depth once per layer when the filter is chosen, saying when the model needs downloading; the note keeps two lines of height so its changing text never resizes the dialog (a first run measured layout shift 0.00362 from that; 0 after). Preferences > Plugins > Local models gains the model's card, built once. Verified under 4x CPU throttling, end to end through the engine: on a striped scene with a near block and a far sky, the near block's stripe contrast stays 63 and the sky's falls from 44 to 36 as one "Depth Blur" step; layout shift 0; no errors. Removed lines taken after the version edit. Removed from frontend:

```text
    this.el.append(el('<p class="cv-note">Models that run here, with no key and no cost: they appear in Generate Image, and Krea 2 in Generative Fill. They are large, and each licence is shown for you to accept before anything downloads.</p>'), this.lama, this.upscaler, this.krea, this.klein, this.library);
    try { await Promise.all([this.showDownload(this.lama, 'lama-inpaint', 'LaMa inpainting', 'Download LaMa', 'about 208 MB', 'Generative Fill and Expand on any computer, with no prompt, key or cost: it fills from what surrounds the selection. Apache-2.0.'), this.showUpscaler(), this.showKrea(), this.showKlein(), this.showLibrary()]); }
import { harmonize, skinSmooth } from '../../engine/neural';
type NeuralKind = 'harmonize' | 'skinSmooth';
export const NEURAL_LABELS: Record<NeuralKind, string> = { harmonize: 'Harmonize', skinSmooth: 'Skin Smoothing' };
  private readonly s = { amount: 100, smooth: 60, radius: 6 };
  private readonly note = el('<p class="cv-dialog-note" role="status"></p>');
    const pick = selectRow('Filter', (Object.keys(NEURAL_LABELS) as NeuralKind[]).map((k) => [k, NEURAL_LABELS[k]] as const), (v) => { this.kind = v as NeuralKind; this.showRows(); this.schedule(); });
    this.rows.push({ el: amount.el, kinds: ['harmonize'] }, { el: smooth.el, kinds: ['skinSmooth'] }, { el: radius.el, kinds: ['skinSmooth'] });
    this.body.append(amount.el, smooth.el, radius.el, this.note);
    setText(this.note, this.kind === 'harmonize' ? 'Harmonize moves the layer\'s light and colour toward what lies beneath it (its mean and spread per channel), by the amount.' : 'Skin Smoothing softens skin tones only: other pixels are untouched.');
    const s = { ...this.s }, back = this.backdrop;
    return this.kind === 'harmonize' ? (src) => (back ? harmonize(src, back, s.amount / 100) : src) : (src) => skinSmooth(src, s.smooth / 100, s.radius);
export const VERSION = '1.54.7';
```

## Neural Filters, the gallery and its first two · _v1.54.7 (engine/neural.ts new, index.ts; ui/panels/neural-dialog.ts new; app.ts)

DEV_PLAN 23.2, first part: the row none of the compared builds has. `NeuralFiltersDialog` (Filter > Neural Filters, `filter-neural`): a filter selector and every filter's rows built once, the other filters' rows kept in place by visibility so switching moves nothing (a first landing used `hidden` and measured layout shift 0.00512; visibility brought it to 0), a live preview through `previewImageEdit`, OK as one `applyImageEdit` step. `engine/neural.ts`: `harmonize` (Reinhard's statistics transfer in YCbCr from the composite beneath the layer, pixels weighted by alpha, blended by amount), `skinMask` (soft Cb 77 to 127 and Cr 133 to 173 bands) and `skinSmooth` (Surface Blur under the mask, blended by amount). `Engine.compositeBelow(id)` renders the layers beneath one at document size. The gallery is 8-bit RGB for now (not in `DEEP_OK` or `CMYK_OK`). Verified under 4x CPU throttling: the gallery lists Harmonize and Skin Smoothing; Harmonize moves a flat skin patch over a blue backdrop to (85, 90, 128) as one "Harmonize" step; Skin Smoothing lowers a noisy patch's red-channel noise from sd 11.7 to 7.9; layout shift 0, no errors. The model-backed filters (Depth Blur, Colorize, Style Transfer, Super Zoom, JPEG Artifacts Removal) follow as each licence and pin lands. Removed lines taken after the version edit. Removed from frontend:

```text
    { label: 'Filter', items: ['filter-develop', 'filter-lensCorrection', 'filter-liquify', '-',
export const VERSION = '1.54.6';
```

## Invert, Posterize, Brightness/Contrast and Motion Blur at depth and in ink · _v1.54.6 (engine/adjust-params.ts, deep.ts; ui/panels/filter-panel.ts; app.ts)

DEV_PLAN 22.4, second part. `lut()` in `adjust-params.ts`, behind Invert, Posterize and Brightness/Contrast, exposes a `transfer` that evaluates its function on floats (no 8-bit table on the way), so `transferOf` serves them and the float compositors (`composeDeep`, `composeChannels`) apply them per channel, per ink on paper-white values. `motionBlurDeep`: the 8-bit filter's samples along the line, premultiplied, any channel count. The filter panel's float path takes Motion Blur. `DEEP_OK` and `CMYK_OK` open the three adjustments, `edit-adjustment` and Motion Blur; `NOT_AT_32` holds the three adjustments (they clip past white). Verified in the browser: in CMYK the five are offered (Threshold, a luminosity operation, stays for 22.6); an Invert layer turns ink (0, 91, 76, 18) into (100, 9, 24, 82); `motionBlurDeep` on ink equals the same blur of each ink as a grey image to 0.00; unit 188. Removed lines taken after the version edit. Removed from frontend:

```text
    'new-adj-levels', 'new-adj-curves', 'new-adj-exposure', 'edit-adjustment', 'flip-canvas-h', 'flip-canvas-v', 'canvas-size', 'image-size', 'trim', 'reveal-all', 'filter-gaussianBlur', 'filter-unsharpMask', 'filter-addNoise', 'delete-layer', 'rename', 'forward', 'backward', 'select-all', 'deselect', 'inverse', 'depth-8', 'depth-16', 'assign-profile', 'proof-setup', 'proof-colors', 'gamut-warning',
  const NOT_AT_32 = new Set(['new-adj-levels', 'new-adj-curves', 'filter-unsharpMask', 'filter-addNoise', 'assign-profile', 'proof-setup', 'proof-colors', 'gamut-warning']);
    'filter-gaussianBlur', 'filter-unsharpMask', 'filter-addNoise', 'image-size', 'canvas-size', 'flip-canvas-h', 'flip-canvas-v', 'trim', 'reveal-all', 'new-adj-levels', 'new-adj-curves',
  return (px) => { for (let i = 0; i < px.length; i += 4) { px[i] = t[px[i]]; px[i + 1] = t[px[i + 1]]; px[i + 2] = t[px[i + 2]]; } };
import { blurDeep, noiseDeep, unsharpDeep } from '../../engine/deep';
    const deep = kind === 'gaussianBlur' ? (d: DeepPixels): DeepPixels => blurDeep(d, s.radius) : kind === 'unsharpMask' ? (d: DeepPixels): DeepPixels => unsharpDeep(d, s.usmAmount, s.usmRadius, s.threshold) : kind === 'addNoise' ? (d: DeepPixels): DeepPixels => noiseDeep(d, s.amount, s.gaussian, s.monochromatic, seed) : null;
export const VERSION = '1.54.5';
```

## Blend If and Knockout · _v1.54.5 (engine/types.ts, renderer.ts, index.ts; io/psd.ts; ui/panels/layer-style-dialog.ts)

The parity plan's M2, DEV_PLAN 23.1. `Layer.blendIf` (`BlendIf`: channel gray, r, g or b; `thisLayer` and `underlying` as [blackStart, blackEnd, whiteStart, whiteEnd], feathered between each pair), `Layer.knockout` (none, shallow, deep), `BLEND_IF_IDENTITY`, `blendIfActive`. The CPU renderer: a layer with either option leaves the fast path; `blendIf()` multiplies its coverage by the range factor of its own value and of the underlying composite's (an empty backdrop counts as white), on the grey (Rec. 601) or one channel; `knockout()` renders the backdrop (the Background for deep, or shallow outside a group; everything below the group for shallow inside one) through the layer's silhouette at its opacity, then the layer's pixels draw at their fill. The GPU compositor declines such a document ("Blend If or Knockout"), the CPU draws it; its GPU port rides H4's hardware run. The Layer Style dialog opens with Blending Options (Knockout, the Blend If channel, eight range sliders with the splits kept ordered), applied by `applyStyleAndLight` in the same step as the style. PSD: `toPsdBlending` and `fromPsdBlending` write and read Photoshop's composite grey and per-channel blending ranges and the 'knko' flag (a single flag in the format, so Shallow and Deep both write true and read back as Shallow). Verified in the browser from the flattened composite (white Background, a dark 50 left half, a red Top): Blend If underlying 100 to 160 hides Top over the dark half (50, 50, 50) and keeps it over white; 0 to 100 feathers to exactly half (125, 25, 25); deep Knockout with Fill 0 shows the Background through Top; a PSD round trip returns the Green-channel ranges exactly and the knockout as shallow; throttled (4x CPU, slow network) the dialog with its ten new rows: layout shift 0, no errors. Limits, in the register: one channel or gray per layer rather than Photoshop's three at once; sliders rather than Alt-drag handles. Removed lines taken after the version edit. Removed from frontend:

```text
import { type DocMode, BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type LayerLocks, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, type ParagraphStyle, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStroke, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
  applyStyleAndLight(id: ID, effects: LayerEffects | null, light: GlobalLight | null): void {
    this.edit('Layer Style', () => {
import { canvasBlend, compositeOp, instances, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform, effectsActive, type LayerEffects, type RGB, type Rect } from './types';
      if (!own && !folders.length && !base && !pixelBlend && (!styled || parts)) {
      const out: PsdLayer = { name: l.name, opacity: l.opacity, ...(l.fill !== undefined && l.fill !== 1 ? { fillOpacity: l.fill } : {}), ...(l.locks ? { protected: { transparency: !!(l.locks.all || l.locks.transparency), composite: !!(l.locks.all || l.locks.pixels), position: !!(l.locks.all || l.locks.position) } } : {}), hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, adjustment };
    const out: PsdLayer = { name: l.name, left: px.x, top: px.y, canvas: px.c, opacity: l.opacity, ...(l.fill !== undefined && l.fill !== 1 ? { fillOpacity: l.fill } : {}), ...(l.locks ? { protected: { transparency: !!(l.locks.all || l.locks.transparency), composite: !!(l.locks.all || l.locks.pixels), position: !!(l.locks.all || l.locks.position) } } : {}), hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId };
    if (id) { this.engine.applyStyleAndLight(id, fx, light); this.onApplied?.(fx ? structuredClone(fx) : null); }
export const VERSION = '1.54.4';
```

## Levels and Curves per ink, the composed CMYK display · _v1.54.4 (engine/adjust.ts, channels.ts, index.ts, kernels.ts; ui/panels/adjust-panel.ts; app.ts)

DEV_PLAN 22.4, first part. The Levels and Curves kernels take a fourth per-channel range (falling back to the first when a document has fewer); default adjustments carry five ranges. The Adjustments panel's channel selector holds all nine names built once (`ALL_CHANNELS`) and shows RGB, Red, Green, Blue or CMYK, Cyan, Magenta, Yellow, Black by mode (`channelsOf`, `showChannels`), indexing ranges by position within the mode's list; older adjustments gain a fifth range on sync. `composeChannels` applies Levels, Curves and any adjustment with a transfer per ink on paper-white values with the layer's opacity, so export, Info, thumbnails and the single-ink view include adjustment layers. The display of a CMYK document with a visible adjustment layer draws the composed ink through the display table as the bottom layer's source and hides the rest (`composedRendition`, cached against the document object, since a live update changes the doc without a history revision); a dangling `else` in that branch, first bound to the loop's inner `if`, was fixed before commit. `CMYK_OK` opens `new-adj-levels` and `new-adj-curves`. Verified in the browser: Levels on Black alone with input black 128 leaves C, M, Y at 0, 91, 76 and raises K from 18 to 36 (input white 128 lowers it to 0: Photoshop's convention, 0 on a CMYK channel is full ink); the screenshot at the stage reads (200, 51, 50) plain, (166, 45, 41) with that Levels, equal to the composed rendition and to the CPU render with the same overrides, (209, 209, 209) with Black solo, and (200, 51, 50) after undo. Known: the single-ink view shows layer ink without adjustment layers (22.5). Removed lines taken after the version edit. Removed from frontend:

```text
    'filter-gaussianBlur', 'filter-unsharpMask', 'filter-addNoise', 'image-size', 'canvas-size', 'flip-canvas-h', 'flip-canvas-v', 'trim', 'reveal-all',
    levels: { channel: 'RGB', ranges: [0, 1, 2, 3].map(() => ({ ...identityRange })) },
    curves: { channel: 'RGB', channels: [0, 1, 2, 3].map(() => [{ x: 0, y: 0 }, { x: 255, y: 255 }]) },
import { place } from './deep';
    if (l.adjustment) return { error: `${name} is an adjustment CMYK export does not compose yet.` };
import { rasterFromChannels, strokeChannels } from './channels';
    if (this.channelView !== null && p.doc.mode === 'cmyk') for (const l of p.doc.layers) if (l.channels && !m.get(l.id)?.source) m.set(l.id, { ...(m.get(l.id) ?? {}), source: this.channelGrey(l.channels, this.channelView).canvas });
  const channel = [levelsTransfer(ranges[1]), levelsTransfer(ranges[2]), levelsTransfer(ranges[3])];
  return tableKernel((c, level) => composite(channel[c](level)));
  const composite = curveAt(0), channel = [curveAt(1), curveAt(2), curveAt(3)];
  return tableKernel((c, level) => composite(channel[c](level)));
    const channel = selectRow('Channel', CHANNELS.map((c) => [c, c] as const), (v) => { ch = Math.max(0, CHANNELS.indexOf(v)); lv().channel = v; values(); this.drawHisto(ch); this.changed(); });
    return { node, sync: () => { ch = Math.max(0, CHANNELS.indexOf(lv().channel)); channel.set(CHANNELS[ch]); values(); this.drawHisto(ch); } };
    const channel = selectRow('Channel', CHANNELS.map((c) => [c, c] as const), (v) => { ch = Math.max(0, CHANNELS.indexOf(v)); cv().channel = v; draw(); this.changed(); });
    return { node, sync: () => { ch = Math.max(0, CHANNELS.indexOf(cv().channel)); channel.set(CHANNELS[ch]); draw(); } };
export const VERSION = '1.54.3';
```

## The one float pixel model, and the single-ink view · _v1.54.3 (engine/types.ts, deep.ts, channels.ts, index.ts; io/project-io.ts; ui/channels.ts, panels/filter-panel.ts; app.ts; frontend/src/engine/deep.test.ts and e2e/test_sixteen_bit.py follow the renamed field under the owner's 2a)

DEV_PLAN 22.3, the first release of "CMYK and Lab everywhere". `ChannelPixels { mode: 'rgb' | 'cmyk' | 'lab'; n: 3 | 4; width; height; data }`, alpha last, `n + 1` floats a pixel, is the one model for 16-bit, 32-bit, CMYK and, later, Lab; `DeepPixels` names its RGB kind; `Layer.deep` is gone and `Layer.channels` is the single field. Every `deep.ts` kernel is n-channel in place: `resampleDeep` (area average and bilinear over n), `blurDeep` (each channel rides with alpha through the four-wide box blur, in groups of three), `unsharpDeep`, `noiseDeep`; `deepFromU16`, `deepFromRaster`, `strokeDeep`, `deepToLinear`, `deepToned` return the model; `place` and `bilinear` were n-channel since 1.54.1. The engine's guard, stroke end, Image Size (the rendition by kind: through the CMYK table for ink), `setCmyk`, `setDepth`, `openDeep` and `applyDeepFilter` (n-channel, the selection blend over `n + 1`, the rendition by kind) read the one field; `.fmv` writes `.deep32`, `.deep16` or `.cmyk32` by kind and reads all three onto it. The filter panel's float path serves every layer with channels, so Gaussian Blur, Unsharp Mask and Add Noise run on ink, and at 32 bits Gaussian Blur now runs in linear light through `blurDeep`. `CMYK_OK` opens those three, Image Size, Canvas Size, both flips, Trim and Reveal All. The single-ink canvas view: `Engine.channelView`, `setChannelView`, `channelGrey` (a grey rendition of one ink per layer, paper white and full ink black, cached against its channels object), drawn through the display's override hook and never touching pixels; the Channels panel's ink solo sets the paint target and the view. Four stamped comments moved here: "A 32-bit layer is linear light, unbounded: its display is sRGB-encoded, white and above shown white (1.53.9)" (`rasterFromDeep`); "32 bits as floats (1.53.9)" and "16 bits kept (1.53.6)" (`project-io.ts` write); "Within a selection (1.53.8): blended by its coverage, where the layer sits unscaled and unrotated" (`applyDeepFilter`); "as the 8-bit path" (Image Size). Verified: unit 188 with `deep.test.ts` on the model; the 16-bit browser suite (three of its four; the EXR case is the sandbox's OpenCV without OpenEXR) and the mode walk; in the browser `blurDeep` on a CMYK layer equals the blur of each ink as a grey image to 0.00, alpha included, and Gaussian Blur through the menu lands as a step on the ink with the mode kept; with Black solo the scene canvas draws grey where the composite drew red and returns when cleared. A first landing of this entry used a script and was reverted before commit, as SEDO requires; this is the hand-made one. Removed lines taken after the version edit. Removed from frontend:

```text
                if (d.depth === 32) { engine.openDeep(name, { width: d.width, height: d.height, data: d.data as Float32Array }, 32); continue; }   // 32 bits (1.53.9)
        const blob = deep ? (p.doc.depth === 32 && kind === 'tiff' ? await api.encodeDeep(deep.data, deep.width, deep.height, 'tiff32') : await api.encodeDeep(deepToU16(p.doc.depth === 32 ? deepToned(deep, 0, 1).data : deep.data), deep.width, deep.height, kind as 'png' | 'tiff')) : kind === 'png' || kind === 'jpg' ? await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg', quality)
  return { mode: 'cmyk', width, height, data };
  return { channels: { mode: 'cmyk', width: W, height: ch.height, data: out }, region };
  return { width, height, data };
  return { width: r.width, height: r.height, data };
  // A 32-bit layer is linear light, unbounded: its display is sRGB-encoded, white and above shown white (1.53.9).
    const src = l.deep ?? deepFromRaster(l.raster);
  const out = new Float32Array(width * height * 4), sx = src.width / width, sy = src.height / height, px = [0, 0, 0, 0];
    const o = (y * width + x) * 4;
      let a = 0, area = 0; const c = [0, 0, 0];
        const wgt = (Math.min(xb, xx + 1) - Math.max(xa, xx)) * (Math.min(yb, yy + 1) - Math.max(ya, yy)), s = (yy * src.width + xx) * 4, al = src.data[s + 3] * wgt;
        area += wgt; a += al; for (let k = 0; k < 3; k++) c[k] += src.data[s + k] * al;
      out[o + 3] = area > 0 ? a / area : 0; for (let k = 0; k < 3; k++) out[o + k] = a > 0 ? c[k] / a : 0;
      bilinear(src.data, src.width, src.height, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5, px);
      out[o] = px[0]; out[o + 1] = px[1]; out[o + 2] = px[2]; out[o + 3] = px[3];
  return { width, height, data: out };
/** Gaussian Blur at 16 bits: the 8-bit filter's three box blurs (filters.ts), in premultiplied alpha, on floats. */
  const { width: w, height: h } = src, n = w * h * 4;
  if (!(sigma >= 0.1)) return { width: w, height: h, data: new Float32Array(src.data) };
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i += 4) { const al = src.data[i + 3]; a[i] = src.data[i] * al * 255; a[i + 1] = src.data[i + 1] * al * 255; a[i + 2] = src.data[i + 2] * al * 255; a[i + 3] = al * 255; }
  for (const width of threeBoxWidths(sigma)) { const r = (width - 1) / 2; boxBlur(a, b, w, h, r, true); boxBlur(b, a, w, h, r, false); }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 4) { const al = a[i + 3]; out[i + 3] = al / 255; for (let k = 0; k < 3; k++) out[i + k] = al > 0 ? a[i + k] / al : 0; }
  return { width: w, height: h, data: out };
/** Unsharp Mask at 16 bits: the 8-bit formula, with the threshold in the same levels. */
  const blur = blurDeep(src, Math.max(0.1, radius)), s = src.data, b = blur.data, o = new Float32Array(s.length), k = amount / 100;
  for (let i = 0; i < s.length; i += 4) {
    for (let c = 0; c < 3; c++) { const d = s[i + c] - b[i + c]; o[i + c] = Math.min(1, Math.max(0, Math.abs(d) * 255 >= threshold ? s[i + c] + k * d : s[i + c])); }
    o[i + 3] = s[i + 3];
  return { width: src.width, height: src.height, data: o };
/** Add Noise at 16 bits: the 8-bit filter's seeded noise (the same values for the same seed), not rounded. */
  const d = new Float32Array(src.data), spread = (amount / 100) * 127.5;
  for (let px = 0, i = 0; i < d.length; px++, i += 4) {
    if (d[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
  return { width: src.width, height: src.height, data: d };
  return { width: deep.width, height: deep.height, data: out };
  return { width: d.width, height: d.height, data: out };
  return { width: d.width, height: d.height, data: out };
    if (deepBefore && !nested && p.doc.layers.some((l) => { const o = deepBefore.get(l.id); return !!o && l.raster !== o.raster && ((!!o.deep && l.deep === o.deep) || (!!o.channels && l.channels === o.channels)); })) {
    if (patch && dl?.deep && dl.raster === patch.raster) {
      st.project.updateLayer(st.layerId, { deep: strokeDeep(dl.deep, patch.before, after, patch.x, patch.y, this.brushMode === 'erase' || this.tool === 'eraser' ? null : this.fg, this.bg) });
    } else if (patch && dl?.channels && dl.raster === patch.raster && st.project.cmykLut) {
        if (l.deep && raster && !shape) { const deep = resampleDeep(l.deep, raster.width, raster.height); return { ...l, deep, raster: rasterFromDeep(deep, p.doc.depth === 32), mask, shape, transform: t, ...(l.artboard ? { artboard: { ...l.artboard, x: Math.round(l.artboard.x * sx), y: Math.round(l.artboard.y * sy), w: Math.max(1, Math.round(l.artboard.w * sx)), h: Math.max(1, Math.round(l.artboard.h * sy)) } } : {}) }; }   // as the 8-bit path
      const layers = pp.doc.layers.map((l) => { const ch = ink.get(l.id); return ch ? { ...l, channels: ch, deep: undefined, raster: rasterFromChannels(ch, lut) } : l; });
        const src = l.deep ?? deepFromRaster(l.raster);
        if (depth === 32) return { ...l, deep: from === 32 ? src : deepToLinear(src) };
        return depth === 16 ? { ...l, deep: enc, raster: from === 32 ? rasterFromDeep(enc) : l.raster } : { ...l, deep: undefined, raster: from === 32 ? rasterFromDeep(enc) : l.raster };
    p.doc = { ...p.doc, depth, layers: p.doc.layers.map((l) => (l.raster && !l.isGroup ? { ...l, deep } : l)) };
    const p = this.current, l = p?.activeLayer;
    if (!p || !l?.deep) return false;
    let deep = fn(l.deep);
      // Within a selection (1.53.8): blended by its coverage, where the layer sits unscaled and unrotated.
      const t = l.transform, sel = p.selection;
      if (t.rotation || t.flipX || t.flipY || t.w !== l.deep.width || t.h !== l.deep.height || t.x !== Math.round(t.x) || t.y !== Math.round(t.y)) { this.notice(`${name} within a selection needs the layer unscaled and unrotated in 16 bits: Select > Deselect to filter the whole layer.`); return false; }
      const src = l.deep.data, f = deep.data, out = new Float32Array(src);
      for (let y = 0; y < l.deep.height; y++) for (let x = 0; x < l.deep.width; x++) {
        const o = (y * l.deep.width + x) * 4;
        for (let c = 0; c < 4; c++) out[o + c] = src[o + c] + (f[o + c] - src[o + c]) * cov;
      deep = { width: l.deep.width, height: l.deep.height, data: out };
    return this.edit(name, (pp) => { pp.doc = { ...pp.doc, layers: pp.doc.layers.map((x) => (x.id === l.id ? { ...x, deep, raster: rasterFromDeep(deep, pp.doc.depth === 32) } : x)) }; return true; });
  /** In a 16-bit document, the layer's 16-bit pixels (1.53.6); `raster` is their 8-bit rendition. */
  deep?: DeepPixels;
export interface DeepPixels { width: number; height: number; data: Float32Array }
/** A layer's ink in a CMYK document (1.54.0, H1): C, M, Y, K as floats 0 (paper) to 1 (full ink), then straight alpha,
 *  five a pixel; `raster` holds their sRGB rendition through the document's profile. */
export interface ChannelPixels { mode: 'cmyk'; width: number; height: number; data: Float32Array }
    if (l.deep && doc.depth === 32) { const name = `${l.id}.deep32`; files.push({ name, blob: new Blob([new Float32Array(l.deep.data).buffer as ArrayBuffer]) }); r.deepFile = name; r.deepWidth = l.deep.width; r.deepHeight = l.deep.height; }   // 32 bits as floats (1.53.9)
    else if (l.deep) { const name = `${l.id}.deep16`; files.push({ name, blob: new Blob([deepToU16(l.deep.data).buffer as ArrayBuffer]) }); r.deepFile = name; r.deepWidth = l.deep.width; r.deepHeight = l.deep.height; }   // 16 bits kept (1.53.6)
    if (l.channels) { const name = `${l.id}.cmyk32`; files.push({ name, blob: new Blob([new Float32Array(l.channels.data).buffer as ArrayBuffer]) }); r.inkFile = name; r.inkWidth = l.channels.width; r.inkHeight = l.channels.height; }
  records.forEach((r, i) => { const n = str(r.deepFile), u = n ? deeps.get(n) : undefined, w = num(r.deepWidth, 0), h = num(r.deepHeight, 0); if (u && layers[i] && u.length === w * h * 4) (layers[i] as { deep?: DeepPixels }).deep = u instanceof Float32Array ? { width: w, height: h, data: u } : deepFromU16(u, w, h); });
  if (mode === 'cmyk') records.forEach((r, i) => { const n = str(r.inkFile), u = n ? inks.get(n) : undefined, w = num(r.inkWidth, 0), h = num(r.inkHeight, 0); if (u && layers[i] && u.length === w * h * 5) (layers[i] as { channels?: ChannelPixels }).channels = { mode: 'cmyk', width: w, height: h, data: u }; });
    if (!cmyk && this.inkSolo) { this.inkSolo = null; this.engine.paintChannel = null; }
    setText(this.root.querySelector('.cv-ch-note') as HTMLElement, cmyk ? (this.inkSolo ? `The Brush, Pencil and Eraser write ${ROWS.find((r) => r.id === this.inkSolo)?.label} only; the view stays the composite.` : 'Click an ink to paint it alone; ⌘- or Ctrl-click loads its light areas as a selection.')
    if (this.engine.current?.doc.depth !== 16) return false;
export const VERSION = '1.54.2';
```

## Channels, painting, picker and Info in CMYK · _v1.54.2 (engine/channels.ts, colour-lut.ts, index.ts, project.ts; io/api.ts; ui/channels.ts, info.ts, panels/color-picker.ts; app.ts; backend app/services/colour.py, routers/colour.py)

DEV_PLAN 22.2. `Ink`, `Lut3x4`, `lut3x4From`, `inkOf` (sRGB to ink through a 33-point table, trilinear), `renditionOf` (one ink through the display table). `strokeChannels`: a Brush, Pencil or Eraser stroke rebuilt on a layer's ink from the 8-bit rendition it painted, as `strokeDeep` at 16 bits (the 1.53.8 comment at the stroke-end site said: "16 bits: the stroke rebuilt on the layer's 16-bit pixels, in this step, so Undo restores them too"; it is here now); with a solo channel only that ink changes and alpha stays; the region's rendition is redrawn from the ink and written into the raster and the history patch's `after`, so redo keeps ink and rendition in step. Engine: `fgInk`, `bgInk`, `paintChannel`, `setInk`; the `fg` and `bg` setters read ink through the project's `cmykIn`; `inMode` passes CMYK through; `deepPaintOk` paints in CMYK once both tables are present; `setCmyk` and `openChannels` take the ink table; `setCmykTables` for a project reopened from `.fmv` (the app's `ensureCmykTables`). `Project.cmykIn`. Channels panel: CMYK, Cyan, Magenta, Yellow and Black rows created once beside the RGB ones and hidden per mode; ink thumbnails from `composeChannels`; a click on an ink makes it the paint target (the note says the view stays the composite: the RGB solo view is a colour matrix over the rendition, which cannot recover an ink, so a single-ink view waits for the renderer, 22.3); Cmd- or Ctrl-click loads an ink's light areas. Info reads C, M, Y, K percent from the composed ink. The picker gains C, M, Y, K rows in CMYK: an RGB change re-reads the ink through the table, a typed ink is exact, OK hands the ink to the engine. Backend: `rgb_cmyk_lut` and `/color/rgb-cmyk-lut`. Verified: a K-only stroke leaves ink (0, 0, 0, 100) with the rendition at the profile's black (31, 31, 29), Info reads it, undo and redo restore ink and rendition; a red stroke through the table lands ink (1, 231, 193, 46) against LittleCMS's direct (1, 231, 194, 46); the eraser thins alpha in both; the mode walk passes; throttled (4x CPU, slow network) layout shift 0.00003 across the Channels tab, the mode change, row clicks and strokes, no errors. Removed lines taken after the version edit. Removed from frontend:

```text
import type { Lut4 } from './engine/colour-lut';
  const cmykLuts = new Map<string, Lut4>();
  async function cmykLutFor(profile: DocProfile): Promise<Lut4> {
    if (!lut) { lut = await api.cmykLut({ icc: profile.icc }); cmykLuts.set(key, lut); }
        engine.setCmyk(profile, ink, lut);
    engine.openChannels(name, channelsFromU8(file.ink, file.width, file.height), profile, await cmykLutFor(profile));
import { applyLut4, type Lut4 } from './colour-lut';
import { applyLut, type ColourLut, type Lut4 } from './colour-lut';
import { rasterFromChannels } from './channels';
  set fg(c: RGB) { this.fgc = this.inMode(c); }
  set bg(c: RGB) { this.bgc = this.inMode(c); }
    if (m === 'rgb') return { r: c.r, g: c.g, b: c.b };
    // 16 bits (1.53.8): the stroke rebuilt on the layer's 16-bit pixels, in this step, so Undo restores them too.
    const dl = patch && st.target === 'pixels' && st.project.doc.depth === 16 ? st.project.layer(st.layerId) : null;
  setCmyk(profile: DocProfile, ink: Map<ID, ChannelPixels>, lut: Lut4): boolean {
    p.cmykLut = lut;
  openChannels(name: string, ch: ChannelPixels, profile: DocProfile, lut: Lut4): Project {
    p.cmykLut = lut;
    if ((this.current?.doc.depth ?? 8) === 8) return true;
import type { Lut4 } from './colour-lut';
import { lutFrom, lut4From, type ColourLut, type Lut4 } from '../engine/colour-lut';
type Ch = 'rgb' | 'r' | 'g' | 'b';
const ROWS: ReadonlyArray<{ id: Ch; label: string }> = [{ id: 'rgb', label: 'RGB' }, { id: 'r', label: 'Red' }, { id: 'g', label: 'Green' }, { id: 'b', label: 'Blue' }];
        if (r.id === 'rgb') { this.solo = null; this.shown.r = this.shown.g = this.shown.b = true; } else { this.solo = r.id; }
    for (const ev of ['history', 'doc', 'active', 'projects'] as const) engine.on(ev, () => this.schedule());
    const src = this.engine.current ? this.engine.flattened() : null;
      if (id === 'rgb') continue;
    const m = this.solo
      : [this.shown.r ? 1 : 0, 0, 0, 0, 0, 0, this.shown.g ? 1 : 0, 0, 0, 0, 0, 0, this.shown.b ? 1 : 0, 0, 0, 0, 0, 0, 1, 0];
    const plain = !this.solo && this.shown.r && this.shown.g && this.shown.b;
      const id = row.dataset.ch as Ch;
    setText(this.root.querySelector('.cv-ch-note') as HTMLElement, native && !plain ? 'The Native GPU renderer draws outside the page: switch the renderer in Preferences to view single channels.' : '⌘- or Ctrl-click a channel to load it as a selection.');
      const v = id === 'rgb' ? 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] : d[i + (id === 'r' ? 0 : id === 'g' ? 1 : 2)];
    for (const ev of ['doc', 'history', 'active', 'projects', 'render'] as const) engine.on(ev, () => { this.pixels = null; this.soon(); });
      rows.push(['Colour', rgb(this.colorAt(this.pointer))]);
    for (const [i, s] of (m?.samplers ?? []).entries()) rows.push([`#${i + 1}`, rgb(this.colorAt(s))]);
import { el } from '../dom';
    side.append(this.swatch, this.red.el, this.green.el, this.blue.el, this.hex);
export const VERSION = '1.54.1';
```

## CMYK documents · _v1.54.1 (engine/channels.ts new, colour-lut.ts, deep.ts, index.ts, project.ts, types.ts; io/api.ts, project-io.ts; ui/app-dialogs.ts, colour.ts, tabs.ts; app.ts; backend app/services/colour.py, routers/colour.py, routers/io.py, app/profiles/ new)

The parity plan's H1, fifth part (DEV_PLAN Phase 22.1): `Doc.mode` gains `'cmyk'`; `ChannelPixels` (C, M, Y, K as ink 0 to 1, then straight alpha, five floats a pixel) on `Layer.channels`, the sRGB rendition staying in `raster`. `Lut4`, `lut4From`, `applyLut4` (a 17-a-side CMYK to sRGB table from the engine, quadrilinear). `channels.ts`: `channelsFromU8`, `channelsToU8`, `rasterFromChannels`, `rasterBytes`, `composeChannels` (Normal only, as `composeDeep`). `deep.ts`'s `place` and `bilinear` take a channel count (default 4, exported, so ink composes through the same placement). `Engine.setCmyk`, `setRgbFromCmyk`, `openChannels`; `Project.cmykLut` outside history. `Engine.edit()`'s guard, written for 16 bits at 1.53.6, now also undoes a step that changed a CMYK layer's rendition without its ink, so nothing drops a CMYK document to RGB silently; the guard's explanatory comment moved here. `convertMode` refuses CMYK either way (the engine converts). `api.cmykLut`, `convertPixels`, `defaultCmykProfile`, `decodeCmyk`, `encodeCmyk`. `.fmv`: `<id>.cmyk32` beside the rendition, `inkFile`, `inkWidth`, `inkHeight`; `mode: 'cmyk'` read. `ModeDialog`'s CMYK pane (profile, intent, black point; `onCmyk`). `ColourView` applies no view table in CMYK (the rendition is already through the profile; proofing waits). Tab reads `CMYK/8`. `app.ts`: `cmykLutFor`, `cmykProfileOf`, `toCmyk`, `cmykToRgb`, `openCmyk`, `exportCmyk`; CMYK JPEG and TIFF open as CMYK documents and export in ink with the profile embedded; `mode-cmyk`; `CMYK_OK` beside the depth gate; the New dialog's note corrected. Backend: `shipped_dir`, `default_cmyk`, `cmyk_lut`, `convert_pixels` (exact, 8 bits); routes `/color/cmyk-lut`, `/color/convert-pixels`, `/color/default-cmyk`, `/io/decode-cmyk`, `/io/encode-cmyk`; the shipped FOGRA39L profile (zlib licence, NOTICE.md). Verified: ink against LittleCMS applied directly, 0 levels apart; the rendition within 1 level of the direct transform; TIFF ink round trip exact, JPEG within 1; undo and redo; the way back to RGB; the mode walk and the 274-command walk in the browser; throttled (4x CPU, slow network) layout shift 0.00004 across the dialog, the conversion and the New dialog, no console errors. Removed lines taken after the version edit. Removed from frontend:

```text
    { id: 'mode-rgb', label: 'RGB Color', enabled: has, checked: () => (engine.current?.doc.mode ?? 'rgb') === 'rgb', run: () => { engine.convertMode('rgb'); } },
      { label: 'Mode', items: ['mode-bitmap', 'mode-grayscale', 'mode-indexed', 'mode-rgb', '-', 'depth-8', 'depth-16', 'depth-32'] }, '-',
  commands.gate = (c) => (engine.current?.doc.depth ?? 8) === 8 || ((DEEP_OK.has(c.id) || /^(zoom-|panel-|screen-|recent-|toggle-)/.test(c.id)) && !(engine.current?.doc.depth === 32 && NOT_AT_32.has(c.id)));
function place(out: Float32Array, W: number, H: number, src: DeepPixels, t: import('./types').Transform, op: number): void {
  const sw = src.width, sh = src.height, d = src.data, px = [0, 0, 0, 0];
    if (Math.abs(u - ru) < 1e-6 && Math.abs(v - rv) < 1e-6) { const s = (Math.min(sh - 1, Math.max(0, rv)) * sw + Math.min(sw - 1, Math.max(0, ru))) * 4; px[0] = d[s]; px[1] = d[s + 1]; px[2] = d[s + 2]; px[3] = d[s + 3]; }
    else bilinear(d, sw, sh, u, v, px);
    const sa = px[3] * op, o = (y * W + x) * 4, oa = out[o + 3], na = sa + oa * (1 - sa);
    for (let c = 0; c < 3; c++) out[o + c] = (px[c] * sa + out[o + c] * oa * (1 - sa)) / na;
    out[o + 3] = na;
function bilinear(d: Float32Array, w: number, h: number, u: number, v: number, px: number[]): void {
  let a = 0; const c = [0, 0, 0];
    const s = (yy * w + xx) * 4, al = d[s + 3] * wgt; a += al; for (let k = 0; k < 3; k++) c[k] += d[s + k] * al;
  px[3] = a; for (let k = 0; k < 3; k++) px[k] = a > 0 ? c[k] / a : 0;
import { applyLut, type ColourLut } from './colour-lut';
import type { DeepPixels, DocProfile } from './types';
    const deepBefore = (p.doc.depth ?? 8) > 8 ? new Map(p.doc.layers.map((l) => [l.id, l])) : null;
    // 16 bits kept (1.53.6, H1): a step that changed a 16-bit layer's pixels without its 16-bit data is undone, so
    // nothing drops a 16-bit document to 8 bits silently.
    if (deepBefore && !nested && p.doc.layers.some((l) => { const o = deepBefore.get(l.id); return !!o?.deep && l.raster !== o.raster && l.deep === o.deep; })) {
      this.notice(`${name} does not work in ${p.doc.depth} bits yet. Image > Mode > 8 Bits/Channel to use it.`);
    if (!p || (p.doc.mode ?? 'rgb') === mode) return false;
    const label = { rgb: 'RGB Color', grayscale: 'Grayscale', bitmap: 'Bitmap', indexed: 'Indexed Color' }[mode];
export type DocMode = 'rgb' | 'grayscale' | 'bitmap' | 'indexed';
import { lutFrom, type ColourLut } from '../engine/colour-lut';
  async colourProfiles(): Promise<{ profiles: Array<{ id: string; name: string; space: string; file: string; added: boolean }>; folder: string }> {
    return (await (await request('/color/profiles')).json()) as { profiles: Array<{ id: string; name: string; space: string; file: string; added: boolean }>; folder: string };
import type { DeepPixels } from '../engine/types';
  const mode = manifest.mode === 'grayscale' || manifest.mode === 'bitmap' || manifest.mode === 'indexed' ? manifest.mode : null;
    const modeNote = el('<p class="cv-nd-note">16 and 32 bit, CMYK and Lab are not available yet: they need a new pixel engine.</p>');
  private kind: 'bitmap' | 'indexed' = 'bitmap';
  show(kind: 'bitmap' | 'indexed'): void {
    this.setTitle(kind === 'bitmap' ? 'Bitmap' : 'Indexed Color');
    const p = this.engine.current, prof = p?.doc.profile, s = this.setup, proofing = this.proof && !!s;
    setText(mEl, { rgb: 'RGB/8', grayscale: 'Gray/8', bitmap: 'Bitmap/1', indexed: 'Index' }[md]);
    const tip = { rgb: 'RGB, 8 bits a channel', grayscale: 'Grayscale, 8 bits', bitmap: 'Bitmap, 1 bit', indexed: `Indexed Color, ${p.doc.palette?.length ?? 0} colours` }[md];
export const VERSION = '1.53.9';
```

## 32-bit documents · _v1.53.9 (engine/deep.ts, index.ts, types.ts; io/project-io.ts, api.ts, images.ts; ui/panels/hdr-toning.ts new; app.ts; backend app/__init__.py, routers/io.py)

`srgbToLinear`, `linearToSrgb`, `deepToLinear`, `deepToned`; `rasterFromDeep`'s linear display; `composeDeep`'s Exposure in linear light at 32 bits; `Engine.setDepth` to and from 32 with HDR Toning, `openDeep` at 32, the guard at 16 and 32, painting refused at 32; the project's `.deep32` floats; `api.decodeDeep` and `encodeDeep` with floats; `.hdr` and `.exr` accepted; `HdrToningDialog`; `exportWide`, `toDepth`, `NOT_AT_32`; the engine's float decode and HDR, EXR and 32-bit TIFF encode, and OpenEXR turned on. Removed lines taken after the version edit. Removed from frontend:

```text
import { composeDeep, deepFromU16, deepToU16 } from './engine/deep';
          if (/\.(png|tiff?)$/i.test(f.name) && !engine.current && decoded.length === 0) {
            if (png16 || /\.tiff?$/i.test(f.name)) {
              try { const d = await api.decodeDeep(f, f.name); if (d.depth === 16) { engine.openDeep(f.name.replace(/\.[^.]+$/, ''), deepFromU16(d.data, d.width, d.height)); continue; } } catch { /* opened at 8 bits as before */ }
        const deep = p.doc.depth === 16 && (kind === 'png' || kind === 'tiff') ? composeDeep(p.doc) : null;
        const blob = deep ? await api.encodeDeep(deepToU16(deep.data), deep.width, deep.height, kind as 'png' | 'tiff') : kind === 'png' || kind === 'jpg' ? await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg', quality)
    { id: 'depth-8', label: '8 Bits/Channel', enabled: has, checked: () => (engine.current?.doc.depth ?? 8) === 8, run: () => { engine.setDepth(8); } },
    { id: 'depth-16', label: '16 Bits/Channel', enabled: () => has() && (engine.current?.doc.mode ?? 'rgb') === 'rgb', checked: () => engine.current?.doc.depth === 16, run: () => { engine.setDepth(16); } },
      { label: 'Export', items: ['export-as', '-', 'export-png', 'export-jpg', 'export-webp', 'export-avif', 'export-tiff', 'export-pdf', 'export-gif', '-', 'export-psd', 'export-psb', 'export-ora', 'assemble-tiles', '-', 'export-artboards'] },
      { label: 'Mode', items: ['mode-bitmap', 'mode-grayscale', 'mode-indexed', 'mode-rgb', '-', 'depth-8', 'depth-16'] }, '-',
  commands.gate = (c) => engine.current?.doc.depth !== 16 || DEEP_OK.has(c.id) || /^(zoom-|panel-|screen-|recent-|toggle-)/.test(c.id);
import { blurDeep, composeDeep, deepFromU16, noiseDeep, resampleDeep, strokeDeep, transferOf, unsharpDeep } from './deep';
export function rasterFromDeep(deep: DeepPixels): Raster {
  for (let i = 0; i < deep.data.length; i++) img.data[i] = Math.round(Math.min(1, Math.max(0, deep.data[i])) * 255);
import { deepFromRaster, rasterFromDeep, resampleDeep, strokeDeep } from './deep';
    const deepBefore = p.doc.depth === 16 ? new Map(p.doc.layers.map((l) => [l.id, l])) : null;
      this.notice(`${name} does not work in 16 bits yet. Image > Mode > 8 Bits/Channel to use it.`);
        if (l.deep && raster && !shape) { const deep = resampleDeep(l.deep, raster.width, raster.height); return { ...l, deep, raster: rasterFromDeep(deep), mask, shape, transform: t, ...(l.artboard ? { artboard: { ...l.artboard, x: Math.round(l.artboard.x * sx), y: Math.round(l.artboard.y * sy), w: Math.max(1, Math.round(l.artboard.w * sx)), h: Math.max(1, Math.round(l.artboard.h * sy)) } } : {}) }; }   // as the 8-bit path
  setDepth(depth: 8 | 16): boolean {
    const p = this.current;
    if (!p || (p.doc.depth ?? 8) === depth) return false;
    return this.edit(depth === 16 ? '16 Bits/Channel' : '8 Bits/Channel', (pp) => {
      const layers = pp.doc.layers.map((l) => (depth === 16 ? (l.raster && !l.isGroup && !l.adjustment ? { ...l, deep: deepFromRaster(l.raster) } : l) : l.deep ? { ...l, deep: undefined } : l));
      pp.doc = { ...pp.doc, layers, depth: depth === 16 ? 16 : undefined };
  openDeep(name: string, deep: DeepPixels): Project {
    const raster = rasterFromDeep(deep);
    p.doc = { ...p.doc, depth: 16, layers: p.doc.layers.map((l) => (l.raster && !l.isGroup ? { ...l, deep } : l)) };
    return this.edit(name, (pp) => { pp.doc = { ...pp.doc, layers: pp.doc.layers.map((x) => (x.id === l.id ? { ...x, deep, raster: rasterFromDeep(deep) } : x)) }; return true; });
    if (this.current?.doc.depth !== 16) return true;
    if (this.current?.doc.depth !== 16) return false;
    this.notice(`${what} does not work in 16 bits yet. Image > Mode > 8 Bits/Channel to use it.`);
export interface Doc { depth?: 8 | 16; profile?: DocProfile; mode?: DocMode; palette?: readonly RGB[]; readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; notes?: readonly DocNote[]; counts?: readonly { x: number; y: number }[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[] }
  async decodeDeep(file: Blob, name: string): Promise<{ width: number; height: number; depth: number; data: Uint16Array }> {
    return { width: Number(r.headers.get('X-Width')), height: Number(r.headers.get('X-Height')), depth: Number(r.headers.get('X-Depth')), data: new Uint16Array(await r.arrayBuffer()) };
  async encodeDeep(data: Uint16Array, width: number, height: number, format: 'png' | 'tiff'): Promise<Blob> {
    return (await request('/io/encode-deep', { method: 'POST', body: form({ width: String(width), height: String(height), format }, [{ name: 'pixels.raw', blob: new Blob([new Uint16Array(data)]) }], 'file') })).blob();
export const IMAGE_ACCEPT = `.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,${RAW_ACCEPT},image/*`;
export const isImageFile = (f: File): boolean => f.type.startsWith('image/') || NATIVE.test(f.name) || SERVER.test(f.name) || RAW_FILE.test(f.name);
    if (l.deep) { const name = `${l.id}.deep16`; files.push({ name, blob: new Blob([deepToU16(l.deep.data).buffer as ArrayBuffer]) }); r.deepFile = name; r.deepWidth = l.deep.width; r.deepHeight = l.deep.height; }   // 16 bits kept (1.53.6)
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, ...(doc.depth === 16 ? { depth: 16 } : {}), colorSpace: doc.profile?.name ?? 'sRGB', ...(doc.profile ? { profile: { name: doc.profile.name, icc: doc.profile.icc } } : {}), resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.mode && doc.mode !== 'rgb' ? { mode: doc.mode } : {}), ...(doc.palette?.length ? { palette: doc.palette.map((c) => [c.r, c.g, c.b]) } : {}),
  const deeps = new Map<string, Uint16Array>();   // 16-bit pixels (1.53.6)
  await Promise.all(records.map(async (r) => { const n = str(r.deepFile); if (n) deeps.set(n, new Uint16Array(await (await fetchImage(n)).arrayBuffer())); }));
  records.forEach((r, i) => { const n = str(r.deepFile), u = n ? deeps.get(n) : undefined, w = num(r.deepWidth, 0), h = num(r.deepHeight, 0); if (u && layers[i] && u.length === w * h * 4) (layers[i] as { deep?: DeepPixels }).deep = deepFromU16(u, w, h); });
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { ...profileFrom(manifest.profile), ...(manifest.depth === 16 ? { depth: 16 as const } : {}), id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(notes.length ? { notes } : {}), ...(counts.length ? { counts } : {}), ...(mode ? { mode } : {}), ...(mode === 'indexed' && palette.length ? { palette } : {}), ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}), ...(styles.length ? { paragraphStyles: styles } : {}) }, activeId: str(manifest.activeLayerID) };
export const VERSION = '1.53.8';
```

Removed from backend:

```text
__version__ = "1.53.8"
    if format not in ("png", "tiff"):
        raise HTTPException(status_code=422, detail="16-bit export is PNG or TIFF.")
    if width <= 0 or height <= 0 or len(raw) != width * height * 8:
    img = np.frombuffer(raw, "<u2").reshape(height, width, 4)
    ok, out = cv2.imencode(".png" if format == "png" else ".tif", cv2.cvtColor(img, cv2.COLOR_RGBA2BGRA))
    return Response(out.tobytes(), media_type="image/png" if format == "png" else "image/tiff")
version = "1.53.8"
version = "1.53.8"
 "version": "1.53.8",
```

Nothing removed from src-tauri.

## 16-bit painting and selections · _v1.53.8 (engine/deep.ts, index.ts)

`strokeDeep`; the rebuild in `endStroke` before the stroke's step closes; `deepPaintOk` at the start of `beginStroke` (Brush, Pencil and Eraser without colour dynamics); `applyDeepFilter` blending by the selection's coverage. Removed lines taken after the version edit. Removed from frontend:

```text
import { blurDeep, composeDeep, deepFromU16, noiseDeep, resampleDeep, transferOf, unsharpDeep } from './deep';
import { deepFromRaster, rasterFromDeep, resampleDeep } from './deep';
    if (this.deepBlocked('Painting')) return false;   // 1.53.6
    if (p.selection) { this.notice(`${name} within a selection does not work in 16 bits yet: Select > Deselect to filter the whole layer.`); return false; }
    const deep = fn(l.deep);
export const VERSION = '1.53.7';
```

Removed from backend:

```text
__version__ = "1.53.7"
version = "1.53.7"
version = "1.53.7"
 "version": "1.53.7",
```

Nothing removed from src-tauri.

## 16-bit geometry and filters · _v1.53.7 (engine/deep.ts, filters.ts, index.ts; ui/panels/filter-panel.ts; app.ts)

`composeDeep` places each layer with `placement` inverted (`place`, `bilinear`); `resampleDeep`, `blurDeep`, `unsharpDeep`, `noiseDeep`; `threeBoxWidths`, `boxBlur`, `mix32` and `toUnit` exported; `resampleImage` resamples a layer's 16 bits; `Engine.applyDeepFilter`; `FilterPanel.deepFilter`, at the start of `applyInBackground`; the allow-list's geometry and three filters. Removed lines taken after the version edit. Removed from frontend:

```text
    'new-adj-levels', 'new-adj-curves', 'new-adj-exposure', 'edit-adjustment', 'delete-layer', 'rename', 'forward', 'backward', 'select-all', 'deselect', 'inverse', 'depth-8', 'depth-16', 'assign-profile', 'proof-setup', 'proof-colors', 'gamut-warning',
import { composeDeep, deepFromU16, transferOf } from './deep';
    const tf = l.transform;
    if (tf.rotation || tf.flipX || tf.flipY || tf.w !== l.raster.width || tf.h !== l.raster.height) return { error: `${name} is scaled, rotated or flipped, which 16-bit export does not compose yet.` };
    const src = l.deep ?? deepFromRaster(l.raster), ox = Math.round(tf.x), oy = Math.round(tf.y);
    for (let y = Math.max(0, oy); y < Math.min(H, oy + src.height); y++) for (let x = Math.max(0, ox); x < Math.min(W, ox + src.width); x++) {
      const s = ((y - oy) * src.width + (x - ox)) * 4, o = (y * W + x) * 4, sa = src.data[s + 3] * op, oa = out[o + 3], na = sa + oa * (1 - sa);
      if (na <= 0) continue;
      for (let c = 0; c < 3; c++) out[o + c] = (src.data[s + c] * sa + out[o + c] * oa * (1 - sa)) / na;
      out[o + 3] = na;
    }
function threeBoxWidths(sigma: number): number[] {
function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, across: boolean): void {
function mix32(z: number): number {
const toUnit = (bits: number): number => (bits + 0.5) / 4294967296;
import { deepFromRaster, rasterFromDeep } from './deep';
  private applyInBackground(kind: FilterKind, settings: Record<string, unknown>): Promise<boolean> {
export const VERSION = '1.53.6';
```

Removed from backend:

```text
__version__ = "1.53.6"
version = "1.53.6"
version = "1.53.6"
 "version": "1.53.6",
```

Nothing removed from src-tauri.

## 16-bit documents · _v1.53.6 (engine/deep.ts new; engine/index.ts, types.ts, kernels.ts; io/project-io.ts, api.ts; ui/commands.ts; app.ts; backend routers/io.py)

`DeepPixels`, `Doc.depth`, `Layer.deep`; `deepFromU16`, `deepToU16`, `deepFromRaster`, `rasterFromDeep`, `transferOf`, `composeDeep`; each table kernel keeps its `transfer`; `Engine.setDepth`, `openDeep`, `deepBlocked`, and the 16-bit guard in `edit`; `Commands.gate` and the 16-bit allow-list; the project's `deepFile` and `depth`; `api.decodeDeep`, `encodeDeep`; the engine's `/io/decode-deep` and `/io/encode-deep`. Removed lines taken after the version edit. Removed from frontend:

```text
        const blob = kind === 'png' || kind === 'jpg' ? await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg', quality)
      { label: 'Mode', items: ['mode-bitmap', 'mode-grayscale', 'mode-indexed', 'mode-rgb'] }, '-',
import type { DocProfile } from './types';
  return (px) => {
export interface Doc { profile?: DocProfile; mode?: DocMode; palette?: readonly RGB[]; readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; notes?: readonly DocNote[]; counts?: readonly { x: number; y: number }[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[] }
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: doc.profile?.name ?? 'sRGB', ...(doc.profile ? { profile: { name: doc.profile.name, icc: doc.profile.icc } } : {}), resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.mode && doc.mode !== 'rgb' ? { mode: doc.mode } : {}), ...(doc.palette?.length ? { palette: doc.palette.map((c) => [c.r, c.g, c.b]) } : {}),
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { ...profileFrom(manifest.profile), id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(notes.length ? { notes } : {}), ...(counts.length ? { counts } : {}), ...(mode ? { mode } : {}), ...(mode === 'indexed' && palette.length ? { palette } : {}), ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}), ...(styles.length ? { paragraphStyles: styles } : {}) }, activeId: str(manifest.activeLayerID) };
  enabled(cmd: Command): boolean { return cmd.enabled ? cmd.enabled() : true; }
export const VERSION = '1.53.5';
```

Removed from backend:

```text
__version__ = "1.53.5"
version = "1.53.5"
version = "1.53.5"
 "version": "1.53.5",
```

Nothing removed from src-tauri.

## Colour management · _v1.53.5 (engine/colour-lut.ts, io/icc-read.ts, ui/colour.ts, ui/panels/colour-dialogs.ts new; engine/index.ts, types.ts; io/project-io.ts, images.ts, api.ts; ui/stage.ts, prefs.ts, app-dialogs.ts; app.ts; backend services/colour.py and routers/colour.py new)

`ColourLut`, `applyLut`, `lutFrom`, `lutOf`; `embeddedProfile`, `profileName`, `isSrgbName`, `toBase64`, `fromBase64`; `DocProfile` and `Doc.profile`, saved in the manifest and read by `profileFrom`; `Engine.viewTransform`, `setViewTransform`, `assignProfile`, `convertToProfile`, and an imported image's profile in `openImage` and `insertImages`; `Stage.applyView` and the GPU stepping aside while a view transform is on; `ColourView`; `AssignProfileDialog`, `ConvertProfileDialog`, `ProofSetupDialog`, `ProfileMismatchDialog`; `decodeImage`'s raw decode; `Prefs.profileMismatch`; the engine's `colour.profiles`, `add`, `describe`, `lut` and its gamut marks. Removed lines taken after the version edit. Removed from frontend:

```text
        const space = s.profile ?? 'srgb', icc = iccProfile(space);
      'fill-path-dialog', 'stroke-path-dialog', '-', { label: 'Transform', items: ['transform', 'transform-warp'] }, 'puppet-warp', '-', 'define-pattern', '-', 'shortcuts', 'settings'] },
    { label: 'View', items: ['zoom-in', 'zoom-out', 'fit', 'actual', '-', 'toggle-rulers', 'toggle-grid', 'pixel-grid', 'transform-controls', '-',
export interface ImportedImage { source: CanvasImageSource; width: number; height: number; name: string }
      this.addProject({ id: uid(), width: f.width, height: f.height, resolution: 72, layers: [] }, stripExt(f.name));
    return this.addProject({ ...base, layers: [layer] }, img.name.replace(/\.[^.]+$/, '') || 'Image', layer.id);
export interface Doc { mode?: DocMode; palette?: readonly RGB[]; readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; notes?: readonly DocNote[]; counts?: readonly { x: number; y: number }[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[] }
async function bitmapOf(blob: Blob): Promise<ImportedImage['source'] & { width: number; height: number }> {
export async function decodeImage(file: Blob, name: string): Promise<ImportedImage> {
  try { source = await bitmapOf(server ? await api.decode(file, name) : file); } catch (err) {
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.mode && doc.mode !== 'rgb' ? { mode: doc.mode } : {}), ...(doc.palette?.length ? { palette: doc.palette.map((c) => [c.r, c.g, c.b]) } : {}),
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(notes.length ? { notes } : {}), ...(counts.length ? { counts } : {}), ...(mode ? { mode } : {}), ...(mode === 'indexed' && palette.length ? { palette } : {}), ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}), ...(styles.length ? { paragraphStyles: styles } : {}) }, activeId: str(manifest.activeLayerID) };
    add('File Handling', restore, el('<p class="cv-note">Every open document is kept on this device, in its tab order, and opens again at the next start, saved or not. Off, only unsaved work is kept, and formvis asks after a crash.</p>'), this.recoveryRow.el, el('<p class="cv-note">Unsaved documents are kept on this device so they can be recovered after a crash; this is how soon after a change that happens.</p>'));
export interface Prefs { shortcuts: Record<string, string[]>; restoreSession: boolean; agentsAllowed: boolean; comfyuiUrl: string; nodemodeUrl: string; historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
export const DEFAULT_PREFS: Prefs = { shortcuts: {}, restoreSession: true, agentsAllowed: false, comfyuiUrl: 'http://127.0.0.1:8188', nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
      const reason = documentFallback(gl, W, H, { maxTexture: this.gpu.maxTexture, memoryBytes: this.gpuLimit }) ?? ('layers' in gl ? this.gpu.unsupported?.(gl.layers) ?? null : null);
export const VERSION = '1.53.4';
```

Removed from backend:

```text
__version__ = "1.53.4"
from app.routers import comfyui, generative, io, large, llm, mcp, ops, plugins, projects, system, nodemode
version = "1.53.4"
version = "1.53.4"
 "version": "1.53.4",
```

Nothing removed from src-tauri.

## Parity sprint 1 · _v1.53.4 (engine/scopes.ts; ui/panels/scopes-view.ts, tiff-pages.ts; ui/commands.ts, app-dialogs.ts, prefs.ts, controls.ts; engine/types.ts, index.ts messages; backend services segment, background, imaging, localgen sessions, paths, model_manager; core/config.py)

`ScopesView` and `histogram`, `waveform`, `vectorscope`; `TiffPagesDialog` and the engine's `pages` and paged `decode_to_png`; `Commands.setKeys`, `forCombo`, `defaultKeys`, `overrides`, `resetKeys` and the Keyboard Shortcuts editor; `setPixelBudget`, `pixel_budget`, `total_memory`, and the budget in every message; SAM 2.1 and U²-Net on ONNX Runtime; `sessions` (two held, idle release) and `paths.session` (arena off); SD-Turbo removed and unpinned downloads refused. The engine split (M8) was held back, as it broke a reload after WebGL2. Removed lines taken after the version edit. Removed from frontend:

```text
    { id: 'shortcuts', label: 'Keyboard Shortcuts', keys: ['Shift+/'], run: () => dialogs.shortcuts.show() },
      'fill-path-dialog', 'stroke-path-dialog', '-', { label: 'Transform', items: ['transform', 'transform-warp'] }, 'puppet-warp', '-', 'define-pattern', '-', 'settings'] },
          return e.resampleImage(w, h, 'high', p.doc.resolution ?? 72) ? text(`Resized to ${w} by ${h}.`) : fail('The size is outside what formvis allows (30,000 pixels a side, 100 megapixels).');
      this.notice('Canvas sides must be 1 to 30,000 px, and the canvas at most 100 megapixels.', 'error');
   *  the 100-megapixel budget for the target. */
    if (pixels(dst.doc.layers) + pixels(copied) > 100_000_000) { this.notice("The copied layers exceed this project's 100-megapixel limit."); return false; }
          this.notice(`${img.name} was skipped: it would exceed the 30,000 px side or the 100-megapixel document limit.`, 'error');
    if (!ok) this.notice('Canvas sides must be 1 to 30,000 px, and the canvas at most 100 megapixels.', 'error');
      if (b.w * b.h > LIMITS.pixels) { this.notice('That perspective would stretch a layer past the 100-megapixel limit. Pull the corners in a little.', 'error'); return false; }
    if (used * sx0 * sy0 > LIMITS.pixels) { this.notice('The resized layers would exceed the 100-megapixel document limit.', 'error'); return false; }
    if (W > LIMITS.side || H > LIMITS.side || W * H > LIMITS.pixels) { this.notice(`Upscaled ${scale} times, this image would pass 30,000 px a side or 100 megapixels.`, 'error'); return false; }
export const LIMITS = { side: 30000, pixels: 100_000_000, layers: 10000, depth: 64 } as const;
export interface Capabilities {
  async decode(file: Blob, name: string): Promise<Blob> {
    return (await request('/io/decode', { method: 'POST', body: form({}, [{ name, blob: file }], 'file') })).blob();
    throw new Error(`${name} exceeds the 30,000 px side or 100-megapixel limit.`);
import type { Commands } from './commands';
    add('Performance', this.redrawRow.el,
  private readonly list = el('<div class="cv-list" aria-label="Keyboard shortcuts"></div>');
    super('Keyboard Shortcuts', 520);
    this.body.appendChild(this.list);
  }
  show(): void {
    const rows: Array<{ key: string; label: string; keys: string }> = [];
    for (const c of this.commands.all()) if (c.keys?.length) rows.push({ key: c.id, label: this.commands.label(c), keys: this.commands.keyLabel(c) });
    for (const [label, keys] of TOOL_KEYS) rows.push({ key: `tool:${label}`, label, keys });
    patchList(this.list, rows, {
      key: (r) => r.key,
      create: (r) => {
        const n = el('<div class="cv-list-row"><span></span><span class="cv-list-name"></span><span class="cv-list-meta"></span></div>');
        setText(q(n, '.cv-list-name'), r.label);
        setText(q(n, '.cv-list-meta'), r.keys);
        return n;
      },
      update: (n, r) => { setText(q(n, '.cv-list-name'), r.label); setText(q(n, '.cv-list-meta'), r.keys); },
    this.open();
      if (this.preview) this.engine.previewImageEdit((src, scale) => runFilterOffThread(this.kind, this.s, scale, this.seed, src) ?? this.run(src, scale), this.grow());
    setText(this.info, `${pic.picture} is ${pic.width.toLocaleString()} by ${pic.height.toLocaleString()} pixels, larger than formvis edits in one piece (30,000 a side, 100 megapixels). The engine decodes it once to open it, which needs about ${gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`} of memory.`);
export interface Prefs { restoreSession: boolean; agentsAllowed: boolean; comfyuiUrl: string; nodemodeUrl: string; historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
export const DEFAULT_PREFS: Prefs = { restoreSession: true, agentsAllowed: false, comfyuiUrl: 'http://127.0.0.1:8188', nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
export const VERSION = '1.53.3';
```

Removed from backend:

```text
__version__ = "1.53.3"
MAX_PIXELS = 100_000_000
    global _session
    with _lock:
        if _session is None:
            import onnxruntime as ort
            from .paths import providers
            _session = ort.InferenceSession(str(MODELS_ROOT / FILE), providers=providers())
        return _session.run(None, {"input": batch})[0]
from .paths import providers
    global _session
        if _session is None:
            import onnxruntime as ort
            _session = ort.InferenceSession(str(model_manager.model_file(FILE)), providers=providers())
        return _session.run(None, {"image": image, "mask": mask})[0]
    "local-image": {
        # A model the local generator can run out of the box, downloaded on
        # request and never on boot: SD Turbo's ONNX export, 2.4 GB, one step
        # a picture. Its licence is Stability's non-commercial research
        # licence and the panel shows it before the download starts; a person
        # who needs commercial terms declares another model in the slot
        # registry instead. The files land in the diffusers layout the local
        # diffusion runner reads (models/diffusion/sd-turbo).
        "name": "SD Turbo (local image generation)",
        "license": "Stability AI Non-Commercial Research Community License (non-commercial)",
        "files": {
            "diffusion/sd-turbo/LICENSE": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/LICENSE",
            "diffusion/sd-turbo/model_index.json": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/model_index.json",
            "diffusion/sd-turbo/scheduler/scheduler_config.json": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/scheduler/scheduler_config.json",
            "diffusion/sd-turbo/tokenizer/merges.txt": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/tokenizer/merges.txt",
            "diffusion/sd-turbo/tokenizer/special_tokens_map.json": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/tokenizer/special_tokens_map.json",
            "diffusion/sd-turbo/tokenizer/tokenizer_config.json": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/tokenizer/tokenizer_config.json",
            "diffusion/sd-turbo/tokenizer/vocab.json": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/tokenizer/vocab.json",
            "diffusion/sd-turbo/unet/config.json": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/unet/config.json",
            "diffusion/sd-turbo/vae_decoder/config.json": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/vae_decoder/config.json",
            "diffusion/sd-turbo/text_encoder/model.onnx": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/text_encoder/model.onnx",
            "diffusion/sd-turbo/unet/model.onnx": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/unet/model.onnx",
            "diffusion/sd-turbo/vae_decoder/model.onnx": "https://huggingface.co/onnxruntime/sd-turbo/resolve/main/vae_decoder/model.onnx",
        },
    },
                if expected and digest.hexdigest() != expected:
def decode(file: UploadFile = File(...)) -> Response:
        png, width, height = imaging.decode_to_png(data, file.filename or "")
    ml = _has("rembg") and _has("onnxruntime")
        raise Unavailable("This background engine is not installed. Run ./formvis install-ml for the ML engine; the lightweight engine ships with the base install.")
        raise BackgroundError("The image exceeds the 100-megapixel limit.")
        raise DecodeError("The image exceeds the 30,000 px side or 100-megapixel limit.")
def decode_to_png(data: bytes, filename: str) -> tuple[bytes, int, int]:
def available() -> bool:
        raise SegmentError("Click-to-select needs the engine's AI extras (./formvis install-ml).")
    import torch
        pred = _get_predictor()
        with torch.inference_mode():
            pred.set_image(rgb)
        _embeddings[key] = {"features": pred._features, "orig_hw": pred._orig_hw, "size": (rgb.shape[1], rgb.shape[0])}
    import torch
version = "1.53.3"
version = "1.53.3"
 "version": "1.53.3",
```

Nothing removed from src-tauri.
## Editing by asking, from Claude Code, Codex and Cursor · _v1.53.3 (backend/app/routers/mcp.py; setup/mcp_stdio.py; setup/agents.py new; frontend/src/automation/agent-bridge.ts, app.ts, engine/index.ts; .claude/skills/formvis-editing and .agents/skills/formvis-editing new; .mcp.json, .cursor/mcp.json, .codex/config.toml, AGENTS.md new; CLAUDE.md; docs/AGENT_EVALS.md new; docs/MANUAL.md, docs/LOCAL.md)

The engine: `_live`, `_open_window`, `_ask`, the consent question (`__consent__`) and the declined window, the wait for a window that was just here; `_run` with `_path` for `open_file`, `save_project` and `export_image`; 39 tools; `INSTRUCTIONS`, `STRATEGY`, `PROMPTS`, `prompts/list` and `prompts/get`; `bridge_next` taking `allowed` and handing out only the question when not; `bridge_stop` as a declination. `start_engine` in the stdio bridge. The window: the bridge polling always and answering the question, `AgentDeps.allow`, `openFile`, `projectBlob`, `applyFilter`, `selectSubject`, `removeBackground`, and the new tool cases with local-first generative choice. `rasterizeLayer` and Rasterize Layer taking live shapes. Removed lines taken after the version edit. Removed from frontend:

```text
  const agents = new AgentBridge(engine, { ask: (title, text) => agentConfirm.ask(title, text), note: () => {} });
    { id: 'rasterize', label: 'Rasterize Layer', enabled: () => { const l = engine.current?.activeLayer; return !!l && (!!l.smart || !!l.vector || liveText(l)); }, run: () => engine.rasterizeLayer() },
export interface AgentDeps { ask(title: string, text: string): Promise<boolean>; note(text: string): void }
    if (on && !this.looping) void this.loop();
    while (this.on) {
        const res = await fetch('/api/mcp/bridge/next');
      if (!p) return fail('No document is open: call new_document first.');
          e.applySelection(SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), mode, 'Rectangular Marquee');
        case 'generative_fill': case 'generate_image': {
          const prompt = str('prompt').trim();
          if (name === 'generative_fill' && !p.selection) return fail('Generative Fill needs a selection: call select first.');
          const st = await api.generativeStatus();
          if (!st?.configured) return fail('formvis has no fal key set, so it cannot generate. The user can add one in Edit > Generative Fill.');
          const what = name === 'generative_fill' ? 'Generative Fill' : 'Generate Image';
          if (!await this.deps.ask(`An agent asks to run ${what}`, `Prompt: "${prompt}". This runs on fal and costs money.`)) return fail(`The user declined ${what}.`);
          if (name === 'generative_fill') await e.task(() => e.generativeFill(prompt, (image, mask) => api.generativeFill(image, mask, prompt)));
          else {
            const bmp = await createImageBitmap(await api.generateImage(prompt, p.doc.width, p.doc.height)), r = new Raster(p.doc.width, p.doc.height);
            r.ctx.drawImage(bmp, 0, 0, p.doc.width, p.doc.height); bmp.close(); r.touch();
            e.insertRasterLayer(r, 'Generated Image', 0, 0, {}, 'Generate Image');
          return text(`${what} done; the result is a new layer (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id });
      if (!l || (!l.smart && !l.text && !l.vector)) return false;
      p.updateLayer(l.id, { smart: null, text: null, vector: null });
export const VERSION = '1.53.2';
```

Removed from backend:

```text
__version__ = "1.53.2"
INSTRUCTIONS = ("formvis is a layered image editor open on this computer. Call get_document first to see the document and its layers "
                "(ids for later calls), and get_image to see it. Every change is one undoable step. Generative tools cost the user "
                "money and ask them in formvis first.")
    _tool("select", "Changes the selection: a rectangle (x, y, width, height in pixels) combined by mode, or all, or none.", {"shape": {"type": "string", "enum": ["rectangle", "all", "none"]},
    _tool("generative_fill", "Fills the selection from a prompt with FLUX.1 Fill on fal, the result a new layer masked to the selection. Costs the user money: they are asked in formvis first.",
          {"prompt": {"type": "string", "maxLength": 2000}}, ["prompt"], open=True),
    _tool("generate_image", "Generates a picture from a prompt as a new layer, with FLUX1.1 [pro] on fal. Costs the user money: they are asked in formvis first.",
          {"prompt": {"type": "string", "maxLength": 2000}}, ["prompt"], open=True),
async def _call(name: str, args: dict) -> dict:
    """Runs a tool in the window; its MCP result."""
    if time.monotonic() - _seen > LIVE:
        return {"content": [{"type": "text", "text": "formvis is not taking requests: open formvis and turn on Allow outside agents in Preferences > Plugins."}], "isError": True}
        out = await asyncio.wait_for(fut, timeout=600)   # a generative call waits for the user and the model
        return {"content": [{"type": "text", "text": "formvis did not answer in time."}], "isError": True}
    return out
        out = _ok(req_id, {"supportedVersions": VERSIONS, "capabilities": {"tools": {}}, "_meta": {"io.modelcontextprotocol/serverInfo": server}, "instructions": INSTRUCTIONS}, True)
        out = _ok(req_id, {"protocolVersion": asked if asked in VERSIONS else "2025-11-25", "capabilities": {"tools": {}}, "serverInfo": server, "instructions": INSTRUCTIONS}, False)
        out = _ok(req_id, await _call(name, args), modern) if name in NAMES and isinstance(args, dict) else _err(req_id, -32602, f"No tool named {name}")
    global _seen
        if not _pending:
        if not _pending:
        item = _pending.popleft()
    """The window stopped taking requests (agents turned off): refuse at once, and answer anything queued."""
    global _seen
    _seen = 0.0
            fut.set_result({"content": [{"type": "text", "text": "formvis stopped taking requests."}], "isError": True})
    return {"live": time.monotonic() - _seen <= LIVE, "endpoint": "http://127.0.0.1:8190/mcp", "tools": len(TOOLS)}
version = "1.53.2"
version = "1.53.2"
 "version": "1.53.2",
```

Nothing removed from src-tauri.

## LaMa, and what runs locally · _v1.53.2 (backend/app/localgen/inpaint.py new, localgen/model_manager.py, main.py; frontend/src/io/local-gen.ts, ui/panels/generative-dialog.ts, ui/panels/local-models.ts; docs/LOCAL.md new; NOTICE.md; docs/MANUAL.md)

`inpaint.inpaint` (edge-padded to a square, 512 x 512, the mask grown, only the masked area taken) and `POST /api/inpaint/local`; `lama-inpaint` pinned in the model manager; `modelReady`, `localInpaint`; LaMa in Generative Fill and Expand, chosen when fal has no key; `showDownload` for models with no licence to accept; the margin fields named. Removed lines taken after the version edit. Removed from frontend:

```text
/** Whether Real-ESRGAN is downloaded (1.53.1). */
export async function upscalerReady(): Promise<boolean> {
  try { const m = await (await ask('/models')).json() as Array<{ id: string; ready: boolean }>; return !!m.find((x) => x.id === 'ai-upscale')?.ready; } catch { return false; }
import { localFill, localModels, localUpscale, upscalerReady, type LocalModel } from '../../io/local-gen';
  private readonly margin = { left: this.number(), top: this.number(), right: this.number(), bottom: this.number() };
  private number(): HTMLInputElement {
    return el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="30000" step="1" value="0">');
    else { this.locals = (await localModels()).filter((m) => m.fromPicture); this.fillModels(); }   // local models that start from a picture (1.52.9)
    if ([...this.model.options].some((o) => o.value === was)) this.model.value = was;
    this.el.append(el('<p class="cv-note">Models that run here, with no key and no cost: they appear in Generate Image, and Krea 2 in Generative Fill. They are large, and each licence is shown for you to accept before anything downloads.</p>'), this.upscaler, this.krea, this.klein, this.library);
    try { await Promise.all([this.showUpscaler(), this.showKrea(), this.showKlein(), this.showLibrary()]); }
export const VERSION = '1.53.1';
```

Removed from backend:

```text
__version__ = "1.53.1"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router):
version = "1.53.1"
version = "1.53.1"
 "version": "1.53.1",
```

Nothing removed from src-tauri.

## Upscale on this computer · _v1.53.1 (backend/app/localgen/ai_upscale.py new, localgen/model_manager.py, main.py; frontend/src/io/local-gen.ts, ui/panels/generative-dialog.ts, ui/panels/local-models.ts; NOTICE.md; docs/MANUAL.md)

formcut's upscaler for still pictures (`upscale_rgb` gaining an optional `report`, `upscale_image` passing tile options) and formvis's `POST /api/upscale/local` as a job; `_lock` and `_downloading` taken from formcut into the model manager (their absence broke listing and every install); the window's `followJob` shared by generation and upscaling, `localUpscale`, `upscalerReady`; Upscale's Model row with Real-ESRGAN on fal or this computer; the Real-ESRGAN card with Download. Removed lines taken after the version edit. Removed from frontend:

```text
import { localFill, localModels, type LocalModel } from '../../io/local-gen';
  upscale: 'Real-ESRGAN on fal enlarges what the document shows and opens it as a new document, for a fraction of a cent per image.',
    setHidden(this.modelRow, mode === 'upscale');   // Upscale stays Real-ESRGAN on fal
    this.locals = (await localModels()).filter((m) => m.fromPicture);   // local models that start from a picture (1.52.9)
    this.fillModels();
    this.el.append(el('<p class="cv-note">Models that run here, with no key and no cost: they appear in Generate Image, and Krea 2 in Generative Fill. They are large, and each licence is shown for you to accept before anything downloads.</p>'), this.krea, this.klein, this.library);
    try { await Promise.all([this.showKrea(), this.showKlein(), this.showLibrary()]); }
export const VERSION = '1.52.9';
```

Removed from backend:

```text
__version__ = "1.52.9"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router):
version = "1.52.9"
version = "1.52.9"
 "version": "1.52.9",
```

Nothing removed from src-tauri.

## Local image generation from formcut · _v1.52.9 (backend/app/localgen/ new: formcut's jobs, durable, processes, krea2, klein, local_runner, loras, checkpoints, content_filter, local_models, local_diffusion, prompt_data and generate, with model_manager built from formcut's; paths, media, orchestration and providers standing in for formcut's; main.py; frontend/src/io/local-gen.ts and ui/panels/local-models.ts new, generative-dialog.ts, generate-image.ts, app-dialogs.ts, app.ts, styles/dialogs.css; NOTICE.md; docs/MANUAL.md; requirements.txt)

formcut's local generation adapted: its folders pointed at formvis's; its media library replaced by pictures kept, fetched and removed (`media.ingest_path`, `/api/generate/pictures`); `_source_image` taking the picture the window sends; the video and sound generators and the preview-cache release left out; fal declared as a provider (formcut declares none); the event channel a no-op. The window: `localModels`, `runLocal`, `localFill`; Krea 2 in Generative Fill and Expand with Influence; local models in Generate Image; the notice and warning shown; `LocalModelsSection`. Removed lines taken after the version edit. Removed from frontend:

```text
    add('Plugins', this.keysNote, nm, this.nodemodeNote, cu, this.comfyuiNote, lm, tp, ag, agNote);
    this.model.replaceChildren(el('<option value="fal">FLUX1.1 [pro] (fal)</option>'), ...recipes().map((r) => { const o = document.createElement('option'); o.value = r.name; o.textContent = `${r.name} (ComfyUI)`; return o; }));
      if (choice === 'fal') {
    this.model.replaceChildren(el('<option value="fal">FLUX.1 Fill (fal)</option>'), ...recipes().map((r) => { const o = document.createElement('option'); o.value = `comfy:${r.name}`; o.textContent = `${r.name} (ComfyUI)`; return o; }));
    const s = this.status;
export const VERSION = '1.52.8';
```

Removed from backend:

```text
__version__ = "1.52.8"
version = "1.52.8"
version = "1.52.8"
 "version": "1.52.8",
```

Nothing removed from src-tauri.

## The Pen and the shape stroke · _v1.52.8 (engine/types.ts, engine/index.ts; extensions/tools/pen.ts, shape.ts; docs/MANUAL.md)

`ShapeStroke.dash` and `align`; `strokeShape` (solid, dashed or dotted; centred, inside by clipping, outside with the shape cut away; an open path centred) in `renderShape` and Pixels mode, a shape's padding following the alignment; `shapeSettings.strokeDash` and `strokeAlign` with the Shape bar's Stroke Type and Align; `Engine.penSettings` (mode, autoAddDelete) and `shapeFromPath`, the Pen's Mode and Auto Add/Delete. Removed lines taken after the version edit. Removed from frontend:

```text
import { type DocMode, BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type LayerLocks, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, type ParagraphStyle, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
    const pad = (style.stroke ? style.stroke.width / 2 : 0) + 1;
    if (style.stroke && style.stroke.width > 0) {
      // Centred on the path, with round joins and caps so corners and open ends stay smooth.
      c.strokeStyle = rgbCss(style.stroke.color);
      c.lineWidth = style.stroke.width;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke(shape);
    }
  shapeSettings: { kind: 'rectangle' | 'ellipse' | PathShapeKind; cornerRadius: number; mode: 'shape' | 'path' | 'pixels'; fill: 'fg' | 'bg' | 'none'; stroke: 'fg' | 'bg' | 'none'; strokeWidth: number } & PathShapeOptions =
    { kind: 'rectangle', cornerRadius: 0, mode: 'shape', fill: 'fg', stroke: 'none', strokeWidth: 3, ...DEFAULT_PATH_SHAPE };
    const look: ShapeStyle = { fill, stroke: strokeC ? { color: strokeC, width: Math.max(0.5, st.strokeWidth) } : null };
        if (look.stroke) { c.strokeStyle = rgbCss(look.stroke.color); c.lineWidth = look.stroke.width; c.lineJoin = 'miter'; c.stroke(shape); }
export interface ShapeStroke { color: RGB; width: number }
      // Between paths the Pen adds and deletes points: clicking a point deletes it, clicking the path adds one there.
      const edit = editAt(vp, v.toScreen(p.doc), (q) => v.toScreen(q));
export const VERSION = '1.52.7';
```

Removed from backend:

```text
__version__ = "1.52.7"
version = "1.52.7"
version = "1.52.7"
 "version": "1.52.7",
```

Nothing removed from src-tauri.

## Very large pictures · _v1.52.7 (backend/app/services/large.py and routers/large.py new, main.py; frontend/src/io/image-size.ts and ui/panels/large-picture.ts new, io/images.ts, io/api.ts, engine/project.ts, app.ts; docs/MANUAL.md)

`headerSize` (PNG, JPEG, WebP, GIF, BMP, nothing decoded) and `LargePictureError` in `decodeImage`; `LargePictureDialog` (a reduced copy, a region, tiles; the memory needed shown); `Project.tile`; the engine's `large.keep`, `reduced`, `region`, `tiles`, `forget` (Pillow's limit raised only while working, one picture kept decoded) and `assemble` (the tiles' coverage checked, one band decoded at a time, the PNG compressed and written as it goes) with `/api/large` and `/api/large/exports`; File > Export > Assemble Tiles; `relevant` in help/markdown.ts matching question words by stem and weighting them by rarity (the manual's new text had sent an AI-label question to the wrong section). Removed lines taken after the version edit. Removed from frontend:

```text
import { IMAGE_ACCEPT, RAW_FILE, decodeImage, isImageFile, isProjectFile } from './io/images';
          try { decoded.push(await decodeImage(f, f.name)); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
      { label: 'Export', items: ['export-as', '-', 'export-png', 'export-jpg', 'export-webp', 'export-avif', 'export-tiff', 'export-pdf', 'export-gif', '-', 'export-psd', 'export-psb', 'export-ora', '-', 'export-artboards'] },
/** The sections most about `question`: its words (three letters or more, common words left out) counted in each. */
  const words = question.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((w) => !common.has(w)) ?? [];
  const score = (s: Section): number => { const t = `${s.title} ${s.title} ${s.body}`.toLowerCase(); return words.reduce((n2, w) => n2 + (t.split(w).length - 1), 0); };
  return all.map((s) => ({ s, k: score(s) })).filter((x) => x.k > 0).sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.s);
export const VERSION = '1.52.6';
```

Removed from backend:

```text
__version__ = "1.52.6"
from app.routers import comfyui, generative, io, llm, mcp, ops, plugins, projects, system, nodemode
version = "1.52.6"
version = "1.52.6"
 "version": "1.52.6",
```

Nothing removed from src-tauri.

## Plugins · _v1.52.6 (backend/app/routers/plugins.py new, main.py; frontend/src/plugins/host.ts and ui/panels/plugins-dialog.ts new, ui/commands.ts, engine/index.ts, io/api.ts, app.ts, styles/dialogs.css; docs/MANUAL.md)

The engine's plugins folder (`/api/plugins`: list, read, add, remove; plain `.js` names only, 512 KB, UTF-8); `PluginHost` (each enabled plugin in a frame sandboxed to scripts alone, without same-origin; the RUNTIME's `formvis.register`, `call`, `getPixels`, `putPixels`; messages taken only from a plugin's own frame; pixels checked to be the document's size); `Engine.replaceLayerPixels`; `Commands.remove`; `PluginsDialog` and the Plugins menu. Removed from frontend (taken after the version edit, so the version line is here too):

```text
export const VERSION = '1.52.5';
```

A correction: the sections for 1.50.6 to 1.52.5 were taken before each release's version edit, so each leaves out the one line `frontend/src/version.ts` loses (`export const VERSION = '<the previous version>';`). From 1.52.6 the removed lines are taken after the version edit and match git exactly.

Removed from backend:

```text
from app.routers import comfyui, generative, io, llm, mcp, ops, projects, system, nodemode
```

Nothing removed from src-tauri.

## API keys in the password store · _v1.52.5 (backend/app/services/secrets.py new, services/generative.py, services/llm.py, requirements.txt; setup/freeze_backend and .bat; frontend/src/ui/app-dialogs.ts, io/api.ts; NOTICE.md; docs/MANUAL.md)

`secrets.get`, `put`, `delete` and `where` through keyring 25.7.0 (the system's password store; the owner-only file where there is none or it fails; a file copy moved on first read and removed once read back); the fal key (`_file_key`, `_file_write`, `_file_clear`) and the language model's key (`llm._key`) through it, their statuses naming the store; the desktop build collecting keyring's stores; Preferences > Plugins saying where keys are kept. Removed from frontend:

```text
  async llmStatus(): Promise<{ configured: boolean; baseUrl: string; model: string; hasKey: boolean } | null> {
    try { return (await (await request('/llm/status')).json()) as { configured: boolean; baseUrl: string; model: string; hasKey: boolean }; } catch { return null; }
    add('Plugins', nm, this.nodemodeNote, cu, this.comfyuiNote, lm, tp, ag, agNote);
```

Removed from backend:

```text
    try:
        value = str(json.loads(_settings_path().read_text()).get("falKey", "")).strip()
        if value:
            return value, "settings"
    except (OSError, ValueError, AttributeError):
        pass
    return None, None
def status() -> dict:
    _, source = _key()
    return {"configured": source is not None, "source": source, "fillModel": FILL_MODEL, "eraseModel": ERASE_MODEL, "upscaleModel": UPSCALE_MODEL}
def save_key(key: str) -> dict:
    key = key.strip()
    if not key or len(key) > 512 or any(c.isspace() for c in key):
        raise GenerativeError("That does not look like a fal API key.", 400)
    return status()
def forget_key() -> dict:
    return {"configured": bool(s.get("baseUrl") and s.get("model")), "baseUrl": s.get("baseUrl", ""), "model": s.get("model", ""), "hasKey": bool(s.get("key"))}
        s.pop("key", None)
        if len(key.strip()) > 512 or any(c.isspace() for c in key.strip()):
            raise LlmError("That does not look like an API key.", 422)
        s["key"] = key.strip()
    _write(s)
    headers = {"Content-Type": "application/json", **({"Authorization": f"Bearer {s['key']}"} if s.get("key") else {})}
```

Nothing removed from src-tauri.

## Session restore · _v1.52.4 (frontend/src/app.ts, io/recovery.ts, ui/prefs.ts, ui/app-dialogs.ts; docs/MANUAL.md)

`Prefs.restoreSession` (on unless turned off) and its File Handling row; `RecoveryRecord.modified` and `libraryName`; `keepModified` keeping every open document when on (a copy rewritten when its revision, saved state, library entry or name changes) and the tab order and active tab in localStorage (`formvis.session`); `reopen`; `offerRecovery` reopening silently in order when on, fresh copies written before the last session's are removed, and asking for unsaved work only when off. The manual's Getting started says so. Removed from frontend:

```text
import { recovery } from './io/recovery';
  const keptAt = new Map<string, number>();
      if (!p.modified) { if (keptAt.delete(p.id)) await recovery.drop(p.id); continue; }
      if (keptAt.get(p.id) === p.history.revision) continue;
        if (await recovery.keep({ id: p.id, name: p.name, savedAt: Date.now(), manifest, files })) keptAt.set(p.id, p.history.revision);
    const names = found.map((r) => r.name).join(', ');
    if (!(await confirmAction('Recover unsaved work?', `formvis closed with unsaved changes in ${names}. Open them again?`, 'Recover'))) { await recovery.clear(); return; }
    for (const r of found) {
      try {
        const byName = new Map(r.files.map((f) => [f.name, f.blob]));
        const { doc, activeId, paths, timeline } = await deserialize(r.manifest, (n) => { const b = byName.get(n); return b ? Promise.resolve(b) : Promise.reject(new Error(`${n} is missing.`)); });
        const p = engine.addProject(doc, `${r.name} (recovered)`, activeId);
        if (paths) engine.setPathsOf(p, paths);
        if (timeline) engine.setTimelineFor(p, timeline);
        p.history.markUnsaved();
        engine.emit('projects', null);
      } catch (err) { toast(`${r.name}: ${message(err)}`, 'error'); }
export interface RecoveryRecord { id: string; name: string; savedAt: number; manifest: Record<string, unknown>; files: FilePart[] }
    add('File Handling', this.recoveryRow.el, el('<p class="cv-note">Unsaved documents are kept on this device so they can be recovered after a crash; this is how soon after a change that happens.</p>'));
export interface Prefs { agentsAllowed: boolean; comfyuiUrl: string; nodemodeUrl: string; historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
export const DEFAULT_PREFS: Prefs = { agentsAllowed: false, comfyuiUrl: 'http://127.0.0.1:8188', nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
```

Nothing removed from src-tauri or backend.

## formvis Help · _v1.52.3 (docs/MANUAL.md new; frontend/src/help/markdown.ts and ui/panels/help.ts new, io/api.ts, app.ts, styles/dialogs.css, vite.config.ts)

The manual, written fresh, one section per area, naming only shortcuts checked in the code; `sections`, `render` (elements and text nodes only, never innerHTML) and `relevant` (the sections most about a question); `HelpDialog` (Help > formvis Help, F1: contents, search, Ask with the top sections sent to the language model without tools); `api.assistantStep` taking whether to send tools; the dev server allowed to read ../docs. Removed from frontend:

```text
    { label: 'Help', items: ['shortcuts', 'copy-error-log', 'benchmark', 'about'] },
  async assistantStep(messages: unknown[]): Promise<{ content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> }> {
    return (await (await request('/llm/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) })).json()) as { content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> };
```

Nothing removed from src-tauri or backend.

## The assistant · _v1.52.2 (backend/app/services/llm.py, routers/llm.py; frontend/src/ui/panels/assistant.ts new, io/api.ts, app.ts, styles/dialogs.css)

The engine's `llm.chat` and `POST /api/llm/chat` (one step of the conversation on the language model of Improve Prompt, the MCP catalogue attached as functions, the model's text and tool calls returned, the key kept); `AssistantPanel` (Window > Assistant, in the z-index registry's chat slot): each tool call run through `AgentBridge.run` as a card, its result sent back tied to the call, twelve steps at most a turn, Stop, and Undo This Turn by `history.steps.current`. Removed from frontend:

```text
    { label: 'Window', items: ['brush-settings', 'paragraph-styles', '-', ...ALL_PANELS.map((pn) => `panel-${pn.id}`), 'panel-paths', 'panel-properties-col', 'merge-columns', '-', 'reset-panels'] },
```

Removed from backend:

```text
from fastapi import APIRouter, Form, HTTPException
```

Nothing removed from src-tauri.

## Outside agents over MCP · _v1.52.1 (backend/app/routers/mcp.py new, main.py; setup/mcp_stdio.py new, formvis; frontend/src/automation/agent-bridge.ts and ui/panels/agent-confirm.ts new, ui/prefs.ts, ui/app-dialogs.ts, app.ts)

The engine's MCP endpoint (`/mcp`, Streamable HTTP in stateless JSON mode, the 2026-07-28 specification with `server/discover`, still answering 2025-11-25's `initialize`; the Origin checked; batches and unknown versions refused) and its `TOOLS` catalogue (14, each with a schema and hints); the window bridge (`/api/mcp/bridge/next`, a long poll that checks the window is still connected before and after taking a request and returns it to the front if not; `/result`; `/stop`, which refuses at once and answers what was queued); `setup/mcp_stdio.py` behind `./formvis mcp`. `AgentBridge` runs each tool through the engine's undoable calls, asking before the generative ones (`AgentConfirmDialog`); `Prefs.agentsAllowed`, off by default, and its Preferences > Plugins row. Removed from frontend:

```text
    add('Plugins', nm, this.nodemodeNote, cu, this.comfyuiNote, lm, tp);
export interface Prefs { comfyuiUrl: string; nodemodeUrl: string; historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
export const DEFAULT_PREFS: Prefs = { comfyuiUrl: 'http://127.0.0.1:8188', nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
```

Removed from backend:

```text
from app.routers import comfyui, generative, io, llm, ops, projects, system, nodemode
```

Nothing removed from src-tauri.

## Place 3D Model · _v1.51.9 (frontend/src/ui/panels/model3d.ts new, app.ts, styles/dialogs.css; package.json: three 0.186.1, MIT, and @types/three)

`Model3DDialog`: a .glb or .gltf read with three.js's GLTFLoader (loaded only when first used), centred and scaled to a unit box; Turn, Tilt, Size, Light direction, Light height, Light strength, Ambient and Light colour in a live preview (one renderer kept for the app's life); Place renders at the document's size (within the graphics card's largest texture, scaled up beyond it) on transparency into a new layer, its renderer released. File > Place 3D Model. Removed from frontend:

```text
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? [{ label: 'Open Recent', items: [...recent.map((_, i) => `recent-${i}`), '-', 'clear-recent'] }] : []), '-', 'save', 'save-as', 'download-project', '-',
```

Nothing removed from src-tauri or backend.

## Export sizes and the AI label · _v1.51.8 (frontend/src/io/ai-label.ts new, io/export-presets.ts, ui/panels/export-dialog.ts, app.ts)

`ExportSettings.size` (Scale, Fit Within, Frame), `boxW`, `boxH`, `aiLabel`; `exportLayout` (the image's size and the rectangle the picture goes in, a frame's picture centred); `xmpPacket` (IPTC's Digital Source Type: trainedAlgorithmicMedia or compositeWithTrainedAlgorithmicMedia) written by `labelPng` (an iTXt chunk after IHDR), `labelJpeg` (an APP1 segment after SOI) and `labelWebp` (an XMP chunk, a simple file made extended with VP8X and its XMP flag), through `withAiLabel`; Export As's Size, Width x Height and AI label rows, saved with presets, the note saying AVIF, TIFF and PDF do not carry the label. Removed from frontend:

```text
import { ENGINE_FORMATS, exportName, exportSize, type ExportSettings } from './io/export-presets';
        const bmp = await createImageBitmap(base), z = exportSize(bmp.width, bmp.height, s.scale), c = createSurface(z.w, z.h), x = ctxOf(c);
        x.drawImage(bmp, 0, 0, z.w, z.h);
        await deliver(blob, exportName(p.name, s));
export interface ExportSettings { format: ExportFormat; quality: number; scale: number; profile?: SpaceId }
    const s = clampSettings({ format: o.format as ExportFormat, quality: Number(o.quality), scale: Number(o.scale), profile: o.profile as SpaceId | undefined });
import { BUILTIN_EXPORT_PRESETS, EXPORT_FORMATS, LOSSY, clampSettings, exportName, exportSize, presetsFromStorage, type ExportFormat, type ExportPreset, type ExportSettings } from '../../io/export-presets';
    this.body.append(this.presetRow.el, this.formatRow.el, this.qualityRow.el, this.scaleRow.el, this.profileRow.el, this.sizeNote, manage);
    try { localStorage.setItem(KEY, JSON.stringify(this.saved.map(({ id, name, format, quality, scale, profile }) => ({ id, name, format, quality, scale, ...(profile ? { profile } : {}) })))); } catch { toast('Presets cannot be saved in this browser.', 'error'); }
    if (doc) { const z = exportSize(doc.width, doc.height, s.scale); setText(this.sizeNote, `${z.w} x ${z.h} px · ${exportName(this.engine.current?.name ?? 'Untitled', s)}${s.format === 'pdf' && s.profile ? ' · converted; PDF carries no profile' : ''}`); }
```

Nothing removed from src-tauri or backend.

## OpenRaster · _v1.51.7 (frontend/src/io/ora.ts new, io/zip.ts, io/images.ts, engine/index.ts, app.ts)

`unzip` (the central directory; stored and deflated entries through DecompressionStream); `writeOra` (mimetype first and stored, stack.xml topmost first with groups as isolation=auto stacks, a PNG per layer, plain pixels as they are and anything else drawn alone, adjustment layers left out and said so, mergedimage.png and a thumbnail) and `readOraFile` (the mimetype checked, stack.xml walked bottom first with groups after their children, blend modes mapped, the unknown reported, the merged image when there are no layers); `Engine.renderLayerAlone`; Open accepts .ora; File > Export > OpenRaster. SVG files were already placed as layers; a test now confirms it. Removed from frontend:

```text
          if (isPsdFile(f)) {
      { label: 'Export', items: ['export-as', '-', 'export-png', 'export-jpg', 'export-webp', 'export-avif', 'export-tiff', 'export-pdf', 'export-gif', '-', 'export-psd', 'export-psb', '-', 'export-artboards'] },
export const PROJECT_ACCEPT = ['.fmv', ...FORMER_PROJECT_EXTENSIONS, '.canvasor', '.comp', '.zip', '.psd', '.psb'].join(',');
```

Nothing removed from src-tauri or backend.

## Film looks · _v1.51.6 (engine/adjust-params.ts, engine/index.ts; ui/panels/adjust-panel.ts; ui/panels/film-layer.ts new; app.ts)

Three parameter adjustments: `splitToning` (shadow and highlight hues and strengths about a balance, each pixel's brightness kept), `halation` and `glow` (`bloom`: the highlights above a threshold blurred by `boxBlur` three times, sized in document pixels, tinted red-orange or in their own colour, screened back); the Grain adjustment's Preset row (ISO 100 to 3200), following its sliders; `Engine.addFilmLayer` (a light leak in Screen blend; a frame: film edge, white border or thin line) and `FilmLayerDialog`, Layer > New Film Layer. Bleach bypass, cross process and faded film were already Color Lookup looks, and a vignette already in Develop. Removed from frontend:

```text
      { label: 'New Adjustment Layer', items: ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`) }, 'edit-adjustment', 'color-match', '-',
export type ParamKind = 'brightnessContrast' | 'vibrance' | 'colorBalance' | 'blackWhite' | 'photoFilter' | 'channelMixer' | 'invert' | 'posterize' | 'threshold' | 'selectiveColor' | 'shadowsHighlights' | 'hdrToning' | 'colorLookup' | 'develop';
    const amount = sliderRow('Amount', 0, 100, 1, (v) => { gr().amount = v; this.changed(); });
    const size = sliderRow('Size', 0.5, 20, 0.1, (v) => { gr().size = v; this.changed(); });
    const rough = sliderRow('Roughness', 0, 100, 1, (v) => { gr().roughness = v; this.changed(); });
    node.append(amount.el, size.el, rough.el, reseed);
    return { node, sync: () => { amount.set(gr().amount); size.set(gr().size); rough.set(gr().roughness); } };
```

Nothing removed from src-tauri or backend.

## Improve Prompt · _v1.51.5 (backend/app/services/llm.py and routers/llm.py new, main.py; frontend/src/io/prompt-templates.ts and ui/panels/prompt-improver.ts new, io/api.ts, ui/app-dialogs.ts, ui/panels/generative-dialog.ts, generate-image.ts, comfyui-run.ts)

The engine's language model settings (`llm.save`, kept in llm.json readable only by the user; the key never returned), `models`, `improve` (the template as the system instruction with the reply rule; quotes and a Prompt: prefix stripped), and `/api/llm/status`, `/settings`, `/models`, `/improve`; the prompt templates (`STARTERS`, `templates`, `saveTemplates`); `PromptImprover` in Generative Fill, Generate Image and Run Workflow; Preferences > Plugins' language model and template editor. Removed from frontend:

```text
    add('Plugins', nm, this.nodemodeNote, cu, this.comfyuiNote);
    this.body.append(row('Workflow', this.pick, this.chosen, this.file), row('Input', this.input), row('Prompt', this.prompt), this.refs.el, this.status);
    this.body.append(this.prompt, row, this.refs.el, this.status);
```

Removed from backend:

```text
from app.routers import comfyui, generative, io, ops, projects, system, nodemode
```

Nothing removed from src-tauri.

## Blur, Sharpen and Smudge's options; reference layers · _v1.51.4 (engine/index.ts; extensions/tools/smear.ts; ui/panels/references.ts new, generative-dialog.ts, generate-image.ts, comfyui-run.ts; io/comfy.ts, io/api.ts; backend/app/routers/comfyui.py)

`retouch.smearBlend`, `smearSampleAll`, `protectDetail`, `fingerPainting`: Blur and Sharpen's Mode as their stroke's compositing and Sample All Layers (`blurred` of the composite), Sharpen's Protect Detail (`withinNeighbours`), Smudge's Sample All Layers (an empty layer now takes it) and Finger Painting; the Smear bar's tool choice labelled Tool. `ReferencePicker`; references through `comfyGenerator`, Generate Image and Run Workflow; the engine's `_title`, `REFERENCE_TITLE`, `_fill` filling titled reference nodes in order and never taking one as the picture, the reply's references count. Removed from frontend:

```text
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSample: HealSample; cloneBlend: BlendMode; cloneFlow: number; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean; patchSampleAll: boolean; healSource: 'sampled' | 'pattern'; healPattern: ID | null; patchPattern: ID | null } = { healMode: 'contentAware', cloneAligned: true, cloneSample: 'current', cloneBlend: 'normal', cloneFlow: 1, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false, patchSampleAll: false, healSource: 'sampled', healPattern: null, patchPattern: null };
      const sigma = clamp(this.brush.diameter / 10, 1.5, 30);
      texture = { surface: onMask ? this.maskBlurSample(p, l0, sigma) : this.layerSample(p, l0, sigma), dx: 0, dy: 0 };
      const src = this.layerSample(p, l0), W = src.width, H = src.height, out = createSurface(W, H);
      ctxOf(out).putImageData(sharpenSample(ctxOf(src).getImageData(0, 0, W, H), clamp(this.brush.diameter / 40, 0.8, 4)), 0, 0);
    const op: GlobalCompositeOperation = pick.target !== 'mask' && l0.locks?.transparency ? 'source-atop' : kind === 'clone' && pick.target !== 'mask' ? compositeOp(this.retouch.cloneBlend) : 'source-over';
    if (!this.paintable(l0) || !l0.raster) { this.notice('Select a layer with pixels first.'); return false; }
    const surface = this.layerSample(p, pick.layer);
    { kind: 'segment', label: 'Mode', choices: [{ id: 'liquify', label: 'Liquify' }, { id: 'blur', label: 'Blur' }, { id: 'sharpen', label: 'Sharpen' }, { id: 'smudge', label: 'Smudge' }], get: () => e.retouch.smearMode, set: (v) => { e.retouch.smearMode = v as 'blur' | 'sharpen' | 'smudge' | 'liquify'; e.emit('options', null); e.emit('tool', null); } },
  async comfyuiRun(target: string, workflow: string, items: unknown[], parts: FilePart[], prompt: string | null): Promise<{ job: string; image: string | null; mask: string | null; prompt: boolean }> {
    return (await res.json()) as { job: string; image: string | null; mask: string | null; prompt: boolean };
export function comfyGenerator(target: string, recipe: Recipe, prompt: string): (image: Blob, mask: Blob) => Promise<Blob> {
  return async (image, mask) => (await runToResults(target, recipe.json, [{ name: 'formvis fill', kind: 'image' }, { name: 'formvis fill mask', kind: 'mask', maskOf: 0 }],
    [{ name: 'image.png', blob: image }, { name: 'mask.png', blob: mask }], prompt))[0];
    this.body.append(row('Workflow', this.pick, this.chosen, this.file), row('Input', this.input), row('Prompt', this.prompt), this.status);
      const parts = await Promise.all(imgs.map(async (x, i) => ({ name: `${i}.png`, blob: await toPng(x.surface) })));
      const r = await api.comfyuiRun(target, w.json, imgs.map((x) => x.item), parts, this.prompt.value.trim() ? this.prompt.value.trim() : null);
    this.body.append(this.prompt, row, this.status);
        blob = (await runToResults(loadPrefs().comfyuiUrl, recipe.json, [], [], prompt, (t) => setText(this.status, t), () => this.stopped))[0];
      const fill = comfyGenerator(target, recipe, prompt);
```

Removed from backend:

```text
def _fill(workflow: dict, image: str | None, mask: str | None, prompt: str | None) -> dict:
    loads = [n for _, n in nodes if n["class_type"] == "LoadImage"]
    image = next((f["name"] for f in uploaded["files"] if f["kind"] != "mask"), None)
    flow = _fill(flow, image, mask, prompt)
    return {"job": job, "image": image, "mask": mask if mask and any(n["class_type"] == "LoadImageMask" for n in flow.values()) else None,
```

Nothing removed from src-tauri.

## Color Match · _v1.51.3 (engine/index.ts; ui/panels/color-match.ts new; app.ts)

`Engine.colorMatch` (the layer's opaque pixels against the picture without it and what is above it, beneath the layer or in a 24-pixel band around its edge; each of red, green and blue a line mapping mean and spread, the scale kept within a quarter and four; a Curves layer clipped to it, its opacity the amount, updated when run again; one step); `ColorMatchDialog` and Layer > Color Match. Removed from frontend:

```text
      { label: 'New Adjustment Layer', items: ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`) }, 'edit-adjustment', '-',
```

Nothing removed from src-tauri or backend.

## Generative models and Generate Image · _v1.51.2 (backend/app/services/generative.py, routers/generative.py, routers/comfyui.py; frontend/src/io/comfy.ts and ui/panels/generate-image.ts new, ui/panels/generative-dialog.ts, io/api.ts, app.ts)

The engine's `generative.generate` (FLUX1.1 [pro] on fal at `generation_size`: the document's shape, 256 to 1440 in multiples of 32) and `POST /api/generative/generate`; `POST /api/comfyui/run` taking no files for text to image; `io/comfy.ts` (kept workflows `recipes`, `addRecipe`, `removeRecipe`; `workflowProblem`; `runToResults`; `comfyGenerator`, the generator Generative Fill and Expand call); Generative Fill's Model (FLUX.1 Fill on fal, or a kept ComfyUI workflow, added and removed in the dialog, needing no fal key); `GenerateImageDialog` and Edit > Generate Image. Removed from frontend:

```text
      { label: 'Fill', items: ['fill-dialog', 'fill-fg', 'fill-bg'] }, 'content-fill-workspace', 'content-fill', 'generative-fill', 'remove-wires', '-',
```

Removed from backend:

```text
async def run(target: str = Form(...), workflow: str = Form(...), items: str = Form(...), prompt: str | None = Form(None), files: list[UploadFile] = File(...)) -> dict:
    uploaded = await send(target=target, items=items, files=files) if takes_image else {"files": []}
```

Nothing removed from src-tauri.

## Run ComfyUI Workflow · _v1.51.1 (backend/app/routers/comfyui.py; frontend/src/ui/panels/comfyui-run.ts new, ui/panels/send-to.ts, io/api.ts, app.ts)

The engine's `POST /api/comfyui/run` (the workflow checked to be in API format before anything is uploaded; `_fill`: the first LoadImage takes the image, the first LoadImageMask the mask, text nodes titled formvis prompt the prompt; a workflow with no LoadImage runs on the prompt alone; queued with /prompt), `GET /api/comfyui/job/{id}` (/history, then /queue: queued with how many ahead, running, done with the output images, failed), `GET /api/comfyui/image` (/view, output folder only), `POST /api/comfyui/cancel/{id}` (out of the queue, then /interrupt); `RunWorkflowDialog` (the last workflow kept; results as layers scaled to the document and masked to a sent selection, one step each; closing cancels a running job); `imagesFor` and `toPng` shared with the Send dialog. Removed from frontend:

```text
      { label: 'Automate', items: ['actions', 'action-stop', 'batch'] }, ...(hostLink.embedded ? ['send-host'] : ['send-nodemode']), 'send-comfyui', '-', 'close-tab'] },
type What = 'flattened' | 'layer' | 'selection' | 'layers';
  /** The chosen images, document-sized (a selection is its bounds), each with what NodeMode is told about it. */
  private images(what: What): Array<{ surface: Surface; item: Record<string, unknown> }> {
    const e = this.engine, p = e.current;
    const W = p.doc.width, H = p.doc.height, name = this.name.value.trim() || p.name;
    if (this.to === 'comfyui') {
  }
  private async send(): Promise<void> {
    if (this.sending) return;
    const imgs = this.images(this.what.value as What);
    if (!imgs.length) { setText(this.status, 'There is nothing to send: choose another option.'); return; }
    this.sending = true;
    setText(this.status, `Sending ${imgs.length === 1 ? 'the image' : `${imgs.length} images`} to ${this.to === 'comfyui' ? 'ComfyUI' : 'NodeMode'}...`);
    try {
      const parts = await Promise.all(imgs.map(async (x, i) => ({ name: `${i}.png`, blob: await toPng(x.surface) })));
      if (this.to === 'comfyui') {
        const c = await api.sendToComfyUI(this.target, imgs.map((x) => x.item), parts);
        this.close();
        this.toast(`Sent to ComfyUI: ${c.files.map((f) => f.name).join(', ')}. Pick ${c.files.length === 1 ? 'it' : 'them'} in Load Image${c.files.some((f) => f.kind === 'mask') ? ' (the mask in Load Image (as Mask))' : ''}.`);
        return;
      }
      const r = await api.sendToNodeMode(this.target, this.name.value.trim() || 'formvis', imgs.map((x) => x.item), parts);
      this.close();
      this.toast(r.placed ? `Sent to NodeMode: ${imgs.length === 1 ? 'one image' : `${imgs.length} images`} on its canvas.` : r.detail ?? 'Uploaded to NodeMode.');
    } catch (err) {
      setText(this.status, err instanceof ApiError ? err.message : `Sending to ${this.to === 'comfyui' ? 'ComfyUI' : 'NodeMode'} failed: the formvis engine is offline (./formvis boot).`);
    } finally { this.sending = false; }
  }
}
async function toPng(s: Surface): Promise<Blob> {
  if ('convertToBlob' in s) return (s as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  return new Promise((ok, no) => (s as HTMLCanvasElement).toBlob((b) => (b ? ok(b) : no(new Error('png'))), 'image/png'));
```

Removed from backend:

```text
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
```

Nothing removed from src-tauri.

## Send to ComfyUI · _v1.50.9 (backend/app/routers/comfyui.py and services/outbound.py new, routers/nodemode.py, main.py; frontend/src/ui/panels/send-to.ts (was send-nodemode.ts), io/api.ts, ui/prefs.ts, ui/app-dialogs.ts, app.ts)

The engine's `GET /api/comfyui/status` (ComfyUI's /system_stats, with its version) and `POST /api/comfyui/send` (each image through ComfyUI's /upload/image into the input folder's formvis subfolder, overwriting; the names its Load Image lists); `services/outbound.py`, the outbound helpers shared with the NodeMode router (address check, requests, multipart); `SendDialog` (was SendToNodeModeDialog) for both apps, a selection going to ComfyUI whole with a whole-picture mask; `Prefs.comfyuiUrl`; ComfyUI's address in Preferences > Plugins; File > Send to ComfyUI. Removed from frontend:

```text
import { SendToNodeModeDialog } from './ui/panels/send-nodemode';
  const sendNodeMode = new SendToNodeModeDialog(engine, (t) => toast(t));
      { label: 'Automate', items: ['actions', 'action-stop', 'batch'] }, ...(hostLink.embedded ? ['send-host'] : ['send-nodemode']), '-', 'close-tab'] },
    add('Plugins', nm, this.nodemodeNote);
/** File > Send to NodeMode (1.50.8, the owner's priority): the flattened image, the active layer, the selection (its
 *  image and its mask) or every layer, sent to the NodeMode at the address in Preferences > Plugins. The status line
 *  says whether NodeMode answers and whether it can place what arrives on its canvas. */
export class SendToNodeModeDialog extends Dialog {
  constructor(private readonly engine: Engine, private readonly toast: (text: string) => void) {
    super('Send to NodeMode', 380);
    const target = loadPrefs().nodemodeUrl;
    setText(this.status, `Sending ${imgs.length === 1 ? 'the image' : `${imgs.length} images`} to NodeMode...`);
      const r = await api.sendToNodeMode(loadPrefs().nodemodeUrl, this.name.value.trim() || 'formvis', imgs.map((x) => x.item), parts);
      setText(this.status, err instanceof ApiError ? err.message : 'Sending to NodeMode failed: the formvis engine is offline (./formvis boot).');
export interface Prefs { nodemodeUrl: string; historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
export const DEFAULT_PREFS: Prefs = { nodemodeUrl: 'http://localhost:8000', historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
```

Removed from backend:

```text
from app.routers import generative, io, ops, projects, system, nodemode
import urllib.parse
import urllib.request
import uuid
    """NodeMode's address, as given: http or https with a host, nothing else."""
    parsed = urllib.parse.urlparse(target.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=422, detail="NodeMode's address must be an http:// or https:// address, such as http://localhost:8000.")
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    return urllib.request.urlopen(req, timeout=timeout)
    return HTTPException(status_code=502, detail=f"NodeMode is not answering at {base}. Start NodeMode, or set its address in Preferences > Plugins. ({exc.__class__.__name__})")
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + blob + f"\r\n--{boundary}--\r\n".encode()
    with _request(base + "/api/upload", body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}, "POST") as r:
```

Nothing removed from src-tauri.

## Send to NodeMode, standalone · _v1.50.8 (backend/app/routers/nodemode.py new, backend/app/main.py; frontend/src/ui/panels/send-nodemode.ts new, io/api.ts, ui/prefs.ts, ui/app-dialogs.ts, app.ts)

The engine's `GET /api/nodemode/status` and `POST /api/nodemode/send` (each image through NodeMode's upload, then one announcement to `/api/formvis/receive` saying which image is the mask of which; a NodeMode without the receiver still gets the uploads, and the reply says so); `api.nodemodeStatus`, `sendToNodeMode`; `SendToNodeModeDialog` (the flattened image, the active layer, the selection with its mask, or every layer); `Prefs.nodemodeUrl` and Preferences' Plugins section; File > Send to NodeMode when not embedded. NodeMode's receiving half is a patch in the planning docs. Removed from frontend:

```text
      { label: 'Automate', items: ['actions', 'action-stop', 'batch'] }, ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice;
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto',
```

Removed from backend:

```text
from app.routers import generative, io, ops, projects, system
```

Nothing removed from src-tauri.

## The tool audit, part 4 · _v1.50.7 (engine/index.ts, engine/viewport.ts; extensions/tools/tone.ts, eyedropper.ts, zoom.ts)

`tone.protectTones` (Dodge and Burn move brightness with the hue kept, easing toward grey only as far as keeps a colour from clipping) and `tone.vibrance` (the Sponge saturates the least saturated most), both on by default as Photoshop's; `Engine.eyedropperSample` (Current Layer, Current & Below through `belowOverrides`, All Layers) in `sampleColor`; `Viewport.fill`, `Engine.fillScreen`; the Zoom bar's 100% and Fill Screen. Removed from frontend:

```text
  tone: { range: 'shadows' | 'midtones' | 'highlights'; exposure: number; spongeMode: 'desaturate' | 'saturate'; flow: number } = { range: 'midtones', exposure: 0.5, spongeMode: 'desaturate', flow: 0.5 };
      if (kind === 'sponge') { const k = t.spongeMode === 'saturate' ? -t.flow : t.flow; f = (v) => v + (l - v) * k; }
      else {
        f = kind === 'dodge' ? (v) => v + (1 - v) * a : (v) => v * (1 - a);
    this.work.render({ doc: p.doc, target: s, view: translation(-(Math.floor(pt.x) - half), -(Math.floor(pt.y) - half)) });
```

Nothing removed from src-tauri or backend.

## The tool audit, part 3 · _v1.50.6 (engine/index.ts; extensions/tools/clone.ts, gradient.ts)

The Clone Stamp's `retouch.cloneSample` (Current Layer, Current & Below, All Layers, through `healSampleSurface` and the new shared `belowOverrides`, in the stroke, the preview and the overlay), `cloneBlend` and `cloneFlow` in its stroke; the Gradient's `transparency` and `method` (`gradientMethod`: Classic in sRGB, Linear in linear light, Perceptual in OKLab, each segment divided into 24 steps). Removed from frontend:

```text
  gradientSettings: { shape: GradientType; style: string; reversed: boolean; opacity: number; blend: BlendMode; dither: boolean } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1, blend: 'normal', dither: false };
    const stops = resolveStops(presetById(st.style), fg, bg, st.reversed);
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean; patchSampleAll: boolean; healSource: 'sampled' | 'pattern'; healPattern: ID | null; patchPattern: ID | null } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false, patchSampleAll: false, healSource: 'sampled', healPattern: null, patchPattern: null };
    const all = this.retouch.cloneSampleAll, key = [all, l.id, p.history.revision, p.id].join('|');
      const image = all ? renderDoc(this.work, p.doc, null) : l.raster ? l.raster.canvas : null;
    const r0 = this.retouch, key = [sp.x.toFixed(2), sp.y.toFixed(2), d, this.brush.hardness, side, r0.cloneSampleAll, l.id, p.history.revision, r0.cloneScale, r0.cloneAngle, r0.cloneFlipH, r0.cloneFlipV].join('|');
    if (this.retouch.cloneSampleAll) this.work.render({ doc: p.doc, target: s, view, quality: 'medium' });
      texture = { surface: pattern ?? (kind === 'healBrush' ? this.healSampleSurface(p, l0, this.retouch.healSample) : this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0)), dx: off.x, dy: off.y };
    const style = kind === 'heal' || kind === 'remove' ? { ...this.brush, opacity: 0.45, color: white } : { ...this.brush, color: white };
    const s = new PixelStroke(pick.raster, pick.local, style, pick.target !== 'mask' && l0.locks?.transparency ? 'source-atop' : 'source-over', p.selection, texture, pick.target === 'mask');   // Lock Transparency
    const s = createSurface(p.doc.width, p.doc.height);
    this.work.render({ doc: p.doc, target: s, view: [1, 0, 0, 1, 0, 0], overrides, quality: 'high' });
    return s;
    { kind: 'toggle', label: 'Sample all layers', get: () => e.retouch.cloneSampleAll, set: (v) => { e.retouch.cloneSampleAll = v; e.emit('options', null); } },
```

Nothing removed from src-tauri or backend.

## The rename to formvis · _v1.50.5 (every file; frontend/src/io/legacy.ts and backend/app/core/legacy.py new)

The app is formvis, its projects `.fmv`, at the owner's word; git history is untouched (its commits and tags keep the former name), and 32 files moved by `git mv` keep their histories. This log, like the changelog, now reads with the new name throughout, quotes before this entry included. Of the 243 lines git reports removed since v1.50.4 in frontend/src, backend/app and src-tauri, 228 differ only by the name and are not quoted (quoting them would put the former name back thousands of times; git holds them); the rest are quoted in full below, with the new name. `legacy.ts` and `legacy.py`, the only places the former name remains, carry what was saved under it across: settings and the browser databases (merged, never overwriting; each move bounded so the app always starts), the library folder, the former project extensions and format identifier.

```text
    return _ensure(Path(raw).expanduser() if raw else Path.home() / "Formvis")
from app.core import config
SUFFIXES = (".fmv", ".formvis", ".canvasor", ".comp", ".zip")
#: The library writes .fmv; .formvis (the extension before 0.90.0) is still read, listed, opened and deleted.
EXT, OLD_EXT = ".fmv", ".formvis"
    """The library file for `name`: the .fmv one, or else an older .formvis one."""
    old = path.with_suffix(OLD_EXT)
    return path if path.is_file() or not old.is_file() else old
    for suffix in (OLD_EXT, EXT):
    target.with_suffix(OLD_EXT).unlink(missing_ok=True)
    path.with_suffix(OLD_EXT).unlink(missing_ok=True)
SUPPORTED = {FORMVIS: range(1, 2), CANVASOR: range(1, 2)}
export const PROJECT_ACCEPT = '.fmv,.formvis,.canvasor,.comp,.zip,.psd,.psb';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|canvasor|comp|zip|psd|psb)$/i.test(f.name);
startApp();
```

## The tool audit, part 2 · _v1.50.4 (engine/stroke.ts, engine/index.ts, engine/text.ts, engine/types.ts; io/psd.ts; extensions/registry.ts, extensions/tools/brush.ts, type.ts, wand.ts; ui/options.ts; styles)

`PixelStroke.stamp`, `Engine.airbrushTick`, `strokeShow` (the Brush's Airbrush); `TextSpec.antialias` (None, Sharp, Smooth; `antialiased`), read back and written to PSD; the options bar's `color` control; Type's Anti-aliasing and Color; `setType` restyling the selected type layer (style keys only); the Magic Wand's sample sizes to 101 by 101, Select Subject and Select and Mask. Removed from frontend:

```text
  return warpActive(t.warp) ? warpRender(plain, t.warp) : plain;
export interface TextSpec { box?: { w: number; h: number } | null; direction?: 'horizontal' | 'vertical'; content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right' | 'justify'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; style?: ID | null; rendered?: string }
let smoothing = 0, steady: { x: number; y: number } | null = null, last: import('../registry').ToolPointer | null = null;
  down(ctx, p) { if (p.button === 0) { hoverPt = p.doc; steady = { ...p.doc }; last = p; ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose); } },
  up(ctx) { if (steady && last && smoothing > 0) ctx.engine.strokeTo(last.doc, last.pressure, last.pose); steady = null; last = null; ctx.engine.endStroke(); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
    { kind: 'segment', label: 'Sample Size', choices: [{ id: '0', label: 'Point' }, { id: '1', label: '3 by 3' }, { id: '2', label: '5 by 5' }], get: () => String(e.wand.sampleSize), set: (v) => e.setWand({ sampleSize: Number(v) }) },
        paragraphStyle: { justification: t.align === 'justify' ? 'justify-left' : t.align }, shapeType: t.box ? 'box' : 'point', ...(t.box ? { boxBounds: [0, 0, t.box.w * k, t.box.h * k] } : {}), ...(t.direction === 'vertical' ? { orientation: 'vertical' } : {}) };
```

Nothing removed from src-tauri or backend.

## The tool audit, flashes and New Document · _v1.50.3 (engine/index.ts, engine/stroke.ts; extensions/tools/brush.ts, eraser.ts, bucket.ts, type.ts, marquee.ts, lasso.ts, quick-select.ts, object-select.ts; ui/app-dialogs.ts, ui/properties.ts; backend/app/services/segment.py)

New Document's note and its size by mode; the Properties icon written only when it changes; `Engine.brushBlend`, `setBrushBlend` (Photoshop's Mode: Normal, Behind, Clear and the modes the canvas draws), the bucket's modes filtered alike; the Brush's Smoothing and Angle; `StrokeStyle.square` and the Eraser's Block, Flow and Erase to History; Type's Font Style and Warp Text; Select and Mask on the selection tools; `segment.available` without importing torch. Removed from frontend:

```text
  beginStroke(pt: Pt, shift: boolean, pressure = 1, pose: PenPose = UPRIGHT, opts: { aliased?: boolean; autoErase?: boolean; name?: string } = {}): boolean {
    const op: GlobalCompositeOperation = pick.target === 'mask' ? (white ? 'source-over' : 'destination-out') : keepAlpha ? 'source-atop' : this.brushMode === 'erase' ? 'destination-out' : 'source-over';
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, bg: { ...this.bg }, flow: this.brushFlow, aliased: !!opts.aliased }, op, p.selection);
export interface StrokeStyle { bg?: RGB; aliased?: boolean; diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number }
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
  down(ctx, p) { if (p.button === 0) { hoverPt = p.doc; ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose); } },
  move(ctx, p) { hoverPt = p.doc; ctx.engine.strokeTo(p.doc, p.pressure, p.pose); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'paint', label: 'Paint' }, { id: 'erase', label: 'Erase' }], get: () => e.brushMode, set: (v) => e.setBrushMode(v as 'paint' | 'erase') },
import { BLEND_MODES, allPatterns } from '../../engine';
    { kind: 'select', label: 'Mode', choices: BLEND_MODES.map((m) => ({ id: m.id, label: m.label })), get: () => e.bucket.mode, set: (v: string) => e.setBucket({ mode: v as typeof e.bucket.mode }) },
let hover: Pt | null = null, mode: 'brush' | 'pencil' = 'brush', before: 'paint' | 'erase' = 'paint';
    before = ctx.engine.brushMode;
    ctx.engine.setBrushMode('erase');
    if (!ctx.engine.beginStroke(p.doc, p.shift, p.pressure, p.pose, { aliased: mode === 'pencil', name: 'Eraser' })) ctx.engine.setBrushMode(before);
  up(ctx) { ctx.engine.endStroke(); ctx.engine.setBrushMode(before); },
  cancel(ctx) { ctx.engine.cancelStroke(); ctx.engine.setBrushMode(before); },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'brush', label: 'Brush' }, { id: 'pencil', label: 'Pencil' }], get: () => mode, set: (v) => { mode = v as 'brush' | 'pencil'; e.emit('options', null); } },
import { dashed, type Tool } from '../registry';
    { kind: 'toggle', label: 'Bold', get: () => e.textSettings.bold, set: (v) => setType(e, { bold: v }) },
    { kind: 'toggle', label: 'Italic', get: () => e.textSettings.italic, set: (v) => setType(e, { italic: v }) },
    side.append(label('Name', this.name), sizeRow, pair(label('Resolution', this.res, el('<span class="cv-nd-unit">ppi</span>')), label('Orientation', seg)), pair(label('Color Mode', mode), label('&nbsp;', depth)), label('Background Contents', this.fill), ab, this.summary);
    const mb = (this.px.w * this.px.h * 3) / (1024 * 1024);
      tile.innerHTML = a ? icon(kindIcon(a), 18) : '';
```

Removed from backend:

```text
    try:
        import sam2  # noqa: F401
        import torch  # noqa: F401
        return True
    except Exception:
```

Nothing removed from src-tauri.

## Paint targets, scrollbars, colour modes and Wet Edges · _v1.50.2 (engine/index.ts, engine/types.ts, engine/stroke.ts; io/project-io.ts; ui/app-dialogs.ts, ui/tabs.ts; app.ts; styles/scrollbars.css)

`Engine.paintable` as Photoshop decides (a group says so; an adjustment layer paints its mask through `target`; type, shape and smart-object layers ask `askRasterize`); empty layers read as transparent by the Paint Bucket, Quick Selection and the Magic Wand; `scrollbars.css` hides every scrollbar; `DocMode`, `Doc.mode`, `Doc.palette`; `Engine.convertMode` (Grayscale keeping type, shapes and vectors editable; Bitmap by threshold or dither; Indexed exact or adaptive, `paletteFor`), `flattenImage`, `setDocumentMode`, `inMode` with the foreground and background as accessors; `ModeDialog`; New Document's modes; the tab's mode; the project file's mode and palette; Wet Edges on the whole stroke (`wetInner`, `wetMark`). Removed from frontend:

```text
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type LayerLocks, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, type ParagraphStyle, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
  fg: RGB = { r: 0, g: 0, b: 0 };
  bg: RGB = { r: 255, g: 255, b: 255 };
  private paintable(l: Layer | null): l is Layer { return !!l && !l.isGroup && !l.adjustment && !this.locked(l, 'pixels'); }
    const target: Target = p.maskTarget && l0.mask ? 'mask' : 'pixels';
    const raster = target === 'mask' ? this.ensureMask(p, l0) : this.ensurePixels(p, l0);
      if (!l?.raster) { this.notice('Select a pixel layer first.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
      if (!l?.raster) { this.notice('Quick Selection samples the active pixel layer; turn on Sample all layers to use the whole image.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
      if (!l?.raster) { this.notice('Magic Wand samples the active pixel layer; turn on Sample all layers to use the whole image.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
      if (shape.noise || shape.wetEdges) this.tip = shapedTip(this.tip, !!shape.noise, !!shape.wetEdges);
    if (this.dualPaint || this.textureTile) {
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; notes?: readonly DocNote[]; counts?: readonly { x: number; y: number }[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[] }
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.notes?.length ? { notes: doc.notes.map((n) => ({ id: n.id, x: n.x, y: n.y, text: n.text })) } : {}), ...(doc.counts?.length ? { counts: doc.counts.map((c) => ({ x: c.x, y: c.y })) } : {}), ...(doc.globalLight ? { globalLight: { angle: doc.globalLight.angle, altitude: doc.globalLight.altitude } } : {}), ...(doc.paragraphStyles?.length ? { paragraphStyles: doc.paragraphStyles.map((s) => ({ ...s, color: { ...s.color } })) } : {}) };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(notes.length ? { notes } : {}), ...(counts.length ? { counts } : {}), ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}), ...(styles.length ? { paragraphStyles: styles } : {}) }, activeId: str(manifest.activeLayerID) };
* { scrollbar-width: thin; scrollbar-color: var(--border-light) transparent; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: var(--radius-pill); }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
    const mode = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Color Mode"><option>RGB Color</option></select>');
    setText(this.summary.querySelector('.cv-nd-meta') as HTMLElement, `RGB Color · 8 bit · ${mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`}`);
```

Nothing removed from src-tauri or backend.

## Brush Settings and the hover highlight · _v1.50.1 (engine/brush-dynamics.ts, engine/stroke.ts, engine/index.ts; ui/panels/brush-settings.ts; extensions/tools/object-select.ts)

`BrushShape.color`, `transfer`, `noise`, `wetEdges`; `PixelStroke.dabTip` (Color Dynamics), `transferAlpha`, `shapedTip` (Noise, Wet Edges), `toHsv`, `fromHsv`; `StrokeStyle.bg`; the panel's Color Dynamics, Transfer, and Noise and Wet Edges; Object Selection's hover as a wash and an outline. Removed from frontend:

```text
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, flow: this.brushFlow, aliased: !!opts.aliased }, op, p.selection);
export interface StrokeStyle { aliased?: boolean; diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number }
  private readonly tip: Surface;
    const d = this.dynamics, info = { pressure }, r = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1);
    this.paintCtx.drawImage(this.tip, p.x - rx, p.y - ry, rx * 2, ry * 2);
    const base = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = (this.style.flow ?? 1) * (d ? computeOption(d.flow, info) : 1);
      this.paintCtx.drawImage(this.tip, -rx, -ry, rx * 2, ry * 2);
      for (let i = 0; i < data.length; i++) if (data[i] >= 128) { img.data[i * 4] = 249; img.data[i * 4 + 1] = 115; img.data[i * 4 + 2] = 22; img.data[i * 4 + 3] = 90; }
 *  Dynamics, Scattering, Texture and Dual Brush. It edits the engine's brush shape live, so the next stroke uses it;
```

Nothing removed from src-tauri or backend.

## Object Selection, Quick Selection and the Paint Bucket · _v1.49.10 (extensions/tools/object-select.ts, quick-select.ts, bucket.ts; io/api.ts; engine/index.ts; backend/app/routers/ops.py, backend/app/services/segment.py)

Object Selection's `request` and `selectWith` (points or a box), box mode and the hover highlight (`showHover`, Highlight on Hover); `api.selectObject` with a box; the engine's `select` taking a box (a box alone will do) and the route's box field; Quick Selection's New, Add and Subtract (`beginQuickSelect` fresh); the Paint Bucket's source, pattern and mode (`patternTint`, `compositeOp`). Removed from frontend:

```text
  bucket = { tolerance: 32, contiguous: true, sampleAll: false, opacity: 1, antiAlias: true };
      } else c.drawImage(this.tint(rect, rgbCss(color), cover), rect.x, rect.y);
  beginQuickSelect(pt: Pt, subtract: boolean): void {
  hint: () => 'Click to fill the area of similar color with the foreground color \u00b7 Tolerance sets how similar \u00b7 Stays inside the selection',
import type { Tool } from '../registry';
async function selectAt(engine: Engine, pt: Pt, mode: SelectionMode): Promise<void> {
  if (!p || !src) return;
  const W = p.doc.width, H = p.doc.height, x = Math.floor(pt.x), y = Math.floor(pt.y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const key = keyOf(p.id, src);
      const blob = await api.selectObject(key, [[x, y, 1]], () => toBlob(src), key !== sentKey);
      sentKey = key;
      const bitmap = await createImageBitmap(blob), m = createSurface(W, H), c = ctxOf(m);
      c.drawImage(bitmap, 0, 0, W, H);
      bitmap.close();
      const px = c.getImageData(0, 0, W, H).data, data = new Uint8Array(W * H);
      for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
      if (engine.current !== p) return;
      if (!data.some((v) => v >= 128)) { engine.notice('No object was found there.'); return; }
      engine.applySelection(SelectionMask.cropped(0, 0, W, H, data), mode, 'Object Selection');
  hint: () => 'Click an object to select it · Shift adds · Alt subtracts · The first click on an image takes a few seconds',
  down(ctx, p) { if (p.button === 0) void selectAt(ctx.engine, p.doc, modeFor(ctx.engine, p)); },
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginQuickSelect(p.doc, p.alt); },
  async selectObject(key: string, points: Array<[number, number, 0 | 1]>, image: () => Promise<Blob>, withImage: boolean): Promise<Blob> {
      const body = form({ key, points: JSON.stringify(points) }, img ? [{ name: 'image.png', blob: img }] : [], 'file');
```

Removed from backend:

```text
def select_object(key: str = Form(...), points: str = Form(...), file: UploadFile | None = File(None)) -> Response:
        png = segment.select(key, pts)
def select(key: str, points: list[tuple[float, float, int]]) -> bytes:
    """The object at the clicked points of the image encoded under `key`, as a grey PNG mask: each point (x, y, 1) is on
    the object and (x, y, 0) not on it; of SAM's three proposals the one it scores highest."""
    if not points:
        raise SegmentError("Click on the object to select.")
        coords = np.array([[x, y] for x, y, _ in points], dtype=np.float32)
        labels = np.array([1 if on else 0 for _, _, on in points], dtype=np.int32)
            masks, scores, _ = pred.predict(point_coords=coords, point_labels=labels, multimask_output=len(points) == 1)
```

Nothing removed from src-tauri.

## Retouching and Rotate View · _v1.49.9 (extensions/tools/content-aware-move.ts, red-eye.ts, rotate-view.ts new, smear.ts, index.ts, registry.ts; engine/index.ts, engine/viewport.ts, engine/types.ts; ui/stage.ts, ui/text-editor.ts, ui/tool-groups.ts, ui/rail.ts, ui/icons.ts)

`Engine.contentAwareMove` (move or extend, the hole filled by `contentFill`, the selection moved); `Engine.redEye`, `redEyeArea` (no step when nothing red); `Viewport.rotation`, `Engine.setViewRotation`, `Stage.unturn`, `Stage.turn` (the surfaces turned by CSS, pointers and wheel panning turned back), the text editor turned with the view; `Tool.group` (Rotate View's R in the Hand's slot); Smear without a shortcut; rail titles by each tool's key. Removed from frontend:

```text
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'colorSampler' | 'ruler' | 'note' | 'count' | 'idle';
  for (const tool of [historyBrushTool, frameTool, convertPointTool, selectionBrushTool, pencilTool, eraserTool, magicEraserTool, patternStampTool, backgroundEraserTool, colorSamplerTool, rulerTool, noteTool, countTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
  id: 'smear', label: 'Smear', key: 'R', order: 65,
      setTitle(node, t.id === 'brush' ? 'Brush (B) · Eraser (E)' : entries(group) > 1 ? `${t.label} (${group.key}) · hold or right-click for ${group.tools.length} tools · Shift+${group.key} cycles` : `${t.label} (${group.key})`);
    for (const k of ['viewport', 'active'] as const) engine.on(k, () => this.queue(true, true));
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.engine.pan(-(horizontal ? e.deltaY : e.deltaX) * unit, -(horizontal ? 0 : e.deltaY) * unit);
    const g = out.find((x) => x.key === t.key);
    if (g) g.tools.push(t); else out.push({ key: t.key, tools: [t] });
```

Nothing removed from src-tauri or backend.

## Shape modes, fill and stroke · _v1.49.8 (engine/shape-paths.ts, engine/index.ts; extensions/tools/shape.ts; ui/properties.ts, ui/icons.ts)

`PathShapeKind` 'triangle'; `boxedShapePath` for triangle, rectangle (`roundRectPath`) and ellipse (`ellipsePath`); `shapeSettings.mode`, `fill`, `stroke`, `strokeWidth`; `Engine.drawShape` (shape layer, work path, or pixels), `createVectorShape` (fill and stroke), `createShape` with a colour, `paintPath` with a given path; the shape bar's Mode, Fill, Stroke and Width; Justify in the Paragraph panel; a type mask clipped to the canvas. Removed from frontend:

```text
    const d = r.raster.ctx.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
    this.applySelection(SelectionMask.cropped(x, y, w, h, a), 'replace', spec.direction === 'vertical' ? 'Vertical Type Mask' : 'Horizontal Type Mask');
    const name = kind === 'custom' ? CUSTOM_SHAPES.find((s) => s.id === st.custom)?.label ?? 'Custom Shape' : { polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart' }[kind];
  private paintPath(name: string, paint: (c: Ctx2D, shape: Path2D, vp: VectorPath) => void): void {
    const vp = this.workPath;
  shapeSettings: { kind: 'rectangle' | 'ellipse' | PathShapeKind; cornerRadius: number } & PathShapeOptions = { kind: 'rectangle', cornerRadius: 0, ...DEFAULT_PATH_SHAPE };
  createShape(rect: Rect): void {
    const style = { kind, red: this.fg.r / 255, green: this.fg.g / 255, blue: this.fg.b / 255, cornerRadius: st.kind === 'rectangle' ? st.cornerRadius : 0 };
export type PathShapeKind = 'polygon' | 'star' | 'line' | 'arrow' | 'heart' | 'custom';
export function boxedShapePath(kind: 'polygon' | 'star' | 'heart' | 'custom', box: Rect, o: PathShapeOptions): VectorPath {
const NOUN: Record<string, string> = { rectangle: 'a rectangle', ellipse: 'an ellipse', polygon: 'a polygon', star: 'a star', heart: 'a heart', line: 'a line', arrow: 'an arrow', custom: 'a custom shape' };
const KINDS = ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'heart', 'custom'] as const;
const SHAPE_ICONS: Record<string, string> = { rectangle: 'tRect', ellipse: 'tEllipseShape', polygon: 'tPolygon', star: 'tStar', line: 'tLine', arrow: 'tArrow', heart: 'tHeart', custom: 'tCustomShape' };
const SHAPE_NAMES: Record<(typeof KINDS)[number], string> = { rectangle: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart', custom: 'Custom Shape' };
    ? `Drag to draw ${NOUN[e.shapeSettings.kind]} in the foreground color on a new shape layer · Shift after starting snaps to 45 degrees · Shift+U switches shape`
    : `Drag to draw ${NOUN[e.shapeSettings.kind]} in the foreground color on a new shape layer · Shift after starting keeps it square · Alt after starting grows from the center · Shift+U switches shape`,
    const kind = ctx.engine.shapeSettings.kind;
    if (lineLike(kind)) { ctx.engine.createPathShape(d.anchor, snapped(d)); return; }
    if (kind === 'rectangle' || kind === 'ellipse') { if (r.w >= 1 && r.h >= 1) ctx.engine.createShape(r); }
    else ctx.engine.createPathShape({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
    const body = el(`<div class="cv-para"><div class="cv-seg" role="group" aria-label="Alignment">${(['left', 'center', 'right'] as const).map((a) => `<button type="button" data-align="${a}" title="Align ${a}" aria-label="Align ${a}">${icon(a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight', 16)}</button>`).join('')}</div></div>`);
```

Nothing removed from src-tauri or backend.

## Type tools · _v1.49.7 (engine/text.ts, engine/types.ts, engine/index.ts, io/psd.ts; extensions/tools/type.ts; ui/text-editor.ts, ui/icons.ts; app.ts; styles)

`TextSpec.box`, `direction`, align 'justify'; `renderPlain` wraps (`wrapLines`), clips and justifies in a box; `renderVertical`; placement of box and vertical text (`createTextLayer`, `updateTextLayer`); `Engine.typeMask`, `createTextSelection`; the Type tool's four kinds, click or drag; the editor's box, vertical and mask modes; the PSD export's justify-left, box and vertical orientation; reading them back. Removed from frontend:

```text
    const d = (e as CustomEvent<{ layerId?: string; x?: number; y?: number }>).detail;
    else if (typeof d?.x === 'number' && typeof d?.y === 'number') typing.begin({ x: d.x, y: d.y });
    const x = at.x - (spec.align === 'center' ? w / 2 : spec.align === 'right' ? w - r.pad : r.pad);
    this.insertRasterLayer(r.raster, name, Math.round(x), Math.round(at.y - r.baseline), { text: { ...spec, rendered: textKey(r.raster) } }, 'Type');
        const x = spec.align === 'center' ? t.x + (t.w - nw) / 2 : spec.align === 'right' ? t.x + t.w - nw : t.x;
    const x = spec.align === 'center' ? t.x + (t.w - nw) / 2 : spec.align === 'right' ? t.x + t.w - nw : t.x;
  const lines = t.content.split('\n');
  const metrics = lines.map((line) => probe.measureText(line || ' '));
  const widths = lines.map((line) => lineWidth(probe, t, line || ' '));
  const advance = t.size * t.lineHeight, pad = Math.ceil(t.size * 0.1) + 2;
  const width = Math.ceil(widest) + pad * 2, height = Math.ceil(ascent + descent + advance * (lines.length - 1)) + pad * 2;
  c.textAlign = perChar ? 'left' : t.align;
    if (!perChar) { c.fillText(line, t.align === 'center' ? width / 2 : t.align === 'right' ? width - pad : pad, y); return; }
    let x = t.align === 'center' ? (width - widths[i]) / 2 : t.align === 'right' ? width - pad - widths[i] : pad;
    for (const ch of line) { c.fillText(ch, x, y); x += c.measureText(ch).width + trackingPx(t); }
    align: o.align === 'center' || o.align === 'right' ? o.align : 'left', bold: o.bold === true, italic: o.italic === true,
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; style?: ID | null; rendered?: string }
export interface ParagraphStyle { id: ID; name: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning }
import type { Tool } from '../registry';
  icon: () => 'tType',
  hint: () => 'Click to add text on a new type layer · Click a type layer to edit its text',
    { kind: 'segment', label: 'Align', choices: [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Right' }], get: () => e.textSettings.align, set: (v) => setType(e, { align: v === 'center' || v === 'right' ? v : 'left' }) },
    const hit = ctx.engine.textLayerAt(p.doc);
    document.dispatchEvent(new CustomEvent('cv:type', { detail: hit ? { layerId: hit } : { x: p.doc.x, y: p.doc.y } }));
        paragraphStyle: { justification: t.align }, shapeType: 'point' };
  private session: { project: Project; at: Pt; layerId: ID | null; spec: TextSpec; scale: number } | null = null;
  begin(target: { x: number; y: number } | { layerId: ID }): void {
      this.session = { project: p, at: { x: target.x, y: target.y }, layerId: null, spec: { ...e.textSettings, content: '', color: e.fg, rendered: undefined }, scale: 1 };
```

Nothing removed from src-tauri or backend.

## Measuring · _v1.49.6 (ui/info.ts, ui/panels/note-dialog.ts, extensions/tools/color-sampler.ts, ruler.ts, note.ts, count.ts new; engine/index.ts, engine/types.ts, io/project-io.ts; ui/panel-group.ts, ui/dock.ts, ui/stage.ts, ui/icons.ts, app.ts; styles)

`InfoPanel`; `Engine.measure`, `measureChanged`; `colorSamplerTool`, `drawSamplers`; `rulerTool` (Straighten Layer); `noteTool`, `NoteDialog`, `Engine.activeNote`, `addNote`, `setNote`, `removeNote`, `Doc.notes`; `countTool`, `addCount`, `removeCount`, `clearCounts`, `Doc.counts`; notes and counts in the project file; `PanelGroup.fitTabs`; a panel newer than a saved arrangement starts as it comes. Removed from frontend:

```text
const TAB_HOMES: Record<string, string> = { layers: 'layers-panel', channels: 'layers-panel', paths: 'layers-panel', navigator: 'navigator', swatches: 'swatches', color: 'swatches', properties: 'properties', brushes: 'brushes', 'brush-settings': 'brushes', paragraph: 'paragraph', character: 'character' };
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[] }
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'idle';
  for (const tool of [historyBrushTool, frameTool, convertPointTool, selectionBrushTool, pencilTool, eraserTool, magicEraserTool, patternStampTool, backgroundEraserTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.globalLight ? { globalLight: { angle: doc.globalLight.angle, altitude: doc.globalLight.altitude } } : {}), ...(doc.paragraphStyles?.length ? { paragraphStyles: doc.paragraphStyles.map((s) => ({ ...s, color: { ...s.color } })) } : {}) };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}), ...(styles.length ? { paragraphStyles: styles } : {}) }, activeId: str(manifest.activeLayerID) };
const DEFAULT: DockState = { order: DOCK_PANELS.map((p) => p.id), hidden: ['timeline', 'history'], side: [...DEFAULT_SIDE] };
    this.state = { order: o, hidden: hidden.filter((id) => ALL_PANELS.some((p) => p.id === id)), side: [...DEFAULT_SIDE] };
```

Nothing removed from src-tauri or backend.

Correction: the last line above (ui/dock.ts, `Dock.arrange`, replaced by the workspace fix) was missed when this section was first written, and the release's docs commit wrongly said the last two fixes removed nothing; added here. As in every section, the version line itself is not quoted.

## Painting tools · _v1.49.5 (extensions/tools/pencil.ts, eraser.ts, magic-eraser.ts, pattern-stamp.ts, background-eraser.ts new, brush.ts, index.ts; engine/index.ts, engine/stroke.ts, engine/types.ts; ui/icons.ts; app.ts; styles)

`pencilTool` (`StrokeStyle.aliased`, `PixelStroke.aliasedDab`, `beginStroke` opts: aliased, autoErase, name); `eraserTool` (E, its own tool); `magicEraserTool` (`Engine.magicErase`); `patternStampTool` (the retouch kind 'patternStamp', `patternStampPattern`); `backgroundEraserTool` (`beginBackgroundErase`, `backgroundEraseTo`, `endBackgroundErase`, `bgDab`, `BgEraseOpts`); the Brush's flyout without the Eraser; E and B keys by their groups, Shift+L through three lasso kinds; tabs fit. Removed from frontend:

```text
    else if (k === 'E') { engine.setTool('brush'); engine.setBrushMode('erase'); }
    else if (k === 'B') { engine.setTool('brush'); engine.setBrushMode('paint'); }
    else if (k === 'L' && e.shiftKey) { engine.setTool('lasso'); engine.update({ lassoKind: engine.lassoKind === 'freehand' ? 'polygonal' : 'freehand' }); }
  beginStroke(pt: Pt, shift: boolean, pressure = 1, pose: PenPose = UPRIGHT): boolean {
    p.history.begin(this.brushMode === 'erase' ? 'Eraser' : 'Brush', p.snapshot());
    const color = pick.target === 'mask' ? { r: 255, g: 255, b: 255 } : keepAlpha && this.brushMode === 'erase' ? this.bg : this.fg;
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, flow: this.brushFlow }, op, p.selection);
    s.setShape(this.brushShape, this.brushShape.texture.on ? (patternById(this.brushShape.texture.pattern) ?? allPatterns()[0])?.surface ?? null : null);
  beginRetouchStroke(kind: 'heal' | 'remove' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge' | 'historyBrush', pt: Pt, shift: boolean): boolean {
    p.history.begin({ heal: 'Spot Healing', remove: 'Remove', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge', historyBrush: 'History Brush' }[kind], p.snapshot());
export interface StrokeStyle { diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null; flow?: number }
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'selectionBrush' | 'idle';
  variants: (e) => [
    { id: 'paint', label: 'Brush', icon: 'tBrush', active: () => e.brushMode !== 'erase', pick: () => e.setBrushMode('paint') },
    { id: 'erase', label: 'Eraser', icon: 'tEraser', active: () => e.brushMode === 'erase', pick: () => e.setBrushMode('erase') },
  ],
  for (const tool of [historyBrushTool, frameTool, convertPointTool, selectionBrushTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

Nothing removed from src-tauri or backend.

## Selection tools · _v1.49.4 (engine/livewire.ts new, engine/index.ts, engine/types.ts; extensions/tools/lasso.ts, marquee.ts, selection-brush.ts new, index.ts; ui/stage.ts, ui/panel-group.ts, ui/icons.ts; styles)

`EdgeMap`, `liveWire`, `snapToEdge`; the Magnetic Lasso (`lassoKind` 'magnetic', `trace`, `traceSoon`, fastening, closing near the start); Single Row and Single Column Marquee (`marqueeKind` 'row', 'column'); `selectionBrushTool`, `Engine.beginSelectionBrushStroke` (the Quick Mask stroke with a forced add or subtract); tabs on one line. Removed from frontend:

```text
  marqueeKind: 'rectangle' | 'ellipse' = 'rectangle';
  lassoKind: 'freehand' | 'polygonal' = 'freehand';
  private beginQuickMaskStroke(p: Project, pt: Pt, pressure: number, pose: PenPose): boolean {
    p.history.begin('Quick Mask', p.snapshot());
    if (!sel) d.fill(255);
    else for (let y = 0; y < sel.h; y++) {
    const white = luminance(this.fg) >= 0.5 !== (this.brushMode === 'erase');
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'idle';
  for (const tool of [historyBrushTool, frameTool, convertPointTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
function reset(ctx: ToolContext): void { pts = []; active = false; ctx.engine.emit('overlay', null); }
  const poly = pts;
  e.applySelection(mask, mode, e.lassoKind === 'polygonal' ? 'Polygonal Lasso' : 'Lasso');
  icon: (e) => (e.lassoKind === 'polygonal' ? 'tPolyLasso' : 'tLasso'),
  hint: (e) => (e.lassoKind === 'polygonal'
    if (p.clicks >= 2 || Math.hypot(first.x - p.screen.x, first.y - p.screen.y) <= 6) { commit(ctx); return; }
  hover(ctx, p) { hover = p?.doc ?? null; if (active) ctx.engine.emit('overlay', null); },
    if (!active || ctx.engine.lassoKind !== 'polygonal') return nudgeSelectionKey(ctx, e);
    { kind: 'segment', label: 'Kind', choices: [{ id: 'freehand', label: 'Freehand' }, { id: 'polygonal', label: 'Polygonal' }], get: () => e.lassoKind, set: (v) => e.update({ lassoKind: v as 'freehand' | 'polygonal' }) },
  icon: (e) => (e.marqueeKind === 'ellipse' ? 'tEllipse' : 'tMarquee'),
    { id: 'rectangle', label: 'Rectangular Marquee', icon: 'tMarquee', active: () => e.marqueeKind !== 'ellipse', pick: () => e.update({ marqueeKind: 'rectangle' }) },
    { kind: 'segment', label: 'Shape', choices: [{ id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }], get: () => e.marqueeKind, set: (v) => e.update({ marqueeKind: v as 'rectangle' | 'ellipse' }) },
    if (this.engine.quickMask) {
      // Quick Mask: a red tint where nothing is selected, in place of the outline; live while a stroke paints it.
```

Nothing removed from src-tauri or backend.

## Paths, the grip and seven tabs · _v1.49.3 (extensions/tools/direct-select.ts, convert-point.ts and path-actions.ts new, path-select.ts, registry.ts, index.ts; engine/history.ts, engine/index.ts, engine/types.ts; ui/panels/stroke-path-dialog.ts, ui/paths.ts, ui/panel-group.ts, ui/icons.ts, app.ts; styles)

`directSelectTool` with a point selection, box select, group moves, pulled and broken handles, nudging; `convertPointTool`; `pathActions`, `toolHost`; `StrokePathDialog` width and colour; the Paths footer's dialogs; `Snapshot.paths`, work-path edits undoable (`beginPathEdit`, `endPathEdit`, `restore`, `History.end`); `PanelGroup.MAX_TABS`, `full`; the grip pinned. Removed from frontend:

```text
export interface Snapshot { doc: Doc; activeId: ID | null; selection: SelectionMask | null }
    if (!p.patches.length && p.before.doc === snap.doc && p.before.selection === snap.selection) return false;
    const p = this.current;
    if (!p || this.pathGesture || !this.selectedPath(p)?.shape) return;
    p.history.begin('Edit Shape Path', p.snapshot());
    p.history.end(p.snapshot());
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'idle';
import type { Tool } from '../registry';
type Grab = { anchor: Anchor; part: 'anchor' | 'in' | 'out'; from: Pt; start: Anchor };
function pick(anchors: Anchor[], at: Pt, toScreen: (p: Pt) => Pt): { anchor: Anchor; part: 'anchor' | 'in' | 'out' } | null {
/** Direct Selection (A): drag a Work Path anchor to move it with its handles, or drag a handle to reshape the curve; on
 *  a smooth point the opposite handle swings round to stay in line, keeping its own length. */
  hint: () => 'Drag a path point to move it, or a handle to reshape its curve · Draw paths with the Pen (P)',
    const v = ctx.view(), hit = pick(vp.subpaths.flatMap((s) => s.anchors), v.toScreen(p.doc), (q) => v.toScreen(q));
    grab = hit ? { ...hit, from: p.doc, start: { ...hit.anchor } } : null;
    if (grab) ctx.engine.beginPathEdit();
    const dx = p.doc.x - g.from.x, dy = p.doc.y - g.from.y, a = g.anchor, s = g.start;
    if (g.part === 'anchor') {
      a.x = s.x + dx; a.y = s.y + dy; a.inX = s.inX + dx; a.inY = s.inY + dy; a.outX = s.outX + dx; a.outY = s.outY + dy;
      const smooth = Math.abs((s.outX - s.x) * (s.inY - s.y) - (s.outY - s.y) * (s.inX - s.x)) < 1e-6 && (s.inX !== s.x || s.inY !== s.y) && (s.outX !== s.x || s.outY !== s.y);
  up(ctx) { grab = null; ctx.engine.endPathEdit(); },
    if (g) { Object.assign(g.anchor, g.start); ctx.engine.setWorkPath(ctx.engine.workPath); }
      gx.fillStyle = pal.handle;
  for (const tool of [historyBrushTool, frameTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
      if (t !== target) { target?.root.classList.remove('is-tab-target'); target = t; target?.root.classList.add('is-tab-target'); }
      target?.root.classList.remove('is-tab-target');
      if (ghost && target) { PanelGroup.moveTab(tid, this, target); PanelGroup.saveHomes(); }
    if (!t || from === to) return;
import { checkRow, selectRow } from './controls';
    this.body.append(this.toolRow.el, this.pressureRow.el, el('<p class="cv-note">The stroke uses the tool\'s current size, hardness and opacity; Clone Stamp needs its source set first.</p>'));
    this.engine.strokePathWith(this.tool, this.pressure);
      `<button class="cv-icon-btn" type="button" data-cmd="fill-path" title="Fill path" aria-label="Fill path">${icon('fill', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="stroke-path" title="Stroke path" aria-label="Stroke path">${icon('paintbrush', 16)}</button>` +
```

Nothing removed from src-tauri or backend.

## Panels reworked · _v1.49.2 (ui/layers.ts, ui/panel-group.ts, ui/dock.ts, ui/channels.ts, ui/icons.ts, app.ts; styles)

`LayersPanel` builds a `PanelGroup` (layers-panel; the page `.cv-layers-page`; `adoptPaths`, `adoptChannels` through `addTab`; `showTab` finds the group holding the tab); `PanelGroup.addTab`, `has`, `size`, `labelOf`, `remove`, `onDetach`, `onGapHint`, the grip; `Dock.gapAt`, `showGap`, `hideGap`, `insertPanel`, `removePanel`, `registerPanel`, `unregisterPanel`, the ghost and labelled marker; groups made by detaching (formvis.customGroups). Removed from frontend:

```text
import { ALL_PANELS, Dock } from './ui/dock';
const TAB_HOMES: Record<string, string> = { navigator: 'navigator', swatches: 'swatches', color: 'swatches', properties: 'properties', brushes: 'brushes', 'brush-settings': 'brushes', paragraph: 'paragraph', character: 'character' };
  PanelGroup.onMoved = () => { dock.refresh(); props.relayout(); };
      dock.reset(); PanelGroup.resetHomes(TAB_HOMES); PanelGroup.resetStates(); layers.showTab('layers');
.cv-layers-panel { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; }
.cv-layers-panel.is-paths-tab, .cv-layers-panel.is-channels-tab { grid-template-rows: auto minmax(0, 1fr); }
.cv-layers-panel.is-paths-tab > .cv-layer-props, .cv-layers-panel.is-paths-tab > .cv-layer-list, .cv-layers-panel.is-paths-tab > .cv-panel-foot,
.cv-layers-panel.is-channels-tab > .cv-layer-props, .cv-layers-panel.is-channels-tab > .cv-layer-list, .cv-layers-panel.is-channels-tab > .cv-panel-foot { display: none; }
.cv-layers-panel .cv-paths[hidden] { display: none; }
.cv-layers-panel .cv-paths { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.cv-layers-panel .cv-paths > .cv-panel-head { height: 34px; background: transparent; }
.cv-layers-panel .cv-paths-toggle { display: none; }
.cv-layers-panel { grid-template-columns: minmax(0, 1fr); }
    if (this.root.hidden || this.timer) return;
export const ALL_PANELS: readonly DockPanel[] = [...DOCK_PANELS, ...SIDE_PANELS];
    // The column under the pointer: the side column's when over it (and open), else the dock's.
    const col: 'dock' | 'side' = sr && e.clientX >= sr.left && e.clientX <= sr.right ? 'side' : 'dock';
    const ids = (col === 'side' ? this.state.side : this.dockIds()).filter((id) => this.present(id));
    const shown = ids.map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    let best = 0, bestDist = Infinity, y = box.top + 2;
    for (let i = 0; i <= shown.length; i++) {
      if (!shown.length) break;
      const dist = Math.abs(e.clientY - gap);
      if (dist < bestDist) { bestDist = dist; best = i; y = gap; }
    d.target = best;
    d.col = col;
    if (this.marker.parentElement !== host) host.appendChild(this.marker);
    this.marker.style.top = `${Math.round(y - box.top + host.scrollTop - 1)}px`;
/** The group's tab as last left (remembered with the other groups). */
function savedTab(): LayersTab {
  try { const t = (JSON.parse(localStorage.getItem('formvis.groups') ?? '{}') as Record<string, { tab?: string }>).layers?.tab; return t === 'paths' || t === 'channels' ? t : 'layers'; } catch { return 'layers'; }
}
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><div class="cv-group-tabs" role="tablist"><button class="cv-group-tab is-active" type="button" role="tab" data-tab="layers">Layers</button><button class="cv-group-tab" type="button" role="tab" data-tab="channels">Channels</button><button class="cv-group-tab" type="button" role="tab" data-tab="paths">Paths</button></div><span></span><button class="cv-group-more cv-layers-more" type="button" data-cmd="panel-menu" title="Panel menu" aria-label="Panel menu">${icon('more3', 16)}</button></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="add-mask">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="clip">${icon('clipMask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-layer">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="delete-layer">${icon('delete', 16)}</button></div></section>`);
    for (const t of root.querySelectorAll<HTMLButtonElement>('.cv-layers-panel .cv-group-tab')) t.addEventListener('click', () => this.showTab(t.dataset.tab as LayersTab));
    // The panel menu, by tab: the Layers panel's commands, or the Paths panel's.
    const more = q<HTMLButtonElement>(root, '.cv-layers-more');
    more.addEventListener('click', () => {
      const panel = this.rows.closest('.cv-layers-panel') as HTMLElement;
      const ids = panel.classList.contains('is-paths-tab') ? ['new-path', 'delete-path', '-', 'fill-path-dialog', 'stroke-path-dialog'] : panel.classList.contains('is-channels-tab') ? [] : ['new-layer', 'duplicate-dialog', 'delete-layer', '-', 'new-folder', 'group', '-', 'merge', '-', 'layer-style', 'convert-smart', 'rasterize'];
      if (ids.length) PanelGroup.menuHost?.(more, ids);
    });
    for (const b of this.rows.closest('.cv-layers-panel')?.querySelectorAll<HTMLButtonElement>('.cv-lock-btn') ?? []) {
    for (const b of this.rows.closest('.cv-layers-panel')?.querySelectorAll<HTMLButtonElement>('.cv-kind-btn') ?? []) {
  /** The Paths panel's section becomes this group's Paths tab, as the target's Layers group (Layers | Paths). */
    const panel = this.rows.closest('.cv-layers-panel') as HTMLElement;
    panel.appendChild(section);
    this.showTab(savedTab(), false);
  /** The Channels tab (Phase 21): its panel shown in this group, as Paths is. */
    (this.rows.closest('.cv-layers-panel') as HTMLElement).appendChild(panel.root);
    this.showTab(savedTab(), false);
  showTab(tab: LayersTab, remember = true): void {
    const panel = this.rows.closest('.cv-layers-panel') as HTMLElement;
    panel.classList.toggle('is-paths-tab', tab === 'paths');
    panel.classList.toggle('is-channels-tab', tab === 'channels');
    this.channels?.setVisible(tab === 'channels');
    for (const t of panel.querySelectorAll<HTMLButtonElement>(':scope > .cv-panel-head .cv-group-tab')) {
      const on = t.dataset.tab === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    }
    if (this.paths) setHidden(this.paths, tab !== 'paths');
    if (remember) {
      try { const s = JSON.parse(localStorage.getItem('formvis.groups') ?? '{}'); s.layers = { ...s.layers, tab }; localStorage.setItem('formvis.groups', JSON.stringify(s)); } catch { /* this session only */ }
    }
    this.root = el(`<section class="cv-${id} cv-group" aria-label="${label}"><div class="cv-panel-head cv-group-head"><div class="cv-group-tabs" role="tablist"></div><span></span><button class="cv-group-more" type="button" data-cmd="panel-menu" title="Panel menu" aria-label="Panel menu" hidden>${icon('more3', 16)}</button><button class="cv-group-min" type="button" data-cmd="minimise" title="Minimise" aria-label="Minimise">${icon('minus', 12)}</button></div><div class="cv-group-body"></div></section>`);
    this.show(saved.tab && this.tabs.has(saved.tab) ? saved.tab : list[0].id, false);
    const up = (): void => {
```

Nothing removed from src-tauri or backend.

## Fixes from the owner's walkthrough of 1.49.0 · _v1.49.1 (ui/icons.ts, ui/app-dialogs.ts, ui/panel-group.ts, ui/properties.ts, app.ts; styles)

`tStamp`, `tHistoryBrush`, `tEyedropper` redrawn; `NewCanvasDialog` previews by aspect ratio, Color Mode and bit depth enabled; `PanelGroup.resetStates`; `PropertiesColumn.resetLayout`; Reset Panels restores the whole layout; denser glass. Removed from frontend:

```text
    { id: 'reset-panels', label: 'Reset Panels', run: () => { dock.reset(); PanelGroup.resetHomes(TAB_HOMES); } },
.cv-menu { padding: 6px; border: 1px solid color-mix(in srgb, var(--text-primary) 12%, transparent); border-radius: 12px; background: rgba(40, 39, 44, 0.86); backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55); }
  --glass-bg: color-mix(in srgb, var(--surface-2) 58%, transparent);
  --glass-filter: blur(30px) saturate(1.9);
    const mode = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Color Mode" disabled><option>RGB Color</option></select>');
    const depth = el<HTMLSelectElement>('<select class="cv-nd-input" aria-label="Bit depth" disabled><option>8 bit</option></select>');
      const page = card.querySelector('.cv-nd-page') as HTMLElement, s = Math.min(150 / p.w, 76 / p.h);
      page.style.width = `${Math.max(8, Math.round(p.w * s))}px`;
      page.style.height = `${Math.max(8, Math.round(p.h * s))}px`;
  tEyedropper: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4.6a2.4 2.4 0 0 1 3.4 0l1.5 1.5a2.4 2.4 0 0 1 0 3.4l-2 2-4.9-4.9z"/><path d="m12.2 7-7.7 7.7-1 4.8 4.8-1 7.7-7.7"/><path d="M11 9.5 14.5 13"/></svg>`,
  tStamp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 13.5V11a2.5 2.5 0 1 0-5 0" transform="translate(5 -3)"/><path d="M9.6 10.5h4.8v3H9.6z"/><path d="M5 13.5h14a1 1 0 0 1 1 1V17H4v-2.5a1 1 0 0 1 1-1z"/><path d="M6 20h12"/><circle cx="12" cy="6" r="2.6"/></svg>`,
  tHistoryBrush: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 3.5c-3.4 1.2-7.2 4.8-9.2 7.7l1.6 1.6c2.9-2 6.4-5.8 7.6-9.3z"/><path d="M10.4 12.1c-2 0-3.3 1.4-3.3 3.1 0 1.2-.7 2.1-1.7 2.4 1.1 1 2.9 1.2 4.3.8 2-.6 2.8-2.4 2.1-4.2"/><path d="M3.5 9.5a6 6 0 0 1 6.2-6"/><path d="M3.2 6.3l.3 3.2 3.1-.6"/></svg>`,
```

Nothing removed from src-tauri or backend.

## The owner's walkthrough of 1.48.0 · _v1.49.0 (ui/channels.ts earlier; extensions/tools/history-brush.ts, frame.ts new; engine/index.ts, engine/types.ts, engine/viewport.ts, io/project-io.ts; ui/dock.ts, ui/panel-group.ts, ui/properties.ts, ui/rail.ts, ui/stage.ts, ui/menu.ts, ui/dropdown.ts, ui/themes.ts, ui/prefs.ts, ui/app-dialogs.ts, ui/history.ts, ui/swatches.ts, ui/layers.ts, app.ts, index.html; extensions/tools/*.ts; styles)

Semantic tokens (surfaces, lines, accent tints, glass) and `--accent-intensity`, `setIntensity`, appearance 3; `enhanceAllSelects`; the main grid's areas; `Viewport.insetRight`, `centerX`; `PropertiesColumn.showingCollapsed`, `openWidth`, `relayout`; `ToolVariant`; `Engine.quickMask`, `toggleQuickMask`, `quickMaskLive`; screen modes, `toggle-panels`, `rail-columns`; `historyBrushTool`, `Engine.historyBrushSource`, `autoFirstSnapshot`, `openingSnapshot`; `frameTool`, `Layer.frame`, `Engine.newFrameLayer`; Edit Toolbar; `Dock` with `side`, `merge`, `separate`, `present`; `PanelGroup.moveTab`, tab homes; `Stage.prefs`; Preferences' new sections. Removed from frontend:

```text
  var DEFAULT_ACCENT = '#aba0d3';
  var theme = DEFAULT_THEME, accent = DEFAULT_ACCENT;
    /* A choice saved before the Studio Dark redesign (no appearance: 2) is set aside once, so everyone sees it. */
    if (raw) { var s = JSON.parse(raw); if (s.appearance === 2) { if (s.theme && PROFILES[s.theme]) theme = s.theme; if (s.accentColor) accent = s.accentColor; } }
import { applyPrefs, loadPrefs, savePrefs } from './ui/prefs';
import { DOCK_PANELS, Dock } from './ui/dock';
<div class="cv-options"></div>
<aside class="cv-rail" aria-label="Tools"><div class="cv-rail-tools"></div><div class="cv-colors"></div></aside>
  new PropertiesColumn(q(root, '.cv-props-col'), engine, (c) => { commands.run(c); }, () => syncPropsCol());
  const syncPropsCol = (): void => { setHidden(q(root, '.cv-props-col'), !propsShown()); setStyleVar(root, '--cv-props-w', propsShown() ? (PropertiesColumn.collapsed() ? '46px' : '284px') : '0px'); };
  const dock = new Dock(q(root, '.cv-layers'));
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); recoveryDelay = pr.recoverySeconds * 1000; home.sync(); syncGpu(); syncEngineDevice(); }),
    ...DOCK_PANELS.map((pn) => ({ id: `panel-${pn.id}`, label: pn.label, checked: () => dock.isShown(pn.id), run: () => dock.toggle(pn.id) })),
    { id: 'reset-panels', label: 'Reset Panels', run: () => dock.reset() },
      { label: 'Modify', items: ['expand', 'contract', 'feather', 'border', 'smooth'] }, '-', 'path-selection', 'delete-path'] },
      { label: 'Guides', items: ['toggle-guides', 'lock-guides', 'new-guide', 'clear-guides'] }] },
    { label: 'Window', items: ['brush-settings', 'paragraph-styles', '-', ...DOCK_PANELS.map((pn) => `panel-${pn.id}`), 'panel-paths', 'panel-properties-col', '-', 'reset-panels'] },
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode | 'remove'; healFrom?: Pt } | null = null;
    let n = list.length + 1;
    const a = at ?? { x: v.width / 2, y: v.height / 2 };
          transform: { ...docTransform(img.width, img.height), x: Math.floor(c.x - img.width / 2), y: Math.floor(c.y - img.height / 2) },
  beginRetouchStroke(kind: 'heal' | 'remove' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge', pt: Pt, shift: boolean): boolean {
    p.history.begin({ heal: 'Spot Healing', remove: 'Remove', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge' }[kind], p.snapshot());
export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'idle';
    const z = Math.min((this.width - margin * 2) / dw, (this.height - margin * 2) / dh);
    this.panX = Math.round((this.width - dw * this.zoom) / 2);
  const r = Math.max(0.5, (ctx.engine.brush.diameter * v.zoom) / 2);
  g.strokeStyle = pal.antsA;
  g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = pal.antsB;
  g.beginPath(); g.arc(c.x, c.y, r + 1, 0, Math.PI * 2); g.stroke();
  for (const tool of [moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
  icon: (e) => (e.shapeSettings.kind === 'ellipse' || e.shapeSettings.kind === 'heart' ? 'tEllipseShape' : 'tRect'),
  icon: (e) => (e.retouch.smearMode === 'blur' || e.retouch.smearMode === 'sharpen' ? 'tBlur' : 'tSmudge'),
.cv-dialog { border: 1px solid #3a3a3a; border-radius: 14px; background: #1c1c1c; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); }
.cv-dialog-head [data-close] { border-radius: 50%; background: #2a2a2a; }
.cv-dialog-foot .cv-btn-primary { border: 1px solid #ebebeb; background: #ffffff; color: #000000; }
.cv-dialog-foot .cv-btn-primary:hover { background: #f2f2f2; color: #000000; }
.cv-dialog-foot .cv-btn-ghost { border: 1px solid #3a3a3a; background: #1c1c1c; color: var(--text-primary); }
.cv-nd-cats { display: flex; flex-direction: column; gap: 2px; padding: 12px 8px; background: #161616; border-right: 1px solid #242424; }
.cv-nd-cat.is-on { background: #2a2a2a; color: var(--text-primary); }
.cv-nd-searchbox { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid #34333a; border-radius: 10px; background: #222127; color: var(--text-muted); }
.cv-nd-card { display: flex; flex-direction: column; gap: 4px; padding: 6px 6px 8px; border: 1px solid #2e2e2e; border-radius: 12px; background: #1c1c1c; color: var(--text-primary); font: inherit; text-align: left; cursor: pointer; min-width: 0; }
.cv-nd-card:hover { border-color: #3a3a3a; }
.cv-nd-card.is-on { border-color: transparent; background: linear-gradient(#1f1d24, #1f1d24) padding-box, linear-gradient(135deg, #aba0d3, #d99ac5) border-box; box-shadow: 0 0 18px rgba(171, 160, 211, 0.18); }
.cv-nd-thumb { display: grid; place-items: center; height: 78px; border-radius: 8px; background: #151515; }
.cv-nd-side { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px; border-left: 1px solid #242424; overflow-y: auto; }
.cv-nd-input { width: 100%; min-width: 0; height: 36px; padding: 0 10px; border: 1px solid #303035; border-radius: 9px; background: #222127; color: var(--text-primary); font: inherit; font-size: 14px; }
.cv-nd-link { width: 30px; height: 30px; margin-bottom: 3px; border: 1px solid #34333a; border-radius: 8px; background: #1c1c1c; color: var(--text-muted); cursor: pointer; }
.cv-nd-link.is-on { background: #2e2b3a; border-color: #4a4658; color: var(--accent-color); }
.cv-nd-seg { display: flex; gap: 2px; width: 100%; padding: 3px; border: 1px solid #303035; border-radius: 9px; background: #1a1a1a; }
.cv-nd-seg button.is-on { background: #3a3a3a; }
.cv-nd-summary { margin-top: auto; padding-top: 12px; border-top: 1px solid #34333a; }
.cv-savechanges .cv-note { margin: 0; padding-bottom: 14px; border-bottom: 1px solid #34333a; color: var(--text-secondary); font-size: 14px; }
.cv-panel-head { background: #000000; border-bottom: 0; height: 40px; }
.cv-panel-title { padding: 5px 11px; border: 1px solid #3a3a3a; border-radius: 8px; background: #2a2a2a; color: var(--text-primary); font-size: 13px; font-weight: 500; text-transform: none; letter-spacing: 0; }
.cv-layer { margin: 3px 8px; border: 1px solid #2a2a2a; border-radius: 8px; background: #1c1c1c; }
.cv-layer:hover { border-color: #34333a; }
.cv-layer.is-active { border-color: #3d3a48; background: linear-gradient(90deg, #2b2b2b 0%, #35333d 55%, #413e4b 100%); color: var(--text-primary); }
.cv-group { display: flex; flex-direction: column; border-bottom: 1px solid #0b0b0b; }
.cv-group-head { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 8px; background: #000000; border-bottom: 0; }
.cv-group-tab.is-active { border-color: #3a3a3a; background: #2a2a2a; color: var(--text-primary); font-weight: 500; }
.cv-group-min { display: inline-grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%; background: #1c1c1c; color: var(--text-secondary); cursor: pointer; }
.cv-group-min:hover { color: var(--text-primary); background: #2a2a2a; }
.cv-slider::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: #2b2a2f; }
.cv-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; background: #ffffff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
.cv-slider::-moz-range-track { height: 4px; border-radius: 2px; background: #2b2a2f; }
.cv-slider::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: #ffffff; }
.cv-nav-card { position: relative; height: clamp(90px, 13vh, 170px); border-radius: 10px; background: #191919; overflow: hidden; }
.cv-nav-zooms { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); display: flex; padding: 3px; border: 1px solid #3a3a3a; border-radius: 12px; background: rgba(31, 31, 31, 0.92); }
.cv-nav-zooms button { height: 24px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: #d4d4d4; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.cv-nav-zooms button:hover { background: #2a2a2a; color: #ffffff; }
.cv-sw-tile { width: 18px; height: 18px; padding: 0; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 3px; cursor: pointer; }
.cv-sw-tile:hover { outline: 1px solid #ffffff; outline-offset: 1px; }
.cv-sw-add { display: inline-grid; place-items: center; background: #1c1c1c; color: var(--text-secondary); }
.cv-kind-icons { display: flex; gap: 1px; padding: 2px; border: 1px solid #34333a; border-radius: 8px; }
.cv-kind-btn.is-on { background: #2e2b3a; color: var(--text-primary); box-shadow: inset 0 0 0 1px #4a4658; }
.cv-vsep { width: 1px; height: 18px; background: #34333a; flex: none; }
.cv-num { display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border: 1px solid #303035; border-radius: 6px; background: #222127; }
.cv-props-col { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; background: #111112; border-left: 1px solid #0b0b0b; }
.cv-props-head { display: flex; align-items: center; gap: 12px; padding: 8px 4px 12px; border-bottom: 1px solid #36343b; }
.cv-props-tile { display: inline-grid; place-items: center; width: 36px; height: 36px; border: 1px solid #34333a; border-radius: 8px; background: #1c1c1c; color: var(--text-secondary); }
.cv-link-btn { display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none; border: 1px solid #34333a; border-radius: 7px; background: #1c1c1c; color: var(--text-muted); cursor: pointer; }
.cv-link-btn.is-on { background: #2e2b3a; border-color: #4a4658; color: var(--accent-color); }
.cv-brush-tip { width: 88px; height: 88px; flex: none; border: 1px solid #34333a; border-radius: 6px; background: #151515; }
.cv-brush-stroke { display: block; width: 100%; height: 56px; border-radius: 6px; background: #1c1c1c; }
.cv-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid #3a3a3a; border-radius: 7px; background: #1c1c1c; color: var(--text-primary); font: inherit; font-size: 13px; cursor: pointer; }
.cv-btn:hover { background: #242424; }
.cv-seg { display: flex; gap: 2px; padding: 3px; border: 1px solid #34333a; border-radius: 9px; background: #151515; }
.cv-seg button.is-on { background: #2e2b3a; color: var(--accent-color); }
.cv-lock-btn.is-on { background: #2e2b3a; color: var(--accent-color); box-shadow: inset 0 0 0 1px #4a4658; }
.cv-brush-find { display: flex; align-items: center; gap: 8px; margin: 10px 0 8px; padding-top: 10px; border-top: 1px solid #34333a; }
.cv-brush-search { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; height: 30px; padding: 0 10px; border: 1px solid #303035; border-radius: 8px; background: #1c1c1c; color: var(--text-muted); }
.cv-brush-views button.is-on { border-color: #3a3a3a; background: #2a2a2a; color: var(--text-primary); }
.cv-brush-folder { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: #1c1c1c; color: var(--text-primary); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.cv-brush-tile:hover { background: #1f1e24; }
.cv-brush-tile.is-on { border-color: #4a4658; background: #2e2b3a; color: var(--text-primary); }
.cv-menu { padding: 6px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; background: rgba(40, 39, 44, 0.86); backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55); }
.cv-menu-item:hover:not(:disabled), .cv-menu-item.is-focus:not(:disabled) { background: rgba(255, 255, 255, 0.1); color: var(--text-primary); }
.cv-menu-sep { height: 1px; margin: 6px 10px; background: rgba(255, 255, 255, 0.12); }
.cv-strip-btn:hover, .cv-strip-btn.is-on { border-color: #34333a; background: #1f1e24; color: var(--text-primary); }
.cv-group-collapse:hover { background: #242328; color: var(--text-primary); }
.cv-props-fly { position: fixed; z-index: var(--z-context); width: 284px; max-height: calc(100vh - 24px); overflow-y: auto; border: 1px solid #3a3a3a; border-radius: 12px; background: #111112; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6); }
.cv-dock-split:hover::after { background: #5a5960; }
.cv-ch-row { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 10px 0 6px; border: 1px solid #2a2a2a; border-radius: 8px; background: #1c1c1c; color: var(--text-primary); font-size: 13px; cursor: pointer; }
.cv-ch-row.is-on { border-color: #4a4658; background: linear-gradient(90deg, #26242d, #413e4b); }
.cv-ch-thumb { width: 44px; height: 30px; border-radius: 4px; background: #2a2a2a; }
.cv-group-more:hover { background: #242328; color: var(--text-primary); }
.cv-home { position: fixed; top: var(--cv-titlebar-h); left: 0; right: 0; bottom: 0; z-index: calc(var(--z-menu) - 1); display: grid; place-items: center; background: #000000; overflow-y: auto; }
.cv-home-brand { display: flex; align-items: baseline; gap: 10px; margin: 0; color: #ffffff; font-size: 38px; font-weight: 400; letter-spacing: -0.015em; }
.cv-home-action { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 8px 0 12px; border: 1px solid #2a2a2a; border-radius: 6px; background: #111111; color: var(--text-primary); font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
.cv-home-action:first-child { width: 210px; border-color: #ebebeb; background: #ffffff; color: #000000; box-shadow: 0 0 22px rgba(255, 255, 255, 0.09); }
.cv-key { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 5px; background: #1a1a1a; color: var(--text-primary); font: inherit; font-size: 12px; }
.cv-home-action:first-child .cv-key { background: #f0f0f0; color: #000000; }
.cv-home-item:hover { border-color: #2a2a2a; background: #111111; color: var(--text-primary); }
.cv-rail { background: linear-gradient(to bottom, #181818 0%, #272430 9%, #2b2739 16%, #252127 24%, #1e1d1e 29%, #1e1d1e 70%, #212027 80%, #2b2639 90%, #302a42 100%); border-right-color: #111111; }
.cv-tool.is-active { background: #2e2b3a; border-color: #4a4658; border-radius: 8px; color: var(--text-primary); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06); }
.cv-titlebar { grid-template-columns: auto auto minmax(0, 1fr) auto auto; background: linear-gradient(to bottom, #1c1c1c, #151515); border-bottom: 1px solid #0b0b0b; }
.cv-tt-btn { display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid #34333a; border-radius: 7px; background: #161616; color: var(--text-secondary); cursor: pointer; }
.cv-tt-btn:hover { color: var(--text-primary); background: #1f1f1f; }
.cv-tt-btn.is-on { border-color: #4a4658; background: #2e2b3a; color: var(--accent-color); }
.cv-tt-select { width: 154px; height: 28px; padding: 0 8px; border: 1px solid #34333a; border-radius: 8px; background: #141414; color: var(--text-primary); font: inherit; font-size: 13px; }
.cv-search-pop { position: absolute; top: 36px; right: 0; z-index: var(--z-menu); width: 340px; padding: 8px; border: 1px solid #3a3a3a; border-radius: 12px; background: #1c1c1c; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55); }
.cv-search-input { width: 100%; height: 32px; padding: 0 10px; border: 1px solid #303035; border-radius: 8px; background: #222127; color: var(--text-primary); font: inherit; font-size: 13px; outline: 0; }
.cv-search-item.is-picked, .cv-search-item:hover { background: #2e2b3a; color: var(--text-primary); }
.cv-tab { border-radius: 8px 8px 0 0; border: 1px solid #2a2a2a; border-bottom-color: transparent; background: #161616; }
.cv-tab.is-active { background: #343434; border-color: #3a3a3a; border-bottom-color: transparent; }
.cv-tab-close { border-radius: 50%; background: #2a2a2a; }
.cv-tab-close:hover { background: #3a3a3a; }
.cv-options { background: #111111; border-bottom-color: #0b0b0b; }
.cv-opt-title { padding: 4px 10px; border: 1px solid #3a3a3a; border-radius: 8px; background: #1f1f1f; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05); }
.cv-doc-tabs { display: flex; align-items: flex-end; height: 34px; padding: 0 8px; background: #111111; border-bottom: 1px solid #0b0b0b; }
.cv-tool.has-group::after { right: 4px; bottom: 4px; width: 4px; height: 4px; border: 0; border-radius: 50%; background: #6f6d76; }
.cv-tool.has-group.is-active::after { background: #c8bafa; }
.cv-flyout { min-width: 220px; padding: 6px; border: 1px solid #3a3a3a; border-radius: 12px; background: #1c1c1c; box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55); }
.cv-flyout-item:hover { background: #2e2b3a; color: var(--text-primary); }
.cv-flyout-key { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 6px; background: #2a2a2a; color: var(--text-primary); font-size: 12px; }
.cv-dd-btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; height: 28px; padding: 0 8px 0 10px; border: 1px solid #34333a; border-radius: 8px; background: #1c1c1c; color: var(--text-primary); font: inherit; font-size: 13px; cursor: pointer; }
.cv-title-tools .cv-dd-btn { width: 154px; background: #141414; }
.cv-dd-pop { position: fixed; z-index: var(--z-context); max-height: 60vh; overflow-y: auto; padding: 6px; border: 1px solid #3a3a3a; border-radius: 12px; background: #1c1c1c; box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55); }
.cv-dd-search { width: 100%; height: 30px; margin-bottom: 6px; padding: 0 10px; border: 1px solid #303035; border-radius: 8px; background: #222127; color: var(--text-primary); font: inherit; font-size: 13px; outline: 0; }
.cv-dd-item.is-picked, .cv-dd-item:hover { background: #2e2b3a; color: var(--text-primary); }
.cv-tool { width: 32px; height: 26px; border-radius: 7px; color: #c9c8ce; }
.cv-tool:hover { color: #ffffff; background: #242328; }
.cv-tool.is-active { width: 32px; height: 28px; margin: 1px 0; color: #ffffff; }
.cv-rail-sep { display: block; width: 6px; height: 2px; margin: 5px auto; border-radius: 1px; background: #4a4950; }
.cv-tool.is-active { color: #c8bafa; }
.cv-opt-icon { display: inline-grid; place-items: center; width: 30px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: #c9c8ce; cursor: pointer; }
.cv-opt-icon:hover { background: #242328; color: #ffffff; }
.cv-opt-sep { display: inline-block; width: 1px; height: 20px; margin: 0 6px; background: #34333a; vertical-align: middle; }
  --accent-color: #aba0d3;
  --accent-color-dim: #aba0d333;
  --accent-color-hover: #c8bafa;
  --accent-tint: rgba(249, 115, 22, 0.06);
  --accent-tint-strong: rgba(249, 115, 22, 0.10);
import { THEMES, readChoice, setAccent, setTheme, themeSwatchesHtml } from './themes';
import { ENGINE_CHOICES, RECOVERY_CHOICES, loadPrefs, savePrefs, type EngineDevice, type Prefs } from './prefs';
    add('General', this.homeRow.el, el('<p class="cv-note">With it on, the Home screen shows whenever no document is open. The brand mark at the top left opens it at any time; Esc leaves it.</p>'));
    add('Interface', row, accentRow, el('<p class="cv-note">Theme and accent are shared with NodeMode on this device.</p>'));
    add('Performance', this.statesRow.el, this.memoryRow.el, this.redrawRow.el,
      el('<p class="cv-note">History States is how many steps undo keeps (Photoshop keeps 50 by default, up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as Photoshop\'s Memory Usage does, so this is the part formvis controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.</p>'),
interface DockState { order: string[]; hidden: string[] }
const DEFAULT: DockState = { order: DOCK_PANELS.map((p) => p.id), hidden: ['timeline', 'history'] };
    const ids = DOCK_PANELS.map((p) => p.id);
    const order = Array.isArray(r.order) ? r.order.filter((id): id is string => ids.includes(id as string)) : [];
    // A panel missing from a saved arrangement (one saved before it could move) takes its default place, not the end.
    for (const id of ids) if (!order.includes(id)) order.splice(Math.min(ids.indexOf(id), order.length), 0, id);
    return { order, hidden };
  } catch { return { ...DEFAULT, order: [...DEFAULT.order] }; }
  private drag: { id: string; startY: number; moving: boolean; target: number } | null = null;
  constructor(private readonly dock: HTMLElement) {
    for (const p of DOCK_PANELS) {
        this.drag = { id: p.id, startY: e.clientY, moving: false, target: -1 };
  reset(): void { this.state = { order: [...DEFAULT.order], hidden: [...DEFAULT.hidden] }; this.heights = {}; this.saveHeights(); this.save(); }
    this.state = { order: o, hidden: hidden.filter((id) => ids.includes(id)) };
    const p = DOCK_PANELS.find((x) => x.id === id);
    return p ? this.dock.querySelector<HTMLElement>(p.selector) : null;
    for (const id of this.state.order.filter((x) => this.isShown(x))) {
    const first = this.state.order.find((x) => this.isShown(x)), head = first ? this.section(first)?.querySelector(':scope > .cv-panel-head') : null;
    const want = this.state.order.map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    for (const id of this.state.order) { const s = this.section(id); if (s) setHidden(s, !this.isShown(id)); }
    return this.state.order.filter((id) => this.isShown(id)).map((id) => ({ id, s: this.section(id) })).filter((x): x is { id: string; s: HTMLElement } => !!x.s);
    if (!d.moving) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const shown = this.state.order.filter((id) => this.isShown(id)).map((id) => this.section(id)).filter((s): s is HTMLElement => !!s);
    const box = this.dock.getBoundingClientRect();
    let best = 0, bestDist = Infinity, y = 0;
    this.marker.style.top = `${Math.round(y - box.top - 1)}px`;
    const shown = this.state.order.filter((id) => this.isShown(id));
    const rest = this.state.order.filter((id) => id !== d.id);
    const at = before && before !== d.id ? rest.indexOf(before) : before === d.id ? this.state.order.indexOf(d.id) : rest.length;
    rest.splice(at, 0, d.id);
    this.state.order = rest;
  document.getElementById('overlay-root')?.appendChild(pop) ?? document.body.appendChild(pop);
        const row = el(`<div class="cv-history-row" role="option"><span class="cv-history-icon">${icon(r.snap ? 'camera' : r.index === 0 ? 'image' : 'history', 12)}</span><span class="cv-history-name"></span></div>`);
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><div class="cv-group-tabs" role="tablist"><button class="cv-group-tab is-active" type="button" role="tab" data-tab="layers">Layers</button><button class="cv-group-tab" type="button" role="tab" data-tab="channels">Channels</button><button class="cv-group-tab" type="button" role="tab" data-tab="paths">Paths</button></div><span></span><button class="cv-group-more cv-layers-more" type="button" data-cmd="panel-menu" title="Panel menu" aria-label="Panel menu">${icon('more3', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="add-mask">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="clip">${icon('clipMask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-layer">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="delete-layer">${icon('delete', 16)}</button></div></section>`);
      engine.pan(v.width / 2 - x * v.zoom - v.panX, v.height / 2 - y * v.zoom - v.panY);
    for (const t of list) {
      const btn = el<HTMLButtonElement>('<button class="cv-group-tab" type="button" role="tab"></button>');
      setText(btn, t.label);
      btn.dataset.tab = t.id;
      btn.addEventListener('click', () => this.show(t.id));
      strip.appendChild(btn);
      t.body.classList.add('cv-group-page');
      body.appendChild(t.body);
      this.tabs.set(t.id, { btn, body: t.body });
    }
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number; engineDevice: EngineDevice }
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024, engineDevice: 'auto' };
    const host = this.root, groups = Array.from(host.querySelectorAll<HTMLElement>(':scope > .cv-group'));
    const ICONS: Record<string, [string, string]> = { properties: ['panelProps', 'Properties'], brushes: ['tBrush', 'Brushes'], paragraph: ['pilcrow', 'Paragraph'], character: ['charA', 'Character'] };
    for (const g of groups) {
      const id = Array.from(g.classList).find((c) => c.startsWith('cv-') && c !== 'cv-group')?.slice(3) ?? '';
      const [ic, label] = ICONS[id] ?? ['panelProps', id];
      const b = el<HTMLButtonElement>(`<button class="cv-strip-btn" type="button" title="${label}" aria-label="${label}">${icon(ic, 18)}</button>`);
      b.dataset.group = id;
      b.addEventListener('click', () => {
        if (open?.group === g) { closeFly(); return; }
        closeFly();
        const mark = document.createComment(id);
        g.replaceWith(mark);
        fly.appendChild(g);
        setHidden(fly, false);
        open = { group: g, mark, btn: b };
        b.classList.add('is-on');
        const r = b.getBoundingClientRect(), s = strip.getBoundingClientRect();
        fly.style.right = `${Math.round(window.innerWidth - s.left + 6)}px`;
        fly.style.top = `${Math.round(Math.max(8, Math.min(r.top, window.innerHeight - fly.offsetHeight - 8)))}px`;
      });
      strip.appendChild(b);
    }
      closeFly();
      host.classList.toggle('is-collapsed', on);
      this.onLayout();
    const head = groups[0]?.querySelector('.cv-group-head'), min = head?.querySelector('.cv-group-min');
    const collapse = el<HTMLButtonElement>(`<button class="cv-group-collapse" type="button" title="Collapse to icons" aria-label="Collapse to icons">${icon('collapseRight', 14)}</button>`);
    if (min) min.after(collapse); else head?.appendChild(collapse);
    host.classList.toggle('is-collapsed', PropertiesColumn.collapsed());
        for (let i = 0; i < p.tip.data.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 240; img.data[i * 4 + 3] = p.tip.data[i]; }
        gr.addColorStop(0, 'rgba(240,240,244,1)'); gr.addColorStop(Math.min(0.999, Math.max(0, p.hardness)), 'rgba(240,240,244,1)'); gr.addColorStop(1, 'rgba(240,240,244,0)');
      const k = [view, q0, e.brushPresetId, [...shut].join(','), allBrushPresets().map((p) => p.id).join(',')].join('|');
      grad.addColorStop(0, 'rgba(236,236,240,1)'); grad.addColorStop(Math.min(0.999, Math.max(0, hard)), 'rgba(236,236,240,1)'); grad.addColorStop(1, 'rgba(236,236,240,0)');
        tg.strokeStyle = 'rgba(255,255,255,0.18)'; tg.lineWidth = dpr; tg.beginPath(); tg.moveTo(cx - R * 1.2, cy); tg.lineTo(cx + R * 1.2, cy); tg.moveTo(cx, cy - R * 1.2); tg.lineTo(cx, cy + R * 1.2); tg.stroke();
        tg.strokeStyle = '#f0f0f4'; tg.lineWidth = 1.5 * dpr; tg.beginPath(); tg.ellipse(cx, cy, R, ry, a, 0, Math.PI * 2); tg.stroke();
        tg.fillStyle = '#ffffff';
import { el, q, setClass, setHtml, setText, setTitle, setValue } from './dom';
      const b = el<HTMLButtonElement>(`<button class="cv-tool${group.tools.length > 1 ? ' has-group' : ''}" type="button" aria-haspopup="${group.tools.length > 1 ? 'menu' : 'false'}"></button>`);
      if (group.tools.length > 1) {
      setTitle(node, t.id === 'brush' ? 'Brush (B) · Eraser (E)' : group.tools.length > 1 ? `${t.label} (${group.key}) · hold or right-click for ${group.tools.length} tools · Shift+${group.key} cycles` : `${t.label} (${group.key})`);
    if (this.flyoutFor !== group) {
      this.flyout.textContent = '';
      for (const t of group.tools) {
        const row = el<HTMLButtonElement>(`<button class="cv-flyout-item" role="menuitem" type="button">${icon(t.icon(this.engine), 16)}<span class="cv-flyout-label"></span><span class="cv-flyout-key"></span></button>`);
        setText(q(row, '.cv-flyout-label'), t.label);
        setText(q(row, '.cv-flyout-key'), group.key);
        row.dataset.tool = t.id;
        row.addEventListener('click', () => { this.closeFlyout(); this.engine.setTool(t.id); if (t.id === 'brush') this.engine.setBrushMode('paint'); });
        this.flyout.appendChild(row);
      }
      this.flyoutFor = group;
    for (const row of Array.from(this.flyout.children) as HTMLElement[]) setClass(row, 'is-active', row.dataset.tool === this.engine.tool);
    const key = `${this.dpr}|${pal.checkerA}|${pal.checkerB}`;
    const cell = Math.max(1, Math.round(8 * this.dpr));
        { a: this.rgb(pal.checkerA), b: this.rgb(pal.checkerB), cell: Math.max(1, Math.round(8 * this.dpr)), origin: [Math.round(ox), Math.round(oy)] });
        g.strokeStyle = pal.grid;
      g.strokeStyle = pal.accent;
    const v = (this.engine.current as NonNullable<Engine['current']>).viewport, pal = paint(), d = this.dpr, step = Stage.rulerStep(v.zoom);
    const minor = step * v.zoom >= 150 ? step / 10 : step / 5;
      const first = Math.floor(-pan / v.zoom / minor) * minor;
      for (let t = first; t * v.zoom + pan <= len; t += minor) {
        const s = Math.round(t * v.zoom + pan) + 0.5, isMajor = Math.abs(t / step - Math.round(t / step)) < 1e-6, tick = isMajor ? RULER : RULER / 3;
    if (sel || fl) {
      if (e.ctrlKey || e.metaKey) {
  it('starts from the same default theme and accent: Studio Dark, lavender', () => {
    expect([DEFAULT_THEME, DEFAULT_ACCENT]).toEqual(['studio', '#aba0d3']);
      expect(readChoice()).toEqual({ theme: 'studio', accentColor: '#aba0d3' });
      saveChoice({ theme: 'mono', accentColor: '#ff0000' });                                         // chosen after the redesign
      expect(readChoice()).toEqual({ theme: 'mono', accentColor: '#ff0000' });
      expect(html).toContain('if (s.appearance === 2)');                                              // the boot script agrees
export const DEFAULT_ACCENT = '#aba0d3';
export interface ThemeChoice { theme: string; accentColor: string }
 *  redesign reaches everyone; anything chosen since is saved with it and kept. index.html's boot script agrees. */
export const APPEARANCE = 2;
      if (saved.appearance === APPEARANCE) return { theme: saved.theme || DEFAULT_THEME, accentColor: saved.accentColor || DEFAULT_ACCENT };
  return { theme: DEFAULT_THEME, accentColor: DEFAULT_ACCENT };
```

Nothing removed from src-tauri or backend.

## The owner's walkthrough corrections · _v1.48.0 (ui/channels.ts new; extensions/tools/*.ts icon lines, move.ts, tone.ts; extensions/registry.ts; ui/icons.ts, ui/rail.ts, ui/options.ts, ui/menu.ts, ui/properties.ts, ui/dock.ts, ui/layers.ts, ui/panel-group.ts, ui/navigator.ts, ui/swatches.ts, app.ts; engine/index.ts, engine/brush-dynamics.ts; styles)

Tool icons (`tMove` ... `tZoom`) and the rail's family dashes; the options bar's tool chip, compact buttons and the Move bar (`autoSelectTarget`); `PopupMenu` `has-checks`; the Brushes group (presets in folders, search, grid or list, Load, the tip editor, a Brush Settings tab), `BrushPreset.angle`/`roundness`, the Flat angled preset; `PropertiesColumn.collapsible`; `Dock` splitters, `sizeGroups`, `setCollapsed`; `ChannelsPanel`; `PanelGroup.setMenu`, `menuHost`; `SwatchesPanel.addForeground`, `reset`; commands `load-brushes`, `swatch-add`, `swatches-reset`. Removed from frontend:

```text
  new PropertiesColumn(q(root, '.cv-props-col'), engine, (c) => { commands.run(c); });
  const syncPropsCol = (): void => { setHidden(q(root, '.cv-props-col'), !propsShown()); setStyleVar(root, '--cv-props-w', propsShown() ? '284px' : '0px'); };
  new SwatchesPanel(q(root, '.cv-layers'), engine);
export interface BrushPreset { id: string; name: string; description: string; diameter: number; hardness: number; opacity: number; dynamics: BrushDynamics; tip?: SampledTip }
type Settings = Pick<Engine, 'selectionMode' | 'marqueeKind' | 'lassoKind' | 'showPixelGrid' | 'showTransformControls' | 'autoSelect' | 'lockRatio'>;
  | { kind: 'button'; label: string; icon?: string; run: () => void }
  icon: (e) => (e.brushMode === 'erase' ? 'eraser' : 'brush'),
  icon: () => 'bucket',
  icon: () => 'duplicate',
  icon: () => 'crop',
  icon: () => 'penTool',
  icon: () => 'directSelectTool',
  icon: () => 'eyeDropper',
  icon: () => 'paintbrush',
  icon: () => 'gradient',
  icon: () => 'hand',
  icon: () => 'sparkle',
  icon: () => 'healBrushTool',
  icon: (e) => (e.lassoKind === 'polygonal' ? 'lassoSelect' : 'lasso'),
  icon: (e) => (e.marqueeKind === 'ellipse' ? 'ellipseSelect' : 'marquee'),
import { digitOf, type Tool, type ToolContext, type ToolPointer } from '../registry';
  icon: () => 'cursor',
    if (p.mod || e.autoSelect) { const id = e.layerAt(p.doc); if (id) e.selectLayer(id); }
      { kind: 'toggle', label: 'Auto-select', get: () => e.autoSelect, set: (v) => e.update({ autoSelect: v }) },
      { kind: 'toggle', label: 'Transform controls', get: () => e.showTransformControls, set: (v) => e.update({ showTransformControls: v }) },
      { kind: 'toggle', label: 'Keep proportions', get: () => e.lockRatio, set: (v) => e.update({ lockRatio: v }) },
      { kind: 'number', label: 'X', get: () => t()?.x ?? null, set: (v) => e.setLayerTransform({ x: v }, 'Move Layer') },
      { kind: 'number', label: 'Y', get: () => t()?.y ?? null, set: (v) => e.setLayerTransform({ y: v }, 'Move Layer') },
      { kind: 'number', label: 'W', min: 1, get: () => t()?.w ?? null, set: (v) => e.resizeLayerTo(v, true) },
      { kind: 'number', label: 'H', min: 1, get: () => t()?.h ?? null, set: (v) => e.resizeLayerTo(v, false) },
      { kind: 'number', label: 'Scale', unit: '%', min: 1, get: () => { const l = e.activeLayer, tt = t(); return l?.raster && tt ? (tt.w / l.raster.width) * 100 : null; }, set: (v) => e.scaleLayerTo(v) },
      { kind: 'number', label: 'Angle', unit: '\u00b0', get: () => t()?.rotation ?? null, set: (v) => e.setLayerTransform({ rotation: v }, 'Rotate Layer') },
      { kind: 'segment', label: 'Sampling', choices: [{ id: 'nearest', label: 'Nearest' }, { id: 'smooth', label: 'Smooth' }, { id: 'high', label: 'High quality' }], get: () => t()?.sampling ?? 'high', set: (v) => e.setLayerTransform({ sampling: v as Transform['sampling'] }, 'Layer Sampling') },
      { kind: 'button', label: 'Flip horizontal', icon: 'flipH', run: () => e.flipLayers(true) },
      { kind: 'button', label: 'Flip vertical', icon: 'flipV', run: () => e.flipLayers(false) },
  icon: () => 'objectSelect',
  icon: () => 'patchTool',
  icon: () => 'cursor',
  icon: () => 'penTool',
  icon: () => 'quickSelect',
  icon: () => 'eraser',
  icon: (e) => (e.shapeSettings.kind === 'ellipse' || e.shapeSettings.kind === 'heart' ? 'circleTool' : 'rectTool'),
  icon: (e) => (e.retouch.smearMode === 'blur' || e.retouch.smearMode === 'sharpen' ? 'blurTool' : 'smudge'),
    icon: () => id,
  icon: () => 'typeTool',
  icon: () => 'wandSelect',
  icon: () => 'zoomIn',
.cv-layers-panel.is-paths-tab { grid-template-rows: auto minmax(0, 1fr); }
.cv-layers-panel.is-paths-tab > .cv-layer-props, .cv-layers-panel.is-paths-tab > .cv-layer-list, .cv-layers-panel.is-paths-tab > .cv-panel-foot { display: none; }
  reset(): void { this.state = { order: [...DEFAULT.order], hidden: [...DEFAULT.hidden] }; this.save(); }
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><div class="cv-group-tabs" role="tablist"><button class="cv-group-tab is-active" type="button" role="tab" data-tab="layers">Layers</button><button class="cv-group-tab" type="button" role="tab" data-tab="paths">Paths</button></div><span></span><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
    for (const t of root.querySelectorAll<HTMLButtonElement>('.cv-layers-panel .cv-group-tab')) t.addEventListener('click', () => this.showTab(t.dataset.tab as 'layers' | 'paths'));
    let tab: 'layers' | 'paths' = 'layers';
    try { tab = (JSON.parse(localStorage.getItem('formvis.groups') ?? '{}') as Record<string, { tab?: string }>).layers?.tab === 'paths' ? 'paths' : 'layers'; } catch { /* layers */ }
    this.showTab(tab, false);
  showTab(tab: 'layers' | 'paths', remember = true): void {
        const n = el('<span class="cv-opt-title"></span>');
        setText(n, spec.text);
    this.root = el(`<section class="cv-${id} cv-group" aria-label="${label}"><div class="cv-panel-head cv-group-head"><div class="cv-group-tabs" role="tablist"></div><span></span><button class="cv-group-min" type="button" data-cmd="minimise" title="Minimise" aria-label="Minimise">${icon('minus', 12)}</button></div><div class="cv-group-body"></div></section>`);
  constructor(host: HTMLElement, private readonly engine: Engine, run: (cmd: string) => void) {
      <div class="cv-brush-stroke-head"><span>Stroke preview</span></div><canvas class="cv-brush-stroke" aria-label="Stroke preview"></canvas>
      <div class="cv-brush-actions"><button class="cv-btn" type="button" data-run="brush-settings">${icon('sliders', 14)}<span>Brush Settings</span></button></div>
    const sliders = body.querySelector('.cv-brush-sliders') as HTMLElement;
    const rows = [
      { label: 'Size', unit: 'px', min: 1, max: 1000, step: 1, get: () => e.brush.diameter, put: (v: number) => e.setBrush({ diameter: Math.round(v) }), toS: (v: number) => (Math.log(v) / LOG) * 1000, fromS: (s: number) => Math.exp((s / 1000) * LOG) },
      { label: 'Hardness', unit: '%', min: 0, max: 100, step: 1, get: () => e.brush.hardness * 100, put: (v: number) => e.setBrush({ hardness: v / 100 }), toS: (v: number) => v * 10, fromS: (s: number) => s / 10 },
    ];
    for (const r of rows) {
      const row = el(`<div class="cv-brush-row"><div class="cv-brush-row-head"><span>${r.label}:</span></div><input class="cv-slider" type="range" min="0" max="1000" step="1" aria-label="${r.label}"></div>`);
      const field = numField(r.unit, r.label, r.min, r.max, r.step, r.put), slider = row.querySelector('input') as HTMLInputElement;
      slider.addEventListener('input', () => r.put(Math.min(r.max, Math.max(r.min, r.fromS(Number(slider.value))))));
      setters.push(() => { field.set(r.get()); if (document.activeElement !== slider) slider.value = String(Math.round(r.toS(Math.max(r.min, r.get())))); });
      sliders.appendChild(row);
    }
    (body.querySelector('[data-run]') as HTMLElement).addEventListener('click', () => run('brush-settings'));
    new PanelGroup(this.root, 'brushes', [{ id: 'brushes', label: 'Brushes', body }], 'Brushes');
      const hard = e.brush.hardness;
      const tg = tip.getContext('2d') as CanvasRenderingContext2D;
        dab(tg, cx, cy, R, hard);
    this.refreshers.push(() => { for (const s of setters) s(); requestAnimationFrame(paint); });
    add.addEventListener('click', () => { const c = hex(this.engine.fg); if (!this.list.includes(c)) { this.list.push(c); this.save(); this.renderGrid(); } });
```

Nothing removed from src-tauri or backend.

## The target's layout and experience · _v1.47.0 (Phase 21 steps 2 to 6: ui/panel-group.ts, ui/navigator.ts, ui/swatches.ts, ui/properties.ts, ui/titlebar-tools.ts, ui/native-menu.ts, ui/dropdown.ts new; ui/layers.ts, ui/dock.ts, ui/menu.ts, ui/dialogs.ts, ui/app-dialogs.ts, ui/tabs.ts, ui/icons.ts, app.ts, engine/index.ts, engine/renderer.ts, engine/types.ts, io/project-io.ts, io/psd.ts, extensions/tools/type.ts, styles; src-tauri/capabilities/default.json)

`PanelGroup`; `NavigatorPanel`; `SwatchesPanel`; `PropertiesColumn`; `TitleTools` (`WORKSPACES`); `NativeMenus` (`accelerator`, `wantsNativeMenus`); `enhanceSelect`; `LayersPanel` (`KINDS`, `kindOf`, `LOCKS`, `BLEND_GROUPS`, `adoptPaths`, `showTab`); `Dock.arrange`, `Dock.locked`; `askSaveChanges`; `NewCanvasDialog` rebuilt (`PRESET_GROUPS`); `Engine.setFill`, `Engine.setLocks`, `Layer.fill`, `Layer.locks`, `newDocument`'s resolution; `setType` exported. Removed from frontend:

```text
import { anyDialogOpen, confirmAction, promptName } from './ui/dialogs';
<div class="cv-tabs"><div class="cv-tab-strip" role="tablist"></div><button class="cv-icon-btn" type="button" data-cmd="new">${icon('add', 16)}</button></div>
    if (p.modified && !(await confirmAction('Close without saving?', `${p.name} has changes that are not saved.`, 'Close', true))) return;
    { label: 'Window', items: ['brush-settings', 'paragraph-styles', '-', ...DOCK_PANELS.map((pn) => `panel-${pn.id}`), '-', 'reset-panels'] },
    if (e.button !== 0) return;
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, type ParagraphStyle, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
  notice(text: string, kind: Notice['kind'] = 'info'): void { this.emit('notice', { kind, text }); }
  newDocument(width: number, height: number, name = 'Untitled', fill: 'transparent' | 'white' | 'background' = 'transparent'): Project | null {
    const base: Doc = { id: uid(), width, height, resolution: 72, layers: [] };
          layers.push({ image: null, lut, mask, clip, folders, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
        layers.push({ image: null, lut: lut3, lut3: true, mask, clip, folders, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: o?.opacity ?? l.opacity, blend: o?.blend ?? l.blend, mask, clip, folders });
  private paintable(l: Layer | null): l is Layer { return !!l && !l.isGroup && !l.adjustment; }
    const op: GlobalCompositeOperation = pick.target === 'mask' ? (white ? 'source-over' : 'destination-out') : this.brushMode === 'erase' ? 'destination-out' : 'source-over';
    const color = pick.target === 'mask' ? { r: 255, g: 255, b: 255 } : this.fg;
    const s = new PixelStroke(pick.raster, pick.local, style, 'source-over', p.selection, texture, pick.target === 'mask');
      if (layer.adjustment) { this.adjust(job, ctx, layer, own, folders, base, map, clipCache, W, H, opacity); continue; }
        this.draw(ctx, src, m, t.sampling, opacity, op, job.quality);
      if (pixelBlend) this.pixelBlend(ctx, a, mode, opacity, m, src, job.view, W, H);
        ctx.globalAlpha = opacity;
function setType(e: Engine, patch: Partial<TextSpec>): void {
      const layer = adj ? newLayer(name, doc, { adjustment: adj, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend })
        : newLayer(name, doc, { raster, parentId, transform: { ...docTransform(w, h), x: pl.left ?? 0, y: pl.top ?? 0 }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend });
      const out: PsdLayer = { name: l.name, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, adjustment };
    const out: PsdLayer = { name: l.name, left: px.x, top: px.y, canvas: px.c, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId };
.cv-main { display: grid; grid-template-columns: var(--cv-rail-w) minmax(0, 1fr) 6px var(--cv-layers-w); min-height: 0; }
  --cv-layers-w: 264px;
const PRESETS: ReadonlyArray<[string, number, number]> = [
  ['HD 1920 \u00d7 1080', 1920, 1080], ['4K 3840 \u00d7 2160', 3840, 2160], ['Square 2048', 2048, 2048],
  ['Portrait 1080 \u00d7 1350', 1080, 1350], ['A4 at 300 ppi', 2480, 3508], ['Letter at 300 ppi', 2550, 3300],
  private readonly name = el<HTMLInputElement>('<input class="cv-input" type="text" value="Untitled" spellcheck="false">');
  private readonly preset = el<HTMLSelectElement>(`<select class="cv-input"><option value="">Custom</option>${PRESETS.map(([label], i) => `<option value="${i}">${label}</option>`).join('')}</select>`);
  private readonly width = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="30000" step="1" value="1920">');
  private readonly height = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="30000" step="1" value="1080">');
  private readonly fill = el<HTMLSelectElement>('<select class="cv-input"><option value="transparent">Transparent</option><option value="white">White</option><option value="background">Background color</option></select>');
    super('New Canvas', 420);
    this.field('Name', this.name);
    this.field('Preset', this.preset);
    this.field('Width (px)', this.width);
    this.field('Height (px)', this.height);
    this.field('Contents', this.fill);
    this.body.appendChild(el('<p class="cv-note">Each side 1 to 30,000 px, 100 megapixels at most.</p>'));
    this.preset.addEventListener('change', () => {
      const p = PRESETS[Number(this.preset.value)];
      if (!this.preset.value || !p) return;
      this.width.value = String(p[1]);
      this.height.value = String(p[2]);
    });
    for (const i of [this.width, this.height]) i.addEventListener('input', () => { this.preset.value = ''; });
    for (const i of [this.name, this.width, this.height]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.create(); } });
    this.open(this.width);
    this.width.select();
    const w = Number(this.width.value), h = Number(this.height.value);
    if (this.engine.newDocument(w, h, this.name.value.trim() || 'Untitled', fill)) this.close();
  { id: 'paths', label: 'Paths', selector: '.cv-paths' },
const DEFAULT: DockState = { order: DOCK_PANELS.map((p) => p.id), hidden: [] };
    const hidden = Array.isArray(r.hidden) ? r.hidden.filter((id): id is string => ids.includes(id as string)) : [];
        if (e.button !== 0 || (e.target as HTMLElement).closest('[data-cmd]')) return;
        head.setPointerCapture(e.pointerId);
  reset(): void { this.state = { order: [...DEFAULT.order], hidden: [] }; this.save(); }
  private readonly opacityOut: HTMLElement;
  private opacityDrag = false;
      `<section class="cv-layers-panel" aria-label="Layers"><div class="cv-panel-head"><span class="cv-panel-title">${icon('layers', 14)}Layers</span><span></span><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
      `<div class="cv-layer-props"><select class="cv-select cv-blend" title="Blend mode" aria-label="Blend mode">${BLEND_MODES.map((b) => `<option value="${b.id}">${b.label}</option>`).join('')}</select>` +
      `<label class="cv-opacity" title="Opacity"><input class="cv-opacity-range" type="range" min="0" max="100" step="1" value="100" aria-label="Opacity"><span class="cv-readout cv-opacity-out">100%</span></label></div>` +
    this.opacity = q<HTMLInputElement>(root, '.cv-opacity-range');
    this.opacityOut = q(root, '.cv-opacity-out');
    this.opacity.addEventListener('pointerdown', () => { this.opacityDrag = true; engine.beginOpacityEdit(); });
    this.opacity.addEventListener('input', () => {
      const v = Number(this.opacity.value) / 100;
      setText(this.opacityOut, `${this.opacity.value}%`);
      if (this.opacityDrag) engine.setOpacityLive(v);
      else engine.setOpacity(v);
    const endOpacity = (): void => { if (!this.opacityDrag) return; this.opacityDrag = false; engine.endOpacityEdit(); };
    this.opacity.addEventListener('change', endOpacity);
    this.opacity.addEventListener('pointerup', endOpacity);
    const entries = p ? hierarchy(p.doc, true, p.collapsed) : [];
    setHidden(this.empty, entries.length > 0);
    if (!this.opacityDrag) { setValue(this.opacity, pct); setText(this.opacityOut, `${pct}%`); }
    const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - h - 4));
      `<div class="cv-panel-head"><button class="cv-paths-toggle" type="button" aria-expanded="true"><span class="cv-paths-chevron">${icon('chevronDown', 12)}</span>${icon('penTool', 14)}<span>Paths</span></button><span></span>` +
      `<div class="cv-paths-body"><div class="cv-path-list"><div class="cv-path-rows" role="listbox" aria-label="Paths"></div><div class="cv-paths-empty">No paths. Draw one with the Pen (P).</div></div>` +
        const n = el(`<div class="cv-tab" role="tab"><span class="cv-tab-dot"></span><span class="cv-tab-name"></span><button class="cv-tab-close" type="button" aria-label="Close tab">${icon('close', 12)}</button></div>`);
```

Removed from src-tauri:

```text
  "description": "Window chrome only. The app itself talks HTTP to its engine and uses no Tauri IPC.",
```

## The start screen, and the redesign reaching everyone · _v1.46.0 (index.html, src/ui/themes.ts, src/ui/themes.test.ts, src/ui/home.ts, src/styles/shell.css, src/styles/panels.css; e2e/test_home_screen.py)

Phase 21: `APPEARANCE` (2) in `themes.ts` and index.html's boot script, so a choice saved before Studio Dark is set aside once; `HomeScreen` rebuilt to the target's start screen (`recentBox` replaces `empty`); the Home CSS block replaced; panel headers, layer rows and the tool column restyled in appended blocks. Removed:

```text
        page.locator(".cv-home-action", has_text="New file").click()                 # New file runs File > New
    if (raw) { var s = JSON.parse(raw); if (s.theme && PROFILES[s.theme]) theme = s.theme; if (s.accentColor) accent = s.accentColor; }
.cv-home { position: absolute; inset: 0; z-index: var(--z-chrome); display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: var(--space-6); padding: var(--space-6); background: var(--bg-primary); overflow-y: auto; }
.cv-home-side { display: flex; flex-direction: column; gap: var(--space-2); }
.cv-home-action { display: inline-flex; align-items: center; gap: var(--space-2); height: var(--ctl-lg, 36px); padding: 0 var(--space-3); border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary); font-size: var(--fs-12); white-space: nowrap; cursor: pointer; }
.cv-home-action:first-child { background: var(--accent-color); border-color: var(--accent-color); color: var(--text-on-accent); }
.cv-home-action:hover { border-color: var(--accent-color); }
.cv-home-main { min-width: 0; }
.cv-home-title { margin: 0 0 var(--space-3); color: var(--text-primary); font-size: var(--fs-14, 14px); font-weight: 600; }
.cv-home-item { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); height: 40px; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); font-size: var(--fs-12); text-align: left; cursor: pointer; }
.cv-home-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.cv-home-date { color: var(--text-muted); font-size: var(--fs-11); }
.cv-home-empty { color: var(--text-muted); font-size: var(--fs-12); }
.cv-home-empty[hidden] { display: none; }
  private readonly empty = el('<p class="cv-home-empty">Projects you save or open appear here.</p>');
    const side = el('<div class="cv-home-side"></div>');
    for (const [label, cmd, ic] of [['New file', 'new', 'newFile'], ['Open', 'open', 'folderOpen']] as const) {
      const b = el<HTMLButtonElement>(`<button class="cv-home-action" type="button">${icon(ic, 16)}<span></span></button>`);
      setText(b.querySelector('span') as HTMLElement, label);
      side.appendChild(b);
    const main = el('<div class="cv-home-main"><h2 class="cv-home-title">Recent</h2></div>');
    main.append(this.list, this.empty);
    this.root.append(side, main);
    setHidden(this.empty, names.length > 0);
import { DEFAULT_ACCENT, DEFAULT_THEME, THEMES } from './themes';
      const saved = JSON.parse(raw) as Partial<ThemeChoice>;
      return { theme: saved.theme || DEFAULT_THEME, accentColor: saved.accentColor || DEFAULT_ACCENT };
    const merged = { ...(raw ? JSON.parse(raw) : {}), ...choice };
```

## The target palette, Studio Dark · _v1.45.0 (index.html, src/ui/themes.ts, src/ui/themes.test.ts new, src/styles/tokens.css, src/styles/shell.css, src/ui/panels/gradient-editor.ts)

Phase 21 step 1 (UI_SPEC.md): the 'studio' profile, measured from the owner's screenshots, the default in `themes.ts` and in index.html's boot script (`DEFAULT_THEME`, `DEFAULT_ACCENT`, `PROFILES`); `tokens.css` defaults to match, the system face and SF Mono first, `--cv-checker-b` #cccccc; the stage's dot grid from `--grid-color`; the gradient editor's selected stop from `--accent-color`. Removed:

```text
  var DEFAULT_THEME = 'nodemode-dark';
  var DEFAULT_ACCENT = '#f97316';
  /* ── accent (settings-driven in the app; --accent-color-dim is accent + 33 alpha) ── */
  --accent-color: #f97316;
  --accent-color-dim: #f9731633;
  --accent-color-hover: #ea580c;
  /* ── surfaces (theme-owned; nodemode-dark profile values) ── */
  --bg-primary: #0a0a0a;
  --bg-secondary: #121218;
  --bg-tertiary: #1a1a24;
  --bg-node: #121218;
  --border-color: #2a2a35;
  --border-light: #3a3a48;
  --text-primary: #e8e8ee;
  --text-secondary: #a8a8b8;
  --text-muted: #6a6a7a;
  --canvas-bg: #0a0a0a;
  --grid-color: rgba(255,255,255,0.04);
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --cv-checker-b: #d8d8de;
      h.strokeStyle = i === this.sel ? '#f97316' : '#888';
export const DEFAULT_THEME = 'nodemode-dark';
export const DEFAULT_ACCENT = '#f97316';
  if (Number.isNaN(n)) return `rgba(249,115,22,${alpha})`;
```

## The native GPU renderer · _v1.44.0 (native/formvis-render new; src-tauri/src/native.rs new, src-tauri/src/main.rs, src-tauri/Cargo.toml; src/gpu/native-display.ts new, src/gpu/probe.ts, src/gpu/display.ts, src/ui/stage.ts, src/ui/prefs.ts, src/styles/shell.css, src/app.ts; setup/test, setup/test.bat, setup/line_counts.py; e2e/test_native_display.py new)

native/formvis-render (Rust, wgpu 30): `Gpu` (`new`, `for_window`), `TiledLayer` (`dab`, `write`, `read`), `composite` (`Blender`, `Stack`, `Source`, `Clip`, `Lut`, `Affine`, `blend.wgsl` shared with the web shader), `budget`, `display` (`Display`, `View`, `Checker`), `document` (`Document`, `LayerSpec`), `bin/brush_bench`, `examples/window`. Shell: `native.rs` (`native_start` ... `native_present`), registered in `main.rs`. App: `NativeDisplay`; `ScreenDisplay.unsupported` and `document`; 'native' in `probe.ts` and `prefs.ts`. Removed from frontend/src:

```ts
  let gpuDisplay: ScreenDisplay | null = null, gpuKind: 'webgpu' | 'webgl2' | null = null, gpuStarting = false;
  const gpuFailed = new Set<'webgpu' | 'webgl2'>();
    const pr = loadPrefs(), ch = chooseRenderer(gpuProbe, pr.useGpu, pr.renderer), name = ch.adapter ? `${ch.adapter.name}${ch.adapter.software ? ' (software)' : ''}` : '';
      if (want === 'webgpu') void GpuDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-gpu:not(.cv-scene-gl)')).then(started);
    const live = off ? null : gpuDisplay, api = ch.mode === 'webgl2' ? 'WebGL2' : 'WebGPU';
export type GpuRenderer = 'auto' | 'webgpu' | 'webgl2' | 'cpu';
export type GpuMode = 'webgpu' | 'webgl2' | 'cpu';
export interface GpuProbe { webgpu: GpuAdapter | null; webgl2: GpuAdapter | null }
export const RENDERER_CHOICES: ReadonlyArray<readonly [GpuRenderer, string]> = [['auto', 'Automatic'], ['webgpu', 'WebGPU'], ['webgl2', 'WebGL2'], ['cpu', 'CPU']];
  return { webgpu, webgl2 };
  if (hardware) return { mode: hardware.api, adapter: hardware, reason: want === 'auto' ? 'automatic' : `${want === 'webgpu' ? 'WebGPU' : 'WebGL2'} is not available here` };
  return { mode: 'cpu', adapter: null, reason: p.webgpu || p.webgl2 ? 'only a software GPU was found, which is slower than the CPU renderer' : 'no graphics processor was found' };
export const modeLabel = (m: GpuMode): string => (m === 'webgpu' ? 'WebGPU' : m === 'webgl2' ? 'WebGL2' : 'CPU');
      renderer: r.renderer === 'webgpu' || r.renderer === 'webgl2' || r.renderer === 'cpu' || r.renderer === 'auto' ? r.renderer : DEFAULT_PREFS.renderer,
      const reason = documentFallback(gl, W, H, { maxTexture: this.gpu.maxTexture, memoryBytes: this.gpuLimit });
```

Removed from setup and src-tauri:

```text
and backend/formvis_engine.py, Rust under src-tauri/src. Figures are rounded to hundreds; a figure passes the check within
         ("Python", ("backend/app/", "backend/formvis_engine.py"), ".py"), ("Rust", ("src-tauri/src/",), ".rs"))
case "$which" in all|unit|backend|e2e) ;; *) cv_say "unknown test suite: $which (use unit, backend, e2e or nothing for all)"; exit 2 ;; esac
        .invoke_handler(tauri::generate_handler![system_fonts])
```

## The desktop app's fonts · _v1.43.0 (src/ui/fonts.ts, src/app.ts, src/extensions/tools/type.ts, package.json; src-tauri/src/main.rs, src-tauri/Cargo.toml, src-tauri/Cargo.lock new; e2e/test_desktop_fonts.py new)

`fonts.ts`: `inDesktopApp`, `canListSystemFonts` and `loadSystemFonts` through the shell's `system_fonts` in the desktop app. `app.ts`: the fonts loaded at start there. `type.ts`: the Font menu a `live` list. Shell: `system_fonts` (fontdb) and its test, `invoke_handler`; Cargo.toml adds `serde_json` and `fontdb` (only additions there). Removed:

```ts
    { kind: 'select', label: 'Font', choices: fontChoices(e.textSettings.family), get: () => e.textSettings.family, set: (v) => {
 *  desktop shell's webview has no such API; its native font list needs a shell command not built yet, so there the
 *  common families found are what is offered. */
/** Whether this browser can list the machine's fonts (Local Font Access). */
export const canListSystemFonts = (): boolean => typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function';
/** The machine's font families through Local Font Access, which asks the user's permission (so call it from a click);
 *  null where the API is missing or permission is refused. */
```

## Object Selection · _v1.42.0 (src/extensions/tools/object-select.ts new, src/extensions/tools/index.ts, src/engine/types.ts, src/io/api.ts, src/ui/icons.ts; e2e/test_object_select.py new)

`object-select.ts`: `objectSelectTool`, `source`, `keyOf` (FNV-1a over the pixels), `selectAt`. `api.ts`: `selectObject`. `ToolId` gains `objectSelect`; `icons.ts` gains `objectSelect`. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'idle';
  for (const tool of [moveTool, marqueeTool, lassoTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

## Sliding document tabs · _v1.41.0 (src/ui/tabs.ts, src/styles/shell.css; e2e/test_no_layout_shift.py new)

`tabs.ts` `render`: tabs and the new-document button held by `--flip-x` and eased (`.is-settling`) whenever the tab count changes. Removed:

```ts
import { el, patchList, q, setClass, setText, setTitle } from './dom';
```

## .comp import · _v1.40.0 (src/io/images.ts; e2e/test_comp_import.py new)

`images.ts`: `.comp` in `PROJECT_ACCEPT` and `isProjectFile` (opened to migrate; formvis never writes it). Removed:

```ts
export const PROJECT_ACCEPT = '.fmv,.formvis,.canvasor,.zip,.psd,.psb';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|canvasor|zip|psd|psb)$/i.test(f.name);
```

## Camera RAW import · _v1.39.0 (src/io/images.ts, src/io/api.ts, src/io/links.ts, src/app.ts; e2e/test_camera_raw.py new)

`images.ts`: `RAW_FILE`, RAW extensions in `IMAGE_ACCEPT` and `isImageFile`, RAW sent to the engine in `decodeImage`. `api.ts`: the capability report's `raw` and `rawEngine`. `links.ts`: RAW extensions in the desktop picker. `app.ts` `importFiles`: a single RAW import opens Develop. Removed:

```ts
import { IMAGE_ACCEPT, decodeImage, isImageFile, isProjectFile } from './io/images';
  decode: { heic: boolean; tiff: boolean; engine: string };
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,image/*';
export const isImageFile = (f: File): boolean => f.type.startsWith('image/') || NATIVE.test(f.name) || SERVER.test(f.name);
  const server = SERVER.test(name) || /image\/(heic|heif|tiff)/.test(file.type);
      const [h] = await picker({ types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tif', '.tiff', '.heic', '.psd'] } }] });
```

## Licence, sliding layer rows, the GPU blender's name · _v1.38.0 (package.json, package-lock.json, src/ui/layers.ts, src/styles/panels.css, src/gpu/blender.ts renamed, src/gpu/display.ts; e2e/test_gpu_blend.py renamed, e2e/conftest.py)

`package.json` and the lockfile's own entry: Apache-2.0. `layers.ts` `render`: moved rows held by `--flip` and eased (`.is-settling`). `gpu/blender.ts` (`GpuBlender`) is the 1.16.0 GPU module under a new name, moved with git mv; entries above use the new names. Five removed lines are not quoted here, since quoting them would put the removed term back into the tree: the module's description line, the class declaration, `create`'s return type and its constructor call in `blender.ts`, and one comment line in `display.ts`, each the same line with the old term where the new one now stands. The one other removed line:

```css
.cv-layer { display: grid; grid-template-columns: 28px calc(var(--depth, 0) * 14px) 16px var(--cv-thumb) auto minmax(0, 1fr); align-items: center; column-gap: var(--space-1); height: var(--cv-row-h); padding: 0 var(--space-2) 0 var(--space-1); border-left: 3px solid transparent; color: var(--text-secondary); font-size: var(--fs-12); cursor: default; }
```

## Paragraph styles · _v1.37.0 (src/engine/types.ts, src/engine/text.ts, src/engine/index.ts, src/io/project-io.ts, src/ui/panels/paragraph-styles.ts new, src/styles/dialogs.css, src/app.ts; e2e/test_paragraph_styles.py new)

`ParagraphStyle`, `Doc.paragraphStyles`, `TextSpec.style`. `text.ts`: `styleOf`, `withStyle`, `paragraphStylesFrom`; `textFromData` reads the link. Engine: `paragraphStyles`, `newParagraphStyle`, `applyParagraphStyle`, `redefineParagraphStyle`, `deleteParagraphStyle`. The manifest writes and reads the styles. `ParagraphStylesDialog` (Window menu). Removed:

```ts
    { label: 'Window', items: ['brush-settings', '-', ...DOCK_PANELS.map((pn) => `panel-${pn.id}`), '-', 'reset-panels'] },
import { defaultText, liveText, loadTextFont, renderText, textKey } from './text';
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
export { TEXT_FONTS, defaultText, fontCss, liveText, textFromData, textKey, textMetrics, renderText } from './text';
import { clamp, type Layer, type Pt, type TextPath, type TextSpec, type TextWarp, type WarpStyle } from './types';
    warp: warpFrom(o.warp), onPath: pathFrom(o.onPath),
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; globalLight?: GlobalLight }
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; rendered?: string }
  Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB, timelineData, timelineFrom, type Timeline, addPattern, patternById, projectPatterns,
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.globalLight ? { globalLight: { angle: doc.globalLight.angle, altitude: doc.globalLight.altitude } } : {}) };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(guides.length ? { guides } : {}), ...(globalLight ? { globalLight } : {}) }, activeId: str(manifest.activeLayerID) };
```

## Type on Path · _v1.36.0 (src/engine/types.ts, src/engine/text.ts, src/engine/index.ts, src/ui/panels/type-on-path-dialog.ts new, src/app.ts; e2e/test_type_on_path.py new)

`TextPath`, `TextSpec.onPath`. `text.ts`: `renderPathText`, `pathFrom`; `renderText` sends path type to it. Engine: `createTextOnPath`. `TypeOnPathDialog`; the `type-on-path` command in the Layer menu. Removed:

```ts
      'rasterize', 'edit-text', 'warp-text', { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-corners'] }, '-',
import { clamp, type Layer, type TextSpec, type TextWarp, type WarpStyle } from './types';
/** The type as it is drawn: plain, or warped when the spec has an active Warp Text. */
    warp: warpFrom(o.warp),
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; rendered?: string }
```

## Warp Text · _v1.35.0 (src/engine/types.ts, src/engine/text.ts, src/ui/panels/warp-text-dialog.ts new, src/app.ts; e2e/test_warp_text.py new)

`TextWarp`, `WarpStyle`, `TextSpec.warp`. `text.ts`: `renderPlain` (the former renderer), `WARP_STYLES`, `warpPoint`, `triangle`, `warpRender`, `renderText` (plain, then the warp), `warpFrom`. `WarpTextDialog`; the `warp-text` command in the Layer and context menus. Removed:

```ts
      'rasterize', 'edit-text', { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-corners'] }, '-',
  contextMenu.setItems(['duplicate-dialog', 'delete-layer', 'rename', 'edit-text', '-',
import { clamp, type Layer, type TextSpec } from './types';
export function renderText(t: TextSpec): TextRender {
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; rendered?: string }
```

## Brush Settings · _v1.34.0 (src/engine/brush-dynamics.ts, src/engine/stroke.ts, src/engine/index.ts, src/extensions/registry.ts, src/extensions/tools/brush.ts, src/ui/stage.ts, src/ui/panels/brush-settings.ts new, src/app.ts; e2e/test_brush_dynamics.py new)

`brush-dynamics.ts`: `PenPose`, `UPRIGHT`, `BrushShape`, `defaultShape`, `shapeActive`. `stroke.ts`: `setShape`, `shapedDab`, the seeded `rnd`, the dual and texture shaping in `compose`. Engine: `brushShape`; `beginStroke` and `strokeTo` take a pose. `ToolPointer.pose` from the stage's pointer events. `BrushSettingsDialog` (F5, Window menu). Removed:

```ts
    { label: 'Window', items: [...DOCK_PANELS.map((pn) => `panel-${pn.id}`), '-', 'reset-panels'] },
import { noDynamics, pressureOption, type BrushDynamics, type BrushPreset } from './brush-dynamics';
  beginStroke(pt: Pt, shift: boolean, pressure = 1): boolean {
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p, pressure);
    s.to(pt, pressure);
  strokeTo(pt: Pt, pressure = 1): void {
    st.s.to(pt, pressure);
import { computeOption, type BrushDynamics } from './brush-dynamics';
  private readonly spacing: number;
   *  interpolated along the way, so a pen's changes between samples are smooth. */
  to(p: Pt, pressure = 1): void {
    if (!from) { this.dab(p, pr); this.last = p; this.carry = 0; this.lastPressure = pr; return; }
    // Coverage: the paint layer, cut to the selection when there is one.
      c.drawImage(this.paint, 0, 0);
export interface ToolPointer { doc: Pt; screen: Pt; button: number; shift: boolean; alt: boolean; mod: boolean; clicks: number; pressure: number }
  down(ctx, p) { if (p.button === 0) { hoverPt = p.doc; ctx.engine.beginStroke(p.doc, p.shift, p.pressure); } },
  move(ctx, p) { hoverPt = p.doc; ctx.engine.strokeTo(p.doc, p.pressure); ctx.engine.emit('overlay', null); },
    return { doc: v ? v.toDoc(screen.x, screen.y) : screen, screen, button: e.button, shift: e.shiftKey, alt: e.altKey, mod: isMac ? e.metaKey : e.ctrlKey, clicks, pressure: pen ? Math.min(1, Math.max(0, (e as PointerEvent).pressure)) : 1 };
```

## The Refine Edge brush and Decontaminate Colors · _v1.33.0 (src/engine/select-mask.ts, src/engine/index.ts, src/ui/panels/select-mask-dialog.ts; e2e/test_refine_edges.py new)

`select-mask.ts`: `refineRegion`, `decontaminate`. `applyRefinedSelection` takes a decontaminate amount for output to a new layer. The dialog: Onion Skin, Marching Ants and On Layers views, the brush (`region`, `paint`), Decontaminate Colors and Amount. Removed:

```ts
  applyRefinedSelection(data: Uint8Array, output: 'selection' | 'mask' | 'layer' | 'layerMask'): void {
import { DEFAULT_REFINE, refineSelection, type RefineSettings } from '../../engine/select-mask';
import { selectRow, sliderRow } from './controls';
type View = 'overlay' | 'onBlack' | 'onWhite' | 'blackWhite';
    const viewRow = selectRow('View', [['overlay', 'Overlay'], ['onBlack', 'On Black'], ['onWhite', 'On White'], ['blackWhite', 'Black & White']], (v) => { this.view = v as View; this.render(); });
    this.body.append(this.canvas, viewRow.el, ...rows.map((x) => x.r.el), outRow.el);
    this.syncRows = () => { viewRow.set(this.view); outRow.set(this.output); for (const { k, r } of rows) r.set(this.s[k]); };
      const m = refineSelection(mask, guide, this.pw, this.ph, this.s, this.scale), out = new ImageData(this.pw, this.ph), d = out.data, s = img.data;
    const m = refineSelection(mask, guide, W, H, s, 1), data = new Uint8Array(W * H);
    this.engine.applyRefinedSelection(data, output);
```

## Develop's further panels · _v1.32.0 (src/engine/develop.ts, src/ui/panels/filter-panel.ts, src/ui/panels/curve-graph.ts new; e2e/test_develop_panels.py new)

`develop.ts`: `GradingState`, `OpticsState`, `GeometryState`, `CalibrationState` (optional in `DevelopState`), their defaults and `gradingOf` and the like, `gradePass`, `opticsPass`, `geometryPass`, `sampleChannel`; `developImage` and `stateActive` extended. `curve-graph.ts`: `curveGraph`. The Develop dialog: Point Curve, Colour Mixer, Colour Grading, Optics, Geometry, Calibration. Removed:

```ts
import { gaussianBlur } from './filters';
  return toneActive(s.tone) || colorActive(s.color) || curvesActive(s.curves) || detailActive(s.detail);
/** The whole Develop filter on `src`, in the develop studio's order: the per-pixel pass, then clarity, texture and
 *  sharpening. `scale` shrinks the detail radii for a scaled preview. */
```

## Radial, Surface and the Blur Gallery · _v1.31.0 (src/engine/blur-gallery.ts new; src/ui/panels/filter-panel.ts, src/engine/filter-jobs.ts, src/engine/filter-worker.ts, src/app.ts; e2e/test_blur_gallery.py new)

`blur-gallery.ts`: `radialBlur`, `surfaceBlur`, `variableBlur`, `fieldBlur`, `irisBlur`, `tiltShift`, `pathBlur`, `GalleryKind`, `GALLERY_KINDS`, `isGalleryKind`, `GallerySettings`, `runGallery`. Filter panel: six kinds and labels, `gallery` settings, sections, margins. Worker: `runGallery`, and its comment's missing subject restored. Menus: Blur gains Radial and Surface; Blur Gallery. Removed:

```ts
  const FILTERS: FilterKind[] = ['develop', 'gaussianBlur', 'lensBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'smartSharpen', 'shakeReduction', 'unsharpMask'];
      { label: 'Blur', items: ['filter-gaussianBlur', 'filter-lensBlur', 'filter-motionBlur'] },
export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState; lensRadius: number; lensBrightness: number; lensThreshold: number; smart: SmartSharpenSettings; shake: ShakeSettings }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction';
/** runs its filters off the main thread (Core Image on the GPU). formvis's kernels are JavaScript, so the
  if (job.kind === 'gaussianBlur') out = gaussianBlur(src, s.radius * job.scale);
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen' | 'shakeReduction';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop', lensBlur: 'Lens Blur', smartSharpen: 'Smart Sharpen', shakeReduction: 'Shake Reduction' };
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : kind === 'lensBlur' ? lensBlurMargin(s.lensRadius) : kind === 'smartSharpen' ? smartSharpenMargin(s.smart) : kind === 'shakeReduction' ? shakeMargin(s.shake) : 0;
```

## Shadows/Highlights, HDR Toning and Color Lookup · _v1.30.0 (src/engine/adjust-params.ts, src/engine/lut.ts, src/ui/panels/adjust-panel.ts; e2e/test_adjust_new_kinds.py new)

`adjust-params.ts`: `blurredLum`, `relight`, `LOOKS`, `parseCube`, `cubeSample`; kinds `shadowsHighlights`, `hdrToning`, `colorLookup`; the `text` value kind. `lut.ts`: Color Lookup in `LUT3_KINDS`. `adjust-panel.ts`: the 3D LUT File row. Removed:

```ts
export type ParamKind = 'brightnessContrast' | 'vibrance' | 'colorBalance' | 'blackWhite' | 'photoFilter' | 'channelMixer' | 'invert' | 'posterize' | 'threshold' | 'selectiveColor' | 'develop';
  | { key: string; label: string; kind: 'select'; options: ReadonlyArray<readonly [string, string]>; def: string; group?: string };
export const LUT3_KINDS: ReadonlySet<AdjustmentKind> = new Set<AdjustmentKind>(['hsv', 'vibrance', 'colorBalance', 'channelMixer', 'photoFilter', 'blackWhite', 'selectiveColor', 'threshold', 'gradientMap']);
import { PARAM_ADJUSTMENTS, PARAM_KINDS, isParamKind, paramKernel, paramValues, type ParamKind } from '../../engine/adjust-params';
```

## Tracking, kerning and this machine's fonts · _v1.29.0 (src/ui/fonts.ts new; src/engine/types.ts, src/engine/text.ts, src/extensions/tools/type.ts, src/io/psd.ts, src/ui/panels/text-dialog.ts, src/ui/text-editor.ts, src/styles/shell.css; e2e/test_type_spacing.py new)

`TextSpec.tracking`, `TextSpec.kerning`, `TextKerning`. `text.ts`: `trackingPx`, `CANVAS_TRACKING`, `setType`, `lineWidth`; `renderText` measured and drawn with them, per character where the canvas has no letterSpacing. `fonts.ts`: `installed`, `fontFamilies`, `canListSystemFonts`, `loadSystemFonts`. Type options: `fontChoices`, Load system fonts, Tracking, Kerning. The Edit Type dialog keeps a font outside the list. The typing box's `--ls` and `--kern`. Removed:

```ts
  return { content: '', family: 'Inter', size: 48, color: { r: 0, g: 0, b: 0 }, align: 'left', bold: false, italic: false, lineHeight: 1.2 };
  const font = fontCss(t), lines = t.content.split('\n');
  probe.font = font;
  const widest = Math.max(1, ...metrics.map((m) => Math.max(m.width, (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0))));
  c.font = font;
  c.textAlign = t.align;
  const x = t.align === 'center' ? width / 2 : t.align === 'right' ? width - pad : pad;
  lines.forEach((line, i) => c.fillText(line, x, pad + ascent + i * advance));
    lineHeight: num(o.lineHeight, d.lineHeight, 0.5, 4), rendered: textKey(raster),
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; rendered?: string }
import { TEXT_FONTS, type Engine, type TextSpec } from '../../engine';
    { kind: 'select', label: 'Font', choices: TEXT_FONTS.map((f) => ({ id: f, label: f })), get: () => e.textSettings.family, set: (v) => setType(e, { family: v }) },
          align: just === 'center' || just === 'right' ? just : 'left', bold: !!st.fauxBold || face.bold, italic: !!st.fauxItalic || face.italic, lineHeight: st.autoLeading === false && st.leading ? Math.round((st.leading * scale / size) * 100) / 100 : 1.2 };
.cv-type-editor { position: absolute; left: var(--x, 0); top: var(--y, 0); width: var(--w, 0); height: var(--h, 0); z-index: var(--z-raised); margin: 0; padding: 0; border: 0; outline: 1px dashed var(--accent-color); background: transparent; color: var(--ink, currentColor); font: var(--font, inherit); line-height: var(--lh, normal); text-align: var(--align, left); white-space: pre; overflow: hidden; resize: none; caret-color: var(--accent-color); }
import { TEXT_FONTS, type Engine, type RGB, type TextSpec } from '../../engine';
  private readonly family = el<HTMLSelectElement>(`<select class="cv-input">${TEXT_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}</select>`);
    this.family.value = TEXT_FONTS.includes(t.family) ? t.family : 'Inter';
      bold: this.bold, italic: this.italic, color: fromHex(this.colour.value),
    s.spec = { ...s.spec, family: t.family, size: t.size, align: t.align, bold: t.bold, italic: t.italic, lineHeight: t.lineHeight };
```

## The performance benchmark · _v1.27.0 (src/gpu/bench.ts new; src/gpu/display.ts, src/gpu/gl-display.ts, src/ui/app-dialogs.ts, src/app.ts, src/styles/dialogs.css; e2e/test_benchmark.py new)

`bench.ts`: `runBenchmark` (a temporary document, pan, pan with adjustments, paint; CPU and each GPU display; the previous document restored), `benchText`. `GpuDisplay.timedFrame` and `GlDisplay.timedFrame` (an offscreen frame, finished before they resolve). `BenchmarkDialog`; the `benchmark` command in the Help menu; `.cv-bench-out`. Removed:

```ts
import { AboutDialog, NewCanvasDialog, OpenDialog, SettingsDialog, ShortcutsDialog } from './ui/app-dialogs';
    { label: 'Help', items: ['shortcuts', 'copy-error-log', 'about'] },
```

## The engine processor in Preferences · _v1.26.0 (src/ui/prefs.ts, src/ui/app-dialogs.ts, src/io/api.ts, src/app.ts; e2e/test_engine_device.py new)

`Prefs.engineDevice`, `EngineDevice`, `ENGINE_CHOICES`. `SettingsDialog`: `engineRow`, `engineMode`, the Engine section, `setEngine`; the graphics processor note corrected. `api.setCompute`. `syncEngineDevice` in the app, run when the engine answers and on every Preferences change. Removed:

```ts
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); recoveryDelay = pr.recoverySeconds * 1000; home.sync(); syncGpu(); }),
import { RECOVERY_CHOICES, loadPrefs, savePrefs, type Prefs } from './prefs';
      el('<p class="cv-note">Automatic uses WebGPU (Metal on macOS, Direct3D 12 on Windows), then WebGL2 (as on Linux), on a hardware graphics processor, and the CPU otherwise; a software GPU is slower than the CPU renderer, so Automatic does not use one. If the graphics processor fails to start, formvis turns this off and says so. In this version the graphics processor is detected and the choice kept; drawing still runs on the CPU until the GPU renderer that follows it arrives.</p>'));
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean; useGpu: boolean; renderer: GpuRenderer; gpuMemoryMB: number }
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true, useGpu: true, renderer: 'auto', gpuMemoryMB: 1024 };
```

## Layer styles on the GPU · _v1.25.0 (src/engine/renderer.ts, src/engine/index.ts; e2e/test_gpu_styles.py new)

`Renderer.gpuEffectParts`: the renderer's cached effect parts (images, matrices, alpha, blend, below or above). `gpuLayers` wraps a styled layer in its parts; clipped, masked-folder and live-edited styled layers keep the CPU path by name. Removed:

```ts
      if (effectsActive(o?.effects ?? l.effects)) return { reason: 'layer styles' };
```

## Folder masks on the GPU · _v1.24.0 (src/engine/index.ts, src/gpu/blend-wgsl.ts, src/gpu/display.ts, src/gpu/gl-display.ts; e2e/test_gpu_clip.py)

Engine: `fchains` (one mask chain per parent folder), `GpuLayerSpec.folders`, the refusal for a clipped layer inside a masked folder. Shaders: mode 103. Displays: `DisplayLayer.folders`, `FOLDER_MODE`; each chain's coverage rendered once per frame through the clip input, pool slots from a running counter; folder mode binds the stand-in. Removed:

```ts
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; lut3?: boolean; mask?: GpuMaskSpec; clip?: GpuClipSpec; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
    const ov = this.overrides(p), layers: GpuLayerSpec[] = [], map = byId(p.doc), clips = new Map<ID, GpuClipSpec | null | 'nested'>();
      for (const g of ancestors(map, l)) if (g.mask?.enabled && g.mask.raster) return { reason: 'folder masks' };
          layers.push({ image: null, lut, mask, clip, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
        layers.push({ image: null, lut: lut3, lut3: true, mask, clip, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: o?.opacity ?? l.opacity, blend: o?.blend ?? l.blend, mask, clip });
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; lut3?: boolean; mask?: DisplayMask; clip?: DisplayClip; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
/** The shader mode that renders a clipping base's coverage. */
      this.layerPass(enc, a, b, l, l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend), l.clip ? clipTex.get(l.clip) ?? null : null, sampler, view, used, buffers);
    used.add(l.lut ?? (l.image as object));
    const tex = this.texture(l);
import { CLIP_MODE, LUT3_MODE, LUT_MODE, type Checker, type DisplayClip, type DisplayLayer } from './display';
      this.drawLayer(l, l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend), l.clip ? clipOut.get(l.clip) ?? null : null, a.tex, b.fb, view, filter, used, u);
    used.add(l.lut ?? (l.image as object));
    gl.bindTexture(gl.TEXTURE_2D, this.texture(l));
```

## Clipping groups and folders on the GPU · _v1.23.0 (src/engine/index.ts, src/gpu/blend-wgsl.ts, src/gpu/blender.ts, src/gpu/display.ts, src/gpu/gl-display.ts; e2e/test_gpu_clip.py new)

Engine: `gpuLayers` walks `hierarchy(doc)`; `maskFor`, `clipOf`, `GpuClipSpec`. WGSL: `hasClip`, binding 5, mode 102. Displays: `DisplayClip`, `CLIP_MODE`; the loop bodies moved into `GpuDisplay.layerPass` and `GlDisplay.drawLayer` (mode and clip as parameters), clip coverage rendered first into `clipTarget` pools. Removed:

```ts
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; lut3?: boolean; mask?: GpuMaskSpec; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
    const ov = this.overrides(p), layers: GpuLayerSpec[] = [];
    for (const l of p.doc.layers) {
      if (o?.hidden || !l.visible) continue;
      if (l.isGroup || l.parentId) return { reason: 'folders' };
      // The layer's mask, as the CPU renderer's maskOf reads it: enabled with pixels, the live preview's source while
      // painting, and its own placement, else the layer's (Phase 18, masks).
      const m = l.mask, msrc = m?.enabled && m.raster ? o?.maskSource ?? m.raster.canvas : null;
      const mask = m && msrc ? { image: msrc, version: o?.maskSource ? -1 : (m.raster as Raster).version, width: msrc.width, height: msrc.height,
        matrix: placement(o?.maskPlacement ?? m.placement ?? o?.transform ?? l.transform, msrc.width, msrc.height) } : undefined;
      if (l.clipId) return { reason: 'clipping masks' };
          layers.push({ image: null, lut, mask, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
        layers.push({ image: null, lut: lut3, lut3: true, mask, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: o?.opacity ?? l.opacity, blend: o?.blend ?? l.blend, mask });
struct Layer { inv: mat3x3<f32>, size: vec2<f32>, opacity: f32, mode: u32, minv: mat3x3<f32>, msize: vec2<f32>, hasMask: u32, pad: u32 };
  let cov = coverage(pos.xy);
        { binding: 4, resource: blank.createView() },
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; lut3?: boolean; mask?: DisplayMask; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
      used.add(l.lut ?? (l.image as object));
      const tex = this.texture(l);
      const [ia, ib, ic, id, ie, iff] = invert(mul(view, l.matrix));
      // 128 bytes, WGSL's layout: inv (0), size (48), opacity (56), mode (60), the mask's inverse placement (64), its
      // size (112), whether there is one (120).
      const raw = new ArrayBuffer(128), f = new Float32Array(raw), u32 = new Uint32Array(raw);
      f.set([ia, ib, 0, 0, ic, id, 0, 0, ie, iff, 1, 0, l.width, l.height, Math.min(1, Math.max(0, l.opacity))]);
      u32[15] = l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend);
      let maskTex = this.blank();
      if (l.mask) {
        const mk = l.mask, [ma, mb, mc, md, me, mf] = invert(mul(view, mk.matrix));
        f.set([ma, mb, 0, 0, mc, md, 0, 0, me, mf, 1, 0, mk.width, mk.height], 16);
        u32[30] = 1;
        used.add(mk.image);
        maskTex = this.texture({ image: mk.image, version: mk.version, width: mk.width, height: mk.height, matrix: mk.matrix, opacity: 1, blend: 'normal' });
      }
      const ub = d.createBuffer({ size: 128, usage: BUF.UNIFORM | BUF.COPY_DST });
      d.queue.writeBuffer(ub, 0, raw);
      buffers.push(ub);
      const bind = d.createBindGroup({ layout: this.composite.getBindGroupLayout(0), entries: [
        { binding: 0, resource: a.createView() }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: sampler }, { binding: 3, resource: { buffer: ub } },
        { binding: 4, resource: maskTex.createView() },
      ] });
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: b.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(this.composite);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
import { LUT3_MODE, LUT_MODE, type Checker, type DisplayLayer } from './display';
      used.add(l.lut ?? (l.image as object));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(l));
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter);
      const [ia, ib, ic, id, ie, iff] = invert(mul(view, l.matrix));
      gl.uniformMatrix3fv(u('inv'), false, [ia, ib, 0, ic, id, 0, ie, iff, 1]);
      gl.uniform2f(u('size'), l.width, l.height);
      gl.uniform1f(u('opacity'), Math.min(1, Math.max(0, l.opacity)));
      gl.uniform1i(u('mode'), l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend));
      gl.activeTexture(gl.TEXTURE2);
      if (l.mask) {
        const mk = l.mask, [ma, mb, mc, md, me, mf] = invert(mul(view, mk.matrix));
        used.add(mk.image);
        gl.bindTexture(gl.TEXTURE_2D, this.texture({ image: mk.image, version: mk.version, width: mk.width, height: mk.height, matrix: mk.matrix, opacity: 1, blend: 'normal' }));
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter);
        gl.uniformMatrix3fv(u('minv'), false, [ma, mb, 0, mc, md, 0, me, mf, 1]);
        gl.uniform2f(u('msize'), mk.width, mk.height);
        gl.uniform1i(u('hasMask'), 1);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.blank());
        gl.uniform1i(u('hasMask'), 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
```

## Layer masks on the GPU · _v1.22.0 (src/engine/index.ts, src/gpu/blend-wgsl.ts, src/gpu/blender.ts, src/gpu/display.ts, src/gpu/gl-display.ts; e2e/test_gpu_mask.py new, e2e/test_gpu_display.py)

Engine: `GpuMaskSpec`, the mask in `gpuLayers` as `maskOf` reads it. WGSL: the 128-byte `Layer` block, binding 4, `coverage`. `GpuDisplay.blank`, the mask in the parameter block and binding 4; a `destroyed` loss is ignored. `GlDisplay.blank`, the mask uniforms and unit 2. The GPU blender passes the larger block and a stand-in. Removed:

```ts
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; lut3?: boolean; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
      if (l.mask || o?.maskSource) return { reason: 'layer masks' };
          layers.push({ image: null, lut, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
        layers.push({ image: null, lut: lut3, lut3: true, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: o?.opacity ?? l.opacity, blend: o?.blend ?? l.blend });
struct Layer { inv: mat3x3<f32>, size: vec2<f32>, opacity: f32, mode: u32 };
    return vec4<f32>(bd.rgb + (t - bd.rgb) * layer.opacity, bd.a);
    return vec4<f32>(bd.rgb + (t3 - bd.rgb) * layer.opacity, bd.a);
  let sa = sc.a * layer.opacity;
      const raw = new ArrayBuffer(64), f = new Float32Array(raw), u = new Uint32Array(raw);
      const ub = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; lut3?: boolean; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
      const raw = new ArrayBuffer(64), f = new Float32Array(raw);
      new Uint32Array(raw)[15] = l.lut ? (l.lut3 ? LUT3_MODE : LUT_MODE) : blendIndex(l.blend);
      const ub = d.createBuffer({ size: 64, usage: BUF.UNIFORM | BUF.COPY_DST });
    outColor = vec4(bd.rgb + (t - bd.rgb) * opacity, bd.a); return;
    outColor = vec4(bd.rgb + (t3 - bd.rgb) * opacity, bd.a); return;
  float sa = sc.a * opacity; if (sa <= 0.0) { outColor = bd; return; }
```

## Channel-mixing adjustments on the GPU · _v1.21.0 (src/engine/lut.ts, src/engine/index.ts, src/gpu/display.ts, src/gpu/gl-display.ts, src/gpu/blend-wgsl.ts; e2e/test_gpu_adjust.py)

`lut.ts`: `LUT3_N`, `LUT3_KINDS`, `lut3Sample`, `adjustmentLut3` (the 3D table from the CPU kernel, proven within 1 level off the lattice). `GpuLayerSpec.lut3` and `DisplayLayer.lut3`; `LUT3_MODE`; tables upload at their own size; shader mode 101 in WGSL and GLSL. Removed:

```ts
import { adjustmentLut } from './lut';
/** One entry of the GPU display's layer list (gpuLayers): a pixel layer's image, or an adjustment's per-channel lookup
 *  table (256 x 1, RGBA) applied to what is below it. */
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
        if (!lut) return { reason: `a ${ADJUSTMENT_LABELS[l.adjustment.kind] ?? l.adjustment.kind} adjustment layer` };
        layers.push({ image: null, lut, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: o?.opacity ?? l.opacity, blend: 'normal' });
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas | null; lut?: Uint8Array; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
/** The shader mode for an adjustment's lookup table (Phase 18.5), after the 27 blend modes. */
      new Uint32Array(raw)[15] = l.lut ? LUT_MODE : blendIndex(l.blend);
      // A table is fixed for its settings (a new table comes with new settings), so it is written once.
      if (Number.isNaN(e.version)) { this.device.queue.writeTexture({ texture: e.tex }, l.lut, { bytesPerRow: 256 * 4 }, [256, 1]); e.version = 0; }
import { LUT_MODE, type Checker, type DisplayLayer } from './display';
      gl.uniform1i(u('mode'), l.lut ? LUT_MODE : blendIndex(l.blend));
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, l.lut);
```

## Per-channel adjustments on the GPU · _v1.20.0 (src/engine/lut.ts new; src/engine/index.ts, src/gpu/display.ts, src/gpu/gl-display.ts, src/gpu/blend-wgsl.ts; e2e/test_gpu_adjust.py new)

`lut.ts`: `LUT_KINDS`, `adjustmentLut` (the table from the CPU kernel, proven on a colour lattice). Engine: `GpuLayerSpec`; `gpuLayers` sends per-channel adjustments as tables and names the others. Displays: `DisplayLayer.lut`, `LUT_MODE`, the table upload and cache key, shader mode 100 in WGSL and GLSL. Removed:

```ts
  gpuLayers(): { layers: Array<{ image: Surface; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }> } | { reason: string } {
    const ov = this.overrides(p), layers: Array<{ image: Surface; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }> = [];
      if (l.adjustment) return { reason: 'adjustment layers' };
export interface DisplayLayer { image: HTMLCanvasElement | OffscreenCanvas; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
      used.add(l.image);
      new Uint32Array(raw)[15] = blendIndex(l.blend);
    let e = this.cache.get(l.image);
      this.cache.set(l.image, e);
    if (l.version < 0 || e.version !== l.version) {
import type { Checker, DisplayLayer } from './display';
      used.add(l.image);
      gl.uniform1i(u('mode'), blendIndex(l.blend));
    const gl = this.gl;
    let e = this.cache.get(l.image);
    if (!e) { e = { tex: gl.createTexture() as WebGLTexture, version: NaN, w: l.width, h: l.height }; this.cache.set(l.image, e); }
    if (l.version < 0 || e.version !== l.version) {
```

## The WebGL2 renderer · _v1.19.0 (src/gpu/gl-display.ts new; src/gpu/display.ts, src/gpu/fallback.ts, src/ui/stage.ts, src/app.ts; e2e/test_gl_display.py new, tests/gpu-fallback.test.ts, e2e/test_gpu_prefs.py)

`gl-display.ts`: `GlDisplay` (GLSL ES 3.00 composite and present programs, `render`, `renderToPixels`, the texture cache, `maxTexture`, `onLost`). `display.ts`: the `ScreenDisplay` interface; `GpuDisplay.canvas` public. `rendererFallback` treats WebGL2 as WebGPU. Stage: `gpuCanvases`, `showGpu`. `syncGpu` starts either display on its own canvas and tracks failures per API; the markup gains `.cv-scene-gl`. Removed:

```ts
import { GpuDisplay } from './gpu/display';
  let gpuDisplay: GpuDisplay | null = null, gpuStarting = false, gpuFailed = false;
    // WebGPU draws through the GPU display (Phase 18.2b); WebGL2's renderer is Phase 18.4, so it still draws on the CPU.
    if (ch.mode === 'webgpu' && !gpuDisplay && !gpuStarting && !gpuFailed) {
      void GpuDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-gpu')).then((d) => {
        gpuDisplay = d;
        gpuFailed = !d;
        if (d) d.onLost = () => { gpuDisplay = null; gpuFailed = true; syncGpu(); };
      });
    if (ch.mode !== 'webgpu' && gpuDisplay) { gpuDisplay.destroy(); gpuDisplay = null; }
    const off = rendererFallback({ mode: ch.mode, chosenReason: ch.reason, displayReady: !!gpuDisplay, displayFailed: gpuFailed });
    const live = off ? null : gpuDisplay;
    stage.setGpu(live, pr.gpuMemoryMB * 1024 * 1024, live ? (reason) => status.setGpu(reason ? 'GPU: CPU' : 'GPU: WebGPU', reason ? `WebGPU is on, but ${reason}, so it draws on the CPU` : `${name}: ${ch.reason}`) : null);
    dialogs.settings.setGpu(detectedName(gpuProbe), live ? 'WebGPU' : 'CPU', live ? ch.reason : cpuWhy);
  private constructor(private readonly canvas: HTMLCanvasElement, private readonly device: GPUDevice, private readonly ctx: GPUCanvasContext,
/** Whether the GPU display draws at all: the chosen mode, a display that started and was not lost. */
  if (s.mode === 'webgl2') return 'WebGL2 is chosen, but its renderer is not built yet, so drawing is on the CPU';
  if (s.displayFailed) return 'WebGPU could not start or was lost, so drawing is on the CPU';
  if (!s.displayReady) return 'WebGPU is starting';
import type { DisplayLayer, GpuDisplay } from '../gpu/display';
  private readonly gpuCanvas: HTMLCanvasElement;
  private gpu: GpuDisplay | null = null;
    this.gpuCanvas = q<HTMLCanvasElement>(host, '.cv-scene-gpu');
    for (const c of [this.scene, this.overlay, this.gpuCanvas]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  setGpu(display: GpuDisplay | null, limitBytes: number, onState: ((reason: string | null) => void) | null): void {
    if (!display) setHidden(this.gpuCanvas, true);
    if (!p) { g.clearRect(0, 0, W, H); setHidden(this.gpuCanvas, true); return; }
    setHidden(this.gpuCanvas, !gpuLayers);
    if (!vis) { if (gpuLayers) setHidden(this.gpuCanvas, true); return; }
```

## Fallback rules in one place · _v1.18.0 (src/gpu/fallback.ts new; src/gpu/display.ts, src/ui/stage.ts, src/app.ts; tests/gpu-fallback.test.ts new)

`fallback.ts`: `rendererFallback`, `documentFallback` (with the new texture-limit rule), `frameBytes`. `GpuDisplay.maxTexture`. The stage and `syncGpu` call them; each switch is logged. Removed:

```ts
    const live = ch.mode === 'webgpu' ? gpuDisplay : null;
    const cpuWhy = ch.mode === 'webgl2' ? 'WebGL2 is chosen, but its renderer is not built yet, so drawing is on the CPU'
      : ch.mode === 'webgpu' ? (gpuFailed ? 'WebGPU could not start or was lost, so drawing is on the CPU' : 'WebGPU is starting') : ch.reason;
  /** Bytes the frame would hold on the GPU: every layer's texture and the two screen-sized composites. */
  bytesFor(layers: readonly DisplayLayer[], W: number, H: number): number {
    return layers.reduce((s, l) => s + l.width * l.height * 4, 0) + W * H * 8;
  }
      let reason: string | null = null;
      if ('reason' in gl) reason = `this document has ${gl.reason}`;
      else if (this.gpu.bytesFor(gl.layers, W, H) > this.gpuLimit) reason = 'this document is over the GPU memory limit';
      else gpuLayers = gl.layers;
      if (reason !== this.gpuReason) { this.gpuReason = reason; this.gpuState?.(reason); }
```

## The canvas draws through WebGPU · _v1.17.0 (src/gpu/display.ts new; src/engine/index.ts, src/ui/stage.ts, src/app.ts, src/styles/shell.css; e2e/test_gpu_display.py new, e2e/test_gpu_prefs.py)

`display.ts`: `GpuDisplay` (`create`, `render` with an optional offscreen target, `renderToPixels`, `bytesFor`, the texture cache, `onLost`), `PRESENT_WGSL`. Engine: `gpuLayers`. Stage: the `.cv-scene-gpu` canvas, `setGpu`, `rgb`, the GPU branch of `renderScene`, redraw on `contextrestored`. `app.ts`: `syncGpu` starts the display and reports what draws. Removed:

```ts
import { chooseRenderer, detectedName, gpuStartFailedLastTime, markGpuStarted, markGpuStarting, modeLabel, probeGpu, type GpuProbe } from './gpu/probe';
    status.setGpu(`GPU: ${modeLabel(ch.mode)}`, name ? `${name}: ${ch.reason}` : ch.reason);
    dialogs.settings.setGpu(detectedName(gpuProbe), modeLabel(ch.mode), ch.reason);
    for (const c of [this.scene, this.overlay]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    if (!p) { g.clearRect(0, 0, W, H); return; }
    if (!vis) return;
    const pattern = this.checkerPattern(pal);
    if (v.zoom >= 2) {
```

## The WebGPU blender · _v1.16.0 (src/gpu/blender.ts and src/gpu/blend-wgsl.ts new; e2e/test_gpu_blend.py new; e2e/conftest.py)

`blender.ts`: `GpuBlender` (`create`, `composite`, `read`, `destroy`), `GpuLayer`, the specification's usage flags. `blend-wgsl.ts`: `COMPOSITE_WGSL`, `BLEND_IDS`, `blendIndex`. Nothing removed from src; not yet wired to the display. The test browser launches with WebGPU on SwiftShader; removed from e2e/conftest.py:

```py
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
```

## GPU detection and the renderer choice · _v1.15.0 (src/gpu/probe.ts new; src/app.ts, src/ui/app-dialogs.ts, src/ui/prefs.ts, src/ui/status.ts, src/styles/dialogs.css; tests/gpu-choice.test.ts and e2e/test_gpu_prefs.py new)

`gpu/probe.ts`: `probeGpu`, `chooseRenderer`, `isSoftware`, `detectedName`, `modeLabel`, `RENDERER_CHOICES`, the start marker (`gpuStartFailedLastTime`, `markGpuStarting`, `markGpuStarted`). `Prefs` gains `useGpu`, `renderer`, `gpuMemoryMB`. Preferences > Performance: Graphics Processor Settings (`gpuName`, `gpuUseRow`, `rendererRow`, `gpuMemoryRow`, `gpuMode`, `setGpu`). `StatusBar.setGpu` and `.cv-st-gpu`. `app.ts`: `syncGpu` and the start-up probe. `.cv-prefs` keeps one height; `.cv-prefs-pages` scrolls; `.cv-prefs-sub` new. Removed:

```ts
import { applyPrefs, loadPrefs } from './ui/prefs';
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); recoveryDelay = pr.recoverySeconds * 1000; home.sync(); }),
```

```css
.cv-prefs { display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: var(--space-4); min-height: 300px; }
```

```ts
      el('<p class="cv-note">History States is how many steps undo keeps (Photoshop keeps 50 by default, up to 1000); history memory caps what those steps may hold, and the oldest steps go first when either is reached. A browser app cannot reserve system memory as Photoshop\'s Memory Usage does, so this is the part formvis controls. Turning off region redraws repaints the whole canvas on each stroke, slower but useful if painting ever draws out of place.</p>'));
 *  kept for crash recovery. */
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number; autoShowHome: boolean }
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20, autoShowHome: true };
      `<span class="cv-st-busy">${icon('loading', 12)}Working</span><span class="cv-st-engine"></span><span class="cv-st-hint"></span>`);
```

## Pattern sources for the Healing Brush and Patch · _v1.14.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/healing-brush.ts, src/extensions/tools/patch.ts; e2e/test_heal_patterns.py new)

`retouch.ts`: `healFromSource` and `scaleHealCorrection` take an optional separate `source`. Engine: `patternSurface`, `patchWithPattern`, `retouch.healSource`, `healPattern`, `patchPattern`; `beginRetouchStroke` needs no source point with Source: Pattern; `healFromPatch` heals from the pattern in both paths. Healing Brush: Source and Pattern rows; Patch: Pattern and Use Pattern in Normal mode. Removed:

```ts
import { patternById } from './patterns';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean; patchSampleAll: boolean } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false, patchSampleAll: false };
      const off = this.cloneStrokeOffset(pt);
      this.cloneOffset = off;
      texture = { surface: kind === 'healBrush' ? this.healSampleSurface(p, l0, this.retouch.healSample) : this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0), dx: off.x, dy: off.y };
      if (!healFromSource(pmS, hard, W, H, 1, off.x, off.y)) return null;
      scaleHealCorrection(healed.data, base.data, hard, W, H, off.x, off.y, this.retouch.healDiffusion, 1, 1);
    if (!healFromSource(pm, s.coverageAlpha(), r.width, r.height, this.brush.opacity, off.x, off.y)) return null;
    scaleHealCorrection(out.data, before.data, s.coverageAlpha(), r.width, r.height, off.x, off.y, this.retouch.healDiffusion, 1, this.brush.opacity);
export function scaleHealCorrection(out: Uint8ClampedArray, before: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, dx: number, dy: number, diffusion: number, colour: number, opacity = 1): void {
  const dist = diff < 7 ? insideDistance(coverage, W, H) : null, L = 2 ** diff;
      const b = before[i * 4 + ch], full = b + (out[i * 4 + ch] - b) / op, raw = before[s + ch];
export function healFromSource(rgba: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, opacity: number, dx: number, dy: number): boolean {
  const { win } = hw, ww = win.w, n = ww * win.h, original = rgba.slice();
    for (let c = 0; c < 4; c++) v[p * 4 + c] = original[t + c] - original[s + c];
    for (let c = 0; c < 4; c++) f[c] = v[p * 4 + c] + original[s + c];
import type { Pt } from '../../engine';
import type { Pt } from '../../engine';
```

## Patch Sample All Layers · _v1.13.0 (src/engine/index.ts, src/extensions/tools/patch.ts; e2e/test_patch_sample_all.py new)

Engine: `retouch.patchSampleAll`; `patchSelection` in Content-Aware mode with it patches the composite (`healSampleSurface`, `rasterSpace`) and lays the result on through the selection (`layHeal`). Patch tool: the Sample All Layers row, in Content-Aware mode. Removed:

```ts
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false };
        const orig = raster.read().data, pm = premultiply(orig);
        raster.ctx.putImageData(out, 0, 0, rect.x, rect.y, rect.w, rect.h);
```

## The healing brushes' Sample options · _v1.12.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/healing-brush.ts, src/extensions/tools/heal.ts; e2e/test_heal_sample.py new)

`retouch.ts`: `HealSample`, `HEAL_SAMPLES`. Engine: `healSampleSurface`, `rasterSpace`, `layHeal`, `retouch.healSample`, `retouch.spotSampleAll`; `healFromPatch` and `healPatch` heal the sampled image and lay the repair on; the Healing Brush's stroke texture follows its Sample. Healing Brush: the Sample select replaces the shared toggle; Spot Healing: Sample All Layers. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, healFromSource, premultiply, scaleHealCorrection, spotHeal, unpremultiply, type HealBlend, type HealMode } from './retouch';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal' };
      texture = { surface: this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0), dx: off.x, dy: off.y };
import { HEAL_BLENDS, type HealBlend } from '../../engine/retouch';
    { kind: 'toggle', label: 'Sample all layers', get: () => e.retouch.cloneSampleAll, set: (v) => { e.retouch.cloneSampleAll = v; e.emit('options', null); } },
```

## The healing brushes' Mode · _v1.11.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/heal.ts, src/extensions/tools/healing-brush.ts; e2e/test_heal_modes.py new)

`retouch.ts`: `HealBlend`, `HEAL_BLENDS`. Engine: `healBlend` (the full-strength heal recomposited in the mode; Replace whole pixels on the Dissolve pattern), `retouch.healBlendMode`, `retouch.spotBlendMode`; `healFromPatch` and `healPatch` apply it. Both tools: a Mode select. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, healFromSource, premultiply, scaleHealCorrection, spotHeal, unpremultiply, type HealMode } from './retouch';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7 };
```

## Healing Brush Diffusion · _v1.10.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/healing-brush.ts; e2e/test_healing_diffusion.py new, tests/inside-distance.test.ts extended)

`retouch.ts`: `scaleHealCorrection`, shared by Patch and the Healing Brush, allowing for the heal's opacity. Engine: `retouch.healDiffusion`; `healFromPatch` applies it; `patchSelection` calls the helper in place of its own loop. Healing Brush: the Diffusion row. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, healFromSource, insideDistance, premultiply, spotHeal, unpremultiply, type HealMode } from './retouch';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10 };
        const diffusion = opts.patchMode === 'normal' ? Math.round(Math.min(7, Math.max(1, opts.patchDiffusion))) : 7;
        if (diffusion < 7 || colour < 1) {
          const dist = diffusion < 7 ? insideDistance(mask, W, H) : null, L = 2 ** diffusion;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (mask[i] < 128) continue;
            const w = colour * (dist ? Math.exp(-dist[i] / L) : 1);
            const s = (Math.min(H - 1, Math.max(0, y + oy)) * W + Math.min(W - 1, Math.max(0, x + ox))) * 4;
            for (let ch = 0; ch < 3; ch++) out.data[i * 4 + ch] = Math.round(orig[s + ch] + w * (out.data[i * 4 + ch] - orig[s + ch]));
          }
        }
```

## Patch Diffusion, Structure and Color · _v1.9.0 (src/engine/index.ts, src/engine/retouch.ts, src/extensions/tools/patch.ts; tests/inside-distance.test.ts and e2e/test_patch_settings.py new)

`retouch.ts`: `insideDistance`. Engine: `retouch.patchDiffusion`, `patchStructure`, `patchColor`; `patchSelection` scales the heal's colour correction by Diffusion (Normal) and Color (Content-Aware) and sizes the rebuilt edge band by Structure. Patch tool: the three rows, each shown in its mode. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, healFromSource, premultiply, spotHeal, unpremultiply, type HealMode } from './retouch';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false };
          const band = new Uint8Array(W * H), R = 3;
```

## The Layers panel moves in the dock · _v1.8.0 (src/ui/layers.ts, src/ui/dock.ts, src/styles/panels.css; e2e/test_dock_layers.py new)

`LayersPanel` wraps its parts in `section.cv-layers-panel`. `.cv-layers` is a flex column; `.cv-layers-panel` takes the space left, with its own `[hidden]` rule. `DOCK_PANELS` gains Layers, first; `load` puts a panel missing from a saved arrangement at its default place. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto auto auto; min-height: 0; background: var(--bg-secondary); position: relative; }
```

```ts
 *  panels"; TeachUcomp). This first slice moves Paths, Timeline and History below the Layers panel; floating panels
 *  and grouping into tabs come later. */
    for (const id of ids) if (!order.includes(id)) order.push(id);
      `<div class="cv-panel-head"><span class="cv-panel-title">${icon('layers', 14)}Layers</span><span></span><button class="cv-icon-btn" type="button" data-cmd="new-folder">${icon('folder', 16)}</button></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="add-mask">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="clip">${icon('clipMask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-layer">${icon('add', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="delete-layer">${icon('delete', 16)}</button></div>`);
```

## Clone Source: five sources and the overlay · _v1.7.0 (src/extensions/tools/clone.ts, src/engine/index.ts; e2e/test_clone_slots.py new)

Engine: `cloneSlots`, `cloneSlot`, `selectCloneSlot`, `resetCloneTransform`, `cloneOverlay`, `cloneOverlayImage` (with `cloneFullCache`); `setCloneSource` fills the chosen slot. Clone Stamp: the Source row, Reset Transform, Show Overlay, Clipped, Overlay opacity and Auto Hide; its overlay draws clipped or the whole source by those settings. Removed:

```ts
import type { Pt } from '../../engine';
    const e = ctx.engine, v = ctx.view();
    // Between strokes, the circle previews what a click would stamp; Option (picking a source) hides it.
    if (hover && !picking) {
      const pv = e.clonePreview(hover, v.zoom * (window.devicePixelRatio || 1));
      if (pv) {
        const c = v.toScreen(hover), size = e.brush.diameter * v.zoom;
        g.save();
        g.globalAlpha = e.brush.opacity;
        g.drawImage(pv, c.x - size / 2, c.y - size / 2, size, size);
        g.restore();
```

## Panels move in the dock; the Window menu · _v1.6.0 (src/app.ts, src/styles/panels.css; src/ui/dock.ts and e2e/test_dock.py new)

`dock.ts`: `DOCK_PANELS`, `Dock` (drag a header to reorder, `toggle`, `reset`, the arrangement kept on this device). `app.ts` makes the dock after the panels, adds a command per panel and Reset Panels, and a Window menu. `.cv-layers` becomes the marker's positioning context; `.cv-dock-grip` and `.cv-dock-marker` are new. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto auto auto; min-height: 0; background: var(--bg-secondary); }
```

## Crop W x H x Resolution and presets · _v1.5.0 (src/extensions/tools/crop.ts, src/engine/index.ts; e2e/test_crop_size.py new)

Engine: `cropToSize` (crop, then `resampleImage`, in one history step). Crop tool: the `size` choice with its state, `toPx`, `sizePx`, `frontImage`, `sizeChanged`, saved presets (`loadPresets`, `savePresets`, `presetLabel`), the W, H, Unit, Resolution, Front Image, Preset, New Crop Preset and Delete Crop Preset rows, and `commit` resampling when a size is set. Removed:

```ts
  e.straightenCrop(r, angle, contentAware);
```

## The reference app's project format and notice removed · _v1.4.0 (src/app.ts, src/io/project-io.ts, src/io/images.ts, src/engine/types.ts, src/engine/adjust.ts, src/engine/kernels.ts, src/ui/app-dialogs.ts, src/ui/icons.ts, src/styles/dialogs.css, src/version.ts; src/ui/notices.ts deleted)

`project-io.ts` loses `serializeRefProject` and its helpers; `app.ts` its command and menu entry; `types.ts` and `project-io.ts` the constants only it used; `images.ts` the `.ref` extension. `notices.ts` is deleted, and About formvis no longer shows the notice; its style rule goes. The Open dialog's folder button reads Project folder. The unused `renderer` icon goes. Comments describe formvis's own project file. Version 1.4.0. Removed:

```ts
import { deserialize, serialize, serializeRefProject } from './io/project-io';
  /** A project: `Name.ref.zip`, which unzips to the `Name.ref` package opens. */
  async function exportRefProject(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const { manifest, files, notes } = await serializeRefProject(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
        await deliver(await api.package(manifest, files, `${p.name}.ref`), `${p.name}.ref.zip`);
        if (notes.length) toast(`Exported as .ref with changes: ${notes.join(' ')}`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }
    { id: 'export-ref', label: 'Export .ref Project...', enabled: has, run: () => void exportRefProject() },
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? [{ label: 'Open Recent', items: [...recent.map((_, i) => `recent-${i}`), '-', 'clear-recent'] }] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-',
 *  Settings keep the field names and layouts `.ref` projects use, including dictionaries stored as alternating
/** The data a new adjustment layer starts with, in the `.ref` field layout. */
 *  names and meanings `.ref` projects use. */
/** The modes a `.ref` project can hold; others export as Normal. */
export const REF_BLEND_MODES: ReadonlySet<BlendMode> = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'color-dodge', 'color-burn', 'hue', 'saturation', 'color', 'luminosity']);
export const PROJECT_ACCEPT = '.fmv,.formvis,.ref,.canvasor,.zip,.psd,.psb';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|ref|canvasor|zip|psd|psb)$/i.test(f.name);
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB, timelineData, timelineFrom, type Timeline, addPattern, patternById, projectPatterns,
const REF_KINDS: ReadonlySet<string> = new Set(['Hue/Saturation', 'Levels', 'Curves', 'Exposure', 'Gradient Map', 'Grain']);
const REF_BLEND_LABELS: ReadonlySet<string> = new Set(BLEND_MODES.filter((b) => REF_BLEND_MODES.has(b.id)).map((b) => b.label));
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const asUuid = (v: unknown, map: Map<string, string>): string | null => {
  const s = str(v);
  if (!s) return null;
  let u = map.get(s);
  if (!u) { u = UUID.test(s) ? s : uid().toUpperCase(); map.set(s, u); }
  return u;
};
/** The document as a project (format `com.reference.project`, version 7), for `Name.ref/`: the same
 *  manifest and files as `serialize`, reshaped to what `ProjectStore.validate` accepts: UUID ids (regenerated where
 * formvis fell back to counters), image files named after them, folders without opacity or blend (the
 *  folders carry neither), adjustment layers without pixels, non-empty names and a resolution of 1 to 9600. Anything
 * changed is listed in `notes` so the person knows what will see differently. */
export async function serializeRefProject(doc: Doc, activeId: ID | null, paths: PathSet | null = null, timeline: Timeline | null = null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
  const { manifest, files } = await serialize(doc, activeId);
  const ids = new Map<string, string>(), rename = new Map<string, string>(), drop = new Set<string>(), notes: string[] = [];
  if (pathSetData(paths)) notes.push('Paths are left out; .ref projects have none.');
  if (timelineData(timeline)) notes.push('Animation frames are left out; .ref projects have none.');
  const layers = (Array.isArray(manifest.layers) ? manifest.layers.map(obj) : []).map((r) => {
    const id = asUuid(r.id, ids) as string, out: Json = { ...r, id };
    const name = (str(r.name) ?? '').trim();
    if (!name) { out.name = 'Layer'; notes.push('An unnamed layer was named "Layer".'); }
    if (r.parentID) out.parentID = asUuid(r.parentID, ids);
    if (r.maskSourceID) out.maskSourceID = asUuid(r.maskSourceID, ids);
    if (str(r.imageFile)) {
      if (r.adjustment) { drop.add(str(r.imageFile) as string); delete out.imageFile; }
      else { rename.set(str(r.imageFile) as string, `${id}.png`); out.imageFile = `${id}.png`; }
    }
    if (str(r.maskFile)) { rename.set(str(r.maskFile) as string, `${id}.mask.png`); out.maskFile = `${id}.mask.png`; }
    if (r.vector) { delete out.vector; notes.push(`"${name || 'Layer'}" goes as pixels; .ref projects have no shape layers.`); }
    if (str(r.smartSourceFile)) {
      drop.add(str(r.smartSourceFile) as string);
      if (str(r.smartFilterMaskFile)) drop.add(str(r.smartFilterMaskFile) as string);
      delete out.smartSourceFile;
      delete out.smartFilterMaskFile;
      delete out.smart;
      notes.push(`"${name || 'Layer'}" goes as pixels; .ref projects have no smart objects.`);
    }
    if (r.isGroup === true && ((typeof r.opacity === 'number' && r.opacity !== 1) || (r.blendMode && r.blendMode !== 'Normal'))) {
      delete out.opacity; delete out.blendMode;
      notes.push(`Folder "${name || 'Layer'}" loses its opacity or blend mode; .ref folders carry neither.`);
    }
    if (typeof out.blendMode === 'string' && !REF_BLEND_LABELS.has(out.blendMode)) {
      notes.push(`"${name || 'Layer'}" uses ${out.blendMode}, which .ref projects cannot hold; it exports as Normal.`);
      delete out.blendMode;
    }
    if (out.effects) {
      notes.push(`"${name || 'Layer'}" loses its layer style; .ref projects have none.`);
      delete out.effects;
    }
    if (out.text) {
      notes.push(`"${name || 'Layer'}" becomes plain pixels; .ref projects have no editable type.`);
      delete out.text;
    }
    if (r.adjustment && !REF_KINDS.has(String(obj(r.adjustment).kind))) {
      notes.push(`"${name || 'Layer'}" is a ${String(obj(r.adjustment).kind)} layer, which .ref projects cannot hold; it is left out.`);
      return null;
    }
    return out;
  }).filter((x): x is Json => x !== null);
  const res = num(manifest.resolution, 72);
  const out: Json = { ...manifest, format: 'com.reference.project', version: 7, documentID: asUuid(manifest.documentID, ids) ?? uid().toUpperCase(), resolution: Math.min(9600, Math.max(1, res)), layers };
  if (manifest.activeLayerID) out.activeLayerID = asUuid(manifest.activeLayerID, ids);
  if (res < 1 || res > 9600) notes.push(`Resolution ${res} was clamped to the .ref range, 1 to 9600.`);
  const parts = files.filter((f) => !drop.has(f.name)).map((f) => ({ ...f, name: rename.get(f.name) ?? f.name }));
  return { manifest: out, files: parts, notes };
}
.cv-notice { height: 132px; margin: 0; overflow-y: auto; padding: var(--space-2); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-muted); font-family: var(--font-mono); font-size: var(--fs-11); line-height: 1.45; white-space: pre-wrap; }
import { REFERENCE_NOTICE } from './notices';
    const row = el(`<div class="cv-welcome-actions"><button class="cv-btn" type="button" data-from="file">${icon('upload', 14)}From disk</button><button class="cv-btn" type="button" data-from="folder">${icon('folderOpen', 14)}.ref folder</button></div>`);
    this.body.appendChild(el('<p class="cv-note">formvis began as a port of the reference app by its authors. Parts derived from it are used under the MIT License:</p>'));
    const notice = el('<pre class="cv-notice"></pre>');
    setText(notice, REFERENCE_NOTICE);
    this.body.appendChild(notice);
  renderer: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>`,
/** the reference app's MIT License notice, shown in About formvis. formvis began as a port of the reference app by its authors
 *  and the license asks for this notice in every copy, the built web and desktop apps included. The same text is
 *  in `.docs/REFERENCE_NOTICE.md`. */
export const REFERENCE_NOTICE = `MIT License
Copyright (c) 2026 its authors
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
export const VERSION = '1.3.0';
```

## Home screen · _v1.3.0 (src/app.ts, src/ui/app-dialogs.ts, src/ui/prefs.ts, src/styles/shell.css; src/ui/home.ts and e2e/test_home_screen.py new)

`home.ts`: `HomeScreen` (New file, Open, recent projects; shown with no document when Auto Show is on, or from the brand mark; Esc leaves). `Prefs.autoShowHome`; Preferences gains a General section and opens on it. Removed:

```ts
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); recoveryDelay = pr.recoverySeconds * 1000; }),
    this.showSection('Interface');
export interface Prefs { historyStates: number; historyMB: number; regionRedraws: boolean; recoverySeconds: number }
export const DEFAULT_PREFS: Prefs = { historyStates: 100, historyMB: 256, regionRedraws: true, recoverySeconds: 20 };
```

## Preferences · _v1.2.0 (src/ui/app-dialogs.ts, src/app.ts, src/engine/index.ts, src/styles/dialogs.css; src/ui/prefs.ts and e2e/test_preferences.py new)

`SettingsDialog` is Preferences, with Interface, Performance and File Handling sections. `prefs.ts`: `Prefs`, `DEFAULT_PREFS`, `RECOVERY_CHOICES`, `loadPrefs`, `savePrefs`, `applyPrefs`. Engine: `historyLimits`, `setHistoryLimits`, applied in `addProject`. The app applies preferences at startup and reads the recovery delay from them. Removed:

```ts
    settings: new SettingsDialog(),
    { id: 'settings', label: 'Settings...', keys: ['Mod+,'], run: () => dialogs.settings.show() },
  let recoveryDelay = 20000;
  constructor() {
    super('Settings', 460);
    this.body.appendChild(row);
    this.field('Accent', this.accent);
    this.body.appendChild(el('<p class="cv-note">Theme and accent are shared with NodeMode on this device.</p>'));
  show(): void {
```

## Crop overlays · _v1.1.0 (src/extensions/tools/crop.ts; src/extensions/tools/crop-overlays.ts, tests/crop-overlays.test.ts and e2e/test_crop_overlays.py new)

`crop-overlays.ts`: `CropOverlay`, `CROP_OVERLAYS`, `ORIENTED`, `overlayLines`. The Crop tool keeps `overlayKind` and `overlayOrient`, draws the chosen overlay, takes O and Shift+O while a frame shows, and has an Overlay select. Removed:

```ts
    for (let i = 1; i < 3; i++) {
      const x = a.x + ((b.x - a.x) * i) / 3, y = a.y + ((b.y - a.y) * i) / 3;
      g.moveTo(x, a.y); g.lineTo(x, b.y); g.moveTo(a.x, y); g.lineTo(b.x, y);
```

## Delete Cropped Pixels · _v1.0.0 (src/engine/index.ts, src/extensions/tools/crop.ts; e2e/test_crop_delete_pixels.py new)

Engine: `cropDeletePixels` (on by default) and `deleteCroppedPixels`, called by `straightenCrop` after the crop. The Crop tool's bar has Delete Cropped Pixels before Content-Aware. Nothing removed: git reports no removed lines since v0.99.0.

## Brush Flow · _v0.99.0 (src/engine/stroke.ts, src/engine/index.ts, src/extensions/tools/brush.ts; e2e/test_brush_flow.py new)

`StrokeStyle.flow` scales each dab in `PixelStroke.dab`, times the pressure dynamics' flow. Engine: `brushFlow`, passed only to the Brush and Eraser's stroke in `beginStroke`. The Brush's bar has Flow after Opacity. Removed:

```ts
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color }, op, p.selection);
export interface StrokeStyle { diameter: number; hardness: number; opacity: number; color: RGB; tip?: SampledTip | null }
    const d = this.dynamics, info = { pressure }, r = this.radius * (d ? Math.max(0.01, computeOption(d.size, info)) : 1), flow = d ? computeOption(d.flow, info) : 1;
```

## Eyedropper Sample Size · _v0.98.0 (src/engine/index.ts, src/extensions/tools/eyedropper.ts; e2e/test_eyedropper_sample_size.py new)

Engine: `eyedropperSize`; `sampleColor` averages the Sample Size square, weighted by opacity. The Eyedropper's bar has a Sample Size select. Removed:

```ts
    const s = createSurface(1, 1);
    this.work.render({ doc: p.doc, target: s, view: translation(-Math.floor(pt.x), -Math.floor(pt.y)) });
    const d = ctxOf(s).getImageData(0, 0, 1, 1).data;
    return d[3] ? { r: d[0], g: d[1], b: d[2] } : null;
```

## canvasor projects open · _v0.97.0 (src/io/images.ts; e2e/test_canvasor_open.py new)

`PROJECT_ACCEPT` and `isProjectFile` take `.canvasor`, so the picker offers NodeMode canvasor projects and a dropped one opens as a project; the backend reads it (see the backend log). Removed:

```ts
export const PROJECT_ACCEPT = '.fmv,.formvis,.ref,.zip,.psd,.psb';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|ref|zip|psd|psb)$/i.test(f.name);
```

## The interface: menus, rail, options bar; settings dialogs; tool options · _v0.96.0 (src/ui/menu.ts, src/ui/rail.ts, src/ui/options.ts, src/ui/toast.ts, src/ui/panels/fill-dialog.ts, src/app.ts, src/engine/index.ts, src/engine/paths.ts, src/engine/kernels.ts, src/extensions/tools/{marquee,lasso,wand,gradient,healing-brush,pen,freeform-pen,type,remove}.ts, src/styles/{panels,shell}.css; src/ui/tool-groups.ts, src/ui/panels/stroke-path-dialog.ts and src/ui/panels/layer-dialogs.ts new; tests/antialias-mask.test.ts and fourteen browser test files new)

`menu.ts`: `MenuItem` may be a `SubMenu`; `PopupMenu` opens submenus beside rows, scrolls within the window, and closes a standalone menu on an outside press. `rail.ts`: one slot per tool group with a flyout, through `tool-groups.ts`. `options.ts`: wheel scrolling and edge chevrons. Engine: `fillWith` takes a name and region; `fillPathWith`, `featherMask`, `strokePathWith`, `STROKE_TOOLS`; `addLayer`, `addFolder` and `duplicateLayers` take their dialogs' settings; the wand's `antialias`; the Marquee's feather and style; the Lasso's feather; the Gradient's blend and dither. `paths.ts`: `samplePath`. `kernels.ts`: `antialiasMask`. Removed:

```ts
  const contextMenu = new PopupMenu(commands);
    { id: 'new-layer', label: 'New Layer', keys: ['Shift+Mod+N'], enabled: has, run: () => engine.addLayer() },
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-as', 'export-png', 'export-jpg', 'export-psd', 'export-psb', 'export-artboards', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill-workspace', 'content-fill', 'remove-wires', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', 'transform-warp', 'puppet-warp', '-', 'settings'] },
    { label: 'Image', items: ['adj-levels', 'adj-curves', 'adj-hsv', 'adj-exposure', 'adj-gradientMap', 'adj-grain', '-', ...PARAM_KINDS.map((k) => `adj-${k}`), '-', 'invert', '-', 'canvas-size', 'trim', 'reveal-all', 'generative-expand', 'image-size', 'upscale-2x', 'upscale-4x', '-', 'flip-canvas-h', 'flip-canvas-v'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', 'new-artboard', 'artboard-from-layers', 'artboard-options', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'shape-corners', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', '-', 'distribute-left', 'distribute-hcenter', 'distribute-right', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', 'distribute-hspace', 'distribute-vspace', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', 'select-subject', 'select-object', 'select-and-mask', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', 'feather', 'border', 'smooth', '-', 'path-selection', 'delete-path'] },
    { label: 'Filter', items: [...FILTERS.map((k) => `filter-${k}`), 'filter-liquify', '-', 'remove-bg', 'remove-bg-lite'] },
    { label: 'View', items: ['zoom-in', 'zoom-out', 'fit', 'actual', '-', 'toggle-rulers', 'toggle-guides', 'toggle-grid', 'lock-guides', 'clear-guides', 'new-guide', '-', 'pixel-grid', 'transform-controls'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'shape-corners', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
      // A letter picks its tool, keeping one already chosen from the same group; Shift with it cycles the group.
      else if (at < 0) engine.setTool(group[0].id);
import { fillVector, pathBounds, shiftPath, tracePath, type NamedPath, type PathSet, type VectorPath } from './paths';
import { wandMask } from './kernels';
import { noDynamics, type BrushDynamics, type BrushPreset } from './brush-dynamics';
  wand = { tolerance: 32, contiguous: true, sampleAll: false, sampleSize: 0 };
  addLayer(): void {
      const layer = newLayer(`Layer ${n}`, p.doc, { parentId });
  addFolder(): void {
      const group = newLayer(`Folder ${n}`, p.doc, { isGroup: true, parentId: active?.parentId ?? null });
  duplicateLayers(): void {
        const clones = subtree.map((l) => { const c = this.cloneLayer(l, l === src ? { name: `${l.name} copy` } : {}); idMap.set(l.id, c.id); return c; });
  fillWith(contents: { color: RGB } | { patternId: ID } | { history: true }, blend: BlendMode, opacity: number, preserveTransparency: boolean): void {
    this.regionEdit('Fill', ({ raster, target, rect, cover }) => {
    });
    const mask = wandMask(data, W, H, x, y, this.wand.tolerance, this.wand.contiguous, this.wand.sampleSize);
  gradientSettings: { shape: GradientType; style: string; reversed: boolean; opacity: number } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1 };
import type { Pt } from '../../engine';
    { kind: 'title', text: 'Clone Stamp' },
  const mask = SelectionMask.fromPath(doc.width, doc.height, boundsOf(poly), (c) => {
import { SelectionMask, type Pt, type Rect, type SelectionMode } from '../../engine';
    const r = dragRect(d.anchor, d.point, d.square, d.center);
    const mask = SelectionMask.fromPath(doc.width, doc.height, r, (c) => {
    const r = dragRect(draft.anchor, draft.point, draft.square, draft.center);
    { kind: 'toggle', label: 'Anti-alias', get: () => e.selectionAntialiased, set: (v) => { e.selectionAntialiased = v; e.emit('options', null); } },
  id: 'remove', label: 'Remove', key: 'J', order: 54,
.cv-menu { position: fixed; min-width: 232px; padding: var(--space-1); background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-window); }
.cv-rail-tools { display: flex; flex-direction: column; gap: var(--space-1); }
export type MenuItem = string | '-';
  private items: MenuItem[] = [];
  constructor(private readonly commands: Commands) {
    if (items.join('|') === this.items.join('|')) return;
    this.items = items;
      node.addEventListener('click', () => { this.close(); this.commands.run(item); });
    for (const r of this.rows) {
      const cmd = this.commands.get(r.id);
      if (!cmd) continue;
      setText(q(r.node, '.cv-menu-label'), this.commands.label(cmd));
      setDisabled(r.node, !this.commands.enabled(cmd));
      setClass(r.node, 'is-checked', !!cmd.checked?.());
    }
      if (!m.menu.panel.contains(t) && !m.btn.contains(t)) this.close();
    this.body.append(this.contentsRow.el, this.colorRowEl.el, this.patternRow.el, this.modeRow.el, this.opacityRow.el, this.preserveRow.el);
  show(): void {
    const ca = this.contents === 'contentAware';
    e.fillWith(k === 'history' ? { history: true } : color ? { color: { ...color } } : { patternId: this.patternId }, this.blend, this.opacity / 100, this.preserve);
import { hexOf, type Engine, type RGB, type ToolId } from '../engine';
import { toolList } from '../extensions/registry';
import { el, q, setClass, setHtml, setTitle, setValue } from './dom';
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();
    for (const t of toolList()) {
      const b = el<HTMLButtonElement>('<button class="cv-tool" type="button"></button>');
      b.setAttribute('aria-label', t.label);
      setTitle(b, t.id === 'brush' ? 'Brush (B) · Eraser (E)' : `${t.label} (${t.key})`);
      b.addEventListener('click', () => { engine.setTool(t.id); if (t.id === 'brush') engine.setBrushMode('paint'); });
      this.buttons.set(t.id, b);
    for (const t of toolList()) {
      const b = this.buttons.get(t.id);
      if (!b) continue;
      const key = t.icon(this.engine);
      setHtml(b, icon(key, 20), key);
      setClass(b, 'is-active', this.engine.tool === t.id);
```

## Pen and paths: paths in PSD, Path Selection, Freeform and Curvature Pens, path operations; single notices · _v0.95.0 (src/io/psd-paths.ts, src/engine/curve-fit.ts, src/extensions/tools/path-select.ts, freeform-pen.ts and curvature-pen.ts new; src/engine/paths.ts, src/engine/index.ts, src/engine/types.ts, src/extensions/tools/index.ts, src/io/psd.ts, src/ui/toast.ts, src/app.ts; tests/psd-paths.test.ts, tests/curve-fit.test.ts and six browser test files new)

`psd-paths.ts`: `pathRecords`, `pathFromRecords`, `addPathResources`, `readPathResources`, with operations in length records. `curve-fit.ts`: `simplify`, `smoothAnchors`. `paths.ts`: `PathOp`, `PATH_OPS`, `SubPath.op`, `fillVector`, operations saved and read. In the engine, shape layers, Make Selection and Fill Path fill through `fillVector`; `paintPath` passes the path. Three tools registered with their ids. `psd.ts` writes and reads the Paths panel and keeps operations both ways; `readPsdFile` returns `paths`. `toast.ts` renews a notice already showing. Removed:

```ts
            const { doc, notes, activeId } = await readPsdFile(f);
            engine.addProject(doc, f.name.replace(/\.psd$/i, ''), activeId);
        const { bytes, notes } = await writePsdFile(p.doc, flat, psb);
        if (engine.pathsOf(p).list.length) notes.push('Paths in the Paths panel are left out; shape layers keep their outlines.');
import { pathBounds, shiftPath, tracePath, type NamedPath, type PathSet, type VectorPath } from './paths';
    if (style.fill) { c.fillStyle = rgbCss(style.fill); c.fill(shape); }
    const shape = tracePath(vp);
    const mask = SelectionMask.fromPath(p.doc.width, p.doc.height, b, (c) => c.fill(shape), true);
  fillPath(): void { this.paintPath('Fill Path', (c, shape) => { c.fillStyle = rgbCss(this.fg); c.fill(shape); }); }
  private paintPath(name: string, paint: (c: Ctx2D, shape: Path2D) => void): void {
      paint(c, shape);
export interface SubPath { anchors: Anchor[]; closed: boolean }
export function pathData(vp: VectorPath | null): { subpaths: Array<{ closed: boolean; anchors: number[][] }> } | null {
    if (anchors.length) subpaths.push({ anchors, closed: (s as { closed?: unknown }).closed === true });
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'idle';
  for (const tool of [moveTool, marqueeTool, lassoTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, directSelectTool, penTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
export async function readPsdFile(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null }> {
  const psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true });
        if (vm.paths.some((bp) => bp.operation && bp.operation !== 'combine' && bp.operation !== 'subtract')) notes.push(`"${name}" combines shapes in ways formvis does not (intersect or exclude); its outline may differ once edited.`);
  return { doc: { ...doc, layers }, notes, activeId: layers.at(-1)?.id ?? null };
export async function writePsdFile(doc: Doc, composite: Surface, psb = false): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
          open: !sp.closed, operation: sp.closed && main && Math.sign(areas[i]) === -Math.sign(main) ? 'subtract' as const : 'combine' as const, fillRule: 'non-zero' as const,
  return { bytes: writePsd(psd, { generateThumbnail: false, psb }), notes };
  const node = el(`<div class="cv-toast${kind === 'error' ? ' is-error' : ''}" role="status"></div>`);
  window.setTimeout(() => node.remove(), kind === 'error' ? 6000 : 3600);
```

## Live corner radii, custom shapes, option rows that follow state · _v0.94.0 (src/engine/custom-shapes.ts and src/ui/panels/corners-dialog.ts new, src/engine/index.ts, src/engine/shape-paths.ts, src/extensions/registry.ts, src/extensions/tools/shape.ts, src/io/psd.ts, src/ui/options.ts, src/app.ts; tests/corners.test.ts, tests/custom-shapes.test.ts, e2e/test_corner_radii.py and e2e/test_custom_shapes.py new)

In the engine, `cornerRadiiOf`, `setShapeCorners`, four radii in `shapeRaster` and in Image Size; `CUSTOM_SHAPES` re-exported and custom shape layers named after their shape. `custom-shapes.ts`: `CUSTOM_SHAPES`, `parseShape`, `customShapePath`, `windingArea`. `shape-paths.ts`: the `custom` kind and option. `OptionSpec` takes `when`; `options.ts` shows or hides such rows in place. The Shape tool lists every row with a `when`, previews every outline with its curves. `psd.ts` writes holes as subtract and reads subtract as holes. `app.ts`: the Corner Radii dialog, command and menu entries. Removed:

```ts
    { label: 'Layer', items: ['new-layer', 'new-folder', 'new-artboard', 'artboard-from-layers', 'artboard-options', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', '-', 'distribute-left', 'distribute-hcenter', 'distribute-right', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', 'distribute-hspace', 'distribute-vspace', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
    const name = { polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart' }[kind];
        const shape = l.shape ? { ...l.shape, cornerRadius: (Number(l.shape.cornerRadius) || 0) * Math.min(sx, sy) } : null;
    else c.roundRect(0, 0, r.width, r.height, Math.min(Number(style.cornerRadius) || 0, r.width / 2, r.height / 2));
export type PathShapeKind = 'polygon' | 'star' | 'line' | 'arrow' | 'heart';
export interface PathShapeOptions { sides: number; starInset: number; weight: number; headLength: number; headWidth: number }
export const DEFAULT_PATH_SHAPE: PathShapeOptions = { sides: 5, starInset: 50, weight: 4, headLength: 24, headWidth: 24 };
/** The closed path for a boxed shape (polygon, star, heart) fitted to `box`. */
export function boxedShapePath(kind: 'polygon' | 'star' | 'heart', box: Rect, o: PathShapeOptions): VectorPath {
export type OptionSpec =
  | { kind: 'button'; label: string; icon?: string; run: () => void };
import { hexOf, type Pt } from '../../engine';
const NOUN: Record<string, string> = { rectangle: 'a rectangle', ellipse: 'an ellipse', polygon: 'a polygon', star: 'a star', heart: 'a heart', line: 'a line', arrow: 'an arrow' };
const KINDS = ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'heart'] as const;
      const path = lineLike(s.kind) ? linePath(s.kind as 'line' | 'arrow', draft.anchor, snapped(draft), s) : boxedShapePath(s.kind as 'polygon' | 'star' | 'heart', r, s);
      dashed(ctx, g, () => { const pts = path.subpaths[0].anchors.map((a) => v.toScreen(a)); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); });
      ...(s.kind === 'rectangle' ? [{ kind: 'range' as const, label: 'Corner radius', min: 0, max: 500, unit: 'px', get: () => s.cornerRadius, set: (v: number) => set({ cornerRadius: v }) }] : []),
      ...(s.kind === 'polygon' || s.kind === 'star' ? [{ kind: 'range' as const, label: s.kind === 'star' ? 'Points' : 'Sides', min: 3, max: 100, get: () => s.sides, set: (v: number) => set({ sides: Math.round(v) }) }] : []),
      ...(s.kind === 'star' ? [{ kind: 'range' as const, label: 'Indent', min: 1, max: 99, unit: '%', get: () => s.starInset, set: (v: number) => set({ starInset: v }) }] : []),
      ...(lineLike(s.kind) ? [{ kind: 'range' as const, label: 'Weight', min: 1, max: 1000, unit: 'px', get: () => s.weight, set: (v: number) => set({ weight: v }) }] : []),
      ...(s.kind === 'arrow' ? [{ kind: 'range' as const, label: 'Head length', min: 1, max: 1000, unit: 'px', get: () => s.headLength, set: (v: number) => set({ headLength: v }) }, { kind: 'range' as const, label: 'Head width', min: 1, max: 1000, unit: 'px', get: () => s.headWidth, set: (v: number) => set({ headWidth: v }) }] : []),
        if (vm.paths.some((bp) => bp.operation && bp.operation !== 'combine')) notes.push(`"${name}" combines shapes in ways formvis does not; its outline may differ once edited.`);
        out.vectorMask = { paths: v.path.subpaths.filter((sp) => sp.anchors.length).map((sp) => ({
          open: !sp.closed, operation: 'combine' as const, fillRule: 'non-zero' as const,
```

## Artboards · _v0.93.0 (src/ui/panels/artboard-dialog.ts new, src/engine/types.ts, src/engine/renderer.ts, src/engine/index.ts, src/io/project-io.ts, src/app.ts; tests/artboard.test.ts and e2e/test_artboards.py new)

`types.ts`: `Artboard`, `artboardFromData`, `Layer.artboard`. `renderer.ts`: `whitePixel`; `folderMasks` clips to an artboard's rectangle; the render loop's `backdrop` draws backgrounds. In the engine, `artboards`, `newArtboard`, `artboardFromLayers`, `setArtboard`, `artboardImage`; artboard rectangles follow the group transform, `resizeCanvas`, `resampleImage` and `flipCanvas`. `project-io.ts` saves and reads them. `app.ts`: the dialog, four commands, menu entries and `exportArtboards`. Removed:

```ts
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-as', 'export-png', 'export-jpg', 'export-psd', 'export-psb', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'replace-contents', 'update-linked', 'relink', 'embed-linked', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', '-', 'distribute-left', 'distribute-hcenter', 'distribute-right', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', 'distribute-hspace', 'distribute-vspace', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
      if (layer.isGroup || !entry.visible) continue;
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData } from './types';
      let layers: Layer[] = p.doc.layers.map((l) => ({ ...l, transform: shift(l.transform), mask: l.mask?.placement ? { ...l.mask, placement: shift(l.mask.placement) } : l.mask }));
        return { ...l, raster, mask, shape, transform: t };
```

## Colour profiles on export · _v0.92.0 (src/engine/icc.ts and src/io/embed-icc.ts new, src/app.ts, src/io/api.ts, src/io/export-presets.ts, src/ui/panels/export-dialog.ts; tests/icc.test.ts and e2e/test_colour_profiles.py new)

`icc.ts`: `SPACES`, `SpaceId`, `toXyz`, `convertPixels`, `iccProfile`. `embed-icc.ts`: `embedPng` (iCCP after IHDR, conflicting chunks dropped) and `embedJpeg` (APP2 after APP0, existing ICC_PROFILE segments removed). `ExportSettings.profile`, checked by `clampSettings` and kept with presets; the dialog's Colour profile row and PDF note; `exportAs` converts and embeds; `api.encode` sends an optional profile. Removed:

```ts
        const blob = ENGINE_FORMATS.has(s.format) ? await api.encode(await toBlob(c), s.format as 'avif' | 'tiff' | 'pdf', s.quality, p.doc.resolution ?? 72)
          : await toBlob(c, s.format === 'png' ? 'image/png' : s.format === 'jpg' ? 'image/jpeg' : 'image/webp', s.quality / 100);
  async encode(png: Blob, format: 'tiff' | 'pdf' | 'webp' | 'avif', quality = 90, dpi = 72): Promise<Blob> {
    return (await request('/io/encode', { method: 'POST', body: form({ format, quality: String(quality), dpi: String(dpi) }, [{ name: 'image.png', blob: png }], 'file') })).blob();
export interface ExportSettings { format: ExportFormat; quality: number; scale: number }
    const s = clampSettings({ format: o.format as ExportFormat, quality: Number(o.quality), scale: Number(o.scale) });
    this.body.append(this.presetRow.el, this.formatRow.el, this.qualityRow.el, this.scaleRow.el, this.sizeNote, manage);
    try { localStorage.setItem(KEY, JSON.stringify(this.saved.map(({ id, name, format, quality, scale }) => ({ id, name, format, quality, scale })))); } catch { toast('Presets cannot be saved in this browser.', 'error'); }
    if (doc) { const z = exportSize(doc.width, doc.height, s.scale); setText(this.sizeNote, `${z.w} x ${z.h} px · ${exportName(this.engine.current?.name ?? 'Untitled', s)}`); }
```

## Adjustment layers in PSD and PSB; Export PSB · _v0.91.0 (src/io/psd-adjust.ts new, src/io/psd.ts, src/io/images.ts, src/app.ts, .github/workflows/ci.yml; tests/psd-adjust.test.ts and e2e/test_psd_adjustments.py new)

`psd-adjust.ts`: `toPsdAdjustment` and `fromPsdAdjustment` for fifteen kinds. `psd.ts`: `maskOnto` (the writer's mask code as a helper), adjustment layers written with masks, opacity, blend, visibility and clipping, and read back as live ones; `writePsdFile` takes `psb`; `.psb` recognised. `app.ts`: `exportPsd(psb)` and the `export-psb` command in the File menu. CI installs psd-tools for the independent check. Removed:

```ts
  async function exportPsd(): Promise<void> {
        const { bytes, notes } = await writePsdFile(p.doc, flat);
        await deliver(new Blob([bytes], { type: 'image/vnd.adobe.photoshop' }), `${p.name}.psd`);
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-as', 'export-png', 'export-jpg', 'export-psd', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
export const PROJECT_ACCEPT = '.fmv,.formvis,.ref,.zip,.psd';
export const isProjectFile = (f: File): boolean => /\.(fmv|formvis|ref|zip|psd)$/i.test(f.name);
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt, defaultEffects, patternById, addPattern, projectPatterns, createSurface, ctxOf, type LayerEffects, renderText, textKey, TEXT_FONTS, type TextSpec,
export const isPsdFile = (f: File): boolean => /\.psd$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';
      if (!pl.canvas || !pl.canvas.width || !pl.canvas.height) {
        if (pl.adjustment) notes.push(`"${name}" is an adjustment layer; formvis left it out.`);
        continue;
      }
      const w = pl.canvas.width, h = pl.canvas.height, raster = Raster.from(pl.canvas, w, h);
      const layer = newLayer(name, doc, { raster, parentId, transform: { ...docTransform(w, h), x: pl.left ?? 0, y: pl.top ?? 0 }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend });
      if (tx && typeof tx.text === 'string') {
export async function writePsdFile(doc: Doc, composite: Surface): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
    if (l.adjustment) { notes.push(`"${l.name}" is an adjustment layer; it is left out of the PSD.`); return null; }
    const mk = l.mask;
    if (mk?.raster) {
      const mp = placed(mk.raster, mk.placement ?? l.transform);
      if (mp) {
        const g = mp.c.getContext('2d') as CanvasRenderingContext2D, img = g.getImageData(0, 0, mp.c.width, mp.c.height);
        for (let i = 0; i < img.data.length; i += 4) { const a = img.data[i + 3]; img.data[i] = img.data[i + 1] = img.data[i + 2] = a; img.data[i + 3] = 255; }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.putImageData(img, 0, 0);
        out.mask = { canvas: mp.c, left: mp.x, top: mp.y, defaultColor: maskEdgeTone(mk.raster), disabled: !mk.enabled };
      }
    }
  return { bytes: writePsd(psd, { generateThumbnail: false }), notes };
```

In `.github/workflows/ci.yml`. Removed:

```yaml
      - run: pip install pytest playwright
```

## .abr brush import, live option lists, .fmv projects · _v0.90.0 (src/engine/abr.ts and src/io/brush-library.ts new, src/engine/stroke.ts, src/engine/brush-dynamics.ts, src/engine/index.ts, src/extensions/registry.ts, src/ui/options.ts, src/extensions/tools/brush.ts, src/extensions/tools/gradient.ts, src/io/images.ts, src/app.ts; tests/abr.test.ts, e2e/test_abr_import.py and e2e/test_sny_projects.py new)

`abr.ts`: `parseAbr` for versions 1, 2 and 6 to 10, `SampledTip`, `AbrBrush`. `stroke.ts`: `sampledTip`, a tip in the style, `tipAspect`, spacing a quarter of a sampled tip. `brush-dynamics.ts`: `tip` on presets, `importedBrushPresets`, `setImportedBrushPresets`, `allBrushPresets`, `presetFromTip`. In the engine, `tip` on brush settings (kept by `setBrush`, set by presets) and `uiHooks.importBrushes`. `brush-library.ts`: IndexedDB keeping and `importAbr`. The select option spec takes a `live` list, patched in place by the options bar; the Brush Preset and Gradient Colors lists use it. Projects download as `.fmv`; `.fmv` and `.formvis` are accepted. Removed:

```ts
        await deliver(await api.package(manifest, files), `${p.name}.formvis`);
export interface BrushPreset { id: string; name: string; description: string; diameter: number; hardness: number; opacity: number; dynamics: BrushDynamics }
export interface BrushSettings { diameter: number; hardness: number; opacity: number }
    this.setBrush({ diameter: preset.diameter, hardness: preset.hardness, opacity: preset.opacity });
  uiHooks: { gradientEditor?: () => void } = {};
export interface StrokeStyle { diameter: number; hardness: number; opacity: number; color: RGB }
    // Dabs every 1.5% of the diameter for a hard tip and 2.5% for a soft one.
    this.spacing = Math.max(0.5, style.diameter * (style.hardness >= 0.99 ? 0.015 : 0.025));
    this.tip = brushTip(style.diameter * matScale(this.toLocal), style.hardness, style.color);
    this.paintCtx.drawImage(this.tip, p.x - r, p.y - r, r * 2, r * 2);
  | { kind: 'select'; label: string; choices: ReadonlyArray<{ id: string; label: string }>; get: () => string; set: (id: string) => void }
import { BUILTIN_BRUSH_PRESETS, identityOption, pressureOption } from '../../engine/brush-dynamics';
    { kind: 'select', label: 'Preset', choices: [{ id: '', label: 'Custom' }, ...BUILTIN_BRUSH_PRESETS.map((b) => ({ id: b.id, label: b.name }))], get: () => e.brushPresetId ?? '', set: (id) => { const b = BUILTIN_BRUSH_PRESETS.find((x) => x.id === id); if (b) e.applyBrushPreset(b); else { e.brushPresetId = null; e.emit('options', null); } } },
      { kind: 'select', label: 'Colors', choices: allGradients().map((p) => ({ id: p.id, label: p.label })), get: () => e.gradientSettings.style, set: (v) => set(() => { e.gradientSettings.style = v; }) },
export const PROJECT_ACCEPT = '.formvis,.ref,.zip,.psd';
export const isProjectFile = (f: File): boolean => /\.(formvis|ref|zip|psd)$/i.test(f.name);
        sync.push(() => { const v = spec.get(); if (box.value !== v) box.value = v; });
```

In `src-tauri/tauri.conf.json` the association takes `.fmv` beside `.formvis`. Removed:

```json
      { "ext": ["formvis"], "name": "formvis Project", "description": "formvis layered image project", "role": "Editor", "mimeType": "application/x-formvis" },
```

## Shake Reduction · _v0.89.0 (src/engine/shake.ts new, src/engine/filters-more.ts, src/engine/filter-jobs.ts, src/engine/filter-worker.ts, src/ui/panels/filter-panel.ts, src/app.ts; tests/shake.test.ts and e2e/test_shake_reduction.py new)

`shake.ts`: `estimateShake` (angle by the along-to-across derivative ratio, length by the derivative's autocorrelation dip) with `ShakeTrace`. `filters-more.ts`: `ShakeSettings`, `shakeMargin` and `shakeReduce` (Smart Sharpen's motion deconvolution). The job types, the worker and the filter panel (kind, label, defaults, runner, margin, a section with an Estimate button and a note, estimating on open) take the new kind; `app.ts` lists it after Smart Sharpen. Removed:

```ts
  const FILTERS: FilterKind[] = ['develop', 'gaussianBlur', 'lensBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'smartSharpen', 'unsharpMask'];
import type { SmartSharpenSettings } from './filters-more';
export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState; lensRadius: number; lensBrightness: number; lensThreshold: number; smart: SmartSharpenSettings }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen';
import { lensBlur, smartSharpen } from './filters-more';
import { lensBlur, lensBlurMargin, smartSharpen, smartSharpenMargin, type SharpenRemove } from '../../engine/filters-more';
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop' | 'lensBlur' | 'smartSharpen';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop', lensBlur: 'Lens Blur', smartSharpen: 'Smart Sharpen' };
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : kind === 'lensBlur' ? lensBlurMargin(s.lensRadius) : kind === 'smartSharpen' ? smartSharpenMargin(s.smart) : 0;
```

## Remove tool and Remove Wires and Cables · _v0.88.0 (src/engine/distractions.ts and src/extensions/tools/remove.ts new, src/engine/index.ts, src/engine/types.ts, src/extensions/tools/index.ts, src/ui/stage.ts, src/app.ts; tests/distractions.test.ts and e2e/test_remove_tool.py new)

`distractions.ts`: `findWires` (black-hat, threshold, long thin pieces, grown) with `WIRE_DEFAULTS`. In the engine, the `remove` stroke kind, `removePatch` (content-aware fill of the grown stroke) and `removeWires` (Create Texture fill of the found wires, within the selection); Remove warms stroke surfaces. `types.ts` adds the `remove` tool id; the tool registers after Spot Healing; the stage allows right-drag sizing for it; `app.ts` adds `remove-wires` to the Edit menu. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill-workspace', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', 'transform-warp', 'puppet-warp', '-', 'settings'] },
const PAINT_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['brush', 'cloneStamp', 'healingBrush', 'spotHealing']);
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode; healFrom?: Pt } | null = null;
    const patch = st.heal ? this.healPatch(st.s, st.heal) : st.healFrom ? this.healFromPatch(st.s, st.healFrom) : st.s.commit();
  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge', pt: Pt, shift: boolean): boolean {
    p.history.begin({ heal: 'Spot Healing', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge' }[kind], p.snapshot());
    const style = kind === 'heal' ? { ...this.brush, opacity: 0.45, color: white } : { ...this.brush, color: white };
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s, heal: kind === 'heal' ? this.retouch.healMode : undefined, healFrom };
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'idle';
  for (const tool of [moveTool, marqueeTool, lassoTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, directSelectTool, penTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
  private static readonly brushTools = new Set(['brush', 'spotHealing', 'cloneStamp', 'smear']);
```

## Layer style depth: contours, Global Light, stroke positions, several instances · _v0.87.0 (src/engine/style-extras.ts new, src/engine/types.ts, src/engine/renderer.ts, src/engine/index.ts, src/io/project-io.ts, src/ui/panels/layer-style-dialog.ts; tests/style-extras.test.ts, tests/effect-instances.test.ts, e2e/test_layer_style_depth.py and e2e/test_effect_instances.py new)

`style-extras.ts`: `CONTOURS`, `contourLut`, `applyContour`, `isContour`, `GlobalLight`, `DEFAULT_GLOBAL_LIGHT`, `withGlobalLight`. `types.ts`: contour, `useGlobal` and `position` fields; `Doc.globalLight`; `EffectExtras`, `MULTI_EFFECTS`, `MAX_EXTRA`, `instances`; `effectsActive` and `effectsFromData` extended. `renderer.ts`: Global Light resolved where effects are read; `contoured`; Inside and Center strokes above; every instance drawn; `fxReach`. In the engine, `setGlobalLight` and `applyStyleAndLight`. `project-io.ts` saves the light. The dialog: the light at the top, contours, Use Global Light, Position, Instances rows, `assembled` and `previewFx`. Removed:

```ts
import { canvasBlend, compositeOp, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform, effectsActive, type LayerEffects, type RGB, type Rect } from './types';
      const fx = ov && 'effects' in ov ? ov.effects ?? null : layer.effects ?? null, styled = effectsActive(fx);
    const reach = Math.max(fx.bevel.enabled ? (fx.bevel.size + fx.bevel.soften) * 2 : 0, d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) + 4;
    const reach = Math.max(bv.enabled ? (bv.size + bv.soften) * 2 : 0, d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) * scale + 2;
      const go = fx.gradientOverlay;
      if (go.enabled && go.opacity > 0) {
      if (co.enabled && co.opacity > 0) lay(kept((c) => { c.fillStyle = css(co.color); c.fillRect(0, 0, bw, bh); }), co.opacity * opacity, compositeOp(co.blend));
      if (ig.enabled && ig.opacity > 0 && ig.size > 0) lay(castByInverse(ig.color, ig.size * scale, 0, 0), ig.opacity * opacity, compositeOp(ig.blend));
      if (is.enabled && is.opacity > 0) {
        lay(castByInverse(is.color, is.size * scale, -Math.cos(rad) * is.distance * scale, Math.sin(rad) * is.distance * scale), is.opacity * opacity, compositeOp(is.blend));
    if (d.enabled && d.opacity > 0) {
      lay(shadowOf(d.color, d.size * scale, -Math.cos(rad) * d.distance * scale, Math.sin(rad) * d.distance * scale), d.opacity * opacity, compositeOp(d.blend));
    if (g.enabled && g.opacity > 0 && g.size > 0) lay(shadowOf(g.color, g.size * scale, 0, 0), g.opacity * opacity, compositeOp(g.blend));
    if (k.enabled && k.opacity > 0 && k.size * scale > 0) {
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[] }
export interface DropShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number }
export interface OuterGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number }
export interface StrokeEffect { enabled: boolean; color: RGB; opacity: number; size: number }
export interface InnerShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number }
export interface InnerGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number }
export interface BevelEffect { enabled: boolean; style: 'inner' | 'outer' | 'emboss' | 'pillow'; depth: number; down: boolean; size: number; soften: number; angle: number; altitude: number; highlight: RGB; highlightOpacity: number; highlightBlend: BlendMode; shadow: RGB; shadowOpacity: number; shadowBlend: BlendMode }
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect; satin: SatinEffect; patternOverlay: PatternOverlayEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled || fx.bevel.enabled || fx.satin.enabled || fx.patternOverlay.enabled);
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}) };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(guides.length ? { guides } : {}) }, activeId: str(manifest.activeLayerID) };
import { defaultEffects, effectsActive, type Engine, type LayerEffects, type RGB, allPatterns } from '../../engine';
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow, Satin, Color Overlay, Gradient Overlay, Pattern Overlay and Bevel & Emboss for the
 *  active pixel layer, shown live while the dialog is open. OK applies them as one undo step; Cancel leaves the layer as it was. */
    check('Stroke (outside)', () => fx().stroke.enabled, (v) => { fx().stroke.enabled = v; });
    this.engine.previewLayerEffects(layer.id, this.fx);
    if (this.layerId) this.engine.previewLayerEffects(this.layerId, this.fx);
    const id = this.layerId, fx = effectsActive(this.fx) ? structuredClone(this.fx) : null;
    if (id) { this.engine.setLayerEffects(id, fx); this.onApplied?.(fx ? structuredClone(fx) : null); }
```

## Replace Contents, smart filter masks, linked smart objects · _v0.86.0 (src/engine/types.ts, src/engine/index.ts, src/io/project-io.ts, src/app.ts; src/io/links.ts new; e2e/test_smart_objects_more.py and e2e/test_linked_smart_objects.py new)

`types.ts`: `SmartLink`, and `SmartObject` gains `filterMask`, `filterMaskEnabled` and `link`. In the engine, `maskFilters` blends filtered and unfiltered renders through the mask in `renderSmart` and `renderSmartAsync`; `restackSoon` and `restack` take a mask change and an `extra` patch and keep every smart object field through re-renders; `replaceContents`, `addSmartFilterMask`, `deleteSmartFilterMask`, `toggleSmartFilterMask`, `placeLinked`, `updateLinkedContents` and `embedLinked`; Distort renders with the mask. `project-io.ts` saves the mask image and the link and reads them back checked; `.ref` drops the mask with the source. `links.ts`: sources (file handles kept in IndexedDB, or a one-time pick), `registerLinkSource`, `pickLinkSource`, `placeLinked`, `updateLinked`, `relink`. `app.ts`: the Replace Contents input, `pickOnce`, eight commands on the File and Layer menus and the context menu. Removed:

```ts
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-as', 'export-png', 'export-jpg', 'export-psd', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', '-', 'distribute-left', 'distribute-hcenter', 'distribute-right', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', 'distribute-hspace', 'distribute-vspace', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle, effectsFromData } from './types';
  private renderSmart(source: Raster, filters: SmartFilter[]): Raster {
  private async renderSmartAsync(source: Raster, filters: SmartFilter[]): Promise<Raster> {
  private restackSoon(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string): boolean {
      return this.restack(p, id, source, stack, name);
      const rendered = await this.renderSmartAsync(src, stack);
      this.restack(p, id, source, stack, name, rendered);
  private restack(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, rendered: Raster | null = null): boolean {
      const stack = structuredClone(filters ?? l.smart.filters), raster = rendered ?? this.renderSmart(src, stack), old = l.raster as Raster, t = l.transform;
        p.updateLayer(id, { smart: { source: src, filters: stack, warp, warpAt: w.t }, raster: w.raster, transform: w.t, mask });
      p.updateLayer(id, { smart: { source: src, filters: stack }, raster, transform: { ...t, x: cx - w / 2, y: cy - h / 2, w, h }, mask });
      const R = warp ? this.renderSmart(l.smart.source, l.smart.filters) : l.raster, rt = warp ? docTransform(R.width, R.height) : l.transform;
export interface SmartObject { source: Raster; filters: SmartFilter[]; warp?: Pt[] | null; warpAt?: Transform | null }
      r.smart = { filters: l.smart.filters.map(({ id, kind, settings, enabled }) => ({ id, kind, settings, enabled })), warp: l.smart.warp ?? null, warpAt: l.smart.warpAt ? transformRecord(l.smart.warpAt) : null };
  for (const r of records) { for (const n of [str(r.imageFile), str(r.maskFile), str(r.smartSourceFile)]) if (n) names.add(n); }
    const smart = raster && sourceImage ? { source: Raster.from(sourceImage, sourceImage.width, sourceImage.height), filters: smartFiltersFrom(r.smart), warp: warpPts, warpAt: warpPts && sw.warpAt ? transformFrom(sw.warpAt, raster.width, raster.height) : null } : null;
```

## Gradient Editor, noise gradients, History fill · _v0.85.0 (src/engine/gradients.ts, src/engine/history.ts, src/engine/index.ts, src/extensions/tools/gradient.ts, src/ui/panels/fill-dialog.ts, src/styles/dialogs.css, src/app.ts; src/ui/panels/gradient-editor.ts new; tests/gradient-editor.test.ts and e2e/test_history_fill_gradient_editor.py new)

`gradients.ts`: `customGradients`, `setCustomGradients`, `allGradients`, `gradientsFromJson` and `noiseStops`; `presetById` looks in saved gradients first. `history.ts`: `origin()`. In the engine, `uiHooks`, `historySource` and a History branch in `fillWith`. `gradient-editor.ts` is the editor with `loadSavedGradients`; the Gradient tool lists every gradient and has Edit; the Fill dialog has History; `dialogs.css` styles the bar and strip; `app.ts` registers the editor, loads saved gradients and sets the hook. Removed:

```ts
export const presetById = (id: string): GradientPreset => GRADIENT_PRESETS.find((p) => p.id === id) ?? GRADIENT_PRESETS[0];
  fillWith(contents: { color: RGB } | { patternId: ID }, blend: BlendMode, opacity: number, preserveTransparency: boolean): void {
      if (pat) { const cp = sc.createPattern(pat.surface, 'repeat'); if (cp) { cp.setTransform(new DOMMatrix().translate(-rect.x, -rect.y)); sc.fillStyle = cp; } }
      else if ('color' in contents) sc.fillStyle = rgbCss(contents.color);
      sc.fillRect(0, 0, rect.w, rect.h);
import { GRADIENT_PRESETS, GRADIENT_TYPES, type GradientType } from '../../engine/gradients';
      { kind: 'select', label: 'Colors', choices: GRADIENT_PRESETS.map((p) => ({ id: p.id, label: p.label })), get: () => e.gradientSettings.style, set: (v) => set(() => { e.gradientSettings.style = v; }) },
type Contents = 'fg' | 'bg' | 'color' | 'black' | 'gray' | 'white' | 'pattern' | 'contentAware';
  ['fg', 'Foreground Color'], ['bg', 'Background Color'], ['color', 'Color...'], ['contentAware', 'Content-Aware'], ['pattern', 'Pattern'], ['black', 'Black'], ['gray', '50% Gray'], ['white', 'White'],
    e.fillWith(color ? { color: { ...color } } : { patternId: this.patternId }, this.blend, this.opacity / 100, this.preserve);
```

## Content-Aware Fill workspace · _v0.84.0 (src/engine/retouch.ts, src/engine/index.ts, src/styles/dialogs.css, src/app.ts; src/ui/panels/content-fill-dialog.ts new; tests/content-fill-sampling.test.ts and e2e/test_content_fill_workspace.py new)

`contentFill` takes an optional sampling mask: sources must lie wholly inside it (a second summed-area table) and the region grows to include it; without one it is unchanged. `Engine.contentAwareFillWith` maps a document-space sampling area into the layer's pixels and outputs to the current layer, a new layer of only the filled pixels (upright, unscaled layers; others go to a duplicate) or a duplicate, as one step. `content-fill-dialog.ts` is the workspace (Auto, Rectangular or painted Custom sampling, Show Result, Output To). `dialogs.css` adds `.cv-fill-canvas` to the shared preview rule. `app.ts` adds `content-fill-workspace` and relabels the one-click fill Quick Content-Aware Fill. Removed:

```ts
    { id: 'content-fill', label: 'Content-Aware Fill', keys: ['Shift+Backspace'], enabled: () => pixel() && selected(), run: () => { void engine.task(async () => { await new Promise((r) => requestAnimationFrame(() => window.setTimeout(r, 0))); engine.contentAwareFill(); }); } },
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', 'transform-warp', 'puppet-warp', '-', 'settings'] },
export function contentFill(px: Uint8ClampedArray, mask: Uint8Array, w: number, h: number): boolean {
  const rx0 = Math.max(0, x0 - margin), ry0 = Math.max(0, y0 - margin);
  const rw = Math.min(w - 1, x1 + margin) - rx0 + 1, rh = Math.min(h - 1, y1 + margin) - ry0 + 1, rn = rw * rh;
  for (let cy = half; cy < rh - half; cy++) for (let cx = half; cx < rw - half; cx++) if (!holeIn(cx - half, cy - half, cx + half, cy + half)) sources.push(cy * rw + cx);
```

```css
.cv-liquify-canvas, .cv-mask-canvas { display: block; width: 640px; max-width: 100%; aspect-ratio: 640 / 440; height: auto; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: crosshair; touch-action: none; }
```

## Select and Mask · _v0.83.0 (src/engine/select-mask.ts and src/ui/panels/select-mask-dialog.ts new, src/engine/index.ts, src/styles/dialogs.css, src/app.ts; tests/select-mask.test.ts and e2e/test_select_mask.py new)

`select-mask.ts`: `RefineSettings`, `DEFAULT_REFINE` and `refineSelection`, running Radius, Smooth, Feather, Contrast and Shift Edge in Photoshop's order, each `refineMatte` call in advanced mode doing one thing. `select-mask-dialog.ts`: the workspace (fixed preview under `.cv-mask-canvas`, four view modes, five sliders, Output To). `Engine.applyRefinedSelection` sets the refined selection and runs the chosen output (selection, layer mask replacing any, Layer via Copy, or a duplicate with a mask and the original hidden) as one step. `dialogs.css` gives the new preview class the Liquify preview's style. `app.ts` adds `select-and-mask` (Alt+Mod+R) to the Select menu. Removed:

```ts
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', 'select-subject', 'select-object', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', 'feather', 'border', 'smooth', '-', 'path-selection', 'delete-path'] },
```

```css
.cv-liquify-canvas { display: block; width: 640px; max-width: 100%; aspect-ratio: 640 / 440; height: auto; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: crosshair; touch-action: none; }
```

## Crop straighten, Content-Aware edges, Perspective Crop; the status hint · _v0.82.0 (src/engine/index.ts, src/extensions/tools/crop.ts, src/styles/shell.css; tests/crop-straighten.test.ts, e2e/test_crop_straighten.py and e2e/test_perspective_crop.py new)

In the engine, `straightenCrop` (every layer turned about the frame's centre, the crop, and `fillOpenedEdges`, content-aware fill of what the bottom pixel layer no longer covers) and `perspectiveCrop` (the quad's inverse homography scaled to a rectangle, every pixel layer and linked mask warped through it). The Crop tool gains `angle`, `contentAware`, `leveling` with `levelAngle`, and `perspective` with `quad`, `cornerDrag`, `quadOf` and `hitCorner`; commit goes through the new engine methods; Escape and Cancel reset all of it; the overlay shows the level line, the tilted region to keep, and the quad. `shell.css`: the status hint fills the remaining space with its text right-aligned, so its box no longer moves as its text changes. Removed:

```ts
  e.cropTo(r);
    if (e.key === 'Enter' && frame) { commit(ctx.engine); return true; }
    if (e.key === 'Escape' && frame) { frame = null; drag = null; ctx.engine.emit('overlay', null); ctx.engine.emit('options', null); return true; }
    { kind: 'button', label: 'Cancel', icon: 'close', run: () => { frame = null; drag = null; e.emit('overlay', null); e.emit('options', null); } },
```

```css
.cv-st-hint { margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
```

## Puppet Warp · _v0.81.0 (src/engine/puppet.ts new, src/engine/index.ts, src/extensions/tools/move.ts, src/app.ts; tests/puppet.test.ts and e2e/test_puppet.py new)

`puppet.ts` is rigid moving least squares (Schaefer, McPhail and Warren, 2006), written for formvis: `mlsRigid` and `puppetImage` (the backward map on an 8 px grid, interpolated). In the engine, `puppetEdit` with `beginPuppetWarp`, `addPuppetPin`, `movePuppetPin`, `removePuppetPin`, `schedulePuppet`, `puppetRender`, `applyPuppetWarp`, `cancelPuppetWarp` and `dropPuppet`, and the preview in the layer overrides. The Move tool places, drags and Alt-removes pins (`pinDrag`, `puppetPin`), applies on Enter, cancels on Escape and draws the pins. `app.ts` adds `puppet-warp` to the Edit menu. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', 'transform-warp', '-', 'settings'] },
    if (ctx.engine.meshWarpEdit) return;
```

## Liquify workspace · _v0.80.0 (src/engine/liquify.ts and src/ui/panels/liquify-dialog.ts new, src/engine/index.ts, src/styles/dialogs.css, src/app.ts; tests/liquify.test.ts and e2e/test_liquify.py new)

`liquify.ts` ports NodeMode's displacement field (`studio/pixel/liquify.ts`: `makeField`, `fieldAt`, `pushField`; nodemode_dev v8.73.1, the owner's build, MIT) and adds `dabField` (Reconstruct, Twirl both ways, Pucker, Bloat), `resetField`, `fieldIsZero` and `liquifyImage`, which resamples from the original pixels at any scale. `liquify-dialog.ts` is the workspace: a fixed 640 x 440 preview, the six tools, size, pressure, Restore All, OK and Cancel; its member is `liq`, since the base `Dialog` already has a `field` method. `Engine.applyLiquify` resamples the layer through the field in one step. `dialogs.css` styles the preview and the active tool. `app.ts` adds `filter-liquify` (Shift+Mod+X) to the Filter menu. Removed:

```ts
    { label: 'Filter', items: [...FILTERS.map((k) => `filter-${k}`), '-', 'remove-bg', 'remove-bg-lite'] },
```

## Mesh warp and Edit > Warp · _v0.79.0 (src/engine/mesh-warp.ts new, src/engine/index.ts, src/extensions/tools/move.ts, src/app.ts; tests/mesh-warp.test.ts and e2e/test_warp.py new)

`mesh-warp.ts` is ported from NodeMode's formvis studio (`studio/pixel/transform.ts`, nodemode_dev v8.73.1, the owner's build, MIT): `convexQuad`, `invBilinear`, `meshSurfacePoint`, a private `invSmooth`, `meshWarpImage` (plain or smooth, on ImageData instead of a tile store) and `uniformGrid`. In the engine, `meshWarpEdit` with `beginMeshWarp`, `moveMeshWarpPoint` (folding moves ignored, preview once per frame), `meshWarped`, `applyMeshWarp` (one Warp step, trimmed), `cancelMeshWarp` and `dropMeshWarp`, and the pending warp's preview in the layer overrides. The Move tool drags control points (`warpDrag`, `warpPoint`), applies on Enter, cancels on Escape and draws the grid as the surface's curves. `app.ts` adds `transform-warp` to the Edit menu. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-dialog', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', '-', 'settings'] },
```

## Snapping to guides and the grid · _v0.78.0 (src/engine/index.ts; e2e/test_snapping.py new)

`snapMove` adds shown guides and the grid's nearest subdivision lines to its targets, and measures layers by `snapBox`: the visible pixels under a transform, the scan cached per raster version in `contentBoxes`, falling back to the whole bounds for an empty layer. Removed:

```ts
      const b = transformBounds(l.transform);
    const b = transformBounds(t);
```

## Rulers, guides and grid · _v0.77.0 (types, index, project-io, palette, stage, shell.css, app; guide-dialog new)

`Guide` and `Doc.guides` in `types.ts`; in the engine, `view`, `guideDraft`, `setView`, `addGuide`, `moveGuide`, `removeGuide`, `clearGuides` (each an undo step through `setGuides`) and `guideAt`; `project-io` writes guides when present and reads them defensively (on the canvas, at most 1000); the palette gains ruler colours from tokens; the stage draws the grid and guides under the tool overlay, draws the rulers (`renderRulers`, `rulerStep`), lets the Move tool drag guides and deletes those dropped on a ruler or off the view, and places guides dragged out of a ruler (`bindRuler`); `shell.css` lays the rulers over the stage on `--z-raised`; `app.ts` adds the ruler canvases, six View commands and the New Guide dialog. Removed:

```ts
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[] }
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle, effectsFromData } from './types';
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers };
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers }, activeId: str(manifest.activeLayerID) };
export interface StagePaint extends Paint { checkerA: string; checkerB: string; grid: string; edge: string }
    { label: 'View', items: ['zoom-in', 'zoom-out', 'fit', 'actual', '-', 'pixel-grid', 'transform-controls'] },
```

## Export As · _v0.76.0 (src/app.ts, src/styles/dialogs.css; src/io/export-presets.ts and src/ui/panels/export-dialog.ts new)

`export-presets.ts` holds the formats, built-in presets, `clampSettings`, `presetsFromStorage`, `exportName` and `exportSize`; `export-dialog.ts` is File > Export As, rows kept in place and preset options patched in place; `app.ts` adds `exportAs` (scale, JPEG on white, browser or engine encoding) and the `export-as` command on the File menu; `dialogs.css` adds `.cv-row-actions`. Removed:

```ts
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', 'export-psd', 'export-webp', 'export-tiff', 'export-pdf', 'export-avif', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
```

### src/app.ts · keydown and paste targets · _v0.75.0, logged late

The 0.75.0 fix (4b9497e) was made after that version's entry was written, so its removed lines are quoted here. Both handlers now narrow the target with `instanceof Element`. Removed (the same line in each handler):

```ts
    const target = e.target as HTMLElement | null;
```

## Export WebP, TIFF, PDF and AVIF · _v0.75.0 (src/app.ts, src/io/api.ts, src/engine/index.ts; e2e/test_export_formats.py new)

`api.encode` posts a PNG to `/io/encode`; `exportImage` takes WebP from the canvas and TIFF, PDF and AVIF through the engine (unavailable until capabilities arrive), naming TIFF `.tif`; four commands on the File menu; `exportBlob` accepts WebP. Removed:

```ts
  async function exportImage(kind: 'png' | 'jpg', quality = 0.92): Promise<void> {
        const blob = await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg', quality);
        if (blob) await deliver(blob, `${p.name}.${kind}`);
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', 'export-psd', 'export-gif', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
  async exportBlob(type: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Blob | null> {
```

## Gradients and Edit > Fill · _v0.74.0 (one change across five files and two new ones, logged together)

### src/engine/gradients.ts · new

Five types, colour-stop presets (the two old choices keep their ids), `resolveStops`, `reflectStops`, `colorAt` and `diamondFill` (the L1 distance in the drag frame). Nothing was removed.

### src/ui/panels/fill-dialog.ts · new

Photoshop's Fill dialog; rows disabled in place, never hidden. Nothing was removed.

### tests/gradients.test.ts · new

Five unit tests for the gradient maths. Nothing was removed.

### src/engine/index.ts · gradientSettings, renderGradient, fillWith

`gradientSettings.shape` takes the five types and `style` a preset id; `renderGradient` draws from the preset's stops, Angle as a conic gradient, Reflected mirrored, Diamond per pixel; `fillWith` is Edit > Fill's work. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle, effectsFromData } from './types';
  gradientSettings: { shape: 'linear' | 'radial'; style: 'background' | 'transparent'; reversed: boolean; opacity: number } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1 };
    let c0 = rgbCss(fg, 1), c1 = st.style === 'background' ? rgbCss(bg, 1) : rgbCss(fg, 0);
    if (st.reversed) [c0, c1] = [c1, c0];
    const grad = st.shape === 'radial' ? lc.createRadialGradient(a.x, a.y, 0, a.x, a.y, len) : lc.createLinearGradient(a.x, a.y, len > 0.5 ? b.x : a.x + 0.5, b.y);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    lc.fillStyle = grad;
    lc.fillRect(bb.x - 1, bb.y - 1, bb.w + 2, bb.h + 2);
```

### src/extensions/tools/gradient.ts · types and presets

Removed:

```ts
      { kind: 'segment', label: 'Shape', choices: [{ id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }], get: () => e.gradientSettings.shape, set: (v) => set(() => { e.gradientSettings.shape = v as 'linear' | 'radial'; }) },
      { kind: 'segment', label: 'Colors', choices: [{ id: 'background', label: 'Foreground to Background' }, { id: 'transparent', label: 'Foreground to Transparent' }], get: () => e.gradientSettings.style, set: (v) => set(() => { e.gradientSettings.style = v as 'background' | 'transparent'; }) },
```

### src/app.ts · Edit > Fill

The dialog, the `fill-dialog` command (Shift+F5) and its Edit menu place. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-fg', 'fill-bg', 'define-pattern', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', '-', 'settings'] },
```

## Pen pressure and brush presets · _v0.70.0 (one change across six files, logged together)

### src/engine/brush-dynamics.ts · new

Ported from NodeMode's formvis studio (`studio/paint/dynamics.ts` and `preset.ts`, nodemode_dev v8.73.1, the owner's build, MIT): `computeOption` with sampled curves, reversal, combine modes and strength; `identityOption`, `pressureOption`; five built-in presets trimmed to formvis's brush; `presetsFromJson` for stored presets. Nothing was removed.

### src/engine/stroke.ts · PixelStroke pressure

`dynamics` field; `to(p, pressure)` interpolates pressure between samples; `dab(p, pressure)` scales the tip's radius and the dab's alpha. Removed:

```ts
   *  the way, the distance since the last dab carried into the next move. */
  to(p: Pt): void {
    const from = this.last;
    if (!from) { this.dab(p); this.last = p; this.carry = 0; return; }
    for (; along <= length; along += this.spacing) this.dab({ x: from.x + (dx * along) / length, y: from.y + (dy * along) / length });
  private dab(p: Pt): void {
    const r = this.radius;
```

### src/engine/index.ts · beginStroke, strokeTo, brushDynamics, applyBrushPreset

Removed:

```ts
  beginStroke(pt: Pt, shift: boolean): boolean {
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p);
    s.to(pt);
  strokeTo(pt: Pt): void {
    st.s.to(pt);
```

### src/extensions/registry.ts, src/ui/stage.ts, src/extensions/tools/brush.ts · pressure input

`ToolPointer.pressure`, pens only (mouse and touch report 1); the Brush passes it on and gains Preset and pressure options. Removed:

```ts
export interface ToolPointer { doc: Pt; screen: Pt; button: number; shift: boolean; alt: boolean; mod: boolean; clicks: number }
    return { doc: v ? v.toDoc(screen.x, screen.y) : screen, screen, button: e.button, shift: e.shiftKey, alt: e.altKey, mod: isMac ? e.metaKey : e.ctrlKey, clicks };
  down(ctx, p) { if (p.button === 0) { hoverPt = p.doc; ctx.engine.beginStroke(p.doc, p.shift); } },
  move(ctx, p) { hoverPt = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
```

## src/engine/shape-paths.ts

### src/engine/shape-paths.ts · new · _v0.69.0

Ported from NodeMode's formvis studio, `studio/pixel/shapes.ts` (nodemode_dev v8.73.1, the owner's build, MIT): `ngonPoints`, `starPoints`, `arrowPoints` and `heartPoints`, moved from `[x, y]` tuples to `Pt` and from a tile-store scanline fill to closed corner-anchor `VectorPath`s through `boxedShapePath` (fitted to the dragged box) and `linePath` (a line is an arrow with no head). Nothing was removed.

### tests/shape-paths.test.ts · new · _v0.69.0

Six unit tests for the generators and the box fitting. Nothing was removed.

### src/engine/index.ts · createPathShape · _v0.69.0 (logged here beside the new module)

`shapeSettings` takes the path kinds and their options (`DEFAULT_PATH_SHAPE`); `createPathShape` inserts a foreground-filled vector layer named for the shape, as one step. Removed:

```ts
  shapeSettings: { kind: 'rectangle' | 'ellipse'; cornerRadius: number } = { kind: 'rectangle', cornerRadius: 0 };
```

## src/engine/filters-more.ts

### src/engine/filters-more.ts · new · _v0.68.0

`lensBlur` (a disc average in linear light through per-row prefix sums, highlights lifted above a threshold first), `smartSharpen` (unsharp mask for Gaussian removal; Richardson-Lucy, eight iterations, for lens and motion removal; noise gate; shadow and highlight fades; alpha kept), `sharpenSample` for the Sharpen brush, and their margins. Richardson-Lucy steepens edges but rings, so its total error against a sharp original stays about level; that is expected of the method. Nothing was removed.

### tests/filters-more.test.ts · new · _v0.68.0

Nine unit tests for the two filters and the brush sample. Nothing was removed.

## tests/

### tests/setup.ts, blend.test.ts, adjust-params.test.ts, history.test.ts, geometry-filters.test.ts · new · _v0.67.0

The unit suite, run by `npm test` (vitest in Node). `setup.ts` supplies a minimal `ImageData` and the `px` helper; the four test files cover the blend modes, the parametric adjustments, `History` and the geometry and mask helpers, 31 tests. Tests import engine modules directly and never touch a canvas, so they stay fast and need no browser. Nothing was removed.

## src/engine/adjust-params.ts

### src/engine/adjust-params.ts · new · _v0.66.0

Eleven adjustments declared as control lists with kernels: Brightness/Contrast, Vibrance, Color Balance, Black & White, Photo Filter, Channel Mixer, Invert, Posterize, Threshold, Selective Color and Develop. Values live in `data.params`, read back clamped by `paramValues`. Rows with a `group` are shown only when the kind's `groupBy` select holds that group. Black & White follows Photoshop's documented hue weighting; Selective Color and Photo Filter are standard approximations, named as such in the build notes. Nothing was removed.

## src/engine/blend.ts

### src/engine/blend.ts · new · _v0.66.0

The ten blend modes Canvas 2D lacks, composited per pixel by the W3C source-over formula; Dissolve on a document-fixed hash pattern. Nothing was removed.

## src/io/recovery.ts

### src/io/recovery.ts · new · _v0.66.0

The IndexedDB store for crash-recovery copies (`formvis-recovery`, store `docs`, keyed by project id). Every call resolves, to null or an empty list when storage is unavailable, so recovery can never break editing. Nothing was removed.

## src/ui/errors.ts

### src/ui/errors.ts · new · _v0.66.0

The global error log: window `error` and `unhandledrejection` become entries and at most one notice every four seconds; `text()` joins them with the engine's rolled-back failures for Help > Copy Error Log. Nothing was removed.

## src/extensions/tools/quick-select.ts

### src/extensions/tools/quick-select.ts · new · _v0.65.0

The Quick Selection tool. Nothing was removed.

## src/ui/panels/color-range-dialog.ts

### src/ui/panels/color-range-dialog.ts · new · _v0.65.0

The Color Range dialog with canvas sampling and a fixed-size preview. Nothing was removed.

## src/extensions/tools/tone.ts

### src/extensions/tools/tone.ts · new · _v0.64.0

The Dodge, Burn and Sponge tools. Nothing was removed.

## src/extensions/tools/bucket.ts

### src/extensions/tools/bucket.ts · new · _v0.64.0

The Paint Bucket tool. Nothing was removed.

## io/psd.ts

### io/psd.ts · layer styles · _v0.62.0

Layer styles written as Photoshop layer effects and read back, patterns carried. Removed:

```ts
import type { BlendMode as PsdBlend, Layer as PsdLayer, LinkedFile, Psd } from 'ag-psd';
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt,
      if (pl.effects) notes.push(`"${name}" has a Photoshop layer style; it opened without it.`);
  const notes: string[] = [], linked: LinkedFile[] = [], sources = new Map<ID, Uint8Array>();
    if (effectsActive(l.effects)) notes.push(`"${l.name}" loses its layer style; the PSD holds its pixels only.`);
```

## src/engine/patterns.ts

### src/engine/patterns.ts · new · _v0.61.0

The pattern registry with its built-in patterns. Nothing was removed.

## src/ui/panels/trim-dialog.ts

### src/ui/panels/trim-dialog.ts · new · _v0.58.0

The Trim dialog. Nothing was removed.

## src/ui/history.ts

### src/ui/history.ts · new · _v0.56.0

The History panel. Nothing was removed.

### src/ui/history.ts · snapshots · _v0.57.0

Snapshot rows above the steps and the New and Delete Snapshot footer. Removed:

```ts
type Row = { key: string; name: string; index: number };
      `<div class="cv-history-body" hidden><div class="cv-history-list" role="listbox" aria-label="History"></div></div></section>`);
      if (row) this.engine.jumpHistory(Number(row.dataset.index));
    const list: Row[] = p ? [{ key: 'start', name: p.name, index: 0 }, ...names.map((name, i) => ({ key: `${i}:${name}`, name, index: i + 1 }))] : [];
        const row = el(`<div class="cv-history-row" role="option"><span class="cv-history-icon">${icon(r.index === 0 ? 'image' : 'history', 12)}</span><span class="cv-history-name"></span></div>`);
    row.classList.toggle('is-current', r.index === current);
    row.classList.toggle('is-undone', r.index > current);
```

### src/ui/history.ts · snapshot sizes · _v0.58.0

Snapshot rows show what they keep. Removed:

```ts
type Row = { key: string; name: string; index: number; snap?: string };
    const snaps: Row[] = this.engine.snapshots.map((x) => ({ key: `snap:${x.id}`, name: x.name, index: -1, snap: x.id }));
```

## src/ui/panels/stop-dialog.ts

### src/ui/panels/stop-dialog.ts · new · _v0.53.0

The dialog a stop step shows. Nothing was removed.

## src/ui/panels/tween-dialog.ts

### src/ui/panels/tween-dialog.ts · new · _v0.50.0

The Tween dialog. Nothing was removed.

### src/ui/panels/tween-dialog.ts · easing · _v0.57.0

The Easing choice. Removed:

```ts
    if (t.current) this.engine.tween(t.current, n, { position: this.position.checked, opacity: this.opacity.checked });
```

## src/ui/panels/gif-dialog.ts

### src/ui/panels/gif-dialog.ts · new · _v0.49.0

The Export GIF dialog. Nothing was removed.

## src/ui/panels/animation-dialog.ts

### src/ui/panels/animation-dialog.ts · new · _v0.49.0

The animation preview. Nothing was removed.

## src/ui/timeline.ts

### src/ui/timeline.ts · new · _v0.49.0

The Timeline panel. Nothing was removed.

### src/ui/timeline.ts · drag and tween · _v0.50.0

Frames drag to a new place; the Tween button. Removed:

```ts
        const row = el(`<div class="cv-frame" role="option"><canvas class="cv-frame-thumb" width="${TW}" height="${TH}"></canvas><div class="cv-frame-meta"><span class="cv-frame-num"></span>` +
```

## src/engine/timeline.ts

### src/engine/timeline.ts · new · _v0.49.0

Frames, their capture and application, and checked reading. Nothing was removed.

### src/engine/timeline.ts · frame styles · _v0.59.0

Frames capture, apply and read back each layer's style. Removed:

```ts
import { uid, type Doc, type ID, type Layer } from './types';
export interface FrameLayer { visible: boolean; opacity: number; x: number; y: number }
  for (const l of doc.layers) out[l.id] = { visible: l.visible, opacity: l.opacity, x: l.transform.x, y: l.transform.y };
    if (!s || (s.visible === l.visible && s.opacity === l.opacity && s.x === l.transform.x && s.y === l.transform.y)) return l;
    return { ...l, visible: s.visible, opacity: s.opacity, transform: { ...l.transform, x: s.x, y: s.y } };
      if (s && typeof s.visible === 'boolean' && finite(s.opacity) && finite(s.x) && finite(s.y)) state[id] = { visible: s.visible, opacity: Math.min(1, Math.max(0, s.opacity)), x: s.x, y: s.y };
```

## src/io/gif.ts

### src/io/gif.ts · new · _v0.48.0

The GIF encoder. Nothing was removed.

### src/io/gif.ts · plays · _v0.49.0

The repeat count means total plays; one play writes no looping extension. Removed:

```ts
/** The GIF file for `frames`, each `width` by `height`; `loops` 0 repeats forever. */
export function encodeGif(frames: GifFrame[], width: number, height: number, loops = 0): Uint8Array {
  bytes.push(0x21, 0xff, 11); text('NETSCAPE2.0'); bytes.push(3, 1); u16(loops); bytes.push(0);
```

## src/ui/panels/shape-style-dialog.ts

### src/ui/panels/shape-style-dialog.ts · new · _v0.48.0

The Shape Fill and Stroke dialog. Nothing was removed.

## src/ui/paths.ts

### src/ui/paths.ts · new · _v0.47.0

The Paths panel. Nothing was removed.

## backend/app/services/project_format.py

### backend/app/services/project_format.py · smartSourceFile · _v0.45.0

The source image is validated like layer images and masks. Removed:

```python
        for key in ("imageFile", "maskFile"):
```

## src/ui/panels/smart-filters-dialog.ts

### src/ui/panels/smart-filters-dialog.ts · new · _v0.45.0

The Smart Filters dialog. Nothing was removed.

### src/ui/panels/smart-filters-dialog.ts · requested filters · _v0.56.0

The dialog works from the filters last asked for. Removed:

```ts
    patchList<SmartFilter>(this.list, smart?.filters ?? [], {
    setText(this.note, smart?.filters.length ? "Filters run top first, each on the one before's result, always from the smart object's original pixels."
    this.engine.setSmartFilters(this.layerId, edit(smart.filters), name);
    const f = this.smart()?.filters.find((x) => x.id === id), layerId = this.layerId;
      const now = this.engine.current?.layer(layerId)?.smart;
      if (now) this.engine.setSmartFilters(layerId, now.filters.map((x) => (x.id === id ? { ...x, settings } : x)), 'Edit Smart Filter');
```

## src/io/zip.ts

### src/io/zip.ts · new · _v0.44.0

A dependency-free ZIP writer, stored, UTF-8 names. Nothing was removed.

## src/ui/panels/actions-dialogs.ts

### src/ui/panels/actions-dialogs.ts · new · _v0.44.0

The Actions and Batch dialogs. Nothing was removed.

### src/ui/panels/actions-dialogs.ts · Sizes follow each image · _v0.47.0

The per-action option in the Actions dialog. Removed:

```ts
import { el, setDisabled, setText } from '../dom';
```

### src/ui/panels/actions-dialogs.ts · step list · _v0.53.0

Steps as selectable rows with Dialog toggles, Insert Stop and Delete Step. Removed:

```ts
import { el, setChecked, setDisabled, setText } from '../dom';
  private readonly steps = el('<pre class="cv-notice"></pre>');
    this.body.appendChild(this.steps);
    this.pick.addEventListener('change', () => this.sync());
    setText(this.steps, !a ? 'No actions yet. Name one and press Record.' : a.steps.length ? a.steps.map((s, i) => `${i + 1}. ${s.label}`).join('\n') : 'No steps yet. Press Record to add some.');
```

## src/ui/actions.ts

### src/ui/actions.ts · new · _v0.44.0

The actions store: recordable commands, steps checked on the way in, storage, playback. Nothing was removed.

### src/ui/actions.ts · recordable · _v0.45.0

Convert and Rasterize become recordable. Removed:

```ts
  'paste-layer-style', 'clear-layer-style', 'duplicate', 'merge-down', 'merge-visible', 'flatten',
```

### src/ui/actions.ts · relative sizes · _v0.47.0

Starting sizes on size steps and the per-action option; new recordable commands. Removed:

```ts
  | { kind: 'imageSize'; label: string; w: number; h: number; sampling: string; res: number }
  | { kind: 'canvasSize'; label: string; w: number; h: number; dx: number; dy: number; fill: RGB | null };
export interface Action { name: string; steps: ActionStep[] }
  'paste-layer-style', 'clear-layer-style', 'convert-smart', 'rasterize', 'duplicate', 'merge-down', 'merge-visible', 'flatten',
  if (s.kind === 'imageSize' && isNum(s.w) && isNum(s.h) && typeof s.sampling === 'string' && isNum(s.res)) return { kind: 'imageSize', label: label || 'Image Size', w: s.w, h: s.h, sampling: s.sampling, res: s.res };
    return { kind: 'canvasSize', label: label || 'Canvas Size', w: s.w, h: s.h, dx: s.dx, dy: s.dy, fill };
    return [{ name: (a as Action).name.slice(0, 80) || 'Action', steps }];
```

### src/ui/actions.ts · adjustment steps · _v0.51.0

The adjustment step and its check on import. Removed:

```ts
import type { RGB } from '../engine';
```

### src/ui/actions.ts · layer style steps · _v0.52.0

The Layer Style step and its check on import. Nothing was removed.

### src/ui/actions.ts · stops and pauses · _v0.53.0

Stop steps, the dialog toggle, and playback that tells a stop from a failure. Removed:

```ts
  | { kind: 'filter'; filter: string; label: string; settings: Record<string, unknown> }
  | { kind: 'adjustment'; adj: string; label: string; data: Record<string, unknown>; layer: boolean }
  if (s.kind === 'adjustment' && typeof s.adj === 'string' && (ADJUSTMENT_KINDS as readonly string[]).includes(s.adj) && s.data && typeof s.data === 'object') return { kind: 'adjustment', adj: s.adj, label: label || s.adj, data: s.data as Record<string, unknown>, layer: s.layer === true };
  if (s.kind === 'filter' && typeof s.filter === 'string' && s.settings && typeof s.settings === 'object') return { kind: 'filter', filter: s.filter, label: label || s.filter, settings: s.settings as Record<string, unknown> };
  /** Runs each step through `run`, stopping at the first that cannot run; returns how many ran and which failed. */
  async play(a: Action, run: (step: ActionStep) => boolean | Promise<boolean>): Promise<{ done: number; failed: string | null }> {
      for (let i = 0; i < a.steps.length; i++) if (!(await run(a.steps[i]))) return { done: i, failed: a.steps[i].label };
      return { done: a.steps.length, failed: null };
```

### src/ui/actions.ts · Reveal All · _v0.58.0

Reveal All becomes recordable. Removed:

```ts
  'paste-layer-style', 'clear-layer-style', 'convert-smart', 'rasterize', 'new-shape-path', 'shape-color', 'duplicate', 'merge-down', 'merge-visible', 'flatten',
```

## src/extensions/tools/direct-select.ts

### src/extensions/tools/direct-select.ts · new · _v0.43.0

The Direct Selection tool. Nothing was removed.

### src/extensions/tools/direct-select.ts · gestures · _v0.47.0

Direct Selection brackets its drags for Shape Path undo. Removed:

```ts
  up() { grab = null; },
```

## src/extensions/tools/pen.ts

### src/extensions/tools/pen.ts · new · _v0.43.0

The Pen tool. Nothing was removed.

### src/extensions/tools/pen.ts · add and delete points · _v0.46.0

Clicks between paths add or delete points, with a plus or minus beside the pointer. Removed:

```ts
import { cornerAt, tracePath, type Anchor, type Pt, type SubPath, type VectorPath } from '../../engine';
  hint: () => 'Click for corner points, drag for curves · Click the first point to close · Enter ends an open path, Backspace removes the last point · Ctrl+Enter makes a selection',
    if (!active) { active = { anchors: [], closed: false }; vp.subpaths.push(active); }
```

### src/extensions/tools/pen.ts · gestures · _v0.47.0

The Pen brackets its gestures for Shape Path undo. Removed:

```ts
  cancel() { pulling = null; },
```

## src/engine/paths.ts

### src/engine/paths.ts · new · _v0.43.0

Anchors, sub-paths and Work Paths; tracing to Path2D; bounds. Nothing was removed.

### src/engine/paths.ts · saving and point editing · _v0.46.0

pathData and pathFrom for project files; anchorNear, nearestSegment and splitSegment for adding and deleting points. Nothing was removed.

### src/engine/paths.ts · named paths, shiftPath · _v0.47.0

NamedPath and PathSet with their file data and checked reader; shiftPath. Removed:

```ts
import type { Pt, Rect } from './types';
```

## src/io/psd.ts

### src/io/psd.ts · new · _v0.42.0

Layered PSD reading and writing with ag-psd, loaded on first use. Nothing was removed.

### src/io/psd.ts · note · _v0.45.0

Smart objects export as pixels, with a note. Nothing was removed.

### src/io/psd.ts · note · _v0.47.0

Shape layers export as pixels, with a note. Nothing was removed.

### src/io/psd.ts · shape layers · _v0.48.0

Shape layers written as Photoshop shapes and read back as shape layers. Removed:

```ts
    if (l.vector) notes.push(`"${l.name}" goes as pixels; the PSD does not hold it as a shape layer.`);
```

### src/io/psd.ts · smart objects · _v0.53.0

Placed layers with embedded sources written and read. Removed:

```ts
import type { BlendMode as PsdBlend, Layer as PsdLayer, Psd } from 'ag-psd';
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid,
  type BlendMode, type Doc, type ID, type Layer, type Surface,
  const notes: string[] = [];
    if (l.smart) notes.push(`"${l.name}" goes as pixels; the PSD does not hold it as a smart object.`);
```

### src/io/psd.ts · editable type · _v0.63.0

Live type written as Photoshop point type and read back as editable type. Removed:

```ts
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt, defaultEffects, patternById, addPattern, projectPatterns, createSurface, ctxOf, type LayerEffects,
      if (pl.text) notes.push(`"${name}" is type in Photoshop; it opened as pixels.`);
    if (liveText(l)) notes.push(`"${l.name}" goes as pixels; the PSD does not hold it as editable type.`);
```
### src/io/psd.ts · blend modes · _v0.66.0

`TO_PSD` maps the ten new modes to Photoshop's names, so they are written and read back. Nothing was removed.

## src/extensions/tools/patch.ts

### src/extensions/tools/patch.ts · new · _v0.42.0

The Patch tool: lasso to select, drag the selection to heal from there. Nothing was removed.
### src/extensions/tools/patch.ts and src/engine/index.ts · Patch modes · _v0.73.0

Options for Patch (Normal, Content-Aware), From (Source, Destination) and Transparent, and a hint that follows From. In the engine, `retouch` holds them; `patchSelection` runs inside one `edit`, moving the selection for Destination and reversing the drag, adds the source's high pass for Transparent, and content-aware fills a three-pixel band inside the seam for Content-Aware. Removed:

```ts
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false };
   *  meet the selection's edge, as one undo step. */
    this.regionEdit('Patch', ({ raster, target, rect }) => {
      if (target !== 'pixels') return;
      const p = this.current as Project, l = p.activeLayer as Layer;
      const cov = this.coverageFor(p, l, target, raster.width, raster.height);
      if (!cov) return;
      const toLayer = invert(placement(l.transform, raster.width, raster.height)), a = applyMat(toLayer, 0, 0), b = applyMat(toLayer, dx, dy);
      const mask = new Uint8Array(raster.width * raster.height);
      for (let i = 0; i < mask.length; i++) mask[i] = cov[i * 4 + 3];
      const pm = premultiply(raster.read().data);
      if (!healFromSource(pm, mask, raster.width, raster.height, 1, Math.round(b.x - a.x), Math.round(b.y - a.y))) return;
      const out = new ImageData(raster.width, raster.height);
      unpremultiply(pm, out.data);
      raster.ctx.putImageData(out, 0, 0, rect.x, rect.y, rect.w, rect.h);
  hint: () => 'Draw around the area to fix, then drag the selection onto the area to copy from · Shift+J cycles the healing tools',
```

## src/extensions/tools/healing-brush.ts

### src/extensions/tools/healing-brush.ts · new · _v0.42.0

The Healing Brush tool. Nothing was removed.

## src/ui/text-editor.ts

### src/ui/text-editor.ts · new · _v0.41.0

Typing on the canvas: one kept text box over the stage, placed on the text's first baseline, restyled from the options bar, committing through the engine. Nothing was removed.

## src/extensions/tools/type.ts

### src/extensions/tools/type.ts · new · _v0.40.0

The Type tool announces where to type; the app opens the dialog. Nothing was removed.

### src/extensions/tools/type.ts · options, on-canvas typing · _v0.41.0

Font, Size, Align, Bold, Italic and Leading in the options bar. Removed:

```ts
/** Type (T): click a type layer to edit its text, or anywhere else to start new text whose first baseline begins at
 *  the click. The Type dialog does the typing; the tool announces where, for the app to open it. */
```

## src/ui/panels/text-dialog.ts

### src/ui/panels/text-dialog.ts · new · _v0.40.0

New Type and Edit Type. Nothing was removed.

## src/engine/text.ts

### src/engine/text.ts · new · _v0.40.0

Fonts, rendering, the raster pairing that keeps type editable, and checked loading. Nothing was removed.

### src/engine/text.ts · textMetrics · _v0.41.0

Shares `renderText`'s padding and font ascent and descent. Nothing was removed.

## src/ui/panels/layer-style-dialog.ts

### src/ui/panels/layer-style-dialog.ts · new · _v0.39.0

The three sections with live preview; OK applies once, Cancel reverts. Nothing was removed.

### src/ui/panels/layer-style-dialog.ts · inner effects · _v0.40.0

Sections for Inner Shadow, Inner Glow and Color Overlay. Removed:

```ts
/** Layer > Layer Style: Drop Shadow, Outer Glow and an outside Stroke for the active pixel layer, shown live while the
 *  dialog is open. OK applies them as one undo step; Cancel leaves the layer as it was. */
```

### src/ui/panels/layer-style-dialog.ts · onApplied · _v0.52.0

Reports applied styles for recording. Removed:

```ts
    const id = this.layerId;
    if (id) this.engine.setLayerEffects(id, effectsActive(this.fx) ? this.fx : null);
```

### src/ui/panels/layer-style-dialog.ts · Gradient Overlay · _v0.58.0

The Gradient Overlay section. Removed:

```ts
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow and Color Overlay for the
```

### src/ui/panels/layer-style-dialog.ts · Bevel and Emboss · _v0.59.0

The Bevel & Emboss section and a choice helper. Removed:

```ts
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow, Color Overlay and Gradient Overlay for the
```

### src/ui/panels/layer-style-dialog.ts · Satin · _v0.60.0

The Satin section. Removed:

```ts
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow, Color Overlay, Gradient Overlay and Bevel & Emboss for the
```

### src/ui/panels/layer-style-dialog.ts · Pattern Overlay · _v0.61.0

The Pattern Overlay section with a pattern list refreshed on opening. Removed:

```ts
import { defaultEffects, effectsActive, type Engine, type LayerEffects, type RGB } from '../../engine';
/** Layer > Layer Style: Drop Shadow, Outer Glow, an outside Stroke, Inner Shadow, Inner Glow, Satin, Color Overlay, Gradient Overlay and Bevel & Emboss for the
```

## src/ui/panels/generative-dialog.ts

### src/ui/panels/generative-dialog.ts · new · _v0.37.0

The prompt, the key field shown only until a key is saved, and Forget key. Nothing was removed.

### src/ui/panels/generative-dialog.ts · three modes · _v0.38.0

Rewritten for Fill, Expand (margin fields) and Upscale (no prompt). Removed, the whole 0.37.0 file:

```ts
import type { Engine } from '../../engine';
import { api, type GenerativeStatus } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';

/** Edit > Generative Fill: a prompt for what to paint into the selection, sent by the formvis engine to fal (FLUX.1
 *  Fill [pro]); an empty prompt removes what the selection covers (FLUX.1 Erase [pro]). Until a key is saved the dialog
 *  asks for one; the engine keeps it in its data folder and never hands it back to the page. */
export class GenerativeDialog extends Dialog {
  private readonly prompt = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="true" placeholder="Describe what to add, or leave empty to remove">');
  private readonly keyRow = el('<div class="cv-panel-section"></div>');
  private readonly key = el<HTMLInputElement>('<input class="cv-input" type="password" autocomplete="off" spellcheck="false" placeholder="fal API key">');
  private readonly state = el('<p class="cv-note"></p>');
  private readonly forget: HTMLButtonElement;
  private status: GenerativeStatus | null = null;

  constructor(private readonly engine: Engine) {
    super('Generative Fill', 440);
    this.body.appendChild(this.prompt);
    this.body.appendChild(el('<p class="cv-note">The result arrives as a new layer masked to the selection. fal charges about $0.05 per megapixel of the area sent.</p>'));
    this.keyRow.append(this.key, el('<p class="cv-note">Get a key at fal.ai. The formvis engine keeps it in its data folder on this computer.</p>'));
    this.body.appendChild(this.keyRow);
    this.body.appendChild(this.state);
    this.forget = this.button('Forget key', 'ghost', () => void this.forgetKey());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Generate', 'primary', () => void this.generate());
  }

  async show(): Promise<void> {
    this.status = await api.generativeStatus();
    this.sync();
    this.open();
    this.prompt.focus();
    this.prompt.select();
  }

  private sync(): void {
    const s = this.status;
    setHidden(this.keyRow, !s || s.configured);
    setHidden(this.forget, s?.source !== 'settings');
    setText(this.state, !s ? 'The formvis engine is offline. Start it with ./formvis boot.'
      : s.configured ? `fal key set ${s.source === 'environment' ? 'by FAL_KEY in the environment' : 'in formvis'}.` : 'Add a fal API key to generate.');
  }

  private async forgetKey(): Promise<void> {
    try { this.status = await api.forgetGenerativeKey(); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'The key could not be removed.'); return; }
    this.sync();
  }

  private async generate(): Promise<void> {
    if (!this.status) return;
    if (!this.status.configured) {
      const key = this.key.value.trim();
      if (!key) { setText(this.state, 'Paste a fal API key first.'); this.key.focus(); return; }
      try { this.status = await api.saveGenerativeKey(key); } catch (err) { setText(this.state, err instanceof Error ? err.message : 'The key could not be saved.'); return; }
      this.key.value = '';
      this.sync();
    }
    const prompt = this.prompt.value;
    this.close();
    await this.engine.task(() => this.engine.generativeFill(prompt, (image, mask) => api.generativeFill(image, mask, prompt)));
  }
}
```

## src/engine/filter-library.ts

### src/engine/filter-library.ts · new · _v1.64.0

The filter library (DEV_PLAN 27.1): declared filters, their parameters, reach and run, read by the filter panel, the worker, the commands and the Filter menu. The design and its reasons are in the release entry "The filter library and 21 filters" at the top of this log. Nothing was removed.

## src/engine/filters-lib/

### src/engine/filters-lib/ · new · _v1.64.0

`blur.ts`, `sharpen.ts`, `noise.ts`, `other.ts` and `video.ts` declare the 20 library filters and hold their kernels; `shared.ts` holds premultiplying, the exact Gaussian, unsharp masking on it and box means. See the same release entry. Nothing was removed.

### src/engine/filters-lib/distort.ts, pixelate.ts · new · _v1.64.1

The Distort and Pixelate filters of DEV_PLAN 27.2, and in `shared.ts` boxes, clipping, a position hash (`hash01`, from `mix32`) and luma. See the release entry "Distort and Pixelate; the filter's frame" at the top of this log. Nothing was removed.

### src/engine/filters-lib/stylize.ts, render.ts · new · _v1.64.2

The Stylize filters and the first five Render filters of DEV_PLAN 27.3. See the release entry "Stylize and Render; frames for bands" at the top of this log. Nothing was removed.

### src/engine/filters-lib/drawn.ts · new · _v1.64.3

Flame, Picture Frame and Tree, closing DEV_PLAN 27.3. See the release entry "Flame, Picture Frame and Tree; Render on empty layers" at the top of this log. Nothing was removed.

### src/engine/filters-lib/gallery.ts · new · _v1.64.4

Spin Blur, the Blur Gallery's first library filter. See the release entry "Fade, Last Filter and Spin Blur" at the top of this log. Nothing was removed.

## src/engine/fade.ts

### src/engine/fade.ts · new · _v1.64.4

`fadeImages`, Edit > Fade's arithmetic. See the release entry "Fade, Last Filter and Spin Blur" at the top of this log. Nothing was removed.

## src/ui/panels/fade-dialog.ts

### src/ui/panels/fade-dialog.ts · new · _v1.64.4

The Fade dialog. See the release entry "Fade, Last Filter and Spin Blur" at the top of this log. Nothing was removed.

## Org-navi-map

```text
HASHOUT_LOG.md  · this log
boot_frontend  · start the Vite dev server (unix)
boot_frontend.bat  · start the Vite dev server (windows)
index.html  · entry page: critical style, pre-paint theme boot, font preloads, stylesheet order
oc_install  · install this side (unix)
oc_install.bat  · install this side (windows)
package-lock.json  · npm lockfile
package.json  · pinned dependencies and scripts
public/
    favicon.svg  · tab icon
    splash.html  · desktop splash page
src/
    app.ts  · mount, commands, menus, input, file flows, reveal gate
    engine/
        adjust.ts  · Hue/Saturation and Grain kernels, adjustment data
        renderer.ts  · rendering pipeline
        distort.ts  · free distort: homography, warp, carried corners
        dpi.ts  · export resolution stamp (PNG pHYs, JPEG JFIF density)
        filter-jobs.ts  · worker client for filter previews
        filter-worker.ts  · module worker running filter kernels
        filter-library.ts  · the filter library: declared filters, their parameters, reach and run
        filters-lib/
            blur.ts  · Average's kernel, Blur, Blur More, Box Blur, Shape Blur, Smart Blur
            distort.ts  · the remap, Displace, Pinch, Polar Coordinates, Ripple, Shear, Spherize, Twirl, Wave, ZigZag
            drawn.ts  · Flame, Picture Frame, Tree: shapes built in document pixels and drawn into the image
            gallery.ts  · the Blur Gallery's library filters: Spin Blur
            noise.ts  · Despeckle, Dust & Scratches, Median, Reduce Noise
            other.ts  · Custom, HSB/HSL, High Pass, Maximum, Minimum, Offset
            pixelate.ts  · Color Halftone, Crystallize, Facet, Fragment, Mezzotint, Mosaic, Pointillize
            render.ts  · Clouds, Difference Clouds, Fibers, Lens Flare, Lighting Effects
            sharpen.ts  · Sharpen, Sharpen More, Sharpen Edges
            shared.ts  · premultiplying, exact Gaussian, box means
            stylize.ts  · Diffuse, Emboss, Extrude, Find Edges, Oil Paint, Solarize, Tiles, Trace Contour, Wind
            video.ts  · De-Interlace, NTSC Colors
        events.ts  · typed emitter
        fade.ts  · Edit > Fade's arithmetic: a step's result faded back toward its before, by opacity and mode
        filters.ts  · blurs, noise, lens, histogram, selection resize
        geometry.ts  · matrices and rectangles
        history.ts  · undo stack
        index.ts  · Engine API
        kernels.ts  · adjustment and wand kernels
        matte.ts  · Remove Background matte refining: guided filter, shift edge, contrast
        project.ts  · per-tab project record
        retouch.ts  · Spot Healing, Content-Aware Fill, Smudge and Liquify
        selection.ts  · selection masks, outline tracer
        stroke.ts  · brush stroke engine
        surface.ts  · canvases and rasters
        transform.ts  · handles and drag math
        tree.ts  · layer hierarchy walks
        types.ts  · document types, blend modes, limits
        viewport.ts  · zoom and pan
    extensions/
        registry.ts  · tool contract and registry
        tools/
            brush-common.ts  · shared brush cursor, keys and options
            brush.ts  · brush and eraser
            clone.ts  · Clone Stamp
            crop.ts  · crop frame, ratios, snapping
            eyedropper.ts  · color sampling
            gradient.ts  · pending gradient with movable ends
            hand.ts  · panning
            heal.ts  · Spot Healing
            index.ts  · built-in tool list
            lasso.ts  · freehand and polygonal lasso
            marquee.ts  · rectangle and ellipse marquee
            move.ts  · move and transform handles
            select-common.ts  · modifier to selection mode
            shape.ts  · rectangle and ellipse shape layers
            smear.ts  · Smear: Liquify, Blur, Smudge
            wand.ts  · magic wand
            zoom.ts  · zoom tool
    host.ts  · NodeMode portal link
    io/
        api.ts  · engine HTTP client
        images.ts  · image decoding with engine fallback
        project-io.ts  · project serialize and deserialize
    main.ts  · entry, calls startApp
    styles/
        dialogs.css  · dialogs and lists
        fonts.css  · vendored Inter and JetBrains Mono
        light-mode.css  · light theme adjustments
        panels.css  · layers panel, menus, toasts
        scrollbars.css  · scrollbars, loaded last
        shell.css  · app grid, titlebar, rail, stage, status
        tokens.css  · NodeMode tokens plus the formvis block
    ui/
        app-dialogs.ts  · new canvas, open, settings, shortcuts, about
 brand.ts · the inline app mark
        commands.ts  · command registry and key labels
        dialogs.ts  · dialog base, confirm, prompt
        dom.ts  · NodeMode dom-stable plus setters
        icons.ts  · 80 NodeMode icons, verbatim
        layers.ts  · layers panel
        menu.ts  · popup menus and menubar
        options.ts  · options bar
        palette.ts  · stage colors from tokens
        panels/
            adjust-panel.ts  · adjustment editing panel, layer and image modes
            background-panel.ts  · Remove Background panel: Basic, Advanced refine, preview
            color-picker.ts  · Photoshop-style color picker with canvas sampling
            controls.ts  · slider, select, check, color and number rows
            fade-dialog.ts  · Edit > Fade: opacity and mode with a live preview
            filter-panel.ts  · filter dialog with scaled preview
            jpeg-dialog.ts  · JPEG export sheet with quality and encoded preview
            live-mask-dialog.ts  · bake-or-unlink choice when deleting a clip base
            size-dialogs.ts  · canvas size, image size, expand and contract
        rail.ts  · tool rail and colors
        stage.ts  · scene and overlay canvases
        status.ts  · status bar
        tabs.ts  · project tabs
        themes.ts  · 14 NodeMode theme profiles, verbatim
        toast.ts  · toasts
    version.ts  · version string
tsconfig.json  · strict compiler settings
vite.config.ts  · ports 5190 and 5191, host false, /api proxy
```

## Table of contents

- [boot_frontend](#boot_frontend)
- [boot_frontend.bat](#boot_frontendbat)
- [index.html](#indexhtml)
- [oc_install](#oc_install)
- [oc_install.bat](#oc_installbat)
- [package.json](#packagejson)
- [public/favicon.svg](#publicfaviconsvg)
- [public/splash.html](#publicsplashhtml)
- [src/app.ts](#srcappts)
- [src/engine/adjust.ts](#srcengineadjustts)
- [src/engine/renderer.ts](#srcenginerendererts)
- [src/engine/distort.ts](#srcenginedistortts)
- [src/engine/dpi.ts](#srcenginedpits)
- [src/engine/filter-jobs.ts](#srcenginefilter-jobsts)
- [src/engine/filter-worker.ts](#srcenginefilter-workerts)
- [src/engine/filter-library.ts](#srcenginefilter-libraryts)
- [src/engine/filters-lib/](#srcenginefilters-lib)
- [src/engine/events.ts](#srcengineeventsts)
- [src/engine/fade.ts](#srcenginefadets)
- [src/engine/filters.ts](#srcenginefiltersts)
- [src/engine/geometry.ts](#srcenginegeometryts)
- [src/engine/history.ts](#srcenginehistoryts)
- [src/engine/index.ts](#srcengineindexts)
- [src/engine/kernels.ts](#srcenginekernelsts)
- [src/engine/matte.ts](#srcenginemattets)
- [src/engine/project.ts](#srcengineprojectts)
- [src/engine/retouch.ts](#srcengineretouchts)
- [src/engine/selection.ts](#srcengineselectionts)
- [src/engine/stroke.ts](#srcenginestrokets)
- [src/engine/surface.ts](#srcenginesurfacets)
- [src/engine/transform.ts](#srcenginetransformts)
- [src/engine/tree.ts](#srcenginetreets)
- [src/engine/types.ts](#srcenginetypests)
- [src/engine/viewport.ts](#srcengineviewportts)
- [src/extensions/registry.ts](#srcextensionsregistryts)
- [src/extensions/tools/brush-common.ts](#srcextensionstoolsbrush-commonts)
- [src/extensions/tools/brush.ts](#srcextensionstoolsbrushts)
- [src/extensions/tools/clone.ts](#srcextensionstoolsclonets)
- [src/extensions/tools/crop.ts](#srcextensionstoolscropts)
- [src/extensions/tools/eyedropper.ts](#srcextensionstoolseyedropperts)
- [src/extensions/tools/gradient.ts](#srcextensionstoolsgradientts)
- [src/extensions/tools/hand.ts](#srcextensionstoolshandts)
- [src/extensions/tools/heal.ts](#srcextensionstoolshealts)
- [src/extensions/tools/index.ts](#srcextensionstoolsindexts)
- [src/extensions/tools/lasso.ts](#srcextensionstoolslassots)
- [src/extensions/tools/marquee.ts](#srcextensionstoolsmarqueets)
- [src/extensions/tools/move.ts](#srcextensionstoolsmovets)
- [src/extensions/tools/select-common.ts](#srcextensionstoolsselect-commonts)
- [src/extensions/tools/shape.ts](#srcextensionstoolsshapets)
- [src/extensions/tools/smear.ts](#srcextensionstoolssmearts)
- [src/extensions/tools/wand.ts](#srcextensionstoolswandts)
- [src/extensions/tools/zoom.ts](#srcextensionstoolszoomts)
- [src/host.ts](#srchostts)
- [src/io/api.ts](#srcioapits)
- [src/io/images.ts](#srcioimagests)
- [src/io/project-io.ts](#srcioproject-iots)
- [src/main.ts](#srcmaints)
- [src/styles/dialogs.css](#srcstylesdialogscss)
- [src/styles/fonts.css](#srcstylesfontscss)
- [src/styles/light-mode.css](#srcstyleslight-modecss)
- [src/styles/panels.css](#srcstylespanelscss)
- [src/styles/scrollbars.css](#srcstylesscrollbarscss)
- [src/styles/shell.css](#srcstylesshellcss)
- [src/styles/tokens.css](#srcstylestokenscss)
- [src/ui/app-dialogs.ts](#srcuiapp-dialogsts)
- [src/ui/brand.ts](#srcuibrandts)
- [src/ui/commands.ts](#srcuicommandsts)
- [src/ui/dialogs.ts](#srcuidialogsts)
- [src/ui/dom.ts](#srcuidomts)
- [src/ui/icons.ts](#srcuiiconsts)
- [src/ui/layers.ts](#srcuilayersts)
- [src/ui/menu.ts](#srcuimenuts)
- [src/ui/options.ts](#srcuioptionsts)
- [src/ui/palette.ts](#srcuipalettets)
- [src/ui/panels/adjust-panel.ts](#srcuipanelsadjust-panelts)
- [src/ui/panels/background-panel.ts](#srcuipanelsbackground-panelts)
- [src/ui/panels/color-picker.ts](#srcuipanelscolor-pickerts)
- [src/ui/panels/controls.ts](#srcuipanelscontrolsts)
- [src/ui/panels/fade-dialog.ts](#srcuipanelsfade-dialogts)
- [src/ui/panels/filter-panel.ts](#srcuipanelsfilter-panelts)
- [src/ui/panels/jpeg-dialog.ts](#srcuipanelsjpeg-dialogts)
- [src/ui/panels/live-mask-dialog.ts](#srcuipanelslive-mask-dialogts)
- [src/ui/panels/size-dialogs.ts](#srcuipanelssize-dialogsts)
- [src/ui/rail.ts](#srcuirailts)
- [src/ui/stage.ts](#srcuistagets)
- [src/ui/status.ts](#srcuistatusts)
- [src/ui/tabs.ts](#srcuitabsts)
- [src/ui/themes.ts](#srcuithemests)
- [src/ui/toast.ts](#srcuitoastts)
- [src/version.ts](#srcversionts)
- [tsconfig.json](#tsconfigjson)
- [vite.config.ts](#viteconfigts)

## boot_frontend

### boot_frontend · start the Vite dev server (unix) · _v0.1.0

Created in _v0.1.0.

## boot_frontend.bat

### boot_frontend.bat · start the Vite dev server (windows) · _v0.1.0

Created in _v0.1.0.

## index.html

### index.html · head · _v0.1.0

Critical inline style keeps `#app` hidden until `body.app-ready`; the NodeMode theme boot runs before first paint. `data-theme="dark"` on the root lets the NodeMode host bridge flip light and dark. Three `rel="preload"` links fetch the Inter weights alongside the bundle; Vite rewrites them to the same hashed files the CSS uses.

## oc_install

### oc_install · install this side (unix) · _v0.1.0

Created in _v0.1.0.

## oc_install.bat

### oc_install.bat · install this side (windows) · _v0.1.0

Created in _v0.1.0.

## package.json

### package.json · pinned dependencies and scripts · _v0.1.0

Created in _v0.1.0.

### package.json · test script, vitest · _v0.67.0

`npm test` runs `vitest run`; vitest 5.0.1 pinned as a dev dependency (npm rewrote the lockfile on install). Removed:

```json
    "vite": "8.3.0"
```

## public/favicon.svg

### public/favicon.svg · tab icon · _v0.1.0

Created in _v0.1.0.

### public/favicon.svg · the app mark · _v0.32.0

Replaced with the supplied artwork; `favicon.ico` (16 to 256) and a 180 px `apple-touch-icon.png` join it. Nothing else was removed.

## public/splash.html

### public/splash.html · desktop splash page · _v0.1.0

Created in _v0.1.0.

## src/app.ts

### src/app.ts · startApp · reveal gate · _v0.1.0

Removed: the gate read `fonts.ready` before any font load had started, so it resolved at once and Inter swapped in after reveal (measured in the throttled run). It now awaits explicit Inter 400, 500 and 600 loads, capped at 2.5 s.

```ts
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
  void Promise.race([fonts, new Promise((r) => window.setTimeout(r, 400))]).then(() => requestAnimationFrame(() => revealApp()));
```

### src/app.ts · startApp · commands · _v0.1.0

Every menu item, button and shortcut is a command in the `commands.add(...)` block. New canvas uses Alt+Mod+N as well as Mod+N because browsers keep Mod+N.

### src/app.ts · startApp · v0.2.0 commands and clipboard · _v0.2.0

Adds the clipboard, selection-modify, Image adjustment, New Adjustment Layer, Canvas Size, Image Size and filter commands, and a Filter menu that now holds Remove Background. Copy writes PNG plus a `formvis:` marker to the system clipboard; Mod+V is let through to the native paste event, which pastes in-app copies in place and external images centered above the active layer. Double-clicked adjustment rows open their editor through `cv:edit-adjustment`.

### src/app.ts · startApp · Content-Aware Fill · _v0.3.0

Adds the Content-Aware Fill command (Shift+Backspace) to the Edit menu; it runs after a frame so the busy indicator can show. Removed from the Edit menu definition:

```ts
'fill-fg', 'fill-bg', 'clear', '-', 'settings'] },
```

### src/app.ts · startApp · Transform command · _v0.5.0

Adds the Transform command to the Edit menu, labeled Transform Selection or Transform Layer as labels it, on Alt+Mod+T (browsers keep Mod+T for a new tab, as with Alt+Mod+N and Alt+Mod+W) and Mod+T. Removed from the Edit menu definition:

```ts
'fill-fg', 'fill-bg', 'clear', 'content-fill', '-', 'settings'] },
```

### src/app.ts · save, downloadProject, exportImage · settle first · _v0.5.0

Each calls `engine.settle()` before reading the document, so an unapplied gradient is saved and exported (it was left out since 0.2.0) and a floating selection merges first instead of being written twice, on its own layer and in the untouched source. Save settles before its name prompt. Nothing was removed.

### src/app.ts · startApp · Export JPEG sheet · _v0.6.0

Export JPEG... settles, then opens `JpegDialog`, whose chosen quality `exportImage` passes to `exportBlob`. Removed:

```ts
    { id: 'export-jpg', label: 'Export JPEG', enabled: has, run: () => void exportImage('jpg') },
```

```ts
  async function exportImage(kind: 'png' | 'jpg'): Promise<void> {
```

```ts
        const blob = await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg');
```

### src/app.ts · startApp · removeBackground opens the panel · _v0.9.0

The engine's mask now opens `BackgroundPanel` instead of being applied at once, and the toast names the engine that found the subject. Removed:

```ts
        engine.setMaskFromImage(l.id, bitmap, raster.width, raster.height, 'Remove Background');
        bitmap.close();
        toast(`Background removed with the ${used === 'ml' ? 'ML' : 'lightweight'} engine. The result is a layer mask you can refine.`);
```

### src/app.ts · startApp · color picker · _v0.10.0

Creates `ColorPickerDialog` with the other dialogs; it listens for the rail's `cv-pick-color` event itself, so nothing else in the app changes. Nothing was removed.

### src/app.ts · deleteLayersWithChoice · _v0.19.0

The Delete Layer command and the Delete and Backspace keys ask through `LiveMaskDialog` when layers are clipped to what is being deleted. (Filed under renderer.ts in 0.19.0 by mistake; moved here in 0.20.0.) Removed:

```ts
    { id: 'delete-layer', label: 'Delete Layer', enabled: () => !!layer(), run: () => engine.deleteLayers() },
```

```ts
clearPixels() : engine.deleteLayers()
```

### src/app.ts · recent projects, Open Recent commands · _v0.23.0

the recent documents: `noteRecent` on every library save and open (ten, newest first, in local storage), `recent-heading`, `recent-0` to `recent-9` and `clear-recent` commands, and a File menu computed on open; a project the library no longer has drops out. Removed:

```ts
      try { await openOpened(await api.openLibrary(name), name); return true; } catch (err) { toast(message(err), 'error'); return false; }
```

```ts
    { label: 'File', items: ['new', 'open', 'import', '-', 'save', 'save-as', 'download-project', '-', 'export-png', 'export-jpg', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
```

### src/app.ts · close-tab · Mod+W in the desktop shell · _v0.25.0

Close Tab takes Mod+W where the Tauri shell is present, as the File > Close; the web keeps Alt+Mod+W since browsers reserve Ctrl/Cmd-W. Removed:

```ts
    { id: 'close-tab', label: 'Close Tab', keys: ['Alt+Mod+W'], enabled: has, run: () => { const p = engine.current; if (p) void requestClose(p.id); } },
```

### src/app.ts · exportRefProject, export-ref · _v0.28.0

File > Export .ref Project... writes `Name.ref.zip` through `serializeRefProject` and the package route's root folder, and toasts the changes made for `.ref`. Nothing was removed.

### src/app.ts · export-jpg shortcut · _v0.30.0

Export JPEG takes the Alt+Shift+Mod+S, the one gap the shortcut audit found. Removed:

```ts
    { id: 'export-jpg', label: 'Export JPEG...', enabled: has, run: () => { engine.settle(); dialogs.jpeg.show((q) => void exportImage('jpg', q)); } },
```

### src/app.ts · exportRefProject, .ref wording · _v0.31.0

`exportReference` and `serializeReference` became `exportRefProject` and `serializeRefProject`; the menu item reads Export .ref Project... and its toast names the format. Removed:

```ts
    { id: 'export-ref', label: 'Export .ref Project...', enabled: has, run: () => void exportRefProject() },
```

### src/app.ts · welcome card · app mark · _v0.32.0

The welcome title shows the app mark at 28 px. Removed:

```ts
<div class="cv-welcome-title">${icon('paintbrush', 20)}formvis</div>
```

### src/app.ts · Unsharp Mask; repair of the 0.31.0 sweep · _v0.33.0

Filter > Unsharp Mask joins the menu. The 0.31.0 attribution sweep had collapsed indentation and spaces before colons across ten TypeScript files and the change logs' quoted code; 0.33.0 restored every line that matched its pre-sweep text apart from whitespace, and corrected the menu label that read Export.ref Project. Removed:

```ts
const FILTERS: FilterKind[] = ['gaussianBlur', 'motionBlur', 'addNoise', 'lensCorrection'];
```

### src/app.ts · Filter > Develop · _v0.36.0

Develop leads the Filter menu on Shift+Mod+A. Removed:

```ts
const FILTERS: FilterKind[] = ['gaussianBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'unsharpMask'];
```

### src/app.ts · Generative Fill · _v0.37.0

The Generative Fill dialog joins the registry and Edit > Generative Fill sits after Content-Aware Fill. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-fg', 'fill-bg', 'clear', 'content-fill', '-', 'transform', '-', 'settings'] },
```

### src/app.ts · Generative Expand, Upscale · _v0.38.0

Image menu entries for Generative Expand and Upscale 2x and 4x. Removed:

```ts
    { label: 'Image', items: ['adj-levels', 'adj-curves', 'adj-hsv', 'adj-exposure', 'adj-gradientMap', 'adj-grain', '-', 'invert', '-', 'canvas-size', 'image-size', '-', 'flip-canvas-h', 'flip-canvas-v'] },
```

### src/app.ts · Layer Style · _v0.39.0

Layer > Layer Style and the same entry on the Layers panel's context menu. Removed:

```ts
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · layer style and type commands · _v0.40.0

Copy, Paste and Clear Layer Style and Edit Type in the Layer and context menus; the Type and fx events. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt } from './engine';
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · text editor · _v0.41.0

The canvas text editor takes Type clicks and type-layer double-clicks. Removed:

```ts
    if (d?.layerId) dialogs.text.showEdit(d.layerId);
    else if (typeof d?.x === 'number' && typeof d?.y === 'number') dialogs.text.showCreate(d.x, d.y);
```

### src/app.ts · Shift+J cycling, PSD open and export · _v0.42.0

Tool keys cycle their group with Shift; PSDs open as documents; File > Export PSD. Removed:

```ts
import { toolForKey } from './extensions/registry';
        try { await openOpened(await api.importProject([f]), null); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    else if (!e.shiftKey && toolForKey(k)) engine.setTool(toolForKey(k)?.id ?? engine.tool);
```

### src/app.ts · path commands · _v0.43.0

Make Selection from Path (Mod+Enter) in Select, Fill Path and Stroke Path in Edit, Delete Path. Removed:

```ts
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-fg', 'fill-bg', 'clear', 'content-fill', 'generative-fill', '-', 'transform', '-', 'settings'] },
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract'] },
```

### src/app.ts · Actions and Batch · _v0.44.0

Recording hooks, playback, batch to zip, File menu entries; the image-import input is marked for the harness. Removed:

```ts
  const imageInput = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" hidden>`);
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', 'export-psd', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
  if (import.meta.env.DEV) (window as unknown as { formvis: unknown }).formvis = { engine, commands };
```

### src/app.ts · smart objects · _v0.45.0

Commands, menus, the dialog, and the runner and margin wiring. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive } from './engine';
import { FILTER_LABELS, FilterPanel, type FilterKind } from './ui/panels/filter-panel';
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · paths and contents · _v0.46.0

Saving and opening carry the path; Save writes contents back; Edit Contents in the menus; a space restored in the .ref message. Removed:

```ts
    const { doc, activeId } = await deserialize(o.manifest, (name) => {
        const { manifest, files } = await serialize(p.doc, p.activeId);
        const { manifest, files } = await serialize(p.doc, p.activeId);
        const { manifest, files, notes } = await serializeRefProject(p.doc, p.activeId);
        if (notes.length) toast(`Exported as.ref with changes: ${notes.join(' ')}`);
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · paths, shapes, relative sizes · _v0.47.0

The Paths panel mounted; path sets saved and restored; shape and New Path commands; relative size replay. Removed:

```ts
    const { doc, activeId, workPath } = await deserialize(o.manifest, (name) => {
    if (workPath) engine.setPathOf(p, workPath);
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathOf(p));
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathOf(p));
        const { manifest, files, notes } = await serializeRefProject(p.doc, p.activeId, engine.pathOf(p));
  async function runStep(s: ActionStep): Promise<boolean> {
    if (s.kind === 'imageSize') return engine.resampleImage(s.w, s.h, s.sampling as Parameters<typeof engine.resampleImage>[2], s.res);
    return engine.resizeCanvas(s.w, s.h, s.dx, s.dy, s.fill);
    const r = await actions.play(x, runStep);
          const r = await actions.play(x, runStep);
    { id: 'rasterize', label: 'Rasterize Layer', enabled: () => { const l = engine.current?.activeLayer; return !!l && (!!l.smart || liveText(l)); }, run: () => engine.rasterizeLayer() },
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · shape style, PSD note · _v0.48.0

The dialog and its command; PSD export notes Paths-panel paths. Removed:

```ts
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
```

### src/app.ts · animation · _v0.49.0

The Timeline mounted, frame commands, GIF export with sizes, timelines saved and restored. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText } from './engine';
    const { doc, activeId, paths } = await deserialize(o.manifest, (name) => {
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p));
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p));
        const { manifest, files, notes } = await serializeRefProject(p.doc, p.activeId, engine.pathsOf(p));
    { label: 'File', items: () => ['new', 'open', 'import', ...(recent.length ? ['-', 'recent-heading', ...recent.map((_, i) => `recent-${i}`), 'clear-recent'] : []), '-', 'save', 'save-as', 'download-project', 'export-ref', '-', 'export-png', 'export-jpg', 'export-psd', '-', 'actions', 'action-stop', 'batch', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
  if (import.meta.env.DEV) (window as unknown as { formvis: unknown }).formvis = { engine, commands, actions };
```

### src/app.ts · tween · _v0.50.0

The Tween dialog and command. Nothing was removed.

### src/app.ts · adjustments in Actions · _v0.51.0

Recording and replaying adjustment steps; new adjustment layers are marked as made. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface } from './engine';
    ...ADJUSTMENT_KINDS.map((kind) => ({ id: `new-adj-${kind}`, label: `New ${ADJUSTMENT_LABELS[kind]} Layer...`, enabled: has, run: () => { const id = engine.addAdjustmentLayer(kind); if (id) dialogs.adjust.openForLayer(id); } })),
```

### src/app.ts · layer style in Actions · _v0.52.0

Recording and replaying Layer Style steps. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind } from './engine';
```

### src/app.ts · pauses · _v0.53.0

Playback honours stops and dialog pauses; a stop ends a batch. Removed:

```ts
  async function runStep(s: ActionStep, relative = false): Promise<boolean> {
    if (s.kind === 'filter') return dialogs.filter.applySettings(s.filter as FilterKind, s.settings);
    if (r.failed) toast(`"${x.name}" stopped at step ${r.done + 1}, ${r.failed}, which could not run here.`, 'error');
```

### src/app.ts · History panel, async runner · _v0.56.0

The History panel mounted; the smart filters get an off-thread runner. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData } from './engine';
```

### src/app.ts · New Snapshot · _v0.57.0

The New Snapshot command. Nothing was removed.

### src/app.ts · Trim, Reveal All · _v0.58.0

The Trim dialog and both commands on the Image menu. Removed:

```ts
    { label: 'Image', items: ['adj-levels', 'adj-curves', 'adj-hsv', 'adj-exposure', 'adj-gradientMap', 'adj-grain', '-', 'invert', '-', 'canvas-size', 'generative-expand', 'image-size', 'upscale-2x', 'upscale-4x', '-', 'flip-canvas-h', 'flip-canvas-v'] },
```

### src/app.ts · Define Pattern, library · _v0.61.0

Define Pattern on the Edit menu; the browser pattern library loaded and saved. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData, runFilterOffThread } from './engine';
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', '-', 'fill-fg', 'fill-bg', 'clear', 'content-fill', 'generative-fill', 'fill-path', 'stroke-path', '-', 'transform', '-', 'settings'] },
```

### src/app.ts · Color Range command · _v0.65.0

Select > Color Range and its dialog. Removed:

```ts
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', '-', 'path-selection', 'delete-path'] },
```
### src/app.ts · error log, recovery, adjustments, align, modify · _v0.66.0

The error log installed after notices, Help > Copy Error Log; crash-recovery copies kept twenty seconds after a change (`keepModified`) and offered after reveal (`offerRecovery`); the new adjustments on the Image menu; Feather (Shift+F6), Border and Smooth on the Select menu; Align and Distribute on the Layer menu. Removed:

```ts
    { label: 'Image', items: ['adj-levels', 'adj-curves', 'adj-hsv', 'adj-exposure', 'adj-gradientMap', 'adj-grain', '-', 'invert', '-', 'canvas-size', 'trim', 'reveal-all', 'generative-expand', 'image-size', 'upscale-2x', 'upscale-4x', '-', 'flip-canvas-h', 'flip-canvas-v'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', '-', ...ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`), 'edit-adjustment', '-', 'duplicate', 'delete-layer', 'rename', 'edit-text', 'convert-smart', 'rasterize', 'smart-filters', 'edit-contents', 'new-shape-path', 'shape-color', 'shape-style', 'layer-style', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', '-', 'path-selection', 'delete-path'] },
    { label: 'Help', items: ['shortcuts', 'about'] },
  void Promise.race([faces, new Promise((r) => window.setTimeout(r, 2500))]).then(() => requestAnimationFrame(() => revealApp()));
```
### src/app.ts · Select Subject, Object in Selection · _v0.71.0

`selectSubject` sends the visible composite (or the current selection's bounds of it) to `/ops/remove-background` and loads the returned mask as the selection, clipped to the old selection for Object in Selection; commands `select-subject` and `select-object` on the Select menu. Removed:

```ts
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData, runFilterOffThread, addPattern, allPatterns, patternById, projectPatterns } from './engine';
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', '-', 'layer-pixels', 'mask-black', '-', 'expand', 'contract', 'feather', 'border', 'smooth', '-', 'path-selection', 'delete-path'] },
```

## src/engine/adjust.ts

### src/engine/adjust.ts · hsvKernel, grainKernel, defaultAdjustmentData · _v0.2.0

Hue/Saturation ported from `HueSaturation.swift` (HSL, per-range band weights, multiplicative saturation, lightness pull, colorize), baked into a 33-point cube lookup table like the color cube. Grain ported from `AdjustPixels.c` (lattice noise, smoothstep, roughness, midtone weighting) in document coordinates. The invert-range rule in `weightOf` is inferred from the settings doc comment, not read from source. `defaultAdjustmentData` writes every non-optional `LayerAdjustment` field because decodes with synthesized Codable; enum-keyed dictionaries are written as Swift's alternating arrays and read in either form.

### src/engine/adjust.ts · band operations · _v0.8.0

Implements `HueBand` methods as pure functions: `bandForward`, `bandHandles`, `bandCentered` (the Sample eyedropper), `bandInclude` (Add), `bandExclude` (Remove), `bandSetHandle` (a handle drag, refused when it would break the order or exceed 350 degrees) and the private `normalizeBand`. Swift's `truncatingRemainder` matches JavaScript's `%`, so wraparound behaves identically. Nothing was removed.

### src/engine/adjust.ts · rewritten independently · _v0.34.0

Hue bands, the eyedroppers' band operations, the HSL model, the 33-point cube, the `.ref` data layout and the defaults are new code with outputs identical to the replaced code; Grain now comes from new triangular lattice noise with the same strength and character and a different pattern. The removed code is not quoted here, deliberately: it is the translated code this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.33.0.
### src/engine/adjust.ts · parametric kinds · _v0.66.0

Labels and kinds extended from `PARAM_ADJUSTMENTS`; `defaultAdjustmentData` fills `data.params` for them. Removed:

```ts
export const ADJUSTMENT_KINDS: AdjustmentKind[] = ['hsv', 'levels', 'curves', 'exposure', 'gradientMap', 'grain'];
```

## src/engine/renderer.ts

### src/engine/renderer.ts · rendering pipeline · _v0.1.0

Created in _v0.1.0.

### src/engine/renderer.ts · kernelFor, adjust, maskOf · _v0.2.0

Adds a kernel cache keyed on the adjustment data object, hands each kernel the region's document origin and scale, and places layer and mask overrides by their own size so scaled previews align. Removed:

```ts
import { IDENTITY, mul, placement, setMat, type Mat } from './geometry';
import { adjustmentKernel } from './kernels';
      const m = mul(job.view, placement(t, layer.raster.width, layer.raster.height));
    const kernel = adjustmentKernel(layer.adjustment);
    kernel(adj);
    return { src, w: m.raster.width, h: m.raster.height, t: m.placement ?? t, covers: !m.placement && !layer.adjustment };
```

### src/engine/renderer.ts · LayerOverride.maskPlacement, maskOf · _v0.15.0

A mask being transformed on its own is positioned by the `maskPlacement` override, and while placed it no longer counts as covering the layer's box. Removed:

```ts
export interface LayerOverride { source?: Surface; transform?: Transform; maskSource?: Surface; hidden?: boolean; blend?: BlendMode; opacity?: number }
```

```ts
    return { src, w: src.width, h: src.height, t: m.placement ?? t, covers: !m.placement && !layer.adjustment };
```

### src/engine/renderer.ts · clipCoverageOf · _v0.19.0

A public, pool-free copy of a clip base's coverage at document size, the exact coverage clipped layers show through, for baking. Nothing was removed.

### src/engine/renderer.ts · halving chain (DownsampleCache) · _v0.20.0

`draw` renders a layer landing under half size from a chain of exact 2x halvings (`halvings`, `halved`, at most six), cached per raster and dropped when its version changes, found through `rasterOf`; Nearest sampling bypasses it. Removed:

```ts
import { createSurface, ctxOf, sizeSurface, type Ctx2D, type Surface } from './surface';
import { IDENTITY, applyMat, invert, matScale, mul, placement, setMat, type Mat } from './geometry';
```

```ts
    c.save();
    setMat(c, m);
```

```ts
    c.drawImage(src, 0, 0);
```

### src/engine/renderer.ts · clipCoverage · override source size · _v0.21.0

A clip base's override source is placed by the source's own size, as layers and masks already were, so a distorted clip base previews at the right scale. Removed:

```ts
    this.draw(slot.c, src, mul(job.view, placement(t, base.raster.width, base.raster.height)), t.sampling, ov?.opacity ?? base.opacity, 'source-over', job.quality);
```

### src/engine/renderer.ts · layer styles · _v0.39.0

Styled layers take the slot path; `effects` draws shadow, glow and stroke beneath them inside the layer's bounds plus reach, large blurs at half resolution, the stroke by distance transform. Removed:

```ts
import { compositeOp, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform } from './types';
import { IDENTITY, applyMat, invert, matScale, mul, placement, scaling, setMat, type Mat } from './geometry';
export interface LayerOverride { source?: Surface; transform?: Transform; maskSource?: Surface; maskPlacement?: Transform; hidden?: boolean; blend?: BlendMode; opacity?: number }
      if (!own && !folders.length && !base) { this.draw(ctx, src, m, t.sampling, opacity, op, job.quality); continue; }
```

### src/engine/renderer.ts · effects above the content · _v0.40.0

Effects draw in two passes, below and above the content; the above pass keeps Color Overlay, Inner Glow and Inner Shadow to the silhouette, the inner ones cast by its inverse. Removed:

```ts
      if (styled) this.effects(ctx, a, fx, matScale(job.view), opacity, W, H, boundsOf([applyMat(m, 0, 0), applyMat(m, src.width, 0), applyMat(m, src.width, src.height), applyMat(m, 0, src.height)]));
  private effects(ctx: Ctx2D, sil: Slot, fx: LayerEffects, scale: number, opacity: number, W: number, H: number, bounds: Rect): void {
    const d = fx.dropShadow, g = fx.outerGlow, k = fx.stroke;
    const reach = Math.max(d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0) * scale + 2;
```

### src/engine/renderer.ts · effect cache · _v0.41.0

Effects at document resolution cached per layer and drawn through the view; `effects()` hands parts to a callback. Removed:

```ts
import { IDENTITY, applyMat, invert, matScale, mul, placement, scaling, setMat, boundsOf, integral, intersectRect, type Mat } from './geometry';
      if (!own && !folders.length && !base && !styled) { this.draw(ctx, src, m, t.sampling, opacity, op, job.quality); continue; }
      const placed = styled ? boundsOf([applyMat(m, 0, 0), applyMat(m, src.width, 0), applyMat(m, src.width, src.height), applyMat(m, 0, src.height)]) : null;
      if (styled && placed) this.effects(ctx, a, fx, matScale(job.view), opacity, W, H, placed, 'below');
      if (styled && placed) this.effects(ctx, a, fx, matScale(job.view), opacity, W, H, placed, 'above');
  private effects(ctx: Ctx2D, sil: Slot, fx: LayerEffects, scale: number, opacity: number, W: number, H: number, bounds: Rect, phase: 'below' | 'above'): void {
    const lay = (s: Surface, alpha: number, op: GlobalCompositeOperation): void => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = op;
      ctx.drawImage(s, 0, 0, bw, bh, bx, by, bw, bh);
      ctx.restore();
    };
```

### src/engine/renderer.ts · Gradient Overlay · _v0.58.0

The gradient painted beneath Color Overlay, kept to the silhouette. Nothing was removed.

### src/engine/renderer.ts · Bevel and Emboss · _v0.59.0

Height-map shading kept by style, above the other inner effects; the effect reach covers it. Removed:

```ts
    const d = fx.dropShadow, g = fx.outerGlow, k = fx.stroke, is = fx.innerShadow, ig = fx.innerGlow, co = fx.colorOverlay;
    const reach = Math.max(d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) * scale + 2;
```

### src/engine/renderer.ts · Satin, fast previews, reach · _v0.60.0

Satin painted between Color Overlay and Inner Glow; the shared blur; parts at reduced resolution while previewing; Bevel reach in the effect region. Removed:

```ts
interface FxPart { s: Surface; x: number; y: number; alpha: number; op: GlobalCompositeOperation; above: boolean }
    const key = JSON.stringify([r?.id ?? null, r?.version ?? 0, t, mk ? [mk.raster?.id ?? null, mk.raster?.version ?? 0, mk.enabled, maskPlacement ?? mk.placement] : null, fx, docW, docH]);
    const reach = Math.max(d.enabled ? d.distance + d.size * 1.5 : 0, g.enabled ? g.size * 1.5 : 0, k.enabled ? k.size : 0, is.enabled ? is.distance + is.size * 1.5 : 0, ig.enabled ? ig.size * 1.5 : 0) + 4;
      const view = translation(-region.x, -region.y), sil = this.slot(8, region.w, region.h);
      sil.c.clearRect(0, 0, region.w, region.h);
      if (own) this.cover(sil.c, own, view, region.w, region.h);
      const local = { x: placed.x - region.x, y: placed.y - region.y, w: placed.w, h: placed.h };
          parts.push({ s: copy, x: region.x + box.x, y: region.y + box.y, alpha, op, above: phase === 'above' });
        }, sil, fx, 1, 1, region.w, region.h, local, phase);
      ctx.drawImage(p.s, 0, 0);
    const blur = (src: Float32Array, r: number): Float32Array => {
      if (r < 1) return src;
      let x: Float32Array = src, y: Float32Array = new Float32Array(n);
      const k = 1 / (2 * r + 1);
      for (let pass = 0; pass < 3; pass++) {
        for (let row = 0; row < h; row++) {
          const o = row * w;
          let s = 0;
          for (let i = -r; i <= r; i++) s += x[o + Math.min(w - 1, Math.max(0, i))];
          for (let i = 0; i < w; i++) { y[o + i] = s * k; s += x[o + Math.min(w - 1, i + r + 1)] - x[o + Math.max(0, i - r)]; }
        }
        [x, y] = [y, x === src ? new Float32Array(n) : x];
        for (let col = 0; col < w; col++) {
          let s = 0;
          for (let j = -r; j <= r; j++) s += x[Math.min(h - 1, Math.max(0, j)) * w + col];
          for (let j = 0; j < h; j++) { y[j * w + col] = s * k; s += x[Math.min(h - 1, j + r + 1) * w + col] - x[Math.max(0, j - r) * w + col]; }
        }
        [x, y] = [y, x];
      }
      return x;
    };
```

### src/engine/renderer.ts · Pattern Overlay · _v0.61.0

The pattern tiled from the layer corner, the lowest overlay. Nothing was removed.
### src/engine/renderer.ts · per-pixel blend modes · _v0.66.0

`render` sends a layer in a mode the canvas lacks through the slot path, then `pixelBlend` reads the target and the slot within the layer's placed bounds and blends them with `blendPixels`; Dissolve's pattern is taken in document pixels through the inverse view. Removed:

```ts
import { compositeOp, type BlendMode, type Doc, type ID, type Layer, type Sampling, type Transform, effectsActive, type LayerEffects, type RGB, type Rect } from './types';
      const op = compositeOp(ov?.blend ?? layer.blend);
      if (!own && !folders.length && !base && (!styled || parts)) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = op;
      ctx.drawImage(a.s, 0, 0);
      ctx.restore();
```

## src/engine/distort.ts

### src/engine/distort.ts · DistortWarp port · _v0.21.0

the free distort math: `cornersOf` (handle order), `distortUsable` (convex and non-degenerate), `homography` and `project`, `carried` (a box's perspective applied to inner corners, for group members and masks placed apart), `warpRaster` (premultiplied, edge-clamped bilinear inverse mapping, preview scale, mask mode with an edge tone outside), `visibleBounds` and `cropWarp` (warpTrimmed), and `maskEdgeTone` (LayerMask.background).

### src/engine/distort.ts · rewritten independently · _v0.35.0

The perspective map solved from its eight corner equations by Gauss-Jordan elimination, inverted through cross products, resampled with premultiplied bilinear filtering; identical outputs. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

### src/engine/distort.ts · imageCorners · _v0.52.0

Exported for smart-object distortion. Removed:

```ts
function imageCorners(c: readonly Pt[], flipX: boolean, flipY: boolean): Pt[] {
```

### src/engine/distort.ts · masks in alpha, inverse3 · _v0.54.0

The warp keeps mask levels in alpha; maskEdgeTone samples alpha; inverse3 exported. Removed:

```ts
function inverse3(m: readonly number[]): number[] | null {
  if (mask) for (let k = 0; k < od.length; k += 4) { od[k] = od[k + 1] = od[k + 2] = background; od[k + 3] = 255; }
          const o = texel(ix + dx, iy + dy), k = weight * (mask ? 255 : sd[o + 3]);
      od[o + 3] = mask ? 255 : Math.round(a);
  const add = (x: number, y: number): void => { sum += d[(y * w + x) * 4]; count++; };
```

## src/engine/dpi.ts

### src/engine/dpi.ts · withResolution · _v0.25.0

the ImageExporter DPI: a PNG `pHYs` chunk (pixels per meter, with its CRC32) placed after IHDR unless one exists, and a JPEG's JFIF density in dots per inch (an APP0 segment inserted when absent); other types and out-of-range resolutions pass through.

## src/engine/filter-jobs.ts

### src/engine/filter-jobs.ts · runFilterOffThread · _v0.26.0

One long-lived module worker with numbered jobs, pixels transferred in and out, resolving to the filtered ImageData; null where module workers are unavailable or after a failure, so callers run the kernel themselves.

### src/engine/filter-jobs.ts · unsharpMask settings · _v0.33.0

`FilterKind` gains `unsharpMask` and `FilterSettings` its Amount, Radius and Threshold. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection';
```

### src/engine/filter-jobs.ts · develop · _v0.36.0

`FilterSettings` carries the Develop state. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask';
```
### src/engine/filter-jobs.ts · Lens Blur, Smart Sharpen · _v0.68.0

`FilterSettings` gains `lensRadius`, `lensBrightness`, `lensThreshold` and `smart`; `FilterKind` gains `lensBlur` and `smartSharpen`. Removed:

```ts
export interface FilterSettings { radius: number; angle: number; distance: number; amount: number; gaussian: boolean; monochromatic: boolean; distortion: number; usmAmount: number; usmRadius: number; threshold: number; develop: DevelopState }
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop';
```

## src/engine/filter-worker.ts

### src/engine/filter-worker.ts · filter worker · _v0.26.0

Runs Gaussian Blur, Motion Blur, Add Noise and Lens Correction off the main thread from the same kernels the main thread uses, transferring the result back.

### src/engine/filter-worker.ts · Unsharp Mask · _v0.33.0

The worker runs Unsharp Mask too. Removed:

```ts
import { addNoise, gaussianBlur, lensDistort, motionBlur } from './filters';
```

### src/engine/filter-worker.ts · develop · _v0.36.0

The worker runs Develop. Nothing was removed.
### src/engine/filter-worker.ts · Lens Blur, Smart Sharpen · _v0.68.0

Two branches run the new filters off the main thread. Nothing was removed.

## src/engine/events.ts

### src/engine/events.ts · typed emitter · _v0.1.0

Created in _v0.1.0.

## src/engine/filters.ts

### src/engine/filters.ts · gaussianBlur, motionBlur, addNoise, lensDistort, histogram, resizeMask · _v0.2.0

Gaussian Blur as three premultiplied box passes with zero padding, so it fades past the edge; Motion Blur as a sampled line of the given length (matches Core Image's radius to that length by variance); Add Noise and Lens Correction ported from `NoisePixels.c` and `LensPixels.c` with premultiplied sampling; the Levels histogram from `LevelsPixels.c`; Expand and Contract through a Felzenszwalb distance transform with one pixel of antialiasing.

### src/engine/filters.ts · unsharpMask · _v0.33.0

Unsharp Mask: each channel pushed from its Gaussian blur by Amount where the difference reaches Threshold; alpha untouched. Nothing was removed.

### src/engine/filters.ts · rewritten independently · _v0.34.0

Kovesi's three-box Gaussian, a bilinear line-integral motion blur, a radial lens model, alpha-weighted histograms and Felzenszwalb and Huttenlocher's distance transform, all new code with outputs identical to the replaced code; Add Noise now draws from SplitMix32, keeping the old statistics with a new pattern. `unsharpMask` (0.33.0) is unchanged. The removed code is not quoted here, deliberately: it is the translated code this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.33.0.

### src/engine/filters.ts · faster box blur · _v0.54.0

Box passes with channel locals and a row-major column pass, identical output. Removed:

```ts
 *  divided by its full width, so values fade past the image edge. */
  const scale = 1 / (2 * r + 1), lines = across ? h : w, length = across ? w : h, stride = across ? 4 : w * 4;
  const sum = new Float64Array(4);
  for (let line = 0; line < lines; line++) {
    const origin = across ? line * w * 4 : line * 4;
    sum.fill(0);
    const warm = Math.min(r, length - 1);
    for (let k = 0; k <= warm; k++) for (let c = 0; c < 4; c++) sum[c] += src[origin + k * stride + c];
    for (let i = 0; i < length; i++) {
      const at = origin + i * stride;
      for (let c = 0; c < 4; c++) dst[at + c] = sum[c] * scale;
      const enter = i + r + 1, leave = i - r;
      if (enter < length) for (let c = 0; c < 4; c++) sum[c] += src[origin + enter * stride + c];
      if (leave >= 0) for (let c = 0; c < 4; c++) sum[c] -= src[origin + leave * stride + c];
```

## src/engine/geometry.ts

### src/engine/geometry.ts · matrices and rectangles · _v0.1.0

Created in _v0.1.0.

## src/engine/history.ts

### src/engine/history.ts · undo stack · _v0.1.0

Created in _v0.1.0.

### src/engine/history.ts · steps · _v0.56.0

The steps kept, in order, and how many are done. Nothing was removed.
### src/engine/history.ts · rollback, markUnsaved · _v0.66.0

`rollback` hands back the open step's starting snapshot and the pixel patches recorded so far, for `Engine.rollBack`; `markUnsaved` makes a recovered document count as modified. Nothing was removed.

## src/engine/index.ts

### src/engine/index.ts · Engine.moveLayers · _v0.1.0

Removed: a drop onto the slot a layer already held recorded an undo entry that changed nothing. The new code compares id, parent and clip order and returns false on a no-op.

```ts
      p.setLayers(this.normalizeClips(layers));
```

### src/engine/index.ts · Engine.setMaskFromImage · _v0.1.0

Added for Remove Background: the engine result becomes a linked layer mask, never deleted pixels, as `.ref` projects store it.

### src/engine/index.ts · live edits, previews, image edits, sizing, clipboard, gradient, shapes · _v0.2.0

Adds `beginLive`, `updateLive`, `commitLive` and `cancelLive` (one undo step for panel editing); `setPreview` and `previewImageEdit` (scaled to about 2 megapixels, grown for blurs); `applyImageEdit` (through the selection, masks as gray, blurs grow the layer); adjustment layers; Canvas Size with the Canvas Extension layer; Crop; Image Size; Expand, Contract and Mask's Black Areas; the clipboard; the pending gradient, committed on `settle` so the first Undo discards it; shape layers, redrawn on resize and plain pixels once painted, filled or filtered. Clearing on a mask now fills with the background color. Removed:

```ts
    this.regionEdit('Clear', ({ raster, rect, cover }) => {
      const c = raster.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.drawImage(this.tint(rect, '#ffffff', cover), rect.x, rect.y);
      c.restore();
    });
      p.updateLayer(l.id, { transform: next, mask: followMask(l, next) });
```

### src/engine/index.ts · retouch strokes, warp, Content-Aware Fill · _v0.3.0

Adds `beginRetouchStroke` (Spot Healing previews as a tint and heals on release; Clone Stamp and Blur paint a texture), Clone Stamp's source and offset rules from `CloneStamp.swift` (aligned offsets fixed by the first stroke, cleared by a new source), the Blur sample blurred by `diameter / 10` clamped 1.5 to 30 from `BlurTool.swift`, the Smudge and Liquify warp lifecycle shown through a document-size override and committed along the dab path as one undo step, and `contentAwareFill` through the selection's soft coverage. Retouch tools work on layer pixels; Blur on masks is not ported yet. Removed:

```ts
    const patch = st.s.commit();
```

### src/engine/index.ts · snapping, precise transforms, pixel moves · _v0.4.0

Move drags snap through `snapMove`: the moving box's edges and center go to the nearest target within 6 screen pixels among the canvas edges and center and every other visible layer's upright bounds and center, as the `snappedMove`, with `snapGuides` for the overlay; `snapping` turns it off. `setLayerTransform`, `resizeLayerTo` and `scaleLayerTo` back the Move inspector fields: each is one undo step, resizes around the center, honors the ratio lock, redraws shape layers, and a no-op records nothing. `beginPixelMove`, `movePixelsBy`, `endPixelMove` and `cancelPixelMove` lift the selected pixels, show them over the layer with the selection cleared (kept for a duplicate), and commit one patch with the selection translated; `outlineShift` lets the ants follow. Removed:

```ts
  cancelTransform(): void { if (this.transformEdit) { this.transformEdit = null; this.emit('render', null); this.emit('options', null); } }
```

### src/engine/index.ts · Transform Selection, growLayer · _v0.5.0

`transformCommand` floats the selection when `canTransformSelection`, else switches to Move with transform controls on. `beginSelectionTransform` switches to Move first (switching settles), then opens one Transform Selection step: the selected pixels go onto a Floating Selection layer above their layer with its opacity and blend, the source shows its cleared pixels through the override map without being written, and the selection is handed to the float. Drags and inspector edits of the float update it without history (`settle(keepFloating)`, the floating branches in `endTransform` and `setLayerTransform`). `commitSelectionTransform` grows the source where the pixels now extend past it, writes cleared base plus transformed float, removes the float, and carries the selection through the same matrix; an unchanged float, a cancel, or a closed project restores the document exactly. `ensurePixels` now calls the general `growLayer(want)`. Removed:

```ts
  settle(): void {
```

```ts
    this.settle();
    this.transformEdit = { project: p, layerId: l.id, original: l.transform, draft: l.transform, mode, start };
```

```ts
    const t = layer.transform, r = layer.raster;
    if (!isAxisAligned(t, r.width, r.height)) return r;
    if (t.x <= 0 && t.y <= 0 && t.x + t.w >= W && t.y + t.h >= H) return r;
    const u = unionRect({ x: t.x, y: t.y, w: t.w, h: t.h }, { x: 0, y: 0, w: W, h: H });
```

### src/engine/index.ts · sampleOriginal · _v0.7.0

Returns the unpremultiplied RGB of the original pixel under a document point from the source the Levels histogram reads: the target layer's pixels, or its mask's when the mask is targeted (mirroring `targetImage`), or the flattened document for an adjustment layer. Nothing was removed.

### src/engine/index.ts · applySubjectMask · _v0.9.0

Lays a refined subject mask on a layer as one Remove Background step, stored as formvis masks are (white with the level in alpha), multiplied into an existing same-size unplaced mask as the `subjectMask` does. Nothing was removed; `setMaskFromImage` stays for other callers.

### src/engine/index.ts · sampleRing, setSampleRing · _v0.11.0

the sample ring state: the document point, the sampled color and the color before the drag, set by whatever is sampling and drawn by the stage; `showsSampleRing` is the Eyedropper's Sample Ring option and suppresses it. Nothing was removed.

### src/engine/index.ts · wand Sample Size, selectionAntialiased, nudgeSelection · _v0.13.0

`wand.sampleSize` (0 Point, 1 three by three, 2 five by five) passes to `wandMask`; `selectionAntialiased` is the session-wide Anti-alias for the Lasso and elliptical Marquee; `nudgeSelection` moves the outline as one Move Selection step. Removed:

```ts
  wand = { tolerance: 32, contiguous: true, sampleAll: false };
```

```ts
    const mask = wandMask(data, W, H, x, y, this.wand.tolerance, this.wand.contiguous);
```

### src/engine/index.ts · copyMask · _v0.14.0

the Option-drag mask copy: the source's mask onto the target as one Copy Layer Mask or Replace Layer Mask step, pinned where it sits on the document (`placement` from the source's mask or layer transform), with its own raster, or kept solid when the source was never painted; the target becomes active with its mask targeted. Nothing was removed.

### src/engine/index.ts · transformsMask, transform edit mask mode · _v0.15.0

with a painted mask targeted and unlinked (`transformsMask`), a transform edit starts from the mask's box, previews through `maskPlacement`, and commits the mask's placement as one Transform Layer Mask step. Removed:

```ts
  transformEdit: { project: Project; layerId: ID; original: Transform; draft: Transform; mode: DragMode; start: Pt } | null = null;
```

```ts
    this.transformEdit = { project: p, layerId: l.id, original: l.transform, draft: l.transform, mode, start };
```

```ts
    if (te && te.project === p) m.set(te.layerId, { ...(m.get(te.layerId) ?? {}), transform: te.draft });
```

### src/engine/index.ts · maskBlurSample, beginRetouchStroke on masks · _v0.16.0

`maskBlurSample` ports the blurSample for a mask (the mask at document size, its area from none, the rest at its binary edge tone, blurred at the Blur sigma); `beginRetouchStroke` lets Blur paint a targeted mask as a lerp stroke with the stroke's real target, while Clone Stamp and Spot Healing still refuse masks. Removed:

```ts
    if (p.maskTarget && l0.mask) { this.notice('This tool works on layer pixels. Click the layer thumbnail to target them.'); return false; }
```

```ts
    } else if (kind === 'blur') texture = { surface: this.layerSample(p, l0, clamp(this.brush.diameter / 10, 1.5, 30)), dx: 0, dy: 0 };
```

```ts
    const s = new PixelStroke(pick.raster, pick.local, style, 'source-over', p.selection, texture);
    this.stroke = { project: p, layerId: pick.layer.id, target: 'pixels', s, heal: kind === 'heal' ? this.retouch.healMode : undefined };
```

```ts
    if (shift && last && last.layerId === pick.layer.id && last.target === 'pixels') s.to(last.p);
```

### src/engine/index.ts · groupMembers, groupBox, group transform edits · _v0.17.0

the group transform: with more than one layer selected or a folder, `groupMembers` (visible pixel layers selected or inside a selected folder) move with `groupBox`, each member previewed and committed through `following`, as one Transform Layers step; group moves skip snapping for now. Removed:

```ts
  transformEdit: { project: Project; layerId: ID; original: Transform; draft: Transform; mode: DragMode; start: Pt; mask: boolean } | null = null;
```

```ts
    if (!p || !l || l.isGroup || !l.raster || this.stroke) return false;
```

```ts
    const box = mask ? l.mask?.placement ?? l.transform : l.transform;
    this.transformEdit = { project: p, layerId: l.id, original: box, draft: box, mode, start, mask };
```

```ts
    if (te && te.project === p) m.set(te.layerId, { ...(m.get(te.layerId) ?? {}), ...(te.mask ? { maskPlacement: te.draft } : { transform: te.draft }) });
```

```ts
    if (te.mode.kind === 'move' && this.snapping) te.draft = this.snapMove(te.project, te.layerId, te.draft);
```

### src/engine/index.ts · copyLayerToProject, group snapping · _v0.18.0

the copyLayer(into:): a layer with a folder's contents copied into another open project as one Copy Layers from Project step (new ids, cloned rasters and masks, remapped parent and clip links, centered on the target canvas, on top), the target made current, within the 100-megapixel budget. `snapMove` skips a set of moving layers, so group moves now snap their box. Removed:

```ts
  private snapMove(p: Project, id: ID, t: Transform): Transform {
```

```ts
      if (!e.visible || l.isGroup || !l.raster || l.id === id) continue;
```

```ts
    if (te.mode.kind === 'move' && this.snapping && !te.group) te.draft = this.snapMove(te.project, te.layerId, te.draft);
```

### src/engine/index.ts · liveMaskDependents, doomedBy, deleteLayers(bake) · _v0.19.0

A live mask is a clipping mask. `liveMaskDependents` names the layers clipped to ones being deleted; `deleteLayers(true)` bakes each (its cloned raster masked by `clipCoverageOf` mapped into its pixel grid) before unlinking, as one Delete Layer step. Removed:

```ts
  deleteLayers(): void {
```

```ts
      const doomed = new Set<ID>();
      for (const id of roots) { doomed.add(id); for (const d of descendantIds(p.doc.layers, id)) doomed.add(d); }
```

```ts
      const kept = p.doc.layers.filter((l) => !doomed.has(l.id)).map((l) => (l.clipId && doomed.has(l.clipId) ? { ...l, clipId: null } : l));
```

### src/engine/index.ts · distortEdit, beginDistort, moveDistortCorner, applyDistort · _v0.21.0

the free distort: a pending four-corner edit of the active layer or the group box, previewed per layer at up to 640 px through the overrides, applied at full resolution as Distort or Distort Layers; `distortQuad` carries group members, `distortMask` handles linked, placed and unlinked masks; `settle` applies a pending distortion. Removed (0.21.0 replaced its own first, single-layer version before release, so only earlier code is quoted):

```ts
  settle(keepFloating = false): void {
    if (this.gradient) this.commitGradient();
```

```ts
import { dragged, following, rounded, type DragMode } from './transform';
```

### src/engine/index.ts · tipDrag, beginTipDrag, updateTipDrag, endTipDrag · _v0.22.0

right-drag resizes the brush from its size at the press (2 dx over the zoom, 1 to 2000) or with Shift changes its hardness (dx over 200), the circle pinned at the press. Nothing was removed.

### src/engine/index.ts · floatingOutline · _v0.24.0

the mapPath for Transform Selection: the floating pixels' source selection and the matrix placement(now) times placement(original) inverse, now being the live draft while dragging; null when a distortion leaves no affine map. Nothing was removed.

### src/engine/index.ts · exportBlob · resolution stamp · _v0.25.0

Every PNG and JPEG export passes through `withResolution` with the document's resolution. Removed:

```ts
    return toBlob(renderDoc(this.work, p.doc, type === 'image/jpeg' ? '#ffffff' : null), type, quality);
```

### src/engine/index.ts · previewImageEdit, setPreview, previewToken · _v0.26.0

A preview result may arrive later: `previewImageEdit` takes `ImageData | Promise<ImageData>` and paints through `finish` only while its token is current, and `setPreview(null)` bumps that token, so a worker result for a superseded or switched-off preview is dropped. Removed:

```ts
  previewImageEdit(run: (src: ImageData, scale: number) => ImageData, grow = 0, maxPixels = 2_000_000): void {
    const p = this.current;
```

```ts
    const out = run(src, scale);
    const cov = g ? null : this.coverageFor(p, l, onMask ? 'mask' : 'pixels', w, h);
    let result = cov ? this.blendThrough(src, out, cov) : out;
    if (onMask) result = fromGray(result);
    c.putImageData(result, 0, 0);
```

### src/engine/index.ts · clonePreview · _v0.27.0

the source around `clonePoint(at)` rendered for just the brush circle at screen resolution, from the document or the active layer as the stroke samples, faded by the brush tip through a radial `destination-in` gradient, cached by sample point, brush, side, sampling mode, layer and revision; null during a stroke. Removed:

```ts
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, sameTransform, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
```

### src/engine/index.ts · strokeTo · changed region · _v0.29.0

The render event carries `Rect | null`; a stroke frame reports the document bounds of its composed rectangle (mapped through the layer or mask placement) unless `dirtyRendering` is off. Removed:

```ts
  history: null; colors: null; render: null; overlay: null; busy: boolean; notice: Notice;
```

```ts
    if (st.s.compose()) this.emit('render', null);
```

### src/engine/index.ts · generativeFill · _v0.37.0

Sends the visible composite around the selection (25% context, 16 to 256 px) and the selection grown by three pixels as the mask, then inserts the result as one masked layer; refuses to place it if the document changed. Nothing was removed.

### src/engine/index.ts · fillArea, generativeExpand, upscaleToDocument · _v0.38.0

`generativeFill` became a wrapper over `fillArea`, which also pre-fills see-through context; Expand and Upscale added. Removed:

```ts
  /** Generative Fill: sends what the document shows around the selection, with the selection grown by three pixels as
   *  the mask, to `generate`, then places the result as a new layer masked to the selection, in one undo step. An empty
   *  prompt asks for removal. Returns false when nothing was placed. */
  async generativeFill(prompt: string, generate: (image: Blob, mask: Blob) => Promise<Blob>): Promise<boolean> {
    const p = this.current, sel = p?.selection;
    if (!p || !sel) { this.notice('Generative Fill needs a selection.'); return false; }
    const view = this.flattened();
    if (!view) return false;
    const reach = Math.min(256, Math.max(16, Math.round(Math.max(sel.w, sel.h) * 0.25)));
    const x0 = Math.max(0, sel.x - reach), y0 = Math.max(0, sel.y - reach);
    const w = Math.min(p.doc.width, sel.x + sel.w + reach) - x0, h = Math.min(p.doc.height, sel.y + sel.h + reach) - y0;
    if (w < 1 || h < 1) { this.notice('The selection is outside the canvas.'); return false; }
    const context = new Raster(w, h);
    context.ctx.drawImage(view, -x0, -y0);
    const cover = new Raster(w, h);
    cover.ctx.drawImage(sel.surface(), sel.x - x0, sel.y - y0);
    const mask = Raster.filled(w, h, '#000000');
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) mask.ctx.drawImage(cover.canvas, dx, dy);
    let result: Blob;
    try {
      result = await generate(await toBlob(context.canvas), await toBlob(mask.canvas));
    } catch (err) {
      this.notice(err instanceof Error ? err.message : 'Generative Fill failed.', 'error');
      return false;
    }
    if (this.current !== p) { this.notice('The document changed while generating, so the fill was not placed.', 'error'); return false; }
    const bitmap = await createImageBitmap(result);
    const layer = new Raster(w, h);
    layer.ctx.imageSmoothingQuality = 'high';
    layer.ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    layer.touch();
    cover.touch();
    const name = `Generative Fill: ${prompt.trim() || 'remove'}`;
    this.insertRasterLayer(layer, name.length > 60 ? `${name.slice(0, 57)}...` : name, x0, y0, { mask: { raster: cover, enabled: true, linked: true, placement: null } }, 'Generative Fill');
    return true;
  }
```

### src/engine/index.ts · setLayerEffects, previewLayerEffects · _v0.39.0

One undo step per change, none when unchanged; the preview joins the render overrides; strokes repaint whole in documents with styled layers. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform } from './types';
    if (!this.dirtyRendering || !l || !r || !t) { this.emit('render', null); return; }
```

### src/engine/index.ts · style clipboard, type layers · _v0.40.0

Copy, Paste and Clear Layer Style (paste and clear over every selected layer in one step); `textSettings`, `textLayerAt`, `createTextLayer` and `updateTextLayer`. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects } from './types';
```

### src/engine/index.ts · setTextEditing, repaint rule · _v0.41.0

Hides a type layer while it is edited on the canvas; strokes repaint whole only for the painted styled layer, clipped styled layers and styled layers in folders. Removed:

```ts
export { TEXT_FONTS, defaultText, liveText, textFromData, textKey } from './text';
    // Layer styles can cast from outside a stroke's region into it, so documents using them repaint whole.
    const styled = st.project.doc.layers.some((x) => effectsActive(x.effects));
```

### src/engine/index.ts · Healing Brush stroke, patchSelection · _v0.42.0

The `healBrush` stroke kind heals at release from its offset in the layer's pixels; `patchSelection` heals the selection from a dragged offset as one undo step. Removed:

```ts
import { WarpStroke, contentFill, fillTransparent, premultiply, spotHeal, unpremultiply, type HealMode } from './retouch';
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode } | null = null;
    const patch = st.heal ? this.healPatch(st.s, st.heal) : st.s.commit();
  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur', pt: Pt, shift: boolean): boolean {
    if (kind === 'clone') {
      if (!off) { this.notice('Alt-click to set where Clone Stamp copies from.'); return false; }
    p.history.begin(kind === 'heal' ? 'Spot Healing' : kind === 'clone' ? 'Clone Stamp' : 'Blur', p.snapshot());
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s, heal: kind === 'heal' ? this.retouch.healMode : undefined };
```

### src/engine/index.ts · Work Path and path commands · _v0.43.0

The Work Path per open document; Make Selection, Fill Path, Stroke Path and Delete Path. Removed:

```ts
import { Raster, createSurface, ctxOf, toBlob, type Surface } from './surface';
```

### src/engine/index.ts · openImage · _v0.44.0

A document holding one image as its one layer, for Batch. Nothing was removed.

### src/engine/index.ts · smart objects · _v0.45.0

Convert, Rasterize, the filter stack with padded re-rendering, and the smart-object gate at every pixel-editing entry point. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec } from './types';
```

### src/engine/index.ts · paths per document, Edit Contents · _v0.46.0

pathOf and setPathOf; editOn and restack; editContents, contentsOf and updateContents. Removed:

```ts
export { cornerAt, pathBounds, tracePath, type Anchor, type SubPath, type VectorPath } from './paths';
  setSmartFilters(id: ID, filters: SmartFilter[], name = 'Smart Filters'): void {
    this.edit(name, (p) => {
      const stack = structuredClone(filters), raster = this.renderSmart(l.smart.source, stack), old = l.raster as Raster, t = l.transform;
      p.updateLayer(id, { smart: { source: l.smart.source, filters: stack }, raster, transform: { ...t, x: cx - w / 2, y: cy - h / 2, w, h }, mask });
  setWorkPath(vp: VectorPath | null): void {
    const p = this.current;
    if (!p) return;
    this.emit('overlay', null);
    this.emit('options', null);
```

### src/engine/index.ts · paths per document, shape layers · _v0.47.0

Path lists and selection; the Shape Path entry, rendering, gesture undo, protection and recolouring. Removed:

```ts
import { pathBounds, tracePath, type VectorPath } from './paths';
export { anchorNear, cornerAt, nearestSegment, pathBounds, pathData, pathFrom, splitSegment, tracePath, type Anchor, type SubPath, type VectorPath } from './paths';
  history: null; colors: null; render: Rect | null; overlay: null; busy: boolean; notice: Notice;
    if (!l?.smart || (p.maskTarget && l.mask)) return false;
    this.notice(SMART_NOTICE);
      if (!l || (!l.smart && !l.text)) return false;
      p.updateLayer(l.id, { smart: null, text: null });
  private readonly workPaths = new WeakMap<Project, VectorPath>();
  /** The current document's Work Path, drawn with the Pen tool. It lives with the open document and is not saved yet. */
  get workPath(): VectorPath | null { const p = this.current; return p ? this.workPaths.get(p) ?? null : null; }
  setWorkPath(vp: VectorPath | null): void { const p = this.current; if (p) this.setPathOf(p, vp); }
  /** Any open document's Work Path, as saving reads it. */
  pathOf(p: Project): VectorPath | null { return this.workPaths.get(p) ?? null; }
  /** Sets any open document's Work Path, as opening a project restores it. */
  setPathOf(p: Project, vp: VectorPath | null): void {
    if (vp && vp.subpaths.some((sp) => sp.anchors.length)) this.workPaths.set(p, vp); else this.workPaths.delete(p);
  deletePath(): void { this.setWorkPath(null); }
    if (this.current?.activeLayer?.smart) { this.notice(SMART_NOTICE); return false; }
    if (al?.smart && !(this.current?.maskTarget && al.mask)) { this.notice(SMART_NOTICE); return; }
```

### src/engine/index.ts · shape fill and stroke · _v0.48.0

Rendering with fill and stroke, lines stroked by default, setShapeStyle. Removed:

```ts
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter } from './types';
  private renderShape(path: VectorPath, fill: RGB): { raster: Raster; x: number; y: number } | null {
    if (!b) return null;
    const x = Math.floor(b.x) - 1, y = Math.floor(b.y) - 1, w = Math.min(LIMITS.side, Math.ceil(b.x + b.w) + 1 - x), h = Math.min(LIMITS.side, Math.ceil(b.y + b.h) + 1 - y);
    const raster = new Raster(Math.max(1, w), Math.max(1, h));
    raster.ctx.translate(-x, -y);
    raster.ctx.fillStyle = rgbCss(fill);
    raster.ctx.fill(tracePath(path));
    raster.ctx.setTransform(1, 0, 0, 1, 0, 0);
  private reshape(p: Project, id: ID, path: VectorPath, fill: RGB): void {
    const r = this.renderShape(path, fill), l = p.layer(id);
    if (!r || !l) return;
    p.updateLayer(id, { raster: r.raster, transform: { ...l.transform, x: r.x, y: r.y, w: r.raster.width, h: r.raster.height, rotation: 0, flipX: false, flipY: false }, vector: { path: stored, fill, origin: { x: r.x, y: r.y } }, shape: null });
    const path = structuredClone(vp), fill = { ...this.fg }, r = this.renderShape(path, fill);
    this.insertRasterLayer(r.raster, `Shape ${n}`, r.x, r.y, { vector: { path, fill, origin: { x: r.x, y: r.y } } }, 'New Shape Layer');
    this.edit('Shape Color', (p) => this.reshape(p, l.id, shiftPath(v.path, dx, dy), { ...this.fg }));
        if (this.pathGesture === p) this.reshape(p, l.id, vp, l.vector.fill);
        else this.edit('Edit Shape Path', (q) => this.reshape(q, l.id, vp, (l.vector as NonNullable<Layer['vector']>).fill));
```

### src/engine/index.ts · timeline · _v0.49.0

Timelines per document, frame selection as undo steps, reconciling after undo and redo, rendering a frame. Removed:

```ts
  history: null; colors: null; render: Rect | null; overlay: null; busy: boolean; notice: Notice; paths: null;
```

### src/engine/index.ts · moveFrame, tween · _v0.50.0

Reordering frames and filling in tweened frames. Removed:

```ts
import { captureFrame, frameLayers, type Frame, type Timeline } from './timeline';
```

### src/engine/index.ts · smart distortion, applyLayerStyle · _v0.52.0

Warped re-renders, distorting from the undistorted render, carrying moves into the warp; Layer Style for Actions. Removed:

```ts
import { carried, cornersOf, cropWarp, distortUsable, maskEdgeTone, visibleBounds, warpRaster, type Warped } from './distort';
    const m = Math.min(512, Math.ceil(shown.reduce((n, f) => n + (this.smartFilterMargin?.(f.kind, f.settings) ?? 0), 0)));
  distortEdit: { project: Project; layerId: ID; box: Transform; members: ID[] | null; corners: Pt[]; previews: Map<ID, { pixels: Warped | null; mask: DistortedMask | null }> } | null = null;
    if (this.current?.activeLayer?.smart || this.current?.activeLayer?.vector) { this.notice(this.current.activeLayer.vector ? SHAPE_NOTICE : SMART_NOTICE); return false; }
      if (l?.raster && q) d.previews.set(id, { pixels: warpRaster(l.raster, l.transform, q, scale), mask: this.distortMask(l, q, scale) });
```

### src/engine/index.ts · masked smart distortion, style normalising · _v0.54.0

Smart objects distort with their masks; setLayerEffects normalises partial styles. Removed:

```ts
import { carried, cornersOf, cropWarp, distortUsable, maskEdgeTone, visibleBounds, warpRaster, type Warped, imageCorners, homography, project } from './distort';
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle } from './types';
    const next = effectsActive(effects) ? structuredClone(effects) : null;
  distortEdit: { project: Project; layerId: ID; box: Transform; members: ID[] | null; corners: Pt[]; smart?: { R: Raster; t: Transform; margin: number }; previews: Map<ID, { pixels: Warped | null; mask: DistortedMask | null }> } | null = null;
      if (l.mask) { this.notice('A smart object with a layer mask cannot be distorted yet; apply or delete the mask first.'); return false; }
      this.distortEdit = { project: p, layerId: l.id, box: rt, members: null, corners, previews: new Map(), smart: { R, t: rt, margin } };
      if (l?.raster && q) d.previews.set(id, sm ? { pixels: warpRaster(sm.R, sm.t, q, scale), mask: null } : { pixels: warpRaster(l.raster, l.transform, q, scale), mask: this.distortMask(l, q, scale) });
      const w = this.warpedSmart(sm.R, m, src, warp);
      const smart = sl.smart;
      if (w) this.edit('Distort', (q) => q.updateLayer(sl.id, { raster: w.raster, transform: w.t, smart: { ...smart, warp, warpAt: w.t } }));
```

### src/engine/index.ts · background filters, stroke warm-up · _v0.55.0

applyImageEditAsync with its source preparation; painting tools warm stroke surfaces; strokes give their surfaces back. Removed:

```ts
import { PixelStroke } from './stroke';
```

### src/engine/index.ts · smart re-render, history jumps · _v0.56.0

Large smart objects re-render in the background, latest change winning; historySteps and jumpHistory. Removed:

```ts
    if (l?.smart) this.setSmartFilters(l.id, [...l.smart.filters, { id: uid(), kind, settings: structuredClone(settings), enabled: true }], 'Smart Filter');
  setSmartFilters(id: ID, filters: SmartFilter[], name = 'Smart Filters'): void { const p = this.current; if (p) this.restack(p, id, null, filters, name); }
  private restack(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string): boolean {
      const stack = structuredClone(filters ?? l.smart.filters), raster = this.renderSmart(src, stack), old = l.raster as Raster, t = l.transform;
    const ok = this.restack(target.parent, target.layer.id, Raster.from(flat, flat.width, flat.height), null, 'Update Smart Object');
```

### src/engine/index.ts · snapshots, easing · _v0.57.0

copyDoc, takeSnapshot, revertToSnapshot and deleteSnapshot; tween easing. Removed:

```ts
  tween(id: ID, count: number, opts: { position: boolean; opacity: boolean }): boolean {
      const u = k / (n + 1), state: Record<ID, FrameLayer> = {};
```

### src/engine/index.ts · snapshot budget, Trim, Reveal All · _v0.58.0

Snapshot sizes and their budget; trim and revealAll. Removed:

```ts
  /** The current document's snapshots, newest last. They live with the open document and are not saved. */
  get snapshots(): ReadonlyArray<{ id: ID; name: string }> { const p = this.current; return p ? this.historySnapshots.get(p) ?? [] : []; }
    const list = this.historySnapshots.get(p) ?? [];
```

### src/engine/index.ts · frame styles · _v0.59.0

Selecting a frame applies styles; tweens carry the first frame's. Removed:

```ts
      target.forEach((l, i) => { const now = q.doc.layers[i]; if (l !== now && now?.id === l.id) q.updateLayer(l.id, { visible: l.visible, opacity: l.opacity, transform: l.transform }); });
```

### src/engine/index.ts · fast previews · _v0.60.0

The screen renderer previews styles at reduced resolution on large layers. Nothing was removed.

### src/engine/index.ts · patterns · _v0.61.0

Pattern functions exported. Nothing was removed.

### src/engine/index.ts · renderText · _v0.63.0

renderText exported for the PSD writer. Removed:

```ts
export { TEXT_FONTS, defaultText, fontCss, liveText, textFromData, textKey, textMetrics } from './text';
```

### src/engine/index.ts · bucket and toning · _v0.64.0

Bucket and tone settings, paintBucket, toned retouch strokes, a region for region edits. Removed:

```ts
  private regionEdit(name: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void): void {
      const sel = p.selection;
  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur' | 'healBrush', pt: Pt, shift: boolean): boolean {
    }
    p.history.begin(kind === 'heal' ? 'Spot Healing' : kind === 'clone' ? 'Clone Stamp' : kind === 'healBrush' ? 'Healing Brush' : 'Blur', p.snapshot());
```

### src/engine/index.ts · Color Range, Quick Selection · _v0.65.0

colorRangeMask, selectColorRange, and the Quick Selection stroke. Nothing was removed.
### src/engine/index.ts · rollback, align, distribute, modify selection · _v0.66.0

`edit` catches a throwing operation at the outermost level (nested edits rethrow) and `rollBack` writes its patches back in reverse, restores the snapshot, keeps the failure in `failures` and raises a notice. `regionEdit` writes its region back when `apply` throws. `alignItems` measures each selected root by its layers' visible pixels; `shiftItems` moves them by whole pixels with masks following; `alignLayers` and `distributeLayers` are the menu commands. `modifySelection` does Feather (Gaussian, sigma half the radius), Border (grown less shrunk by half the width) and Smooth (majority over a square, through a summed-area table). Removed:

```ts
    try { ok = fn(p); } finally { p.history.end(p.snapshot()); }
      apply({ raster, target: pick.target, rect, cover });
  selectionAmounts = { expand: 1, contract: 1 };
```
### src/engine/index.ts · Sharpen stroke · _v0.68.0

`retouch.smearMode` and `beginRetouchStroke` take `sharpen`, whose texture is `sharpenSample` of the layer at a radius from the brush size, recorded as Sharpen. Removed:

```ts
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'smudge' | 'liquify' } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur' };
  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur' | 'healBrush' | 'dodge' | 'burn' | 'sponge', pt: Pt, shift: boolean): boolean {
    p.history.begin({ heal: 'Spot Healing', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge' }[kind], p.snapshot());
```

### src/app.ts · filter menu · _v0.68.0 (logged here beside the engine entry)

Lens Blur and Smart Sharpen on the Filter menu. Removed:

```ts
  const FILTERS: FilterKind[] = ['develop', 'gaussianBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'unsharpMask'];
```

## src/engine/develop.ts

### src/engine/develop.ts · new · _v0.36.0

formnodal's develop core from the owner's formvis extension for NodeMode: the per-pixel pass as written, en and em dashes in comments normalised; `detailPass`, `clarityPass` and `developImage` keep formnodal's detail formulas with formvis's Gaussian in place of a canvas blur filter. Nothing was removed.

### src/engine/develop.ts · header · _v0.38.0

The owner confirmed formnodal is their own build. Removed:

```ts
 *  Gaussian, so the whole filter runs in the preview worker. formnodal's LICENSES.md names the MIT-licensed reference
 *  its adjustment algorithms derive from; that project's notice belongs in formvis's NOTICE. */
```

## src/engine/kernels.ts

### src/engine/kernels.ts · adjustment and wand kernels · _v0.1.0

Created in _v0.1.0.

### src/engine/kernels.ts · Kernel · _v0.2.0

Kernels take an optional context with the region's document origin and scale, which Grain needs. Removed:

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

### src/engine/kernels.ts · wandMask sample radius · _v0.13.0

The color to match averages the pixels within `sampleRadius` of the click, clipped to the image, as the Sample Size does. Removed:

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

### src/engine/kernels.ts · rewritten independently · _v0.34.0

Every kernel replaced with a new implementation of the standard method: Levels as composed clipped power curves, Curves as Fritsch and Butland monotone cubics in Horner form, Exposure through the IEC 61966-2-1 sRGB transfer, a Rec. 709 gradient map, and the Magic Wand's contiguous fill as Heckbert's segment seed fill. Exports and settings meanings unchanged; outputs identical to the replaced code in randomized side-by-side runs. The removed code is not quoted here, deliberately: it is the translated code this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.33.0.
### src/engine/kernels.ts · parametric kernels · _v0.66.0

`adjustmentKernel` returns `paramKernel` for the parametric kinds. Nothing was removed.

## src/engine/matte.ts

### src/engine/matte.ts · refineMatte, guidedFilter, boxMean, levelsOf · _v0.9.0

Ported from the `SubjectRemoval.refined` and `GuidedMatte`. `boxMean` is the running-sum box mean with edge clamping; `guidedFilter` is He, Sun and Tang's filter with epsilon 1e-4; `refineMatte` applies the order (Refine, then Shift Edge as a clamped Gaussian of half the reach cut hard at 0.25 or 0.75, then Contrast as a stretch about middle gray) with radii in layer pixels scaled for previews, and returns the mask unchanged for Basic; `levelsOf` reads a mask's gray or a guide's luminance over black. Checked against an independent NumPy port to 6.3e-5.

### src/engine/matte.ts · rewritten independently · _v0.35.0

The guided filter, prefix-sum box means and a clamped Gaussian, matching the replaced output within 0.00016. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

## src/engine/project.ts

### src/engine/project.ts · per-tab project record · _v0.1.0

Created in _v0.1.0.

## src/engine/retouch.ts

### src/engine/retouch.ts · spotHeal, contentFill, WarpStroke · _v0.3.0

Ported line for line from the original C and Swift sources. `spotHeal` from `HealPixels.c`: ring matching over 5 distances and 24 angles (2 distances with a stronger nearness bias for Proximity Match), a plus or minus 3 px alignment refine, a multigrid smooth solve over the spot, and Create Texture's grain matched to the ring's detail. `contentFill` from `ContentFill.c`: a patch search growing inward from the selection edge. `WarpStroke` from `SmudgeLiquify.swift`: Liquify's forward warp and Smudge's carried color, dab by dab on a document-size premultiplied copy. C's `lround` rounds halves away from zero, so the port does too rather than using `Math.round`.

### src/engine/retouch.ts · rewritten independently · _v0.35.0

Spot Healing by ring-matched source search and a Poisson-style harmonic correction solved coarse to fine; Create Texture from the edge's harmonic interpolation plus matched grain; Content-Aware Fill as Criminisi-style exemplar inpainting; Smudge and Liquify on a raised-cosine brush with evenly carried spacing, Smudge laying paint by strength and picking up canvas by its complement. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

### src/engine/retouch.ts · fillTransparent · _v0.38.0

The harmonic membrane pre-fills see-through pixels for generative requests. Nothing was removed.

### src/engine/retouch.ts · healWindow, healFromSource · _v0.42.0

Spot Healing's window setup shared as `healWindow`; `healFromSource` heals from a chosen offset through the harmonic membrane, reading the source from the original pixels. Removed:

```ts
/** Spot Healing: heals the pixels under `coverage` (0 to 255 per pixel) in premultiplied `rgba`, blended by coverage
 *  times `opacity`. Returns false when there is no spot or nothing around it to heal from. */
export function spotHeal(rgba: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, opacity: number, mode: HealMode, seed: number): boolean {
  if (x1 < 0) return false;
  if (!win.ring.length) return false;
```

## src/engine/selection.ts

### src/engine/selection.ts · selection masks, outline tracer · _v0.1.0

Created in _v0.1.0.

### src/engine/selection.ts · rewritten independently · _v0.35.0

`traceOutline` merges boundary edges into runs in one row-major sweep over differing row spans and links them into loops, right turns first; exact against the mask in every test, 12 ms for a 2000 by 1500 mask. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

## src/engine/stroke.ts

### src/engine/stroke.ts · brush stroke engine · _v0.1.0

Created in _v0.1.0.

### src/engine/stroke.ts · texture and coverageAlpha · _v0.3.0

A stroke can paint a document-space texture at an offset instead of a color, which is how Clone Stamp and the Blur mode of Smear work: a canvas point takes the sample at itself plus the offset. `coverageAlpha` returns the accumulated coverage clipped by the selection, which Spot Healing heals. Nothing was removed.

### src/engine/stroke.ts · PixelStroke · lerp mode · _v0.16.0

A `lerp` flag for alpha-coded masks: compose erases by the coverage, then adds the coverage-masked sample with `lighter`, so out = old x (1 - c) + sample x c. Removed:

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

### src/engine/stroke.ts · rewritten independently · _v0.35.0

The brush tip computed per pixel (exact raised cosine; soft fringes about 15% lighter than the old eight-segment approximation), spacing, paint layer and composing rewritten. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

### src/engine/stroke.ts · surface pool · _v0.55.0

Stroke surfaces taken from and given back to a small pool, warmed on request. Removed:

```ts
    this.working = createSurface(raster.width, raster.height);
    this.paint = createSurface(raster.width, raster.height);
    this.masked = selection ? createSurface(raster.width, raster.height) : null;
      this.textured ??= createSurface(this.raster.width, this.raster.height);
```

## src/engine/surface.ts

### src/engine/surface.ts · canvases and rasters · _v0.1.0

Created in _v0.1.0.

### src/engine/surface.ts · rasterOf · _v0.20.0

A canvas-to-raster registry, filled by the `Raster` constructor, so the renderer, given only a canvas, can read its raster's version for the halving cache. Removed:

```ts
  constructor(readonly width: number, readonly height: number) {
    this.canvas = createSurface(width, height);
    this.ctx = ctxOf(this.canvas);
  }
```

## src/engine/transform.ts

### src/engine/transform.ts · handles and drag math · _v0.1.0

Created in _v0.1.0.

### src/engine/transform.ts · placing, following · _v0.17.0

the `LayerTransform.placing` (a unit-square map back to a rotated, maybe flipped rectangle, keeping the flip, sampling and nearest rotation) and `following(from:to:)` (a placement carried along as a box moves), as pure functions; placing round-trips rotated and flipped transforms to 2.8e-14. Removed:

_Quoted code redacted in 0.35.0: it came from an implementation since replaced with independent code. Git history keeps it._

### src/engine/transform.ts · rewritten independently · _v0.35.0

Free Transform drags and the affine decomposition in unit-vector form; identical to 1e-13. The removed code is not quoted here, deliberately: it is the implementation this rewrite retires, and quoting it would put it back in the repository. It remains in git history at tag v0.34.0.

## src/engine/tree.ts

### src/engine/tree.ts · layer hierarchy walks · _v0.1.0

Created in _v0.1.0.

## src/engine/types.ts

### src/engine/types.ts · document types, blend modes, limits · _v0.1.0

Created in _v0.1.0.

### src/engine/types.ts · BLEND_MODES, REF_BLEND_MODES, compositeOp · _v0.33.0

Soft Light, Hard Light, Exclusion and Linear Dodge (Add, the canvas's `lighter`) join the modes, listed in Photoshop's menu order; `REF_BLEND_MODES` names the 13 a `.ref` project can hold. Removed:

```ts
export const BLEND_MODES: ReadonlyArray<{ id: BlendMode; label: string }> = [
  { id: 'normal', label: 'Normal' }, { id: 'multiply', label: 'Multiply' }, { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' }, { id: 'darken', label: 'Darken' }, { id: 'lighten', label: 'Lighten' },
  { id: 'difference', label: 'Difference' }, { id: 'color-dodge', label: 'Color Dodge' }, { id: 'color-burn', label: 'Color Burn' },
  { id: 'hue', label: 'Hue' }, { id: 'saturation', label: 'Saturation' }, { id: 'color', label: 'Color' }, { id: 'luminosity', label: 'Luminosity' },
];

export function compositeOp(mode: BlendMode): GlobalCompositeOperation { return mode === 'normal' ? 'source-over' : mode; }
```

### src/engine/types.ts · LayerEffects · _v0.39.0

`Layer.effects`, the three effect types, `defaultEffects`, `effectsActive` and `effectsFromData`, which checks and clamps saved data. Nothing was removed.

### src/engine/types.ts · inner effects, TextSpec, the Type tool id · _v0.40.0

Inner Shadow, Inner Glow and Color Overlay join `LayerEffects` with defaults and checked loading; `Layer.text` and `TextSpec`; `type` joins the tool ids. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'eyedropper' | 'hand' | 'zoom' | 'idle';
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke');
```

### src/engine/types.ts · tool ids · _v0.42.0

`healingBrush` and `patch` join the tool ids. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'idle';
```

### src/engine/types.ts · tool ids · _v0.43.0

`pen` and `directSelect` join the tool ids. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'idle';
```

### src/engine/types.ts · SmartObject, SmartFilter · _v0.45.0

Smart object types and a checked reader for saved filters. Nothing was removed.

### src/engine/types.ts · VectorLayer · _v0.47.0

The shape-layer type. Nothing was removed.

### src/engine/types.ts · ShapeStyle · _v0.48.0

Optional fill and a stroke on shape layers. Removed:

```ts
/** A shape layer: a path filled with a colour. `origin` is where its raster was rendered, so a later move of the layer
 *  can carry the path along. */
export interface VectorLayer { path: import('./paths').VectorPath; fill: RGB; origin: Pt }
```

### src/engine/types.ts · warp · _v0.52.0

A smart object keeps its warp and the transform it was rendered at. Removed:

```ts
export interface SmartObject { source: Raster; filters: SmartFilter[] }
```

### src/engine/types.ts · Gradient Overlay · _v0.58.0

The effect type, its defaults and checked reading. Removed:

```ts
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay');
```

### src/engine/types.ts · Bevel and Emboss · _v0.59.0

The effect type, its defaults and checked reading. Removed:

```ts
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay'), go = part('gradientOverlay');
```

### src/engine/types.ts · Satin · _v0.60.0

The effect type, its defaults and checked reading. Removed:

```ts
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled || fx.bevel.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay'), go = part('gradientOverlay'), bv = part('bevel');
```

### src/engine/types.ts · Pattern Overlay · _v0.61.0

The effect type, its defaults and checked reading. Removed:

```ts
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect; satin: SatinEffect }
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled || fx.bevel.enabled || fx.satin.enabled);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay'), go = part('gradientOverlay'), bv = part('bevel'), sa = part('satin');
```

### src/engine/types.ts · tool ids · _v0.64.0

Four tool ids. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'idle';
```

### src/engine/types.ts · tool id · _v0.65.0

The quickSelect tool id. Removed:

```ts
export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'idle';
```
### src/engine/types.ts · 27 blend modes, parametric kinds · _v0.66.0

`BlendMode` and `BLEND_MODES` hold all 27 of Photoshop's modes in its order; `canvasBlend` tells the renderer which the canvas does itself, and `compositeOp` gives `source-over` for the rest so effect blends from PSD never set an invalid operation. `AdjustmentKind` takes in `ParamKind`. Removed:

```ts
  | 'linear-dodge' | 'soft-light' | 'hard-light' | 'exclusion';
/** Photoshop's menu order, grouped darken, lighten, contrast, inversion, component; the modes the browser canvas
 *  composites natively. Linear Dodge (Add) is the canvas's `lighter`. */
  { id: 'normal', label: 'Normal' },
  { id: 'darken', label: 'Darken' }, { id: 'multiply', label: 'Multiply' }, { id: 'color-burn', label: 'Color Burn' },
  { id: 'lighten', label: 'Lighten' }, { id: 'screen', label: 'Screen' }, { id: 'color-dodge', label: 'Color Dodge' }, { id: 'linear-dodge', label: 'Linear Dodge (Add)' },
  { id: 'overlay', label: 'Overlay' }, { id: 'soft-light', label: 'Soft Light' }, { id: 'hard-light', label: 'Hard Light' },
  { id: 'difference', label: 'Difference' }, { id: 'exclusion', label: 'Exclusion' },
export function compositeOp(mode: BlendMode): GlobalCompositeOperation { return mode === 'normal' ? 'source-over' : mode === 'linear-dodge' ? 'lighter' : mode; }
export type AdjustmentKind = 'hsv' | 'levels' | 'curves' | 'exposure' | 'gradientMap' | 'grain';
```

## src/engine/viewport.ts

### src/engine/viewport.ts · zoom and pan · _v0.1.0

Created in _v0.1.0.

## src/extensions/registry.ts

### src/extensions/registry.ts · tool contract and registry · _v0.1.0

Created in _v0.1.0.

### src/extensions/registry.ts · OptionSpec number · _v0.4.0

Adds the `number` option kind: an editable field with optional min, max, step and unit, whose `get` returns null when there is nothing to edit. Nothing was removed.

### src/extensions/registry.ts · select option · _v0.41.0

A `select` option kind. Nothing was removed.

### src/extensions/registry.ts · toolsForKey · _v0.42.0

Every tool on a key, for Shift cycling. Nothing was removed.

## src/extensions/tools/brush-common.ts

### src/extensions/tools/brush-common.ts · drawBrushCursor, brushKeys, brushOptions · _v0.3.0

The brush cursor, the size, hardness and opacity keys, and the brush options shared by Brush, Spot Healing, Clone Stamp and Smear, which share one set of brush settings.

### src/extensions/tools/brush-common.ts · drawBrushCursor · pinned circle · _v0.22.0

During a right-drag the circle draws at the press point (`engine.tipDrag.at`). Removed:

```ts
export function drawBrushCursor(ctx: ToolContext, g: CanvasRenderingContext2D, pt: Pt | null): void {
  if (!pt) return;
```

## src/extensions/tools/brush.ts

### src/extensions/tools/brush.ts · brush and eraser · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/brush.ts · brushTool · overlay pinned during a tip drag · _v0.22.0

Brush's own circle also draws at the press point during a right-drag. Removed:

```ts
    if (!hoverPt) return;
```

```ts
    const c = v.toScreen(hoverPt);
```

## src/extensions/tools/clone.ts

### src/extensions/tools/clone.ts · cloneTool · _v0.3.0

Alt-click sets the source; the crosshair follows the sample point exactly as a click would stamp; Aligned and Sample all layers in the options bar.

### src/extensions/tools/clone.ts · cloneTool · preview in the circle · _v0.27.0

Between strokes, with Option not held (`picking`), the overlay draws `clonePreview` under the brush circle at the brush opacity. Removed:

```ts
let hover: Pt | null = null;
```

```ts
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
```

```ts
  overlay(ctx, g) {
    drawBrushCursor(ctx, g, hover);
```
### src/extensions/tools/clone.ts and src/engine/index.ts · Clone Source transforms · _v0.72.0

Options for Source scale, Source angle, Flip horizontal and Flip vertical. In the engine, `retouch` holds them; `cloneTransform(pivot)` builds the matrix about the sample point; `beginRetouchStroke` draws the Clone Stamp's source through it; `clonePreview` shows it and keys its cache on it. The Healing Brush is left untransformed. Removed from `engine/index.ts` (nothing from `clone.ts`):

```ts
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, sameTransform, scaling, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify' } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur' };
    const key = [sp.x.toFixed(2), sp.y.toFixed(2), d, this.brush.hardness, side, this.retouch.cloneSampleAll, l.id, p.history.revision].join('|');
    const s = createSurface(side, side), c = ctxOf(s), per = side / d;
    const view = mul(scaling(per, per), translation(d / 2 - sp.x, d / 2 - sp.y));
```

## src/extensions/tools/crop.ts

### src/extensions/tools/crop.ts · cropTool · _v0.2.0

Crop frame with create, move and resize modes, Alt to keep the center, nine ratio presets and snapping to the canvas edges. Enter crops through `Engine.cropTo`, which is Canvas Size with an explicit offset, as the `CanvasSizeOptions.contentOffset`. Snapping to layer edges is not ported yet.

## src/extensions/tools/eyedropper.ts

### src/extensions/tools/eyedropper.ts · color sampling · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/eyedropper.ts · eyedropperTool · sample ring · _v0.11.0

Remembers the color a drag starts from, shows the sample ring while it samples, clears it on release or cancel, and adds the Sample Ring option. Removed:

```ts
import { hexOf } from '../../engine';
```

```ts
  down(ctx, p) { if (p.button === 0) sample(ctx, p); },
```

### src/extensions/tools/crop.ts · snapTargets, nearest, snap · _v0.30.0

the CropSnap and cropSnapTargets: canvas edges and visible pixel layers' rounded bounds, applied per drag mode (create and resize on the pointer's side, moves keep their size, fixed ratios only snap moves). Removed:

```ts
function snap(ctx: ToolContext, r: Rect): Rect {
  const d = ctx.engine.current?.doc;
  if (!d) return r;
  const tol = 8 / ctx.view().zoom, n = norm(r);
  let x = n.x, y = n.y, w = n.w, h = n.h;
  if (Math.abs(x) < tol) { w += x; x = 0; }
  if (Math.abs(y) < tol) { h += y; y = 0; }
  if (Math.abs(x + w - d.width) < tol) w = d.width - x;
  if (Math.abs(y + h - d.height) < tol) h = d.height - y;
  return { x, y, w, h };
}
```

```ts
    if (!ratio && drag.mode !== 'move') frame = snap(ctx, frame);
```

## src/extensions/tools/gradient.ts

### src/extensions/tools/gradient.ts · gradientTool · _v0.2.0

Pending gradient with draggable ends and Shift for 45 degree steps; shape, colors, reverse and opacity re-render it live. Enter applies, Escape cancels, and a click without a line leaves nothing pending.

## src/extensions/tools/hand.ts

### src/extensions/tools/hand.ts · panning · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/heal.ts

### src/extensions/tools/heal.ts · healTool · _v0.3.0

Paint over a spot; it heals on release in the chosen type: Content-Aware, Create Texture or Proximity Match.

## src/extensions/tools/index.ts

### src/extensions/tools/index.ts · built-in tool list · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/index.ts · registerBuiltinTools · _v0.2.0

Registers Crop, Gradient and Shape in the rail order. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, brushTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · registerBuiltinTools · _v0.3.0

Registers Spot Healing, Clone Stamp and Smear, completing the fourteen tools. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, gradientTool, shapeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · Type tool · _v0.40.0

Registers the Type tool. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, cloneTool, smearTool, gradientTool, shapeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · register · _v0.42.0

Registers the Healing Brush and Patch. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, cloneTool, smearTool, gradientTool, shapeTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · register · _v0.43.0

Registers the Pen and Direct Selection. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, healingBrushTool, patchTool, cloneTool, smearTool, gradientTool, shapeTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · tools registered · _v0.64.0

The four tools registered. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, healingBrushTool, patchTool, cloneTool, smearTool, gradientTool, shapeTool, directSelectTool, penTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · tool registered · _v0.65.0

Quick Selection registered before Magic Wand. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, directSelectTool, penTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

## src/extensions/tools/lasso.ts

### src/extensions/tools/lasso.ts · freehand and polygonal lasso · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/lasso.ts · lassoTool · Anti-alias, nudging · _v0.13.0

Honors `selectionAntialiased` and gains the Anti-alias option; arrow keys nudge the outline when no polygon is open. Removed:

```ts
import { modeFor, modeSegment } from './select-common';
```

```ts
    if (!active || ctx.engine.lassoKind !== 'polygonal') return false;
```

```ts
  });
  e.applySelection(mask, mode, e.lassoKind === 'polygonal' ? 'Polygonal Lasso' : 'Lasso');
```

## src/extensions/tools/marquee.ts

### src/extensions/tools/marquee.ts · rectangle and ellipse marquee · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/marquee.ts · marqueeTool · autoscroll, re-arm, Anti-alias, nudging · _v0.13.0

Drags go through `follow`, which pointer moves and the autoscroll ticks (`scrollDelta`, `autoscroll`, `stopScroll`) share; the box keeps the marqueeConstrainArmed rule; masks honor `selectionAntialiased`, with the Anti-alias option; arrow keys nudge the outline. Removed:

```ts
import { modeFor, modeSegment } from './select-common';
```

```ts
  move(ctx, p) {
    if (moving) { ctx.engine.updateSelectionShift(p.doc.x - moving.x, p.doc.y - moving.y); return; }
    if (!draft) return;
    draft.point = p.doc;
    draft.square = p.shift && !draft.shiftAtPress;
    draft.center = p.alt && !draft.altAtPress;
    ctx.engine.emit('overlay', null);
  },
```

```ts
    });
    e.applySelection(mask, d.mode, ellipse ? 'Elliptical Marquee' : 'Rectangular Marquee');
```

## src/extensions/tools/move.ts

### src/extensions/tools/move.ts · move and transform handles · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/move.ts · moveTool · inspector, guides, pixel moves · _v0.4.0

The readouts become editable X, Y, W, H, Scale and Angle fields plus Sampling and a Snap toggle; the overlay draws dashed snap guides; a drag inside the selection moves its pixels (Alt duplicates, Shift keeps one axis) and Escape cancels it in `keydown`, since `stage.cancelTool` is not wired to any key. Removed, the readouts:

```ts
      { kind: 'readout', label: 'X', get: () => (t() ? fmt(t()!.x) : '') },
      { kind: 'readout', label: 'Y', get: () => (t() ? fmt(t()!.y) : '') },
      { kind: 'readout', label: 'W', get: () => (t() ? fmt(t()!.w) : '') },
      { kind: 'readout', label: 'H', get: () => (t() ? fmt(t()!.h) : '') },
      { kind: 'readout', label: 'Angle', get: () => (t() ? `${fmt(t()!.rotation)}°` : '') },
```

Removed, the pointer handlers:

```ts
  down(ctx, p) {
    if (p.button !== 0) return;
    const e = ctx.engine;
    if (p.mod || e.autoSelect) { const id = e.layerAt(p.doc); if (id) e.selectLayer(id); }
    const m = hit(ctx, p);
    if (m) e.beginTransform(m, p.doc);
  },
  move(ctx, p) { ctx.engine.updateTransform(p.doc, p.shift, p.alt); },
  up(ctx) { ctx.engine.endTransform(); },
  cancel(ctx) { ctx.engine.cancelTransform(); },
```

Removed, the hint:

```ts
  hint: () => 'Drag to move · Handles resize · Outside a corner rotates · Shift constrains · Alt resizes from the center · Cmd or Ctrl picks the layer under the pointer · Arrows nudge · 1-0 set layer opacity',
```

### src/extensions/tools/move.ts · moveTool · floating selection · _v0.5.0

Enter applies a floating selection and Escape cancels it (a first Escape still cancels a handle drag in progress); the hint describes the float while it is open. Removed, the hint:

```ts
  hint: () => 'Drag to move · Drag inside a selection to move its pixels, Alt to duplicate them · Handles resize · Outside a corner rotates · Shift constrains · Alt resizes from the center · Cmd or Ctrl picks the layer under the pointer · Arrows nudge · 1-0 set layer opacity',
```

### src/extensions/tools/move.ts · editable · unlinked mask box · _v0.15.0

The handles sit on the mask's box when the Move tool transforms an unlinked mask. Removed:

```ts
  return ctx.engine.transformEdit?.draft ?? l.transform;
```

### src/extensions/tools/move.ts · editable · group box · _v0.17.0

The handles sit on the group box when several layers or a folder are selected, before the single-layer and mask cases. Removed:

```ts
  const l = ctx.engine.activeLayer;
  if (!l || l.isGroup || !l.raster) return null;
  return ctx.engine.transformEdit?.draft ?? (ctx.engine.transformsMask(l) ? l.mask?.placement ?? l.transform : l.transform);
```

### src/extensions/tools/move.ts · distortCorner, corner drags, Enter and Escape · _v0.21.0

Cmd on a corner handle begins a distortion; any corner of a pending one drags alone; Enter applies, Escape cancels; the overlay draws the distorted outline and its four handles. Removed:

```ts
    if (p.button !== 0) return;
    const e = ctx.engine;
    const sel = e.current?.selection;
```

```ts
  move(ctx, p) {
    if (pixelStart) {
```

## src/extensions/tools/select-common.ts

### src/extensions/tools/select-common.ts · modifier to selection mode · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/select-common.ts · nudgeSelectionKey · _v0.13.0

Arrow keys nudge the selection outline in the selection tools, 1 px or 10 with Shift, leaving Cmd, Ctrl and Alt arrows to other commands. Removed:

```ts
import type { OptionSpec, ToolPointer } from '../registry';
```

## src/extensions/tools/shape.ts

### src/extensions/tools/shape.ts · shapeTool · _v0.2.0

Rectangle and ellipse shape layers in the foreground color with a corner radius, Shift after starting for square, Alt for centered, Shift+U to switch shape. The layer keeps the `LayerShapeStyle` fields (`kind`, `red`, `green`, `blue`, `cornerRadius`).
### src/extensions/tools/shape.ts · seven shapes · _v0.69.0

Rectangle, Ellipse, Polygon, Star, Line, Arrow and Heart, Shift+U cycling all seven; path shapes go to `Engine.createPathShape`, lines along the drag with Shift snapping to 45 degrees (`snapped`); the overlay draws the real outline; options show only the rows the chosen shape uses. Removed:

```ts
  icon: (e) => (e.shapeSettings.kind === 'ellipse' ? 'circleTool' : 'rectTool'),
  hint: (e) => `Drag to draw ${e.shapeSettings.kind === 'ellipse' ? 'an ellipse' : 'a rectangle'} in the foreground color on a new shape layer · Shift after starting keeps it square · Alt after starting grows from the center · Shift+U switches shape`,
    if (r.w >= 1 && r.h >= 1) ctx.engine.createShape(r);
    ctx.engine.shapeSettings.kind = ctx.engine.shapeSettings.kind === 'ellipse' ? 'rectangle' : 'ellipse';
    const r = dragRect(draft.anchor, draft.point, draft.square, draft.center), v = ctx.view();
    const ellipse = ctx.engine.shapeSettings.kind === 'ellipse';
    const radius = Math.min(ctx.engine.shapeSettings.cornerRadius * v.zoom, (b.x - a.x) / 2, (b.y - a.y) / 2);
  options: (e) => [
    { kind: 'title', text: 'Shape' },
    { kind: 'segment', label: 'Shape', choices: [{ id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }], get: () => e.shapeSettings.kind, set: (v) => { e.shapeSettings.kind = v as 'rectangle' | 'ellipse'; e.emit('options', null); e.emit('tool', null); } },
    { kind: 'range', label: 'Corner radius', min: 0, max: 500, unit: 'px', get: () => e.shapeSettings.cornerRadius, set: (v) => { e.shapeSettings.cornerRadius = v; e.emit('options', null); } },
    { kind: 'readout', label: 'Color', get: () => hexOf(e.fg) },
  ],
```

## src/extensions/tools/smear.ts

### src/extensions/tools/smear.ts · smearTool · _v0.3.0

the Blur tool, labeled Smear: Liquify and Smudge run as warp strokes, Blur paints a softened sample; Strength is the brush opacity.
### src/extensions/tools/smear.ts · Sharpen mode · _v0.68.0

Sharpen joins Liquify, Blur and Smudge: its hint, the blur icon, dispatch to `beginRetouchStroke('sharpen')`, and the mode segment. Removed:

```ts
  icon: (e) => (e.retouch.smearMode === 'blur' ? 'blurTool' : 'smudge'),
    if (m === 'blur') ctx.engine.beginRetouchStroke('blur', p.doc, p.shift);
    { kind: 'segment', label: 'Mode', choices: [{ id: 'liquify', label: 'Liquify' }, { id: 'blur', label: 'Blur' }, { id: 'smudge', label: 'Smudge' }], get: () => e.retouch.smearMode, set: (v) => { e.retouch.smearMode = v as 'blur' | 'smudge' | 'liquify'; e.emit('options', null); e.emit('tool', null); } },
```

## src/extensions/tools/wand.ts

### src/extensions/tools/wand.ts · magic wand · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/wand.ts · wandTool · Sample Size, nudging · _v0.13.0

Adds the Sample Size choice (Point, 3 by 3, 5 by 5) and arrow-key nudging. Removed:

```ts
import { modeFor, modeSegment } from './select-common';
```

```ts
  hint: () => 'Click to select similar colors · Shift adds · Alt subtracts · Tolerance sets how similar',
```

## src/extensions/tools/zoom.ts

### src/extensions/tools/zoom.ts · zoom tool · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/zoom.ts · zoomTool · the scrub rate · _v0.20.0

Scrubbing doubles the zoom per 100 px dragged from a 3 px threshold. Removed:

```ts
    if (Math.abs(dx) > 3) drag.moved = true;
    if (drag.moved) ctx.engine.zoomTo(drag.z0 * Math.pow(2, dx / 160), drag.start);
```

## src/host.ts

### src/host.ts · HostLink · _v0.1.0

Follows the portal protocol from the NodeMode extension-portal docs: listener first, then `ready`, then `init`. Sends `plugin:[pluginId]:assign`; the host-side handler is not confirmed yet.

## src/io/api.ts

### src/io/api.ts · engine HTTP client · _v0.1.0

Created in _v0.1.0.

### src/io/api.ts · package · root folder · _v0.28.0

`package` takes an optional root folder name for the zip. Removed:

```ts
  async package(manifest: object, files: FilePart[]): Promise<Blob> {
    return (await request('/projects/package', { method: 'POST', body: form({ manifest: JSON.stringify(manifest) }, files) })).blob();
```

### src/io/api.ts · generative calls · _v0.37.0

`generativeStatus`, `saveGenerativeKey`, `forgetGenerativeKey` and `generativeFill`. Nothing was removed.

### src/io/api.ts · upscale · _v0.38.0

`upscale` added; the status carries the upscale model. Removed:

```ts
export interface GenerativeStatus { configured: boolean; source: 'environment' | 'settings' | null; fillModel: string; eraseModel: string }
```

## src/io/images.ts

### src/io/images.ts · image decoding with engine fallback · _v0.1.0

Created in _v0.1.0.

### src/io/images.ts · PSD as a project · _v0.42.0

`.psd` opens like a project. Removed:

```ts
export const PROJECT_ACCEPT = '.formvis,.ref,.zip';
export const isProjectFile = (f: File): boolean => /\.(formvis|ref|zip)$/i.test(f.name);
```

## src/io/project-io.ts

### src/io/project-io.ts · serialize and deserialize · _v0.1.0

Field names and labels come from the original `ProjectStore.swift`, `LayerTransform.swift`, `LayerAppearance.swift` and `LayerAdjustment.swift`, checked against the source. Masks are written as grayscale PNGs; `adjustment` and `shape` round-trip verbatim.

### src/io/project-io.ts · serializeRefProject · _v0.28.0

The document as a version 7 project, reshaped from `serialize` to pass the ProjectStore.validate (UUID ids, files named after them, plain folders, adjustment layers without pixels, non-empty names, clamped resolution), with notes for every change. Nothing was removed.

### src/io/project-io.ts · .ref blend rule · _v0.33.0

Blend modes outside `REF_BLEND_MODES` export to `.ref` as Normal, with a note. Nothing was removed.

### src/io/project-io.ts · effects · _v0.39.0

Effects save in `.formvis` and read back through `effectsFromData`; `.ref` export drops them with a note. Removed:

```ts
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform,
      blend: blendFromLabel(r.blendMode), mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
```

### src/io/project-io.ts · type in files · _v0.40.0

Live type saves in `.formvis` and reopens editable; `.ref` export notes it becomes pixels. Removed:

```ts
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData,
      blend: blendFromLabel(r.blendMode), effects: effectsFromData(r.effects), mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
```

### src/io/project-io.ts · smart objects · _v0.45.0

Saves and reads the source and stack; .ref drops them with a note. Removed:

```ts
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData,
  for (const r of records) { const a = str(r.imageFile), b = str(r.maskFile); if (a) names.add(a); if (b) names.add(b); }
      blend: blendFromLabel(r.blendMode), effects: effectsFromData(r.effects), text: textFromData(r.text, raster), mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
```

### src/io/project-io.ts · Work Path · _v0.46.0

The Work Path saved and read back; .ref leaves it out with a note. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid,
  type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom,
export async function serialize(doc: Doc, activeId: ID | null): Promise<{ manifest: Json; files: FilePart[] }> {
export async function serializeRefProject(doc: Doc, activeId: ID | null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>): Promise<{ doc: Doc; activeId: ID | null }> {
  return { doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers }, activeId: str(manifest.activeLayerID) };
```

### src/io/project-io.ts · paths and shape layers · _v0.47.0

Every path and shape layers saved and read back; .ref notes for both. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathData, pathFrom, type VectorPath,
export async function serialize(doc: Doc, activeId: ID | null, workPath: VectorPath | null = null): Promise<{ manifest: Json; files: FilePart[] }> {
  const pathRecord = pathData(workPath);
  if (pathRecord) manifest.workPath = pathRecord;
export async function serializeRefProject(doc: Doc, activeId: ID | null, workPath: VectorPath | null = null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
  if (pathData(workPath)) notes.push('The Work Path is left out; .ref projects have no paths.');
export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>): Promise<{ doc: Doc; activeId: ID | null; workPath: VectorPath | null }> {
      blend: blendFromLabel(r.blendMode), effects: effectsFromData(r.effects), text: textFromData(r.text, raster), smart, mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
  return { workPath: pathFrom(manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers }, activeId: str(manifest.activeLayerID) };
```

### src/io/project-io.ts · shape style · _v0.48.0

Fill and stroke saved and read back checked. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet,
    if (l.vector) r.vector = { fill: l.vector.fill, origin: l.vector.origin, subpaths: pathData(l.vector.path)?.subpaths ?? [] };
    const vp = r.vector && typeof r.vector === 'object' ? pathFrom(r.vector) : null, vf = obj(obj(r.vector).fill), vo = obj(obj(r.vector).origin);
    const vector = raster && vp && [vf.r, vf.g, vf.b, vo.x, vo.y].every((v) => typeof v === 'number' && Number.isFinite(v))
      ? { path: vp, fill: { r: num(vf.r, 0), g: num(vf.g, 0), b: num(vf.b, 0) }, origin: { x: num(vo.x, 0), y: num(vo.y, 0) } } : null;
```

### src/io/project-io.ts · timeline · _v0.49.0

Timelines saved and read back; .ref notes them. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB,
export async function serialize(doc: Doc, activeId: ID | null, paths: PathSet | null = null): Promise<{ manifest: Json; files: FilePart[] }> {
export async function serializeRefProject(doc: Doc, activeId: ID | null, paths: PathSet | null = null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>): Promise<{ doc: Doc; activeId: ID | null; paths: PathSet | null }> {
  return { paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers }, activeId: str(manifest.activeLayerID) };
```

### src/io/project-io.ts · warp · _v0.52.0

The warp saved and read back checked. Removed:

```ts
      r.smart = { filters: l.smart.filters.map(({ id, kind, settings, enabled }) => ({ id, kind, settings, enabled })) };
    const smart = raster && sourceImage ? { source: Raster.from(sourceImage, sourceImage.width, sourceImage.height), filters: smartFiltersFrom(r.smart) } : null;
```

### src/io/project-io.ts · carried patterns · _v0.61.0

Projects save the patterns their styles use and register them on open. Removed:

```ts
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB, timelineData, timelineFrom, type Timeline,
```
### src/io/project-io.ts · parametric kinds · _v0.66.0

`KINDS` reads and writes the new adjustments by label; `serializeRefProject` leaves out layers whose kind is not in `REF_KINDS`, with a note. Removed:

```ts
const KINDS: Record<string, AdjustmentKind> = { 'Hue/Saturation': 'hsv', Levels: 'levels', Curves: 'curves', Exposure: 'exposure', 'Gradient Map': 'gradientMap', Grain: 'grain' };
  });
```

## src/main.ts

### src/main.ts · entry, calls startApp · _v0.1.0

Created in _v0.1.0.

## src/styles/dialogs.css

### src/styles/dialogs.css · dialogs and lists · _v0.1.0

Created in _v0.1.0.

### src/styles/dialogs.css · panel styles · _v0.2.0

Panel section, slider, histogram, curves and anchor-grid styles, with fixed canvas sizes so opening a panel never shifts layout. `.cv-dialog [hidden]` makes the hidden attribute win inside dialogs: a screenshot showed both Hue sliders at once because `.cv-field` sets `display: grid`.

### src/styles/dialogs.css · click-through scrim · _v0.7.0

`.cv-scrim-through` makes a dialog's scrim transparent and lets clicks reach the canvas while the dialog stays interactive, for eyedroppers. The rule is written as `#overlay-root > .cv-scrim.cv-scrim-through` because `#overlay-root > *` in `shell.css` sets `pointer-events: auto` and an ID selector outranks classes; without it a sampling click lands on the scrim, which closes the dialog. Nothing was removed.
### src/styles/dialogs.css · .cv-field.is-off · _v0.68.0

A field that is unavailable keeps its place and dims, so dialogs do not change height when a choice turns a control off (Smart Sharpen's Angle). Nothing was removed.

## src/styles/fonts.css

### src/styles/fonts.css · vendored Inter and JetBrains Mono · _v0.1.0

Created in _v0.1.0.

## src/styles/light-mode.css

### src/styles/light-mode.css · light theme adjustments · _v0.1.0

Created in _v0.1.0.

## src/styles/panels.css

### src/styles/panels.css · .cv-layer-mask · _v0.1.0

Removed: showing the mask thumbnail on demand pushed the layer name right, a measured layout shift. The slot is now always reserved and toggled with visibility; row cells sit in explicit grid columns.

```css
.cv-layer-mask { display: none; }
.cv-layer.has-mask .cv-layer-mask { display: block; }
```

### src/styles/panels.css · fx mark · _v0.40.0

The fx mark in muted italic. Nothing was removed.

### src/styles/panels.css · smart badge and dialog rows · _v0.45.0

Styles for the badge and the filter list. Nothing was removed.

### src/styles/panels.css · Paths panel · _v0.47.0

The Paths panel, its rows and the shape badge; the layers grid gains a row. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; min-height: 0; background: var(--bg-secondary); }
.cv-layer-smart { flex: none; color: var(--text-muted); line-height: 0; }
```

### src/styles/panels.css · shape dialog · _v0.48.0

Swatch and row styles for the dialog. Nothing was removed.

### src/styles/panels.css · Timeline · _v0.49.0

The Timeline section, frames and preview; the layers grid gains a row. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; min-height: 0; background: var(--bg-secondary); }
```

### src/styles/panels.css · drag marks · _v0.50.0

Drag and drop marks for frames. Nothing was removed.

### src/styles/panels.css · step list · _v0.53.0

Step rows, tools and the stop message. Nothing was removed.

### src/styles/panels.css · History panel · _v0.56.0

The History section and rows; the layers grid gains a row. Removed:

```css
.cv-layers { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto auto; min-height: 0; background: var(--bg-secondary); }
```

### src/styles/panels.css · snapshot rows · _v0.57.0

Snapshot rows and their separation from the steps. Nothing was removed.
### src/styles/panels.css · History count width · _v0.68.0

Tabular figures and a fixed 10ch width for the History step count, ending the layout shift it caused on every step. Removed:

```css
.cv-history-count { color: var(--text-muted); font-size: var(--fs-11); }
```

## src/styles/scrollbars.css

### src/styles/scrollbars.css · scrollbars, loaded last · _v0.1.0

Created in _v0.1.0.

### src/styles/panels.css · color picker layout · _v0.10.0

`.cv-pick`, `.cv-pick-field`, `.cv-pick-strip`, `.cv-pick-side` and `.cv-pick-swatch` lay out the picker from existing spacing and radius tokens; `touch-action: none` keeps field and strip drags working with touch and pens. Nothing was removed.

### src/styles/panels.css · clipping cursor · _v0.14.0

`.cv-layer-rows.is-clip-zone` shows the `alias` cursor over a row's clipping zone while Option is held, the nearest standard cursor to the clipping cursor. Nothing was removed.

## src/styles/shell.css

### src/styles/shell.css · .cv-opt-group · _v0.1.0

Removed: option items could shrink below their content when the bar overflowed. Items are now `flex: none` and the bar scrolls.

```css
.cv-opt-group { display: flex; align-items: center; gap: var(--space-4); }
```

### src/styles/shell.css · .cv-tab · _v0.1.0

Removed: content-sized tabs moved their neighbors when a save renamed a project. Tabs are now a fixed 168 px. `.cv-scene` hands pointer input to the overlay canvas; `.cv-st-engine` reserves the engine readout width.

```css
.cv-tab { display: grid; grid-template-columns: 6px minmax(0, 1fr) 20px; align-items: center; column-gap: var(--space-2); flex: none; height: var(--ctl-md); max-width: 220px; padding: 0 var(--space-1) 0 var(--space-2); border: 1px solid transparent; border-radius: var(--radius); background: transparent; color: var(--text-secondary); font-size: var(--fs-12); cursor: default; }
```

### src/styles/shell.css · tab drop target · _v0.18.0

`.cv-tab.is-drop-target` tints a project tab with the accent while a layer drag would copy into it. Nothing was removed.

### src/styles/shell.css · .cv-mark · _v0.32.0

The app mark keeps its size in the title row. Nothing was removed.

### src/styles/shell.css · select and text box · _v0.41.0

Styles for the options-bar select and the canvas text box. Nothing was removed.

## src/styles/tokens.css

### src/styles/tokens.css · NodeMode tokens plus the formvis block · _v0.1.0

Created in _v0.1.0.

## src/ui/app-dialogs.ts

### src/ui/app-dialogs.ts · AboutDialog · _v0.1.0

Removed: a copyright line that did not match `LICENSE`.

```ts
 this.body.appendChild(el('<p class="cv-note">[licence line, redacted in 0.31.1]</p>'));
```

### src/ui/app-dialogs.ts · AboutDialog · app mark · _v0.32.0

The About title shows the app mark at 28 px. Removed:

```ts
    this.body.appendChild(el(`<div class="cv-welcome-title">${icon('paintbrush', 20)}formvis ${VERSION}</div>`));
```

### src/ui/app-dialogs.ts · the reference app notice in About · _v0.37.0

About formvis says formvis began as a port of the reference app and shows the MIT notice from `ui/notices.ts` in a fixed-height box. Nothing was removed.

## src/ui/brand.ts

### src/ui/brand.ts · brandMark · _v0.32.0

The app mark (the desktop icon and favicon artwork) as inline SVG: the source's style rules folded into attributes so nothing leaks into the page, and ids namespaced per copy. Nothing was removed.

## src/ui/commands.ts

### src/ui/commands.ts · command registry and key labels · _v0.1.0

Created in _v0.1.0.

### src/ui/commands.ts · onRun · _v0.44.0

A hook after each command runs, for recording. Nothing was removed.

## src/ui/dialogs.ts

### src/ui/dialogs.ts · Dialog.open · _v0.1.0

Removed: preferred a disabled button, so focus stayed outside the dialog and Escape never closed it. Focus now falls back to the dialog container, and `open()` re-appends the scrim so a later dialog stacks above an earlier one.

```ts
    (focus ?? this.scrim.querySelector<HTMLElement>('input, select, .cv-btn-primary') ?? q<HTMLElement>(this.scrim, '.cv-dialog')).focus();
```

## src/ui/dom.ts

### src/ui/dom.ts · setHtml · _v0.1.0

Removed: wrote markup straight into a live node. It now builds in a fresh template and calls `replaceChildren`, so no live container is ever rewritten.

```ts
  n.innerHTML = html;
```

## src/ui/icons.ts

### src/ui/icons.ts · 80 NodeMode icons, verbatim · _v0.1.0

Created in _v0.1.0.

### src/ui/icons.ts · typeTool · _v0.40.0

An inline currentColor T. Nothing was removed.

### src/ui/icons.ts · healBrushTool, patchTool · _v0.42.0

Two inline currentColor icons. Nothing was removed.

### src/ui/icons.ts · penTool, directSelectTool · _v0.43.0

Two inline currentColor icons. Nothing was removed.

### src/ui/icons.ts · smartObject · _v0.45.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · hand · _v0.48.0

The Hand tool icon replaced with the owner-supplied Remix Icon cursor-hand. Removed:

```ts
  hand: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 13c-.7 0-1.4.4-1.7 1l-.7-6.4c-.1-.9-.9-1.6-1.8-1.6-.9 0-1.7.7-1.8 1.6V3.2c0-1-.8-1.8-1.8-1.8-1 0-1.8.8-1.8 1.8v5.4L8.1 8C7.2 7.7 6.2 8.2 5.9 9.1c-.3.9.2 1.9 1.1 2.2l4 1.3v7.3c0 1.1.9 2 2 2h5c1.1 0 2-.9 2-2v-4.9c0-1.1-.9-2-2-2z"/></svg>`,
```

### src/ui/icons.ts · play · _v0.49.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · tween · _v0.50.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · history · _v0.56.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · camera · _v0.57.0

One inline currentColor icon. Nothing was removed.

### src/ui/icons.ts · tool icons · _v0.64.0

Four Phosphor icons. Nothing was removed.

### src/ui/icons.ts · tool icon · _v0.65.0

The Quick Selection icon. Nothing was removed.

## src/ui/layers.ts

### src/ui/layers.ts · LayersPanel.bindRows · pointerdown · _v0.1.0

Removed: capturing the pointer on press retargeted `click` and `dblclick` to the list, which broke rename and folder disclosure. Capture now starts when a drag passes 4 px.

```ts
      rows.setPointerCapture(e.pointerId);
```

### src/ui/layers.ts · bindRows · dblclick · _v0.2.0

Double-clicking an adjustment layer's row outside the name dispatches `cv:edit-adjustment` for the app to open its editor. Removed:

```ts
      if (row?.dataset.id && t.closest('.cv-layer-name')) this.startRename(row.dataset.id);
```

### src/ui/layers.ts · LayersPanel · Option-click clipping, Option-drag mask copy · _v0.14.0

With Option held, the bottom quarter of a row (`inClipZone`) shows the clipping cursor and a click there toggles that layer's clipping mask; an Option-drag from a mask thumbnail carries `maskFrom`, targets a whole non-folder row, and calls `copyMask` on release. Removed:

```ts
  private drag: { id: ID; ids: ID[]; startY: number; pointerId: number; started: boolean; wasSelected: boolean; target: { id: ID; where: Where } | null } | null = null;
```

```ts
      this.drag = { id, ids, startY: e.clientY, pointerId: e.pointerId, started: false, wasSelected: wasSelected && !mod && !e.shiftKey, target: null };
```

```ts
      if (d.started && d.target) this.engine.moveLayers(d.ids, d.target.id, d.target.where, e.altKey);
```

### src/ui/layers.ts · LayersPanel · drag onto a project tab · _v0.18.0

A row dragged over another project's tab highlights it (`showTabDrop`) and, released there, calls `copyLayerToProject`; mask drags never target tabs. Removed:

```ts
target: { id: ID; where: Where } | null; maskFrom: ID | null } | null = null;
```

```ts
wasSelected: wasSelected && !mod && !e.shiftKey, target: null, maskFrom };
```

```ts
      if (d.started && d.target) {
```

### src/ui/layers.ts · fx mark, type rows · _v0.40.0

The fx mark updated in place; double-clicking it opens Layer Style, and double-clicking a type row edits its text. Removed:

```ts
import { BLEND_MODES, hierarchy, type Engine, type HierarchyEntry, type ID, type Layer, type Raster } from '../engine';
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span></span></div>`);
      if (t.closest('.cv-layer-name')) this.startRename(row.dataset.id);
```

### src/ui/layers.ts · smart badge · _v0.45.0

The smart-object badge and its double-click. Removed:

```ts
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span><span class="cv-layer-fx" hidden title="Layer style">fx</span></span></div>`);
```

### src/ui/layers.ts · shape badge · _v0.47.0

The shape-layer badge. Removed:

```ts
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span><span class="cv-layer-fx" hidden title="Layer style">fx</span><span class="cv-layer-smart" hidden title="Smart object: double-click for its filters">${icon('smartObject', 12)}</span></span></div>`);
```

### src/ui/layers.ts · shape badge · _v0.48.0

Double-clicking the shape badge opens its fill and stroke. Removed:

```ts
    const row = el(`<div class="cv-layer" role="option"><button class="cv-layer-eye" type="button" tabindex="-1" aria-label="Show or hide"><span class="cv-eye-on">${icon('eye', 14)}</span><span class="cv-eye-off">${icon('eyeOff', 14)}</span></button><span class="cv-layer-indent"></span><button class="cv-layer-disclose" type="button" tabindex="-1" aria-label="Expand or collapse"><span class="cv-open">${icon('chevronDown', 12)}</span><span class="cv-shut">${icon('chevronRight', 12)}</span></button><canvas class="cv-layer-thumb" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-kind"></span><canvas class="cv-layer-mask" width="${THUMB}" height="${THUMB}"></canvas><span class="cv-layer-name"><span class="cv-layer-clip">${icon('clipMask', 12)}</span><span class="cv-layer-label"></span><span class="cv-layer-fx" hidden title="Layer style">fx</span><span class="cv-layer-smart" hidden title="Smart object: double-click for its filters">${icon('smartObject', 12)}</span><span class="cv-layer-vector" hidden title="Shape layer">${icon('penTool', 12)}</span></span></div>`);
```

## src/ui/menu.ts

### src/ui/menu.ts · popup menus and menubar · _v0.1.0

Created in _v0.1.0.

### src/ui/menu.ts · MenuDef, MenuBar · items resolved on open · _v0.23.0

A menu's `items` may be a function (`itemsOf`), resolved at construction and on every open, so File's Open Recent section tracks the list; `setItems` still skips unchanged lists. Removed:

```ts
export interface MenuDef { label: string; items: MenuItem[] }
```

```ts
  private readonly menus: Array<{ btn: HTMLButtonElement; menu: PopupMenu }> = [];
```

```ts
      menu.setItems(def.items);
```

```ts
      this.menus.push({ btn, menu });
```

## src/ui/options.ts

### src/ui/options.ts · OptionsBar.build · button · _v0.1.0

Removed: `q(n, 'span')` returned the icon box, so the label replaced the icon and overflowed its 14 px width. The label now has its own `.cv-btn-label` span.

```ts
        const n = el<HTMLButtonElement>(`<button class="cv-btn cv-btn-ghost" type="button">${spec.icon ? icon(spec.icon, 14) : ''}<span></span></button>`);
        setText(q(n, 'span'), spec.label);
```

### src/ui/options.ts · OptionsBar · number fields · _v0.4.0

Builds `number` options as inputs that commit on Enter or blur exactly once (a relative field such as Scale would otherwise apply twice, since Enter blurs and blur fires `change`), restore the last committed value on Escape, and never overwrite a field while it has focus. Nothing was removed.

### src/ui/options.ts · select option · _v0.41.0

Renders the `select` option. Nothing was removed.

## src/ui/palette.ts

### src/ui/palette.ts · stage colors from tokens · _v0.1.0

Created in _v0.1.0.

## src/ui/panels/adjust-panel.ts

### src/ui/panels/adjust-panel.ts · AdjustPanel · _v0.2.0

Panel for all six adjustments. Layer mode edits live inside one undo step (`beginLive`, `commitLive`, `cancelLive`); image mode previews, then applies through the selection. Working data is deep-cloned on open so live edits never touch the undo snapshot. The Curves editor draws its curve with `curvesKernel` itself, so the graph and the render cannot disagree. Hue/Saturation band handles, eyedroppers and targeted drag are not built yet.

### src/ui/panels/adjust-panel.ts · autoLevels, buildLevels · _v0.6.0

`autoLevels` ports the `LevelsAuto` as a pure function of `histogram()`: each end clips 0.1% of a channel; Contrast sets one master interval across R, G and B, Color sets each channel, and Color + neutral midtones also sets each channel's gamma so its stretched mean maps to middle gray, clamped 0.1 to 9.99. The Levels section gains an Auto choice under the histogram that applies a mode through the live preview and resets to Choose. Removed:

```ts
    node.append(channel.el, canvas, black.el, gamma.el, white.el, outB.el, outW.el);
```

### src/ui/panels/adjust-panel.ts · Levels eyedroppers · _v0.7.0

A Sample choice (Off, Black point, Gray point, White point) under Auto turns an eyedropper on: `startSampling` makes the scrim click-through and takes stage clicks in a capture-phase listener before any tool sees them, and `applySample` ports the `LevelsSettings.sampling` (all three channels calibrated together, the master range reset, the gray point setting each channel's gamma). A `close` override ends sampling whichever way the panel closes. Removed:

```ts
    node.append(channel.el, canvas, auto.el, black.el, gamma.el, white.el, outB.el, outW.el);
```

### src/ui/panels/adjust-panel.ts · Hue/Saturation bands, eyedroppers, targeted adjustment · _v0.8.0

The Hue/Saturation section gains the spectrum editor (hues as they are on top, as the adjustment leaves them below through `hueResponse` and `hsvAdjust`, the selected range's four handles between, dragged by nearest circular distance with pointer capture, the degrees beneath), a Sample choice (Sample, Add, Remove) and a Targeted adjustment toggle. Sampling is generalized to named modes with per-row resets so the choices stay exclusive; `sampleHue` reads the hue from the composite (none for near-neutral pixels) and `beginTarget` picks the range that most claims it and drags saturation, or hue with Cmd or Ctrl, half a unit per screen pixel, its window listeners always removed by `stopSampling`. Removed, the Levels-only sampling:

```ts
  private sampleMode: 'black' | 'gray' | 'white' | null = null;
  private sampleHandler: ((e: PointerEvent) => void) | null = null;
  private sampleRow: { set: (v: string) => void } | null = null;
```

```ts
  /** The Levels eyedroppers: while a mode is on, the scrim lets clicks through and a click on the canvas samples the
   *  original pixel there, before any tool sees the click. */
  private startSampling(mode: string): void {
    this.stopSampling();
    if (mode !== 'black' && mode !== 'gray' && mode !== 'white') return;
    this.sampleMode = mode;
    this.sampleRow?.set(mode);
    this.scrim.classList.add('cv-scrim-through');
    const handler = (e: PointerEvent): void => {
      const stage = document.querySelector('.cv-overlay-canvas'), p = this.engine.current, m = this.sampleMode;
      if (e.button !== 0 || !stage || e.target !== stage || !p || !m) return;
      e.preventDefault();
      e.stopPropagation();
      const b = stage.getBoundingClientRect(), v = p.viewport;
      const rgb = this.engine.sampleOriginal({ x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom }, this.mode !== 'image');
      if (rgb) this.applySample(rgb, m);
    };
    window.addEventListener('pointerdown', handler, true);
    this.sampleHandler = handler;
  }

  private stopSampling(): void {
    if (this.sampleHandler) window.removeEventListener('pointerdown', this.sampleHandler, true);
    this.sampleHandler = null;
    this.sampleMode = null;
    this.scrim.classList.remove('cv-scrim-through');
    this.sampleRow?.set('');
  }
```

```ts
    this.sampleRow = sample;
```

Removed, the Hue/Saturation rows:

```ts
    const hue = sliderRow('Hue', -180, 180, 1, (v) => { cur().hue = v; this.changed(); });
    const hueC = sliderRow('Hue', 0, 360, 1, (v) => { cur().hue = v; this.changed(); });
    const sat = sliderRow('Saturation', -100, 100, 1, (v) => { cur().saturation = v; this.changed(); });
    const satC = sliderRow('Saturation', 0, 100, 1, (v) => { cur().saturation = v; this.changed(); });
    const light = sliderRow('Lightness', -100, 100, 1, (v) => { cur().lightness = v; this.changed(); });
```

```ts
    const invert = checkRow('Invert range', (v) => { this.hsv.invertRange = v; this.changed(); });
    node.append(range.el, hue.el, hueC.el, sat.el, satC.el, light.el, colorize.el, invert.el);
```

```ts
import { el, setHidden } from '../dom';
```

### src/ui/panels/adjust-panel.ts · onApplied, applySettings · _v0.51.0

Reports applied adjustments for recording and replays them without the dialog. Removed:

```ts
  openForLayer(id: ID): void {
    if (this.mode === 'layer') this.engine.commitLive();
```

### src/ui/panels/adjust-panel.ts · askImage · _v0.53.0

Opens an image adjustment with recorded settings for an action paused for input. Nothing was removed.
### src/ui/panels/adjust-panel.ts · parametric sections · _v0.66.0

`buildParams` makes one section per parametric kind from its control list, all rows built once and group rows hidden rather than rebuilt; `prepare` normalises `data.params`; `kernel` falls through to `paramKernel`. Nothing was removed.

## src/ui/panels/background-panel.ts

### src/ui/panels/background-panel.ts · BackgroundPanel · _v0.9.0

the Remove Background panel: Quality (Basic or Advanced) and, for Advanced, Refine (0 to 40 px, default 12), Contrast (0 to 100 percent, default 25) and Shift Edge (-10 to 10 px). It owns the model's raw mask bitmap while open, targets the layer's pixels, previews the layer with its background hidden through `previewImageEdit` (coalesced to one per frame), and on OK refines at full size and calls `applySubjectMask`. Cancel always clears the preview; settings carry over between uses.

## src/ui/panels/color-picker.ts

### src/ui/panels/color-picker.ts · ColorPickerDialog · _v0.10.0

Ported from the `ColorPickerSheet.swift`: a saturation and brightness field, a vertical hue strip, new and current swatches, and RGB and hex entry, with HSV as the source of truth so a gray keeps its hue. It opens on the `cv-pick-color` event the rail's swatches send, titled Foreground Color or Background Color. While open, its scrim is click-through and a capture-phase listener samples the composite color under a stage click before any tool sees it. Enter in the hex box commits by blurring it, so a later blur cannot re-apply a stale value over a hue drag. OK sets the color; Cancel and Escape leave it.

### src/ui/panels/color-picker.ts · ColorPickerDialog · drag sampling and ring · _v0.11.0

Canvas sampling follows a drag through capture-phase window listeners, showing the sample ring against the picker's color from the drag's start; `endSampleDrag` removes the listeners and the ring, and `close` always calls it. Removed from the sampler:

```ts
      const b = stage.getBoundingClientRect(), v = p.viewport;
      const rgb = this.engine.sampleOriginal({ x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom }, true);
      if (rgb) this.setRgb({ r: Math.round(rgb[0] * 255), g: Math.round(rgb[1] * 255), b: Math.round(rgb[2] * 255) });
```

## src/ui/panels/controls.ts

### src/ui/panels/controls.ts · sliderRow, selectRow, checkRow, colorRow, numberRow · _v0.2.0

Row helpers built once, with setters that update in place.

## src/ui/panels/filter-panel.ts

### src/ui/panels/filter-panel.ts · FilterPanel · _v0.2.0

Gaussian Blur, Motion Blur, Add Noise and Lens Correction with a 140 ms debounced preview and a fixed seed per open; apply runs after the dialog closes and paints.

### src/ui/panels/filter-panel.ts · FilterPanel · worker previews · _v0.26.0

Previews run through `runFilterOffThread`, falling back to the local kernel when there is no worker; the commit still runs on the main thread inside the undo transaction. Removed:

```ts
      if (this.preview) this.engine.previewImageEdit((src, scale) => this.run(src, scale), this.grow());
```

### src/ui/panels/filter-panel.ts · Unsharp Mask section · _v0.33.0

Amount, Radius and Threshold sliders and the `run` branch. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection';
```

### src/ui/panels/filter-panel.ts · Develop section · _v0.36.0

Sixteen sliders in Light, Colour, Effects and Detail groups, built from one table. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask';
```

### src/ui/panels/filter-panel.ts · onApplied, applySettings · _v0.44.0

Records applied filters and replays them without the dialog. Nothing was removed.

### src/ui/panels/filter-panel.ts · runFilter, filterMargin · _v0.45.0

Filter code made shareable; smart-object routing and editing a stored filter. Removed:

```ts
  private readonly s = { radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, usmAmount: 100, usmRadius: 1, threshold: 0, develop: defaultDevelopState() };
  private run(src: ImageData, scale: number): ImageData {
    const s = this.s;
    switch (this.kind) {
      case 'gaussianBlur': return gaussianBlur(src, s.radius * scale);
      case 'motionBlur': return motionBlur(src, s.angle, s.distance * scale);
      case 'addNoise': return addNoise(src, s.amount, s.gaussian, s.monochromatic, this.seed);
      case 'lensCorrection': return lensDistort(src, s.distortion);
      case 'unsharpMask': return unsharpMask(src, s.usmAmount, s.usmRadius * scale, s.threshold);
      case 'develop': return developImage(src, s.develop, scale);
    }
  }
  private grow(): number {
    return this.kind === 'gaussianBlur' ? gaussianMargin(this.s.radius) : this.kind === 'motionBlur' ? motionMargin(this.s.distance) : 0;
  }
```

### src/ui/panels/filter-panel.ts · shape layers · _v0.47.0

Filters refuse shape layers before opening. Nothing was removed.

### src/ui/panels/filter-panel.ts · ask · _v0.53.0

Opens with recorded settings for an action paused for input. Nothing was removed.

### src/ui/panels/filter-panel.ts · background apply · _v0.55.0

OK and Actions replay apply filters through the worker. Removed:

```ts
  applySettings(kind: FilterKind, settings: Record<string, unknown>): boolean {
    const label = FILTER_LABELS[this.kind], grow = this.grow();
    const run = (src: ImageData, scale: number): ImageData => this.run(src, scale);
    requestAnimationFrame(() => window.setTimeout(() => this.engine.applyImageEdit(label, run, grow), 0));
```
### src/ui/panels/filter-panel.ts · Lens Blur, Smart Sharpen · _v0.68.0

Kinds, labels, defaults, `runFilter` cases and margins for the two filters; their dialog sections, Smart Sharpen's Angle row shown only for Motion Blur removal. Removed:

```ts
export type FilterKind = 'gaussianBlur' | 'motionBlur' | 'addNoise' | 'lensCorrection' | 'unsharpMask' | 'develop';
export const FILTER_LABELS: Record<FilterKind, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop' };
  return { radius: 1, angle: 0, distance: 10, amount: 10, gaussian: false, monochromatic: false, distortion: 0, usmAmount: 100, usmRadius: 1, threshold: 0, develop: defaultDevelopState() };
  return kind === 'gaussianBlur' ? gaussianMargin(s.radius) : kind === 'motionBlur' ? motionMargin(s.distance) : 0;
```

## src/ui/panels/jpeg-dialog.ts

### src/ui/panels/jpeg-dialog.ts · JpegDialog · _v0.6.0

Ported from the `JPEGExportSheet.swift`. Quality starts from the last export, remembered in localStorage under `formvis.jpegQuality`, and from 85% the first time; the sheet shows the image size and sRGB and previews the actually encoded JPEG, debounced 120 ms, with its encoded size. The preview canvas keeps one size (432 by 280) with the image fitted inside, so the sheet never changes height, and the preview is decoded with `createImageBitmap` rather than shown through a blob URL, which the desktop CSP may refuse. Export stores the quality and hands it back to the caller.

## src/ui/panels/live-mask-dialog.ts

### src/ui/panels/live-mask-dialog.ts · LiveMaskDialog · _v0.19.0

the alert for deleting a layer that other layers are clipped to (their live mask), with its wording and buttons: Bake and Delete, Cancel, Remove Links and Delete; `choose` resolves `bake`, `unlink` or null (Cancel and Escape).

## src/ui/panels/size-dialogs.ts

### src/ui/panels/size-dialogs.ts · CanvasSizeDialog, ImageSizeDialog, AmountDialog · _v0.2.0

Canvas Size with the anchor offset formula and extension fill, Image Size with constrain, resolution and resampling, and the Expand and Contract amount dialog that remembers its amounts.

### src/ui/panels/size-dialogs.ts · onApplied · _v0.44.0

Records Image and Canvas Size changes. Removed:

```ts
    if (this.engine.resizeCanvas(W, H, dx, dy, colors[choice] ?? null)) this.close();
    if (this.engine.resampleImage(this.w, this.h, this.sampling, this.res)) this.close();
```

### src/ui/panels/size-dialogs.ts · starting sizes · _v0.47.0

Image and Canvas Size report the size they started from. Removed:

```ts
  onApplied: ((v: { w: number; h: number; dx: number; dy: number; fill: RGB | null }) => void) | null = null;
    if (this.engine.resizeCanvas(W, H, dx, dy, colors[choice] ?? null)) { this.onApplied?.({ w: W, h: H, dx, dy, fill: colors[choice] ?? null }); this.close(); }
  onApplied: ((v: { w: number; h: number; sampling: string; res: number }) => void) | null = null;
    if (this.engine.resampleImage(this.w, this.h, this.sampling, this.res)) { this.onApplied?.({ w: this.w, h: this.h, sampling: this.sampling, res: this.res }); this.close(); }
```
### src/ui/panels/size-dialogs.ts · Feather, Border, Smooth · _v0.66.0

`AmountDialog.show` takes an optional modify kind; `apply` sends it to `modifySelection` and remembers the amount. Removed:

```ts
  show(expand: boolean): void {
    this.setTitle(expand ? 'Expand Selection' : 'Contract Selection');
    this.amount.set(expand ? this.engine.selectionAmounts.expand : this.engine.selectionAmounts.contract);
```

## src/ui/rail.ts

### src/ui/rail.ts · tool rail and colors · _v0.1.0

Created in _v0.1.0.

### src/ui/rail.ts · Rail · swatches open the picker · _v0.10.0

The foreground and background swatches dispatch `cv-pick-color` instead of opening the native color input, which stays in the markup unused. Removed:

```ts
    this.fg.addEventListener('click', () => this.fgInput.click());
    this.bg.addEventListener('click', () => this.bgInput.click());
```

## src/ui/stage.ts

### src/ui/stage.ts · Stage.resize · _v0.1.0

Renders synchronously inside the ResizeObserver callback so a resize never shows a blank canvas. At 200 percent and above the visible document region is composited at 1:1 and scaled with smoothing off, for a true pixel view.

### src/ui/stage.ts · Stage · renderOverlay · _v0.4.0

The marching ants take their offset from `engine.outlineShift`, which covers both a selection being moved and pixels being moved. Removed:

```ts
      const shift = this.engine.selectionShift?.project === p ? this.engine.selectionShift : null;
```

### src/ui/stage.ts · Stage · renderOverlay · sample ring · _v0.11.0

After the tool overlay, draws `engine.sampleRing` with the `SampleRingOverlay` geometry in screen pixels (radius 43, a 24 px gray ring at 0.45 white, 16 px halves clipped top and bottom: the new color above, the color before the drag below), so it keeps its size at any zoom. Nothing was removed.

### src/ui/stage.ts · Stage · WebKit pinch · _v0.20.0

`gesturestart`, `gesturechange` and `gestureend` listeners zoom about the pointer by the gesture's scale since it began, as the magnify; Chrome's pinch still arrives as Ctrl+wheel. Nothing was removed.

### src/ui/stage.ts · Stage · right-drag brush tip · _v0.22.0

Right presses with Brush, Spot Healing, Clone Stamp or Smear (`brushTools`, the isBrushTool) start a tip drag before tool dispatch, captured like panning. Nothing was removed.

### src/ui/stage.ts · Stage · floating ants · _v0.24.0

With no live selection, the ants draw `floatingOutline`'s selection through the view times its carry matrix, and keep marching while a selection floats. Removed:

```ts
    const sel = p.selection;
    if (sel) {
```

```ts
      const m = new DOMMatrix([v.zoom * d, 0, 0, v.zoom * d, (v.panX + (shift?.dx ?? 0) * v.zoom) * d, (v.panY + (shift?.dy ?? 0) * v.zoom) * d]);
      const path = new Path2D();
      path.addPath(sel.outline(), m);
```

```ts
    const need = !!this.engine.current?.selection && !REDUCED;
```

### src/ui/stage.ts · Stage · region repaints · _v0.29.0

Reported regions accumulate in `pending` between frames; `renderScene(region)` clears and recomposes only that region, a pixel wider each way, leaving the rest of the scene; a full request wins until the frame runs. Removed:

```ts
    for (const k of ['render', 'viewport', 'active'] as const) engine.on(k, () => this.queue(true, true));
```

```ts
  private queue(scene: boolean, overlay: boolean): void {
    this.wantScene ||= scene;
    this.wantOverlay ||= overlay;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.wantScene) this.renderScene();
      if (this.wantOverlay) this.renderOverlay();
    });
  }
```

```ts
  private renderScene(): void {
    this.wantScene = false;
    const g = this.sctx;
    const W = this.scene.width, H = this.scene.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const p = this.engine.current;
    if (!p) return;
```

```ts
    g.lineWidth = 1;
    g.strokeStyle = pal.edge;
    g.strokeRect(Math.round(docRect.x) - 0.5, Math.round(docRect.y) - 0.5, Math.round(docRect.w) + 1, Math.round(docRect.h) + 1);
    const vis = intersectRect(integral(docRect), { x: 0, y: 0, w: W, h: H });
    if (!vis) return;
```

## src/ui/status.ts

### src/ui/status.ts · status bar · _v0.1.0

Created in _v0.1.0.

## src/ui/tabs.ts

### src/ui/tabs.ts · project tabs · _v0.1.0

Created in _v0.1.0.

## src/ui/themes.ts

### src/ui/themes.ts · 14 NodeMode theme profiles, verbatim · _v0.1.0

Created in _v0.1.0.

## src/ui/toast.ts

### src/ui/toast.ts · toasts · _v0.1.0

Created in _v0.1.0.

## src/version.ts

### src/version.ts · version string · _v0.1.0

Created in _v0.1.0.

## tsconfig.json

### tsconfig.json · strict compiler settings · _v0.1.0

Created in _v0.1.0.

## vite.config.ts

### vite.config.ts · ports 5190 and 5191, host false, /api proxy · _v0.1.0

Created in _v0.1.0.

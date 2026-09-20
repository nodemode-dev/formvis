# frontend HASHOUT_LOG

Living log for the frontend side, _v0.1.0. Read the map and the TOC first; entries are anchored by file and symbol, and removed code is quoted in full.

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
        events.ts  · typed emitter
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
        tokens.css  · NodeMode tokens plus the sonny block
    ui/
        app-dialogs.ts  · new canvas, open, settings, shortcuts, about
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
- [src/engine/events.ts](#srcengineeventsts)
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

## public/favicon.svg

### public/favicon.svg · tab icon · _v0.1.0

Created in _v0.1.0.

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

Adds the clipboard, selection-modify, Image adjustment, New Adjustment Layer, Canvas Size, Image Size and filter commands, and a Filter menu that now holds Remove Background, as in the reference app. Copy writes PNG plus a `sonny:` marker to the system clipboard; Mod+V is let through to the native paste event, which pastes in-app copies in place and external images centered above the active layer. Double-clicked adjustment rows open their editor through `cv:edit-adjustment`.

### src/app.ts · startApp · Content-Aware Fill · _v0.3.0

Adds the Content-Aware Fill command (Shift+Backspace) to the Edit menu; it runs after a frame so the busy indicator can show. Removed from the Edit menu definition:

```ts
'fill-fg', 'fill-bg', 'clear', '-', 'settings'] },
```

### src/app.ts · startApp · Transform command · _v0.5.0

Adds the Transform command to the Edit menu, labeled Transform Selection or Transform Layer as the reference app labels it, on Alt+Mod+T (browsers keep Mod+T for a new tab, as with Alt+Mod+N and Alt+Mod+W) and Mod+T. Removed from the Edit menu definition:

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

## src/engine/adjust.ts

### src/engine/adjust.ts · hsvKernel, grainKernel, defaultAdjustmentData · _v0.2.0

Hue/Saturation ported from `HueSaturation.swift` (HSL, per-range band weights, multiplicative saturation, lightness pull, colorize), baked into a 33-point cube lookup table like the reference app's color cube. Grain ported from `AdjustPixels.c` (lattice noise, smoothstep, roughness, midtone weighting) in document coordinates. The invert-range rule in `weightOf` is inferred from the settings doc comment, not read from source. `defaultAdjustmentData` writes every non-optional `LayerAdjustment` field because the reference app decodes with synthesized Codable; enum-keyed dictionaries are written as Swift's alternating arrays and read in either form.

### src/engine/adjust.ts · band operations · _v0.8.0

Ports the reference app's `HueBand` methods as pure functions: `bandForward`, `bandHandles`, `bandCentered` (the Sample eyedropper), `bandInclude` (Add), `bandExclude` (Remove), `bandSetHandle` (a handle drag, refused when it would break the order or exceed 350 degrees) and the private `normalizeBand`. Swift's `truncatingRemainder` matches JavaScript's `%`, so wraparound behaves identically. Nothing was removed.

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

the reference app's DownsampleCache: `draw` renders a layer landing under half size from a chain of exact 2x halvings (`halvings`, `halved`, at most six), cached per raster and dropped when its version changes, found through `rasterOf`; Nearest sampling bypasses it. Removed:

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

## src/engine/events.ts

### src/engine/events.ts · typed emitter · _v0.1.0

Created in _v0.1.0.

## src/engine/filters.ts

### src/engine/filters.ts · gaussianBlur, motionBlur, addNoise, lensDistort, histogram, resizeMask · _v0.2.0

Gaussian Blur as three premultiplied box passes with zero padding, so it fades past the edge; Motion Blur as a sampled line of the given length (the reference app matches Core Image's radius to that length by variance); Add Noise and Lens Correction ported from `NoisePixels.c` and `LensPixels.c` with premultiplied sampling; the Levels histogram from `LevelsPixels.c`; Expand and Contract through a Felzenszwalb distance transform with one pixel of antialiasing.

## src/engine/geometry.ts

### src/engine/geometry.ts · matrices and rectangles · _v0.1.0

Created in _v0.1.0.

## src/engine/history.ts

### src/engine/history.ts · undo stack · _v0.1.0

Created in _v0.1.0.

## src/engine/index.ts

### src/engine/index.ts · Engine.moveLayers · _v0.1.0

Removed: a drop onto the slot a layer already held recorded an undo entry that changed nothing. The new code compares id, parent and clip order and returns false on a no-op.

```ts
      p.setLayers(this.normalizeClips(layers));
```

### src/engine/index.ts · Engine.setMaskFromImage · _v0.1.0

Added for Remove Background: the engine result becomes a linked layer mask, never deleted pixels, matching the reference app.

### src/engine/index.ts · live edits, previews, image edits, sizing, clipboard, gradient, shapes · _v0.2.0

Adds `beginLive`, `updateLive`, `commitLive` and `cancelLive` (one undo step for panel editing); `setPreview` and `previewImageEdit` (scaled to about 2 megapixels, grown for blurs); `applyImageEdit` (through the selection, masks as gray, blurs grow the layer); adjustment layers; Canvas Size with the Canvas Extension layer; Crop; Image Size; Expand, Contract and Mask's Black Areas; the clipboard; the pending gradient, committed on `settle` so the first Undo discards it; shape layers, redrawn on resize and plain pixels once painted, filled or filtered. Clearing on a mask now fills with the background color, as in the reference app. Removed:

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

Move drags snap through `snapMove`: the moving box's edges and center go to the nearest target within 6 screen pixels among the canvas edges and center and every other visible layer's upright bounds and center, as the reference app's `snappedMove`, with `snapGuides` for the overlay; `snapping` turns it off. `setLayerTransform`, `resizeLayerTo` and `scaleLayerTo` back the Move inspector fields: each is one undo step, resizes around the center, honors the ratio lock, redraws shape layers, and a no-op records nothing. `beginPixelMove`, `movePixelsBy`, `endPixelMove` and `cancelPixelMove` lift the selected pixels (the reference app's `PixelMove`), show them over the layer with the selection cleared (kept for a duplicate), and commit one patch with the selection translated; `outlineShift` lets the ants follow. Removed:

```ts
  cancelTransform(): void { if (this.transformEdit) { this.transformEdit = null; this.emit('render', null); this.emit('options', null); } }
```

### src/engine/index.ts · Transform Selection, growLayer · _v0.5.0

`transformCommand` (the reference app's Cmd-T) floats the selection when `canTransformSelection`, else switches to Move with transform controls on. `beginSelectionTransform` switches to Move first (switching settles), then opens one Transform Selection step: the selected pixels go onto a Floating Selection layer above their layer with its opacity and blend, the source shows its cleared pixels through the override map without being written, and the selection is handed to the float. Drags and inspector edits of the float update it without history (`settle(keepFloating)`, the floating branches in `endTransform` and `setLayerTransform`). `commitSelectionTransform` grows the source where the pixels now extend past it, writes cleared base plus transformed float, removes the float, and carries the selection through the same matrix; an unchanged float, a cancel, or a closed project restores the document exactly. `ensurePixels` now calls the general `growLayer(want)`. Removed:

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

Lays a refined subject mask on a layer as one Remove Background step, stored as sonny masks are (white with the level in alpha), multiplied into an existing same-size unplaced mask as the reference app's `subjectMask` does. Nothing was removed; `setMaskFromImage` stays for other callers.

### src/engine/index.ts · sampleRing, setSampleRing · _v0.11.0

the reference app's sample ring state: the document point, the sampled color and the color before the drag, set by whatever is sampling and drawn by the stage; `showsSampleRing` is the Eyedropper's Sample Ring option and suppresses it. Nothing was removed.

### src/engine/index.ts · wand Sample Size, selectionAntialiased, nudgeSelection · _v0.13.0

`wand.sampleSize` (0 Point, 1 three by three, 2 five by five) passes to `wandMask`; `selectionAntialiased` is the reference app's session-wide Anti-alias for the Lasso and elliptical Marquee; `nudgeSelection` moves the outline as one Move Selection step. Removed:

```ts
  wand = { tolerance: 32, contiguous: true, sampleAll: false };
```

```ts
    const mask = wandMask(data, W, H, x, y, this.wand.tolerance, this.wand.contiguous);
```

### src/engine/index.ts · copyMask · _v0.14.0

the reference app's Option-drag mask copy: the source's mask onto the target as one Copy Layer Mask or Replace Layer Mask step, pinned where it sits on the document (`placement` from the source's mask or layer transform), with its own raster, or kept solid when the source was never painted; the target becomes active with its mask targeted. Nothing was removed.

### src/engine/index.ts · transformsMask, transform edit mask mode · _v0.15.0

the reference app's commitMaskTransform: with a painted mask targeted and unlinked (`transformsMask`), a transform edit starts from the mask's box, previews through `maskPlacement`, and commits the mask's placement as one Transform Layer Mask step. Removed:

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

`maskBlurSample` ports the reference app's blurSample for a mask (the mask at document size, its area from none, the rest at its binary edge tone, blurred at the Blur sigma); `beginRetouchStroke` lets Blur paint a targeted mask as a lerp stroke with the stroke's real target, while Clone Stamp and Spot Healing still refuse masks. Removed:

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

the reference app's group transform: with more than one layer selected or a folder, `groupMembers` (visible pixel layers selected or inside a selected folder) move with `groupBox`, each member previewed and committed through `following`, as one Transform Layers step; group moves skip snapping for now. Removed:

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

the reference app's copyLayer(into:): a layer with a folder's contents copied into another open project as one Copy Layers from Project step (new ids, cloned rasters and masks, remapped parent and clip links, centered on the target canvas, on top), the target made current, within the reference app's 100-megapixel budget. `snapMove` skips a set of moving layers, so group moves now snap their box. Removed:

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

A live mask in the reference app is a clipping mask. `liveMaskDependents` names the layers clipped to ones being deleted; `deleteLayers(true)` bakes each (its cloned raster masked by `clipCoverageOf` mapped into its pixel grid) before unlinking, as one Delete Layer step. Removed:

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

## src/engine/kernels.ts

### src/engine/kernels.ts · adjustment and wand kernels · _v0.1.0

Created in _v0.1.0.

### src/engine/kernels.ts · Kernel · _v0.2.0

Kernels take an optional context with the region's document origin and scale, which Grain needs. Removed:

```ts
export type Kernel = (data: Uint8ClampedArray) => void;
```

### src/engine/kernels.ts · wandMask sample radius · _v0.13.0

The color to match averages the pixels within `sampleRadius` of the click, clipped to the image, as the reference app's Sample Size does. Removed:

```ts
export function wandMask(rgba: Uint8ClampedArray, width: number, height: number, seedX: number, seedY: number, tolerance: number, contiguous: boolean): Uint8Array {
```

```ts
  const s = (seedY * width + seedX) * 4;
  const ref = [rgba[s], rgba[s + 1], rgba[s + 2], rgba[s + 3]];
```

## src/engine/matte.ts

### src/engine/matte.ts · refineMatte, guidedFilter, boxMean, levelsOf · _v0.9.0

Ported from the reference app's `SubjectRemoval.refined` and `GuidedMatte`. `boxMean` is the running-sum box mean with edge clamping; `guidedFilter` is He, Sun and Tang's filter with epsilon 1e-4; `refineMatte` applies the reference app's order (Refine, then Shift Edge as a clamped Gaussian of half the reach cut hard at 0.25 or 0.75, then Contrast as a stretch about middle gray) with radii in layer pixels scaled for previews, and returns the mask unchanged for Basic; `levelsOf` reads a mask's gray or a guide's luminance over black. Checked against an independent NumPy port to 6.3e-5.

## src/engine/project.ts

### src/engine/project.ts · per-tab project record · _v0.1.0

Created in _v0.1.0.

## src/engine/retouch.ts

### src/engine/retouch.ts · spotHeal, contentFill, WarpStroke · _v0.3.0

Ported line for line from the reference app. `spotHeal` from `HealPixels.c`: ring matching over 5 distances and 24 angles (2 distances with a stronger nearness bias for Proximity Match), a plus or minus 3 px alignment refine, a multigrid smooth solve over the spot, and Create Texture's grain matched to the ring's detail. `contentFill` from `ContentFill.c`: a patch search growing inward from the selection edge. `WarpStroke` from `SmudgeLiquify.swift`: Liquify's forward warp and Smudge's carried color, dab by dab on a document-size premultiplied copy. C's `lround` rounds halves away from zero, so the port does too rather than using `Math.round`.

## src/engine/selection.ts

### src/engine/selection.ts · selection masks, outline tracer · _v0.1.0

Created in _v0.1.0.

## src/engine/stroke.ts

### src/engine/stroke.ts · brush stroke engine · _v0.1.0

Created in _v0.1.0.

### src/engine/stroke.ts · texture and coverageAlpha · _v0.3.0

A stroke can paint a document-space texture at an offset instead of a color, which is how Clone Stamp and the Blur mode of Smear work: a canvas point takes the sample at itself plus the offset. `coverageAlpha` returns the accumulated coverage clipped by the selection, which Spot Healing heals. Nothing was removed.

### src/engine/stroke.ts · PixelStroke · lerp mode · _v0.16.0

A `lerp` flag for alpha-coded masks: compose erases by the coverage, then adds the coverage-masked sample with `lighter`, so out = old x (1 - c) + sample x c. Removed:

```ts
  constructor(readonly raster: Raster, localToDoc: Mat, readonly style: StrokeStyle, readonly op: GlobalCompositeOperation, private readonly selection: SelectionMask | null, private readonly texture: { surface: Surface; dx: number; dy: number } | null = null) {
```

```ts
    w.globalCompositeOperation = this.op;
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

the reference app's `LayerTransform.placing` (a unit-square map back to a rotated, maybe flipped rectangle, keeping the flip, sampling and nearest rotation) and `following(from:to:)` (a placement carried along as a box moves), as pure functions; placing round-trips rotated and flipped transforms to 2.8e-14. Removed:

```ts
import { radians, unitPoint } from './geometry';
```

## src/engine/tree.ts

### src/engine/tree.ts · layer hierarchy walks · _v0.1.0

Created in _v0.1.0.

## src/engine/types.ts

### src/engine/types.ts · document types, blend modes, limits · _v0.1.0

Created in _v0.1.0.

## src/engine/viewport.ts

### src/engine/viewport.ts · zoom and pan · _v0.1.0

Created in _v0.1.0.

## src/extensions/registry.ts

### src/extensions/registry.ts · tool contract and registry · _v0.1.0

Created in _v0.1.0.

### src/extensions/registry.ts · OptionSpec number · _v0.4.0

Adds the `number` option kind: an editable field with optional min, max, step and unit, whose `get` returns null when there is nothing to edit. Nothing was removed.

## src/extensions/tools/brush-common.ts

### src/extensions/tools/brush-common.ts · drawBrushCursor, brushKeys, brushOptions · _v0.3.0

The brush cursor, the size, hardness and opacity keys, and the brush options shared by Brush, Spot Healing, Clone Stamp and Smear, which share one set of brush settings as in the reference app.

## src/extensions/tools/brush.ts

### src/extensions/tools/brush.ts · brush and eraser · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/clone.ts

### src/extensions/tools/clone.ts · cloneTool · _v0.3.0

Alt-click sets the source; the crosshair follows the sample point exactly as a click would stamp; Aligned and Sample all layers in the options bar.

## src/extensions/tools/crop.ts

### src/extensions/tools/crop.ts · cropTool · _v0.2.0

Crop frame with create, move and resize modes, Alt to keep the center, nine ratio presets and snapping to the canvas edges. Enter crops through `Engine.cropTo`, which is Canvas Size with an explicit offset, as the reference app's `CanvasSizeOptions.contentOffset`. Snapping to layer edges is not ported yet.

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

## src/extensions/tools/gradient.ts

### src/extensions/tools/gradient.ts · gradientTool · _v0.2.0

Pending gradient with draggable ends and Shift for 45 degree steps; shape, colors, reverse and opacity re-render it live. Enter applies, Escape cancels, and a click without a line leaves nothing pending, as in the reference app.

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

Registers Crop, Gradient and Shape in the reference app's rail order. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, brushTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
```

### src/extensions/tools/index.ts · registerBuiltinTools · _v0.3.0

Registers Spot Healing, Clone Stamp and Smear, completing the reference app's fourteen tools. Removed:

```ts
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, gradientTool, shapeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
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

Drags go through `follow`, which pointer moves and the reference app's autoscroll ticks (`scrollDelta`, `autoscroll`, `stopScroll`) share; the box keeps the reference app's marqueeConstrainArmed rule; masks honor `selectionAntialiased`, with the Anti-alias option; arrow keys nudge the outline. Removed:

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

Rectangle and ellipse shape layers in the foreground color with a corner radius, Shift after starting for square, Alt for centered, Shift+U to switch shape. The layer keeps the reference app's `LayerShapeStyle` fields (`kind`, `red`, `green`, `blue`, `cornerRadius`).

## src/extensions/tools/smear.ts

### src/extensions/tools/smear.ts · smearTool · _v0.3.0

the reference app's Blur tool, labeled Smear as in the reference app: Liquify and Smudge run as warp strokes, Blur paints a softened sample; Strength is the brush opacity.

## src/extensions/tools/wand.ts

### src/extensions/tools/wand.ts · magic wand · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/wand.ts · wandTool · Sample Size, nudging · _v0.13.0

Adds the reference app's Sample Size choice (Point, 3 by 3, 5 by 5) and arrow-key nudging. Removed:

```ts
import { modeFor, modeSegment } from './select-common';
```

```ts
  hint: () => 'Click to select similar colors · Shift adds · Alt subtracts · Tolerance sets how similar',
```

## src/extensions/tools/zoom.ts

### src/extensions/tools/zoom.ts · zoom tool · _v0.1.0

Created in _v0.1.0.

### src/extensions/tools/zoom.ts · zoomTool · the reference app's scrub rate · _v0.20.0

Scrubbing doubles the zoom per 100 px dragged from a 3 px threshold, as the reference app. Removed:

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

## src/io/images.ts

### src/io/images.ts · image decoding with engine fallback · _v0.1.0

Created in _v0.1.0.

## src/io/project-io.ts

### src/io/project-io.ts · serialize and deserialize · _v0.1.0

Field names and labels come from the reference app `ProjectStore.swift`, `LayerTransform.swift`, `LayerAppearance.swift` and `LayerAdjustment.swift`, checked against the source. Masks are written as grayscale PNGs; `adjustment` and `shape` round-trip verbatim.

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

## src/styles/scrollbars.css

### src/styles/scrollbars.css · scrollbars, loaded last · _v0.1.0

Created in _v0.1.0.

### src/styles/panels.css · color picker layout · _v0.10.0

`.cv-pick`, `.cv-pick-field`, `.cv-pick-strip`, `.cv-pick-side` and `.cv-pick-swatch` lay out the picker from existing spacing and radius tokens; `touch-action: none` keeps field and strip drags working with touch and pens. Nothing was removed.

### src/styles/panels.css · clipping cursor · _v0.14.0

`.cv-layer-rows.is-clip-zone` shows the `alias` cursor over a row's clipping zone while Option is held, the nearest standard cursor to the reference app's clipping cursor. Nothing was removed.

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

## src/styles/tokens.css

### src/styles/tokens.css · NodeMode tokens plus the sonny block · _v0.1.0

Created in _v0.1.0.

## src/ui/app-dialogs.ts

### src/ui/app-dialogs.ts · AboutDialog · _v0.1.0

Removed: a copyright line that did not match `LICENSE`.

```ts
    this.body.appendChild(el('<p class="cv-note">MIT licensed. Copyright 2026 its authors and 2026 NodeMode.</p>'));
```

## src/ui/commands.ts

### src/ui/commands.ts · command registry and key labels · _v0.1.0

Created in _v0.1.0.

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

## src/ui/menu.ts

### src/ui/menu.ts · popup menus and menubar · _v0.1.0

Created in _v0.1.0.

## src/ui/options.ts

### src/ui/options.ts · OptionsBar.build · button · _v0.1.0

Removed: `q(n, 'span')` returned the icon box, so the label replaced the icon and overflowed its 14 px width. The label now has its own `.cv-btn-label` span.

```ts
        const n = el<HTMLButtonElement>(`<button class="cv-btn cv-btn-ghost" type="button">${spec.icon ? icon(spec.icon, 14) : ''}<span></span></button>`);
        setText(q(n, 'span'), spec.label);
```

### src/ui/options.ts · OptionsBar · number fields · _v0.4.0

Builds `number` options as inputs that commit on Enter or blur exactly once (a relative field such as Scale would otherwise apply twice, since Enter blurs and blur fires `change`), restore the last committed value on Escape, and never overwrite a field while it has focus. Nothing was removed.

## src/ui/palette.ts

### src/ui/palette.ts · stage colors from tokens · _v0.1.0

Created in _v0.1.0.

## src/ui/panels/adjust-panel.ts

### src/ui/panels/adjust-panel.ts · AdjustPanel · _v0.2.0

Panel for all six adjustments. Layer mode edits live inside one undo step (`beginLive`, `commitLive`, `cancelLive`); image mode previews, then applies through the selection. Working data is deep-cloned on open so live edits never touch the undo snapshot. The Curves editor draws its curve with `curvesKernel` itself, so the graph and the render cannot disagree. Hue/Saturation band handles, eyedroppers and targeted drag are not built yet.

### src/ui/panels/adjust-panel.ts · autoLevels, buildLevels · _v0.6.0

`autoLevels` ports the reference app's `LevelsAuto` as a pure function of `histogram()`: each end clips 0.1% of a channel; Contrast sets one master interval across R, G and B, Color sets each channel, and Color + neutral midtones also sets each channel's gamma so its stretched mean maps to middle gray, clamped 0.1 to 9.99. The Levels section gains an Auto choice under the histogram that applies a mode through the live preview and resets to Choose. Removed:

```ts
    node.append(channel.el, canvas, black.el, gamma.el, white.el, outB.el, outW.el);
```

### src/ui/panels/adjust-panel.ts · Levels eyedroppers · _v0.7.0

A Sample choice (Off, Black point, Gray point, White point) under Auto turns an eyedropper on: `startSampling` makes the scrim click-through and takes stage clicks in a capture-phase listener before any tool sees them, and `applySample` ports the reference app's `LevelsSettings.sampling` (all three channels calibrated together, the master range reset, the gray point setting each channel's gamma). A `close` override ends sampling whichever way the panel closes. Removed:

```ts
    node.append(channel.el, canvas, auto.el, black.el, gamma.el, white.el, outB.el, outW.el);
```

### src/ui/panels/adjust-panel.ts · Hue/Saturation bands, eyedroppers, targeted adjustment · _v0.8.0

The Hue/Saturation section gains the reference app's spectrum editor (hues as they are on top, as the adjustment leaves them below through `hueResponse` and `hsvAdjust`, the selected range's four handles between, dragged by nearest circular distance with pointer capture, the degrees beneath), a Sample choice (Sample, Add, Remove) and a Targeted adjustment toggle. Sampling is generalized to named modes with per-row resets so the choices stay exclusive; `sampleHue` reads the hue from the composite (none for near-neutral pixels) and `beginTarget` picks the range that most claims it and drags saturation, or hue with Cmd or Ctrl, half a unit per screen pixel, its window listeners always removed by `stopSampling`. Removed, the Levels-only sampling:

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

## src/ui/panels/background-panel.ts

### src/ui/panels/background-panel.ts · BackgroundPanel · _v0.9.0

the reference app's Remove Background panel: Quality (Basic or Advanced) and, for Advanced, Refine (0 to 40 px, default 12), Contrast (0 to 100 percent, default 25) and Shift Edge (-10 to 10 px). It owns the model's raw mask bitmap while open, targets the layer's pixels, previews the layer with its background hidden through `previewImageEdit` (coalesced to one per frame), and on OK refines at full size and calls `applySubjectMask`. Cancel always clears the preview; settings carry over between uses.

## src/ui/panels/color-picker.ts

### src/ui/panels/color-picker.ts · ColorPickerDialog · _v0.10.0

Ported from the reference app's `ColorPickerSheet.swift`: a saturation and brightness field, a vertical hue strip, new and current swatches, and RGB and hex entry, with HSV as the source of truth so a gray keeps its hue. It opens on the `cv-pick-color` event the rail's swatches send, titled Foreground Color or Background Color. While open, its scrim is click-through and a capture-phase listener samples the composite color under a stage click before any tool sees it. Enter in the hex box commits by blurring it, so a later blur cannot re-apply a stale value over a hue drag. OK sets the color; Cancel and Escape leave it.

### src/ui/panels/color-picker.ts · ColorPickerDialog · drag sampling and ring · _v0.11.0

Canvas sampling follows a drag through capture-phase window listeners, as in the reference app, showing the sample ring against the picker's color from the drag's start; `endSampleDrag` removes the listeners and the ring, and `close` always calls it. Removed from the sampler:

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

## src/ui/panels/jpeg-dialog.ts

### src/ui/panels/jpeg-dialog.ts · JpegDialog · _v0.6.0

Ported from the reference app's `JPEGExportSheet.swift`. Quality starts from the last export, remembered in localStorage under `sonny.jpegQuality`, and from 85% (the reference app's default) the first time; the sheet shows the image size and sRGB and previews the actually encoded JPEG, debounced 120 ms, with its encoded size. The preview canvas keeps one size (432 by 280) with the image fitted inside, so the sheet never changes height, and the preview is decoded with `createImageBitmap` rather than shown through a blob URL, which the desktop CSP may refuse. Export stores the quality and hands it back to the caller.

## src/ui/panels/live-mask-dialog.ts

### src/ui/panels/live-mask-dialog.ts · LiveMaskDialog · _v0.19.0

the reference app's alert for deleting a layer that other layers are clipped to (their live mask), with its wording and buttons: Bake and Delete, Cancel, Remove Links and Delete; `choose` resolves `bake`, `unlink` or null (Cancel and Escape).

## src/ui/panels/size-dialogs.ts

### src/ui/panels/size-dialogs.ts · CanvasSizeDialog, ImageSizeDialog, AmountDialog · _v0.2.0

Canvas Size with the reference app's anchor offset formula and extension fill, Image Size with constrain, resolution and resampling, and the Expand and Contract amount dialog that remembers its amounts.

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

After the tool overlay, draws `engine.sampleRing` with the reference app's `SampleRingOverlay` geometry in screen pixels (radius 43, a 24 px gray ring at 0.45 white, 16 px halves clipped top and bottom: the new color above, the color before the drag below), so it keeps its size at any zoom. Nothing was removed.

### src/ui/stage.ts · Stage · WebKit pinch · _v0.20.0

`gesturestart`, `gesturechange` and `gestureend` listeners zoom about the pointer by the gesture's scale since it began, as the reference app's magnify; Chrome's pinch still arrives as Ctrl+wheel. Nothing was removed.

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

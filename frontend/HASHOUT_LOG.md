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
        renderer.ts  · rendering pipeline
        events.ts  · typed emitter
        geometry.ts  · matrices and rectangles
        history.ts  · undo stack
        index.ts  · Engine API
        kernels.ts  · adjustment and wand kernels
        project.ts  · per-tab project record
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
            brush.ts  · brush and eraser
            eyedropper.ts  · color sampling
            hand.ts  · panning
            index.ts  · built-in tool list
            lasso.ts  · freehand and polygonal lasso
            marquee.ts  · rectangle and ellipse marquee
            move.ts  · move and transform handles
            select-common.ts  · modifier to selection mode
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
- [src/engine/renderer.ts](#srcenginerendererts)
- [src/engine/events.ts](#srcengineeventsts)
- [src/engine/geometry.ts](#srcenginegeometryts)
- [src/engine/history.ts](#srcenginehistoryts)
- [src/engine/index.ts](#srcengineindexts)
- [src/engine/kernels.ts](#srcenginekernelsts)
- [src/engine/project.ts](#srcengineprojectts)
- [src/engine/selection.ts](#srcengineselectionts)
- [src/engine/stroke.ts](#srcenginestrokets)
- [src/engine/surface.ts](#srcenginesurfacets)
- [src/engine/transform.ts](#srcenginetransformts)
- [src/engine/tree.ts](#srcenginetreets)
- [src/engine/types.ts](#srcenginetypests)
- [src/engine/viewport.ts](#srcengineviewportts)
- [src/extensions/registry.ts](#srcextensionsregistryts)
- [src/extensions/tools/brush.ts](#srcextensionstoolsbrushts)
- [src/extensions/tools/eyedropper.ts](#srcextensionstoolseyedropperts)
- [src/extensions/tools/hand.ts](#srcextensionstoolshandts)
- [src/extensions/tools/index.ts](#srcextensionstoolsindexts)
- [src/extensions/tools/lasso.ts](#srcextensionstoolslassots)
- [src/extensions/tools/marquee.ts](#srcextensionstoolsmarqueets)
- [src/extensions/tools/move.ts](#srcextensionstoolsmovets)
- [src/extensions/tools/select-common.ts](#srcextensionstoolsselect-commonts)
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

## src/engine/renderer.ts

### src/engine/renderer.ts · rendering pipeline · _v0.1.0

Created in _v0.1.0.

## src/engine/events.ts

### src/engine/events.ts · typed emitter · _v0.1.0

Created in _v0.1.0.

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

## src/engine/kernels.ts

### src/engine/kernels.ts · adjustment and wand kernels · _v0.1.0

Created in _v0.1.0.

## src/engine/project.ts

### src/engine/project.ts · per-tab project record · _v0.1.0

Created in _v0.1.0.

## src/engine/selection.ts

### src/engine/selection.ts · selection masks, outline tracer · _v0.1.0

Created in _v0.1.0.

## src/engine/stroke.ts

### src/engine/stroke.ts · brush stroke engine · _v0.1.0

Created in _v0.1.0.

## src/engine/surface.ts

### src/engine/surface.ts · canvases and rasters · _v0.1.0

Created in _v0.1.0.

## src/engine/transform.ts

### src/engine/transform.ts · handles and drag math · _v0.1.0

Created in _v0.1.0.

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

## src/extensions/tools/brush.ts

### src/extensions/tools/brush.ts · brush and eraser · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/eyedropper.ts

### src/extensions/tools/eyedropper.ts · color sampling · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/hand.ts

### src/extensions/tools/hand.ts · panning · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/index.ts

### src/extensions/tools/index.ts · built-in tool list · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/lasso.ts

### src/extensions/tools/lasso.ts · freehand and polygonal lasso · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/marquee.ts

### src/extensions/tools/marquee.ts · rectangle and ellipse marquee · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/move.ts

### src/extensions/tools/move.ts · move and transform handles · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/select-common.ts

### src/extensions/tools/select-common.ts · modifier to selection mode · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/wand.ts

### src/extensions/tools/wand.ts · magic wand · _v0.1.0

Created in _v0.1.0.

## src/extensions/tools/zoom.ts

### src/extensions/tools/zoom.ts · zoom tool · _v0.1.0

Created in _v0.1.0.

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

## src/ui/palette.ts

### src/ui/palette.ts · stage colors from tokens · _v0.1.0

Created in _v0.1.0.

## src/ui/rail.ts

### src/ui/rail.ts · tool rail and colors · _v0.1.0

Created in _v0.1.0.

## src/ui/stage.ts

### src/ui/stage.ts · Stage.resize · _v0.1.0

Renders synchronously inside the ResizeObserver callback so a resize never shows a blank canvas. At 200 percent and above the visible document region is composited at 1:1 and scaled with smoothing off, for a true pixel view.

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

# FormVis demo

An offline demo of the FormVis layered image editor that runs in a browser with no backend, no Tauri shell, no network and no CDN.

## Open it

- Double-click `demo/index.html` (it works from `file://`), or
- serve the folder with any static server, for example `python3 -m http.server --directory demo 8000`.

Every script, style, font and photograph is local to this folder.

## What it shows

The window uses FormVis's own design tokens, stylesheets, inline icon set and layout: menu bar, document tab, tool rail, options bar, canvas, Properties, Histogram and Layers panels, status bar.

The picture work is done by the application's engine modules, bundled from `frontend/src/engine`:

- 31 blend modes per layer (`blend.ts`), with opacity and visibility, and layer reordering by drag.
- Non-destructive adjustment layers built from the engine kernels (`kernels.ts`, `adjust.ts`, `adjust-params.ts`): Levels, Exposure, Hue/Saturation, Gradient Map, Brightness/Contrast, Vibrance, Colour Balance, Black and White, Photo Filter, Channel Mixer, Shadows and Highlights, Split Toning, Clarity, Dehaze, Glow, Posterize, Threshold, Invert. Their sliders are generated from the engine's own parameter specs.
- Auto Tone, Auto Contrast and Auto Color, which read the engine histogram and add a Levels layer.
- Filters on the active pixel layer with live preview (`filters.ts`): Gaussian Blur, Motion Blur, Unsharp Mask, Add Noise; plus Desaturate, Equalize and Invert.
- Image menu: flip, rotate 90 or 180, image size with proportions.
- Brush, Eraser, Move, Eyedropper, Hand and Zoom tools, with Space to pan and the wheel to zoom.
- Layer masks (add reveal-all or hide-all, invert, delete; click the mask thumbnail and paint with the Brush to reveal or the Eraser to hide) and text layers (Layer > New text layer; font, weight, size, tracking and colour in Properties).
- A Photos tab beside Properties with six more photographs to open as a document or place as a layer.
- Undo and redo of every edit, with the title-bar buttons enabled as soon as there is something to undo.
- Open or drop your own PNG, JPEG, WebP, GIF, BMP, AVIF, TIFF or layered PSD (layers, blend modes, opacity and visibility are kept). Shift-drop, or File > Place, adds an image as a layer.
- Export PNG, JPEG, WebP or a layered PSD, with the encoded size shown before saving.

With no file the demo opens "Above the Clouds", a finished 1080 by 1350 poster: a sunset sky replacing the original sky of a misty mountain photograph (a layer mask), a hot-air balloon cut out of its background (a second mask), a flock of birds blended with Multiply, a mist layer blended with Screen through a gradient mask, four adjustment layers that grade the whole picture, and four text layers. Pexels photographs, credited in `CREDITS.md`, ship as JavaScript data packs in `assets/media/` that the page loads on demand; while they decode the canvas shows a loading state at the final size. File > Sample also offers the generated "Harbour at dusk" document (`src/sample.ts`), which is also what opens if a media pack cannot be loaded.

## Not in the demo

Selections, paths, vector type tools, layer styles, smart objects, the Python engine, local models, camera RAW, GPU drawing and the MCP server belong to the desktop and engine build. The WebAssembly kernels are replaced by their TypeScript twins (`src/shim/wasm-kernels.ts`) because `file://` cannot fetch `.wasm`; results are the same bytes.

## Rebuild

The built files in this folder are committed. To rebuild after changing `demo/src`:

```sh
cd frontend
npm ci
npm run demo
```

`npm run demo` runs `vite build --config vite.demo.config.ts`, which reads `demo/src`, writes `demo/index.html` and `demo/assets/`, and emits a classic (non-module) script so the page opens from `file://`. For a dev server use `npx vite --config vite.demo.config.ts` (http://localhost:5191, bound to localhost only). `npx tsc --noEmit -p ../demo` type-checks the demo.

## Licences

The bundle contains the app's own code, Inter and JetBrains Mono (OFL 1.1, via @fontsource), ag-psd (MIT) and utif2 (MIT). All three are already in `frontend/package-lock.json` and `NOTICE.md`. The photographs are under the Pexels License and are credited one by one in `CREDITS.md`. PSD export bakes each mask into its layer's pixels.

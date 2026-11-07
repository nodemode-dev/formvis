# FormVis demo

An offline demo of the FormVis layered image editor that runs in a browser with no backend, no Tauri shell, no network and no CDN.

## Open it

- Double-click `demo/index.html` (it works from `file://`), or
- serve the folder with any static server, for example `python3 -m http.server --directory demo 8000`.

Every script, style, font and the sample picture is local to this folder.

## What it shows

The window uses FormVis's own design tokens, stylesheets, inline icon set and layout: menu bar, document tab, tool rail, options bar, canvas, Properties, Histogram and Layers panels, status bar.

The picture work is done by the application's engine modules, bundled from `frontend/src/engine`:

- 31 blend modes per layer (`blend.ts`), with opacity and visibility, and layer reordering by drag.
- Non-destructive adjustment layers built from the engine kernels (`kernels.ts`, `adjust.ts`, `adjust-params.ts`): Levels, Exposure, Hue/Saturation, Gradient Map, Brightness/Contrast, Vibrance, Colour Balance, Black and White, Photo Filter, Channel Mixer, Shadows and Highlights, Split Toning, Clarity, Dehaze, Glow, Posterize, Threshold, Invert. Their sliders are generated from the engine's own parameter specs.
- Auto Tone, Auto Contrast and Auto Color, which read the engine histogram and add a Levels layer.
- Filters on the active pixel layer with live preview (`filters.ts`): Gaussian Blur, Motion Blur, Unsharp Mask, Add Noise; plus Desaturate, Equalize and Invert.
- Image menu: flip, rotate 90 or 180, image size with proportions.
- Brush, Eraser, Move, Eyedropper, Hand and Zoom tools, with Space to pan and the wheel to zoom.
- Undo and redo of every edit.
- Open or drop your own PNG, JPEG, WebP, GIF, BMP, AVIF, TIFF or layered PSD (layers, blend modes, opacity and visibility are kept). Shift-drop, or File > Place, adds an image as a layer.
- Export PNG, JPEG, WebP or a layered PSD, with the encoded size shown before saving.

With no file the demo opens a procedurally generated document, "Harbour at dusk", made of nine pixel layers (several with blend modes) and two adjustment layers. It is drawn by code in `src/sample.ts`; no third-party media is included.

## Not in the demo

Selections, masks, paths, type, layer styles, smart objects, the Python engine, local models, camera RAW, GPU drawing and the MCP server belong to the desktop and engine build. The WebAssembly kernels are replaced by their TypeScript twins (`src/shim/wasm-kernels.ts`) because `file://` cannot fetch `.wasm`; results are the same bytes.

## Rebuild

The built files in this folder are committed. To rebuild after changing `demo/src`:

```sh
cd frontend
npm ci
npm run demo
```

`npm run demo` runs `vite build --config vite.demo.config.ts`, which reads `demo/src`, writes `demo/index.html` and `demo/assets/`, and emits a classic (non-module) script so the page opens from `file://`. For a dev server use `npx vite --config vite.demo.config.ts` (http://localhost:5191, bound to localhost only). `npx tsc --noEmit -p ../demo` type-checks the demo.

## Licences

The bundle contains the app's own code, Inter and JetBrains Mono (OFL 1.1, via @fontsource), ag-psd (MIT) and utif2 (MIT). All three are already in `frontend/package-lock.json` and `NOTICE.md`.

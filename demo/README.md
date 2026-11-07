# FormVis demo

An offline demo of the FormVis layered image editor that runs in a browser with no backend, no Tauri shell, no network and no CDN.

## Open it

- Double-click `demo/index.html` (it works from `file://`), or
- serve the folder with any static server, for example `python3 -m http.server --directory demo 8000`.

Every script, style, font and photograph is local to this folder.

## What it shows

The page is the real FormVis window, not a look-alike. `frontend/index.html` and the application's own entry (`frontend/src/main.ts`, then `app.ts` and every module under `ui/`, `extensions/` and `engine/`) are bundled as they are: the menu bar with "formvis 2026", the Essentials workspace picker, document tabs, the tool-options bar, the tool rail, the Properties column, the right dock (Navigator, Swatches and Color, Layers, Channels and Paths, Brushes and Brush Settings), the floating task bar, the status bar and every dialog. The stylesheets, tokens, icons and themes are the application's. Whatever the desktop build does in the page, the demo does: the Brush with the real brush engine (pressure taper, spacing, dynamics, the built-in brush presets), the Eraser, Move, Eyedropper, Gradient, Type and the other tools, layers with 31 blend modes, masks, adjustment layers and their dialogs, filters with live preview, selections, transforms, the Navigator, Swatches, undo and redo with the History states, and exports through the real Export dialog.

The page opens on a painting and photo-editing session, "dawn-over-the-range": a landscape Pexels photograph at Fit zoom on the dotted pasteboard, the Brush tool active with its options bar and the Brushes panel in the dock, and a layer stack that tells a working story. From the bottom: the night photograph, a Curves layer, "Valley mist" (a photograph blended with Screen through a gradient layer mask), a Dodge and Burn layer (Soft Light, painted white and black with the soft airbrush), "Painted light" (Screen, orange light stroked along the ridges with tapering pressure, an eraser pass, and two tapered streaks), a Levels layer, a Photo Filter grade and two type layers. The Levels Layer dialog is open the way the application opens it for a new adjustment layer, and the floating task bar is showing. Every stroke was made through the engine's own `beginStroke`, `strokeTo` and `endStroke` with a pressure curve, so Undo steps through them one by one.

Beside it, as a second document tab, is "above-the-clouds", the finished 1080 by 1350 poster: a sunset sky replacing the sky of a misty mountain photograph (a layer mask), a hot-air balloon cut out of its background (a second mask), a flock of birds blended with Multiply, a mist layer blended with Screen through a gradient mask, four adjustment layers that grade the whole picture (Photo Filter, Colour Balance, Vibrance, Levels) and four live type layers. Five more photographs open as further tabs. The Pexels photographs, credited in `CREDITS.md`, ship as JavaScript data packs in `assets/media/` that the page decodes before it is shown, so nothing paints until the session is ready.

## What stands in for the engine

The desktop build has a Python engine, a Tauri shell, workers and WebAssembly. In a page opened from `file://`:

- `src/shim/api.ts` answers every `/api` request inside the page: `/capabilities` says the engine is the page itself (the status bar reads "Engine 2.0.1"), lists answer empty, and anything else answers with the application's own message that it needs the desktop engine (library saves, camera raw, colour conversion, local models, video, terminal and agents). Sockets to the engine close quietly.
- Workers are inlined as Blob workers by the `formvis-demo-inline-workers` plugin in `frontend/vite.demo.config.ts`, because Chrome refuses module workers from `file://`.
- The WebAssembly kernels are replaced by their TypeScript twins (`src/shim/wasm-kernels.ts`, also for the workers) because `file://` cannot fetch `.wasm`; results are the same bytes.
- `src/shim/spots.ts` seeds where the Levels Layer dialog opens, so the picture stays visible.
- `src/session.ts` waits for the window, then builds both documents through the real engine (`insertRasterLayer`, `addAdjustmentLayer`, `addDodgeBurnLayer`, `createTextLayer`, `beginStroke`) while the page is held back by `html[data-demo]`, and reveals it once, complete.

Menu items the page cannot do stay in the menus and answer as they do in the app when the engine is missing.

## Rebuild

The built files in this folder are committed. To rebuild after changing `demo/src`:

```sh
cd frontend
npm ci
npm run demo
```

`npm run demo` runs `vite build --config vite.demo.config.ts`, which bundles `frontend/index.html` with the entry `demo/src/main.ts` (the shims, then the application's own `main.ts`, then the session), writes `demo/index.html` and `demo/assets/`, and emits a classic (non-module) script so the page opens from `file://`. For a dev server use `npx vite --config vite.demo.config.ts` (http://localhost:5191, bound to localhost only). `npx tsc --noEmit -p ../demo` type-checks the demo.

## Licences

The bundle contains the app's own code, Inter and JetBrains Mono (OFL 1.1, via @fontsource), ag-psd (MIT) and utif2 (MIT). All three are already in `frontend/package-lock.json` and `NOTICE.md`. The photographs are under the Pexels License and are credited one by one in `CREDITS.md`. PSD export bakes each mask into its layer's pixels.

# FormVis demo 3: type and design

An offline demo of FormVis as a design tool. It is the real FormVis window (the same entry, stylesheets, icons, panels and dialogs as the application, as in `demo/`) open on a social and event kit made in it.

## Open it

- Double-click `demos/design/index.html` (it works from `file://`), or
- serve the folder with any static server, for example `python3 -m http.server --directory demos/design 8000`.

Nothing is fetched from the network: scripts, styles, fonts and photographs are local files.

## What it shows

The document "lantern-night-kit" holds three artboards of different sizes for one invented event, "Lantern Night" at Harbour Square:

- Post 1080 by 1350 (portrait feed post),
- Story 1080 by 1920,
- Cover 1920 by 1080.

On each: a Pexels photograph placed as a smart object with Smart Filters (the Filter Gallery with Diffuse Glow and Film Grain as editable effect layers), gradient shade shapes, live type layers in Bebas Neue, Playfair Display and Montserrat, rounded-rectangle and pill shape layers with fill, gradient and stroke, and layer styles (gradient overlay, outer glow and drop shadow on the titles, drop shadow and inner glow on the buttons). The page opens on the Post artboard with the Type tool active and the title selected, so the Properties panel shows its Transform and the options bar the type controls.

What works, because it is the application's own code:

- Type: click a title and retype it (undo restores it), change font, size, tracking, colour and alignment in the options bar and Properties.
- Layer styles: Layer > Layer Style, the Styles panel and the `fx` button in Layers.
- Smart Filters: select a photograph and open Layer > Smart Filters, or Filter > Filter Gallery and any gallery effect; each filter can be hidden, reordered or changed without touching the photograph.
- Artboards: Layer > New > Artboard, resizing an artboard, File > Export > Export Artboards to Files (a zip of one PNG per artboard) and Artboards to PDF.
- Export As (Alt+Shift+Ctrl+W): PNG, JPEG and WebP are encoded in the page by the browser; TIFF, BMP, TGA, QOI, ICO, PNM and PDF are written by small encoders in `src/shim/encode.ts` that stand in for the desktop engine's `/io/encode`. AVIF, CMYK, 16-bit and the other formats answer with the application's own "needs the desktop engine" message.
- File > Export > PSD: a layered PSD with three artboards, live type, shape layers, layer styles and smart objects (read back and checked with ag-psd).
- Open your own picture or drop one on the window as in the application.

## What stands in for the engine

As in `demo/`: `src/shim/api.ts` answers `/api` requests inside the page (plus the encoders above), workers are inlined as Blob workers, and the WebAssembly kernels are replaced by their TypeScript twins (imported from `../../demo/src/shim/wasm-kernels.ts`). `src/session.ts` builds the document through the engine's public methods while `html[data-demo]` keeps the window hidden, then reveals it once, complete.

## Rebuild

The built files are committed. After changing `src/`:

```sh
cd demos/design
node ../../frontend/node_modules/vite/bin/vite.js build --config ./vite.config.mjs
node ../../frontend/node_modules/typescript/bin/tsc --noEmit -p .
```

The config's root is `src`, its output folder is this folder, and it never empties it. `src/index.html` is a stub: the config's `formvis-design-page` plugin swaps in `frontend/index.html` (the real window) the way `frontend/vite.demo.config.ts` does for `demo/`.

## Files

`index.html`, `assets/` (built output and the photograph packs in `assets/media/`), `fonts/` (the three type families, read by the application's own font loader), `src/`, `vite.config.mjs`, `tsconfig.json`, `HASHOUT_LOG.md`, `CREDITS.md`.

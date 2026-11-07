# FormVis demo 2: selections and retouching

An offline demo of FormVis as a retouching tool. It is the real FormVis window (the same entry, stylesheets, icons, panels and dialogs as the application, as in `demo/`) open on a portrait that was retouched in it.

## Open it

- Double-click `demos/retouch/index.html` (it works from `file://`), or
- serve the folder with any static server, for example `python3 -m http.server --directory demos/retouch 8000`.

Nothing is fetched from the network: scripts, styles, fonts and photographs are local files. Opening takes a few seconds while the session is built behind a quiet start line; the window then appears once, complete.

## What it shows

Tab 1, "golden-portrait", is a Pexels photograph of a golden retriever retouched through the engine:

- Spot Healing removed the tear stain, a mark by the nose and a spot on the chin (own layer),
- Clone Stamp painted out a bright bokeh blob (own layer),
- Selection-Aware Fill filled a second blob from its surroundings (own layer),
- a subject selection was built with Color Range (reds and skin tones), kept inside an outline, refined with Select and Mask and saved as the alpha channel "Subject",
- from that selection came the layer mask of a Gaussian Blur layer ("Background blur", the selection grown, feathered and inverted) and of a Vibrance layer ("Subject pop").

A snapshot "Opening state" was taken before any edit, so Edit > Compare with Snapshot (Split) shows the original beside the retouched picture, and the backslash key peeks at it.

Tab 2, "golden-chain", is untouched, with a selection already around a chain across the frame; the task bar's Remove button (Selection-Aware Fill) takes it out in a few seconds.

What works, because it is the application's own code:

- Selections: Color Range, Focus Area, Quick Selection, Selection Brush, Lasso tools, Quick Mask (Q) and Select and Mask (view modes, Smart Radius, Smooth, Feather, Contrast, Shift Edge, output to selection or layer mask), Save Selection, Modify and Grow.
- Retouching: Spot Healing, Healing Brush, Patch, Clone Stamp and Selection-Aware Fill (its sampling area is a preference only, as the repository's rules define it).
- Layer masks from selections, adjustment and filter layers behind them, History with undo and redo, snapshots and Compare.
- Open your own picture, or drop one on the window, and export PNG, JPEG, WebP or a layered PSD.

## What stands in for the engine

As in `demo/`: `src/shim/api.ts` of demo 1 answers `/api` requests inside the page, workers are inlined as Blob workers and the WebAssembly kernels are replaced by their TypeScript twins (all imported by path from `../../demo/src/shim`, read only). Select Subject, Remove Background and the other tools that need a local model or the desktop engine stay in the interface and answer with the application's own "needs the desktop engine" message; no stand-in was built, and Color Range, Focus Area, Quick Selection and Select and Mask do the work in the page instead. `src/session.ts` builds both documents through the engine's public methods while `html[data-demo]` keeps the window hidden, then reveals it once.

## Rebuild

The built files are committed. After changing `src/`:

```sh
cd demos/retouch
node ../../frontend/node_modules/vite/bin/vite.js build --config ./vite.config.mjs
node ../../frontend/node_modules/typescript/bin/tsc --noEmit -p .
```

The config's root and output folder are this folder, and it never empties it. The `formvis-retouch-page` plugin swaps in `frontend/index.html` (the real window) the way `frontend/vite.demo.config.ts` does for `demo/`.

## Files

`index.html`, `assets/` (built output and the photograph packs in `assets/media/`), `src/`, `vite.config.mjs`, `tsconfig.json`, `HASHOUT_LOG.md`, `CREDITS.md`.

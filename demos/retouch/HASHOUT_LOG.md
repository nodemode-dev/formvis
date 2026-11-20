# HASHOUT_LOG: demos/retouch

## Built again from today's source, and Home's demo cards work from file:// · after 2.7.0, unreleased (src/pages.ts, src/main.ts, vite.config.mjs windowPage, index.html, assets/retouch.js, assets/retouch.css)

- Kind: build and fix · logged 2026-11-20 · WAVE10 items 1 and 2. The bundle was 2.3.5's: nothing rebuilt it since. `npm run demos` in `frontend` (new script, the same command as the Rebuild section) builds it from the tip.
- `windowPage`: the app page's stylesheet links under `/src/` are pointed at `../../frontend/src/` (it was only `/src/styles/`); the app page gained the panel's `/src/dock/dock.css` after 2.3.5, which the built page asked for at `file:///src/dock/dock.css`. The panel's files are read, not changed.
- `pages.ts`: `installPacks('retouch', '../../')` (demo/HASHOUT_LOG.md), so Home's covers come from the packs and the Retouch card builds in place, the others open their pages.
- Seen: headless Chromium from `file://`: starts, both documents built, Home's three covers drawn, the Retouch card adds its two documents (2 to 4), the Design card opens `demos/design/index.html`; console: no error, no failed request.

## A window that does not start in time is shown, not left behind the start line · _v2.3.4 (demos/retouch/src/session.ts)

- Kind: fix · logged: v2.3.4 · 2026-11-11 · refers to `demos/retouch/src/session.ts` `openSession`.
- Why: review formvis__extensions-gpu-config F9 (fixer X1). `ready()` was awaited before the `try`, so a timeout or a failed start left `html[data-demo]` in place and the page on its start line forever.
- Change: `const e = await ready();` moved inside the `try`, so the `finally` always reveals the window (`addLinks` still runs only after a build). The bundle is rebuilt at release.
- Verified: `tsc --noEmit -p demos/retouch/tsconfig.json`, clean. Not run: the page with a forced timeout.

## Why the real window

Demo 1 runs the whole FormVis window and the owner approved that. This demo does the same: the application's entry is bundled and the page imports demo 1's shim (`/api` answers, TypeScript kernels) by path, read only. Nothing in `demo/` or `frontend/` changes.

## Why a session built through the engine

Every retouching layer is made by the engine's own calls (`beginRetouchStroke`, `strokeTo`, `contentAwareFillWith`, `selectColorRange`, `refineSelection`, `saveSelection`, `addMask`), so History, Layers, Channels and Compare hold genuine state and Undo steps through it. The window stays hidden under `html[data-demo]` while this runs and is revealed once, so nothing flashes or rebuilds.

## Why these two photographs

One portrait with natural flaws (a tear stain, a mark, bokeh blobs) gives the healing tools visible work; one with a chain across the frame gives a clean Remove. Dogs carry no identifiable person, brand or logo, which the media rules require.

## Why no Select Subject

Select Subject and Remove Background need a model the page does not have. A pre-baked mask would pass a stored file off as the engine, so they stay in the interface and answer with the application's own message. Color Range with an outline and Select and Mask make the subject selection for real.

## The blur halo

A masked Gaussian Blur whose mask hugs the subject exposes blurred bright fur outside it, which reads as a white glow. The mask is grown by 40 px and feathered by 22 px so the blur only shows well away from the fur.

## Links

The three-demo row sits in the title bar with the same classes and placement as demo 3 so the rows look the same across demos.

## Declined features

No sampling-area mask, no seam carving, no face mesh (CLAUDE.md). The fill's defaults (`FILL_DEFAULTS`) are used unchanged.

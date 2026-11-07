# HASHOUT_LOG: demos/retouch

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

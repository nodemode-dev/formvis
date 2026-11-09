# Demo credits: selections and retouching

Both pictures come from Pexels. Each source page was opened and read before the file was used; each page labels the photograph "Free" and links the Pexels License (https://www.pexels.com/license/), which allows free use and modification without attribution. Credit is given anyway. Neither picture shows a person, a brand or a logo.

The photographs ship as JavaScript data packs in `assets/media/` (so the page opens from `file://` and the engine can read the pixels). Originals were downloaded with curl from images.pexels.com and re-encoded with Pillow; nothing was upscaled.

The app opens this demo from Home > Demos and Help > Demos. Its copy of the same two photographs is in `frontend/public/demos/retouch/`, the packs' bytes written out unchanged by `scripts/demo-media.py`, so the credits below cover them too.

| File in the demo | Title | Photographer | Source page | Licence as stated on the page | What was changed |
| --- | --- | --- | --- | --- | --- |
| `assets/media/golden-portrait.js` | Golden Retriever Portrait in Natural Light | Masood Aslami | https://www.pexels.com/photo/golden-retriever-portrait-in-natural-light-30810888/ | Free, Pexels License | Scaled from 6401 by 4267 px to 1600 by 1067 px, re-encoded as JPEG |
| `assets/media/golden-chain.js` | Golden Retriever Dog Outdoors Portrait | Rajesh S Balouria | https://www.pexels.com/photo/golden-retriever-dog-outdoors-portrait-40009093/ | Free, Pexels License | Scaled from 5492 by 4000 px to 1600 by 1165 px, re-encoded as JPEG |

## Fonts

The window uses Inter and JetBrains Mono (SIL OFL 1.1, via @fontsource, already listed in `NOTICE.md`), bundled into `assets/`.

## Not third-party

Every retouching layer, selection, mask and adjustment in the opening session was made in the page by the application's own engine (Spot Healing, Clone Stamp, Selection-Aware Fill, Color Range, Select and Mask, a Gaussian Blur and a Vibrance layer behind layer masks made from a saved selection). The two outlines in `src/outlines.ts` are hand-placed polygons for this demo.

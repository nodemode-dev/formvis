# Demo credits: type and design

Every picture comes from Pexels. Each source page was opened and read before the file was downloaded; each page labels the photograph "Free" or "Free to use" and links the Pexels License (https://www.pexels.com/license/), which allows free use and modification without attribution. Credit is given anyway.

The photographs ship as JavaScript data packs in `assets/media/` (so the page opens from `file://` and the engine can read the pixels). Originals were downloaded with curl from images.pexels.com and re-encoded with Pillow; nothing was upscaled.

The app opens this demo from Home > Demos and Help > Demos. Its copy of the same three photographs is in `frontend/public/demos/design/`, the packs' bytes written out unchanged by `scripts/demo-media.py`, so the credits below cover them too; the type families are the app's own copies in `frontend/public/fonts/`.

| File in the demo | Title | Photographer | Source page | Licence as stated on the page | What was changed |
| --- | --- | --- | --- | --- | --- |
| `assets/media/lanterns.js` | Lighted Paper Lanterns in Various Colors Hanging in the Dark | Vladimir Sladek | https://www.pexels.com/photo/lighted-paper-lanterns-in-various-colors-hanging-in-the-dark-10059347/ | Free, Pexels License | Scaled from 6016 by 4016 px to 1500 by 1001 px, JPEG quality 86; placed in the document at 1160 px wide as a smart object |
| `assets/media/tree.js` | Illuminated Paper Lanterns Hanging on Tree Branches at Night | ym z | https://www.pexels.com/photo/illuminated-paper-lanterns-hanging-on-tree-branches-at-night-31367353/ | Free to use, Pexels License | Centre 4644 by 8256 px cropped to 9:16 and scaled to 1080 by 1920 px, JPEG quality 84 |
| `assets/media/bokeh.js` | Yellow String Lights in Bokeh Photography | Anatolii Kiriak | https://www.pexels.com/photo/yellow-string-lights-in-bokeh-photography-722432/ | Free to use, Pexels License | A 2832 by 1593 px band cropped and scaled to 1920 by 1080 px, JPEG quality 84 |

## Fonts

The three families the type layers use are the application's own bundled, SIL OFL 1.1 licensed files from `frontend/public/fonts/` (already listed in `NOTICE.md`), copied unchanged with their licence texts into `fonts/`: Bebas Neue, Playfair Display and Montserrat. Inter and JetBrains Mono, used by the window, come in through the application's stylesheets (OFL 1.1, via @fontsource).

## Not third-party

The event ("Lantern Night", Harbour Square, the dates and times) is invented for this demo. All type, shapes, gradients, layer styles and smart filters were made in the page with the application's engine.

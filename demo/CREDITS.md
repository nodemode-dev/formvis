# Demo media credits

Every picture in the demo comes from Pexels. Each source page was opened and read before the file was downloaded; each page labels the photo "Free" (or "Free to use") and links the Pexels License (https://www.pexels.com/license/), which states that the photos can be downloaded and used for free, that attribution is not required, and that they can be modified. Credit is given anyway.

Nothing else in the demo is third-party media. The fonts (Inter, JetBrains Mono) are listed in `NOTICE.md`. The masks listed below, the gradient mask and all text on the poster were made for this demo.

The photos ship as JavaScript data packs in `demo/assets/media/` (so the page opens from `file://` and the pixels can be read). Originals were downloaded with curl from images.pexels.com and re-encoded with Pillow; nothing was upscaled.

## The poster "Above the Clouds"

| File in the demo | Title | Photographer | Source page | Licence as stated on the page | What was changed |
| --- | --- | --- | --- | --- | --- |
| `assets/media/sky.js` | Orange and Blue Cloudy Sky during Sunset | Edgar Rodrigo | https://www.pexels.com/photo/orange-and-blue-cloudy-sky-during-sunset-13515706/ | Free, Pexels License | Scaled to 1080 px wide, top 1350 px kept, JPEG quality 86 |
| `assets/media/mountains.js` | Silhouette of Mountains Under the Blue Sky | Matteo Milan | https://www.pexels.com/photo/silhouette-of-mountains-under-the-blue-sky-10770234/ | Free, Pexels License | Scaled to 1080 px wide, top 1350 px kept, JPEG quality 88; an alpha mask that removes the original sky was computed with OpenCV and stored as a grey PNG in the same pack |
| `assets/media/balloon.js` | Colorful Hot Air Balloon Against Clear Blue Sky | Gamze | https://www.pexels.com/photo/colorful-hot-air-balloon-against-clear-blue-sky-32616907/ | Free, Pexels License | Cropped to the balloon, scaled to 30 percent (423 by 471 px), JPEG quality 90; the cut-out mask was computed with OpenCV GrabCut, holes filled and edge feathered, stored as a grey PNG in the same pack |
| `assets/media/birds.js` | Flock of birds flying in white sky | Skyler Ewing | https://www.pexels.com/photo/flock-of-birds-flying-in-white-sky-4598338/ | Free to use, Pexels License | A 3600 by 2100 px region scaled to 1080 by 630 px, JPEG quality 84 (used with the Multiply blend mode) |
| `assets/media/mist.js` | Fog in the Forest in Black and White | Yetkin Agac | https://www.pexels.com/photo/fog-in-the-forest-in-black-and-white-17941592/ | Free, Pexels License | Rows 1300 to 3000 kept and scaled to 1080 px wide, JPEG quality 84; a soft vertical gradient mask was generated for it (used with the Screen blend mode) |

## The session photograph and the photo tabs

`tray-night` is the photograph the opening painting session is built on ("dawn-over-the-range"); the same pack's mist from the poster (`mist.js`) is its masked "Valley mist" layer. The other five open as their own document tabs.

| File in the demo | Title | Photographer | Source page | Licence as stated on the page | What was changed |
| --- | --- | --- | --- | --- | --- |
| `assets/media/tray-lake.js` | Starting Point - Oeschinensee Lake Hike | Nanda Gopal Lakshman | https://www.pexels.com/photo/starting-point-oeschinensee-lake-hike-27667695/ | Free, Pexels License | Scaled to 1600 px on the long side, JPEG quality 82 |
| `assets/media/tray-night.js` | Mountain Range against the Starry Sky at Dawn | Uzair Ansari | https://www.pexels.com/photo/mountain-range-against-the-starry-sky-at-dawn-14696300/ | Free, Pexels License | Same as above |
| `assets/media/tray-larch.js` | Autumn Larches in North Cascades National Park | Alex Moliski | https://www.pexels.com/photo/autumn-larches-in-north-cascades-national-park-28997992/ | Free, Pexels License | Same as above |
| `assets/media/tray-surf.js` | Ocean Waves Crashing on Rocks | Eduardo Ocampo | https://www.pexels.com/photo/ocean-waves-crashing-on-rocks-12972177/ | Free, Pexels License | Same as above |
| `assets/media/tray-dunes.js` | Serene Desert Dunes at Sunrise | Stephen Leonardi | https://www.pexels.com/photo/serene-desert-dunes-at-sunrise-28638836/ | Free, Pexels License | Same as above |
| `assets/media/tray-glacier.js` | Snowy Mountain | Sergei A | https://www.pexels.com/photo/snowy-mountain-2539429/ | Free, Pexels License | Same as above |

## Pack format

Each pack is one line: `(window.FV_MEDIA = window.FV_MEDIA || {})["name"] = { img: "data:image/jpeg;base64,...", mask: "data:image/png;base64,..." };`. The demo injects the script tag on demand (`src/media.ts`), decodes the data URIs into canvases and turns each grey mask into an alpha channel.

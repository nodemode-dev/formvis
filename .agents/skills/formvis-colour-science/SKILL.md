---
name: formvis-colour-science
description: Answers colour management questions with formvis's own colour service (LittleCMS through Pillow), not from memory. Use when someone asks which rendering intent to use, what a colour becomes in CMYK, whether a colour is inside a print profile's gamut, how sRGB converts to FOGRA39, what a Lab value or an ICC profile contains, how big a delta E is between two colours, or how formvis's Convert to Profile, Proof Colors and Gamut Warning compute their results. Also use before changing backend/app/services/colour.py or routers/colour.py.
---

# formvis-colour-science

formvis does colour management in one place: `backend/app/services/colour.py`, served by `backend/app/routers/colour.py` under `/api/color` on the engine (port 8190). It is LittleCMS reached through Pillow's `ImageCms`. When a question is about what a profile or intent does to a colour, run the service and quote the numbers. Do not guess from rules of thumb.

## Ask the service

Python, from the repo root (needs the backend venv):

```text
cd backend && venv/bin/python
>>> from app.services import colour
>>> colour.profiles()          # [{id, name, space, file, added, shipped}, ...]
>>> colour.default_cmyk()      # the CMYK profile new CMYK documents use
```

HTTP, when the engine is running (`./formvis boot` or `./formvis serve`):

| Route | Use |
| --- | --- |
| `GET /api/color/profiles` | The profiles found on this computer, shipped with formvis, or added |
| `GET /api/color/default-cmyk` | `{"profile": {...}}` or null |
| `GET /api/color/profiles/{id}` | The profile file's bytes |
| `POST /api/color/describe` | Upload a profile file; get `{name, space}` |
| `POST /api/color/profiles` | Upload a profile to add it |
| `POST /api/color/lut` | JSON `source`, `dest`, `proof`, `intent`, `bpc`, `proofIntent`, `gamut`; returns a 33 point RGB table (r slowest, b fastest), plus a gamut flag table when `gamut` is true |
| `POST /api/color/convert-pixels` | Form upload of RGBA or CMYK+alpha pixels with `width`, `height`, `to` (`cmyk` or `rgb`), `profile` (base64 ICC), `source` (base64 ICC, optional), `intent`, `bpc` |
| `POST /api/color/convert-ink` | Form upload converting between ink-based profiles with `preserve_black` |
| `POST /api/color/linear-matrix` | Matrix between two RGB profiles |
| `POST /api/color/cmyk-lut`, `/rgb-cmyk-lut` | 17 point (`GRID4`) CMYK tables |

A profile reference in JSON is `{"id": "a97c3f8e190f3b22"}` (an id from the listing), `{"icc": "BASE64TEXT"}`, or null for sRGB. Over HTTP, `convert-pixels` takes base64 ICC text, not an id: read the bytes from `/api/color/profiles/{id}` and base64 them.

## Facts that hold in this code

- Intents: `perceptual`, `relative`, `saturation`, `absolute`. Default `relative`. Black point compensation (`bpc`) defaults to on.
- The window converts and proofs through a table of `GRID` = 33 points per channel with trilinear interpolation, so it is an approximation of the exact transform. `convert-pixels` is exact per pixel at 8 bits.
- Gamut warning marks a colour out of gamut when the round trip through the proof device moves it by more than `GAMUT_DELTA_E` = 3.0.
- `lut` converts RGB to RGB (documents and displays are RGB). A CMYK profile can be a proof profile there but not a source or destination; use `convert-pixels` or the CMYK tables for CMYK.
- Shipped CMYK profile: FOGRA39L Coated. Pillow's CMYK values are ink amounts 0 to 255, so 247 is about 97 percent.
- Profiles over 4,000,000 bytes are refused (`MAX_BYTES`); `convert-pixels` refuses requests over 8 times that. Only RGB, CMYK, GRAY and LAB profile spaces are accepted.
- Errors are `ColourError`; the router turns them into HTTP 422 with the message.

## Answering common questions

| Question | How to answer |
| --- | --- |
| Which intent? | Say what each does, then show the numbers for the person's colours (recipe 1). Photographs usually take `perceptual` or `relative` with bpc; flat brand colours `relative`; `saturation` is for charts; `absolute` is for proofing paper white |
| What does this RGB become in CMYK? | Recipe 1 |
| Is it in gamut? | Round trip and compare (recipe 2): over 3.0 delta E is out |
| Delta E between two colours | Convert both to Lab and take the distance (recipe 3) |
| What is in this profile? | `colour.describe(bytes)` for name and space; for more, `ImageCms.ImageCmsProfile(...)` fields |

## Recipes

All run from `backend` with `venv/bin/python`. The snippets were run against 1.67.3; rerun them rather than quoting the sample numbers, which depend on the profile and Pillow.

### 1. sRGB to CMYK, and back

```text
from app.services import colour
ref = {"id": colour.default_cmyk()["id"]}
rgba = bytes([255,0,0,255, 20,120,200,255])           # two pixels
cmyk = colour.convert_pixels(rgba, 2, 1, "cmyk", ref, None, "relative", True)
print(list(cmyk))   # 5 bytes a pixel: C M Y K alpha, ink 0..255
back = colour.convert_pixels(cmyk, 2, 1, "rgb", ref, None, "relative", True)
print(list(back))   # RGBA again
```

Sample: pure red becomes C 0, M 247, Y 251, K 0 and returns as about (228, 24, 24). That drop from 255 is the gamut limit of the press, in numbers. Change the intent argument and compare.

### 2. Out of gamut test

Convert to CMYK and back as above; compute the distance between the original and the returned colour in Lab (recipe 3). Above `colour.GAMUT_DELTA_E` the colour is outside the profile's gamut. For a whole picture use `colour.lut(source, dest, proof, intent, bpc, proof_intent, gamut=True)`; the bytes after the first 33 cubed times 3 are the gamut flags (255 where out).

### 3. Delta E

```text
from PIL import Image, ImageCms
srgb = ImageCms.createProfile("sRGB"); lab = ImageCms.createProfile("LAB")
t = ImageCms.buildTransform(srgb, lab, "RGB", "LAB")
def to_lab(rgb):
    L, a, b = ImageCms.applyTransform(Image.new("RGB", (1, 1), rgb), t).getpixel((0, 0))
    return L * 100 / 255, a - 128, b - 128     # PIL stores L 0..255 for 0..100; a and b carry +128
import math
d = lambda p, q: math.dist(to_lab(p), to_lab(q))   # CIE76
```

This is CIE76 and 8 bit precise, so quote it to about one decimal.

### 4. Which profiles exist

`colour.profiles()` lists every profile, shipped (`shipped` true) or added. To add one, `colour.add(data, filename)` or `POST /api/color/profiles`.

## Limits to state honestly

- The service is 8 bit. formvis documents can be 16 or 32 bit, but conversions through these routes are 8 bit.
- Delta E here is CIE76 unless you compute another formula yourself.
- The table path is an approximation; the exact result is `convert-pixels`.
- It cannot judge a printer: say that a profile predicts a press, and that a proof is the only real check.

## Working on the code

For changes to the service, use `formvis-harness` sub-skill `colour-keeper`, which covers where the window calls these routes. This skill is for answering questions with the engine's real output.

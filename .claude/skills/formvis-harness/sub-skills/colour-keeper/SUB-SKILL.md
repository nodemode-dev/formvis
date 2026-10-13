---
name: colour-keeper
description: Colour management code in formvis. Use for document modes (RGB, grayscale, bitmap, indexed, CMYK, Lab), 8, 16 and 32 bit depth, ICC profiles, Assign and Convert to Profile, Proof Colors and Gamut Warning, rendering intent and black point compensation, CMYK inks and the FOGRA39 profile, Lab conversion, the colour lookup tables, embedding a profile on export, and the LittleCMS-backed colour service in backend/app/services/colour.py. For answering a person's colour question without changing code use formvis-colour-science.
---

# colour-keeper

Two halves: the window holds pixels and shows them through lookup tables; the engine service (LittleCMS through Pillow's `ImageCms`) builds those tables and does exact conversions.

## Engine side (`frontend/src/engine/`)

| File | Role |
| --- | --- |
| `types.ts` | `DocMode` (`rgb`, `grayscale`, `bitmap`, `indexed`, `cmyk`, `lab`), `DocProfile { name, icc }` (icc is base64), `Doc.depth` (8, 16, 32), `ChannelPixels { mode, n, width, height, data }` for float pixels |
| `index.ts` | `setDocumentMode`, `convertMode(mode, opts)`, `setDepth(depth, tone)`, `assignProfile`, `convertToProfile(target, lut)`, `convertToProfileLinear(target, matrix)`, `assignCmykProfile`, `convertCmykProfile`, `inMode(c, doc)`, `deriveChannels` (private), `setViewTransform` |
| `colour-lut.ts` | `ColourLut` and `lutFrom`, `applyLut`, `lutOf`; `Lut4` / `lut4From` / `applyLut4` (CMYK ink to RGB); `Lut3x4` / `lut3x4From` / `inkOf` (RGB to ink); `renditionOf`; `GAMUT_GREY` |
| `icc.ts` | Built-in matrix spaces `SPACES` (`srgb`, `display-p3`, `adobe-rgb`), `convertPixels`, `iccProfile(id)` |
| `lab.ts` | `srgbToLab`, `labToSrgb`, `encodeLab`, `decodeLab`, `renderLab`, `labFromRgba` |
| `derive.ts` | `deriveWhole`, `deriveRegion`, `renderRegion`: keep float channels in step with 8 bit rasters |
| `deep.ts`, `compose-float.ts` | 16 and 32 bit pixel maths, `srgbToLinear`, `linearToSrgb`, the float compositor |

How an edit keeps floats right: `Engine.edit` snapshots layers, and when the document is deeper than 8 bit, CMYK or Lab it calls `deriveChannels` after the callback so `layer.channels` follows `layer.raster`. An operation that changes `raster` without a deep path gets rolled back with a notice. 32 bit values are linear and unbounded; `convertToProfileLinear` uses the 3 by 3 matrix from `/api/color/linear-matrix`.

## UI side

- `frontend/src/ui/colour.ts`: `ColourView` (`setup`, `proof`, `gamut`, `refresh`) asks the service for a table and calls `engine.setViewTransform`. The proof setup is remembered in `localStorage` under `formvis.proof`.
- `frontend/src/ui/panels/colour-dialogs.ts`: Assign Profile, Convert to Profile, Proof Setup dialogs. Commands `mode-cmyk`, `mode-lab`, `depth-16`, `depth-32`, `proof-colors`, `gamut-warning` live in `app.ts`.
- `Prefs.profileMismatch` (`convert`, `keep`, `ask`) says what to do when an opened picture's profile differs.
- `frontend/src/io/icc-read.ts` (`embeddedProfile`, `profileName`) reads a profile from a file; `frontend/src/io/embed-icc.ts` (`embedPng`, `embedJpeg`) writes one into an export.
- `frontend/src/ui/panels/color-picker.ts` shows CMYK inks for a CMYK document; typing RGB converts through the service.

## Service side (`backend/app`)

`services/colour.py` and `routers/colour.py`, mounted at `/api/color` in `main.py`. Endpoints: `GET /profiles`, `POST /profiles` (add one), `POST /describe`, `POST /lut`, `POST /convert-ink`, `POST /linear-matrix`, `POST /cmyk-lut`, `POST /rgb-cmyk-lut`, `POST /convert-pixels`, `GET /default-cmyk`, `GET /profiles/[id]`. Grid sizes: `GRID` 33 for RGB tables, `GRID4` 17 for CMYK. Rendering intents: `perceptual`, `relative`, `saturation`, `absolute` (`INTENTS`). Gamut warning flags colours whose round trip through the proof device moves by more than `GAMUT_DELTA_E` 3.0. The shipped CMYK profile is `backend/app/profiles/FOGRA39L_coated.icc`; `default_cmyk()` returns it. Profile folders (`profile_dirs()`): formvis's own `Profiles` folder under the data folder, the shipped folder, `FORMVIS_PROFILE_DIRS`, then the OS folders.

## Rules

- Errors are `ColourError`; routers turn them into 422 with the message. Keep messages plain; they reach the person.
- Nothing drops depth or ink quietly: what is not built at a depth or mode waits in the menu (disabled with a reason) or declines with a notice.
- PNG, JPEG and WebP exports are sRGB 8 bit unless a profile is embedded; 16 bit PNG and TIFF, Radiance HDR, OpenEXR and float TIFF go through `io-formats`.
- A 32 bit document converts only between RGB matrix profiles; table-based RGB profiles are refused by name.
- Tests: `backend/tests/test_colour.py`, `test_deep_io.py`, `frontend/tests/icc.test.ts`, `frontend/src/engine/colour-lut.test.ts`, `e2e/test_colour_management.py`, `test_colour_profiles.py`, `test_color_modes.py`, `test_sixteen_bit.py`.

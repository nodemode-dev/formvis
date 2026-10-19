---
name: io-formats
description: File formats in formvis. Use for reading or writing PSD and PSB, OpenRaster, TIFF (8, 16 bit, float, CMYK, Lab, multi-page), EXR and Radiance HDR, camera raw, HEIC, PNG and JPEG export, the .fmv and .formvis project files, NodeMode canvasor and .comp import, manifest.json fields, the project library endpoints, or a project that fails to open or loses data in a round trip.
---

# io-formats

Decoding and encoding is split: the page does what a browser can (PNG, JPEG, WebP, AVIF, GIF, SVG, PSD, OpenRaster, project zips), and the engine service does the rest (HEIC, TIFF, camera raw, EXR, HDR, CMYK and Lab files, JPEG with a profile). The page reaches the service only through `frontend/src/io/api.ts`.

## Frontend (`frontend/src/io/`)

| File | Role |
| --- | --- |
| `images.ts` | `decodeImage(file, name, raw)`, `IMAGE_ACCEPT`, `PROJECT_ACCEPT`, `RAW_FILE`, `isImageFile`, `isProjectFile`, `LargePictureError` |
| `project-io.ts` | `FORMAT` (`com.nodemode.formvis`), `FORMAT_VERSION` (1), `serialize(doc, activeId, paths, timeline)` and `deserialize(manifest, fetchImage, read)`, `transformRecord`, `transformFrom`, `giantTiles` |
| `psd.ts`, `psd-adjust.ts`, `psd-paths.ts` | `readPsdFile`, `writePsdFile(doc, composite, psb, paths)`, `isPsdFile`; adjustment layers via `toPsdAdjustment` / `fromPsdAdjustment`; paths via `pathRecords`, `pathFromRecords`, `addPathResources`, `readPathResources` |
| `ora.ts` | `writeOra`, `readOraFile`, `isOraFile` |
| `zip.ts`, `gif.ts`, `export-presets.ts` | Zip reading and writing, animated GIF, export presets |
| `icc-read.ts`, `embed-icc.ts` | Reading a profile from a file; embedding one in PNG or JPEG output (see `colour-keeper`) |
| `recovery.ts`, `legacy.ts`, `links.ts` | Session recovery, former-name compatibility, linked smart object files |
| `ui/panels/tiff-pages.ts` | `TiffPagesDialog`: pick a page of a multi-page TIFF |

## Engine service (`backend/app`)

| Route (prefix) | File | Purpose |
| --- | --- | --- |
| `GET /api/health`, `/version`, `/capabilities`, `/compute` | `routers/system.py` | Liveness, version, decoders (`heic`, `tiff`, `raw`, `rawEngine`), background engines |
| `POST /api/io/decode` (`page`), `/pages` | `routers/io.py` | Any image to PNG (HEIC, TIFF, camera raw, EXIF rotation); TIFF page list |
| `POST /api/io/encode` | `routers/io.py` | PNG to JPEG, WebP, TIFF with quality, dpi and an embedded profile |
| `POST /api/io/decode-deep`, `/encode-deep`, `/encode-tiff16` | `routers/io.py` | 16 bit and float: PNG, TIFF, HDR, EXR |
| `POST /api/io/decode-cmyk`, `/encode-cmyk`, `/decode-cmyk-psd`, `/encode-cmyk-psd` | `routers/io.py` | CMYK TIFF, JPEG and PSD |
| `POST /api/io/decode-lab`, `/encode-lab-tiff` | `routers/io.py` | Lab TIFF |
| `POST /api/io/export` | `routers/io.py` | Desktop only: write a file under `~/Formvis/Exports` |
| `GET /api/projects`, `POST /save`, `POST /package`, `GET` and `PUT /folder`, `GET` and `DELETE /library/[name]`, `POST /import`, `GET /session/[sid]/[file]` | `routers/projects.py` | Library list, atomic save, zip for download, library folder, import of zips or folders, serving imported images |
| `/api/large`, `/api/bands`, `/api/undo` | `routers/large.py`, `bands.py`, `undo.py` | Pictures larger than one canvas: reduced view, regions, tiles, banded PNG, undo tile store |
| Decoders | `services/imaging.py` (`decode_to_png`, `encode`, `pages`, `decoders`, `_raw` through rawpy and LibRaw), `services/contained.py` (EXR in a child process) | |
| Project validation | `services/project_format.py` (`validate`, `read_zip`, `read_folder`, `write_zip`, `SUPPORTED`, `COMP_VERSIONS`) | |

Adding an endpoint: put it in the router for its area (prefixes are set in `backend/app/main.py`), validate before touching disk, apply limits from `app/core/config.py` (`MAX_SIDE`, `MAX_LAYERS`), use status codes 400 bad input, 413 too large, 415 undecodable, 422 invalid project or colour request, 501 engine not installed; extend `Capabilities` in `frontend/src/io/api.ts` if the page must know; log it in `backend/HASHOUT_LOG.md`. See `references/engine-service.md`.

## The project format

A project is `manifest.json` plus `images/`. formvis writes `com.nodemode.formvis` version 1, still reads the former `.formvis` identifier (`app/core/legacy.py`), NodeMode canvasor's `com.nodemode.canvasor` version 1, and `.comp` projects at versions 1 to 7 (recognised by their reverse-DNS `.project` id, held to full validation; never written). File extension is `.fmv`; `.formvis` from before 0.90.0 still opens. Field names and value labels are verbatim from the NodeMode format.

- `transform`: `origin` `[x, y]`, `size` `[w, h]`, `rotation` in degrees, `flipX`, `flipY`, `sampling` label (`Nearest`, `Smooth`, `High quality`).
- `blendMode` labels: the PSD order, from `BLEND_MODES` in `frontend/src/engine/types.ts` (`blendFromLabel`, `blendLabel` convert). Never rename a label.
- Masks are grayscale PNGs where white shows; in memory the value sits in the alpha channel.
- `adjustment` and `shape` records survive verbatim, including fields formvis does not use.
- `fillContent` describes a fill layer whose pixels, as drawn, are its `imageFile`; the reader checks and clamps every field (`fillContentFrom` in `engine/fill-layers.ts`) and drops it from a layer without pixels.
- Clipping is `maskSourceID` on disk (`clipId` in memory); folders are `isGroup` with children pointing at them through `parentID`.
- Paths, the video timeline and alpha channels travel in the project; `serialize` takes them as arguments.

## Changing a format

1. Change the writer and the reader on both sides (page `project-io.ts`, service `project_format.py`) in the same commit.
2. A new field is optional on read, so older projects still open.
3. A breaking change bumps `FORMAT_VERSION` and the accepted range in `SUPPORTED`; keep reading every older version.
4. Update `.docs/wiki/Project-Format.md` and add round-trip cases to the sidecar `TEST_PLAN.md`.
5. PSD work: test with layers, folders, masks, clipping, opacity, blend modes, visibility, live adjustment and fill layers and paths; what a PSD cannot hold is reported in the `notes` array the reader and writer return, never dropped silently.
6. Depth and ink are never dropped quietly: if a format cannot hold 16 bit, float or CMYK, say so in a notice or a disabled menu entry.

## Facts that bite

- `pillow-heif` bundles GPL x265 and is excluded from the frozen desktop engine; macOS falls back to `sips`.
- OpenCV's EXR codec stays off in the engine; EXR files go through the child process in `contained.py` with a 60 second limit.
- Imported projects live in temporary session folders for 24 hours.
- `/api/io/export` works only in the desktop app; the web app downloads.
- Tests: `backend/tests/test_api.py`, `test_deep_io.py`, `test_tiff_pages.py`, `test_raw.py`, `test_comp_import.py`; `frontend/tests/psd-adjust.test.ts`, `psd-paths.test.ts`; `e2e/test_psd_adjustments.py`, `test_psd_paths.py`, `test_openraster.py`, `test_tiff_pages.py`, `test_export_formats.py`.

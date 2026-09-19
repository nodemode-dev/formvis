---
name: engine-service
description: The sonny FastAPI engine in backend/app. Use for the decode, export, project library, project import, session asset and remove-background endpoints, HEIC and TIFF decoding with Pillow and pillow-heif, rembg and OpenCV GrabCut, engine configuration and limits, the data folders, or the capabilities the frontend reads.
---

# engine-service

The engine does what a browser cannot and binds to loopback only. The frontend reaches it only through `frontend/src/io/api.ts`.

## Endpoints

| Route | File | Purpose |
| --- | --- | --- |
| `GET /api/health`, `/api/version`, `/api/capabilities` | `app/routers/system.py` | Liveness, version, decoders and background engines |
| `POST /api/io/decode` | `app/routers/io.py` | Any image to PNG (HEIC, TIFF, EXIF rotation) |
| `POST /api/io/export` | `app/routers/io.py` | Desktop only: write a file to `~/Sonny/Exports` |
| `GET /api/projects`, `POST /save`, `POST /package` | `app/routers/projects.py` | Library list, atomic save, zip for download |
| `GET` and `DELETE /api/projects/library/[name]` | `app/routers/projects.py` | Open or delete a library project |
| `POST /api/projects/import`, `GET /session/[sid]/[file]` | `app/routers/projects.py` | Import zips or folders; serve their images |
| `POST /api/ops/remove-background` | `app/routers/ops.py` | Mask PNG from rembg (`ml`) or GrabCut (`lite`) |

## Adding an endpoint

1. Put it in the router for its area and keep the `/api` prefix from `app/main.py`.
2. Validate input before touching disk; apply the limits in `app/core/config.py`.
3. Status codes: 400 bad input, 413 too large, 415 undecodable, 422 invalid project, 501 engine not installed.
4. If the frontend needs to know about it, extend `Capabilities` in `frontend/src/io/api.ts` in the same change.
5. Log it in `backend/HASHOUT_LOG.md` and add the behavior to the sidecar `TEST_PLAN.md`.

## Facts that bite

- `pillow-heif` bundles GPL x265: it is excluded from the frozen desktop engine; macOS falls back to `sips`.
- `SONNY_PORT=0` makes uvicorn pick a free port and print it; the desktop shell reads that line.
- Imported projects live in temporary session folders for 24 hours.

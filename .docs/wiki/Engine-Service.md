# Engine Service

The Python engine does what a browser cannot: decode HEIC and TIFF, keep the project library on disk, import the reference app packages, remove backgrounds, and write exports for the desktop app. It binds to loopback only.

| Source path | What lives there |
| --- | --- |
| `backend/app/main.py` | App assembly, CORS, the static mount for the built frontend |
| `backend/app/core/config.py` | Ports, limits, data folders, `.env` loading |
| `backend/app/routers/system.py` | `/api/health`, `/api/version`, `/api/capabilities` |
| `backend/app/routers/io.py` | `/api/io/decode`, `/api/io/export` |
| `backend/app/routers/projects.py` | Library list, save, package, open, delete, import, session assets |
| `backend/app/routers/ops.py` | `/api/ops/remove-background` |
| `backend/app/services/project_format.py` | Manifest validation, zip and folder reading, zip writing |
| `backend/app/services/background.py` | rembg (ML) and OpenCV GrabCut (lightweight) |
| `backend/app/services/imaging.py`, `sessions.py` | Decoding w/ Pillow and pillow-heif, opened-project sessions |
| `backend/sonny_engine.py` | Frozen sidecar entry, `--selfcheck` |

## Contract

- Validate every manifest against the limits before touching disk; reject what this build cannot read with a clear message.
- Write library files atomically (temporary file, then replace).
- Accept only safe asset names; never build paths from request text without validation.
- Keep `pillow-heif` out of the frozen sidecar (GPL x265 inside); desktop HEIC decoding uses the platform instead.

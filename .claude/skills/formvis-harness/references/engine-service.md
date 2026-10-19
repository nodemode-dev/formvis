# The engine service (backend/app)

The FastAPI engine does what a browser cannot and binds to loopback only. The frontend reaches it only through `frontend/src/io/api.ts`. Carried over from the former `engine-service` sub-skill and brought up to date.

## Routers

Prefixes are set in `backend/app/main.py` unless the router sets its own.

| Prefix | File | Purpose |
| --- | --- | --- |
| `/api` | `routers/system.py` | `GET /health`, `/version`, `/capabilities`, `/compute` |
| `/api/io` | `routers/io.py` | decode, encode, deep and CMYK and Lab file routes, export (see `io-formats`) |
| `/api/projects` | `routers/projects.py` | library list, save, package, folder, import, session files |
| `/api/ops` | `routers/ops.py` | `remove-background` (rembg or GrabCut), `objects`, `select-object` (SAM 2.1) |
| `/api/color` | `routers/colour.py` | profiles and colour lookup tables (see `colour-keeper`) |
| `/api/generative` | `routers/generative.py` | fal providers, local models |
| `/mcp`, `/api/mcp/*` | `routers/mcp.py` | the MCP server and window bridge (see `agent-bridge`) |
| `/api/large`, `/api/bands`, `/api/undo` | `large.py`, `bands.py`, `undo.py` | giant pictures and the undo tile store |
| `/api/video`, `/api/merge`, `/api/remove` | `video.py`, `merge.py`, `remove_find.py` | video render, Photomerge and HDR merge, find and remove |
| own prefixes | `nodemode.py`, `comfyui.py`, `llm.py`, `plugins.py` | Send to NodeMode and ComfyUI, prompt improvement, plugins |

## Adding an endpoint

1. Put it in the router for its area and keep the `/api` prefix from `app/main.py`.
2. Validate input before touching disk; apply the limits in `app/core/config.py`.
3. Status codes: 400 bad input, 413 too large, 415 undecodable, 422 invalid project or colour request, 501 engine not installed.
4. If the frontend needs to know about it, extend `Capabilities` in `frontend/src/io/api.ts` in the same change and add a method on the `api` object.
5. Log it in `backend/HASHOUT_LOG.md` and add the behaviour to the sidecar `TEST_PLAN.md`.

## Facts that bite

- `pillow-heif` bundles GPL x265: it is excluded from the frozen desktop engine; macOS falls back to `sips`.
- `FORMVIS_PORT=0` makes uvicorn pick a free port and print it; the desktop shell reads that line.
- Imported projects live in temporary session folders for 24 hours.
- The engine reads `backend/.env` (never committed; `backend/.env.example` is the template). Variables: `FORMVIS_HOST`, `FORMVIS_PORT`, `FORMVIS_DATA_DIR` (default `~/Formvis`), `FORMVIS_CORS_ORIGINS`, `FORMVIS_REMBG_MODEL`, `FORMVIS_DIST`, `FORMVIS_FREEZE_ML`, `FORMVIS_TARGET`.
- Ports: engine 8190, Vite dev 5190 (strict), preview 5191.
- Run the engine for development with `./formvis backend` or `./formvis boot`; `backend/formvis_engine.py` is the PyInstaller entry, not a dev server.
- Keys and presets for providers are kept by `app/services/secrets.py` and `localgen/durable.py`, which never read a damaged file as empty and save over it.

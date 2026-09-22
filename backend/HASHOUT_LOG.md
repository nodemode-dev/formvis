# backend HASHOUT_LOG

Living log for the engine service side, _v0.1.0. Read the map and the TOC first; entries are anchored by file and symbol, and removed code is quoted in full.

## Export encodings · _v0.75.0 (app/services/imaging.py, app/routers/io.py, tests/test_api.py, logged together)

`imaging.encode` re-encodes the editor's PNG as TIFF (LZW, alpha kept), PDF (one page at the given dpi, flattened on white), WebP or AVIF (quality, alpha kept), refusing other formats and unreadable input with `DecodeError`; `ENCODINGS` maps each to its media type. `POST /api/io/encode` serves it (415 on refusal). `EXPORT_NAME` accepts .webp, .tif, .tiff, .pdf and .avif. Two tests added. Removed from `app/routers/io.py`:

```python
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|sonny)$", re.IGNORECASE)
```

## tests/

### tests/__init__.py, conftest.py, test_api.py · new · _v0.67.0

The backend suite, run by `python -m pytest -q tests` from `backend/`. `conftest.py` points `SONNY_DATA_DIR` at a fresh temporary folder per test and yields a FastAPI `TestClient`, plus `png_bytes` and `manifest` helpers; `test_api.py` covers health, version, capabilities, decode, export naming, the project library and its validation, packaging and the background engine's 501 answer, 9 tests. Nothing was removed.

## app/routers/generative.py

### app/routers/generative.py · new · _v0.37.0

`GET /status`, `PUT /key`, `DELETE /key`, `POST /fill` (the call runs in a thread so it never blocks the server). Nothing was removed.

### app/routers/generative.py · /upscale · _v0.38.0

`POST /upscale` (image, scale 2 or 4). Nothing was removed.

## app/services/generative.py

### app/services/generative.py · new · _v0.37.0

fal client for FLUX.1 Fill [pro] and Erase [pro]: key from FAL_KEY, FAL_API_KEY or `generative.json` (mode 600) in the data folder, never returned; inline PNG data URIs; fal's errors mapped to clear messages; `SONNY_FAL_BASE` points it elsewhere for testing. Nothing was removed.

### app/services/generative.py · upscale, _result_png · _v0.38.0

Real-ESRGAN upscaling; result parsing shared by Fill, Erase and Upscale. Removed:

```py
    images = result.get("images") or ([result["image"]] if isinstance(result.get("image"), dict) else [])
    if not images or not isinstance(images[0], dict) or not images[0].get("url"):
        raise GenerativeError("fal returned no image.", 502)
    if any(result.get("has_nsfw_concepts") or []):
        raise GenerativeError("fal withheld the result under its safety filter. Try another prompt.", 422)
    raw = _download(str(images[0]["url"]))
    try:
        with Image.open(io.BytesIO(raw)) as im:
            out = io.BytesIO()
            im.convert("RGBA").save(out, "PNG")
            return out.getvalue()
    except Exception as exc:  # noqa: BLE001 - any decode failure is a bad result
        raise GenerativeError("fal returned an image sonny could not read.", 502) from exc
```

## Org-navi-map

```text
.env.example  · template for backend/.env
HASHOUT_LOG.md  · this log
app/
    __init__.py  · version string
    core/
        __init__.py  · package marker
        config.py  · ports, limits, folders, .env loading
    main.py  · app assembly, CORS, static mount
    routers/
        __init__.py  · package marker
        io.py  · decode and export
        ops.py  · remove background
        projects.py  · library, import, sessions
        system.py  · health, version, capabilities
    services/
        __init__.py  · package marker
        background.py  · rembg and GrabCut
        imaging.py  · Pillow and pillow-heif decoding, sips fallback
        project_format.py  · manifest validation, zip and folder IO
        sessions.py  · opened-project sessions
boot_backend  · start the engine (unix)
boot_backend.bat  · start the engine (windows)
sonny_engine.py  · PyInstaller sidecar entry
oc_install  · install this side (unix)
oc_install.bat  · install this side (windows)
requirements.txt  · pinned base
requirements_desktop.txt  · pinned PyInstaller
requirements_desktop_macos.txt  · unpinned PyInstaller
requirements_macos.txt  · unpinned base for macOS
requirements_ml.txt  · pinned ML extra
requirements_ml_macos.txt  · unpinned ML extra
```

## Table of contents

- [.env.example](#envexample)
- [app/__init__.py](#app__init__py)
- [app/core/__init__.py](#appcore__init__py)
- [app/core/config.py](#appcoreconfigpy)
- [app/main.py](#appmainpy)
- [app/routers/__init__.py](#approuters__init__py)
- [app/routers/io.py](#approutersiopy)
- [app/routers/ops.py](#approutersopspy)
- [app/routers/projects.py](#approutersprojectspy)
- [app/routers/system.py](#approuterssystempy)
- [app/services/__init__.py](#appservices__init__py)
- [app/services/background.py](#appservicesbackgroundpy)
- [app/services/imaging.py](#appservicesimagingpy)
- [app/services/project_format.py](#appservicesproject_formatpy)
- [app/services/sessions.py](#appservicessessionspy)
- [boot_backend](#boot_backend)
- [boot_backend.bat](#boot_backendbat)
- [sonny_engine.py](#sonny_enginepy)
- [oc_install](#oc_install)
- [oc_install.bat](#oc_installbat)
- [requirements.txt](#requirementstxt)
- [requirements_desktop.txt](#requirements_desktoptxt)
- [requirements_desktop_macos.txt](#requirements_desktop_macostxt)
- [requirements_macos.txt](#requirements_macostxt)
- [requirements_ml.txt](#requirements_mltxt)
- [requirements_ml_macos.txt](#requirements_ml_macostxt)

## .env.example

### .env.example · template for backend/.env · _v0.1.0

Created in _v0.1.0.

## app/__init__.py

### app/__init__.py · version string · _v0.1.0

Created in _v0.1.0.

## app/core/__init__.py

### app/core/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/core/config.py

### app/core/config.py · ports, limits, folders, .env loading · _v0.1.0

Created in _v0.1.0.

## app/main.py

### app/main.py · app assembly, CORS, static mount · _v0.1.0

Created in _v0.1.0.

### app/main.py · generative router · _v0.37.0

Mounts `/api/generative`. Removed:

```py
from app.routers import io, ops, projects, system
```

## app/routers/__init__.py

### app/routers/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/routers/io.py

### app/routers/io.py · decode and export · _v0.1.0

Created in _v0.1.0.

## app/routers/ops.py

### app/routers/ops.py · remove background · _v0.1.0

Created in _v0.1.0.

## app/routers/projects.py

### app/routers/projects.py · save · _v0.1.0

Writes through a temporary file and `os.replace`, so a crash never leaves a half-written project.

### app/routers/projects.py · package · root folder · _v0.28.0

The package route takes an optional `root` form field, checked as a safe name, so a export unzips to `Name.ref/`. Removed:

```py
def package(manifest: str = Form(...), files: list[UploadFile] = File(default=[])) -> Response:
```

## app/routers/system.py

### app/routers/system.py · health, version, capabilities · _v0.1.0

Created in _v0.1.0.

## app/services/__init__.py

### app/services/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/services/background.py

### app/services/background.py · remove · _v0.1.0

rembg is the default when installed; OpenCV GrabCut is always available. Both return a mask PNG, never cut pixels. Verified live: GrabCut isolates a test subject (center 255, corner 0); `ml` answers 501 when not installed.

## app/services/imaging.py

### app/services/imaging.py · decode_to_png · _v0.1.0

`pillow-heif` bundles GPL x265, so the frozen sidecar excludes it and macOS falls back to `sips`.

## app/services/project_format.py

### app/services/project_format.py · validate · _v0.1.0

Accepts `com.reference.project` 1 to 7 and `com.nodemode.sonny` 1; checks sizes, ids, folder parents, clip links, depth 64 and clip chains 256 before anything touches disk. Verified live: a version 9 manifest is rejected with 422.

### app/services/project_format.py · write_zip · root folder · _v0.28.0

`write_zip` wraps the manifest and images in an optional root folder. Removed:

```py
def write_zip(manifest: dict, assets: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2), compress_type=zipfile.ZIP_DEFLATED)
        for name, data in assets.items():
            archive.writestr(f"images/{name}", data)
```

## app/services/sessions.py

### app/services/sessions.py · opened-project sessions · _v0.1.0

Created in _v0.1.0.

## boot_backend

### boot_backend · start the engine (unix) · _v0.1.0

Created in _v0.1.0.

## boot_backend.bat

### boot_backend.bat · start the engine (windows) · _v0.1.0

Created in _v0.1.0.

## sonny_engine.py

### sonny_engine.py · main · _v0.1.0

Serves the bundled `frontend_dist`; with `SONNY_PORT=0` uvicorn prints `http://127.0.0.1:PORT`, which the Tauri shell parses. Verified live. `--selfcheck` prints dependency versions as JSON.

## oc_install

### oc_install · install this side (unix) · _v0.1.0

Created in _v0.1.0.

## oc_install.bat

### oc_install.bat · install this side (windows) · _v0.1.0

Created in _v0.1.0.

## requirements.txt

### requirements.txt · pinned base · _v0.1.0

Created in _v0.1.0.

## requirements_desktop.txt

### requirements_desktop.txt · pinned PyInstaller · _v0.1.0

Created in _v0.1.0.

## requirements_desktop_macos.txt

### requirements_desktop_macos.txt · unpinned PyInstaller · _v0.1.0

Created in _v0.1.0.

## requirements_macos.txt

### requirements_macos.txt · unpinned base for macOS · _v0.1.0

Created in _v0.1.0.

## requirements_ml.txt

### requirements_ml.txt · pinned ML extra · _v0.1.0

Created in _v0.1.0.

## requirements_ml_macos.txt

### requirements_ml_macos.txt · unpinned ML extra · _v0.1.0

Created in _v0.1.0.

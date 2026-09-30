# backend HASHOUT_LOG

Living log for the engine service side, _v0.1.0. Read the map and the TOC first; entries are anchored by file and symbol, and removed code is quoted in full.

## The sRGB to ink table · _v1.54.2 (app/services/colour.py, app/routers/colour.py)

`rgb_cmyk_lut(profile, source, intent, bpc)`: a GRID^3 table of C, M, Y, K bytes (r slowest, b fastest) from an RGB profile (sRGB when none) to a CMYK one, the window's readouts and paint colours; `/color/rgb-cmyk-lut`. The exact path for pixels stays `convert_pixels`. Checked: 33^3 by 4 bytes; a red through the table lands within 1 level of the direct transform. Removed lines taken after the version edit:

```text
__version__ = "1.54.1"
version = "1.54.1"
version = "1.54.1"
 "version": "1.54.1",
```

## CMYK documents · _v1.54.1 (app/services/colour.py, app/routers/colour.py, app/routers/io.py, app/profiles/FOGRA39L_coated.icc new; setup/freeze_backend and .bat)

`colour.py`: `shipped_dir` (beside the app, or PyInstaller's `_MEIPASS`), `default_cmyk`, `cmyk_lut` (GRID4 = 17, c slowest, k fastest, relative intent), `convert_pixels` (LittleCMS at 8 bits, RGBA to CMYK and alpha or back, alpha through, MAX_BYTES times 8 a request); `profile_dirs` lists the shipped folder second; `profiles()` marks `shipped`. `routers/colour.py`: `/cmyk-lut`, `/convert-pixels` (multipart: pixels, width, height, to, profile base64, source base64, intent, bpc), `/default-cmyk`. `routers/io.py`: `/decode-cmyk` (Pillow; ink and alpha bytes then the embedded profile, `X-Profile-Bytes`; 204 when not CMYK) and `/encode-cmyk` (alpha lays the ink over paper, TIFF deflate or JPEG, profile embedded). The freeze scripts bundle `profiles`. The profile is colord's FOGRA39L under the zlib licence (NOTICE.md); ECI's own is not shippable. Checked: the conversion equals `ImageCms.applyTransform` directly; the table is 17^4 by 3 bytes; a TIFF ink round trip is exact and JPEG within 1 level. Removed lines taken after the version edit:

```text
__version__ = "1.53.9"
from fastapi import APIRouter, File, HTTPException, UploadFile
    dirs = [config.data_dir() / "Profiles"]
            out.append({"id": digest, **info, "file": path.name, "added": d == profile_dirs()[0]})
pyinstaller --noconfirm --clean --onefile --name formvis-engine --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller --add-data "%ROOT%\frontend\dist;frontend_dist" --collect-submodules app --collect-submodules uvicorn --collect-submodules keyring --hidden-import cv2 --exclude-module pillow_heif "%ROOT%\backend\formvis_engine.py" || exit /b 1
version = "1.53.9"
version = "1.53.9"
 "version": "1.53.9",
```

## Click-to-select with SAM 2.1 · _v1.42.0 (app/services/segment.py new, app/routers/ops.py, app/routers/system.py, app/services/compute.py, requirements_sam2.txt new; tests/test_select_object.py new)

`segment.py`: `available`, `torch_device`, `ensure_checkpoint` (SHA-256 checked), `encode`, `select`, `clear`, `model_dir` (FORMVIS_MODELS_DIR). `ops.py`: `select_object`. `system.py`: `_select_object` in capabilities. `compute.set_preference` also clears the SAM model. Removed:

```python
from app.services import background
from app.services import background, compute, imaging
        from app.services import background
```

## .comp import · _v1.40.0 (app/services/project_format.py, app/routers/projects.py; tests/test_comp_import.py new)

`project_format.py`: `COMP_LABEL`, `COMP_VERSIONS`, `is_comp` (a .comp recognised by its shape, then fully validated); the refusal messages name .comp. `projects.py`: `.comp` in `SUFFIXES`. Removed:

```python
SUFFIXES = (".fmv", ".formvis", ".canvasor", ".zip")
    if fmt not in SUPPORTED:
        raise ProjectError("This is not a formvis or canvasor project.")
    if not isinstance(version, int) or version not in SUPPORTED[fmt]:
        raise ProjectError(f"This project uses format version {version}, which this build cannot read.")
        raise ProjectError("The file is not a formvis or canvasor package.") from exc
```

## Camera RAW decoding · _v1.39.0 (app/services/imaging.py, requirements.txt, requirements_macos.txt; tests/test_raw.py and tests/fixtures/ new)

`imaging.py`: `RAW`, `RAW_ENGINE`, `RAW_SUFFIXES`, `_raw` (LibRaw through rawpy, before Pillow), and `decoders` reporting `raw` and `rawEngine`. Removed:

```python
    return {"heic": HEIF or sips_available(), "tiff": True, "engine": engine}
```

## The engine's compute device · _v1.26.0 (app/services/compute.py new; app/services/background.py, app/routers/system.py; tests/test_compute.py new)

`compute.py`: `DEVICES`, `PROVIDER`, `LABEL`, `available_providers`, `choose` (pure), `current`, `set_preference`. `background.py`: `_session(model, providers)` with the older-rembg fallback, `clear_sessions`, the providers from `compute.current()`. `system.py`: `GET` and `POST /api/compute` (`ComputeChoice`), `compute` in `/api/capabilities`. Removed:

```python
from fastapi import APIRouter
from app.services import background, imaging
def _session(model: str):
    return new_session(model)
    mask = remove(image.convert("RGB"), session=_session(model_name()), only_mask=True)
```

## The reference app's project format removed · _v1.4.0 (app/services/project_format.py, app/routers/projects.py, app/__init__.py)

`project_format.py` no longer accepts `com.reference.project`: `SUPPORTED` holds `com.nodemode.formvis` and `com.nodemode.canvasor` version 1; the refusals and `write_zip`'s docstring name only formvis's and canvasor's projects. `projects.py` drops `.ref` from `SUFFIXES`. Version 1.4.0. Removed:

```py
__version__ = "1.3.0"
SUFFIXES = (".fmv", ".formvis", ".ref", ".canvasor", ".zip")
REFERENCE = "com.reference.project"
# NodeMode canvasor's projects: the same manifest and images/ layout as .ref (bottom-to-top layers, each transform an
# origin and a displayed size), under their own id. Version 1 is the one seen; later versions are rejected, not guessed.
SUPPORTED = {REFERENCE: range(1, 8), FORMVIS: range(1, 2), CANVASOR: range(1, 2)}
        raise ProjectError("This is not a formvis, .ref or canvasor project.")
        raise ProjectError("The file is not a formvis, .ref or canvasor package.") from exc
    """The project as a zip: manifest.json and images/. With `root`, everything sits inside that one folder, so
    unzipping a .ref export yields a `Name.ref` package."""
```

## canvasor projects open · _v0.97.0 (app/services/project_format.py, app/routers/projects.py; tests/test_api.py)

`project_format.py`: `CANVASOR = "com.nodemode.canvasor"`, accepted at version 1 in `SUPPORTED` (later versions refused); the refusals name canvasor. `projects.py`: `SUFFIXES` strips `.canvasor` from project names. Removed:

```py
SUFFIXES = (".fmv", ".formvis", ".ref", ".zip")
SUPPORTED = {REFERENCE: range(1, 8), FORMVIS: range(1, 2)}
        raise ProjectError("This is not a formvis or .ref project.")
        raise ProjectError("The file is not a formvis or .ref package.") from exc
```

## Colour profiles in the encoder · _v0.92.0 (app/services/imaging.py, app/routers/io.py, tests/test_api.py)

`imaging.encode` takes `icc`: checked by LittleCMS (`ImageCms`), at most 1 MB, embedded in TIFF, WebP and AVIF, not in PDF. `/encode` takes an optional `icc` file. One test added. Removed:

```python
def encode(file: UploadFile = File(...), format: str = Form(...), quality: int = Form(90), dpi: int = Form(72)) -> Response:
        data = imaging.encode(file.file.read(), format.lower(), quality, dpi)
from PIL import Image, ImageOps
def encode(png: bytes, fmt: str, quality: int = 90, dpi: int = 72) -> bytes:
    images carry no alpha here), WebP or AVIF (at `quality`, alpha kept)."""
        rgba.save(out, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi))
        rgba.save(out, "WEBP", quality=q, method=4)
        rgba.save(out, "AVIF", quality=q)
```

## .fmv projects · _v0.90.0 (app/routers/projects.py, app/routers/io.py, tests/test_api.py)

`projects.py`: `EXT` (.fmv) and `OLD_EXT` (.formvis); `_library_path` names `.fmv`; `_existing` finds either for opening; the library lists both, `.fmv` preferred; save removes an older `.formvis` of the same name; delete removes either; `SUFFIXES` strips `.fmv` from imported names. `io.py`: the export rule takes `.fmv`. One test added. Removed:

```python
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|formvis|webp|tif|tiff|pdf|avif)$", re.IGNORECASE)
SUFFIXES = (".formvis", ".ref", ".zip")
    return config.projects_dir() / f"{clean}.formvis"
    items = []
    for path in config.projects_dir().glob("*.formvis"):
        stat = path.stat()
        items.append({"name": path.stem, "modified": stat.st_mtime, "size": stat.st_size})
    return sorted(items, key=lambda item: item["modified"], reverse=True)
    path = _library_path(name)
    _library_path(name).unlink(missing_ok=True)
```

## Export encodings · _v0.75.0 (app/services/imaging.py, app/routers/io.py, tests/test_api.py, logged together)

`imaging.encode` re-encodes the editor's PNG as TIFF (LZW, alpha kept), PDF (one page at the given dpi, flattened on white), WebP or AVIF (quality, alpha kept), refusing other formats and unreadable input with `DecodeError`; `ENCODINGS` maps each to its media type. `POST /api/io/encode` serves it (415 on refusal). `EXPORT_NAME` accepts .webp, .tif, .tiff, .pdf and .avif. Two tests added. Removed from `app/routers/io.py`:

```python
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|formvis)$", re.IGNORECASE)
```

## tests/

### tests/__init__.py, conftest.py, test_api.py · new · _v0.67.0

The backend suite, run by `python -m pytest -q tests` from `backend/`. `conftest.py` points `FORMVIS_DATA_DIR` at a fresh temporary folder per test and yields a FastAPI `TestClient`, plus `png_bytes` and `manifest` helpers; `test_api.py` covers health, version, capabilities, decode, export naming, the project library and its validation, packaging and the background engine's 501 answer, 9 tests. Nothing was removed.

## app/routers/generative.py

### app/routers/generative.py · new · _v0.37.0

`GET /status`, `PUT /key`, `DELETE /key`, `POST /fill` (the call runs in a thread so it never blocks the server). Nothing was removed.

### app/routers/generative.py · /upscale · _v0.38.0

`POST /upscale` (image, scale 2 or 4). Nothing was removed.

## app/services/generative.py

### app/services/generative.py · new · _v0.37.0

fal client for FLUX.1 Fill [pro] and Erase [pro]: key from FAL_KEY, FAL_API_KEY or `generative.json` (mode 600) in the data folder, never returned; inline PNG data URIs; fal's errors mapped to clear messages; `FORMVIS_FAL_BASE` points it elsewhere for testing. Nothing was removed.

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
        raise GenerativeError("fal returned an image formvis could not read.", 502) from exc
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
formvis_engine.py  · PyInstaller sidecar entry
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
- [formvis_engine.py](#formvis_enginepy)
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

Accepts `com.reference.project` 1 to 7 and `com.nodemode.formvis` 1; checks sizes, ids, folder parents, clip links, depth 64 and clip chains 256 before anything touches disk. Verified live: a version 9 manifest is rejected with 422.

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

## formvis_engine.py

### formvis_engine.py · main · _v0.1.0

Serves the bundled `frontend_dist`; with `FORMVIS_PORT=0` uvicorn prints `http://127.0.0.1:PORT`, which the Tauri shell parses. Verified live. `--selfcheck` prints dependency versions as JSON.

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

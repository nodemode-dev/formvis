import json
import os
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from app.core import config, legacy
from app.services import project_format as pf
from app.services import sessions

router = APIRouter(tags=["projects"])
NAME = re.compile(r'[^/\\:*?"<>|\x00-\x1f\x7f]{1,120}')
#: The library writes .fvd (1.87.0); .fmv projects and those with the extensions from before the rename (core/legacy.py)
#: are still read, listed, opened and deleted, and saving one again writes .fvd in its place.
EXT, OLD_EXTS = ".fvd", (".fmv", *legacy.PROJECT_EXTENSIONS)
SUFFIXES = (EXT, *OLD_EXTS, ".canvasor", ".comp", ".zip")


def _library_path(name: str) -> Path:
    clean = name.strip()
    if not NAME.fullmatch(clean) or clean.startswith("."):
        raise HTTPException(400, "Invalid project name.")
    return config.projects_dir() / f"{clean}{EXT}"


def _existing(name: str) -> Path:
    """The library file for `name`: the .fmv one, or else one saved before the rename."""
    path = _library_path(name)
    if path.is_file():
        return path
    return next((o for o in (path.with_suffix(x) for x in OLD_EXTS) if o.is_file()), path)


def _project_name(raw: str) -> str:
    """A project name from a file or folder name, without any known project suffix."""
    name = raw.replace("\\", "/").rstrip("/").split("/")[-1] or "Untitled"
    trimmed = True
    while trimmed:
        trimmed = False
        for suffix in SUFFIXES:
            if name.lower().endswith(suffix) and len(name) > len(suffix):
                name = name[: -len(suffix)]
                trimmed = True
    return name.strip() or "Untitled"


def _manifest(raw: str) -> dict:
    """Parse the manifest field, refusing an oversized or malformed one."""
    if len(raw.encode("utf-8", "ignore")) > config.MAX_MANIFEST_BYTES:
        raise HTTPException(413, "The manifest is too large.")
    try:
        return json.loads(raw)
    except ValueError:
        raise HTTPException(400, "The manifest is not valid JSON.") from None


def _assets(files: list[UploadFile]) -> dict[str, bytes]:
    """The uploaded images by file name."""
    found: dict[str, bytes] = {}
    for upload in files:
        name = upload.filename or ""
        if not pf.safe_name(name):
            raise HTTPException(400, "Unsafe asset name.")
        blob = upload.file.read(config.MAX_ASSET_BYTES + 1)
        if len(blob) > config.MAX_ASSET_BYTES:
            raise HTTPException(413, "An image is larger than 512 MiB.")
        found[name] = blob
    return found


def _validated(manifest: dict, assets: dict[str, bytes]) -> None:
    try:
        pf.validate(manifest, set(assets))
    except pf.ProjectError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("")
def library() -> list[dict]:
    items: dict[str, dict] = {}
    for suffix in (*OLD_EXTS, EXT):
        for path in config.projects_dir().glob(f"*{suffix}"):
            stat = path.stat()
            items[path.stem] = {"name": path.stem, "modified": stat.st_mtime, "size": stat.st_size}
    return sorted(items.values(), key=lambda item: item["modified"], reverse=True)


def _version(path: Path) -> str:
    """A library file's version (1.58.8): its modification time and size, which a synced folder changes when another
    device's copy arrives."""
    st = path.stat()
    return f"{st.st_mtime_ns}-{st.st_size}"


def _thumb(upload: UploadFile | None) -> bytes:
    """The thumbnail sent with a save (1.87.0), or nothing when none came or it is too large to keep."""
    if upload is None:
        return b""
    blob = upload.file.read(pf.MAX_THUMBNAIL + 1)
    return blob if len(blob) <= pf.MAX_THUMBNAIL else b""


def _local(request: Request) -> None:
    """Files by path are read and written only for formvis's own window (1.87.0): a page from anywhere else cannot send
    this header, because the browser asks the engine first and the engine's CORS answer names only formvis's origins."""
    if request.headers.get("x-formvis") != "1":
        raise HTTPException(403, "Only the formvis window can open or save files by path.")


def _disk_path(raw: str, kinds: tuple[str, ...], reading: bool) -> Path:
    """An absolute path on this computer with one of `kinds` as its extension; a file to read must exist, a folder to
    write in must exist."""
    path = Path(os.path.expanduser((raw or "").strip()))
    if not (raw or "").strip() or not path.is_absolute():
        raise HTTPException(400, "Give the file's full path.")
    if not path.name.lower().endswith(kinds):
        raise HTTPException(400, f"{path.name}: formvis takes {', '.join(kinds)} here.")
    if reading and not path.is_file():
        raise HTTPException(404, f"There is no file at {path}. It may have been moved, renamed or deleted.")
    if not reading and not path.parent.is_dir():
        raise HTTPException(400, f"The folder {path.parent} does not exist.")
    return path


def _write_atomic(target: Path, blob: bytes) -> None:
    """Written beside the target first, then renamed over it, so a failed save never leaves half a file."""
    fd, tmp_name = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(blob)
        os.replace(tmp_name, target)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise


@router.post("/save-to")
def save_to(request: Request, path: str = Form(...), manifest: str = Form(...), files: list[UploadFile] = File(default=[]), thumbnail: UploadFile | None = File(default=None)) -> dict:
    """Save or Save As to a file the person chose in the desktop app's save panel (1.87.0): a .fvd anywhere on this
    computer, written atomically. A .fvd in the library folder is listed in the library as well."""
    _local(request)
    target = _disk_path(path, (EXT,), False)
    data = _manifest(manifest)
    assets = _assets(files)
    _validated(data, assets)
    blob = pf.write_zip(data, assets, thumbnail=_thumb(thumbnail))
    try:
        _write_atomic(target, blob)
    except OSError as exc:
        raise HTTPException(400, f"formvis could not write {target.name}: {exc.strerror or exc}.") from exc
    return {"name": target.stem, "path": str(target), "size": len(blob), "version": _version(target)}


class PathBody(BaseModel):
    path: str = ""


@router.post("/open-path")
def open_path(request: Request, body: PathBody) -> dict:
    """A project file at a path on this computer (1.87.0), from the desktop app's open panel, Open Recent or Home."""
    _local(request)
    path = _disk_path(body.path, SUFFIXES, True)
    try:
        manifest, assets = pf.read_zip(path.read_bytes())
    except pf.ProjectError as exc:
        raise HTTPException(422, f"{path.name}: {exc}") from exc
    _validated(manifest, assets)
    return {**sessions.payload(sessions.create(assets), manifest, assets, _project_name(path.name)), "version": _version(path), "path": str(path)}


@router.get("/thumbnail")
def thumbnail(request: Request, name: str = "", path: str = "") -> Response:
    """The thumbnail a saved project carries (1.87.0): a library project by `name`, or a file by `path`; 404 for one
    saved before thumbnails."""
    if path:
        _local(request)
        target = _disk_path(path, SUFFIXES, True)
    else:
        target = _existing(name)
        if not target.is_file():
            raise HTTPException(404, "Project not found.")
    data = target.read_bytes()
    blob = pf.read_thumbnail(data) or pf.stand_in_thumbnail(data)
    if blob is None:
        raise HTTPException(404, "This project has no thumbnail.")
    return Response(blob, media_type="image/png", headers={"Cache-Control": "no-cache"})


@router.post("/save")
def save(name: str = Form(...), manifest: str = Form(...), files: list[UploadFile] = File(default=[]), base: str = Form(""), thumbnail: UploadFile | None = File(default=None)) -> dict:
    """Saved atomically (a temporary file in the same folder, then renamed), and conflict-safe (1.58.8, L13): a save
    that names the version it was based on overwrites only a file still at that version; when the file changed since
    (another device's copy synced in, or another window saved), the save goes beside it as "name (conflict date time)"
    and the other version is kept. The answer carries the saved file's version for the next save."""
    target = _library_path(name)
    data = _manifest(manifest)
    assets = _assets(files)
    _validated(data, assets)
    conflict = bool(base) and target.is_file() and _version(target) != base
    if conflict:
        from datetime import datetime
        target = _library_path(f"{target.stem[:80]} (conflict {datetime.now().strftime('%Y-%m-%d %H.%M.%S')})")
    blob = pf.write_zip(data, assets, thumbnail=_thumb(thumbnail))
    _write_atomic(target, blob)
    if not conflict:
        for x in OLD_EXTS:
            target.with_suffix(x).unlink(missing_ok=True)
    out = {"name": target.stem, "path": str(target), "size": len(blob), "version": _version(target)}
    if conflict:
        out.update({"conflict": True, "kept": name.strip()})
    return out


def _synced() -> list[dict]:
    """Synced folders found on this computer (iCloud Drive, Dropbox, OneDrive, Google Drive), each with the Formvis
    folder suggested inside it."""
    home, found = Path.home(), []
    cands = [("iCloud Drive", home / "Library/Mobile Documents/com~apple~CloudDocs"), ("Dropbox", home / "Dropbox"), ("OneDrive", Path(os.environ.get("OneDrive", str(home / "OneDrive")))), ("Google Drive", home / "Google Drive")]
    cloud = home / "Library/CloudStorage"
    if cloud.is_dir():
        for d in sorted(cloud.iterdir()):
            label = d.name.split("-")[0].replace("GoogleDrive", "Google Drive")
            cands.append((label, d / "My Drive" if (d / "My Drive").is_dir() else d))
    for label, path in cands:
        if path.is_dir() and not any(f["base"] == str(path) for f in found):
            found.append({"label": label, "base": str(path), "suggested": str(path / "Formvis")})
    return found


@router.get("/folder")
def folder() -> dict:
    """Where the library is (1.58.8, L13), the default, and the synced folders found here to choose from."""
    current, default = config.projects_dir(), config.default_projects_dir()
    return {"folder": str(current), "default": str(default), "custom": current.resolve() != default.resolve(), "fixed": bool(os.environ.get("FORMVIS_LIBRARY_DIR", "").strip()), "synced": _synced()}


class FolderBody(BaseModel):
    folder: str = ""
    move: bool = False


@router.put("/folder")
def set_folder(body: FolderBody) -> dict:
    """The library moved to `folder` (empty: back to the default): made if missing and tested writable; with `move`,
    each project is copied there, checked by size, and only then removed here (a project of the same name there is
    kept, the one moved in renamed beside it)."""
    if os.environ.get("FORMVIS_LIBRARY_DIR", "").strip():
        raise HTTPException(status_code=409, detail="The library folder is set by FORMVIS_LIBRARY_DIR for this engine.")
    old = config.projects_dir()
    new = Path(body.folder).expanduser() if body.folder.strip() else config.default_projects_dir()
    if not new.is_absolute():
        raise HTTPException(status_code=400, detail="Give the folder's full path.")
    try:
        new.mkdir(parents=True, exist_ok=True)
        fd, probe = tempfile.mkstemp(dir=new, suffix=".tmp")
        os.close(fd)
        os.unlink(probe)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"formvis cannot write in that folder: {exc.strerror or exc}.") from exc
    moved = 0
    if body.move and new.resolve() != old.resolve():
        import shutil
        for src in sorted(p for s in (EXT, *OLD_EXTS) for p in old.glob(f"*{s}")):
            dst = new / src.name
            if dst.exists():
                dst = new / f"{src.stem} (moved){src.suffix}"
            shutil.copy2(src, dst)
            if dst.stat().st_size != src.stat().st_size:
                raise HTTPException(status_code=500, detail=f"{src.name} did not copy whole; nothing more was moved.")
            src.unlink()
            moved += 1
    settings = config.data_dir() / "library.json"
    if body.folder.strip():
        settings.write_text(json.dumps({"folder": str(new)}))
    else:
        settings.unlink(missing_ok=True)
    return {**folder(), "moved": moved}


@router.post("/package")
def package(manifest: str = Form(...), files: list[UploadFile] = File(default=[]), root: str = Form(""), thumbnail: UploadFile | None = File(default=None)) -> Response:
    """The project as a downloadable zip, optionally inside one named folder, with its thumbnail when one is sent."""
    data = _manifest(manifest)
    assets = _assets(files)
    _validated(data, assets)
    if root and (not NAME.fullmatch(root) or root.startswith(".")):
        raise HTTPException(400, "Invalid package folder name.")
    return Response(pf.write_zip(data, assets, root, _thumb(thumbnail)), media_type="application/zip")


@router.get("/library/{name}")
def open_library(name: str) -> dict:
    path = _existing(name)
    try:
        manifest, assets = pf.read_zip(path.read_bytes())
    except FileNotFoundError:
        raise HTTPException(404, "Project not found.") from None
    except pf.ProjectError as exc:
        raise HTTPException(422, str(exc)) from exc
    _validated(manifest, assets)
    return {**sessions.payload(sessions.create(assets), manifest, assets, path.stem), "version": _version(path)}   # 1.58.8


@router.delete("/library/{name}")
def delete_library(name: str) -> dict:
    path = _library_path(name)
    path.unlink(missing_ok=True)
    for x in OLD_EXTS:
        path.with_suffix(x).unlink(missing_ok=True)
    return {"deleted": name}


@router.post("/import")
def import_project(files: list[UploadFile] = File(...), paths: list[str] = Form(default=[])) -> dict:
    """Open a packaged project (one zip) or a dropped folder into a new session."""
    try:
        if len(files) == 1 and not paths:
            manifest, assets = pf.read_zip(files[0].file.read())
            name = _project_name(files[0].filename or "")
        else:
            pairs = []
            for index, upload in enumerate(files):
                given = paths[index] if index < len(paths) and paths[index] else (upload.filename or "")
                pairs.append((given, upload.file.read()))
            manifest, assets, folder = pf.read_folder(pairs)
            name = _project_name(folder)
    except pf.ProjectError as exc:
        raise HTTPException(422, str(exc)) from exc
    _validated(manifest, assets)
    return sessions.payload(sessions.create(assets), manifest, assets, name)


@router.get("/session/{sid}/{filename}")
def session_asset(sid: str, filename: str) -> FileResponse:
    path = sessions.asset_path(sid, filename)
    if path is None:
        raise HTTPException(404, "Asset not found.")
    return FileResponse(path, media_type="image/png")

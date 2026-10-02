import json
import os
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from app.core import config, legacy
from app.services import project_format as pf
from app.services import sessions

router = APIRouter(tags=["projects"])
NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,120}$")
#: The library writes .fmv; projects with the extensions from before the rename (core/legacy.py) are still read, listed,
#: opened and deleted, and saving one again writes .fmv in its place.
EXT, OLD_EXTS = ".fmv", legacy.PROJECT_EXTENSIONS
SUFFIXES = (EXT, *OLD_EXTS, ".canvasor", ".comp", ".zip")


def _library_path(name: str) -> Path:
    clean = name.strip()
    if not NAME.match(clean) or clean.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid project name.")
    return config.projects_dir() / f"{clean}{EXT}"


def _existing(name: str) -> Path:
    """The library file for `name`: the .fmv one, or else one saved before the rename."""
    path = _library_path(name)
    if path.is_file():
        return path
    return next((o for o in (path.with_suffix(x) for x in OLD_EXTS) if o.is_file()), path)


def _project_name(raw: str) -> str:
    name = Path(raw or "Untitled").name
    changed = True
    while changed:
        changed = False
        for suffix in SUFFIXES:
            if name.lower().endswith(suffix) and len(name) > len(suffix):
                name, changed = name[: -len(suffix)], True
    return name or "Untitled"


def _manifest(raw: str) -> dict:
    if len(raw.encode("utf-8")) > config.MAX_MANIFEST_BYTES:
        raise HTTPException(status_code=413, detail="The manifest is too large.")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="The manifest is not valid JSON.") from exc
    return data


def _assets(files: list[UploadFile]) -> dict[str, bytes]:
    out: dict[str, bytes] = {}
    for upload in files:
        name = Path(upload.filename or "").name
        if not pf.safe_name(name):
            raise HTTPException(status_code=400, detail="Unsafe asset name.")
        data = upload.file.read()
        if len(data) > config.MAX_ASSET_BYTES:
            raise HTTPException(status_code=413, detail="An image is larger than 512 MiB.")
        out[name] = data
    return out


def _validated(manifest: dict, assets: dict[str, bytes]) -> None:
    try:
        pf.validate(manifest, set(assets))
    except pf.ProjectError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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


@router.post("/save")
def save(name: str = Form(...), manifest: str = Form(...), files: list[UploadFile] = File(default=[]), base: str = Form("")) -> dict:
    """Saved atomically (a temporary file in the same folder, then renamed), and conflict-safe (1.58.8, L13): a save
    that names the version it was based on overwrites only a file still at that version; when the file changed since
    (another device's copy synced in, or another window saved), the save goes beside it as "name (conflict date time)"
    and the other version is kept. The answer carries the saved file's version for the next save."""
    target = _library_path(name)
    data, assets = _manifest(manifest), _assets(files)
    _validated(data, assets)
    conflict = bool(base) and target.is_file() and _version(target) != base
    if conflict:
        from datetime import datetime
        target = _library_path(f"{target.stem[:80]} (conflict {datetime.now().strftime('%Y-%m-%d %H.%M.%S')})")
    blob = pf.write_zip(data, assets)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    with os.fdopen(fd, "wb") as handle:
        handle.write(blob)
    os.replace(tmp, target)
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
def package(manifest: str = Form(...), files: list[UploadFile] = File(default=[]), root: str = Form("")) -> Response:
    data, assets = _manifest(manifest), _assets(files)
    _validated(data, assets)
    if root and (not pf.safe_name(root) or root.startswith(".")):
        raise HTTPException(status_code=400, detail="Invalid package folder name.")
    return Response(pf.write_zip(data, assets, root), media_type="application/zip")


@router.get("/library/{name}")
def open_library(name: str) -> dict:
    path = _existing(name)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Project not found.")
    try:
        manifest, assets = pf.read_zip(path.read_bytes())
    except pf.ProjectError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
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
    try:
        if len(files) == 1 and not paths:
            manifest, assets = pf.read_zip(files[0].file.read())
            name = _project_name(files[0].filename or "")
        else:
            entries = [((paths[i] if i < len(paths) else "") or (upload.filename or ""), upload.file.read()) for i, upload in enumerate(files)]
            manifest, assets, root = pf.read_folder(entries)
            name = _project_name(root)
    except pf.ProjectError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _validated(manifest, assets)
    return sessions.payload(sessions.create(assets), manifest, assets, name)


@router.get("/session/{sid}/{filename}")
def session_asset(sid: str, filename: str) -> FileResponse:
    path = sessions.asset_path(sid, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return FileResponse(path, media_type="image/png")

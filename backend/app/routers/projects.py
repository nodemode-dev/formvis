import json
import os
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from app.core import config
from app.services import project_format as pf
from app.services import sessions

router = APIRouter(tags=["projects"])
NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,120}$")
SUFFIXES = (".sny", ".sonny", ".canvasor", ".comp", ".zip")
#: The library writes .sny; .sonny (the extension before 0.90.0) is still read, listed, opened and deleted.
EXT, OLD_EXT = ".sny", ".sonny"


def _library_path(name: str) -> Path:
    clean = name.strip()
    if not NAME.match(clean) or clean.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid project name.")
    return config.projects_dir() / f"{clean}{EXT}"


def _existing(name: str) -> Path:
    """The library file for `name`: the .sny one, or else an older .sonny one."""
    path = _library_path(name)
    old = path.with_suffix(OLD_EXT)
    return path if path.is_file() or not old.is_file() else old


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
    for suffix in (OLD_EXT, EXT):
        for path in config.projects_dir().glob(f"*{suffix}"):
            stat = path.stat()
            items[path.stem] = {"name": path.stem, "modified": stat.st_mtime, "size": stat.st_size}
    return sorted(items.values(), key=lambda item: item["modified"], reverse=True)


@router.post("/save")
def save(name: str = Form(...), manifest: str = Form(...), files: list[UploadFile] = File(default=[])) -> dict:
    target = _library_path(name)
    data, assets = _manifest(manifest), _assets(files)
    _validated(data, assets)
    blob = pf.write_zip(data, assets)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    with os.fdopen(fd, "wb") as handle:
        handle.write(blob)
    os.replace(tmp, target)
    target.with_suffix(OLD_EXT).unlink(missing_ok=True)
    return {"name": target.stem, "path": str(target), "size": len(blob)}


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
    return sessions.payload(sessions.create(assets), manifest, assets, path.stem)


@router.delete("/library/{name}")
def delete_library(name: str) -> dict:
    path = _library_path(name)
    path.unlink(missing_ok=True)
    path.with_suffix(OLD_EXT).unlink(missing_ok=True)
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

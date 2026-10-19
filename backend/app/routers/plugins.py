"""Plugins (1.52.6, the capability plan): JavaScript files in the data folder's plugins directory, listed, read, added
and removed here. A name is a plain file name ending .js (letters, digits, spaces, dashes and underscores), so none
can reach outside the folder. The window runs each in a sandboxed frame; nothing here runs them."""

import json
import re
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response

from app.core import config

router = APIRouter(prefix="/api/plugins", tags=["plugins"])
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{0,59}\.js$")
MAX = 512 * 1024


def _dir():
    d = config.data_dir() / "plugins"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _path(name: str):
    if not NAME.match(name):
        raise HTTPException(status_code=422, detail="A plugin's name is a plain file name ending .js, such as Invert Red.js.")
    return _dir() / name


@router.get("")
def list_plugins() -> list[dict]:
    return [{"name": p.name, "size": p.stat().st_size} for p in sorted(_dir().glob("*.js")) if NAME.match(p.name)]


# Plugin folders: plugins/<id>/plugin.json beside the ES module it names. The window loads the module; this only lists
# and serves files, so every path is checked to stay inside the plugin's own folder.
FOLDER_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,59}$")
FILE_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}(/[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}){0,3}$")
PERMISSIONS = {"documents", "pixels", "filters", "panels", "tools", "sources", "events", "storage", "ui", "commands"}
TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css",
         ".glsl": "text/plain", ".txt": "text/plain", ".md": "text/plain", ".png": "image/png", ".svg": "image/svg+xml"}
FOLDER_MAX = 1024 * 1024


def _folder(fid: str):
    if not FOLDER_ID.match(fid):
        raise HTTPException(status_code=422, detail="A plugin folder's name is lower-case letters, digits, dots, dashes and underscores.")
    return _dir() / fid


def _inside(fid: str, rel: str):
    if not FILE_PATH.match(rel) or ".." in rel.split("/") or Path(rel).suffix.lower() not in TYPES:
        raise HTTPException(status_code=422, detail="That file name is not allowed in a plugin folder.")
    root = _folder(fid).resolve()
    path = (root / rel).resolve()
    if root not in path.parents:
        raise HTTPException(status_code=422, detail="That file name is not allowed in a plugin folder.")
    return path


def _manifest(folder: Path) -> tuple[dict | None, str | None]:
    try:
        m = json.loads((folder / "plugin.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, "plugin.json is missing."
    except (OSError, ValueError):
        return None, "plugin.json is not valid JSON."
    if not isinstance(m, dict):
        return None, "plugin.json must be an object."
    if m.get("id") != folder.name:
        return None, "plugin.json id must equal the folder name."
    for key in ("name", "version", "main"):
        if not isinstance(m.get(key), str) or not m[key].strip():
            return None, f"plugin.json needs a text value for {key}."
    perms = m.get("permissions", [])
    if not isinstance(perms, list) or any(p not in PERMISSIONS for p in perms):
        return None, "permissions may list only: " + ", ".join(sorted(PERMISSIONS)) + "."
    try:
        main = _inside(folder.name, m["main"])
    except HTTPException:
        return None, "main must be a .js file inside the folder."
    if not main.is_file():
        return None, f"{m['main']} is missing."
    return {"id": m["id"], "name": m["name"].strip()[:60], "version": m["version"].strip()[:20], "main": m["main"], "permissions": perms,
            "description": str(m.get("description", ""))[:200], "api": m.get("api", 1) if isinstance(m.get("api", 1), int) else 1}, None


@router.get("/folders")
def list_folders() -> list[dict]:
    out = []
    for d in sorted(_dir().iterdir()):
        if d.is_dir() and FOLDER_ID.match(d.name):
            manifest, error = _manifest(d)
            out.append({"id": d.name, "manifest": manifest, "error": error})
    return out


@router.get("/folders/{fid}/{rel:path}")
def read_folder_file(fid: str, rel: str) -> Response:
    path = _inside(fid, rel)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"There is no {rel} in {fid}.")
    return Response(path.read_bytes(), media_type=TYPES[path.suffix.lower()])


@router.put("/folders/{fid}/{rel:path}")
async def write_folder_file(fid: str, rel: str, request: Request) -> dict:
    path = _inside(fid, rel)
    body = await request.body()
    if not body or len(body) > FOLDER_MAX:
        raise HTTPException(status_code=422, detail="A plugin file is at most 1 MB.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return {"id": fid, "path": rel, "size": len(body)}


@router.delete("/folders/{fid}")
def remove_folder(fid: str) -> dict:
    folder = _folder(fid)
    if folder.is_dir():
        shutil.rmtree(folder)
    return {"removed": fid}


@router.get("/{name}")
def read(name: str) -> Response:
    path = _path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"There is no plugin called {name}.")
    return Response(path.read_text(encoding="utf-8"), media_type="text/javascript")


@router.put("/{name}")
async def add(name: str, request: Request) -> dict:
    path = _path(name)
    body = await request.body()
    if not body.strip() or len(body) > MAX:
        raise HTTPException(status_code=422, detail="A plugin is a JavaScript file of at most 512 KB.")
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="A plugin is a text file (UTF-8).")
    path.write_text(text, encoding="utf-8")
    return {"name": name, "size": len(body)}


@router.delete("/{name}")
def remove(name: str) -> dict:
    path = _path(name)
    if path.exists():
        path.unlink()
    return {"removed": name}

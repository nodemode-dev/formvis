"""Plugins (1.52.6, the capability plan): JavaScript files in the data folder's plugins directory, listed, read, added
and removed here. A name is a plain file name ending .js (letters, digits, spaces, dashes and underscores), so none
can reach outside the folder. The window runs each in a sandboxed frame; nothing here runs them."""

import re

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

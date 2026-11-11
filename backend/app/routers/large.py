"""Pictures larger than formvis edits in one piece (1.52.7): kept, measured, and opened reduced, as a region, or as tiles."""

import json
import urllib.parse

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from starlette.concurrency import run_in_threadpool

from app.core import config
from app.services import large

router = APIRouter(prefix="/api/large", tags=["large"])


async def _run(fn, *args):
    try:
        return await run_in_threadpool(fn, *args)
    except large.LargeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.post("")
async def keep(file: UploadFile = File(...)) -> dict:
    return await _run(large.keep, await file.read(), file.filename or "picture")


@router.get("/{pid}/reduced")
async def reduced(pid: str, max_side: int = 8000) -> Response:
    return Response(await _run(large.reduced, pid, max_side), media_type="image/png")


@router.get("/{pid}/region")
async def region(pid: str, x: int, y: int, w: int, h: int) -> Response:
    return Response(await _run(large.region, pid, x, y, w, h), media_type="image/png")


@router.get("/{pid}/tiles")
async def tiles(pid: str, size: int = 4096) -> list[dict]:
    return await _run(large.tiles, pid, size)


@router.post("/assemble")
async def assemble(name: str = Form(...), width: int = Form(...), height: int = Form(...), places: str = Form(...), files: list[UploadFile] = File(...)) -> dict:
    """Assemble Tiles (1.52.7): the tiles put back together into one PNG in the data folder's exports, strip by strip."""
    try:
        where = json.loads(places)
        assert isinstance(where, list) and len(where) == len(files)
        assert all(isinstance(w, dict) and isinstance(w.get("x"), int) and isinstance(w.get("y"), int) for w in where)
    except (ValueError, AssertionError):
        raise HTTPException(422, "Each tile needs its place.")
    parts = [(int(w["x"]), int(w["y"]), await f.read()) for w, f in zip(where, files)]
    path = await _run(large.assemble, name, width, height, parts)
    return {"file": path.name, "url": f"/api/large/exports/{urllib.parse.quote(path.name)}", "bytes": path.stat().st_size}


@router.get("/exports/{file}")
def exported(file: str) -> FileResponse:
    """An assembled picture, streamed from disk as a download."""
    path = (config.data_dir() / "exports" / file)
    if "/" in file or "\\" in file or ":" in file or file.startswith(".") or not path.is_file():
        raise HTTPException(404, "That file is not here.")
    return FileResponse(path, media_type="image/png", filename=file)


@router.delete("/{pid}")
async def forget(pid: str) -> dict:
    await _run(large.forget, pid)
    return {"forgotten": pid}
